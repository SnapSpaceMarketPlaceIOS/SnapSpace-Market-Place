// Build 145 v3 cleanup: trimmed RN imports to actual usage.
// Removed: Animated, Platform, UIManager (animations were ripped out
// when the hero slideshow + progress bar were removed).
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  Share,
  Image,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Line, Path, Circle } from 'react-native-svg';
import { colors } from '../constants/colors';
import { colors as C } from '../constants/theme';
import { space, radius, fontWeight, fontSize, typeScale, layout } from '../constants/tokens';
import { useSubscription, PAID_TIERS, WISH_PACKAGES } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import { getReferralCode, grantShareBonus } from '../services/subscriptionService';
import { hapticSuccess, hapticError } from '../utils/haptics';
import AnimatedTile from '../components/paywall/AnimatedTile';
import PurchaseCelebrationOverlay from '../components/paywall/PurchaseCelebrationOverlay';

// Build 145 v5: hero image bundled via Metro's asset registry (numeric
// handle, 4 bytes across the bridge). Module-level const so React doesn't
// allocate a new source object on every render — that was forcing RCTImageView
// to re-trip the loader. Pre-mounted in HomeScreen too (warms the UIImage
// cache before user ever navigates here), so paywall mount paints instantly.
const HERO_SOURCE = require('../../assets/paywall-hero.jpg');

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// Build 145: hero slideshow removed — paywall is now a clean white-card design.

// ── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon() {
  // Build 145: dark X on white background
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.textPrimary} strokeWidth={2.4} strokeLinecap="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

// Build 145 v3 cleanup: CheckIcon + ShareIcon removed (dead code from prior
// design — feature bullets are now empty circles; share button has no arrow).

// Build 145 v5.27: precise SVG infinity icon for the UNLIMITED tier card.
// Replaces the text "∞" character which had inconsistent baseline / weight
// against neighboring "Wishes" label. SVG gives pixel-precise sizing +
// vertical-center alignment matching the digit-based "25" on the PRO card.
function InfinityIcon({ color = C.textPrimary, size = 52 }) {
  // Lucide-style stroke infinity — pixel-precise, weight-matched to semibold
  // digits on the PRO card. Sized + positioned to baseline-align with "Wishes".
  return (
    <Svg
      width={size * 1.1}
      height={size * 0.55}
      viewBox="0 0 24 12"
      fill="none"
      stroke={color}
      strokeWidth={2.4}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <Path d="M12 6c-2-2.67-4-4-6-4a4 4 0 1 0 0 8c2 0 4-1.33 6-4Zm0 0c2 2.67 4 4 6 4a4 4 0 0 0 0-8c-2 0-4 1.33-6 4" />
    </Svg>
  );
}

// ── Feature lists per selection (Build 145 v3 polish) ──────────────────────
// Each tier and each wish pack has its own set of value props so the user
// feels the specific upside of what they're about to buy. The first bullet
// always echoes the selection ("25 wishes per week", "10 wishes for $2.49")
// so the user sees their choice reinforced in the feature list.

// Build 145 v5.29: copy expanded 4 → 6 bullets per option to give each
// purchase decision more surface area for psychological selling. Bullets
// are ordered to match the FEATURE_ICONS rotation:
//   0 lamp     — usage / wishes available
//   1 share    — social proof / inspire others
//   2 cart     — shop products from designs
//   3 sparkle  — style variety / premium polish
//   4 clock    — speed / time-value / no-expiry
//   5 shield   — trust / risk-free / pay-once
// Levers applied: specificity (concrete numbers), loss aversion (cancel /
// never expire), social proof (followers / community), status (creator
// identity), anchoring (per-day, per-design pricing), permanence,
// priority/exclusivity for UNLIMITED.
const FEATURES_BY_TIER = {
  basic: [
    'Generate *25 stunning room designs* every week',
    'Save & *share designs* to inspire your followers',
    'Tap any product in your design to *shop it instantly*',
    'Unlock *every style* — from Japandi to Dark Luxe',
    '*45-second AI renders* — faster than ordering coffee',
    '*Cancel anytime* — keep every design you’ve made',
  ],
  premium: [
    '*Unlimited wishes* — design without limits, all week',
    'Save & share designs to grow your *personal style*',
    'Tap any product in your design to *shop it instantly*',
    '*First access* to every new AI style we ship',
    '*Priority generation queue* — your designs render first',
    '*Cancel anytime* — your library stays yours forever',
  ],
};

// Wish packs share 5 bullets (positions 1–5); position 0 carries the
// pack-specific hook with size + value framing.
const FEATURES_BY_WISH_PACKAGE = {
  homegenie_wishes_4: [
    '*4 fresh redesigns* to transform any space',
    'Save & *share* every design you create',
    'Every product is *one tap to shop*',
    'Mix every style and every room — *no limits*',
    '*Wishes never expire* — use them whenever inspiration hits',
    '*Pay once* — no subscription, no surprise charges',
  ],
  homegenie_wishes_10: [
    '*10 redesigns* — just *$0.25 per stunning room*',
    'Save & *share* every design you create',
    'Every product is *one tap to shop*',
    'Mix every style and every room — *no limits*',
    '*Wishes never expire* — use them whenever inspiration hits',
    '*Pay once* — no subscription, no surprise charges',
  ],
  homegenie_wishes_20: [
    '*20 redesigns* — best value for casual designers',
    'Save & *share* every design you create',
    'Every product is *one tap to shop*',
    'Mix every style and every room — *no limits*',
    '*Wishes never expire* — use them whenever inspiration hits',
    '*Pay once* — no subscription, no surprise charges',
  ],
  homegenie_wishes_40: [
    '*40 redesigns* — perfect for a full-home refresh',
    'Save & *share* every design you create',
    'Every product is *one tap to shop*',
    'Mix every style and every room — *no limits*',
    '*Wishes never expire* — use them whenever inspiration hits',
    '*Pay once* — no subscription, no surprise charges',
  ],
  homegenie_wishes_100: [
    '*100 redesigns* — power-user volume at *$0.25 each*',
    'Save & *share* every design you create',
    'Every product is *one tap to shop*',
    'Mix every style and every room — *no limits*',
    '*Wishes never expire* — use them whenever inspiration hits',
    '*Pay once* — no subscription, no surprise charges',
  ],
  homegenie_wishes_200: [
    '*200 redesigns* — go all-in on your dream home',
    'Save & *share* every design you create',
    'Every product is *one tap to shop*',
    'Mix every style and every room — *no limits*',
    '*Wishes never expire* — use them whenever inspiration hits',
    '*Pay once* — no subscription, no surprise charges',
  ],
};

// Fallback so the feature list never renders empty (6 bullets to match
// the new icon rotation).
const FEATURES_FALLBACK = [
  'Generate *stunning AI room designs* in seconds',
  'Save & *share* every design you create',
  'Every product is *one tap to shop*',
  'Try *every style* and every room',
  '*45-second renders* — faster than ordering coffee',
  '*Risk-free* — cancel or use anytime',
];

// Build 145 v5.31: parse `*highlight*` markers in feature bullet copy.
// Wrapping a phrase in single asterisks (e.g., '*Cancel anytime* — ...')
// causes that span to render bold + blueLight inside the otherwise grey
// featureText. Splitting on '*' yields [plain, highlight, plain, ...]
// because asterisks come in pairs — odd-indexed segments are the highlight
// spans, even-indexed are plain text. Returned array is inlined into a
// parent <Text> via nested <Text> children, which RN renders as a
// single flowing line with mixed styles.
function renderFeatureText(feature) {
  const parts = feature.split('*');
  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <Text key={idx} style={styles.featureTextHighlight}>{part}</Text>
    ) : (
      part
    )
  );
}

// ── Wish card order (cheapest first, most expensive at bottom) ──────────────
const WISH_CARD_ORDER = [
  'homegenie_wishes_4',
  'homegenie_wishes_10',
  'homegenie_wishes_20',
  'homegenie_wishes_40',
  'homegenie_wishes_100',
  'homegenie_wishes_200',
];

// ── Subscribe card order (cheapest first) ───────────────────────────────────
// Build 145: paywall offers only two tiers — PRO (25/wk) and UNLIMITED (∞/wk).
// The middle 50-wishes-per-week tier (TIERS.pro) is excluded; existing
// subscribers on that legacy product remain grandfathered in StoreKit.
const TIER_CARD_ORDER = ['basic', 'premium'];

// ── Card dimensions ─────────────────────────────────────────────────────────
// Tier cards (Subscribe tab) use a 2-column grid since there are exactly
// two tiers (PRO + UNLIMITED) and each gets a fuller, more prominent card.
// Wish cards (Wishes tab) use a 3-up horizontal carousel — fits 3 cards
// in the visible viewport, with horizontal scroll revealing the rest of
// the 6-pack lineup. Narrower cards = better browsing, more "shelf" feel.
const CARD_GAP = 12;
const CARD_W = (SCREEN_W - layout.screenPaddingH * 2 - CARD_GAP) / 2;
const WISH_CARD_W = (SCREEN_W - layout.screenPaddingH * 2 - CARD_GAP * 2) / 3;

