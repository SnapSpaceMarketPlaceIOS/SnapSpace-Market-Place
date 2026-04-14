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

  // Check for rate limiting
  if (response.status === 429) {
    const data = await response.json();
    throw new Error(data.message || 'Please wait a moment between requests.');
  }

  // Check for auth errors
  if (response.status === 401) {
    throw new Error('Session expired. Please sign in again.');
  }

  return response;
}

/**
 * Direct fetch for __DEV__ mode — uses EXPO_PUBLIC_ keys from .env.
 * This path is ONLY used during development on the simulator.
 * In production EAS builds, these env vars are NOT configured, so
 * proxyFetch() routes through the edge function instead.
 */
function directFetch(provider, url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };

  // Inject the correct auth header based on provider
  switch (provider) {
    case 'replicate':
      headers['Authorization'] = `Bearer ${process.env.EXPO_PUBLIC_REPLICATE_API_TOKEN}`;
      break;
    case 'bfl':
      headers['X-Key'] = process.env.EXPO_PUBLIC_BFL_API_KEY;
      break;
    case 'anthropic':
      headers['x-api-key'] = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY;
      headers['anthropic-version'] = '2023-06-01';
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
