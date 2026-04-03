import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import CardImage from '../components/CardImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';
import { space, radius, shadow, typeScale, fontWeight, letterSpacing, palette } from '../constants/tokens';
import { colors as C } from '../constants/theme';
import { colors } from '../constants/colors';
import SectionHeader from '../components/ds/SectionHeader';
import Badge from '../components/ds/Badge';
import { DESIGNS } from '../data/designs';
import { searchProducts, getSourceColor } from '../services/affiliateProducts';

const { width } = Dimensions.get('window');
const CARD_GAP = 12;
const CARD_W = (width - space.lg * 2 - CARD_GAP) / 2;
const HERO_H = 240;
const PHOTO_H = Math.round(CARD_W * 1.1); // photo portion of design card

// ── Room hero images ──────────────────────────────────────────────────────────
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

// ── Style hero images ─────────────────────────────────────────────────────────
const STYLE_HEROES = {
  japandi:       'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=900&q=85',
  scandi:        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=900&q=85',
  'mid-century': 'https://images.unsplash.com/photo-1618221195710-2d01d1e0a0a0?w=900&q=85',
  'dark-luxe':   'https://images.unsplash.com/photo-1522771739844-ee4e8089f9e0?w=900&q=85',
  bohemian:      'https://images.unsplash.com/photo-1632119580908-ae947d4c7691?w=900&q=85',
  minimalist:    'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=900&q=85',
  luxury:        'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=900&q=85',
  farmhouse:     'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&q=85',
  coastal:       'https://images.unsplash.com/photo-1679862342541-e408d4f3ab80?w=900&q=85',
  industrial:    'https://images.unsplash.com/photo-1638541420159-cadd0634f08f?w=900&q=85',
  rustic:        'https://images.unsplash.com/photo-1628744876497-eb30460be9f6?w=900&q=85',
};

const STYLE_LABEL_MAP = {
  minimalist: 'MINIMALIST', scandi: 'SCANDI', bohemian: 'BOHO',
  luxury: 'LUXURY', japandi: 'JAPANDI', 'mid-century': 'MID-CENTURY',
  'dark-luxe': 'DARK LUXE', farmhouse: 'FARMHOUSE', biophilic: 'BIOPHILIC',
  glam: 'GLAM', rustic: 'RUSTIC', coastal: 'COASTAL', retro: 'RETRO',
  'wabi-sabi': 'WABI-SABI', industrial: 'INDUSTRIAL',
};

// ── Icons ─────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF"
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5" />
      <Polyline points="12 19 5 12 12 5" />
    </Svg>
  );
}

