/**
 * SparkleBurst.js — multi-phase celebration burst.
 *
 * Renders a one-shot "you just bought something magical" explosion at a
 * given (x, y) screen point. Designed to feel like ONE moment but with
 * texture: a click → a wave → a settle.
 *
 * Layers, back to front:
 *
 *   Phase 4 — Background radial glow         (0–900ms)  depth + aura
 *   Phase 1 — Anticipation flash             (0–120ms)  the "click"
 *   Phase 2 — Twin synchronized shockwaves   (0–850ms)  impact wave
 *               (Build 123: rings now start at t=0 from scale 0,
 *                inner max 2.2× borderWidth 1.5px white,
 *                outer max 3.5× borderWidth 1px light-blue)
 *   Phase 3 — Tiered particle explosion      (150–1500ms) the magic
 *               LARGE  10 hero sparkles    | size 10–14, dist 100–260
 *               MEDIUM 22 filler particles | size 5–8,   dist 70–220
 *               SMALL  24 dust particles   | size 2–4,   dist 50–320
 *
 * Total runtime ~1.5s. The dopamine spike sits at ~250–500ms when the
 * shockwaves are at peak AND the large sparkles are mid-flight; small
 * dust drifts on the back half so the moment "settles" rather than
 * cutting off.
 *
 * Pure native driver: every animated property is transform/opacity, so
 * the entire burst runs on the UI thread and stays smooth even while
 * the JS thread is busy validating the StoreKit receipt downstream.
 *
 * No new dependencies — vanilla `Animated` from react-native.
 *
 * Brand palette only:
 *   - White (#FFFFFF) for sparkle cores + flash
 *   - Light blue (#67ACE9) for accent particles + glow + outer ring
 *   - Primary blue (#0B6DC3) for deep accents (subtle, ~15% of particles)
 *
 * Mount cost: ~60 Animated.Views during the burst, all destroyed when
 * onComplete fires.
 */
import React, { useEffect, useRef } from 'react';
import { View, Animated, StyleSheet, Easing } from 'react-native';

// ── Phase timings ──────────────────────────────────────────────────────────
const FLASH_DURATION       = 220;
const RING_INNER_DURATION  = 650;
const RING_OUTER_DURATION  = 850;
const PARTICLE_DURATION    = 1350;
const GLOW_DURATION        = 900;
const TOTAL_DURATION       = 1500;  // outer envelope; what the parent waits for

// ── Particle tier configuration ────────────────────────────────────────────
//
// Three tiers give the burst a "core / filler / dust" feel instead of the
// uniform halo of the old design. Distance ranges intentionally overlap so
// the boundaries don't read as concentric rings.
const TIERS = [
  {
    name:        'large',
    count:       10,
    sizeMin:     10,
    sizeMax:     14,
    distMin:     100,
    distMax:     260,
    delayMin:    0,
    delayMax:    80,
    accentRatio: 0.5,    // 50% blue accents — large particles get more color
  },
  {
    name:        'medium',
    count:       22,
    sizeMin:     5,
    sizeMax:     8,
    distMin:     70,
    distMax:     220,
    delayMin:    80,
    delayMax:    280,
    accentRatio: 0.35,   // mostly white with some accent
  },
  {
    name:        'small',
    count:       24,
    sizeMin:     2,
    sizeMax:     4,
    distMin:     50,
    distMax:     320,
    delayMin:    200,
    delayMax:    500,
    accentRatio: 0.25,   // mostly white dust
  },
];

const COLOR_WHITE = '#FFFFFF';
const COLOR_LIGHT_BLUE = '#67ACE9';
const COLOR_PRIMARY_BLUE = '#0B6DC3';

// Pick an accent color: most accent particles use light blue, a smaller
// fraction use primary blue for depth. Keeps the burst grounded in brand
// without ever introducing off-palette tints.
function pickAccentColor() {
  return Math.random() < 0.7 ? COLOR_LIGHT_BLUE : COLOR_PRIMARY_BLUE;
}

// Pre-compute deterministic-but-jittered particles for all tiers at mount.
// Each particle carries its own angle, distance, size, color, delay, and
// rotation direction — enough variation to never read as "robotic ring".
function buildParticles() {
  const particles = [];
  TIERS.forEach((tier) => {
    for (let i = 0; i < tier.count; i++) {
      // Even angular distribution per tier with light jitter so neighbors
      // don't pile on top of each other but the overall ring feels organic.
      const baseAngle = (i / tier.count) * Math.PI * 2;
      // Per-tier phase offset so the three tiers don't all land at the
      // same compass directions — adds visual density.
      const tierPhase = TIERS.indexOf(tier) * (Math.PI / 7);
      const jitter    = (Math.random() - 0.5) * 0.4;
      const angle     = baseAngle + tierPhase + jitter;

      const dist  = tier.distMin + Math.random() * (tier.distMax - tier.distMin);
      const size  = tier.sizeMin + Math.random() * (tier.sizeMax - tier.sizeMin);
      const delay = tier.delayMin + Math.random() * (tier.delayMax - tier.delayMin);

      const isAccent = Math.random() < tier.accentRatio;
      const color    = isAccent ? pickAccentColor() : COLOR_WHITE;

      // Rotation: small (-90 to +90 deg) random spin, randomized direction.
      // Adds shimmer life without making the particle look like a propeller.
      const rotateEnd = (Math.random() - 0.5) * 180;

      particles.push({ angle, dist, size, delay, color, rotateEnd, tier: tier.name });
    }
  });
  return particles;
}

