/**
 * HomeGenie — Amazon Affiliate Purchase Ingestion
 *
 * Admin-only edge function that ingests confirmed Amazon Associates purchases
 * and silently grants 10 wishes per order to the originating user.
 *
 * Attribution chain:
 *   1. User taps Shop Now → productTapHandler appends ascsubtag=hg_<uid>_<cid>
 *   2. User buys on Amazon → Amazon records the sale with our ascsubtag
 *   3. 24-72 hours later, Amazon publishes it in the Associates earnings report
 *   4. Admin uploads the report CSV / JSON to this endpoint
 *   5. For each row:
 *        - Find the user_id via affiliate_clicks.subtag lookup
 *        - Call grant_affiliate_purchase_wishes(...) RPC (idempotent)
 *        - Send silent push notification on first-time grant
 *
 * Security:
 *   - Requires x-admin-key header matching env INGEST_ADMIN_KEY (shared secret)
 *   - Uses service role key internally to bypass RLS on grants
 *   - No JWT auth — this endpoint is never called from the mobile app
 *
 * Request format:
 *   POST /functions/v1/ingest-affiliate-purchases
 *   Headers:
 *     x-admin-key: <INGEST_ADMIN_KEY>
 *     content-type: application/json
 *   Body:
 *     {
 *       network: "amazon",                  // currently the only supported value
 *       orders: [
 *         {
 *           order_ref:      "111-2222222-3333333",   // Amazon Order ID from report
 *           subtag:         "hg_abc12345_xyz678",    // ascsubtag from report
 *           product_asin:   "B0XYZ12345",            // optional
 *           commission_usd: 3.12                     // optional, for analytics
 *         }
 *       ]
 *     }
 *
 * Response:
 *   {
 *     processed: 12,
 *     granted:   10,
 *     skipped:   [ { order_ref, reason } ],
 *     total_wishes_granted: 100
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// This endpoint is admin-only (no browser callers). Origin restricted to
// prevent cross-origin shenanigans if the admin key ever leaks.
const CORS = {
  "Access-Control-Allow-Origin": "null",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-admin-key",
};

const WISHES_PER_ORDER   = 10;
const MAX_ORDERS_PER_CALL = 1000;  // prevent giant-payload DoS
const PUSH_TIMEOUT_MS     = 5000;
const PUSH_TITLE = "Wishes added ✨";
const PUSH_BODY  = "Your HomeGenie account was credited with 10 wishes.";

/**
 * Constant-time string comparison. Avoids leaking the admin key prefix
 * to a timing-attack network observer via `a !== b`, which short-circuits
 * on the first differing byte.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

interface OrderInput {
  order_ref:       string;
  subtag:          string;
  product_asin?:   string | null;
  commission_usd?: number | null;
}

interface IngestBody {
  network?: string;
  orders?:  OrderInput[];
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  // ── Admin auth (constant-time comparison) ─────────────────────────────────
  const adminKey   = req.headers.get("x-admin-key") ?? "";
  const expectedKey = Deno.env.get("INGEST_ADMIN_KEY");
  if (!expectedKey) {
    console.error("[ingest] INGEST_ADMIN_KEY secret not set");
    return json({ error: "Ingestion endpoint not configured" }, 500);
  }
  if (!timingSafeEqual(adminKey, expectedKey)) {
    return json({ error: "Unauthorized" }, 401);
  }

  // ── Parse request ─────────────────────────────────────────────────────────
  let body: IngestBody;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const network = body.network || "amazon";
  if (network !== "amazon") {
    return json({ error: `Unsupported network: ${network}. Only 'amazon' is supported.` }, 400);
  }

  const orders = Array.isArray(body.orders) ? body.orders : [];
  if (orders.length === 0) {
    return json({ error: "orders array is empty" }, 400);
  }
  if (orders.length > MAX_ORDERS_PER_CALL) {
    return json({
      error: `Too many orders — max ${MAX_ORDERS_PER_CALL} per request`,
      received: orders.length,
    }, 413);
  }

  // ── Supabase service client ───────────────────────────────────────────────
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, serviceKey);

  // ── Process each order ────────────────────────────────────────────────────
  let processed = 0;
  let granted   = 0;
  let totalWishes = 0;
  const skipped: Array<{ order_ref: string; reason: string }> = [];

  for (const order of orders) {
    processed++;

    if (!order?.order_ref || !order?.subtag) {
      skipped.push({ order_ref: order?.order_ref ?? "(missing)", reason: "missing_fields" });
      continue;
    }

    try {
      const { data, error } = await supabase.rpc("grant_affiliate_purchase_wishes", {
        p_network:        network,
        p_order_ref:      order.order_ref,
        p_subtag:         order.subtag,
        p_amount:         WISHES_PER_ORDER,
        p_product_asin:   order.product_asin ?? null,
        p_commission_usd: order.commission_usd ?? null,
      });

      if (error) {
        console.error(`[ingest] RPC failed for order ${order.order_ref}:`, error.message);
        skipped.push({ order_ref: order.order_ref, reason: `rpc_error: ${error.message}` });
        continue;
      }

      const result = Array.isArray(data) ? data[0] : data;

      if (!result?.granted) {
        skipped.push({ order_ref: order.order_ref, reason: result?.reason ?? "unknown" });
        continue;
      }

      granted++;
      totalWishes += WISHES_PER_ORDER;

      // ── Silent push notification (Option B generic wording) ──────────────
      // No mention of purchase, affiliate, Amazon, or any source.
      // Indistinguishable from a promotional/referral credit.
      if (result.user_id) {
        sendSilentWishNotification(supabase, result.user_id).catch((e) =>
          console.warn(`[ingest] push failed for ${result.user_id}:`, e?.message || e)
        );
      }
    } catch (e) {
      console.error(`[ingest] Order ${order.order_ref} threw:`, (e as Error).message);
      skipped.push({ order_ref: order.order_ref, reason: "exception" });
    }
  }

  console.log(
    `[ingest] ${network} | processed=${processed} granted=${granted} ` +
    `skipped=${skipped.length} total_wishes=${totalWishes}`,
  );

  return json({
    processed,
    granted,
    skipped,
    total_wishes_granted: totalWishes,
  });
});

/**
 * Send a silent Expo push notification to the user. Fetches the user's
 * push_token from profiles and posts to Expo's push API directly — no
 * source attribution in the payload (generic wording only).
 */
async function sendSilentWishNotification(supabase: any, userId: string) {
  const { data: profile } = await supabase
    .from("profiles")
    .select("push_token")
    .eq("id", userId)
    .single();

  const pushToken = profile?.push_token;
  if (!pushToken) return;

  const res = await fetch("https://exp.host/--/api/v2/push/send", {
    method:  "POST",
    headers: {
      "Accept":       "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to:       pushToken,
      title:    PUSH_TITLE,
      body:     PUSH_BODY,
      sound:    "default",
      priority: "high",
      // Intentionally no `data` payload referencing purchase/affiliate/source.
    }),
    signal: AbortSignal.timeout(PUSH_TIMEOUT_MS),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Expo push returned ${res.status}: ${text.substring(0, 200)}`);
  }
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
