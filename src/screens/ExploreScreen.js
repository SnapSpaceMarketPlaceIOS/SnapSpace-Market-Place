import React, { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Modal,
  Keyboard,
  Animated,
  Easing,
  Alert,
  Share,
  Switch,
  PanResponder,
} from 'react-native';
import CardImage from '../components/CardImage';
import AutoImage from '../components/AutoImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Circle, Line, Path, Rect, Polyline } from 'react-native-svg';
import { fontSize, fontWeight, letterSpacing, space, radius, shadow, typeScale } from '../constants/tokens';
import theme from '../constants/theme';
import { useLiked } from '../context/LikedContext';
import { useAuth } from '../context/AuthContext';
import { useOnboarding, ONBOARDING_STEPS } from '../context/OnboardingContext';
import OnboardingOverlay from '../components/OnboardingOverlay';
import { PRODUCT_CATALOG } from '../data/productCatalog';
import { getPublicDesigns } from '../services/supabase';
import { DESIGNS as LOCAL_DESIGNS } from '../data/designs';
import PressableCard from '../components/PressableCard';
import Skeleton from '../components/Skeleton';
import { SellerName } from '../components/VerifiedBadge';
import { getProductsForDesign, getProductsForPrompt } from '../services/affiliateProducts';
import { parseDesignPrompt } from '../utils/promptParser';
import TabScreenFade from '../components/TabScreenFade';
import * as ImagePicker from 'expo-image-picker';

const TC = theme.colors;
const TY = theme.typography;
const FW = theme.fontWeight;
const SP = theme.space;
const TR = theme.radius;
const TS = theme.shadow;

const { width } = Dimensions.get('window');
function colWidthPct(cols) {
  if (cols === 3) return '33.33%';
  if (cols === 1) return '100%';
  return '50%';
}

// 2.5% corner radius for the modal hero image (halved from 5%)
const MODAL_IMG_RADIUS = Math.round((width - SP[5] * 2) * 0.025);
// Product thumbnail — 1/3 larger than original 56px
const PRODUCT_IMG_SIZE = 88;

// ── Icons ─────────────────────────────────────────────────────────────────────

function SearchIcon({ color = '#fff', size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round" style={{ transform: [{ scaleX: -1 }] }}>
      <Circle cx={11} cy={11} r={8} />
      <Line x1={21} y1={21} x2={16.65} y2={16.65} />
    </Svg>
  );
}

function PlusIcon({ color = '#555', size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round">
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

function HeartIcon({ filled = false, size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#67ACE9' : 'none'} stroke={filled ? '#67ACE9' : '#444'} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function ImagePlaceholderIcon() {
  return (
    <Svg width={36} height={36} viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={18} height={18} rx={2} />
      <Circle cx={8.5} cy={8.5} r={1.5} />
      <Polyline points="21 15 16 10 5 21" />
    </Svg>
  );
}

function CloseIcon({ size = 12 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth={1.2} strokeLinecap="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

// Grid layout toggle icon — shows current mode
function GridLayoutIcon({ cols }) {
  const color = '#888';
  if (cols === 3) {
    // 3×3 dots — 2.5px squares, spaced across 18px viewbox
    return (
      <Svg width={20} height={20} viewBox="0 0 18 18" fill="none">
        {[0, 6, 12].map(x => [0, 6, 12].map(y => (
          <Rect key={`${x}${y}`} x={x + 0.5} y={y + 0.5} width={2.5} height={2.5} rx={0.75} fill={color} />
        )))}
      </Svg>
    );
  }
  if (cols === 1) {
    // 3 thin lines
    return (
      <Svg width={20} height={20} viewBox="0 0 18 18" fill="none">
        <Rect x={0} y={2}  width={18} height={1.5} rx={0.75} fill={color} />
        <Rect x={0} y={8.25} width={18} height={1.5} rx={0.75} fill={color} />
        <Rect x={0} y={14.5} width={18} height={1.5} rx={0.75} fill={color} />
      </Svg>
    );
  }
  // 2×2 squares — 6px each, 6px gap
  return (
    <Svg width={20} height={20} viewBox="0 0 18 18" fill="none">
      <Rect x={0}  y={0}  width={6} height={6} rx={1.2} fill={color} />
      <Rect x={12} y={0}  width={6} height={6} rx={1.2} fill={color} />
      <Rect x={0}  y={12} width={6} height={6} rx={1.2} fill={color} />
      <Rect x={12} y={12} width={6} height={6} rx={1.2} fill={color} />
    </Svg>
  );
}

// Amazon logo mark — 50% smaller: fontSize 6, SVG 18×4
function AmazonLogoMark() {
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Text style={{
        fontSize: 6,
        fontWeight: '800',
        color: '#232F3E',
        letterSpacing: -0.2,
        lineHeight: 8,
      }}>amazon</Text>
      <Svg width={18} height={4} viewBox="0 0 36 6" style={{ marginTop: 0 }}>
        <Path d="M1 3 Q18 7 34 3" stroke="#FF9900" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <Path d="M30.5 1 L34 3.2 L30.5 5.2" stroke="#FF9900" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      </Svg>
    </View>
  );
}

function StarIconSmall({ filled = true, size = 11, amber = false }) {
  const filledColor = amber ? '#F59E0B' : '#67ACE9';
  const emptyColor  = '#E5E7EB';
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? filledColor : emptyColor} stroke={filled ? filledColor : '#D1D5DB'} strokeWidth={1}>
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  );
}

function ChevDown({ size = 12, color = '#666' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="6 9 12 15 18 9" />
    </Svg>
  );
}

function SortIcon({ size = 16, color = '#555' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 6h8" />
      <Path d="M3 12h5" />
      <Path d="M3 18h3" />
      <Path d="M18 6v12" />
      <Path d="M15 15l3 3 3-3" />
    </Svg>
  );
}

function SlidersIcon({ size = 18, color = '#555' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={4} y1={21} x2={4} y2={14} />
      <Line x1={4} y1={10} x2={4} y2={3} />
      <Line x1={12} y1={21} x2={12} y2={12} />
      <Line x1={12} y1={8} x2={12} y2={3} />
      <Line x1={20} y1={21} x2={20} y2={16} />
      <Line x1={20} y1={12} x2={20} y2={3} />
      <Line x1={1} y1={14} x2={7} y2={14} />
      <Line x1={9} y1={8} x2={15} y2={8} />
      <Line x1={17} y1={16} x2={23} y2={16} />
    </Svg>
  );
}

function UploadIcon() {
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth={1.5} strokeLinecap="round">
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Polyline points="17 8 12 3 7 8" />
      <Line x1={12} y1={3} x2={12} y2={15} />
    </Svg>
  );
}

// ── Data ──────────────────────────────────────────────────────────────────────

const CATEGORIES = ['All', 'Living Room', 'Dining Room', 'Bedroom', 'Kitchen', 'Office', 'Dorms', 'Outdoor'];

// Product catalog category pills
const PRODUCT_CATEGORIES = ['All', 'Sofas', 'Seating', 'Beds', 'Nightstands', 'Dressers', 'Desks', 'Desk Chairs', 'Bookshelves', 'Coffee Tables', 'Side Tables', 'Table/Chairs', 'Kitchen', 'TV Stands', 'Throw Pillows', 'Table Lamps', 'Floor Lamps', 'Pendant Lights', 'Chandeliers', 'Lighting', 'Rugs', 'Wall Art', 'Mirrors'];
const PRODUCT_CAT_MAP = {
  'Sofas':          ['sofa'],
  'Seating':        ['accent-chair', 'dining-chair', 'bar-stool'],
  'Beds':           ['bed'],
  'Nightstands':    ['nightstand'],
  'Dressers':       ['dresser'],
  'Desks':          ['desk'],
  'Desk Chairs':    ['desk-chair'],
  'Bookshelves':    ['bookshelf'],
  'Coffee Tables':  ['coffee-table'],
  'Side Tables':    ['side-table'],
  'Table/Chairs':   ['dining-table', 'dining-chair'],
  'Kitchen':        ['kitchen-island'],
  'TV Stands':      ['tv-stand'],
  'Throw Pillows':  ['throw-pillow'],
  'Table Lamps':    ['table-lamp'],
  'Floor Lamps':    ['floor-lamp'],
  'Pendant Lights': ['pendant-light'],
  'Chandeliers':    ['chandelier'],
  'Lighting':       ['table-lamp', 'floor-lamp', 'pendant-light', 'chandelier'],
  'Rugs':           ['rug'],
  'Wall Art':       ['wall-art'],
  'Mirrors':        ['mirror'],
};

const POST_TAGS = [
  '#Minimalist', '#LivingRoom', '#Bedroom', '#Kitchen',
  '#Biophilic', '#DarkLuxe', '#Scandi', '#WarmTones',
  '#AIGenerated', '#ShopTheLook',
];

// ── Category keyword map (index matches CATEGORIES array) ─────────────────────

const CATEGORY_KEYWORDS = [
  [],                                              // 0 — All (no filter)
  ['livingroom', 'living room', 'living'],         // 1 — Living Room
  ['dining', 'dining room'],                       // 2 — Dining Room
  ['bedroom'],                                     // 3 — Bedroom
  ['kitchen'],                                     // 4 — Kitchen
  ['office'],                                      // 5 — Office
  ['dorm', 'dormitory', 'college', 'student'],     // 6 — Dorms
  ['outdoor', 'patio', 'garden', 'backyard', 'terrace'], // 7 — Outdoor
];

// ── Product filter constants ──────────────────────────────────────────────────

const PRICE_ABSOLUTE_MIN = 0;
const PRICE_ABSOLUTE_MAX = 5000;

const FILTER_STYLES = [
  'minimalist', 'japandi', 'modern', 'bohemian', 'coastal',
  'scandi', 'mid-century', 'rustic', 'dark-luxe', 'industrial',
  'farmhouse', 'glam', 'biophilic',
];

// Source is Amazon-only for now — no source filter UI needed
const FILTER_SOURCES = ['amazon'];

// ── Sort options ──────────────────────────────────────────────────────────────
const PRODUCT_SORT_OPTIONS = [
  { key: 'best_match', label: 'Best Match' },
  { key: 'price_low',  label: 'Price: Low → High' },
  { key: 'price_high', label: 'Price: High → Low' },
  { key: 'top_rated',  label: 'Top Rated' },
  { key: 'most_reviewed', label: 'Most Reviewed' },
  { key: 'newest',     label: 'Newest' },
];

const WISH_SORT_OPTIONS = [
  { key: 'most_popular', label: 'Most Popular' },
  { key: 'newest',       label: 'Newest' },
];

// Room type chips for the filter sheet (Products tab)
const FILTER_ROOM_TYPES = [
  'living-room', 'bedroom', 'kitchen', 'dining-room', 'office', 'bathroom', 'outdoor',
];

const FILTER_RATINGS = [3, 3.5, 4, 4.5];

// ── Price range slider ────────────────────────────────────────────────────────
// FIX: trackWRef (not state) so PanResponder closures always read current width.
// Live labels update on every move via displayMin/displayMax local state.

function PriceRangeSlider({ minVal, maxVal, onChangeMin, onChangeMax }) {
  const HANDLE  = 28;
  const TRACK_H = 4;

  // ← ref, not state — PanResponder closures capture this by reference
  const trackWRef = useRef(0);

  // Live display values — update during drag so labels animate with the handle
  const [displayMin, setDisplayMin] = useState(minVal);
  const [displayMax, setDisplayMax] = useState(maxVal);

  const minAnim  = useRef(new Animated.Value(0)).current;
  const maxAnim  = useRef(new Animated.Value(0)).current;
  const minRef   = useRef(0);   // current px position of min handle
  const maxRef   = useRef(0);   // current px position of max handle
  const startMin = useRef(0);   // px position at gesture start
  const startMax = useRef(0);

  const v2p = (v, w) =>
    w > 0 ? ((v - PRICE_ABSOLUTE_MIN) / (PRICE_ABSOLUTE_MAX - PRICE_ABSOLUTE_MIN)) * w : 0;

  const p2v = (p, w) => {
    if (w === 0) return PRICE_ABSOLUTE_MIN;
    const raw = (p / w) * (PRICE_ABSOLUTE_MAX - PRICE_ABSOLUTE_MIN) + PRICE_ABSOLUTE_MIN;
    return Math.round(Math.max(PRICE_ABSOLUTE_MIN, Math.min(PRICE_ABSOLUTE_MAX, raw)) / 50) * 50;
  };

  const handleLayout = useCallback((e) => {
    const w = e.nativeEvent.layout.width;
    if (w === trackWRef.current) return;
    trackWRef.current = w;
    const mp = v2p(minVal, w);
    const xp = v2p(maxVal, w);
    minRef.current = mp; minAnim.setValue(mp);
    maxRef.current = xp; maxAnim.setValue(xp);
  }, []); // eslint-disable-line

  const activeWidth = Animated.subtract(maxAnim, minAnim);

  const minPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: () => { startMin.current = minRef.current; },
    onPanResponderMove: (_, gs) => {
      const w  = trackWRef.current;
      const nx = Math.max(0, Math.min(startMin.current + gs.dx, maxRef.current - HANDLE));
      minAnim.setValue(nx);
      setDisplayMin(p2v(nx, w));  // live label update
    },
    onPanResponderRelease: (_, gs) => {
      const w  = trackWRef.current;
      const nx = Math.max(0, Math.min(startMin.current + gs.dx, maxRef.current - HANDLE));
      minRef.current = nx;
      minAnim.setValue(nx);
      const val = p2v(nx, w);
      setDisplayMin(val);
      onChangeMin(val);
    },
  })).current;

  const maxPan = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder:  () => true,
    onPanResponderGrant: () => { startMax.current = maxRef.current; },
    onPanResponderMove: (_, gs) => {
      const w  = trackWRef.current;
      const nx = Math.max(minRef.current + HANDLE, Math.min(startMax.current + gs.dx, w));
      maxAnim.setValue(nx);
      setDisplayMax(p2v(nx, w));  // live label update
    },
    onPanResponderRelease: (_, gs) => {
      const w  = trackWRef.current;
      const nx = Math.max(minRef.current + HANDLE, Math.min(startMax.current + gs.dx, w));
      maxRef.current = nx;
      maxAnim.setValue(nx);
      const val = p2v(nx, w);
      setDisplayMax(val);
      onChangeMax(val);
    },
  })).current;

  const minLabel = `$${displayMin.toLocaleString()}`;
  const maxLabel = displayMax >= PRICE_ABSOLUTE_MAX ? '$5K+' : `$${displayMax.toLocaleString()}`;

  return (
    <View style={{ paddingVertical: 8 }}>
      {/* Live range labels */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 20 }}>
        <Text style={sliderS.rangeLabel}>{minLabel}</Text>
        <Text style={sliderS.rangeSep}>–</Text>
        <Text style={sliderS.rangeLabel}>{maxLabel}</Text>
      </View>

      {/* Track + handles */}
      <View style={{ paddingHorizontal: HANDLE / 2 }}>
        <View
          style={{ height: HANDLE + 8, justifyContent: 'center' }}
          onLayout={handleLayout}
        >
          {/* Grey base track */}
          <View style={{ height: TRACK_H, backgroundColor: '#E8E8E8', borderRadius: TRACK_H / 2 }} />
          {/* Blue active segment */}
          <Animated.View style={{
            position: 'absolute',
            height: TRACK_H,
            backgroundColor: TC.primary,
            borderRadius: TRACK_H / 2,
            left: minAnim,
            width: activeWidth,
          }} />
          {/* Min handle */}
          <Animated.View
            style={[sliderS.handle, {
              transform: [{ translateX: Animated.subtract(minAnim, HANDLE / 2) }],
            }]}
            {...minPan.panHandlers}
          />
          {/* Max handle */}
          <Animated.View
            style={[sliderS.handle, {
              transform: [{ translateX: Animated.subtract(maxAnim, HANDLE / 2) }],
            }]}
            {...maxPan.panHandlers}
          />
        </View>
      </View>

      {/* Tick labels */}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 12, paddingHorizontal: 2 }}>
        {['$0', '$1K', '$2K', '$3K', '$4K', '$5K+'].map(t => (
          <Text key={t} style={sliderS.tick}>{t}</Text>
        ))}
      </View>
    </View>
  );
}

