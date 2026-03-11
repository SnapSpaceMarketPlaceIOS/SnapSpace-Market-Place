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
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Polyline } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import { Admin } from '../services/api';

const BLUE = '#0B6DC3';
const BLUE_DARK = '#1D4ED8';
const GREEN = '#16A34A';
const RED = '#DC2626';

// ── Icons ─────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5M12 5l-7 7 7 7" />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 6L9 17l-5-5" />
    </Svg>
  );
}

function XIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 6L6 18M6 6l12 12" />
    </Svg>
  );
}

function UserIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx={12} cy={7} r={4} />
    </Svg>
  );
}

function ClockIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={10} />
      <Polyline points="12 6 12 12 16 14" />
    </Svg>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const BUSINESS_TYPE_LABEL = {
  retailer: 'Retailer', manufacturer: 'Manufacturer',
  brand: 'Brand', distributor: 'Distributor',
};

const STATUS_PILL = {
  pending:   { bg: '#FEF3C7', text: '#92400E', label: 'Pending' },
  approved:  { bg: '#DCFCE7', text: '#166534', label: 'Approved' },
  rejected:  { bg: '#FFE4E6', text: '#991B1B', label: 'Rejected' },
  suspended: { bg: '#F1F5F9', text: '#334155', label: 'Suspended' },
};

function accountAge(createdAt) {
  if (!createdAt) return 'Unknown';
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86400000);
  if (days < 1) return 'Today';
  if (days < 30) return `${days} day${days > 1 ? 's' : ''}`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months > 1 ? 's' : ''}`;
  const years = Math.floor(months / 12);
  return `${years} year${years > 1 ? 's' : ''}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ── Section helpers ───────────────────────────────────────────────────────────

function SectionHeader({ title }) {
  return <Text style={styles.sectionHeader}>{title}</Text>;
}

