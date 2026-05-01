# SnapSpace Product Import Workflow

**For**: future sessions where you (or any Claude) is importing products
into `src/data/productCatalog.js` one at a time.

**Goal**: every imported product is INSTANTLY operational across the full
pipeline — matcher, panel composition, render, Shop Room card, cart, PDP.
No follow-up audits or fix-up tags required.

---

## ⛓️ The funnel (what every imported product must support)

```
Import → productCatalog.js
   ↓
parseDesignPrompt(user prompt) → { roomType, styles, materials, colors, moods }
   ↓
matchProducts() reads:
  • product.roomType    → must include the prompted room
  • product.category    → drives slot assignment
  • product.styles      → drives style scoring (40% of total)
  • product.materials   → drives material scoring (20%)
  • product.tags        → drives tag scoring (15%)
  • product.name        → drives name-match scoring (15%)
  • product.description → drives description scoring (10%)
  • product.variants    → drives variant rewrite (color match)
   ↓
diversify() picks 4 products, may pair categories
   ↓
For each picked product:
  • IF variant matched → variant.mainImage flows to BOTH imageUrl AND panelImageUrl
  • ELSE → product.imageUrl + product.panelImageUrl flow as-is
   ↓
composite-products edge function builds 2×2 panel from panelImageUrl values
   ↓
FAL renders + visionMatcher post-render swap (if confidence is low)
   ↓
RoomResultScreen displays:
  • Hero image (the render)
  • Shop Room card (uses imageUrl + variant swatch dot from variant.label)
   ↓
addToCart() uses cart key:
  `${name}__${brand}` if no variant, else `${name}__${brand}__${variantTag}`
   ↓
ProductDetailScreen reads:
  • images[] (gallery), variants[] (chips), price, asin → Amazon URL
```

**Every link in this chain depends on the catalog row being COMPLETE and
TAGGED CORRECTLY.** A misclassified product can:
- Surface in the wrong room (sofa tagged for kitchen → sofa in your kitchen render)
- Win style scoring it shouldn't (mid-century chair tagged "scandinavian"
  pollutes scandi prompts)
- Skip variant rewrite (variant labels missing color words → matcher can't
  find matching variant for color prompt)
- Show as null swatch dot in card (variant.label has no color word → swatch
  hex is null → no visual indicator)

---

## 📋 Canonical product schema

Use this template verbatim. Required fields are MANDATORY for the funnel
to operate. Optional fields enrich behavior; missing optional fields
gracefully degrade but don't break.

