import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, fetchProfile, warmupEdgeFunctions } from '../services/supabase';
import { registerForPushNotifications } from '../services/notifications';
// Module-level caches live outside React state and are NOT wiped by
// AsyncStorage.multiRemove. We must call these explicit clearers on every
// auth transition so user B doesn't inherit user A's in-memory style or
// preference signals. See fullAccountReset() below.
import { clearStyleProfile } from '../services/styleDnaService';
import { clearUserPreferences } from '../utils/userPreferences';

// AsyncStorage keys that are NOT yet scoped to a specific user.
// Cleared on sign-out so the next account on this device can't inherit
// the previous user's data. (Onboarding flag is per-user and handled
// separately in OnboardingContext.)
//
// To keep the guarantee real, ANY AsyncStorage key elsewhere in the app
// that holds user-scoped data MUST appear in this list OR be namespaced
// per user-id (like the onboarding flag). Audited 2026-04-17:
//   - @snapspace_cart                       (CartContext)
//   - @snapspace_liked                      (LikedContext designs)
//   - @snapspace_liked_products             (LikedContext products)
//   - @snapspace_shared                     (SharedContext)
//   - @snapspace_order_history              (OrderHistoryContext)
//   - homegenie_style_dna                   (styleDnaService)
//   - @snapspace_user_preferences           (userPreferences)
//   - @snapspace_supplier_submitted         (SupplierApplicationScreen)
//   - snapspace_recently_viewed             (HomeScreen — reader-only today,
//                                             but if any build ever writes to
//                                             it, would bleed across accounts)
// Device-scoped (intentionally NOT cleared on signOut):
//   - @snapspace_language                   (language pref — device preference)
//   - @homegenie_notif_prefs, @homegenie_notif_push
//   - homegenie_affiliate_id                (attribution, device-wide by design)
//   - homegenie_tracking_initialized, homegenie_first_open_seen
const DEVICE_WIDE_STORAGE_KEYS = [
  '@snapspace_cart',
  '@snapspace_liked',
  '@snapspace_liked_products',
  '@snapspace_shared',
  '@snapspace_order_history',
  'homegenie_style_dna',
  '@snapspace_user_preferences',
  '@snapspace_supplier_submitted',
  'snapspace_recently_viewed',
];

/**
 * Clear EVERY user-scoped state on device: AsyncStorage keys + module-level
 * in-memory caches (style DNA, user preferences). Safe to call even if
 * nothing is currently stored.
 *
 * Why we can't just do AsyncStorage.multiRemove():
 *   styleDnaService and userPreferences both keep a module-scoped `_cache`
 *   variable that survives a signOut because it lives in the JS runtime,
 *   not in AsyncStorage. clearStyleProfile() / clearUserPreferences() null
 *   those out. Without this step, user B signs in, immediately reads the
 *   cached variable, and gets user A's taste profile.
 */
async function fullAccountReset() {
  // Step 1 — purge AsyncStorage. Best-effort; never throw.
  try {
    await AsyncStorage.multiRemove(DEVICE_WIDE_STORAGE_KEYS);
  } catch (e) {
    console.warn('[Auth] fullAccountReset multiRemove failed (non-fatal):', e?.message);
  }
  // Step 2 — null the JS-module caches. These are awaited in parallel
  // because they write separately to AsyncStorage (the multiRemove above
  // already cleared those files, but these calls also reset the in-memory
  // variables, which is the critical bit).
  await Promise.allSettled([
    clearStyleProfile(),
    clearUserPreferences(),
  ]);
}

const AuthContext = createContext();

// Wraps a promise with a timeout — rejects if the promise doesn't
// resolve within `ms` milliseconds.
function withTimeout(promise, ms, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms)
    ),
  ]);
}

