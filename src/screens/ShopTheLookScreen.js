import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
} from 'react-native';
import Svg, { Path, Circle, Polyline, Rect, Line } from 'react-native-svg';
import { colors } from '../constants/colors';
import { fontSize, fontWeight, letterSpacing, space, radius } from '../constants/tokens';
import { useCart } from '../context/CartContext';

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

function ImagePlaceholderIcon({ size = 36 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={18} height={18} rx={2} />
      <Circle cx={8.5} cy={8.5} r={1.5} />
      <Polyline points="21 15 16 10 5 21" />
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
    design.products.forEach((p) => {
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

  const allInCart = design.products.every((p) => isInCart(p));

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
            <ImagePlaceholderIcon size={48} />
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

        {/* Products Section */}
        <Text style={styles.sectionLabel}>
          {design.products.length} PRODUCT{design.products.length !== 1 ? 'S' : ''} IN THIS LOOK
        </Text>

        {design.products.map((product, index) => {
          const inCart = isInCart(product);
          return (
            <TouchableOpacity
              key={index}
              style={styles.productCard}
              activeOpacity={0.75}
              onPress={() => navigation.navigate('ProductDetail', { product, design })}
            >
              <View style={styles.productImgWrap}>
                <ImagePlaceholderIcon size={32} />
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
            </TouchableOpacity>
          );
        })}

        <View style={{ height: 100 }} />
      </ScrollView>

      {/* Bottom Bar */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomInfo}>
          <Text style={styles.bottomLabel}>
            {design.products.length} item{design.products.length !== 1 ? 's' : ''}
          </Text>
          <Text style={styles.bottomTotal}>
            Total: {design.products.reduce((sum, p) => {
              const num = parseFloat(p.price.replace(/[^0-9.]/g, '')) || 0;
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
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: '#111',
    letterSpacing: letterSpacing.tight,
  },

  postCard: {
    marginHorizontal: space.lg,
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#F8FAFC',
    marginBottom: space.xl,
  },
  postImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#D7D7D7',
    alignItems: 'center',
    justifyContent: 'center',
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
    color: '#fff',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },
  postTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: '#111',
  },
  postUser: {
    fontSize: fontSize.xs,
    color: '#A0A0A8',
    opacity: 0.44,
    marginTop: 1,
  },

  sectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#A0A0A8',
    letterSpacing: letterSpacing.wider,
    textTransform: 'uppercase',
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },

  productCard: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: space.lg,
    padding: space.base,
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    marginBottom: space.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
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
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: '#111',
    marginBottom: space.xs,
  },
  productBrand: {
    fontSize: fontSize.xs,
    color: '#A0A0A8',
    opacity: 0.44,
    marginBottom: space.xs,
  },
  productPrice: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
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
  },
  bottomInfo: {
    flex: 1,
  },
  bottomLabel: {
    fontSize: fontSize.xs,
    color: '#A0A0A8',
    fontWeight: fontWeight.medium,
    opacity: 0.44,
  },
  bottomTotal: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
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
  },
  addAllBtnDone: {
    backgroundColor: '#34C759',
  },
  addAllBtnText: {
    color: '#fff',
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
  },
});
