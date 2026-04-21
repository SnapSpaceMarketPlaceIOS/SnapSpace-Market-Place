/**
 * SnapSpace — FAL AI provider (cost-optimized swap for Replicate flux-2-max)
 *
 * Mirrors the export signature of `src/services/replicate.js` so the feature
 * flag router (`src/services/aiProvider.js`, Phase 4) can swap providers
 * with no changes to call-site code.
 *
 * Target model: fal-ai/flux-2-pro/edit
 * Endpoint:     https://queue.fal.run/fal-ai/flux-2-pro/edit
 * Auth:         Authorization: Key <FAL_API_KEY>  (injected by ai-proxy in
 *               production; injected by directFetch in __DEV__)
 *
 * Cost model (FLUX 2 Pro Edit):
 *   First MP of output:           $0.030
 *   Each additional billable MP:  $0.015  (input + output combined, rounds up)
 *
 * With Phase 1's 1 MP image optimization in effect:
 *   1 MP room photo + 1 MP 2×2 panel + 1 MP output = 3 MP = $0.060/gen
 *
 * Without Phase 1, a raw 12 MP iPhone photo blows the budget to ~$0.225/gen.
 *
 * ── Architectural contract with replicate.js ──────────────────────────────
 * Three exports are functionally identical from the caller's perspective:
 *   - generateWithProductPanel(roomURL, prompt, products, panelURL, aspect)
 *       → returns { url, predictionId, seed }   (matches replicate's shape)
 *   - generateWithProductRefs(roomURL, prompt, products, aspect)
 *       → returns string (the URL)              (matches replicate)
 *   - generateSingleProductInRoom(roomURL, product, aspect)
 *       → returns string (the URL)              (matches replicate)
 *
 * Prompt builders are imported from replicate.js — the structured-edit
 * prompt format (QUALITY_PREFIX → preserve-arch → product placement) is
 * model-agnostic and works identically on FAL's flux-2-pro/edit.
 */

import { describeProductForPrompt } from '../utils/productDescriptor';
import { proxyFetch } from './apiProxy';
// Build 63 (Gate A): prompt builders live in a provider-neutral module so
// fal.js has zero runtime dependency on replicate.js. replicate.js is now
// orphaned (no import graph edge into it) and can be deleted in a future
// cleanup. Keeping it around for the moment in case a rollback is needed.
import { buildPanelPrompt, buildFlux2MaxPrompt, getQualityPrefix } from './promptBuilders';

const FAL_QUEUE_URL = 'https://queue.fal.run/fal-ai/flux-2-pro/edit';
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 80; // 3s × 80 = 4 min ceiling — matches replicate.js

// Retry on transient/seed-dependent errors. Covers BOTH Replicate (E006) and
// FAL (safety/moderation/nsfw_concepts/content_policy) error shapes so the
// retry behavior is consistent across providers.
const RETRYABLE_ERROR_REGEX =
  /E006|invalid input|content moderated|safety|moderation|nsfw_concepts|content_policy/i;
// Build 38: bumped from 1500ms to 2200ms. The Supabase ai-proxy enforces a
// 2000ms per-user cooldown via check_ai_rate_limit (014_rate_limits.sql).
// A 1500ms backoff meant the retry POST always 429'd before reaching FAL,
// turning every "transient/moderation" failure into a hard failure even
// though FAL was perfectly capable of succeeding on a fresh seed. 2200ms
// gives a 200ms safety margin over the cooldown wall.
const RETRY_BACKOFF_MS = 2200;

// Build 62: QUALITY_PREFIX moved to replicate.js as getQualityPrefix() — both
// providers now share a single rotating-light quality prefix so the lighting
// pool stays consistent across the FAL/Replicate split. Removing the local
// duplicate prevents future drift (the source of bugs where one provider
// shipped a token tweak the other didn't).

