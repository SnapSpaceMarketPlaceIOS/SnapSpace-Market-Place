import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path, Polyline, Circle, Line, Rect, Polygon } from 'react-native-svg';
import { colors } from '../constants/colors';
import { colors as C } from '../constants/theme';
import { space, radius, shadow, typeScale, fontWeight, layout, uiColors } from '../constants/tokens';
import { Button, Badge } from '../components/ds';
import { useSubscription, PAID_TIERS } from '../context/SubscriptionContext';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#666" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

function SparkleIcon({ size = 28, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </Svg>
  );
}

function CheckIcon({ color = colors.bluePrimary }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

function CrownIcon({ size = 32, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M2 4l3 12h14l3-12-6 7-4-9-4 9-6-7z" />
      <Path d="M5 16h14v2H5z" />
    </Svg>
  );
}

function InfinityIcon({ size = 16, color = colors.bluePrimary }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18.178 8c5.096 0 5.096 8 0 8-5.095 0-7.133-8-12.739-8-4.585 0-4.585 8 0 8 5.606 0 7.644-8 12.74-8z" />
    </Svg>
  );
}

// ── Feature lists per tier ───────────────────────────────────────────────────

const TIER_FEATURES = {
  basic: [
    '25 AI room designs per month',
    'All design styles',
    'Product recommendations',
    'Save & share designs',
  ],
  pro: [
    '50 AI room designs per month',
    'All design styles',
    'Product recommendations',
    'Save & share designs',
    'Priority generation queue',
  ],
  premium: [
    '75 AI room designs per month',
    'All design styles',
    'Product recommendations',
    'Save & share designs',
    'Priority generation queue',
    'Early access to new styles',
  ],
};

// ── Component ────────────────────────────────────────────────────────────────

