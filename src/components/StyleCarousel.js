/**
 * StyleCarousel — Home-screen horizontal style-preset picker.
 *
 * Renders a row of bundled style images that drifts horizontally on its
 * own at a slow, continuous pace AND lets the user grab and scrub
 * back-and-forth manually. Tapping a card calls onSelect(preset).
 *
 * AUTO-DRIFT — native driver, no JS bridge in the hot path.
 *
 * Build 79–87 had a broken auto-drift that ran an unbounded
 * `requestAnimationFrame` loop calling `scrollRef.current.scrollTo({...})`
 * every frame plus `scrollEventThrottle={16}` with an `onScroll` handler
 * — ~120 JS↔native bridge events per second, FOREVER. Bridge saturation
 * starved RN's Pressability state machine, so TouchableOpacity / Pressable
 * elsewhere on HomeScreen would visually receive taps but `onPress` never
 * fired. Build 88 fixed it by removing auto-drift entirely.
 *
 * Builds 103–104 reintroduced drift via Animated.loop on a transform
 * (native driver, zero bridge during animation). This file builds on
 * that with manual pan support added on top:
 *
 *   1. The cards live inside an `Animated.View` whose
 *      `transform: [{ translateX }]` is driven by `Animated.timing` with
 *      `useNativeDriver: true`. Each cycle is its own timing animation;
 *      the cycle's onComplete fires `startDrift` recursively. This is
 *      essentially a hand-rolled loop, but unlike `Animated.loop` it can
 *      RESUME from any starting value — required so user-pan releases
 *      can hand off to the drift wherever the user left it.
 *
 *   2. Presets are rendered TWICE back-to-back. Drift goes from the
 *      current value down to `-rowWidth`. Because set B is offset by
 *      exactly `rowWidth` from set A, position X and position X−rowWidth
 *      are visually identical — the wrap is invisible and the carousel
 *      looks infinite in both the auto-drift and the manual-pan paths.
 *
 *   3. PanResponder claims horizontal pans >4pt. While the user holds,
 *      the drift timing is stopped and translateX is driven by
 *      `setValue(panStart + dx)` on each touchmove. Pan moves are bounded
 *      by the user's finger (max ~60 events/sec, ONLY while finger is
 *      down) — fundamentally different from the old rAF bug which was
 *      120 events/sec FOREVER. Pressability stays responsive across the
 *      rest of HomeScreen.
 *
 *   4. Sub-4pt touches don't claim the pan, so TouchableOpacity wins
 *      and onPress fires for taps. The 4pt threshold gives a tap room
 *      to register before a swipe-style movement claims the gesture.
 *
 *   5. After release, drift waits 2 seconds before resuming. Lets the
 *      user read labels and tap a card without the cards sliding away.
 *      A new touch during the wait cancels the timer cleanly.
 *
 *   6. Pan position is continuously wrapped into `[-rowWidth, 0]` during
 *      the drag. Swipe past either end → wrap to the equivalent position
 *      in the other set. Visually invisible (set A ≡ set B), but lets the
 *      user scrub forever in either direction without hitting an empty
 *      edge.
 */
import React, { useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
  PanResponder,
} from 'react-native';
import { space, radius, fontSize, fontWeight } from '../constants/tokens';
import { STYLE_PRESETS } from '../data/stylePresets';

const { width: SCREEN_W } = Dimensions.get('window');

const SIDE_PAD = space.lg; // 20
const GAP = space.sm;       // 8
const VISIBLE_CARDS = 4;
const CARD_W = Math.floor((SCREEN_W - SIDE_PAD * 2 - GAP * (VISIBLE_CARDS - 1)) / VISIBLE_CARDS);
const IMAGE_H = Math.round(CARD_W * 1.15);

// Drift speed. 60 pt/s = ~1pt per 60fps frame, the floor for sub-pixel-
// smooth perceived motion. One card slides past every ~1.6s at the
// baseline 4-visible layout.
const DRIFT_SPEED_PX_PER_SEC = 60;

// Pan threshold — fingers must move this far horizontally before
// PanResponder claims the gesture. Below this, touches stay with
// TouchableOpacity so taps register cleanly.
const PAN_CLAIM_THRESHOLD_PT = 4;

// Pause after the user releases a pan before drift resumes. Gives them
// time to read labels and tap a card without the cards sliding away
// underfoot.
const RESUME_DELAY_MS = 2000;

