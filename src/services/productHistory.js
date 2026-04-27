/**
 * productHistory.js — persistent per-user product-recency memory.
 *
 * The matcher uses this to apply a freshness multiplier in its weighted
 * draw so a user doesn't see the same products surface generation after
 * generation. Build 93+ (Week 2 anti-repetition).
 *
 * Storage:
 *   AsyncStorage key: `productHistory:v1` for anonymous users
 *                     `productHistory:v1:<userId>` for signed-in users
 *
 * Shape on disk:
 *   {
 *     genIdx: number,            // monotonic counter, ++ once per generation
 *     entries: {                 // map keyed by product id
 *       [productId]: {
 *         lastSeenGenIdx: number,
 *         seenCount: number,
 *       }
 *     }
 *   }
 *
 * Bounds:
 *   - We cap `entries` at MAX_ENTRIES (200 most-recent). Prunes when exceeded.
 *   - On any read failure (corruption, JSON parse, etc.) we fall through to
 *     an empty history so the matcher never blocks generation.
 *
 * Concurrency:
 *   - Loads are async. Saves are fire-and-forget (we never block the UI).
 *   - The matcher consumes a snapshot — it doesn't write. HomeScreen calls
 *     `recordPickedProducts` AFTER each generation completes.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = 'productHistory:v1';
const MAX_ENTRIES = 200;

function storageKey(userId) {
  return userId ? `${STORAGE_PREFIX}:${userId}` : STORAGE_PREFIX;
}

const EMPTY = Object.freeze({ genIdx: 0, entries: {} });

/**
 * Load the history snapshot for a user (or anon).
 * Always returns a valid object; never throws.
 */
export async function loadProductHistory(userId) {
  try {
    const raw = await AsyncStorage.getItem(storageKey(userId));
    if (!raw) return { genIdx: 0, entries: {} };
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return { genIdx: 0, entries: {} };
    return {
      genIdx: typeof parsed.genIdx === 'number' ? parsed.genIdx : 0,
      entries: parsed.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
    };
  } catch (e) {
    // Corruption, native bridge hiccup, etc. Never block generation on this.
    if (__DEV__) console.warn('[productHistory] load failed:', e?.message || e);
    return { genIdx: 0, entries: {} };
  }
}

/**
 * Persist the history snapshot. Fire-and-forget; errors are swallowed.
 * Caller does NOT need to await this.
 */
export async function saveProductHistory(userId, snapshot) {
  try {
    await AsyncStorage.setItem(storageKey(userId), JSON.stringify(snapshot));
  } catch (e) {
    if (__DEV__) console.warn('[productHistory] save failed:', e?.message || e);
  }
}

/**
 * Returns a NEW snapshot that records the picked products for the next
 * generation index. Pure function — does not mutate the input. Caller
 * is responsible for calling saveProductHistory() with the result.
 *
 * @param {object} prev    snapshot from loadProductHistory()
 * @param {string[]} pickedIds  product ids returned by the matcher this gen
 * @returns {object} new snapshot
 */
export function recordPicks(prev, pickedIds) {
  if (!Array.isArray(pickedIds) || pickedIds.length === 0) return prev;
  const nextGenIdx = (prev.genIdx || 0) + 1;
  const entries = { ...prev.entries };
  for (const id of pickedIds) {
    if (!id) continue;
    const e = entries[id];
    entries[id] = {
      lastSeenGenIdx: nextGenIdx,
      seenCount: (e?.seenCount || 0) + 1,
    };
  }
  // Prune oldest entries if we exceed the cap. Sort by lastSeenGenIdx
  // ascending and drop the oldest until we're back at MAX_ENTRIES.
  const ids = Object.keys(entries);
  if (ids.length > MAX_ENTRIES) {
    const sorted = ids
      .map((id) => ({ id, lastSeenGenIdx: entries[id].lastSeenGenIdx || 0 }))
      .sort((a, b) => a.lastSeenGenIdx - b.lastSeenGenIdx);
    const toDrop = sorted.slice(0, ids.length - MAX_ENTRIES);
    for (const { id } of toDrop) delete entries[id];
  }
  return { genIdx: nextGenIdx, entries };
}

/**
 * Convenience: load → record → save in one call. Returns the new snapshot
 * for callers that want to consume it locally. Fire-and-forget safe.
 */
export async function appendPicksToHistory(userId, pickedIds) {
  const prev = await loadProductHistory(userId);
  const next = recordPicks(prev, pickedIds);
  saveProductHistory(userId, next); // fire-and-forget
  return next;
}

/**
 * Erase the history for a user (used on sign-out / account switch / debug).
 * Never throws.
 */
export async function clearProductHistory(userId) {
  try {
    await AsyncStorage.removeItem(storageKey(userId));
  } catch (e) {
    if (__DEV__) console.warn('[productHistory] clear failed:', e?.message || e);
  }
}

// Test/debug surface
export const __test__ = { STORAGE_PREFIX, MAX_ENTRIES, EMPTY, storageKey };
