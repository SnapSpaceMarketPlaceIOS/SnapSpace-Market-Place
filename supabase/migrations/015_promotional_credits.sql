-- ============================================================
-- Migration 015: Promotional Credits (Affiliate-Triggered Wishes)
-- ============================================================
-- Silent backend that credits 10 wishes to a user's account when
-- their affiliate-attributed Amazon purchase is confirmed.
--
-- Security model:
--   - Clients NEVER directly insert into affiliate_clicks. They call the
--     log_affiliate_click() SECURITY DEFINER RPC which generates the subtag
--     server-side and returns it. This prevents an attacker from forging
--     subtag values to hijack another user's purchase attribution.
--   - reference_id on token_transactions is globally UNIQUE, eliminating
--     the TOCTOU race in add_tokens.
--   - affiliate_orders has UNIQUE(network, order_ref) so the same order
--     can never grant twice, even under concurrent ingestion.
-- ============================================================

-- ── 1. Extend token_transactions type enum ──────────────────────────────────

ALTER TABLE token_transactions
  DROP CONSTRAINT IF EXISTS token_transactions_transaction_type_check;

ALTER TABLE token_transactions
  ADD CONSTRAINT token_transactions_transaction_type_check
  CHECK (transaction_type IN (
    'purchase',
    'generation',
    'referral_bonus',
    'admin_grant',
    'refund',
    'promotional_bonus'
  ));

-- ── 1b. UNIQUE on reference_id (eliminates add_tokens TOCTOU race) ──────────
-- The old idempotency check was SELECT-then-INSERT which could double-credit
-- under concurrent calls. A UNIQUE constraint makes the DB the source of
-- truth — any concurrent second insert fails immediately with a unique_violation
-- that add_tokens / grant_affiliate_purchase_wishes handle gracefully.

CREATE UNIQUE INDEX IF NOT EXISTS uq_token_transactions_reference
  ON token_transactions (reference_id)
  WHERE reference_id IS NOT NULL;

-- ── 2. affiliate_clicks: every Shop Now tap (server-inserted only) ──────────
-- Subtag has a UNIQUE constraint to make collisions impossible — the
-- SECURITY DEFINER RPC will retry on collision before returning.

