-- ============================================================================
-- 013: Referral Completion Trigger
--
-- Fires when a referred user verifies their email (email_verified = TRUE).
-- Calls complete_referral() which credits the referrer with 2 wishes
-- and marks the referral as completed.
-- ============================================================================

-- Trigger function: called when profiles.email_verified changes to TRUE
CREATE OR REPLACE FUNCTION public.complete_referral_on_verify()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only fire when email_verified flips from false to true
  IF NEW.email_verified = TRUE AND COALESCE(OLD.email_verified, FALSE) = FALSE THEN
    -- complete_referral is defined in 012_tokens_referrals.sql
    -- It checks for a pending referral, credits 2 tokens, marks completed
    PERFORM complete_referral(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

-- Drop existing trigger if any (idempotent)
DROP TRIGGER IF EXISTS on_email_verified_complete_referral ON public.profiles;

-- Create trigger on profiles table
CREATE TRIGGER on_email_verified_complete_referral
  AFTER UPDATE ON public.profiles
  FOR EACH ROW
  WHEN (NEW.email_verified = TRUE AND COALESCE(OLD.email_verified, FALSE) = FALSE)
  EXECUTE FUNCTION public.complete_referral_on_verify();

-- Also handle case where user signs up with OAuth (email already verified)
-- In this case email_verified might be set on INSERT, not UPDATE
DROP TRIGGER IF EXISTS on_insert_verified_complete_referral ON public.profiles;

CREATE TRIGGER on_insert_verified_complete_referral
  AFTER INSERT ON public.profiles
  FOR EACH ROW
  WHEN (NEW.email_verified = TRUE)
  EXECUTE FUNCTION public.complete_referral_on_verify();
