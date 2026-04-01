import { PRODUCT_CATALOG } from '../data/productCatalog';
import { STYLE_AFFINITY } from '../data/styleMap';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';
const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
const VISION_MODEL = 'claude-sonnet-4-6';

// ── Vision prompt ─────────────────────────────────────────────────────────────
// Structured so Claude returns clean JSON we can parse directly.
const VISION_PROMPT = `You are an interior design product matching expert. Analyze this AI-generated room image.

Your job is to identify furniture and decor so we can find the CLOSEST matching products in a retail catalog.
Color and material accuracy is critical — a cream linen sofa and a rust velvet sofa are completely different products.

Return ONLY a valid JSON object — no markdown, no explanation, just raw JSON:
{
  "roomType": "living-room",
  "items": [
    {
      "category": "sofa",
      "color": "cream ivory",
      "material": "linen",
      "shape": "curved low-profile",
      "style": "japandi",
      "size": "large",
      "dominance": "high",
      "description": "large curved cream ivory linen sofa with low profile and wooden legs"
    }
  ]
}

CRITICAL color rules:
- Be precise: "cream ivory" not "light", "cognac brown" not "brown", "dark walnut" not "wood"
- Separate color from material: color="cream ivory", material="linen" (not color="cream linen")
- Common colors: cream, ivory, white, beige, gray, charcoal, black, cognac, walnut, oak, rust, terracotta, navy, teal, sage green, dusty pink, gold, brass

Category must be exactly one of: sofa, accent-chair, coffee-table, side-table, dining-table, dining-chair,
bed, nightstand, dresser, desk, desk-chair, bookshelf, floor-lamp, table-lamp, pendant-light,
chandelier, rug, throw-pillow, throw-blanket, mirror, wall-art, planter, vase, tv-stand, bar-stool.

roomType must be exactly one of: living-room, bedroom, kitchen, dining-room, office, bathroom, outdoor, nursery, entryway.

dominance: "high" for largest/most prominent pieces, "medium" for secondary furniture, "low" for small accents.

Only include clearly visible items. List 4-6 items, most dominant first.`;

// ── Color word matching ───────────────────────────────────────────────────────
// Maps vision color descriptions to words that appear in product names/descriptions
const COLOR_SYNONYMS = {
  'cognac':     ['cognac', 'cognac brown', 'caramel', 'tan', 'amber', 'whiskey', 'honey'],
  'brown':      ['brown', 'walnut', 'mocha', 'chocolate', 'espresso', 'chestnut'],
  'beige':      ['beige', 'ivory', 'cream', 'off-white', 'natural', 'sand', 'linen'],
  'white':      ['white', 'ivory', 'cream', 'off-white', 'light'],
  'black':      ['black', 'ebony', 'onyx', 'charcoal', 'dark'],
  'gray':       ['gray', 'grey', 'charcoal', 'slate', 'silver'],
  'navy':       ['navy', 'dark blue', 'midnight', 'indigo'],
  'blue':       ['blue', 'navy', 'cobalt', 'ocean', 'teal'],
  'green':      ['green', 'sage', 'olive', 'forest', 'emerald', 'moss'],
  'gold':       ['gold', 'golden', 'brass', 'antique gold', 'gilded'],
  'marble':     ['marble', 'travertine', 'stone', 'quartz'],
  'teal':       ['teal', 'turquoise', 'aqua', 'seafoam'],
  'velvet':     ['velvet', 'plush', 'soft'],
  'rattan':     ['rattan', 'wicker', 'cane', 'natural'],
};

function getColorSynonyms(colorStr) {
  if (!colorStr) return [];
  const lc = colorStr.toLowerCase();
  const synonyms = new Set([lc]);
  for (const [key, vals] of Object.entries(COLOR_SYNONYMS)) {
    if (lc.includes(key) || vals.some(v => lc.includes(v))) {
      vals.forEach(v => synonyms.add(v));
      synonyms.add(key);
    }
  }
  return [...synonyms];
}

