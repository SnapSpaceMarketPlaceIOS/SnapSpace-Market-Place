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
  Linking,
} from 'react-native';
import CardImage from '../components/CardImage';
import LensLoader from '../components/LensLoader';
import Svg, { Path, Circle, Line, Polyline, Rect, Ellipse } from 'react-native-svg';
import theme from '../constants/theme';
import { typeScale } from '../constants/tokens';
import { useCart } from '../context/CartContext';
import { useOrderHistory } from '../context/OrderHistoryContext';
import { supabase } from '../services/supabase';
import { trackAffiliateClickAndTagUrl } from '../services/purchaseTracking';
import { safeOpenURL } from '../utils/safeOpenURL';
import { hapticTap, hapticMedium } from '../utils/haptics';
import { PRODUCT_CATALOG } from '../data/productCatalog';
import TabScreenFade from '../components/TabScreenFade';

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
      stroke={C.textTertiary} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="3 6 5 6 21 6" />
      <Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <Line x1={10} y1={11} x2={10} y2={17} />
      <Line x1={14} y1={11} x2={14} y2={17} />
    </Svg>
  );
}

function StarIconSmall({ filled = true }) {
  return (
    <Svg width={12} height={12} viewBox="0 0 24 24" fill={filled ? '#67ACE9' : '#E5E7EB'} stroke="none">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  );
}

