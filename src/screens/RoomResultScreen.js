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
  ActivityIndicator,
  Animated,
  PanResponder,
  Linking,
  Modal,
} from 'react-native';
import CardImage from '../components/CardImage';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Line, Polyline, Rect, G } from 'react-native-svg';
import { colors } from '../constants/colors';
import { space, radius, fontWeight, fontSize, uiColors, typeScale, shadow } from '../constants/tokens';
import { Button, Badge, SectionHeader } from '../components/ds';
import { useCart } from '../context/CartContext';
import { useAuth } from '../context/AuthContext';
import { getProductsForPrompt, getSourceLabel, getSourceColor } from '../services/affiliateProducts';
import { saveUserDesign } from '../services/supabase';
import * as FileSystem from 'expo-file-system/legacy';

const { width, height } = Dimensions.get('window');

// Sheet snap positions (distance from top of screen)
const PEEK_HEIGHT = 90;           // how much peeks up from bottom when collapsed
const SHEET_COLLAPSED = height - PEEK_HEIGHT;
const SHEET_EXPANDED = height * 0.08; // near top of screen

function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function ShareIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={18} cy={5} r={3} />
      <Circle cx={6} cy={12} r={3} />
      <Circle cx={18} cy={19} r={3} />
      <Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
      <Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
    </Svg>
  );
}

function PostIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <Polyline points="16 6 12 2 8 6" />
      <Line x1={12} y1={2} x2={12} y2={15} />
    </Svg>
  );
}

function DownloadIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <Polyline points="7 10 12 15 17 10" />
      <Line x1={12} y1={15} x2={12} y2={3} />
    </Svg>
  );
}

function CartIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={9} cy={21} r={1} />
      <Circle cx={20} cy={21} r={1} />
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Svg>
  );
}

function SofaIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v3" />
      <Path d="M2 11v5a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-5a2 2 0 0 0-4 0v2H6v-2a2 2 0 0 0-4 0z" />
    </Svg>
  );
}

function AmazonLogoMark() {
  return (
    <View style={{ alignItems: 'flex-start' }}>
      <Text style={{ fontSize: 6, fontWeight: '800', color: '#232F3E', letterSpacing: -0.2, lineHeight: 8 }}>amazon</Text>
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
      fill={filled ? '#67ACE9' : '#E5E7EB'} stroke={filled ? '#67ACE9' : '#D1D5DB'} strokeWidth={1}>
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  );
}

const PRODUCT_IMG_SIZE = 88;

