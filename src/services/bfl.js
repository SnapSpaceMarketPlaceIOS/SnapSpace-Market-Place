/**
 * HomeGenie — Black Forest Labs direct client
 *
 * Calls api.bfl.ai directly from React Native — no Supabase edge function
 * in the generation path. React Native has no CORS restrictions.
 *
 * Model routing:
 *   flux-kontext-pro  — image-to-image editing (transforms user's actual room)
 *                       Used when roomPhotoUrl is provided.
 *   flux-pro-1.1-ultra — text-to-image (generates new room from scratch)
 *                        Fallback when no room photo is available.
 *
 * Cost: ~$0.08–0.10/generation
 * Auth: X-Key header (injected by ai-proxy edge function in production)
 */

// Rich visual descriptor helper is shared with replicate.js so the panel
// prompt and the BFL fallback both benefit from specific color/material/
// shape/type tokens instead of generic category labels.
import { describeProductForPrompt } from '../utils/productDescriptor';
import { proxyFetch } from './apiProxy';

const BFL_BASE_URL     = 'https://api.bfl.ai/v1';
const BFL_MODEL_KONTEXT = 'flux-kontext-pro';   // image-to-image: transforms user's actual room
const BFL_MODEL_TEXT    = 'flux-pro-1.1-ultra'; // text-to-image: used if no room photo
const POLL_INTERVAL     = 3000;   // ms between polls
const MAX_POLLS         = 60;     // 60 × 3s = 3-min ceiling

// ── Prompt builders ───────────────────────────────────────────────────────────

/**
 * Build a prompt for flux-kontext-pro (image editing).
 * The model sees the actual room photo, so we focus on WHAT to change,
 * not describing the room from scratch.
 *
 * Rich descriptors (color + material + shape + category) bias BFL toward
 * rendering items in the same visual family as the catalog products the user
 * will see in "Shop Your Room" — the closest we can get to fidelity without
 * real visual references (BFL kontext only accepts ONE input_image).
 */
