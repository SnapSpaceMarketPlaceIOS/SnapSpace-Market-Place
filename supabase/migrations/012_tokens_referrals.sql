-- ============================================================
-- Migration 012: Token System & Referral Program
-- Adds consumable token balance, transaction ledger,
-- referral tracking, and supporting RPCs.
-- ============================================================

-- ── 1. user_tokens: per-user token balance ──────────────────────────────────

CREATE TABLE IF NOT EXISTS user_tokens (
  user_id         UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  balance         INTEGER     NOT NULL DEFAULT 0 CHECK (balance >= 0),
  total_purchased INTEGER     NOT NULL DEFAULT 0,
  total_used      INTEGER     NOT NULL DEFAULT 0,
  total_gifted    INTEGER     NOT NULL DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE user_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_tokens" ON user_tokens;
CREATE POLICY "users_read_own_tokens"
  ON user_tokens FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "service_manage_tokens" ON user_tokens;
CREATE POLICY "service_manage_tokens"
  ON user_tokens FOR ALL
  USING (true) WITH CHECK (true);

-- ── 2. token_transactions: ledger for audit + idempotency ───────────────────

CREATE TABLE IF NOT EXISTS token_transactions (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount           INTEGER     NOT NULL,
  balance_after    INTEGER     NOT NULL,
  transaction_type TEXT        NOT NULL CHECK (transaction_type IN (
    'purchase', 'generation', 'referral_bonus', 'admin_grant', 'refund'
  )),
  reference_id     TEXT,
  product_id       TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_tx_user
  ON token_transactions (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_token_tx_reference
  ON token_transactions (reference_id);

ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_tx" ON token_transactions;
CREATE POLICY "users_read_own_tx"
  ON token_transactions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "service_insert_tx" ON token_transactions;
CREATE POLICY "service_insert_tx"
  ON token_transactions FOR INSERT
  WITH CHECK (true);

-- ── 3. referral_code on profiles ────────────────────────────────────────────

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code VARCHAR(8) UNIQUE;

-- ── 4. referrals tracking table ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS referrals (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  referred_id   UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed')),
  tokens_awarded INTEGER   NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  UNIQUE(referred_id)
);

CREATE INDEX IF NOT EXISTS idx_referrals_referrer
  ON referrals (referrer_id, created_at DESC);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "users_read_own_referrals" ON referrals;
CREATE POLICY "users_read_own_referrals"
  ON referrals FOR SELECT
  USING (auth.uid() = referrer_id OR auth.uid() = referred_id);

DROP POLICY IF EXISTS "service_manage_referrals" ON referrals;
CREATE POLICY "service_manage_referrals"
  ON referrals FOR ALL
  USING (true) WITH CHECK (true);

-- ── 5. RPCs ─────────────────────────────────────────────────────────────────

-- get_token_balance: returns current balance (auto-creates row if missing)
CREATE OR REPLACE FUNCTION get_token_balance(p_user_id UUID)
RETURNS TABLE (
  balance         INTEGER,
  total_purchased INTEGER,
  total_used      INTEGER,
  total_gifted    INTEGER
)
LANGUAGE plpgsql AS $$
DECLARE
  v_row user_tokens%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM user_tokens WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO user_tokens (user_id, balance, total_purchased, total_used, total_gifted)
    VALUES (p_user_id, 0, 0, 0, 0)
    RETURNING * INTO v_row;
  END IF;

  RETURN QUERY SELECT v_row.balance, v_row.total_purchased, v_row.total_used, v_row.total_gifted;
END;
$$;

-- add_tokens: atomic credit + ledger entry (idempotent via reference_id)
CREATE OR REPLACE FUNCTION add_tokens(
  p_user_id      UUID,
  p_amount       INTEGER,
  p_type         TEXT,
  p_reference_id TEXT DEFAULT NULL,
  p_product_id   TEXT DEFAULT NULL
)
RETURNS TABLE (new_balance INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_balance INTEGER;
  v_col     TEXT;
BEGIN
  -- Idempotency: if reference_id already used, return current balance
  IF p_reference_id IS NOT NULL THEN
    PERFORM 1 FROM token_transactions WHERE reference_id = p_reference_id;
    IF FOUND THEN
      SELECT ut.balance INTO v_balance FROM user_tokens ut WHERE ut.user_id = p_user_id;
      RETURN QUERY SELECT COALESCE(v_balance, 0);
      RETURN;
    END IF;
  END IF;

  -- Determine which counter to increment
  IF p_type = 'referral_bonus' THEN
    v_col := 'total_gifted';
  ELSE
    v_col := 'total_purchased';
  END IF;

  -- Upsert token balance
  IF v_col = 'total_gifted' THEN
    INSERT INTO user_tokens (user_id, balance, total_gifted)
    VALUES (p_user_id, p_amount, p_amount)
    ON CONFLICT (user_id) DO UPDATE SET
      balance      = user_tokens.balance + p_amount,
      total_gifted = user_tokens.total_gifted + p_amount,
      updated_at   = NOW();
  ELSE
    INSERT INTO user_tokens (user_id, balance, total_purchased)
    VALUES (p_user_id, p_amount, p_amount)
    ON CONFLICT (user_id) DO UPDATE SET
      balance         = user_tokens.balance + p_amount,
      total_purchased = user_tokens.total_purchased + p_amount,
      updated_at      = NOW();
  END IF;

  SELECT ut.balance INTO v_balance FROM user_tokens ut WHERE ut.user_id = p_user_id;

  -- Ledger entry
  INSERT INTO token_transactions (user_id, amount, balance_after, transaction_type, reference_id, product_id)
  VALUES (p_user_id, p_amount, v_balance, p_type, p_reference_id, p_product_id);

  RETURN QUERY SELECT v_balance;
END;
$$;

-- deduct_token: atomic debit of 1 token (fails if balance is 0)
CREATE OR REPLACE FUNCTION deduct_token(p_user_id UUID)
RETURNS TABLE (balance INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  UPDATE user_tokens
  SET balance    = user_tokens.balance - 1,
      total_used = user_tokens.total_used + 1,
      updated_at = NOW()
  WHERE user_id = p_user_id AND user_tokens.balance > 0
  RETURNING user_tokens.balance INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Insufficient token balance';
  END IF;

  -- Ledger entry
  INSERT INTO token_transactions (user_id, amount, balance_after, transaction_type)
  VALUES (p_user_id, -1, v_balance, 'generation');

  RETURN QUERY SELECT v_balance;
END;
$$;

-- generate_referral_code: creates or returns existing 6-char code
CREATE OR REPLACE FUNCTION generate_referral_code(p_user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql AS $$
DECLARE
  v_code TEXT;
  v_attempts INTEGER := 0;
  v_chars TEXT := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- no I/O/0/1
BEGIN
  -- Return existing code if present
  SELECT referral_code INTO v_code FROM profiles WHERE id = p_user_id;
  IF v_code IS NOT NULL THEN
    RETURN v_code;
  END IF;

  -- Generate unique code with retry
  LOOP
    v_code := '';
    FOR i IN 1..6 LOOP
      v_code := v_code || substr(v_chars, floor(random() * length(v_chars) + 1)::int, 1);
    END LOOP;

    BEGIN
      UPDATE profiles SET referral_code = v_code WHERE id = p_user_id;
      RETURN v_code;
    EXCEPTION WHEN unique_violation THEN
      v_attempts := v_attempts + 1;
      IF v_attempts > 10 THEN
        RAISE EXCEPTION 'Could not generate unique referral code';
      END IF;
    END;
  END LOOP;
END;
$$;

-- apply_referral: link referred user to referrer (pending state)
CREATE OR REPLACE FUNCTION apply_referral(p_referred_id UUID, p_referral_code TEXT)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_referrer_id UUID;
BEGIN
  -- Look up referrer
  SELECT id INTO v_referrer_id FROM profiles WHERE referral_code = p_referral_code;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invalid referral code';
  END IF;

  -- No self-referral
  IF v_referrer_id = p_referred_id THEN
    RAISE EXCEPTION 'Cannot refer yourself';
  END IF;

  -- Insert (UNIQUE on referred_id prevents duplicates)
  INSERT INTO referrals (referrer_id, referred_id, status)
  VALUES (v_referrer_id, p_referred_id, 'pending');
END;
$$;

-- complete_referral: credit referrer with 2 tokens when referred user is verified
CREATE OR REPLACE FUNCTION complete_referral(p_referred_id UUID)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_referrer_id UUID;
  v_ref_id      UUID;
BEGIN
  -- Find pending referral for this user
  SELECT referrer_id, id INTO v_referrer_id, v_ref_id
  FROM referrals
  WHERE referred_id = p_referred_id AND status = 'pending'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN; -- No pending referral, silently do nothing
  END IF;

  -- Credit referrer with 2 tokens
  PERFORM add_tokens(v_referrer_id, 2, 'referral_bonus', 'referral_' || v_ref_id::TEXT, NULL);

  -- Mark referral as completed
  UPDATE referrals
  SET status = 'completed', tokens_awarded = 2, completed_at = NOW()
  WHERE id = v_ref_id;
END;
$$;
