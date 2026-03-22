import React, { useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Animated,
  Easing,
  ActivityIndicator,
  Linking,
} from 'react-native';
import CardImage from '../components/CardImage';
import Svg, { Path, Circle, Line, Polyline, Rect } from 'react-native-svg';
import { useStripe } from '@stripe/stripe-react-native';
import theme from '../constants/theme';
import { typeScale } from '../constants/tokens';
import { useCart } from '../context/CartContext';
import { useOrderHistory } from '../context/OrderHistoryContext';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../services/supabase';

const C  = theme.colors;
const SP = theme.space;
const R  = theme.radius;
const SH = theme.shadow;
const FW = theme.fontWeight;
const TY = theme.typography;

// ─── Icons ────────────────────────────────────────────────────────────────────

function TrashIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
      stroke={C.destructive} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
    </Svg>
  );
}

function MinusIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"
      stroke={C.textPrimary} strokeWidth={2} strokeLinecap="round">
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

function PlusIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"
      stroke={C.textPrimary} strokeWidth={2} strokeLinecap="round">
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

function CheckoutCartIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"
      stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      <Circle cx={10} cy={20.5} r={1} fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={1} />
      <Circle cx={17} cy={20.5} r={1} fill="#FFFFFF" stroke="#FFFFFF" strokeWidth={1} />
    </Svg>
  );
}

function ShoppingBagIcon() {
  return (
    <Svg width={64} height={64} viewBox="0 0 24 24" fill="none"
      stroke={C.textTertiary} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"
      style={{ opacity: 0.5 }}>
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
      <Circle cx={10} cy={20.5} r={1} fill={C.textTertiary} stroke={C.textTertiary} strokeWidth={1} />
      <Circle cx={17} cy={20.5} r={1} fill={C.textTertiary} stroke={C.textTertiary} strokeWidth={1} />
    </Svg>
  );
}

function SofaIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none"
      stroke={C.textTertiary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3" />
      <Path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0z" />
      <Path d="M4 18v2" />
      <Path d="M20 18v2" />
    </Svg>
  );
}

function BedIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none"
      stroke={C.textTertiary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 4v16" />
      <Path d="M2 8h18a2 2 0 0 1 2 2v10" />
      <Path d="M2 17h20" />
      <Path d="M6 8v9" />
    </Svg>
  );
}

function LightbulbIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none"
      stroke={C.textTertiary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 18h6" />
      <Path d="M10 22h4" />
      <Path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" />
    </Svg>
  );
}

function TableIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none"
      stroke={C.textTertiary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={18} height={5} rx={1} />
      <Path d="M5 8v11" />
      <Path d="M19 8v11" />
    </Svg>
  );
}

function ChairIcon() {
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="none"
      stroke={C.textTertiary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2z" />
      <Path d="M7 12V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v7" />
    </Svg>
  );
}

function VerifiedIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill={C.primary} />
      <Path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ShieldIcon({ color = C.success, size = 13 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getCategoryInfo(name) {
  const lower = name.toLowerCase();
  if (lower.includes('sofa') || lower.includes('couch') || lower.includes('sectional') || lower.includes('loveseat')) {
    return { icon: 'sofa' };
  }
  if (lower.includes('chair') || lower.includes('stool') || lower.includes('recliner') || lower.includes('ottoman')) {
    return { icon: 'chair' };
  }
  if (lower.includes('bed') || lower.includes('mattress') || lower.includes('headboard')) {
    return { icon: 'bed' };
  }
  if (lower.includes('lamp') || lower.includes('light') || lower.includes('sconce') || lower.includes('chandelier')) {
    return { icon: 'lamp' };
  }
  if (lower.includes('table') || lower.includes('desk') || lower.includes('shelf') || lower.includes('shelv') || lower.includes('cabinet')) {
    return { icon: 'table' };
  }
  return { icon: 'sofa' };
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
  const opacity    = useRef(new Animated.Value(1)).current;
  const prevValue  = useRef(value);

  if (prevValue.current !== value) {
    const dir = value > prevValue.current ? -1 : 1;
    prevValue.current = value;

    Animated.sequence([
      Animated.parallel([
        Animated.timing(translateY, { toValue: dir * 12, duration: 75, easing: Easing.in(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0,        duration: 75,  useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(translateY, { toValue: -dir * 12, duration: 0, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0,         duration: 0,  useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 150, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 1, duration: 150, useNativeDriver: true }),
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
  const { user }                              = useAuth();
  const { items, removeFromCart, updateQuantity, subtotal, clearCart } = useCart();
  const { addOrder }                          = useOrderHistory();
  const { initPaymentSheet, presentPaymentSheet } = useStripe();
  const [checkingOut, setCheckingOut]         = useState(false);

  const shipping   = items.length > 0 ? 29 : 0;
  const total      = subtotal + shipping;
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  const allAmazon  = items.length > 0 && items.every((i) => i.source === 'amazon');

  // ── ALL checkout logic unchanged ─────────────────────────────────────────────
  const handleCheckout = useCallback(async () => {
    if (checkingOut) return;

    // All curated products are Amazon affiliate items — build a single multi-cart URL
    const amazonItems = items.filter((i) => i.source === 'amazon');
    if (amazonItems.length === items.length && items.length > 0) {
      // Amazon multi-cart URL: adds ALL items to the user's Amazon cart in one tap
      // Format: /gp/aws/cart/add.html?ASIN.1=XXX&Quantity.1=1&ASIN.2=YYY&Quantity.2=2&tag=snapspace20-20
      const AFFILIATE_TAG = 'snapspace20-20';
      const itemsWithAsin = amazonItems.filter((i) => i.asin);

      if (itemsWithAsin.length > 0) {
        // Build multi-cart URL with all ASINs + quantities
        const params = itemsWithAsin.map((item, idx) =>
          `ASIN.${idx + 1}=${item.asin}&Quantity.${idx + 1}=${item.quantity}`
        ).join('&');
        const multiCartUrl = `https://www.amazon.com/gp/aws/cart/add.html?${params}&tag=${AFFILIATE_TAG}`;
        try { await Linking.openURL(multiCartUrl); } catch (e) {
          // Fallback: open first item's affiliate URL
          if (amazonItems[0]?.affiliateUrl) {
            await Linking.openURL(amazonItems[0].affiliateUrl);
          }
        }
      } else if (amazonItems[0]?.affiliateUrl) {
        // No ASINs stored yet — fall back to first item's affiliate URL
        await Linking.openURL(amazonItems[0].affiliateUrl);
      }
      return;
    }

    // SnapSpace marketplace checkout (Stripe) for non-affiliate items
    setCheckingOut(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('create-payment-intent', {
        body: { amount: total },
      });
      if (fnError) throw new Error(fnError.message);

      const { clientSecret, ephemeralKey, customerId } = data;

      const { error: initError } = await initPaymentSheet({
        merchantDisplayName: 'SnapSpace',
        customerId,
        customerEphemeralKeySecret: ephemeralKey,
        paymentIntentClientSecret: clientSecret,
        allowsDelayedPaymentMethods: false,
        defaultBillingDetails: { name: '' },
      });
      if (initError) throw new Error(initError.message);

      const { error: presentError } = await presentPaymentSheet();
      if (presentError) {
        if (presentError.code !== 'Canceled') {
          Alert.alert('Payment failed', presentError.message);
        }
        return;
      }

      addOrder({ items: [...items], subtotal, shipping, total });
      clearCart();
      Alert.alert(
        'Order Confirmed!',
        'Your payment was successful. View your order in Order History from your profile.',
        [{ text: 'OK' }]
      );
    } catch (err) {
      Alert.alert('Checkout error', err.message || 'Something went wrong. Please try again.');
    } finally {
      setCheckingOut(false);
    }
  }, [checkingOut, total, items, subtotal, shipping]);

  // ── Guest gate — unchanged ────────────────────────────────────────────────────
  if (!user) {
    return (
      <View style={{ flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#111', marginBottom: 8, textAlign: 'center' }}>Sign in to view your cart</Text>
        <Text style={{ fontSize: 14, color: '#6B7280', textAlign: 'center', marginBottom: 28, lineHeight: 21 }}>Create a free account to save items, check out, and track your orders.</Text>
        <TouchableOpacity onPress={() => navigation.navigate('Auth')} style={{ backgroundColor: '#1D4ED8', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40 }}>
          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>Sign In / Sign Up</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Empty state ───────────────────────────────────────────────────────────────
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
          <Text style={styles.emptyBtnText}>Start exploring</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <View style={styles.container}>

      {/* ── Section 2A: Header ────────────────────────────────────── */}
      <View style={styles.headerSection}>
        <View style={styles.headerRow}>
          <Text style={styles.pageTitle}>My Cart</Text>
          <View style={styles.cartCountBadge}>
            <Text style={styles.cartCountText}>{totalItems}</Text>
          </View>
        </View>
        <Text style={styles.subtitle}>
          {totalItems} item{totalItems !== 1 ? 's' : ''}
        </Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>

        {/* ── Section 2B: Cart Item Rows ─────────────────────────────── */}
        {items.map((item) => {
          const category = getCategoryInfo(item.name);
          return (
            <View key={item.key} style={styles.itemRow}>

              {/* Product image — 88×88 square, light gray bg, radius-lg */}
              <View style={styles.itemImageWrap}>
                <CardImage uri={item.imageUrl} style={styles.itemImage} resizeMode="cover" />
              </View>

              {/* Content column */}
              <View style={styles.itemContent}>

                {/* Product name + Delete button (top-right) */}
                <View style={styles.itemTopRow}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                  {/* Delete — tap handler unchanged */}
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => removeFromCart(item.key)}
                    accessibilityLabel="Remove item from cart"
                  >
                    <TrashIcon />
                  </TouchableOpacity>
                </View>

                {/* Seller row — verified icon + brand name in primary blue */}
                <View style={styles.sellerRow}>
                  <VerifiedIcon />
                  <Text style={styles.sellerName}> {item.brand}</Text>
                </View>

                {/* Stock + Shipping row */}
                <View style={styles.stockRow}>
                  <View style={styles.inStockPill}>
                    <Text style={styles.inStockText}>In Stock</Text>
                  </View>
                  <Text style={styles.shippingText}>  Ships in 3–5 days</Text>
                </View>

                {/* Price + Quantity stepper (right-aligned on same row) */}
                <View style={styles.priceQtyRow}>
                  <Text style={styles.price}>
                    ${(item.price * item.quantity).toLocaleString()}
                  </Text>
                  {/* Stepper — updateQuantity logic unchanged */}
                  <View style={styles.qtyRow}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => updateQuantity(item.key, -1)}
                      accessibilityLabel="Decrease quantity"
                    >
                      <MinusIcon />
                    </TouchableOpacity>
                    <AnimatedQtyText value={item.quantity} style={styles.qtyText} />
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => updateQuantity(item.key, 1)}
                      accessibilityLabel="Increase quantity"
                    >
                      <PlusIcon />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Per-item Buy on Amazon link */}
                {item.source === 'amazon' && item.affiliateUrl && (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(item.affiliateUrl)}
                    activeOpacity={0.7}
                    style={styles.itemAmazonBtn}
                  >
                    <Text style={styles.itemAmazonBtnText}>Buy on Amazon →</Text>
                  </TouchableOpacity>
                )}

              </View>
            </View>
          );
        })}

        {/* ── Section 2C: Order Summary Card ─────────────────────────── */}
        <View style={styles.summaryCard}>

          {/* Title row */}
          <View style={styles.summaryHeaderRow}>
            <Text style={styles.summaryTitle}>Order Summary</Text>
            <Text style={styles.summaryDate}>{formatOrderDate()}</Text>
          </View>

          {/* Solid divider — replaces dashed */}
          <View style={styles.solidDivider} />

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

          {/* Solid divider before total */}
          <View style={styles.solidDivider} />

          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Total</Text>
            <Text style={styles.totalValue}>${total.toLocaleString()}</Text>
          </View>

          {/* Trust signals — single green pill row with two items */}
          <View style={styles.trustRow}>
            <View style={styles.trustItem}>
              <Text style={styles.trustText}>✓  Free 30-day returns</Text>
            </View>
            <View style={styles.trustSeparator} />
            <View style={styles.trustItem}>
              <ShieldIcon />
              <Text style={styles.trustText}> SSL secured</Text>
            </View>
          </View>

        </View>

        <Text style={styles.ftcDisclosure}>
          We may earn a commission when you buy through links on this app.
        </Text>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Section 2D: Checkout Bar ────────────────────────────────── */}
      <View style={styles.checkoutWrap}>
        {/* handleCheckout routing logic unchanged */}
        <TouchableOpacity
          style={[styles.checkoutBtn, checkingOut && { opacity: 0.7 }]}
          activeOpacity={0.85}
          disabled={checkingOut}
          onPress={handleCheckout}
          accessibilityLabel={`Checkout for $${total.toLocaleString()}`}
        >
          {checkingOut ? (
            <ActivityIndicator color="#fff" size="small" />
          ) : (
            <View style={styles.checkoutBtnInner}>
              <View style={styles.checkoutLeft}>
                <CheckoutCartIcon />
                <Text style={styles.checkoutLabel}>  {allAmazon ? 'Buy on Amazon' : 'Checkout'}</Text>
              </View>
              <View style={styles.checkoutDivider} />
              <Text style={styles.checkoutPrice}>{allAmazon ? '›' : `$${total.toLocaleString()}`}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({

  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // ── Section 2A: Header ───────────────────────────────────────────────────────
  headerSection: {
    backgroundColor: C.bg,
    paddingTop: 56,              // status bar + 24px per spec
    paddingHorizontal: SP[5],   // 20px
    paddingBottom: SP[3],       // 12px
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pageTitle: {
    ...typeScale.display,
    fontWeight: '800',              // slightly heavier than display for screen title
    color: C.textPrimary,
  },
  cartCountBadge: {
    minWidth: 24,
    height: 24,
    borderRadius: R.full,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SP[1],
  },
  cartCountText: {
    ...typeScale.micro,
    color: C.white,
    textTransform: undefined,
  },
  subtitle: {
    ...typeScale.caption,
    color: C.textSecondary,
    marginTop: 4,
  },

  // ── Scroll container ─────────────────────────────────────────────────────────
  scrollContent: {
    paddingTop: SP[1],              // 4px — header provides visual separation
    paddingBottom: SP[2],
  },

  // ── Section 2B: Cart Item Row ────────────────────────────────────────────────
  itemRow: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    paddingHorizontal: SP[4],       // 16px
    paddingVertical: SP[4],         // 16px
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    minHeight: 96,
    alignItems: 'flex-start',
  },
  itemImageWrap: {
    width: 88,
    height: 88,
    borderRadius: R.lg,             // 16px
    backgroundColor: C.surface,    // #F9FAFB — light gray, NOT dark navy
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemImage: {
    width: '100%',
    height: '100%',
  },
  itemContent: {
    flex: 1,
    marginLeft: SP[3],              // 12px gap between image and content
  },
  itemTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemName: {
    ...typeScale.headline,
    color: C.textPrimary,
    flex: 1,
    marginRight: SP[1],
  },
  deleteBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent', // no background per spec
    marginTop: -6,
    marginRight: -8,
  },
  sellerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  sellerName: {
    ...typeScale.caption,
    color: C.primary,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
    flexWrap: 'wrap',
  },
  inStockPill: {
    backgroundColor: C.successBg,  // #DCFCE7
    borderRadius: R.full,
    paddingVertical: 4,
    paddingHorizontal: 8,
  },
  inStockText: {
    ...typeScale.micro,
    color: C.success,
    textTransform: undefined,
  },
  itemAmazonBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  itemAmazonBtnText: {
    ...typeScale.caption,
    color: '#FF9900',
    fontWeight: '600',
  },
  shippingText: {
    ...typeScale.caption,
    color: C.textSecondary,
  },
  priceQtyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  price: {
    ...typeScale.display,
    fontWeight: '800',
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
  },
  qtyBtn: {
    width: 36,
    height: 36,
    borderRadius: R.sm,             // 8px
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,    // #F9FAFB
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    ...typeScale.headline,
    fontWeight: '700',
    color: C.textPrimary,
    minWidth: 32,
    textAlign: 'center',
  },

  // ── Section 2C: Order Summary Card ──────────────────────────────────────────
  summaryCard: {
    backgroundColor: C.surface,    // #F9FAFB
    borderRadius: R.xl,             // 20px
    padding: SP[5],                 // 20px
    marginHorizontal: SP[4],        // 16px
    marginTop: SP[4],               // 16px
    shadowColor: SH.sm.shadowColor,
    shadowOffset: SH.sm.shadowOffset,
    shadowOpacity: SH.sm.shadowOpacity,
    shadowRadius: SH.sm.shadowRadius,
    elevation: SH.sm.elevation,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryTitle: {
    ...typeScale.headline,
    fontWeight: '700',
    color: C.textPrimary,
  },
  summaryDate: {
    ...typeScale.caption,
    color: C.textSecondary,
  },
  solidDivider: {
    height: 1,
    backgroundColor: C.border,     // #E5E7EB — solid, not dashed
    marginVertical: SP[3],          // 12px
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryLabel: {
    ...typeScale.body,
    color: C.textSecondary,
  },
  summaryValue: {
    ...typeScale.body,
    fontWeight: '600',
    color: C.textPrimary,
  },
  summaryMuted: {
    ...typeScale.caption,
    fontStyle: 'italic',
    color: C.textTertiary,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  totalLabel: {
    ...typeScale.headline,
    fontWeight: '700',
    color: C.textPrimary,
  },
  totalValue: {
    ...typeScale.display,
    fontWeight: '800',
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  trustRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: C.successBg,  // #DCFCE7
    borderRadius: R.md,             // 12px
    paddingVertical: 10,
    paddingHorizontal: SP[3],       // 12px
    marginTop: SP[4],               // 16px
  },
  trustItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  trustSeparator: {
    width: 1,
    height: 16,
    backgroundColor: C.success,
    opacity: 0.3,
    marginHorizontal: SP[2],
  },
  trustText: {
    ...typeScale.micro,
    color: C.success,
    textTransform: undefined,
  },

  ftcDisclosure: {
    fontSize: 11,
    fontStyle: 'italic',
    color: C.textTertiary,
    textAlign: 'center',
    marginTop: 16,
    marginHorizontal: 20,
  },

  // ── Section 2D: Checkout Bar ─────────────────────────────────────────────────
  checkoutWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SP[5],       // 20px
    paddingBottom: 34,              // 20px + 14px safe area
    paddingTop: SP[3],              // 12px
    backgroundColor: C.bg,         // white — no gradient
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  checkoutBtn: {
    backgroundColor: C.primary,    // #1D4ED8
    borderRadius: R.full,           // 9999px pill
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: SH.md.shadowColor,
    shadowOffset: SH.md.shadowOffset,
    shadowOpacity: SH.md.shadowOpacity,
    shadowRadius: SH.md.shadowRadius,
    elevation: SH.md.elevation,
  },
  checkoutBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: SP[5],       // 20px
  },
  checkoutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkoutLabel: {
    ...typeScale.button,
    color: C.white,
  },
  checkoutDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  checkoutPrice: {
    ...typeScale.button,
    fontWeight: '800',
    color: C.white,
    fontVariant: ['tabular-nums'],
  },

  // ── Empty state ──────────────────────────────────────────────────────────────
  emptyContainer: {
    flex: 1,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: SP[8],       // 32px
  },
  emptyTitle: {
    ...typeScale.title,
    color: C.textPrimary,
    marginTop: SP[5],
    marginBottom: SP[2],
  },
  emptySubtitle: {
    ...typeScale.body,
    color: C.textSecondary,
    textAlign: 'center',
    maxWidth: 260,
    marginBottom: SP[6],
  },
  emptyBtn: {
    backgroundColor: C.primary,
    paddingHorizontal: SP[8],       // 32px
    height: 52,
    borderRadius: R.full,           // pill
    justifyContent: 'center',
    shadowColor: SH.sm.shadowColor,
    shadowOffset: SH.sm.shadowOffset,
    shadowOpacity: SH.sm.shadowOpacity,
    shadowRadius: SH.sm.shadowRadius,
    elevation: SH.sm.elevation,
  },
  emptyBtnText: {
    ...typeScale.button,
    color: C.white,
  },
});
