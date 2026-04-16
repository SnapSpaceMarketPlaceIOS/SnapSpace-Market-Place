/**
 * HomeGenie — Purchase Tracking Service (Backend Only, No UI Impact)
 *
 * Silent attribution layer for promotional wish credits.
 *
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Security model:                                                 │
 * │                                                                 │
 * │  Clients DO NOT insert rows into affiliate_clicks directly.    │
 * │  They call the `log_affiliate_click` SECURITY DEFINER RPC       │
 * │  which generates the subtag SERVER-SIDE using true crypto       │
 * │  randomness and inserts the row under service-role privileges.  │
 * │  This makes it impossible for a client to forge a subtag to     │
 * │  hijack another user's purchase attribution.                    │
 * │                                                                 │
 * │  What this layer does:                                          │
 * │  ✓ On a Shop Now tap, calls log_affiliate_click which returns   │
 * │    a server-generated subtag.                                   │
 * │  ✓ Appends `ascsubtag=<subtag>` to the Amazon URL — NEVER       │
 * │    touches the existing `tag=` partner identifier.              │
 * │  ✓ Non-Amazon URLs pass through unchanged.                      │
 * │  ✓ Logged-out users pass through unchanged.                     │
 * │  ✓ Any failure (network, RPC error, timeout) falls back to the  │
 * │    original URL — revenue is never lost.                        │
 * └─────────────────────────────────────────────────────────────────┘
 */

import { supabase } from './supabase';

const RPC_TIMEOUT_MS = 1200;

/** Detect whether a URL is an Amazon affiliate link. Strict hostname match. */
function detectNetwork(url) {
  if (!url || typeof url !== 'string') return 'other';
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return 'other';
  }
  // Strict suffix match on known hosts — no substring hacks.
  if (
    host === 'amazon.com' || host.endsWith('.amazon.com') ||
    host === 'amazon.ca'  || host.endsWith('.amazon.ca')  ||
    host === 'amazon.co.uk' || host.endsWith('.amazon.co.uk') ||
    host === 'amzn.to'    || host.endsWith('.amzn.to')
  ) {
    return 'amazon';
  }
  return 'other';
}

/** Extract hostname for audit logging. */
function extractHost(url) {
  try {
    return new URL(url).host;
  } catch {
    return null;
  }
}

/**
 * Append ascsubtag to an Amazon URL WITHOUT touching any existing params.
 * Handles fragments correctly: `https://a.com/x#y` → `https://a.com/x?ascsubtag=z#y`
 * The fragment stays attached to the URL proper.
 *
 * Uses the URL class for safe insertion — no string surgery that could
 * put params inside a fragment or break on exotic encoding.
 */
function appendAmazonSubtag(url, subtag) {
  if (!url || !subtag) return url;
  try {
    const u = new URL(url);
    // Don't override an existing ascsubtag (defensive)
    if (u.searchParams.has('ascsubtag')) return url;
    u.searchParams.set('ascsubtag', subtag);
    return u.toString();
  } catch {
    // URL parsing failed — return the original URL unchanged
    return url;
  }
}

/** Race a promise against a timeout, resolving to undefined on timeout. */
function raceWithTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(undefined), ms)),
  ]);
}

/**
 * Log an affiliate click via server-side RPC and return the URL with
 * ascsubtag appended. Non-Amazon URLs, logged-out users, and missing URLs
 * all flow through unchanged.
 *
 * Any failure (network, RPC, timeout) returns the original URL — the user's
 * tap-to-Amazon handoff is never blocked or delayed beyond RPC_TIMEOUT_MS.
 *
 * @param {object}  opts
 * @param {string}  opts.userId   Supabase auth user id (required for attribution)
 * @param {string}  opts.url      Original affiliate URL from the product catalog
 * @param {object}  opts.product  Product object (for product_id / asin in the log)
 * @returns {Promise<string>}     URL (with subtag appended for Amazon) or original on any failure
 */
export async function trackAffiliateClickAndTagUrl({ userId, url, product }) {
  if (!url) return url;
  if (!userId) return url;

  const network = detectNetwork(url);
  if (network !== 'amazon') return url;

  try {
    // Server generates the subtag using crypto-random gen_random_uuid()
    // and inserts the click row atomically under service privileges.
    const rpcPromise = supabase.rpc('log_affiliate_click', {
      p_product_id: product?.id   ?? null,
      p_asin:       product?.asin ?? null,
      p_network:    'amazon',
      p_dest_host:  extractHost(url),
    });

    const result = await raceWithTimeout(rpcPromise, RPC_TIMEOUT_MS);
    if (!result || result.error || !result.data) {
      if (result?.error) {
        console.warn('[PurchaseTracking] log_affiliate_click RPC error:', result.error.message);
      }
      return url; // fall back to original URL on any failure
    }

    const subtag = result.data;
    if (typeof subtag !== 'string' || subtag.length === 0) return url;

    return appendAmazonSubtag(url, subtag);
  } catch (e) {
    console.warn('[PurchaseTracking] click tag threw (non-fatal):', e?.message || e);
    return url;
  }
}