function MinusIcon() {
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24" fill="none"
      stroke={C.textPrimary} strokeWidth={1.5} strokeLinecap="round">
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

function PlusIcon() {
  return (
    <Svg width={10} height={10} viewBox="0 0 24 24" fill="none"
      stroke={C.textPrimary} strokeWidth={1.5} strokeLinecap="round">
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

function CheckoutCartIcon({ color = '#FFFFFF' }) {
  return (
    <Svg width={18} height={18} viewBox="265.5 20.5 27 25" fill="none">
      <Path
        d="M267.104 22H270.08C270.756 22 271.094 22 271.353 22.1807C271.611 22.3614 271.727 22.6792 271.959 23.3149L272.937 26"
        stroke={color} strokeWidth={1} strokeLinecap="round"
      />
      <Path
        d="M287.521 39.3334H273.63C272.984 39.3334 272.661 39.3334 272.442 39.218C272.156 39.0675 271.961 38.7883 271.917 38.4684C271.884 38.2233 271.995 37.9197 272.216 37.3126C272.448 36.675 272.565 36.3562 272.755 36.1102C273.003 35.789 273.343 35.551 273.73 35.4278C274.026 35.3334 274.365 35.3334 275.044 35.3334H283.146"
        stroke={color} strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M283.846 35.3333H276.939C275.703 35.3333 275.085 35.3333 274.594 35.0212C274.103 34.7091 273.841 34.1497 273.317 33.0311L272.024 30.2733C271.123 28.3515 270.673 27.3906 271.115 26.6953C271.557 26 272.618 26 274.74 26H286.483C288.876 26 290.073 26 290.501 26.7728C290.93 27.5457 290.296 28.5605 289.027 30.59L287.238 33.4533C286.663 34.3724 286.376 34.8319 285.924 35.0826C285.471 35.3333 284.929 35.3333 283.846 35.3333Z"
        stroke={color} strokeWidth={1} strokeLinecap="round"
      />
      <Ellipse cx={286.792} cy={42.6667} rx={1.45833} ry={1.33333} fill={color} />
      <Ellipse cx={275.125} cy={42.6667} rx={1.45833} ry={1.33333} fill={color} />
    </Svg>
  );
}

function CheckoutBar({ checkingOut, allAmazon, total, onPress }) {
  const slideAnim = useRef(new Animated.Value(0)).current;
  const [pressed, setPressed] = useState(false);

  const handlePress = () => {
    setPressed(true);
    Animated.timing(slideAnim, {
      toValue: 1,
      duration: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start(() => {
      onPress();
      // Reset after navigation/action completes
      setTimeout(() => {
        setPressed(false);
        slideAnim.setValue(0);
      }, 600);
    });
  };

  const slideWidth = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const textColor = pressed ? C.primary : '#fff';
  const dividerBg = pressed ? 'rgba(29,78,216,0.2)' : 'rgba(255,255,255,0.3)';
  const iconColor = pressed ? C.primary : '#fff';

  return (
    <View style={styles.checkoutWrap}>
      <TouchableOpacity
        style={[styles.checkoutBtn, checkingOut && { opacity: 0.7 }]}
        activeOpacity={1}
        disabled={checkingOut}
        onPress={handlePress}
        accessibilityLabel={`Checkout for $${total.toLocaleString()}`}
      >
        {/* White slide overlay */}
        <Animated.View style={[styles.checkoutSlide, { width: slideWidth }]} />

        {checkingOut ? (
          <LensLoader size={20} color="#fff" light="#fff" />
        ) : allAmazon ? (
          <View style={styles.checkoutBtnInner}>
            <View style={styles.checkoutLeft}>
              <CheckoutCartIcon color={iconColor} />
              <Text style={[styles.checkoutLabel, { color: textColor, marginLeft: 6 }]}>Buy on Amazon</Text>
            </View>
            <View style={[styles.checkoutDivider, { backgroundColor: dividerBg }]} />
            <Text style={[styles.checkoutPrice, { color: textColor }]}>${total.toLocaleString()}</Text>
          </View>
        ) : (
          <View style={styles.checkoutBtnInner}>
            <View style={styles.checkoutLeft}>
              <CheckoutCartIcon color={iconColor} />
              <Text style={[styles.checkoutLabel, { color: textColor, marginLeft: 6 }]}>Checkout</Text>
            </View>
            <View style={[styles.checkoutDivider, { backgroundColor: dividerBg }]} />
            <Text style={[styles.checkoutPrice, { color: textColor }]}>${total.toLocaleString()}</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );
}

function ShoppingBagIcon() {
  const color = C.textTertiary;
  return (
    <Svg width={64} height={64} viewBox="265.5 20.5 27 25" fill="none" style={{ opacity: 0.45 }}>
      <Path
        d="M267.104 22H270.08C270.756 22 271.094 22 271.353 22.1807C271.611 22.3614 271.727 22.6792 271.959 23.3149L272.937 26"
        stroke={color} strokeWidth={0.8} strokeLinecap="round"
      />
      <Path
        d="M287.521 39.3334H273.63C272.984 39.3334 272.661 39.3334 272.442 39.218C272.156 39.0675 271.961 38.7883 271.917 38.4684C271.884 38.2233 271.995 37.9197 272.216 37.3126C272.448 36.675 272.565 36.3562 272.755 36.1102C273.003 35.789 273.343 35.551 273.73 35.4278C274.026 35.3334 274.365 35.3334 275.044 35.3334H283.146"
        stroke={color} strokeWidth={0.8} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M283.846 35.3333H276.939C275.703 35.3333 275.085 35.3333 274.594 35.0212C274.103 34.7091 273.841 34.1497 273.317 33.0311L272.024 30.2733C271.123 28.3515 270.673 27.3906 271.115 26.6953C271.557 26 272.618 26 274.74 26H286.483C288.876 26 290.073 26 290.501 26.7728C290.93 27.5457 290.296 28.5605 289.027 30.59L287.238 33.4533C286.663 34.3724 286.376 34.8319 285.924 35.0826C285.471 35.3333 284.929 35.3333 283.846 35.3333Z"
        stroke={color} strokeWidth={0.8} strokeLinecap="round"
      />
      <Ellipse cx={286.792} cy={42.6667} rx={1.45833} ry={1.33333} fill={color} />
      <Ellipse cx={275.125} cy={42.6667} rx={1.45833} ry={1.33333} fill={color} />
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
    <Svg width={12} height={12} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={10} fill={C.primary} />
      <Path d="M9 12l2 2 4-4" stroke="#fff" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

function ShieldIcon({ color = C.success, size = 13 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
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

    // Build 89: durations bumped above the 150ms perception threshold; both
    // phases now use Easing.out(Easing.cubic) for a calm, decelerating feel.
    // Previous: 75ms exit / 150ms enter — exit was sub-perceptible (read as
    // a flicker), enter used Easing.out(Easing.ease) which is shallow.
    Animated.sequence([
      Animated.parallel([
        Animated.timing(translateY, { toValue: dir * 12, duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0,        duration: 180, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(translateY, { toValue: -dir * 12, duration: 0, useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 0,         duration: 0, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(translateY, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(opacity,    { toValue: 1, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
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
  const { addOrder }                          = useOrderHistory();
  const [checkingOut, setCheckingOut]         = useState(false);

  const shipping   = items.length > 0 ? 29 : 0;
  const total      = subtotal + shipping;
  const totalItems = items.reduce((sum, i) => sum + i.quantity, 0);
  // Build 107: catalog is Amazon-only. Treat any item with an ASIN OR an
  // amazon.com affiliate URL OR explicit `source === 'amazon'` as Amazon.
  // Previously this required `source === 'amazon'` strictly, which broke
  // checkout when the source field dropped through the AI matcher (very
  // common — products would be added to cart with `source: null` and
  // silently fail the strict-equality filter, leaving the user with the
  // "Non-Amazon items not supported" dead end).
  const isAmazonItem = (i) =>
    i.source === 'amazon'
    || !!i.asin
    || (typeof i.affiliateUrl === 'string' && i.affiliateUrl.includes('amazon.com'));
  const allAmazon  = items.length > 0 && items.every(isAmazonItem);

  // ── ALL checkout logic unchanged ─────────────────────────────────────────────
  const handleCheckout = useCallback(async () => {
    if (checkingOut) return;
    setCheckingOut(true);
    // Always clear the guard after the URL open resolves so a second tap
    // can still work (e.g. user returns from Amazon and taps again).
    const releaseGuard = () => setTimeout(() => setCheckingOut(false), 1200);

    // All curated products are Amazon affiliate items — build a single multi-cart URL.
    // Build 107: use the permissive isAmazonItem predicate (any ASIN or
    // amazon.com URL counts) so cart items with missing/null source still
    // route through Amazon checkout.
    const amazonItems = items.filter(isAmazonItem);
    if (amazonItems.length === items.length && items.length > 0) {
      // Amazon multi-cart URL: adds ALL items to the user's Amazon cart in one tap
      // Format: /gp/aws/cart/add.html?ASIN.1=XXX&Quantity.1=1&...&tag=<partner>
      // Use the same partner tag as the individual product URLs in the catalog
      // so commissions bucket cleanly into a single Associates account.
      const AFFILIATE_TAG = process.env.EXPO_PUBLIC_AMAZON_PARTNER_TAG || 'snapspacemkt-20';
      const itemsWithAsin = amazonItems.filter((i) => i.asin);

      // Resolve user id once for attribution tagging. A short timeout
      // prevents a hung auth call from blocking the checkout tap.
      let userId = null;
      try {
        const AUTH_TIMEOUT = 800;
        const r = await Promise.race([
          supabase.auth.getUser(),
          new Promise((resolve) => setTimeout(() => resolve(null), AUTH_TIMEOUT)),
        ]);
        userId = r?.data?.user?.id ?? null;
      } catch { userId = null; }

      // Wrap URL opens so a tag/log failure never blocks revenue
      const tagAndOpen = async (url, product) => {
        let tagged = url;
        try {
          tagged = await trackAffiliateClickAndTagUrl({ userId, url, product });
        } catch { tagged = url; }
        // Build 69 Commit I: affiliate URLs go through safeOpenURL (https-only).
        // The tracked/tagged URL is always an https affiliate host; if it somehow
        // fails the scheme check we fall back to the original product URL which
        // goes through the same check. Both failing = silently no-op (user sees
        // the "redirecting..." affordance already shown before this handler).
        const ok = await safeOpenURL(tagged);
        if (!ok) await safeOpenURL(url);
      };

      if (itemsWithAsin.length > 0) {
        // Build multi-cart URL with all ASINs + quantities
        const params = itemsWithAsin.map((item, idx) =>
          `ASIN.${idx + 1}=${item.asin}&Quantity.${idx + 1}=${item.quantity}`
        ).join('&');
        const multiCartUrl = `https://www.amazon.com/gp/aws/cart/add.html?${params}&tag=${AFFILIATE_TAG}`;
        // First cart item is the click's "product" context for logging purposes.
        // The ascsubtag we append flows through to each ASIN row in Amazon's
        // report, so each confirmed item grants 10 wishes independently.
        await tagAndOpen(multiCartUrl, itemsWithAsin[0]);
      } else if (amazonItems[0]?.affiliateUrl) {
        // No ASINs stored yet — fall back to first item's affiliate URL
        await tagAndOpen(amazonItems[0].affiliateUrl, amazonItems[0]);
      }
      releaseGuard();
      return;
    }

    // Build 107: dead branch. Catalog is Amazon-only, the permissive
    // isAmazonItem predicate above accepts anything with an ASIN or
    // amazon.com URL — items reaching here would have to be entirely
    // un-Amazon (no source, no asin, no amazon URL), which the catalog
    // can no longer produce. Kept as a defensive fallback so the user
    // never sees a silent failure — they'll see a clear message instead
    // of nothing happening.
    Alert.alert(
      'Cannot Check Out',
      'These items don\'t have a valid checkout link. Please remove and re-add them.',
      [{ text: 'OK' }]
    );
    releaseGuard();
  }, [checkingOut, total, items, subtotal, shipping]);

  // ── Empty state ───────────────────────────────────────────────────────────────
  // Build 108: elevated empty-state polish. Soft pastel circle behind the icon
  // gives the moment "weight" instead of feeling like a placeholder. Two CTAs
  // — primary path back to Home (where the user can generate a room) and a
  // ghost secondary to Explore (lighter discovery path). Premium feel, no
  // dead-ends.
  if (items.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <View style={styles.emptyIconCircle}>
          <ShoppingBagIcon />
        </View>
        <Text style={styles.emptyTitle}>Your cart is empty</Text>
        <Text style={styles.emptySubtitle}>
          Generate a room with the genie or browse curated picks — every item you
          tap lands here, ready when you are.
        </Text>
        <TouchableOpacity
          style={styles.emptyBtn}
          onPress={() => { hapticTap(); navigation?.navigate('Home'); }}
          accessibilityRole="button"
          accessibilityLabel="Generate a room"
        >
          <Text style={styles.emptyBtnText}>Generate a room</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.emptyBtnSecondary}
          onPress={() => { hapticTap(); navigation?.navigate('Explore'); }}
          accessibilityRole="button"
          accessibilityLabel="Browse the Explore feed"
        >
          <Text style={styles.emptyBtnSecondaryText}>Browse Explore</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────────
  return (
    <TabScreenFade style={styles.container}>

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
          // Fall back to catalog for rating/reviewCount on items added before the fix
          const catalogMatch = (!item.rating && PRODUCT_CATALOG)
            ? PRODUCT_CATALOG.find(p => p.name === item.name && p.brand === item.brand)
            : null;
          const displayRating = item.rating ?? catalogMatch?.rating ?? null;
          const displayReviewCount = item.reviewCount ?? catalogMatch?.reviewCount ?? null;
          return (
            <View key={item.key} style={styles.itemRow}>

              {/* Product image — 88×88 square, light gray bg, radius-lg */}
              <View style={styles.itemImageWrap}>
                <CardImage uri={item.imageUrl} style={styles.itemImage} resizeMode="cover" compact />
              </View>

              {/* Content column — stacks top-to-bottom, synced to 100px image */}
              <View style={styles.itemContent}>

                {/* Row 1: Product name + Delete button */}
                <View style={styles.itemTopRow}>
                  <Text style={styles.itemName} numberOfLines={2}>{item.name}</Text>
                  <TouchableOpacity
                    style={styles.deleteBtn}
                    onPress={() => { hapticMedium(); removeFromCart(item.key); }}
                    activeOpacity={0.7}
                    hitSlop={{ top: 2, bottom: 2, left: 2, right: 2 }}
                    accessibilityLabel="Remove item from cart"
                  >
                    <TrashIcon />
                  </TouchableOpacity>
                </View>

                {/* Row 2: Stars + rating + review count */}
                {!!displayRating && (
                  <View style={styles.ratingRow}>
                    {[1,2,3,4,5].map(i => (
                      <StarIconSmall key={i} filled={i <= Math.round(displayRating)} />
                    ))}
                    <Text style={styles.ratingScore}> {displayRating.toFixed(1)}</Text>
                    {!!displayReviewCount && (
                      <Text style={styles.ratingCount}> ({displayReviewCount.toLocaleString()})</Text>
                    )}
                  </View>
                )}

                {/* Row 3: Verified brand */}
                <View style={styles.sellerRow}>
                  <VerifiedIcon />
                  <Text style={styles.sellerName}> {item.brand}</Text>
                </View>

                {/* Row 4: Price + Quantity stepper */}
                <View style={styles.priceQtyRow}>
                  <Text style={styles.price}>
                    ${(item.price * item.quantity).toLocaleString()}
                  </Text>
                  <View style={styles.qtyRow}>
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => { hapticTap(); updateQuantity(item.key, -1); }}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Decrease quantity"
                    >
                      <MinusIcon />
                    </TouchableOpacity>
                    <AnimatedQtyText value={item.quantity} style={styles.qtyText} />
                    <TouchableOpacity
                      style={styles.qtyBtn}
                      onPress={() => { hapticTap(); updateQuantity(item.key, 1); }}
                      activeOpacity={0.7}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      accessibilityLabel="Increase quantity"
                    >
                      <PlusIcon />
                    </TouchableOpacity>
                  </View>
                </View>

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

          {/* Trust signals — plain green text, no pill */}
          <View style={styles.trustRow}>
            <Text style={styles.trustText}>✓  Free 30-Day Returns</Text>
            <Text style={styles.trustTextMuted}>  ·  </Text>
            <ShieldIcon color={C.primary} size={12} />
            <Text style={styles.trustText}>  SSL Secured</Text>
          </View>

        </View>

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Section 2D: Checkout Bar ────────────────────────────────── */}
      <CheckoutBar
        checkingOut={checkingOut}
        allAmazon={allAmazon}
        total={total}
        onPress={handleCheckout}
      />

    </TabScreenFade>
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
    fontFamily: 'Geist_700Bold',
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
    fontFamily: 'Geist_600SemiBold',
    color: C.white,
    textTransform: undefined,
  },
  subtitle: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.primary,
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
    width: 112,
    height: 112,
    borderRadius: 6,                // 6px — sharp, crisp corners
    backgroundColor: C.surface,
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
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    lineHeight: 19,
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
    marginTop: SP[1],
  },
  sellerName: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    lineHeight: 14,
    color: C.primary,
  },
  stockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SP[1],
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
    fontFamily: 'Geist_600SemiBold',
    color: C.success,
    textTransform: undefined,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SP[2],
    gap: 1,
  },
  ratingScore: {
    ...typeScale.caption,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: C.textPrimary,
  },
  ratingCount: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
  },
  shippingText: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
  },
  priceQtyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: SP[1],
  },
  price: {
    ...typeScale.price,             // 16px / 700 — bold but compact
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  qtyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 28,
  },
  qtyBtn: {
    width: 28,
    height: 28,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qtyText: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,
    minWidth: 22,
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
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,
  },
  summaryDate: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
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
    marginBottom: SP[3],
  },
  summaryLabel: {
    ...typeScale.body,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
  },
  summaryValue: {
    ...typeScale.body,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: C.textPrimary,
  },
  summaryMuted: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
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
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,
  },
  totalValue: {
    ...typeScale.display,
    fontWeight: '800',
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  trustRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SP[4],               // 16px
  },
  trustText: {
    ...typeScale.caption,
    color: C.primary,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
  },
  trustTextMuted: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
  },

  // ── Section 2D: Checkout Bar ─────────────────────────────────────────────────
  checkoutWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SP[5],       // 20px
    paddingBottom: SP[3],           // 12px — matches paddingTop
    paddingTop: SP[3],              // 12px
    backgroundColor: C.bg,         // white — no gradient
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  checkoutBtn: {
    backgroundColor: C.primary,    // #0B6DC3
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
  checkoutSlide: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 9999,
  },
  checkoutBtnInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: SP[5],       // 20px
  },
  checkoutBtnInnerCentered: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
  },
  checkoutLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  checkoutRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  checkoutLabel: {
    ...typeScale.button,
    fontFamily: 'Geist_600SemiBold',
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
    fontFamily: 'Geist_700Bold',
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
  // Build 108: soft pastel disc behind the icon. The circle isn't decorative —
  // it gives the empty state visual weight so it reads as intentional design,
  // not "we forgot to load." The blue tint ties to brand palette without
  // being loud.
  emptyIconCircle: {
    width: 128,
    height: 128,
    borderRadius: 64,
    backgroundColor: 'rgba(11, 109, 195, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: {
    ...typeScale.title,
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,
    marginTop: SP[5],
    marginBottom: SP[2],
  },
  emptySubtitle: {
    ...typeScale.body,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: SP[6],
    lineHeight: 22,
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
    fontFamily: 'Geist_600SemiBold',
    color: C.white,
  },
  // Build 108: ghost secondary CTA — lower-emphasis path to Explore.
  emptyBtnSecondary: {
    paddingHorizontal: SP[8],
    height: 44,
    justifyContent: 'center',
    marginTop: SP[3],
  },
  emptyBtnSecondaryText: {
    ...typeScale.button,
    fontFamily: 'Geist_500Medium',
    color: C.textSecondary,
  },
});
