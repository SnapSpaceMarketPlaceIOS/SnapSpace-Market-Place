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

const SUPABASE_URL  = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const ANON_KEY      = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const FUNCTION_URL  = `${SUPABASE_URL}/functions/v1/composite-products`;
const MIN_PRODUCTS  = 2;   // panel isn't worth building for < 2 images
const SEND_LIMIT    = 6;   // send up to 6 URLs so edge fn has backup slots if any fail
const MAX_RETRIES   = 2;   // retry once on failure (cold starts, transient errors)

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
  // Shrink Amazon _SL1500_ → _SL300_ so the edge function downloads 0.09 MP
  // per image instead of 2.25 MP — faster fetch + smaller composite output.
  const productUrls = products
    .filter(p => p.imageUrl && typeof p.imageUrl === 'string' && p.imageUrl.startsWith('http'))
    .slice(0, SEND_LIMIT)
    .map(p => p.imageUrl
      .replace(/_AC_SL\d+_/g,  '_AC_SL300_')
      .replace(/_AC_UL\d+_/g,  '_AC_SL300_')
    );

  if (productUrls.length < MIN_PRODUCTS) {
    console.warn(`[Panel] Only ${productUrls.length} valid image URL(s) — need at least ${MIN_PRODUCTS} to build a panel`);
    return null;
  }

  console.log(`[Panel] Requesting 2×2 panel | ${productUrls.length} products | user=${userId}`);
  productUrls.forEach((url, i) => console.log(`[Panel] Product ${i + 1}: ${url.substring(0, 80)}`));

  // ── Call edge function directly with anon key (bypasses user JWT issues) ──
  // supabase.functions.invoke sends the user's session JWT which can be stale
  // or invalid after storage adapter changes. The composite function only needs
  // the anon key — it uses the service role key internally for storage uploads.
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(FUNCTION_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${ANON_KEY}`,
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

      console.log(`[Panel] Panel ready (attempt ${attempt}) | composited=${data.composited_count ?? '?'} | url=${data.url.substring(0, 80)}`);
      return data.url;

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
