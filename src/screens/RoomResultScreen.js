import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Dimensions,
  Share,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';
import { colors } from '../constants/colors';

const { width, height } = Dimensions.get('window');

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

const PRODUCTS = [
  { id: 1, name: 'Modern Velvet Sofa', price: 1899, retailer: 'Article', color: '#2C3E50' },
  { id: 2, name: 'Walnut Coffee Table', price: 649, retailer: 'West Elm', color: '#5D6D7E' },
  { id: 3, name: 'Ceramic Table Lamp', price: 189, retailer: 'CB2', color: '#1E3A2F' },
  { id: 4, name: 'Wool Area Rug 8x10', price: 799, retailer: 'Rugs USA', color: '#3E2723' },
];

export default function RoomResultScreen({ route, navigation }) {
  const [addedItems, setAddedItems] = useState({});
  const prompt = route?.params?.prompt || 'Modern minimalist redesign';

  const handleShare = async () => {
    try {
      await Share.share({ message: `Check out my AI room design on SnapSpace: "${prompt}"` });
    } catch (e) {}
  };

  const addToCart = (id) => {
    setAddedItems((prev) => ({ ...prev, [id]: true }));
    Alert.alert('Added to Cart', 'Item has been added to your cart.');
  };

  return (
    <View style={styles.container}>
      {/* AI Generated Image Placeholder */}
      <LinearGradient
        colors={[colors.heroStart, colors.heroEnd, '#1A4A8A']}
        style={styles.imageArea}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.topBar}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => navigation?.goBack()}>
            <BackIcon />
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconBtn} onPress={handleShare}>
            <ShareIcon />
          </TouchableOpacity>
        </View>

        <View style={styles.imagePlaceholder}>
          <Svg width={40} height={40} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
            <Polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
          </Svg>
          <Text style={styles.placeholderText}>AI Generated Design</Text>
          <Text style={styles.placeholderSubtext}>{prompt}</Text>
        </View>
      </LinearGradient>

      {/* Bottom Sheet */}
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>Shop This Look</Text>
        <Text style={styles.sheetSubtitle}>Furniture matched to your design</Text>

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.productsRow}
        >
          {PRODUCTS.map((product) => (
            <View key={product.id} style={styles.productCard}>
              <View style={[styles.productThumb, { backgroundColor: product.color }]}>
                <SofaIcon />
              </View>
              <Text style={styles.productName} numberOfLines={2}>{product.name}</Text>
              <Text style={styles.productRetailer}>{product.retailer}</Text>
              <View style={styles.productBottom}>
                <Text style={styles.productPrice}>${product.price}</Text>
                <TouchableOpacity
                  style={[styles.addBtn, addedItems[product.id] && styles.addBtnDone]}
                  onPress={() => addToCart(product.id)}
                  disabled={addedItems[product.id]}
                >
                  {addedItems[product.id] ? (
                    <Text style={styles.addBtnText}>Added</Text>
                  ) : (
                    <>
                      <CartIcon />
                      <Text style={styles.addBtnText}>Add</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  imageArea: {
    height: height * 0.55,
    justifyContent: 'space-between',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 56,
    paddingHorizontal: 20,
  },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  imagePlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 16,
    fontWeight: '600',
    marginTop: 12,
  },
  placeholderSubtext: {
    color: 'rgba(255,255,255,0.25)',
    fontSize: 13,
    marginTop: 4,
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  sheetHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.gray,
    alignSelf: 'center',
    marginBottom: 18,
  },
  sheetTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.black,
  },
  sheetSubtitle: {
    fontSize: 13,
    color: '#888',
    marginTop: 4,
    marginBottom: 18,
  },
  productsRow: {
    gap: 14,
    paddingBottom: 20,
  },
  productCard: {
    width: 160,
    backgroundColor: colors.background,
    borderRadius: 18,
    overflow: 'hidden',
  },
  productThumb: {
    width: '100%',
    height: 110,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productName: {
    fontSize: 13,
    fontWeight: '700',
    color: colors.black,
    paddingHorizontal: 12,
    paddingTop: 10,
  },
  productRetailer: {
    fontSize: 11,
    color: '#888',
    paddingHorizontal: 12,
    marginTop: 2,
  },
  productBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  productPrice: {
    fontSize: 15,
    fontWeight: '800',
    color: colors.black,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.bluePrimary,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  addBtnDone: {
    backgroundColor: '#2ECC71',
  },
  addBtnText: {
    color: colors.white,
    fontSize: 12,
    fontWeight: '700',
  },
});
