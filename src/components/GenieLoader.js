/**
 * GenieLoader — Branded loading animation using the HomeGenie logo.
 *
 * Build 91 — "Three Acts + The Wisp"
 *
 * The loading experience is a 3-act dopamine-driven anticipation arc that
 * escalates as generation progresses, climaxing in a burst when the result
 * is ready. Driven by an optional `progress` Animated.Value (0..1) sourced
 * from the caller's loading bar; falls back to a calm Act-II equivalent
 * when no progress is provided (e.g. boot loaders, preview screens).
 *
 * Acts:
 *   I — Awakening   (0-30%)   gentle float, 8 dim particles, faint aura, no wisp
 *   II — Granting   (30-66%)  Pixar bounce, 16 particles, mid aura, 1 wisp
 *   III — Almost    (66-100%) hover + wobble, 24 particles, bright aura, 2 wisps,
 *                              per-particle twinkle, tighter orbit radius
 *
 * Climax (caller-triggered, 400ms): lamp scales to 0, particles burst outward,
 * aura expands and fades, white flash overlay flicks. onClimaxComplete fires
 * so the caller can transition to the result image. The trigger is a
 * one-shot boolean — it should be flipped from false → true exactly once per
 * generation cycle, at the moment the result image is ready.
 *
 * Anti-regression notes:
 *   - All animations use useNativeDriver: true (opacity + transform only).
 *     No color interpolation, no layout interpolation. JS thread stays free.
 *   - Phase derivation listens to progress on the JS side. Listener fires
 *     on every value update (~60Hz when progress is animating) but only
 *     calls setState on threshold crossings (≤3 times across the 30s window).
 *   - All loops, listeners, and timers cleaned up on unmount via mountedRef
 *     + dedicated stop calls. No leaks.
 *   - When `progress` is undefined, the component behaves exactly like
 *     Build 90's GenieLoader (Act II steady state). Backwards compatible.
 *   - When `animating === false`, all loops are inert; particles render
 *     with opacity 0. Same as Build 89 boot-loader behavior.
 *
 * Props:
 *   size            — pixel diameter (default 80)
 *   animating       — boolean to start/stop (default true)
 *   style           — pass-through View styles
 *   progress        — Animated.Value 0..1 (optional). When provided, drives
 *                     the 3-act phase escalation. When omitted, stays at
 *                     Act II.
 *   climaxTrigger   — boolean (optional). Flip false → true to fire the
 *                     400ms burst sequence.
 *   onClimaxComplete— () => void callback fired after the climax animation
 *                     completes. Caller uses this to transition to the
 *                     result image.
 */
import React, { useRef, useEffect, useState } from 'react';
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
// Build 91: each particle is also assigned a `firstPhase` so Act-I shows
// 8, Act-II shows 16, Act-III shows all 24. Distribution is interleaved so
// each phase gets a mix of colors/sizes (not all-dark in Act I etc.).
const PARTICLES = [];
const PALETTE = [DARK, LIGHT, WHITE];
const SIZE_MULT = { [DARK]: 1, [LIGHT]: 1.6, [WHITE]: 2 };
for (let i = 0; i < 24; i++) {
  const color = PALETTE[i % PALETTE.length];
  // Interleave first-phase: every 3rd particle from index 0 is phase 1,
  // every 3rd from index 1 is phase 2, every 3rd from index 2 is phase 3.
  // Yields 8/8/8 split with mixed colors per phase.
  const firstPhase = (i % 3) + 1;
  PARTICLES.push({ color, sizeMult: SIZE_MULT[color], firstPhase });
}

// ── SVG path data (extracted from HomeGenie logo) ───────────────────────────

const HOUSE_D = 'M197 74.5482L79.8429 154.709C69.2396 160.878 64 168.427 64 177.444V356.814C64 374.007 86.7806 388.057 114.655 388.057H334.344C362.219 388.057 385 374.007 385 356.814V177.444C385 168.427 379.74 160.878 369.136 154.709L256.5 74.5483C227.631 57.7131 224.313 57.9218 197 74.5482Z';

