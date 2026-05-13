/**
 * intro.js — Device-level persistence for the 6-page onboarding intro flow.
 *
 * This is the pre-auth introduction shown to brand-new installs (no signed-in
 * user, no completion flag yet). It is NOT the same as OnboardingContext —
 * that's the post-auth 3-step tutorial (chat bar, camera, genie lamp).
 *
 * Flag semantics:
 *   - Stored in AsyncStorage at key `@homegenie_intro_completed`
 *   - Set to the literal string 'true' on successful completion of the intro
 *     flow (which happens AFTER the user finishes page 6 — the gift page —
 *     not at any earlier step). Page 5 sign-in/sign-up is required before
 *     they reach page 6, so reaching the marker requires real auth.
 *   - Device-scoped, NOT account-scoped. Survives app updates. Cleared by
 *     uninstall or by AsyncStorage clear. Does NOT survive switching to a
 *     fresh device.
 *
 * Migration for existing users (Build 145):
 *   ensureIntroFlagForExistingUser() runs once at app launch. If the user is
 *   already signed in (i.e. they're an existing TestFlight tester who's
 *   updating from Build 144 or earlier), we set the flag. That way none of
 *   the current testers get unexpectedly shown the intro after they update.
 *
 *   Why a function instead of just baking the assumption "signed in =
 *   completed" into the gate logic: we want the AsyncStorage value to be
 *   the single source of truth. If a user signs out later, they still
 *   shouldn't see the intro (they've already signed in once on this
 *   device, the flag persists). A pure "is the user signed in?" check
 *   wouldn't give us that.
 *
 * Failure modes:
 *   - AsyncStorage read fails → treat as "not completed" (returns false).
 *     Worst case: a user sees the intro once after a storage glitch. They
 *     complete it, the flag is set, normal flow resumes. No data loss.
 *   - AsyncStorage write fails → swallow the error, log only in __DEV__.
 *     Worst case: the user might see the intro again on next launch. The
 *     auth state is still the ultimate gate — they can't get into the app
 *     without being signed in, so this is purely a UX hiccup, not a
 *     security or data issue.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = '@homegenie_intro_completed';

/**
 * @returns {Promise<boolean>} true if the user has finished the intro flow
 *   on this device. Defaults to false if the key is missing or the read fails.
 */
export async function isIntroCompleted() {
  try {
    const v = await AsyncStorage.getItem(KEY);
    return v === 'true';
  } catch (e) {
    if (__DEV__) console.warn('[intro] isIntroCompleted read failed:', e?.message);
    return false;
  }
}

/**
 * Mark the intro as completed for this device. Safe to call multiple times
 * (idempotent). Errors are swallowed — the intro flow should never fail-
 * close into a state the user can't escape from.
 */
export async function markIntroCompleted() {
  try {
    await AsyncStorage.setItem(KEY, 'true');
  } catch (e) {
    if (__DEV__) console.warn('[intro] markIntroCompleted write failed:', e?.message);
  }
}

/**
 * One-time migration to set the flag for users who were already signed in
 * before Build 145 shipped. Called from App.js once on launch when a signed-
 * in user is detected. Safe to call repeatedly — setItem is idempotent.
 *
 * The migration is "passive": we don't try to detect first-launch-of-this-
 * build, we just set the flag every time we see a signed-in user with the
 * flag missing. After the very first launch on Build 145, the flag is set
 * and this function becomes a quiet no-op for that user.
 */
export async function ensureIntroFlagForExistingUser(isSignedIn) {
  if (!isSignedIn) return;
  try {
    const existing = await AsyncStorage.getItem(KEY);
    if (existing !== 'true') {
      await AsyncStorage.setItem(KEY, 'true');
    }
  } catch (e) {
    if (__DEV__) console.warn('[intro] ensureIntroFlagForExistingUser failed:', e?.message);
  }
}

// ── Test / dev-only utility ──────────────────────────────────────────────
/**
 * Reset the intro flag so the flow shows again on next launch. NOT exported
 * to production UI — exists only for development testing.
 *
 * Usage from a dev console:
 *   import { __resetIntroForTesting } from './src/utils/intro';
 *   await __resetIntroForTesting();
 */
export async function __resetIntroForTesting() {
  if (!__DEV__) return;
  try {
    await AsyncStorage.removeItem(KEY);
    console.log('[intro] Flag cleared (dev only)');
  } catch (e) {
    console.warn('[intro] __resetIntroForTesting failed:', e?.message);
  }
}
