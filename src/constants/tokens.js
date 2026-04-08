// ─────────────────────────────────────────────────────────────────────────────
// HomeGenie Design Tokens — Single source of truth for all visual values.
// Every component MUST import from here. No hardcoded values anywhere.
// theme.js is a thin re-export shim — all values live here.
// ─────────────────────────────────────────────────────────────────────────────

import { colors } from './colors';

// ── Brand Color Palette ───────────────────────────────────────────────────────
export { colors };

// ── Font Families ─────────────────────────────────────────────────────────────
// Loaded via @expo-google-fonts in App.js.
// heading  → Kantumruy Pro Bold — screen titles, page headers, hero display text
// body     → Kantumruy Pro (various weights) — all body, labels, buttons, captions
export const fonts = {
  heading:       'KantumruyPro_700Bold',
  bodyRegular:   'KantumruyPro_400Regular',
  bodyMedium:    'KantumruyPro_500Medium',
  bodySemiBold:  'KantumruyPro_600SemiBold',
  bodyBold:      'KantumruyPro_700Bold',
  bodyExtraBold: 'KantumruyPro_700Bold', // Kantumruy Pro maxes at 700
};

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
  heroStart: colors.heroStart,       // #035DA8
  heroEnd: colors.heroEnd,           // #035DA8

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

// ── UI Semantic Colors (moved from theme.js — used by most screens) ───────────
// Screens that do `import { colors as C } from '../constants/theme'` get this
// via theme.js's re-export shim.
export const uiColors = {
  primary:        '#0B6DC3', // Buttons, links, active states, icons
  primaryLight:   'rgba(103,172,233,0.18)', // Button hover states, tag backgrounds
  bg:             '#FFFFFF', // All screen backgrounds
  surface:        '#F9FAFB', // Cards, drawers, input backgrounds
  surface2:       '#F3F4F6', // Secondary cards, dividers
  textPrimary:    '#111827', // All primary text, titles, prices
  textSecondary:  '#6B7280', // Labels, subtitles, metadata
  textTertiary:   '#9CA3AF', // Placeholder text, disabled states
  border:         '#E5E7EB', // All borders, dividers, separators
  success:        '#16A34A', // In Stock badge, trust signals
  successBg:      '#DCFCE7', // In Stock badge background
  amazon:         '#FF9900', // Amazon button background only
  amazonText:     '#111827', // Amazon button text (dark on orange)
  destructive:    '#EF4444', // Delete / remove actions
  white:          '#FFFFFF',
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

// ── Typography Scale — theme.js style (used by Cart, PDP, Explore) ───────────
// Screens that do `import theme from '../constants/theme'` use TY.xs.fontSize etc.
export const typography = {
  xs:   { fontSize: 11, fontWeight: '400', fontFamily: 'KantumruyPro_400Regular' }, // Metadata, timestamps, fine print
  sm:   { fontSize: 13, fontWeight: '400', fontFamily: 'KantumruyPro_400Regular' }, // Secondary labels, descriptions
  base: { fontSize: 15, fontWeight: '400', fontFamily: 'KantumruyPro_400Regular' }, // Body text, product descriptions
  md:   { fontSize: 17, fontWeight: '500', fontFamily: 'KantumruyPro_500Medium' },  // Section labels, card titles
  lg:   { fontSize: 20, fontWeight: '600', fontFamily: 'KantumruyPro_700Bold' },    // Page subtitles, drawer headers
  xl:   { fontSize: 24, fontWeight: '700', fontFamily: 'KantumruyPro_700Bold' },    // Price displays, key numbers
  '2xl':{ fontSize: 28, fontWeight: '700', fontFamily: 'KantumruyPro_700Bold' },    // Page titles (My Cart, etc.)
  '3xl':{ fontSize: 34, fontWeight: '800', fontFamily: 'KantumruyPro_700Bold' },    // Hero numbers
};

// ── Font Weights ───────────────────────────────────────────────────────────────
export const fontWeight = {
  regular: '400',  // metadata, captions, supporting text
  medium: '500',   // secondary labels, navigation items
  semibold: '600', // see-all links, card titles, button labels
  bold: '700',     // prices, headings, primary actions
  xbold: '800',    // screen titles, hero headings, dominant prices
  extrabold: '800', // alias for xbold — used by theme.js consumers
};

// ── Letter Spacing ────────────────────────────────────────────────────────────
export const letterSpacing = {
  tight: -0.5,   // large headings, prices (-0.03em ≈ -0.5 at 17px)
  normal: 0,     // body text
  wide: 0.5,     // uppercase labels, badges (0.05em)
  wider: 1.2,    // tiny caps, section headers (0.12em)
  widest: 1.5,   // section headers — homepage standard (0.115em)
};

// ── Spacing Scale (strict 8px grid) ───────────────────────────────────────────
// Named keys for tokens.js consumers (HomeScreen, ProfileScreen, etc.)
// Numeric keys for theme.js consumers (CartScreen, ExploreScreen, ProductDetailScreen)
// Both resolve to identical pixel values.
export const space = {
  // Named (tokens.js standard)
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
  // Numeric aliases (theme.js / legacy compatibility)
  1: 4,   // micro gaps
  2: 8,   // icon-to-text gaps
  3: 12,  // inner card padding
  4: 16,  // standard component padding
  5: 20,  // screen horizontal padding
  6: 24,  // between major sections
  8: 32,  // between full page sections

  // Design system hairline (Part 1.1: --space-2)
  hairline: 2,
};

// ── Corner Radius — 4-tier system ─────────────────────────────────────────────
export const radius = {
  badge: 6,   // all badges: style, status, external — consistent across app
  sm: 8,      // chips, small interactive elements, quantity steppers
  md: 12,     // ALL cards (cardBorderRadius), buttons, inputs
  lg: 16,     // images inside cards, secondary containers
  xl: 20,     // outer cards, main containers, bottom sheets
  button: 24, // all pill-shaped buttons (primary + secondary)
  full: 9999, // avatars, circular FABs only
};

// ── Elevation / Shadows ────────────────────────────────────────────────────────
// Named (low/medium/high) for tokens.js consumers.
// Aliased (sm/md/lg) for theme.js consumers — values match the original theme.js spec.
export const shadow = {
  // Tokens.js standard
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
  // Theme.js aliases — preserve original values so existing screens render identically
  sm: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  md: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.10,
    shadowRadius: 16,
    elevation: 5,
  },
  lg: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 32,
    elevation: 10,
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
    fontFamily: 'KantumruyPro_700Bold',
  },
  screenTitleLarge: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
    lineHeight: fontSize['2xl'] * 1.15,
    color: palette.textPrimary,
    fontFamily: 'KantumruyPro_700Bold',
  },

  // Product name on cards
  productName: {
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
    lineHeight: fontSize.md * 1.3,
    fontFamily: 'KantumruyPro_700Bold',
  },

  // Price in lists
  priceList: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
    fontVariant: ['tabular-nums'],
    color: palette.textPrimary,
    fontFamily: 'KantumruyPro_700Bold',
  },

  // Price on PDP
  pricePDP: {
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.tight,
    fontVariant: ['tabular-nums'],
    color: palette.textPrimary,
    fontFamily: 'KantumruyPro_700Bold',
  },

  // Brand names / source labels
  brandName: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    opacity: opacity.secondary,
    fontFamily: 'KantumruyPro_400Regular',
  },

  // Metadata (shipping, stock counts, captions)
  metadata: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.regular,
    opacity: opacity.tertiary,
    lineHeight: fontSize.xs * 1.5,
    fontFamily: 'KantumruyPro_400Regular',
  },

  // Section headers ("PRODUCTS IN THIS LOOK")
  sectionHeader: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    letterSpacing: letterSpacing.wider,
    textTransform: 'uppercase',
    opacity: opacity.tertiary,
    marginBottom: space.base,
    fontFamily: 'KantumruyPro_700Bold',
  },

  // Body text
  body: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    opacity: opacity.secondary,
    lineHeight: fontSize.base * 1.6,
    fontFamily: 'KantumruyPro_400Regular',
  },
};

