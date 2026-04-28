/**
 * StyleCarousel — Home-screen horizontal style-preset picker.
 *
 * Renders a row of bundled style images that drifts horizontally on its
 * own at a slow, continuous pace. Tapping a card calls onSelect(preset).
 *
 * AUTO-DRIFT — native driver, no JS bridge in the hot path.
 *
 * Build 79–87 had a broken auto-drift that ran an unbounded
 * `requestAnimationFrame` loop calling `scrollRef.current.scrollTo({...})`
 * every frame plus `scrollEventThrottle={16}` with an `onScroll` handler
 * — ~120 JS↔native bridge events per second, FOREVER. Bridge saturation
 * starved RN's Pressability state machine, so TouchableOpacity / Pressable
 * elsewhere on HomeScreen (camera + gallery icons, "Shop Now", Featured
 * Products cards) visually received taps but `onPress` never fired.
 * Build 88 fixed it by removing auto-drift entirely.
 *
 * This version reintroduces the drift the SAFE way:
 *
 *   1. No ScrollView. The cards live inside an `Animated.View` whose
 *      `transform: [{ translateX }]` is driven by `Animated.loop` +
 *      `Animated.timing` with `useNativeDriver: true`. The animation
 *      runs entirely on the UI thread — JS doesn't get a frame callback,
 *      `scrollTo` is never called, and there's no `onScroll` event back.
 *      Zero bridge crossings during the animation. Pressability stays
 *      responsive across the rest of HomeScreen.
 *
 *   2. The presets list is rendered TWICE back-to-back inside the
 *      animated row. The animation translates from `0` to `-rowWidth`
 *      (one full set of cards) and loops. Because set B is an exact copy
 *      offset by `rowWidth`, when set A scrolls off-left, set B is
 *      already in the position set A started — the loop reset is
 *      visually invisible and the drift looks infinite.
 *
 *   3. `Easing.linear` over a long duration. The user asked for "slow,
 *      continuous, modern" — no acceleration/deceleration that would
 *      create a stop-and-go feeling.
 *
 *   4. Tap-to-select still works. RN's hit-test follows the native
 *      transform so onPress fires on the visually-tapped card. We don't
 *      pause on touch — at ~33 pt/s the drift during a 150ms tap is
 *      ~5pt, which is imperceptible.
 */
import React, { useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  StyleSheet,
  Dimensions,
  Animated,
  Easing,
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

// Drift speed. ~33 pt/s = one card sliding past roughly every 3s, which
// reads as "alive and continuous" without being distracting. Adjust here
// to make the carousel faster / slower without restructuring.
const DRIFT_SPEED_PX_PER_SEC = 33;

export default function StyleCarousel({ onSelect, presets = STYLE_PRESETS }) {
  const translateX = useRef(new Animated.Value(0)).current;

  // Width of one full row of cards (each card occupies CARD_W + GAP, with
  // the trailing GAP after the last card so the seam to the duplicate set
  // matches the inter-card spacing inside each set).
  const rowWidth = useMemo(
    () => presets.length * (CARD_W + GAP),
    [presets.length]
  );

  useEffect(() => {
    if (presets.length < 2 || rowWidth <= 0) return;
    translateX.setValue(0);
    const duration = Math.round((rowWidth / DRIFT_SPEED_PX_PER_SEC) * 1000);
    const anim = Animated.loop(
      Animated.timing(translateX, {
        toValue: -rowWidth,
        duration,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
      { resetBeforeIteration: true }
    );
    anim.start();
    return () => anim.stop();
  }, [presets.length, rowWidth, translateX]);

  // Render presets TWICE back-to-back. The second set occupies x=rowWidth
  // through x=2*rowWidth — when translateX hits -rowWidth, set B is in the
  // position set A started, and the loop reset is invisible.
  const doubled = useMemo(() => [...presets, ...presets], [presets]);

  return (
    <View style={styles.viewport}>
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
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  viewport: {
    // overflow:hidden clips the duplicated set off the right edge so we
    // only see one row at a time. Without this the doubled cards would
    // visibly extend past the screen.
    overflow: 'hidden',
    paddingVertical: space.sm,
  },
  row: {
    flexDirection: 'row',
    // Initial left padding gives the first card breathing room from the
    // screen edge at translateX=0. Once the drift starts, this padding
    // scrolls off-screen — that's the intended infinite-feed look.
    paddingLeft: SIDE_PAD,
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
