/**
 * SnapSpace — Image Optimizer
 *
 * Resizes a local image URI down to a target megapixel budget BEFORE upload
 * so AI providers that bill per input megapixel (FAL flux-2-pro/edit) don't
 * charge $0.22+ per generation when an iPhone hands us a raw 12–24 MP photo.
 *
 * Why this matters (FAL economics):
 *   12 MP iPhone photo @ FAL = ~$0.225/gen  (rounds up: 1×$0.03 + 11×$0.015)
 *    1 MP optimized photo  @ FAL = ~$0.06/gen   (target margin: 66%)
 *
 * The function ALWAYS re-encodes to JPEG, which is also a free win on the
 * iOS-26 simulator AVIF bug: regardless of what bytes the picker hands us
 * (AVIF, HEIC, PNG, etc.), the optimizer outputs clean JPEG bytes that
 * flux-2-max / flux-2-pro accept without E006 "invalid input" rejections.
 *
 * Behavior contract:
 *   - Input  ≤ maxMegapixels  →  re-encoded as JPEG, original dimensions kept
 *                                 (avoids needless quality loss on small images
 *                                  while still normalizing the codec)
 *   - Input  > maxMegapixels  →  downscaled with aspect ratio preserved,
 *                                 re-encoded as JPEG q92
 *   - On any error  →  returns the original URI unchanged so upload never
 *                       breaks. The caller sees `optimized: false`.
 *
 * Returns:
 *   {
 *     uri:           string,   // optimized (or original on failure) URI
 *     width:         number,   // final width  in px (or 0 if unknown)
 *     height:        number,   // final height in px (or 0 if unknown)
 *     megapixels:    number,   // (width * height) / 1e6, rounded to 2 dp
 *     optimized:     boolean,  // true if we successfully ran ImageManipulator
 *     skipped:       boolean,  // true if input was already at/below target
 *     error?:        string,   // populated only on failure
 *   }
 */

import { Image } from 'react-native';
// Build 54: expo-file-system 55+ deprecated `readAsStringAsync` (and other
// legacy methods) from the top-level module — top-level imports THROW at
// runtime. Build 53's piexifjs read silently failed because of this (every
// start-telemetry row showed exif_orientation_file=null, source=picker-
// fallback, confirming the throw was caught and swallowed). The new file
// API would require refactoring; importing from the '/legacy' sub-path
// restores the exact pre-SDK-55 behavior without API migration.
import * as FileSystem from 'expo-file-system/legacy';
import piexif from 'piexifjs';

// Build 54: expose the last file-EXIF read error to callers so they can
// surface it in telemetry. Previously readFileExifOrientation returned
// null for BOTH "no EXIF found" and "read threw" cases — indistinguishable.
// Now callers can inspect this to see which failure mode they hit.
let _lastFileExifError = null;
export function getLastFileExifError() {
  return _lastFileExifError;
}

const DEFAULT_QUALITY = 0.92;   // q92 JPEG — visually indistinguishable from q100
                                // at ~60% the file size. Safe for AI input.

// ─────────────────────────────────────────────────────────────────────────────
// Build 53: readFileExifOrientation
//
// Read the REAL EXIF Orientation tag from the raw file bytes, bypassing
// expo-image-picker's asset.exif metadata which — as of iOS 26 / iPhone 14 Pro
// with expo-image-picker 55 — lies: it returns Orientation=6 for ALL captures
// regardless of how the phone was held. Build 51 telemetry confirmed this
// (both landscape AND portrait captures reported identical picker metadata:
// exif=6, picker=980×1920, uri_actual=980×1920 from Image.getSize).
//
// iPhones always encode the true orientation in the JPEG file's EXIF marker
// (APP1 segment at the start of the file). piexifjs parses that segment from
// a base64 JPEG string; we only need the first ~64 KB of the file because
// EXIF metadata always lives in the first KB or so of the JPEG header.
//
// Returns one of: 1 (normal), 3 (180°), 6 (90° CW needed), 8 (90° CCW needed),
// or null if the file can't be read / doesn't have an EXIF marker.
//
// Performance: readAsStringAsync with length=65536 + piexif.load on the result
// runs in ~10-20 ms on iPhone. Negligible compared to the upload + FAL call.
// ─────────────────────────────────────────────────────────────────────────────
export async function readFileExifOrientation(uri) {
  const data = await readFileExif(uri);
  return data?.orientation ?? null;
}

