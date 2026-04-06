import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Dimensions,
  Share,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Circle, Polyline, Path } from 'react-native-svg';
import { colors } from '../constants/colors';
import { space, radius, fontWeight, layout, uiColors } from '../constants/tokens';
import { useSubscription, PAID_TIERS } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import { getReferralCode } from '../services/subscriptionService';

const { width: SCREEN_W } = Dimensions.get('window');
const BLUE = colors.bluePrimary;

// Token card width: screen - screenPadding*2 - contentBox padding*2 - gaps between 3 cards
const CONTENT_PAD = space.base;
const TOKEN_CARD_W = (SCREEN_W - 2 * layout.screenPaddingH - 2 * CONTENT_PAD - 2 * space.sm) / 3;

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

function ShareIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8" />
      <Polyline points="16 6 12 2 8 6" />
      <Line x1={12} y1={2} x2={12} y2={15} />
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

// ── Token Package Card ───────────────────────────────────────────────────────

function TokenPackageCard({ pkg, selected, onSelect }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onSelect(pkg.id)}
      style={[
        styles.tokenCard,
        selected && styles.tokenCardSelected,
      ]}
    >
      <Text style={[styles.tokenCount, selected && styles.tokenCountSelected]}>{pkg.tokens}</Text>
      <Text style={styles.tokenLabel}>tokens</Text>
      <Text style={[styles.tokenPrice, selected && styles.tokenPriceSelected]}>{pkg.price}</Text>
    </TouchableOpacity>
  );
}

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
        <Text style={styles.genLabel}> designs per month</Text>
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
  const {
    subscription, purchaseSubscription, restorePurchases,
    tokenBalance, purchaseTokens, TOKEN_PACKAGES,
  } = useSubscription();
  const { user } = useAuth();

  const [activeTab, setActiveTab] = useState('tokens'); // 'tokens' | 'subscriptions'
  const [selectedTier, setSelectedTier] = useState('premium');
  const [selectedTokenPkg, setSelectedTokenPkg] = useState('snapspace_tokens_10');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const selectedSub = PAID_TIERS.find(t => t.id === selectedTier);
  const selectedToken = TOKEN_PACKAGES.find(p => p.id === selectedTokenPkg);
  const usedCount = subscription.generationsUsed;
  const totalFree = subscription.tier === 'free' ? 5 : subscription.quotaLimit;
  const progressPct = totalFree === -1 ? 0 : Math.min(1, usedCount / totalFree);

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      if (activeTab === 'tokens') {
        if (!selectedToken) return;
        const result = await purchaseTokens(selectedToken.id);
        if (result?.success) navigation.goBack();
      } else {
        if (!selectedSub) return;
        const result = await purchaseSubscription(selectedSub.productId);
        if (result?.success) navigation.goBack();
      }
    } catch (e) {
      Alert.alert('Purchase Failed', e.message);
    } finally {
      setPurchasing(false);
    }
  };

  const handleShareReferral = async () => {
    try {
      if (!user?.id) {
        Alert.alert('Sign In Required', 'Please sign in to get your referral code.');
        return;
      }
      const code = await getReferralCode(user.id);
      await Share.share({
        message: `Try SnapSpace — AI room design! Use my referral code ${code} when you sign up and we both get free credits.`,
      });
    } catch (e) {
      if (e.message !== 'User did not share') {
        console.warn('[Paywall] referral share failed:', e.message);
      }
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

      {/* ── Progress bar card ─────────────────────────────────────── */}
      <View style={styles.progressCard}>
        <View style={styles.progressLabelRow}>
          <Text style={styles.progressLabel}>Free generations used</Text>
          <Text style={styles.progressCount}>
            {totalFree === -1 ? 'Unlimited' : `${usedCount}/${totalFree}`}
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
        </View>
        {tokenBalance > 0 && (
          <Text style={styles.tokenBalanceLabel}>
            Token balance: {tokenBalance}
          </Text>
        )}
      </View>

      {/* ── Toggle pill ──────────────────────────────────────────── */}
      <View style={styles.toggleContainer}>
        <View style={styles.togglePill}>
          <TouchableOpacity
            style={[styles.toggleTab, activeTab === 'tokens' && styles.toggleTabActive]}
            onPress={() => setActiveTab('tokens')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, activeTab === 'tokens' && styles.toggleTextActive]}>
              Buy Tokens
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.toggleTab, activeTab === 'subscriptions' && styles.toggleTabActive]}
            onPress={() => setActiveTab('subscriptions')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleText, activeTab === 'subscriptions' && styles.toggleTextActive]}>
              Subscribe Monthly
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Scrollable content ───────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Referral banner ──────────────────────────────────────── */}
        <TouchableOpacity
          style={styles.referralBanner}
          activeOpacity={0.8}
          onPress={handleShareReferral}
        >
          <View style={styles.referralTextWrap}>
            <Text style={styles.referralTitle}>Refer a friend</Text>
            <Text style={styles.referralSub}>Get 2 Free Credits</Text>
          </View>
          <ShareIcon />
        </TouchableOpacity>

        {/* ── Content box ──────────────────────────────────────────── */}
        <View style={styles.contentBox}>
          {activeTab === 'tokens' ? (
            /* ── Token grid (2×3) ─────────────────────────────────── */
            <View style={styles.tokenGrid}>
              {TOKEN_PACKAGES.map(pkg => (
                <TokenPackageCard
                  key={pkg.id}
                  pkg={pkg}
                  selected={selectedTokenPkg === pkg.id}
                  onSelect={setSelectedTokenPkg}
                />
              ))}
            </View>
          ) : (
            /* ── Subscription cards ───────────────────────────────── */
            <View style={styles.subCards}>
              {PAID_TIERS.map(tier => (
                <TierCard
                  key={tier.id}
                  tier={tier}
                  selected={selectedTier === tier.id}
                  onSelect={setSelectedTier}
                />
              ))}
            </View>
          )}
        </View>

        {/* ── Fine print + legal links ────────────────────────────── */}
        <View style={styles.legalSection}>
          <Text style={styles.finePrint}>
            {activeTab === 'tokens'
              ? 'Token purchases are one-time, non-refundable consumable purchases. Each token equals one AI design generation.'
              : 'Payment will be charged to your Apple ID account at confirmation of purchase. Subscription automatically renews unless cancelled at least 24 hours before the end of the current period. You can manage or cancel your subscription in your device\'s Settings > Apple ID > Subscriptions.'}
          </Text>
          <View style={styles.legalLinks}>
            <TouchableOpacity onPress={() => navigation.navigate('TermsOfUse')}>
              <Text style={styles.legalLink}>Terms of Use</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>·</Text>
            <TouchableOpacity onPress={() => navigation.navigate('PrivacyPolicy')}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
            <Text style={styles.legalDot}>·</Text>
            <TouchableOpacity
              onPress={async () => {
                setRestoring(true);
                try {
                  const result = await restorePurchases();
                  if (result?.restored > 0) {
                    Alert.alert('Restored', 'Your subscription has been restored.');
                    navigation.goBack();
                  } else {
                    Alert.alert('Nothing to Restore', 'No active subscriptions found for this account.');
                  }
                } catch (e) {
                  Alert.alert('Restore Failed', e.message);
                } finally {
                  setRestoring(false);
                }
              }}
              disabled={restoring}
            >
              <Text style={styles.legalLink}>{restoring ? 'Restoring...' : 'Restore Purchases'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={{ height: 16 }} />
      </ScrollView>

      {/* ── Sticky CTA ────────────────────────────────────────────── */}
      <View style={styles.stickyBar}>
        <TouchableOpacity
          onPress={handlePurchase}
          disabled={purchasing}
          activeOpacity={0.85}
          style={[styles.cta, purchasing && styles.ctaDisabled]}
        >
          <Text style={styles.ctaText}>
            {purchasing
              ? 'Processing...'
              : activeTab === 'tokens'
                ? `Snap Space Tokens: ${selectedToken?.tokens ?? ''} | ${selectedToken?.price ?? ''}`
                : `Subscribe to ${selectedSub?.name ?? 'Pro'} — ${selectedSub?.priceLabel ?? '$12.99/mo'}`}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

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

  // ── Progress card
  progressCard: {
    marginHorizontal: layout.screenPaddingH,
    marginBottom: space.md,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F3F4F6',
    borderRadius: 8.5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 6,
    elevation: 4,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  progressLabel: {
    fontSize: 13,
    fontWeight: fontWeight.regular,
    color: '#6B7280',
  },
  progressCount: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    color: '#111827',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#67ACE9',
    shadowColor: '#67ACE9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 4,
  },
  tokenBalanceLabel: {
    fontSize: 12,
    fontWeight: fontWeight.semibold,
    color: BLUE,
    marginTop: 8,
  },

  // ── Toggle pill
  toggleContainer: {
    paddingHorizontal: layout.screenPaddingH,
    marginBottom: space.md,
  },
  togglePill: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 24,
    padding: 3,
  },
  toggleTab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 22,
    alignItems: 'center',
  },
  toggleTabActive: {
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: '#9CA3AF',
  },
  toggleTextActive: {
    color: '#111827',
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

  // ── Referral banner
  referralBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BLUE,
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  referralTextWrap: {
    flex: 1,
  },
  referralTitle: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    color: '#fff',
  },
  referralSub: {
    fontSize: 13,
    fontWeight: fontWeight.regular,
    color: 'rgba(255,255,255,0.8)',
    marginTop: 2,
  },

  // ── Content box (gray container)
  contentBox: {
    backgroundColor: '#F3F4F6',
    borderRadius: 14,
    padding: CONTENT_PAD,
  },

  // ── Token grid
  tokenGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  tokenCard: {
    width: TOKEN_CARD_W,
    paddingVertical: 16,
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tokenCardSelected: {
    borderWidth: 2,
    borderColor: BLUE,
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  tokenCount: {
    fontSize: 24,
    fontWeight: fontWeight.bold,
    color: '#111827',
  },
  tokenCountSelected: {
    color: BLUE,
  },
  tokenLabel: {
    fontSize: 11,
    fontWeight: fontWeight.medium,
    color: '#9CA3AF',
    marginTop: 2,
  },
  tokenPrice: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: '#374151',
    marginTop: 6,
  },
  tokenPriceSelected: {
    color: BLUE,
  },

  // ── Subscription cards
  subCards: {
    gap: 12,
  },

  // ── Tier card
  card: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
    padding: space.base,
    overflow: 'hidden',
  },
  cardSelected: {
    borderWidth: 2,
    borderColor: BLUE,
    backgroundColor: '#F0F7FF',
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
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
    fontWeight: fontWeight.semibold,
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

  // ── Legal section
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

  // ── Sticky CTA bar
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
