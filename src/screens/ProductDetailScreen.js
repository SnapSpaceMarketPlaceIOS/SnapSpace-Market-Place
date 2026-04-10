/**
 * ProductDetailScreen — HomeGenie PDP
 *
 * Layout (scroll order, top → bottom):
 *   S0  Hero image        Full-bleed photo + floating Back / Share / Heart
 *   ─── White card (rounded top corners, overlaps hero) ───────────────────
 *   S1  Identity          Brand (blue) · In-Stock pill · Title · Rating row
 *   S2  Verified badge    "This Item Is HomeGenie Verified" full-width pill
 *   S3  Variants          Color / Size / Shape swatches (horizontal scroll)
 *   S4  Description       DESCRIPTION label + collapsible body  ← ABOVE price
 *   S5  FTC disclosure    Italic affiliate disclaimer
 *       Thin separator
 *   S6  Price block       Current price + strikethrough  |  or  |  AfterPay
 *   S7  Delivery box      "Free Fast Delivery" + estimated date
 *   S8  Quantity          − qty + selector
 *   S9  Product Details   Spec-table rows
 *   S10 Key Features      2×2 tile grid
 *   S11 Trust Badges      Horizontal strip (Shipping / Returns / Warranty)
 *   S12 Similar Products  "You May Also Like" horizontal row
 *   S13 From Post         Origin-design card (only when navigated from design)
 *
 * Fixed UI:
 *   StickyHeader  — materialises after hero scrolls out of view
 *   CTABar        — always-visible "Add to Cart" + Wishlist heart
 *                   (both Animated labels absolutely-positioned → no displacement)
 */

import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Animated,
  Linking,
} from 'react-native';
import Svg, { Path, Circle, Polyline, Line, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../context/CartContext';
import CardImage from '../components/CardImage';
import { SellerName } from '../components/VerifiedBadge';
import { shadow } from '../constants/tokens';

const { width: SW, height: SH } = Dimensions.get('window');
const IMAGE_H     = Math.round(SW * 1.0);   // full square — edges touch sides, tall hero
const CARD_LIFT   = 24;   // px the white card overlaps the hero

// ─── Design tokens (PDP-local, all values are token-aligned) ─────────────────
const T = {
  // Brand
  blue:         '#0B6DC3',
  blueDeep:     '#035DA8',
  navy:         '#0F1E35',
  // Surfaces
  surface:      '#FFFFFF',
  pageBg:       '#F5F6F8',
  imageBg:      '#ECEEF2',
  heroBg:       '#F0F2F5',   // neutral behind contain'd product image
  featBg:       '#EEF4FD',
  // Text
  txtPri:       '#0F1E35',
  txtSec:       '#8A8FA8',
  txtMeta:      '#C0C4D0',
  // Semantic
  green:        '#16A34A',
  greenBg:      '#DCFCE7',
  red:          '#E8394A',
  // Borders / separators
  border:       'rgba(0,0,0,0.08)',
  divider:      'rgba(0,0,0,0.06)',
  // Layout
  padH:         20,
  // Radii
  rCard:        24,
  rMd:          12,
  rSm:          8,
  rPill:        9999,
  rCta:         16,
  rVariant:     10,
  // Weights
  w800: '800', w700: '700', w600: '600', w500: '500', w400: '400',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a numeric USD price → "$1,149" or "$649.99" */
function fmtPrice(n) {
  if (typeof n !== 'number') return String(n ?? '');
  return n % 1 === 0 ? `$${n.toLocaleString()}` : `$${n.toFixed(2)}`;
}

/** Estimated delivery date N days out */
function deliveryDate(offsetDays = 4) {
  const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Pull similar products from catalog (same category, exclude self) */
function getSimProducts(product) {
  try {
    const raw = require('../data/productCatalog');
    const catalog = raw.productCatalog || raw.default || raw;
    if (!Array.isArray(catalog)) return [];
    const same = catalog.filter(p =>
      p.id !== product?.id && (!product?.category || p.category === product.category)
    );
    const pool = same.length >= 4 ? same : catalog.filter(p => p.id !== product?.id);
    return pool.slice(0, 6);
  } catch { return []; }
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const BackIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
    stroke={T.navy} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="15 18 9 12 15 6" />
  </Svg>
);

const HeartIcon = ({ filled, size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"
    fill={filled ? T.red : 'none'} stroke={filled ? T.red : T.navy}
    strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
  </Svg>
);

const ShareIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
    stroke={T.navy} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
    <Polyline points="16 6 12 2 8 6" />
    <Line x1="12" y1="2" x2="12" y2="15" />
  </Svg>
);

const StarIcon = ({ size = 15, filled = true }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"
    fill={filled ? '#67ACE9' : '#E5E7EB'} stroke={filled ? '#67ACE9' : '#D1D5DB'} strokeWidth={1}>
    <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </Svg>
);

const CartIconWhite = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"
    stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={9} cy={21} r={1} />
    <Circle cx={20} cy={21} r={1} />
    <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </Svg>
);

const CartIconNavy = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"
    stroke={T.navy} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={9} cy={21} r={1} />
    <Circle cx={20} cy={21} r={1} />
    <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </Svg>
);

const CheckIconWhite = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
    stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="20 6 9 17 4 12" />
  </Svg>
);

const CheckBadgeIcon = () => (
  <Svg width={15} height={15} viewBox="0 0 24 24" fill="none"
    stroke="#FFFFFF" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <Polyline points="22 4 12 14.01 9 11.01" />
  </Svg>
);

const ChevRight = ({ size = 14, color = T.txtMeta }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="9 18 15 12 9 6" />
  </Svg>
);

// Trust badge icons
const TruckIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"
    stroke={T.blue} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <Rect x={1} y={3} width={15} height={13} />
    <Polyline points="16 8 20 8 23 11 23 16 16 16 16 8" />
    <Circle cx={5.5} cy={18.5} r={2.5} />
    <Circle cx={18.5} cy={18.5} r={2.5} />
  </Svg>
);
const ReturnIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"
    stroke={T.blue} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={12} cy={12} r={10} />
    <Polyline points="9 14 4 9 9 4" />
    <Path d="M20 20v-7a4 4 0 0 0-4-4H4" />
  </Svg>
);
const WarrantyIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none"
    stroke={T.blue} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    <Polyline points="9 12 11 14 15 10" />
  </Svg>
);

// Key feature icons
const ShieldIcon  = () => <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Svg>;
const LayersIcon  = () => <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><Polyline points="12 2 2 7 12 12 22 7 12 2" /><Polyline points="2 17 12 22 22 17" /><Polyline points="2 12 12 17 22 12" /></Svg>;
const DropletIcon = () => <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></Svg>;
const WrenchIcon  = () => <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={T.blue} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><Path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></Svg>;

// ─── S0: ProductHero (swipeable image carousel via FlatList) ─────────────────

