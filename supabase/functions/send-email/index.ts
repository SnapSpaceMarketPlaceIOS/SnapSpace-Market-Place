/**
 * HomeGenie Marketplace — send-email Edge Function
 * ─────────────────────────────────────────────────────────────────────────────
 * Triggered by a Supabase Database Webhook on INSERT to `notification_queue`.
 *
 * How to set up the webhook (one-time, in Supabase Dashboard):
 *   Database → Webhooks → Create webhook
 *   Name:    notify-email
 *   Table:   notification_queue
 *   Events:  INSERT
 *   Method:  POST
 *   URL:     https://<your-project-ref>.supabase.co/functions/v1/send-email
 *   Headers: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>
 *
 * Required environment variables (set in Supabase Dashboard → Edge Functions → Secrets):
 *   RESEND_API_KEY      — from https://resend.com
 *   EMAIL_FROM          — verified sender, e.g. "HomeGenie <noreply@homegenie.app>"
 *   SUPABASE_URL        — your project URL
 *   SUPABASE_SERVICE_ROLE_KEY — service role key (auto-injected by Supabase)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  welcome,
  applicationReceived,
  applicationApproved,
  applicationRejected,
  newOrder,
  orderFulfilled,
} from '../_shared/templates.ts';

// ─── Env ──────────────────────────────────────────────────────────────────────

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? 'HomeGenie <noreply@homegenie.app>';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// ─── Types ────────────────────────────────────────────────────────────────────

type EventType =
  | 'welcome'
  | 'application_received'
  | 'application_approved'
  | 'application_rejected'
  | 'new_order'
  | 'order_fulfilled';

interface NotificationQueueRow {
  id: string;
  event_type: EventType;
  recipient_id: string;
  payload: Record<string, unknown>;
  status: string;
}

interface WebhookPayload {
  type: 'INSERT';
  table: string;
  record: NotificationQueueRow;
  schema: string;
}

// ─── Resend helper ────────────────────────────────────────────────────────────

async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ from: EMAIL_FROM, to: [to], subject, html }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend API error ${res.status}: ${body}`);
  }
}

// ─── Email dispatcher ─────────────────────────────────────────────────────────

async function dispatch(
  eventType: EventType,
  recipientEmail: string,
  recipientName: string,
  payload: Record<string, unknown>,
): Promise<void> {
  let template: { subject: string; html: string };

  switch (eventType) {
    case 'welcome':
      template = welcome(recipientName);
      break;

    case 'application_received':
      template = applicationReceived(recipientName, payload.business_name as string);
      break;

    case 'application_approved':
      template = applicationApproved(recipientName, payload.business_name as string);
      break;

    case 'application_rejected':
      template = applicationRejected(
        recipientName,
        payload.business_name as string,
        (payload.rejection_notes as string) ?? null,
      );
      break;

    case 'new_order':
      template = newOrder(recipientName, payload as Parameters<typeof newOrder>[1]);
      break;

    case 'order_fulfilled':
      template = orderFulfilled(recipientName, payload as Parameters<typeof orderFulfilled>[1]);
      break;

    default:
      throw new Error(`Unknown event type: ${eventType}`);
  }

  await sendEmail(recipientEmail, template.subject, template.html);
}

// ─── Handler ──────────────────────────────────────────────────────────────────

serve(async (req: Request) => {
  // Allow Supabase health checks
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  let notificationId: string | undefined;

  try {
    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY is not set. Add it in Supabase → Edge Functions → Secrets.');
    }

    const webhookPayload: WebhookPayload = await req.json();
    const row = webhookPayload.record;
    notificationId = row.id;

    // Only process new (queued) notifications
    if (row.status !== 'queued') {
      return new Response(JSON.stringify({ skipped: true }), { status: 200 });
    }

    // Fetch recipient profile
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('email, full_name')
      .eq('id', row.recipient_id)
      .single();

    if (profileError || !profile?.email) {
      throw new Error(`Recipient profile not found for id ${row.recipient_id}`);
    }

    await dispatch(
      row.event_type,
      profile.email,
      profile.full_name ?? 'there',
      row.payload,
    );

    // Mark as sent
    await supabase
      .from('notification_queue')
      .update({ status: 'sent', processed_at: new Date().toISOString() })
      .eq('id', notificationId);

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('[send-email]', err);

    // Mark as failed if we have an id
    if (notificationId && SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY) {
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      await supabase
        .from('notification_queue')
        .update({
          status: 'failed',
          error_message: (err as Error).message,
          processed_at: new Date().toISOString(),
        })
        .eq('id', notificationId);
    }

    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500 },
    );
  }
});
