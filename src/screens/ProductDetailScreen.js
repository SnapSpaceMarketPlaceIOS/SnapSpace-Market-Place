/**
 * ProductDetailScreen — HomeGenie PDP
 *
 * Layout (scroll order, top → bottom):
 *   S0  Hero image        Padded + rounded gallery + progress bar + floating nav
 *   ─── White card (radius.xl top corners, overlaps hero) ────────────────────
 *   S1  Product Title     Name only, typeScale.display
 *   S2  Description       Collapsible body, truncated 3 lines
 *   S3  Reviews           Stars + rating + review count
 *   S4  Supplier Row      Brand (SellerName) + Camera / Download / Share icons
 *   S5  Variants          Color / Size / Shape swatches (horizontal scroll)
 *   S6  Price block       Current price (blue) + compare-at strikethrough
 *   S7  Quantity          − qty + stepper
 *   S8  Delivery box      "Free Fast Delivery" + estimated date
 *   S9  Product Details   Collapsible spec-table rows
 *   S10 Key Features      Collapsible numbered rows
 *
 * Fixed UI:
 *   StickyHeader  — materialises after hero scrolls out of view
 *   CTABar        — always-visible: FTC note + affiliate link + "Add to Cart"
 */

import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  ScrollView,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Alert,
  Animated,
  Easing,
  Linking,
  Share,
  Pressable,
} from 'react-native';
import Svg, { Path, Circle, Polyline, Line, Rect, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCart } from '../context/CartContext';
import { useLiked } from '../context/LikedContext';
import CardImage from '../components/CardImage';
import { SellerName } from '../components/VerifiedBadge';
import { handleShopNow } from '../services/productTapHandler';
import { useOnboarding, ONBOARDING_STEPS } from '../context/OnboardingContext';
import OnboardingOverlay, { OnboardingGlow } from '../components/OnboardingOverlay';
import {
  uiColors,
  space,
  radius,
  typeScale,
  shadow,
  layout,
  motion,
  touchTargets,
  fonts,
} from '../constants/tokens';

const { width: SW, height: SH } = Dimensions.get('window');

// ─── Layout constants ────────────────────────────────────────────────────────
const PAD_H       = layout.screenPaddingH;        // 20
const SECTION_GAP = layout.sectionGap;             // 32
const IMAGE_W     = SW - (PAD_H * 2);             // image width with side padding
const IMAGE_H     = Math.round(IMAGE_W * 1.1);    // taller than square for breathing room
// Hero image corner radius. radius.sm (8pt) per user direction
// 2026-04-28 — they wanted 8–10px, less aggressive than the prior
// radius.xl (20pt) which read as too soft for the product shape.
const IMAGE_R     = radius.sm;
const CARD_LIFT   = 0;                             // no overlap — bar sits between hero and card
const FEAT_BG     = uiColors.accentBg;              // feature icon circle bg
const DIVIDER_COLOR = 'rgba(0,0,0,0.06)';

