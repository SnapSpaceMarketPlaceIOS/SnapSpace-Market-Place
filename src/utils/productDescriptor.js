/**
 * productDescriptor — Shared helper that extracts short, flux-friendly visual
 * descriptors (color + material + shape + type + category) from a product's
 * catalog metadata.
 *
 * Used by:
 *   - services/bfl.js → BFL kontext prompt (text-only refs fallback)
 *   - services/replicate.js → flux-2-max panel prompt (visual refs)
 *
 * Why it's shared: flux-2-max's attention weighting means the richness of the
 * product description matters just as much in the visual-ref path as in the
 * text-only fallback. Previously the panel prompt used generic category labels
 * ("top-left: sofa") which let flux's text prior override the visual reference.
 * Feeding rich descriptors into both paths keeps the rendered item anchored to
 * the catalog product's color/material/shape/type.
 */

// Words in product.tags that describe COLOR.
const COLOR_TAG_WORDS = new Set([
  'walnut', 'oak', 'birch', 'pine', 'cherry', 'mahogany', 'teak',
  'white', 'ivory', 'cream', 'beige', 'natural', 'linen',
  'black', 'charcoal', 'ebony', 'onyx', 'dark',
  'gray', 'grey', 'slate', 'silver',
  'brown', 'cognac', 'tan', 'caramel', 'chestnut', 'espresso', 'mocha',
  'navy', 'blue', 'teal', 'indigo', 'ocean',
  'green', 'sage', 'olive', 'forest', 'emerald',
  'rust', 'terracotta', 'red', 'burgundy',
  'gold', 'brass', 'copper', 'bronze',
  'marble', 'travertine', 'stone',
]);

// Words in product.tags that describe SHAPE / silhouette.
const SHAPE_TAG_WORDS = new Set([
  'round', 'oval', 'square', 'rectangular', 'curved', 'angular',
  'low-profile', 'tall', 'slim', 'chunky', 'sculptural',
  'clean-lines', 'modular', 'tufted', 'winged', 'minimalist',
  'open', 'airy', 'sleek', 'compact', 'oversized',
]);

// Words that identify sub-TYPE within a category (loveseat vs 3-seater etc).
// Extracted from the product NAME because the catalog encodes type there.
const TYPE_KEYWORDS = [
  // sofas
  'loveseat', 'sectional', 'sleeper', 'chaise', 'settee', 'tuxedo', 'chesterfield',
  // sofa sizes
  '2-seater', '3-seater', '4-seater', '5-seater', 'oversized', 'compact',
  // chairs
  'armchair', 'accent', 'lounge', 'swivel', 'recliner', 'rocker', 'barrel', 'slipper',
  'wingback', 'bergere', 'club',
  // tables
  'nesting', 'pedestal', 'drum', 'trunk', 'cocktail', 'side',
  // beds
  'platform', 'canopy', 'sleigh', 'bunk', 'daybed', 'storage',
  'king', 'queen', 'full', 'twin',
  // rugs
  'runner', 'area', 'round', 'washable',
  // lighting
  'arc', 'tripod', 'task', 'torchiere', 'swing-arm',
];

// Feature phrases that add visual specificity to the AI prompt.
// We look for short phrases that describe visual attributes the model can render.
const VISUAL_FEATURE_KEYWORDS = [
  // More specific compound terms first — prevents "tufted" matching before "channel-tufted"
  'channel-tufted', 'button-tufted', 'hand-woven', 'handwoven',
  'hand-knotted', 'hand-painted', 'handcrafted', 'hand-carved',
  'glass-top', 'marble-top', 'stone-top', 'open-shelf',
  'tufted', 'pleated', 'fluted', 'ribbed', 'slatted', 'spindle', 'turned',
  'tapered', 'hairpin', 'splayed', 'cabriole',
  'adjustable', 'reversible', 'removable',
  'woven', 'braided', 'macrame', 'lattice', 'cane',
  'matte', 'glossy', 'distressed', 'weathered', 'antiqued',
  'arched', 'dome', 'cylinder', 'conical', 'globe',
  'frosted', 'smoked', 'clear', 'textured',
];

