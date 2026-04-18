import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Share,
  Alert,
  Image,
  Animated,
  Pressable,
  Modal,
} from 'react-native';
import CardImage from '../components/CardImage';
import LensLoader from '../components/LensLoader';
import AutoImage from '../components/AutoImage';
import Svg, { Path, Circle, Polyline, Line, G, Ellipse } from 'react-native-svg';
import { colors } from '../constants/colors';
import { colors as C } from '../constants/theme';
import { space, radius, shadow, typeScale, letterSpacing } from '../constants/tokens';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useLiked } from '../context/LikedContext';
import { getProductsForPrompt, getRecommendedProducts } from '../services/affiliateProducts';
import { parseDesignPrompt } from '../utils/promptParser';
import { saveUserDesign, updateDesignVisibility, updateDesignProducts } from '../services/supabase';
import * as FileSystem from 'expo-file-system/legacy';

const { width } = Dimensions.get('window');
const IMG_RADIUS = Math.round((width - space.lg * 2) * 0.025);

// ── Icons ───────────────────────────────────────────────────────────────────────

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

function PlusSmallIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round">
      <Line x1={12} y1={5} x2={12} y2={19} />
      <Line x1={5} y1={12} x2={19} y2={12} />
    </Svg>
  );
}

function StarIconSmall({ filled = true, size = 10 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24"
      fill={filled ? colors.blueLight : '#E5E7EB'} stroke={filled ? colors.blueLight : '#D1D5DB'} strokeWidth={1}>
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  );
}

// Arc-style download icon (arrow down + curved tray)
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

// Arc-style share icon (arrow up + curved tray)
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

// Post icon — solid circle with + punched through; color changes grey → blue on activation
function PostIcon({ color = '#9CA3AF' }) {
  return (
    <Svg width={34} height={34} viewBox="0 0 30 30" fill="none">
      <Path
        d="M15 0C23.2843 0 30 6.71573 30 15C30 23.2843 23.2843 30 15 30C6.71573 30 0 23.2843 0 15C0 6.71573 6.71573 0 15 0ZM15 6.16602C14.7241 6.16602 14.5004 6.39017 14.5 6.66602V14.5H6.66699C6.39085 14.5 6.16699 14.7239 6.16699 15C6.16699 15.2761 6.39085 15.5 6.66699 15.5H14.5V23.333C14.5 23.6091 14.7239 23.833 15 23.833C15.2761 23.833 15.5 23.6091 15.5 23.333V15.5H23.333C23.609 15.4998 23.833 15.276 23.833 15C23.833 14.724 23.609 14.5002 23.333 14.5H15.5V6.66602C15.4996 6.39017 15.2759 6.16602 15 6.16602Z"
        fill={color}
      />
    </Svg>
  );
}

// Mini camera-lens loader — matches the generation loading animation
function MiniLensLoader({ color = colors.bluePrimary, size = 24 }) {
  const spin = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1800, useNativeDriver: true })
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);
  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const counterRotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-200deg'] });
  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View style={{ position: 'absolute', transform: [{ rotate }] }}>
        <Svg width={size} height={size} viewBox="0 0 30 30">
          <Circle cx={15} cy={15} r={13} stroke={color} strokeWidth={1.2}
            fill="none" strokeDasharray="3 4" strokeLinecap="round" />
        </Svg>
      </Animated.View>
      <Animated.View style={{ position: 'absolute', transform: [{ rotate: counterRotate }] }}>
        <Svg width={size} height={size} viewBox="0 0 30 30">
          <Circle cx={15} cy={15} r={9} stroke={color} strokeWidth={0.8}
            fill="none" opacity={0.6} strokeDasharray="4 3" strokeLinecap="round" />
        </Svg>
      </Animated.View>
      <Svg width={size} height={size} viewBox="0 0 30 30" style={{ position: 'absolute' }}>
        <Circle cx={15} cy={15} r={3} fill={color} opacity={0.5} />
      </Svg>
    </View>
  );
}

// Spring-bounce animated icon button — same feel as bottom tab bar
function AnimatedIconBtn({ onPress, style, children, disabled }) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = useCallback(() => {
    Animated.spring(scale, { toValue: 0.88, useNativeDriver: true, speed: 50, bounciness: 4 }).start();
  }, [scale]);
  const handlePressOut = useCallback(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 20, bounciness: 10 }).start();
  }, [scale]);
  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut} disabled={disabled}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

