-- ============================================================
-- Migration 012: Token System + Referral System
-- Adds consumable token balance, transaction ledger,
-- referral tracking, and rate limiting for generations.
-- ============================================================

-- ── 1. Token balance table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS user_tokens (
  user_id         UUID PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  balance         INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_purchased INTEGER NOT NULL DEFAULT 0,
  total_used      INTEGER NOT NULL DEFAULT 0,
  total_gifted    INTEGER NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_tokens" ON user_tokens;
CREATE POLICY "users_read_own_tokens"
  ON user_tokens FOR SELECT
  USING (auth.uid() = user_id);

-- ── 2. Token transaction ledger ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS token_transactions (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount           INTEGER NOT NULL,       -- positive = credit, negative = debit
  balance_after    INTEGER NOT NULL,
  transaction_type TEXT NOT NULL,           -- 'purchase', 'generation', 'referral_bonus', 'refund'
  reference_id     TEXT,                    -- Apple transactionId or generation ID (idempotency key)
  product_id       TEXT,                    -- e.g. 'snapspace_tokens_10'
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_tx_user_created
  ON token_transactions (user_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_token_tx_reference_id
  ON token_transactions (reference_id) WHERE reference_id IS NOT NULL;

ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_token_tx" ON token_transactions;
CREATE POLICY "users_read_own_token_tx"
  ON token_transactions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "service_insert_token_tx" ON token_transactions;
CREATE POLICY "service_insert_token_tx"
  ON token_transactions FOR INSERT
  WITH CHECK (true);

-- ── 3. Referral tracking table ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referrals (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id     UUID NOT NULL UNIQUE REFERENCES profiles(id) ON DELETE CASCADE,
  status          TEXT NOT NULL DEFAULT 'pending',   -- 'pending', 'completed'
  tokens_awarded  INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer
  ON referrals (referrer_id);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_referrals" ON referrals;
CREATE POLICY "users_read_own_referrals"
  ON referrals FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

DROP POLICY IF EXISTS "service_manage_referrals" ON referrals;
CREATE POLICY "service_manage_referrals"
  ON referrals FOR ALL
  WITH CHECK (true);

-- ── 4. Add referral_code column to profiles ─────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(8) UNIQUE;

-- ── 5. Rate limiting table ──────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS generation_rate_limits (
  user_id       UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  window_start  TIMESTAMPTZ NOT NULL,
  gen_count     INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, window_start)
);

ALTER TABLE generation_rate_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_rate_limits" ON generation_rate_limits;
CREATE POLICY "users_read_own_rate_limits"
  ON generation_rate_limits FOR SELECT
  USING (auth.uid() = user_id);

-- ── 6. RPC: get_token_balance ───────────────────────────────────────────────

CREATE OR REPLACE FUNCTION get_token_balance(p_user_id UUID)
RETURNS TABLE (
  balance         INTEGER,
  total_purchased INTEGER,
  total_used      INTEGER,
  total_gifted    INTEGER
)
LANGUAGE plpgsql AS $$
BEGIN
  -- Auto-create row if missing
  INSERT INTO user_tokens (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  RETURN QUERY
  SELECT ut.balance, ut.total_purchased, ut.total_used, ut.total_gifted
  FROM user_tokens ut
  WHERE ut.user_id = p_user_id;
END;
$$;

-- ── 7. RPC: add_tokens (with idempotency via reference_id) ──────────────────

CREATE OR REPLACE FUNCTION add_tokens(
  p_user_id      UUID,
  p_amount       INTEGER,
  p_type         TEXT,           -- 'purchase', 'referral_bonus', 'refund'
  p_reference_id TEXT DEFAULT NULL,
  p_product_id   TEXT DEFAULT NULL
)
RETURNS TABLE (balance INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- Idempotency check: if reference_id already used, return current balance
  IF p_reference_id IS NOT NULL THEN
    PERFORM 1 FROM token_transactions WHERE reference_id = p_reference_id;
    IF FOUND THEN
      SELECT ut.balance INTO v_balance FROM user_tokens ut WHERE ut.user_id = p_user_id;
      RETURN QUERY SELECT COALESCE(v_balance, 0);
      RETURN;
    END IF;
  END IF;

  -- Ensure user_tokens row exists
  INSERT INTO user_tokens (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  -- Credit tokens atomically
  UPDATE user_tokens
  SET balance = user_tokens.balance + p_amount,
      total_purchased = CASE WHEN p_type = 'purchase' THEN user_tokens.total_purchased + p_amount ELSE user_tokens.total_purchased END,
      total_gifted = CASE WHEN p_type IN ('referral_bonus', 'refund') THEN user_tokens.total_gifted + p_amount ELSE user_tokens.total_gifted END,
      updated_at = NOW()
  WHERE user_id = p_user_id
  RETURNING user_tokens.balance INTO v_balance;

  -- Record transaction in ledger
  INSERT INTO token_transactions (user_id, amount, balance_after, transaction_type, reference_id, product_id)
  VALUES (p_user_id, p_amount, v_balance, p_type, p_reference_id, p_product_id);

  RETURN QUERY SELECT v_balance;
END;
$$;

-- ── 8. RPC: deduct_token (atomic, fails if balance = 0) ─────────────────────

CREATE OR REPLACE FUNCTION deduct_token(p_user_id UUID)
RETURNS TABLE (balance INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  UPDATE user_tokens
  SET balance = user_tokens.balance - 1,
      total_used = user_tokens.total_used + 1,
      updated_at = NOW()
  WHERE user_id = p_user_id AND user_tokens.balance > 0
  RETURNING user_tokens.balance INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient token balance';
  END IF;

  -- Record debit in ledger
  INSERT INTO token_transactions (user_id, amount, balance_after, transaction_type)
  VALUES (p_user_id, -1, v_balance, 'generation');

  RETURN QUERY SELECT v_balance;
END;
$$;

-- ── 9. RPC: generate_referral_code ──────────────────────────────────────────

CREATE OR REPLACE FUNCTION generate_referral_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_code TEXT;
  v_existing TEXT;
BEGIN
  -- Return existing code if already set
  SELECT referral_code INTO v_existing FROM profiles WHERE id = p_user_id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  -- Generate unique 6-char alphanumeric code
  LOOP
    v_code := UPPER(SUBSTR(MD5(gen_random_uuid()::TEXT), 1, 6));
    BEGIN
      UPDATE profiles SET referral_code = v_code WHERE id = p_user_id;
      EXIT; -- success
    EXCEPTION WHEN unique_violation THEN
      -- collision — retry with new code
      CONTINUE;
    END;
  END LOOP;

  RETURN v_code;
END;
$$;

-- ── 10. RPC: apply_referral ─────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION apply_referral(p_referred_id UUID, p_referral_code TEXT)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_referrer_id UUID;
BEGIN
  -- Look up referrer by code
  SELECT id INTO v_referrer_id FROM profiles WHERE referral_code = p_referral_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid referral code';
  END IF;

  -- Can't refer yourself
  IF v_referrer_id = p_referred_id THEN
    RAISE EXCEPTION 'Cannot use your own referral code';
  END IF;

  -- Insert pending referral (referred_id is UNIQUE — each user referred once)
  INSERT INTO referrals (referrer_id, referred_id, status)
  VALUES (v_referrer_id, p_referred_id, 'pending');
END;
$$;

-- ── 11. RPC: complete_referral (credits referrer with 2 tokens) ─────────────

CREATE OR REPLACE FUNCTION complete_referral(p_referred_id UUID)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_referrer_id UUID;
  v_referral_id UUID;
BEGIN
  -- Find the pending referral
  SELECT id, referrer_id INTO v_referral_id, v_referrer_id
  FROM referrals
  WHERE referred_id = p_referred_id AND status = 'pending';

  IF NOT FOUND THEN
    RETURN; -- no pending referral — silently do nothing
  END IF;

  -- Credit referrer with 2 tokens
  PERFORM add_tokens(v_referrer_id, 2, 'referral_bonus', 'referral_' || v_referral_id::TEXT);

  -- Mark referral as completed
  UPDATE referrals
  SET status = 'completed', tokens_awarded = 2, completed_at = NOW()
  WHERE id = v_referral_id;
END;
$$;

-- ── 12. RPC: check_rate_limit (max 20 generations per rolling hour) ─────────

CREATE OR REPLACE FUNCTION check_generation_rate_limit(p_user_id UUID)
RETURNS TABLE (allowed BOOLEAN, current_count INTEGER, max_per_hour INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_window TIMESTAMPTZ;
  v_count INTEGER;
  v_max INTEGER := 20; -- max generations per hour
BEGIN
  -- Use 1-hour window aligned to the hour
  v_window := DATE_TRUNC('hour', NOW());

  -- Upsert and get current count
  INSERT INTO generation_rate_limits (user_id, window_start, gen_count)
  VALUES (p_user_id, v_window, 0)
  ON CONFLICT (user_id, window_start) DO NOTHING;

  SELECT gen_count INTO v_count
  FROM generation_rate_limits
  WHERE user_id = p_user_id AND window_start = v_window;

  RETURN QUERY SELECT (v_count < v_max), v_count, v_max;
END;
$$;

-- ── 13. RPC: record_generation_rate_limit ───────────────────────────────────

CREATE OR REPLACE FUNCTION record_generation_rate_limit(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_window TIMESTAMPTZ;
BEGIN
  v_window := DATE_TRUNC('hour', NOW());

  INSERT INTO generation_rate_limits (user_id, window_start, gen_count)
  VALUES (p_user_id, v_window, 1)
  ON CONFLICT (user_id, window_start)
  DO UPDATE SET gen_count = generation_rate_limits.gen_count + 1;

  -- Clean up old windows (older than 2 hours)
  DELETE FROM generation_rate_limits
  WHERE user_id = p_user_id AND window_start < NOW() - INTERVAL '2 hours';
END;
$$;
