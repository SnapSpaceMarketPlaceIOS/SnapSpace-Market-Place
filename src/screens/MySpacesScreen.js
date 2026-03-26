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
  ActivityIndicator,
  Modal,
  Image,
  Share,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path, Line, Polyline, Circle } from 'react-native-svg';
import { useFocusEffect } from '@react-navigation/native';
import CardImage from '../components/CardImage';
import { useAuth } from '../context/AuthContext';
import { getUserDesigns } from '../services/supabase';
import { colors } from '../constants/colors';

const { width: SW } = Dimensions.get('window');
const GRID_PAD = 16;
const GRID_GAP  = 10;
const THUMB_W   = (SW - GRID_PAD * 2 - GRID_GAP) / 2;
const THUMB_H   = THUMB_W * 1.2;

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

const DownloadIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <Polyline points="7 10 12 15 17 10" />
    <Line x1={12} y1={15} x2={12} y2={3} />
  </Svg>
);

const ShareIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={18} cy={5} r={3} /><Circle cx={6} cy={12} r={3} /><Circle cx={18} cy={19} r={3} />
    <Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
    <Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
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
      await Share.share({ message: `Check out my AI room design on SnapSpace: "${design?.prompt}"` });
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
          {/* Room image with side padding */}
          <View style={s.modalImgWrap}>
            <CardImage uri={design.image_url} style={s.modalImg} resizeMode="cover" />
          </View>

          {/* YOUR PROMPT */}
          <Text style={s.promptLabel}>YOUR PROMPT</Text>
          <Text style={s.promptText}>{design.prompt}</Text>

          {/* SHOP YOUR ROOM header with action icons */}
          {products.length > 0 && (
            <View style={s.productsSection}>
              <View style={s.shopHeaderRow}>
                <View>
                  <Text style={s.shopTitle}>SHOP YOUR ROOM</Text>
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
          if (!cancelled) setDesigns(data);
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
          <ActivityIndicator size="large" color={colors.bluePrimary} />
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
              <CardImage
                uri={item.image_url}
                style={s.thumbImg}
                resizeMode="cover"
              />
              {/* Prompt overlay at bottom */}
              <View style={s.thumbOverlay}>
                <Text style={s.thumbPrompt} numberOfLines={1}>{item.prompt}</Text>
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
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111' },

  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyTitle: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 8, textAlign: 'center' },
  emptySubtitle: { fontSize: 14, color: '#9CA3AF', textAlign: 'center', lineHeight: 20 },

  // ── Grid ──
  grid: { padding: GRID_PAD, paddingBottom: 40 },
  thumb: {
    width: THUMB_W,
    height: THUMB_H,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbOverlay: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  thumbPrompt: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '500',
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
    borderRadius: 12,
  },
  promptLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 24,
    marginHorizontal: 20,
  },
  promptText: {
    fontSize: 16,
    fontWeight: '500',
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
    color: '#9CA3AF',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  shopSubtitle: {
    fontSize: 13,
    color: '#6B7280',
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
    color: '#111',
    lineHeight: 17,
  },
  hCardBrand: {
    fontSize: 11,
    fontWeight: '400',
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
    color: '#111',
    marginLeft: 2,
  },
  hCardReviews: {
    fontSize: 10,
    color: '#6B7280',
  },
  hCardPrice: {
    fontSize: 14,
    fontWeight: '700',
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
