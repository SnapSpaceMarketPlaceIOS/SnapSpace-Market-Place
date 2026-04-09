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
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';

// Enable LayoutAnimation on Android
if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Line, Circle, Polyline, Path } from 'react-native-svg';
import { colors } from '../constants/colors';
import { colors as C } from '../constants/theme';
import { space, radius, fontWeight, layout, uiColors } from '../constants/tokens';
import { useSubscription, PAID_TIERS, TOKEN_PACKAGES } from '../context/SubscriptionContext';
import { useAuth } from '../context/AuthContext';
import { getReferralCode } from '../services/subscriptionService';

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

function ShareIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
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

// ── Tier Card (Subscribe Monthly view) ───────────────────────────────────────

function TierCard({ tier, selected, onSelect }) {
  const isUnlimited = tier.displayLabel === 'Unlimited';
  const features = TIER_FEATURES[tier.id] || [];

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={() => onSelect(tier.id)}
      style={[styles.subCard, selected && styles.subCardSelected]}
    >
      {/* ── Compact header row ── */}
      <View style={styles.subCardHeader}>
        <View style={[styles.radio, selected && styles.radioSelected]}>
          {selected && <View style={styles.radioDot} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.subTierName}>{tier.name}</Text>
          <View style={styles.subGenRow}>
            <Text style={[styles.subGenCount, isUnlimited && styles.subGenCountUnlimited]}>
              {tier.displayLabel}
            </Text>
            <Text style={styles.subGenLabel}> designs/mo</Text>
          </View>
        </View>
        <Text style={[styles.subTierPrice, selected && styles.subTierPriceSelected]}>
          {tier.priceLabel}
        </Text>
      </View>

      {/* ── Accordion: features drop down when selected ── */}
      {selected && features.length > 0 && (
        <View style={styles.subFeaturesContainer}>
          <View style={styles.subFeaturesDivider} />
          {features.map((feature, i) => (
            <View key={i} style={styles.subFeatureRow}>
              <Svg
                width={14} height={14} viewBox="0 0 24 24"
                fill="none" stroke="#0B6DC3" strokeWidth={2.5}
                strokeLinecap="round" strokeLinejoin="round"
              >
                <Polyline points="20 6 9 17 4 12" />
              </Svg>
              <Text style={styles.subFeatureText}>{feature}</Text>
            </View>
          ))}
        </View>
      )}
    </TouchableOpacity>
  );
}

// ── Token Package Card (Buy Tokens view) ─────────────────────────────────────

function TokenPackageCard({ pkg, selected, onSelect }) {
  return (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={() => onSelect(pkg.id)}
      style={[styles.tokenCard, selected && styles.tokenCardSelected]}
    >
      <Text style={[styles.tokenCount, selected && styles.tokenCountSelected]}>
        {pkg.tokens} Tokens
      </Text>
      <Text style={[styles.tokenPrice, selected && styles.tokenPriceSelected]}>
        {pkg.price}
      </Text>
    </TouchableOpacity>
  );
}

// ── Toggle Pill ──────────────────────────────────────────────────────────────

