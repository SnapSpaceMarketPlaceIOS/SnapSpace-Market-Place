/**
 * Orientation helper — safe wrapper around expo-screen-orientation.
 *
 * expo-screen-orientation requires a native module (ExpoScreenOrientation)
 * that is linked into the iOS binary at build time via CocoaPods. If the
 * currently-installed dev client was compiled before the dependency was
 * added to package.json (i.e. before this PR's rebuild), importing the
 * module synchronously throws:
 *
 *   [runtime not ready]: Error: Cannot find native module 'ExpoScreenOrientation'
 *
 * …and the entire app fails to boot. That's obviously worse than landscape
 * not working on existing builds, so this helper lazily `require`s the
 * module inside a try/catch. If the native side is present, lock/unlock
 * behave normally. If it's missing, both calls become no-ops and the app
 * keeps whatever orientation the binary's Info.plist supports.
 *
 * Once the dev client is rebuilt with `eas build` (or `expo run:ios`),
 * the native module will link, tryLoad() will succeed, and landscape
 * unlocking on SnapScreen will activate automatically — no code change.
 */

let _mod = null;
let _loaded = false;

function tryLoad() {
  if (_loaded) return _mod;
  _loaded = true;
  try {
    _mod = require('expo-screen-orientation');
  } catch (e) {
    console.warn(
      '[Orientation] expo-screen-orientation native module not linked in this build. ' +
      'Rebuild the dev client to enable landscape support. lock/unlock calls will no-op.'
    );
    _mod = null;
  }
  return _mod;
}

/**
 * Lock the device to PORTRAIT_UP. No-op if the native module is missing.
 */
export async function lockPortrait() {
  const O = tryLoad();
  if (!O) return;
  try {
    await O.lockAsync(O.OrientationLock.PORTRAIT_UP);
  } catch (e) {
    console.warn('[Orientation] lockPortrait failed:', e?.message || e);
  }
}

/**
 * Unlock orientation so the device can rotate freely (used on SnapScreen
 * so users can hold the phone landscape for wide room shots). No-op if
 * the native module is missing.
 */
export async function unlockAll() {
  const O = tryLoad();
  if (!O) return;
  try {
    await O.unlockAsync();
  } catch (e) {
    console.warn('[Orientation] unlockAll failed:', e?.message || e);
  }
}
