import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';

// ── Tier definitions ────────────────────────────────────────────────────────
export const TIERS = {
  free:    { id: 'free',    name: 'Free',    price: 0,     priceLabel: 'Free',     gens: 5,  monthly: false },
  basic:   { id: 'basic',   name: 'Basic',   price: 6.99,  priceLabel: '$6.99/mo', gens: 25, monthly: true, productId: 'snapspace_basic_monthly' },
  pro:     { id: 'pro',     name: 'Pro',     price: 12.99, priceLabel: '$12.99/mo',gens: 50, monthly: true, productId: 'snapspace_pro_monthly',   popular: true },
  premium: { id: 'premium', name: 'Premium', price: 19.99, priceLabel: '$19.99/mo',gens: 75, monthly: true, productId: 'snapspace_premium_monthly' },
};

export const PAID_TIERS = [TIERS.basic, TIERS.pro, TIERS.premium];

// ── Context ─────────────────────────────────────────────────────────────────
const SubscriptionContext = createContext(null);

export function SubscriptionProvider({ children }) {
  const { user } = useAuth();

  // ── Subscription state (mock for Phase 1) ───────────────────────────────
  const [subscription, setSubscription] = useState({
    tier: 'free',
    quotaLimit: 5,
    generationsUsed: 0,
    generationsRemaining: 5,
    canGenerate: true,
    quotaResetDate: null,       // null for free (lifetime, not monthly)
    subscriptionStatus: 'none', // none | active | expired | grace_period
  });

  // ── Dev toggle ──────────────────────────────────────────────────────────
  const [devForcePaywall, setDevForcePaywall] = useState(false);

  const shouldShowPaywall = devForcePaywall || !subscription.canGenerate;

  // ── Refresh quota from backend ──────────────────────────────────────────
  const refreshQuota = useCallback(async () => {
    if (!user?.id) return;
    try {
      // Phase 2: fetch from Supabase RPC get_user_quota(user.id)
      // For now, return the current mock state
      // const quota = await getUserQuota(user.id);
      // setSubscription(prev => ({ ...prev, ...quota }));
    } catch (e) {
      console.warn('[Subscription] quota refresh failed:', e.message);
    }
  }, [user?.id]);

  // ── Record a generation (decrement quota) ───────────────────────────────
  const recordGeneration = useCallback(() => {
    setSubscription(prev => {
      const used = prev.generationsUsed + 1;
      const remaining = Math.max(0, prev.quotaLimit - used);
      return {
        ...prev,
        generationsUsed: used,
        generationsRemaining: remaining,
        canGenerate: remaining > 0,
      };
    });
  }, []);

  // ── Purchase subscription (mock for Phase 1) ───────────────────────────
  const purchaseSubscription = useCallback(async (productId) => {
    if (__DEV__) {
      console.log('[Subscription] DEV MODE — mock purchase:', productId);
      const tier = PAID_TIERS.find(t => t.productId === productId);
      if (tier) {
        setSubscription(prev => ({
          ...prev,
          tier: tier.id,
          quotaLimit: tier.gens,
          generationsUsed: 0,
          generationsRemaining: tier.gens,
          canGenerate: true,
          subscriptionStatus: 'active',
          quotaResetDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        }));
      }
      return { success: true, dev: true };
    }
    // Phase 3: real IAP via expo-iap
    throw new Error('IAP not yet implemented');
  }, []);

  // ── Restore purchases (mock for Phase 1) ────────────────────────────────
  const restorePurchases = useCallback(async () => {
    if (__DEV__) {
      console.log('[Subscription] DEV MODE — mock restore');
      return { success: true, restored: 0, dev: true };
    }
    // Phase 3: real IAP restore via expo-iap
    throw new Error('IAP not yet implemented');
  }, []);

  // ── Refresh on user change ──────────────────────────────────────────────
  useEffect(() => {
    if (user?.id) refreshQuota();
  }, [user?.id, refreshQuota]);

  return (
    <SubscriptionContext.Provider
      value={{
        subscription,
        shouldShowPaywall,
        devForcePaywall,
        setDevForcePaywall: __DEV__ ? setDevForcePaywall : () => {},
        refreshQuota,
        recordGeneration,
        purchaseSubscription,
        restorePurchases,
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
