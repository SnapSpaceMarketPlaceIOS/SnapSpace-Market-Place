/**
 * ProductVisualizeModal — Full-screen product visualization sheet.
 *
 * Displays the AI-generated room image with the selected product,
 * plus complete product details (title, description, rating, price,
 * expandable sections). Slides down from the top with a spring animation.
 *
 * Props:
 *   visible             — boolean to show/hide the modal
 *   resultUri           — URL of the generated room image
 *   product             — product object from catalog
 *   designId            — optional design ID for like/share tracking
 *   onClose             — called when the modal is dismissed
 *   onAddToCart          — called with the product when Add to Cart is tapped
 *   onNavigateToProduct  — called when "Return To" link is tapped
 */
import React, { useState, useRef, useEffect } from 'react';
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
  ScrollView,
  Easing,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import Svg, { Path, Line } from 'react-native-svg';
import AutoImage from './AutoImage';
import { useLiked } from '../context/LikedContext';
import { useShared } from '../context/SharedContext';
import { space, fontWeight, layout, typeScale, radius, shadow, fontSize } from '../constants/tokens';
import { colors } from '../constants/colors';
import { colors as C } from '../constants/theme';
import { buildShareMessage } from '../services/shareService';

const { width: SW, height: SH } = Dimensions.get('window');
const H_PAD = layout.screenPaddingH; // 20

// Brand palette
const BLUE   = colors.bluePrimary;  // #0B6DC3
const BLUE_L = colors.blueLight;    // #67ACE9
const WHITE  = '#FFFFFF';
const TEXT_1  = C.textPrimary;      // #111827
const TEXT_2  = C.textSecondary;    // #6B7280
const TEXT_3  = C.textTertiary;     // #9CA3AF
const BORDER = C.border;            // #E5E7EB

// ── Icons (canonical versions) ─────────────────────────────────────────────