function Particle({ p, anim }) {
  // Per-particle progress curve: starts at p.delay/TOTAL, fully out by ~80%
  // of remaining duration. This is what gives each tier its stagger.
  const start = p.delay / TOTAL_DURATION;
  const peak  = Math.min(start + 0.18, 0.85);   // when it reaches max distance
  // Cap at 0.999 (not 1) so the inputRange tuples below never end with two
  // identical 1.0 values when start is large (e.g. small-tier delay=500ms,
  // start=0.333, end would clamp to 1.0 — making `[..., end, 1]` collapse
  // to `[..., 1, 1]` which trips RN Animated's "monotonically increasing"
  // warning. 1.5ms early finish is imperceptible.
  const end   = Math.min(start + 0.85, 0.999);

  // translateX/Y: 0 → cos·dist, sin·dist
  const tx = anim.interpolate({
    inputRange:  [0, start, end, 1],
    outputRange: [0, 0, Math.cos(p.angle) * p.dist, Math.cos(p.angle) * p.dist],
    extrapolate: 'clamp',
  });
  const ty = anim.interpolate({
    inputRange:  [0, start, end, 1],
    outputRange: [0, 0, Math.sin(p.angle) * p.dist, Math.sin(p.angle) * p.dist],
    extrapolate: 'clamp',
  });

  // Scale: 0 → 1.4 (overshoot pop) → 0.4 (drift down — feels like the
  // sparkle is fading at the same rate as opacity, not just disappearing).
  const scale = anim.interpolate({
    inputRange:  [0, start, peak, end, 1],
    outputRange: [0, 0,     1.4,  0.4, 0.4],
    extrapolate: 'clamp',
  });

  // Opacity: 0 → 1 (snap on) → hold → fade to 0.
  const opacity = anim.interpolate({
    inputRange:  [0, start, start + 0.02, peak, end, 1],
    outputRange: [0, 0,     1,            0.95, 0,   0],
    extrapolate: 'clamp',
  });

  // Rotation: smooth 0 → rotateEnd over the full particle lifetime.
  const rotate = anim.interpolate({
    inputRange:  [0, start, end, 1],
    outputRange: ['0deg', '0deg', `${p.rotateEnd}deg`, `${p.rotateEnd}deg`],
    extrapolate: 'clamp',
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
          transform: [
            { translateX: tx },
            { translateY: ty },
            { rotate },
            { scale },
          ],
          opacity,
        },
      ]}
    />
  );
}

