/**
 * normalizeOrientation — bake any EXIF rotation into raw pixels AND report
 * the true post-rotation dimensions.
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
 *   - Returns the post-rotation dimensions from manipulateAsync's result.
 *     These are the TRUE dimensions of the final JPEG bytes, not the raw
 *     capture's possibly-swapped w/h. This is critical for pickAspectRatio
 *     downstream — without it, a landscape photo whose EXIF Orientation
 *     field is undefined would be sent to flux-2-max with a portrait
 *     aspect ratio bucket, and the rendered result would be rotated 90°.
 *
 * Return contract:
 *   Always returns { uri, width, height }. On manipulation failure,
 *   returns the original uri with width/height = null so the caller can
 *   fall back to Image.getSize or skip aspect-ratio optimization.
 */

import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

export async function normalizeOrientation(uri, exifOrientation = null) {
  const tag = '[normalizeOrientation]';
  const inputInfo = { uri: String(uri).substring(0, 80), exifOrientation };

  if (!uri) {
    console.warn(tag, 'no uri provided', inputInfo);
    return { uri, width: null, height: null };
  }

  try {
    // ⚠️ DEPRECATED code path (Build 20+, 2026-04-18).
    //
    // This helper is no longer called from the generation pipeline because
    // client-side rotation via expo-image-manipulator is unreliable on
    // iPhone 14 Pro / iOS 26 — the native module does not honor EXIF on
    // decode (Builds 17–19 all shipped sideways bytes to Replicate despite
    // various attempts). The generation path now uploads original device
    // bytes with EXIF intact and relies on Supabase /render/image/ to do
    // the rotation server-side (ImageMagick, deterministic).
    //
    // Kept in the codebase as a safe dims/display-only helper for any
    // future caller that needs a "best-effort post-rotation dims" read.
    // Do NOT re-introduce this on the upload path without verified device
    // testing on iPhone 14 Pro / iOS 26.
    const result = await manipulateAsync(
      uri,
      [],
      { format: SaveFormat.JPEG, compress: 0.9 }
    );

    // Structured log — grep `[normalizeOrientation] baked` in prod logs to
    // verify the fix is still working. If result.width/height ever come back
    // null or swap-matching the input dims, the decode+rotate+encode pipeline
    // isn't running and we're shipping sideways bytes to Replicate again.
    console.log(
      tag,
      'baked',
      'exifOrientation=' + exifOrientation,
      'in=' + inputInfo.uri,
      'out=' + String(result.uri).substring(0, 80),
      'dims=' + result.width + 'x' + result.height,
      'ratio=' + (result.width && result.height
        ? (result.width / result.height).toFixed(3)
        : '(unknown)'),
    );

    // result.width/height are the TRUE post-rotation pixel dimensions.
    // For a landscape photo captured in portrait-shaped matrix + EXIF=6,
    // the input "width" might be 3024 and "height" 4032 (portrait-shape
    // pixel matrix), but the result after decode+rotate+encode will be
    // width=4032, height=3024 (actual landscape pixels). We return these
    // values so downstream code uses the real geometry, not the EXIF-
    // dependent computed swap from the raw capture.
    return {
      uri: result.uri,
      width: result.width ?? null,
      height: result.height ?? null,
    };
  } catch (err) {
    // If the manipulate fails (expo-image-manipulator native module missing
    // from the current dev-client, corrupt input, disk full, etc.) fall back
    // to the original URI rather than blocking the user. Worse to lose the
    // photo than show it sideways. Caller will fall back to Image.getSize.
    console.warn(tag, 'manipulateAsync failed — returning original URI:',
      err?.message || err, inputInfo);
    return { uri, width: null, height: null };
  }
}
