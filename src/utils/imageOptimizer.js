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

const DEFAULT_QUALITY = 0.92;   // q92 JPEG — visually indistinguishable from q100
                                // at ~60% the file size. Safe for AI input.

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
  // Two-stage check so the redbox doesn't surface "Cannot find native module
  // 'ExpoImageManipulator'" on dev clients built before the dependency was added.
  // We first probe the native registry quietly via expo-modules-core; if the
  // native side isn't registered we mark missing WITHOUT triggering a require()
  // that throws to LogBox.
  try {
    // eslint-disable-next-line global-require
    const ExpoModulesCore = require('expo-modules-core');
    const probe = typeof ExpoModulesCore?.requireOptionalNativeModule === 'function'
      ? ExpoModulesCore.requireOptionalNativeModule('ExpoImageManipulator')
      : null;
    if (!probe) {
      _manipulatorMissing = true;
      console.warn(
        '[imageOptimizer] ExpoImageManipulator native module not registered — ' +
        'uploads will skip resizing (rebuild the dev client to enable).'
      );
      return null;
    }
  } catch (probeErr) {
    // expo-modules-core itself missing or older API — fall through to require()
  }
  try {
    // eslint-disable-next-line global-require
    _ImageManipulator = require('expo-image-manipulator');
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

/**
 * Resize and re-encode an image to fit within a megapixel budget.
 *
 * @param {string} uri               Local image URI to optimize
 * @param {number} [maxMegapixels=1] Target megapixel ceiling (default 1 MP)
 * @returns {Promise<{
 *   uri: string,
 *   width: number,
 *   height: number,
 *   megapixels: number,
 *   optimized: boolean,
 *   skipped: boolean,
 *   error?: string,
 * }>}
 */
export async function optimizeForGeneration(uri, maxMegapixels = 1) {
  if (!uri || typeof uri !== 'string') {
    return {
      uri: uri || '',
      width: 0,
      height: 0,
      megapixels: 0,
      optimized: false,
      skipped: false,
      error: 'invalid_uri',
    };
  }

  // ── Step 1: resolve original dimensions ──────────────────────────────────
  let origWidth = 0;
  let origHeight = 0;
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
  // We still re-encode through ImageManipulator (no resize action, just JPEG
  // re-encode) so the output codec is normalized — fixes iOS-26 AVIF bug.
  if (origWidth > 0 && origMP <= maxMegapixels) {
    try {
      const result = await ImageManipulator.manipulateAsync(
        uri,
        [], // no resize action — just re-encode
        { compress: DEFAULT_QUALITY, format: ImageManipulator.SaveFormat.JPEG },
      );
      console.log(
        `[imageOptimizer] ${origWidth}x${origHeight} (${origMP.toFixed(2)} MP) ` +
        `→ already ≤ ${maxMegapixels} MP, re-encoded as JPEG only`,
      );
      return {
        uri:        result.uri,
        width:      result.width  || origWidth,
        height:     result.height || origHeight,
        megapixels: Math.round(((result.width || origWidth) * (result.height || origHeight)) / 10_000) / 100,
        optimized:  true,
        skipped:    true, // skipped resize, but we did re-encode
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
        error: e?.message || String(e),
      };
    }
  }

  // ── Step 3: compute target dimensions preserving aspect ratio ────────────
  // scale = sqrt(target_MP / current_MP). Falling back to the native
  // manipulator auto-detect path if dimensions weren't resolvable.
  let actions;
  if (origWidth > 0 && origHeight > 0) {
    const scale = Math.sqrt(maxMegapixels / origMP);
    const newWidth  = Math.round(origWidth  * scale);
    const newHeight = Math.round(origHeight * scale);
    actions = [{ resize: { width: newWidth, height: newHeight } }];
  } else {
    // Dimensions unknown — pass a width-only resize as a best-effort fallback.
    // 1024px × auto-height is the closest we can get to "1 MP" without knowing
    // the aspect ratio. Most iPhone photos at this size land near 0.8–1.4 MP.
    actions = [{ resize: { width: 1024 } }];
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
      `(${finalMP.toFixed(2)} MP)`,
    );

    return {
      uri:        result.uri,
      width:      result.width,
      height:     result.height,
      megapixels: Math.round(finalMP * 100) / 100,
      optimized:  true,
      skipped:    false,
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
      error: e?.message || String(e),
    };
  }
}
