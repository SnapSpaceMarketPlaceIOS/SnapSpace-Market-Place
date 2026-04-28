/**
 * StyleCarousel — Home-screen horizontal style-preset picker.
 *
 * Renders a row of bundled style images (label below image), where 4 cards
 * are visible at a time on a 393pt-wide iPhone 16 Pro Max. The list slowly
 * auto-drifts to the right and pauses for 3 seconds whenever the user
 * touches the row, then resumes. Tapping a card calls onSelect(preset).
 *
 * ── BUILD 101: AUTO-DRIFT RESTORED, BUT SAFE ──────────────────────────────
 *
 * Build 79 introduced an auto-drift via `requestAnimationFrame` + per-frame
 * `scrollTo` + `scrollEventThrottle={16}` + onScroll handler. That ran ~120
 * bridge events/sec FOREVER, regardless of whether the carousel was even
 * visible. Net effect: React Native's Pressability state machine starved on
 * the saturated bridge, and TouchableOpacity / Pressable elsewhere on
 * HomeScreen (camera + gallery icons in input bar, "Shop Now" on Today's
 * Highlight, Featured Products cards, "Shop all") visually depressed but
 * never fired onPress. Build 88 ripped the entire drift system out as the
 * fix.
 *
 * This restoration uses a fundamentally different cadence. The drift is
 * driven by `setInterval` at 2 ticks/sec — each tick advances the offset
 * by 30px and calls a SINGLE `scrollTo({animated: true})`, letting iOS's
 * native scroll animator interpolate the move smoothly. Visual experience
 * is continuous slow drift; bridge cost is 2 calls/sec instead of 60-120.
 * That's a 60× reduction — well below the saturation threshold that broke
 * Build 79.
 *
 * Additional safety nets:
 *   1. No `onScroll` handler, no `scrollEventThrottle`. Only
 *      `onScrollEndDrag` and `onMomentumScrollEnd`, which fire ONCE per user
 *      gesture (not continuously), so they update offsetRef without spam.
 *   2. Drift pauses on touch, resumes 3s after release. Same as the original
 *      Build 79 spec.
 *   3. Drift pauses entirely when the app backgrounds (AppState listener),
 *      so an off-screen carousel never burns even those 2 calls/sec.
 *   4. Drift skips when content fits in viewport (maxOffset === 0).
 *
 * If a future change reintroduces tap-handler death on HomeScreen, look
 * here FIRST — and verify these guarantees still hold before suspecting
 * anything else.
 */
import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  Image,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  AppState,
} from 'react-native';
import { space, radius, fontSize, fontWeight } from '../constants/tokens';
import { STYLE_PRESETS } from '../data/stylePresets';

const { width: SCREEN_W } = Dimensions.get('window');

// Layout: 4 cards visible at once with a small horizontal screen padding
// and inter-card gap. Solving for CARD_W:
//   SCREEN_W = SIDE_PAD * 2 + CARD_W * 4 + GAP * 3
const SIDE_PAD = space.lg; // 20
const GAP = space.sm;       // 8
const VISIBLE_CARDS = 4;
const CARD_W = Math.floor((SCREEN_W - SIDE_PAD * 2 - GAP * (VISIBLE_CARDS - 1)) / VISIBLE_CARDS);
// Image area is roughly 5:4 portrait — taller than wide reads as a "room
// shot" thumbnail at small sizes. Label sits below the image.
const IMAGE_H = Math.round(CARD_W * 1.15);

// Drift cadence — 2 ticks/sec, 30px per tick → ~60px/sec (~1/3 of a card
// per second). Slow enough to read as ambient motion, fast enough to be
// noticeable. Each scrollTo's native animation interpolates between ticks
// so the visual is continuous, not stair-stepped.
const TICK_INTERVAL_MS = 500;
const DRIFT_PX_PER_TICK = 30;
// How long to wait after a user touch before resuming drift.
const RESUME_DELAY_MS = 3000;

