import { parseDesignPrompt } from '../utils/promptParser';
import { matchProducts, matchProductsForDesign } from './productMatcher';
import { getProductsByIds } from '../data/productCatalog';

/**
 * Main affiliate product service.
 * Single interface for all product retrieval across the app.
 *
 * Phase 1 (current): Returns curated local catalog products.
 * Phase 2 (after PA-API unlock): Will call amazonApi.js for live results.
 */

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
  const products = matchProducts(parsed, limit);
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
  const products = matchProductsForDesign(design, limit);
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
  const products = matchProducts(parsed, limit);
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
    priceValue: product.price,
    imageUrl: product.imageUrl,
    affiliateUrl: product.affiliateUrl,
    source: product.source,
    category: product.category,
    styles: product.styles,
    rating: product.rating,
    reviewCount: product.reviewCount,
    description: product.description,
    materials: product.materials,
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
 */
export function getSourceColor(source) {
  switch (source) {
    case 'amazon':  return '#FF9900';
    case 'wayfair': return '#7B2D8B';
    case 'houzz':   return '#4DBC15';
    default:        return '#2563EB';
  }
}
