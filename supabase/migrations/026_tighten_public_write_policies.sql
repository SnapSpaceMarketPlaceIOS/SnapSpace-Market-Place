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

-- ── 1. feature_requests: require auth.uid() = user_id ──────────────────────
DROP POLICY IF EXISTS "Users can insert own requests" ON public.feature_requests;
CREATE POLICY "Users can insert own requests"
  ON public.feature_requests FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND auth.uid() = user_id);

-- ── 2. product_views: remove wide-open INSERT, keep RPC path ───────────────
-- record_product_view() is SECURITY DEFINER (see migration 004) so revoking
-- direct client INSERT does NOT break the analytics pipeline. Clients call
-- supabase.rpc('record_product_view', {...}) which works unchanged.
DROP POLICY IF EXISTS "product_views_insert_all" ON public.product_views;
-- No replacement policy — with RLS enabled and no INSERT policy, direct
-- INSERTs from authenticated / anon roles are denied. service_role
-- retains INSERT via bypass-RLS and record_product_view runs as DEFINER.

-- ── 3. generation_log: revoke direct client INSERT ─────────────────────────
-- The edge function (generate-with-products) writes log rows using
-- service_role. Client-side SubscriptionContext does NOT need to insert
-- here — remove the client-facing policy. Client SELECT remains so users
-- can see their own generation history.
DROP POLICY IF EXISTS "generation_log_insert_own" ON public.generation_log;
-- No replacement policy. service_role continues to bypass RLS; the client
-- simply cannot write via PostgREST.

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
