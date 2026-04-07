import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import CardImage from '../components/CardImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Polyline, Line, Rect, G } from 'react-native-svg';
import { colors as C } from '../constants/theme';
import { typeScale, radius } from '../constants/tokens';
import { useOrderHistory } from '../context/OrderHistoryContext';

const { width } = Dimensions.get('window');

// ── Icons ──────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function PackageIcon() {
  return (
    <Svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke="#CCC" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={16.5} y1={9.4} x2={7.55} y2={4.24} />
      <Path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <Polyline points="3.27 6.96 12 12.01 20.73 6.96" />
      <Line x1={12} y1={22.08} x2={12} y2={12} />
    </Svg>
  );
}

function ChevronDownIcon({ rotated }) {
  return (
    <Svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#999"
      strokeWidth={2.2}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={rotated ? { transform: [{ rotate: '180deg' }] } : {}}
    >
      <Polyline points="6 9 12 15 18 9" />
    </Svg>
  );
}

function SofaSmallIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3" />
      <Path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0z" />
      <Path d="M4 18v2" />
      <Path d="M20 18v2" />
    </Svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────────

const THUMB_COLORS = ['#2C3E50', '#5D6D7E', '#1E3A2F', '#3B2E4A', '#4A3228', '#1A2E44'];

function getThumbColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return THUMB_COLORS[Math.abs(hash) % THUMB_COLORS.length];
}

function formatDate(isoString) {
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const STATUS_CONFIG = {
  Confirmed:  { bg: '#EFF6FF', text: '#0B6DC3', dot: '#3B82F6' },
  Processing: { bg: '#FFF7ED', text: '#C2410C', dot: '#F97316' },
  Shipped:    { bg: '#F5F3FF', text: '#6D28D9', dot: '#8B5CF6' },
  Delivered:  { bg: 'rgba(103,172,233,0.12)', text: '#0B6DC3', dot: '#67ACE9' },
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.Confirmed;
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <View style={[styles.badgeDot, { backgroundColor: cfg.dot }]} />
      <Text style={[styles.badgeText, { color: cfg.text }]}>{status}</Text>
    </View>
  );
}

