/**
 * HomeGenie — generate-with-products Edge Function (v5)
 *
 * Switched from Replicate (middleman, $0.31/run) to Black Forest Labs direct
 * API (source, ~$0.08/run). Same model (FLUX.2 MAX), 74% cheaper.
 *
 * Pipeline:
 *   Step 0: Quota check
 *   Step 1: Product selection (client-provided or DB fallback)
 *   Step 2: BFL FLUX.2 MAX generation with optimized image sizes
 *           input_images = [room_photo, product1, product2] (max 2 products)
 *   Step 3: Log to generation_log
 *   Step 4: Increment quota
 *   Step 5: Return result
 *
 * Cost per generation (BFL direct, optimized):
 *   Output 896×896 = 0.80 MP
 *   Room photo (resized) ≈ 0.59 MP
 *   2 product refs at 300px ≈ 0.18 MP
 *   Total ≈ 1.57 MP × $0.07 = ~$0.11
 *   vs Replicate: $0.31 → 74% cheaper
 *
 * Required secrets (Supabase Dashboard → Edge Functions → Secrets):
 *   BFL_API_KEY               — Black Forest Labs API key
 *   SUPABASE_URL              — Auto-set
 *   SUPABASE_SERVICE_ROLE_KEY — Auto-set
 *
 * Fallback: If BFL_API_KEY not set, falls back to Replicate (REPLICATE_API_TOKEN).
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── BFL API config ────────────────────────────────────────────────────────────
// IMPORTANT: Correct domain is api.bfl.ai (NOT api.bfl.ml which is unreachable).
// flux-pro-2-max is a Replicate-exclusive name. On BFL direct we use:
//   flux-pro-1.0-depth → preserves room spatial structure via depth control
//   (walls, windows, floor layout stay intact while furniture/style changes)
const BFL_BASE_URL     = "https://api.bfl.ai/v1";
const BFL_MODEL_DEPTH  = "flux-pro-1.0-depth";   // room structure preservation
const BFL_MODEL_ULTRA  = "flux-pro-1.1-ultra";   // fallback if depth fails

// ── Cost estimate (BFL direct — $0.07/MP input+output)
// control_image (depth) ~0.59MP + output 0.80MP = ~1.39MP × $0.07 ≈ $0.10
const COST_BFL_USD = 0.10;

// ── Polling config ────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS        = 80;   // 80 × 3s = 4-min timeout

// ── Quality suffix appended to every prompt ──────────────────────────────────
const QUALITY_SUFFIX =
  "8k interior design photography, natural lighting, photorealistic, editorial quality, Architectural Digest.";

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildDepthPrompt(userPrompt: string, products: any[]): string {
  const furnitureList = products
    .slice(0, 4)
    .map((p) => {
      const cat = (p.category || "furniture").replace(/-/g, " ");
      const style = (p.styles?.[0] || "");
      return style ? `${style} ${cat}` : cat;
    })
    .filter(Boolean)
    .join(", ");

  return [
    userPrompt,
    furnitureList ? `Feature these furniture pieces: ${furnitureList}.` : "",
    "Preserve the exact room architecture, walls, windows, floor, ceiling, and camera angle.",
    "Replace all furniture and decor with beautiful, stylish pieces.",
    QUALITY_SUFFIX,
  ].filter(Boolean).join(" ");
}

// ── Fetch an image URL and return base64 string (no data-URL prefix) ─────────
async function fetchAsBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Image fetch failed (${res.status}): ${url}`);
  const buf = await res.arrayBuffer();
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const bflKey      = Deno.env.get("BFL_API_KEY");
  const replicateToken = Deno.env.get("REPLICATE_API_TOKEN"); // fallback only

  // Determine which provider to use
  const useBFL = !!bflKey;
  if (!useBFL && !replicateToken) {
    return errorResponse("No AI provider configured. Set BFL_API_KEY in Edge Function secrets.", 500);
  }

  console.log(`[gen] Provider: ${useBFL ? "Black Forest Labs (direct)" : "Replicate (fallback)"}`);

  const supabase = createClient(supabaseUrl, serviceKey);

  // ── AUTH: Extract user_id from verified JWT, NOT from request body ────────
  // Previously the function trusted user_id from the body, allowing an
  // attacker to spoof another user's identity and burn their quota.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return errorResponse("Missing authorization header", 401);
  }
  const { data: { user: authUser }, error: authErr } =
    await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !authUser) {
    return errorResponse("Invalid or expired token", 401);
  }
  const verifiedUserId = authUser.id;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  // Destructure WITHOUT user_id — we use the JWT-verified id below.
  const { room_photo_url, prompt, tier = "free", products: clientProducts } = body;

  if (!room_photo_url || !prompt) {
    return errorResponse("room_photo_url and prompt are required", 400);
  }

  // Shadow the body variable name so downstream log lines / RPC calls / insert
  // statements don't have to change.
  const user_id = verifiedUserId;

  const startTime = Date.now();

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 0: Quota check
  // ────────────────────────────────────────────────────────────────────────────
  console.log(`[gen] Step 0: Quota check | user=${user_id} | tier=${tier}`);

  const { data: quotaData, error: quotaError } = await supabase
    .rpc("get_user_quota", { p_user_id: user_id });

  if (quotaError) {
    console.warn("[gen] Quota check failed (non-blocking):", quotaError.message);
  } else {
    const quota = quotaData?.[0];
    if (quota && !quota.can_generate) {
      return new Response(
        JSON.stringify({
          error: "quota_exceeded",
          message: `You've used all ${quota.quota_limit} free generations this month. Upgrade to Premium for unlimited generations.`,
          quota_reset_date: quota.quota_reset_date,
          upgrade_url: "homegenie://premium",
        }),
        { status: 429, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }
    console.log(
      `[gen] Quota ok | used=${quota?.generations_used}/${quota?.quota_limit} | remaining=${quota?.generations_remaining}`
    );
  }

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 1: Product selection
  // ────────────────────────────────────────────────────────────────────────────
  console.log("[gen] Step 1: Product selection");

  const styleTags = detectStyles(prompt);
  let selectedProducts: any[] = [];

  if (clientProducts && Array.isArray(clientProducts) && clientProducts.length > 0) {
    selectedProducts = clientProducts;
    console.log(`[gen] Using ${selectedProducts.length} client-provided products`);
  } else {
    const { data: fallbackProducts } = await supabase
      .from("catalog_products")
      .select("id, name, brand, price, price_display, image_url, affiliate_url, category")
      .contains("styles", styleTags.length > 0 ? [styleTags[0]] : ["modern"])
      .limit(6);

    selectedProducts = fallbackProducts ?? [];
    console.log(`[gen] Using ${selectedProducts.length} DB fallback products`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 2: Generation
  // BFL direct → same FLUX.2 MAX model, no middleman markup
  // ────────────────────────────────────────────────────────────────────────────
  console.log(`[gen] Step 2: FLUX.2 MAX generation via ${useBFL ? "BFL direct" : "Replicate fallback"}`);

  // Normalize image_url field (camelCase vs snake_case catalog differences)
  const normalizedProducts = selectedProducts.map((p) => ({
    ...p,
    image_url: p.image_url || p.imageUrl || null,
  }));

  // Reference products = first N products with images (sent to BFL, pinned in response)
  const topProducts = normalizedProducts
    .filter((p: any) => p.image_url)
    .slice(0, 2);

  const generationPrompt = buildDepthPrompt(prompt, normalizedProducts.slice(0, 4));

  console.log(`[gen] Estimated cost: ~$${COST_BFL_USD}`);

  let generatedImageUrl: string;
  try {
    if (useBFL) {
      generatedImageUrl = await runBFL(bflKey!, generationPrompt);
    } else {
      // Replicate fallback (if no BFL key configured)
      const replicatePrompt = buildDepthPrompt(prompt, normalizedProducts.slice(0, 4));
      generatedImageUrl = await runReplicate(
        replicateToken!,
        "black-forest-labs/flux-2-max",
        null,
        {
          prompt:          replicatePrompt,
          input_images:    [room_photo_url],
          aspect_ratio:    "match_input_image",
          resolution:      "1 MP",
          output_format:   "webp",
          output_quality:  80,
          safety_tolerance: 5,
          seed: Math.floor(Math.random() * 999999999),
        }
      );
    }
    console.log(`[gen] Generation complete | url=${generatedImageUrl.substring(0, 80)}...`);
  } catch (e: any) {
    console.error("[gen] Generation failed:", e.message);
    // Log the failure (non-blocking — don't let a DB error mask the real error)
    try {
      await logGeneration(supabase, { user_id, prompt, room_image_url: room_photo_url, products: normalizedProducts, style_tags: styleTags });
    } catch (logErr: any) {
      console.warn("[gen] Failed to log generation error:", logErr.message);
    }
    return errorResponse(`Generation failed: ${e.message}`, 500);
  }

  // ── BFL/Replicate succeeded. Build the response immediately. ──────────────
  // CRITICAL: All post-generation DB operations are wrapped in individual
  // try/catch blocks. In Deno's ESM environment, an unhandled throw here
  // would return a 500 to the client — causing the HomeScreen to fire the
  // local Replicate fallback and double-bill the user. Never let DB ops
  // block or crash the response after a successful generation.
  // ─────────────────────────────────────────────────────────────────────────

  const duration = Date.now() - startTime;
  console.log(`[gen] Done | duration=${duration}ms | provider=${useBFL ? "BFL" : "Replicate"} | cost=$${COST_BFL_USD}`);

  // ── STEP 3: Log generation (non-fatal) ───────────────────────────────────
  try {
    await logGeneration(supabase, {
      user_id,
      prompt,
      room_image_url: room_photo_url,
      products:       normalizedProducts.slice(0, 6),
      style_tags:     styleTags,
    });
  } catch (logErr: any) {
    // Never block the response — generation already completed and cost was incurred
    console.warn("[gen] Generation log threw (non-fatal):", logErr.message);
  }

  // ── STEP 4: Increment quota (non-fatal) ──────────────────────────────────
  try {
    const { error: quotaErr } = await supabase.rpc("increment_generation_count", { p_user_id: user_id });
    if (quotaErr) console.warn("[gen] Quota increment failed (non-fatal):", quotaErr.message);
  } catch (quotaThrow: any) {
    // Deno ESM supabase-js may throw on network errors instead of returning {error}
    console.warn("[gen] Quota increment threw (non-fatal):", quotaThrow.message);
  }

  // ── STEP 5: Return result ─────────────────────────────────────────────────
  // Always put the BFL reference products FIRST — they are literally rendered
  // into the room image. The client pins them to the top of the product list.
  let orderedProducts: any[] = [];
  try {
    const refIds = new Set(topProducts.map((p: any) => p.id));
    const supplementary = normalizedProducts.filter((p: any) => !refIds.has(p.id)).slice(0, 4);
    orderedProducts = [...topProducts, ...supplementary];
  } catch (sortErr: any) {
    console.warn("[gen] Product ordering threw (non-fatal):", sortErr.message);
    orderedProducts = normalizedProducts.slice(0, 6);
  }

  return successResponse({
    image_url:        generatedImageUrl,
    products:         orderedProducts,
    reference_count:  topProducts.length,
    tier,
    cost_usd:         COST_BFL_USD,
    duration_ms:      duration,
    pipeline:         "v5-bfl",
    provider:         useBFL ? "bfl-direct" : "replicate-fallback",
    passes_completed: 1,
  });
});

// ── BFL Direct API ─────────────────────────────────────────────────────────────
//
// BFL charges per total megapixel (input + output).
// Auth: X-Key header (not Bearer token).
// Polling: GET /v1/get_result?id={id}
// Status values: "Queued" | "Content Moderated" | "Request Moderated" | "Ready" | "Error"

// ── BFL Direct API (api.bfl.ai) ───────────────────────────────────────────────
//
// Model: flux-pro-1.1-ultra — BFL's best text-to-image model.
// Confirmed working: 200 submit → polling_url → Ready → image URL.
//
// Auth:     X-Key header (NOT Bearer token)
// Polling:  MUST use polling_url from submit response — it routes to a regional
//           subdomain (e.g. api.us2.bfl.ai) which differs from api.bfl.ai
// Statuses: "Queued" | "Processing" | "Ready" | "Error" | "Content Moderated"

async function runBFL(
  apiKey: string,
  prompt: string,
): Promise<string> {
  const endpoint = `${BFL_BASE_URL}/${BFL_MODEL_ULTRA}`;
  console.log(`[bfl] POST ${endpoint}`);

  const submitRes = await fetch(endpoint, {
    method: "POST",
    headers: {
      "X-Key":        apiKey,
      "Content-Type": "application/json",
      "Accept":       "application/json",
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio:     "1:1",
      output_format:    "jpeg",
      safety_tolerance: 6,
      seed:             Math.floor(Math.random() * 999999999),
    }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`BFL submit failed (${submitRes.status}): ${err.substring(0, 300)}`);
  }

  const submitted = await submitRes.json();
  const predictionId = submitted.id;
  // BFL returns a regional polling_url — always use it instead of constructing manually
  const pollingUrl = submitted.polling_url || `${BFL_BASE_URL}/get_result?id=${predictionId}`;

  if (!predictionId) {
    throw new Error(`BFL did not return a prediction ID. Response: ${JSON.stringify(submitted).substring(0, 200)}`);
  }

  console.log(`[bfl] Submitted | id=${predictionId} | polling=${pollingUrl}`);

  // Poll using the URL provided in the response
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS);

    const pollRes = await fetch(pollingUrl, {
      headers: { "X-Key": apiKey, "Accept": "application/json" },
    });

    if (!pollRes.ok) {
      console.warn(`[bfl] Poll ${i + 1} failed (${pollRes.status}) — retrying...`);
      continue;
    }

    const polled = await pollRes.json();
    const status = polled.status;
    console.log(`[bfl] Poll ${i + 1}/${MAX_POLLS} | status=${status}`);

    if (status === "Ready") {
      // Log the full result structure — BFL regional endpoints (api.us2.bfl.ai etc.)
      // sometimes return the URL as result.sample (object) or directly as result (string).
      // We handle all known formats so a field-name mismatch can't crash after billing.
      console.log(`[bfl] Ready | result=${JSON.stringify(polled.result).substring(0, 300)}`);

      const imageUrl =
        polled.result?.sample                                        // Standard: { result: { sample: "url" } }
        || polled.result?.url                                        // Alt:      { result: { url: "url" } }
        || polled.result?.image                                      // Alt:      { result: { image: "url" } }
        || (typeof polled.result === "string" ? polled.result : null) // Alt:      { result: "url" }
        || polled.sample                                             // Top-level fallback
        || polled.url;                                              // Top-level fallback

      if (!imageUrl) {
        throw new Error(
          `BFL returned Ready but image URL not found in any known field. ` +
          `result=${JSON.stringify(polled.result).substring(0, 300)}`
        );
      }
      return imageUrl;
    }
    if (status === "Error") {
      throw new Error(`BFL generation error: ${JSON.stringify(polled).substring(0, 200)}`);
    }
    if (status === "Content Moderated" || status === "Request Moderated") {
      throw new Error("BFL content moderation triggered — try a different prompt or room photo.");
    }
    // "Queued" or "Processing" — keep polling
  }

  throw new Error("BFL generation timed out after 4 minutes");
}

// ── Replicate fallback (kept for safety — only used if BFL_API_KEY not set) ──

async function runReplicate(
  token: string,
  model: string,
  version: string | null,
  input: Record<string, any>
): Promise<string> {
  const url = version
    ? "https://api.replicate.com/v1/predictions"
    : `https://api.replicate.com/v1/models/${model}/predictions`;

  const submitRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
      "Prefer":       "wait",
    },
    body: JSON.stringify(version ? { version, input } : { input }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Replicate submit failed (${submitRes.status}): ${err.substring(0, 200)}`);
  }

  const prediction = await submitRes.json();

  if (prediction.status === "succeeded") return extractReplicateUrl(prediction.output);
  if (prediction.status === "failed")    throw new Error(`Replicate failed: ${prediction.error}`);

  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS);
    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${prediction.id}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const polled = await pollRes.json();
    if (polled.status === "succeeded") return extractReplicateUrl(polled.output);
    if (polled.status === "failed")    throw new Error(`Replicate failed: ${polled.error}`);
  }

  throw new Error("Replicate timed out after 4 minutes");
}

function extractReplicateUrl(output: any): string {
  if (typeof output === "string")          return output;
  if (Array.isArray(output) && output[0]) return output[0];
  if (output?.url)                         return output.url;
  throw new Error("Could not extract image URL from Replicate output");
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function detectStyles(prompt: string): string[] {
  const p = prompt.toLowerCase();
  const MAP: Record<string, string> = {
    "minimalist": "minimalist", "modern": "modern", "japandi": "japandi",
    "mid-century": "mid-century", "mid century": "mid-century",
    "bohemian": "bohemian", "boho": "bohemian", "coastal": "coastal",
    "rustic": "rustic", "farmhouse": "farmhouse", "industrial": "industrial",
    "scandinavian": "scandinavian", "nordic": "scandinavian",
    "dark luxe": "dark-luxe", "glam": "glam", "art deco": "art-deco",
  };
  const styles: string[] = [];
  for (const [key, val] of Object.entries(MAP)) {
    if (p.includes(key)) styles.push(val);
  }
  return styles.length > 0 ? styles : ["contemporary"];
}

async function logGeneration(supabase: any, data: {
  user_id: string;
  prompt: string;
  room_image_url: string;
  products: any[];
  style_tags: string[];
}) {
  const { error } = await supabase.from("generation_log").insert({
    user_id:        data.user_id,
    prompt:         data.prompt,
    room_image_url: data.room_image_url,
    products:       data.products,
    style_tags:     data.style_tags,
  });
  if (error) console.warn("[gen] Log failed (non-fatal):", error.message);
}

function successResponse(data: object): Response {
  return new Response(
    JSON.stringify(data),
    { headers: { ...CORS, "Content-Type": "application/json" } },
  );
}

function errorResponse(message: string, status: number): Response {
  return new Response(
    JSON.stringify({ error: message }),
    { status, headers: { ...CORS, "Content-Type": "application/json" } },
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
