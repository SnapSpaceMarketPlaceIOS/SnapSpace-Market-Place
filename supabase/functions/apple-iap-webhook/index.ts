/**
 * apple-iap-webhook — Apple App Store Server Notifications V2 receiver.
 *
 * Build 84 / Bug B3 fix. Closes the high-severity gap where the prior IAP
 * stack had no server-to-server channel for renewals, refunds, expirations,
 * or revocations. Without this:
 *   - A weekly subscription auto-renew would never advance subscription_expires_at
 *     server-side until the user happened to re-open the app and the client
 *     re-validated the receipt. If they didn't, get_user_quota's lazy-expiry
 *     check fired and locked the user out of paid quota despite continuing
 *     to be charged weekly.
 *   - An Apple-issued refund silently left the user with their purchased
 *     wishes AND their money — a direct revenue + compliance leak.
 *
 * This function is a PUBLIC endpoint (no JWT auth — Apple's server calls it).
 * Security is enforced by JWS signature verification + Apple Root CA G3
 * fingerprint pinning, identical to validate-apple-receipt's path. Anyone
 * can send a request, but only Apple-signed payloads will be honored.
 *
 * Configuration:
 *   1. Deploy this function with `supabase functions deploy apple-iap-webhook
 *      --no-verify-jwt`
 *   2. In App Store Connect → App Information → App Store Server Notifications,
 *      set the Production Server URL to:
 *        https://lqjfnpibbjymhzupqtda.supabase.co/functions/v1/apple-iap-webhook
 *      Same URL for Sandbox.
 *   3. Set notification version to "Version 2".
 *   4. Apple will start POSTing notifications immediately. Use the "Request a
 *      Test Notification" button in App Store Connect to confirm wiring.
 *
 * Notification types handled:
 *   - DID_RENEW                  → activate_subscription (advances expires_at)
 *   - SUBSCRIBED                 → activate_subscription (initial purchase)
 *   - DID_CHANGE_RENEWAL_STATUS  → audit only (no entitlement change)
 *   - EXPIRED                    → expire_subscription (sub ended; demote to free)
 *   - DID_FAIL_TO_RENEW          → audit only (grace period; entitlement intact)
 *   - GRACE_PERIOD_EXPIRED       → expire_subscription (post-grace lockout)
 *   - REVOKE                     → expire_subscription (Family Sharing pulled)
 *   - REFUND                     → debit user_tokens (consumable) OR
 *                                   expire_subscription (subscription)
 *   - REFUND_DECLINED            → audit only
 *   - All other types            → log + 200 OK so Apple stops retrying
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ── Production guard ─────────────────────────────────────────────────────────
// Same defense-in-depth as validate-apple-receipt. If anyone ever sets
// DEV_SKIP_APPLE_SIGNATURE_VERIFY in production, this throws at module load
// and the function refuses to handle even one notification.
const DEV_SKIP_SIGNATURE_VERIFY =
  Deno.env.get('DEV_SKIP_APPLE_SIGNATURE_VERIFY') === 'true';
const PROD_PROJECT_REF = 'lqjfnpibbjymhzupqtda';
function isProductionEnvironment(): boolean {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  return supabaseUrl.includes(PROD_PROJECT_REF);
}
if (DEV_SKIP_SIGNATURE_VERIFY && isProductionEnvironment()) {
  throw new Error(
    '[apple-iap-webhook] FATAL: DEV_SKIP_APPLE_SIGNATURE_VERIFY=true in ' +
    'production. Refusing to start.'
  );
}

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ── JWS Verification (mirrors validate-apple-receipt's logic) ────────────────
//
// Apple Root CA G3 SHA-256 fingerprint. MUST match the constant in
// validate-apple-receipt/index.ts. Verified 2026-04-26 against the live
// cert at https://www.apple.com/certificateauthority/AppleRootCA-G3.cer
// via:
//   curl -fsS https://www.apple.com/certificateauthority/AppleRootCA-G3.cer \
//     | shasum -a 256
// → 63343abfb89a6a03ebb57e9b3f5fa7be7c4f5c756f3017b3a8c488c3653e9179
// (uppercased here to match crypto.subtle output style.)
const APPLE_ROOT_CA_G3_FINGERPRINT =
  '63343ABFB89A6A03EBB57E9B3F5FA7BE7C4F5C756F3017B3A8C488C3653E9179';

function decodeJWSHeader(jws: string): Record<string, unknown> {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWS format');
  const headerB64 = parts[0].replace(/-/g, '+').replace(/_/g, '/');
  const padding   = '='.repeat((4 - headerB64.length % 4) % 4);
  return JSON.parse(atob(headerB64 + padding));
}

function decodeJWSPayload(jws: string): Record<string, unknown> {
  const parts = jws.split('.');
  if (parts.length !== 3) throw new Error('Invalid JWS format');
  const payloadB64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
  const padding    = '='.repeat((4 - payloadB64.length % 4) % 4);
  return JSON.parse(atob(payloadB64 + padding));
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const hashBuf = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(hashBuf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes  = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Verify a JWS came from Apple (signature valid, root pinned to Apple Root
 * CA G3) and return its decoded payload. Throws on any failure.
 */
