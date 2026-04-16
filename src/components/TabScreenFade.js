import React, { useRef, useCallback } from 'react';
import { Animated, Easing, StyleSheet } from 'react-native';
import { useFocusEffect, useRoute } from '@react-navigation/native';

// Subtle directional slide on tab switch.
// Name kept as "TabScreenFade" for backwards compatibility with existing
// imports in the 5 tab screens — the behavior is now a horizontal slide
// rather than a fade, but the API is unchanged.
//
// Left-to-right (Home → Explore → Wish → Cart → Profile): new screen slides
// in from the right. Right-to-left: slides in from the left. First-ever focus
// after app boot: no slide (content just appears).

// Order must match the Tab.Screen order in App.js
const TAB_ORDER = ['Home', 'Explore', 'Wish', 'Cart', 'Profile'];

// Tuning
const SLIDE_DISTANCE = 12;   // px — intentionally tiny so the motion is felt, not seen
const SLIDE_DURATION = 200;  // ms — matches typical iOS tab-switch timing
const SLIDE_EASING   = Easing.out(Easing.cubic);

// Module-level memory of the last focused tab name. Each TabScreenFade reads
// this on focus to pick slide direction, then writes its own route name back.
let lastActiveTab = null;

export default function TabScreenFade({ children, style }) {
  const route = useRoute();
  const translateX  = useRef(new Animated.Value(0)).current;
  const currentAnim = useRef(null);

  useFocusEffect(
    useCallback(() => {
      // Stop any in-flight animation so we don't fire callbacks on a
      // tear-down listener (the source of the "no listeners" warning).
      if (currentAnim.current) {
        currentAnim.current.stop();
        currentAnim.current = null;
      }

      const from = lastActiveTab != null ? TAB_ORDER.indexOf(lastActiveTab) : -1;
      const to   = TAB_ORDER.indexOf(route.name);

      if (from < 0 || from === to || to < 0) {
        // First focus ever, same-tab focus, or unknown route — no slide.
        translateX.setValue(0);
      } else {
        // to > from  → user is moving right through the tab bar, so the
        //               new screen should slide in FROM the right (+X → 0).
        // to < from  → moving left, slide in FROM the left (-X → 0).
        const startX = (to > from ? 1 : -1) * SLIDE_DISTANCE;
        translateX.setValue(startX);

        const anim = Animated.timing(translateX, {
          toValue: 0,
          duration: SLIDE_DURATION,
          easing: SLIDE_EASING,
          useNativeDriver: true,
        });
        currentAnim.current = anim;
        anim.start(({ finished }) => {
          if (finished) currentAnim.current = null;
        });
      }

      lastActiveTab = route.name;

      // Blur cleanup — kills any still-running animation so its completion
      // callback doesn't reach a detached native listener.
      return () => {
        if (currentAnim.current) {
          currentAnim.current.stop();
          currentAnim.current = null;
        }
      };
    }, [route.name])
  );

  return (
    <Animated.View style={[styles.fill, style, { transform: [{ translateX }] }]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