// ─────────────────────────────────────────────────────────────────────────────
// Aspect ratio → image_size dimension mapping
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Map an aspect-ratio bucket name (from replicate.js → pickAspectRatio) to
 * FAL's explicit { width, height } image_size object. All entries land at
 * ~1 MP total to stay in the cheap billing tier (3 MP per generation =
 * $0.060). Dimensions are multiples of 64 — FAL's flux pipeline rounds
 * non-multiple-of-64 dimensions internally and that rounding can push a
 * generation into the next billable MP bucket.
 */
const ASPECT_TO_IMAGE_SIZE = {
  '21:9': { width: 1536, height: 640  },
  '16:9': { width: 1344, height: 768  },
  '3:2':  { width: 1216, height: 832  },
  '4:3':  { width: 1152, height: 896  },
  '1:1':  { width: 1024, height: 1024 },
  '3:4':  { width: 896,  height: 1152 },
  '2:3':  { width: 832,  height: 1216 },
  '9:16': { width: 768,  height: 1344 },
  '9:21': { width: 640,  height: 1536 },
};

/**
 * Resolve a `pickAspectRatio` bucket to FAL's image_size object.
 * Falls back to 1:1 (the safest, most-supported bucket) if the input doesn't
 * map — this covers replicate's `'match_input_image'` sentinel which FAL has
 * no equivalent for.
 *
 * @param {string} aspectRatio  One of '21:9'..'9:21' or 'match_input_image'
 * @returns {{ width: number, height: number }}
 */
function resolveImageSize(aspectRatio) {
  return ASPECT_TO_IMAGE_SIZE[aspectRatio] || ASPECT_TO_IMAGE_SIZE['1:1'];
}

// ─────────────────────────────────────────────────────────────────────────────
// FAL queue submission + polling with retry-on-moderation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submit a prediction to FAL's queue endpoint and poll to completion, with
 * ONE retry on transient/moderation-class errors using a fresh random seed.
 *
 * The retry semantics are intentionally identical to replicate.js's
 * `submitFluxWithRetry` — same regex coverage, same backoff, same single
 * retry attempt. This keeps end-user error rates comparable when toggling
 * the feature flag.
 *
 * @param {object} baseInput  Everything except `seed` — prompt, image_urls,
 *                            image_size, output_format, safety_tolerance.
 * @returns {Promise<{ url: string, predictionId: string, seed: number }>}
 */
async function submitFalWithRetry(baseInput) {
  const maxAttempts = 2;
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const seed = Math.floor(Math.random() * 999999999);
    const input = { ...baseInput, seed };

    try {
      const submitRes = await proxyFetch('fal', FAL_QUEUE_URL, {
        method: 'POST',
        body: input,
      });

      const submission = await submitRes.json();
      if (!submitRes.ok) {
        throw new Error(
          `flux-2-pro/edit submit failed (${submitRes.status}): ` +
          `${submission?.detail || submission?.error || JSON.stringify(submission).substring(0, 200)}`
        );
      }

      // FAL queue submission shape:
      //   { request_id, status, response_url, status_url, queue_position? }
      const requestId  = submission.request_id;
      const statusUrl  = submission.status_url;
      const responseUrl = submission.response_url;

      if (!statusUrl || !responseUrl) {
        throw new Error(
          'flux-2-pro/edit submit returned malformed envelope: ' +
          `missing status_url/response_url. Got: ${JSON.stringify(submission).substring(0, 200)}`
        );
      }

      const url = await pollUntilDone(statusUrl, responseUrl);

      if (attempt > 1) {
        console.log(`[flux-2-pro/edit] recovered on retry (attempt ${attempt}/${maxAttempts})`);
      }

      return { url, predictionId: requestId, seed };

    } catch (err) {
      lastErr = err;
      const msg = err?.message || '';
      const retryable = RETRYABLE_ERROR_REGEX.test(msg);

      if (attempt < maxAttempts && retryable) {
        console.warn(
          `[flux-2-pro/edit] attempt ${attempt} failed (${msg.substring(0, 100)}) — retrying with new seed`
        );
        await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
        continue;
      }

      throw err;
    }
  }

  throw lastErr;
}

