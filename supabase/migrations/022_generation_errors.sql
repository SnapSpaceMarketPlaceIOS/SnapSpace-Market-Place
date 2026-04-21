-- ─────────────────────────────────────────────────────────────────────────────
-- 022_generation_errors.sql
--
-- Build 44: Persistent telemetry for AI generation failures.
--
-- Why this exists:
--   TestFlight devices don't expose console to us. Before this table, when a
--   user reported "generation failed" we had no way to see which Ring threw,
--   what the error message was, or whether FAL/BFL/proxy was the culprit —
--   we could only guess based on the app's generic "We couldn't use your
--   room photo" alert. That alert maps to MANY root causes (Ring 1 throw,
--   Ring 2 throw, panel-creation throw, polling timeout, etc.).
--
--   Every catch block in the generation pipeline now writes a row here.
--   After a user reports an issue we query:
--     SELECT * FROM generation_errors WHERE user_id = '<id>'
--       ORDER BY created_at DESC LIMIT 20;
--   ...and we see exactly which ring failed, with what error, at what time.
--
-- RLS model:
--   - Users can INSERT their own errors (writable from client).
--   - Users can SELECT their own errors (debuggable from a future "my errors"
--     screen, or by us via service-role query during support).
--   - Admins can SELECT everything (standard admin visibility).
--   - No UPDATE / DELETE from clients — errors are append-only.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.generation_errors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  generation_id   TEXT,                       -- Client's per-attempt ID (e.g. "g-abc123-xy")
  ring            TEXT NOT NULL,              -- 'panel' | 'individual-refs' | 'bfl' | 'normalize' | 'pre-pipeline' | other
  error_name      TEXT,                       -- e.g. "Error", "TypeError", "AbortError"
  error_message   TEXT,                       -- First 500 chars — truncated client-side
  pipeline        TEXT,                       -- genMeta.pipeline at time of throw
  client_version  TEXT,                       -- app.json buildNumber (e.g. "44")
  metadata        JSONB DEFAULT '{}'::jsonb,  -- Free-form: aspect_ratio, product_count, roomPhotoUrl, etc.
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_generation_errors_user_time
  ON public.generation_errors (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_generation_errors_ring_time
  ON public.generation_errors (ring, created_at DESC);

ALTER TABLE public.generation_errors ENABLE ROW LEVEL SECURITY;

-- Clients can insert their own errors.
DROP POLICY IF EXISTS "users_insert_own_errors" ON public.generation_errors;
CREATE POLICY "users_insert_own_errors" ON public.generation_errors
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Clients can read their own errors.
DROP POLICY IF EXISTS "users_select_own_errors" ON public.generation_errors;
CREATE POLICY "users_select_own_errors" ON public.generation_errors
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins can read every error row.
DROP POLICY IF EXISTS "admins_select_all_errors" ON public.generation_errors;
CREATE POLICY "admins_select_all_errors" ON public.generation_errors
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Service role bypasses RLS automatically — no explicit policy needed.
