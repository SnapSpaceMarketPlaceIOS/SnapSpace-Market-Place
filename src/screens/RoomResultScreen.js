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
} from 'react-native';
import CardImage from '../components/CardImage';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';
import { colors } from '../constants/colors';
import { space, radius, fontWeight, fontSize, uiColors, typeScale, shadow } from '../constants/tokens';
import { Button, Badge, SectionHeader } from '../components/ds';
import { useCart } from '../context/CartContext';
import { getProductsForPrompt, getSourceLabel, getSourceColor } from '../services/affiliateProducts';

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
      fill={filled ? '#F5A623' : '#E5E7EB'} stroke={filled ? '#F5A623' : '#D1D5DB'} strokeWidth={1}>
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
  const prompt = route?.params?.prompt || 'Modern minimalist redesign';
  const resultUri = route?.params?.resultUri || null;
  const passedProducts = route?.params?.products || null;

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

      {/* Top bar always visible */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack()}>
          <BackIcon />
        </TouchableOpacity>
        <TouchableOpacity style={styles.iconBtn} onPress={handleShare}>
          <ShareIcon />
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
            <Text style={styles.sheetTitle}>Shop This Look</Text>
            <Text style={styles.sheetSubtitle}>
              {isExpanded ? 'Furniture matched to your design' : 'Swipe up to explore furniture'}
            </Text>
          </View>
        </View>

        {/* Scrollable product grid */}
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.productsGrid}
          scrollEnabled={isExpanded}
        >
          {/* FTC Disclosure */}
          <Text style={styles.disclosure}>We may earn a commission on purchases. Prices may vary.</Text>

          {products.map((product) => {
            const isAdded = addedItems[product.id];
            const ratingVal = typeof product.rating === 'number' ? product.rating : parseFloat(product.rating) || 0;
            return (
              <TouchableOpacity
                key={product.id}
                style={styles.productRow}
                activeOpacity={0.7}
                onPress={() => handleBuyNow(product)}
              >
                {/* Thumbnail */}
                <View style={styles.productImg}>
                  <CardImage
                    uri={product.imageUrl}
                    style={{ width: '100%', height: '100%' }}
                    resizeMode="cover"
                    placeholderColor="#2C3E50"
                  />
                </View>

                {/* Info */}
                <View style={styles.productInfo}>
                  <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>

                  {/* Stars */}
                  {ratingVal > 0 && (
                    <View style={styles.ratingRow}>
                      {[1,2,3,4,5].map(i => (
                        <StarIconSmall key={i} size={11} filled={i <= Math.round(ratingVal)} />
                      ))}
                      <Text style={styles.ratingScore}>{ratingVal.toFixed(1)}</Text>
                      {!!product.reviewCount && (
                        <Text style={styles.reviewCount}>({product.reviewCount.toLocaleString()})</Text>
                      )}
                    </View>
                  )}

                  {/* Brand + Amazon badge */}
                  <View style={styles.metaRow}>
                    <Text style={styles.productBrand}>{product.brand}</Text>
                    {product.source === 'amazon' && (
                      <View style={styles.sourceBadge}><AmazonLogoMark /></View>
                    )}
                  </View>

                  {/* Free Shipping */}
                  <Text style={styles.shippingText}>✓ Free Shipping</Text>
                </View>

                {/* Price + Add */}
                <View style={styles.priceCol}>
                  <Text style={styles.productPrice}>
                    {typeof product.price === 'number' ? `$${product.price.toLocaleString()}` : product.price}
                  </Text>
                  <TouchableOpacity
                    style={[styles.addBtn, isAdded && styles.addBtnDone]}
                    onPress={() => !isAdded && handleAddToCart(product)}
                    disabled={isAdded}
                  >
                    <Text style={styles.addBtnText}>{isAdded ? '✓' : '+ Add'}</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </Animated.View>
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
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 3,
  },
  productsGrid: {
    paddingHorizontal: 16,
    paddingBottom: 40,
    paddingTop: 8,
  },
  disclosure: {
    fontSize: 10,
    color: '#AAA',
    textAlign: 'center',
    marginBottom: 10,
    fontStyle: 'italic',
  },
  productRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.08)',
  },
  productImg: {
    width: PRODUCT_IMG_SIZE,
    height: PRODUCT_IMG_SIZE,
    borderRadius: Math.round(PRODUCT_IMG_SIZE * 0.05),
    backgroundColor: '#2C3E50',
    overflow: 'hidden',
    flexShrink: 0,
  },
  productInfo: {
    flex: 1,
    gap: 3,
  },
  productName: {
    fontSize: 15,
    fontWeight: '600',
    color: '#111',
    lineHeight: 20,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    marginTop: 2,
  },
  ratingScore: {
    fontSize: 11,
    fontWeight: '600',
    color: '#111',
    marginLeft: 3,
    lineHeight: 14,
  },
  reviewCount: {
    fontSize: 11,
    fontWeight: '400',
    color: '#6B7280',
    lineHeight: 14,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  productBrand: {
    fontSize: 12,
    fontWeight: '400',
    color: '#9CA3AF',
    lineHeight: 16,
  },
  sourceBadge: {
    backgroundColor: '#FFFFFF',
    borderRadius: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(0,0,0,0.08)',
    paddingHorizontal: 3,
    paddingVertical: 2,
  },
  shippingText: {
    fontSize: 11,
    fontWeight: '400',
    color: '#16A34A',
    lineHeight: 14,
  },
  priceCol: {
    alignItems: 'flex-end',
    gap: 8,
    flexShrink: 0,
  },
  productPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.bluePrimary,
    textAlign: 'right',
    lineHeight: 20,
  },
  addBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bluePrimary,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  addBtnDone: {
    backgroundColor: '#2ECC71',
  },
  addBtnText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
});
