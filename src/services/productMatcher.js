import { PRODUCT_CATALOG } from '../data/productCatalog';
import { STYLE_AFFINITY, ROOM_FURNITURE } from '../data/styleMap';

// Max products per category in a single result set.
// Limit to 1 per category to match what's actually in the AI-generated image —
// a room typically has 1 sofa, 1 coffee table, 1 rug, etc.
const MAX_PER_CATEGORY = 1;

// How many top candidates per category to consider.
// Set to 1 to always pick the highest-scored product — eliminates randomness
// that caused different (wrong) products to display on each generation run.
const RANDOM_POOL_SIZE = 1;

// Categories that are ONLY appropriate for specific room types.
// If a product's category is in this map, it can only appear for those rooms.
// Categories NOT listed here (rug, mirror, wall-art, planter, vase, lamp, etc.)
// are considered universal and can appear in any room.
const CATEGORY_ROOM_LOCK = {
  'bed':            ['bedroom'],
  'nightstand':     ['bedroom'],
  'dresser':        ['bedroom'],
  'dining-table':   ['dining-room'],
  'dining-chair':   ['dining-room'],
  'chandelier':     ['dining-room', 'bedroom', 'entryway'],
  'bar-stool':      ['kitchen', 'dining-room'],
  'kitchen-island': ['kitchen'],
  'desk':           ['office'],
  'desk-chair':     ['office'],
};

/**
 * Scores and ranks catalog products against a parsed design prompt.
 * Returns top N products, diversified across furniture categories.
 *
 * HARD FILTERS (applied before scoring — products that fail are excluded):
 *   1. Room type: product.roomType must include the detected room
 *   2. Category lock: bedroom-only items (bed, nightstand) can't appear in living room results
 *
 * Scoring formula (applied to filtered candidates only):
 *   style match:      30 pts
 *   room type match:  20 pts
 *   tag match:        15 pts
 *   material match:   10 pts
 *   category match:   10 pts
 *   mood bonus:        5 pts
 *   rating bonus:      5 pts
 *   name match:        5 pts
 *
 * @param {object} parsedPrompt - Output from promptParser.parseDesignPrompt()
 * @param {number} limit        - Max products to return (default 6)
 * @returns {object[]}          - Sorted, diversified product array
 */
export function matchProducts(parsedPrompt, limit = 6, catalog = PRODUCT_CATALOG) {
  const { roomType, styles, materials, furnitureCategories = [], moods = [], promptTokens = [] } = parsedPrompt;

  // ── HARD FILTER 1: Room type ──────────────────────────────────────────────
  // Only consider products that list this room type in their roomType array.
  // This prevents beds from appearing in living room results, dining tables
  // in bedroom results, etc.
  const roomFiltered = catalog.filter((product) => {
    const productRooms = Array.isArray(product.roomType) ? product.roomType : [product.roomType];
    return productRooms.includes(roomType);
  });

  // ── HARD FILTER 2: Category lock ──────────────────────────────────────────
  // Even if a product lists 'living-room' in its roomType, a bed category
  // product should never show for a living room. This catches edge cases
  // where products have overly broad roomType arrays.
  const categoryFiltered = roomFiltered.filter((product) => {
    const allowedRooms = CATEGORY_ROOM_LOCK[product.category];
    if (!allowedRooms) return true; // universal category, always allowed
    return allowedRooms.includes(roomType);
  });

  // ── HARD FILTER 3: Style affinity ─────────────────────────────────────────
  // Only allow products that have >= 0.4 style affinity with the detected styles.
  // This prevents farmhouse products from appearing in minimalist results,
  // bohemian bean bags from appearing in modern results, etc.
  // A product with style affinity 0 (completely unrelated style) should never
  // be shown regardless of how well it scores on tags/rating/name.
  const styleFiltered = categoryFiltered.filter((product) => {
    if (!styles || styles.length === 0) return true; // no style detected, allow all
    const affinity = computeStyleScore(product.styles, styles);
    return affinity >= 0.4;
  });

  // Cascade fallback: style-filtered → category-filtered → room-filtered
  // Widened from `>= limit` to `>= limit * 3` so the scoring phase has a
  // richer candidate pool even when the strict style filter returns more
  // than `limit` products. Scoring still dominates (style = 40 pts) so
  // style-matching products still win; this just prevents the looser pool
  // from being ignored when the strict pool is thin.
  const MIN_POOL = limit * 3;
  const candidates = styleFiltered.length >= MIN_POOL ? styleFiltered
    : categoryFiltered.length >= MIN_POOL ? categoryFiltered
    : roomFiltered;

  const scored = candidates.map((product) => {
    const score = scoreProduct(product, roomType, styles, materials, furnitureCategories, moods, promptTokens);
    // No random noise — deterministic scoring so the best-matched products
    // always win for a given prompt, giving consistent product display every run.
    return { ...product, _score: score };
  });

  scored.sort((a, b) => b._score - a._score);

  return diversify(scored, limit, roomType);
}