```js
{
  // ── REQUIRED IDENTITY ────────────────────────────────────
  id: 'B0XXXXXXXX',           // Amazon ASIN, used as primary key everywhere
  asin: 'B0XXXXXXXX',         // Same as id; carried for affiliate URL building
  name: 'BRAND Full Product Name from Amazon Listing',
  brand: 'BRAND',
  price: 299.99,              // NUMBER, not string. Current selling price.
  priceDisplay: '$299.99',    // String for cards. Match price exactly.
  source: 'amazon',           // ALWAYS 'amazon'. Catalog is Amazon-only.
  affiliateUrl: 'https://www.amazon.com/dp/B0XXXXXXXX?tag=' + TAG,

  // ── REQUIRED IMAGES ──────────────────────────────────────
  // imageUrl  = LIFESTYLE photo (user-facing — Explore, Shop Room cards)
  // panelImageUrl = STUDIO photo (AI-facing — fed to FAL panel)
  // images[]  = full gallery (PDP swipe; first should equal imageUrl)
  imageUrl:      'https://m.media-amazon.com/images/I/.....jpg',  // lifestyle
  panelImageUrl: 'https://m.media-amazon.com/images/I/.....jpg',  // studio (or null)
  images: [
    'https://m.media-amazon.com/images/I/.....jpg',  // hero (== imageUrl)
    'https://m.media-amazon.com/images/I/.....jpg',  // alt angle
    'https://m.media-amazon.com/images/I/.....jpg',  // detail
    // ... up to 6
  ],

  // ── REQUIRED MATCHER FIELDS ──────────────────────────────
  // category     — drives slot assignment + room locks. Pick from CATEGORIES list below.
  // roomType     — array of rooms this product belongs in. Pick from ROOMS list below.
  // styles       — array of design style tags. Pick from STYLES list below.
  // materials    — array of material tags. Pick from MATERIALS list below.
  category: 'kitchen-island',                       // ONE category only
  roomType: ['kitchen', 'dining-room'],            // can list multiple if applicable
  styles: ['modern', 'minimalist', 'contemporary'],// 1-4 most-relevant
  materials: ['wood', 'marble'],                   // 1-3

  // ── REQUIRED MATCHER ENRICHMENT ──────────────────────────
  // tags — free-form keywords for tag scoring. Use catalog-aligned vocabulary.
  // description — Amazon's own description text or a curated paraphrase.
  // features — bullet array, often pulled from Amazon listing.
  tags: [
    'modern', 'kitchen', 'island', 'wood', 'marble',
    'natural', 'minimalist', 'open-plan', 'breakfast-bar'
  ],
  description: 'Brief one-paragraph description of the product. Used by the matcher\'s description scoring (10 pts) — keywords here matter when the user prompt is specific.',
  features: [
    'Solid wood top — durable for daily use',
    'Marble waterfall edge — premium aesthetic',
    'Storage shelves — practical for small kitchens',
    'Easy assembly — under 1 hour with included hardware',
  ],

  // ── REQUIRED VARIANT BLOCK (if product has color/style options) ──
  // Without variants, matcher can't surface the right color for color prompts.
  // EVERY VARIANT NEEDS:
  //   • id + label (label MUST contain a color word for variant rewrite)
  //   • mainImage (used as both imageUrl AND panelImageUrl when matched)
  //   • affiliateUrl + asin + price
  //
  // If product is single-color, set variants: [] (empty array). Matcher will
  // skip variant rewrite gracefully.
  variants: [
    {
      id: '1',
      label: 'Walnut/Marble',  // ← CONTAINS COLOR WORD → matcher finds for "walnut" prompts
      asin: 'B0YYYYYYYY',
      price: 299.99,
      swatchImage: 'https://m.media-amazon.com/images/I/.....jpg',  // tiny variant swatch
      mainImage:   'https://m.media-amazon.com/images/I/.....jpg',  // lifestyle — flows to imageUrl + panelImageUrl
      images: [
        'https://m.media-amazon.com/images/I/.....jpg',
      ],
      affiliateUrl: 'https://www.amazon.com/dp/B0YYYYYYYY?tag=' + TAG,
    },
    {
      id: '2',
      label: 'Black/Marble',  // ← color word "Black" detected → variant fires for "dark" / "black" / "noir" prompts
      asin: 'B0ZZZZZZZZ',
      price: 299.99,
      swatchImage: '...',
      mainImage:   '...',
      affiliateUrl: '...',
    },
    // ... up to 6 variants is typical
  ],

  // ── REQUIRED DETAILS BLOCK ───────────────────────────────
  details: {
    Brand: 'BRAND',
    Category: 'Kitchen Island',
    Material: 'Solid Wood Top, Marble Waterfall Edge',
    Dimensions: '60"L × 30"W × 36"H',
    Weight: '180 lbs',
    'Weight Capacity': '300 lbs',
    Assembly: 'Required (1 hour, hardware included)',
    Condition: 'Brand New',
    Warranty: '1-year manufacturer',
  },

  // ── REQUIRED COMMERCE FIELDS ─────────────────────────────
  rating: 4.5,                 // Number, 0-5, 1 decimal. Influences scoring (+5 pts max).
  reviewCount: 1247,           // Number. Card display only.
  shipping: {
    freeShipping: true,
    freeShippingMin: 0,
    estimatedDays: '3-5',
    prime: true,
    returnDays: 30,
  },

  // ── OPTIONAL ENRICHMENT ──────────────────────────────────
  sizes: [
    { id: 's1', label: '60 Inch', price: 299.99, compareAt: 349.99, inStock: true },
    { id: 's2', label: '72 Inch', price: 399.99, compareAt: 459.99, inStock: true },
  ],
  // salePrice: 249.99,        // If on sale — overrides price for current selling price
  // listPrice: 349.99,        // Original/list price for "save $X" badge
}
```

---

## 🎨 Reference taxonomies (use ONLY these values)

