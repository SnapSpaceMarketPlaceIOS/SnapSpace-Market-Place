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
  BASIC:   'homegenie_basic_weekly',
  PRO:     'homegenie_pro_weekly',
  PREMIUM: 'homegenie_premium_weekly',
};

export const ALL_PRODUCT_IDS = Object.values(PRODUCT_IDS);

export const PRODUCT_TIER_MAP = {
  [PRODUCT_IDS.BASIC]:   { tier: 'basic',   quotaLimit: 25,  displayLabel: '25' },
  [PRODUCT_IDS.PRO]:     { tier: 'pro',     quotaLimit: 50,  displayLabel: '50' },
  [PRODUCT_IDS.PREMIUM]: { tier: 'premium', quotaLimit: -1,  displayLabel: 'Unlimited' },
};

// ── Wish product IDs (consumable IAP — "wishes" = design credits) ───────────

export const WISH_PRODUCT_IDS = {
  WISHES_4:   'homegenie_wishes_4',
  WISHES_10:  'homegenie_wishes_10',
  WISHES_20:  'homegenie_wishes_20',
  WISHES_40:  'homegenie_wishes_40',
  WISHES_100: 'homegenie_wishes_100',
  WISHES_200: 'homegenie_wishes_200',
};

// Backward compat alias
export const TOKEN_PRODUCT_IDS = WISH_PRODUCT_IDS;

