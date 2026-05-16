/**
 * GiftBoxReveal.js
 *
 * Cinematic 3.5-second gift box reveal animation.
 * Designed for the post-paywall reward moment where the user is granted
 * 5 free token usages. Plays once on mount; call onComplete when finished.
 *
 * Dependencies (already installed in this project):
 *   - react
 *   - react-native
 *   - react-native-svg
 *
 * Usage:
 *   import GiftBoxReveal from '../components/GiftBoxReveal';
 *   <GiftBoxReveal onComplete={() => navigation.replace('Home')} />
 *
 * Timeline (3500ms total):
 *   0.0 - 0.6s  Anticipation wobble + scale pulse
 *   0.6 - 1.0s  Intensifying shake + inner glow
 *   1.0 - 1.3s  Lid hinge-open with overshoot + bright flash
 *   1.2 - 2.6s  Token burst (5 tokens, staggered 80ms)
 *   1.2 - 3.3s  Glitter, confetti, magic rays
 *   2.8 - 3.5s  Settle / floating idle
 */

import React, { useEffect, useRef, useCallback } from 'react';
import { View, StyleSheet, Easing, Animated, Dimensions } from 'react-native';
import Svg, { G, Path, Rect, Circle, Polygon, Defs, RadialGradient, LinearGradient, Stop } from 'react-native-svg';

const AnimatedG = Animated.createAnimatedComponent(G);
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

const { width: SCREEN_W } = Dimensions.get('window');

const SCENE = 360;
const CENTER = SCENE / 2;
const BOX_W = 150;
const BOX_H = 95;
const LID_W = 170;
const LID_H = 35;

const TOKEN_TARGETS = [
  { x: -95, y: -150, rot: -160, delay: 0 },
  { x: -45, y: -205, rot: 220, delay: 80 },
  { x: 5, y: -230, rot: -90, delay: 160 },
  { x: 55, y: -200, rot: 180, delay: 240 },
  { x: 100, y: -145, rot: 320, delay: 320 },
];

const GLITTERS = [
  { x: -120, y: -180, size: 6, delay: 100 },
  { x: -60, y: -250, size: 4, delay: 250 },
  { x: 0, y: -270, size: 7, delay: 50 },
  { x: 60, y: -245, size: 5, delay: 200 },
  { x: 125, y: -175, size: 6, delay: 350 },
  { x: -150, y: -100, size: 4, delay: 400 },
  { x: 145, y: -100, size: 5, delay: 150 },
  { x: -90, y: -90, size: 3, delay: 500 },
  { x: 90, y: -90, size: 3, delay: 450 },
];

const CONFETTI = [
  { x: -75, y: -120, w: 5, h: 12, rot: -30, color: '#84ADF5', delay: 200 },
  { x: 75, y: -120, w: 5, h: 12, rot: 30, color: '#B0CFFB', delay: 250 },
  { x: -40, y: -180, w: 4, h: 10, rot: 60, color: '#CFE7FD', delay: 350 },
  { x: 40, y: -180, w: 4, h: 10, rot: -60, color: '#84ADF5', delay: 400 },
  { x: 0, y: -200, w: 5, h: 14, rot: 0, color: '#B0CFFB', delay: 150 },
];

const RAYS = [0, 45, 90, 135, 180, 225, 270, 315];

