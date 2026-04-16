-- ─────────────────────────────────────────────────────────────────────────────
-- 014_rate_limits.sql
--
-- Durable rate limiting for AI edge functions.
-- Replaces the in-memory Map in ai-proxy which resets on cold start.
--
-- Provides check_ai_rate_limit(user_id, cooldown_ms, hourly_cap) RPC that
-- atomically enforces:
--   1. Per-user cooldown (default 2s between requests)
--   2. Rolling-hour cap (default 30 requests/hour)
--   3. Monthly quota (via existing get_user_quota)
--
-- Returns { allowed, reason, retry_after_ms, quota_remaining }.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.ai_rate_limits (
  user_id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  last_request       TIMESTAMPTZ NOT NULL DEFAULT now(),
  request_count_hour INT         NOT NULL DEFAULT 0,
  hour_window_start  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS: only service role reads/writes. Users never touch this table directly.
ALTER TABLE public.ai_rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_ai_rate_limit(
  p_user_id     UUID,
  p_cooldown_ms INT DEFAULT 2000,
  p_hourly_cap  INT DEFAULT 30
)
RETURNS TABLE (
  allowed         BOOLEAN,
  reason          TEXT,
  retry_after_ms  INT,
  quota_remaining INT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_last_request   TIMESTAMPTZ;
  v_hour_start     TIMESTAMPTZ;
  v_hour_count     INT;
  v_ms_since_last  INT;
  v_quota          RECORD;
  v_quota_remaining INT;
BEGIN
  -- Upsert + read current rate limit state
  INSERT INTO public.ai_rate_limits (user_id, last_request, hour_window_start, request_count_hour)
  VALUES (p_user_id, now() - INTERVAL '10 seconds', now(), 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_request, hour_window_start, request_count_hour
    INTO v_last_request, v_hour_start, v_hour_count
    FROM public.ai_rate_limits
   WHERE user_id = p_user_id;

  -- 1. Cooldown check (per-user minimum gap between requests)
  v_ms_since_last := (EXTRACT(EPOCH FROM (now() - v_last_request)) * 1000)::INT;
  IF v_ms_since_last < p_cooldown_ms THEN
    RETURN QUERY SELECT false, 'cooldown'::TEXT, (p_cooldown_ms - v_ms_since_last), 0;
    RETURN;
  END IF;

  -- 2. Rolling-hour cap (catches slow-drip attackers who respect the cooldown)
  IF now() - v_hour_start > INTERVAL '1 hour' THEN
    UPDATE public.ai_rate_limits
       SET hour_window_start = now(), request_count_hour = 0
     WHERE user_id = p_user_id;
    v_hour_count := 0;
    v_hour_start := now();
  END IF;

  IF v_hour_count >= p_hourly_cap THEN
    RETURN QUERY SELECT
      false,
      'hourly_cap'::TEXT,
      (EXTRACT(EPOCH FROM (v_hour_start + INTERVAL '1 hour' - now())) * 1000)::INT,
      0;
    RETURN;
  END IF;

  -- 3. Monthly quota check (reuses existing get_user_quota if it exists)
  v_quota_remaining := 0;
  BEGIN
    SELECT * INTO v_quota FROM public.get_user_quota(p_user_id) LIMIT 1;
    IF v_quota IS NOT NULL THEN
      v_quota_remaining := COALESCE(v_quota.generations_remaining, 0);
      IF NOT v_quota.can_generate THEN
        RETURN QUERY SELECT false, 'quota_exceeded'::TEXT, 0, v_quota_remaining;
        RETURN;
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- If get_user_quota isn't available, don't block on quota — just skip it.
    -- Cooldown + hourly cap still enforce budget.
    NULL;
  END;

  -- All checks passed — commit the request
  UPDATE public.ai_rate_limits
     SET last_request       = now(),
         request_count_hour = request_count_hour + 1
   WHERE user_id = p_user_id;

  RETURN QUERY SELECT true, 'ok'::TEXT, 0, v_quota_remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(UUID, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(UUID, INT, INT) TO authenticated;
