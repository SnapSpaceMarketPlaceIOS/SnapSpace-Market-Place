# Amazon Product Import Template & Rules

This document defines **the exact shape every imported product MUST match** before being added
to `src/data/productCatalog.js`. The canonical gold-standard reference is the first entry
in that file (ASIN `B0FGD5615L`, CAJCA Coffee Table, lines 11–99). When in doubt, copy that
entry and replace values — do not invent new fields or omit listed ones.

Affiliate tag constant (already defined at top of `productCatalog.js`):

```js
const TAG = 'snapspacemkt-20';
```

All `affiliateUrl` values MUST be built as `'https://www.amazon.com/dp/' + ASIN + '?tag=' + TAG`.

---

## 1. Required fields (every import must have all of these)

| Field              | Type     | Notes / Source from Amazon listing                                          |
| ------------------ | -------- | --------------------------------------------------------------------------- |
| `id`               | string   | Same value as `asin`                                                        |
| `asin`             | string   | From Amazon URL: `/dp/<ASIN>/` — 10 chars, starts with `B0`                |
| `name`             | string   | Full product title from listing (keep brand + key descriptor)               |
| `brand`            | string   | "Brand" row in product details OR first word of title                       |
| `price`            | number   | Current price, no `$`, no commas. Use base/default variant price.           |
| `priceDisplay`     | string   | `'$' + price.toFixed(2)` — e.g. `'$119.75'`                                 |
| `imageUrl`         | string   | Main hero image, `_AC_UL640_.jpg` suffix preferred for list views          |
| `images`           | string[] | 4–8 additional gallery images, `_AC_SL1500_.jpg` suffix (hi-res)           |
| `category`         | string   | One of the allowed categories — see §4                                      |
| `roomType`         | string[] | Array of room slugs — see §4                                                |
| `styles`           | string[] | 1–3 style slugs — see §4                                                    |
| `materials`        | string[] | Lowercase material keywords — see §4                                        |
| `tags`             | string[] | 10–20 descriptive lowercase tags (kebab-case) for search relevance          |
| `source`           | string   | Always `'amazon'`                                                           |
| `affiliateUrl`     | string   | `'https://www.amazon.com/dp/' + ASIN + '?tag=' + TAG`                       |
| `rating`           | number   | Star rating, 1 decimal (e.g. `4.0`, `4.3`)                                  |
| `reviewCount`      | number   | Integer review count                                                        |
| `description`      | string   | 1–2 sentence hero blurb (NOT a bullet dump — that goes in `features`)       |
| `features`         | string[] | 4–6 bullet points from the "About this item" section, trimmed to one line   |
| `details`          | object   | Key/value object — see §2                                                   |
| `shipping`         | object   | See §3                                                                      |

## 2. `details` object — required keys

Populate every key you have evidence for. Use `'—'` only if truly unknown.

```js
details: {
  Brand:            'CAJCA',
  Category:         'Coffee Table',
  Material:         'Tempered Glass, Walnut Wood',
  Dimensions:       '32.3"L × 22.5"W × 16.5"H',   // use `×` (×), not 'x'
  Weight:           '28 lbs',
  'Weight Capacity':'130 lbs',
  Assembly:         'Required (15 min, no tools)',
  Condition:        'Brand New',
  Warranty:         '1-year manufacturer',
}
```

These feed directly into the "Details" section of the Product Detail screen (PDP).

## 3. `shipping` object — required keys

```js
shipping: {
  freeShipping:    true,       // true if "FREE delivery" shown on listing
  freeShippingMin: 0,          // $ threshold if conditional; 0 if unconditional
  estimatedDays:   '3-5',      // from listing — format 'N' or 'N-M'
  prime:           true,       // true if Prime-eligible
  returnDays:      30,         // Amazon return window (usually 30)
}
```

---

## 4. Allowed taxonomies (must match these exact slugs)

**`category`** (pick exactly one):
`sofa`, `accent-chair`, `coffee-table`, `dining-table`, `dining-chair`, `bed`, `dresser`,
`nightstand`, `desk`, `desk-chair`, `bookshelf`, `rug`, `lamp`, `pendant-light`, `chandelier`,
`mirror`, `throw-pillow`, `throw-blanket`, `vase`, `planter`, `wall-art`, `curtains`, `shelving`

**`roomType`** (array of one or more):
`living-room`, `bedroom`, `kitchen`, `dining-room`, `office`, `bathroom`, `outdoor`, `nursery`, `entryway`

**`styles`** (array, 1–3 values):
`minimalist`, `japandi`, `rustic`, `industrial`, `coastal`, `art-deco`, `mid-century`,
`bohemian`, `scandinavian`, `dark-luxe`, `biophilic`, `transitional`, `contemporary`,
`farmhouse`, `mediterranean`, `wabi-sabi`, `maximalist`, `french-country`, `glam`

