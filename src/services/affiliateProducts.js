import { parseDesignPrompt } from '../utils/promptParser';
import { matchProducts, matchProductsForDesign } from './productMatcher';
// Build 147 (C1): catalog access via lazy facade. `getCatalog()` defers
// the 2.87 MB data-module load until first call.
import { getCatalog, getProductsByIds } from '../data/productCatalog';
import curatedProducts from '../data/curatedProducts';
import { uiColors } from '../constants/tokens';

/**
 * Main affiliate product service.
 * Single interface for all product retrieval across the app.
 *
 * Phase 1 (current): Returns curated local catalog products.
 * Phase 2 (after PA-API unlock): Will call amazonApi.js for live results.
 */

// ── Curated catalog field mappings ──────────────────────────────────────────

// Maps curatedProducts.category → PRODUCT_CATALOG category values
const CATEGORY_MAP = {
  'tables-storage': 'coffee-table',
  'sofas-chairs':   'sofa',
  'rugs':           'rug',
  'wall-art-mirrors': 'wall-art',
};

// Maps curatedProducts.style (Title Case) → PRODUCT_CATALOG style values
// IMPORTANT: must match keys in STYLE_AFFINITY (styleMap.js) exactly
const STYLE_MAP = {
  'Japandi':   'japandi',
  'Modern':    'contemporary',   // 'modern' is not in STYLE_AFFINITY — use 'contemporary'
  'Rustic':    'rustic',
  'Dark Luxe': 'dark-luxe',
  'Coastal':   'coastal',
};

/**
 * Converts a curatedProducts entry into the PRODUCT_CATALOG shape so it
 * can flow through the same matcher / normalizer pipeline.
 */
function normalizeCuratedProduct(p) {
  const isMirror = /mirror/i.test(p.name);
  const category = isMirror ? 'mirror' : (CATEGORY_MAP[p.category] || p.category);
  const style    = STYLE_MAP[p.style] || p.style.toLowerCase();

  return {
    id:           p.id,
    asin:         p.asin,
    name:         p.name,
    brand:        p.brand,
    price:        p.price,
    priceDisplay: p.priceDisplay,
    imageUrl:     p.image,
    category,
    roomType:     [p.room],
    styles:       [style],
    materials:    [],
    tags:         p.tags || [],
    source:       'amazon',
    affiliateUrl: p.affiliateUrl,
    rating:       4.3,
    reviewCount:  0,
    description:  '',
  };
}

// Lazy-built combined catalog: PRODUCT_CATALOG + curatedProducts (PA-API fallback)
// Set to null to force rebuild on next call (e.g. after style map changes).
// Build 147 (C1): getCatalog() here is the lazy-facade getter — invoking
// it inside getCombinedCatalog() means the heavy data module is only
// touched when the matcher actually runs (first generation), not at
// app boot.
let _combinedCatalog = null;
export function resetCatalogCache() { _combinedCatalog = null; }
function getCombinedCatalog() {
  if (!_combinedCatalog) {
    const baseCatalog = getCatalog();
    const curatedNormalized = curatedProducts.map(normalizeCuratedProduct);
    // Merge: curated items first (higher priority in ties), then base catalog
    // Deduplicate by id so future PA-API items won't collide
    const baseIds = new Set(baseCatalog.map((p) => p.id));
    const uniqueCurated = curatedNormalized.filter((p) => !baseIds.has(p.id));
    _combinedCatalog = [...uniqueCurated, ...baseCatalog];
  }
  return _combinedCatalog;
}

/**
 * Get products matched to a free-text AI design prompt.
 * This is the core AI → products pipeline.
 *
 * @param {string} promptText - The user's AI generation prompt
 * @param {number} limit      - Number of products to return (default 6)
 * @param {Set<string>|null} recentlyShownIds - Build 83: optional product-ID
 *   set the matcher should prefer to skip (soft exclusion). Lets HomeScreen
 *   rotate through the catalog across consecutive generations on different
 *   styles so the same versatile chair / table doesn't appear every time.
 * @param {object|null} productHistory - Build 93 persistent freshness layer.
 *   Snapshot from productHistory.loadProductHistory(). Null = fresh start.
 * @param {Set<string>|null} likedIds - Build 93: optional liked product IDs
 *   (small +10% bonus when those products are still fresh).
 * @param {Set<string>|null} cartIds - Build 93: optional in-cart product IDs
 *   (hard-excluded — don't reshow already-in-cart items).
 * @returns {object[]}        - Matched products with affiliate URLs
 */