/**
 * Build 56: full EXIF read. Returns the rich fields we need to distinguish
 * landscape from portrait captures on iOS 26 / iPhone 14 Pro where the
 * Orientation tag alone is unreliable (Build 55 telemetry showed BOTH
 * landscape AND portrait captures reported Orientation=6).
 *
 * Returns null on any failure (file unreadable, no EXIF, parse error).
 * On success, returns:
 *   {
 *     orientation:      number | null,   // IFD0.Orientation (274)
 *     pixelXDimension:  number | null,   // Exif.PixelXDimension (40962) — display-oriented width
 *     pixelYDimension:  number | null,   // Exif.PixelYDimension (40963) — display-oriented height
 *     imageWidth:       number | null,   // IFD0.ImageWidth (256) — raw width
 *     imageLength:      number | null,   // IFD0.ImageLength (257) — raw height
 *     make:             string | null,   // "Apple"
 *     model:            string | null,   // e.g. "iPhone 14 Pro"
 *     software:         string | null,   // e.g. "18.2"
 *     hasMakerNote:     boolean,         // MakerNote (37500) present in Exif IFD
 *     totalKeys:        number,          // total EXIF tags found across IFDs
 *   }
 */
export async function readFileExif(uri) {
  _lastFileExifError = null;
  if (!uri || typeof uri !== 'string') {
    _lastFileExifError = 'invalid-uri';
    return null;
  }
  try {
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
      length: 65536,
      position: 0,
    });
    if (!base64) {
      _lastFileExifError = 'empty-read';
      return null;
    }

    const dataUrl = 'data:image/jpeg;base64,' + base64;
    const exifObj = piexif.load(dataUrl);

    const ifd0 = exifObj?.['0th'] || {};
    const exif = exifObj?.['Exif'] || {};

    const orientation = ifd0[piexif.ImageIFD.Orientation];
    const pixelXDimension = exif[piexif.ExifIFD.PixelXDimension];
    const pixelYDimension = exif[piexif.ExifIFD.PixelYDimension];
    const imageWidth = ifd0[piexif.ImageIFD.ImageWidth];
    const imageLength = ifd0[piexif.ImageIFD.ImageLength];
    const make = ifd0[piexif.ImageIFD.Make];
    const model = ifd0[piexif.ImageIFD.Model];
    const software = ifd0[piexif.ImageIFD.Software];
    const makerNote = exif[piexif.ExifIFD.MakerNote];

    const totalKeys =
      Object.keys(ifd0).length +
      Object.keys(exif).length +
      Object.keys(exifObj?.['GPS'] || {}).length +
      Object.keys(exifObj?.['Interop'] || {}).length;

    return {
      orientation: typeof orientation === 'number' ? orientation : null,
      pixelXDimension: typeof pixelXDimension === 'number' ? pixelXDimension : null,
      pixelYDimension: typeof pixelYDimension === 'number' ? pixelYDimension : null,
      imageWidth: typeof imageWidth === 'number' ? imageWidth : null,
      imageLength: typeof imageLength === 'number' ? imageLength : null,
      make: typeof make === 'string' ? make.replace(/\0+$/, '') : null,
      model: typeof model === 'string' ? model.replace(/\0+$/, '') : null,
      software: typeof software === 'string' ? software.replace(/\0+$/, '') : null,
      hasMakerNote: makerNote != null && (typeof makerNote === 'string' || Array.isArray(makerNote) ? makerNote.length > 0 : true),
      totalKeys,
    };
  } catch (e) {
    _lastFileExifError = String(e?.message || e).substring(0, 150);
    console.warn('[readFileExif] failed:', _lastFileExifError);
    return null;
  }
}

