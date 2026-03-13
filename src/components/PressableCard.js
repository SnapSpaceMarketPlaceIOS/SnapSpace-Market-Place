import React, { useRef } from 'react';
import { Animated, TouchableOpacity, Easing } from 'react-native';
import { motion } from '../constants/tokens';

/**
 * Drop-in wrapper that adds a scale-down press animation to any card.
 * On press-in  → scale 0.98 over 150ms ease-out  (design system spec: Part 3.2)
 * On press-out → spring back to 1.0
 *
 * Props: same as TouchableOpacity plus `animStyle` for the inner Animated.View.
 */
export default function PressableCard({
  children,
  style,
  animStyle,
  onPress,
  activeOpacity = 0.95,
  ...rest
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    Animated.timing(scale, {
      toValue: motion.cardPressScale,          // 0.98
      duration: motion.durationFast,           // 150ms
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      damping: 15,
      stiffness: 300,
      useNativeDriver: true,
    }).start();
  };

  return (
    <Animated.View style={[animStyle, { transform: [{ scale }] }]}>
      <TouchableOpacity
        style={style}
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={activeOpacity}
        {...rest}
      >
        {children}
      </TouchableOpacity>
    </Animated.View>
  );
}