// Moods that suggest higher-end / premium items — boosts rating weight
const LUXURY_MOODS = ['luxurious', 'elegant', 'opulent', 'rich', 'sophisticated', 'dark-luxe'];
const COZY_MOODS   = ['cozy', 'warm', 'inviting', 'comfortable', 'relaxed'];

/**
 * Score a single product against the detected design intent.
 * Scoring formula — style is dominant because visual coherence matters most:
 *   style match:            40 pts  (the #1 signal — determines visual fit)
 *   room type match:        15 pts
 *   tag match:              15 pts  (matches product.tags against raw prompt words)
 *   material match:         10 pts
 *   furniture category:     10 pts
 *   mood bonus:              5 pts
 *   rating bonus:            3 pts  (reduced — high rating ≠ visual fit)
 *   name match bonus:        2 pts  (reduced — name words ≠ visual fit)
 */
function scoreProduct(product, roomType, styles, materials, furnitureCategories = [], moods = [], promptTokens = []) {
  let score = 0;

  // ── Room type match (15 points) ───────────────────────────────────────────
  const productRooms = Array.isArray(product.roomType) ? product.roomType : [product.roomType];
  if (productRooms.includes(roomType)) {
    score += 15;
  } else if (productRooms.includes('living-room')) {
    score += 3;
  }

  // ── Style match (40 points — dominant signal) ─────────────────────────────
  const styleScore = computeStyleScore(product.styles, styles);
  score += styleScore * 40;

  // ── Tag match (15 points) — matches product.tags against raw prompt words ─
  if (product.tags && product.tags.length > 0 && promptTokens.length > 0) {
    const tokenSet = new Set(promptTokens);
    // Also include parsed styles/materials/moods as matchable tokens
    for (const s of styles) tokenSet.add(s);
    for (const m of materials) tokenSet.add(m);
    for (const mo of moods) tokenSet.add(mo);
    const tagHits = product.tags.filter(t => tokenSet.has(t)).length;
    // 4+ tag hits = full 15 points
    const tagScore = Math.min(tagHits / 4, 1);
    score += tagScore * 15;
  }

  // ── Material match (10 points) ────────────────────────────────────────────
  if (materials && materials.length > 0) {
    const materialMatches = (product.materials || []).filter((m) =>
      materials.includes(m)
    ).length;
    const materialScore = Math.min(materialMatches / materials.length, 1);
    score += materialScore * 10;
  }

  // ── Furniture category match (10 points) ──────────────────────────────────
  if (furnitureCategories && furnitureCategories.length > 0) {
    if (furnitureCategories.includes(product.category)) {
      score += 10;
    } else {
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
          score += 3;
          break;
        }
      }
    }
  }

  // ── Mood bonus (5 points) ─────────────────────────────────────────────────
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

  // ── Rating bonus (up to 3 points) ────────────────────────────────────────
  // Reduced weight — high rating doesn't mean visual fit with the style
  if (product.rating) {
    score += ((product.rating - 3.5) / 1.5) * 3;
  }

  // ── Name match bonus (up to 2 points) ────────────────────────────────────
  // Reduced weight — name word overlap is a weak visual signal
  if (promptTokens.length > 0) {
    const nameLower = (product.name || '').toLowerCase();
    const nameHits = promptTokens.filter(t => t.length >= 4 && nameLower.includes(t)).length;
    score += Math.min(nameHits, 2) * 1;
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

// Must-have categories per room — these get reserved slots before anything else.
// A bedroom without a bed or a living room without a sofa looks wrong.
// First 3 items are "essentials" that get priority; rest are standard priority.
const ROOM_ESSENTIALS = {
  'living-room': ['sofa', 'coffee-table', 'rug'],
  'bedroom':     ['bed', 'nightstand', 'rug'],
  'kitchen':     ['bar-stool', 'pendant-light'],
  'dining-room': ['dining-table', 'dining-chair', 'rug'],
  'office':      ['desk', 'desk-chair', 'bookshelf'],
  'bathroom':    ['mirror', 'planter'],
  'outdoor':     ['planter'],
  'nursery':     ['rug', 'bookshelf'],
  'entryway':    ['mirror', 'side-table'],
};

// Fallback priority when essentials are filled or room type unknown.
// Only includes universal categories that work in any room — room-locked
// categories (bed, dining-table, etc.) are handled by ROOM_ESSENTIALS.
const CATEGORY_FALLBACK = [
  'sofa', 'accent-chair',
  'coffee-table', 'side-table',
  'floor-lamp', 'table-lamp', 'pendant-light',
  'rug', 'throw-pillow', 'throw-blanket',
  'mirror', 'wall-art', 'planter', 'vase',
  'bookshelf', 'tv-stand',
];

/**
 * Diversify results: room essentials first, then fill remaining slots.
 *
 * Strategy:
 *   1. Reserve slots for room-essential categories (e.g. bed + nightstand + rug for bedroom)
 *   2. Fill remaining slots from highest-scored products in other categories
 *   3. Enforce 1 product per category max
 *   4. Randomize within top candidates per category for variety
 *
 * @param {object[]} sorted   - Score-sorted product array
 * @param {number}   limit    - Max products to return
 * @param {string}   roomType - Detected room type for essential selection
 */
function diversify(sorted, limit, roomType = 'living-room') {
  const essentials = ROOM_ESSENTIALS[roomType] || ROOM_ESSENTIALS['living-room'];
  const categoryCounts = {};
  const result = [];
  const usedIds = new Set();

  // Helper: pick best available product for a category
  function pickFromCategory(cat) {
    const candidates = sorted.filter(
      (p) => p.category === cat && !usedIds.has(p.id) && (categoryCounts[cat] || 0) < MAX_PER_CATEGORY
    );
    if (candidates.length === 0) return null;
    const pool = candidates.slice(0, RANDOM_POOL_SIZE);
    return pool[Math.floor(Math.random() * pool.length)];
  }

  // Pass 1: Fill essential categories for this room type
  for (const cat of essentials) {
    if (result.length >= limit) break;
    const pick = pickFromCategory(cat);
    if (pick) {
      result.push(pick);
      usedIds.add(pick.id);
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  }

  // Pass 2: Fill remaining room furniture categories (from ROOM_FURNITURE)
  const roomFurniture = ROOM_FURNITURE[roomType] || ROOM_FURNITURE['living-room'];
  for (const cat of roomFurniture) {
    if (result.length >= limit) break;
    if (categoryCounts[cat]) continue; // already have one
    const pick = pickFromCategory(cat);
    if (pick) {
      result.push(pick);
      usedIds.add(pick.id);
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  }

  // Pass 3: Fill any remaining slots from global fallback priority
  for (const cat of CATEGORY_FALLBACK) {
    if (result.length >= limit) break;
    if (categoryCounts[cat]) continue;
    const pick = pickFromCategory(cat);
    if (pick) {
      result.push(pick);
      usedIds.add(pick.id);
      categoryCounts[cat] = (categoryCounts[cat] || 0) + 1;
    }
  }

  // Pass 4: If still short, take highest-scored remaining regardless of category
  if (result.length < limit) {
    for (const product of sorted) {
      if (result.length >= limit) break;
      if (!usedIds.has(product.id) && (categoryCounts[product.category] || 0) < MAX_PER_CATEGORY) {
        result.push(product);
        usedIds.add(product.id);
        categoryCounts[product.category] = (categoryCounts[product.category] || 0) + 1;
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