// ── Lazy require for expo-image-manipulator ──────────────────────────────────
// Native modules can throw at import time on dev clients that were built BEFORE
// the dependency was added. We defer the require so the rest of the app keeps
// working — if the native side is missing, optimizeForGeneration returns the
// original URI with `optimized: false` and uploads proceed un-resized (more
// expensive on FAL but functionally correct). Rebuild the dev client to enable
// real optimization.
let _ImageManipulator = null;
let _manipulatorMissing = false;
function getManipulator() {
  if (_ImageManipulator) return _ImageManipulator;
  if (_manipulatorMissing) return null;

  // Strategy: first try the expo-modules-core probe (quiet on dev clients that
  // were built before the dependency was added), then fall directly through to
  // require() regardless of probe outcome. On production / TestFlight builds the
  // native module IS registered; the old "probe-returns-null → mark missing"
  // logic was too conservative and was incorrectly skipping HEIC→JPEG conversion
  // on physical devices (Build 33 regression). We still catch probe errors
  // but no longer abort on a null probe result.
  let probeOk = false;
  try {
    // eslint-disable-next-line global-require
    const ExpoModulesCore = require('expo-modules-core');
    if (typeof ExpoModulesCore?.requireOptionalNativeModule === 'function') {
      const probe = ExpoModulesCore.requireOptionalNativeModule('ExpoImageManipulator');
      probeOk = !!probe;
    }
  } catch (probeErr) {
    // expo-modules-core missing or older API — fall through to require()
  }

  try {
    // eslint-disable-next-line global-require
    _ImageManipulator = require('expo-image-manipulator');
    if (!probeOk) {
      // Probe didn't confirm — log a dev warning but don't block, since
      // production/EAS builds always have the module even if the probe fails.
      console.warn('[imageOptimizer] ExpoImageManipulator probe negative but require succeeded — continuing');
    }
    return _ImageManipulator;
  } catch (e) {
    _manipulatorMissing = true;
    console.warn(
      '[imageOptimizer] expo-image-manipulator unavailable — uploads will skip ' +
      'resizing (rebuild the dev client to enable). Reason: ' + (e?.message || e)
    );
    return null;
  }
}

/**
 * Resolve image dimensions in pixels via React Native's Image.getSize.
 * Wrapped in a Promise so we can `await` it.
 *
 * @param {string} uri  Local file URI (file:// or content://)
 * @returns {Promise<{ width: number, height: number }>}
 */
function resolveDimensions(uri) {
  return new Promise((resolve, reject) => {
    Image.getSize(
      uri,
      (width, height) => resolve({ width, height }),
      (err) => reject(err),
    );
  });
}

// Build 45: EXIF Orientation tag → rotation degrees to pass to the
// ImageManipulator `{rotate: N}` action on iOS. Values 1/2 need no rotation.
//
// Per TIFF 6.0 spec, to display correctly:
//   1 = normal (display as-is)
//   3 = needs 180° rotation (direction-agnostic)
//   6 = needs 90° CW rotation (raw pixels are rotated 90° CCW)
//   8 = needs 90° CCW rotation (raw pixels are rotated 90° CW)
//   2/4/5/7 = mirrored variants (not produced by stock iOS camera)
//
// Build 48 correction: DESPITE expo-image-manipulator's docs implying
// positive rotate values are clockwise, on iOS 26 / iPhone 14 Pro the
// actual runtime rotates COUNTER-CLOCKWISE for positive values. This was
// confirmed empirically via Build 47 telemetry:
//   - start-telemetry saw EXIF=6 (picker returned it correctly)
//   - the uploaded bytes ended up 180° rotated from display orientation
//   - 180° off = the rotation applied was 90° CCW (same direction as raw
//     is already rotated from correct) instead of the 90° CW it should be
// Map values are therefore what we pass as `{rotate: N}` to give the
// CORRECT CCW rotation needed to land at display-correct orientation:
//   EXIF=6 → {rotate: 270} = 270° CCW = 90° CW ✓ (corrects 90° CCW raw)
//   EXIF=8 → {rotate: 90}  = 90° CCW ✓ (corrects 90° CW raw)
//   EXIF=3 → {rotate: 180} (direction-agnostic)
//
// If a future Expo SDK fixes manipulator to actually rotate CW for
// positive values on iOS, this map needs to swap back to {3:180, 6:90, 8:270}.
// Verify with the Build 47 telemetry pattern: take an EXIF=6 photo and
// check whether the uploaded bytes are upright (CW fix correct) or
// upside-down (CCW fix correct).
const EXIF_ROTATION_MAP = { 3: 180, 6: 270, 8: 90 };