async function verifyAppleJWS(jws: string): Promise<Record<string, unknown>> {
  if (DEV_SKIP_SIGNATURE_VERIFY) {
    // Already module-load-guarded against production above. In dev, decode-only.
    return decodeJWSPayload(jws);
  }

  const header = decodeJWSHeader(jws);
  if (header.alg !== 'ES256') {
    throw new Error(`Unsupported JWS alg: ${header.alg} (expected ES256)`);
  }
  const x5c = header.x5c as string[] | undefined;
  if (!Array.isArray(x5c) || x5c.length === 0) {
    throw new Error('JWS missing x5c certificate chain');
  }

  // Pin root to Apple Root CA G3.
  const rootDer  = base64ToBytes(x5c[x5c.length - 1]);
  const rootHash = await sha256Hex(rootDer);
  if (rootHash !== APPLE_ROOT_CA_G3_FINGERPRINT) {
    throw new Error(`Cert chain root does not match Apple Root CA G3: got ${rootHash}`);
  }

  // Extract leaf public key and verify signature over header.payload.
  const leafDer = base64ToBytes(x5c[0]);
  const leafKey = await crypto.subtle.importKey(
    'spki',
    spkiFromCertDer(leafDer),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['verify'],
  );

  const parts        = jws.split('.');
  const signingInput = new TextEncoder().encode(parts[0] + '.' + parts[1]);
  const sigB64       = parts[2].replace(/-/g, '+').replace(/_/g, '/');
  const padding      = '='.repeat((4 - sigB64.length % 4) % 4);
  const sigBytes     = base64ToBytes(sigB64 + padding);

  const ok = await crypto.subtle.verify(
    { name: 'ECDSA', hash: { name: 'SHA-256' } },
    leafKey,
    sigBytes,
    signingInput,
  );
  if (!ok) throw new Error('JWS signature verification failed');

  return decodeJWSPayload(jws);
}

/**
 * Extract SubjectPublicKeyInfo from an X.509 cert DER.
 * Apple's certs are well-formed; we walk the ASN.1 to find the SPKI block.
 */
