import React, { useRef } from 'react';
import { Animated, TouchableOpacity, Easing } from 'react-native';

/**
 * Drop-in wrapper that adds a scale-down press animation to any card.
 * On press-in  → scale 0.97 over 120ms ease-out
 * On press-out → spring back to 1.0 (damping 15, stiffness 300)
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
      toValue: 0.97,
      duration: 120,
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