// ── OPPOSITE color families — used to apply mismatch penalty ─────────────────
// If the vision says "cream" and the product is clearly "rust/red/terracotta", penalize hard.
const COLOR_OPPOSITES = {
  // Light/neutral vs dark — a cream sofa is NOT a gray sofa
  'cream':     ['rust', 'terracotta', 'red', 'orange', 'pink', 'purple', 'teal', 'blue', 'green', 'black', 'charcoal', 'gray', 'grey', 'dark', 'walnut', 'espresso', 'navy'],
  'ivory':     ['rust', 'terracotta', 'red', 'orange', 'charcoal', 'black', 'navy', 'gray', 'grey', 'dark', 'walnut', 'espresso'],
  'white':     ['rust', 'terracotta', 'red', 'orange', 'charcoal', 'black', 'navy', 'dark', 'gray', 'grey', 'walnut', 'espresso'],
  'beige':     ['rust', 'terracotta', 'red', 'orange', 'black', 'navy', 'charcoal', 'gray', 'grey', 'dark'],
  // Dark vs light — a walnut dresser is NOT a white dresser
  'black':     ['white', 'ivory', 'cream', 'beige', 'light', 'blond', 'natural', 'oak', 'birch'],
  'charcoal':  ['white', 'ivory', 'cream', 'beige', 'light', 'blond', 'natural', 'oak', 'birch', 'gold'],
  'walnut':    ['white', 'ivory', 'cream', 'light', 'blond', 'natural', 'oak', 'birch'],
  'espresso':  ['white', 'ivory', 'cream', 'light', 'blond', 'natural', 'oak', 'birch'],
  'cognac':    ['white', 'ivory', 'cream', 'gray', 'black', 'blue', 'green'],
  // Cool/muted vs warm/vibrant
  'navy':      ['cream', 'ivory', 'beige', 'rust', 'terracotta', 'orange', 'gold'],
  'gray':      ['rust', 'terracotta', 'red', 'orange', 'gold', 'cream', 'ivory', 'white', 'beige'],
  'grey':      ['rust', 'terracotta', 'red', 'orange', 'gold', 'cream', 'ivory', 'white', 'beige'],
  'green':     ['rust', 'terracotta', 'red', 'orange', 'pink'],
  'sage':      ['rust', 'terracotta', 'red', 'orange', 'pink', 'navy', 'black'],
};

function getColorMismatchPenalty(visionColor, product) {
  if (!visionColor) return 0;
  const vc = visionColor.toLowerCase();
  const productText = [
    product.name || '',
    product.description || '',
    ...(product.tags || []),
  ].join(' ').toLowerCase();

  for (const [colorKey, opposites] of Object.entries(COLOR_OPPOSITES)) {
    if (vc.includes(colorKey)) {
      const mismatchHits = opposites.filter(o => productText.includes(o)).length;
      if (mismatchHits > 0) return mismatchHits * 12; // 12pt penalty per mismatch word
    }
  }
  return 0;
}

