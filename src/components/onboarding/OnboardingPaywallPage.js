/**
 * OnboardingPaywallPage — slide 6 of the 7-page onboarding flow.
 *
 * Build 148: paywall inserted as a hard step between auth (slide 5) and
 * the reward reveal (slide 7). The user has just signed in / created an
 * account on slide 5; this page asks them to pick a subscription before
 * they unlock the 5-free-wishes gift on slide 7.
 *
 * Why a dedicated component instead of routing to PaywallScreen:
 *   • PaywallScreen is the in-app paywall (post-onboarding, runs while
 *     using the app). It has tabs (Wishes / Subscribe), a hero image,
 *     animated wishes counter, cross-tab promo, shine-sweeps, and an
 *     X-close that drops back into the previous screen. None of that
 *     fits the linear onboarding feel.
 *   • Onboarding wants: title → two tier cards → bullets → Subscribe
 *     OR Skip → bars at bottom. One screen, no scroll, no tabs, no X.
 *   • Reusing the full PaywallScreen modally would break the swipe-paged
 *     feel the user explicitly asked for ("seven slides total").
 *
 * Conversion / compliance notes:
 *   • Apple §3.1.1 — "Restore Purchase" link kept in the footer.
 *   • Apple §5.1.1 — Terms + Privacy links kept in the footer.
 *   • Apple §3.1.2(a) — Per-tier price + renewal cadence are visible on
 *     each card. StoreKit will reconfirm before charging.
 *   • If the user already has an active paid subscription (re-entering
 *     onboarding via initialPage:5 after signout, etc.), this page
 *     auto-skips by calling onContinue on mount.
 *
 * Props:
 *   navigation  — for Terms / Privacy navigation
 *   screenWidth — required for FlatList page width
 *   progressDots — preformatted <ProgressBars/> from OnboardingScreen
 *   onContinue  — () => void, called when user finishes (subscribe OR skip)
 *   isActive    — true when slide 6 is the current FlatList page (unused
 *                 here, kept for API parity with the other onboarding pages)
 */

import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { useAuth } from '../../context/AuthContext';
import { useSubscription, PAID_TIERS } from '../../context/SubscriptionContext';
import { colors } from '../../constants/colors';
import { hapticSuccess, hapticError } from '../../utils/haptics';

const BLUE_LIGHT = colors.blueLight;     // #67ACE9
const BLUE_PRIMARY = colors.bluePrimary; // #0B6DC3

// ── Icons ──────────────────────────────────────────────────────────────────

