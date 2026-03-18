import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import CardImage from '../components/CardImage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Polyline } from 'react-native-svg';
import { space, radius, shadow, typeScale, fontWeight, letterSpacing, palette } from '../constants/tokens';
import { colors } from '../constants/colors';
import { Badge } from '../components/ds';

// ── Collections data ──────────────────────────────────────────────────────────

const CURATED_COLLECTIONS = [
  {
    id: 'summer-refresh',
    title: 'Summer Refresh',
    subtitle: '12 rooms · Bright & airy living',
    imageUrl: 'https://images.unsplash.com/photo-1628744876490-19b035ecf9c3?w=900&q=80',
    styles: ['minimalist', 'scandi', 'biophilic'],
    tag: 'MINIMALIST',
  },
  {
    id: 'dark-moody',
    title: 'Dark & Moody',
    subtitle: '8 rooms · Dramatic, rich interiors',
    imageUrl: 'https://images.unsplash.com/photo-1638541420159-cadd0634f08f?w=900&q=80',
    styles: ['dark-luxe', 'luxury'],
    tag: 'DARK LUXE',
  },
  {
    id: 'coastal-calm',
    title: 'Coastal Calm',
    subtitle: '10 rooms · Breezy & serene',
    imageUrl: 'https://images.unsplash.com/photo-1679862342541-e408d4f3ab80?w=900&q=80',
    styles: ['minimalist', 'scandi'],
    tag: 'COASTAL',
  },
  {
    id: 'japandi-zen',
    title: 'Japandi Zen',
    subtitle: '9 rooms · Refined simplicity',
    imageUrl: 'https://images.unsplash.com/photo-1628744876497-eb30460be9f6?w=900&q=80',
    styles: ['japandi', 'wabi-sabi'],
    tag: 'JAPANDI',
  },
  {
    id: 'boho-eclectic',
    title: 'Boho Eclectic',
    subtitle: '7 rooms · Free-spirited layers',
    imageUrl: 'https://images.unsplash.com/photo-1632119580908-ae947d4c7691?w=900&q=80',
    styles: ['bohemian'],
    tag: 'BOHO',
  },
  {
    id: 'mid-century-modern',
    title: 'Mid-Century Modern',
    subtitle: '11 rooms · Iconic & timeless',
    imageUrl: 'https://images.unsplash.com/photo-1618221195710-2d01d1e0a0a0?w=900&q=80',
    styles: ['mid-century'],
    tag: 'MID-CENTURY',
  },
  {
    id: 'farmhouse-living',
    title: 'Farmhouse Living',
    subtitle: '6 rooms · Warm, rooted comfort',
    imageUrl: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=900&q=80',
    styles: ['farmhouse', 'rustic'],
    tag: 'FARMHOUSE',
  },
  {
    id: 'glam-luxe',
    title: 'Glam & Luxe',
    subtitle: '5 rooms · Opulent statement spaces',
    imageUrl: 'https://images.unsplash.com/photo-1615529182904-14819c35db37?w=900&q=80',
    styles: ['luxury', 'glam'],
    tag: 'LUXURY',
  },
];

// ── Icons ─────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF"
      strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5" />
      <Polyline points="12 19 5 12 12 5" />
    </Svg>
  );
}

function ArrowRightIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF"
      strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M5 12h14" />
      <Polyline points="12 5 19 12 12 19" />
    </Svg>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AllCollectionsScreen({ navigation }) {
  const insets = useSafeAreaInsets();

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* ── Hero banner — back button floated over gradient, no separate nav bar */}
        <LinearGradient
          colors={[palette.heroStart, palette.heroEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.heroBanner, { paddingTop: insets.top + 16 }]}
        >
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            activeOpacity={0.7}
          >
            <BackIcon />
          </TouchableOpacity>

          <View style={styles.heroTextWrap}>
            <Text style={styles.introEyebrow}>CURATED FOR YOU</Text>
            <Text style={styles.introTitle}>Explore Collections</Text>
            <Text style={styles.introSub}>Handpicked room themes, styles, and product sets</Text>
          </View>
        </LinearGradient>

        {/* ── Collections list */}
        <View style={styles.listContainer}>
          {CURATED_COLLECTIONS.map((col) => (
            <TouchableOpacity
              key={col.id}
              style={styles.collectionCard}
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
              {/* Room photo */}
              <CardImage uri={col.imageUrl} style={styles.cardImage} resizeMode="cover" />

              {/* Bottom-weighted gradient for text legibility */}
              <LinearGradient
                colors={['rgba(0,0,0,0)', 'rgba(0,0,0,0.75)']}
                locations={[0.4, 1]}
                style={StyleSheet.absoluteFill}
              />

              {/* Style badge — top left */}
              <Badge variant="outline" label={col.tag} style={styles.styleBadge} />

              {/* Title + arrow — bottom */}
              <View style={styles.cardContent}>
                <View style={styles.cardTextWrap}>
                  <Text style={styles.cardTitle}>{col.title}</Text>
                  <Text style={styles.cardSubtitle}>{col.subtitle}</Text>
                </View>
                <View style={styles.arrowBtn}>
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

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
  },

  // ── Hero ───────────────────────────────────────────────────────────────────
  heroBanner: {
    paddingHorizontal: space.lg,
    paddingBottom: space['2xl'],
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.lg,
  },
  heroTextWrap: {},
  introEyebrow: {
    fontSize: 11,
    fontWeight: fontWeight.bold,
    color: 'rgba(255,255,255,0.60)',
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

  // ── List ───────────────────────────────────────────────────────────────────
  listContainer: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    gap: space.md,                        // 12px — more breathing room
  },

  // ── Card ───────────────────────────────────────────────────────────────────
  collectionCard: {
    height: 180,                          // taller to show the room image properly
    borderRadius: radius.xl,             // 20px — consistent with rest of app
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: shadow.medium.shadowColor,
    shadowOffset: shadow.medium.shadowOffset,
    shadowOpacity: shadow.medium.shadowOpacity,
    shadowRadius: shadow.medium.shadowRadius,
    elevation: shadow.medium.elevation,
  },
  cardImage: {
    width: '100%',
    height: '100%',
  },
  styleBadge: {
    position: 'absolute',
    top: 12,
    left: 12,
  },
  cardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.base,
    paddingBottom: 16,
  },
  cardTextWrap: {
    flex: 1,
    paddingRight: space.sm,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: letterSpacing.tight,
    marginBottom: 3,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  cardSubtitle: {
    ...typeScale.caption,
    color: 'rgba(255,255,255,0.80)',
  },

  // Solid brand-blue arrow — matches every CTA in the app
  arrowBtn: {
    width: 38,
    height: 38,
    borderRadius: radius.full,
    backgroundColor: colors.bluePrimary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.blueDeep,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
    elevation: 4,
  },

  bottomSpacer: {
    height: 40,
  },
});
