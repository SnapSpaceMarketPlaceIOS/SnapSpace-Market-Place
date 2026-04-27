/**
 * GenieLoader — Branded loading animation using the HomeGenie logo.
 *
 * Animation sequence:
 *   1. Genie pot bounces (Pixar-lamp style vertical hop) → particles fade in
 *   2. Loop: particles orbit (self-accelerating 5s→1.2s/rev),
 *      genie bounces periodically (every ~2.5s), blue dot pulses, body breathes
 *
 * Build 92 — restored to Build 90 baseline. The Build 91 escalation
 * experiment (3-act phase progression, aura halo, wisps, twinkle, tighter
 * orbit in Act III) was reverted because the build-up read sloppy. The ONE
 * Build 91 element kept is the climax burst — when the result is ready,
 * the lamp scales down, particles burst outward, and a brief white flash
 * overlay reveals the Room Result. Caller-triggered, not progress-based.
 *
 * Props:
 *   size            — pixel diameter (default 80)
 *   animating       — boolean to start/stop (default true)
 *   style           — pass-through View styles
 *   climaxTrigger   — boolean (optional). Flip false → true to fire the
 *                     400ms reveal burst exactly once per mount.
 *   onClimaxComplete— () => void callback fired after the burst completes.
 */
import React, { useRef, useEffect } from 'react';
import { View, Animated, Easing } from 'react-native';
import Svg, {
  Rect, Path, Circle, Defs,
  LinearGradient as SvgLinearGradient, Stop,
} from 'react-native-svg';

// ── Brand colors ────────────────────────────────────────────────────────────
const DARK  = '#0B6DC3';
const LIGHT = '#67ACE9';
const WHITE = '#FFFFFF';
const DOT   = '#5AA4E4';

// 24 particles with mixed sizes:
//   DARK  → small (1×)
//   LIGHT → medium (1.6×)
//   WHITE → large (2×)
const PARTICLES = [];
const PALETTE = [DARK, LIGHT, WHITE];
const SIZE_MULT = { [DARK]: 1, [LIGHT]: 1.6, [WHITE]: 2 };
for (let i = 0; i < 24; i++) {
  const color = PALETTE[i % PALETTE.length];
  PARTICLES.push({ color, sizeMult: SIZE_MULT[color] });
}

// ── SVG path data (extracted from HomeGenie logo) ───────────────────────────

const HOUSE_D = 'M197 74.5482L79.8429 154.709C69.2396 160.878 64 168.427 64 177.444V356.814C64 374.007 86.7806 388.057 114.655 388.057H334.344C362.219 388.057 385 374.007 385 356.814V177.444C385 168.427 379.74 160.878 369.136 154.709L256.5 74.5483C227.631 57.7131 224.313 57.9218 197 74.5482Z';

const GENIE_D = 'M326.155 194.661C306.203 193.551 286.596 223.576 265.287 232.582C259.954 218.661 247.863 208.794 233.603 206.723C231.53 206.386 230.008 204.515 230.02 202.32V201.347C230.044 200.249 230.428 199.189 231.123 198.353C233.699 195.023 234.837 190.732 234.262 186.491C233.675 182.25 231.945 180 228 180C223.945 180 221.632 183.609 221.596 188.674C221.56 192.191 222.71 195.622 224.819 198.353C225.49 199.201 225.862 200.262 225.886 201.347V202.32C225.934 204.441 224.52 206.287 222.53 206.723C206.748 209.006 193.77 220.794 189.432 236.748C178 232.457 167.143 226.669 157.138 219.497C130.008 200.91 117.852 197.824 106.271 197.234C106.271 197.234 104.761 197.234 101.739 199.004L97.5928 201.372V201.385C96.2007 201.953 95.6735 205.674 96.2008 206.672C96.7161 207.67 99.1384 208.944 100.229 209.031C114.118 209.518 127.527 211.489 138.924 219.771C164.952 237.721 180.062 295.913 228.116 295.913C275.031 295.913 295.993 209.304 326.155 209.304C346.886 209.304 342.714 254.499 330.898 264.778C319.082 275.069 307.291 264.503 296.637 264.503C283.719 264.503 284.33 277.476 291.281 278.287C292.862 278.524 294.468 278.05 295.69 276.99C296.925 275.93 297.668 274.37 297.74 272.711C304.33 277.464 312.024 280.283 320.029 280.845C338.699 280.845 354 250.642 354 228.464C353.964 218.248 349.175 195.896 326.155 194.661ZM262.64 247.836C251.579 251.878 239.943 253.936 228.21 253.923C216.502 253.923 204.878 251.877 193.818 247.873C190.93 246.888 189.324 243.67 190.235 240.639C202.326 245.591 215.196 248.123 228.186 248.11C241.176 248.098 254.058 245.566 266.161 240.639C266.593 242.111 266.449 243.682 265.754 245.042C265.059 246.389 263.885 247.399 262.471 247.836H262.64ZM272.322 318.425V318.961C258.158 324.387 243.154 327.106 228.054 326.994C212.955 327.144 197.964 324.462 183.774 319.061V318.524C184.302 316.204 185.704 314.196 187.669 312.973C189.634 311.751 191.995 311.414 194.212 312.038C201.378 314.532 209.275 312.088 213.972 305.925C215.099 304.341 215.974 302.582 216.561 300.711C220.3 301.522 224.098 301.921 227.921 301.921C231.732 301.909 235.519 301.397 239.198 300.374C240.552 305.152 243.763 309.119 248.053 311.339C252.343 313.547 257.316 313.809 261.798 312.038C264.003 311.414 266.364 311.763 268.317 312.986C270.282 314.208 271.673 316.204 272.2 318.524L272.322 318.425Z';

