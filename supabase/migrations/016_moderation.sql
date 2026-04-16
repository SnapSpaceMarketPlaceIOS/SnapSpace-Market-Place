-- ============================================================
-- Migration 016: User Moderation (Report + Block)
-- ============================================================
-- Satisfies Apple Guideline 1.2 for apps with user-generated content
-- (community designs in our case). Users must be able to:
--   1. Report objectionable content
--   2. Block other users they don't want to interact with
--
-- Reports are written to a table that can be reviewed by admins. Blocks
-- are scoped per-user — client filters community feeds by blocked_ids.
-- ============================================================

-- ── 1. user_reports ─────────────────────────────────────────────────────────
-- Records a report filed by one user against another user or a specific design.

CREATE TABLE IF NOT EXISTS user_reports (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id     UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_user_id  UUID        REFERENCES profiles(id) ON DELETE CASCADE,
  target_design_id TEXT,
  reason          TEXT        NOT NULL CHECK (reason IN (
    'spam',
    'inappropriate',
    'harassment',
    'hate_speech',
    'copyright',
    'other'
  )),
  notes           TEXT,
  status          TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'reviewing', 'resolved', 'dismissed'
  )),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  resolved_at     TIMESTAMPTZ,
  CHECK (target_user_id IS NOT NULL OR target_design_id IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_user_reports_status
  ON user_reports (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_reports_target_user
  ON user_reports (target_user_id);

ALTER TABLE user_reports ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own reports (for transparency / confirmation).
DROP POLICY IF EXISTS "users_read_own_reports" ON user_reports;
CREATE POLICY "users_read_own_reports"
  ON user_reports FOR SELECT
  USING (auth.uid() = reporter_id);

-- Users can INSERT reports where they are the reporter (cannot impersonate).
DROP POLICY IF EXISTS "users_file_own_reports" ON user_reports;
CREATE POLICY "users_file_own_reports"
  ON user_reports FOR INSERT
  WITH CHECK (auth.uid() = reporter_id);

-- ── 2. user_blocks ─────────────────────────────────────────────────────────
-- Records a block: blocker hides blocked from their view of the community.
-- Symmetric in practice (the blocked user's designs won't appear in the
-- blocker's feed) but unidirectional in storage.

CREATE TABLE IF NOT EXISTS user_blocks (
  blocker_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  blocked_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (blocker_id, blocked_id),
  CHECK (blocker_id <> blocked_id)  -- cannot block yourself
);

CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker
  ON user_blocks (blocker_id);

ALTER TABLE user_blocks ENABLE ROW LEVEL SECURITY;

-- Users can SELECT their own blocks (to render "Blocked" UI).
DROP POLICY IF EXISTS "users_read_own_blocks" ON user_blocks;
CREATE POLICY "users_read_own_blocks"
  ON user_blocks FOR SELECT
  USING (auth.uid() = blocker_id);

-- Users can INSERT blocks where they are the blocker.
DROP POLICY IF EXISTS "users_create_own_blocks" ON user_blocks;
CREATE POLICY "users_create_own_blocks"
  ON user_blocks FOR INSERT
  WITH CHECK (auth.uid() = blocker_id);

-- Users can DELETE (unblock) their own blocks.
DROP POLICY IF EXISTS "users_delete_own_blocks" ON user_blocks;
CREATE POLICY "users_delete_own_blocks"
  ON user_blocks FOR DELETE
  USING (auth.uid() = blocker_id);

-- ── 3. Helper RPCs ─────────────────────────────────────────────────────────

-- Atomic "report and block" — a user filing a report will typically also
-- want that user out of their feed. One RPC keeps both writes consistent.
CREATE OR REPLACE FUNCTION report_and_block_user(
  p_target_user_id  UUID,
  p_target_design_id TEXT DEFAULT NULL,
  p_reason          TEXT DEFAULT 'other',
  p_notes           TEXT DEFAULT NULL,
  p_also_block      BOOLEAN DEFAULT TRUE
)
RETURNS TABLE (
  report_id UUID,
  blocked   BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_reporter UUID;
  v_report_id UUID;
  v_blocked   BOOLEAN := FALSE;
BEGIN
  v_reporter := auth.uid();
  IF v_reporter IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'target_user_id required';
  END IF;

  IF p_target_user_id = v_reporter THEN
    RAISE EXCEPTION 'Cannot report yourself';
  END IF;

  INSERT INTO user_reports (reporter_id, target_user_id, target_design_id, reason, notes)
  VALUES (v_reporter, p_target_user_id, p_target_design_id, p_reason, p_notes)
  RETURNING id INTO v_report_id;

  IF p_also_block THEN
    INSERT INTO user_blocks (blocker_id, blocked_id)
    VALUES (v_reporter, p_target_user_id)
    ON CONFLICT (blocker_id, blocked_id) DO NOTHING;
    v_blocked := TRUE;
  END IF;

  RETURN QUERY SELECT v_report_id, v_blocked;
END;
$$;

GRANT EXECUTE ON FUNCTION report_and_block_user(UUID, TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- Get the current user's blocked-user IDs, for client-side feed filtering.
CREATE OR REPLACE FUNCTION get_my_blocked_ids()
RETURNS TABLE (blocked_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY
    SELECT ub.blocked_id FROM user_blocks ub WHERE ub.blocker_id = v_user;
END;
$$;

GRANT EXECUTE ON FUNCTION get_my_blocked_ids() TO authenticated;

-- Unblock a user (symmetric with report_and_block_user).
CREATE OR REPLACE FUNCTION unblock_user(p_blocked_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user UUID;
BEGIN
  v_user := auth.uid();
  IF v_user IS NULL THEN
    RETURN FALSE;
  END IF;
  DELETE FROM user_blocks WHERE blocker_id = v_user AND blocked_id = p_blocked_id;
  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION unblock_user(UUID) TO authenticated;
