/**
 * OnboardingArt — renders the illustration for an onboarding page.
 *
 * Build 145 (original): static PNG illustration (onboarding-N-art.png)
 *   extracted from the source SVG mockups, rendered with <Image>.
 *
 * Build 147: replaced static images with 10-second looping silent MP4
 *   videos (Higgsfield-rendered animations). Same `step` prop contract
 *   so OnboardingScreen.js + OnboardingAuthPage.js don't change —
 *   they still pass step={1..6} and we pick the right asset.
 *
 *   Video config:
 *     • shouldPlay      true   — autoplay on mount
 *     • loop            true   — restart silently at end of 10s clip
 *     • muted           true   — silent autoplay is allowed on iOS;
 *                                 anything with audio would require a
 *                                 user-gesture tap to begin
 *     • nativeControls  false  — no play/pause/scrubber overlay; the
 *                                 video is decorative, the user advances
 *                                 with Continue / swipe / Skip
 *     • contentFit      contain — full content visible inside the 1:1
 *                                  wrapper, letterboxed if source isn't
 *                                  square. User explicitly asked for the
 *                                  full video to be visible (not cropped).
 *
 *   Aspect ratio:
 *     Wrapper stays at aspectRatio:1 (matches original Image render).
 *
 *   Slide → asset map:
 *     step 1 → slide-1.mp4 (Picture the possibilities)
 *     step 2 → slide-2.mp4 (Wish it. See it.)
 *     step 3 → slide-3.mp4 (Shop every piece)
 *     step 4 → slide-4.mp4 (Just what you need)
 *     step 5 → slide-5.mp4 (HomeGenie auth wall)
 *     step 6 → slide-7.mp4 (A gift to get you started — user's mental
 *                            model has the paywall as "slide 6", so the
 *                            gift reward is "slide 7" in their numbering;
 *                            our internal step:6 is the gift reward.)
 */

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

// Static require() of each MP4 so Metro bundles them with the app at
// build time. Resolved once at module load.
const VIDEO_SOURCES = {
  1: require('../../assets/onboarding/videos/slide-1.mp4'),
  2: require('../../assets/onboarding/videos/slide-2.mp4'),
  3: require('../../assets/onboarding/videos/slide-3.mp4'),
  4: require('../../assets/onboarding/videos/slide-4.mp4'),
  5: require('../../assets/onboarding/videos/slide-5.mp4'),
  6: require('../../assets/onboarding/videos/slide-7.mp4'),
};

export default function OnboardingArt({ step, style }) {
  const source = VIDEO_SOURCES[step] || VIDEO_SOURCES[1];

  // useVideoPlayer's setup callback configures the player ONCE when the
  // component mounts. Each OnboardingArt instance gets its own player —
  // FlatList only mounts nearby pages so we don't hold 6 simultaneous
  // AVPlayer instances except briefly during swipes.
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    p.play();
  });

  return (
    <View style={[styles.square, style]} pointerEvents="none">
      <VideoView
        player={player}
        style={styles.video}
        contentFit="contain"
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
  video: {
    width: '100%',
    height: '100%',
  },
});
