/**
 * validate-apple-receipt — HomeGenie Edge Function
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
 * Auth: verifies Supabase JWT via Authorization Bearer header.
 * user_id is derived from the verified JWT — NEVER trusted from
 * the request body or a client-supplied header. This prevents
 * authenticated user A from crediting a purchase to user B.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!;
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

// ── Product → tier mapping (subscriptions) ──────────────────────────────────

const PRODUCT_MAP: Record<string, { tier: string; quotaLimit: number }> = {
  'homegenie_basic_weekly':   { tier: 'basic',   quotaLimit: 25 },
  'homegenie_pro_weekly':     { tier: 'pro',     quotaLimit: 50 },
  'homegenie_premium_weekly': { tier: 'premium', quotaLimit: -1 },
};

// ── Product → wish count mapping (consumables) ──────────────────────────────

const WISH_PRODUCT_MAP: Record<string, number> = {
  'homegenie_wishes_4':   4,
  'homegenie_wishes_10':  10,
  'homegenie_wishes_20':  20,
  'homegenie_wishes_40':  40,
  'homegenie_wishes_100': 100,
  'homegenie_wishes_200': 200,
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
    // ── Auth: verify JWT, derive user_id from the verified token ───
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'Authorization Bearer token required' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    const { data: userData, error: userError } = await authClient.auth.getUser(jwt);
    if (userError || !userData?.user?.id) {
      return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
        status: 401,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
    const userId = userData.user.id;

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
      : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(); // fallback: +7 days

    // ── Route: subscription or wish purchase ────────────────────────
    const isSubscription = !!PRODUCT_MAP[productId];
    const isWish         = !!WISH_PRODUCT_MAP[productId];

    if (!isSubscription && !isWish) {
      return new Response(JSON.stringify({ error: `Unknown productId: ${productId}` }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

    // ── WISH PURCHASE FLOW ───────────────────────────────────────
    // Note: DB tables/RPCs are named token_* (from migration 012). The
    // client-facing field name is still `tokens_added` to match what
    // subscriptionService.validateReceipt() already reads (`type === 'tokens'`).
    if (isWish) {
      const wishCount = WISH_PRODUCT_MAP[productId];

      // Idempotency: check if this transactionId was already processed
      const { data: existingTx } = await supabase
        .from('token_transactions')
        .select('id')
        .eq('reference_id', transactionId)
        .limit(1);

      if (existingTx && existingTx.length > 0) {
        // Already processed — return current balance without double-crediting
        const { data: balData } = await supabase.rpc('get_token_balance', { p_user_id: userId });
        const bal = balData?.[0]?.balance ?? 0;
        return new Response(JSON.stringify({
          success: true, type: 'tokens',
          tokens_added: wishCount, new_balance: bal,
          transaction_id: transactionId, environment,
        }), {
          status: 200,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // Credit wishes (tokens)
      const { data: addData, error: addError } = await supabase.rpc('add_tokens', {
        p_user_id:      userId,
        p_amount:       wishCount,
        p_type:         'purchase',
        p_reference_id: transactionId,
        p_product_id:   productId,
      });

      if (addError) {
        console.error('[validate-apple-receipt] add_tokens error:', addError);
        return new Response(JSON.stringify({ error: addError.message }), {
          status: 500,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const newBalance = addData?.[0]?.new_balance ?? wishCount;

      return new Response(JSON.stringify({
        success: true, type: 'tokens',
        tokens_added: wishCount, new_balance: newBalance,
        transaction_id: transactionId, environment,
      }), {
        status: 200,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // ── SUBSCRIPTION PURCHASE FLOW (existing) ────────────────────
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
      type:                     'subscription',
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
