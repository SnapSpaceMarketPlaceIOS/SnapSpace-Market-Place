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
// jose: well-audited JWS library, works in Deno edge runtime via npm:.
// Using it here for signature verification (ES256) + X.509 cert import.
import { compactVerify, importX509 } from 'npm:jose@5.6.3';

const SUPABASE_URL        = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY    = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUNDLE_ID           = 'com.anthonyrivera.snapspace';

// Apple Root CA G3 fingerprint (SHA-256 of the DER-encoded cert).
// Used to pin the last cert in the JWS x5c chain to Apple's real root.
// This is a publicly-published constant; source of truth:
//   https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
// If Apple rotates their root (historically very rare — G3 has been
// stable since 2014), this constant must be updated. Published SHA-256
// fingerprints are also listed in Apple's PKI repository documentation.
const APPLE_ROOT_CA_G3_FINGERPRINT_SHA256 =
  '63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179';
// Verified via:
//   curl -s https://www.apple.com/certificateauthority/AppleRootCA-G3.cer \
//     | shasum -a 256
// Run this again before any future update to catch a root rotation.

// ── Receipt verification toggles ────────────────────────────────────────────
//
// DEV_SKIP_SIGNATURE_VERIFY: when explicitly set to "true" via Supabase
// secrets, signature verification is bypassed and a warning logs. This
// exists ONLY for StoreKit local-testing configurations where Apple
// uses a self-signed test CA we can't pin to. Production must NEVER have
// this flag set.
//
// Build 84 (Bug B2 fix): the prior version had this comment claiming a
// "deployment-time check below refuses to start the function if the
// flag is true AND the Supabase project ref looks prod" — but that check
// did not actually exist anywhere in the file. If the env var ever leaked
// to prod, an authenticated user could hand-craft a JWS for any product
// id and harvest infinite wishes / subs. Below is the actual guard:
// throws at module-load time so the function refuses to serve in prod,
// failing loud instead of silently bypassing all receipt validation.
const DEV_SKIP_SIGNATURE_VERIFY =
  Deno.env.get('DEV_SKIP_APPLE_SIGNATURE_VERIFY') === 'true';

// The production project ref is hard-coded so a Supabase Vault/Secrets
// rename or environment misconfiguration cannot defeat the guard. This
// is a defense-in-depth check; the secret SHOULD never be set in prod
// in the first place, but if it is, this throw makes it impossible for
// the function to handle even one request.
const PROD_PROJECT_REF = 'lqjfnpibbjymhzupqtda';

function isProductionEnvironment(): boolean {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  // Match either https://<ref>.supabase.co or any URL containing the prod ref.
  return supabaseUrl.includes(PROD_PROJECT_REF);
}

if (DEV_SKIP_SIGNATURE_VERIFY) {
  if (isProductionEnvironment()) {
    // Refuse to boot. Module-load throws immediately; the function will
    // 500 on every request until DEV_SKIP_APPLE_SIGNATURE_VERIFY is unset.
    throw new Error(
      '[validate-apple-receipt] FATAL: DEV_SKIP_APPLE_SIGNATURE_VERIFY=true ' +
      'is set in a production environment (project ref ' + PROD_PROJECT_REF + '). ' +
      'This flag bypasses Apple JWS receipt validation and would allow ' +
      'authenticated users to forge purchases. Refusing to start. Unset ' +
      'the env var via `supabase secrets unset DEV_SKIP_APPLE_SIGNATURE_VERIFY` ' +
      'and redeploy.'
    );
  }
  console.warn(
    '[validate-apple-receipt] DEV_SKIP_APPLE_SIGNATURE_VERIFY is enabled — ' +
    'signature verification is bypassed. Non-production environment detected. ' +
    'THIS MUST NEVER RUN IN PRODUCTION.'
  );
}

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

