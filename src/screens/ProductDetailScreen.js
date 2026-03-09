import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Polyline, Line, Rect } from 'react-native-svg';
import { colors } from '../constants/colors';
import { fontSize, fontWeight, letterSpacing, space, radius, shadow } from '../constants/tokens';
import { useCart } from '../context/CartContext';

const { height } = Dimensions.get('window');

function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.black} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function HeartIcon({ filled }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill={filled ? '#E74C3C' : 'none'} stroke={filled ? '#E74C3C' : colors.black} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function CartIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={9} cy={21} r={1} />
      <Circle cx={20} cy={21} r={1} />
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Svg>
  );
}

function CheckIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

function SofaLargeIcon() {
  return (
    <Svg width={60} height={60} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3" />
      <Path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0z" />
      <Path d="M4 18v2" />
      <Path d="M20 18v2" />
    </Svg>
  );
}

// Key features check icon
function FeatureCheckIcon() {
  return <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke={colors.bluePrimary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"><Polyline points="20 6 9 17 4 12"/></Svg>;
}

function StarIcon({ filled }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill={filled ? '#F1C40F' : 'none'} stroke="#F1C40F" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  );
}

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

export default function ProductDetailScreen({ route, navigation }) {
  const product = route?.params?.product;
  const design = route?.params?.design;
  const { addToCart, items } = useCart();
  const [liked, setLiked] = useState(false);

  const name = product?.name ?? 'Modern Velvet Sofa';
  const brand = product?.brand ?? 'Article';
  const price = product?.price ?? '$1,899';
  const gradientColors = getGradient(name);

  const cartKey = `${name}__${brand}`;
  const inCart = items.some((item) => item.key === cartKey);

  const handleAddToCart = () => {
    if (inCart) {
      navigation.navigate('Main', { screen: 'Cart' });
      return;
    }
    addToCart({ name, brand, price });
    Alert.alert('Added to Cart', `${name} has been added to your cart.`);
  };

  const brandName = brand.split('·')[0].trim();

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false}>
        <LinearGradient colors={gradientColors} style={styles.imageSection}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.navBtn} onPress={() => navigation?.goBack()}>
              <BackIcon />
            </TouchableOpacity>
            <TouchableOpacity style={styles.navBtn} onPress={() => setLiked(!liked)}>
              <HeartIcon filled={liked} />
            </TouchableOpacity>
          </View>
          <View style={styles.imagePlaceholder}>
            <SofaLargeIcon />
          </View>
        </LinearGradient>

        <View style={styles.content}>
          {/* Brand + Name */}
          <Text style={styles.retailer}>{brandName}</Text>
          <Text style={styles.name}>{name}</Text>

          {/* Rating + stock */}
          <View style={styles.ratingStockRow}>
            <View style={styles.ratingRow}>
              {[1, 2, 3, 4, 5].map((s) => (
                <StarIcon key={s} filled={s <= 4} />
              ))}
              <Text style={styles.ratingText}>4.0</Text>
              <Text style={styles.reviewCount}>(128 reviews)</Text>
            </View>
            <View style={styles.inStockBadge}>
              <View style={styles.inStockDot} />
              <Text style={styles.inStockText}>In Stock</Text>
            </View>
          </View>

          {/* Price + financing */}
          <View style={styles.priceRow}>
            <Text style={styles.price}>{price}</Text>
            <View style={styles.financingTag}>
              <Text style={styles.financingText}>or $108/mo</Text>
            </View>
          </View>

          {/* Description */}
          <Text style={styles.sectionTitle}>Description</Text>
          <Text style={styles.desc}>
            Premium quality {name.toLowerCase()} from {brandName}. Crafted with care using the finest materials for exceptional comfort and timeless style. Designed to seamlessly blend into modern and classic interiors alike — a statement piece that elevates any room.
          </Text>

          {/* Key Features */}
          <Text style={styles.sectionTitle}>Key Features</Text>
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
          <Text style={styles.sectionTitle}>Product Details</Text>
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
                  <Text style={styles.fromPostUser}>@{design.user}</Text>
                </View>
              </View>
            </View>
          )}

          <View style={{ height: 110 }} />
        </View>
      </ScrollView>

      <View style={styles.bottomBar}>
        <LinearGradient
          colors={['rgba(248,250,255,0)', '#F8FAFF']}
          style={styles.bottomBarFade}
          pointerEvents="none"
        />
        <TouchableOpacity
          style={[styles.addToCartBtn, inCart && styles.addToCartBtnInCart]}
          activeOpacity={0.85}
          onPress={handleAddToCart}
        >
          {inCart ? <CheckIcon /> : <CartIcon />}
          <Text style={styles.addToCartText}>
            {inCart ? 'View Cart' : `Add to Cart  -  ${price}`}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  imageSection: {
    height: height * 0.4,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: space['5xl'],
    paddingHorizontal: space.base,
  },
  navBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: shadow.medium.shadowColor,
    shadowOffset: shadow.medium.shadowOffset,
    shadowOpacity: shadow.medium.shadowOpacity,
    shadowRadius: shadow.medium.shadowRadius,
    elevation: shadow.medium.elevation,
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
  },
  retailer: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: colors.bluePrimary,
    marginBottom: space.xs,
  },
  name: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: colors.black,
    letterSpacing: letterSpacing.tight,
    lineHeight: fontSize.xl * 1.15,
  },
  // Rating + stock row
  ratingStockRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.sm,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  ratingText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#111',
    marginLeft: space.xs,
  },
  reviewCount: {
    fontSize: fontSize.sm,
    color: '#AAA',
    opacity: 0.44,
    marginLeft: space.xs,
  },
  inStockBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    backgroundColor: '#F0FDF4',
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  inStockDot: {
    width: 6,
    height: 6,
    borderRadius: radius.full,
    backgroundColor: '#22C55E',
  },
  inStockText: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: '#16A34A',
  },

  // Price
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginTop: space.base,
    marginBottom: space.xs,
  },
  price: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: colors.black,
    letterSpacing: letterSpacing.tight,
    fontVariant: ['tabular-nums'],
  },
  financingTag: {
    backgroundColor: 'rgba(34,197,94,0.08)',
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  financingText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: '#16A34A',
  },

  // Section titles — using section header style
  sectionTitle: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: colors.black,
    letterSpacing: letterSpacing.wider,
    textTransform: 'uppercase',
    opacity: 0.44,
    marginTop: space.xl,
    marginBottom: space.md,
  },

  desc: {
    fontSize: fontSize.base,
    color: '#666',
    opacity: 0.72,
    lineHeight: fontSize.base * 1.7,
  },

  // Key features
  featuresCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: space.base,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
    gap: space.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: space.sm,
  },
  featureCheck: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
    marginTop: 1,
  },
  featureText: {
    flex: 1,
    fontSize: fontSize.sm,
    color: '#444',
    lineHeight: fontSize.sm * 1.5,
    fontWeight: fontWeight.regular,
  },

  // Specs
  specsCard: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    paddingHorizontal: space.base,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
  },
  specRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  specLabel: {
    fontSize: fontSize.sm,
    color: '#555',
    fontWeight: fontWeight.medium,
    opacity: 0.72,
  },
  specValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: colors.black,
    maxWidth: '50%',
    textAlign: 'right',
  },

  // Shipping strip
  shippingStrip: {
    flexDirection: 'row',
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    padding: space.base,
    marginTop: space.base,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
  },
  shippingItem: {
    flex: 1,
    alignItems: 'center',
    gap: space.xs,
  },
  shippingDivider: {
    width: 1,
    backgroundColor: '#F0F0F0',
    marginVertical: 4,
  },
  shippingEmoji: { fontSize: 18 },
  shippingLabel: { fontSize: fontSize.xs, fontWeight: fontWeight.bold, color: '#111', textAlign: 'center' },
  shippingDesc: { fontSize: fontSize.xs, color: '#AAA', opacity: 0.44, textAlign: 'center', fontWeight: fontWeight.regular },
  fromPost: {
    marginTop: space.lg,
    backgroundColor: '#F1F5F9',
    borderRadius: radius.md,
    padding: space.md,
  },
  fromPostLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#A0A0A8',
    letterSpacing: letterSpacing.wider,
    textTransform: 'uppercase',
    opacity: 0.44,
    marginBottom: space.sm,
  },
  fromPostRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  fromPostAvatar: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: colors.bluePrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fromPostAvatarText: {
    color: '#fff',
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
  },
  fromPostTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#111',
  },
  fromPostUser: {
    fontSize: fontSize.xs,
    color: '#A0A0A8',
    opacity: 0.44,
  },
  // PDP sticky bottom bar
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.lg,
    paddingBottom: 34,
    paddingTop: space.md,
    backgroundColor: '#F8FAFF',
  },
  bottomBarFade: {
    position: 'absolute',
    top: -24,
    left: 0,
    right: 0,
    height: 24,
    pointerEvents: 'none',
  },
  addToCartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bluePrimary,
    borderRadius: radius.md,
    height: space['5xl'],
    gap: space.sm,
    shadowColor: shadow.medium.shadowColor,
    shadowOffset: shadow.medium.shadowOffset,
    shadowOpacity: shadow.medium.shadowOpacity,
    shadowRadius: shadow.medium.shadowRadius,
    elevation: shadow.medium.elevation,
  },
  addToCartBtnInCart: {
    backgroundColor: '#34C759',
  },
  addToCartText: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
});
