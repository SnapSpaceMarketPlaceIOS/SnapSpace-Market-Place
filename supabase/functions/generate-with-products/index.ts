/**
 * SnapSpace — generate-with-products Edge Function (v5)
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
const BFL_BASE_URL        = "https://api.bfl.ml/v1";
const BFL_MODEL_ENDPOINT  = "flux-pro-2-max";   // FLUX.2 [MAX] direct endpoint

// ── Output dimensions (optimized for mobile — still sharp, fewer MP = lower cost)
const OUTPUT_WIDTH  = 896;
const OUTPUT_HEIGHT = 896;

// ── Max product reference images to send (2 = best cost/quality ratio)
const MAX_PRODUCT_REFS = 2;

// ── Cost estimate (BFL direct, optimized image sizes)
const COST_BFL_USD = 0.11;

// ── Polling config ────────────────────────────────────────────────────────────
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS        = 80;   // 80 × 3s = 4-min timeout

// ── Quality suffix appended to every prompt ──────────────────────────────────
const QUALITY_SUFFIX =
  "8k interior design photography, natural lighting, photorealistic, editorial, Architectural Digest.";

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildFlux2MaxPrompt(userPrompt: string, products: any[]): string {
  const placements: string[] = [];
  products.slice(0, MAX_PRODUCT_REFS).forEach((p, i) => {
    const category = (p.category || p.name || "furniture piece")
      .replace(/-/g, " ")
      .toLowerCase();
    placements.push(`${category} → image ${i + 2}`);
  });

  const placementStr = placements.length > 0
    ? `Only replace furniture to match the references: [${placements.join(", ")}].`
    : "Replace furniture with pieces that match the room's style.";

  return [
    "This is a scene edit, not a new generation.",
    "Keep image 1 room exactly — same walls, floor, ceiling, lighting, camera angle, and spatial layout.",
    "Do not change room architecture.",
    placementStr,
    userPrompt,
    QUALITY_SUFFIX,
  ].join(" ");
}

// ── Shrink Amazon/Wayfair image URLs to 300px thumbnails ─────────────────────
// This cuts input megapixels by ~85% (640px→300px = 0.41MP→0.09MP per image).
// The model needs the product's visual identity — high resolution is wasted.
function optimizeProductImageUrl(url: string): string {
  if (!url) return url;
  return url
    .replace(/_AC_SL\d+_/g,  "_AC_SL300_")   // Amazon SL size codes
    .replace(/_AC_UL\d+_/g,  "_AC_UL300_")   // Amazon UL size codes
    .replace(/_SL\d+_\./g,   "_SL300_.")      // bare SL codes
    .replace(/_UL\d+_\./g,   "_UL300_.")      // bare UL codes
    .replace(/\?.*$/,        "");             // strip query params
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

  let body: any;
  try {
    body = await req.json();
  } catch {
    return errorResponse("Invalid JSON body", 400);
  }

  const { room_photo_url, prompt, user_id, tier = "free", products: clientProducts } = body;

  if (!room_photo_url || !prompt || !user_id) {
    return errorResponse("room_photo_url, prompt, and user_id are required", 400);
  }

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
          upgrade_url: "snapspace://premium",
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

  // Top 2 products only — reduces input megapixels, cuts cost further
  const topProducts = normalizedProducts
    .filter((p) => p.image_url)
    .slice(0, MAX_PRODUCT_REFS);

  // Optimize product image URLs to 300px thumbnails (0.09MP each vs 0.41MP)
  const productImageUrls = topProducts.map((p) =>
    optimizeProductImageUrl(p.image_url as string)
  );

  const inputImages = [room_photo_url, ...productImageUrls];
  const generationPrompt = buildFlux2MaxPrompt(prompt, topProducts);

  console.log(`[gen] input_images: ${inputImages.length} (1 room + ${productImageUrls.length} product refs)`);
  console.log(`[gen] Output: ${OUTPUT_WIDTH}×${OUTPUT_HEIGHT} (${((OUTPUT_WIDTH * OUTPUT_HEIGHT) / 1_000_000).toFixed(2)} MP)`);
  console.log(`[gen] Estimated cost: ~$${COST_BFL_USD}`);

  let generatedImageUrl: string;
  try {
    if (useBFL) {
      generatedImageUrl = await runBFL(bflKey!, generationPrompt, inputImages);
    } else {
      // Replicate fallback (if no BFL key configured)
      generatedImageUrl = await runReplicate(
        replicateToken!,
        "black-forest-labs/flux-2-max",
        null,
        {
          prompt:          generationPrompt,
          input_images:    inputImages,
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
    await logGeneration(supabase, { user_id, prompt, room_image_url: room_photo_url, products: normalizedProducts, style_tags: styleTags });
    return errorResponse(`Generation failed: ${e.message}`, 500);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 3: Log + Step 4: Increment quota
  // ────────────────────────────────────────────────────────────────────────────
  const duration = Date.now() - startTime;
  console.log(`[gen] Done | duration=${duration}ms | provider=${useBFL ? "BFL" : "Replicate"} | cost=$${COST_BFL_USD}`);

  await logGeneration(supabase, {
    user_id,
    prompt,
    room_image_url: room_photo_url,
    products:       normalizedProducts.slice(0, 6),
    style_tags:     styleTags,
  });

  await supabase.rpc("increment_generation_count", { p_user_id: user_id });

  // ── Step 5: Return result ─────────────────────────────────────────────────
  return successResponse({
    image_url:        generatedImageUrl,
    products:         normalizedProducts.slice(0, 6),
    tier,
    cost_usd:         COST_BFL_USD,
    duration_ms:      duration,
    pipeline:         "v5-bfl",
    provider:         useBFL ? "bfl-direct" : "replicate-fallback",
  });
});

// ── BFL Direct API ─────────────────────────────────────────────────────────────
//
// BFL charges per total megapixel (input + output).
// Auth: X-Key header (not Bearer token).
// Polling: GET /v1/get_result?id={id}
// Status values: "Queued" | "Content Moderated" | "Request Moderated" | "Ready" | "Error"

async function runBFL(
  apiKey: string,
  prompt: string,
  inputImages: string[],
): Promise<string> {
  const endpoint = `${BFL_BASE_URL}/${BFL_MODEL_ENDPOINT}`;

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
      width:            OUTPUT_WIDTH,
      height:           OUTPUT_HEIGHT,
      input_images:     inputImages,
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

  if (!predictionId) {
    throw new Error(`BFL did not return a prediction ID. Response: ${JSON.stringify(submitted).substring(0, 200)}`);
  }

  console.log(`[bfl] Prediction submitted | id=${predictionId}`);

  // Poll until ready
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS);

    const pollRes = await fetch(
      `${BFL_BASE_URL}/get_result?id=${predictionId}`,
      { headers: { "X-Key": apiKey, "Accept": "application/json" } }
    );

    if (!pollRes.ok) {
      console.warn(`[bfl] Poll failed (${pollRes.status}) — retrying...`);
      continue;
    }

    const polled = await pollRes.json();
    const status = polled.status;

    console.log(`[bfl] Poll ${i + 1}/${MAX_POLLS} | status=${status}`);

    if (status === "Ready") {
      const imageUrl = polled.result?.sample;
      if (!imageUrl) throw new Error("BFL returned Ready but no image URL in result.sample");
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
