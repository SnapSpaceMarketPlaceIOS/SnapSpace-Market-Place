import {
  ROOM_KEYWORDS,
  STYLE_KEYWORDS,
  MATERIAL_KEYWORDS,
  MOOD_KEYWORDS,
  ROOM_FURNITURE,
} from '../data/styleMap';
import { detectColorFamilies, COLOR_KEYWORDS } from './colorMap';

// Category aliases: catalog category → user-vocabulary words for that category.
// Used to attach a detected color to a specific category (e.g. "brown couch"
// → attach brown to sofa category, not to every product).
const CATEGORY_ALIASES = {
  'sofa':          ['sofa', 'couch', 'loveseat', 'sectional', 'settee', 'chesterfield'],
  'accent-chair':  ['accent chair', 'armchair', 'lounge chair', 'chair', 'barrel chair', 'club chair'],
  'coffee-table':  ['coffee table', 'cocktail table'],
  'side-table':    ['side table', 'end table', 'accent table'],
  'dining-table':  ['dining table'],
  'dining-chair':  ['dining chair'],
  'bed':           ['bed', 'headboard', 'platform bed', 'canopy bed'],
  'nightstand':    ['nightstand', 'bedside table'],
  'dresser':       ['dresser', 'chest', 'bureau'],
  'desk':          ['desk', 'writing desk'],
  'bookshelf':     ['bookshelf', 'bookcase', 'shelf', 'shelving'],
  'floor-lamp':    ['floor lamp', 'standing lamp'],
  'table-lamp':    ['table lamp', 'desk lamp'],
  'pendant-light': ['pendant light', 'pendant lamp', 'hanging light'],
  'chandelier':    ['chandelier'],
  'rug':           ['rug', 'carpet', 'mat', 'runner'],
  'wall-art':      ['wall art', 'art', 'painting', 'print', 'poster'],
  'mirror':        ['mirror'],
  'throw-pillow':  ['pillow', 'throw pillow', 'cushion'],
  'throw-blanket': ['throw', 'blanket', 'throw blanket'],
  'vase':          ['vase'],
  'planter':       ['planter', 'pot'],
};

/**
 * Parses a free-text AI design prompt and extracts structured keywords.
 *
 * @param {string} promptText - e.g. "Modern minimalist bedroom with warm wood tones and brass accents"
 * @returns {{
 *   roomType: string,
 *   styles: string[],
 *   materials: string[],
 *   colors: string[],
 *   colorByCategory: {[category: string]: string},
 *   materialByCategory: {[category: string]: string},
 *   moods: string[],
 *   furnitureCategories: string[],
 *   promptTokens: string[],
 * }}
 */
export function parseDesignPrompt(promptText) {
  if (!promptText || typeof promptText !== 'string') {
    return getDefaults();
  }

  const text = promptText.toLowerCase();

  const allRoomTypes = detectAllRoomTypes(text);
  const roomType = allRoomTypes[0] || 'living-room';
  const styles = detectStyles(text);
  const materials = detectMaterials(text);
  const colors = detectColorFamilies(text); // NEW in Phase 3
  const moods = detectMoods(text);
  const baseFurniture = ROOM_FURNITURE[roomType] || ROOM_FURNITURE['living-room'];

  // If there's a secondary room type, merge its furniture (deduped)
  let furnitureCategories = [...baseFurniture];
  if (allRoomTypes.length > 1) {
    const secondaryFurniture = ROOM_FURNITURE[allRoomTypes[1]] || [];
    for (const cat of secondaryFurniture) {
      if (!furnitureCategories.includes(cat)) {
        furnitureCategories.push(cat);
      }
    }
  }

  // Attach each detected color/material to a specific category when possible.
  // "brown leather couch" → { sofa: 'brown', sofa (mat): 'leather' }
  // "white rug with brown couch" → { sofa: 'brown', rug: 'white' }
  const colorByCategory = attachAttributeToCategory(text, colors, (c, t) => t.includes(c));
  const materialByCategory = attachAttributeToCategory(text, materials, (m, t) => t.includes(m));

  // Build 136 — orphan color/material pair → room-default centerpiece.
  //
  // Closes the gap where a user writes "brown leather and black metal
  // accents" without naming the actual furniture piece. attachAttribute-
  // ToCategory above only attaches when a category word is in proximity,
  // so neither "brown" nor "leather" got pinned to sofa, and the matcher
  // picked a default-color (white) variant. Result: AI rendered a white
  // couch when user clearly wanted brown.
  //
  // Heuristic: scan word pairs for <orphan_color> immediately followed by
  // <orphan_soft_material>. If found, attach both to the room's default
  // centerpiece (sofa for living-room, bed for bedroom, etc.). Soft
  // materials = upholstery (leather/velvet/linen/etc.) — those are
  // unambiguously sofa/chair/bed cues. Hard materials (wood/metal/glass)
  // are deliberately excluded because they could refer to the table,
  // lamp, frame, or anything else.
  //
  // Strictly EXPANDS the existing colorByCategory mapping — never
  // overwrites a value attachAttributeToCategory already set.
  applyOrphanCenterpieceDefault(text, roomType, colors, materials,
    colorByCategory, materialByCategory);

  // Tokenize the raw prompt into clean lowercase words for tag matching.
  // This lets the product matcher compare tags against the user's exact wording.
  const promptTokens = text
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3);

  return {
    roomType,
    styles,
    materials,
    colors,
    colorByCategory,
    materialByCategory,
    moods,
    furnitureCategories,
    promptTokens,
  };
}

