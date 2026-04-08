/**
 * MySpacesScreen — Gallery of all AI-generated designs saved to the user's account.
 *
 * Layout: 2-column grid of room image thumbnails.
 * Tap a space → opens a full-screen detail modal with:
 *   - Room image (with side padding + border-radius)
 *   - YOUR PROMPT label + prompt text
 *   - SHOP YOUR ROOM section + horizontal product cards
 *   - Action icons (download, post, share) in the header row
 */

import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  ScrollView,
  Dimensions,
  Modal,
  Image,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Line, Polyline, Circle } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import CardImage from '../components/CardImage';
import AutoImage from '../components/AutoImage';
import LensLoader from '../components/LensLoader';
import { useAuth } from '../context/AuthContext';
import { getUserDesigns } from '../services/supabase';
import { colors } from '../constants/colors';

const { width: SW } = Dimensions.get('window');
const GRID_PAD = 20;
const GRID_GAP  = 12;
const THUMB_W   = (SW - GRID_PAD * 2 - GRID_GAP) / 2;

// ── Icons ──────────────────────────────────────────────────────────────────────

const BackIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="15 18 9 12 15 6" />
  </Svg>
);

const CloseIcon = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Line x1={18} y1={6} x2={6} y2={18} /><Line x1={6} y1={6} x2={18} y2={18} />
  </Svg>
);

// 531-309 "Load_circle_light" — download (arrow down + arc tray)
const DownloadIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 30 30" fill="none">
    <Path
      d="M6.54815 18.5147C7.04668 20.3752 8.1452 22.0193 9.67334 23.1918C11.2015 24.3644 13.0738 25 15 25C16.9262 25 18.7985 24.3644 20.3267 23.1918C21.8548 22.0193 22.9533 20.3752 23.4519 18.5147"
      stroke="#111827" strokeWidth={1.4} strokeLinecap="round"
    />
    <Path
      d="M15 16.25L14.6877 16.6404L15 16.8903L15.3123 16.6404L15 16.25ZM15.5 5C15.5 4.72386 15.2761 4.5 15 4.5C14.7239 4.5 14.5 4.72386 14.5 5L15 5L15.5 5ZM8.75 11.25L8.43765 11.6404L14.6877 16.6404L15 16.25L15.3123 15.8596L9.06235 10.8596L8.75 11.25ZM15 16.25L15.3123 16.6404L21.5623 11.6404L21.25 11.25L20.9377 10.8596L14.6877 15.8596L15 16.25ZM15 16.25L15.5 16.25L15.5 5L15 5L14.5 5L14.5 16.25L15 16.25Z"
      fill="#111827"
    />
  </Svg>
);

// 531-313 "Download_circle_light" — share (arrow up + arc tray)
const ShareIcon = () => (
  <Svg width={22} height={22} viewBox="0 0 30 30" fill="none">
    <Path
      d="M6.54815 18.5147C7.04668 20.3752 8.1452 22.0193 9.67334 23.1918C11.2015 24.3644 13.0738 25 15 25C16.9262 25 18.7985 24.3644 20.3267 23.1918C21.8548 22.0193 22.9533 20.3752 23.4519 18.5147"
      stroke="#111827" strokeWidth={1.4} strokeLinecap="round"
    />
    <Path
      d="M15 5L14.6877 4.60957L15 4.35969L15.3123 4.60957L15 5ZM15.5 16.25C15.5 16.5261 15.2761 16.75 15 16.75C14.7239 16.75 14.5 16.5261 14.5 16.25L15 16.25L15.5 16.25ZM8.75 10L8.43765 9.60957L14.6877 4.60957L15 5L15.3123 5.39043L9.06235 10.3904L8.75 10ZM15 5L15.3123 4.60957L21.5623 9.60957L21.25 10L20.9377 10.3904L14.6877 5.39043L15 5ZM15 5L15.5 5L15.5 16.25L15 16.25L14.5 16.25L14.5 5L15 5Z"
      fill="#111827"
    />
  </Svg>
);

