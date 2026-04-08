/**
 * LensLoader — HomeGenie's signature camera-lens loading animation.
 *
 * Replaces ActivityIndicator everywhere.
 *
 * Props:
 *   size   — pixel diameter (default 40)
 *            < 32 → compact 3-layer (buttons, inline)
 *            ≥ 32 → full 5-layer camera lens
 *   color  — primary stroke/fill color (default '#0B6DC3')
 *   light  — secondary/accent color   (default '#67ACE9')
 *   style  — additional View styles
 */
import React, { useRef, useEffect } from 'react';
import { View, Animated } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

export default function LensLoader({ size = 40, color = '#0B6DC3', light = '#67ACE9', style }) {
  const spin  = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(1)).current;
  const dot   = useRef(new Animated.Value(0.5)).current;

  const isCompact = size < 32;

  useEffect(() => {
    const anims = [
      // Rotation — faster for compact, slower for full
      Animated.loop(
        Animated.timing(spin, {
          toValue: 1,
          duration: isCompact ? 1800 : 4000,
          useNativeDriver: true,
        }),
      ),
    ];

    if (!isCompact) {
      // Aperture breathe
      anims.push(
        Animated.loop(
          Animated.sequence([
            Animated.timing(scale, { toValue: 1.1,  duration: 700, useNativeDriver: true }),
            Animated.timing(scale, { toValue: 0.88, duration: 700, useNativeDriver: true }),
          ]),
        ),
      );
      // Center dot pulse
      anims.push(
        Animated.loop(
          Animated.sequence([
            Animated.timing(dot, { toValue: 1,    duration: 900, useNativeDriver: true }),
            Animated.timing(dot, { toValue: 0.25, duration: 900, useNativeDriver: true }),
          ]),
        ),
      );
    }

    const group = Animated.parallel(anims);
    group.start();
    return () => group.stop();
  }, []);

  const rotate        = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const counterRotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-200deg'] });

  // ─── Compact 3-layer (< 32px) ─────────────────────────────────
  if (isCompact) {
    return (
      <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
        {/* Outer ring — CW rotation */}
        <Animated.View style={{ position: 'absolute', transform: [{ rotate }] }}>
          <Svg width={size} height={size} viewBox="0 0 30 30">
            <Circle cx={15} cy={15} r={13} stroke={color} strokeWidth={1.2}
              fill="none" strokeDasharray="3 4" strokeLinecap="round" />
          </Svg>
        </Animated.View>
        {/* Inner ring — CCW rotation */}
        <Animated.View style={{ position: 'absolute', transform: [{ rotate: counterRotate }] }}>
          <Svg width={size} height={size} viewBox="0 0 30 30">
            <Circle cx={15} cy={15} r={9} stroke={color} strokeWidth={0.8}
              fill="none" opacity={0.6} strokeDasharray="4 3" strokeLinecap="round" />
          </Svg>
        </Animated.View>
        {/* Center dot */}
        <Svg width={size} height={size} viewBox="0 0 30 30" style={{ position: 'absolute' }}>
          <Circle cx={15} cy={15} r={3} fill={color} opacity={0.5} />
        </Svg>
      </View>
    );
  }

  // ─── Full 5-layer camera lens (≥ 32px) ─────────────────────────
  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
      {/* Layer 1 — outer barrel: dashed ring, CW rotation */}
      <Animated.View style={{ position: 'absolute', transform: [{ rotate }] }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Circle cx={50} cy={50} r={46} stroke={light} strokeWidth={1.5}
            fill="none" strokeDasharray="5 7" strokeLinecap="round" />
        </Svg>
      </Animated.View>

      {/* Layer 2 — middle ring: dashed, CCW rotation */}
      <Animated.View style={{ position: 'absolute', transform: [{ rotate: counterRotate }] }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Circle cx={50} cy={50} r={34} stroke={color} strokeWidth={1}
            fill="none" opacity={0.65} strokeDasharray="10 5" strokeLinecap="round" />
        </Svg>
      </Animated.View>

      {/* Layer 3 — inner ring: static */}
      <Svg width={size} height={size} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
        <Circle cx={50} cy={50} r={22} stroke={light} strokeWidth={0.8} fill="none" opacity={0.4} />
      </Svg>

      {/* Layer 4 — aperture blades: 12 orbiting dots + inner glass */}
      <Animated.View style={{ position: 'absolute', transform: [{ scale }] }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => (
            <G key={i} rotation={angle} origin="50, 50">
              <Circle cx={50} cy={33} r={2.5} fill={light} opacity={0.85} />
            </G>
          ))}
          <Circle cx={50} cy={50} r={12} fill={color} opacity={0.12} />
        </Svg>
      </Animated.View>

      {/* Layer 5 — center dot: pulsing glow */}
      <Animated.View style={{ position: 'absolute', opacity: dot }}>
        <Svg width={size} height={size} viewBox="0 0 100 100">
          <Circle cx={50} cy={50} r={9} fill={color} opacity={0.1} />
          <Circle cx={50} cy={50} r={4} fill={color} opacity={0.7} />
        </Svg>
      </Animated.View>
    </View>
  );
}
