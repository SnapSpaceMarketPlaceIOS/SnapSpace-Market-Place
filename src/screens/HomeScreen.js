import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Image,
  Linking,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { fontSize, fontWeight, letterSpacing, palette, space, radius, shadow } from '../constants/tokens';
import { useAuth } from '../context/AuthContext';
import { DESIGNS } from '../data/designs';
import { searchProducts, getSourceColor } from '../services/affiliateProducts';

const { width, height } = Dimensions.get('window');

// Extra pixels added above and below the image so parallax movement never reveals edges.
// At a 0.2 parallax factor the image travels at most PARALLAX_BUDGET px for every
// (PARALLAX_BUDGET / 0.2) px of user scroll — 300 px gives a wide, dramatic range.
const PARALLAX_BUDGET = 300;
const PARALLAX_FACTOR = 0.2;
const BLUE = '#0B6DC3';

// Rotating hero: 15 curated full-room interior photos — every shot shows a complete
// furnished space (living room, bedroom, dining, open-plan) that represents the app.
// Crossfade every HERO_ROTATE_INTERVAL ms; fade duration HERO_FADE_DURATION ms.
const HERO_ROTATE_INTERVAL = 7000;
const HERO_FADE_DURATION   = 1800;

const HERO_IMAGES = [
  // Luxury living room — floor-to-ceiling windows, white sofa, city view
  'https://images.unsplash.com/photo-1613545325268-9265e1609167?w=1600&q=90&fit=crop',
  // Boho living room — green sofa, gallery wall, arc lamp, indoor plants
  'https://images.unsplash.com/photo-1632119580908-ae947d4c7691?w=1600&q=90&fit=crop',
  // Warm contemporary living room — gray sofa, plants, coffee table, natural light
  'https://images.unsplash.com/photo-1628744876490-19b035ecf9c3?w=1600&q=90&fit=crop',
  // Luxe open-plan living + staircase — full room with decor
  'https://images.unsplash.com/photo-1638541420159-cadd0634f08f?w=1600&q=90&fit=crop',
  // Art-forward living room — statement sofa, gallery wall art, full decor
  'https://images.unsplash.com/photo-1639059790587-95625e6b764c?w=1600&q=90&fit=crop',
  // Cozy living room — sectional sofa, fireplace, arm chairs, full layout
  'https://images.unsplash.com/photo-1649083048770-82e8ffd80431?w=1600&q=90&fit=crop',
  // Modern living room — black sofa, floral accent, styled shelves
  'https://images.unsplash.com/photo-1669387448840-610c588f003d?w=1600&q=90&fit=crop',
  // Luxury bedroom — chandelier, upholstered bed, complete decor
  'https://images.unsplash.com/photo-1668512624222-2e375314be39?w=1600&q=90&fit=crop',
  // Hotel-style bedroom — floor-length curtains, layered bedding, full room
  'https://images.unsplash.com/photo-1590490359854-dfba19688d70?w=1600&q=90&fit=crop',
  // Elegant bedroom with lounge chair — complete styled space
  'https://images.unsplash.com/photo-1668512624275-0ee56aca4c1a?w=1600&q=90&fit=crop',
  // Contemporary bedroom — pendant lamps, full width, natural light
  'https://images.unsplash.com/photo-1719297493975-0fa857dcc8b8?w=1600&q=90&fit=crop',
  // Styled dining room — wooden table, upholstered chairs, warm tones
  'https://images.unsplash.com/photo-1615529182904-14819c35db37?w=1600&q=90&fit=crop',
  // Modern kitchen + dining — bold orange dining table, open plan
  'https://images.unsplash.com/photo-1760067538241-33a8694d9e23?w=1600&q=90&fit=crop',
  // Minimalist living room — white sofa, wood table, clean full-room layout
  'https://images.unsplash.com/photo-1628744876497-eb30460be9f6?w=1600&q=90&fit=crop',
  // Warm living room vignette — sofa, coffee table, layered rugs, full scene
  'https://images.unsplash.com/photo-1679862342541-e408d4f3ab80?w=1600&q=90&fit=crop',
];

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

// ─── Trending: top-liked designs from the real catalog ───────────────────────

const TRENDING_DESIGNS = [...DESIGNS]
  .sort((a, b) => b.likes - a.likes)
  .slice(0, 8);

// ─── Featured products: popular styles shown on home feed ────────────────────

const FEATURED_PRODUCTS = searchProducts({ keywords: 'modern living room bedroom', limit: 8 });

// ─── Component ────────────────────────────────────────────────────────────────

