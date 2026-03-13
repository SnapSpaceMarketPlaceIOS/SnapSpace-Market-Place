import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import { space, radius, fontWeight, fontSize, uiColors, typeScale, shadow } from '../constants/tokens';
import { Button, Badge, SectionHeader } from '../components/ds';
import { Admin } from '../services/api';

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

function SearchIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={11} cy={11} r={8} />
      <Path d="M21 21l-4.35-4.35" />
    </Svg>
  );
}

function ChevronRightIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#C4C4C4" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 18l6-6-6-6" />
    </Svg>
  );
}

function ShieldIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Svg>
  );
}

// ── Status config ─────────────────────────────────────────────────────────────

const STATUS_PILL = {
  pending:   { bg: '#FEF3C7', text: '#92400E', label: 'Pending' },
  approved:  { bg: '#DCFCE7', text: '#166534', label: 'Approved' },
  rejected:  { bg: '#FFE4E6', text: '#991B1B', label: 'Rejected' },
  suspended: { bg: '#F1F5F9', text: '#334155', label: 'Suspended' },
};

const BUSINESS_TYPE_LABEL = {
  retailer:     'Retailer',
  manufacturer: 'Manufacturer',
  brand:        'Brand',
  distributor:  'Distributor',
};

const STATUS_FILTERS = [
  { value: 'all',       label: 'All' },
  { value: 'pending',   label: 'Pending' },
  { value: 'approved',  label: 'Approved' },
  { value: 'rejected',  label: 'Rejected' },
  { value: 'suspended', label: 'Suspended' },
];

const BTYPE_FILTERS = [
  { value: 'all',          label: 'All Types' },
  { value: 'retailer',     label: 'Retailer' },
  { value: 'manufacturer', label: 'Manufacturer' },
  { value: 'brand',        label: 'Brand' },
  { value: 'distributor',  label: 'Distributor' },
];

// ── Helper: relative date ─────────────────────────────────────────────────────

