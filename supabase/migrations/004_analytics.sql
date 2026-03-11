-- SnapSpace Marketplace — Supplier Analytics
-- Run this AFTER 003_supplier_dashboard.sql in your Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. PRODUCT VIEWS TABLE (for conversion tracking)
-- Each row = one view event on a product listing page.
CREATE TABLE IF NOT EXISTS public.product_views (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id   UUID        NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  supplier_id  UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewer_id    UUID        REFERENCES public.profiles(id), -- null = anonymous
  viewed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS product_views_supplier_idx ON public.product_views(supplier_id, viewed_at);
CREATE INDEX IF NOT EXISTS product_views_product_idx  ON public.product_views(product_id);

ALTER TABLE public.product_views ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a view (anonymous or authenticated)
CREATE POLICY "product_views_insert_all" ON public.product_views FOR INSERT WITH CHECK (TRUE);
-- Suppliers can read their own product views
CREATE POLICY "product_views_supplier_select" ON public.product_views FOR SELECT USING (supplier_id = auth.uid());
-- Admins can read all
CREATE POLICY "product_views_admin_select" ON public.product_views FOR SELECT USING (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- RPC: get_supplier_analytics
-- Returns a comprehensive analytics object for the supplier dashboard.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.get_supplier_analytics(
  p_supplier_id UUID,
  p_days        INTEGER DEFAULT 30
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_daily_revenue   JSONB;
  v_top_products    JSONB;
  v_total_views     BIGINT;
  v_total_orders    BIGINT;
  v_conversion_rate DECIMAL(5,2);
BEGIN
  -- Daily revenue for the last p_days days
  SELECT jsonb_agg(
    jsonb_build_object(
      'date',    TO_CHAR(day, 'YYYY-MM-DD'),
      'revenue', COALESCE(SUM(o.subtotal) FILTER (WHERE o.status = 'fulfilled'), 0)
    ) ORDER BY day
  )
  INTO v_daily_revenue
  FROM generate_series(
    CURRENT_DATE - (p_days - 1) * INTERVAL '1 day',
    CURRENT_DATE,
    INTERVAL '1 day'
  ) AS day
  LEFT JOIN public.supplier_orders o
    ON o.supplier_id = p_supplier_id
    AND DATE(o.ordered_at) = day::DATE
  GROUP BY day;

  -- Top 5 products by fulfilled revenue
  SELECT jsonb_agg(row ORDER BY row->>'revenue' DESC)
  INTO v_top_products
  FROM (
    SELECT jsonb_build_object(
      'product_id',    o.product_id,
      'product_title', MAX(o.product_title),
      'orders',        COUNT(*)::INTEGER,
      'revenue',       COALESCE(SUM(o.subtotal), 0)
    ) AS row
    FROM public.supplier_orders o
    WHERE o.supplier_id = p_supplier_id
      AND o.status = 'fulfilled'
      AND o.ordered_at >= CURRENT_DATE - p_days * INTERVAL '1 day'
    GROUP BY o.product_id
    ORDER BY SUM(o.subtotal) DESC
    LIMIT 5
  ) sub;

  -- Total product views in period
  SELECT COUNT(*) INTO v_total_views
  FROM public.product_views
  WHERE supplier_id = p_supplier_id
    AND viewed_at >= CURRENT_DATE - p_days * INTERVAL '1 day';

  -- Total orders in period
  SELECT COUNT(*) INTO v_total_orders
  FROM public.supplier_orders
  WHERE supplier_id = p_supplier_id
    AND ordered_at >= CURRENT_DATE - p_days * INTERVAL '1 day';

  -- Conversion rate (orders / views * 100)
  v_conversion_rate := CASE
    WHEN v_total_views > 0 THEN ROUND((v_total_orders::DECIMAL / v_total_views) * 100, 2)
    ELSE 0
  END;

  RETURN jsonb_build_object(
    'period_days',      p_days,
    'total_views',      v_total_views,
    'total_orders',     v_total_orders,
    'conversion_rate',  v_conversion_rate,
    'daily_revenue',    COALESCE(v_daily_revenue, '[]'::jsonb),
    'top_products',     COALESCE(v_top_products, '[]'::jsonb)
  );
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: record a product view (called from the client when a listing opens)
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.record_product_view(
  p_product_id  UUID,
  p_supplier_id UUID,
  p_viewer_id   UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.product_views (product_id, supplier_id, viewer_id)
  VALUES (p_product_id, p_supplier_id, p_viewer_id);
END;
$$;
