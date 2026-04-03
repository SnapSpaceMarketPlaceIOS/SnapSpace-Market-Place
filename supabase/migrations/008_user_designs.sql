-- User-generated designs (saved from AI Snap flow)
CREATE TABLE IF NOT EXISTS user_designs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE NOT NULL,
  image_url TEXT NOT NULL,
  prompt TEXT,
  style_tags TEXT[] DEFAULT '{}',
  products JSONB DEFAULT '[]',
  visibility TEXT DEFAULT 'public' CHECK (visibility IN ('public', 'private')),
  likes INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Index for feed queries
CREATE INDEX idx_user_designs_public ON user_designs (visibility, created_at DESC) WHERE visibility = 'public';
CREATE INDEX idx_user_designs_user ON user_designs (user_id, created_at DESC);

-- RLS
ALTER TABLE user_designs ENABLE ROW LEVEL SECURITY;

-- Anyone can read public designs
CREATE POLICY "Public designs are viewable by everyone"
  ON user_designs FOR SELECT
  USING (visibility = 'public');

-- Users can read their own designs (including private)
CREATE POLICY "Users can view own designs"
  ON user_designs FOR SELECT
  USING (auth.uid() = user_id);

-- Users can insert their own designs
CREATE POLICY "Users can create own designs"
  ON user_designs FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Users can update their own designs (toggle visibility)
CREATE POLICY "Users can update own designs"
  ON user_designs FOR UPDATE
  USING (auth.uid() = user_id);

-- Users can delete their own designs
CREATE POLICY "Users can delete own designs"
  ON user_designs FOR DELETE
  USING (auth.uid() = user_id);
