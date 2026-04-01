/**
 * SnapSpace — generate-with-products Edge Function (v4)
 *
 * Product-aware room generation using flux-2-max with product reference images.
 *
 *   Step 0: Quota check — free tier (3/month) or premium (unlimited)
 *   Step 1: Product selection — use client-provided products or fall back to catalog_products DB
 *   Step 2: Single flux-2-max call with input_images = [room_photo, product1, product2, ...]
 *   Step 3: Log to generation_log table
 *   Step 4: Increment quota
 *   Step 5: Return generated image URL + products
 *
 * Cost per generation:
 *   COST_FLUX2_MAX_USD = $0.15 (estimate for flux-2-max per run)
 *
 * Required secrets:
 *   REPLICATE_API_TOKEN       — Replicate API key
 *   SUPABASE_URL              — Auto-set
 *   SUPABASE_SERVICE_ROLE_KEY — Auto-set
 *
 * Request body:
 *   {
 *     room_photo_url: string,   // public URL of user's room photo (Supabase Storage)
 *     prompt: string,           // user's design prompt
 *     user_id: string,          // auth user ID
 *     tier?: "free" | "premium" // defaults to "free"
 *     products?: Array<{        // optional — if provided, skips DB product selection
 *       id: string,
 *       name: string,
 *       brand: string,
 *       image_url: string,
 *       affiliate_url: string,
 *       category: string,
 *       price: number,
 *     }>
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Model config ──────────────────────────────────────────────────────────────
const FLUX2_MAX_MODEL = "black-forest-labs/flux-2-max";

// Cost constant (USD estimate for flux-2-max per run)
const COST_FLUX2_MAX_USD = 0.15;

// Replicate polling
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS        = 80;   // 80 × 3s = 4-min timeout

// ── Prompt helpers ────────────────────────────────────────────────────────────

const QUALITY_SUFFIX =
  "8k interior design photography, natural lighting, photorealistic, editorial, Architectural Digest.";

/**
 * Build the flux-2-max prompt for product-reference room editing.
 *
 * Tells the model to treat image 1 as the room to preserve and images 2+ as
 * product references to swap in. Product categories are mapped to image indices.
 *
 * @param {string} userPrompt - The user's raw design prompt
 * @param {any[]}  products   - Array of product objects with category field
 * @returns {string}
 */
