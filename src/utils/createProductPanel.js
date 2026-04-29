/**
 * HomeGenie — Product Panel Compositor (client-side utility)
 *
 * Calls the composite-products Supabase Edge Function to stitch up to 4
 * product reference images into a single 1280×1280 2×2 panel JPEG with white
 * gutters between cells (Phase 0 / edge fn v9).
 *
 * Why: flux-2-pro/edit reads the panel as 4 distinct product references
 * instead of one composite image, improving 4/4 fidelity in renders. The
 * client always sends 1 panel + 1 room photo regardless of panel resolution,
 * so per-call FAL cost stays at $0.06.
 *
 * Panel layout (each cell 620×620 px, 20px gutter, 10px outer):
 *   ┌──┬──────────┬──┬──────────┬──┐
 *   │  │ product1 │  │ product2 │  │
 *   │  │          │  │          │  │
 *   │  ├──────────┘  └──────────┤  │
 *   │  ├──────────┐  ┌──────────┤  │
 *   │  │ product3 │  │ product4 │  │
 *   └──┴──────────┴──┴──────────┴──┘
 *
 * The calling code (HomeScreen.js) falls back to individual product images if
 * this function returns null — no generation is ever blocked by panel failure.
 *
 * @param {object[]} products  Array of products (each with an imageUrl string)
 * @param {string}   userId    Auth user ID (used for the Storage path)
 * @returns {Promise<{url: string, compositedIndices: number[] | null} | null>}
 *          Panel URL + indices of which input products ended up in the
 *          panel (so the caller can show the exact 4 in Shop Your Room).
 *          Returns null on failure.
 */

import { supabase } from '../services/supabase';

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ANON_KEY      = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const FUNCTION_URL  = `${SUPABASE_URL}/functions/v1/composite-products`;
const MIN_PRODUCTS  = 2;   // panel isn't worth building for < 2 images
const SEND_LIMIT    = 6;   // send up to 6 URLs so edge fn has backup slots if any fail
const MAX_RETRIES   = 2;   // retry once on failure (cold starts, transient errors)

/**
 * ⚠️ Historical note — no longer applied to panel URLs (2026-04-17).
 *
 * This helper rewrites a Supabase /storage/v1/object/public/... URL to the
 * equivalent /storage/v1/render/image/public/...?format=origin URL. The
 * original motivation: when an iOS 26 Safari client requests a stored JPEG,
 * Cloudflare can re-serve it as AVIF based on the `Accept` header. flux-2-max
 * rejects AVIF with E006 "invalid input". Forcing the URL through the
 * /render/image/ endpoint with `format=origin` makes Supabase serve the
 * original stored bytes with a correct `Content-Type: image/jpeg` header.
 *
 * Why we stopped using it for PANELS:
 *   The /render/image/ endpoint is Supabase's image-processing pipeline.
 *   Even with `format=origin`, there's per-request overhead: the Supabase
 *   image server loads the object, inspects it, re-validates the content-
 *   type, and serves. On a freshly-uploaded file with a cold cache, this
 *   can take 5-10+ seconds — longer than Replicate's 10-second download
 *   timeout when fetching input images. Result: panel URLs were timing
 *   out inside flux-2-max with "Read timed out. (read timeout=10)" and
 *   the client fell back to the expensive individual-products path
 *   ($0.25/gen instead of the targeted $0.13). See Apr 17 2026 bug report.
 *
 *   Panels don't actually need this transform: we encode them as pure
 *   JPEG in the composite-products edge function (jpeg-js, content-type
 *   set explicitly on upload), so Cloudflare never has a reason to
 *   negotiate AVIF for panel files. The /object/public/ direct-serve
 *   path is both correct and fast.
 *
 * Why we KEEP the function:
 *   It may still be needed for USER ROOM PHOTOS, which are uploaded by
 *   mobile clients as JPEG but can be re-negotiated to AVIF at the CDN
 *   layer. If you need to rewrite a room-upload URL for that reason,
 *   call toRenderUrl() explicitly at the caller site. (Today, HomeScreen
 *   passes the raw room-upload URL directly to ai-proxy; if that ever
 *   starts hitting E006, revisit this.)
 *
 * Non-Supabase URLs are returned unchanged.
 */