function ProductHero({ images, imageUrl, liked, onBack, onLike, onShare, topInset }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const heroImages = (images && images.length > 0) ? images : (imageUrl ? [imageUrl] : [null]);
  const hasMultiple = heroImages.length > 1;

  const onViewableChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) setActiveIdx(viewableItems[0].index ?? 0);
  }).current;

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  return (
    <View style={hs.root}>
      <FlatList
        data={heroImages}
        keyExtractor={(_, i) => String(i)}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableChanged}
        viewabilityConfig={viewConfig}
        renderItem={({ item: uri }) => (
          <CardImage
            uri={uri}
            style={hs.img}
            resizeMode="cover"
            placeholderColor={T.heroBg}
          />
        )}
      />

      {/* Page dots */}
      {hasMultiple && (
        <View style={hs.dots}>
          {heroImages.map((_, i) => (
            <View key={i} style={[hs.dot, i === activeIdx && hs.dotActive]} />
          ))}
        </View>
      )}

      {/* Floating nav */}
      <View style={[hs.topBar, { paddingTop: topInset + 14 }]}>
        <TouchableOpacity style={hs.navBtn} onPress={onBack}
          activeOpacity={0.7}
          hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
          <BackIcon />
        </TouchableOpacity>
        <View style={hs.topRight}>
          <TouchableOpacity style={hs.navBtn} onPress={onShare}
            activeOpacity={0.7}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            <ShareIcon />
          </TouchableOpacity>
          <TouchableOpacity style={hs.navBtn} onPress={onLike}
            activeOpacity={0.7}
            hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            <HeartIcon filled={liked} size={20} />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const hs = StyleSheet.create({
  root:      { width: SW, height: IMAGE_H, backgroundColor: '#F0F2F5' },
  img:       { width: SW, height: IMAGE_H },
  topBar:    { position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: T.padH },
  topRight:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  navBtn:    { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.92)', alignItems: 'center', justifyContent: 'center', ...shadow.medium },
  dots:      { position: 'absolute', bottom: 34, left: 0, right: 0, flexDirection: 'row', justifyContent: 'center', gap: 6 },
  dot:       { width: 7, height: 7, borderRadius: 4, backgroundColor: 'rgba(0,0,0,0.2)' },
  dotActive: { backgroundColor: '#111', width: 9, height: 9, borderRadius: 5 },
});

// ─── S1: ProductIdentity ──────────────────────────────────────────────────────
// Layout: Title → Description (short) → "By [Brand]" + In-Stock → 5-star row

function ProductIdentity({ brand, title, description, rating, reviewCount, inStock }) {
  const ratingVal   = typeof rating === 'number' ? rating : parseFloat(rating) || 4.0;
  const filledStars = Math.round(ratingVal);
  const displayReviews = reviewCount ?? 0;

  return (
    <View style={id.wrap}>
      {/* 1. Title */}
      <Text style={id.title}>{title}</Text>

      {/* 2. Short description — directly under title, above byline */}
      {!!description && (
        <Text style={id.desc} numberOfLines={3}>{description}</Text>
      )}

      {/* 3. By [Brand] + In Stock pill */}
      <View style={id.byRow}>
        <Text style={id.byLine}>By {brand ?? 'Unknown'}</Text>
        {inStock !== false && (
          <View style={id.stockPill}>
            <View style={id.dot} />
            <Text style={id.stockTxt}>In Stock</Text>
          </View>
        )}
      </View>

      {/* 4. 5-star rating row */}
      <TouchableOpacity style={id.ratingRow} activeOpacity={0.7}>
        {[1, 2, 3, 4, 5].map(i => (
          <StarIcon key={i} size={15} filled={i <= filledStars} />
        ))}
        <Text style={id.score}>{ratingVal.toFixed(1)}</Text>
        <Text style={id.reviews}>({displayReviews.toLocaleString()} {displayReviews === 1 ? 'Review' : 'Reviews'})</Text>
        <ChevRight size={12} color={T.txtSec} />
      </TouchableOpacity>
    </View>
  );
}

const id = StyleSheet.create({
  wrap:      { paddingHorizontal: T.padH, paddingTop: 28 },
  bestSeller:   { backgroundColor: '#FFF4E6', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5, alignSelf: 'flex-start', marginBottom: 10 },
  bestSellerTxt:{ fontSize: 12, fontWeight: T.w700, color: '#B45309', lineHeight: 16, fontFamily: 'Geist_700Bold'},
  title:     { fontSize: 22, fontWeight: T.w700, color: T.txtPri, lineHeight: 29, letterSpacing: -0.3, fontFamily: 'Geist_700Bold'},
  desc:      { fontSize: 14, fontWeight: T.w400, color: T.txtSec, lineHeight: 22, marginTop: 10, fontFamily: 'Geist_400Regular'},
  byRow:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 14 },
  byLine:    { fontSize: 14, fontWeight: T.w400, color: T.blue, lineHeight: 20, fontFamily: 'Geist_400Regular'},
  stockPill: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: T.greenBg, borderRadius: T.rPill, paddingHorizontal: 7, paddingVertical: 3, borderWidth: 1, borderColor: T.green },
  dot:       { width: 5, height: 5, borderRadius: 3, backgroundColor: T.green },
  stockTxt:  { fontSize: 11, fontWeight: T.w600, color: T.green, lineHeight: 14, fontFamily: 'Geist_600SemiBold'},
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 14 },
  score:     { fontSize: 14, fontWeight: T.w600, color: T.txtPri, lineHeight: 18, marginLeft: 3, fontFamily: 'Geist_600SemiBold'},
  reviews:   { fontSize: 13, fontWeight: T.w400, color: T.txtSec, lineHeight: 18, fontFamily: 'Geist_400Regular'},
});

// ─── S2: Best Seller Badge ────────────────────────────────────────────────────

function BestSellerBadge({ text }) {
  if (!text) return null;
  return (
    <View style={vb.wrap}>
      <View style={vb.pill}>
        {/* Shipping truck icon — pure blue, no fill */}
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none"
          stroke={T.blue} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <Rect x={1} y={3} width={15} height={13} fill="none" />
          <Polyline points="16 8 20 8 23 11 23 16 16 16 16 8" />
          <Circle cx={5.5} cy={18.5} r={2.5} fill="none" />
          <Circle cx={18.5} cy={18.5} r={2.5} fill="none" />
        </Svg>
        <Text style={vb.label}>{text}</Text>
      </View>
    </View>
  );
}