function extractVisualFeature(features) {
  if (!Array.isArray(features) || features.length === 0) return '';
  for (const feat of features) {
    const lower = feat.toLowerCase();
    for (const kw of VISUAL_FEATURE_KEYWORDS) {
      if (lower.includes(kw)) {
        // Return just the keyword, not the full feature sentence
        return kw;
      }
    }
  }
  return '';
}

function extractTypeWord(name) {
  if (!name || typeof name !== 'string') return '';
  const lower = name.toLowerCase();
  for (const kw of TYPE_KEYWORDS) {
    // Match as whole word — avoid partial hits inside brand names
    const re = new RegExp(`\\b${kw}\\b`);
    if (re.test(lower)) return kw;
  }
  return '';
}

/**
 * Build a tight visual descriptor for a single catalog product.
 *
 * Format: "[color] [material] [shape] [type] [category]"
 *   e.g. "cognac leather oversized loveseat sofa"
 *        "walnut wood round pedestal coffee table"
 *        "cream wool area rug"
 *
 * Unused slots are skipped. Resulting string is 2–5 words.
 *
 * Variant override (post-Build-105 fidelity pass): when the matcher swapped
 * the product to a specific variant via `_matchedVariant`, the variant's
 * label (e.g. "Sage Green", "Walnut Top-Grain Leather") is the most
 * authoritative signal for what the user will actually receive — it matches
 * the swapped imageUrl and the affiliateUrl. We parse the label for any
 * recognized color/shape tokens and prefer them over the base product's
 * tags. Without this, a "sage green" prompt could swap the variant image
 * correctly while the prompt descriptor still said "ivory" because the
 * base product's tags listed the default variant's color. Products without
 * a matched variant fall through to the unchanged base-tag path — no
 * regression for the no-variant case.
 *
 * @param {object} p - product row from productCatalog
 * @returns {string}  short visual descriptor (may be empty string)
 */
export function describeProductForPrompt(p) {
  if (!p || typeof p !== 'object') return '';
  const category = (p.category || 'furniture').replace(/-/g, ' ');

  const tags = Array.isArray(p.tags) ? p.tags : [];
  const baseColors  = tags.filter(t => COLOR_TAG_WORDS.has(t));
  const baseShapes  = tags.filter(t => SHAPE_TAG_WORDS.has(t));
  const materials   = Array.isArray(p.materials) ? p.materials : [];

  // Variant-label tokens (if the matcher swapped to a specific variant).
  // Tokenize on whitespace + common separators so labels like "Sage Green",
  // "Walnut Top-Grain Leather", or "Cognac/Tan" all get parsed correctly.
  const variantLabel =
    p._matchedVariant && typeof p._matchedVariant.label === 'string'
      ? p._matchedVariant.label.toLowerCase()
      : '';
  const variantTokens = variantLabel
    ? variantLabel.split(/[\s\-_/,]+/).filter(Boolean)
    : [];
  const variantColor = variantTokens.find((t) => COLOR_TAG_WORDS.has(t)) || '';
  const variantShape = variantTokens.find((t) => SHAPE_TAG_WORDS.has(t)) || '';

  // Pick the most specific color. Variant override wins when present —
  // it's the authoritative signal for the variant the user will receive.
  // For base-only fallback, prefer longer tokens ("cognac" > "brown",
  // "sage" > "green") to keep the prior behavior intact.
  const sortedBaseColors = [...baseColors].sort((a, b) => b.length - a.length);
  const color    = variantColor || sortedBaseColors[0] || '';
  const material = materials[0]    || '';
  const shape    = variantShape || baseShapes[0]   || '';
  const typeWord = extractTypeWord(p.name || '');

  // Extract a visual feature for additional specificity
  const visualFeature = extractVisualFeature(p.features || []);

  const parts = [color, material, visualFeature, shape, typeWord, category].filter(Boolean);
  // Dedupe adjacent repeats (e.g. if typeWord matches category)
  const deduped = parts.filter((w, i) => w !== parts[i - 1]);
  return deduped.join(' ').trim();
}
