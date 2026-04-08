import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Polyline, Line, Rect } from 'react-native-svg';
import { colors } from '../constants/colors';
import { space, radius, fontWeight, fontSize, uiColors, typeScale, shadow } from '../constants/tokens';
import { Button, Badge, SectionHeader } from '../components/ds';
import { supabase } from '../services/supabase';
import { useAuth } from '../context/AuthContext';
import { useOrderHistory } from '../context/OrderHistoryContext';

// ── Icons ──────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function RestoreIcon({ size = 52, color = colors.bluePrimary }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="1 4 1 10 7 10" />
      <Path d="M3.51 15a9 9 0 1 0 .49-3.51" />
    </Svg>
  );
}

function CheckCircleIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.bluePrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
      <Polyline points="22 4 12 14.01 9 11.01" />
    </Svg>
  );
}

function PackageIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#888" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={16.5} y1={9.4} x2={7.55} y2={4.24} />
      <Path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <Polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <Line x1={12} y1={22.08} x2={12} y2={12} />
    </Svg>
  );
}

// ── Data ───────────────────────────────────────────────────────────────────────

const WHAT_GETS_RESTORED = [
  'Premium subscription & AI generation limits',
  'All previously purchased design packs',
  'Unlocked styles and room templates',
  'Pro account features and badges',
];