// ── Homepage Text Styles (from UI upgrade plan) ───────────────────────────────
export const homeTypography = {
  sectionHeader: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    fontFamily: 'KantumruyPro_700Bold',
  },
  seeAllLink: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'KantumruyPro_600SemiBold',
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'KantumruyPro_600SemiBold',
  },
  cardSubtitle: {
    fontSize: 12,
    fontWeight: '400',
    fontFamily: 'KantumruyPro_400Regular',
  },
  cardBadge: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    fontFamily: 'KantumruyPro_700Bold',
  },
  price: {
    fontSize: 16,
    fontWeight: '700',
    fontFamily: 'KantumruyPro_700Bold',
  },
  body: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'KantumruyPro_400Regular',
  },
};

// ── Section Backgrounds (alternating rhythm) ──────────────────────────────────
export const backgrounds = {
  primary: '#FFFFFF',   // default section background
  secondary: '#F8F9FA', // alternating section background
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
  screenPaddingH: space.lg,             // 20 — consistent on every screen
  screenPaddingTop: space.xl,           // 24 — below status bar
  screenPaddingBottom: space['2xl'],    // 32 — above tab bar
  sectionGap: space['2xl'],             // 32 — between unrelated sections
  sectionHeaderToContent: space.base,   // 16 — header to first card below
  cardInnerPadding: space.md,           // 12 — card internal padding
  cardGap: space.md,                    // 12 — horizontal gap between cards
  relatedGap: space.md,                 // 12 — between related list items
  buttonHeight: space['5xl'],           // 56 — sticky bottom buttons
  buttonHeightMd: 52,                   // medium buttons
  buttonHeightSm: 36,                   // small buttons (Edit Profile, Follow)
  tabBarHeight: 88,                     // total including safe area
  tabBarBaseHeight: 56,
  fabSize: 56,
  fabIconSize: 26,
  avatarSizeLg: 88,
  avatarSizeMd: 40,
  avatarSizeSm: 36,
};

