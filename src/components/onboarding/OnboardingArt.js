/**
 * OnboardingArt — renders the illustration for an onboarding page.
 *
 * Build 145, second visual pass:
 *   Replaced the original SvgXml + viewBox-crop approach with a plain
 *   <Image> that loads the artwork directly. Each onboarding-N-art.png
 *   was extracted from the corresponding source SVG's embedded raster
 *   (the 1254×1254 PNG that filled the pattern rect inside the SVG).
 *
 * Why we abandoned the SVG-crop approach:
 *   The source SVGs are full 440×1006 page mockups with title text,
 *   illustration, button, and skip link all baked into one design.
 *   Trying to crop "just the illustration" via a viewBox window produced
 *   off-center renders and visual artifacts at the edges (faint shadow
 *   rings, partial brackets). Per-page viewBox hand-tuning was fragile
 *   and never settled into a layout the user accepted.
 *
 *   The embedded PNG inside each SVG is already a clean, centered,
 *   isolated artwork at 1254×1254. Using that PNG directly with
 *   `<Image resizeMode="contain">` gives a pixel-perfect render with
 *   zero cropping logic. Native iOS image loader is also faster than
 *   SvgXml's XML parse + render path on the first paint.
 *
 * Aspect ratio:
 *   All extracted artworks are square (1254×1254). The wrapping View
 *   stays at aspectRatio: 1.
 */

import React from 'react';
import { View, Image, StyleSheet } from 'react-native';

// Static require() of each PNG so Metro bundles them with the app at
// build time. Resolved once at module load, cheap to look up at render.
const ART_SOURCES = {
  1: require('../../assets/onboarding/onboarding-1-art.png'),
  2: require('../../assets/onboarding/onboarding-2-art.png'),
  3: require('../../assets/onboarding/onboarding-3-art.png'),
  4: require('../../assets/onboarding/onboarding-4-art.png'),
  5: require('../../assets/onboarding/onboarding-5-art.png'),
  6: require('../../assets/onboarding/onboarding-6-art.png'),
};

export default function OnboardingArt({ step, style }) {
  const source = ART_SOURCES[step] || ART_SOURCES[1];
  return (
    <View style={[styles.square, style]} pointerEvents="none">
      <Image
        source={source}
        style={styles.image}
        resizeMode="contain"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  square: {
    aspectRatio: 1,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    width: '100%',
    height: '100%',
  },
});