export default function StyleCarousel({ onSelect, presets = STYLE_PRESETS }) {
  const translateX = useRef(new Animated.Value(0)).current;

  // Active timing animation for the current cycle. Held in a ref so the
  // pan handler can stop it mid-cycle without prop-drilling. null when no
  // animation is running (during pan, or briefly between cycles).
  const animRef = useRef(null);

  // translateX value captured at the start of the current pan. setValue
  // during pan = panStart + cumulative dx. Without this, dx alone would
  // ignore wherever the auto-drift had moved the cards to before grab.
  const panStartXRef = useRef(0);

  // True for the duration of the user's touch. Suppresses startDrift
  // calls so the recursive cycle doesn't try to take back the wheel
  // mid-pan (e.g. if the prior cycle's onComplete fires after the user
  // has already grabbed).
  const isPanningRef = useRef(false);

  // Timer for the post-release pause. Cleared whenever the user touches
  // again before drift resumes.
  const resumeTimerRef = useRef(null);

  const rowWidth = useMemo(
    () => presets.length * (CARD_W + GAP),
    [presets.length]
  );

  // Normalize any translateX into the canonical [-rowWidth, 0] range.
  // Any value outside that range is visually equivalent to a value
  // inside it (because set A and set B are duplicates offset by
  // rowWidth) — wrapping makes the next cycle's distance bounded and
  // predictable.
  const normalize = useCallback((v) => {
    if (rowWidth <= 0) return 0;
    let n = v;
    while (n > 0) n -= rowWidth;
    while (n <= -rowWidth) n += rowWidth;
    return n;
  }, [rowWidth]);

  // Drives one cycle of the drift, recursing on completion for an
  // infinite loop. Picks up from CURRENT translateX value — works
  // identically whether starting cold or resuming after a user pan.
  const startDrift = useCallback(() => {
    if (presets.length < 2 || rowWidth <= 0) return;
    if (isPanningRef.current) return;

    translateX.stopAnimation((current) => {
      // Re-check pan state inside the callback — stopAnimation is async
      // and the user could have grabbed in the gap.
      if (isPanningRef.current) return;

      const normalized = normalize(current);
      translateX.setValue(normalized);

      const distance = Math.abs(-rowWidth - normalized);
      if (distance < 1) {
        // Already at (or essentially at) the boundary — wrap and recurse.
        translateX.setValue(0);
        animRef.current = null;
        startDrift();
        return;
      }
      const duration = Math.round((distance / DRIFT_SPEED_PX_PER_SEC) * 1000);

      animRef.current = Animated.timing(translateX, {
        toValue: -rowWidth,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      });
      animRef.current.start(({ finished }) => {
        animRef.current = null;
        if (!finished) return; // interrupted by stopAnimation (pan grab)
        if (isPanningRef.current) return;
        // Seamless wrap — set A in viewport at translateX=0 looks identical
        // to set B at translateX=-rowWidth (they're duplicates).
        translateX.setValue(0);
        startDrift();
      });
    });
  }, [presets.length, rowWidth, translateX, normalize]);

  // Schedule drift to resume after RESUME_DELAY_MS. Idempotent — repeat
  // calls reset the timer, so a quick second touch doesn't get stomped
  // by a stale resume.
  const scheduleResume = useCallback(() => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      resumeTimerRef.current = null;
      if (!isPanningRef.current) startDrift();
    }, RESUME_DELAY_MS);
  }, [startDrift]);

  // PanResponder — captures horizontal scrubs while leaving short taps
  // alone for TouchableOpacity to handle.
  const panResponder = useMemo(() => PanResponder.create({
    // Don't claim on touch start — let TouchableOpacity register the press.
    onStartShouldSetPanResponder: () => false,
    // Claim only once movement exceeds the threshold AND is more
    // horizontal than vertical. Keeps the parent ScrollView (if any) in
    // charge of vertical scrolls.
    onMoveShouldSetPanResponder: (_, g) =>
      Math.abs(g.dx) > PAN_CLAIM_THRESHOLD_PT &&
      Math.abs(g.dx) > Math.abs(g.dy),
    onPanResponderGrant: () => {
      isPanningRef.current = true;
      // Cancel any pending resume — we're back in user control.
      if (resumeTimerRef.current) {
        clearTimeout(resumeTimerRef.current);
        resumeTimerRef.current = null;
      }
      // Stop the active animation and snapshot its value as the pan's
      // starting offset. setValue calls during pan will be relative to
      // this snapshot via panStart + dx.
      translateX.stopAnimation((current) => {
        panStartXRef.current = current;
      });
    },
    onPanResponderMove: (_, g) => {
      // Apply cumulative drag delta, wrapping into the canonical range
      // so the user can scrub forever in either direction without
      // running off the duplicated row's actual edge.
      const proposed = panStartXRef.current + g.dx;
      translateX.setValue(normalize(proposed));
    },
    onPanResponderRelease: () => {
      isPanningRef.current = false;
      scheduleResume();
    },
    onPanResponderTerminate: () => {
      // Another responder (e.g. parent ScrollView) took the gesture.
      // Treat as release — schedule drift resumption from current value.
      isPanningRef.current = false;
      scheduleResume();
    },
    onPanResponderTerminationRequest: () => true,
  }), [translateX, normalize, scheduleResume]);

  useEffect(() => {
    startDrift();
    return () => {
      if (animRef.current) animRef.current.stop();
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    };
  }, [startDrift]);

  const doubled = useMemo(() => [...presets, ...presets], [presets]);

  return (
    <View style={styles.viewport} {...panResponder.panHandlers}>
      <Animated.View
        style={[
          styles.row,
          { width: rowWidth * 2, transform: [{ translateX }] },
        ]}
      >
        {doubled.map((preset, idx) => (
          <TouchableOpacity
            key={`${preset.id}-${idx}`}
            style={styles.card}
            activeOpacity={0.85}
            onPress={() => onSelect?.(preset)}
          >
            <View style={styles.imageContainer}>
              <Image source={preset.image} style={styles.imageInner} resizeMode="cover" />
              <View style={styles.imageOverlay} pointerEvents="none" />
            </View>
            <Text style={styles.label} numberOfLines={1}>{preset.label}</Text>
          </TouchableOpacity>
        ))}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    overflow: 'hidden',
    paddingVertical: space.sm,
  },
  row: {
    flexDirection: 'row',
  },
  card: {
    width: CARD_W,
    marginRight: GAP,
  },
  imageContainer: {
    width: CARD_W,
    height: IMAGE_H,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 0.5,
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  imageInner: {
    width: '100%',
    height: '100%',
  },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  label: {
    marginTop: space.xs,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: '#FFFFFF',
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.45)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});
