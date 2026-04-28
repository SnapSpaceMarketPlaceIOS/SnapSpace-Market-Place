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

  // Dev toggle — force-show paywall for UI iteration (off by default)
  const [devForcePaywall, setDevForcePaywall] = useState(false);

  const shouldShowPaywall = !FORCE_PAID_TIER && (devForcePaywall || (!subscription.canGenerate && tokenBalance <= 0));

  const purchaseUpdateSub = useRef(null);
  const purchaseErrorSub  = useRef(null);

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
  }, [user?.id, authLoading]);

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
      const jws = purchase?.transactionReceipt;
      if (!jws || !user?.id) return;

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
        return;
      }

      // Validation succeeded — apply state changes BEFORE finishTransaction
      // so the user sees the new balance/tier immediately. If the merge into
      // local state fails for any reason, we still finish the receipt
      // (the server-side grant already committed; client state catches up
      // on next refreshTokenBalance / refreshQuota call).
      try {
        if (result.type === 'tokens') {
          // B10 fix: trust newBalance ONLY when result is a confirmed success.
          // Refresh from server as a safety net so a stale local read can't
          // hide the freshly-credited balance.
          if (typeof result.newBalance === 'number' && result.newBalance >= 0) {
            setTokenBalance(result.newBalance);
          } else {
            // Server didn't return a balance — fetch authoritative.
            const fresh = await fetchTokenBalance(user.id).catch(() => null);
            if (fresh?.balance !== undefined) setTokenBalance(fresh.balance);
          }
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
        }
      } catch (mergeErr) {
        console.warn('[Subscription] state merge after purchase failed:', mergeErr?.message);
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
      if (error.code !== 'E_USER_CANCELLED') {
        console.warn('[Subscription] purchase error:', error.code, error.message);
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

    await requestPurchase({
      request: { apple: { sku: productId } },
      type: 'in-app',
    });
    return { success: true };
  }, [iapReady, tokenProducts]);

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

    // Unified purchase call — expo-iap v3.x removed standalone
    // requestSubscription in favor of requestPurchase with type:'subs'.
    // The actual result comes through purchaseUpdatedListener above.
    await requestPurchase({
      request: { apple: { sku: productId } },
      type: 'subs',
    });
    return { success: true };
  }, [iapReady, products]);

  // ── Restore purchases ───────────────────────────────────────────────────
  const restorePurchases = useCallback(async () => {
    if (!iapReady) throw new Error('In-app purchases are not available right now.');

    const purchases = await getAvailablePurchases();
    if (!purchases?.length) return { success: true, restored: 0 };

    // Find the most recent active subscription
    const latest = purchases
      .filter(p => ALL_PRODUCT_IDS.includes(p.productId))
      .sort((a, b) => (b.transactionDate ?? 0) - (a.transactionDate ?? 0))[0];

    if (!latest?.transactionReceipt || !user?.id) {
      return { success: true, restored: 0 };
    }

    try {
      const result = await validateReceipt(latest.transactionReceipt, user.id);
      setSubscription(prev => ({ ...prev, ...result }));
      return { success: true, restored: 1 };
    } catch (e) {
      console.warn('[Subscription] restore failed:', e.message);
      return { success: false, error: e.message };
    }
  }, [iapReady, user?.id]);

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
        // Constants
        TIERS,
        PAID_TIERS,
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