export function getProductsForPrompt(
  promptText,
  limit = 6,
  recentlyShownIds = null,
  productHistory = null,
  likedIds = null,
  cartIds = null,
  allowedCategories = null,
) {
  const parsed = parseDesignPrompt(promptText);
  // When a category allow-list is supplied (e.g. ANCHOR_CATEGORIES for the
  // dual-panel anchor grid), pre-filter the catalog so the scorer only ever
  // sees those categories. Default null = full catalog (unchanged behavior).
  const catalog = allowedCategories
    ? getCombinedCatalog().filter((p) => allowedCategories.has(p.category))
    : getCombinedCatalog();
  const products = matchProducts(
    parsed,
    limit,
    catalog,
    null,
    recentlyShownIds,
    productHistory,
    likedIds,
    cartIds,
  );
  return products.map(normalizeProduct);
}

/**
 * Get products for a seed design from designs.js.
 * Uses design.styles and design.roomType for matching.
 *
 * @param {object} design - A design object from designs.js
 * @param {number} limit  - Number of products to return
 * @returns {object[]}    - Matched products with affiliate URLs
 */
export function getProductsForDesign(design, limit = 4) {
  // If design has explicit product IDs referencing the catalog, use those first
  if (design.productIds && design.productIds.length > 0) {
    const explicit = getProductsByIds(design.productIds);
    if (explicit.length >= limit) return explicit.slice(0, limit).map(normalizeProduct);
  }
  // Fall back to algorithm matching
  const products = matchProductsForDesign(design, limit, getCombinedCatalog());
  return products.map(normalizeProduct);
}

/**
 * General keyword product search.
 *
 * @param {object} options
 * @param {string} options.keywords  - Search terms
 * @param {string} options.roomType  - Room type filter (optional)
 * @param {string} options.style     - Style filter (optional)
 * @param {number} options.limit     - Max results
 * @returns {object[]}
 */
export function searchProducts({ keywords = '', roomType = null, style = null, limit = 12 }) {
  const parsed = parseDesignPrompt(
    [keywords, roomType, style].filter(Boolean).join(' ')
  );
  const products = matchProducts(parsed, limit, getCombinedCatalog());
  return products.map(normalizeProduct);
}

/**
 * Normalizes a product from the catalog into the shape expected by the UI.
 * Ensures backward compatibility with existing screens (name, brand, price string).
 *
 * Price strategy:
 *   priceValue  — always the CURRENT selling price (salePrice ?? price) as a NUMBER
 *   price       — human-readable display string of the current selling price
 *   listPrice   — original/list price as a NUMBER (before discount)
 *   compareAtPrice — same as listPrice when discounted, null when not
 */
