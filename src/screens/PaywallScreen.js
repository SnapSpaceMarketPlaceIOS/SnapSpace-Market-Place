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
import Svg, { Line, Circle, Polyline } from 'react-native-svg';
import { colors } from '../constants/colors';
import { colors as C } from '../constants/theme';
import { space, radius, fontWeight, layout, uiColors } from '../constants/tokens';
import { useSubscription, PAID_TIERS } from '../context/SubscriptionContext';

const { width: SCREEN_W } = Dimensions.get('window');

// ── Icons ────────────────────────────────────────────────────────────────────

function CloseIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#999" strokeWidth={2.2} strokeLinecap="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

function CircleBullet() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} style={{ marginTop: 2 }}>
      <Circle cx={12} cy={12} r={10} />
    </Svg>
  );
}

// ── Feature lists per tier ────────────────────────────────────────────────────

const TIER_FEATURES = {
  basic: [
    '25 AI room designs per month',
    'Product recommendations',
    'Save & share designs',
  ],
  pro: [
    '50 AI room designs per month',
    'Product recommendations',
    'Save & share designs',
    'Priority generation queue',
  ],
  premium: [
    'Unlimited AI room designs per month',
    'Product recommendations',
    'Priority generation queue',
    'Early access to new AI models',
    'Faster Generation Time',
  ],
};

// ── Tier Card ─────────────────────────────────────────────────────────────────

