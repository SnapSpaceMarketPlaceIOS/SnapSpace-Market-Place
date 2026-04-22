-- ============================================================================
-- Migration 026: Tighten overly-permissive INSERT policies
-- ============================================================================
--
-- Third bucket from the Build 69 security audit — tables that had INSERT
-- policies wide open to anonymous or authenticated callers beyond what
-- the feature actually needs. Each fix funnels writes through an existing
-- SECURITY DEFINER RPC (which itself carries the proper auth checks).
--
-- 1. public.feature_requests:
--    WITH CHECK (auth.uid() = user_id OR user_id IS NULL) allowed an
--    authenticated user to insert rows attributed to NULL, bypassing
--    attribution. Spam vector plus muddies abuse tracking. Tighten to
--    require auth.uid() match.
--
-- 2. public.product_views:
--    WITH CHECK (TRUE) allowed ANY role (including anon) to spam rows,
--    inflating or deflating supplier analytics. Force writes through
--    record_product_view() RPC which runs SECURITY DEFINER and can be
--    hardened further if abuse shows up.
--
-- 3. public.generation_log:
--    INSERT policy required auth.uid() = user_id but direct client INSERTs
--    bypass the edge function's cost-accounting path. Only service_role
--    (edge functions) should write here. Revoke direct client INSERT.
-- ============================================================================

-- Each table-level change below is wrapped in a "table exists" guard so
-- the migration is safe to run regardless of which environment the db is
-- in (prod / staging / fresh local). If a table is missing, we note it
-- and move on — the security impact is moot when the attack surface
-- doesn't exist. If a table is present, the policy change applies.
DO $$
BEGIN
  -- ── 1. feature_requests: require auth.uid() = user_id ────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'feature_requests') THEN
    EXECUTE 'DROP POLICY IF EXISTS "Users can insert own requests" ON public.feature_requests';
    EXECUTE $POL$
      CREATE POLICY "Users can insert own requests"
        ON public.feature_requests FOR INSERT
        WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id)
    $POL$;
  ELSE
    RAISE NOTICE 'skipping feature_requests: table not present in this environment';
  END IF;

  -- ── 2. product_views: drop wide-open INSERT, keep RPC path ───────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'product_views') THEN
    EXECUTE 'DROP POLICY IF EXISTS "product_views_insert_all" ON public.product_views';
  ELSE
    RAISE NOTICE 'skipping product_views: table not present in this environment';
  END IF;

  -- ── 3. generation_log: drop direct client INSERT ─────────────────────────
  IF EXISTS (SELECT 1 FROM information_schema.tables
             WHERE table_schema = 'public' AND table_name = 'generation_log') THEN
    EXECUTE 'DROP POLICY IF EXISTS "generation_log_insert_own" ON public.generation_log';
  ELSE
    RAISE NOTICE 'skipping generation_log: table not present in this environment';
  END IF;
END$$;

-- ── Verification probe (run manually post-deploy) ──────────────────────────
-- As an authenticated user:
--   INSERT INTO public.feature_requests (title, category, user_id)
--     VALUES ('test', 'general', NULL);
-- Expected: row-level security policy violation.
--
--   INSERT INTO public.product_views (product_id, supplier_id)
--     VALUES ('<any>', '<any>');
-- Expected: denied.
--
--   SELECT public.record_product_view('<prod>', '<supplier>', auth.uid());
-- Expected: succeeds (RPC path remains open).
