/**
 * Badge — Design System Primitives
 *
 * Three variants per the design system spec (Part 2.3):
 *   style  → DARK LUXE, GLAM, BOHO — dark translucent bg on image overlays
 *   status → NEW, SALE, LIMITED TIME, SOLD OUT — semantic color bg
 *   source → Amazon, Target, etc. — source brand color bg
 *
 * All use:
 *   - --type-micro (11px, weight 600, 0.5px letter-spacing, uppercase)
 *   - --radius-sm (6px) — radius.badge in tokens.js
 *   - Padding: 4px vertical, 10px horizontal (style/status) | 4px/8px (source)
 *
 * Usage:
 *   <Badge variant="style" label="DARK LUXE" />
 *   <Badge variant="status" label="NEW" />
 *   <Badge variant="status" label="SALE" />
 *   <Badge variant="status" label="SOLD OUT" />
 *   <Badge variant="source" label="Amazon" color="#FF9900" />
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { uiColors, radius, typeScale } from '../../constants/tokens';

const C = uiColors;

// ── Status color map ───────────────────────────────────────────────────────────
function getStatusColor(label) {
  const upper = (label || '').toUpperCase();
  if (upper === 'NEW' || upper === 'LIMITED TIME') return C.success;   // green
  if (upper === 'SALE' || upper === 'DISCOUNT')    return C.destructive; // red/coral
  if (upper === 'SOLD OUT')                        return '#9CA3AF';    // mid-gray
  return C.primary; // fallback
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function Badge({
  variant = 'style',
  label = '',
  color,       // override bg color (required for source variant if not passed)
  textColor,   // override text color
  style,
}) {
  let containerBg;
  let paddingH = 10;

  let borderStyle = null;

  if (variant === 'style') {
    containerBg = 'rgba(0,0,0,0.6)';
  } else if (variant === 'outline') {
    containerBg = 'transparent';
    borderStyle = { borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.85)' };
  } else if (variant === 'status') {
    containerBg = getStatusColor(label);
  } else if (variant === 'source') {
    containerBg = color || C.amazon;
    paddingH = 8;
  }

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: containerBg,
          paddingHorizontal: paddingH,
        },
        borderStyle,
        style,
      ]}
    >
      <Text
        style={[
          styles.label,
          textColor && { color: textColor },
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

// ── Heart Count Pill (Part 2.1 Image Card spec) ───────────────────────────────
// Semi-transparent dark pill positioned bottom-right inside card overlays.
export function HeartCountPill({ count, icon, style }) {
  return (
    <View style={[pillStyles.container, style]}>
      {icon && <View style={pillStyles.icon}>{icon}</View>}
      <Text style={pillStyles.text}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.badge,
    paddingVertical: 4,
    alignSelf: 'flex-start',
  },
  label: {
    ...typeScale.micro,
    fontFamily: 'KantumruyPro_600SemiBold',
    color: '#FFFFFF',
  },
});

const pillStyles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderRadius: radius.full,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  icon: {
    // caller renders the icon component
  },
  text: {
    ...typeScale.caption,
    color: '#FFFFFF',
    fontWeight: '600',
    fontFamily: 'KantumruyPro_600SemiBold',
  },
});