function OrderCard({ order }) {
  const [expanded, setExpanded] = useState(false);
  const itemCount = order.items.reduce((sum, i) => sum + i.quantity, 0);

  return (
    <View style={styles.orderCard}>
      {/* Header row — tap to expand */}
      <TouchableOpacity
        style={styles.cardHeader}
        onPress={() => setExpanded((v) => !v)}
        activeOpacity={0.7}
      >
        <View style={styles.cardHeaderLeft}>
          <Text style={styles.orderId}>{order.id}</Text>
          <Text style={styles.orderDate}>{formatDate(order.date)}</Text>
        </View>
        <View style={styles.cardHeaderRight}>
          <StatusBadge status={order.status} />
          <View style={{ marginLeft: 8, marginTop: 1 }}>
            <ChevronDownIcon rotated={expanded} />
          </View>
        </View>
      </TouchableOpacity>

      {/* Summary row */}
      <View style={styles.cardSummary}>
        <Text style={styles.itemCountText}>
          {itemCount} item{itemCount !== 1 ? 's' : ''}
        </Text>
        <Text style={styles.totalText}>${order.total.toLocaleString()}</Text>
      </View>

      {/* Expanded detail */}
      {expanded && (
        <View style={styles.cardExpanded}>
          <View style={styles.expandDivider} />

          {order.items.map((item, idx) => (
            <View key={item.key || idx} style={styles.itemRow}>
              <View style={[styles.itemThumb, { backgroundColor: getThumbColor(item.name) }]}>
                <CardImage uri={item.imageUrl} style={styles.itemThumbPhoto} resizeMode="cover" />
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemName} numberOfLines={1}>{item.name}</Text>
                <Text style={styles.itemMeta}>{item.brand}  ·  Qty {item.quantity}</Text>
              </View>
              <Text style={styles.itemPrice}>${(item.price * item.quantity).toLocaleString()}</Text>
            </View>
          ))}

          <View style={styles.expandDivider} />

          <View style={styles.breakdown}>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Subtotal</Text>
              <Text style={styles.breakdownValue}>${order.subtotal.toLocaleString()}</Text>
            </View>
            <View style={styles.breakdownRow}>
              <Text style={styles.breakdownLabel}>Shipping</Text>
              <Text style={styles.breakdownValue}>${order.shipping}</Text>
            </View>
            <View style={[styles.breakdownRow, { marginTop: 8 }]}>
              <Text style={styles.breakdownTotalLabel}>Total</Text>
              <Text style={styles.breakdownTotalValue}>${order.total.toLocaleString()}</Text>
            </View>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export default function OrderHistoryScreen({ navigation }) {
  const { orders } = useOrderHistory();

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
          <Text style={styles.headerTitle}>Order History</Text>
          <View style={{ width: 40 }} />
        </View>
      </SafeAreaView>

      {orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <PackageIcon />
          <Text style={styles.emptyTitle}>No orders yet</Text>
          <Text style={styles.emptySubtitle}>
            Complete a purchase and your order will appear here.
          </Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => navigation.navigate('Main', { screen: 'Cart' })}
          >
            <Text style={styles.emptyBtnText}>Go to Cart</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <Text style={styles.sectionLabel}>
            {orders.length} order{orders.length !== 1 ? 's' : ''}
          </Text>
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
          <View style={{ height: 48 }} />
        </ScrollView>
      )}
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.surface,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    backgroundColor: C.bg,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typeScale.title,
    color: C.textPrimary,
  },

  // Empty state
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 44,
  },
  emptyTitle: {
    ...typeScale.title,
    color: C.textPrimary,
    marginTop: 20,
    marginBottom: 10,
  },
  emptySubtitle: {
    ...typeScale.body,
    color: C.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
  },
  emptyBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: 36,
    paddingVertical: 14,
    borderRadius: radius.button,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyBtnText: {
    ...typeScale.button,
    color: C.white,
  },

  // List
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 20,
  },
  sectionLabel: {
    ...typeScale.subheadline,
    color: C.textTertiary,
    marginBottom: 14,
  },

  // Order card
  orderCard: {
    backgroundColor: C.bg,
    borderRadius: radius.xl,
    marginBottom: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
    overflow: 'hidden',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 10,
  },
  cardHeaderLeft: {
    flex: 1,
  },
  cardHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  orderId: {
    ...typeScale.button,
    fontWeight: '700',
    color: C.textPrimary,
  },
  orderDate: {
    ...typeScale.caption,
    color: C.textSecondary,
    marginTop: 3,
  },

  // Status badge
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    gap: 5,
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  badgeText: {
    ...typeScale.caption,
    fontWeight: '600',
  },

  // Summary row
  cardSummary: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 16,
    alignItems: 'center',
  },
  itemCountText: {
    ...typeScale.caption,
    color: C.textSecondary,
  },
  totalText: {
    ...typeScale.price,
    color: C.textPrimary,
  },

  // Expanded
  cardExpanded: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  expandDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 12,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  itemThumb: {
    width: 42,
    height: 42,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    overflow: 'hidden',
  },
  itemThumbPhoto: {
    width: 42,
    height: 42,
    borderRadius: 10,
  },
  itemInfo: {
    flex: 1,
    marginLeft: 12,
  },
  itemName: {
    ...typeScale.caption,
    fontWeight: '600',
    color: C.textPrimary,
    marginBottom: 2,
  },
  itemMeta: {
    ...typeScale.caption,
    color: C.textSecondary,
  },
  itemPrice: {
    ...typeScale.priceSmall,
    color: C.textPrimary,
    marginLeft: 8,
  },

  // Breakdown
  breakdown: {
    gap: 6,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  breakdownLabel: {
    ...typeScale.caption,
    color: C.textSecondary,
  },
  breakdownValue: {
    ...typeScale.caption,
    fontWeight: '600',
    color: C.textSecondary,
  },
  breakdownTotalLabel: {
    ...typeScale.button,
    fontWeight: '700',
    color: C.textPrimary,
  },
  breakdownTotalValue: {
    ...typeScale.price,
    color: C.textPrimary,
  },
});
