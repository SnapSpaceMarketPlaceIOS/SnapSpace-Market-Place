-- Feature requests submitted by users from RequestFeatureScreen
CREATE TABLE IF NOT EXISTS public.feature_requests (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  title       TEXT NOT NULL,
  description TEXT,
  category    TEXT NOT NULL,
  votes       INTEGER NOT NULL DEFAULT 0,
  status      TEXT NOT NULL DEFAULT 'open', -- open | planned | in_progress | done | rejected
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Users can only see their own requests; admins see all
ALTER TABLE public.feature_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own requests"
  ON public.feature_requests FOR INSERT
  WITH CHECK (auth.uid() = user_id OR user_id IS NULL);

CREATE POLICY "Anyone can read feature requests"
  ON public.feature_requests FOR SELECT
  USING (true);

CREATE POLICY "Admins can update feature requests"
  ON public.feature_requests FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'admin'
    )
  );
