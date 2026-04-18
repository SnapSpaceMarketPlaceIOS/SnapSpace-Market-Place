/**
 * withTimeout — race a promise against a timeout.
 *
 * Returns a new Promise that resolves with the original promise's value if it
 * settles first, or rejects with a labeled error if `ms` milliseconds elapse
 * first. The original promise is NOT cancelled (JS doesn't support promise
 * cancellation) — it continues running in the background and its result is
 * simply ignored. This is a real consideration if the underlying operation
 * has side effects (e.g. a Supabase insert that succeeds AFTER our timeout);
 * callers should design for "the op may have partially completed."
 *
 * Why this exists as a shared util:
 *   Every place in the codebase that awaits a network call needs to guard
 *   against that call never returning. Before this util, HomeScreen's
 *   verifyGeneratedProducts() had no timeout, so when Anthropic's Haiku API
 *   was slow/degraded, the whole generation UI hung on "Adding the finishing
 *   touches…" forever (the successful Replicate output was produced but never
 *   reached the user — see Apr 17 2026 TestFlight report). AuthContext and
 *   supabase.js each had their own local copy of this helper; this file
 *   replaces the pattern with a single import.
 *
 * Typical values:
 *   2_000  — fast local lookups, in-memory caches
 *   5_000  — Supabase auth / profile fetches
 *   10_000 — Supabase writes, Edge Function calls
 *   15_000 — network-sensitive writes with retries
 *   20_000 — AI vision / LLM calls (Claude Haiku verify etc.)
 *   30_000 — long AI generations (Replicate predictions)
 *
 * @param {Promise<T>} promise  The promise to race
 * @param {number}     ms       Timeout in milliseconds
 * @param {string}     label    Human-readable name of the operation (used in
 *                              the reject error message for debuggability)
 * @returns {Promise<T>}        Resolves with the original promise's value or
 *                              rejects with `Error("<label> timed out after Ns")`
 */
export function withTimeout(promise, ms, label = 'operation') {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(
        () => reject(new Error(`${label} timed out after ${ms / 1000}s — please try again.`)),
        ms,
      ),
    ),
  ]);
}