/**
 * Resize and re-encode an image to fit within a megapixel budget, AND —
 * critically — bake EXIF orientation into the output pixels.
 *
 * Why orientation baking matters (Build 45 discovery):
 *   On iPhone 14 Pro / iOS 26, `expo-image-manipulator.manipulateAsync`
 *   decodes via UIImage which does NOT auto-apply EXIF rotation — but DOES
 *   strip the EXIF tag on re-encode. Output: raw (sideways) pixel matrix
 *   with `Orientation: 1` ("no rotation needed"). Every downstream consumer
 *   (Supabase /render/image/, normalize-room-photo, FAL, Replicate) sees
 *   "no rotation needed" and delivers sideways bytes to the AI model.
 *
 *   Build 44 shipped Lever B (`/render/image/` fallback URL for imgproxy
 *   auto-orient) under the assumption that EXIF survives into storage.
 *   It doesn't. `normalize-room-photo` suffered the same defeat. The only
 *   reliable fix is baking rotation into pixels BEFORE upload by passing
 *   an explicit `{rotate: N}` action to ImageManipulator based on the EXIF
 *   we captured at `ImagePicker`/`takePictureAsync` time.
 *
 *   If caller passes `exifOrientation = 1` (or omits it), behavior is
 *   identical to the Build 44 optimizer — no rotation action added.
 *
 * @param {string} uri                  Local image URI to optimize
 * @param {number} [maxMegapixels=1]    Target megapixel ceiling (default 1 MP)
 * @param {number} [exifOrientation=1]  EXIF Orientation tag from the picker
 * @returns {Promise<{
 *   uri: string,
 *   width: number,
 *   height: number,
 *   megapixels: number,
 *   optimized: boolean,
 *   skipped: boolean,
 *   rotated: boolean,
 *   error?: string,
 * }>}
 */