function TierCard({ tier, selected, onSelect }) {
  const features = TIER_FEATURES[tier.id] || [];
  const isUnlimited = tier.displayLabel === 'Unlimited';

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onSelect(tier.id)}
      style={[styles.card, selected && styles.cardSelected]}
    >
      {/* Most popular pill */}
      {tier.popular && (
        <View style={styles.popularPill}>
          <Text style={styles.popularText}>MOST POPULAR</Text>
        </View>
      )}

      {/* Row: radio + name + price */}
      <View style={styles.cardHeader}>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected && <View style={styles.radioDot} />}
        </View>
        <Text style={[styles.tierName, selected && styles.tierNameSelected]}>
          {tier.name}
        </Text>
        <Text style={[styles.tierPrice, selected && styles.tierPriceSelected]}>
          {tier.priceLabel}
        </Text>
      </View>

      {/* Gen count */}
      <View style={styles.genRow}>
        <Text style={[styles.genCount, isUnlimited && styles.genCountUnlimited]}>
          {tier.displayLabel}
        </Text>
        {!isUnlimited && (
          <Text style={styles.genLabel}> designs per month</Text>
        )}
        {isUnlimited && (
          <Text style={styles.genLabel}> designs per month</Text>
        )}
      </View>

      {/* Feature list — only when selected */}
      {selected && (
        <View style={styles.featureList}>
          {features.map((feat, i) => (
            <View key={i} style={styles.featureRow}>
              <CircleBullet />
              <Text style={styles.featureText}>{feat}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────

export default function PaywallScreen({ navigation }) {
  const { subscription, purchaseSubscription } = useSubscription();

  const [selectedTier, setSelectedTier] = useState('premium');
  const [purchasing, setPurchasing] = useState(false);

  const selected = PAID_TIERS.find(t => t.id === selectedTier);
  const usedCount = subscription.generationsUsed;
  const totalFree = subscription.tier === 'free' ? 5 : subscription.quotaLimit;
  const progressPct = Math.min(1, usedCount / totalFree);

  const handleSubscribe = async () => {
    if (!selected) return;
    setPurchasing(true);
    try {
      const result = await purchaseSubscription(selected.productId);
      if (result?.success) {
        navigation.goBack();
      }
    } catch (e) {
      Alert.alert('Purchase Failed', e.message);
    } finally {
      setPurchasing(false);
    }
  };

return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>

      {/* ── Wordmark header ───────────────────────────────────────── */}
      <View style={styles.header}>
        <View style={{ width: 40 }} />
        <Text style={styles.wordmark}>SnapSpace</Text>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.closeBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <CloseIcon />
        </TouchableOpacity>
      </View>

      <Text style={styles.subtitle}>Shop and Design your room with AI</Text>

      {/* ── Progress bar ──────────────────────────────────────────── */}
      <View style={styles.progressSection}>
        <View style={styles.progressLabelRow}>
          <Text style={styles.progressLabel}>Free generations used</Text>
          <Text style={styles.progressCount}>{usedCount}/{totalFree}</Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
        </View>
      </View>

      {/* ── Tier cards + legal (scrollable) ──────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {PAID_TIERS.map(tier => (
          <TierCard
            key={tier.id}
            tier={tier}
            selected={selectedTier === tier.id}
            onSelect={setSelectedTier}
          />
        ))}

        {/* ── Fine print + legal links scroll with cards ─────────── */}
        <View style={styles.legalSection}>
          <Text style={styles.finePrint}>
            Payment will be charged to your Apple ID account at confirmation of purchase.
            Subscription automatically renews unless cancelled at least 24 hours before the
            end of the current period. You can manage or cancel your subscription in your
            device's Settings {'>'} Apple ID {'>'} Subscriptions.
          </Text>
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => navigation.navigate('TermsOfUse')}>
              <Text style={styles.legalLink}>Terms of Use</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>·</Text>
            <TouchableOpacity onPress={() => navigation.navigate('PrivacyPolicy')}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* breathing room above sticky CTA */}
        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Sticky CTA only ───────────────────────────────────────── */}
      <View style={styles.stickyBar}>
        <TouchableOpacity
          onPress={handleSubscribe}
          disabled={purchasing}
          activeOpacity={0.85}
          style={[styles.cta, purchasing && styles.ctaDisabled]}
        >
          <Text style={styles.ctaText}>
            {purchasing
              ? 'Processing…'
              : `Subscribe to ${selected?.name ?? 'Pro'} — ${selected?.priceLabel ?? '$12.99/mo'}`}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const BLUE = colors.bluePrimary;

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#fff',
  },

  // ── Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: space.sm,
    paddingBottom: space.xs,
  },
  wordmark: {
    fontSize: 24,
    fontWeight: fontWeight.xbold,
    color: '#111827',
    letterSpacing: -0.5,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: fontWeight.regular,
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: layout.screenPaddingH,
    marginBottom: space.lg,
  },

  // ── Progress
  progressSection: {
    paddingHorizontal: layout.screenPaddingH,
    marginBottom: space.lg,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: fontWeight.regular,
    color: '#6B7280',
  },
  progressCount: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    color: '#111827',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: BLUE,
  },

  // ── Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: space.xs,
    gap: 12,
  },

  // ── Tier card
  card: {
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
    padding: space.base,
    overflow: 'hidden',
  },
  cardSelected: {
    borderColor: BLUE,
    backgroundColor: '#F0F7FF',
  },

  // Popular pill
  popularPill: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: BLUE,
    paddingVertical: 3,
    paddingHorizontal: 10,
    borderBottomLeftRadius: 10,
    borderTopRightRadius: 12,
  },
  popularText: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#fff',
    letterSpacing: 0.6,
  },

  // Card header row
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#D1D5DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioSelected: {
    borderColor: BLUE,
  },
  radioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: BLUE,
  },
  tierName: {
    flex: 1,
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: '#111827',
  },
  tierNameSelected: {
    color: BLUE,
  },
  tierPrice: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    color: '#111827',
  },
  tierPriceSelected: {
    color: BLUE,
  },

  // Gen count
  genRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginTop: 8,
    marginLeft: 30,
  },
  genCount: {
    fontSize: 32,
    fontWeight: fontWeight.xbold,
    color: BLUE,
    lineHeight: 38,
  },
  genCountUnlimited: {
    fontSize: 28,
  },
  genLabel: {
    fontSize: 14,
    fontWeight: fontWeight.regular,
    color: '#6B7280',
    marginLeft: 2,
  },

  // Features
  featureList: {
    marginTop: 12,
    marginLeft: 30,
    gap: 8,
  },
  featureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  featureText: {
    flex: 1,
    fontSize: 14,
    fontWeight: fontWeight.regular,
    color: '#374151',
    lineHeight: 20,
  },

  // ── Legal section (scrolls with content)
  legalSection: {
    marginTop: space.xl,
    paddingHorizontal: 4,
    gap: 10,
  },
  finePrint: {
    fontSize: 11,
    fontWeight: fontWeight.regular,
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 16,
  },
  legalLinks: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
  },
  legalLink: {
    fontSize: 12,
    fontWeight: fontWeight.medium,
    color: BLUE,
  },
  legalDot: {
    fontSize: 12,
    color: '#9CA3AF',
  },

  // ── Sticky CTA bar (button only)
  stickyBar: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: space.md,
    paddingBottom: space.md,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: '#fff',
  },
  cta: {
    backgroundColor: BLUE,
    borderRadius: 28,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaDisabled: {
    opacity: 0.6,
  },
  ctaText: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: '#fff',
    letterSpacing: -0.2,
  },
});