function StarIcon({ size = 11 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24"
      fill="#67ACE9" stroke="#67ACE9" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function BrowseScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();

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

  // ── Resolve hero image ────────────────────────────────────────────────────
  const resolvedHero = useMemo(() => {
    if (heroImage) return heroImage;
    if (mode === 'room' && roomType) return ROOM_HEROES[roomType] || null;
    if (mode === 'style' && style) return STYLE_HEROES[style] || null;
    if (mode === 'collection' && collection?.imageUrl) return collection.imageUrl;
    return null;
  }, [mode, roomType, style, collection, heroImage]);

  // ── Resolve designs ───────────────────────────────────────────────────────
  const designs = useMemo(() => {
    if (passedDesigns) return passedDesigns;
    if (mode === 'designs') return [...DESIGNS].sort((a, b) => b.likes - a.likes);
    if (mode === 'room' && roomType)
      return DESIGNS.filter(d => d.roomType === roomType || d.roomType === roomType.replace('-room', ''));
    if (mode === 'style' && style)
      return DESIGNS.filter(d => d.styles?.includes(style));
    if (mode === 'collection' && collection?.styles)
      return DESIGNS.filter(d => d.styles?.some(s => collection.styles.includes(s)));
    if (mode === 'products') return [];
    return DESIGNS;
  }, [mode, roomType, style, collection, passedDesigns]);

  // ── Resolve products ──────────────────────────────────────────────────────
  const products = useMemo(() => {
    if (passedProducts) return passedProducts;
    if (mode === 'designs') return [];
    if (mode === 'room' && roomType) return searchProducts({ roomType, limit: 16 });
    if (mode === 'style' && style) return searchProducts({ style, limit: 16 });
    if (mode === 'collection' && collection?.styles)
      return searchProducts({ style: collection.styles[0], limit: 16 });
    if (mode === 'products')
      return passedProducts || searchProducts({ keywords: 'furniture home decor', limit: 20 });
    return [];
  }, [mode, roomType, style, collection, passedProducts]);

  // ── Hero subtitle ─────────────────────────────────────────────────────────
  const heroSub = subtitle ||
    (mode === 'room'       ? `${designs.length} spaces · ${products.length} products` :
     mode === 'style'      ? `${designs.length} spaces · ${products.length} products` :
     mode === 'collection' ? collection?.subtitle || `${designs.length} rooms` :
     mode === 'designs'    ? `${designs.length} spaces` :
     mode === 'products'   ? `${products.length} products` : '');

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* ── Hero image — full bleed, no text overlay ───────────────── */}
        <View style={styles.heroWrap}>
          {resolvedHero ? (
            <CardImage uri={resolvedHero} style={styles.heroImage} resizeMode="cover" />
          ) : (
            // Fallback gradient when no image exists
            <View style={[styles.heroImage, styles.heroFallback]} />
          )}

          {/* Floating back button — glass pill over photo */}
          <TouchableOpacity
            style={[styles.floatingBack, { top: insets.top + 12 }]}
            onPress={() => navigation.goBack()}
            activeOpacity={0.8}
          >
            <BackIcon />
          </TouchableOpacity>
        </View>

        {/* ── Title block — below the hero photo, on white ──────────── */}
        <View style={styles.titleBlock}>
          <Text style={styles.pageTitle}>{title}</Text>
          {!!heroSub && <Text style={styles.pageSub}>{heroSub}</Text>}
        </View>

        {/* ── Designs (SPACES) section ───────────────────────────────── */}
        {designs.length > 0 && (
          <View style={styles.section}>
            <SectionHeader noTopMargin title="SPACES" />
            <View style={styles.grid}>
              {designs.map((design, i) => (
                <TouchableOpacity
                  key={design.id || i}
                  style={styles.designCard}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('ShopTheLook', { design })}
                >
                  {/* Photo — clean, no overlay */}
                  <View style={styles.designPhotoWrap}>
                    <CardImage
                      uri={design.imageUrl}
                      style={styles.designPhoto}
                      resizeMode="cover"
                      placeholderColor="#D0D7E3"
                    />
                  </View>

                  {/* Content below photo */}
                  <View style={styles.designCardBody}>
                    <Text style={styles.designCardTitle} numberOfLines={2}>
                      {design.title?.replace('...', '')}
                    </Text>
                    {design.styles?.[0] && (
                      <Badge
                        variant="source"
                        label={STYLE_LABEL_MAP[design.styles[0]] || design.styles[0].toUpperCase()}
                        color={colors.bluePrimary}
                        style={styles.designBadge}
                      />
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Products section ───────────────────────────────────────── */}
        {products.length > 0 && (
          <View style={[styles.section, designs.length > 0 && styles.sectionAlt]}>
            <SectionHeader noTopMargin title="PRODUCTS" />
            <Text style={styles.affiliateNote}>
              We may earn a commission when you buy through links on this app.
            </Text>
            <View style={styles.grid}>
              {products.map((product, i) => (
                <TouchableOpacity
                  key={product.id || i}
                  style={styles.productCard}
                  activeOpacity={0.85}
                  onPress={() => navigation.navigate('ProductDetail', { product })}
                >
                  {/* Photo with source badge — no gradient */}
                  <View style={styles.productPhotoWrap}>
                    <CardImage
                      uri={product.imageUrl}
                      style={styles.productPhoto}
                      resizeMode="cover"
                      placeholderColor="#E8EDF5"
                    />
                    <Badge
                      variant="source"
                      label={product.source === 'amazon' ? 'Amazon' : (product.source || 'Shop')}
                      color={getSourceColor(product.source)}
                      style={styles.sourceBadge}
                    />
                  </View>

                  {/* Content below photo */}
                  <View style={styles.productCardBody}>
                    <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
                    <Text style={styles.productPrice}>
                      {typeof product.price === 'number'
                        ? `$${product.price.toLocaleString()}`
                        : product.price}
                    </Text>
                    {!!product.rating && (
                      <View style={styles.ratingRow}>
                        <StarIcon />
                        <Text style={styles.ratingText}>
                          {product.rating}
                          {product.reviewCount ? ` (${product.reviewCount.toLocaleString()})` : ''}
                        </Text>
                      </View>
                    )}
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* ── Empty state ────────────────────────────────────────────── */}
        {designs.length === 0 && products.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyTitle}>Coming Soon</Text>
            <Text style={styles.emptyText}>
              We're adding more spaces and products for {title}. Check back soon!
            </Text>
          </View>
        )}

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
  },

  // ── Hero — full bleed photo, back button floated over it ──────────────────
  heroWrap: {
    width: '100%',
    height: HERO_H,
    overflow: 'hidden',
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },
  heroFallback: {
    backgroundColor: colors.bluePrimary,
  },
  floatingBack: {
    position: 'absolute',
    left: space.lg,
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Title block — white area below hero ───────────────────────────────────
  titleBlock: {
    paddingHorizontal: space.lg,
    paddingTop: space.base,
    paddingBottom: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  pageTitle: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.bluePrimary,
    letterSpacing: letterSpacing.tight,
    marginBottom: 4,
  },
  pageSub: {
    ...typeScale.caption,
    color: '#6B7280',
  },

  // ── Sections ──────────────────────────────────────────────────────────────
  section: {
    paddingTop: space.lg,
    paddingBottom: space.xl,
    backgroundColor: '#FFFFFF',
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
    fontStyle: 'italic',
  },

  // ── 2-column grid ─────────────────────────────────────────────────────────
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: space.lg,
    gap: CARD_GAP,
  },

  // ── Design cards — photo top, content below ───────────────────────────────
  designCard: {
    width: CARD_W,
    borderRadius: Math.round(CARD_W * 0.05),
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
  },
  designPhotoWrap: {
    width: '100%',
    height: PHOTO_H,
    overflow: 'hidden',
  },
  designPhoto: {
    width: '100%',
    height: '100%',
  },
  designCardBody: {
    padding: space.md,
    gap: 4,
    backgroundColor: '#FFFFFF',
  },
  designCardTitle: {
    ...typeScale.headline,
    color: '#111827',
    letterSpacing: letterSpacing.tight,
  },
  designCardLikes: {
    ...typeScale.caption,
    color: '#9CA3AF',
  },
  designBadge: {
    marginTop: 2,
    alignSelf: 'flex-start',
  },

  // ── Product cards — photo top, content below ──────────────────────────────
  productCard: {
    width: CARD_W,
    borderRadius: Math.round(CARD_W * 0.05),
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
  },
  productPhotoWrap: {
    width: '100%',
    height: PHOTO_H,
    overflow: 'hidden',
  },
  productPhoto: {
    width: '100%',
    height: '100%',
  },
  sourceBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  productCardBody: {
    padding: space.md,
    gap: 4,
    backgroundColor: '#FFFFFF',
  },
  productName: {
    ...typeScale.body,
    fontWeight: '600',
    color: '#111827',
    lineHeight: 18,
  },
  productPrice: {
    ...typeScale.price,
    color: colors.bluePrimary,
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