function CheckIcon({ color = BLUE_LIGHT, size = 12 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M5 12l5 5L20 7"
        stroke={color}
        strokeWidth={2.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
}

function InfinityIcon({ color = BLUE_LIGHT, size = 36 }) {
  // Same Lucide-style infinity as PaywallScreen — used for UNLIMITED tier
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

function StarIcon({ color = '#FFFFFF', size = 9 }) {
  // 4-point star for MOST POPULAR badge
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M12 1 L14 10 L23 12 L14 14 L12 23 L10 14 L1 12 L10 10 Z" />
    </Svg>
  );
}

// ── Feature bullets ────────────────────────────────────────────────────────
// Keep tight — only 4 bullets so the page fits without scroll on iPhone SE.
const FEATURES = [
  'Generate unlimited room designs',
  'Save & share every design you create',
  'Tap any product in your room to shop it',
  'Cancel anytime — no commitment',
];

// ── Tier card ──────────────────────────────────────────────────────────────

function TierCard({ tier, selected, onSelect, disabled }) {
  const isUnlimited = tier.gens === -1;
  const isPopular = tier.id === 'basic'; // PRO is the "most popular" default

  // Derive per-day price for visual anchor under the headline price
  // Tier priceLabel formats: "$4.99/wk" or "$19.99/wk"
  const perDay = tier.id === 'basic' ? '$0.71/day'
    : tier.id === 'premium' ? '$2.85/day'
    : '';

  return (
    <TouchableOpacity
      onPress={() => onSelect(tier.id)}
      disabled={disabled}
      activeOpacity={0.85}
      style={[styles.tierCard, selected && styles.tierCardSelected]}
      accessibilityRole="button"
      accessibilityLabel={`${tier.name} — ${tier.priceLabel}`}
      accessibilityState={{ selected }}
    >
      {isPopular && (
        <View style={styles.popularBadgeWrap}>
          <View style={[styles.popularBadge, !selected && styles.popularBadgeUnselected]}>
            <Text style={styles.popularBadgeText}>MOST POPULAR</Text>
            <StarIcon color="#FFFFFF" size={8} />
          </View>
        </View>
      )}

      {/* Count or infinity */}
      <View style={styles.tierCount}>
        {isUnlimited ? (
          <InfinityIcon color={selected ? BLUE_LIGHT : '#0F172A'} size={48} />
        ) : (
          <Text style={[styles.tierBigNumber, selected && styles.tierBigNumberSelected]}>
            {tier.gens}
          </Text>
        )}
        <Text style={[styles.tierLabel, selected && styles.tierLabelSelected]}>Wishes / wk</Text>
      </View>

      <View style={[styles.tierDivider, selected && styles.tierDividerSelected]} />

      {/* Price — per-day prominent, weekly underneath */}
      <Text style={[styles.tierPrice, selected && styles.tierPriceSelected]}>{perDay}</Text>
      <Text style={[styles.tierSubprice, selected && styles.tierSubpriceSelected]}>
        {tier.priceLabel}
      </Text>
      <Text style={styles.tierTrust}>Cancel anytime</Text>
    </TouchableOpacity>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────

export default function OnboardingPaywallPage({
  navigation,
  screenWidth,
  progressDots,
  onContinue,
  isActive = true,
}) {
  const insets = useSafeAreaInsets();
  const { user } = useAuth();
  const { subscription, purchaseSubscription, restorePurchases } = useSubscription();

  const [selectedTier, setSelectedTier] = useState('basic');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Skip the paywall entirely if the user already has an active paid sub.
  // Most often hits returning users who signed out and re-entered onboarding
  // via initialPage:5 — they shouldn't be re-pitched a subscription they
  // already own. Fires once on mount.
  const skippedRef = useRef(false);
  useEffect(() => {
    if (skippedRef.current) return;
    if (subscription?.tier && subscription.tier !== 'free') {
      skippedRef.current = true;
      // Defer one tick so the FlatList finishes any in-flight scroll before
      // we advance again.
      const t = setTimeout(() => onContinue?.(), 250);
      return () => clearTimeout(t);
    }
  }, [subscription?.tier, onContinue]);

  const selectedTierObj = PAID_TIERS.find(t => t.id === selectedTier);

  // ── Purchase handler ────────────────────────────────────────────────────
  const handleSubscribe = async () => {
    if (!user?.id) {
      // Shouldn't happen — user must auth on slide 5 before reaching slide 6.
      // But guard anyway so we don't blow up StoreKit with a null userId.
      Alert.alert('Sign in required', 'Please sign in before subscribing.');
      return;
    }
    if (!selectedTierObj) return;
    setPurchasing(true);
    try {
      const result = await purchaseSubscription(selectedTierObj.productId);
      if (result?.success) {
        hapticSuccess();
        // Small Alert is intentional — confirms the receipt before we
        // advance to the gift slide. Keeps the user oriented after the
        // StoreKit sheet dismisses.
        Alert.alert(
          'Subscription active',
          `Welcome to ${selectedTierObj.name}! ${
            selectedTierObj.gens === -1 ? 'Unlimited' : selectedTierObj.gens
          } wishes per week. Renews automatically — manage anytime in your Apple ID settings.`,
          [{ text: 'Continue', onPress: () => onContinue?.() }],
        );
      }
    } catch (e) {
      // user-cancel from StoreKit is silent (intentional dismiss)
      if (e?.code === 'user-cancelled' || e?.code === 'E_USER_CANCELLED') {
        return;
      }
      hapticError();
      Alert.alert(
        'Purchase Failed',
        e?.message || 'Something went wrong. Please try again.',
      );
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result?.restored > 0) {
        Alert.alert(
          'Restored',
          'Your previous subscription has been restored.',
          [{ text: 'Continue', onPress: () => onContinue?.() }],
        );
      } else {
        Alert.alert('Nothing to Restore', 'No previous purchases were found on this Apple ID.');
      }
    } catch (e) {
      Alert.alert('Restore Failed', e?.message || 'Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  const handleMaybeLater = () => {
    onContinue?.();
  };

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <View style={[styles.page, { width: screenWidth }]}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: insets.top + 24, paddingBottom: 16 },
        ]}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* Title */}
        <View style={styles.titleBlock}>
          <Text style={styles.title}>Unlock the{'\n'}full experience</Text>
          <Text style={styles.subtitle}>Pick the plan that fits your space.</Text>
        </View>

        {/* Tier cards — 2-up */}
        <View style={styles.tiersRow}>
          {PAID_TIERS.map(tier => (
            <TierCard
              key={tier.id}
              tier={tier}
              selected={selectedTier === tier.id}
              onSelect={setSelectedTier}
              disabled={purchasing || restoring}
            />
          ))}
        </View>

        {/* Feature bullets — compact */}
        <View style={styles.featuresBlock}>
          {FEATURES.map((feature, i) => (
            <View key={i} style={styles.featureRow}>
              <View style={styles.featureCheck}>
                <CheckIcon color={BLUE_LIGHT} size={11} />
              </View>
              <Text style={styles.featureText}>{feature}</Text>
            </View>
          ))}
        </View>

        {/* Subscribe CTA */}
        <TouchableOpacity
          style={[styles.subscribeBtn, (purchasing || restoring) && styles.btnDisabled]}
          onPress={handleSubscribe}
          activeOpacity={0.85}
          disabled={purchasing || restoring}
          accessibilityRole="button"
          accessibilityLabel="Subscribe"
        >
          {purchasing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.subscribeBtnText}>
              {selectedTierObj
                ? `Subscribe — ${selectedTierObj.priceLabel}`
                : 'Subscribe'}
            </Text>
          )}
        </TouchableOpacity>

        {/* Maybe later */}
        <TouchableOpacity
          onPress={handleMaybeLater}
          disabled={purchasing || restoring}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 20, right: 20 }}
          style={styles.maybeLaterWrap}
          accessibilityRole="button"
          accessibilityLabel="Maybe later"
        >
          <Text style={styles.maybeLaterText}>Maybe later</Text>
        </TouchableOpacity>

        {/* Footer — Terms · Restore · Privacy */}
        <View style={styles.footerRow}>
          <TouchableOpacity
            onPress={() => navigation?.navigate?.('TermsOfUse')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.footerLink}>Terms of Use</Text>
          </TouchableOpacity>
          <Text style={styles.footerDot}>·</Text>
          <TouchableOpacity
            onPress={handleRestore}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            disabled={restoring}
          >
            <Text style={styles.footerLink}>
              {restoring ? 'Restoring…' : 'Restore Purchase'}
            </Text>
          </TouchableOpacity>
          <Text style={styles.footerDot}>·</Text>
          <TouchableOpacity
            onPress={() => navigation?.navigate?.('PrivacyPolicy')}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Text style={styles.footerLink}>Privacy Policy</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Progress bars pinned to the bottom safe area */}
      <View style={[styles.progressWrap, { paddingBottom: insets.bottom + 12 }]}>
        {progressDots}
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  page: {
    flex: 1,
    backgroundColor: '#F8F8F8', // matches OnboardingAuthPage
  },
  scrollContent: {
    paddingHorizontal: 24,
    flexGrow: 1,
  },

  // Title block
  titleBlock: {
    alignItems: 'center',
    marginBottom: 18,
  },
  title: {
    fontSize: 30,
    fontWeight: '700',
    color: '#000000',
    textAlign: 'center',
    lineHeight: 36,
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 8,
    fontSize: 15,
    color: BLUE_LIGHT,
    textAlign: 'center',
    lineHeight: 20,
  },

  // Tier cards row
  tiersRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 18,
  },
  tierCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingTop: 18,
    paddingBottom: 14,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    position: 'relative',
    alignItems: 'center',
  },
  tierCardSelected: {
    borderColor: BLUE_LIGHT,
    borderWidth: 1.5,
    backgroundColor: '#F7FAFF',
  },

  // MOST POPULAR badge
  popularBadgeWrap: {
    position: 'absolute',
    top: -8,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  popularBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: BLUE_PRIMARY,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  popularBadgeUnselected: {
    backgroundColor: BLUE_LIGHT,
  },
  popularBadgeText: {
    color: '#FFFFFF',
    fontSize: 8,
    fontWeight: '700',
    letterSpacing: 0.8,
  },

  // Count
  tierCount: {
    alignItems: 'center',
    marginTop: 2,
    minHeight: 60,
    justifyContent: 'center',
  },
  tierBigNumber: {
    fontSize: 44,
    fontWeight: '500',
    color: '#0F172A',
    lineHeight: 48,
    letterSpacing: -1,
  },
  tierBigNumberSelected: {
    color: BLUE_LIGHT,
  },
  tierLabel: {
    fontSize: 12,
    color: 'rgba(15,23,42,0.72)',
    marginTop: 2,
  },
  tierLabelSelected: {
    color: BLUE_LIGHT,
  },

  tierDivider: {
    width: '70%',
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.08)',
    marginVertical: 8,
  },
  tierDividerSelected: {
    backgroundColor: BLUE_LIGHT,
  },

  tierPrice: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0F172A',
  },
  tierPriceSelected: {
    color: BLUE_PRIMARY,
  },
  tierSubprice: {
    fontSize: 11,
    color: 'rgba(15,23,42,0.44)',
    marginTop: 2,
  },
  tierSubpriceSelected: {
    color: BLUE_LIGHT,
  },
  tierTrust: {
    fontSize: 10,
    color: 'rgba(15,23,42,0.44)',
    marginTop: 6,
  },

  // Features
  featuresBlock: {
    marginBottom: 16,
    gap: 10,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  featureCheck: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#EAF2FB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: {
    flex: 1,
    fontSize: 13,
    color: 'rgba(15,23,42,0.72)',
    lineHeight: 18,
  },

  // Subscribe button
  subscribeBtn: {
    backgroundColor: BLUE_LIGHT,
    borderRadius: 26,
    height: 50,
    borderWidth: 1,
    borderColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  btnDisabled: { opacity: 0.6 },
  subscribeBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },

  // Maybe later
  maybeLaterWrap: {
    alignSelf: 'center',
    marginTop: 14,
    paddingVertical: 6,
  },
  maybeLaterText: {
    color: BLUE_PRIMARY,
    fontSize: 14,
    fontWeight: '500',
  },

  // Footer
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 18,
    flexWrap: 'wrap',
  },
  footerLink: {
    fontSize: 11,
    color: 'rgba(15,23,42,0.44)',
  },
  footerDot: {
    fontSize: 11,
    color: 'rgba(15,23,42,0.28)',
  },

  // Progress bars (bottom safe area)
  progressWrap: {
    paddingHorizontal: 28,
    paddingTop: 8,
    backgroundColor: '#F8F8F8',
  },
});
