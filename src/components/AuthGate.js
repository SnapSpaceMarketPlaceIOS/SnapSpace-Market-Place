/**
 * AuthGate — inline sign-up / sign-in form embedded directly in Snap, Cart,
 * and Profile screens. Matches the redesigned AuthScreen: title + subtitle +
 * light gray form card + auto-scrolling product marquee.
 *
 * Props:
 *   title      {string}  — headline shown above the form (unused — title is static)
 *   subtitle   {string}  — optional supporting copy (unused — subtitle adapts to mode)
 *   navigation {object}  — React Navigation prop (for VerifyEmailSent redirect)
 *   onSuccess  {function} optional — called after successful auth (default: noop)
 */
import React, { useState, useEffect, useMemo, useRef } from 'react';
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
  Easing,
  Alert,
  Dimensions,
} from 'react-native';
import Svg, { Path, Line } from 'react-native-svg';
import * as AppleAuthentication from 'expo-apple-authentication';
import { useAuth } from '../context/AuthContext';
import LensLoader from './LensLoader';
import CardImage from './CardImage';
import { PRODUCT_CATALOG } from '../data/productCatalog';

const { width: SCREEN_W } = Dimensions.get('window');
const BLUE = '#67ACE9';

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
    borderRadius: 8,
    paddingHorizontal: 16,
    height: 52,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  wrapFocused: { borderColor: BLUE },
  input: { flex: 1, fontSize: 15, color: '#111', fontFamily: 'Geist_400Regular' },
  toggleText: { fontSize: 13, color: '#ABABAB', fontWeight: '500', marginLeft: 8, fontFamily: 'Geist_500Medium' },
});

// ── Product Marquee ───────────────────────────────────────────────────────────
// Auto-scrolling horizontal strip of full product cards. Non-interactive.

const MARQUEE_CARD_W = 170;
const MARQUEE_IMG_H = 160;
const MARQUEE_GAP = 12;
const MARQUEE_CARD_R = Math.round(MARQUEE_CARD_W * 0.05);

function StarSmall({ filled = true, size = 11 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? '#67ACE9' : '#E5E7EB'} stroke={filled ? '#67ACE9' : '#D1D5DB'} strokeWidth={1}>
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  );
}

function PlusSmall() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={1.5} strokeLinecap="round">
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

