/**
 * Skeleton — Shimmer loading placeholder (Part 2.9)
 *
 * Shapes match the exact dimensions of the content they replace.
 * Shimmer animation: #F0F0F0 base → #E8E8E8 shimmer, 1.5s, ease-in-out, infinite.
 * Border-radius matches the content:
 *   - Text skeletons:   radius.badge (6px)
 *   - Image skeletons:  radius.md (12px)
 *   - Avatar skeletons: radius.full (9999px)
 *
 * Usage:
 *   // Image placeholder (card)
 *   <Skeleton width={155} height={130} radius="image" />
 *
 *   // Text line
 *   <Skeleton width={120} height={14} radius="text" />
 *
 *   // Avatar
 *   <Skeleton width={40} height={40} radius="avatar" />
 *
 *   // Custom radius (number)
 *   <Skeleton width={80} height={80} radius={20} />
 */

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View, StyleSheet, Dimensions } from 'react-native';
import { radius as R, space } from '../constants/tokens';

const { width: SCREEN_W } = Dimensions.get('window');

// Base and shimmer colors — no corresponding design token; intentionally hardcoded
const BASE_COLOR    = '#F0F0F0';
const SHIMMER_COLOR = '#E8E8E8';
const DURATION      = 1500; // ms

// Radius by semantic name
function resolveRadius(r) {
  if (typeof r === 'number') return r;
  if (r === 'text')   return R.badge;   // 6px
  if (r === 'image')  return R.md;      // 12px
  if (r === 'avatar') return R.full;    // 9999
  return R.md;                          // default
}

export default function Skeleton({
  width,
  height,
  radius = 'image',
  style,
}) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let stopped = false;

    const loop = () => {
      if (stopped) return;
      anim.setValue(0);
      Animated.timing(anim, {
        toValue: 1,
        duration: DURATION,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: false,
      }).start(({ finished }) => {
        if (finished && !stopped) loop();
      });
    };

    loop();
    return () => { stopped = true; anim.stopAnimation(); };
  }, []);

  const bg = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [BASE_COLOR, SHIMMER_COLOR, BASE_COLOR],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius: resolveRadius(radius),
          backgroundColor: bg,
        },
        style,
      ]}
    />
  );
}

// ── Convenience presets ────────────────────────────────────────────────────────

export function SkeletonCard({ width = 155, height = 130 }) {
  return (
    <View style={{ gap: space.sm }}>
      <Skeleton width={width} height={height} radius="image" />
      <Skeleton width={width * 0.8} height={14} radius="text" />
      <Skeleton width={width * 0.5} height={13} radius="text" />
    </View>
  );
}

export function SkeletonProductCard({ width = 155 }) {
  return (
    <View style={{ gap: space.sm }}>
      <Skeleton width={width} height={width} radius="image" />
      <Skeleton width={width * 0.85} height={14} radius="text" />
      <Skeleton width={width * 0.4} height={14} radius="text" />
    </View>
  );
}

export function SkeletonRow({ width = SCREEN_W - 40 }) {
  return (
    <View style={rowStyles.container}>
      <Skeleton width={64} height={64} radius="image" />
      <View style={rowStyles.text}>
        <Skeleton width={width * 0.55} height={14} radius="text" />
        <Skeleton width={width * 0.35} height={13} radius="text" style={{ marginTop: 6 }} />
      </View>
    </View>
  );
}

const rowStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
  },
  text: {
    flex: 1,
  },
});
