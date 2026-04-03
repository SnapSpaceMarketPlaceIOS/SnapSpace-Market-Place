/**
 * subscriptionService.js
 * Helpers for Apple IAP subscription validation and status.
 * Server-side receipt validation goes through the
 * validate-apple-receipt Supabase Edge Function.
 */

const SUPABASE_URL      = process.env.EXPO_PUBLIC_SUPABASE_URL      || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// ── Tier constants ────────────────────────────────────────────────────────────

export const PRODUCT_IDS = {
  BASIC:   'snapspace_basic_monthly',
  PRO:     'snapspace_pro_monthly',
  PREMIUM: 'snapspace_premium_monthly',
};

export const ALL_PRODUCT_IDS = Object.values(PRODUCT_IDS);

export const PRODUCT_TIER_MAP = {
  [PRODUCT_IDS.BASIC]:   { tier: 'basic',   quotaLimit: 25,  displayLabel: '25' },
  [PRODUCT_IDS.PRO]:     { tier: 'pro',     quotaLimit: 50,  displayLabel: '50' },
  [PRODUCT_IDS.PREMIUM]: { tier: 'premium', quotaLimit: -1,  displayLabel: 'Unlimited' },
};

// ── Server-side receipt validation ───────────────────────────────────────────

/**
 * Send a StoreKit 2 JWS transaction to the server for verification.
 * The edge function validates the Apple certificate chain, decodes
 * the payload, and calls activate_subscription() in Supabase.
 *
 * @param {string} jwsRepresentation  — The JWS string from expo-iap
 * @param {string} userId             — Supabase auth user ID
 * @returns {Promise<{ tier, quotaLimit, generationsRemaining, subscriptionStatus, subscriptionExpiresAt }>}
 */
export async function validateReceipt(jwsRepresentation, userId) {
  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/validate-apple-receipt`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'x-user-id':     userId,
      },
      body: JSON.stringify({ jwsRepresentation }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error');
    throw new Error(`Receipt validation failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  return {
    tier:                   data.tier,
    quotaLimit:             data.quota_limit,
    generationsRemaining:   data.generations_remaining,
    subscriptionStatus:     data.subscription_status,
    subscriptionExpiresAt:  data.subscription_expires_at,
  };
}

// ── Quota fetch from DB ───────────────────────────────────────────────────────

/**
 * Fetch current quota and subscription status from Supabase.
 * Uses direct fetch + anon key (not supabase.functions.invoke) to
 * avoid iOS simulator SecureStore JWT issues.
 *
 * @param {string} userId
 * @returns {Promise<QuotaResult>}
 */
export async function fetchQuota(userId) {
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase
    .rpc('get_user_quota', { p_user_id: userId });

  if (error || !data?.[0]) {
    return {
      tier:                   'free',
      quotaLimit:             5,
      generationsUsed:        0,
      generationsRemaining:   5,
      canGenerate:            true,
      quotaResetDate:         null,
      subscriptionStatus:     'none',
      subscriptionExpiresAt:  null,
    };
  }

  const q = data[0];
  return {
    tier:                   q.tier,
    quotaLimit:             q.quota_limit,
    generationsUsed:        q.generations_used,
    generationsRemaining:   q.generations_remaining,
    canGenerate:            q.can_generate,
    quotaResetDate:         q.quota_reset_date,
    subscriptionStatus:     q.subscription_status,
    subscriptionExpiresAt:  q.subscription_expires_at,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns whether a given tier is a paid subscription.
 */
export function isPaidTier(tier) {
  return ['basic', 'pro', 'premium'].includes(tier);
}

/**
 * Returns a human-readable label for how many generations remain.
 * e.g. "3 left this month", "12 left", "Unlimited"
 */
export function formatGenerationsRemaining(tier, remaining) {
  if (tier === 'premium') return 'Unlimited';
  if (isPaidTier(tier))   return `${remaining} left this month`;
  return `${remaining} free left`;
}
