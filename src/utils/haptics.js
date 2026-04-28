/**
 * haptics.js — thin, fire-and-forget wrapper around expo-haptics.
 *
 * Goals:
 *   1. Never crash the app if the native module isn't available
 *      (e.g. Expo Go, web preview, simulator quirks).
 *   2. Single import surface so we never sprinkle Haptics.* across
 *      screens — that way swapping the underlying lib later is trivial.
 *   3. Named verbs that match user intent ("select", "success", "error")
 *      rather than physics terms ("ImpactFeedbackStyle.Light"), so the
 *      call site reads like English.
 *
 * Usage:
 *   import { hapticTap, hapticSelect, hapticSuccess, hapticError, hapticWarning } from '../utils/haptics';
 *   hapticTap();        // light impact — every-day tap on a button/card
 *   hapticSelect();     // selection change — picker, segmented control, style chip
 *   hapticSuccess();    // affirmative outcome — purchase done, design saved
 *   hapticError();      // negative outcome — purchase failed, network error
 *   hapticWarning();    // caution — quota empty, paywall about to show
 *
 * All functions are fire-and-forget. They never throw.
 */

import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

// Android implements haptics via Vibration; the patterns are coarser. We
// still call through — Apple-style soft taps degrade to a single short
// vibration which is fine. Only short-circuit on web (no-op).
const ENABLED = Platform.OS !== 'web';

function safe(fn) {
  if (!ENABLED) return;
  try {
    // expo-haptics functions return promises; we don't await — fire-and-forget.
    fn();
  } catch {
    // Swallow silently. A failed haptic should never break a tap path.
  }
}

/** Light impact — generic tap on a card, button, list row. */
export function hapticTap() {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** Medium impact — significant action: add-to-cart, generate, remix. */
export function hapticMedium() {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium));
}

/** Heavy impact — reserved for big commits (purchase confirm, sign-out). */
export function hapticHeavy() {
  safe(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy));
}

/** Selection feedback — picker scrub, segmented tab, style chip change. */
export function hapticSelect() {
  safe(() => Haptics.selectionAsync());
}

/** Success notification — purchase done, generation complete. */
export function hapticSuccess() {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Warning notification — quota near empty, action needs attention. */
export function hapticWarning() {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** Error notification — purchase failed, generation failed, network error. */
export function hapticError() {
  safe(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

export default {
  tap:      hapticTap,
  medium:   hapticMedium,
  heavy:    hapticHeavy,
  select:   hapticSelect,
  success:  hapticSuccess,
  warning:  hapticWarning,
  error:    hapticError,
};
