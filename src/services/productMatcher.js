import { PRODUCT_CATALOG } from '../data/productCatalog';
import { STYLE_AFFINITY, ROOM_FURNITURE } from '../data/styleMap';
import {
  productHasColorFamily,
  getColorOppositionPenalty,
  getColorFamilyWords,
} from '../utils/colorMap';

// Phase 3: flip to true to see [match] diagnostic logs in Metro for each
// generation. Leave false in production to keep logs tidy.
const MATCH_DEBUG = typeof __DEV__ !== 'undefined' ? __DEV__ : true;

// Minimum number of candidates to keep after a hard filter. If fewer than
// this many products survive, we fall back to the unfiltered pool and let
// scoring handle the trade-off. This prevents a thin catalog from dead-ending
// the user on a highly-specific prompt.
const MIN_HARD_FILTER_CANDIDATES = 2;

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
 * PHASE 3 ARCHITECTURE:
 *   1. Universal hard filters (room type + category lock) — same as before
 *   2. NEW: Per-category attribute hard filter — if user said "brown leather
 *      couch", require the sofa candidate to be brown AND leather. Fallback
 *      to soft scoring if <2 candidates survive.
 *   3. Style affinity filter (≥ 0.4) with cascade fallback
 *   4. Score candidates with rebalanced weights (color + material now
 *      collectively outweigh style)
 *   5. Diversify across categories
 *
 * Scoring formula (sum ≈ 120 max, before penalty):
 *   color match:      25 pts  — NEW in Phase 3, opposes style dominance
 *   style match:      25 pts  — reduced from 40
 *   material match:   20 pts  — raised from 10
 *   room type match:  15 pts
 *   tag match:        15 pts
 *   name match:       15 pts  — raised from 8 for specificity
 *   furniture cat:     5 pts  — reduced from 10
 *   rating bonus:      2 pts  — reduced from 3
 *   color mismatch:  -15 pts  — NEW penalty for opposite colors
 *
 * @param {object} parsedPrompt - Output from promptParser.parseDesignPrompt()
 * @param {number} limit        - Max products to return (default 6)
 * @returns {object[]}          - Sorted, diversified product array
 */
