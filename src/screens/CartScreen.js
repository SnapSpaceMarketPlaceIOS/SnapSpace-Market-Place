import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  Easing,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Line, Polyline, Rect } from 'react-native-svg';
import { colors } from '../constants/colors';
import { fontSize, fontWeight, letterSpacing, space, radius, shadow } from '../constants/tokens';
import { useCart } from '../context/CartContext';
import { useOrderHistory } from '../context/OrderHistoryContext';

// ─── Icons ────────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" opacity={0.6}>
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Svg>
  );
}

function MinusIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.black} strokeWidth={2} strokeLinecap="round">
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

function PlusIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.black} strokeWidth={2} strokeLinecap="round">
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

function ShoppingBagIcon() {
  return (
    <Svg width={64} height={64} viewBox="0 0 24 24" fill="none" stroke={colors.gray} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.3 }}>
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      <Circle cx={10} cy={20.5} r={1} fill={colors.gray} stroke={colors.gray} strokeWidth={1} />
      <Circle cx={17} cy={20.5} r={1} fill={colors.gray} stroke={colors.gray} strokeWidth={1} />
    </Svg>
  );
}

function SofaIcon() {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3" />
      <Path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0z" />
      <Path d="M4 18v2" />
      <Path d="M20 18v2" />
    </Svg>
  );
}

function BedIcon() {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 4v16" />
      <Path d="M2 8h18a2 2 0 0 1 2 2v10" />
      <Path d="M2 17h20" />
      <Path d="M6 8v9" />
    </Svg>
  );
}

function LightbulbIcon() {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 18h6" />
      <Path d="M10 22h4" />
      <Path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </Svg>
  );
}

function TableIcon() {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={18} height={5} rx={1} />
      <Path d="M5 8v11" />
      <Path d="M19 8v11" />
    </Svg>
  );
}

function ChairIcon() {
  return (
    <Svg width={30} height={30} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2z" />
      <Path d="M7 12V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v7" />
    </Svg>
  );
}

function VerifiedIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill={colors.bluePrimary} />
      <Path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function TruckIcon() {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#27AE60" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={1} y={3} width={15} height={13} rx={1} />
      <Path d="M16 8h4l3 3v5h-7V8z" />
      <Circle cx={5.5} cy={18.5} r={2.5} />
      <Circle cx={18.5} cy={18.5} r={2.5} />
    </Svg>
  );
}

function ShieldIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={colors.bluePrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Svg>
  );
}

// ─── Dashed rule (cross-platform) ─────────────────────────────────────────────