function TogglePill({ activeTab, onTabChange }) {
  return (
    <View style={styles.toggleContainer}>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onTabChange('tokens')}
        style={[styles.toggleTab, activeTab === 'tokens' && styles.toggleTabActive]}
      >
        <Text style={[styles.toggleText, activeTab === 'tokens' && styles.toggleTextActive]}>
          Buy Tokens
        </Text>
      </TouchableOpacity>
      <TouchableOpacity
        activeOpacity={0.7}
        onPress={() => onTabChange('subscribe')}
        style={[styles.toggleTab, activeTab === 'subscribe' && styles.toggleTabActive]}
      >
        <Text style={[styles.toggleText, activeTab === 'subscribe' && styles.toggleTextActive]}>
          Subscribe Monthly
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

  const [activeTab, setActiveTab] = useState('tokens'); // tokens is primary/default
  const [selectedTier, setSelectedTier] = useState('premium');
  const [selectedToken, setSelectedToken] = useState('snapspace_tokens_4');
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  // Animate card expand/collapse when tier selection changes
  const handleSelectTier = (tierId) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedTier(tierId);
  };

  // Quota progress
  const usedCount = subscription.generationsUsed;
  const totalFree = subscription.tier === 'free' ? 5 : subscription.quotaLimit;
  const progressPct = Math.min(1, usedCount / totalFree);

  // Selected items
  const selectedSubTier = PAID_TIERS.find(t => t.id === selectedTier);
  const selectedTokenPkg = TOKEN_PACKAGES.find(p => p.id === selectedToken);

  // ── Purchase handlers ──────────────────────────────────────────────────

  const handlePurchase = async () => {
    setPurchasing(true);
    try {
      if (activeTab === 'tokens') {
        const result = await purchaseTokens(selectedToken);
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
    : activeTab === 'tokens'
      ? `HomeGenie Tokens: ${selectedTokenPkg?.tokens ?? 4}`
      : 'Subscribe Monthly';

  const ctaPrice = activeTab === 'tokens'
    ? selectedTokenPkg?.price ?? '$0.99'
    : selectedSubTier?.priceLabel ?? '$19.99/mo';

  return (
    <View style={styles.overlay}>
    <SafeAreaView style={styles.root} edges={['top', 'bottom']}>

      {/* ── Everything scrolls together ───────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        bounces={false}
        alwaysBounceVertical={false}
        overScrollMode="never"
      >
        {/* ── Wordmark header ─────────────────────────────────────── */}
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

        <Text style={styles.subtitle}>Shop and Design your room with AI...</Text>

        {/* ── Progress bar card ───────────────────────────────────── */}
        <View style={styles.progressCard}>
          <View style={styles.progressLabelRow}>
            <Text style={styles.progressLabel}>Free generations used</Text>
            <Text style={styles.progressCount}>{usedCount}/{totalFree}</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progressPct * 100}%` }]} />
          </View>
        </View>

        {/* ── Toggle pill ─────────────────────────────────────────── */}
        <View style={styles.toggleWrapper}>
          <TogglePill activeTab={activeTab} onTabChange={setActiveTab} />
        </View>

        {/* ── Referral banner ─────────────────────────────────────── */}
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleShareReferral}
          style={styles.referralBanner}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.referralText}>
              Refer a friend get <Text style={styles.referralHighlight}>2 Free</Text> Credits
            </Text>
            <Text style={styles.referralSub}>when they sign up!</Text>
          </View>
          <View style={styles.referralShareBtn}>
            <ShareIcon />
          </View>
        </TouchableOpacity>

        {/* ── Gray container box ──────────────────────────────────── */}
        <View style={styles.contentBox}>
          {activeTab === 'tokens' ? (
            <>
              <Text style={styles.sectionTitle}>Buy HomeGenie Tokens Individual</Text>
              <View style={styles.sectionDivider} />

              <View style={styles.tokenGrid}>
                {TOKEN_PACKAGES.map(pkg => (
                  <TokenPackageCard
                    key={pkg.id}
                    pkg={pkg}
                    selected={selectedToken === pkg.id}
                    onSelect={setSelectedToken}
                  />
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={styles.sectionTitle}>Subscribe Monthly To HomeGenie</Text>
              <View style={styles.sectionDivider} />

              {PAID_TIERS.map(tier => (
                <TierCard
                  key={tier.id}
                  tier={tier}
                  selected={selectedTier === tier.id}
                  onSelect={handleSelectTier}
                />
              ))}
            </>
          )}
        </View>

        {/* ── Fine print + legal ──────────────────────────────────── */}
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
            <Text style={styles.legalDot}>·</Text>
            <TouchableOpacity onPress={() => navigation.navigate('PrivacyPolicy')} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={styles.legalLink}>Privacy Policy</Text>
            </TouchableOpacity>
          </View>
        </View>

      </ScrollView>

      {/* ── Sticky CTA bar — always pinned at bottom ─────────────── */}
      <View style={styles.stickyBar}>
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
      </View>
    </SafeAreaView>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const BLUE = colors.bluePrimary;
// Token cards sit inside: screen padding (20) + contentBox padding (16) on each side
const TOKEN_CARD_W = (SCREEN_W - 2 * layout.screenPaddingH - 2 * space.base - 2 * space.sm) / 3;

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingTop: 90,
  },
  root: {
    flex: 1,
    backgroundColor: C.white,
    borderTopLeftRadius: 15,
    borderTopRightRadius: 15,
    overflow: 'hidden',
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
    fontFamily: 'Geist_700Bold',
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
    fontFamily: 'Geist_400Regular',
    color: '#6B7280',
    textAlign: 'center',
    paddingHorizontal: layout.screenPaddingH,
    marginBottom: space.lg,
  },

  // ── Progress card
  progressCard: {
    marginHorizontal: layout.screenPaddingH,
    marginBottom: space.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
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
    fontFamily: 'Geist_400Regular',
    color: '#6B7280',
  },
  progressCount: {
    fontSize: 13,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: '#111827',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D1D5DB',
    // No overflow:hidden — allows the fill's glow shadow to render
  },
  progressFill: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#67ACE9',
    shadowColor: '#67ACE9',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 12,
  },

  // ── Toggle pill
  toggleWrapper: {
    paddingHorizontal: layout.screenPaddingH,
    marginBottom: space.lg,
  },
  toggleContainer: {
    flexDirection: 'row',
    backgroundColor: '#F3F4F6',
    borderRadius: 28,
    padding: 3,
  },
  toggleTab: {
    flex: 1,
    height: 38,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleTabActive: {
    backgroundColor: C.white,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  toggleText: {
    fontSize: 14,
    fontWeight: fontWeight.medium,
    fontFamily: 'Geist_500Medium',
    color: '#9CA3AF',
  },
  toggleTextActive: {
    color: BLUE,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
  },

  // ── Referral banner
  referralBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: layout.screenPaddingH,
    marginBottom: space.lg,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#F9FAFB',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  referralText: {
    fontSize: 13,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: '#6B7280',
    lineHeight: 18,
  },
  referralHighlight: {
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: BLUE,
  },
  referralSub: {
    fontSize: 13,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: '#9CA3AF',
    lineHeight: 18,
  },
  referralShareBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: space.md,
  },

  // ── Scroll
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
    flexGrow: 1,
  },

  // ── Gray content box
  contentBox: {
    backgroundColor: '#F6F7F9',
    borderRadius: 16,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    paddingHorizontal: space.base,
    marginHorizontal: layout.screenPaddingH,
    marginBottom: space.sm,
  },

  // ── Section header
  sectionTitle: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: '#111827',
    textAlign: 'center',
    marginBottom: space.sm,
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginBottom: space.lg,
  },

  // ── Token grid
  tokenGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.sm,
  },
  tokenCard: {
    width: TOKEN_CARD_W,
    paddingVertical: space.lg,
    paddingHorizontal: space.sm,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#D1D5DB',
    backgroundColor: C.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tokenCardSelected: {
    borderColor: BLUE,
    borderWidth: 2,
    backgroundColor: '#F0F7FF',
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  tokenCount: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: '#374151',
    marginBottom: 4,
  },
  tokenCountSelected: {
    color: BLUE,
  },
  tokenPrice: {
    fontSize: 12,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: '#9CA3AF',
  },
  tokenPriceSelected: {
    color: '#6B7280',
  },

  // ── Subscription cards
  subCard: {
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: C.white,
    paddingVertical: 10,
    paddingHorizontal: space.base,
    marginBottom: space.md,
  },
  subCardSelected: {
    borderColor: BLUE,
    borderWidth: 2,
    backgroundColor: '#F0F7FF',
    shadowColor: BLUE,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  subCardHeader: {
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
  subTierName: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: '#111827',
    marginBottom: 1,
  },
  subGenRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  subGenCount: {
    fontSize: 26,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: BLUE,
    lineHeight: 30,
  },
  subGenCountUnlimited: {
    fontSize: 22,
    fontFamily: 'Geist_400Regular',
  },
  subGenLabel: {
    fontSize: 12,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: '#6B7280',
    marginLeft: 2,
  },
  subTierPrice: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: '#111827',
  },
  subTierPriceSelected: {
    color: BLUE,
  },

  // ── Expandable features section
  subFeaturesContainer: {
    marginTop: space.sm,
  },
  subFeaturesDivider: {
    height: 1,
    backgroundColor: 'rgba(11,109,195,0.15)',
    marginBottom: space.sm,
  },
  subFeatureRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
  },
  subFeatureText: {
    fontSize: 13,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: '#374151',
    flex: 1,
  },

  // ── Legal section
  legalSection: {
    marginTop: space.xl,
    marginHorizontal: layout.screenPaddingH,
    paddingHorizontal: 4,
    gap: 10,
  },
  finePrint: {
    fontSize: 11,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
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
    fontFamily: 'Geist_500Medium',
    color: BLUE,
  },
  legalDot: {
    fontSize: 12,
    fontFamily: 'Geist_400Regular',
    color: '#9CA3AF',
  },

  // ── Sticky CTA bar
  stickyBar: {
    paddingHorizontal: layout.screenPaddingH,
    paddingTop: space.md,
    paddingBottom: space.md,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
    backgroundColor: C.white,
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
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 15,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: C.white,
    letterSpacing: -0.2,
  },
  ctaDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: space.md,
  },
  ctaPrice: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: C.white,
  },
});