export default function StyleCarousel({ onSelect, presets = STYLE_PRESETS }) {
  const scrollRef = useRef(null);
  const offsetRef = useRef(0);
  const driftingRef = useRef(true);
  const intervalRef = useRef(null);
  const resumeTimerRef = useRef(null);
  const contentWidthRef = useRef(0);
  const containerWidthRef = useRef(0);
  const appActiveRef = useRef(true);

  useEffect(() => {
    // Each tick: if drift is enabled, app is foregrounded, and the content
    // overflows the viewport, advance the offset by one step and call
    // scrollTo. iOS's native scroll animator handles the actual interpolation
    // between ticks, so the user sees continuous smooth drift even though
    // the JS bridge only fires twice per second.
    intervalRef.current = setInterval(() => {
      if (!driftingRef.current) return;
      if (!appActiveRef.current) return;
      if (!scrollRef.current) return;
      const maxOffset = Math.max(0, contentWidthRef.current - containerWidthRef.current);
      if (maxOffset <= 0) return;

      offsetRef.current += DRIFT_PX_PER_TICK;
      if (offsetRef.current >= maxOffset) {
        // Reached the right edge — snap back to start. Brief flash is
        // acceptable in the auto-drift use case (the user's hand isn't on
        // the carousel; if it were, drift is paused).
        offsetRef.current = 0;
      }
      scrollRef.current.scrollTo({ x: offsetRef.current, animated: true });
    }, TICK_INTERVAL_MS);

    // Pause drift entirely when the app is backgrounded so we don't keep
    // firing scrollTo while the carousel isn't visible. Resume on active.
    const appSub = AppState.addEventListener('change', (state) => {
      appActiveRef.current = state === 'active';
    });

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
      appSub.remove();
    };
  }, []);

  const pauseDrift = () => {
    driftingRef.current = false;
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
  };

  const scheduleResume = () => {
    if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = setTimeout(() => {
      driftingRef.current = true;
    }, RESUME_DELAY_MS);
  };

  // Capture user-driven scroll position once per gesture (drag end + momentum
  // end). NO continuous onScroll / scrollEventThrottle — those are exactly
  // the props that caused Build 79's bridge storm. These handlers fire
  // ONCE per user interaction, not per frame, so they're safe.
  const onScrollEndDrag = (e) => {
    offsetRef.current = e.nativeEvent.contentOffset.x;
  };
  const onMomentumScrollEnd = (e) => {
    offsetRef.current = e.nativeEvent.contentOffset.x;
  };

  return (
    <ScrollView
      ref={scrollRef}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={styles.scroll}
      // Touch + scroll lifecycle: pause on first finger-down, resume after
      // the user's fingers leave + the timer elapses.
      onTouchStart={pauseDrift}
      onTouchEnd={scheduleResume}
      onTouchCancel={scheduleResume}
      onScrollEndDrag={onScrollEndDrag}
      onMomentumScrollEnd={onMomentumScrollEnd}
      onContentSizeChange={(w) => { contentWidthRef.current = w; }}
      onLayout={(e) => { containerWidthRef.current = e.nativeEvent.layout.width; }}
    >
      {presets.map((preset) => (
        <TouchableOpacity
          key={preset.id}
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => onSelect?.(preset)}
        >
          {/* Image + overlay are stacked inside an outer container that
              owns the border + radius. The 0.5pt white border (per design
              spec) lives on the container, not the Image, so the rounded
              corners clip cleanly without the border doubling on the
              overlay's edge. */}
          <View style={styles.imageContainer}>
            <Image source={preset.image} style={styles.imageInner} resizeMode="cover" />
            {/* 10% white overlay — softens the photo so the carousel reads
                as inspirational, not literal. Sits inside the same rounded
                clip as the image. */}
            <View style={styles.imageOverlay} pointerEvents="none" />
          </View>
          <Text style={styles.label} numberOfLines={1}>{preset.label}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flexGrow: 0,
  },
  content: {
    paddingHorizontal: SIDE_PAD,
    paddingVertical: space.sm,
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
    // 0.5pt white border per design spec. Sits on the container so the
    // rounded clip stays sharp and the overlay doesn't double up the edge.
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
