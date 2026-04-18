import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, fetchProfile } from '../services/supabase';
import { registerForPushNotifications } from '../services/notifications';

// AsyncStorage keys that are NOT yet scoped to a specific user.
// Cleared on sign-out so the next account on this device can't inherit
// the previous user's cart / liked items / order history / share flags.
// (Onboarding flag is per-user and handled separately in OnboardingContext.)
const DEVICE_WIDE_STORAGE_KEYS = [
  '@snapspace_cart',
  '@snapspace_liked',
  '@snapspace_liked_products',
  '@snapspace_shared',
  '@snapspace_order_history',
];

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
      // Safety net: if getSession() hangs (e.g. no network, bad env vars),
      // bail out after 2s so the app is never stuck on the loading screen.
      let settled = false;
      const timer = setTimeout(() => {
        if (!settled && mounted) {
          console.log('[Auth] bootstrap timeout — proceeding as guest');
          settled = true;
          setLoading(false);
        }
      }, 2000);

      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session && mounted) {
          try {
            const profile = await fetchProfile(session.user.id);
            setUser(buildUser(session, profile));
          } catch {
            setUser(buildUser(session, null));
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
            // Register push token on first sign-in or app resume
            if (event === 'SIGNED_IN') {
              registerForPushNotifications(session.user.id).catch(() => {});
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
      // Also purge device-wide caches for the same reason — the new account
      // (once verified) must start with a clean slate.
      await AsyncStorage.multiRemove(DEVICE_WIDE_STORAGE_KEYS).catch(() => {});
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
    // iOS 26.x simulator cold TLS handshakes can stall 30-60s.
    // Strategy: 15s timeout per attempt, up to 3 retries. The second
    // attempt almost always succeeds because the TLS session is cached.
    console.log('[Auth] signIn: calling Supabase...');
    const start = Date.now();

    const attempt = () => withTimeout(
      supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      }),
      15000,
      'Connection timed out — retrying...',
    );

    const { data, error } = await withRetry(attempt, 3, 1000);
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
    await supabase.auth.signOut();
    setUser(null);

    // Best-effort purge of device-wide caches. Non-fatal on failure.
    try {
      await AsyncStorage.multiRemove(DEVICE_WIDE_STORAGE_KEYS);
    } catch (e) {
      console.warn('[Auth] post-signOut storage clear failed (non-fatal):', e?.message);
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

    // Wipe device-wide caches so deletion is truly complete.
    try {
      await AsyncStorage.multiRemove(DEVICE_WIDE_STORAGE_KEYS);
    } catch (e) {
      console.warn('[Auth] post-delete storage clear failed (non-fatal):', e?.message);
    }
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
