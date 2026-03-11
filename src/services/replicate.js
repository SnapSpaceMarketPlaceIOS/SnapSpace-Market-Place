const API_URL = 'https://api.replicate.com/v1';
const TOKEN = process.env.EXPO_PUBLIC_REPLICATE_API_TOKEN;

// adirik/interior-design — transforms a room photo into an AI-redesigned version.
// https://replicate.com/adirik/interior-design (latest: 76604bad)
const MODEL_VERSION = '76604baddc85b1b4616e1c6475eca080da339c8875bd4996705440484a6eac38';

const POLL_INTERVAL_MS = 2500;
const MAX_POLLS = 60; // 2.5s × 60 = 2.5 min timeout

/**
 * Sends a room photo URL and design prompt to Replicate.
 * Polls until the AI image is ready and returns the result URL.
 *
 * @param {string} imageUrl - Public URL of the room photo (from Supabase Storage)
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
        prompt: prompt || 'Modern minimalist interior design, bright and airy',
        guidance_scale: 15,
        negative_prompt: 'lowres, watermark, banner, logo, watermark, contactinfo, text, deformed, blurry, blur, out of focus',
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