const GENIE_D = 'M326.155 194.661C306.203 193.551 286.596 223.576 265.287 232.582C259.954 218.661 247.863 208.794 233.603 206.723C231.53 206.386 230.008 204.515 230.02 202.32V201.347C230.044 200.249 230.428 199.189 231.123 198.353C233.699 195.023 234.837 190.732 234.262 186.491C233.675 182.25 231.945 180 228 180C223.945 180 221.632 183.609 221.596 188.674C221.56 192.191 222.71 195.622 224.819 198.353C225.49 199.201 225.862 200.262 225.886 201.347V202.32C225.934 204.441 224.52 206.287 222.53 206.723C206.748 209.006 193.77 220.794 189.432 236.748C178 232.457 167.143 226.669 157.138 219.497C130.008 200.91 117.852 197.824 106.271 197.234C106.271 197.234 104.761 197.234 101.739 199.004L97.5928 201.372V201.385C96.2007 201.953 95.6735 205.674 96.2008 206.672C96.7161 207.67 99.1384 208.944 100.229 209.031C114.118 209.518 127.527 211.489 138.924 219.771C164.952 237.721 180.062 295.913 228.116 295.913C275.031 295.913 295.993 209.304 326.155 209.304C346.886 209.304 342.714 254.499 330.898 264.778C319.082 275.069 307.291 264.503 296.637 264.503C283.719 264.503 284.33 277.476 291.281 278.287C292.862 278.524 294.468 278.05 295.69 276.99C296.925 275.93 297.668 274.37 297.74 272.711C304.33 277.464 312.024 280.283 320.029 280.845C338.699 280.845 354 250.642 354 228.464C353.964 218.248 349.175 195.896 326.155 194.661ZM262.64 247.836C251.579 251.878 239.943 253.936 228.21 253.923C216.502 253.923 204.878 251.877 193.818 247.873C190.93 246.888 189.324 243.67 190.235 240.639C202.326 245.591 215.196 248.123 228.186 248.11C241.176 248.098 254.058 245.566 266.161 240.639C266.593 242.111 266.449 243.682 265.754 245.042C265.059 246.389 263.885 247.399 262.471 247.836H262.64ZM272.322 318.425V318.961C258.158 324.387 243.154 327.106 228.054 326.994C212.955 327.144 197.964 324.462 183.774 319.061V318.524C184.302 316.204 185.704 314.196 187.669 312.973C189.634 311.751 191.995 311.414 194.212 312.038C201.378 314.532 209.275 312.088 213.972 305.925C215.099 304.341 215.974 302.582 216.561 300.711C220.3 301.522 224.098 301.921 227.921 301.921C231.732 301.909 235.519 301.397 239.198 300.374C240.552 305.152 243.763 309.119 248.053 311.339C252.343 313.547 257.316 313.809 261.798 312.038C264.003 311.414 266.364 311.763 268.317 312.986C270.282 314.208 271.673 316.204 272.2 318.524L272.322 318.425Z';

// ── Component ───────────────────────────────────────────────────────────────

