-- SnapSpace Marketplace — Email Notification System
-- Run this AFTER 004_analytics.sql in your Supabase SQL Editor
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Architecture:
--   DB events → triggers → notification_queue (INSERT)
--              → Supabase Database Webhook (on INSERT)
--              → send-email Edge Function
--              → Resend API → user's inbox
--
-- One-time webhook setup (Supabase Dashboard → Database → Webhooks):
--   Name:    notify-email
--   Table:   public.notification_queue
--   Events:  INSERT
--   Method:  POST
--   URL:     https://<project-ref>.supabase.co/functions/v1/send-email
--   Headers: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. NOTIFICATION QUEUE TABLE
-- Acts as a durable outbox — triggers write here, the webhook drains it.
CREATE TABLE IF NOT EXISTS public.notification_queue (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type      TEXT        NOT NULL
                              CHECK (event_type IN (
                                'welcome',
                                'application_received',
                                'application_approved',
                                'application_rejected',
                                'new_order',
                                'order_fulfilled'
                              )),
  recipient_id    UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  payload         JSONB       NOT NULL DEFAULT '{}',
  status          TEXT        NOT NULL DEFAULT 'queued'
                              CHECK (status IN ('queued', 'sent', 'failed', 'skipped')),
  error_message   TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processed_at    TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS notif_queue_status_idx ON public.notification_queue(status, created_at);
CREATE INDEX IF NOT EXISTS notif_queue_recipient_idx ON public.notification_queue(recipient_id);

ALTER TABLE public.notification_queue ENABLE ROW LEVEL SECURITY;

-- Users can see their own notification history
CREATE POLICY "notif_own_select" ON public.notification_queue
  FOR SELECT USING (recipient_id = auth.uid());

-- Only DB triggers (service role) can insert
CREATE POLICY "notif_service_insert" ON public.notification_queue
  FOR INSERT WITH CHECK (auth.role() = 'service_role');

-- Admins can read all
CREATE POLICY "notif_admin_select" ON public.notification_queue
  FOR SELECT USING (public.is_admin());

-- ─────────────────────────────────────────────────────────────────────────────
-- Helper: enqueue a notification row
-- Called by all trigger functions below.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.enqueue_notification(
  p_event_type   TEXT,
  p_recipient_id UUID,
  p_payload      JSONB DEFAULT '{}'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notification_queue (event_type, recipient_id, payload)
  VALUES (p_event_type, p_recipient_id, p_payload);
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. TRIGGER: Welcome email — fires when profiles.email_verified flips to TRUE
--    The on_email_confirmed trigger (001_account_system.sql) already updates
--    profiles.email_verified; this trigger responds to that change.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_welcome()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when email_verified transitions false → true
  IF OLD.email_verified = FALSE AND NEW.email_verified = TRUE THEN
    PERFORM enqueue_notification('welcome', NEW.id, '{}');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_email_verified_notify ON public.profiles;
CREATE TRIGGER on_email_verified_notify
  AFTER UPDATE OF email_verified ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_welcome();

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. TRIGGER: Application received — fires on new supplier_applications INSERT
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_application_received()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM enqueue_notification(
    'application_received',
    NEW.user_id,
    jsonb_build_object('business_name', NEW.business_name)
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_application_submitted_notify ON public.supplier_applications;
CREATE TRIGGER on_application_submitted_notify
  AFTER INSERT ON public.supplier_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_application_received();

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. TRIGGER: Application decision — fires when status changes to approved/rejected
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_application_decision()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Approved
  IF OLD.status <> 'approved' AND NEW.status = 'approved' THEN
    PERFORM enqueue_notification(
      'application_approved',
      NEW.user_id,
      jsonb_build_object('business_name', NEW.business_name)
    );
  END IF;

  -- Rejected
  IF OLD.status <> 'rejected' AND NEW.status = 'rejected' THEN
    PERFORM enqueue_notification(
      'application_rejected',
      NEW.user_id,
      jsonb_build_object(
        'business_name',    NEW.business_name,
        'rejection_notes',  NEW.admin_notes
      )
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_application_decision_notify ON public.supplier_applications;
CREATE TRIGGER on_application_decision_notify
  AFTER UPDATE OF status ON public.supplier_applications
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_application_decision();

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. TRIGGER: New order — fires when a supplier_orders row is inserted.
--    Sends "New order" email to the supplier.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_new_order()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM enqueue_notification(
    'new_order',
    NEW.supplier_id,
    jsonb_build_object(
      'id',               NEW.id,
      'product_id',       NEW.product_id,
      'product_title',    NEW.product_title,
      'quantity',         NEW.quantity,
      'subtotal',         NEW.subtotal,
      'buyer_name',       NEW.shipping_name,
      'shipping_name',    NEW.shipping_name,
      'shipping_address', NEW.shipping_address
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_created_notify ON public.supplier_orders;
CREATE TRIGGER on_order_created_notify
  AFTER INSERT ON public.supplier_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_order();

-- ─────────────────────────────────────────────────────────────────────────────
-- 6. TRIGGER: Order fulfilled — fires when status changes to 'fulfilled'.
--    Sends "Your order shipped" email to the buyer with tracking number.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.notify_order_fulfilled()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supplier_name TEXT;
BEGIN
  IF OLD.status <> 'fulfilled' AND NEW.status = 'fulfilled' THEN
    -- Fetch supplier's display name for the email
    SELECT full_name INTO v_supplier_name
    FROM public.profiles
    WHERE id = NEW.supplier_id;

    PERFORM enqueue_notification(
      'order_fulfilled',
      NEW.buyer_id,
      jsonb_build_object(
        'id',              NEW.id,
        'product_title',   NEW.product_title,
        'quantity',        NEW.quantity,
        'subtotal',        NEW.subtotal,
        'tracking_number', NEW.tracking_number,
        'supplier_name',   COALESCE(v_supplier_name, 'Your seller')
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_order_fulfilled_notify ON public.supplier_orders;
CREATE TRIGGER on_order_fulfilled_notify
  AFTER UPDATE OF status ON public.supplier_orders
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_order_fulfilled();

-- ─────────────────────────────────────────────────────────────────────────────
-- 7. ADMIN POLICY: Admins can manage all notification queue rows
-- ─────────────────────────────────────────────────────────────────────────────

CREATE POLICY "notif_admin_all" ON public.notification_queue
  FOR ALL USING (public.is_admin());
