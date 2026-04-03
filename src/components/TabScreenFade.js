import React, { useRef, useCallback } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

// Fade + subtle rise animation on every tab switch.
// Wrap the outermost View in each tab screen with this component.
// Duration: 200ms · easing: ease-out · translateY: 6→0px
export default function TabScreenFade({ children, style }) {
  const opacity    = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(6)).current;

  useFocusEffect(
    useCallback(() => {
      opacity.setValue(0);
      translateY.setValue(6);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
      ]).start();
    }, [])
  );

  return (
    <Animated.View
      style={[
        styles.fill,
        style,
        { opacity, transform: [{ translateY }] },
      ]}
    >
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
