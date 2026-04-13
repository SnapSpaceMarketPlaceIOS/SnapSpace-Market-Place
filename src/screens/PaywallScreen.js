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
import Svg, { Line, Circle, Polyline, Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/colors';
import { colors as C } from '../constants/theme';
import { space, radius, fontWeight, layout, uiColors } from '../constants/tokens';
import { useSubscription, PAID_TIERS, WISH_PACKAGES } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import { getReferralCode } from '../services/subscriptionService';

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
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth={2.4} strokeLinecap="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

function CheckIcon({ size = 14, color = '#FFFFFF' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

function ShareIcon({ color = '#67ACE9', size = 20 }) {
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
      <Text style={styles.cardPrice}>{pkg.price}</Text>
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
      <Text style={styles.cardPrice}>{tier.priceLabel}</Text>
    </TouchableOpacity>
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
    tokenBalance, purchaseTokens,
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

  // Quota progress
  const usedCount = subscription.generationsUsed;
  const isUnlimited = subscription.quotaLimit === -1;
  const totalFree = subscription.tier === 'free' ? 5 : (isUnlimited ? 0 : subscription.quotaLimit);
  const progressPct = totalFree > 0 ? Math.min(1, usedCount / totalFree) : 0;

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
    try {
      const code = await getReferralCode(user?.id);
      await Share.share({
        message: `Join me on HomeGenie! Use my referral code ${code} when you sign up and we both get 2 free design credits. Download: https://apps.apple.com/app/homegenie`,
      });
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
          <View style={styles.header}>
            <View style={{ width: 40 }} />
            <Text style={styles.wordmark}>HomeGenie</Text>
            <TouchableOpacity
              onPress={() => navigation.goBack()}
              style={styles.closeBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <CloseIcon />
            </TouchableOpacity>
          </View>

          <Text style={styles.subtitle}>Generate stunning room designs and shop curated furniture.</Text>

          {/* ── Free Wishes Usage bar ──────────────────────────────── */}
          {!isUnlimited && (
          <View style={styles.progressCard}>
            <View style={styles.progressLabelRow}>
              <Text style={styles.progressLabel}>Free Wishes Remaining</Text>
              <Text style={styles.progressCount}>{usedCount}/{totalFree}</Text>
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
                      <CheckIcon size={11} color="#67ACE9" />
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
    paddingBottom: 16,
    flexGrow: 1,
  },

  // ── Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: space['4xl'],
    paddingBottom: space.sm,
  },
  wordmark: {
    fontSize: 38,
    fontWeight: fontWeight.xbold,
    fontFamily: 'Geist_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#D1D5DB',
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: '#6B7280',
  },
  progressCount: {
    fontSize: 14,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: '#111827',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E5E7EB',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#67ACE9',
    shadowColor: '#67ACE9',
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
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
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
    backgroundColor: '#67ACE9',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: '#67ACE9',
  },
  toggleTextActive: {
    color: '#FFFFFF',
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
    borderRadius: 16,
    paddingVertical: 18,
    paddingHorizontal: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  gridCardSelected: {
    borderColor: '#67ACE9',
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
    backgroundColor: '#67ACE9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(0,0,0,0.3)',
    zIndex: 10,
  },

  // ── Card inner content
  cardBrandLabel: {
    fontSize: 11,
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
    color: '#FFFFFF',
    lineHeight: 52,
    letterSpacing: -1,
  },
  cardWishesLabel: {
    fontSize: 14,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: 'rgba(255,255,255,0.6)',
    marginLeft: 6,
  },
  cardPrice: {
    fontSize: 16,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: '#FFFFFF',
  },

  // ── Feature checklist (subscribe tab)
  featuresSection: {
    paddingHorizontal: layout.screenPaddingH,
    marginBottom: space.lg,
    gap: 12,
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
    backgroundColor: '#FFFFFF',
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
    paddingHorizontal: 4,
    gap: 10,
  },
  finePrint: {
    fontSize: 11,
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
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
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
    color: '#67ACE9',
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
    color: '#67ACE9',
  },

  // ── Referral share button
  referralBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 50,
    borderRadius: 28,
    backgroundColor: '#67ACE9',
    marginTop: space.sm,
    paddingLeft: 24,
    paddingRight: 6,
  },
  referralBtnText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: '#FFFFFF',
    flex: 1,
  },
  referralIconCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
