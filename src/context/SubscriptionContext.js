import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { Alert, InteractionManager } from 'react-native';
import {
  initConnection,
  endConnection,
  getSubscriptions,
  purchaseErrorListener,
  purchaseUpdatedListener,
  finishTransaction,
  getAvailablePurchases,
  fetchProducts,
  requestPurchase,
} from 'expo-iap';
import { useAuth } from './AuthContext';
import { validateReceipt, fetchQuota, fetchTokenBalance } from '../services/subscriptionService';
import { supabase } from '../services/supabase';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ── Rating prompt (post-second-generation, no incentive) ────────────────────
// No-strings-attached "if you like the app, leave us a review" prompt that
// fires after the user's second room generation and exits the
// RoomResultScreen. One-shot per user account; persisted via AsyncStorage so
// it doesn't repeat across launches. The prompt itself is rendered globally
// (RatingPromptHost in App.js) so it shows regardless of which screen the
// user lands on after RoomResult.
const RATING_PROMPT_SHOWN_KEY = '@homegenie_rating_prompt_shown';
const ratingPromptShownKey    = (uid) => (uid ? `${RATING_PROMPT_SHOWN_KEY}_${uid}` : null);
// The generation count at which we trigger the rating prompt. Kept as a
// constant so we can adjust it (or expand to multiple milestones) without
// hunting through the codebase.
export const RATING_PROMPT_TRIGGER_GENERATION = 2;

// ── Tier definitions (weekly billing, 10% discount on Pro + Premium) ─────────
export const TIERS = {
  free:    { id: 'free',    name: 'Free',    price: 0,    priceLabel: 'Free',       gens: 5,  displayLabel: '5',         weekly: false },
  basic:   { id: 'basic',   name: 'Basic',   price: 4.99,  priceLabel: '$4.99/wk',   gens: 25, displayLabel: '25',        weekly: true, productId: 'homegenie_basic_weekly' },
  pro:     { id: 'pro',     name: 'Pro',     price: 9.99,  priceLabel: '$9.99/wk',   gens: 50, displayLabel: '50',        weekly: true, productId: 'homegenie_pro_weekly',   popular: true },
  premium: { id: 'premium', name: 'Premium', price: 19.99, priceLabel: '$19.99/wk',  gens: -1, displayLabel: 'Unlimited', weekly: true, productId: 'homegenie_premium_weekly' },
};

export const PAID_TIERS = [TIERS.basic, TIERS.pro, TIERS.premium];

const ALL_PRODUCT_IDS = PAID_TIERS.map(t => t.productId);

// ── Wish packages (consumable IAP — "wishes" = design credits) ──────────
export const WISH_PACKAGES = [
  { id: 'homegenie_wishes_4',   wishes: 4,   price: '$0.99',  priceNum: 0.99  },
  { id: 'homegenie_wishes_10',  wishes: 10,  price: '$2.49',  priceNum: 2.49  },
  { id: 'homegenie_wishes_20',  wishes: 20,  price: '$4.99',  priceNum: 4.99  },
  { id: 'homegenie_wishes_40',  wishes: 40,  price: '$9.99',  priceNum: 9.99  },
  { id: 'homegenie_wishes_100', wishes: 100, price: '$24.99', priceNum: 24.99 },
  { id: 'homegenie_wishes_200', wishes: 200, price: '$49.99', priceNum: 49.99 },
];

// Backward compatibility alias
export const TOKEN_PACKAGES = WISH_PACKAGES.map(w => ({ ...w, tokens: w.wishes }));

const ALL_TOKEN_PRODUCT_IDS = WISH_PACKAGES.map(p => p.id);

// ── Dev override — set EXPO_PUBLIC_FORCE_PAID_TIER=true in .env to bypass quota ─
const FORCE_PAID_TIER = process.env.EXPO_PUBLIC_FORCE_PAID_TIER === 'true';

// ── Default free-tier state ─────────────────────────────────────────────────
const DEFAULT_SUBSCRIPTION = FORCE_PAID_TIER
  ? {
      tier: 'premium',
      quotaLimit: -1,
      generationsUsed: 0,
      generationsRemaining: 999,
      canGenerate: true,
      quotaResetDate: null,
      subscriptionStatus: 'active',
      subscriptionExpiresAt: null,
    }
  : {
      tier: 'free',
      quotaLimit: 5,
      generationsUsed: 0,
      generationsRemaining: 5,
      canGenerate: true,
      quotaResetDate: null,
      subscriptionStatus: 'none',
      subscriptionExpiresAt: null,
    };