export default function GenieLoader({
  size = 80,
  animating = true,
  style,
  progress,           // Animated.Value 0..1 (optional)
  climaxTrigger,      // boolean (optional) — flip false→true to fire the burst
  onClimaxComplete,   // () => void
}) {
  // ── Animated values (existing) ─────────────────────────────────────────
  const genieBounceY    = useRef(new Animated.Value(0)).current;
  const genieScaleY     = useRef(new Animated.Value(1)).current;
  const genieShakeX     = useRef(new Animated.Value(0)).current;
  const breatheScale    = useRef(new Animated.Value(1)).current;
  const dotPulse        = useRef(new Animated.Value(0.4)).current;
  const orbitProgress   = useRef(new Animated.Value(0)).current;
  const particleOpacity = useRef(new Animated.Value(0)).current;

  // ── Animated values (Build 91 additions) ───────────────────────────────
  // Aura halo: a soft circle behind the lamp. Breathes via scale loop;
  // overall opacity comes from progress interpolation (set once below).
  const auraBreathe = useRef(new Animated.Value(1)).current;
  // Wisps: 2 instances. Each loop translateY 0 → -50pt + opacity 0 → 0.3 → 0.
  // wispTY[0] runs in Acts II + III; wispTY[1] runs in Act III only.
  const wispTY      = useRef([new Animated.Value(0), new Animated.Value(0)]).current;
  const wispOp      = useRef([new Animated.Value(0), new Animated.Value(0)]).current;
  // Twinkle (Act III only): each particle gets its own opacity oscillator
  // with a per-instance phase offset. Idle at 1 outside Act III.
  const twinkle     = useRef(PARTICLES.map(() => new Animated.Value(1))).current;
  // Climax: lamp scale, particle outward burst, aura expand+fade, white flash.
  const climaxLamp     = useRef(new Animated.Value(1)).current; // 1 → 0
  const climaxBurst    = useRef(new Animated.Value(0)).current; // 0 = normal, 1 = burst-out
  const climaxAura     = useRef(new Animated.Value(1)).current; // 1 → 1.8
  const climaxAuraFade = useRef(new Animated.Value(1)).current; // 1 → 0
  const whiteFlash     = useRef(new Animated.Value(0)).current; // 0 → 0.4 → 0

  // ── Loop / animation handles for cleanup ───────────────────────────────
  const introRef    = useRef(null);
  const loopRef     = useRef(null);
  const orbitRef    = useRef(null);
  const bounceRef   = useRef(null);
  const auraLoopRef = useRef(null);
  const wispLoopRefs   = useRef([null, null]);
  const twinkleLoopRefs = useRef([]);
  const climaxRef   = useRef(null);
  const mountedRef  = useRef(true);
  const orbitDurRef = useRef(5000);
  const climaxFiredRef = useRef(false);

  // ── Phase state (Build 91) ──────────────────────────────────────────────
  // 1 = Awakening, 2 = Granting, 3 = Almost There. Default to 2 so the
  // loader looks "active" when no progress is supplied (boot, preview).
  const [phase, setPhase] = useState(2);

  // Base particle size (small ones ~2px at size=100)
  const baseDot     = Math.max(2, Math.round(size * 0.018));
  // Orbit radius — slightly tighter in Act III to suggest "gathering toward
  // the lamp." Computed at render time from current phase.
  const orbitRadiusBase  = size * 0.80;
  const orbitRadiusTight = size * 0.65;
  const orbitRadius = phase === 3 ? orbitRadiusTight : orbitRadiusBase;

  // ── Progress → phase listener ──────────────────────────────────────────
  // Listens to the Animated.Value passed in by the caller. setState only
  // fires on threshold crossings (max 3 times in a typical 30s gen).
  useEffect(() => {
    if (!progress || typeof progress.addListener !== 'function') return;
    const id = progress.addListener(({ value }) => {
      const next = value < 0.30 ? 1 : value < 0.66 ? 2 : 3;
      setPhase(prev => (prev === next ? prev : next));
    });
    return () => progress.removeListener(id);
  }, [progress]);

  // ── Climax trigger ─────────────────────────────────────────────────────
  // Fires the 400ms burst exactly once per mount. Stops all running loops
  // first so they don't fight the burst. onClimaxComplete fires when done
  // so the caller can transition to the result image.
  useEffect(() => {
    if (!climaxTrigger) return;
    if (climaxFiredRef.current) return;  // one-shot per mount
    climaxFiredRef.current = true;

    // Stop all running loops (they'd visually fight the burst)
    introRef.current?.stop();
    loopRef.current?.stop();
    orbitRef.current?.stop();
    bounceRef.current?.stop();
    auraLoopRef.current?.stop();
    wispLoopRefs.current.forEach(r => r?.stop?.());
    twinkleLoopRefs.current.forEach(r => r?.stop?.());

    climaxRef.current = Animated.parallel([
      // Lamp scales down to nothing
      Animated.timing(climaxLamp, {
        toValue: 0,
        duration: 400,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      // Particles burst outward: translateY radius doubles, opacity fades
      Animated.timing(climaxBurst, {
        toValue: 1,
        duration: 400,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      // Aura scales up to 1.8× and fades
      Animated.parallel([
        Animated.timing(climaxAura, {
          toValue: 1.8,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(climaxAuraFade, {
          toValue: 0,
          duration: 400,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // White flash: ramp to 0.4 over first 100ms, decay over 300ms
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

  // Act I: gentle float (no shake, no scale change). Soft up-down breath.
  function createGentleFloat() {
    return Animated.sequence([
      Animated.timing(genieBounceY, { toValue: -1.5, duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      Animated.timing(genieBounceY, { toValue:  0,   duration: 1200, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
    ]);
  }

  // Act III: continuous hover with subtle rattle. No settle landing.
  function createHover() {
    return Animated.sequence([
      Animated.parallel([
        Animated.timing(genieBounceY, { toValue: -3, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(genieShakeX,  { toValue:  0.6, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(genieBounceY, { toValue: -1, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(genieShakeX,  { toValue: -0.6, duration: 800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ]);
  }

  function startBounceLoop() {
    if (!mountedRef.current) return;
    // Pick the lamp behavior based on current phase. Recreated each cycle
    // so phase changes mid-30s pick up the new behavior on the next loop
    // iteration (no harsh tear-down).
    let next;
    if (phase === 1)      next = createGentleFloat();
    else if (phase === 3) next = createHover();
    else                  next = createBounce();
    bounceRef.current = next;
    next.start(({ finished }) => {
      if (finished && mountedRef.current) startBounceLoop();
    });
  }

  // ── Aura breathing loop ─────────────────────────────────────────────────
  function startAuraLoop() {
    if (!mountedRef.current) return;
    auraLoopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(auraBreathe, { toValue: 1.12, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(auraBreathe, { toValue: 0.94, duration: 1800, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ])
    );
    auraLoopRef.current.start();
  }

  // ── Wisp loop: drift up + fade in & out ─────────────────────────────────
  function startWispLoop(idx, initialDelay) {
    if (!mountedRef.current) return;
    const ty = wispTY[idx];
    const op = wispOp[idx];
    ty.setValue(0);
    op.setValue(0);
    const seq = Animated.sequence([
      Animated.delay(initialDelay),
      Animated.parallel([
        Animated.timing(ty, { toValue: -50, duration: 4000, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(op, { toValue: 0.30, duration: 1500, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(op, { toValue: 0,    duration: 2500, easing: Easing.in(Easing.cubic),  useNativeDriver: true }),
        ]),
      ]),
    ]);
    wispLoopRefs.current[idx] = seq;
    seq.start(({ finished }) => {
      if (finished && mountedRef.current) startWispLoop(idx, 0);  // immediate restart after first delay
    });
  }

  // ── Twinkle loops (Act III only) ────────────────────────────────────────
  function startTwinkleLoops() {
    if (!mountedRef.current) return;
    twinkleLoopRefs.current = PARTICLES.map((_, i) => {
      const delay = (i * 73) % 1000; // pseudo-random per-particle phase offset
      const dur = 600 + (i * 31) % 600; // 600-1200ms per oscillation
      const loop = Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(twinkle[i], { toValue: 0.4, duration: dur,     easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
          Animated.timing(twinkle[i], { toValue: 1,   duration: dur,     easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      );
      loop.start();
      return loop;
    });
  }

  function stopTwinkleLoops() {
    twinkleLoopRefs.current.forEach(l => l?.stop?.());
    twinkleLoopRefs.current = [];
    twinkle.forEach(v => v.setValue(1));
  }

  // ── Phase-driven side-effects ───────────────────────────────────────────
  // Wisp[0] runs in phases 2 & 3. Wisp[1] runs in phase 3 only with offset.
  // Twinkle runs in phase 3 only.
  useEffect(() => {
    if (!animating) return;
    if (climaxFiredRef.current) return;

    // Wisp[0]
    if (phase >= 2) {
      if (!wispLoopRefs.current[0]) startWispLoop(0, 0);
    } else {
      wispLoopRefs.current[0]?.stop?.();
      wispLoopRefs.current[0] = null;
      wispTY[0].setValue(0);
      wispOp[0].setValue(0);
    }

    // Wisp[1]
    if (phase >= 3) {
      if (!wispLoopRefs.current[1]) startWispLoop(1, 1500);  // 1.5s offset for visual variety
    } else {
      wispLoopRefs.current[1]?.stop?.();
      wispLoopRefs.current[1] = null;
      wispTY[1].setValue(0);
      wispOp[1].setValue(0);
    }

    // Twinkle
    if (phase === 3) {
      if (twinkleLoopRefs.current.length === 0) startTwinkleLoops();
    } else {
      stopTwinkleLoops();
    }
  }, [phase, animating]);

  // ── Top-level animation lifecycle ───────────────────────────────────────
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

  function startAnimation() {
    // Reset all values
    genieBounceY.setValue(0);
    genieScaleY.setValue(1);
    genieShakeX.setValue(0);
    breatheScale.setValue(1);
    dotPulse.setValue(0.4);
    orbitProgress.setValue(0);
    particleOpacity.setValue(0);
    auraBreathe.setValue(1);
    climaxLamp.setValue(1);
    climaxBurst.setValue(0);
    climaxAura.setValue(1);
    climaxAuraFade.setValue(1);
    whiteFlash.setValue(0);
    twinkle.forEach(v => v.setValue(1));
    wispTY.forEach(v => v.setValue(0));
    wispOp.forEach(v => v.setValue(0));
    orbitDurRef.current = 5000;
    climaxFiredRef.current = false;

    // Intro: a single bigger Pixar bounce + mid-air shake → particle fade-in
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

    const fadeIn = Animated.timing(particleOpacity, {
      toValue: 1, duration: 250, useNativeDriver: true,
    });

    introRef.current = Animated.sequence([introBounce, fadeIn]);
    introRef.current.start(() => {
      if (!mountedRef.current) return;

      // Self-accelerating orbit
      startOrbitCycle(5000);

      // Phase-aware bounce loop
      startBounceLoop();

      // Aura breathing
      startAuraLoop();

      // Body breath + dot pulse (existing behavior)
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
    auraLoopRef.current?.stop();
    climaxRef.current?.stop();
    wispLoopRefs.current.forEach(r => r?.stop?.());
    twinkleLoopRefs.current.forEach(r => r?.stop?.());
    introRef.current = null;
    loopRef.current  = null;
    orbitRef.current = null;
    bounceRef.current = null;
    auraLoopRef.current = null;
    climaxRef.current = null;
    wispLoopRefs.current = [null, null];
    twinkleLoopRefs.current = [];

    genieBounceY.setValue(0);
    genieScaleY.setValue(1);
    genieShakeX.setValue(0);
    breatheScale.setValue(1);
    dotPulse.setValue(0.4);
    orbitProgress.setValue(0);
    particleOpacity.setValue(0);
    auraBreathe.setValue(1);
    climaxLamp.setValue(1);
    climaxBurst.setValue(0);
    climaxAura.setValue(1);
    climaxAuraFade.setValue(1);
    whiteFlash.setValue(0);
    twinkle.forEach(v => v.setValue(1));
    wispTY.forEach(v => v.setValue(0));
    wispOp.forEach(v => v.setValue(0));
    orbitDurRef.current = 5000;
  }

  // ── Phase-derived render values ─────────────────────────────────────────
  // Aura opacity: dim in Act I, brightest in Act III. Multiplied by climax
  // fade so the aura disappears smoothly during the burst.
  const auraOpacityByPhase = phase === 1 ? 0.10 : phase === 2 ? 0.20 : 0.30;
  // Aura final opacity composes phase-base × climaxAuraFade.
  const auraOpacityAnim = Animated.multiply(climaxAuraFade, auraOpacityByPhase);
  // Aura scale composes breathing × climax-burst-scale.
  const auraScaleAnim = Animated.multiply(auraBreathe, climaxAura);

  // Particle climax burst: translateY ramps from -orbitRadius to -orbitRadius * 1.5,
  // and overall opacity fades to 0 in the second half of the climax.
  const particleClimaxRadius = climaxBurst.interpolate({
    inputRange: [0, 1],
    outputRange: [-orbitRadius, -orbitRadius * 1.5],
  });
  const particleClimaxOpacity = climaxBurst.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [1, 1, 0],
  });

  // Wisp render position (anchored above lamp top, centered horizontally).
  // wispBaseX positions the wisp at lamp's spout area; the spout in the
  // SVG is roughly at viewBox X=326 / 450 ≈ 72% from left, but the lamp
  // breathes so we anchor at lamp center horizontally for stability.
  // Wisp size scales with loader size so it reads at all scales.
  const wispWidth = Math.max(4, Math.round(size * 0.10));
  const wispHeight = Math.max(6, Math.round(size * 0.16));

  return (
    <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center', overflow: 'visible' }, style]}>
      {/* ── Aura halo (behind everything) ──────────────────────────── */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: size * 1.6,
          height: size * 1.6,
          borderRadius: size * 0.8,
          backgroundColor: LIGHT,
          opacity: auraOpacityAnim,
          transform: [{ scale: auraScaleAnim }],
        }}
      />

      {/* ── Orbiting particles ─────────────────────────────────────── */}
      {PARTICLES.map(({ color, sizeMult, firstPhase }, i) => {
        const pSize = Math.max(2, Math.round(baseDot * sizeMult));
        // Particle is invisible until its first phase is reached. Once
        // visible, opacity = particleOpacity (intro fade-in) × twinkle[i]
        // (Act III oscillation) × particleClimaxOpacity (climax fade-out).
        const visible = phase >= firstPhase;
        const composedOpacity = Animated.multiply(
          Animated.multiply(particleOpacity, twinkle[i]),
          particleClimaxOpacity
        );
        return (
          <Animated.View
            key={i}
            pointerEvents="none"
            style={{
              position: 'absolute',
              width: pSize,
              height: pSize,
              opacity: visible ? composedOpacity : 0,
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

      {/* ── Wish-energy wisps (Acts II + III) ─────────────────────── */}
      {/* Anchored at top-center of the loader; drift upward + fade as
          they rise. Two instances with offset start times in Act III. */}
      {[0, 1].map(idx => (
        <Animated.View
          key={`wisp-${idx}`}
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: size * 0.14,
            left: size * 0.5 - wispWidth / 2 + (idx === 0 ? -2 : 2),
            width: wispWidth,
            height: wispHeight,
            opacity: wispOp[idx],
            transform: [{ translateY: wispTY[idx] }],
          }}
        >
          <View style={{
            width: wispWidth,
            height: wispHeight,
            borderRadius: wispWidth,
            backgroundColor: LIGHT,
            shadowColor: LIGHT,
            shadowOffset: { width: 0, height: 0 },
            shadowOpacity: 0.6,
            shadowRadius: 4,
          }} />
        </Animated.View>
      ))}

      {/* ── Logo: Base layer (bg + house — stays still) ──────────── */}
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

          <Rect width="450" height="450" rx="100" fill="url(#bgGrad)" />
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
            <Path d={GENIE_D} fill="url(#genieGrad2)" />
          </Svg>
        </Animated.View>
      </Animated.View>

      {/* ── Blue dot pulse overlay ────────────────────────────────── */}
      <Animated.View style={{
        position: 'absolute',
        opacity: Animated.multiply(dotPulse, climaxLamp),
      }}>
        <Svg width={size} height={size} viewBox="0 0 450 450">
          <Circle cx="225" cy="110.548" r="18" fill={DOT} opacity={0.25} />
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