export default function PaywallScreen({ navigation }) {
  const {
    subscription,
    devForcePaywall,
    purchaseSubscription,
    restorePurchases,
  } = useSubscription();

  const [selectedTier, setSelectedTier] = useState('pro'); // default highlight
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const handleSubscribe = async () => {
    const tier = PAID_TIERS.find(t => t.id === selectedTier);
    if (!tier) return;
    setPurchasing(true);
    try {
      const result = await purchaseSubscription(tier.productId);
      if (result?.success) {
        if (__DEV__ && result.dev) {
          Alert.alert('Dev Mode', `Mock subscribed to ${tier.name}`, [
            { text: 'OK', onPress: () => navigation.goBack() },
          ]);
        } else {
          navigation.goBack();
        }
      }
    } catch (e) {
      Alert.alert('Purchase Failed', e.message);
    } finally {
      setPurchasing(false);
    }
  };

  const handleRestore = async () => {
    setRestoring(true);
    try {
      const result = await restorePurchases();
      if (result?.restored > 0) {
        Alert.alert('Restored', 'Your subscription has been restored.', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      } else {
        Alert.alert('Nothing to Restore', 'No previous subscriptions found for this account.');
      }
    } catch (e) {
      Alert.alert('Restore Failed', e.message);
    } finally {
      setRestoring(false);
    }
  };

  const selected = PAID_TIERS.find(t => t.id === selectedTier);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safe} edges={['top']}>
        {/* ── Header ──────────────────────────────────────────── */}
        <View style={styles.header}>
          <View style={{ width: 44 }} />
          {__DEV__ && devForcePaywall && (
            <Badge variant="status" label="DEV MODE" />
          )}
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.closeBtn}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <CloseIcon />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          bounces={false}
        >
          {/* ── Hero ───────────────────────────────────────────── */}
          <LinearGradient
            colors={[colors.heroStart, colors.heroEnd]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}
          >
            <View style={styles.heroIconWrap}>
              <CrownIcon size={36} color="#fff" />
            </View>
            <Text style={styles.heroTitle}>Unlock More Designs</Text>
            <Text style={styles.heroSubtitle}>
              Transform any room with AI-powered interior design. Choose a plan that fits your creative needs.
            </Text>
          </LinearGradient>

          {/* ── Quota indicator ────────────────────────────────── */}
          <View style={styles.quotaBar}>
            <View style={styles.quotaInfo}>
              <Text style={styles.quotaLabel}>Free generations used</Text>
              <Text style={styles.quotaCount}>
                {subscription.generationsUsed} of {subscription.tier === 'free' ? 5 : subscription.quotaLimit}
              </Text>
            </View>
            <View style={styles.quotaTrack}>
              <View
                style={[
                  styles.quotaFill,
                  {
                    width: `${Math.min(100, (subscription.generationsUsed / (subscription.tier === 'free' ? 5 : subscription.quotaLimit)) * 100)}%`,
                  },
                ]}
              />
            </View>
          </View>

          {/* ── Tier cards ─────────────────────────────────────── */}
          <View style={styles.tiersSection}>
            {PAID_TIERS.map((tier) => {
              const isSelected = selectedTier === tier.id;
              const features = TIER_FEATURES[tier.id] || [];

              return (
                <TouchableOpacity
                  key={tier.id}
                  activeOpacity={0.7}
                  onPress={() => setSelectedTier(tier.id)}
                  style={[
                    styles.tierCard,
                    isSelected && styles.tierCardSelected,
                  ]}
                >
                  {/* Popular badge */}
                  {tier.popular && (
                    <View style={styles.popularBadge}>
                      <SparkleIcon size={12} color="#fff" />
                      <Text style={styles.popularText}>MOST POPULAR</Text>
                    </View>
                  )}

                  {/* Selection indicator */}
                  <View style={styles.tierHeader}>
                    <View style={[styles.radio, isSelected && styles.radioSelected]}>
                      {isSelected && <View style={styles.radioDot} />}
                    </View>
                    <View style={styles.tierTitleRow}>
                      <Text style={[styles.tierName, isSelected && styles.tierNameSelected]}>
                        {tier.name}
                      </Text>
                      {subscription.tier === tier.id && (
                        <Badge variant="status" label="CURRENT" />
                      )}
                    </View>
                    <Text style={[styles.tierPrice, isSelected && styles.tierPriceSelected]}>
                      {tier.priceLabel}
                    </Text>
                  </View>

                  {/* Generation count */}
                  <View style={styles.genCountRow}>
                    <Text style={styles.genCountNum}>{tier.gens}</Text>
                    <Text style={styles.genCountLabel}> designs per month</Text>
                  </View>

                  {/* Features (only show when selected) */}
                  {isSelected && (
                    <View style={styles.featureList}>
                      {features.map((feat, i) => (
                        <View key={i} style={styles.featureRow}>
                          <CheckIcon color={colors.bluePrimary} />
                          <Text style={styles.featureText}>{feat}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Per-design cost */}
                  <Text style={styles.perDesign}>
                    ${(tier.price / tier.gens).toFixed(2)} per design
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Subscribe CTA ──────────────────────────────────── */}
          <View style={styles.ctaSection}>
            <Button
              variant="primary"
              label={
                purchasing
                  ? 'Processing…'
                  : `Subscribe to ${selected?.name || 'Pro'} — ${selected?.priceLabel || '$12.99/mo'}`
              }
              onPress={handleSubscribe}
              fullWidth
              loading={purchasing}
              disabled={purchasing}
            />
          </View>

          {/* ── Fine print ─────────────────────────────────────── */}
          <View style={styles.finePrint}>
            <Text style={styles.finePrintText}>
              Payment will be charged to your Apple ID account at confirmation of purchase.
              Subscription automatically renews unless cancelled at least 24 hours before
              the end of the current period. You can manage or cancel your subscription in
              your device's Settings {'>'} Apple ID {'>'} Subscriptions.
            </Text>

            <View style={styles.finePrintLinks}>
              <TouchableOpacity onPress={() => navigation.navigate('TermsOfUse')}>
                <Text style={styles.finePrintLink}>Terms of Use</Text>
              </TouchableOpacity>
              <Text style={styles.finePrintDot}>·</Text>
              <TouchableOpacity onPress={() => navigation.navigate('PrivacyPolicy')}>
                <Text style={styles.finePrintLink}>Privacy Policy</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Restore ────────────────────────────────────────── */}
          <TouchableOpacity
            onPress={handleRestore}
            disabled={restoring}
            style={styles.restoreBtn}
          >
            <Text style={styles.restoreText}>
              {restoring ? 'Restoring…' : 'Restore Purchases'}
            </Text>
          </TouchableOpacity>

          <View style={{ height: 40 }} />
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: C.bg,
  },
  safe: {
    flex: 1,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPaddingH,
    paddingVertical: space.sm,
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Scroll
  scroll: {
    paddingBottom: layout.screenPaddingBottom,
  },

  // Hero
  hero: {
    marginHorizontal: layout.screenPaddingH,
    borderRadius: radius.xl,
    paddingVertical: space['2xl'],
    paddingHorizontal: space.xl,
    alignItems: 'center',
  },
  heroIconWrap: {
    width: 64,
    height: 64,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.base,
  },
  heroTitle: {
    ...typeScale.display,
    color: '#fff',
    textAlign: 'center',
    marginBottom: space.sm,
  },
  heroSubtitle: {
    ...typeScale.body,
    color: 'rgba(255,255,255,0.8)',
    textAlign: 'center',
    lineHeight: 22,
  },

  // Quota bar
  quotaBar: {
    marginHorizontal: layout.screenPaddingH,
    marginTop: space.xl,
    marginBottom: space.lg,
    backgroundColor: C.surface,
    borderRadius: radius.md,
    padding: space.base,
    ...shadow.low,
  },
  quotaInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: space.sm,
  },
  quotaLabel: {
    ...typeScale.caption,
    color: C.textSecondary,
  },
  quotaCount: {
    ...typeScale.headline,
    color: C.textPrimary,
  },
  quotaTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: uiColors.surface2,
    overflow: 'hidden',
  },
  quotaFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.bluePrimary,
  },

  // Tiers section
  tiersSection: {
    paddingHorizontal: layout.screenPaddingH,
    gap: space.md,
  },

  // Tier card
  tierCard: {
    borderRadius: radius.xl,
    borderWidth: 2,
    borderColor: uiColors.border,
    backgroundColor: C.bg,
    padding: space.base,
    overflow: 'hidden',
  },
  tierCardSelected: {
    borderColor: colors.bluePrimary,
    backgroundColor: '#F0F7FF',
  },

  // Popular badge
  popularBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.bluePrimary,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderBottomLeftRadius: radius.sm,
    borderTopRightRadius: radius.xl - 2,
    gap: 4,
  },
  popularText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#fff',
    letterSpacing: 0.8,
  },

  // Tier header
  tierHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: uiColors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: colors.bluePrimary,
  },
  radioDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: colors.bluePrimary,
  },
  tierTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  tierName: {
    ...typeScale.headline,
    color: C.textPrimary,
  },
  tierNameSelected: {
    color: colors.bluePrimary,
  },
  tierPrice: {
    ...typeScale.price,
    color: C.textPrimary,
  },
  tierPriceSelected: {
    color: colors.bluePrimary,
  },

  // Generation count
  genCountRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: space.sm,
    marginLeft: 34, // align with text after radio
  },
  genCountNum: {
    fontSize: 28,
    fontWeight: fontWeight.bold,
    color: C.textPrimary,
  },
  genCountLabel: {
    ...typeScale.body,
    color: C.textSecondary,
  },

  // Features
  featureList: {
    marginTop: space.md,
    marginLeft: 34,
    gap: space.sm,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
  },
  featureText: {
    ...typeScale.body,
    color: C.textPrimary,
    flex: 1,
  },

  // Per-design cost
  perDesign: {
    ...typeScale.caption,
    color: C.textTertiary,
    marginTop: space.sm,
    marginLeft: 34,
  },

  // CTA
  ctaSection: {
    paddingHorizontal: layout.screenPaddingH,
    marginTop: space.xl,
  },

  // Fine print
  finePrint: {
    paddingHorizontal: layout.screenPaddingH,
    marginTop: space.lg,
  },
  finePrintText: {
    ...typeScale.caption,
    color: C.textTertiary,
    textAlign: 'center',
    lineHeight: 18,
  },
  finePrintLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: space.md,
    gap: space.sm,
  },
  finePrintLink: {
    ...typeScale.caption,
    color: colors.bluePrimary,
    fontWeight: fontWeight.semibold,
  },
  finePrintDot: {
    color: C.textTertiary,
  },

  // Restore
  restoreBtn: {
    alignSelf: 'center',
    marginTop: space.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
  },
  restoreText: {
    ...typeScale.button,
    color: C.textSecondary,
  },
});