export default function SparkleBurst({ x, y, size = 140, onComplete }) {
  // Single timeline anim drives ALL phases. Each phase reads its own slice
  // of [0,1] via interpolations. One animation, fully native driver,
  // everything stays in sync.
  const t = useRef(new Animated.Value(0)).current;

  // Particles are built once at mount — same set throughout this burst's
  // lifetime. Different bursts get different jitter naturally because
  // useRef + buildParticles() re-runs per mount.
  const particlesRef = useRef(buildParticles()).current;

  useEffect(() => {
    Animated.timing(t, {
      toValue: 1,
      duration: TOTAL_DURATION,
      easing: Easing.linear,    // master clock is linear; per-phase eases
                                // come from the per-property interpolations
      useNativeDriver: true,
    }).start(() => onComplete?.());
  }, []);

  // ── Phase 1: Anticipation flash ──────────────────────────────────────────
  // White core that scales 0 → 1 → 0.6, full opacity peak then fades quickly.
  // Sits dead-center and reads as the "click" of the purchase landing.
  const flashEnd   = FLASH_DURATION / TOTAL_DURATION;       // ≈ 0.147
  const flashScale = t.interpolate({
    inputRange:  [0, flashEnd * 0.4, flashEnd, 1],
    outputRange: [0, 1.0,            0.6,      0.6],
    extrapolate: 'clamp',
  });
  const flashOpacity = t.interpolate({
    inputRange:  [0, flashEnd * 0.3, flashEnd, 1],
    outputRange: [0, 1,              0,        0],
    extrapolate: 'clamp',
  });

  // ── Phase 2: Twin shockwaves ─────────────────────────────────────────────
  // Both rings now start synchronized at t=0 and emerge from scale 0
  // (no pre-expansion "dot" visible at center) so they read as ONE
  // coordinated shockwave pulse from the burst origin instead of two
  // staggered arcs that the eye reads as off-center.
  //
  // Build 123 polish:
  //   - Inner max scale 2.8× → 2.2×    (stays inside tile bounds longer)
  //   - Outer max scale 4.5× → 3.5×    (doesn't extend so far past particle field)
  //   - Initial scale 0.2 → 0          (rings emerge from nothing, like particles)
  //   - Outer 50ms delay → 0           (rings start synchronized)
  //   - Inner border 3px → 1.5px       (thinner, more elegant)
  //   - Outer border 1.5px → 1px       (thinner, see styles.ringOuter below)
  const ringInnerEnd     = RING_INNER_DURATION / TOTAL_DURATION;        // ≈ 0.433
  const ringInnerScale   = t.interpolate({
    inputRange:  [0, ringInnerEnd, 1],
    outputRange: [0, 2.2,          2.2],
    extrapolate: 'clamp',
  });
  const ringInnerOpacity = t.interpolate({
    inputRange:  [0, ringInnerEnd * 0.2, ringInnerEnd * 0.7, ringInnerEnd, 1],
    outputRange: [0, 0.85,               0.4,                0,            0],
    extrapolate: 'clamp',
  });

  const ringOuterEnd     = RING_OUTER_DURATION / TOTAL_DURATION;        // ≈ 0.567
  const ringOuterScale   = t.interpolate({
    inputRange:  [0, ringOuterEnd, 1],
    outputRange: [0, 3.5,          3.5],
    extrapolate: 'clamp',
  });
  const ringOuterOpacity = t.interpolate({
    inputRange:  [0, 0.05, ringOuterEnd * 0.8, ringOuterEnd, 1],
    outputRange: [0, 0.6,  0.2,                0,            0],
    extrapolate: 'clamp',
  });

  // ── Phase 4: Background radial glow ──────────────────────────────────────
  // Slow bell — peaks ~mid-burst, lingers as background warmth.
  const glowEnd     = GLOW_DURATION / TOTAL_DURATION;                   // ≈ 0.6
  const glowScale   = t.interpolate({
    inputRange:  [0, glowEnd * 0.5, glowEnd, 1],
    outputRange: [0.1, 1.2,         0.8,     0.8],
    extrapolate: 'clamp',
  });
  const glowOpacity = t.interpolate({
    inputRange:  [0, glowEnd * 0.3, glowEnd * 0.7, glowEnd, 1],
    outputRange: [0, 0.55,          0.35,          0,       0],
    extrapolate: 'clamp',
  });

  return (
    <View pointerEvents="none" style={[styles.center, { left: x, top: y }]}>
      {/* Phase 4: background glow (back-most) */}
      <Animated.View
        style={[
          styles.glow,
          {
            width: size * 1.2,
            height: size * 1.2,
            borderRadius: (size * 1.2) / 2,
            // Build 124: swapped marginLeft/marginTop → left/top. With
            // position:'absolute' on the parent's 0×0 + alignItems:center,
            // Yoga's interpretation of negative margin is ambiguous — it
            // resulted in rings rendering off-center from the particles
            // (which use translate from origin and don't depend on margin).
            // Explicit left/top is unambiguous in Yoga and CSS spec.
            left: -(size * 1.2) / 2,
            top: -(size * 1.2) / 2,
            transform: [{ scale: glowScale }],
            opacity: glowOpacity,
          },
        ]}
      />

      {/* Phase 2: outer shockwave */}
      <Animated.View
        style={[
          styles.ringOuter,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            // Build 124: explicit left/top centering — see glow comment above.
            left: -size / 2,
            top: -size / 2,
            transform: [{ scale: ringOuterScale }],
            opacity: ringOuterOpacity,
          },
        ]}
      />

      {/* Phase 2: inner shockwave */}
      <Animated.View
        style={[
          styles.ringInner,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            // Build 124: explicit left/top centering — see glow comment above.
            left: -size / 2,
            top: -size / 2,
            transform: [{ scale: ringInnerScale }],
            opacity: ringInnerOpacity,
          },
        ]}
      />

      {/* Phase 1: anticipation flash */}
      <Animated.View
        style={[
          styles.flash,
          {
            transform: [{ scale: flashScale }],
            opacity: flashOpacity,
          },
        ]}
      />

      {/* Phase 3: tiered particles */}
      {particlesRef.map((p, i) => (
        <Particle key={i} p={p} anim={t} />
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
    backgroundColor: COLOR_LIGHT_BLUE,
    shadowColor: COLOR_LIGHT_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 45,
  },
  ringOuter: {
    position: 'absolute',
    // Build 123: thinned from 1.5 → 1 for a more elegant shockwave reading
    borderWidth: 1,
    borderColor: COLOR_LIGHT_BLUE,
    backgroundColor: 'transparent',
  },
  ringInner: {
    position: 'absolute',
    // Build 123: thinned from 3 → 1.5 — pairs with the outer ring's new
    // 1px border so the two together read as a single coordinated pulse
    // rather than two distinct stripes.
    borderWidth: 1.5,
    borderColor: COLOR_WHITE,
    backgroundColor: 'transparent',
  },
  flash: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    // Build 124: swapped marginLeft/marginTop → left/top to match the
    // glow + rings — see SparkleBurst component for full rationale on
    // the Yoga ambiguity that motivated this swap.
    left: -18,
    top: -18,
    backgroundColor: COLOR_WHITE,
    shadowColor: COLOR_WHITE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 20,
  },
  particle: {
    position: 'absolute',
    borderRadius: 999,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
});