function HeartIcon({ filled = false, size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? BLUE_L : 'none'} stroke={filled ? BLUE_L : TEXT_2} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function DownloadIconSvg({ size = 20, color = TEXT_2 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30" fill="none">
      <Path
        d="M6.54815 18.5147C7.04668 20.3752 8.1452 22.0193 9.67334 23.1918C11.2015 24.3644 13.0738 25 15 25C16.9262 25 18.7985 24.3644 20.3267 23.1918C21.8548 22.0193 22.9533 20.3752 23.4519 18.5147"
        stroke={color} strokeWidth={1.4} strokeLinecap="round"
      />
      <Path
        d="M15 16.25L14.6877 16.6404L15 16.8903L15.3123 16.6404L15 16.25ZM15.5 5C15.5 4.72386 15.2761 4.5 15 4.5C14.7239 4.5 14.5 4.72386 14.5 5L15 5L15.5 5ZM8.75 11.25L8.43765 11.6404L14.6877 16.6404L15 16.25L15.3123 15.8596L9.06235 10.8596L8.75 11.25ZM15 16.25L15.3123 16.6404L21.5623 11.6404L21.25 11.25L20.9377 10.8596L14.6877 15.8596L15 16.25ZM15 16.25L15.5 16.25L15.5 5L15 5L14.5 5L14.5 16.25L15 16.25Z"
        fill={color}
      />
    </Svg>
  );
}

function ShareIconSvg({ size = 20, color = TEXT_2 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30" fill="none">
      <Path
        d="M6.54815 18.5147C7.04668 20.3752 8.1452 22.0193 9.67334 23.1918C11.2015 24.3644 13.0738 25 15 25C16.9262 25 18.7985 24.3644 20.3267 23.1918C21.8548 22.0193 22.9533 20.3752 23.4519 18.5147"
        stroke={color} strokeWidth={1.4} strokeLinecap="round"
      />
      <Path
        d="M15 5L14.6877 4.60957L15 4.35969L15.3123 4.60957L15 5ZM15.5 16.25C15.5 16.5261 15.2761 16.75 15 16.75C14.7239 16.75 14.5 16.5261 14.5 16.25L15 16.25L15.5 16.25ZM8.75 10L8.43765 9.60957L14.6877 4.60957L15 5L15.3123 5.39043L9.06235 10.3904L8.75 10ZM15 5L15.3123 4.60957L21.5623 9.60957L21.25 10L20.9377 10.3904L14.6877 5.39043L15 5ZM15 5L15.5 5L15.5 16.25L15 16.25L14.5 16.25L14.5 5L15 5Z"
        fill={color}
      />
    </Svg>
  );
}

function CloseIcon({ size = 14, color = TEXT_1 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

function StarSmall({ filled, size = 13 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? '#67ACE9' : '#E5E7EB'}
      stroke={filled ? '#67ACE9' : '#D1D5DB'}
      strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
    >
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  );
}

function ChevronRight({ size = 14, color = TEXT_3 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M9 18l6-6-6-6" />
    </Svg>
  );
}

// ── Rating Row ─────────────────────────────────────────────────────────────

function RatingRow({ rating = 0, reviewCount = 0 }) {
  const filled = Math.floor(rating);
  const hasPartial = rating - filled >= 0.25;

  return (
    <View style={s.ratingRow}>
      <View style={s.stars}>
        {[1, 2, 3, 4, 5].map(i => (
          <StarSmall key={i} filled={i <= filled || (i === filled + 1 && hasPartial)} />
        ))}
      </View>
      <Text style={s.ratingScore}>{rating}</Text>
      <Text style={s.reviewCount}>({reviewCount} Reviews) ›</Text>
    </View>
  );
}

// ── Expandable Section Row ─────────────────────────────────────────────────

function SectionRow({ label, expanded, onToggle, children }) {
  return (
    <>
      <TouchableOpacity style={s.sectionRow} onPress={onToggle} activeOpacity={0.6}>
        <View style={s.sectionBar} />
        <Text style={s.sectionLabel}>{label}</Text>
        <ChevronRight size={14} color={TEXT_3} />
      </TouchableOpacity>
      {expanded && children && (
        <View style={s.sectionContent}>{children}</View>
      )}
    </>
  );
}

// ── Detail Key-Value Item ──────────────────────────────────────────────────

function DetailItem({ label, value }) {
  return (
    <View style={s.detailItem}>
      <Text style={s.detailLabel}>{label}</Text>
      <Text style={s.detailValue}>{value}</Text>
    </View>
  );
}

// ── Animated Add To Cart Button ────────────────────────────────────────────

function AnimatedCartButton({ priceDisplay, onPress }) {
  const anim = useRef(new Animated.Value(0)).current;

  const handlePressIn = () => {
    Animated.timing(anim, { toValue: 1, duration: 200, useNativeDriver: false }).start();
  };
  const handlePressOut = () => {
    Animated.timing(anim, { toValue: 0, duration: 250, useNativeDriver: false }).start();
  };

  const bgColor = anim.interpolate({ inputRange: [0, 1], outputRange: [BLUE, WHITE] });
  const textColor = anim.interpolate({ inputRange: [0, 1], outputRange: [WHITE, BLUE] });
  const dividerColor = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255,255,255,0.3)', 'rgba(11,109,195,0.25)'],
  });

  return (
    <TouchableOpacity
      activeOpacity={1}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      onPress={onPress}
    >
      <Animated.View style={[s.cartBtn, { backgroundColor: bgColor, borderColor: BLUE }]}>
        <Animated.Text style={[s.cartBtnLabel, { color: textColor }]}>Add to Cart</Animated.Text>
        <Animated.View style={[s.cartDivider, { backgroundColor: dividerColor }]} />
        <Animated.Text style={[s.cartBtnPrice, { color: textColor }]}>{priceDisplay}</Animated.Text>
      </Animated.View>
    </TouchableOpacity>
  );
}

// ── Modal Component ────────────────────────────────────────────────────────