// ── Context ─────────────────────────────────────────────────────────────────
const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const { user, loading: authLoading } = useAuth();

  const [subscription, setSubscription] = useState(DEFAULT_SUBSCRIPTION);
  const [iapReady, setIapReady] = useState(false);
  const [products, setProducts] = useState([]);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [tokenProducts, setTokenProducts] = useState([]);

  // Post-second-generation rating prompt (no incentive). Persisted flag
  // = "this account has already seen the prompt"; in-memory flag =
  // "the prompt is currently visible." Separate so RoomResultScreen
  // can schedule a trigger and the global host renders the modal.
  // Important: NO incentive is tied to this prompt — Apple guideline
  // 4.5.4 prohibits offering rewards/wishes/etc. in exchange for App
  // Store reviews. This is a clean ask only.
  const [ratingPromptShown, setRatingPromptShown] = useState(false);
  const [shouldShowRatingPrompt, setShouldShowRatingPrompt] = useState(false);

  // Dev toggle — force-show paywall for UI iteration (off by default)
  const [devForcePaywall, setDevForcePaywall] = useState(false);

  const shouldShowPaywall = !FORCE_PAID_TIER && (devForcePaywall || (!subscription.canGenerate && tokenBalance <= 0));

  const purchaseUpdateSub = useRef(null);
  const purchaseErrorSub  = useRef(null);

  // Build 108: pending-purchase tracker. When a user calls purchaseTokens()
  // or purchaseSubscription(), we register a Promise here keyed by productId
  // so the listener (which fires asynchronously after StoreKit completes)
  // can resolve the call site only AFTER the receipt has been validated and
  // the local balance/subscription state has actually been updated.
  //
  // Without this, the call site resolved the moment requestPurchase() was
  // dispatched, decoupling the user-facing "✨ Wishes added!" Alert from
  // actual fulfillment. If the listener silently bailed (e.g. user.id null
  // mid-bootstrap, or a transient validateReceipt failure that ate all 3
  // retries), the user saw a success Alert with no balance change. This
  // ref makes that drift impossible: the Alert can only fire after the
  // listener has actually setTokenBalance(...) or setSubscription(...).
  //
  // Map<productId, { resolve, reject, timeoutId }>
  const pendingPurchases = useRef(new Map());

  // Reset per-user state when the signed-in user changes.
  //
  // Without this, after user A signs out and user B signs in on the same
  // device, user B would briefly see user A's `subscription` (tier, quota,
  // generations used) and `tokenBalance` until the background refresh RPCs
  // complete. That was a root cause of the "Anthony's inbox shows up when
  // I log in as info@" bug reported 2026-04-18.
  //
  // Same pattern CartContext/LikedContext/SharedContext/OrderHistoryContext
  // already use. Ref starts undefined so a cold-boot (undefined → first id)
  // doesn't wipe state before the backend fetches happen.
  const lastUserIdRef = useRef(undefined);
  useEffect(() => {
    if (authLoading) return;
    const currentId = user?.id || null;
    const previousId = lastUserIdRef.current;
    if (previousId === currentId) return;
    lastUserIdRef.current = currentId;
    if (previousId === undefined) return;
    // Actual user change (sign-out or account switch) — reset to defaults.
    setSubscription(DEFAULT_SUBSCRIPTION);
    setTokenBalance(0);
    // Reset rating-prompt flag — the AsyncStorage hydration below
    // repopulates it from the new user's keys.
    setRatingPromptShown(false);
    setShouldShowRatingPrompt(false);
  }, [user?.id, authLoading]);

  // Hydrate the rating-prompt flag from AsyncStorage whenever the
  // signed-in user changes. Per-user key keeps multiple accounts
  // isolated on the same device. Best-effort: any read failure leaves
  // the flag at default false (safe — at worst the user sees the
  // prompt one extra time).
  useEffect(() => {
    const uid = user?.id;
    if (!uid) return;
    let cancelled = false;
    (async () => {
      try {
        const ratingShownRaw = await AsyncStorage.getItem(ratingPromptShownKey(uid));
        if (cancelled) return;
        setRatingPromptShown(ratingShownRaw === 'true');
      } catch (e) {
        if (__DEV__) console.warn('[Subscription] rating-prompt hydrate failed:', e?.message);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  // ── Initialize IAP connection ────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function connectIAP() {
      try {
        await initConnection();
        if (!mounted) return;

        // Load subscription product metadata from StoreKit / App Store
        let subs = [];
        try {
          subs = await fetchProducts({ skus: ALL_PRODUCT_IDS, type: 'subs' });
        } catch (e) {
          // Fallback to legacy API for older expo-iap versions
          try { subs = await getSubscriptions({ skus: ALL_PRODUCT_IDS }); } catch {}
          console.warn('[Subscription] fetchProducts(subs) failed, used fallback:', e?.message);
        }
        if (!mounted) return;
        setProducts(subs || []);
        console.log('[Subscription] subscription products loaded:', (subs || []).length, 'of', ALL_PRODUCT_IDS.length);

        // Load wish (consumable) product metadata
        let tokenProds = [];
        try {
          tokenProds = await fetchProducts({ skus: ALL_TOKEN_PRODUCT_IDS, type: 'in-app' });
        } catch (e) {
          console.warn('[Subscription] fetchProducts(in-app) failed:', e?.message);
        }
        if (!mounted) return;
        setTokenProducts(tokenProds || []);
        console.log('[Subscription] wish products loaded:', (tokenProds || []).length, 'of', ALL_TOKEN_PRODUCT_IDS.length);

        if (mounted) setIapReady(true);
      } catch (e) {
        console.warn('[Subscription] IAP init failed:', e.message);
        // App still works — IAP just won't be available
        if (mounted) setIapReady(false);
      }
    }

    // Build 89 / L2: defer IAP connection until after first interaction.
    //
    // initConnection() + 2× fetchProducts() are native StoreKit RPCs that
    // routinely cost 300-800ms cold. The user can't see the paywall until
    // their 6th generation, so blocking cold path on this is wasteful.
    //
    // InteractionManager.runAfterInteractions waits for the JS scheduler
    // to finish any in-flight animations + interactions before running
    // its callback. On cold launch this lands ~100-300ms after first
    // interactive frame. iapReady stays false until then; all IAP code
    // paths already gate on `if (!iapReady) return`.
    //
    // We also keep a fallback timeout: if the user never interacts (idle
    // on Home), we connect after 2s anyway so Restore Purchases on the
    // Profile tab still works without a tap-anywhere prerequisite.
    let interactionHandle = null;
    let fallbackTimer = setTimeout(() => {
      if (mounted) connectIAP();
    }, 2000);
    interactionHandle = InteractionManager.runAfterInteractions(() => {
      clearTimeout(fallbackTimer);
      fallbackTimer = null;
      if (mounted) connectIAP();
    });

    return () => {
      mounted = false;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      if (interactionHandle && typeof interactionHandle.cancel === 'function') {
        interactionHandle.cancel();
      }
      endConnection().catch(() => {});
    };
  }, []);

  // ── Purchase update listener ─────────────────────────────────────────────
  useEffect(() => {
    if (!iapReady) return;

    purchaseUpdateSub.current = purchaseUpdatedListener(async (purchase) => {
      // Build 109 — CRITICAL FIX: expo-iap v3.x renamed the receipt field
      // from `transactionReceipt` to `purchaseToken` (unified iOS JWS /
      // Android purchase token). Reading the old field returned undefined,
      // making the listener bail in Build 107 (silent) and surface a
      // misleading error in Build 108. We try the new field first, then
      // fall back to legacy names so this code survives a future v4 rename.
      const jws =
        purchase?.purchaseToken
        || purchase?.jwsRepresentationIos
        || purchase?.transactionReceipt;

      if (!jws) {
        console.warn(
          '[Subscription] purchase listener fired without a receipt token — productId:',
          purchase?.productId,
          'keys:', purchase ? Object.keys(purchase).join(',') : 'null'
        );
        if (purchase?.productId) {
          const pending = pendingPurchases.current.get(purchase.productId);
          if (pending) {
            clearTimeout(pending.timeoutId);
            pending.reject(new Error('Purchase came back without a receipt. Please try again.'));
            pendingPurchases.current.delete(purchase.productId);
          }
        }
        return;
      }
      if (!user?.id) {
        console.warn(
          '[Subscription] purchase listener fired but user.id is null — Apple will redeliver receipt on next launch. ' +
          'productId:', purchase?.productId
        );
        // Don't reject the pending promise here — Apple's redelivery on
        // next app launch will credit the user once auth has bootstrapped.
        // The 30s timeout fallback in purchaseTokens/purchaseSubscription
        // will surface a "processing" message to the user without
        // permanently failing the purchase.
        return;
      }

      const isTokenPurchase = ALL_TOKEN_PRODUCT_IDS.includes(purchase.productId);

      // Build 84 (Bug B4 + B10 fix): retry server validation up to 3x with
      // exponential backoff before declaring failure. The previous version
      // ate any error and called finishTransaction immediately, which acked
      // the receipt to Apple — leaving a charged user with no entitlement
      // and no recovery path. New flow:
      //   1. Try validation up to 3 times (network blips, DB warmup, etc.)
      //   2. On final failure, DO NOT finishTransaction — Apple keeps
      //      redelivering the purchase via this listener on next app launch
      //      so we get a free retry next time the user opens the app.
      //   3. Surface a user-visible Alert so they know the purchase was
      //      received but is being verified, and to relaunch if it persists.
      const RETRY_DELAYS_MS = [0, 1500, 4000]; // total ~5.5s worst case
      let lastError = null;
      let result = null;
      // Snapshot user.id for the duration of this retry loop. If the user
      // signs out mid-retry, abort instead of writing to a stale account.
      // (Reviewer MEDIUM fix from Build 84 audit.)
      const userIdSnapshot = user.id;

      for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
        if (RETRY_DELAYS_MS[attempt] > 0) {
          await new Promise(r => setTimeout(r, RETRY_DELAYS_MS[attempt]));
        }
        // Bail if the user signed out or switched accounts since the
        // retry loop started. Apple will redeliver the purchase on next
        // app open under the correct account.
        if (user?.id !== userIdSnapshot) {
          console.warn(
            '[Subscription] user identity changed during purchase retry — aborting retry loop'
          );
          return;
        }
        try {
          result = await validateReceipt(jws, userIdSnapshot);
          lastError = null;
          break;
        } catch (e) {
          lastError = e;
          console.warn(
            `[Subscription] purchase validation attempt ${attempt + 1}/${RETRY_DELAYS_MS.length} ` +
            `failed: ${e?.message || e}`
          );
        }
      }

      if (lastError || !result) {
        // All retries exhausted. DO NOT call finishTransaction — Apple will
        // redeliver the purchase on next app open and we'll retry again.
        // Surface the issue to the user so they don't feel scammed.
        console.error('[Subscription] purchase validation failed after retries:', lastError?.message);
        Alert.alert(
          'Purchase received',
          'Your purchase is being verified. If your wishes don\'t appear within a minute, ' +
          'please force-quit and reopen HomeGenie. Your charge is safe — Apple will redeliver ' +
          'the receipt for verification.',
          [{ text: 'OK' }],
        );
        // Build 108: reject any pending promise so the call-site (PaywallScreen
        // handlePurchase) won't fire its optimistic "✨ Wishes added!" Alert
        // on top of the failure Alert above. PaywallScreen's catch block
        // suppresses the duplicate by detecting our 'PURCHASE_VERIFICATION_PENDING'
        // marker so the user only sees one Alert (the helpful one).
        const pending = pendingPurchases.current.get(purchase.productId);
        if (pending) {
          clearTimeout(pending.timeoutId);
          const err = new Error('PURCHASE_VERIFICATION_PENDING');
          err.code = 'PURCHASE_VERIFICATION_PENDING';
          pending.reject(err);
          pendingPurchases.current.delete(purchase.productId);
        }
        return;
      }

      // Validation succeeded — apply state changes BEFORE finishTransaction
      // so the user sees the new balance/tier immediately. If the merge into
      // local state fails for any reason, we still finish the receipt
      // (the server-side grant already committed; client state catches up
      // on next refreshTokenBalance / refreshQuota call).
      //
      // Build 110: comprehensive observability + force-refresh defense.
      // The Build 109 user reported "Wishes added!" Alert fired but the
      // widget stayed at 0 — so somewhere in this block setTokenBalance
      // was getting an incorrect value (most likely the edge fn idempotency
      // bug, fixed in this build). Adding aggressive logging so any
      // future re-occurrence is immediately diagnosable.
      console.log(
        '[Subscription] purchase validated — type:', result.type,
        'newBalance:', result.newBalance,
        'tokensAdded:', result.tokensAdded,
        'tier:', result.tier
      );
      try {
        if (result.type === 'tokens') {
          // Trust the server-returned balance first (post Build 110 edge fn fix,
          // this is always >= wishCount on a fresh credit). Always log the
          // value being committed so we can verify in Console.app.
          if (typeof result.newBalance === 'number' && result.newBalance >= 0) {
            console.log('[Subscription] setTokenBalance →', result.newBalance, '(from listener result)');
            setTokenBalance(result.newBalance);
          } else {
            // Server didn't return a balance — fetch authoritative.
            console.warn('[Subscription] result.newBalance was invalid; falling back to fetchTokenBalance');
            const fresh = await fetchTokenBalance(user.id).catch(() => null);
            if (fresh?.balance !== undefined) {
              console.log('[Subscription] setTokenBalance →', fresh.balance, '(from fallback fetch)');
              setTokenBalance(fresh.balance);
            }
          }

          // Build 110: belt-and-suspenders force-refresh. Even if the listener
          // got the right value above, fetch the authoritative server balance
          // ~250ms later as a self-healing measure. If the server is the
          // source of truth and somehow drifted from what the listener
          // recorded, this fixes it without requiring a paywall reopen.
          setTimeout(async () => {
            try {
              const fresh = await fetchTokenBalance(user.id);
              if (typeof fresh?.balance === 'number') {
                console.log('[Subscription] post-purchase server reconcile →', fresh.balance);
                setTokenBalance(fresh.balance);
              }
            } catch (e) {
              console.warn('[Subscription] post-purchase reconcile failed:', e?.message);
            }
          }, 250);
        } else {
          setSubscription(prev => ({
            ...prev,
            tier: result.tier,
            quotaLimit: result.quotaLimit,
            generationsUsed: prev.generationsUsed,
            generationsRemaining: result.generationsRemaining,
            canGenerate: result.generationsRemaining > 0 || result.quotaLimit === -1,
            subscriptionStatus: result.subscriptionStatus,
            subscriptionExpiresAt: result.subscriptionExpiresAt,
          }));
          console.log('[Subscription] subscription activated:', result.tier, result.quotaLimit);
        }
      } catch (mergeErr) {
        console.warn('[Subscription] state merge after purchase failed:', mergeErr?.message);
      }

      // Build 108: resolve the pending promise so the call site (Paywall
      // handlePurchase) can fire its success Alert NOW — after the local
      // state has actually been updated. This is the single point that
      // closes the "Wishes added Alert fires before fulfillment" gap.
      const pending = pendingPurchases.current.get(purchase.productId);
      if (pending) {
        clearTimeout(pending.timeoutId);
        pending.resolve({
          success:     true,
          type:        result.type,
          newBalance:  result.type === 'tokens' ? result.newBalance : undefined,
          tokensAdded: result.tokensAdded,
          tier:        result.tier,
        });
        pendingPurchases.current.delete(purchase.productId);
      } else {
        // No pending promise — this is a redelivered receipt from a prior
        // session (e.g. user force-quit before fulfillment finished, or
        // signed in after a Sandbox prompt). Local state was still updated
        // above; user will see the new balance next time they open paywall.
        console.log(
          '[Subscription] orphan-receipt redelivery credited:',
          purchase.productId, '— no pending promise to resolve'
        );
      }

      // Now safe to finish — the entitlement is reflected in either local
      // state or will be on next refresh. This finalizes the receipt with
      // Apple so they stop redelivering it.
      try {
        await finishTransaction({ purchase, isConsumable: isTokenPurchase });
      } catch (finErr) {
        console.warn('[Subscription] finishTransaction failed:', finErr?.message);
      }
    });

    purchaseErrorSub.current = purchaseErrorListener((error) => {
      // Build 109: expo-iap v3.x switched error codes to kebab-case
      // ('user-cancelled') and dropped the legacy 'E_USER_CANCELLED'.
      // Match both for resilience against any code path that still emits
      // the old format (e.g. older expo-iap installs in dev).
      const isUserCancel =
        error.code === 'user-cancelled' || error.code === 'E_USER_CANCELLED';
      if (!isUserCancel) {
        console.warn('[Subscription] purchase error:', error.code, error.message);
      }
      // Build 108: reject any pending purchase promises so the call site
      // doesn't hang for 30s waiting on a purchase that StoreKit already
      // told us was cancelled or failed. expo-iap doesn't always include
      // productId on the error object — when it doesn't, we have to clear
      // all pending promises (typically there's only one in flight anyway).
      if (error.productId && pendingPurchases.current.has(error.productId)) {
        const pending = pendingPurchases.current.get(error.productId);
        clearTimeout(pending.timeoutId);
        pending.reject(error);
        pendingPurchases.current.delete(error.productId);
      } else if (pendingPurchases.current.size > 0) {
        for (const [, pending] of pendingPurchases.current.entries()) {
          clearTimeout(pending.timeoutId);
          pending.reject(error);
        }
        pendingPurchases.current.clear();
      }
    });

    return () => {
      purchaseUpdateSub.current?.remove();
      purchaseErrorSub.current?.remove();
    };
  }, [iapReady, user?.id]);

  // ── Refresh quota from backend ──────────────────────────────────────────
  const refreshQuota = useCallback(async () => {
    if (FORCE_PAID_TIER) return; // dev bypass — keep forced premium state
    // DEV: skip DB fetch — local state is the source of truth during dev.
    // This prevents the DB's stale generations_used from overwriting the
    // local count that recordGeneration() is incrementing correctly.
    if (__DEV__) return;
    if (!user?.id) return;
    try {
      const quota = await fetchQuota(user.id);
      setSubscription(prev => ({ ...prev, ...quota }));
    } catch (e) {
      console.warn('[Subscription] quota refresh failed:', e.message);
    }
  }, [user?.id]);

  // ── Record a generation (optimistic + persist to DB) ─────────────────────
  const recordGeneration = useCallback(async () => {
    if (FORCE_PAID_TIER) return; // dev bypass — don't burn quota or hit DB
    // Optimistic UI update immediately
    setSubscription(prev => {
      if (prev.quotaLimit === -1) return prev; // unlimited — no change
      const used      = prev.generationsUsed + 1;
      const remaining = Math.max(0, prev.quotaLimit - used);
      console.log('[Subscription] recordGeneration: used=' + used + ' remaining=' + remaining);
      return {
        ...prev,
        generationsUsed:      used,
        generationsRemaining: remaining,
        canGenerate:          remaining > 0,
      };
    });

    // DEV: skip DB persist — local state is source of truth
    if (__DEV__) return;

    // Persist to database so refreshQuota doesn't overwrite back to 0
    if (user?.id) {
      try {
        await supabase.rpc('increment_generation_count', { p_user_id: user.id });
      } catch (e) {
        console.warn('[Subscription] increment_generation_count failed:', e.message);
      }
    }
  }, [user?.id]);

  // ── Refresh token balance from backend ───────────────────────────────────
  const refreshTokenBalance = useCallback(async () => {
    if (!user?.id) return;
    try {
      const result = await fetchTokenBalance(user.id);
      setTokenBalance(result.balance);
    } catch (e) {
      console.warn('[Subscription] token balance refresh failed:', e.message);
    }
  }, [user?.id]);

  // ── Deduct one token (optimistic + persist) ────────────────────────────
  const deductToken = useCallback(async () => {
    // Optimistic update
    setTokenBalance(prev => Math.max(0, prev - 1));

    if (user?.id) {
      try {
        const { data, error } = await supabase.rpc('deduct_token', { p_user_id: user.id });
        if (error) throw error;
        // Sync to authoritative server balance
        if (data?.[0]?.balance !== undefined) setTokenBalance(data[0].balance);
      } catch (e) {
        // Revert optimistic update on failure
        setTokenBalance(prev => prev + 1);
        throw e;
      }
    }
  }, [user?.id]);

  // ── Re-credit a single token after a paid generation fails downstream ──
  // Build 84 / Bug B8 fix. Previously when deductToken succeeded but the AI
  // generation itself failed (FAL outage, network drop, render rejected),
  // the user lost the wish with no recovery path. This function calls the
  // refund_token RPC (migration 027) which atomically increments balance,
  // decrements total_used, and writes a 'generation_failed' ledger row keyed
  // by generation_id. UNIQUE(reference_id) makes it idempotent — if the
  // caller retries with the same generation_id, the RPC short-circuits.
  const refundFailedGeneration = useCallback(async (generationId) => {
    if (!user?.id || !generationId) return;
    try {
      const { data, error } = await supabase.rpc('refund_token', {
        p_user_id:       user.id,
        p_generation_id: generationId,
      });
      if (error) throw error;
      if (data?.[0]?.new_balance !== undefined) {
        setTokenBalance(data[0].new_balance);
      } else {
        // RPC succeeded but didn't return the new balance — fetch authoritative.
        const fresh = await fetchTokenBalance(user.id).catch(() => null);
        if (fresh?.balance !== undefined) setTokenBalance(fresh.balance);
      }
    } catch (e) {
      console.warn('[Subscription] refund_token failed:', e?.message || e);
      // Don't throw — failed refund shouldn't block the user-facing error
      // they're already seeing for the underlying gen failure. Refresh
      // balance so the optimistic decrement isn't permanently visible.
      const fresh = await fetchTokenBalance(user.id).catch(() => null);
      if (fresh?.balance !== undefined) setTokenBalance(fresh.balance);
    }
  }, [user?.id]);

  // ── Purchase wishes (consumable IAP) ───────────────────────────────────
  const purchaseTokens = useCallback(async (productId) => {
    if (__DEV__ && !iapReady) {
      // Dev fallback when StoreKit not configured
      console.log('[Subscription] DEV MODE — mock wish purchase:', productId);
      const pkg = TOKEN_PACKAGES.find(p => p.id === productId);
      if (pkg) {
        setTokenBalance(prev => prev + pkg.tokens);
      }
      return { success: true, dev: true };
    }

    if (!iapReady) throw new Error('In-app purchases are not available right now.');

    // Defensive fetch: if the product wasn't loaded at init (App Store
    // config propagation delay, network hiccup, etc.), StoreKit throws
    // "SKU not found". Retry the fetch just-in-time before the purchase.
    const haveProduct = tokenProducts.some(p => (p.id || p.productId) === productId);
    if (!haveProduct) {
      try {
        const refetched = await fetchProducts({ skus: ALL_TOKEN_PRODUCT_IDS, type: 'in-app' });
        if (refetched?.length) setTokenProducts(refetched);
        const found = refetched?.some(p => (p.id || p.productId) === productId);
        if (!found) {
          throw new Error(
            `This item isn't available right now. Please try again in a moment. (SKU: ${productId})`
          );
        }
      } catch (e) {
        if (e?.message?.startsWith("This item isn't")) throw e;
        throw new Error(
          `Could not load products from the App Store. Please check your connection and try again.`
        );
      }
    }

    // Build 108: wait for the listener to actually credit the wish before
    // resolving. Previously this returned immediately on requestPurchase,
    // which made the call-site "Wishes added!" Alert fire before any
    // server-side fulfillment had happened — a charged user could see a
    // success Alert and a stuck balance. The Promise below resolves only
    // when the listener succeeds (setTokenBalance fired) or rejects on
    // failure / cancellation / 30s timeout.
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(async () => {
        // Listener never resolved us — possible Apple-redelivery edge case
        // (purchase will arrive on next launch) or intermittent network.
        // Before declaring failure, fetch the authoritative balance from
        // server: if the listener silently succeeded but our resolve hook
        // missed (e.g. listener re-registered mid-flight on user.id flap),
        // the server-side balance will still be correct.
        pendingPurchases.current.delete(productId);
        try {
          if (user?.id) {
            const fresh = await fetchTokenBalance(user.id);
            if (typeof fresh?.balance === 'number') {
              setTokenBalance(fresh.balance);
              // Caller can decide whether the new balance reflects this
              // purchase by comparing to a snapshot. We resolve as success
              // here so the user sees an affirmative Alert with the
              // post-purchase server-side count.
              resolve({ success: true, type: 'tokens', newBalance: fresh.balance, fromTimeout: true });
              return;
            }
          }
        } catch (e) {
          console.warn('[Subscription] timeout-fallback balance refresh failed:', e?.message);
        }
        const err = new Error(
          'Your purchase is still processing. If wishes don\'t appear in a moment, ' +
          'tap "Restore Purchases" or relaunch HomeGenie.'
        );
        err.code = 'PURCHASE_TIMEOUT';
        reject(err);
      }, 30000);

      pendingPurchases.current.set(productId, { resolve, reject, timeoutId });

      requestPurchase({
        request: { apple: { sku: productId } },
        type: 'in-app',
      }).catch((err) => {
        clearTimeout(timeoutId);
        pendingPurchases.current.delete(productId);
        reject(err);
      });
    });
  }, [iapReady, tokenProducts, user?.id]);

  // ── Purchase subscription ───────────────────────────────────────────────
  const purchaseSubscription = useCallback(async (productId) => {
    if (__DEV__ && !iapReady) {
      // Dev fallback when StoreKit not configured
      console.log('[Subscription] DEV MODE — mock purchase:', productId);
      const tier = PAID_TIERS.find(t => t.productId === productId);
      if (tier) {
        setSubscription(prev => ({
          ...prev,
          tier:                 tier.id,
          quotaLimit:           tier.gens === -1 ? -1 : tier.gens,
          generationsUsed:      0,
          generationsRemaining: tier.gens === -1 ? 999 : tier.gens,
          canGenerate:          true,
          subscriptionStatus:   'active',
          subscriptionExpiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }));
      }
      return { success: true, dev: true };
    }

    if (!iapReady) throw new Error('In-app purchases are not available right now.');

    // Defensive fetch: same rationale as purchaseTokens — if the sub
    // product wasn't loaded at init, retry before the purchase call.
    const haveProduct = products.some(p => (p.id || p.productId) === productId);
    if (!haveProduct) {
      try {
        const refetched = await fetchProducts({ skus: ALL_PRODUCT_IDS, type: 'subs' });
        if (refetched?.length) setProducts(refetched);
        const found = refetched?.some(p => (p.id || p.productId) === productId);
        if (!found) {
          throw new Error(
            `This subscription isn't available right now. Please try again in a moment. (SKU: ${productId})`
          );
        }
      } catch (e) {
        if (e?.message?.startsWith("This subscription isn't")) throw e;
        throw new Error(
          `Could not load subscriptions from the App Store. Please check your connection and try again.`
        );
      }
    }

    // Build 108: same pending-promise pattern as purchaseTokens — wait
    // for the listener to actually activate the subscription before
    // resolving so the "🎉 Subscription active" Alert can't fire before
    // fulfillment.
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(async () => {
        pendingPurchases.current.delete(productId);
        try {
          if (user?.id) {
            const fresh = await fetchQuota(user.id);
            if (fresh?.tier && fresh.tier !== 'free') {
              setSubscription(prev => ({ ...prev, ...fresh }));
              resolve({ success: true, type: 'subscription', tier: fresh.tier, fromTimeout: true });
              return;
            }
          }
        } catch (e) {
          console.warn('[Subscription] timeout-fallback quota refresh failed:', e?.message);
        }
        const err = new Error(
          'Your subscription is still processing. If it doesn\'t activate shortly, ' +
          'tap "Restore Purchases" or relaunch HomeGenie.'
        );
        err.code = 'PURCHASE_TIMEOUT';
        reject(err);
      }, 30000);

      pendingPurchases.current.set(productId, { resolve, reject, timeoutId });

      // Unified purchase call — expo-iap v3.x removed standalone
      // requestSubscription in favor of requestPurchase with type:'subs'.
      // The actual result comes through purchaseUpdatedListener above.
      requestPurchase({
        request: { apple: { sku: productId } },
        type: 'subs',
      }).catch((err) => {
        clearTimeout(timeoutId);
        pendingPurchases.current.delete(productId);
        reject(err);
      });
    });
  }, [iapReady, products, user?.id]);

  // ── Restore purchases ───────────────────────────────────────────────────
  const restorePurchases = useCallback(async () => {
    if (!iapReady) throw new Error('In-app purchases are not available right now.');

    const purchases = await getAvailablePurchases();
    if (!purchases?.length) return { success: true, restored: 0 };

    // Find the most recent active subscription
    const latest = purchases
      .filter(p => ALL_PRODUCT_IDS.includes(p.productId))
      .sort((a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0))[0];

    // Build 109: same field-rename as the listener — receipts now live on
    // `purchaseToken`. Fall back to legacy names for resilience.
    const latestJws =
      latest?.purchaseToken
      || latest?.jwsRepresentationIos
      || latest?.transactionReceipt;

    if (!latestJws || !user?.id) {
      return { success: true, restored: 0 };
    }

    try {
      const result = await validateReceipt(latestJws, user.id);
      setSubscription(prev => ({ ...prev, ...result }));
      return { success: true, restored: 1 };
    } catch (e) {
      console.warn('[Subscription] restore failed:', e.message);
      return { success: false, error: e.message };
    }
  }, [iapReady, user?.id]);

  // ── Rating-prompt actions (post-second-generation) ──────────────────────
  // triggerRatingPrompt(): RoomResultScreen calls this AFTER the user has
  //   left the screen following their second generation (with a small
  //   delay scheduled by RoomResultScreen). Flips the in-memory visible
  //   flag so the global RatingPromptHost in App.js renders the modal.
  //   Idempotent — guarded against re-triggering once it's been shown.
  // dismissRatingPrompt(): hides the modal but doesn't persist. Used as
  //   the immediate close path. The PERSISTENT "don't show again" mark
  //   is markRatingPromptShown.
  // markRatingPromptShown(): writes the persisted flag so the prompt
  //   never auto-fires again on this account. Called by the host on
  //   either user action (engage or dismiss) — the prompt is one-shot.
  const triggerRatingPrompt = useCallback(() => {
    if (ratingPromptShown) return;
    setShouldShowRatingPrompt(true);
  }, [ratingPromptShown]);

  const dismissRatingPrompt = useCallback(() => {
    setShouldShowRatingPrompt(false);
  }, []);

  const markRatingPromptShown = useCallback(async () => {
    setRatingPromptShown(true);
    setShouldShowRatingPrompt(false);
    const uid = user?.id;
    const shownKey = ratingPromptShownKey(uid);
    if (!shownKey) return;
    try {
      await AsyncStorage.setItem(shownKey, 'true');
    } catch (e) {
      if (__DEV__) console.warn('[Subscription] markRatingPromptShown persist failed:', e?.message);
    }
  }, [user?.id]);

  // ── Dev-only: quota tracking uses local state only ────────────────────────
  // In dev mode, we skip refreshQuota() entirely so the DB can't overwrite
  // local counts. The local DEFAULT_SUBSCRIPTION starts at 0/5 and
  // recordGeneration() increments it correctly. This means quota tracking
  // is purely client-side during dev — no DB dependency.
  const devResetQuota = useCallback(() => {
    console.log('[Subscription] DEV: resetting quota to 0/5 (local only)');
    setSubscription({
      tier: 'free',
      quotaLimit: 5,
      generationsUsed: 0,
      generationsRemaining: 5,
      canGenerate: true,
      quotaResetDate: null,
      subscriptionStatus: 'none',
      subscriptionExpiresAt: null,
    });
  }, []);

  // ── Refresh on user login / reset on sign-out ───────────────────────────
  // When user becomes null (sign-out) or changes identity (account switch),
  // immediately reset local state so the previous user's quota/balance can
  // never flash on screen for the next user before the DB round-trip
  // completes. This is the fix for the "5 of 5 wishes" showing on a freshly
  // signed-in account because the previous account's state was still in memory.
  useEffect(() => {
    if (user?.id) {
      // New user signed in — reset to defaults first, then fetch fresh data
      setSubscription(DEFAULT_SUBSCRIPTION);
      setTokenBalance(0);

      if (__DEV__) {
        // DEV: reset to fresh 5 wishes on app launch, skip DB fetch entirely.
        // recordGeneration() will increment locally from 0.
        devResetQuota();
      } else {
        refreshQuota();
      }
      refreshTokenBalance();
    } else {
      // Signed out — wipe in-memory quota and token state immediately.
      setSubscription(DEFAULT_SUBSCRIPTION);
      setTokenBalance(0);
    }
  }, [user?.id, refreshQuota, refreshTokenBalance]);

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        shouldShowPaywall,
        iapReady,
        products,           // StoreKit subscription product metadata
        tokenProducts,      // StoreKit token product metadata
        devForcePaywall,
        setDevForcePaywall: __DEV__ ? setDevForcePaywall : () => {},
        devResetQuota: __DEV__ ? devResetQuota : () => {},
        refreshQuota,
        recordGeneration,
        purchaseSubscription,
        restorePurchases,
        // Token system
        tokenBalance,
        refreshTokenBalance,
        deductToken,
        refundFailedGeneration,  // B8: re-credit a wish when AI generation fails
        purchaseTokens,
        TOKEN_PACKAGES,
        WISH_PACKAGES,
        // Rating prompt (post-second-generation, no incentive)
        ratingPromptShown,
        shouldShowRatingPrompt,
        triggerRatingPrompt,
        dismissRatingPrompt,
        markRatingPromptShown,
        // Constants
        TIERS,
        PAID_TIERS,
        RATING_PROMPT_TRIGGER_GENERATION,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  const ctx = useContext(SubscriptionContext);
  if (!ctx) throw new Error('useSubscription must be used within SubscriptionProvider');
  return ctx;
}

export default SubscriptionContext;
