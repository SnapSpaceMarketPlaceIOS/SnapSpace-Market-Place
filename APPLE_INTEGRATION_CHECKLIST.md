# HomeGenie — Apple App Store Integration Checklist

**Bundle ID:** `com.anthonyrivera.homegenie`
**App Name:** HomeGenie
**Version:** 1.0.0 (build auto-incremented by EAS)

This document is the complete to-do list for submitting HomeGenie to the App Store now that you've been accepted into the Apple Developer Program. It's split into:

1. **What I (Claude) already configured in code** — nothing for you to do
2. **What only YOU can do** — configurations on developer.apple.com, App Store Connect, Supabase, and EAS
3. **What I can automate for you** — ask me when you have the values

---

## ✅ Already Configured in Code

These are complete — you don't need to touch them.

| Item | Where | Status |
|---|---|---|
| Bundle ID | `app.json` | ✅ `com.anthonyrivera.homegenie` |
| APNs environment entitlement | `app.json` | ✅ `aps-environment: development` (EAS changes to `production` for store builds) |
| Apple Sign-In support | `app.json` + `AuthContext.js` | ✅ `usesAppleSignIn: true`, plugin configured |
| Push Notifications plugin | `app.json` | ✅ `expo-notifications` with icon + color |
| Camera permission copy | `app.json` | ✅ User-friendly string |
| Photo library permission copy | `app.json` (via expo-image-picker plugin) | ✅ |
| Privacy Manifest (PrivacyInfo.xcprivacy) | `app.json` | ✅ API reason codes declared |
| ITSAppUsesNonExemptEncryption | `app.json` | ✅ `false` — skips export compliance questionnaire |
| Stripe Merchant ID | `app.json` | ✅ `merchant.com.anthonyrivera.snapspace` |
| Apple receipt validation edge function | `supabase/functions/validate-apple-receipt/` | ✅ Deployed (needs env var — see below) |
| In-App Purchase product IDs in code | `SubscriptionContext.js` | ✅ All referenced — need matching records in App Store Connect |
| Terms of Use + Privacy Policy in-app | `src/screens/TermsOfUseScreen.js`, `PrivacyPolicyScreen.js` | ✅ Include promotional credits + affiliate attribution disclosure |
| Account deletion | `src/context/AuthContext.js` + ProfileScreen | ✅ Required by 5.1.1(v) |
| Apple ID cancellation disclosure | `PaywallScreen.js` | ✅ Standard text present |
| FTC affiliate disclosure | Multiple screens | ✅ "We may earn a commission" text |

---

## 🔧 What Only YOU Can Do

Ordered roughly chronologically. Many steps depend on earlier ones.

### Section A — Apple Developer Portal (developer.apple.com)

**A1. Find your Team ID**
- Visit https://developer.apple.com/account → Membership
- Copy your 10-character **Team ID** (looks like `ABCD1234EF`)
- Save this — you'll paste it into `eas.json` later

**A2. Register the App ID**
- Visit https://developer.apple.com/account/resources/identifiers/list
- Click + → App IDs → App → Continue
- **Description:** HomeGenie
- **Bundle ID:** Explicit → `com.anthonyrivera.homegenie`
- **Capabilities** — enable these:
  - ☑️ Push Notifications
  - ☑️ Sign In with Apple
  - ☑️ In-App Purchase
- Register.

**A3. Create APNs Authentication Key** (for push notifications)
- Developer → Certificates, Identifiers & Profiles → **Keys** → + 
- **Key Name:** HomeGenie APNs Key
- Enable **Apple Push Notifications service (APNs)**
- Register → Download the `.p8` file (you can only download this ONCE)
- Save three values: the `.p8` file, the **Key ID** (10 chars), your **Team ID**

**A4. Create Apple Sign-In Key** (for Supabase OAuth)
- Same Keys section → + 
- **Key Name:** HomeGenie SIWA Key
- Enable **Sign in with Apple**
- Click **Configure** next to it → Primary App ID = `com.anthonyrivera.homegenie`
- Register → Download the `.p8` file
- Save: this `.p8`, its **Key ID**, your **Team ID**