// ── Design System Type Scale (Part 1.2 of upgrade plan) ──────────────────────
// These 10 named styles are the ONLY text styles allowed across the entire app.
// Every text element maps to exactly one of these. No exceptions.
export const typeScale = {
  display: {
    fontSize: 24, fontWeight: '700', lineHeight: 30,
    fontFamily: 'KantumruyPro_700Bold',
  },
  title: {
    fontSize: 18, fontWeight: '700', lineHeight: 24,
    fontFamily: 'KantumruyPro_700Bold',
  },
  headline: {
    fontSize: 15, fontWeight: '600', lineHeight: 20,
    fontFamily: 'KantumruyPro_600SemiBold',
  },
  subheadline: {
    fontSize: 13, fontWeight: '600', lineHeight: 18,
    letterSpacing: 1.2, textTransform: 'uppercase',
    fontFamily: 'KantumruyPro_600SemiBold',
  },
  body: {
    fontSize: 14, fontWeight: '400', lineHeight: 20,
    fontFamily: 'KantumruyPro_400Regular',
  },
  caption: {
    fontSize: 12, fontWeight: '400', lineHeight: 16,
    fontFamily: 'KantumruyPro_400Regular',
  },
  micro: {
    fontSize: 11, fontWeight: '600', lineHeight: 14,
    letterSpacing: 0.5, textTransform: 'uppercase',
    fontFamily: 'KantumruyPro_600SemiBold',
  },
  price: {
    fontSize: 16, fontWeight: '700', lineHeight: 20,
    fontFamily: 'KantumruyPro_700Bold',
  },
  priceSmall: {
    fontSize: 14, fontWeight: '600', lineHeight: 18,
    fontFamily: 'KantumruyPro_600SemiBold',
  },
  button: {
    fontSize: 14, fontWeight: '600', lineHeight: 18,
    fontFamily: 'KantumruyPro_600SemiBold',
  },
};

// ── Elevation Tokens (Part 1.4) ───────────────────────────────────────────────
// elevation0 → flat with border (cards on white bg)
// elevation1 → sticky headers, dropdowns
// elevation2 → modals, bottom sheets, FAB
// elevation3 → full-screen overlays, toasts
export const elevation = {
  0: {
    shadowColor: 'transparent',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    elevation: 0,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  1: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  2: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5,
  },
  3: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.16,
    shadowRadius: 24,
    elevation: 10,
  },
};

// ── Touch Target Minimums (Part 1.5) ─────────────────────────────────────────
export const touchTargets = {
  min: 44,      // Apple HIG minimum tappable area
  compact: 36,  // Dense list items, secondary actions
  iconTapArea: 44, // Icon visual may be 20px but tap target is always 44
};

// ── Motion / Animation (Part 3 — design system spec) ─────────────────────────
// Use these for new/updated components. The `animation` export above is the
// legacy set; `motion` is the locked design system spec.
export const motion = {
  // Durations
  durationFast: 150,    // button press states, toggle switches
  durationNormal: 250,  // page transitions, card expansions
  durationSlow: 400,    // modal appearances, bottom sheet slides

  // Easing (as bezier arrays for Easing.bezier() or CSS cubic-bezier)
  easingDefault: [0.25, 0.1, 0.25, 1.0],   // smooth and natural
  easingSpring: [0.34, 1.56, 0.64, 1.0],   // slight overshoot — playful

  // Press state scale
  cardPressScale: 0.98,
  iconPressOpacity: 0.6,
  listRowPressBackground: 'rgba(0,0,0,0.04)',
};

// ── Default export: everything as a single object ─────────────────────────────
// ── Room Chip Backgrounds — used by HomeScreen room-type nav ──────────────────
export const roomChipColors = {
  'living-room': '#E8F0FA',
  'bedroom':     '#EEF1FD',
  'kitchen':     '#FDF4EC',
  'dining-room': '#ECFAF3',
  'office':      '#E8F0FA',
  'outdoor':     '#EAF6EE',
  'bathroom':    '#F3EEFF',
};

const tokens = {
  fonts,
  palette,
  uiColors,
  fontSize,
  typography,
  typeScale,
  fontWeight,
  letterSpacing,
  space,
  radius,
  shadow,
  elevation,
  border,
  opacity,
  touchTargets,
  textStyles,
  homeTypography,
  backgrounds,
  animation,
  motion,
  layout,
};

export default tokens;