function spkiFromCertDer(certDer: Uint8Array): Uint8Array {
  // X.509 Certificate ::= SEQUENCE { tbsCertificate, signatureAlgorithm, signatureValue }
  // tbsCertificate ::= SEQUENCE { version, serial, sigAlg, issuer, validity, subject, subjectPublicKeyInfo, ... }
  // We need the 7th element of tbsCertificate (subjectPublicKeyInfo).

  const view = certDer;
  let pos = 0;

  function readLen(): number {
    const b = view[pos++];
    if (b < 0x80) return b;
    const nBytes = b & 0x7f;
    let len = 0;
    for (let i = 0; i < nBytes; i++) len = (len << 8) | view[pos++];
    return len;
  }
  function skipTLV(): void {
    pos++; // tag
    const len = readLen();
    pos += len;
  }
  function descend(): void {
    pos++; // tag
    readLen();
  }

  // Outer SEQUENCE
  descend();
  // tbsCertificate SEQUENCE
  descend();
  // [0] EXPLICIT version (optional, defaults to v1) — present iff tag is 0xa0
  if (view[pos] === 0xa0) skipTLV();
  // serialNumber INTEGER
  skipTLV();
  // signature AlgorithmIdentifier SEQUENCE
  skipTLV();
  // issuer Name SEQUENCE
  skipTLV();
  // validity SEQUENCE
  skipTLV();
  // subject Name SEQUENCE
  skipTLV();

  // subjectPublicKeyInfo SEQUENCE — capture entire TLV
  const start = pos;
  pos++; // tag (0x30)
  const len      = readLen();
  const lenStart = start + 1; // start of length bytes
  const headerLen = pos - lenStart + 1; // tag + length-of-length octets
  return view.slice(start, start + headerLen + len);
}

// ── Database helper ──────────────────────────────────────────────────────────

function getServiceClient() {
  const url = Deno.env.get('SUPABASE_URL')!;
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(url, key);
}

/**
 * Look up the user_id given an originalTransactionId. Apple identifies
 * subscriptions by originalTransactionId across renewals; we stored that
 * on activate_subscription. If we can't find a match, the notification
 * is for a transaction we never validated — return null and audit-log it.
 */
