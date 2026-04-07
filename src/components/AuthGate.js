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
  Alert,
  Image,
  Dimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../context/AuthContext';
import LensLoader from './LensLoader';

const { width: SCREEN_W } = Dimensions.get('window');
const HERO_H = 240;
const BLUE = '#0B6DC3';
const LIGHT_BLUE = '#67ACE9';

const HERO_IMG = require('../assets/hero/room1.jpg');

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
  wrapFocused: { borderColor: BLUE },
  input: { flex: 1, fontSize: 15, color: '#111' },
  toggleText: { fontSize: 13, color: '#ABABAB', fontWeight: '500', marginLeft: 8 },
});

// ── AuthGate ──────────────────────────────────────────────────────────────────

export default function AuthGate({ title, subtitle, navigation, onSuccess }) {
  const { signUp, signIn, signInWithApple } = useAuth();

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
      <ScrollView
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Hero Image ─────────────────────────────────────────── */}
        <View style={s.heroWrap}>
          <Image source={HERO_IMG} style={s.heroImg} resizeMode="cover" />
          <LinearGradient
            colors={['rgba(0,0,0,0.15)', 'rgba(0,0,0,0.55)']}
            style={StyleSheet.absoluteFill}
          />
          <View style={s.heroContent}>
            <Text style={s.heroWordmark}>SnapSpace</Text>
            <Text style={s.heroTagline}>Design your space with SnapSpace MarketPlace</Text>
          </View>
        </View>

        {/* ── Dark Curve Transition ──────────────────────────────── */}
        <View style={s.curveWrap}>
          <Svg width={SCREEN_W} height={50} viewBox={`0 0 ${SCREEN_W} 50`} preserveAspectRatio="none">
            <Path
              d={`M0,0 L0,20 Q${SCREEN_W / 2},55 ${SCREEN_W},20 L${SCREEN_W},0 Z`}
              fill="#1A1A2E"
            />
          </Svg>
        </View>

        {/* ── Form ───────────────────────────────────────────────── */}
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

          {/* ── Gradient CTA Button ── */}
          <TouchableOpacity
            style={[s.primaryBtnWrap, loading && { opacity: 0.6 }]}
            onPress={handleAuth}
            disabled={loading}
            activeOpacity={0.85}
          >
            <LinearGradient
              colors={['#FFFFFF', LIGHT_BLUE, BLUE]}
              locations={[0.02, 0.33, 0.77]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={s.primaryBtn}
            >
              {loading ? (
                <LensLoader size={20} color="#fff" light="#fff" />
              ) : (
                <Text style={s.primaryBtnText}>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </Text>
              )}
            </LinearGradient>
          </TouchableOpacity>

          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
          </View>

          <AppleAuthentication.AppleAuthenticationButton
            buttonType={AppleAuthentication.AppleAuthenticationButtonType.SIGN_IN}
            buttonStyle={AppleAuthentication.AppleAuthenticationButtonStyle.BLACK}
            cornerRadius={14}
            style={s.appleBtn}
            onPress={handleApple}
          />
        </View>

        {/* Switch mode */}
        <TouchableOpacity style={s.switchBtn} onPress={switchMode} activeOpacity={0.7}>
          <Text style={s.switchText}>
            {isSignUp ? 'Already have an account?  ' : "Don't have an account?  "}
            <Text style={s.switchLink}>{isSignUp ? 'Sign In' : 'Sign Up'}</Text>
          </Text>
        </TouchableOpacity>
      </ScrollView>
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
    height: '100%',
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 28,
    paddingBottom: 32,
  },
  heroWordmark: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
    marginBottom: 5,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroTagline: {
    fontSize: 13,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.88)',
    letterSpacing: 0.2,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  // ── Curve ──
  curveWrap: {
    width: SCREEN_W,
    height: 50,
    marginTop: -1,
    backgroundColor: 'transparent',
  },

  // ── Form ──
  formSection: {
    paddingHorizontal: 24,
    paddingTop: 24,
  },

  err: { fontSize: 12, color: '#E74C3C', marginTop: -8, marginBottom: 10, marginLeft: 4 },

  primaryBtnWrap: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  primaryBtn: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 14,
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
