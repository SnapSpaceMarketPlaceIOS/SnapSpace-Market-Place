/**
 * OnboardingArt — renders the illustration for an onboarding page.
 *
 * Build 145 (original): static PNG illustration rendered with <Image>.
 * Build 147 (video swap): looping silent MP4 via expo-video.
 * Build 147 (layout restructure): added fullBleed + contentFit props so
 *   the same component can serve both:
 *     • OnboardingScreen's new top-hero layout (fullBleed + contentFit:cover)
 *     • OnboardingAuthPage's shrunk-art block (default square + contain)
 *
 * Props:
 *   step          int 1-6  — picks the video source
 *   style         style    — additional style merged onto the wrapper
 *   fullBleed     bool     — true: wrapper fills its parent (parent
 *                            controls size, video covers the box).
 *                            false (default): wrapper is square 1:1.
 *   contentFit    string   — VideoView resize mode. 'contain' (default)
 *                            preserves the full frame with letterboxing.
 *                            'cover' fills the box and crops as needed.
 *
 * Slide → asset map:
 *   step 1 → slide-1.mp4 (Picture the possibilities)
 *   step 2 → slide-2.mp4 (Wish it. See it.)
 *   step 3 → slide-3.mp4 (Shop every piece)
 *   step 4 → slide-4.mp4 (Just what you need)
 *   step 5 → slide-5.mp4 (HomeGenie auth wall)
 *   step 6 → slide-7.mp4 (A gift to get you started)
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

const VIDEO_SOURCES = {
  1: require('../../assets/onboarding/videos/slide-1.mp4'),
  2: require('../../assets/onboarding/videos/slide-2.mp4'),
  3: require('../../assets/onboarding/videos/slide-3.mp4'),
  4: require('../../assets/onboarding/videos/slide-4.mp4'),
  5: require('../../assets/onboarding/videos/slide-5.mp4'),
  6: require('../../assets/onboarding/videos/slide-7.mp4'),
};

export default function OnboardingArt({ step, style, fullBleed = false, contentFit = 'contain' }) {
  const source = VIDEO_SOURCES[step] || VIDEO_SOURCES[1];

  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  const wrapperStyle = fullBleed ? styles.fullBleed : styles.square;

  return (
    <View style={[wrapperStyle, style]} pointerEvents="none">
      <VideoView
        player={player}
        style={styles.video}
        contentFit={contentFit}
        nativeControls={false}
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
  fullBleed: {
    width: '100%',
    height: '100%',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
