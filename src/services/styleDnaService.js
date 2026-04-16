import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * StyleDNAService — personalization engine.
 *
 * Builds and persists the user's style taste profile from implicit signals:
 *   - Rooms they like in Explore
 *   - AI generations they save
 *   - Styles they pick in ProfileScreen
 *
 * Powers:
 *   - Home "Picked For You" section (primaryStyle → ProductService query)
 *   - Snap prompt default text
 *   - Deal of the Day selection
 */

const STORAGE_KEY   = 'homegenie_style_dna';
const MAX_STYLES    = 5;   // rolling window of top styles
const DEFAULT_STYLE = 'modern';

// In-memory cache to avoid repeated AsyncStorage reads on hot paths
let _cache = null;

/**
 * Read the current style profile.
 * Returns an array like ['dark-luxe', 'japandi', 'modern'].
 * Defaults to ['modern'] on first launch.
 */
export async function getStyleProfile() {
  if (_cache) return _cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    _cache = raw ? JSON.parse(raw) : [DEFAULT_STYLE];
  } catch {
    _cache = [DEFAULT_STYLE];
  }
  return _cache;
}

/**
 * The primary style tag — used for single-value API queries.
 * Returns the most recently reinforced style (index 0 after rotation).
 */
export async function getPrimaryStyle() {
  const profile = await getStyleProfile();
  return profile[0] ?? DEFAULT_STYLE;
}

/**
 * Record an implicit style signal (like, save, or generation).
 * Moves the tag to the front of the rolling window.
 *
 * @param {string} styleTag - e.g. 'japandi', 'dark-luxe', 'coastal'
 */
export async function recordStyleSignal(styleTag) {
  if (!styleTag) return;
  const tag = styleTag.toLowerCase().trim();

  const profile = await getStyleProfile();

  // Remove existing occurrence so we can promote it to front
  const filtered = profile.filter((s) => s !== tag);
  const updated  = [tag, ...filtered].slice(0, MAX_STYLES);

  _cache = updated;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
}

/**
 * Explicitly set the user's style profile (e.g. from onboarding quiz).
 * Replaces the current profile entirely.
 *
 * @param {string[]} styles - ordered array, most preferred first
 */
export async function setStyleProfile(styles) {
  if (!Array.isArray(styles) || styles.length === 0) return;
  const clamped = styles.slice(0, MAX_STYLES);
  _cache = clamped;
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(clamped));
}

/**
 * Clear the style profile (e.g. on sign-out).
 */
export async function clearStyleProfile() {
  _cache = null;
  await AsyncStorage.removeItem(STORAGE_KEY);
}