export default function RoomResultScreen({ route, navigation }) {
  const [addedItems, setAddedItems] = useState({});
  const [imageLoading, setImageLoading] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [products, setProducts] = useState([]);

  const { addToCart } = useCart();
  const { user } = useAuth();
  const prompt = route?.params?.prompt || 'Modern minimalist redesign';
  const resultUri = route?.params?.resultUri || null;
  const passedProducts = route?.params?.products || null;
  const [saving, setSaving] = useState(false);
  const [showPostModal, setShowPostModal] = useState(false);
  const [postVisibility, setPostVisibility] = useState('public');
  const [posting, setPosting] = useState(false);
  const [posted, setPosted] = useState(false);

  useEffect(() => {
    // Use products passed from SnapScreen if available, otherwise match locally
    const routeProducts = route?.params?.products;
    if (routeProducts && routeProducts.length > 0) {
      setProducts(routeProducts);
    } else {
      const matched = getProductsForPrompt(prompt, 6);
      setProducts(matched);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prompt, route.params]);

  // Animated value starts at collapsed position
  const sheetY = useRef(new Animated.Value(SHEET_COLLAPSED)).current;
  const lastY = useRef(SHEET_COLLAPSED);

  const snapTo = useCallback((toValue) => {
    lastY.current = toValue;
    setIsExpanded(toValue === SHEET_EXPANDED);
    Animated.spring(sheetY, {
      toValue,
      useNativeDriver: true,
      bounciness: 4,
      speed: 14,
    }).start();
  }, [sheetY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 5,
      onPanResponderGrant: () => {
        sheetY.setOffset(lastY.current);
        sheetY.setValue(0);
      },
      onPanResponderMove: (_, { dy }) => {
        const newVal = lastY.current + dy;
        if (newVal >= SHEET_EXPANDED && newVal <= SHEET_COLLAPSED) {
          sheetY.setValue(dy);
        }
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        sheetY.flattenOffset();
        const currentPos = lastY.current + dy;
        const midpoint = (SHEET_COLLAPSED + SHEET_EXPANDED) / 2;

        if (vy < -0.5 || currentPos < midpoint) {
          snapTo(SHEET_EXPANDED);
        } else {
          snapTo(SHEET_COLLAPSED);
        }
      },
    })
  ).current;

  const handleShare = async () => {
    try {
      await Share.share({ message: `Check out my AI room design on SnapSpace: "${prompt}"` });
    } catch (e) {}
  };

  const handleSaveToPhotos = async () => {
    if (!resultUri || saving) return;
    setSaving(true);
    try {
      // Download to local file first — iOS share sheet shows "Save Image" for local files
      const fileUri = FileSystem.cacheDirectory + 'snapspace_design_' + Date.now() + '.webp';
      await FileSystem.downloadAsync(resultUri, fileUri);
      await Share.share({ url: fileUri });
    } catch (e) {
      Alert.alert('Save Failed', 'Could not save the image. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handlePostToProfile = async () => {
    if (!resultUri || !user || posting) return;
    setPosting(true);
    try {
      const styleTags = products.flatMap(p => p.styles || []).filter(Boolean);
      const uniqueTags = [...new Set(styleTags)];
      const productSummary = products.map(p => ({ id: p.id, name: p.name, price: p.priceValue ?? p.price }));
      await saveUserDesign(user.id, {
        imageUrl: resultUri,
        prompt,
        styleTags: uniqueTags,
        products: productSummary,
        visibility: postVisibility,
      });
      setShowPostModal(false);
      setPosted(true);
      Alert.alert('Posted!', `Your design has been saved to your profile${postVisibility === 'public' ? ' and is visible on Explore' : ''}.`);
    } catch (e) {
      Alert.alert('Post Failed', e.message || 'Could not save. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const handleAddToCart = (product) => {
    // Pass priceValue (number) as price so CartContext subtotal math works
    addToCart({ ...product, price: product.priceValue ?? product.price });
    setAddedItems((prev) => ({ ...prev, [product.id]: true }));
    Alert.alert('Added to Cart', `${product.name} has been added to your cart.`);
  };

  const handleBuyNow = async (product) => {
    if (product.affiliateUrl) {
      const supported = await Linking.canOpenURL(product.affiliateUrl);
      if (supported) {
        await Linking.openURL(product.affiliateUrl);
      }
    }
  };

  // Dim overlay fades in as sheet expands
  const overlayOpacity = sheetY.interpolate({
    inputRange: [SHEET_EXPANDED, SHEET_COLLAPSED],
    outputRange: [0.45, 0],
    extrapolate: 'clamp',
  });

  return (
    <View style={styles.container}>
      {/* Full-screen AI image behind everything */}
      <View style={StyleSheet.absoluteFill}>
        {resultUri ? (
          <>
            <Image
              source={{ uri: resultUri }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
              onLoadEnd={() => setImageLoading(false)}
            />
            {imageLoading && (
              <View style={styles.imageLoadingOverlay}>
                <ActivityIndicator size="large" color={colors.white} />
              </View>
            )}
          </>
        ) : (
          <LinearGradient
            colors={[colors.heroStart, colors.heroEnd, '#1A4A8A']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
          >
            <View style={styles.imagePlaceholder}>
              <Svg width={48} height={48} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
                <Polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
              </Svg>
              <Text style={styles.placeholderText}>AI Generated Design</Text>
              <Text style={styles.placeholderSubtext}>{prompt}</Text>
            </View>
          </LinearGradient>
        )}
      </View>

      {/* Top bar — back only, action icons moved to sheet */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack()}>
          <BackIcon />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack()}>
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.white} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
            <Line x1={18} y1={6} x2={6} y2={18} />
            <Line x1={6} y1={6} x2={18} y2={18} />
          </Svg>
        </TouchableOpacity>
      </View>

      {/* Prompt badge at bottom of image */}
      {resultUri && !isExpanded && (
        <View style={styles.promptBadge}>
          <Text style={styles.promptBadgeText} numberOfLines={1}>{prompt}</Text>
        </View>
      )}

      {/* Dim overlay when sheet is expanded */}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, { backgroundColor: '#000', opacity: overlayOpacity }]}
      />

      {/* Draggable Bottom Sheet */}
      <Animated.View
        style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}
      >
        {/* Drag handle area */}
        <View style={styles.handleArea} {...panResponder.panHandlers}>
          <View style={styles.sheetHandle} />
          <View style={styles.sheetPeek}>
            <View style={styles.shopHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.sheetTitle}>Your Prompt</Text>
                <Text style={styles.promptText} numberOfLines={2}>{prompt}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* Scrollable content */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.productsGrid}
          scrollEnabled={isExpanded}
        >
          {/* Section header with action icons */}
          <View style={styles.shopSectionRow}>
            <View>
              <Text style={styles.shopSectionTitle}>SHOP YOUR ROOM</Text>
              <Text style={styles.shopSectionSub}>Products matched to your design</Text>
            </View>
            <View style={styles.shopActions}>
              <TouchableOpacity style={styles.shopActionBtn} onPress={handleSaveToPhotos} disabled={saving}>
                <DownloadIcon />
              </TouchableOpacity>
              {resultUri && !posted && user && (
                <TouchableOpacity style={styles.shopActionBtn} onPress={() => setShowPostModal(true)}>
                  <PostIcon />
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.shopActionBtn} onPress={handleShare}>
                <ShareIcon />
              </TouchableOpacity>
            </View>
          </View>

          {/* Horizontal product cards */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingRight: 16, gap: 10, paddingBottom: 4 }}
          >
            {products.map((product) => {
              const ratingVal = typeof product.rating === 'number' ? product.rating : parseFloat(product.rating) || 0;
              return (
                <TouchableOpacity
                  key={product.id}
                  style={styles.hCard}
                  activeOpacity={0.7}
                  onPress={() => navigation?.navigate('ProductDetail', { product })}
                >
                  <CardImage
                    uri={product.imageUrl}
                    style={styles.hCardImg}
                    resizeMode="cover"
                    placeholderColor="#2C3E50"
                  />
                  <View style={styles.hCardBody}>
                    <Text style={styles.hCardName} numberOfLines={2}>{product.name}</Text>
                    <Text style={styles.hCardBrand}>{product.brand}</Text>
                    {ratingVal > 0 && (
                      <View style={styles.hCardRating}>
                        {[1,2,3,4,5].map(i => (
                          <StarIconSmall key={i} size={10} filled={i <= Math.round(ratingVal)} />
                        ))}
                        <Text style={styles.hCardRatingText}>{ratingVal.toFixed(1)}</Text>
                        {!!product.reviewCount && (
                          <Text style={styles.hCardReviews}>({product.reviewCount.toLocaleString()})</Text>
                        )}
                      </View>
                    )}
                    <Text style={styles.hCardPrice}>
                      {typeof product.priceValue === 'number'
                        ? `$${product.priceValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : typeof product.price === 'number'
                          ? `$${product.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                          : product.priceLabel || String(product.price).replace(/^\$+/, '$')}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.hCardAdd}
                    activeOpacity={0.7}
                    onPress={() => handleAddToCart(product)}
                  >
                    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5}>
                      <Line x1={12} y1={5} x2={12} y2={19} />
                      <Line x1={5} y1={12} x2={19} y2={12} />
                    </Svg>
                  </TouchableOpacity>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* FTC Disclosure */}
          <Text style={styles.disclosure}>We may earn a commission on purchases. Prices may vary.</Text>
        </ScrollView>
      </Animated.View>

      {/* Post to Profile Modal */}
      <Modal visible={showPostModal} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Post to Profile</Text>
            <Text style={styles.modalSubtitle}>Share your AI design with the community</Text>

            {resultUri && (
              <Image source={{ uri: resultUri }} style={styles.modalPreview} resizeMode="contain" />
            )}

            <Text style={styles.modalLabel}>Visibility</Text>
            <View style={styles.toggleRow}>
              <TouchableOpacity
                style={[styles.toggleBtn, postVisibility === 'public' && styles.toggleBtnActive]}
                onPress={() => setPostVisibility('public')}
              >
                <Text style={[styles.toggleText, postVisibility === 'public' && styles.toggleTextActive]}>Public</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.toggleBtn, postVisibility === 'private' && styles.toggleBtnActive]}
                onPress={() => setPostVisibility('private')}
              >
                <Text style={[styles.toggleText, postVisibility === 'private' && styles.toggleTextActive]}>Private</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.postBtn, posting && { opacity: 0.6 }]}
              onPress={handlePostToProfile}
              disabled={posting}
            >
              <Text style={styles.postBtnText}>{posting ? 'Posting...' : 'Post to Profile'}</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setShowPostModal(false)} style={styles.cancelBtn}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  imageLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
    zIndex: 10,
  },
  topBarRight: {
    flexDirection: 'row',
    gap: 10,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.5)',
    fontSize: 18,
    fontWeight: '700',
    marginTop: 14,
  },
  placeholderSubtext: {
    color: 'rgba(255,255,255,0.3)',
    fontSize: 13,
    marginTop: 6,
    paddingHorizontal: 32,
    textAlign: 'center',
  },
  promptBadge: {
    position: 'absolute',
    bottom: PEEK_HEIGHT + 16,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  promptBadgeText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: height - SHEET_EXPANDED + 40,
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  handleArea: {
    paddingTop: 12,
    paddingBottom: 4,
    paddingHorizontal: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#DDD',
    alignSelf: 'center',
    marginBottom: 14,
  },
  sheetPeek: {
    marginBottom: 8,
  },
  shopHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sheetTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#9CA3AF',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  promptText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111',
    lineHeight: 22,
    marginTop: 4,
  },
  productsGrid: {
    paddingLeft: 16,
    paddingBottom: 40,
    paddingTop: 8,
  },
  shopSectionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingRight: 16,
    marginBottom: 16,
    marginTop: 8,
  },
  shopSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  shopSectionSub: {
    fontSize: 13,
    fontWeight: '400',
    color: '#6B7280',
    marginTop: 3,
  },
  shopActions: {
    flexDirection: 'row',
    gap: 6,
  },
  shopActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  disclosure: {
    fontSize: 10,
    color: '#AAA',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 10,
    fontStyle: 'italic',
    paddingRight: 16,
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
    fontSize: 15,
    fontWeight: '700',
    color: colors.bluePrimary,
    marginTop: 4,
  },
  hCardAdd: {
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
  // ── Post Modal ────────────────────────────────────────────────────
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
