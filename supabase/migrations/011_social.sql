-- ============================================================
-- 011_social.sql — Social layer: follows, design likes, RPCs
-- Idempotent: safe to run multiple times
-- ============================================================

-- ============================================================
-- 1. Make profiles publicly readable
-- ============================================================

-- Drop any existing restrictive select policy (ignore error if not present)
DO $$
BEGIN
  DROP POLICY IF EXISTS "Users can view own profile" ON profiles;
  DROP POLICY IF EXISTS "Profiles are viewable by owner" ON profiles;
  DROP POLICY IF EXISTS "Public profiles are viewable" ON profiles;
  DROP POLICY IF EXISTS "Authenticated users can read profiles" ON profiles;
EXCEPTION WHEN OTHERS THEN
  -- ignore
END;
$$;

-- Any authenticated user can read any profile (needed for explore feed + UserProfile screen)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'Anyone authenticated can read profiles'
  ) THEN
    CREATE POLICY "Anyone authenticated can read profiles"
      ON profiles FOR SELECT
      USING (auth.role() = 'authenticated');
  END IF;
END;
$$;

-- ============================================================
-- 2. follows table
-- ============================================================

CREATE TABLE IF NOT EXISTS follows (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ DEFAULT now(),
  UNIQUE (follower_id, following_id),
  CHECK (follower_id != following_id)
);

CREATE INDEX IF NOT EXISTS idx_follows_follower  ON follows (follower_id);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows (following_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'follows'
      AND policyname = 'Anyone can read follows'
  ) THEN
    CREATE POLICY "Anyone can read follows"
      ON follows FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'follows'
      AND policyname = 'Users can follow others'
  ) THEN
    CREATE POLICY "Users can follow others"
      ON follows FOR INSERT
      WITH CHECK (auth.uid() = follower_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'follows'
      AND policyname = 'Users can unfollow'
  ) THEN
    CREATE POLICY "Users can unfollow"
      ON follows FOR DELETE
      USING (auth.uid() = follower_id);
  END IF;
END;
$$;

-- ============================================================
-- 3. design_likes table
-- ============================================================

CREATE TABLE IF NOT EXISTS design_likes (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  design_id  UUID NOT NULL REFERENCES user_designs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (user_id, design_id)
);

CREATE INDEX IF NOT EXISTS idx_design_likes_design ON design_likes (design_id);
CREATE INDEX IF NOT EXISTS idx_design_likes_user   ON design_likes (user_id);

ALTER TABLE design_likes ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'design_likes'
      AND policyname = 'Anyone can read design likes'
  ) THEN
    CREATE POLICY "Anyone can read design likes"
      ON design_likes FOR SELECT
      USING (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'design_likes'
      AND policyname = 'Users can like designs'
  ) THEN
    CREATE POLICY "Users can like designs"
      ON design_likes FOR INSERT
      WITH CHECK (auth.uid() = user_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'design_likes'
      AND policyname = 'Users can unlike designs'
  ) THEN
    CREATE POLICY "Users can unlike designs"
      ON design_likes FOR DELETE
      USING (auth.uid() = user_id);
  END IF;
END;
$$;

-- ============================================================
-- 4. follow_user(p_follower_id, p_following_id)
-- ============================================================

