/**
 * AuthGate — inline sign-up / sign-in form embedded directly in Snap, Cart,
 * and Profile screens. Matches the AuthScreen hero + gradient design.
 *
 * Props:
 *   title      {string}  — headline shown above the form (unused — hero replaces it)
 *   subtitle   {string}  — supporting copy below the headline
 *   navigation {object}  — React Navigation prop (for VerifyEmailSent redirect)
 *   onSuccess  {function} optional — called after successful auth (default: noop)
 */
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
import LensLoader from './LensLoader';

const { width: SCREEN_W } = Dimensions.get('window');
const HERO_H = 240;
const HERO_PARALLAX = 100;
const BLUE = '#0B6DC3';

const HERO_IMG = require('../../assets/snap-bg.jpg');

// ── Reusable input ────────────────────────────────────────────────────────────

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
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={[iS.wrap, focused && iS.wrapFocused]}>
      <TextInput
        style={iS.input}
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
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {showToggle && (
        <TouchableOpacity
          onPress={onToggle}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={iS.toggleText}>{showPassword ? 'Hide' : 'Show'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const iS = StyleSheet.create({
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

// ── AuthGate ──────────────────────────────────────────────────────────────────

export default function AuthGate({ title, subtitle, navigation, onSuccess }) {
  const { signUp, signIn, signInWithApple } = useAuth();

  // ── Parallax — plain JS setValue, no native driver needed
  const heroScrollY  = React.useRef(new Animated.Value(0)).current;
  const heroParallax = React.useRef(
    heroScrollY.interpolate({ inputRange: [0, HERO_H], outputRange: [0, HERO_PARALLAX], extrapolate: 'clamp' }),
  ).current;

  // ── Button bounce animations ───────────────────────────────────────────────
  const btnScale   = React.useRef(new Animated.Value(1)).current;
  const appleScale = React.useRef(new Animated.Value(1)).current;
  const pressIn  = (anim) => Animated.spring(anim, { toValue: 0.94, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  const pressOut = (anim) => Animated.spring(anim, { toValue: 1,    useNativeDriver: true, speed: 18, bounciness: 14 }).start();

  // ── Form slide-up entrance ────────────────────────────────────────────────
  const formSlideY = React.useRef(new Animated.Value(700)).current;
  React.useEffect(() => {
    Animated.spring(formSlideY, { toValue: 0, useNativeDriver: true, speed: 13, bounciness: 4 }).start();
  }, []);

  const [isSignUp, setIsSignUp] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    const e = {};
    if (isSignUp && !name.trim()) e.name = 'Full name is required.';
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email.';
    if (password.length < 6) e.password = 'Password must be at least 6 characters.';
    if (isSignUp && password !== confirmPassword) e.confirmPassword = 'Passwords do not match.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAuth = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      if (isSignUp) {
        const result = await signUp(name, email, password);
        if (result.needsEmailVerification) {
          navigation.navigate('VerifyEmailSent', { email });
        } else {
          onSuccess?.();
        }
      } else {
        await signIn(email, password);
        onSuccess?.();
      }
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleApple = async () => {
    pressIn(appleScale);
    setTimeout(() => pressOut(appleScale), 120);
    setLoading(true);
    try {
      await signInWithApple();
      onSuccess?.();
    } catch (err) {
      if (err.code !== 'ERR_REQUEST_CANCELED') {
        Alert.alert('Apple Sign-In Failed', err.message);
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = () => {
    setIsSignUp((v) => !v);
    setErrors({});
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <Animated.ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
        scrollEventThrottle={16}
        onScroll={(e) => heroScrollY.setValue(e.nativeEvent.contentOffset.y)}
      >
        {/* ── Hero Image ─────────────────────────────────────────── */}
        <View style={s.heroWrap}>
          <Animated.Image
            source={HERO_IMG}
            style={[s.heroImg, { transform: [{ translateY: heroParallax }] }]}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.heroContent}>
            <Text style={s.heroWordmark}>SnapSpace</Text>
            <Text style={s.heroTagline}>Design your space with SnapSpace MarketPlace</Text>
          </View>
        </View>

        {/* ── Form — slides up from bottom on mount ──────────────── */}
        <Animated.View style={{ transform: [{ translateY: formSlideY }] }}>
        <View style={s.formSection}>
          {isSignUp && (
            <>
              <MinimalInput
                placeholder="Full Name"
                value={name}
                onChangeText={setName}
                textContentType="name"
                autoComplete="name"
              />
              {errors.name && <Text style={s.err}>{errors.name}</Text>}
            </>
          )}

          <MinimalInput
            placeholder="Email"
            value={email}
            onChangeText={(t) => setEmail(t.toLowerCase())}
            keyboardType="email-address"
            textContentType="emailAddress"
            autoComplete="email"
          />
          {errors.email && <Text style={s.err}>{errors.email}</Text>}

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
          {errors.password && <Text style={s.err}>{errors.password}</Text>}

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
              {errors.confirmPassword && <Text style={s.err}>{errors.confirmPassword}</Text>}
            </>
          )}

          {/* ── CTA Button ── */}
          <Animated.View style={{ transform: [{ scale: btnScale }] }}>
            <TouchableOpacity
              style={[s.primaryBtn, loading && { opacity: 0.6 }]}
              onPress={handleAuth}
              onPressIn={() => pressIn(btnScale)}
              onPressOut={() => pressOut(btnScale)}
              disabled={loading}
              activeOpacity={1}
            >
              {loading ? (
                <LensLoader size={20} color="#fff" light="#fff" />
              ) : (
                <Text style={s.primaryBtnText}>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </Text>
              )}
            </TouchableOpacity>
          </Animated.View>

          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
          </View>

          <Animated.View style={{ transform: [{ scale: appleScale }] }}>
            <AppleAuthentication.AppleAuthenticationButton
              buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
              buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
              cornerRadius={14}
              style={s.appleBtn}
              onPress={handleApple}
            />
          </Animated.View>
        </View>

        {/* Switch mode */}
        <TouchableOpacity style={s.switchBtn} onPress={switchMode} activeOpacity={0.7}>
          <Text style={s.switchText}>
            {isSignUp ? 'Already have an account?  ' : "Don't have an account?  "}
            <Text style={s.switchLink}>{isSignUp ? 'Sign In' : 'Sign Up'}</Text>
          </Text>
        </TouchableOpacity>
        </Animated.View>
      </Animated.ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  scroll: { flexGrow: 1, paddingBottom: 40 },

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
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 6,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroTagline: {
    fontSize: 13,
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
    paddingHorizontal: 24,
    paddingTop: 24,
  },

  err: { fontSize: 12, color: '#E74C3C', marginTop: -8, marginBottom: 10, marginLeft: 4 },

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
    height: 54,
    borderRadius: 14,
  },

  switchBtn: { marginTop: 24, alignItems: 'center', paddingBottom: 8 },
  switchText: { fontSize: 14, color: '#ABABAB' },
  switchLink: { color: BLUE, fontWeight: '700' },
});
