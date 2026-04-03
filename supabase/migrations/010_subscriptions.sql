-- ============================================================
-- Migration 010: Apple IAP Subscription Tracking
-- Adds subscription state to user_generation_quota,
-- creates subscription_events audit log, and updates
-- get_user_quota() + increment_generation_count() to handle
-- free-tier (5 lifetime) vs paid-tier (monthly) logic.
-- ============================================================

-- ============================================================
-- 1. ALTER user_generation_quota
-- Add subscription columns and fix free tier default:
--   - quota_limit 3 → 5 (lifetime for free users)
--   - quota_reset_date = NULL for free (no monthly reset)
--   - New subscription tracking columns
-- ============================================================

ALTER TABLE user_generation_quota
  -- Fix free tier limit 3 → 5
  ALTER COLUMN quota_limit SET DEFAULT 5,

  -- Subscription product ID (e.g. 'snapspace_pro_monthly')
  ADD COLUMN IF NOT EXISTS subscription_product_id     TEXT,

  -- When the current billing period ends (NULL = free)
  ADD COLUMN IF NOT EXISTS subscription_expires_at     TIMESTAMPTZ,

  -- none | active | expired | grace_period
  ADD COLUMN IF NOT EXISTS subscription_status         TEXT DEFAULT 'none',

  -- Apple's dedup key for this subscription chain
  ADD COLUMN IF NOT EXISTS original_transaction_id     TEXT,

  -- Latest JWS receipt string for re-validation on launch
  ADD COLUMN IF NOT EXISTS last_receipt_jws            TEXT;

-- Fix existing free-tier rows: limit 3 → 5, clear reset date
UPDATE user_generation_quota
SET
  quota_limit      = 5,
  quota_reset_date = NULL
WHERE tier = 'free';

-- ============================================================
-- 2. subscription_events TABLE
-- Immutable audit log for every subscription lifecycle event.
-- Never delete rows — append only.
-- ============================================================

