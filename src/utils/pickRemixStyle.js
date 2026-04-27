/**
 * pickRemixStyle — choose the next carousel preset for a Remix tap.
 *
 * The Remix button on RoomResultScreen rerolls the room into a different
 * carousel style. To make remixes feel fresh — not "I just saw that style
 * two presses ago" — we exclude:
 *   1. The current style (so back-to-back remixes never repeat)
 *   2. The last N styles seen across the session (default N = 3, matches
 *      Build 95's 3-gen anti-repetition rule on fresh prompt taps)
 *
 * Inputs intentionally avoid coupling to STYLE_PRESETS — caller passes the
 * pool so this util stays unit-testable without mocking module imports.
 *
 * Fallback chain: if exclusions empty the candidate set (e.g. user just
 * burned through 12+ remixes), we relax the recent-history exclusion and
 * keep only "anything but current". If even THAT is empty (pool of 1),
 * we return null so the caller can disable the FAB or no-op.
 *
 * @param {Array<{id: string}>} pool         — STYLE_PRESETS or any subset
 * @param {string|null} currentStyleId       — id of the style currently shown
 * @param {Array<string>} recentStyleIds     — recently-shown ids (most-recent-last);
 *                                              effectively the rolling history
 * @param {number} historyDepth              — how many recent ids to honor (default 3)
 * @returns {object|null}                    — a pool entry, or null if pool is empty/single
 */
export function pickRemixStyle(pool, currentStyleId, recentStyleIds = [], historyDepth = 3) {
  if (!Array.isArray(pool) || pool.length === 0) return null;
  if (pool.length === 1) {
    // Pool of 1 is degenerate — only one style exists, nothing to pick.
    // Caller is responsible for hiding/disabling the Remix FAB in this case.
    return null;
  }

  const recent = Array.isArray(recentStyleIds)
    ? recentStyleIds.slice(-historyDepth)
    : [];

  // Primary candidate set: exclude current + recent history.
  const excludeSet = new Set([currentStyleId, ...recent].filter(Boolean));
  let candidates = pool.filter((p) => !excludeSet.has(p.id));

  // Fallback: if recent-history exclusion ate the pool, only exclude current.
  if (candidates.length === 0) {
    candidates = pool.filter((p) => p.id !== currentStyleId);
  }

  // Last-resort safety: if even that is empty (currentStyleId not in pool +
  // pool.length === 1 was already handled, so this branch is essentially
  // unreachable, but leave it for defense-in-depth), fall back to the full
  // pool so we never throw.
  if (candidates.length === 0) {
    candidates = pool;
  }

  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx];
}

/**
 * Append a styleId to a recent-history list, capping at maxDepth.
 * Pure helper so the FAB onPress can advance history without inlining
 * the slice math.
 *
 * @param {Array<string>} list
 * @param {string|null} styleId
 * @param {number} maxDepth   default 3
 * @returns {Array<string>}
 */
export function appendStyleHistory(list, styleId, maxDepth = 3) {
  if (!styleId) return Array.isArray(list) ? list.slice() : [];
  const base = Array.isArray(list) ? list : [];
  return [...base, styleId].slice(-maxDepth);
}