// ── Product Card (identical to ShopTheLookScreen) ────────────────────────────

function ProductCard({ product, inCart, onAddToCart, onPress }) {
  const priceVal = product.priceValue ?? product.price;
  const priceStr = typeof priceVal === 'number'
    ? `$${priceVal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : product.priceLabel || String(priceVal).replace(/^\$+/, '$');
  const ratingVal = typeof product.rating === 'number' ? product.rating : parseFloat(product.rating) || 0;
  // Vision-verification badge: shown when the post-gen check could not fully
  // confirm this product matches what's visible in the rendered room. The
  // legal disclosure in the SHOP ROOM footer covers the whole section.
  const showSimilarBadge = product.confidence && product.confidence !== 'verified';

  return (
    <TouchableOpacity style={s.hCard} activeOpacity={0.7} onPress={onPress}>
      <View>
        <CardImage uri={product.imageUrl} style={s.hCardImg} resizeMode="cover" placeholderColor="#D0D7E3" />
      </View>
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
      >
        {inCart
          ? <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
              <Polyline points="20 6 9 17 4 12" />
            </Svg>
          : <PlusSmallIcon />}
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

// ── Main Screen ──────────────────────────────────────────────────────────────

export default function RoomResultScreen({ route, navigation }) {
  const [addedKeys, setAddedKeys] = useState({});
  const [products, setProducts] = useState([]);
  const [recommended, setRecommended] = useState([]);
  const [saving, setSaving] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [postVisibility, setPostVisibility] = useState('public');
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);
  const [autoSavedDesignId, setAutoSavedDesignId] = useState(null);
  const autoSaveAttempted = useRef(false);
  const autoSavedDesignIdRef = useRef(null);   // ref for sync access (avoids stale closure)
  const autoSavePromiseRef   = useRef(null);   // ref to await in-flight save before posting

  // Icon active states — grey by default, stay blue after first tap
  const [downloadActive, setDownloadActive] = useState(false);
  const [postActive, setPostActive] = useState(false);
  const [shareActive, setShareActive] = useState(false);

  const { addToCart, items } = useCart();
  const { user } = useAuth();
  const { liked } = useLiked();

  const prompt = route?.params?.prompt || 'Modern minimalist redesign';
  const [resultUri, setResultUri] = useState(route?.params?.resultUri || null);

  // Dev-only debug metadata from HomeScreen.runGeneration()
  const debug = route?.params?.debug || null;
  const [showDebug, setShowDebug] = useState(false);

  // ── Load products ──
  useEffect(() => {
    const routeProducts = route?.params?.products;
    if (routeProducts && routeProducts.length > 0) {
      setProducts(routeProducts);
    } else {
      const matched = getProductsForPrompt(prompt, 6);
      setProducts(matched);
    }
  }, [prompt, route.params]);

  // ── "You Might Also Like" ──
  useEffect(() => {
    if (products.length === 0) return;
    const parsed = parseDesignPrompt(prompt);
    const recoDesign = {
      roomType: parsed.roomType || 'living-room',
      styles: parsed.styles || [],
      materials: parsed.materials || [],
    };
    const excludeIds = products.map(p => p.id).filter(Boolean);
    const recs = getRecommendedProducts(recoDesign, excludeIds, liked, 6);
    setRecommended(recs);
  }, [products, prompt, liked]);

  // ── Auto-save every generation to Supabase (private by default) ──
  // Guard: wait until products are loaded before saving — otherwise we'd
  // persist an empty products array and downstream screens would re-match
  // with wrong products.
  useEffect(() => {
    if (!resultUri || !user?.id || autoSaveAttempted.current || products.length === 0) return;
    autoSaveAttempted.current = true;
    const styleTags = products.flatMap(p => p.styles || []).filter(Boolean);
    const uniqueTags = [...new Set(styleTags)];
    const productSummary = products.map(p => ({
      id: p.id, name: p.name, brand: p.brand,
      price: p.priceValue ?? p.price, imageUrl: p.imageUrl,
      rating: p.rating, reviewCount: p.reviewCount,
      affiliateUrl: p.affiliateUrl, source: p.source,
    }));
    autoSavePromiseRef.current = saveUserDesign(user.id, {
      imageUrl: resultUri, prompt, styleTags: uniqueTags,
      products: productSummary, visibility: 'private',
    })
      .then(result => {
        if (result?.designId) {
          autoSavedDesignIdRef.current = result.designId;
          setAutoSavedDesignId(result.designId);
        }
        // Intentionally do NOT overwrite resultUri with result.permanentUrl.
        //
        // persistDesignImage() fetches the Replicate CDN URL, re-encodes the
        // bytes (fetch → arrayBuffer → base64 → Uint8Array → upload), and
        // stores the result in room-uploads. That round-trip was corrupting
        // the displayed image — users were seeing a different, weirdly-
        // generic room from what Replicate actually generated. Confirmed on
        // Build 24 via side-by-side comparison of Replicate dashboard output
        // vs. the app's Room Result screen.
        //
        // The permanentUrl is STILL saved on the user_designs DB row (via
        // saveUserDesign's internal persist step) — so when the user opens
        // this design later from MySpaces, the image is served from our
        // own bucket and survives Replicate's CDN expiration. But for the
        // *current* display, the Replicate CDN URL passed via route params
        // is the canonical pixel truth.
      })
      .catch(err => console.warn('[AutoSave] Failed:', err.message));
  }, [resultUri, user?.id, products, prompt]);

  // ── Computed ──
  const isInCart = (product) => {
    const key = `${product.name}__${product.brand}`;
    return addedKeys[key] || items.some(item => item.key === key);
  };

  const allInCart = products.length > 0 && products.every(p => isInCart(p));

  const totalPrice = products.reduce((sum, p) => {
    const num = typeof (p.priceValue ?? p.price) === 'number'
      ? (p.priceValue ?? p.price)
      : parseFloat(String(p.price).replace(/[^0-9.]/g, '')) || 0;
    return sum + num;
  }, 0);

  const styleTags = [...new Set(products.flatMap(p => p.styles || []).filter(Boolean))];

  // ── Handlers ──
  const handleAddToCart = (product) => {
    const key = `${product.name}__${product.brand}`;
    addToCart({ ...product, price: product.priceValue ?? product.price });
    setAddedKeys(prev => ({ ...prev, [key]: true }));
  };

  const handleAddAll = () => {
    let added = 0;
    products.forEach(p => { if (!isInCart(p)) { handleAddToCart(p); added++; } });
    if (added > 0) Alert.alert('Added to Cart', `${added} item${added > 1 ? 's' : ''} added to your cart.`);
    else Alert.alert('Already in Cart', 'All products are already in your cart.');
  };

  const handleShare = async () => {
    setShareActive(true);
    try {
      const msg = `Check out my AI room wish on HomeGenie!\n\n"${prompt}"`;
      await Share.share(resultUri ? { message: msg, url: resultUri } : { message: msg });
    } catch {}
  };

  const handleDownload = async () => {
    if (!resultUri || saving) return;
    setDownloadActive(true);
    setSaving(true);
    try {
      const fileUri = FileSystem.cacheDirectory + 'homegenie_design_' + Date.now() + '.jpg';
      const { status } = await FileSystem.downloadAsync(resultUri, fileUri);
      if (status === 200) {
        await Share.share({ url: fileUri });
      } else {
        throw new Error('Download returned status ' + status);
      }
    } catch {
      try {
        await Share.share({ message: `My HomeGenie AI wish: "${prompt}"\n\n${resultUri}` });
      } catch {
        Alert.alert('Could Not Save', 'Please screenshot the image to save it.');
      }
    } finally {
      setSaving(false);
    }
  };

  const handlePost = () => {
    setPostActive(true);
    setShowPostModal(true);
  };

  const handlePostToProfile = async () => {
    if (!resultUri || !user || posting) return;
    setPosting(true);

    // Duplicate-post guard: claim the auto-save slot IMMEDIATELY so the
    // background auto-save useEffect can't fire a second INSERT after we
    // commit below. Previously the auto-save was gated on products.length,
    // so if the user tapped Post before products finished matching, the
    // manual save ran first (Design #1), then auto-save ran once products
    // loaded (Design #2) — resulting in the duplicate post the user saw.
    autoSaveAttempted.current = true;

    try {
      // If auto-save is still in flight, wait up to 8 seconds for it to
      // finish so we can reuse its designId for an UPDATE. If it takes
      // longer we stop waiting and fall through to the ELSE branch which
      // creates a fresh record — better to occasionally write two rows
      // than to leave the user staring at a "Posting…" spinner forever
      // because the background save happened to stall.
      if (autoSavePromiseRef.current) {
        await Promise.race([
          autoSavePromiseRef.current.catch(() => {}),
          new Promise((resolve) => setTimeout(resolve, 8000)),
        ]);
      }

      // Build a fresh product snapshot from the current (correct) products
      const productSummary = products.map(p => ({
        id: p.id, name: p.name, brand: p.brand,
        price: p.priceValue ?? p.price, imageUrl: p.imageUrl,
        rating: p.rating, reviewCount: p.reviewCount,
        affiliateUrl: p.affiliateUrl, source: p.source,
      }));

      // Use ref for sync access — state may still be stale from the auto-save
      const designId = autoSavedDesignIdRef.current || autoSavedDesignId;

      if (designId) {
        // Auto-save already created the record — just update visibility + products
        await updateDesignVisibility(designId, postVisibility);
        if (productSummary.length > 0) {
          await updateDesignProducts(designId, productSummary).catch(err =>
            console.warn('[Post] Product patch failed:', err.message)
          );
        }
      } else {
        const styleTags = products.flatMap(p => p.styles || []).filter(Boolean);
        const uniqueTags = [...new Set(styleTags)];
        const result = await saveUserDesign(user.id, {
          imageUrl: resultUri, prompt, styleTags: uniqueTags,
          products: productSummary, visibility: postVisibility,
        });
        if (result?.designId) {
          autoSavedDesignIdRef.current = result.designId;
          setAutoSavedDesignId(result.designId);
        }
      }
      setShowPostModal(false);
      setPosted(true);
      Alert.alert('Wish Posted', `Your wish has been saved to your profile${postVisibility === 'public' ? ' and is visible on Explore' : ''}.`);
    } catch (e) {
      Alert.alert('Post Failed', e.message || 'Could not save. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <View style={s.container}>
      {__DEV__ && debug && (() => {
        // ── Pipeline badge: instantly shows which path rendered the image ──
        // PANEL (green)  — 2-image flux-2-max, visual refs, products match best
        // INDIV (yellow) — 5-image flux-2-max, visual refs, products match best
        // BFL   (red)    — fallback kontext, TEXT-ONLY refs → products may NOT
        //                  visually match the catalog items shown below
        const pipeline = debug.pipeline || 'unknown';
        const pipelineLabel =
          pipeline === 'panel'      ? 'PANEL' :
          pipeline === 'individual' ? 'INDIV' :
          pipeline === 'bfl'        ? 'BFL'   :
          'UNK';
        const pipelineColor =
          pipeline === 'panel'      ? '#10B981' : // green
          pipeline === 'individual' ? '#F59E0B' : // amber
          pipeline === 'bfl'        ? '#EF4444' : // red — text-only refs
          '#6B7280';                              // gray — unknown
        const pipelineDesc =
          pipeline === 'panel'      ? 'flux-2-max · room + 2×2 panel · visual refs' :
          pipeline === 'individual' ? 'flux-2-max · room + 4 individual product refs · visual' :
          pipeline === 'bfl'        ? 'BFL kontext · text-only refs (products may not visually match)' :
          'unknown pipeline';

        return null;
      })()}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>

        {/* ── Header ───────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            <BackIcon />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Room Result</Text>
          <TouchableOpacity style={s.headerBtn} onPress={() => navigation.navigate('Main', { screen: 'Cart' })} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
            <CartNavIcon />
          </TouchableOpacity>
        </View>

        {/* ── Image ────────────────────────────────────────────────── */}
        <View style={s.imageWrap}>
          {resultUri
            ? <AutoImage uri={resultUri} borderRadius={IMG_RADIUS} />
            : <View style={s.imagePlaceholder}><LensLoader size={40} /></View>}
        </View>

        {/* ── Actions row ──────────────────────────────────────────── */}
        <View style={s.actionsRow}>
          <View style={s.actionsInfo}>
            <Text style={s.actionsTitle}>Your Design</Text>
            <Text style={s.actionsSub}>Share or post to profile</Text>
          </View>
          <View style={s.actionBtns}>
            <AnimatedIconBtn
              onPress={handleDownload}
              disabled={saving}
              style={[s.iconCircleBtn, downloadActive && s.iconCircleBtnActive]}
            >
              {saving
                ? <MiniLensLoader color={downloadActive ? colors.bluePrimary : '#9CA3AF'} />
                : <DownloadIcon color={downloadActive ? colors.bluePrimary : '#9CA3AF'} />}
            </AnimatedIconBtn>

            {user && (
              <AnimatedIconBtn
                onPress={handlePost}
                disabled={posting}
                style={s.postIconBtn}
              >
                {posting
                  ? <MiniLensLoader color={postActive ? colors.bluePrimary : '#9CA3AF'} />
                  : <PostIcon color={postActive ? colors.bluePrimary : '#9CA3AF'} />}
              </AnimatedIconBtn>
            )}

            <AnimatedIconBtn
              onPress={handleShare}
              style={[s.iconCircleBtn, shareActive && s.iconCircleBtnActive]}
            >
              <ShareIcon color={shareActive ? colors.bluePrimary : '#9CA3AF'} />
            </AnimatedIconBtn>
          </View>
        </View>

        {/* ── YOUR PROMPT ──────────────────────────────────────────── */}
        <Text style={s.promptLabel}>Your Prompt</Text>
        <Text style={s.promptBody}>{prompt}</Text>

        {/* ── Divider ──────────────────────────────────────────────── */}
        <View style={s.divider} />

        {/* ── SHOP ROOM ────────────────────────────────────────────── */}
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
                  onPress={() => navigation.navigate('ProductDetail', { product })}
                />
              ))}
            </ScrollView>
            {/* Legal disclosure: the generated image is illustrative only. */}
            <Text style={s.shopRoomDisclaimer}>
              Room image is AI-generated for inspiration. Shown products are close matches —
              actual colors, materials, and finishes may differ from the render.
            </Text>
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
                  onPress={() => navigation.navigate('ProductDetail', { product })}
                />
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── Tags ─────────────────────────────────────────────────── */}
        {styleTags.length > 0 && (
          <>
            <View style={[s.divider, { marginTop: space.xl }]} />
            <View style={s.tagsSection}>
              <Text style={s.sectionLabel}>TAGS</Text>
              <View style={s.tagsWrap}>
                {styleTags.map(tag => (
                  <View key={tag} style={s.tag}>
                    <Text style={s.tagText}>#{tag}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
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
            <View style={s.pillMeta}>
              <Text style={s.pillCount}>{products.length} item{products.length !== 1 ? 's' : ''}</Text>
              <Text style={s.pillPrice}>
                {totalPrice.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 })}
              </Text>
            </View>
          </View>
          <View style={s.pillRight}>
            {allInCart ? <Text style={s.pillCheck}>✓</Text> : <CartWhiteIcon />}
            <Text style={s.pillAction}>{allInCart ? 'All Added' : 'Add All to Cart'}</Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* ── Post to Profile Modal ─────────────────────────────────── */}
      <Modal visible={showPostModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={s.modalCard}>
            <Text style={s.modalTitle}>Post to Profile</Text>
            <Text style={s.modalSubtitle}>Share your AI wish with the community</Text>

            {resultUri && (
              <Image source={{ uri: resultUri }} style={s.modalPreview} resizeMode="contain" />
            )}

            <Text style={s.modalLabel}>Visibility</Text>
            <View style={s.toggleRow}>
              <TouchableOpacity
                style={[s.toggleBtn, postVisibility === 'public' && s.toggleBtnActive]}
                onPress={() => setPostVisibility('public')}
                activeOpacity={0.7}
              >
                <Text style={[s.toggleText, postVisibility === 'public' && s.toggleTextActive]}>Public</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleBtn, postVisibility === 'private' && s.toggleBtnActive]}
                onPress={() => setPostVisibility('private')}
                activeOpacity={0.7}
              >
                <Text style={[s.toggleText, postVisibility === 'private' && s.toggleTextActive]}>Private</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.postBtn, posting && { opacity: 0.6 }]}
              onPress={handlePostToProfile}
              disabled={posting}
              activeOpacity={0.85}
            >
              <Text style={s.postBtnText}>{posting ? 'Posting...' : 'Post to Profile'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowPostModal(false)} style={s.cancelBtn} activeOpacity={0.7}>
              <Text style={s.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.white },
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

  // ── Image ──
  imageWrap: {
    paddingHorizontal: space.lg,
    marginBottom: space.base,
  },
  imagePlaceholder: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: IMG_RADIUS,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Actions row (mirrors user row in ShopTheLookScreen) ──
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    marginHorizontal: space.lg,
    paddingTop: space.base,
    paddingBottom: space.md,
    borderTopWidth: 1,
    borderTopColor: C.border,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
    marginBottom: space.base,
  },
  actionsInfo: { flex: 1 },
  actionsTitle: {
    ...typeScale.headline,
    fontFamily: 'Geist_600SemiBold',
    color: C.textPrimary,
  },
  actionsSub: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
    marginTop: 2,
  },
  actionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  iconCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.white,
  },
  iconCircleBtnActive: {
    borderColor: colors.bluePrimary,
  },
  postIconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
  },

  // ── Prompt ──
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
    color: colors.blueLight,
    lineHeight: 18,
    marginHorizontal: space.lg,
    marginBottom: 6,
  },

  // ── Divider ──
  divider: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: space.lg,
    marginBottom: space.base,
  },

  // ── Products section ──
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
    paddingBottom: space.xs,
  },

  // ── Tags ──
  tagsSection: {
    paddingHorizontal: space.lg,
    marginTop: space.base,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  tag: {
    backgroundColor: C.surface2,
    borderRadius: radius.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.xs,
  },
  tagText: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
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
    backgroundColor: C.surface2,
  },
  similarBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(17, 24, 39, 0.88)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  similarBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    letterSpacing: 0.5,
    color: '#FFFFFF',
  },
  shopRoomDisclaimer: {
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
    paddingRight: space.lg,
    paddingTop: space.md,
  },

  // ── Dev-only debug overlay (gated by __DEV__) ──
  debugToggle: {
    position: 'absolute',
    top: 60,
    right: 12,
    zIndex: 1000,
    backgroundColor: 'rgba(17, 24, 39, 0.88)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
  },
  debugToggleText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  debugPanel: {
    position: 'absolute',
    top: 96,
    right: 12,
    left: 12,
    zIndex: 999,
    backgroundColor: 'rgba(17, 24, 39, 0.94)',
    borderRadius: 8,
    padding: 12,
    maxHeight: '70%',
  },
  debugTitle: {
    color: colors.blueLight,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1,
    marginBottom: 6,
  },
  debugRow: {
    color: '#FFFFFF',
    fontSize: 11,
    lineHeight: 15,
    fontFamily: 'Courier',
  },
  debugDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 6,
  },
  debugPipelineBanner: {
    borderRadius: 6,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  debugPipelineLabel: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 2,
  },
  debugPipelineDesc: {
    color: 'rgba(255,255,255,0.92)',
    fontSize: 10,
    lineHeight: 14,
    fontFamily: 'Courier',
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
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hCardAddBtnDone: {
    backgroundColor: colors.blueLight,
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
    backgroundColor: C.white,
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
    backgroundColor: colors.blueLight,
  },
  pillLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  pillRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pillCheck: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#fff',
  },
  pillMeta: {
    flexDirection: 'column',
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

  // ── Post Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  modalCard: {
    backgroundColor: C.white,
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    fontFamily: 'Geist_700Bold',
    color: '#111',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
    fontFamily: 'Geist_400Regular',
    color: '#888',
    marginBottom: 16,
  },
  modalPreview: {
    width: '100%',
    height: 160,
    borderRadius: 12,
    backgroundColor: '#000',
    marginBottom: 16,
  },
  modalLabel: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: '#555',
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  toggleRow: {
    flexDirection: 'row',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.bluePrimary,
    marginBottom: 20,
    alignSelf: 'stretch',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    backgroundColor: C.white,
  },
  toggleBtnActive: {
    backgroundColor: colors.bluePrimary,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: colors.bluePrimary,
  },
  toggleTextActive: {
    color: '#fff',
  },
  postBtn: {
    backgroundColor: colors.bluePrimary,
    borderRadius: 14,
    paddingVertical: 14,
    alignSelf: 'stretch',
    alignItems: 'center',
    marginBottom: 10,
  },
  postBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
  },
  cancelBtn: {
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: '#888',
  },
});
