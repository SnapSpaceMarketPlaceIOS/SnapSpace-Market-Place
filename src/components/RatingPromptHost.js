import React, { useCallback } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSubscription } from '../context/SubscriptionContext';
import { supabase } from '../services/supabase';
import { requestNativeReview, isReviewAvailable } from '../services/storeReview';
import RatingPromptModal from './RatingPromptModal';

/**
 * RatingPromptHost — global mount point for the post-second-generation
 * App Store rating prompt. Renders nothing until the SubscriptionContext
 * flips `shouldShowRatingPrompt` true (which RoomResultScreen schedules
 * 1.5s after the user leaves the screen following their N-th generation).
 *
 * Mounted in App.js as a sibling of RootNavigator inside NavigationContainer
 * so the modal layers on top of every screen. Consumes useSubscription /
 * useAuth, which is why it lives inside the providers.
 *
 * Two side effects on top of dismissing the modal:
 *
 *   1. log_review_intent — best-effort RPC call that records the user's
 *      action ('engaged' / 'dismissed') in review_intent_log so we can
 *      slice engagement metrics. Failures are swallowed; the prompt
 *      experience is what matters and the row is purely analytical.
 *
 *   2. requestNativeReview() — on engage only. Tries Apple's native
 *      SKStoreReviewController via expo-store-review (best path), falls
 *      back to opening the App Store review URL. We can't observe what
 *      the user does in the native sheet — Apple's privacy model — so
 *      the engagement signal we trust is "user tapped Leave a Review on
 *      our pre-prompt," already captured by step 1.
 */
export default function RatingPromptHost() {
  const { user } = useAuth();
  const {
    subscription,
    shouldShowRatingPrompt,
    markRatingPromptShown,
    dismissRatingPrompt,
  } = useSubscription();

  // Best-effort log to review_intent_log (migration 029). Non-fatal.
  const logIntent = useCallback(async (action, reviewPath = null) => {
    if (!user?.id) return;
    try {
      await supabase.rpc('log_review_intent', {
        p_user_id:          user.id,
        p_generation_count: subscription?.generationsUsed ?? null,
        p_action:           action,
        p_review_path:      reviewPath,
      });
    } catch (e) {
      if (__DEV__) console.warn('[RatingPromptHost] log_review_intent failed:', e?.message);
    }
  }, [user?.id, subscription?.generationsUsed]);

  const handleLeaveReview = useCallback(async () => {
    // Mark the prompt as seen FIRST so a re-mount during the native
    // sheet's animation can't accidentally show our pre-prompt again.
    await markRatingPromptShown();
    let path = 'unavailable';
    try {
      path = await requestNativeReview();
    } catch (e) {
      if (__DEV__) console.warn('[RatingPromptHost] requestNativeReview threw:', e?.message);
    }
    // Log AFTER the review path resolves so the recorded path matches
    // what actually happened (native vs fallback vs unavailable).
    logIntent('engaged', path);
  }, [markRatingPromptShown, logIntent]);

  const handleMaybeLater = useCallback(() => {
    markRatingPromptShown();
    logIntent('dismissed', null);
  }, [markRatingPromptShown, logIntent]);

  // Suppress entirely if neither the native API nor a configured App
  // Store URL is available — the prompt would just be a dead-end. This
  // protects pre-launch TestFlight from showing a prompt that can't
  // route to anywhere useful. Once EXPO_PUBLIC_APP_STORE_ID is set OR
  // expo-store-review is installed, the prompt becomes available
  // automatically.
  if (!isReviewAvailable()) return null;

  return (
    <RatingPromptModal
      visible={shouldShowRatingPrompt}
      onLeaveReview={handleLeaveReview}
      onMaybeLater={handleMaybeLater}
    />
  );
}
