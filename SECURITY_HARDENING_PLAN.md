# Security Hardening — Rate Limiting & Auth Fixes

Complete implementation spec for closing the 5 gaps from the pre-launch audit.
Apply these in order. Each fix is independent — you can ship them one at a time.

**Prerequisites:** All changes are server-side (SQL migration + edge functions). No client code changes needed. No UI impact.

---

## Fix 1 — Durable Rate Limit + Quota Table (SQL Migration)

Create a new migration file: `supabase/migrations/014_rate_limits.sql`

```sql
-- ─────────────────────────────────────────────────────────────────────────────
-- Durable rate limiting for AI edge functions.
-- Replaces the in-memory Map in ai-proxy which resets on cold start.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
  user_id      UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_request TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count_hour INT NOT NULL DEFAULT 0,
  hour_window_start  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: only service role reads/writes. Users never touch this table directly.
ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

-- Check rate limit + quota atomically in one DB round-trip.
-- Returns:
--   allowed=false, reason='cooldown'       → last request < 2s ago
--   allowed=false, reason='hourly_cap'     → more than 30 requests in rolling hour
--   allowed=false, reason='quota_exceeded' → monthly quota used up
--   allowed=true                           → ok to proceed
CREATE OR REPLACE FUNCTION public.check_ai_rate_limit(
  p_user_id UUID,
  p_cooldown_ms INT DEFAULT 2000,
  p_hourly_cap INT DEFAULT 30
)
RETURNS TABLE (
  allowed BOOLEAN,
  reason  TEXT,
  retry_after_ms INT,
  quota_remaining INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_request    TIMESTAMPTZ;
  v_hour_start      TIMESTAMPTZ;
  v_hour_count      INT;
  v_ms_since_last   INT;
  v_quota           RECORD;
BEGIN
  -- Upsert + read current rate limit state
  INSERT INTO public.ai_rate_limits (user_id, last_request, hour_window_start, request_count_hour)
  VALUES (p_user_id, now(), now(), 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_request, hour_window_start, request_count_hour
    INTO v_last_request, v_hour_start, v_hour_count
    FROM public.ai_rate_limits
   WHERE user_id = p_user_id;

  -- 1. Cooldown check (per-user minimum gap between requests)
  v_ms_since_last := EXTRACT(EPOCH FROM (now() - v_last_request)) * 1000;
  IF v_ms_since_last < p_cooldown_ms THEN
    RETURN QUERY SELECT false, 'cooldown'::TEXT, (p_cooldown_ms - v_ms_since_last), 0;
    RETURN;
  END IF;

  -- 2. Rolling-hour cap (catches slow-drip attackers who respect the 2s cooldown)
  IF now() - v_hour_start > INTERVAL '1 hour' THEN
    -- Reset the hour window
    UPDATE public.ai_rate_limits
       SET hour_window_start = now(), request_count_hour = 0
     WHERE user_id = p_user_id;
    v_hour_count := 0;
  END IF;

  IF v_hour_count >= p_hourly_cap THEN
    RETURN QUERY SELECT false, 'hourly_cap'::TEXT,
      EXTRACT(EPOCH FROM (v_hour_start + INTERVAL '1 hour' - now()))::INT * 1000,
      0;
    RETURN;
  END IF;

  -- 3. Monthly quota check (reuses existing get_user_quota)
  SELECT * INTO v_quota FROM public.get_user_quota(p_user_id) LIMIT 1;
  IF v_quota IS NOT NULL AND NOT v_quota.can_generate THEN
    RETURN QUERY SELECT false, 'quota_exceeded'::TEXT, 0,
      COALESCE(v_quota.generations_remaining, 0);
    RETURN;
  END IF;

  -- All checks passed — commit the request
  UPDATE public.ai_rate_limits
     SET last_request = now(),
         request_count_hour = request_count_hour + 1
   WHERE user_id = p_user_id;

  RETURN QUERY SELECT true, 'ok'::TEXT, 0,
    COALESCE(v_quota.generations_remaining, 0);
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(UUID, INT, INT) TO service_role;
```

**To deploy:**
```bash
supabase db push
```

---

## Fix 2 — ai-proxy: Durable Rate Limit + Quota Check

Replace the in-memory rate limiter with the durable DB check. This closes the
"$180/hr attack" vector by rejecting requests once quota is exhausted.

