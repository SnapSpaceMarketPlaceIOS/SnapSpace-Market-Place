import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  FlatList,
  RefreshControl,
  Alert,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import LensLoader from '../components/LensLoader';
import Svg, { Path, Circle, Polyline, Rect } from 'react-native-svg';
import { useAuth } from '../context/AuthContext';
import { space, radius, fontWeight, fontSize, uiColors, typeScale, shadow } from '../constants/tokens';
import { colors } from '../constants/colors';
import { Button, Badge, SectionHeader } from '../components/ds';
import { VerifiedBadge } from '../components/VerifiedBadge';
import { Supplier } from '../services/api';

const BLUE = colors.bluePrimary;
const BLUE_DARK = colors.bluePrimary;
const GREEN = '#16A34A';

// ── Icons ─────────────────────────────────────────────────────────────────────

const Icon = ({ d, size = 20, color = '#6B7280', strokeWidth = 1.8, fill = 'none' }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
    <Path d={d} />
  </Svg>
);

function GridIcon({ active }) {
  const c = active ? BLUE_DARK : '#9CA3AF';
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Rect x={3} y={3} width={7} height={7} /><Rect x={14} y={3} width={7} height={7} /><Rect x={3} y={14} width={7} height={7} /><Rect x={14} y={14} width={7} height={7} /></Svg>;
}
function BoxIcon({ active }) {
  const c = active ? BLUE_DARK : '#9CA3AF';
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><Polyline points="3.27 6.96 12 12.01 20.73 6.96" /><Path d="M12 22.08V12" /></Svg>;
}
function OrdersIcon({ active }) {
  const c = active ? BLUE_DARK : '#9CA3AF';
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 11l3 3L22 4" /><Path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></Svg>;
}
function StoreIcon({ active }) {
  const c = active ? BLUE_DARK : '#9CA3AF';
  return <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={c} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><Polyline points="9 22 9 12 15 12 15 22" /></Svg>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

const fmt$ = (v) => `$${(v || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ORDER_STATUS_CONFIG = {
  pending:   { bg: '#FEF3C7', text: '#92400E', label: 'Pending' },
  fulfilled: { bg: '#DCFCE7', text: '#166534', label: 'Fulfilled' },
  cancelled: { bg: '#FFE4E6', text: '#991B1B', label: 'Cancelled' },
  refunded:  { bg: '#F1F5F9', text: '#334155', label: 'Refunded' },
};

function relDate(d) {
  if (!d) return '';
  const diff = Date.now() - new Date(d).getTime();
  const days = Math.floor(diff / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days}d ago`;
  return new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Sub-components ────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, accent }) {
  return (
    <View style={[statStyles.card, accent && statStyles.cardAccent]}>
      <Text style={[statStyles.value, accent && statStyles.valueAccent]}>{value}</Text>
      <Text style={[statStyles.label, accent && statStyles.labelAccent]}>{label}</Text>
      {sub ? <Text style={[statStyles.sub, accent && statStyles.subAccent]}>{sub}</Text> : null}
    </View>
  );
}
const statStyles = StyleSheet.create({
  card: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 14, alignItems: 'flex-start', shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardAccent: { backgroundColor: BLUE_DARK },
  value: { fontSize: 22, fontWeight: '800', color: '#111', letterSpacing: -0.5, marginBottom: 2, fontFamily: 'Geist_700Bold'},
  valueAccent: { color: '#fff' },
  label: { fontSize: 11, color: '#9CA3AF', fontWeight: '600', fontFamily: 'Geist_600SemiBold'},
  labelAccent: { color: 'rgba(255,255,255,0.7)' },
  sub: { fontSize: 10, color: '#C4C4C4', marginTop: 2, fontFamily: 'Geist_400Regular'},
  subAccent: { color: 'rgba(255,255,255,0.5)' },
});

