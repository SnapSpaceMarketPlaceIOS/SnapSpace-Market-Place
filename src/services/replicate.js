const API_URL = 'https://api.replicate.com/v1';
const TOKEN = process.env.EXPO_PUBLIC_REPLICATE_API_TOKEN;

// adirik/interior-design — transforms a room photo into an AI-redesigned version.
// https://replicate.com/adirik/interior-design (latest: 76604bad)
const MODEL_VERSION = '76604baddc85b1b4616e1c6475eca080da339c8875bd4996705440484a6eac38';

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 60; // 2.5s × 60 = 2.5 min timeout

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
 * Sends a room photo URL and design prompt to Replicate.
 * Polls until the AI image is ready and returns the result URL.
 *
 * @param {string} imageUrl - Public URL of the room photo (Supabase Storage or Replicate Files)
 * @param {string} prompt   - User's design style prompt
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
        image: imageUrl,
        prompt: `${prompt || 'modern minimalist interior design'}, furnished interior, complete room setup with furniture, interior design magazine quality, warm lighting`,
        guidance_scale: 15,
        negative_prompt: 'lowres, watermark, text, deformed, blurry, out of focus, empty room, no furniture, bare walls, ugly, cartoon, unrealistic, overexposed, dark',
        num_inference_steps: 50,
        prompt_strength: 0.8,
      },
    }),
  });

  const prediction = await res.json();
  if (!res.ok) throw new Error(prediction.detail || 'Failed to start AI generation.');

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
  throw new Error('AI generation timed out. Please try again.');
}