// Retries an async fn up to `attempts` times with a delay between retries.
// On iOS simulators (esp. beta runtimes) the first network call can stall;
// retrying immediately after a timeout usually succeeds.
async function withRetry(fn, attempts = 3, delayMs = 500) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts - 1) await new Promise(r => setTimeout(r, delayMs));
    }
  }
  throw lastErr;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // Ref so auth state callbacks always see the current loading value
  // without stale closure issues.
  const loadingRef = useRef(true);
  // Shared "bootstrap is still authoritative" flag, readable by both the
  // bootstrap's late getSession() resolve AND the user-initiated signIn /
  // signUp / signInWithApple paths. When any user-initiated auth action
  // kicks off, it flips this to true so a late-arriving bootstrap result
  // can no longer overwrite the current user. Prevents the "signed in as
  // B but app reverts to A" race documented in the Apr 2026 bug report.
  const bootstrapSupersededRef = useRef(false);

  // Build a merged user object from Supabase session + profiles row
  const buildUser = (session, profile) => ({
    id: session.user.id,
    email: session.user.email,
    name: profile?.full_name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'HomeGenie User',
    username: profile?.username || null,
    bio: profile?.bio || null,
    avatarUrl: profile?.avatar_url || null,
    role: profile?.role || 'consumer',
    is_verified_supplier: profile?.is_verified_supplier ?? false,
    email_verified: !!session.user.email_confirmed_at || profile?.email_verified || false,
  });

  // Load session from storage and subscribe to auth state changes
  useEffect(() => {
    let mounted = true;

    const bootstrap = async () => {
      // Safety net: if getSession() hangs (no network, bad env vars), bail
      // out after 15s so the app is never stuck on the loading screen.
      //
      // Why 15s (was 8s, before that 2s): iOS post-update cold launches
      // combine a cold AsyncStorage read (2–5s on iOS 26) with Supabase's
      // autoRefreshToken network round-trip (cold DNS + TLS routinely 3–8s
      // after app update). The 8s budget was still too short on some
      // devices, leaving the user with an auth wall until force-quit.
      //
      // CRITICAL Build 25 change: after the timer fires we NO LONGER refuse
      // late-arriving sessions. Previously the `!settled` guard in the
      // finally block locked out any session that arrived after the timer —
      // so if getSession() eventually resolved at 9s, the user stayed
      // signed-out until they force-quit. Now: the timer only flips
      // loading=false (so the UI renders SOMETHING instead of the spinner),
      // but the session, if it eventually arrives, will still populate
      // setUser — UNLESS the user has taken a superseding action
      // (signIn/signUp/signOut) in the meantime, in which case
      // bootstrapSupersededRef correctly blocks the late result.
      //
      // Net behavior: signed-in users on slow networks now see the auth
      // wall briefly (~15s max) and then it auto-dismisses as the session
      // lands, instead of being trapped until force-quit.
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled && mounted) {
          console.log('[Auth] bootstrap timeout (15s) — rendering as guest, late session still allowed');
          settled = true;
          loadingRef.current = false;
          setLoading(false);
        }
      }, 15000);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        // The only reason we must skip this is if the user has taken over
        // with a signIn/signUp/signOut action — that flips
        // bootstrapSupersededRef and the late cached session must not
        // clobber the explicit user choice. Root cause of the Apr 2026
        // "signed in as B, app shows A" revert bug.
        //
        // We INTENTIONALLY do NOT gate on `!settled` anymore. If the
        // timer fired first, that just means we rendered the UI; it does
        // not mean the user's session is invalid. When it arrives late,
        // let it land so the auth wall clears.
        if (session && mounted && !bootstrapSupersededRef.current) {
          try {
            const profile = await fetchProfile(session.user.id);
            if (mounted && !bootstrapSupersededRef.current) {
              setUser(buildUser(session, profile));
            }
          } catch {
            if (mounted && !bootstrapSupersededRef.current) {
              setUser(buildUser(session, null));
            }
          }
        }
      } catch {
        // Network or config error — proceed as guest
      } finally {
        clearTimeout(timer);
        if (!settled && mounted) {
          settled = true;
          loadingRef.current = false;
          setLoading(false);
        }
      }
    };

    bootstrap();

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;
        if (session) {
          try {
            const profile = await fetchProfile(session.user.id);
            const builtUser = buildUser(session, profile);
            setUser(builtUser);
            // Register push token on first sign-in — DEFERRED by 3 seconds.
            //
            // Why deferred: SIGNED_IN fires immediately after signUp/signIn,
            // and the entire downstream Context tree (Subscription, Cart,
            // Liked, Shared, OrderHistory) simultaneously re-mounts because
            // `user.id` changed. Firing the native push-token TurboModule
            // call in the same tick as that mount storm has correlated with
            // Fabric use-after-free crashes on iPhone 14 Pro / iOS 26
            // (2026-04-18 TestFlight crash report: frame 0 = `objc_retain`
            // inside `-[RCTViewComponentView unmountChildComponentView:]`).
            //
            // A 3s delay lets the UI settle before we hand the native module
            // any work, which removes the pressure on Fabric's mount queue
            // during the most volatile moment of the app lifecycle. The
            // user never waits on push registration anyway — it's fire-and-
            // forget — so deferring has zero UX cost.
            //
            // The setTimeout callback also gets its OWN try/catch. The outer
            // `.catch(() => {})` only catches Promise rejections; a
            // synchronous Obj-C exception thrown inside the native module
            // would bypass it. Wrapping the call in a JS try ensures any
            // synchronous throw lands somewhere safe.
            if (event === 'SIGNED_IN') {
              setTimeout(() => {
                if (!mounted) return;
                try {
                  registerForPushNotifications(session.user.id).catch(() => {});
                } catch (e) {
                  console.warn('[Auth] push registration threw synchronously (non-fatal):', e?.message || e);
                }
              }, 3000);
              // Build 26: edge-fn warmup removed. It crashed RN's native
              // bridge on first-launch-post-update (see warmupEdgeFunctions
              // in services/supabase.js for the full explanation). Cold-
              // start mitigation will be reworked as a pure-JS retry at
              // the real call site in a future build.
            }
          } catch {
            setUser(buildUser(session, null));
          }
        } else {
          setUser(null);
        }
        // Use ref to avoid stale closure — always clear loading after any auth event
        if (loadingRef.current) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ─── Auth Actions ───────────────────────────────────────────────────────────

  /**
   * Create a new consumer account.
   * Returns { needsEmailVerification: true } on success.
   * Throws an Error with a user-friendly message on failure.
   */
  const signUp = async (fullName, email, password) => {
    if (!process.env.EXPO_PUBLIC_SUPABASE_URL) {
      throw new Error('App is not configured. Please contact support.');
    }

    // Any user-initiated auth action supersedes any in-flight bootstrap
    // getSession(). Without this, a late-resolving bootstrap holding the
    // PREVIOUS account's cached session would clobber the new account
    // the user is creating here, producing the "signed up as B, app
    // shows A" revert bug.
    bootstrapSupersededRef.current = true;

    // CRITICAL: Force-clear any existing session before creating a new account.
    // Supabase's signUp() with email confirmation enabled does NOT create a new
    // session — it sends a verification email and leaves the previous session
    // active. Without this, a user who "signs up" while already logged in as
    // user A ends up silently still signed in as user A, and the app happily
    // shows A's profile/wishes/data as if it belonged to the new account.
    // See AuthContext bug report (Apr 2026): fresh info@homegenieios.com signup
    // rendered antrivera3193's profile because the old session was never cleared.
    try {
      await supabase.auth.signOut();
      setUser(null);
      // Also purge device-wide caches AND module-level in-memory caches for
      // the same reason — the new account (once verified) must start with a
      // clean slate. fullAccountReset wipes both AsyncStorage keys and the
      // style/preferences in-memory vars that survive a multiRemove alone.
      await fullAccountReset();
    } catch (e) {
      console.warn('[Auth] pre-signup signOut failed (non-fatal):', e?.message);
    }

    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: { data: { full_name: fullName.trim() } },
    });
    if (error) throw new Error(error.message);

    // Explicitly zero the quota for this user so a fresh account always
    // starts at 0/5 wishes, even if a stale row exists from a prior
    // sandbox/test session reusing the same email. Non-fatal on failure.
    if (data?.user?.id) {
      try {
        await supabase.rpc('initialize_user_quota', { p_user_id: data.user.id });
      } catch (e) {
        console.warn('[Auth] initialize_user_quota failed:', e?.message);
      }
    }

    // If Supabase requires email confirmation, session will be null here.
    // The user must verify their email before they can sign in.
    return { needsEmailVerification: !data.session };
  };

  /**
   * Sign in with email and password.
   * - Lets Supabase handle its own network timeout (no artificial cap).
   * - Eagerly sets user state after the Supabase call resolves so that
   *   any screen rendered after navigation.reset() immediately has a user.
   * Throws an Error with a user-friendly message on failure.
   */
  const signIn = async (email, password) => {
    // Supersede any in-flight bootstrap getSession(): on a cold launch the
    // bootstrap may still be waiting on AsyncStorage and about to resolve
    // with the PREVIOUS account's cached session. If that late result wins
    // the race, it clobbers the user we sign in here. Flipping the flag
    // first makes the late bootstrap a no-op.
    bootstrapSupersededRef.current = true;

    // Build 28: reduce retry aggression. Previously 3 × 15s = up to 47s
    // of silent spinner; users gave up and force-quit before auth completed.
    // Now 2 × 10s = 21s max. The second attempt almost always succeeds
    // because the first warmed TLS; three attempts was excess.
    console.log('[Auth] signIn: calling Supabase...');
    const start = Date.now();

    const attempt = () => withTimeout(
      supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      }),
      10000,
      'Connection timed out — retrying...',
    );

    const { data, error } = await withRetry(attempt, 2, 1000);
    console.log(`[Auth] signIn: responded in ${Date.now() - start}ms`, error ? `error: ${error.message}` : 'success');

    if (error) {
      if (error.message.includes('Email not confirmed')) {
        throw new Error('Please verify your email before signing in. Check your inbox for a verification link.');
      }
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('Incorrect email or password. Please try again.');
      }
      throw new Error(error.message);
    }

    // Eagerly populate user state so screens rendered after navigation.reset()
    // see a populated user immediately — don't wait for onAuthStateChange.
    if (data?.session) {
      try {
        const profile = await withTimeout(
          fetchProfile(data.session.user.id),
          5000,
          'Profile load timed out',
        );
        setUser(buildUser(data.session, profile));
      } catch {
        // Profile fetch failed or timed out — proceed with session-only data.
        // onAuthStateChange will retry in the background.
        setUser(buildUser(data.session, null));
      }
    }
  };

  /**
   * Sign out the current user.
   *
   * Clears all device-wide AsyncStorage caches so a second account
   * signing in on the same device doesn't inherit the previous user's
   * cart, liked items, shared flags, or order history. Individual
   * contexts also reset their in-memory state when `user?.id` changes
   * so the UI flips immediately without waiting for an app restart.
   */
  const signOut = async () => {
    // Supersede any in-flight bootstrap getSession() so a stale cached
    // session can never resurrect the just-signed-out user.
    bootstrapSupersededRef.current = true;

    // Always clear local UI state + device-wide caches, even if the server
    // signOut rejects (network blip, expired JWT, etc). Otherwise a network
    // failure mid-signOut would leave the user stuck in an "authenticated"
    // UI state with their data still visible locally — a worse UX than
    // showing the sign-in wall while the server call silently retries.
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('[Auth] supabase.signOut failed (clearing local anyway):', e?.message);
    } finally {
      setUser(null);
      // Best-effort purge of device-wide caches AND module-level in-memory
      // caches. See fullAccountReset — multiRemove alone leaves the style DNA
      // and userPreferences JS module vars populated, which would bleed into
      // the next account to sign in on this device.
      await fullAccountReset();
    }
  };

  /**
   * Permanently delete the current user's account and all associated data.
   * Deletes: profile row, saved designs, room photos, avatars, then the auth user.
   */
  const deleteAccount = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error('No active session');
    const userId = session.user.id;

    // Delete user data from tables (best-effort — RLS policies may limit some)
    await Promise.allSettled([
      supabase.from('user_designs').delete().eq('user_id', userId),
      supabase.from('feature_requests').delete().eq('user_id', userId),
      supabase.from('supplier_applications').delete().eq('user_id', userId),
      supabase.from('profiles').delete().eq('id', userId),
    ]);

    // Delete storage files (best-effort)
    await Promise.allSettled([
      supabase.storage.from('avatars').remove([`${userId}/avatar.jpeg`]),
      supabase.storage.from('room-uploads').list(userId).then(({ data }) => {
        if (data?.length) {
          return supabase.storage.from('room-uploads').remove(data.map(f => `${userId}/${f.name}`));
        }
      }),
    ]);

    // Sign out and clear local state
    await supabase.auth.signOut();
    setUser(null);

    // Wipe device-wide caches AND in-memory module caches so deletion is
    // truly complete. See fullAccountReset for why multiRemove alone isn't
    // sufficient (it leaves style/preference module vars populated).
    await fullAccountReset();
  };

  /**
   * Send a password reset email.
   */
  const resetPassword = async (email) => {
    const { error } = await supabase.auth.resetPasswordForEmail(
      email.trim().toLowerCase()
    );
    if (error) throw new Error(error.message);
  };

  /**
   * Sign in with Apple using expo-apple-authentication.
   * Passes the Apple identity token to Supabase for verification.
   */
  const signInWithApple = async () => {
    // Supersede any in-flight bootstrap getSession() (see signIn for rationale).
    bootstrapSupersededRef.current = true;

    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
    });
    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
    });
    if (error) throw new Error(error.message);
    // onAuthStateChange above handles setting user state
  };

  /**
   * Resend the email verification link.
   */
  const resendVerificationEmail = async (email) => {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
    });
    if (error) throw new Error(error.message);
  };

  /**
   * Refresh the local user object from the database.
   * Call this after profile updates or role changes.
   */
  const refreshUser = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;
    try {
      const profile = await fetchProfile(session.user.id);
      setUser(buildUser(session, profile));
    } catch {
      // Non-fatal — keep current user
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        signUp,
        signIn,
        signOut,
        deleteAccount,
        signInWithApple,
        resetPassword,
        resendVerificationEmail,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