/**
 * Scan the prompt text for each detected attribute (color or material) and
 * pair it with the nearest category word in an 8/5-token window. Returns a map
 * of category → attribute.
 *
 * Example: "brown leather couch with white rug"
 *   → colors = ['brown', 'white']
 *   → brown is near "couch" (→ sofa category) → { sofa: 'brown' }
 *   → white is near "rug" (→ rug category) → { rug: 'white' }
 *
 * If no specific category is nearby, the attribute is dropped from the map
 * (but stays in the flat `colors[]` / `materials[]` lists).
 */
function attachAttributeToCategory(text, attributes, containsCheck) {
  const result = {};
  if (!attributes || attributes.length === 0) return result;

  const words = text.split(/\s+/);

  for (const attr of attributes) {
    // Find the attribute's index in the tokenized text. Use a loose match:
    // find any word that contains the attribute (e.g. "brown" inside "cognac" won't match).
    let attrIdx = -1;
    for (let i = 0; i < words.length; i++) {
      const w = words[i].replace(/[^a-z]/g, '');
      if (containsCheck(attr, w) || w === attr) {
        attrIdx = i;
        break;
      }
    }
    if (attrIdx === -1) continue;

    // Look in an 8-word window AFTER the attribute for a category word.
    // "brown leather COUCH" — category comes after attribute
    const windowEnd = Math.min(words.length, attrIdx + 9);
    let matchedCategory = null;
    for (let i = attrIdx + 1; i < windowEnd; i++) {
      const word = words[i].replace(/[^a-z]/g, '');
      for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
        if (aliases.some(a => word === a.replace(/ /g, '') || a === word)) {
          matchedCategory = category;
          break;
        }
      }
      if (matchedCategory) break;
    }

    // Also check a 5-word window BEFORE the attribute (for "couch in brown")
    if (!matchedCategory) {
      const windowStart = Math.max(0, attrIdx - 5);
      for (let i = attrIdx - 1; i >= windowStart; i--) {
        const word = words[i].replace(/[^a-z]/g, '');
        for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
          if (aliases.some(a => word === a.replace(/ /g, '') || a === word)) {
            matchedCategory = category;
            break;
          }
        }
        if (matchedCategory) break;
      }
    }

    if (matchedCategory && !result[matchedCategory]) {
      result[matchedCategory] = attr;
    }
  }

  return result;
}

