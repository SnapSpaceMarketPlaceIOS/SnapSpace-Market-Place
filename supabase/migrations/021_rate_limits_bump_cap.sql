-- ─────────────────────────────────────────────────────────────────────────────
-- 021_rate_limits_bump_cap.sql
--
-- Build 40 fix: bump check_ai_rate_limit hourly cap from 30 to 200.
--
-- Why this was urgent:
--   The 3-ring fallback architecture (panel → individual-refs → BFL) fires
--   THREE separate ai-proxy POSTs per generation attempt. With the previous
--   30-req/hour cap, a user got only ~10 generation attempts/hour before the
--   proxy started returning 429 'hourly_cap' on every subsequent request —
--   including the very first ring of the next attempt. This presented to the
--   user as "every test fails, in every ring, with no useful error" and
--   matched the Build 37/39 TestFlight reports exactly: panel fails → refs
--   fails → BFL fails → "Generation Failed". All three rings were being
--   blocked by the SAME server-side cap, not by any actual generation issue.
--
-- New cap: 200 req/hour.
--   ≈ 67 worst-case 3-ring attempts/hour (one every ~54s).
--   ≈ 200 best-case (panel-succeeds-first-try) attempts/hour.
--   Still abuse-protected: a malicious actor can't rip through millions of
--   generations, but legitimate users (especially during dev/QA testing)
--   never accidentally trip the rolling-hour limit.
--
-- Also resets all rate-limit rows so existing users locked out by the old
-- cap can immediately retry (otherwise they'd have to wait up to an hour
-- for hour_window_start to age out).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_ai_rate_limit(
  p_user_id     UUID,
  p_cooldown_ms INT DEFAULT 2000,
  p_hourly_cap  INT DEFAULT 200            -- ↑ from 30
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
  INSERT INTO public.ai_rate_limits (user_id, last_request, hour_window_start, request_count_hour)
  VALUES (p_user_id, now() - INTERVAL '10 seconds', now(), 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT last_request, hour_window_start, request_count_hour
    INTO v_last_request, v_hour_start, v_hour_count
    FROM public.ai_rate_limits
   WHERE user_id = p_user_id;

  v_ms_since_last := (EXTRACT(EPOCH FROM (now() - v_last_request)) * 1000)::INT;
  IF v_ms_since_last < p_cooldown_ms THEN
    RETURN QUERY SELECT false, 'cooldown'::TEXT, (p_cooldown_ms - v_ms_since_last), 0;
    RETURN;
  END IF;

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
    NULL;
  END;

  UPDATE public.ai_rate_limits
     SET last_request       = now(),
         request_count_hour = request_count_hour + 1
   WHERE user_id = p_user_id;

  RETURN QUERY SELECT true, 'ok'::TEXT, 0, v_quota_remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(UUID, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(UUID, INT, INT) TO authenticated;

-- Reset all currently-throttled users so they can immediately retry without
-- waiting for the rolling-hour window to age out. Safe operation: zeroing
-- the count just gives every user a fresh hour window starting now.
--
-- Guarded with an existence check because the ai_rate_limits table was
-- introduced in 014_rate_limits.sql which hasn't been applied to every
-- environment yet (prod is still missing it as of 2026-04-20). Without
-- the guard this UPDATE throws 42P01 and aborts the migration chain —
-- blocking unrelated migrations like 022_generation_errors from landing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'ai_rate_limits'
  ) THEN
    UPDATE public.ai_rate_limits
       SET request_count_hour = 0,
           hour_window_start  = now(),
           last_request       = now() - INTERVAL '10 seconds';
  END IF;
END $$;
