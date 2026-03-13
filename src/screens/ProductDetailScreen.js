import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Animated,
  Easing,
  Linking,
  Image,
} from 'react-native';
import Svg, { Path, Circle, Polyline, Line, Rect } from 'react-native-svg';
import theme from '../constants/theme';
import { colors as legacyColors } from '../constants/colors';
import { fontSize, fontWeight as fwOld, letterSpacing, space, radius, shadow, typeScale } from '../constants/tokens';
import { useCart } from '../context/CartContext';
import Skeleton from '../components/Skeleton';
import { SellerName } from '../components/VerifiedBadge';
import { getSourceLabel, getSourceColor } from '../services/affiliateProducts';

const C  = theme.colors;
const TY = theme.typography;
const FW = theme.fontWeight;
const SP = theme.space;
const R  = theme.radius;
const SH = theme.shadow;

const { height: SCREEN_H } = Dimensions.get('window');

// ─── Icons ────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"
      stroke={C.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function HeartIcon({ filled }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24"
      fill={filled ? C.destructive : 'none'}
      stroke={filled ? C.destructive : C.textPrimary}
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function CartIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"
      stroke={C.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={9} cy={21} r={1} />
      <Circle cx={20} cy={21} r={1} />
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"
      stroke={C.white} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

function FeatureCheckIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none"
      stroke={C.primary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

function StarIcon({ filled }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24"
      fill={filled ? '#F1C40F' : 'none'} stroke="#F1C40F"
      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  );
}

function SofaLargeIcon() {
  return (
    <Svg width={60} height={60} viewBox="0 0 24 24" fill="none"
      stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3" />
      <Path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0z" />
      <Path d="M4 18v2" />
      <Path d="M20 18v2" />
    </Svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const GRADIENT_PALETTES = [
  ['#2C3E50', '#1A3557'],
  ['#1E3A2F', '#2D5A47'],
  ['#3B2E4A', '#5D4E7E'],
  ['#4A3228', '#6D4C3E'],
  ['#1A2E44', '#2A4A6B'],
];

function getGradient(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return GRADIENT_PALETTES[Math.abs(hash) % GRADIENT_PALETTES.length];
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProductDetailScreen({ route, navigation }) {
  const product = route?.params?.product;
  const design  = route?.params?.design;
  const { addToCart, items } = useCart();
  const [liked, setLiked]           = useState(false);
  const [justAdded, setJustAdded]   = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);

  const cartLabelOpacity  = useRef(new Animated.Value(1)).current;
  const addedLabelOpacity = useRef(new Animated.Value(0)).current;
  const heartScale        = useRef(new Animated.Value(1)).current;

  const name        = product?.name ?? 'Modern Velvet Sofa';
  const brand       = product?.brand ?? 'Article';
  const price       = product?.price ?? '$1,899';
  const imageUrl    = product?.imageUrl ?? null;
  const affiliateUrl = product?.affiliateUrl ?? null;
  const source      = product?.source ?? 'amazon';
  const description = product?.description ?? null;
  const gradientColors = getGradient(name);

  // ── All logic below is unchanged ─────────────────────────────────────────
  const handleBuyNow = async () => {
    if (!affiliateUrl) return;
    const supported = await Linking.canOpenURL(affiliateUrl);
    if (supported) {
      await Linking.openURL(affiliateUrl);
    } else {
      Alert.alert('Cannot Open Link', 'Unable to open the product page.');
    }
  };

  const cartKey = `${name}__${brand}`;
  const inCart  = items.some((item) => item.key === cartKey);

  const handleAddToCart = () => {
    if (inCart) {
      navigation.navigate('Main', { screen: 'Cart' });
      return;
    }
    addToCart({ name, brand, price });

    Animated.parallel([
      Animated.timing(cartLabelOpacity,  { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(addedLabelOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setJustAdded(true);
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(cartLabelOpacity,  { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(addedLabelOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        ]).start(() => setJustAdded(false));
      }, 1500);
    });
  };

  const handleHeartPress = () => {
    setLiked((prev) => !prev);
    Animated.sequence([
      Animated.timing(heartScale, {
        toValue: 1.4,
        duration: 120,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.spring(heartScale, {
        toValue: 1,
        damping: 10,
        stiffness: 300,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const brandName = brand.split('·')[0].trim();

  const descriptionText = description ||
    `Premium quality ${name.toLowerCase()} from ${brandName}. Crafted with care using the finest materials for exceptional comfort and timeless style. Designed to seamlessly blend into modern and classic interiors alike — a statement piece that elevates any room.`;

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* ── Section 4A: Hero Image ────────────────────────────────── */}
        <View style={styles.heroWrap}>
          {imageUrl ? (
            <Image
              source={{ uri: imageUrl }}
              style={styles.heroImage}
              resizeMode="cover"
            />
          ) : (
            <View style={[styles.heroImage, { backgroundColor: gradientColors[0], alignItems: 'center', justifyContent: 'center' }]}>
              <SofaLargeIcon />
            </View>
          )}

          {/* Frosted glass nav buttons */}
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.navBtn} onPress={() => navigation?.goBack()}
              accessibilityLabel="Go back">
              <BackIcon />
            </TouchableOpacity>
            <TouchableOpacity style={styles.navBtn} onPress={handleHeartPress}
              accessibilityLabel={liked ? 'Remove from wishlist' : 'Add to wishlist'}>
              <Animated.View style={{ transform: [{ scale: heartScale }] }}>
                <HeartIcon filled={liked} />
              </Animated.View>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Section 4B: Product Info Card ──────────────────────────── */}
        <View style={styles.infoCard}>
          {/* Brand name — uppercase, tracked, primary blue */}
          <Text style={styles.brandName}>{brandName}</Text>

          {/* Product name */}
          <Text style={styles.productName}>{name}</Text>

          {/* Rating row + In Stock pill (right-aligned) */}
          <View style={styles.ratingStockRow}>
            <TouchableOpacity style={styles.ratingRow} activeOpacity={0.7}>
              <StarIcon filled />
              <Text style={styles.ratingText}> 4.0</Text>
              <Text style={styles.reviewCount}> (128 reviews)</Text>
              <Text style={styles.ratingChevron}> ›</Text>
            </TouchableOpacity>
            <View style={styles.inStockBadge}>
              <View style={styles.inStockDot} />
              <Text style={styles.inStockText}>In Stock</Text>
            </View>
          </View>

          {/* Price + monthly pill */}
          <View style={styles.priceRow}>
            <Text style={styles.price}>{price}</Text>
            <View style={styles.monthlyPill}>
              <Text style={styles.monthlyText}>or $108/mo</Text>
            </View>
          </View>

          {/* ── Section 4C: Description ───────────────────────────────── */}
          <Text style={styles.sectionLabel}>DESCRIPTION</Text>
          <Text
            style={styles.descText}
            numberOfLines={descExpanded ? undefined : 3}
          >
            {descriptionText}
          </Text>
          {descriptionText.length > 120 && (
            <TouchableOpacity onPress={() => setDescExpanded(!descExpanded)}>
              <Text style={styles.readMore}>
                {descExpanded ? 'Show less' : 'Read more'}
              </Text>
            </TouchableOpacity>
          )}

          {/* FTC Disclosure */}
          <Text style={styles.disclosure}>We may earn a commission on purchases made through our links.</Text>

          {/* Key Features */}
          <Text style={styles.sectionLabel}>KEY FEATURES</Text>
          <View style={styles.featuresCard}>
            {[
              'Solid hardwood frame for lasting durability',
              'High-density foam cushions for all-day comfort',
              'Stain-resistant, easy-clean upholstery fabric',
              'Tool-free assembly — set up in under 20 minutes',
            ].map((feat, i) => (
              <View key={i} style={styles.featureRow}>
                <View style={styles.featureCheck}><FeatureCheckIcon /></View>
                <Text style={styles.featureText}>{feat}</Text>
              </View>
            ))}
          </View>

          {/* Product Details */}
          <Text style={styles.sectionLabel}>PRODUCT DETAILS</Text>
          <View style={styles.specsCard}>
            {[
              { label: 'Brand',      value: brandName },
              { label: 'Category',   value: 'Furniture' },
              { label: 'Material',   value: 'Premium Linen' },
              { label: 'Dimensions', value: '84" W × 36" D × 34" H' },
              { label: 'Condition',  value: 'Brand New' },
              { label: 'Delivery',   value: '2–4 weeks' },
              { label: 'Warranty',   value: '2-year limited' },
            ].map((row, i, arr) => (
              <View key={row.label} style={[styles.specRow, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                <Text style={styles.specLabel}>{row.label}</Text>
                <Text style={styles.specValue}>{row.value}</Text>
              </View>
            ))}
          </View>

          {/* Shipping info strip */}
          <View style={styles.shippingStrip}>
            <View style={styles.shippingItem}>
              <Text style={styles.shippingEmoji}>🚚</Text>
              <Text style={styles.shippingLabel}>Free Shipping</Text>
              <Text style={styles.shippingDesc}>On orders over $500</Text>
            </View>
            <View style={styles.shippingDivider} />
            <View style={styles.shippingItem}>
              <Text style={styles.shippingEmoji}>↩️</Text>
              <Text style={styles.shippingLabel}>30-Day Returns</Text>
              <Text style={styles.shippingDesc}>Hassle-free policy</Text>
            </View>
            <View style={styles.shippingDivider} />
            <View style={styles.shippingItem}>
              <Text style={styles.shippingEmoji}>🛡️</Text>
              <Text style={styles.shippingLabel}>2-Year Warranty</Text>
              <Text style={styles.shippingDesc}>Full coverage</Text>
            </View>
          </View>

          {design && (
            <View style={styles.fromPost}>
              <Text style={styles.fromPostLabel}>FROM POST</Text>
              <View style={styles.fromPostRow}>
                <View style={styles.fromPostAvatar}>
                  <Text style={styles.fromPostAvatarText}>{design.initial}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.fromPostTitle} numberOfLines={1}>
                    {design.title.replace('...', '')}
                  </Text>
                  <SellerName
                    name={`@${design.user}`}
                    isVerified={!!design.verified}
                    size="sm"
                    nameStyle={styles.fromPostUser}
                  />
                </View>
              </View>
            </View>
          )}

          <View style={{ height: 120 }} />
        </View>
      </ScrollView>

      {/* ── Section 4F: Bottom Safe Area ──────────────────────────── */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomButtons}>

          {/* ── Section 4D: Add to Cart Button ──────────────────────── */}
          <TouchableOpacity
            style={[styles.addToCartBtn, inCart && styles.addToCartBtnInCart]}
            activeOpacity={0.85}
            onPress={handleAddToCart}
            accessibilityLabel={inCart ? 'View Cart' : 'Add to Cart'}
          >
            {inCart ? <CheckIcon /> : <CartIcon />}
            <View style={styles.addToCartTextWrap}>
              <Animated.Text style={[styles.addToCartText, { opacity: cartLabelOpacity, position: 'absolute' }]}>
                {inCart ? 'View Cart' : 'Add to Cart'}
              </Animated.Text>
              <Animated.Text style={[styles.addToCartText, { opacity: addedLabelOpacity }]}>
                Added!
              </Animated.Text>
            </View>
          </TouchableOpacity>

          {/* ── Section 4E: Buy on Amazon Button ────────────────────── */}
          {affiliateUrl && (
            <TouchableOpacity
              style={[
                styles.buyAmazonBtn,
                source !== 'amazon' && { backgroundColor: getSourceColor(source) },
              ]}
              activeOpacity={0.85}
              onPress={handleBuyNow}
              accessibilityLabel={getSourceLabel(source)}
            >
              <Text style={[
                styles.buyAmazonText,
                source !== 'amazon' && { color: C.white },
              ]}>
                {getSourceLabel(source)}
              </Text>
              {source === 'amazon' && (
                <Text style={styles.primeBadge}>prime</Text>
              )}
            </TouchableOpacity>
          )}
        </View>
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

  // ── Section 4A: Hero Image ──────────────────────────────────────────────────
  heroWrap: {
    width: '100%',
    height: SCREEN_H * 0.52,                     // spec: 52% screen height
    backgroundColor: C.surface,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 56,                               // status bar + padding
    paddingHorizontal: SP[4],                     // 16px
  },
  navBtn: {
    width: 44,                                    // spec: frosted glass circles
    height: 44,
    borderRadius: R.full,
    backgroundColor: 'rgba(255,255,255,0.9)',    // white 90% opacity
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: SH.md.shadowColor,
    shadowOffset: SH.md.shadowOffset,
    shadowOpacity: SH.md.shadowOpacity,
    shadowRadius: SH.md.shadowRadius,
    elevation: SH.md.elevation,
  },

  // ── Section 4B: Product Info Card ───────────────────────────────────────────
  infoCard: {
    marginTop: -24,                               // spec: -24px overlap with hero
    borderTopLeftRadius: R.xl,                    // 20px
    borderTopRightRadius: R.xl,
    backgroundColor: C.bg,
    paddingHorizontal: SP[5],                     // 20px
    paddingTop: SP[5],                            // 20px
  },
  brandName: {
    ...typeScale.micro,
    color: C.primary,
    textTransform: 'uppercase',
    marginBottom: SP[1],
  },
  productName: {
    ...typeScale.display,
    color: C.textPrimary,
  },
  ratingStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: SP[2],                             // 8px
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ratingText: {
    ...typeScale.caption,
    fontWeight: '700',
    color: C.textPrimary,
  },
  reviewCount: {
    ...typeScale.caption,
    color: C.textTertiary,
  },
  ratingChevron: {
    ...typeScale.caption,
    color: C.textTertiary,
    lineHeight: 20,
  },
  inStockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP[1],                                   // 4px
    backgroundColor: C.successBg,                // #DCFCE7
    borderRadius: R.full,
    paddingHorizontal: SP[2],                     // 8px
    paddingVertical: SP[1],                       // 4px
  },
  inStockDot: {
    width: 6,
    height: 6,
    borderRadius: R.full,
    backgroundColor: C.success,
  },
  inStockText: {
    ...typeScale.micro,
    color: C.success,
    textTransform: undefined,                    // override — don't uppercase this
  },
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP[3],                                   // 12px
    marginTop: SP[4],                             // 16px
    marginBottom: SP[1],
  },
  price: {
    fontSize: TY['3xl'].fontSize,                 // 34px — hero price on PDP
    fontWeight: '800',
    color: C.textPrimary,
    fontVariant: ['tabular-nums'],
  },
  monthlyPill: {
    backgroundColor: C.primaryLight,
    borderRadius: R.full,
    paddingHorizontal: SP[3],
    paddingVertical: SP[1],
  },
  monthlyText: {
    ...typeScale.caption,
    fontWeight: '600',
    color: C.primary,
  },

  // ── Section 4C: Description ─────────────────────────────────────────────────
  sectionLabel: {
    ...typeScale.subheadline,
    color: C.textTertiary,
    marginTop: SP[6],
    marginBottom: SP[3],
  },
  descText: {
    ...typeScale.body,
    color: C.textSecondary,
  },
  readMore: {
    ...typeScale.caption,
    fontWeight: '600',
    color: C.primary,
    marginTop: SP[1],
  },
  disclosure: {
    ...typeScale.caption,
    color: C.textTertiary,
    textAlign: 'center',
    marginTop: SP[3],
    fontStyle: 'italic',
  },

  // ── Features Card ──────────────────────────────────────────────────────────
  featuresCard: {
    backgroundColor: C.bg,
    borderRadius: R.lg,                           // 16px
    padding: SP[4],
    borderWidth: 1,
    borderColor: C.border,
    gap: SP[3],
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: SP[2],
  },
  featureCheck: {
    width: 22,
    height: 22,
    borderRadius: R.full,
    backgroundColor: C.primaryLight,             // #DBEAFE
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  featureText: {
    ...typeScale.body,
    flex: 1,
    color: C.textSecondary,
  },

  // ── Specs Card ─────────────────────────────────────────────────────────────
  specsCard: {
    backgroundColor: C.bg,
    borderRadius: R.lg,
    paddingHorizontal: SP[4],
    borderWidth: 1,
    borderColor: C.border,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: SP[3],
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  specLabel: {
    ...typeScale.caption,
    color: C.textSecondary,
  },
  specValue: {
    ...typeScale.caption,
    fontWeight: '700',
    color: C.textPrimary,
    maxWidth: '50%',
    textAlign: 'right',
  },

  // ── Shipping Strip ─────────────────────────────────────────────────────────
  shippingStrip: {
    flexDirection: 'row',
    backgroundColor: C.bg,
    borderRadius: R.lg,
    padding: SP[4],
    marginTop: SP[4],
    borderWidth: 1,
    borderColor: C.border,
  },
  shippingItem: {
    flex: 1,
    alignItems: 'center',
    gap: SP[1],
  },
  shippingDivider: {
    width: 1,
    backgroundColor: C.border,
    marginVertical: 4,
  },
  shippingEmoji: { fontSize: 17 },
  shippingLabel: {
    ...typeScale.micro,
    color: C.textPrimary,
    textAlign: 'center',
    textTransform: undefined,
  },
  shippingDesc: {
    ...typeScale.caption,
    color: C.textTertiary,
    textAlign: 'center',
  },

  // ── From Post ──────────────────────────────────────────────────────────────
  fromPost: {
    marginTop: SP[5],
    backgroundColor: C.surface,
    borderRadius: R.md,
    padding: SP[3],
  },
  fromPostLabel: {
    ...typeScale.subheadline,
    color: C.textTertiary,
    marginBottom: SP[2],
  },
  fromPostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP[2],
  },
  fromPostAvatar: {
    width: 28,
    height: 28,
    borderRadius: R.full,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fromPostAvatarText: {
    ...typeScale.caption,
    color: C.white,
    fontWeight: '700',
  },
  fromPostTitle: {
    ...typeScale.caption,
    fontWeight: '700',
    color: C.textPrimary,
  },
  fromPostUser: {
    ...typeScale.caption,
    color: C.textTertiary,
  },

  // ── Section 4F: Bottom Bar ─────────────────────────────────────────────────
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: SP[5],                     // 20px
    paddingBottom: 34,                            // safe area + 16px
    paddingTop: SP[3],                            // 12px
    backgroundColor: C.bg,                       // white — no gradient
    borderTopWidth: 1,
    borderTopColor: C.border,                    // 1px --color-border
  },
  bottomButtons: {
    gap: SP[2],                                   // 8px between buttons
  },

  // ── Section 4D: Add to Cart ─────────────────────────────────────────────────
  addToCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primary,                  // #1D4ED8
    borderRadius: R.full,                         // pill
    height: 56,                                   // spec: 56px
    gap: SP[2],
    shadowColor: SH.md.shadowColor,
    shadowOffset: SH.md.shadowOffset,
    shadowOpacity: SH.md.shadowOpacity,
    shadowRadius: SH.md.shadowRadius,
    elevation: SH.md.elevation,
  },
  addToCartBtnInCart: {
    backgroundColor: C.success,                  // green when in cart
  },
  addToCartTextWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    height: TY.md.fontSize * 1.4,
  },
  addToCartText: {
    ...typeScale.button,
    color: C.white,
  },

  // ── Section 4E: Buy on Amazon ───────────────────────────────────────────────
  buyAmazonBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.amazon,                   // #FF9900
    borderRadius: R.full,                         // pill
    height: 52,                                   // spec: 52px
    gap: SP[2],
  },
  buyAmazonText: {
    ...typeScale.button,
    color: C.amazonText,
  },
  primeBadge: {
    ...typeScale.micro,
    color: '#00A8E0',
    textDecorationLine: 'underline',
    fontStyle: 'italic',
    textTransform: undefined,
  },
});