function normalizeProduct(product) {
  // Current selling price = sale price if available, otherwise list price
  const currentPrice = product.salePrice ?? product.price;
  const currentPriceDisplay = product.salePriceDisplay ?? product.priceDisplay;

  return {
    // Legacy fields (ShopTheLookScreen, CartContext compatibility)
    name: product.name,
    brand: `${product.brand}`,
    price: currentPriceDisplay,

    // Extended fields (new screens)
    id: product.id,
    asin: product.asin || null,
    priceValue: currentPrice,
    listPrice: product.price,
    priceLabel: currentPriceDisplay,
    imageUrl: product.imageUrl,
    affiliateUrl: product.affiliateUrl,
    source: product.source,
    category: product.category,
    styles: product.styles,
    styleTags: product.styles,
    roomType: Array.isArray(product.roomType) ? product.roomType[0] : product.roomType,
    rating: product.rating,
    reviewCount: product.reviewCount,
    description: product.description,
    materials: product.materials,
    tags: product.tags || [],

    // Rich PDP fields — passed through from catalog to ProductDetailScreen
    images: product.images || [],
    variants: product.variants || [],
    sizes: product.sizes || null,
    details: product.details || null,
    features: product.features || null,
    shipping: product.shipping || null,
    salePrice: product.salePrice ?? null,
    salePriceDisplay: product.salePriceDisplay ?? null,
    compareAtPrice: product.compareAtPrice ?? null,
    compareAtPriceDisplay: product.compareAtPriceDisplay ?? null,
    bestSellerBadge: product.bestSellerBadge ?? null,

    // Build 148.5 — preserve the two-track studio shot + matcher metadata.
    // productMatcher rewrites imageUrl/asin/affiliateUrl/price to the
    // matched variant's values AND attaches _matchedVariant as metadata
    // for downstream consumers (RoomResultScreen ProductCard's effectiveImage
    // chain, ProductDetailScreen's selectedVar default, CartContext override).
    // Prior to this build normalizeProduct omitted both fields, so the
    // ProductCard would fall through to imageUrl and the PDP would default
    // to the first variant instead of the matched one. Including them
    // here keeps the matched-variant story intact end-to-end.
    panelImageUrl: product.panelImageUrl || null,
    _matchedVariant: product._matchedVariant || null,
  };
}

/**
 * Returns the source label for display in UI.
 * Build 107: catalog is Amazon-only. Wayfair / Houzz cases removed.
 */
export function getSourceLabel(source) {
  // Default to Amazon — any item reaching the cart now goes through
  // Amazon checkout. The `default` branch keeps legacy items rendered
  // sensibly (e.g. items added to cart before this build).
  return 'Buy on Amazon';
}

/**
 * Returns the brand color for the source button.
 * Build 107: catalog is Amazon-only. Always returns the Amazon brand color.
 */
export function getSourceColor(source) {
  return uiColors.amazon;   // #FF9900 from tokens
}

/**
 * Generates the correct affiliate URL for a product.
 * Build 107: Amazon-only. Falls back through:
 *   product.affiliateUrl → Amazon search URL with partner tag → null
 *
 * @param {object} product - Normalized product object
 * @returns {string|null}  - Affiliate URL to open
 */
export function getAffiliateUrl(product) {
  if (!product) return null;

  // Use product's own affiliate URL if present
  if (product.affiliateUrl) return product.affiliateUrl;

  // Amazon fallback: construct a search URL with the partner tag.
  // Treats source as Amazon by default since that's the only vendor
  // in the catalog now — items with missing/null source still get a
  // valid checkout URL instead of returning null.
  const partnerTag = process.env.EXPO_PUBLIC_AMAZON_PARTNER_TAG || 'snapspacemkt-20';
  if (product.name) {
    const query = encodeURIComponent(product.name);
    return `https://www.amazon.com/s?k=${query}&tag=${partnerTag}`;
  }

  return null;
}

/**
 * Like getProductsForDesign but returns products for any design ID.
 * Convenience alias used by some screens.
 */
export function getProductsByDesign(designId) {
  // This will be wired to the DB when live; for now uses catalog matching
  return [];
}

/**
 * Fetch UI-ready (normalized) products by an explicit ordered list of IDs.
 * Missing IDs are silently filtered out. Use for hand-curated sections
 * like Featured Products where keyword search is too loose.
 *
 * Different from the raw `getProductsByIds` exported by productCatalog.js:
 *   - Pulls from the combined catalog (includes curatedProducts.js)
 *   - Returns normalized shape (name/brand/price/imageUrl/... UI fields)
 *
 * @param {string[]} ids  ASINs or catalog IDs
 * @returns {object[]}    normalized products in input order
 */
export function getNormalizedProductsByIds(ids = []) {
  if (!Array.isArray(ids) || ids.length === 0) return [];
  const catalog = getCombinedCatalog();
  return ids
    .map((id) => catalog.find((p) => p.id === id || p.asin === id))
    .filter(Boolean)
    .map(normalizeProduct);
}

// ── "You Might Also Like" recommendation engine ──────────────────────────────

