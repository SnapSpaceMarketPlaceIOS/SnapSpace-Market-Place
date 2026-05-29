-- ============================================================================
-- Migration 034: Close the free-tier "self-reset" generation exploit in
--                initialize_user_quota
-- ============================================================================
--
-- Discovered during the Build 151 pre-publish auth / onboarding audit.
--
-- BACKGROUND
-- ----------
-- initialize_user_quota(p_user_id) is called once from the client
-- (AuthContext.signUp -> supabase.rpc('initialize_user_quota', ...)) right
-- after a successful sign-up, to guarantee a brand-new account starts at
-- generations_used = 0.
--
-- Migration 025 added an ownership guard (auth.uid() = p_user_id) so a
-- caller can no longer reset SOMEONE ELSE'S quota. But it left the
-- ON CONFLICT branch intact:
--
--     ON CONFLICT (user_id) DO UPDATE SET
--       generations_used = CASE WHEN tier = 'free' THEN 0 ELSE ... END
--
-- That means an EXISTING free-tier user can call the RPC on their OWN id
-- at any time and reset their own free-generation counter back to 0:
--
--     supabase.rpc('initialize_user_quota', { p_user_id: <self> })
--
-- The ownership guard passes (it is their own id), the conflict branch
-- fires, generations_used -> 0, and they get another batch of free
-- generations. Repeat indefinitely -> unlimited free AI renders, each of
-- which costs us a paid FAL call. generations_used IS the enforced
-- free-tier gate: generate-with-products checks get_user_quota().can_generate,
-- which is driven by generations_used vs quota_limit.
--
-- FIX
-- ---
-- Change the conflict action to DO NOTHING. A genuinely fresh signup has
-- no existing row, so the INSERT still seeds generations_used = 0 exactly
-- as intended. An already-existing row is now left untouched -- there is no
-- longer any code path by which a client call can zero out a live counter.
--
-- This does NOT rely on initialize_user_quota to create the row in any
-- other scenario: get_user_quota auto-creates a 0 row on first read, and
-- increment_generation_count upserts the row on first generation. The row
-- lifecycle is therefore safe without the reset-on-conflict behavior.
--
-- The auth.uid() ownership guard from 025 is retained as defense in depth.
-- Signature, SECURITY DEFINER, search_path, and the authenticated grant are
-- all preserved so existing callers keep working. Idempotent + re-runnable.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.initialize_user_quota(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Retained from migration 025: a caller may only initialize their own
  -- quota row. With DO NOTHING below this is now belt-and-suspenders, but
  -- it keeps the function from being usable as a cross-user probe.
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'initialize_user_quota: caller % may not initialize quota for %',
      auth.uid(), p_user_id
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  -- Fresh accounts: seed a free-tier row at 0. Existing rows: leave them
  -- exactly as they are. The previous ON CONFLICT ... SET generations_used
  -- = 0 branch was a self-serve "reset my free wishes" exploit (Build 151
  -- audit) and is removed here. Row creation in every other case is handled
  -- by get_user_quota (auto-create on read) and increment_generation_count
  -- (upsert on first generation), so DO NOTHING is safe.
  INSERT INTO user_generation_quota (
    user_id, tier, quota_limit, generations_used,
    quota_reset_date, subscription_status, updated_at
  )
  VALUES (p_user_id, 'free', 5, 0, NULL, 'none', NOW())
  ON CONFLICT (user_id) DO NOTHING;
END;
$$;

-- CREATE OR REPLACE preserves the existing grant; restated for clarity.
GRANT EXECUTE ON FUNCTION public.initialize_user_quota(UUID) TO authenticated;

-- ── Verification probe (run manually post-deploy) ──────────────────────────
-- From an authenticated session as a user who has already used some
-- generations (generations_used > 0):
--   SELECT public.initialize_user_quota(auth.uid());
--   SELECT generations_used FROM user_generation_quota WHERE user_id = auth.uid();
-- Expected: generations_used UNCHANGED -- the call is now a no-op for an
-- existing row. Pre-034 this would have reset it to 0.
--
-- Cross-user attempt still blocked by the retained guard:
--   SELECT public.initialize_user_quota('<different-uuid>');
-- Expected: ERROR: initialize_user_quota: caller <X> may not initialize quota for <different-uuid>
