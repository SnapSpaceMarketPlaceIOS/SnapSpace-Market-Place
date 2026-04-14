/**
 * ai-proxy — Secure API proxy for AI providers.
 *
 * The client sends requests here with a Supabase JWT. This function:
 *   1. Verifies the JWT (auth required)
 *   2. Rate-limits per user (min 2s between generation requests)
 *   3. Injects the correct secret API key for the provider
 *   4. Forwards the request and returns the response
 *
 * Supported providers:
 *   - replicate  (Authorization: Bearer TOKEN)
 *   - bfl        (X-Key: KEY)
 *   - anthropic  (x-api-key: KEY)
 *   - fal        (Authorization: Key KEY)
 *
 * Required secrets (Supabase Dashboard → Edge Functions → Secrets):
 *   REPLICATE_API_TOKEN
 *   BFL_API_KEY
 *   ANTHROPIC_API_KEY
 *   FAL_API_KEY
 *
 * Request format:
 *   POST /functions/v1/ai-proxy
 *   Authorization: Bearer <supabase-jwt>
 *   Body: {
 *     provider: "replicate" | "bfl" | "anthropic" | "fal",
 *     method: "POST" | "GET",
 *     url: "https://api.replicate.com/v1/models/.../predictions",
 *     headers: { ... },    // optional extra headers (Content-Type, etc.)
 *     body: { ... }        // request body for POST requests
 *   }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Provider → secret env var name + auth header format
const PROVIDERS: Record<
  string,
  { envKey: string; authHeader: (key: string) => Record<string, string> }
> = {
  replicate: {
    envKey: "REPLICATE_API_TOKEN",
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
  },
  bfl: {
    envKey: "BFL_API_KEY",
    authHeader: (key) => ({ "X-Key": key }),
  },
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    authHeader: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    }),
  },
};

// Simple in-memory rate limiter (per-instance — resets on cold start)
const lastRequestByUser: Record<string, number> = {};
const RATE_LIMIT_MS = 2000; // 2 seconds between requests

Deno.serve(async (req: Request) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS });
  }

  try {
    // ── 1. Verify JWT ─────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing authorization" }, 401);
    }

    const jwt = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(jwt);
    if (authError || !user) {
      return jsonResponse({ error: "Invalid or expired token" }, 401);
    }

    // ── 2. Rate limit ───────────────────────────────────────────────────
    const now = Date.now();
    const lastReq = lastRequestByUser[user.id] || 0;
    if (now - lastReq < RATE_LIMIT_MS) {
      return jsonResponse(
        {
          error: "rate_limited",
          message: "Please wait a moment between requests.",
          retry_after_ms: RATE_LIMIT_MS - (now - lastReq),
        },
        429
      );
    }
    lastRequestByUser[user.id] = now;

    // ── 3. Parse request ────────────────────────────────────────────────
    const body = await req.json();
    const { provider, method, url, headers: extraHeaders, body: reqBody } = body;

    if (!provider || !PROVIDERS[provider]) {
      return jsonResponse(
        { error: `Unknown provider: ${provider}. Supported: ${Object.keys(PROVIDERS).join(", ")}` },
        400
      );
    }
    if (!url) {
      return jsonResponse({ error: "Missing url field" }, 400);
    }

    // ── 4. Get secret key ───────────────────────────────────────────────
    const providerConfig = PROVIDERS[provider];
    const secretKey = Deno.env.get(providerConfig.envKey);
    if (!secretKey) {
      console.error(
        `[ai-proxy] Secret ${providerConfig.envKey} not configured`
      );
      return jsonResponse(
        { error: `AI provider ${provider} is not configured on the server.` },
        500
      );
    }

    // ── 5. Forward request ──────────────────────────────────────────────
    const forwardHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      ...providerConfig.authHeader(secretKey),
      ...(extraHeaders || {}),
    };

    const fetchOptions: RequestInit = {
      method: method || "POST",
      headers: forwardHeaders,
    };

    if (reqBody && (method || "POST") !== "GET") {
      fetchOptions.body = JSON.stringify(reqBody);
    }

    const apiResponse = await fetch(url, fetchOptions);

    // ── 6. Return response ──────────────────────────────────────────────
    const responseBody = await apiResponse.text();
    return new Response(responseBody, {
      status: apiResponse.status,
      headers: {
        ...CORS,
        "Content-Type": apiResponse.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (err) {
    console.error("[ai-proxy] Unhandled error:", err);
    return jsonResponse(
      { error: "Internal proxy error", details: (err as Error).message },
      500
    );
  }
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