function buildKontextPrompt(userPrompt, products = []) {
  const furnitureItems = products
    .slice(0, 4)
    .map(describeProductForPrompt)
    .filter(Boolean);

  const furnitureStr = furnitureItems.length > 0
    ? `Replace furniture with: ${furnitureItems.join('; ')}.`
    : '';

  return [
    'Editorial architectural photography, ultra-sharp focus, crisp detail, natural light, magazine-quality interior, Architectural Digest style.',
    'Interior design transformation of this specific room.',
    'Keep the exact room layout, dimensions, walls, windows, doors, floor, ceiling, and camera angle completely unchanged.',
    'Only replace the furniture, decor, and soft furnishings.',
    furnitureStr,
    userPrompt,
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Build a prompt for flux-pro-1.1-ultra (text-to-image).
 * Used only as a fallback when there is no room photo.
 */
function buildTextPrompt(userPrompt, products = []) {
  const furnitureItems = products
    .slice(0, 4)
    .map(describeProductForPrompt)
    .filter(Boolean);

  return [
    'Editorial architectural photography, ultra-sharp focus, crisp detail, natural light, magazine-quality interior, Architectural Digest style.',
    userPrompt,
    furnitureItems.length > 0 ? `Featuring: ${furnitureItems.join('; ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

// BFL flux-kontext-pro accepts aspect ratios from 3:7 (tall portrait) up to
// 7:3 (wide landscape). Passing an unsupported ratio causes a 422. We snap
// any incoming ratio to the closest supported bucket.
const BFL_ASPECT_RATIOS = ['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3', '7:3', '3:7'];

function snapBflAspectRatio(aspectRatio) {
  if (!aspectRatio || aspectRatio === 'match_input_image') return '1:1';
  if (BFL_ASPECT_RATIOS.includes(aspectRatio)) return aspectRatio;
  // Parse 'W:H' and snap to the closest supported bucket via log-distance.
  const m = /^(\d+):(\d+)$/.exec(aspectRatio);
  if (!m) return '1:1';
  const r = parseInt(m[1], 10) / parseInt(m[2], 10);
  let best = '1:1';
  let bestDelta = Infinity;
  for (const name of BFL_ASPECT_RATIOS) {
    const [w, h] = name.split(':').map(Number);
    const delta = Math.abs(Math.log(r / (w / h)));
    if (delta < bestDelta) { best = name; bestDelta = delta; }
  }
  return best;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Fetch a public image URL and return it as a raw base64 string.
 * BFL kontext expects base64 WITHOUT the data-URL prefix.
 */
async function fetchAsBase64(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed (${res.status}): ${url}`);
  const buffer = await res.arrayBuffer();
  const bytes  = new Uint8Array(buffer);
  let binary   = '';
  // Process in chunks to avoid call stack overflows on large images
  const CHUNK  = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Extract the image URL from a BFL "Ready" poll response.
 * BFL regional endpoints (api.us2.bfl.ai etc.) return the URL in
 * different fields depending on the subdomain and model.
 */
function extractImageUrl(polled) {
  return (
    polled.result?.sample                                           // standard
    || polled.result?.url                                           // alt
    || polled.result?.image                                         // alt
    || (typeof polled.result === 'string' ? polled.result : null)   // direct string
    || polled.sample                                                // top-level
    || polled.url                                                   // top-level
    || null
  );
}

/**
 * Submit a job to BFL and poll until Ready.
 * @returns {Promise<string>} The generated image URL
 */
async function submitAndPoll(apiKey, model, body, onStatus) {
  const endpoint = `${BFL_BASE_URL}/${model}`;
  console.log(`[BFL] Submitting | model=${model}`);
  onStatus('Submitting to Black Forest Labs…');

  const submitRes = await proxyFetch('bfl', endpoint, {
    method: 'POST',
    headers: { 'Accept': 'application/json' },
    body,
  });

  if (!submitRes.ok) {
    const errBody = await submitRes.text().catch(() => '');
    throw new Error(`BFL submit failed (${submitRes.status}): ${errBody.substring(0, 200)}`);
  }

  const submitted    = await submitRes.json();
  const predictionId = submitted.id;
  const pollingUrl   = submitted.polling_url
    || `${BFL_BASE_URL}/get_result?id=${predictionId}`;

  if (!predictionId) {
    throw new Error(
      `BFL returned no prediction ID: ${JSON.stringify(submitted).substring(0, 200)}`
    );
  }

  console.log(`[BFL] Submitted | id=${predictionId} | polling=${pollingUrl}`);
  onStatus('Generating your design…');

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const pollRes = await proxyFetch('bfl', pollingUrl, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (!pollRes.ok) {
      console.warn(`[BFL] Poll ${i + 1} returned ${pollRes.status} — retrying…`);
      continue;
    }

    const polled = await pollRes.json();
    const status = polled.status;
    console.log(`[BFL] Poll ${i + 1}/${MAX_POLLS} | status=${status}`);

    if (status === 'Ready') {
      const imageUrl = extractImageUrl(polled);
      if (!imageUrl) {
        throw new Error(
          `BFL returned Ready but image URL not found in any known field. ` +
          `result=${JSON.stringify(polled.result).substring(0, 300)}`
        );
      }
      console.log(`[BFL] Done | url=${imageUrl.substring(0, 80)}…`);
      return imageUrl;
    }

    if (status === 'Error') {
      throw new Error(`BFL generation error: ${JSON.stringify(polled).substring(0, 200)}`);
    }

    if (status === 'Content Moderated' || status === 'Request Moderated') {
      throw new Error('BFL content moderation triggered. Try a different prompt.');
    }
    // 'Queued' | 'Processing' → keep polling
  }

  throw new Error('BFL generation timed out after 3 minutes.');
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Generate an interior design image through BFL.
 *
 * When roomPhotoUrl is provided, uses flux-kontext-pro to transform the
 * user's actual room (image-to-image). Without it, falls back to
 * flux-pro-1.1-ultra (text-to-image).
 *
 * IMPORTANT limitation: flux-kontext-pro ONLY accepts a single input_image.
 * There is no input_image_2/3/4 — BFL does not support multi-image kontext
 * editing at this time. Product fidelity is therefore driven entirely by the
 * prompt. buildKontextPrompt extracts rich visual descriptors (color,
 * material, shape) from the catalog metadata so the render stays as close as
 * possible to the "Shop Your Room" products the user will see.
 *
 * @param {string}      userPrompt    User's design prompt
 * @param {object[]}    products      Matched products (used in prompt + shown in UI)
 * @param {function}    onStatus      Status update callback
 * @param {string|null} roomPhotoUrl  Public URL of uploaded room photo
 * @param {string}      [aspectRatio] Aspect ratio like '3:2' / '16:9' — snapped to BFL's supported set
 * @returns {Promise<string>}         Generated image URL (~10 min TTL from BFL CDN)
 */
export async function generateWithBFL(
  userPrompt,
  products  = [],
  onStatus  = () => {},
  roomPhotoUrl = null,
  aspectRatio  = null,
) {
  // Auth handled by apiProxy (server-side in production, EXPO_PUBLIC_ in dev)
  const apiKey = 'proxy-handled'; // kept for function signature compatibility

  const bflAspect = snapBflAspectRatio(aspectRatio);

  // ── Path 1: flux-kontext-pro — transforms user's actual room ─────────────
  if (roomPhotoUrl) {
    try {
      onStatus('Reading your room photo…');
      const imageBase64 = await fetchAsBase64(roomPhotoUrl);
      const prompt      = buildKontextPrompt(userPrompt, products);

      console.log(`[BFL] Using kontext (image-to-image) | aspect=${bflAspect} | prompt="${prompt.substring(0, 120)}…"`);

      return await submitAndPoll(
        apiKey,
        BFL_MODEL_KONTEXT,
        {
          prompt,
          input_image:      imageBase64,
          aspect_ratio:     bflAspect,
          output_format:    'jpeg',
          safety_tolerance: 6,
          seed:             Math.floor(Math.random() * 999999999),
        },
        onStatus,
      );
    } catch (kontextErr) {
      // If kontext fails (e.g. model unavailable), log and fall through to text-only
      console.warn(
        `[BFL] flux-kontext-pro failed (${kontextErr.message}) — falling back to text-to-image`
      );
    }
  }

  // ── Path 2: flux-pro-1.1-ultra — text-to-image fallback ─────────────────
  const prompt = buildTextPrompt(userPrompt, products);
  console.log(`[BFL] Using text-to-image | aspect=${bflAspect} | prompt="${prompt.substring(0, 120)}…"`);

  return await submitAndPoll(
    apiKey,
    BFL_MODEL_TEXT,
    {
      prompt,
      aspect_ratio:     bflAspect,
      output_format:    'jpeg',
      safety_tolerance: 6,
      seed:             Math.floor(Math.random() * 999999999),
    },
    onStatus,
  );
}