**A5. Create Services ID** (for Supabase OAuth)
- Identifiers → + → **Services IDs** → Continue
- **Description:** HomeGenie Sign in with Apple
- **Identifier:** `com.anthonyrivera.homegenie.siwa` (any reverse-DNS format — does NOT need to match bundle ID)
- Register → click into it → ☑️ Sign in with Apple → Configure
- **Primary App ID:** `com.anthonyrivera.homegenie`
- **Return URLs:** Your Supabase project's OAuth callback (shown in Supabase dashboard below — come back and fill this in)
- Save

**A6. Create App Store Connect API Key** (for `eas submit`)
- App Store Connect → https://appstoreconnect.apple.com/access/api
- Click + → **Access:** App Manager (or higher)
- **Name:** HomeGenie EAS Submit Key
- Generate → Download `.p8` (once only)
- Save: `.p8`, **Key ID**, **Issuer ID**

---

### Section B — App Store Connect (appstoreconnect.apple.com)

**B1. Create the app record**
- My Apps → + → New App
- **Platform:** iOS
- **Name:** HomeGenie
- **Primary Language:** English (U.S.)
- **Bundle ID:** select `com.anthonyrivera.homegenie`
- **SKU:** `homegenie-ios-001` (any unique string)
- **User Access:** Full Access
- Create.

After creation, note the numeric **Apple ID** (aka `ascAppId`) shown on the App Info page — you'll need this for `eas.json`.

**B2. App Information**
- **Subtitle:** "AI Interior Designer" (or similar, 30 char max)
- **Primary Category:** Lifestyle
- **Secondary Category:** Shopping
- **Content Rights:** Does your app contain third-party content? → Yes (AI-generated designs, Amazon products)
- **Age Rating:** Complete questionnaire
  - User-Generated Content: **Yes** (community designs)
  - Unrestricted Web Access: **Yes** (Amazon affiliate links)
  - Expected result: **12+**

**B3. Pricing and Availability**
- **Price:** Free
- **Availability:** All territories (or choose specific countries)

**B4. App Privacy**
Declare what data the app collects. Use this exact list:

| Data Type | Collected | Linked to User | Tracking | Purpose |
|---|---|---|---|---|
| Email Address | Yes | Yes | No | App Functionality |
| Name | Yes | Yes | No | App Functionality |
| User ID | Yes | Yes | No | App Functionality |
| Photos | Yes | Yes | No | App Functionality |
| Purchase History | Yes | Yes | No | App Functionality, Analytics |
| Product Interaction | Yes | No | No | Analytics |
| Device ID (push token) | Yes | Yes | No | App Functionality |
| Other User Content (bio, username) | Yes | Yes | No | App Functionality |

All others: **Not Collected**. Tracking: **None**.

**B5. Version Information (1.0.0)**
- **Description** (4000 chars max) — draft this separately, focus on AI design + shop-the-look value prop
- **Keywords** (100 chars): `interior design,ai,room,decor,furniture,home,designer,ai art,home design`
- **Support URL:** `https://homegenieios.com/support` (or whatever you host)
- **Marketing URL:** `https://homegenieios.com` (optional)
- **Copyright:** `© 2026 SnapSpace Marketplace LLC`

**B6. App Review Information**
- **Sign-in required:** Yes
- **Demo Account:** Create a real Supabase account (e.g. `applereview@homegenieios.com`) with a known password. Add pre-loaded wishes so the reviewer can test without spending money.
- **Review Notes:** Include:
  - Brief explanation of AI generation flow
  - Note that products link out to Amazon (affiliate)
  - Note that "Promotional Credits" are disclosed in ToS §5 and Privacy Policy §9 — they are a silent loyalty feature, not an IAP alternative
  - Note that demo account has pre-loaded test wishes

**B7. Screenshots**
Required sizes (at minimum):
- 6.9" iPhone (1320 × 2868)
- 6.7" iPhone (1290 × 2796)
- iPad Pro 13" (2064 × 2752) — since app supports tablet

Minimum 3 screenshots per size. Use real in-app screens with compelling AI-generated rooms.

**B8. In-App Purchases — Subscription Group**
Go to App Store Connect → Features → Subscriptions → Create

**Group Reference Name:** HomeGenie Membership
**Group Display Name (localized):** HomeGenie Membership

Then add these three auto-renewable subscriptions to the group:

| Product ID | Reference Name | Price (USD) | Duration |
|---|---|---|---|
| `homegenie_basic_weekly` | HomeGenie Basic Weekly | $4.99 | 1 Week |
| `homegenie_pro_weekly` | HomeGenie Pro Weekly | $9.99 | 1 Week |
| `homegenie_premium_weekly` | HomeGenie Premium Weekly | $19.99 | 1 Week |

