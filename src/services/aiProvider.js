/**
 * aiProvider.js — Feature-flag router for AI generation providers.
 *
 * Controls which backend handles image generation calls without requiring
 * a code deploy. Flip EXPO_PUBLIC_AI_PROVIDER in .env (or EAS secrets) to
 * switch between providers instantly on app restart.
 *
 * Supported values:
 *   replicate  (default) — Replicate flux-2-max,  ~$0.13/gen
 *   fal                  — FAL flux-2-pro/edit,    ~$0.06/gen
 *
 * Usage (callers import from here, never from replicate.js or fal.js directly):
 *
 *   import {
 *     generateWithProductPanel,
 *     generateWithProductRefs,
 *     generateSingleProductInRoom,
 *     pickAspectRatio,
 *     buildFinalPrompt,
 *   } from '../services/aiProvider';
 *
 * Provider selection is resolved once at module load time — changing the env
 * var takes effect on the next app restart (expected behavior for a feature flag).
 *
 * Model-agnostic utilities (pickAspectRatio, buildFinalPrompt) always come from
 * replicate.js since they are provider-independent and kept as the source of truth.
 */

import * as replicateService from './replicate';
import * as falService from './fal';

// ── Provider selection ────────────────────────────────────────────────────────
// Metro statically replaces literal `process.env.EXPO_PUBLIC_*` at bundle time,
// but only literal references — a computed key would be stripped in prod.
// Reading the flag inline here is intentional and safe: it's a feature flag
// (non-secret), so inlining it in the bundle is fine.
const ACTIVE_PROVIDER = process.env.EXPO_PUBLIC_AI_PROVIDER || 'replicate';
const isFal = ACTIVE_PROVIDER === 'fal';

console.log(`[aiProvider] Active provider: ${ACTIVE_PROVIDER}`);

// ── Generation functions — routed by flag ────────────────────────────────────

/**
 * Full-room redesign with 2×2 product panel.
 * Primary generation path.
 *
 * @param {string} roomPhotoUrl  Supabase storage URL of the uploaded room photo
 * @param {string} userPrompt    Raw style prompt from the user
 * @param {Array}  products      Matched affiliate products (up to 4)
 * @param {string} panelUrl      Supabase storage URL of the 2×2 product grid
 * @param {string} aspectRatio   e.g. '16:9', '3:2', '1:1'
 * @returns {Promise<{ url: string, predictionId: string, seed: number }>}
 */
export function generateWithProductPanel(roomPhotoUrl, userPrompt, products, panelUrl, aspectRatio) {
  console.log(`[aiProvider] Routing to ${ACTIVE_PROVIDER} for generateWithProductPanel`);
  return isFal
    ? falService.generateWithProductPanel(roomPhotoUrl, userPrompt, products, panelUrl, aspectRatio)
    : replicateService.generateWithProductPanel(roomPhotoUrl, userPrompt, products, panelUrl, aspectRatio);
}

/**
 * Full-room redesign using individual product images (fallback when panel fails).
 *
 * @param {string} roomPhotoUrl  Supabase storage URL of the uploaded room photo
 * @param {string} userPrompt    Raw style prompt from the user
 * @param {Array}  products      Matched affiliate products (up to 4)
 * @param {string} aspectRatio   e.g. '16:9', '3:2', '1:1'
 * @returns {Promise<string>}    URL of the generated image
 */
export function generateWithProductRefs(roomPhotoUrl, userPrompt, products, aspectRatio) {
  console.log(`[aiProvider] Routing to ${ACTIVE_PROVIDER} for generateWithProductRefs`);
  return isFal
    ? falService.generateWithProductRefs(roomPhotoUrl, userPrompt, products, aspectRatio)
    : replicateService.generateWithProductRefs(roomPhotoUrl, userPrompt, products, aspectRatio);
}

/**
 * Visualize a single product in the user's room ("Visualize in your space").
 *
 * @param {string} roomPhotoUrl  Supabase storage URL of the uploaded room photo
 * @param {object} product       Affiliate product object (needs imageUrl)
 * @param {string} aspectRatio   e.g. '16:9', '3:2', '1:1'
 * @returns {Promise<string>}    URL of the generated image
 */
export function generateSingleProductInRoom(roomPhotoUrl, product, aspectRatio) {
  console.log(`[aiProvider] Routing to ${ACTIVE_PROVIDER} for generateSingleProductInRoom`);
  return isFal
    ? falService.generateSingleProductInRoom(roomPhotoUrl, product, aspectRatio)
    : replicateService.generateSingleProductInRoom(roomPhotoUrl, product, aspectRatio);
}

// ── Model-agnostic utilities — always from replicate.js (source of truth) ────
// These are prompt/aspect-ratio helpers that are provider-independent.
// fal.js re-exports them from replicate.js anyway, so we go straight to the source.

/**
 * Snap a raw aspect ratio (width/height) to the nearest supported bucket.
 * Buckets: '21:9' | '16:9' | '3:2' | '4:3' | '1:1' | '3:4' | '2:3' | '9:16' | '9:21'
 */
export const pickAspectRatio = replicateService.pickAspectRatio;

/**
 * Build the final generation prompt, capped at 200 words.
 * Combines user intent with product hint text.
 */
export const buildFinalPrompt = replicateService.buildFinalPrompt;