// ── Build 136 — orphan color/material centerpiece defaulting ────────────────
//
// When a user writes a prompt like "brown leather and black metal accents"
// without naming the furniture piece, both colors land in the flat
// `colors[]` list but neither gets attached to a specific category by
// attachAttributeToCategory (no category word is nearby). The matcher
// then has no color preference for the room's centerpiece sofa and ends
// up showing a default-color variant — typically white/beige — which
// rendered as the wrong color in the AI panel.
//
// This helper does ONE narrow thing: look for a word pair where an
// orphan color is immediately followed by an orphan soft (upholstery)
// material. Soft materials are reliable sofa/chair/bed cues. If we find
// such a pair, attach both attributes to the room type's default
// centerpiece category. This addresses the user-reported "brown leather"
// → white-couch failure without affecting any prompt that already had a
// category specified or that uses hard materials (wood/metal/glass —
// those are ambiguous because they could refer to a table, lamp, or
// frame).
//
// SAFETY: this function NEVER overwrites a value attachAttributeToCategory
// already set. It only fills empty centerpiece slots. Any prompt that
// works correctly today continues to work — the only behavioral change
// is for prompts that previously dropped their orphan attributes.
const SOFT_UPHOLSTERY_MATERIALS = new Set([
  'leather', 'velvet', 'linen', 'cotton', 'wool', 'suede', 'fabric', 'chenille',
]);

const ROOM_DEFAULT_CENTERPIECE = {
  'living-room':  'sofa',
  'bedroom':      'bed',
  'dining-room':  'dining-chair',
  'office':       'desk-chair',
  'kitchen':      'dining-chair',  // kitchens with seating typically have chairs
  'outdoor':      'sofa',           // patio sofa / outdoor sectional
  'nursery':      'bed',            // crib falls under bed category
};

// Reverse lookup: literal color word → canonical family name.
// "cream" → "white", "cognac" → "brown", "navy" → "blue", etc.
// Built once at module load. Mirrors WORD_TO_COLOR_FAMILY in colorMap.js
// but redeclared here to keep the dependency surface narrow (we only
// import COLOR_KEYWORDS, not the private map).
const _WORD_TO_FAMILY = (() => {
  const m = new Map();
  for (const [family, words] of Object.entries(COLOR_KEYWORDS)) {
    for (const w of words) {
      if (!m.has(w)) m.set(w, family);
    }
  }
  return m;
})();

function applyOrphanCenterpieceDefault(
  text, roomType, colors, materials, colorByCategory, materialByCategory,
) {
  const target = ROOM_DEFAULT_CENTERPIECE[roomType];
  if (!target) return;
  if (colorByCategory[target]) return; // already set — don't overwrite

  const usedColors = new Set(Object.values(colorByCategory));
  const usedMats   = new Set(Object.values(materialByCategory));

  // Walk word pairs left-to-right looking for color → soft-material adjacency.
  // We require an EXACT word match (not substring) to avoid false positives
  // like "brownie" matching "brown" or "leathered" matching "leather".
  //
  // For colors: resolve the literal source word ("cream", "cognac") to its
  // canonical family ("white", "brown") so the result aligns with the rest
  // of the pipeline (matcher's findMatchingColorVariant operates on family
  // names).
  const words = text.split(/\s+/).map(w => w.replace(/[^a-z]/g, ''));
  for (let i = 0; i < words.length - 1; i++) {
    const wColor = words[i];
    const wMat   = words[i + 1];
    const colorFamily = _WORD_TO_FAMILY.get(wColor);
    if (!colorFamily) continue;
    if (!SOFT_UPHOLSTERY_MATERIALS.has(wMat)) continue;
    if (!materials.includes(wMat)) continue;
    if (!colors.includes(colorFamily)) continue; // sanity: family should be in detected colors
    if (usedColors.has(colorFamily)) continue;   // family already assigned elsewhere
    if (usedMats.has(wMat))          continue;   // material already assigned elsewhere

    // Found an orphan color + soft-material pair. Pin to centerpiece using
    // the canonical family name (so downstream matcher/variant logic
    // keys on the same string the rest of the pipeline uses).
    colorByCategory[target]    = colorFamily;
    materialByCategory[target] = wMat;
    return; // first match wins; don't keep scanning
  }
}

/**
 * Detect ALL matching room types from prompt text, sorted by keyword
 * specificity (longest keyword match first). The first entry is the
 * primary room type; the second (if any) is the secondary.
 *
 * Multi-word keywords are checked first so "breakfast nook" → dining-room
 * (9 chars) wins over "nook" → living-room (4 chars).
 */
