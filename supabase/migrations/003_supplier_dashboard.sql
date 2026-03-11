-- SnapSpace Marketplace — Supplier Dashboard Tables
-- Run this AFTER 002_admin_panel.sql in your Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. PRODUCTS TABLE
CREATE TABLE IF NOT EXISTS public.products (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title        VARCHAR(255) NOT NULL,
  description  TEXT,
  price        DECIMAL(10,2) NOT NULL DEFAULT 0,
  compare_price DECIMAL(10,2),          -- original / crossed-out price
  category     TEXT,
  inventory    INTEGER     NOT NULL DEFAULT 0,
  images       JSONB       DEFAULT '[]', -- array of image URLs
  is_active    BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ORDERS TABLE (supplier-side view of marketplace orders)
CREATE TABLE IF NOT EXISTS public.supplier_orders (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id     UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  buyer_id        UUID        REFERENCES public.profiles(id),
  product_id      UUID        REFERENCES public.products(id),
  product_title   VARCHAR(255),          -- snapshot at time of purchase
  product_price   DECIMAL(10,2),
  quantity        INTEGER     NOT NULL DEFAULT 1,
  subtotal        DECIMAL(10,2),
  status          TEXT        NOT NULL DEFAULT 'pending'
                              CHECK (status IN ('pending','fulfilled','cancelled','refunded')),
  shipping_name   VARCHAR(255),
  shipping_address JSONB      DEFAULT '{}',
  tracking_number VARCHAR(100),
  notes           TEXT,
  ordered_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  fulfilled_at    TIMESTAMPTZ,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- ROW LEVEL SECURITY
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.supplier_orders ENABLE ROW LEVEL SECURITY;

-- Products: public can read active listings; only owner can write
CREATE POLICY "products_public_read"
  ON public.products FOR SELECT
  USING (is_active = TRUE OR supplier_id = auth.uid());

CREATE POLICY "products_supplier_insert"
  ON public.products FOR INSERT
  WITH CHECK (auth.uid() = supplier_id);

CREATE POLICY "products_supplier_update"
  ON public.products FOR UPDATE
  USING (auth.uid() = supplier_id);

CREATE POLICY "products_supplier_delete"
  ON public.products FOR DELETE
  USING (auth.uid() = supplier_id);

-- Orders: supplier can read/update their own orders
CREATE POLICY "orders_supplier_select"
  ON public.supplier_orders FOR SELECT
  USING (auth.uid() = supplier_id OR auth.uid() = buyer_id);

CREATE POLICY "orders_supplier_update"
  ON public.supplier_orders FOR UPDATE
  USING (auth.uid() = supplier_id);

-- Admins: full access
CREATE POLICY "admin_products_all"
  ON public.products FOR ALL
  USING (public.is_admin());

CREATE POLICY "admin_orders_all"
  ON public.supplier_orders FOR ALL
  USING (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- FUNCTION: get_supplier_stats
-- Returns aggregated dashboard stats for a supplier in one query.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_supplier_stats(p_supplier_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today_revenue     DECIMAL;
  v_week_revenue      DECIMAL;
  v_month_revenue     DECIMAL;
  v_active_listings   INTEGER;
  v_pending_orders    INTEGER;
BEGIN
  SELECT COALESCE(SUM(subtotal), 0) INTO v_today_revenue
  FROM public.supplier_orders
  WHERE supplier_id = p_supplier_id
    AND status = 'fulfilled'
    AND fulfilled_at >= CURRENT_DATE;

  SELECT COALESCE(SUM(subtotal), 0) INTO v_week_revenue
  FROM public.supplier_orders
  WHERE supplier_id = p_supplier_id
    AND status = 'fulfilled'
    AND fulfilled_at >= CURRENT_DATE - INTERVAL '7 days';

  SELECT COALESCE(SUM(subtotal), 0) INTO v_month_revenue
  FROM public.supplier_orders
  WHERE supplier_id = p_supplier_id
    AND status = 'fulfilled'
    AND fulfilled_at >= date_trunc('month', CURRENT_DATE);

  SELECT COUNT(*) INTO v_active_listings
  FROM public.products
  WHERE supplier_id = p_supplier_id AND is_active = TRUE;

  SELECT COUNT(*) INTO v_pending_orders
  FROM public.supplier_orders
  WHERE supplier_id = p_supplier_id AND status = 'pending';

  RETURN jsonb_build_object(
    'revenue_today',   v_today_revenue,
    'revenue_week',    v_week_revenue,
    'revenue_month',   v_month_revenue,
    'active_listings', v_active_listings,
    'pending_orders',  v_pending_orders
  );
END;
$$;
