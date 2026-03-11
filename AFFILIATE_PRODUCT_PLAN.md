# SnapSpace Affiliate Product Pipeline — Implementation Plan

> **Created:** March 10, 2026
> **Status:** Not Started
> **Goal:** Connect AI-generated room designs to real purchasable products via affiliate APIs, earning commission on every sale.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Affiliate API Reality Check](#affiliate-api-reality-check)
3. [Phase 1 — Product Catalog & Style Taxonomy](#phase-1--product-catalog--style-taxonomy)
4. [Phase 2 — Affiliate Service Layer](#phase-2--affiliate-service-layer)
5. [Phase 3 — Product Matching Algorithm](#phase-3--product-matching-algorithm)
6. [Phase 4 — Wire Into the UI](#phase-4--wire-into-the-ui)
7. [Phase 5 — Expand Seed Data (40–50 Designs)](#phase-5--expand-seed-data-4050-designs)
8. [Implementation Order](#implementation-order)
9. [Account Setup Checklist](#account-setup-checklist)
10. [File Map](#file-map)
11. [Data Schemas](#data-schemas)
12. [Progress Tracker](#progress-tracker)

---

## Architecture Overview

### Current State

- 12 hardcoded designs in `src/data/designs.js` with fake products (no real links, no affiliate tracking)
- `RoomResultScreen` has 6 hardcoded products with no connection to the AI-generated room
- No product search or recommendation system
- No affiliate link infrastructure
- AI pipeline: Camera → Supabase Storage → Replicate (adirik/interior-design) → static product list

### Target State

- 40–50 seed designs with real Unsplash/AI-generated images
- 150+ curated products linked to real affiliate URLs (Amazon, Wayfair, Houzz)
- When a user generates an AI room, the app analyzes the prompt/style and recommends matching real products
- Every product tap can earn affiliate commission
- Amazon PA-API provides live product search; Wayfair/Houzz use curated deep links
- Graceful fallback: Amazon API → curated local catalog

### Data Flow Diagram

```
User takes photo / enters prompt
        │
        ▼
  Replicate AI generates room image
        │
        ▼
  promptParser.js extracts:
    - room type (bedroom, kitchen, etc.)
    - styles (minimalist, rustic, etc.)
    - materials (wood, marble, etc.)
    - mood (warm, moody, bright, etc.)
        │
        ▼
  productMatcher.js scores catalog products
    - style match weight: 40%
    - room type match weight: 30%
    - material match weight: 20%
    - category diversity bonus: 10%
        │
        ▼
  affiliateProducts.js returns top products
    Priority: Amazon API (live) → Wayfair curated → Houzz curated → local catalog
        │
        ▼
  RoomResultScreen / ShopTheLookScreen displays products
    - Real images, real prices, real affiliate URLs
    - "Buy on Amazon" / "Buy on Wayfair" buttons
    - Add to Cart still works for in-app flow
```

---

## Affiliate API Reality Check

| Platform   | API Status                                                                 | Commission          | Integration Approach                                      |
|------------|---------------------------------------------------------------------------|----------------------|-----------------------------------------------------------|
| **Amazon** | PA-API 5.0 works now; migrating to Creators API (OAuth 2.0) by May 2026  | 1–10% (Home ~8%)    | Real-time product search by keyword, returns images/prices/affiliate URLs |
| **Wayfair**| No public search API for affiliates. Program via CJ Affiliate / Impact    | 5–7%                | Curated catalog with deep links + affiliate tracking      |
| **Houzz**  | No product search API. Affiliate via ShareASale                           | 5%                  | Curated catalog with deep links only                      |

### Amazon PA-API 5.0 → Creators API Migration

- **PA-API 5.0 deprecation:** April 30, 2026
- **Creators API uses:** OAuth 2.0 client-credentials flow, "Credential ID + Credential Secret"
- **Operations remain similar:** SearchItems, GetItems, GetVariations
- **Action:** Build on PA-API 5.0 now, plan migration to Creators API by April 2026

---

## Phase 1 — Product Catalog & Style Taxonomy

### Objective

Create the data infrastructure that powers product recommendations across the entire app.

### Files to Create

#### `src/data/productCatalog.js`

Master product catalog with 150+ curated real products organized by source, room type, and style.

#### `src/data/styleMap.js`

Maps design style keywords to product categories and search terms. Used by the prompt parser and product matcher.

#### `src/data/sellers.js`

8–10 fake seller profiles used by the expanded seed designs.

#### Expand `src/data/designs.js`

From 12 → 40–50 designs. Each design's products now reference real items from `productCatalog.js`.

### Style Taxonomy

**Room Types:**
- living-room, bedroom, kitchen, dining-room, office, bathroom, outdoor, nursery, entryway

**Design Styles:**
- minimalist, japandi, rustic, industrial, coastal, art-deco, mid-century, bohemian
- scandinavian, dark-luxe, biophilic, transitional, contemporary, farmhouse, mediterranean
- wabi-sabi, maximalist, french-country, glam

**Product Categories:**
- sofa, accent-chair, coffee-table, dining-table, dining-chair, bed, dresser, nightstand
- desk, desk-chair, bookshelf, rug, lamp, pendant-light, chandelier, mirror
- throw-pillow, throw-blanket, vase, planter, wall-art, curtains, shelving

**Materials:**
- wood, marble, velvet, linen, leather, rattan, concrete, brass, copper, ceramic, glass, wicker

---

## Phase 2 — Affiliate Service Layer

### Objective

A service that abstracts over all product sources behind a single interface. Works offline with curated data; lights up with live Amazon API data when credentials are added.

### Files to Create

#### `src/services/affiliateProducts.js` — Main Service

```javascript
// Public API:
searchProducts(keywords, roomType, style, limit)    // General product search
getProductsByDesign(designId)                        // Products for a specific seed design
getProductsForPrompt(promptText)                     // THE KEY FUNCTION — AI prompt → products
getAffiliateUrl(product)                             // Returns the correct affiliate URL
```

**Fallback chain:**
1. Amazon PA-API (if credentials exist and API is available)
2. Local curated catalog filtered by style/room/keywords
3. Generic fallback products (always returns something)

#### `src/services/amazonApi.js` — Amazon PA-API 5.0

```javascript
// Requires: EXPO_PUBLIC_AMAZON_ACCESS_KEY, EXPO_PUBLIC_AMAZON_SECRET_KEY, EXPO_PUBLIC_AMAZON_PARTNER_TAG
searchItems(keywords, searchIndex, minPrice, maxPrice)
getItems(asinList)
// Handles: HMAC-SHA256 signing, rate limiting (1 req/sec), response caching (1 hour)
```

#### `src/utils/promptParser.js` — Prompt Keyword Extraction

```javascript
// Input:  "Modern minimalist bedroom with warm wood tones and brass accents"
// Output: {
//   roomType: 'bedroom',
//   styles: ['modern', 'minimalist'],
//   materials: ['wood', 'brass'],
//   mood: ['warm'],
//   furnitureKeywords: ['bed', 'nightstand', 'dresser', 'lamp']
// }
parseDesignPrompt(promptText)
```

**How it works:**
- Keyword matching against the style taxonomy
- Room type detection from known room words
- Material extraction from known material words
- Furniture inference: room type → default furniture categories (bedroom → bed, nightstand, dresser, lamp)

---

## Phase 3 — Product Matching Algorithm

### Objective

The "brain" that scores and ranks products by relevance to a design style or AI prompt.

### File: `src/services/productMatcher.js`

```javascript
matchProducts(parsedPrompt, catalog, limit = 6)
```

### Scoring Formula

Each product gets a relevance score (0–100):

| Factor              | Weight | Description                                              |
|---------------------|--------|----------------------------------------------------------|
| Style match         | 40%    | How many of the product's style tags match the prompt    |
| Room type match     | 30%    | Product's room type matches the detected room            |
| Material match      | 20%    | Product materials match prompt materials                 |
| Category diversity  | 10%    | Bonus for filling underrepresented categories in results |

### Diversity Rule

Results are diversified so you don't get 6 sofas:
- Maximum 2 products per category
- At least 4 different categories in a set of 6
- Priority order: seating → tables → lighting → textiles → decor → storage

---

## Phase 4 — Wire Into the UI

### Screen-by-Screen Changes

#### `RoomResultScreen.js`

| Current                                        | Target                                                    |
|------------------------------------------------|-----------------------------------------------------------|
| 6 hardcoded `PRODUCTS` array                   | `getProductsForPrompt(prompt)` → dynamic products         |
| Local `addedItems` state only                  | Integrated with `CartContext`                              |
| No product images                              | Real product images from catalog/Amazon                    |
| No affiliate URLs                              | Each product has a "Buy" button → opens affiliate URL      |
| Generic sofa icon for all products             | Product thumbnail images                                  |

#### `ShopTheLookScreen.js`

| Current                                        | Target                                                    |
|------------------------------------------------|-----------------------------------------------------------|
| Products from `design.products` (fake)         | Products from `productCatalog.js` (real affiliate links)  |
| Skeleton placeholders for images               | Real product thumbnail images                             |
| No external buy option                         | "Buy on Amazon/Wayfair" button per product                |

#### `ProductDetailScreen.js`

| Current                                        | Target                                                    |
|------------------------------------------------|-----------------------------------------------------------|
| Generic gradient placeholder for product image | Real product image                                        |
| Generic description text                       | Real product description (from catalog or API)            |
| Hardcoded specs (Material: "Premium Linen")    | Real specs from product data                              |
| No external purchase link                      | "Buy on [Source]" button → `Linking.openURL(affiliateUrl)` |

#### `HomeScreen.js`

| Current                                        | Target                                                    |
|------------------------------------------------|-----------------------------------------------------------|
| "Trending this week" cards link to Explore     | Could show trending affiliate products directly           |

#### `ExploreScreen.js`

| Current                                        | Target                                                    |
|------------------------------------------------|-----------------------------------------------------------|
| 12 designs                                     | 40–50 designs with real product associations              |
| No product images in grid                      | Same grid, but products behind each card are real         |

### New UI Elements Needed

- **"Buy on Amazon" button** — styled per source (Amazon orange, Wayfair purple, Houzz green)
- **Source badge** on product cards — small logo/text showing where the product is from
- **Affiliate disclosure** — small text: "We may earn a commission on purchases" (FTC requirement)

---

## Phase 5 — Expand Seed Data (40–50 Designs)

### Design Distribution by Room Type

| Room Type    | Count | Styles Covered                                    |
|--------------|-------|---------------------------------------------------|
| Living Room  | 10    | Minimalist, Mid-Century, Bohemian, Art Deco, Coastal, Transitional, Scandi, Industrial, Maximalist, Glam |
| Bedroom      | 8     | Dark Luxe, Wabi-Sabi, Coastal, Japandi, Farmhouse, Contemporary, French Country, Scandi |
| Kitchen      | 6     | Rustic, Modern, Farmhouse, Mediterranean, Industrial, Minimalist |
| Dining Room  | 5     | Japandi, Art Deco, Farmhouse, Contemporary, Glam  |
| Office       | 5     | Biophilic, Mid-Century, Minimalist, Industrial, Scandi |
| Bathroom     | 3     | Mediterranean, Minimalist, Rustic                  |
| Outdoor      | 2     | Coastal, Mediterranean                              |
| Nursery      | 1     | Scandi                                              |
| **Total**    | **40–50** |                                                 |

### Seller Distribution

8–10 fake sellers, each with a consistent style identity:

| Seller Handle       | Specialty              | Verified |
|---------------------|------------------------|----------|
| alex.designs        | Minimalist/Modern      | Yes      |
| home.by.mia         | Luxury/Glam            | Yes      |
| spacesby.jo         | Rustic/Farmhouse       | No       |
| green.interiors     | Biophilic/Natural      | Yes      |
| nordic.spaces       | Scandi/Hygge           | No       |
| darkmode.design     | Dark Luxe/Moody        | Yes      |
| wabi.studio         | Japandi/Wabi-Sabi      | Yes      |
| retro.rooms         | Mid-Century/Retro      | Yes      |
| earthy.abode        | Earthy/Bohemian        | No       |
| shore.living        | Coastal/Beach          | No       |

---

## Implementation Order

| Step | What                                                      | Files                                                | Dependencies  | Status      |
|------|-----------------------------------------------------------|------------------------------------------------------|---------------|-------------|
| 1    | Product catalog schema + style taxonomy + prompt parser   | `productCatalog.js`, `styleMap.js`, `promptParser.js`| None          | Not Started |
| 2    | Product matching algorithm                                | `productMatcher.js`                                  | Step 1        | Not Started |
| 3    | Affiliate service layer (local catalog mode)              | `affiliateProducts.js`                               | Steps 1–2     | Not Started |
| 4    | Expand seed data (40–50 designs with real products)       | `designs.js`, `sellers.js`                           | Step 1        | Not Started |
| 5    | Wire RoomResultScreen to use matched products             | `RoomResultScreen.js`                                | Steps 1–3     | Not Started |
| 6    | Wire ProductDetailScreen with affiliate "Buy" button      | `ProductDetailScreen.js`                             | Step 3        | Not Started |
| 7    | Wire ShopTheLookScreen with real product data             | `ShopTheLookScreen.js`                               | Step 3        | Not Started |
| 8    | Amazon PA-API 5.0 integration                             | `amazonApi.js`, `.env`                               | Steps 1–3     | Not Started |
| 9    | Wayfair/Houzz deep link integration                       | `affiliateProducts.js` update                        | Steps 1–3     | Not Started |
| 10   | FTC affiliate disclosure UI                               | Various screens                                      | Steps 5–7     | Not Started |

---

## Account Setup Checklist

These accounts are needed to activate live affiliate revenue. The code works with curated data before these are set up.

- [x] **Amazon Associates** — [affiliate-program.amazon.com](https://affiliate-program.amazon.com)
  - ~~Sign up → Get Associate Tag~~ **DONE — Tag: `snapspace20-20`**
  - [ ] PA-API access — LOCKED until 10 qualifying sales in 30 days (Step 8 deferred)
  - Add to `.env`:
    ```
    EXPO_PUBLIC_AMAZON_PARTNER_TAG=snapspace20-20
    EXPO_PUBLIC_AMAZON_ACCESS_KEY=       # Available after 10 sales
    EXPO_PUBLIC_AMAZON_SECRET_KEY=       # Available after 10 sales
    ```

- [ ] **CJ Affiliate** (for Wayfair) — [cj.com](https://www.cj.com)
  - Sign up as Publisher → Apply to Wayfair's program
  - Get your Publisher ID and deep link format
  - Wayfair deep link format: `https://www.anrdoezrs.net/click-PUBLISHER_ID-ADVERTISER_ID?url=PRODUCT_URL`

- [ ] **ShareASale** (for Houzz) — [shareasale.com](https://www.shareasale.com)
  - Sign up as Affiliate → Apply to Houzz's program
  - Get your Affiliate ID
  - Houzz deep link format: `https://www.shareasale.com/r.cfm?b=BANNER_ID&u=AFFILIATE_ID&m=MERCHANT_ID&urllink=PRODUCT_URL`

---

## File Map

### New Files to Create

```
src/
├── data/
│   ├── designs.js              ← EXPAND (12 → 40-50 designs)
│   ├── productCatalog.js       ← NEW (150+ curated affiliate products)
│   ├── styleMap.js             ← NEW (style taxonomy + keyword mappings)
│   └── sellers.js              ← NEW (8-10 fake seller profiles)
├── services/
│   ├── affiliateProducts.js    ← NEW (main affiliate service)
│   ├── amazonApi.js            ← NEW (Amazon PA-API 5.0 client)
│   ├── replicate.js            ← EXISTS (no changes)
│   └── supabase.js             ← EXISTS (no changes)
├── utils/
│   └── promptParser.js         ← NEW (AI prompt → keywords)
└── screens/
    ├── RoomResultScreen.js     ← MODIFY (use matched products)
    ├── ProductDetailScreen.js  ← MODIFY (add affiliate buy button)
    └── ShopTheLookScreen.js    ← MODIFY (use real product data)
```

### Environment Variables to Add

```env
# Amazon Associates (PA-API 5.0)
EXPO_PUBLIC_AMAZON_PARTNER_TAG=
EXPO_PUBLIC_AMAZON_ACCESS_KEY=
EXPO_PUBLIC_AMAZON_SECRET_KEY=

# Wayfair (CJ Affiliate)
EXPO_PUBLIC_CJ_PUBLISHER_ID=
EXPO_PUBLIC_WAYFAIR_ADVERTISER_ID=

# Houzz (ShareASale)
EXPO_PUBLIC_SHAREASALE_AFFILIATE_ID=
EXPO_PUBLIC_HOUZZ_MERCHANT_ID=
```

---

## Data Schemas

### Product (productCatalog.js)

```javascript
{
  id: 'amz-001',                          // Unique ID (prefix by source)
  name: 'Rivet Revolve Modern Sofa',      // Product name
  brand: 'Rivet',                         // Brand name
  price: 1149,                            // Price in USD (number)
  imageUrl: 'https://...',                // Product image URL
  category: 'sofa',                       // Furniture category
  roomType: 'living-room',               // Primary room type
  styles: ['modern', 'minimalist'],       // Design style tags
  materials: ['linen', 'wood'],           // Material tags
  source: 'amazon',                       // amazon | wayfair | houzz
  affiliateUrl: 'https://amzn.to/...',   // Affiliate tracking URL
  asin: 'B075X1KPLZ',                    // Amazon ASIN (if applicable)
  description: 'Mid-century inspired...', // Short description
  rating: 4.2,                            // Average rating (1-5)
  reviewCount: 1847,                      // Number of reviews
}
```

### Seller (sellers.js)

```javascript
{
  handle: 'alex.designs',
  displayName: 'Alex Chen',
  initial: 'A',
  bio: 'Minimalist spaces with maximum impact',
  verified: true,
  specialty: ['minimalist', 'modern', 'scandi'],
  followerCount: 12400,
  designCount: 8,
}
```

### Design (designs.js — expanded)

```javascript
{
  id: 1,
  title: 'Modern Minimalist Living...',
  user: 'alex.designs',                  // References sellers.js
  initial: 'A',
  verified: true,
  imageUrl: 'https://images.unsplash.com/...',
  description: 'Clean, airy living room...',
  prompt: 'Minimalist Scandi living room, oak floors, white walls',
  roomType: 'living-room',
  styles: ['minimalist', 'scandi'],
  products: ['amz-001', 'wf-012', 'hz-003'],  // References productCatalog.js IDs
  tags: ['#Minimalist', '#LivingRoom', '#NaturalWood'],
  likes: 142,
  shares: 38,
}
```

---

## Progress Tracker

Update this section as steps are completed.

| Date | Step | Description | Notes |
|------|------|-------------|-------|
| —    | —    | —           | —     |

---

## Notes & Decisions

- **FTC Compliance:** All screens showing affiliate products must include disclosure text. Standard: "We may earn a commission when you buy through links on this app."
- **Caching:** Amazon API responses should be cached for 1 hour (per Amazon TOS, prices must not be cached longer than 1 hour).
- **Rate Limiting:** Amazon PA-API allows 1 request per second. Batch where possible.
- **Image Fallback:** If a product has no image URL, show the existing gradient + icon placeholder (already built in ProductDetailScreen).
- **Price Display:** Amazon TOS requires showing the current price. Curated products can show static prices but should note "Price may vary."
- **Creators API Migration:** Plan to migrate from PA-API 5.0 to Creators API before April 30, 2026 deadline.
