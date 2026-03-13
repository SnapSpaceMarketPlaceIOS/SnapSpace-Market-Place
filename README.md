# SnapSpace

AI-powered interior design marketplace built with React Native + Expo. Snap a photo of any room, generate a redesigned version with AI, and shop curated affiliate products that match the look.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env template and fill in your keys
cp .env.example .env

# 3. Start Expo dev server
npx expo start        # scan QR code with Expo Go
npx expo start --web  # open in browser
```

**Simulator shortcuts** (after `npx expo start`): press `i` for iOS Simulator, `a` for Android emulator.

---

## Prerequisites

| Tool | Version | Install |
|------|---------|---------|
| Node.js | ≥ 18 | [nodejs.org](https://nodejs.org) |
| Expo CLI | latest | `npm install -g expo-cli` |
| iOS Simulator | Xcode 15+ | Mac App Store |
| Android Studio | latest | [developer.android.com](https://developer.android.com) |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in all values:

```env
EXPO_PUBLIC_SUPABASE_URL=          # Supabase project URL
EXPO_PUBLIC_SUPABASE_ANON_KEY=     # Supabase anon/public key
EXPO_PUBLIC_REPLICATE_API_TOKEN=   # Replicate API token (adirik/interior-design)
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY= # Stripe publishable key (test mode)
EXPO_PUBLIC_AMAZON_PARTNER_TAG=snapspace20-20
```

See `.env.example` for the full list including affiliate platform IDs.

---

## Architecture

### Stack

| Layer | Technology |
|-------|-----------|
| Framework | React Native 0.83 + Expo 55 |
| Navigation | React Navigation (Stack + Bottom Tabs) |
| Auth & DB | Supabase (PostgreSQL + RLS) |
| AI | Replicate API — `adirik/interior-design` |
| Payments | Stripe (`@stripe/stripe-react-native`) |
| Affiliates | Amazon Associates (snapspace20-20), Wayfair/CJ, Houzz/ShareASale |

### Key Directories

```
src/
├── screens/          # 28 screen components (one file per route)
├── components/
│   └── ds/           # Design system: Button, Badge, SectionHeader
├── constants/
│   ├── tokens.js     # SINGLE SOURCE OF TRUTH — all design tokens
│   ├── colors.js     # Brand color palette
│   └── theme.js      # Thin shim → maps to tokens.js
├── context/          # AuthContext, CartContext, LikedContext, SharedContext, OrderHistoryContext
├── services/
│   ├── supabase.js   # DB helpers + Supabase client
│   ├── api.js        # Unified API layer with guards
│   ├── replicate.js  # AI image generation
│   ├── affiliateProducts.js  # Product search + affiliate URLs
│   └── productMatcher.js     # Scoring algorithm
├── data/             # Seed data: designs, productCatalog, sellers, styleMap
└── utils/
    └── promptParser.js  # Parses design prompts → structured data
supabase/
├── migrations/       # SQL migrations (001–007)
├── functions/        # Edge functions
└── config.toml       # Local dev config (npx supabase start)
```

### AI Data Flow

```
User prompt/photo
  → Replicate AI (adirik/interior-design) → room image
  → promptParser.js → { roomType, styles, materials, moods, furnitureCategories }
  → productMatcher.js → scored catalog (style 35%, room 25%, material 15%, furniture 15%, mood 5%, diversity 10%)
  → affiliateProducts.js → top 6 affiliate products
  → RoomResultScreen / ShopTheLookScreen
```

---

## Database

Run migrations against your Supabase project:

```bash
npx supabase db push          # push migrations to remote
npx supabase start            # start local Supabase (Docker required)
npx supabase db reset         # reset local DB and re-run all migrations
```

### Key Tables

| Table | Purpose |
|-------|---------|
| `profiles` | User accounts — extends Supabase auth.users |
| `supplier_applications` | Vendor onboarding requests |
| `supplier_profiles` | Approved supplier storefronts |
| `products` | Supplier product listings |
| `supplier_orders` | Orders placed through supplier storefronts |
| `feature_requests` | User-submitted feature requests |
| `audit_log` | Admin action log |

---

## Development Scripts

```bash
npm start             # Start Expo dev server
npm run ios           # Build and run on iOS simulator
npm run android       # Build and run on Android emulator
npm run web           # Start web preview

npm run lint          # Check code quality (ESLint)
npm run lint:fix      # Auto-fix lint issues
npm run test          # Run Jest test suite
npm run test:coverage # Run tests with coverage report
```

---

## Supabase Edge Functions

Located in `supabase/functions/`. Required secrets (set via Supabase dashboard or `supabase secrets set`):

| Secret | Purpose |
|--------|---------|
| `STRIPE_SECRET_KEY` | Stripe server-side operations |
| `RESEND_API_KEY` | Transactional email via Resend |
| `EMAIL_FROM` | Sender address (e.g. `noreply@snapspace.app`) |

---

## Affiliate Pipeline

| Platform | Status | Tag/ID |
|----------|--------|--------|
| Amazon Associates | Active | `snapspace20-20` |
| Wayfair (CJ Affiliate) | Pending signup | `EXPO_PUBLIC_CJ_PUBLISHER_ID` |
| Houzz (ShareASale) | Pending signup | `EXPO_PUBLIC_SHAREASALE_AFFILIATE_ID` |

**FTC Compliance**: All screens showing affiliate products must display: *"We may earn a commission when you buy through links on this app."*

**Amazon TOS**: Never cache Amazon prices longer than 1 hour. Static catalog prices must note "Price may vary."

---

## Contribution Guide

1. **Branch naming**: `feat/short-description`, `fix/issue-description`, `chore/task-name`
2. **Commits**: Use conventional commits — `feat:`, `fix:`, `chore:`, `docs:`
3. **Design tokens**: All colors, spacing, font sizes, and radii must come from `src/constants/tokens.js` — never hardcode values
4. **DS components**: Use `Button`, `Badge`, `SectionHeader` from `src/components/ds` — never create ad-hoc inline versions
5. **Contexts**: Global state lives in `src/context/` — never lift to `App.js`
6. **SVG icons**: Inline with `react-native-svg` — no icon libraries
7. **TypeScript**: Project is JavaScript — do not add `.ts`/`.tsx` files without team agreement
8. **Tests**: Add tests to `src/__tests__/` for new utilities and services

---

## License

Private — all rights reserved. © SnapSpace.
