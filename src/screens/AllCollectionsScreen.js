import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import CardImage from '../components/CardImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Polyline } from 'react-native-svg';
import { space, radius, shadow, typeScale, fontWeight, letterSpacing, palette } from '../constants/tokens';
import { colors as C } from '../constants/theme';

const { width } = Dimensions.get('window');

const CURATED_COLLECTIONS = [
  {
    id: 'summer-refresh',
    title: 'Summer Refresh',
    subtitle: '12 rooms · Bright & airy living',
    imageUrl: 'https://images.unsplash.com/photo-1628744876490-19b035ecf9c3?w=900&q=80',
    styles: ['minimalist', 'scandi', 'biophilic'],
    accent: '#16A34A',
  },
  {
    id: 'dark-moody',
    title: 'Dark & Moody',
    subtitle: '8 rooms · Dramatic, rich interiors',
    imageUrl: 'https://images.unsplash.com/photo-1638541420159-cadd0634f08f?w=900&q=80',
    styles: ['dark-luxe', 'luxury'],
    accent: '#7C3AED',
  },
  {
    id: 'coastal-calm',
    title: 'Coastal Calm',
    subtitle: '10 rooms · Breezy & serene',
    imageUrl: 'https://images.unsplash.com/photo-1679862342541-e408d4f3ab80?w=900&q=80',
    styles: ['minimalist', 'scandi'],
    accent: '#0B6DC3',
  },
  {
    id: 'japandi-zen',
    title: 'Japandi Zen',
    subtitle: '9 rooms · Refined simplicity',
    imageUrl: 'https://images.unsplash.com/photo-1628744876497-eb30460be9f6?w=900&q=80',
    styles: ['japandi', 'wabi-sabi'],
    accent: '#B45309',
  },
  {
    id: 'boho-eclectic',
    title: 'Boho Eclectic',
    subtitle: '7 rooms · Free-spirited layers',
    imageUrl: 'https://images.unsplash.com/photo-1632119580908-ae947d4c7691?w=900&q=80',
    styles: ['bohemian'],
    accent: '#D97706',
  },
  {
    id: 'mid-century-modern',
    title: 'Mid-Century Modern',
    subtitle: '11 rooms · Iconic & timeless',
    imageUrl: 'https://images.unsplash.com/photo-1618221195710-2d01d1e0a0a0?w=900&q=80',
    styles: ['mid-century'],
    accent: '#EA580C',
  },
  {
    id: 'farmhouse-living',
    title: 'Farmhouse Living',
    subtitle: '6 rooms · Warm, rooted comfort',
    imageUrl: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&q=80',
    styles: ['farmhouse', 'rustic'],
    accent: '#A16207',
  },
  {
    id: 'glam-luxe',
    title: 'Glam & Luxe',
    subtitle: '5 rooms · Opulent statement spaces',
    imageUrl: 'https://images.unsplash.com/photo-1615529182904-14819c35db37?w=900&q=80',
    styles: ['luxury', 'glam'],
    accent: '#9333EA',
  },
];

function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={C.textPrimary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5" />
      <Polyline points="12 19 5 12 12 5" />
    </Svg>
  );
}

function ArrowRightIcon({ color = '#fff' }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12h14" />
      <Polyline points="12 5 19 12 12 19" />
    </Svg>
  );
}

export default function AllCollectionsScreen({ navigation }) {
  return (
    <View style={styles.root}>
      {/* Header */}
      <SafeAreaView edges={['top']} style={styles.headerSafe}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.backBtn} onPress={() => navigation.goBack()} activeOpacity={0.7}>
            <BackIcon />
          </TouchableOpacity>
          <View style={styles.headerTitleWrap}>
            <Text style={styles.headerTitle}>Collections</Text>
          </View>
          <View style={styles.backBtn} pointerEvents="none" />
        </View>
      </SafeAreaView>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} bounces>
        {/* Hero intro */}
        <LinearGradient
          colors={[palette.heroStart, palette.heroEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.introBanner}
        >
          <Text style={styles.introEyebrow}>CURATED FOR YOU</Text>
          <Text style={styles.introTitle}>Explore Collections</Text>
          <Text style={styles.introSub}>Handpicked room themes, styles, and product sets</Text>
        </LinearGradient>

        {/* Collections list */}
        <View style={styles.listContainer}>
          {CURATED_COLLECTIONS.map((col, i) => (
            <TouchableOpacity
              key={col.id}
              style={styles.collectionRow}
              activeOpacity={0.88}
              onPress={() =>
                navigation.navigate('Browse', {
                  mode: 'collection',
                  title: col.title,
                  subtitle: col.subtitle,
                  collection: col,
                  heroImage: col.imageUrl,
                })
              }
            >
              <CardImage uri={col.imageUrl} style={styles.rowImage} resizeMode="cover" />
              <LinearGradient
                colors={['rgba(0,0,0,0.10)', 'rgba(0,0,0,0.68)']}
                locations={[0.2, 1]}
                style={StyleSheet.absoluteFill}
              />
              {/* Accent top-left line */}
              <View style={[styles.accentLine, { backgroundColor: col.accent }]} />
              <View style={styles.rowContent}>
                <View style={styles.rowTextWrap}>
                  <Text style={styles.rowTitle}>{col.title}</Text>
                  <Text style={styles.rowSubtitle}>{col.subtitle}</Text>
                </View>
                <View style={styles.rowArrow}>
                  <ArrowRightIcon />
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  headerSafe: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
    zIndex: 10,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.base,
    paddingVertical: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    ...typeScale.title,
    color: C.textPrimary,
    letterSpacing: letterSpacing.tight,
  },

  scrollContent: {
    flexGrow: 1,
  },

  introBanner: {
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space['2xl'],
  },
  introEyebrow: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: 'rgba(255,255,255,0.65)',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  introTitle: {
    fontSize: 28,
    fontWeight: fontWeight.xbold,
    color: '#FFFFFF',
    letterSpacing: letterSpacing.tight,
    marginBottom: 6,
  },
  introSub: {
    ...typeScale.body,
    color: 'rgba(255,255,255,0.72)',
  },

  listContainer: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    gap: space.sm,
  },

  collectionRow: {
    height: 130,
    borderRadius: radius.xl,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  rowImage: {
    width: '100%',
    height: '100%',
  },
  accentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 4,
    height: '100%',
  },
  rowContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.base,
    paddingBottom: 14,
  },
  rowTextWrap: {
    flex: 1,
    paddingRight: space.sm,
  },
  rowTitle: {
    fontSize: 17,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
    letterSpacing: letterSpacing.tight,
    marginBottom: 3,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  rowSubtitle: {
    ...typeScale.caption,
    color: 'rgba(255,255,255,0.75)',
  },
  rowArrow: {
    width: 36,
    height: 36,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  bottomSpacer: {
    height: 40,
  },
});
