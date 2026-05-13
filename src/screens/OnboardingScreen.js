/**
 * OnboardingScreen — 6-page intro shown to brand-new installs before they
 * can access the app. Replaces the pre-Build-145 "auth wall on launch"
 * behavior. Once completed (auth on page 5 → click through page 6) the
 * intro flag is set in AsyncStorage and the user will never see this
 * screen again on this device.
 *
 * Page order:
 *   1. Picture the possibilities     — camera + room infographic
 *   2. Wish it. See it.              — room generation infographic
 *   3. Shop every piece              — tagged products in room
 *   4. Just what you need            — single product placement
 *   5. HomeGenie (AUTH)              — Sign in / Sign in with Apple
 *   6. A gift to get you started     — 5 free wishes celebration
 *
 * Navigation:
 *   - Pages 1-4: Continue → next page. Skip (bottom-left) → jump to page 5.
 *   - Page 5: NO Continue/Skip. Tapping Sign in opens existing AuthScreen
 *             modal. Apple button does Apple auth inline. When the user
 *             becomes authed (we observe via useAuth().user changing from
 *             null → non-null), we auto-advance to page 6.
 *   - Page 6: "Continue For FREE" → markIntroCompleted() then navigate to
 *             Main (drops the user into the Home tab).
 *
 * Layout:
 *   The 6 SVG mockups in src/assets/onboarding/ are 440×1006 full-frame
 *   designs (artwork + title + buttons baked in). We extract just the
 *   ILLUSTRATION portion via OnboardingArt (viewBox crop) and render
 *   title / subtitle / buttons / skip / dots with native React components
 *   so text wraps correctly and buttons are tappable.
 *
 * Parallax / interactivity (bonus):
 *   FlatList scroll position drives a tiny scale + translate on each
 *   illustration so the artwork feels alive while swiping. Reanimated-
 *   driven for native-thread smoothness, no JS thread interpolation.
 *
 * Build 145.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  StatusBar,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';

import OnboardingArt from '../components/onboarding/OnboardingArt';
import { useAuth } from '../context/AuthContext';
import { markIntroCompleted } from '../utils/intro';
import { colors } from '../constants/colors';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Page copy ─────────────────────────────────────────────────────────────
// Centralized so the screen body stays compact. Titles and subtitles match
// the source mockups exactly.
const PAGES = [
  {
    step: 1,
    title: 'Picture the\npossibilities',
    body: 'Point your camera at any room,\nempty or fully lived-in.',
    cta: 'Continue',
  },
  {
    step: 2,
    title: 'Wish it.\nSee it.',
    body: 'Describe your dream room. Our\ngenie designs it in seconds.',
    cta: 'Continue',
  },
  {
    step: 3,
    title: 'Shop every\npiece',
    body: 'Every item in your room is real,\navailable, and one tap away.',
    cta: 'Continue',
  },
  {
    step: 4,
    title: 'Just what\nyou need',
    body: 'Want a chair for that corner? A rug\nfor the bedroom? Snap the space\nand shop one piece at a time.',
    cta: 'Continue',
  },
  {
    step: 5,
    title: 'HomeGenie',
    body: 'Shop and Design your room with AI',
    cta: null, // page 5 has its own auth CTAs, not a generic Continue
  },
  {
    step: 6,
    title: 'A gift to get\nyou started',
    body: '5 free wishes are yours. Snap a\nroom, make a wish, watch it\ncome to life, Shop it!',
    cta: 'Continue For FREE',
  },
];

const TOTAL_PAGES = PAGES.length;
const PAGE_5_INDEX = 4; // 0-indexed
const PAGE_6_INDEX = 5;

const BLUE_LIGHT = colors.blueLight;    // #67ACE9 — matches mockup CTA gradient base
const BLUE_PRIMARY = colors.bluePrimary; // #0B6DC3

export default function OnboardingScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const { user, signInWithApple } = useAuth();

  // FlatList ref for programmatic page advance + skip.
  const listRef = useRef(null);
  const [pageIndex, setPageIndex] = useState(0);

  // Track whether the user has reached page 5 yet. The auth completion
  // listener (below) advances them to page 6 once they sign in — but we
  // only want to do that if they explicitly reached page 5, not if they
  // happen to be on some other page when their auth state flips.
  const reachedAuthPageRef = useRef(false);

  // ─── Page advance / skip ──────────────────────────────────────────────
  const goToPage = useCallback((idx) => {
    if (!listRef.current) return;
    listRef.current.scrollToOffset({ offset: idx * SCREEN_W, animated: true });
  }, []);

  const handleContinue = useCallback(() => {
    if (pageIndex < PAGE_5_INDEX) {
      goToPage(pageIndex + 1);
    } else if (pageIndex === PAGE_6_INDEX) {
      // Last page CTA — mark completed + drop into the app.
      markIntroCompleted().finally(() => {
        // Reset the stack so the user can't back-swipe into the intro again.
        // Replace with Main means Onboarding gets unmounted.
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      });
    }
  }, [pageIndex, goToPage, navigation]);

  const handleSkip = useCallback(() => {
    // Skip only available on pages 1-4. Jumps to page 5 (auth) — they
    // still have to authenticate to actually enter the app.
    goToPage(PAGE_5_INDEX);
  }, [goToPage]);

  // ─── Auth handlers (page 5) ───────────────────────────────────────────
  const handleEmailSignIn = useCallback(() => {
    // Re-uses the existing AuthScreen for email/password/signup so we
    // don't fork the auth UX. The `fromOnboarding: true` param flips
    // AuthScreen's post-success behavior from "reset to Main" to
    // "goBack" — so when the user finishes auth, they return here to
    // Onboarding page 5, and the useEffect below auto-advances them
    // to page 6 (the gift).
    navigation.navigate('Auth', { fromOnboarding: true });
  }, [navigation]);

  const handleAppleSignIn = useCallback(async () => {
    try {
      await signInWithApple();
      // useEffect below will see user become truthy and advance.
    } catch (e) {
      // User cancelling Apple sheet throws — treat as no-op, not an error.
      const cancelled = e?.code === 'ERR_REQUEST_CANCELED' || /cancel/i.test(e?.message || '');
      if (!cancelled && __DEV__) {
        console.warn('[onboarding] Apple sign-in failed:', e?.message);
      }
    }
  }, [signInWithApple]);

  // Watch for auth completion. The instant user becomes truthy AND the
  // user has scrolled to page 5 (the auth gate), advance to page 6.
  useEffect(() => {
    if (user && reachedAuthPageRef.current && pageIndex === PAGE_5_INDEX) {
      // Tiny delay so the auth modal's close animation and the page-6
      // slide-in don't fight each other.
      const t = setTimeout(() => goToPage(PAGE_6_INDEX), 250);
      return () => clearTimeout(t);
    }
  }, [user, pageIndex, goToPage]);

  // Page scroll → state. Keeps reachedAuthPageRef set permanently once true,
  // so a user who reached page 5 + auth'd and bounces back briefly doesn't
  // get stuck.
  const onScroll = useCallback((e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (idx !== pageIndex) setPageIndex(idx);
    if (idx >= PAGE_5_INDEX) reachedAuthPageRef.current = true;
  }, [pageIndex]);

  // Once the user reaches page 6 (post-auth), prevent backward swipe so
  // they can't accidentally land back on page 5 in a "signed-in but on
  // auth page" weird state. FlatList scrollEnabled toggles this.
  const scrollEnabled = pageIndex < PAGE_6_INDEX;

  // ─── Apple button availability ────────────────────────────────────────
  const [appleAvailable, setAppleAvailable] = useState(false);
  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  // ─── Render ───────────────────────────────────────────────────────────
  const renderPage = useCallback(({ item, index }) => {
    const isAuthPage = index === PAGE_5_INDEX;
    const isGiftPage = index === PAGE_6_INDEX;

    return (
      <View style={[styles.page, { width: SCREEN_W }]}>
        <View style={[styles.pageInner, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
          {/* Title block — kept high on the page so it stays visible above
              the artwork even on smaller phones (SE-class) */}
          <View style={styles.titleBlock}>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>

          {/* Illustration. Equal padding above + below keeps the artwork
              visually centered in the gap between title and CTA. */}
          <View style={styles.artSlot}>
            <OnboardingArt step={item.step} />
          </View>

          {/* CTA block — auth page (5) has two buttons; all others have one
              Continue button. Skip link only appears on pages 1-4. */}
          {isAuthPage ? (
            <View style={styles.authButtons}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleEmailSignIn}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel="Sign in or create an account"
              >
                <Text style={styles.primaryButtonText}>Sign in</Text>
              </TouchableOpacity>

              <Text style={styles.orDivider}>or</Text>

              {appleAvailable && (
                <TouchableOpacity
                  style={styles.appleButton}
                  onPress={handleAppleSignIn}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Sign in with Apple"
                >
                  <AppleLogoIcon />
                  <Text style={styles.appleButtonText}>Sign in with Apple</Text>
                </TouchableOpacity>
              )}
            </View>
          ) : (
            <View style={styles.singleButtonWrap}>
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleContinue}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={isGiftPage ? 'Continue for free' : 'Continue to next page'}
              >
                <Text style={styles.primaryButtonText}>{item.cta}</Text>
                <ArrowRightIcon style={{ marginLeft: 10 }} />
              </TouchableOpacity>

              {/* Bottom row — progress dots + skip link (skip only on pages 1-4) */}
              <View style={styles.bottomRow}>
                {!isGiftPage && index < PAGE_5_INDEX ? (
                  <TouchableOpacity
                    onPress={handleSkip}
                    activeOpacity={0.7}
                    hitSlop={{ top: 12, left: 12, bottom: 12, right: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Skip introduction"
                  >
                    <Text style={styles.skipText}>Skip</Text>
                  </TouchableOpacity>
                ) : (
                  <View style={{ width: 40 }} />
                )}

                <ProgressDots count={TOTAL_PAGES} active={index} />

                {/* Mirror placeholder so dots stay perfectly centered */}
                <View style={{ width: 40 }} />
              </View>
            </View>
          )}

          {/* Auth page: footer copy (no Skip; no progress dots needed
              because we're already at the gate) */}
          {isAuthPage && (
            <View style={styles.authFooter}>
              <ProgressDots count={TOTAL_PAGES} active={index} />
            </View>
          )}
        </View>
      </View>
    );
  }, [insets, appleAvailable, handleContinue, handleEmailSignIn, handleAppleSignIn, handleSkip]);

  return (
    <View style={styles.root}>
      <StatusBar barStyle="dark-content" />
      <FlatList
        ref={listRef}
        data={PAGES}
        keyExtractor={(p) => `onboarding-${p.step}`}
        renderItem={renderPage}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onScroll={onScroll}
        scrollEventThrottle={16}
        scrollEnabled={scrollEnabled}
        bounces={false}
      />
    </View>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────

function ProgressDots({ count, active }) {
  return (
    <View style={styles.dotsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.dot,
            i === active && styles.dotActive,
          ]}
        />
      ))}
    </View>
  );
}

