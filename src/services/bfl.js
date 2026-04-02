/**
 * SnapSpace — Black Forest Labs direct client
 *
 * Calls api.bfl.ai directly from React Native, bypassing the Supabase
 * edge function. React Native has no CORS restrictions so direct API
 * calls work without a server proxy.
 *
 * Model: flux-pro-1.1-ultra  (~$0.08–0.10/generation)
 * Auth:  X-Key header using EXPO_PUBLIC_BFL_API_KEY
 */

const BFL_BASE_URL    = 'https://api.bfl.ai/v1';
const BFL_MODEL       = 'flux-pro-1.1-ultra';
const POLL_INTERVAL   = 3000;   // ms between polls
const MAX_POLLS       = 60;     // 60 × 3s = 3-min ceiling

/**
 * Build a photorealistic interior design prompt from the user's text
 * and their matched products.
 */
function buildPrompt(userPrompt, products = []) {
  const furnitureList = products
    .slice(0, 4)
    .map((p) => {
      const cat   = (p.category || 'furniture').replace(/-/g, ' ');
      const style = p.styles?.[0] || p.styleTags?.[0] || '';
      return style ? `${style} ${cat}` : cat;
    })
    .filter(Boolean)
    .join(', ');

  return [
    userPrompt,
    furnitureList ? `Feature these furniture pieces: ${furnitureList}.` : '',
    'Preserve the exact room architecture, walls, windows, floor, ceiling, and camera angle.',
    'Replace all furniture and decor with beautiful, stylish pieces that match the design style.',
    '8k interior design photography, natural lighting, photorealistic, editorial quality, Architectural Digest.',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Extract the image URL from a BFL "Ready" poll response.
 * BFL regional endpoints return the URL in different fields depending
 * on the subdomain (api.bfl.ai vs api.us2.bfl.ai etc.).
 */
function extractImageUrl(polled) {
  return (
    polled.result?.sample                                          // standard
    || polled.result?.url                                          // alt
    || polled.result?.image                                        // alt
    || (typeof polled.result === 'string' ? polled.result : null)  // direct string
    || polled.sample                                               // top-level
    || polled.url                                                  // top-level
    || null
  );
}

/**
 * Generate an interior design image directly through BFL.
 *
 * @param {string}   userPrompt   The user's raw design prompt
 * @param {object[]} products     Matched products (for prompt enrichment)
 * @param {function} onStatus     Optional callback for status updates
 * @returns {Promise<string>}     The generated image URL (temporary, ~10 min TTL)
 */
export async function generateWithBFL(userPrompt, products = [], onStatus = () => {}) {
  const apiKey = process.env.EXPO_PUBLIC_BFL_API_KEY;
  if (!apiKey) throw new Error('EXPO_PUBLIC_BFL_API_KEY is not set in your .env file.');

  const prompt = buildPrompt(userPrompt, products);

  // ── Submit ────────────────────────────────────────────────────────────────
  onStatus('Submitting to Black Forest Labs…');
  console.log(`[BFL] Submitting | model=${BFL_MODEL} | prompt="${prompt.substring(0, 80)}..."`);

  const submitRes = await fetch(`${BFL_BASE_URL}/${BFL_MODEL}`, {
    method: 'POST',
    headers: {
      'X-Key':        apiKey,
      'Content-Type': 'application/json',
      'Accept':       'application/json',
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio:     '1:1',
      output_format:    'jpeg',
      safety_tolerance: 6,
      seed:             Math.floor(Math.random() * 999999999),
    }),
  });

  if (!submitRes.ok) {
    const body = await submitRes.text().catch(() => '');
    throw new Error(`BFL submit failed (${submitRes.status}): ${body.substring(0, 200)}`);
  }

  const submitted    = await submitRes.json();
  const predictionId = submitted.id;
  const pollingUrl   = submitted.polling_url
    || `${BFL_BASE_URL}/get_result?id=${predictionId}`;

  if (!predictionId) {
    throw new Error(`BFL returned no prediction ID: ${JSON.stringify(submitted).substring(0, 200)}`);
  }

  console.log(`[BFL] Submitted | id=${predictionId} | polling=${pollingUrl}`);

  // ── Poll ──────────────────────────────────────────────────────────────────
  onStatus('Generating your design…');

  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((r) => setTimeout(r, POLL_INTERVAL));

    const pollRes = await fetch(pollingUrl, {
      headers: { 'X-Key': apiKey, 'Accept': 'application/json' },
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
          `BFL returned Ready but image URL not found. ` +
          `result=${JSON.stringify(polled.result).substring(0, 300)}`
        );
      }
      console.log(`[BFL] Done | url=${imageUrl.substring(0, 80)}...`);
      return imageUrl;
    }

    if (status === 'Error') {
      throw new Error(`BFL generation error: ${JSON.stringify(polled).substring(0, 200)}`);
    }

    if (status === 'Content Moderated' || status === 'Request Moderated') {
      throw new Error('BFL content moderation triggered. Try a different prompt or room photo.');
    }

    // 'Queued' | 'Processing' — keep polling
  }

  throw new Error('BFL generation timed out after 3 minutes.');
}
