/**
 * OnboardingPaywallPage — slide 6 of the 7-page onboarding flow.
 *
 * Build 148.1 rewrite (physical-device feedback):
 *   The previous v1 of this file (Build 148.0) shipped a NEW paywall UI
 *   custom-built for onboarding — 2 tier cards, 4 bullets, Subscribe/
 *   Maybe-later. User feedback after testing on iPhone 14 Pro:
 *
 *     "the second to last slide being the sixth one is a new type of
 *      paywall you made. I don't know why. It should be the exact same
 *      paywall, the only one that we've been designing on the iOS app.
 *      So I want to make sure you actually put our real paywall on the
 *      sixth slide."
 *
 *   Right call — there's already a fully-designed PaywallScreen with
 *   Wishes/Subscribe tabs, hero image, animated wishes counter,
 *   SparkleBurst purchase celebration, cross-tab promo strip, MOST
 *   POPULAR badge wiggle, etc. The v1 was a duplicate UI surface with
 *   none of that polish.
 *
 *   New behavior: this component is a thin WRAPPER around the real
 *   PaywallScreen. PaywallScreen accepts (Build 148.1) three new
 *   optional props:
 *
 *     • onClose             — called when the X close button taps OR
 *                             when "Maybe later" taps. We pass
 *                             onContinue (advances FlatList → slide 7).
 *     • onPurchaseComplete  — called when a wishes pack or subscription
 *                             purchase succeeds (Alert dismissal) AND
 *                             when restore-purchase succeeds. We pass
 *                             the same onContinue here.
 *     • showSkipLink        — when true, PaywallScreen renders a
 *                             "Maybe later" link below the Continue CTA.
 *
 *   Without these props, PaywallScreen behaves exactly as before (X
 *   close → navigation.goBack, no skip link) — the in-app paywall
 *   modal is unchanged.
 *
 * Auto-skip:
 *   If the user already has a paid subscription (returning user re-
 *   entering onboarding via initialPage:5 after signout), this page
 *   bails immediately on mount via onContinue. We don't make existing
 *   subscribers re-watch a pitch for a product they already bought.
 *
 * Progress bars:
 *   Intentionally NOT rendered here. The real PaywallScreen wasn't
 *   designed with progress bars in mind, and per the user's "exact
 *   same paywall" requirement the slide should match the in-app
 *   modal visually. The progress bars on slides 1-5 and 7 still
 *   communicate position in the flow.
 *
 * Props:
 *   navigation   — forwarded to PaywallScreen for Terms / Privacy
 *                  navigation
 *   screenWidth  — required for FlatList page width
 *   progressDots — accepted but ignored (see Progress bars note above);
 *                  prop kept for API parity with OnboardingAuthPage
 *   onContinue   — () => void, called when user finishes the paywall
 *                  (subscribe success, restore success, or Maybe later)
 *   isActive     — kept for API parity; PaywallScreen doesn't need it
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';

import PaywallScreen from '../../screens/PaywallScreen';
import { useSubscription } from '../../context/SubscriptionContext';

export default function OnboardingPaywallPage({
  navigation,
  screenWidth,
  // eslint-disable-next-line no-unused-vars
  progressDots,
  onContinue,
  // eslint-disable-next-line no-unused-vars
  isActive,
}) {
  const { subscription } = useSubscription();

  // Auto-skip the paywall for existing paid subscribers. Fires once.
  const skippedRef = useRef(false);
  useEffect(() => {
    if (skippedRef.current) return;
    if (subscription?.tier && subscription.tier !== 'free') {
      skippedRef.current = true;
      // Defer one tick so the FlatList finishes any in-flight scroll
      // before we advance again.
      const t = setTimeout(() => onContinue?.(), 250);
      return () => clearTimeout(t);
    }
  }, [subscription?.tier, onContinue]);

  return (
    <View style={[styles.page, { width: screenWidth }]}>
      <PaywallScreen
        navigation={navigation}
        onClose={onContinue}
        onPurchaseComplete={onContinue}
        showSkipLink
      />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
});
