import * as FileSystem from 'expo-file-system/legacy';

const API_URL = 'https://api.replicate.com/v1';
const TOKEN = process.env.EXPO_PUBLIC_REPLICATE_API_TOKEN;

// ── Model versions ──────────────────────────────────────────────────────────
// Pass 1: xlabs flux-dev-controlnet — PROVEN model that generates furnished rooms.
// Uses depth ControlNet to preserve room architecture while adding furniture.
// Original working parameters: depth / 0.75 strength / 4.0 guidance / 28 steps.
const XLABS_VERSION = '9a8db105db745f8b11ad3afe5c8bd892428b2a43ade0b67edc4e0ccd52ff2fda';

// Pass 2: flux-2-pro — BFL's newest model with reference image support.
// Takes the Pass 1 output + up to 4 product photos to refine furniture appearance.
// Uses model name (official model) instead of version hash.
const FLUX2_PRO_MODEL = 'black-forest-labs/flux-2-pro';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 80; // 3s × 80 = 4 min timeout

// ── Architecture preservation ────────────────────────────────────────────────
const ARCHITECTURE_GUARD =
  'Keep all walls, doors, windows, ceiling, and floor plan unchanged. Only replace furniture, decor, and soft furnishings.';

// Quality suffix — short, high-signal tokens
const QUALITY_SUFFIX =
  '8k interior design photography, natural lighting, photorealistic, editorial, Architectural Digest.';

// Cap total prompt words
const MAX_PROMPT_WORDS = 150;

/**
 * Build the final prompt sent to the AI model (Pass 1).
 *
 * Prompt order matters — early tokens get most attention:
 *   [Furniture list] → [Color palette] → [Style intent] → [Architecture guard] → [Quality]
 *
 * @param {string} userPrompt     - The user's raw prompt
 * @param {string} [productHints] - Detailed furniture descriptions from catalog matching
 * @param {string} [colorPalette] - Dominant color palette extracted from matched products
 * @returns {string} The full enriched prompt
 */
export function buildFinalPrompt(userPrompt, productHints, colorPalette) {
  const parts = [];

  // Product hints go FIRST — model weights early tokens highest.
  if (productHints) {
    parts.push(`Room contains exactly: ${productHints}. No other furniture.`);
  }

  // Color palette — constrains color choices to match our products
  if (colorPalette) {
    parts.push(`Color palette: ${colorPalette}.`);
  }

  // User's design intent
  parts.push(userPrompt || 'Modern minimalist interior design.');

  // Architecture guard (reinforces depth ControlNet)
  parts.push(ARCHITECTURE_GUARD);

  // Quality tokens last
  parts.push(QUALITY_SUFFIX);

  const full = parts.join(' ');
  const words = full.split(/\s+/);
  if (words.length > MAX_PROMPT_WORDS) {
    return words.slice(0, MAX_PROMPT_WORDS).join(' ');
  }
  return full;
}

/**
 * Convert image to a data URI that Replicate can read.
 */
async function imageToDataUri(imageUri, base64Data) {
  let b64;

  if (base64Data && base64Data.length > 100) {
    b64 = base64Data;
  } else {
    b64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });
  }

  if (!b64 || b64.length < 100) {
    throw new Error('No image data available');
  }

  const prefix = b64.substring(0, 8);
  const isJpeg = prefix.startsWith('/9j/');
  const isPng = prefix.startsWith('iVBOR');

  if (!isJpeg && !isPng) {
    console.warn('[Replicate] Non-JPEG/PNG detected, attempting Files API upload...');
    return uploadViaFilesApi(imageUri, b64);
  }

  const mime = isPng ? 'image/png' : 'image/jpeg';
  return `data:${mime};base64,${b64}`;
}

/**
 * Upload an image to Replicate's CDN and return a public URL.
 * Used by both replicate.js (for non-JPEG/PNG fallback) and falai.js
 * (to get a URL small enough to pass to fal.ai without payload size issues).
 */
export async function uploadImageGetUrl(imageUri, base64Data) {
  let b64 = base64Data;
  if (!b64 || b64.length < 100) {
    b64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });
  }
  if (!b64 || b64.length < 100) throw new Error('Could not read image for upload');
  return uploadViaFilesApi(imageUri, b64);
}

/**
 * Fallback: upload via Replicate Files API for non-JPEG/PNG images.
 */
