import React, { useState } from 'react';
import { View, Image } from 'react-native';

/**
 * Renders a URI image with a graceful fallback for broken/missing URLs.
 * Drop-in replacement for <Image source={{ uri }} ...> anywhere in the app.
 *
 * Props:
 *   uri            string|null   — image URL
 *   style          style         — applied to both Image and fallback View
 *   placeholderColor string      — background color when image fails (default #D0D7E3)
 *   resizeMode     string        — passed through to Image (default 'cover')
 *
 * Note: placeholderColor #D0D7E3 is a design system placeholder color with no
 * corresponding token — intentionally kept as a hardcoded default.
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

export default function CardImage({ uri, style, placeholderColor = '#D0D7E3', resizeMode = 'cover' }) {
  const [err, setErr] = useState(false);
  const safeUri = sanitizeUri(uri);

  if (safeUri && !err) {
    return (
      <Image
        source={{ uri: safeUri }}
        style={style}
        resizeMode={resizeMode}
        onError={() => setErr(true)}
      />
    );
  }
  return <View style={[style, { backgroundColor: placeholderColor }]} />;
}