For EACH subscription you must provide:
- Display name (localized — English US at minimum)
- Description (what they get)
- Privacy Policy URL
- Terms of Use URL (or use the default Apple EULA)
- One review screenshot (640×920 PNG minimum) showing the subscription in context
- Tax Category: "App Store Tax Category — Other"

**B9. In-App Purchases — Consumables (Wish Packs)**
Features → In-App Purchases → Create (Consumable)

| Product ID | Reference Name | Price (USD) |
|---|---|---|
| `homegenie_wishes_4` | 4 Wishes | $0.99 |
| `homegenie_wishes_10` | 10 Wishes | $2.49 |
| `homegenie_wishes_20` | 20 Wishes | $4.99 |
| `homegenie_wishes_40` | 40 Wishes | $9.99 |
| `homegenie_wishes_100` | 100 Wishes | $24.99 |
| `homegenie_wishes_200` | 200 Wishes | $49.99 |

⚠️ **IMPORTANT:** The product IDs must match what's in `SubscriptionContext.js` exactly. Verify with me before you create them and I'll double-check against the code.

---

### Section C — Supabase Dashboard

**C1. Configure Apple Sign-In provider**
- Supabase → Authentication → Providers → Apple → Enable
- **Services ID:** the value from step A5 (e.g. `com.anthonyrivera.homegenie.siwa`)
- **Secret Key (JWT):** paste the `.p8` file contents from step A4
- **Key ID:** from step A4
- **Team ID:** from step A1
- Save
- Copy the **Callback URL** shown → go back to step A5 and paste it as the Return URL

**C2. Add edge function secret for receipt validation**
Your `validate-apple-receipt` edge function needs the Apple shared secret.

- App Store Connect → My Apps → HomeGenie → App Information → App-Specific Shared Secret → Generate
- Copy the generated secret
- Supabase Dashboard → Settings → Edge Functions → Secrets → Add:
  - `APPLE_SHARED_SECRET` = the value you just generated

**C3. Deploy the ingest-affiliate-purchases admin key**
From our earlier security work:

- Generate a long random string (e.g. `openssl rand -hex 32`)
- Supabase → Edge Functions → Secrets:
  - `INGEST_ADMIN_KEY` = that random string
- Save this string locally — you'll use it as the `x-admin-key` header when posting Amazon reports to the function.

---

### Section D — Expo / EAS

**D1. Upload APNs key to Expo**
- In project root, run: `eas credentials`
- Choose: iOS → production → Push Notifications → Set up a new push key
- Paste the `.p8` content from step A3, plus Key ID and Team ID

**D2. Fill in `eas.json` submit section**
Right now it has empty strings. Open `/Users/anthonyrivera/Desktop/SnapSpace-Market-Place/eas.json` and fill:

```json
"submit": {
  "production": {
    "ios": {
      "ascAppId": "<from step B1 — the numeric Apple ID>",
      "appleTeamId": "<from step A1>"
    }
  }
}
```

Or tell me the values and I'll paste them in for you.

**D3. Upload App Store Connect API Key for `eas submit`**
- `eas credentials` → iOS → production → App Store Connect API Key → Set up
- Paste the `.p8` content, Key ID, Issuer ID from step A6

**D4. Verify production env vars**
⚠️ **IMPORTANT**: These env vars MUST NOT be set in the production EAS build profile — they'd ship secrets in the client bundle:

- `EXPO_PUBLIC_REPLICATE_API_TOKEN`
- `EXPO_PUBLIC_BFL_API_KEY`
- `EXPO_PUBLIC_ANTHROPIC_API_KEY`
- `EXPO_PUBLIC_FORCE_PAID_TIER` (dev bypass — must never ship)

These must live ONLY in Supabase Edge Function secrets (already the case for the proxy architecture, but verify no EAS production secret has them).

---

### Section E — Testing Before Submission

**E1. TestFlight build**
- Run: `eas build --platform ios --profile production`
- When it completes (~15-20 min), run: `eas submit --platform ios --profile production --latest`
- The build appears in App Store Connect → TestFlight within ~30 minutes after processing

