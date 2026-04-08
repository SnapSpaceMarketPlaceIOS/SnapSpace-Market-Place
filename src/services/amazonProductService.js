/**
 * HomeGenie — Amazon Product Service
 *
 * Calls the `amazon-search` Supabase Edge Function, which proxies
 * Amazon PA-API v5 SearchItems server-side (keeps the secret key off device).
 *
 * Graceful degradation:
 *   - Returns [] when PA-API credentials not set (source: "unavailable")
 *   - Returns [] on network errors (edge function returns source: "error")
 *   - Falls back to local catalog in affiliateProducts.js async variants
 *
 * Partner tag: snapspacemkt-20
 */

import { supabase } from './supabase';

const FUNCTION_NAME = 'amazon-search';

/**
 * Search Amazon PA-API via Supabase Edge Function.
 *
 * @param {string} keywords  - Search terms (e.g. "modern sofa minimalist")
 * @param {string} roomType  - One of the app's room type keys (e.g. "living-room")
 * @param {number} limit     - Max results (1–10, capped server-side)
 * @returns {Promise<{ products: object[], source: string }>}
 *   products: normalized AffiliateProduct objects (or [])
 *   source:   "amazon" | "unavailable" | "error"
 */
export async function searchAmazonProducts(keywords = 'home furniture', roomType = 'living-room', limit = 6) {
  try {
    const { data, error } = await supabase.functions.invoke(FUNCTION_NAME, {
      body: { keywords, roomType, limit },
    });

    if (error) {
      console.warn('[Amazon] Edge function error:', error.message);
      return { products: [], source: 'error' };
    }

    return {
      products: normalizeEdgeProducts(data?.products ?? []),
      source: data?.source ?? 'unavailable',
    };
  } catch (err) {
    console.warn('[Amazon] Network error:', err.message);
    return { products: [], source: 'error' };
  }
}

/**
 * Get Amazon products matched to a design prompt.
 * Builds a keyword string from the prompt text before calling the edge function.
 *
 * @param {string} promptText  - The user's AI generation prompt
 * @param {string} roomType    - Detected room type
 * @param {number} limit       - Max results
 * @returns {Promise<{ products: object[], source: string }>}
 */
export async function getAmazonProductsForPrompt(promptText, roomType = 'living-room', limit = 6) {
  // Distill keywords from the prompt (first 80 chars keeps PA-API query clean)
  const keywords = promptText?.trim().slice(0, 80) || 'home furniture decor';
  return searchAmazonProducts(keywords, roomType, limit);
}

/**
 * Ensures edge-function products match the shape expected by all screens.
 * The edge function already normalizes; this adds any missing legacy fields
 * for backward compatibility with CartContext and ShopTheLookScreen.
 */
function normalizeEdgeProducts(products) {
  return products.map((p) => ({
    // Legacy fields
    name:         p.name  ?? 'Product',
    brand:        p.brand ?? 'Amazon',
    price:        p.priceDisplay ?? (p.price ? `$${Number(p.price).toFixed(2)}` : '$0.00'),

    // Extended fields
    id:           p.id,
    priceValue:   p.price ?? 0,
    imageUrl:     p.imageUrl ?? '',
    affiliateUrl: p.affiliateUrl ?? '',
    source:       p.source ?? 'amazon',
    category:     p.category ?? 'decor',
    styles:       p.styles ?? ['contemporary'],
    rating:       p.rating ?? 4.0,
    reviewCount:  p.reviewCount ?? 0,
    description:  p.description ?? '',
    materials:    p.materials ?? [],
    roomType:     p.roomType ?? 'living-room',
  }));
}
