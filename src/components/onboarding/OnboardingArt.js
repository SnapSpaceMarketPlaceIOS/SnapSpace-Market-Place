/**
 * OnboardingArt — renders the illustration portion of an onboarding SVG.
 *
 * The 6 source SVGs (in src/assets/onboarding/) are 440×1006 complete page
 * mockups: title text + subtitle + illustration + Continue button + Skip
 * link, all baked together. For the production onboarding screen we render
 * just the ILLUSTRATION portion via SvgXml's viewBox; the title, subtitle,
 * buttons, and skip link are built with React Native components so they're
 * tappable, the text re-flows on every device, and we avoid hardcoding the
 * exact pixel layout from the mockup.
 *
 * Illustration bounding box in the source SVGs (verified by inspection of
 * the SVG <rect> at index 1 of each file): x=4, y=359, width=432, height=432.
 * That square — the 432×432 region where the artwork lives — becomes our
 * viewBox crop.
 *
 * Sizing strategy:
 *   The component fills its parent's width. Height = width (square art).
 *   Caller controls the size by wrapping in a sized View. Aspect ratio is
 *   locked to 1:1 because that's the source artwork's aspect.
 *
 * Why SvgXml not Image:
 *   The SVGs contain crisp vector paths for outlines + embedded raster
 *   patterns for the room fills. SvgXml renders both correctly with the
 *   same crispness as react-native-svg's other primitives. Using <Image
 *   source={require('...svg')} /> would not work — RN's Image loader
 *   doesn't natively support SVG.
 *
 * Performance:
 *   Each SVG is ~1.5MB on disk. The require() resolves once at module load
 *   and the resulting string is held in memory for the life of the screen.
 *   SvgXml parses it once per mount, then re-renders are cheap.
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { SvgXml } from 'react-native-svg';
import * as FileSystem from 'expo-file-system/legacy';

// Inline the 6 SVG sources as raw strings via Metro's asset resolution.
// Metro doesn't natively serve .svg as raw text, so we require them with
// the SVG transformer config OR we declare them as text. The cleanest
// portable approach is to inline the SVG content directly in this file —
// but at ~1.5MB × 6 that bloats the JS bundle. Instead we use SVGImports
// pattern: a generated module that re-exports the strings.
//
// For Expo / Metro 0.75+, we use the standard pattern: read via Asset.
// See loadSvgXml() below — async, cached.
import { Asset } from 'expo-asset';

// Map each onboarding step (1-indexed) to its bundled SVG source.
// require() statements are statically analyzed by Metro and bundled with
// the app, so all 6 SVGs are guaranteed to be on disk after the build.
const SVG_SOURCES = {
  1: require('../../assets/onboarding/onboarding-1.svg'),
  2: require('../../assets/onboarding/onboarding-2.svg'),
  3: require('../../assets/onboarding/onboarding-3.svg'),
  4: require('../../assets/onboarding/onboarding-4.svg'),
  5: require('../../assets/onboarding/onboarding-5.svg'),
  6: require('../../assets/onboarding/onboarding-6.svg'),
};

// Module-level cache so each SVG only gets fetched + read once per app
// session, regardless of how many times the user swipes back and forth
// between pages.
const xmlCache = {};

async function loadSvgXml(step) {
  if (xmlCache[step]) return xmlCache[step];
  const asset = Asset.fromModule(SVG_SOURCES[step]);
  await asset.downloadAsync();
  const uri = asset.localUri || asset.uri;
  // FileSystem.readAsStringAsync is the codebase-standard way to read a
  // bundled asset's contents on iOS (matches the pattern used elsewhere
  // in HomeScreen + visionMatcher). fetch() on file:// URIs works on
  // iOS but the FileSystem path is more battle-tested and avoids any
  // Hermes networking edge cases on cold launch.
  const text = await FileSystem.readAsStringAsync(uri);
  xmlCache[step] = text;
  return text;
}

// Per-page illustration crops. Source SVGs are 440×1006 full-page mockups,
// but the illustration area sits at slightly different coordinates in each
// because the title + spacing varies per page. These rects were measured
// from the actual pattern-fill rects inside each SVG file (the rect that
// holds the embedded raster illustration). Using a per-page viewBox gives
// pixel-perfect crops with no padding around the artwork.
//
// Format: "minX minY width height" — passed directly to SvgXml's viewBox.
const ART_VIEWBOXES = {
  1: '4 359 432 432',
  2: '13 371 414 414',
  3: '5 355 430 430',
  4: '20 400 400 420',
  5: '16 382 405 405',
  6: '12 400 415 420',
};

export default function OnboardingArt({ step, style }) {
  const [xml, setXml] = React.useState(null);

  React.useEffect(() => {
    let cancelled = false;
    loadSvgXml(step)
      .then((text) => {
        if (!cancelled) setXml(text);
      })
      .catch(() => {
        // Silent fallback — the empty View below renders if the SVG can't
        // load, keeping the screen layout stable. Production users should
        // never hit this because the SVGs are bundled with the app.
      });
    return () => { cancelled = true; };
  }, [step]);

  if (!xml) {
    return <View style={[styles.square, style]} />;
  }

  const viewBox = ART_VIEWBOXES[step] || ART_VIEWBOXES[1];

  return (
    <View style={[styles.square, style]} pointerEvents="none">
      <SvgXml
        xml={xml}
        width="100%"
        height="100%"
        viewBox={viewBox}
        preserveAspectRatio="xMidYMid meet"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  square: {
    aspectRatio: 1,
    width: '100%',
    overflow: 'hidden',
  },
});