// ── Component ───────────────────────────────────────────────────────────────

export default function GenieLoader({
  size = 80,
  animating = true,
  style,
  climaxTrigger,      // boolean (optional) — flip false→true to fire the burst
  onClimaxComplete,   // () => void
}) {
  // Animated values (Build 90 baseline)
  const genieBounceY    = useRef(new Animated.Value(0)).current;   // vertical hop
  const genieScaleY     = useRef(new Animated.Value(1)).current;   // squash/stretch
  const genieShakeX     = useRef(new Animated.Value(0)).current;   // mid-air rattle
  const breatheScale    = useRef(new Animated.Value(1)).current;
  const dotPulse        = useRef(new Animated.Value(0.4)).current;
  const orbitProgress   = useRef(new Animated.Value(0)).current;
  const particleOpacity = useRef(new Animated.Value(0)).current;

  // Climax-only animated values (Build 92 — the only Build 91 element kept)
  const climaxLamp     = useRef(new Animated.Value(1)).current; // lamp scale 1 → 0
  const climaxBurst    = useRef(new Animated.Value(0)).current; // particles 0 (normal) → 1 (burst out)
  const whiteFlash     = useRef(new Animated.Value(0)).current; // overlay 0 → 0.4 → 0

  // Animation handles for cleanup
  const introRef    = useRef(null);
  const loopRef     = useRef(null);
  const orbitRef    = useRef(null);
  const bounceRef   = useRef(null);
  const climaxRef   = useRef(null);
  const mountedRef  = useRef(true);
  const orbitDurRef = useRef(5000);
  const climaxFiredRef = useRef(false);

  // Base particle size (small ones ~2px at size=100)
  const baseDot     = Math.max(2, Math.round(size * 0.018));
  // Wider orbit — particles well clear of icon edges
  const orbitRadius = size * 0.80;

  useEffect(() => {
    mountedRef.current = true;
    if (animating) {
      startAnimation();
    } else {
      stopAnimation();
    }
    return () => {
      mountedRef.current = false;
      stopAnimation();
    };
  }, [animating]);

  // ── Climax burst (Build 92) ─────────────────────────────────────────────
  // Fires the 400ms reveal exactly once per mount. Stops every running loop
  // first so they don't fight the burst. onClimaxComplete fires when done
  // so the caller can transition to the result image.
  useEffect(() => {
    if (!climaxTrigger) return;
    if (climaxFiredRef.current) return;
    climaxFiredRef.current = true;

    introRef.current?.stop();
    loopRef.current?.stop();
    orbitRef.current?.stop();
    bounceRef.current?.stop();

    climaxRef.current = Animated.parallel([
      // Lamp scales down to nothing
      Animated.timing(climaxLamp, {
        toValue: 0,
        duration: 400,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      // Particles burst outward + fade
      Animated.timing(climaxBurst, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // White flash overlay: 0 → 0.4 in 100ms, → 0 in 300ms
      Animated.sequence([
        Animated.timing(whiteFlash, { toValue: 0.4, duration: 100, useNativeDriver: true }),
        Animated.timing(whiteFlash, { toValue: 0,   duration: 300, useNativeDriver: true }),
      ]),
    ]);
    climaxRef.current.start(({ finished }) => {
      if (finished && mountedRef.current) onClimaxComplete?.();
    });
  }, [climaxTrigger, onClimaxComplete]);

  // ── Self-accelerating orbit ────────────────────────────────────────────
  function startOrbitCycle(duration) {
    if (!mountedRef.current) return;
    orbitDurRef.current = duration;
    orbitProgress.setValue(0);

    orbitRef.current = Animated.timing(orbitProgress, {
      toValue: 1,
      duration,
      easing: Easing.linear,
      useNativeDriver: true,
    });

    orbitRef.current.start(({ finished }) => {
      if (finished && mountedRef.current) {
        const next = Math.max(1200, duration - 250);
        startOrbitCycle(next);
      }
    });
  }

  // ── Mid-air rattle — quick horizontal shake while airborne ──────────────
  function createMidAirShake() {
    return Animated.sequence([
      Animated.timing(genieShakeX, { toValue:  1.2, duration: 60, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(genieShakeX, { toValue: -1.2, duration: 60, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(genieShakeX, { toValue:  0.6, duration: 60, easing: Easing.linear, useNativeDriver: true }),
      Animated.timing(genieShakeX, { toValue:  0,   duration: 60, easing: Easing.linear, useNativeDriver: true }),
    ]);
  }

  // ── Pixar lamp bounce — hop up + shake in air, land, settle ───────────
  function createBounce() {
    return Animated.sequence([
      // Anticipation — slight squash before jump
      Animated.timing(genieScaleY, {
        toValue: 0.96, duration: 80, easing: Easing.out(Easing.ease), useNativeDriver: true,
      }),
      // Launch upward + stretch + mid-air rattle (all parallel)
      Animated.parallel([
        Animated.sequence([
          Animated.parallel([
            Animated.timing(genieBounceY, {
              toValue: -5, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true,
            }),
            Animated.timing(genieScaleY, {
              toValue: 1.03, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(genieBounceY, {
              toValue: 0, duration: 130, easing: Easing.in(Easing.cubic), useNativeDriver: true,
            }),
            Animated.timing(genieScaleY, {
              toValue: 1, duration: 130, easing: Easing.in(Easing.cubic), useNativeDriver: true,
            }),
          ]),
        ]),
        createMidAirShake(),
      ]),
      // Landing squash
      Animated.timing(genieScaleY, {
        toValue: 0.97, duration: 50, easing: Easing.out(Easing.ease), useNativeDriver: true,
      }),
      Animated.timing(genieScaleY, {
        toValue: 1, duration: 80, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
      }),
      Animated.delay(1500),
    ]);
  }

  function startBounceLoop() {
    if (!mountedRef.current) return;
    const bounce = createBounce();
    bounceRef.current = bounce;
    bounce.start(({ finished }) => {
      if (finished && mountedRef.current) startBounceLoop();
    });
  }

  function startAnimation() {
    // Reset all values
    genieBounceY.setValue(0);
    genieScaleY.setValue(1);
    genieShakeX.setValue(0);
    breatheScale.setValue(1);
    dotPulse.setValue(0.4);
    orbitProgress.setValue(0);
    particleOpacity.setValue(0);
    climaxLamp.setValue(1);
    climaxBurst.setValue(0);
    whiteFlash.setValue(0);
    orbitDurRef.current = 5000;
    climaxFiredRef.current = false;

    // Phase 1: Initial Pixar bounce + mid-air shake (slightly bigger than loop)
    const introBounce = Animated.sequence([
      Animated.timing(genieScaleY, {
        toValue: 0.93, duration: 100, easing: Easing.out(Easing.ease), useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.sequence([
          Animated.parallel([
            Animated.timing(genieBounceY, {
              toValue: -8, duration: 190, easing: Easing.out(Easing.cubic), useNativeDriver: true,
            }),
            Animated.timing(genieScaleY, {
              toValue: 1.05, duration: 190, easing: Easing.out(Easing.cubic), useNativeDriver: true,
            }),
          ]),
          Animated.parallel([
            Animated.timing(genieBounceY, {
              toValue: 0, duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: true,
            }),
            Animated.timing(genieScaleY, {
              toValue: 1, duration: 160, easing: Easing.in(Easing.cubic), useNativeDriver: true,
            }),
          ]),
        ]),
        createMidAirShake(),
      ]),
      Animated.timing(genieScaleY, {
        toValue: 0.95, duration: 60, easing: Easing.out(Easing.ease), useNativeDriver: true,
      }),
      Animated.timing(genieScaleY, {
        toValue: 1, duration: 90, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
      }),
    ]);

    // Phase 2: Particle fade-in
    const fadeIn = Animated.timing(particleOpacity, {
      toValue: 1, duration: 250, useNativeDriver: true,
    });

    introRef.current = Animated.sequence([introBounce, fadeIn]);
    introRef.current.start(() => {
      if (!mountedRef.current) return;

      startOrbitCycle(5000);
      startBounceLoop();

      const dotLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(dotPulse, { toValue: 1,   duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(dotPulse, { toValue: 0.4, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );

      const breatheLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(breatheScale, { toValue: 1.05, duration: 933, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(breatheScale, { toValue: 0.97, duration: 933, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
          Animated.timing(breatheScale, { toValue: 1,    duration: 934, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        ])
      );

      loopRef.current = Animated.parallel([dotLoop, breatheLoop]);
      loopRef.current.start();
    });
  }

  function stopAnimation() {
    introRef.current?.stop();
    loopRef.current?.stop();
    orbitRef.current?.stop();
    bounceRef.current?.stop();
    climaxRef.current?.stop();
    introRef.current = null;
    loopRef.current  = null;
    orbitRef.current = null;
    bounceRef.current = null;
    climaxRef.current = null;
    genieBounceY.setValue(0);
    genieScaleY.setValue(1);
    genieShakeX.setValue(0);
    breatheScale.setValue(1);
    dotPulse.setValue(0.4);
    orbitProgress.setValue(0);
    particleOpacity.setValue(0);
    climaxLamp.setValue(1);
    climaxBurst.setValue(0);
    whiteFlash.setValue(0);
    orbitDurRef.current = 5000;
  }

  // ── Climax-derived render values ────────────────────────────────────────
  // Particle translateY ramps from -orbitRadius to -orbitRadius * 1.5 during
  // burst; opacity fades to 0 in the second half.
  const particleClimaxRadius = climaxBurst.interpolate({
    inputRange: [0, 1],
    outputRange: [-orbitRadius, -orbitRadius * 1.5],
  });
  const particleClimaxOpacity = climaxBurst.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1, 0],
  });

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }, style]}>
      {/* ── Orbiting particles (behind logo) ───────────────────── */}
      {PARTICLES.map(({ color, sizeMult }, i) => {
        const pSize = Math.max(2, Math.round(baseDot * sizeMult));
        return (
          <Animated.View
            key={i}
            style={{
              position: 'absolute',
              width: pSize,
              height: pSize,
              opacity: Animated.multiply(particleOpacity, particleClimaxOpacity),
              transform: [
                {
                  rotate: orbitProgress.interpolate({
                    inputRange: [0, 1],
                    outputRange: [`${i * 15}deg`, `${i * 15 + 360}deg`],
                  }),
                },
                { translateY: particleClimaxRadius },
              ],
            }}
          >
            <View style={{
              width: pSize,
              height: pSize,
              borderRadius: pSize / 2,
              backgroundColor: color,
              shadowColor: color,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.7,
              shadowRadius: color === WHITE ? 3 : 2,
              elevation: 2,
            }} />
          </Animated.View>
        );
      })}

      {/* ── Logo: Base layer (bg + house — stays still) ──────── */}
      <Animated.View style={{
        transform: [
          { scale: Animated.multiply(breatheScale, climaxLamp) },
        ],
      }}>
        <Svg width={size} height={size} viewBox="0 0 450 450">
          <Defs>
            <SvgLinearGradient id="bgGrad" x1="225" y1="0" x2="225" y2="450" gradientUnits="userSpaceOnUse">
              <Stop offset="0.144" stopColor={LIGHT} />
              <Stop offset="0.769" stopColor={DARK} />
            </SvgLinearGradient>
          </Defs>

          {/* Background rounded rect */}
          <Rect width="450" height="450" rx="100" fill="url(#bgGrad)" />

          {/* House silhouette */}
          <Path fillRule="evenodd" clipRule="evenodd" d={HOUSE_D} fill={WHITE} />
        </Svg>

        {/* ── Genie layer (Pixar bounce — hops vertically) ─────── */}
        <Animated.View style={{
          position: 'absolute',
          top: 0,
          left: 0,
          transform: [
            { translateX: genieShakeX },
            { translateY: genieBounceY },
            { scaleY: genieScaleY },
          ],
        }}>
          <Svg width={size} height={size} viewBox="0 0 450 450">
            <Defs>
              <SvgLinearGradient id="genieGrad2" x1="225.6" y1="176" x2="225.6" y2="327" gradientUnits="userSpaceOnUse">
                <Stop offset="0.317" stopColor={LIGHT} />
                <Stop offset="0.861" stopColor={DARK} />
              </SvgLinearGradient>
            </Defs>

            {/* Genie character */}
            <Path d={GENIE_D} fill="url(#genieGrad2)" />
          </Svg>
        </Animated.View>
      </Animated.View>

      {/* ── Blue dot pulse overlay ─────────────────────────────── */}
      <Animated.View style={{
        position: 'absolute',
        opacity: Animated.multiply(dotPulse, climaxLamp),
      }}>
        <Svg width={size} height={size} viewBox="0 0 450 450">
          {/* Glow ring */}
          <Circle cx="225" cy="110.548" r="18" fill={DOT} opacity={0.25} />
          {/* Core dot */}
          <Circle cx="225" cy="110.548" r="10" fill={DOT} />
        </Svg>
      </Animated.View>

      {/* ── Climax white flash overlay (covers everything briefly) ─── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size * 2.4,
          height: size * 2.4,
          borderRadius: size * 1.2,
          backgroundColor: WHITE,
          opacity: whiteFlash,
        }}
      />
    </View>
  );
}
