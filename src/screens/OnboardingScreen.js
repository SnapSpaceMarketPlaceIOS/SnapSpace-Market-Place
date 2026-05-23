/**
 * OnboardingScreen — 6-page intro shown to brand-new installs before they
 * can access the app. Replaces the pre-Build-145 "auth wall on launch"
 * behavior. Once completed (auth on page 5 → click through page 6) the
 * intro flag is set in AsyncStorage and the user will never see this
 * screen again on this device.
 *
 * Page order:
 *   1. Picture the possibilities     — Log In + Sign Up (both → page 2)
 *   2. Wish it. See it.              — Continue → page 3
 *   3. Shop every piece              — Continue → page 4
 *   4. Just what you need            — Continue → page 5
 *   5. HomeGenie (AUTH)              — Sign in / Sign in with Apple
 *                                       (handled by OnboardingAuthPage,
 *                                        existing layout untouched)
 *   6. A gift to get you started     — Continue For FREE → completes
 *                                       onboarding, drops into Main
 *
 * Build 147 layout restructure:
 *   • Video block at top, edge-to-edge (covers from safe-area top down
 *     to roughly the vertical midpoint of the screen).
 *   • 1pt black divider under the video.
 *   • Content block below (title, body, CTA, progress bars).
 *   • Skip removed entirely (was previously available on pages 1-4).
 *   • Back arrow removed entirely.
 *   • Dots progress indicator → segmented horizontal bars.
 *
 * Build 147 slide-1 CTA change:
 *   • Replaces the single "Continue" with a dual-button row: "Log In"
 *     (filled blue) and "Sign Up" (outlined blue). BOTH buttons simply
 *     advance to slide 2 — actual auth still happens on slide 5.
 *     User decision: visual differentiation only at this point in the
 *     funnel; the real account creation/login flow lives on the auth
 *     page where it belongs.
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
import OnboardingArt from '../components/onboarding/OnboardingArt';
import OnboardingAuthPage from '../components/onboarding/OnboardingAuthPage';
import { useAuth } from '../context/AuthContext';
import { markIntroCompleted } from '../utils/intro';
import { colors } from '../constants/colors';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Page copy ─────────────────────────────────────────────────────────────
// Centralized so the screen body stays compact. Titles and subtitles match
// the source mockups exactly. cta:null = slide has custom buttons handled
// inline in renderPage (slide 1 dual-button, slide 5 auth page).
const PAGES = [
  {
    step: 1,
    title: 'Picture the\npossibilities',
    body: 'Point your camera at any room,\nempty or fully lived-in.',
    cta: null, // slide 1 = Log In + Sign Up dual buttons
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
    cta: null, // handled by OnboardingAuthPage
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

export default function OnboardingScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();

  // Build 145 — route param entry point. `initialPage` is 1-indexed to
  // match how the design refers to pages (page 1 = marketing intro,
  // page 5 = auth, page 6 = gift). Defaults to page 1 for fresh-install
  // first-time flow. Post-signout / soft-wall navigations pass
  // `initialPage: 5` to jump straight to the auth page so returning
  // users don't have to re-watch pages 1-4.
  const requestedPage = route?.params?.initialPage ?? 1;
  const initialPage = Math.max(0, Math.min(PAGES.length - 1, requestedPage - 1));

  // FlatList ref for programmatic page advance.
  const listRef = useRef(null);
  const [pageIndex, setPageIndex] = useState(initialPage);

  // Track whether the user has reached page 5 yet. The auth completion
  // listener (below) advances them to page 6 once they sign in — but we
  // only want to do that if they explicitly reached page 5, not if they
  // happen to be on some other page when their auth state flips.
  // Pre-seed to true if we entered at page 5 (returning-user re-auth flow).
  const reachedAuthPageRef = useRef(initialPage >= 4);

  // ─── Page advance ─────────────────────────────────────────────────────
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

  // Watch for auth completion. The instant user becomes truthy AND the
  // user has scrolled to page 5 (the auth gate), advance to page 6.
  // Build 145: page 5 is now the inline auth page (OnboardingAuthPage),
  // so the keyboard may still be up when auth completes. The setTimeout
  // gives the keyboard time to dismiss before the page-6 slide-in.
  useEffect(() => {
    if (user && reachedAuthPageRef.current && pageIndex === PAGE_5_INDEX) {
      const t = setTimeout(() => goToPage(PAGE_6_INDEX), 350);
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

  // ─── Render ───────────────────────────────────────────────────────────
  const renderPage = useCallback(({ item, index }) => {
    const isAuthPage = index === PAGE_5_INDEX;
    const isSlide1 = index === 0;

    // Build 145 — page 5 is its own self-contained component that owns the
    // inline auth form (email/password, Apple, signup toggle, Forgot
    // password, promo codes, ToS/Privacy disclosure). Build 147: progress
    // indicator changes to bars but the existing prop name 'progressDots'
    // is kept for back-compat — content is now bars.
    if (isAuthPage) {
      return (
        <OnboardingAuthPage
          navigation={navigation}
          screenWidth={SCREEN_W}
          progressDots={<ProgressBars count={TOTAL_PAGES} active={index} />}
        />
      );
    }

    return (
      <View style={[styles.page, { width: SCREEN_W }]}>
        {/* ── Video block — edge-to-edge top ─────────────────────────────
            Build 147 v2: backgroundColor #FFFFFF → #F5F7FA to blend
            with the Higgsfield-rendered videos' off-white bg, removing
            the visible seam at the video/container boundary. flex 0.55
            → 0.6 makes the video block bigger per user direction.
            ─────────────────────────────────────────────────────────────── */}
        <View style={[styles.videoBlock, { paddingTop: insets.top }]}>
          <OnboardingArt step={item.step} fullBleed contentFit="contain" />
        </View>

        {/* ── 1pt black divider between video and content ─────────────── */}
        <View style={styles.divider} />

        {/* ── Content block — title, body, CTA, progress bars ───────────
            Build 147 v2: restructured. contentTop groups title + body +
            buttons into one TIGHT stack (was previously spread by
            justify-content:space-between which created huge empty space
            between body and CTA). Progress bars now pinned to the bottom
            via justify-content:space-between on the outer contentBlock.
            ─────────────────────────────────────────────────────────────── */}
        <View style={[styles.contentBlock, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.contentTop}>
            <View style={styles.titleBlock}>
              <Text style={styles.title}>{item.title}</Text>
              <Text style={styles.body}>{item.body}</Text>
            </View>

            {isSlide1 ? (
              // Build 147: dual-button row on slide 1 only. Both Log In
              // and Sign Up just advance to slide 2 — actual auth lives
              // on slide 5. Visual differentiation only at this stage.
              <View style={styles.dualButtonRow}>
                <TouchableOpacity
                  style={[styles.btnHalf, styles.btnFilled]}
                  onPress={handleContinue}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Log In"
                >
                  <Text style={styles.btnFilledText}>Log In</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnHalf, styles.btnOutline]}
                  onPress={handleContinue}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Sign Up"
                >
                  <Text style={styles.btnOutlineText}>Sign Up</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity
                style={styles.primaryButton}
                onPress={handleContinue}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={item.cta}
              >
                <Text style={styles.primaryButtonText}>{item.cta}</Text>
                <ArrowRightIcon style={{ marginLeft: 10 }} />
              </TouchableOpacity>
            )}
          </View>

          {/* Progress bars pinned to bottom via parent space-between */}
          <ProgressBars count={TOTAL_PAGES} active={index} />
        </View>
      </View>
    );
  }, [insets, handleContinue, navigation]);

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
        getItemLayout={(_, idx) => ({ length: SCREEN_W, offset: SCREEN_W * idx, index: idx })}
        initialScrollIndex={initialPage}
      />
    </View>
  );
}

