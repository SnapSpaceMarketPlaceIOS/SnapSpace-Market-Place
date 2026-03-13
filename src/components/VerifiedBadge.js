/**
 * VerifiedBadge — Blue checkmark badge for Verified Suppliers.
 *
 * Usage:
 *   <VerifiedBadge />                    // default sm
 *   <VerifiedBadge size="md" />
 *   <VerifiedBadge size="lg" />
 *
 * SellerName Usage:
 *   <SellerName name="Acme Co" isVerified />
 *   <SellerName name="Acme Co" isVerified size="md" prefix="Sold by " />
 */

import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { uiColors, typeScale, radius, shadow } from '../constants/tokens';

const BADGE_COLOR = uiColors.primary;

// Size map — icon dimensions for each size token
const SIZE_MAP = {
  sm: { icon: 14, hitSlop: 8 },
  md: { icon: 18, hitSlop: 10 },
  lg: { icon: 24, hitSlop: 12 },
};

// ── Badge SVG (filled check-badge / shield-check style) ───────────────────────
// Uses the Heroicons CheckBadgeIcon path — a filled circle with a checkmark
function BadgeSvg({ size }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={BADGE_COLOR}>
      <Path
        fillRule="evenodd"
        clipRule="evenodd"
        d="M8.603 3.799A4.49 4.49 0 0 1 12 2.25c1.357 0 2.573.6 3.397 1.549a4.49 4.49 0 0 1 3.498 1.307 4.491 4.491 0 0 1 1.307 3.497A4.49 4.49 0 0 1 21.75 12a4.49 4.49 0 0 1-1.549 3.397 4.491 4.491 0 0 1-1.307 3.497 4.491 4.491 0 0 1-3.497 1.307A4.49 4.49 0 0 1 12 21.75a4.49 4.49 0 0 1-3.397-1.549 4.491 4.491 0 0 1-3.497-1.307 4.491 4.491 0 0 1-1.307-3.497A4.49 4.49 0 0 1 2.25 12c0-1.357.6-2.573 1.549-3.397a4.49 4.49 0 0 1 1.307-3.497 4.49 4.49 0 0 1 3.497-1.307Zm7.007 6.387a.75.75 0 1 0-1.22-.872l-3.236 4.53L9.53 12.22a.75.75 0 0 0-1.06 1.06l2.25 2.25a.75.75 0 0 0 1.14-.094l3.75-5.25Z"
      />
    </Svg>
  );
}

// ── Tooltip bubble ────────────────────────────────────────────────────────────
function Tooltip({ visible, anim }) {
  if (!visible) return null;
  return (
    <Animated.View
      style={[
        tooltipStyles.bubble,
        {
          opacity: anim,
          transform: [
            {
              translateY: anim.interpolate({
                inputRange: [0, 1],
                outputRange: [4, 0],
              }),
            },
          ],
        },
      ]}
      pointerEvents="none"
    >
      <Text style={tooltipStyles.text}>Verified Supplier</Text>
      <View style={tooltipStyles.arrow} />
    </Animated.View>
  );
}

const tooltipStyles = StyleSheet.create({
  bubble: {
    position: 'absolute',
    bottom: '100%',
    left: '50%',
    transform: [{ translateX: -60 }],
    marginBottom: 6,
    backgroundColor: uiColors.textPrimary,
    borderRadius: radius.sm,
    paddingVertical: 5,
    paddingHorizontal: 10,
    width: 120,
    alignItems: 'center',
    zIndex: 999,
    ...shadow.sm,
  },
  text: {
    color: uiColors.white,
    ...typeScale.micro,
    textAlign: 'center',
  },
  arrow: {
    position: 'absolute',
    bottom: -4,
    left: '50%',
    marginLeft: -4,
    width: 8,
    height: 8,
    backgroundColor: uiColors.textPrimary,
    transform: [{ rotate: '45deg' }],
  },
});

// ── VerifiedBadge ─────────────────────────────────────────────────────────────

export function VerifiedBadge({ size = 'sm' }) {
  const { icon, hitSlop } = SIZE_MAP[size] || SIZE_MAP.sm;
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipAnim = useRef(new Animated.Value(0)).current;
  const timeoutRef = useRef(null);

  const handlePress = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    setShowTooltip(true);
    Animated.timing(tooltipAnim, {
      toValue: 1,
      duration: 150,
      useNativeDriver: true,
    }).start();

    timeoutRef.current = setTimeout(() => {
      Animated.timing(tooltipAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setShowTooltip(false));
    }, 2000);
  };

  return (
    <View style={styles.badgeContainer}>
      <Tooltip visible={showTooltip} anim={tooltipAnim} />
      <TouchableOpacity
        onPress={handlePress}
        activeOpacity={0.75}
        hitSlop={{ top: hitSlop, bottom: hitSlop, left: hitSlop, right: hitSlop }}
        style={styles.touchable}
      >
        <BadgeSvg size={icon} />
      </TouchableOpacity>
    </View>
  );
}

// ── SellerName ────────────────────────────────────────────────────────────────
// Combines a name label with an optional VerifiedBadge inline.

export function SellerName({
  name,
  isVerified = false,
  size = 'sm',
  prefix = '',
  nameStyle,
  containerStyle,
}) {
  const { icon } = SIZE_MAP[size] || SIZE_MAP.sm;

  return (
    <View style={[sellerStyles.row, containerStyle]}>
      {prefix ? (
        <Text style={[sellerStyles.prefix, nameStyle]}>{prefix}</Text>
      ) : null}
      <Text style={[sellerStyles.name, nameStyle]} numberOfLines={1}>
        {name}
      </Text>
      {isVerified && (
        <View style={{ marginLeft: 4, marginTop: 1 }}>
          <VerifiedBadge size={size} />
        </View>
      )}
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  badgeContainer: {
    position: 'relative',
  },
  touchable: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

const sellerStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  prefix: {
    ...typeScale.caption,
    color: uiColors.textSecondary,
  },
  name: {
    ...typeScale.caption,
    fontWeight: '600',
    color: uiColors.textPrimary,
    flexShrink: 1,
  },
});
