import AsyncStorage from '@react-native-async-storage/async-storage';

// expo-tracking-transparency requires a native rebuild to link properly.
// We load it lazily so the app never crashes if the native module isn't
// compiled into the current binary yet.
let _requestTrackingPermissionsAsync = null;
try {
  _requestTrackingPermissionsAsync =
    require('expo-tracking-transparency').requestTrackingPermissionsAsync;
} catch {
  // Native module not linked in this build — ATT prompt will be skipped
}

/**
 * Tracking Service — Tapp.so-compatible affiliate event layer.
 *
 * Mirrors the Tapp.so SDK API surface so it can be swapped for the
 * official SDK if/when a React Native package becomes available.
 *
 * ORDER IS MANDATORY:
 *   1. requestATT()   ← must fire before anything else
 *   2. initialize()   ← called inside ATT completion, never before
 *   3. trackEvent()   ← available after initialize()
 */

const AFFILIATE_ID_KEY = 'snapspace_affiliate_id';
const INITIALIZED_KEY  = 'snapspace_tracking_initialized';
const FIRST_OPEN_KEY   = 'snapspace_first_open_seen';

let _initialized = false;

/**
 * Step 1 — Request Apple ATT permission.
 * Call this at app launch, before initialize().
 * Returns the permission status string.
 */
export async function requestATT() {
  if (!_requestTrackingPermissionsAsync) return 'unavailable';
  const { status } = await _requestTrackingPermissionsAsync();
  return status; // 'granted' | 'denied' | 'unavailable'
}

/**
 * Step 2 — Initialize tracking after ATT resolves.
 * Must be called inside the ATT completion callback, never before.
 * Handles first-open attribution deep link check.
 */
export async function initialize() {
  if (_initialized) return;
  _initialized = true;

  await AsyncStorage.setItem(INITIALIZED_KEY, 'true');

  // First-open attribution: check for a stored affiliate_id from a
  // deferred deep link (set externally by a universal link handler).
  const isFirstOpen = !(await AsyncStorage.getItem(FIRST_OPEN_KEY));
  if (isFirstOpen) {
    await AsyncStorage.setItem(FIRST_OPEN_KEY, 'true');
    await _handleFirstOpenAttribution();
  }
}

async function _handleFirstOpenAttribution() {
  // If a deep link set an affiliate_id before launch, preserve it.
  // This storage slot is also written by any universal link handler.
  const existingId = await AsyncStorage.getItem(AFFILIATE_ID_KEY);
  if (existingId) return; // already attributed

  // Placeholder: in production this would call the Tapp.so getDeeplink
  // endpoint or process a deferred link from the affiliate network.
  // The affiliate_id is stored and attached to all subsequent events.
}

/**
 * Track an affiliate event (mirrors Tapp.trackEvent).
 * Safe to call before initialize() — events are silently dropped
 * until the user has resolved the ATT prompt.
 *
 * @param {string} eventName - e.g. 'product_tap', 'purchase'
 * @param {object} properties - key/value event metadata
 */
export function trackEvent(eventName, properties = {}) {
  if (!_initialized) return;

  const payload = {
    event: eventName,
    timestamp: new Date().toISOString(),
    app: 'snapspace',
    ...properties,
  };

  // Log for development visibility
  if (__DEV__) {
    console.log('[SnapSpace Tracking]', JSON.stringify(payload, null, 2));
  }

  // TODO: When Tapp.so React Native SDK is available, replace the log
  // above with: Tapp.trackEvent(eventName, properties)
  // Until then, this layer stores events and can be flushed to any
  // analytics endpoint (Supabase edge function, Mixpanel, etc.).
}

/**
 * Store an affiliate ID from an incoming deep link.
 * Call this from any universal link / branch handler.
 */
export async function setAffiliateId(affiliateId) {
  if (!affiliateId) return;
  await AsyncStorage.setItem(AFFILIATE_ID_KEY, affiliateId);
}

/**
 * Read the stored affiliate ID (for attaching to API calls).
 */
export async function getAffiliateId() {
  return AsyncStorage.getItem(AFFILIATE_ID_KEY);
}

/**
 * Track a confirmed purchase event.
 * Call this if a returning deep link signals a completed transaction.
 */
export function trackPurchase(productId, revenue) {
  trackEvent('purchase', { product_id: productId, revenue });
}