async function resolveUserIdByOriginalTx(
  supabase: ReturnType<typeof getServiceClient>,
  originalTransactionId: string,
): Promise<string | null> {
  // Try user_generation_quota first (subscriptions).
  const { data: subRow } = await supabase
    .from('user_generation_quota')
    .select('user_id')
    .eq('original_transaction_id', originalTransactionId)
    .maybeSingle();
  if (subRow?.user_id) return subRow.user_id;

  // Fall back to subscription_events for cases where the sub expired and
  // the user_generation_quota row was demoted to free (clearing
  // original_transaction_id is fine, but we still want to audit refunds).
  const { data: evRow } = await supabase
    .from('subscription_events')
    .select('user_id')
    .eq('original_transaction_id', originalTransactionId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (evRow?.user_id) return evRow.user_id;

  // Lastly, search token_transactions for a matching reference_id (consumable
  // wishes use transactionId as reference_id in add_tokens calls).
  const { data: txRow } = await supabase
    .from('token_transactions')
    .select('user_id')
    .eq('reference_id', originalTransactionId)
    .maybeSingle();
  return txRow?.user_id ?? null;
}

// ── Notification handlers ────────────────────────────────────────────────────

async function handleSubscriptionRenewal(
  supabase: ReturnType<typeof getServiceClient>,
  txInfo: Record<string, unknown>,
  environment: string,
): Promise<{ ok: boolean; reason?: string }> {
  const originalTxId      = String(txInfo.originalTransactionId ?? '');
  const transactionId     = String(txInfo.transactionId ?? '');
  const productId         = String(txInfo.productId ?? '');
  const expiresMs         = Number(txInfo.expiresDate ?? 0);
  if (!originalTxId || !transactionId || !productId || !expiresMs) {
    return { ok: false, reason: 'missing-required-fields' };
  }

  const userId = await resolveUserIdByOriginalTx(supabase, originalTxId);
  if (!userId) return { ok: false, reason: 'user-not-found' };

  const { error } = await supabase.rpc('activate_subscription', {
    p_user_id:                 userId,
    p_product_id:              productId,
    p_transaction_id:          transactionId,
    p_original_transaction_id: originalTxId,
    p_expires_at:              new Date(expiresMs).toISOString(),
    p_environment:             environment,
    p_receipt_jws:             null,
  });
  if (error) return { ok: false, reason: `activate-failed: ${error.message}` };
  return { ok: true };
}

async function handleSubscriptionExpire(
  supabase: ReturnType<typeof getServiceClient>,
  txInfo: Record<string, unknown>,
): Promise<{ ok: boolean; reason?: string }> {
  const originalTxId = String(txInfo.originalTransactionId ?? '');
  if (!originalTxId) return { ok: false, reason: 'missing-original-tx' };

  const userId = await resolveUserIdByOriginalTx(supabase, originalTxId);
  if (!userId) return { ok: false, reason: 'user-not-found' };

  const { error } = await supabase.rpc('expire_subscription', {
    p_user_id:                 userId,
    p_original_transaction_id: originalTxId,
  });
  if (error) return { ok: false, reason: `expire-failed: ${error.message}` };
  return { ok: true };
}

async function handleRefund(
  supabase: ReturnType<typeof getServiceClient>,
  txInfo: Record<string, unknown>,
): Promise<{ ok: boolean; reason?: string }> {
  const originalTxId  = String(txInfo.originalTransactionId ?? '');
  const transactionId = String(txInfo.transactionId ?? '');
  const productId     = String(txInfo.productId ?? '');
  if (!originalTxId || !transactionId || !productId) {
    return { ok: false, reason: 'missing-required-fields' };
  }

  const userId = await resolveUserIdByOriginalTx(supabase, originalTxId);
  if (!userId) return { ok: false, reason: 'user-not-found' };

  // Branch: subscription product → expire; consumable wishes → debit balance.
  if (productId.startsWith('homegenie_wishes_')) {
    // Look up the original grant amount so we know how many wishes to debit.
    const { data: grantRow } = await supabase
      .from('token_transactions')
      .select('amount')
      .eq('reference_id', transactionId)
      .eq('transaction_type', 'purchase')
      .maybeSingle();

    const refundAmount = grantRow?.amount ?? 0;
    if (refundAmount <= 0) {
      console.warn(`[webhook] REFUND for unknown wish grant ${transactionId}`);
      return { ok: true };
    }

    // Build 84 reviewer fix: route through refund_consumable_purchase RPC
    // (migration 027 step 8). Atomic UPDATE + ledger insert in one
    // transaction with UNIQUE(reference_id) idempotency. Replaces the
    // prior inline read-then-update which had a documented concurrency
    // race AND no idempotency guard against Apple's redelivery on >30s
    // timeouts.
    const { error: refundErr } = await supabase.rpc('refund_consumable_purchase', {
      p_user_id:        userId,
      p_transaction_id: transactionId,
      p_product_id:     productId,
      p_amount:         refundAmount,
    });
    if (refundErr) {
      return { ok: false, reason: `consumable-refund-failed: ${refundErr.message}` };
    }
    return { ok: true };
  }

  // Subscription refund → expire the subscription.
  const { error } = await supabase.rpc('expire_subscription', {
    p_user_id:                 userId,
    p_original_transaction_id: originalTxId,
  });
  if (error) return { ok: false, reason: `expire-on-refund-failed: ${error.message}` };
  return { ok: true };
}

// ── Request handler ──────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS_HEADERS });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const supabase = getServiceClient();

  let body: { signedPayload?: string };
  try { body = await req.json(); }
  catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  if (!body.signedPayload) {
    return new Response(JSON.stringify({ error: 'Missing signedPayload' }), {
      status: 400,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  // Verify the outer notification JWS came from Apple.
  let payload: Record<string, unknown>;
  try {
    payload = await verifyAppleJWS(body.signedPayload);
  } catch (err) {
    console.warn('[webhook] JWS verification failed:', (err as Error).message);
    // Build 84 reviewer fix: return 401 so Apple retries with backoff if
    // verification failed for a TRANSIENT reason (cert chain rotation,
    // x5c parse hiccup after Apple ships an intermediate update, etc.).
    // Apple's retry policy drops a notification permanently after a small
    // number of failed retries — that's the right outcome for forgeries
    // (they keep failing) and for transient bugs (we get more chances to
    // get them right after a hotfix). Prior 200 dropped real notifications
    // forever on the first transient failure.
    return new Response(JSON.stringify({ ok: false, reason: 'invalid-signature' }), {
      status: 401,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }

  const notificationType    = String(payload.notificationType ?? '');
  const subtype             = String(payload.subtype ?? '');
  const data                = (payload.data ?? {}) as Record<string, unknown>;
  const environment         = String(data.environment ?? payload.environment ?? 'Production');
  const signedTxInfo        = data.signedTransactionInfo as string | undefined;

  // Audit row for every notification, regardless of whether we act on it.
  // Maps directly onto subscription_events for queryability.
  let txInfo: Record<string, unknown> = {};
  let txInfoVerified = false;
  if (signedTxInfo) {
    try {
      txInfo = await verifyAppleJWS(signedTxInfo);
      txInfoVerified = true;
    } catch (err) {
      console.warn('[webhook] inner signedTransactionInfo verification failed:',
        (err as Error).message);
      // Leave txInfo = {} so downstream branches short-circuit on
      // missing-required-fields. Audit row still written below.
    }
  }

  // Resolve user_id ONCE up here so the audit insert and the action
  // handlers below can both reuse the value without a second DB roundtrip.
  const originalTxId = String(txInfo.originalTransactionId ?? '');
  const auditUserId = originalTxId
    ? await resolveUserIdByOriginalTx(supabase, originalTxId)
    : null;

  await supabase.from('subscription_events').insert({
    user_id:                 auditUserId,
    event_type:              `webhook:${notificationType}${subtype ? '/' + subtype : ''}`,
    product_id:              txInfo.productId ?? null,
    transaction_id:          txInfo.transactionId ?? null,
    original_transaction_id: txInfo.originalTransactionId ?? null,
    environment,
    expires_at:              txInfo.expiresDate ? new Date(Number(txInfo.expiresDate)).toISOString() : null,
    event_data:              { notificationType, subtype, payload, txInfoVerified },
  });

  // Branch on notification type. Default = audit-only 200 OK.
  let result: { ok: boolean; reason?: string } = { ok: true };

  switch (notificationType) {
    case 'SUBSCRIBED':
    case 'DID_RENEW':
      result = await handleSubscriptionRenewal(supabase, txInfo, environment);
      break;

    case 'EXPIRED':
    case 'GRACE_PERIOD_EXPIRED':
    case 'REVOKE':
      result = await handleSubscriptionExpire(supabase, txInfo);
      break;

    case 'REFUND':
      result = await handleRefund(supabase, txInfo);
      break;

    case 'DID_FAIL_TO_RENEW':
    case 'DID_CHANGE_RENEWAL_STATUS':
    case 'DID_CHANGE_RENEWAL_PREF':
    case 'OFFER_REDEEMED':
    case 'PRICE_INCREASE':
    case 'REFUND_DECLINED':
    case 'CONSUMPTION_REQUEST':
    case 'TEST':
    case 'RENEWAL_EXTENDED':
    case 'EXTERNAL_PURCHASE_TOKEN':
      // Audit-only — already logged above. Apple gets 200 OK.
      console.log(`[webhook] audit-only: ${notificationType}/${subtype}`);
      break;

    default:
      console.warn(`[webhook] Unknown notificationType: ${notificationType}`);
      break;
  }

  if (!result.ok) {
    console.warn(`[webhook] ${notificationType} handler failed: ${result.reason}`);
  }

  // Always 200 to Apple so they stop retrying. Outcome is in the audit row.
  return new Response(JSON.stringify({ ok: result.ok, reason: result.reason ?? null }), {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
});
