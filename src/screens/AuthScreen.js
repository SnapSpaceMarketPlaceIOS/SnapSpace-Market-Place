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
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';

function AppleIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="#000" stroke="none">
      <Path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </Svg>
  );
}

const BLUE = '#0B6DC3';

// ── Minimal Input Field ────────────────────────────────────────────────────────

function MinimalInput({
  placeholder,
  value,
  onChangeText,
  secureTextEntry,
  keyboardType,
  autoCapitalize,
  showToggle,
  onToggle,
  showPassword,
}) {
  const [focused, setFocused] = useState(false);

  return (
    <View
      style={[
        inputStyles.wrap,
        focused && inputStyles.wrapFocused,
      ]}
    >
      <TextInput
        style={inputStyles.input}
        placeholder={placeholder}
        placeholderTextColor="#ABABAB"
        value={value}
        onChangeText={onChangeText}
        secureTextEntry={secureTextEntry}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCapitalize || 'none'}
        autoCorrect={false}
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
    height: 54,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#D7D7D7',
  },
  wrapFocused: {
    borderColor: BLUE,
  },
  input: {
    flex: 1,
    fontSize: 15,
    color: '#111',
  },
  toggleText: {
    fontSize: 13,
    color: '#ABABAB',
    fontWeight: '500',
    marginLeft: 8,
  },
});

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function AuthScreen() {
  const { signIn } = useAuth();
  const [isSignUp, setIsSignUp] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  const validate = () => {
    if (!isSignUp) return true;
    const e = {};
    if (!name.trim()) e.name = 'Full name is required.';
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email address.';
    if (password.length < 6) e.password = 'Password must be at least 6 characters.';
    if (password !== confirmPassword) e.confirmPassword = 'Passwords do not match.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleAuth = () => {
    if (!validate()) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      signIn({ email: email || 'admin@snapspace.app', name: isSignUp ? name : 'SnapSpace User' });
    }, 600);
  };

  const handleAppleSignIn = () => {
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      signIn({ email: 'user@icloud.com', name: 'SnapSpace User' });
    }, 1000);
  };

  const switchMode = () => {
    setIsSignUp((v) => !v);
    setErrors({});
    setPassword('');
    setConfirmPassword('');
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* Logo section */}
          <View style={styles.logoSection}>
            <Text style={styles.wordmark}>SnapSpace</Text>
            <Text style={styles.tagline}>Design your space with AI.</Text>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {isSignUp && (
              <>
                <MinimalInput
                  placeholder="Full name"
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
              onChangeText={setEmail}
              keyboardType="email-address"
            />
            {errors.email && <Text style={styles.errorText}>{errors.email}</Text>}

            <MinimalInput
              placeholder="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              showToggle
              onToggle={() => setShowPassword((v) => !v)}
              showPassword={showPassword}
            />
            {errors.password && <Text style={styles.errorText}>{errors.password}</Text>}

            {isSignUp && (
              <>
                <MinimalInput
                  placeholder="Confirm password"
                  value={confirmPassword}
                  onChangeText={setConfirmPassword}
                  secureTextEntry={!showPassword}
                />
                {errors.confirmPassword && (
                  <Text style={styles.errorText}>{errors.confirmPassword}</Text>
                )}
              </>
            )}

            {!isSignUp && (
              <TouchableOpacity style={styles.forgotBtn} activeOpacity={0.7}>
                <Text style={styles.forgotText}>Forgot password?</Text>
              </TouchableOpacity>
            )}

            {/* Sign In / Create Account button */}
            <TouchableOpacity
              style={[styles.primaryBtn, loading && styles.primaryBtnDisabled]}
              onPress={handleAuth}
              disabled={loading}
              activeOpacity={0.85}
            >
              {loading ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.primaryBtnText}>
                  {isSignUp ? 'Create Account' : 'Sign In'}
                </Text>
              )}
            </TouchableOpacity>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Continue with Apple */}
            <TouchableOpacity
              style={styles.appleBtn}
              onPress={handleAppleSignIn}
              activeOpacity={0.85}
            >
              <AppleIcon />
              <Text style={styles.appleBtnText}>Continue with Apple</Text>
            </TouchableOpacity>
          </View>

          {/* Sign Up link */}
          <TouchableOpacity style={styles.switchBtn} onPress={switchMode} activeOpacity={0.7}>
            <Text style={styles.switchText}>
              {isSignUp ? 'Already have an account?  ' : "Don't have an account?  "}
              <Text style={styles.switchLink}>{isSignUp ? 'Sign In' : 'Sign Up'}</Text>
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  flex: { flex: 1 },

  scroll: {
    flexGrow: 1,
    paddingHorizontal: 28,
    paddingBottom: 32,
  },

  // Logo
  logoSection: {
    alignItems: 'center',
    paddingTop: 72,
    paddingBottom: 52,
  },
  wordmark: {
    fontSize: 36,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.8,
    marginBottom: 10,
  },
  tagline: {
    fontSize: 14,
    color: '#ABABAB',
    fontWeight: '400',
    letterSpacing: 0.1,
  },

  // Form
  form: {
    width: '100%',
  },

  // Error
  errorText: {
    fontSize: 12,
    color: '#E74C3C',
    marginTop: -10,
    marginBottom: 10,
    marginLeft: 4,
  },

  // Forgot
  forgotBtn: { alignSelf: 'flex-end', marginBottom: 22, marginTop: -4 },
  forgotText: { fontSize: 13, color: BLUE, fontWeight: '600' },

  // Primary button
  primaryBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnDisabled: { opacity: 0.6 },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Divider
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#E8E8E8' },
  dividerText: { fontSize: 12, color: '#BBBBBB', fontWeight: '500' },

  // Apple button
  appleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#000',
    borderRadius: 14,
    height: 56,
  },
  appleBtnText: { color: '#000', fontSize: 15, fontWeight: '700' },

  // Switch
  switchBtn: { marginTop: 32, alignItems: 'center' },
  switchText: { fontSize: 14, color: '#ABABAB' },
  switchLink: { color: BLUE, fontWeight: '700' },
});
