import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  TextInput,
  Alert,
  Linking,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Polyline, Circle, Line } from 'react-native-svg';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors as C } from '../constants/theme';
import { space, radius, typeScale, fontWeight } from '../constants/tokens';
import { safeOpenURL } from '../utils/safeOpenURL';

const BLUE       = '#0B6DC3';
const LIGHT_BLUE = '#67ACE9';
const SUBMITTED_KEY = '@snapspace_supplier_submitted';

// ── Icons ─────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function CheckCircleIcon() {
  return (
    <Svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={10} />
      <Polyline points="9 12 11 14 15 10" />
    </Svg>
  );
}

function StarIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  );
}

function TrendIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="23 6 13.5 15.5 8.5 10.5 1 18" />
      <Polyline points="17 6 23 6 23 12" />
    </Svg>
  );
}

function ShieldIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Svg>
  );
}

function GlobeIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={10} />
      <Line x1={2} y1={12} x2={22} y2={12} />
      <Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </Svg>
  );
}

// ── Business type options ─────────────────────────────────────────────────────

const BUSINESS_TYPES = ['Retailer', 'Manufacturer', 'Brand', 'Distributor', 'Other'];

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SupplierApplicationScreen({ navigation }) {
  const [submitted, setSubmitted] = React.useState(false);
  const [businessName, setBusinessName]   = useState('');
  const [businessType, setBusinessType]   = useState('');
  const [website, setWebsite]             = useState('');
  const [email, setEmail]                 = useState('');
  const [description, setDescription]     = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  // Check if already submitted on mount
  React.useEffect(() => {
    AsyncStorage.getItem(SUBMITTED_KEY).then((val) => {
      if (val === 'true') setSubmitted(true);
    });
  }, []);

  const handleSubmit = () => {
    if (!businessName.trim()) {
      Alert.alert('Missing Info', 'Please enter your business name.');
      return;
    }
    if (!businessType) {
      Alert.alert('Missing Info', 'Please select a business type.');
      return;
    }
    if (!email.trim() || !/\S+@\S+\.\S+/.test(email)) {
      Alert.alert('Missing Info', 'Please enter a valid contact email.');
      return;
    }
    if (!description.trim() || description.trim().length < 30) {
      Alert.alert('Missing Info', 'Please describe your business (at least 30 characters).');
      return;
    }
    if (!agreedToTerms) {
      Alert.alert('Terms Required', 'Please agree to the Supplier Terms before submitting.');
      return;
    }

    const subject = encodeURIComponent(`HomeGenie Supplier Application — ${businessName.trim()}`);
    const body = encodeURIComponent(
      `HOMEGENIE SUPPLIER APPLICATION\n` +
      `================================\n\n` +
      `Business Name:  ${businessName.trim()}\n` +
      `Business Type:  ${businessType}\n` +
      `Website:        ${website.trim() || 'N/A'}\n` +
      `Contact Email:  ${email.trim()}\n\n` +
      `About the Business:\n${description.trim()}\n\n` +
      `================================\n` +
      `Submitted via HomeGenie iOS App`
    );

    // Build 69 Commit I: user-initiated support flow → allow mailto.
    safeOpenURL(`mailto:info@homegenieios.com?subject=${subject}&body=${body}`, {
      allowMailto: true,
      onError: () => Alert.alert('Could not open email', 'Please email info@homegenieios.com directly.'),
    }).then((ok) => {
      if (ok) {
        AsyncStorage.setItem(SUBMITTED_KEY, 'true');
        setSubmitted(true);
      } else {
        Alert.alert('Could not open email', 'Please email info@homegenieios.com directly.');
      }
    });
  };

  // ── Submitted confirmation state ──────────────────────────────────────────

  if (submitted) {
    return (
      <SafeAreaView style={s.root} edges={['top', 'bottom']}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <BackIcon />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Become a Supplier</Text>
          <View style={{ width: 40 }} />
        </View>

        <View style={s.confirmedContainer}>
          <CheckCircleIcon />
          <Text style={s.confirmedTitle}>Application Received</Text>
          <Text style={s.confirmedSubtitle}>
            Thank you for applying to become a HomeGenie Verified Supplier. Our team will review your application and reach out to you at the email you provided within 3–5 business days.
          </Text>
          <View style={s.confirmedNote}>
            <Text style={s.confirmedNoteText}>Questions? Email us at{' '}
              <Text style={s.confirmedNoteLink} onPress={() => safeOpenURL('mailto:info@homegenieios.com', { allowMailto: true })}>
                info@homegenieios.com
              </Text>
            </Text>
          </View>
          <TouchableOpacity style={s.doneBtn} onPress={() => navigation.goBack()} activeOpacity={0.85}>
            <Text style={s.doneBtnText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Application form ──────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SafeAreaView edges={['top']}>
        <View style={s.header}>
          <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
            <BackIcon />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Become a Supplier</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={s.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {/* Hero */}
        <View style={s.hero}>
          <Text style={s.heroTitle}>Sell Your Products{'\n'}on HomeGenie</Text>
          <Text style={s.heroSubtitle}>
            Join our network of verified suppliers and get your products in front of thousands of interior design enthusiasts every day.
          </Text>
        </View>

        {/* Divider */}
        <View style={s.divider} />

        {/* Form */}
        <Text style={s.formSectionTitle}>Application Details</Text>

        <Text style={s.label}>Business Name <Text style={s.required}>*</Text></Text>
        <TextInput
          style={s.input}
          value={businessName}
          onChangeText={setBusinessName}
          placeholder="e.g. Acme Home Goods"
          placeholderTextColor="#ABABAB"
          autoCapitalize="words"
        />

        <Text style={s.label}>Business Type <Text style={s.required}>*</Text></Text>
        <View style={s.pillRow}>
          {BUSINESS_TYPES.map((t) => (
            <TouchableOpacity
              key={t}
              style={[s.pill, businessType === t && s.pillActive]}
              onPress={() => setBusinessType(t)}
              activeOpacity={0.7}
            >
              <Text style={[s.pillText, businessType === t && s.pillTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.label}>Business Website <Text style={s.optional}>(optional)</Text></Text>
        <TextInput
          style={s.input}
          value={website}
          onChangeText={setWebsite}
          placeholder="https://yourstore.com"
          placeholderTextColor="#ABABAB"
          autoCapitalize="none"
          keyboardType="url"
        />

        <Text style={s.label}>Contact Email <Text style={s.required}>*</Text></Text>
        <TextInput
          style={s.input}
          value={email}
          onChangeText={(t) => setEmail(t.toLowerCase())}
          placeholder="you@yourbusiness.com"
          placeholderTextColor="#ABABAB"
          autoCapitalize="none"
          keyboardType="email-address"
          textContentType="emailAddress"
        />

        <Text style={s.label}>Tell us about your business <Text style={s.required}>*</Text></Text>
        <TextInput
          style={[s.input, s.textArea]}
          value={description}
          onChangeText={setDescription}
          placeholder="Describe what you sell, your product categories, and why you'd be a great fit for HomeGenie..."
          placeholderTextColor="#ABABAB"
          multiline
          maxLength={500}
          textAlignVertical="top"
        />
        <Text style={s.charCount}>{description.length}/500</Text>

        {/* Terms */}
        <TouchableOpacity style={s.termsRow} onPress={() => setAgreedToTerms((v) => !v)} activeOpacity={0.7}>
          <View style={[s.checkbox, agreedToTerms && s.checkboxChecked]}>
            {agreedToTerms && (
              <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                <Polyline points="20 6 9 17 4 12" />
              </Svg>
            )}
          </View>
          <Text style={s.termsText}>
            I agree to HomeGenie's{' '}
            <Text style={s.termsLink} onPress={() => navigation.navigate('TermsOfUse')}>
              Supplier Terms of Service
            </Text>
          </Text>
        </TouchableOpacity>

        {/* Submit */}
        <TouchableOpacity style={s.submitBtn} onPress={handleSubmit} activeOpacity={0.85}>
          <Text style={s.submitBtnText}>Submit Application</Text>
        </TouchableOpacity>

        <Text style={s.footerNote}>
          Your application will be sent to our team at info@homegenieios.com. We review all applications within 3–5 business days.
        </Text>

        <View style={{ height: 48 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#fff' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    backgroundColor: '#fff',
  },
  backBtn: {
    width: 40, height: 40,
    borderRadius: 20,
    backgroundColor: '#F4F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#111',
    letterSpacing: -0.3,
  },

  scroll: {
    paddingHorizontal: 20,
    paddingTop: 28,
  },

  // Hero
  hero: {
    marginBottom: 24,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: '800',
    fontFamily: 'Geist_700Bold',
    color: '#0F172A',
    lineHeight: 34,
    letterSpacing: -0.5,
    marginBottom: 10,
  },
  heroSubtitle: {
    fontSize: 15,
    fontFamily: 'Geist_400Regular',
    color: '#67ACE9',
    lineHeight: 22,
  },

  // Benefits
  benefitsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  benefitCard: {
    flex: 1,
    backgroundColor: '#F0F6FF',
    borderRadius: 12,
    padding: 12,
    alignItems: 'flex-start',
    gap: 6,
  },
  benefitIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  benefitTitle: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#0F172A',
  },
  benefitBody: {
    fontSize: 11,
    fontFamily: 'Geist_400Regular',
    color: '#6B7280',
    lineHeight: 15,
  },

  divider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginBottom: 24,
  },

  // Form
  formSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#9CA3AF',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  label: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: '#374151',
    marginBottom: 8,
    marginTop: 4,
  },
  required: { color: '#EF4444' },
  optional: { fontWeight: '400', color: '#9CA3AF', fontSize: 12, fontFamily: 'Geist_400Regular'},

  input: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    fontFamily: 'Geist_400Regular',
    color: '#111',
    backgroundColor: '#FAFAFA',
    marginBottom: 16,
  },
  textArea: {
    height: 110,
    paddingTop: 13,
  },
  charCount: {
    fontSize: 11,
    fontFamily: 'Geist_400Regular',
    color: '#9CA3AF',
    textAlign: 'right',
    marginTop: -12,
    marginBottom: 16,
  },

  // Business type pills
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 16,
  },
  pill: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: '#fff',
  },
  pillActive: {
    borderColor: BLUE,
    backgroundColor: '#EFF6FF',
  },
  pillText: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: '#6B7280',
  },
  pillTextActive: {
    color: BLUE,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
  },

  // Terms
  termsRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 24,
    marginTop: 4,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
    flexShrink: 0,
  },
  checkboxChecked: {
    backgroundColor: BLUE,
    borderColor: BLUE,
  },
  termsText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Geist_400Regular',
    color: '#6B7280',
    lineHeight: 19,
  },
  termsLink: {
    color: BLUE,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
  },

  // Submit
  submitBtn: {
    backgroundColor: BLUE,
    borderRadius: 12,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  submitBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
  },
  footerNote: {
    fontSize: 12,
    fontFamily: 'Geist_400Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 17,
  },

  // Confirmed state
  confirmedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  confirmedTitle: {
    fontSize: 24,
    fontWeight: '800',
    fontFamily: 'Geist_700Bold',
    color: '#0F172A',
    marginTop: 20,
    marginBottom: 12,
    textAlign: 'center',
  },
  confirmedSubtitle: {
    fontSize: 15,
    fontFamily: 'Geist_400Regular',
    color: '#6B7280',
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 24,
  },
  confirmedNote: {
    backgroundColor: '#F0F6FF',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 32,
  },
  confirmedNoteText: {
    fontSize: 13,
    fontFamily: 'Geist_400Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 19,
  },
  confirmedNoteLink: {
    color: BLUE,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
  },
  doneBtn: {
    backgroundColor: BLUE,
    borderRadius: 12,
    height: 52,
    paddingHorizontal: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
  },
});
