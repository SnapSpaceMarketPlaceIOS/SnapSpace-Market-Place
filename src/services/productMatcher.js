import { PRODUCT_CATALOG } from '../data/productCatalog';
import { STYLE_AFFINITY } from '../data/styleMap';

// Max products per category in a single result set (prevents showing 6 sofas)
const MAX_PER_CATEGORY = 2;

/**
 * Scores and ranks catalog products against a parsed design prompt.
 * Returns top N products, diversified across furniture categories.
 *
 * Scoring formula:
 *   style match:      40%
 *   room type match:  30%
 *   material match:   20%
 *   category bonus:   10%
 *
 * @param {object} parsedPrompt - Output from promptParser.parseDesignPrompt()
 * @param {number} limit        - Max products to return (default 6)
 * @returns {object[]}          - Sorted, diversified product array
 */
export function matchProducts(parsedPrompt, limit = 6) {
  const { roomType, styles, materials } = parsedPrompt;

  const scored = PRODUCT_CATALOG.map((product) => {
    const score = scoreProduct(product, roomType, styles, materials);
    return { ...product, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);

  return diversify(scored, limit);
}

/**
 * Score a single product against the detected design intent.
 */
function scoreProduct(product, roomType, styles, materials) {
  let score = 0;

  // ── Room type match (30 points) ───────────────────────────────────────────
  if (product.roomType.includes(roomType)) {
    score += 30;
  } else if (product.roomType.includes('living-room')) {
    // Living room products are versatile fallbacks
    score += 8;
  }

  // ── Style match (40 points) ───────────────────────────────────────────────
  const styleScore = computeStyleScore(product.styles, styles);
  score += styleScore * 40;

  // ── Material match (20 points) ────────────────────────────────────────────
  if (materials && materials.length > 0) {
    const materialMatches = product.materials.filter((m) =>
      materials.includes(m)
    ).length;
    const materialScore = Math.min(materialMatches / materials.length, 1);
    score += materialScore * 20;
  }

  // ── Rating bonus (up to 5 points) ────────────────────────────────────────
  if (product.rating) {
    score += ((product.rating - 3.5) / 1.5) * 5;
  }

  return score;
}

/**
 * Computes a 0–1 style affinity score between product styles and detected styles.
 */
function computeStyleScore(productStyles, detectedStyles) {
  if (!detectedStyles || detectedStyles.length === 0) return 0;

  let best = 0;

  for (const detected of detectedStyles) {
    const affinityMap = STYLE_AFFINITY[detected] || {};
    for (const productStyle of productStyles) {
      const affinity = affinityMap[productStyle] || 0;
      if (affinity > best) best = affinity;
    }
    // Direct match shortcut
    if (productStyles.includes(detected)) {
      best = Math.max(best, 1.0);
    }
  }

  return best;
}

/**
 * Diversify results so no more than MAX_PER_CATEGORY products share a category.
 * Priority categories: seating → tables → lighting → textiles → decor → storage
 */
function diversify(sorted, limit) {
  const CATEGORY_PRIORITY = [
    'sofa', 'accent-chair', 'bed', 'dining-chair', 'desk-chair', 'bar-stool',
    'coffee-table', 'dining-table', 'side-table', 'nightstand', 'desk',
    'floor-lamp', 'table-lamp', 'pendant-light', 'chandelier',
    'rug', 'throw-pillow', 'throw-blanket',
    'mirror', 'wall-art', 'planter', 'vase',
    'bookshelf', 'dresser',
  ];

  const categoryCounts = {};
  const result = [];

  // First pass: include highest-scoring product from each priority category
  for (const cat of CATEGORY_PRIORITY) {
    if (result.length >= limit) break;
    const candidate = sorted.find(
      (p) => p.category === cat && (categoryCounts[cat] || 0) < MAX_PER_CATEGORY
    );
    if (candidate) {
      result.push(candidate);
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  }

  // Second pass: fill remaining slots with highest-scored remaining items
  if (result.length < limit) {
    for (const product of sorted) {
      if (result.length >= limit) break;
      if (!result.find((p) => p.id === product.id)) {
        if ((categoryCounts[product.category] || 0) < MAX_PER_CATEGORY) {
          result.push(product);
          categoryCounts[product.category] = (categoryCounts[product.category] || 0) + 1;
        }
      }
    }
  }

  return result.slice(0, limit);
}

/**
 * Convenience: match products from raw design tags (used by Explore designs).
 * Converts design.styles and design.roomType into the parsedPrompt shape.
 */
export function matchProductsForDesign(design, limit = 4) {
  const parsedPrompt = {
    roomType: design.roomType || 'living-room',
    styles: design.styles || [],
    materials: [],
    moods: [],
    furnitureCategories: [],
  };
  return matchProducts(parsedPrompt, limit);
}
