# homegenie-web

The web companion for HomeGenie iOS — hosts the branded share-link
landing page at `homegenie.app/wish/[id]`. Standalone Next.js app
intended for Vercel deployment.

## What this serves

- **`/`** — minimal homepage with App Store CTA. Reachable from search
  engines and direct domain visits.
- **`/wish/[id]`** — branded landing page for shared wishes. iOS app
  builds these URLs via `src/services/shareService.js` instead of
  pasting raw Supabase storage URLs into iMessage.
- **`/.well-known/apple-app-site-association`** — Universal Links
  discovery file. Lets installed iOS users open share URLs directly
  in the app.

## Quick start

```bash
cd web
cp .env.example .env.local       # fill in Supabase URL + anon key
npm install
npm run dev                       # http://localhost:3000
```

Open `http://localhost:3000/wish/<some-id>` to test the landing page
once you have at least one row in `shared_wishes` (created by the iOS
app's share flow).

## Deploy to Vercel

```bash
npm install -g vercel             # if not already
vercel link                       # connect this directory to a project
vercel env add NEXT_PUBLIC_SUPABASE_URL
vercel env add NEXT_PUBLIC_SUPABASE_ANON_KEY
vercel env add NEXT_PUBLIC_SITE_ORIGIN     # https://homegenie.app
vercel env add NEXT_PUBLIC_APP_STORE_URL   # once HomeGenie is live
vercel deploy --prod
```

Then attach `homegenie.app` (or your domain) in the Vercel dashboard
under Project → Settings → Domains. DNS records Vercel asks for must
land before the AASA Universal Link path goes live.

## Required pre-conditions

1. **Supabase migration 031 applied** — `shared_wishes` table + the
   `create_shared_wish` and `get_shared_wish` RPCs must exist. Apply
   `supabase/migrations/031_shared_wishes.sql` from the iOS repo.
2. **iOS env var set** — the iOS app builds share URLs from
   `EXPO_PUBLIC_WEB_DOMAIN`. Set it to whatever domain Vercel serves
   from (default fallback is `homegenie.app`).
3. **App Store URL** — drop the real `https://apps.apple.com/...`
   URL into `NEXT_PUBLIC_APP_STORE_URL` once HomeGenie has an App
   Store record.

## Universal Links — final activation

After a Vercel deploy with a real domain attached:

1. Confirm `https://<domain>/.well-known/apple-app-site-association`
   returns `application/json` with the `applinks` block.
2. In Xcode (or via the Expo `app.json` config), add an Associated
   Domain entitlement: `applinks:homegenie.app`.
3. Rebuild + reinstall the iOS app once. After that, every shared
   wish URL opens directly into the app on devices with HomeGenie
   installed.
