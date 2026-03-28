import * as FileSystem from 'expo-file-system/legacy';

const API_URL = 'https://api.replicate.com/v1';
const TOKEN = process.env.EXPO_PUBLIC_REPLICATE_API_TOKEN;

// xlabs-ai/flux-dev-controlnet — Flux.1 Dev with depth/canny/soft-edge ControlNets
const MODEL_VERSION = '9a8db105db745f8b11ad3afe5c8bd892428b2a43ade0b67edc4e0ccd52ff2fda';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 80; // 3s × 80 = 4 min timeout

// ── Architecture preservation prefix ─────────────────────────────────────────
// This is prepended to every prompt to ensure the model preserves the room's
// physical structure (walls, doors, windows, ceiling, floor plan).
const ARCHITECTURE_GUARD = [
  'Redesign ONLY the interior furniture, decor, and soft furnishings in this room.',
  'CRITICALLY IMPORTANT: Every wall, door, doorway, window, ceiling, floor plan,',
  'molding, radiator, vent, and built-in fixture must remain EXACTLY as they appear',
  'in the original photo. Do not add new doors or windows. Do not remove existing',
  'doors or windows. Do not change wall positions or room layout. The room shell',
  'is sacred and untouchable — only furniture and decor inside the room changes.',
].join(' ');

// Quality suffix appended to every prompt for photorealistic output
const QUALITY_SUFFIX = [
  'Professional interior design photography,',
  'natural warm lighting, photorealistic, high resolution,',
  'editorial quality, beautifully staged room,',
  'interior design magazine cover shot.',
].join(' ');

/**
 * Build the final prompt sent to the AI model.
 *
 * Structure:
 *   [Architecture guard] + [User's design intent] + [Product hints] + [Quality suffix]
 *
 * @param {string} userPrompt    - The user's raw prompt ("Cozy Scandinavian reading nook")
 * @param {string} [productHints] - Optional furniture descriptions from catalog matching
 * @returns {string} The full enriched prompt
 */
export function buildFinalPrompt(userPrompt, productHints) {
  const parts = [ARCHITECTURE_GUARD];

  // User's design intent
  parts.push(`Design style: ${userPrompt || 'modern minimalist interior design'}.`);

  // Product catalog hints (when available)
  // These descriptions tell the AI exactly what furniture to place,
  // creating visual alignment between the generated image and shop cards.
  if (productHints) {
    parts.push(`Furnish the room with exactly these items: ${productHints}.`);
    parts.push('Place only the furniture described above — do not add extra items beyond what is listed.');
  }

  parts.push(QUALITY_SUFFIX);

  return parts.join(' ');
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

  // Format detection: JPEG starts with /9j/, PNG with iVBOR
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

/**
 * Generates a redesigned interior image using Flux ControlNet.
 *
 * Key parameter tuning:
 * - control_strength: 0.65 — preserves room geometry (walls/doors/windows)
 *   while allowing furniture changes. Higher = more original photo preserved.
 * - guidance_scale: 4.0 — how closely the model follows the text prompt.
 * - steps: 28 — generation quality steps.
 *
 * @param {string} imageUri  - Local file URI from expo-image-picker / expo-camera
 * @param {string} prompt    - The FULL enriched prompt (use buildFinalPrompt())
 * @param {string} [base64]  - Optional JPEG base64 from the image picker
 * @returns {Promise<string>} URL of the AI-generated room image
 */
export async function generateInteriorDesign(imageUri, prompt, base64) {
  if (!TOKEN) throw new Error('Replicate API token is missing. Add EXPO_PUBLIC_REPLICATE_API_TOKEN to your .env file.');

  const controlImage = await imageToDataUri(imageUri, base64);
  const isDataUri = controlImage.startsWith('data:');
  console.log('[Replicate] control_image:', isDataUri ? `data URI (${controlImage.length} chars)` : controlImage);
  console.log('[Replicate] Prompt:', prompt.substring(0, 200) + '...');

  const res = await fetch(`${API_URL}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: MODEL_VERSION,
      input: {
        control_image: controlImage,
        prompt: prompt,
        negative_prompt: [
          'lowres, watermark, text, banner, logo, deformed, blurry, out of focus,',
          'empty room, bare walls, no furniture, bare floor,',
          'people, person, human, hands, fingers,',
          'outdoor, exterior, cartoon, anime, sketch,',
          'overexposed, underexposed, ugly,',
          'changed room layout, different floor plan, missing doors, missing windows,',
          'altered walls, removed doors, added walls, structural changes,',
        ].join(' '),
        control_type: 'depth',
        guidance_scale: 4.0,
        steps: 28,
        seed: Math.floor(Math.random() * 999999999),
        // control_strength: 0.75 — high preservation of room architecture.
        // 0.5 = balanced, 0.7 = very faithful, 0.8+ = minimal changes.
        // We use 0.75 to strictly keep walls/doors/windows intact while swapping furniture.
        control_strength: 0.75,
        output_format: 'webp',
        output_quality: 95,
      },
    }),
  });

  const prediction = await res.json();
  if (!res.ok) throw new Error(prediction.detail || 'Failed to start AI generation.');

  if (prediction.status === 'succeeded') {
    const output = prediction.output;
    return Array.isArray(output) ? output[0] : output;
  }

  return pollUntilDone(prediction.id);
}

async function pollUntilDone(id) {
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));

    const res = await fetch(`${API_URL}/predictions/${id}`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    const prediction = await res.json();

    if (prediction.status === 'succeeded') {
      const output = prediction.output;
      return Array.isArray(output) ? output[0] : output;
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
