/**
 * AuthGate — inline sign-up / sign-in form embedded directly in Snap, Cart,
 * and Profile screens. Eliminates the dead-end "navigate to Auth" wall.
 *
 * Props:
 *   title      {string}  — headline shown above the form
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
} from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../context/AuthContext';
import LensLoader from './LensLoader';

const BLUE = '#0B6DC3';

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
    borderWidth: 1.5,
    borderColor: '#D7D7D7',
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
        {/* Wordmark + subtitle */}
        <View style={s.logoRow}>
          <Text style={s.wordmark}>SnapSpace</Text>
          <Text style={s.contextSub}>{subtitle}</Text>
        </View>

        {/* Form card */}
        <View style={s.card}>
          {isSignUp && (
            <>
              <MinimalInput
                placeholder="Full name"
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
                placeholder="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                secureTextEntry={!showPassword}
                textContentType="newPassword"
                autoComplete="new-password"
              />
              {errors.confirmPassword && <Text style={s.err}>{errors.confirmPassword}</Text>}
            </>
          )}

          <TouchableOpacity
            style={[s.primaryBtn, loading && { opacity: 0.6 }]}
            onPress={handleAuth}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <LensLoader size={20} color="#fff" light="#fff" />
            ) : (
              <Text style={s.primaryBtnText}>
                {isSignUp ? 'Create Account' : 'Sign In'}
              </Text>
            )}
          </TouchableOpacity>

          {/* Divider */}
          <View style={s.dividerRow}>
            <View style={s.dividerLine} />
            <Text style={s.dividerText}>or</Text>
            <View style={s.dividerLine} />
          </View>

          {/* Apple */}
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
  scroll: { flexGrow: 1, paddingHorizontal: 24, paddingBottom: 40 },

  logoRow: { alignItems: 'center', paddingTop: 56, marginBottom: 28 },
  wordmark: { fontSize: 30, fontWeight: '800', color: '#111', letterSpacing: -0.5, marginBottom: 6 },
  tagline: { fontSize: 13, color: '#ABABAB', fontWeight: '400' },

  contextRow: { alignItems: 'center', marginBottom: 28, paddingHorizontal: 8 },
  contextTitle: { fontSize: 20, fontWeight: '800', color: '#0F172A', textAlign: 'center', marginBottom: 6 },
  contextSub: { fontSize: 14, color: BLUE, textAlign: 'center', lineHeight: 20 },

  card: {
    backgroundColor: '#FAFAFA',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 4,
  },

  err: { fontSize: 12, color: '#E74C3C', marginTop: -8, marginBottom: 10, marginLeft: 4 },

  primaryBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E8E8E8' },
  dividerText: { fontSize: 12, color: '#BBBBBB', fontWeight: '500' },

  appleBtn: { height: 54, width: '100%' },

  switchBtn: { marginTop: 24, alignItems: 'center' },
  switchText: { fontSize: 14, color: '#ABABAB' },
  switchLink: { color: BLUE, fontWeight: '700' },
});
