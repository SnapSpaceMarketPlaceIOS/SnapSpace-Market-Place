/**
 * SnapSpace — GPT Image 2 provider (model swap for flux-2-pro/edit)
 *
 * Runs OpenAI's GPT Image 2 *edit* model through the SAME fal.ai gateway we
 * already use for flux. Nothing about the transport changes:
 *   - same proxyFetch('fal', …) path
 *   - same FAL_API_KEY (server-injected by ai-proxy in prod, EXPO_PUBLIC_ in dev)
 *   - same queue.fal.run host
 * The ONLY difference vs fal.js is the model endpoint (openai/gpt-image-2/edit
 * instead of fal-ai/flux-2-pro/edit) and the request schema that model expects.
 *
 * Target model: openai/gpt-image-2/edit  (GPT Image 2, image-to-image edit)
 * Endpoint:     https://queue.fal.run/openai/gpt-image-2/edit
 * Auth:         Authorization: Key <FAL_API_KEY>  (unchanged from flux)
 *
 * ── Schema deltas vs flux-2-pro/edit (verified against fal docs 2026-05) ────
 *   + quality:        'auto' | 'low' | 'medium' | 'high'  (default 'high')
 *                     THE cost lever — low ≪ medium ≪ high. See GPT_IMAGE_QUALITY.
 *   ~ image_size:     fal enum (square_hd / landscape_4_3 / landscape_16_9 /
 *                     portrait_4_3 / portrait_16_9 / auto) OR {width,height}.
 *                     GPT Image 2 renders native orientations, so we map our
 *                     aspect buckets to the ENUM rather than flux's arbitrary
 *                     multiple-of-64 dimensions (which the model would snap).
 *   - seed:           GPT Image 2 has NO seed param. Retry is a plain re-submit
 *                     (the model is non-deterministic, so a fresh attempt still
 *                     varies). We return seed:null to preserve the call contract.
 *   - safety_tolerance: not a GPT Image 2 param. Dropped. OpenAI moderation is
 *                     surfaced by fal as a FAILED status whose error string the
 *                     RETRYABLE_ERROR_REGEX still catches.
 *   ~ output_format:  GPT Image 2 supports jpeg|png|webp (default png). We pin
 *                     jpeg to match the rest of the pipeline (no transparency
 *                     needed for room renders; smaller payloads).
 *
 * ── Architectural contract (identical to fal.js / replicate.js) ────────────
 *   - generateWithProductPanel(roomURL, prompt, products, panelURL, aspect)
 *       → { url, predictionId, seed }   (seed always null for GPT Image 2)
 *   - generateWithProductRefs(roomURL, prompt, products, aspect)
 *       → string (the URL)
 *   - generateSingleProductInRoom(roomURL, product, aspect)
 *       → string (the URL)
 *
 * Prompt builders are imported from the provider-neutral ./promptBuilders, the
 * same ones flux uses. Panel-reading tuning for GPT Image 2 lives there.
 */

import { describeProductForPrompt } from '../utils/productDescriptor';
import { proxyFetch } from './apiProxy';
import { buildPanelPrompt, buildFlux2MaxPrompt, getQualityPrefix, FIDELITY_DIRECTIVES_SINGLE } from './promptBuilders';

const GPT_QUEUE_URL = 'https://queue.fal.run/openai/gpt-image-2/edit';
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 80; // 3s × 80 = 4 min ceiling — matches fal.js

/**
 * GPT Image 2 render quality — THE cost knob.
 *   'low'    cheapest, softest detail
 *   'medium' balanced (default)
 *   'high'   sharpest, most expensive
 *   'auto'   model picks per prompt
 * Single source of truth so a quality sweep is a one-line change. The
 * low/medium cost measurement (mission task) toggles this (or a probe script).
 */
const GPT_IMAGE_QUALITY = 'low';

// Retry on transient/moderation-class errors. GPT Image 2 routes through
// OpenAI moderation; fal surfaces a rejection as a FAILED status whose error
// string contains one of these tokens. Same coverage as fal.js so end-user
// error rates stay comparable across the model swap.
const RETRYABLE_ERROR_REGEX =
  /E006|invalid input|content moderated|safety|moderation|nsfw_concepts|content_policy/i;
// Matches fal.js: the ai-proxy enforces a 2000ms per-user cooldown
// (014_rate_limits.sql). A retry POST faster than that 429s before reaching
// fal. 2200ms gives a 200ms safety margin over the cooldown wall.
const RETRY_BACKOFF_MS = 2200;