**`materials`** (lowercase, use only these):
`wood`, `marble`, `velvet`, `linen`, `leather`, `rattan`, `concrete`, `brass`, `copper`,
`ceramic`, `glass`, `wicker`

> These are enforced by `src/data/styleMap.js` and the product matcher. Using a value not in
> this list means the product will NEVER score high enough to be recommended.

---

## 5. Optional but strongly recommended fields

Only skip these when the Amazon listing genuinely doesn't have the data.

| Field                      | Type     | When to include                                                        |
| -------------------------- | -------- | ---------------------------------------------------------------------- |
| `salePrice`                | number   | Listing has a strikethrough price — this is the current discounted $   |
| `salePriceDisplay`         | string   | `'$' + salePrice.toFixed(2)`                                           |
| `compareAtPrice`           | number   | The struck-through "list price" (what salePrice is compared against)   |
| `compareAtPriceDisplay`    | string   | `'$' + compareAtPrice.toFixed(2)`                                      |
| `bestSellerBadge`          | string   | e.g. `'300+ bought in past month'` — shown as a badge on PDP           |
| `variants`                 | object[] | Color/finish options — see §6                                          |
| `sizes`                    | object[] | Size options (separate from variants) — see §7                         |

### Pricing rules

- If the listing shows ONLY a single price → set `price` + `priceDisplay`, skip the rest.
- If there's a strikethrough discount → `price` = the struck-out price, `salePrice` = the current
  lower price, `compareAtPrice` = same as `price`. The PDP displays sale price prominently and
  the original price struck through next to it.
- Never invent a sale. If Amazon doesn't show one, the catalog shouldn't either.

## 6. `variants` array shape (color / finish options)

Each variant = one purchasable color option with its own ASIN and image set.

```js
variants: [
  {
    id:           '1',                                       // sequential string
    label:        'Brown/Walnut',                            // Amazon's swatch label
    asin:         'B0FGD5615L',                              // variant ASIN (changes per color)
    price:        101.79,                                    // this variant's price
    swatchImage:  'https://m.media-amazon.com/images/I/31Jnrn8PiVL._AC_SL300_.jpg',
    mainImage:    'https://m.media-amazon.com/images/I/81-a1cUJElL._AC_SL1500_.jpg',
    images:       [ /* optional — override gallery for this variant */ ],
    affiliateUrl: 'https://www.amazon.com/dp/B0FGD5615L?tag=' + TAG,
  },
  // ... repeat for each color/finish
]
```