### CATEGORIES (must match product type exactly)
```
sofa, sectional, accent-chair, lounge-chair, recliner,
coffee-table, side-table, console-table,
dining-table, dining-chair, bar-stool, kitchen-island,
bed, nightstand, dresser, wardrobe,
desk, desk-chair, office-chair, bookshelf, shelving,
tv-stand, media-console, storage,
floor-lamp, table-lamp, pendant-light, chandelier, wall-light,
rug, throw-pillow, throw-blanket, curtains,
mirror, wall-art, wall-shelf,
planter, vase, sculpture,
bench, ottoman, pouf,
furniture-set
```

### ROOMS (use one or more in roomType array)
```
living-room, bedroom, kitchen, dining-room, office,
bathroom, outdoor, nursery, entryway
```

### STYLES (use 1-4 in styles array, most-relevant first)
```
contemporary, modern, transitional, minimalist,
mid-century, scandinavian, japandi,
industrial, brutalist,
rustic, farmhouse, mediterranean, french-country,
bohemian, biophilic, wabi-sabi,
art-deco, glam, dark-luxe, maximalist, luxury,
coastal
```

### MATERIALS (use 1-3 in materials array)
```
wood, oak, walnut, teak, bamboo, pine, mahogany, cherry,
marble, stone, travertine, terrazzo, concrete, ceramic,
brass, copper, gold, bronze, metal,
velvet, linen, leather, cotton, silk, wool, jute, rattan, wicker,
glass
```

### COLORS (variant labels must contain a recognizable word from these families)

Defined in `src/utils/colorMap.js` COLOR_KEYWORDS map. Examples per family:

```
brown:   brown, cognac, tobacco, walnut, chestnut, caramel, espresso, mocha, tan
white:   white, ivory, cream, off-white, bone, snow, pearl
beige:   beige, sand, khaki, natural, taupe, oatmeal
black:   black, ebony, onyx, jet, obsidian, coal
gray:    gray, grey, silver, pewter, stone, ash, dove
charcoal:charcoal, graphite, slate
navy:    navy, dark blue, midnight, indigo
blue:    blue, cobalt, cerulean, azure, sky, ocean
teal:    teal, turquoise, aqua, seafoam
green:   green, sage, olive, forest, emerald, moss, fern
red:     red, crimson, scarlet, cherry, burgundy, wine, ruby
rust:    rust, terracotta, burnt orange, clay, cinnamon
orange:  orange, apricot, peach, coral
yellow:  yellow, mustard, saffron, gold, ochre
pink:    pink, blush, dusty rose, rose
purple:  purple, violet, lavender, lilac, aubergine, plum
gold:    gold, brass, bronze, golden, gilded
copper:  copper, rose gold
```

---

## 🚦 Pre-import checklist

Before pasting a new product into productCatalog.js, verify:

