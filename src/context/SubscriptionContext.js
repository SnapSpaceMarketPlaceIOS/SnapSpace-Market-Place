import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import {
  initConnection,
  endConnection,
  getSubscriptions,
  requestSubscription,
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

// ── Tier definitions ────────────────────────────────────────────────────────
export const TIERS = {
  free:    { id: 'free',    name: 'Free',    price: 0,     priceLabel: 'Free',      gens: 5,  displayLabel: '5',         monthly: false },
  basic:   { id: 'basic',   name: 'Basic',   price: 6.99,  priceLabel: '$6.99/mo',  gens: 25, displayLabel: '25',        monthly: true, productId: 'snapspace_basic_monthly' },
  pro:     { id: 'pro',     name: 'Pro',     price: 12.99, priceLabel: '$12.99/mo', gens: 50, displayLabel: '50',        monthly: true, productId: 'snapspace_pro_monthly',   popular: true },
  premium: { id: 'premium', name: 'Premium', price: 19.99, priceLabel: '$19.99/mo', gens: -1, displayLabel: 'Unlimited', monthly: true, productId: 'snapspace_premium_monthly' },
};

export const PAID_TIERS = [TIERS.basic, TIERS.pro, TIERS.premium];

const ALL_PRODUCT_IDS = PAID_TIERS.map(t => t.productId);

// ── Token packages (consumable IAP) ───────────────────────────────────────
export const TOKEN_PACKAGES = [
  { id: 'snapspace_tokens_4',   tokens: 4,   price: '$0.99',  priceNum: 0.99  },
  { id: 'snapspace_tokens_10',  tokens: 10,  price: '$2.49',  priceNum: 2.49  },
  { id: 'snapspace_tokens_20',  tokens: 20,  price: '$4.99',  priceNum: 4.99  },
  { id: 'snapspace_tokens_40',  tokens: 40,  price: '$9.99',  priceNum: 9.99  },
  { id: 'snapspace_tokens_100', tokens: 100, price: '$24.99', priceNum: 24.99 },
  { id: 'snapspace_tokens_200', tokens: 200, price: '$49.99', priceNum: 49.99 },
];

const ALL_TOKEN_PRODUCT_IDS = TOKEN_PACKAGES.map(p => p.id);

// ── Default free-tier state ─────────────────────────────────────────────────
const DEFAULT_SUBSCRIPTION = {
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
  const { user } = useAuth();

  const [subscription, setSubscription] = useState(DEFAULT_SUBSCRIPTION);
  const [iapReady, setIapReady] = useState(false);
  const [products, setProducts] = useState([]);
  const [tokenBalance, setTokenBalance] = useState(0);
  const [tokenProducts, setTokenProducts] = useState([]);

  // Dev toggle — force-show paywall for UI iteration (off by default)
  const [devForcePaywall, setDevForcePaywall] = useState(false);

  const shouldShowPaywall = true; // DEV TEST — revert after testing

  const purchaseUpdateSub = useRef(null);
  const purchaseErrorSub  = useRef(null);

  // ── Initialize IAP connection ────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;

    async function connectIAP() {
      try {
        await initConnection();
        if (!mounted) return;

        // Load product metadata from StoreKit / App Store
        let subs = [];
        try {
          subs = await getSubscriptions({ skus: ALL_PRODUCT_IDS });
        } catch {
          // Fallback to new API if getSubscriptions is not available
          try { subs = await fetchProducts({ skus: ALL_PRODUCT_IDS, type: 'subs' }); } catch {}
        }
        if (!mounted) return;
        setProducts(subs);

        // Load token (consumable) product metadata
        try {
          const tokenProds = await fetchProducts({ skus: ALL_TOKEN_PRODUCT_IDS, type: 'in-app' });
          if (mounted) setTokenProducts(tokenProds);
        } catch (e) {
          console.warn('[Subscription] Token product fetch failed:', e.message);
        }

        if (mounted) setIapReady(true);
      } catch (e) {
        console.warn('[Subscription] IAP init failed:', e.message);
        // App still works — IAP just won't be available
        if (mounted) setIapReady(false);
      }
    }

    connectIAP();

    return () => {
      mounted = false;
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

      try {
        // Validate with server (handles both tokens and subscriptions)
        const result = await validateReceipt(jws, user.id);

        if (result.type === 'tokens') {
          // Finish as consumable
          await finishTransaction({ purchase, isConsumable: true });
          // Update token balance
          setTokenBalance(result.newBalance);
        } else {
          // Finish as non-consumable (subscription)
          await finishTransaction({ purchase, isConsumable: false });
          // Update subscription state
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
      } catch (e) {
        console.error('[Subscription] purchase validation failed:', e.message);
        // Still finish transaction to avoid stuck pending state
        try { await finishTransaction({ purchase, isConsumable: isTokenPurchase }); } catch {}
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
    // Optimistic UI update immediately
    setSubscription(prev => {
      if (prev.quotaLimit === -1) return prev; // unlimited — no change
      const used      = prev.generationsUsed + 1;
      const remaining = Math.max(0, prev.quotaLimit - used);
      return {
        ...prev,
        generationsUsed:      used,
        generationsRemaining: remaining,
        canGenerate:          remaining > 0,
      };
    });

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

  // ── Purchase tokens (consumable IAP) ───────────────────────────────────
  const purchaseTokens = useCallback(async (productId) => {
    if (__DEV__ && !iapReady) {
      // Dev fallback when StoreKit not configured
      console.log('[Subscription] DEV MODE — mock token purchase:', productId);
      const pkg = TOKEN_PACKAGES.find(p => p.id === productId);
      if (pkg) {
        setTokenBalance(prev => prev + pkg.tokens);
      }
      return { success: true, dev: true };
    }

    if (!iapReady) throw new Error('In-app purchases are not available right now.');

    await requestPurchase({
      request: { apple: { sku: productId } },
      type: 'in-app',
    });
    return { success: true };
  }, [iapReady]);

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

    // requestSubscription triggers the StoreKit payment sheet.
    // The actual result comes through purchaseUpdatedListener above.
    await requestSubscription({ sku: productId });
    return { success: true };
  }, [iapReady]);

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

  // ── Refresh on user login ───────────────────────────────────────────────
  useEffect(() => {
    if (user?.id) {
      refreshQuota();
      refreshTokenBalance();
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
        refreshQuota,
        recordGeneration,
        purchaseSubscription,
        restorePurchases,
        // Token system
        tokenBalance,
        refreshTokenBalance,
        deductToken,
        purchaseTokens,
        TOKEN_PACKAGES,
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
