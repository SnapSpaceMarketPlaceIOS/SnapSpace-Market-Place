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
 */
export default function CardImage({ uri, style, placeholderColor = '#D0D7E3', resizeMode = 'cover' }) {
  const [err, setErr] = useState(false);

  if (uri && !err) {
    return (
      <Image
        source={{ uri }}
        style={style}
        resizeMode={resizeMode}
        onError={() => setErr(true)}
      />
    );
  }
  return <View style={[style, { backgroundColor: placeholderColor }]} />;
}