function SectionTitle({ children, action, onAction }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
      <Text style={{ fontSize: 15, fontWeight: '800', color: '#111', letterSpacing: -0.3, fontFamily: 'Geist_700Bold' }}>{children}</Text>
      {action && <TouchableOpacity onPress={onAction} activeOpacity={0.7}><Text style={{ fontSize: 13, color: BLUE, fontWeight: '600', fontFamily: 'Geist_600SemiBold' }}>{action}</Text></TouchableOpacity>}
    </View>
  );
}

// ── Tab bar ───────────────────────────────────────────────────────────────────

const TABS = [
  { id: 'overview', label: 'Overview', Icon: GridIcon },
  { id: 'products', label: 'Products', Icon: BoxIcon },
  { id: 'orders',   label: 'Orders',   Icon: OrdersIcon },
  { id: 'store',    label: 'Store',    Icon: StoreIcon },
];

// ── Product form modal ────────────────────────────────────────────────────────

function ProductFormModal({ visible, onClose, onSave, initial }) {
  const [title, setTitle] = useState(initial?.title || '');
  const [price, setPrice] = useState(initial?.price?.toString() || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [category, setCategory] = useState(initial?.category || '');
  const [inventory, setInventory] = useState(initial?.inventory?.toString() || '0');
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('Required', 'Product title is required.'); return; }
    if (!price || isNaN(parseFloat(price))) { Alert.alert('Required', 'Enter a valid price.'); return; }
    setSaving(true);
    try {
      await onSave({
        title: title.trim(),
        price: parseFloat(price),
        description: description.trim() || null,
        category: category.trim() || null,
        inventory: parseInt(inventory) || 0,
      });
      onClose();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save product.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
        <View style={modalStyles.header}>
          <TouchableOpacity onPress={onClose}><Text style={modalStyles.cancel}>Cancel</Text></TouchableOpacity>
          <Text style={modalStyles.title}>{initial ? 'Edit Product' : 'New Product'}</Text>
          <TouchableOpacity onPress={handleSave} disabled={saving}>
            {saving ? <LensLoader size={20} /> : <Text style={modalStyles.save}>Save</Text>}
          </TouchableOpacity>
        </View>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <ScrollView contentContainerStyle={modalStyles.scroll} keyboardShouldPersistTaps="handled">
            {[
              { label: 'Title *', value: title, onChange: setTitle, placeholder: 'e.g. Linen Cloud Sofa', cap: 'words' },
              { label: 'Price *', value: price, onChange: setPrice, placeholder: '0.00', keyboard: 'decimal-pad', cap: 'none' },
              { label: 'Category', value: category, onChange: setCategory, placeholder: 'e.g. Furniture, Lighting…', cap: 'words' },
              { label: 'Inventory', value: inventory, onChange: setInventory, placeholder: '0', keyboard: 'number-pad', cap: 'none' },
            ].map(f => (
              <View key={f.label} style={modalStyles.field}>
                <Text style={modalStyles.fieldLabel}>{f.label}</Text>
                <TextInput
                  style={modalStyles.input}
                  value={f.value}
                  onChangeText={f.onChange}
                  placeholder={f.placeholder}
                  placeholderTextColor="#ABABAB"
                  keyboardType={f.keyboard || 'default'}
                  autoCapitalize={f.cap || 'sentences'}
                />
              </View>
            ))}
            <View style={modalStyles.field}>
              <Text style={modalStyles.fieldLabel}>Description</Text>
              <TextInput
                style={[modalStyles.input, { minHeight: 80, textAlignVertical: 'top' }]}
                value={description}
                onChangeText={setDescription}
                placeholder="Describe your product…"
                placeholderTextColor="#ABABAB"
                multiline
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)' },
  title: { fontSize: 17, fontWeight: '700', color: '#111', fontFamily: 'Geist_700Bold'},
  cancel: { fontSize: 15, color: '#6B7280', fontFamily: 'Geist_400Regular'},
  save: { fontSize: 15, color: BLUE_DARK, fontWeight: '700', fontFamily: 'Geist_700Bold'},
  scroll: { padding: 20, paddingBottom: 40 },
  field: { marginBottom: 16 },
  fieldLabel: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, fontFamily: 'Geist_700Bold'},
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111', backgroundColor: '#FAFAFA', fontFamily: 'Geist_400Regular'},
});

