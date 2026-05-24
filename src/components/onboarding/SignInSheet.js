/**
 * SignInSheet — bottom-sheet modal containing the email/password auth form.
 *
 * Build 147 v23: replaces the standalone AuthScreen as the email auth UI.
 * Slide 5 of onboarding triggers this sheet on "Sign in" tap. Apple SSO
 * stays inline on slide 5 itself; this sheet handles the email path only.
 *
 * Modes:
 *   • Sign In (default)  — Email + Password + Forgot password + Sign In button
 *   • Sign Up (toggled)  — Full name + Email + Password + Confirm password
 *                          + optional promo/referral code + Create account button
 *
 * Auth success:
 *   • Sign in     → useAuth().user becomes truthy → OnboardingScreen's
 *                   useEffect detects the change and advances to slide 6.
 *                   Sheet dismisses on success.
 *   • Sign up new account → if email verification required, navigates to
 *                   VerifyEmailSent; otherwise treated like sign in.
 *
 * Dismissal:
 *   • Tap the X handle at the top of the sheet
 *   • Tap the dimmed backdrop above the sheet
 *   • Hardware back button (Android) — onRequestClose
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Modal,
  KeyboardAvoidingView,
  ScrollView,
  Pressable,
  Platform,
  ActivityIndicator,
  Alert,
  StyleSheet,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '../../context/AuthContext';
import { redeemSignupCode } from '../../services/subscriptionService';
import { colors } from '../../constants/colors';

const BLUE_LIGHT = colors.blueLight;     // #67ACE9
const BLUE_PRIMARY = colors.bluePrimary; // #0B6DC3

function CloseIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none">
      <Path
        d="M6 6l12 12M18 6L6 18"
        stroke="#111827"
        strokeWidth={2.2}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// Minimal styled input — matches the existing AuthScreen aesthetic so the
// shift from the old full-screen popup to this sheet feels continuous.
function FormInput({ placeholder, value, onChangeText, error, secureTextEntry, showToggle, showPassword, onToggle, ...rest }) {
  const [focused, setFocused] = useState(false);
  return (
    <View>
      <View style={[
        inputStyles.wrap,
        focused && inputStyles.wrapFocused,
        error && inputStyles.wrapError,
      ]}>
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
          <TouchableOpacity onPress={onToggle} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Text style={inputStyles.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        )}
      </View>
      {error && <Text style={inputStyles.errorText}>{error}</Text>}
    </View>
  );
}

export default function SignInSheet({ visible, onClose, navigation }) {
  const insets = useSafeAreaInsets();
  const { signUp, signIn, resetPassword } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [showPromoField, setShowPromoField] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // Reset form state every time the sheet closes — prevents stale values
  // appearing when the user re-opens the sheet after a failed attempt.
  useEffect(() => {
    if (!visible) {
      setName('');
      setPassword('');
      setConfirmPassword('');
      setErrors({});
      setShowPassword(false);
      setShowPromoField(false);
      setReferralCode('');
    }
  }, [visible]);

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

  const validate = () => {
    const e = {};
    if (isSignUp && !name.trim()) e.name = 'Full name is required.';
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email address.';
    if (password.length < 6) e.password = 'Password must be at least 6 characters.';
    if (isSignUp && password !== confirmPassword) e.confirmPassword = 'Passwords do not match.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAuth = async () => {
    if (!validate()) return;
    safeSetLoading(true);
    try {
      if (isSignUp) {
        const result = await signUp(name, email, password);

        // Promo / referral code redemption (non-blocking).
        let redeemResult = null;
        if (referralCode.trim()) {
          try {
            const userId = result.userId || result.user?.id;
            if (userId) {
              redeemResult = await redeemSignupCode(userId, referralCode.trim());
            }
          } catch (err) {
            console.warn('[SignInSheet] signup code redeem failed:', err.message);
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
          onClose();
          navigation?.navigate?.('VerifyEmailSent', { email });
        } else {
          // OnboardingScreen's useEffect picks up the user state change and
          // auto-advances to slide 6.
          onClose();
        }
      } else {
        await signIn(email, password);
        // Same — useAuth().user flips, OnboardingScreen advances.
        onClose();
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        style={styles.modalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {/* Backdrop — tap to dismiss. Sized to fill the area ABOVE the sheet. */}
        <Pressable style={styles.backdrop} onPress={onClose} />

        {/* The sheet itself */}
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          {/* Drag handle + close button */}
          <View style={styles.sheetHeader}>
            <View style={styles.dragHandle} />
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityRole="button"
              accessibilityLabel="Close sign in"
            >
              <CloseIcon />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.sheetContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.sheetTitle}>
              {isSignUp ? 'Create your account' : 'Welcome back'}
            </Text>
            <Text style={styles.sheetSubtitle}>
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

            {!isSignUp && (
              <TouchableOpacity
                onPress={handleForgotPassword}
                style={styles.forgotWrap}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity
              style={[styles.primaryButton, loading && styles.primaryButtonDisabled]}
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

            <TouchableOpacity
              onPress={switchMode}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={styles.switchModeWrap}
            >
              <Text style={styles.switchModeText}>
                {isSignUp
                  ? <>Already have an account? <Text style={styles.switchModeLink}>Sign in</Text></>
                  : <>Don't have an account? <Text style={styles.switchModeLink}>Sign up</Text></>
                }
              </Text>
            </TouchableOpacity>

            {/* Apple §5.1.1 — explicit Terms + Privacy disclosure on signup */}
            {isSignUp && navigation?.navigate && (
              <View style={styles.legalWrap}>
                <Text style={styles.legalText}>
                  By creating an account, you agree to our{' '}
                  <Text style={styles.legalLink} onPress={() => navigation.navigate('TermsOfUse')}>
                    Terms of Use
                  </Text>
                  {' '}and{' '}
                  <Text style={styles.legalLink} onPress={() => navigation.navigate('PrivacyPolicy')}>
                    Privacy Policy
                  </Text>.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalRoot: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(17,24,39,0.45)',
  },
  backdrop: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 24,
    paddingTop: 12,
    maxHeight: '88%',
  },
  sheetHeader: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 12,
  },
  dragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
  },
  closeBtn: {
    position: 'absolute',
    right: 0,
    top: 0,
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F3F4F6',
    borderRadius: 16,
  },
  sheetContent: {
    paddingBottom: 24,
  },

  sheetTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  sheetSubtitle: {
    fontSize: 14,
    color: BLUE_LIGHT,
    textAlign: 'center',
    marginBottom: 18,
  },

  forgotWrap: { alignSelf: 'flex-end', marginTop: 4, marginBottom: 12 },
  forgotText: { fontSize: 13, color: BLUE_PRIMARY, fontWeight: '600' },

  havecodeWrap: { alignSelf: 'flex-start', marginTop: 4, marginBottom: 12 },
  havecodeText: { fontSize: 13, color: BLUE_PRIMARY, fontWeight: '600' },

  primaryButton: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 26,
    height: 50,
    borderWidth: 1,
    borderColor: '#000000',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  primaryButtonDisabled: { opacity: 0.6 },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },

  switchModeWrap: { alignSelf: 'center', marginTop: 18 },
  switchModeText: { color: '#6B7280', fontSize: 14 },
  switchModeLink: { color: BLUE_PRIMARY, fontWeight: '600' },

  legalWrap: { marginTop: 14 },
  legalText: { color: '#9CA3AF', fontSize: 12, textAlign: 'center', lineHeight: 17 },
  legalLink: { color: BLUE_PRIMARY, fontWeight: '500' },
});

const inputStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
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