export const ALL_TOKEN_PRODUCT_IDS = Object.values(TOKEN_PRODUCT_IDS);

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
  // Get the signed-in user's Supabase JWT — edge function derives
  // user_id from this to prevent cross-account purchase spoofing.
  const { supabase } = await import('./supabase');
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    throw new Error('Not signed in — cannot validate receipt.');
  }

  const res = await fetch(
    `${SUPABASE_URL}/functions/v1/validate-apple-receipt`,
    {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'apikey':        SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ jwsRepresentation }),
    }
  );

  if (!res.ok) {
    const text = await res.text().catch(() => 'unknown error');
    throw new Error(`Receipt validation failed (${res.status}): ${text}`);
  }

  const data = await res.json();

  // Token purchase response
  if (data.type === 'tokens') {
    return {
      type:         'tokens',
      tokensAdded:  data.tokens_added,
      newBalance:   data.new_balance,
    };
  }

  // Subscription purchase response
  return {
    type:                   'subscription',
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

// ── Token balance ────────────────────────────────────────────────────────────

/**
 * Fetch current token balance from Supabase.
 * @param {string} userId
 * @returns {Promise<{ balance, totalPurchased, totalUsed, totalGifted }>}
 */
export async function fetchTokenBalance(userId) {
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase
    .rpc('get_token_balance', { p_user_id: userId });

  if (error || !data?.[0]) {
    return { balance: 0, totalPurchased: 0, totalUsed: 0, totalGifted: 0 };
  }

  const t = data[0];
  return {
    balance:        t.balance,
    totalPurchased: t.total_purchased,
    totalUsed:      t.total_used,
    totalGifted:    t.total_gifted,
  };
}

// ── Referral helpers ─────────────────────────────────────────────────────────

/**
 * Apply a referral code for a newly signed-up user.
 * Creates a pending referral that completes when the referred user
 * makes their first generation or verifies email.
 *
 * @param {string} userId       — the referred (new) user's ID
 * @param {string} referralCode — 6-char code from the referrer
 */
export async function applyReferralCode(userId, referralCode) {
  const { supabase } = await import('./supabase');
  const { error } = await supabase
    .rpc('apply_referral', { p_referred_id: userId, p_referral_code: referralCode });

  if (error) throw new Error(error.message);
}

/**
 * Try to redeem a promo code at signup. The user-facing input on AuthScreen
 * accepts EITHER a promo code (server-issued, fixed wish bonus to the
 * REDEEMER) OR a referral code (user-to-user, 2 wishes to the REFERRER).
 * Promo is checked first because:
 *   • A promo match short-circuits — we never want to forward a known
 *     promo to apply_referral (which would just no-op + log noise).
 *   • Referral codes are 6-char user IDs; promo codes use the HG-... shape,
 *     so they don't collide in practice.
 *
 * @param {string} userId  — the signing-up user's id
 * @param {string} code    — what the user typed (any case, may have spaces)
 * @returns {Promise<{
 *   matched: 'promo' | 'referral' | 'none',
 *   wishesPending: number,   // promo only — wishes credited on email verify
 *   status: string,           // server status string for UI
 * }>}
 *
 * Server status strings (promo path):
 *   PENDING_VERIFY    — code valid, wishes credit on email verify
 *   EMPTY_CODE        — input was empty
 *   INVALID_CODE      — no matching active+unexpired promo (caller falls
 *                       through to referral attempt)
 *   ALREADY_REDEEMED  — this user has already redeemed any promo code
 *   CODE_EXHAUSTED    — code's max_redemptions cap is reached
 */
export async function redeemSignupCode(userId, code) {
  const trimmed = (code || '').trim();
  if (!trimmed) {
    return { matched: 'none', wishesPending: 0, status: 'EMPTY_CODE' };
  }

  const { supabase } = await import('./supabase');

  // Step 1: try promo redemption.
  const { data: promoData, error: promoError } = await supabase
    .rpc('redeem_promo_code', { p_user_id: userId, p_code: trimmed });

  // Hard error (network, RPC missing, etc.) — surface to caller.
  if (promoError) throw new Error(promoError.message);

  const row = Array.isArray(promoData) ? promoData[0] : promoData;
  const status = row?.status || 'INVALID_CODE';

  if (row?.success === true) {
    return {
      matched: 'promo',
      wishesPending: row.wishes_pending ?? 0,
      status,
    };
  }

  // Promo says ALREADY_REDEEMED / CODE_EXHAUSTED — those are terminal,
  // no point falling through to the referral path. Return as-is.
  if (status === 'ALREADY_REDEEMED' || status === 'CODE_EXHAUSTED') {
    return { matched: 'promo', wishesPending: 0, status };
  }

  // INVALID_CODE: not a promo. Try as a referral instead. We don't await
  // any wish credit here — apply_referral creates a pending row that the
  // existing trigger settles later. Failures are non-fatal so a typo'd
  // code doesn't block the signup flow.
  try {
    await applyReferralCode(userId, trimmed);
    return { matched: 'referral', wishesPending: 0, status: 'REFERRAL_PENDING' };
  } catch (e) {
    // Referral RPC raised — likely an invalid referral code. Treat as
    // "neither matched" so the UI can show a soft notice, but don't
    // throw because signup itself succeeded.
    return { matched: 'none', wishesPending: 0, status: 'INVALID_CODE' };
  }
}

/**
 * Get or generate the current user's referral code.
 * @param {string} userId
 * @returns {Promise<string>} — 6-char referral code
 */
export async function getReferralCode(userId) {
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase
    .rpc('generate_referral_code', { p_user_id: userId });

  if (error) throw new Error(error.message);
  return data;
}

/**
 * Grant the current user a one-time 2-wish "share bonus" the first time
 * they share the paywall. Idempotent — subsequent calls return the
 * existing balance without double-crediting.
 *
 * @param {string} userId
 * @returns {Promise<{ newBalance: number, alreadyClaimed: boolean }>}
 */
export async function grantShareBonus(userId) {
  const { supabase } = await import('./supabase');
  const { data, error } = await supabase
    .rpc('grant_share_bonus', { p_user_id: userId });

  if (error) throw new Error(error.message);
  const row = data?.[0] || {};
  return {
    newBalance:     row.new_balance ?? 0,
    alreadyClaimed: row.already_claimed ?? false,
  };
}