// ── Fulfill order modal ───────────────────────────────────────────────────────

function FulfillModal({ visible, order, onClose, onFulfill }) {
  const [tracking, setTracking] = useState('');
  const [loading, setLoading] = useState(false);

  const handleFulfill = async () => {
    setLoading(true);
    try {
      await onFulfill(order.id, tracking);
      onClose();
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not fulfill order.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="formSheet" transparent onRequestClose={onClose}>
      <KeyboardAvoidingView style={fulfillStyles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={fulfillStyles.sheet}>
          <View style={fulfillStyles.drag} />
          <Text style={fulfillStyles.title}>Mark as Fulfilled</Text>
          <Text style={fulfillStyles.body}>Order #{order?.id?.slice(-6).toUpperCase()} — {order?.product_title}</Text>
          <Text style={fulfillStyles.label}>Tracking Number (optional)</Text>
          <TextInput
            style={fulfillStyles.input}
            value={tracking}
            onChangeText={setTracking}
            placeholder="1Z999AA10123456784"
            placeholderTextColor="#ABABAB"
            autoCapitalize="characters"
          />
          <TouchableOpacity style={[fulfillStyles.btn, loading && { opacity: 0.6 }]} onPress={handleFulfill} disabled={loading} activeOpacity={0.85}>
            {loading ? <LensLoader size={20} color="#fff" light="#fff" /> : <Text style={fulfillStyles.btnText}>Confirm Fulfillment</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={fulfillStyles.cancelBtn} onPress={onClose} activeOpacity={0.7}>
            <Text style={fulfillStyles.cancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const fulfillStyles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.4)' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36 },
  drag: { width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 18 },
  title: { fontSize: 18, fontWeight: '800', color: '#111', marginBottom: 4, fontFamily: 'Geist_700Bold'},
  body: { fontSize: 13, color: '#6B7280', marginBottom: 20, fontFamily: 'Geist_400Regular'},
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, fontFamily: 'Geist_700Bold'},
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111', marginBottom: 16, fontFamily: 'Geist_400Regular'},
  btn: { backgroundColor: GREEN, borderRadius: 13, height: 52, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  btnText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'Geist_700Bold'},
  cancelBtn: { alignItems: 'center', paddingVertical: 10 },
  cancelText: { fontSize: 14, color: '#9CA3AF', fontWeight: '500', fontFamily: 'Geist_500Medium'},
});

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function SupplierDashboardScreen({ navigation }) {
  const { user } = useAuth();

  // Role guard
  if (!user?.is_verified_supplier) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}>
          <Text style={styles.guardTitle}>Supplier Access Required</Text>
          <Text style={styles.guardBody}>This screen requires a verified supplier account.</Text>
          <TouchableOpacity style={styles.guardBtn} onPress={() => navigation.goBack()}>
            <Text style={styles.guardBtnText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const [activeTab, setActiveTab] = useState('overview');
  const [refreshing, setRefreshing] = useState(false);

  // Data
  const [stats, setStats] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [storefront, setStorefront] = useState(null);
  const [loading, setLoading] = useState(true);

  // Product modal
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);

  // Fulfill modal
  const [fulfillTarget, setFulfillTarget] = useState(null);

  // Store edit
  const [editSlug, setEditSlug] = useState('');
  const [editTagline, setEditTagline] = useState('');
  const [editReturn, setEditReturn] = useState('');
  const [editShipping, setEditShipping] = useState('');
  const [storeSaving, setStoreSaving] = useState(false);

  // Orders filter
  const [orderFilter, setOrderFilter] = useState('all');

  const load = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    else setRefreshing(true);
    try {
      const [s, p, o, sf] = await Promise.all([
        Supplier.getDashboard(user),
        Supplier.getProducts(user),
        Supplier.getOrders(user),
        Supplier.getStorefront(user),
      ]);
      setStats(s);
      setProducts(p);
      setOrders(o);
      if (sf) {
        setStorefront(sf);
        setEditSlug(sf.storefront_slug || '');
        setEditTagline(sf.tagline || '');
        setEditReturn(sf.return_policy || '');
        setEditShipping(sf.shipping_policy || '');
      }
    } catch {
      // Non-fatal
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user.id]);

  useEffect(() => { load(); }, [load]);

  // ── Product actions ─────────────────────────────────────────────────────────

  const handleSaveProduct = async (payload) => {
    if (editingProduct) {
      const updated = await Supplier.updateProduct(user, editingProduct.id, payload);
      setProducts(prev => prev.map(p => p.id === updated.id ? updated : p));
    } else {
      const created = await Supplier.createProduct(user, payload);
      setProducts(prev => [created, ...prev]);
    }
    setEditingProduct(null);
  };

  const handleDeleteProduct = (product) => {
    Alert.alert(
      'Remove Listing',
      `Remove "${product.title}" from your store?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            await Supplier.deleteProduct(user, product.id);
            setProducts(prev => prev.filter(p => p.id !== product.id));
          },
        },
      ],
    );
  };

  // ── Order actions ───────────────────────────────────────────────────────────

  const handleFulfill = async (orderId, tracking) => {
    const updated = await Supplier.fulfillOrder(user, orderId, tracking);
    setOrders(prev => prev.map(o => o.id === orderId ? { ...o, ...updated } : o));
    if (stats) setStats(prev => ({ ...prev, pending_orders: Math.max(0, prev.pending_orders - 1) }));
  };

  // ── Store settings save ─────────────────────────────────────────────────────

  const handleSaveStore = async () => {
    setStoreSaving(true);
    try {
      await Supplier.updateStorefront(user, {
        storefront_slug: editSlug.trim(),
        tagline: editTagline.trim() || null,
        return_policy: editReturn.trim() || null,
        shipping_policy: editShipping.trim() || null,
      });
      Alert.alert('Saved', 'Your store settings have been updated.');
    } catch (err) {
      Alert.alert('Error', err.message || 'Could not save store settings.');
    } finally {
      setStoreSaving(false);
    }
  };

  // ── Filtered orders ─────────────────────────────────────────────────────────

  const filteredOrders = orderFilter === 'all'
    ? orders
    : orders.filter(o => o.status === orderFilter);

  // ── Loading state ───────────────────────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.center}><LensLoader size={48} /></View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Icon d="M19 12H5M12 5l-7 7 7 7" size={22} color="#111" strokeWidth={2} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Seller Dashboard</Text>
          <VerifiedBadge size="sm" />
        </View>

        {/* Mode switcher pill */}
        <TouchableOpacity
          style={styles.modePill}
          onPress={() => navigation.goBack()}
          activeOpacity={0.8}
        >
          <Text style={styles.modePillText}>Shopping</Text>
        </TouchableOpacity>
      </View>

      {/* Seller identity strip */}
      <View style={styles.identityStrip}>
        <View style={styles.identityAvatar}>
          <Text style={styles.identityInitial}>{(user.name || '?')[0].toUpperCase()}</Text>
        </View>
        <View>
          <Text style={styles.identityName}>{user.name}</Text>
          {storefront?.storefront_slug && (
            <Text style={styles.identitySlug}>homegenieios.com/store/{storefront.storefront_slug}</Text>
          )}
        </View>
      </View>

      {/* ── Tab bar ── */}
      <View style={styles.tabBar}>
        {TABS.map(tab => {
          const active = activeTab === tab.id;
          return (
            <TouchableOpacity
              key={tab.id}
              style={styles.tab}
              onPress={() => setActiveTab(tab.id)}
              activeOpacity={0.75}
            >
              <tab.Icon active={active} />
              <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{tab.label}</Text>
              {active && <View style={styles.tabIndicator} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Content ── */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentInner}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={BLUE} />}
      >

        {/* ════════════════════════════════ OVERVIEW ════════════════════════════════ */}
        {activeTab === 'overview' && (
          <View>
            <SectionTitle>Revenue</SectionTitle>
            <View style={styles.statsRow}>
              <StatCard label="Today" value={fmt$(stats?.revenue_today)} accent />
              <StatCard label="This Week" value={fmt$(stats?.revenue_week)} />
            </View>
            <View style={[styles.statsRow, { marginTop: 10 }]}>
              <StatCard label="This Month" value={fmt$(stats?.revenue_month)} />
              <StatCard label="Active Listings" value={stats?.active_listings?.toString() ?? '0'} />
            </View>

            <View style={[styles.statsRow, { marginTop: 10 }]}>
              <StatCard
                label="Pending Orders"
                value={stats?.pending_orders?.toString() ?? '0'}
                sub={stats?.pending_orders > 0 ? 'Needs attention' : 'All clear'}
              />
              <StatCard label="Total Products" value={products.length.toString()} />
            </View>

            {/* Recent orders preview */}
            {orders.filter(o => o.status === 'pending').length > 0 && (
              <View style={{ marginTop: 24 }}>
                <SectionTitle action="See All" onAction={() => setActiveTab('orders')}>
                  Pending Orders
                </SectionTitle>
                {orders.filter(o => o.status === 'pending').slice(0, 3).map(order => {
                  const pill = ORDER_STATUS_CONFIG.pending;
                  return (
                    <TouchableOpacity
                      key={order.id}
                      style={styles.orderCard}
                      onPress={() => setFulfillTarget(order)}
                      activeOpacity={0.75}
                    >
                      <View style={styles.orderTop}>
                        <Text style={styles.orderTitle} numberOfLines={1}>{order.product_title}</Text>
                        <View style={[styles.pill, { backgroundColor: pill.bg }]}>
                          <Text style={[styles.pillText, { color: pill.text }]}>{pill.label}</Text>
                        </View>
                      </View>
                      <Text style={styles.orderMeta}>
                        {order.quantity}× · {fmt$(order.subtotal)} · {relDate(order.ordered_at)}
                      </Text>
                      <TouchableOpacity style={styles.fulfillBtn} onPress={() => setFulfillTarget(order)} activeOpacity={0.85}>
                        <Text style={styles.fulfillBtnText}>Mark Fulfilled</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}

        {/* ════════════════════════════════ PRODUCTS ════════════════════════════════ */}
        {activeTab === 'products' && (
          <View>
            <SectionTitle action="+ Add Product" onAction={() => { setEditingProduct(null); setShowProductModal(true); }}>
              My Listings ({products.length})
            </SectionTitle>

            {products.length === 0 ? (
              <View style={styles.emptyState}>
                <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="#D1D5DB" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                </Svg>
                <Text style={styles.emptyTitle}>No products yet</Text>
                <Text style={styles.emptyBody}>Tap "+ Add Product" to list your first item.</Text>
                <TouchableOpacity style={styles.emptyBtn} onPress={() => { setEditingProduct(null); setShowProductModal(true); }} activeOpacity={0.85}>
                  <Text style={styles.emptyBtnText}>Add Product</Text>
                </TouchableOpacity>
              </View>
            ) : products.map(product => (
              <View key={product.id} style={styles.productCard}>
                <View style={styles.productCardBody}>
                  <View style={styles.productLeft}>
                    <Text style={styles.productTitle} numberOfLines={1}>{product.title}</Text>
                    <Text style={styles.productMeta}>
                      {fmt$(product.price)} · {product.inventory} in stock
                      {product.category ? ` · ${product.category}` : ''}
                    </Text>
                  </View>
                  <View style={[styles.statusDot, { backgroundColor: product.is_active ? '#22C55E' : '#E5E7EB' }]} />
                </View>
                <View style={styles.productActions}>
                  <TouchableOpacity style={styles.productAction} onPress={() => { setEditingProduct(product); setShowProductModal(true); }} activeOpacity={0.7}>
                    <Icon d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" size={14} color={BLUE} />
                    <Text style={[styles.productActionText, { color: BLUE }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.productAction} onPress={() => handleDeleteProduct(product)} activeOpacity={0.7}>
                    <Icon d="M3 6h18M19 6l-1 14H6L5 6M10 11v6M14 11v6M9 6V4h6v2" size={14} color="#EF4444" />
                    <Text style={[styles.productActionText, { color: '#EF4444' }]}>Remove</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}

        {/* ════════════════════════════════ ORDERS ════════════════════════════════ */}
        {activeTab === 'orders' && (
          <View>
            <SectionTitle>Orders ({orders.length})</SectionTitle>

            {/* Order filter */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {['all', 'pending', 'fulfilled', 'cancelled'].map(f => (
                  <TouchableOpacity
                    key={f}
                    style={[styles.filterChip, orderFilter === f && styles.filterChipActive]}
                    onPress={() => setOrderFilter(f)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.filterChipText, orderFilter === f && styles.filterChipTextActive]}>
                      {f.charAt(0).toUpperCase() + f.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {filteredOrders.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyTitle}>No {orderFilter === 'all' ? '' : orderFilter} orders</Text>
                <Text style={styles.emptyBody}>Orders will appear here when buyers purchase your products.</Text>
              </View>
            ) : filteredOrders.map(order => {
              const pill = ORDER_STATUS_CONFIG[order.status] || ORDER_STATUS_CONFIG.pending;
              return (
                <View key={order.id} style={styles.orderCard}>
                  <View style={styles.orderTop}>
                    <Text style={styles.orderTitle} numberOfLines={1}>{order.product_title || 'Order'}</Text>
                    <View style={[styles.pill, { backgroundColor: pill.bg }]}>
                      <Text style={[styles.pillText, { color: pill.text }]}>{pill.label}</Text>
                    </View>
                  </View>
                  <Text style={styles.orderMeta}>
                    Qty {order.quantity} · {fmt$(order.subtotal)} · {relDate(order.ordered_at)}
                  </Text>
                  {order.shipping_name && (
                    <Text style={styles.orderShipping}>Ship to: {order.shipping_name}</Text>
                  )}
                  {order.tracking_number && (
                    <Text style={styles.orderTracking}>Tracking: {order.tracking_number}</Text>
                  )}
                  {order.status === 'pending' && (
                    <TouchableOpacity style={styles.fulfillBtn} onPress={() => setFulfillTarget(order)} activeOpacity={0.85}>
                      <Text style={styles.fulfillBtnText}>Mark Fulfilled</Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* ════════════════════════════════ STORE SETTINGS ════════════════════════════════ */}
        {activeTab === 'store' && (
          <View>
            <SectionTitle>Storefront Settings</SectionTitle>

            {[
              { label: 'Storefront Slug', value: editSlug, onChange: setEditSlug, placeholder: 'your-store', hint: 'homegenieios.com/store/your-slug', cap: 'none' },
              { label: 'Tagline', value: editTagline, onChange: setEditTagline, placeholder: 'What makes your store unique?' },
            ].map(f => (
              <View key={f.label} style={storeStyles.field}>
                <Text style={storeStyles.label}>{f.label}</Text>
                {f.hint && <Text style={storeStyles.hint}>{f.hint}</Text>}
                <TextInput
                  style={storeStyles.input}
                  value={f.value}
                  onChangeText={f.onChange}
                  placeholder={f.placeholder}
                  placeholderTextColor="#ABABAB"
                  autoCapitalize={f.cap || 'sentences'}
                />
              </View>
            ))}

            <View style={storeStyles.divider} />
            <Text style={storeStyles.sectionLabel}>POLICIES</Text>

            {[
              { label: 'Return Policy', value: editReturn, onChange: setEditReturn },
              { label: 'Shipping Policy', value: editShipping, onChange: setEditShipping },
            ].map(f => (
              <View key={f.label} style={storeStyles.field}>
                <Text style={storeStyles.label}>{f.label}</Text>
                <TextInput
                  style={[storeStyles.input, { minHeight: 90, textAlignVertical: 'top' }]}
                  value={f.value}
                  onChangeText={f.onChange}
                  placeholder={`Enter your ${f.label.toLowerCase()}…`}
                  placeholderTextColor="#ABABAB"
                  multiline
                />
              </View>
            ))}

            <View style={storeStyles.divider} />
            <Text style={storeStyles.sectionLabel}>PAYOUTS</Text>
            <View style={storeStyles.payoutPlaceholder}>
              <Icon d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" size={20} color="#6B7280" />
              <View style={{ flex: 1 }}>
                <Text style={storeStyles.payoutTitle}>Stripe Connect</Text>
                <Text style={storeStyles.payoutBody}>Connect your Stripe account to receive payouts. Configure in the Stripe Dashboard.</Text>
              </View>
            </View>

            <TouchableOpacity
              style={[storeStyles.saveBtn, storeSaving && { opacity: 0.6 }]}
              onPress={handleSaveStore}
              disabled={storeSaving}
              activeOpacity={0.85}
            >
              {storeSaving
                ? <LensLoader size={20} color="#fff" light="#fff" />
                : <Text style={storeStyles.saveBtnText}>Save Changes</Text>
              }
            </TouchableOpacity>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* Product form modal */}
      <ProductFormModal
        visible={showProductModal}
        onClose={() => { setShowProductModal(false); setEditingProduct(null); }}
        onSave={handleSaveProduct}
        initial={editingProduct}
      />

      {/* Fulfill modal */}
      {fulfillTarget && (
        <FulfillModal
          visible={!!fulfillTarget}
          order={fulfillTarget}
          onClose={() => setFulfillTarget(null)}
          onFulfill={handleFulfill}
        />
      )}
    </SafeAreaView>
  );
}

// ── Store settings styles ─────────────────────────────────────────────────────

const storeStyles = StyleSheet.create({
  field: { marginBottom: 16 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, fontFamily: 'Geist_700Bold'},
  hint: { fontSize: 11, color: '#9CA3AF', marginBottom: 4, fontFamily: 'Geist_400Regular'},
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: '#111', backgroundColor: '#FAFAFA', fontFamily: 'Geist_400Regular'},
  divider: { height: 1, backgroundColor: '#F3F4F6', marginVertical: 20 },
  sectionLabel: { fontSize: 11, fontWeight: '700', color: '#9CA3AF', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12, fontFamily: 'Geist_700Bold'},
  payoutPlaceholder: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, backgroundColor: '#F9FAFB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 24 },
  payoutTitle: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 2, fontFamily: 'Geist_700Bold'},
  payoutBody: { fontSize: 12, color: '#9CA3AF', lineHeight: 17, fontFamily: 'Geist_400Regular'},
  saveBtn: { backgroundColor: BLUE_DARK, borderRadius: 13, height: 52, alignItems: 'center', justifyContent: 'center' },
  saveBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'Geist_700Bold'},
});

// ── Main styles ───────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#F8FAFF' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  // Header
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 12,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#111', letterSpacing: -0.3, fontFamily: 'Geist_700Bold'},
  modePill: {
    backgroundColor: '#EFF6FF', borderRadius: 20,
    paddingVertical: 6, paddingHorizontal: 12,
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  modePillText: { fontSize: 12, fontWeight: '700', color: BLUE_DARK, fontFamily: 'Geist_700Bold'},

  // Identity strip
  identityStrip: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  identityAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' },
  identityInitial: { fontSize: 14, fontWeight: '800', color: BLUE_DARK, fontFamily: 'Geist_700Bold'},
  identityName: { fontSize: 13, fontWeight: '700', color: '#111', fontFamily: 'Geist_700Bold'},
  identitySlug: { fontSize: 11, color: '#9CA3AF', fontFamily: 'Geist_400Regular'},

  // Tab bar
  tabBar: {
    flexDirection: 'row', backgroundColor: '#fff',
    borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 10, position: 'relative' },
  tabLabel: { fontSize: 10, fontWeight: '600', color: '#9CA3AF', marginTop: 3, fontFamily: 'Geist_600SemiBold'},
  tabLabelActive: { color: BLUE_DARK },
  tabIndicator: { position: 'absolute', bottom: 0, left: '15%', right: '15%', height: 2, backgroundColor: BLUE_DARK, borderRadius: 1 },

  // Content
  content: { flex: 1 },
  contentInner: { padding: 16, paddingBottom: 32 },

  // Stats
  statsRow: { flexDirection: 'row', gap: 10 },

  // Products
  productCard: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
    overflow: 'hidden',
  },
  productCardBody: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingBottom: 10 },
  productLeft: { flex: 1 },
  productTitle: { fontSize: 14, fontWeight: '700', color: '#111', marginBottom: 3, fontFamily: 'Geist_700Bold'},
  productMeta: { fontSize: 12, color: '#9CA3AF', fontFamily: 'Geist_400Regular'},
  statusDot: { width: 8, height: 8, borderRadius: 4, marginLeft: 8 },
  productActions: {
    flexDirection: 'row', borderTopWidth: 1, borderTopColor: '#F3F4F6',
    paddingHorizontal: 14, paddingVertical: 10, gap: 20,
  },
  productAction: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  productActionText: { fontSize: 12, fontWeight: '600', fontFamily: 'Geist_600SemiBold'},

  // Orders
  orderCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 6, elevation: 1,
  },
  orderTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4, gap: 8 },
  orderTitle: { fontSize: 14, fontWeight: '700', color: '#111', flex: 1, fontFamily: 'Geist_700Bold'},
  orderMeta: { fontSize: 12, color: '#9CA3AF', marginBottom: 4, fontFamily: 'Geist_400Regular'},
  orderShipping: { fontSize: 12, color: '#6B7280', fontFamily: 'Geist_400Regular'},
  orderTracking: { fontSize: 12, color: '#6B7280', fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  fulfillBtn: {
    marginTop: 10, backgroundColor: GREEN, borderRadius: 10,
    paddingVertical: 9, alignItems: 'center',
  },
  fulfillBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', fontFamily: 'Geist_700Bold'},

  // Filter chips
  filterChip: { paddingVertical: 7, paddingHorizontal: 14, borderRadius: 20, backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E5E7EB' },
  filterChipActive: { backgroundColor: BLUE_DARK, borderColor: BLUE_DARK },
  filterChipText: { fontSize: 13, fontWeight: '600', color: '#64748B', fontFamily: 'Geist_600SemiBold'},
  filterChipTextActive: { color: '#fff' },

  // Pill
  pill: { borderRadius: 12, paddingVertical: 3, paddingHorizontal: 10 },
  pillText: { fontSize: 11, fontWeight: '700', fontFamily: 'Geist_700Bold'},

  // Empty state
  emptyState: { alignItems: 'center', paddingVertical: 48, gap: 8 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#111', fontFamily: 'Geist_700Bold'},
  emptyBody: { fontSize: 13, color: '#9CA3AF', textAlign: 'center', lineHeight: 19, fontFamily: 'Geist_400Regular'},
  emptyBtn: { marginTop: 8, backgroundColor: BLUE_DARK, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 24 },
  emptyBtnText: { color: '#fff', fontSize: 14, fontWeight: '700', fontFamily: 'Geist_700Bold'},

  // Guard
  guardTitle: { fontSize: 20, fontWeight: '800', color: '#111', marginBottom: 8, fontFamily: 'Geist_700Bold'},
  guardBody: { fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 24, fontFamily: 'Geist_400Regular'},
  guardBtn: { backgroundColor: BLUE_DARK, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 28 },
  guardBtnText: { color: '#fff', fontSize: 15, fontWeight: '700', fontFamily: 'Geist_700Bold'},
});