function toRenderUrl(url) { // eslint-disable-line no-unused-vars
  if (typeof url !== 'string') return url;
  const marker = '/storage/v1/object/public/';
  const idx = url.indexOf(marker);
  if (idx === -1) return url; // not a Supabase object URL
  const head = url.slice(0, idx);
  const tail = url.slice(idx + marker.length); // "<bucket>/<path>?maybe=query"
  const [tailPath, tailQuery] = tail.split('?');
  const sep = tailQuery ? '&' : '';
  return `${head}/storage/v1/render/image/public/${tailPath}?format=origin${sep}${tailQuery || ''}`;
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
  // Use 1500px Amazon sources (not 300px) so the panel's 620×620 cells have
  // sharp detail after Lanczos downsampling. The edge function letterbox-fits
  // each source to ≤620×620 (preserving aspect ratio), so the 1500px request
  // is a one-time cost — and FAL only sees the final 1280×1280 panel JPEG,
  // so per-input billing is unchanged. Quality win: sharper product detail
  // in flux's attention map → 4/4 fidelity in the render.
  //
  // Source-image precedence for the panel composite:
  //
  //   1. Variant swap wins. If productMatcher.js (Build 71 Fix #2) swapped
  //      the product to a specific variant, p.imageUrl already points at
  //      that variant's mainImage — typically a clean studio shot of the
  //      exact color the user asked for. We must NOT override that with
  //      a catalog-level panelImageUrl, because the variant photo is the
  //      whole point of the swap (it's both the most accurate panel
  //      source AND what the user will actually see in their cart).
  //
  //   2. Catalog override. If the product carries an optional
  //      `panelImageUrl` field, prefer that for the AI panel composite
  //      ONLY. Used to override a default `imageUrl` that's a busy
  //      lifestyle shot, a tightly-cropped detail, or otherwise gives
  //      flux a poor silhouette to work with. The catalog UI keeps
  //      showing `imageUrl` so the shopper-facing surface stays rich.
  //
  //   3. Default. Fall back to `imageUrl` — the current behavior for
  //      every product that has no panelImageUrl set, which is the
  //      whole catalog at the time this hook was added. Existing
  //      products behave exactly as before.
  const pickPanelSource = (p) => {
    if (p._matchedVariant) return p.imageUrl;
    if (typeof p.panelImageUrl === 'string' && p.panelImageUrl.startsWith('http')) {
      return p.panelImageUrl;
    }
    return p.imageUrl;
  };
  const productUrls = products
    .map(pickPanelSource)
    .filter((url) => typeof url === 'string' && url.startsWith('http'))
    .slice(0, SEND_LIMIT)
    .map((url) => url
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

      // Return the RAW /storage/v1/object/public/ URL that the edge function
      // generated via getPublicUrl(). Previously we wrapped this with
      // toRenderUrl() (/render/image/?format=origin) to avoid Cloudflare AVIF
      // negotiation — but that put the fetch through Supabase's image-
      // processing pipeline, which on cold cache takes 5-10+ seconds and
      // caused Replicate's flux-2-max to hit its 10-second input-download
      // timeout. Every panel generation was silently failing and falling
      // back to the expensive individual-products path ($0.25 vs the
      // targeted $0.13). See toRenderUrl() comment above for full history.
      //
      // Panels are safe to serve via the raw object endpoint because we
      // encode them server-side as pure JPEG in composite-products/index.ts
      // and set `contentType: "image/jpeg"` explicitly on upload. Cloudflare
      // has no basis to negotiate AVIF for files we've already committed as
      // JPEG, regardless of the fetcher's Accept header.
      const panelUrl = data.url;

      // compositedIndices tells the caller which of the INPUT productUrls
      // actually ended up as cells in the panel. The caller uses this to
      // show exactly the same 4 products in "Shop Your Room" — no drift
      // when a URL fails mid-pool and a backup slot fills the cell.
      const compositedIndices = Array.isArray(data.composited_indices)
        ? data.composited_indices
        : null;

      console.log(
        `[Panel] Panel ready (attempt ${attempt}) | ` +
        `composited=${data.composited_count ?? '?'} | ` +
        `indices=[${compositedIndices?.join(',') ?? '?'}] | ` +
        `url=${panelUrl.substring(0, 80)} | ` +
        `endpoint=object-public (not render/image — fixes Replicate 10s timeout)`
      );
      return { url: panelUrl, compositedIndices };

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