CREATE OR REPLACE FUNCTION follow_user(
  p_follower_id  UUID,
  p_following_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO follows (follower_id, following_id)
  VALUES (p_follower_id, p_following_id)
  ON CONFLICT DO NOTHING;
END;
$$;

-- ============================================================
-- 5. unfollow_user(p_follower_id, p_following_id)
-- ============================================================

CREATE OR REPLACE FUNCTION unfollow_user(
  p_follower_id  UUID,
  p_following_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM follows
  WHERE follower_id  = p_follower_id
    AND following_id = p_following_id;
END;
$$;

-- ============================================================
-- 6. is_following(p_follower_id, p_following_id) → boolean
-- ============================================================

CREATE OR REPLACE FUNCTION is_following(
  p_follower_id  UUID,
  p_following_id UUID
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM follows
    WHERE follower_id  = p_follower_id
      AND following_id = p_following_id
  );
END;
$$;

-- ============================================================
-- 7. toggle_like(p_user_id, p_design_id) → jsonb
--    Returns { liked: boolean, count: integer }
-- ============================================================

CREATE OR REPLACE FUNCTION toggle_like(
  p_user_id   UUID,
  p_design_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_liked boolean;
  v_count integer;
BEGIN
  IF EXISTS (
    SELECT 1 FROM design_likes
    WHERE user_id = p_user_id AND design_id = p_design_id
  ) THEN
    -- Unlike: remove row and decrement counter
    DELETE FROM design_likes
    WHERE user_id = p_user_id AND design_id = p_design_id;

    UPDATE user_designs
    SET likes = GREATEST(0, likes - 1)
    WHERE id = p_design_id;

    v_liked := false;
  ELSE
    -- Like: insert row and increment counter
    INSERT INTO design_likes (user_id, design_id)
    VALUES (p_user_id, p_design_id);

    UPDATE user_designs
    SET likes = likes + 1
    WHERE id = p_design_id;

    v_liked := true;
  END IF;

  SELECT likes INTO v_count FROM user_designs WHERE id = p_design_id;

  RETURN jsonb_build_object('liked', v_liked, 'count', v_count);
END;
$$;

-- ============================================================
-- 8. get_user_profile_data(p_username TEXT) → jsonb
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_profile_data(
  p_username TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile        profiles%ROWTYPE;
  v_follower_count bigint;
  v_following_count bigint;
  v_design_count   bigint;
BEGIN
  SELECT * INTO v_profile
  FROM profiles
  WHERE username = p_username
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO v_follower_count
  FROM follows
  WHERE following_id = v_profile.id;

  SELECT COUNT(*) INTO v_following_count
  FROM follows
  WHERE follower_id = v_profile.id;

  SELECT COUNT(*) INTO v_design_count
  FROM user_designs
  WHERE user_id = v_profile.id AND visibility = 'public';

  RETURN jsonb_build_object(
    'id',                    v_profile.id,
    'full_name',             v_profile.full_name,
    'username',              v_profile.username,
    'bio',                   v_profile.bio,
    'avatar_url',            v_profile.avatar_url,
    'is_verified_supplier',  v_profile.is_verified_supplier,
    'created_at',            v_profile.created_at,
    'follower_count',        v_follower_count,
    'following_count',       v_following_count,
    'design_count',          v_design_count
  );
END;
$$;

-- ============================================================
-- 9. get_my_stats(p_user_id UUID) → jsonb
-- ============================================================

CREATE OR REPLACE FUNCTION get_my_stats(
  p_user_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_followers bigint;
  v_following bigint;
  v_designs   bigint;
BEGIN
  SELECT COUNT(*) INTO v_followers
  FROM follows
  WHERE following_id = p_user_id;

  SELECT COUNT(*) INTO v_following
  FROM follows
  WHERE follower_id = p_user_id;

  SELECT COUNT(*) INTO v_designs
  FROM user_designs
  WHERE user_id = p_user_id AND visibility = 'public';

  RETURN jsonb_build_object(
    'followers', v_followers,
    'following', v_following,
    'designs',   v_designs
  );
END;
$$;

-- ============================================================
-- 10. get_followers(p_user_id, p_limit, p_offset) → TABLE
-- ============================================================

CREATE OR REPLACE FUNCTION get_followers(
  p_user_id UUID,
  p_limit   integer DEFAULT 50,
  p_offset  integer DEFAULT 0
)
RETURNS TABLE (
  id                   UUID,
  full_name            TEXT,
  username             TEXT,
  avatar_url           TEXT,
  is_verified_supplier boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.username,
    p.avatar_url,
    p.is_verified_supplier
  FROM follows f
  JOIN profiles p ON p.id = f.follower_id
  WHERE f.following_id = p_user_id
  ORDER BY f.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- ============================================================
-- 11. get_following(p_user_id, p_limit, p_offset) → TABLE
-- ============================================================

CREATE OR REPLACE FUNCTION get_following(
  p_user_id UUID,
  p_limit   integer DEFAULT 50,
  p_offset  integer DEFAULT 0
)
RETURNS TABLE (
  id                   UUID,
  full_name            TEXT,
  username             TEXT,
  avatar_url           TEXT,
  is_verified_supplier boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.full_name,
    p.username,
    p.avatar_url,
    p.is_verified_supplier
  FROM follows f
  JOIN profiles p ON p.id = f.following_id
  WHERE f.follower_id = p_user_id
  ORDER BY f.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- ============================================================
-- 12. get_user_public_designs(p_user_id, p_limit, p_offset)
-- ============================================================

CREATE OR REPLACE FUNCTION get_user_public_designs(
  p_user_id UUID,
  p_limit   integer DEFAULT 12,
  p_offset  integer DEFAULT 0
)
RETURNS TABLE (
  id         UUID,
  image_url  TEXT,
  prompt     TEXT,
  style_tags TEXT[],
  products   JSONB,
  likes      INTEGER,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    d.id,
    d.image_url,
    d.prompt,
    d.style_tags,
    d.products,
    d.likes,
    d.created_at
  FROM user_designs d
  WHERE d.user_id    = p_user_id
    AND d.visibility = 'public'
  ORDER BY d.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;