function buildFlux2MaxPrompt(userPrompt: string, products: any[]): string {
  // Build per-product placement instructions (image 2, 3, 4, 5)
  const placements: string[] = [];
  products.slice(0, 4).forEach((p, i) => {
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

// ── Main handler ──────────────────────────────────────────────────────────────

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  const supabaseUrl    = Deno.env.get("SUPABASE_URL")!;
  const serviceKey     = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const replicateToken = Deno.env.get("REPLICATE_API_TOKEN");

  if (!replicateToken) {
    return errorResponse("REPLICATE_API_TOKEN not configured", 500);
  }

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
  // Fail open — quota issues should never block generation.
  // ────────────────────────────────────────────────────────────────────────────
  console.log(`[gen] Step 0: Quota check | user=${user_id} | tier=${tier}`);

  const { data: quotaData, error: quotaError } = await supabase
    .rpc("get_user_quota", { p_user_id: user_id });

  if (quotaError) {
    console.error("[gen] Quota check failed:", quotaError.message);
    // Don't block generation on quota check failure — log and continue
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
  // If client sent products, use them directly — skip DB lookup.
  // Otherwise fall back to catalog_products table filtered by style.
  // ────────────────────────────────────────────────────────────────────────────
  console.log("[gen] Step 1: Product selection");

  const styleTags = detectStyles(prompt);
  let selectedProducts: any[] = [];

  if (clientProducts && Array.isArray(clientProducts) && clientProducts.length > 0) {
    // Use client-provided products directly — no re-matching needed
    selectedProducts = clientProducts;
    console.log(`[gen] Product selection: ${selectedProducts.length} from client (pre-matched)`);
  } else {
    // Fallback: fetch from catalog_products table by style + room type
    const { data: fallbackProducts } = await supabase
      .from("catalog_products")
      .select("id, name, brand, price, price_display, image_url, affiliate_url, category, visual_description, dominant_colors")
      .contains("styles", styleTags.length > 0 ? [styleTags[0]] : ["modern"])
      .limit(6);

    selectedProducts = fallbackProducts ?? [];
    console.log(`[gen] Product selection: ${selectedProducts.length} via DB fallback`);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 2: flux-2-max generation with product reference images
  // input_images = [room_photo_url, product1.image_url, product2.image_url, ...]
  // ────────────────────────────────────────────────────────────────────────────
  console.log("[gen] Step 2: flux-2-max generation with product references");

  // Normalise product image URL field — client sends image_url, DB also uses image_url,
  // but local catalog products may have imageUrl (camelCase).
  const normalizedProducts = selectedProducts.map((p) => ({
    ...p,
    image_url: p.image_url || p.imageUrl || null,
  }));

  // Build input_images: room photo first, then up to 4 product images
  const productImageUrls = normalizedProducts
    .filter((p) => p.image_url)
    .slice(0, 4)
    .map((p) => p.image_url as string);

  const inputImages = [room_photo_url, ...productImageUrls];

  const generationPrompt = buildFlux2MaxPrompt(prompt, normalizedProducts);
  console.log(`[gen] Prompt (${generationPrompt.length} chars):`, generationPrompt.substring(0, 150));
  console.log(`[gen] input_images: ${inputImages.length} (1 room + ${productImageUrls.length} products)`);

  let generatedImageUrl: string;
  try {
    generatedImageUrl = await runReplicate(
      replicateToken,
      FLUX2_MAX_MODEL,
      null,   // official model — no version hash needed
      {
        prompt:        generationPrompt,
        input_images:  inputImages,
        aspect_ratio:  "match_input_image",
        resolution:    "1 MP",
        output_format: "webp",
        output_quality: 95,
        safety_tolerance: 5,
        seed: Math.floor(Math.random() * 999999999),
      }
    );
    console.log(`[gen] flux-2-max complete | url=${generatedImageUrl.substring(0, 60)}...`);
  } catch (e: any) {
    await logGeneration(supabase, {
      user_id,
      prompt,
      room_image_url: room_photo_url,
      products: selectedProducts,
      vision_analysis: null,
      style_tags: styleTags,
    });
    return errorResponse(`Generation failed: ${e.message}`, 500);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // STEP 3: Log generation to generation_log table
  // Columns: id, user_id, prompt, room_image_url, products (jsonb),
  //          vision_analysis (text), style_tags (text[]), created_at
  // ────────────────────────────────────────────────────────────────────────────
  const duration = Date.now() - startTime;
  console.log(`[gen] Complete | duration=${duration}ms | cost=$${COST_FLUX2_MAX_USD}`);

  await logGeneration(supabase, {
    user_id,
    prompt,
    room_image_url: room_photo_url,
    products:       normalizedProducts.slice(0, 6),
    vision_analysis: null,
    style_tags:     styleTags,
  });

  // ── Step 4: Increment quota ───────────────────────────────────────────────
  await supabase.rpc("increment_generation_count", { p_user_id: user_id });

  // ── Step 5: Return result ─────────────────────────────────────────────────
  return successResponse({
    image_url:   generatedImageUrl,
    products:    normalizedProducts.slice(0, 6),
    tier,
    cost_usd:    COST_FLUX2_MAX_USD,
    duration_ms: duration,
    pipeline:    "v4",
  });
});

// ── Detection helpers ─────────────────────────────────────────────────────────

function detectStyles(prompt: string): string[] {
  const styles: string[] = [];
  const p = prompt.toLowerCase();
  const MAP: Record<string, string> = {
    "minimalist": "minimalist", "modern": "modern", "japandi": "japandi",
    "mid-century": "mid-century", "mid century": "mid-century",
    "bohemian": "bohemian", "boho": "bohemian", "coastal": "coastal",
    "rustic": "rustic", "farmhouse": "farmhouse", "industrial": "industrial",
    "scandinavian": "scandinavian", "nordic": "scandinavian",
    "dark luxe": "dark-luxe", "glam": "glam", "art deco": "art-deco",
  };
  for (const [key, val] of Object.entries(MAP)) {
    if (p.includes(key)) styles.push(val);
  }
  return styles.length > 0 ? styles : ["contemporary"];
}

// ── Replicate API helpers ─────────────────────────────────────────────────────

async function runReplicate(
  token: string,
  model: string,
  version: string | null,
  input: Record<string, any>
): Promise<string> {
  const url = version
    ? "https://api.replicate.com/v1/predictions"
    : `https://api.replicate.com/v1/models/${model}/predictions`;

  const bodyPayload = version
    ? { version, input }
    : { input };

  const submitRes = await fetch(url, {
    method: "POST",
    headers: {
      Authorization:  `Bearer ${token}`,
      "Content-Type": "application/json",
      "Prefer":       "wait",   // wait up to 60s for fast models
    },
    body: JSON.stringify(bodyPayload),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`Replicate submit failed (${submitRes.status}): ${err.substring(0, 200)}`);
  }

  const prediction = await submitRes.json();

  // Already completed (Prefer: wait worked)
  if (prediction.status === "succeeded") {
    return extractImageUrl(prediction.output);
  }

  if (prediction.status === "failed") {
    throw new Error(`Replicate prediction failed: ${prediction.error}`);
  }

  // Poll for completion
  const predictionId = prediction.id;
  for (let i = 0; i < MAX_POLLS; i++) {
    await sleep(POLL_INTERVAL_MS);

    const pollRes = await fetch(
      `https://api.replicate.com/v1/predictions/${predictionId}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    const polled = await pollRes.json();

    if (polled.status === "succeeded") return extractImageUrl(polled.output);
    if (polled.status === "failed")    throw new Error(`Prediction failed: ${polled.error}`);
  }

  throw new Error("Replicate prediction timed out after 4 minutes");
}

function extractImageUrl(output: any): string {
  if (typeof output === "string")           return output;
  if (Array.isArray(output) && output[0])  return output[0];
  if (output?.url)                          return output.url;
  throw new Error("Could not extract image URL from Replicate output");
}

// ── Database helpers ──────────────────────────────────────────────────────────

async function logGeneration(supabase: any, data: {
  user_id: string;
  prompt: string;
  room_image_url: string;
  products: any[];
  vision_analysis: string | null;
  style_tags: string[];
}) {
  const { error } = await supabase.from("generation_log").insert({
    user_id:         data.user_id,
    prompt:          data.prompt,
    room_image_url:  data.room_image_url,
    products:        data.products,
    vision_analysis: data.vision_analysis,
    style_tags:      data.style_tags,
  });

  if (error) {
    console.error("[gen] Failed to log generation:", error.message);
  }
}

// ── Response helpers ──────────────────────────────────────────────────────────

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