export function matchProducts(parsedPrompt, limit = 6, catalog = PRODUCT_CATALOG) {
  const {
    roomType,
    styles,
    materials,
    colors = [],
    colorByCategory = {},
    materialByCategory = {},
    furnitureCategories = [],
    moods = [],
    promptTokens = [],
  } = parsedPrompt;

  if (MATCH_DEBUG) {
    console.log(
      `[match] parsed: room=${roomType} styles=[${styles.join(',')}] ` +
      `materials=[${materials.join(',')}] colors=[${colors.join(',')}] ` +
      `colorByCat=${JSON.stringify(colorByCategory)} matByCat=${JSON.stringify(materialByCategory)}`
    );
  }

  // ── HARD FILTER 1: Room type ──────────────────────────────────────────────
  const roomFiltered = catalog.filter((product) => {
    const productRooms = Array.isArray(product.roomType) ? product.roomType : [product.roomType];
    return productRooms.includes(roomType);
  });

  // ── HARD FILTER 2: Category lock ──────────────────────────────────────────
  const categoryFiltered = roomFiltered.filter((product) => {
    const allowedRooms = CATEGORY_ROOM_LOCK[product.category];
    if (!allowedRooms) return true;
    return allowedRooms.includes(roomType);
  });

  // ── HARD FILTER 3: Per-category color + material (Phase 3B) ──────────────
  // When the user explicitly named a color/material for a category, REQUIRE
  // products in that category to match. If fewer than MIN_HARD_FILTER_CANDIDATES
  // survive, gracefully fall back to not filtering that category so the
  // user always sees something. This is the biggest lever for "I said brown
  // leather couch" → "I got a white boucle" problems.
  //
  // The set of "constrained categories" is the categories that the user
  // specifically asked for — their products get to BYPASS the style filter
  // below. A user who says "green velvet sofa" cares about color+material
  // for the sofa much more than whether the sofa is tagged "glam".
  const constrainedCategoriesSet = new Set([
    ...Object.keys(colorByCategory || {}),
    ...Object.keys(materialByCategory || {}),
  ]);
  const attrFiltered = applyAttributeHardFilter(
    categoryFiltered,
    colorByCategory,
    materialByCategory,
  );

  // ── HARD FILTER 4: Style affinity (with constrained-category bypass) ─────
  // Constrained-category products skip style filtering entirely so that a
  // user-specified color+material can override a stylistic mismatch. Style
  // still affects the SCORE for constrained products, it just doesn't filter
  // them out of the pool.
  const styleFiltered = attrFiltered.filter((product) => {
    if (constrainedCategoriesSet.has(product.category)) return true;
    if (!styles || styles.length === 0) return true;
    const affinity = computeStyleScore(product.styles, styles);
    return affinity >= 0.4;
  });

  // Cascade fallback: style-filtered → attr-filtered → category-filtered → room-filtered
  const MIN_POOL = limit * 3;
  const candidates = styleFiltered.length >= MIN_POOL ? styleFiltered
    : attrFiltered.length >= MIN_POOL ? attrFiltered
    : categoryFiltered.length >= MIN_POOL ? categoryFiltered
    : roomFiltered;

  if (MATCH_DEBUG) {
    console.log(
      `[match] filters: room=${roomFiltered.length} cat=${categoryFiltered.length} ` +
      `attr=${attrFiltered.length} style=${styleFiltered.length} → using ${candidates.length}`
    );
  }

  const scored = candidates.map((product) => {
    const scoreBreakdown = scoreProduct(
      product,
      roomType,
      styles,
      materials,
      colors,
      colorByCategory,
      materialByCategory,
      furnitureCategories,
      moods,
      promptTokens,
    );
    return { ...product, _score: scoreBreakdown.total, _breakdown: scoreBreakdown };
  });

  scored.sort((a, b) => b._score - a._score);

  const diversified = diversify(scored, limit, roomType);

  if (MATCH_DEBUG && diversified.length > 0) {
    console.log(`[match] top ${Math.min(diversified.length, 4)} results:`);
    diversified.slice(0, 4).forEach((p, i) => {
      const b = p._breakdown || {};
      console.log(
        `[match]   ${i + 1}. ${p.category} — ${(p.name || '').substring(0, 50)} | ` +
        `total=${p._score?.toFixed(1)} ` +
        `(color=${(b.color || 0).toFixed(1)} style=${(b.style || 0).toFixed(1)} ` +
        `mat=${(b.material || 0).toFixed(1)} name=${(b.name || 0).toFixed(1)})`
      );
    });
  }

  return diversified;
}

/**
 * Phase 3B — per-category hard filter. For each category that has an
 * explicit color or material attached in the parsed prompt, require products
 * in that category to match. If fewer than MIN_HARD_FILTER_CANDIDATES
 * remain, relax the constraint for that category only.
 */
function applyAttributeHardFilter(products, colorByCategory, materialByCategory) {
  // Only filter categories that have explicit attributes. Products in other
  // categories pass through unchanged.
  const constrainedCategories = new Set([
    ...Object.keys(colorByCategory || {}),
    ...Object.keys(materialByCategory || {}),
  ]);

  if (constrainedCategories.size === 0) return products;

  // For each constrained category, compute which products pass AND count them.
  const passingByCategory = {};
  for (const cat of constrainedCategories) {
    const userColor = colorByCategory[cat];
    const userMat = materialByCategory[cat];
    const inCategory = products.filter(p => p.category === cat);
    const passing = inCategory.filter(p => {
      if (userColor && !productHasColorFamily(p, userColor)) return false;
      if (userMat && !productHasMaterial(p, userMat)) return false;
      return true;
    });
    passingByCategory[cat] = passing;

    if (MATCH_DEBUG) {
      console.log(
        `[match] hard-filter ${cat}: ${userColor || '-'}+${userMat || '-'} ` +
        `→ ${passing.length}/${inCategory.length} pass`
      );
    }
  }

  // Build the final filtered list: for each category with a constraint,
  // use passing products ONLY if there are ≥ MIN. Otherwise drop the
  // constraint for that category and let soft scoring handle it.
  return products.filter(p => {
    if (!constrainedCategories.has(p.category)) return true; // unconstrained
    const passing = passingByCategory[p.category] || [];
    if (passing.length >= MIN_HARD_FILTER_CANDIDATES) {
      return passing.includes(p);
    }
    return true; // graceful fallback — constraint too strict for this category
  });
}

