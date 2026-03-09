import React, { useEffect, useRef } from 'react';
import { Animated, View, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { radius } from '../constants/tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/**
 * Shimmer skeleton loader.
 * Use wherever image or text placeholders exist.
 *
 * Props:
 *   width        — pixel width  (required)
 *   height       — pixel height (required)
 *   borderRadius — override, defaults to radius.md
 *   style        — extra View style
 */
export default function Skeleton({ width, height, borderRadius = radius.md, style }) {
  const shimmer = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.timing(shimmer, {
        toValue: 1,
        duration: 1500,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [shimmer]);

  const translateX = shimmer.interpolate({
    inputRange: [0, 1],
    outputRange: [-SCREEN_WIDTH, SCREEN_WIDTH],
  });

  return (
    <View
      style={[
        styles.base,
        { width, height, borderRadius },
        style,
      ]}
    >
      <Animated.View
        style={[StyleSheet.absoluteFill, { transform: [{ translateX }] }]}
      >
        <LinearGradient
          colors={['transparent', 'rgba(241,245,249,0.9)', 'transparent']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
});