const FIRST_VISIT_KEY = 'snapspace_home_visited';

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const [prompt, setPrompt] = useState('');
  const [greeting, setGreeting] = useState(getGreeting());

  // Ping-pong slots: we ONLY ever change a slot's source when its opacity is 0,
  // so the source swap is always invisible — zero flash, zero glitch.
  const [slotA, setSlotA] = useState(HERO_IMAGES[0]);
  const [slotB, setSlotB] = useState(HERO_IMAGES[1]);
  const nextIdxRef  = useRef(2);          // next image to preload
  const aIsLiveRef  = useRef(true);       // which slot is currently visible
  const opacityA    = useRef(new Animated.Value(1)).current;
  const opacityB    = useRef(new Animated.Value(0)).current;
  const cycleTimer  = useRef(null);

  // Scroll-driven parallax
  const scrollY = useRef(new Animated.Value(0)).current;

  // Ken Burns: slow continuous zoom — shared across both slots so there's no
  // scale jump when the crossfade flips between them.
  const kenBurnsScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const timer = setInterval(() => setGreeting(getGreeting()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // Ken Burns loops forever: 1.0 → 1.08 over one full interval, then resets
  useEffect(() => {
    let stopped = false;
    const loop = () => {
      kenBurnsScale.setValue(1);
      Animated.timing(kenBurnsScale, {
        toValue: 1.08,
        duration: (HERO_ROTATE_INTERVAL + HERO_FADE_DURATION) * 1.5,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }).start(({ finished }) => { if (finished && !stopped) loop(); });
    };
    loop();
    return () => { stopped = true; kenBurnsScale.stopAnimation(); };
  }, []);

  // Ping-pong crossfade — no React state ever changes while an image is visible.
  // Sequence:
  //   1. Fade live slot OUT, idle slot IN  (idle was preloaded at opacity 0)
  //   2. Flip which slot is "live"
  //   3. Update the newly-idle slot's source to the NEXT image (it's at opacity 0
  //      so the source change is completely invisible)
  //   4. Wait HERO_ROTATE_INTERVAL, then repeat
  useEffect(() => {
    const L = HERO_IMAGES.length;
    let stopped = false;

    const runCycle = () => {
      if (stopped) return;
      const aLive = aIsLiveRef.current;
      const liveOp  = aLive ? opacityA : opacityB;
      const idleOp  = aLive ? opacityB : opacityA;

      Animated.parallel([
        Animated.timing(liveOp, {
          toValue: 0,
          duration: HERO_FADE_DURATION,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(idleOp, {
          toValue: 1,
          duration: HERO_FADE_DURATION,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]).start(({ finished }) => {
        if (!finished || stopped) return;

        // Flip live slot
        aIsLiveRef.current = !aLive;

        // Load next image into the NOW-IDLE slot (opacity 0 — invisible swap)
        const next = HERO_IMAGES[nextIdxRef.current % L];
        nextIdxRef.current = (nextIdxRef.current + 1) % L;
        if (aLive) {
          setSlotA(next);   // A just went idle
        } else {
          setSlotB(next);   // B just went idle
        }

        cycleTimer.current = setTimeout(runCycle, HERO_ROTATE_INTERVAL);
      });
    };

    cycleTimer.current = setTimeout(runCycle, HERO_ROTATE_INTERVAL);
    return () => {
      stopped = true;
      clearTimeout(cycleTimer.current);
      opacityA.stopAnimation();
      opacityB.stopAnimation();
    };
  }, []);

  // Show auth screen once for first-time guests only
  useEffect(() => {
    if (user) return;
    (async () => {
      const visited = await AsyncStorage.getItem(FIRST_VISIT_KEY);
      if (!visited) {
        await AsyncStorage.setItem(FIRST_VISIT_KEY, 'true');
        navigation.navigate('Auth');
      }
    })();
  }, [user]);

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
      {/* ── Ping-pong hero slots: source only swaps when slot is invisible ── */}
      <Animated.Image
        source={{ uri: slotA }}
        style={[styles.bgImage, { transform: [{ translateY: imageTranslateY }, { scale: kenBurnsScale }], opacity: opacityA }]}
        resizeMode="cover"
      />
      <Animated.Image
        source={{ uri: slotB }}
        style={[styles.bgImage, { transform: [{ translateY: imageTranslateY }, { scale: kenBurnsScale }], opacity: opacityB }]}
        resizeMode="cover"
      />

      {/* ── Permanent 15% black tint above the hero images ── */}
      <View style={styles.heroTint} pointerEvents="none" />

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

        {/* ── Below-fold: Trending Designs ── */}
        <View style={styles.trendingSection}>
          <View style={styles.trendingHeader}>
            <Text style={styles.trendingLabel}>TRENDING THIS WEEK</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => navigation?.navigate('Explore')}>
              <Text style={styles.trendingSeeAll}>See all</Text>
            </TouchableOpacity>
          </View>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.trendingScroll}
          >
            {TRENDING_DESIGNS.map((design) => (
              <TouchableOpacity
                key={design.id}
                style={styles.trendingCard}
                activeOpacity={0.82}
                onPress={() => navigation?.navigate('ShopTheLook', { design })}
              >
                <View style={styles.trendingCardImg}>
                  <Image
                    source={{ uri: design.imageUrl }}
                    style={styles.trendingCardPhoto}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.55)']}
                    style={styles.trendingCardGrad}
                  />
                  <View style={styles.trendingCardBadge}>
                    <Text style={styles.trendingCardBadgeText}>
                      {design.products?.length || 3} items
                    </Text>
                  </View>
                </View>
                <Text style={styles.trendingCardTitle} numberOfLines={1}>
                  {design.title.replace('...', '')}
                </Text>
                <Text style={styles.trendingCardTag}>
                  {design.styles?.[0]
                    ? design.styles[0].charAt(0).toUpperCase() + design.styles[0].slice(1)
                    : design.user}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Featured Products ── */}
        <View style={styles.featuredSection}>
          <View style={styles.trendingHeader}>
            <Text style={styles.trendingLabel}>FEATURED PRODUCTS</Text>
            <TouchableOpacity activeOpacity={0.7} onPress={() => navigation?.navigate('Explore')}>
              <Text style={styles.trendingSeeAll}>Shop all</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.featuredDisclosure}>We may earn a commission on purchases.</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.trendingScroll}
          >
            {FEATURED_PRODUCTS.map((product, i) => (
              <TouchableOpacity
                key={product.id || i}
                style={styles.featuredCard}
                activeOpacity={0.82}
                onPress={() => navigation?.navigate('ProductDetail', { product })}
              >
                <View style={styles.featuredCardImg}>
                  {product.imageUrl ? (
                    <Image
                      source={{ uri: product.imageUrl }}
                      style={styles.featuredCardPhoto}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.featuredCardPhoto, { backgroundColor: '#E8EDF5' }]} />
                  )}
                  <View style={[styles.featuredSourceBadge, { backgroundColor: getSourceColor(product.source) }]}>
                    <Text style={styles.featuredSourceText}>
                      {product.source === 'amazon' ? 'Amazon' : product.source}
                    </Text>
                  </View>
                </View>
                <Text style={styles.featuredCardName} numberOfLines={2}>{product.name}</Text>
                <Text style={styles.featuredCardPrice}>{product.price}</Text>
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
    // Extra width absorbs Ken Burns scale without revealing edges on sides
    width: width * 1.12,
    left: -(width * 0.06),
    // Extra height absorbs both parallax travel and Ken Burns scale
    height: (height + PARALLAX_BUDGET * 2) * 1.12,
    top: -PARALLAX_BUDGET,
  },
  heroTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
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
    width: 130,
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
  },
  trendingCardImg: {
    width: 130,
    height: 110,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  trendingCardPhoto: {
    width: '100%',
    height: '100%',
  },
  trendingCardGrad: {
    ...StyleSheet.absoluteFillObject,
  },
  trendingCardBadge: {
    position: 'absolute',
    bottom: 6,
    left: 6,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  trendingCardBadgeText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '600',
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

  // ── Featured Products section
  featuredSection: {
    backgroundColor: '#F8FAFF',
    paddingTop: space.xl,
    paddingBottom: space['4xl'],
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  featuredDisclosure: {
    fontSize: 10,
    color: '#BBB',
    fontStyle: 'italic',
    paddingHorizontal: space.lg,
    marginBottom: space.base,
    marginTop: -space.sm,
  },
  featuredCard: {
    width: 140,
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
  },
  featuredCardImg: {
    width: 140,
    height: 120,
    borderRadius: radius.lg,
    overflow: 'hidden',
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    backgroundColor: '#EEF2F7',
  },
  featuredCardPhoto: {
    width: '100%',
    height: '100%',
  },
  featuredSourceBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  featuredSourceText: {
    color: '#fff',
    fontSize: 9,
    fontWeight: '700',
  },
  featuredCardName: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: '#111',
    marginBottom: 2,
    lineHeight: 15,
  },
  featuredCardPrice: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
    color: '#0B6DC3',
  },
});