Rules:
- If the product has multiple colors on Amazon, ALL of them go in `variants` (don't pick one).
- The FIRST variant should be the "default" one whose ASIN matches the top-level `asin`.
- Include the `images` array ONLY if the variant's gallery is materially different from the
  default gallery. Otherwise omit it and the PDP will reuse the top-level `images`.

## 7. `sizes` array shape

Only used when the listing offers multiple physical sizes at different prices
(e.g. rugs in 5x7, 8x10, 9x12; coffee tables in 32", 36", 42").

```js
sizes: [
  { id: 's1', label: '32 Inch', price: 101.79, compareAt: 119.75, inStock: true },
  { id: 's2', label: '36 Inch', price: 127.29, compareAt: 149.75, inStock: true },
]
```

---

## 8. Copy-paste template block

Copy this, paste into `productCatalog.js`, and fill in every `<TODO:...>` marker:

```js
{
  id: '<ASIN>', asin: '<ASIN>',
  name: '<FULL TITLE FROM AMAZON>',
  brand: '<BRAND>',
  price: <PRICE>, priceDisplay: '$<PRICE>',
  // Uncomment if discounted:
  // salePrice: <SALE>, salePriceDisplay: '$<SALE>',
  // compareAtPrice: <LIST>, compareAtPriceDisplay: '$<LIST>',
  imageUrl: 'https://m.media-amazon.com/images/I/<HERO>._AC_UL640_.jpg',
  images: [
    'https://m.media-amazon.com/images/I/<IMG1>._AC_SL1500_.jpg',
    'https://m.media-amazon.com/images/I/<IMG2>._AC_SL1500_.jpg',
    'https://m.media-amazon.com/images/I/<IMG3>._AC_SL1500_.jpg',
    'https://m.media-amazon.com/images/I/<IMG4>._AC_SL1500_.jpg',
    'https://m.media-amazon.com/images/I/<IMG5>._AC_SL1500_.jpg',
    'https://m.media-amazon.com/images/I/<IMG6>._AC_SL1500_.jpg',
  ],
  category: '<CATEGORY_SLUG>',
  roomType: ['<ROOM_SLUG>'],
  styles: ['<STYLE_1>', '<STYLE_2>'],
  materials: ['<MATERIAL_1>', '<MATERIAL_2>'],
  tags: ['tag-1', 'tag-2', 'tag-3', 'tag-4', 'tag-5', 'tag-6', 'tag-7', 'tag-8', 'tag-9', 'tag-10'],
  source: 'amazon',
  affiliateUrl: 'https://www.amazon.com/dp/<ASIN>?tag=' + TAG,
  rating: <RATING>, reviewCount: <REVIEWS>,
  // Optional:
  // bestSellerBadge: '<e.g. "500+ bought in past month">',
  description: '<1-2 SENTENCE HERO BLURB>',
  features: [
    '<FEATURE 1 — one line>',
    '<FEATURE 2 — one line>',
    '<FEATURE 3 — one line>',
    '<FEATURE 4 — one line>',
    '<FEATURE 5 — one line>',
  ],
  details: {
    Brand: '<BRAND>',
    Category: '<HUMAN-READABLE CATEGORY>',
    Material: '<MATERIALS AS COMMA LIST>',
    Dimensions: '<L"L × W"W × H"H>',
    Weight: '<N lbs>',
    'Weight Capacity': '<N lbs>',
    Assembly: '<Required (N min) | Not required>',
    Condition: 'Brand New',
    Warranty: '<1-year manufacturer | 30-day | etc>',
  },
  // Optional — include if Amazon listing has color/finish options:
  // variants: [
  //   {
  //     id: '1', label: '<COLOR>', asin: '<VARIANT_ASIN>', price: <PRICE>,
  //     swatchImage: 'https://m.media-amazon.com/images/I/<SWATCH>._AC_SL300_.jpg',
  //     mainImage:   'https://m.media-amazon.com/images/I/<HERO>._AC_SL1500_.jpg',
  //     affiliateUrl: 'https://www.amazon.com/dp/<VARIANT_ASIN>?tag=' + TAG,
  //   },
  // ],
  // Optional — include if listing has size options:
  // sizes: [
  //   { id: 's1', label: '<SIZE>', price: <P>, compareAt: <C>, inStock: true },
  // ],
  shipping: {
    freeShipping: true,
    freeShippingMin: 0,
    estimatedDays: '<N | N-M>',
    prime: true,
    returnDays: 30,
  },
},
```

---

## 9. Import workflow (step-by-step)

1. **Open the Amazon product page.** Copy the ASIN from the URL (10 chars after `/dp/`).
2. **Right-click each gallery image → Open in new tab → copy the `m.media-amazon.com` URL.**
   Strip any `_SR...` / `_SX...` suffixes and normalize to `_AC_SL1500_.jpg` for gallery, 
   `_AC_UL640_.jpg` for the hero `imageUrl`.
3. **Copy the title verbatim** into `name` (you can trim extreme length but keep brand + main descriptor).
4. **Record price.** If there's a strikethrough discount, use pricing rules from §5.
5. **Copy 4–6 "About this item" bullets** into `features` (one line each, strip marketing fluff).
6. **Fill `details`** from the "Product details" / "Technical details" table on the listing.
7. **Pick taxonomies from §4** — do not invent new values. If none fit, ask before inventing.
8. **Build `tags`** — 10–20 lowercase kebab-case descriptors that a user might search for
   (room, mood, material, silhouette, era, etc.). These drive search + recommendations.
9. **If the listing has color/finish swatches → fill `variants`** (all of them, not just one).
10. **If the listing has size options → fill `sizes`.**
11. **Append the new object to `PRODUCT_CATALOG`** in the appropriate section of
    `productCatalog.js` (sections are commented: "TABLES & STORAGE", "SOFAS & CHAIRS", etc.).
12. **Verify** by running the app and opening the PDP for the new ASIN. Every field below must
    render with real data (no blank sections, no `undefined`):
    - Hero image + gallery swipes through all `images`
    - Title, brand, price (+ sale/compare-at if present)
    - Star rating + review count
    - Variant swatches (if any) — tapping each switches the hero image
    - Size picker (if any)
    - "Features" bullet list
    - "Details" key/value rows
    - "Shipping & Returns" — free shipping badge, estimated days, return window
    - Amazon CTA button — tap should open `affiliateUrl` (verify the `?tag=snapspacemkt-20` is intact)

---

## 10. Common pitfalls to avoid

- **Do NOT** use `_SX679_` or `_SR38,50_` image suffixes — they're tiny thumbnails. Always
  normalize to `_AC_SL1500_.jpg` (gallery) or `_AC_UL640_.jpg` (hero).
- **Do NOT** omit `features` or leave it empty — the PDP renders "No features listed" as a gap.
- **Do NOT** use styles / categories / materials outside the allowed lists in §4 — they will
  silently never match in the recommender.
- **Do NOT** forget the `?tag=snapspacemkt-20` suffix on affiliateUrl — without it, no commission.
- **Do NOT** cache prices for more than an hour in production (Amazon TOS). The static catalog
  is fine for now; when live PA-API lands, prices will refresh automatically.
- **Do NOT** add products without real gallery images. If only one image exists on the listing,
  the product isn't rich enough to showcase — skip it.