// ─── Subcomponents ──────────────────────────────────────────────────────

// Build 147: segmented horizontal bars replacing the previous round dots.
// Active bar fills blue; inactive bars are a quiet light-blue/gray. Each
// bar gets equal flex so 6 bars span the screen evenly with small gaps.
function ProgressBars({ count, active }) {
  return (
    <View style={styles.progressBarsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.progressBar,
            i === active && styles.progressBarActive,
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

// ─── Styles ──────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  page: {
    flex: 1,
  },

  // Top hero — video fills horizontally edge-to-edge.
  // Build 147 v2: flex 0.55 → 0.6 (bigger video per user direction).
  // backgroundColor #FFFFFF → #F5F7FA to blend with the Higgsfield
  // videos' subtle off-white background. Pure white was leaving a
  // visible seam at the edges where the video frame met the container.
  videoBlock: {
    flex: 0.6,
    width: '100%',
    backgroundColor: '#F5F7FA',
  },

  // 1pt black hard divider between video and content blocks.
  divider: {
    height: 1,
    backgroundColor: '#000000',
    width: '100%',
  },

  // Bottom content — title, body, CTA, progress.
  // Build 147 v2: flex 0.45 → 0.4 (tighter content area, more video).
  // justify-between still applies, but now the children are:
  //   1. contentTop — title + body + buttons grouped tight at the top
  //   2. ProgressBars — pinned to the bottom edge
  // This kills the previous huge empty space between body and CTA.
  contentBlock: {
    flex: 0.4,
    paddingHorizontal: 28,
    paddingTop: 24,
    justifyContent: 'space-between',
  },

  // Title + body + CTA grouped together at the top of the content area.
  // No special styles — children stack naturally with tight margins
  // defined on body and on the button containers.
  contentTop: {
    // intentionally empty — flex column default; children control gaps
  },

  // Title block — sits high in the content area, just under the divider.
  titleBlock: {
    alignItems: 'center',
  },
  title: {
    fontSize: 34,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    lineHeight: 40,
    letterSpacing: -0.5,
  },
  // Build 147 v2: marginTop 16 → 10 (tighter body-to-title spacing,
  // matches the mockup's compact heading block).
  body: {
    marginTop: 10,
    fontSize: 16,
    fontWeight: '400',
    color: BLUE_PRIMARY,
    textAlign: 'center',
    lineHeight: 22,
  },

  // Slide 1 dual-button row (Log In + Sign Up).
  // flex:1 on each button + gap:12 between them gives equal-width
  // buttons spanning the content padding box.
  // Build 147 v2: marginTop:24 pulls the buttons close to the body
  // text above (was previously floating with huge gap from the
  // justify-content:space-between layout).
  dualButtonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  btnHalf: {
    flex: 1,
    height: 56,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnFilled: {
    backgroundColor: BLUE_LIGHT,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  btnFilledText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  btnOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: BLUE_LIGHT,
  },
  btnOutlineText: {
    color: BLUE_LIGHT,
    fontSize: 17,
    fontWeight: '700',
  },

  // Continue button — single CTA on slides 2-4 + 6.
  // Build 147 v2: marginTop:24 matches dualButtonRow for visual
  // consistency across slides — buttons sit close to the body text.
  primaryButton: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 34,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    marginTop: 24,
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

  // Build 147 — segmented bars at the bottom of each slide.
  // Build 147 v2: thinner + tighter per mockup feedback.
  //   height 4 → 3 (thinner)
  //   borderRadius 2 → 1.5 (matches thinner bar)
  //   gap 6 → 4 (closer together)
  //   marginTop:18 removed — bars are now pinned to bottom via parent
  //   contentBlock's justify-content:space-between, so they sit at the
  //   bottom edge of the content area naturally.
  progressBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  progressBar: {
    flex: 1,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: '#D7E3F0',
  },
  progressBarActive: {
    backgroundColor: BLUE_PRIMARY,
  },
});
