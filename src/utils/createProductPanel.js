/**
 * HomeGenie — Product Panel Compositor (client-side utility)
 *
 * Calls the composite-products Supabase Edge Function to stitch up to 4
 * product reference images into a single 512×512 2×2 panel JPEG.
 *
 * Why: flux-2-max charges per input megapixel and scales GPU time with input
 * complexity. Sending 2 images (room + panel) instead of 5 (room + 4 individual
 * products) reduces attention compute by ~40-50%, targeting ~$0.15/gen vs $0.31.
 *
 * Panel layout (each cell 256×256 px):
 *   ┌──────────┬──────────┐
 *   │ product1 │ product2 │
 *   ├──────────┼──────────┤
 *   │ product3 │ product4 │
 *   └──────────┴──────────┘
 *
 * The calling code (HomeScreen.js) falls back to individual product images if
 * this function returns null — no generation is ever blocked by panel failure.
 *
 * @param {object[]} products  Array of products (each with an imageUrl string)
 * @param {string}   userId    Auth user ID (used for the Storage path)
 * @returns {Promise<string|null>} Public URL of the composite panel, or null on failure
 */

import { supabase } from '../services/supabase';

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ANON_KEY      = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const FUNCTION_URL  = `${SUPABASE_URL}/functions/v1/composite-products`;
const MIN_PRODUCTS  = 2;   // panel isn't worth building for < 2 images
const SEND_LIMIT    = 6;   // send up to 6 URLs so edge fn has backup slots if any fail
const MAX_RETRIES   = 2;   // retry once on failure (cold starts, transient errors)

/**
 * Rewrite a Supabase /storage/v1/object/public/... URL to the equivalent
 * /storage/v1/render/image/public/... URL, which forces the server to
 * decode and re-emit the image as JPEG (or a requested format) regardless
 * of how the bytes are stored. This is the fix for the iOS 26 AVIF bug:
 * Cloudflare serves stored bytes as AVIF to clients sending Accept headers
 * that permit it, and flux-2-max rejects AVIF with E006. The render endpoint
 * bypasses that entirely.
 *
 * Non-Supabase URLs are returned unchanged.
 */
function toRenderUrl(url) {
  if (typeof url !== 'string') return url;
  const marker = '/storage/v1/object/public/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url; // not a Supabase object URL
  const head = url.slice(0, idx);
  const tail = url.slice(idx + marker.length); // "<bucket>/<path>?maybe=query"
  // Strip any existing query so we can append our own deterministically
  const [tailPath, tailQuery] = tail.split('?');
  const sep = tailQuery ? '&' : '';
  return `${head}/storage/v1/render/image/public/${tailPath}?width=1024&quality=90${sep}${tailQuery || ''}`;
}

export async function createProductPanel(products, userId) {
  // ── Guard: requires products with image URLs ──────────────────────────────
  if (!products || products.length === 0) {
    console.warn('[Panel] No products provided');
    return null;
  }
  if (!userId) {
    console.warn('[Panel] No userId — cannot create panel (storage path requires user ID)');
    return null;
  }

  // Collect valid public HTTP image URLs from matched products.
  // Send up to SEND_LIMIT (6) so the edge function has backup slots — if any
  // URL returns a non-image response (broken ASIN, etc.) the edge fn skips it
  // and fills the 2×2 grid from the remaining URLs. This guarantees 4 filled
  // cells as long as at least 4 of the 6 URLs are valid.
  //
  // Use 1500px Amazon sources (not 300px) so the panel's 256×256 cells have
  // sharp detail after Lanczos downsampling. The edge function resizes to
  // 256×256 regardless, so the download is a one-time cost — and Replicate
  // only sees the final 512×512 panel, so per-input MP billing is unchanged.
  // Quality win: sharper product detail in attention map → sharper render.
  const productUrls = products
    .filter(p => p.imageUrl && typeof p.imageUrl === 'string' && p.imageUrl.startsWith('http'))
    .slice(0, SEND_LIMIT)
    .map(p => p.imageUrl
      .replace(/_AC_SL\d+_/g,  '_AC_SL1500_')
      .replace(/_AC_UL\d+_/g,  '_AC_SL1500_')
      .replace(/_SX\d+_/g,     '_AC_SL1500_')
      .replace(/_SR\d+,\d+_/g, '_AC_SL1500_')
    );

  if (productUrls.length < MIN_PRODUCTS) {
    console.warn(`[Panel] Only ${productUrls.length} valid image URL(s) — need at least ${MIN_PRODUCTS} to build a panel`);
    return null;
  }

  console.log(`[Panel] Requesting 2×2 panel | ${productUrls.length} products | user=${userId}`);
  productUrls.forEach((url, i) => console.log(`[Panel] Product ${i + 1}: ${url.substring(0, 80)}`));

  // ── Resolve a fresh user JWT ─────────────────────────────────────────────
  // Composite-products now requires a verified user JWT (previously accepted
  // anon key only). We read the current session once and reuse its access
  // token across retries. If no session is available, fall back to the anon
  // key — the edge function will return 401 and the client falls back to
  // individual product images, which is the same outcome as a panel failure.
  let userJwt = ANON_KEY;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.access_token) userJwt = session.access_token;
  } catch (e) {
    console.warn('[Panel] Could not read session token, using anon key:', e?.message || e);
  }

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${userJwt}`,
          'apikey':         ANON_KEY,
          'Content-Type':   'application/json',
        },
        body: JSON.stringify({
          product_urls: productUrls,
          user_id:      userId,
        }),
      });

      if (!res.ok) {
        let bodyText = '';
        try { bodyText = await res.text(); } catch { /* ignore */ }
        console.warn(
          `[Panel] Attempt ${attempt}/${MAX_RETRIES} failed | ` +
          `HTTP ${res.status} | body=${bodyText || '(empty)'}`
        );

        // Retry on server errors (5xx) — not on client errors (4xx)
        if (attempt < MAX_RETRIES && res.status >= 500) {
          console.log(`[Panel] Retrying in 1.5s (cold start recovery)...`);
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        return null;
      }

      const data = await res.json();

      if (!data?.url) {
        console.warn(`[Panel] Attempt ${attempt}: Edge function returned no URL | data=${JSON.stringify(data)}`);
        if (attempt < MAX_RETRIES) {
          await new Promise(r => setTimeout(r, 1500));
          continue;
        }
        return null;
      }

      // Force the panel URL through Supabase's /render/image/ transform endpoint
      // so flux-2-max always receives clean JPEG bytes. Cloudflare occasionally
      // serves stored JPEGs as AVIF based on client Accept headers, which
      // flux-2-max rejects with E006 "invalid input". The render endpoint
      // guarantees a JPEG regardless of the underlying storage format.
      const renderUrl = toRenderUrl(data.url);

      console.log(`[Panel] Panel ready (attempt ${attempt}) | composited=${data.composited_count ?? '?'} | url=${renderUrl.substring(0, 80)}`);
      return renderUrl;

    } catch (err) {
      // Network failure, timeout, or Deno crash — retry once
      console.warn(`[Panel] Attempt ${attempt}/${MAX_RETRIES} exception: ${err?.message || err}`);
      if (attempt < MAX_RETRIES) {
        console.log(`[Panel] Retrying in 1.5s...`);
        await new Promise(r => setTimeout(r, 1500));
        continue;
      }
      return null;
    }
  }

  return null;
}
