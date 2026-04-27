import React from 'react';
import { View, StyleSheet } from 'react-native';

// Build 87 fix: TabScreenFade now renders children directly inside a plain
// View — NO transform, NO Animated wrapper. Name preserved for backwards
// compatibility with the 5 tab-screen imports.
//
// Why the slide was removed:
// The previous version wrapped every tab screen in an Animated.View with a
// `transform: [{ translateX }]` — even when the translateX value sat at 0,
// the presence of a transform style creates a separate iOS CALayer and
// compositing context. iOS hit-testing on the LOGICAL view tree can fall
// out of sync with the VISIBLE position of children inside the transformed
// layer, especially when useNativeDriver: true splits state between the
// JS thread and the native UI thread.
//
// Symptom: TouchableOpacity / Pressable inside a tab screen would visually
// receive the user's tap (the press appeared to register from the user's
// perspective) but the onPress handler never fired. Reported across:
//   - Camera + gallery icons inside the home input bar (Build 79+ era,
//     deferred multiple sessions because no architectural change inside
//     the input bar fixed it).
//   - Today's Highlight "Shop Now" + product card (Build 86 user report).
//   - Featured Products "Shop all" + individual cards (Build 86 user report).
//
// The fix is industrial: remove the transform entirely. The slide was
// documented in the original file as "intentionally tiny so the motion is
// felt, not seen" — its absence will not be perceived by users, but its
// removal restores reliable hit-testing for every TouchableOpacity inside
// every tab screen. This is also why Build 71's `df3361e` commit removed
// the input-bar's own transform wrapper for the same reason; that fix was
// scoped to one element and missed the broader root cause until now.
export default function TabScreenFade({ children, style }) {
  return <View style={[styles.fill, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
