/**
 * OnboardingAuthPage — slide 5 of the 6-page onboarding flow.
 *
 * Build 147 v14 restructure:
 *   Previous version had inline email/password fields, signup toggle,
 *   "Forgot password?" link, promo code redemption, and legal disclosure
 *   all stuffed onto one scroll-heavy page. User feedback: too busy,
 *   not matching mockup.
 *
 *   New layout per mockup:
 *     • Title + subtitle at top (HomeGenie / Shop and Design your room with AI)
 *     • Card with two buttons:
 *         - "Sign in"        → navigates to AuthScreen (the email/password
 *                              form lives there now, separate screen)
 *         - "Sign in with Apple" → inline Apple SSO (existing handler)
 *     • Video at bottom (BIGGER than previous shrunkArt) — same Higgsfield
 *       slide-5 mp4, now occupying the lower half of the screen
 *     • Progress bars at very bottom (passed in via progressDots prop)
 *
 *   Auth happens via two paths:
 *     • Tap "Sign in" → navigates to AuthScreen (existing screen with full
 *       email/password + signup + forgot password + promo code + legal)
 *     • Tap "Sign in with Apple" → inline signInWithApple from AuthContext.
 *       OnboardingScreen's useEffect detects useAuth().user becoming truthy
 *       and auto-advances to slide 6.
 *
 *   This separation lets the onboarding flow read clean (just two buttons)
 *   while keeping the heavy email-auth UX on its own screen for users who
 *   prefer that path.
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';

import OnboardingArt from './OnboardingArt';
import SignInSheet from './SignInSheet';
import { useAuth } from '../../context/AuthContext';
import { colors } from '../../constants/colors';

const BLUE_LIGHT = colors.blueLight;     // #67ACE9
const BLUE_PRIMARY = colors.bluePrimary; // #0B6DC3

function AppleLogoIcon() {
  return (
    <Svg width={18} height={20} viewBox="0 0 18 20" fill="none">
      <Path
        d="M14.0625 10.6562C14.0703 9.91406 14.2734 9.20312 14.6484 8.58594C15.0234 7.96875 15.5547 7.46094 16.1875 7.10938C15.7656 6.50781 15.2031 6.01953 14.5391 5.6875C13.875 5.35547 13.1328 5.17188 12.375 5.15625C10.7891 4.98438 9.25 6.10156 8.4375 6.10156C7.61719 6.10156 6.375 5.17188 5.04688 5.20312C4.10156 5.23438 3.17969 5.50781 2.39844 6.0C1.61719 6.49219 0.992188 7.18359 0.578125 8.00391C-1.21094 11.0859 0.140625 15.6172 1.85156 18.0938C2.71094 19.3047 3.71875 20.6562 5.04688 20.6094C6.34375 20.5547 6.83594 19.7891 8.40625 19.7891C9.96875 19.7891 10.4297 20.6094 11.7812 20.5781C13.1719 20.5547 14.0391 19.3594 14.875 18.1406C15.4922 17.2812 15.9688 16.3281 16.2812 15.3125C15.4453 14.9531 14.7344 14.3594 14.234 13.5996C13.7335 12.8398 13.4664 11.9492 13.4609 11.0391C13.4595 10.9099 13.4658 10.7808 13.4795 10.6523L14.0625 10.6562Z"
        fill="#FFFFFF"
      />
      <Path
        d="M11.5469 3.49219C12.3203 2.56641 12.6953 1.36719 12.6094 0.15625C11.4297 0.28125 10.3438 0.85156 9.5625 1.75391C9.18359 2.19141 8.89453 2.69922 8.71094 3.24609C8.52734 3.79297 8.45312 4.36719 8.49219 4.9375C9.08594 4.94531 9.67188 4.82031 10.207 4.57031C10.7422 4.32031 11.2188 3.95312 11.5469 3.49219Z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

export default function OnboardingAuthPage({ navigation, screenWidth, progressDots, isActive = true }) {
  const insets = useSafeAreaInsets();
  const { signInWithApple } = useAuth();

  const [loading, setLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);
  // Build 147 v23: sheet visibility state. "Sign in" tap opens the sheet
  // inline; sheet handles its own dismissal. AuthScreen (the previous
  // full-screen modal navigation target) is no longer reached from here.
  const [signInSheetVisible, setSignInSheetVisible] = useState(false);

  // Probe Apple Auth availability on mount. iOS-only; non-iOS returns false.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const available = await AppleAuthentication.isAvailableAsync();
        if (!cancelled) setAppleAvailable(available);
      } catch {
        if (!cancelled) setAppleAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // ── Handlers ────────────────────────────────────────────────────────────

  // Build 147 v14: navigated to standalone AuthScreen.
  // Build 147 v23: replaced with inline bottom-sheet. SignInSheet hosts
  // the full email/password + signup + forgot + promo UX so users never
  // leave slide 5 to authenticate. AuthScreen stays mounted in App.js
  // for backward compat (deep links, signout flow) but onboarding no
  // longer routes there.
  const handleSignInPress = () => {
    setSignInSheetVisible(true);
  };

  const handleApple = async () => {
    try {
      setLoading(true);
      await signInWithApple();
      // useAuth().user changes → OnboardingScreen's useEffect advances to page 6.
    } catch (err) {
      const cancelled = err?.code === 'ERR_REQUEST_CANCELED' || /cancel/i.test(err?.message || '');
      if (!cancelled) {
        Alert.alert('Sign in with Apple Failed', err.message || 'Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  return (
    <View style={[styles.page, { width: screenWidth }]}>
      {/* Top section — title + subtitle + button card */}
      <View style={[styles.topSection, { paddingTop: insets.top + 24 }]}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>HomeGenie</Text>
          <Text style={styles.body}>Shop and Design your room with AI</Text>
        </View>

        {/* Button card — Sign in + Sign in with Apple inside a subtle
            light-gray rounded container. Matches mockup spec. */}
        <View style={styles.buttonCard}>
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleSignInPress}
            activeOpacity={0.85}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Sign in with email"
          >
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {appleAvailable && (
            <TouchableOpacity
              style={[styles.appleButton, loading && styles.primaryButtonDisabled]}
              onPress={handleApple}
              activeOpacity={0.85}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Apple"
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <AppleLogoIcon />
                  <Text style={styles.appleButtonText}>Sign in with Apple</Text>
                </>
              )}
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Video at bottom — bigger than the previous shrunkArt version.
          Uses fullBleed + cover so the slide-5 mp4 fills the available
          space edge-to-edge. isActive defaults true (handled by
          OnboardingArt default prop) so the video plays whenever this
          page renders. */}
      <View style={styles.videoBlock}>
        {/* Build 147 v22: pass isActive so the slide-5 video only plays
            when this page is the visible one. Was previously auto-
            playing from app launch like the rest of the slides before
            v12 fixed that for slides 1-4 + 6. */}
        <OnboardingArt step={5} fullBleed contentFit="cover" isActive={isActive} />
      </View>

      {/* Progress bars at very bottom — pinned with safe-area inset. */}
      <View style={[styles.dotsWrap, { paddingBottom: insets.bottom + 12 }]}>
        {progressDots}
      </View>

      {/* Build 147 v23: inline email/password sheet, replaces the old
          full-screen AuthScreen modal navigation. */}
      <SignInSheet
        visible={signInSheetVisible}
        onClose={() => setSignInSheetVisible(false)}
        navigation={navigation}
      />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Build 147 v15: page bg #FFFFFF → #F8F8F8 (super-light gray).
  // The button card flips to #FFFFFF below — gives the buttons a
  // clean "elevated" feel against the slightly darker page surface.
  page: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },

  // Upper portion: title + subtitle + button card.
  topSection: {
    paddingHorizontal: 28,
    paddingBottom: 16,
  },

  titleBlock: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 38,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  body: {
    marginTop: 10,
    fontSize: 18,
    color: BLUE_LIGHT,
    textAlign: 'center',
    lineHeight: 24,
  },

  // Card wrapping the two sign-in CTAs.
  // Build 147 v15: bg #F8F8F8 → #FFFFFF. Swapped with the page bg so
  // the card now reads as a brighter elevated surface against the
  // soft-gray page background.
  buttonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
  },

  primaryButton: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 30,
    height: 50,
    borderWidth: 1,
    borderColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#D7E3F0' },
  orText: {
    marginHorizontal: 12,
    color: BLUE_PRIMARY,
    fontSize: 13,
    fontWeight: '500',
  },

  appleButton: {
    backgroundColor: '#000000',
    borderRadius: 30,
    height: 50,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginLeft: 8,
  },

  // Bottom half — the bigger Higgsfield video. flex:1 fills all space
  // between the topSection above and the dotsWrap below.
  // Build 147 v19: bg #F8F8F8 → #FFFFFF. With 0.9× scale on the video
  // the bg shows around the composition; matching to white blends with
  // the video's own near-white render so no visible edge remains.
  videoBlock: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
  },

  // Progress bars row at the very bottom of the screen.
  // Build 147 v15: bg #FFFFFF → #F8F8F8 to match the new page bg so
  // there's no visible seam between the video bottom and the dots row.
  dotsWrap: {
    paddingHorizontal: 28,
    paddingTop: 8,
    backgroundColor: '#F8F8F8',
  },
});
