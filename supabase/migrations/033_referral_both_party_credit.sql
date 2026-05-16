-- ============================================================================
-- Migration 033: Both-party referral credit
--
-- Updates complete_referral() to credit BOTH the referrer AND the referred
-- user with 2 wishes each when the referred user verifies their email.
--
-- Prior behavior (migration 012):
--   • Referrer received +2 wishes on referred user's email verification.
--   • Referred user received nothing through the referral path.
--
-- New behavior (this migration):
--   • Both referrer and referred user receive +2 wishes each.
--   • Total tokens awarded per completed referral = 4 (was 2).
--   • Idempotent: separate reference_id namespaces prevent double-credit on
--     re-runs (`referral_<ref_id>` for the referrer, `referred_<ref_id>`
--     for the referred user). add_tokens() already short-circuits on a
--     repeated reference_id, so calling complete_referral twice for the
--     same referral row is safe.
--
-- Trigger wiring is unchanged. The `on_email_verified_complete_referral`
-- and `on_insert_verified_complete_referral` triggers from migration 013
-- continue to invoke this function — they just now credit the referred
-- user as a side effect.
--
-- Spec source: 2026-05-16 product direction — "both parties who share at
-- the promo link get two free wishes."
-- ============================================================================

CREATE OR REPLACE FUNCTION complete_referral(p_referred_id UUID)
RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
  v_referrer_id UUID;
  v_ref_id      UUID;
BEGIN
  -- Find pending referral for this user
  SELECT referrer_id, id INTO v_referrer_id, v_ref_id
  FROM referrals
  WHERE referred_id = p_referred_id AND status = 'pending'
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN; -- No pending referral, silently do nothing
  END IF;

  -- Credit REFERRER with 2 tokens (existing behavior preserved).
  -- Idempotent via reference_id = 'referral_<ref_id>'.
  PERFORM add_tokens(
    v_referrer_id,
    2,
    'referral_bonus',
    'referral_' || v_ref_id::TEXT,
    NULL
  );

  -- Credit REFERRED USER with 2 tokens (new in migration 033).
  -- Idempotent via reference_id = 'referred_<ref_id>' (distinct namespace
  -- from the referrer's reference_id so the dedup check doesn't collide).
  PERFORM add_tokens(
    p_referred_id,
    2,
    'referral_bonus',
    'referred_' || v_ref_id::TEXT,
    NULL
  );

  -- Mark referral as completed. tokens_awarded reflects the TOTAL across
  -- both parties (4 = 2 referrer + 2 referred). Useful for analytics and
  -- for any future "lifetime tokens gifted" computation.
  UPDATE referrals
  SET status         = 'completed',
      tokens_awarded = 4,
      completed_at   = NOW()
  WHERE id = v_ref_id;
END;
$$;
