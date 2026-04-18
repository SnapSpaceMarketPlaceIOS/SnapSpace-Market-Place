/**
 * normalizeOrientation — bake EXIF rotation into pixels.
 *
 * Why: iOS stores landscape photos as portrait-shaped pixel matrices with an
 * EXIF Orientation tag (e.g. code 6 = "rotate 90° CW when displaying"). Most
 * downstream consumers — Supabase /render/image/, flux-2-max, browsers that
 * strip metadata on re-encode — ignore EXIF and render the raw pixels, so
 * landscape photos appear sideways.
 *
 * This helper physically rotates the JPEG bytes to match the visual
 * orientation the user captured, then re-saves without EXIF. After this,
 * every consumer handles the image correctly.
 *
 * EXIF Orientation codes (TIFF 6.0 spec):
 *   1 = normal (no-op)
 *   3 = rotated 180°
 *   6 = rotated 90° CW  (camera held landscape, home button right)
 *   8 = rotated 90° CCW (camera held landscape, home button left)
 *   2/4/5/7 = mirrored variants — stock iOS camera never produces these.
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

const ROTATION_BY_EXIF = {
  1: 0,
  3: 180,
  6: 90,
  8: -90,
};

export async function normalizeOrientation(uri, exifOrientation = 1) {
  const degrees = ROTATION_BY_EXIF[exifOrientation] ?? 0;
  if (!degrees) return uri; // already correct — skip the re-encode
  try {
    const result = await manipulateAsync(
      uri,
      [{ rotate: degrees }],
      { format: SaveFormat.JPEG, compress: 0.9 }
    );
    return result.uri;
  } catch (err) {
    // If the rotate fails for any reason, fall back to the original URI
    // rather than blocking the user. Worse to lose the photo than show it
    // sideways.
    console.warn('[normalizeOrientation] rotate failed:', err?.message || err);
    return uri;
  }
}
