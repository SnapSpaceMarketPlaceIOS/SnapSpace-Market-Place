import { PRODUCT_CATALOG } from '../data/productCatalog';
import { STYLE_AFFINITY } from '../data/styleMap';

// Max products per category in a single result set (prevents showing 6 sofas)
const MAX_PER_CATEGORY = 2;

// How many top candidates per category to randomize among
// Higher = more variety between generations (at slight cost to relevance)
const RANDOM_POOL_SIZE = 4;

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
export function matchProducts(parsedPrompt, limit = 6, catalog = PRODUCT_CATALOG) {
  const { roomType, styles, materials, furnitureCategories = [], moods = [] } = parsedPrompt;

  const scored = catalog.map((product) => {
    const score = scoreProduct(product, roomType, styles, materials, furnitureCategories, moods);
    // Add ±8% random noise so high-scoring products rotate between generations.
    // Without this, the same top-N products win every time on an identical prompt.
    const noise = (Math.random() - 0.5) * Math.max(score, 5) * 0.16;
    return { ...product, _score: score + noise };
  });

  scored.sort((a, b) => b._score - a._score);

  return diversify(scored, limit);
}

// Moods that suggest higher-end / premium items — boosts rating weight
const LUXURY_MOODS = ['luxurious', 'elegant', 'opulent', 'rich', 'sophisticated', 'dark-luxe'];
const COZY_MOODS   = ['cozy', 'warm', 'inviting', 'comfortable', 'relaxed'];

/**
 * Score a single product against the detected design intent.
 * Scoring formula (revised):
 *   style match:            35 pts
 *   room type match:        25 pts
 *   material match:         15 pts
 *   furniture category:     15 pts  (NEW — uses furnitureCategories)
 *   mood bonus:              5 pts  (NEW — uses moods)
 *   rating bonus:            5 pts
 */
function scoreProduct(product, roomType, styles, materials, furnitureCategories = [], moods = []) {
  let score = 0;

  // ── Room type match (25 points) ───────────────────────────────────────────
  const productRooms = Array.isArray(product.roomType) ? product.roomType : [product.roomType];
  if (productRooms.includes(roomType)) {
    score += 25;
  } else if (productRooms.includes('living-room')) {
    score += 6;
  }

  // ── Style match (35 points) ───────────────────────────────────────────────
  const styleScore = computeStyleScore(product.styles, styles);
  score += styleScore * 35;

  // ── Material match (15 points) ────────────────────────────────────────────
  if (materials && materials.length > 0) {
    const materialMatches = (product.materials || []).filter((m) =>
      materials.includes(m)
    ).length;
    const materialScore = Math.min(materialMatches / materials.length, 1);
    score += materialScore * 15;
  }

  // ── Furniture category match (15 points) — NEW ────────────────────────────
  if (furnitureCategories && furnitureCategories.length > 0) {
    if (furnitureCategories.includes(product.category)) {
      score += 15;
    } else {
      // Partial credit for related categories
      const RELATED = {
        'sofa': ['accent-chair', 'loveseat'],
        'bed': ['nightstand', 'dresser'],
        'dining-table': ['dining-chair'],
        'desk': ['desk-chair', 'bookshelf'],
        'lamp': ['floor-lamp', 'table-lamp', 'pendant-light'],
      };
      for (const requested of furnitureCategories) {
        const related = RELATED[requested] || [];
        if (related.includes(product.category)) {
          score += 5;
          break;
        }
      }
    }
  }

  // ── Mood bonus (5 points) — NEW ───────────────────────────────────────────
  if (moods && moods.length > 0) {
    const isLuxury = moods.some((m) => LUXURY_MOODS.includes(m));
    const isCozy   = moods.some((m) => COZY_MOODS.includes(m));

    if (isLuxury && product.rating && product.rating >= 4.5) {
      score += 5;
    } else if (isCozy && (product.materials || []).some((m) => ['velvet', 'linen', 'wool', 'cotton', 'rattan'].includes(m))) {
      score += 5;
    } else if (moods.length > 0) {
      score += 1;
    }
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

  // First pass: from top scorers per category, pick randomly among top 2
  // so results vary between generations with the same small catalog
  for (const cat of CATEGORY_PRIORITY) {
    if (result.length >= limit) break;
    const candidates = sorted.filter(
      (p) => p.category === cat && (categoryCounts[cat] || 0) < MAX_PER_CATEGORY
    );
    if (candidates.length === 0) continue;
    // Pick randomly among top scorers in this category for variety between generations
    const pool = candidates.slice(0, RANDOM_POOL_SIZE);
    const candidate = pool[Math.floor(Math.random() * pool.length)];
    result.push(candidate);
    categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
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

  // Enforce minimum 4 unique categories when limit >= 6
  if (limit >= 6 && result.length >= 6) {
    const uniqueCategories = new Set(result.slice(0, 6).map((p) => p.category)).size;
    if (uniqueCategories < 4) {
      // Replace duplicates with highest-scored products from new categories
      const usedCategories = new Set(result.slice(0, 6).map((p) => p.category));
      const extras = sorted.filter(
        (p) => !usedCategories.has(p.category) && !result.find((r) => r.id === p.id)
      );
      let replaceIdx = result.length - 1;
      for (const extra of extras) {
        if (usedCategories.size >= 4) break;
        result[replaceIdx] = extra;
        usedCategories.add(extra.category);
        replaceIdx--;
      }
    }
  }

  return result.slice(0, limit);
}

/**
 * Convenience: match products from raw design tags (used by Explore designs).
 * Converts design.styles and design.roomType into the parsedPrompt shape.
 */
export function matchProductsForDesign(design, limit = 4, catalog = PRODUCT_CATALOG) {
  const parsedPrompt = {
    roomType: design.roomType || 'living-room',
    styles: design.styles || [],
    materials: [],
    moods: [],
    furnitureCategories: [],
  };
  return matchProducts(parsedPrompt, limit, catalog);
}
