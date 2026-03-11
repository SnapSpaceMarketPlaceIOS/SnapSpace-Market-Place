import React, { createContext, useContext, useState, useEffect } from 'react';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase, fetchProfile } from '../services/supabase';
import { registerForPushNotifications } from '../services/notifications';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  // Build a merged user object from Supabase session + profiles row
  const buildUser = (session, profile) => ({
    id: session.user.id,
    email: session.user.email,
    name: profile?.full_name || session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'SnapSpace User',
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
      const { data: { session } } = await supabase.auth.getSession();
      if (session && mounted) {
        try {
          const profile = await fetchProfile(session.user.id);
          setUser(buildUser(session, profile));
        } catch {
          setUser(buildUser(session, null));
        }
      }
      if (mounted) setLoading(false);
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
        if (loading) setLoading(false);
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
    const { data, error } = await supabase.auth.signUp({
      email: email.trim().toLowerCase(),
      password,
      options: {
        data: { full_name: fullName.trim() },
      },
    });
    if (error) throw new Error(error.message);
    // If Supabase requires email confirmation, session will be null here.
    // The user must verify their email before they can sign in.
    return { needsEmailVerification: !data.session };
  };

  /**
   * Sign in with email and password.
   * Throws an Error with a user-friendly message on failure.
   */
  const signIn = async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    if (error) {
      if (error.message.includes('Email not confirmed')) {
        throw new Error('Please verify your email before signing in. Check your inbox for a verification link.');
      }
      if (error.message.includes('Invalid login credentials')) {
        throw new Error('Incorrect email or password. Please try again.');
      }
      throw new Error(error.message);
    }
  };

  /**
   * Sign out the current user.
   */
  const signOut = async () => {
    await supabase.auth.signOut();
    setUser(null);
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