// Accent/decor categories targeted for recommendations.
// These complement primary furniture without duplicating SHOP ROOM items.
const ACCENT_CATEGORIES = new Set([
  'rug', 'throw-pillow', 'throw-blanket', 'vase', 'planter',
  'wall-art', 'curtains', 'mirror', 'lamp', 'floor-lamp',
  'table-lamp', 'pendant-light', 'accent-chair', 'side-table',
]);

// ── Dual-panel category framing (Workstream B polish) ──────────────────────
// Panel 1 ("anchor" 2×2) carries the structural centerpieces + the grounding
// rug; Panel 2 ("decor" 2×2) fills the gaps with lighting, soft goods, and
// wall/surface decor. ANCHOR_CATEGORIES and DECOR_CATEGORIES are DISJOINT and
// together EXHAUSTIVE over the catalog's categories, so the assembled
// 8-product Shop Room strip can never repeat a category across the two panels
// (this is what kills the "two rugs / both grids are centerpieces" drift) —
// no separate cross-panel dedup pass is needed.
const ANCHOR_CATEGORIES = new Set([
  'sofa', 'sectional', 'loveseat', 'lounge-chair', 'accent-chair',
  'coffee-table', 'dining-table', 'dining-chair', 'bar-stool', 'kitchen-island',
  'bed', 'nightstand', 'dresser', 'desk', 'desk-chair', 'office-chair',
  'bookshelf', 'tv-stand', 'media-console', 'furniture-set', 'fire-pit',
  'storage', 'rug',
]);

// Panel 2 — decor / gap-fillers only. Distinct from ACCENT_CATEGORIES (which
// still powers getRecommendedProducts' "You Might Also Like"): this set
// deliberately drops rug + accent-chair (now anchors) so Panel 2 never renders
// a second centerpiece.
const DECOR_CATEGORIES = new Set([
  'table-lamp', 'floor-lamp', 'lamp', 'pendant-light', 'chandelier',
  'wall-art', 'vase', 'planter', 'mirror', 'throw-pillow', 'throw-blanket',
  'side-table', 'curtains',
]);

// Primary seating is a single design "group": a room gets ONE of these, never
// two (a sofa + sectional, or a sofa + a multi-piece furniture-set, reads as
// "too many centerpieces"). accent-chair / lounge-chair are intentionally NOT
// in this group — a secondary side chair alongside the main seating is correct.
const PRIMARY_SEATING = new Set([
  'sofa', 'sectional', 'loveseat', 'furniture-set',
]);

/**
 * Get "You Might Also Like" accent recommendations for a design.
 *
 * Layer 1 — Style + room matching:
 *   Uses the same productMatcher scoring engine but restricted to accent/decor
 *   categories only. Primary furniture (sofa, bed, dining-table, etc.) is
 *   excluded so this section always shows complementary pieces.
 *
 * Layer 2 — Liked history signal:
 *   likedDesignIds is { [id]: boolean } from LikedContext. Active users
 *   (3+ liked designs) get a wider diversity pass (8 slots instead of 6).
 *   Full style-aware personalization will activate when design styles are
 *   stored alongside liked IDs in a future session.
 *
 * Layer 3 — Diversity enforcement:
 *   matchProducts already enforces 1-per-category; the accent-filtered catalog
 *   guarantees category variety across rug / lighting / textiles / decor / mirror.
 *
 * @param {object}   design          - Current design (has .styles, .roomType)
 * @param {string[]} excludeIds      - Product IDs already shown in SHOP ROOM
 * @param {object}   likedDesignIds  - { [id]: boolean } from LikedContext
 * @param {number}   limit           - Max results (default 6)
 * @returns {object[]}               - Normalized, diversified accent products
 */
