-- ============================================================================
-- Migration 025: Lock admin/privileged RPCs against authenticated callers
-- ============================================================================
--
-- Second critical class discovered in the Build 69 security audit:
--
-- Several RPCs take an arbitrary p_user_id parameter AND are either
-- SECURITY DEFINER or operate on tables that the audit-024 migration
-- just locked down. Without auth.uid() guards inside the function body,
-- an authenticated attacker can still call them via PostgREST
-- (supabase.rpc('funcname', { p_user_id: anyone })) and mutate another
-- user's state. Several are not intended to be client-callable at all —
-- they're internal helpers for edge functions running as service_role.
--
-- Strategy:
--   A. For RPCs that the client legitimately calls on its own behalf:
--      add "IF p_user_id <> auth.uid() THEN RAISE EXCEPTION" at the top.
--      Keep EXECUTE granted to authenticated.
--   B. For RPCs that only edge functions should call (billing, rate
--      limit, admin grants): REVOKE EXECUTE FROM authenticated / PUBLIC.
--      service_role keeps access automatically.
--
-- Each fixed RPC is individually listed below with its category and
-- reasoning. CREATE OR REPLACE preserves function signatures so existing
-- callers don't break.
-- ============================================================================

-- ── A. RPCs client calls on OWN behalf — add auth.uid() = p_user_id guard ──