const StarIconSmall = ({ filled = true, size = 10 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#67ACE9' : '#E5E7EB'} stroke="none">
    <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </Svg>
);

// ── Horizontal Product Card ────────────────────────────────────────────────────

function ProductCard({ product, onPress }) {
  const priceVal = product.priceValue ?? product.price;
  const priceStr = typeof priceVal === 'number'
    ? `$${priceVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : product.priceLabel || String(priceVal).replace(/^\$+/, '$');

  return (
    <TouchableOpacity style={s.hCard} activeOpacity={0.7} onPress={onPress}>
      <CardImage uri={product.imageUrl} style={s.hCardImg} resizeMode="cover" />
      <View style={s.hCardBody}>
        <Text style={s.hCardName} numberOfLines={2}>{product.name}</Text>
        <Text style={s.hCardBrand} numberOfLines={1}>{product.brand}</Text>
        {!!product.rating && (
          <View style={s.hCardRating}>
            {[1,2,3,4,5].map(i => (
              <StarIconSmall key={i} size={10} filled={i <= Math.round(product.rating)} />
            ))}
            <Text style={s.hCardRatingText}>{product.rating.toFixed(1)}</Text>
            {!!product.reviewCount && (
              <Text style={s.hCardReviews}>({product.reviewCount.toLocaleString()})</Text>
            )}
          </View>
        )}
        <Text style={s.hCardPrice}>{priceStr}</Text>
      </View>
      <View style={s.hCardAddBtn}>
        <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5}>
          <Line x1={12} y1={5} x2={12} y2={19} />
          <Line x1={5} y1={12} x2={19} y2={12} />
        </Svg>
      </View>
    </TouchableOpacity>
  );
}

// ── Detail Modal (same layout as AI result page) ───────────────────────────────

function SpaceDetailModal({ design, visible, onClose, navigation }) {
  const insets = useSafeAreaInsets();
  const products = design?.products || [];

  const handleShare = async () => {
    try {
      await Share.share({ message: `Check out my AI room design on HomeGenie: "${design?.prompt}"` });
    } catch (e) {}
  };

  if (!design) return null;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.modalRoot} edges={['top']}>
        {/* Header */}
        <View style={s.modalHeader}>
          <TouchableOpacity style={s.modalCloseBtn} onPress={onClose}>
            <CloseIcon />
          </TouchableOpacity>
          <Text style={s.modalHeaderTitle} numberOfLines={1}>{design.prompt || 'My Space'}</Text>
          <View style={{ width: 44 }} />
        </View>

        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>
          {/* Room image — natural aspect ratio */}
          <View style={s.modalImgWrap}>
            <AutoImage uri={design.image_url} borderRadius={9} />
          </View>

          {/* Divider */}
          <View style={s.modalDivider} />

          {/* YOUR PROMPT */}
          <Text style={s.promptLabel}>YOUR PROMPT</Text>
          <Text style={s.promptText}>{design.prompt}</Text>

          {/* Divider */}
          <View style={s.modalDivider} />

          {/* SHOP ROOM header with action icons */}
          {products.length > 0 && (
            <View style={s.productsSection}>
              <View style={s.shopHeaderRow}>
                <View>
                  <Text style={s.shopTitle}>SHOP ROOM</Text>
                  <Text style={s.shopSubtitle}>Products matched to your design</Text>
                </View>
                <View style={s.shopActions}>
                  <TouchableOpacity style={s.shopActionBtn} onPress={handleShare}>
                    <ShareIcon />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Horizontal cards */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 10, paddingRight: 20, paddingTop: 12 }}
              >
                {products.map((p, i) => (
                  <ProductCard
                    key={p.id || i}
                    product={p}
                    onPress={() => {
                      onClose();
                      navigation?.navigate('ProductDetail', { product: p });
                    }}
                  />
                ))}
              </ScrollView>

              <Text style={s.ftc}>We may earn a commission when you buy through links on this app.</Text>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function MySpacesScreen({ navigation }) {
  const { user } = useAuth();
  const [designs, setDesigns]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!user?.id) { setLoading(false); return; }
      let cancelled = false;
      (async () => {
        try {
          const data = await getUserDesigns(user.id);
          if (!cancelled) setDesigns(data.filter(d => !!d.image_url));
        } catch (e) {
          console.warn('MySpaces load failed:', e.message);
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
      return () => { cancelled = true; };
    }, [user?.id])
  );

  return (
    <SafeAreaView style={s.root} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation.goBack()}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My Spaces</Text>
        <View style={{ width: 44 }} />
      </View>

      {loading ? (
        <View style={s.center}>
          <LensLoader size={48} />
        </View>
      ) : designs.length === 0 ? (
        <View style={s.center}>
          <Text style={s.emptyTitle}>No spaces yet</Text>
          <Text style={s.emptySubtitle}>
            Generate a design from the Snap tab, then post it to see it here.
          </Text>
        </View>
      ) : (
        <FlatList
          data={designs}
          keyExtractor={(item) => item.id?.toString() || String(Math.random())}
          numColumns={2}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.grid}
          columnWrapperStyle={{ gap: GRID_GAP }}
          ItemSeparatorComponent={() => <View style={{ height: GRID_GAP }} />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={s.thumb}
              activeOpacity={0.85}
              onPress={() => setSelected(item)}
            >
              <View style={s.thumbImgContainer}>
                <CardImage
                  uri={item.image_url}
                  style={s.thumbImg}
                  resizeMode="cover"
                />
              </View>
              <View style={s.thumbPromptBox}>
                <Text style={s.thumbPrompt} numberOfLines={2}>{item.prompt}</Text>
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* Detail modal */}
      <SpaceDetailModal
        design={selected}
        visible={!!selected}
        onClose={() => setSelected(null)}
        navigation={navigation}
      />
    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FFFFFF' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  backBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111', fontFamily: 'KantumruyPro_700Bold'},

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 8, textAlign: 'center', fontFamily: 'KantumruyPro_700Bold'},
  emptySubtitle: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 20, fontFamily: 'KantumruyPro_400Regular'},

  // ── Grid ──
  grid: { padding: GRID_PAD, paddingBottom: 40 },
  thumb: {
    width: THUMB_W,
  },
  thumbImgContainer: {
    width: THUMB_W,
    height: THUMB_W,
    borderRadius: 5,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbPromptBox: {
    backgroundColor: '#F5F6F8',
    borderRadius: 5,
    marginTop: 6,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  thumbPrompt: {
    color: '#374151',
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'KantumruyPro_500Medium',
    lineHeight: 16,
  },

  // ── Detail Modal ──
  modalRoot: { flex: 1, backgroundColor: '#FFFFFF' },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  modalCloseBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderTitle: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'KantumruyPro_600SemiBold',
    color: '#111',
    textAlign: 'center',
    marginHorizontal: 8,
  },
  modalImgWrap: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  modalImg: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 9,
  },
  modalDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginHorizontal: 20,
    marginVertical: 16,
  },
  promptLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'KantumruyPro_600SemiBold',
    color: '#9CA3AF',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 0,
    marginHorizontal: 20,
  },
  promptText: {
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'KantumruyPro_500Medium',
    color: '#111827',
    lineHeight: 22,
    marginTop: 6,
    marginHorizontal: 20,
  },
  productsSection: {
    marginTop: 24,
    paddingLeft: 20,
  },
  shopHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingRight: 20,
    marginBottom: 0,
  },
  shopTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'KantumruyPro_700Bold',
    color: '#9CA3AF',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  shopSubtitle: {
    fontSize: 13,
    fontFamily: 'KantumruyPro_400Regular',
    color: '#67ACE9',
    marginTop: 3,
  },
  shopActions: { flexDirection: 'row', gap: 8 },
  shopActionBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: '#F3F4F6',
    alignItems: 'center', justifyContent: 'center',
  },
  ftc: {
    fontSize: 11,
    fontFamily: 'KantumruyPro_400Regular',
    color: '#9CA3AF',
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 16,
    paddingRight: 20,
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
    paddingBottom: 36,
    gap: 2,
  },
  hCardName: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'KantumruyPro_600SemiBold',
    color: '#111',
    lineHeight: 17,
  },
  hCardBrand: {
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'KantumruyPro_400Regular',
    color: '#9CA3AF',
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
    fontFamily: 'KantumruyPro_600SemiBold',
    color: '#111',
    marginLeft: 2,
  },
  hCardReviews: {
    fontSize: 10,
    fontFamily: 'KantumruyPro_400Regular',
    color: '#6B7280',
  },
  hCardPrice: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'KantumruyPro_700Bold',
    color: colors.bluePrimary,
    marginTop: 4,
  },
  hCardAddBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.bluePrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
