/**
 * Button — Design System Primitives
 *
 * Variants: Primary | Secondary | Ghost | Destructive | Icon
 * All sizing, color, and radius values come from tokens.js.
 * Press states are baked in — no caller needs to add activeOpacity hacks.
 *
 * Usage:
 *   <Button variant="primary" label="Shop Now" onPress={fn} />
 *   <Button variant="secondary" label="Explore Looks" onPress={fn} />
 *   <Button variant="ghost" label="See all" onPress={fn} />
 *   <Button variant="destructive" label="Remove" onPress={fn} />
 *   <Button variant="icon" icon={<TrashIcon />} onPress={fn} />
 *   <Button variant="primary" label="Add to Cart" onPress={fn} fullWidth />
 *   <Button variant="primary" label="Loading..." onPress={fn} loading />
 *   <Button variant="primary" label="Disabled" onPress={fn} disabled />
 */

import React, { useRef } from 'react';
import {
  TouchableOpacity,
  Text,
  View,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { uiColors, radius, motion, typeScale } from '../../constants/tokens';
import LensLoader from '../LensLoader';

const C = uiColors;

// ── Variant configs ────────────────────────────────────────────────────────────

const VARIANT = {
  primary: {
    container: {
      backgroundColor: C.primary,
      borderRadius: radius.button,
      paddingHorizontal: 24,
      paddingVertical: 12,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    label: { color: '#FFFFFF', ...typeScale.button, fontFamily: 'KantumruyPro_600SemiBold' },
    pressedBg: C.primary, // darken handled via opacity on press
  },
  secondary: {
    container: {
      backgroundColor: 'transparent',
      borderRadius: radius.button,
      borderWidth: 1.5,
      borderColor: C.primary,
      paddingHorizontal: 24,
      paddingVertical: 12,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    label: { color: C.primary, ...typeScale.button, fontFamily: 'KantumruyPro_600SemiBold' },
  },
  ghost: {
    container: {
      backgroundColor: 'transparent',
      borderRadius: radius.button,
      paddingHorizontal: 16,
      paddingVertical: 8,
      minHeight: 36,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
    },
    label: { color: C.primary, ...typeScale.button, fontFamily: 'KantumruyPro_600SemiBold' },
  },
  destructive: {
    container: {
      backgroundColor: C.destructive,
      borderRadius: radius.button,
      paddingHorizontal: 24,
      paddingVertical: 12,
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    label: { color: '#FFFFFF', ...typeScale.button, fontFamily: 'KantumruyPro_600SemiBold' },
  },
  icon: {
    container: {
      width: 44,
      height: 44,
      borderRadius: radius.full,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
    },
    label: null,
  },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function Button({
  variant = 'primary',
  label,
  icon,
  onPress,
  fullWidth = false,
  disabled = false,
  loading = false,
  style,
  labelStyle,
  // For inverted buttons (used inside dark promo cards)
  inverted = false,
}) {
  const opacity = useRef(new Animated.Value(1)).current;

  const config = VARIANT[variant] || VARIANT.primary;

  const handlePressIn = () => {
    Animated.timing(opacity, {
      toValue: variant === 'icon' ? 0.6 : 0.85,
      duration: motion.durationFast,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.timing(opacity, {
      toValue: 1,
      duration: motion.durationFast,
      easing: Easing.out(Easing.ease),
      useNativeDriver: true,
    }).start();
  };

  // Inverted style — used on dark cards (white bg, dark text)
  const containerOverride = inverted
    ? { backgroundColor: '#FFFFFF', borderColor: 'transparent' }
    : null;
  const labelOverride = inverted
    ? { color: '#0F172A' }
    : null;

  const containerStyle = [
    config.container,
    fullWidth && { alignSelf: 'stretch' },
    disabled && styles.disabled,
    containerOverride,
    style,
  ];

  const textStyle = [
    config.label,
    labelOverride,
    labelStyle,
  ];

  return (
    <Animated.View style={{ opacity }}>
      <TouchableOpacity
        onPress={disabled || loading ? undefined : onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        activeOpacity={1}
        style={containerStyle}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
      >
        {loading ? (
          <LensLoader
            size={20}
            color={variant === 'secondary' || variant === 'ghost' ? C.primary : '#FFFFFF'}
            light={variant === 'secondary' || variant === 'ghost' ? '#67ACE9' : '#FFFFFF'}
          />
        ) : (
          <>
            {icon && <View>{icon}</View>}
            {label && config.label && (
              <Text style={textStyle} numberOfLines={1}>
                {label}
              </Text>
            )}
            {/* Icon-only variant */}
            {variant === 'icon' && !icon && null}
            {variant === 'icon' && icon && <View>{icon}</View>}
          </>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  disabled: {
    opacity: 0.4,
  },
});
