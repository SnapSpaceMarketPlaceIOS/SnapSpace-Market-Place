import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Animated,
  Easing,
  ScrollView,
} from 'react-native';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { fontSize, fontWeight, letterSpacing, palette, space, radius, shadow } from '../constants/tokens';

const { width, height } = Dimensions.get('window');

// Extra pixels added above and below the image so parallax movement never reveals edges.
// At a 0.2 parallax factor the image travels at most PARALLAX_BUDGET px for every
// (PARALLAX_BUDGET / 0.2) px of user scroll — 300 px gives a wide, dramatic range.
const PARALLAX_BUDGET = 300;
const PARALLAX_FACTOR = 0.2;
const BLUE = '#0B6DC3';

// ─── Icons ────────────────────────────────────────────────────────────────────

function BellIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  );
}

function UserIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx={12} cy={7} r={4} />
    </Svg>
  );
}

function SendIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={22} y1={2} x2={11} y2={13} />
      <Polyline points="22 2 15 22 11 13 2 9 22 2" />
    </Svg>
  );
}

function CameraSmallIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx={12} cy={13} r={4} />
    </Svg>
  );
}

function ChevronRight() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'GOOD MORNING';
  if (hour >= 12 && hour < 17) return 'GOOD AFTERNOON';
  if (hour >= 17 && hour < 21) return 'GOOD EVENING';
  return 'GOOD NIGHT';
}

function getFirstName(user) {
  if (!user) return null;
  const full = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
  return full.split(' ')[0] || null;
}

// ─── Trending data ───────────────────────────────────────────────────────────