export default function ProductVisualizeModal({
  visible,
  resultUri,
  product,
  designId,
  onClose,
  onAddToCart,
  onNavigateToProduct,
}) {
  const insets = useSafeAreaInsets();
  const { toggleLiked, liked, toggleLikedProduct } = useLiked();
  const { addShared } = useShared();
  const [saving, setSaving] = useState(false);
  const [localLiked, setLocalLiked] = useState(false);
  const [descExpanded, setDescExpanded] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [featuresOpen, setFeaturesOpen] = useState(false);

  // ── Animation state ──────────────────────────────────────────────────
  const slideY = useRef(new Animated.Value(-SH)).current;
  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const [modalVisible, setModalVisible] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Animate IN when `visible` becomes true
  useEffect(() => {
    if (visible && resultUri) {
      setModalVisible(true);
      slideY.setValue(-SH);
      overlayOpacity.setValue(0);
      setDescExpanded(false);
      setDetailsOpen(false);
      setFeaturesOpen(false);
      setLocalLiked(false);

      requestAnimationFrame(() => {
        Animated.parallel([
          Animated.spring(slideY, {
            toValue: 0,
            damping: 26,
            stiffness: 220,
            mass: 0.8,
            useNativeDriver: true,
          }),
          Animated.timing(overlayOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }
  }, [visible, resultUri]);

  // Animate OUT when parent sets `visible={false}` (e.g. Add to Cart fires
  // setVisualizeResult(null) on HomeScreen). Without this effect, the modal's
  // internal modalVisible stayed true after the parent dismissed — the sheet
  // kept rendering with stale props (product became undefined), and any
  // subsequent tap on cached buttons would crash with `undefined.name` in
  // CartContext.addToCart. The effect mirrors handleClose's animation so the
  // dismissal looks the same whether the user tapped X or the parent closed.
  useEffect(() => {
    if (!visible && modalVisible) {
      Animated.parallel([
        Animated.timing(slideY, {
          toValue: -SH,
          duration: 280,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 250,
          useNativeDriver: true,
        }),
      ]).start(() => {
        if (mountedRef.current) setModalVisible(false);
      });
    }
  }, [visible, modalVisible]);

  // Animate OUT + dismiss
  const handleClose = () => {
    Animated.parallel([
      Animated.timing(slideY, {
        toValue: -SH,
        duration: 280,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(overlayOpacity, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }),
    ]).start(() => {
      if (mountedRef.current) {
        setModalVisible(false);
      }
      onClose?.();
    });
  };

  if (!modalVisible) return null;

  // ── Derived values ───────────────────────────────────────────────────
  const isLiked = designId ? !!liked?.[designId] : localLiked;
  const productName = product?.name || 'Product';
  const priceDisplay =
    product?.priceDisplay ||
    product?.salePriceDisplay ||
    (product?.price ? `$${product.price}` : '$0');

  // Robust price formatting — handles number, string with $, or fallback
  const priceFormatted = (() => {
    const raw = product?.price;
    if (raw == null) return priceDisplay;
    const num = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/[^0-9.]/g, ''));
    if (isNaN(num)) return priceDisplay;
    return `$${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  })();

  // Capitalize slug strings ("living-room" → "Living Room"), handle arrays
  const formatLabel = (val) => {
    if (Array.isArray(val)) return val.map(formatLabel).join(', ');
    if (typeof val !== 'string' || !val) return String(val ?? '');
    return val.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  };

  // ── Handlers ─────────────────────────────────────────────────────────
  const handleLike = () => {
    if (designId) {
      toggleLiked(designId);
    } else if (product) {
      toggleLikedProduct(product);
      setLocalLiked(prev => !prev);
    }
  };

  const handleShare = async () => {
    // Build 124 — bring single-product visualize share inline with the
    // Build 122 full-room pattern:
    //   1. Brand-first caption via buildShareMessage() — drops the
    //      wall-of-text Amazon product name that was filling iMessage.
    //   2. Download FAL render to local cache so the image persists in
    //      the recipient's thread (FAL CDN URLs eventually expire).
    //   3. Resilient fallback chain: if download fails, share the remote
    //      URL with the same caption — better than nothing.
    const msg = buildShareMessage();
    try {
      if (resultUri) {
        try {
          const fileUri = FileSystem.cacheDirectory + 'homegenie_visualize_' + Date.now() + '.jpg';
          const { status } = await FileSystem.downloadAsync(resultUri, fileUri);
          if (status === 200) {
            await Share.share({ message: msg, url: fileUri });
          } else {
            throw new Error('Download status ' + status);
          }
        } catch {
          await Share.share({ message: msg, url: resultUri });
        }
      } else {
        await Share.share({ message: msg });
      }
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

  const handleNavigateToProduct = () => {
    handleClose();
    // Small delay so close animation starts before navigation
    setTimeout(() => onNavigateToProduct?.(product), 100);
  };

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Dark overlay — tap to dismiss */}
      <Animated.View
        style={[StyleSheet.absoluteFill, s.overlay, { opacity: overlayOpacity }]}
        pointerEvents="auto"
      >
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={handleClose}
        />
      </Animated.View>

      {/* ── Sliding sheet ──────────────────────────────────────────── */}
      <Animated.View
        style={[s.sheet, { transform: [{ translateY: slideY }], paddingTop: insets.top }]}
      >
        {/* Scrollable content */}
        <ScrollView
          style={s.scroll}
          contentContainerStyle={[s.scrollContent, { paddingBottom: 90 + insets.bottom }]}
          showsVerticalScrollIndicator={false}
          bounces
        >
          {/* ── Room Image + Close button overlay ────────────────── */}
          <View style={s.imageContainer}>
            <View style={s.imageWrap}>
              <AutoImage
                uri={resultUri}
                width={SW - H_PAD * 2}
                borderRadius={12}
              />
            </View>
            <TouchableOpacity
              style={s.closeBtn}
              onPress={handleClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              activeOpacity={0.7}
            >
              <CloseIcon size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* ── Shop Room + Return To ────────────────────────────── */}
          <View style={s.shopRow}>
            <Text style={s.shopLabel}>Shop Room:</Text>
            <TouchableOpacity
              onPress={handleNavigateToProduct}
              activeOpacity={0.6}
              style={s.returnBtn}
            >
              <Text style={s.returnLink} numberOfLines={1}>
                Return To: ( {productName} )...
              </Text>
            </TouchableOpacity>
          </View>

          {/* ── Divider ──────────────────────────────────────────── */}
          <View style={s.divider} />

          {/* ── Product Title ────────────────────────────────────── */}
          <Text style={s.productTitle}>{productName}</Text>

          {/* ── Description + Read more ──────────────────────────── */}
          {product?.description ? (
            <>
              <Text
                style={s.description}
                numberOfLines={descExpanded ? undefined : 3}
              >
                {product.description}
              </Text>
              <TouchableOpacity
                onPress={() => setDescExpanded(prev => !prev)}
                activeOpacity={0.6}
              >
                <Text style={s.readMore}>
                  {descExpanded ? 'Show less' : 'Read more'}
                </Text>
              </TouchableOpacity>
            </>
          ) : null}

          {/* ── Star Rating ──────────────────────────────────────── */}
          {product?.rating ? (
            <RatingRow
              rating={product.rating}
              reviewCount={product.reviewCount || 0}
            />
          ) : null}

          {/* ── Price + Action Icons ─────────────────────────────── */}
          <View style={s.priceRow}>
            <Text style={s.price}>{priceFormatted}</Text>
            <View style={s.iconRow}>
              <TouchableOpacity
                onPress={handleLike}
                activeOpacity={0.6}
                style={s.iconBtn}
              >
                <HeartIcon filled={isLiked} />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleDownload}
                activeOpacity={0.6}
                style={s.iconBtn}
                disabled={saving}
              >
                <DownloadIconSvg />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleShare}
                activeOpacity={0.6}
                style={s.iconBtn}
              >
                <ShareIconSvg />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Product Details (expandable) ─────────────────────── */}
          <SectionRow
            label="PRODUCT DETAILS"
            expanded={detailsOpen}
            onToggle={() => setDetailsOpen(prev => !prev)}
          >
            <View style={s.detailGrid}>
              {product?.brand ? (
                <DetailItem label="Brand" value={product.brand} />
              ) : null}
              {product?.category ? (
                <DetailItem label="Category" value={formatLabel(product.category)} />
              ) : null}
              {product?.roomType ? (
                <DetailItem label="Room Type" value={formatLabel(product.roomType)} />
              ) : null}
              {product?.source ? (
                <DetailItem label="Source" value={formatLabel(product.source)} />
              ) : null}
              {/* Include product.details table if available */}
              {product?.details && typeof product.details === 'object'
                ? Object.entries(product.details).map(([key, val]) => (
                    <DetailItem key={key} label={key} value={String(val)} />
                  ))
                : null}
            </View>
          </SectionRow>

          {/* ── Key Features (expandable) ────────────────────────── */}
          <SectionRow
            label="KEY FEATURES"
            expanded={featuresOpen}
            onToggle={() => setFeaturesOpen(prev => !prev)}
          >
            <View style={s.detailGrid}>
              {product?.materials?.length > 0 ? (
                <DetailItem
                  label="Materials"
                  value={product.materials.map(formatLabel).join(', ')}
                />
              ) : null}
              {product?.styles?.length > 0 ? (
                <DetailItem
                  label="Styles"
                  value={product.styles.map(formatLabel).join(', ')}
                />
              ) : null}
              {/* Show product.features bullet list if available */}
              {product?.features?.length > 0 ? (
                <View style={s.featureList}>
                  {product.features.map((f, i) => (
                    <Text key={i} style={s.featureBullet}>•  {f}</Text>
                  ))}
                </View>
              ) : null}
            </View>
          </SectionRow>
        </ScrollView>

        {/* ── Sticky Bottom CTA ──────────────────────────────────── */}
        <View style={[s.stickyBar, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <AnimatedCartButton
            priceDisplay={priceDisplay}
            onPress={() => {
              // Guard against stale props: when parent fires
              // setVisualizeResult(null) after Add to Cart, `product` can be
              // undefined on the next tap. Without this check, addToCart
              // dereferences undefined.name and crashes the app.
              if (product) onAddToCart?.(product);
            }}
          />
        </View>
      </Animated.View>
    </Modal>
  );
}

// ── Styles ──────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  // ── Overlay
  overlay: {
    backgroundColor: 'rgba(0,0,0,0.55)',
  },

  // ── Full-screen sheet
  sheet: {
    flex: 1,
    backgroundColor: WHITE,
  },

  // ── ScrollView
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: space.base,
    paddingHorizontal: H_PAD,
  },

  // ── Room image + close button container
  imageContainer: {
    position: 'relative',
    marginBottom: space.base,
  },
  imageWrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
    ...shadow.md,
  },
  // ── Close button — white X overlaying image top-right, no background
  closeBtn: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
    // Drop shadow so white X is visible on light images
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.5,
    shadowRadius: 3,
    elevation: 6,
  },

  // ── Shop Room header row
  shopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: space.sm,
  },
  shopLabel: {
    fontSize: typeScale.headline.fontSize,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: TEXT_1,
  },
  returnBtn: {
    flex: 1,
  },
  returnLink: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: BLUE,
  },

  // ── Divider
  divider: {
    height: 1,
    backgroundColor: BORDER,
    marginBottom: space.base,
  },

  // ── Product title
  productTitle: {
    ...typeScale.displaySm,
    fontFamily: 'Geist_700Bold',
    color: TEXT_1,
    marginBottom: space.md,
  },

  // ── Description
  description: {
    ...typeScale.body,
    fontFamily: 'Geist_400Regular',
    color: TEXT_2,
    marginBottom: space.xs,
  },
  readMore: {
    ...typeScale.button,
    fontFamily: 'Geist_600SemiBold',
    color: BLUE,
    marginBottom: space.base,
  },

  // ── Rating row
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.base,
    gap: space.xs,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
    marginRight: 6,
  },
  ratingScore: {
    ...typeScale.button,
    fontFamily: 'Geist_600SemiBold',
    color: TEXT_1,
    marginRight: 2,
  },
  reviewCount: {
    ...typeScale.body,
    fontFamily: 'Geist_400Regular',
    color: TEXT_2,
  },

  // ── Price + icon row
  priceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.lg,
  },
  price: {
    ...typeScale.displaySm,
    fontFamily: 'Geist_700Bold',
    color: BLUE,
  },
  iconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Expandable section rows
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: BORDER,
  },
  sectionBar: {
    width: 3,
    height: 16,
    borderRadius: 1.5,
    backgroundColor: BLUE,
    marginRight: 10,
  },
  sectionLabel: {
    ...typeScale.caption,
    flex: 1,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: TEXT_1,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sectionContent: {
    paddingBottom: 14,
    paddingLeft: 13,
  },

  // ── Detail grid (key–value pairs inside sections)
  detailGrid: {
    gap: space.sm,
  },
  detailItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  detailLabel: {
    width: 90,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: 'Geist_500Medium',
    color: TEXT_2,
  },
  detailValue: {
    flex: 1,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: TEXT_1,
  },

  // ── Feature bullet list (inside Key Features section)
  featureList: {
    gap: 6,
    marginTop: space.xs,
  },
  featureBullet: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: TEXT_2,
    lineHeight: 19,
  },

  // ── Sticky bottom CTA bar
  stickyBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: H_PAD,
    paddingTop: space.md,
    backgroundColor: WHITE,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  cartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
  },
  cartBtnLabel: {
    fontSize: typeScale.headline.fontSize,
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