export default function GiftBoxReveal({ onComplete, size = SCREEN_W }) {
  const boxScale = useRef(new Animated.Value(1)).current;
  const boxRot = useRef(new Animated.Value(0)).current;
  const boxTransY = useRef(new Animated.Value(0)).current;
  const lidRot = useRef(new Animated.Value(0)).current;
  const lidTransY = useRef(new Animated.Value(0)).current;
  const flashScale = useRef(new Animated.Value(0)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const glowOpacity = useRef(new Animated.Value(0)).current;
  const raysOpacity = useRef(new Animated.Value(0)).current;
  const raysRot = useRef(new Animated.Value(0)).current;

  const tokenProg = useRef(TOKEN_TARGETS.map(() => new Animated.Value(0))).current;
  const glitterProg = useRef(GLITTERS.map(() => new Animated.Value(0))).current;
  const confettiProg = useRef(CONFETTI.map(() => new Animated.Value(0))).current;

  const playAnimation = useCallback(() => {
    boxScale.setValue(1);
    boxRot.setValue(0);
    boxTransY.setValue(0);
    lidRot.setValue(0);
    lidTransY.setValue(0);
    flashScale.setValue(0);
    flashOpacity.setValue(0);
    glowOpacity.setValue(0);
    raysOpacity.setValue(0);
    raysRot.setValue(0);
    tokenProg.forEach((v) => v.setValue(0));
    glitterProg.forEach((v) => v.setValue(0));
    confettiProg.forEach((v) => v.setValue(0));

    const anticipation = Animated.parallel([
      Animated.sequence([
        Animated.timing(boxScale, { toValue: 1.03, duration: 300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(boxScale, { toValue: 1, duration: 300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(boxRot, { toValue: -2, duration: 150, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(boxRot, { toValue: 2, duration: 300, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(boxRot, { toValue: 0, duration: 150, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ]);

    const shake = Animated.parallel([
      Animated.sequence([
        Animated.timing(boxRot, { toValue: -5, duration: 80, useNativeDriver: true }),
        Animated.timing(boxRot, { toValue: 5, duration: 80, useNativeDriver: true }),
        Animated.timing(boxRot, { toValue: -4, duration: 80, useNativeDriver: true }),
        Animated.timing(boxRot, { toValue: 4, duration: 80, useNativeDriver: true }),
        Animated.timing(boxRot, { toValue: 0, duration: 80, useNativeDriver: true }),
      ]),
      Animated.sequence([
        Animated.timing(boxTransY, { toValue: -4, duration: 100, useNativeDriver: true }),
        Animated.timing(boxTransY, { toValue: 0, duration: 100, useNativeDriver: true }),
        Animated.timing(boxTransY, { toValue: -3, duration: 100, useNativeDriver: true }),
        Animated.timing(boxTransY, { toValue: 0, duration: 100, useNativeDriver: true }),
      ]),
      Animated.timing(glowOpacity, { toValue: 0.7, duration: 400, useNativeDriver: true }),
    ]);

    const lidPop = Animated.parallel([
      Animated.timing(lidRot, { toValue: 75, duration: 300, easing: Easing.bezier(0.68, -0.55, 0.265, 1.55), useNativeDriver: true }),
      Animated.timing(lidTransY, { toValue: -25, duration: 300, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      Animated.sequence([
        Animated.parallel([
          Animated.timing(flashScale, { toValue: 1.5, duration: 200, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
          Animated.timing(flashOpacity, { toValue: 0.85, duration: 100, useNativeDriver: true }),
        ]),
        Animated.timing(flashOpacity, { toValue: 0, duration: 200, useNativeDriver: true }),
      ]),
      Animated.timing(raysOpacity, { toValue: 0.6, duration: 300, useNativeDriver: true }),
    ]);

    const tokenBurst = Animated.parallel(
      tokenProg.map((v, i) =>
        Animated.sequence([
          Animated.delay(TOKEN_TARGETS[i].delay),
          Animated.timing(v, { toValue: 1, duration: 1100, easing: Easing.bezier(0.22, 1, 0.36, 1), useNativeDriver: true }),
        ])
      )
    );

    const particles = Animated.parallel([
      ...glitterProg.map((v, i) =>
        Animated.sequence([
          Animated.delay(GLITTERS[i].delay),
          Animated.timing(v, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        ])
      ),
      ...confettiProg.map((v, i) =>
        Animated.sequence([
          Animated.delay(CONFETTI[i].delay),
          Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        ])
      ),
      Animated.loop(
        Animated.timing(raysRot, { toValue: 360, duration: 6000, easing: Easing.linear, useNativeDriver: true }),
        { iterations: 2 }
      ),
      Animated.sequence([
        Animated.delay(1500),
        Animated.timing(raysOpacity, { toValue: 0, duration: 600, useNativeDriver: true }),
      ]),
    ]);

    const settle = Animated.parallel([
      Animated.timing(glowOpacity, { toValue: 0, duration: 700, useNativeDriver: true }),
      Animated.timing(boxRot, { toValue: 0, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]);

    Animated.sequence([
      anticipation,
      shake,
      Animated.parallel([
        lidPop,
        Animated.sequence([Animated.delay(200), tokenBurst]),
        Animated.sequence([Animated.delay(200), particles]),
      ]),
      settle,
    ]).start(({ finished }) => {
      if (finished && typeof onComplete === 'function') {
        onComplete();
      }
    });
  }, [boxScale, boxRot, boxTransY, lidRot, lidTransY, flashScale, flashOpacity, glowOpacity, raysOpacity, raysRot, tokenProg, glitterProg, confettiProg, onComplete]);

  useEffect(() => {
    const t = setTimeout(playAnimation, 100);
    return () => clearTimeout(t);
  }, [playAnimation]);

  const boxRotInterp = boxRot.interpolate({ inputRange: [-10, 10], outputRange: ['-10deg', '10deg'] });
  const lidRotInterp = lidRot.interpolate({ inputRange: [0, 90], outputRange: ['0deg', '-90deg'] });
  const raysRotInterp = raysRot.interpolate({ inputRange: [0, 360], outputRange: ['0deg', '360deg'] });

  return (
    <View style={[styles.root, { width: size, height: size }]} pointerEvents="none">
      <Svg width={size} height={size} viewBox={`0 0 ${SCENE} ${SCENE}`}>
        <Defs>
          <RadialGradient id="bgGlow" cx="50%" cy="55%" r="55%">
            <Stop offset="0%" stopColor="#B0CFFB" stopOpacity="0.55" />
            <Stop offset="60%" stopColor="#84ADF5" stopOpacity="0.18" />
            <Stop offset="100%" stopColor="#84ADF5" stopOpacity="0" />
          </RadialGradient>
          <LinearGradient id="boxFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#3A6FD8" />
            <Stop offset="100%" stopColor="#1E4DAF" />
          </LinearGradient>
          <LinearGradient id="lidFill" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor="#4B82E8" />
            <Stop offset="100%" stopColor="#2E5DC4" />
          </LinearGradient>
          <LinearGradient id="ribbonFill" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0%" stopColor="#F4F8FF" />
            <Stop offset="100%" stopColor="#CFE0FA" />
          </LinearGradient>
          <RadialGradient id="tokenFill" cx="35%" cy="30%" r="70%">
            <Stop offset="0%" stopColor="#5C90F0" />
            <Stop offset="60%" stopColor="#1E4DAF" />
            <Stop offset="100%" stopColor="#0F2F7A" />
          </RadialGradient>
          <RadialGradient id="flashFill" cx="50%" cy="50%" r="50%">
            <Stop offset="0%" stopColor="#FFFFFF" stopOpacity="1" />
            <Stop offset="60%" stopColor="#E5F3FE" stopOpacity="0.6" />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </RadialGradient>
        </Defs>

        <AnimatedCircle cx={CENTER} cy={CENTER} r={CENTER * 0.85} fill="url(#bgGlow)" opacity={glowOpacity} />

        <AnimatedG style={{ opacity: raysOpacity, transform: [{ translateX: CENTER }, { translateY: CENTER - 20 }, { rotate: raysRotInterp }, { translateX: -CENTER }, { translateY: -(CENTER - 20) }] }}>
          {RAYS.map((deg, i) => (
            <Polygon
              key={`ray-${i}`}
              points={`${CENTER},${CENTER - 20} ${CENTER - 5},${CENTER - 160} ${CENTER + 5},${CENTER - 160}`}
              fill="#E5F3FE"
              opacity={0.35}
              transform={`rotate(${deg} ${CENTER} ${CENTER - 20})`}
            />
          ))}
        </AnimatedG>

        <AnimatedG style={{ transform: [{ translateX: CENTER }, { translateY: CENTER + BOX_H / 2 + 8 }, { scaleX: boxScale.interpolate({ inputRange: [1, 1.05], outputRange: [1, 0.92] }) }, { translateX: -CENTER }, { translateY: -(CENTER + BOX_H / 2 + 8) }] }}>
          <Circle cx={CENTER} cy={CENTER + BOX_H / 2 + 8} r={BOX_W / 2 + 10} fill="#0F2F7A" opacity={0.18} />
        </AnimatedG>

        {TOKEN_TARGETS.map((target, i) => {
          const p = tokenProg[i];
          const tx = p.interpolate({ inputRange: [0, 1], outputRange: [0, target.x] });
          const ty = p.interpolate({ inputRange: [0, 0.7, 1], outputRange: [0, target.y * 1.05, target.y] });
          const sc = p.interpolate({ inputRange: [0, 0.15, 0.4, 1], outputRange: [0, 1.15, 1.0, 1.0] });
          const rt = p.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${target.rot}deg`] });
          return (
            <AnimatedG key={`token-${i}`} style={{ transform: [{ translateX: CENTER }, { translateY: CENTER - 5 }, { translateX: tx }, { translateY: ty }, { rotate: rt }, { scale: sc }] }}>
              <Circle cx={0} cy={0} r={22} fill="url(#tokenFill)" stroke="#7FB0FF" strokeWidth={1.5} />
              <Circle cx={0} cy={0} r={16} fill="none" stroke="#B0CFFB" strokeWidth={1} opacity={0.6} />
              <Path d="M -6 -2 L 6 -2 L 4 4 L -4 4 Z M -2 -2 L -2 -6 L 2 -6 L 2 -2 Z" fill="#E5F3FE" />
            </AnimatedG>
          );
        })}

        <AnimatedG style={{ transform: [{ translateX: CENTER }, { translateY: CENTER + 20 }, { translateY: boxTransY }, { rotate: boxRotInterp }, { scale: boxScale }, { translateX: -CENTER }, { translateY: -(CENTER + 20) }] }}>
          <Rect x={CENTER - BOX_W / 2} y={CENTER + 20 - BOX_H / 2} width={BOX_W} height={BOX_H} rx={6} fill="url(#boxFill)" />
          <Rect x={CENTER - 10} y={CENTER + 20 - BOX_H / 2} width={20} height={BOX_H} fill="url(#ribbonFill)" />
          <Circle cx={CENTER} cy={CENTER + 20 - BOX_H / 2 + 4} r={9} fill="url(#ribbonFill)" />
          <Path d={`M ${CENTER} ${CENTER + 20 - BOX_H / 2 + 4} q -20 -16 -28 -4 q -2 12 28 4 Z`} fill="url(#ribbonFill)" />
          <Path d={`M ${CENTER} ${CENTER + 20 - BOX_H / 2 + 4} q 20 -16 28 -4 q 2 12 -28 4 Z`} fill="url(#ribbonFill)" />
          <Rect x={CENTER + BOX_W / 2 - 18} y={CENTER + 20 + BOX_H / 2 - 22} width={14} height={10} rx={2} fill="#E5F3FE" opacity={0.85} />
        </AnimatedG>

        <AnimatedG style={{ transform: [{ translateX: CENTER }, { translateY: CENTER + 20 - BOX_H / 2 }, { translateY: lidTransY }, { rotate: lidRotInterp }, { translateX: -CENTER }, { translateY: -(CENTER + 20 - BOX_H / 2) }] }}>
          <Rect x={CENTER - LID_W / 2} y={CENTER + 20 - BOX_H / 2 - LID_H} width={LID_W} height={LID_H} rx={6} fill="url(#lidFill)" />
          <Rect x={CENTER - 10} y={CENTER + 20 - BOX_H / 2 - LID_H} width={20} height={LID_H} fill="url(#ribbonFill)" />
        </AnimatedG>

        <AnimatedG style={{ opacity: flashOpacity, transform: [{ translateX: CENTER }, { translateY: CENTER - 5 }, { scale: flashScale }, { translateX: -CENTER }, { translateY: -(CENTER - 5) }] }}>
          <Circle cx={CENTER} cy={CENTER - 5} r={70} fill="url(#flashFill)" />
        </AnimatedG>

        {CONFETTI.map((c, i) => {
          const p = confettiProg[i];
          const tx = p.interpolate({ inputRange: [0, 1], outputRange: [0, c.x] });
          const ty = p.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, c.y * 1.1, c.y - 10] });
          const op = p.interpolate({ inputRange: [0, 0.1, 0.8, 1], outputRange: [0, 1, 1, 0] });
          const rt = p.interpolate({ inputRange: [0, 1], outputRange: [`${c.rot}deg`, `${c.rot + 180}deg`] });
          return (
            <AnimatedG key={`confetti-${i}`} style={{ opacity: op, transform: [{ translateX: CENTER }, { translateY: CENTER - 5 }, { translateX: tx }, { translateY: ty }, { rotate: rt }] }}>
              <Rect x={-c.w / 2} y={-c.h / 2} width={c.w} height={c.h} rx={1} fill={c.color} />
            </AnimatedG>
          );
        })}

        {GLITTERS.map((g, i) => {
          const p = glitterProg[i];
          const tx = p.interpolate({ inputRange: [0, 1], outputRange: [0, g.x] });
          const ty = p.interpolate({ inputRange: [0, 1], outputRange: [0, g.y - 30] });
          const sc = p.interpolate({ inputRange: [0, 0.2, 0.7, 1], outputRange: [0, 1.2, 1.0, 0.6] });
          const op = p.interpolate({ inputRange: [0, 0.15, 0.8, 1], outputRange: [0, 1, 1, 0] });
          return (
            <AnimatedG key={`glitter-${i}`} style={{ opacity: op, transform: [{ translateX: CENTER }, { translateY: CENTER - 5 }, { translateX: tx }, { translateY: ty }, { scale: sc }] }}>
              <Polygon points={`0,${-g.size} ${g.size * 0.3},${-g.size * 0.3} ${g.size},0 ${g.size * 0.3},${g.size * 0.3} 0,${g.size} ${-g.size * 0.3},${g.size * 0.3} ${-g.size},0 ${-g.size * 0.3},${-g.size * 0.3}`} fill="#FFFFFF" />
            </AnimatedG>
          );
        })}
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },
});
