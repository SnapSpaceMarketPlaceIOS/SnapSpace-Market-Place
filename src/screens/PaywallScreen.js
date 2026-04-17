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
  Platform,
  UIManager,
} from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Circle, Polyline, Path, Rect, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/colors';
import { colors as C } from '../constants/theme';
import { space, radius, fontWeight, fontSize, typeScale, layout, uiColors } from '../constants/tokens';
import { useSubscription, PAID_TIERS, WISH_PACKAGES } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import { getReferralCode, grantShareBonus } from '../services/subscriptionService';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

// ── Hero slideshow images ────────────────────────────────────────────────────
const HERO_IMAGES = [
  require('../../assets/hero-slideshow-1.jpg'),
  require('../../assets/hero-slideshow-9.jpg'),
  require('../../assets/hero-slideshow-6.jpg'),
  require('../../assets/hero-slideshow-3.jpg'),
  require('../../assets/hero-slideshow-5.jpg'),
  require('../../assets/hero-slideshow-2.jpg'),
];
const HERO_INTERVAL = 5500;
const HERO_FADE_MS  = 1200;

// ── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.white} strokeWidth={2.4} strokeLinecap="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

function CheckIcon({ size = 14, color = C.white }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

function ShareIcon({ color = colors.blueLight, size = 20 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={10} />
      <Polyline points="15 11 12 8 9 11" />
      <Line x1={12} y1={8} x2={12} y2={16} />
    </Svg>
  );
}

// ── Feature lists per tier ────────────────────────────────────────────────────

const TIER_FEATURES = {
  basic: [
    '25 wishes per week',
    'Shop curated furniture matched to your style',
    'Save, share & post your wishes',
    'Access to all room types & design styles',
    'New AI models as they release',
  ],
  pro: [
    '50 wishes per week',
    'Shop curated furniture matched to your style',
    'Save, share & post your wishes',
    'Priority generation — skip the line',
    'Access to all room types & design styles',
    'New AI models as they release',
  ],
  premium: [
    'Unlimited wishes',
    'Shop curated furniture matched to your style',
    'Save, share & post your wishes',
    'Priority generation — fastest results',
    'Early access to new AI models & features',
    'Access to all room types & design styles',
    'Premium support',
  ],
};

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
const TIER_CARD_ORDER = ['basic', 'pro', 'premium'];

// ── Card dimensions (2-column grid) ─────────────────────────────────────────
const CARD_GAP = 12;
const CARD_W = (SCREEN_W - layout.screenPaddingH * 2 - CARD_GAP) / 2;

// ── Wish Package Card ───────────────────────────────────────────────────────

function WishCard({ pkg, selected, onSelect }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onSelect(pkg.id)}
      style={[styles.gridCard, selected && styles.gridCardSelected]}
    >
      {/* Checkmark badge */}
      {selected && (
        <View style={styles.checkBadge}>
          <CheckIcon size={10} color="#FFFFFF" />
        </View>
      )}

      <Text style={styles.cardBrandLabel}>HomeGenie Designs</Text>
      <View style={styles.cardCountRow}>
        <Text style={styles.cardBigNumber}>{pkg.wishes}</Text>
        <Text style={styles.cardWishesLabel}>Wishes</Text>
      </View>
      <View style={styles.cardPriceRow}>
        <Text style={styles.cardPrice}>{pkg.price}</Text>
        <SmallGenieLamp />
      </View>
    </TouchableOpacity>
  );
}

// ── Tier Card (Subscribe view) ──────────────────────────────────────────────

function TierCard({ tier, selected, onSelect }) {
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => onSelect(tier.id)}
      style={[styles.gridCard, selected && styles.gridCardSelected]}
    >
      {/* Checkmark badge */}
      {selected && (
        <View style={styles.checkBadge}>
          <CheckIcon size={10} color="#FFFFFF" />
        </View>
      )}

      <Text style={styles.cardBrandLabel}>{tier.name}</Text>
      <View style={styles.cardCountRow}>
        <Text style={styles.cardBigNumber}>
          {tier.gens === -1 ? '\u221E' : tier.gens}
        </Text>
        <Text style={styles.cardWishesLabel}>Wishes</Text>
      </View>
      <View style={styles.cardPriceRow}>
        <Text style={styles.cardPrice}>{tier.priceLabel}</Text>
        <SmallGenieLamp />
      </View>
    </TouchableOpacity>
  );
}