const vb = StyleSheet.create({
  wrap: { paddingHorizontal: T.padH, marginTop: 24 },
  pill: { flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', backgroundColor: '#FFFFFF', borderRadius: 10, borderWidth: 1, borderColor: T.blue, paddingVertical: 8, paddingHorizontal: 14, gap: 6 },
  label: { fontSize: 13, fontWeight: T.w600, color: T.blue, lineHeight: 18, fontFamily: 'Geist_600SemiBold'},
});

// ─── S1b: MetaChips (surfaces roomType + styles from catalog) ────────────────
// Read-only visual pills that show the product's design metadata so users
// can see the full classification (e.g. "living-room · minimalist · japandi").
// Not interactive — purely informative.

const CHIP_LABELS = {
  'living-room': 'Living Room',
  'dining-room': 'Dining Room',
  'bedroom': 'Bedroom',
  'kitchen': 'Kitchen',
  'office': 'Office',
  'bathroom': 'Bathroom',
  'outdoor': 'Outdoor',
  'nursery': 'Nursery',
  'entryway': 'Entryway',
  'mid-century': 'Mid-Century',
  'dark-luxe': 'Dark Luxe',
  'art-deco': 'Art Deco',
  'wabi-sabi': 'Wabi-Sabi',
  'french-country': 'French Country',
};

function formatChip(s) {
  if (!s) return '';
  if (CHIP_LABELS[s]) return CHIP_LABELS[s];
  // Title-case single words
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function MetaChips({ roomTypes, styles: productStyles }) {
  const rooms = Array.isArray(roomTypes) ? roomTypes : (roomTypes ? [roomTypes] : []);
  const styls = Array.isArray(productStyles) ? productStyles : [];
  const combined = [...rooms, ...styls].filter(Boolean);
  // Dedupe and cap at 5 visible chips
  const unique = [...new Set(combined)].slice(0, 5);
  if (unique.length === 0) return null;
  return (
    <View style={mc.wrap}>
      {unique.map((t, i) => (
        <View key={`${t}-${i}`} style={mc.chip}>
          <Text style={mc.chipText}>{formatChip(t)}</Text>
        </View>
      ))}
    </View>
  );
}

const mc = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: T.padH,
    marginTop: 16,
    gap: 6,
  },
  chip: {
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  chipText: {
    fontSize: 11,
    fontWeight: T.w600,
    color: T.txtSec,
    fontFamily: 'Geist_600SemiBold',
    letterSpacing: 0.3,
  },
});

// ─── S3: VariantSelector ──────────────────────────────────────────────────────

// Detect variant type from data to show smart label
function getVariantLabel(variants) {
  if (!variants || variants.length === 0) return null;
  const hasColor  = variants.some(v => v.color || v.swatchImage);
  const hasSize   = variants.some(v => /inch|cm|size|small|medium|large/i.test(v.label));
  const hasShape  = variants.some(v => /round|oval|square|rectangle/i.test(v.label));
  if (hasColor && hasSize) return 'Color & Size';
  if (hasColor) return 'Color';
  if (hasSize)  return 'Size';
  if (hasShape) return 'Shape';
  return 'Style';
}

