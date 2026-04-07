import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  StyleSheet,
  TouchableOpacity,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Animated,
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../context/AuthContext';
import LensLoader from '../components/LensLoader';
import { applyReferralCode } from '../services/subscriptionService';

const { width: SCREEN_W } = Dimensions.get('window');
const HERO_H = 280;
const HERO_PARALLAX = 100; // image slides 100px to create depth during scroll
const BLUE = '#0B6DC3';

// ── Hero image — same living room used on the landing page ────────────────────
const HERO_IMG = require('../../assets/snap-bg.jpg');

// ── Input Field ───────────────────────────────────────────────────────────────

function MinimalInput({
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  textContentType,
  autoComplete,
  showToggle,
  onToggle,
  showPassword,
  editable = true,
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View style={[inputStyles.wrap, focused && inputStyles.wrapFocused]}>
      <TextInput
        key={secureTextEntry ? 'secure' : 'plain'}
        style={inputStyles.input}
        placeholder={placeholder}
        placeholderTextColor="#ABABAB"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType || 'default'}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        textContentType={textContentType}
        autoComplete={autoComplete}
        editable={editable}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {showToggle && (
        <TouchableOpacity
          onPress={onToggle}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={inputStyles.toggleText}>
            {showPassword ? 'Hide' : 'Show'}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const inputStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  wrapFocused: { borderColor: '#67ACE9' },
  input: { flex: 1, fontSize: 15, color: '#111' },
  toggleText: { fontSize: 13, color: '#ABABAB', fontWeight: '500', marginLeft: 8 },
});

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AuthScreen({ navigation }) {
  const { signUp, signIn, signInWithApple, resetPassword } = useAuth();

  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [referralCode, setReferralCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // ── Parallax — JS listener drives heroScrollY so KAV/native-driver conflicts are avoided
  const scrollY      = React.useRef(new Animated.Value(0)).current;
  const heroScrollY  = React.useRef(new Animated.Value(0)).current;
  const heroParallax = React.useRef(
    heroScrollY.interpolate({ inputRange: [0, HERO_H], outputRange: [0, HERO_PARALLAX], extrapolate: 'clamp' }),
  ).current;

  // ── Button bounce animations ───────────────────────────────────────────────
  const btnScale = React.useRef(new Animated.Value(1)).current;
  const appleScale = React.useRef(new Animated.Value(1)).current;
  const pressIn  = (anim) => Animated.spring(anim, { toValue: 0.94, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  const pressOut = (anim) => Animated.spring(anim, { toValue: 1,    useNativeDriver: true, speed: 18, bounciness: 14 }).start();

  // ── Form slide-up entrance ────────────────────────────────────────────────
  const formSlideY = React.useRef(new Animated.Value(700)).current;
  React.useEffect(() => {
    Animated.spring(formSlideY, { toValue: 0, useNativeDriver: true, speed: 13, bounciness: 4 }).start();
  }, []);

  // Safety net — force-clear the spinner after 20s so it can never get stuck.
  const loadingTimerRef = React.useRef(null);
  const safeSetLoading = (val) => {
    if (val) {
      loadingTimerRef.current = setTimeout(() => setLoading(false), 20000);
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

        // Apply referral code if provided (non-blocking — don't fail signup)
        if (referralCode.trim()) {
          try {
            const userId = result.userId || result.user?.id;
            if (userId) await applyReferralCode(userId, referralCode.trim());
          } catch (e) {
            console.warn('[Auth] referral code apply failed:', e.message);
          }
        }

        if (result.needsEmailVerification) {
          navigation.replace('VerifyEmailSent', { email });
        } else {
          navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
        }
      } else {
        await signIn(email, password);
        navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
      }
    } catch (err) {
      Alert.alert('Sign In Failed', err.message);
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
      Alert.alert(
        'Check your inbox',
        `A password reset link has been sent to ${email}.`,
      );
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
    <View style={styles.root}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Animated.ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
          scrollEventThrottle={16}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            {
              useNativeDriver: true,
              listener: (e) => heroScrollY.setValue(e.nativeEvent.contentOffset.y),
            },
          )}
        >
          {/* ── Hero Image ─────────────────────────────────────────── */}
          <View style={styles.heroWrap}>
            <Animated.Image
              source={HERO_IMG}
              style={[styles.heroImg, { transform: [{ translateY: heroParallax }] }]}
              resizeMode="cover"
            />
            {/* Dark gradient overlay for text legibility */}
            <LinearGradient
              colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)']}
              style={StyleSheet.absoluteFill}
            />
            {/* Branding overlay — centered */}
            <View style={styles.heroContent}>
              <Text style={styles.heroWordmark}>SnapSpace</Text>
              <Text style={styles.heroTagline}>Design your space with SnapSpace MarketPlace</Text>
            </View>
          </View>

          {/* ── Form — slides up from bottom on mount ──────────────── */}
          <Animated.View style={{ transform: [{ translateY: formSlideY }] }}>
          <View style={styles.formSection}>
            {isSignUp && (
              <>
                <MinimalInput
                  placeholder="Full Name"
                  value={name}
                  onChangeText={setName}
                  autoCapitalize="words"
                />
                {errors.name && <Text style={styles.errorText}>{errors.name}</Text>}
              </>
            )}

            <MinimalInput
              placeholder="Email"
              value={email}
              onChangeText={(t) => setEmail(t.toLowerCase())}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              textContentType="emailAddress"
            />
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

            <MinimalInput
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              textContentType={isSignUp ? 'newPassword' : 'password'}
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              showToggle
              onToggle={() => setShowPassword((v) => !v)}
              showPassword={showPassword}
            />
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

            {isSignUp && (
              <>
                <MinimalInput
                  placeholder="Confirm Password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                  textContentType="newPassword"
                  autoComplete="new-password"
                />
                {errors.confirmPassword && (
                  <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                )}
                <MinimalInput
                  placeholder="Referral Code (optional)"
                  value={referralCode}
                  onChangeText={(text) => setReferralCode(text.toUpperCase())}
                  autoCapitalize="characters"
                  textContentType="none"
                  autoComplete="off"
                />
              </>
            )}

            {!isSignUp && (
              <TouchableOpacity
                style={styles.forgotBtn}
                activeOpacity={0.7}
                onPress={handleForgotPassword}
              >
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            {/* ── CTA Button ── */}
            <Animated.View style={{ transform: [{ scale: btnScale }] }}>
              <TouchableOpacity
                style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
                onPress={handleAuth}
                onPressIn={() => pressIn(btnScale)}
                onPressOut={() => pressOut(btnScale)}
                disabled={loading}
                activeOpacity={1}
              >
                {loading ? (
                  <LensLoader size={20} color="#fff" light="#fff" />
                ) : (
                  <Text style={styles.primaryBtnText}>
                    {isSignUp ? 'Create Account' : 'Sign In'}
                  </Text>
                )}
              </TouchableOpacity>
            </Animated.View>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            <Animated.View style={{ transform: [{ scale: appleScale }] }}>
              <AppleAuthentication.AppleAuthenticationButton
                buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
                buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
                cornerRadius={14}
                style={styles.appleBtn}
                onPress={async () => {
                  pressIn(appleScale);
                  setTimeout(() => pressOut(appleScale), 120);
                  safeSetLoading(true);
                  try {
                    await signInWithApple();
                    navigation.reset({ index: 0, routes: [{ name: 'Main' }] });
                  } catch (err) {
                    if (err.code !== 'ERR_REQUEST_CANCELED') {
                      Alert.alert('Apple Sign-In Failed', err.message);
                    }
                  } finally {
                    safeSetLoading(false);
                  }
                }}
              />
            </Animated.View>
          </View>

          <TouchableOpacity style={styles.switchBtn} onPress={switchMode} activeOpacity={0.7}>
            <Text style={styles.switchText}>
              {isSignUp ? 'Already have an account?  ' : "Dont have an account?  "}
              <Text style={styles.switchLink}>{isSignUp ? 'Sign in' : 'Sign Up'}</Text>
            </Text>
          </TouchableOpacity>
          </Animated.View>
        </Animated.ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  flex: { flex: 1 },
  scroll: {
    flexGrow: 1,
    paddingBottom: 40,
  },

  // ── Hero ──
  heroWrap: {
    width: SCREEN_W,
    height: HERO_H,
    position: 'relative',
    overflow: 'hidden',
  },
  heroImg: {
    width: '100%',
    height: HERO_H + HERO_PARALLAX,
    marginTop: -HERO_PARALLAX,
  },
  heroContent: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroWordmark: {
    fontSize: 38,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 8,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroTagline: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: 0.2,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // ── Form ──
  formSection: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
    paddingHorizontal: 28,
    paddingTop: 28,
  },

  errorText: { fontSize: 12, color: '#E74C3C', marginTop: -8, marginBottom: 10, marginLeft: 4 },

  forgotBtn: { alignSelf: 'flex-end', marginBottom: 20, marginTop: -4 },
  forgotText: { fontSize: 13, color: BLUE, fontWeight: '600' },

  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtn: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
    backgroundColor: '#67ACE9',
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E5E7EB' },
  dividerText: { fontSize: 12, color: '#BBBBBB', fontWeight: '500' },

  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#000',
    borderRadius: 14,
    height: 54,
  },
  appleBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },

  switchBtn: { marginTop: 28, alignItems: 'center' },
  switchText: { fontSize: 14, color: '#ABABAB' },
  switchLink: { color: BLUE, fontWeight: '700' },
});