// ── Score a single catalog product against a vision-identified item ───────────
//
// Scoring weights (total ~100 pts max before penalty):
//   Category:  35 pts — must be the right type of furniture
//   Color:     35 pts — equally important as category; wrong color = wrong product
//   Material:  20 pts — linen vs velvet matters
//   Style:     10 pts — japandi vs farmhouse matters
//   Shape:      5 pts — round vs rectangular, curved vs straight
//   Penalty:  -12 pts per opposite-color word found (prevents rust sofa matching cream sofa)
//
function scoreProductAgainstVisionItem(product, visionItem) {
  let score = 0;

  // ── Category match (35 pts) ───────────────────────────────────────────────
  if (product.category === visionItem.category) {
    score += 35;
  } else {
    const RELATED = {
      'sofa':          ['accent-chair', 'loveseat'],
      'floor-lamp':    ['table-lamp', 'pendant-light'],
      'table-lamp':    ['floor-lamp', 'pendant-light'],
      'coffee-table':  ['side-table'],
      'side-table':    ['coffee-table'],
      'accent-chair':  ['sofa', 'desk-chair'],
      'dining-chair':  ['accent-chair', 'bar-stool'],
    };
    const related = RELATED[visionItem.category] || [];
    if (related.includes(product.category)) score += 10;
  }

  // ── Color match (35 pts) — equally important as category ─────────────────
  // A cream sofa and a rust sofa are fundamentally different products.
  if (visionItem.color) {
    const synonyms = getColorSynonyms(visionItem.color);
    const searchText = [
      product.name || '',
      product.description || '',
      ...(product.tags || []),
    ].join(' ').toLowerCase();

    const colorHits = synonyms.filter(s => searchText.includes(s)).length;
    score += Math.min(colorHits * 8, 35);

    // Apply opposite-color penalty — prevents wrong-color items from winning on category alone
    const penalty = getColorMismatchPenalty(visionItem.color, product);
    score -= penalty;
  }

  // ── Material match (20 pts) ───────────────────────────────────────────────
  if (visionItem.material && product.materials) {
    const visionMat = visionItem.material.toLowerCase();
    const matHit = product.materials.some(m => {
      const ml = m.toLowerCase();
      return visionMat.includes(ml) || ml.includes(visionMat.split(' ')[0]);
    });
    if (matHit) score += 20;
    // Penalty for opposite material — velvet ≠ linen, leather ≠ fabric
    const MATERIAL_OPPOSITES = {
      'linen':   ['velvet', 'leather', 'faux leather'],
      'velvet':  ['linen', 'cotton', 'rattan', 'wood'],
      'leather': ['linen', 'velvet', 'cotton', 'fabric'],
      'rattan':  ['velvet', 'leather', 'marble', 'metal'],
      'marble':  ['wood', 'rattan', 'fabric'],
    };
    const visionMatKey = Object.keys(MATERIAL_OPPOSITES).find(k => visionMat.includes(k));
    if (visionMatKey) {
      const productText = (product.name + ' ' + (product.description || '') + ' ' + (product.materials || []).join(' ')).toLowerCase();
      const matPenaltyHits = (MATERIAL_OPPOSITES[visionMatKey] || []).filter(o => productText.includes(o)).length;
      score -= matPenaltyHits * 8;
    }
  }

  // ── Style match (10 pts) ──────────────────────────────────────────────────
  if (visionItem.style && product.styles) {
    const vStyle = visionItem.style.toLowerCase().replace(/\s+/g, '-');
    const affinityMap = STYLE_AFFINITY[vStyle] || {};
    let bestAffinity = 0;
    for (const ps of product.styles) {
      const a = affinityMap[ps] || 0;
      if (a > bestAffinity) bestAffinity = a;
      if (ps === vStyle) bestAffinity = Math.max(bestAffinity, 1.0);
    }
    score += bestAffinity * 10;
  }

  // ── Shape/description word match (5 pts) ──────────────────────────────────
  if (visionItem.shape || visionItem.description) {
    const shapeWords = ((visionItem.shape || '') + ' ' + (visionItem.description || ''))
      .toLowerCase().split(/\s+/).filter(w => w.length >= 4);
    const productText = (product.name + ' ' + (product.description || '')).toLowerCase();
    const shapeHits = shapeWords.filter(w => productText.includes(w)).length;
    score += Math.min(shapeHits * 1.5, 5);
  }

  return score;
}

// ── Re-match catalog products based on vision analysis ───────────────────────
/**
 * Takes vision-identified furniture items and finds the best matching product
 * from the catalog for each item.
 *
 * @param {object[]} visionItems  - Items returned by analyzeRoomImage()
 * @param {string}   roomType     - Detected room type for hard filtering
 * @param {object[]} fallbackProducts - Original matched products (used to fill gaps)
 * @param {number}   limit        - Max products to return (default 6)
 * @returns {object[]} Re-matched products ordered by visual dominance
 */
