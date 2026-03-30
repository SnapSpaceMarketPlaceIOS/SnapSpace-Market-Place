import * as FileSystem from 'expo-file-system/legacy';

const FAL_KEY = process.env.EXPO_PUBLIC_FAL_API_KEY;

// ── fal.ai endpoint ───────────────────────────────────────────────────────────
//
// fal-ai/flux-general is the only confirmed-working Flux img2img endpoint.
//
// Attempted and failed:
//   fal-ai/flux-general + XLabs-AI/flux-controlnet-depth-v3  → hangs (model not loaded)
//   fal-ai/flux-general + XLabs-AI/flux-ip-adapter-v2        → hangs (model not loaded)
//   fal-ai/flux-dev-controlnet                                → 404 (endpoint doesn't exist)
//
// ControlNet and IP-Adapter require either fal.ai ComfyUI workflows or a
// different provider (Replicate). Tracking as Phase 3.2 open item.
//
const FAL_IMG2IMG_URL = 'https://queue.fal.run/fal-ai/flux-general';

// ── Generation settings ───────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 1000;
const MAX_POLLS        = 150;   // 1s × 150 = 2.5 min timeout

const IMG2IMG_STRENGTH = 0.80;
const IMG2IMG_STEPS    = 12;
const IMG2IMG_GUIDANCE = 3.5;

// ── Architecture preservation prompt ─────────────────────────────────────────
const ARCH_GUARD =
  'Keep all walls, doors, windows, ceiling, and floor plan completely unchanged. Only replace furniture and decor.';

const QUALITY_SUFFIX =
  '8k interior design photography, natural lighting, photorealistic, editorial quality, Architectural Digest.';

// ── High-dominance categories (reserved for IP-Adapter Phase 3.2b) ───────────
const HIGH_DOMINANCE = new Set([
  'sofa', 'bed', 'dining-table', 'desk', 'sectional', 'kitchen-island',
]);

