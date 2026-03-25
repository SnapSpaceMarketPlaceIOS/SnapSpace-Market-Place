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
} from 'react-native';
import CardImage from '../components/CardImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Svg, { Circle, Line, Path, Rect, Polyline } from 'react-native-svg';
import { fontSize, fontWeight, letterSpacing, space, radius, shadow, typeScale } from '../constants/tokens';
import theme from '../constants/theme';
import { useLiked } from '../context/LikedContext';
import { DESIGNS } from '../data/designs';
import { PRODUCT_CATALOG } from '../data/productCatalog';
import { getPublicDesigns } from '../services/supabase';
import PressableCard from '../components/PressableCard';
import { SellerName } from '../components/VerifiedBadge';
import { getProductsForDesign } from '../services/affiliateProducts';

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

// 5% corner radius for the modal hero image (width minus 20px padding each side)
const MODAL_IMG_RADIUS = Math.round((width - SP[5] * 2) * 0.05);
// Product thumbnail — 1/3 larger than original 56px
const PRODUCT_IMG_SIZE = 88;

// ── Icons ─────────────────────────────────────────────────────────────────────

function SearchIcon({ color = '#fff', size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={11} cy={11} r={8} />
      <Line x1={21} y1={21} x2={16.65} y2={16.65} />
    </Svg>
  );
}

