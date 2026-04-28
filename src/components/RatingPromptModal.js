import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Pressable,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/colors';

/**
 * RatingPromptModal — post-second-generation App Store review prompt.
 *
 * Pure presentational. Shown by RatingPromptHost in App.js when
 * SubscriptionContext.shouldShowRatingPrompt flips true.
 *
 * UX intent (per user direction): no incentive, no carrot. Just a
 * polite ask after the user has seen TWO room generations and has
 * therefore had a real taste of what the app does. The thinking is
 * that engagement after two real uses is a more honest signal than
 * a review-for-wishes trade.
 *
 * Important: do NOT add wish bonuses, free wishes, or any other
 * compensation tied to tapping "Leave a Review." Apple guideline
 * 4.5.4 explicitly prohibits offering rewards in exchange for App
 * Store ratings/reviews; coupling the two is a likely review-time
 * rejection.
 *
 * Props:
 *   visible       — boolean, drives the Modal
 *   onLeaveReview — () => void, parent triggers the native review
 *                   sheet AND logs engagement
 *   onMaybeLater  — () => void, parent dismisses + logs decline
 */
export default function RatingPromptModal({ visible, onLeaveReview, onMaybeLater }) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.92)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          tension: 180,
          friction: 16,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      fadeAnim.setValue(0);
      scaleAnim.setValue(0.92);
    }
  }, [visible, fadeAnim, scaleAnim]);

  if (!visible) return null;

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <Animated.View style={[styles.overlay, { opacity: fadeAnim }]}>
        <Animated.View style={[styles.card, { transform: [{ scale: scaleAnim }] }]}>
          {/* Five-star illustration in the gradient hero — visually
              communicates "review" without needing a label. */}
          <View style={styles.heroWrap}>
            <LinearGradient
              colors={[colors.blueLight, colors.bluePrimary]}
              locations={[0.32, 0.86]}
              style={styles.hero}
            >
              <FiveStarsIcon />
            </LinearGradient>
          </View>

          <Text style={styles.title}>Enjoying HomeGenie?</Text>
          <Text style={styles.body}>
            If the app&apos;s helped you wish up a space you love,{'\n'}
            we&apos;d be grateful for a quick review.
          </Text>

          <Pressable
            onPress={onLeaveReview}
            accessibilityRole="button"
            accessibilityLabel="Leave a review on the App Store"
            style={styles.primaryWrap}
          >
            <LinearGradient
              colors={[colors.blueLight, colors.bluePrimary]}
              locations={[0.32, 0.86]}
              style={styles.primary}
            >
              <Text style={styles.primaryLabel}>Leave a Review</Text>
            </LinearGradient>
          </Pressable>

          <TouchableOpacity
            onPress={onMaybeLater}
            accessibilityRole="button"
            accessibilityLabel="Maybe later"
            style={styles.secondary}
            hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
          >
            <Text style={styles.secondaryLabel}>Maybe Later</Text>
          </TouchableOpacity>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function FiveStarsIcon() {
  // Single five-pointed solid white star — visual shorthand for "rate."
  return (
    <Svg width={28} height={28} viewBox="0 0 24 24" fill="#FFFFFF">
      <Path d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.6l-5.9 3.07 1.13-6.57L2.45 9.44l6.6-.96L12 2.5z" />
    </Svg>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 32,
    elevation: 10,
  },

  heroWrap: { marginBottom: 18 },
  hero: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },

  title: {
    fontSize: 22,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#111',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  body: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: '#555',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 22,
  },

  primaryWrap: {
    width: '100%',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 4,
  },
  primary: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryLabel: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  secondary: { paddingVertical: 12, paddingHorizontal: 8 },
  secondaryLabel: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: '#888',
  },
});