const STEPS = [
  {
    number: '1',
    title: 'Sign in to the same account',
    desc: 'Make sure you\'re signed in with the Apple ID or Google account you used for the original purchase.',
  },
  {
    number: '2',
    title: 'Tap "Restore Purchases"',
    desc: 'Hit the button below. We\'ll check your purchase history with the App Store and restore everything automatically.',
  },
  {
    number: '3',
    title: 'Wait for confirmation',
    desc: 'Restoration usually takes just a few seconds. You\'ll see a confirmation once everything has been applied to your account.',
  },
];

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function RestorePurchaseScreen({ navigation }) {
  const { user } = useAuth();
  const { orders, addOrder } = useOrderHistory();
  const [restoring, setRestoring] = useState(false);
  const [restored, setRestored] = useState(false);
  const [restoredCount, setRestoredCount] = useState(0);

  const handleRestore = async () => {
    if (!user) {
      Alert.alert('Sign In Required', 'Please sign in to restore your purchases.', [{ text: 'OK' }]);
      return;
    }
    setRestoring(true);
    try {
      // Fetch all fulfilled supplier orders for this user from Supabase
      const { data, error } = await supabase
        .from('supplier_orders')
        .select('*')
        .eq('buyer_id', user.id)
        .eq('status', 'fulfilled')
        .order('ordered_at', { ascending: false });

      if (error) throw error;

      // Reconcile: add any orders not already in local history
      const existingIds = new Set(orders.map((o) => o.id));
      const newOrders = (data || []).filter((o) => !existingIds.has(o.id));
      for (const o of newOrders) {
        addOrder({
          id: o.id,
          date: o.ordered_at,
          status: o.status,
          items: o.items ?? [],
          subtotal: o.subtotal ?? 0,
          shipping: o.shipping ?? 0,
          total: o.total ?? 0,
        });
      }
      setRestoredCount(newOrders.length);
      setRestored(true);
      Alert.alert(
        'Purchases Restored',
        newOrders.length > 0
          ? `${newOrders.length} purchase${newOrders.length > 1 ? 's' : ''} restored to your account.`
          : 'All your purchases are already up to date.',
        [{ text: 'Great, thanks!' }]
      );
    } catch (err) {
      Alert.alert('Restore Failed', 'Unable to restore purchases. Please try again.', [{ text: 'OK' }]);
    } finally {
      setRestoring(false);
    }
  };

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
          <Text style={styles.headerTitle}>Restore Purchase</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* Hero */}
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <RestoreIcon />
          </View>
          <Text style={styles.heroTitle}>Restore Your Purchases</Text>
          <Text style={styles.heroSubtitle}>
            Already bought something? Restore all your previous purchases to this device instantly — no charge.
          </Text>
        </View>

        {/* What gets restored */}
        <Text style={styles.sectionLabel}>WHAT GETS RESTORED</Text>
        <View style={styles.card}>
          {WHAT_GETS_RESTORED.map((item, i) => (
            <View
              key={i}
              style={[styles.checkRow, i < WHAT_GETS_RESTORED.length - 1 && styles.checkRowBorder]}
            >
              <CheckCircleIcon />
              <Text style={styles.checkText}>{item}</Text>
            </View>
          ))}
        </View>

        {/* Steps */}
        <Text style={styles.sectionLabel}>HOW IT WORKS</Text>
        <View style={styles.card}>
          {STEPS.map((step, i) => (
            <View
              key={i}
              style={[styles.stepRow, i < STEPS.length - 1 && styles.stepRowBorder]}
            >
              <View style={styles.stepNumber}>
                <Text style={styles.stepNumberText}>{step.number}</Text>
              </View>
              <View style={styles.stepContent}>
                <Text style={styles.stepTitle}>{step.title}</Text>
                <Text style={styles.stepDesc}>{step.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Note */}
        <View style={styles.noteCard}>
          <PackageIcon />
          <Text style={styles.noteText}>
            Purchases are tied to your Apple ID. If you used a different account, sign out and sign back in with the correct one before restoring.
          </Text>
        </View>

        {/* CTA */}
        <TouchableOpacity
          style={[styles.restoreBtn, (restoring || restored) && styles.restoreBtnDisabled]}
          onPress={handleRestore}
          activeOpacity={0.85}
          disabled={restoring || restored}
        >
          <Text style={styles.restoreBtnText}>
            {restoring ? 'Restoring…' : restored ? '✓  Purchases Restored' : 'Restore Purchases'}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.contactLink}
          onPress={() => navigation.navigate('Help')}
          activeOpacity={0.7}
        >
          <Text style={styles.contactLinkText}>Having trouble? Visit Help & Support</Text>
        </TouchableOpacity>

        <View style={{ height: 48 }} />
      </ScrollView>
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
    fontFamily: 'KantumruyPro_700Bold',
    color: '#111',
    letterSpacing: -0.3,
  },

  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 28,
  },

  // Hero
  hero: {
    alignItems: 'center',
    marginBottom: 32,
    paddingHorizontal: 12,
  },
  heroIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  heroTitle: {
    fontSize: 22,
    fontWeight: '800',
    fontFamily: 'KantumruyPro_700Bold',
    color: '#111',
    letterSpacing: -0.4,
    marginBottom: 10,
    textAlign: 'center',
  },
  heroSubtitle: {
    fontSize: 14,
    fontFamily: 'KantumruyPro_400Regular',
    color: '#67ACE9',
    lineHeight: 22,
    textAlign: 'center',
  },

  sectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'KantumruyPro_700Bold',
    color: '#A0A0A8',
    letterSpacing: 1,
    marginBottom: 10,
    marginTop: 4,
  },

  card: {
    backgroundColor: '#fff',
    borderRadius: 18,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 2,
    overflow: 'hidden',
  },

  // Check rows
  checkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  checkRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F6',
  },
  checkText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'KantumruyPro_500Medium',
    color: '#111',
    lineHeight: 20,
  },

  // Steps
  stepRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  stepRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F4F4F6',
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bluePrimary,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  stepNumberText: {
    fontSize: 13,
    fontWeight: '800',
    fontFamily: 'KantumruyPro_700Bold',
    color: '#fff',
  },
  stepContent: {
    flex: 1,
  },
  stepTitle: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'KantumruyPro_700Bold',
    color: '#111',
    marginBottom: 4,
  },
  stepDesc: {
    fontSize: 13,
    fontFamily: 'KantumruyPro_400Regular',
    color: '#666',
    lineHeight: 19,
  },

  // Note
  noteCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    backgroundColor: '#F8FAFF',
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E8EEF8',
    marginBottom: 28,
  },
  noteText: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'KantumruyPro_400Regular',
    color: '#666',
    lineHeight: 19,
  },

  // Button
  restoreBtn: {
    backgroundColor: colors.bluePrimary,
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.bluePrimary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
    elevation: 6,
    marginBottom: 16,
  },
  restoreBtnDisabled: {
    backgroundColor: '#A0C4E8',
    shadowOpacity: 0,
    elevation: 0,
  },
  restoreBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'KantumruyPro_700Bold',
  },
  contactLink: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  contactLinkText: {
    fontSize: 13,
    color: colors.bluePrimary,
    fontWeight: '500',
    fontFamily: 'KantumruyPro_500Medium',
  },
});
