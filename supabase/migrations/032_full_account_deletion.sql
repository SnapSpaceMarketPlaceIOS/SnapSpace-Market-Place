-- ─────────────────────────────────────────────────────────────────────────────
-- 032 — Full account deletion (Apple Guideline 5.1.1(v) compliance)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Build 133 security audit finding: the existing client-side deleteAccount()
-- in AuthContext.js deletes the profile row + storage objects, but does NOT
-- delete the underlying auth.users row. The email + auth metadata persist
-- in Supabase indefinitely.
--
-- Apple Guideline 5.1.1(v) requires apps to "fully delete an account,
-- including any associated personal data." Email is associated personal
-- data. Leaving it behind risks Apple review rejection.
--
-- Why an RPC instead of an edge function:
--   • Single round-trip from the client (one supabase.rpc call).
--   • No CORS / cold-start concerns.
--   • SECURITY DEFINER pattern is already used elsewhere in this schema
--     (migrations 019, 027, 030) — consistent with existing code.
--   • Cascade FKs from auth.users to public tables already exist
--     (migrations 001, 014, 022, 031) — deleting auth.users automatically
--     cleans up downstream rows. This RPC is the single point where the
--     cascade is triggered.
--
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.delete_my_account()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_uid UUID;
BEGIN
  -- Get the caller's UID. SECURITY DEFINER runs as the function owner
  -- (postgres), but auth.uid() returns the caller's UID from the JWT,
  -- not the function owner's. So this is safe — only the calling user's
  -- own row gets deleted.
  v_uid := auth.uid();

  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '42501';
  END IF;

  -- Delete from auth.users. Cascade FKs in public schema (profiles,
  -- user_designs, feature_requests, supplier_applications, ai_rate_limits,
  -- generation_errors, etc.) will fire automatically and clean up.
  --
  -- Note: storage objects (avatars/, room-uploads/) are NOT cascaded by
  -- auth.users delete — those need to be removed by the client-side
  -- deleteAccount() flow BEFORE calling this RPC. The current
  -- AuthContext.deleteAccount() does this in the right order:
  --   1. Delete public table rows (best-effort)
  --   2. Delete storage objects (best-effort)
  --   3. Call this RPC to nuke the auth.users row + cascade-clean
  --      anything missed in step 1
  --   4. signOut + local cache reset
  DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

-- Allow authenticated users to call this on themselves.
-- The function's auth.uid() check is the real guardrail; GRANT just
-- exposes the function to the PostgREST API surface.
GRANT EXECUTE ON FUNCTION public.delete_my_account() TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION (run manually after applying)
-- ─────────────────────────────────────────────────────────────────────────────
-- As an authenticated user (in their own session):
--   SELECT delete_my_account();
--   -- expected: returns void, then session becomes invalid (auth.users row gone)
--
-- As anonymous (no JWT):
--   SELECT delete_my_account();
--   -- expected: ERROR 42501 "Not authenticated"
--
-- After a successful delete_my_account() call:
--   SELECT * FROM auth.users WHERE id = '<that-uid>';   -- 0 rows
--   SELECT * FROM public.profiles WHERE id = '<that-uid>';   -- 0 rows (cascade)
--   SELECT * FROM public.user_designs WHERE user_id = '<that-uid>';  -- 0 rows (cascade)
