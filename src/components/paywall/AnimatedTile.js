/**
 * AnimatedTile.js — animated wrapper around a paywall card.
 *
 * Three layered behaviors, all native-driver:
 *
 *   1. **Press feedback** — onPressIn springs scale to 0.97; onPressOut
 *      springs back to 1. Subtle physical "click" the user feels.
 *
 *   2. **Conjuring pulse** — when this tile is the one being purchased
 *      (selected && isPurchasing), a slow scale loop (1.00 ↔ 1.025) runs
 *      to bridge the StoreKit/edge-fn wait. Stops cleanly when the flag
 *      flips, scale resets to 1.
 *
 *   3. **Shimmer sweep** — during the conjuring phase, a soft white
 *      gradient bar translates across the card on a 1.4s loop. The card
 *      uses overflow:hidden so the shimmer is clipped to the card edge.
 *      Telegraphs "magic happening" without distracting copy.
 *
 * All animation values are isolated to this component instance — no
 * shared state, no leaks across tile remounts. The conjuring loops are
 * stopped + the values reset in the effect cleanup so a quick cancel
 * doesn't leave a stale pulse running.
 */
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity, View } from 'react-native';

const PULSE_PERIOD_MS    = 800;   // half-cycle of scale 1.0 ↔ 1.025
const PULSE_PEAK_SCALE   = 1.025;
const SHIMMER_PERIOD_MS  = 1400;
const SHIMMER_WIDTH      = 80;

export default function AnimatedTile({
  selected,
  isPurchasing,
  onSelect,
  registerRef,
  cardWidth,
  style,
  selectedStyle,
  children,
}) {
  const pressScale = useRef(new Animated.Value(1)).current;
  const pulseScale = useRef(new Animated.Value(1)).current;
  const shimmerX   = useRef(new Animated.Value(-SHIMMER_WIDTH)).current;
  const tileRef    = useRef(null);

  // Surface the underlying View ref upward so the parent can call
  // measureInWindow on it (used to anchor the SparkleBurst origin).
  useEffect(() => {
    registerRef?.(tileRef.current);
  }, [registerRef]);

  const isConjuring = selected && isPurchasing;

  useEffect(() => {
    if (!isConjuring) return;

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseScale, {
          toValue: PULSE_PEAK_SCALE,
          duration: PULSE_PERIOD_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(pulseScale, {
          toValue: 1,
          duration: PULSE_PERIOD_MS,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    const shimmerLoop = Animated.loop(
      Animated.timing(shimmerX, {
        toValue: (cardWidth || 200) + SHIMMER_WIDTH,
        duration: SHIMMER_PERIOD_MS,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    pulseLoop.start();
    shimmerLoop.start();

    return () => {
      pulseLoop.stop();
      shimmerLoop.stop();
      pulseScale.setValue(1);
      shimmerX.setValue(-SHIMMER_WIDTH);
    };
  }, [isConjuring, cardWidth, pulseScale, shimmerX]);

  const handlePressIn = () => {
    Animated.spring(pressScale, {
      toValue: 0.97,
      tension: 400,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(pressScale, {
      toValue: 1,
      tension: 350,
      friction: 6,
      useNativeDriver: true,
    }).start();
  };

  // Multiply press × pulse so the two transforms stack rather than fight.
  const combinedScale = Animated.multiply(pressScale, pulseScale);

  return (
    <Animated.View
      ref={tileRef}
      style={{ transform: [{ scale: combinedScale }] }}
    >
      <TouchableOpacity
        activeOpacity={0.9}
        onPress={onSelect}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={[style, selected && selectedStyle]}
      >
        {children}
        {/* Shimmer is wrapped in its own absolute clip so the card's
            overflow stays visible (the existing checkBadge protrudes
            outside the card border by design). */}
        {isConjuring && (
          <View pointerEvents="none" style={styles.shimmerClip}>
            <Animated.View
              style={[
                styles.shimmer,
                {
                  width: SHIMMER_WIDTH,
                  transform: [{ translateX: shimmerX }, { skewX: '-15deg' }],
                },
              ]}
            />
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Shimmer-only clip layer. Uses absoluteFill + matching borderRadius so
  // the white sweep stays inside the card edge while the parent's other
  // children (checkBadge, content) remain free to overflow normally.
  shimmerClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    borderRadius: 16, // matches radius.lg from tokens
  },
  shimmer: {
    position: 'absolute',
    top: -10,
    bottom: -10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    shadowColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
  },
});
