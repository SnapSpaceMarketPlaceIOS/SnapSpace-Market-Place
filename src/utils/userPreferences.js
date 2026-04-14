/**
 * userPreferences — Lightweight user preference tracker.
 *
 * Tracks style, color, and material affinity from cart additions and likes.
 * Persisted in AsyncStorage so preferences survive app restarts.
 * Used by productMatcher.js as a soft scoring bonus (max 5 pts).
 *
 * Storage format: { styles: { minimalist: 3, scandi: 1 }, colors: { brown: 2 }, materials: { wood: 4 } }
 * Each value is a count of how many times that attribute appeared in a liked/carted product.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { detectColorFamilies } from './colorMap';

const PREF_KEY = '@snapspace_user_preferences';

let cachedPrefs = null;

/**
 * Load preferences from disk (or return cached copy).
 */
export async function getUserPreferences() {
  if (cachedPrefs) return cachedPrefs;
  try {
    const raw = await AsyncStorage.getItem(PREF_KEY);
    cachedPrefs = raw ? JSON.parse(raw) : { styles: {}, colors: {}, materials: {} };
  } catch {
    cachedPrefs = { styles: {}, colors: {}, materials: {} };
  }
  return cachedPrefs;
}

/**
 * Record a product interaction (cart add or like).
 * Increments style/color/material counts.
 */
export async function recordProductInteraction(product) {
  if (!product) return;
  const prefs = await getUserPreferences();

  // Increment styles
  for (const style of (product.styles || [])) {
    prefs.styles[style] = (prefs.styles[style] || 0) + 1;
  }

  // Increment colors from product text
  const productText = [product.name || '', ...(product.tags || [])].join(' ');
  const colorFamilies = detectColorFamilies(productText);
  for (const color of colorFamilies) {
    prefs.colors[color] = (prefs.colors[color] || 0) + 1;
  }

  // Increment materials
  for (const mat of (product.materials || [])) {
    prefs.materials[mat] = (prefs.materials[mat] || 0) + 1;
  }

  cachedPrefs = prefs;
  try {
    await AsyncStorage.setItem(PREF_KEY, JSON.stringify(prefs));
  } catch {
    // Non-fatal — preferences are a bonus, not critical
  }
}

/**
 * Compute a preference bonus for a product (0-5 pts).
 * Returns a score based on how well the product matches
 * accumulated user preferences.
 *
 * @param {object} product - catalog product
 * @param {object|null} prefs - result of getUserPreferences() (pass null to skip)
 * @returns {number} bonus score 0-5
 */
export function computePreferenceBonus(product, prefs) {
  if (!prefs || !product) return 0;

  let bonus = 0;

  // Style affinity (max 2 pts)
  if (prefs.styles && product.styles) {
    for (const style of product.styles) {
      const count = prefs.styles[style] || 0;
      if (count > 0) {
        bonus += Math.min(count * 0.5, 2);
        break; // one style match is enough
      }
    }
  }

  // Color affinity (max 1.5 pts)
  if (prefs.colors) {
    const productText = [product.name || '', ...(product.tags || [])].join(' ');
    const productColors = detectColorFamilies(productText);
    for (const color of productColors) {
      const count = prefs.colors[color] || 0;
      if (count > 0) {
        bonus += Math.min(count * 0.3, 1.5);
        break;
      }
    }
  }

  // Material affinity (max 1.5 pts)
  if (prefs.materials && product.materials) {
    for (const mat of product.materials) {
      const count = prefs.materials[mat] || 0;
      if (count > 0) {
        bonus += Math.min(count * 0.3, 1.5);
        break;
      }
    }
  }

  return Math.min(bonus, 5); // hard cap
}

/**
 * Clear all stored preferences (e.g., on sign-out).
 */
export async function clearUserPreferences() {
  cachedPrefs = { styles: {}, colors: {}, materials: {} };
  try {
    await AsyncStorage.removeItem(PREF_KEY);
  } catch {
    // Non-fatal
  }
}
