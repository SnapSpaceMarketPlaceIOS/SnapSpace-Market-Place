/**
 * ShopTheLookScreen — Full-page view of a design post with shoppable products.
 *
 * Layout mirrors the Explore post detail exactly:
 *   Image → divider → User row + Follow → divider → Title + Description
 *   → divider → SHOP ROOM horizontal cards → FTC → Tags
 *   → sticky Add All to Cart bottom bar
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Share,
  Animated,
  Pressable,
} from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import CardImage from '../components/CardImage';
import AutoImage from '../components/AutoImage';
import LensLoader from '../components/LensLoader';
import Svg, { Path, Circle, Polyline, Line, G, Ellipse } from 'react-native-svg';
import { colors } from '../constants/colors';
import { colors as C } from '../constants/theme';
import { space, radius, shadow, typeScale, letterSpacing } from '../constants/tokens';
import { useCart } from '../context/CartContext';
import { useLiked } from '../context/LikedContext';
import { useAuth } from '../context/AuthContext';
import { getProductsForDesign, getRecommendedProducts } from '../services/affiliateProducts';
import { createShareableWishURL } from '../services/shareService';
import ModerationMenu from '../components/ModerationMenu';

const { width } = Dimensions.get('window');
const IMG_RADIUS = Math.round((width - space.lg * 2) * 0.025);

// ── Icons ──────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function CartNavIcon() {
  return (
    <Svg width={20} height={20} viewBox="265.5 20.5 27 25" fill="none">
      <Path
        d="M267.104 22H270.08C270.756 22 271.094 22 271.353 22.1807C271.611 22.3614 271.727 22.6792 271.959 23.3149L272.937 26"
        stroke="#111" strokeWidth={1} strokeLinecap="round"
      />
      <Path
        d="M287.521 39.3334H273.63C272.984 39.3334 272.661 39.3334 272.442 39.218C272.156 39.0675 271.961 38.7883 271.917 38.4684C271.884 38.2233 271.995 37.9197 272.216 37.3126C272.448 36.675 272.565 36.3562 272.755 36.1102C273.003 35.789 273.343 35.551 273.73 35.4278C274.026 35.3334 274.365 35.3334 275.044 35.3334H283.146"
        stroke="#111" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M283.846 35.3333H276.939C275.703 35.3333 275.085 35.3333 274.594 35.0212C274.103 34.7091 273.841 34.1497 273.317 33.0311L272.024 30.2733C271.123 28.3515 270.673 27.3906 271.115 26.6953C271.557 26 272.618 26 274.74 26H286.483C288.876 26 290.073 26 290.501 26.7728C290.93 27.5457 290.296 28.5605 289.027 30.59L287.238 33.4533C286.663 34.3724 286.376 34.8319 285.924 35.0826C285.471 35.3333 284.929 35.3333 283.846 35.3333Z"
        stroke="#111" strokeWidth={1} strokeLinecap="round"
      />
      <Ellipse cx={286.792} cy={42.6667} rx={1.45833} ry={1.33333} fill="#111" />
      <Ellipse cx={275.125} cy={42.6667} rx={1.45833} ry={1.33333} fill="#111" />
    </Svg>
  );
}

function PlusSmallIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={1.5} strokeLinecap="round">
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

function CartWhiteIcon() {
  return (
    <Svg width={18} height={18} viewBox="265.5 20.5 27 25" fill="none">
      <Path
        d="M267.104 22H270.08C270.756 22 271.094 22 271.353 22.1807C271.611 22.3614 271.727 22.6792 271.959 23.3149L272.937 26"
        stroke="#fff" strokeWidth={1} strokeLinecap="round"
      />
      <Path
        d="M287.521 39.3334H273.63C272.984 39.3334 272.661 39.3334 272.442 39.218C272.156 39.0675 271.961 38.7883 271.917 38.4684C271.884 38.2233 271.995 37.9197 272.216 37.3126C272.448 36.675 272.565 36.3562 272.755 36.1102C273.003 35.789 273.343 35.551 273.73 35.4278C274.026 35.3334 274.365 35.3334 275.044 35.3334H283.146"
        stroke="#fff" strokeWidth={1} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M283.846 35.3333H276.939C275.703 35.3333 275.085 35.3333 274.594 35.0212C274.103 34.7091 273.841 34.1497 273.317 33.0311L272.024 30.2733C271.123 28.3515 270.673 27.3906 271.115 26.6953C271.557 26 272.618 26 274.74 26H286.483C288.876 26 290.073 26 290.501 26.7728C290.93 27.5457 290.296 28.5605 289.027 30.59L287.238 33.4533C286.663 34.3724 286.376 34.8319 285.924 35.0826C285.471 35.3333 284.929 35.3333 283.846 35.3333Z"
        stroke="#fff" strokeWidth={1} strokeLinecap="round"
      />
      <Ellipse cx={286.792} cy={42.6667} rx={1.45833} ry={1.33333} fill="#fff" />
      <Ellipse cx={275.125} cy={42.6667} rx={1.45833} ry={1.33333} fill="#fff" />
    </Svg>
  );
}

// Arc-style download icon (arrow down + curved tray) — matches RoomResultScreen Figma spec
function DownloadIcon({ color = '#9CA3AF' }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 30 30" fill="none">
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

// Arc-style share icon (arrow up + curved tray) — matches RoomResultScreen Figma spec
function ShareIcon({ color = '#9CA3AF' }) {
  return (
    <Svg width={18} height={18} viewBox="0 0 30 30" fill="none">
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

// MiniLensLoader replaced by shared LensLoader component

// Animated icon button — same spring bounce as the bottom tab bar
function AnimatedIconBtn({ onPress, color, children, style, hitSlop }) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = useCallback(() => {
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  }, [scale]);
  const handlePressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }).start();
  }, [scale]);
  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} hitSlop={hitSlop}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

function HeartIcon({ filled = false, size = 18 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? '#67ACE9' : 'none'} stroke={filled ? '#67ACE9' : '#9CA3AF'}
      strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function StarIconSmall({ filled = true, size = 10 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? '#67ACE9' : '#E5E7EB'} stroke={filled ? '#67ACE9' : '#D1D5DB'} strokeWidth={1}>
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  );
}

// ── Horizontal Product Card ────────────────────────────────────────────────────

function ProductCard({ product, inCart, onAddToCart, onPress }) {
  const priceVal = product.priceValue ?? product.price;
  const priceStr = typeof priceVal === 'number'
    ? `$${priceVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : product.priceLabel || String(priceVal).replace(/^\$+/, '$');
  const ratingVal = typeof product.rating === 'number' ? product.rating : parseFloat(product.rating) || 0;

  return (
    <TouchableOpacity style={s.hCard} activeOpacity={0.7} onPress={onPress}>
      <CardImage uri={product.imageUrl} style={s.hCardImg} resizeMode="cover" placeholderColor="#D0D7E3" compact />
      <View style={s.hCardBody}>
        <Text style={s.hCardName} numberOfLines={2}>{product.name}</Text>
        <Text style={s.hCardBrand} numberOfLines={1}>{product.brand}</Text>
        {ratingVal > 0 && (
          <View style={s.hCardRating}>
            {[1,2,3,4,5].map(i => (
              <StarIconSmall key={i} size={10} filled={i <= Math.round(ratingVal)} />
            ))}
            <Text style={s.hCardRatingText}>{ratingVal.toFixed(1)}</Text>
            {!!product.reviewCount && (
              <Text style={s.hCardReviews}>({product.reviewCount.toLocaleString()})</Text>
            )}
          </View>
        )}
        <Text style={s.hCardPrice}>{priceStr}</Text>
      </View>
      <TouchableOpacity
        style={[s.hCardAddBtn, inCart && s.hCardAddBtnDone]}
        activeOpacity={0.8}
        onPress={() => !inCart && onAddToCart(product)}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      >
        {inCart
          ? <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <Polyline points="20 6 9 17 4 12" />
            </Svg>
          : <PlusSmallIcon />
        }
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Main Screen ────────────────────────────────────────────────────────────────

export default function ShopTheLookScreen({ route, navigation }) {
  const design = route?.params?.design;

  const { addToCart, items } = useCart();
  const { liked, toggleLiked, isLiked } = useLiked();
  const { user } = useAuth();
  const [addedKeys, setAddedKeys] = useState({});
  const [products, setProducts] = useState(design?.products || []);
  const [recommended, setRecommended] = useState([]);
  const [saving, setSaving] = useState(false);
  const [shareActive, setShareActive] = useState(false);
  const [downloadActive, setDownloadActive] = useState(false);

  // Defensive: bail safely if screen was navigated to without a design param.
  // Registers after state hooks so React's hook-call order stays stable, and
  // any deeper useEffects below remain reachable on first render. We don't
  // early-return here — we let the component render one empty tick and the
  // effect pops the user back. `isOwnPost` and handlers below use optional
  // chaining on `design` so the empty-tick render is crash-safe.
  useEffect(() => {
    if (!design) navigation.goBack();
  }, [design, navigation]);

  const isOwnPost = user && design && (
    design.user_id === user.id ||
    (user.username && design.user === user.username) ||
    (user.name && design.user === user.name) ||
    design.isUserDesign === true
  );

  const handleShare = async () => {
    setShareActive(true);
    try {
      const msg = design.prompt
        ? `Check out this HomeGenie wish: "${design.prompt}"`
        : 'Check out this HomeGenie wish!';
      // Build 113 polish: branded landing URL via shareService.
      const shareUrl = design.imageUrl
        ? await createShareableWishURL({
            imageUrl: design.imageUrl,
            prompt: design.prompt,
            roomType: design.roomType,
          })
        : '';
      await Share.share({ message: msg, url: shareUrl });
    } catch {}
  };

  const handleDownload = async () => {
    if (!design.imageUrl || saving) return;
    setDownloadActive(true);
    setSaving(true);
    try {
      const fileUri = FileSystem.cacheDirectory + 'snapspace_' + Date.now() + '.jpg';
      const { status } = await FileSystem.downloadAsync(design.imageUrl, fileUri);
      if (status === 200) {
        await Share.share({ url: fileUri });
      } else {
        await Share.share({ message: design.imageUrl });
      }
    } catch {
      Alert.alert('Error', 'Could not download the image. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  // Load products + recommendations in one pass (avoids waterfall)
  useEffect(() => {
    if (!design) return;
    let prods = design.products && design.products.length > 0
      ? design.products
      : getProductsForDesign(design, 6);
    if (prods.length > 0 && prods !== products) setProducts(prods);

    // Compute recommendations immediately using resolved products
    const shopRoomIds = prods.map((p) => p.id).filter(Boolean);
    const recs = getRecommendedProducts(design, shopRoomIds, liked, 6);
    setRecommended(recs);
  }, [design, liked]);

  // Past all hooks — safe to short-circuit render if design is missing
  if (!design) return null;

  const isInCart = (product) => {
    const key = `${product.name}__${product.brand}`;
    return addedKeys[key] || items.some((item) => item.key === key);
  };

  const handleAddToCart = (product) => {
    const key = `${product.name}__${product.brand}`;
    addToCart({ ...product, price: product.priceValue ?? product.price });
    setAddedKeys((prev) => ({ ...prev, [key]: true }));
  };

  const handleAddAll = () => {
    let added = 0;
    products.forEach((p) => {
      if (!isInCart(p)) { handleAddToCart(p); added++; }
    });
    if (added > 0) {
      Alert.alert('Added to Cart', `${added} item${added > 1 ? 's' : ''} added to your cart.`);
    } else {
      Alert.alert('Already in Cart', 'All products are already in your cart.');
    }
  };

  const allInCart = products.every((p) => isInCart(p));

  const totalPrice = products.reduce((sum, p) => {
    const num = typeof (p.priceValue ?? p.price) === 'number'
      ? (p.priceValue ?? p.price)
      : parseFloat(String(p.price).replace(/[^0-9.]/g, '')) || 0;
    return sum + num;
  }, 0);

  const displayTitle = (design.title || design.prompt || 'My Space').replace('...', '');
  const displayDesc  = design.description || design.prompt || '';
  const displayUser  = design.user || 'you';
  const displayInitial = design.initial || displayUser.charAt(0).toUpperCase();

  return (
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>

        {/* ── Header ───────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }} accessibilityLabel="Back" accessibilityRole="button">
            <BackIcon />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Shop The Look</Text>
          <TouchableOpacity style={s.headerBtn} onPress={() => navigation.navigate('Main', { screen: 'Cart' })} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }} accessibilityLabel="Cart" accessibilityRole="button">
            <CartNavIcon />
          </TouchableOpacity>
        </View>

        {/* ── Image (natural aspect ratio — no cropping) ── */}
        <View style={s.imageWrap}>
          <AutoImage uri={design.imageUrl} borderRadius={IMG_RADIUS} />
        </View>

        {/* ── User row + Follow ────────────────────────────────────── */}
        <TouchableOpacity
          style={s.userRow}
          activeOpacity={0.75}
          onPress={() => navigation?.navigate('UserProfile', { username: displayUser })}
        >
          <View style={s.avatar}>
            <Text style={s.avatarText}>{displayInitial}</Text>
          </View>
          <View style={s.userInfo}>
            <Text style={s.username} numberOfLines={1}>@{displayUser}</Text>
            <Text style={s.userSub}>Tap to view profile</Text>
          </View>
          <View style={s.userActions}>
            <AnimatedIconBtn
              onPress={() => toggleLiked(design.id)}
              style={[s.shareBtn, isLiked(design.id) && s.likeBtnActive]}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <HeartIcon filled={isLiked(design.id)} size={18} />
            </AnimatedIconBtn>
            <AnimatedIconBtn
              onPress={handleShare}
              style={[s.shareBtn, shareActive && s.shareBtnActive]}
              hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
            >
              <ShareIcon color={shareActive ? '#0B6DC3' : '#9CA3AF'} />
            </AnimatedIconBtn>
            {isOwnPost ? (
              <AnimatedIconBtn
                onPress={handleDownload}
                style={[s.shareBtn, downloadActive && s.shareBtnActive]}
                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
              >
                {saving
                  ? <LensLoader size={24} color={downloadActive ? '#0B6DC3' : '#9CA3AF'} />
                  : <DownloadIcon color={downloadActive ? '#0B6DC3' : '#9CA3AF'} />}
              </AnimatedIconBtn>
            ) : (
              <TouchableOpacity style={s.followBtn} activeOpacity={0.8}>
                <Text style={s.followBtnText}>Follow</Text>
              </TouchableOpacity>
            )}
            {/* Report/Block affordance — UGC compliance (Apple Guideline 1.2).
                Renders null on own posts (ModerationMenu has an internal guard). */}
            {!isOwnPost && (
              <ModerationMenu
                targetUserId={design.user_id}
                targetUserName={`@${displayUser}`}
                targetDesignId={design.id ? String(design.id) : null}
                currentUserId={user?.id}
                iconColor="#9CA3AF"
                iconSize={20}
                style={s.moderationBtn}
              />
            )}
          </View>
        </TouchableOpacity>

        {/* ── Prompt label + text ──────────────────────────────────── */}
        <Text style={s.promptLabel}>Your Prompt</Text>
        <Text style={s.promptBody}>{displayTitle}</Text>
        {!!displayDesc && displayDesc !== displayTitle && (
          <Text style={s.desc} numberOfLines={3}>{displayDesc}</Text>
        )}

        {/* ── Divider before SHOP ROOM ─────────────────────────────── */}
        <View style={s.divider} />

        {/* ── SHOP ROOM — horizontal cards ─────────────────────────── */}
        {products.length > 0 && (
          <View style={s.productsSection}>
            <Text style={s.sectionLabel}>SHOP ROOM</Text>

            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.hList}
            >
              {products.map((product, index) => (
                <ProductCard
                  key={product.id || index}
                  product={product}
                  inCart={isInCart(product)}
                  onAddToCart={handleAddToCart}
                  onPress={() => navigation.navigate('ProductDetail', { product, design })}
                />
              ))}
            </ScrollView>

          </View>
        )}

        {/* ── YOU MIGHT ALSO LIKE ──────────────────────────────────── */}
        {recommended.length > 0 && (
          <View style={s.productsSection}>
            <View style={[s.divider, { marginTop: space.xl, marginLeft: 0 }]} />
            <Text style={s.sectionLabel}>YOU MIGHT ALSO LIKE</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.hList}
            >
              {recommended.map((product, index) => (
                <ProductCard
                  key={product.id || `rec-${index}`}
                  product={product}
                  inCart={isInCart(product)}
                  onAddToCart={handleAddToCart}
                  onPress={() => navigation.navigate('ProductDetail', { product, design })}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Divider before Tags ──────────────────────────────────── */}
        {design.tags && design.tags.length > 0 && (
          <View style={[s.divider, { marginTop: space.xl }]} />
        )}

        {/* ── Tags ─────────────────────────────────────────────────── */}
        {design.tags && design.tags.length > 0 && (
          <View style={s.tagsSection}>
            <Text style={s.sectionLabel}>TAGS</Text>
            <View style={s.tagsWrap}>
              {design.tags.map((tag) => (
                <View
                  key={tag}
                  style={[s.tag, (tag === '#AIGenerated' || tag === '#ShopTheLook') && s.tagHighlight]}
                >
                  <Text style={[s.tagText, (tag === '#AIGenerated' || tag === '#ShopTheLook') && s.tagTextHighlight]}>
                    {tag}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}

        <View style={{ height: 120 }} />
      </ScrollView>

      {/* ── Sticky Bottom Bar ──────────────────────────────────────── */}
      <View style={s.bottomBar}>
        <TouchableOpacity
          style={[s.addAllPill, allInCart && s.addAllPillDone]}
          activeOpacity={0.85}
          onPress={handleAddAll}
        >
          <View style={s.pillLeft}>
            <Text style={s.pillAction}>{allInCart ? 'All Added' : 'Add All to Cart'}</Text>
            {allInCart ? <Text style={s.pillCheck}>✓</Text> : <CartWhiteIcon />}
          </View>
          <View style={s.pillDivider} />
          <View style={s.pillRight}>
            <View style={s.pillMeta}>
              <Text style={s.pillCount}>{products.length} item{products.length !== 1 ? 's' : ''}</Text>
              <Text style={s.pillPrice}>
                {totalPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  scrollContent: { paddingTop: space['5xl'], paddingBottom: space['2xl'] },

  // ── Header ──
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    marginBottom: space.lg,
  },
  headerBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,
    letterSpacing: letterSpacing.tight,
  },

  // ── Image (padded, rounded — matches Explore) ──
  imageWrap: {
    paddingHorizontal: space.lg,
    marginBottom: space.base,
  },
  image: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: IMG_RADIUS,
    overflow: 'hidden',
    backgroundColor: C.surface,
  },

  // ── User row ──
  userRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: space.lg,
    paddingTop: space.base,
    paddingBottom: space.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: space.base,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    ...typeScale.caption,
    color: '#fff',
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
  },
  userInfo: { flex: 1 },
  username: {
    ...typeScale.headline,
    fontFamily: 'Geist_600SemiBold',
    color: C.textPrimary,
  },
  userSub: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
    marginTop: 2,
  },
  userActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shareBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.white,
  },
  shareBtnActive: {
    borderColor: '#0B6DC3',
  },
  likeBtnActive: {
    borderColor: 'rgba(103,172,233,0.5)',
    backgroundColor: 'rgba(103,172,233,0.08)',
  },
  followBtn: {
    backgroundColor: C.primary,
    borderRadius: radius.full,
    height: 36,
    paddingHorizontal: space.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followBtnText: {
    ...typeScale.button,
    fontFamily: 'Geist_600SemiBold',
    color: '#fff',
  },
  moderationBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Title + Description ──
  promptLabel: {
    ...typeScale.subheadline,
    fontFamily: 'Geist_600SemiBold',
    color: C.textTertiary,
    marginHorizontal: space.lg,
    marginBottom: 4,
    marginTop: 4,
  },
  promptBody: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: '#67ACE9',
    lineHeight: 18,
    marginHorizontal: space.lg,
    marginBottom: 6,
  },
  desc: {
    ...typeScale.body,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
    marginHorizontal: space.lg,
    marginBottom: space.base,
  },

  // ── Divider ──
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: space.lg,
    marginBottom: space.base,
  },

  // ── SHOP ROOM section ──
  productsSection: {
    paddingLeft: space.lg,
  },
  sectionLabel: {
    ...typeScale.subheadline,
    fontFamily: 'Geist_600SemiBold',
    color: C.textTertiary,
    marginBottom: space.md,
  },
  hList: {
    gap: 10,
    paddingRight: space.lg,
    paddingBottom: 4,
  },
  ftc: {
    fontSize: 11,
    fontFamily: 'Geist_400Regular',
    fontStyle: 'italic',
    color: C.textTertiary,
    textAlign: 'center',
    marginTop: space.base,
    marginBottom: space.sm,
    paddingRight: space.lg,
  },

  // ── Tags ──
  tagsSection: {
    paddingHorizontal: space.lg,
    marginTop: space.base,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    backgroundColor: C.surface2,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  tagHighlight: {
    backgroundColor: C.primaryLight,
  },
  tagText: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
  },
  tagTextHighlight: {
    color: C.primary,
  },

  // ── Horizontal product cards ──
  hCard: {
    width: 170,
    backgroundColor: C.white,
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
    paddingBottom: 38,
    gap: 2,
  },
  hCardName: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: C.textPrimary,
    lineHeight: 17,
  },
  hCardBrand: {
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
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
    color: C.textPrimary,
    marginLeft: 2,
  },
  hCardReviews: {
    fontSize: 10,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
  },
  hCardPrice: {
    fontSize: 14,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.primary,
    marginTop: 4,
  },
  hCardAddBtn: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hCardAddBtnDone: {
    backgroundColor: '#67ACE9',
    borderWidth: 0,
  },

  // ── Bottom bar ──
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: space.lg,
    paddingBottom: 34,
    paddingTop: space.md,
    backgroundColor: C.bg,
    borderTopWidth: 1,
    borderTopColor: C.border,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 4,
  },
  addAllPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: C.primary,
    borderRadius: 999,
    height: 56,
    paddingHorizontal: space.lg,
    ...shadow.medium,
  },
  addAllPillDone: {
    backgroundColor: '#67ACE9',
  },
  pillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillDivider: {
    width: 1,
    height: 28,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  pillRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  pillCheck: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#fff',
  },
  pillMeta: {
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  pillCount: {
    fontSize: 11,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 14,
  },
  pillPrice: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#fff',
    lineHeight: 18,
  },
  pillAction: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#fff',
  },
});
