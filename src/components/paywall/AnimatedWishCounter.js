/**
 * AnimatedWishCounter.js — number tick-up with scale punch.
 *
 * When the `value` prop changes, the displayed number animates from the
 * previous value up to the new value over ~600ms while the text node
 * does a subtle scale punch (1.0 → 1.18 → 1.0). The eye is drawn to the
 * counter exactly as the SparkleBurst is firing on the panel — same
 * brain moment, two synchronized cues.
 *
 * Two animations run in parallel:
 *   - Number value (JS-driven, can't native-drive text content)
 *   - Scale transform (native-driven, runs on UI thread)
 *
 * Falls back to plain text rendering when `value` is non-numeric, so
 * the call site can pass strings like "Unlimited" without conditionals.
 */
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing } from 'react-native';

const TICK_DURATION_MS  = 650;
const PUNCH_PEAK_SCALE  = 1.18;

export default function AnimatedWishCounter({ value, suffix = '', style }) {
  const isNumeric = typeof value === 'number' && Number.isFinite(value);

  const animValue   = useRef(new Animated.Value(isNumeric ? value : 0)).current;
  const scaleAnim   = useRef(new Animated.Value(1)).current;
  const prevValRef  = useRef(isNumeric ? value : null);
  const [displayed, setDisplayed] = useState(isNumeric ? value : 0);

  useEffect(() => {
    if (!isNumeric) return;
    if (value === prevValRef.current) return;

    // First mount with a real value — no animation, just sync.
    if (prevValRef.current === null) {
      prevValRef.current = value;
      setDisplayed(value);
      animValue.setValue(value);
      return;
    }

    const id = animValue.addListener(({ value: v }) => {
      setDisplayed(Math.round(v));
    });

    Animated.parallel([
      Animated.timing(animValue, {
        toValue: value,
        duration: TICK_DURATION_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: false, // text content can't be native-driven
      }),
      Animated.sequence([
        Animated.spring(scaleAnim, {
          toValue: PUNCH_PEAK_SCALE,
          tension: 360,
          friction: 6,
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 280,
          friction: 8,
          useNativeDriver: true,
        }),
      ]),
    ]).start();

    prevValRef.current = value;
    return () => animValue.removeListener(id);
  }, [value, isNumeric, animValue, scaleAnim]);

  // Non-numeric (e.g. "Unlimited") — render straight text, skip animation.
  if (!isNumeric) {
    return (
      <Animated.Text style={style}>
        {value}
        {suffix}
      </Animated.Text>
    );
  }

  return (
    <Animated.Text style={[style, { transform: [{ scale: scaleAnim }] }]}>
      {displayed}
      {suffix}
    </Animated.Text>
  );
}
