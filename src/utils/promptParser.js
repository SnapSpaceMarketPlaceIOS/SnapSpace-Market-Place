import {
  ROOM_KEYWORDS,
  STYLE_KEYWORDS,
  MATERIAL_KEYWORDS,
  MOOD_KEYWORDS,
  ROOM_FURNITURE,
} from '../data/styleMap';

/**
 * Parses a free-text AI design prompt and extracts structured keywords.
 *
 * @param {string} promptText - e.g. "Modern minimalist bedroom with warm wood tones and brass accents"
 * @returns {{
 *   roomType: string,
 *   styles: string[],
 *   materials: string[],
 *   moods: string[],
 *   furnitureCategories: string[],
 * }}
 */
export function parseDesignPrompt(promptText) {
  if (!promptText || typeof promptText !== 'string') {
    return getDefaults();
  }

  const text = promptText.toLowerCase();

  const roomType = detectRoomType(text);
  const styles = detectStyles(text);
  const materials = detectMaterials(text);
  const moods = detectMoods(text);
  const furnitureCategories = ROOM_FURNITURE[roomType] || ROOM_FURNITURE['living-room'];

  return { roomType, styles, materials, moods, furnitureCategories };
}

function detectRoomType(text) {
  for (const [room, keywords] of Object.entries(ROOM_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      return room;
    }
  }
  return 'living-room'; // default
}

function detectStyles(text) {
  const found = [];
  for (const [style, keywords] of Object.entries(STYLE_KEYWORDS)) {
    if (keywords.some((kw) => text.includes(kw))) {
      found.push(style);
    }
  }
  // If no styles found, infer from mood/material clues
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
    moods: [],
    furnitureCategories: ROOM_FURNITURE['living-room'],
  };
}

/**
 * Generates a human-readable summary of what was parsed.
 * Useful for debugging.
 */
export function summarizeParsed(parsed) {
  return `${parsed.roomType} · ${parsed.styles.join(', ')} · ${parsed.materials.join(', ')}`;
}
