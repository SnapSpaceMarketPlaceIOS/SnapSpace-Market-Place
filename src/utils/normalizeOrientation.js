/**
 * normalizeOrientation — bake any EXIF rotation into raw pixels.
 *
 * Why: iOS stores landscape photos as portrait-shaped pixel matrices with an
 * EXIF Orientation tag (e.g. code 6 = "rotate 90° CW when displaying"). Most
 * downstream consumers — Supabase /render/image/, flux-2-max, browsers that
 * strip metadata on re-encode — ignore EXIF and render the raw pixels, so
 * landscape photos appear sideways.
 *
 * Why the naive EXIF-based approach doesn't work on real devices:
 *   - expo-camera does NOT always populate `photo.exif.Orientation` on iOS 26,
 *     even when the captured pixel matrix is oriented sideways. On iPhone 14
 *     Pro in TestFlight we saw `Orientation === undefined` for landscape
 *     captures whose raw pixels were portrait-shaped. The old code defaulted
 *     to 1 (no rotation), skipped the re-encode, and uploaded sideways bytes.
 *
 * What this version does instead:
 *   - Always runs the image through `manipulateAsync`. The decoder inside
 *     expo-image-manipulator respects EXIF Orientation when reading, and the
 *     encoder writes a fresh JPEG with NO orientation metadata. The output
 *     is always raw pixels matching the visual orientation the user captured.
 *   - Does NOT depend on `exifOrientation` being populated or correct.
 *   - Dumps a structured debug line so we can verify end-to-end from device
 *     logs which branch fired for any given capture.
 *
 * Falls back to the original URI on failure so users never lose a photo.
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export async function normalizeOrientation(uri, exifOrientation = null) {
  const tag = '[normalizeOrientation]';
  const inputInfo = { uri: String(uri).substring(0, 80), exifOrientation };

  if (!uri) {
    console.warn(tag, 'no uri provided', inputInfo);
    return uri;
  }

  try {
    // Pass an empty actions array. expo-image-manipulator still decodes the
    // input (honoring EXIF orientation) and re-encodes as a fresh JPEG. The
    // output file has NO EXIF orientation tag and raw pixels in visual order.
    // This is the critical behavior: even with `actions: []`, manipulateAsync
    // always does a full decode→encode round trip on iOS (verified via v55).
    const result = await manipulateAsync(
      uri,
      [], // no transforms needed — decode/encode alone bakes rotation
      { format: SaveFormat.JPEG, compress: 0.9 }
    );

    console.log(
      tag,
      'normalized',
      'exifOrientation=' + exifOrientation,
      'in=' + inputInfo.uri,
      'out=' + String(result.uri).substring(0, 80),
      'dims=' + result.width + 'x' + result.height
    );

    return result.uri;
  } catch (err) {
    // If the manipulate fails (expo-image-manipulator native module missing
    // from the current dev-client, corrupt input, disk full, etc.) fall back
    // to the original URI rather than blocking the user. Worse to lose the
    // photo than show it sideways.
    console.warn(tag, 'manipulateAsync failed — returning original URI:',
      err?.message || err, inputInfo);
    return uri;
  }
}