/**
 * Poll FAL's status_url until the request reaches a terminal state, then
 * fetch the actual result from response_url.
 *
 * FAL queue states (per docs):
 *   IN_QUEUE     → just submitted, not started
 *   IN_PROGRESS  → actively generating
 *   COMPLETED    → success — fetch from response_url
 *   FAILED       → terminal error
 *
 * @param {string} statusUrl   GET endpoint for queue status
 * @param {string} responseUrl GET endpoint for the final result payload
 * @returns {Promise<string>}  The generated image URL
 */
async function pollUntilDone(statusUrl, responseUrl) {
  // Build 44: allow up to this many *consecutive* transient poll failures
  // (network blip, proxy 5xx, malformed JSON, supabase.auth.getSession
  // refresh glitch, etc.) before surfacing an error. One bad poll response
  // previously killed the entire generation — the #1 suspect for the Build
  // 42/43 TestFlight report where FAL's dashboard showed a valid submit
  // followed by client-side Ring-1 throw. A successful poll resets the
  // streak back to 0.
  const MAX_CONSECUTIVE_POLL_FAILURES = 3;
  let consecutiveFailures = 0;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    let status = null;
    try {
      const statusRes = await proxyFetch('fal', statusUrl, { method: 'GET' });
      status = await statusRes.json();
      // Successful parse — reset transient-failure streak.
      consecutiveFailures = 0;
    } catch (pollErr) {
      consecutiveFailures += 1;
      console.warn(
        '[flux-2-pro/edit] poll ' + (i + 1) + ' failed (' +
        consecutiveFailures + '/' + MAX_CONSECUTIVE_POLL_FAILURES + ' consecutive): ' +
        String(pollErr?.message || pollErr).substring(0, 120)
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        throw new Error(
          'FAL polling failed ' + MAX_CONSECUTIVE_POLL_FAILURES +
          ' times in a row: ' + String(pollErr?.message || pollErr).substring(0, 120)
        );
      }
      // Skip terminal-state checks this iteration — try again on next tick.
      continue;
    }

    if (status?.status === 'COMPLETED') {
      // Fetch the actual result payload. This fetch gets ONE retry on
      // transient failure for symmetry with the polling loop — the result
      // payload is often the same "reachable in 2nd attempt" cold-cache
      // shape as status responses.
      let result = null;
      let lastResultErr = null;
      for (let r = 0; r < 2; r++) {
        try {
          const resultRes = await proxyFetch('fal', responseUrl, { method: 'GET' });
          result = await resultRes.json();
          break;
        } catch (resErr) {
          lastResultErr = resErr;
          console.warn('[flux-2-pro/edit] result fetch attempt ' + (r + 1) +
            ' failed: ' + String(resErr?.message || resErr).substring(0, 120));
          await new Promise(res => setTimeout(res, 1500));
        }
      }
      if (!result) {
        throw new Error(
          'flux-2-pro/edit result fetch failed after retry: ' +
          String(lastResultErr?.message || lastResultErr).substring(0, 120)
        );
      }

      // Result shape: { images: [{ url, width, height, content_type }], seed, ... }
      const firstImage = result?.images?.[0];
      if (!firstImage?.url) {
        throw new Error(
          'flux-2-pro/edit returned no image URL. Result: ' +
          JSON.stringify(result).substring(0, 200)
        );
      }
      return firstImage.url;
    }

    if (status?.status === 'FAILED') {
      const errMsg = status.error || status.detail || 'AI generation failed';
      // Surface a friendly error for known image-format issues
      if (/UnidentifiedImageError|cannot identify image|invalid.*image/i.test(errMsg)) {
        throw new Error('The image format is not supported. Please try a different photo from your library.');
      }
      throw new Error(errMsg);
    }

    // Unknown/missing status.status (e.g. proxy returned an auth error object
    // like {error: "Session expired"}). Don't silently loop forever — treat
    // like a transient poll failure so the streak counter catches repeated
    // garbage responses.
    if (!status?.status) {
      consecutiveFailures += 1;
      console.warn(
        '[flux-2-pro/edit] poll ' + (i + 1) + ' returned no .status (' +
        consecutiveFailures + '/' + MAX_CONSECUTIVE_POLL_FAILURES + ' consecutive): ' +
        JSON.stringify(status || {}).substring(0, 120)
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        throw new Error(
          'FAL polling returned malformed status ' + MAX_CONSECUTIVE_POLL_FAILURES +
          ' times in a row: ' + JSON.stringify(status || {}).substring(0, 120)
        );
      }
      continue;
    }

    // IN_QUEUE / IN_PROGRESS — keep polling
  }

  throw new Error('AI generation timed out after 4 minutes. Please try again.');
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — three exports matching replicate.js exactly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a product-aware room redesign using a 2-image input.
 *
 * Sends [roomPhotoUrl, panelUrl] — the same compact 2-input shape used by
 * the Replicate panel path. With Phase 1 image optimization in effect, both
 * inputs are ~1 MP, output is 1 MP → 3 billable MP → $0.060/generation.
 *
 * @param {string}   roomPhotoUrl  Public URL of user's (optimized) room photo
 * @param {string}   userPrompt    Enriched design prompt (from buildFinalPrompt)
 * @param {object[]} products      Matched products (used for prompt building)
 * @param {string}   panelUrl      Public URL of the 2×2 product panel
 * @param {string}   [aspectRatio] Bucket from pickAspectRatio() — defaults to 1:1
 * @returns {Promise<{ url: string, predictionId: string, seed: number }>}
 */
