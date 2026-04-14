import { describeProductForPrompt } from '../utils/productDescriptor';
import { proxyFetch } from './apiProxy';

const API_URL = 'https://api.replicate.com/v1';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 80; // 3s × 80 = 4 min timeout

// Errors that we should retry ONCE on (transient / seed-dependent).
// E006 is BFL's generic "invalid input" code and often clears with a new seed.
// Content moderation may also clear with a slightly different seed/prompt hash.
const RETRYABLE_ERROR_REGEX = /E006|invalid input|content moderated/i;
const RETRY_BACKOFF_MS = 1500;

/**
 * Submit a flux-2-max prediction and poll to completion, with ONE retry on
 * transient E006-class errors. Each attempt uses a fresh random seed so the
 * content hash differs — same prompt + same seed can deterministically hit
 * the same moderation bucket.
 *
 * @param {object}   baseInput    Everything except `seed` — prompt, input_images, aspect_ratio, etc.
 * @returns {Promise<{url: string, predictionId: string, seed: number}>}
 */
async function submitFluxWithRetry(baseInput) {
  const maxAttempts = 2;
  let lastErr;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const seed = Math.floor(Math.random() * 999999999);
    const input = { ...baseInput, seed };

    try {
      const res = await proxyFetch('replicate', `${API_URL}/models/black-forest-labs/flux-2-max/predictions`, {
        method: 'POST',
        body: { input },
      });

      const prediction = await res.json();
      if (!res.ok) {
        throw new Error(
          `flux-2-max submit failed (${res.status}): ${prediction?.detail || prediction?.error || 'Unknown error'}`
        );
      }

      const predictionId = prediction.id;
      let url;
      if (prediction.status === 'succeeded') {
        const output = prediction.output;
        url = typeof output === 'string' ? output : (Array.isArray(output) ? output[0] : output);
      } else {
        url = await pollUntilDone(predictionId);
      }

      if (attempt > 1) {
        console.log(`[flux-2-max] recovered on retry (attempt ${attempt}/${maxAttempts})`);
      }
      return { url, predictionId, seed };

    } catch (err) {
      lastErr = err;
      const msg = err?.message || '';
      const retryable = RETRYABLE_ERROR_REGEX.test(msg);

      if (attempt < maxAttempts && retryable) {
        console.warn(
          `[flux-2-max] attempt ${attempt} failed (${msg.substring(0, 100)}) — retrying with new seed`
        );
        await new Promise(r => setTimeout(r, RETRY_BACKOFF_MS));
        continue;
      }

      // Not retryable, or retries exhausted — throw so caller can drop to fallback
      throw err;
    }
  }

  throw lastErr;
}

// ── Prompt quality tokens ────────────────────────────────────────────────────
// flux-2-max weights EARLY tokens highest. Leading with editorial/sharpness
// cues biases the whole generation toward magazine-quality output. We keep
// this list short and specific — "8k" and other common LLM noise tokens
// actually degrade flux output, so they are intentionally excluded.
const QUALITY_PREFIX =
  'Editorial architectural photography, ultra-sharp focus, crisp detail, natural light, magazine-quality interior, Architectural Digest style.';

// Cap total prompt words. Raised to 200: flux-2-max retains useful signal up to
// ~200 words; beyond that the tokenizer starts dropping late tokens. The smart
// budget in buildFinalPrompt trims user text first (least specific) to keep
// high-priority product hints and color palette intact.
const MAX_PROMPT_WORDS = 200;

/**
 * Build the enriched design-intent prompt that is passed INTO the final
 * scene-edit wrapper (buildPanelPrompt / buildFlux2MaxPrompt).
 *
 * Content order — early tokens get more attention from flux-2-max:
 *   [Furniture list] → [Color palette] → [User style intent]
 *
 * Quality and architecture-preservation tokens are NOT added here — the
 * outer wrapper owns those so they are never duplicated.
 *
 * @param {string} userPrompt     - The user's raw prompt
 * @param {string} [productHints] - Detailed furniture descriptions from catalog matching
 * @param {string} [colorPalette] - Dominant color palette extracted from matched products
 * @returns {string} The design-intent fragment
 */
