import { PRODUCT_CATALOG } from '../data/productCatalog';
import { STYLE_AFFINITY, ROOM_FURNITURE } from '../data/styleMap';
import {
  productHasColorFamily,
  getColorOppositionPenalty,
  getColorFamilyWords,
  findMatchingColorVariant,
  getProductColorFamilies,
} from '../utils/colorMap';
import { computePreferenceBonus } from '../utils/userPreferences';

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

// Pool size for the weighted-random pick inside each category. We sample
// from the top N candidates but weight by their match score, so when
// there's a clear winner it still dominates while lower-scored but
// still-relevant alternates occasionally come through.
//
// Raised 3 → 7 (Build 71 Fix #1): with RANDOM_POOL_SIZE=3 a single top
// product (e.g. the MXSANYOO rug) was appearing in >40% of all generations.
// At pool=7 with weighted draw the top product's expected win rate drops
// from ~52% to ~28% while quality stays high (weakest of 7 still scored
// above the style-filter floor). Reach simulation: 332/399 products are
// now reachable vs 297/399 before.
const RANDOM_POOL_SIZE = 7;

// Top-N pool for the optional wildcard slot. One non-essential result slot
// gets swapped for a uniform-random pick from these top-N overall scorers
// with WILDCARD_PROBABILITY. Uniform (not weighted) so even the #15 scorer
// has a fair shot — this is intentional discovery, not quality ranking.
const WILDCARD_POOL_SIZE = 15;

// 1-in-10 chance the last non-essential slot becomes a wildcard. At 10%,
// a user generating 10 rooms will see ~1 surprise product. Keeping this
// low preserves quality while breaking category "gravity" (same rug every
// time). Set to 0 to disable; raise to 0.20 if users ask for more variety.
const WILDCARD_PROBABILITY = 0.10;

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