async function uploadViaFilesApi(imageUri, b64) {
  const tempPath = FileSystem.cacheDirectory + 'replicate_upload_' + Date.now() + '.jpg';
  await FileSystem.writeAsStringAsync(tempPath, b64, { encoding: 'base64' });

  const info = await FileSystem.getInfoAsync(tempPath);
  if (!info.exists || info.size < 100) {
    throw new Error('Failed to write temp image file');
  }

  const form = new FormData();
  form.append('content', {
    uri: tempPath,
    type: 'image/jpeg',
    name: 'room.jpg',
  });

  const res = await fetch(`${API_URL}/files`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}` },
    body: form,
  });

  FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});

  const json = await res.json();
  if (!res.ok) {
    throw new Error(`Image upload failed (${res.status}): ${json?.detail || 'Unknown error'}`);
  }
  if (!json?.urls?.get) {
    throw new Error('Upload succeeded but no file URL returned');
  }

  return json.urls.get;
}

// ─────────────────────────────────────────────────────────────────────────────
// PASS 1: xlabs flux-dev-controlnet — Room redesign with depth ControlNet
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Generates a redesigned interior image using xlabs flux-dev-controlnet.
 *
 * This is the PROVEN model that correctly generates furnished rooms.
 * It uses depth ControlNet to preserve room architecture (walls, doors, windows)
 * while completely transforming furniture and decor based on the prompt.
 *
 * IMPORTANT: These parameters are battle-tested. Do NOT change them:
 * - control_type: 'depth'    — preserves room structure via depth map
 * - control_strength: 0.75   — balanced: enough freedom for furniture, enough lock for walls
 * - guidance_scale: 4.0      — sweet spot for this model (max is 5.0)
 * - steps: 28                — quality/speed balance, proven output quality
 *
 * @param {string} imageUri  - Local file URI from expo-image-picker / expo-camera
 * @param {string} prompt    - The FULL enriched prompt (use buildFinalPrompt())
 * @param {string} [base64]  - Optional JPEG base64 from the image picker
 * @returns {Promise<string>} URL of the AI-generated room image
 */
async function runPass1(imageUri, prompt, base64) {
  const controlImage = await imageToDataUri(imageUri, base64);
  const isDataUri = controlImage.startsWith('data:');
  console.log('[Pass1] control_image:', isDataUri ? `data URI (${controlImage.length} chars)` : controlImage);
  console.log('[Pass1] Prompt:', prompt.substring(0, 200) + '...');

  const res = await fetch(`${API_URL}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: XLABS_VERSION,
      input: {
        control_image: controlImage,
        prompt: prompt,
        control_type: 'depth',
        control_strength: 0.75,
        guidance_scale: 4.0,
        num_inference_steps: 28,
        seed: Math.floor(Math.random() * 999999999),
        output_format: 'webp',
        output_quality: 95,
      },
    }),
  });

  const prediction = await res.json();
  if (!res.ok) throw new Error(prediction.detail || 'Failed to start AI generation.');

  if (prediction.status === 'succeeded') {
    return typeof prediction.output === 'string' ? prediction.output : prediction.output[0];
  }

  return pollUntilDone(prediction.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// PASS 2: flux-2-pro — Refine furniture to match product reference images
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Refines a generated room image by injecting product reference photos.
 *
 * flux-2-pro accepts up to 8 input_images. We pass:
 *   image 1: the Pass 1 room output (to preserve overall composition)
 *   images 2-5: up to 4 product reference photos (furniture to match)
 *
 * The prompt tells the model to keep the room layout from image 1 and
 * make the furniture look like the reference product photos.
 *
 * @param {string} roomImageUrl    - URL from Pass 1 output
 * @param {object[]} products      - Matched products with imageUrl fields
 * @param {string} userPrompt      - Original user prompt for style context
 * @returns {Promise<string>}      - URL of the refined room image
 */
async function runPass2(roomImageUrl, products, userPrompt) {
  // Collect product reference images (up to 4)
  const productImages = products
    .filter(p => p.imageUrl)
    .slice(0, 4)
    .map(p => p.imageUrl);

  if (productImages.length === 0) {
    console.log('[Pass2] No product images available, skipping refinement');
    return roomImageUrl;
  }

  // Build input_images array: [room, product1, product2, ...]
  const inputImages = [roomImageUrl, ...productImages];

  // Build the refinement prompt — tell the model what each reference image is
  const refParts = [];
  refParts.push('Keep the room layout, architecture, walls, windows, and lighting exactly as shown in image 1.');
  refParts.push(`Style: ${userPrompt || 'modern minimalist interior design'}.`);

  // Map each product image to a furniture instruction
  const labels = [];
  products.slice(0, 4).forEach((p, i) => {
    if (!p.imageUrl) return;
    const category = p.category ? p.category.replace(/-/g, ' ') : 'furniture piece';
    labels.push(`The ${category} should look exactly like the one shown in image ${i + 2}`);
  });
  if (labels.length > 0) {
    refParts.push(labels.join('. ') + '.');
  }
  refParts.push(QUALITY_SUFFIX);

  const refinementPrompt = refParts.join(' ');
  console.log('[Pass2] Refinement prompt:', refinementPrompt.substring(0, 200) + '...');
  console.log('[Pass2] Reference images:', inputImages.length, '(1 room +', productImages.length, 'products)');

  const res = await fetch(`${API_URL}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: FLUX2_PRO_MODEL,
      input: {
        prompt: refinementPrompt,
        input_images: inputImages,
        aspect_ratio: 'match_input_image',
        resolution: '1 MP',
        output_format: 'webp',
        output_quality: 95,
        safety_tolerance: 5,
        seed: Math.floor(Math.random() * 999999999),
      },
    }),
  });

  const prediction = await res.json();
  if (!res.ok) {
    // If Pass 2 fails, fall back to Pass 1 result — never break the flow
    console.warn('[Pass2] Refinement failed, using Pass 1 result:', prediction.detail || 'Unknown error');
    return roomImageUrl;
  }

  if (prediction.status === 'succeeded') {
    return typeof prediction.output === 'string' ? prediction.output : prediction.output[0];
  }

  try {
    return await pollUntilDone(prediction.id);
  } catch (err) {
    // If polling fails, fall back to Pass 1 result
    console.warn('[Pass2] Polling failed, using Pass 1 result:', err.message);
    return roomImageUrl;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API — Two-pass generation pipeline
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Generates a redesigned interior image using a two-pass pipeline:
 *
 *   Pass 1 (flux-depth-pro): Room photo → depth-controlled generation
 *     - Preserves room architecture (walls, doors, windows)
 *     - Applies style + furniture descriptions from prompt
 *     - Output: high-quality room image (~25s)
 *
 *   Pass 2 (flux-2-pro): Pass 1 output + product reference photos → refined image
 *     - Takes the generated room + up to 4 product photos
 *     - Refines furniture appearance to match actual product images
 *     - Output: room where furniture visually matches product cards (~6s)
 *
 * If Pass 2 fails for any reason, Pass 1 result is returned (graceful fallback).
 *
 * @param {string} imageUri       - Local file URI from expo-image-picker / expo-camera
 * @param {string} prompt         - The FULL enriched prompt (use buildFinalPrompt())
 * @param {string} [base64]       - Optional JPEG base64 from the image picker
 * @param {object[]} [products]   - Matched products with imageUrl for Pass 2 refinement
 * @param {string} [userPrompt]   - Original user prompt (for Pass 2 style context)
 * @returns {Promise<string>}     - URL of the final AI-generated room image
 */
export async function generateInteriorDesign(imageUri, prompt, base64, products, userPrompt) {
  if (!TOKEN) throw new Error('Replicate API token is missing. Add EXPO_PUBLIC_REPLICATE_API_TOKEN to your .env file.');

  // ── Pass 1: Depth-controlled room redesign (xlabs) ─────────────────────
  // This is the ONLY generation pass. The xlabs model with depth ControlNet
  // produces sharp, high-quality furnished rooms. Do NOT add a second pass —
  // re-generation through another model degrades image quality significantly.
  console.log('[Pipeline] Starting Pass 1 (xlabs depth ControlNet)...');
  const pass1Url = await runPass1(imageUri, prompt, base64);
  console.log('[Pipeline] Pass 1 complete:', pass1Url);

  // NOTE: Pass 2 (flux-2-pro) is disabled — it was degrading image quality
  // without achieving reliable product-to-image matching. Product matching
  // is handled by the prompt enrichment pipeline in HomeScreen instead.

  return pass1Url;
}

// ─────────────────────────────────────────────────────────────────────────────
// flux-2-max: Single-call product-reference room generation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the flux-2-max prompt for product-reference room editing.
 *
 * Tells the model to treat image 1 as the room to preserve and images 2+ as
 * product references to swap in. Product categories are mapped to image indices.
 *
 * Exported so callers (e.g. HomeScreen local fallback) can use the same prompt
 * structure as the edge function.
 *
 * @param {string}   userPrompt - The user's raw design prompt
 * @param {object[]} products   - Array of products with a category field
 * @returns {string} Structured prompt for flux-2-max
 */
export function buildFlux2MaxPrompt(userPrompt, products) {
  // Build per-product placement instructions (image 2, 3, 4, 5)
  const placements = [];
  (products || []).slice(0, 4).forEach((p, i) => {
    const category = (p.category || p.name || 'furniture piece')
      .replace(/-/g, ' ')
      .toLowerCase();
    placements.push(`${category} → image ${i + 2}`);
  });

  const placementStr = placements.length > 0
    ? `Only replace furniture to match the references: [${placements.join(', ')}].`
    : "Replace furniture with pieces that match the room's style.";

  return [
    'This is a scene edit, not a new generation.',
    'Keep image 1 room exactly — same walls, floor, ceiling, lighting, camera angle, and spatial layout.',
    'Do not change room architecture.',
    placementStr,
    userPrompt,
    QUALITY_SUFFIX,
  ].join(' ');
}

/**
 * Generate a product-aware room redesign using a single flux-2-max call.
 *
 * Takes a public room photo URL (not a local URI — must already be uploaded to
 * Supabase Storage or Replicate CDN) and up to 4 product reference images.
 * Builds input_images = [roomPhotoUrl, product1.imageUrl, product2.imageUrl, ...]
 * and calls flux-2-max with the structured scene-edit prompt.
 *
 * Used as the local fallback pipeline when the Supabase edge function is
 * unavailable but the room photo is already uploaded.
 *
 * @param {string}   roomPhotoUrl - Public URL of the user's room photo
 * @param {string}   userPrompt   - The user's raw design prompt
 * @param {object[]} products     - Matched products (each with an imageUrl field)
 * @returns {Promise<string>}     - URL of the generated room image
 */
/**
 * Amazon product images default to 1500×1500px (_AC_SL1500_ = 2.25 MP each).
 * Sending 3 at full size = ~6.75 MP of input, which dominates GPU billing.
 * Swap to 300×300px (_AC_SL300_ = 0.09 MP) — the AI still sees color/shape,
 * just at lower fidelity. Saves ~6.5 MP of input → ~30-40% cost reduction.
 */
function shrinkProductImageUrl(url) {
  if (typeof url !== 'string') return url;
  return url
    .replace(/_AC_SL\d+_/g,  '_AC_SL300_')   // _AC_SL1500_ → _AC_SL300_
    .replace(/_AC_UL\d+_/g,  '_AC_SL300_')   // _AC_UL640_ → _AC_SL300_
    .replace(/_SX\d+_/g,     '_AC_SL300_')   // _SX450_ → _AC_SL300_
    .replace(/_SR\d+,\d+_/g, '_AC_SL300_');  // _SR600,315_ → _AC_SL300_
}

export async function generateWithProductRefs(roomPhotoUrl, userPrompt, products) {
  if (!TOKEN) throw new Error('Replicate API token is missing. Add EXPO_PUBLIC_REPLICATE_API_TOKEN to your .env file.');
  if (!roomPhotoUrl) throw new Error('generateWithProductRefs requires a public room photo URL.');

  // Build input_images: room photo first, then up to 4 product images.
  // Minimum 4 products always — user requirement.
  // Shrink Amazon URLs to 300px — AI still recognises style/color at this size
  // but input MP drops from ~2.25 MP → 0.09 MP per image (~96% reduction).
  const productImages = (products || [])
    .filter(p => p.imageUrl)
    .slice(0, 4)
    .map(p => shrinkProductImageUrl(p.imageUrl));

  const inputImages = [roomPhotoUrl, ...productImages];

  const generationPrompt = buildFlux2MaxPrompt(userPrompt || 'Modern minimalist interior design.', products || []);

  console.log('[flux-2-max] Prompt:', generationPrompt.substring(0, 200) + '...');
  console.log('[flux-2-max] input_images:', inputImages.length, '(1 room +', productImages.length, 'products)');
  productImages.forEach((url, i) =>
    console.log(`[flux-2-max] Product ${i + 1}: ${url.substring(0, 80)}`)
  );

  const res = await fetch(`${API_URL}/models/black-forest-labs/flux-2-max/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        prompt:           generationPrompt,
        input_images:     inputImages,
        aspect_ratio:     'match_input_image',
        resolution:       '0.5 MP',   // ~30% less GPU time vs 1 MP — adequate for mobile
        output_format:    'webp',
        output_quality:   90,
        safety_tolerance: 5,
        seed:             Math.floor(Math.random() * 999999999),
      },
    }),
  });

  const prediction = await res.json();
  if (!res.ok) {
    throw new Error(
      `flux-2-max submit failed (${res.status}): ${prediction?.detail || prediction?.error || 'Unknown error'}`
    );
  }

  if (prediction.status === 'succeeded') {
    const output = prediction.output;
    return typeof output === 'string' ? output : (Array.isArray(output) ? output[0] : output);
  }

  return pollUntilDone(prediction.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// flux-2-max: Panel-based generation (2 images: room + 2×2 product grid)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build the flux-2-max prompt when product references are in a 2×2 panel.
 *
 * The panel (image 2) contains a 2×2 grid:
 *   top-left:     product 1 category
 *   top-right:    product 2 category
 *   bottom-left:  product 3 category (if present)
 *   bottom-right: product 4 category (if present)
 *
 * @param {string}   userPrompt - User's raw design prompt
 * @param {object[]} products   - Products with category fields
 * @returns {string} Structured prompt for flux-2-max panel input
 */
export function buildPanelPrompt(userPrompt, products) {
  const cats = (products || []).slice(0, 4).map(p =>
    (p.category || 'furniture').replace(/-/g, ' ').toLowerCase()
  );

  const posLabels = ['top-left', 'top-right', 'bottom-left', 'bottom-right'];
  const gridDesc  = cats
    .map((cat, i) => `${posLabels[i]}: ${cat}`)
    .join(', ');

  const refLine = cats.length > 0
    ? `Image 2 is a 2×2 product reference grid (${gridDesc}). Place these EXACT products into the room — match their color, shape, and style precisely.`
    : 'Replace furniture with pieces that complement the room style.';

  return [
    'This is a scene edit, not a new generation.',
    'Keep image 1 room exactly — same walls, floor, ceiling, lighting, camera angle, and spatial layout.',
    'Do not change room architecture.',
    refLine,
    userPrompt,
    QUALITY_SUFFIX,
  ].join(' ');
}

/**
 * Generate a product-aware room redesign using a 2-image input.
 *
 * Sends [roomPhotoUrl, panelUrl] — 2 images instead of 4 — to reduce GPU
 * attention compute by ~40-50%. The panelUrl is a 512×512 composite of up to
 * 4 product reference images in a 2×2 grid (created by the composite-products
 * edge function via createProductPanel.js).
 *
 * Target cost: ~$0.15/gen vs $0.31 with 4 individual images.
 *
 * Falls back to generateWithProductRefs() in HomeScreen if panelUrl is null.
 *
 * @param {string}   roomPhotoUrl - Public URL of the user's room photo
 * @param {string}   userPrompt   - User's raw design prompt
 * @param {object[]} products     - Matched products (for prompt building)
 * @param {string}   panelUrl     - Public URL of the 2×2 product panel
 * @returns {Promise<string>}     - URL of the generated room image
 */
export async function generateWithProductPanel(roomPhotoUrl, userPrompt, products, panelUrl) {
  if (!TOKEN) throw new Error('Replicate API token is missing. Add EXPO_PUBLIC_REPLICATE_API_TOKEN to your .env file.');
  if (!roomPhotoUrl) throw new Error('generateWithProductPanel requires a public room photo URL.');
  if (!panelUrl)     throw new Error('generateWithProductPanel requires a product panel URL.');

  const inputImages        = [roomPhotoUrl, panelUrl];
  const generationPrompt   = buildPanelPrompt(userPrompt || 'Modern minimalist interior design.', products || []);

  console.log('[flux-2-max panel] Prompt:', generationPrompt.substring(0, 200) + '...');
  console.log('[flux-2-max panel] input_images: 2 (room + 2×2 product panel)');
  console.log('[flux-2-max panel] Panel URL:', panelUrl.substring(0, 80));

  const res = await fetch(`${API_URL}/models/black-forest-labs/flux-2-max/predictions`, {
    method: 'POST',
    headers: {
      Authorization:  `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        prompt:           generationPrompt,
        input_images:     inputImages,
        aspect_ratio:     'match_input_image',
        resolution:       '0.5 MP',
        output_format:    'webp',
        output_quality:   90,
        safety_tolerance: 5,
        seed:             Math.floor(Math.random() * 999999999),
      },
    }),
  });

  const prediction = await res.json();
  if (!res.ok) {
    throw new Error(
      `flux-2-max panel submit failed (${res.status}): ${prediction?.detail || prediction?.error || 'Unknown error'}`
    );
  }

  if (prediction.status === 'succeeded') {
    const output = prediction.output;
    return typeof output === 'string' ? output : (Array.isArray(output) ? output[0] : output);
  }

  return pollUntilDone(prediction.id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Polling
// ─────────────────────────────────────────────────────────────────────────────
async function pollUntilDone(id) {
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${API_URL}/predictions/${id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
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
