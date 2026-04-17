-- ============================================================================
-- 018: Fix IAP Product IDs, Fresh-Account Quota Init, Share-to-Get-Wishes
-- ----------------------------------------------------------------------------
-- Three fixes bundled into one migration:
--
-- 1. activate_subscription() references old `snapspace_*_monthly` product IDs
--    but the codebase + App Store Connect use `homegenie_*_weekly`. Any sub
--    purchase validation throws "Unknown product_id". Replaced with the
--    current IDs.
--
-- 2. Fresh accounts were sometimes showing 3/5 wishes already used on first
--    launch (observed on TestFlight, iPhone 14 Pro). Root cause is stale
--    rows from prior test sessions reusing the same auth user. Added an
--    initialize_user_quota() RPC that the client calls on signup to
--    explicitly zero out generations_used for a brand-new session.
--
-- 3. The paywall's "Share to a friend and get free Wishes" button shared a
--    referral code but never actually credited the sharer any wishes. Added
--    a grant_share_bonus() RPC that credits the sharer 2 wishes the first
--    time they share (one-time per user, idempotent via ledger reference_id).
-- ============================================================================

-- ── 1. Fix activate_subscription product IDs ────────────────────────────────

CREATE OR REPLACE FUNCTION activate_subscription(
  p_user_id UUID, p_product_id TEXT, p_transaction_id TEXT,
  p_original_transaction_id TEXT, p_expires_at TIMESTAMPTZ,
  p_environment TEXT, p_receipt_jws TEXT DEFAULT NULL
)
RETURNS TABLE (
  tier TEXT, quota_limit INTEGER, generations_remaining INTEGER,
  subscription_status TEXT, subscription_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql AS $$
DECLARE
  v_tier TEXT; v_quota_limit INTEGER;
BEGIN
  -- Map current HomeGenie IAP product IDs (weekly subscriptions)
  CASE p_product_id
    WHEN 'homegenie_basic_weekly'   THEN v_tier := 'basic';   v_quota_limit := 25;
    WHEN 'homegenie_pro_weekly'     THEN v_tier := 'pro';     v_quota_limit := 50;
    WHEN 'homegenie_premium_weekly' THEN v_tier := 'premium'; v_quota_limit := -1;
    -- Legacy IDs kept so old sandbox receipts don't break
    WHEN 'snapspace_basic_monthly'   THEN v_tier := 'basic';   v_quota_limit := 25;
    WHEN 'snapspace_pro_monthly'     THEN v_tier := 'pro';     v_quota_limit := 50;
    WHEN 'snapspace_premium_monthly' THEN v_tier := 'premium'; v_quota_limit := -1;
    ELSE RAISE EXCEPTION 'Unknown product_id: %', p_product_id;
  END CASE;

  INSERT INTO user_generation_quota (
    user_id, tier, quota_limit, generations_used, quota_reset_date,
    subscription_product_id, subscription_expires_at, subscription_status,
    original_transaction_id, last_receipt_jws, updated_at
  ) VALUES (
    p_user_id, v_tier, v_quota_limit, 0,
    DATE_TRUNC('week', p_expires_at)::DATE + INTERVAL '1 week',
    p_product_id, p_expires_at, 'active', p_original_transaction_id, p_receipt_jws, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tier = v_tier, quota_limit = v_quota_limit, generations_used = 0,
    quota_reset_date = DATE_TRUNC('week', p_expires_at)::DATE + INTERVAL '1 week',
    subscription_product_id = p_product_id, subscription_expires_at = p_expires_at,
    subscription_status = 'active', original_transaction_id = p_original_transaction_id,
    last_receipt_jws = COALESCE(p_receipt_jws, user_generation_quota.last_receipt_jws),
    updated_at = NOW();

  INSERT INTO subscription_events (
    user_id, event_type, product_id, transaction_id,
    original_transaction_id, environment, expires_at
  ) VALUES (
    p_user_id, 'purchase', p_product_id, p_transaction_id,
    p_original_transaction_id, p_environment, p_expires_at
  );

  RETURN QUERY SELECT v_tier, v_quota_limit,
    CASE WHEN v_quota_limit = -1 THEN 999 ELSE v_quota_limit END,
    'active'::TEXT, p_expires_at;
END;
$$;

-- ── 2. initialize_user_quota: reset on fresh signup ─────────────────────────

-- Called from the client immediately after signUp() so a brand-new account
-- always starts at generations_used = 0, regardless of prior rows that
-- may exist for the same auth user (sandbox reuse, test resets, etc.)
CREATE OR REPLACE FUNCTION initialize_user_quota(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only touch rows that are still on the free tier — never clobber a
  -- user who has actually paid for a subscription.
  INSERT INTO user_generation_quota (
    user_id, tier, quota_limit, generations_used,
    quota_reset_date, subscription_status, updated_at
  )
  VALUES (p_user_id, 'free', 5, 0, NULL, 'none', NOW())
  ON CONFLICT (user_id) DO UPDATE SET
    generations_used = CASE
      WHEN user_generation_quota.tier = 'free' THEN 0
      ELSE user_generation_quota.generations_used
    END,
    updated_at = NOW()
  WHERE user_generation_quota.tier = 'free';
END;
$$;

GRANT EXECUTE ON FUNCTION initialize_user_quota(UUID) TO authenticated;

-- ── 3. grant_share_bonus: one-time 2-wish bonus for sharing ─────────────────

-- Credits the caller 2 wishes the first time they share the paywall.
-- Idempotent: subsequent calls return the current balance unchanged.
-- Uses token_transactions.reference_id = 'share_bonus_<user_id>' for
-- dedup (globally UNIQUE per migration 015).
CREATE OR REPLACE FUNCTION grant_share_bonus(p_user_id UUID)
RETURNS TABLE (new_balance INTEGER, already_claimed BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ref TEXT := 'share_bonus_' || p_user_id::TEXT;
  v_balance INTEGER;
  v_existing INTEGER;
BEGIN
  -- Was this user already credited a share bonus?
  SELECT 1 INTO v_existing
  FROM token_transactions
  WHERE reference_id = v_ref
  LIMIT 1;

  IF FOUND THEN
    SELECT ut.balance INTO v_balance FROM user_tokens ut WHERE ut.user_id = p_user_id;
    RETURN QUERY SELECT COALESCE(v_balance, 0), TRUE;
    RETURN;
  END IF;

  -- Grant 2 wishes as referral_bonus (same counter bucket as other gifts)
  PERFORM add_tokens(p_user_id, 2, 'referral_bonus', v_ref, NULL);

  SELECT ut.balance INTO v_balance FROM user_tokens ut WHERE ut.user_id = p_user_id;
  RETURN QUERY SELECT COALESCE(v_balance, 0), FALSE;
END;
$$;

GRANT EXECUTE ON FUNCTION grant_share_bonus(UUID) TO authenticated;