// ─────────────────────────────────────────────────────────────────────────────
// Aspect ratio → GPT Image 2 image_size enum
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GPT Image 2 (OpenAI) only renders three native orientations — square,
 * landscape, portrait — unlike flux which accepts arbitrary {width,height}.
 * We collapse our 9 pickAspectRatio buckets onto fal's GPT Image 2 enum so the
 * output orientation tracks the user's room photo (a landscape room → a
 * landscape render) without asking the model for a size it would silently snap.
 */
const ASPECT_TO_GPT_SIZE = {
  '21:9': 'landscape_16_9',
  '16:9': 'landscape_16_9',
  '3:2':  'landscape_4_3',
  '4:3':  'landscape_4_3',
  '1:1':  'square_hd',
  '3:4':  'portrait_4_3',
  '2:3':  'portrait_4_3',
  '9:16': 'portrait_16_9',
  '9:21': 'portrait_16_9',
};

/**
 * Resolve a `pickAspectRatio` bucket to a GPT Image 2 image_size enum value.
 * Falls back to 'auto' (model picks) for unmapped inputs — this covers the
 * 'match_input_image' sentinel that GPT Image 2 has no direct equivalent for.
 *
 * @param {string} aspectRatio  One of '21:9'..'9:21' or 'match_input_image'
 * @returns {string}            A GPT Image 2 image_size enum value
 */
function resolveImageSize(aspectRatio) {
  return ASPECT_TO_GPT_SIZE[aspectRatio] || 'auto';
}

// ─────────────────────────────────────────────────────────────────────────────
// fal queue submission + polling with retry-on-moderation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Submit a GPT Image 2 edit to fal's queue and poll to completion, with ONE
 * retry on transient/moderation-class errors. Unlike flux there is no seed to
 * vary — the model is non-deterministic, so a plain re-submit is the retry.
 *
 * @param {object} input  Full request body — prompt, image_urls, image_size,
 *                        quality, output_format. (No seed / safety_tolerance.)
 * @returns {Promise<{ url: string, predictionId: string, seed: null }>}
 */