function relativeDate(dateStr) {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months > 1 ? 's' : ''} ago`;
}

// ── Application Card ──────────────────────────────────────────────────────────

function ApplicationCard({ item, onPress }) {
  const pill = STATUS_PILL[item.status] || STATUS_PILL.pending;
  const applicant = item.applicant || {};

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.75}>
      {/* Left accent bar for pending */}
      {item.status === 'pending' && <View style={styles.cardAccent} />}

      <View style={styles.cardBody}>
        <View style={styles.cardTop}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardBusinessName} numberOfLines={1}>
              {item.business_name}
            </Text>
            <View style={[styles.pill, { backgroundColor: pill.bg }]}>
              <Text style={[styles.pillText, { color: pill.text }]}>{pill.label}</Text>
            </View>
          </View>
          <Text style={styles.cardEmail} numberOfLines={1}>{applicant.email || '—'}</Text>
        </View>

        <View style={styles.cardMeta}>
          <View style={styles.metaChip}>
            <Text style={styles.metaChipText}>{BUSINESS_TYPE_LABEL[item.business_type] || item.business_type}</Text>
          </View>
          <Text style={styles.metaDate}>{relativeDate(item.submitted_at)}</Text>
        </View>
      </View>

      <ChevronRightIcon />
    </TouchableOpacity>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function AdminApplicationsScreen({ navigation }) {
  const { user } = useAuth();

  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [btypeFilter, setBtypeFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Role guard ─────────────────────────────────────────────────────────────
  if (user?.role !== 'admin') {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <BackIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Admin Panel</Text>
          <View style={{ width: 22 }} />
        </View>
        <View style={styles.accessDenied}>
          <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
            <Circle cx={12} cy={12} r={10} />
            <Path d="M15 9l-6 6M9 9l6 6" />
          </Svg>
          <Text style={styles.accessDeniedTitle}>Access Denied</Text>
          <Text style={styles.accessDeniedBody}>This panel requires admin privileges.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const load = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const data = await Admin.getApplications(user, {
        status: statusFilter,
        businessType: btypeFilter,
      });
      setApplications(data || []);
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [statusFilter, btypeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  // Client-side search filter
  const filtered = applications.filter((a) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      a.business_name?.toLowerCase().includes(q) ||
      a.applicant?.email?.toLowerCase().includes(q)
    );
  });

  const pendingCount = applications.filter((a) => a.status === 'pending').length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <BackIcon />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <View style={styles.adminBadge}>
            <ShieldIcon />
          </View>
          <Text style={styles.headerTitle}>Admin Panel</Text>
        </View>
        <View style={{ width: 22 }} />
      </View>

      {/* Stats bar */}
      <View style={styles.statsBar}>
        <View style={styles.statItem}>
          <Text style={styles.statNum}>{applications.length}</Text>
          <Text style={styles.statLabel}>{statusFilter === 'all' ? 'Total' : STATUS_PILL[statusFilter]?.label}</Text>
        </View>
        {statusFilter === 'all' && pendingCount > 0 && (
          <View style={[styles.statItem, styles.statItemHighlight]}>
            <Text style={[styles.statNum, { color: '#D97706' }]}>{pendingCount}</Text>
            <Text style={[styles.statLabel, { color: '#D97706' }]}>Awaiting Review</Text>
          </View>
        )}
      </View>

      {/* Status filter tabs */}
      <View style={styles.filterTabsWrap}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={STATUS_FILTERS}
          keyExtractor={(f) => f.value}
          contentContainerStyle={styles.filterTabs}
          renderItem={({ item: f }) => (
            <TouchableOpacity
              style={[styles.filterTab, statusFilter === f.value && styles.filterTabActive]}
              onPress={() => setStatusFilter(f.value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.filterTabText, statusFilter === f.value && styles.filterTabTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Business type + search row */}
      <View style={styles.secondaryFilters}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={BTYPE_FILTERS}
          keyExtractor={(f) => f.value}
          contentContainerStyle={styles.btypeList}
          renderItem={({ item: f }) => (
            <TouchableOpacity
              style={[styles.btypeChip, btypeFilter === f.value && styles.btypeChipActive]}
              onPress={() => setBtypeFilter(f.value)}
              activeOpacity={0.75}
            >
              <Text style={[styles.btypeChipText, btypeFilter === f.value && styles.btypeChipTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          )}
        />
      </View>

      {/* Search bar */}
      <View style={styles.searchBar}>
        <SearchIcon />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by business name or email…"
          placeholderTextColor="#9CA3AF"
          value={searchQuery}
          onChangeText={setSearchQuery}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
        />
      </View>

      {/* List */}
      {loading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={BLUE} size="large" />
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={BLUE}
            />
          }
          renderItem={({ item }) => (
            <ApplicationCard
              item={item}
              onPress={() => navigation.navigate('AdminApplicationDetail', { applicationId: item.id })}
            />
          )}
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <Path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" />
              </Svg>
              <Text style={styles.emptyText}>
                {searchQuery ? 'No results match your search.' : `No ${statusFilter === 'all' ? '' : statusFilter + ' '}applications.`}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFF' },

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
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111', letterSpacing: -0.2 },
  adminBadge: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: BLUE_DARK,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Stats bar
  statsBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    paddingVertical: 14,
    backgroundColor: '#fff',
    gap: 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  statItem: { alignItems: 'flex-start' },
  statItemHighlight: {
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  statNum: { fontSize: 22, fontWeight: '800', color: '#111', letterSpacing: -0.5 },
  statLabel: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', marginTop: 1 },

  // Filter tabs
  filterTabsWrap: { backgroundColor: '#fff' },
  filterTabs: { paddingHorizontal: 16, paddingVertical: 10, gap: 8 },
  filterTab: {
    paddingVertical: 7,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
  },
  filterTabActive: { backgroundColor: BLUE_DARK },
  filterTabText: { fontSize: 13, fontWeight: '600', color: '#64748B' },
  filterTabTextActive: { color: '#fff' },

  // Secondary filters
  secondaryFilters: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  btypeList: { paddingHorizontal: 16, paddingBottom: 10, gap: 6 },
  btypeChip: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  btypeChipActive: { borderColor: BLUE, backgroundColor: '#EFF6FF' },
  btypeChipText: { fontSize: 12, fontWeight: '500', color: '#6B7280' },
  btypeChipTextActive: { color: BLUE, fontWeight: '700' },

  // Search bar
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 4,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    height: 44,
  },
  searchInput: { flex: 1, fontSize: 14, color: '#111' },

  // List
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 },
  loadingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // Application card
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 14,
    marginBottom: 10,
    paddingRight: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardAccent: {
    width: 4,
    alignSelf: 'stretch',
    backgroundColor: '#F59E0B',
    borderTopLeftRadius: 14,
    borderBottomLeftRadius: 14,
  },
  cardBody: { flex: 1, padding: 14 },
  cardTop: { marginBottom: 8 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 },
  cardBusinessName: { fontSize: 15, fontWeight: '700', color: '#111', flex: 1 },
  cardEmail: { fontSize: 12, color: '#9CA3AF' },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaChip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
  },
  metaChipText: { fontSize: 11, fontWeight: '600', color: '#64748B' },
  metaDate: { fontSize: 11, color: '#9CA3AF' },

  // Status pill
  pill: { borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10 },
  pillText: { fontSize: 11, fontWeight: '700' },

  // Empty
  emptyWrap: { alignItems: 'center', paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 14, color: '#9CA3AF', fontWeight: '500' },

  // Access denied
  accessDenied: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32, gap: 12 },
  accessDeniedTitle: { fontSize: 20, fontWeight: '800', color: '#111' },
  accessDeniedBody: { fontSize: 14, color: '#6B7280', textAlign: 'center' },
});