**E2. Internal TestFlight test**
- Add yourself as an internal tester
- Install TestFlight build on a real iOS device
- Verify:
  - ☑️ Sign up with email works end-to-end
  - ☑️ Sign up with Apple works end-to-end
  - ☑️ Email verification works
  - ☑️ Push notification permission prompts correctly
  - ☑️ First AI generation completes
  - ☑️ Paywall appears when free wishes are exhausted
  - ☑️ Sandbox IAP purchase flow works (use sandbox tester account)
  - ☑️ Restore Purchases works
  - ☑️ Tapping any "Shop Now" opens Amazon with tag=snapspacemkt-20 visible in URL
  - ☑️ Account deletion completes
  - ☑️ Cart checkout opens Amazon multi-cart
  - ☑️ Share from paywall works (referral code appears)

**E3. Sandbox test account**
- App Store Connect → Users and Access → Sandbox → Testers → +
- Create a sandbox tester with a fake email (e.g. `hgsandbox1@anthony.test`)
- Sign out of the App Store on the test device, sign in with sandbox tester account
- Test each IAP without real charges

---

### Section F — Submission

**F1. Submit for review**
- App Store Connect → HomeGenie → iOS App → + Version → 1.0.0
- Pick the TestFlight build you uploaded
- Fill all metadata (screenshots, description, keywords, etc. from section B)
- Submit for Review

**F2. Respond to reviewer messages**
- Typical review time: 24-48 hours
- If rejected, Apple provides a specific reason; address and resubmit
- Common first-time rejection categories: missing demo credentials, sparse metadata, subscription auto-renew disclosure not visible enough

---

## 🤖 Things I Can Automate For You

Come back to me with the required values and I'll drop them in:

1. **Fill `eas.json`** — send me your `ascAppId` (step B1 output) and `appleTeamId` (step A1 output)
2. **Set `EXPO_PUBLIC_APP_STORE_ID`** in `.env` once the app record exists — I'll wire up the Rate Us / Share flows to use the real App Store URL
3. **Update `SubscriptionContext.js` product IDs** if any differ from what's currently referenced in code — I can verify exact matches before you create them in App Store Connect
4. **Verify FTC affiliate disclosure visible on all product screens** — I can audit and add wherever missing
5. **Update CLAUDE.md and MEMORY.md** to reflect final production pricing and Apple integration state
6. **Write a first-draft App Store description** — the marketing copy for B5
7. **Generate a StoreKit testing config** (`.storekit` file) so you can test IAP flows locally in Xcode without sandbox accounts
8. **Wire a Report / Block flow into community designs** (required for 12+ UGC apps per guideline 1.2)

---

## 🚦 Critical Path Summary

If you want the shortest path to a submitted build, do these in order:

1. **Section A** (Apple Developer portal) — ~30 min, gets you Team ID, Key ID, App Store Connect API Key
2. **Section B.1 + B.8 + B.9** (create app record + IAP products) — ~45 min
3. Tell me: `ascAppId`, `appleTeamId`, `APP_STORE_ID` — I'll update `eas.json` and `.env`
4. **Section C** (Supabase configs) — ~15 min
5. **Section D.1 + D.3** (EAS credentials) — ~10 min
6. Run `eas build --platform ios --profile production`
7. Run `eas submit --platform ios --profile production --latest`
8. **Section E** testing on TestFlight — ~1 hour
9. **Section B** remaining metadata (screenshots, description, etc.) — ~2 hours
10. **Section F** submit

Realistic estimate: **1 full day of focused work** to get from "developer account approved" to "submitted for review."

---

## 📞 If Apple Rejects

The most common rejection patterns for apps like HomeGenie:

| Reason | How to Handle |
|---|---|
| Guideline 2.1 — "Incomplete" metadata | Ensure ALL review info is filled, demo credentials work, screenshots match app content |
| Guideline 3.1.2 — Subscription disclosure | Verify paywall shows full renewal terms; I can make this more prominent if needed |
| Guideline 5.1.1 — Privacy | ToS + Privacy Policy must be accessible from inside the app AND from App Store Connect URLs |
| Guideline 1.2 — UGC (User-Generated Content) | If the reviewer tests community designs, they'll expect a Report button. I can add this — ask me to. |
| Guideline 4.0 — Placeholder content | If any screen shows "Coming Soon" or broken images, they'll reject. The Browse screen currently has a "Coming Soon" empty state — we should either hide that entry point or populate data before submission. |

When Apple sends a rejection, paste it to me and I'll help address it.