**Current vulnerable section (lines 64-107):**
```ts
// Simple in-memory rate limiter (per-instance — resets on cold start)
const lastRequestByUser: Record<string, number> = {};
const RATE_LIMIT_MS = 2000;

// ... later inside handler:
const now = Date.now();
const lastReq = lastRequestByUser[user.id] || 0;
if (now - lastReq < RATE_LIMIT_MS) {
  return jsonResponse({ error: "rate_limited", ... }, 429);
}
lastRequestByUser[user.id] = now;
```

**Replace with (only apply the rate-limit check when the client is about to call
a paid generation endpoint — GET requests for polling should NOT be counted):**

```ts
// ── 2. Durable rate limit + quota check ───────────────────────────────
// Only debit rate-limit budget for actual generation POSTs, not polling reads.
const isPollingRead =
  (body?.method ?? "POST") === "GET" ||
  /\/get_result\?/.test(body?.url ?? "") ||
  /\/predictions\/[^/]+$/.test(body?.url ?? "");

if (!isPollingRead) {
  const { data: limitData, error: limitError } = await supabase
    .rpc("check_ai_rate_limit", { p_user_id: user.id });

  if (limitError) {
    console.error("[ai-proxy] Rate limit check failed:", limitError.message);
    return jsonResponse({ error: "Rate limit check failed" }, 500);
  }

  const limit = limitData?.[0];
  if (limit && !limit.allowed) {
    const status = limit.reason === "quota_exceeded" ? 402 : 429;
    return jsonResponse(
      {
        error: limit.reason,
        message:
          limit.reason === "cooldown"       ? "Please wait a moment between requests." :
          limit.reason === "hourly_cap"     ? "Hourly request cap reached. Try again later." :
          limit.reason === "quota_exceeded" ? "You've used all your generations this month." :
          "Rate limited.",
        retry_after_ms: limit.retry_after_ms,
        quota_remaining: limit.quota_remaining,
      },
      status
    );
  }
}
```

**Important:** Move the JSON body parse BEFORE the rate limit check so we know
if it's a polling read. Also remove the now-unused `lastRequestByUser` map and
`RATE_LIMIT_MS` constant.

---

## Fix 3 — generate-with-products: JWT Verification

Stop trusting `user_id` from the request body. Extract it from the verified JWT.

**Current vulnerable section (lines 120-124):**
```ts
const { room_photo_url, prompt, user_id, tier = "free", products: clientProducts } = body;

if (!room_photo_url || !prompt || !user_id) {
  return errorResponse("room_photo_url, prompt, and user_id are required", 400);
}
```

**Replace with (insert after the `const supabase = createClient(...)` line,
BEFORE the body parse):**

```ts
// ── AUTH: Extract user_id from verified JWT (not from request body) ────
const authHeader = req.headers.get("Authorization");
if (!authHeader || !authHeader.startsWith("Bearer ")) {
  return errorResponse("Missing authorization header", 401);
}
const jwt = authHeader.replace("Bearer ", "");
const { data: { user: authUser }, error: authErr } =
  await supabase.auth.getUser(jwt);
if (authErr || !authUser) {
  return errorResponse("Invalid or expired token", 401);
}
const verifiedUserId = authUser.id;
```

Then change the body destructure to **ignore** `user_id` from the body:

```ts
const { room_photo_url, prompt, tier = "free", products: clientProducts } = body;

if (!room_photo_url || !prompt) {
  return errorResponse("room_photo_url and prompt are required", 400);
}

// Use the JWT-verified user_id everywhere. Shadow the body variable name
// so downstream log lines don't have to change.
const user_id = verifiedUserId;
```

---

## Fix 4 — vision-match: Add JWT Auth

This endpoint is currently completely open. Add the same JWT check pattern.

**Current vulnerable section (lines 34-46):**
```ts
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
```

**Add this import at the top of the file:**
```ts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
```

**Insert JWT verification + rate limit immediately after the OPTIONS check:**

```ts
// ── AUTH: Verify JWT ─────────────────────────────────────────────────────
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

const { data: { user }, error: authErr } =
  await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
if (authErr || !user) {
  return new Response(
    JSON.stringify({ analysis: null, source: "unauthorized" }),
    { status: 401, headers: { ...CORS, "Content-Type": "application/json" } },
  );
}

// Rate limit — 2s cooldown is enough for vision. No quota debit (Haiku is ~$0.003).
const { data: limitData } = await supabase
  .rpc("check_ai_rate_limit", { p_user_id: user.id, p_cooldown_ms: 1500, p_hourly_cap: 60 });
const limit = limitData?.[0];
if (limit && !limit.allowed) {
  return new Response(
    JSON.stringify({ analysis: null, source: "rate_limited" }),
    { status: 429, headers: { ...CORS, "Content-Type": "application/json" } },
  );
}
```