export async function optimizeForGeneration(uri, maxMegapixels = 1, exifOrientation = 1) {
  if (!uri || typeof uri !== 'string') {
    return {
      uri: uri || '',
      width: 0,
      height: 0,
      megapixels: 0,
      optimized: false,
      skipped: false,
      rotated: false,
      error: 'invalid_uri',
    };
  }

  // Build 45: resolve rotation action based on EXIF. Null for orientation=1/2.
  const rotationDegrees = EXIF_ROTATION_MAP[exifOrientation] || 0;
  const rotateAction = rotationDegrees ? [{ rotate: rotationDegrees }] : [];

  // ── Step 1: resolve original dimensions ──────────────────────────────────
  // For HEIC/HEIF files, Image.getSize may fail or hang on some iOS versions.
  // Skip it for those formats and jump straight to ImageManipulator which
  // uses UIImage (supports HEIC natively) and provides dimensions in the result.
  const uriLower = uri.toLowerCase();
  const isHEIC = uriLower.endsWith('.heic') || uriLower.endsWith('.heif') ||
                 uriLower.includes('.heic?') || uriLower.includes('.heif?');
  let origWidth = 0;
  let origHeight = 0;
  if (!isHEIC) {
    try {
      const dims = await resolveDimensions(uri);
      origWidth = dims.width;
      origHeight = dims.height;
    } catch (e) {
      // Image.getSize can fail on some content:// URIs or transient FS issues.
      // We continue: ImageManipulator can still decode the file and we'll just
      // skip the size-aware short-circuit below.
      console.warn('[imageOptimizer] Image.getSize failed:', e?.message || e);
    }
  } else {
    console.log('[imageOptimizer] HEIC detected — skipping Image.getSize, going straight to manipulateAsync');
  }

  const origMP = (origWidth * origHeight) / 1_000_000;

  // ── Bail out early if the native module is missing ──────────────────────
  // Returns the original URI un-resized — upload still works, just costs more
  // on FAL. Rebuild the dev client to fix this.
  const ImageManipulator = getManipulator();
  if (!ImageManipulator) {
    return {
      uri,
      width: origWidth,
      height: origHeight,
      megapixels: Math.round(origMP * 100) / 100,
      optimized: false,
      skipped: false,
      error: 'native_module_missing',
    };
  }

  // ── Step 2: short-circuit if already at/under budget ─────────────────────
  // We still re-encode through ImageManipulator — even with no resize — so
  // the output codec is normalized (fixes iOS-26 AVIF bug) AND so any
  // explicit rotate action baked into the pixel matrix actually takes effect.
  // Build 45: if EXIF orientation requires rotation, apply it here too.
  if (origWidth > 0 && origMP <= maxMegapixels) {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        rotateAction, // [] if no rotation needed, else [{rotate: 90|180|270}]
        { compress: DEFAULT_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
      );
      // After rotate by 90/270, ImageManipulator swaps width↔height. Fall
      // back to swapping origWidth/origHeight ourselves if result didn't
      // report them (shouldn't happen on iOS, belt-and-suspenders).
      const swapped = rotationDegrees === 90 || rotationDegrees === 270;
      const fallbackW = swapped ? origHeight : origWidth;
      const fallbackH = swapped ? origWidth  : origHeight;
      const finalW = result.width  || fallbackW;
      const finalH = result.height || fallbackH;
      console.log(
        `[imageOptimizer] ${origWidth}x${origHeight} (${origMP.toFixed(2)} MP) ` +
        `→ already ≤ ${maxMegapixels} MP, re-encoded as JPEG ` +
        (rotationDegrees ? `with ${rotationDegrees}° rotation (EXIF=${exifOrientation})` : 'only'),
      );
      return {
        uri:        result.uri,
        width:      finalW,
        height:     finalH,
        megapixels: Math.round((finalW * finalH) / 10_000) / 100,
        optimized:  true,
        skipped:    true, // skipped resize, but we did re-encode (and possibly rotate)
        rotated:    rotationDegrees > 0,
      };
    } catch (e) {
      console.warn('[imageOptimizer] re-encode failed, returning original:', e?.message || e);
      return {
        uri,
        width: origWidth,
        height: origHeight,
        megapixels: Math.round(origMP * 100) / 100,
        optimized: false,
        skipped: true,
        rotated: false,
        error: e?.message || String(e),
      };
    }
  }

  // ── Step 3: compute target dimensions preserving aspect ratio ────────────
  // scale = sqrt(target_MP / current_MP). Falling back to the native
  // manipulator auto-detect path if dimensions weren't resolvable.
  // Build 45: if rotation is needed, the target dims must reflect POST-rotate
  // orientation. ImageManipulator applies actions in array order, so:
  //   actions = [rotate, resize]
  // means the resize sees the rotated pixel matrix. Target dims are computed
  // from the POST-rotation (display-oriented) W/H, not the raw-buffer W/H.
  const needsSwap = rotationDegrees === 90 || rotationDegrees === 270;
  const displayW = needsSwap ? origHeight : origWidth;
  const displayH = needsSwap ? origWidth  : origHeight;
  const displayMP = (displayW * displayH) / 1_000_000;

  let actions;
  if (displayW > 0 && displayH > 0) {
    const scale = Math.sqrt(maxMegapixels / displayMP);
    const newWidth  = Math.round(displayW  * scale);
    const newHeight = Math.round(displayH * scale);
    actions = [...rotateAction, { resize: { width: newWidth, height: newHeight } }];
  } else {
    // Dimensions unknown — pass a width-only resize as a best-effort fallback.
    // 1024px × auto-height is the closest we can get to "1 MP" without knowing
    // the aspect ratio. Most iPhone photos at this size land near 0.8–1.4 MP.
    actions = [...rotateAction, { resize: { width: 1024 } }];
  }

  // ── Step 4: run the manipulation ─────────────────────────────────────────
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      actions,
      { compress: DEFAULT_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
    );

    const finalMP = (result.width * result.height) / 1_000_000;
    console.log(
      `[imageOptimizer] ${origWidth || '?'}x${origHeight || '?'} ` +
      `(${origMP.toFixed(2)} MP) → ${result.width}x${result.height} ` +
      `(${finalMP.toFixed(2)} MP)` +
      (rotationDegrees ? ` | baked ${rotationDegrees}° rotation (EXIF=${exifOrientation})` : ''),
    );

    return {
      uri:        result.uri,
      width:      result.width,
      height:     result.height,
      megapixels: Math.round(finalMP * 100) / 100,
      optimized:  true,
      skipped:    false,
      rotated:    rotationDegrees > 0,
    };
  } catch (e) {
    // Manipulator failed entirely — return original URI so the upload still
    // succeeds. The user pays the un-optimized FAL cost on this one
    // generation, which is strictly better than the upload failing.
    console.warn('[imageOptimizer] manipulateAsync failed, returning original:', e?.message || e);
    return {
      uri,
      width: origWidth,
      height: origHeight,
      megapixels: Math.round(origMP * 100) / 100,
      optimized: false,
      skipped: false,
      rotated: false,
      error: e?.message || String(e),
    };
  }
}
