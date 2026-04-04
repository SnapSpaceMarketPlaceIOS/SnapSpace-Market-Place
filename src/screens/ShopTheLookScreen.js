/**
 * ShopTheLookScreen — Full-page view of a design post with shoppable products.
 *
 * Layout mirrors the Explore post detail exactly:
 *   Image → divider → User row + Follow → divider → Title + Description
 *   → divider → SHOP ROOM horizontal cards → FTC → Tags
 *   → sticky Add All to Cart bottom bar
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import CardImage from '../components/CardImage';
import AutoImage from '../components/AutoImage';
import Svg, { Path, Circle, Polyline, Line } from 'react-native-svg';
import { colors } from '../constants/colors';
import { colors as C } from '../constants/theme';
import { space, radius, shadow, typeScale, letterSpacing } from '../constants/tokens';
import { useCart } from '../context/CartContext';
import { getProductsForDesign } from '../services/affiliateProducts';

const { width } = Dimensions.get('window');
const IMG_RADIUS = Math.round((width - space.lg * 2) * 0.025);

// ── Icons ──────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function CartNavIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={9} cy={21} r={1} />
      <Circle cx={20} cy={21} r={1} />
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Svg>
  );
}

function PlusSmallIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round">
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

function CartWhiteIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={9} cy={21} r={1} />
      <Circle cx={20} cy={21} r={1} />
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Svg>
  );
}

function StarIconSmall({ filled = true, size = 10 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? '#67ACE9' : '#E5E7EB'} stroke={filled ? '#67ACE9' : '#D1D5DB'} strokeWidth={1}>
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  );
}

// ── Horizontal Product Card ────────────────────────────────────────────────────

function ProductCard({ product, inCart, onAddToCart, onPress }) {
  const priceVal = product.priceValue ?? product.price;
  const priceStr = typeof priceVal === 'number'
    ? `$${priceVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : product.priceLabel || String(priceVal).replace(/^\$+/, '$');
  const ratingVal = typeof product.rating === 'number' ? product.rating : parseFloat(product.rating) || 0;

  return (
    <TouchableOpacity style={s.hCard} activeOpacity={0.7} onPress={onPress}>
      <CardImage uri={product.imageUrl} style={s.hCardImg} resizeMode="cover" placeholderColor="#D0D7E3" />
      <View style={s.hCardBody}>
        <Text style={s.hCardName} numberOfLines={2}>{product.name}</Text>
        <Text style={s.hCardBrand} numberOfLines={1}>{product.brand}</Text>
        {ratingVal > 0 && (
          <View style={s.hCardRating}>
            {[1,2,3,4,5].map(i => (
              <StarIconSmall key={i} size={10} filled={i <= Math.round(ratingVal)} />
            ))}
            <Text style={s.hCardRatingText}>{ratingVal.toFixed(1)}</Text>
            {!!product.reviewCount && (
              <Text style={s.hCardReviews}>({product.reviewCount.toLocaleString()})</Text>
            )}
          </View>
        )}
        <Text style={s.hCardPrice}>{priceStr}</Text>
      </View>
      <TouchableOpacity
        style={[s.hCardAddBtn, inCart && s.hCardAddBtnDone]}
        activeOpacity={0.8}
        onPress={() => !inCart && onAddToCart(product)}
      >
        {inCart
          ? <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <Polyline points="20 6 9 17 4 12" />
            </Svg>
          : <PlusSmallIcon />
        }
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function ShopTheLookScreen({ route, navigation }) {
  const { design } = route.params;
  const { addToCart, items } = useCart();
  const [addedKeys, setAddedKeys] = useState({});
  const [products, setProducts] = useState(design.products || []);

  useEffect(() => {
    // Only re-match if no persisted products were saved with this design
    if (design.products && design.products.length > 0) return;
    const matched = getProductsForDesign(design, 6);
    if (matched.length > 0) setProducts(matched);
  }, [design]);

  const isInCart = (product) => {
    const key = `${product.name}__${product.brand}`;
    return addedKeys[key] || items.some((item) => item.key === key);
  };

  const handleAddToCart = (product) => {
    const key = `${product.name}__${product.brand}`;
    addToCart({ ...product, price: product.priceValue ?? product.price });
    setAddedKeys((prev) => ({ ...prev, [key]: true }));
  };

  const handleAddAll = () => {
    let added = 0;
    products.forEach((p) => {
      if (!isInCart(p)) { handleAddToCart(p); added++; }
    });
    if (added > 0) {
      Alert.alert('Added to Cart', `${added} item${added > 1 ? 's' : ''} added to your cart.`);
    } else {
      Alert.alert('Already in Cart', 'All products are already in your cart.');
    }
  };

  const allInCart = products.every((p) => isInCart(p));

  const totalPrice = products.reduce((sum, p) => {
    const num = typeof (p.priceValue ?? p.price) === 'number'
      ? (p.priceValue ?? p.price)
      : parseFloat(String(p.price).replace(/[^0-9.]/g, '')) || 0;
    return sum + num;
  }, 0);

  const displayTitle = (design.title || design.prompt || 'My Space').replace('...', '');
  const displayDesc  = design.description || design.prompt || '';
  const displayUser  = design.user || 'you';
  const displayInitial = design.initial || displayUser.charAt(0).toUpperCase();

  return (
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>

        {/* ── Header ───────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()}>
            <BackIcon />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Shop The Look</Text>
          <TouchableOpacity style={s.headerBtn} onPress={() => navigation.navigate('Main', { screen: 'Cart' })}>
            <CartNavIcon />
          </TouchableOpacity>
        </View>

        {/* ── Image (natural aspect ratio — no cropping) ── */}
        <View style={s.imageWrap}>
          <AutoImage uri={design.imageUrl} borderRadius={IMG_RADIUS} />
        </View>

        {/* ── User row + Follow ────────────────────────────────────── */}
        <TouchableOpacity
          style={s.userRow}
          activeOpacity={0.75}
          onPress={() => navigation?.navigate('UserProfile', { username: displayUser })}
        >
          <View style={s.avatar}>
            <Text style={s.avatarText}>{displayInitial}</Text>
          </View>
          <View style={s.userInfo}>
            <Text style={s.username} numberOfLines={1}>@{displayUser}</Text>
            <Text style={s.userSub}>Tap to view profile</Text>
          </View>
          <TouchableOpacity style={s.followBtn} activeOpacity={0.8}>
            <Text style={s.followBtnText}>Follow</Text>
          </TouchableOpacity>
        </TouchableOpacity>

        {/* ── Prompt label + text ──────────────────────────────────── */}
        <Text style={s.promptLabel}>Your Prompt</Text>
        <Text style={s.promptBody}>{displayTitle}</Text>
        {!!displayDesc && displayDesc !== displayTitle && (
          <Text style={s.desc} numberOfLines={3}>{displayDesc}</Text>
        )}

        {/* ── Divider before SHOP ROOM ─────────────────────────────── */}
        <View style={s.divider} />

        {/* ── SHOP ROOM — horizontal cards ─────────────────────────── */}
        {products.length > 0 && (
          <View style={s.productsSection}>
            <Text style={s.sectionLabel}>SHOP ROOM</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.hList}
            >
              {products.map((product, index) => (
                <ProductCard
                  key={product.id || index}
                  product={product}
                  inCart={isInCart(product)}
                  onAddToCart={handleAddToCart}
                  onPress={() => navigation.navigate('ProductDetail', { product, design })}
                />
              ))}
            </ScrollView>

            {/* FTC Disclosure */}
            <Text style={s.ftc}>We may earn a commission when you buy through links on this app.</Text>
          </View>
        )}

        {/* ── Tags ─────────────────────────────────────────────────── */}
        {design.tags && design.tags.length > 0 && (
          <View style={s.tagsSection}>
            <Text style={s.sectionLabel}>TAGS</Text>
            <View style={s.tagsWrap}>
              {design.tags.map((tag) => (
                <View
                  key={tag}
                  style={[s.tag, (tag === '#AIGenerated' || tag === '#ShopTheLook') && s.tagHighlight]}
                >
                  <Text style={[s.tagText, (tag === '#AIGenerated' || tag === '#ShopTheLook') && s.tagTextHighlight]}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Sticky Bottom Bar ──────────────────────────────────────── */}
      <View style={s.bottomBar}>
        <View style={s.bottomInfo}>
          <Text style={s.bottomLabel}>{products.length} item{products.length !== 1 ? 's' : ''}</Text>
          <Text style={s.bottomTotal}>
            Total: {totalPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })}
          </Text>
        </View>
        <TouchableOpacity
          style={[s.addAllBtn, allInCart && s.addAllBtnDone]}
          activeOpacity={0.85}
          onPress={handleAddAll}
        >
          {!allInCart && <CartWhiteIcon />}
          <Text style={s.addAllBtnText}>{allInCart ? '✓ All Added' : 'Add All to Cart'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  scrollContent: { paddingTop: space['5xl'], paddingBottom: space['2xl'] },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    marginBottom: space.lg,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: C.textPrimary,
    letterSpacing: letterSpacing.tight,
  },

  // ── Image (padded, rounded — matches Explore) ──
  imageWrap: {
    paddingHorizontal: space.lg,
    marginBottom: space.base,
  },
  image: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: IMG_RADIUS,
    overflow: 'hidden',
    backgroundColor: C.surface,
  },

  // ── User row ──
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: space.lg,
    paddingTop: space.base,
    paddingBottom: space.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: space.base,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typeScale.caption,
    color: '#fff',
    fontWeight: '700',
  },
  userInfo: { flex: 1 },
  username: {
    ...typeScale.headline,
    color: C.textPrimary,
  },
  userSub: {
    ...typeScale.caption,
    color: C.textSecondary,
    marginTop: 2,
  },
  followBtn: {
    backgroundColor: C.primary,
    borderRadius: radius.full,
    height: 36,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtnText: {
    ...typeScale.button,
    color: '#fff',
  },

  // ── Title + Description ──
  promptLabel: {
    ...typeScale.subheadline,
    color: C.textTertiary,
    marginHorizontal: space.lg,
    marginBottom: 4,
    marginTop: 4,
  },
  promptBody: {
    ...typeScale.headline,
    color: C.textPrimary,
    marginHorizontal: space.lg,
    marginBottom: 6,
  },
  desc: {
    ...typeScale.body,
    color: C.textSecondary,
    marginHorizontal: space.lg,
    marginBottom: space.base,
  },

  // ── Divider ──
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: space.lg,
    marginBottom: space.base,
  },

  // ── SHOP ROOM section ──
  productsSection: {
    paddingLeft: space.lg,
  },
  sectionLabel: {
    ...typeScale.subheadline,
    color: C.textTertiary,
    marginBottom: space.md,
  },
  hList: {
    gap: 10,
    paddingRight: space.lg,
    paddingBottom: 4,
  },
  ftc: {
    fontSize: 11,
    fontStyle: 'italic',
    color: C.textTertiary,
    textAlign: 'center',
    marginTop: space.base,
    marginBottom: space.sm,
    paddingRight: space.lg,
  },

  // ── Tags ──
  tagsSection: {
    paddingHorizontal: space.lg,
    marginTop: space.lg,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: C.surface2,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  tagHighlight: {
    backgroundColor: C.primaryLight,
  },
  tagText: {
    ...typeScale.caption,
    color: C.textSecondary,
  },
  tagTextHighlight: {
    color: C.primary,
  },

  // ── Horizontal product cards ──
  hCard: {
    width: 170,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  hCardImg: {
    width: '100%',
    height: 150,
    backgroundColor: '#F3F4F6',
  },
  hCardBody: {
    padding: 10,
    paddingBottom: 38,
    gap: 2,
  },
  hCardName: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textPrimary,
    lineHeight: 17,
  },
  hCardBrand: {
    fontSize: 11,
    fontWeight: '400',
    color: C.textTertiary,
    marginTop: 1,
  },
  hCardRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    marginTop: 3,
  },
  hCardRatingText: {
    fontSize: 10,
    fontWeight: '600',
    color: C.textPrimary,
    marginLeft: 2,
  },
  hCardReviews: {
    fontSize: 10,
    color: C.textSecondary,
  },
  hCardPrice: {
    fontSize: 14,
    fontWeight: '700',
    color: C.primary,
    marginTop: 4,
  },
  hCardAddBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hCardAddBtnDone: {
    backgroundColor: '#67ACE9',
  },

  // ── Bottom bar ──
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: 34,
    paddingTop: space.md,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 4,
  },
  bottomInfo: { flex: 1 },
  bottomLabel: {
    ...typeScale.caption,
    fontWeight: '500',
    color: C.textTertiary,
  },
  bottomTotal: {
    ...typeScale.title,
    color: C.textPrimary,
    letterSpacing: letterSpacing.tight,
    marginTop: 2,
  },
  addAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.primary,
    borderRadius: radius.button,
    height: 52,
    paddingHorizontal: space.lg,
    gap: space.sm,
    ...shadow.medium,
  },
  addAllBtnDone: {
    backgroundColor: '#67ACE9',
  },
  addAllBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },
});
