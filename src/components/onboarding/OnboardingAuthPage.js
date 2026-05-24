/**
 * OnboardingAuthPage — slide 5 of the 7-page onboarding flow.
 *
 * Build 148 restructure (was Build 147 v23):
 *   The previous version routed "Sign in" → SignInSheet (a bottom-sheet
 *   Modal sliding up over slide 5). User feedback: that pop-up feels
 *   disconnected from the onboarding flow — the page underneath becomes
 *   inert and the sheet height jumps when toggling sign-in / sign-up.
 *
 *   New behavior: the page itself morphs in-place between two modes.
 *     • 'choice' (default) — HomeGenie title + button card (Sign in /
 *                            Sign in with Apple) + big looping slide-5
 *                            video filling the lower half.
 *     • 'form'             — Back arrow + shrunk title + inline email/
 *                            password form (sign-in or sign-up variant)
 *                            + smaller video at the bottom (still looping).
 *
 *   The user never leaves slide 5 to enter credentials. Same component,
 *   same FlatList page, same progress bars at the bottom — only the
 *   middle content swaps.
 *
 * Auth completion behavior (unchanged):
 *   • Email/password sign-in OR sign-up → useAuth().user becomes truthy
 *     → OnboardingScreen's useEffect detects the change and advances
 *     the FlatList to slide 6 (paywall).
 *   • Apple SSO → same observer-driven advance.
 *   • Sign-up that needs email verification → navigate to VerifyEmailSent
 *     (existing flow, unchanged).
 *
 * Build 148 — paywall insertion:
 *   This component doesn't care about the slide 5 → slide 6 advance
 *   target (that lives in OnboardingScreen's useEffect). The change
 *   from "slide 5 → slide 6 reward" to "slide 5 → slide 6 paywall → slide
 *   7 reward" is invisible from this file's perspective.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';

import OnboardingArt from './OnboardingArt';
import { useAuth } from '../../context/AuthContext';
import { redeemSignupCode } from '../../services/subscriptionService';
import { colors } from '../../constants/colors';

const BLUE_LIGHT = colors.blueLight;     // #67ACE9
const BLUE_PRIMARY = colors.bluePrimary; // #0B6DC3

// ── Icons ──────────────────────────────────────────────────────────────────

function AppleLogoIcon() {
  return (
    <Svg width={18} height={20} viewBox="0 0 18 20" fill="none">
      <Path
        d="M14.0625 10.6562C14.0703 9.91406 14.2734 9.20312 14.6484 8.58594C15.0234 7.96875 15.5547 7.46094 16.1875 7.10938C15.7656 6.50781 15.2031 6.01953 14.5391 5.6875C13.875 5.35547 13.1328 5.17188 12.375 5.15625C10.7891 4.98438 9.25 6.10156 8.4375 6.10156C7.61719 6.10156 6.375 5.17188 5.04688 5.20312C4.10156 5.23438 3.17969 5.50781 2.39844 6.0C1.61719 6.49219 0.992188 7.18359 0.578125 8.00391C-1.21094 11.0859 0.140625 15.6172 1.85156 18.0938C2.71094 19.3047 3.71875 20.6562 5.04688 20.6094C6.34375 20.5547 6.83594 19.7891 8.40625 19.7891C9.96875 19.7891 10.4297 20.6094 11.7812 20.5781C13.1719 20.5547 14.0391 19.3594 14.875 18.1406C15.4922 17.2812 15.9688 16.3281 16.2812 15.3125C15.4453 14.9531 14.7344 14.3594 14.234 13.5996C13.7335 12.8398 13.4664 11.9492 13.4609 11.0391C13.4595 10.9099 13.4658 10.7808 13.4795 10.6523L14.0625 10.6562Z"
        fill="#FFFFFF"
      />
      <Path
        d="M11.5469 3.49219C12.3203 2.56641 12.6953 1.36719 12.6094 0.15625C11.4297 0.28125 10.3438 0.85156 9.5625 1.75391C9.18359 2.19141 8.89453 2.69922 8.71094 3.24609C8.52734 3.79297 8.45312 4.36719 8.49219 4.9375C9.08594 4.94531 9.67188 4.82031 10.207 4.57031C10.7422 4.32031 11.2188 3.95312 11.5469 3.49219Z"
        fill="#FFFFFF"
      />
    </Svg>
  );
}

function ChevronLeftIcon({ color = BLUE_PRIMARY }) {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
      <Path
        d="M15 18l-6-6 6-6"
        stroke={color}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

// ── Form input ─────────────────────────────────────────────────────────────

function FormInput({
  placeholder,
  value,
  onChangeText,
  error,
  secureTextEntry,
  showToggle,
  showPassword,
  onToggle,
  ...rest
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <View
        style={[
          inputStyles.wrap,
          focused && inputStyles.wrapFocused,
          error && inputStyles.wrapError,
        ]}
      >
        <TextInput
          style={inputStyles.input}
          placeholder={placeholder}
          placeholderTextColor="#9CA3AF"
          value={value}
          onChangeText={onChangeText}
          secureTextEntry={secureTextEntry && !showPassword}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          {...rest}
        />
        {showToggle && (
          <TouchableOpacity
            onPress={onToggle}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Text style={inputStyles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {!!error && <Text style={inputStyles.errorText}>{error}</Text>}
    </View>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export default function OnboardingAuthPage({
  navigation,
  screenWidth,
  progressDots,
  isActive = true,
}) {
  const insets = useSafeAreaInsets();
  const { signInWithApple, signIn, signUp, resetPassword } = useAuth();

  // Top-level UI mode: choice screen vs. inline credentials form.
  const [mode, setMode] = useState('choice');
  // Within form mode: sign-in vs. sign-up variant.
  const [isSignUp, setIsSignUp] = useState(false);

  // Apple Auth availability — probed once on mount.
  const [appleAvailable, setAppleAvailable] = useState(false);

  // Inline credentials state — lifted from the previous SignInSheet
  // verbatim. Same validators, same Alerts, same promo redemption.
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [showPromoField, setShowPromoField] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Probe Apple Auth availability on mount.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const available = await AppleAuthentication.isAvailableAsync();
        if (!cancelled) setAppleAvailable(available);
      } catch {
        if (!cancelled) setAppleAvailable(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Reset form state whenever the user backs out to choice mode.
  // Prevents stale values from showing when they re-enter the form.
  useEffect(() => {
    if (mode === 'choice') {
      setName('');
      setPassword('');
      setConfirmPassword('');
      setErrors({});
      setShowPassword(false);
      setShowPromoField(false);
      setReferralCode('');
    }
  }, [mode]);

  // 16s safety timer so a stuck network never freezes the spinner on.
  const loadingTimerRef = useRef(null);
  const safeSetLoading = (val) => {
    if (val) {
      loadingTimerRef.current = setTimeout(() => setLoading(false), 16000);
    } else {
      clearTimeout(loadingTimerRef.current);
    }
    setLoading(val);
  };

  // ── Validators ──────────────────────────────────────────────────────────
  const validate = () => {
    const e = {};
    if (isSignUp && !name.trim()) e.name = 'Full name is required.';
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      e.email = 'Enter a valid email address.';
    }
    if (password.length < 6) e.password = 'Password must be at least 6 characters.';
    if (isSignUp && password !== confirmPassword) {
      e.confirmPassword = 'Passwords do not match.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Handlers ────────────────────────────────────────────────────────────
  const handleAuth = async () => {
    if (!validate()) return;
    safeSetLoading(true);
    try {
      if (isSignUp) {
        const result = await signUp(name, email, password);

        // Promo / referral code redemption (non-blocking — failure is logged
        // but doesn't abort the sign-up).
        let redeemResult = null;
        if (referralCode.trim()) {
          try {
            const userId = result.userId || result.user?.id;
            if (userId) {
              redeemResult = await redeemSignupCode(userId, referralCode.trim());
            }
          } catch (err) {
            console.warn('[OnboardingAuthPage] signup code redeem failed:', err.message);
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
          navigation?.navigate?.('VerifyEmailSent', { email });
        }
        // If no verification needed: useAuth().user flips, OnboardingScreen's
        // useEffect advances to slide 6.
      } else {
        await signIn(email, password);
        // Same — useAuth().user flips, OnboardingScreen advances.
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

  const handleForgotPassword = async () => {
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      Alert.alert(
        'Enter your email',
        'Type your email address above and tap "Forgot password?" again.',
      );
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

  const handleApple = async () => {
    try {
      safeSetLoading(true);
      await signInWithApple();
      // useAuth().user changes → OnboardingScreen's useEffect advances.
    } catch (err) {
      const cancelled =
        err?.code === 'ERR_REQUEST_CANCELED' || /cancel/i.test(err?.message || '');
      if (!cancelled) {
        Alert.alert('Sign in with Apple Failed', err.message || 'Please try again.');
      }
    } finally {
      safeSetLoading(false);
    }
  };

  const enterForm = (signup = false) => {
    setIsSignUp(signup);
    setErrors({});
    setMode('form');
  };

  const backToChoice = () => {
    setMode('choice');
  };

  const switchMode = () => {
    setIsSignUp((v) => !v);
    setErrors({});
    setPassword('');
    setConfirmPassword('');
  };

  // ── Render: choice mode ────────────────────────────────────────────────
  const renderChoiceMode = () => (
    <>
      <View style={[styles.choiceTop, { paddingTop: insets.top + 24 }]}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>HomeGenie</Text>
          <Text style={styles.subtitle}>Shop and Design your room with AI</Text>
        </View>

        <View style={styles.buttonCard}>
          <TouchableOpacity
            style={[styles.primaryButton, loading && styles.btnDisabled]}
            onPress={() => enterForm(false)}
            activeOpacity={0.85}
            disabled={loading}
            accessibilityRole="button"
            accessibilityLabel="Sign in with email"
          >
            <Text style={styles.primaryButtonText}>Sign in</Text>
          </TouchableOpacity>

          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.orText}>or</Text>
            <View style={styles.dividerLine} />
          </View>

          {appleAvailable && (
            <TouchableOpacity
              style={[styles.appleButton, loading && styles.btnDisabled]}
              onPress={handleApple}
              activeOpacity={0.85}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Sign in with Apple"
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <>
                  <AppleLogoIcon />
                  <Text style={styles.appleButtonText}>Sign in with Apple</Text>
                </>
              )}
            </TouchableOpacity>
          )}

          {/* Sign-up CTA under the button card — discoverable but secondary. */}
          <TouchableOpacity
            onPress={() => enterForm(true)}
            disabled={loading}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
            style={styles.signupHintWrap}
            accessibilityRole="button"
            accessibilityLabel="Create an account"
          >
            <Text style={styles.signupHintText}>
              New here? <Text style={styles.signupHintLink}>Create an account</Text>
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.videoBlockBig}>
        <OnboardingArt step={5} fullBleed contentFit="cover" isActive={isActive} />
      </View>
    </>
  );

  // ── Render: inline form mode ───────────────────────────────────────────
  const renderFormMode = () => (
    <KeyboardAvoidingView
      style={styles.formRoot}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={0}
    >
      {/* Back arrow + small title row */}
      <View style={[styles.formHeader, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          onPress={backToChoice}
          disabled={loading}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel="Back to sign-in options"
        >
          <ChevronLeftIcon color={BLUE_PRIMARY} />
          <Text style={styles.backLabel}>Options</Text>
        </TouchableOpacity>
        <Text style={styles.formBrand}>HomeGenie</Text>
        <View style={styles.backBtnSpacer} />
      </View>

      {/* Build 148.1 — vertically center the form block in the available
          space. flexGrow:1 + justifyContent:'center' on the contentContainer
          floats the entire "Welcome back → Sign up" group to the visual
          middle of the page when the keyboard is dismissed. When the
          keyboard opens, the ScrollView still scrolls naturally so the
          focused input stays visible. */}
      <ScrollView
        style={styles.formScrollFlex}
        contentContainerStyle={styles.formScrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.formTitle}>
          {isSignUp ? 'Create your account' : 'Welcome back'}
        </Text>
        <Text style={styles.formSubtitle}>
          {isSignUp
            ? 'Start designing rooms with HomeGenie.'
            : 'Sign in to continue designing your space.'}
        </Text>

        {/* Form fields */}
        {isSignUp && (
          <FormInput
            placeholder="Full name"
            value={name}
            onChangeText={setName}
            textContentType="name"
            autoComplete="name"
            autoCapitalize="words"
            error={errors.name}
          />
        )}
        <FormInput
          placeholder="Email"
          value={email}
          onChangeText={setEmail}
          keyboardType="email-address"
          textContentType="emailAddress"
          autoComplete="email"
          autoCapitalize="none"
          error={errors.email}
        />
        <FormInput
          placeholder="Password"
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          showToggle
          showPassword={showPassword}
          onToggle={() => setShowPassword((v) => !v)}
          textContentType={isSignUp ? 'newPassword' : 'password'}
          autoComplete={isSignUp ? 'password-new' : 'password'}
          error={errors.password}
        />
        {isSignUp && (
          <FormInput
            placeholder="Confirm password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry={!showPassword}
            textContentType="newPassword"
            error={errors.confirmPassword}
          />
        )}

        {/* Promo code (sign-up only) */}
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
              <FormInput
                placeholder="Promo or referral code"
                value={referralCode}
                onChangeText={setReferralCode}
                autoCapitalize="characters"
              />
            )}
          </>
        )}

        {/* Forgot password (sign-in only) */}
        {!isSignUp && (
          <TouchableOpacity
            onPress={handleForgotPassword}
            style={styles.forgotWrap}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </TouchableOpacity>
        )}

        {/* Submit */}
        <TouchableOpacity
          style={[styles.primaryButton, loading && styles.btnDisabled]}
          onPress={handleAuth}
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

        {/* Switch mode */}
        <TouchableOpacity
          onPress={switchMode}
          disabled={loading}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.switchModeWrap}
        >
          <Text style={styles.switchModeText}>
            {isSignUp ? (
              <>
                Already have an account?{' '}
                <Text style={styles.switchModeLink}>Sign in</Text>
              </>
            ) : (
              <>
                Don't have an account?{' '}
                <Text style={styles.switchModeLink}>Sign up</Text>
              </>
            )}
          </Text>
        </TouchableOpacity>

        {/* Apple §5.1.1 — Terms + Privacy disclosure on signup */}
        {isSignUp && navigation?.navigate && (
          <View style={styles.legalWrap}>
            <Text style={styles.legalText}>
              By creating an account, you agree to our{' '}
              <Text
                style={styles.legalLink}
                onPress={() => navigation.navigate('TermsOfUse')}
              >
                Terms of Use
              </Text>{' '}
              and{' '}
              <Text
                style={styles.legalLink}
                onPress={() => navigation.navigate('PrivacyPolicy')}
              >
                Privacy Policy
              </Text>
              .
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Build 148.1 — bottom video removed per user feedback. Centering
          the form on the page was visually fighting with the 140pt video
          strip below it; the strip made the page feel cluttered. Form
          mode is now a clean, focused credentials screen with the
          form group vertically centered. The looping lamp video is still
          available on the choice screen (mode='choice') where it has
          room to breathe. */}
    </KeyboardAvoidingView>
  );

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={[styles.page, { width: screenWidth }]}>
      {mode === 'choice' ? renderChoiceMode() : renderFormMode()}

      {/* Progress bars pinned to bottom safe area in both modes */}
      <View style={[styles.progressWrap, { paddingBottom: insets.bottom + 12 }]}>
        {progressDots}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F8F8F8',
  },

  // ── Choice mode ─────────────────────────────────────────────────────────
  choiceTop: {
    paddingHorizontal: 28,
    paddingBottom: 16,
  },
  titleBlock: {
    alignItems: 'center',
    marginBottom: 24,
  },
  title: {
    fontSize: 38,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 10,
    fontSize: 18,
    color: BLUE_LIGHT,
    textAlign: 'center',
    lineHeight: 24,
  },
  buttonCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
  },
  videoBlockBig: {
    flex: 1,
    width: '100%',
    backgroundColor: '#FFFFFF',
  },

  // ── Form mode ───────────────────────────────────────────────────────────
  formRoot: {
    flex: 1,
  },
  formHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 4,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingVertical: 8,
    paddingRight: 8,
  },
  backBtnSpacer: {
    width: 80, // mirrors backBtn so the brand label centers
  },
  backLabel: {
    color: BLUE_PRIMARY,
    fontSize: 15,
    fontWeight: '500',
  },
  formBrand: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    letterSpacing: -0.3,
  },
  // Build 148.1 — formScrollFlex gives the ScrollView the available
  // vertical space (between the formHeader at top and the progress bars
  // at the bottom). flex:1 lets contentContainer's flexGrow center the
  // child block.
  formScrollFlex: {
    flex: 1,
  },
  formScrollContent: {
    paddingHorizontal: 28,
    paddingTop: 18,
    paddingBottom: 16,
    // Build 148.1: flexGrow + justifyContent center the form group
    // vertically when content is shorter than viewport. When the
    // keyboard opens (or the user is on signup with more fields than
    // fit), normal scroll-from-top behavior kicks in.
    flexGrow: 1,
    justifyContent: 'center',
  },
  formTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  formSubtitle: {
    fontSize: 14,
    color: BLUE_LIGHT,
    textAlign: 'center',
    marginBottom: 18,
  },
  // Build 148.1 — videoBlockSmall removed; the small bottom video is no
  // longer rendered in form mode (see render method above).

  // ── Buttons / shared ────────────────────────────────────────────────────
  primaryButton: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 30,
    height: 50,
    borderWidth: 1,
    borderColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    marginTop: 8,
  },
  btnDisabled: { opacity: 0.6 },
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
  dividerLine: { flex: 1, height: 1, backgroundColor: '#D7E3F0' },
  orText: {
    marginHorizontal: 12,
    color: BLUE_PRIMARY,
    fontSize: 13,
    fontWeight: '500',
  },
  appleButton: {
    backgroundColor: '#000000',
    borderRadius: 30,
    height: 50,
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

  signupHintWrap: {
    alignSelf: 'center',
    marginTop: 12,
    paddingVertical: 6,
  },
  signupHintText: {
    color: '#6B7280',
    fontSize: 14,
  },
  signupHintLink: {
    color: BLUE_PRIMARY,
    fontWeight: '600',
  },

  // ── Form-only ──────────────────────────────────────────────────────────
  forgotWrap: { alignSelf: 'flex-end', marginTop: 4, marginBottom: 8 },
  forgotText: { fontSize: 13, color: BLUE_PRIMARY, fontWeight: '600' },

  havecodeWrap: { alignSelf: 'flex-start', marginTop: 4, marginBottom: 12 },
  havecodeText: { fontSize: 13, color: BLUE_PRIMARY, fontWeight: '600' },

  switchModeWrap: { alignSelf: 'center', marginTop: 18 },
  switchModeText: { color: '#6B7280', fontSize: 14 },
  switchModeLink: { color: BLUE_PRIMARY, fontWeight: '600' },

  legalWrap: { marginTop: 14 },
  legalText: {
    color: '#9CA3AF',
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 17,
  },
  legalLink: { color: BLUE_PRIMARY, fontWeight: '500' },

  // ── Progress bars ──────────────────────────────────────────────────────
  progressWrap: {
    paddingHorizontal: 28,
    paddingTop: 8,
    backgroundColor: '#F8F8F8',
  },
});

const inputStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 50,
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
