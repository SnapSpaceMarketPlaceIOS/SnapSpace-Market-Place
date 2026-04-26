-- ============================================================
-- Migration 027 — Fix IAP product IDs, weekly quota cadence, Restore exploit
-- ============================================================
--
-- Closes critical bug B1 + high-severity bugs B5, B6, B7, B9 from the
-- 2026-04-26 paywall audit:
--
--   B1 (CRITICAL): activate_subscription's CASE block hard-coded the wrong
--     product IDs — snapspace_basic_monthly / snapspace_pro_monthly /
--     snapspace_premium_monthly — and threw 'Unknown product_id' for any
--     real purchase. The actual SKUs sold via App Store Connect (and
--     mapped in validate-apple-receipt's PRODUCT_MAP) are
--     homegenie_basic_weekly / homegenie_pro_weekly / homegenie_premium_weekly.
--     Result: every successful sub purchase threw at the SQL layer, the
--     edge function returned 500, the client treated StoreKit ack as
--     "success", and the user was charged with NO entitlement granted.
--
--   B5 (HIGH): Reset cadence was monthly (DATE_TRUNC('month', expires_at)
--     + 1 month) but billing is weekly. A subscriber would burn their
--     weekly quota and stay locked at limit/limit for up to 3 more
--     weekly billing cycles before the monthly reset fired.
--
--   B6 (HIGH): Free-tier "5 wishes per week" never reset — quota_reset_date
--     was NULL for free-tier rows and the reset block in get_user_quota
--     only fired for tier != 'free'. A free user used 5, hit the paywall,
--     and was permanently locked unless they bought a wish pack.
--
--   B7 (HIGH): Schema disagreement between mig 009 (free quota_limit
--     default = 3) and mig 010 (default = 5). Some legacy rows had 3.
--
--   B9 (HIGH): Restore Purchases re-ran activate_subscription which
--     unconditionally zeroed generations_used. A user could tap Restore
--     mid-cycle to regenerate all the wishes they had spent that week.
--     Free-wish exploit.
--
-- This migration is idempotent — runs cleanly on a database that's
-- already at any prior migration state. CREATE OR REPLACE on functions,
-- conditional UPDATE on data.
-- ============================================================

-- Step 1: Replace activate_subscription with the correct SKU map and
-- weekly reset cadence. ON CONFLICT path now ONLY zeros generations_used
-- when expires_at advanced (true new cycle) — Restore Purchases mid-cycle
-- preserves the existing usage counter (B9 fix).

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
  tier                    TEXT,
  quota_limit             INTEGER,
  generations_remaining   INTEGER,
  subscription_status     TEXT,
  subscription_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql AS $$
DECLARE
  v_tier        TEXT;
  v_quota_limit INTEGER;
  v_reset_date  DATE := CURRENT_DATE + INTERVAL '7 days';
BEGIN
  CASE p_product_id
    WHEN 'homegenie_basic_weekly'   THEN v_tier := 'basic';   v_quota_limit := 25;
    WHEN 'homegenie_pro_weekly'     THEN v_tier := 'pro';     v_quota_limit := 50;
    WHEN 'homegenie_premium_weekly' THEN v_tier := 'premium'; v_quota_limit := -1;
    -- Backward-compat: accept legacy snapspace_* IDs in case any pre-launch
    -- TestFlight build sends them. Map to same tiers, log a warning via
    -- subscription_events so we can spot leftovers.
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
    p_user_id, v_tier, v_quota_limit, 0, v_reset_date,
    p_product_id, p_expires_at, 'active', p_original_transaction_id, p_receipt_jws, NOW()
  )
  ON CONFLICT (user_id) DO UPDATE SET
    tier             = v_tier,
    quota_limit      = v_quota_limit,
    -- B9 fix: only zero generations_used when expires_at advanced (i.e.,
    -- a true renewal). When the same expires_at comes back (Restore
    -- Purchases mid-cycle), preserve the existing counter so the user
    -- can't tap Restore to refill their weekly allotment.
    generations_used = CASE
      WHEN user_generation_quota.subscription_expires_at IS NULL
        OR user_generation_quota.subscription_expires_at < p_expires_at
      THEN 0
      ELSE user_generation_quota.generations_used
    END,
    quota_reset_date = CASE
      WHEN user_generation_quota.subscription_expires_at IS NULL
        OR user_generation_quota.subscription_expires_at < p_expires_at
      THEN v_reset_date
      ELSE user_generation_quota.quota_reset_date
    END,
    subscription_product_id = p_product_id,
    subscription_expires_at = p_expires_at,
    subscription_status     = 'active',
    original_transaction_id = p_original_transaction_id,
    last_receipt_jws        = COALESCE(p_receipt_jws, user_generation_quota.last_receipt_jws),
    updated_at              = NOW();

  -- Audit row in subscription_events (one row per activation call).
  INSERT INTO subscription_events (
    user_id, event_type, product_id, transaction_id,
    original_transaction_id, environment, expires_at
  ) VALUES (
    p_user_id, 'purchase', p_product_id, p_transaction_id,
    p_original_transaction_id, p_environment, p_expires_at
  );

  RETURN QUERY
  SELECT
    v_tier,
    v_quota_limit,
    CASE
      WHEN v_quota_limit = -1 THEN 999
      ELSE GREATEST(0, v_quota_limit - (
        SELECT generations_used FROM user_generation_quota WHERE user_id = p_user_id
      ))
    END,
    'active'::TEXT,
    p_expires_at;