// ─────────────────────────────────────────────────────────────────────────────
// Get image as a base64 data URI — used for img2img fallback only.
// fal.ai ControlNet endpoint requires a public HTTPS URL, not a data URI.
// ─────────────────────────────────────────────────────────────────────────────
async function getImageDataUri(imageUri, base64Data) {
  let b64 = base64Data;
  if (!b64 || b64.length < 100) {
    console.log('[fal.ai] Reading image from file...');
    b64 = await FileSystem.readAsStringAsync(imageUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }
  const dataUri = `data:image/jpeg;base64,${b64}`;
  console.log(`[fal.ai] Data URI ready (${Math.round(b64.length / 1024)}KB base64)`);
  return dataUri;
}

// ─────────────────────────────────────────────────────────────────────────────
// IP-Adapter — disabled pending Phase 3.2b (Redux reference-image pass).
// ─────────────────────────────────────────────────────────────────────────────
function buildIpAdapters(_products) {
  void HIGH_DOMINANCE;
  return [];
}

// ─────────────────────────────────────────────────────────────────────────────
// Build the generation prompt.
// Product descriptions lead (most token weight), then style, then guards.
// ─────────────────────────────────────────────────────────────────────────────
function buildFalPrompt(userPrompt, products) {
  const parts = [];

  const topProducts = products.slice(0, 4);
  if (topProducts.length > 0) {
    const descriptions = topProducts
      .filter(p => p.name)
      .map(p => {
        const mat  = (p.materials || []).slice(0, 2).join(' ');
        const name = p.name.split(' ').slice(0, 5).join(' ').toLowerCase();
        return mat ? `${mat} ${name}` : name;
      });
    if (descriptions.length > 0) {
      parts.push(`Furnished with: ${descriptions.join(', ')}.`);
    }
  }

  parts.push(userPrompt || 'Modern minimalist interior design.');
  parts.push(ARCH_GUARD);
  parts.push(QUALITY_SUFFIX);

  return parts.join(' ').split(/\s+/).slice(0, 130).join(' ');
}

// ─────────────────────────────────────────────────────────────────────────────
// Safe JSON fetch — reads raw text first so parse errors show the actual body.
// ─────────────────────────────────────────────────────────────────────────────
async function safeJsonFetch(url, options = {}) {
  const res  = await fetch(url, options);
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch (e) {
    const preview = text.substring(0, 300);
    console.error(`[fal.ai] Non-JSON from ${url} (${res.status}):`, preview);
    throw new Error(`fal.ai returned non-JSON (${res.status}): ${preview}`);
  }
  return { res, json };
}

// ─────────────────────────────────────────────────────────────────────────────
// Submit a request to a fal.ai queue endpoint and return { statusUrl, responseUrl }.
// ─────────────────────────────────────────────────────────────────────────────
async function submitToFalQueue(endpointUrl, body) {
  const { res: submitRes, json: submitJson } = await safeJsonFetch(endpointUrl, {
    method:  'POST',
    headers: {
      Authorization:  `Key ${FAL_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  console.log('[fal.ai] Submit status:', submitRes.status, '| Endpoint:', endpointUrl);

  if (!submitRes.ok) {
    throw new Error(
      `fal.ai submit failed (${submitRes.status}): ` +
      (submitJson?.detail || submitJson?.error || JSON.stringify(submitJson).substring(0, 200))
    );
  }

  const requestId = submitJson?.request_id;
  if (!requestId) {
    console.error('[fal.ai] No request_id:', JSON.stringify(submitJson).substring(0, 400));
    throw new Error('fal.ai did not return a request_id');
  }

  const statusUrl   = submitJson?.status_url   || `${endpointUrl}/requests/${requestId}/status`;
  const responseUrl = submitJson?.response_url || `${endpointUrl}/requests/${requestId}`;

  console.log('[fal.ai] Queued:', requestId);
  return { statusUrl, responseUrl };
}

// ─────────────────────────────────────────────────────────────────────────────
// Poll the fal.ai queue until COMPLETED, then extract and return the image URL.
// ─────────────────────────────────────────────────────────────────────────────
async function pollFalQueue(statusUrl, responseUrl) {
  const headers = { Authorization: `Key ${FAL_KEY}` };

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise(r => setTimeout(r, POLL_INTERVAL_MS));

    const { res: statusRes, json: statusJson } = await safeJsonFetch(statusUrl, { headers });
    const status = statusJson?.status;

    console.log(`[fal.ai] Poll ${i + 1}: ${status} (HTTP ${statusRes.status})`);

    if (status === 'COMPLETED') {
      // Some endpoints embed output in the status response
      const statusOutput = statusJson?.output;
      const imgFromStatus =
        statusOutput?.images?.[0]?.url ||
        statusOutput?.image?.url        ||
        statusJson?.images?.[0]?.url    ||
        statusJson?.image?.url;

      if (imgFromStatus) {
        console.log('[fal.ai] Image from status response:', imgFromStatus.substring(0, 80));
        return imgFromStatus;
      }

      // Fetch from response_url
      const { res: resultRes, json: resultJson } = await safeJsonFetch(responseUrl, { headers });
      console.log('[fal.ai] Result HTTP:', resultRes.status);

      if (!resultRes.ok) {
        const errDetail = resultJson?.detail || resultJson?.error || JSON.stringify(resultJson).substring(0, 400);
        console.error(`[fal.ai] response_url error (${resultRes.status}):`, errDetail);
        throw new Error(`fal.ai error (${resultRes.status}): ${errDetail}`);
      }

      console.log('[fal.ai] Result keys:', Object.keys(resultJson || {}).join(', '));

      const imgUrl =
        resultJson?.images?.[0]?.url         ||
        resultJson?.image?.url               ||
        resultJson?.output?.images?.[0]?.url ||
        resultJson?.output?.image?.url       ||
        resultJson?.data?.images?.[0]?.url;

      if (!imgUrl) {
        console.error('[fal.ai] Full result JSON:', JSON.stringify(resultJson).substring(0, 600));
        throw new Error('fal.ai completed but returned no image URL');
      }
      console.log('[fal.ai] Image URL:', imgUrl.substring(0, 80));
      return imgUrl;
    }

    if (status === 'FAILED') {
      const reason = statusJson?.error || statusJson?.detail || JSON.stringify(statusJson);
      throw new Error(`fal.ai generation failed: ${reason}`);
    }
  }

  throw new Error('fal.ai generation timed out after 2.5 minutes.');
}

// ─────────────────────────────────────────────────────────────────────────────
// img2img generation — the only confirmed-working Flux path on fal.ai.
// ─────────────────────────────────────────────────────────────────────────────
async function generateWithImg2Img(imageUri, base64, falPrompt) {
  console.log('[fal.ai] Mode: Flux img2img');
  const roomDataUri = await getImageDataUri(imageUri, base64);
  const body = {
    prompt:              falPrompt,
    image_url:           roomDataUri,
    strength:            IMG2IMG_STRENGTH,
    num_inference_steps: IMG2IMG_STEPS,
    guidance_scale:      IMG2IMG_GUIDANCE,
    real_cfg_scale:      3.5,
    num_images:          1,
    output_format:       'jpeg',
    enable_safety_checker: false,
    seed:                Math.floor(Math.random() * 999999999),
  };
  const { statusUrl, responseUrl } = await submitToFalQueue(FAL_IMG2IMG_URL, body);
  return pollFalQueue(statusUrl, responseUrl);
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC API
//
// @param {string}   imageUri        - Local file URI of user's room photo
// @param {string}   [base64]        - Optional base64 from image picker
// @param {string}   prompt          - Enriched generation prompt
// @param {object[]} products        - Matched catalog products
// @param {string}   userPrompt      - Raw user prompt for style context
// @param {string}   [publicRoomUrl] - Public Supabase URL → enables ControlNet
// @returns {Promise<string>}        - URL of the generated room image
// ─────────────────────────────────────────────────────────────────────────────
export async function generateWithFalAI(imageUri, base64, prompt, products, userPrompt, _publicRoomUrl) {
  if (!FAL_KEY) throw new Error('fal.ai API key missing. Add EXPO_PUBLIC_FAL_API_KEY to .env');

  // _publicRoomUrl reserved for when ControlNet becomes available (Phase 3.2)
  const falPrompt = buildFalPrompt(userPrompt || prompt, products || []);
  console.log('[fal.ai] Prompt:', falPrompt.substring(0, 150) + '...');
  return generateWithImg2Img(imageUri, base64, falPrompt);
}

// ─────────────────────────────────────────────────────────────────────────────
// Quick check — returns true if fal.ai is configured and ready
// ─────────────────────────────────────────────────────────────────────────────
export function isFalAIConfigured() {
  return !!FAL_KEY;
}
