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
  Image,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { colors } from '../constants/colors';

/**
 * RatingPromptModal — post-second-generation App Store review prompt.
 *
 * Compact card overlay shown on RoomResultScreen after the user's 2nd
 * successful generation. Layout per spec:
 *
 *   ┌─────────────────────────┐
 *   │       [app icon]        │
 *   │   Enjoying Home Genie?  │
 *   │      Leave a review!    │
 *   ├─────────────────────────┤
 *   │   ☆   ☆   ☆   ☆   ☆    │
 *   ├─────────────────────────┤
 *   │         Not Now         │
 *   └─────────────────────────┘
 *
 * Behavior — tapping ANY star fires the native iOS rating sheet via
 * SKStoreReviewController (through expo-store-review), with a fallback
 * to the App Store write-review URL. "Not Now" dismisses without
 * triggering any prompt. Both actions persist a one-shot flag so the
 * prompt never auto-fires again on this account.
 *
 * Apple guideline 4.5.4 — NO incentive is tied to this prompt. Do not
 * add wish bonuses, free wishes, or any other compensation for tapping
 * a star. Coupling rewards to an App Store rating is a likely review
 * rejection.
 *
 * Props:
 *   visible        — boolean, drives the Modal
 *   onLeaveReview  — () => void; fires on any star tap (parent triggers
 *                    the native review path AND logs engagement)
 *   onMaybeLater   — () => void; fires on "Not Now" (parent dismisses +
 *                    logs decline)
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

          <LinearGradient
            colors={['#E6F2FB', '#C6DFF3']}
            locations={[0, 1]}
            style={styles.cardBg}
          >
            {/* App icon */}
            <View style={styles.logoWrap}>
              <Image
                source={require('../../assets/icon.png')}
                style={styles.logo}
                resizeMode="cover"
              />
            </View>

            {/* Heading + subtitle */}
            <Text style={styles.title}>Enjoying Home Genie?</Text>
            <Text style={styles.subtitle}>Leave a review!</Text>

            {/* Divider, stars, divider */}
            <View style={styles.divider} />

            <View style={styles.starsRow}>
              {[1, 2, 3, 4, 5].map((i) => (
                <Pressable
                  key={i}
                  onPress={onLeaveReview}
                  style={({ pressed }) => [styles.starBtn, pressed && styles.starBtnPressed]}
                  accessibilityRole="button"
                  accessibilityLabel={`Rate ${i} star${i > 1 ? 's' : ''}`}
                  hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
                >
                  <StarOutlineIcon />
                </Pressable>
              ))}
            </View>

            <View style={styles.divider} />

            {/* Not Now */}
            <TouchableOpacity
              onPress={onMaybeLater}
              activeOpacity={0.6}
              accessibilityRole="button"
              accessibilityLabel="Not now"
              style={styles.notNowBtn}
              hitSlop={{ top: 8, bottom: 8, left: 16, right: 16 }}
            >
              <Text style={styles.notNowLabel}>Not Now</Text>
            </TouchableOpacity>

          </LinearGradient>

        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

function StarOutlineIcon() {
  return (
    <Svg width={32} height={32} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 2.5l2.95 5.98 6.6.96-4.78 4.66 1.13 6.57L12 17.6l-5.9 3.07 1.13-6.57L2.45 9.44l6.6-.96L12 2.5z"
        stroke={colors.bluePrimary}
        strokeWidth={1.4}
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  card: {
    width: 300,
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  cardBg: {
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 0,
    alignItems: 'center',
  },
  logoWrap: {
    width: 64,
    height: 64,
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
  },
  logo: {
    width: '100%',
    height: '100%',
  },
  title: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.bluePrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: '500',
    color: colors.bluePrimary,
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 18,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(11,109,195,0.22)',
    width: '100%',
  },
  starsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingVertical: 14,
    paddingHorizontal: 4,
  },
  starBtn: {
    padding: 4,
  },
  starBtnPressed: {
    opacity: 0.45,
  },
  notNowBtn: {
    paddingVertical: 14,
    width: '100%',
    alignItems: 'center',
  },
  notNowLabel: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.bluePrimary,
    textAlign: 'center',
  },
});
