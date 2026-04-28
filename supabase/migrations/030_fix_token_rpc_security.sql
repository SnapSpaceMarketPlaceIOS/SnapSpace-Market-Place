-- Migration 030: Fix token RPC security mode (Build 111 — wishes-counter sync bug)
--
-- Problem
-- =======
-- get_token_balance, deduct_token, refund_token were defined as the default
-- SECURITY INVOKER. When called from the client (anon/authenticated JWT),
-- they ran with the caller's privileges and respected RLS. Migration 024
-- later locked `user_tokens FOR ALL` to `service_role`, leaving only
-- `users_read_own_tokens FOR SELECT` for authenticated users.
--
-- That had three knock-on effects observed in production:
--
--   1) get_token_balance — the auto-create branch (`IF NOT FOUND THEN
--      INSERT INTO user_tokens…`) would raise an RLS error any time a
--      brand-new user's row didn't exist yet. The client's
--      fetchTokenBalance() catches the error and silently returns
--      `{ balance: 0 }`, so the paywall widget shows "Free Wishes / 5
--      remaining" forever — even after the user buys wishes.
--
--   2) deduct_token — UPDATE on user_tokens is service_role-only after
--      mig 024, so the UPDATE filtered to 0 rows, hit `IF NOT FOUND`,
--      and raised "Insufficient token balance" — even when the user had
--      8 wishes. (The path where this bites: HomeScreen.runGeneration
--      calls deductToken() on a paid-wish generation.)
--
--   3) refund_token — same UPDATE-from-authenticated problem. A failed
--      generation's refund silently no-ops. User is charged a wish for
--      a generation that didn't render.
--
-- Verified 2026-04-28 against the brand-new test account
-- test1248863@gmail.com (user_id 7b6a986b-6383-41b8-9eba-94b525455216):
-- DB row had `balance=8` after two successful $0.99 purchases (edge fn
-- credits worked because edge fn uses the service role). But the React
-- paywall widget rendered `tokenBalance=0`. Test 1 (get_token_balance
-- called as postgres) returned 8 — proving function logic is fine. Test 2
-- confirmed all four RPCs were SECURITY INVOKER. This migration converts
-- the three client-callable RPCs to SECURITY DEFINER and adds an explicit
-- ownership check so callers can only read/mutate their own row.
--
-- Why not just relax RLS instead?
-- ===============================
-- Migration 024's lockdown is correct. user_tokens is the source of truth
-- for paid IAP entitlement — letting an authenticated user UPDATE it
-- directly would let a malicious client INSERT or bump their own balance.
-- The right pattern is: keep RLS strict, and route legitimate writes
-- through SECURITY DEFINER functions that enforce their own contracts
-- (idempotency on `add_tokens`, balance-floor on `deduct_token`,
-- ownership on every read/write).
--
-- `add_tokens` is intentionally NOT changed. It's only ever called from
-- the edge function via the service role key. Service role bypasses RLS
-- already, so SECURITY INVOKER works correctly for that path. Promoting
-- it to SECURITY DEFINER without an ownership guard would expand the
-- attack surface unnecessarily — leave it INVOKER as a defense in depth.

-- ── 1. get_token_balance: read-only, ownership-guarded ─────────────────────
CREATE OR REPLACE FUNCTION get_token_balance(p_user_id UUID)
RETURNS TABLE (
  balance         INTEGER,
  total_purchased INTEGER,
  total_used      INTEGER,
  total_gifted    INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_row user_tokens%ROWTYPE;
BEGIN
  -- Ownership guard. service_role (used by edge functions) bypasses.
  -- authenticated users can only fetch their own balance.
  IF auth.role() != 'service_role' AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Forbidden: caller can only read their own token balance';
  END IF;

  SELECT * INTO v_row FROM user_tokens WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    -- Definer privilege bypasses the service_role-only INSERT lockdown
    -- in migration 024. Only used to lazily seed the row for a brand-new
    -- user — initial balance is 0, so no entitlement is created.
    INSERT INTO user_tokens (user_id, balance, total_purchased, total_used, total_gifted)
    VALUES (p_user_id, 0, 0, 0, 0)
    RETURNING * INTO v_row;
  END IF;

  RETURN QUERY SELECT v_row.balance, v_row.total_purchased, v_row.total_used, v_row.total_gifted;
END;
$$;

-- ── 2. deduct_token: atomic debit, ownership-guarded ───────────────────────
CREATE OR REPLACE FUNCTION deduct_token(p_user_id UUID)
RETURNS TABLE (balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- Ownership guard. service_role bypasses; authenticated callers can
  -- only spend wishes from their own balance.
  IF auth.role() != 'service_role' AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Forbidden: caller can only deduct from their own token balance';
  END IF;

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

-- ── 3. refund_token: re-credit a failed generation, ownership-guarded ─────
CREATE OR REPLACE FUNCTION refund_token(
  p_user_id      UUID,
  p_generation_id TEXT
)
RETURNS TABLE (new_balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_balance INTEGER;
BEGIN
  -- Ownership guard.
  IF auth.role() != 'service_role' AND auth.uid() != p_user_id THEN
    RAISE EXCEPTION 'Forbidden: caller can only refund to their own token balance';
  END IF;

  UPDATE user_tokens
  SET balance    = balance + 1,
      total_used = GREATEST(0, total_used - 1),
      updated_at = NOW()
  WHERE user_id  = p_user_id
  RETURNING balance INTO v_balance;

  IF v_balance IS NULL THEN
    INSERT INTO user_tokens (user_id, balance, total_purchased, updated_at)
    VALUES (p_user_id, 1, 0, NOW())
    RETURNING balance INTO v_balance;
  END IF;

  -- Idempotent ledger insert. UNIQUE(reference_id) prevents double-credit.
  BEGIN
    INSERT INTO token_transactions (
      user_id, amount, balance_after, transaction_type, reference_id
    ) VALUES (
      p_user_id, 1, v_balance, 'generation_failed',
      'refund-gen-' || p_generation_id
    );
  EXCEPTION WHEN unique_violation THEN
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

-- ── 4. Re-grant EXECUTE to authenticated ────────────────────────────────────
-- CREATE OR REPLACE preserves ACLs in most cases, but be explicit so a fresh
-- environment without prior grants doesn't silently lose the call path.
GRANT EXECUTE ON FUNCTION get_token_balance(UUID)        TO authenticated;
GRANT EXECUTE ON FUNCTION deduct_token(UUID)             TO authenticated;
GRANT EXECUTE ON FUNCTION refund_token(UUID, TEXT)       TO authenticated;
