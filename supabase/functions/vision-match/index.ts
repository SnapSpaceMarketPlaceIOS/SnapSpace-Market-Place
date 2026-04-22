/**
 * HomeGenie — vision-match Edge Function
 *
 * Analyzes an AI-generated interior design image using Claude Haiku vision.
 * Describes the furniture actually rendered — not what was in the text prompt.
 * The client re-runs matchProducts() with this description for accurate product matching.
 *
 * Required secrets (Supabase Dashboard → Settings → Edge Functions → Secrets):
 *   ANTHROPIC_API_KEY — Anthropic API key
 *
 * Request:  POST { imageUrl: string, prompt: string }
 * Response: { analysis: string | null, source: "claude" | "unavailable" | "error" | "unauthorized" | "rate_limited" }
 *
 * Auth: Supabase JWT required in Authorization: Bearer header.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const CLAUDE_API_URL = "https://api.anthropic.com/v1/messages";
const MODEL          = "claude-haiku-4-5-20251001";

// Tight system prompt — furniture only, comma-separated, no architecture.
// Short output (≤300 tokens) keeps cost under ~$0.003/call at Haiku pricing.
const SYSTEM_PROMPT =
  "You are analyzing an AI-generated interior design room image. " +
  "Describe ONLY the furniture and decor items visible — not walls, floors, ceilings, windows, or doors. " +
  "Be specific: include shape (curved, angular, round), color, material, and style for each piece. " +
  "Output a single comma-separated list of concise item descriptions (one per piece, ≤10 words each). " +
  "Focus on: sofas, chairs, tables, rugs, lamps, pillows, wall art, shelving, planters, mirrors. " +
  "Example: curved cream boucle sectional sofa, round white marble coffee table with brass base, " +
  "geometric cream area rug, tall arc brass floor lamp, abstract canvas wall art panel";

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  // ── AUTH: Verify JWT ─────────────────────────────────────────────────────
  // Previously this endpoint was completely unauthenticated, allowing anyone
  // to spam Anthropic vision calls (~$0.003 each) on our account.
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ analysis: null, source: "unauthorized" }),
      { status: 401, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, serviceKey);

  const { data: { user: authUser }, error: authErr } =
    await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
  if (authErr || !authUser) {
    return new Response(
      JSON.stringify({ analysis: null, source: "unauthorized" }),
      { status: 401, headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  // Rate limit — Haiku is cheap (~$0.003/call) so we allow more headroom than
  // the image-generation endpoints. 1.5s cooldown + 60/hour cap per user.
  try {
    const { data: limitData } = await supabase
      .rpc("check_ai_rate_limit", {
        p_user_id: authUser.id,
        p_cooldown_ms: 1500,
        p_hourly_cap: 60,
      });
    const limit = limitData?.[0];
    if (limit && !limit.allowed) {
      return new Response(
        JSON.stringify({
          analysis: null,
          source: "rate_limited",
          reason: limit.reason,
          retry_after_ms: limit.retry_after_ms,
        }),
        { status: 429, headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }
  } catch (e) {
    // Don't fail closed on infra error — fall through.
    console.warn("[vision-match] Rate limit check threw:", (e as Error).message);
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    console.warn("[vision-match] ANTHROPIC_API_KEY not set — skipping vision analysis");
    return new Response(
      JSON.stringify({ analysis: null, source: "unavailable" }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }

  let imageUrl: string;
  let prompt   = "";

  try {
    const body = await req.json();
    imageUrl   = body.imageUrl;
    prompt     = body.prompt ?? "";
  } catch {
    return new Response(
      JSON.stringify({ analysis: null, source: "error" }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 400 },
    );
  }

  if (!imageUrl || typeof imageUrl !== "string") {
    return new Response(
      JSON.stringify({ analysis: null, source: "error" }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 400 },
    );
  }

  // Build 69 Commit H: allowlist imageUrl host BEFORE forwarding to Anthropic.
  // Anthropic's vision API fetches the URL server-side against our API
  // key, and every call costs ~$0.003. Without this check an authenticated
  // attacker can pipe arbitrary URLs (large images, slow hosts, any public
  // page) through our Anthropic quota to drive up our bill.
  //
  // The legitimate callers of vision-match pass either a Supabase Storage
  // URL (the normalized room photo) or a Replicate / BFL CDN URL (the
  // generated room). We don't pass raw affiliate product URLs here.
  const VISION_MATCH_ALLOWED_HOSTS = new Set([
    "lqjfnpibbjymhzupqtda.supabase.co", // own storage
    "replicate.delivery",                // Replicate CDN
    "bfldata.ai",                        // BFL output CDN
    "fal.media",                         // FAL output CDN
    "v3.fal.media",                      // FAL CDN variants
  ]);
  try {
    const parsed = new URL(imageUrl);
    const hostAllowed =
      parsed.protocol === "https:" &&
      VISION_MATCH_ALLOWED_HOSTS.has(parsed.hostname);
    if (!hostAllowed) {
      console.warn(`[vision-match] imageUrl host ${parsed.hostname} not in allowlist — rejecting`);
      return new Response(
        JSON.stringify({ analysis: null, source: "error", reason: "host-not-allowed" }),
        { headers: { ...CORS, "Content-Type": "application/json" }, status: 400 },
      );
    }
  } catch {
    return new Response(
      JSON.stringify({ analysis: null, source: "error", reason: "invalid-url" }),
      { headers: { ...CORS, "Content-Type": "application/json" }, status: 400 },
    );
  }

  try {
    const userText = prompt
      ? `The design intent was: "${prompt}". Describe the furniture you actually see in this image.`
      : "Describe the furniture and decor items visible in this image.";

    const response = await fetch(CLAUDE_API_URL, {
      method:  "POST",
      headers: {
        "Content-Type":    "application/json",
        "x-api-key":       apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 300,
        system:     SYSTEM_PROMPT,
        messages: [
          {
            role:    "user",
            content: [
              {
                type:   "image",
                source: { type: "url", url: imageUrl },
              },
              {
                type: "text",
                text: userText,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("[vision-match] Claude API error:", response.status, errText);
      return new Response(
        JSON.stringify({ analysis: null, source: "error" }),
        { headers: { ...CORS, "Content-Type": "application/json" } },
      );
    }

    const data     = await response.json();
    const analysis = (data?.content?.[0]?.text ?? "").trim() || null;

    console.log("[vision-match] Analysis:", analysis);

    return new Response(
      JSON.stringify({ analysis, source: "claude" }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("[vision-match] Unexpected error:", err);
    return new Response(
      JSON.stringify({ analysis: null, source: "error" }),
      { headers: { ...CORS, "Content-Type": "application/json" } },
    );
  }
});
