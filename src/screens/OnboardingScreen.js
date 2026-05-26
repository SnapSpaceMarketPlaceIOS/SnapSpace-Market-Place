/**
 * OnboardingScreen — 7-page intro shown to brand-new installs before they
 * can access the app. Replaces the pre-Build-145 "auth wall on launch"
 * behavior. Once completed (auth on page 5 → paywall on page 6 → reward
 * on page 7) the intro flag is set in AsyncStorage and the user will
 * never see this screen again on this device.
 *
 * Page order (Build 148 — paywall insertion):
 *   1. Picture the possibilities     — Log In + Sign Up (both → page 2)
 *   2. Wish it. See it.              — Continue → page 3
 *   3. Shop every piece              — Continue → page 4
 *   4. Just what you need            — Continue → page 5
 *   5. HomeGenie (AUTH)              — Sign in / Sign in with Apple
 *                                       (handled by OnboardingAuthPage —
 *                                        inline form mode now, no popup)
 *                                       Swipe-forward is BLOCKED here
 *                                       until useAuth().user becomes
 *                                       truthy (see swipe-gate notes
 *                                       on onMomentumScrollEnd below).
 *   6. Paywall                        — OnboardingPaywallPage: 2 tier
 *                                       cards, Subscribe CTA, "Maybe
 *                                       later" link. Subscribe OR Maybe
 *                                       later → advances to page 7.
 *                                       If user already has paid sub
 *                                       (returning user via initialPage:5
 *                                       re-auth flow) the page auto-
 *                                       skips itself on mount.
 *   7. A gift to get you started     — Continue For FREE → completes
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
  TextInput,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Dimensions,
  StatusBar,
  KeyboardAvoidingView,
  Keyboard,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import OnboardingArt from '../components/onboarding/OnboardingArt';
import OnboardingAuthPage from '../components/onboarding/OnboardingAuthPage';
import OnboardingPaywallPage from '../components/onboarding/OnboardingPaywallPage';
import { useAuth } from '../context/AuthContext';
import { markIntroCompleted } from '../utils/intro';
import { colors } from '../constants/colors';

// Build 148.2 — onboarding intake answers persisted to AsyncStorage on
// completion. Read by Profile / analytics later; non-blocking if the
// write fails (the funnel still completes either way). Keys live in
// one constant so the consumer doesn't have to guess.
const ONBOARDING_INTAKE_KEY = 'onboarding_intake_v1';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Page copy ─────────────────────────────────────────────────────────────
// Centralized so the screen body stays compact. Titles and subtitles match
// the source mockups exactly. cta:null = slide has custom buttons handled
// inline in renderPage (slide 1 dual-button, slide 5 auth page, slide 6
// paywall page).
// Build 148.2 — optional intake fields on slides 2, 3, 4. Each accepts
// free-form text via a single-line pill above the Continue button.
// User can submit empty (no validation). Values land in
// `intakeAnswers` state and persist to AsyncStorage on flow completion.
// The first name on slide 2 also seeds the OnboardingAuthPage Full name
// input so signup feels continuous.
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
    intakeKey: 'firstName',
    intakePlaceholder: 'First name…',
    intakeAutoCapitalize: 'words',
  },
  {
    step: 3,
    title: 'Shop every\npiece',
    body: 'Every item in your room is real,\navailable, and one tap away.',
    cta: 'Continue',
    intakeKey: 'shoppingPref',
    intakePlaceholder: 'Where do you shop right now for home design…',
    intakeAutoCapitalize: 'sentences',
  },
  {
    step: 4,
    // Build 148.3 — title on ONE line per user feedback. "Just what you
    // need" at fontSize 28 (vs the default 38 used by other slides) fits
    // the 224pt usable width without wrapping. styleSlide4 applies the
    // smaller font + extra body padding.
    title: 'Just what you need',
    body: 'Want a chair for that corner? A rug\nfor the bedroom? Snap the space\nand shop one piece at a time.',
    cta: 'Continue',
    intakeKey: 'referralSource',
    intakePlaceholder: 'How did you hear about us?',
    intakeAutoCapitalize: 'sentences',
  },
  {
    step: 5,
    title: 'HomeGenie',
    body: 'Shop and Design your room with AI',
    cta: null, // handled by OnboardingAuthPage
  },
  {
    step: 6,
    title: 'Unlock the\nfull experience',
    body: 'Choose a plan to unlock unlimited designs.',
    cta: null, // handled by OnboardingPaywallPage
  },
  {
    step: 7,
    title: 'A gift to get\nyou started',
    body: '5 free wishes are yours. Snap a\nroom, make a wish, watch it\ncome to life, Shop it!',
    cta: 'Continue For FREE',
  },
];

const TOTAL_PAGES = PAGES.length;
// 0-indexed slide pointers. Slide 5 (auth) at index 4, slide 6 (paywall)
// at index 5, slide 7 (reward) at index 6. AUTH_INDEX is the swipe-gate
// pivot — forward swiping past this index requires useAuth().user to be
// truthy. LAST_INDEX (= TOTAL_PAGES - 1) is the reward slide; its CTA
// finishes onboarding.
const AUTH_INDEX = 4;
const PAYWALL_INDEX = 5;
const LAST_INDEX = TOTAL_PAGES - 1; // reward slide

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

  // Build 148.2 — optional intake answers from slides 2-4. None of these
  // are required (the user can press Continue with empty values), and
  // we never block flow advancement on them. The first name is the only
  // one with a downstream consumer — it pre-fills the Full name input
  // on the slide-5 signup form so the user doesn't have to retype it.
  const [intakeAnswers, setIntakeAnswers] = useState({
    firstName: '',
    shoppingPref: '',
    referralSource: '',
  });
  const updateIntake = useCallback((key, value) => {
    setIntakeAnswers((prev) => ({ ...prev, [key]: value }));
  }, []);

  // Build 149.1 — keyboard visibility tracker. When the user taps an
  // intake field (slides 2-4) iOS's keyboard pushes the page content
  // up, and the progress-bar row + back-arrow row at the bottom of
  // the slide end up sitting flush above the keyboard, overlapping
  // the Continue button. Hiding them while the keyboard is up keeps
  // the focused-input view clean; they reappear the moment the
  // keyboard dismisses.
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);

  // Track whether the user has reached page 5 yet. The auth completion
  // listener (below) advances them to page 6 once they sign in — but we
  // only want to do that if they explicitly reached page 5, not if they
  // happen to be on some other page when their auth state flips.
  // Pre-seed to true if we entered at page 5 (returning-user re-auth flow).
  const reachedAuthPageRef = useRef(initialPage >= AUTH_INDEX);

  // ─── Page advance ─────────────────────────────────────────────────────
  const goToPage = useCallback((idx) => {
    if (!listRef.current) return;
    listRef.current.scrollToOffset({ offset: idx * SCREEN_W, animated: true });
  }, []);

  const handleContinue = useCallback(() => {
    if (pageIndex < AUTH_INDEX) {
      // Slides 1-4 → next slide
      goToPage(pageIndex + 1);
    } else if (pageIndex === LAST_INDEX) {
      // Reward CTA — persist intake answers, mark completed + drop into
      // the app. The intake write is fire-and-forget; we don't block on
      // it because the user expects an immediate transition.
      AsyncStorage.setItem(
        ONBOARDING_INTAKE_KEY,
        JSON.stringify(intakeAnswers),
      ).catch((err) => {
        console.warn('[Onboarding] intake persistence failed:', err?.message);
      });
      markIntroCompleted().finally(() => {
        // Reset the stack so the user can't back-swipe into the intro again.
        // Replace with Main means Onboarding gets unmounted.
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      });
    }
    // Slides 5 + 6 have their own custom CTAs handled by the page
    // components themselves (auth → useAuth observer; paywall → onContinue
    // callback). Reaching this function from those slides would be a bug
    // — but no-op rather than crash.
  }, [pageIndex, goToPage, navigation, intakeAnswers]);

  // Build 148.2 — back arrow handler used by slides 2-5. Slides 6+ don't
  // expose a back arrow at all (paywall + reward are terminal). For
  // slide 5 the OnboardingAuthPage component owns this routing — choice
  // mode taps onBack which we wire here; form mode handles its own
  // "back to choice" internally.
  const handleBack = useCallback(() => {
    if (pageIndex <= 0) return;
    goToPage(pageIndex - 1);
  }, [pageIndex, goToPage]);

  // Watch for auth completion. The instant user becomes truthy AND the
  // user has scrolled to page 5 (the auth gate), advance to page 6 (the
  // paywall). Build 148: target is now PAYWALL_INDEX (was the reward at
  // index 5). The paywall page itself handles advance-to-reward via its
  // onContinue callback.
  // The setTimeout gives the keyboard (form mode on auth page) time to
  // dismiss before the next slide animates in.
  useEffect(() => {
    if (user && reachedAuthPageRef.current && pageIndex === AUTH_INDEX) {
      const t = setTimeout(() => goToPage(PAYWALL_INDEX), 350);
      return () => clearTimeout(t);
    }
  }, [user, pageIndex, goToPage]);

  // Page scroll → state. Keeps reachedAuthPageRef set permanently once true,
  // so a user who reached page 5 + auth'd and bounces back briefly doesn't
  // get stuck.
  const onScroll = useCallback((e) => {
    const idx = Math.round(e.nativeEvent.contentOffset.x / SCREEN_W);
    if (idx !== pageIndex) setPageIndex(idx);
    if (idx >= AUTH_INDEX) reachedAuthPageRef.current = true;
  }, [pageIndex]);

  // ── Swipe lock (Build 148.1 — physical-device feedback) ───────────────
  // Build 148.0 used a snap-back on momentum-end pattern to gate forward
  // swipe past the auth slide. Problem on physical device: if the user
  // flicked fast enough, the FlatList briefly displayed the paywall /
  // reward content during the rubber-band travel — long enough to
  // glimpse, and on a hard flick they could overshoot the snap-back and
  // land on a later page entirely, bypassing auth.
  //
  // Fix: kill swipe entirely. `scrollEnabled={false}` on the FlatList
  // blocks ALL user gestures (both directions). The only way forward is
  // via the explicit Continue / Log In / Sign Up / Subscribe / Maybe
  // later / Continue For FREE buttons on each slide. Programmatic
  // scrolling (scrollToOffset, used by goToPage) is unaffected by
  // scrollEnabled — pageviews still advance when buttons fire.
  //
  // The onMomentumScrollEnd handler is removed (no momentum events fire
  // when the user can't drag). The auth-success useEffect still drives
  // the slide-5 → slide-6 advance once `useAuth().user` flips truthy.
  const scrollEnabled = false;

  // ── Paywall → reward advance (Build 148) ──────────────────────────────
  // OnboardingPaywallPage calls this when the user finishes the paywall
  // (either via successful Subscribe OR Maybe later). Always advances to
  // the reward slide. Wrapped in useCallback so the paywall's auto-skip
  // useEffect doesn't re-fire on every parent render.
  const advanceFromPaywall = useCallback(() => {
    goToPage(LAST_INDEX);
  }, [goToPage]);

  // ─── Render ───────────────────────────────────────────────────────────
  const renderPage = useCallback(({ item, index }) => {
    const isAuthPage = index === AUTH_INDEX;
    const isPaywallPage = index === PAYWALL_INDEX;
    const isSlide1 = index === 0;

    // Build 145 — page 5 is its own self-contained component that owns the
    // inline auth form (email/password, Apple, signup toggle, Forgot
    // password, promo codes, ToS/Privacy disclosure). Build 147: progress
    // indicator changes to bars but the existing prop name 'progressDots'
    // is kept for back-compat — content is now bars.
    // Build 148: form mode is now inline (no Modal); component morphs
    // between 'choice' and 'form' internally.
    if (isAuthPage) {
      return (
        <OnboardingAuthPage
          navigation={navigation}
          screenWidth={SCREEN_W}
          progressDots={<ProgressBars count={TOTAL_PAGES} active={index} />}
          // Build 147 v22: pass isActive so OnboardingAuthPage's internal
          // OnboardingArt only plays the video when slide 5 is the current
          // page. Without this, slide 5's video auto-played on mount along
          // with all other slides on initial FlatList render.
          isActive={index === pageIndex}
          // Build 148.2 — seed the slide-5 sign-up Full name input with
          // whatever the user typed on slide 2 (if anything). Empty
          // string is fine — TextInput just renders as placeholder.
          initialFirstName={intakeAnswers.firstName}
          // Build 148.2 — back arrow on slide 5 routes here for the
          // choice-mode case (form-mode back is handled inside
          // OnboardingAuthPage by toggling its own mode state).
          onBack={handleBack}
        />
      );
    }

    // Build 148 — page 6 is the paywall. Self-contained component that
    // renders 2 tier cards + Subscribe/Maybe-later. Calls advanceFromPaywall
    // when the user is done (success OR skip).
    if (isPaywallPage) {
      return (
        <OnboardingPaywallPage
          navigation={navigation}
          screenWidth={SCREEN_W}
          progressDots={<ProgressBars count={TOTAL_PAGES} active={index} />}
          onContinue={advanceFromPaywall}
          isActive={index === pageIndex}
        />
      );
    }

    // Build 148.2 — intake-aware layout. Slides 2-4 carry an optional
    // text input above the Continue button; slides 1 + 7 don't. The
    // page wrapper switches to KeyboardAvoidingView ONLY for intake
    // slides so the input stays visible above the iOS keyboard.
    const hasIntake = !!item.intakeKey;
    // Build 148.3 — slide 4 gets a smaller title + extra body padding
    // so the heading fits on one line AND there's clear breathing room
    // before the intake pill below. Other slides keep the default
    // title styling.
    const isSlide4 = item.step === 4;
    // Build 148.4 — slide 7 (reward) uses center alignment instead of
    // space-between so the title + body + Continue button group sits
    // visually centered in the content block (the "bottom half of the
    // phone screen where it doesn't display the video"), rather than
    // anchored to the top of the content area with a yawning gap
    // before the CTA. No intake on this slide, so center alignment
    // doesn't compete with anything.
    const isSlide7 = item.step === 7;
    const PageWrapper = hasIntake ? KeyboardAvoidingView : View;
    const wrapperProps = hasIntake
      ? {
          style: styles.pageInner,
          behavior: Platform.OS === 'ios' ? 'padding' : undefined,
          keyboardVerticalOffset: 0,
        }
      : { style: styles.pageInner };

    // Back arrow visible on slides 2-5 only. Slide 5 (auth) gets its
    // own back-arrow rendering inside OnboardingAuthPage; this branch
    // only fires for slides 1, 2, 3, 4, 7 (the default visual layout).
    // We expose the arrow when index >= 1 && index <= AUTH_INDEX-1
    // here — slide 5's arrow is rendered in OnboardingAuthPage.
    const showBackArrow = index >= 1 && index < AUTH_INDEX;

    return (
      <View style={[styles.page, { width: SCREEN_W }]}>
        <PageWrapper {...wrapperProps}>
          {/* ── Video block — edge-to-edge top ─────────────────────────────
              Build 147 v2: backgroundColor #FFFFFF → #F5F7FA to blend
              with the Higgsfield-rendered videos' off-white bg.
              Build 147 v4: paddingTop:insets.top removed — video now
              extends ALL the way to the top of the screen (under the
              status bar / Dynamic Island). True corner-to-corner means
              no separate safe-area band exists to create a seam.
              ─────────────────────────────────────────────────────────────── */}
          <View style={styles.videoBlock}>
            {/* Build 147 v12: isActive only true for the currently-visible
                slide so non-visible slides' videos stay paused (was: all
                6 videos auto-playing simultaneously since FlatList mounts
                every page on render). */}
            <OnboardingArt
              step={item.step}
              fullBleed
              contentFit="cover"
              isActive={index === pageIndex}
            />
          </View>

          {/* ── 1pt black divider between video and content ─────────────
              Build 147 v6: divider restored. v5 removed it based on a
              misread of feedback — the user wanted the SOFT color step
              killed and the HARD line kept. Hard 1pt black line is the
              clean defined section separator. */}
          <View style={styles.divider} />

          {/* ── Content block — title, body, CTA, progress bars, back arrow ──
              Build 148.2: tightened paddingBottom (insets.bottom + 16 →
              insets.bottom + 8) to leave room for the back-arrow row
              below the progress bars without pushing content out.
              ─────────────────────────────────────────────────────────────── */}
          <View style={[styles.contentBlock, { paddingBottom: insets.bottom + 8 }]}>
            <View
              style={[
                styles.contentMiddle,
                isSlide7 && styles.contentMiddleSlide7,
              ]}
            >
              <View
                style={[
                  styles.titleBlock,
                  isSlide1 && styles.titleBlockSlide1,
                  isSlide4 && styles.titleBlockSlide4,
                  isSlide7 && styles.titleBlockSlide7,
                ]}
              >
                <Text style={[styles.title, isSlide4 && styles.titleSlide4]}>
                  {item.title}
                </Text>
                <Text style={styles.body}>{item.body}</Text>
              </View>

              {/* Build 148.2 — intake + CTA grouped together as the
                  bottom child of contentMiddle. Title floats at top
                  (via contentMiddle's space-between), this group pins
                  to the bottom. Adding the intake doesn't disturb the
                  CTA's relative position. */}
              <View style={styles.bottomGroup}>
                {hasIntake && (
                  <TextInput
                    style={styles.intakeInput}
                    placeholder={item.intakePlaceholder}
                    placeholderTextColor="#9CA3AF"
                    value={intakeAnswers[item.intakeKey] || ''}
                    onChangeText={(t) => updateIntake(item.intakeKey, t)}
                    autoCapitalize={item.intakeAutoCapitalize || 'sentences'}
                    autoCorrect={false}
                    returnKeyType="done"
                    onSubmitEditing={handleContinue}
                    blurOnSubmit
                    accessibilityLabel={item.intakePlaceholder}
                  />
                )}

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
                  // Build 147 v22: removed ArrowRightIcon. User: 'remove the
                  // arrow, center the Continue text.' Text now sits naturally
                  // centered without the arrow offset throwing visual balance.
                  <TouchableOpacity
                    style={styles.primaryButton}
                    onPress={handleContinue}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={item.cta}
                  >
                    <Text style={styles.primaryButtonText}>{item.cta}</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Progress bars pinned to bottom via parent space-between.
                Build 149.1 — hidden while the keyboard is up (intake
                field focused) to avoid overlap with the Continue
                button just above. */}
            {!keyboardVisible && <ProgressBars count={TOTAL_PAGES} active={index} />}

            {/* Build 148.2 — thin back arrow at the bottom-left, under
                the progress bars. Slides 2-4 only (slide 1 has no
                previous slide; slide 5+ render their back via their own
                components). Tap → goToPage(pageIndex - 1).
                Build 149.1 — same keyboard-hide treatment as the
                progress bars above; reappears on dismiss. */}
            {showBackArrow && !keyboardVisible && (
              <View style={styles.backArrowRow}>
                <TouchableOpacity
                  style={styles.backArrowBtn}
                  onPress={handleBack}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  activeOpacity={0.6}
                  accessibilityRole="button"
                  accessibilityLabel="Back"
                >
                  <BackChevronIcon />
                </TouchableOpacity>
              </View>
            )}
          </View>
        </PageWrapper>
      </View>
    );
  }, [insets, handleContinue, handleBack, navigation, pageIndex, advanceFromPaywall, intakeAnswers, updateIntake, keyboardVisible]);

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
        // Build 148.1: onScroll kept ONLY so programmatic scrollToOffset
        // calls (from button-driven goToPage) update pageIndex. User
        // gestures can't trigger scroll because scrollEnabled is false.
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
// Build 147 v12: cumulative-fill behavior. All segments at index <= active
// render in the active color. Visualizes progress through the flow rather
// than just highlighting the current step.
function ProgressBars({ count, active }) {
  return (
    <View style={styles.progressBarsRow}>
      {Array.from({ length: count }).map((_, i) => (
        <View
          key={i}
          style={[
            styles.progressBar,
            i <= active && styles.progressBarActive,
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

// Build 148.2 — thin left-chevron used for the bottom-left back arrow
// on slides 2-5. Stroke weight is intentionally on the thinner side
// (1.8 vs the more typical 2.2) per user spec: "It should be thin."
function BackChevronIcon({ color = BLUE_PRIMARY, size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 18l-6-6 6-6"
        stroke={color}
        strokeWidth={1.8}
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
  // Build 148.2 — inner wrapper used by both <View> and
  // <KeyboardAvoidingView>. flex:1 lets the page content fill the slide.
  pageInner: {
    flex: 1,
  },

  // Top hero — video fills horizontally edge-to-edge.
  // Build 147 v2: flex 0.55 → 0.6 (bigger video per user direction).
  // Build 147 v16: flex 0.6 → 0.65.
  // Build 147 v19: bg #F8F8F8 → #FFFFFF.
  // Build 148.2: 0.65 → 0.55 to reclaim ~75pt of vertical room for the
  // new intake pill + the back-arrow row at the bottom.
  // Build 148.3: 0.55 → 0.58 per user feedback that the page boundary
  // felt pushed too high — the video felt cropped at the bottom. 0.58
  // gives the video back ~23pt while still leaving the content area
  // wide enough to host the intake + button + bars + back arrow
  // without overlap.
  videoBlock: {
    flex: 0.58,
    width: '100%',
    backgroundColor: '#FFFFFF',
  },

  // 1pt black divider between video block and content block.
  // Build 147 v6: restored after being mistakenly removed in v5.
  divider: {
    height: 1,
    backgroundColor: '#000000',
    width: '100%',
  },

  // Bottom content — title, body, intake pill, CTA, progress, back arrow.
  // Build 148.2: flex 0.35 → 0.45 (mirrors videoBlock 0.65 → 0.55).
  // Build 148.3: 0.45 → 0.42 (mirrors videoBlock 0.55 → 0.58). Still
  // enough headroom for intake + button + bars + arrow.
  contentBlock: {
    flex: 0.42,
    paddingHorizontal: 28,
    paddingTop: 8,
    backgroundColor: '#FFFFFF',
  },

  // Build 147 v5: wrapper for the title/body/buttons group.
  // Build 147 v10: justifyContent space-between. Title+body float at
  // the TOP of the content area, buttons stay anchored at the BOTTOM
  // just above the progress bars.
  // Build 148.2: paddingBottom 8 → 18 to keep clearer separation
  // between the Continue button and the progress-bar row below.
  contentMiddle: {
    flex: 1,
    justifyContent: 'space-between',
    paddingBottom: 18,
  },

  // Title block — sits in the upper-middle of the content area.
  // Build 148.2: paddingTop 24 → 8 per user feedback ("heading and
  // subheading need to be pushed up a little bit higher"). Used by
  // intake slides 2-4 where space is at a premium.
  titleBlock: {
    alignItems: 'center',
    paddingTop: 8,
  },
  // Build 148.3 — slide-1 specific override. Without an intake pill,
  // the contentMiddle's space-between layout floats the dual-button
  // row at the bottom and leaves a large empty middle on slide 1.
  // Pushing the title down ~52pt visually centers the "Picture the
  // possibilities" group in the content area, eliminating the
  // "title too high" feel the user reported.
  titleBlockSlide1: {
    paddingTop: 60,
  },
  // Build 148.3 — slide-4 specific override. The original 38pt title
  // forced "Just what you need" onto two stacked lines, which the
  // user wanted on one line. The smaller font + extra paddingBottom
  // achieves two things at once: title fits on one line AND there's
  // visible breathing room before the intake pill below the body.
  titleBlockSlide4: {
    paddingBottom: 18,
  },
  titleSlide4: {
    fontSize: 28,
    lineHeight: 34,
  },
  // Build 148.4 — slide-7 (reward) overrides. Without an intake field
  // and with a single Continue button, the default space-between
  // layout left a yawning empty middle. Switching contentMiddle to
  // justifyContent:'center' + adding a slight gap between title block
  // and the bottom group visually anchors the title + Continue pair
  // in the bottom half of the screen, per user spec.
  contentMiddleSlide7: {
    justifyContent: 'center',
    gap: 24,
  },
  titleBlockSlide7: {
    paddingTop: 0, // override the default 8pt — center owns the layout now
  },
  // Build 147 v9: fontSize 34 → 38 + lineHeight 40 → 44 (heading larger
  // per user spec).
  title: {
    fontSize: 38,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    lineHeight: 44,
    letterSpacing: -0.5,
  },
  // Build 147 v9: fontSize 16 → 18 (subheading larger) + color
  // BLUE_PRIMARY → BLUE_LIGHT (lighter, friendlier blue per user).
  body: {
    marginTop: 10,
    fontSize: 18,
    fontWeight: '400',
    color: BLUE_LIGHT,
    textAlign: 'center',
    lineHeight: 24,
  },

  // Build 148.2 — bottomGroup hosts intake (when present) + the CTA
  // row inside contentMiddle. contentMiddle's justifyContent:'space-
  // between' pushes titleBlock to top and bottomGroup to bottom; the
  // internal gap separates the intake from the buttons.
  bottomGroup: {
    gap: 12,
  },

  // Slide 1 dual-button row (Log In + Sign Up).
  // flex:1 on each button + gap:12 between them gives equal-width
  // buttons spanning the content padding box.
  // Build 148.2: marginTop removed — spacing now handled by
  // bottomGroup's gap + contentMiddle's space-between.
  dualButtonRow: {
    flexDirection: 'row',
    gap: 12,
  },
  // Build 148.2 — height 50 → 44, borderRadius 30 → 26 to match the
  // Continue button on slides 2-4. Visual rhythm across the funnel is
  // now consistent: every primary CTA is 44pt tall with a 26pt radius,
  // including the intake pill above it.
  btnHalf: {
    flex: 1,
    height: 44,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  // Build 147 v9: added 1pt black border to both buttons per mockup spec.
  btnFilled: {
    backgroundColor: BLUE_LIGHT,
    borderWidth: 1,
    borderColor: '#000000',
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
  // Build 147 v9: borderWidth 1.5 → 1, borderColor BLUE_LIGHT → black
  // for the thin black outline per user spec. Inner button text stays
  // BLUE_LIGHT so the outline frames a blue label on white fill.
  btnOutline: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#000000',
  },
  btnOutlineText: {
    color: BLUE_LIGHT,
    fontSize: 17,
    fontWeight: '700',
  },

  // Continue button — single CTA on slides 2-4 + 7.
  // Build 147 v22: height 50 → 44 (thinner per user), borderRadius
  // 30 → 26 to keep the pill curve proportional.
  // Build 148.2: marginTop 18 → 0 (the bottomGroup wrapper now handles
  // separation from the intake via its gap; vertical positioning relative
  // to the title is handled by contentMiddle's space-between).
  primaryButton: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 26,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
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

  // Build 148.2 — optional intake pill above the Continue button on
  // slides 2-4. Thin border, light fill, generous internal padding,
  // 44pt tall so the pill height matches the buttons below it.
  // borderRadius 22 (half of height) gives a pure pill shape.
  // Build 148.3: fontSize 15 → 13 per user — the 15pt text felt too
  // large for an optional intake field; the smaller size keeps the
  // pill subordinate to the Continue CTA visually.
  intakeInput: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
    fontSize: 13,
    color: '#111827',
  },

  // Build 148.2 — back-arrow row below the progress bars. Slides 2-5
  // only. Aligned left so the tap target sits in the bottom-left
  // corner of the slide.
  // paddingTop:14 (was 6) per user feedback — explicit gap below the
  // progress bars before the back arrow so the touch target reads as
  // its own zone rather than appearing flush against the bars.
  backArrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingTop: 14,
    paddingHorizontal: 4,
    minHeight: 32,
  },
  backArrowBtn: {
    padding: 6,
  },

  // Build 147 — segmented bars at the bottom of each slide.
  // Build 148.2: marginTop:8 reintroduced to put explicit space above
  // the bar row. Combined with contentMiddle's paddingBottom:18 this
  // gives ~26pt of clear separation between the Continue button and
  // the progress bars — fixes the previous overlap where Continue
  // collided with the bars under the new intake-pill layout.
  progressBarsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 8,
  },
  // Build 147 v9: height 3 → 2 + borderRadius 1.5 → 1. Thinner bars
  // per user — same length, smaller height so they read as delicate
  // strokes rather than chunky stripes.
  progressBar: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#D7E3F0',
  },
  // Build 147 v10: active bar BLUE_PRIMARY → BLUE_LIGHT per user.
  // Active progress segment now matches the lighter, friendlier blue
  // family used elsewhere (subheading, button fill).
  progressBarActive: {
    backgroundColor: BLUE_LIGHT,
  },
});
