import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Polyline, Line } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import { space, radius, fontWeight, fontSize, uiColors, typeScale, shadow } from '../constants/tokens';
import { Button, Badge, SectionHeader } from '../components/ds';
import { Supplier } from '../services/api';

const BLUE = '#0B6DC3';
const BLUE_DARK = '#1D4ED8';

const TOTAL_STEPS = 3;

// ── Icons ─────────────────────────────────────────────────────────────────────

function CheckIcon({ color = '#fff', size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 6L9 17l-5-5" />
    </Svg>
  );
}

function StoreIcon() {
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={BLUE_DARK} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
      <Polyline points="9 22 9 12 15 12 15 22" />
    </Svg>
  );
}

function PolicyIcon() {
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke={BLUE_DARK} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <Polyline points="14 2 14 8 20 8" />
      <Line x1={16} y1={13} x2={8} y2={13} />
      <Line x1={16} y1={17} x2={8} y2={17} />
      <Polyline points="10 9 9 9 8 9" />
    </Svg>
  );
}

function RocketIcon() {
  return (
    <Svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={BLUE_DARK} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
      <Path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
      <Path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
      <Path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
    </Svg>
  );
}


// ── Progress bar ──────────────────────────────────────────────────────────────

function ProgressBar({ step }) {
  return (
    <View style={styles.progressWrap}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const done = i < step - 1;
        const active = i === step - 1;
        return (
          <React.Fragment key={i}>
            <View style={[styles.dot, done && styles.dotDone, active && styles.dotActive]}>
              {done ? <CheckIcon size={12} /> : (
                <Text style={[styles.dotNum, active && styles.dotNumActive]}>{i + 1}</Text>
              )}
            </View>
            {i < TOTAL_STEPS - 1 && (
              <View style={[styles.line, done && styles.lineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

// ── Form field ────────────────────────────────────────────────────────────────

function Field({ label, value, onChangeText, placeholder, multiline, hint, required, autoCapitalize, keyboardType }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>{label}{required && <Text style={{ color: '#EF4444' }}> *</Text>}</Text>
      {hint && <Text style={styles.fieldHint}>{hint}</Text>}
      <TextInput
        style={[styles.input, focused && styles.inputFocused, multiline && styles.inputMulti]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#ABABAB"
        multiline={multiline}
        autoCapitalize={autoCapitalize || 'sentences'}
        keyboardType={keyboardType || 'default'}
        autoCorrect={false}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export default function SupplierOnboardingScreen({ navigation }) {
  const { user } = useAuth();
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);

  // Step 1 — Storefront
  const [storeName, setStoreName] = useState('');
  const [slug, setSlug] = useState('');
  const [tagline, setTagline] = useState('');

  // Step 2 — Policies
  const [returnPolicy, setReturnPolicy] = useState(
    'We accept returns within 30 days of delivery for unused items in original packaging.'
  );
  const [shippingPolicy, setShippingPolicy] = useState(
    'Orders ship within 2–3 business days. Standard shipping takes 5–7 business days.'
  );

  const slideAnim = useRef(new Animated.Value(0)).current;

  const animateStep = (dir) => {
    slideAnim.setValue(dir === 'forward' ? 40 : -40);
    Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 12, useNativeDriver: true }).start();
  };

  // Auto-generate slug from store name
  const handleStoreName = (val) => {
    setStoreName(val);
    setSlug(val.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50));
  };

  const validate = () => {
    if (step === 1) {
      if (!storeName.trim()) { Alert.alert('Required', 'Please enter a store name.'); return false; }
      if (!slug.trim()) { Alert.alert('Required', 'Please enter a storefront URL slug.'); return false; }
    }
    return true;
  };

  const goNext = () => {
    if (!validate()) return;
    animateStep('forward');
    setStep(s => s + 1);
  };

  const goBack = () => {
    if (step === 1) return;
    animateStep('back');
    setStep(s => s - 1);
  };

  const handleFinish = async () => {
    setSaving(true);
    try {
      await Supplier.updateStorefront(user, {
        storefront_slug: slug.trim(),
        tagline: tagline.trim() || null,
        return_policy: returnPolicy.trim() || null,
        shipping_policy: shippingPolicy.trim() || null,
      });
      navigation.replace('SupplierDashboard');
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save your store settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const STEP_CONFIG = [
    { icon: <StoreIcon />, title: 'Set up your storefront', subtitle: 'Give your store a name and a unique URL.' },
    { icon: <PolicyIcon />, title: 'Review your policies', subtitle: 'Buyers will see these on your store page. Edit them to match your business.' },
    { icon: <RocketIcon />, title: 'You\'re all set!', subtitle: 'Your store is ready. Head to your dashboard to list your first product.' },
  ];

  const cfg = STEP_CONFIG[step - 1];

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        {step > 1 && step < 3 ? (
          <TouchableOpacity onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M19 12H5M12 5l-7 7 7 7" />
            </Svg>
          </TouchableOpacity>
        ) : <View style={{ width: 22 }} />}
        <Text style={styles.headerTitle}>Seller Setup</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Progress */}
      <View style={styles.progressSection}>
        <ProgressBar step={step} />
        <Text style={styles.stepLabel}>Step {step} of {TOTAL_STEPS}</Text>
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>

            {/* Step icon + heading */}
            <View style={styles.heroRow}>
              <View style={styles.heroIcon}>{cfg.icon}</View>
              <View style={{ flex: 1 }}>
                <Text style={styles.stepTitle}>{cfg.title}</Text>
                <Text style={styles.stepSubtitle}>{cfg.subtitle}</Text>
              </View>
            </View>

            {/* ── STEP 1: Storefront ── */}
            {step === 1 && (
              <View>
                <Field
                  label="Store Name"
                  value={storeName}
                  onChangeText={handleStoreName}
                  placeholder="e.g. Acme Home Goods"
                  required
                />
                <Field
                  label="Storefront URL"
                  value={slug}
                  onChangeText={setSlug}
                  placeholder="acme-home-goods"
                  autoCapitalize="none"
                  hint="snapspace.com/store/your-slug — lowercase letters, numbers and hyphens only."
                  required
                />
                <Field
                  label="Tagline"
                  value={tagline}
                  onChangeText={setTagline}
                  placeholder="Handcrafted goods for the modern home."
                  hint="A short description shown on your public storefront (optional)."
                />

                {/* Payout placeholder */}
                <View style={styles.payoutCard}>
                  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  </Svg>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.payoutTitle}>Payout Setup</Text>
                    <Text style={styles.payoutBody}>Stripe Connect integration — configure from your dashboard after setup.</Text>
                  </View>
                </View>
              </View>
            )}

            {/* ── STEP 2: Policies ── */}
            {step === 2 && (
              <View>
                <Field
                  label="Return Policy"
                  value={returnPolicy}
                  onChangeText={setReturnPolicy}
                  placeholder="Describe your return policy…"
                  multiline
                />
                <Field
                  label="Shipping Policy"
                  value={shippingPolicy}
                  onChangeText={setShippingPolicy}
                  placeholder="Describe your shipping policy…"
                  multiline
                />
              </View>
            )}

            {/* ── STEP 3: Done ── */}
            {step === 3 && (
              <View style={styles.doneSection}>
                <View style={styles.doneCard}>
                  {[
                    { label: 'Store Name', value: storeName },
                    { label: 'URL', value: `snapspace.com/store/${slug}` },
                    { label: 'Tagline', value: tagline || 'Not set' },
                  ].map(r => (
                    <View key={r.label} style={styles.doneRow}>
                      <Text style={styles.doneLabel}>{r.label}</Text>
                      <Text style={styles.doneValue} numberOfLines={1}>{r.value}</Text>
                    </View>
                  ))}
                </View>

                <View style={styles.tipsCard}>
                  <Text style={styles.tipsTitle}>Next steps</Text>
                  {['List your first product from the Products tab', 'Complete your payout setup in Store Settings', 'Share your storefront link to start driving traffic'].map((tip, i) => (
                    <View key={i} style={styles.tipRow}>
                      <View style={styles.tipDot} />
                      <Text style={styles.tipText}>{tip}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

          </Animated.View>
        </ScrollView>

        {/* Bottom action */}
        <View style={styles.bottomBar}>
          {step < TOTAL_STEPS ? (
            <TouchableOpacity style={styles.nextBtn} onPress={goNext} activeOpacity={0.85}>
              <Text style={styles.nextBtnText}>Continue</Text>
              <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M5 12h14M12 5l7 7-7 7" />
              </Svg>
            </TouchableOpacity>
          ) : (
            <TouchableOpacity
              style={[styles.nextBtn, saving && { opacity: 0.6 }]}
              onPress={handleFinish}
              disabled={saving}
              activeOpacity={0.85}
            >
              {saving
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={styles.nextBtnText}>Go to My Dashboard</Text>
              }
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111', letterSpacing: -0.2 },
  progressSection: { alignItems: 'center', paddingVertical: 16, paddingHorizontal: 32 },
  progressWrap: { flexDirection: 'row', alignItems: 'center', width: '100%', maxWidth: 240, marginBottom: 8 },
  dot: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#E2E8F0',
  },
  dotActive: { backgroundColor: BLUE, borderColor: BLUE },
  dotDone: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  dotNum: { fontSize: 12, fontWeight: '700', color: '#94A3B8' },
  dotNumActive: { color: '#fff' },
  line: { flex: 1, height: 2, backgroundColor: '#E2E8F0' },
  lineDone: { backgroundColor: '#16A34A' },
  stepLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '600' },
  scroll: { paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 },
  heroRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 14, marginBottom: 28 },
  heroIcon: {
    width: 60, height: 60, borderRadius: 16,
    backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center',
  },
  stepTitle: { fontSize: 20, fontWeight: '800', color: '#111', letterSpacing: -0.4, marginBottom: 4 },
  stepSubtitle: { fontSize: 13, color: '#6B7280', lineHeight: 19 },
  field: { marginBottom: 18 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6 },
  fieldHint: { fontSize: 11, color: '#9CA3AF', marginBottom: 6, marginTop: -2 },
  input: {
    borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111', backgroundColor: '#FAFAFA',
  },
  inputFocused: { borderColor: BLUE, backgroundColor: '#fff' },
  inputMulti: { minHeight: 100, textAlignVertical: 'top' },
  payoutCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F9FAFB', borderRadius: 12,
    padding: 14, marginTop: 4, borderWidth: 1, borderColor: '#E5E7EB',
  },
  payoutTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 2 },
  payoutBody: { fontSize: 12, color: '#9CA3AF', lineHeight: 17 },
  doneSection: { gap: 12 },
  doneCard: {
    backgroundColor: '#F9FAFB', borderRadius: 14,
    borderWidth: 1, borderColor: '#E5E7EB', overflow: 'hidden',
  },
  doneRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
  },
  doneLabel: { fontSize: 13, color: '#9CA3AF', fontWeight: '600' },
  doneValue: { fontSize: 13, color: '#111', fontWeight: '600', flex: 1, textAlign: 'right' },
  tipsCard: {
    backgroundColor: '#EFF6FF', borderRadius: 14,
    padding: 16, borderWidth: 1, borderColor: '#BFDBFE',
  },
  tipsTitle: { fontSize: 13, fontWeight: '700', color: '#1E3A5F', marginBottom: 10 },
  tipRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
  tipDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: BLUE_DARK, marginTop: 6 },
  tipText: { fontSize: 13, color: '#374151', flex: 1, lineHeight: 19 },
  bottomBar: {
    paddingHorizontal: 20, paddingVertical: 14,
    borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)', backgroundColor: '#fff',
  },
  nextBtn: {
    backgroundColor: BLUE_DARK, borderRadius: 14, height: 56,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
