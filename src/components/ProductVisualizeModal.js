/**
 * ProductVisualizeModal — White card popup showing a single-product AI
 * visualization result with Shop Room link, Like/Download/Share icons,
 * and animated Add To Cart button.
 *
 * Color palette (from colors.js):
 *   bluePrimary: #0B6DC3   — text, CTA button
 *   blueLight:   #67ACE9   — liked heart, accents
 *   gray:        #D7D7D7   — icon borders, divider
 *   white:       #FFFFFF   — card bg, inverted button text
 *   black:       #000000   — overlay
 */
import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  Modal,
  StyleSheet,
  TouchableOpacity,
  Share,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import Svg, { Path, Line, Polyline } from 'react-native-svg';
import AutoImage from './AutoImage';
import { useLiked } from '../context/LikedContext';
import { useShared } from '../context/SharedContext';
import { space, fontWeight } from '../constants/tokens';
import { colors } from '../constants/colors';

const { width: SW } = Dimensions.get('window');
const CARD_W = SW - 40;
const CARD_RADIUS = 8;                         // fixed 8px corner radius for the card
const IMG_RADIUS = 8;                           // fixed 8px corner radius for the image

// Brand palette
const BLUE   = colors.bluePrimary; // #0B6DC3
const BLUE_L = colors.blueLight;   // #67ACE9
const GRAY   = colors.gray;        // #D7D7D7
const WHITE  = colors.white;       // #FFFFFF

// ── Icons ───────────────────────────────────────────────────────────────────

function HeartIcon({ filled = false, size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? BLUE_L : 'none'} stroke={filled ? BLUE_L : '#6B7280'} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function DownloadIconSvg({ size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Polyline points="7 10 12 15 17 10" />
      <Line x1={12} y1={15} x2={12} y2={3} />
    </Svg>
  );
}

function ShareIconSvg({ size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <Polyline points="16 6 12 2 8 6" />
      <Line x1={12} y1={2} x2={12} y2={15} />
    </Svg>
  );
}

function CloseIcon({ size = 16 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={WHITE} strokeWidth={2.4} strokeLinecap="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

// ── Animated Add To Cart Button ─────────────────────────────────────────────

function AnimatedCartButton({ priceDisplay, onPress }) {
  const anim = useRef(new Animated.Value(0)).current; // 0 = blue bg, 1 = white bg
  const [pressed, setPressed] = useState(false);

  const handlePressIn = () => {
    setPressed(true);
    Animated.timing(anim, {
      toValue: 1,
      duration: 200,
      useNativeDriver: false,
    }).start();
  };

  const handlePressOut = () => {
    setPressed(false);
    Animated.timing(anim, {
      toValue: 0,
      duration: 250,
      useNativeDriver: false,
    }).start();
  };

  const bgColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [BLUE, WHITE],
  });

  const textColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [WHITE, BLUE],
  });

  const dividerColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.3)', 'rgba(11,109,195,0.25)'],
  });

  const borderColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [BLUE, BLUE],
  });

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
    >
      <Animated.View style={[s.cartBtn, { backgroundColor: bgColor, borderColor }]}>
        <Animated.Text style={[s.cartBtnLabel, { color: textColor }]}>Add To Cart</Animated.Text>
        <Animated.View style={[s.cartDivider, { backgroundColor: dividerColor }]} />
        <Animated.Text style={[s.cartBtnPrice, { color: textColor }]}>{priceDisplay}</Animated.Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── Modal Component ─────────────────────────────────────────────────────────