// Material affinity: related materials that should score partial credit.
// "oak" and "walnut" are both wood, so requesting "oak" should partially
// reward a "walnut" product instead of scoring 0.
const MATERIAL_AFFINITY = {
  // Wood subtypes — all related
  wood:    ['oak', 'walnut', 'teak', 'bamboo', 'birch', 'pine', 'maple', 'ash', 'mahogany', 'cherry'],
  oak:     ['wood', 'walnut', 'teak', 'birch', 'pine', 'maple', 'ash'],
  walnut:  ['wood', 'oak', 'teak', 'birch', 'mahogany', 'cherry'],
  teak:    ['wood', 'oak', 'walnut', 'bamboo'],
  bamboo:  ['wood', 'rattan', 'teak'],
  // Metal subtypes
  brass:   ['gold', 'copper', 'bronze', 'metal'],
  copper:  ['brass', 'bronze', 'gold', 'metal', 'rose gold'],
  gold:    ['brass', 'copper', 'bronze', 'metal'],
  bronze:  ['brass', 'copper', 'gold', 'metal'],
  // Fabric subtypes
  velvet:  ['linen', 'cotton', 'silk'],
  linen:   ['cotton', 'velvet', 'wool'],
  cotton:  ['linen', 'wool', 'canvas'],
  silk:    ['velvet', 'satin'],
  wool:    ['cotton', 'linen', 'cashmere'],
  // Natural subtypes
  rattan:  ['wicker', 'bamboo', 'jute', 'cane'],
  wicker:  ['rattan', 'bamboo', 'jute', 'cane'],
  jute:    ['rattan', 'wicker', 'sisal'],
  // Stone subtypes
  marble:  ['stone', 'travertine', 'terrazzo', 'concrete'],
  concrete:['marble', 'stone', 'terrazzo'],
  ceramic: ['terracotta', 'clay', 'pottery'],
  // Transparent
  glass:   ['acrylic', 'lucite', 'crystal'],
  leather: [],  // leather is distinct — no partial credit
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
 *   3. Style affinity filter (≥ 0.25, graduated scoring) with cascade fallback
 *   4. Score candidates with rebalanced weights (color + material now
 *      collectively outweigh style)
 *   5. Diversify across categories
 *
 * Scoring formula (sum ≈ 143 max, before penalty):
 *   color match:      25 pts  — NEW in Phase 3, opposes style dominance
 *   style match:      25 pts  — reduced from 40
 *   material match:   20 pts  — raised from 10
 *   room type match:  15 pts
 *   tag match:        15 pts
 *   name match:       15 pts  — raised from 8 for specificity
 *   description match:10 pts  — keywords in description/features
 *   mood bonus:        8 pts  — raised from 3 (bold/earthy/cozy/luxury)
 *   furniture cat:     5 pts  — reduced from 10
 *   rating bonus:      5 pts  — raised from 2 (quality matters more)
 *   preference bonus:  5 pts  — soft bonus from user cart/like history (Phase C)
 *   color mismatch:  -15 pts  — NEW penalty for opposite colors
 *
 * @param {object} parsedPrompt - Output from promptParser.parseDesignPrompt()
 * @param {number} limit        - Max products to return (default 6)
 * @param {object[]} catalog    - Product catalog to search (default PRODUCT_CATALOG)
 * @param {object|null} userPrefs - User preference data from getUserPreferences() (default null — no bonus)
 * @param {Set<string>|null} recentlyShownIds - Build 83 soft exclusion: product
 *   IDs the user just saw in the last few generations. The diversifier will
 *   prefer non-recent candidates per category so consecutive generations across
 *   different design styles don't keep showing the same versatile chair / table.
 *   Soft mode: if every candidate in a category was recent (thin catalog), the
 *   exclusion is dropped for that category — quality > variety.
 * @returns {object[]}          - Sorted, diversified product array
 */
export function matchProducts(parsedPrompt, limit = 6, catalog = PRODUCT_CATALOG, userPrefs = null, recentlyShownIds = null) {
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
    return affinity >= 0.25;
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
    // Apply user preference bonus (soft tiebreaker, max 5 pts)
    const prefBonus = userPrefs ? computePreferenceBonus(product, userPrefs) : 0;
    scoreBreakdown.preference = prefBonus;
    scoreBreakdown.total += prefBonus;
    return { ...product, _score: scoreBreakdown.total, _breakdown: scoreBreakdown };
  });

  scored.sort((a, b) => b._score - a._score);

  const diversified = diversify(scored, limit, roomType, recentlyShownIds);

  // ── Full-catalog expansion for thin room pools (Phase C2) ─────────────────
  // bathroom/outdoor/nursery catalogs can't fill 6 diverse slots. Score the
  // full catalog (minus already-picked products, respecting category locks)
  // and append top picks to reach the limit.
  if (diversified.length < limit) {
    const usedIds = new Set(diversified.map(p => p.id));
    const usedCats = {};
    diversified.forEach(p => { usedCats[p.category] = (usedCats[p.category] || 0) + 1; });

    const expansion = catalog
      .filter(p => !usedIds.has(p.id))
      .filter(p => (usedCats[p.category] || 0) < MAX_PER_CATEGORY)
      .filter(p => {
        const lock = CATEGORY_ROOM_LOCK[p.category];
        return !lock || lock.includes(roomType);
      })
      .map(p => {
        const b = scoreProduct(
          p, roomType, styles, materials, colors, colorByCategory,
          materialByCategory, furnitureCategories, moods, promptTokens,
        );
        const prefBonus = userPrefs ? computePreferenceBonus(p, userPrefs) : 0;
        b.preference = prefBonus;
        b.total += prefBonus;
        return { ...p, _score: b.total, _breakdown: b };
      })
      .sort((a, b) => b._score - a._score);

    for (const p of expansion) {
      if (diversified.length >= limit) break;
      if ((usedCats[p.category] || 0) >= MAX_PER_CATEGORY) continue;
      diversified.push(p);
      usedCats[p.category] = (usedCats[p.category] || 0) + 1;
    }

    if (MATCH_DEBUG) {
      console.log(`[match] expansion: filled ${diversified.length}/${limit} from full catalog (room pool was thin)`);
    }
  }

  // ── Variant swap (Build 71 Fix #2) ───────────────────────────────────────
  // When the user asked for a specific color on a category AND the chosen
  // product has a matching variant, swap the display asset + affiliate link
  // to that variant. Without this, a "sage green" prompt could return a sofa
  // that has a Sage Green variant but still shows the default Ivory photo in
  // the Shop Room strip — visually unmatched to the rendered AI room.
  //
  // We preserve the underlying product id (so Liked/Cart continue to work)
  // but update imageUrl, affiliateUrl, asin, and price/priceDisplay to the
  // matched variant. _matchedVariant is attached for downstream debugging
  // and future UX (e.g. showing the variant swatch on the card).
  const finalResults = diversified.map((p) => {
    // Build 71 Fix #3: attach the derived color families as a first-class
    // field so downstream UI (cards, PDP, filter chips) can render swatches
    // and filter without re-scanning variant labels. Memoized under the
    // hood, so this is effectively free for products seen before.
    const derivedColors = getProductColorFamilies(p);

    const desired = colorByCategory[p.category];
    const matched = desired ? findMatchingColorVariant(p, desired) : null;

    if (!matched) {
      // No variant swap, but still surface colors for consumers.
      return derivedColors.length > 0 ? { ...p, colors: derivedColors } : p;
    }

    const next = {
      ...p,
      colors: derivedColors,
      _matchedVariant: matched,
    };
    if (matched.mainImage || matched.swatchImage) {
      next.imageUrl = matched.mainImage || matched.swatchImage;
    }
    if (matched.affiliateUrl) next.affiliateUrl = matched.affiliateUrl;
    if (matched.asin) next.asin = matched.asin;
    if (typeof matched.price === 'number' && matched.price > 0) {
      next.price = matched.price;
      next.priceDisplay = `$${matched.price.toFixed(2)}`;
    }
    if (MATCH_DEBUG) {
      console.log(
        `[match] variant swap: ${p.category} — ${(p.name || '').substring(0, 40)} ` +
        `→ "${matched.label}" (color=${desired})`
      );
    }
    return next;
  });

  if (MATCH_DEBUG && finalResults.length > 0) {
    console.log(`[match] top ${Math.min(finalResults.length, 4)} results:`);
    finalResults.slice(0, 4).forEach((p, i) => {
      const b = p._breakdown || {};
      const variantTag = p._matchedVariant ? ` [variant: ${p._matchedVariant.label}]` : '';
      console.log(
        `[match]   ${i + 1}. ${p.category} — ${(p.name || '').substring(0, 50)}${variantTag} | ` +
        `total=${p._score?.toFixed(1)} ` +
        `(color=${(b.color || 0).toFixed(1)} style=${(b.style || 0).toFixed(1)} ` +
        `mat=${(b.material || 0).toFixed(1)} name=${(b.name || 0).toFixed(1)})`
      );
    });
  }

  return finalResults;
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
 * True if the product matches the named material. Checks, in order:
 *   1. product.materials array (exact canonical match)
 *   2. free-text name/description/tags (e.g. "marble" in product name)
 *   3. variant labels (Build 71 Fix #2) — "Walnut"/"Rattan"/"Velvet"
 *      labels encode material even when the default listing doesn't.
 */
function productHasMaterial(product, material) {
  const ml = material.toLowerCase();
  if (Array.isArray(product.materials)) {
    if (product.materials.some(m => m.toLowerCase() === ml)) return true;
  }
  const text = [product.name || '', product.description || '', ...(product.tags || [])]
    .join(' ')
    .toLowerCase();
  if (text.includes(ml)) return true;
  // Variant-label check — short clean strings like "Walnut", "Brown/Walnut".
  if (Array.isArray(product.variants)) {
    for (const v of product.variants) {
      const label = (v && v.label ? String(v.label) : '').toLowerCase();
      if (label.includes(ml)) return true;
    }
  }
  return false;
}

// Moods that suggest higher-end / premium items — boosts rating weight
const LUXURY_MOODS = ['luxurious', 'elegant', 'opulent', 'rich', 'sophisticated', 'dark-luxe'];
const COZY_MOODS   = ['cozy', 'warm', 'inviting', 'comfortable', 'relaxed'];

/**
 * Score a single product against the detected design intent.
 *
 * PHASE 3 REBALANCED WEIGHTS (sum ≈ 138 max, before penalty):
 *   color match:           25 pts  — NEW: prevents white sofa winning for "brown"
 *   style match:           25 pts  — reduced from 40 (still important but not dominant)
 *   material match:        20 pts  — raised from 10
 *   room type match:       15 pts
 *   tag match:             15 pts
 *   name match bonus:      15 pts  — raised from 8 (specific words matter)
 *   description match:     10 pts  — NEW: keywords in description/features
 *   mood bonus:             8 pts  — raised from 3 (bold/earthy/cozy/luxury)
 *   furniture category:     5 pts  — reduced from 10 (room-essential already covers this)
 *   rating bonus:           5 pts  — raised from 2 (quality matters more)
 *   color mismatch:       -15 pts  — NEW penalty (white ≠ brown, light ≠ dark)
 *
 * Rationale: explicit user attributes (color + material + name + description)
 * now total 70 pts, dominating style at 25. A non-specific user still gets
 * style-appropriate picks; a specific user gets exactly what they asked for.
 *
 * Returns a breakdown object with per-dimension scores for debugging:
 *   { total, style, color, material, room, tag, name, category, mood, rating, description }
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
    tag: 0, name: 0, category: 0, mood: 0, rating: 0, description: 0, preference: 0,
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
    } else {
      // Partial credit for related materials
      const related = MATERIAL_AFFINITY[userMatForCat.toLowerCase()] || [];
      const productText = [product.name || '', product.description || '', ...(product.tags || []), ...(product.materials || [])].join(' ').toLowerCase();
      if (related.some(r => productText.includes(r))) {
        breakdown.material = 10; // half credit
      }
    }
  } else if (materials && materials.length > 0) {
    const productMats = (product.materials || []).map(m => m.toLowerCase());
    // Also check name/description for material mentions
    const productText = [product.name || '', product.description || '', ...(product.tags || [])].join(' ').toLowerCase();

    let materialScore = 0;
    for (const reqMat of materials) {
      const reqLower = reqMat.toLowerCase();
      if (productMats.includes(reqLower) || productText.includes(reqLower)) {
        // Exact match: full credit
        materialScore += 1.0;
      } else {
        // Check affinity: partial credit for related materials
        const related = MATERIAL_AFFINITY[reqLower] || [];
        const hasRelated = related.some(r => productMats.includes(r) || productText.includes(r));
        if (hasRelated) {
          materialScore += 0.5; // half credit for related material
        }
      }
    }
    breakdown.material = Math.min(materialScore / materials.length, 1) * 20;
  }

  // ── Tag match (15 points) ─────────────────────────────────────────────────
  // Exact tag match = full credit. Substring/partial = half credit.
  // "modern" tag with "modern-farmhouse" token → half credit (prevents noise).
  if (product.tags && product.tags.length > 0 && promptTokens.length > 0) {
    const tokenSet = new Set(promptTokens);
    for (const s of styles) tokenSet.add(s);
    for (const m of materials) tokenSet.add(m);
    for (const c of colors) {
      const words = getColorFamilyWords(c);
      words.forEach(w => tokenSet.add(w));
    }
    for (const mo of moods) tokenSet.add(mo);

    let exactHits = 0;
    let partialHits = 0;
    for (const tag of product.tags) {
      if (tokenSet.has(tag)) {
        exactHits++;
      } else {
        // Check substring: does any token contain this tag, or vice versa?
        const tagLower = tag.toLowerCase();
        const isPartial = [...tokenSet].some(token => {
          if (token.length < 3 || tagLower.length < 3) return false;
          return token.toLowerCase().includes(tagLower) || tagLower.includes(token.toLowerCase());
        });
        if (isPartial) partialHits++;
      }
    }
    // Exact hits worth 1.0 each, partial hits worth 0.5 each
    const weightedHits = exactHits + (partialHits * 0.5);
    breakdown.tag = Math.min(weightedHits / 4, 1) * 15;
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

  // ── Description + features match (10 points — NEW) ───────────────────────
  // Rich product descriptions and features contain keywords that might not
  // appear in name/tags. "Kiln-dried hardwood frame" or "removable cushion
  // covers" are purchase-intent signals when the user mentioned them.
  if (promptTokens.length > 0 && (product.description || (product.features && product.features.length > 0))) {
    const descText = [
      product.description || '',
      ...(product.features || []),
    ].join(' ').toLowerCase();

    let descHits = 0;
    for (const token of promptTokens) {
      if (token.length < 4) continue; // skip short generic words
      if (descText.includes(token)) descHits++;
    }
    // Cap at 5 hits to prevent description-heavy products from over-scoring
    breakdown.description = Math.min(descHits / 5, 1) * 10;
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

  // ── Mood bonus (8 points — raised from 3) ─────────────────────────────────
  if (moods && moods.length > 0) {
    const isLuxury = moods.some((m) => LUXURY_MOODS.includes(m));
    const isCozy   = moods.some((m) => COZY_MOODS.includes(m));
    const isBold   = moods.some((m) => ['bold', 'vibrant', 'dramatic', 'striking'].includes(m));
    const isEarthy = moods.some((m) => ['earthy', 'natural', 'organic', 'grounded'].includes(m));
    if (isLuxury && product.rating && product.rating >= 4.5) breakdown.mood = 8;
    else if (isCozy && (product.materials || []).some((m) => ['velvet', 'linen', 'wool', 'cotton', 'rattan'].includes(m))) breakdown.mood = 8;
    else if (isBold && (product.materials || []).some((m) => ['velvet', 'marble', 'brass', 'glass'].includes(m))) breakdown.mood = 8;
    else if (isEarthy && (product.materials || []).some((m) => ['wood', 'jute', 'rattan', 'bamboo', 'ceramic', 'cotton', 'linen'].includes(m))) breakdown.mood = 8;
    else breakdown.mood = 1;
  }

  // ── Rating bonus (5 points — raised from 2) ──────────────────────────────
  if (product.rating) {
    breakdown.rating = ((product.rating - 3.5) / 1.5) * 5;
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
    breakdown.rating +
    breakdown.description;

  return breakdown;
}

/**
 * Computes a style affinity score between product styles and detected styles.
 * Returns 0–1 with graduated scoring: affinity < 0.25 = 0, 0.25–0.4 = 60%
 * credit, 0.4+ = full credit. This lets "adjacent" styles contribute partial
 * score instead of being hard-cut at 0.4.
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

  // Graduated scoring: affinity < 0.25 = 0, 0.25-0.4 = 60% credit, 0.4+ = full credit
  if (best < 0.25) return 0;
  if (best < 0.4) return best * 0.6;
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
function diversify(sorted, limit, roomType = 'living-room', recentlyShownIds = null) {
  const essentials = ROOM_ESSENTIALS[roomType] || ROOM_ESSENTIALS['living-room'];
  const categoryCounts = {};
  const result = [];
  const usedIds = new Set();

  // Helper: weighted-random pick from the top-scored candidates for a
  // category. Probability of each pool entry = score / sum(scores), so
  // the top-matched product wins most of the time and weak matches very
  // rarely sneak in. When there's a single candidate we always return it.
  //
  // Build 83 (soft session-level deduplication): if `recentlyShownIds` is
  // provided, split candidates into FRESH (not recently shown) and STALE
  // (recently shown). Pick from FRESH if non-empty, otherwise fall back to
  // the full candidate list. This means consecutive generations across
  // different design styles will rotate through different products WHEN
  // the catalog has alternatives. On thin categories where every candidate
  // was recently shown, we still pick — quality > variety.
  function pickFromCategory(cat) {
    const candidates = sorted.filter(
      (p) => p.category === cat && !usedIds.has(p.id) && (categoryCounts[cat] || 0) < MAX_PER_CATEGORY
    );
    if (candidates.length === 0) return null;

    // Soft exclusion: prefer fresh candidates, fall back to all if needed.
    const fresh = (recentlyShownIds && recentlyShownIds.size > 0)
      ? candidates.filter((p) => !recentlyShownIds.has(p.id))
      : candidates;
    const effective = fresh.length > 0 ? fresh : candidates;

    const pool = effective.slice(0, RANDOM_POOL_SIZE);
    if (pool.length === 1) return pool[0];

    // Use a floored score (min 1) so candidates with score 0 still have
    // a non-zero weight, and a tiny score doesn't become infinite odds.
    const weights = pool.map((p) => Math.max(1, p._score || 0));
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < pool.length; i++) {
      r -= weights[i];
      if (r <= 0) return pool[i];
    }
    return pool[0]; // numerical safety fallback
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

  // Pass 5 (Wildcard): 10% of the time, swap the last non-essential slot
  // for a uniform-random pick from the top-WILDCARD_POOL_SIZE scorers.
  // This breaks the gravitational pull of high-scoring repeat products
  // (e.g. a single rug winning 40% of all generations) without touching
  // the essential category slots users expect (sofa, rug, coffee table).
  //
  // Build 71 Fix #5: the wildcard pool now excludes categories already
  // present in OTHER slots, so a wildcard swap can never create a
  // duplicate-category result. Prior to this the 1-per-category invariant
  // was violated ~4% of the time (240-run audit 2026-04-22, confirmed
  // bathroom→2×planter, kitchen→2×pendant-light, nursery→2×throw-pillow).
  if (result.length >= 2 && Math.random() < WILDCARD_PROBABILITY) {
    const essentialCatSet = new Set(essentials);

    // Find the last non-essential slot to replace — we protect essentials
    let replaceIdx = -1;
    for (let i = result.length - 1; i >= 0; i--) {
      if (!essentialCatSet.has(result[i].category)) {
        replaceIdx = i;
        break;
      }
    }

    if (replaceIdx >= 0) {
      // Categories in every slot EXCEPT the one we're replacing.
      // The wildcard must avoid these to preserve 1-per-category.
      const otherSlotCats = new Set();
      for (let i = 0; i < result.length; i++) {
        if (i !== replaceIdx) otherSlotCats.add(result[i].category);
      }

      // Build wildcard pool: top scorers not already in result, not
      // duplicating an existing category, respecting category-room lock.
      // Build 83: same soft exclusion as pickFromCategory — prefer fresh
      // candidates, fall back to recently-shown only if no fresh exist.
      const wildcardPoolPre = sorted
        .filter(p => !usedIds.has(p.id))
        .filter(p => !otherSlotCats.has(p.category))
        .filter(p => {
          const lock = CATEGORY_ROOM_LOCK[p.category];
          return !lock || lock.includes(roomType);
        });
      const wildcardFresh = (recentlyShownIds && recentlyShownIds.size > 0)
        ? wildcardPoolPre.filter(p => !recentlyShownIds.has(p.id))
        : wildcardPoolPre;
      const wildcardPool = (wildcardFresh.length > 0 ? wildcardFresh : wildcardPoolPre)
        .slice(0, WILDCARD_POOL_SIZE);

      if (wildcardPool.length > 0) {
        const wildPick = wildcardPool[Math.floor(Math.random() * wildcardPool.length)];
        if (MATCH_DEBUG) {
          console.log(
            `[match] wildcard: swapping slot ${replaceIdx} ` +
            `(${result[replaceIdx].category} — ${(result[replaceIdx].name || '').substring(0, 30)}) ` +
            `→ ${wildPick.category} — ${(wildPick.name || '').substring(0, 30)} ` +
            `(score ${wildPick._score?.toFixed(1)})`
          );
        }
        // Keep usedIds and categoryCounts in sync with the swap so any
        // future passes (there are none today, but defensive) see
        // consistent state.
        usedIds.delete(result[replaceIdx].id);
        const oldCat = result[replaceIdx].category;
        if (categoryCounts[oldCat]) categoryCounts[oldCat] -= 1;
        result[replaceIdx] = wildPick;
        usedIds.add(wildPick.id);
        categoryCounts[wildPick.category] = (categoryCounts[wildPick.category] || 0) + 1;
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
