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
 * True if the product's text contains ANY word from the given color family.
 * Product text = name + description + tags joined.
 */
export function productHasColorFamily(product, family) {
  const words = getColorFamilyWords(family);
  const text = [
    product.name || '',
    product.description || '',
    ...(product.tags || []),
  ].join(' ').toLowerCase();
  return words.some(w => text.includes(w));
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
