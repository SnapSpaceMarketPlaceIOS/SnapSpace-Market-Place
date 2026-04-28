-- ============================================================================
-- Migration 028 — Promo codes (signup-time wish bonuses for the redeemer)
--
-- Distinct from the existing user-to-user referral system in mig 012/013:
--   • Referrals credit the REFERRER (the inviter) with 2 wishes.
--   • Promo codes credit the REDEEMER (the new user) with N wishes.
--
-- Flow mirrors referrals so abuse vectors are the same:
--   1. New user signs up, types a code into the optional field on AuthScreen.
--   2. Client calls redeem_promo_code(user_id, code) — validates, creates a
--      `pending` redemption row, and bumps the code's usage counter.
--   3. When the user verifies their email, the existing
--      complete_referral_on_verify trigger ALSO calls
--      complete_promo_redemption(user_id) — which credits the wishes via
--      add_tokens with transaction_type='promo_code'.
--
-- Why pending-on-signup, complete-on-verify (vs instant credit at signup):
--   Same anti-abuse logic referrals use. Without email verification, an
--   attacker could create throwaway accounts and burn promo wishes. The
--   verification gate forces a unique working email per redemption.
--
-- One promo per user, ever (UNIQUE(user_id) on redemptions). Users who
-- already redeemed get ALREADY_REDEEMED back if they try again.
--
-- This migration is idempotent. CREATE OR REPLACE on functions, IF NOT
-- EXISTS on tables, ON CONFLICT DO NOTHING on the seed inserts.
-- ============================================================================

-- ── 1. promo_codes table (the catalog of redeemable codes) ─────────────────
CREATE TABLE IF NOT EXISTS public.promo_codes (
  code              TEXT PRIMARY KEY,
  wishes            INTEGER NOT NULL CHECK (wishes > 0),
  description       TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  -- NULL = unlimited redemptions. Set a cap if a code should burn out.
  max_redemptions   INTEGER,
  redemption_count  INTEGER NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- NULL = no expiry. Set if a code should auto-disable after a date.
  expires_at        TIMESTAMPTZ
);

ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;

-- Deny all direct client access. Codes are matched server-side via the
-- redeem_promo_code RPC (SECURITY DEFINER). If a user could SELECT this
-- table, they'd just read the code list and skip ever needing to know it.
DROP POLICY IF EXISTS "deny_all_promo_codes" ON public.promo_codes;
CREATE POLICY "deny_all_promo_codes"
  ON public.promo_codes FOR ALL
  USING (false) WITH CHECK (false);

-- ── 2. promo_code_redemptions table (one row per user, ever) ───────────────
CREATE TABLE IF NOT EXISTS public.promo_code_redemptions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  code            TEXT NOT NULL,
  wishes_granted  INTEGER NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending', 'completed')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at    TIMESTAMPTZ,
  -- One promo per user, ever. The UNIQUE here is also what
  -- redeem_promo_code's "ALREADY_REDEEMED" check relies on — the row
  -- exists or it doesn't.
  UNIQUE(user_id),
  FOREIGN KEY (code) REFERENCES public.promo_codes(code)
);

ALTER TABLE public.promo_code_redemptions ENABLE ROW LEVEL SECURITY;

-- Users can read their OWN redemption row (lets the client confirm
-- "you've claimed N wishes" after the fact). They cannot write — the
-- redeem_promo_code RPC (SECURITY DEFINER) is the only insert path.
DROP POLICY IF EXISTS "users_read_own_promo_redemption" ON public.promo_code_redemptions;
CREATE POLICY "users_read_own_promo_redemption"
  ON public.promo_code_redemptions FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "deny_client_writes_promo_redemption" ON public.promo_code_redemptions;
CREATE POLICY "deny_client_writes_promo_redemption"
  ON public.promo_code_redemptions FOR INSERT
  WITH CHECK (false);

DROP POLICY IF EXISTS "deny_client_updates_promo_redemption" ON public.promo_code_redemptions;
CREATE POLICY "deny_client_updates_promo_redemption"
  ON public.promo_code_redemptions FOR UPDATE
  USING (false) WITH CHECK (false);

-- ── 3. Extend token_transactions transaction_type to include 'promo_code' ──
-- The existing constraint (last set in mig 027) gates which type strings
-- the ledger accepts. Adding 'promo_code' so add_tokens can use it from
-- complete_promo_redemption below.
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
    'generation_failed',
    'promo_code'
  ));

-- ── 4. add_tokens — extend the "free wishes" type set ──────────────────────
-- The existing add_tokens (mig 012) buckets 'referral_bonus' under
-- total_gifted, everything else under total_purchased. Promo wishes are
-- gifted (not purchased), so route them to total_gifted too.
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

  -- Determine which counter to increment. Free-wish types (referral, promo,
  -- promotional, admin grants) all go to total_gifted; only IAP purchases
  -- and unknown types fall through to total_purchased.
  IF p_type IN ('referral_bonus', 'promo_code', 'promotional_bonus', 'admin_grant') THEN
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

