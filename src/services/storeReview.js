/**
 * storeReview.js — wrapper around the in-app rating prompt.
 *
 * Strategy:
 *   1. If `expo-store-review` is installed AND the OS reports the
 *      SKStoreReviewController is available, use it. This shows Apple's
 *      native in-app rating sheet — user picks stars, optionally writes
 *      text, submits without leaving the app, review goes live on the
 *      App Store. Best UX, highest conversion.
 *
 *   2. Otherwise, deep-link to the App Store's write-review composer
 *      via `itms-apps://...?action=write-review` (the same pattern the
 *      Profile → Rate Us flow uses). User leaves the app to write the
 *      review, but the action still works. Used as a graceful fallback
 *      when expo-store-review isn't yet installed in the dev client.
 *
 * Optional require: try-catch around the require so the JS bundle
 * loads cleanly whether or not the package is installed. Lets us ship
 * the calling code in builds that don't yet have expo-store-review +
 * the matching dev client; once the dep is in, the native path lights
 * up automatically. NO new native dep means NO build-pipeline change
 * required to ship this file's JS, only the package.json bump.
 *
 * Apple's rate limits — `requestReview()` is gated by the OS to ~3
 * attempts per app per user per 365-day rolling window. We cannot
 * detect whether the OS actually showed the sheet or silently
 * suppressed it; we just call and trust Apple. Our pre-prompt modal
 * stops here before triggering, so we don't burn Apple's quota on
 * users who weren't going to engage anyway.
 *
 * Privacy / what we CAN'T know — Apple's privacy model prohibits the
 * app from learning whether a user submitted a review, what rating
 * they gave, or even whether the sheet was shown. The only signal we
 * own is "user tapped 'Leave a Review' on our pre-prompt." Callers
 * that want analytics should log on the tap, not on this function's
 * return value.
 */

import { safeOpenURL } from '../utils/safeOpenURL';

// Optional require — survives a missing package.
let StoreReview = null;
try {
  // eslint-disable-next-line global-require
  StoreReview = require('expo-store-review');
} catch (e) {
  if (__DEV__) {
    console.log(
      '[storeReview] expo-store-review not installed — will use App Store URL fallback. ' +
      'Add `expo-store-review` to package.json + rebuild the dev client to enable the ' +
      'native in-app rating sheet.'
    );
  }
}

// App Store ID lives in env (set once the app is live). Until then the
// itms-apps:// URL has no app id to deep-link to and the fallback
// no-ops cleanly.
const APP_STORE_ID = process.env.EXPO_PUBLIC_APP_STORE_ID || '';
const HAS_APP_STORE_ID = /^\d+$/.test(APP_STORE_ID);
const APP_STORE_REVIEW_URL = HAS_APP_STORE_ID
  ? `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`
  : null;
const APP_STORE_URL = HAS_APP_STORE_ID
  ? `https://apps.apple.com/app/id${APP_STORE_ID}`
  : null;

/**
 * Ask the OS to show the in-app rating sheet.
 *
 * @returns {Promise<'native'|'fallback'|'unavailable'>}
 *   'native'      — SKStoreReviewController.requestReview() called
 *   'fallback'    — opened the App Store review URL
 *   'unavailable' — neither path works (no expo-store-review AND no
 *                   APP_STORE_ID configured)
 */
export async function requestNativeReview() {
  // Path 1 — native in-app rating sheet.
  if (StoreReview && typeof StoreReview.isAvailableAsync === 'function') {
    try {
      const available = await StoreReview.isAvailableAsync();
      if (available && typeof StoreReview.requestReview === 'function') {
        await StoreReview.requestReview();
        return 'native';
      }
    } catch (e) {
      if (__DEV__) console.warn('[storeReview] native path failed:', e?.message || e);
    }
  }

  // Path 2 — App Store deep link.
  if (APP_STORE_REVIEW_URL) {
    const opened = await safeOpenURL(APP_STORE_REVIEW_URL);
    if (opened) return 'fallback';
    if (APP_STORE_URL) {
      const fallbackOpened = await safeOpenURL(APP_STORE_URL);
      if (fallbackOpened) return 'fallback';
    }
  }

  return 'unavailable';
}

/**
 * Whether ANY review path is currently usable. Useful for hiding the
 * pre-prompt entirely on environments where neither expo-store-review
 * is installed nor the App Store URL is configured (e.g. early
 * TestFlight before the App Store ID env var is set).
 */
export function isReviewAvailable() {
  if (StoreReview) return true;
  if (HAS_APP_STORE_ID) return true;
  return false;
}