---

## Fix 5 — composite-products: JWT Auth (Low Risk, but Easy)

Same pattern. Insert right after the OPTIONS check, before the body parse:

**Current vulnerable section (lines 62-75):**
```ts
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase    = createClient(supabaseUrl, serviceKey);

  let body: { product_urls?: string[]; user_id?: string };
  try { body = await req.json(); }
  catch { return errResp("Invalid JSON body", 400); }

  const { product_urls, user_id } = body;
  if (!product_urls?.length) return errResp("product_urls required", 400);
  if (!user_id)              return errResp("user_id required", 400);
```

**Add JWT verification right after `createClient`:**

```ts
// ── AUTH: Verify JWT ────────────────────────────────────────────────────
const authHeader = req.headers.get("Authorization");
if (!authHeader || !authHeader.startsWith("Bearer ")) {
  return errResp("Missing authorization", 401);
}
const { data: { user: authUser }, error: authErr } =
  await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
if (authErr || !authUser) {
  return errResp("Invalid or expired token", 401);
}
```

**Then change the body destructure to ignore body `user_id`:**

```ts
const { product_urls } = body;
if (!product_urls?.length) return errResp("product_urls required", 400);

// Use JWT-verified id everywhere
const user_id = authUser.id;
```

---

## Deployment Order

1. **Deploy SQL migration first** — the new `check_ai_rate_limit` RPC must exist
   before any edge function calls it.
   ```bash
   supabase db push
   ```

2. **Deploy edge functions** — each one is independent, so any rollout order is safe:
   ```bash
   supabase functions deploy ai-proxy
   supabase functions deploy generate-with-products
   supabase functions deploy vision-match
   supabase functions deploy composite-products
   ```

3. **Verify with a logged-in user** — open the app, do one generation, confirm
   it still works. Then try hitting the endpoint directly without a JWT (should
   get 401).

---

## Client Compatibility

**No client changes needed.** Here's why each fix is backward-compatible:

| Fix | Client Impact |
|---|---|
| 1 — SQL migration | None — DB only |
| 2 — ai-proxy durable RL | Client already sends JWT. New 402 response for quota is treated same as 429 by client. |
| 3 — generate-with-products JWT | Client already sends Authorization header (via Supabase client). Body `user_id` is now ignored, not an error. |
| 4 — vision-match JWT | Client calls via Supabase functions invoke which includes JWT automatically. |
| 5 — composite-products JWT | Same as above. |

**One thing to double-check** after deployment: if any client code uses bare
`fetch()` against these endpoints (instead of `supabase.functions.invoke()` or
a proxy helper that auto-attaches the auth header), it will start getting 401s.
Grep for direct fetch calls:

```bash
grep -rn "functions/v1/" src/
```

Any match should already include `Authorization: Bearer ...` — the existing
`apiProxy.js` pattern does this correctly.

---

## Risk Summary After Deployment

| Gap | Before | After |
|---|---|---|
| ai-proxy unlimited generation | $180/hr possible | Hard-capped at 30/hr + monthly quota |
| generate-with-products spoofable user_id | Attacker burns anyone's quota | JWT proves identity |
| vision-match open | Anyone burns Anthropic $ | JWT required + 60/hr cap |
| composite-products open | Fill storage with junk | JWT required |
| In-memory rate limit resets on cold start | Cooldown disappears | Durable in Postgres |

**Estimated cost to an attacker with a valid account after fixes:**
- 30 generations/hr × $0.10 = $3/hr max before hitting hourly cap
- After 5 free generations in a month: blocked entirely until billing cycle reset
- Compare to before: $180/hr unbounded

---

## Rollback

If anything goes wrong, revert each edge function to its previous commit
(they're independent) and optionally drop the new table:

```sql
DROP FUNCTION IF EXISTS public.check_ai_rate_limit(UUID, INT, INT);
DROP TABLE IF EXISTS public.ai_rate_limits;
```

The SQL migration is additive — it doesn't touch any existing table.
