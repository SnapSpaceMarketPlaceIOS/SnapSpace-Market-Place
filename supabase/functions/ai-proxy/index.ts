/**
 * ai-proxy — Secure API proxy for AI providers.
 *
 * The client sends requests here with a Supabase JWT. This function:
 *   1. Verifies the JWT (auth required)
 *   2. Validates the target URL against a per-provider allowlist
 *   3. Rate-limits per user (durable, atomic — see migration 023)
 *   4. Injects the correct secret API key for the provider
 *   5. Forwards the request and returns the response
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
 *
 * ── Build 65 (Gate C) security hardening ──────────────────────────────────
 * This version retires three latent vulnerabilities flagged in the Gate C
 * audit:
 *
 *   Bug #2 (URL allowlist): Prior versions forwarded to ANY `url` the client
 *     supplied with the server's secret API key attached. An attacker with a
 *     valid JWT could set url: "https://attacker.com/collect" and exfiltrate
 *     REPLICATE_API_TOKEN etc. in the Authorization header. Now every URL is
 *     parsed and its hostname matched against a per-provider allowlist; the
 *     path prefix is also validated. Non-matching URLs → 400 before any key
 *     is ever touched.
 *
 *   Bug #3 (CORS lockdown): Prior versions returned Access-Control-Allow-
 *     Origin: * on every response. Since the key-bearing response body flows
 *     through this proxy, a permissive CORS policy means any malicious web
 *     origin (if the JWT ever leaked to a browser tab) could call this
 *     endpoint. Native React Native fetch() does not consult CORS, so
 *     removing the wildcard has zero impact on the app but closes the
 *     browser attack surface. OPTIONS preflights now respond with no
 *     Allow-Origin, which is a hard browser reject.
 *
 *   Bug #5 (polling-skip spoofing): Prior versions used OR logic:
 *       isPollingRead = method === 'GET' || /\/get_result\?/.test(url) || …
 *     An attacker could send method='POST' with a URL crafted to match the
 *     polling regex (e.g. containing "/get_result?" in the query), bypassing
 *     the rate limiter on actual generation POSTs. We now AND the method
 *     with the path-pattern check — only GET requests can skip the debit.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// ── Build 65 CORS lockdown ────────────────────────────────────────────────
// No Access-Control-Allow-Origin header at all. The app is native React
// Native — fetch() never sends an Origin header and doesn't require CORS.
// Dropping the wildcard means ANY browser-originated request is rejected
// by the browser itself, which is the desired defense-in-depth posture for
// a key-bearing proxy. Browser devs/preview tools must route via the __DEV__
// directFetch path instead.
const RESPONSE_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  // Build 65: explicitly whitelist the only methods we accept.
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ── Build 65 URL allowlist ────────────────────────────────────────────────
// Each provider declares the hostnames it is allowed to talk to and the path
// prefix(es) that are valid. Both the hostname AND path must match for a
// request to be forwarded. Anything else → 400 "url not allowed".
//
// Hostnames are matched via exact-equal OR regex (for FAL's multi-region
// infrastructure and BFL's regional endpoints). No wildcards — we enumerate
// every valid form.
type ProviderConfig = {
  envKey: string;
  authHeader: (key: string) => Record<string, string>;
  allowedHosts: Array<string | RegExp>;
  allowedPathPrefixes: string[];
};

const PROVIDERS: Record<string, ProviderConfig> = {
  replicate: {
    envKey: "REPLICATE_API_TOKEN",
    authHeader: (key) => ({ Authorization: `Bearer ${key}` }),
    // Build 65: api.replicate.com is the only valid host. v1 path prefix
    // covers predictions, models, collections — everything replicate.js
    // actually uses.
    allowedHosts: ["api.replicate.com"],
    allowedPathPrefixes: ["/v1/"],
  },
  bfl: {
    envKey: "BFL_API_KEY",
    authHeader: (key) => ({ "X-Key": key }),
    // BFL ships region-specific endpoints: api.bfl.ai, api.us1.bfl.ai,
    // api.us.bfl.ai, api.eu.bfl.ai, api.eu1.bfl.ai. Regex covers them all
    // plus any future region without allowing api.bfl.ai.attacker.com.
    allowedHosts: [/^api(\.[a-z0-9]+)?\.bfl\.ai$/],
    allowedPathPrefixes: ["/v1/"],
  },
  anthropic: {
    envKey: "ANTHROPIC_API_KEY",
    authHeader: (key) => ({
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
    }),
    allowedHosts: ["api.anthropic.com"],
    allowedPathPrefixes: ["/v1/"],
  },
  fal: {
    envKey: "FAL_API_KEY",
    authHeader: (key) => ({ Authorization: `Key ${key}` }),
    // FAL queue submissions hit queue.fal.run; direct inference hits
    // fal.run; the rest API uses rest.fal.run. All legitimate fal paths
    // start with /fal-ai/ (the namespace prefix for every model).
    allowedHosts: ["queue.fal.run", "fal.run", "rest.fal.run"],
    allowedPathPrefixes: ["/fal-ai/"],
  },
};

/**
 * Validate a client-supplied URL against a provider's allowlist.
 * Returns null on success, or a reason string on rejection.
 */
