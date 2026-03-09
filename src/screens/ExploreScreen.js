import React, { useState, useMemo } from 'react';
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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle, Line, Path, Rect, Polyline } from 'react-native-svg';
import { colors } from '../constants/colors';
import { fontSize, fontWeight, letterSpacing, space, radius, shadow } from '../constants/tokens';
import { useLiked } from '../context/LikedContext';
import { DESIGNS } from '../data/designs';

const { width } = Dimensions.get('window');
// 20px padding each side + 12px gap between cards
const CARD_WIDTH = (width - 20 * 2 - 12) / 2;

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

function searchAndFilter(designs, query, categoryIndex) {
  const raw = query.trim().toLowerCase().replace(/^#/, '');

  // Step 1: category filter
  const keywords = CATEGORY_KEYWORDS[categoryIndex] ?? [];
  let pool = categoryIndex === 0
    ? designs
    : designs.filter((d) => {
        const haystack = [
          d.title,
          d.description,
          ...d.tags,
        ].join(' ').toLowerCase();
        return keywords.some((kw) => haystack.includes(kw));
      });

  // Step 2: if no search query return category-filtered results as-is
  if (!raw) return pool;

  // Step 3: score each design
  const scored = pool.map((d) => {
    let score = 0;
    const titleLower = d.title.toLowerCase();
    const descLower  = d.description.toLowerCase();
    const userLower  = d.user.toLowerCase();

    // Title match
    if (titleLower.includes(raw)) score += 4;

    // Tag matches
    d.tags.forEach((tag) => {
      const clean = tag.toLowerCase().replace(/^#/, '');
      if (clean === raw)          score += 4; // exact
      else if (clean.includes(raw)) score += 2; // partial
    });

    // Description match
    if (descLower.includes(raw)) score += 2;

    // Product name / brand match
    d.products.forEach((p) => {
      if (p.name.toLowerCase().includes(raw))  score += 2;
      if (p.brand.toLowerCase().includes(raw)) score += 1;
    });

    // Username match
    if (userLower.includes(raw)) score += 1;

    // Social-proof tie-break
    score *= 1 + d.likes / 1000;

    return { design: d, score };
  });

  // Step 4: filter out zero-score results and sort descending
  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.design);
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ExploreScreen({ navigation }) {
  const { liked, toggleLiked } = useLiked();
  const [activeCategory, setActiveCategory] = useState(0);
  const [search, setSearch] = useState('');
  const [selectedCard, setSelectedCard] = useState(null);
  const [showPostModal, setShowPostModal] = useState(false);
  const [selectedTags, setSelectedTags] = useState(['#Minimalist']);

  const togglePostTag = (tag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  };

  const filteredDesigns = useMemo(
    () => searchAndFilter(DESIGNS, search, activeCategory),
    [search, activeCategory],
  );

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* ── Header ── */}
          <Text style={styles.title}>Explore</Text>
          <Text style={styles.subtitle}>Shop AI-Generated Room Designs</Text>

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
            <TouchableOpacity
              style={styles.postBtn}
              onPress={() => setShowPostModal(true)}
            >
              <PlusIcon color={colors.bluePrimary} size={18} />
            </TouchableOpacity>
          </View>

          {/* ── Category Filter Pills ── */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tabsScroll}
            contentContainerStyle={styles.tabsContent}
          >
            {CATEGORIES.map((cat, i) => (
              <TouchableOpacity
                key={cat}
                style={[styles.tab, activeCategory === i && styles.tabActive]}
                onPress={() => setActiveCategory(i)}
                activeOpacity={0.75}
              >
                <Text style={[styles.tabLabel, activeCategory === i && styles.tabLabelActive]}>
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
          <View style={styles.tabBorder} />

          {/* ── Grid ── */}
          {filteredDesigns.length === 0 ? (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateTitle}>No results found</Text>
              <Text style={styles.emptyStateSub}>
                Try a different keyword, tag, or category
              </Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {filteredDesigns.map((design) => (
                <TouchableOpacity
                  key={design.id}
                  style={styles.card}
                  activeOpacity={0.88}
                  onPress={() => setSelectedCard(design)}
                >
                  {/* Card image placeholder */}
                  <View style={styles.cardImg}>
                    <ImagePlaceholderIcon />
                    {/* Action buttons */}
                    <View style={styles.cardActions}>
                      <TouchableOpacity
                        style={styles.cardActionBtn}
                        onPress={() => toggleLiked(design.id)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <HeartIcon filled={!!liked[design.id]} size={13} />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.cardActionBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <ShareIcon color="#444" size={13} />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {/* Card title */}
                  <View style={styles.cardBody}>
                    <Text style={styles.cardTitle} numberOfLines={1}>{design.title}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={{ height: 20 }} />
        </ScrollView>
      </SafeAreaView>

      {/* ══════════════════════════════
          CARD DETAIL MODAL
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
              {/* Drag handle */}
              <View style={styles.modalDrag} />

              {/* Close button */}
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setSelectedCard(null)}
              >
                <CloseIcon size={12} />
              </TouchableOpacity>

              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.modalScrollContent}
              >
                {/* Post image */}
                <View style={styles.modalImage}>
                  <ImagePlaceholderIcon />
                </View>

                {/* User row — tap avatar or name to visit their profile */}
                <TouchableOpacity
                  style={styles.modalUserRow}
                  activeOpacity={0.75}
                  onPress={() => {
                    setSelectedCard(null);
                    navigation?.navigate('UserProfile', { username: selectedCard.user });
                  }}
                >
                  <View style={styles.modalAvatar}>
                    <Text style={styles.modalAvatarText}>{selectedCard.initial}</Text>
                  </View>
                  <View style={styles.modalUserInfo}>
                    <Text style={styles.modalUsername}>@{selectedCard.user}</Text>
                    <Text style={styles.modalTime}>Tap to view profile</Text>
                  </View>
                  <TouchableOpacity
                    style={styles.followBtn}
                    onPress={(e) => {
                      e.stopPropagation();
                    }}
                  >
                    <Text style={styles.followBtnText}>Follow</Text>
                  </TouchableOpacity>
                </TouchableOpacity>

                {/* Title + description */}
                <Text style={styles.modalTitle}>{selectedCard.title.replace('...', '')}</Text>
                <Text style={styles.modalDesc}>{selectedCard.description}</Text>

                {/* Like / Share / Shop */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    style={[
                      styles.actionCircle,
                      liked[selectedCard.id] && styles.actionCircleLiked,
                    ]}
                    onPress={() => toggleLiked(selectedCard.id)}
                  >
                    <HeartIcon filled={!!liked[selectedCard.id]} size={18} />
                    <Text style={styles.actionCircleCount}>
                      {liked[selectedCard.id] ? selectedCard.likes + 1 : selectedCard.likes}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.actionCircle}>
                    <ShareIcon color="#444" size={18} />
                    <Text style={styles.actionCircleCount}>{selectedCard.shares}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.shopBtn}
                    onPress={() => {
                      const card = selectedCard;
                      setSelectedCard(null);
                      navigation?.navigate('ShopTheLook', { design: card });
                    }}
                  >
                    <Text style={styles.shopBtnText}>Shop The Look</Text>
                  </TouchableOpacity>
                </View>

                {/* Products */}
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
                      <ImagePlaceholderIcon />
                    </View>
                    <View style={styles.productInfo}>
                      <Text style={styles.productName}>{p.name}</Text>
                      <Text style={styles.productBrand}>{p.brand}</Text>
                    </View>
                    <Text style={styles.productPrice}>{p.price}</Text>
                  </TouchableOpacity>
                ))}

                {/* Tags */}
                <Text style={[styles.sectionLabel, { marginTop: 20 }]}>TAGS</Text>
                <View style={styles.tagsWrap}>
                  {selectedCard.tags.map((tag) => (
                    <View
                      key={tag}
                      style={[
                        styles.tag,
                        tag === '#AIGenerated' || tag === '#ShopTheLook' ? styles.tagBlue : null,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tagText,
                          tag === '#AIGenerated' || tag === '#ShopTheLook' ? styles.tagTextBlue : null,
                        ]}
                      >
                        {tag}
                      </Text>
                    </View>
                  ))}
                </View>

                <View style={{ height: 24 }} />
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

              <View style={{ height: 24 }} />
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
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    color: '#000',
    letterSpacing: letterSpacing.tight,
    paddingHorizontal: space.lg,
    marginBottom: space.xs,
  },
  subtitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    color: colors.bluePrimary,
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
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    borderRadius: radius.md,
    height: 48,
    paddingLeft: space.md,
    paddingRight: space.xs,
    gap: space.sm,
    backgroundColor: '#F1F5F9',
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.sm,
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

  // Category filter pills
  tabsScroll: {
    marginHorizontal: 0,
  },
  tabsContent: {
    paddingHorizontal: space.lg,
    gap: space.sm,
    paddingVertical: space.sm,
  },
  // Inactive pill: transparent bg, border.light
  tab: {
    height: 36,
    paddingHorizontal: space.base,
    borderRadius: radius.sm,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Active pill: brand blue fill, no border
  tabActive: {
    backgroundColor: colors.bluePrimary,
    borderColor: 'transparent',
  },
  tabLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: 'rgba(0,0,0,0.6)',
  },
  tabLabelActive: {
    color: '#FFFFFF',
    fontWeight: fontWeight.bold,
  },
  tabBorder: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginBottom: space.md,
    marginTop: space.xs,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.md,
    paddingHorizontal: space.lg,
  },
  // Grid card — shadow.low + border.subtle
  card: {
    width: CARD_WIDTH,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
  },
  cardImg: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#D7D7D7',
    // radius.xl on card with overflow hidden clips the image — no separate radius needed
    borderRadius: radius.xl,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
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
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: '#111',
  },

  // Modal base
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  modalBackdrop: {
    flex: 1,
  },
  // Design detail sheet — shadow.high per spec
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    maxHeight: '88%',
    shadowColor: shadow.high.shadowColor,
    shadowOffset: shadow.high.shadowOffset,
    shadowOpacity: shadow.high.shadowOpacity,
    shadowRadius: shadow.high.shadowRadius,
    elevation: shadow.high.elevation,
  },
  modalDrag: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: space.md,
    marginBottom: space.xs,
  },
  modalCloseBtn: {
    position: 'absolute',
    top: space.base,
    right: space.lg,
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: '#F0F0F3',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  modalScrollContent: {
    paddingHorizontal: space.lg,
    paddingBottom: space['2xl'],
    paddingTop: space.md,
  },

  // Modal: image — radius.lg (inner element inside radius.xl sheet)
  modalImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#D7D7D7',
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.base,
    overflow: 'hidden',
  },

  // Modal: user row
  modalUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.md,
  },
  modalAvatar: {
    width: space['3xl'],
    height: space['3xl'],
    borderRadius: space['3xl'] / 2,
    backgroundColor: colors.bluePrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAvatarText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  modalUserInfo: {
    flex: 1,
  },
  modalUsername: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: '#111',
  },
  modalTime: {
    fontSize: fontSize.xs,
    color: '#A0A0A8',
    opacity: 0.44,
    marginTop: 1,
  },
  followBtn: {
    backgroundColor: colors.bluePrimary,
    borderRadius: radius.sm,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm,
  },
  followBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },

  // Modal: title + desc
  modalTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: '#111',
    letterSpacing: letterSpacing.tight,
    marginBottom: space.xs,
  },
  modalDesc: {
    fontSize: fontSize.base,
    color: '#555',
    opacity: 0.72,
    lineHeight: fontSize.base * 1.6,
    marginBottom: space.base,
  },

  // Modal: actions row
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginBottom: space.sm,
  },
  actionCircle: {
    width: 46,
    height: 46,
    borderRadius: radius.full,
    backgroundColor: '#F4F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  actionCircleLiked: {
    backgroundColor: 'rgba(239,68,68,0.08)',
  },
  actionCircleCount: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: '#555',
  },
  shopBtn: {
    flex: 1,
    height: 52,
    backgroundColor: colors.bluePrimary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: shadow.medium.shadowColor,
    shadowOffset: shadow.medium.shadowOffset,
    shadowOpacity: shadow.medium.shadowOpacity,
    shadowRadius: shadow.medium.shadowRadius,
    elevation: shadow.medium.elevation,
  },
  shopBtnText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
  },

  // Modal: products
  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#A0A0A8',
    letterSpacing: letterSpacing.wider,
    textTransform: 'uppercase',
    marginTop: space.xl,
    marginBottom: space.base,
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.sm,
  },
  productImg: {
    width: space['4xl'],
    height: space['4xl'],
    // Inner element inside sheet (radius.xl). Card padding = 12 → inner radius = 20-12 = 8 = radius.sm
    borderRadius: radius.md,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productInfo: {
    flex: 1,
  },
  productName: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: '#111',
  },
  productBrand: {
    fontSize: fontSize.xs,
    color: '#A0A0A8',
    opacity: 0.44,
    marginTop: space.xs,
  },
  productPrice: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.bluePrimary,
  },

  // Tags
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  tag: {
    backgroundColor: '#F4F4F6',
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  tagBlue: {
    backgroundColor: 'rgba(11,109,195,0.1)',
  },
  tagText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: '#555',
  },
  tagTextBlue: {
    color: colors.bluePrimary,
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
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: '#111',
    letterSpacing: letterSpacing.tight,
  },
  postShareBtn: {
    backgroundColor: colors.bluePrimary,
    borderRadius: radius.sm,
    paddingHorizontal: space.base,
    paddingVertical: space.sm,
  },
  postShareBtnText: {
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
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
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#555',
  },
  uploadSub: {
    fontSize: fontSize.xs,
    color: '#bbb',
    opacity: 0.44,
  },
  fieldLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#A0A0A8',
    letterSpacing: letterSpacing.wider,
    textTransform: 'uppercase',
    marginBottom: space.sm,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    fontSize: fontSize.sm,
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
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: '#555',
  },
  postTagChipTextSelected: {
    color: colors.bluePrimary,
  },

  // Empty state
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space['6xl'],
    paddingHorizontal: space['2xl'],
  },
  emptyStateTitle: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: '#111',
    marginBottom: space.sm,
    letterSpacing: letterSpacing.tight,
  },
  emptyStateSub: {
    fontSize: fontSize.base,
    color: '#A0A0A8',
    opacity: 0.44,
    textAlign: 'center',
    lineHeight: fontSize.base * 1.5,
  },
});
