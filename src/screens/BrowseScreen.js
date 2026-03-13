import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import CardImage from '../components/CardImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Polyline, Circle } from 'react-native-svg';
import { space, radius, shadow, typeScale, fontWeight, letterSpacing, fontSize, palette } from '../constants/tokens';
import { colors as C } from '../constants/theme';
import SectionHeader from '../components/ds/SectionHeader';
import Badge from '../components/ds/Badge';
import { DESIGNS } from '../data/designs';
import { searchProducts, getSourceColor } from '../services/affiliateProducts';

const { width } = Dimensions.get('window');
const CARD_GAP = 8;
const CARD_W = (width - space.lg * 2 - CARD_GAP) / 2;
const HERO_H = 230;

// Room hero images — premium photography
const ROOM_HEROES = {
  'living-room': 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=900&q=85',
  'bedroom':     'https://images.unsplash.com/photo-1616594039964-ae9021a400a0?w=900&q=85',
  'kitchen':     'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&q=85',
  'dining-room': 'https://images.unsplash.com/photo-1615874959474-d609969a20ed?w=900&q=85',
  'office':      'https://images.unsplash.com/photo-1593642632559-0c6d3fc62b89?w=900&q=85',
  'outdoor':     'https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?w=900&q=85',
  'bathroom':    'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=900&q=85',
  'entryway':    'https://images.unsplash.com/photo-1583847268964-b28dc8f51f92?w=900&q=85',
  'kids-room':   'https://images.unsplash.com/photo-1519643381401-22c77e60520e?w=900&q=85',
  'nursery':     'https://images.unsplash.com/photo-1555252333-9f8e92e65df9?w=900&q=85',
};

// Style hero images
const STYLE_HEROES = {
  japandi:      'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=900&q=85',
  scandi:       'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=85',
  'mid-century':'https://images.unsplash.com/photo-1618221195710-2d01d1e0a0a0?w=900&q=85',
  'dark-luxe':  'https://images.unsplash.com/photo-1522771739844-ee4e8089f9e0?w=900&q=85',
  bohemian:     'https://images.unsplash.com/photo-1632119580908-ae947d4c7691?w=900&q=85',
  minimalist:   'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=900&q=85',
  luxury:       'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=900&q=85',
  farmhouse:    'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&q=85',
  coastal:      'https://images.unsplash.com/photo-1679862342541-e408d4f3ab80?w=900&q=85',
  industrial:   'https://images.unsplash.com/photo-1638541420159-cadd0634f08f?w=900&q=85',
  rustic:       'https://images.unsplash.com/photo-1628744876497-eb30460be9f6?w=900&q=85',
};

const STYLE_LABEL_MAP = {
  minimalist: 'Minimalist', scandi: 'Scandi', bohemian: 'Boho',
  luxury: 'Luxury', japandi: 'Japandi', 'mid-century': 'Mid-Century',
  'dark-luxe': 'Dark Luxe', farmhouse: 'Farmhouse', biophilic: 'Biophilic',
  glam: 'Glam', rustic: 'Rustic', coastal: 'Coastal', retro: 'Retro',
  'wabi-sabi': 'Wabi-Sabi', industrial: 'Industrial',
};

function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.textPrimary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5" />
      <Polyline points="12 19 5 12 12 5" />
    </Svg>
  );
}

