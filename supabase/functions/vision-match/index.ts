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
 * Response: { analysis: string | null, source: "claude" | "unavailable" | "error" }
 */

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