// ── Wish Package Card ───────────────────────────────────────────────────────

function WishCard({ pkg, selected, onSelect, isPurchasing, registerRef }) {
  // Build 145 v5.47: parity polish with TierCard — badge + per-wish anchor +
  // trust line + shake animation.
  // Build 145 v5.50: badge moved from 40-pack → 4-pack and relabeled
  // "BEST DEAL" per user. The 4-pack is now the recommended entry point
  // (lowest commitment, easiest first-purchase decision) and "BEST DEAL"
  // is honest framing for a $0.99 trial-style price point.
  const isPopular = pkg.id === 'homegenie_wishes_4';

  // Per-wish unit price — derived live from pkg.priceNum / pkg.wishes.
  // Two decimals, no trailing zeros, $-prefixed.
  const perWish = (pkg.priceNum / pkg.wishes).toFixed(2);

  // Shake animation (same pattern as TierCard for visual consistency).
  const shakeX = useRef(new Animated.Value(0)).current;
  const runShake = React.useCallback(() => {
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: -4, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 4,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -3, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 3,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0,  duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shakeX]);

  useEffect(() => {
    if (!isPopular) return;
    const t = setTimeout(runShake, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!isPopular) return;
    if (!selected) return;
    runShake();
  }, [selected, isPopular, runShake]);

  return (
    <AnimatedTile
      selected={selected}
      isPurchasing={isPurchasing}
      onSelect={() => onSelect(pkg.id)}
      registerRef={registerRef}
      cardWidth={WISH_CARD_W}
      style={[styles.gridCard, styles.gridCardWish]}
      selectedStyle={styles.gridCardSelected}
    >
      {/* BEST DEAL badge — sits on the top edge of the 4-pack only. Same
          behavior + animation as the TierCard's MOST POPULAR badge. */}
      {isPopular && (
        <View style={styles.popularBadge}>
          <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
            <View style={[styles.popularBadgePill, !selected && styles.popularBadgePillUnselected]}>
              <Text style={styles.popularBadgeText}>BEST DEAL</Text>
              <Svg width={9} height={9} viewBox="0 0 24 24" fill={C.white} style={styles.popularBadgeStar}>
                <Path d="M12 1 L14 10 L23 12 L14 14 L12 23 L10 14 L1 12 L10 10 Z" />
              </Svg>
            </View>
          </Animated.View>
        </View>
      )}
      {/* Build 145 v5.57: wish-card count row stacks vertically (column)
          with both number and "Wishes" label horizontally centered, so
          the 3-up cards have a tight, symmetric header instead of a
          side-by-side row that drifts off-center on three-digit values. */}
      <View style={[styles.cardCountRow, styles.cardCountRowWish]}>
        <Text
          style={[
            styles.cardBigNumber,
            styles.cardBigNumberWish,
            selected && styles.cardBigNumberSelected,
          ]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.55}
        >
          {pkg.wishes}
        </Text>
        <Text style={[
          styles.cardWishesLabel,
          styles.cardWishesLabelWish,
          styles.cardWishesLabelWishStacked,
          selected && styles.cardWishesLabelSelected,
        ]}>
          Wishes
        </Text>
      </View>
      <View style={[
        styles.cardPriceDivider,
        styles.cardPriceDividerWish,
        selected && styles.cardPriceDividerSelected,
      ]} />
      <View style={styles.cardPriceRow}>
        <Text
          style={[styles.cardPrice, styles.cardPriceWish, selected && styles.cardPriceSelected]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {pkg.price}
        </Text>
      </View>
      {/* Unit-economics anchor — parallels the per-day price on TierCards. */}
      <Text style={[styles.cardPerDay, styles.cardPerDayWish, selected && styles.cardPerDaySelected]}>
        ${perWish}/wish
      </Text>
      {/* Trust microcopy — "Pay once" is the Wishes-side equivalent of
          "Cancel anytime" on TierCards. */}
      <Text style={[styles.cardTrustLine, styles.cardTrustLineWish]}>Pay once</Text>
    </AnimatedTile>
  );
}

// ── Tier Card (Subscribe view) ──────────────────────────────────────────────

function TierCard({ tier, selected, onSelect, isPurchasing, registerRef }) {
  // Build 145 v5.38: subtle shake animation on the MOST POPULAR badge.
  // Fires (a) on first mount so the user notices the badge when the
  // paywall opens, and (b) every time the PRO tier becomes selected
  // (each tap on this card) — a small "kick" that draws attention back
  // to the social-proof cue. Only runs on the basic/PRO card since
  // that's the only card with the badge.
  const shakeX = useRef(new Animated.Value(0)).current;
  const runShake = React.useCallback(() => {
    shakeX.setValue(0);
    Animated.sequence([
      Animated.timing(shakeX, { toValue: -4, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 4,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: -3, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 3,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeX, { toValue: 0,  duration: 60, useNativeDriver: true }),
    ]).start();
  }, [shakeX]);

  // First-mount shake (paywall open) — delay 350ms so the card finishes
  // its slide-in / fade before the badge wiggles.
  useEffect(() => {
    if (tier.id !== 'basic') return;
    const t = setTimeout(runShake, 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Re-shake every time the PRO card becomes selected.
  useEffect(() => {
    if (tier.id !== 'basic') return;
    if (!selected) return;
    runShake();
  }, [selected, tier.id, runShake]);

  return (
    <AnimatedTile
      selected={selected}
      isPurchasing={isPurchasing}
      onSelect={() => onSelect(tier.id)}
      registerRef={registerRef}
      cardWidth={CARD_W}
      style={styles.gridCard}
      selectedStyle={styles.gridCardSelected}
    >
      {/* Build 145: TierCard layout per mock \u2014 "HomeGenie Designs \u2500\u2500\u2500 PRO"
          header with thin connector dash, big blue number when selected,
          thin divider, price (no lamp icon on tier cards per mock). */}
      {/* Build 145 v5.19: conversion-optimized \u2014 "MOST POPULAR" badge on the
          recommended (basic/PRO) tier, per-day pricing math under price, and
          a trust-line microcopy reducing commitment fear. */}
      {tier.id === 'basic' && (
        <View style={styles.popularBadge}>
          {/* Build 145 v5.38: Animated.View wrapper around the pill so the
              shakeX value (running translation, ~290ms total) drives a
              subtle attention-grabbing wiggle on first sight and on every
              re-selection of the PRO card. */}
          <Animated.View style={{ transform: [{ translateX: shakeX }] }}>
            {/* Build 145 v5.33: badge pill background reacts to selection.
                Selected → bluePrimary (deep navy, draws the eye to the
                actively-chosen tier). Not selected → blueLight (baby blue,
                softer presence so it doesn't compete with whichever tier
                the user has currently selected). */}
            <View style={[styles.popularBadgePill, !selected && styles.popularBadgePillUnselected]}>
              <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
              <Svg width={9} height={9} viewBox="0 0 24 24" fill={C.white} style={styles.popularBadgeStar}>
                <Path d="M12 1 L14 10 L23 12 L14 14 L12 23 L10 14 L1 12 L10 10 Z" />
              </Svg>
            </View>
          </Animated.View>
        </View>
      )}
      <View style={styles.cardCountRow}>
        {tier.gens === -1 ? (
          <View style={styles.cardInfinityWrap}>
            <InfinityIcon
              color={selected ? colors.blueLight : C.textPrimary}
              size={72}
            />
          </View>
        ) : (
          <Text style={[styles.cardBigNumber, selected && styles.cardBigNumberSelected]}>
            {tier.gens}
          </Text>
        )}
        <Text style={[styles.cardWishesLabel, selected && styles.cardWishesLabelSelected]}>
          Wishes
        </Text>
      </View>
      <View style={[styles.cardPriceDivider, selected && styles.cardPriceDividerSelected]} />
      {/* Build 145 v5.36: price hierarchy swap. Per-day price is the BIG
          headline (psychologically lighter — $0.71/day reads cheaper than
          $4.99/wk), and the weekly price becomes the smaller supporting
          line below it. This anchors the user on the lowest-friction
          number while still showing the actual billing cadence. */}
      <View style={styles.cardPriceRow}>
        <Text style={[styles.cardPrice, selected && styles.cardPriceSelected]}>
          {tier.id === 'basic' ? '$0.71/day' : tier.id === 'premium' ? '$2.85/day' : ''}
        </Text>
      </View>
      <Text style={[styles.cardPerDay, selected && styles.cardPerDaySelected]}>
        {tier.priceLabel}
      </Text>
      {/* Trust microcopy — reduces commitment fear */}
      <Text style={styles.cardTrustLine}>Cancel anytime</Text>
    </AnimatedTile>
  );
}

// Small white genie lamp — displayed next to "Wishes" on each card
const GENIE_LAMP_D = 'M326.155 194.661C306.203 193.551 286.596 223.576 265.287 232.582C259.954 218.661 247.863 208.794 233.603 206.723C231.53 206.386 230.008 204.515 230.02 202.32V201.347C230.044 200.249 230.428 199.189 231.123 198.353C233.699 195.023 234.837 190.732 234.262 186.491C233.675 182.25 231.945 180 228 180C223.945 180 221.632 183.609 221.596 188.674C221.56 192.191 222.71 195.622 224.819 198.353C225.49 199.201 225.862 200.262 225.886 201.347V202.32C225.934 204.441 224.52 206.287 222.53 206.723C206.748 209.006 193.77 220.794 189.432 236.748C178 232.457 167.143 226.669 157.138 219.497C130.008 200.91 117.852 197.824 106.271 197.234C106.271 197.234 104.761 197.234 101.739 199.004L97.5928 201.372V201.385C96.2007 201.953 95.6735 205.674 96.2008 206.672C96.7161 207.67 99.1384 208.944 100.229 209.031C114.118 209.518 127.527 211.489 138.924 219.771C164.952 237.721 180.062 295.913 228.116 295.913C275.031 295.913 295.993 209.304 326.155 209.304C346.886 209.304 342.714 254.499 330.898 264.778C319.082 275.069 307.291 264.503 296.637 264.503C283.719 264.503 284.33 277.476 291.281 278.287C292.862 278.524 294.468 278.05 295.69 276.99C296.925 275.93 297.668 274.37 297.74 272.711C304.33 277.464 312.024 280.283 320.029 280.845C338.699 280.845 354 250.642 354 228.464C353.964 218.248 349.175 195.896 326.155 194.661ZM262.64 247.836C251.579 251.878 239.943 253.936 228.21 253.923C216.502 253.923 204.878 251.877 193.818 247.873C190.93 246.888 189.324 243.67 190.235 240.639C202.326 245.591 215.196 248.123 228.186 248.11C241.176 248.098 254.058 245.566 266.161 240.639C266.593 242.111 266.449 243.682 265.754 245.042C265.059 246.389 263.885 247.399 262.471 247.836H262.64ZM272.322 318.425V318.961C258.158 324.387 243.154 327.106 228.054 326.994C212.955 327.144 197.964 324.462 183.774 319.061V318.524C184.302 316.204 185.704 314.196 187.669 312.973C189.634 311.751 191.995 311.414 194.212 312.038C201.378 314.532 209.275 312.088 213.972 305.925C215.099 304.341 215.974 302.582 216.561 300.711C220.3 301.522 224.098 301.921 227.921 301.921C231.732 301.909 235.519 301.397 239.198 300.374C240.552 305.152 243.763 309.119 248.053 311.339C252.343 313.547 257.316 313.809 261.798 312.038C264.003 311.414 266.364 311.763 268.317 312.986C270.282 314.208 271.673 316.204 272.2 318.524L272.322 318.425Z';
function SmallGenieLamp({ color = colors.bluePrimary, size = 14 }) {
  // Build 145: accepts color + size props so the lamp can render inline
  // in tier card prices AND inside feature-bullet circles.
  return (
    <Svg width={size} height={size} viewBox="92 176 266 155" fill="none">
      <Path d={GENIE_LAMP_D} fill={color} />
    </Svg>
  );
}

// ── Build 145 v5.14: feature bullet icons (lamp / share / cart / sparkle) ─
function FeatureLampIcon({ color, size = 12 }) {
  return <SmallGenieLamp color={color} size={size} />;
}

function FeatureShareIcon({ color, size = 12 }) {
  // Build 145 v5.15: brand share icon ported from HomeScreen.js (line 586).
  // Smile-arc + up-arrow stack — matches the rest of the app's share UX.
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30" fill="none">
      <Path
        d="M6.54815 18.5147C7.04668 20.3752 8.1452 22.0193 9.67334 23.1918C11.2015 24.3644 13.0738 25 15 25C16.9262 25 18.7985 24.3644 20.3267 23.1918C21.8548 22.0193 22.9533 20.3752 23.4519 18.5147"
        stroke={color} strokeWidth={1.6} strokeLinecap="round"
      />
      <Path
        d="M15 5L14.6877 4.60957L15 4.35969L15.3123 4.60957L15 5ZM15.5 16.25C15.5 16.5261 15.2761 16.75 15 16.75C14.7239 16.75 14.5 16.5261 14.5 16.25L15 16.25L15.5 16.25ZM8.75 10L8.43765 9.60957L14.6877 4.60957L15 5L15.3123 5.39043L9.06235 10.3904L8.75 10ZM15 5L15.3123 4.60957L21.5623 9.60957L21.25 10L20.9377 10.3904L14.6877 5.39043L15 5ZM15 5L15.5 5L15.5 16.25L15 16.25L14.5 16.25L14.5 5L15 5Z"
        fill={color}
      />
    </Svg>
  );
}

function FeatureCartIcon({ color, size = 12 }) {
  // Build 145 v5.15: brand shopping-bag icon ported from ProfileScreen.js
  // CartActionIcon (line 131). Bag silhouette with handle curve.
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <Line x1={3} y1={6} x2={21} y2={6} />
      <Path d="M16 10a4 4 0 0 1-8 0" />
    </Svg>
  );
}

function FeatureSparkleIcon({ color, size = 12 }) {
  // 4-point sparkle/star — "surprise me" for the 4th feature bullet
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 1 L14 10 L23 12 L14 14 L12 23 L10 14 L1 12 L10 10 Z" />
    </Svg>
  );
}

// Build 145 v5.29: clock icon — speed / value-of-time bullet (60s renders,
// wishes-never-expire). Lucide-style stroke to match share/cart family.
function FeatureClockIcon({ color, size = 12 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={10} />
      <Path d="M12 6v6l4 2" />
    </Svg>
  );
}

// Build 145 v5.29: shield icon — trust / risk-free / cancel-anytime bullet.
// Lucide-style stroke for visual consistency with the rest of the icon set.
function FeatureShieldIcon({ color, size = 12 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <Path d="M9 12l2 2 4-4" />
    </Svg>
  );
}

// Build 145 v5.29: 6-icon rotation for 6-bullet feature lists.
// 0 → lamp (wishes/usage), 1 → share, 2 → cart (shop),
// 3 → sparkle (style variety / premium), 4 → clock (speed / no-expiry),
// 5 → shield (trust / risk-free / pay-once)
const FEATURE_ICONS = [
  FeatureLampIcon,
  FeatureShareIcon,
  FeatureCartIcon,
  FeatureSparkleIcon,
  FeatureClockIcon,
  FeatureShieldIcon,
];

// Build 145 v5.27: duplicate InfinityIcon declaration removed — the
// canonical definition lives at top of file (Lucide-style stroked).

// Build 145 v3 cleanup: TogglePill component removed (tabs are now rendered
// inline as underlined Text in the main render — see tabsRow JSX below).

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PaywallScreen({ navigation }) {
  const { user } = useAuth();
  const {
    subscription, purchaseSubscription, restorePurchases,
    tokenBalance, purchaseTokens, refreshTokenBalance,
  } = useSubscription();

  // Build 145: default to Subscribe tab with the PRO tier highlighted.
  // Mock spec: paywall opens on Subscribe (was Wishes), PRO recommended.
  const [activeTab, setActiveTab] = useState('subscribe');
  const [selectedTier, setSelectedTier] = useState('basic');
  const [selectedWish, setSelectedWish] = useState('homegenie_wishes_4');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // ── Build 113: tile refs + burst origin for the celebration overlay ──
  // Each grid card registers its underlying View ref via AnimatedTile's
  // `registerRef` callback. When the user taps Buy, we measureInWindow
  // on the selected tile to get its on-screen center, then hand that
  // point to PurchaseCelebrationOverlay so the SparkleBurst radiates
  // from the tile the user just bought from. measureInWindow gives us
  // the live screen position (handles scroll, rotation, safe area).
  const tileRefs = useRef({});
  const [burstOrigin, setBurstOrigin] = useState(null);

  // ── Build 110: live-poll wish balance while paywall is open ──────────
  // Defense in depth for the wish-counter sync gap. Every 3 seconds while
  // the paywall is mounted, re-fetch authoritative balance from the
  // server. Any drift between local state and server truth (even from a
  // background webhook, manual admin grant, refund, etc.) heals within
  // 3 seconds. Cleans up on unmount.
  //
  // Cost: one supabase RPC every 3s while paywall is visible. The user
  // is on this screen for 30-90s on average → 10-30 RPCs per session,
  // each ~30ms. Negligible cost for a payment-critical surface.
  useEffect(() => {
    if (!user?.id || !refreshTokenBalance) return;
    // Fire immediately on mount, then poll.
    refreshTokenBalance();
    const intervalId = setInterval(() => {
      refreshTokenBalance();
    }, 3000);
    return () => clearInterval(intervalId);
  }, [user?.id, refreshTokenBalance]);

  // Build 110: dev-only render trace so we can see what tokenBalance is
  // when the widget renders. Console.app will show this on every paywall
  // re-render — gives us a visible audit trail of what the widget is
  // actually consuming from context.
  useEffect(() => {
    console.log('[Paywall] tokenBalance render value:', tokenBalance);
  }, [tokenBalance]);

  // Build 145: hero slideshow animation removed (clean white-card design).

  // ── Unified wishes counter (Build 84 follow-up) ──────────────────────────
  // Build 84 user feedback: the prior card showed a static "Free Wishes:
  // 3 remaining" even after the user paid for additional wishes. The new
  // card reflects the user's TOTAL available wishes from whatever source
  // they purchased — buying 4 wishes makes the count jump from 3 → 7.
  // Subscribers see their tier-correct weekly cap. The card adapts to
  // four states: free-only, free + purchased, subscribed, premium-unlimited.
  const isFree            = subscription.tier === 'free';
  const isUnlimitedSub    = subscription.quotaLimit === -1; // premium tier
  const renewableTotal    = isFree ? 5 : (isUnlimitedSub ? 0 : subscription.quotaLimit);
  const renewableRemaining = isFree
    ? Math.max(0, 5 - subscription.generationsUsed)
    : (isUnlimitedSub ? 0 : subscription.generationsRemaining);
  const purchasedCount    = tokenBalance;
  const tierName          = subscription.tier
    ? subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1)
    : 'Free';

  // Card content — labels + counts + optional subline
  let cardLabel, cardCount, cardSubline;
  if (isUnlimitedSub) {
    cardLabel   = 'Premium Plan';
    cardCount   = 'Unlimited';
    cardSubline = purchasedCount > 0
      ? `Renews weekly + ${purchasedCount} purchased`
      : 'Renews weekly';
  } else if (!isFree) {
    cardLabel   = `${tierName} Plan`;
    cardCount   = `${renewableRemaining} remaining`;
    cardSubline = purchasedCount > 0
      ? `${renewableRemaining} of ${renewableTotal} weekly + ${purchasedCount} purchased`
      : `${renewableTotal} wishes weekly`;
  } else if (purchasedCount > 0) {
    // Free user with purchased wishes — combine into one total.
    cardLabel   = 'Wishes Available';
    cardCount   = `${renewableRemaining + purchasedCount} remaining`;
    cardSubline = `${renewableRemaining} free + ${purchasedCount} purchased`;
  } else {
    // Pure free user — preserve original "Free Wishes" label + count.
    cardLabel   = 'Free Wishes';
    cardCount   = `${renewableRemaining} remaining`;
    cardSubline = null;
  }

  // Progress bar represents wishes-remaining-share. Hidden for premium
  // (no cap to graph). The bar reflects TOTAL wishes the user has —
  // free + purchased + subscription remaining — not just the free quota.
  //
  // Build 113 fix: previously the denominator was just `renewableTotal`
  // (5 for free users), so the bar only depleted as the 5 free wishes
  // were used. After buying 8 wishes, balance went 5→13 but the bar
  // stayed pinned to free-only progress, ignoring the purchase.
  //
  // New behavior: bar = totalAvailable / peakTotal. The peak ratchets
  // UP on purchases / subscription renewals (never down) so the bar
  // smoothly depletes as wishes are spent. When the user buys more,
  // the peak grows and the bar refills proportionally.
  //
  // Examples:
  //   • Fresh free user (5 free, 0 paid):  5/5 = 100%
  //   • Used 2 free:                       3/5 = 60%
  //   • After buying 4 with 0 free left:   4/4 = 100%   (peak resets to 4)
  //   • Used 1 of those 4:                 3/4 = 75%
  //   • Free=5, paid=8 (just bought):      13/13 = 100% (peak = 13)
  //   • Used 1 from that pool:             12/13 = 92%
  const showProgressBar = !isUnlimitedSub;
  const totalAvailable  = renewableRemaining + purchasedCount;
  // Baseline keeps the bar visible at 100% for a fresh free user with
  // 0 purchased — `totalAvailable` would otherwise float without a
  // reference. Subscribers use their weekly quota as the floor.
  const baseline = isFree ? 5 : (isUnlimitedSub ? 0 : renewableTotal);
  const peakTotalRef = useRef(Math.max(baseline, totalAvailable));
  // Ratchet the peak upward on every render; never downward. Modifying
  // a ref during render is safe here — value is read immediately below
  // for progressPct, and the ref doesn't trigger re-renders.
  const targetPeak = Math.max(baseline, totalAvailable);
  if (targetPeak > peakTotalRef.current) {
    peakTotalRef.current = targetPeak;
  }
  const progressPct = peakTotalRef.current > 0
    ? Math.min(1, totalAvailable / peakTotalRef.current)
    : 0;

  // Legacy aliases retained for any downstream reference (keep blast radius small)
  const remaining = renewableRemaining;
  const totalFree = isFree ? 5 : renewableTotal;
  const usedCount = subscription.generationsUsed;

  // Build 145 v4: hero is inlined as base64 in the JS bundle — no Metro
  // HTTP fetch, no prefetch needed, renders synchronously with the Image
  // component. Eliminates the 8-10s dev-mode reload delay entirely.

  // Selected items
  const selectedSubTier = PAID_TIERS.find(t => t.id === selectedTier);
  const selectedWishPkg = WISH_PACKAGES.find(p => p.id === selectedWish);

  // ── Purchase handlers ──────────────────────────────────────────────────

  const handlePurchase = async () => {
    // Guard against session expiry mid-flow. If the refresh token died while
    // the user was on this screen, StoreKit will charge the card but the
    // Supabase RPC write (record purchase + grant entitlement) will silently
    // fail — user ends up charged with nothing to show for it.
    if (!user?.id) {
      // Build 145 — route to Onboarding page 5 (new auth surface) instead
      // of the legacy AuthScreen modal.
      navigation.navigate('Onboarding', { initialPage: 5 });
      return;
    }

    // ── Build 113: capture the burst origin BEFORE awaiting StoreKit ──
    // measureInWindow returns the tile's live screen position. We need
    // this BEFORE the StoreKit sheet opens (which can shift focus) and
    // BEFORE the listener fires (which is when the overlay reads it).
    // Falls back gracefully to screen center if the ref isn't ready.
    const tileId = activeTab === 'wishes'
      ? selectedWish
      : selectedSubTier?.productId;
    const tileNode = tileId ? tileRefs.current[tileId] : null;
    if (tileNode && typeof tileNode.measureInWindow === 'function') {
      tileNode.measureInWindow((x, y, w, h) => {
        if (typeof x === 'number' && typeof y === 'number') {
          setBurstOrigin({ x: x + (w || 0) / 2, y: y + (h || 0) / 2 });
        }
      });
    } else {
      setBurstOrigin({ x: SCREEN_W / 2, y: SCREEN_H * 0.4 });
    }

    setPurchasing(true);
    try {
      if (activeTab === 'wishes') {
        // Build 108: purchaseTokens now waits for actual server-side
        // fulfillment before resolving. The Alert below only fires after
        // tokenBalance has been updated in context state — making the
        // "Wishes added!" message factually accurate, not optimistic.
        const result = await purchaseTokens(selectedWish);
        if (result?.success) {
          hapticSuccess();
          // Belt-and-suspenders: re-sync from server so the widget reflects
          // authoritative balance even if a race condition slipped through.
          refreshTokenBalance?.();
          const pkg = WISH_PACKAGES.find(p => p.id === selectedWish);
          const wishCount = pkg?.wishes ?? 0;
          // Build 113 polish: defer the success Alert by 1500ms so the
          // SparkleBurst (~1.0s) + counter tick-up get their full moment
          // before the Alert covers them. 500ms of "settled" breathing
          // room makes the celebration feel intentional rather than
          // immediately interrupted.
          setTimeout(() => {
            Alert.alert(
              '✨ Wishes added!',
              wishCount > 0
                ? `${wishCount} wish${wishCount === 1 ? '' : 'es'} added to your account. Tap a style on Home to start designing.`
                : 'Your purchase was successful. Tap a style on Home to start designing.',
              [{ text: 'Start Designing', onPress: () => navigation.goBack() }],
            );
          }, 1500);
        }
      } else {
        const result = await purchaseSubscription(selectedSubTier.productId);
        if (result?.success) {
          hapticSuccess();
          refreshTokenBalance?.();
          // Build 113 polish: same 1500ms deferral as the wishes path so
          // the burst + counter animation get to play uninterrupted before
          // the Alert pops over them.
          setTimeout(() => {
            Alert.alert(
              '🎉 Subscription active',
              `Welcome to ${selectedSubTier.name}! ${selectedSubTier.gens === -1 ? 'Unlimited' : selectedSubTier.gens} wishes per week. Renews automatically — manage anytime in your Apple ID settings.`,
              [{ text: 'Start Designing', onPress: () => navigation.goBack() }],
            );
          }, 1500);
        }
      }
    } catch (e) {
      // Build 108/109: known-marker errors get specific, calmer copy.
      // - User cancel: silent (they intentionally backed out). Match both
      //   the new kebab-case code from expo-iap v3.x ('user-cancelled')
      //   and the legacy 'E_USER_CANCELLED' for resilience.
      // - Verification-pending: listener already showed its own Alert,
      //   suppress this site so the user doesn't see two alerts.
      if (e?.code === 'user-cancelled' || e?.code === 'E_USER_CANCELLED') {
        // Silent — user dismissed the StoreKit sheet on purpose.
      } else if (e?.code === 'PURCHASE_VERIFICATION_PENDING') {
        // The listener already showed "Purchase received... being verified".
        // Don't double-Alert.
      } else if (e?.code === 'PURCHASE_TIMEOUT') {
        hapticError();
        Alert.alert('Still Processing', e.message);
      } else {
        hapticError();
        Alert.alert('Purchase Failed', e.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setPurchasing(false);
    }
  };

  // ── Restore purchases ─────────────────────────────────────────────────

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result?.restored > 0) {
        Alert.alert('Restored', 'Your purchases have been restored.');
        navigation.goBack();
      } else {
        Alert.alert('Nothing to Restore', 'No previous purchases were found.');
      }
    } catch (e) {
      Alert.alert('Restore Failed', e.message);
    } finally {
      setRestoring(false);
    }
  };

  // ── Referral share ─────────────────────────────────────────────────────

  const handleShareReferral = async () => {
    if (!user?.id) {
      // Build 145 — route to Onboarding page 5 (new auth surface) instead
      // of the legacy AuthScreen modal.
      navigation.navigate('Onboarding', { initialPage: 5 });
      return;
    }
    try {
      const code = await getReferralCode(user.id);
      const appStoreId = process.env.EXPO_PUBLIC_APP_STORE_ID;
      const downloadLine = /^\d+$/.test(appStoreId || '')
        ? `\nDownload: https://apps.apple.com/app/id${appStoreId}`
        : '';
      const shareResult = await Share.share({
        message: `Join me on HomeGenie! Use my referral code ${code} when you sign up and we both get 2 free design credits.${downloadLine}`,
      });

      // Only credit the share bonus if the user actually completed the share
      // (Share.share returns { action: 'sharedAction' } on iOS when shared,
      // 'dismissedAction' if the sheet was closed without sharing).
      if (shareResult?.action === Share.sharedAction) {
        try {
          const { newBalance, alreadyClaimed } = await grantShareBonus(user.id);
          // Pull the latest balance into the subscription context so the
          // paywall + rest of the app reflect the new count.
          await refreshTokenBalance?.();
          if (alreadyClaimed) {
            Alert.alert(
              'Thanks for sharing!',
              `Your message has been shared. Your wish balance: ${newBalance}.`
            );
          } else {
            Alert.alert(
              '2 Free Wishes Added!',
              `Thanks for sharing HomeGenie. Your new balance: ${newBalance} wishes.`
            );
          }
        } catch (bonusErr) {
          // Share succeeded even if the bonus credit failed — don't block.
          console.warn('[Paywall] grantShareBonus failed:', bonusErr?.message);
        }
      }
    } catch (e) {
      if (e.message !== 'User did not share') {
        console.warn('[Paywall] share failed:', e.message);
      }
    }
  };

  // ── CTA label ──────────────────────────────────────────────────────────

  // Build 145 v5.17: single "Continue" CTA across both tabs per user spec.
  // The selected card already communicates the choice + price, so the CTA
  // just needs to drive the next-step action. Apple Review precedent:
  // "Continue" is allowed because the StoreKit sheet immediately shows
  // the explicit product, price, and renewal terms after tap.
  const selectedWishCount = WISH_PACKAGES.find(p => p.id === selectedWish)?.wishes ?? 0;
  // Build 145 v5.52: context-aware loading microcopy — "Loading wishes…"
  // for the consumables tab, "Preparing subscription…" for the recurring
  // tab. Tells the user something is happening between tap and the
  // StoreKit sheet appearing, so the brief gap doesn't feel like a freeze.
  // Falls back to "Continue" in idle state.
  const ctaLabel = purchasing
    ? (activeTab === 'wishes' ? 'Loading wishes…' : 'Preparing subscription…')
    : 'Continue';

  // Build 145 v5.54: shine-sweep animation across the Continue CTA.
  // A diagonal white-translucent band translates from off-left to off-
  // right, paused between sweeps so it reads as polish (not a strobe).
  // Loop disables itself when the user is in the middle of a purchase
  // (pause sheen → no competing motion with the StoreKit dialog about
  // to appear).
  const ctaShineX = useRef(new Animated.Value(-160)).current;
  const [ctaWidth, setCtaWidth] = useState(SCREEN_W);
  useEffect(() => {
    if (purchasing) return;
    let cancelled = false;
    const runOnce = () => {
      if (cancelled) return;
      ctaShineX.setValue(-160);
      Animated.timing(ctaShineX, {
        toValue: ctaWidth + 80,
        duration: 1100,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (!finished || cancelled) return;
        // Pause between sweeps — premium polish reads as occasional shine,
        // not a constant strobe. 3.5s gap is the sweet spot from real
        // top-app A/B observation (Cash App, Notion, Linear all use ~3s).
        setTimeout(runOnce, 3500);
      });
    };
    runOnce();
    return () => { cancelled = true; };
  }, [purchasing, ctaWidth, ctaShineX]);

  // Build 145 v3: context-aware features per selected tier / wish pack.
  // Highlights the SPECIFIC value of what the user is about to buy.
  const features = activeTab === 'wishes'
    ? (FEATURES_BY_WISH_PACKAGE[selectedWish] || FEATURES_FALLBACK)
    : (FEATURES_BY_TIER[selectedTier] || FEATURES_FALLBACK);

  // Ordered packages for the grid
  const orderedWishes = WISH_CARD_ORDER
    .map(id => WISH_PACKAGES.find(p => p.id === id))
    .filter(Boolean);

  const orderedTiers = TIER_CARD_ORDER
    .map(id => PAID_TIERS.find(t => t.id === id))
    .filter(Boolean);

  return (
    <View style={styles.root}>
      {/* Build 145: clean white-card paywall — hero slideshow + dark gradient
          overlay removed. Background is plain white via styles.root. */}
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        {/* Close (X) button — OUTSIDE the ScrollView so it stays fixed at
            the top of the safe area and doesn't scroll away. Positioned
            below the status bar / Dynamic Island on iPhone 14/16 Pro. */}
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.closeBtnCorner}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <CloseIcon />
        </TouchableOpacity>

        {/* ── Scrollable content ────────────────────────────────────── */}
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          bounces={false}
          alwaysBounceVertical={false}
          overScrollMode="never"
        >
          {/* Build 145 v5.13: top bar minimal — just spacer for X close button.
              Logo pill removed per user. */}
          <View style={styles.topBar}>
            <View style={{ flex: 1 }} />
          </View>

          {/* Build 145: underline tabs (Wishes | Subscribe) replace the
              old pill toggle. Active tab gets blue text + 2px blue
              underline; inactive tab is muted gray. Sits directly under
              the top bar per the mock. */}
          {/* Build 145 v5.52: tab order swapped — Subscribe now sits on
              the LEFT (default-focus position in LTR reading). High-value
              recurring revenue option gets the first eye-tracking hit;
              consumable wishes packs sit on the right as the secondary
              option. activeTab default is still 'subscribe' so the
              left-tab-active visual is consistent on open. */}
          <View style={styles.tabsRow}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setActiveTab('subscribe')}
              style={styles.tabItem}
            >
              <Text style={[styles.tabLabel, activeTab === 'subscribe' && styles.tabLabelActive]}>
                Subscribe
              </Text>
              {activeTab === 'subscribe' && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setActiveTab('wishes')}
              style={styles.tabItem}
            >
              <Text style={[styles.tabLabel, activeTab === 'wishes' && styles.tabLabelActive]}>
                Wishes
              </Text>
              {activeTab === 'wishes' && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          </View>
          <View style={styles.tabsDivider} />

          {/* Build 145 v5.52: emotional wish counter — "Only N wishes left
              — get more below" with a tiny lamp icon. Reframes the
              informational "Wishes Available / 6 Remaining" into an
              urgency-flavored cue that primes the user for the cards
              directly below. Unlimited subscribers still see the static
              "Premium Plan / Unlimited" treatment. */}
          {(() => {
            const totalRemaining = isFree
              ? renewableRemaining + purchasedCount
              : renewableRemaining;
            // Urgency tiers: <=10 wishes → "Only N left", >10 → "N
            // wishes available" (neutral). Subscribers w/ unlimited
            // skip both and render the static state.
            const isUrgent = !isUnlimitedSub && totalRemaining <= 10;
            return (
              <View style={styles.wishCounter}>
                <View style={styles.wishCounterRow}>
                  <View style={styles.wishCounterLeft}>
                    {/* Build 145 v5.60: urgent-state lamp color bluePrimary
                        → blueLight per user. Lighter baby blue matches the
                        scarcity number ("6") inside the label, keeping the
                        urgent row visually unified. */}
                    <SmallGenieLamp
                      color={isUrgent ? colors.blueLight : C.textTertiary}
                      size={12}
                    />
                    {/* Build 145 v5.53: urgent label rewritten as a span
                        composition so the number itself can render in
                        blueLight + medium weight while the surrounding
                        words stay neutral. Visually highlights the
                        scarcity number without bolding the whole line. */}
                    {isUnlimitedSub ? (
                      <Text style={styles.wishCounterLabel}>Premium Plan</Text>
                    ) : isUrgent ? (
                      <Text style={[styles.wishCounterLabel, styles.wishCounterLabelUrgent]}>
                        Only{' '}
                        <Text style={styles.wishCounterLabelNumber}>{totalRemaining}</Text>
                        {' '}wish{totalRemaining === 1 ? '' : 'es'} left
                      </Text>
                    ) : (
                      <Text style={styles.wishCounterLabel}>Wishes Available</Text>
                    )}
                  </View>
                  {isUnlimitedSub ? (
                    <Text style={styles.wishCounterValue}>{cardCount}</Text>
                  ) : (
                    <Text style={[
                      styles.wishCounterValue,
                      isUrgent && styles.wishCounterValueUrgent,
                    ]}>
                      {isUrgent ? 'Get more below' : `${totalRemaining} Remaining`}
                    </Text>
                  )}
                </View>
                <View style={styles.wishCounterDivider} />
                {cardSubline && (
                  <Text style={styles.wishCounterSubline}>{cardSubline}</Text>
                )}
              </View>
            );
          })()}

          {/* Build 145 v5.9: hero — paddingHorizontal wrapper pattern matching
              EXACTLY how cardGrid renders. Same 20pt inset on both sides → hero
              + cards align pixel-perfect. */}
          <View style={styles.heroOuter}>
            <View style={styles.heroImageInner}>
              <Image
                source={HERO_SOURCE}
                style={styles.heroImage}
                resizeMode="cover"
                fadeDuration={0}
              />
            </View>
          </View>

          {/* Build 145: Wishes tab = horizontal scroll row (3-4 visible).
              Subscribe tab = 2-card row (no scroll, full width). */}
          {activeTab === 'wishes' ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.cardScrollContent}
              style={styles.cardScrollWishes}
            >
              {orderedWishes.map(pkg => (
                <WishCard
                  key={pkg.id}
                  pkg={pkg}
                  selected={selectedWish === pkg.id}
                  onSelect={setSelectedWish}
                  isPurchasing={purchasing}
                  registerRef={(node) => { tileRefs.current[pkg.id] = node; }}
                />
              ))}
            </ScrollView>
          ) : null}
          {/* Build 145 v5.62: cross-tab promo strip — only shown on the
              Wishes tab, fills the previously dead vertical space between
              the wish cards and the feature bullets. Tapping it switches
              to the Subscribe tab — cross-tab conversion lever for users
              who came in looking at one-time packs but might prefer
              recurring economics. The "$0.71/day" anchor makes the cost
              comparison concrete (vs. $0.25/wish where you only get N
              wishes total). */}
          {activeTab === 'wishes' && (
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => setActiveTab('subscribe')}
              style={styles.crossTabPromo}
            >
              <SmallGenieLamp color={colors.blueLight} size={13} />
              <Text style={styles.crossTabPromoText}>
                Want <Text style={styles.crossTabPromoHighlight}>unlimited wishes</Text>? Subscribe from <Text style={styles.crossTabPromoHighlight}>$0.71/day</Text>
              </Text>
              <Text style={styles.crossTabPromoArrow}>→</Text>
            </TouchableOpacity>
          )}
          {activeTab === 'subscribe' && (
            <View style={styles.cardGrid}>
              {orderedTiers.map(tier => (
                <TierCard
                  key={tier.id}
                  tier={tier}
                  selected={selectedTier === tier.id}
                  onSelect={setSelectedTier}
                  isPurchasing={purchasing}
                  registerRef={(node) => { tileRefs.current[tier.productId] = node; }}
                />
              ))}
            </View>
          )}

          {/* Build 145 v5.14: feature bullets with index-mapped icons.
              0: lamp (wishes), 1: share, 2: cart, 3: sparkle (extras). */}
          <View style={styles.featuresSection}>
            {features.map((feature, i) => {
              const Icon = FEATURE_ICONS[i] || FeatureSparkleIcon;
              return (
                <View key={i} style={styles.featureRow}>
                  <View style={styles.featureCheckCircle}>
                    <Icon color={colors.blueLight} size={12} />
                  </View>
                  <Text style={styles.featureText}>{renderFeatureText(feature)}</Text>
                </View>
              );
            })}
          </View>

          {/* Build 145 v5.17: single "Continue" CTA — price + product
              shown clearly on the selected card above, StoreKit confirms
              the price before charging. */}
          {/* Build 145 v5.52: Continue CTA gets a soft top→bottom gradient
              for tactile depth.
              Build 145 v5.54: shine-sweep overlay added — a clipped
              diagonal white band translates across the button every
              ~4.5 seconds for that premium-app polish feel. The
              overlay is pointerEvents:none so it never blocks taps. */}
          <View style={styles.ctaSection}>
            <TouchableOpacity
              onPress={handlePurchase}
              disabled={purchasing}
              activeOpacity={0.85}
              style={purchasing && styles.ctaDisabled}
              onLayout={(e) => setCtaWidth(e.nativeEvent.layout.width)}
            >
              <View style={styles.ctaClipWrap}>
                <LinearGradient
                  colors={['#7FB8ED', '#4F95D8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                  style={styles.cta}
                >
                  <Text style={styles.ctaText}>{ctaLabel}</Text>
                </LinearGradient>
                {!purchasing && (
                  <Animated.View
                    pointerEvents="none"
                    style={[
                      styles.ctaShine,
                      { transform: [{ translateX: ctaShineX }, { skewX: '-20deg' }] },
                    ]}
                  >
                    <LinearGradient
                      colors={[
                        'rgba(255,255,255,0)',
                        'rgba(255,255,255,0.45)',
                        'rgba(255,255,255,0)',
                      ]}
                      start={{ x: 0, y: 0.5 }}
                      end={{ x: 1, y: 0.5 }}
                      style={StyleSheet.absoluteFill}
                    />
                  </Animated.View>
                )}
              </View>
            </TouchableOpacity>
          </View>

          {/* Build 145: footer (Terms / Restore / Privacy) at very bottom */}
          <View style={styles.footerRow}>
            <TouchableOpacity
              onPress={() => navigation.navigate('TermsOfUse')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.footerLink}>Terms of Use</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRestore}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.footerLink}>
                {restoring ? 'Restoring...' : 'Restore Purchase'}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => navigation.navigate('PrivacyPolicy')}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.footerLink}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>

      </SafeAreaView>

      {/* Build 113: celebration overlay sits above all content, full-screen,
          pointerEvents="none" so taps still pass through to the SafeAreaView.
          Watches SubscriptionContext for tokenBalance increases or tier
          upgrades and fires a SparkleBurst at the previously-measured
          burst origin. Reads context state but never writes — purchase
          pipeline (validateReceipt → add_tokens → setTokenBalance) is
          completely untouched. */}
      <PurchaseCelebrationOverlay origin={burstOrigin} />
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