CREATE TABLE IF NOT EXISTS affiliate_clicks (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  product_id   TEXT,
  asin         TEXT,
  network      TEXT        NOT NULL CHECK (network IN ('amazon', 'cj', 'shareasale', 'other')),
  subtag       TEXT        NOT NULL UNIQUE,
  dest_host    TEXT,
  clicked_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_affiliate_clicks_user_time
  ON affiliate_clicks (user_id, clicked_at DESC);

ALTER TABLE affiliate_clicks ENABLE ROW LEVEL SECURITY;

-- Users can ONLY read their own click rows. Writes are blocked for
-- authenticated users — they must go through log_affiliate_click RPC.
-- Service role bypasses RLS automatically; no permissive policy needed.
DROP POLICY IF EXISTS "users_read_own_clicks"   ON affiliate_clicks;
DROP POLICY IF EXISTS "users_insert_own_clicks" ON affiliate_clicks;
DROP POLICY IF EXISTS "service_manage_clicks"   ON affiliate_clicks;

CREATE POLICY "users_read_own_clicks"
  ON affiliate_clicks FOR SELECT
  USING (auth.uid() = user_id);

-- ── 3. affiliate_orders: confirmed purchases from network reports ───────────

CREATE TABLE IF NOT EXISTS affiliate_orders (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  network        TEXT        NOT NULL CHECK (network IN ('amazon', 'cj', 'shareasale', 'other')),
  order_ref      TEXT        NOT NULL,
  subtag         TEXT,
  product_asin   TEXT,
  commission_usd NUMERIC(10, 2),
  wishes_granted INTEGER     NOT NULL DEFAULT 0,
  reported_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(network, order_ref)
);

CREATE INDEX IF NOT EXISTS idx_affiliate_orders_user
  ON affiliate_orders (user_id, reported_at DESC);

ALTER TABLE affiliate_orders ENABLE ROW LEVEL SECURITY;

-- No user policies — only service role writes/reads this table
-- (service role bypasses RLS automatically).
DROP POLICY IF EXISTS "service_manage_orders" ON affiliate_orders;

-- ── 4. Update add_tokens to handle promotional_bonus type ───────────────────
-- Now relies on UNIQUE(reference_id) for idempotency instead of a TOCTOU-racy
-- SELECT-then-INSERT. Catches unique_violation and returns the existing balance.

CREATE OR REPLACE FUNCTION add_tokens(
  p_user_id      UUID,
  p_amount       INTEGER,
  p_type         TEXT,
  p_reference_id TEXT DEFAULT NULL,
  p_product_id   TEXT DEFAULT NULL
)
RETURNS TABLE (new_balance INTEGER)
LANGUAGE plpgsql AS $$
DECLARE
  v_balance INTEGER;
  v_col     TEXT;
BEGIN
  -- Which counter to increment. Free-to-user credits bump total_gifted.
  IF p_type IN ('referral_bonus', 'promotional_bonus') THEN
    v_col := 'total_gifted';
  ELSE
    v_col := 'total_purchased';
  END IF;

  -- Upsert token balance
  IF v_col = 'total_gifted' THEN
    INSERT INTO user_tokens (user_id, balance, total_gifted)
    VALUES (p_user_id, p_amount, p_amount)
    ON CONFLICT (user_id) DO UPDATE SET
      balance      = user_tokens.balance + p_amount,
      total_gifted = user_tokens.total_gifted + p_amount,
      updated_at   = NOW();
  ELSE
    INSERT INTO user_tokens (user_id, balance, total_purchased)
    VALUES (p_user_id, p_amount, p_amount)
    ON CONFLICT (user_id) DO UPDATE SET
      balance         = user_tokens.balance + p_amount,
      total_purchased = user_tokens.total_purchased + p_amount,
      updated_at      = NOW();
  END IF;

  SELECT ut.balance INTO v_balance FROM user_tokens ut WHERE ut.user_id = p_user_id;

  -- Ledger entry — UNIQUE(reference_id) enforces bulletproof idempotency.
  -- If the reference was already used we catch the unique_violation and
  -- REVERT the balance increment above before returning the existing balance.
  BEGIN
    INSERT INTO token_transactions (user_id, amount, balance_after, transaction_type, reference_id, product_id)
    VALUES (p_user_id, p_amount, v_balance, p_type, p_reference_id, p_product_id);
  EXCEPTION WHEN unique_violation THEN
    -- Revert the balance change we just applied above
    IF v_col = 'total_gifted' THEN
      UPDATE user_tokens SET
        balance      = balance - p_amount,
        total_gifted = total_gifted - p_amount,
        updated_at   = NOW()
      WHERE user_id = p_user_id;
    ELSE
      UPDATE user_tokens SET
        balance         = balance - p_amount,
        total_purchased = total_purchased - p_amount,
        updated_at      = NOW()
      WHERE user_id = p_user_id;
    END IF;
    SELECT ut.balance INTO v_balance FROM user_tokens ut WHERE ut.user_id = p_user_id;
  END;

  RETURN QUERY SELECT v_balance;
END;
$$;

-- ── 5. log_affiliate_click: SECURITY DEFINER RPC for client-safe click log ──
-- Client calls this with product metadata; server generates the subtag using
-- gen_random_uuid() (true crypto randomness) and inserts the row. Because
-- subtag is generated server-side, there is NO way for a client to forge
-- a subtag to hijack another user's attribution.
--
-- Returns the generated subtag so the client can append ascsubtag=<subtag>
-- to the outbound Amazon URL.

CREATE OR REPLACE FUNCTION log_affiliate_click(
  p_product_id TEXT,
  p_asin       TEXT,
  p_network    TEXT,
  p_dest_host  TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id   UUID;
  v_subtag    TEXT;
  v_attempts  INT := 0;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    -- Not authenticated — silently no-op. Client still opens the URL.
    RETURN NULL;
  END IF;

  IF p_network NOT IN ('amazon', 'cj', 'shareasale', 'other') THEN
    p_network := 'other';
  END IF;

  -- Generate a high-entropy subtag server-side. Format preserved for
  -- compatibility with existing ingest logic: hg_<8 hex of userid>_<10 hex random>
  -- Total length ≤ 24 chars — well under Amazon's 65-char ascsubtag limit.
  --
  -- Retry on the vanishingly-unlikely collision (UNIQUE constraint violation).
  -- 10 hex chars of random ≈ 1 trillion values per user prefix.
  LOOP
    v_attempts := v_attempts + 1;
    v_subtag := 'hg_' ||
                substring(replace(v_user_id::text, '-', ''), 1, 8) ||
                '_' ||
                substring(replace(gen_random_uuid()::text, '-', ''), 1, 10);

    BEGIN
      INSERT INTO affiliate_clicks (user_id, product_id, asin, network, subtag, dest_host)
      VALUES (v_user_id, p_product_id, p_asin, p_network, v_subtag, p_dest_host);
      RETURN v_subtag;
    EXCEPTION WHEN unique_violation THEN
      IF v_attempts >= 3 THEN
        RAISE EXCEPTION 'Subtag collision after 3 attempts';
      END IF;
      -- loop and try again with a new random suffix
    END;
  END LOOP;
END;
$$;

GRANT EXECUTE ON FUNCTION log_affiliate_click(TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ── 6. grant_affiliate_purchase_wishes: ingestion RPC (unchanged contract) ──

CREATE OR REPLACE FUNCTION grant_affiliate_purchase_wishes(
  p_network        TEXT,
  p_order_ref      TEXT,
  p_subtag         TEXT,
  p_amount         INTEGER DEFAULT 10,
  p_product_asin   TEXT DEFAULT NULL,
  p_commission_usd NUMERIC DEFAULT NULL
)
RETURNS TABLE (
  granted      BOOLEAN,
  user_id      UUID,
  new_balance  INTEGER,
  reason       TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id     UUID;
  v_reference   TEXT;
  v_new_balance INTEGER;
BEGIN
  -- Defensive: trim and validate subtag
  p_subtag := COALESCE(NULLIF(TRIM(p_subtag), ''), NULL);
  IF p_subtag IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::INTEGER, 'missing_subtag'::TEXT;
    RETURN;
  END IF;

  -- Resolve user_id via the UNIQUE subtag (only one row possible now)
  SELECT c.user_id INTO v_user_id
    FROM affiliate_clicks c
   WHERE c.subtag = p_subtag
   LIMIT 1;

  -- Insert the affiliate_orders row (UNIQUE(network, order_ref) enforces
  -- dedup). If a duplicate, we return already_processed cleanly.
  BEGIN
    INSERT INTO affiliate_orders (user_id, network, order_ref, subtag, product_asin, commission_usd, wishes_granted)
    VALUES (v_user_id, p_network, p_order_ref, p_subtag, p_product_asin, p_commission_usd, CASE WHEN v_user_id IS NULL THEN 0 ELSE p_amount END);
  EXCEPTION WHEN unique_violation THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::INTEGER, 'already_processed'::TEXT;
    RETURN;
  END;

  -- If subtag didn't resolve to a user, the row is recorded for audit but
  -- no wishes granted (admin can manually attribute later if needed).
  IF v_user_id IS NULL THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::INTEGER, 'subtag_not_found'::TEXT;
    RETURN;
  END IF;

  -- Grant wishes via idempotent add_tokens (reference_id is globally UNIQUE)
  v_reference := 'affiliate_' || p_network || '_' || p_order_ref;

  SELECT t.new_balance INTO v_new_balance
    FROM add_tokens(v_user_id, p_amount, 'promotional_bonus', v_reference, p_product_asin) t;

  RETURN QUERY SELECT true, v_user_id, v_new_balance, 'granted'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION grant_affiliate_purchase_wishes(TEXT, TEXT, TEXT, INTEGER, TEXT, NUMERIC) TO service_role;
