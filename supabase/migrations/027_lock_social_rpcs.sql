-- ─────────────────────────────────────────────────────────────────────────────
-- Migration 027: lock down social RPCs against caller-spoofing
-- ─────────────────────────────────────────────────────────────────────────────
-- Audit finding (pre-launch security audit, 2026-04-27):
--
-- The social RPCs introduced in 011_social.sql accept a user-id parameter
-- (p_follower_id, p_user_id) but DO NOT verify that the calling JWT's
-- auth.uid() matches that parameter. With SECURITY DEFINER, this means any
-- authenticated user can:
--
--   • follow_user(p_follower_id=<victim>, p_following_id=<attacker>)
--     → Forces the victim's account to follow the attacker, without the
--       victim's knowledge or consent.
--
--   • unfollow_user(p_follower_id=<victim>, p_following_id=<good_friend>)
--     → Severs the victim's social connections silently.
--
--   • is_following(p_follower_id=<victim>, ...)
--     → Enumerates the victim's full follow graph (privacy leak).
--
--   • toggle_like(p_user_id=<victim>, p_design_id=<any>)
--     → Inflates/deflates like counts as the victim, polluting reputation
--       metrics.
--
-- Migration 025 added auth.uid() guards to the quota RPCs but did not touch
-- the social RPCs.
--
-- This migration replaces all four functions with versions that raise
-- 'unauthorized' if auth.uid() does not match the user-id parameter.
--
-- The function bodies are otherwise unchanged from 011_social.sql so the
-- contract for legitimate callers (the app calling on its own user's behalf)
-- is preserved.
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. follow_user — guard against follower-id spoofing
CREATE OR REPLACE FUNCTION public.follow_user(
  p_follower_id UUID,
  p_following_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'follow_user: not authenticated';
  END IF;
  IF auth.uid() <> p_follower_id THEN
    RAISE EXCEPTION 'follow_user: caller % may not follow on behalf of %',
      auth.uid(), p_follower_id;
  END IF;
  IF p_follower_id = p_following_id THEN
    RAISE EXCEPTION 'follow_user: cannot follow yourself';
  END IF;

  INSERT INTO public.follows (follower_id, following_id)
  VALUES (p_follower_id, p_following_id)
  ON CONFLICT DO NOTHING;
END;
$$;

-- 2. unfollow_user — guard against follower-id spoofing
CREATE OR REPLACE FUNCTION public.unfollow_user(
  p_follower_id UUID,
  p_following_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unfollow_user: not authenticated';
  END IF;
  IF auth.uid() <> p_follower_id THEN
    RAISE EXCEPTION 'unfollow_user: caller % may not unfollow on behalf of %',
      auth.uid(), p_follower_id;
  END IF;

  DELETE FROM public.follows
  WHERE follower_id = p_follower_id
    AND following_id = p_following_id;
END;
$$;

-- 3. is_following — guard against follow-graph enumeration
-- Read-only, so lower severity than the write RPCs above, but still
-- restricted to "ask about my own follow status."
CREATE OR REPLACE FUNCTION public.is_following(
  p_follower_id UUID,
  p_following_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'is_following: not authenticated';
  END IF;
  IF auth.uid() <> p_follower_id THEN
    RAISE EXCEPTION 'is_following: caller % may not query follow status of %',
      auth.uid(), p_follower_id;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.follows
    WHERE follower_id = p_follower_id
      AND following_id = p_following_id
  );
END;
$$;

-- 4. toggle_like — guard against like-as-other-user spoofing
CREATE OR REPLACE FUNCTION public.toggle_like(
  p_user_id UUID,
  p_design_id UUID
)
RETURNS BOOLEAN  -- returns the new liked-state after the toggle
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id UUID;
  v_now_liked BOOLEAN;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'toggle_like: not authenticated';
  END IF;
  IF auth.uid() <> p_user_id THEN
    RAISE EXCEPTION 'toggle_like: caller % may not toggle like for %',
      auth.uid(), p_user_id;
  END IF;

  SELECT id INTO v_existing_id
  FROM public.design_likes
  WHERE user_id = p_user_id AND design_id = p_design_id;

  IF v_existing_id IS NOT NULL THEN
    DELETE FROM public.design_likes WHERE id = v_existing_id;
    v_now_liked := FALSE;
  ELSE
    INSERT INTO public.design_likes (user_id, design_id)
    VALUES (p_user_id, p_design_id);
    v_now_liked := TRUE;
  END IF;

  RETURN v_now_liked;
END;
$$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Sanity grants — keep the same exposure model as 011_social.sql
-- (authenticated users can call these RPCs; the body now self-validates).
-- ─────────────────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.follow_user(UUID, UUID)   TO authenticated;
GRANT EXECUTE ON FUNCTION public.unfollow_user(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_following(UUID, UUID)  TO authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_like(UUID, UUID)   TO authenticated;