-- initialize_user_quota: called from AuthContext after signUp() to ensure
-- a fresh-account row. Should never be called for a different user_id.
CREATE OR REPLACE FUNCTION public.initialize_user_quota(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Build 69 Commit H: prevent caller from resetting another user's quota.
  -- Previously an authenticated attacker could call
  --   supabase.rpc('initialize_user_quota', { p_user_id: auth.uid() })
  -- after every generation to reset their free-tier counter to 0 and get
  -- unlimited generations. The ON CONFLICT UPDATE branch below still
  -- applies — the guard just restricts WHICH user_id is legal.
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'initialize_user_quota: caller % may not initialize quota for %',
      auth.uid(), p_user_id
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

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

-- increment_generation_count: called from SubscriptionContext.recordGeneration().
-- Must be SECURITY DEFINER so it can bypass RLS on user_generation_quota
-- (which only has SELECT policy for owners). Previously ran as caller and
-- likely worked only because of permissive service_* policies that 024 just
-- locked. Adding SECURITY DEFINER + auth guard is the correct combo.
CREATE OR REPLACE FUNCTION public.increment_generation_count(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'increment_generation_count: caller % may not increment quota for %',
      auth.uid(), p_user_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO user_generation_quota (user_id, generations_used, quota_limit)
  VALUES (p_user_id, 1, 5)
  ON CONFLICT (user_id) DO UPDATE
  SET generations_used = user_generation_quota.generations_used + 1,
      updated_at = NOW();
END;
$$;

-- get_user_quota: read-only lookup but auto-creates a row on first call.
-- Client calls this on app boot. Add guard for symmetry.
CREATE OR REPLACE FUNCTION public.get_user_quota(p_user_id UUID)
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_record user_generation_quota%ROWTYPE;
  v_today  DATE := CURRENT_DATE;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'get_user_quota: caller % may not read quota for %',
      auth.uid(), p_user_id
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_record FROM user_generation_quota WHERE user_id = p_user_id;

  IF NOT FOUND THEN
    INSERT INTO user_generation_quota (user_id, tier, quota_limit, generations_used, quota_reset_date, subscription_status)
    VALUES (p_user_id, 'free', 5, 0, NULL, 'none')
    RETURNING * INTO v_record;
  END IF;

  IF v_record.subscription_status = 'active'
     AND v_record.subscription_expires_at IS NOT NULL
     AND v_record.subscription_expires_at < NOW() THEN
    UPDATE user_generation_quota
    SET tier = 'free', quota_limit = 5, subscription_status = 'expired',
        subscription_product_id = NULL, quota_reset_date = NULL, updated_at = NOW()
    WHERE user_id = p_user_id RETURNING * INTO v_record;
  END IF;

  IF v_record.tier != 'free' AND v_record.quota_reset_date IS NOT NULL
     AND v_today >= v_record.quota_reset_date THEN
    UPDATE user_generation_quota
    SET generations_used = 0,
        quota_reset_date = DATE_TRUNC('month', v_today)::DATE + INTERVAL '1 month',
        updated_at = NOW()
    WHERE user_id = p_user_id RETURNING * INTO v_record;
  END IF;

  RETURN QUERY SELECT
    v_record.tier, v_record.quota_limit, v_record.generations_used,
    CASE WHEN v_record.quota_limit = -1 THEN 999
         ELSE GREATEST(0, v_record.quota_limit - v_record.generations_used) END,
    CASE WHEN v_record.quota_limit = -1 THEN TRUE
         ELSE v_record.generations_used < v_record.quota_limit END,
    v_record.quota_reset_date,
    v_record.subscription_status,
    v_record.subscription_expires_at;
END;
$$;

-- ── B. Server-only RPCs — REVOKE EXECUTE from authenticated/PUBLIC ──

-- check_ai_rate_limit: only edge functions (ai-proxy, generate-with-products)
-- should ever call this. A client-level call is meaningless and was an
-- attack vector (pass p_cooldown_ms=0, p_hourly_cap=999999 to wipe out the
-- rate window for yourself or another user).
-- Migration 023 granted EXECUTE to both service_role AND authenticated;
-- the second grant is the bug. Revoke it.
REVOKE EXECUTE ON FUNCTION public.check_ai_rate_limit(UUID, INT, INT) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.check_ai_rate_limit(UUID, INT, INT) FROM PUBLIC;
-- service_role retains access via the migration 023 grant.

-- activate_subscription: called ONLY by validate-apple-receipt edge fn after
-- signature + transaction_id validation. Direct client call is a trivial
-- premium-tier exploit.
REVOKE EXECUTE ON FUNCTION public.activate_subscription(
  UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT
) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.activate_subscription(
  UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, TEXT, TEXT
) FROM PUBLIC;

-- expire_subscription / add_tokens / apply_referral: these helpers may
-- or may not exist in all environments, and where they do the signatures
-- may not match a hardcoded REVOKE. A dynamic lookup handles both: it
-- iterates every overload of the target name under the public schema,
-- revokes EXECUTE from authenticated + PUBLIC on each by its real
-- argument list, and is a no-op when no function matches. Silent on
-- absence, correct on presence, safe to re-run.
DO $$
DECLARE
  fn RECORD;
BEGIN
  FOR fn IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('expire_subscription', 'add_tokens', 'apply_referral')
  LOOP
    EXECUTE format(
      'REVOKE EXECUTE ON FUNCTION %s FROM authenticated, PUBLIC',
      fn.sig
    );
  END LOOP;
END$$;

-- Re-grant EXECUTE on the guarded RPCs (A group) to authenticated.
-- CREATE OR REPLACE preserves existing grants, but we restate them to be
-- explicit about the intent.
GRANT EXECUTE ON FUNCTION public.initialize_user_quota(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_generation_count(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_quota(UUID) TO authenticated;

-- ── Verification probe (run manually post-deploy) ──────────────────────────
-- From an authenticated session, as user X:
--   SELECT public.initialize_user_quota('<different-uuid>');
-- Expected: ERROR: initialize_user_quota: caller X may not initialize quota for <different-uuid>
--
-- Same session:
--   SELECT public.check_ai_rate_limit(auth.uid(), 0, 999999);
-- Expected: ERROR: permission denied for function check_ai_rate_limit
--
-- Same session:
--   SELECT public.activate_subscription(auth.uid(), 'snapspace_premium_monthly', ...);
-- Expected: ERROR: permission denied for function activate_subscription
