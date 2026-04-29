/**
 * SparkleBurst.js — pure RN Animated celebration burst.
 *
 * Renders a one-shot particle explosion at a given (x, y) screen point.
 * Three layers stacked from back to front:
 *   1. Soft blue glow that scales up + fades (depth)
 *   2. Shockwave ring expanding outward (impact)
 *   3. ~28 sparkle particles fanning radially with stagger (magic)
 *
 * Pure native-driver: every animated property is transform/opacity, so
 * the entire burst runs on the UI thread and stays smooth even while
 * the JS thread is busy validating the StoreKit receipt.
 *
 * No new dependencies — vanilla `Animated` from react-native.
 *
 * Brand palette only:
 *   - White (#FFFFFF) for sparkle cores
 *   - Light blue (#67ACE9) for accent particles + glow
 *   - Primary blue (#0B6DC3) implicit via shadows
 *
 * Mount cost: ~30 Animated.Views, all destroyed when onComplete fires.
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';

const PARTICLE_COUNT       = 28;
const PARTICLE_DIST_MIN    = 70;
const PARTICLE_DIST_MAX    = 170;
const PARTICLE_DURATION    = 1000;
const RING_DURATION        = 750;
const GLOW_DURATION        = 650;

// Pre-compute a deterministic-but-jittered particle distribution. Even
// angular spacing keeps the burst from clumping; the per-particle jitter
// keeps it from looking robotic.
function buildParticles() {
  return Array.from({ length: PARTICLE_COUNT }, (_, i) => {
    const baseAngle  = (i / PARTICLE_COUNT) * Math.PI * 2;
    const jitter     = (Math.random() - 0.5) * 0.35;
    const angle      = baseAngle + jitter;
    const dist       = PARTICLE_DIST_MIN + Math.random() * (PARTICLE_DIST_MAX - PARTICLE_DIST_MIN);
    const size       = 4 + Math.random() * 4;
    const isAccent   = i % 3 === 0;
    return {
      angle,
      dist,
      size,
      delay: i * 14,
      // Mix white sparkles with brand-blue accents (~33%) so the burst
      // has color depth without losing the pure-white "magic" reading.
      color: isAccent ? '#67ACE9' : '#FFFFFF',
    };
  });
}

function Particle({ p, anim }) {
  // translateX/Y go from origin (0,0) out to (cos·dist, sin·dist) at peak.
  // The ease is overshoot-then-settle so particles "throw" outward fast,
  // then drift to a stop instead of stopping abruptly.
  const tx = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, Math.cos(p.angle) * p.dist],
  });
  const ty = anim.interpolate({
    inputRange:  [0, 1],
    outputRange: [0, Math.sin(p.angle) * p.dist],
  });
  // Scale: 0 → 1.3 (snap visible) → 0.5 (drift down so it feels like fading
  // particle is shrinking too, more "sparkle" than "ball")
  const scale = anim.interpolate({
    inputRange:  [0, 0.18, 0.7, 1],
    outputRange: [0, 1.3,  0.85, 0.4],
  });
  // Opacity: pop on at 0.1, hold to 0.65, fade to 0
  const opacity = anim.interpolate({
    inputRange:  [0, 0.08, 0.65, 1],
    outputRange: [0, 1,    0.85, 0],
  });
  return (
    <Animated.View
      style={[
        styles.particle,
        {
          width: p.size,
          height: p.size,
          backgroundColor: p.color,
          shadowColor: p.color,
          transform: [{ translateX: tx }, { translateY: ty }, { scale }],
          opacity,
        },
      ]}
    />
  );
}

export default function SparkleBurst({ x, y, size = 120, onComplete }) {
  const particlesRef = useRef(buildParticles()).current;
  const particleAnim = useRef(new Animated.Value(0)).current;
  const ringAnim     = useRef(new Animated.Value(0)).current;
  const glowAnim     = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      // Particles: smooth ease-out so they decelerate as they fly outward
      Animated.timing(particleAnim, {
        toValue: 1,
        duration: PARTICLE_DURATION,
        easing: Easing.bezier(0.22, 1, 0.36, 1),
        useNativeDriver: true,
      }),
      // Ring: faster ease-out, classic shockwave
      Animated.timing(ringAnim, {
        toValue: 1,
        duration: RING_DURATION,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      // Glow: slower bell so it has presence without dominating
      Animated.timing(glowAnim, {
        toValue: 1,
        duration: GLOW_DURATION,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]).start(() => onComplete?.());
  }, []);

  const ringScale   = ringAnim.interpolate({ inputRange: [0, 1],          outputRange: [0.2, 3.4] });
  const ringOpacity = ringAnim.interpolate({ inputRange: [0, 0.25, 1],    outputRange: [0, 0.7, 0] });
  const glowScale   = glowAnim.interpolate({ inputRange: [0, 0.45, 1],    outputRange: [0.1, 1.0, 0.7] });
  const glowOpacity = glowAnim.interpolate({ inputRange: [0, 0.4, 1],     outputRange: [0, 0.65, 0] });

  return (
    <View pointerEvents="none" style={[styles.center, { left: x, top: y }]}>
      <Animated.View
        style={[
          styles.glow,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            marginLeft: -size / 2,
            marginTop: -size / 2,
            transform: [{ scale: glowScale }],
            opacity: glowOpacity,
          },
        ]}
      />
      <Animated.View
        style={[
          styles.ring,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            marginLeft: -size / 2,
            marginTop: -size / 2,
            transform: [{ scale: ringScale }],
            opacity: ringOpacity,
          },
        ]}
      />
      {particlesRef.map((p, i) => (
        <Particle key={i} p={p} anim={particleAnim} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  // The container is a 0×0 anchor positioned at the burst origin (x, y).
  // Children are absolutely positioned relative to it, so they radiate
  // out from a single point — no math at the call site.
  center: {
    position: 'absolute',
    width: 0,
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    backgroundColor: '#67ACE9',
    shadowColor: '#67ACE9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 35,
  },
  ring: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: 'transparent',
  },
  particle: {
    position: 'absolute',
    borderRadius: 999,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
});