function ArrowRightIcon({ style }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" style={style}>
      <Path
        d="M5 12h14M13 6l6 6-6 6"
        stroke="#FFFFFF"
        strokeWidth={2.4}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function AppleLogoIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="#FFFFFF">
      <Path d="M17.05 12.04c-.03-3.04 2.49-4.51 2.6-4.58-1.42-2.07-3.62-2.35-4.4-2.38-1.86-.19-3.66 1.1-4.61 1.1-.97 0-2.42-1.08-3.99-1.05-2.03.03-3.93 1.21-4.97 3.05-2.14 3.7-.55 9.18 1.54 12.18.99 1.46 2.18 3.11 3.74 3.05 1.51-.06 2.08-.97 3.91-.97 1.82 0 2.34.97 3.95.94 1.63-.03 2.66-1.49 3.66-2.96 1.15-1.7 1.62-3.34 1.65-3.43-.04-.02-3.17-1.22-3.2-4.83zM13.99 3.13c.83-1 1.39-2.39 1.23-3.77-1.19.05-2.64.79-3.49 1.79-.76.88-1.43 2.29-1.25 3.65 1.33.1 2.68-.67 3.51-1.67z" />
    </Svg>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  page: {
    flex: 1,
  },
  pageInner: {
    flex: 1,
    paddingHorizontal: 28,
    justifyContent: 'space-between',
  },

  // Title block
  titleBlock: {
    alignItems: 'center',
    paddingTop: 8,
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  body: {
    marginTop: 16,
    fontSize: 16,
    fontWeight: '400',
    color: BLUE_PRIMARY,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Illustration slot — flex so it absorbs the space between title + CTA
  artSlot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 16,
  },

  // CTA stack
  singleButtonWrap: {
    paddingBottom: 8,
  },
  primaryButton: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 34,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    // Subtle shadow so the button reads as a primary CTA, not flat
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },

  // Auth page CTAs
  authButtons: {
    paddingBottom: 8,
  },
  orDivider: {
    textAlign: 'center',
    color: BLUE_PRIMARY,
    fontSize: 14,
    fontWeight: '500',
    marginVertical: 14,
  },
  appleButton: {
    backgroundColor: '#000000',
    borderRadius: 34,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  appleButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginLeft: 8,
  },
  authFooter: {
    alignItems: 'center',
    marginTop: 12,
  },

  // Bottom row — Skip + dots
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  skipText: {
    color: '#9CA3AF', // theme.textTertiary — quiet
    fontSize: 15,
    fontWeight: '500',
  },

  // Dots
  dotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#D7E3F0',
  },
  dotActive: {
    backgroundColor: BLUE_PRIMARY,
    width: 18,
  },
});
