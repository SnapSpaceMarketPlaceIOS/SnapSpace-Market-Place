import { parseDesignPrompt } from '../utils/promptParser';
import { matchProducts, matchProductsForDesign } from './productMatcher';
import { PRODUCT_CATALOG, getProductsByIds } from '../data/productCatalog';
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
// Set to null to force rebuild on next call (e.g. after style map changes)
let _combinedCatalog = null;
export function resetCatalogCache() { _combinedCatalog = null; }
function getCombinedCatalog() {
  if (!_combinedCatalog) {
    const curatedNormalized = curatedProducts.map(normalizeCuratedProduct);
    // Merge: curated items first (higher priority in ties), then base catalog
    // Deduplicate by id so future PA-API items won't collide
    const baseIds = new Set(PRODUCT_CATALOG.map((p) => p.id));
    const uniqueCurated = curatedNormalized.filter((p) => !baseIds.has(p.id));
    _combinedCatalog = [...uniqueCurated, ...PRODUCT_CATALOG];
  }
  return _combinedCatalog;
}

/**
 * Get products matched to a free-text AI design prompt.
 * This is the core AI → products pipeline.
 *
 * @param {string} promptText - The user's AI generation prompt
 * @param {number} limit      - Number of products to return (default 6)
 * @returns {object[]}        - Matched products with affiliate URLs
 */
export function getProductsForPrompt(promptText, limit = 6) {
  const parsed = parseDesignPrompt(promptText);
  const products = matchProducts(parsed, limit, getCombinedCatalog());
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
 */
function normalizeProduct(product) {
  return {
    // Legacy fields (ShopTheLookScreen, CartContext compatibility)
    name: product.name,
    brand: `${product.brand}`,
    price: product.priceDisplay,

    // Extended fields (new screens)
    id: product.id,
    asin: product.asin || null,
    priceValue: product.price,
    priceLabel: product.priceDisplay,
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
  };
}

/**
 * Returns the source label for display in UI.
 * e.g. "Buy on Amazon", "Buy on Wayfair"
 */
export function getSourceLabel(source) {
  switch (source) {
    case 'amazon':  return 'Buy on Amazon';
    case 'wayfair': return 'Buy on Wayfair';
    case 'houzz':   return 'Buy on Houzz';
    default:        return 'Shop Now';
  }
}

/**
 * Returns the brand color for the source button.
 * Amazon uses the token value; others use well-known brand colors.
 */
export function getSourceColor(source) {
  switch (source) {
    case 'amazon':  return uiColors.amazon;   // #FF9900 from tokens
    case 'wayfair': return '#7B2D8B';
    case 'houzz':   return '#4DBC15';
    default:        return uiColors.primary;  // #1D4ED8 from tokens
  }
}

/**
 * Generates the correct affiliate URL for a product.
 * Falls back through: product.affiliateUrl → generic search URL → null
 *
 * @param {object} product - Normalized product object
 * @returns {string|null}  - Affiliate URL to open
 */
export function getAffiliateUrl(product) {
  if (!product) return null;

  // Use product's own affiliate URL if present
  if (product.affiliateUrl) return product.affiliateUrl;

  // Amazon fallback: construct search URL with partner tag
  const partnerTag = process.env.EXPO_PUBLIC_AMAZON_PARTNER_TAG || 'snapspace20-20';
  if (product.source === 'amazon' && product.name) {
    const query = encodeURIComponent(product.name);
    return `https://www.amazon.com/s?k=${query}&tag=${partnerTag}`;
  }

  // Wayfair fallback: search URL
  if (product.source === 'wayfair' && product.name) {
    const query = encodeURIComponent(product.name);
    return `https://www.wayfair.com/keyword.php?keyword=${query}`;
  }

  // Houzz fallback: search URL
  if (product.source === 'houzz' && product.name) {
    const query = encodeURIComponent(product.name);
    return `https://www.houzz.com/products/query/${query}`;
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