// Small white genie lamp — displayed next to "Wishes" on each card
const GENIE_LAMP_D = 'M326.155 194.661C306.203 193.551 286.596 223.576 265.287 232.582C259.954 218.661 247.863 208.794 233.603 206.723C231.53 206.386 230.008 204.515 230.02 202.32V201.347C230.044 200.249 230.428 199.189 231.123 198.353C233.699 195.023 234.837 190.732 234.262 186.491C233.675 182.25 231.945 180 228 180C223.945 180 221.632 183.609 221.596 188.674C221.56 192.191 222.71 195.622 224.819 198.353C225.49 199.201 225.862 200.262 225.886 201.347V202.32C225.934 204.441 224.52 206.287 222.53 206.723C206.748 209.006 193.77 220.794 189.432 236.748C178 232.457 167.143 226.669 157.138 219.497C130.008 200.91 117.852 197.824 106.271 197.234C106.271 197.234 104.761 197.234 101.739 199.004L97.5928 201.372V201.385C96.2007 201.953 95.6735 205.674 96.2008 206.672C96.7161 207.67 99.1384 208.944 100.229 209.031C114.118 209.518 127.527 211.489 138.924 219.771C164.952 237.721 180.062 295.913 228.116 295.913C275.031 295.913 295.993 209.304 326.155 209.304C346.886 209.304 342.714 254.499 330.898 264.778C319.082 275.069 307.291 264.503 296.637 264.503C283.719 264.503 284.33 277.476 291.281 278.287C292.862 278.524 294.468 278.05 295.69 276.99C296.925 275.93 297.668 274.37 297.74 272.711C304.33 277.464 312.024 280.283 320.029 280.845C338.699 280.845 354 250.642 354 228.464C353.964 218.248 349.175 195.896 326.155 194.661ZM262.64 247.836C251.579 251.878 239.943 253.936 228.21 253.923C216.502 253.923 204.878 251.877 193.818 247.873C190.93 246.888 189.324 243.67 190.235 240.639C202.326 245.591 215.196 248.123 228.186 248.11C241.176 248.098 254.058 245.566 266.161 240.639C266.593 242.111 266.449 243.682 265.754 245.042C265.059 246.389 263.885 247.399 262.471 247.836H262.64ZM272.322 318.425V318.961C258.158 324.387 243.154 327.106 228.054 326.994C212.955 327.144 197.964 324.462 183.774 319.061V318.524C184.302 316.204 185.704 314.196 187.669 312.973C189.634 311.751 191.995 311.414 194.212 312.038C201.378 314.532 209.275 312.088 213.972 305.925C215.099 304.341 215.974 302.582 216.561 300.711C220.3 301.522 224.098 301.921 227.921 301.921C231.732 301.909 235.519 301.397 239.198 300.374C240.552 305.152 243.763 309.119 248.053 311.339C252.343 313.547 257.316 313.809 261.798 312.038C264.003 311.414 266.364 311.763 268.317 312.986C270.282 314.208 271.673 316.204 272.2 318.524L272.322 318.425Z';
function SmallGenieLamp() {
  return (
    <Svg width={14} height={14} viewBox="92 176 266 155" fill="none">
      <Path d={GENIE_LAMP_D} fill="rgba(255,255,255,0.6)" />
    </Svg>
  );
}

// ── Toggle Pill ─────────────────────────────────────────────────────────────

