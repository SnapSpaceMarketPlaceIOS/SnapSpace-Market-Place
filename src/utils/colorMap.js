/**
 * colorMap — Shared color families and opposition pairs.
 *
 * Previously this logic lived only in visionMatcher.js, so the product
 * pre-matcher had NO awareness of user-specified colors. That caused the
 * "brown leather couch" bug where a user explicitly said "brown" but the
 * matcher returned a white boucle sofa because color wasn't a dimension.
 *
 * Used by:
 *   - utils/promptParser.js   → detectColors() — extracts colors from user text
 *   - services/productMatcher.js → scoring + hard filter
 *   - services/visionMatcher.js  → vision verification (already uses its own copy)
 *
 * Single source of truth: this file.
 */

// ─── Color families ─────────────────────────────────────────────────────
// Key = canonical color name, value = list of words that indicate that color.
// Matching is substring-based so "cognac brown leather" hits both "cognac"
// and "brown".
export const COLOR_KEYWORDS = {
  brown:     ['brown', 'cognac', 'tobacco', 'walnut', 'chestnut', 'caramel', 'mocha', 'tan', 'chocolate', 'espresso', 'whiskey', 'amber', 'honey', 'coffee'],
  white:     ['white', 'ivory', 'cream', 'off-white', 'offwhite', 'bone', 'snow', 'eggshell', 'pearl', 'alabaster'],
  beige:     ['beige', 'sand', 'khaki', 'natural', 'taupe', 'oatmeal', 'camel'],
  black:     ['black', 'ebony', 'onyx', 'jet', 'obsidian', 'coal'],
  charcoal:  ['charcoal', 'graphite', 'slate'],
  gray:      ['gray', 'grey', 'silver', 'pewter', 'stone', 'ash', 'dove'],
  navy:      ['navy', 'dark blue', 'midnight', 'indigo'],
  blue:      ['blue', 'cobalt', 'cerulean', 'azure', 'sky', 'ocean'],
  teal:      ['teal', 'turquoise', 'aqua', 'seafoam'],
  green:     ['green', 'sage', 'olive', 'forest', 'emerald', 'moss', 'fern'],
  red:       ['red', 'crimson', 'scarlet', 'cherry', 'burgundy', 'wine', 'ruby'],
  rust:      ['rust', 'terracotta', 'burnt orange', 'clay', 'cinnamon'],
  orange:    ['orange', 'apricot', 'peach', 'coral'],
  yellow:    ['yellow', 'mustard', 'saffron', 'gold', 'ochre'],
  pink:      ['pink', 'blush', 'dusty rose', 'rose', 'coral'],
  purple:    ['purple', 'violet', 'lavender', 'lilac', 'aubergine', 'plum'],
  gold:      ['gold', 'brass', 'bronze', 'golden', 'gilded'],
  copper:    ['copper', 'rose gold'],
};

// ─── Reverse lookup: word → canonical color family ────────────────────
// Pre-built at module load so detection is O(1).
const WORD_TO_COLOR_FAMILY = (() => {
  const map = new Map();
  for (const [family, words] of Object.entries(COLOR_KEYWORDS)) {
    for (const w of words) {
      if (!map.has(w)) map.set(w, family);
    }
  }
  return map;
})();

/**
 * Detect all color families mentioned in a text string.
 * Returns canonical family names (e.g. 'brown' for 'cognac').
 */
export function detectColorFamilies(text) {
  if (!text || typeof text !== 'string') return [];
  const lower = text.toLowerCase();
  const found = new Set();
  for (const [word, family] of WORD_TO_COLOR_FAMILY) {
    // Use word boundaries so "tan" doesn't match "tantrum"
    const re = new RegExp(`\\b${word}\\b`);
    if (re.test(lower)) found.add(family);
  }
  return [...found];
}

/**
 * Return all words that mean the given canonical color family.
 * "brown" → ['brown', 'cognac', 'tobacco', 'walnut', ...]
 */
export function getColorFamilyWords(family) {
  return COLOR_KEYWORDS[family] || [family];
}

/**
 * Find the first variant whose label belongs to the given color family.
 * Returns the variant object or null. Variant labels are short and clean
 * (e.g. 'Brown/Walnut', 'Sage Green', 'Natural'), so substring match is safe.
 *
 * NEW in Build 71 Fix #2 — prior to this, the 1,463 variants across 399
 * products were invisible to the matcher: a sofa whose default name said
 * "beige" with a "Sage Green" variant never matched the user prompt
 * "green living room" on color.
 */
export function findMatchingColorVariant(product, family) {
  if (!product || !Array.isArray(product.variants) || product.variants.length === 0) return null;
  const words = getColorFamilyWords(family);
  for (const v of product.variants) {
    const label = (v && v.label ? String(v.label) : '').toLowerCase();
    if (!label) continue;
    if (words.some(w => label.includes(w))) return v;
  }
  return null;
}

// ── Per-product color derivation cache (Build 71 Fix #3) ─────────────────
// Keyed by product.id. Values are arrays of canonical color families.
// Populated on first lookup; reused for the remaining session. A 399-product
// catalog fills the cache in ~5ms total and then scoreProduct's color checks
// become O(1) array lookups instead of text-scan + variant-scan per call.
const _productColorCache = new Map();

/**
 * Derive all canonical color families present in a product by scanning every
 * text signal it carries: name, description, tags, features, and variant
 * labels. Results memoized by product.id.
 *
 * Returns an array of canonical family names (e.g. ['brown', 'beige']).
 * Empty array if no colors detected.
 *
 * Build 71 Fix #3: surfacing this value means a product's colors become a
 * first-class field. Downstream screens (cards, PDP) can render swatches
 * without re-scanning. And because detectColorFamilies uses word boundaries,
 * we eliminate the old substring false-positives (e.g. "tan" matching
 * "tantrum" or "sand" matching "thousand").
 */
