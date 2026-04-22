import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';
import { colors } from '../constants/colors';
import { safeOpenURL } from '../utils/safeOpenURL';

// ── Icons ──────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function AppleIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="#111">
      <Path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </Svg>
  );
}

function ShieldIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.bluePrimary} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <Polyline points="9 12 11 14 15 10" />
    </Svg>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function PaymentMethodsScreen({ navigation }) {
  return (
    <View style={styles.container}>
      <SafeAreaView edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <BackIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Payment</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <View style={styles.content}>
        <View style={styles.iconCircle}>
          <AppleIcon />
        </View>

        <Text style={styles.title}>Managed by Apple</Text>
        <Text style={styles.body}>
          All subscriptions and token purchases are processed securely through your Apple ID. Your payment method is managed in your device settings.
        </Text>

        <View style={styles.infoCard}>
          <ShieldIcon />
          <View style={{ flex: 1 }}>
            <Text style={styles.infoTitle}>Secure payments</Text>
            <Text style={styles.infoBody}>Transactions are handled by Apple with end-to-end encryption. HomeGenie never sees your payment details.</Text>
          </View>
        </View>

        <TouchableOpacity
          style={styles.settingsBtn}
          activeOpacity={0.8}
          onPress={() => safeOpenURL('https://apps.apple.com/account/subscriptions')}
        >
          <Text style={styles.settingsBtnText}>Manage Subscriptions</Text>
        </TouchableOpacity>

        <Text style={styles.footnote}>
          To update your payment method, go to{'\n'}Settings → Apple ID → Payment & Shipping
        </Text>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    backgroundColor: '#fff',
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F4F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    fontFamily: 'Geist_700Bold',
    color: '#111',
    letterSpacing: -0.3,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 28,
    paddingTop: 48,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F4F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#111',
    marginBottom: 10,
  },
  body: {
    fontSize: 15,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 22,
    marginBottom: 28,
  },
  infoCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#F0F0F0',
    marginBottom: 28,
    width: '100%',
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: '#111',
    marginBottom: 4,
  },
  infoBody: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: '#6B7280',
    lineHeight: 18,
  },
  settingsBtn: {
    backgroundColor: colors.bluePrimary,
    borderRadius: 14,
    paddingVertical: 14,
    paddingHorizontal: 28,
    width: '100%',
    alignItems: 'center',
    marginBottom: 16,
  },
  settingsBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
  },
  footnote: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 18,
  },
});