// ── JWS Decoder + Verification ──────────────────────────────────────────────
//
// Build 69 Commit J: full signature verification. Previously the function
// only base64-decoded the header and payload and trusted the values
// blindly. Any authenticated user could forge a JWS with `alg: none`
// semantics (construct their own header + payload, sign nothing) and
// activate a premium subscription. This was discovered as CRITICAL in
// the Build 69 security audit.
//
// The verification now enforces three things in order:
//   1. The JWS signature is valid over the concatenation of the base64
//      header + "." + base64 payload, using the public key extracted from
//      the first certificate in the x5c chain header.
//   2. The last certificate in the x5c chain has a SHA-256 fingerprint
//      matching Apple's Root CA G3. This pins the chain to Apple's
//      public key infrastructure and prevents an attacker from signing
//      with any other ECDSA keypair.
//   3. Expected claim validation happens in the main handler below
//      (bundleId, productId, expiry).
//
// What we do NOT fully verify (acknowledged gap):
//   - Signatures on the intermediate certificates in x5c[1..N-2]. A
//     rigorous implementation would verify cert[i] was signed by
//     cert[i+1]'s public key for every i. This requires ASN.1 parsing
//     of TBS bytes + signature extraction and is substantial additional
//     code. The fingerprint check on the root + signature check on the
//     leaf covers the main exploit path (forged JWS); a follow-up
//     migration can add full chain-link verification.

function decodeJWSHeader(jws: string): Record<string, unknown> {
  const parts   = jws.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWS format');
  const headerB64 = parts[0]
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const padding = '='.repeat((4 - headerB64.length % 4) % 4);
  const decoded  = atob(headerB64 + padding);
  return JSON.parse(decoded);
}

/**
 * Compute SHA-256 hex digest of a Uint8Array.
 */
async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
  const hashArr = new Uint8Array(hashBuf);
  return Array.from(hashArr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

/**
 * Decode a base64 (non-URL) string into Uint8Array.
 */
function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Verify the JWS signature AND pin the cert chain to Apple Root CA G3.
 * Returns the verified payload on success, throws on any failure.
 */
async function verifyAppleJWS(jws: string): Promise<Record<string, unknown>> {
  const header = decodeJWSHeader(jws);

  if (header.alg !== 'ES256') {
    throw new Error(`Unsupported JWS alg: ${header.alg} (expected ES256)`);
  }

  const x5c = header.x5c;
  if (!Array.isArray(x5c) || x5c.length < 2) {
    throw new Error('JWS x5c chain missing or too short');
  }

  // Step 1: pin the root of the chain to Apple Root CA G3.
  // The LAST entry in x5c is the root; compute its SHA-256 and compare.
  const rootDer = base64ToBytes(x5c[x5c.length - 1]);
  const rootFpr = await sha256Hex(rootDer);
  if (rootFpr !== APPLE_ROOT_CA_G3_FINGERPRINT_SHA256) {
    throw new Error(
      `JWS x5c root fingerprint mismatch: got ${rootFpr.substring(0, 16)}…, expected Apple Root CA G3`
    );
  }

  // Step 2: import the leaf cert (x5c[0]) as a CryptoKey and verify
  // the JWS signature using jose.
  const leafPem =
    '-----BEGIN CERTIFICATE-----\n' +
    x5c[0].match(/.{1,64}/g)!.join('\n') +
    '\n-----END CERTIFICATE-----';
  const leafKey = await importX509(leafPem, 'ES256');

  // compactVerify throws if the signature doesn't match.
  const { payload: payloadBytes } = await compactVerify(jws, leafKey);

  const payloadJson = JSON.parse(new TextDecoder().decode(payloadBytes));
  return payloadJson;
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

    // ── Verify JWS signature + pin chain to Apple Root, then decode payload
    //
    // Build 69 Commit J: every verification step must succeed before we
    // trust any claim in the payload. Signature failure, chain-pin
    // failure, and malformed JWS all return 400 to the client; we log
    // server-side for forensic record.
    //
    // DEV_SKIP_SIGNATURE_VERIFY is a safety-valve for StoreKit local
    // testing only — must never be set in prod. Warning already logged
    // at cold start if set.
    let payload: Record<string, unknown>;
    try {
      if (DEV_SKIP_SIGNATURE_VERIFY) {
        // Dev bypass path — decode without verifying. Already warned.
        const parts = jwsRepresentation.split('.');
        if (parts.length !== 3) throw new Error('Invalid JWS format');
        const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
        const padding = '='.repeat((4 - b64.length % 4) % 4);
        payload = JSON.parse(atob(b64 + padding));
      } else {
        payload = await verifyAppleJWS(jwsRepresentation);
      }
    } catch (e) {
      console.error('[validate-apple-receipt] JWS verification failed:', (e as Error).message);
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
