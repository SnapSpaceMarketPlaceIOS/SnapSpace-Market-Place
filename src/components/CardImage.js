import React, { useState, useEffect, useRef } from 'react';
import { View, Image, StyleSheet } from 'react-native';

/**
 * Renders a URI image with a graceful fallback for broken/missing URLs.
 * Drop-in replacement for <Image source={{ uri }} ...> anywhere in the app.
 *
 * Props:
 *   uri              string|null  — image URL
 *   style            style        — applied to both Image and fallback View
 *   placeholderColor string       — background color when image fails (default #F3F4F6)
 *   resizeMode       string       — passed through to Image (default 'cover')
 *   compact          boolean      — when true, downscale Amazon URLs to _SL400_
 *                                   for grid/thumbnail use. PDP and other full-bleed
 *                                   contexts should leave this false (default).
 *   framed           boolean      — Build 148.6. When true, renders TWO image
 *                                   layers: a cover-mode blurred copy as the
 *                                   background fill, and a contain-mode clean
 *                                   copy in the foreground. The full image is
 *                                   visible (no aggressive crop) and the
 *                                   container has no harsh letterbox bands —
 *                                   the blurred fill provides aesthetic
 *                                   continuity behind the contained image.
 *                                   Used for AI-rendered room tiles (Explore
 *                                   Wishes grid, Profile My Wishes grid) where
 *                                   cover was cropping too aggressively and
 *                                   plain contain left visible white bands.
 *                                   `resizeMode` is ignored when framed=true.
 *
 * Build 144 — placeholder default returned to a brand-aligned cool gray
 * (#F3F4F6, matches uiColors.surface2). The Build-142 warm cream #F0EDE6
 * read as off-brand against the rest of the cool-blue UI; this restores
 * visual continuity while still being visible enough to communicate
 * "loading" rather than "blank".
 */

// React Native's iOS Image loader runs URIs through NSURLComponents, which
// can misinterpret literal `+` in a URL path as an encoded space and fetch
// the wrong key — producing a 404 that surfaces as a silent blank card.
// Pre-encoding `+` → `%2B` forces a deterministic path. Amazon's CDN (and
// every other S3-backed host in our catalog) decodes `%2B` back to `+`, so
// the fetched object is identical.
function sanitizeUri(uri) {
  if (!uri || typeof uri !== 'string') return uri;
  if (uri.indexOf('+') === -1) return uri;
  return uri.replace(/\+/g, '%2B');
}

// Compact-mode URL rewrite: every product in the catalog stores Amazon URLs
// at 1500×1500 (the `_AC_SL1500_` variant) so the PDP hero looks crisp. But
// the Explore grid renders cards at ~180×180 — loading a 1500px image is ~70×
// oversized, which on physical iPhones (lower memory + stricter image cache
// than simulators) causes iOS to throttle concurrent fetches when many cards
// are on-screen. Failed fetches surface as permanent gray placeholders.
//
// Rewriting to `_AC_SL400_` (or any `_AC_SX*_` / `_SX*_` variant) requests a
// pre-resized asset from Amazon's CDN — identical content, ~85% less data per
// card, no throttling. PDP screens leave compact=false to keep full-res.
function compactify(uri) {
  if (!uri || typeof uri !== 'string') return uri;
  return uri
    .replace(/_AC_SL\d+_/g, '_AC_SL400_')
    .replace(/_AC_SX\d+_/g, '_AC_SX400_')
    .replace(/_SX\d+_/g,    '_AC_SX400_')
    .replace(/_AC_UL\d+_/g, '_AC_SL400_');
}

export default function CardImage({
  uri,
  style,
  placeholderColor = '#F3F4F6',
  resizeMode = 'cover',
  compact = false,
  framed = false,
}) {
  const [err, setErr] = useState(false);
  // Tracks how many times we've already retried this URI. Bounded retry so
  // we don't loop forever on a genuinely 404'd asset.
  const retryCountRef = useRef(0);
  // Bumping this key on a retry remounts the underlying <Image>, which
  // forces iOS to forget any cached negative result for the URI and refetch.
  const [retryKey, setRetryKey] = useState(0);

  // When the URI prop changes (e.g. FlatList recycling a row to a different
  // product), reset error state so the new image gets a fresh chance instead
  // of inheriting the stuck `err=true` from the previous mount.
  useEffect(() => {
    setErr(false);
    retryCountRef.current = 0;
    setRetryKey(0);
  }, [uri]);

  const safeUri = sanitizeUri(compact ? compactify(uri) : uri);

  const handleError = () => {
    // Single retry attempt before giving up. Many "errors" are transient
    // throttling from Amazon's CDN under heavy concurrent load — one retry
    // a tick later usually succeeds.
    if (retryCountRef.current < 1) {
      retryCountRef.current += 1;
      setRetryKey((k) => k + 1);
      return;
    }
    setErr(true);
  };

  if (safeUri && !err) {
    // Build 148.6 — framed mode (Spotify / Instagram style).
    // Layer 1: cover-mode copy with blurRadius — fills the container,
    //          may crop aggressively, but it's blurred so the crop is
    //          invisible. Provides aesthetic background fill.
    // Layer 2: contain-mode copy on top — the FULL image is visible,
    //          no crop. Letterbox area (where there would normally be
    //          white bands) sits over the blurred copy instead.
    // Result: the user sees the entire room photo, framed by a soft
    // out-of-focus echo of the same image instead of harsh white bands.
    if (framed) {
      return (
        <View style={[style, framedStyles.wrap]}>
          <Image
            key={`bg-${retryKey}`}
            source={{ uri: safeUri }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="cover"
            blurRadius={24}
            onError={handleError}
          />
          <Image
            key={`fg-${retryKey}`}
            source={{ uri: safeUri }}
            style={StyleSheet.absoluteFillObject}
            resizeMode="contain"
          />
        </View>
      );
    }

    return (
      <Image
        key={retryKey}
        source={{ uri: safeUri }}
        style={style}
        resizeMode={resizeMode}
        onError={handleError}
      />
    );
  }
  return <View style={[style, { backgroundColor: placeholderColor }]} />;
}

// Build 148.6 — framed-mode wrapper styles. overflow:hidden ensures the
// blurred background doesn't bleed past the container's borderRadius.
const framedStyles = StyleSheet.create({
  wrap: {
    overflow: 'hidden',
    backgroundColor: '#F3F4F6', // fallback while images load
  },
});
