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
 * @param {object} p - product row from productCatalog
 * @returns {string}  short visual descriptor (may be empty string)
 */
export function describeProductForPrompt(p) {
  if (!p || typeof p !== 'object') return '';
  const category = (p.category || 'furniture').replace(/-/g, ' ');

  const tags = Array.isArray(p.tags) ? p.tags : [];
  const colorWords  = tags.filter(t => COLOR_TAG_WORDS.has(t));
  const shapeWords  = tags.filter(t => SHAPE_TAG_WORDS.has(t));
  const materials   = Array.isArray(p.materials) ? p.materials : [];

  const color    = colorWords[0]  || '';
  const material = materials[0]   || '';
  const shape    = shapeWords[0]  || '';
  const typeWord = extractTypeWord(p.name || '');

  const parts = [color, material, shape, typeWord, category].filter(Boolean);
  // Dedupe adjacent repeats (e.g. if typeWord matches category)
  const deduped = parts.filter((w, i) => w !== parts[i - 1]);
  return deduped.join(' ').trim();
}
