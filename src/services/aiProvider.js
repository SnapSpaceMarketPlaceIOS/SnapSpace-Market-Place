/**
 * aiProvider.js — Single-provider AI generation router.
 *   Gateway: fal.ai     Model: openai/gpt-image-2/edit
 *
 * ── Model swap: flux-2-pro/edit → GPT Image 2 edit ─────────────────────────
 * The fal.ai GATEWAY is unchanged (same proxyFetch('fal', …), same
 * FAL_API_KEY, same queue.fal.run host). Only the MODEL changed: the three
 * generation fns now route to `./openai` (GPT Image 2 edit) instead of
 * `./fal` (flux-2-pro/edit). All call-site signatures and return shapes are
 * preserved, so screens need no changes.
 *
 * fal.js stays in the repo as orphaned code — the rollback path. Re-point the
 * import below back to './fal' to revert to flux instantly. (This mirrors how
 * replicate.js was kept after Build 63's Replicate→FAL swap.)
 *
 * ── Build 63 (Gate A) history: retired the replicate/fal feature flag ──────
 * Previously this module routed between `replicateService` and `falService`
 * based on `EXPO_PUBLIC_AI_PROVIDER`. That flag is now a no-op. replicate.js
 * is doubly-orphaned and can be deleted in a future cleanup pass.
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

// Active model: GPT Image 2 edit (via the fal.ai gateway). To roll back to
// flux-2-pro/edit, change this single import to `from './fal'` — both modules
// export the identical three-fn surface.
import * as genService from './openai';
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
console.log('[aiProvider] Active: fal gateway · model openai/gpt-image-2/edit');

// ── Generation functions — fal gateway, GPT Image 2 edit model ───────────────

/**
 * Full-room redesign with 2×2 product panel. Primary generation path.
 *
 * @param {string} roomPhotoUrl  Supabase storage URL of the uploaded room photo
 * @param {string} userPrompt    Raw style prompt from the user
 * @param {Array}  products      Matched affiliate products (up to 4)
 * @param {string} panelUrl      Supabase storage URL of the 2×2 product grid
 * @param {string} aspectRatio   e.g. '16:9', '3:2', '1:1'
 * @returns {Promise<{ url: string, predictionId: string, seed: null }>} (GPT Image 2 has no seed)
 */
export function generateWithProductPanel(roomPhotoUrl, userPrompt, products, panelUrl, aspectRatio) {
  return genService.generateWithProductPanel(roomPhotoUrl, userPrompt, products, panelUrl, aspectRatio);
}

/**
 * Full-room redesign using individual product images (fallback when panel fails).
 */
export function generateWithProductRefs(roomPhotoUrl, userPrompt, products, aspectRatio) {
  return genService.generateWithProductRefs(roomPhotoUrl, userPrompt, products, aspectRatio);
}

/**
 * Visualize a single product in the user's room ("Visualize in your space").
 */
export function generateSingleProductInRoom(roomPhotoUrl, product, aspectRatio) {
  return genService.generateSingleProductInRoom(roomPhotoUrl, product, aspectRatio);
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
