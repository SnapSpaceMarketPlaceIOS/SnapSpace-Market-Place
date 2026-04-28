-- ============================================================================
-- Migration 029 — Review-intent logging (post-second-generation prompt)
--
-- Records what users did when shown the no-incentive "Enjoying HomeGenie?
-- Leave a review" prompt that fires after their second room generation.
--
-- Why this exists: iOS does NOT let an app observe whether a user
-- actually submitted a review through SKStoreReviewController. Apple's
-- privacy model intentionally hides that signal. The closest proxy we
-- own is "did the user tap 'Leave a Review' on our pre-prompt?" — that
-- captures intent and is what this table records.
--
-- One row per (user, prompt-show). NO uniqueness constraint on user_id
-- because we may show the prompt at different generation milestones
-- in the future (gen 2 today, gen 5/10/20 later if we expand the
-- trigger ladder), and we want a row per show + decision so we can see
-- conversion funnels per generation count.
--
-- The RPC log_review_intent is SECURITY DEFINER so authenticated users
-- can write their OWN rows without needing direct INSERT privileges on
-- the table. The function checks p_user_id matches auth.uid() to
-- prevent A from logging on B's behalf.
--
-- Idempotent — CREATE TABLE IF NOT EXISTS, CREATE OR REPLACE FUNCTION.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.review_intent_log (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                     UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- The user's lifetime generation count at the moment the prompt fired.
  -- Lets us slice "of users prompted at gen 2, X% engaged" vs "of users
  -- prompted at gen 5, Y% engaged" if we add more trigger milestones.
  generation_count_at_prompt  INTEGER NOT NULL,
  -- 'engaged' = tapped Leave a Review (then we triggered the native sheet).
  -- 'dismissed' = tapped Maybe Later (or backgrounded the app on the prompt).
  user_action                 TEXT NOT NULL CHECK (user_action IN ('engaged', 'dismissed')),
  -- 'native' = Apple's SKStoreReviewController.requestReview() ran
  -- 'fallback' = App Store URL deep-link opened (expo-store-review absent
  --              or unavailable; either way the user was sent to the
  --              composer)
  -- 'unavailable' = neither path could run (early TestFlight, no APP_STORE_ID)
  -- NULL when user_action='dismissed' (no review path was attempted).
  review_path_taken           TEXT CHECK (review_path_taken IN ('native', 'fallback', 'unavailable')),
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_intent_log_user_id
  ON public.review_intent_log (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_review_intent_log_action_gen
  ON public.review_intent_log (user_action, generation_count_at_prompt);

ALTER TABLE public.review_intent_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own rows (lets us show "thanks for the review"
-- echo state in the app if we ever want it). Cannot insert directly —
-- the RPC is the only write path.
DROP POLICY IF EXISTS "users_read_own_review_intent" ON public.review_intent_log;
CREATE POLICY "users_read_own_review_intent"
  ON public.review_intent_log FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "deny_client_writes_review_intent" ON public.review_intent_log;
CREATE POLICY "deny_client_writes_review_intent"
  ON public.review_intent_log FOR INSERT
  WITH CHECK (false);

-- log_review_intent: append a row to the log. Called from the client on
-- both engage and dismiss. Returns nothing; failures are non-fatal at
-- the call site (the modal already closed regardless).
CREATE OR REPLACE FUNCTION log_review_intent(
  p_user_id           UUID,
  p_generation_count  INTEGER,
  p_action            TEXT,
  p_review_path       TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Authenticated users can only log on their own behalf. Service role
  -- bypasses this check (auth.uid() returns NULL there) which is fine
  -- because edge functions running as service role are trusted.
  IF auth.uid() IS NOT NULL AND auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'log_review_intent: user_id mismatch (uid=% vs p_user_id=%)',
      auth.uid(), p_user_id;
  END IF;

  IF p_action NOT IN ('engaged', 'dismissed') THEN
    RAISE EXCEPTION 'log_review_intent: invalid action %', p_action;
  END IF;

  INSERT INTO review_intent_log (
    user_id, generation_count_at_prompt, user_action, review_path_taken
  ) VALUES (
    p_user_id, p_generation_count, p_action, p_review_path
  );
END;
$$;

GRANT EXECUTE ON FUNCTION log_review_intent(UUID, INTEGER, TEXT, TEXT) TO authenticated;
