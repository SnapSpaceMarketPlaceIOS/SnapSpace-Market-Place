import {
  ROOM_KEYWORDS,
  STYLE_KEYWORDS,
  MATERIAL_KEYWORDS,
  MOOD_KEYWORDS,
  ROOM_FURNITURE,
} from '../data/styleMap';
import { detectColorFamilies } from './colorMap';

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
function detectStyles(text) {
  const scored = [];
  for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
    let score = 0;
    for (const kw of keywords) {
      if (text.includes(kw)) {
        // Specificity weight: longer keywords are rarer and more intentional.
        // 'wabi-sabi' (9 chars) outweighs 'raw' (3 chars).
        const specificity = Math.max(1, kw.length / 3);
        // Verbatim style-name match in prompt = explicit intent boost.
        const verbatim = (kw === style) ? 5 : 1;
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