function DashedRule() {
  const dashes = Array.from({ length: 50 });
  return (
    <View style={{ flexDirection: 'row', overflow: 'hidden', marginVertical: 12 }}>
      {dashes.map((_, i) => (
        <View key={i} style={{ width: 5, height: 1, backgroundColor: '#DEDEDE', marginRight: 3 }} />
      ))}
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const THUMB_COLORS = ['#2C3E50', '#5D6D7E', '#1E3A2F', '#3B2E4A', '#4A3228', '#1A2E44'];

function getThumbColor(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return THUMB_COLORS[Math.abs(hash) % THUMB_COLORS.length];
}

function getCategoryInfo(name) {
  const lower = name.toLowerCase();
  if (lower.includes('sofa') || lower.includes('couch') || lower.includes('sectional') || lower.includes('loveseat')) {
    return { label: 'Seating', icon: 'sofa' };
  }
  if (lower.includes('chair') || lower.includes('stool') || lower.includes('recliner') || lower.includes('ottoman')) {
    return { label: 'Seating', icon: 'chair' };
  }
  if (lower.includes('bed') || lower.includes('mattress') || lower.includes('headboard')) {
    return { label: 'Bedroom', icon: 'bed' };
  }
  if (lower.includes('lamp') || lower.includes('light') || lower.includes('sconce') || lower.includes('chandelier')) {
    return { label: 'Lighting', icon: 'lamp' };
  }
  if (lower.includes('table') || lower.includes('desk') || lower.includes('shelf') || lower.includes('shelv') || lower.includes('cabinet')) {
    return { label: 'Storage', icon: 'table' };
  }
  return { label: 'Furniture', icon: 'sofa' };
}

function CategoryIcon({ type }) {
  if (type === 'chair') return <ChairIcon />;
  if (type === 'bed') return <BedIcon />;
  if (type === 'lamp') return <LightbulbIcon />;
  if (type === 'table') return <TableIcon />;
  return <SofaIcon />;
}

function formatOrderDate() {
  return new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Animated quantity text — slides out/in on change ─────────────────────────

function AnimatedQtyText({ value, style }) {
  const translateY = useRef(new Animated.Value(0)).current;
  const opacity = useRef(new Animated.Value(1)).current;
  const prevValue = useRef(value);
  const displayValue = useRef(value);

  if (prevValue.current !== value) {
    const dir = value > prevValue.current ? -1 : 1; // increment → slide up (negative), decrement → slide down
    prevValue.current = value;
    displayValue.current = value;

    Animated.sequence([
      Animated.parallel([
        Animated.timing(translateY, { toValue: dir * 12, duration: 75, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 75, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(translateY, { toValue: -dir * 12, duration: 0, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0, duration: 0, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 150, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
      ]),
    ]).start();
  }

  return (
    <Animated.Text style={[style, { transform: [{ translateY }], opacity }]}>
      {value}
    </Animated.Text>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function CartScreen({ navigation }) {
  const { items, removeFromCart, updateQuantity, subtotal, clearCart } = useCart();
  const { addOrder } = useOrderHistory();

  const shipping = items.length > 0 ? 29 : 0;
  const total = subtotal + shipping;
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);

  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <ShoppingBagIcon />
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptySubtitle}>
          Snap a room and discover furniture that matches your style.
        </Text>
        <TouchableOpacity
          style={styles.emptyBtn}
          onPress={() => navigation?.navigate('Explore')}
        >
          <Text style={styles.emptyBtnText}>Explore Designs</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ── Header ──────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.pageTitle}>My Cart</Text>
            <Text style={styles.subtitle}>
              {totalItems} item{totalItems !== 1 ? 's' : ''}
              {items.length > 1 ? `  ·  ${items.length} products` : ''}
            </Text>
          </View>
          <View style={styles.cartCountBadge}>
            <Text style={styles.cartCountText}>{totalItems}</Text>
          </View>
        </View>

        {/* ── Item Cards ───────────────────────────────────────── */}
        {items.map((item) => {
          const category = getCategoryInfo(item.name);
          const thumbColor = getThumbColor(item.name);
          return (
            <View key={item.key} style={styles.card}>

              {/* Colored left accent stripe */}
              <View style={[styles.cardStripe, { backgroundColor: thumbColor }]} />

              {/* Thumbnail with category badge */}
              <View style={[styles.thumb, { backgroundColor: thumbColor }]}>
                <CategoryIcon type={category.icon} />
                <View style={styles.categoryPill}>
                  <Text style={styles.categoryPillText}>{category.label}</Text>
                </View>
              </View>

              {/* Content */}
              <View style={styles.cardContent}>

                {/* Name + trash */}
                <View style={styles.cardTop}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                  <TouchableOpacity style={styles.trashBtn} onPress={() => removeFromCart(item.key)}>
                    <TrashIcon />
                  </TouchableOpacity>
                </View>

                {/* Brand + verified + in stock */}
                <View style={styles.brandRow}>
                  <VerifiedIcon />
                  <Text style={styles.retailer}> {item.brand}</Text>
                  <Text style={styles.metaDot}>  ·  </Text>
                  <Text style={styles.inStockText}>In Stock</Text>
                </View>

                {/* Delivery estimate */}
                <View style={styles.deliveryRow}>
                  <TruckIcon />
                  <Text style={styles.deliveryText}> Ships within 3–5 business days</Text>
                </View>

                {/* Price + quantity controls */}
                <View style={styles.cardBottom}>
                  <View>
                    <Text style={styles.price}>
                      ${(item.price * item.quantity).toLocaleString()}
                    </Text>
                    {item.quantity > 1 && (
                      <Text style={styles.priceUnit}>
                        ${item.price.toLocaleString()} / unit
                      </Text>
                    )}
                  </View>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.key, -1)}>
                      <MinusIcon />
                    </TouchableOpacity>
                    <View style={styles.qtyDivider} />
                    <AnimatedQtyText value={item.quantity} style={styles.qtyText} />
                    <View style={styles.qtyDivider} />
                    <TouchableOpacity style={styles.qtyBtn} onPress={() => updateQuantity(item.key, 1)}>
                      <PlusIcon />
                    </TouchableOpacity>
                  </View>
                </View>

              </View>
            </View>
          );
        })}

        {/* ── Order Summary ────────────────────────────────────── */}
        <View style={styles.summaryCard}>

          {/* Receipt-style header */}
          <View style={styles.summaryHeader}>
            <Text style={styles.summaryTitle}>Order Summary</Text>
            <Text style={styles.summaryDate}>{formatOrderDate()}</Text>
          </View>

          <DashedRule />

          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Items ({totalItems})</Text>
            <Text style={styles.summaryValue}>${subtotal.toLocaleString()}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Standard Shipping</Text>
            <Text style={styles.summaryValue}>${shipping}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Est. Tax</Text>
            <Text style={styles.summaryMuted}>Calc. at checkout</Text>
          </View>

          <View style={styles.solidDivider} />

          <View style={styles.summaryRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>${total.toLocaleString()}</Text>
          </View>

          {/* Free returns highlight */}
          <View style={styles.returnsRow}>
            <Text style={styles.returnsText}>✓  Free 30-day returns on all items</Text>
          </View>

          <DashedRule />

          {/* Secure checkout note */}
          <View style={styles.secureRow}>
            <ShieldIcon />
            <Text style={styles.secureText}>  Secured by 256-bit SSL encryption</Text>
          </View>

        </View>

        <View style={{ height: space['5xl'] + space['3xl'] }} />
      </ScrollView>

      {/* ── Checkout button ──────────────────────────────────── */}
      <View style={styles.checkoutWrap}>
        <LinearGradient
          colors={['rgba(248,250,255,0)', '#F8FAFF']}
          style={styles.checkoutFade}
          pointerEvents="none"
        />
        <TouchableOpacity
          style={styles.checkoutBtn}
          activeOpacity={0.85}
          onPress={() => {
            addOrder({ items: [...items], subtotal, shipping, total });
            clearCart();
            Alert.alert(
              'Order Placed!',
              'Your order has been confirmed. View it in Order History from your profile settings.',
              [{ text: 'OK' }]
            );
          }}
        >
          <Text style={styles.checkoutText}>
            <Text style={styles.checkoutTextLabel}>Checkout</Text>
            <Text style={styles.checkoutTextSep}>  ·  </Text>
            <Text style={styles.checkoutTextTotal}>${total.toLocaleString()}</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollContent: {
    paddingTop: space['5xl'],
    paddingHorizontal: space.lg,
    paddingBottom: space['2xl'],
  },

  // ── Header
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: space.xl,
  },
  pageTitle: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.xbold,
    color: colors.black,
    letterSpacing: letterSpacing.tight,
  },
  subtitle: {
    fontSize: fontSize.sm,
    color: '#888',
    opacity: 0.44,
    marginTop: space.xs,
  },
  cartCountBadge: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.bluePrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.xs,
  },
  cartCountText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.white,
  },

  // ── Item Card — Tier 1: outer container + shadow.low + border.subtle
  card: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radius.xl,
    marginBottom: space.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
  },
  cardStripe: {
    width: 4,
  },
  thumb: {
    width: 86,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryPill: {
    position: 'absolute',
    bottom: space.sm,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: space.xs,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  categoryPillText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#fff',
    letterSpacing: letterSpacing.wider,
    textTransform: 'uppercase',
  },
  cardContent: {
    flex: 1,
    paddingVertical: space.md,
    paddingLeft: space.md,
    paddingRight: space.md,
  },
  cardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.black,
    flex: 1,
    marginRight: space.sm,
    lineHeight: fontSize.base * 1.3,
  },
  trashBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(239,68,68,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -4,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.xs,
  },
  retailer: {
    fontSize: fontSize.sm,
    color: '#555',
    fontWeight: fontWeight.medium,
    opacity: 0.72,
  },
  metaDot: {
    fontSize: fontSize.sm,
    color: '#ccc',
    opacity: 0.44,
  },
  inStockText: {
    fontSize: fontSize.xs,
    color: '#16A34A',
    fontWeight: fontWeight.medium,
  },
  deliveryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: space.xs,
  },
  deliveryText: {
    fontSize: fontSize.xs,
    color: '#aaa',
    opacity: 0.44,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    marginTop: space.sm,
  },
  price: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.xbold,
    color: colors.black,
    letterSpacing: letterSpacing.tight,
    fontVariant: ['tabular-nums'],
  },
  priceUnit: {
    fontSize: fontSize.xs,
    color: '#aaa',
    opacity: 0.44,
    marginTop: space.xs,
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.background,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    overflow: 'hidden',
  },
  qtyBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
  },
  qtyDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  qtyText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.black,
    minWidth: 36,
    textAlign: 'center',
  },

  // ── Order Summary — Tier 1: outer container + shadow.low + border.subtle
  summaryCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: radius.xl,
    padding: space.lg,
    marginTop: space.xs,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
  },
  summaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryTitle: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.black,
  },
  summaryDate: {
    fontSize: fontSize.sm,
    color: '#aaa',
    fontWeight: fontWeight.regular,
    opacity: 0.44,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  summaryLabel: {
    fontSize: fontSize.sm,
    color: '#888',
    opacity: 0.72,
  },
  summaryValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.black,
  },
  summaryMuted: {
    fontSize: fontSize.sm,
    color: '#bbb',
    opacity: 0.44,
    fontStyle: 'italic',
  },
  solidDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginVertical: space.sm,
  },
  totalLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: colors.black,
  },
  totalValue: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.xbold,
    color: colors.black,
    letterSpacing: letterSpacing.tight,
    fontVariant: ['tabular-nums'],
  },
  returnsRow: {
    marginTop: space.sm,
    backgroundColor: '#F0FDF4',
    borderRadius: radius.sm,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
  },
  returnsText: {
    fontSize: fontSize.sm,
    color: '#16A34A',
    fontWeight: fontWeight.medium,
  },
  secureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secureText: {
    fontSize: fontSize.xs,
    color: '#aaa',
    opacity: 0.44,
  },

  // ── Checkout sticky bar
  checkoutWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.lg,
    paddingBottom: 34,
    paddingTop: space.md,
    backgroundColor: '#F8FAFF',
  },
  checkoutFade: {
    position: 'absolute',
    top: -24,
    left: 0,
    right: 0,
    height: 24,
    pointerEvents: 'none',
  },
  checkoutBtn: {
    backgroundColor: colors.bluePrimary,
    borderRadius: radius.md,
    height: space['5xl'],
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: shadow.medium.shadowColor,
    shadowOffset: shadow.medium.shadowOffset,
    shadowOpacity: shadow.medium.shadowOpacity,
    shadowRadius: shadow.medium.shadowRadius,
    elevation: shadow.medium.elevation,
  },
  checkoutText: {
    color: colors.white,
  },
  checkoutTextLabel: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.medium,
    color: colors.white,
    letterSpacing: letterSpacing.tight,
  },
  checkoutTextSep: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.regular,
    color: 'rgba(255,255,255,0.6)',
  },
  checkoutTextTotal: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.xbold,
    color: colors.white,
    letterSpacing: letterSpacing.tight,
  },

  // ── Empty state
  emptyContainer: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space['3xl'],
  },
  emptyTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: colors.black,
    marginTop: space.lg,
    marginBottom: space.sm,
    letterSpacing: letterSpacing.tight,
  },
  emptySubtitle: {
    fontSize: fontSize.base,
    color: '#888',
    opacity: 0.44,
    textAlign: 'center',
    lineHeight: fontSize.base * 1.5,
    maxWidth: 260,
    marginBottom: space['2xl'],
  },
  emptyBtn: {
    backgroundColor: colors.bluePrimary,
    paddingHorizontal: space['3xl'],
    height: 52,
    borderRadius: radius.md,
    justifyContent: 'center',
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
  },
  emptyBtnText: {
    color: colors.white,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
  },
});
