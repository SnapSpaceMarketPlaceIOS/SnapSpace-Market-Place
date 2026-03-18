import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import CardImage from '../components/CardImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';
import { space, radius, shadow, typeScale, fontWeight, letterSpacing } from '../constants/tokens';
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
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"
      stroke="#111827" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12H5" />
      <Polyline points="12 19 5 12 12 5" />
    </Svg>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function AllCollectionsScreen({ navigation }) {
  return (
    <View style={styles.root}>
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          bounces
        >
          {/* ── Header — matches Explore page pattern ─────────────────── */}
          <View style={styles.headerRow}>
            <TouchableOpacity
              style={styles.backBtn}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <BackIcon />
            </TouchableOpacity>
          </View>

          <Text style={styles.eyebrow}>CURATED FOR YOU</Text>
          <Text style={styles.pageTitle}>Explore Collections</Text>
          <Text style={styles.pageSub}>Handpicked room themes, styles, and product sets</Text>

          {/* ── Collections list ──────────────────────────────────────── */}
          <View style={styles.listContainer}>
            {CURATED_COLLECTIONS.map((col) => (
              <TouchableOpacity
                key={col.id}
                style={styles.card}
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
                {/* Photo — clean, no overlay */}
                <View style={styles.photoWrap}>
                  <CardImage
                    uri={col.imageUrl}
                    style={styles.photo}
                    resizeMode="cover"
                    placeholderColor="#D0D7E3"
                  />
                </View>

                {/* Content below photo */}
                <View style={styles.cardBody}>
                  <Text style={styles.cardTitle}>{col.title}</Text>
                  <Text style={styles.cardSubtitle}>{col.subtitle}</Text>
                  <Badge variant="style" label={col.tag} style={styles.badge} />
                </View>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.bottomSpacer} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  scrollContent: {
    flexGrow: 1,
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  headerRow: {
    paddingHorizontal: space.lg,
    paddingTop: space.base,
    paddingBottom: space.sm,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    fontSize: 11,
    fontWeight: '700',
    color: '#9CA3AF',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingHorizontal: space.lg,
    marginBottom: 4,
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.bluePrimary,
    letterSpacing: letterSpacing.tight,
    paddingHorizontal: space.lg,
    marginBottom: 6,
  },
  pageSub: {
    ...typeScale.body,
    color: '#6B7280',
    paddingHorizontal: space.lg,
    marginBottom: space.xl,
  },

  // ── List ───────────────────────────────────────────────────────────────────
  listContainer: {
    paddingHorizontal: space.lg,
    gap: space.md,
  },

  // ── Card ───────────────────────────────────────────────────────────────────
  card: {
    borderRadius: radius.xl,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
  },

  // Photo — top half of card, clean with no overlay
  photoWrap: {
    width: '100%',
    height: 180,
    overflow: 'hidden',
  },
  photo: {
    width: '100%',
    height: '100%',
  },

  // Content area — white, below photo
  cardBody: {
    paddingHorizontal: space.base,
    paddingTop: space.md,
    paddingBottom: space.base,
    gap: 4,
    backgroundColor: '#FFFFFF',
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    letterSpacing: letterSpacing.tight,
  },
  cardSubtitle: {
    ...typeScale.caption,
    color: '#6B7280',
    marginBottom: 4,
  },
  badge: {
    alignSelf: 'flex-start',
  },

  bottomSpacer: {
    height: 40,
  },
});