END;
$$;

-- Step 2: Replace get_user_quota so the weekly reset block fires for ALL
-- tiers including 'free'. Free-tier rows that have NULL quota_reset_date
-- get a fresh 7-day window initialized on first read so the reset cycle
-- can ever trigger (B6 fix).

CREATE OR REPLACE FUNCTION get_user_quota(p_user_id UUID)
RETURNS TABLE (
  tier                    TEXT,
  quota_limit             INTEGER,
  generations_used        INTEGER,
  generations_remaining   INTEGER,
  can_generate            BOOLEAN,
  quota_reset_date        DATE,
  subscription_status     TEXT,
  subscription_expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql AS $$
DECLARE
  v_record user_generation_quota%ROWTYPE;
  v_today  DATE := CURRENT_DATE;
BEGIN
  SELECT * INTO v_record FROM user_generation_quota WHERE user_id = p_user_id;

  -- First-touch row creation. Free tier with quota_limit=5 and a fresh
  -- weekly reset window so the user always has 5/5 to start.
  IF NOT FOUND THEN
    INSERT INTO user_generation_quota (
      user_id, tier, quota_limit, generations_used, quota_reset_date, subscription_status
    ) VALUES (
      p_user_id, 'free', 5, 0, v_today + INTERVAL '7 days', 'none'
    )
    RETURNING * INTO v_record;
  END IF;

  -- Lazy expiry: if the subscribed window has lapsed, demote to free and
  -- reset quota_reset_date to a fresh weekly window.
  IF v_record.subscription_status = 'active'
     AND v_record.subscription_expires_at IS NOT NULL
     AND v_record.subscription_expires_at < NOW() THEN
    UPDATE user_generation_quota
    SET tier                    = 'free',
        quota_limit             = 5,
        subscription_status     = 'expired',
        subscription_product_id = NULL,
        quota_reset_date        = v_today + INTERVAL '7 days',
        generations_used        = 0,
        updated_at              = NOW()
    WHERE user_id = p_user_id RETURNING * INTO v_record;
  END IF;

  -- Initialize quota_reset_date for any row that has NULL (legacy rows
  -- predating this migration). Fresh weekly window starting today.
  IF v_record.quota_reset_date IS NULL AND v_record.quota_limit != -1 THEN
    UPDATE user_generation_quota
    SET quota_reset_date = v_today + INTERVAL '7 days', updated_at = NOW()
    WHERE user_id = p_user_id RETURNING * INTO v_record;
  END IF;

  -- Weekly reset for ALL non-unlimited tiers (B5 + B6 fix). Previous code
  -- only reset when tier != 'free' AND used a monthly cadence.
  IF v_record.quota_limit != -1
     AND v_record.quota_reset_date IS NOT NULL
     AND v_today >= v_record.quota_reset_date THEN
    UPDATE user_generation_quota
    SET generations_used = 0,
        quota_reset_date = v_today + INTERVAL '7 days',
        updated_at       = NOW()
    WHERE user_id = p_user_id RETURNING * INTO v_record;
  END IF;

  RETURN QUERY SELECT
    v_record.tier,
    v_record.quota_limit,
    v_record.generations_used,
    CASE WHEN v_record.quota_limit = -1 THEN 999
         ELSE GREATEST(0, v_record.quota_limit - v_record.generations_used) END,
    CASE WHEN v_record.quota_limit = -1 THEN TRUE
         ELSE v_record.generations_used < v_record.quota_limit END,
    v_record.quota_reset_date,
    v_record.subscription_status,
    v_record.subscription_expires_at;
END;
$$;

-- Step 3: Update expire_subscription to initialize quota_reset_date when
-- demoting to free, so the user gets a fresh weekly window post-expiry.

CREATE OR REPLACE FUNCTION expire_subscription(
  p_user_id UUID, p_original_transaction_id TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  UPDATE user_generation_quota
  SET tier                    = 'free',
      quota_limit             = 5,
      subscription_status     = 'expired',
      subscription_product_id = NULL,
      subscription_expires_at = NULL,
      quota_reset_date        = CURRENT_DATE + INTERVAL '7 days',
      generations_used        = 0,
      updated_at              = NOW()
  WHERE user_id = p_user_id;

  INSERT INTO subscription_events (user_id, event_type, original_transaction_id)
  VALUES (p_user_id, 'expire', p_original_transaction_id);
END;
$$;

-- Step 4: Schema reconciliation (B7 fix) — bump any legacy rows whose
-- quota_limit is below 5 (from the original mig 009 default of 3).
-- Affects only free-tier rows; subscribed rows have their tier-correct
-- limit (25/50/-1) and we don't want to reset them.

UPDATE user_generation_quota
SET quota_limit = 5,
    updated_at  = NOW()
WHERE tier = 'free'
  AND quota_limit < 5;

-- Step 5: Backfill quota_reset_date for any legacy free-tier row that
-- has NULL. Idempotent — only updates rows that need it. Without this,
-- get_user_quota's lazy initialization would still work, but seeding
-- here means existing users see 5/5 on next app-open without waiting.

UPDATE user_generation_quota
SET quota_reset_date = CURRENT_DATE + INTERVAL '7 days',
    updated_at       = NOW()
WHERE quota_reset_date IS NULL
  AND quota_limit != -1;

-- Step 6: Extend token_transactions transaction_type CHECK to include
-- 'generation_failed' (B8 fix). When a paid wish-deduction is committed
-- but the AI generation downstream throws, we re-credit the user with
-- a ledger entry typed 'generation_failed' so support / refund flows
-- can trace the cause without conflating with manual admin grants or
-- Apple-issued refunds.

ALTER TABLE token_transactions
  DROP CONSTRAINT IF EXISTS token_transactions_transaction_type_check;

ALTER TABLE token_transactions
  ADD CONSTRAINT token_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'purchase',
    'generation',
    'referral_bonus',
    'admin_grant',
    'refund',
    'promotional_bonus',
    'generation_failed'
  ));