// Build 145 v3 cleanup: unused `BLUE` constant removed; styles reference
// `colors.bluePrimary` / `colors.blueLight` directly per the white-card mock.

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,  // Build 145: white background (was #000)
  },
  safeArea: {
    flex: 1,
  },

  // ── Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: space.base,
    flexGrow: 1,
  },

  // ── Header
  header: {
    alignItems: 'center',
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: 60,  // Build 145: tighter than 80pt — no hero behind it now
    paddingBottom: space.sm,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordmark: {
    ...typeScale.hero,
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,  // Build 145: dark text on white bg
  },
  closeBtnCorner: {
    // Build 145: dark X on white bg, moved to top-RIGHT per mock.
    // Build 145 v5.46: top 18 → 30 — v5.45 was still too high (X visually
    // touching the battery icon on iPhone 16e). 30pt clears the status
    // bar comfortably on notched devices.
    position: 'absolute',
    top: 30,
    right: space.lg,            // 20pt in from the right edge
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 20,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,  // Build 145: dark-on-white (was white-on-dark)
    textAlign: 'center',
    paddingHorizontal: layout.screenPaddingH + 16,
    marginBottom: space['2xl'],
  },

  // ── Progress card (Free Wishes Usage)
  progressCard: {
    marginHorizontal: layout.screenPaddingH,
    marginBottom: space.lg,
    paddingHorizontal: space.base,
    paddingVertical: 14,
    backgroundColor: C.white,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  progressLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
  },
  progressCount: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: C.border,
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.blueLight,
    shadowColor: colors.blueLight,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 6,
    elevation: 4,
  },
  progressSubline: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
    marginTop: space.xs,
  },

  // Build 145: toggle pill on white bg — blue text active, gray text inactive
  toggleWrapper: {
    paddingHorizontal: layout.screenPaddingH + 56,
    marginBottom: space.xl,
  },
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    backgroundColor: C.surface,  // light gray pill background
    padding: 3,
    borderWidth: 1,
    borderColor: C.border,
  },
  toggleTab: {
    flex: 1,
    height: 34,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTabActive: {
    backgroundColor: C.bg,  // active pill is white (raised) on the gray bg
  },
  toggleText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: C.textTertiary,  // inactive tab text = muted
  },
  toggleTextActive: {
    color: colors.bluePrimary,  // active tab text = brand blue
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
  },

  // Build 145 v3: tightened card layout per mock — less vertical padding
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: layout.screenPaddingH,
    gap: CARD_GAP,
    marginBottom: space.lg,
  },
  // Build 145 v5.32: card background C.bg (#FFFFFF white) → very light grey
  // (#F8FAFC, a hair below the screen's white). Gives the cards a subtle
  // "panel" feel against the screen so they look like distinct tappable
  // surfaces rather than flat white-on-white. Applied to both TierCard
  // (Subscribe) and WishCard (Wishes) via the shared gridCard style.
  gridCard: {
    width: CARD_W,
    backgroundColor: '#FBFCFE',
    borderRadius: 10,
    paddingVertical: 10,            // Build 145 v5.20: tighter (was 12)
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: C.border,
    position: 'relative',
  },
  // Build 145 v5.49: narrower variant of gridCard for the 3-up Wishes carousel.
  // Build 145 v5.59: tightened to 6/6 padding.
  // Build 145 v5.61: justifyContent:'center' added so the stacked content
  // (count → label → divider → price → per-wish → trust) vertically
  // centers as a single block within the card. The inherited cardCountRow
  // marginTop:14 was the previous cause of "content sits too low" — now
  // overridden to 0 on cardCountRowWish, with the card's flex centering
  // taking over.
  gridCardWish: {
    width: WISH_CARD_W,
    paddingHorizontal: 6,
    paddingVertical: 6,
    justifyContent: 'center',
  },
  // Build 145 v5.39: selected-card border thinned 1.5 → 0.75 (half size).
  // Build 145 v5.40: selected-card background gains a subtle blue tint.
  // Build 145 v5.43: tint lightened #F0F6FF → #F7FAFF per user. The
  // previous value read as "blue wash" and felt too bold; this one is
  // closer to a "barely-blue almost-white" — selection still registers
  // visually but doesn't overpower the other UI elements.
  gridCardSelected: {
    borderColor: colors.blueLight,
    borderWidth: 0.75,
    backgroundColor: '#F7FAFF',
  },

  // ── Checkmark badge (split on top-right corner edge)
  checkBadge: {
    position: 'absolute',
    top: -10,
    right: -10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.blueLight,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.3)',
    zIndex: 10,
  },

  // Build 145 v3: Title Case "HomeGenie Designs" (not uppercase) per mock
  cardBrandLabel: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: C.textTertiary,
    letterSpacing: 0,
    flexShrink: 1,
  },
  cardCountRow: {
    flexDirection: 'row',
    // Build 145 v5.35: 'baseline' → 'flex-end'. Baseline alignment falls
    // back to the View's TOP edge for non-text children (the SVG infinity
    // wrap), which floated "Wishes" up and dropped the icon down on the
    // UNLIMITED card. flex-end anchors all children to the row bottom so
    // the infinity icon's bottom and the Wishes text bottom land on the
    // same line — matching how "25" + "Wishes" looks on the PRO card.
    // A small marginBottom on cardWishesLabel lifts its baseline up to
    // sit next to the "25" digit on PRO (so flex-end doesn't push it
    // below the digit's baseline).
    alignItems: 'flex-end',
    justifyContent: 'center',
    marginTop: 14,
    marginBottom: 2,
  },
  cardBigNumber: {
    fontSize: 52,
    // Build 145 v5.58: weight dropped semibold (600) → medium (500) per
    // user. The semibold digit was reading too heavy against the rest
    // of the card content — medium retains visual prominence (still the
    // largest element on the card) while feeling more refined.
    fontWeight: fontWeight.medium,
    fontFamily: 'Geist_500Medium',
    color: C.textPrimary,
    lineHeight: 54,
    letterSpacing: -1,
    // Build 145 v5.41: nudge "25" down 8pt so its visible baseline lines
    // up with the "Wishes" label's baseline.
    transform: [{ translateY: 8 }],
  },
  // Build 145 v5.49: smaller variant for 3-up wish carousel cards.
  // Build 145 v5.59: 34 → 28 + lineHeight 36 → 30 — proportional to the
  // newly tightened card padding. Still medium weight.
  cardBigNumberWish: {
    fontSize: 28,
    lineHeight: 30,
    fontWeight: fontWeight.medium,
    fontFamily: 'Geist_500Medium',
  },
  cardWishesLabelWish: {
    fontSize: 11,
    marginLeft: 4,
  },
  // Build 145 v5.57/v5.59: stacked label sits directly under the number
  // with no top margin — fully tight to the count.
  cardWishesLabelWishStacked: {
    marginLeft: 0,
    marginTop: 0,
  },
  // Build 145 v5.57: column layout — number on top, label centered below.
  // Build 145 v5.61: marginTop overridden to 0 — the inherited 14pt was
  // pushing the entire content block down off-center. Now the card's
  // own justifyContent:'center' handles vertical positioning naturally.
  cardCountRowWish: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 0,
  },
  cardPriceWish: {
    fontSize: 13,
  },
  // Build 145 v5.59: wish-specific compressions for the bottom content
  // band so the divider/per-wish/trust-line area is as tight as the
  // count area above it.
  cardPriceDividerWish: {
    marginVertical: 3,
    alignSelf: 'center',
    width: '70%',
  },
  cardPerDayWish: {
    fontSize: 9,
    marginTop: 0,
  },
  cardTrustLineWish: {
    fontSize: 8,
    marginTop: 0,
  },
  // Build 145 v5.37: wrap height pinned to 54 (matches the "25" digit's
  // lineHeight on the PRO card) so both tier cards have IDENTICAL count-
  // row heights — no more "UNLIMITED card looks slightly taller / shorter
  // than PRO" drift. justifyContent:'flex-end' docks the icon at the
  // bottom of the 54pt box so the icon's bottom lands on the row's
  // bottom edge, right next to the Wishes label.
  cardInfinityWrap: {
    marginRight: 6,
    height: 54,
    justifyContent: 'flex-end',
  },
  cardWishesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
  },
  cardWishesLabel: {
    fontSize: 14,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
    marginLeft: 6,
  },
  cardPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',    // Build 145 v5.18: center the price under the centered number
    gap: 6,
  },
  cardPrice: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: C.textPrimary,
  },

  // Build 145 v3: feature checklist (tightened spacing)
  // Build 145 v5.29: gap 14 → 11 to fit 6 bullets (up from 4) without
  // pushing the CTA off the visible area on smaller iPhones.
  featuresSection: {
    paddingHorizontal: layout.screenPaddingH,
    marginBottom: space.md,
    gap: 11,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  // Build 145 v5.29: circle 20 → 18 to match the slightly smaller font.
  featureCheckCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: C.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Build 145 v5.29: 13 → 12, with explicit lineHeight 16 for readability
  // at the smaller size (default RN lineHeight for 12pt is too tight).
  featureText: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
    flex: 1,
  },
  // Build 145 v5.31: highlight span inside featureText.
  // Build 145 v5.42: weight thinned from semibold (600) → medium (500)
  // per user — the bold-highlight phrases were reading too heavy against
  // the surrounding regular (400) text. Medium still draws the eye to
  // the keyword but feels closer to elegant emphasis than aggressive bold.
  featureTextHighlight: {
    color: colors.blueLight,
    fontWeight: fontWeight.medium,
    fontFamily: 'Geist_500Medium',
  },

  // Build 145: legal section on white bg
  legalSection: {
    marginTop: space.lg,
    marginHorizontal: layout.screenPaddingH,
    paddingHorizontal: space.xs,
    gap: 10,
  },
  finePrint: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
    textAlign: 'center',
    lineHeight: 16,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  legalLink: {
    fontSize: 12,
    fontWeight: fontWeight.medium,
    fontFamily: 'Geist_500Medium',
    color: C.textSecondary,
  },
  legalDot: {
    fontSize: 12,
    color: C.textTertiary,
  },

  // Build 145: sticky CTA bar — blue primary CTA, white-with-border share
  stickyBar: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  cta: {
    backgroundColor: colors.blueLight,
    borderRadius: 10,                 // Build 145 v5.12: unified 10pt corners across CTA + cards + hero
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Build 145 v5.54: clip wrapper so the shine band stays inside the
  // button's rounded edge. Matches the CTA's borderRadius exactly.
  ctaClipWrap: {
    borderRadius: 10,
    overflow: 'hidden',
    position: 'relative',
  },
  // The shine band itself — wider + taller than the button so the
  // diagonal skew never reveals an empty edge at the corners. The inner
  // LinearGradient (transparent → white → transparent) creates the
  // soft-edge "glint" effect rather than a hard white rectangle.
  ctaShine: {
    position: 'absolute',
    top: -10,
    bottom: -10,
    width: 90,
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: C.white,  // Build 145: white text on blue pill
    letterSpacing: -0.2,
  },
  ctaDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.4)',  // white divider on blue
    marginHorizontal: space.md,
  },
  ctaPrice: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: C.white,  // Build 145: white price on blue pill
  },

  // Build 145: share = white pill with blue border + blue text (was blue pill)
  referralBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: C.bg,
    borderWidth: 1.5,
    borderColor: colors.bluePrimary,
    marginTop: space.sm,
    paddingLeft: space.xl,
    paddingRight: 6,
  },
  referralBtnText: {
    ...typeScale.button,
    fontFamily: 'Geist_600SemiBold',
    color: colors.bluePrimary,
    flex: 1,
  },
  referralIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.bluePrimary,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ─── Build 145 new styles (white-card mock layout) ────────────────────────

  // Build 145 v5.46: bumped down a few more pt (minHeight 44 → 60,
  // paddingTop 18 → 30) so the tabs sit slightly lower on the page,
  // matching the new close-X top of 30pt. Now there's a clean 30pt gap
  // below the safe-area top before any content begins.
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: 30,
    paddingBottom: 0,
    minHeight: 60,
  },
  logoPill: {
    width: 110,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#000',
    alignSelf: 'center',
    position: 'absolute',
    left: '50%',
    marginLeft: -55,
    top: space.md + 6,
  },

  // Underline tabs (Wishes | Subscribe)
  // Build 145 v5.3: removed paddingHorizontal so tab underline reaches true
  // 50%-of-screen width per mock. Tab text labels are still centered inside
  // each tabItem (flex:1 + alignItems:center).
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 0,
    marginTop: 4,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    position: 'relative',
  },
  tabLabel: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: C.textTertiary,
  },
  tabLabelActive: {
    color: colors.blueLight,    // Build 145 v5: light baby blue per mock (was bluePrimary navy)
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 1.5,                // Build 145 v5.4: barely thinner per user (was 2)
    backgroundColor: colors.blueLight,
  },
  tabsDivider: {
    height: 1,
    backgroundColor: C.border,
    marginBottom: space.md,  // tighter (was space.base)
  },

  // Minimal wish counter (no card border, no progress bar)
  wishCounter: {
    paddingHorizontal: layout.screenPaddingH,
    marginBottom: space.md,  // tighter (was space.lg)
  },
  wishCounterRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 4,
  },
  // Build 145 v5.52: left side groups the lamp icon + label so they
  // scroll/align as one unit. Gap pulls the lamp away from the text.
  wishCounterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  wishCounterLabel: {
    fontSize: 12,
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
  },
  // Build 145 v5.52: urgent state ("Only N left").
  // Build 145 v5.53: weight thinned semibold → regular (font feels
  // less heavy on the line); only the number itself gets the
  // weight + color pop via wishCounterLabelNumber.
  wishCounterLabelUrgent: {
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: C.textPrimary,
  },
  // Build 145 v5.53: the scarcity number ("6") inside the urgent label
  // — blueLight + medium weight pulls the eye to the number without
  // bolding the entire line.
  wishCounterLabelNumber: {
    color: colors.blueLight,
    fontWeight: fontWeight.medium,
    fontFamily: 'Geist_500Medium',
  },
  wishCounterValue: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: colors.blueLight,
  },
  // Build 145 v5.53: urgent right-side text recolored bluePrimary →
  // textTertiary (light grey) per user — softer cue, less aggressive
  // than a saturated brand color competing with the cards below.
  wishCounterValueUrgent: {
    color: C.textTertiary,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
  },
  wishCounterDivider: {
    height: 1,
    backgroundColor: C.border,
    marginBottom: 4,
  },
  wishCounterSubline: {
    fontSize: 11,
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
  },

  // Build 145 v5.9: hero — paddingHorizontal wrapper pattern matching
  // EXACTLY how cardGrid renders (paddingHorizontal: layout.screenPaddingH).
  // The OUTER View takes the padding, the INNER View takes the borderRadius +
  // aspectRatio. This is the same structural pattern as the cards.
  heroOuter: {
    paddingHorizontal: layout.screenPaddingH,
    marginBottom: space.md,
  },
  heroImageInner: {
    borderRadius: 10,                // Build 145 v5.12: unified 10pt corners
    overflow: 'hidden',
    aspectRatio: 410 / 206,
    backgroundColor: C.surface,
  },
  heroImage: {
    width: '100%',
    height: '100%',
  },

  // Tier/Wish card content (mock layout)
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  // Build 145 v5.24: card "selected" accents back to baby blue (blueLight).
  // Only the MOST POPULAR badge uses bluePrimary (navy) for badge contrast.
  cardBrandLabelSelected: {
    color: colors.blueLight,
  },
  cardHeaderDash: {
    flex: 1,
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: 6,
  },
  cardHeaderDashSelected: {
    backgroundColor: colors.blueLight,
  },
  cardTierLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: C.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cardTierLabelSelected: {
    color: colors.blueLight,
  },
  cardBigNumberSelected: {
    color: colors.blueLight,
  },
  cardWishesLabelSelected: {
    color: colors.blueLight,
  },
  cardPriceDivider: {
    height: 1,
    backgroundColor: C.border,
    marginVertical: 5,
  },
  cardPriceDividerSelected: {
    backgroundColor: colors.blueLight,
  },
  // Build 145 v5.30: price text on selected card uses bluePrimary (deeper
  // navy) instead of blueLight — adds a darker, more commanding accent on
  // the most important number on the card. Other accents (big number,
  // divider, badge) stay blueLight for hierarchy.
  cardPriceSelected: {
    color: colors.bluePrimary,
  },

  // Build 145 v5.19: conversion-focused additions
  popularBadge: {
    position: 'absolute',
    top: -8,
    alignSelf: 'center',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  // Build 145 v5.25: badge is now a pill container with text + star
  popularBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: colors.bluePrimary,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  popularBadgeText: {
    color: C.white,
    fontSize: 8,                          // Build 145 v5.25: smaller (was 9) per user
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    letterSpacing: 0.8,
  },
  popularBadgeStar: {
    // Inline 4-point sparkle to the right of the text
  },
  // Build 145 v5.33: badge background swap when the PRO card is not the
  // currently-selected tier — softens the badge so it stops competing for
  // attention with the selected card's accent. Returns to bluePrimary
  // (the styles.popularBadgePill default) the moment the user taps PRO.
  popularBadgePillUnselected: {
    backgroundColor: colors.blueLight,
  },
  cardPerDay: {
    fontSize: 10,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
    textAlign: 'center',
    marginTop: 2,
  },
  cardPerDaySelected: {
    color: colors.blueLight,
  },
  cardTrustLine: {
    fontSize: 9,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
    textAlign: 'center',
    marginTop: 2,
  },

  // Build 145 v3: inline CTAs (tightened)
  ctaSection: {
    paddingHorizontal: layout.screenPaddingH,
    marginTop: space.md,           // tighter (was space.lg)
    gap: 8,
  },

  // Build 145 v3: share button (matches CTA height, lighter outline)
  shareBtn: {
    height: 44,                      // tighter (was 50)
    borderRadius: radius.pill,
    backgroundColor: C.bg,
    borderWidth: 1,                  // thinner (was 1.5)
    borderColor: colors.blueLight,   // light blue (was bluePrimary)
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
  },
  shareBtnText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: colors.blueLight,         // light blue (was bluePrimary)
    textAlign: 'center',
  },

  // Build 145 v3: footer (wider spacing per mock)
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',  // even spacing (was space-between)
    alignItems: 'center',
    paddingHorizontal: layout.screenPaddingH,
    marginTop: space.lg,
    marginBottom: space.md,
  },
  footerLink: {
    fontSize: 11,                    // smaller (was 12) per mock
    fontWeight: fontWeight.regular,  // regular (was medium)
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
  },

  // Wishes tab horizontal scroll
  // Build 145 v5.50/v5.51/v5.55: tuning history above.
  // Build 145 v5.62: marginBottom dropped space.sm → 6 so the cross-tab
  // promo strip below sits close to the carousel — the strip itself
  // adds the rhythmic gap; we don't need extra space here too.
  cardScrollWishes: {
    marginBottom: 6,
  },
  // Build 145 v5.62: cross-tab promo strip — tappable hint row that
  // pitches Subscribe to users browsing the Wishes carousel. Fills the
  // previously-dead vertical space between cards and features. Subtle
  // blue-tinted bg + thin border so it reads as "info/link" rather than
  // "another CTA competing with Continue".
  crossTabPromo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: layout.screenPaddingH,
    marginBottom: space.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F7FAFF',
    borderWidth: 1,
    borderColor: colors.blueLight + '40', // ~25% opacity blueLight
  },
  crossTabPromoText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
    lineHeight: 16,
  },
  crossTabPromoHighlight: {
    color: colors.bluePrimary,
    fontFamily: 'Geist_600SemiBold',
    fontWeight: fontWeight.semibold,
  },
  crossTabPromoArrow: {
    fontSize: 16,
    color: colors.bluePrimary,
    fontFamily: 'Geist_600SemiBold',
    fontWeight: fontWeight.semibold,
  },
  cardScrollContent: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: 10,
    gap: CARD_GAP,
  },
});
