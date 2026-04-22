-- ============================================================================
-- Migration 024: Lock service_* RLS policies to service_role only
-- ============================================================================
--
-- CRITICAL vulnerability discovered in the Build 69 security audit:
--
-- Migrations 010 (subscription_events) and 012 (user_tokens,
-- token_transactions, referrals) created RLS policies with the naming
-- convention "service_*" intended to allow edge functions (running as
-- service_role) to write to these tables. But the policies were defined
-- as USING (true) WITH CHECK (true), which allows ALL roles — including
-- any authenticated user — to INSERT/UPDATE rows directly via PostgREST.
--
-- Concrete exploits this closes:
--   1. Any authenticated user could run
--        UPDATE public.user_tokens SET balance = 999999 WHERE user_id = auth.uid()
--      directly via the REST endpoint, bypassing the deduct_token /
--      add_tokens RPCs and the referral / share-bonus idempotency ledger.
--   2. Same user could INSERT fake token_transactions rows to make the
--      ledger agree with the forged balance.
--   3. Same user could INSERT subscription_events to fake a purchase.
--   4. Same user could INSERT referrals rows marking themselves as
--      referred (skipping the two-sided grant flow).
--
-- Fix: replace every USING(true)/WITH CHECK(true) with an explicit
-- auth.role() = 'service_role' check. Compare with the correct pattern
-- in migration 005_email_notifications.sql:52-53. Edge functions call
-- these tables with SUPABASE_SERVICE_ROLE_KEY, which sets the role to
-- service_role in the Postgres session — they keep full access. Regular
-- signed-in users (role = 'authenticated') get denied. Anonymous users
-- (role = 'anon') were already denied and remain so.
--
-- DROP + CREATE is necessary because CREATE POLICY is not idempotent
-- when the policy definition changes. Names are preserved.
-- ============================================================================

-- ── user_tokens ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "service_manage_tokens" ON public.user_tokens;
CREATE POLICY "service_manage_tokens"
  ON public.user_tokens FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── token_transactions ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "service_insert_tx" ON public.token_transactions;
CREATE POLICY "service_insert_tx"
  ON public.token_transactions FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ── referrals ───────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "service_manage_referrals" ON public.referrals;
CREATE POLICY "service_manage_referrals"
  ON public.referrals FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── subscription_events ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "service_insert_events" ON public.subscription_events;
CREATE POLICY "service_insert_events"
  ON public.subscription_events FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

-- ── Verification probe (run manually post-deploy to confirm) ────────────────
-- From an authenticated session (NOT service_role):
--   INSERT INTO public.user_tokens (user_id, balance) VALUES (auth.uid(), 999);
-- Expected: 403 / "new row violates row-level security policy".
--
-- From a service_role session (edge function context):
--   Same statement. Expected: succeeds.
