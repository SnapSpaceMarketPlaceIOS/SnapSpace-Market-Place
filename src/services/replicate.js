const API_URL = 'https://api.replicate.com/v1';
const TOKEN = process.env.EXPO_PUBLIC_REPLICATE_API_TOKEN;

// xlabs-ai/flux-dev-controlnet — Flux.1 Dev with depth/canny/soft-edge ControlNets (XLabs v3)
// Version hash from: https://replicate.com/xlabs-ai/flux-dev-controlnet/versions
// A100 80GB — high quality, ~20-40s warm / up to 3min cold boot.
const MODEL_VERSION = '9a8db105db745f8b11ad3afe5c8bd892428b2a43ade0b67edc4e0ccd52ff2fda';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 80; // 3s × 80 = 4 min timeout (accounts for cold boot)

/**
 * Uploads a base64-encoded JPEG directly to Replicate's Files API.
 * Use as a fallback when Supabase Storage is unavailable.
 * Returns a Replicate-hosted URL the model can read as input.
 *
 * @param {string} base64 - Raw base64 string (no "data:image/..." prefix)
 * @returns {Promise<string>} Replicate file URL
 */
export async function uploadImageToReplicate(base64) {
  if (!TOKEN) throw new Error('Replicate API token is missing.');

  // Decode base64 → Uint8Array
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }

  const res = await fetch(`${API_URL}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'image/jpeg',
    },
    body: bytes,
  });

  const file = await res.json();
  if (!res.ok) throw new Error(file.detail || 'Failed to upload image to Replicate.');
  // Replicate Files API returns { urls: { get: "..." } }
  return file.urls?.get ?? file.url;
}

/**
 * Sends a room photo URL and design prompt to the Flux ControlNet model.
 * The model preserves your room's spatial structure (walls, windows, layout)
 * while completely restyling it with Flux.1 Dev quality.
 *
 * Key differences from old SD1.5 model:
 *   - guidance: 4.0   (Flux Dev range: 3-5 — NOT 7-15 like SD)
 *   - steps: 28       (Flux: 25-30 is plenty — more = diminishing returns)
 *   - control_image   (XLabs param name for the structural reference photo)
 *   - controlnet_conditioning_scale: 0.6  (how hard the depth map constrains layout)
 *   - Random seed per call = different output every generation
 *
 * @param {string} imageUrl - Public URL of the room photo (Supabase Storage or Replicate Files)
 * @param {string} prompt   - Enriched design style prompt from SnapScreen buildEnrichedPrompt()
 * @returns {Promise<string>} URL of the AI-generated room image
 */
export async function generateInteriorDesign(imageUrl, prompt) {
  if (!TOKEN) throw new Error('Replicate API token is missing. Add EXPO_PUBLIC_REPLICATE_API_TOKEN to your .env file.');

  const res = await fetch(`${API_URL}/predictions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: MODEL_VERSION,
      input: {
        // The reference room photo — ControlNet extracts depth map to preserve structure
        control_image: imageUrl,

        // Enriched prompt comes from buildEnrichedPrompt() in SnapScreen.js,
        // which lists the specific furniture pieces from matched products.
        prompt: `${prompt || 'modern minimalist interior design'}, beautifully furnished interior, professional interior photography, high resolution, staged room, warm soft lighting, interior design magazine quality`,

        negative_prompt: 'lowres, watermark, text, banner, logo, deformed, blurry, out of focus, empty room, bare walls, no furniture, bare floor, people, person, human, outdoor, exterior, cartoon, anime, sketch, overexposed, underexposed, ugly',

        // depth = extracts room geometry (walls, floor, windows) as structural constraint
        control_type: 'depth',

        // Flux Dev guidance range: 3.5-7.0 (much lower than SD's 7-15)
        guidance_scale: 4.0,

        // 25-30 steps is the Flux sweet spot
        steps: 28,

        // Random seed = different output every generation
        seed: Math.floor(Math.random() * 999999999),

        // How hard depth ControlNet constrains room geometry (0.0-2.0)
        // 0.6 = preserves walls/windows while allowing furniture freedom
        control_strength: 0.6,

        output_format: 'webp',
        output_quality: 95,
      },
    }),
  });

  const prediction = await res.json();
  if (!res.ok) throw new Error(prediction.detail || 'Failed to start AI generation.');

  // If already completed (fast warm inference)
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
      throw new Error(prediction.error || 'AI generation failed. Please try again.');
    }
  }
  throw new Error('AI generation timed out after 4 minutes. Please try again.');
}
