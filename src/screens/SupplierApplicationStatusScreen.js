import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Polyline } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import { space, radius, fontWeight, fontSize, uiColors, typeScale, shadow } from '../constants/tokens';
import { Button, Badge, SectionHeader } from '../components/ds';
import { Supplier } from '../services/api';

const BLUE = '#0B6DC3';
const BLUE_DARK = '#1D4ED8';

// ── Icons ─────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5M12 5l-7 7 7 7" />
    </Svg>
  );
}

function ClockIcon({ color }) {
  return (
    <Svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={10} />
      <Polyline points="12 6 12 12 16 14" />
    </Svg>
  );
}

function CheckBadgeIcon({ color }) {
  return (
    <Svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2l2.4 4.8 5.3.8-3.8 3.7.9 5.2L12 14l-4.8 2.5.9-5.2L4.3 7.6l5.3-.8z" />
      <Path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

function XCircleIcon({ color }) {
  return (
    <Svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={10} />
      <Path d="M15 9l-6 6M9 9l6 6" />
    </Svg>
  );
}

function ShieldOffIcon({ color }) {
  return (
    <Svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <Path d="M9 9l6 6M15 9l-6 6" />
    </Svg>
  );
}

// ── Confetti dots (simple animated celebration) ───────────────────────────────

function ConfettiDot({ delay, x, color }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.delay(delay),
      Animated.spring(anim, {
        toValue: 1,
        tension: 40,
        friction: 8,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  return (
    <Animated.View
      style={{
        position: 'absolute',
        top: -20,
        left: x,
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: color,
        opacity: anim,
        transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 50] }) }],
      }}
    />
  );
}

const CONFETTI_COLORS = ['#1D4ED8', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];
const CONFETTI_DOTS = Array.from({ length: 18 }, (_, i) => ({
  x: (i * 18) % 300 + Math.floor(i / 16) * 12,
  delay: i * 60,
  color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
}));

// ── Status Card Configs ───────────────────────────────────────────────────────

const STATUS_CONFIG = {
  pending: {
    bg: '#FFF7ED',
    iconBg: '#FEF3C7',
    iconColor: '#D97706',
    pill: { bg: '#FEF3C7', text: '#92400E', label: 'Under Review' },
    title: 'Application under review',
    body: "Our team is reviewing your application. We'll send you an email with our decision within 3\u20135 business days.",
  },
  approved: {
    bg: '#F0FDF4',
    iconBg: '#DCFCE7',
    iconColor: '#16A34A',
    pill: { bg: '#DCFCE7', text: '#166534', label: 'Approved' },
    title: "You're a Verified Supplier! 🎉",
    body: 'Congratulations! Your application has been approved. You now have a blue checkmark badge and access to your Seller Dashboard.',
  },
  rejected: {
    bg: '#FFF1F2',
    iconBg: '#FFE4E6',
    iconColor: '#DC2626',
    pill: { bg: '#FFE4E6', text: '#991B1B', label: 'Not Approved' },
    title: 'Application not approved',
    body: "Unfortunately we weren't able to approve your application at this time. You may re-apply after 30 days.",
  },
  suspended: {
    bg: '#F8FAFC',
    iconBg: '#F1F5F9',
    iconColor: '#475569',
    pill: { bg: '#F1F5F9', text: '#334155', label: 'Suspended' },
    title: 'Supplier access suspended',
    body: 'Your supplier access has been suspended. Please contact support for more information.',
  },
};

function StatusIcon({ status }) {
  const config = STATUS_CONFIG[status];
  if (status === 'pending') return <ClockIcon color={config.iconColor} />;
  if (status === 'approved') return <CheckBadgeIcon color={config.iconColor} />;
  if (status === 'rejected') return <XCircleIcon color={config.iconColor} />;
  return <ShieldOffIcon color={config.iconColor} />;
}

// ── Timeline Steps (pending state) ───────────────────────────────────────────

