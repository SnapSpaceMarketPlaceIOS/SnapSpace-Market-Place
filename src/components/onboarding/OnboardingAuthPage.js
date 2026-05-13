/**
 * OnboardingAuthPage — Page 5 of the onboarding flow.
 *
 * This IS the authentication screen — no longer a launcher to a separate
 * modal. Email/password, Apple sign-in, Sign Up toggle, Forgot password,
 * and promo/referral code redemption all live on a single screen, so the
 * new-user flow is one continuous swipeable experience.
 *
 * Build 145 — replaces the prior "Sign in / Sign in with Apple" launcher
 * pattern that pushed AuthScreen as a modal. The legacy AuthScreen.js
 * still exists in the stack to serve the cart / paywall soft-wall paths;
 * a follow-up will retire it in favor of this design.
 *
 * Behavior:
 *   - On successful email signin → OnboardingScreen's useEffect (watching
 *     useAuth().user) auto-advances to page 6.
 *   - On signup with email verification → push to VerifyEmailSent.
 *   - On signup with referral/promo code → redeem via subscriptionService.
 *   - Apple signin → handled inline by signInWithApple from AuthContext.
 *   - Forgot password → resetPassword RPC + Alert with confirmation.
 *
 * Apple 5.1.1 compliance:
 *   - Terms of Use + Privacy Policy explicit on signup
 *   - Email verification still required for email accounts
 *   - Apple sign-in offered as primary alternative (4.8 compliance)
 *   - No incentive ties to ratings/reviews (4.5.4)
 *
 * Layout:
 *   - Title + subtitle pinned to the top of the safe area
 *   - Smaller-than-other-pages genie lamp (~60% of full-width art slot)
 *   - Form fields (email, password, conditional name + confirm + promo)
 *   - Forgot password link (right-aligned, sign-in mode only)
 *   - Primary CTA (Sign in / Create account) — full-width blue
 *   - "or" divider
 *   - Apple button — full-width black
 *   - Sign Up / Sign In toggle at the bottom
 *   - Terms / Privacy disclosure (signup mode only, for compliance)
 *   - ScrollView wrapper so signup mode (more fields) doesn't clip on
 *     smaller phones.
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  ScrollView,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  Alert,
  StyleSheet,
  ActivityIndicator,
  Linking,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AppleAuthentication from 'expo-apple-authentication';

import OnboardingArt from './OnboardingArt';
import { useAuth } from '../../context/AuthContext';
import { useOnboarding } from '../../context/OnboardingContext';
import { redeemSignupCode } from '../../services/subscriptionService';
import { colors } from '../../constants/colors';

const BLUE_LIGHT = colors.blueLight;
const BLUE_PRIMARY = colors.bluePrimary;

// ── Subcomponents ─────────────────────────────────────────────────────────

function MinimalInput({
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  textContentType,
  autoComplete,
  showToggle,
  onToggle,
  showPassword,
  editable = true,
  autoCapitalize = 'none',
  error,
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <View style={[
        inputStyles.wrap,
        focused && inputStyles.wrapFocused,
        error && inputStyles.wrapError,
      ]}>
        <TextInput
          key={secureTextEntry ? 'secure' : 'plain'}
          style={inputStyles.input}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry}
          keyboardType={keyboardType || 'default'}
          autoCapitalize={autoCapitalize}
          autoCorrect={false}
          spellCheck={false}
          textContentType={textContentType}
          autoComplete={autoComplete}
          editable={editable}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
        />
        {showToggle && (
          <TouchableOpacity onPress={onToggle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={inputStyles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {error ? <Text style={inputStyles.errorText}>{error}</Text> : null}
    </View>
  );
}

function AppleLogoIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="#FFFFFF">
      <Path d="M17.05 12.04c-.03-3.04 2.49-4.51 2.6-4.58-1.42-2.07-3.62-2.35-4.4-2.38-1.86-.19-3.66 1.1-4.61 1.1-.97 0-2.42-1.08-3.99-1.05-2.03.03-3.93 1.21-4.97 3.05-2.14 3.7-.55 9.18 1.54 12.18.99 1.46 2.18 3.11 3.74 3.05 1.51-.06 2.08-.97 3.91-.97 1.82 0 2.34.97 3.95.94 1.63-.03 2.66-1.49 3.66-2.96 1.15-1.7 1.62-3.34 1.65-3.43-.04-.02-3.17-1.22-3.2-4.83zM13.99 3.13c.83-1 1.39-2.39 1.23-3.77-1.19.05-2.64.79-3.49 1.79-.76.88-1.43 2.29-1.25 3.65 1.33.1 2.68-.67 3.51-1.67z" />
    </Svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function OnboardingAuthPage({ navigation, screenWidth, progressDots }) {
  const { signUp, signIn, signInWithApple, resetPassword } = useAuth();
  const { enableOnboarding } = useOnboarding();
  const insets = useSafeAreaInsets();

  // ── Form state ────────────────────────────────────────────────────────
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [showPromoField, setShowPromoField] = useState(false);
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Safety net — force-clear the spinner after 20s so it can never hang.
  const loadingTimerRef = useRef(null);
  const safeSetLoading = useCallback((val) => {
    if (val) {
      loadingTimerRef.current = setTimeout(() => setLoading(false), 20000);
    } else {
      if (loadingTimerRef.current) {
        clearTimeout(loadingTimerRef.current);
        loadingTimerRef.current = null;
      }
    }
    setLoading(val);
  }, []);

  useEffect(() => () => {
    if (loadingTimerRef.current) clearTimeout(loadingTimerRef.current);
  }, []);

  useEffect(() => {
    AppleAuthentication.isAvailableAsync().then(setAppleAvailable).catch(() => {});
  }, []);

  // ── Validation ────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (isSignUp && !name.trim()) e.name = 'Full name is required.';
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email address.';
    if (password.length < 6) e.password = 'Password must be at least 6 characters.';
    if (isSignUp && password !== confirmPassword) e.confirmPassword = 'Passwords do not match.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Submit handler (email/password) ───────────────────────────────────
  const handleEmailAuth = async () => {
    if (!validate()) return;
    safeSetLoading(true);
    try {
      if (isSignUp) {
        const result = await signUp(name, email, password);
        // Post-auth tutorial flag — new accounts get the in-app walkthrough
        // (chat bar, camera, genie lamp) after they enter the main app.
        enableOnboarding();

        // Promo / referral code redemption (non-blocking).
        let redeemResult = null;
        if (referralCode.trim()) {
          try {
            const userId = result.userId || result.user?.id;
            if (userId) {
              redeemResult = await redeemSignupCode(userId, referralCode.trim());
            }
          } catch (err) {
            console.warn('[OnboardingAuth] signup code redeem failed:', err.message);
          }
        }

        if (redeemResult?.matched === 'promo' && redeemResult.status === 'PENDING_VERIFY') {
          Alert.alert(
            `${redeemResult.wishesPending} Wishes Reserved`,
            `Verify your email to unlock your ${redeemResult.wishesPending} bonus wishes — they'll be in your account the moment you confirm.`,
          );
        } else if (redeemResult?.status === 'ALREADY_REDEEMED') {
          Alert.alert(
            'Code Already Used',
            'This code has already been redeemed on this account. Your account is set up and ready to go.',
          );
        } else if (redeemResult?.status === 'CODE_EXHAUSTED') {
          Alert.alert(
            'Code No Longer Available',
            "That code has hit its redemption limit. Don't worry — your account is set up and you'll get your standard free wishes after verifying.",
          );
        } else if (redeemResult?.matched === 'none' && redeemResult?.status === 'INVALID_CODE') {
          Alert.alert(
            'Code Not Recognized',
            "We couldn't find that code. Your account was created — verify your email to continue.",
          );
        }

        if (result.needsEmailVerification) {
          // Push to verify-email screen. After verification + sign in,
          // user lands back here OR on Main (gate decides).
          navigation.navigate('VerifyEmailSent', { email });
        }
        // If no verification required, useAuth().user becomes truthy and
        // OnboardingScreen's useEffect auto-advances to page 6.
      } else {
        await signIn(email, password);
        // OnboardingScreen's useEffect handles the page 6 advance.
      }
    } catch (err) {
      Alert.alert(
        isSignUp ? 'Sign Up Failed' : 'Sign In Failed',
        err.message || 'Something went wrong. Please try again.',
      );
    } finally {
      safeSetLoading(false);
    }
  };

  const handleApple = async () => {
    try {
      safeSetLoading(true);
      await signInWithApple();
      // useAuth().user changes → OnboardingScreen advances to page 6.
    } catch (err) {
      const cancelled = err?.code === 'ERR_REQUEST_CANCELED' || /cancel/i.test(err?.message || '');
      if (!cancelled) {
        Alert.alert('Sign in with Apple Failed', err.message || 'Please try again.');
      }
    } finally {
      safeSetLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      Alert.alert('Enter your email', 'Type your email address above and tap "Forgot password?" again.');
      return;
    }
    safeSetLoading(true);
    try {
      await resetPassword(email);
      Alert.alert('Check your inbox', `A password reset link has been sent to ${email}.`);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      safeSetLoading(false);
    }
  };

  const switchMode = () => {
    setIsSignUp((v) => !v);
    setErrors({});
    setPassword('');
    setConfirmPassword('');
  };

  const openLegalLink = (screenName) => {
    if (navigation?.navigate) navigation.navigate(screenName);
  };

  // ── Render ────────────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={[styles.page, { width: screenWidth }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          // Dynamic Island / notch clearance — without the inset, the
          // "HomeGenie" title collides with the front-facing camera on
          // iPhone 14 Pro and newer. The extra 16pt above insets.top
          // matches the breathing room used on the other onboarding
          // pages (see styles.pageInner in OnboardingScreen).
          { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Title + subtitle — same typographic system as other onboarding pages */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>HomeGenie</Text>
          <Text style={styles.body}>
            {isSignUp
              ? 'Create your account to start designing.'
              : 'Shop and Design your room with AI'}
          </Text>
        </View>

        {/* Smaller genie lamp — 60% of full art slot per design direction */}
        <View style={styles.artSlot}>
          <OnboardingArt step={5} style={styles.shrunkArt} />
        </View>

        {/* Form */}
        <View style={styles.form}>
          {isSignUp && (
            <MinimalInput
              placeholder="Full name"
              value={name}
              onChangeText={setName}
              textContentType="name"
              autoComplete="name"
              autoCapitalize="words"
              error={errors.name}
            />
          )}
          <MinimalInput
            placeholder="Email"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
            error={errors.email}
          />
          <MinimalInput
            placeholder="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
            textContentType={isSignUp ? 'newPassword' : 'password'}
            autoComplete={isSignUp ? 'password-new' : 'password'}
            showToggle
            showPassword={showPassword}
            onToggle={() => setShowPassword((v) => !v)}
            error={errors.password}
          />
          {isSignUp && (
            <MinimalInput
              placeholder="Confirm password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry={!showPassword}
              textContentType="newPassword"
              error={errors.confirmPassword}
            />
          )}

          {/* Promo / referral code — collapsed by default to keep form clean */}
          {isSignUp && (
            <>
              {!showPromoField ? (
                <TouchableOpacity
                  onPress={() => setShowPromoField(true)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={styles.havecodeWrap}
                >
                  <Text style={styles.havecodeText}>Have a code?</Text>
                </TouchableOpacity>
              ) : (
                <MinimalInput
                  placeholder="Promo or referral code"
                  value={referralCode}
                  onChangeText={setReferralCode}
                  autoCapitalize="characters"
                />
              )}
            </>
          )}

          {/* Forgot password — sign-in mode only */}
          {!isSignUp && (
            <TouchableOpacity
              onPress={handleForgotPassword}
              style={styles.forgotWrap}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.forgotText}>Forgot password?</Text>
            </TouchableOpacity>
          )}

          {/* Primary CTA */}
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
            onPress={handleEmailAuth}
            activeOpacity={0.85}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel={isSignUp ? 'Create account' : 'Sign in'}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={styles.primaryButtonText}>
                {isSignUp ? 'Create account' : 'Sign in'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* Apple — required visible on iOS per 4.8 since we offer 3rd-party signin */}
          {appleAvailable && (
            <TouchableOpacity
              style={styles.appleButton}
              onPress={handleApple}
              activeOpacity={0.85}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Apple"
            >
              <AppleLogoIcon />
              <Text style={styles.appleButtonText}>Sign in with Apple</Text>
            </TouchableOpacity>
          )}

          {/* Sign-up / Sign-in toggle */}
          <TouchableOpacity
            onPress={switchMode}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.switchModeWrap}
          >
            <Text style={styles.switchModeText}>
              {isSignUp ? (
                <>Already have an account? <Text style={styles.switchModeLink}>Sign in</Text></>
              ) : (
                <>Don't have an account? <Text style={styles.switchModeLink}>Sign up</Text></>
              )}
            </Text>
          </TouchableOpacity>

          {/* Apple 5.1.1 compliance — explicit Terms + Privacy disclosure on signup */}
          {isSignUp && (
            <View style={styles.legalWrap}>
              <Text style={styles.legalText}>
                By creating an account, you agree to our{' '}
                <Text style={styles.legalLink} onPress={() => openLegalLink('TermsOfUse')}>
                  Terms of Use
                </Text>
                {' '}and{' '}
                <Text style={styles.legalLink} onPress={() => openLegalLink('PrivacyPolicy')}>
                  Privacy Policy
                </Text>.
              </Text>
            </View>
          )}
        </View>

        {/* Progress dots — 6-dot indicator, page 5 active. Rendered as a
            child of the ScrollView so it scrolls with content rather than
            being clipped by the keyboard. */}
        <View style={styles.dotsWrap}>{progressDots}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 28,
    // paddingTop + paddingBottom are set dynamically with safe-area insets
    // at render time (see contentContainerStyle in the ScrollView).
  },

  artSlot: {
    alignItems: 'center',
    // Build 145 visual pass 3 — tightened vertical rhythm so the lamp
    // sits closer to both the subtitle (above) and the email field
    // (below), eliminating the dead negative space that made the page
    // feel "floaty." 8pt above / 6pt below.
    marginTop: 8,
    marginBottom: 6,
  },

  titleBlock: { alignItems: 'center', marginBottom: 4 },
  title: {
    fontSize: 32,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    letterSpacing: -0.4,
  },
  body: {
    marginTop: 8,
    fontSize: 15,
    color: BLUE_PRIMARY,
    textAlign: 'center',
  },

  shrunkArt: {
    // 60% of the full art slot per design direction. Width is relative to
    // the screen padding box (~SCREEN_W - 56pt), so this renders at roughly
    // 200pt on iPhone 16 Pro and scales naturally across other sizes.
    width: '60%',
  },

  form: { width: '100%' },

  forgotWrap: { alignSelf: 'flex-end', marginTop: 4, marginBottom: 12 },
  forgotText: { fontSize: 13, color: BLUE_PRIMARY, fontWeight: '600' },

  havecodeWrap: { alignSelf: 'flex-start', marginTop: 4, marginBottom: 12 },
  havecodeText: { fontSize: 13, color: BLUE_PRIMARY, fontWeight: '600' },

  primaryButton: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 34,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },

  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  orText: {
    marginHorizontal: 12,
    color: BLUE_PRIMARY,
    fontSize: 13,
    fontWeight: '500',
  },

  appleButton: {
    backgroundColor: '#000000',
    borderRadius: 34,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  appleButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '600',
    marginLeft: 8,
  },

  switchModeWrap: { alignSelf: 'center', marginTop: 16 },
  switchModeText: { color: '#6B7280', fontSize: 14 },
  switchModeLink: { color: BLUE_PRIMARY, fontWeight: '600' },

  legalWrap: { marginTop: 14 },
  legalText: { color: '#9CA3AF', fontSize: 12, textAlign: 'center', lineHeight: 17 },
  legalLink: { color: BLUE_PRIMARY, fontWeight: '500' },

  dotsWrap: { alignItems: 'center', marginTop: 20 },
});

const inputStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  wrapFocused: { borderColor: BLUE_LIGHT },
  wrapError: { borderColor: '#EF4444' },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111827',
  },
  toggleText: {
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '500',
    marginLeft: 8,
  },
  errorText: {
    color: '#EF4444',
    fontSize: 12,
    marginBottom: 8,
    marginTop: -4,
    marginLeft: 4,
  },
});
