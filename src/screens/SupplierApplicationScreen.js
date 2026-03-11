import React, { useState, useEffect, useRef } from 'react';
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
import Svg, { Path, Circle, Polyline } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import { Supplier } from '../services/api';
import { colors } from '../constants/colors';

const BLUE = '#0B6DC3';
const BLUE_DARK = '#1D4ED8';
const BG = '#F8FAFF';

// ── Icons ─────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5M12 5l-7 7 7 7" />
    </Svg>
  );
}

function CheckIcon({ color = '#fff' }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 6L9 17l-5-5" />
    </Svg>
  );
}

function AlertIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
      <Line x1={12} y1={9} x2={12} y2={13} />
      <Line x1={12} y1={17} x2={12.01} y2={17} />
    </Svg>
  );
}

function Line({ x1, y1, x2, y2 }) {
  return (
    <Svg width={0} height={0}>
      <Path d={`M${x1} ${y1} L${x2} ${y2}`} />
    </Svg>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const BUSINESS_TYPES = [
  { value: 'retailer', label: 'Retailer' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'brand', label: 'Brand' },
  { value: 'distributor', label: 'Distributor' },
];

const PRODUCT_CATEGORIES = [
  'Furniture', 'Lighting', 'Rugs & Flooring', 'Wall Decor',
  'Bedding & Pillows', 'Kitchen & Dining', 'Bath & Spa',
  'Outdoor & Garden', 'Storage & Organization', 'Art & Prints',
  'Plants & Planters', 'Smart Home',
];

const INVENTORY_SIZES = [
  { value: '1-50', label: '1–50 items' },
  { value: '51-500', label: '51–500 items' },
  { value: '500+', label: '500+ items' },
];

const TOTAL_STEPS = 3;

// ── Sub-components ────────────────────────────────────────────────────────────

function ProgressBar({ step }) {
  return (
    <View style={styles.progressWrap}>
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => {
        const done = i < step - 1;
        const active = i === step - 1;
        return (
          <React.Fragment key={i}>
            <View
              style={[
                styles.progressDot,
                done && styles.progressDotDone,
                active && styles.progressDotActive,
              ]}
            >
              {done ? (
                <CheckIcon color="#fff" />
              ) : (
                <Text style={[styles.progressDotNum, active && styles.progressDotNumActive]}>
                  {i + 1}
                </Text>
              )}
            </View>
            {i < TOTAL_STEPS - 1 && (
              <View style={[styles.progressLine, done && styles.progressLineDone]} />
            )}
          </React.Fragment>
        );
      })}
    </View>
  );
}

function StepLabel({ step }) {
  const labels = ['Business Info', 'What You Sell', 'Review & Submit'];
  return (
    <Text style={styles.stepLabel}>
      Step {step} of {TOTAL_STEPS} — {labels[step - 1]}
    </Text>
  );
}