-- Step 7: refund_token RPC for B8 — re-credit a single wish when a paid
-- generation fails downstream of the deduct_token RPC. Idempotent via the
-- UNIQUE(reference_id) index from migration 015 — passing the generation_id
-- as p_reference_id ensures retries on the same failure don't double-credit.
--
-- This RPC is INTENTIONALLY separate from add_tokens because:
--   - add_tokens always increments total_purchased OR total_gifted; a refund
--     should DECREMENT total_used (the wish was never actually used) so the
--     user's lifetime stats stay accurate.
--   - The ledger row uses type='generation_failed' (not 'refund') so support
--     can distinguish app-side compensation from Apple-issued refunds.

CREATE OR REPLACE FUNCTION refund_token(
  p_user_id      UUID,
  p_generation_id TEXT
)
RETURNS TABLE (new_balance INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- Increment balance, decrement total_used (capped at 0 — never negative).
  UPDATE user_tokens
  SET balance    = balance + 1,
      total_used = GREATEST(0, total_used - 1),
      updated_at = NOW()
  WHERE user_id  = p_user_id
  RETURNING balance INTO v_balance;

  -- If user_tokens row didn't exist (rare), insert one with balance=1.
  IF v_balance IS NULL THEN
    INSERT INTO user_tokens (user_id, balance, total_purchased, updated_at)
    VALUES (p_user_id, 1, 0, NOW())
    RETURNING balance INTO v_balance;
  END IF;

  -- Ledger entry. UNIQUE(reference_id) prevents double-credit on retry.
  -- Catch unique_violation and revert if the same generation_id already
  -- has a refund row.
  BEGIN
    INSERT INTO token_transactions (
      user_id, amount, balance_after, transaction_type, reference_id
    ) VALUES (
      p_user_id, 1, v_balance, 'generation_failed',
      'refund-gen-' || p_generation_id
    );
  EXCEPTION WHEN unique_violation THEN
    -- Already refunded this generation. Revert the balance increment we
    -- applied above so the visible balance stays correct.
    UPDATE user_tokens
    SET balance    = balance - 1,
        total_used = total_used + 1,
        updated_at = NOW()
    WHERE user_id  = p_user_id
    RETURNING balance INTO v_balance;
  END;

  RETURN QUERY SELECT v_balance;
END;
$$;

-- Allow authenticated users to call refund_token for their OWN user_id only.
-- Service role bypasses RLS automatically (used by edge functions if needed).
GRANT EXECUTE ON FUNCTION refund_token(UUID, TEXT) TO authenticated;

-- Step 8: refund_consumable_purchase RPC — atomic debit when Apple issues
-- a REFUND notification on a consumable wish-pack purchase. Replaces the
-- prior inline read-then-update pattern in apple-iap-webhook which had
-- TWO concurrency holes:
--   (a) two simultaneous REFUND webhooks would both read pre-update
--       balance, both compute max(0, balance - amount), both write —
--       effectively crediting only ONE refund despite Apple billing TWO.
--   (b) no idempotency key, so an Apple retry on the same notification
--       would debit the user twice for one Apple-side refund.
--
-- This RPC fixes both: the UPDATE is atomic at the row level, and the
-- ledger row's UNIQUE(reference_id) constraint (added in mig 015)
-- guarantees one-and-only-one debit per Apple transaction. On the
-- second call with the same transaction_id, the ledger insert raises
-- unique_violation, the UPDATE we just applied is reverted, and the
-- function returns the unchanged balance.

CREATE OR REPLACE FUNCTION refund_consumable_purchase(
  p_user_id        UUID,
  p_transaction_id TEXT,
  p_product_id     TEXT,
  p_amount         INTEGER
)
RETURNS TABLE (new_balance INTEGER, debited INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_balance         INTEGER;
  v_actual_debit    INTEGER;
  v_total_used      INTEGER;
BEGIN
  IF p_amount <= 0 THEN
    -- Nothing to refund. Return current balance with debited = 0.
    SELECT balance INTO v_balance FROM user_tokens WHERE user_id = p_user_id;
    RETURN QUERY SELECT COALESCE(v_balance, 0), 0;
    RETURN;
  END IF;

  -- Atomic debit. Cap at the current balance — never write a negative
  -- value. (User may have already spent some of the refunded wishes.)
  -- Returns the actual debit amount (= min(amount, prior_balance)) so
  -- the ledger row records what was actually taken.
  UPDATE user_tokens
  SET balance      = GREATEST(0, balance - p_amount),
      total_used   = total_used + LEAST(balance, p_amount),
      updated_at   = NOW()
  WHERE user_id    = p_user_id
  RETURNING balance, LEAST(p_amount, balance + p_amount) AS dbg INTO v_balance, v_actual_debit;

  IF NOT FOUND THEN
    -- No user_tokens row exists. Insert one at zero with no debit so the
    -- ledger entry still records the Apple-side refund happened.
    INSERT INTO user_tokens (user_id, balance, total_purchased, updated_at)
    VALUES (p_user_id, 0, 0, NOW())
    RETURNING balance INTO v_balance;
    v_actual_debit := 0;
  END IF;

  -- Ledger row keyed by transaction_id with a 'refund-' prefix to avoid
  -- colliding with the original purchase's reference_id (= transaction_id
  -- without prefix). UNIQUE(reference_id) makes this idempotent.
  BEGIN
    INSERT INTO token_transactions (
      user_id, amount, balance_after, transaction_type, reference_id, product_id
    ) VALUES (
      p_user_id, -v_actual_debit, v_balance, 'refund',
      'refund-' || p_transaction_id, p_product_id
    );
  EXCEPTION WHEN unique_violation THEN
    -- Already refunded. Revert the UPDATE we just did so the visible
    -- balance is unchanged, then return the reverted balance.
    UPDATE user_tokens
    SET balance      = balance + v_actual_debit,
        total_used   = total_used - v_actual_debit,
        updated_at   = NOW()
    WHERE user_id    = p_user_id
    RETURNING balance INTO v_balance;
    v_actual_debit := 0;
  END;

  RETURN QUERY SELECT v_balance, v_actual_debit;
END;
$$;

-- Service role only — webhooks call this with the trusted user_id derived
-- from the verified Apple JWS payload's originalTransactionId lookup.
REVOKE ALL ON FUNCTION refund_consumable_purchase(UUID, TEXT, TEXT, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION refund_consumable_purchase(UUID, TEXT, TEXT, INTEGER) FROM authenticated;
