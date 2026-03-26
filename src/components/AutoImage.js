/**
 * AutoImage — Renders a remote image at its natural aspect ratio.
 *
 * Instead of forcing a fixed aspectRatio (e.g. 4/3), this component
 * loads the image dimensions via Image.getSize(), then sizes itself
 * to fill the available width while preserving the real height.
 *
 * Props:
 *   uri          - Remote image URL
 *   width        - Available width (defaults to screen width - 40)
 *   maxHeight    - Cap height so very tall images don't push content off screen
 *   borderRadius - Corner radius
 *   style        - Additional style for the outer wrapper
 *   placeholder  - Placeholder background color while loading
 */
import React, { useState, useEffect } from 'react';
import { View, Image, Dimensions, StyleSheet } from 'react-native';

const SCREEN_W = Dimensions.get('window').width;
const SCREEN_H = Dimensions.get('window').height;

export default function AutoImage({
  uri,
  width: propWidth,
  maxHeight,
  borderRadius = 9,
  style,
  placeholder = '#E5E7EB',
}) {
  const availableWidth = propWidth || SCREEN_W - 40; // 20px padding each side
  const heightCap = maxHeight || SCREEN_H * 0.75;

  const [dimensions, setDimensions] = useState(null);

  useEffect(() => {
    if (!uri) return;
    Image.getSize(
      uri,
      (w, h) => {
        if (w > 0 && h > 0) {
          const naturalRatio = w / h;
          let finalW = availableWidth;
          let finalH = availableWidth / naturalRatio;
          // Cap height
          if (finalH > heightCap) {
            finalH = heightCap;
            finalW = heightCap * naturalRatio;
            if (finalW > availableWidth) finalW = availableWidth;
          }
          setDimensions({ width: finalW, height: finalH });
        }
      },
      () => {
        // On error, fallback to 4:3
        setDimensions({ width: availableWidth, height: availableWidth * 0.75 });
      }
    );
  }, [uri, availableWidth, heightCap]);

  const containerStyle = {
    width: availableWidth,
    height: dimensions ? dimensions.height : availableWidth * 0.75,
    borderRadius,
    overflow: 'hidden',
    backgroundColor: placeholder,
  };

  return (
    <View style={[containerStyle, style]}>
      {uri && (
        <Image
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="cover"
        />
      )}
    </View>
  );
}
