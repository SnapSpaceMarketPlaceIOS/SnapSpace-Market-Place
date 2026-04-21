/**
 * aiProvider.js — Single-provider AI generation router (FAL only).
 *
 * ── Build 63 (Gate A): retired the replicate/fal feature flag ──────────────
 * Previously this module routed between `replicateService` and `falService`
 * based on `EXPO_PUBLIC_AI_PROVIDER`. With FAL validated in production and
 * cost-proven (~$0.06/gen vs Replicate's ~$0.13/gen), the flag became a
 * liability — any accidental flip in .env or EAS secrets silently doubled
 * generation cost. The flag is now a no-op; FAL is the only code path.
 *
 * replicate.js remains in the repo as orphaned code for reference, but is
 * no longer imported by any live module. It can be deleted in a future
 * cleanup pass once the team has confidence in Build 63+.
 *
 * ── Public surface ─────────────────────────────────────────────────────────
 *   generateWithProductPanel(roomURL, prompt, products, panelURL, aspect)
 *   generateWithProductRefs(roomURL, prompt, products, aspect)
 *   generateSingleProductInRoom(roomURL, product, aspect)
 *   pickAspectRatio(w, h)
 *   buildFinalPrompt(userPrompt, productHints, colorPalette)
 *
 * Callers should always import from here, never directly from fal.js or
 * promptBuilders.js. This keeps the provider swap surface to a single
 * file if we ever need to bring in a third backend.
 */

import * as falService from './fal';
import { pickAspectRatio as pickAspectRatioImpl, buildFinalPrompt as buildFinalPromptImpl } from './promptBuilders';

// ── Legacy feature-flag compatibility ────────────────────────────────────────
// If an older .env still sets EXPO_PUBLIC_AI_PROVIDER=replicate (or anything
// other than 'fal'), warn once on module load so it shows up in TestFlight
// logs. We still route to FAL — the flag is intentionally ignored.
const LEGACY_FLAG = process.env.EXPO_PUBLIC_AI_PROVIDER;
if (LEGACY_FLAG && LEGACY_FLAG !== 'fal') {
  console.warn(
    '[aiProvider] EXPO_PUBLIC_AI_PROVIDER=' + LEGACY_FLAG +
    ' is ignored — FAL is the only supported provider as of Build 63.'
  );
}
console.log('[aiProvider] Active provider: fal (locked)');

// ── Generation functions — always FAL ────────────────────────────────────────

/**
 * Full-room redesign with 2×2 product panel. Primary generation path.
 *
 * @param {string} roomPhotoUrl  Supabase storage URL of the uploaded room photo
 * @param {string} userPrompt    Raw style prompt from the user
 * @param {Array}  products      Matched affiliate products (up to 4)
 * @param {string} panelUrl      Supabase storage URL of the 2×2 product grid
 * @param {string} aspectRatio   e.g. '16:9', '3:2', '1:1'
 * @returns {Promise<{ url: string, predictionId: string, seed: number }>}
 */
export function generateWithProductPanel(roomPhotoUrl, userPrompt, products, panelUrl, aspectRatio) {
  return falService.generateWithProductPanel(roomPhotoUrl, userPrompt, products, panelUrl, aspectRatio);
}

/**
 * Full-room redesign using individual product images (fallback when panel fails).
 */
export function generateWithProductRefs(roomPhotoUrl, userPrompt, products, aspectRatio) {
  return falService.generateWithProductRefs(roomPhotoUrl, userPrompt, products, aspectRatio);
}

/**
 * Visualize a single product in the user's room ("Visualize in your space").
 */
export function generateSingleProductInRoom(roomPhotoUrl, product, aspectRatio) {
  return falService.generateSingleProductInRoom(roomPhotoUrl, product, aspectRatio);
}

// ── Model-agnostic utilities — source of truth in promptBuilders.js ──────────
// Re-exported here so callers don't need to know which module owns them.

/**
 * Snap a raw aspect ratio (width/height) to the nearest supported bucket.
 * Buckets: '21:9' | '16:9' | '3:2' | '4:3' | '1:1' | '3:4' | '2:3' | '9:16' | '9:21'
 */
export const pickAspectRatio = pickAspectRatioImpl;

/**
 * Build the final generation prompt, capped at 200 words.
 * Combines user intent with product hint text and optional color palette.
 */
export const buildFinalPrompt = buildFinalPromptImpl;