function StarIcon({ size = 11, color = '#F59E0B' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function BrowseScreen({ navigation, route }) {
  const {
    mode = 'designs',
    title = 'Browse',
    subtitle,
    roomType,
    style,
    collection,
    heroImage,
    designs: passedDesigns,
    products: passedProducts,
  } = route.params || {};

  // ── Derive hero image ──────────────────────────────────────────────────────
  const resolvedHero = useMemo(() => {
    if (heroImage) return heroImage;
    if (mode === 'room' && roomType) return ROOM_HEROES[roomType] || null;
    if (mode === 'style' && style) return STYLE_HEROES[style] || null;
    if (mode === 'collection' && collection?.imageUrl) return collection.imageUrl;
    return null;
  }, [mode, roomType, style, collection, heroImage]);

  // ── Derive designs ────────────────────────────────────────────────────────
  const designs = useMemo(() => {
    if (passedDesigns) return passedDesigns;
    if (mode === 'designs') return [...DESIGNS].sort((a, b) => b.likes - a.likes);
    if (mode === 'room' && roomType) {
      return DESIGNS.filter(d => d.roomType === roomType || d.roomType === roomType.replace('-room', ''));
    }
    if (mode === 'style' && style) {
      return DESIGNS.filter(d => d.styles?.includes(style));
    }
    if (mode === 'collection' && collection?.styles) {
      return DESIGNS.filter(d => d.styles?.some(s => collection.styles.includes(s)));
    }
    if (mode === 'products') return [];
    return DESIGNS;
  }, [mode, roomType, style, collection, passedDesigns]);

  // ── Derive products ───────────────────────────────────────────────────────
  const products = useMemo(() => {
    if (passedProducts) return passedProducts;
    if (mode === 'designs') return [];
    if (mode === 'room' && roomType) {
      return searchProducts({ roomType, limit: 16 });
    }
    if (mode === 'style' && style) {
      return searchProducts({ style, limit: 16 });
    }
    if (mode === 'collection' && collection?.styles) {
      return searchProducts({ style: collection.styles[0], limit: 16 });
    }
    if (mode === 'products') {
      return passedProducts || searchProducts({ keywords: 'furniture home decor', limit: 20 });
    }
    return [];
  }, [mode, roomType, style, collection, passedProducts]);

  // ── Render hero subtitle ──────────────────────────────────────────────────
  const heroSub = subtitle ||
    (mode === 'room' ? `${designs.length} spaces · ${products.length} products` :
     mode === 'style' ? `${designs.length} spaces · ${products.length} products` :
     mode === 'collection' ? collection?.subtitle || `${designs.length} rooms` :
     mode === 'designs' ? `${designs.length} spaces` :
     mode === 'products' ? `${products.length} products` : '');

  return (
    <View style={styles.root}>
      {/* ── Sticky header ─────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <BackIcon />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          </View>
          <View style={styles.backBtn} pointerEvents="none" />
        </View>
      </SafeAreaView>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* ── Hero banner ───────────────────────────────────────────── */}
        {resolvedHero ? (
          <View style={styles.hero}>
            <CardImage uri={resolvedHero} style={styles.heroImage} />
            <LinearGradient
              colors={['rgba(0,0,0,0.08)', 'rgba(0,0,0,0.55)']}
              locations={[0.3, 1]}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.heroContent}>
              <Text style={styles.heroTitle}>{title}</Text>
              {heroSub ? <Text style={styles.heroSub}>{heroSub}</Text> : null}
            </View>
          </View>
        ) : (
          /* Minimal gradient banner when no image */
          <LinearGradient
            colors={[palette.heroStart, palette.heroEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.heroBannerFlat}
          >
            <Text style={styles.heroTitle}>{title}</Text>
            {heroSub ? <Text style={styles.heroSub}>{heroSub}</Text> : null}
          </LinearGradient>
        )}

        {/* ── Designs section ───────────────────────────────────────── */}
        {designs.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              noTopMargin
              title={mode === 'products' ? 'SPACES' : 'SPACES'}
            />
            <View style={styles.grid}>
              {designs.map((design, i) => (
                <TouchableOpacity
                  key={design.id || i}
                  style={styles.designCard}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('ShopTheLook', { design })}
                >
                  <CardImage uri={design.imageUrl} style={styles.designCardImg} placeholderColor="#D0D7E3" />
                  <LinearGradient
                    colors={['rgba(0,0,0,0.04)', 'transparent', 'rgba(0,0,0,0.70)']}
                    locations={[0, 0.35, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                  {design.styles?.[0] && (
                    <Badge
                      variant="outline"
                      label={STYLE_LABEL_MAP[design.styles[0]] || design.styles[0]}
                      style={styles.cardStyleBadge}
                    />
                  )}
                  <View style={styles.designCardFooter}>
                    <Text style={styles.designCardTitle} numberOfLines={2}>
                      {design.title?.replace('...', '')}
                    </Text>
                    <Text style={styles.designCardLikes}>♥ {design.likes}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Products section ──────────────────────────────────────── */}
        {products.length > 0 && (
          <View style={[styles.section, designs.length > 0 && styles.sectionAlt]}>
            <SectionHeader noTopMargin title="PRODUCTS" />
            <Text style={styles.affiliateNote}>We may earn a commission when you buy through links on this app.</Text>
            <View style={styles.grid}>
              {products.map((product, i) => (
                <TouchableOpacity
                  key={product.id || i}
                  style={styles.productCard}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('ProductDetail', { product })}
                >
                  {/* Image container — gradient and badge scoped inside */}
                  <View style={styles.productCardImgWrap}>
                    <CardImage uri={product.imageUrl} style={styles.productCardImg} placeholderColor="#E8EDF5" />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.55)']}
                      locations={[0.5, 1]}
                      style={StyleSheet.absoluteFill}
                    />
                    <Badge
                      variant="source"
                      label={product.source === 'amazon' ? 'Amazon' : (product.source || 'Shop')}
                      color={getSourceColor(product.source)}
                      style={styles.sourceBadgePos}
                    />
                  </View>
                  <View style={styles.productCardFooter}>
                    <Text style={styles.productCardName} numberOfLines={2}>{product.name}</Text>
                    <View style={styles.productCardBottom}>
                      <Text style={styles.productCardPrice}>
                        {typeof product.priceValue === 'number'
                          ? `$${product.priceValue.toLocaleString()}`
                          : product.price}
                      </Text>
                      <View style={styles.shopNowPill}>
                        <Text style={styles.shopNowText}>Shop Now</Text>
                      </View>
                    </View>
                    {product.rating && (
                      <View style={styles.ratingRow}>
                        <StarIcon />
                        <Text style={styles.ratingText}>
                          {product.rating} {product.reviewCount ? `(${product.reviewCount.toLocaleString()})` : ''}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Empty state ───────────────────────────────────────────── */}
        {designs.length === 0 && products.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Coming Soon</Text>
            <Text style={styles.emptyText}>We're adding more spaces and products for {title}. Check back soon!</Text>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerSafe: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.base,
    paddingVertical: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: space.sm,
  },
  headerTitle: {
    ...typeScale.title,
    color: C.textPrimary,
    letterSpacing: letterSpacing.tight,
  },

  scrollContent: {
    flexGrow: 1,
  },

  // ── Hero ──────────────────────────────────────────────────────────────────
  hero: {
    width: '100%',
    height: HERO_H,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroBannerFlat: {
    height: 120,
    justifyContent: 'flex-end',
    paddingHorizontal: space.lg,
    paddingBottom: space.xl,
  },
  heroContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: space.lg,
    paddingBottom: space.xl,
  },
  heroTitle: {
    fontSize: 28,
    fontWeight: fontWeight.xbold,
    color: '#FFFFFF',
    letterSpacing: letterSpacing.tight,
    marginBottom: 4,
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  heroSub: {
    ...typeScale.caption,
    color: 'rgba(255,255,255,0.78)',
  },

  // ── Sections ──────────────────────────────────────────────────────────────
  section: {
    backgroundColor: '#FFFFFF',
    paddingTop: space.lg,
    paddingBottom: space.xl,
  },
  sectionAlt: {
    backgroundColor: '#F8F9FA',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  affiliateNote: {
    ...typeScale.caption,
    color: C.textTertiary,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
    marginTop: -4,
  },

  // ── 2-column grid ─────────────────────────────────────────────────────────
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: space.lg,
    gap: CARD_GAP,
  },

  // ── Design cards ──────────────────────────────────────────────────────────
  designCard: {
    width: CARD_W,
    height: CARD_W * 1.15,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  designCardImg: {
    width: '100%',
    height: '100%',
  },
  cardStyleBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  designCardFooter: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 10,
  },
  designCardTitle: {
    ...typeScale.headline,
    color: '#FFFFFF',
    letterSpacing: letterSpacing.tight,
    marginBottom: 2,
  },
  designCardLikes: {
    ...typeScale.caption,
    color: 'rgba(255,255,255,0.68)',
  },

  // ── Product cards ─────────────────────────────────────────────────────────
  productCard: {
    width: CARD_W,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: C.surface,
  },
  productCardImgWrap: {
    width: '100%',
    height: CARD_W * 0.9,
    position: 'relative',
    overflow: 'hidden',
  },
  productCardImg: {
    width: '100%',
    height: '100%',
  },
  sourceBadgePos: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  productCardFooter: {
    padding: 10,
    gap: 4,
    backgroundColor: '#FFFFFF',
  },
  productCardName: {
    ...typeScale.body,
    fontWeight: '600',
    color: C.textPrimary,
    lineHeight: 18,
  },
  productCardBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  productCardPrice: {
    ...typeScale.price,
    color: C.textPrimary,
  },
  shopNowPill: {
    backgroundColor: C.primary,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.button,
  },
  shopNowText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 1,
  },
  ratingText: {
    fontSize: 10,
    color: C.textTertiary,
    fontWeight: '500',
  },

  // ── Empty state ───────────────────────────────────────────────────────────
  emptyState: {
    alignItems: 'center',
    paddingVertical: 64,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    ...typeScale.title,
    color: C.textPrimary,
    marginBottom: 8,
  },
  emptyText: {
    ...typeScale.body,
    color: C.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },

  bottomSpacer: {
    height: 40,
  },
});