export async function generateWithProductPanel(roomPhotoUrl, userPrompt, products, panelUrl, aspectRatio) {
  if (!roomPhotoUrl) throw new Error('generateWithProductPanel requires a public room photo URL.');
  if (!panelUrl)     throw new Error('generateWithProductPanel requires a product panel URL.');

  const imageUrls   = [roomPhotoUrl, panelUrl];
  const generationPrompt = buildPanelPrompt(userPrompt || 'Modern minimalist interior design.', products || []);
  const imageSize   = resolveImageSize(aspectRatio);

  if (__DEV__) {
    console.log('[flux-2-pro/edit panel] Prompt:', generationPrompt.substring(0, 200) + '...');
    console.log('[flux-2-pro/edit panel] image_urls: 2 (room + 2×2 product panel)');
    console.log('[flux-2-pro/edit panel] image_size:', `${imageSize.width}×${imageSize.height}`, '(from aspect:', aspectRatio || 'default', ')');
    console.log('[flux-2-pro/edit panel] Panel URL:', panelUrl.substring(0, 80));
  }

  return await submitFalWithRetry({
    prompt:           generationPrompt,
    image_urls:       imageUrls,
    image_size:       imageSize,
    output_format:    'jpeg',     // FAL flux-2-pro/edit only accepts jpeg|png (no webp)
    safety_tolerance: 5,          // FAL accepts the same scale (1-6)
  });
}

/**
 * Fallback path: send the room photo plus up to 4 individual product images
 * to FAL. Used by HomeScreen when the 2×2 panel build fails (composite-products
 * edge function down, all product URLs broken, etc.).
 *
 * Cost note: each additional product image adds ~$0.015. With 4 products,
 * expect ~$0.105/gen — roughly the same as Replicate's individual-refs
 * fallback path was, but in exchange for a more reliable retry surface.
 *
 * @param {string}   roomPhotoUrl  Public URL of user's room photo
 * @param {string}   userPrompt    Enriched design prompt
 * @param {object[]} products      Matched products (each with imageUrl)
 * @param {string}   [aspectRatio] Bucket from pickAspectRatio()
 * @returns {Promise<string>}      URL of the generated room image
 */
