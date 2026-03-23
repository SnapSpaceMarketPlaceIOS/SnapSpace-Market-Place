import * as FileSystem from 'expo-file-system/legacy';

const API_URL = 'https://api.replicate.com/v1';
const TOKEN = process.env.EXPO_PUBLIC_REPLICATE_API_TOKEN;

// xlabs-ai/flux-dev-controlnet — Flux.1 Dev with depth/canny/soft-edge ControlNets
const MODEL_VERSION = '9a8db105db745f8b11ad3afe5c8bd892428b2a43ade0b67edc4e0ccd52ff2fda';

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 80; // 3s × 80 = 4 min timeout

/**
 * Upload image to Replicate Files API.
 *
 * Root cause of all previous failures: iOS returns AVIF/HEIC files from the
 * photo library. The file URI points to the original AVIF, but expo-image-picker
 * with quality option already converts to JPEG in the base64 field.
 *
 * Strategy: use the picker's base64 (guaranteed JPEG) → write to a .jpg file
 * → upload via native FormData. If no base64, fall back to reading from URI.
 */
async function uploadForReplicate(imageUri, base64Data) {
  let b64;

  if (base64Data && base64Data.length > 100) {
    // Use the picker's pre-converted JPEG base64 directly
    console.log('[Replicate] Using picker base64 (guaranteed JPEG), length:', base64Data.length);
    b64 = base64Data;
  } else {
    // Fallback: read from URI (may be AVIF/HEIC — risky but sometimes works)
    console.log('[Replicate] No picker base64, reading from URI...');
    b64 = await FileSystem.readAsStringAsync(imageUri, { encoding: 'base64' });
    console.log('[Replicate] Read base64 from URI, length:', b64.length);
  }

  if (!b64 || b64.length < 100) {
    throw new Error('No image data available');
  }

  // Log format detection: JPEG base64 starts with /9j/, PNG with iVBOR, AVIF with AAAA
  const prefix = b64.substring(0, 8);
  const isJpeg = prefix.startsWith('/9j/');
  console.log('[Replicate] Format check — prefix:', prefix, 'isJPEG:', isJpeg);

  // Write JPEG base64 to a real file in cache
  const tempPath = FileSystem.cacheDirectory + 'replicate_upload_' + Date.now() + '.jpg';
  await FileSystem.writeAsStringAsync(tempPath, b64, { encoding: 'base64' });

  const info = await FileSystem.getInfoAsync(tempPath);
  console.log('[Replicate] Temp file size:', info.size, 'bytes');

  if (!info.exists || info.size < 100) {
    throw new Error('Failed to write temp image file');
  }

  // Upload via native FormData
  console.log('[Replicate] Uploading to Files API...');
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

  // Clean up
  FileSystem.deleteAsync(tempPath, { idempotent: true }).catch(() => {});

  const json = await res.json();
  console.log('[Replicate] Upload status:', res.status, 'API size:', json?.size, 'local size:', info.size);

  if (!res.ok) {
    throw new Error(`Image upload failed (${res.status}): ${json?.detail || 'Unknown error'}`);
  }

  if (!json?.urls?.get) {
    throw new Error('Upload succeeded but no file URL returned');
  }

  // Verify sizes match
  if (json.size && Math.abs(json.size - info.size) > 10) {
    console.warn('[Replicate] SIZE MISMATCH — API:', json.size, 'vs local:', info.size);
  }

  return json.urls.get;
}

/**
 * Generates a redesigned interior image using Flux ControlNet.
 *
 * @param {string} imageUri  - Local file URI from expo-image-picker / expo-camera
 * @param {string} prompt    - Design style prompt
 * @param {string} [base64]  - Optional JPEG base64 from the image picker
 * @returns {Promise<string>} URL of the AI-generated room image
 */
export async function generateInteriorDesign(imageUri, prompt, base64) {
  if (!TOKEN) throw new Error('Replicate API token is missing. Add EXPO_PUBLIC_REPLICATE_API_TOKEN to your .env file.');

  const controlImage = await uploadForReplicate(imageUri, base64);
  console.log('[Replicate] control_image URL:', controlImage);

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
        prompt: `${prompt || 'modern minimalist interior design'}, beautifully furnished interior, professional interior photography, high resolution, staged room, warm soft lighting, interior design magazine quality`,
        negative_prompt: 'lowres, watermark, text, banner, logo, deformed, blurry, out of focus, empty room, bare walls, no furniture, bare floor, people, person, human, outdoor, exterior, cartoon, anime, sketch, overexposed, underexposed, ugly',
        control_type: 'depth',
        guidance_scale: 4.0,
        steps: 28,
        seed: Math.floor(Math.random() * 999999999),
        control_strength: 0.6,
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
      throw new Error(prediction.error || 'AI generation failed. Please try again.');
    }
  }
  throw new Error('AI generation timed out after 4 minutes. Please try again.');
}
