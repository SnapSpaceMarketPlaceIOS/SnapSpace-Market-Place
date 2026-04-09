import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import LensLoader from '../components/LensLoader';
import { useAuth } from '../context/AuthContext';
import { space, radius, fontWeight, fontSize, uiColors, typeScale, shadow } from '../constants/tokens';
import { Button, Badge, SectionHeader } from '../components/ds';

const BLUE = '#0B6DC3';

function EnvelopeIcon() {
  return (
    <Svg width={56} height={56} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
      <Path d="M22 6l-10 7L2 6" />
    </Svg>
  );
}

function CheckCircleIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={10} />
      <Path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

export default function VerifyEmailSentScreen({ route, navigation }) {
  const { email = 'your email address' } = route.params || {};
  const { resendVerificationEmail } = useAuth();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    if (!email) return;
    setResending(true);
    try {
      await resendVerificationEmail(email);
      setResent(true);
      setTimeout(() => setResent(false), 5000);
    } catch (err) {
      Alert.alert('Error', err.message);
    } finally {
      setResending(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.container}>
        {/* Icon */}
        <View style={styles.iconWrap}>
          <EnvelopeIcon />
        </View>

        {/* Heading */}
        <Text style={styles.title}>Check your inbox</Text>
        <Text style={styles.body}>
          We sent a verification link to{'\n'}
          <Text style={styles.email}>{email}</Text>
        </Text>
        <Text style={styles.instructions}>
          Tap the link in that email to verify your account, then come back and sign in.
        </Text>

        {/* Resent confirmation */}
        {resent && (
          <View style={styles.resentRow}>
            <CheckCircleIcon />
            <Text style={styles.resentText}>Verification email resent!</Text>
          </View>
        )}

        {/* Actions */}
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => navigation.replace('Auth')}
          activeOpacity={0.85}
        >
          <Text style={styles.primaryBtnText}>Go to Sign In</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.resendBtn}
          onPress={handleResend}
          disabled={resending}
          activeOpacity={0.7}
        >
          {resending ? (
            <LensLoader size={20} />
          ) : (
            <Text style={styles.resendText}>Resend verification email</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#fff' },
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 32,
  },

  iconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 28,
  },

  title: {
    fontSize: 26,
    fontWeight: '800',
    fontFamily: 'Geist_700Bold',
    color: '#111',
    letterSpacing: -0.5,
    marginBottom: 12,
    textAlign: 'center',
  },
  body: {
    fontSize: 15,
    fontFamily: 'Geist_400Regular',
    color: '#666',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 6,
  },
  email: {
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#111',
  },
  instructions: {
    fontSize: 14,
    fontFamily: 'Geist_400Regular',
    color: '#999',
    textAlign: 'center',
    lineHeight: 21,
    marginTop: 8,
    marginBottom: 28,
  },

  resentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  resentText: { fontSize: 13, color: '#16A34A', fontWeight: '600', fontFamily: 'Geist_600SemiBold'},

  primaryBtn: {
    backgroundColor: BLUE,
    borderRadius: 14,
    height: 56,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700', fontFamily: 'Geist_700Bold'},

  resendBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resendText: { fontSize: 14, color: BLUE, fontWeight: '600', fontFamily: 'Geist_600SemiBold'},
});
