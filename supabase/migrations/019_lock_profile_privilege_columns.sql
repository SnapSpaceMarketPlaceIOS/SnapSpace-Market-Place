-- ─────────────────────────────────────────────────────────────────────────────
-- 019 — Lock privileged columns on public.profiles
-- ─────────────────────────────────────────────────────────────────────────────
-- SECURITY FIX: The original `profiles_update_own` policy (001_account_system.sql)
-- had no WITH CHECK clause and no column restriction. Any authenticated user could
-- PATCH /rest/v1/profiles?id=eq.<self> with { "role": "admin" } and self-promote
-- to admin, which then cascades to full read of every user's profile row via the
-- admin_profiles_select_all policy.
--
-- This migration adds a BEFORE UPDATE trigger that prevents any non-admin user
-- from modifying `role` or `is_verified_supplier` on any row (their own or others).
-- The SECURITY DEFINER admin RPCs (approve_supplier_application, suspend_supplier,
-- reject_supplier_application) still work because they are called BY an admin
-- session — auth.uid() inside a SECURITY DEFINER function returns the caller's UID,
-- not the function owner's, so the trigger's is_admin check passes.
--
-- We use a trigger rather than a pure WITH CHECK subquery because triggers are
-- enforced at the row level regardless of policy ordering / future policy edits,
-- and they emit a clear error to the client instead of a silent RLS denial.
--
-- Defense-in-depth: even if a future migration accidentally loosens RLS, the
-- trigger will still block escalation.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_is_admin BOOLEAN;
BEGIN
  -- Only act on UPDATE. INSERT is gated by default 'consumer' role + false flag.
  IF TG_OP <> 'UPDATE' THEN
    RETURN NEW;
  END IF;

  -- If neither privileged column is changing, nothing to check.
  IF NEW.role IS NOT DISTINCT FROM OLD.role
     AND NEW.is_verified_supplier IS NOT DISTINCT FROM OLD.is_verified_supplier
  THEN
    RETURN NEW;
  END IF;

  -- If service_role key is in use (backend / edge function), auth.uid() is NULL.
  -- We allow those paths because they're server-side and must be able to modify
  -- roles (e.g. seeding admin accounts, edge-function triggered grants).
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  -- A SECURITY DEFINER function called by an admin will still have auth.uid()
  -- equal to the admin's UID — so admin-authored mutations pass.
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  ) INTO v_caller_is_admin;

  IF v_caller_is_admin THEN
    RETURN NEW;
  END IF;

  -- Non-admin caller attempting to change role → reject.
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    RAISE EXCEPTION
      'Privilege escalation blocked: role cannot be modified by the row owner. Contact support for role changes.'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  IF NEW.is_verified_supplier IS DISTINCT FROM OLD.is_verified_supplier THEN
    RAISE EXCEPTION
      'Privilege escalation blocked: is_verified_supplier cannot be modified by the row owner.'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END;
$$;

-- Drop any prior version of the trigger (idempotent re-run safety)
DROP TRIGGER IF EXISTS prevent_profile_privilege_escalation_trigger ON public.profiles;

CREATE TRIGGER prevent_profile_privilege_escalation_trigger
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Also tighten the policy with an explicit WITH CHECK. This is belt-and-suspenders
-- with the trigger — if someone disables the trigger, the policy still holds the
-- line via the role/is_verified_supplier equality checks against the existing row.
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (
    auth.uid() = id
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
    AND is_verified_supplier = (
      SELECT is_verified_supplier FROM public.profiles WHERE id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- VERIFICATION QUERIES (run manually after applying this migration)
-- ─────────────────────────────────────────────────────────────────────────────
-- As a non-admin user:
--   UPDATE public.profiles SET role = 'admin' WHERE id = auth.uid();
--   -- expected: ERROR 42501 "Privilege escalation blocked: role cannot be modified..."
--
--   UPDATE public.profiles SET is_verified_supplier = true WHERE id = auth.uid();
--   -- expected: ERROR 42501 "Privilege escalation blocked: is_verified_supplier..."
--
--   UPDATE public.profiles SET full_name = 'New Name' WHERE id = auth.uid();
--   -- expected: success (non-privileged column)
--
-- As an admin (via supabase.rpc('approve_supplier_application', ...)):
--   -- expected: success, target user's role flips to 'supplier'
--
-- Via supabase service_role key (server-side):
--   UPDATE public.profiles SET role = 'admin' WHERE email = 'founder@snapspaceios.com';
--   -- expected: success (auth.uid() is NULL for service_role)
