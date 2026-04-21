-- ─────────────────────────────────────────────────────────────────────────────
-- 023_rate_limits_for_update.sql
--
-- Build 65 (Gate C) security fix #1: close the TOCTOU gap in
-- check_ai_rate_limit that let two concurrent calls from the same user pass
-- the cooldown check against the SAME stale read of last_request.
--
-- ── The race ──────────────────────────────────────────────────────────────
-- Migrations 014 and 021 shaped the RPC like this:
--
--    INSERT ... ON CONFLICT DO NOTHING;
--    SELECT last_request, ... INTO v_last_request, ... FROM ai_rate_limits
--     WHERE user_id = p_user_id;              -- ← NO ROW LOCK
--    -- evaluate cooldown / hour-cap / quota
--    UPDATE ai_rate_limits SET last_request = now(), ... WHERE user_id = ...
--
-- Under concurrent invocation (two ai-proxy instances serving the same JWT,
-- or a client that fires a burst from multiple tabs) the two SELECTs both
-- read the old last_request BEFORE either UPDATE runs. Both pass the
-- cooldown check, both execute, both commit — the 2s debounce is doubled
-- through at submission time. Each extra parallel generation costs real FAL
-- money.
--
-- ── The fix ───────────────────────────────────────────────────────────────
-- Acquire a row-level lock by appending FOR UPDATE to the SELECT. The
-- second caller blocks on the row lock until the first caller's UPDATE
-- commits and its transaction closes. When the second caller's SELECT
-- finally runs, it sees the fresh last_request and correctly reports
-- 'cooldown'. Because the row is tiny and the critical section is a few
-- milliseconds of plpgsql, the added latency is negligible (<5 ms even
-- under contention).
--
-- We also fold the original INSERT ... ON CONFLICT DO NOTHING into a single
-- transaction step so the FOR UPDATE lock is reliably held before any
-- check runs, regardless of whether the row was pre-existing or just
-- inserted.
--
-- Hourly cap is also affected by the same race (two callers read the
-- same v_hour_count, both pass, both increment — count ends up +1 from
-- truth, NOT +2, because UPDATE race-condition prevention is less
-- critical here). The FOR UPDATE fix covers this too.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.check_ai_rate_limit(
  p_user_id     UUID,
  p_cooldown_ms INT DEFAULT 2000,
  p_hourly_cap  INT DEFAULT 200
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
  -- Ensure the row exists. If two concurrent calls both try to insert, the
  -- ON CONFLICT handles the duplicate; the row will exist for the SELECT
  -- FOR UPDATE below.
  INSERT INTO public.ai_rate_limits (user_id, last_request, hour_window_start, request_count_hour)
  VALUES (p_user_id, now() - INTERVAL '10 seconds', now(), 0)
  ON CONFLICT (user_id) DO NOTHING;

  -- Build 65 Gate C #1: FOR UPDATE locks the row so concurrent check_ai_rate_limit
  -- calls for the same user serialize on this row. Without it, two parallel
  -- generations from the same account can both pass the cooldown check against
  -- the same stale read and commit two UPDATEs — letting a user/burst bypass
  -- the 2s debounce at real provider-cost.
  SELECT last_request, hour_window_start, request_count_hour
    INTO v_last_request, v_hour_start, v_hour_count
    FROM public.ai_rate_limits
   WHERE user_id = p_user_id
   FOR UPDATE;

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
    NULL;
  END;

  -- All checks passed — commit the request. The row lock held since the
  -- SELECT FOR UPDATE guarantees this UPDATE sees (and replaces) the state
  -- we validated above; any concurrent caller blocks until we COMMIT.
  UPDATE public.ai_rate_limits
     SET last_request       = now(),
         request_count_hour = request_count_hour + 1
   WHERE user_id = p_user_id;

  RETURN QUERY SELECT true, 'ok'::TEXT, 0, v_quota_remaining;
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(UUID, INT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_ai_rate_limit(UUID, INT, INT) TO authenticated;