export function buildFinalPrompt(userPrompt, productHints, colorPalette) {
  const parts = [];

  if (productHints) {
    parts.push(`Room contains exactly: ${productHints}. No other furniture.`);
  }

  if (colorPalette) {
    parts.push(`Color palette: ${colorPalette}.`);
  }

  // Product hints and color palette are high-priority (early tokens get more
  // attention from flux-2-max). User prompt is supplementary style intent.
  const highPriority = parts.join(' ');
  const highPriorityWords = highPriority.split(/\s+/).filter(Boolean);

  const userText = userPrompt || 'Modern minimalist interior design.';
  const userWords = userText.split(/\s+/).filter(Boolean);

  // Budget: total cap minus high-priority content
  const userBudget = MAX_PROMPT_WORDS - highPriorityWords.length;

  if (userBudget <= 0) {
    // Extremely rare: product hints alone exceed budget. Trim them.
    return highPriorityWords.slice(0, MAX_PROMPT_WORDS).join(' ');
  }

  // Trim user prompt if it exceeds remaining budget
  const trimmedUser = userWords.length > userBudget
    ? userWords.slice(0, userBudget).join(' ')
    : userText;

  return [highPriority, trimmedUser].filter(Boolean).join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// flux-2-max: Multi-image product-reference room generation (fallback path)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the flux-2-max prompt for product-reference room editing.
 *
 * Tells the model to treat image 1 as the room to preserve and images 2+ as
 * product references to swap in. Product categories are mapped to image indices.
 *
 * Used by the local fallback path (generateWithProductRefs) when the product
 * panel edge function is unavailable.
 *
 * @param {string}   userPrompt - The user's raw design prompt (or enriched prompt from buildFinalPrompt)
 * @param {object[]} products   - Array of products with a category field
 * @returns {string} Structured prompt for flux-2-max
 */
export function buildFlux2MaxPrompt(userPrompt, products) {
  const placements = [];
  (products || []).slice(0, 4).forEach((p, i) => {
    const desc = describeProductForPrompt(p) || (p.category || 'furniture').replace(/-/g, ' ');
    placements.push(`${desc} → image ${i + 2}`);
  });

  const placementStr = placements.length > 0
    ? `Place these EXACT product references into the room, matching color, material, silhouette, and proportions precisely: [${placements.join('; ')}]. Do not substitute with similar-looking alternatives.`
    : "Replace furniture with pieces that match the room's style.";

  const styleIntent = userPrompt
    ? `While maintaining this overall style intent: ${userPrompt}.`
    : '';

  return [
    QUALITY_PREFIX,
    'This is a precise scene edit, not a new generation.',
    'Preserve image 1 exactly: same walls, floor, ceiling, windows, lighting, camera angle, perspective, and spatial layout. Do not alter any architecture.',
    placementStr,
    styleIntent,
  ].filter(Boolean).join(' ');
}

/**
 * Generate a product-aware room redesign using a single flux-2-max call with
 * individual product reference images. This is the FALLBACK path used only
 * when the 2×2 panel edge function is unavailable — the panel path is cheaper
 * (2 inputs instead of 5) and should be preferred.
 *
 * @param {string}   roomPhotoUrl - Public URL of the user's room photo
 * @param {string}   userPrompt   - Enriched design prompt (from buildFinalPrompt)
 * @param {object[]} products     - Matched products (each with an imageUrl field)
 * @param {string}   [aspectRatio] - Explicit aspect ratio (e.g. '4:3', '3:4', '16:9'). Falls back to 'match_input_image'.
 * @returns {Promise<string>}     - URL of the generated room image
 */
export async function generateWithProductRefs(roomPhotoUrl, userPrompt, products, aspectRatio) {
  // Auth handled by apiProxy (server-side in production, EXPO_PUBLIC_ in dev)
  if (!roomPhotoUrl) throw new Error('generateWithProductRefs requires a public room photo URL.');

  // Use full-resolution product images so flux sees maximum detail.
  // Per-input MP is still bounded by Replicate's internal preprocessing —
  // flux-2-max downsamples inputs to match output resolution (0.5 MP) before
  // attention, so sending 1500px sources costs the same as sending 300px
  // sources, but we get sharper detail in the attention map.
  const productImages = (products || [])
    .filter(p => p.imageUrl)
    .slice(0, 4)
    .map(p => p.imageUrl);

  const inputImages = [roomPhotoUrl, ...productImages];
  const generationPrompt = buildFlux2MaxPrompt(userPrompt || 'Modern minimalist interior design.', products || []);

  console.log('[flux-2-max] Prompt:', generationPrompt.substring(0, 200) + '...');
  console.log('[flux-2-max] input_images:', inputImages.length, '(1 room +', productImages.length, 'products)');
  console.log('[flux-2-max] aspect_ratio:', aspectRatio || 'match_input_image');

  const result = await submitFluxWithRetry({
    prompt:           generationPrompt,
    input_images:     inputImages,
    aspect_ratio:     aspectRatio || 'match_input_image',
    resolution:       '0.5 MP',   // fixed — cost constraint
    output_format:    'webp',
    output_quality:   100,        // max WebP quality — no billing impact
    safety_tolerance: 5,
  });

  return result.url;
}

// ─────────────────────────────────────────────────────────────────────────────
// flux-2-max: Single-product placement (2 images: room + 1 product)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate an image placing a SINGLE product into the user's room photo.
 * Simpler than the multi-product paths — no panel compositing, no product
 * matching, no style intent. Just: "put this product in that room."
 *
 * Uses the same flux-2-max model and retry wrapper as the full-room flow.
 * Cost: ~$0.10/generation (2 input images at 0.5 MP).
 *
 * @param {string}   roomPhotoUrl - Public URL of the user's room photo
 * @param {object}   product      - Product object with imageUrl, name, category, materials, tags
 * @param {string}   [aspectRatio] - Explicit aspect ratio from pickAspectRatio(). Falls back to 'match_input_image'.
 * @returns {Promise<string>}     - URL of the generated image
 */
export async function generateSingleProductInRoom(roomPhotoUrl, product, aspectRatio) {
  // Auth handled by apiProxy (server-side in production, EXPO_PUBLIC_ in dev)
  if (!roomPhotoUrl) throw new Error('generateSingleProductInRoom requires a public room photo URL.');
  if (!product?.imageUrl) throw new Error('generateSingleProductInRoom requires a product with an imageUrl.');

  const descriptor = describeProductForPrompt(product) || (product.category || 'furniture').replace(/-/g, ' ');

  // Cap product image to 512px max dimension to reduce GPU preprocessing time.
  // flux-2-max downsamples all inputs to match its 0.5 MP output anyway, so
  // sending 512px vs 2000px produces identical quality — just costs less GPU-seconds.
  //
  // Amazon image URL formats:
  //   ._AC_SL1500_.jpg   → auto-crop, scale-length 1500px (EXPENSIVE)
  //   ._AC_UL640_.jpg    → auto-crop, upload-limit 640px
  //   ._AC_SX522_.jpg    → auto-crop, scale-x 522px
  //   ._SL1500_.jpg      → scale-length 1500px (no AC prefix)
  //
  // We replace the ENTIRE modifier block with ._AC_SL512_. to guarantee 512px.
  let productImageUrl = product.imageUrl;
  try {
    const url = new URL(productImageUrl);
    if (url.hostname.includes('amazon') || url.hostname.includes('media-amazon')) {
      // Match: ._<any combo of letters, underscores, digits>_. before the extension
      // Examples: ._AC_SL1500_.  ._AC_UL640_.  ._SL1500_.  ._AC_SX522_.
      productImageUrl = productImageUrl.replace(/\._[A-Z0-9_]+_\./, '._AC_SL512_.');
      console.log('[flux-2-max] resized Amazon image to 512px:', productImageUrl.substring(productImageUrl.lastIndexOf('/') + 1));
    }
  } catch {
    // URL parsing failed — use original URL unchanged
  }

  const prompt = [
    QUALITY_PREFIX,
    'This is a precise scene edit, not a new generation.',
    'Preserve image 1 exactly: same walls, floor, ceiling, windows, lighting, camera angle, perspective, and spatial layout. Do not alter any architecture.',
    `Place this EXACT product reference (image 2) into the room: ${descriptor}. Match color, material, silhouette, and proportions precisely. Position it naturally where this type of furniture belongs in the room. Do not substitute with similar-looking alternatives.`,
  ].join(' ');

  console.log('[flux-2-max] single-product prompt:', prompt.substring(0, 200) + '...');
  console.log('[flux-2-max] input_images: 2 (1 room + 1 product)');
  console.log('[flux-2-max] product image:', productImageUrl.substring(0, 80));
  console.log('[flux-2-max] aspect_ratio:', aspectRatio || 'match_input_image');

  const result = await submitFluxWithRetry({
    prompt,
    input_images:     [roomPhotoUrl, productImageUrl],
    aspect_ratio:     aspectRatio || 'match_input_image',
    resolution:       '0.5 MP',
    output_format:    'webp',
    output_quality:   100,
    safety_tolerance: 5,
  });

  return result.url;
}

// ─────────────────────────────────────────────────────────────────────────────
// flux-2-max: Panel-based generation (2 images: room + 2×2 product grid)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the flux-2-max prompt when product references are in a 2×2 panel.
 *
 * The panel (image 2) contains a 2×2 grid of product reference images.
 * Each cell is described with a RICH descriptor (color + material + shape +
 * type + category) extracted from the catalog metadata. This is critical:
 *
 * Previously the prompt said only "top-left: sofa" and flux-2-max's text
 * prior ("sofa") out-weighted the 256×256 panel thumbnail when the user's
 * own text also mentioned "sofa". Result: flux generated a generic sofa,
 * not the specific catalog product. Now the prompt says
 *   "top-left: cognac leather oversized loveseat sofa"
 * which locks flux to the correct silhouette.
 *
 * Token order matters: flux weights early tokens heavily. We lead with
 * quality → architecture preserve → detailed refs → user text wrapped as
 * supplementary style intent (not primary content definition).
 *
 * @param {string}   userPrompt - User's raw design prompt
 * @param {object[]} products   - Products with category/tags/materials/name
 * @returns {string} Structured prompt for flux-2-max panel input
 */
export function buildPanelPrompt(userPrompt, products) {
  const posLabels = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const entries = (products || []).slice(0, 4).map((p, i) => {
    const desc = describeProductForPrompt(p) || (p.category || 'furniture').replace(/-/g, ' ');
    return `${posLabels[i]}: ${desc}`;
  });

  const refLine = entries.length > 0
    ? `Image 2 is a 2×2 product reference grid showing the EXACT pieces to place in the room. ${entries.join('. ')}. Match each piece's color, material, silhouette, and proportions precisely — do not substitute with similar-looking alternatives.`
    : 'Replace furniture with pieces that complement the room style.';

  // User text is included as SUPPLEMENTARY style intent, NOT as the primary
  // content definition. Wrapping it in "While maintaining this intent:"
  // tells flux to treat it as a hint rather than the canonical spec.
  const styleIntent = userPrompt
    ? `While maintaining this overall style intent: ${userPrompt}.`
    : '';

  return [
    QUALITY_PREFIX,
    'This is a precise scene edit, not a new generation.',
    'Preserve image 1 exactly: same walls, floor, ceiling, windows, lighting, camera angle, perspective, and spatial layout. Do not alter any architecture.',
    refLine,
    styleIntent,
  ].filter(Boolean).join(' ');
}

/**
 * Generate a product-aware room redesign using a 2-image input.
 *
 * Sends [roomPhotoUrl, panelUrl] — 2 images instead of 5 — to reduce GPU
 * attention compute by ~40-50%. The panelUrl is a 512×512 composite of up to
 * 4 product reference images in a 2×2 grid (created by the composite-products
 * edge function).
 *
 * Target cost: ~$0.13/gen (hard cap — do not bump resolution above 0.5 MP).
 *
 * @param {string}   roomPhotoUrl  - Public URL of the user's room photo
 * @param {string}   userPrompt    - Enriched design prompt (from buildFinalPrompt)
 * @param {object[]} products      - Matched products (for prompt building)
 * @param {string}   panelUrl      - Public URL of the 2×2 product panel
 * @param {string}   [aspectRatio] - Explicit aspect ratio (e.g. '4:3', '3:4', '16:9'). Falls back to 'match_input_image'.
 * @returns {Promise<{url: string, predictionId: string, seed: number}>}
 */
export async function generateWithProductPanel(roomPhotoUrl, userPrompt, products, panelUrl, aspectRatio) {
  // Auth handled by apiProxy (server-side in production, EXPO_PUBLIC_ in dev)
  if (!roomPhotoUrl) throw new Error('generateWithProductPanel requires a public room photo URL.');
  if (!panelUrl)     throw new Error('generateWithProductPanel requires a product panel URL.');

  const inputImages      = [roomPhotoUrl, panelUrl];
  const generationPrompt = buildPanelPrompt(userPrompt || 'Modern minimalist interior design.', products || []);

  console.log('[flux-2-max panel] Prompt:', generationPrompt.substring(0, 200) + '...');
  console.log('[flux-2-max panel] input_images: 2 (room + 2×2 product panel)');
  console.log('[flux-2-max panel] aspect_ratio:', aspectRatio || 'match_input_image');
  console.log('[flux-2-max panel] Panel URL:', panelUrl.substring(0, 80));

  return await submitFluxWithRetry({
    prompt:           generationPrompt,
    input_images:     inputImages,
    aspect_ratio:     aspectRatio || 'match_input_image',
    resolution:       '0.5 MP',   // fixed — cost constraint
    output_format:    'webp',
    output_quality:   100,        // max WebP quality — no billing impact
    safety_tolerance: 5,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Aspect ratio helper
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pick the flux-2-max aspect ratio bucket closest to the source image.
 * flux-2-max only accepts a fixed set of ratios — we snap to the nearest.
 *
 * @param {number} width  - Source image width in px
 * @param {number} height - Source image height in px
 * @returns {string}      - One of flux-2-max's supported aspect ratios
 */
export function pickAspectRatio(width, height) {
  if (!width || !height) return 'match_input_image';
  const r = width / height;

  // flux-2-max supported ratios (value → numeric aspect)
  const buckets = [
    { name: '21:9', aspect: 21 / 9 },
    { name: '16:9', aspect: 16 / 9 },
    { name: '3:2',  aspect: 3 / 2  },
    { name: '4:3',  aspect: 4 / 3  },
    { name: '1:1',  aspect: 1      },
    { name: '3:4',  aspect: 3 / 4  },
    { name: '2:3',  aspect: 2 / 3  },
    { name: '9:16', aspect: 9 / 16 },
    { name: '9:21', aspect: 9 / 21 },
  ];

  let best = buckets[0];
  let bestDelta = Math.abs(Math.log(r / best.aspect));
  for (const b of buckets) {
    const d = Math.abs(Math.log(r / b.aspect));
    if (d < bestDelta) {
      best = b;
      bestDelta = d;
    }
  }
  return best.name;
}

// ─────────────────────────────────────────────────────────────────────────────
// Polling
// ─────────────────────────────────────────────────────────────────────────────
async function pollUntilDone(id) {
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await proxyFetch('replicate', `${API_URL}/predictions/${id}`, {
      method: 'GET',
    });
    const prediction = await res.json();

    if (prediction.status === 'succeeded') {
      const output = prediction.output;
      return typeof output === 'string' ? output : (Array.isArray(output) ? output[0] : output);
    }

    if (prediction.status === 'failed' || prediction.status === 'canceled') {
      const errMsg = prediction.error || '';
      if (errMsg.includes('UnidentifiedImageError') || errMsg.includes('cannot identify image')) {
        throw new Error('The image format is not supported. Please try a different photo from your library.');
      }
      throw new Error(errMsg || 'AI generation failed. Please try again.');
    }
  }
  throw new Error('AI generation timed out after 4 minutes. Please try again.');
}
