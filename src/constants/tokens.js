// ─────────────────────────────────────────────────────────────────────────────
// SnapSpace Design Tokens — Single source of truth for all visual values.
// Every component MUST import from here. No hardcoded values anywhere.
// ─────────────────────────────────────────────────────────────────────────────

import { colors } from './colors';

// ── Color Palette ─────────────────────────────────────────────────────────────
export { colors };

export const palette = {
  // Brand blues (from existing colors.js)
  primaryBlue: colors.bluePrimary,   // #0B6DC3
  deepBlue: colors.blueDeep,         // #035DA8
  lightBlue: colors.blueLight,       // #67ACE9

  // Backgrounds
  background: colors.background,     // #F8FAFF
  surfaceWhite: '#FFFFFF',
  surfaceSubtle: '#F8FAFC',
  surfaceMuted: '#F1F5F9',

  // Hero gradient
  heroStart: colors.heroStart,       // #0D1E35
  heroEnd: colors.heroEnd,           // #1E5AB0

  // Semantic
  success: '#16A34A',
  successLight: '#F0FDF4',
  error: '#EF4444',

  // Text
  textPrimary: '#0F172A',
  textSecondary: 'rgba(15,23,42,0.72)',
  textTertiary: 'rgba(15,23,42,0.44)',
  textDisabled: 'rgba(15,23,42,0.28)',
  textWhite: '#FFFFFF',

  // Borders / separators
  borderSubtle: 'rgba(0,0,0,0.04)',
  borderLight: 'rgba(0,0,0,0.08)',
  separator: 'rgba(0,0,0,0.06)',
};

// ── Typography Scale (modular, ratio 1.25) ────────────────────────────────────
export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 21,
  xl: 26,
  '2xl': 33,
  '3xl': 40,
};

// ── Font Weights ───────────────────────────────────────────────────────────────
export const fontWeight = {
  regular: '400',  // metadata, captions, supporting text
  medium: '500',   // secondary labels, navigation items
  bold: '700',     // prices, headings, primary actions
  xbold: '800',    // screen titles, hero headings, dominant prices
};

// ── Letter Spacing ────────────────────────────────────────────────────────────
export const letterSpacing = {
  tight: -0.5,   // large headings, prices (-0.03em ≈ -0.5 at 17px)
  normal: 0,     // body text
  wide: 0.5,     // uppercase labels, badges (0.05em)
  wider: 1.2,    // tiny caps, section headers (0.12em)
};

// ── Spacing Scale (strict 8px grid) ───────────────────────────────────────────
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  base: 16,
  lg: 20,
  xl: 24,
  '2xl': 32,
  '3xl': 40,
  '4xl': 48,
  '5xl': 56,
  '6xl': 64,
};

// ── Corner Radius — 4-tier system ─────────────────────────────────────────────
export const radius = {
  sm: 8,    // chips, badges, small interactive elements, quantity steppers
  md: 12,   // buttons, inputs, inner card elements
  lg: 16,   // images inside cards, secondary containers
  xl: 20,   // outer cards, main containers, bottom sheets
  full: 9999, // avatars, circular FABs only
};

// ── Elevation / Shadows — 3 tiers ─────────────────────────────────────────────
export const shadow = {
  low: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  medium: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 3,
  },
  high: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 40,
    elevation: 8,
  },
};

// ── Borders ────────────────────────────────────────────────────────────────────
export const border = {
  subtle: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
  },
  light: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
  },
  focus: {
    borderWidth: 1.5,
    borderColor: colors.bluePrimary,
  },
};

// ── Opacity for text hierarchy ─────────────────────────────────────────────────
export const opacity = {
  primary: 1.0,    // headings, prices, product names
  secondary: 0.72, // brand names, descriptions
  tertiary: 0.44,  // metadata, timestamps, shipping info, captions
  disabled: 0.28,  // disabled states
};

// ── Semantic Text Styles (composable style objects) ───────────────────────────
export const textStyles = {
  // Screen-level headings
  screenTitle: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
    lineHeight: fontSize.xl * 1.15,
    color: palette.textPrimary,
  },
  screenTitleLarge: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
    lineHeight: fontSize['2xl'] * 1.15,
    color: palette.textPrimary,
  },

  // Product name on cards
  productName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
    lineHeight: fontSize.md * 1.3,
  },

  // Price in lists
  priceList: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
    fontVariant: ['tabular-nums'],
    color: palette.textPrimary,
  },

  // Price on PDP
  pricePDP: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
    fontVariant: ['tabular-nums'],
    color: palette.textPrimary,
  },

  // Brand names / source labels
  brandName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    opacity: opacity.secondary,
  },

  // Metadata (shipping, stock counts, captions)
  metadata: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.regular,
    opacity: opacity.tertiary,
    lineHeight: fontSize.xs * 1.5,
  },

  // Section headers ("PRODUCTS IN THIS LOOK")
  sectionHeader: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.wider,
    textTransform: 'uppercase',
    opacity: opacity.tertiary,
    marginBottom: space.base,
  },

  // Body text
  body: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    opacity: opacity.secondary,
    lineHeight: fontSize.base * 1.6,
  },
};

// ── Animation Durations & Curves ───────────────────────────────────────────────
export const animation = {
  fast: 100,
  normal: 150,
  slow: 200,
  verySlow: 250,

  // Spring configs (for Animated.spring)
  spring: {
    damping: 0.85,
    stiffness: 300,
  },
  springBounce: {
    tension: 300,
    friction: 10,
    useNativeDriver: true,
  },
  springSnap: {
    tension: 200,
    friction: 20,
    useNativeDriver: true,
  },
};

// ── Layout Constraints ─────────────────────────────────────────────────────────
export const layout = {
  screenPaddingH: space.lg,      // 20 — consistent on every screen
  screenPaddingTop: space.xl,    // 24 — below status bar
  screenPaddingBottom: space['2xl'], // 32 — above tab bar
  sectionGap: space['2xl'],      // 32 — between unrelated sections
  relatedGap: space.md,          // 12 — between related list items
  buttonHeight: space['5xl'],    // 56 — sticky bottom buttons
  buttonHeightMd: 52,            // medium buttons
  buttonHeightSm: 36,            // small buttons (Edit Profile, Follow)
  tabBarHeight: 88,              // total including safe area
  tabBarBaseHeight: 56,
  fabSize: 56,
  fabIconSize: 26,
  avatarSizeLg: 88,
  avatarSizeMd: 40,
  avatarSizeSm: 36,
};

// ── Default export: everything as a single object ─────────────────────────────
const tokens = {
  palette,
  fontSize,
  fontWeight,
  letterSpacing,
  space,
  radius,
  shadow,
  border,
  opacity,
  textStyles,
  animation,
  layout,
};

export default tokens;
