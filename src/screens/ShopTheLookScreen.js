import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import CardImage from '../components/CardImage';
import Svg, { Path, Circle, Polyline, Line } from 'react-native-svg';
import { colors } from '../constants/colors';
import { LinearGradient } from 'expo-linear-gradient';
import { fontSize, fontWeight, letterSpacing, space, radius, shadow, typeScale } from '../constants/tokens';
import { useCart } from '../context/CartContext';
import PressableCard from '../components/PressableCard';
import { getProductsForDesign } from '../services/affiliateProducts';

const { width } = Dimensions.get('window');

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

function CheckIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
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

function CartWhiteIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={9} cy={21} r={1} />
      <Circle cx={20} cy={21} r={1} />
      <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
    </Svg>
  );
}

export default function ShopTheLookScreen({ route, navigation }) {
  const { design } = route.params;
  const { addToCart, items } = useCart();
  const [addedKeys, setAddedKeys] = useState({});
  const [products, setProducts] = useState(design.products || []);

  useEffect(() => {
    const matched = getProductsForDesign(design, 5);
    if (matched.length > 0) setProducts(matched);
  }, [design]);

  const isInCart = (product) => {
    const key = `${product.name}__${product.brand}`;
    return addedKeys[key] || items.some((item) => item.key === key);
  };

  const handleAddToCart = (product) => {
    const key = `${product.name}__${product.brand}`;
    addToCart(product);
    setAddedKeys((prev) => ({ ...prev, [key]: true }));
  };

  const handleAddAll = () => {
    let added = 0;
    products.forEach((p) => {
      if (!isInCart(p)) {
        handleAddToCart(p);
        added++;
      }
    });
    if (added > 0) {
      Alert.alert('Added to Cart', `${added} item${added > 1 ? 's' : ''} added to your cart.`);
    } else {
      Alert.alert('Already in Cart', 'All products are already in your cart.');
    }
  };

  const allInCart = products.every((p) => isInCart(p));

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity style={styles.headerBtn} onPress={() => navigation.goBack()}>
            <BackIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Shop The Look</Text>
          <TouchableOpacity
            style={styles.headerBtn}
            onPress={() => navigation.navigate('Main', { screen: 'Cart' })}
          >
            <CartNavIcon />
          </TouchableOpacity>
        </View>

        {/* Post Preview Card */}
        <View style={styles.postCard}>
          <View style={styles.postImage}>
            <CardImage uri={design.imageUrl} style={StyleSheet.absoluteFill} resizeMode="cover" />
          </View>
          <View style={styles.postInfo}>
            <View style={styles.postUserRow}>
              <View style={styles.postAvatar}>
                <Text style={styles.postAvatarText}>{design.initial}</Text>
              </View>
              <View>
                <Text style={styles.postTitle} numberOfLines={1}>
                  {design.title.replace('...', '')}
                </Text>
                <Text style={styles.postUser}>@{design.user}</Text>
              </View>
            </View>
          </View>
        </View>

        {/* FTC Disclosure */}
        <Text style={styles.disclosure}>We may earn a commission on purchases.</Text>

        {/* Products Section */}
        <Text style={styles.sectionLabel}>
          {products.length} PRODUCT{products.length !== 1 ? 'S' : ''} IN THIS LOOK
        </Text>

        {products.map((product, index) => {
          const inCart = isInCart(product);
          return (
            <PressableCard
              key={product.id || index}
              style={styles.productCard}
              onPress={() => navigation.navigate('ProductDetail', { product, design })}
            >
              <View style={styles.productImgWrap}>
                <CardImage
                  uri={product.imageUrl}
                  style={{ width: 56, height: 56, borderRadius: radius.lg }}
                  placeholderColor="#D0D7E3"
                />
              </View>
              <View style={styles.productDetails}>
                <Text style={styles.productName}>{product.name}</Text>
                <Text style={styles.productBrand}>{product.brand}</Text>
                <Text style={styles.productPrice}>{product.price}</Text>
              </View>
              <TouchableOpacity
                style={[styles.addBtn, inCart && styles.addBtnAdded]}
                onPress={() => !inCart && handleAddToCart(product)}
                activeOpacity={inCart ? 1 : 0.7}
              >
                {inCart ? <CheckIcon /> : <PlusSmallIcon />}
              </TouchableOpacity>
            </PressableCard>
          );
        })}

        <View style={{ height: space['5xl'] + space['3xl'] + space['3xl'] }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', '#FFFFFF']}
          style={styles.bottomBarFade}
          pointerEvents="none"
        />
        <View style={styles.bottomInfo}>
          <Text style={styles.bottomLabel}>
            {products.length} item{products.length !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.bottomTotal}>
            Total: {products.reduce((sum, p) => {
              const num = parseFloat(String(p.price).replace(/[^0-9.]/g, '')) || 0;
              return sum + num;
            }, 0).toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 })}
          </Text>
        </View>
        <TouchableOpacity
          style={[styles.addAllBtn, allInCart && styles.addAllBtnDone]}
          activeOpacity={0.85}
          onPress={handleAddAll}
        >
          {!allInCart && <CartWhiteIcon />}
          <Text style={styles.addAllBtnText}>
            {allInCart ? 'All Added' : 'Add All to Cart'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    paddingTop: space['5xl'],
    paddingBottom: space['2xl'],
  },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    marginBottom: space.lg,
  },
  headerBtn: {
    width: space['3xl'],
    height: space['3xl'],
    borderRadius: radius.full,
    backgroundColor: '#F4F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typeScale.headline,
    fontWeight: '700',
    color: '#111',
    letterSpacing: letterSpacing.tight,
  },

  // Post hero card — shadow.low + border.subtle
  postCard: {
    marginHorizontal: space.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    marginBottom: space.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
  },
  postImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    overflow: 'hidden',
  },
  postInfo: {
    padding: space.base,
  },
  postUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  postAvatar: {
    width: space['2xl'],
    height: space['2xl'],
    borderRadius: radius.full,
    backgroundColor: colors.bluePrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  postAvatarText: {
    ...typeScale.caption,
    fontWeight: '700',
    color: '#fff',
  },
  postTitle: {
    ...typeScale.body,
    fontWeight: '700',
    color: '#111',
  },
  postUser: {
    ...typeScale.caption,
    color: '#A0A0A8',
    opacity: 0.44,
    marginTop: 1,
  },

  disclosure: {
    ...typeScale.caption,
    color: '#C0C0C8',
    textAlign: 'center',
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
    fontStyle: 'italic',
  },
  sectionLabel: {
    ...typeScale.subheadline,
    color: '#A0A0A8',
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },

  // Product cards — shadow.low + border.subtle
  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.lg,
    padding: space.base,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    marginBottom: space.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
  },
  productImgWrap: {
    width: space['5xl'],
    height: space['5xl'],
    // Inner image inside radius.xl card (padding 16) → nesting: 20-16=4, but spec says radius.lg for ShopTheLook thumbnails
    borderRadius: radius.lg,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  productDetails: {
    flex: 1,
    marginLeft: space.md,
  },
  productName: {
    ...typeScale.body,
    fontWeight: '700',
    color: '#111',
    marginBottom: space.xs,
  },
  productBrand: {
    ...typeScale.caption,
    color: '#A0A0A8',
    opacity: 0.44,
    marginBottom: space.xs,
  },
  productPrice: {
    ...typeScale.price,
    color: colors.bluePrimary,
    letterSpacing: letterSpacing.tight,
    fontVariant: ['tabular-nums'],
  },
  addBtn: {
    width: space['3xl'],
    height: space['3xl'],
    borderRadius: radius.full,
    backgroundColor: colors.bluePrimary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: space.sm,
  },
  addBtnAdded: {
    backgroundColor: '#34C759',
  },

  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingBottom: 34,
    paddingTop: space.md,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -1 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 4,
  },
  bottomBarFade: {
    position: 'absolute',
    top: -24,
    left: 0,
    right: 0,
    height: 24,
    pointerEvents: 'none',
  },
  bottomInfo: {
    flex: 1,
  },
  bottomLabel: {
    ...typeScale.caption,
    color: '#A0A0A8',
    fontWeight: '500',
    opacity: 0.44,
  },
  bottomTotal: {
    ...typeScale.title,
    color: '#111',
    letterSpacing: letterSpacing.tight,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  addAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bluePrimary,
    borderRadius: radius.md,
    height: space['4xl'],
    paddingHorizontal: space.lg,
    gap: space.sm,
    shadowColor: shadow.medium.shadowColor,
    shadowOffset: shadow.medium.shadowOffset,
    shadowOpacity: shadow.medium.shadowOpacity,
    shadowRadius: shadow.medium.shadowRadius,
    elevation: shadow.medium.elevation,
  },
  addAllBtnDone: {
    backgroundColor: '#34C759',
  },
  addAllBtnText: {
    ...typeScale.button,
    fontWeight: '700',
    color: '#fff',
  },
});