export function getProductColorFamilies(product) {
  if (!product) return [];
  if (product.id && _productColorCache.has(product.id)) {
    return _productColorCache.get(product.id);
  }
  const text = [
    product.name || '',
    product.description || '',
    ...(product.tags || []),
    ...(product.features || []),
    ...((product.variants || []).map(v => (v && v.label) ? String(v.label) : '')),
  ].join(' ');
  const families = detectColorFamilies(text);
  if (product.id) _productColorCache.set(product.id, families);
  return families;
}

/**
 * True if the product belongs to the given canonical color family, considering
 * name, description, tags, features, and variant labels.
 *
 * Build 71 Fix #3: now backed by getProductColorFamilies — same result set,
 * but faster (memoized) and stricter (word-boundary matching via
 * detectColorFamilies). Prior implementation used naive substring matching
 * which occasionally flagged products with unrelated words like "tantrum"
 * or "thousand" as color matches.
 */
export function productHasColorFamily(product, family) {
  if (!product || !family) return false;
  return getProductColorFamilies(product).includes(family);
}

// ─── Opposite-color pairs ───────────────────────────────────────────────
// When the user says "brown" and the product is clearly "white/charcoal/gray",
// apply a penalty. Prevents wrong-color products from winning on other signals.
export const COLOR_OPPOSITES = {
  // Light/neutral vs dark
  white:     ['brown', 'cognac', 'walnut', 'espresso', 'black', 'charcoal', 'navy', 'dark', 'chocolate'],
  ivory:     ['brown', 'cognac', 'walnut', 'espresso', 'black', 'charcoal', 'navy', 'dark'],
  cream:     ['brown', 'cognac', 'walnut', 'espresso', 'black', 'charcoal', 'navy', 'dark', 'rust', 'terracotta'],
  beige:     ['black', 'charcoal', 'navy', 'rust', 'terracotta'],
  // Dark vs light
  black:     ['white', 'ivory', 'cream', 'beige', 'light', 'oak', 'birch', 'natural'],
  charcoal:  ['white', 'ivory', 'cream', 'beige', 'light', 'oak', 'birch', 'natural'],
  gray:      ['brown', 'cognac', 'walnut', 'rust', 'terracotta', 'cream', 'ivory', 'white', 'beige'],
  // Brown/warm vs cool/neutral
  brown:     ['white', 'ivory', 'cream', 'gray', 'grey', 'charcoal', 'navy', 'black', 'teal', 'mint'],
  cognac:    ['white', 'ivory', 'cream', 'gray', 'grey', 'charcoal', 'navy', 'teal', 'mint'],
  walnut:    ['white', 'ivory', 'cream', 'oak', 'birch', 'natural', 'light'],
  // Cool vs warm
  navy:      ['cream', 'ivory', 'beige', 'rust', 'terracotta', 'orange', 'gold', 'brown', 'cognac'],
  blue:      ['rust', 'terracotta', 'orange', 'red', 'cognac', 'tobacco'],
  teal:      ['rust', 'terracotta', 'orange', 'red', 'brown', 'cognac'],
  green:     ['rust', 'terracotta', 'red', 'pink'],
  sage:      ['rust', 'terracotta', 'red', 'pink', 'navy', 'black'],
  // Warm vs cool/muted
  rust:      ['gray', 'grey', 'charcoal', 'navy', 'teal', 'white', 'cream'],
  terracotta:['gray', 'grey', 'charcoal', 'navy', 'teal', 'white', 'cream'],
  red:       ['gray', 'grey', 'charcoal', 'navy', 'teal', 'green', 'sage'],
};

/**
 * Calculate an opposition penalty for this product given the user's requested
 * color family. Returns a positive number (the penalty to SUBTRACT). Returns
 * 0 if there's no opposition.
 *
 * @param {string} userColorFamily - e.g. 'brown'
 * @param {object} product - catalog product row
 * @param {number} penaltyPerHit - penalty for each opposing word found (default 6)
 * @returns {number} penalty (always ≥ 0)
 */
export function getColorOppositionPenalty(userColorFamily, product, penaltyPerHit = 6) {
  if (!userColorFamily) return 0;
  // Build 71 Fix #2: if the product has a matching variant in the requested
  // family, no penalty — the user can buy THAT variant. A "white boucle"
  // sofa with a "cognac leather" variant is valid for a "brown leather" prompt.
  if (findMatchingColorVariant(product, userColorFamily)) return 0;
  // Get all opposing words for this family (plus opposites of its synonyms)
  const opposites = new Set();
  const directOpposites = COLOR_OPPOSITES[userColorFamily] || [];
  directOpposites.forEach(w => opposites.add(w));
  // Also check opposites of this family's alt words (e.g. 'cognac' → brown's opposites)
  const familyWords = getColorFamilyWords(userColorFamily);
  for (const w of familyWords) {
    const altOpposites = COLOR_OPPOSITES[w];
    if (altOpposites) altOpposites.forEach(o => opposites.add(o));
  }
  if (opposites.size === 0) return 0;

  const text = [
    product.name || '',
    product.description || '',
    ...(product.tags || []),
  ].join(' ').toLowerCase();

  let hits = 0;
  for (const word of opposites) {
    const re = new RegExp(`\\b${word}\\b`);
    if (re.test(text)) hits++;
  }
  return hits * penaltyPerHit;
}