const sliderS = StyleSheet.create({
  handle: {
    position: 'absolute',
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: TC.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },
  rangeLabel: { fontSize: 22, fontWeight: '700', color: TC.textPrimary, fontFamily: 'Geist_700Bold', letterSpacing: -0.5 },
  rangeSep:   { fontSize: 16, fontWeight: '400', color: TC.textTertiary, fontFamily: 'Geist_400Regular' },
  tick:       { fontSize: 11, fontWeight: '500', color: '#B0B0B0', fontFamily: 'Geist_500Medium' },
});

// ── Search engine ──────────────────────────────────────────────────────────────

// Map room keys from HomeScreen nav to equivalent roomType values in designs data
const ROOM_FILTER_ALIASES = {
  'dorm': ['bedroom', 'office'],   // dorm rooms → show bedroom + office designs
  'outdoor': ['outdoor'],
};

function searchAndFilter(designs, query, categoryIndex, roomTypeFilter, styleFilter) {
  const raw = query.trim().toLowerCase().replace(/^#/, '');

  // Step 1: roomType filter (from route params)
  let pool = designs;
  if (roomTypeFilter) {
    const rt = roomTypeFilter.toLowerCase();
    const aliases = ROOM_FILTER_ALIASES[rt];
    if (aliases) {
      // Use alias mapping for room types not present in seed data (e.g. 'dorm')
      pool = pool.filter((d) => {
        const dRoom = (d.roomType || '').toLowerCase();
        return aliases.some(a => dRoom === a || dRoom.includes(a));
      });
    } else {
      pool = pool.filter((d) => {
        const dRoom = (d.roomType || '').toLowerCase();
        // Match 'living-room' → 'living', 'bedroom' → 'bedroom', etc.
        return dRoom === rt ||
          dRoom === rt.replace('-room', '') ||
          rt.replace('-room', '') === dRoom.replace('-room', '') ||
          (d.tags || []).some(t => t.toLowerCase().includes(rt.replace('-room', '')));
      });
    }
  }

  // Step 2: style filter (from route params or chip selection)
  if (styleFilter) {
    pool = pool.filter((d) => (d.styles || []).includes(styleFilter));
  }

  // Step 3: category filter (existing tab pills)
  const keywords = CATEGORY_KEYWORDS[categoryIndex] ?? [];
  if (categoryIndex !== 0) {
    pool = pool.filter((d) => {
      const haystack = [d.title, d.description, ...(d.tags || [])].join(' ').toLowerCase();
      return keywords.some((kw) => haystack.includes(kw));
    });
  }

  // Step 4: if no text query return filtered pool sorted by likes
  if (!raw) return pool.sort((a, b) => b.likes - a.likes);

  // Step 5: score by text relevance
  const scored = pool.map((d) => {
    let score = 0;
    const titleLower = d.title.toLowerCase();
    const descLower  = d.description.toLowerCase();
    const userLower  = d.user.toLowerCase();

    if (titleLower.includes(raw)) score += 4;

    (d.tags || []).forEach((tag) => {
      const clean = tag.toLowerCase().replace(/^#/, '');
      if (clean === raw)            score += 4;
      else if (clean.includes(raw)) score += 2;
    });

    if (descLower.includes(raw)) score += 2;

    (d.products || []).forEach((p) => {
      if ((p.name || '').toLowerCase().includes(raw))  score += 2;
      if ((p.brand || '').toLowerCase().includes(raw)) score += 1;
    });

    if (userLower.includes(raw)) score += 1;

    // Style/room match bonus
    if ((d.styles || []).some(s => s.includes(raw))) score += 3;
    if ((d.roomType || '').includes(raw)) score += 2;

    score *= 1 + d.likes / 1000;
    return { design: d, score };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.design);
}

// ── Grid card with press-scale + animated heart ────────────────────────────────

const GridCard = React.memo(function GridCard({ design, onPress, cardRadius, isLiked, onToggleLike, onShare, cols = 1 }) {
  const r = cardRadius ?? radius.md;
  const isSingle = cols === 1;

  // 2-col / 3-col: image only, no user row
  if (!isSingle) {
    return (
      <PressableCard
        style={[styles.card, { borderRadius: r }]}
        animStyle={{ width: '100%' }}
        onPress={onPress}
        activeOpacity={0.95}
      >
        <View style={[styles.cardImg, { borderRadius: r }]}>
          <View style={styles.cardImgBg} />
          <CardImage uri={design.imageUrl} style={styles.cardImgPhoto} resizeMode="cover" />
        </View>
      </PressableCard>
    );
  }

  // 1-col: image + user row + action icons
  const displayUser = design.user || 'HomeGenie User';
  const displayInitial = design.initial || displayUser.charAt(0).toUpperCase();
  return (
    <View style={[styles.feedCard, { borderRadius: r }]}>
      <PressableCard
        style={[styles.card, { borderTopLeftRadius: r, borderTopRightRadius: r, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}
        animStyle={{ width: '100%' }}
        onPress={onPress}
        activeOpacity={0.95}
      >
        <View style={[styles.cardImg, { borderTopLeftRadius: r, borderTopRightRadius: r, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 }]}>
          <View style={styles.cardImgBg} />
          <CardImage uri={design.imageUrl} style={styles.cardImgPhoto} resizeMode="cover" />
        </View>
      </PressableCard>
      <View style={styles.feedUserRow}>
        <TouchableOpacity style={styles.feedUserInfo} activeOpacity={0.7} onPress={onPress}>
          <View style={styles.feedAvatar}>
            <Text style={styles.feedAvatarText}>{displayInitial}</Text>
          </View>
          <Text style={styles.feedUsername} numberOfLines={1}>@{displayUser}</Text>
        </TouchableOpacity>
        <View style={styles.feedActions}>
          <TouchableOpacity
            style={[styles.feedActionBtn, isLiked && styles.feedActionBtnActive]}
            onPress={onToggleLike}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <HeartIcon filled={isLiked} size={16} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.feedActionBtn}
            onPress={onShare}
            activeOpacity={0.7}
            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          >
            <Svg width={16} height={16} viewBox="0 0 30 30" fill="none">
              <Path d="M6.54815 18.5147C7.04668 20.3752 8.1452 22.0193 9.67334 23.1918C11.2015 24.3644 13.0738 25 15 25C16.9262 25 18.7985 24.3644 20.3267 23.1918C21.8548 22.0193 22.9533 20.3752 23.4519 18.5147" stroke="#9CA3AF" strokeWidth={1.2} strokeLinecap="round" />
              <Path d="M15 5L14.6877 4.60957L15 4.35969L15.3123 4.60957L15 5ZM15.5 16.25C15.5 16.5261 15.2761 16.75 15 16.75C14.7239 16.75 14.5 16.5261 14.5 16.25L15 16.25L15.5 16.25ZM8.75 10L8.43765 9.60957L14.6877 4.60957L15 5L15.3123 5.39043L9.06235 10.3904L8.75 10ZM15 5L15.3123 4.60957L21.5623 9.60957L21.25 10L20.9377 10.3904L14.6877 5.39043L15 5ZM15 5L15.5 5L15.5 16.25L15 16.25L14.5 16.25L14.5 5L15 5Z" fill="#9CA3AF" />
            </Svg>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
});

// ── Style label map ──────────────────────────────────────────────────────────
const STYLE_LABEL_MAP = {
  minimalist: 'Minimalist', scandi: 'Scandi', bohemian: 'Boho',
  luxury: 'Luxury', japandi: 'Japandi', 'mid-century': 'Mid-Century',
  'dark-luxe': 'Dark Luxe', farmhouse: 'Farmhouse', biophilic: 'Biophilic',
  glam: 'Glam', rustic: 'Rustic', coastal: 'Coastal', retro: 'Retro',
  'wabi-sabi': 'Wabi-Sabi', industrial: 'Industrial',
  'french-country': 'French Country', 'art-deco': 'Art Deco', transitional: 'Transitional',
};

const ROOM_LABEL_MAP = {
  'living-room': 'Living Room', bedroom: 'Bedroom', kitchen: 'Kitchen',
  'dining-room': 'Dining Room', office: 'Office', outdoor: 'Outdoor',
  bathroom: 'Bathroom', entryway: 'Entryway', 'kids-room': 'Kids Room',
  nursery: 'Nursery', dorm: 'Dorms',
};

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ExploreScreen({ navigation, route }) {
  const { user } = useAuth();
  const { liked, toggleLiked } = useLiked();
  // onboarding hooks kept for potential future use
  const _onboarding = useOnboarding();
  const [activeTab, setActiveTab] = useState('wishes'); // 'wishes' | 'products'
  const [activeCategory, setActiveCategory] = useState(0);
  const [activeProdCat, setActiveProdCat] = useState(0);
  // Progressive render for Products grid — start small, load more in chunks
  const [productsVisibleCount, setProductsVisibleCount] = useState(24);
  const [search, setSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [gridCols, setGridCols] = useState(2);
  const approxCardWidth = width / gridCols;
  // Cap at 12px (radius.md) so 1-col cards don't over-curve
  const cardRadius = Math.min(Math.round(approxCardWidth * (gridCols === 3 ? 0.025 : 0.05)), 12);
  const cycleGrid = () => setGridCols(c => c === 3 ? 1 : c + 1);
  const [selectedTags, setSelectedTags] = useState(['#Minimalist']);

  // ── Incoming filter state from navigation params ─────────────────────────
  const [activeRoomFilter, setActiveRoomFilter] = useState(null);
  const [activeStyleFilter, setActiveStyleFilter] = useState(null);
  const [filterLabel, setFilterLabel] = useState(null);
  const [overrideDesigns, setOverrideDesigns] = useState(null);
  const [overrideProducts, setOverrideProducts] = useState(null); // IDs from "Shop all" featured navigation
  const [communityDesigns, setCommunityDesigns] = useState([]);
  const [communityLoading, setCommunityLoading] = useState(true);
  const consumedParamsRef = useRef(null);
  // Read route params via ref so useFocusEffect callback stays stable (no deps).
  // Assigning during render (not useEffect) ensures the ref is always current
  // before any effect fires, eliminating the "re-run while focused" freeze.
  const routeParamsRef = useRef(route?.params);
  routeParamsRef.current = route?.params;

  // ── Product filter state ───────────────────────────────────────────────────
  const [showFilterSheet, setShowFilterSheet] = useState(false);
  const [priceMin, setPriceMin] = useState(PRICE_ABSOLUTE_MIN);
  const [priceMax, setPriceMax] = useState(PRICE_ABSOLUTE_MAX);
  const [filterStyles, setFilterStyles] = useState([]);
  // Source filter removed — Amazon-only for now
  const [filterInStockOnly, setFilterInStockOnly] = useState(false);
  const [filterRoomTypes, setFilterRoomTypes] = useState([]);
  const [filterMinRating, setFilterMinRating] = useState(0);
  const [productSort, setProductSort] = useState('best_match');
  // Wish-specific filters
  const [wishSort, setWishSort] = useState('most_popular');
  const [wishFilterStyles, setWishFilterStyles] = useState([]);
  const [wishFilterRoomTypes, setWishFilterRoomTypes] = useState([]);
  const [showSortPicker, setShowSortPicker] = useState(false);
  const [aiImageLoading, setAiImageLoading] = useState(false);
  const [aiImageProducts, setAiImageProducts] = useState(null);

  // No tab-switch animation — previously used opacity fade + deferred render,
  // but the opacity-to-0 + setTimeout + re-render + fade-in chain added ~500ms
  // of "invisible content" that looked like lag. Instant swap is snappier.

  // Apply params on every focus (handles tab-switch AND fresh navigation).
  // Stable callback (no deps) prevents useFocusEffect from re-running mid-render
  // when route.params changes, which was causing navigation freeze.
  useFocusEffect(
    useCallback(() => {
      const params = routeParamsRef.current;
      if (!params || params === consumedParamsRef.current) return;
      consumedParamsRef.current = params;

      // Clear previous filters before applying new ones
      setActiveRoomFilter(null);
      setActiveStyleFilter(null);
      setOverrideDesigns(null);
      setOverrideProducts(null);
      setActiveCategory(0);
      setSearch('');

      if (params.featuredProductIds) {
        setActiveTab('products');
        setOverrideProducts(params.featuredProductIds);
        setFilterLabel(params.title || 'Featured');
      } else if (params.filterRoomType) {
        setActiveRoomFilter(params.filterRoomType);
        setFilterLabel(params.title || ROOM_LABEL_MAP[params.filterRoomType] || params.filterRoomType);
      } else if (params.filterStyle) {
        setActiveStyleFilter(params.filterStyle);
        setFilterLabel(params.title || STYLE_LABEL_MAP[params.filterStyle] || params.filterStyle);
      } else if (params.designs) {
        setOverrideDesigns(params.designs);
        setFilterLabel(params.title || null);
      } else if (params.filterQuery) {
        // Pre-fill the search bar from home search
        setSearch(params.filterQuery);
        setFilterLabel(params.title || params.filterQuery);
      } else if (params.title) {
        setFilterLabel(params.title);
      }
    }, []),
  );

  const clearFilters = useCallback(() => {
    setActiveRoomFilter(null);
    setActiveStyleFilter(null);
    setOverrideDesigns(null);
    setOverrideProducts(null);
    setFilterLabel(null);
    setActiveCategory(0);
    setSearch('');
    // Reset route params so next navigation can apply fresh ones
    navigation.setParams({
      filterRoomType: undefined,
      filterStyle: undefined,
      designs: undefined,
      filterQuery: undefined,
      featuredProductIds: undefined,
      mode: undefined,
      title: undefined,
    });
    consumedParamsRef.current = null;
  }, [navigation]);

  const clearProductFilters = useCallback(() => {
    setPriceMin(PRICE_ABSOLUTE_MIN);
    setPriceMax(PRICE_ABSOLUTE_MAX);
    setFilterStyles([]);
    setFilterInStockOnly(false);
    setFilterRoomTypes([]);
    setFilterMinRating(0);
    setProductSort('best_match');
  }, []);

  const clearWishFilters = useCallback(() => {
    setWishSort('most_popular');
    setWishFilterStyles([]);
    setWishFilterRoomTypes([]);
  }, []);

  const clearAllFilters = useCallback(() => {
    if (activeTab === 'products') clearProductFilters();
    else clearWishFilters();
  }, [activeTab, clearProductFilters, clearWishFilters]);

  const activeProductFilterCount = [
    priceMin > PRICE_ABSOLUTE_MIN || priceMax < PRICE_ABSOLUTE_MAX,
    filterStyles.length > 0,
    filterInStockOnly,
    filterRoomTypes.length > 0,
    filterMinRating > 0,
    productSort !== 'best_match',
  ].filter(Boolean).length;

  const activeWishFilterCount = [
    wishFilterStyles.length > 0,
    wishFilterRoomTypes.length > 0,
    wishSort !== 'most_popular',
  ].filter(Boolean).length;

  const activeFilterCount = activeTab === 'products' ? activeProductFilterCount : activeWishFilterCount;

  const handleAiImageFilter = useCallback(async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission Required', 'Please allow photo library access in Settings.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.6,
      base64: false,
    });
    if (result.canceled || !result.assets?.length) return;
    setAiImageLoading(true);
    setShowFilterSheet(false);
    try {
      const products = await getProductsForPrompt(result.assets[0].uri);
      setAiImageProducts(products?.length ? products : null);
      if (!products?.length) {
        Alert.alert('No Matches', 'Could not find products for this photo. Try another image.');
      }
    } catch {
      Alert.alert('Photo Search', 'Something went wrong. Please try again.');
    } finally {
      setAiImageLoading(false);
    }
  }, []);

  // Fetch community (user-posted) designs on screen focus (with 5-min cache)
  const lastCommunityFetch = useRef(0);
  const COMMUNITY_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
  useFocusEffect(
    useCallback(() => {
      const now = Date.now();
      if (communityDesigns.length > 0 && now - lastCommunityFetch.current < COMMUNITY_CACHE_TTL) return;
      lastCommunityFetch.current = now;
      setCommunityLoading(true);

      // Safety net: after 8s stop showing the skeleton — show empty state instead
      const fetchTimeoutId = setTimeout(() => {
        setCommunityLoading(false);
      }, 8000);

      getPublicDesigns(20, 0).then(designs => {
        clearTimeout(fetchTimeoutId);
        const normalized = designs.map(d => {
          // Parse room type from the prompt so the fallback product matcher
          // picks the right category (instead of always defaulting to living-room)
          const parsed = d.prompt ? parseDesignPrompt(d.prompt) : {};
          return {
            id: `user-${d.id}`,
            title: d.prompt || 'AI Generated Design',
            user: d.author?.username || d.author?.full_name || 'HomeGenie User',
            initial: (d.author?.full_name || 'U')[0],
            verified: d.author?.is_verified_supplier || false,
            imageUrl: d.image_url,
            description: d.prompt,
            prompt: d.prompt,
            roomType: parsed.roomType || 'living-room',
            styles: d.style_tags?.length ? d.style_tags : (parsed.styles || []),
            products: d.products || [],
            tags: (d.style_tags || []).map(s => `#${s}`),
            likes: d.likes || 0,
            shares: 0,
            isUserDesign: true,
          };
        }).filter(d => !!d.imageUrl);
        console.log('[Explore] Loaded', normalized.length, 'community designs');
        // Fallback to local seed designs if Supabase returned nothing
        setCommunityDesigns(normalized.length > 0 ? normalized : LOCAL_DESIGNS);
      }).catch(err => {
        clearTimeout(fetchTimeoutId);
        console.warn('[Explore] Failed to load community designs:', err.message);
        // Use local seed designs as graceful fallback
        setCommunityDesigns(LOCAL_DESIGNS);
      }).finally(() => {
        clearTimeout(fetchTimeoutId);
        setCommunityLoading(false);
      });

      return () => clearTimeout(fetchTimeoutId);
    }, [])
  );

  // filterLabel is set when any param-driven filter is active (room, style, designs, or query)
  const hasActiveFilter = !!(activeRoomFilter || activeStyleFilter || overrideDesigns || overrideProducts || filterLabel);

  const togglePostTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  // CRITICAL: do NOT spread communityDesigns — a new array ref on every render
  // would invalidate the filteredDesigns useMemo cache, causing expensive
  // searchAndFilter scoring to re-run on every single render.
  const baseDesigns = overrideDesigns || communityDesigns;

  const filteredDesigns = useMemo(() => {
    let pool = searchAndFilter(baseDesigns, search, activeCategory, activeRoomFilter, activeStyleFilter);
    // Apply wish-specific filters from filter sheet
    if (wishFilterStyles.length > 0) {
      pool = pool.filter((d) => (d.styles || []).some((s) => wishFilterStyles.includes(s)));
    }
    if (wishFilterRoomTypes.length > 0) {
      pool = pool.filter((d) => wishFilterRoomTypes.includes(d.roomType));
    }
    // Sort
    if (wishSort === 'newest') {
      // Reverse the default order — newest (highest id or most recently created) first
      pool = [...pool].reverse();
    }
    // 'most_popular' is already the default sort from searchAndFilter (by likes)
    return pool;
  }, [search, activeCategory, activeRoomFilter, activeStyleFilter, baseDesigns, wishFilterStyles, wishFilterRoomTypes, wishSort]);

  // Reset progressive render when the pool changes (tab/category/search/filter/sort)
  useEffect(() => {
    setProductsVisibleCount(24);
  }, [activeTab, activeProdCat, search, productSort, filterRoomTypes, filterMinRating]);

  const filteredProducts = useMemo(() => {
    let pool;
    if (overrideProducts) {
      const idSet = new Set(overrideProducts);
      pool = PRODUCT_CATALOG.filter(p => idSet.has(p.id));
    } else {
      const catLabel = PRODUCT_CATEGORIES[activeProdCat];
      const cats = PRODUCT_CAT_MAP[catLabel];
      pool = cats ? PRODUCT_CATALOG.filter((p) => cats.includes(p.category)) : PRODUCT_CATALOG;
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      pool = pool.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        (p.styles || []).some((s) => s.includes(q))
      );
    }
    if (priceMin > PRICE_ABSOLUTE_MIN || priceMax < PRICE_ABSOLUTE_MAX) {
      pool = pool.filter((p) => p.price >= priceMin && p.price <= priceMax);
    }
    if (filterStyles.length > 0) {
      pool = pool.filter((p) => (p.styles || []).some((s) => filterStyles.includes(s)));
    }
    if (filterInStockOnly) {
      pool = pool.filter((p) => p.stock !== false);
    }
    if (filterRoomTypes.length > 0) {
      pool = pool.filter((p) => filterRoomTypes.includes(p.roomType));
    }
    if (filterMinRating > 0) {
      pool = pool.filter((p) => (p.rating || 0) >= filterMinRating);
    }
    // Sort
    switch (productSort) {
      case 'price_low':
        pool = [...pool].sort((a, b) => (a.price || 0) - (b.price || 0));
        break;
      case 'price_high':
        pool = [...pool].sort((a, b) => (b.price || 0) - (a.price || 0));
        break;
      case 'top_rated':
        pool = [...pool].sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case 'most_reviewed':
        pool = [...pool].sort((a, b) => (b.reviewCount || 0) - (a.reviewCount || 0));
        break;
      case 'newest':
        pool = [...pool].reverse();
        break;
      default: // best_match — keep current order
        break;
    }
    return pool;
  }, [overrideProducts, activeProdCat, search, priceMin, priceMax, filterStyles, filterInStockOnly, filterRoomTypes, filterMinRating, productSort]);

  // Progressively reveal more products after initial paint (chunks of 30)
  // Keeps the Products tab opening fast — first 24 render instantly,
  // remaining stream in at 100ms intervals without blocking interaction.
  useEffect(() => {
    if (activeTab !== 'products') return;
    if (productsVisibleCount >= filteredProducts.length) return;
    const timer = setTimeout(() => {
      setProductsVisibleCount(c => Math.min(c + 30, filteredProducts.length));
    }, 100);
    return () => clearTimeout(timer);
  }, [activeTab, productsVisibleCount, filteredProducts.length]);

  // Slice applied at render time — stays stable until productsVisibleCount changes
  const visibleProducts = useMemo(
    () => filteredProducts.slice(0, productsVisibleCount),
    [filteredProducts, productsVisibleCount],
  );

  // ── Auth wall — show full Auth screen inline if not signed in ──────────────
  if (!user) {
    const AuthScreen = require('./AuthScreen').default;
    return <AuthScreen navigation={navigation} />;
  }

  return (
    <TabScreenFade style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          onScrollBeginDrag={() => showSortPicker && setShowSortPicker(false)}
        >
          {/* ── Header ── */}
          <Text style={styles.title}>{filterLabel && hasActiveFilter ? filterLabel : 'Explore'}</Text>
          <Text style={styles.subtitle}>
            {activeTab === 'products'
              ? `${filteredProducts.length} curated product${filteredProducts.length !== 1 ? 's' : ''}`
              : hasActiveFilter
                ? `${filteredDesigns.length} AI-generated wish${filteredDesigns.length !== 1 ? 'es' : ''}`
                : 'Browse AI-Generated Room Wishes'}
          </Text>

          {/* ── Search Row ── */}
          <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              {/* Left: sliders/filter icon */}
              <TouchableOpacity
                style={styles.searchIconBtn}
                onPress={() => setShowFilterSheet(true)}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <SlidersIcon size={17} color={activeFilterCount > 0 ? TC.primary : '#999'} />
                {activeFilterCount > 0 && (
                  <View style={styles.filterBadge}>
                    <Text style={styles.filterBadgeText}>{activeFilterCount}</Text>
                  </View>
                )}
              </TouchableOpacity>
              {/* Center: text input */}
              <TextInput
                style={styles.searchInput}
                placeholder="Search designs, styles, rooms..."
                placeholderTextColor="#AAA"
                value={search}
                onChangeText={setSearch}
              />
              {/* Right: clear X or search icon */}
              {search.length > 0 ? (
                <TouchableOpacity style={styles.searchSubmit} onPress={() => { setSearch(''); Keyboard.dismiss(); }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                  <CloseIcon size={14} />
                </TouchableOpacity>
              ) : (
                <View style={styles.searchIconRight}>
                  <SearchIcon color="#BBB" size={16} />
                </View>
              )}
            </View>
          </View>

          {/* ── Wishes / Products toggle ── */}
          <View style={styles.modeToggleRow}>
            <TouchableOpacity
              style={[styles.modeToggleBtn, activeTab === 'wishes' && styles.modeToggleBtnActive]}
              onPress={() => { setActiveTab('wishes'); setShowSortPicker(false); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeToggleLabel, activeTab === 'wishes' && styles.modeToggleLabelActive]}>
                Wishes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeToggleBtn, activeTab === 'products' && styles.modeToggleBtnActive]}
              onPress={() => { setActiveTab('products'); setShowSortPicker(false); }}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeToggleLabel, activeTab === 'products' && styles.modeToggleLabelActive]}>
                Products
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Category Filter + Grid Toggle ── */}
          <View style={styles.tabsRow}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.tabsScroll}
              contentContainerStyle={styles.tabsContent}
            >
              {(activeTab === 'products' ? PRODUCT_CATEGORIES : CATEGORIES).map((cat, i) => {
                const isActive = activeTab === 'products' ? activeProdCat === i : activeCategory === i;
                return (
                  <TouchableOpacity
                    key={cat}
                    style={[styles.tab, isActive && styles.tabActive]}
                    onPress={() => activeTab === 'products' ? setActiveProdCat(i) : setActiveCategory(i)}
                    activeOpacity={0.75}
                  >
                    <Text style={[styles.tabLabel, isActive && styles.tabLabelActive]}>
                      {cat}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <TouchableOpacity style={styles.gridToggleBtn} onPress={cycleGrid} activeOpacity={0.7}>
              <GridLayoutIcon cols={gridCols} />
            </TouchableOpacity>
          </View>
          <View style={styles.tabBorder} />

          {/* ── Sort Row ── */}
          <View style={styles.sortRow}>
            <TouchableOpacity
              style={styles.sortTouchable}
              onPress={() => setShowSortPicker(v => !v)}
              activeOpacity={0.6}
            >
              <Text style={styles.sortLabel}>Sort by</Text>
              <Text style={[
                styles.sortValue,
                (activeTab === 'products' ? productSort !== 'best_match' : wishSort !== 'most_popular') && styles.sortValueActive,
              ]}>
                {activeTab === 'products'
                  ? (PRODUCT_SORT_OPTIONS.find(o => o.key === productSort)?.label ?? 'Best Match')
                  : (WISH_SORT_OPTIONS.find(o => o.key === wishSort)?.label ?? 'Most Popular')
                }
              </Text>
              <ChevDown size={10} color="#999" />
            </TouchableOpacity>
            <Text style={styles.sortCount}>
              {activeTab === 'products'
                ? `${filteredProducts.length} result${filteredProducts.length !== 1 ? 's' : ''}`
                : `${filteredDesigns.length} result${filteredDesigns.length !== 1 ? 's' : ''}`
              }
            </Text>
          </View>

          {/* ── Sort Picker Dropdown ── */}
          {showSortPicker && (
            <View style={styles.sortDropdown}>
              {(activeTab === 'products' ? PRODUCT_SORT_OPTIONS : WISH_SORT_OPTIONS).map((opt, idx, arr) => {
                const isActive = activeTab === 'products' ? productSort === opt.key : wishSort === opt.key;
                return (
                  <TouchableOpacity
                    key={opt.key}
                    style={[styles.sortOption, idx === arr.length - 1 && { borderBottomWidth: 0 }]}
                    onPress={() => {
                      if (activeTab === 'products') setProductSort(opt.key);
                      else setWishSort(opt.key);
                      setShowSortPicker(false);
                    }}
                    activeOpacity={0.6}
                  >
                    <Text style={[styles.sortOptionText, isActive && styles.sortOptionTextActive]}>
                      {opt.label}
                    </Text>
                    {isActive && (
                      <Svg width={14} height={14} viewBox="0 0 24 24" fill="none"
                        stroke={TC.primary} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                        <Polyline points="20 6 9 17 4 12" />
                      </Svg>
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* ── Tab content — instant swap, no fade animation ── */}
          <View>

          {/* ── Active Filter Banner ── */}
          {hasActiveFilter && (
            <View style={styles.filterBanner}>
              <View style={styles.filterBannerLeft}>
                {filterLabel && (
                  <Text style={styles.filterBannerTitle} numberOfLines={1}>{filterLabel}</Text>
                )}
                <Text style={styles.filterBannerCount}>
                  {activeTab === 'products'
                    ? `${filteredProducts.length} product${filteredProducts.length !== 1 ? 's' : ''}`
                    : `${filteredDesigns.length} wish${filteredDesigns.length !== 1 ? 'es' : ''}`}
                </Text>
              </View>
              <TouchableOpacity style={styles.filterClearBtn} onPress={clearFilters} activeOpacity={0.7}>
                <Text style={styles.filterClearText}>✕  Clear</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── Grid ── */}
          {activeTab === 'products' ? (
            filteredProducts.length === 0 ? (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateTitle}>No products found</Text>
                <Text style={styles.emptyStateSub}>Try a different category or search</Text>
              </View>
            ) : (
              <View style={[styles.grid, gridCols === 1 && { paddingHorizontal: 10 }]}>
                {visibleProducts.map((product) => {
                  const ratingVal = typeof product.rating === 'number' ? product.rating : parseFloat(product.rating) || 0;
                  const navProduct = { ...product, price: product.priceDisplay, priceValue: product.price, source: product.source };
                  const isOnCol = gridCols === 1;
                  return (
                    <View key={product.id} style={{ width: colWidthPct(gridCols), padding: isOnCol ? 5 : 1 }}>
                      <TouchableOpacity
                        style={[styles.card, { borderRadius: cardRadius }, isOnCol && styles.cardSingle]}
                        activeOpacity={0.88}
                        onPress={() => navigation?.navigate('ProductDetail', { product: navProduct })}
                      >
                        <View style={[styles.cardImg, {
                          borderTopLeftRadius: cardRadius,
                          borderTopRightRadius: cardRadius,
                          // No bottom radius when card body sits below — prevents background gap
                          borderBottomLeftRadius: gridCols === 3 ? cardRadius : 0,
                          borderBottomRightRadius: gridCols === 3 ? cardRadius : 0,
                          aspectRatio: 1,
                        }]}>
                          <View style={styles.cardImgBg} />
                          <CardImage uri={product.imageUrl} style={styles.cardImgPhoto} resizeMode="cover" />
                        </View>
                        {/* 2-col: white info card; 3-col: image only; 1-col: generous info card */}
                        {gridCols !== 3 && (
                          <View style={[styles.prodCardBody, isOnCol && styles.prodCardBodySingle]}>
                            <Text style={[styles.prodCardName, isOnCol && styles.prodCardNameSingle]} numberOfLines={2}>{product.name}</Text>
                            <Text style={styles.prodCardBrand}>{product.brand}</Text>
                            {ratingVal > 0 && (
                              <View style={styles.prodCardRating}>
                                {[1,2,3,4,5].map(i => (
                                  <StarIconSmall key={i} size={isOnCol ? 12 : 10} filled={i <= Math.round(ratingVal)} />
                                ))}
                                <Text style={styles.prodCardRatingText}>{ratingVal.toFixed(1)}</Text>
                                {!!product.reviewCount && (
                                  <Text style={styles.prodCardReviews}>({product.reviewCount.toLocaleString()})</Text>
                                )}
                              </View>
                            )}
                            <Text style={[styles.prodCardPrice, isOnCol && styles.prodCardPriceSingle]}>{product.priceDisplay}</Text>
                          </View>
                        )}
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>
            )
          ) : communityLoading && filteredDesigns.length === 0 ? (
            <View style={[styles.grid, { paddingHorizontal: SP[5], paddingTop: SP[4] }]}>
              {[0,1,2,3,4,5].map(i => (
                <View key={i} style={{ width: colWidthPct(gridCols), padding: 1 }}>
                  <Skeleton width="100%" height={160} radius="image" />
                </View>
              ))}
            </View>
          ) : filteredDesigns.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No results found</Text>
              <Text style={styles.emptyStateSub}>
                Try a different keyword, tag, or category
              </Text>
            </View>
          ) : (
            <View style={[styles.grid, gridCols === 1 && { paddingHorizontal: space.lg }]}>
              {filteredDesigns.map((design) => (
                <View key={design.id} style={{ width: colWidthPct(gridCols), padding: gridCols === 1 ? 0 : 1, marginBottom: gridCols === 1 ? space.lg : 0 }}>
                  <GridCard
                    design={design}
                    cardRadius={cardRadius}
                    cols={gridCols}
                    isLiked={liked[design.id?.replace?.('user-', '')] || liked[design.id]}
                    onToggleLike={() => toggleLiked(design.id)}
                    onShare={async () => {
                      try {
                        const msg = design.prompt
                          ? `Check out this HomeGenie design: "${design.prompt}"`
                          : 'Check out this HomeGenie wish!';
                        await Share.share({ message: msg, url: design.imageUrl || '' });
                      } catch {}
                    }}
                    onPress={() => {
                      // Navigate immediately — ShopTheLookScreen handles fallback product matching
                      navigation.navigate('ShopTheLook', { design });
                    }}
                  />
                </View>
              ))}
            </View>
          )}

          <View style={{ height: space.lg }} />
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* ══════════════════════════════
          CARD DETAIL MODAL — Section 3 Post Detail Drawer
      ══════════════════════════════ */}
      <Modal
        visible={selectedCard !== null}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedCard(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setSelectedCard(null)}
          />
          {selectedCard && (
            <View style={styles.modalSheet}>
              {/* 3A: Handle bar */}
              <View style={styles.modalDrag} />

              {/* 3B: Close button — 40×40 circle with surface background */}
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedCard(null)}
                accessibilityLabel="Close drawer"
              >
                <CloseIcon size={14} />
              </TouchableOpacity>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalScrollContent}
              >
                {/* Post image — natural aspect ratio */}
                <AutoImage
                  uri={selectedCard.imageUrl}
                  borderRadius={MODAL_IMG_RADIUS}
                  style={{ marginBottom: SP[4] }}
                />

                {/* 3B: Seller header row — tap to visit profile */}
                <TouchableOpacity
                  style={styles.modalUserRow}
                  activeOpacity={0.75}
                  onPress={() => {
                    setSelectedCard(null);
                    navigation?.navigate('UserProfile', { username: selectedCard.user });
                  }}
                >
                  <View style={[styles.modalAvatar, selectedCard.verified && styles.modalAvatarVerified]}>
                    <Text style={styles.modalAvatarText}>{selectedCard.initial}</Text>
                  </View>
                  <View style={styles.modalUserInfo}>
                    <SellerName
                      name={`@${selectedCard.user}`}
                      isVerified={!!selectedCard.verified}
                      size="sm"
                      nameStyle={styles.modalUsername}
                    />
                    <Text style={styles.modalTime}>Tap to view profile</Text>
                  </View>
                  {/* Follow button — logic unchanged */}
                  <TouchableOpacity
                    style={styles.followBtn}
                    activeOpacity={0.75}
                    onPress={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <Text style={styles.followBtnText}>Follow</Text>
                  </TouchableOpacity>
                </TouchableOpacity>

                {/* 3C: Title + description */}
                <Text style={styles.modalTitle}>{selectedCard.title.replace('...', '')}</Text>
                <Text style={styles.modalDesc} numberOfLines={3}>{selectedCard.description}</Text>

                {/* 3D: SHOP ROOM — horizontal product cards */}
                <Text style={styles.sectionLabel}>SHOP ROOM</Text>

                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10, paddingRight: 20, paddingBottom: 4 }}
                >
                  {selectedCard.products.map((p, i) => (
                    <TouchableOpacity
                      key={i}
                      style={styles.hCard}
                      activeOpacity={0.7}
                      onPress={() => {
                        const card = selectedCard;
                        setSelectedCard(null);
                        navigation?.navigate('ProductDetail', { product: p, design: card });
                      }}
                    >
                      <View style={styles.hCardImgWrap}>
                        {p.imageUrl ? (
                          <CardImage
                            uri={p.imageUrl}
                            style={{ width: '100%', height: '100%' }}
                            resizeMode="cover"
                          />
                        ) : (
                          <ImagePlaceholderIcon />
                        )}
                      </View>
                      <View style={styles.hCardBody}>
                        <Text style={styles.hCardName} numberOfLines={2}>{p.name}</Text>
                        <Text style={styles.hCardBrand}>{p.brand}</Text>
                        {!!p.rating && (
                          <View style={styles.hCardRating}>
                            {[1,2,3,4,5].map(star => (
                              <StarIconSmall key={star} size={10} filled={star <= Math.round(p.rating)} />
                            ))}
                            <Text style={styles.hCardRatingText}>{p.rating.toFixed(1)}</Text>
                            {!!p.reviewCount && (
                              <Text style={styles.hCardReviews}>({p.reviewCount.toLocaleString()})</Text>
                            )}
                          </View>
                        )}
                        <Text style={styles.hCardPrice}>
                          {typeof p.priceValue === 'number'
                            ? `$${p.priceValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : typeof p.price === 'number'
                              ? `$${p.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : p.priceLabel || String(p.price).replace(/^\$+/, '$')}
                        </Text>
                      </View>
                      <View style={styles.hCardAddBtn}>
                        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.2}>
                          <Line x1={12} y1={5} x2={12} y2={19} />
                          <Line x1={5} y1={12} x2={19} y2={12} />
                        </Svg>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>


                {/* 3F: Tags */}
                <Text style={[styles.sectionLabel, { marginTop: SP[5] }]}>TAGS</Text>
                <View style={styles.tagsWrap}>
                  {selectedCard.tags.map((tag) => (
                    <View
                      key={tag}
                      style={[
                        styles.tag,
                        (tag === '#AIGenerated' || tag === '#ShopTheLook') && styles.tagHighlight,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tagText,
                          (tag === '#AIGenerated' || tag === '#ShopTheLook') && styles.tagTextHighlight,
                        ]}
                      >
                        {tag}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={{ height: SP[6] }} />
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>

      {/* ══════════════════════════════
          NEW POST MODAL
      ══════════════════════════════ */}
      <Modal
        visible={showPostModal}
        animationType="slide"
        transparent
        onRequestClose={() => setShowPostModal(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowPostModal(false)}
          />
          <View style={[styles.modalSheet, { maxHeight: '82%' }]}>
            {/* Drag handle */}
            <View style={styles.modalDrag} />
            {/* Header */}
            <View style={styles.postModalHeader}>
              <TouchableOpacity onPress={() => setShowPostModal(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <CloseIcon size={18} />
              </TouchableOpacity>
              <Text style={styles.postModalTitle}>New Post</Text>
              <TouchableOpacity style={styles.postShareBtn} onPress={() => setShowPostModal(false)} activeOpacity={0.75}>
                <Text style={styles.postShareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.postModalBody}
            >
              {/* Upload zone */}
              <TouchableOpacity style={styles.uploadZone} activeOpacity={0.75}>
                <UploadIcon />
                <Text style={styles.uploadLabel}>Upload your AI-generated room</Text>
                <Text style={styles.uploadSub}>Tap to choose from camera roll</Text>
              </TouchableOpacity>

              {/* Title */}
              <Text style={styles.fieldLabel}>TITLE</Text>
              <TextInput
                style={styles.fieldInput}
                placeholder="Give your space a name…"
                placeholderTextColor="#ccc"
              />

              {/* Description */}
              <Text style={styles.fieldLabel}>DESCRIPTION</Text>
              <TextInput
                style={[styles.fieldInput, styles.fieldTextarea]}
                placeholder="Share the prompt you used or describe the vibe…"
                placeholderTextColor="#ccc"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
              />

              {/* Tags */}
              <Text style={styles.fieldLabel}>TAGS</Text>
              <View style={styles.tagsWrap}>
                {POST_TAGS.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    style={[
                      styles.postTagChip,
                      selectedTags.includes(tag) && styles.postTagChipSelected,
                    ]}
                    onPress={() => togglePostTag(tag)}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.postTagChipText,
                        selectedTags.includes(tag) && styles.postTagChipTextSelected,
                      ]}
                    >
                      {tag}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={{ height: space.xl }} />
            </ScrollView>
          </View>
        </View>
      </Modal>
      {/* ══════════════════════════════
          TAB-AWARE FILTER SHEET
      ══════════════════════════════ */}
      <Modal
        visible={showFilterSheet}
        animationType="slide"
        transparent
        onRequestClose={() => setShowFilterSheet(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowFilterSheet(false)}
          />
          <View style={[styles.modalSheet, { maxHeight: '88%', flex: 0 }]}>
            <View style={styles.modalDrag} />

            {/* Header */}
            <View style={styles.filterSheetHeader}>
              <TouchableOpacity onPress={clearAllFilters} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <Text style={styles.filterSheetClearAll}>Reset</Text>
              </TouchableOpacity>
              <Text style={styles.filterSheetTitle}>Filter & Sort</Text>
              <TouchableOpacity onPress={() => setShowFilterSheet(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <CloseIcon size={16} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.filterSheetBody} keyboardShouldPersistTaps="handled">

              {/* ════════ PRODUCTS TAB FILTERS ════════ */}
              {activeTab === 'products' ? (
                <>
                  {/* ── Sort By ── */}
                  <Text style={styles.fsSectionTitle}>Sort by</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fsHScroll}>
                    {PRODUCT_SORT_OPTIONS.map((opt) => {
                      const on = productSort === opt.key;
                      return (
                        <TouchableOpacity key={opt.key} style={[styles.fsChip, on && styles.fsChipOn]} onPress={() => setProductSort(opt.key)} activeOpacity={0.6}>
                          <Text style={[styles.fsChipText, on && styles.fsChipTextOn]}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.fsDivider} />

                  {/* ── Budget ── */}
                  <Text style={styles.fsSectionTitle}>Budget</Text>
                  <PriceRangeSlider
                    minVal={priceMin}
                    maxVal={priceMax}
                    onChangeMin={setPriceMin}
                    onChangeMax={setPriceMax}
                  />
                  <View style={styles.fsDivider} />

                  {/* ── Room Type ── */}
                  <Text style={styles.fsSectionTitle}>Room</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fsHScroll}>
                    {FILTER_ROOM_TYPES.map((rt) => {
                      const on = filterRoomTypes.includes(rt);
                      return (
                        <TouchableOpacity key={rt} style={[styles.fsChip, on && styles.fsChipOn]} onPress={() => setFilterRoomTypes(prev => prev.includes(rt) ? prev.filter(x => x !== rt) : [...prev, rt])} activeOpacity={0.6}>
                          <Text style={[styles.fsChipText, on && styles.fsChipTextOn]}>{ROOM_LABEL_MAP[rt] || rt}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.fsDivider} />

                  {/* ── Style ── */}
                  <Text style={styles.fsSectionTitle}>Style</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fsHScroll}>
                    {FILTER_STYLES.map((s) => {
                      const on = filterStyles.includes(s);
                      return (
                        <TouchableOpacity key={s} style={[styles.fsChip, on && styles.fsChipOn]} onPress={() => setFilterStyles(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])} activeOpacity={0.6}>
                          <Text style={[styles.fsChipText, on && styles.fsChipTextOn]}>{STYLE_LABEL_MAP[s] || s}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.fsDivider} />

                  {/* ── Min Rating ── */}
                  <Text style={styles.fsSectionTitle}>Rating</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fsHScroll}>
                    {FILTER_RATINGS.map((r) => {
                      const on = filterMinRating === r;
                      return (
                        <TouchableOpacity key={r} style={[styles.fsChip, on && styles.fsChipOn]} onPress={() => setFilterMinRating(prev => prev === r ? 0 : r)} activeOpacity={0.6}>
                          <StarIconSmall size={11} filled amber />
                          <Text style={[styles.fsChipText, on && styles.fsChipTextOn]}>{r}+ stars</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.fsDivider} />

                  {/* ── In Stock Only ── */}
                  <View style={styles.fsToggleRow}>
                    <Text style={styles.fsToggleLabel}>In Stock Only</Text>
                    <Switch
                      value={filterInStockOnly}
                      onValueChange={setFilterInStockOnly}
                      trackColor={{ false: '#E5E7EB', true: TC.primary }}
                      thumbColor="#FFFFFF"
                    />
                  </View>
                </>
              ) : (
                /* ════════ WISHES TAB FILTERS ════════ */
                <>
                  {/* ── Sort By ── */}
                  <Text style={styles.fsSectionTitle}>Sort by</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fsHScroll}>
                    {WISH_SORT_OPTIONS.map((opt) => {
                      const on = wishSort === opt.key;
                      return (
                        <TouchableOpacity key={opt.key} style={[styles.fsChip, on && styles.fsChipOn]} onPress={() => setWishSort(opt.key)} activeOpacity={0.6}>
                          <Text style={[styles.fsChipText, on && styles.fsChipTextOn]}>{opt.label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.fsDivider} />

                  {/* ── Room Type ── */}
                  <Text style={styles.fsSectionTitle}>Room</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fsHScroll}>
                    {FILTER_ROOM_TYPES.map((rt) => {
                      const on = wishFilterRoomTypes.includes(rt);
                      return (
                        <TouchableOpacity key={rt} style={[styles.fsChip, on && styles.fsChipOn]} onPress={() => setWishFilterRoomTypes(prev => prev.includes(rt) ? prev.filter(x => x !== rt) : [...prev, rt])} activeOpacity={0.6}>
                          <Text style={[styles.fsChipText, on && styles.fsChipTextOn]}>{ROOM_LABEL_MAP[rt] || rt}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                  <View style={styles.fsDivider} />

                  {/* ── Style ── */}
                  <Text style={styles.fsSectionTitle}>Style</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.fsHScroll}>
                    {FILTER_STYLES.map((s) => {
                      const on = wishFilterStyles.includes(s);
                      return (
                        <TouchableOpacity key={s} style={[styles.fsChip, on && styles.fsChipOn]} onPress={() => setWishFilterStyles(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s])} activeOpacity={0.6}>
                          <Text style={[styles.fsChipText, on && styles.fsChipTextOn]}>{STYLE_LABEL_MAP[s] || s}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </>
              )}

              {/* ── Apply Button (both tabs) ── */}
              <TouchableOpacity
                style={styles.filterApplyBtn}
                onPress={() => setShowFilterSheet(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.filterApplyBtnText}>
                  {activeTab === 'products'
                    ? `Show ${filteredProducts.length} Result${filteredProducts.length !== 1 ? 's' : ''}`
                    : `Show ${filteredDesigns.length} Result${filteredDesigns.length !== 1 ? 's' : ''}`
                  }
                </Text>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </View>
      </Modal>

    </TabScreenFade>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: TC.bg,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: space.md,
    paddingBottom: 0,
  },

  // Header
  title: {
    ...typeScale.display,
    fontFamily: 'Geist_700Bold',
    color: '#000',
    letterSpacing: letterSpacing.tight,
    paddingHorizontal: space.lg,
    marginBottom: space.xs,
  },
  subtitle: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: TC.primary,
    opacity: 0.9,
    marginTop: 2,
    marginBottom: space.md,
    paddingHorizontal: space.lg,
  },

  // Search row
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  searchWrap: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    borderRadius: 9999,
    height: 40,
    paddingLeft: space.md,
    paddingRight: space.xs,
    gap: space.sm,
    backgroundColor: TC.inputBg,
  },
  searchInput: {
    flex: 1,
    ...typeScale.body,
    fontSize: 13,
    fontWeight: '300',
    fontFamily: 'Geist_400Regular',
    color: TC.textSecondary,
  },
  searchSubmit: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  postBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TC.bg,
  },

  // Category filter row with grid toggle
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gridToggleBtn: {
    paddingLeft: 8,
    paddingRight: 20,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Category filter — plain text tabs with underline active state
  tabsScroll: {
    flex: 1,
    marginHorizontal: 0,
  },
  tabsContent: {
    paddingHorizontal: space.lg,
    gap: 0,
    paddingVertical: 0,
  },
  tab: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: TC.primary,
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '300',
    fontFamily: 'Geist_400Regular',
    color: 'rgba(0,0,0,0.45)',
  },
  tabLabelActive: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: TC.primary,
  },
  tabBorder: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginBottom: space.md,
    marginTop: space.xs,
  },

  // ── Feed card (image + user row) ──
  feedCard: {
    backgroundColor: TC.bg,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  feedUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  feedUserInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  feedAvatar: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: TC.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  feedAvatarText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#fff',
  },
  feedUsername: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: TC.textPrimary,
    flex: 1,
  },
  feedActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  feedActionBtn: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TC.bg,
  },
  feedActionBtnActive: {
    borderColor: 'rgba(103,172,233,0.5)',
    backgroundColor: 'rgba(103,172,233,0.08)',
  },

  // Wishes / Products mode toggle
  modeToggleRow: {
    flexDirection: 'row',
    marginHorizontal: space.lg,
    marginBottom: space.xs,
    backgroundColor: TC.inputBg,
    borderRadius: radius.full,
    padding: 3,
  },
  modeToggleBtn: {
    flex: 1,
    height: 33,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeToggleBtnActive: {
    backgroundColor: TC.bg,
    ...TS.sm,
  },
  modeToggleLabel: {
    ...typeScale.button,
    fontSize: 12,
    fontWeight: '300',
    fontFamily: 'Geist_400Regular',
    color: 'rgba(0,0,0,0.45)',
  },
  modeToggleLabelActive: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: TC.primary,
  },

  // Grid — paddingHorizontal applied inline only for 1-col view
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 4,
  },
  // Grid card — overflow:hidden clips card-level corners; image handles its own top corners
  card: {
    width: '100%',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: TC.bg,  // match prodCardBody so no color bleed at image bottom
  },
  // 1-col single view — adds shadow + border for premium feel
  cardSingle: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 3,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  cardImg: {
    width: '100%',
    aspectRatio: 1,   // overridden inline for 1-col (16/10)
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  cardImgBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#ECEEF2',
  },
  cardImgPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  cardActions: {
    position: 'absolute',
    top: space.md,
    right: space.md,
    gap: space.xs,
    alignItems: 'center',
  },
  cardActionBtn: {
    width: 32,
    height: 32,
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
  cardBody: {
    paddingTop: space.sm,
    paddingHorizontal: space.xs,
    paddingBottom: space.xs,
  },
  cardTitle: {
    ...typeScale.headline,
    fontFamily: 'Geist_600SemiBold',
    color: TC.textPrimary,
  },

  // Product card styles (2-col: white info card; 3-col: image only)
  prodCardBody: {
    backgroundColor: TC.bg,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    gap: 2,
  },
  // 1-col: more generous padding
  prodCardBodySingle: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 16,
    gap: 4,
  },
  prodCardName: {
    ...typeScale.caption,
    color: TC.textPrimary,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    lineHeight: 16,
  },
  prodCardNameSingle: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    lineHeight: 20,
  },
  prodCardBrand: {
    ...typeScale.micro,
    fontFamily: 'Geist_600SemiBold',
    color: TC.textSecondary,
    textTransform: 'none',
    letterSpacing: 0,
    marginTop: 1,
  },
  prodCardRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    marginTop: 3,
  },
  prodCardRatingText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: TC.textPrimary,
    marginLeft: 2,
  },
  prodCardReviews: {
    fontSize: 10,
    fontFamily: 'Geist_400Regular',
    color: TC.textSecondary,
  },
  prodCardPrice: {
    ...typeScale.priceSmall,
    fontFamily: 'Geist_600SemiBold',
    color: TC.primary,
    marginTop: 3,
  },
  prodCardPriceSingle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    marginTop: 6,
  },

  // ── Section 3A: Drawer Shell ─────────────────────────────────────────────────
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  modalBackdrop: {
    flex: 1,
  },
  modalSheet: {
    backgroundColor: TC.bg,
    borderTopLeftRadius: radius.lg,             // 16px per design system spec (Part 2.11)
    borderTopRightRadius: radius.lg,
    maxHeight: '90%',
    shadowColor: TS.lg.shadowColor,
    shadowOffset: TS.lg.shadowOffset,
    shadowOpacity: TS.lg.shadowOpacity,
    shadowRadius: TS.lg.shadowRadius,
    elevation: TS.lg.elevation,
  },
  modalDrag: {
    width: 36,                                   // spec: 36px wide
    height: 4,                                   // spec: 4px tall
    backgroundColor: TC.border,                  // --color-border
    borderRadius: 9999,                          // pill
    alignSelf: 'center',
    marginTop: SP[3],                            // 12px margin top
    marginBottom: SP[4],                         // 16px margin bottom
  },
  modalCloseBtn: {
    position: 'absolute',
    top: SP[4],
    right: SP[5],
    width: 44,                                   // 44px min tap target (Part 1.5)
    height: 44,
    borderRadius: TR.full,
    backgroundColor: TC.surface,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  modalScrollContent: {
    paddingHorizontal: SP[5],                    // 20px left/right throughout
    paddingBottom: SP[8],
    paddingTop: SP[3],
  },
  modalImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: TC.surface,
    borderRadius: MODAL_IMG_RADIUS,              // 10% of image width
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SP[4],
    overflow: 'hidden',
  },
  modalImagePhoto: {
    width: '100%',
    height: '100%',
  },

  // ── Section 3B: Seller Header Row ──────────────────────────────────────────
  modalUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP[2],                                  // 8px
    paddingTop: SP[4],                           // 16px
    paddingBottom: SP[3],                        // 12px
    borderBottomWidth: 1,
    borderBottomColor: TC.border,
    marginBottom: SP[4],
  },
  modalAvatar: {
    width: 40,                                   // spec: 40×40px circle
    height: 40,
    borderRadius: TR.full,
    backgroundColor: TC.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAvatarVerified: {
    borderWidth: 2,                              // spec: 2px border if verified
    borderColor: TC.primary,
  },
  modalAvatarText: {
    ...typeScale.caption,
    color: TC.white,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
  },
  modalUserInfo: {
    flex: 1,
  },
  modalUsername: {
    ...typeScale.headline,
    fontFamily: 'Geist_600SemiBold',
    color: TC.textPrimary,
  },
  modalTime: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: TC.textSecondary,
    marginTop: 2,
  },
  followBtn: {
    backgroundColor: TC.primary,
    borderRadius: TR.full,
    height: 36,
    paddingHorizontal: SP[5],
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtnText: {
    ...typeScale.button,
    fontFamily: 'Geist_600SemiBold',
    color: TC.white,
  },

  // ── Section 3C: Post Title & Description ──────────────────────────────────
  modalTitle: {
    ...typeScale.title,
    fontFamily: 'Geist_700Bold',
    color: TC.textPrimary,
    marginTop: SP[4],
    marginBottom: 6,
  },
  modalDesc: {
    ...typeScale.body,
    fontFamily: 'Geist_400Regular',
    color: TC.textSecondary,
    marginBottom: SP[4],
  },

  // ── Section 3D: Action Buttons Row ─────────────────────────────────────────
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: SP[4],                            // 16px top
    marginBottom: SP[4],                         // 16px bottom
  },
  actionCircle: {
    width: 44,                                   // spec: 44×44px
    height: 44,
    borderRadius: TR.full,                       // circle
    borderWidth: 1,
    borderColor: TC.border,
    backgroundColor: TC.bg,                      // white
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionCircleLiked: {
    borderColor: 'rgba(239,68,68,0.3)',          // --color-destructive light
    backgroundColor: 'rgba(239,68,68,0.06)',
  },
  actionCircleCount: {
    ...typeScale.micro,
    fontFamily: 'Geist_600SemiBold',
    color: TC.textSecondary,
  },
  shopBtn: {
    flex: 1,
    minHeight: 44,                               // 44px min touch target
    backgroundColor: TC.primary,
    borderRadius: TR.full,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginLeft: SP[3],
    gap: SP[2],
  },
  shopBtnText: {
    ...typeScale.button,
    fontFamily: 'Geist_600SemiBold',
    color: TC.white,
  },

  // ── Section 3E: Products in This Post ──────────────────────────────────────
  sectionLabel: {
    ...typeScale.subheadline,
    fontFamily: 'Geist_600SemiBold',
    color: TC.textTertiary,
    marginTop: SP[5],
    marginBottom: SP[3],
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SP[3],
    paddingVertical: SP[3],                      // 12px — taller to fit new content
    borderBottomWidth: 1,
    borderBottomColor: TC.border,
  },
  productImg: {
    width: PRODUCT_IMG_SIZE,                     // 76px — 1/3 larger than original 56px
    height: PRODUCT_IMG_SIZE,
    borderRadius: Math.round(PRODUCT_IMG_SIZE * 0.05), // 5% radius ≈ 4px
    backgroundColor: TC.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    flexShrink: 0,
  },
  productInfo: {
    flex: 1,
    gap: 3,
  },
  productName: {
    ...typeScale.headline,
    fontFamily: 'Geist_600SemiBold',
    color: TC.textPrimary,
  },

  // ── Rating row ──────────────────────────────────────────────────────────────
  productRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  productRatingScore: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: TC.textPrimary,
    marginLeft: 3,
    lineHeight: 14,
  },
  productReviewCount: {
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: TC.textSecondary,
    lineHeight: 14,
  },

  // ── Brand + source row ───────────────────────────────────────────────────────
  productMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  productBrand: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: TC.textTertiary,
  },
  productSourceBadge: {
    backgroundColor: TC.bg,
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 3,
    paddingVertical: 2,
  },

  // ── Shipping ─────────────────────────────────────────────────────────────────
  productShipping: {
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: '#16A34A',
    lineHeight: 14,
  },

  // ── Price column ─────────────────────────────────────────────────────────────
  productPriceCol: {
    alignItems: 'flex-end',
    gap: 2,
  },
  productPrice: {
    ...typeScale.price,
    fontFamily: 'Geist_700Bold',
    color: TC.primary,
    textAlign: 'right',
  },
  productOrigPrice: {
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: TC.textTertiary,
    textDecorationLine: 'line-through',
    textAlign: 'right',
  },

  // ── Horizontal product cards ──────────────────────────────────────────────
  hCard: {
    width: 170,
    backgroundColor: TC.bg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  hCardImgWrap: {
    width: '100%',
    height: 150,
    backgroundColor: TC.surface,
    overflow: 'hidden',
  },
  hCardBody: {
    padding: 10,
    paddingBottom: 36,
    gap: 2,
  },
  hCardName: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: TC.textPrimary,
    lineHeight: 17,
  },
  hCardBrand: {
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: TC.textTertiary,
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
    fontFamily: 'Geist_600SemiBold',
    color: TC.textPrimary,
    marginLeft: 2,
  },
  hCardReviews: {
    fontSize: 10,
    fontFamily: 'Geist_400Regular',
    color: TC.textSecondary,
  },
  hCardPrice: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: TC.primary,
    marginTop: 4,
  },
  hCardAddBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: TC.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  ftcDisclosure: {
    fontSize: 11,
    fontFamily: 'Geist_400Regular',
    fontStyle: 'italic',
    color: TC.textTertiary,
    textAlign: 'center',
    marginTop: SP[4],
    marginBottom: SP[2],
  },

  // ── Section 3F: Tags ──────────────────────────────────────────────────────
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SP[2],                                  // 8px
  },
  tag: {
    backgroundColor: TC.surface2,                // --color-surface-2
    borderRadius: TR.sm,                         // 8px
    paddingHorizontal: SP[3],                    // 12px
    paddingVertical: SP[1],                      // 4px
  },
  tagHighlight: {
    backgroundColor: TC.primaryLight,            // --color-primary-light
  },
  tagText: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: TC.textSecondary,
  },
  tagTextHighlight: {
    color: TC.primary,                           // --color-primary
  },

  // New post modal — same sheet style
  postModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  postModalTitle: {
    ...typeScale.title,
    fontFamily: 'Geist_700Bold',
    color: TC.textPrimary,
  },
  postShareBtn: {
    backgroundColor: TC.primary,
    borderRadius: radius.full,
    paddingHorizontal: space.base,
    paddingVertical: space.sm,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postShareBtnText: {
    ...typeScale.button,
    fontFamily: 'Geist_600SemiBold',
    color: TC.white,
  },
  postModalBody: {
    paddingHorizontal: space.lg,
    paddingTop: space.base,
    paddingBottom: space.xl,
  },
  uploadZone: {
    width: '100%',
    height: 150,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#DDD',
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4F4F6',
    gap: space.sm,
    marginBottom: space.base,
  },
  uploadLabel: {
    ...typeScale.caption,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: TC.textSecondary,
  },
  uploadSub: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: TC.textTertiary,
    opacity: 0.44,
  },
  fieldLabel: {
    ...typeScale.micro,
    fontFamily: 'Geist_600SemiBold',
    color: TC.textTertiary,
    marginBottom: space.sm,
  },
  fieldInput: {
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: radius.md,
    paddingHorizontal: space.base,
    height: 48,                                  // form input spec: 48px height
    ...typeScale.body,
    fontFamily: 'Geist_400Regular',
    color: TC.textPrimary,
    marginBottom: space.md,
    backgroundColor: TC.bg,
  },
  fieldTextarea: {
    height: 80,
    paddingTop: space.sm,
  },
  postTagChip: {
    backgroundColor: '#F4F4F6',
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  postTagChipSelected: {
    backgroundColor: 'rgba(11,109,195,0.12)',
  },
  postTagChipText: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: TC.textSecondary,
  },
  postTagChipTextSelected: {
    color: TC.primary,
  },

  // ── Active filter banner ──────────────────────────────────────────────────
  filterBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: space.lg,
    marginBottom: space.md,
    paddingHorizontal: space.base,
    paddingVertical: 10,
    backgroundColor: TC.primaryLight,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(29,78,216,0.14)',
  },
  filterBannerLeft: {
    flex: 1,
  },
  filterBannerTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: TC.primary,
    letterSpacing: 0.2,
    marginBottom: 1,
  },
  filterBannerCount: {
    fontSize: 11,
    fontFamily: 'Geist_400Regular',
    color: TC.primary,
    opacity: 0.72,
  },
  filterClearBtn: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    backgroundColor: TC.primary,
    marginLeft: space.sm,
  },
  filterClearText: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: TC.white,
    letterSpacing: 0.3,
  },

  // ── Search icon helpers ───────────────────────────────────────────────────
  searchIconBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  searchIconRight: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: TC.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: TC.white,
  },

  // ── Filter sheet ──────────────────────────────────────────────────────────
  filterSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingBottom: space.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  filterSheetTitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: TC.textPrimary,
  },
  filterSheetClearAll: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: TC.textTertiary,
  },
  filterSheetBody: {
    paddingHorizontal: space.lg,
    paddingTop: space.base,
    paddingBottom: space['3xl'],
  },
  filterHScrollContent: {
    flexDirection: 'row',
    gap: space.sm,
    paddingRight: space.lg,
  },
  filterSectionLabel: {
    ...typeScale.micro,
    fontFamily: 'Geist_600SemiBold',
    color: TC.textTertiary,
    marginTop: space.base,
    marginBottom: space.sm,
  },
  filterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  filterChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  filterChip: {
    paddingHorizontal: space.base,
    paddingVertical: space.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#E5E5E5',
    backgroundColor: '#FAFAFA',
  },
  filterChipActive: {
    borderColor: TC.primary,
    backgroundColor: TC.primary,
  },
  filterChipText: {
    ...typeScale.caption,
    color: TC.textSecondary,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
  },
  filterRatingRow: {
    flexDirection: 'row',
    gap: space.sm,
    flexWrap: 'wrap',
  },
  filterRatingBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: '#F8F9FA',
  },
  filterRatingBtnActive: {
    borderColor: '#F59E0B',
    backgroundColor: 'rgba(245,158,11,0.1)',
  },
  filterToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: space.base,
    paddingVertical: space.sm,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  filterToggleLabel: {
    ...typeScale.body,
    color: TC.textPrimary,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
  },
  aiImageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.14)',
    backgroundColor: '#F8F9FA',
    marginTop: space.sm,
  },
  aiImageBtnActive: {
    borderColor: TC.primary,
    borderStyle: 'solid',
    backgroundColor: 'rgba(29,78,216,0.06)',
  },
  aiImageBtnText: {
    ...typeScale.button,
    fontFamily: 'Geist_600SemiBold',
    color: '#333',
  },
  aiImageBtnSub: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: TC.textTertiary,
    textAlign: 'center',
    marginTop: space.xs,
    marginBottom: space.base,
  },
  filterApplyBtn: {
    height: 52,
    borderRadius: radius.button,
    backgroundColor: TC.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.lg,
  },
  filterApplyBtnText: {
    ...typeScale.button,
    color: TC.white,
    fontSize: 15,
    fontFamily: 'Geist_600SemiBold',
  },

  // ── Sort row ──────────────────────────────────────────────────────────────
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: 10,
    paddingBottom: 8,
  },
  sortTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  sortLabel: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: TC.textTertiary,
  },
  sortValue: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: TC.textPrimary,
  },
  sortValueActive: {
    color: TC.primary,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
  },
  sortCount: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: TC.textTertiary,
  },
  // ── Sort dropdown ────────────────────────────────────────────────────────
  sortDropdown: {
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    backgroundColor: TC.bg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 3,
    overflow: 'hidden',
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  sortOptionText: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: TC.textPrimary,
  },
  sortOptionTextActive: {
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: TC.primary,
  },

  // ── Filter sheet sections (fs* = filter sheet) ───────────────────────────
  fsSectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: TC.textPrimary,
    marginBottom: 10,
    marginTop: 4,
  },
  fsHScroll: {
    gap: 8,
    paddingBottom: 2,
  },
  fsChip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: TC.bg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  fsChipOn: {
    borderColor: TC.primary,
    backgroundColor: 'rgba(29,78,216,0.06)',
  },
  fsChipText: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: TC.textSecondary,
  },
  fsChipTextOn: {
    color: TC.primary,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
  },
  fsDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginVertical: 16,
  },
  fsToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  fsToggleLabel: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: TC.textPrimary,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space['6xl'],
    paddingHorizontal: space['2xl'],
  },
  emptyStateTitle: {
    ...typeScale.title,
    fontFamily: 'Geist_700Bold',
    color: TC.textPrimary,
    marginBottom: space.sm,
  },
  emptyStateSub: {
    ...typeScale.body,
    fontFamily: 'Geist_400Regular',
    color: TC.textTertiary,
    textAlign: 'center',
  },

});