async function submitGptWithRetry(input) {
  const maxAttempts = 2;
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const submitRes = await proxyFetch('fal', GPT_QUEUE_URL, {
        method: 'POST',
        body: input,
      });

      const submission = await submitRes.json();
      if (!submitRes.ok) {
        throw new Error(
          `gpt-image-2/edit submit failed (${submitRes.status}): ` +
          `${submission?.detail || submission?.error || JSON.stringify(submission).substring(0, 200)}`
        );
      }

      // fal queue submission shape (provider-agnostic):
      //   { request_id, status, response_url, status_url, queue_position? }
      const requestId   = submission.request_id;
      const statusUrl   = submission.status_url;
      const responseUrl = submission.response_url;

      if (!statusUrl || !responseUrl) {
        throw new Error(
          'gpt-image-2/edit submit returned malformed envelope: ' +
          `missing status_url/response_url. Got: ${JSON.stringify(submission).substring(0, 200)}`
        );
      }

      const url = await pollUntilDone(statusUrl, responseUrl);

      if (attempt > 1) {
        console.log(`[gpt-image-2/edit] recovered on retry (attempt ${attempt}/${maxAttempts})`);
      }

      return { url, predictionId: requestId, seed: null };

    } catch (err) {
      lastErr = err;
      const msg = err?.message || '';
      const retryable = RETRYABLE_ERROR_REGEX.test(msg);

      if (attempt < maxAttempts && retryable) {
        console.warn(
          `[gpt-image-2/edit] attempt ${attempt} failed (${msg.substring(0, 100)}) — re-submitting`
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
 * Poll fal's status_url until terminal, then fetch the result from
 * response_url. Identical queue semantics to flux (IN_QUEUE / IN_PROGRESS /
 * COMPLETED / FAILED) — the queue layer is model-agnostic, only the model id
 * differs. We use the URLs fal returns verbatim, so no namespace assumptions
 * leak into this module.
 *
 * @param {string} statusUrl   GET endpoint for queue status
 * @param {string} responseUrl GET endpoint for the final result payload
 * @returns {Promise<string>}  The generated image URL
 */
async function pollUntilDone(statusUrl, responseUrl) {
  // Allow a few CONSECUTIVE transient poll failures (network blip, proxy 5xx,
  // malformed JSON, session-refresh glitch) before surfacing an error. A
  // single bad poll must not kill an otherwise-healthy generation. A good poll
  // resets the streak. Mirrors fal.js Build 44 hardening.
  const MAX_CONSECUTIVE_POLL_FAILURES = 3;
  let consecutiveFailures = 0;

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    let status = null;
    try {
      const statusRes = await proxyFetch('fal', statusUrl, { method: 'GET' });
      status = await statusRes.json();
      consecutiveFailures = 0;
    } catch (pollErr) {
      consecutiveFailures += 1;
      console.warn(
        '[gpt-image-2/edit] poll ' + (i + 1) + ' failed (' +
        consecutiveFailures + '/' + MAX_CONSECUTIVE_POLL_FAILURES + ' consecutive): ' +
        String(pollErr?.message || pollErr).substring(0, 120)
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        throw new Error(
          'GPT Image 2 polling failed ' + MAX_CONSECUTIVE_POLL_FAILURES +
          ' times in a row: ' + String(pollErr?.message || pollErr).substring(0, 120)
        );
      }
      continue;
    }

    if (status?.status === 'COMPLETED') {
      // Fetch the result payload, with ONE retry on transient failure — same
      // cold-cache shape as the status responses.
      let result = null;
      let lastResultErr = null;
      for (let r = 0; r < 2; r++) {
        try {
          const resultRes = await proxyFetch('fal', responseUrl, { method: 'GET' });
          result = await resultRes.json();
          break;
        } catch (resErr) {
          lastResultErr = resErr;
          console.warn('[gpt-image-2/edit] result fetch attempt ' + (r + 1) +
            ' failed: ' + String(resErr?.message || resErr).substring(0, 120));
          await new Promise(res => setTimeout(res, 1500));
        }
      }
      if (!result) {
        throw new Error(
          'gpt-image-2/edit result fetch failed after retry: ' +
          String(lastResultErr?.message || lastResultErr).substring(0, 120)
        );
      }

      // Result shape: { images: [{ url, content_type, file_name, width, height }] }
      const firstImage = result?.images?.[0];
      if (!firstImage?.url) {
        throw new Error(
          'gpt-image-2/edit returned no image URL. Result: ' +
          JSON.stringify(result).substring(0, 200)
        );
      }
      return firstImage.url;
    }

    if (status?.status === 'FAILED') {
      const errMsg = status.error || status.detail || 'AI generation failed';
      if (/UnidentifiedImageError|cannot identify image|invalid.*image/i.test(errMsg)) {
        throw new Error('The image format is not supported. Please try a different photo from your library.');
      }
      throw new Error(errMsg);
    }

    // Unknown/missing status (e.g. proxy returned an auth-error object). Treat
    // like a transient failure so the streak counter catches repeated garbage.
    if (!status?.status) {
      consecutiveFailures += 1;
      console.warn(
        '[gpt-image-2/edit] poll ' + (i + 1) + ' returned no .status (' +
        consecutiveFailures + '/' + MAX_CONSECUTIVE_POLL_FAILURES + ' consecutive): ' +
        JSON.stringify(status || {}).substring(0, 120)
      );
      if (consecutiveFailures >= MAX_CONSECUTIVE_POLL_FAILURES) {
        throw new Error(
          'GPT Image 2 polling returned malformed status ' + MAX_CONSECUTIVE_POLL_FAILURES +
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
// Public API — three exports matching fal.js / replicate.js exactly
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a product-aware room redesign from a 2-image input
 * [roomPhotoUrl, panelUrl] — the room photo plus the 2×2 product panel.
 *
 * @param {string}   roomPhotoUrl  Public URL of user's (optimized) room photo
 * @param {string}   userPrompt    Enriched design prompt (from buildFinalPrompt)
 * @param {object[]} products      Matched products (used for prompt building)
 * @param {string}   panelUrl      Public URL of the 2×2 product panel
 * @param {string}   [aspectRatio] Bucket from pickAspectRatio() — defaults to auto
 * @returns {Promise<{ url: string, predictionId: string, seed: null }>}
 */
export async function generateWithProductPanel(roomPhotoUrl, userPrompt, products, panelUrl, aspectRatio) {
  if (!roomPhotoUrl) throw new Error('generateWithProductPanel requires a public room photo URL.');
  if (!panelUrl)     throw new Error('generateWithProductPanel requires a product panel URL.');

  const imageUrls        = [roomPhotoUrl, panelUrl];
  const generationPrompt = buildPanelPrompt(userPrompt || 'Modern minimalist interior design.', products || []);
  const imageSize        = resolveImageSize(aspectRatio);

  if (__DEV__) {
    console.log('[gpt-image-2/edit panel] Prompt:', generationPrompt.substring(0, 200) + '...');
    console.log('[gpt-image-2/edit panel] image_urls: 2 (room + 2×2 product panel)');
    console.log('[gpt-image-2/edit panel] image_size:', imageSize, '(from aspect:', aspectRatio || 'default', ') quality:', GPT_IMAGE_QUALITY);
    console.log('[gpt-image-2/edit panel] Panel URL:', panelUrl.substring(0, 80));
  }

  return await submitGptWithRetry({
    prompt:        generationPrompt,
    image_urls:    imageUrls,
    image_size:    imageSize,
    quality:       GPT_IMAGE_QUALITY,
    output_format: 'jpeg',
  });
}

/**
 * Fallback path: room photo plus up to 4 individual product images. Used by
 * HomeScreen when the 2×2 panel build fails.
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

  const imageUrls        = [roomPhotoUrl, ...productImages];
  const generationPrompt = buildFlux2MaxPrompt(userPrompt || 'Modern minimalist interior design.', products || []);
  const imageSize        = resolveImageSize(aspectRatio);

  if (__DEV__) {
    console.log('[gpt-image-2/edit refs] Prompt:', generationPrompt.substring(0, 200) + '...');
    console.log('[gpt-image-2/edit refs] image_urls:', imageUrls.length, '(1 room +', productImages.length, 'products)');
    console.log('[gpt-image-2/edit refs] image_size:', imageSize, '(from aspect:', aspectRatio || 'default', ') quality:', GPT_IMAGE_QUALITY);
  }

  const result = await submitGptWithRetry({
    prompt:        generationPrompt,
    image_urls:    imageUrls,
    image_size:    imageSize,
    quality:       GPT_IMAGE_QUALITY,
    output_format: 'jpeg',
  });

  return result.url;
}

/**
 * Place a SINGLE product into the user's room photo ("Visualize in your
 * space"). 2-image input, no product matching, no style intent.
 *
 * @param {string} roomPhotoUrl   Public URL of user's room photo
 * @param {object} product        Product with imageUrl, name, category, materials, tags
 * @param {string} [aspectRatio]  Bucket from pickAspectRatio()
 * @returns {Promise<string>}     URL of the generated image
 */
export async function generateSingleProductInRoom(roomPhotoUrl, product, aspectRatio) {
  if (!roomPhotoUrl) throw new Error('generateSingleProductInRoom requires a public room photo URL.');
  if (!product?.imageUrl) throw new Error('generateSingleProductInRoom requires a product with an imageUrl.');

  const descriptor = describeProductForPrompt(product) || (product.category || 'furniture').replace(/-/g, ' ');

  // Upscale Amazon product image to 1500px so the model has high-resolution
  // source detail (silhouette edges, fabric weave, wood grain) to copy
  // faithfully. fal bills on output, not input MP, so this is free quality.
  let productImageUrl = product.imageUrl;
  try {
    const parsed = new URL(productImageUrl);
    if (parsed.hostname.includes('amazon') || parsed.hostname.includes('media-amazon')) {
      productImageUrl = productImageUrl
        .replace(/_AC_SL\d+_/g,  '_AC_SL1500_')
        .replace(/_AC_UL\d+_/g,  '_AC_SL1500_')
        .replace(/_SX\d+_/g,     '_AC_SL1500_')
        .replace(/_SR\d+,\d+_/g, '_AC_SL1500_');
      console.log('[gpt-image-2/edit] upscaled Amazon image to 1500px:', productImageUrl.substring(productImageUrl.lastIndexOf('/') + 1));
    }
  } catch {
    // URL parsing failed — use original URL unchanged
  }

  const prompt = [
    getQualityPrefix(),
    'Scene edit: preserve image 1\'s walls, floor, ceiling, windows, lighting, and camera angle unchanged.',
    `Place the product from image 2 into the room: a ${descriptor}. Match its color, material, silhouette, and proportions to the reference exactly.`,
    FIDELITY_DIRECTIVES_SINGLE,
  ].join(' ');

  const imageSize = resolveImageSize(aspectRatio);

  if (__DEV__) {
    console.log('[gpt-image-2/edit] single-product prompt:', prompt.substring(0, 200) + '...');
    console.log('[gpt-image-2/edit] image_urls: 2 (1 room + 1 product)');
    console.log('[gpt-image-2/edit] product image:', productImageUrl.substring(0, 80));
    console.log('[gpt-image-2/edit] image_size:', imageSize, 'quality:', GPT_IMAGE_QUALITY);
  }

  const result = await submitGptWithRetry({
    prompt,
    image_urls:    [roomPhotoUrl, productImageUrl],
    image_size:    imageSize,
    quality:       GPT_IMAGE_QUALITY,
    output_format: 'jpeg',
  });

  return result.url;
}

// ─────────────────────────────────────────────────────────────────────────────
// Re-exports: provider-neutral helpers live in ./promptBuilders. Re-exporting
// here keeps the one-stop-shop import pattern callers expect.
// ─────────────────────────────────────────────────────────────────────────────
export { pickAspectRatio, buildFinalPrompt } from './promptBuilders';
