/**
 * OnboardingOverlay — Blue pulse ring + tooltip for guided onboarding.
 *
 * Renders a semi-transparent backdrop with a pulsing blue glow ring
 * around the target area and a tooltip card with title, body, and CTA.
 *
 * Usage:
 *   <OnboardingOverlay
 *     visible={isStepActive('chat_bar')}
 *     step={ONBOARDING_STEPS.CHAT_BAR}
 *     onNext={nextStep}
 *     onSkip={finishOnboarding}
 *     tooltipPosition="above"   // 'above' | 'below'
 *   />
 *
 * Place this INSIDE the screen, positioned absolutely over the target element.
 * The parent should wrap the target element + this overlay in a View.
 */
import React, { useRef, useEffect } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing, StyleSheet } from 'react-native';
import Svg, { Path, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';

const BLUE = '#0B6DC3';
const LIGHT_BLUE = '#67ACE9';

export default function OnboardingOverlay({
  visible,
  step,
  onNext,
  onBack,
  onSkip,
  tooltipPosition = 'below',
  style,
}) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.85)).current;

  useEffect(() => {
    if (visible) {
      // Scale-up entrance: starts small, springs to full size
      scaleAnim.setValue(0.85);
      fadeAnim.setValue(0);
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1, duration: 250, useNativeDriver: true,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1, tension: 200, friction: 12, useNativeDriver: true,
        }),
      ]).start();

      // Pulse loop — bolder color
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      fadeAnim.setValue(0);
      pulseAnim.setValue(0);
      scaleAnim.setValue(0.85);
    }
  }, [visible]);

  if (!visible || !step) return null;

  const glowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.35, 0.85],
  });

  const glowScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.02],
  });

  return (
    <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }, style]}>
      {/* Wrapper keeps ring + tooltip aligned */}
      <View style={[styles.tooltipWrap, tooltipPosition === 'above' ? styles.tooltipAbove : styles.tooltipBelow]}>
        {/* Blue pulse ring — sits behind tooltip, same size */}
        <Animated.View style={[
          styles.pulseRing,
          {
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]} />

        {/* Tooltip card */}
        <View style={styles.tooltip}>
          {/* Back button + header */}
          <View style={styles.tooltipHeader}>
            {step.step > 1 && onBack ? (
              <TouchableOpacity onPress={onBack} activeOpacity={0.7} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={styles.backLabel}>&larr;</Text>
              </TouchableOpacity>
            ) : (
              <View />
            )}
            <Text style={styles.tooltipTitle}>{step.title}</Text>
            <Text style={styles.stepIndicator}>{step.step}/3</Text>
          </View>
          {step.showGenieIcon && (
            <View style={styles.genieIconRow}>
              <Svg width={28} height={28} viewBox="0 0 450 450">
                <Defs>
                  <SvgLinearGradient id="onbGrad" x1="225" y1="0" x2="225" y2="450" gradientUnits="userSpaceOnUse">
                    <Stop offset="0.32" stopColor="#67ACE9" />
                    <Stop offset="0.86" stopColor="#0B6DC3" />
                  </SvgLinearGradient>
                </Defs>
                <Path d="M225 0C100.736 0 0 100.736 0 225C0 349.264 100.736 450 225 450C349.264 450 450 349.264 450 225C450 100.736 349.264 0 225 0Z" fill="url(#onbGrad)" />
                <Path d="M326.155 194.661C306.203 193.551 286.596 223.576 265.287 232.582C259.954 218.661 247.863 208.794 233.603 206.723C231.53 206.386 230.008 204.515 230.02 202.32V201.347C230.044 200.249 230.428 199.189 231.123 198.353C233.699 195.023 234.837 190.732 234.262 186.491C233.675 182.25 231.945 180 228 180C223.945 180 221.632 183.609 221.596 188.674C221.56 192.191 222.71 195.622 224.819 198.353C225.49 199.201 225.862 200.262 225.886 201.347V202.32C225.934 204.441 224.52 206.287 222.53 206.723C206.748 209.006 193.77 220.794 189.432 236.748C178 232.457 167.143 226.669 157.138 219.497C130.008 200.91 117.852 197.824 106.271 197.234C106.271 197.234 104.761 197.234 101.739 199.004L97.5928 201.372V201.385C96.2007 201.953 95.6735 205.674 96.2008 206.672C96.7161 207.67 99.1384 208.944 100.229 209.031C114.118 209.518 127.527 211.489 138.924 219.771C164.952 237.721 180.062 295.913 228.116 295.913C275.031 295.913 295.993 209.304 326.155 209.304C346.886 209.304 342.714 254.499 330.898 264.778C319.082 275.069 307.291 264.503 296.637 264.503C283.719 264.503 284.33 277.476 291.281 278.287C292.862 278.524 294.468 278.05 295.69 276.99C296.925 275.93 297.668 274.37 297.74 272.711C304.33 277.464 312.024 280.283 320.029 280.845C338.699 280.845 354 250.642 354 228.464C353.964 218.248 349.175 195.896 326.155 194.661ZM262.64 247.836C251.579 251.878 239.943 253.936 228.21 253.923C216.502 253.923 204.878 251.877 193.818 247.873C190.93 246.888 189.324 243.67 190.235 240.639C202.326 245.591 215.196 248.123 228.186 248.11C241.176 248.098 254.058 245.566 266.161 240.639C266.593 242.111 266.449 243.682 265.754 245.042C265.059 246.389 263.885 247.399 262.471 247.836H262.64ZM272.322 318.425V318.961C258.158 324.387 243.154 327.106 228.054 326.994C212.955 327.144 197.964 324.462 183.774 319.061V318.524C184.302 316.204 185.704 314.196 187.669 312.973C189.634 311.751 191.995 311.414 194.212 312.038C201.378 314.532 209.275 312.088 213.972 305.925C215.099 304.341 215.974 302.582 216.561 300.711C220.3 301.522 224.098 301.921 227.921 301.921C231.732 301.909 235.519 301.397 239.198 300.374C240.552 305.152 243.763 309.119 248.053 311.339C252.343 313.547 257.316 313.809 261.798 312.038C264.003 311.414 266.364 311.763 268.317 312.986C270.282 314.208 271.673 316.204 272.2 318.524L272.322 318.425Z" fill="#FFFFFF" />
              </Svg>
              <Text style={styles.genieIconLabel}>Look for this icon</Text>
            </View>
          )}
          <Text style={styles.tooltipBody}>{step.body}</Text>
          <View style={styles.tooltipActions}>
            <TouchableOpacity onPress={onSkip} activeOpacity={0.7}>
              <Text style={styles.skipLabel}>Skip</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.nextBtn} onPress={onNext} activeOpacity={0.8}>
              <Text style={styles.nextLabel}>{step.buttonLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

/**
 * OnboardingGlow — Just the blue pulse border, no tooltip.
 * Wrap around any element to give it the onboarding glow effect.
 */
export function OnboardingGlow({ visible, children, style, borderRadius = 36, bold = false }) {
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (visible) {
      const opacity = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: false,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0, duration: 1600, easing: Easing.inOut(Easing.ease), useNativeDriver: false,
          }),
        ])
      );
      // Breathe: shrink ↔ expand
      const breathe = bold ? Animated.loop(
        Animated.sequence([
          Animated.timing(scaleAnim, {
            toValue: 1.08, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
          Animated.timing(scaleAnim, {
            toValue: 0.96, duration: 1200, easing: Easing.inOut(Easing.ease), useNativeDriver: true,
          }),
        ])
      ) : null;
      opacity.start();
      if (breathe) breathe.start();
      return () => { opacity.stop(); if (breathe) breathe.stop(); };
    } else {
      pulseAnim.setValue(0);
      scaleAnim.setValue(1);
    }
  }, [visible]);

  const borderColorAnim = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(103,172,233,0.3)', 'rgba(103,172,233,0.7)'],
  });

  const shadowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.1, 0.35],
  });

  if (!visible) return children;

  return (
    <Animated.View style={[
      {
        borderWidth: 1.5,
        borderColor: borderColorAnim,
        borderRadius,
        shadowColor: LIGHT_BLUE,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity,
        shadowRadius: 10,
        transform: bold ? [{ scale: scaleAnim }] : [],
      },
      style,
    ]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1000,
  },
  pulseRing: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: LIGHT_BLUE,
    shadowColor: LIGHT_BLUE,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  tooltipWrap: {
    marginHorizontal: 40,
    position: 'relative',
  },
  tooltip: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  tooltipAbove: {
    marginBottom: 12,
  },
  tooltipBelow: {
    marginTop: 12,
  },
  tooltipHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    gap: 6,
  },
  backLabel: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '500',
  },
  tooltipTitle: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#0F172A',
  },
  stepIndicator: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: '#9CA3AF',
  },
  tooltipBody: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: '#6B7280',
    lineHeight: 17,
    marginBottom: 10,
  },
  tooltipActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  skipLabel: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: '#9CA3AF',
  },
  nextBtn: {
    backgroundColor: LIGHT_BLUE,
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  nextLabel: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: '#FFFFFF',
  },
  genieIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  genieIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: LIGHT_BLUE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  genieIconLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: '#6B7280',
  },
});