function VariantSelector({ variants, selectedId, onSelect }) {
  if (!variants || variants.length === 0) return null;
  const label = getVariantLabel(variants);
  return (
    <View style={va.wrap}>
      <Text style={va.hint}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={va.scroll}>
        {variants.map((v) => {
          const active = v.id === selectedId;
          return (
            <TouchableOpacity key={v.id}
              style={[va.tile, active ? va.tileOn : va.tileOff]}
              onPress={() => onSelect(v.id)}
              activeOpacity={0.8}>
              {/* Image area — fixed height, no overlap with label */}
              <View style={va.imgArea}>
                {v.swatchImage ? (
                  <CardImage
                    uri={v.swatchImage}
                    style={va.swatchImg}
                    resizeMode="contain"
                    placeholderColor="#F0F2F5"
                  />
                ) : v.mainImage ? (
                  <CardImage
                    uri={v.mainImage}
                    style={va.swatchImg}
                    resizeMode="cover"
                    placeholderColor="#F0F2F5"
                  />
                ) : v.color ? (
                  <View style={[va.colorBlock, { backgroundColor: v.color }]} />
                ) : null}
              </View>
              {/* Label sits cleanly below image — no overlap */}
              <View style={va.labelRow}>
                <Text style={[va.tileLabel, active && va.tileLabelOn]} numberOfLines={2}>
                  {v.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const va = StyleSheet.create({
  wrap:       { paddingTop: 28 },
  hint:       { fontSize: 13, fontWeight: T.w600, color: T.txtPri, lineHeight: 18, paddingHorizontal: T.padH, marginBottom: 12, fontFamily: 'Geist_600SemiBold'},
  scroll:     { paddingHorizontal: T.padH, gap: 12 },
  tile:       { width: 120, borderRadius: T.rVariant, backgroundColor: '#FFFFFF', overflow: 'hidden', flexDirection: 'column' },
  tileOff:    { borderWidth: 1, borderColor: T.border },
  tileOn:     { borderWidth: 1, borderColor: T.blue },
  imgArea:    { width: '100%', height: 88, backgroundColor: '#FFFFFF' },
  swatchImg:  { width: '100%', height: '100%' },
  colorBlock: { width: '100%', height: '100%' },
  labelRow:   { paddingVertical: 8, paddingHorizontal: 6, minHeight: 36, justifyContent: 'center', backgroundColor: T.surface },
  tileLabel:  { fontSize: 11, fontWeight: T.w400, color: T.txtSec, textAlign: 'center', lineHeight: 15, fontFamily: 'Geist_400Regular'},
  tileLabelOn:{ fontWeight: T.w700, color: T.txtPri, fontFamily: 'Geist_700Bold'},
});

// ─── S3b: SizeSelector ───────────────────────────────────────────────────────

function SizeSelector({ sizes }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  if (!sizes || sizes.length === 0) return null;
  return (
    <View style={sz.wrap}>
      <Text style={sz.label}>Size: <Text style={sz.labelBold}>{sizes[selectedIdx]?.label}</Text></Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sz.scroll}>
        {sizes.map((s, i) => {
          const active = i === selectedIdx;
          return (
            <TouchableOpacity
              key={s.id || i}
              style={[sz.tile, active && sz.tileActive]}
              onPress={() => setSelectedIdx(i)}
              activeOpacity={0.75}
            >
              <Text style={[sz.sizeLabel, active && sz.sizeLabelActive]}>{s.label}</Text>
              {s.price != null && (
                <Text style={[sz.sizePrice, active && sz.sizePriceActive]}>${s.price.toFixed(2)}</Text>
              )}
              {s.compareAt != null && s.compareAt !== s.price && (
                <Text style={sz.sizeCompare}>${s.compareAt.toFixed(2)}</Text>
              )}
              {s.inStock !== false && (
                <Text style={sz.sizeStock}>In Stock</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const sz = StyleSheet.create({
  wrap:            { paddingHorizontal: T.padH, marginTop: 24 },
  label:           { fontSize: 14, fontWeight: T.w400, color: T.txtPri, marginBottom: 10, fontFamily: 'Geist_400Regular'},
  labelBold:       { fontWeight: T.w700, fontFamily: 'Geist_700Bold'},
  scroll:          { gap: 10 },
  tile:            { borderWidth: 1, borderColor: T.border, borderRadius: T.rMd, paddingHorizontal: 16, paddingVertical: 10, minWidth: 120 },
  tileActive:      { borderColor: T.blue, borderWidth: 1 },
  sizeLabel:       { fontSize: 14, fontWeight: T.w600, color: T.txtPri, lineHeight: 20, fontFamily: 'Geist_600SemiBold'},
  sizeLabelActive: { color: T.txtPri },
  sizePrice:       { fontSize: 13, fontWeight: T.w400, color: T.txtPri, lineHeight: 18, marginTop: 2, fontFamily: 'Geist_400Regular'},
  sizePriceActive: { fontWeight: T.w600, fontFamily: 'Geist_600SemiBold'},
  sizeCompare:     { fontSize: 12, fontWeight: T.w400, color: T.txtSec, textDecorationLine: 'line-through', lineHeight: 16, fontFamily: 'Geist_400Regular'},
  sizeStock:       { fontSize: 11, fontWeight: T.w600, color: T.green, marginTop: 3, lineHeight: 14, fontFamily: 'Geist_600SemiBold'},
});

// ─── S4: ProductDescription ───────────────────────────────────────────────────

function ProductDescription({ text }) {
  const [open, setOpen] = useState(false);
  const long = (text ?? '').length > 130;
  return (
    <View style={dc.wrap}>
      <Text style={dc.label}>DESCRIPTION</Text>
      <Text style={dc.body} numberOfLines={open ? undefined : 3}>{text}</Text>
      {long && (
        <TouchableOpacity onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
          <Text style={dc.toggle}>{open ? 'Show less ↑' : 'Read more ↓'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const dc = StyleSheet.create({
  wrap:   { paddingHorizontal: T.padH, marginTop: 22 },
  label:  { fontSize: 10, fontWeight: T.w600, color: T.txtSec, letterSpacing: 1.0, textTransform: 'uppercase', lineHeight: 14, fontFamily: 'Geist_600SemiBold'},
  body:   { fontSize: 15, fontWeight: T.w400, color: T.txtPri, lineHeight: 24, marginTop: 8, fontFamily: 'Geist_400Regular'},
  toggle: { fontSize: 13, fontWeight: T.w600, color: T.blue, marginTop: 4, fontFamily: 'Geist_600SemiBold'},
});

// ─── S5: FTC Disclosure ───────────────────────────────────────────────────────

function FTCNote() {
  return (
    <Text style={ftc.txt}>
      We may earn a commission when you buy through links on this app.
    </Text>
  );
}

const ftc = StyleSheet.create({
  txt: { fontSize: 11, fontWeight: T.w400, color: T.txtMeta, fontStyle: 'italic', textAlign: 'center', marginTop: 24, marginHorizontal: T.padH, fontFamily: 'Geist_400Regular'},
});

// ─── S6: PriceBlock ───────────────────────────────────────────────────────────

function PriceBlock({ price, originalPrice }) {
  const hasDiscount = !!originalPrice;
  return (
    <View style={pr.wrap}>
      <Text style={pr.price}>{price}</Text>
      {hasDiscount && (
        <Text style={pr.original}>{originalPrice}</Text>
      )}
    </View>
  );
}

const pr = StyleSheet.create({
  wrap:     { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: T.padH, marginTop: 24 },
  price:    { fontSize: 28, fontWeight: T.w800, color: T.blue, letterSpacing: -0.5, lineHeight: 34, fontFamily: 'Geist_700Bold'},
  original: { fontSize: 15, fontWeight: T.w400, color: T.txtSec, textDecorationLine: 'line-through', lineHeight: 20, fontFamily: 'Geist_400Regular'},
});

// ─── S7: DeliveryBox ─────────────────────────────────────────────────────────

function DeliveryBox({ date }) {
  return (
    <TouchableOpacity style={dv.box} activeOpacity={0.75}>
      <View style={dv.greenPill}>
        <Text style={dv.greenTxt}>Free Fast Delivery</Text>
      </View>
      <Text style={dv.date}>Get it by {date}</Text>
      <ChevRight size={14} color={T.blue} />
    </TouchableOpacity>
  );
}

const dv = StyleSheet.create({
  box:      { marginHorizontal: T.padH, marginTop: 14, borderWidth: 1, borderColor: T.blue, borderRadius: 30, paddingVertical: 8, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: T.surface },
  greenPill:{ backgroundColor: '#F0FDF4', borderRadius: T.rPill, paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: T.green },
  greenTxt: { fontSize: 11, fontWeight: T.w600, color: T.green, lineHeight: 15, fontFamily: 'Geist_600SemiBold'},
  date:     { flex: 1, fontSize: 13, fontWeight: T.w400, color: T.txtPri, lineHeight: 18, fontFamily: 'Geist_400Regular'},
});

// ─── S8: QuantitySelector ────────────────────────────────────────────────────

function QuantitySelector({ qty, onDecrease, onIncrease }) {
  return (
    <View style={qs.wrap}>
      <View style={qs.pill}>
        {/* − button */}
        <TouchableOpacity style={[qs.btn, qty <= 1 && qs.btnDim]}
          onPress={onDecrease} activeOpacity={0.7} disabled={qty <= 1}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[qs.symbol, qty <= 1 && qs.symbolDim]}>−</Text>
        </TouchableOpacity>

        {/* Divider + count + divider */}
        <View style={qs.divider} />
        <Text style={qs.count}>{qty}</Text>
        <View style={qs.divider} />

        {/* + button */}
        <TouchableOpacity style={qs.btn} onPress={onIncrease} activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={qs.symbol}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const qs = StyleSheet.create({
  // Single pill container — all three elements (−, count, +) live inside one rounded border
  wrap:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: T.padH, marginTop: 16 },
  pill:      { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: T.border, borderRadius: T.rPill, backgroundColor: T.surface, overflow: 'hidden' },
  btn:       { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
  btnDim:    { opacity: 0.32 },
  divider:   { width: 1, height: 16, backgroundColor: T.border },
  symbol:    { fontSize: 16, fontWeight: T.w400, color: T.txtPri, lineHeight: 20, fontFamily: 'Geist_400Regular'},
  symbolDim: { color: T.txtMeta },
  count:     { fontSize: 14, fontWeight: T.w600, color: T.txtPri, width: 36, textAlign: 'center', lineHeight: 20, fontFamily: 'Geist_600SemiBold'},
});

// ─── S9: ProductDetails ───────────────────────────────────────────────────────

function ProductDetails({ details }) {
  const [open, setOpen] = useState(false);
  const rotation = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    Animated.timing(rotation, {
      toValue: open ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setOpen(o => !o);
  };

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const rows = details
    ? Object.entries(details)
    : [
        ['Brand',      'POLY & BARK'],
        ['Category',   'Furniture'],
        ['Material',   'Premium Linen'],
        ['Dimensions', '84" W × 36" D × 34" H'],
        ['Condition',  'Brand New'],
        ['Delivery',   '2–4 weeks'],
        ['Warranty',   '2-year limited'],
      ];

  return (
    <View style={pdt.wrap}>
      <TouchableOpacity style={pdt.header} onPress={toggle} activeOpacity={0.7}>
        <View style={pdt.headerLeft}>
          <View style={pdt.headerAccent} />
          <Text style={pdt.sLabel}>PRODUCT DETAILS</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <ChevRight size={16} color={T.txtSec} />
        </Animated.View>
      </TouchableOpacity>

      {open && (
        <View style={pdt.card}>
          {rows.map(([k, v], i) => (
            <View key={k} style={[pdt.row, i === rows.length - 1 && pdt.rowLast]}>
              <Text style={pdt.key}>{k}</Text>
              <Text style={pdt.val}>{v}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const pdt = StyleSheet.create({
  wrap:    { paddingHorizontal: T.padH, marginTop: 32 },
  header:       { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerLeft:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerAccent: { width: 3, height: 14, borderRadius: 2, backgroundColor: T.blue },
  sLabel:       { fontSize: 11, fontWeight: T.w700, color: T.txtSec, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: 'Geist_700Bold'},
  card:    { backgroundColor: T.surface, borderRadius: T.rMd, borderWidth: 1, borderColor: T.border, marginTop: 12, overflow: 'hidden' },
  row:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', height: 52, paddingHorizontal: T.padH, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: T.divider },
  rowLast: { borderBottomWidth: 0 },
  key:     { fontSize: 14, fontWeight: T.w400, color: T.txtSec, lineHeight: 20, fontFamily: 'Geist_400Regular'},
  val:     { fontSize: 14, fontWeight: T.w700, color: T.txtPri, textAlign: 'right', maxWidth: '58%', lineHeight: 20, fontFamily: 'Geist_700Bold'},
});

// ─── S10: KeyFeatures — Premium Numbered Infographic ─────────────────────────
//
// Design: single bordered panel, each feature is a numbered row.
// Left  → number badge (01, 02…) + icon circle
// Right → feature title (bold) + one-line benefit copy
// Rows separated by hairline dividers — clean, professional, zero clutter.

const DEF_FEATURES = [
  { label: 'Hardwood Frame',    sub: 'Built to last decades — solid, warp-resistant construction.',  Icon: ShieldIcon  },
  { label: 'High-Density Foam', sub: 'Conforms to your body for deep, restorative comfort.',          Icon: LayersIcon  },
  { label: 'Stain Resistant',   sub: 'Performance fabric repels spills — wipes clean in seconds.',   Icon: DropletIcon },
  { label: 'Tool-Free Setup',   sub: 'Snap-together design — fully assembled in under 20 minutes.',  Icon: WrenchIcon  },
];

function KeyFeatures({ features }) {
  const [open, setOpen] = useState(false);
  const rotation = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    Animated.timing(rotation, {
      toValue: open ? 0 : 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    setOpen(o => !o);
  };

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const items = features ?? DEF_FEATURES;
  return (
    <View style={kf.wrap}>
      {/* Section header — tappable, chevron rotates */}
      <TouchableOpacity style={kf.headerRow} onPress={toggle} activeOpacity={0.7}>
        <View style={kf.headerLeft}>
          <View style={kf.headerAccent} />
          <Text style={kf.sLabel}>KEY FEATURES</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <ChevRight size={16} color={T.txtSec} />
        </Animated.View>
      </TouchableOpacity>

      {/* Single panel — all rows inside */}
      {open && (
        <View style={kf.panel}>
          {items.map((f, i) => (
            <View key={i}>
              <View style={kf.row}>
                {/* Left: number + icon stacked */}
                <View style={kf.leftCol}>
                  <Text style={kf.num}>{String(i + 1).padStart(2, '0')}</Text>
                  <View style={kf.iconCircle}>
                    {f.Icon ? <f.Icon /> : null}
                  </View>
                </View>

                {/* Right: title + benefit copy */}
                <View style={kf.rightCol}>
                  <Text style={kf.featureName}>{f.label}</Text>
                  {!!f.sub && <Text style={kf.featureSub}>{f.sub}</Text>}
                </View>
              </View>

              {/* Hairline divider — not after last row */}
              {i < items.length - 1 && <View style={kf.divider} />}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const kf = StyleSheet.create({
  wrap:        { paddingHorizontal: T.padH, marginTop: 32 },

  // Header with blue left-accent bar
  headerRow:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerLeft:  { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerAccent:{ width: 3, height: 14, borderRadius: 2, backgroundColor: T.blue },
  sLabel:      { fontSize: 11, fontWeight: T.w700, color: T.txtSec, letterSpacing: 1.2, textTransform: 'uppercase', fontFamily: 'Geist_700Bold'},

  // Outer panel — single rounded card
  panel:       { borderRadius: T.rMd, borderWidth: 1, borderColor: T.border, backgroundColor: T.surface, overflow: 'hidden' },

  // Each feature row
  row:         { flexDirection: 'row', alignItems: 'center', paddingVertical: 16, paddingHorizontal: 16, gap: 14 },
  divider:     { height: StyleSheet.hairlineWidth, backgroundColor: T.divider, marginHorizontal: 16 },

  // Left column: number above icon
  leftCol:     { alignItems: 'center', gap: 6, width: 44 },
  num:         { fontSize: 11, fontWeight: T.w700, color: T.blue, letterSpacing: 0.5, lineHeight: 14, fontFamily: 'Geist_700Bold'},
  iconCircle:  { width: 40, height: 40, borderRadius: 10, backgroundColor: T.featBg, alignItems: 'center', justifyContent: 'center' },

  // Right column: title + sub
  rightCol:    { flex: 1 },
  featureName: { fontSize: 14, fontWeight: T.w600, color: T.txtPri, lineHeight: 20, fontFamily: 'Geist_600SemiBold'},
  featureSub:  { fontSize: 13, fontWeight: T.w400, color: T.txtSec, lineHeight: 19, marginTop: 3, fontFamily: 'Geist_400Regular'},
});

// ─── S11: TrustBadges ────────────────────────────────────────────────────────

// Reads shipping flags from the catalog instead of hardcoded defaults.
// Falls back to sensible defaults when fields are missing.
function TrustBadges({ shipping, warranty }) {
  const ship = shipping || {};
  const freeShip = ship.freeShipping !== false;
  const freeMin  = typeof ship.freeShippingMin === 'number' ? ship.freeShippingMin : 0;
  const returns  = typeof ship.returnDays === 'number' ? ship.returnDays : 30;
  const isPrime  = ship.prime === true;

  const badges = [
    {
      label: freeShip ? 'Free Shipping' : 'Shipping',
      sub: freeShip
        ? (freeMin > 0 ? `On orders $${freeMin}+` : (isPrime ? 'Prime eligible' : 'All orders'))
        : 'Fast delivery',
      Icon: TruckIcon,
    },
    { label: `${returns}-Day Returns`, sub: 'Hassle-free',   Icon: ReturnIcon  },
    { label: warranty || '2-Year Warranty', sub: 'Full coverage', Icon: WarrantyIcon },
  ];

  return (
    <View style={{ marginTop: 32 }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: T.padH, gap: 12 }}>
        {badges.map((b, i) => (
          <View key={i} style={tb.tile}>
            <View style={tb.iconCircle}>
              <b.Icon />
            </View>
            <Text style={tb.name}>{b.label}</Text>
            <Text style={tb.sub}>{b.sub}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const tb = StyleSheet.create({
  tile:       { alignItems: 'center', backgroundColor: T.surface, borderRadius: T.rMd, borderWidth: 1, borderColor: T.border, paddingHorizontal: 20, paddingVertical: 16, minWidth: 114 },
  iconCircle: { width: 44, height: 44, borderRadius: 22, backgroundColor: T.featBg, alignItems: 'center', justifyContent: 'center' },
  name:       { fontSize: 12, fontWeight: T.w600, color: T.txtPri, textAlign: 'center', marginTop: 8, lineHeight: 16, fontFamily: 'Geist_600SemiBold'},
  sub:        { fontSize: 11, fontWeight: T.w400, color: T.txtSec, textAlign: 'center', marginTop: 2, lineHeight: 14, fontFamily: 'Geist_400Regular'},
});

// ─── S12: SimilarProducts ────────────────────────────────────────────────────

function SimilarProducts({ products, onPress }) {
  if (!products?.length) return null;
  return (
    <View style={{ marginTop: 32 }}>
      <Text style={sp.sLabel}>YOU MAY ALSO LIKE</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: T.padH, paddingTop: 12, gap: 12 }}>
        {products.map((item, i) => (
          <TouchableOpacity key={item.id ?? i} style={sp.card}
            onPress={() => onPress?.(item)} activeOpacity={0.85}>
            <View style={sp.imgWrap}>
              <CardImage uri={item.imageUrl} style={sp.img} resizeMode="cover" />
            </View>
            <Text style={sp.brand}  numberOfLines={1}>{(item.brand ?? '').toUpperCase()}</Text>
            <Text style={sp.title}  numberOfLines={2}>{item.name}</Text>
            <Text style={sp.price}>{fmtPrice(item.price)}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    </View>
  );
}

const sp = StyleSheet.create({
  sLabel:  { fontSize: 10, fontWeight: T.w600, color: T.txtSec, letterSpacing: 1.0, textTransform: 'uppercase', paddingHorizontal: T.padH, fontFamily: 'Geist_600SemiBold'},
  card:    { width: 158 },
  imgWrap: { width: 158, height: 138, borderRadius: T.rMd, overflow: 'hidden', backgroundColor: T.imageBg },
  img:     { width: 158, height: 138 },
  brand:   { fontSize: 10, fontWeight: T.w600, color: T.blue, letterSpacing: 0.6, marginTop: 8, lineHeight: 14, fontFamily: 'Geist_600SemiBold'},
  title:   { fontSize: 13, fontWeight: T.w600, color: T.txtPri, lineHeight: 17, marginTop: 3, fontFamily: 'Geist_600SemiBold'},
  price:   { fontSize: 14, fontWeight: T.w700, color: T.txtPri, marginTop: 3, fontFamily: 'Geist_700Bold'},
});

// ─── S13: FromPost ────────────────────────────────────────────────────────────

function FromPostSection({ design }) {
  if (!design) return null;
  return (
    <View style={fp.wrap}>
      <Text style={fp.sLabel}>FROM POST</Text>
      <View style={fp.row}>
        <View style={fp.avatar}>
          <Text style={fp.initial}>{design.initial ?? '?'}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={fp.postTitle} numberOfLines={1}>
            {(design.title ?? '').replace('...', '')}
          </Text>
          <SellerName
            name={`@${design.user}`}
            isVerified={!!design.verified}
            size="sm"
            nameStyle={fp.postUser}
          />
        </View>
      </View>
    </View>
  );
}

const fp = StyleSheet.create({
  wrap:      { marginHorizontal: T.padH, marginTop: 32, backgroundColor: '#F8F9FB', borderRadius: T.rMd, padding: 14 },
  sLabel:    { fontSize: 10, fontWeight: T.w600, color: T.txtSec, letterSpacing: 1.0, textTransform: 'uppercase', marginBottom: 10, fontFamily: 'Geist_600SemiBold'},
  row:       { flexDirection: 'row', alignItems: 'center', gap: 10 },
  avatar:    { width: 30, height: 30, borderRadius: 15, backgroundColor: T.blue, alignItems: 'center', justifyContent: 'center' },
  initial:   { fontSize: 13, fontWeight: T.w700, color: '#FFF', fontFamily: 'Geist_700Bold'},
  postTitle: { fontSize: 13, fontWeight: T.w700, color: T.txtPri, lineHeight: 17, fontFamily: 'Geist_700Bold'},
  postUser:  { fontSize: 12, color: T.txtSec, fontFamily: 'Geist_400Regular'},
});

// ─── Fixed: StickyHeader ─────────────────────────────────────────────────────

function StickyHeader({ title, onBack, onCart, opacity, topInset }) {
  return (
    <Animated.View style={[sth.bar, { opacity, paddingTop: topInset + 8 }]} pointerEvents="box-none">
      <View style={sth.inner}>
        <TouchableOpacity style={sth.btn} onPress={onBack}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={sth.title} numberOfLines={1}>{title}</Text>
        <TouchableOpacity style={sth.btn} onPress={onCart}>
          <CartIconNavy />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const sth = StyleSheet.create({
  bar:   { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: T.surface, borderBottomWidth: 0.5, borderBottomColor: 'rgba(0,0,0,0.08)', zIndex: 100 },
  inner: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: T.padH, paddingBottom: 12 },
  btn:   { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, fontSize: 15, fontWeight: T.w600, color: T.txtPri, textAlign: 'center', marginHorizontal: 4, fontFamily: 'Geist_600SemiBold'},
});

// ─── Fixed: CTABar ────────────────────────────────────────────────────────────
// BUTTON DISPLACEMENT FIX:
//   Both "Add to Cart" and "Added!" labels are position:'absolute' within
//   a fixed-height container. Neither label affects the other's layout.
//   The outer View uses flex:1 so the button fills all horizontal space.

function CTABar({ inCart, onAddToCart, affiliateUrl, source, cartLabelOpacity, addedLabelOpacity, bottomInset }) {
  const [isPressed, setIsPressed] = useState(false);
  const btnScale = useRef(new Animated.Value(1)).current;

  const handleCart = () => {
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.97, duration: 90, useNativeDriver: true }),
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 300 }),
    ]).start();
    onAddToCart();
  };

  const pb = Math.max(bottomInset, 12);

  // Color logic: pressed or inCart → blue bg + white text; default → white bg + blue text
  const btnFilled = isPressed || inCart;

  return (
    <View style={[cta.bar, { paddingBottom: pb }]}>
      {/* "Also available on Amazon ›" */}
      {!!affiliateUrl && (
        <TouchableOpacity
          onPress={() => Linking.openURL(affiliateUrl).catch(() => null)}
          activeOpacity={0.7}
          style={cta.affiliateRow}>
          <Text style={cta.affiliateTxt}>
            Also available on {source === 'amazon' ? 'Amazon' : (source ?? 'Amazon')} ›
          </Text>
        </TouchableOpacity>
      )}

      {/* CTA button — full width pill */}
      <Animated.View style={[cta.cartWrap, { transform: [{ scale: btnScale }] }]}>
        <TouchableOpacity
          style={[cta.cartBtn, btnFilled && cta.cartBtnFilled]}
          onPress={handleCart}
          onPressIn={() => setIsPressed(true)}
          onPressOut={() => setIsPressed(false)}
          activeOpacity={1}
          accessibilityLabel={inCart ? 'View cart' : 'Add to cart'}>
          {/*
            Both labels are position:'absolute' inside a fixed-height container.
            Neither label affects the other's layout — zero vertical displacement.
          */}
          <View style={cta.labelBox}>
            <Animated.Text style={[cta.label, { opacity: cartLabelOpacity, color: btnFilled ? '#FFFFFF' : T.blue }]}>
              {inCart ? 'View Cart' : 'Add to Cart'}
            </Animated.Text>
            <Animated.Text style={[cta.label, { opacity: addedLabelOpacity, color: btnFilled ? '#FFFFFF' : T.blue }]}>
              Added!
            </Animated.Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const cta = StyleSheet.create({
  // ── Bar container ─────────────────────────────────────────────────────────
  // Elevated surface with soft top shadow — lifts off the scroll content
  bar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: T.surface,
    paddingHorizontal: T.padH,
    paddingTop: 12,
    ...shadow.high,
  },

  // ── Affiliate link ────────────────────────────────────────────────────────
  affiliateRow: { alignItems: 'center', marginBottom: 10 },
  affiliateTxt: { fontSize: 12, fontWeight: T.w500, color: T.txtSec, lineHeight: 16, fontFamily: 'Geist_500Medium'},

  // ── Add to Cart button — full-width pill ─────────────────────────────────
  cartWrap:     { flex: 1 },
  cartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 9999,
    borderWidth: 1.5,
    borderColor: T.blue,
    height: 56,
  },
  cartBtnFilled: {
    backgroundColor: T.blue,
  },

  // ── Label box — both labels stack absolutely, zero displacement ───────────
  labelBox: {
    width: 140,
    height: 22,
    position: 'relative',
  },
  label: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    fontSize: 16,
    fontWeight: T.w700,
    fontFamily: 'Geist_400Regular',
    lineHeight: 22,
    textAlign: 'center',
    letterSpacing: 0.1,
  },
});

// ─── ProductDetailScreen (main) ───────────────────────────────────────────────

export default function ProductDetailScreen({ route, navigation }) {
  const product = route?.params?.product;
  const design  = route?.params?.design;
  const insets  = useSafeAreaInsets();
  const { addToCart, items } = useCart();

  // ── Local state ──────────────────────────────────────────────────────────
  const [liked,       setLiked]      = useState(false);
  const [qty,         setQty]        = useState(1);
  const [selectedVar, setSelectedVar]= useState(product?.variants?.[0]?.id ?? '1');

  const scrollY           = useRef(new Animated.Value(0)).current;
  const cartLabelOpacity  = useRef(new Animated.Value(1)).current;
  const addedLabelOpacity = useRef(new Animated.Value(0)).current;

  // ── Product data (from route, with fallbacks) ─────────────────────────────
  const name         = product?.name         ?? 'Vento Sofa, Italian Leather';
  const brand        = product?.brand        ?? 'POLY & BARK';
  const imageUrl     = product?.imageUrl     ?? null;
  const images       = product?.images       ?? [];
  const affiliateUrl = product?.affiliateUrl ?? null;
  const source       = product?.source       ?? 'amazon';
  const description  = product?.description  ??
    'Crafted for modern interiors with premium materials and timeless design. ' +
    'Built to last decades with a commitment to quality and sustainability.';
  const inStock      = product?.inStock      ?? true;
  const rating       = product?.rating       ?? 4.0;
  const reviewCount  = product?.reviewCount  ?? 0;
  const bestSellerBadge = product?.bestSellerBadge ?? null;

  // Pricing — use priceValue (always the current selling price number from normalizeProduct)
  // Fallback chain: priceValue → salePrice → numeric parse of price string → 0
  const rawPrice     = product?.priceValue ?? product?.salePrice
    ?? (typeof product?.price === 'number' ? product.price : parseFloat(String(product?.price).replace(/[^0-9.]/g, '')) || 0);
  const compareAt    = product?.compareAtPrice ?? product?.listPrice ?? null;

  // Product details table — enrich from product.details or build from product fields
  const details = product?.details ?? {
    Brand:      brand,
    Category:   product?.category
      ? product.category.charAt(0).toUpperCase() + product.category.slice(1)
      : 'Furniture',
    Material:   product?.materials?.[0]
      ? product.materials[0].charAt(0).toUpperCase() + product.materials[0].slice(1)
      : 'Premium Materials',
    Dimensions: product?.dimensions  ?? '84" W × 36" D × 34" H',
    Condition:  product?.condition   ?? 'Brand New',
    Delivery:   product?.delivery    ?? '2–4 weeks',
    Warranty:   product?.warranty    ?? '2-year limited',
    ...(product?.source === 'amazon' ? { 'Also on': 'Amazon' } : {}),
  };

  // Variants — only show if real data exists (no generic fallbacks)
  const variants = product?.variants ?? [];

  const sizes = product?.sizes ?? null;

  // Build key features from product.features (string[]) or use defaults
  const productFeatures = product?.features
    ? product.features.slice(0, 4).map((f, i) => {
        const icons = [ShieldIcon, LayersIcon, DropletIcon, WrenchIcon];
        // Split on ' — ' if present: left = label, right = sub
        const parts = f.split(' — ');
        return {
          label: parts.length > 1 ? parts[0] : f,
          sub: parts.length > 1 ? parts[1] : null,
          Icon: icons[i % icons.length],
        };
      })
    : null; // null → KeyFeatures uses DEF_FEATURES

  // Active variant — drives hero image swap, price, affiliate URL per selection
  const activeVariant = variants.find(v => v.id === selectedVar);
  const rawActiveImages = activeVariant?.images?.length > 0
    ? activeVariant.images
    : activeVariant?.mainImage
      ? [activeVariant.mainImage, ...images.slice(1)]
      : images;
  // Deduplicate — strips Amazon size suffixes (_AC_SL1500_, _AC_UL640_, etc.)
  // before comparing so two different resolutions of the same image are
  // recognized as duplicates. Non-Amazon URLs pass through unchanged.
  const activeImages = (() => {
    const normalize = (u) => (u || '').replace(/\._AC_[A-Z0-9_]+_\.jpg/i, '.jpg');
    const seen = new Set();
    const result = [];
    for (const url of rawActiveImages) {
      if (!url) continue;
      const key = normalize(url);
      if (seen.has(key)) continue;
      seen.add(key);
      result.push(url);
    }
    return result;
  })();

  // Variant-aware price: if variant has its own price, use it
  const variantPrice = activeVariant?.price ?? null;
  const displayPrice = variantPrice ?? rawPrice;
  const activeAffiliateUrl = activeVariant?.affiliateUrl ?? affiliateUrl;
  const activeAsin = activeVariant?.asin ?? product?.asin ?? null;
  const activeImageUrl = activeVariant?.mainImage ?? imageUrl;

  // Pricing display — uses variant-aware price
  const priceDisplay = fmtPrice(displayPrice);
  const origDisplay  = (compareAt && compareAt !== displayPrice) ? fmtPrice(compareAt) : null;

  const similarProducts = product?.similarProducts ?? getSimProducts(product);
  const estDelivery     = product?.shipping?.estimatedDays
    ? deliveryDate(parseInt(product.shipping.estimatedDays))
    : deliveryDate(4);

  // ── Cart logic ────────────────────────────────────────────────────────────
  const cartKey = `${name}__${brand}`;
  const inCart  = items.some(i => i.key === cartKey);

  const handleAddToCart = () => {
    if (inCart) {
      navigation.navigate('Main', { screen: 'Cart' });
      return;
    }
    addToCart({
      name: activeVariant ? `${name} — ${activeVariant.label}` : name,
      brand,
      price: displayPrice,
      imageUrl: activeImageUrl,
      affiliateUrl: activeAffiliateUrl,
      source: product?.source ?? 'amazon',
      asin: activeAsin,
    });
    Animated.parallel([
      Animated.timing(cartLabelOpacity,  { toValue: 0, duration: 150, useNativeDriver: true }),
      Animated.timing(addedLabelOpacity, { toValue: 1, duration: 150, useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(cartLabelOpacity,  { toValue: 1, duration: 150, useNativeDriver: true }),
          Animated.timing(addedLabelOpacity, { toValue: 0, duration: 150, useNativeDriver: true }),
        ]).start();
      }, 1500);
    });
  };

  // ── Sticky header opacity (fades in after hero leaves view) ───────────────
  const stickyOpacity = scrollY.interpolate({
    inputRange:  [IMAGE_H - 20, IMAGE_H + 20],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // ── Bottom spacer height — clears the fixed CTA bar ───────────────────────
  //   affiliate link (~32px) + buttons row (54px) + paddingTop (10) + paddingBottom
  const ctaH = (affiliateUrl ? 32 + 8 : 0) + 54 + 10 + Math.max(insets.bottom, 12) + 16;

  return (
    <View style={rs.root}>

      {/* ── Scrollable content ─────────────────────────────────────────── */}
      <Animated.ScrollView
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}>

        {/* S0: Hero image carousel */}
        <ProductHero
          images={activeImages}
          imageUrl={imageUrl}
          liked={liked}
          onBack={() => navigation?.goBack()}
          onLike={() => setLiked(p => !p)}
          onShare={() => Alert.alert('Share', `Share "${name}"?`)}
          topInset={insets.top}
        />

        {/* White content card (overlaps hero by CARD_LIFT px) */}
        <View style={rs.card}>

          {/* S1: Title → Description → By Brand → Rating */}
          <ProductIdentity
            brand={brand}
            title={name}
            description={description}
            rating={rating}
            reviewCount={reviewCount}
            inStock={inStock}
          />

          {/* S1b: Style / room metadata chips (surfaces catalog metadata) */}
          <MetaChips roomTypes={product?.roomType} styles={product?.styles} />

          {/* S2: Best Seller badge */}
          <BestSellerBadge text={bestSellerBadge} />

          {/* S3: Variant swatches */}
          <VariantSelector
            variants={variants}
            selectedId={selectedVar}
            onSelect={setSelectedVar}
          />

          {/* S3b: Size selector (only if product has sizes) */}
          {sizes && sizes.length > 0 && (
            <SizeSelector sizes={sizes} />
          )}

          {/* S4: Full product description (from Amazon import, previously hidden) */}
          <ProductDescription text={description} />

          {/* S5: FTC disclosure */}
          <FTCNote />

          {/* Thin separator */}
          <View style={rs.sep} />

          {/* S6: Price + compare-at (centered below main price) */}
          <PriceBlock
            price={priceDisplay}
            originalPrice={origDisplay}
          />

          {/* S8: Quantity selector — above delivery */}
          <QuantitySelector
            qty={qty}
            onDecrease={() => setQty(q => Math.max(1, q - 1))}
            onIncrease={() => setQty(q => q + 1)}
          />

          {/* S7: Delivery box */}
          <DeliveryBox date={estDelivery} />

          {/* S9: Product Details table */}
          <ProductDetails details={details} />

          {/* S10: Key Features grid */}
          <KeyFeatures features={productFeatures} />

          {/* S11: Trust badges strip — reads shipping flags from catalog */}
          <TrustBadges shipping={product?.shipping} warranty={details?.Warranty} />

          {/* S12: Similar Products */}
          <SimilarProducts
            products={similarProducts}
            onPress={(item) => navigation.push('ProductDetail', { product: item })}
          />

          {/* S13: From Post (only when arriving from a design) */}
          <FromPostSection design={design} />

          {/* Spacer to clear the fixed CTA bar */}
          <View style={{ height: ctaH }} />

        </View>
      </Animated.ScrollView>

      {/* ── Sticky header (slides in when hero scrolls out) ───────────── */}
      <StickyHeader
        title={name}
        onBack={() => navigation?.goBack()}
        onCart={() => navigation.navigate('Main', { screen: 'Cart' })}
        opacity={stickyOpacity}
        topInset={insets.top}
      />

      {/* ── Fixed CTA bar (always visible at bottom) ──────────────────── */}
      <CTABar
        inCart={inCart}
        onAddToCart={handleAddToCart}
        affiliateUrl={activeAffiliateUrl}
        source={source}
        cartLabelOpacity={cartLabelOpacity}
        addedLabelOpacity={addedLabelOpacity}
        bottomInset={insets.bottom}
      />

    </View>
  );
}

// ─── Root styles ──────────────────────────────────────────────────────────────

const rs = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: T.pageBg,
  },
  card: {
    marginTop: -CARD_LIFT,
    borderTopLeftRadius:  10,
    borderTopRightRadius: 10,
    backgroundColor: T.surface,
    minHeight: SH,
  },
  sep: {
    height: 1,
    backgroundColor: T.divider,
    marginHorizontal: T.padH,
    marginTop: 24,
  },
});
