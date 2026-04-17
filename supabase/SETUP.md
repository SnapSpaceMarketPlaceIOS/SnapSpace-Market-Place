# Supabase Setup Guide

## 1. Deploy Edge Functions

```bash
# Install Supabase CLI
npm install -g supabase

# Login
npx supabase login

# Link to your project (get project ref from Supabase dashboard)
npx supabase link --project-ref YOUR_PROJECT_REF

# Deploy all edge functions
npx supabase functions deploy ai-proxy
npx supabase functions deploy validate-apple-receipt
npx supabase functions deploy generate-with-products
npx supabase functions deploy composite-products
npx supabase functions deploy vision-match
npx supabase functions deploy amazon-search
npx supabase functions deploy ingest-affiliate-purchases
npx supabase functions deploy send-email
```

## 2. Set Edge Function Secrets

Set these via the Supabase dashboard (Project → Edge Functions → Secrets) or CLI:

```bash
npx supabase secrets set RESEND_API_KEY=re_...
npx supabase secrets set EMAIL_FROM=noreply@snapspace.app
```

| Secret | Required By | Notes |
|--------|-------------|-------|
| `RESEND_API_KEY` | `send-email` | Get from [resend.com](https://resend.com) |
| `EMAIL_FROM` | `send-email` | Must be a verified domain in Resend |

## 3. Configure the `notification_queue` Webhook

The app uses a `notification_queue` table + database webhook to trigger push notifications via the `send-email` edge function.

### 3a. Create the `notification_queue` table (if not yet migrated)

Run migration `005_email_notifications.sql` against your project:

```bash
npx supabase db push
```

### 3b. Create the Database Webhook

In the Supabase dashboard → **Database → Webhooks → Create a new hook**:

| Field | Value |
|-------|-------|
| **Name** | `on_notification_queue_insert` |
| **Table** | `public.notification_queue` |
| **Events** | `INSERT` |
| **Type** | Supabase Edge Functions |
| **Edge Function** | `send-email` |
| **HTTP Method** | `POST` |

The webhook will fire on every new row inserted into `notification_queue`, calling the `send-email` function with the row payload.

### 3c. Webhook payload shape (expected by `send-email`)

```json
{
  "type": "INSERT",
  "table": "notification_queue",
  "record": {
    "id": "uuid",
    "user_id": "uuid",
    "template": "order_confirmed | supplier_approved | supplier_rejected | password_reset",
    "payload": { ... },
    "created_at": "ISO8601"
  }
}
```

## 4. Run Migrations

```bash
# Push all migrations to remote Supabase project
npx supabase db push

# Or reset and re-apply all (destructive — local dev only)
npx supabase db reset
```

### Migration files

| File | Description |
|------|-------------|
| `001_account_system.sql` | Core profiles, auth setup, RLS policies |
| `002_admin_panel.sql` | Admin role, audit_log table |
| `003_supplier_dashboard.sql` | supplier_profiles, products, supplier_orders |
| `004_analytics.sql` | RPCs: get_supplier_stats, get_supplier_analytics, record_product_view |
| `005_email_notifications.sql` | notification_queue + webhook trigger setup |
| `006_add_profile_fields.sql` | username, bio, push_token columns on profiles |
| `007_feature_requests.sql` | feature_requests table with RLS |

## 5. Storage Buckets

Create these buckets in Supabase Storage → New Bucket:

| Bucket | Public | Purpose |
|--------|--------|---------|
| `avatars` | Yes | User profile photos |
| `room-uploads` | No | AI room scan photos (user-owned) |

### RLS policies for `room-uploads`

```sql
-- Allow users to upload their own photos
CREATE POLICY "Users upload own room photos"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'room-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);

-- Allow users to read their own photos
CREATE POLICY "Users read own room photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'room-uploads' AND auth.uid()::text = (storage.foldername(name))[1]);
```

## 6. Local Development

```bash
# Requires Docker Desktop running
npx supabase start

# View local services
# Studio:    http://localhost:54323
# API:       http://localhost:54321
# DB:        postgresql://postgres:postgres@localhost:54322/postgres
# Email:     http://localhost:54324 (Inbucket — captures all outbound emails)

# Stop local services
npx supabase stop
```

Update your `.env` for local development:
```env
EXPO_PUBLIC_SUPABASE_URL=http://localhost:54321
EXPO_PUBLIC_SUPABASE_ANON_KEY=<anon key from npx supabase start output>
```
