/**
 * StyleCarousel — Home-screen horizontal style-preset picker.
 *
 * Renders a row of bundled style images (label below image), where 4 cards
 * are visible at a time on a 393pt-wide iPhone 16 Pro Max. The list slowly
 * auto-drifts to the right and pauses for 3 seconds whenever the user
 * touches the row, then resumes. Tapping a card calls onSelect(preset).
 *
 * Implementation notes:
 *   - ScrollView (not FlatList) because we have a fixed small list (12
 *     items) and we want fluid pixel-perfect drift control via setNativeProps
 *     on contentOffset. FlatList's virtualization fights the auto-drift
 *     and produces stutter on iOS.
 *   - Drift uses requestAnimationFrame, NOT Animated.timing on contentOffset,
 *     because iOS rejects Animated transforms on a ScrollView's offset and
 *     the alternative (animated style on inner View) breaks ScrollView's
 *     own touch tracking. Manual rAF tick lets the user yank scroll at any
 *     time and resume drift after a quiet period.
 *   - Loops back to start when the right edge is reached. No mod arithmetic
 *     trickery — we just snap back. Brief flash is acceptable in the auto-
 *     drift use case (user's hand wasn't on the carousel).
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
} from 'react-native';
import { space, radius, fontSize, fontWeight } from '../constants/tokens';
import { colors as C } from '../constants/theme';
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

// Drift speed in pixels per frame (~60fps). 0.3 ≈ 18px/sec — slow,
// suggestive, doesn't pull the eye away from the input bar.
const DRIFT_PX_PER_FRAME = 0.3;
// How long to wait after a user touch before resuming drift.
const RESUME_DELAY_MS = 3000;

export default function StyleCarousel({ onSelect, presets = STYLE_PRESETS }) {
  const scrollRef = useRef(null);
  const offsetRef = useRef(0);
  const driftingRef = useRef(true);
  const rafRef = useRef(null);
  const resumeTimerRef = useRef(null);
  const contentWidthRef = useRef(0);
  const containerWidthRef = useRef(0);

  // Drift loop — fires every animation frame, advances offset, snaps to 0
  // when we run off the right end. Cleaned up on unmount.
  useEffect(() => {
    const tick = () => {
      if (driftingRef.current && scrollRef.current) {
        const maxOffset = Math.max(0, contentWidthRef.current - containerWidthRef.current);
        // If the layout hasn't measured yet we still want the loop alive
        // so it picks up as soon as onContentSizeChange / onLayout fire.
        if (maxOffset > 0) {
          offsetRef.current += DRIFT_PX_PER_FRAME;
          if (offsetRef.current >= maxOffset) {
            offsetRef.current = 0;
          }
          scrollRef.current.scrollTo({ x: offsetRef.current, animated: false });
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (resumeTimerRef.current) clearTimeout(resumeTimerRef.current);
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

  const onScroll = (e) => {
    // Keep our offset tracker in sync with the user's manual drag/momentum
    // so when drift resumes it picks up from where they left off instead
    // of jumping back.
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
      onScrollBeginDrag={pauseDrift}
      onTouchStart={pauseDrift}
      onScrollEndDrag={scheduleResume}
      onMomentumScrollEnd={scheduleResume}
      onTouchEnd={scheduleResume}
      onTouchCancel={scheduleResume}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onContentSizeChange={(w) => { contentWidthRef.current = w; }}
      onLayout={(e) => { containerWidthRef.current = e.nativeEvent.layout.width; }}
    >
      {presets.map((preset) => (
        <TouchableOpacity
          key={preset.id}
          style={styles.card}
          activeOpacity={0.85}
          onPress={() => {
            // Drift state is already managed by the parent ScrollView's
            // onTouchStart/End — DO NOT manually pause here. The earlier
            // version called pauseDrift() permanently, which made the
            // carousel feel "stuck" after the user pressed × on the pill
            // (the resume timer was cleared, never re-scheduled). Letting
            // the natural touch lifecycle drive drift state means the
            // carousel always becomes interactive again after a selection
            // is cleared.
            onSelect?.(preset);
          }}
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
