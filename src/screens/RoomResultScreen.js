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
import * as Sharing from 'expo-sharing';

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

// ── Figma-exact action icons (node IDs 531-309, 531-323, 531-313) ──────────────

// 531-309 "Load_circle_light" — download arrow (points down) + bottom arc tray
function FigmaLoadIcon({ size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30" fill="none">
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
}

// 531-323 "Subtract" — solid black circle with white + punched through
function FigmaSubtractIcon({ size = 28 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30" fill="none">
      <Path
        d="M15 0C23.2843 0 30 6.71573 30 15C30 23.2843 23.2843 30 15 30C6.71573 30 0 23.2843 0 15C0 6.71573 6.71573 0 15 0ZM15 6.16602C14.7241 6.16602 14.5004 6.39017 14.5 6.66602V14.5H6.66699C6.39085 14.5 6.16699 14.7239 6.16699 15C6.16699 15.2761 6.39085 15.5 6.66699 15.5H14.5V23.333C14.5 23.6091 14.7239 23.833 15 23.833C15.2761 23.833 15.5 23.6091 15.5 23.333V15.5H23.333C23.609 15.4998 23.833 15.276 23.833 15C23.833 14.724 23.609 14.5002 23.333 14.5H15.5V6.66602C15.4996 6.39017 15.2759 6.16602 15 6.16602Z"
        fill="#111827"
      />
    </Svg>
  );
}

// 531-313 "Download_circle_light" — share arrow (points up) + bottom arc tray
function FigmaShareIcon({ size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30" fill="none">
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
    // Share the prompt + image URL so recipients can view the generated design
    try {
      const shareMsg = `Check out my AI room design on SnapSpace!\n\n"${prompt}"`;
      if (resultUri) {
        await Share.share({ message: shareMsg + `\n\n${resultUri}` });
      } else {
        await Share.share({ message: shareMsg });
      }
    } catch (e) {}
  };

  const handleSaveToPhotos = async () => {
    if (!resultUri || saving) return;
    setSaving(true);
    try {
      // Download to local cache, then open iOS share sheet (includes "Save Image" option)
      const fileUri = FileSystem.cacheDirectory + 'snapspace_design_' + Date.now() + '.jpg';
      const { status } = await FileSystem.downloadAsync(resultUri, fileUri);
      if (status === 200) {
        const canShare = await Sharing.isAvailableAsync();
        if (canShare) {
          await Sharing.shareAsync(fileUri, { mimeType: 'image/jpeg', dialogTitle: 'Save or Share Image' });
        } else {
          Alert.alert('Saved', 'Image saved to app cache.');
        }
      } else {
        throw new Error('Download returned status ' + status);
      }
    } catch (e) {
      // Fallback: share the remote URL directly if download fails
      try {
        await Share.share({ message: `My SnapSpace AI design: "${prompt}"\n\n${resultUri}` });
      } catch {
        Alert.alert('Could Not Save', 'Please screenshot the image to save it.');
      }
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
                {saving
                  ? <ActivityIndicator size="small" color="#111827" />
                  : <FigmaLoadIcon size={22} />}
              </TouchableOpacity>
              {resultUri && user && (
                <TouchableOpacity style={[styles.shopActionBtn, styles.shopActionBtnPost]} onPress={() => setShowPostModal(true)} disabled={posting || posted}>
                  {posting
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <FigmaSubtractIcon size={28} />}
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.shopActionBtn} onPress={handleShare}>
                <FigmaShareIcon size={22} />
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
    color: '#67ACE9',
    marginTop: 3,
  },
  shopActions: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  shopActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopActionBtnPost: {
    backgroundColor: 'transparent',
    width: 32,
    height: 32,
    borderRadius: 16,
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