export function getRecommendedProducts(design, excludeIds = [], likedDesignIds = {}, limit = 6) {
  const catalog = getCombinedCatalog();
  const excludeSet = new Set(excludeIds);

  // Layer 2: active users get a slightly wider pool → more diversity
  const likedCount = Object.values(likedDesignIds).filter(Boolean).length;
  const fetchLimit = likedCount >= 3 ? Math.min(limit + 2, 8) : limit;

  // Layer 1: restrict to accent/decor, excluding SHOP ROOM products
  const accentCatalog = catalog.filter(
    (p) => ACCENT_CATEGORIES.has(p.category) && !excludeSet.has(p.id)
  );

  if (accentCatalog.length === 0) return [];

  const parsedPrompt = {
    roomType: design.roomType || 'living-room',
    styles: design.styles || [],
    materials: design.materials || [],
    moods: [],
    furnitureCategories: [],
    promptTokens: [],
  };

  // Layer 3: same scoring engine → naturally diverse across accent categories
  const products = matchProducts(parsedPrompt, fetchLimit, accentCatalog);
  return products.slice(0, limit).map(normalizeProduct);
}

/**
 * Get accent/decor products matched to a free-text AI design prompt — the
 * SECOND product panel for Workstream B's dual-panel generation.
 *
 * Sibling to getProductsForPrompt: same parse → matchProducts → normalize
 * pipeline, but the catalog is restricted to DECOR_CATEGORIES (lighting,
 * textiles, wall/surface decor, etc.) and the center pieces already chosen
 * for panel 1 are excluded, so the two panels never share a product. Because
 * DECOR_CATEGORIES is disjoint from ANCHOR_CATEGORIES, the panels also never
 * share a CATEGORY (no second rug / sofa). The same scoring engine ranks the
 * decor-filtered catalog, so the accents track the user's style + room
 * exactly like the center set does.
 *
 * @param {string}   promptText - The user's AI generation prompt
 * @param {string[]} excludeIds - Product IDs already in panel 1 (center pieces)
 * @param {number}   limit      - Number of accents to return (default 4)
 * @returns {object[]}          - Normalized, diversified decor products
 */
export function getAccentProductsForPrompt(promptText, excludeIds = [], limit = 4) {
  const excludeSet = new Set(excludeIds);
  const accentCatalog = getCombinedCatalog().filter(
    (p) => DECOR_CATEGORIES.has(p.category) && !excludeSet.has(p.id)
  );
  if (accentCatalog.length === 0) return [];

  const parsed = parseDesignPrompt(promptText);
  const products = matchProducts(parsed, limit, accentCatalog);
  return products.slice(0, limit).map(normalizeProduct);
}

/**
 * Get anchor/centerpiece products matched to a free-text AI design prompt —
 * the FIRST product panel for the dual-panel generation.
 *
 * Sibling to getAccentProductsForPrompt: same pipeline, but restricted to
 * ANCHOR_CATEGORIES (structural furniture + the grounding rug) via
 * getProductsForPrompt's allow-list. After scoring, primary seating is
 * collapsed to a SINGLE group member (one sofa OR sectional OR furniture-set,
 * never two) so the centerpiece grid never doubles up on big seating. The
 * recent/history/liked weighting is threaded through unchanged so anchors
 * still rotate across generations.
 *
 * Requests `limit + 2` raw candidates so the seating collapse can drop a
 * duplicate seat and still return a full `limit`.
 *
 * @param {string}        promptText       - The user's AI generation prompt
 * @param {number}        limit            - Number of anchors to return (default 6)
 * @param {Set|null}      recentlyShownIds - rotation exclusion (see getProductsForPrompt)
 * @param {object|null}   productHistory   - cross-gen history snapshot
 * @param {Set|null}      likedIds         - liked-product weight bonus
 * @param {Set|null}      cartIds          - in-cart hard exclusion
 * @returns {object[]}                     - Normalized anchor products, ≤1 primary seat
 */
export function getAnchorProductsForPrompt(
  promptText,
  limit = 6,
  recentlyShownIds = null,
  productHistory = null,
  likedIds = null,
  cartIds = null,
) {
  const raw = getProductsForPrompt(
    promptText,
    limit + 2,
    recentlyShownIds,
    productHistory,
    likedIds,
    cartIds,
    ANCHOR_CATEGORIES,
  );
  // Collapse primary seating to one group member. `raw` is score-ordered, so
  // the first seat encountered is the highest-scored — keep it, skip the rest.
  const out = [];
  let seatingUsed = false;
  for (const p of raw) {
    if (PRIMARY_SEATING.has(p.category)) {
      if (seatingUsed) continue;
      seatingUsed = true;
    }
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}