/**
 * True if the product matches the named material. Checks both product.materials
 * array AND free-text name/description/tags (for materials like "marble" that
 * might only appear in the name).
 */
function productHasMaterial(product, material) {
  const ml = material.toLowerCase();
  if (Array.isArray(product.materials)) {
    if (product.materials.some(m => m.toLowerCase() === ml)) return true;
  }
  const text = [product.name || '', product.description || '', ...(product.tags || [])]
    .join(' ')
    .toLowerCase();
  return text.includes(ml);
}

// Moods that suggest higher-end / premium items — boosts rating weight
const LUXURY_MOODS = ['luxurious', 'elegant', 'opulent', 'rich', 'sophisticated', 'dark-luxe'];
const COZY_MOODS   = ['cozy', 'warm', 'inviting', 'comfortable', 'relaxed'];

/**
 * Score a single product against the detected design intent.
 *
 * PHASE 3 REBALANCED WEIGHTS (sum ≈ 120 max, before penalty):
 *   color match:           25 pts  — NEW: prevents white sofa winning for "brown"
 *   style match:           25 pts  — reduced from 40 (still important but not dominant)
 *   material match:        20 pts  — raised from 10
 *   room type match:       15 pts
 *   tag match:             15 pts
 *   name match bonus:      15 pts  — raised from 8 (specific words matter)
 *   furniture category:     5 pts  — reduced from 10 (room-essential already covers this)
 *   mood bonus:             3 pts  — reduced from 5
 *   rating bonus:           2 pts  — reduced from 3 (rating ≠ visual fit)
 *   color mismatch:       -15 pts  — NEW penalty (white ≠ brown, light ≠ dark)
 *
 * Rationale: explicit user attributes (color + material + name) now total
 * 60 pts, dominating style at 25. A non-specific user still gets style-
 * appropriate picks; a specific user gets exactly what they asked for.
 *
 * Returns a breakdown object with per-dimension scores for debugging:
 *   { total, style, color, material, room, tag, name, category, mood, rating }
 */