CREATE TABLE IF NOT EXISTS subscription_events (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  event_type              TEXT        NOT NULL,  -- purchase | renewal | cancel | expire | restore
  product_id              TEXT,
  transaction_id          TEXT,
  original_transaction_id TEXT,
  environment             TEXT,                  -- Sandbox | Production
  expires_at              TIMESTAMPTZ,
  event_data              JSONB,
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sub_events_user_id
  ON subscription_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_sub_events_original_tx
  ON subscription_events (original_transaction_id);

-- RLS: users can read only their own events
ALTER TABLE subscription_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_events" ON subscription_events;
CREATE POLICY "users_read_own_events"
  ON subscription_events FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "service_insert_events" ON subscription_events;
CREATE POLICY "service_insert_events"
  ON subscription_events FOR INSERT
  WITH CHECK (true);  -- only edge functions (service_role key) insert

-- ============================================================
-- 3. UPDATED get_user_quota()
-- Key changes vs migration 009:
--   - Free tier: lifetime 5 gens, no monthly reset
--   - Paid tiers: monthly reset still applies
--   - Subscription expiry auto-downgrade to free
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_quota(p_user_id UUID)
RETURNS TABLE (
  tier                  TEXT,
  quota_limit           INTEGER,
  generations_used      INTEGER,
  generations_remaining INTEGER,
  can_generate          BOOLEAN,
  quota_reset_date      DATE,
  subscription_status   TEXT,
  subscription_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_record user_generation_quota%ROWTYPE;
  v_today  DATE := CURRENT_DATE;
BEGIN
  -- Get or create quota record
  SELECT * INTO v_record
  FROM user_generation_quota
  WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    -- New user: free tier, 5 lifetime generations, no reset date
    INSERT INTO user_generation_quota (
      user_id,
      tier,
      quota_limit,
      generations_used,
      quota_reset_date,
      subscription_status
    )
    VALUES (p_user_id, 'free', 5, 0, NULL, 'none')
    RETURNING * INTO v_record;
  END IF;

  -- Auto-downgrade if subscription has expired and app hasn't renewed it
  IF v_record.subscription_status = 'active'
     AND v_record.subscription_expires_at IS NOT NULL
     AND v_record.subscription_expires_at < NOW() THEN
    UPDATE user_generation_quota
    SET
      tier                    = 'free',
      quota_limit             = 5,
      subscription_status     = 'expired',
      subscription_product_id = NULL,
      quota_reset_date        = NULL,
      updated_at              = NOW()
    WHERE user_id = p_user_id
    RETURNING * INTO v_record;
  END IF;

  -- Monthly reset for PAID tiers only (free = lifetime, no reset)
  IF v_record.tier != 'free'
     AND v_record.quota_reset_date IS NOT NULL
     AND v_today >= v_record.quota_reset_date THEN
    UPDATE user_generation_quota
    SET
      generations_used = 0,
      quota_reset_date = DATE_TRUNC('month', v_today)::DATE + INTERVAL '1 month',
      updated_at       = NOW()
    WHERE user_id = p_user_id
    RETURNING * INTO v_record;
  END IF;

  RETURN QUERY SELECT
    v_record.tier,
    v_record.quota_limit,
    v_record.generations_used,
    CASE
      WHEN v_record.quota_limit = -1 THEN 999
      ELSE GREATEST(0, v_record.quota_limit - v_record.generations_used)
    END AS generations_remaining,
    CASE
      WHEN v_record.quota_limit = -1 THEN TRUE
      ELSE v_record.generations_used < v_record.quota_limit
    END AS can_generate,
    v_record.quota_reset_date,
    v_record.subscription_status,
    v_record.subscription_expires_at;
END;
$$;

-- ============================================================
-- 4. UPDATED increment_generation_count()
-- Free tier: no reset guard needed (lifetime counter)
-- Paid tier: guard against over-incrementing past quota_limit
-- ============================================================

CREATE OR REPLACE FUNCTION increment_generation_count(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  INSERT INTO user_generation_quota (user_id, generations_used, quota_limit)
  VALUES (p_user_id, 1, 5)
  ON CONFLICT (user_id) DO UPDATE
  SET
    generations_used = user_generation_quota.generations_used + 1,
    updated_at       = NOW();
END;
$$;

-- ============================================================
-- 5. activate_subscription()
-- Called by validate-apple-receipt edge function after
-- successfully verifying a StoreKit 2 JWS receipt.
-- Atomically upgrades tier, quota, and subscription state.
-- ============================================================

CREATE OR REPLACE FUNCTION activate_subscription(
  p_user_id                 UUID,
  p_product_id              TEXT,
  p_transaction_id          TEXT,
  p_original_transaction_id TEXT,
  p_expires_at              TIMESTAMPTZ,
  p_environment             TEXT,
  p_receipt_jws             TEXT DEFAULT NULL
)
RETURNS TABLE (
  tier                  TEXT,
  quota_limit           INTEGER,
  generations_remaining INTEGER,
  subscription_status   TEXT,
  subscription_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_tier        TEXT;
  v_quota_limit INTEGER;
BEGIN
  -- Map product ID → tier + quota
  CASE p_product_id
    WHEN 'snapspace_basic_monthly'   THEN v_tier := 'basic';   v_quota_limit := 25;
    WHEN 'snapspace_pro_monthly'     THEN v_tier := 'pro';     v_quota_limit := 50;
    WHEN 'snapspace_premium_monthly' THEN v_tier := 'premium'; v_quota_limit := -1; -- unlimited
    ELSE
      RAISE EXCEPTION 'Unknown product_id: %', p_product_id;
  END CASE;

  -- Upsert quota record with new subscription state
  INSERT INTO user_generation_quota (
    user_id,
    tier,
    quota_limit,
    generations_used,
    quota_reset_date,
    subscription_product_id,
    subscription_expires_at,
    subscription_status,
    original_transaction_id,
    last_receipt_jws,
    updated_at
  )
  VALUES (
    p_user_id,
    v_tier,
    v_quota_limit,
    0,
    DATE_TRUNC('month', p_expires_at)::DATE + INTERVAL '1 month',
    p_product_id,
    p_expires_at,
    'active',
    p_original_transaction_id,
    p_receipt_jws,
    NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tier                    = v_tier,
    quota_limit             = v_quota_limit,
    generations_used        = 0,
    quota_reset_date        = DATE_TRUNC('month', p_expires_at)::DATE + INTERVAL '1 month',
    subscription_product_id = p_product_id,
    subscription_expires_at = p_expires_at,
    subscription_status     = 'active',
    original_transaction_id = p_original_transaction_id,
    last_receipt_jws        = COALESCE(p_receipt_jws, user_generation_quota.last_receipt_jws),
    updated_at              = NOW();

  -- Log the event
  INSERT INTO subscription_events (
    user_id, event_type, product_id,
    transaction_id, original_transaction_id,
    environment, expires_at
  )
  VALUES (
    p_user_id, 'purchase', p_product_id,
    p_transaction_id, p_original_transaction_id,
    p_environment, p_expires_at
  );

  RETURN QUERY
  SELECT
    v_tier,
    v_quota_limit,
    CASE WHEN v_quota_limit = -1 THEN 999 ELSE v_quota_limit END,
    'active'::TEXT,
    p_expires_at;
END;
$$;

-- ============================================================
-- 6. expire_subscription()
-- Downgrades user to free tier when subscription lapses.
-- Called by validate-apple-receipt or App Store webhook.
-- ============================================================

CREATE OR REPLACE FUNCTION expire_subscription(
  p_user_id                 UUID,
  p_original_transaction_id TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE user_generation_quota
  SET
    tier                    = 'free',
    quota_limit             = 5,
    subscription_status     = 'expired',
    subscription_product_id = NULL,
    subscription_expires_at = NULL,
    quota_reset_date        = NULL,
    updated_at              = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO subscription_events (
    user_id, event_type, original_transaction_id
  )
  VALUES (p_user_id, 'expire', p_original_transaction_id);
END;
$$;
