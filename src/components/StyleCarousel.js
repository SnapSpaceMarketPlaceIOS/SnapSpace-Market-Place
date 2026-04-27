/**
 * StyleCarousel — Home-screen horizontal style-preset picker.
 *
 * Renders a row of bundled style images (label below image), where 4 cards
 * are visible at a time on a 393pt-wide iPhone 16 Pro Max. The user swipes
 * the row themselves to browse beyond the first 4. Tapping a card calls
 * onSelect(preset).
 *
 * BUILD 88 FIX — auto-drift removed.
 *
 * The previous version ran an unbounded `requestAnimationFrame` loop that
 * called `scrollRef.current.scrollTo({...})` every frame (60Hz) plus
 * `scrollEventThrottle={16}` with an `onScroll` handler — so each frame
 * crossed the JS↔native bridge twice (scrollTo out, scroll event back),
 * ~120 bridge events per second, FOREVER, regardless of whether the user
 * was even looking at the carousel. The loop only paused for 3s when the
 * user touched the carousel itself; touching anywhere else on the screen
 * left it ticking.
 *
 * Symptom: TouchableOpacity / Pressable elsewhere on HomeScreen (camera +
 * gallery icons in the input bar; "Shop Now" on Today's Highlight; cards
 * in Featured Products; "Shop all") would visually receive the user's tap
 * but `onPress` never fired. React Native's Pressability state machine
 * runs on JS — when the bridge is saturated, press-down → press-up state
 * transitions arrive too late or get dropped, and the touch dies in the
 * responder layer before any onPress handler runs. The defensive try/catch
 * + Alert handlers added in Build 85 never fired because they sit INSIDE
 * onPress. This was the root cause of every "tap doesn't work" report
 * since Build 79, when this component was introduced (commit 24a66bb).
 *
 * The auto-drift was a polish flourish — "intentionally tiny so the motion
 * is felt, not seen" per the original spec — its absence will not be
 * perceived by users, but its removal restores reliable touch dispatch
 * for every TouchableOpacity inside HomeScreen.
 *
 * The ScrollView, the touch lifecycle props, and ALL ref-based drift
 * machinery are gone. Only the static horizontal scroll + tap-to-select
 * behavior remains.
 */
import React from 'react';
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

export default function StyleCarousel({ onSelect, presets = STYLE_PRESETS }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.content}
      style={styles.scroll}
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