export async function generateWithProductRefs(roomPhotoUrl, userPrompt, products, aspectRatio) {
  if (!roomPhotoUrl) throw new Error('generateWithProductRefs requires a public room photo URL.');

  const productImages = (products || [])
    .filter(p => p.imageUrl)
    .slice(0, 4)
    .map(p => p.imageUrl);

  const imageUrls   = [roomPhotoUrl, ...productImages];
  const generationPrompt = buildFlux2MaxPrompt(userPrompt || 'Modern minimalist interior design.', products || []);
  const imageSize   = resolveImageSize(aspectRatio);

  if (__DEV__) {
    console.log('[flux-2-pro/edit refs] Prompt:', generationPrompt.substring(0, 200) + '...');
    console.log('[flux-2-pro/edit refs] image_urls:', imageUrls.length, '(1 room +', productImages.length, 'products)');
    console.log('[flux-2-pro/edit refs] image_size:', `${imageSize.width}×${imageSize.height}`, '(from aspect:', aspectRatio || 'default', ')');
  }

  const result = await submitFalWithRetry({
    prompt:           generationPrompt,
    image_urls:       imageUrls,
    image_size:       imageSize,
    output_format:    'jpeg',     // FAL flux-2-pro/edit only accepts jpeg|png (no webp)
    safety_tolerance: 5,
  });

  return result.url;
}

/**
 * Place a SINGLE product into the user's room photo (the "Visualize in your
 * space" CTA from ProductDetailScreen). 2-image input, no product matching,
 * no style intent.
 *
 * @param {string} roomPhotoUrl   Public URL of user's room photo
 * @param {object} product        Product object with imageUrl, name, category, materials, tags
 * @param {string} [aspectRatio]  Bucket from pickAspectRatio()
 * @returns {Promise<string>}     URL of the generated image
 */
export async function generateSingleProductInRoom(roomPhotoUrl, product, aspectRatio) {
  if (!roomPhotoUrl) throw new Error('generateSingleProductInRoom requires a public room photo URL.');
  if (!product?.imageUrl) throw new Error('generateSingleProductInRoom requires a product with an imageUrl.');

  const descriptor = describeProductForPrompt(product) || (product.category || 'furniture').replace(/-/g, ' ');

  // Cap Amazon product image to 512px max dimension — FAL's per-MP billing
  // makes large product source images costly even though the model
  // downsamples internally. Same regex strategy as replicate.js.
  let productImageUrl = product.imageUrl;
  try {
    const parsed = new URL(productImageUrl);
    if (parsed.hostname.includes('amazon') || parsed.hostname.includes('media-amazon')) {
      productImageUrl = productImageUrl.replace(/\._[A-Z0-9_]+_\./, '._AC_SL512_.');
      console.log('[flux-2-pro/edit] resized Amazon image to 512px:', productImageUrl.substring(productImageUrl.lastIndexOf('/') + 1));
    }
  } catch {
    // URL parsing failed — use original URL unchanged
  }

  const prompt = [
    getQualityPrefix(),
    'This is a precise scene edit, not a new generation.',
    'Preserve image 1 exactly: same walls, floor, ceiling, windows, lighting, camera angle, perspective, and spatial layout. Do not alter any architecture.',
    `Place this EXACT product reference (image 2) into the room: ${descriptor}. Match color, material, silhouette, and proportions precisely. Position it naturally where this type of furniture belongs in the room. Do not substitute with similar-looking alternatives.`,
  ].join(' ');

  const imageSize = resolveImageSize(aspectRatio);

  if (__DEV__) {
    console.log('[flux-2-pro/edit] single-product prompt:', prompt.substring(0, 200) + '...');
    console.log('[flux-2-pro/edit] image_urls: 2 (1 room + 1 product)');
    console.log('[flux-2-pro/edit] product image:', productImageUrl.substring(0, 80));
    console.log('[flux-2-pro/edit] image_size:', `${imageSize.width}×${imageSize.height}`);
  }

  const result = await submitFalWithRetry({
    prompt,
    image_urls:       [roomPhotoUrl, productImageUrl],
    image_size:       imageSize,
    output_format:    'jpeg',     // FAL flux-2-pro/edit only accepts jpeg|png (no webp)
    safety_tolerance: 5,
  });

  return result.url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports for convenience: provider-neutral helpers live in
// ./promptBuilders. Re-exporting here lets callers keep the one-stop-shop
// import pattern (`import { pickAspectRatio } from '../services/fal'`).
// ─────────────────────────────────────────────────────────────────────────────
export { pickAspectRatio, buildFinalPrompt } from './promptBuilders';
