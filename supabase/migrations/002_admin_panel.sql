-- SnapSpace Marketplace — Admin Panel Policies & RPCs
-- Run this AFTER 001_account_system.sql in your Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- Helper: check if the calling user is an admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- ADMIN RLS POLICIES
-- Allow admins to read and act on all rows
-- ─────────────────────────────────────────────────────────────────────────────

-- Admins: read all profiles
CREATE POLICY "admin_profiles_select_all"
  ON public.profiles FOR SELECT
  USING (public.is_admin());

-- Admins: update any profile (for role changes on approval)
CREATE POLICY "admin_profiles_update_all"
  ON public.profiles FOR UPDATE
  USING (public.is_admin());

-- Admins: read all supplier applications
CREATE POLICY "admin_applications_select_all"
  ON public.supplier_applications FOR SELECT
  USING (public.is_admin());

-- Admins: update any application (approve / reject / suspend)
CREATE POLICY "admin_applications_update_all"
  ON public.supplier_applications FOR UPDATE
  USING (public.is_admin());

-- Admins: create supplier_profiles on approval
CREATE POLICY "admin_supplier_profiles_insert"
  ON public.supplier_profiles FOR INSERT
  WITH CHECK (public.is_admin());

-- Admins: update any supplier profile (e.g. suspension)
CREATE POLICY "admin_supplier_profiles_update"
  ON public.supplier_profiles FOR UPDATE
  USING (public.is_admin());

-- Admins: insert audit log entries
CREATE POLICY "admin_audit_log_insert"
  ON public.audit_log FOR INSERT
  WITH CHECK (public.is_admin());

-- Admins: read all audit log entries
CREATE POLICY "admin_audit_log_select"
  ON public.audit_log FOR SELECT
  USING (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: approve_supplier_application
-- Atomic transaction: updates application, upgrades user role,
-- creates supplier_profiles, logs action.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.approve_supplier_application(
  application_id UUID,
  admin_id       UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app     public.supplier_applications%ROWTYPE;
  v_slug    TEXT;
BEGIN
  -- Guard: only admins can call this
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  -- Fetch the application
  SELECT * INTO v_app
  FROM public.supplier_applications
  WHERE id = application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  IF v_app.status != 'pending' THEN
    RAISE EXCEPTION 'Application is not in pending status (current: %)', v_app.status;
  END IF;

  -- 1. Update application
  UPDATE public.supplier_applications
  SET
    status      = 'approved',
    reviewed_at = NOW(),
    reviewed_by = admin_id
  WHERE id = application_id;

  -- 2. Upgrade user role + grant badge
  UPDATE public.profiles
  SET
    role                 = 'supplier',
    is_verified_supplier = TRUE,
    updated_at           = NOW()
  WHERE id = v_app.user_id;

  -- 3. Create supplier_profiles with sensible defaults
  --    storefront_slug: lowercase business_name, spaces → hyphens, trimmed to 100 chars
  v_slug := lower(regexp_replace(trim(v_app.business_name), '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := substring(v_slug FROM 1 FOR 97);

  -- Ensure slug uniqueness by appending a suffix if needed
  DECLARE
    v_suffix INT := 0;
    v_try    TEXT;
  BEGIN
    v_try := v_slug;
    WHILE EXISTS (SELECT 1 FROM public.supplier_profiles WHERE storefront_slug = v_try) LOOP
      v_suffix := v_suffix + 1;
      v_try := v_slug || '-' || v_suffix;
    END LOOP;
    v_slug := v_try;
  END;

  INSERT INTO public.supplier_profiles (id, storefront_slug, verified_at)
  VALUES (v_app.user_id, v_slug, NOW())
  ON CONFLICT (id) DO NOTHING;

  -- 4. Audit log
  INSERT INTO public.audit_log (action, target_id, performed_by, metadata)
  VALUES (
    'supplier_approved',
    application_id,
    admin_id,
    jsonb_build_object(
      'user_id',       v_app.user_id,
      'business_name', v_app.business_name,
      'storefront_slug', v_slug
    )
  );

  RETURN jsonb_build_object('success', true, 'storefront_slug', v_slug);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: reject_supplier_application
-- Updates application status and logs the action.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.reject_supplier_application(
  application_id UUID,
  admin_id       UUID,
  rejection_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_app public.supplier_applications%ROWTYPE;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  SELECT * INTO v_app FROM public.supplier_applications WHERE id = application_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found';
  END IF;

  -- Update application
  UPDATE public.supplier_applications
  SET
    status      = 'rejected',
    reviewed_at = NOW(),
    reviewed_by = admin_id,
    admin_notes = COALESCE(rejection_notes, admin_notes)
  WHERE id = application_id;

  -- Audit log
  INSERT INTO public.audit_log (action, target_id, performed_by, metadata)
  VALUES (
    'supplier_rejected',
    application_id,
    admin_id,
    jsonb_build_object(
      'user_id',       v_app.user_id,
      'business_name', v_app.business_name,
      'reason',        rejection_notes
    )
  );

  RETURN jsonb_build_object('success', true);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: suspend_supplier
-- Revokes supplier access — sets is_verified_supplier = false and role = 'consumer'.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.suspend_supplier(
  target_user_id UUID,
  admin_id       UUID,
  suspend_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Forbidden: admin role required';
  END IF;

  -- Revoke supplier access
  UPDATE public.profiles
  SET
    role                 = 'consumer',
    is_verified_supplier = FALSE,
    updated_at           = NOW()
  WHERE id = target_user_id;

  -- Update latest approved application to suspended
  UPDATE public.supplier_applications
  SET
    status      = 'suspended',
    admin_notes = COALESCE(suspend_reason, admin_notes),
    reviewed_at = NOW(),
    reviewed_by = admin_id
  WHERE user_id = target_user_id
    AND status = 'approved';

  -- Audit log
  INSERT INTO public.audit_log (action, target_id, performed_by, metadata)
  VALUES (
    'supplier_suspended',
    target_user_id,
    admin_id,
    jsonb_build_object('reason', suspend_reason)
  );

  RETURN jsonb_build_object('success', true);
END;
$$;