function validateProviderUrl(
  provider: string,
  rawUrl: unknown,
  cfg: ProviderConfig
): string | null {
  if (typeof rawUrl !== "string" || !rawUrl) {
    return "url must be a non-empty string";
  }
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "url is not a valid absolute URL";
  }

  // Only https — no http, no data:, no file:, no anything exotic.
  if (parsed.protocol !== "https:") {
    return `url must use https (got ${parsed.protocol})`;
  }

  const hostname = parsed.hostname.toLowerCase();
  const hostOk = cfg.allowedHosts.some((h) =>
    typeof h === "string" ? hostname === h : h.test(hostname)
  );
  if (!hostOk) {
    return `host ${hostname} is not allowed for provider ${provider}`;
  }

  const pathOk = cfg.allowedPathPrefixes.some((p) =>
    parsed.pathname.startsWith(p)
  );
  if (!pathOk) {
    return `path ${parsed.pathname} is not allowed for provider ${provider}`;
  }

  return null;
}

/**
 * Build 65 polling-skip gate (Bug #5 fix).
 *
 * A request may skip the rate-limit debit ONLY IF:
 *   1. method is GET (spoof-proof — generation POSTs never match), AND
 *   2. the URL path matches a known polling pattern.
 *
 * The old implementation used OR, so an attacker could send method='POST'
 * with a URL crafted to contain "/get_result?" in the query and skip the
 * debit on actual generation calls. The AND here closes that.
 */
function isPollingRead(method: string, url: string): boolean {
  if (method !== "GET") return false;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  const p = parsed.pathname;
  // Replicate: GET /v1/predictions/<id>
  if (/^\/v1\/predictions\/[A-Za-z0-9_-]+$/.test(p)) return true;
  // FAL: GET /fal-ai/.../requests/<id>/status  or  .../requests/<id>
  if (/^\/fal-ai\/.+\/requests\/[A-Za-z0-9_-]+(\/status)?$/.test(p)) return true;
  // BFL: GET /v1/get_result?id=<id>
  if (p === "/v1/get_result") return true;
  return false;
}

Deno.serve(async (req: Request) => {
  // CORS preflight — respond without Allow-Origin so any browser origin is
  // rejected at the preflight stage (Build 65 lockdown).
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 204, headers: RESPONSE_HEADERS });
  }

  // Only POST is meaningful; GET/PUT/DELETE on the proxy itself is nonsense.
  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405);
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

    // ── 2. Parse + validate the request envelope ─────────────────────────
    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return jsonResponse({ error: "Invalid JSON body" }, 400);
    }
    const { provider, method, url, headers: extraHeaders, body: reqBody } =
      body as {
        provider?: string;
        method?: string;
        url?: string;
        headers?: Record<string, string>;
        body?: unknown;
      };

    if (!provider || !PROVIDERS[provider]) {
      return jsonResponse(
        {
          error: `Unknown provider: ${provider}. Supported: ${Object.keys(
            PROVIDERS
          ).join(", ")}`,
        },
        400
      );
    }
    const providerConfig = PROVIDERS[provider];

    const normalizedMethod = (method || "POST").toUpperCase();
    if (normalizedMethod !== "GET" && normalizedMethod !== "POST") {
      return jsonResponse(
        { error: `Method ${normalizedMethod} not allowed` },
        400
      );
    }

    // Build 65 Bug #2 fix: validate URL BEFORE touching any secret.
    const urlErr = validateProviderUrl(provider, url, providerConfig);
    if (urlErr) {
      console.warn(
        `[ai-proxy] url rejected for user=${user.id} provider=${provider}: ${urlErr}`
      );
      return jsonResponse({ error: urlErr }, 400);
    }

    // ── 3. Durable rate limit + quota check ──────────────────────────────
    // Build 65 Bug #5 fix: polling-skip requires method=GET AND a known
    // polling path. A POST can never skip the debit regardless of URL.
    const skipDebit = isPollingRead(normalizedMethod, url!);

    if (!skipDebit) {
      const { data: limitData, error: limitError } = await supabase.rpc(
        "check_ai_rate_limit",
        { p_user_id: user.id }
      );

      if (limitError) {
        console.error(
          "[ai-proxy] Rate limit check failed:",
          limitError.message
        );
        // Don't fail closed on an infra error — fall through. The cooldown
        // table upsert is best-effort. If the RPC is truly down, the monthly
        // quota check downstream in generate-with-products still applies.
      } else {
        const limit = limitData?.[0];
        if (limit && !limit.allowed) {
          const status = limit.reason === "quota_exceeded" ? 402 : 429;
          return jsonResponse(
            {
              error: limit.reason,
              message:
                limit.reason === "cooldown"
                  ? "Please wait a moment between requests."
                  : limit.reason === "hourly_cap"
                  ? "Hourly request cap reached. Try again later."
                  : limit.reason === "quota_exceeded"
                  ? "You've used all your generations this month."
                  : "Rate limited.",
              retry_after_ms: limit.retry_after_ms,
              quota_remaining: limit.quota_remaining,
            },
            status
          );
        }
      }
    }

    // ── 4. Get secret key ───────────────────────────────────────────────
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
      method: normalizedMethod,
      headers: forwardHeaders,
    };

    if (reqBody && normalizedMethod !== "GET") {
      fetchOptions.body = JSON.stringify(reqBody);
    }

    const apiResponse = await fetch(url!, fetchOptions);

    // ── 6. Return response ──────────────────────────────────────────────
    const responseBody = await apiResponse.text();
    return new Response(responseBody, {
      status: apiResponse.status,
      headers: {
        ...RESPONSE_HEADERS,
        "Content-Type":
          apiResponse.headers.get("Content-Type") || "application/json",
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
    headers: { ...RESPONSE_HEADERS, "Content-Type": "application/json" },
  });
}