function DetailRow({ label, value, mono }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, mono && styles.detailMono]} numberOfLines={4}>
        {value || '—'}
      </Text>
    </View>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AdminApplicationDetailScreen({ navigation, route }) {
  const { user } = useAuth();
  const { applicationId } = route.params || {};

  const [application, setApplication] = useState(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(null); // 'approve' | 'reject'
  const [adminNotes, setAdminNotes] = useState('');
  const [showRejectInput, setShowRejectInput] = useState(false);

  const rejectBarAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    loadApplication();
  }, [applicationId]);

  const loadApplication = async () => {
    try {
      const app = await Admin.getApplication(user, applicationId);
      setApplication(app);
      setAdminNotes(app?.admin_notes || '');
    } catch (err) {
      Alert.alert('Error', 'Failed to load application.');
    } finally {
      setLoading(false);
    }
  };

  const toggleRejectBar = () => {
    const toValue = showRejectInput ? 0 : 1;
    setShowRejectInput(!showRejectInput);
    Animated.spring(rejectBarAnim, {
      toValue,
      tension: 70,
      friction: 12,
      useNativeDriver: false,
    }).start();
  };

  // ── Approve ──────────────────────────────────────────────────────────────

  const handleApprove = () => {
    Alert.alert(
      'Approve Application',
      `Approve "${application?.business_name}"?\n\nThis will:\n• Grant the blue verified badge\n• Upgrade their account to Supplier role\n• Create their storefront`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Approve',
          style: 'default',
          onPress: async () => {
            setActionLoading('approve');
            try {
              await Admin.approveApplication(user, applicationId);
              Alert.alert(
                'Approved ✓',
                `${application.business_name} is now a Verified Supplier.`,
                [{ text: 'Done', onPress: () => navigation.goBack() }],
              );
            } catch (err) {
              Alert.alert('Error', err.message || 'Approval failed. Please try again.');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  // ── Reject ───────────────────────────────────────────────────────────────

  const handleReject = () => {
    Alert.alert(
      'Reject Application',
      adminNotes.trim()
        ? `Reject with reason:\n\n"${adminNotes.trim()}"\n\nThe applicant will see this in their status page.`
        : 'Reject without a reason? The applicant won\'t see specific feedback.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reject',
          style: 'destructive',
          onPress: async () => {
            setActionLoading('reject');
            try {
              await Admin.rejectApplication(user, applicationId, adminNotes.trim() || null);
              Alert.alert(
                'Rejected',
                `Application from ${application.business_name} has been rejected.`,
                [{ text: 'Done', onPress: () => navigation.goBack() }],
              );
            } catch (err) {
              Alert.alert('Error', err.message || 'Rejection failed. Please try again.');
            } finally {
              setActionLoading(null);
            }
          },
        },
      ],
    );
  };

  // ── Loading ──────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <BackIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Application Review</Text>
          <View style={{ width: 22 }} />
        </View>
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
          <Text style={styles.headerTitle}>Application Review</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.center}>
          <Text style={styles.errorText}>Application not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const { status, applicant } = application;
  const pill = STATUS_PILL[status] || STATUS_PILL.pending;
  const isPending = status === 'pending';
  const categories = Array.isArray(application.product_categories)
    ? application.product_categories.join(', ')
    : application.product_categories || '—';

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Application Review</Text>
        <View style={[styles.pill, { backgroundColor: pill.bg }]}>
          <Text style={[styles.pillText, { color: pill.text }]}>{pill.label}</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* ── Applicant Info ── */}
          <View style={styles.applicantCard}>
            <View style={styles.applicantAvatar}>
              <Text style={styles.applicantInitial}>
                {(applicant?.full_name || applicant?.email || '?')[0].toUpperCase()}
              </Text>
            </View>
            <View style={styles.applicantInfo}>
              <Text style={styles.applicantName}>{applicant?.full_name || 'Unknown'}</Text>
              <Text style={styles.applicantEmail}>{applicant?.email || '—'}</Text>
              <View style={styles.applicantMeta}>
                <View style={styles.metaItem}>
                  <UserIcon />
                  <Text style={styles.metaText}>Account: {accountAge(applicant?.created_at)} old</Text>
                </View>
                <View style={styles.metaItem}>
                  <ClockIcon />
                  <Text style={styles.metaText}>Submitted: {formatDate(application.submitted_at)}</Text>
                </View>
              </View>
            </View>
          </View>

          {/* ── Business Information ── */}
          <SectionHeader title="Business Information" />
          <View style={styles.card}>
            <DetailRow label="Business Name" value={application.business_name} />
            <DetailRow label="Business Type" value={BUSINESS_TYPE_LABEL[application.business_type] || application.business_type} />
            <DetailRow label="Website" value={application.website_url || 'Not provided'} />
            <DetailRow
              label="Tax ID / EIN"
              value={application.tax_id ? `••••••${application.tax_id.slice(-3)}` : '—'}
              mono
            />
          </View>

          {/* ── What They Sell ── */}
          <SectionHeader title="What They Sell" />
          <View style={styles.card}>
            <View style={styles.descriptionWrap}>
              <Text style={styles.detailLabel}>Business Description</Text>
              <Text style={styles.descriptionText}>{application.description || '—'}</Text>
            </View>
            <DetailRow label="Product Categories" value={categories} />
            <DetailRow label="Inventory Size" value={application.inventory_size} />
          </View>

          {/* ── Admin Notes ── */}
          <SectionHeader title="Admin Notes" />
          <View style={styles.card}>
            <Text style={styles.notesHint}>
              Internal only — applicants see this as the reason if rejected.
            </Text>
            <TextInput
              style={[styles.notesInput, !isPending && styles.notesInputReadOnly]}
              value={adminNotes}
              onChangeText={setAdminNotes}
              placeholder={isPending ? 'Add internal notes or rejection reason…' : 'No notes.'}
              placeholderTextColor="#C4C4C4"
              multiline
              editable={isPending}
              textAlignVertical="top"
            />
          </View>

          {/* ── Review History (if already reviewed) ── */}
          {application.reviewed_at && (
            <>
              <SectionHeader title="Review History" />
              <View style={styles.card}>
                <DetailRow label="Reviewed" value={formatDate(application.reviewed_at)} />
                <DetailRow label="Decision" value={pill.label} />
              </View>
            </>
          )}

          <View style={{ height: 120 }} />
        </ScrollView>

        {/* ── Action Bar (only for pending) ── */}
        {isPending && (
          <View style={styles.actionBar}>
            <TouchableOpacity
              style={[styles.rejectBtn, actionLoading === 'approve' && styles.btnDisabled]}
              onPress={handleReject}
              disabled={!!actionLoading}
              activeOpacity={0.85}
            >
              {actionLoading === 'reject' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <XIcon />
                  <Text style={styles.rejectBtnText}>Reject</Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.approveBtn, actionLoading === 'reject' && styles.btnDisabled]}
              onPress={handleApprove}
              disabled={!!actionLoading}
              activeOpacity={0.85}
            >
              {actionLoading === 'approve' ? (
                <ActivityIndicator color="#fff" size="small" />
              ) : (
                <>
                  <CheckIcon />
                  <Text style={styles.approveBtnText}>Approve</Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        )}

        {/* Non-pending status banner */}
        {!isPending && (
          <View style={[styles.resolvedBar, { backgroundColor: pill.bg }]}>
            <Text style={[styles.resolvedBarText, { color: pill.text }]}>
              This application has been {status}.
            </Text>
          </View>
        )}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111', letterSpacing: -0.2 },

  pill: { borderRadius: 12, paddingVertical: 4, paddingHorizontal: 10 },
  pillText: { fontSize: 11, fontWeight: '700' },

  scroll: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 16 },

  // Applicant card
  applicantCard: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    marginBottom: 8,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  applicantAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  applicantInitial: { fontSize: 20, fontWeight: '800', color: BLUE_DARK },
  applicantInfo: { flex: 1 },
  applicantName: { fontSize: 16, fontWeight: '700', color: '#111', marginBottom: 2 },
  applicantEmail: { fontSize: 13, color: '#9CA3AF', marginBottom: 8 },
  applicantMeta: { gap: 4 },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaText: { fontSize: 12, color: '#6B7280' },

  // Section header
  sectionHeader: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    marginTop: 16,
    marginBottom: 8,
    marginLeft: 4,
  },

  // Card
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 1,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
    gap: 16,
  },
  detailLabel: { fontSize: 13, color: '#9CA3AF', fontWeight: '600', minWidth: 110 },
  detailValue: { fontSize: 13, color: '#111', fontWeight: '500', flex: 1, textAlign: 'right' },
  detailMono: { fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace', fontSize: 12 },
  descriptionWrap: { padding: 16, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' },
  descriptionText: { fontSize: 14, color: '#374151', lineHeight: 21, marginTop: 6 },

  // Admin notes
  notesHint: { fontSize: 12, color: '#9CA3AF', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6 },
  notesInput: {
    minHeight: 100,
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 8,
    fontSize: 14,
    color: '#111',
    lineHeight: 21,
  },
  notesInputReadOnly: { color: '#6B7280' },
  errorText: { fontSize: 14, color: '#EF4444' },

  // Action bar
  actionBar: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    borderRadius: 13,
    backgroundColor: RED,
  },
  rejectBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  approveBtn: {
    flex: 1.4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 52,
    borderRadius: 13,
    backgroundColor: GREEN,
  },
  approveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  btnDisabled: { opacity: 0.5 },

  // Resolved bar
  resolvedBar: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  resolvedBarText: { fontSize: 14, fontWeight: '600' },
});
