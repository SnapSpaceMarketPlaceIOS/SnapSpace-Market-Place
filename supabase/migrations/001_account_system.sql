-- SnapSpace Marketplace — Account System Schema
-- Run this in your Supabase SQL Editor (Database → SQL Editor → New query)
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. PROFILES TABLE
-- Extends Supabase's built-in auth.users with marketplace-specific fields.
CREATE TABLE IF NOT EXISTS public.profiles (
  id               UUID         PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email            VARCHAR(255),
  full_name        VARCHAR(255),
  avatar_url       TEXT,
  role             TEXT         NOT NULL DEFAULT 'consumer'
                                CHECK (role IN ('consumer', 'supplier', 'admin')),
  is_verified_supplier BOOLEAN  NOT NULL DEFAULT FALSE,
  email_verified   BOOLEAN      NOT NULL DEFAULT FALSE,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 2. SUPPLIER APPLICATIONS TABLE
CREATE TABLE IF NOT EXISTS public.supplier_applications (
  id                 UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id            UUID         NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  business_name      VARCHAR(255) NOT NULL,
  business_type      TEXT         NOT NULL
                                  CHECK (business_type IN ('retailer','manufacturer','brand','distributor')),
  website_url        TEXT,
  tax_id             TEXT,        -- encrypted at the app layer before storing
  description        TEXT,
  product_categories JSONB        DEFAULT '[]',
  inventory_size     TEXT         CHECK (inventory_size IN ('1-50','51-500','500+')),
  status             TEXT         NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','approved','rejected','suspended')),
  admin_notes        TEXT,
  submitted_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  reviewed_at        TIMESTAMPTZ,
  reviewed_by        UUID         REFERENCES public.profiles(id)
);

-- 3. SUPPLIER PROFILES TABLE
-- Created only after a supplier application is approved.
CREATE TABLE IF NOT EXISTS public.supplier_profiles (
  id                    UUID         PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  storefront_slug       VARCHAR(100) UNIQUE NOT NULL,
  storefront_banner_url TEXT,
  tagline               VARCHAR(255),
  return_policy         TEXT,
  shipping_policy       TEXT,
  payout_method         JSONB        DEFAULT '{}',  -- encrypted at the app layer
  total_sales           INTEGER      NOT NULL DEFAULT 0,
  rating_avg            DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  verified_at           TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- 4. AUDIT LOG TABLE
CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  action      TEXT        NOT NULL,
  target_id   UUID,
  performed_by UUID       REFERENCES public.profiles(id),
  metadata    JSONB       DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- Profiles: users can read/update their own row; admins can read all
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Supplier applications: users can read/insert their own; admins can read all
CREATE POLICY "applications_select_own"
  ON public.supplier_applications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "applications_insert_own"
  ON public.supplier_applications FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Supplier profiles: public read, owner write
CREATE POLICY "supplier_profiles_select_all"
  ON public.supplier_profiles FOR SELECT
  USING (true);

CREATE POLICY "supplier_profiles_update_own"
  ON public.supplier_profiles FOR UPDATE
  USING (auth.uid() = id);

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER: Auto-create a profile row when a new user signs up
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, role, is_verified_supplier, email_verified)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    'consumer',
    FALSE,
    FALSE
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- ─────────────────────────────────────────────────────────────────────────────
-- TRIGGER: Sync email_verified when Supabase confirms a user's email
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sync_email_verified()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.email_confirmed_at IS NOT NULL AND OLD.email_confirmed_at IS NULL THEN
    UPDATE public.profiles
    SET email_verified = TRUE, updated_at = NOW()
    WHERE id = NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_email_confirmed ON auth.users;
CREATE TRIGGER on_email_confirmed
  AFTER UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_email_verified();
