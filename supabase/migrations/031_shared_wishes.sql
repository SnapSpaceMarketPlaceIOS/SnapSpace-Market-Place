-- Migration 031: Shareable wish landing-page records
--
-- Backs the homegenie.app/wish/<id> share URLs. When a user taps Share
-- on a generated/saved wish, the iOS app inserts a row here and uses
-- the row's short id in the share URL. The Next.js landing page reads
-- this row by id and renders a branded preview with Open Graph metadata.
--
-- The image_url is the existing Supabase storage URL (or any HTTPS URL
-- — we don't try to mirror or proxy it). The prompt is the user's
-- generation prompt (for caption + OG title).
--
-- Why a separate table from `designs`:
--   - `designs` is for SAVED user designs with full metadata. Many shares
--     happen on ad-hoc generations the user never saved — those still
--     need a shareable URL.
--   - Designs that ARE saved still get their own shared_wish row at
--     share-time, keeping the public-share read path independent of any
--     visibility/RLS rules on the designs table.
--   - Future: a designs-level "publish" feature can wrap shared_wishes
--     creation; for now they're decoupled.

-- Short, URL-safe ID — 10 chars from a 64-char alphabet = ~60 bits of
-- entropy. Collisions vanishingly rare at any realistic share volume,
-- and the URL stays human-friendly: homegenie.app/wish/Xa9bK_mQ2p
CREATE OR REPLACE FUNCTION generate_share_id()
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_alphabet TEXT := 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';
  v_id       TEXT := '';
  i          INT;
BEGIN
  FOR i IN 1..10 LOOP
    v_id := v_id || substr(v_alphabet, 1 + floor(random() * 64)::int, 1);
  END LOOP;
  RETURN v_id;
END;
$$;

CREATE TABLE IF NOT EXISTS public.shared_wishes (
  id           TEXT        PRIMARY KEY DEFAULT generate_share_id(),
  user_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  image_url    TEXT        NOT NULL,
  prompt       TEXT,
  room_type    TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  view_count   INTEGER     NOT NULL DEFAULT 0,
  -- Soft-delete: a user can hide a share without losing the row, so
  -- recipients with the link see a tasteful 404 instead of a broken image.
  is_active    BOOLEAN     NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS shared_wishes_user_idx
  ON public.shared_wishes(user_id, created_at DESC);

ALTER TABLE public.shared_wishes ENABLE ROW LEVEL SECURITY;

-- Anonymous web visitors (the Next.js landing page) read by id when they
-- visit a share URL. Public read is safe — share IDs are unguessable
-- (60 bits of entropy) and the row only exposes content the user
-- already chose to share publicly.
DROP POLICY IF EXISTS "anon_read_active_shares" ON public.shared_wishes;
CREATE POLICY "anon_read_active_shares"
  ON public.shared_wishes FOR SELECT
  USING (is_active = true);

-- Authenticated users can mark their own shares inactive (hide).
DROP POLICY IF EXISTS "users_update_own_shares" ON public.shared_wishes;
CREATE POLICY "users_update_own_shares"
  ON public.shared_wishes FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Service role only for INSERT (gate via the create_shared_wish RPC).
-- This prevents drive-by INSERTs that would bypass any future content
-- moderation hooks we add.
DROP POLICY IF EXISTS "service_insert_shares" ON public.shared_wishes;
CREATE POLICY "service_insert_shares"
  ON public.shared_wishes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ── create_shared_wish: client-callable, ownership-stamped ─────────────────
-- The iOS app calls this when the user taps Share. Returns the new
-- share id; the app builds the URL and hands it to the iOS share sheet.
-- SECURITY DEFINER so it can write through the service-role-only INSERT
-- policy on the table — keeps the table itself locked down while
-- providing a controlled write path.
CREATE OR REPLACE FUNCTION create_shared_wish(
  p_image_url TEXT,
  p_prompt    TEXT DEFAULT NULL,
  p_room_type TEXT DEFAULT NULL
)
RETURNS TABLE (id TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_id      TEXT;
  v_user_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required to create a shared wish';
  END IF;
  IF p_image_url IS NULL OR length(trim(p_image_url)) = 0 THEN
    RAISE EXCEPTION 'image_url is required';
  END IF;
  -- Insert; PK default fires generate_share_id() if v_id stays null
  INSERT INTO public.shared_wishes (user_id, image_url, prompt, room_type)
  VALUES (v_user_id, p_image_url, p_prompt, p_room_type)
  RETURNING shared_wishes.id INTO v_id;
  RETURN QUERY SELECT v_id;
END;
$$;

-- ── get_shared_wish: anon read for the landing page ────────────────────────
-- Called by the Next.js server component. Returns null fields if the row
-- doesn't exist or has been hidden, so the page can render a graceful
-- "this wish is no longer available" state instead of a 500.
CREATE OR REPLACE FUNCTION get_shared_wish(p_id TEXT)
RETURNS TABLE (
  id         TEXT,
  image_url  TEXT,
  prompt     TEXT,
  room_type  TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Increment view count (best-effort; failure shouldn't block the read)
  UPDATE public.shared_wishes
  SET view_count = view_count + 1
  WHERE shared_wishes.id = p_id AND is_active = true;

  RETURN QUERY
    SELECT s.id, s.image_url, s.prompt, s.room_type, s.created_at
    FROM public.shared_wishes s
    WHERE s.id = p_id AND s.is_active = true;
END;
$$;

GRANT EXECUTE ON FUNCTION create_shared_wish(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_shared_wish(TEXT)                TO anon, authenticated;