function MarqueeCard({ product }) {
  const ratingVal = typeof product.rating === 'number' ? product.rating : parseFloat(product.rating) || 0;
  const priceVal = typeof product.price === 'number' ? product.price : parseFloat(String(product.price).replace(/[^0-9.]/g, '')) || 0;
  const priceStr = `$${priceVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <View style={mS.card}>
      <View style={mS.imgWrap}>
        <CardImage uri={product.imageUrl} style={mS.img} placeholderColor="#E8EDF5" />
      </View>
      <View style={mS.body}>
        <Text style={mS.name} numberOfLines={2}>{product.name}</Text>
        <Text style={mS.brand} numberOfLines={1}>{product.brand}</Text>
        {ratingVal > 0 && (
          <View style={mS.rating}>
            {[1,2,3,4,5].map(i => (
              <StarSmall key={i} size={11} filled={i <= Math.round(ratingVal)} />
            ))}
            <Text style={mS.ratingText}>{ratingVal.toFixed(1)}</Text>
            {!!product.reviewCount && (
              <Text style={mS.reviews}>({product.reviewCount.toLocaleString()})</Text>
            )}
          </View>
        )}
        <View style={mS.priceRow}>
          <Text style={mS.price}>{priceStr}</Text>
          <View style={mS.plusBtn}>
            <PlusSmall />
          </View>
        </View>
      </View>
    </View>
  );
}

function ProductMarquee({ products }) {
  const translateX = useRef(new Animated.Value(0)).current;
  const doubled = useMemo(() => [...products, ...products], [products]);
  const totalW = products.length * (MARQUEE_CARD_W + MARQUEE_GAP);

  useEffect(() => {
    if (totalW === 0) return;
    translateX.setValue(0);
    const anim = Animated.loop(
      Animated.timing(translateX, {
        toValue: -totalW,
        duration: 40000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    anim.start();
    return () => anim.stop();
  }, [totalW]);

  if (products.length === 0) return null;

  return (
    <View style={mS.wrap} pointerEvents="none">
      <View style={mS.sepLine} />
      <View style={mS.scrollArea}>
        <Animated.View style={[mS.row, { transform: [{ translateX }] }]}>
          {doubled.map((p, i) => (
            <MarqueeCard key={`${p.id || i}-${i}`} product={p} />
          ))}
        </Animated.View>
      </View>
      <View style={mS.sepLine} />
    </View>
  );
}

const mS = StyleSheet.create({
  wrap: {
    marginTop: 24,
  },
  sepLine: {
    height: 1,
    backgroundColor: '#E5E7EB',
  },
  scrollArea: {
    overflow: 'hidden',
    paddingVertical: 16,
  },
  row: {
    flexDirection: 'row',
    gap: MARQUEE_GAP,
    paddingHorizontal: 20,
  },
  card: {
    width: MARQUEE_CARD_W,
    backgroundColor: '#fff',
    borderRadius: MARQUEE_CARD_R,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  imgWrap: {
    width: '100%',
    height: MARQUEE_IMG_H,
    backgroundColor: '#F4F5F7',
  },
  img: {
    width: '100%',
    height: '100%',
  },
  body: {
    padding: 10,
    gap: 2,
  },
  name: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: '#111',
    lineHeight: 17,
  },
  brand: {
    fontSize: 11,
    fontFamily: 'Geist_400Regular',
    color: '#9CA3AF',
    marginTop: 1,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    marginTop: 3,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: '#111',
    marginLeft: 2,
  },
  reviews: {
    fontSize: 10,
    fontFamily: 'Geist_400Regular',
    color: '#9CA3AF',
    marginLeft: 2,
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  price: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: BLUE,
  },
  plusBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

// ── AuthGate ──────────────────────────────────────────────────────────────────

// Module-level state so the sign-in/sign-up mode is shared across every tab's
// AuthGate mount. Previously each tab (Snap, Cart, Profile, Explore) rendered
// its own AuthGate with its own `isSignUp = useState(true)`, so tapping
// between tabs showed different walls (some in sign-up mode, some in sign-in)
// depending on which tab the user had last interacted with. The user reported
// this as "multiple different sign-in walls" on 2026-04-18.
//
// Defaulting to SIGN-IN (not sign-up) because the majority of users opening
// the app already have an account — returning users shouldn't see a
// "create account" form as the default view. New users can still tap the
// "Sign Up" link at the bottom to switch.
let _sharedIsSignUp = false;
const _authModeSubscribers = new Set();
function setSharedAuthMode(next) {
  _sharedIsSignUp = next;
  for (const fn of _authModeSubscribers) fn(next);
}

export default function AuthGate({ title, subtitle, navigation, onSuccess }) {
  const { signUp, signIn, signInWithApple } = useAuth();

  // ── Button bounce animations ───────────────────────────────────────────────
  const btnScale   = useRef(new Animated.Value(1)).current;
  const appleScale = useRef(new Animated.Value(1)).current;
  const pressIn  = (anim) => Animated.spring(anim, { toValue: 0.94, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  const pressOut = (anim) => Animated.spring(anim, { toValue: 1,    useNativeDriver: true, speed: 18, bounciness: 14 }).start();

  // Subscribe to the shared isSignUp state. Every AuthGate instance on screen
  // reflects the same mode, so the user never sees two different walls as
  // they switch tabs.
  const [isSignUp, setIsSignUpLocal] = useState(_sharedIsSignUp);
  useEffect(() => {
    _authModeSubscribers.add(setIsSignUpLocal);
    return () => { _authModeSubscribers.delete(setIsSignUpLocal); };
  }, []);
  const setIsSignUp = setSharedAuthMode;
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState({});

  // ── Top-quality catalog products for marquee ─────────────────────────────
  // Only sofas, beds, and rugs (the visually impactful categories the user
  // wants displayed). Sorted by quality score so the best-reviewed items
  // float to the top.
  const marqueeProducts = useMemo(() => {
    const allowedCats = new Set(['sofa', 'bed', 'rug']);
    return PRODUCT_CATALOG
      .filter(p => allowedCats.has(p.category) && (p.rating || 0) >= 4.0)
      .map(p => ({ ...p, _qualityScore: (p.rating || 0) * Math.log((p.reviewCount || 1) + 1) }))
      .sort((a, b) => b._qualityScore - a._qualityScore)
      .slice(0, 12);
  }, []);

  const validate = () => {
    const e = {};
    if (isSignUp && !name.trim()) e.name = 'Full name is required.';
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) e.email = 'Enter a valid email.';
    if (password.length < 6) e.password = 'Password must be at least 6 characters.';
    if (isSignUp && password !== confirmPassword) e.confirmPassword = 'Passwords do not match.';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // Safety net — force-clear the spinner after 25s so it can never get stuck
  // if a Supabase call hangs. AuthContext itself has a 15s timeout + 3 retries
  // so worst case is ~45s, but the user should see an error by then.
  const loadingTimerRef = useRef(null);
  const safeSetLoading = (val) => {
    if (val) {
      loadingTimerRef.current = setTimeout(() => setLoading(false), 25000);
    } else {
      clearTimeout(loadingTimerRef.current);
    }
    setLoading(val);
  };

  const handleAuth = async () => {
    if (!validate()) return;
    safeSetLoading(true);
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
        // signIn eagerly sets the user state in AuthContext, so the parent
        // screen (Snap/Cart/Profile) re-renders and swaps AuthGate for the
        // actual content. onSuccess is a no-op hook for callers that want
        // to react to success (e.g. kick off a pending action).
        onSuccess?.();
      }
    } catch (err) {
      Alert.alert(
        isSignUp ? 'Sign Up Failed' : 'Sign In Failed',
        err.message || 'Something went wrong. Please try again.'
      );
    } finally {
      safeSetLoading(false);
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
    // Toggle based on the CURRENT shared mode (isSignUp reflects it reactively).
    setIsSignUp(!isSignUp);
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
        {/* ── Top: Title + Subtitle ──────────────────────────────── */}
        <View style={s.header}>
          <Text style={s.title}>HomeGenie</Text>
          <Text style={s.subtitle}>
            {isSignUp ? 'Shop and Design your room with AI' : 'Welcome Back, Ready To Shop?'}
          </Text>
        </View>

        {/* ── Middle: Form card (light gray panel) ───────────────── */}
        <View style={s.formCard}>
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
              cornerRadius={8}
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

        {/* ── Bottom: Auto-scrolling product marquee ─────────────── */}
        <ProductMarquee products={marqueeProducts} />

      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },
  scroll: { flexGrow: 1, paddingBottom: 32 },

  // ── Header: title + subtitle ──
  header: {
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  title: {
    fontSize: 36,
    fontWeight: '800',
    fontFamily: 'Geist_700Bold',
    color: '#111',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: BLUE,
    textAlign: 'center',
    marginTop: 10,
  },

  // ── Form card (gray panel) ──
  formCard: {
    backgroundColor: '#F4F5F7',
    borderRadius: 12,
    marginHorizontal: 20,
    padding: 20,
  },

  err: { fontSize: 12, color: '#E74C3C', marginTop: -8, marginBottom: 10, marginLeft: 4, fontFamily: 'Geist_400Regular' },

  primaryBtn: {
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 8,
    backgroundColor: BLUE,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'Geist_700Bold' },

  dividerRow: { flexDirection: 'row', alignItems: 'center', marginVertical: 18, gap: 12 },
  dividerLine: { flex: 1, height: 1, backgroundColor: '#D8DCE2' },
  dividerText: { fontSize: 12, color: '#9CA3AF', fontWeight: '500', fontFamily: 'Geist_500Medium' },

  appleBtn: {
    height: 54,
  },

  switchBtn: { marginTop: 20, alignItems: 'center' },
  switchText: { fontSize: 14, color: '#9CA3AF', fontFamily: 'Geist_400Regular' },
  switchLink: { color: BLUE, fontWeight: '700', fontFamily: 'Geist_700Bold' },
});