function TimelineStep({ num, label, done, active }) {
  return (
    <View style={timeline.row}>
      <View style={[timeline.dot, done && timeline.dotDone, active && timeline.dotActive]}>
        {done ? (
          <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M20 6L9 17l-5-5" />
          </Svg>
        ) : (
          <Text style={[timeline.dotNum, active && timeline.dotNumActive]}>{num}</Text>
        )}
      </View>
      <Text style={[timeline.label, done && timeline.labelDone, active && timeline.labelActive]}>{label}</Text>
    </View>
  );
}

const timeline = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 14 },
  dot: {
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 2, borderColor: '#E2E8F0',
  },
  dotActive: { backgroundColor: BLUE, borderColor: BLUE },
  dotDone: { backgroundColor: '#16A34A', borderColor: '#16A34A' },
  dotNum: { fontSize: 11, fontWeight: '700', color: '#94A3B8' },
  dotNumActive: { color: '#fff' },
  label: { fontSize: 14, color: '#9CA3AF', fontWeight: '500' },
  labelActive: { color: '#111', fontWeight: '600' },
  labelDone: { color: '#16A34A', fontWeight: '600' },
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SupplierApplicationStatusScreen({ navigation, route }) {
  const { user, refreshUser } = useAuth();
  const justSubmitted = route?.params?.submitted === true;

  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    loadApplication();
  }, []);

  const loadApplication = async () => {
    if (!user) return;
    try {
      const app = await Supplier.getApplicationStatus(user);
      setApplication(app);
      // If approved, refresh user object so is_verified_supplier reflects latest
      if (app?.status === 'approved') await refreshUser();
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
      Animated.parallel([
        Animated.timing(fadeAnim, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 60, friction: 10, useNativeDriver: true }),
      ]).start();
    }
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!application) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <BackIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Application Status</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.noAppTitle}>No application found</Text>
          <Text style={styles.noAppBody}>You haven't submitted a supplier application yet.</Text>
          <TouchableOpacity
            style={styles.primaryBtn}
            onPress={() => navigation.replace('SupplierApplication')}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Apply Now</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { status, admin_notes, submitted_at } = application;
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const submittedDate = submitted_at
    ? new Date(submitted_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : null;

  // Days until re-apply (for rejected)
  const reApplyDate = application.reviewed_at
    ? new Date(new Date(application.reviewed_at).getTime() + 30 * 24 * 60 * 60 * 1000)
    : null;
  const now = new Date();
  const daysUntilReApply = reApplyDate ? Math.max(0, Math.ceil((reApplyDate - now) / (1000 * 60 * 60 * 24))) : 0;
  const canReApply = status === 'rejected' && daysUntilReApply === 0;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: config.bg }]} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Application Status</Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>

        {/* Confetti (approved only) */}
        {status === 'approved' && (
          <View style={styles.confettiWrap} pointerEvents="none">
            {CONFETTI_DOTS.map((d, i) => (
              <ConfettiDot key={i} delay={d.delay} x={d.x} color={d.color} />
            ))}
          </View>
        )}

        {/* Hero Icon */}
        <Animated.View style={[styles.heroSection, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
          <View style={[styles.iconCircle, { backgroundColor: config.iconBg }]}>
            <StatusIcon status={status} />
          </View>

          {/* Status pill */}
          <View style={[styles.pill, { backgroundColor: config.pill.bg }]}>
            <Text style={[styles.pillText, { color: config.pill.text }]}>{config.pill.label}</Text>
          </View>

          <Text style={styles.statusTitle}>{config.title}</Text>
          <Text style={styles.statusBody}>{config.body}</Text>

          {submittedDate && (
            <Text style={styles.submittedDate}>Submitted {submittedDate}</Text>
          )}
        </Animated.View>

        {/* ── PENDING: Review timeline ── */}
        {status === 'pending' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>What happens next</Text>
            <TimelineStep num={1} label="Application submitted" done />
            <TimelineStep num={2} label="Team review (1–3 days)" active />
            <TimelineStep num={3} label="Decision emailed to you" />
          </View>
        )}

        {/* ── APPROVED: Onboarding CTA ── */}
        {status === 'approved' && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>You're all set</Text>
            <Text style={styles.cardBody}>
              Your blue verified badge is now active. Complete your one-time store setup, then start listing products.
            </Text>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={() => navigation.replace('SupplierOnboarding')}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Set Up My Store</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── REJECTED: Reason + Re-apply ── */}
        {status === 'rejected' && (
          <View style={styles.card}>
            {admin_notes ? (
              <>
                <Text style={styles.cardTitle}>Reason</Text>
                <Text style={styles.cardBody}>{admin_notes}</Text>
              </>
            ) : (
              <Text style={styles.cardBody}>
                We weren't able to share specific feedback at this time. Please review our supplier guidelines before re-applying.
              </Text>
            )}

            {canReApply ? (
              <TouchableOpacity
                style={styles.primaryBtn}
                onPress={() => navigation.replace('SupplierApplication')}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Re-apply Now</Text>
              </TouchableOpacity>
            ) : (
              <View style={styles.reApplyNote}>
                <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Circle cx={12} cy={12} r={10} />
                  <Polyline points="12 6 12 12 16 14" />
                </Svg>
                <Text style={styles.reApplyNoteText}>
                  You can re-apply in{' '}
                  <Text style={{ fontWeight: '700', color: '#374151' }}>{daysUntilReApply} day{daysUntilReApply !== 1 ? 's' : ''}</Text>
                  .
                </Text>
              </View>
            )}
          </View>
        )}

        {/* ── SUSPENDED: Support link ── */}
        {status === 'suspended' && (
          <View style={styles.card}>
            {admin_notes && (
              <>
                <Text style={styles.cardTitle}>Reason</Text>
                <Text style={styles.cardBody}>{admin_notes}</Text>
              </>
            )}
            <Text style={[styles.cardBody, { marginTop: admin_notes ? 8 : 0 }]}>
              If you believe this was a mistake or need more information, please contact our support team.
            </Text>
            <TouchableOpacity
              style={styles.outlineBtn}
              onPress={() => navigation.navigate('Help')}
              activeOpacity={0.85}
            >
              <Text style={styles.outlineBtnText}>Contact Support</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Just submitted confirmation */}
        {justSubmitted && status === 'pending' && (
          <View style={styles.submittedBanner}>
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Circle cx={12} cy={12} r={10} />
              <Path d="M9 12l2 2 4-4" />
            </Svg>
            <Text style={styles.submittedBannerText}>Application submitted successfully!</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111', letterSpacing: -0.2 },

  scroll: { paddingHorizontal: 20, paddingBottom: 32 },

  // Hero
  confettiWrap: { position: 'relative', height: 0, overflow: 'visible' },
  heroSection: { alignItems: 'center', paddingTop: 16, paddingBottom: 28 },
  iconCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  pill: {
    borderRadius: 20,
    paddingVertical: 5,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  pillText: { fontSize: 12, fontWeight: '700', letterSpacing: 0.3 },
  statusTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: '#111',
    textAlign: 'center',
    letterSpacing: -0.4,
    marginBottom: 10,
  },
  statusBody: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
    lineHeight: 21,
    paddingHorizontal: 8,
  },
  submittedDate: {
    fontSize: 12,
    color: '#9CA3AF',
    marginTop: 12,
    fontWeight: '500',
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 20,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: '#111',
    marginBottom: 12,
  },
  cardBody: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 21,
    marginBottom: 16,
  },

  // Buttons
  primaryBtn: {
    backgroundColor: BLUE_DARK,
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  outlineBtn: {
    borderWidth: 1.5,
    borderColor: '#D1D5DB',
    borderRadius: 12,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtnText: { color: '#374151', fontSize: 15, fontWeight: '600' },

  // Re-apply countdown
  reApplyNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F9FAFB',
    borderRadius: 10,
    padding: 12,
  },
  reApplyNoteText: { fontSize: 13, color: '#6B7280', flex: 1 },

  // Just-submitted banner
  submittedBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 14,
    marginTop: 4,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  submittedBannerText: { fontSize: 13, color: '#15803D', fontWeight: '600', flex: 1 },

  // No app state
  noAppTitle: { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 8, textAlign: 'center' },
  noAppBody: { fontSize: 14, color: '#6B7280', textAlign: 'center', lineHeight: 21, marginBottom: 24 },
});