function detectAllRoomTypes(text) {
  const matches = [];
  for (const [room, keywords] of Object.entries(ROOM_KEYWORDS)) {
    for (const kw of keywords) {
      if (text.includes(kw)) {
        matches.push({ room, keyword: kw, length: kw.length });
        break; // only need one match per room
      }
    }
  }
  // Sort by keyword length descending (longest/most specific match first)
  matches.sort((a, b) => b.length - a.length);
  return matches.map(m => m.room);
}

// Build 115: weighted, top-3-capped style detection.
//
// The prior implementation pushed EVERY style whose keyword list had any
// match in the text, with no ranking. A single evocative paragraph
// ("rustic living room … quiet … raw … warm …") would trigger 8+ styles
// because short common words like "quiet" (japandi), "raw" (rustic),
// "warm" (transitional) all pattern-matched. The matcher then weighted
// those 8 styles equally and produced wildly inconsistent picks.
//
// New scoring:
//   • Longer/multi-word keywords score higher (more specific intent)
//   • The exact style name in the prompt scores 5× (explicit intent
//     beats keyword spillover — "brutalist" written verbatim should
//     dominate over "raw" matching rustic)
//   • Top 3 styles by score are returned. Ties broken by score order.
//
// This converts the parser from "every-keyword-fires" to "top-3-by-fit",
// dramatically reducing variance in matcher selection without changing
// any downstream API.
// Build 116 fix: normalize hyphens/spaces/underscores when checking
// verbatim style-name match. The keyword 'dark luxe' (with space) and
// the style key 'dark-luxe' (with hyphen) were different strings under
// the prior `kw === style` check, so the 5× verbatim boost SILENTLY
// failed to fire for 5 multi-word styles: dark-luxe, art-deco,
// mid-century, wabi-sabi, french-country. With normalization,
// "Dark Luxe living room..." correctly fires the dark-luxe verbatim
// boost (×5) and dominates over glam keyword matches in the prompt.
// Strictly EXPANDS what counts as verbatim — no existing match weakens.
const _normalizeStyleToken = (s) => String(s || '').replace(/[\s\-_]+/g, '').toLowerCase();

function detectStyles(text) {
  const scored = [];
  for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
    let score = 0;
    const styleNorm = _normalizeStyleToken(style);
    for (const kw of keywords) {
      if (text.includes(kw)) {
        // Specificity weight: longer keywords are rarer and more intentional.
        // 'wabi-sabi' (9 chars) outweighs 'raw' (3 chars).
        const specificity = Math.max(1, kw.length / 3);
        // Verbatim style-name match — normalized so 'dark luxe' === 'dark-luxe'.
        const verbatim = (_normalizeStyleToken(kw) === styleNorm) ? 5 : 1;
        score += specificity * verbatim;
      }
    }
    if (score > 0) scored.push({ style, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const found = scored.slice(0, 3).map((s) => s.style);

  // Mood/material-clue fallback for prompts with no style keyword hits.
  if (found.length === 0) {
    if (text.includes('wood') || text.includes('oak') || text.includes('warm')) found.push('transitional');
    else if (text.includes('white') || text.includes('clean')) found.push('minimalist');
    else if (text.includes('dark') || text.includes('black')) found.push('dark-luxe');
    else found.push('contemporary');
  }
  return found;
}

function detectMaterials(text) {
  const found = [];
  for (const [material, keywords] of Object.entries(MATERIAL_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      found.push(material);
    }
  }
  return found;
}

function detectMoods(text) {
  const found = [];
  for (const [mood, keywords] of Object.entries(MOOD_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      found.push(mood);
    }
  }
  return found;
}

function getDefaults() {
  return {
    roomType: 'living-room',
    styles: ['contemporary'],
    materials: [],
    colors: [],
    colorByCategory: {},
    materialByCategory: {},
    moods: [],
    furnitureCategories: ROOM_FURNITURE['living-room'],
    promptTokens: [],
  };
}

/**
 * Generates a human-readable summary of what was parsed.
 * Useful for debugging.
 */
export function summarizeParsed(parsed) {
  return `${parsed.roomType} · ${parsed.styles.join(', ')} · ${parsed.materials.join(', ')}`;
}