### Identity
- [ ] `id` is the Amazon ASIN (10 alphanumeric characters)
- [ ] `name` is the FULL Amazon listing title (no truncation)
- [ ] `brand` is the manufacturer name as shown on Amazon
- [ ] `price` is a NUMBER, not a string
- [ ] `affiliateUrl` includes the `+ TAG` suffix (uses the file's TAG constant)

### Images
- [ ] `imageUrl` is a LIFESTYLE photo (product in a styled room scene)
- [ ] `panelImageUrl` is a STUDIO photo (clean background, fixture-only)
       OR null if no clean studio shot exists
- [ ] `images[]` array has 3+ entries; first matches `imageUrl`
- [ ] All URLs use `m.media-amazon.com` (Amazon's CDN)
- [ ] All URLs end in `_AC_SL1500_.jpg` for max quality (compactify scales down for grid)

### Matcher tagging
- [ ] `category` is from the CATEGORIES list (no typos!)
- [ ] `roomType` is an ARRAY (even if just one room)
- [ ] `styles` includes 1-4 entries from the STYLES list (NEVER add custom strings)
- [ ] `materials` includes 1-3 from the MATERIALS list
- [ ] `tags` includes 6-15 keywords (free-form OK, but reuse catalog vocabulary)
- [ ] `description` is at least 1 sentence describing what the product IS
- [ ] `features` array has 3-5 bullets (Amazon listing's bullets are usually fine)

### Variants
- [ ] If product has color options on Amazon → variants array is populated
- [ ] EACH variant has `id`, `label`, `asin`, `price`, `mainImage`, `affiliateUrl`
- [ ] EACH `label` contains at least one COLOR WORD from the colorMap (so variant
      rewrite finds it when user prompts that color)
- [ ] If single-color product → `variants: []` (empty array, NOT undefined)

### Commerce
- [ ] `rating` is between 4.0 and 5.0 (under 4.0 → don't import; quality bar)
- [ ] `reviewCount` is from the live Amazon listing
- [ ] `shipping.prime` matches the live listing
- [ ] `details` block has at least Brand, Category, Material, Dimensions

---

## 🚨 Common mistakes to avoid

### Wrong category
❌ Tagging a tall counter chair as `accent-chair` — it's a `bar-stool`.
   This breaks kitchen pairing because matcher won't pull it for kitchen.

✅ Match the category to the product's PRIMARY USE, not its silhouette.

### Style word salad
❌ `styles: ['modern', 'contemporary', 'minimalist', 'mid-century', 'scandinavian', 'japandi']`
   Tagging EVERY adjacent style → matcher gives weak matches everywhere.

✅ Pick the 2-3 styles that BEST describe this specific product. If a chair
   is genuinely cross-style, max 4. Never 6.

### Variant label without color
❌ `label: 'Style A'` or `label: 'Option 1'` — variant rewrite can't find a color.

✅ `label: 'Walnut Brown'` or `label: 'Sage Green'` or `label: 'Black/Brass'`.
   Include at least one word from the COLOR_KEYWORDS map.

### Lifestyle photo as panelImageUrl
❌ Setting `panelImageUrl` to a styled room scene with the product in context.
   FAL learns the room context and renders it.

✅ `panelImageUrl` MUST be a clean studio shot (white/gray background, just
   the product). If no studio shot exists, set to null — matcher falls
   back to imageUrl gracefully.

### Forgetting the `+ TAG` suffix on affiliate URLs
❌ `affiliateUrl: 'https://www.amazon.com/dp/B0XXX'`
   No tag = no affiliate revenue.

✅ `affiliateUrl: 'https://www.amazon.com/dp/B0XXX?tag=' + TAG`
   The TAG constant is defined at the top of productCatalog.js.

---

## 🧪 Sanity check after each import

After pasting a new product into productCatalog.js, run:

```bash
node -e "
const c = require('./src/data/productCatalog.js');
const p = c.PRODUCT_CATALOG.find(x => x.id === 'B0XXXXXXXX');  // your new id
if (!p) { console.log('NOT FOUND'); process.exit(1); }
console.log('✓ id:', p.id);
console.log('✓ name:', p.name);
console.log('✓ category:', p.category);
console.log('✓ roomType:', p.roomType);
console.log('✓ styles:', p.styles);
console.log('✓ variants:', p.variants?.length || 0);
const ok = p.id && p.name && p.category && Array.isArray(p.roomType) && Array.isArray(p.styles) && Array.isArray(p.materials);
console.log(ok ? '✅ ALL REQUIRED FIELDS PRESENT' : '❌ MISSING REQUIRED FIELDS');
"
```

If you see "✅ ALL REQUIRED FIELDS PRESENT", commit:

```bash
git add src/data/productCatalog.js
git commit -m "Catalog: imported [Brand] [Product Name]"
```

Single product, single commit. Easy to revert if anything goes wrong.

---

## 🎯 Priority targets (from CATALOG_GAP_CHART.md)

When you start importing, consult `scripts/CATALOG_GAP_CHART.md` and pick
from the Priority 1 / Priority 2 lists. Those are the gaps that actively
hurt user-facing render quality.

Phase 1 sprint = ~25 products / ~12-15 hours / closes 80% of visible gaps.

---

## 🔗 Related files

- `src/data/productCatalog.js` — the catalog
- `src/data/styleMap.js` — style/room/mood taxonomies
- `src/utils/colorMap.js` — color families + variant matching
- `src/services/productMatcher.js` — scoring + diversification + variant rewrite
- `src/services/promptBuilders.js` — FAL prompt construction
- `scripts/CATALOG_GAP_CHART.md` — what to import (Phase 1)
- `scripts/PRODUCT_IMPORT_WORKFLOW.md` — this doc
