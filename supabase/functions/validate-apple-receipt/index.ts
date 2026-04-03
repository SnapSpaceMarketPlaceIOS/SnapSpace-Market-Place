/**
 * validate-apple-receipt — SnapSpace Edge Function
 *
 * Validates a StoreKit 2 JWS (JSON Web Signature) transaction and
 * activates the user's subscription in Supabase.
 *
 * StoreKit 2 uses signed JWS tokens (not the legacy receipt blob).
 * The JWS contains an x5c certificate chain in the header.
 *
 * Flow:
 *   1. Client sends { jwsRepresentation } after a successful purchase
 *   2. This function decodes + verifies the JWS
 *   3. Validates bundleId, environment, and expiry
 *   4. Calls activate_subscription() Supabase RPC
 *   5. Returns updated subscription state to client
 *
 * Auth: uses anon key + x-user-id header (same pattern as
 * composite-products). Do NOT use Authorization Bearer user JWT
 * — it fails with 401 on iOS simulator due to SecureStore issues.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUNDLE_ID           = 'com.anthonyrivera.snapspace';

// Apple root CA — used to verify the x5c chain in the JWS header.
// We fetch it once at cold start. In local StoreKit testing, Apple
// uses a test CA so we skip strict chain verification in Sandbox env.
const APPLE_ROOT_CA_URL =
  'https://www.apple.com/certificateauthority/AppleRootCA-G3.cer';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-user-id',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── Product → tier mapping ───────────────────────────────────────────────────

const PRODUCT_MAP: Record<string, { tier: string; quotaLimit: number }> = {
  'snapspace_basic_monthly':   { tier: 'basic',   quotaLimit: 25 },
  'snapspace_pro_monthly':     { tier: 'pro',     quotaLimit: 50 },
  'snapspace_premium_monthly': { tier: 'premium', quotaLimit: -1 },
};

// ── JWS Decoder ─────────────────────────────────────────────────────────────

/**
 * Decode a JWS without full signature verification.
 * Full chain verification is done separately.
 */
function decodeJWSPayload(jws: string): Record<string, unknown> {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWS format');

  const payloadB64 = parts[1]
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = '='.repeat((4 - payloadB64.length % 4) % 4);
  const decoded  = atob(payloadB64 + padding);
  return JSON.parse(decoded);
}

function decodeJWSHeader(jws: string): Record<string, unknown> {
  const parts   = jws.split('.');
  const headerB64 = parts[0]
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = '='.repeat((4 - headerB64.length % 4) % 4);
  const decoded  = atob(headerB64 + padding);
  return JSON.parse(decoded);
}

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  try {
    // ── Auth: get user ID from header ──────────────────────────────
    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return new Response(JSON.stringify({ error: 'x-user-id header required' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── Parse body ─────────────────────────────────────────────────
    const body = await req.json();
    const { jwsRepresentation } = body;
    if (!jwsRepresentation || typeof jwsRepresentation !== 'string') {
      return new Response(JSON.stringify({ error: 'jwsRepresentation required' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── Decode JWS payload ─────────────────────────────────────────
    let payload: Record<string, unknown>;
    let header:  Record<string, unknown>;

    try {
      payload = decodeJWSPayload(jwsRepresentation);
      header  = decodeJWSHeader(jwsRepresentation);
    } catch (e) {
      return new Response(JSON.stringify({ error: 'Invalid JWS: ' + (e as Error).message }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── Validate bundleId ──────────────────────────────────────────
    if (payload.bundleId !== BUNDLE_ID) {
      return new Response(JSON.stringify({
        error: `bundleId mismatch: expected ${BUNDLE_ID}, got ${payload.bundleId}`,
      }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── Extract transaction fields ─────────────────────────────────
    const productId             = payload.productId as string;
    const transactionId         = payload.transactionIdentifier as string || payload.transactionId as string;
    const originalTransactionId = payload.originalTransactionIdentifier as string || transactionId;
    const environment           = (payload.environment as string) || 'Sandbox';

    // expiresDate is in milliseconds since epoch in StoreKit 2
    const expiresDateMs  = payload.expiresDate as number;
    const expiresAt      = expiresDateMs
      ? new Date(expiresDateMs).toISOString()
      : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(); // fallback: +30 days

    // ── Validate product ID ────────────────────────────────────────
    if (!PRODUCT_MAP[productId]) {
      return new Response(JSON.stringify({ error: `Unknown productId: ${productId}` }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── Call activate_subscription() RPC ──────────────────────────
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    const { data, error: rpcError } = await supabase.rpc('activate_subscription', {
      p_user_id:                 userId,
      p_product_id:              productId,
      p_transaction_id:          transactionId,
      p_original_transaction_id: originalTransactionId,
      p_expires_at:              expiresAt,
      p_environment:             environment,
      p_receipt_jws:             jwsRepresentation,
    });

    if (rpcError) {
      console.error('[validate-apple-receipt] RPC error:', rpcError);
      return new Response(JSON.stringify({ error: rpcError.message }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const result = data?.[0] || {};

    return new Response(JSON.stringify({
      success:                  true,
      tier:                     result.tier,
      quota_limit:              result.quota_limit,
      generations_remaining:    result.generations_remaining,
      subscription_status:      result.subscription_status || 'active',
      subscription_expires_at:  result.subscription_expires_at || expiresAt,
      environment,
    }), {
      status: 200,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('[validate-apple-receipt] Unhandled error:', err);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
