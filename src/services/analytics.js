/**
 * Analytics — single entry point for all PostHog event tracking.
 *
 * All app code calls these helpers — never the PostHog SDK directly. That
 * way:
 *   1. Event names live in EVENTS as constants and can't be typo'd across
 *      files (caught at import time, not at runtime in production).
 *   2. If we ever swap analytics providers, only this file changes.
 *   3. Helpers are no-ops when PostHog isn't initialized (e.g. dev build
 *      with no API key in .env), so they're safe to call from anywhere
 *      without guard-checks at every call site.
 *
 * Initialization model: PostHogProvider in App.js owns the client lifecycle.
 * The hook-based `usePostHog()` works inside React components. For non-
 * component code (services, context callbacks, async handlers), we expose
 * a global instance via getClient() that's set by App.js at boot via
 * registerClient().
 *
 * The phc_ token is a PUBLIC client-side key by PostHog's design — safe to
 * embed in the app bundle. Server-side keys (phx_*) are NOT used here.
 */

let _client = null;

/**
 * Called from App.js once the PostHogProvider has booted, so service-layer
 * code (e.g. AuthContext signup callbacks, IAP completion handlers) can
 * call trackEvent / identifyUser without going through React hooks.
 */
export function registerClient(client) {
  _client = client;
}

export function getClient() {
  return _client;
}

// ── Event names — single source of truth ──────────────────────────────
// Keep these as flat snake_case strings. PostHog dashboards group by
// exact-string match, so renaming an event breaks any saved chart that
// referenced the old name. Treat additions as cheap, renames as expensive.
export const EVENTS = {
  // ── Lifecycle ──
  APP_OPENED: 'app_opened',

  // ── Auth ──
  SIGNUP_COMPLETED: 'signup_completed',
  SIGNIN_COMPLETED: 'signin_completed',
  SIGNOUT: 'signout',

  // ── AI generation pipeline ──
  WISH_GENERATED: 'wish_generated',
  WISH_FAILED: 'wish_failed',
  REMIX_TAPPED: 'remix_tapped',
  STYLE_PRESET_SELECTED: 'style_preset_selected',

  // ── Commerce ──
  PRODUCT_VIEWED: 'product_viewed',
  CART_ADD: 'cart_add',
  CART_REMOVE: 'cart_remove',
  AFFILIATE_CLICKED: 'affiliate_clicked',

  // ── IAP ──
  WISH_PURCHASED: 'wish_purchased',
  SUBSCRIPTION_STARTED: 'subscription_started',
  SUBSCRIPTION_RESTORED: 'subscription_restored',

  // ── Social ──
  DESIGN_POSTED: 'design_posted',
  DESIGN_LIKED: 'design_liked',
  DESIGN_SHARED: 'design_shared',
  USER_FOLLOWED: 'user_followed',
};

/**
 * Capture a custom event. No-op if analytics isn't initialized.
 * @param {string} name        Event name — prefer EVENTS constants
 * @param {object} properties  Optional properties hash, all values must be JSON-serializable
 */
export function trackEvent(name, properties = {}) {
  if (!_client) return;
  try {
    _client.capture(name, properties);
  } catch (e) {
    // Never let analytics throw into user-facing code paths
    if (__DEV__) console.warn('[analytics] capture failed:', e?.message || e);
  }
}

/**
 * Tie subsequent events to a user. Call this on sign-in. PostHog will
 * merge anonymous events captured before sign-in into the same user.
 */
export function identifyUser(userId, traits = {}) {
  if (!_client) return;
  try {
    _client.identify(userId, traits);
  } catch (e) {
    if (__DEV__) console.warn('[analytics] identify failed:', e?.message || e);
  }
}

/**
 * Disassociate the current user from this device. Call on sign-out so
 * future anonymous events aren't attributed to the previously-signed-in
 * user.
 */
export function resetUser() {
  if (!_client) return;
  try {
    _client.reset();
  } catch (e) {
    if (__DEV__) console.warn('[analytics] reset failed:', e?.message || e);
  }
}

/**
 * Manual screen tracking — only needed for screens that aren't covered by
 * PostHogProvider's autocapture (e.g. modals or tab-bar screens that don't
 * fire the standard React Navigation focus event). For most screens, the
 * provider's `captureScreens` option does this automatically.
 */
export function trackScreen(screenName, properties = {}) {
  if (!_client) return;
  try {
    _client.screen(screenName, properties);
  } catch (e) {
    if (__DEV__) console.warn('[analytics] screen failed:', e?.message || e);
  }
}
