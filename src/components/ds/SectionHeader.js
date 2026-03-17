/**
 * SectionHeader — Design System Primitive
 *
 * Every section on every screen uses this exact layout (Part 2.4):
 *   [LEFT]  Section Title  — typeScale.subheadline (13px, 600, 1.2 tracking, uppercase)
 *   [RIGHT] Action Label   — ghost button style (14px, 600, brand blue)
 *
 * Spacing spec:
 *   paddingHorizontal: space.lg (20px — matches screen padding)
 *   marginBottom:      space.base (16px — to first content below)
 *   marginTop:         space['2xl'] (32px — from previous section's last element)
 *                      (caller controls marginTop via `topSpacing` prop)
 *
 * Usage:
 *   <SectionHeader title="TOP SPACES" />
 *   <SectionHeader title="FEATURED PRODUCTS" actionLabel="Shop all" onAction={fn} />
 *   <SectionHeader title="RECENTLY VIEWED" actionLabel="Clear" onAction={fn} />
 *
 *   // With leading icon (e.g. sparkle for "For You"):
 *   <SectionHeader title="PICKED FOR YOU" icon={<SparkleIcon />} actionLabel="See all" onAction={fn} />
 *
 *   // No top margin (first section after a card):
 *   <SectionHeader title="DETAILS" noTopMargin />
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { uiColors, space, typeScale } from '../../constants/tokens';

const C = uiColors;

export default function SectionHeader({
  title,
  actionLabel,
  onAction,
  icon,
  noTopMargin = false,
  style,
}) {
  return (
    <View
      style={[
        styles.container,
        noTopMargin && styles.noTopMargin,
        style,
      ]}
    >
      {/* Left: icon + title */}
      <View style={styles.left}>
        {icon && <View style={styles.icon}>{icon}</View>}
        <Text style={styles.title}>{title}</Text>
      </View>

      {/* Right: action ghost button */}
      {actionLabel && onAction ? (
        <TouchableOpacity
          onPress={onAction}
          activeOpacity={0.7}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={styles.actionTouch}
        >
          <Text style={styles.action}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,       // 20px — sacred screen padding
    marginBottom: space.base,          // 16px — to first content below
    marginTop: space['2xl'],           // 32px — from previous section
  },
  noTopMargin: {
    marginTop: 0,
  },
  left: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  icon: {
    // caller provides a pre-sized icon component
  },
  title: {
    ...typeScale.subheadline,
    color: C.primary,
  },
  actionTouch: {
    minHeight: 36,          // compact touch target
    alignItems: 'center',
    justifyContent: 'center',
  },
  action: {
    ...typeScale.button,
    color: C.primary,
  },
});
