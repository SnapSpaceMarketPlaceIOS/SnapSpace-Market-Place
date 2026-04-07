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
import Svg, { Path, Circle, Polyline, Line, G } from 'react-native-svg';
import { colors } from '../constants/colors';
import { colors as C } from '../constants/theme';
import { space, radius, shadow, typeScale, letterSpacing } from '../constants/tokens';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { useLiked } from '../context/LikedContext';
import { getProductsForPrompt, getRecommendedProducts } from '../services/affiliateProducts';
import { parseDesignPrompt } from '../utils/promptParser';
import { saveUserDesign, updateDesignVisibility } from '../services/supabase';
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
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={9} cy={21} r={1} />
      <Circle cx={20} cy={21} r={1} />
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Svg>
  );
}

function CartWhiteIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={9} cy={21} r={1} />
      <Circle cx={20} cy={21} r={1} />
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
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
      fill={filled ? '#67ACE9' : '#E5E7EB'} stroke={filled ? '#67ACE9' : '#D1D5DB'} strokeWidth={1}>
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
        stroke={color} strokeWidth={1.6} strokeLinecap="round"
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
        stroke={color} strokeWidth={1.6} strokeLinecap="round"
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
function MiniLensLoader({ color = '#0B6DC3', size = 24 }) {
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

  return (
    <TouchableOpacity style={s.hCard} activeOpacity={0.7} onPress={onPress}>
      <CardImage uri={product.imageUrl} style={s.hCardImg} resizeMode="cover" placeholderColor="#D0D7E3" />
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

  // Icon active states — grey by default, stay blue after first tap
  const [downloadActive, setDownloadActive] = useState(false);
  const [postActive, setPostActive] = useState(false);
  const [shareActive, setShareActive] = useState(false);

  const { addToCart, items } = useCart();
  const { user } = useAuth();
  const { liked } = useLiked();

  const prompt = route?.params?.prompt || 'Modern minimalist redesign';
  const [resultUri, setResultUri] = useState(route?.params?.resultUri || null);

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
  useEffect(() => {
    if (!resultUri || !user?.id || autoSaveAttempted.current) return;
    autoSaveAttempted.current = true;
    const styleTags = products.flatMap(p => p.styles || []).filter(Boolean);
    const uniqueTags = [...new Set(styleTags)];
    const productSummary = products.map(p => ({
      id: p.id, name: p.name, brand: p.brand,
      price: p.priceValue ?? p.price, imageUrl: p.imageUrl,
      rating: p.rating, reviewCount: p.reviewCount,
      affiliateUrl: p.affiliateUrl, source: p.source,
    }));
    saveUserDesign(user.id, {
      imageUrl: resultUri, prompt, styleTags: uniqueTags,
      products: productSummary, visibility: 'private',
    })
      .then(result => {
        if (result?.designId) setAutoSavedDesignId(result.designId);
        if (result?.permanentUrl) setResultUri(result.permanentUrl);
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
      const msg = `Check out my AI room design on SnapSpace!\n\n"${prompt}"`;
      await Share.share(resultUri ? { message: msg, url: resultUri } : { message: msg });
    } catch {}
  };

  const handleDownload = async () => {
    if (!resultUri || saving) return;
    setDownloadActive(true);
    setSaving(true);
    try {
      const fileUri = FileSystem.cacheDirectory + 'snapspace_design_' + Date.now() + '.jpg';
      const { status } = await FileSystem.downloadAsync(resultUri, fileUri);
      if (status === 200) {
        await Share.share({ url: fileUri });
      } else {
        throw new Error('Download returned status ' + status);
      }
    } catch {
      try {
        await Share.share({ message: `My SnapSpace AI design: "${prompt}"\n\n${resultUri}` });
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
    try {
      if (autoSavedDesignId) {
        await updateDesignVisibility(autoSavedDesignId, postVisibility);
      } else {
        const styleTags = products.flatMap(p => p.styles || []).filter(Boolean);
        const uniqueTags = [...new Set(styleTags)];
        const productSummary = products.map(p => ({
          id: p.id, name: p.name, brand: p.brand,
          price: p.priceValue ?? p.price, imageUrl: p.imageUrl,
          rating: p.rating, reviewCount: p.reviewCount,
          affiliateUrl: p.affiliateUrl, source: p.source,
        }));
        const result = await saveUserDesign(user.id, {
          imageUrl: resultUri, prompt, styleTags: uniqueTags,
          products: productSummary, visibility: postVisibility,
        });
        if (result?.designId) setAutoSavedDesignId(result.designId);
      }
      setShowPostModal(false);
      setPosted(true);
      Alert.alert('Posted!', `Your design has been saved to your profile${postVisibility === 'public' ? ' and is visible on Explore' : ''}.`);
    } catch (e) {
      Alert.alert('Post Failed', e.message || 'Could not save. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  return (
    <View style={s.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollContent}>

        {/* ── Header ───────────────────────────────────────────────── */}
        <View style={s.header}>
          <TouchableOpacity style={s.headerBtn} onPress={() => navigation.goBack()}>
            <BackIcon />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Room Result</Text>
          <TouchableOpacity style={s.headerBtn} onPress={() => navigation.navigate('Main', { screen: 'Cart' })}>
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
                ? <MiniLensLoader color={downloadActive ? '#0B6DC3' : '#9CA3AF'} />
                : <DownloadIcon color={downloadActive ? '#0B6DC3' : '#9CA3AF'} />}
            </AnimatedIconBtn>

            {user && (
              <AnimatedIconBtn
                onPress={handlePost}
                disabled={posting}
                style={s.postIconBtn}
              >
                {posting
                  ? <MiniLensLoader color={postActive ? '#0B6DC3' : '#9CA3AF'} />
                  : <PostIcon color={postActive ? '#0B6DC3' : '#9CA3AF'} />}
              </AnimatedIconBtn>
            )}

            <AnimatedIconBtn
              onPress={handleShare}
              style={[s.iconCircleBtn, shareActive && s.iconCircleBtnActive]}
            >
              <ShareIcon color={shareActive ? '#0B6DC3' : '#9CA3AF'} />
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
            <Text style={s.modalSubtitle}>Share your AI design with the community</Text>

            {resultUri && (
              <Image source={{ uri: resultUri }} style={s.modalPreview} resizeMode="contain" />
            )}

            <Text style={s.modalLabel}>Visibility</Text>
            <View style={s.toggleRow}>
              <TouchableOpacity
                style={[s.toggleBtn, postVisibility === 'public' && s.toggleBtnActive]}
                onPress={() => setPostVisibility('public')}
              >
                <Text style={[s.toggleText, postVisibility === 'public' && s.toggleTextActive]}>Public</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[s.toggleBtn, postVisibility === 'private' && s.toggleBtnActive]}
                onPress={() => setPostVisibility('private')}
              >
                <Text style={[s.toggleText, postVisibility === 'private' && s.toggleTextActive]}>Private</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[s.postBtn, posting && { opacity: 0.6 }]}
              onPress={handlePostToProfile}
              disabled={posting}
            >
              <Text style={s.postBtnText}>{posting ? 'Posting...' : 'Post to Profile'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowPostModal(false)} style={s.cancelBtn}>
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
  container: { flex: 1, backgroundColor: '#FFFFFF' },
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
  actionsInfo: { flex: 1 },
  actionsTitle: {
    ...typeScale.headline,
    color: C.textPrimary,
  },
  actionsSub: {
    ...typeScale.caption,
    color: C.textSecondary,
    marginTop: 2,
  },
  actionBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconCircleBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: '#9CA3AF',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  iconCircleBtnActive: {
    borderColor: '#0B6DC3',
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
    color: C.textTertiary,
    marginHorizontal: space.lg,
    marginBottom: 4,
    marginTop: 4,
  },
  promptBody: {
    fontSize: 13,
    fontWeight: '400',
    color: '#67ACE9',
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
    color: C.textTertiary,
    marginBottom: space.md,
  },
  hList: {
    gap: 10,
    paddingRight: space.lg,
    paddingBottom: 4,
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
  tagText: {
    ...typeScale.caption,
    color: C.textSecondary,
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
    paddingBottom: 38,
    gap: 2,
  },
  hCardName: {
    fontSize: 13,
    fontWeight: '600',
    color: C.textPrimary,
    lineHeight: 17,
  },
  hCardBrand: {
    fontSize: 11,
    fontWeight: '400',
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
    color: C.textPrimary,
    marginLeft: 2,
  },
  hCardReviews: {
    fontSize: 10,
    color: C.textSecondary,
  },
  hCardPrice: {
    fontSize: 14,
    fontWeight: '700',
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
    backgroundColor: '#67ACE9',
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
    backgroundColor: '#FFFFFF',
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
    color: '#fff',
  },
  pillMeta: {
    flexDirection: 'column',
  },
  pillCount: {
    fontSize: 11,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.75)',
    lineHeight: 14,
  },
  pillPrice: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
    lineHeight: 18,
  },
  pillAction: {
    fontSize: 15,
    fontWeight: '700',
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
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 340,
    alignItems: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
    marginBottom: 4,
  },
  modalSubtitle: {
    fontSize: 13,
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
    backgroundColor: '#fff',
  },
  toggleBtnActive: {
    backgroundColor: colors.bluePrimary,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '600',
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
  },
  cancelBtn: {
    paddingVertical: 8,
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '500',
    color: '#888',
  },
});
