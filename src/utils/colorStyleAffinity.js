/**
 * colorStyleAffinity.js — Build 130
 *
 * Maps each color family to the design styles where that color amplifies
 * the product's stylistic appeal. The user's theory:
 *
 *   "If a chair is blue, red, yellow, green, black, brown — purple/green/blue
 *    variants connect with glam/maximalist/eclectic; brown/black with
 *    mid-century/dark-luxe; cream/white with scandi/japandi."
 *
 * This file makes that algorithmic. Product variants whose color belongs to
 * a style-affinity bucket get a small scoring boost when the prompt's style
 * matches the bucket — without us having to manually tag every variant.
 *
 * Used by:
 *   - productMatcher.js → optional variant-style affinity bonus (max 5 pts)
 *
 * IMPORTANT: this is purely additive. Products without color-aligned variants
 * still score normally on parent-level styles. We never DOWNGRADE a product
 * because of variant color — only upgrade.
 */

import { detectColorFamilies } from './colorMap';

// ─── Color → Style affinity map ─────────────────────────────────────────
// Conservative coverage: only colors with strong cultural/design-history
// associations. When in doubt, leave a color out rather than add a weak edge.
export const COLOR_STYLE_AFFINITY = {
  // Saturated jewel tones → glam, maximalist, art-deco, eclectic
  purple:    ['glam', 'maximalist', 'art-deco', 'bohemian'],
  red:       ['glam', 'maximalist', 'art-deco'],
  pink:      ['glam', 'maximalist', 'french-country', 'art-deco'],

  // Earthy warmths → mid-century, rustic, mediterranean, bohemian
  rust:      ['mid-century', 'bohemian', 'rustic', 'mediterranean'],
  orange:    ['mid-century', 'bohemian', 'maximalist'],
  yellow:    ['mid-century', 'maximalist'],
  gold:      ['glam', 'art-deco', 'maximalist'],

  // Cool jewel → coastal, art-deco, glam
  navy:      ['coastal', 'art-deco', 'glam', 'transitional'],
  blue:      ['coastal', 'art-deco', 'mediterranean'],
  teal:      ['art-deco', 'coastal', 'maximalist'],

  // Earthy/biophilic → biophilic, japandi, wabi-sabi
  green:     ['biophilic', 'japandi', 'wabi-sabi', 'mid-century'],

  // Brown family — strong mid-century / rustic / traditional anchor
  brown:     ['mid-century', 'rustic', 'transitional', 'industrial'],

  // Neutrals — scandi/japandi/minimalist tilt
  white:     ['scandi', 'minimalist', 'modern', 'coastal', 'japandi'],
  beige:     ['wabi-sabi', 'japandi', 'mediterranean', 'coastal', 'french-country'],

  // Dark → dark-luxe, industrial, modern
  black:     ['dark-luxe', 'industrial', 'modern', 'art-deco'],
  charcoal:  ['dark-luxe', 'industrial', 'modern'],
  gray:      ['minimalist', 'modern', 'industrial', 'scandi'],

  // Warm metallic
  copper:    ['glam', 'industrial', 'art-deco'],
};

/**
 * Returns the styles that a given color family amplifies.
 * Empty array for unknown or low-confidence colors.
 */
export function getColorStyleAffinity(colorFamily) {
  return COLOR_STYLE_AFFINITY[colorFamily] || [];
}

/**
 * Given a variant (with .label) and the prompt's detected styles, return a
 * boost factor 0–1 reflecting how strongly the variant's color reinforces
 * those styles.
 *
 *   1.0  — variant color is in affinity-set for at least one prompt style
 *   0    — no color in label, or no overlap
 *
 * @param {object} variant - { label: string } at minimum
 * @param {string[]} promptStyles - Detected styles from the parsed prompt
 * @returns {number} Boost factor 0–1
 */
export function getVariantStyleBoost(variant, promptStyles) {
  if (!variant || !variant.label || !Array.isArray(promptStyles) || promptStyles.length === 0) {
    return 0;
  }
  const colors = detectColorFamilies(String(variant.label));
  if (colors.length === 0) return 0;

  for (const c of colors) {
    const affinityStyles = COLOR_STYLE_AFFINITY[c];
    if (!affinityStyles) continue;
    for (const ps of promptStyles) {
      if (affinityStyles.includes(ps)) return 1.0;
    }
  }
  return 0;
}

/**
 * Returns the BEST variant to surface for a given product when the user has
 * specified prompt styles but NOT a specific color. Used as a soft fallback:
 * if no color was extracted from the prompt, but a strong style was, prefer
 * the variant whose color amplifies that style over the default variant.
 *
 * Returns null if no variant has a non-zero affinity boost — caller should
 * keep the default behavior.
 *
 * @param {object} product - Product with .variants array
 * @param {string[]} promptStyles - Detected styles
 * @returns {object|null} Best variant or null
 */
export function findBestStyleAffinityVariant(product, promptStyles) {
  if (!product || !Array.isArray(product.variants) || product.variants.length === 0) return null;
  if (!Array.isArray(promptStyles) || promptStyles.length === 0) return null;

  let best = null;
  let bestScore = 0;

  for (const v of product.variants) {
    if (!v || !v.label) continue;
    const score = getVariantStyleBoost(v, promptStyles);
    if (score > bestScore) {
      best = v;
      bestScore = score;
    }
  }
  return best;
}
