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
import LensLoader from '../components/LensLoader';
import CardImage from '../components/CardImage';
import { applyReferralCode } from '../services/subscriptionService';
import { PRODUCT_CATALOG } from '../data/productCatalog';

const { width: SCREEN_W } = Dimensions.get('window');
const BLUE = '#67ACE9';

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
// Auto-scrolling horizontal strip of full product cards (image + name + brand
// + rating + price + plus button), drifting left. Non-interactive (pointerEvents:
// none). List is doubled for seamless loop.

const MARQUEE_CARD_W = 170;
const MARQUEE_IMG_H = 160;
const MARQUEE_GAP = 12;
// 5% corner radius — 170 * 0.05 ≈ 8.5
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
    <View style={marqueeStyles.card}>
      <View style={marqueeStyles.imgWrap}>
        <CardImage uri={product.imageUrl} style={marqueeStyles.img} placeholderColor="#E8EDF5" />
      </View>
      <View style={marqueeStyles.body}>
        <Text style={marqueeStyles.name} numberOfLines={2}>{product.name}</Text>
        <Text style={marqueeStyles.brand} numberOfLines={1}>{product.brand}</Text>
        {ratingVal > 0 && (
          <View style={marqueeStyles.rating}>
            {[1,2,3,4,5].map(i => (
              <StarSmall key={i} size={11} filled={i <= Math.round(ratingVal)} />
            ))}
            <Text style={marqueeStyles.ratingText}>{ratingVal.toFixed(1)}</Text>
            {!!product.reviewCount && (
              <Text style={marqueeStyles.reviews}>({product.reviewCount.toLocaleString()})</Text>
            )}
          </View>
        )}
        <View style={marqueeStyles.priceRow}>
          <Text style={marqueeStyles.price}>{priceStr}</Text>
          <View style={marqueeStyles.plusBtn}>
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
    <View style={marqueeStyles.wrap} pointerEvents="none">
      <View style={marqueeStyles.sepLine} />
      <View style={marqueeStyles.scrollArea}>
        <Animated.View style={[marqueeStyles.row, { transform: [{ translateX }] }]}>
          {doubled.map((p, i) => (
            <MarqueeCard key={`${p.id || i}-${i}`} product={p} />
          ))}
        </Animated.View>
      </View>
      <View style={marqueeStyles.sepLine} />
    </View>
  );
}

const marqueeStyles = StyleSheet.create({
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

  // ── Button bounce animations ─────────────────────────────────────────────
  const btnScale = useRef(new Animated.Value(1)).current;
  const appleScale = useRef(new Animated.Value(1)).current;
  const pressIn  = (anim) => Animated.spring(anim, { toValue: 0.94, useNativeDriver: true, speed: 60, bounciness: 0 }).start();
  const pressOut = (anim) => Animated.spring(anim, { toValue: 1,    useNativeDriver: true, speed: 18, bounciness: 14 }).start();

  // ── Top-quality catalog products for marquee ─────────────────────────────
  // Only sofas, beds, and rugs (the visually impactful categories the user
  // wants displayed). Sorted by quality score (rating * log(reviews)) so the
  // best-reviewed items float to the top. Stable per mount via useMemo.
  const marqueeProducts = useMemo(() => {
    const allowedCats = new Set(['sofa', 'bed', 'rug']);
    return PRODUCT_CATALOG
      .filter(p => allowedCats.has(p.category) && (p.rating || 0) >= 4.0)
      .map(p => ({ ...p, _qualityScore: (p.rating || 0) * Math.log((p.reviewCount || 1) + 1) }))
      .sort((a, b) => b._qualityScore - a._qualityScore)
      .slice(0, 12);
  }, []);

  // Safety net — force-clear the spinner after 16s so it can never get stuck.
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
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ── Top: Title + Subtitle ──────────────────────────────── */}
          <View style={styles.header}>
            <Text style={styles.title}>HomeGenie</Text>
            <Text style={styles.subtitle}>
              {isSignUp ? 'Design your dream room with AI. Shop the look instantly.' : 'Welcome back — let\'s design your next room.'}
            </Text>
          </View>

          {/* ── Middle: Form card (light gray panel) ───────────────── */}
          <View style={styles.formCard}>
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
                    {isSignUp ? 'Get Started — It\'s Free' : 'Sign In'}
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
                cornerRadius={8}
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

          {/* ── "Don't have an account? Sign Up" (below the card) ── */}
          <TouchableOpacity style={styles.switchBtn} onPress={switchMode} activeOpacity={0.7}>
            <Text style={styles.switchText}>
              {isSignUp ? 'Already have an account?  ' : "Don't have an account?  "}
              <Text style={styles.switchLink}>{isSignUp ? 'Sign in' : 'Sign Up'}</Text>
            </Text>
          </TouchableOpacity>

          {/* ── Bottom: Auto-scrolling product marquee ─────────────── */}
          <ProductMarquee products={marqueeProducts} />

        </ScrollView>
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
    paddingBottom: 32,
  },

  // ── Header: title + subtitle ──
  header: {
    alignItems: 'center',
    paddingTop: 80,
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

  errorText: { fontSize: 12, color: '#E74C3C', marginTop: -8, marginBottom: 10, marginLeft: 4, fontFamily: 'Geist_400Regular' },

  forgotBtn: { alignSelf: 'flex-end', marginBottom: 16, marginTop: -4 },
  forgotText: { fontSize: 13, color: BLUE, fontWeight: '600', fontFamily: 'Geist_600SemiBold' },

  primaryBtnDisabled: { opacity: 0.6 },
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