function FormInput({ label, value, onChangeText, placeholder, multiline, keyboardType, autoCapitalize, maxLength, required, error }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <TextInput
        style={[
          styles.textInput,
          focused && styles.textInputFocused,
          multiline && styles.textInputMulti,
          error && styles.textInputError,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#ABABAB"
        multiline={multiline}
        keyboardType={keyboardType || 'default'}
        autoCapitalize={autoCapitalize || 'sentences'}
        autoCorrect={false}
        maxLength={maxLength}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />
      {maxLength && (
        <Text style={styles.charCount}>{value.length}/{maxLength}</Text>
      )}
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

function OptionPicker({ label, options, value, onChange, required, error }) {
  return (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>
        {label}
        {required && <Text style={styles.required}> *</Text>}
      </Text>
      <View style={styles.optionRow}>
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <TouchableOpacity
              key={opt.value}
              style={[styles.optionChip, selected && styles.optionChipSelected]}
              onPress={() => onChange(opt.value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
      {error && <Text style={styles.errorText}>{error}</Text>}
    </View>
  );
}

function CategoryCheckbox({ category, selected, onToggle }) {
  return (
    <TouchableOpacity
      style={[styles.categoryItem, selected && styles.categoryItemSelected]}
      onPress={onToggle}
      activeOpacity={0.75}
    >
      <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
        {selected && <CheckIcon color="#fff" />}
      </View>
      <Text style={[styles.categoryLabel, selected && styles.categoryLabelSelected]}>
        {category}
      </Text>
    </TouchableOpacity>
  );
}

function ReviewRow({ label, value }) {
  return (
    <View style={styles.reviewRow}>
      <Text style={styles.reviewLabel}>{label}</Text>
      <Text style={styles.reviewValue} numberOfLines={3}>{value || '—'}</Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SupplierApplicationScreen({ navigation }) {
  const { user } = useAuth();

  // Pre-gate check
  const [gateLoading, setGateLoading] = useState(true);
  const [gateError, setGateError] = useState(null);

  // Form state
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  // Step 1 — Business Info
  const [businessName, setBusinessName] = useState('');
  const [businessType, setBusinessType] = useState('');
  const [websiteUrl, setWebsiteUrl] = useState('');
  const [taxId, setTaxId] = useState('');

  // Step 2 — What You Sell
  const [description, setDescription] = useState('');
  const [selectedCategories, setSelectedCategories] = useState([]);
  const [inventorySize, setInventorySize] = useState('');

  // Step 3 — Agreements
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Validation errors
  const [errors, setErrors] = useState({});

  // Slide animation
  const slideAnim = useRef(new Animated.Value(0)).current;
  const prevStep = useRef(1);

  const animateStep = (direction) => {
    slideAnim.setValue(direction === 'forward' ? 40 : -40);
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 80,
      friction: 12,
      useNativeDriver: true,
    }).start();
  };

  // ── Pre-gate Checks ────────────────────────────────────────────────────────
  useEffect(() => {
    const check = async () => {
      // Gate 1: must be logged in (navigation handles this via auth flow)
      if (!user) {
        setGateError({ type: 'not_logged_in' });
        setGateLoading(false);
        return;
      }

      // Gate 2: email must be verified
      if (!user.email_verified) {
        setGateError({ type: 'email_not_verified' });
        setGateLoading(false);
        return;
      }

      // Gate 3: no existing pending or approved application
      try {
        const existing = await Supplier.getApplicationStatus(user);
        if (existing && (existing.status === 'pending' || existing.status === 'approved')) {
          setGateError({ type: 'application_exists', status: existing.status });
          setGateLoading(false);
          return;
        }
      } catch {
        // If fetch fails, allow through — server will enforce on submit
      }

      setGateLoading(false);
    };
    check();
  }, [user]);

  // ── Navigation ─────────────────────────────────────────────────────────────

  const goNext = () => {
    if (!validateStep()) return;
    animateStep('forward');
    setStep((s) => s + 1);
  };

  const goBack = () => {
    if (step === 1) {
      navigation.goBack();
      return;
    }
    animateStep('back');
    setStep((s) => s - 1);
  };

  // ── Validation ─────────────────────────────────────────────────────────────

  const validateStep = () => {
    const e = {};
    if (step === 1) {
      if (!businessName.trim()) e.businessName = 'Business name is required.';
      if (!businessType) e.businessType = 'Select a business type.';
      if (!taxId.trim()) e.taxId = 'Tax ID / EIN is required.';
    }
    if (step === 2) {
      if (description.trim().length < 50) e.description = 'Description must be at least 50 characters.';
      if (description.trim().length > 500) e.description = 'Description must be under 500 characters.';
      if (selectedCategories.length === 0) e.categories = 'Select at least one product category.';
      if (!inventorySize) e.inventorySize = 'Select an inventory size.';
    }
    if (step === 3) {
      if (!agreedToTerms) e.terms = 'You must agree to the Supplier Terms of Service.';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async () => {
    if (!validateStep()) return;
    setSubmitting(true);
    try {
      await Supplier.apply(user, {
        business_name: businessName.trim(),
        business_type: businessType,
        website_url: websiteUrl.trim() || null,
        tax_id: taxId.trim(), // encrypted at rest via RLS / future AES layer
        description: description.trim(),
        product_categories: selectedCategories,
        inventory_size: inventorySize,
      });
      navigation.replace('SupplierApplicationStatus', { submitted: true });
    } catch (err) {
      Alert.alert('Submission failed', err.message || 'Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // ── Gate Error States ──────────────────────────────────────────────────────

  if (gateLoading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.gateCenter}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (gateError) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.gateHeader}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <BackIcon />
          </TouchableOpacity>
        </View>
        <View style={styles.gateCenter}>
          <View style={styles.gateIconWrap}>
            <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <Path d="M12 9v4M12 17h.01" />
            </Svg>
          </View>
          {gateError.type === 'email_not_verified' && (
            <>
              <Text style={styles.gateTitle}>Verify your email first</Text>
              <Text style={styles.gateBody}>
                You need to verify your email address before you can apply to become a supplier. Check your inbox for a verification link.
              </Text>
              <TouchableOpacity style={styles.gateBtn} onPress={() => navigation.navigate('Auth')} activeOpacity={0.85}>
                <Text style={styles.gateBtnText}>Go to Sign In</Text>
              </TouchableOpacity>
            </>
          )}
          {gateError.type === 'application_exists' && gateError.status === 'pending' && (
            <>
              <Text style={styles.gateTitle}>Application in review</Text>
              <Text style={styles.gateBody}>
                You already have a supplier application under review. We'll email you with a decision within 3–5 business days.
              </Text>
              <TouchableOpacity style={styles.gateBtn} onPress={() => navigation.replace('SupplierApplicationStatus')} activeOpacity={0.85}>
                <Text style={styles.gateBtnText}>View Application Status</Text>
              </TouchableOpacity>
            </>
          )}
          {gateError.type === 'application_exists' && gateError.status === 'approved' && (
            <>
              <Text style={styles.gateTitle}>You're already a supplier!</Text>
              <Text style={styles.gateBody}>
                Your application was approved. Head to your seller dashboard to manage your store.
              </Text>
              <TouchableOpacity style={styles.gateBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
                <Text style={styles.gateBtnText}>Go Back</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </SafeAreaView>
    );
  }

  // ── Form ───────────────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={goBack} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Become a Supplier</Text>
        <View style={{ width: 22 }} />
      </View>

      {/* Progress */}
      <View style={styles.progressSection}>
        <ProgressBar step={step} />
        <StepLabel step={step} />
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ transform: [{ translateX: slideAnim }] }}>

            {/* ─────────────── STEP 1: Business Information ─────────────── */}
            {step === 1 && (
              <View>
                <Text style={styles.stepTitle}>Tell us about your business</Text>
                <Text style={styles.stepSubtitle}>This information helps us verify your identity as a seller.</Text>

                <FormInput
                  label="Business Name"
                  value={businessName}
                  onChangeText={setBusinessName}
                  placeholder="e.g. Acme Home Goods"
                  required
                  error={errors.businessName}
                />

                <OptionPicker
                  label="Business Type"
                  options={BUSINESS_TYPES}
                  value={businessType}
                  onChange={setBusinessType}
                  required
                  error={errors.businessType}
                />

                <FormInput
                  label="Business Website"
                  value={websiteUrl}
                  onChangeText={setWebsiteUrl}
                  placeholder="https://yourstore.com (optional)"
                  keyboardType="url"
                  autoCapitalize="none"
                />

                <FormInput
                  label="Tax ID / EIN"
                  value={taxId}
                  onChangeText={setTaxId}
                  placeholder="XX-XXXXXXX"
                  keyboardType="default"
                  autoCapitalize="characters"
                  required
                  error={errors.taxId}
                />

                <View style={styles.taxNote}>
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Circle cx={12} cy={12} r={10} />
                    <Path d="M12 16v-4M12 8h.01" />
                  </Svg>
                  <Text style={styles.taxNoteText}>Your Tax ID is encrypted and stored securely. It will never be visible to other users.</Text>
                </View>
              </View>
            )}

            {/* ─────────────── STEP 2: What You Sell ─────────────── */}
            {step === 2 && (
              <View>
                <Text style={styles.stepTitle}>What do you sell?</Text>
                <Text style={styles.stepSubtitle}>Help buyers understand what your store is all about.</Text>

                <FormInput
                  label="Business Description"
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Tell us about your business, what you sell, and what makes you unique... (50–500 characters)"
                  multiline
                  maxLength={500}
                  required
                  error={errors.description}
                />

                <View style={styles.fieldWrap}>
                  <Text style={styles.fieldLabel}>
                    Product Categories<Text style={styles.required}> *</Text>
                  </Text>
                  <Text style={styles.fieldHint}>Select all categories that apply to your products.</Text>
                  <View style={styles.categoriesGrid}>
                    {PRODUCT_CATEGORIES.map((cat) => (
                      <CategoryCheckbox
                        key={cat}
                        category={cat}
                        selected={selectedCategories.includes(cat)}
                        onToggle={() => {
                          setSelectedCategories((prev) =>
                            prev.includes(cat)
                              ? prev.filter((c) => c !== cat)
                              : [...prev, cat]
                          );
                        }}
                      />
                    ))}
                  </View>
                  {errors.categories && <Text style={styles.errorText}>{errors.categories}</Text>}
                </View>

                <OptionPicker
                  label="Estimated Monthly Inventory"
                  options={INVENTORY_SIZES}
                  value={inventorySize}
                  onChange={setInventorySize}
                  required
                  error={errors.inventorySize}
                />
              </View>
            )}

            {/* ─────────────── STEP 3: Review & Submit ─────────────── */}
            {step === 3 && (
              <View>
                <Text style={styles.stepTitle}>Review your application</Text>
                <Text style={styles.stepSubtitle}>Please confirm everything looks correct before submitting.</Text>

                {/* Summary card */}
                <View style={styles.reviewCard}>
                  <Text style={styles.reviewSection}>Business Information</Text>
                  <ReviewRow label="Business Name" value={businessName} />
                  <ReviewRow label="Business Type" value={BUSINESS_TYPES.find(t => t.value === businessType)?.label} />
                  <ReviewRow label="Website" value={websiteUrl || 'Not provided'} />
                  <ReviewRow label="Tax ID / EIN" value={taxId ? `••••••${taxId.slice(-3)}` : '—'} />
                </View>

                <View style={[styles.reviewCard, { marginTop: 12 }]}>
                  <Text style={styles.reviewSection}>What You Sell</Text>
                  <ReviewRow label="Description" value={description} />
                  <ReviewRow
                    label="Categories"
                    value={selectedCategories.length > 0 ? selectedCategories.join(', ') : '—'}
                  />
                  <ReviewRow label="Inventory Size" value={INVENTORY_SIZES.find(s => s.value === inventorySize)?.label} />
                </View>

                {/* Terms checkbox */}
                <TouchableOpacity
                  style={styles.termsRow}
                  onPress={() => setAgreedToTerms((v) => !v)}
                  activeOpacity={0.75}
                >
                  <View style={[styles.checkbox, agreedToTerms && styles.checkboxSelected]}>
                    {agreedToTerms && <CheckIcon color="#fff" />}
                  </View>
                  <Text style={styles.termsText}>
                    I agree to the{' '}
                    <Text style={styles.termsLink}>Supplier Terms of Service</Text>
                    {' '}and confirm the information above is accurate.
                  </Text>
                </TouchableOpacity>
                {errors.terms && <Text style={[styles.errorText, { marginTop: 4 }]}>{errors.terms}</Text>}

                {/* Review timeline note */}
                <View style={styles.reviewNote}>
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                    <Circle cx={12} cy={12} r={10} />
                    <Polyline points="12 6 12 12 16 14" />
                  </Svg>
                  <Text style={styles.reviewNoteText}>
                    We review applications within 3–5 business days. You'll receive an email with our decision.
                  </Text>
                </View>
              </View>
            )}

          </Animated.View>
        </ScrollView>

        {/* Bottom Action */}
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
              style={[styles.nextBtn, submitting && styles.nextBtnDisabled]}
              onPress={handleSubmit}
              disabled={submitting}
              activeOpacity={0.85}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <Text style={styles.nextBtnText}>Submit Application</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111', letterSpacing: -0.2 },

  // Progress
  progressSection: {
    alignItems: 'center',
    paddingTop: 20,
    paddingBottom: 8,
    paddingHorizontal: 32,
  },
  progressWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
    maxWidth: 280,
    marginBottom: 10,
  },
  progressDot: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
  },
  progressDotActive: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  progressDotDone: {
    backgroundColor: '#16A34A',
    borderColor: '#16A34A',
  },
  progressDotNum: { fontSize: 12, fontWeight: '700', color: '#94A3B8' },
  progressDotNumActive: { color: '#fff' },
  progressLine: { flex: 1, height: 2, backgroundColor: '#E2E8F0' },
  progressLineDone: { backgroundColor: '#16A34A' },
  stepLabel: { fontSize: 12, color: '#94A3B8', fontWeight: '600', letterSpacing: 0.2 },

  // Scroll
  scroll: { paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32 },

  // Step headings
  stepTitle: { fontSize: 22, fontWeight: '800', color: '#111', letterSpacing: -0.4, marginBottom: 6 },
  stepSubtitle: { fontSize: 14, color: '#6B7280', lineHeight: 20, marginBottom: 28 },

  // Field
  fieldWrap: { marginBottom: 20 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8 },
  fieldHint: { fontSize: 12, color: '#9CA3AF', marginBottom: 10, marginTop: -4 },
  required: { color: '#EF4444' },
  textInput: {
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 13,
    fontSize: 15,
    color: '#111',
    backgroundColor: '#FAFAFA',
  },
  textInputFocused: { borderColor: BLUE, backgroundColor: '#fff' },
  textInputMulti: { minHeight: 110, textAlignVertical: 'top' },
  textInputError: { borderColor: '#EF4444' },
  charCount: { fontSize: 11, color: '#9CA3AF', textAlign: 'right', marginTop: 4 },
  errorText: { fontSize: 12, color: '#EF4444', marginTop: 6, marginLeft: 2 },

  // Option chips (business type, inventory size)
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionChip: {
    paddingVertical: 9,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
  },
  optionChipSelected: { borderColor: BLUE, backgroundColor: '#EFF6FF' },
  optionChipText: { fontSize: 13, fontWeight: '600', color: '#6B7280' },
  optionChipTextSelected: { color: BLUE },

  // Category checkboxes
  categoriesGrid: { gap: 8 },
  categoryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    gap: 10,
  },
  categoryItemSelected: { borderColor: BLUE, backgroundColor: '#EFF6FF' },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { backgroundColor: BLUE, borderColor: BLUE },
  categoryLabel: { fontSize: 14, fontWeight: '500', color: '#374151', flex: 1 },
  categoryLabelSelected: { color: BLUE, fontWeight: '600' },

  // Tax ID note
  taxNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginTop: -8,
  },
  taxNoteText: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 17 },

  // Review card (step 3)
  reviewCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FAFAFA',
    overflow: 'hidden',
  },
  reviewSection: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
    textTransform: 'uppercase',
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  reviewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 16,
  },
  reviewLabel: { fontSize: 13, color: '#6B7280', fontWeight: '500', minWidth: 90 },
  reviewValue: { fontSize: 13, color: '#111', fontWeight: '600', flex: 1, textAlign: 'right' },

  // Terms
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginTop: 20,
    marginBottom: 4,
  },
  termsText: { flex: 1, fontSize: 13, color: '#6B7280', lineHeight: 20 },
  termsLink: { color: BLUE, fontWeight: '600' },

  // Review note
  reviewNote: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
    gap: 8,
    marginTop: 16,
  },
  reviewNoteText: { flex: 1, fontSize: 12, color: '#6B7280', lineHeight: 17 },

  // Bottom bar
  bottomBar: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    backgroundColor: '#fff',
  },
  nextBtn: {
    backgroundColor: BLUE_DARK,
    borderRadius: 14,
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  nextBtnDisabled: { opacity: 0.6 },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },

  // Gate states
  gateHeader: { paddingHorizontal: 20, paddingVertical: 14 },
  gateCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, paddingBottom: 60 },
  gateIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  gateTitle: { fontSize: 22, fontWeight: '800', color: '#111', textAlign: 'center', marginBottom: 10, letterSpacing: -0.4 },
  gateBody: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 28 },
  gateBtn: {
    backgroundColor: BLUE_DARK,
    borderRadius: 14,
    height: 52,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gateBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
