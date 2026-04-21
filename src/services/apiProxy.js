/**
 * apiProxy.js — Routes AI API calls through the Supabase ai-proxy edge function
 * in production builds. In __DEV__, calls APIs directly for fast iteration.
 *
 * Usage:
 *   import { proxyFetch } from './apiProxy';
 *
 *   // Instead of:
 *   //   fetch(url, { headers: { Authorization: `Bearer ${TOKEN}` }, body })
 *   // Use:
 *   //   proxyFetch('replicate', url, { method: 'POST', body: { ... } })
 *
 * The proxy adds the correct auth header server-side — the client never sees
 * the API key in production.
 */
import { supabase } from './supabase';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';

/**
 * Fetch an AI provider API through the secure edge function proxy.
 *
 * @param {'replicate'|'bfl'|'anthropic'|'fal'} provider - Which AI provider
 * @param {string} url - The full API URL (e.g. https://api.replicate.com/v1/...)
 * @param {object} options - { method, body, headers }
 * @returns {Promise<Response>} - The API response (same shape as fetch())
 */
export async function proxyFetch(provider, url, options = {}) {
  // In dev mode, call APIs directly using EXPO_PUBLIC_ keys (faster iteration)
  if (__DEV__) {
    return directFetch(provider, url, options);
  }

  // Production: route through ai-proxy edge function
  const { data: { session } } = await supabase.auth.getSession();
  const jwt = session?.access_token;

  if (!jwt) {
    throw new Error('Authentication required for AI generation.');
  }

  const proxyUrl = `${SUPABASE_URL}/functions/v1/ai-proxy`;

  const response = await fetch(proxyUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${jwt}`,
    },
    body: JSON.stringify({
      provider,
      method: options.method || 'POST',
      url,
      headers: options.headers || {},
      body: options.body || null,
    }),
  });

  // Build 38: 429-aware retry. The ai-proxy enforces a 2-second per-user
  // cooldown (014_rate_limits.sql); our fallback rings (panel → refs → BFL)
  // can fire back-to-back faster than that and previously caused cascading
  // failures with two error popups. When the proxy returns 429 with a
  // `retry_after_ms` hint, we wait that long (+200ms safety) and retry once.
  // This converts a hard failure into a transparent backoff for the caller.
  // Quota-exceeded (402) is intentionally NOT retried — that's a real billing
  // limit, not a transient cooldown.
  if (response.status === 429) {
    const data = await response.json().catch(() => ({}));
    const retryAfterMs = Math.min(Number(data?.retry_after_ms) || 2200, 5000);
    if (retryAfterMs > 0 && !options.__noRetry) {
      console.log('[apiProxy] 429 cooldown — sleeping ' + retryAfterMs + 'ms before retry');
      await new Promise(r => setTimeout(r, retryAfterMs + 200));
      return proxyFetch(provider, url, { ...options, __noRetry: true });
    }
    throw new Error(data.message || 'Please wait a moment between requests.');
  }

  // Check for auth errors
  if (response.status === 401) {
    throw new Error('Session expired. Please sign in again.');
  }

  return response;
}

/**
 * Read an EXPO_PUBLIC_ env var using a COMPUTED key.
 *
 * Metro (Expo's bundler) statically replaces literal `process.env.EXPO_PUBLIC_FOO`
 * access with the string value of that env var at build time. That means any
 * AI keys referenced directly in source would end up INLINED into the shipped
 * production bundle if they happened to be set during `eas build`.
 *
 * Using a computed key (`process.env[prefix + name]`) is opaque to the bundler,
 * so no values are ever inlined. At runtime in dev, JavaScript still resolves
 * the lookup against the injected `process.env` object normally.
 *
 * Also hard-guarded by `__DEV__` so this function is a no-op in production.
 */
function readDevKey(name) {
  if (!__DEV__) return '';
  const prefix = 'EXPO_PUBLIC_';
  try {
    return (typeof process !== 'undefined' && process.env
      ? process.env[prefix + name]
      : '') || '';
  } catch {
    return '';
  }
}

/**
 * Direct fetch for __DEV__ mode — uses EXPO_PUBLIC_ keys from .env.
 * This path is ONLY used during development on the simulator.
 * In production EAS builds, `__DEV__` is false, the hard guard below throws,
 * and the computed-key pattern in readDevKey() prevents Metro from inlining
 * any key values into the shipped bundle.
 */
function directFetch(provider, url, options = {}) {
  // Hard guard — should be dead code in production builds (Metro DCE strips
  // it because the only caller is gated by `if (__DEV__)`).
  if (!__DEV__) {
    throw new Error('directFetch is a development-only helper');
  }

  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  // Inject the correct auth header based on provider
  switch (provider) {
    case 'replicate':
      headers['Authorization'] = `Bearer ${readDevKey('REPLICATE_API_TOKEN')}`;
      break;
    case 'bfl':
      headers['X-Key'] = readDevKey('BFL_API_KEY');
      break;
    case 'anthropic':
      headers['x-api-key'] = readDevKey('ANTHROPIC_API_KEY');
      headers['anthropic-version'] = '2023-06-01';
      break;
    case 'fal':
      headers['Authorization'] = `Key ${readDevKey('FAL_API_KEY')}`;
      break;
  }

  const fetchOptions = {
    method: options.method || 'POST',
    headers,
  };

  if (options.body && fetchOptions.method !== 'GET') {
    fetchOptions.body = JSON.stringify(options.body);
  }

  return fetch(url, fetchOptions);
}