const TRENDING = [
  { id: 1, title: 'Nordic Living', tag: 'Minimalist', initial: 'A', color: '#3B82F6' },
  { id: 2, title: 'Warm Japandi', tag: 'Cozy', initial: 'B', color: '#8B5CF6' },
  { id: 3, title: 'Bold Maximalist', tag: 'Eclectic', initial: 'C', color: '#F59E0B' },
  { id: 4, title: 'Coastal Boho', tag: 'Serene', initial: 'D', color: '#10B981' },
  { id: 5, title: 'Industrial Chic', tag: 'Urban', initial: 'E', color: '#EF4444' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation, user = null }) {
  const [prompt, setPrompt] = useState('');
  const [greeting, setGreeting] = useState(getGreeting());

  // Scroll-driven parallax
  const scrollY = useRef(new Animated.Value(0)).current;

  // Ken Burns: gentle 6-second zoom-in on mount
  const kenBurnsScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => setGreeting(getGreeting()), 60_000);

    Animated.timing(kenBurnsScale, {
      toValue: 1.08,
      duration: 6000,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();

    return () => clearInterval(timer);
  }, []);

  // Image drifts upward at PARALLAX_FACTOR of the scroll speed.
  // extrapolate:'extend' keeps the effect alive through iOS rubber-band overscroll.
  const imageTranslateY = scrollY.interpolate({
    inputRange: [0, PARALLAX_BUDGET / PARALLAX_FACTOR],
    outputRange: [0, -PARALLAX_BUDGET],
    extrapolate: 'extend',
  });

  const firstName = getFirstName(user);
  const greetingLine = firstName
    ? `${greeting} ${firstName.toUpperCase()}`
    : greeting;

  return (
    <View style={styles.container}>
      {/* ── Parallax + Ken Burns background image ──────────── */}
      <Animated.Image
        source={require('../../assets/hero-room.jpg')}
        style={[
          styles.bgImage,
          {
            transform: [
              { translateY: imageTranslateY },
              { scale: kenBurnsScale },
            ],
          },
        ]}
        resizeMode="cover"
      />

      {/* ── Scrollable layer (drives parallax; content sits at full-screen height) */}
      <Animated.ScrollView
        style={StyleSheet.absoluteFill}
        contentContainerStyle={styles.scrollContent}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        bounces
      >
        {/* Multi-stop overlay for depth: dark top, open middle, dark bottom */}
        <LinearGradient
          colors={[
            'rgba(0,0,0,0.55)',
            'rgba(0,0,0,0.10)',
            'rgba(0,0,0,0.20)',
            'rgba(0,0,0,0.72)',
          ]}
          locations={[0, 0.25, 0.55, 1]}
          style={styles.overlay}
        >
          {/* ── Top Bar ───────────────────────────────────────── */}
          <View style={styles.topBar}>
            <View style={styles.logoRow}>
              <Text style={styles.logo}>SnapSpace</Text>
              <View style={styles.logoDot} />
            </View>
            <View style={styles.topIcons}>
              <TouchableOpacity style={styles.iconBtn} activeOpacity={0.75}>
                <BellIcon />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => navigation?.navigate('Profile')}
                activeOpacity={0.75}
              >
                <UserIcon />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Spacer — lets the room photo breathe at the top ── */}
          <View style={styles.topSpacer} />

          {/* ── Content block — sits in the lower-center of the screen ── */}
          <View style={styles.contentBlock}>
            {/* Hero Headline */}
            <View style={styles.heroSection}>
              <Text style={styles.greetingEyebrow}>{greetingLine}</Text>
              <Text style={styles.headline}>
              {"Let's Snap\n"}
              <Text style={styles.headlineBold}>Your Space.</Text>
              </Text>
            </View>

            {/* Search Bar */}
            <View style={styles.searchBar}>
              <TextInput
                style={styles.searchInput}
                placeholder="Describe your dream space..."
                placeholderTextColor="#999"
                value={prompt}
                onChangeText={setPrompt}
                returnKeyType="search"
              />
              <TouchableOpacity style={styles.searchSendBtn} activeOpacity={0.8}>
                <SendIcon />
              </TouchableOpacity>
            </View>

            {/* Photograph a Room Banner */}
            <TouchableOpacity
              style={styles.snapBanner}
              onPress={() => navigation?.navigate('Snap')}
              activeOpacity={0.88}
            >
              <View style={styles.snapBannerLeft}>
                <View style={styles.snapIconBox}>
                  <CameraSmallIcon />
                </View>
                <View style={styles.snapBannerText}>
                  <Text style={styles.snapBannerTitle}>Photograph a Room</Text>
                  <Text style={styles.snapBannerSub}>Point, snap, and let AI do the rest</Text>
                </View>
              </View>
              <View style={styles.snapChevron}>
                <ChevronRight />
              </View>
            </TouchableOpacity>
          </View>

          {/* ── Bottom padding — lifts content above nav bar ────── */}
          <View style={styles.bottomSpacer} />
        </LinearGradient>

        {/* ── Below-fold: Trending section hints there's more ── */}
        <View style={styles.trendingSection}>
          <View style={styles.trendingHeader}>
            <Text style={styles.trendingLabel}>TRENDING THIS WEEK</Text>
            <TouchableOpacity activeOpacity={0.7}>
              <Text style={styles.trendingSeeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.trendingScroll}
          >
            {TRENDING.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={styles.trendingCard}
                activeOpacity={0.82}
                onPress={() => navigation?.navigate('Explore')}
              >
                <View style={[styles.trendingCardImg, { backgroundColor: item.color + '22' }]}>
                  <View style={[styles.trendingCardInitial, { backgroundColor: item.color }]}>
                    <Text style={styles.trendingCardInitialText}>{item.initial}</Text>
                  </View>
                </View>
                <Text style={styles.trendingCardTitle} numberOfLines={1}>{item.title}</Text>
                <Text style={styles.trendingCardTag}>{item.tag}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      </Animated.ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
  },
  // Taller than the screen so parallax travel never exposes edges.
  // Ken Burns scale also expands the image, which is absorbed by this extra size.
  bgImage: {
    position: 'absolute',
    width,
    height: height + PARALLAX_BUDGET * 2,
    top: -PARALLAX_BUDGET,
  },
  scrollContent: {
    flexGrow: 1,
  },
  overlay: {
    height: height,
    paddingTop: space['5xl'],
  },

  // ── Top bar
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logo: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
    letterSpacing: letterSpacing.tight,
  },
  logoDot: {
    width: space.sm,
    height: space.sm,
    borderRadius: space.xs,
    backgroundColor: BLUE,
    marginLeft: space.xs,
    marginTop: 2,
  },
  topIcons: {
    flexDirection: 'row',
    gap: space.sm,
  },
  iconBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },

  // ── Spacers for vertical positioning
  topSpacer: {
    flex: 1,
  },
  contentBlock: {
    paddingHorizontal: space.lg,
    gap: space.base,
  },
  bottomSpacer: {
    flex: 1,
  },

  // ── Hero
  heroSection: {
    marginBottom: space.sm,
  },
  greetingEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
    letterSpacing: letterSpacing.wider,
    opacity: 0.7,
    textTransform: 'uppercase',
    marginBottom: space.sm,
  },
  headline: {
    fontSize: 38,
    fontWeight: fontWeight.xbold,
    color: '#FFFFFF',
    lineHeight: 44,
    letterSpacing: letterSpacing.tight,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  headlineBold: {
    fontWeight: fontWeight.xbold,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: radius.md,
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingVertical: space.xs,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    height: space['5xl'],
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    color: '#fff',
    paddingVertical: space.sm,
  },
  searchSendBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: BLUE,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.xs,
  },

  // ── Snap banner
  snapBanner: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.md,
    paddingVertical: space.base,
    paddingHorizontal: space.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    height: space['6xl'],
  },
  snapBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    flex: 1,
  },
  snapIconBox: {
    width: space['4xl'],
    height: space['4xl'],
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapBannerText: {
    flex: 1,
  },
  snapBannerTitle: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: '#FFFFFF',
    marginBottom: space.xs,
  },
  snapBannerSub: {
    fontSize: fontSize.xs,
    color: 'rgba(255,255,255,0.5)',
  },
  snapChevron: {
    width: space['2xl'],
    height: space['2xl'],
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Below-fold trending section
  trendingSection: {
    backgroundColor: '#F8FAFF',
    paddingTop: space.xl,
    paddingBottom: space['3xl'],
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  trendingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    marginBottom: space.base,
  },
  trendingLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#000',
    letterSpacing: letterSpacing.wider,
    textTransform: 'uppercase',
    opacity: 0.44,
  },
  trendingSeeAll: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: '#0B6DC3',
  },
  trendingScroll: {
    paddingHorizontal: space.lg,
    gap: space.md,
  },
  trendingCard: {
    width: 120,
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
  },
  trendingCardImg: {
    width: 120,
    height: 100,
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  trendingCardInitial: {
    width: 40,
    height: 40,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trendingCardInitialText: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    color: '#fff',
  },
  trendingCardTitle: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: '#111',
    marginBottom: 2,
  },
  trendingCardTag: {
    fontSize: fontSize.xs,
    color: '#888',
    opacity: 0.72,
  },
});