-- ── 5. redeem_promo_code: validate + create pending redemption ─────────────
-- Called by the client right after signup with whatever the user typed in
-- the optional code field. Returns a structured result so the client can
-- toast appropriately.
--
-- Status strings:
--   PENDING_VERIFY  — code valid, redemption recorded, wishes credit on
--                     email verify
--   EMPTY_CODE      — input was empty / whitespace
--   INVALID_CODE    — no matching active+unexpired code
--   ALREADY_REDEEMED— this user has already redeemed any promo code
--   CODE_EXHAUSTED  — code's max_redemptions limit reached
--
-- Note: the function NEVER reveals what wishes amount a code grants until
-- after the user successfully redeems (via the wishes_pending return). A
-- caller can't probe codes by trying values and observing differential
-- error messages — every failure returns wishes_pending = 0.
CREATE OR REPLACE FUNCTION redeem_promo_code(
  p_user_id UUID,
  p_code    TEXT
)
RETURNS TABLE (
  success         BOOLEAN,
  wishes_pending  INTEGER,
  status          TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_normalized   TEXT;
  v_code_row     promo_codes%ROWTYPE;
  v_existing_id  UUID;
BEGIN
  -- Normalize: strip whitespace + uppercase. Stored codes are uppercase.
  v_normalized := UPPER(TRIM(COALESCE(p_code, '')));
  IF v_normalized = '' THEN
    RETURN QUERY SELECT FALSE, 0, 'EMPTY_CODE'::TEXT;
    RETURN;
  END IF;

  -- One promo per user, ever.
  SELECT id INTO v_existing_id
    FROM promo_code_redemptions
   WHERE user_id = p_user_id;
  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT FALSE, 0, 'ALREADY_REDEEMED'::TEXT;
    RETURN;
  END IF;

  -- Look up code (active + not expired).
  SELECT * INTO v_code_row
    FROM promo_codes
   WHERE code = v_normalized
     AND is_active = TRUE
     AND (expires_at IS NULL OR expires_at > NOW());
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 0, 'INVALID_CODE'::TEXT;
    RETURN;
  END IF;

  -- Check max redemptions.
  IF v_code_row.max_redemptions IS NOT NULL
     AND v_code_row.redemption_count >= v_code_row.max_redemptions THEN
    RETURN QUERY SELECT FALSE, 0, 'CODE_EXHAUSTED'::TEXT;
    RETURN;
  END IF;

  -- Record pending redemption + bump counter atomically.
  INSERT INTO promo_code_redemptions (user_id, code, wishes_granted, status)
    VALUES (p_user_id, v_code_row.code, v_code_row.wishes, 'pending');

  UPDATE promo_codes
     SET redemption_count = redemption_count + 1
   WHERE code = v_code_row.code;

  RETURN QUERY SELECT TRUE, v_code_row.wishes, 'PENDING_VERIFY'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION redeem_promo_code(UUID, TEXT) TO authenticated;

-- ── 6. complete_promo_redemption: credit wishes when email verified ────────
-- Called by the email-verify trigger (below) after complete_referral.
-- Idempotent — UNIQUE on token_transactions.reference_id (= 'promo_<id>')
-- prevents double-credit if the trigger somehow fires twice.
CREATE OR REPLACE FUNCTION complete_promo_redemption(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_redemption  promo_code_redemptions%ROWTYPE;
BEGIN
  SELECT * INTO v_redemption
    FROM promo_code_redemptions
   WHERE user_id = p_user_id
     AND status  = 'pending';

  IF NOT FOUND THEN
    RETURN; -- nothing to do
  END IF;

  -- Grant the wishes via add_tokens. Reference key prevents double-credit.
  PERFORM add_tokens(
    p_user_id,
    v_redemption.wishes_granted,
    'promo_code',
    'promo_' || v_redemption.id::TEXT,
    NULL
  );

  -- Mark the redemption complete.
  UPDATE promo_code_redemptions
     SET status       = 'completed',
         completed_at = NOW()
   WHERE id = v_redemption.id;
END;
$$;

GRANT EXECUTE ON FUNCTION complete_promo_redemption(UUID) TO authenticated;

-- ── 7. Update the email-verify trigger to ALSO complete promo redemptions ──
-- The trigger declarations from mig 013 keep referencing this function name,
-- so updating the function body via CREATE OR REPLACE is sufficient — no
-- need to touch the triggers themselves.
CREATE OR REPLACE FUNCTION public.complete_referral_on_verify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Fire on either NULL→TRUE or FALSE→TRUE. The trigger declarations in
  -- mig 013 already restrict invocation to the cases we care about, but
  -- this internal guard is defense-in-depth.
  IF NEW.email_verified = TRUE
     AND COALESCE(OLD.email_verified, FALSE) = FALSE THEN
    PERFORM complete_referral(NEW.id);
    PERFORM complete_promo_redemption(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- ── 8. Seed the two launch promo codes ─────────────────────────────────────
-- Generated 2026-04-28 with `tr -dc 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
-- < /dev/urandom | head -c 9` over an unambiguous-character alphabet
-- (no 0/O/1/I/L). 31^9 ≈ 2.6×10^13 possibilities — not brute-forceable
-- through a per-account redemption attempt. ON CONFLICT DO NOTHING keeps
-- this idempotent on re-runs of the migration.
INSERT INTO promo_codes (code, wishes, description, is_active)
VALUES ('HG-WZ8HQUFS9', 50, 'Launch promo — 50-wish bonus', TRUE)
ON CONFLICT (code) DO NOTHING;

INSERT INTO promo_codes (code, wishes, description, is_active)
VALUES ('HG-77M3D7RYV', 10, 'Welcome promo — 10-wish bonus', TRUE)
ON CONFLICT (code) DO NOTHING;