export default function ProductVisualizeModal({
  visible,
  resultUri,
  product,
  designId,
  onClose,
  onAddToCart,
  onNavigateToProduct,
}) {
  const { toggleLiked, liked, toggleLikedProduct, likedProducts } = useLiked();
  const { addShared } = useShared();
  const [saving, setSaving] = useState(false);
  const [localLiked, setLocalLiked] = useState(false);

  if (!visible || !resultUri) return null;

  // Like state: use design-level like if designId exists, fallback to local toggle
  const isLiked = designId ? !!liked?.[designId] : localLiked;
  const productName = product?.name || 'Product';
  const truncatedName = productName.length > 36 ? productName.substring(0, 36) + '...' : productName;
  const priceDisplay = product?.priceDisplay || product?.salePriceDisplay || (product?.price ? `$${product.price}` : '$0');

  const handleLike = () => {
    if (designId) {
      // Design was saved to Supabase — use design-level like (appears in Profile → Liked → Wishes)
      toggleLiked(designId);
    } else if (product) {
      // Fallback: save wasn't successful — like the product locally
      toggleLikedProduct(product);
      setLocalLiked(prev => !prev);
    }
  };

  const handleShare = async () => {
    try {
      const msg = `Check out how this ${productName} looks in my space — made with HomeGenie!`;
      await Share.share({ message: msg, url: resultUri });
      if (designId) addShared(designId);
    } catch (e) {
      if (e.message !== 'User did not share') {
        console.warn('[Visualize] Share failed:', e.message);
      }
    }
  };

  const handleDownload = async () => {
    if (!resultUri || saving) return;
    setSaving(true);
    try {
      const fileUri = FileSystem.cacheDirectory + 'homegenie_visualize_' + Date.now() + '.jpg';
      const download = await FileSystem.downloadAsync(resultUri, fileUri);
      if (download.status === 200) {
        await Share.share({ url: fileUri });
      } else {
        // Download didn't return 200 — fall back to sharing the URL
        await Share.share({ message: `See how this product looks in my space!\n\n${resultUri}` });
      }
    } catch (e) {
      console.warn('[Visualize] Download failed:', e.message);
      try {
        await Share.share({ message: `See how this product looks in my space!\n\n${resultUri}` });
      } catch {
        Alert.alert('Could Not Save', 'Please screenshot the image to save it.');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={s.overlay}>
        {/* Close button */}
        <TouchableOpacity
          style={s.closeBtn}
          onPress={onClose}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          activeOpacity={0.7}
        >
          <CloseIcon />
        </TouchableOpacity>

        {/* ── White card ──────────────────────────────────────────── */}
        <View style={s.card}>
          {/* Generated image */}
          <View style={s.imageWrap}>
            <AutoImage
              uri={resultUri}
              width={CARD_W - 24}
              borderRadius={IMG_RADIUS}
            />
          </View>

          {/* Shop Room + Return To + Icons row */}
          <View style={s.infoRow}>
            <View style={s.infoLeft}>
              <Text style={s.shopLabel}>Shop Room</Text>
              <TouchableOpacity
                onPress={() => onNavigateToProduct?.(product)}
                activeOpacity={0.6}
                hitSlop={{ top: 6, bottom: 6, left: 4, right: 4 }}
              >
                <Text style={s.returnLink} numberOfLines={1}>
                  Return To: ( {truncatedName} )...
                </Text>
              </TouchableOpacity>
            </View>
            <View style={s.iconRow}>
              <TouchableOpacity onPress={handleLike} activeOpacity={0.6} style={s.iconBtn}>
                <HeartIcon filled={isLiked} />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleDownload} activeOpacity={0.6} style={s.iconBtn} disabled={saving}>
                <DownloadIconSvg />
              </TouchableOpacity>
              <TouchableOpacity onPress={handleShare} activeOpacity={0.6} style={s.iconBtn}>
                <ShareIconSvg />
              </TouchableOpacity>
            </View>
          </View>

          {/* Divider */}
          <View style={s.divider} />

          {/* Animated Add To Cart button */}
          <AnimatedCartButton
            priceDisplay={priceDisplay}
            onPress={() => onAddToCart?.(product)}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  // ── White card — 10% corner radius
  card: {
    width: CARD_W,
    backgroundColor: WHITE,
    borderRadius: CARD_RADIUS,
    paddingTop: 12,
    paddingBottom: 16,
    paddingHorizontal: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },

  // ── Image — inset radius so corners sit flush inside the card
  imageWrap: {
    width: CARD_W - 24,
    borderRadius: IMG_RADIUS,
    overflow: 'hidden',
    marginBottom: 14,
  },

  // ── Info row
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
    marginBottom: 12,
  },
  infoLeft: {
    flex: 1,
    marginRight: 8,
  },
  shopLabel: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: BLUE,
    marginBottom: 2,
  },
  returnLink: {
    fontSize: 13,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: BLUE,
  },

  // ── Icon buttons
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: GRAY,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Divider
  divider: {
    height: 1,
    backgroundColor: GRAY,
    marginHorizontal: 4,
    marginBottom: 14,
  },

  // ── Add To Cart button (animated bg/text via AnimatedCartButton)
  cartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    marginHorizontal: 4,
  },
  cartBtnLabel: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    letterSpacing: -0.2,
  },
  cartDivider: {
    width: 1,
    height: 22,
    marginHorizontal: 14,
  },
  cartBtnPrice: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
  },
});