export function rematchFromVision(visionItems, roomType, fallbackProducts = [], limit = 6, catalog = PRODUCT_CATALOG) {
  if (!visionItems || visionItems.length === 0) {
    console.log('[Vision] No items identified, using fallback products');
    return fallbackProducts.slice(0, limit);
  }

  const result = [];
  const usedProductIds = new Set();

  // Sort vision items by dominance (high first) so prominent furniture gets best matches
  const sorted = [...visionItems].sort((a, b) => {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.dominance] ?? 1) - (order[b.dominance] ?? 1);
  });

  for (const visionItem of sorted) {
    if (result.length >= limit) break;

    // Score all catalog products against this vision item
    const scored = catalog
      .filter(p => {
        // Hard filter: don't reuse a product already picked
        if (usedProductIds.has(p.id)) return false;
        // Soft room type filter — prefer products for this room
        const productRooms = Array.isArray(p.roomType) ? p.roomType : [p.roomType];
        return productRooms.includes(roomType) || productRooms.includes('living-room');
      })
      .map(p => ({ ...p, _visionScore: scoreProductAgainstVisionItem(p, visionItem) }))
      .filter(p => p._visionScore > 30) // Must have meaningful match (category + at least partial color)
      .sort((a, b) => b._visionScore - a._visionScore);

    if (scored.length > 0) {
      // Always pick the highest-scoring match — no randomization
      // Randomizing between top 2 caused products to change every time vision ran
      const pick = scored[0];
      result.push(pick);
      usedProductIds.add(pick.id);
      console.log(`[Vision] Matched "${visionItem.category}" (${visionItem.color} ${visionItem.material}) → "${pick.name}" (score: ${pick._visionScore.toFixed(1)})`);
    } else {
      console.log(`[Vision] No strong match for "${visionItem.category}" (${visionItem.color} ${visionItem.material})`);
    }
  }

  // Fill remaining slots from fallback products (categories not visually identified)
  for (const fallback of fallbackProducts) {
    if (result.length >= limit) break;
    if (!usedProductIds.has(fallback.id)) {
      result.push(fallback);
      usedProductIds.add(fallback.id);
    }
  }

  console.log(`[Vision] Re-matched ${result.length} products (${visionItems.length} vision items identified)`);
  return result.slice(0, limit);
}

// ── Call Claude Vision to analyze a generated room image ─────────────────────
/**
 * Sends the generated room image URL to Claude Sonnet for visual analysis.
 * Returns structured furniture descriptions for re-matching against the catalog.
 *
 * @param {string} imageUrl  - URL of the AI-generated room image (from Replicate)
 * @returns {Promise<{ roomType: string, items: object[] }>}
 */
export async function analyzeRoomImage(imageUrl) {
  if (!ANTHROPIC_API_KEY) {
    console.warn('[Vision] EXPO_PUBLIC_ANTHROPIC_API_KEY not set — skipping vision analysis');
    return null;
  }

  if (!imageUrl || !imageUrl.startsWith('http')) {
    console.warn('[Vision] Invalid image URL:', imageUrl);
    return null;
  }

  console.log('[Vision] Analyzing generated room with Claude Sonnet 4.6...');

  try {
    const res = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: VISION_MODEL,
        max_tokens: 1024,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'url',
                  url: imageUrl,
                },
              },
              {
                type: 'text',
                text: VISION_PROMPT,
              },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.warn('[Vision] API error:', res.status, err?.error?.message || 'Unknown');
      return null;
    }

    const data = await res.json();
    const rawText = data?.content?.[0]?.text || '';

    // Parse JSON response — strip any accidental markdown fences
    const cleaned = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    const parsed = JSON.parse(cleaned);

    if (!parsed?.items || !Array.isArray(parsed.items)) {
      console.warn('[Vision] Unexpected response shape:', cleaned.substring(0, 200));
      return null;
    }

    console.log(`[Vision] Identified ${parsed.items.length} items in room (type: ${parsed.roomType})`);
    parsed.items.forEach(item => {
      console.log(`  → ${item.category}: ${item.color} ${item.material} (${item.dominance})`);
    });

    return parsed;
  } catch (err) {
    console.warn('[Vision] Analysis failed:', err.message);
    return null;
  }
}