// ── Reusable separator ───────────────────────────────────────────────────────
function Divider() {
  return <View style={{ height: 1, backgroundColor: DIVIDER_COLOR, marginHorizontal: PAD_H }} />;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Format a numeric USD price → "$1,149" or "$649.99" */
function fmtPrice(n) {
  if (typeof n !== 'number') return String(n ?? '');
  return n % 1 === 0 ? `$${n.toLocaleString()}` : `$${n.toFixed(2)}`;
}

/** Estimated delivery date N days out */
function deliveryDate(offsetDays = 4) {
  const DAYS   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun',
                  'Jul','Aug','Sep','Oct','Nov','Dec'];
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const BackIcon = () => (
  <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
    stroke={uiColors.textPrimary} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="15 18 9 12 15 6" />
  </Svg>
);

const HeartIcon = ({ filled = false, size = 22 }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={filled ? '#67ACE9' : uiColors.textSecondary}
    strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
    <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"
      fill={filled ? '#67ACE9' : 'none'} />
  </Svg>
);

const ShareIcon = ({ size = 22, color = uiColors.textSecondary }) => (
  <Svg width={size} height={size} viewBox="0 0 30 30" fill="none">
    <Path
      d="M6.54815 18.5147C7.04668 20.3752 8.1452 22.0193 9.67334 23.1918C11.2015 24.3644 13.0738 25 15 25C16.9262 25 18.7985 24.3644 20.3267 23.1918C21.8548 22.0193 22.9533 20.3752 23.4519 18.5147"
      stroke={color} strokeWidth={1.4} strokeLinecap="round"
    />
    <Path
      d="M15 5L14.6877 4.60957L15 4.35969L15.3123 4.60957L15 5ZM15.5 16.25C15.5 16.5261 15.2761 16.75 15 16.75C14.7239 16.75 14.5 16.5261 14.5 16.25L15 16.25L15.5 16.25ZM8.75 10L8.43765 9.60957L14.6877 4.60957L15 5L15.3123 5.39043L9.06235 10.3904L8.75 10ZM15 5L15.3123 4.60957L21.5623 9.60957L21.25 10L20.9377 10.3904L14.6877 5.39043L15 5ZM15 5L15.5 5L15.5 16.25L15 16.25L14.5 16.25L14.5 5L15 5Z"
      fill={color}
    />
  </Svg>
);

const StarIcon = ({ size = 15, filled = true }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24"
    fill={filled ? '#67ACE9' : uiColors.border} stroke={filled ? '#67ACE9' : uiColors.border} strokeWidth={1}>
    <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
  </Svg>
);

const CartIconNavy = () => (
  <Svg width={20} height={20} viewBox="0 0 24 24" fill="none"
    stroke={uiColors.textPrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
    <Circle cx={9} cy={21} r={1} />
    <Circle cx={20} cy={21} r={1} />
    <Path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6" />
  </Svg>
);

const ChevRight = ({ size = 14, color = uiColors.textTertiary }) => (
  <Svg width={size} height={size} viewBox="0 0 24 24" fill="none"
    stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
    <Polyline points="9 18 15 12 9 6" />
  </Svg>
);

// Supplier row icons — from custom SVG set (tight square viewBoxes for consistent sizing)
// White genie lamp icon for the visualizer button
const GenieLampIcon = ({ size = 20 }) => (
  <Svg width={size} height={size} viewBox="92 176 266 155" fill="none">
    <Path d="M326.155 194.661C306.203 193.551 286.596 223.576 265.287 232.582C259.954 218.661 247.863 208.794 233.603 206.723C231.53 206.386 230.008 204.515 230.02 202.32V201.347C230.044 200.249 230.428 199.189 231.123 198.353C233.699 195.023 234.837 190.732 234.262 186.491C233.675 182.25 231.945 180 228 180C223.945 180 221.632 183.609 221.596 188.674C221.56 192.191 222.71 195.622 224.819 198.353C225.49 199.201 225.862 200.262 225.886 201.347V202.32C225.934 204.441 224.52 206.287 222.53 206.723C206.748 209.006 193.77 220.794 189.432 236.748C178 232.457 167.143 226.669 157.138 219.497C130.008 200.91 117.852 197.824 106.271 197.234C106.271 197.234 104.761 197.234 101.739 199.004L97.5928 201.372V201.385C96.2007 201.953 95.6735 205.674 96.2008 206.672C96.7161 207.67 99.1384 208.944 100.229 209.031C114.118 209.518 127.527 211.489 138.924 219.771C164.952 237.721 180.062 295.913 228.116 295.913C275.031 295.913 295.993 209.304 326.155 209.304C346.886 209.304 342.714 254.499 330.898 264.778C319.082 275.069 307.291 264.503 296.637 264.503C283.719 264.503 284.33 277.476 291.281 278.287C292.862 278.524 294.468 278.05 295.69 276.99C296.925 275.93 297.668 274.37 297.74 272.711C304.33 277.464 312.024 280.283 320.029 280.845C338.699 280.845 354 250.642 354 228.464C353.964 218.248 349.175 195.896 326.155 194.661ZM262.64 247.836C251.579 251.878 239.943 253.936 228.21 253.923C216.502 253.923 204.878 251.877 193.818 247.873C190.93 246.888 189.324 243.67 190.235 240.639C202.326 245.591 215.196 248.123 228.186 248.11C241.176 248.098 254.058 245.566 266.161 240.639C266.593 242.111 266.449 243.682 265.754 245.042C265.059 246.389 263.885 247.399 262.471 247.836H262.64ZM272.322 318.425V318.961C258.158 324.387 243.154 327.106 228.054 326.994C212.955 327.144 197.964 324.462 183.774 319.061V318.524C184.302 316.204 185.704 314.196 187.669 312.973C189.634 311.751 191.995 311.414 194.212 312.038C201.378 314.532 209.275 312.088 213.972 305.925C215.099 304.341 215.974 302.582 216.561 300.711C220.3 301.522 224.098 301.921 227.921 301.921C231.732 301.909 235.519 301.397 239.198 300.374C240.552 305.152 243.763 309.119 248.053 311.339C252.343 313.547 257.316 313.809 261.798 312.038C264.003 311.414 266.364 311.763 268.317 312.986C270.282 314.208 271.673 316.204 272.2 318.524L272.322 318.425Z" fill="#FFFFFF" />
  </Svg>
);

// Key feature icons
const ShieldIcon  = () => <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={uiColors.primary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></Svg>;
const LayersIcon  = () => <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={uiColors.primary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><Polyline points="12 2 2 7 12 12 22 7 12 2" /><Polyline points="2 17 12 22 22 17" /><Polyline points="2 12 12 17 22 12" /></Svg>;
const DropletIcon = () => <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={uiColors.primary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><Path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" /></Svg>;
const WrenchIcon  = () => <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={uiColors.primary} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"><Path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></Svg>;

// ─── S0: ProgressBar (replaces dots) ────────────────────────────────────────

function ProgressBar({ count, activeIndex, onSegmentPress }) {
  if (!count || count < 1) return null;
  return (
    <View style={pb.container}>
      {Array.from({ length: count }).map((_, i) => (
        <TouchableOpacity
          key={i}
          onPress={() => onSegmentPress?.(i)}
          activeOpacity={0.7}
          hitSlop={{ top: 12, bottom: 12, left: 2, right: 2 }}
          style={[
            pb.segment,
            { backgroundColor: i === activeIndex ? '#67ACE9' : uiColors.border },
          ]}
        />
      ))}
    </View>
  );
}

const pb = StyleSheet.create({
  container: {
    flexDirection: 'row',
    paddingHorizontal: PAD_H,
    marginTop: space.md,
    marginBottom: space.sm,
    borderRadius: 2,
    overflow: 'hidden',
  },
  segment: {
    flex: 1,
    height: 2,
  },
});

// ─── S0: ProductHero (padded, rounded, with progress bar) ───────────────────

function ProductHero({ images, imageUrl, onBack, topInset, heroResizeMode }) {
  const [activeIdx, setActiveIdx] = useState(0);

  // Deduplicate by Amazon asset ID — without this, the same product shot
  // shows up twice in the carousel because `imageUrl` points to it at a
  // smaller size (e.g. 81-a1cUJElL._AC_UL640_.jpg) and `images[0]` points
  // to the larger render (81-a1cUJElL._AC_SL1500_.jpg). Same picture, two
  // URLs — the carousel was treating them as distinct slides.
  //
  // Previous regex approach was correct in theory but fragile. This
  // implementation splits the filename on "." and takes the first token,
  // which for Amazon URLs IS the asset ID, every time.
  const heroImages = useMemo(() => {
    const all = [];
    if (imageUrl) all.push(imageUrl);
    if (Array.isArray(images)) all.push(...images);
    if (all.length === 0) return [null];

    const keyOf = (url) => {
      if (typeof url !== 'string' || !url) return url;
      // Strip query string, then grab the path's last segment (filename).
      const noQuery = url.split('?')[0];
      const slashIdx = noQuery.lastIndexOf('/');
      const filename = slashIdx >= 0 ? noQuery.slice(slashIdx + 1) : noQuery;
      // For "81-a1cUJElL._AC_UL640_.jpg" → first token is "81-a1cUJElL"
      // For "81-a1cUJElL.jpg"            → first token is "81-a1cUJElL"
      // For non-Amazon URLs with a single dot (photo.png) the key is the
      // bare filename before the extension — still correct.
      const firstDot = filename.indexOf('.');
      return firstDot >= 0 ? filename.slice(0, firstDot) : filename;
    };

    const seen = new Set();
    const out = [];
    for (const u of all) {
      const key = keyOf(u);
      if (seen.has(key)) continue;
      seen.add(key);
      // Opportunistic upgrade: when we have a lower-res Amazon size suffix
      // swap to the 1500px variant so the hero always renders sharp.
      const upgraded = typeof u === 'string'
        ? u
            .replace(/_AC_UL\d+_/g, '_AC_SL1500_')
            .replace(/_AC_SX\d+_/g, '_AC_SL1500_')
            .replace(/_SX\d+_/g,    '_AC_SL1500_')
        : u;
      out.push(upgraded);
    }
    return out;
  }, [imageUrl, images]);

  const flatListRef = useRef(null);
  const resMode = heroResizeMode || 'cover';

  const onViewableChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) setActiveIdx(viewableItems[0].index ?? 0);
  }).current;

  const viewConfig = useRef({ viewAreaCoveragePercentThreshold: 50 }).current;

  const scrollToImage = (index) => {
    flatListRef.current?.scrollToIndex({ index, animated: true });
  };

  return (
    <View style={[hs.root, { paddingTop: topInset + space.sm }]}>
      {/* Back button — positioned above the image, in the left margin */}
      <TouchableOpacity style={hs.backBtn} onPress={onBack}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <BackIcon />
      </TouchableOpacity>

      {/* Padded, rounded image container */}
      <View style={hs.imageWrapper}>
        <FlatList
          ref={flatListRef}
          data={heroImages}
          keyExtractor={(_, i) => String(i)}
          horizontal
          snapToInterval={IMAGE_W}
          decelerationRate="fast"
          showsHorizontalScrollIndicator={false}
          onViewableItemsChanged={onViewableChanged}
          viewabilityConfig={viewConfig}
          renderItem={({ item: uri }) => (
            <CardImage
              uri={uri}
              style={hs.img}
              resizeMode={resMode}
              placeholderColor={uiColors.surface}
            />
          )}
        />
      </View>
      {/* Segmented nav bar — tap any segment to jump to that image */}
      <ProgressBar count={heroImages.length} activeIndex={activeIdx} onSegmentPress={scrollToImage} />
    </View>
  );
}

const hs = StyleSheet.create({
  root: {
    width: SW,
    backgroundColor: uiColors.bg,
  },
  backBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: PAD_H,
    marginBottom: space.sm,
  },
  imageWrapper: {
    width: IMAGE_W,
    height: IMAGE_H,
    borderRadius: IMAGE_R,
    overflow: 'hidden',
    alignSelf: 'center',
    backgroundColor: '#FFFFFF',
  },
  img: {
    width: IMAGE_W,
    height: IMAGE_H,
  },
});

// ─── S1: ProductTitle ────────────────────────────────────────────────────────

function ProductTitle({ name }) {
  return (
    <View style={pt.wrap}>
      <Text style={pt.title}>{name}</Text>
    </View>
  );
}

const pt = StyleSheet.create({
  wrap: {
    paddingHorizontal: PAD_H,
    paddingTop: space['3xl'],
  },
  title: {
    ...typeScale.display,
    color: uiColors.textPrimary,
    letterSpacing: -0.3,
  },
});

// ─── S2: ProductDescription ──────────────────────────────────────────────────

function ProductDescription({ text }) {
  const [open, setOpen] = useState(false);
  const long = (text ?? '').length > 130;
  return (
    <View style={dc.wrap}>
      <Text style={dc.body} numberOfLines={open ? undefined : 3}>{text}</Text>
      {long && (
        <TouchableOpacity onPress={() => setOpen(o => !o)} activeOpacity={0.7}>
          <Text style={dc.toggle}>{open ? 'Show less' : 'Read more'}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const dc = StyleSheet.create({
  wrap: {
    paddingHorizontal: PAD_H,
    marginTop: space.base,
  },
  body: {
    ...typeScale.body,
    color: uiColors.textSecondary,
  },
  toggle: {
    ...typeScale.button,
    color: uiColors.primary,
    marginTop: space.xs,
  },
});

// ─── S3: ReviewsRow ──────────────────────────────────────────────────────────

function ReviewsRow({ rating, reviewCount }) {
  const ratingVal   = typeof rating === 'number' ? rating : parseFloat(rating) || 4.0;
  const filledStars = Math.round(ratingVal);
  const displayReviews = reviewCount ?? 0;

  return (
    <View style={rv.wrap}>
      <View style={rv.stars}>
        {[1, 2, 3, 4, 5].map(i => (
          <StarIcon key={i} size={15} filled={i <= filledStars} />
        ))}
      </View>
      <Text style={rv.score}>{ratingVal.toFixed(1)}</Text>
      <Text style={rv.count}>({displayReviews.toLocaleString()} {displayReviews === 1 ? 'Review' : 'Reviews'})</Text>
      <ChevRight size={12} color={uiColors.textSecondary} />
    </View>
  );
}

const rv = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PAD_H,
    marginTop: space.lg,
  },
  stars: {
    flexDirection: 'row',
    gap: 2,
  },
  score: {
    ...typeScale.headline,
    color: uiColors.textPrimary,
    marginLeft: space.sm,
  },
  count: {
    ...typeScale.body,
    color: uiColors.textSecondary,
    marginLeft: space.xs,
  },
});

// ─── S4: SupplierRow ─────────────────────────────────────────────────────────

function BouncyIconButton({ onPress, children, style }) {
  const scale = useRef(new Animated.Value(1)).current;
  const handlePressIn = () => {
    Animated.spring(scale, {
      toValue: 0.88,
      useNativeDriver: true,
      speed: 50,
      bounciness: 4,
    }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
      speed: 20,
      bounciness: 10,
    }).start();
  };
  return (
    <Pressable onPress={onPress} onPressIn={handlePressIn} onPressOut={handlePressOut}>
      <Animated.View style={[style, { transform: [{ scale }] }]}>
        {children}
      </Animated.View>
    </Pressable>
  );
}

function SupplierRow({ brand, inStock, onCamera, onLike, isLiked, onShare, genieGlow }) {
  return (
    <View style={sup.wrap}>
      <View style={sup.left}>
        <SellerName
          name={brand ?? 'Unknown'}
          isVerified
          size="sm"
          nameStyle={sup.brandName}
        />
        {inStock !== false && (
          <View style={sup.stockPill}>
            <View style={sup.dot} />
            <Text style={sup.stockTxt}>In Stock</Text>
          </View>
        )}
      </View>
      <View style={sup.actions}>
        <OnboardingGlow visible={genieGlow} borderRadius={28} style={genieGlow ? { padding: 5 } : undefined} bold>
          <BouncyIconButton style={sup.iconBtnGenie} onPress={onCamera}>
            <LinearGradient
              colors={['#67ACE9', '#0B6DC3']}
              locations={[0.32, 0.86]}
              style={sup.genieBtnGradient}
            >
              <GenieLampIcon size={22} />
            </LinearGradient>
          </BouncyIconButton>
        </OnboardingGlow>
        <BouncyIconButton style={sup.iconBtn} onPress={onLike}>
          <HeartIcon size={22} filled={isLiked} />
        </BouncyIconButton>
        <BouncyIconButton style={sup.iconBtn} onPress={onShare}>
          <ShareIcon />
        </BouncyIconButton>
      </View>
    </View>
  );
}

const sup = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: PAD_H,
    marginTop: space.xl,
    paddingBottom: space.xl,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    flex: 1,
  },
  brandName: {
    ...typeScale.headline,
    color: uiColors.primary,
  },
  stockPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: uiColors.successBg,
    borderRadius: radius.full,
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: uiColors.success,
  },
  dot: {
    width: 5,
    height: 5,
    borderRadius: 3,
    backgroundColor: uiColors.success,
  },
  stockTxt: {
    ...typeScale.micro,
    color: uiColors.success,
    textTransform: 'none',
    letterSpacing: 0,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  iconBtn: {
    width: touchTargets.min,
    height: touchTargets.min,
    borderRadius: touchTargets.min / 2,
    backgroundColor: uiColors.surface,
    borderWidth: 1,
    borderColor: uiColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnGenie: {
    width: touchTargets.min,
    height: touchTargets.min,
    borderRadius: touchTargets.min / 2,
    overflow: 'hidden',
  },
  genieBtnGradient: {
    width: '100%',
    height: '100%',
    borderRadius: touchTargets.min / 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
});

// ─── S5: VariantSelector ─────────────────────────────────────────────────────

function getVariantLabel(variants) {
  if (!variants || variants.length === 0) return null;
  const hasColor  = variants.some(v => v.color || v.swatchImage);
  const hasSize   = variants.some(v => /inch|cm|size|small|medium|large/i.test(v.label));
  const hasShape  = variants.some(v => /round|oval|square|rectangle/i.test(v.label));
  if (hasColor && hasSize) return 'Color & Size';
  if (hasColor) return 'Color';
  if (hasSize)  return 'Size';
  if (hasShape) return 'Shape';
  return 'Style';
}

function VariantSelector({ variants, selectedId, onSelect }) {
  if (!variants || variants.length === 0) return null;
  const label = getVariantLabel(variants);
  return (
    <View style={va.wrap}>
      <Text style={va.hint}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}
        contentContainerStyle={va.scroll}>
        {variants.map((v) => {
          const active = v.id === selectedId;
          return (
            <TouchableOpacity key={v.id}
              style={[va.tile, active ? va.tileOn : va.tileOff]}
              onPress={() => onSelect(v.id)}
              activeOpacity={0.8}>
              <View style={va.imgArea}>
                {v.swatchImage ? (
                  <CardImage
                    uri={v.swatchImage}
                    style={va.swatchImg}
                    resizeMode="contain"
                    placeholderColor={uiColors.surface}
                    compact
                  />
                ) : v.mainImage ? (
                  <CardImage
                    uri={v.mainImage}
                    style={va.swatchImg}
                    resizeMode="contain"
                    placeholderColor={uiColors.surface}
                    compact
                  />
                ) : v.color ? (
                  <View style={[va.colorBlock, { backgroundColor: v.color }]} />
                ) : null}
              </View>
              <View style={va.labelRow}>
                <Text style={[va.tileLabel, active && va.tileLabelOn]} numberOfLines={1} ellipsizeMode="tail">
                  {v.label}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const va = StyleSheet.create({
  wrap: {
    marginTop: space.xl,
  },
  hint: {
    ...typeScale.subheadline,
    color: uiColors.textPrimary,
    textTransform: 'none',
    letterSpacing: 0,
    fontWeight: '600',
    paddingHorizontal: PAD_H,
    marginBottom: space.md,
  },
  scroll: {
    paddingHorizontal: PAD_H,
    gap: space.md,
  },
  tile: {
    width: 120,
    borderRadius: radius.sm,
    backgroundColor: uiColors.bg,
    overflow: 'hidden',
    flexDirection: 'column',
  },
  tileOff: {
    borderWidth: 1,
    borderColor: uiColors.border,
  },
  tileOn: {
    borderWidth: 1,
    borderColor: uiColors.primary,
  },
  imgArea: {
    // Square so product swatches (Amazon serves 300×300) aren't aggressively
    // cropped when rendered inside the variant tile. Paired with
    // resizeMode="contain" the product sits within its own bounds —
    // clearer at a glance and no "exaggerated zoom" on legs/edges.
    width: '100%',
    aspectRatio: 1,
    backgroundColor: uiColors.bg,
    padding: 4,
  },
  swatchImg: {
    width: '100%',
    height: '100%',
  },
  colorBlock: {
    width: '100%',
    height: '100%',
    borderRadius: 4,
  },
  labelRow: {
    // Fixed height + single-line label with ellipsis so every variant
    // tile has the same overall dimensions regardless of label length
    // (e.g. "Brown/Walnut" vs "Transparent/Walnut" both collapse to
    // one line, and all tiles line up in a tidy row).
    height: 36,
    paddingHorizontal: 8,
    justifyContent: 'center',
    backgroundColor: uiColors.surface,
  },
  tileLabel: {
    ...typeScale.caption,
    color: uiColors.textSecondary,
    textAlign: 'center',
  },
  tileLabelOn: {
    fontWeight: '700',
    fontFamily: fonts.bodyBold,
    color: uiColors.textPrimary,
  },
});

// ─── S5b: SizeSelector ───────────────────────────────────────────────────────

function SizeSelector({ sizes }) {
  const [selectedIdx, setSelectedIdx] = useState(0);
  if (!sizes || sizes.length === 0) return null;
  return (
    <View style={sz.wrap}>
      <Text style={sz.label}>Size: <Text style={sz.labelBold}>{sizes[selectedIdx]?.label}</Text></Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sz.scroll}>
        {sizes.map((s, i) => {
          const active = i === selectedIdx;
          return (
            <TouchableOpacity
              key={s.id || i}
              style={[sz.tile, active && sz.tileActive]}
              onPress={() => setSelectedIdx(i)}
              activeOpacity={0.75}
            >
              <Text style={[sz.sizeLabel, active && sz.sizeLabelActive]}>{s.label}</Text>
              {s.price != null && (
                <Text style={[sz.sizePrice, active && sz.sizePriceActive]}>${s.price.toFixed(2)}</Text>
              )}
              {s.compareAt != null && s.compareAt !== s.price && (
                <Text style={sz.sizeCompare}>${s.compareAt.toFixed(2)}</Text>
              )}
              {s.inStock !== false && (
                <Text style={sz.sizeStock}>In Stock</Text>
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const sz = StyleSheet.create({
  wrap: {
    paddingHorizontal: PAD_H,
    marginTop: space.xl,
  },
  label: {
    ...typeScale.body,
    color: uiColors.textPrimary,
    marginBottom: space.sm,
  },
  labelBold: {
    fontWeight: '700',
    fontFamily: fonts.bodyBold,
  },
  scroll: {
    gap: space.sm,
  },
  tile: {
    borderWidth: 1,
    borderColor: uiColors.border,
    borderRadius: radius.md,
    paddingHorizontal: space.base,
    paddingVertical: space.sm,
    minWidth: 120,
  },
  tileActive: {
    borderColor: uiColors.primary,
  },
  sizeLabel: {
    ...typeScale.headline,
    color: uiColors.textPrimary,
  },
  sizeLabelActive: {
    color: uiColors.textPrimary,
  },
  sizePrice: {
    ...typeScale.body,
    color: uiColors.textPrimary,
    marginTop: 2,
  },
  sizePriceActive: {
    fontWeight: '600',
    fontFamily: fonts.bodySemiBold,
  },
  sizeCompare: {
    ...typeScale.caption,
    color: uiColors.textSecondary,
    textDecorationLine: 'line-through',
  },
  sizeStock: {
    ...typeScale.micro,
    color: uiColors.success,
    marginTop: 3,
    textTransform: 'none',
    letterSpacing: 0,
  },
});

// ─── S6: PriceBlock ──────────────────────────────────────────────────────────

function PriceBlock({ price, originalPrice }) {
  const hasDiscount = !!originalPrice;
  return (
    <View style={pr.wrap}>
      <Text style={pr.price}>{price}</Text>
      {hasDiscount && (
        <Text style={pr.original}>{originalPrice}</Text>
      )}
    </View>
  );
}

const pr = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingHorizontal: PAD_H,
    marginTop: space.xl,
  },
  price: {
    fontSize: typeScale.displayLg.fontSize,
    fontWeight: '700',
    fontFamily: fonts.bodyBold,
    color: uiColors.primary,
    letterSpacing: -0.5,
    lineHeight: 34,
  },
  original: {
    ...typeScale.body,
    color: uiColors.textSecondary,
    textDecorationLine: 'line-through',
  },
});

// ─── S7: QuantitySelector ────────────────────────────────────────────────────

function QuantitySelector({ qty, onDecrease, onIncrease }) {
  return (
    <View style={qs.wrap}>
      <View style={qs.pill}>
        <TouchableOpacity style={[qs.btn, qty <= 1 && qs.btnDim]}
          onPress={onDecrease} activeOpacity={0.7} disabled={qty <= 1}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={[qs.symbol, qty <= 1 && qs.symbolDim]}>−</Text>
        </TouchableOpacity>

        <View style={qs.divider} />
        <Text style={qs.count}>{qty}</Text>
        <View style={qs.divider} />

        <TouchableOpacity style={qs.btn} onPress={onIncrease} activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={qs.symbol}>+</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const qs = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PAD_H,
    marginTop: space.lg,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: uiColors.border,
    borderRadius: radius.full,
    backgroundColor: uiColors.surface,
    overflow: 'hidden',
  },
  btn: {
    width: 28,
    height: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnDim: {
    opacity: 0.32,
  },
  divider: {
    width: 1,
    height: 16,
    backgroundColor: uiColors.border,
  },
  symbol: {
    ...typeScale.body,
    color: uiColors.textPrimary,
  },
  symbolDim: {
    color: uiColors.textTertiary,
  },
  count: {
    ...typeScale.headline,
    color: uiColors.textPrimary,
    width: 36,
    textAlign: 'center',
  },
});

// ─── S8: DeliveryBox ─────────────────────────────────────────────────────────

function DeliveryBox({ date }) {
  return (
    <TouchableOpacity style={dv.box} activeOpacity={0.75}>
      <View style={dv.greenPill}>
        <Text style={dv.greenTxt}>Free Fast Delivery</Text>
      </View>
      <Text style={dv.date}>Get it by {date}</Text>
      <ChevRight size={14} color={uiColors.primary} />
    </TouchableOpacity>
  );
}

const dv = StyleSheet.create({
  box: {
    marginHorizontal: PAD_H,
    marginTop: space.xl,
    borderWidth: 1,
    borderColor: uiColors.primary,
    borderRadius: radius.button,
    paddingVertical: space.sm,
    paddingHorizontal: space.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: uiColors.surface,
  },
  greenPill: {
    backgroundColor: uiColors.successBg,
    borderRadius: radius.full,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  greenTxt: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: fonts.bodySemiBold,
    color: uiColors.success,
    lineHeight: 15,
  },
  date: {
    ...typeScale.body,
    color: uiColors.textPrimary,
    flex: 1,
  },
});

// ─── S9: ProductDetails ──────────────────────────────────────────────────────

function ProductDetails({ details }) {
  const [open, setOpen] = useState(false);
  const rotation = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    // Build 89: 200ms linear → 240ms easeInOut. Linear rotation reads robotic.
    Animated.timing(rotation, {
      toValue: open ? 0 : 1,
      duration: 240,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
    setOpen(o => !o);
  };

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const rows = details
    ? Object.entries(details)
    : [
        ['Brand',      'POLY & BARK'],
        ['Category',   'Furniture'],
        ['Material',   'Premium Linen'],
        ['Dimensions', '84" W × 36" D × 34" H'],
        ['Condition',  'Brand New'],
        ['Delivery',   '2–4 weeks'],
        ['Warranty',   '2-year limited'],
      ];

  return (
    <View style={pdt.wrap}>
      <TouchableOpacity style={pdt.header} onPress={toggle} activeOpacity={0.7}>
        <View style={pdt.headerLeft}>
          <View style={pdt.headerAccent} />
          <Text style={pdt.sLabel}>PRODUCT DETAILS</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <ChevRight size={16} color={uiColors.textSecondary} />
        </Animated.View>
      </TouchableOpacity>

      {open && (
        <View style={pdt.card}>
          {rows.map(([k, v], i) => (
            <View key={k} style={[pdt.row, i === rows.length - 1 && pdt.rowLast]}>
              <Text style={pdt.key}>{k}</Text>
              <Text style={pdt.val}>{v}</Text>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const pdt = StyleSheet.create({
  wrap: {
    paddingHorizontal: PAD_H,
    marginTop: SECTION_GAP,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  headerAccent: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: uiColors.primary,
  },
  sLabel: {
    ...typeScale.subheadline,
    color: uiColors.textSecondary,
  },
  card: {
    backgroundColor: uiColors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: uiColors.border,
    marginTop: space.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    height: 52,
    paddingHorizontal: PAD_H,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: DIVIDER_COLOR,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  key: {
    ...typeScale.body,
    color: uiColors.textSecondary,
  },
  val: {
    ...typeScale.body,
    fontWeight: '700',
    fontFamily: fonts.bodyBold,
    color: uiColors.textPrimary,
    textAlign: 'right',
    maxWidth: '58%',
  },
});

// ─── S10: KeyFeatures ────────────────────────────────────────────────────────

const DEF_FEATURES = [
  { label: 'Hardwood Frame',    sub: 'Built to last decades — solid, warp-resistant construction.',  Icon: ShieldIcon  },
  { label: 'High-Density Foam', sub: 'Conforms to your body for deep, restorative comfort.',          Icon: LayersIcon  },
  { label: 'Stain Resistant',   sub: 'Performance fabric repels spills — wipes clean in seconds.',   Icon: DropletIcon },
  { label: 'Tool-Free Setup',   sub: 'Snap-together design — fully assembled in under 20 minutes.',  Icon: WrenchIcon  },
];

function KeyFeatures({ features }) {
  const [open, setOpen] = useState(false);
  const rotation = useRef(new Animated.Value(0)).current;

  const toggle = () => {
    // Build 89: 200ms linear → 240ms easeInOut. Linear rotation reads robotic.
    Animated.timing(rotation, {
      toValue: open ? 0 : 1,
      duration: 240,
      easing: Easing.inOut(Easing.cubic),
      useNativeDriver: true,
    }).start();
    setOpen(o => !o);
  };

  const rotate = rotation.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '180deg'] });

  const items = features ?? DEF_FEATURES;
  return (
    <View style={kf.wrap}>
      <TouchableOpacity style={kf.headerRow} onPress={toggle} activeOpacity={0.7}>
        <View style={kf.headerLeft}>
          <View style={kf.headerAccent} />
          <Text style={kf.sLabel}>KEY FEATURES</Text>
        </View>
        <Animated.View style={{ transform: [{ rotate }] }}>
          <ChevRight size={16} color={uiColors.textSecondary} />
        </Animated.View>
      </TouchableOpacity>

      {open && (
        <View style={kf.panel}>
          {items.map((f, i) => (
            <View key={i}>
              <View style={kf.row}>
                <View style={kf.leftCol}>
                  <Text style={kf.num}>{String(i + 1).padStart(2, '0')}</Text>
                  <View style={kf.iconCircle}>
                    {f.Icon ? <f.Icon /> : null}
                  </View>
                </View>
                <View style={kf.rightCol}>
                  <Text style={kf.featureName}>{f.label}</Text>
                  {!!f.sub && <Text style={kf.featureSub}>{f.sub}</Text>}
                </View>
              </View>
              {i < items.length - 1 && <View style={kf.divider} />}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

const kf = StyleSheet.create({
  wrap: {
    paddingHorizontal: PAD_H,
    marginTop: SECTION_GAP,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: space.md,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  headerAccent: {
    width: 3,
    height: 14,
    borderRadius: 2,
    backgroundColor: uiColors.primary,
  },
  sLabel: {
    ...typeScale.subheadline,
    color: uiColors.textSecondary,
  },
  panel: {
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: uiColors.border,
    backgroundColor: uiColors.surface,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.base,
    paddingHorizontal: space.base,
    gap: space.md,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: DIVIDER_COLOR,
    marginHorizontal: space.base,
  },
  leftCol: {
    alignItems: 'center',
    gap: 6,
    width: 44,
  },
  num: {
    ...typeScale.micro,
    color: uiColors.primary,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: radius.sm,
    backgroundColor: FEAT_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rightCol: {
    flex: 1,
  },
  featureName: {
    ...typeScale.headline,
    color: uiColors.textPrimary,
  },
  featureSub: {
    ...typeScale.body,
    color: uiColors.textSecondary,
    marginTop: 3,
  },
});

// ─── Fixed: StickyHeader ─────────────────────────────────────────────────────

function StickyHeader({ title, onBack, onCart, opacity, topInset }) {
  return (
    <Animated.View style={[sth.bar, { opacity, paddingTop: topInset + 8 }]} pointerEvents="box-none">
      <View style={sth.inner}>
        <TouchableOpacity style={sth.btn} onPress={onBack}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={sth.title} numberOfLines={1}>{title}</Text>
        <TouchableOpacity style={sth.btn} onPress={onCart}>
          <CartIconNavy />
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

const sth = StyleSheet.create({
  bar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: uiColors.bg,
    borderBottomWidth: 0.5,
    borderBottomColor: uiColors.border,
    zIndex: 100,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: PAD_H,
    paddingBottom: space.md,
  },
  btn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typeScale.headline,
    color: uiColors.textPrimary,
    flex: 1,
    textAlign: 'center',
    marginHorizontal: space.xs,
  },
});

// ─── Fixed: CTABar ───────────────────────────────────────────────────────────

function CTABar({ inCart, onAddToCart, affiliateUrl, source, cartLabelOpacity, addedLabelOpacity, bottomInset, product }) {
  const [isPressed, setIsPressed] = useState(false);
  const btnScale = useRef(new Animated.Value(1)).current;

  const handleCart = () => {
    Animated.sequence([
      Animated.timing(btnScale, { toValue: 0.97, duration: 90, useNativeDriver: true }),
      Animated.spring(btnScale, { toValue: 1, useNativeDriver: true, damping: 12, stiffness: 300 }),
    ]).start();
    onAddToCart();
  };

  const pb = Math.max(bottomInset, 12);
  const btnFilled = isPressed || inCart;

  return (
    <View style={[cta.bar, { paddingBottom: pb }]}>

      {/* CTA button */}
      <Animated.View style={[cta.cartWrap, { transform: [{ scale: btnScale }] }]}>
        <TouchableOpacity
          style={[cta.cartBtn, btnFilled && cta.cartBtnFilled]}
          onPress={handleCart}
          onPressIn={() => setIsPressed(true)}
          onPressOut={() => setIsPressed(false)}
          activeOpacity={1}
          accessibilityLabel={inCart ? 'View cart' : 'Add to cart'}>
          <View style={cta.labelBox}>
            <Animated.Text style={[cta.label, { opacity: cartLabelOpacity, color: btnFilled ? '#FFFFFF' : uiColors.primary }]}>
              {inCart ? 'View Cart' : 'Add to Cart'}
            </Animated.Text>
            <Animated.Text style={[cta.label, { opacity: addedLabelOpacity, color: btnFilled ? '#FFFFFF' : uiColors.primary }]}>
              Added!
            </Animated.Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
}

const cta = StyleSheet.create({
  bar: {
    position: 'absolute',
    bottom: 0, left: 0, right: 0,
    backgroundColor: uiColors.bg,
    paddingHorizontal: PAD_H,
    paddingTop: space.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 12,
  },
  cartWrap: {
    flex: 1,
  },
  cartBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: uiColors.bg,
    borderRadius: radius.full,
    borderWidth: 1.5,
    borderColor: uiColors.primary,
    height: layout.buttonHeight,
  },
  cartBtnFilled: {
    backgroundColor: uiColors.primary,
  },
  labelBox: {
    width: 140,
    height: 22,
    position: 'relative',
  },
  label: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    ...typeScale.button,
    fontSize: 16,
    fontWeight: '700',
    fontFamily: fonts.bodyBold,
    lineHeight: 22,
    textAlign: 'center',
    letterSpacing: 0.1,
  },
});

// ─── ProductDetailScreen (main) ───────────────────────────────────────────────

export default function ProductDetailScreen({ route, navigation }) {
  const product = route?.params?.product;
  const insets  = useSafeAreaInsets();
  const { addToCart, items } = useCart();
  const { likedProducts, toggleLikedProduct } = useLiked();
  const { isStepActive, nextStep, prevStep, finishOnboarding } = useOnboarding();

  // ── Local state ──────────────────────────────────────────────────────────
  const [qty,         setQty]        = useState(1);
  const [selectedVar, setSelectedVar]= useState(product?.variants?.[0]?.id ?? '1');

  const scrollY           = useRef(new Animated.Value(0)).current;
  const cartLabelOpacity  = useRef(new Animated.Value(1)).current;
  const addedLabelOpacity = useRef(new Animated.Value(0)).current;
  const mainScrollRef     = useRef(null);
  const supplierRowY      = useRef(0);

  // Auto-scroll to genie lamp section during onboarding
  useEffect(() => {
    if (isStepActive('genie_lamp') && mainScrollRef.current) {
      const timer = setTimeout(() => {
        mainScrollRef.current.scrollTo({ y: supplierRowY.current + 100, animated: true });
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [isStepActive('genie_lamp')]);

  // ── Product data (from route, with fallbacks) ─────────────────────────────
  const name         = product?.name         ?? 'Vento Sofa, Italian Leather';
  const brand        = product?.brand        ?? 'POLY & BARK';
  const imageUrl     = product?.imageUrl     ?? null;
  const images       = product?.images?.length ? product.images
                     : product?.gallery?.length ? product.gallery
                     : [];
  const affiliateUrl = product?.affiliateUrl ?? null;
  const source       = product?.source       ?? 'amazon';
  const description  = product?.description  ??
    'Crafted for modern interiors with premium materials and timeless design. ' +
    'Built to last decades with a commitment to quality and sustainability.';
  const inStock      = product?.inStock      ?? true;
  const rating       = product?.rating       ?? 4.0;
  const reviewCount  = product?.reviewCount  ?? 0;

  // Pricing
  const rawPrice     = product?.priceValue ?? product?.salePrice
    ?? (typeof product?.price === 'number' ? product.price : parseFloat(String(product?.price).replace(/[^0-9.]/g, '')) || 0);
  const compareAt    = product?.compareAtPrice ?? product?.listPrice ?? null;

  // Product details table
  const details = product?.details ?? {
    Brand:      brand,
    Category:   product?.category
      ? product.category.charAt(0).toUpperCase() + product.category.slice(1)
      : 'Furniture',
    Material:   product?.materials?.[0]
      ? product.materials[0].charAt(0).toUpperCase() + product.materials[0].slice(1)
      : 'Premium Materials',
    Dimensions: product?.dimensions  ?? '84" W × 36" D × 34" H',
    Condition:  product?.condition   ?? 'Brand New',
    Delivery:   product?.delivery    ?? '2–4 weeks',
    Warranty:   product?.warranty    ?? '2-year limited',
    ...(product?.source === 'amazon' ? { 'Also on': 'Amazon' } : {}),
  };

  // Variants
  const variants = product?.variants ?? [];
  const sizes = product?.sizes ?? null;

  // Build key features from product.features
  const productFeatures = product?.features
    ? product.features.slice(0, 4).map((f, i) => {
        const icons = [ShieldIcon, LayersIcon, DropletIcon, WrenchIcon];
        const parts = f.split(' — ');
        return {
          label: parts.length > 1 ? parts[0] : f,
          sub: parts.length > 1 ? parts[1] : null,
          Icon: icons[i % icons.length],
        };
      })
    : null;

  // Active variant — drives hero image swap, price, affiliate URL
  const activeVariant = variants.find(v => v.id === selectedVar);
  const rawActiveImages = activeVariant?.images?.length > 0
    ? activeVariant.images
    : activeVariant?.mainImage
      ? [activeVariant.mainImage, ...images.slice(1)]
      : images;
  const activeImages = rawActiveImages.filter((url, idx, arr) => arr.indexOf(url) === idx);

  // Variant-aware price
  const variantPrice = activeVariant?.price ?? null;
  const displayPrice = variantPrice ?? rawPrice;
  const activeAffiliateUrl = activeVariant?.affiliateUrl ?? affiliateUrl;
  const activeAsin = activeVariant?.asin ?? product?.asin ?? null;
  const activeImageUrl = activeVariant?.mainImage ?? imageUrl;

  // Pricing display
  const priceDisplay = fmtPrice(displayPrice);
  const origDisplay  = (compareAt && compareAt !== displayPrice) ? fmtPrice(compareAt) : null;

  const estDelivery = product?.shipping?.estimatedDays
    ? deliveryDate(parseInt(product.shipping.estimatedDays))
    : deliveryDate(4);

  // All product hero images display in full (resizeMode: 'contain') — Amazon
  // photos are studio shots on white backgrounds, so contain + white background
  // looks editorial and never crops the product. Previously we used 'cover'
  // for furniture which cut off arms/ends of sofas and cropped into the photo.
  const heroResizeMode = 'contain';

  // ── Cart logic ────────────────────────────────────────────────────────────
  const cartKey = `${name}__${brand}`;
  const inCart  = items.some(i => i.key === cartKey);

  const handleAddToCart = () => {
    if (inCart) {
      navigation.navigate('Main', { screen: 'Cart' });
      return;
    }
    addToCart({
      name: activeVariant ? `${name} — ${activeVariant.label}` : name,
      brand,
      price: displayPrice,
      imageUrl: activeImageUrl,
      affiliateUrl: activeAffiliateUrl,
      source: product?.source ?? 'amazon',
      asin: activeAsin,
    });
    // Build 89: 150ms crossfades were sub-perceptible — confirmation read
    // as a glitch, not a state change. Bumped to 220ms with Easing.inOut.
    Animated.parallel([
      Animated.timing(cartLabelOpacity,  { toValue: 0, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      Animated.timing(addedLabelOpacity, { toValue: 1, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      setTimeout(() => {
        Animated.parallel([
          Animated.timing(cartLabelOpacity,  { toValue: 1, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(addedLabelOpacity, { toValue: 0, duration: 220, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        ]).start();
      }, 1500);
    });
  };

  // ── Sticky header opacity ─────────────────────────────────────────────────
  const heroTotalH = insets.top + space.sm + 42 + space.sm + IMAGE_H + space.md + 12; // topInset + backBtn + image + progressBar
  const stickyOpacity = scrollY.interpolate({
    inputRange:  [heroTotalH - 20, heroTotalH + 20],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });

  // ── Bottom spacer ─────────────────────────────────────────────────────────
  const ctaH = (affiliateUrl ? 48 : 0) + 56 + 12 + Math.max(insets.bottom, 12) + 16;

  return (
    <View style={rs.root}>

      {/* ── Scrollable content ─────────────────────────────────────────── */}
      <Animated.ScrollView
        ref={mainScrollRef}
        showsVerticalScrollIndicator={false}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true }
        )}
        scrollEventThrottle={16}>

        {/* S0: Hero image gallery — pass activeImageUrl (variant-aware hero)
            NOT static imageUrl, so tapping a variant swatch swaps slide 0
            immediately instead of the variant's photo ending up at slide 2. */}
        <ProductHero
          images={activeImages}
          imageUrl={activeImageUrl}
          onBack={() => navigation?.goBack()}
          topInset={insets.top}
          heroResizeMode={heroResizeMode}
        />

        {/* White content card (overlaps hero) */}
        <View style={rs.card}>

          {/* S1: Product Title */}
          <ProductTitle name={name} />

          {/* S2: Description */}
          <ProductDescription text={description} />

          {/* S3: Reviews */}
          <ReviewsRow rating={rating} reviewCount={reviewCount} />

          {/* ── divider ── */}
          <View style={{ marginTop: space.xl }} />
          <Divider />

          {/* S4: Supplier Row */}
          <View onLayout={(e) => { supplierRowY.current = e.nativeEvent.layout.y; }}>
          <SupplierRow
            brand={brand}
            inStock={inStock}
            onCamera={() => navigation.navigate('Main', { screen: 'Wish', params: { product } })}
            isLiked={!!likedProducts[product?.id]}
            onLike={() => toggleLikedProduct(product)}
            genieGlow={isStepActive('genie_lamp')}
            onShare={async () => {
              try {
                await Share.share({
                  message: `Check out ${name} on HomeGenie!${activeAffiliateUrl ? '\n' + activeAffiliateUrl : ''}`,
                });
              } catch (_) {}
            }}
          />

          {/* Onboarding Step 4: genie lamp tooltip */}
          {isStepActive('genie_lamp') && (
            <OnboardingOverlay
              visible
              step={ONBOARDING_STEPS.GENIE_LAMP}
              onNext={finishOnboarding}
              onBack={() => {
                prevStep();
                navigation.goBack(); // back to Explore, then Wish
                setTimeout(() => navigation.navigate('Main', { screen: 'Wish' }), 300);
              }}
              onSkip={finishOnboarding}
              tooltipPosition="below"
              style={{ position: 'relative', marginHorizontal: 16, marginTop: -4, marginBottom: 8 }}
            />
          )}
          </View>

          {/* ── divider ── */}
          <Divider />

          {/* S5: Variant swatches */}
          <VariantSelector
            variants={variants}
            selectedId={selectedVar}
            onSelect={setSelectedVar}
          />

          {/* S5b: Size selector */}
          {sizes && sizes.length > 0 && (
            <SizeSelector sizes={sizes} />
          )}

          {/* S6: Price */}
          <PriceBlock
            price={priceDisplay}
            originalPrice={origDisplay}
          />

          {/* S7: Quantity selector */}
          <QuantitySelector
            qty={qty}
            onDecrease={() => setQty(q => Math.max(1, q - 1))}
            onIncrease={() => setQty(q => q + 1)}
          />

          {/* ── divider ── */}
          <View style={{ marginTop: space.lg }} />
          <Divider />

          {/* S8: Delivery box */}
          <DeliveryBox date={estDelivery} />

          {/* S9: Product Details table */}
          <ProductDetails details={details} />

          {/* S10: Key Features */}
          <KeyFeatures features={productFeatures} />

          {/* Spacer to clear the fixed CTA bar */}
          <View style={{ height: ctaH }} />

        </View>
      </Animated.ScrollView>

      {/* ── Sticky header ───────────────────────────────────────────────── */}
      <StickyHeader
        title={name}
        onBack={() => navigation?.goBack()}
        onCart={() => navigation.navigate('Main', { screen: 'Cart' })}
        opacity={stickyOpacity}
        topInset={insets.top}
      />

      {/* ── Fixed CTA bar ────────────────────────────────────────────────── */}
      <CTABar
        inCart={inCart}
        onAddToCart={handleAddToCart}
        affiliateUrl={activeAffiliateUrl}
        source={source}
        cartLabelOpacity={cartLabelOpacity}
        addedLabelOpacity={addedLabelOpacity}
        bottomInset={insets.bottom}
        product={product}
      />

    </View>
  );
}

// ─── Root styles ──────────────────────────────────────────────────────────────

const rs = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: uiColors.bg,
  },
  card: {
    marginTop: -CARD_LIFT,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    backgroundColor: uiColors.bg,
    minHeight: SH,
  },
});
