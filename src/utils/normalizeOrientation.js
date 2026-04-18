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
    // Force a real decode+encode by passing an explicit resize action.
    //
    // WHY WE CAN'T USE `actions: []`:
    //   Previous versions of this file used `actions: []` and claimed
    //   manipulateAsync would "always do a full decode→encode round trip"
    //   that bakes EXIF rotation into pixels. On physical iPhone 14 Pro /
    //   iOS 26 this is NOT true — the stored output file still contained
    //   sideways pixel matrices with an EXIF Orientation tag that flux-2-max
    //   ignored, causing the Build 17/18 "AI didn't read my photo" bug.
    //   Confirmed in TestFlight (Build 18 Apr 17): Replicate received room
    //   URLs whose bytes displayed sideways in the Replicate preview, and
    //   the model fell back to text+panel for a generic kitchen output.
    //
    // WHY `resize: { width: 1600 }` FIXES IT:
    //   An explicit resize forces the native module through its decode+
    //   rotate+scale+encode pipeline on every code path — no short-circuit.
    //   The output is a fresh JPEG with raw pixels in visual order and no
    //   EXIF orientation tag. flux-2-max sees the same bytes a human sees.
    //
    // WHY 1600px:
    //   flux-2-max downsamples every input to its 0.5 MP internal resolution
    //   (~707×707 for a square). Sending the full-res 4032×3024 iPhone photo
    //   (~5–8 MB base64-encoded) wastes bandwidth on the upload leg AND on
    //   the Replicate input-fetch leg with zero quality gain at the model's
    //   end. 1600×1200 (landscape) or 1600×2133 (portrait) is ~200–500 KB
    //   and preserves more than enough detail for the 0.5 MP downsample.
    //
    // Note: resize with only `width` preserves aspect ratio natively — the
    // height is computed from the source's aspect (EXIF-corrected) so the
    // result reflects the actual visual content regardless of orientation.
    const result = await manipulateAsync(
      uri,
      [{ resize: { width: 1600 } }],
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