function scoreProduct(
  product,
  roomType,
  styles,
  materials,
  colors = [],
  colorByCategory = {},
  materialByCategory = {},
  furnitureCategories = [],
  moods = [],
  promptTokens = [],
) {
  const breakdown = {
    total: 0, style: 0, color: 0, material: 0, room: 0,
    tag: 0, name: 0, category: 0, mood: 0, rating: 0,
  };

  // ── Room type match (15 points) ───────────────────────────────────────────
  const productRooms = Array.isArray(product.roomType) ? product.roomType : [product.roomType];
  if (productRooms.includes(roomType)) {
    breakdown.room = 15;
  } else if (productRooms.includes('living-room')) {
    breakdown.room = 3;
  }

  // ── Style match (25 points — reduced from 40) ────────────────────────────
  const styleScore = computeStyleScore(product.styles, styles);
  breakdown.style = styleScore * 25;

  // ── Color match (25 points — NEW in Phase 3) ─────────────────────────────
  // Only apply color scoring if the user explicitly specified a color for
  // this product's category (or unattached colors if no category binding).
  // Using per-category color means "brown couch" won't penalize a white rug.
  const userColorForCat = colorByCategory[product.category];
  const relevantColors = userColorForCat ? [userColorForCat] : colors;
  if (relevantColors.length > 0) {
    let colorPoints = 0;
    let penalty = 0;
    for (const cf of relevantColors) {
      if (productHasColorFamily(product, cf)) {
        // Big reward for matching the requested family
        colorPoints += 25;
        break; // don't double-count multiple colors
      }
    }
    // Opposition penalty — only if product DOESN'T match the family
    if (colorPoints === 0 && userColorForCat) {
      penalty = getColorOppositionPenalty(userColorForCat, product, 6);
      penalty = Math.min(penalty, 15); // cap at -15
    }
    breakdown.color = colorPoints - penalty;
  }

  // ── Material match (20 points — raised from 10) ──────────────────────────
  // Per-category material if specified, otherwise flat materials list.
  const userMatForCat = materialByCategory[product.category];
  if (userMatForCat) {
    if (productHasMaterial(product, userMatForCat)) {
      breakdown.material = 20;
    }
  } else if (materials && materials.length > 0) {
    const productMats = (product.materials || []).map(m => m.toLowerCase());
    const hits = materials.filter(m => productMats.includes(m.toLowerCase())).length;
    breakdown.material = Math.min(hits / materials.length, 1) * 20;
  }

  // ── Tag match (15 points) ─────────────────────────────────────────────────
  if (product.tags && product.tags.length > 0 && promptTokens.length > 0) {
    const tokenSet = new Set(promptTokens);
    for (const s of styles) tokenSet.add(s);
    for (const m of materials) tokenSet.add(m);
    for (const c of colors) {
      // Expand color to its family words so "brown" matches "cognac" tags
      const words = getColorFamilyWords(c);
      words.forEach(w => tokenSet.add(w));
    }
    for (const mo of moods) tokenSet.add(mo);
    const tagHits = product.tags.filter(t => tokenSet.has(t)).length;
    breakdown.tag = Math.min(tagHits / 4, 1) * 15;
  }

  // ── Name match bonus (15 points — raised from 8) ─────────────────────────
  // Specific user words in the product name are powerful disambiguators.
  if (promptTokens.length > 0) {
    const nameLower = (product.name || '').toLowerCase();
    let nameBonus = 0;
    for (const t of promptTokens) {
      if (t.length < 4 || !nameLower.includes(t)) continue;
      // Longer, more specific tokens are worth more
      nameBonus += t.length >= 6 ? 3 : 1.5;
    }
    // Color family words in name get extra weight
    for (const cf of relevantColors) {
      const words = getColorFamilyWords(cf);
      if (words.some(w => nameLower.includes(w))) nameBonus += 2;
    }
    breakdown.name = Math.min(nameBonus, 15);
  }

  // ── Furniture category match (5 points — reduced from 10) ────────────────
  if (furnitureCategories && furnitureCategories.length > 0) {
    if (furnitureCategories.includes(product.category)) {
      breakdown.category = 5;
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
          breakdown.category = 2;
          break;
        }
      }
    }
  }

  // ── Mood bonus (3 points — reduced) ───────────────────────────────────────
  if (moods && moods.length > 0) {
    const isLuxury = moods.some((m) => LUXURY_MOODS.includes(m));
    const isCozy   = moods.some((m) => COZY_MOODS.includes(m));
    if (isLuxury && product.rating && product.rating >= 4.5) breakdown.mood = 3;
    else if (isCozy && (product.materials || []).some((m) => ['velvet', 'linen', 'wool', 'cotton', 'rattan'].includes(m))) breakdown.mood = 3;
    else breakdown.mood = 0.5;
  }

  // ── Rating bonus (2 points — reduced) ────────────────────────────────────
  if (product.rating) {
    breakdown.rating = ((product.rating - 3.5) / 1.5) * 2;
  }

  breakdown.total =
    breakdown.room +
    breakdown.style +
    breakdown.color +
    breakdown.material +
    breakdown.tag +
    breakdown.name +
    breakdown.category +
    breakdown.mood +
    breakdown.rating;

  return breakdown;
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