function PlusIcon({ color = '#555', size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round">
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

function HeartIcon({ filled = false, size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#ef4444' : 'none'} stroke={filled ? '#ef4444' : '#444'} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function ShareIcon({ color = '#444', size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <Polyline points="16 6 12 2 8 6" />
      <Line x1={12} y1={2} x2={12} y2={15} />
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
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#555" strokeWidth={2.5} strokeLinecap="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

// Grid layout toggle icon — shows current mode
function GridLayoutIcon({ cols }) {
  const color = '#555';
  if (cols === 3) {
    // 3×2 dots
    return (
      <Svg width={20} height={20} viewBox="0 0 18 18" fill="none">
        {[0,6,12].map(x => [0,6,12].map(y => (
          <Rect key={`${x}${y}`} x={x} y={y} width={4} height={4} rx={1} fill={color} />
        )))}
      </Svg>
    );
  }
  if (cols === 1) {
    // single-column lines — thin bars
    return (
      <Svg width={20} height={20} viewBox="0 0 18 18" fill="none">
        <Rect x={0} y={1} width={18} height={2} rx={1} fill={color} />
        <Rect x={0} y={8} width={18} height={2} rx={1} fill={color} />
        <Rect x={0} y={15} width={18} height={2} rx={1} fill={color} />
      </Svg>
    );
  }
  // 2×2 squares (default)
  return (
    <Svg width={20} height={20} viewBox="0 0 18 18" fill="none">
      <Rect x={0} y={0} width={7} height={7} rx={1.5} fill={color} />
      <Rect x={11} y={0} width={7} height={7} rx={1.5} fill={color} />
      <Rect x={0} y={11} width={7} height={7} rx={1.5} fill={color} />
      <Rect x={11} y={11} width={7} height={7} rx={1.5} fill={color} />
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

function StarIconSmall({ filled = true, size = 11 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? '#F5A623' : '#E5E7EB'} stroke={filled ? '#F5A623' : '#D1D5DB'} strokeWidth={1}>
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
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

const CATEGORIES = ['All', 'Living Room', 'Bedroom', 'Kitchen', 'Office', 'Dining'];

// Product catalog category pills
const PRODUCT_CATEGORIES = ['All', 'Sofas', 'Tables', 'Rugs', 'Wall Art', 'Mirrors'];
const PRODUCT_CAT_MAP = {
  'Sofas':    ['sofa'],
  'Tables':   ['coffee-table', 'dining-table', 'side-table'],
  'Rugs':     ['rug'],
  'Wall Art': ['wall-art'],
  'Mirrors':  ['mirror'],
};

const POST_TAGS = [
  '#Minimalist', '#LivingRoom', '#Bedroom', '#Kitchen',
  '#Biophilic', '#DarkLuxe', '#Scandi', '#WarmTones',
  '#AIGenerated', '#ShopTheLook',
];

// ── Category keyword map (index matches CATEGORIES array) ─────────────────────

const CATEGORY_KEYWORDS = [
  [],                                     // 0 — All (no filter)
  ['livingroom', 'living room', 'living'],// 1 — Living Room
  ['bedroom'],                            // 2 — Bedroom
  ['kitchen'],                            // 3 — Kitchen
  ['office'],                             // 4 — Office
  ['dining'],                             // 5 — Dining
];

// ── Search engine ──────────────────────────────────────────────────────────────

function searchAndFilter(designs, query, categoryIndex, roomTypeFilter, styleFilter) {
  const raw = query.trim().toLowerCase().replace(/^#/, '');

  // Step 1: roomType filter (from route params)
  let pool = designs;
  if (roomTypeFilter) {
    const rt = roomTypeFilter.toLowerCase();
    pool = pool.filter((d) => {
      const dRoom = (d.roomType || '').toLowerCase();
      // Match 'living-room' → 'living', 'bedroom' → 'bedroom', etc.
      return dRoom === rt ||
        dRoom === rt.replace('-room', '') ||
        rt.replace('-room', '') === dRoom.replace('-room', '') ||
        (d.tags || []).some(t => t.toLowerCase().includes(rt.replace('-room', '')));
    });
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

function GridCard({ design, onPress, cardRadius }) {
  const r = cardRadius ?? radius.md;
  return (
    <PressableCard
      style={[styles.card, { borderRadius: r }]}
      animStyle={{ width: '100%' }}
      onPress={onPress}
      activeOpacity={0.95}
    >
      {/* Image only — no buttons, no title */}
      <View style={[styles.cardImg, { borderRadius: r }]}>
        <View style={styles.cardImgBg} />
        <CardImage uri={design.imageUrl} style={styles.cardImgPhoto} resizeMode="cover" />
      </View>
    </PressableCard>
  );
}

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
  nursery: 'Nursery',
};

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ExploreScreen({ navigation, route }) {
  const { liked, toggleLiked } = useLiked();
  const [activeTab, setActiveTab] = useState('spaces'); // 'spaces' | 'products'
  const [activeCategory, setActiveCategory] = useState(0);
  const [activeProdCat, setActiveProdCat] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [gridCols, setGridCols] = useState(2);
  const approxCardWidth = width / gridCols;
  const cardRadius = Math.round(approxCardWidth * (gridCols === 3 ? 0.025 : 0.05));
  const cycleGrid = () => setGridCols(c => c === 3 ? 1 : c + 1);
  const [selectedTags, setSelectedTags] = useState(['#Minimalist']);

  // ── Incoming filter state from navigation params ─────────────────────────
  const [activeRoomFilter, setActiveRoomFilter] = useState(null);
  const [activeStyleFilter, setActiveStyleFilter] = useState(null);
  const [filterLabel, setFilterLabel] = useState(null);
  const [overrideDesigns, setOverrideDesigns] = useState(null);
  const [communityDesigns, setCommunityDesigns] = useState([]);
  const consumedParamsRef = useRef(null);

  // Apply params on every focus (handles tab-switch AND fresh navigation)
  useFocusEffect(
    useCallback(() => {
      const params = route?.params;
      if (!params || params === consumedParamsRef.current) return;
      consumedParamsRef.current = params;

      // Clear previous filters before applying new ones
      setActiveRoomFilter(null);
      setActiveStyleFilter(null);
      setOverrideDesigns(null);
      setActiveCategory(0);
      setSearch('');

      if (params.filterRoomType) {
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
    }, [route?.params]),
  );

  const clearFilters = useCallback(() => {
    setActiveRoomFilter(null);
    setActiveStyleFilter(null);
    setOverrideDesigns(null);
    setFilterLabel(null);
    setActiveCategory(0);
    setSearch('');
    // Reset route params so next navigation can apply fresh ones
    navigation.setParams({
      filterRoomType: undefined,
      filterStyle: undefined,
      designs: undefined,
      filterQuery: undefined,
      title: undefined,
    });
    consumedParamsRef.current = null;
  }, [navigation]);

  // Fetch community (user-posted) designs on screen focus
  useFocusEffect(
    useCallback(() => {
      getPublicDesigns(20, 0).then(designs => {
        const normalized = designs.map(d => ({
          id: `user-${d.id}`,
          title: d.prompt || 'AI Generated Design',
          user: d.author?.username || d.author?.full_name || 'SnapSpace User',
          initial: (d.author?.full_name || 'U')[0],
          verified: d.author?.is_verified_supplier || false,
          imageUrl: d.image_url,
          description: d.prompt,
          prompt: d.prompt,
          roomType: 'living-room',
          styles: d.style_tags || [],
          products: [],
          tags: (d.style_tags || []).map(s => `#${s}`),
          likes: d.likes || 0,
          shares: 0,
          isUserDesign: true,
        }));
        setCommunityDesigns(normalized);
      }).catch(() => {});
    }, [])
  );

  // filterLabel is set when any param-driven filter is active (room, style, designs, or query)
  const hasActiveFilter = !!(activeRoomFilter || activeStyleFilter || overrideDesigns || filterLabel);

  const togglePostTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const baseDesigns = overrideDesigns || [...communityDesigns, ...DESIGNS];

  const filteredDesigns = useMemo(
    () => searchAndFilter(baseDesigns, search, activeCategory, activeRoomFilter, activeStyleFilter),
    [search, activeCategory, activeRoomFilter, activeStyleFilter, baseDesigns],
  );

  const filteredProducts = useMemo(() => {
    const catLabel = PRODUCT_CATEGORIES[activeProdCat];
    const cats = PRODUCT_CAT_MAP[catLabel];
    let pool = cats ? PRODUCT_CATALOG.filter((p) => cats.includes(p.category)) : PRODUCT_CATALOG;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      pool = pool.filter((p) =>
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        (p.styles || []).some((s) => s.includes(q))
      );
    }
    return pool;
  }, [activeProdCat, search]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* ── Header ── */}
          <Text style={styles.title}>{filterLabel && hasActiveFilter ? filterLabel : 'Explore'}</Text>
          <Text style={styles.subtitle}>
            {activeTab === 'products'
              ? `${filteredProducts.length} curated product${filteredProducts.length !== 1 ? 's' : ''}`
              : hasActiveFilter
                ? `${filteredDesigns.length} AI-generated space${filteredDesigns.length !== 1 ? 's' : ''}`
                : 'Shop AI-Generated Room Designs'}
          </Text>

          {/* ── Search Row ── */}
          <View style={styles.searchRow}>
            <View style={styles.searchWrap}>
              <SearchIcon color="#999" size={18} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search designs, styles, rooms..."
                placeholderTextColor="#AAA"
                value={search}
                onChangeText={setSearch}
              />
              {search.length > 0 && (
                <TouchableOpacity style={styles.searchSubmit} onPress={() => { setSearch(''); Keyboard.dismiss(); }}>
                  <CloseIcon size={14} />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* ── Spaces / Products toggle ── */}
          <View style={styles.modeToggleRow}>
            <TouchableOpacity
              style={[styles.modeToggleBtn, activeTab === 'spaces' && styles.modeToggleBtnActive]}
              onPress={() => setActiveTab('spaces')}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeToggleLabel, activeTab === 'spaces' && styles.modeToggleLabelActive]}>
                Spaces
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeToggleBtn, activeTab === 'products' && styles.modeToggleBtnActive]}
              onPress={() => setActiveTab('products')}
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

          {/* ── Active Filter Banner ── */}
          {hasActiveFilter && (
            <View style={styles.filterBanner}>
              <View style={styles.filterBannerLeft}>
                {filterLabel && (
                  <Text style={styles.filterBannerTitle} numberOfLines={1}>{filterLabel}</Text>
                )}
                <Text style={styles.filterBannerCount}>
                  {filteredDesigns.length} space{filteredDesigns.length !== 1 ? 's' : ''}
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
              <View style={styles.grid}>
                {filteredProducts.map((product) => (
                  <TouchableOpacity
                    key={product.id}
                    style={[styles.card, { width: colWidthPct(gridCols) }]}
                    activeOpacity={0.88}
                    onPress={() => navigation?.navigate('ProductDetail', { product: {
                      ...product,
                      price: product.priceDisplay,
                      priceValue: product.price,
                      source: product.source,
                    }})}
                  >
                    <View style={styles.cardImg}>
                      <View style={styles.cardImgBg} />
                      <CardImage uri={product.imageUrl} style={styles.cardImgPhoto} resizeMode="cover" />
                      {/* Amazon badge */}
                      <View style={styles.prodBadgePos}>
                        <View style={styles.prodAmazonBadge}>
                          <AmazonLogoMark />
                        </View>
                      </View>
                    </View>
                    <View style={styles.prodCardBody}>
                      <Text style={styles.prodCardName} numberOfLines={2}>{product.name}</Text>
                      <Text style={styles.prodCardBrand}>{product.brand}</Text>
                      <Text style={styles.prodCardPrice}>{product.priceDisplay}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            )
          ) : filteredDesigns.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No results found</Text>
              <Text style={styles.emptyStateSub}>
                Try a different keyword, tag, or category
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {filteredDesigns.map((design) => (
                <View key={design.id} style={{ width: colWidthPct(gridCols), padding: 1 }}>
                  <GridCard
                    design={design}
                    cardRadius={cardRadius}
                    onPress={() => {
                      const enrichedProducts = getProductsForDesign(design, 4);
                      const enriched = { ...design, products: enrichedProducts.length ? enrichedProducts : design.products };
                      setSelectedCard(enriched);
                    }}
                  />
                </View>
              ))}
            </View>
          )}

          <View style={{ height: space.lg }} />
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
                {/* Post image */}
                <View style={styles.modalImage}>
                  <CardImage uri={selectedCard.imageUrl} style={styles.modalImagePhoto} resizeMode="cover" />
                </View>

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

                {/* 3D: Like / Share / Shop The Look */}
                <View style={styles.actionsRow}>
                  {/* Like — logic unchanged */}
                  <TouchableOpacity
                    style={[
                      styles.actionCircle,
                      liked[selectedCard.id] && styles.actionCircleLiked,
                    ]}
                    onPress={() => toggleLiked(selectedCard.id)}
                  >
                    <HeartIcon filled={!!liked[selectedCard.id]} size={20} />
                    <Text style={styles.actionCircleCount}>
                      {liked[selectedCard.id] ? selectedCard.likes + 1 : selectedCard.likes}
                    </Text>
                  </TouchableOpacity>
                  {/* Share — logic unchanged */}
                  <TouchableOpacity style={[styles.actionCircle, { marginLeft: SP[2] }]}>
                    <ShareIcon color={TC.textSecondary} size={20} />
                    <Text style={styles.actionCircleCount}>{selectedCard.shares}</Text>
                  </TouchableOpacity>
                  {/* Shop The Look — routing unchanged */}
                  <TouchableOpacity
                    style={styles.shopBtn}
                    onPress={() => {
                      const card = selectedCard;
                      setSelectedCard(null);
                      navigation?.navigate('ShopTheLook', { design: card });
                    }}
                  >
                    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
                      <Line x1={3} y1={6} x2={21} y2={6} />
                      <Path d="M16 10a4 4 0 0 1-8 0" />
                    </Svg>
                    <Text style={styles.shopBtnText}>Shop The Look</Text>
                  </TouchableOpacity>
                </View>

                {/* 3E: Products in this post */}
                <Text style={styles.sectionLabel}>PRODUCTS IN THIS POST</Text>
                {selectedCard.products.map((p, i) => (
                  <TouchableOpacity
                    key={i}
                    style={styles.productRow}
                    activeOpacity={0.7}
                    onPress={() => {
                      const card = selectedCard;
                      setSelectedCard(null);
                      navigation?.navigate('ProductDetail', { product: p, design: card });
                    }}
                  >
                    <View style={styles.productImg}>
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
                    <View style={styles.productInfo}>
                      <Text style={styles.productName} numberOfLines={2}>{p.name}</Text>

                      {/* Rating row */}
                      {!!p.rating && (
                        <View style={styles.productRatingRow}>
                          {[1,2,3,4,5].map(i => (
                            <StarIconSmall key={i} size={11} filled={i <= Math.round(p.rating)} />
                          ))}
                          <Text style={styles.productRatingScore}>{p.rating.toFixed(1)}</Text>
                          {!!p.reviewCount && (
                            <Text style={styles.productReviewCount}>
                              ({p.reviewCount.toLocaleString()})
                            </Text>
                          )}
                        </View>
                      )}

                      {/* Brand + source badge */}
                      <View style={styles.productMetaRow}>
                        <Text style={styles.productBrand}>{p.brand}</Text>
                        {p.source === 'amazon' && (
                          <View style={styles.productSourceBadge}>
                            <AmazonLogoMark />
                          </View>
                        )}
                      </View>

                      {/* Free shipping indicator */}
                      <Text style={styles.productShipping}>✓ Free Shipping</Text>
                    </View>

                    {/* Price + optional discount */}
                    <View style={styles.productPriceCol}>
                      <Text style={styles.productPrice}>
                        {typeof p.price === 'number' ? `$${p.price.toLocaleString()}` : p.price}
                      </Text>
                      {!!p.originalPrice && (
                        <Text style={styles.productOrigPrice}>
                          ${p.originalPrice.toLocaleString()}
                        </Text>
                      )}
                    </View>
                  </TouchableOpacity>
                ))}

                {/* FTC Disclosure */}
                <Text style={styles.ftcDisclosure}>
                  We may earn a commission when you buy through links on this app.
                </Text>

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
              <TouchableOpacity style={styles.postShareBtn} onPress={() => setShowPostModal(false)}>
                <Text style={styles.postShareBtnText}>Share</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.postModalBody}
            >
              {/* Upload zone */}
              <TouchableOpacity style={styles.uploadZone}>
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
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: space.base,
    paddingBottom: space['2xl'],
  },

  // Header
  title: {
    ...typeScale.display,
    color: '#000',
    letterSpacing: letterSpacing.tight,
    paddingHorizontal: space.lg,
    marginBottom: space.xs,
  },
  subtitle: {
    ...typeScale.caption,
    color: TC.primary,
    opacity: 0.9,
    marginTop: space.xs,
    marginBottom: space.base,
    paddingHorizontal: space.lg,
  },

  // Search row
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    marginBottom: space.base,
  },
  searchWrap: {
    flex: 1,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    borderRadius: 9999,
    height: 48,
    paddingLeft: space.md,
    paddingRight: space.xs,
    gap: space.sm,
    backgroundColor: '#F1F5F9',
  },
  searchInput: {
    flex: 1,
    ...typeScale.body,
    color: '#555',
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
    backgroundColor: '#FFFFFF',
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
    borderBottomColor: '#0B6DC3',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: 'rgba(0,0,0,0.45)',
  },
  tabLabelActive: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0B6DC3',
  },
  tabBorder: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginBottom: space.md,
    marginTop: space.xs,
  },

  // Spaces / Products mode toggle
  modeToggleRow: {
    flexDirection: 'row',
    marginHorizontal: space.lg,
    marginBottom: space.sm,
    backgroundColor: '#F1F5F9',
    borderRadius: radius.full,
    padding: 3,
  },
  modeToggleBtn: {
    flex: 1,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeToggleBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  modeToggleLabel: {
    ...typeScale.button,
    color: 'rgba(0,0,0,0.45)',
  },
  modeToggleLabelActive: {
    color: TC.primary,
    fontWeight: '700',
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  // Grid card — shadow.low + border.subtle
  card: {
    width: '100%',
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#E8EDF2',
  },
  cardImg: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  cardImgBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E8EDF2',
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
    color: '#111',
  },

  // Product card styles
  prodBadgePos: {
    position: 'absolute',
    bottom: space.xs,
    left: space.xs,
  },
  prodAmazonBadge: {
    backgroundColor: 'rgba(255,255,255,0.92)',
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 3,
  },
  prodCardBody: {
    paddingHorizontal: space.sm,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    gap: 2,
  },
  prodCardName: {
    ...typeScale.caption,
    color: '#111',
    fontWeight: '600',
    lineHeight: 16,
  },
  prodCardBrand: {
    ...typeScale.micro,
    color: TC.textSecondary,
    textTransform: 'none',
    letterSpacing: 0,
    marginTop: 1,
  },
  prodCardPrice: {
    ...typeScale.priceSmall,
    color: TC.primary,
    marginTop: 3,
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
  },
  modalUserInfo: {
    flex: 1,
  },
  modalUsername: {
    ...typeScale.headline,
    color: TC.textPrimary,
  },
  modalTime: {
    ...typeScale.caption,
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
    color: TC.white,
  },

  // ── Section 3C: Post Title & Description ──────────────────────────────────
  modalTitle: {
    ...typeScale.title,
    color: TC.textPrimary,
    marginTop: SP[4],
    marginBottom: 6,
  },
  modalDesc: {
    ...typeScale.body,
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
    color: TC.white,
  },

  // ── Section 3E: Products in This Post ──────────────────────────────────────
  sectionLabel: {
    ...typeScale.subheadline,
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
    color: TC.textPrimary,
    marginLeft: 3,
    lineHeight: 14,
  },
  productReviewCount: {
    fontSize: 11,
    fontWeight: '400',
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
    color: TC.textTertiary,
  },
  productSourceBadge: {
    backgroundColor: '#FFFFFF',
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
    color: TC.primary,
    textAlign: 'right',
  },
  productOrigPrice: {
    fontSize: 11,
    fontWeight: '400',
    color: TC.textTertiary,
    textDecorationLine: 'line-through',
    textAlign: 'right',
  },

  ftcDisclosure: {
    fontSize: 11,
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
    color: '#111',
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
    color: '#fff',
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
    color: '#555',
  },
  uploadSub: {
    ...typeScale.caption,
    color: '#bbb',
    opacity: 0.44,
  },
  fieldLabel: {
    ...typeScale.micro,
    color: '#A0A0A8',
    marginBottom: space.sm,
  },
  fieldInput: {
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: radius.md,
    paddingHorizontal: space.base,
    height: 48,                                  // form input spec: 48px height
    ...typeScale.body,
    color: '#111',
    marginBottom: space.md,
    backgroundColor: '#FFFFFF',
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
    color: '#555',
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
    color: TC.primary,
    letterSpacing: 0.2,
    marginBottom: 1,
  },
  filterBannerCount: {
    fontSize: 11,
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
    color: '#FFFFFF',
    letterSpacing: 0.3,
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
    color: '#111',
    marginBottom: space.sm,
  },
  emptyStateSub: {
    ...typeScale.body,
    color: '#A0A0A8',
    textAlign: 'center',
  },
});