function TogglePill({ activeTab, onTabChange }) {
  return (
    <View style={styles.toggleContainer}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onTabChange('subscribe')}
        style={[styles.toggleTab, activeTab === 'subscribe' && styles.toggleTabActive]}
      >
        <Text style={[styles.toggleText, activeTab === 'subscribe' && styles.toggleTextActive]}>
          Subscribe
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onTabChange('wishes')}
        style={[styles.toggleTab, activeTab === 'wishes' && styles.toggleTabActive]}
      >
        <Text style={[styles.toggleText, activeTab === 'wishes' && styles.toggleTextActive]}>
          Wishes
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PaywallScreen({ navigation }) {
  const { user } = useAuth();
  const {
    subscription, purchaseSubscription, restorePurchases,
    tokenBalance, purchaseTokens, refreshTokenBalance,
  } = useSubscription();

  const [activeTab, setActiveTab] = useState('wishes');
  const [selectedTier, setSelectedTier] = useState('premium');
  const [selectedWish, setSelectedWish] = useState('homegenie_wishes_4');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // ── Hero slideshow animation ───────────────────────────────────────────
  const heroOpacities = useRef(HERO_IMAGES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;
  const heroCurrentIdx = useRef(0);
  const heroTimerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;

    const scheduleNext = () => {
      heroTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        const currentIdx = heroCurrentIdx.current;
        const nextIdx = (currentIdx + 1) % HERO_IMAGES.length;

        Animated.timing(heroOpacities[nextIdx], {
          toValue: 1,
          duration: HERO_FADE_MS,
          useNativeDriver: true,
        }).start(() => {
          if (cancelled) return;
          heroOpacities[currentIdx].setValue(0);
          heroCurrentIdx.current = nextIdx;
          scheduleNext();
        });
      }, HERO_INTERVAL);
    };

    scheduleNext();
    return () => { cancelled = true; clearTimeout(heroTimerRef.current); };
  }, []);

  // Quota progress — show for free-tier users so they see remaining wishes
  const usedCount = subscription.generationsUsed;
  const isFree = subscription.tier === 'free';
  const totalFree = isFree ? 5 : subscription.quotaLimit;
  const remaining = Math.max(0, totalFree - usedCount);
  // Bar starts full (100% = all wishes available) and depletes toward 0%
  const progressPct = totalFree > 0 ? Math.min(1, remaining / totalFree) : 0;

  // Entrance animation — bar fills from 0 to actual value once on mount
  const progressAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progressPct,
      duration: 800,
      delay: 400,
      useNativeDriver: false,
    }).start();
  }, [progressPct]);

  // Selected items
  const selectedSubTier = PAID_TIERS.find(t => t.id === selectedTier);
  const selectedWishPkg = WISH_PACKAGES.find(p => p.id === selectedWish);

  // ── Purchase handlers ──────────────────────────────────────────────────

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      if (activeTab === 'wishes') {
        const result = await purchaseTokens(selectedWish);
        if (result?.success) navigation.goBack();
      } else {
        const result = await purchaseSubscription(selectedSubTier.productId);
        if (result?.success) navigation.goBack();
      }
    } catch (e) {
      Alert.alert('Purchase Failed', e.message);
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
      Alert.alert('Sign In Required', 'Please sign in to share and earn free wishes.');
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

  const ctaLabel = purchasing
    ? 'Processing...'
    : activeTab === 'wishes'
      ? `HomeGenie Wishes`
      : 'Subscribe Weekly';

  const ctaPrice = activeTab === 'wishes'
    ? selectedWishPkg?.price ?? '$0.99'
    : selectedSubTier?.priceLabel ?? '$1.99/wk';

  // ── Features for selected tier ─────────────────────────────────────────
  const features = TIER_FEATURES[selectedTier] || TIER_FEATURES.basic;

  // Ordered packages for the grid
  const orderedWishes = WISH_CARD_ORDER
    .map(id => WISH_PACKAGES.find(p => p.id === id))
    .filter(Boolean);

  const orderedTiers = TIER_CARD_ORDER
    .map(id => PAID_TIERS.find(t => t.id === id))
    .filter(Boolean);

  return (
    <View style={styles.root}>
      {/* ── Background hero slideshow ─────────────────────────────── */}
      <View style={StyleSheet.absoluteFill}>
        {HERO_IMAGES.map((src, i) => (
          <Animated.View key={i} style={[StyleSheet.absoluteFill, { opacity: heroOpacities[i] }]}>
            <Image
              source={src}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          </Animated.View>
        ))}
      </View>

      {/* ── Gradient overlay ──────────────────────────────────────── */}
      <LinearGradient
        colors={['rgba(11,109,195,0.65)', 'rgba(0,0,0,0.80)']}
        locations={[0.17, 0.75]}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
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
          {/* ── Header ─────────────────────────────────────────────── */}
          {/* Close button — top right corner */}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.closeBtnCorner}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <CloseIcon />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.wordmarkRow}>
              <Text style={styles.wordmark}>HomeGenie</Text>
              <Svg width={38} height={38} viewBox="0 0 450 450" style={{ marginLeft: 8 }}>
                <Defs>
                  <SvgLinearGradient id="pwBgGrad" x1="225" y1="0" x2="225" y2="450" gradientUnits="userSpaceOnUse">
                    <Stop offset="0.144" stopColor="#67ACE9" />
                    <Stop offset="0.769" stopColor="#0B6DC3" />
                  </SvgLinearGradient>
                  <SvgLinearGradient id="pwGenieGrad" x1="225.6" y1="176" x2="225.6" y2="327" gradientUnits="userSpaceOnUse">
                    <Stop offset="0.317" stopColor="#67ACE9" />
                    <Stop offset="0.861" stopColor="#0B6DC3" />
                  </SvgLinearGradient>
                </Defs>
                <Rect width="450" height="450" rx="100" fill="url(#pwBgGrad)" />
                <Path fillRule="evenodd" clipRule="evenodd" d="M197 74.5482L79.8429 154.709C69.2396 160.878 64 168.427 64 177.444V356.814C64 374.007 86.7806 388.057 114.655 388.057H334.344C362.219 388.057 385 374.007 385 356.814V177.444C385 168.427 379.74 160.878 369.136 154.709L256.5 74.5483C227.631 57.7131 224.313 57.9218 197 74.5482Z" fill="#FFFFFF" />
                <Circle cx="225" cy="110.548" r="10" fill="#5AA4E4" />
                <Path d={GENIE_LAMP_D} fill="url(#pwGenieGrad)" />
              </Svg>
            </View>
          </View>

          <Text style={styles.subtitle}>Generate stunning room designs and shop curated furniture.</Text>

          {/* ── Free Wishes Usage bar ──────────────────────────────── */}
          {isFree && (
          <View style={styles.progressCard}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabel}>Free Wishes</Text>
              <Text style={styles.progressCount}>{remaining} of {totalFree}</Text>
            </View>
            <View style={styles.progressTrack}>
              <Animated.View style={[styles.progressFill, {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              }]} />
            </View>
          </View>
          )}

          {/* ── Toggle pill ───────────────────────────────────────── */}
          <View style={styles.toggleWrapper}>
            <TogglePill activeTab={activeTab} onTabChange={setActiveTab} />
          </View>

          {/* ── Card grid ─────────────────────────────────────────── */}
          {activeTab === 'wishes' ? (
            <View style={styles.cardGrid}>
              {orderedWishes.map(pkg => (
                <WishCard
                  key={pkg.id}
                  pkg={pkg}
                  selected={selectedWish === pkg.id}
                  onSelect={setSelectedWish}
                />
              ))}
            </View>
          ) : (
            <>
              <View style={styles.cardGrid}>
                {orderedTiers.map(tier => (
                  <TierCard
                    key={tier.id}
                    tier={tier}
                    selected={selectedTier === tier.id}
                    onSelect={setSelectedTier}
                  />
                ))}
              </View>

              {/* ── Feature checklist ──────────────────────────────── */}
              <View style={styles.featuresSection}>
                {features.map((feature, i) => (
                  <View key={i} style={styles.featureRow}>
                    <View style={styles.featureCheckCircle}>
                      <CheckIcon size={11} color={colors.blueLight} />
                    </View>
                    <Text style={styles.featureText}>{feature}</Text>
                  </View>
                ))}
              </View>
            </>
          )}

          {/* ── Legal section ─────────────────────────────────────── */}
          <View style={styles.legalSection}>
            <Text style={styles.finePrint}>
              Payment will be charged to your Apple ID account at confirmation of purchase.
              Subscription automatically renews unless cancelled at least 24 hours before the
              end of the current period. You can manage or cancel your subscription in your
              device's Settings {'>'} Apple ID {'>'} Subscriptions.
            </Text>
            <View style={styles.legalLinks}>
              <TouchableOpacity onPress={() => navigation.navigate('TermsOfUse')} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.legalLink}>Terms of Use</Text>
              </TouchableOpacity>
              <Text style={styles.legalDot}>{'\u00B7'}</Text>
              <TouchableOpacity onPress={() => navigation.navigate('PrivacyPolicy')} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.legalLink}>Privacy Policy</Text>
              </TouchableOpacity>
              <Text style={styles.legalDot}>{'\u00B7'}</Text>
              <TouchableOpacity onPress={handleRestore} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.legalLink}>{restoring ? 'Restoring...' : 'Restore Purchases'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </ScrollView>

        {/* ── Sticky bottom section ─────────────────────────────────── */}
        <View style={styles.stickyBar}>
          {/* CTA button */}
          <TouchableOpacity
            onPress={handlePurchase}
            disabled={purchasing}
            activeOpacity={0.85}
            style={[styles.cta, purchasing && styles.ctaDisabled]}
          >
            <View style={styles.ctaInner}>
              <Text style={styles.ctaText}>{ctaLabel}</Text>
              <View style={styles.ctaDivider} />
              <Text style={styles.ctaPrice}>{ctaPrice}</Text>
            </View>
          </TouchableOpacity>

          {/* Referral share button */}
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={handleShareReferral}
            style={styles.referralBtn}
          >
            <Text style={styles.referralBtnText}>
              Share to a friend and get free Wishes!
            </Text>
            <View style={styles.referralIconCircle}>
              <ShareIcon />
            </View>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const BLUE = colors.bluePrimary;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
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
    // Slight nudge down from the top of the sheet so the wordmark has
    // breathing room below the status bar + close (X) button.
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: 56,
    paddingBottom: space.sm,
  },
  wordmarkRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  wordmark: {
    ...typeScale.hero,
    fontFamily: 'Geist_700Bold',
    color: C.white,
  },
  closeBtnCorner: {
    position: 'absolute',
    // Standard iOS sheet pattern — X sits in the top-left corner,
    // clearly above the heading (not tangled with the subheading).
    top: 16,
    left: space.lg,
    padding: space.sm,
    zIndex: 10,
  },
  subtitle: {
    fontSize: 16,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: 'rgba(255,255,255,0.75)',
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

  // ── Toggle pill — matches mockup: blue filled active, transparent inactive
  toggleWrapper: {
    paddingHorizontal: layout.screenPaddingH + 56,
    marginBottom: space.xl,
  },
  toggleContainer: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    backgroundColor: C.white,
    padding: 3,
  },
  toggleTab: {
    flex: 1,
    height: 34,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTabActive: {
    backgroundColor: colors.blueLight,
  },
  toggleText: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: colors.blueLight,
  },
  toggleTextActive: {
    color: C.white,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
  },

  // ── Card grid (2 columns)
  cardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: layout.screenPaddingH,
    gap: CARD_GAP,
    marginBottom: space.lg,
  },
  gridCard: {
    width: CARD_W,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: radius.lg,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  gridCardSelected: {
    borderColor: colors.blueLight,
    borderWidth: 2,
    backgroundColor: 'rgba(103,172,233,0.12)',
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

  // ── Card inner content
  cardBrandLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: 'rgba(255,255,255,0.6)',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  cardCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 6,
  },
  cardBigNumber: {
    fontSize: 48,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: C.white,
    lineHeight: 52,
    letterSpacing: -1,
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
    color: 'rgba(255,255,255,0.6)',
    marginLeft: 6,
  },
  cardPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  cardPrice: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: C.white,
  },

  // ── Feature checklist (subscribe tab)
  featuresSection: {
    paddingHorizontal: layout.screenPaddingH,
    marginBottom: space.lg,
    gap: space.md,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureCheckCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    fontSize: 14,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: 'rgba(255,255,255,0.85)',
    flex: 1,
  },

  // ── Legal section
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
    color: 'rgba(255,255,255,0.4)',
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
    color: 'rgba(255,255,255,0.55)',
  },
  legalDot: {
    fontSize: 12,
    color: 'rgba(255,255,255,0.3)',
  },

  // ── Sticky CTA bar
  stickyBar: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  cta: {
    backgroundColor: C.white,
    borderRadius: radius.pill,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: colors.blueLight,
    letterSpacing: -0.2,
  },
  ctaDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(103,172,233,0.3)',
    marginHorizontal: space.md,
  },
  ctaPrice: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: colors.blueLight,
  },

  // ── Referral share button
  referralBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 50,
    borderRadius: radius.pill,
    backgroundColor: colors.blueLight,
    marginTop: space.sm,
    paddingLeft: space.xl,
    paddingRight: 6,
  },
  referralBtnText: {
    ...typeScale.button,
    fontFamily: 'Geist_600SemiBold',
    color: C.white,
    flex: 1,
  },
  referralIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
