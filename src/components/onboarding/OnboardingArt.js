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

import React, { useEffect } from 'react';
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

export default function OnboardingArt({ step, style, fullBleed = false, contentFit = 'contain', isActive = true }) {
  const source = VIDEO_SOURCES[step] || VIDEO_SOURCES[1];

  // Build 147 v12: player no longer auto-plays in the init callback.
  // The useEffect below drives play/pause based on the isActive prop
  // so videos only run when their slide is the active one. Prevents
  // all 6 videos from playing simultaneously when FlatList mounts
  // every page on first render — user's feedback was "the animations
  // are already all playing even though the user hasn't visited the
  // 2nd/3rd/4th slide."
  const player = useVideoPlayer(source, (p) => {
    p.loop = true;
    p.muted = true;
    // Removed p.play() — handled by useEffect.
  });

  // Build 147 v12: play when slide becomes active, pause otherwise.
  // Pausing inactive videos saves GPU/decode resources. When user
  // navigates back to a previously-played slide, the video resumes
  // from wherever the player paused (or restarts the loop naturally
  // since loop:true). isActive defaults to true so the existing
  // OnboardingAuthPage usage (no isActive prop) keeps auto-playing.
  useEffect(() => {
    if (!player) return;
    if (isActive) {
      player.play();
    } else {
      player.pause();
    }
  }, [isActive, player]);

  const wrapperStyle = fullBleed ? styles.fullBleed : styles.square;

  // Build 147 v8: scale transform to crop the Higgsfield videos' baked-in
  // white margins. The renders have ~10-15% of horizontal width as white
  // padding on each side of the actual composition (lamp/person/rooms).
  // Even with contentFit:cover filling the box, those white margins are
  // PART of the video content and remain visible. Scaling 1.18× pushes
  // them off-screen so the composition fills edge-to-edge. The wrapper
  // is overflow:hidden so the scaled-up overflow gets clipped cleanly.
  // Only applied when fullBleed (the onboarding hero use case); the
  // shrunk-art use in OnboardingAuthPage skips the zoom.
  const videoStyle = fullBleed
    ? [styles.video, { transform: [{ scale: 1.18 }] }]
    : styles.video;

  return (
    <View style={[wrapperStyle, style, fullBleed && styles.clip]} pointerEvents="none">
      <VideoView
        player={player}
        style={videoStyle}
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
  // Build 147 v8: clip overflow so the scaled-up video doesn't bleed
  // into adjacent areas (status bar, divider, content block).
  clip: {
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
});
