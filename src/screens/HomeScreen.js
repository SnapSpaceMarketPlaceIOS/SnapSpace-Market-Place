import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Dimensions,
  Animated,
  Easing,
  ScrollView,
  Image,
  Alert,
  Platform,
  Keyboard,
  Modal,
  FlatList,
  Share,
  Linking,
  AppState,
  Pressable,
} from 'react-native';
import { BlurView } from 'expo-blur';
// expo-sharing requires native module not in dev client — use RN Share instead
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
let MediaLibrary = null;
try { MediaLibrary = require('expo-media-library'); } catch {} // optional — needs dev client rebuild
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle, Line, Polyline, Rect, Ellipse, G, Defs, LinearGradient as SvgLinearGradient, Stop } from 'react-native-svg';
import LensLoader from '../components/LensLoader';
import { LinearGradient } from 'expo-linear-gradient';
import { fontSize, fontWeight, letterSpacing, palette, space, radius, shadow, typeScale, roomChipColors } from '../constants/tokens';
import { colors as C } from '../constants/theme';
import SectionHeader from '../components/ds/SectionHeader';
import Badge, { HeartCountPill } from '../components/ds/Badge';
import CardImage from '../components/CardImage';
import AutoImage from '../components/AutoImage';
import { useAuth } from '../context/AuthContext';
import { useLiked } from '../context/LikedContext';
import { useCart } from '../context/CartContext';
import { DESIGNS } from '../data/designs';
import { SELLERS } from '../data/sellers';
import { searchProducts, getSourceColor, getProductsForPrompt, getNormalizedProductsByIds } from '../services/affiliateProducts';
import { loadProductHistory, appendPicksToHistory } from '../services/productHistory';
import { parseDesignPrompt } from '../utils/promptParser';
import { buildFinalPrompt, generateWithProductPanel, generateWithProductRefs, generateSingleProductInRoom, pickAspectRatio } from '../services/aiProvider';
import { expandPrompt } from '../services/promptExpander';
import { createProductPanel } from '../utils/createProductPanel';
import { withTimeout } from '../utils/withTimeout';
import { readFileExifOrientation, readFileExif, getLastFileExifError } from '../utils/imageOptimizer';
import { verifyGeneratedProducts } from '../services/visionMatcher';
import { PRODUCT_CATALOG } from '../data/productCatalog';
import { saveUserDesign, updateDesignVisibility, uploadRoomPhoto, recordGenerationError } from '../services/supabase';
import { safeOpenURL } from '../utils/safeOpenURL';
import Constants from 'expo-constants';
import { useSubscription } from '../context/SubscriptionContext';
import { generateWithBFL } from '../services/bfl';
import TabScreenFade from '../components/TabScreenFade';
import ProductVisualizeModal from '../components/ProductVisualizeModal';
import GenieLoader from '../components/GenieLoader';
import { sendNotificationIfEnabled } from '../services/notifications';
import { useOnboarding, ONBOARDING_STEPS } from '../context/OnboardingContext';
import OnboardingOverlay, { OnboardingGlow } from '../components/OnboardingOverlay';
import StyleCarousel from '../components/StyleCarousel';
import { STYLE_PRESETS, pickPromptVariation } from '../data/stylePresets';
import { appendStyleHistory } from '../utils/pickRemixStyle';

const { width, height } = Dimensions.get('window');

// ── URL pre-flight ─────────────────────────────────────────────────────────
// Flux-2-max fails the ENTIRE prediction if ANY input_images URL is either:
//   1) non-200 (e.g. stale Amazon affiliate URL → 404), or
//   2) served with a content-type it can't decode. flux-2-max accepts only
//      jpeg, png, gif, and webp — anything else (notably AVIF, which iOS 26
//      simulators return from the photo library) throws E006 "invalid input"
//      at "Processing input image" before generation even starts.
//
// We check every URL in parallel with a tight timeout and drop any that fail
// either check. Rejected products are still shown in the UI (the Shop Your
// Room cards), but they aren't sent to flux so they can't crash the call.
const PREFLIGHT_TIMEOUT_MS = 2500;
const FLUX_SUPPORTED_MIMES = new Set([
  'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp',
]);

async function preflightUrl(url) {
  // We try HEAD first (cheapest), then fall back to GET (no Range — some CDNs
  // including parts of Amazon's image CDN reject Range with 416/400 even when
  // the same URL serves perfectly to <Image>). On any error we DIAGNOSE then
  // FAIL OPEN — assume the URL is reachable and let the AI decide. Dropping
  // products silently is worse than letting the AI try and gracefully fall back,
  // because a dropped product means the AI generates the room from text alone
  // and the rendered furniture doesn't match what the user is buying.
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PREFLIGHT_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
    } catch (headErr) {
      // Some CDNs don't allow HEAD — fall through to GET below
      res = null;
    }
    if (!res || (res.status >= 400 && res.status < 500)) {
      // HEAD returned a 4xx (often because of Range/HEAD policy). Retry as GET
      // without a Range header. We'll abort the body read by aborting the
      // controller right after we have headers.
      res = await fetch(url, { method: 'GET', signal: ctrl.signal });
    }
    clearTimeout(timer);
    const reachable = res.status >= 200 && res.status < 400;
    if (!reachable) {
      console.warn(`[preflight] ${url.substring(0, 80)} → HTTP ${res.status} (treating as reachable, fail-open)`);
      return true; // FAIL OPEN: let the AI try, it'll fallback if the URL is truly bad
    }
    // Verify the CDN is actually serving a flux-compatible format.
    // Strip any "; charset=..." suffix before comparing.
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (ct && !FLUX_SUPPORTED_MIMES.has(ct)) {
      // Common case: Amazon serves jpegs but content-type may be missing or odd.
      // Don't drop just because we don't recognize the type — log and trust.
      console.warn(`[preflight] ${url.substring(0, 80)} served as ${ct} (treating as reachable, fail-open)`);
      return true;
    }
    return true;
  } catch (e) {
    // Network/timeout/abort. We don't know if the URL is bad — assume good.
    console.warn(`[preflight] ${url.substring(0, 80)} check failed: ${e?.message || e} (treating as reachable, fail-open)`);
    return true;
  }
}

async function filterReachableProducts(products) {
  if (!products || products.length === 0) return [];
  const checks = await Promise.all(products.map(async p => {
    if (!p?.imageUrl || typeof p.imageUrl !== 'string' || !p.imageUrl.startsWith('http')) {
      return null;
    }
    const ok = await preflightUrl(p.imageUrl);
    return ok ? p : null;
  }));
  return checks.filter(Boolean);
}

const CARD_W = width * 0.50;
const COLL_CARD_W = (width - space.lg * 2 - space.sm) / 2;
const STYLE_CARD_W = Math.floor((width - space.lg * 2 - space.sm) / 2.3);
const ARRIVAL_CARD_W = Math.round(width * 0.42);

// Seller lookup map: handle → seller object
const SELLER_MAP = SELLERS.reduce((acc, s) => { acc[s.handle] = s; return acc; }, {});


// ── Room type quick-nav ────────────────────────────────────────────────────────
const ROOM_TYPES = [
  { key: 'living-room', label: 'Living',    bg: roomChipColors['living-room'] },
  { key: 'dining-room', label: 'Dining',    bg: roomChipColors['dining-room'] },
  { key: 'bedroom',     label: 'Bedroom',   bg: roomChipColors['bedroom'] },
  { key: 'kitchen',     label: 'Kitchen',   bg: roomChipColors['kitchen'] },
  { key: 'office',      label: 'Office',    bg: roomChipColors['office'] },
  { key: 'dorm',        label: 'Dorms',     bg: roomChipColors['dorm'] },
  { key: 'outdoor',     label: 'Outdoor',   bg: roomChipColors['outdoor'] },
];

const NEW_ROOM_KEYS = ['dorm'];

// Room icon palette — each room gets a distinct accent within brand harmony
const RI = {
  blue:   '#0B6DC3',  // Living, Office
  navy:   '#3B5998',  // Bedroom
  warm:   '#D4855C',  // Kitchen
  green:  '#3A9E6B',  // Dining, Outdoor
  purple: '#7B5EA7',  // Dorms
  gold:   '#C4934A',  // Entryway
};

// ── Star rating helper ─────────────────────────────────────────────────────────
function renderStars(rating) {
  const filled = Math.round(rating || 0);
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

function RoomIcon({ roomKey, size = 28 }) {
  const sw = 1.3;

  switch (roomKey) {
    // ── Living Room — clearly a sofa with armrests, seat, back cushions ──────
    case 'living-room':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Left armrest */}
          <Rect x="1.5" y="9" width="3" height="7.5" rx="1.5" fill={RI.blue} opacity="0.35" stroke={RI.blue} strokeWidth={sw} />
          {/* Right armrest */}
          <Rect x="19.5" y="9" width="3" height="7.5" rx="1.5" fill={RI.blue} opacity="0.35" stroke={RI.blue} strokeWidth={sw} />
          {/* Seat cushion */}
          <Rect x="4" y="13" width="16" height="3.5" rx="1" fill={RI.blue} opacity="0.15" stroke={RI.blue} strokeWidth={sw} />
          {/* Left back cushion */}
          <Rect x="4.5" y="7" width="7" height="6.5" rx="1.5" fill={RI.blue} opacity="0.2" stroke={RI.blue} strokeWidth={sw} />
          {/* Right back cushion */}
          <Rect x="12.5" y="7" width="7" height="6.5" rx="1.5" fill={RI.blue} opacity="0.2" stroke={RI.blue} strokeWidth={sw} />
          {/* Legs */}
          <Line x1="6" y1="16.5" x2="6" y2="19" stroke={RI.blue} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="18" y1="16.5" x2="18" y2="19" stroke={RI.blue} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    // ── Dining Room — rectangular table with 4 chairs clearly visible ────────
    case 'dining-room':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Table top — wide rectangle */}
          <Rect x="4" y="10" width="16" height="4" rx="1" fill={RI.green} opacity="0.18" stroke={RI.green} strokeWidth={sw} />
          {/* Table legs */}
          <Line x1="6" y1="14" x2="6" y2="19" stroke={RI.green} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="18" y1="14" x2="18" y2="19" stroke={RI.green} strokeWidth={sw} strokeLinecap="round" />
          {/* Top chairs — two chair backs above table */}
          <Rect x="7" y="4" width="3" height="5" rx="1" stroke={RI.green} strokeWidth={sw} opacity="0.6" />
          <Rect x="14" y="4" width="3" height="5" rx="1" stroke={RI.green} strokeWidth={sw} opacity="0.6" />
          {/* Bottom chairs — two chair seats below table */}
          <Rect x="7" y="15" width="3" height="5" rx="1" stroke={RI.green} strokeWidth={sw} opacity="0.6" />
          <Rect x="14" y="15" width="3" height="5" rx="1" stroke={RI.green} strokeWidth={sw} opacity="0.6" />
        </Svg>
      );

    // ── Bedroom — clearly a bed with tall headboard, 2 pillows, blanket ─────
    case 'bedroom':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Headboard — tall and prominent */}
          <Rect x="2" y="3" width="20" height="8" rx="2" fill={RI.navy} opacity="0.15" stroke={RI.navy} strokeWidth={sw} />
          {/* Left pillow */}
          <Rect x="3.5" y="5" width="7" height="4" rx="2" fill={RI.navy} opacity="0.3" />
          {/* Right pillow */}
          <Rect x="13.5" y="5" width="7" height="4" rx="2" fill={RI.navy} opacity="0.3" />
          {/* Mattress / blanket area */}
          <Rect x="2" y="11" width="20" height="7" rx="1.5" fill={RI.navy} opacity="0.08" stroke={RI.navy} strokeWidth={sw} />
          {/* Blanket fold line */}
          <Path d="M2 14 Q12 16 22 14" stroke={RI.navy} strokeWidth={sw} fill="none" opacity="0.3" strokeLinecap="round" />
          {/* Legs */}
          <Line x1="4" y1="18" x2="4" y2="21" stroke={RI.navy} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="20" y1="18" x2="20" y2="21" stroke={RI.navy} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    // ── Kitchen — stove with 4 burners on top, oven door with handle ────────
    case 'kitchen':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Stove body */}
          <Rect x="3" y="3" width="18" height="18" rx="2" fill={RI.warm} opacity="0.08" stroke={RI.warm} strokeWidth={sw} />
          {/* 4 burners — 2x2 grid, clearly circular */}
          <Circle cx="8" cy="7.5" r="2" stroke={RI.warm} strokeWidth={sw} />
          <Circle cx="16" cy="7.5" r="2" stroke={RI.warm} strokeWidth={sw} />
          <Circle cx="8" cy="7.5" r="0.6" fill={RI.warm} />
          <Circle cx="16" cy="7.5" r="0.6" fill={RI.warm} />
          {/* Oven door — clearly a rectangular window */}
          <Rect x="5" y="13" width="14" height="6" rx="1" fill={RI.warm} opacity="0.12" stroke={RI.warm} strokeWidth={sw} />
          {/* Oven handle — prominent bar */}
          <Line x1="7" y1="14.5" x2="17" y2="14.5" stroke={RI.warm} strokeWidth="1.8" strokeLinecap="round" />
        </Svg>
      );

    // ── Office — monitor on stand with keyboard on desk ─────────────────────
    case 'office':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Monitor screen */}
          <Rect x="4" y="2" width="16" height="10" rx="1.5" fill={RI.blue} opacity="0.12" stroke={RI.blue} strokeWidth={sw} />
          {/* Screen glare */}
          <Rect x="6" y="4" width="12" height="6" rx="0.5" fill={RI.blue} opacity="0.06" />
          {/* Monitor stand neck */}
          <Line x1="12" y1="12" x2="12" y2="15" stroke={RI.blue} strokeWidth="1.6" strokeLinecap="round" />
          {/* Monitor stand base */}
          <Line x1="8" y1="15" x2="16" y2="15" stroke={RI.blue} strokeWidth="1.6" strokeLinecap="round" />
          {/* Desk surface */}
          <Line x1="2" y1="17" x2="22" y2="17" stroke={RI.blue} strokeWidth={sw} strokeLinecap="round" />
          {/* Keyboard */}
          <Rect x="6" y="18.5" width="12" height="2.5" rx="1" fill={RI.blue} opacity="0.12" stroke={RI.blue} strokeWidth={sw} />
          <Line x1="8" y1="19.8" x2="16" y2="19.8" stroke={RI.blue} strokeWidth="0.8" strokeLinecap="round" opacity="0.4" />
        </Svg>
      );

    // ── Dorms — bunk bed / loft bed clearly recognizable ────────────────────
    case 'dorm':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Left post — full height */}
          <Line x1="3" y1="2" x2="3" y2="22" stroke={RI.purple} strokeWidth={sw} strokeLinecap="round" />
          {/* Right post — full height */}
          <Line x1="21" y1="2" x2="21" y2="22" stroke={RI.purple} strokeWidth={sw} strokeLinecap="round" />
          {/* Top bunk mattress */}
          <Rect x="3" y="5" width="18" height="4" rx="1" fill={RI.purple} opacity="0.15" stroke={RI.purple} strokeWidth={sw} />
          {/* Top bunk pillow */}
          <Rect x="4.5" y="5.8" width="5" height="2.4" rx="1.2" fill={RI.purple} opacity="0.3" />
          {/* Bottom bunk mattress */}
          <Rect x="3" y="14" width="18" height="4" rx="1" fill={RI.purple} opacity="0.15" stroke={RI.purple} strokeWidth={sw} />
          {/* Bottom bunk pillow */}
          <Rect x="4.5" y="14.8" width="5" height="2.4" rx="1.2" fill={RI.purple} opacity="0.3" />
          {/* Ladder rungs on right side */}
          <Line x1="19" y1="10" x2="21" y2="10" stroke={RI.purple} strokeWidth={sw} strokeLinecap="round" opacity="0.5" />
          <Line x1="19" y1="12.5" x2="21" y2="12.5" stroke={RI.purple} strokeWidth={sw} strokeLinecap="round" opacity="0.5" />
        </Svg>
      );

    // ── Outdoor — patio table with umbrella + sun ────────────────────────────
    case 'outdoor':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Umbrella canopy */}
          <Path d="M4 10 Q12 3 20 10" fill={RI.green} opacity="0.15" stroke={RI.green} strokeWidth={sw} strokeLinecap="round" />
          {/* Umbrella pole */}
          <Line x1="12" y1="10" x2="12" y2="18" stroke={RI.green} strokeWidth={sw} strokeLinecap="round" />
          {/* Table surface */}
          <Line x1="6" y1="15" x2="18" y2="15" stroke={RI.green} strokeWidth="1.6" strokeLinecap="round" />
          {/* Table legs */}
          <Line x1="7" y1="15" x2="6" y2="19" stroke={RI.green} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="17" y1="15" x2="18" y2="19" stroke={RI.green} strokeWidth={sw} strokeLinecap="round" />
          {/* Ground/grass hints */}
          <Path d="M2 21 Q6 19.5 8 21" stroke={RI.green} strokeWidth={sw} strokeLinecap="round" opacity="0.3" />
          <Path d="M10 21 Q14 19.5 18 21" stroke={RI.green} strokeWidth={sw} strokeLinecap="round" opacity="0.3" />
        </Svg>
      );

    // ── Entryway — front door with sidelights, clearly a doorway ────────────
    case 'entryway':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Door frame */}
          <Path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17" stroke={RI.gold} strokeWidth={sw} strokeLinejoin="round" />
          {/* Door panel */}
          <Rect x="7" y="5" width="10" height="16" rx="0.5" fill={RI.gold} opacity="0.1" stroke={RI.gold} strokeWidth={sw} />
          {/* Upper door panel detail */}
          <Rect x="8.5" y="6.5" width="7" height="5" rx="0.5" fill={RI.gold} opacity="0.08" stroke={RI.gold} strokeWidth={sw} opacity="0.5" />
          {/* Lower door panel detail */}
          <Rect x="8.5" y="13" width="7" height="6" rx="0.5" fill={RI.gold} opacity="0.08" stroke={RI.gold} strokeWidth={sw} opacity="0.5" />
          {/* Door knob — clearly visible */}
          <Circle cx="15" cy="13" r="1" fill={RI.gold} opacity="0.7" />
          {/* Floor line */}
          <Line x1="3" y1="21" x2="21" y2="21" stroke={RI.gold} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    default:
      return null;
  }
}

// ── Hero slideshow images — user-provided Cosmos reference photos ────────────
const HERO_IMAGES = [
  require('../../assets/cosmos-1.jpeg'),
  require('../../assets/cosmos-2.jpeg'),
  require('../../assets/cosmos-3.jpeg'),
  require('../../assets/cosmos-4.jpeg'),
  require('../../assets/cosmos-5.jpeg'),
  require('../../assets/cosmos-6.jpeg'),
  require('../../assets/cosmos-7.jpeg'),
];
const HERO_INTERVAL = 5500;  // 5.5 seconds between transitions
const HERO_FADE_MS  = 1200;  // 1.2 second smooth crossfade

// ── Style category chips with preview image ────────────────────────────────────
// Local assets for curated styles (permanent, no CDN expiry)
const STYLE_IMG_JAPANDI      = require('../assets/styles/Japandi.jpg');
const STYLE_IMG_SCANDI       = require('../assets/styles/Scandanavian.jpg');
const STYLE_IMG_MINIMALIST   = require('../assets/styles/Minimalist.jpg');
const STYLE_IMG_GLAM         = require('../assets/styles/glam.jpg');
const STYLE_IMG_MODERN       = require('../assets/styles/Modern.jpg');

const STYLE_CATEGORIES = [
  { key: 'japandi',     label: 'Japandi',     sub: 'Refined Calm',
    bg: '#F0FDF4', text: '#166534', accent: '#16A34A',
    localImage: STYLE_IMG_JAPANDI,    nativeW: 600,  nativeH: 750 },
  { key: 'scandi',      label: 'Scandi',      sub: 'Pure & Airy',
    bg: '#EFF6FF', text: '#1E40AF', accent: '#3B82F6',
    localImage: STYLE_IMG_SCANDI,     nativeW: 600,  nativeH: 750 },
  { key: 'minimalist',  label: 'Minimalist',  sub: 'Less Is More',
    bg: '#F3F4F6', text: '#111827', accent: '#374151',
    localImage: STYLE_IMG_MINIMALIST, nativeW: 600,  nativeH: 750 },
  { key: 'luxury',      label: 'Glam',        sub: 'Opulent Edge',
    bg: '#F5F3FF', text: '#5B21B6', accent: '#7C3AED',
    localImage: STYLE_IMG_GLAM,       nativeW: 736,  nativeH: 1031 },
  { key: 'modern',      label: 'Modern',      sub: 'Clean & Current',
    bg: '#F8FAFC', text: '#0F172A', accent: '#334155',
    localImage: STYLE_IMG_MODERN,     nativeW: 900,  nativeH: 1124 },
  { key: 'mid-century', label: 'Mid-Century', sub: 'Bold Heritage',
    bg: '#FFF7ED', text: '#9A3412', accent: '#EA580C',
    imageUrl: 'https://images.unsplash.com/photo-1541085929911-dea736e9287b?w=600&q=85' },
  { key: 'dark-luxe',   label: 'Dark Luxe',   sub: 'Moody & Rich',
    bg: '#1E1B4B', text: '#C7D2FE', accent: '#818CF8',
    imageUrl: 'https://images.unsplash.com/photo-1668089677938-b52086753f77?w=600&q=85' },
  { key: 'bohemian',    label: 'Boho',        sub: 'Free Spirit',
    bg: '#FEF3C7', text: '#92400E', accent: '#D97706',
    imageUrl: 'https://images.unsplash.com/photo-1632119580908-ae947d4c7691?w=600&q=85' },
  { key: 'farmhouse',   label: 'Farmhouse',   sub: 'Warm & Rooted',
    bg: '#FAF6F0', text: '#713F12', accent: '#A16207',
    imageUrl: 'https://images.unsplash.com/photo-1764076327046-fe35f955cba1?w=600&q=85' },
  { key: 'coastal',     label: 'Coastal',     sub: 'Breezy & Light',
    bg: '#F0F9FF', text: '#0C4A6E', accent: '#0EA5E9',
    imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&q=85' },
];

// Product counts per style (computed once at module load)
const STYLE_PRODUCT_COUNTS = Object.fromEntries(
  STYLE_CATEGORIES.map(cat => [
    cat.key,
    searchProducts({ style: cat.key, limit: 999 }).length,
  ])
);

// ── New Arrivals — first 4 products from catalog ───────────────────────────────
const NEW_ARRIVAL_PRODUCTS = PRODUCT_CATALOG.slice(0, 4);

// ── Style label display map ────────────────────────────────────────────────────
const STYLE_LABEL_MAP = {
  minimalist: 'Minimalist', scandi: 'Scandi', bohemian: 'Boho',
  luxury: 'Luxury', japandi: 'Japandi', 'mid-century': 'Mid-Century',
  'dark-luxe': 'Dark Luxe', farmhouse: 'Farmhouse', biophilic: 'Biophilic',
  glam: 'Glam', rustic: 'Rustic', coastal: 'Coastal', retro: 'Retro',
  'wabi-sabi': 'Wabi-Sabi', industrial: 'Industrial',
};

// ── Derived static data ────────────────────────────────────────────────────────
const TRENDING_DESIGNS   = [...DESIGNS].sort((a, b) => b.likes - a.likes).slice(0, 8);
const NEW_ARRIVALS       = [...DESIGNS].reverse().slice(0, 8);
// ── Featured Products — hand-curated premium picks with lifestyle photography ──
// Only expensive, hero-worthy items: sofas, beds, rugs, coffee/dining tables,
// and accent chairs that show the product in a fully-furnished room context.
// Keyword search is too loose (leaks cheap white-background items); use explicit
// ASINs so the section stays on-brand as new products are added to the catalog.
const FEATURED_PRODUCT_IDS = [
  'B0CDWS3291', // Acanva Luxury Curved Back Velvet Sofa — $1,797
  'B0DBZ467LQ', // Homary Curva King Boucle Upholstered Platform Bed — $1,429
  'B0DSW5H4Z6', // YOPENG Luxury Curved Boucle Sectional — $1,598
  'B0DYJVQBHH', // Homedot 47" Round Dining Table Set — $999
  'B0FP55743T', // KEIKI 126" Curved Oversized Boucle Sectional — $1,399
  'B0F9KV76QL', // Glintee 49.2" Oval Faux Marble Coffee Table — $416
  'B0D9BGNR7X', // JACH U-Shaped Modular Velvet Sectional — $1,390
  'B0DSM1TXLY', // CAMILSON Swirl Luxury Micro Loop 9x12 Area Rug — $259
];
// Safety rail: drop anything under $200 even if manually added above.
const FEATURED_PRODUCTS = getNormalizedProductsByIds(FEATURED_PRODUCT_IDS)
  .filter((p) => (p.priceValue ?? 0) >= 200);

// ── Today's Highlight — premium sofa/seating pool, rotates every 3 hours ──────
// Ordered by price descending so the most luxurious pieces get equal airtime.
const HIGHLIGHT_IDS = [
  'B0CDWS3291', // Acanva Luxury Curved Back Velvet Sofa — $1,797
  'B0DSW5H4Z6', // YOPENG Luxury Curved Boucle Sectional — $1,598
  'B0FP55743T', // KEIKI 126" Curved Oversized Boucle Sectional — $1,399
  'B0D9BGNR7X', // JACH U-Shaped Modular Velvet Sectional — $1,390
  'B0DYD79JC6', // KEIKI 103" Boucle Half Moon Sectional — $1,300
  'B0FMR36SC4', // gaoyangjiaju Mid-Century Leather Sofa — $1,063
  'B0DDQ3273X', // YOPENG 82" Modern Boucle Cloud Sofa — $879
  'B0FB99BP2J', // Christopher Knight Modular Boucle Sofa — $724
  'B0G7BT3HRC', // CHITA Curved Cloud Chenille Sofa — $600
];
const HIGHLIGHT_POOL = HIGHLIGHT_IDS
  .map(id => PRODUCT_CATALOG.find(p => p.id === id))
  .filter(Boolean);

// ─── Icons ────────────────────────────────────────────────────────────────────

function BellIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  );
}

function UserIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx={12} cy={7} r={4} />
    </Svg>
  );
}

function SendIcon() {
  // White genie lamp silhouette — replaces paper plane in generate button
  return (
    <Svg width={18} height={18} viewBox="92 176 266 155" fill="none">
      <Path d="M326.155 194.661C306.203 193.551 286.596 223.576 265.287 232.582C259.954 218.661 247.863 208.794 233.603 206.723C231.53 206.386 230.008 204.515 230.02 202.32V201.347C230.044 200.249 230.428 199.189 231.123 198.353C233.699 195.023 234.837 190.732 234.262 186.491C233.675 182.25 231.945 180 228 180C223.945 180 221.632 183.609 221.596 188.674C221.56 192.191 222.71 195.622 224.819 198.353C225.49 199.201 225.862 200.262 225.886 201.347V202.32C225.934 204.441 224.52 206.287 222.53 206.723C206.748 209.006 193.77 220.794 189.432 236.748C178 232.457 167.143 226.669 157.138 219.497C130.008 200.91 117.852 197.824 106.271 197.234C106.271 197.234 104.761 197.234 101.739 199.004L97.5928 201.372V201.385C96.2007 201.953 95.6735 205.674 96.2008 206.672C96.7161 207.67 99.1384 208.944 100.229 209.031C114.118 209.518 127.527 211.489 138.924 219.771C164.952 237.721 180.062 295.913 228.116 295.913C275.031 295.913 295.993 209.304 326.155 209.304C346.886 209.304 342.714 254.499 330.898 264.778C319.082 275.069 307.291 264.503 296.637 264.503C283.719 264.503 284.33 277.476 291.281 278.287C292.862 278.524 294.468 278.05 295.69 276.99C296.925 275.93 297.668 274.37 297.74 272.711C304.33 277.464 312.024 280.283 320.029 280.845C338.699 280.845 354 250.642 354 228.464C353.964 218.248 349.175 195.896 326.155 194.661ZM262.64 247.836C251.579 251.878 239.943 253.936 228.21 253.923C216.502 253.923 204.878 251.877 193.818 247.873C190.93 246.888 189.324 243.67 190.235 240.639C202.326 245.591 215.196 248.123 228.186 248.11C241.176 248.098 254.058 245.566 266.161 240.639C266.593 242.111 266.449 243.682 265.754 245.042C265.059 246.389 263.885 247.399 262.471 247.836H262.64ZM272.322 318.425V318.961C258.158 324.387 243.154 327.106 228.054 326.994C212.955 327.144 197.964 324.462 183.774 319.061V318.524C184.302 316.204 185.704 314.196 187.669 312.973C189.634 311.751 191.995 311.414 194.212 312.038C201.378 314.532 209.275 312.088 213.972 305.925C215.099 304.341 215.974 302.582 216.561 300.711C220.3 301.522 224.098 301.921 227.921 301.921C231.732 301.909 235.519 301.397 239.198 300.374C240.552 305.152 243.763 309.119 248.053 311.339C252.343 313.547 257.316 313.809 261.798 312.038C264.003 311.414 266.364 311.763 268.317 312.986C270.282 314.208 271.673 316.204 272.2 318.524L272.322 318.425Z" fill="#FFFFFF" />
    </Svg>
  );
}

// Full app logo icon — used next to "HomeGenie" text in header
function HeaderLogoIcon({ size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 450 450">
      <Defs>
        <SvgLinearGradient id="hdrBgGrad" x1="225" y1="0" x2="225" y2="450" gradientUnits="userSpaceOnUse">
          <Stop offset="0.144" stopColor="#67ACE9" />
          <Stop offset="0.769" stopColor="#0B6DC3" />
        </SvgLinearGradient>
        <SvgLinearGradient id="hdrGenieGrad" x1="225.6" y1="176" x2="225.6" y2="327" gradientUnits="userSpaceOnUse">
          <Stop offset="0.317" stopColor="#67ACE9" />
          <Stop offset="0.861" stopColor="#0B6DC3" />
        </SvgLinearGradient>
      </Defs>
      <Rect width="450" height="450" rx="100" fill="url(#hdrBgGrad)" />
      <Path fillRule="evenodd" clipRule="evenodd" d="M197 74.5482L79.8429 154.709C69.2396 160.878 64 168.427 64 177.444V356.814C64 374.007 86.7806 388.057 114.655 388.057H334.344C362.219 388.057 385 374.007 385 356.814V177.444C385 168.427 379.74 160.878 369.136 154.709L256.5 74.5483C227.631 57.7131 224.313 57.9218 197 74.5482Z" fill="#FFFFFF" />
      <Circle cx="225" cy="110.548" r="10" fill="#5AA4E4" />
      <Path d="M326.155 194.661C306.203 193.551 286.596 223.576 265.287 232.582C259.954 218.661 247.863 208.794 233.603 206.723C231.53 206.386 230.008 204.515 230.02 202.32V201.347C230.044 200.249 230.428 199.189 231.123 198.353C233.699 195.023 234.837 190.732 234.262 186.491C233.675 182.25 231.945 180 228 180C223.945 180 221.632 183.609 221.596 188.674C221.56 192.191 222.71 195.622 224.819 198.353C225.49 199.201 225.862 200.262 225.886 201.347V202.32C225.934 204.441 224.52 206.287 222.53 206.723C206.748 209.006 193.77 220.794 189.432 236.748C178 232.457 167.143 226.669 157.138 219.497C130.008 200.91 117.852 197.824 106.271 197.234C106.271 197.234 104.761 197.234 101.739 199.004L97.5928 201.372V201.385C96.2007 201.953 95.6735 205.674 96.2008 206.672C96.7161 207.67 99.1384 208.944 100.229 209.031C114.118 209.518 127.527 211.489 138.924 219.771C164.952 237.721 180.062 295.913 228.116 295.913C275.031 295.913 295.993 209.304 326.155 209.304C346.886 209.304 342.714 254.499 330.898 264.778C319.082 275.069 307.291 264.503 296.637 264.503C283.719 264.503 284.33 277.476 291.281 278.287C292.862 278.524 294.468 278.05 295.69 276.99C296.925 275.93 297.668 274.37 297.74 272.711C304.33 277.464 312.024 280.283 320.029 280.845C338.699 280.845 354 250.642 354 228.464C353.964 218.248 349.175 195.896 326.155 194.661ZM262.64 247.836C251.579 251.878 239.943 253.936 228.21 253.923C216.502 253.923 204.878 251.877 193.818 247.873C190.93 246.888 189.324 243.67 190.235 240.639C202.326 245.591 215.196 248.123 228.186 248.11C241.176 248.098 254.058 245.566 266.161 240.639C266.593 242.111 266.449 243.682 265.754 245.042C265.059 246.389 263.885 247.399 262.471 247.836H262.64ZM272.322 318.425V318.961C258.158 324.387 243.154 327.106 228.054 326.994C212.955 327.144 197.964 324.462 183.774 319.061V318.524C184.302 316.204 185.704 314.196 187.669 312.973C189.634 311.751 191.995 311.414 194.212 312.038C201.378 314.532 209.275 312.088 213.972 305.925C215.099 304.341 215.974 302.582 216.561 300.711C220.3 301.522 224.098 301.921 227.921 301.921C231.732 301.909 235.519 301.397 239.198 300.374C240.552 305.152 243.763 309.119 248.053 311.339C252.343 313.547 257.316 313.809 261.798 312.038C264.003 311.414 266.364 311.763 268.317 312.986C270.282 314.208 271.673 316.204 272.2 318.524L272.322 318.425Z" fill="url(#hdrGenieGrad)" />
    </Svg>
  );
}

function CameraSmallIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx={12} cy={13} r={4} />
    </Svg>
  );
}

function GalleryIcon({ size = 20, color = 'rgba(255,255,255,0.9)' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={18} height={18} rx={2} ry={2} />
      <Circle cx={8.5} cy={8.5} r={1.5} />
      <Polyline points="21 15 16 10 5 21" />
    </Svg>
  );
}

function CheckIcon({ size = 10, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="20 6 9 17 4 12" />
    </Svg>
  );
}

function CloseIcon({ size = 20, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

// ── Figma-exact action icons (nodes 531-309, 531-323, 531-313) ────────────────

// 531-309 "Load_circle_light" — download (arrow down + arc tray)
function DownloadIcon({ size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30" fill="none">
      <Path
        d="M6.54815 18.5147C7.04668 20.3752 8.1452 22.0193 9.67334 23.1918C11.2015 24.3644 13.0738 25 15 25C16.9262 25 18.7985 24.3644 20.3267 23.1918C21.8548 22.0193 22.9533 20.3752 23.4519 18.5147"
        stroke="#111827" strokeWidth={1.4} strokeLinecap="round"
      />
      <Path
        d="M15 16.25L14.6877 16.6404L15 16.8903L15.3123 16.6404L15 16.25ZM15.5 5C15.5 4.72386 15.2761 4.5 15 4.5C14.7239 4.5 14.5 4.72386 14.5 5L15 5L15.5 5ZM8.75 11.25L8.43765 11.6404L14.6877 16.6404L15 16.25L15.3123 15.8596L9.06235 10.8596L8.75 11.25ZM15 16.25L15.3123 16.6404L21.5623 11.6404L21.25 11.25L20.9377 10.8596L14.6877 15.8596L15 16.25ZM15 16.25L15.5 16.25L15.5 5L15 5L14.5 5L14.5 16.25L15 16.25Z"
        fill="#111827"
      />
    </Svg>
  );
}

// 531-323 "Subtract" — solid black circle with white + punched through
function PostIcon({ size = 28 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30" fill="none">
      <Path
        d="M15 0C23.2843 0 30 6.71573 30 15C30 23.2843 23.2843 30 15 30C6.71573 30 0 23.2843 0 15C0 6.71573 6.71573 0 15 0ZM15 6.16602C14.7241 6.16602 14.5004 6.39017 14.5 6.66602V14.5H6.66699C6.39085 14.5 6.16699 14.7239 6.16699 15C6.16699 15.2761 6.39085 15.5 6.66699 15.5H14.5V23.333C14.5 23.6091 14.7239 23.833 15 23.833C15.2761 23.833 15.5 23.6091 15.5 23.333V15.5H23.333C23.609 15.4998 23.833 15.276 23.833 15C23.833 14.724 23.609 14.5002 23.333 14.5H15.5V6.66602C15.4996 6.39017 15.2759 6.16602 15 6.16602Z"
        fill="#111827"
      />
    </Svg>
  );
}

// 531-313 "Download_circle_light" — share (arrow up + arc tray)
function ShareIcon({ size = 22 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 30 30" fill="none">
      <Path
        d="M6.54815 18.5147C7.04668 20.3752 8.1452 22.0193 9.67334 23.1918C11.2015 24.3644 13.0738 25 15 25C16.9262 25 18.7985 24.3644 20.3267 23.1918C21.8548 22.0193 22.9533 20.3752 23.4519 18.5147"
        stroke="#111827" strokeWidth={1.4} strokeLinecap="round"
      />
      <Path
        d="M15 5L14.6877 4.60957L15 4.35969L15.3123 4.60957L15 5ZM15.5 16.25C15.5 16.5261 15.2761 16.75 15 16.75C14.7239 16.75 14.5 16.5261 14.5 16.25L15 16.25L15.5 16.25ZM8.75 10L8.43765 9.60957L14.6877 4.60957L15 5L15.3123 5.39043L9.06235 10.3904L8.75 10ZM15 5L15.3123 4.60957L21.5623 9.60957L21.25 10L20.9377 10.3904L14.6877 5.39043L15 5ZM15 5L15.5 5L15.5 16.25L15 16.25L14.5 16.25L14.5 5L15 5Z"
        fill="#111827"
      />
    </Svg>
  );
}

// ── Add All to Cart button — press inverts blue↔white ────────────────────────
function AddAllToCartButton({ products, onAddAll, onViewCart }) {
  const [added, setAdded] = React.useState(false);
  const [pressed, setPressed] = React.useState(false);
  const scale = React.useRef(new Animated.Value(1)).current;

  const handlePressIn = () => {
    setPressed(true);
    Animated.spring(scale, { toValue: 0.97, useNativeDriver: true, speed: 50, bounciness: 0 }).start();
  };
  const handlePressOut = () => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 4 }).start(() => {
      setTimeout(() => setPressed(false), 180);
    });
  };

  const iconColor = pressed ? '#0B6DC3' : '#fff';

  return (
    <Animated.View style={{ transform: [{ scale }], marginHorizontal: 20, marginTop: 16, marginBottom: 4 }}>
      <TouchableOpacity
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 28,
            paddingVertical: 15,
            borderWidth: 2,
          },
          pressed
            ? { backgroundColor: '#fff', borderColor: '#0B6DC3' }
            : { backgroundColor: '#0B6DC3', borderColor: '#0B6DC3' },
        ]}
        activeOpacity={1}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={() => {
          if (added) {
            onViewCart?.();
          } else {
            onAddAll(products);
            setAdded(true);
          }
        }}
      >
        {added ? (
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke={iconColor} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round"
            style={{ marginRight: 8 }}>
            <Polyline points="20 6 9 17 4 12" />
          </Svg>
        ) : (
          <Svg width={18} height={18} viewBox="0 0 24 24" fill="none"
            stroke={iconColor} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"
            style={{ marginRight: 8 }}>
            <Path d="M6 2L3 6v14a2 2 0 002 2h14a2 2 0 002-2V6l-3-4z" />
            <Line x1={3} y1={6} x2={21} y2={6} />
            <Path d="M16 10a4 4 0 01-8 0" />
          </Svg>
        )}
        <Text style={{ color: iconColor, fontSize: 15, fontWeight: '700', letterSpacing: 0.3, fontFamily: 'Geist_700Bold' }}>
          {added ? 'View Cart' : 'Add All to Cart'}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

// ── AI generation helpers ─────────────────────────────────────────────────────

const PROMPT_SUGGESTIONS = [
  'Modern minimalist',
  'Japandi',
  'Dark luxe',
  'Coastal',
  'Boho eclectic',
  'Scandi cozy',
];

const FURNITURE_LABELS = {
  'sofa': 'sofa', 'accent-chair': 'accent chair', 'coffee-table': 'coffee table',
  'rug': 'area rug', 'wall-art': 'wall art', 'mirror': 'floor mirror',
  'bookshelf': 'bookshelf', 'floor-lamp': 'floor lamp', 'bed': 'bed',
  'pendant-light': 'pendant light', 'nightstand': 'nightstand', 'dresser': 'dresser',
};

const VISUAL_WORDS = [
  'boucle','velvet','leather','linen','rattan','marble','glass','wood',
  'walnut','oak','brass','gold','curved','round','oval','modular',
  'cream','beige','white','gray','black','camel','sage','green',
  'navy','teal','brown','natural','woven','jute','ceramic','metal',
  'chrome','copper','mid-century','modern','rustic','industrial',
  'tufted','channel','sectional','l-shaped','swirl','abstract',
  'geometric','wavy','herringbone','bamboo','travertine',
];

function extractVisualHints(name) {
  const lower = name.toLowerCase();
  return VISUAL_WORDS.filter(w => lower.includes(w)).slice(0, 3).join(' ');
}

function buildEnrichedPrompt(userPrompt, products) {
  // Build detailed product hints for the AI prompt.
  // Each hint includes material, color, and shape descriptors extracted from
  // the product name, giving the AI a clear picture of what to render.
  // e.g. "one cream boucle modular sofa, one walnut oval coffee table, one cream swirl area rug"
  const pieces = products.slice(0, 6).map(p => {
    const label = FURNITURE_LABELS[p.category] || p.category.replace(/-/g, ' ');
    const hints = extractVisualHints(p.name);
    return hints ? `one ${hints} ${label}` : `one ${label}`;
  });
  const productHints = pieces.length > 0 ? pieces.join(', ') : null;

  // Use the centralized prompt builder from replicate.js
  // This adds architecture preservation + quality suffix automatically
  return buildFinalPrompt(userPrompt, productHints);
}

// ─── Build 62: Prompt enrichment helpers ──────────────────────────────────────
//
// These add two pieces of structural information to the user's design prompt
// before it reaches FAL/BFL:
//
//   1. Color palette  — derived from parseDesignPrompt's per-category color
//      attribution. "brown leather couch with white rug" → palette has both.
//   2. Cohesive material — if half or more of the matched products share a
//      material (e.g. wood appears in 4 of 6 picks), tell the AI to honor
//      that cohesion in the output.
//
// Both are appended to the raw userPrompt as additional sentences. They flow
// into buildPanelPrompt's "While maintaining this overall style intent: X"
// wrapper. They do NOT replace the user's text; the user-visible prompt on
// the result screen still shows their original input.

/**
 * Convert parseDesignPrompt's colorByCategory map into a human-readable
 * palette string the AI can act on.
 *
 * Example: { sofa: 'brown', rug: 'white' } → "brown sofa, white rug"
 *
 * Returns null when no per-category colors were detected (the matcher's
 * own color scoring still applies; we just don't add a redundant prompt
 * sentence for it).
 */
function buildColorPaletteHint(parsed) {
  if (!parsed?.colorByCategory) return null;
  const entries = Object.entries(parsed.colorByCategory);
  if (entries.length === 0) return null;

  const phrases = entries.map(([cat, color]) => {
    const label = FURNITURE_LABELS[cat] || cat.replace(/-/g, ' ');
    return `${color} ${label}`;
  });
  return phrases.join(', ');
}

/**
 * Find a material that appears in at least half of the matched products.
 * Used to tell the AI "wood throughout" when the catalog match converged on
 * a material the user didn't explicitly call out — improves visual cohesion.
 *
 * Returns null when no material clears the threshold (mixed-material rooms
 * shouldn't be over-constrained by a hint).
 */
function getDominantMaterial(products) {
  if (!Array.isArray(products) || products.length < 2) return null;

  const counts = {};
  for (const p of products) {
    const mats = Array.isArray(p?.materials) ? p.materials : [];
    for (const m of mats) {
      const ml = String(m || '').toLowerCase().trim();
      if (!ml) continue;
      counts[ml] = (counts[ml] || 0) + 1;
    }
  }

  const threshold = Math.ceil(products.length / 2);
  let best = null;
  let bestCount = 0;
  for (const [mat, count] of Object.entries(counts)) {
    if (count >= threshold && count > bestCount) {
      best = mat;
      bestCount = count;
    }
  }
  return best;
}

function ChevronRight({ color = '#fff' }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

function HeartIcon({ size = 12, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function SparkleIcon({ size = 14, color = C.primary }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </Svg>
  );
}

function PaperPlaneIcon({ size = 14, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22 2L11 13"
        stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M22 2L15 22L11 13L2 9L22 2Z"
        stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function TagIcon({ size = 13, color = '#F59E0B' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" />
      <Line x1={7} y1={7} x2={7.01} y2={7} />
    </Svg>
  );
}

function StarIcon({ size = 12, color = '#F59E0B' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
    </Svg>
  );
}

// ─── Amazon Logo Badge ────────────────────────────────────────────────────────

function AmazonBadge() {
  return (
    <View style={amazonBadgeStyle.wrap}>
      <Text style={amazonBadgeStyle.wordmark}>amazon</Text>
      <Svg width={44} height={9} viewBox="0 0 44 9">
        {/* Smile arrow from 'a' to 'z' */}
        <Path
          d="M2 3.5 Q22 9.5 42 3.5"
          stroke="#FF9900"
          strokeWidth={2.5}
          fill="none"
          strokeLinecap="round"
        />
        {/* Arrowhead */}
        <Path
          d="M38.5 1.5 L42 3.5 L38.5 6"
          stroke="#FF9900"
          strokeWidth={2}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const amazonBadgeStyle = StyleSheet.create({
  wrap: {
    backgroundColor: '#fff',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingTop: 5,
    paddingBottom: 4,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  wordmark: {
    fontSize: 11,
    fontWeight: '800',
    fontFamily: 'Geist_700Bold',
    color: '#232F3E',
    letterSpacing: -0.3,
    lineHeight: 13,
  },
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'GOOD MORNING';
  if (hour >= 12 && hour < 17) return 'GOOD AFTERNOON';
  if (hour >= 17 && hour < 21) return 'GOOD EVENING';
  return 'GOOD NIGHT';
}

function getFirstName(user) {
  if (!user) return null;
  const full = user?.user_metadata?.full_name || user?.user_metadata?.name || '';
  return full.split(' ')[0] || null;
}

// ─── Contextual loading messages ─────────────────────────────────────────────

function getLoadingMessages(promptText) {
  const p = (promptText || '').toLowerCase();

  // Extract style, mood, and room keywords from the prompt
  const styles = ['scandinavian','scandi','japandi','minimalist','modern','mid-century','bohemian','boho',
    'industrial','coastal','farmhouse','rustic','art deco','glam','luxury','contemporary','transitional',
    'mediterranean','wabi-sabi','dark luxe','biophilic','french country','maximalist','nordic'];
  const moods = ['cozy','warm','serene','elegant','bold','dramatic','airy','bright','moody','vibrant',
    'calm','refined','inviting','sophisticated','luxurious','eclectic','organic','earthy','sleek','chic'];
  const rooms = ['living room','bedroom','kitchen','dining room','office','bathroom','reading nook',
    'nursery','entryway','studio','lounge','den','patio','balcony','sunroom','home office','loft'];

  const style = styles.find(s => p.includes(s)) || '';
  const mood = moods.find(m => p.includes(m)) || '';
  const room = rooms.find(r => p.includes(r)) || 'space';

  // Style-specific design language
  const styleVerbs = {
    scandinavian: ['Nordic simplicity','natural textures','hygge warmth'],
    scandi: ['Nordic simplicity','natural textures','hygge warmth'],
    japandi: ['wabi-sabi harmony','zen minimalism','organic balance'],
    minimalist: ['clean silhouettes','intentional restraint','breathing room'],
    modern: ['contemporary lines','refined finishes','sculptural forms'],
    'mid-century': ['retro elegance','organic curves','timeless character'],
    bohemian: ['layered patterns','eclectic warmth','global accents'],
    boho: ['layered patterns','eclectic warmth','global accents'],
    industrial: ['raw materials','urban edge','exposed character'],
    coastal: ['ocean-inspired tones','breezy textures','natural light'],
    farmhouse: ['rustic warmth','vintage charm','handcrafted details'],
    'dark luxe': ['moody atmosphere','rich depth','dramatic contrast'],
    glam: ['opulent finishes','statement pieces','refined luxury'],
    luxury: ['opulent finishes','curated elegance','bespoke details'],
  };

  const designDetails = styleVerbs[style] || ['curated details','considered proportions','refined materials'];

  // Build tailored messages
  const messages = [
    `Designing your ${room}…`,
    mood ? `Infusing ${mood} energy into every detail…` : `Shaping the perfect atmosphere…`,
    style ? `Channeling ${style.charAt(0).toUpperCase() + style.slice(1)} design principles…` : `Balancing form and function…`,
    `Layering ${designDetails[0]} with intention…`,
    `Perfecting ${designDetails[1]}…`,
    `Curating ${designDetails[2]}…`,
    `Harmonizing color, light, and texture…`,
    `Adding the finishing touches…`,
  ];

  return messages;
}

// ─── Constants ────────────────────────────────────────────────────────────────
const FIRST_VISIT_KEY = 'snapspace_home_visited';

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation, route }) {
  const { user } = useAuth();
  const {
    subscription, shouldShowPaywall, refreshQuota, recordGeneration,
    tokenBalance, deductToken, refreshTokenBalance,
    refundFailedGeneration,  // B8: re-credit a wish when generation fails
  } = useSubscription();
  const { addToCart, items: cartItems } = useCart();
  const { liked } = useLiked();
  const { isStepActive, nextStep, prevStep, finishOnboarding, startOnboarding, active: onboardingActive, loaded: onboardingLoaded } = useOnboarding();
  const onboardingAttempted = useRef(false); // prevent re-trigger on profile refreshes
  const [prompt, setPrompt] = useState('');
  // Selected style preset (from the StyleCarousel below the input bar).
  // When non-null, the prompt-chip strip above the input bar is replaced
  // with a "selected style" pill (thumbnail + label + prompt preview + ×).
  // Cleared automatically by the effect below if the user edits the prompt
  // away from the preset's exact prompt — at that point the user's writing
  // their own thing and the badge no longer represents what'll generate.
  const [selectedStyle, setSelectedStyle] = useState(null);
  // Counter that bumps every time the prompt is set programmatically (style
  // pick / × clear / post-generation cleanup / Auth-wall restore). The
  // TextInput uses this as its `key`, so each programmatic prompt change
  // forces a full unmount + remount of the native UITextView underneath —
  // which is the only reliable way to drop iOS' cached multiline content
  // height. User-typed input does NOT bump this counter, so cursor position
  // is preserved while the user is actively editing.
  const [textInputResetKey, setTextInputResetKey] = useState(0);
  const bumpInputKey = () => setTextInputResetKey((k) => k + 1);
  useEffect(() => {
    if (selectedStyle && prompt !== selectedStyle.prompt) {
      setSelectedStyle(null);
    }
  }, [prompt, selectedStyle]);
  // The input bar's height is now driven entirely by the multiline
  // TextInput's intrinsic content size (capped by maxHeight on styles.inputBar).
  // We no longer track expansion in React state — the previous approach used
  // an `inputExpanded` boolean to flip border radius, which caused a one-frame
  // flicker on style switches and didn't actually correlate with iOS' real
  // height behavior. Border radius is now a constant (16). All collapse logic
  // for the × button uses `promptInputRef.current?.clear()` to trigger iOS'
  // native height recompute path — the only reliable way to drop the cached
  // multi-line height when the controlled value goes from long → empty.
  const [greeting, setGreeting] = useState(getGreeting());
  const [recentlyViewed, setRecentlyViewed] = useState([]);

  // Design Your Space state
  const [photo, setPhoto] = useState(null);
  const [photoSource, setPhotoSource] = useState(null); // 'camera' | 'library'
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState('');
  // Synchronous in-flight guard to prevent double-tap races. React state
  // updates are batched/async, so two taps within the same frame can both
  // observe `generating === false` and fire concurrent generations —
  // which would let a user sneak past the per-user quota (seen in the DB
  // as `anthonyxinbox` at 6/5 during TestFlight). A ref flips atomically
  // and blocks every subsequent tap until the current run finishes.
  const generatingRef = useRef(false);
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [loadingMessages, setLoadingMessages] = useState([]);
  const loadingMsgOpacity = useRef(new Animated.Value(1)).current;
  const [resultData, setResultData] = useState(null); // { imageUri, resultUri, prompt, products }
  const [showResult, setShowResult] = useState(false);
  // Build 91: climax orchestration state.
  // climaxFiring = true while the GenieLoader plays its 400ms reveal burst.
  // pendingNavRef stashes the RoomResult navigation params so they can be
  // dispatched from onClimaxComplete instead of immediately on result-ready.
  // Together these make the success flow: result ready → setResultData →
  // stopLoadingBar(true) (push progress to 1 → Act III) → setClimaxFiring →
  // GenieLoader bursts → onClimaxComplete → setGenerating(false) + navigate.
  const [climaxFiring, setClimaxFiring] = useState(false);
  const pendingNavRef = useRef(null);
  const [showPostSheet, setShowPostSheet] = useState(false);
  const [posting, setPosting] = useState(false);
  const [autoSavedDesignId, setAutoSavedDesignId] = useState(null);

  // ── Single-product visualize mode ─────────────────────────────────────────
  // Set when user navigates from ProductDetailScreen → SnapScreen → Home
  // with a specific product to place in their room photo.
  const [singleProduct, setSingleProduct] = useState(null);
  const [visualizeResult, setVisualizeResult] = useState(null);

  // ── Generation quota (managed by SubscriptionContext) ────────────────────

  // Loading bar animation
  const loadingProgress = useRef(new Animated.Value(0)).current;
  const loadingAnim = useRef(null);

  // Camera lens loader animation (legacy refs kept for send-button mini spinner)
  const lensRotate  = useRef(new Animated.Value(0)).current;

  // ── Spring press animations (tab-bar style) ──────────────────────────────
  const cameraScale  = useRef(new Animated.Value(1)).current;
  const galleryScale = useRef(new Animated.Value(1)).current;
  const sendScale    = useRef(new Animated.Value(1)).current;
  const inputScale   = useRef(new Animated.Value(1)).current;
  // Ref to the prompt TextInput so the × button on the selected-style pill
  // can call .clear() — iOS' native reset path that recomputes the multiline
  // content height. Setting `value=''` on a controlled multiline TextInput
  // is unreliable for shrinking back to its compact size on iOS.
  const promptInputRef = useRef(null);
  // Tracks the last prompt-variation index shown for each style preset, so
  // consecutive taps of the same card always land on a different variation.
  // useRef instead of state because no UI needs to react to changes — the
  // map just informs pickPromptVariation() which index to AVOID next time.
  // Resets on cold-start (acceptable; user gets full variation cycle each
  // session).
  const lastPromptIdxRef = useRef({});
  // Rolling history of recent style IDs (most-recent-last, capped at 3) — used
  // by the Remix FAB on RoomResultScreen to skip styles the user just saw.
  // This is the SAME 3-deep window enforced by Build 95's anti-repetition rule
  // for fresh carousel taps; remixes inherit it so the experience feels
  // consistent regardless of which entry point triggered the generation.
  // Lives on a ref because the carousel/FAB don't need to re-render on
  // changes — pickRemixStyle just reads the latest snapshot.
  const recentStyleIdsRef = useRef([]);
  // Build 83 — recently-shown product IDs across the last N generations.
  // Used as a soft exclusion hint to getProductsForPrompt so the matcher
  // prefers fresh catalog entries on consecutive generations across different
  // design styles. Soft: if every candidate in a category was recent, the
  // matcher drops the exclusion for that category — quality > variety.
  // RECENT_PRODUCT_WINDOW = 3 generations × ~6 products = up to ~18 IDs in
  // the rolling set, which the matcher uses as a Set lookup.
  const recentProductIdsRef = useRef([]);  // queue of arrays, most-recent-first
  const RECENT_PRODUCT_WINDOW = 3;

  // Build 93 — persistent product-recency history (across app restarts).
  // Loaded once per signed-in user; refreshed whenever auth changes. The
  // matcher reads this snapshot to apply a freshness multiplier in its
  // weighted draw — products seen in recent generations get a 0.3–1.0
  // multiplier (lower = stale, higher = fresh) so the user naturally rotates
  // through their style's catalog instead of seeing the same top scorer every
  // time. Saturation point is per-category-pool-size, so thin styles like
  // Dark Luxe (16 products) degrade gracefully rather than dead-ending.
  //
  // Read-only ref. The matcher consumes a snapshot, then we persist the
  // newly-picked IDs via appendPicksToHistory() AFTER generation completes —
  // the next generation's matcher then sees an updated snapshot via reload.
  const productHistoryRef = useRef({ genIdx: 0, entries: {} });
  useEffect(() => {
    let cancelled = false;
    loadProductHistory(user?.id).then((snap) => {
      if (!cancelled) productHistoryRef.current = snap;
    });
    return () => { cancelled = true; };
  }, [user?.id]);
  const mediaPermGranted = useRef(false);

  // Build 89: removed eager media-library pre-warm. It was a TurboModule
  // call on every cold start asking the OS for photo permission status
  // BEFORE the user had ever expressed interest in the gallery. Better UX:
  // ask only when the user taps the gallery icon (handled by
  // handlePickFromLibrary below), and let mediaPermGranted cache it for
  // subsequent taps. Saves ~50-200ms from the cold path.

  // (Bug 4A useEffect removed — `inputExpanded` no longer exists. The fix
  // it was originally addressing is now handled by promptInputRef.clear()
  // in the × handler, which forces iOS' native height recompute path.)

  // Bug 4B: restore a pending prompt saved by the Auth-wall gate below.
  // When a logged-out user taps Generate, we stash the prompt before
  // navigating to Auth. AuthScreen then does navigation.reset to Main on
  // success, which unmounts the entire tab tree — including this Home
  // screen — and loses in-memory state. On remount we rehydrate so the
  // user lands back on Home with the prompt they originally typed.
  //
  // 5-minute TTL so a prompt abandoned last week doesn't resurrect out
  // of nowhere. Best-effort: any JSON/storage error falls through to a
  // clean empty state.
  // Build 89: batched the two on-mount AsyncStorage reads (pending prompt +
  // recently viewed) into a single multiGet. iOS 26's AsyncStorage TurboModule
  // serialises calls — separate getItems contend on the same single-threaded
  // bridge. multiGet returns both keys in one round-trip.
  useEffect(() => {
    (async () => {
      try {
        const pairs = await AsyncStorage.multiGet([
          '@homegenie_pending_prompt',
          'snapspace_recently_viewed',
        ]);
        const map = Object.fromEntries(pairs);
        const pendingRaw = map['@homegenie_pending_prompt'];
        const recentRaw = map['snapspace_recently_viewed'];

        // Hydrate recently viewed first (cheap, no side-effects)
        if (recentRaw) {
          try { setRecentlyViewed(JSON.parse(recentRaw).slice(0, 6)); } catch (_) {}
        }

        // Pending prompt restoration (with TTL + handoff cleanup)
        if (pendingRaw) {
          // Always clear the key, even if we decide not to restore — it's
          // a one-shot handoff, not a persistent preference.
          await AsyncStorage.removeItem('@homegenie_pending_prompt');
          try {
            const parsed = JSON.parse(pendingRaw);
            const { prompt: saved, savedAt } = parsed || {};
            if (saved && savedAt && Date.now() - savedAt <= 5 * 60 * 1000) {
              // Defensive: don't clobber a prompt the user has already started
              // typing on the fresh mount. Only restore into an empty field.
              setPrompt((prev) => {
                if (prev) return prev;
                // We're actually replacing the value — force the TextInput
                // to remount so iOS measures the restored content fresh.
                bumpInputKey();
                return saved;
              });
            }
          } catch (_) {}
        }
      } catch (_) {
        // Best-effort — never block the home screen on a storage hiccup
      }
    })();
  }, []);

  // Auto-start onboarding — only once per session, only after AsyncStorage has loaded
  useEffect(() => {
    if (user && onboardingLoaded && !onboardingActive && !onboardingAttempted.current) {
      onboardingAttempted.current = true;
      const t = setTimeout(() => startOnboarding(), 800);
      return () => clearTimeout(t);
    }
  }, [user, onboardingLoaded]);

  const springIn  = (anim) => Animated.spring(anim, { toValue: 0.82, useNativeDriver: true, tension: 300, friction: 10 }).start();
  const springOut = (anim) => Animated.spring(anim, { toValue: 1,    useNativeDriver: true, tension: 200, friction: 7  }).start();

  // ── Hero slideshow — parallel crossfade (no z-order hiccup) ──────────────
  // Fades OUT current AND fades IN next simultaneously. This avoids the
  // z-order bug where image 0 (bottom of stack) couldn't visually fade in
  // over image 5 (top of stack) — now image 5 fades OUT to reveal image 0.
  const heroOpacities = useRef(HERO_IMAGES.map((_, i) => new Animated.Value(i === 0 ? 1 : 0))).current;
  const heroCurrentIdx = useRef(0);
  const heroTimerRef = useRef(null);

  // Build 89 / F3: lazy-mount hero images.
  //
  // Previously every HERO_IMAGES entry rendered an <Image> on first paint —
  // iOS decoded all 7 JPEGs (~1.3 MB GPU/decode) before the Home screen was
  // interactive. Now we only mount the indices that have actually been
  // visited; first paint mounts index 0 only. The crossfade scheduler adds
  // the nextIdx to the mounted set right before fading it in. After one full
  // cycle (~38s) every image is mounted, just like before.
  //
  // This is a lazy-mount, not a swap-in-place — we still want each image's
  // <Image> to stay mounted after first show so iOS keeps the texture cached
  // (avoids re-decode on subsequent cycles). The whole point is to spread
  // the decode cost across the first 38 seconds rather than incurring all
  // of it in the first frame.
  const [mountedHeroSet, setMountedHeroSet] = useState(() => new Set([0]));

  useEffect(() => {
    let cancelled = false;

    const scheduleNext = () => {
      heroTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        const currentIdx = heroCurrentIdx.current;
        const nextIdx = (currentIdx + 1) % HERO_IMAGES.length;

        // Mount nextIdx if not yet mounted. iOS will start decoding as soon
        // as <Image> mounts; opacity ramps up over HERO_FADE_MS (1200ms),
        // which is well above bundled-JPEG decode time (~50-100ms).
        setMountedHeroSet(prev => {
          if (prev.has(nextIdx)) return prev;
          const next = new Set(prev);
          next.add(nextIdx);
          return next;
        });

        // Crossfade: fade out current + fade in next simultaneously
        Animated.parallel([
          Animated.timing(heroOpacities[nextIdx], {
            toValue: 1,
            duration: HERO_FADE_MS,
            useNativeDriver: true,
          }),
          Animated.timing(heroOpacities[currentIdx], {
            toValue: 0,
            duration: HERO_FADE_MS,
            useNativeDriver: true,
          }),
        ]).start(() => {
          if (cancelled) return;
          heroCurrentIdx.current = nextIdx;
          scheduleNext();
        });
      }, HERO_INTERVAL);
    };

    scheduleNext();
    return () => { cancelled = true; clearTimeout(heroTimerRef.current); };
  }, []);

  // Build 89: removed `scrollY` Animated.Value. It was being written by a
  // 60Hz onScroll handler on the home ScrollView but read by NOTHING — pure
  // dead bridge traffic on the most-rendered screen, sibling pattern to the
  // StyleCarousel rAF loop fixed in Build 88. If a future scroll-dependent
  // animation is added, reintroduce as `Animated.event([...], { useNativeDriver: true })`
  // and consume via interpolate() in styles, never via setValue + JS read.

  // ── Personalization ─────────────────────────────────────────────────────────

  const userStyleDNA = useMemo(() => {
    const likedIds = Object.entries(liked)
      .filter(([, v]) => v)
      .map(([id]) => Number(id));
    if (!likedIds.length) return [];
    const likedDesigns = DESIGNS.filter(d => likedIds.includes(d.id));
    const styleCounts = {};
    likedDesigns.forEach(d =>
      d.styles?.forEach(s => { styleCounts[s] = (styleCounts[s] || 0) + 1; })
    );
    return Object.entries(styleCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([style]) => style);
  }, [liked]);

  const forYouDesigns = useMemo(() => {
    if (!userStyleDNA.length) return TRENDING_DESIGNS.slice(0, 8);
    const matched = DESIGNS.filter(d => d.styles?.some(s => userStyleDNA.includes(s)));
    return matched.length >= 3 ? matched.slice(0, 8) : TRENDING_DESIGNS.slice(0, 8);
  }, [userStyleDNA]);

  const likedCount = useMemo(
    () => Object.values(liked).filter(Boolean).length,
    [liked]
  );

  // Rotate Today's Highlight every 3 hours using a stable time-based index.
  // slotIndex increments once per 3-hour window, cycling through HIGHLIGHT_POOL.
  // useMemo with [] so it's computed once on mount (same slot for the whole session).
  const dealProduct = useMemo(() => {
    if (HIGHLIGHT_POOL.length > 0) {
      const slotIndex = Math.floor(Date.now() / (3 * 60 * 60 * 1000));
      return HIGHLIGHT_POOL[slotIndex % HIGHLIGHT_POOL.length];
    }
    return FEATURED_PRODUCTS[0] || null;
  }, []);

  // ── Effects ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    const timer = setInterval(() => setGreeting(getGreeting()), 60_000);
    return () => clearInterval(timer);
  }, []);

  // (Build 89: snapspace_recently_viewed read folded into the multiGet above.)

  // Receive photo captured from Snap tab (and optional single product for visualize flow)
  useEffect(() => {
    if (route?.params?.capturedPhoto) {
      const captured = route.params.capturedPhoto;
      setPhoto(captured);
      setPhotoSource('camera');
      // Single-product visualize: product passed from ProductDetailScreen → SnapScreen → here
      if (route.params.singleProduct) {
        setSingleProduct(route.params.singleProduct);
      }
      navigation.setParams({ capturedPhoto: undefined, singleProduct: undefined });
    }
  }, [route?.params?.capturedPhoto]);

  // Auto-trigger generation when single-product mode is active (photo + product both set).
  // The user doesn't type a prompt — the product IS the intent.
  const singleProductTriggered = useRef(false);
  useEffect(() => {
    if (photo && singleProduct && !generating && !singleProductTriggered.current) {
      singleProductTriggered.current = true;
      // Small delay so the HomeScreen has time to render the loading UI
      setTimeout(() => runGeneration(), 300);
    }
    if (!singleProduct) {
      singleProductTriggered.current = false;
    }
  }, [photo, singleProduct, generating]);

  // ── Remix intent (from RoomResultScreen Remix FAB) ──────────────────────
  // Two-stage handshake:
  //   Stage 1: receive remixIntent param → restore photo + style + prompt
  //            from the previous generation, then clear the param so a back
  //            navigation doesn't re-fire the effect.
  //   Stage 2: once photo+prompt are set in state and generating is false,
  //            kick runGeneration. We can't call runGeneration synchronously
  //            in stage 1 because setPhoto/setPrompt are async — runGeneration
  //            would read stale state and bail on the empty-prompt validator.
  // The two refs split the lifecycle: `remixPending` flips on stage 1 so
  // stage 2 knows to fire; `remixFiredRef` blocks the auto-fire effect from
  // re-triggering once gen has been kicked off.
  const remixPendingRef = useRef(false);
  const remixFiredRef = useRef(false);
  useEffect(() => {
    const remix = route?.params?.remixIntent;
    if (!remix) return;
    if (remixPendingRef.current) return;       // already processing this intent
    remixPendingRef.current = true;
    remixFiredRef.current = false;             // arm stage 2

    // Restore photo state. The photo file at remix.photoMeta.uri still has
    // EXIF on disk, so even if a field is missing, runGeneration's existing
    // safety nets (Image.getSize fallback, readFileExif, etc.) recover.
    if (remix.photoMeta) {
      setPhoto(remix.photoMeta);
      setPhotoSource(remix.photoSource || null);
    }

    // Honor the remixed style: set the carousel pill so the user sees what
    // they're regenerating into, and seed the input with the new prompt.
    const preset = STYLE_PRESETS.find(p => p.id === remix.styleId) || null;
    if (preset && remix.prompt) {
      setSelectedStyle({ ...preset, prompt: remix.prompt });
    }
    if (remix.prompt) {
      setPrompt(remix.prompt);
      bumpInputKey();
    }

    // Seed the rolling history from the previous RoomResult. The current
    // style we're about to render is appended in stage 2 right before
    // navigation, not here — that keeps history aligned with the user's
    // visual experience (history grows once you SEE a style, not when you
    // request it).
    if (Array.isArray(remix.recentStyleIds)) {
      recentStyleIdsRef.current = remix.recentStyleIds.slice(-3);
    }

    // Clear the param so back-nav from the upcoming RoomResult doesn't
    // re-fire this effect. setParams with undefined removes the entry.
    navigation.setParams({ remixIntent: undefined });
  }, [route?.params?.remixIntent]);

  // Stage 2 — once stage 1's setState calls have committed (photo + prompt
  // present) and we're not already generating, kick runGeneration. The 300ms
  // delay mirrors the single-product auto-trigger so the GenieLoader UI has
  // time to mount before the network call begins.
  useEffect(() => {
    if (
      remixPendingRef.current &&
      !remixFiredRef.current &&
      photo &&
      prompt &&
      !generating
    ) {
      remixFiredRef.current = true;
      setTimeout(() => {
        runGeneration();
        // Clear pending after firing so a fresh remixIntent param can re-arm.
        remixPendingRef.current = false;
      }, 300);
    }
  }, [photo, prompt, generating]);

  const handlePickFromLibrary = useCallback(async () => {
    if (generating) return;
    // Cache permission — avoid 2-3s system call on every tap
    if (!mediaPermGranted.current) {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'Please allow access to your photo library in Settings.');
        return;
      }
      mediaPermGranted.current = true;
    }
    let result;
    try {
      result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        // allowsEditing removed — the native crop UI is the 1-2s bottleneck on iOS simulator
        quality: 0.6,
      // exif: true so we can read Orientation and log it for diagnostics.
      // Was `false` previously, which combined with the missing normalize
      // call below to silently ship sideways pixels to Replicate — the
      // TestFlight bug that Build 19 was meant to fix was ONLY fixed on
      // the SnapScreen path. This handler was a parallel entry point that
      // bypassed normalizeOrientation entirely.
      exif: true,
      });
    } catch (e) {
      // The picker can throw on iOS 26 simulator if the photo library
      // module isn't fully linked, or if a previous picker session left
      // the modal stack in a weird state. Surface it as an Alert so the
      // user gets feedback instead of a silent fail.
      console.warn('[home/pickLib] launchImageLibraryAsync threw:', e?.name, e?.message);
      Alert.alert('Photo Library Unavailable', String(e?.message || 'Could not open photo library.'));
      return;
    }
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];

    // Do NOT re-encode via expo-image-manipulator before upload. The native
    // module on iPhone 14 Pro iOS 26 strips EXIF while leaving raw pixel
    // matrix sideways, which shipped a sideways-bytes JPEG to Replicate and
    // caused the "AI ignored my photo" bug across Builds 17–19. We now
    // upload the ORIGINAL asset URI (EXIF intact) and let the
    // normalize-room-photo edge function bake rotation server-side.
    //
    // Dims for pickAspectRatio: prefer Image.getSize() over
    // asset.width/height. On iOS, Image.getSize uses UIImage which honors
    // EXIF and returns VISUAL (post-rotation) dims. expo-image-picker's
    // `asset.width/height` is documented as EXIF-corrected, but on some iOS
    // 26 HEIC/ph:// sources it returns the raw pixel matrix — which would
    // send flux-2-max the wrong aspect_ratio for landscape shots picked
    // from the library. The Image.getSize roundtrip is cheap (~100ms) and
    // matches what SnapScreen's library-pick path does, keeping the two
    // entry points behaviourally identical.
    const orientation = asset.exif?.Orientation ?? 1;

    let finalWidth  = asset.width ?? null;
    let finalHeight = asset.height ?? null;
    try {
      const dims = await new Promise((resolve, reject) => {
        Image.getSize(asset.uri, (w, h) => resolve({ w, h }), reject);
      });
      if (dims.w > 0 && dims.h > 0) {
        finalWidth  = dims.w;
        finalHeight = dims.h;
      }
    } catch (e) {
      console.warn('[Home library pick] Image.getSize failed, using asset dims:', e?.message || e);
    }

    console.log(
      '[Home library pick] asset meta',
      'exifOrientation=' + orientation,
      'assetWH=' + asset.width + 'x' + asset.height,
      'finalWH=' + finalWidth + 'x' + finalHeight,
      'uri=' + String(asset.uri).substring(0, 80)
    );

    // Build 58: derive orientation from picked asset's aspect ratio.
    // For library picks we have no shutter-time gyro signal — but iOS
    // Photos.app stores photos in display orientation, so asset.width vs
    // asset.height reliably indicates how the user views the photo.
    let pickedOrientation = null;
    if (typeof asset.width === 'number' && typeof asset.height === 'number') {
      pickedOrientation = asset.width > asset.height ? 'landscape' : 'portrait';
    }
    setPhoto({
      uri: asset.uri,
      base64: null,
      width: finalWidth,
      height: finalHeight,
      // Build 44: propagate EXIF so runGeneration's orientation swap can
      // correct dims if Image.getSize returned raw pre-rotation pixels.
      exif: asset.exif || null,
      // Build 58: trump card for the EXIF-based dim swap + rotation logic.
      captureOrientation: pickedOrientation,
    });
    setPhotoSource('library');
  }, [generating]);

  // Timed loading bar — fixed 30-second runway regardless of real
  // generation time. Crawls 0→95% linearly and snaps to 100% when
  // generation actually completes (which may be before or after 30s).
  const startLoadingBar = useCallback(() => {
    loadingProgress.setValue(0);
    loadingAnim.current = Animated.timing(loadingProgress, {
      toValue: 0.95,
      duration: 30000,
      easing: Easing.linear,
      useNativeDriver: false,
    });
    loadingAnim.current.start();
  }, [loadingProgress]);

  const stopLoadingBar = useCallback((success = true) => {
    if (loadingAnim.current) {
      loadingAnim.current.stop();
      loadingAnim.current = null;
    }
    if (success) {
      // Snap to 100% quickly
      Animated.timing(loadingProgress, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: false,
      }).start(() => {
        // Reset after a beat
        setTimeout(() => loadingProgress.setValue(0), 400);
      });
    } else {
      loadingProgress.setValue(0);
    }
  }, [loadingProgress]);

  // GenieLoader animation is self-contained — no manual start/stop needed here.
  // The `generating` prop drives it directly via <GenieLoader animating={generating} />.

  // Build 91: climax-complete handler. Fires after the GenieLoader's 400ms
  // burst animation finishes. This is the moment we transition from "loader
  // doing its thing" to "Room Result revealed." Order matters:
  //   1. setGenerating(false) — unmounts GenieLoader on next render
  //   2. setClimaxFiring(false) — resets one-shot for the next generation
  //   3. navigation.navigate(...) — pushes RoomResult on top (sync)
  // Because navigation push is sync but state updates are batched, the user
  // visually sees: climax done → RoomResult slides up → Home is replaced.
  // GenieLoader unmount on Home is invisible underneath.
  const handleClimaxComplete = useCallback(() => {
    setGenerating(false);
    setGenStatus('');
    setClimaxFiring(false);
    if (pendingNavRef.current) {
      const params = pendingNavRef.current;
      pendingNavRef.current = null;
      navigation.navigate('RoomResult', params);
    }
  }, [navigation]);

  // Stuck-loader recovery on app resume.
  //
  // When iOS suspends the JS runtime (app backgrounded), any in-flight FAL
  // fetch socket is killed by the OS after ~30s. The promise on the JS side
  // never resolves OR rejects — it just hangs forever once JS resumes. This
  // leaves `generating === true` indefinitely, so the user sees the
  // GenieLoader screen on every reopen until they swipe-kill the app.
  //
  // Fix: track when we go to background. On the active transition, if we
  // were backgrounded long enough that the fetch is provably dead AND a
  // generation was in flight, force-reset all generation state. Threshold
  // is 60s — short enough to recover from any real-world hang, long enough
  // that a genuinely-still-running short background (5s home button tap)
  // isn't yanked out from under the user.
  const backgroundedAtRef = useRef(null);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        if (backgroundedAtRef.current == null) {
          backgroundedAtRef.current = Date.now();
        }
        return;
      }
      if (state === 'active') {
        const wentBgAt = backgroundedAtRef.current;
        backgroundedAtRef.current = null;
        if (wentBgAt == null) return;
        const elapsed = Date.now() - wentBgAt;
        if (elapsed > 60000 && generatingRef.current) {
          console.log('[HomeScreen] resume after ' + Math.round(elapsed / 1000) + 's bg with stuck generation — resetting');
          generatingRef.current = false;
          setGenerating(false);
          setGenStatus('');
          setLoadingMessages([]);
          stopLoadingBar(false);
        }
      }
    });
    return () => sub.remove();
  }, [stopLoadingBar]);

  // Rotating loading messages — cycle every 3s with fade
  useEffect(() => {
    if (!generating || loadingMessages.length === 0) return;
    const interval = setInterval(() => {
      // Fade out
      // Build 89: easing added — linear at the most-watched moment of AI gen reads cheap.
      Animated.timing(loadingMsgOpacity, {
        toValue: 0,
        duration: 300,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        // Advance to next message
        setLoadingMsgIndex(prev => (prev + 1) % loadingMessages.length);
        // Fade in
        Animated.timing(loadingMsgOpacity, {
          toValue: 1,
          duration: 400,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: true,
        }).start();
      });
    }, 3000);
    return () => clearInterval(interval);
    // Build 89: depend on .length not the array ref. setLoadingMessages is
    // sometimes called with a freshly-built array of the same length, which
    // was tearing down + rebuilding the interval mid-generation.
  }, [generating, loadingMessages.length]);

  // ── Result actions ──────────────────────────────────────────────────────────

  // Helper: download result image to local cache file
  const downloadResultImage = async () => {
    if (!resultData?.resultUri) return null;
    // Replicate returns webp — download and save with correct extension
    const isWebp = resultData.resultUri.includes('.webp') || resultData.resultUri.includes('output_format=webp');
    const ext = isWebp ? 'webp' : 'jpg';
    const mime = isWebp ? 'image/webp' : 'image/jpeg';
    const fileName = `snapspace_${Date.now()}.${ext}`;
    const localUri = `${FileSystem.cacheDirectory}${fileName}`;

    const downloadResult = await FileSystem.downloadAsync(resultData.resultUri, localUri);
    console.log('[Download] Status:', downloadResult.status, 'URI:', downloadResult.uri);

    // Verify file exists and has content
    const info = await FileSystem.getInfoAsync(localUri);
    if (!info.exists || info.size < 100) {
      throw new Error('Downloaded file is empty or missing');
    }

    return { localUri: downloadResult.uri, mime, ext };
  };

  const handleDownload = async () => {
    if (!resultData?.resultUri) return;
    try {
      // Step 1: Download image to local cache
      const file = await downloadResultImage();
      if (!file?.localUri) throw new Error('Download returned no file');

      // Step 2: Try direct save to camera roll (requires expo-media-library in dev client)
      let saved = false;
      if (MediaLibrary) {
        try {
          const { status } = await MediaLibrary.requestPermissionsAsync();
          if (status === 'granted') {
            await MediaLibrary.saveToLibraryAsync(file.localUri);
            Alert.alert('Saved!', 'Image saved to your photo library.');
            saved = true;
          }
        } catch (e) {
          console.log('[Download] MediaLibrary native module not available:', e.message);
        }
      }
      if (saved) return;

      // Fallback: open iOS share sheet with local file — user can tap "Save Image"
      await Share.share({ url: file.localUri });
    } catch (err) {
      console.log('[Download] Failed:', err.message);
      // Last resort: share the remote URL
      try {
        await Share.share({ url: resultData.resultUri });
      } catch {
        // Build 69 Commit I: safeOpenURL enforces https-only for AI
        // pipeline output URLs. If the generated URI is ever malformed
        // or an unexpected scheme, silently fall back to the user alert.
        const opened = await safeOpenURL(resultData.resultUri);
        if (!opened) {
          Alert.alert('Could Not Save', 'Please screenshot the image to save it to your camera roll.');
        }
      }
    }
  };

  const handleShare = async () => {
    if (!resultData?.resultUri) return;
    const prompt = resultData.prompt || 'My AI wish';
    try {
      await Share.share({
        message: `Check out my AI room wish on HomeGenie!\n\n"${prompt}"`,
        url: resultData.resultUri,
      });
    } catch (err) {
      console.log('[Share] Error:', err);
    }
  };

  const handlePost = async (visibility) => {
    if (!user?.id || !resultData?.resultUri) return;
    setPosting(true);
    setShowPostSheet(false);
    try {
      if (autoSavedDesignId) {
        // Design was already auto-saved — just update visibility
        await updateDesignVisibility(autoSavedDesignId, visibility);
      } else {
        // Fallback: auto-save didn't finish yet — do a full save
        const styleTags = (resultData.products || []).flatMap(p => p.styles || p.styleTags || []).filter(Boolean);
        const uniqueTags = [...new Set(styleTags)];
        const productSummary = (resultData.products || []).map(p => ({
          id: p.id, name: p.name, brand: p.brand,
          price: p.priceValue ?? p.price, imageUrl: p.imageUrl,
          rating: p.rating, reviewCount: p.reviewCount,
          affiliateUrl: p.affiliateUrl, source: p.source,
        }));
        const result = await saveUserDesign(user.id, {
          imageUrl: resultData.resultUri,
          prompt: resultData.prompt || '',
          styleTags: uniqueTags,
          products: productSummary,
          visibility,
        });
        if (result?.designId) setAutoSavedDesignId(result.designId);
      }
      Alert.alert(
        visibility === 'public' ? 'Posted to Explore!' : 'Saved to Profile',
        visibility === 'public'
          ? 'Your wish is now live on the Explore page.'
          : 'Your wish has been saved privately to your profile.'
      );
    } catch (e) {
      console.warn('Post failed:', e);
      Alert.alert('Post Failed', e.message || 'Could not save. Please try again.');
    } finally {
      setPosting(false);
    }
  };

  const runGeneration = async () => {
    // ── Atomic double-tap guard ────────────────────────────────────────────
    // Must come BEFORE any early-return validation so rapid-fire taps can't
    // each fail validation independently, bypass this check, and race to the
    // network. The ref flip is synchronous and sticks until the finally block
    // at the end of this function resets it.
    if (generatingRef.current) {
      return;
    }
    generatingRef.current = true;

    const isSingleProductMode = !!singleProduct;

    if (!photo) {
      generatingRef.current = false;
      Alert.alert('Add a Room Photo', 'Tap the camera icon to snap your room, or pick from your library.');
      return;
    }
    // Prompt is only required for the full-room flow — single-product skips it
    if (!isSingleProductMode && !prompt.trim()) {
      generatingRef.current = false;
      Alert.alert('Describe Your Style', 'Add a style description so the AI knows what to create.');
      return;
    }
    const rawPrompt = isSingleProductMode ? '' : prompt.trim();
    const savedPhoto = { ...photo };
    const savedPhotoSource = photoSource;
    // Snapshot the carousel selection at gen-start so the value passed to
    // RoomResult is stable across the ~30s pipeline. selectedStyle is reactive
    // state that auto-clears if the prompt is edited mid-flight (line ~1003
    // useEffect); without this snapshot the RoomResult Remix FAB could land
    // with a null styleId on edge-case races.
    const savedStyleId = selectedStyle?.id || null;
    Keyboard.dismiss();

    // ── Observability: one ID per generation attempt ───────────────────────
    const generationId = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const log = (...args) => console.log(`[gen:${generationId}]`, ...args);
    const warn = (...args) => console.warn(`[gen:${generationId}]`, ...args);
    const startedAt = Date.now();
    // Build 64 (C2): absolute wall-clock deadline across ALL rings for a
    // single generation attempt. Each ring already has its own internal
    // polling cap (~4 min per FAL ring, ~3 min for BFL), but three rings
    // back-to-back + per-ring cooldown sleeps + retry-on-moderation loops
    // can stack to ~19 min of wall-clock in the worst case. Users close the
    // app long before that. 8 min is a pragmatic cap: long enough that a
    // single-ring slow-but-succeeding generation (the panel cold-start
    // cases we saw on Build 42) isn't penalized, short enough that a
    // cascading failure surfaces a real error instead of an indefinite spinner.
    //
    // Checked at the entry of Ring 2 and Ring 3 — we intentionally don't
    // interrupt an in-flight ring (JS can't cancel a Promise mid-poll), so
    // the true cap is (elapsed at check) + (remaining ring budget). Worst
    // case therefore bounds at ~12 min instead of the prior ~19.
    const GENERATION_DEADLINE_MS = 8 * 60 * 1000;
    log('start | mode=' + (isSingleProductMode ? 'single-product' : 'full-room') + ' | prompt="' + rawPrompt.substring(0, 80) + '"');

    // ── Build 53: real EXIF from file bytes (trumps picker metadata) ─────────
    // Build 51 telemetry proved that expo-image-picker's asset.exif.Orientation
    // is unreliable on iOS 26 / iPhone 14 Pro: it returns 6 for ALL captures
    // regardless of how the phone was held. The real source of truth is the
    // EXIF marker embedded in the raw JPEG file bytes, which iOS writes
    // correctly at capture time. readFileExifOrientation (imageOptimizer.js)
    // reads the first 64 KB of the file and extracts Orientation via piexifjs.
    //
    // Downstream, this value is used for:
    //   1. The HomeScreen EXIF-aware dim swap (determines aspect ratio)
    //   2. uploadRoomPhoto → optimizeForGeneration rotation-bake decision
    //
    // Falls back to savedPhoto.exif?.Orientation (picker) if file read fails,
    // which preserves Build 49 behavior for any code path that doesn't get the
    // file-read to complete. So strictly safer than current code.
    let fileExifOrientation = null;
    let fileExifError = null;
    let fileExifFull = null;
    try {
      // Build 56: read the FULL EXIF dict (not just Orientation). Build 55
      // proved iPhone 14 Pro / iOS 26 writes Orientation=6 for BOTH landscape
      // and portrait captures, so Orientation alone can't discriminate. The
      // richer fields (PixelXDimension, PixelYDimension, ImageWidth,
      // ImageLength, MakerNote presence) may reveal the true orientation.
      fileExifFull = await readFileExif(savedPhoto?.uri);
      fileExifOrientation = fileExifFull?.orientation ?? null;
      if (fileExifFull == null) {
        fileExifError = getLastFileExifError();
      }
      log('full file EXIF | orient=' + fileExifOrientation +
          ' pixelXY=' + (fileExifFull?.pixelXDimension ?? '?') + 'x' + (fileExifFull?.pixelYDimension ?? '?') +
          ' rawWH=' + (fileExifFull?.imageWidth ?? '?') + 'x' + (fileExifFull?.imageLength ?? '?') +
          ' model=' + (fileExifFull?.model ?? '?') +
          (fileExifError ? ' | error=' + fileExifError : ''));
    } catch (e) {
      fileExifError = String(e?.message || e).substring(0, 150);
      warn('file EXIF read threw:', fileExifError);
    }
    // Effective orientation: prefer file EXIF, fall back to picker, default to 1.
    let effectiveOrientation = fileExifOrientation ?? savedPhoto?.exif?.Orientation ?? 1;

    // Build 58: capture orientation TRUMPS EXIF. Build 57 telemetry conclusively
    // proved that on iOS 26 / iPhone 14 Pro Max, every photo Apple writes has
    // IDENTICAL EXIF metadata regardless of how the user held the phone — so
    // EXIF cannot distinguish landscape from portrait captures. The only
    // reliable signal is the device's window orientation at the moment of
    // capture (Dimensions.get('window') in SnapScreen.handleCapture for camera,
    // or the picked asset's aspect ratio for library picks).
    //
    // When captureOrientation is 'portrait', we OVERRIDE the EXIF-driven
    // rotation chain by setting effectiveOrientation = 1 (no rotation needed).
    // This makes:
    //   - The HomeScreen dim-swap below skip (because needsSwap requires
    //     effectiveOrientation in {5,6,7,8})
    //   - The optimizer's rotation-bake skip (EXIF_ROTATION_MAP[1] = undefined)
    // Result: portrait pixels preserved, portrait aspect_ratio sent to FAL,
    // portrait output produced. Exactly what the user expects.
    //
    // Build 69: symmetric landscape override for EXIF=3.
    // Build 68 field report: landscape room photos were landing UPSIDE-DOWN
    // in Supabase. Analysis of the live FAL dashboard showed the render/image
    // fallback URL serving bytes rotated 180° from correct. Root cause: on
    // iOS 26 / iPhone 14 Pro, landscape captures where the phone is held
    // with the dynamic-island on the RIGHT report EXIF Orientation=3 (needs
    // 180° rotate to display) but the raw pixel matrix is ALREADY upright.
    // The optimizer's EXIF_ROTATION_MAP[3]=180 then flips an already-correct
    // image to upside-down. flux-2-pro/edit can't parse the upside-down
    // scene so it regenerates a novel room from the prompt alone — exactly
    // the behavior the user reported.
    //
    // Fix: when the accelerometer confirms the device was held landscape
    // AND EXIF claims 180° rotation is needed, trust the accelerometer and
    // skip the rotation bake. Same pattern as the Build 55 portrait override.
    //
    // EXIF=6 and EXIF=8 landscape captures (phone rotated 90° CW/CCW) are
    // NOT overridden — those paths worked correctly in Build 67/68 testing
    // and their rotation bake is needed to orient the sideways buffer.
    const captureOrientation = savedPhoto?.captureOrientation || null;
    if (captureOrientation === 'portrait' && effectiveOrientation !== 1) {
      log('captureOrientation=portrait overrides EXIF=' + effectiveOrientation +
          ' → forcing effectiveOrientation=1 (no swap, no rotation, portrait preserved)');
      effectiveOrientation = 1;
    } else if (captureOrientation === 'landscape' && effectiveOrientation === 3) {
      log('captureOrientation=landscape overrides EXIF=3 ' +
          '→ forcing effectiveOrientation=1 (accelerometer says upright landscape, skip 180° flip)');
      effectiveOrientation = 1;
    } else {
      log('captureOrientation=' + captureOrientation +
          ' | effectiveOrientation=' + effectiveOrientation + ' (EXIF-driven path)');
    }

    // ── Build 46: unconditional start-of-generation telemetry ────────────────
    // Every generation writes ONE row to public.generation_errors at start with
    // the exact state we care about for the ongoing orientation investigation:
    //   - client_version: confirms which Build is actually running on device
    //   - exif_orientation_raw: the Orientation tag expo-image-picker gave us
    //   - exif_keys: which EXIF fields were returned at all (null => picker
    //     stripped EXIF from its metadata response)
    //   - picker_dims: width/height the picker reported (pre-optimizer)
    //   - photo_source: 'camera' | 'library' | null
    //
    // Fire-and-forget; never blocks generation. This lets us query after any
    // test and see EXACTLY what the app saw — replacing assumptions about
    // Build 42/44/45 behavior with ground-truth data. After this ships, one
    // test photo tells us whether the rotation-bake failed because the
    // picker returns no Orientation, because rotation direction is inverted,
    // or because we're not even running the new build.
    (async () => {
      // Reuse the recordGenerationError helper — the ring value distinguishes
      // this from actual errors ("start-telemetry" vs "panel"/"individual-refs"/etc.)
      // so we can filter it out when looking at real failures.
      if (user?.id) {
        try {
          const exifObj = savedPhoto?.exif;

          // Build 50: capture Image.getSize(uri) as the discriminator between
          // landscape and portrait captures on iOS 26. Build 47/49 telemetry
          // showed BOTH orientations produce identical picker metadata
          // (exif=6, picker_dims=980×1920, source=camera). The actual pixel
          // content differs but the metadata doesn't — so we need a second
          // signal. On iOS, Image.getSize uses UIImage which auto-applies
          // EXIF during decode, so its returned dims should reflect the
          // DISPLAY orientation (post-rotation). If Image.getSize dims
          // differ from picker's asset.width/height → the raw buffer needs
          // EXIF rotation to display correctly (landscape case). If they
          // match → the raw buffer is already in display orientation
          // (portrait case, where EXIF=6 is effectively a lie).
          let uriActualW = null;
          let uriActualH = null;
          let uriSizeError = null;
          try {
            const dims = await new Promise((resolve, reject) => {
              Image.getSize(
                savedPhoto?.uri,
                (w, h) => resolve({ w, h }),
                (err) => reject(err),
              );
            });
            uriActualW = dims.w;
            uriActualH = dims.h;
          } catch (sizeErr) {
            uriSizeError = String(sizeErr?.message || sizeErr).substring(0, 100);
          }

          recordGenerationError({
            userId: user.id,
            generationId,
            ring: 'start-telemetry',
            errorName: 'StartTelemetry',
            errorMessage: 'B56 diagnostic ping',
            pipeline: 'pre-pipeline',
            clientVersion: String(Constants.expoConfig?.ios?.buildNumber || 'unknown'),
            metadata: {
              // Build 53: BOTH sources of EXIF so we can see the delta.
              // Picker is known-unreliable on iOS 26; file is ground truth.
              exif_orientation_picker: exifObj?.Orientation ?? null,
              exif_orientation_file: fileExifOrientation,
              exif_effective: effectiveOrientation,
              exif_source: fileExifOrientation != null ? 'file' : 'picker-fallback',
              exif_file_error: fileExifError,
              // Build 56: FULL EXIF dump. On iOS 26 Orientation alone doesn't
              // discriminate landscape from portrait (Build 55 proved this).
              // Checking if richer fields — especially PixelXDimension /
              // PixelYDimension which EXIF spec defines as display-oriented
              // dims — carry the real signal.
              exif_pixel_x_dim: fileExifFull?.pixelXDimension ?? null,
              exif_pixel_y_dim: fileExifFull?.pixelYDimension ?? null,
              exif_image_width: fileExifFull?.imageWidth ?? null,
              exif_image_length: fileExifFull?.imageLength ?? null,
              exif_make: fileExifFull?.make ?? null,
              exif_model: fileExifFull?.model ?? null,
              exif_software: fileExifFull?.software ?? null,
              exif_has_makernote: fileExifFull?.hasMakerNote ?? null,
              exif_total_keys: fileExifFull?.totalKeys ?? null,
              // Derived: is PixelXDimension > PixelYDimension? This is the
              // EXIF-spec-canonical way to detect landscape vs portrait.
              exif_pixel_dims_landscape:
                fileExifFull?.pixelXDimension != null && fileExifFull?.pixelYDimension != null
                  ? fileExifFull.pixelXDimension > fileExifFull.pixelYDimension
                  : null,
              // Build 58: device orientation at capture time. THE discriminator.
              // captureOrientation = 'landscape' | 'portrait' | null (unknown).
              // 'portrait' triggers the no-swap, no-rotation override above.
              capture_orientation: captureOrientation,
              capture_orientation_overrode_exif: captureOrientation === 'portrait' &&
                (fileExifOrientation === 6 || fileExifOrientation === 8 ||
                 (savedPhoto?.exif?.Orientation === 6 || savedPhoto?.exif?.Orientation === 8)),
              // Build 69: landscape-override flag. Lets us verify in telemetry
              // whether the new EXIF=3 override actually fired for a given
              // upside-down-landscape test capture.
              landscape_override_fired: captureOrientation === 'landscape' &&
                (fileExifOrientation === 3 || savedPhoto?.exif?.Orientation === 3),
              effective_orientation_post_override: effectiveOrientation,
              // Build 60: accelerometer diagnostic. Lets us verify which path
              // (accelerometer = physical truth, or dimensions-fallback = screen)
              // made the orientation decision. If the user reports a portrait/
              // landscape mismatch we can tell whether the accelerometer fired
              // and what gravity vector it returned.
              accel_x: savedPhoto?.captureOrientationDebug?.accelX ?? null,
              accel_y: savedPhoto?.captureOrientationDebug?.accelY ?? null,
              accel_z: savedPhoto?.captureOrientationDebug?.accelZ ?? null,
              accel_orientation: savedPhoto?.captureOrientationDebug?.accelOrientation ?? null,
              dims_orientation: savedPhoto?.captureOrientationDebug?.dimsOrientation ?? null,
              orientation_decision_source: savedPhoto?.captureOrientationDebug?.decisionSource ?? null,
              // Legacy name kept for dashboard compatibility with Build 47+ rows.
              exif_orientation_raw: exifObj?.Orientation ?? null,
              exif_is_object: typeof exifObj === 'object' && exifObj !== null,
              exif_keys: exifObj && typeof exifObj === 'object'
                ? Object.keys(exifObj).slice(0, 15)
                : [],
              picker_w: savedPhoto?.width ?? null,
              picker_h: savedPhoto?.height ?? null,
              picker_landscape: (savedPhoto?.width ?? 0) > (savedPhoto?.height ?? 0),
              uri_actual_w: uriActualW,
              uri_actual_h: uriActualH,
              uri_actual_landscape: uriActualW && uriActualH ? uriActualW > uriActualH : null,
              uri_matches_picker: uriActualW === (savedPhoto?.width ?? null) &&
                                   uriActualH === (savedPhoto?.height ?? null),
              uri_size_error: uriSizeError,
              uri_prefix: String(savedPhoto?.uri || '').substring(0, 60),
              uri_scheme: String(savedPhoto?.uri || '').split(':')[0] || 'unknown',
              photo_source: photoSource || 'unknown',
              single_product_mode: isSingleProductMode,
            },
          });
        } catch (e) {
          // Never block generation on telemetry
          console.warn('[start-telemetry] write failed:', e?.message || e);
        }
      }
    })();

    // Initialize rotating loading messages (uses raw prompt — expansion runs after)
    const msgs = isSingleProductMode
      ? ['Placing product in your space…', 'Matching lighting and perspective…', 'Almost there…']
      : getLoadingMessages(rawPrompt);
    setLoadingMessages(msgs);
    setLoadingMsgIndex(0);
    loadingMsgOpacity.setValue(1);
    setGenerating(true);
    startLoadingBar();

    // Build 71 (Commit A): expand the prompt via Haiku under the loading UI
    // so the user sees immediate feedback. Fails open — returns rawPrompt on
    // any error (timeout, HTTP error, empty response). Cost ~$0.0005/gen.
    const designPrompt = isSingleProductMode ? '' : await expandPrompt(rawPrompt);

    try {
      setGenStatus('');

      // ── Pre-match products (full-room only — single-product already has one) ──
      // We match 6 (not 4) to give the panel compositor a 2-product backup
      // pool. If any of the top-4 URLs fail the content-type / decode check
      // inside composite-products, the edge fn falls through to product 5 or
      // 6 and fills the cell from the pool. Without the backup pool we'd
      // ship a 3-cell panel + a gray 4th cell, which the user would see as
      // a weird flat region in the generated room image. The edge function
      // returns composited_indices so the client can filter finalProducts
      // down to exactly the 4 that actually made it into the panel.
      let matchedProducts = [];
      if (!isSingleProductMode) {
        setGenStatus('Finding products for your space…');
        // Build 83 soft exclusion: flatten the last RECENT_PRODUCT_WINDOW
        // generations' product IDs into a single Set the matcher uses as a
        // "prefer-not-to-show" hint. Per-category fresh candidates are
        // preferred; thin categories where every candidate was recently
        // shown still pick (quality > variety).
        const recentIdsSet = new Set();
        for (const arr of recentProductIdsRef.current) {
          for (const id of arr) recentIdsSet.add(id);
        }
        // Build 93: liked products that are STILL FRESH get a +10% weight
        // bonus inside the matcher. We pass the IDs as a Set; the matcher
        // skips the bonus for items that are stale (already shown recently).
        const likedIdsSet = new Set(
          Object.keys(liked || {}).filter((id) => liked[id])
        );
        matchedProducts = getProductsForPrompt(
          designPrompt,
          6,
          recentIdsSet,
          productHistoryRef.current,
          likedIdsSet,
          null, // cartIds: deferred — cart uses name+brand keys, not IDs
        );
        log('pre-matched', matchedProducts.length, 'products:', matchedProducts.map(p => p.category).join(','),
          '| recent-exclusion-set size:', recentIdsSet.size,
          '| history-genIdx:', productHistoryRef.current?.genIdx || 0,
          '| liked-set size:', likedIdsSet.size);
        // Push this generation's IDs onto the queue (most-recent-first), trim to window.
        const thisGenIds = matchedProducts.map(p => p.id).filter(Boolean);
        recentProductIdsRef.current = [thisGenIds, ...recentProductIdsRef.current].slice(0, RECENT_PRODUCT_WINDOW);
        // Build 93: persist picks to AsyncStorage and refresh the in-memory
        // snapshot so the NEXT generation reads the updated genIdx + entries.
        // Fire-and-forget — never blocks generation. On any error the matcher
        // gracefully proceeds with the prior snapshot on the next call.
        appendPicksToHistory(user?.id, thisGenIds).then((nextSnap) => {
          productHistoryRef.current = nextSnap;
        }).catch(() => { /* swallowed in productHistory.js */ });
      }

      // ── URL pre-flight (full-room only — single-product does its own check) ──
      let reachableProducts = [];
      if (!isSingleProductMode) {
        reachableProducts = await filterReachableProducts(matchedProducts);
        const dropped = matchedProducts.length - reachableProducts.length;
        if (dropped > 0) {
          warn('preflight: dropped ' + dropped + '/' + matchedProducts.length + ' products with unreachable images');
        } else {
          log('preflight: all ' + matchedProducts.length + ' product URLs reachable');
        }
      }

      // ── Build 62: prompt enrichment for the AI call only ────────────────────
      // designPrompt remains the raw user text (shown on RoomResult screen
      // and stored in telemetry). enrichedDesignPrompt is what flows to
      // FAL/BFL — adds two structural sentences:
      //   1. Color palette inferred from per-category color attribution
      //   2. Cohesive material if the matcher converged on one
      // Both fall back to the raw prompt when no enrichment applies, so the
      // path is always safe.
      let enrichedDesignPrompt = designPrompt;
      if (!isSingleProductMode && designPrompt) {
        const parsedForPrompt = parseDesignPrompt(designPrompt);
        const colorHint = buildColorPaletteHint(parsedForPrompt);
        const dominantMat = getDominantMaterial(reachableProducts.length > 0 ? reachableProducts : matchedProducts);

        // Build 69: ensure user prompt has a sentence terminator before
        // we append enrichment sentences. Without this the joined output
        // ran together: "brown leather sofa Color palette: ..." — no
        // punctuation boundary for flux's tokenizer to latch onto.
        const seededPrompt = designPrompt.replace(/[.\s]+$/, '') + '.';
        const enrichmentParts = [seededPrompt];
        if (colorHint) enrichmentParts.push(`Color palette: ${colorHint}.`);
        if (dominantMat) enrichmentParts.push(`Cohesive ${dominantMat} tones throughout.`);
        enrichedDesignPrompt = enrichmentParts.join(' ');

        if (enrichedDesignPrompt !== designPrompt) {
          log('prompt enriched | palette=' + (colorHint || '-') + ' | material=' + (dominantMat || '-'));
        }
      }

      // ── Derive aspect ratio from the room photo orientation ──────────────
      // flux-2-max's 'match_input_image' is ambiguous with multi-image input,
      // so we snap the room photo's native aspect to the closest supported
      // bucket and pass it explicitly. Portrait photos get tall ratios (3:4,
      // 9:16), landscape get wide ratios (4:3, 16:9) — the generated render
      // matches the source framing regardless of device orientation.
      let photoW = savedPhoto.width;
      let photoH = savedPhoto.height;

      // Safety net: if dimensions are missing (rare edge case — older devices,
      // corrupted EXIF), resolve them from the image file before proceeding.
      if (!photoW || !photoH) {
        try {
          const dims = await new Promise((resolve, reject) => {
            Image.getSize(
              savedPhoto.uri,
              (w, h) => resolve({ w, h }),
              reject
            );
          });
          photoW = dims.w;
          photoH = dims.h;
          log('resolved photo dimensions via Image.getSize:', photoW + 'x' + photoH);
        } catch {
          warn('could not resolve photo dimensions — using match_input_image fallback');
        }
      }

      // Build 44: EXIF-aware orientation swap (defense in depth).
      //
      // Upstream paths (SnapScreen capture/pick, HomeScreen library pick) use
      // Image.getSize to resolve display-oriented dims before handing photo
      // to runGeneration — which SHOULD give us EXIF-corrected values via
      // iOS UIImage's auto-orientation. But we've seen cases on iOS 26 /
      // iPhone 14 Pro where Image.getSize returns the raw pixel matrix for
      // certain HEIC / ph:// URI shapes, defeating the upstream resolution.
      //
      // If the photo arrived with an EXIF Orientation tag of 5/6/7/8 (any
      // of the 90° or 270° rotations) AND the current photoW/photoH are
      // portrait-shaped (photoH > photoW), we treat them as raw/pre-rotation
      // and swap. Orientations 5-8 mean the stored pixel matrix is rotated
      // relative to the visual image — swap gives us the true display dims.
      //
      // This is a zero-cost correction when dims are already right (if
      // photoW > photoH for a landscape capture, we don't swap). It ONLY
      // fires when upstream Image.getSize missed the rotation.
      // Build 53: use effective (file-truth) EXIF rather than picker EXIF.
      // On iOS 26, picker reports Orientation=6 for ALL captures (landscape
      // AND portrait); only the real file EXIF correctly distinguishes them.
      // Portrait captures (EXIF=1 in the real file) should NOT swap dims —
      // that was forcing every portrait photo into a landscape aspect ratio
      // before Build 53. Landscape captures (EXIF=6 in real file) still swap
      // from raw portrait buffer dims to display landscape dims as before.
      const needsSwap = (effectiveOrientation === 5 || effectiveOrientation === 6 ||
                         effectiveOrientation === 7 || effectiveOrientation === 8);
      if (needsSwap && photoW > 0 && photoH > 0 && photoH > photoW) {
        const swappedW = photoH;
        const swappedH = photoW;
        log('EXIF orientation ' + effectiveOrientation + ' (source=' +
            (fileExifOrientation != null ? 'file' : 'picker-fallback') +
            ') with raw-portrait dims ' + photoW + 'x' + photoH +
            ' — swapping to display dims ' + swappedW + 'x' + swappedH);
        photoW = swappedW;
        photoH = swappedH;
      } else {
        log('EXIF orientation ' + effectiveOrientation + ' (source=' +
            (fileExifOrientation != null ? 'file' : 'picker-fallback') +
            ') — no dim swap (dims preserved at ' + photoW + 'x' + photoH + ')');
      }

      // Initial aspect_ratio guess from CLIENT-side dims. This may be
      // overridden below with SERVER-truth dims (post-rotation) after
      // uploadRoomPhoto returns — see `if (roomPhotoServerWidth && ...)`
      // block. We compute it here too so it's available if the server
      // path short-circuits (no session / fallback to raw URL / etc).
      let aspectRatio = pickAspectRatio(photoW, photoH);
      log('photo (client dims)', photoW + 'x' + photoH, '→ aspect_ratio =', aspectRatio);

      // ── Quota waterfall: free → tokens → subscription → paywall ─────────
      let generationSource = null;

      if (subscription.canGenerate) {
        generationSource = subscription.tier === 'free' ? 'free' : 'subscription';
      } else if (tokenBalance > 0) {
        generationSource = 'token';
      } else {
        stopLoadingBar(false);
        setGenerating(false);
        // Clean up single-product state so HomeScreen returns to a clean
        // state when the user dismisses the paywall.
        if (isSingleProductMode) {
          setSingleProduct(null);
          singleProductTriggered.current = false;
          setPhoto(null);
          setPhotoSource(null);
        }
        navigation.navigate('Paywall');
        return;
      }

      // ── Route: premium tier → edge function pipeline (v3) ─────────────────
      //          free tier   → edge function pipeline (v2, Pass 1 only)
      // Replicate fallback removed — BFL direct is the only pipeline.
      // If the edge function fails, the user sees a clear error instead of
      // a silent fallback that double-bills through Replicate.
      // ──────────────────────────────────────────────────────────────────────
      let resultUrl;
      let finalProducts;
      // Metadata captured from the generation call — surfaced in the dev
      // debug overlay on RoomResultScreen and attached to the saved design.
      let genMeta = {
        generationId,
        predictionId: null,
        seed:         null,
        aspectRatio,
        pipeline:     null,  // 'panel' | 'individual' | 'bfl'
      };

      if (user?.id) {
        // ── Step 1: Upload room photo to Supabase Storage ─────────────────
        setGenStatus('Preparing your room…');
        let roomPhotoUrl = null;
        let roomPhotoServerWidth = null;
        let roomPhotoServerHeight = null;
        try {
          // Build 45: pass EXIF Orientation through to uploadRoomPhoto so the
          // optimizer can bake rotation into the pixels BEFORE upload. This is
          // the upstream fix for "sideways bytes land in Supabase" that
          // defeated all Build 40-44 orientation corrections. See supabase.js
          // uploadRoomPhoto / imageOptimizer.js rotateAction logic.
          // Build 53: pass EFFECTIVE EXIF (file-truth), not picker EXIF.
          // This drives the optimizer's rotation-bake in imageOptimizer.js.
          // For portrait captures the real file EXIF is 1 → no rotation →
          // portrait pixels preserved → FAL receives portrait-shaped input.
          // For landscape captures the real file EXIF is 6 → 270° rotation
          // applied (per EXIF_ROTATION_MAP) → raw rotated buffer becomes
          // display-correct landscape before upload. Source of truth matters.
          const exifOrientForRotation = effectiveOrientation;
          log('uploadRoomPhoto called with effective EXIF=' + exifOrientForRotation +
              ' (source=' + (fileExifOrientation != null ? 'file' : 'picker-fallback') + ')' +
              ' | will bake rotation=' + (exifOrientForRotation > 1 && exifOrientForRotation < 9));
          const uploaded = await uploadRoomPhoto(
            user.id,
            savedPhoto.uri,
            savedPhoto.base64,
            exifOrientForRotation,
          );
          // uploadRoomPhoto returns { url, width, height }. Width/height come
          // from normalize-room-photo's post-rotation dims (if it succeeded),
          // or null on fallback (so HomeScreen's EXIF-aware client dims win).
          // Both paths now serve correctly-oriented pixels thanks to the
          // Build 45 optimizer rotation-bake.
          roomPhotoUrl         = uploaded?.url || null;
          roomPhotoServerWidth  = uploaded?.width ?? null;
          roomPhotoServerHeight = uploaded?.height ?? null;
          if (!roomPhotoUrl) throw new Error('uploadRoomPhoto returned no url');
        } catch (uploadErr) {
          stopLoadingBar(false);
          setGenerating(false);
          console.log(
            '[genmeta]',
            'event=upload_failed',
            'pipeline=none',
            'generationId=' + generationId,
            'code=' + (uploadErr?.code || 'unknown'),
            'err=' + String(uploadErr?.message || uploadErr).substring(0, 120)
          );
          // userFacing errors come from the normalize-room-photo edge function
          // (e.g. "photo is too large (18.2 MB)..." / "could not decode photo...").
          // Those are the user's problem — show the server's message so they
          // know to pick a different photo. Generic upload/network errors get
          // the generic message.
          if (uploadErr?.userFacing) {
            Alert.alert("We couldn't use that photo", uploadErr.message);
          } else {
            Alert.alert(
              'Upload Failed',
              'Could not upload your room photo. Please check your connection and try again.',
            );
          }
          return;
        }

        // Note (Build 21): pre-warm removed. uploadRoomPhoto now returns a
        // raw /object/public/ URL to a normalized JPEG produced by the
        // `normalize-room-photo` edge function — no lazy Supabase transform
        // sits between Replicate and the bytes, so there's no cold-cache
        // latency for flux-2-max to trip on. The normalize step itself is
        // inside uploadRoomPhoto and runs on our time budget, which is
        // exactly where the wait should be.

        // Server-truth aspect_ratio override (Build 22). If the edge function
        // returned numeric post-rotation dims, recompute aspect_ratio from
        // those — this is the ACTUAL shape of the bytes flux-2-max will
        // fetch. Prevents the Build 20 failure mode where the client reported
        // portrait dims (pre-rotation) but the server rotated the bytes to
        // landscape, so flux got a mismatched aspect_ratio and output was
        // letterboxed / garbled.
        if (roomPhotoServerWidth && roomPhotoServerHeight) {
          const serverAspect = pickAspectRatio(roomPhotoServerWidth, roomPhotoServerHeight);
          if (serverAspect !== aspectRatio) {
            log(
              'aspect_ratio override | client=' + aspectRatio +
              ' → server=' + serverAspect +
              ' (server dims: ' + roomPhotoServerWidth + 'x' + roomPhotoServerHeight + ')'
            );
            aspectRatio = serverAspect;
          } else {
            log('aspect_ratio confirmed by server | ' + aspectRatio);
          }
        }

        // Build 46: unconditional post-upload orientation telemetry.
        // Build 45 shipped a narrower version of this that ONLY wrote when
        // client and upload orientation disagreed — but that only catches
        // landscape-vs-portrait flips. It misses 180°-upside-down and 90°
        // sideways-within-landscape cases (both cases the investigation
        // revealed on 2026-04-20). Now we ALWAYS write a row so we can see
        // the actual delivered dims + the optimizer path taken, in every
        // single generation. Combined with the start-telemetry ping above,
        // we get the full client-side picture: what the picker reported,
        // what the optimizer received, what we uploaded, and what FAL sees.
        // Fire-and-forget; never blocks generation.
        (async () => {
          try {
            const dims = await new Promise((resolve, reject) => {
              Image.getSize(roomPhotoUrl, (w, h) => resolve({ w, h }), reject);
            });
            const clientLandscape = photoW > photoH;
            const uploadLandscape = dims.w > dims.h;
            const match = clientLandscape === uploadLandscape;
            log('orientation check | clientWH=' + photoW + 'x' + photoH +
                ' uploadWH=' + dims.w + 'x' + dims.h +
                ' match=' + match);
            recordGenerationError({
              userId: user.id,
              generationId,
              ring: 'orientation-check',
              errorName: match ? 'OrientationOK' : 'OrientationMismatch',
              errorMessage:
                'client=' + (clientLandscape ? 'landscape' : 'portrait') +
                ' upload=' + (uploadLandscape ? 'landscape' : 'portrait') +
                ' exif=' + (savedPhoto?.exif?.Orientation ?? 1),
              pipeline: 'pre-pipeline',
              clientVersion: String(Constants.expoConfig?.ios?.buildNumber || ''),
              metadata: {
                client_wh: photoW + 'x' + photoH,
                upload_wh: dims.w + 'x' + dims.h,
                match,
                exif_orientation: savedPhoto?.exif?.Orientation ?? null,
                room_url: roomPhotoUrl,
                server_wh_from_normalize: roomPhotoServerWidth && roomPhotoServerHeight
                  ? (roomPhotoServerWidth + 'x' + roomPhotoServerHeight)
                  : 'null',
              },
            });
          } catch (sizeErr) {
            // Record the getSize failure itself — that's also a valuable signal.
            recordGenerationError({
              userId: user.id,
              generationId,
              ring: 'orientation-check',
              errorName: 'GetSizeFailed',
              errorMessage: String(sizeErr?.message || sizeErr).substring(0, 200),
              pipeline: 'pre-pipeline',
              clientVersion: String(Constants.expoConfig?.ios?.buildNumber || ''),
              metadata: {
                client_wh: photoW + 'x' + photoH,
                room_url: roomPhotoUrl,
              },
            });
          }
        })();

        // ── Step 2: Generation ──────────────────────────────────────────────

        if (isSingleProductMode) {
          // ── SINGLE-PRODUCT PATH ─────────────────────────────────────────
          // Skip product matching, panel compositing, and vision verification.
          // Just place one product in the user's room photo.
          try {
            setGenStatus('Placing product in your space…');
            log('single-product mode | product=' + singleProduct.name?.substring(0, 50));

            // Pre-flight the product image URL
            const productOk = await preflightUrl(singleProduct.imageUrl);
            if (!productOk) {
              throw new Error('Product image is not reachable — it may have expired.');
            }

            resultUrl = await generateSingleProductInRoom(
              roomPhotoUrl,
              singleProduct,
              aspectRatio,
            );
            finalProducts = [singleProduct];
            genMeta.pipeline = 'single-product';
            log('single-product gen complete | url=' + resultUrl?.substring(0, 80));

            // Structured telemetry for successful single-product generation.
            // Previously missing — BFL-fallback and single-product pipeline
            // ratios were invisible in production logs because only the
            // Replicate-success path emitted [genmeta]. Now every terminal
            // state (success, failure, upload-failure, deduct-failure)
            // emits exactly one structured line so dashboards can compute
            // accurate pipeline breakdowns.
            console.log(
              '[genmeta]',
              'event=success',
              'pipeline=single-product',
              'generationId=' + generationId,
              'productId=' + (singleProduct?.id || '(none)'),
              'source=' + generationSource
            );

            // ── Cost tracking (isolated from generation try/catch) ────────
            // CRITICAL: if deductToken / recordGeneration throws (e.g. network
            // blip while hitting Supabase RPC), the generation has ALREADY
            // succeeded — we have `resultUrl` in hand. Prior to this fix, the
            // outer catch would swallow the success, show "Generation Failed",
            // and the user would lose both the $0.13 generation AND have no
            // wish decrement. Now: log the failure as a warning so telemetry
            // can track it, but continue showing the result. The user gets
            // their image; we eat the cost of the missed decrement rather
            // than double-punishing the user for our network hiccup.
            try {
              if (generationSource === 'token') {
                await deductToken();
                refreshTokenBalance();
              } else {
                await recordGeneration();
                refreshQuota();
              }
            } catch (deductErr) {
              console.warn(
                '[Gen] deduct/record failed on single-product path — result shown anyway.',
                'source=' + generationSource,
                'err=' + (deductErr?.message || deductErr),
                'generationId=' + generationId,
                'resultUrl=' + (resultUrl ? resultUrl.substring(0, 80) : '(none)')
              );
              // Emit structured telemetry so dashboards can count these and
              // investigate if the rate spikes. Log level 'warn' not 'error'
              // because the user experience is not broken.
              console.log(
                '[genmeta]',
                'event=deduct_failed',
                'pipeline=' + genMeta.pipeline,
                'source=' + generationSource,
                'generationId=' + generationId
              );
            }

          } catch (genErr) {
            stopLoadingBar(false);
            setGenerating(false);
            setSingleProduct(null);
            // Structured telemetry — single-product generation failed.
            // pipeline may or may not have been set (depends on whether
            // we got past the preflightUrl check). Use 'single-product'
            // as a best-effort attribution since that's the mode we were in.
            console.log(
              '[genmeta]',
              'event=gen_failed',
              'pipeline=single-product',
              'generationId=' + generationId,
              'err=' + String(genErr?.message || genErr).substring(0, 120)
            );
            Alert.alert(
              'Generation Failed',
              'We couldn\'t place this product in your room. Please try again in a moment.'
            );
            console.error('[Gen] Single-product error:', genErr.message);
            return;
          }

          // ── Single-product complete: auto-save + show popup modal ────
          const durationMs = Date.now() - startedAt;
          log('done | single-product | ' + durationMs + 'ms');

          // Auto-save to user_designs so the Like button can reference a real designId.
          // Wrapped in withTimeout(10s) so a hung Supabase write can never
          // block the user from seeing their result. If the save times out,
          // we proceed without savedDesignId — the user still sees the
          // generated image, they just can't Like it until it's saved
          // via a retry path. Better than an infinite loading spinner.
          let savedDesignId = null;
          if (user?.id) {
            try {
              const saved = await withTimeout(
                saveUserDesign(user.id, {
                  imageUrl: resultUrl,
                  prompt: `Product visualize: ${singleProduct.name || 'product'}`,
                  styleTags: singleProduct.styles || [],
                  products: [{ id: singleProduct.id, name: singleProduct.name, brand: singleProduct.brand, price: singleProduct.price, imageUrl: singleProduct.imageUrl, affiliateUrl: singleProduct.affiliateUrl, source: singleProduct.source }],
                  visibility: 'private',
                }),
                10_000,
                'auto-save single-product design',
              );
              savedDesignId = saved?.id || null;
              log('auto-saved single-product design:', savedDesignId);
            } catch (saveErr) {
              warn('auto-save failed (non-blocking):', saveErr.message);
            }
          }

          stopLoadingBar();
          setGenerating(false);
          setGenStatus('');
          setVisualizeResult({ resultUri: resultUrl, product: singleProduct, designId: savedDesignId });
          setSingleProduct(null);
          setPhoto(null);
          setPhotoSource(null);
          return; // Exit early — don't run full-room post-processing
        }

        // ── FULL-ROOM PATH (existing flow, unchanged) ─────────────────────

        try {
          // ── Primary: Replicate flux-2-max (visual product matching) ─────
          // Sends room photo + catalog product images so the AI visually
          // sees exactly what each product looks like before rendering.
          // Products shown in "Shop Your Room" ARE the products in the photo.
          // Cost: ~$0.10–0.20/generation
          let replicateSucceeded = false;
          // Build 64 (B1 fix): when Ring 2's inner catch records a ring-specific
          // failure, we DON'T want the outer catch (repErr) to also record a
          // redundant ring='outer' row for the same failure. Historically every
          // Ring-2-caused failure produced two rows in generation_errors (one
          // from the inner catch, one from the outer) which inflated the "outer
          // funnel" error count and made dashboards misleading. This flag
          // scopes the de-dupe to a single generation attempt.
          let ring2RecordedError = false;
          try {
            log('AI gen | visual product refs (provider routed via aiProvider)');

            // ── Try panel approach: 2 images instead of 4 → ~50% less GPU compute ──
            // Creates a 768×768 2×2 product grid via edge function, then sends
            // [room, panel] to flux-2-max instead of [room, p1, p2, p3, p4].
            // Target cost: ~$0.13/gen vs $0.31 with individual images.
            //
            // Uses reachableProducts (pre-flighted) so a single stale Amazon
            // URL can't take down the whole generation. We also read back
            // compositedIndices to know EXACTLY which of those products made
            // it into the panel — "Shop Your Room" must show the same 4.
            let usedPanel = false;
            let panelCompositedIndices = null;
            if (reachableProducts.length >= 2) {
              try {
                setGenStatus('Preparing product panel…');
                const panelResponse = await createProductPanel(reachableProducts, user.id);
                if (panelResponse?.url) {
                  // NOTE: we USED to preflight the panel URL here with a 2.5s
                  // timeout. Supabase's render/image/ endpoint cold-first-
                  // request lazily transforms the image, which sometimes takes
                  // > 2.5s, making the preflight fail — at which point the
                  // client silently fell back to the 5-image individual-refs
                  // path at ~2× the cost (confirmed in the Apr 2026 cost audit).
                  //
                  // UPDATE 2026-04-17: createProductPanel now returns the
                  // raw /storage/v1/object/public/ URL (NOT /render/image/).
                  // The /render/image/ path — even with format=origin —
                  // still goes through Supabase's image-processing pipeline
                  // and takes 5-10+ seconds on a cold cache, which caused
                  // Replicate to time out with "Read timed out (read
                  // timeout=10)" every panel generation. Panels don't need
                  // AVIF protection because we encode them as pure JPEG
                  // server-side in the composite-products edge fn.
                  //
                  // We trust the edge function's output: if createProductPanel
                  // returned a URL, the underlying bytes exist on the raw
                  // object endpoint. Skipping preflight means the panel path
                  // "just works" whenever the edge fn succeeds.
                  //
                  // If flux-2-max still can't fetch the URL for some reason,
                  // submitFluxWithRetry() already retries once on E006 with
                  // a fresh seed, which covers transient CDN hiccups.
                  log('panel ready — using 2-image input (room + 2×2 panel) | url=' + String(panelResponse.url).substring(0, 80));
                  setGenStatus('Analyzing your room…');

                  // ── Phantom-product fix ─────────────────────────────────
                  // Previously we passed the FULL `reachableProducts` list
                  // (typically 6) to generateWithProductPanel, which then
                  // builds a prompt describing the FIRST 4 by position. But
                  // composite-products may have skipped one of those first 4
                  // (content-type/decode failure) and substituted product 5
                  // or 6. When that happens, the prompt described positions
                  // for products that aren't actually in the panel image —
                  // flux receives contradictory cues and renders phantom
                  // furniture the user can't shop.
                  //
                  // Read compositedIndices BEFORE the FAL call and filter
                  // reachableProducts down to ONLY the 4 actually in the
                  // panel. The prompt + panel are now perfectly aligned.
                  // Hard fallback: if compositedIndices is missing/empty,
                  // we use the original reachableProducts (no regression).
                  panelCompositedIndices = panelResponse.compositedIndices;
                  const productsForPrompt =
                    Array.isArray(panelCompositedIndices) && panelCompositedIndices.length > 0
                      ? panelCompositedIndices
                          .map((i) => reachableProducts[i])
                          .filter(Boolean)
                      : reachableProducts;
                  log('prompt-panel alignment | composited=[' + (panelCompositedIndices?.join(',') ?? '?') + '] | productsForPrompt=' + productsForPrompt.length);

                  const panelResult = await generateWithProductPanel(
                    roomPhotoUrl,
                    enrichedDesignPrompt,
                    productsForPrompt,
                    panelResponse.url,
                    aspectRatio,
                  );
                  resultUrl = panelResult.url;
                  genMeta.predictionId = panelResult.predictionId;
                  genMeta.seed = panelResult.seed;
                  genMeta.pipeline = 'panel';
                  usedPanel = true;
                  log('panel gen complete | prediction=' + panelResult.predictionId + ' seed=' + panelResult.seed + ' | composited=[' + (panelCompositedIndices?.join(',') ?? '?') + ']');
                } else {
                  warn('createProductPanel returned no URL');
                }
              } catch (panelErr) {
                // Build 38: surface the actual panel error in structured
                // telemetry so we can finally see WHY iPhone camera photos
                // fail Ring 1. Previously this was a warn-only log that never
                // made it into [genmeta] aggregation, leaving us blind to the
                // root cause.
                const pErrMsg = String(panelErr?.message || panelErr);
                warn('panel approach threw | name=' + (panelErr?.name || 'Error') + ' | msg=' + pErrMsg.substring(0, 200));
                console.log(
                  '[genmeta]',
                  'event=ring1_panel_failed',
                  'pipeline=panel',
                  'generationId=' + generationId,
                  'errName=' + (panelErr?.name || 'Error'),
                  'err=' + pErrMsg.substring(0, 200)
                );
                // Build 44: durable server-side telemetry (see supabase.js
                // recordGenerationError comment). Fire-and-forget.
                recordGenerationError({
                  userId: user.id,
                  generationId,
                  ring: 'panel',
                  errorName: panelErr?.name || 'Error',
                  errorMessage: pErrMsg,
                  pipeline: 'panel',
                  clientVersion: String(Constants.expoConfig?.ios?.buildNumber || ''),
                  metadata: {
                    aspect_ratio: aspectRatio,
                    reachable_products: reachableProducts.length,
                    has_room_photo_url: !!roomPhotoUrl,
                  },
                });
              }
            } else {
              warn('panel skipped — only ' + reachableProducts.length + ' reachable products (need 2+)');
            }

            // Build 36: Ring 2 — individual-product-refs safety net.
            //
            // If the 2×2 panel path didn't produce an image (createProductPanel
            // returned null OR generateWithProductPanel threw), fall back to
            // generateWithProductRefs which sends [room, p1, p2, p3, p4] to FAL
            // directly. This is the path that worked reliably pre-Build-22 and
            // gives us a second chance at a room-preserving generation BEFORE
            // dropping all the way to BFL text-to-image (which doesn't preserve
            // the user's actual room).
            //
            // Build 22 removed this fallback to enforce a ≤$0.16 cost ceiling.
            // That ceiling matters less than users being able to generate at
            // all — we restore Ring 2 as a CAUGHT fallback (its own try/catch)
            // so a panel failure doesn't immediately erase the user's room.
            //
            // Cost: ~$0.10–0.20/gen (still well under the $0.45+ raw cost we
            // were seeing pre-optimizer). BFL stays as Ring 3 if BOTH panel
            // and refs paths fail.
            if (!usedPanel) {
              try {
                // Build 38: clear the 2-second ai-proxy cooldown window
                // before attempting Ring 2. The Supabase check_ai_rate_limit
                // RPC enforces a min 2000ms gap between any AI POST per user
                // (014_rate_limits.sql). If Ring 1 just submitted ~1s ago,
                // Ring 2 would 429 with reason='cooldown' and we'd lose the
                // last shot at preserving the user's actual room before
                // dropping to BFL text-to-image. Sleep 2200ms (200ms safety
                // margin over the 2000ms cooldown).
                //
                // Build 64 (C2): before consuming Ring 2's budget, check the
                // global 8-min deadline. If Ring 1 burned most of it (e.g.
                // max-polls + seed-retry = 8 min), skip Ring 2 entirely and
                // let Ring 3 (BFL, ~3 min cap) run inside what's left. The
                // throw is caught by the enclosing catch (repErr) and sets us
                // up for Ring 3 just like a normal Ring-2 failure would.
                if (Date.now() - startedAt > GENERATION_DEADLINE_MS) {
                  console.log(
                    '[genmeta]',
                    'event=ring2_skipped_deadline',
                    'generationId=' + generationId,
                    'elapsedMs=' + (Date.now() - startedAt)
                  );
                  throw new Error('Ring 2 skipped — 8-min generation deadline exceeded.');
                }
                setGenStatus('Refining your design…');
                await new Promise(r => setTimeout(r, 2200));
                log('Ring 2: panel failed → trying generateWithProductRefs (room + ' + Math.min(reachableProducts.length, 4) + ' product images)');
                const refsResultUrl = await generateWithProductRefs(
                  roomPhotoUrl,
                  enrichedDesignPrompt,
                  reachableProducts.slice(0, 4),
                  aspectRatio,
                );
                resultUrl = refsResultUrl;
                genMeta.pipeline = 'individual-refs';
                finalProducts = reachableProducts.slice(0, 4);
                replicateSucceeded = true;
                log('Ring 2 succeeded | url=' + String(resultUrl).substring(0, 80));
                console.log(
                  '[genmeta]',
                  'event=success',
                  'pipeline=individual-refs',
                  'generationId=' + generationId,
                  'productsIn=' + reachableProducts.length,
                  'productsUsed=' + finalProducts.length,
                  'source=' + generationSource
                );
              } catch (refsErr) {
                const rErrMsg = String(refsErr?.message || refsErr);
                warn('Ring 2 (productRefs) failed (' + rErrMsg + ') — dropping to BFL text-to-image');
                console.log(
                  '[genmeta]',
                  'event=ring2_failed',
                  'pipeline=individual-refs',
                  'generationId=' + generationId,
                  'err=' + rErrMsg.substring(0, 120)
                );
                // Build 44: durable telemetry for Ring 2 failure.
                recordGenerationError({
                  userId: user.id,
                  generationId,
                  ring: 'individual-refs',
                  errorName: refsErr?.name || 'Error',
                  errorMessage: rErrMsg,
                  pipeline: 'individual-refs',
                  clientVersion: String(Constants.expoConfig?.ios?.buildNumber || ''),
                  metadata: {
                    aspect_ratio: aspectRatio,
                    reachable_products: reachableProducts.length,
                    has_room_photo_url: !!roomPhotoUrl,
                  },
                });
                // Build 64 (B1): mark that Ring 2 has already recorded a durable
                // error for this attempt. The outer catch (repErr) below will
                // see this flag and skip its own recordGenerationError so we
                // don't double-record the same failure as both 'individual-refs'
                // AND 'outer' in the generation_errors table.
                ring2RecordedError = true;
                throw new Error('All FAL paths failed — dropping to BFL text-to-image fallback');
              }
            }

            // Panel succeeded — reconcile finalProducts with what was ACTUALLY
            // rendered. panelCompositedIndices tells us which of the input
            // reachableProducts made it into the 2×2 grid; Shop Your Room
            // shows exactly those 4, so users never see a product that isn't
            // in their generated image.
            //
            // Build 36: gate this entire block behind `usedPanel` so that when
            // Ring 2 (individual-refs) succeeds via the new fallback above,
            // we don't double-emit [genmeta] event=success or overwrite the
            // already-correct finalProducts/replicateSucceeded values.
            if (usedPanel) {
              if (Array.isArray(panelCompositedIndices) && panelCompositedIndices.length > 0) {
                finalProducts = panelCompositedIndices
                  .map(i => reachableProducts[i])
                  .filter(Boolean);
              } else {
                finalProducts = reachableProducts.slice(0, 4);
              }
              replicateSucceeded = true;
              // Structured telemetry: exactly which pipeline ran. Grep prod
              // logs for `[genmeta]` to see panel vs individual-capped ratios
              // and catch any regression in the 2×2 panel path cost/routing.
              // Added event=success so all terminal states use a consistent
              // event= key that log aggregators can group on.
              console.log(
                '[genmeta]',
                'event=success',
                'pipeline=' + genMeta.pipeline,
                'generationId=' + generationId,
                'productsIn=' + reachableProducts.length,
                'productsUsed=' + finalProducts.length,
                'predictionId=' + (genMeta.predictionId || '(none)'),
                'seed=' + (genMeta.seed ?? '(none)'),
                'source=' + generationSource
              );
              log('AI gen complete | url=' + resultUrl.substring(0, 80) + ' | finalProducts=' + finalProducts.length);
            }
          } catch (repErr) {
            // Surface as much detail as possible — this catch is the funnel
            // for "user sees BFL fallback" and we historically lost the actual
            // FAL error here. Build 36: also emit a [genmeta] line so
            // production logs let us slice failure rates by pipeline.
            const errMsg = String(repErr?.message || repErr);
            warn(
              'replicate failed | name=' + (repErr?.name || 'Error') +
              ' | msg=' + errMsg.substring(0, 200) +
              ' | pipeline=' + (genMeta.pipeline || 'pre-pipeline') +
              ' — dropping to BFL text-to-image'
            );
            console.log(
              '[genmeta]',
              'event=fal_pipeline_failed',
              'pipeline=' + (genMeta.pipeline || 'pre-pipeline'),
              'generationId=' + generationId,
              'errName=' + (repErr?.name || 'Error'),
              'err=' + errMsg.substring(0, 200)
            );
            // Build 44: durable telemetry for the outer-try catch — this is
            // the funnel that captures "something in the FAL/Replicate path
            // threw but we couldn't attribute to Ring 1 or Ring 2 specifically"
            // (e.g. product matching threw, pre-pipeline bailout, etc.)
            //
            // Build 64 (B1 fix): skip this record if Ring 2 already recorded
            // one for the same attempt. Ring 2's inner catch writes a row with
            // ring='individual-refs' and then rethrows into us; without this
            // guard we'd also write a ring='outer' row for the same failure,
            // which was doubling the outer-funnel count in dashboards and
            // masking the true distribution of pre-pipeline vs Ring-2 errors.
            if (!ring2RecordedError) {
              recordGenerationError({
                userId: user.id,
                generationId,
                ring: 'outer',
                errorName: repErr?.name || 'Error',
                errorMessage: errMsg,
                pipeline: genMeta.pipeline || 'pre-pipeline',
                clientVersion: String(Constants.expoConfig?.ios?.buildNumber || ''),
                metadata: {
                  aspect_ratio: aspectRatio,
                  reachable_products: reachableProducts.length,
                  has_room_photo_url: !!roomPhotoUrl,
                },
              });
            } else {
              log('outer catch: skipping ring=outer record (Ring 2 already recorded individual-refs)');
            }
          }

          // ── Ring 3 fallback: BFL text-to-image (prompt only, no image inputs) ──
          //
          // Build 22: this is the ONLY fallback path. We no longer submit
          // flux-2-max with extra inputs (that violated the ≤ 2-input cost
          // contract) and we no longer use BFL kontext (image-to-image with
          // the room photo) — kontext costs more AND can fail silently with
          // sideways bytes the same way flux-2-max did.
          //
          // flux-pro-1.1-ultra text-to-image:
          //   - No image inputs at all → no EXIF / rotation / format issues
          //   - Cost: ~$0.04/gen
          //   - Produces a "general" room in the prompted style + products by
          //     description (not visual reference) — the user's actual room
          //     is NOT preserved. We tell the user this up front via the
          //     alert below so they're not surprised.
          //
          // Why an alert before the fallback: otherwise the user sees a room
          // that isn't theirs and thinks the AI is broken. With the heads-up
          // they understand that the product matching didn't work this time,
          // the image they're seeing is a generic design, and they can retry
          // with a different photo.
          if (!replicateSucceeded) {
            // Build 64 (C2): enforce the 8-min wall-clock deadline before
            // burning Ring 3's ~3 min polling budget. If Rings 1+2 already
            // consumed the whole budget (e.g. panel timed out at 4 min +
            // individual-refs timed out at 4 min), falling through to BFL
            // would push total time to ~11 min — past when any real user has
            // given up. Throwing here lands in catch (genErr) at the outer
            // scope, which shows the friendly "Generation Failed" Alert and
            // releases the double-tap lock cleanly. Wish is NOT deducted
            // because we never reached deductToken/recordGeneration.
            if (Date.now() - startedAt > GENERATION_DEADLINE_MS) {
              console.log(
                '[genmeta]',
                'event=ring3_skipped_deadline',
                'generationId=' + generationId,
                'elapsedMs=' + (Date.now() - startedAt)
              );
              throw new Error('Generation took too long. Please try again with a different photo or prompt.');
            }

            const bflProducts = (reachableProducts.length > 0
              ? reachableProducts
              : matchedProducts
            ).slice(0, 4);

            // Non-blocking heads-up. Alert.alert is synchronous-to-show but
            // the user interaction is async — we kick off the BFL call in
            // parallel so they don't wait for their OK tap to generate.
            Alert.alert(
              "We couldn't use your room photo",
              "Generating a general design from your prompt instead. Try another photo for a personalized result.",
            );

            // Build 38: clear the 2-second ai-proxy cooldown window before
            // attempting Ring 3 BFL. Ring 2's failed POST just consumed the
            // cooldown; without this delay BFL would also 429 and the user
            // would see TWO error popups in ~3 seconds (the Build 37 regression).
            await new Promise(r => setTimeout(r, 2200));

            log('BFL text-to-image fallback | cost=~$0.04 | aspect=' + aspectRatio + ' | products=' + bflProducts.length);
            resultUrl = await generateWithBFL(
              enrichedDesignPrompt,
              bflProducts,
              (msg) => setGenStatus(msg),
              null,           // ← no room photo → forces text-to-image path
              aspectRatio,
            );
            finalProducts = bflProducts;
            genMeta.pipeline = 'bfl-text';
            log('BFL text-to-image complete');
            console.log(
              '[genmeta]',
              'event=success',
              'pipeline=bfl-text',
              'generationId=' + generationId,
              'productsIn=' + reachableProducts.length,
              'productsUsed=' + bflProducts.length,
              'source=' + generationSource
            );
          }

          // ── Cost tracking (isolated from generation try/catch) ──────────
          // Same isolation as single-product path above. By this point we
          // have a valid resultUrl from either Replicate or BFL. If the
          // deduct/record call to Supabase fails (transient network, RPC
          // error, stale session), we MUST still show the user their
          // generated image. Swallow the error, log it loudly for later
          // reconciliation, and continue. The alternative (dropping through
          // to the outer catch) would hide a successful $0.13 generation
          // from the user while also not decrementing their wish — the
          // worst possible UX + revenue outcome.
          try {
            if (generationSource === 'token') {
              await deductToken();
              refreshTokenBalance();
            } else {
              await recordGeneration();
              refreshQuota();
            }
          } catch (deductErr) {
            console.warn(
              '[Gen] deduct/record failed on full-room path — result shown anyway.',
              'source=' + generationSource,
              'err=' + (deductErr?.message || deductErr),
              'generationId=' + generationId,
              'pipeline=' + genMeta.pipeline,
              'resultUrl=' + (resultUrl ? resultUrl.substring(0, 80) : '(none)')
            );
            console.log(
              '[genmeta]',
              'event=deduct_failed',
              'pipeline=' + genMeta.pipeline,
              'source=' + generationSource,
              'generationId=' + generationId
            );
          }

        } catch (genErr) {
          stopLoadingBar(false);
          setGenerating(false);
          // Structured telemetry — full-room generation failed on BOTH
          // Replicate and BFL (or at an earlier step like product match).
          // genMeta.pipeline may be 'panel' / 'individual-capped' / 'bfl'
          // depending on how far we got before the throw, or null if we
          // failed before any pipeline was attempted.
          console.log(
            '[genmeta]',
            'event=gen_failed',
            'pipeline=' + (genMeta.pipeline || 'pre-pipeline'),
            'generationId=' + generationId,
            'err=' + String(genErr?.message || genErr).substring(0, 120)
          );
          Alert.alert(
            'Generation Failed',
            'We couldn\'t generate your wish right now. Please try again in a moment.'
          );
          console.error('[Gen] Generation error:', genErr.message);
          return;
        }
      } else {
        // Not signed in — route to the full Auth wall so the user can sign
        // in or create an account in-flow instead of being bounced back to
        // Home by a dead-end native Alert.
        //
        // Stash the prompt first so AuthScreen's navigation.reset (which
        // remounts the whole tab tree) doesn't lose what the user typed.
        // The matching restore effect above rehydrates it on remount if
        // the handoff happens within 5 minutes.
        stopLoadingBar(false);
        setGenerating(false);
        try {
          if (prompt && prompt.trim()) {
            await AsyncStorage.setItem(
              '@homegenie_pending_prompt',
              JSON.stringify({ prompt, savedAt: Date.now() }),
            );
          }
        } catch (e) {
          // Best-effort — never block the Auth navigation on storage
        }
        navigation.navigate('Auth');
        return;
      }

      stopLoadingBar();

      // ── Vision-based product VERIFICATION (not re-matching) ───────────────
      // Legal-critical step: never swap products from the pre-matched set.
      // Claude Haiku looks at the generated image and scores each of the 4
      // already-committed products. Products with a strong visual match get
      // tagged 'verified'; the rest get 'similar' and the UI shows a "Similar
      // style" badge on them. The product IDs displayed ALWAYS match what we
      // pre-committed, so users can't be shown a product that wasn't in the
      // reference set. Cost: ~$0.001/call (Haiku). Falls back to unverified.
      //
      // CRITICAL: this call is wrapped in a 20-second timeout via withTimeout.
      // Before this guard was added, the call had no timeout whatsoever — if
      // the Anthropic API was slow or degraded, the entire generation UI hung
      // forever on "Adding the finishing touches…" even though the Replicate
      // image had already been generated successfully (see Apr 17 2026
      // TestFlight report: user got charged $0.25 for a generation they
      // never actually saw because this step blocked indefinitely). 20s is
      // 10x the typical Haiku latency (~1-3s) — if we miss it, something is
      // wrong upstream and falling back to unverified is the right call.
      let finalMatchedProducts = finalProducts;
      let verifyMeta = { verifiedCount: 0, roomType: null, visionItems: [] };
      let verifyTimedOut = false;
      try {
        setGenStatus('Verifying your products…');
        const verifyResult = await withTimeout(
          verifyGeneratedProducts(resultUrl, finalProducts),
          20_000,
          'product verification',
        );
        if (verifyResult?.products?.length > 0) {
          finalMatchedProducts = verifyResult.products;
          verifyMeta.verifiedCount = finalMatchedProducts.filter(p => p.confidence === 'verified').length;
          verifyMeta.roomType = verifyResult.roomType || null;
          verifyMeta.visionItems = verifyResult.visionItems || [];
          log('verify: ' + verifyMeta.verifiedCount + '/' + finalMatchedProducts.length + ' verified');
        }
      } catch (visionErr) {
        const msg = visionErr?.message || String(visionErr);
        verifyTimedOut = /timed out/i.test(msg);
        warn('verify failed (' + (verifyTimedOut ? 'timeout' : 'error') + '), showing pre-matched set unverified: ' + msg);
        finalMatchedProducts = finalProducts.map(p => ({ ...p, confidence: 'unverified' }));

        // Structured telemetry: distinguish timeout from other verify errors
        // so we can detect Anthropic-API degradation in production logs.
        console.log(
          '[genmeta]',
          'event=' + (verifyTimedOut ? 'verify_timeout' : 'verify_failed'),
          'pipeline=' + genMeta.pipeline,
          'generationId=' + generationId,
          'err=' + String(msg).substring(0, 120),
        );
      }

      const durationMs = Date.now() - startedAt;
      log('done | ' + durationMs + 'ms | pipeline=' + genMeta.pipeline + ' | verified=' + verifyMeta.verifiedCount + '/' + finalMatchedProducts.length);

      // Build 91: REORDERED for the climax burst.
      //   PRIOR: setGenerating(false) → setResultData → navigate immediately
      //   NEW:   setResultData → stash nav params → stopLoadingBar(true)
      //          (forces progress to 1 → Act III) → setClimaxFiring(true).
      //          The 400ms burst plays in the GenieLoader, then
      //          handleClimaxComplete fires setGenerating(false) + navigate.
      //
      // We KEEP generating=true through the climax so the BlurView + loader
      // stay rendered. The state cleanups (photo, prompt, key bump) move
      // here too because they don't affect the loader's visibility.
      setResultData({
        imageUri: savedPhoto.uri,
        resultUri: resultUrl,
        prompt: designPrompt,
        products: finalMatchedProducts,
      });

      // Fire local notification if user has AI Generation Ready enabled
      sendNotificationIfEnabled(
        'ai_ready',
        '✨ Your wish is ready!',
        'Tap to see your AI-redesigned room and matched products.',
        { screen: 'RoomResult' }
      ).catch(() => {});

      // Snapshot the rolling style history BEFORE this style is appended.
      // RoomResult receives the "before" history so its Remix FAB can compute
      // the next style with `pickRemixStyle(POOL, current, beforeHistory)` —
      // the FAB itself appends `savedStyleId` when sending the remix intent
      // back, keeping history aligned with what the user actually saw.
      const recentStyleIdsBefore = recentStyleIdsRef.current.slice();
      // Advance history for any *future* gen kicked off from HomeScreen
      // (carousel tap, typed prompt) so it inherits the same anti-repetition
      // behavior remixes get. Capped at 3 by appendStyleHistory.
      recentStyleIdsRef.current = appendStyleHistory(recentStyleIdsRef.current, savedStyleId, 3);

      // Stash the RoomResult navigation params in the ref. handleClimaxComplete
      // reads + clears it after the burst.
      pendingNavRef.current = {
        prompt: designPrompt,
        resultUri: resultUrl,
        // Build 69 Commit D: pass the original photo URI so RoomResultScreen
        // can play a reveal animation (before → after sweep). The screen
        // gracefully falls back to showing only `resultUri` if beforeUri is
        // absent (e.g. when the user opens an old design from their profile
        // history, where the original photo isn't available).
        beforeUri: savedPhoto?.uri || null,
        products: finalMatchedProducts,
        // Remix-FAB inputs (Build 99). styleId/photoMeta/photoSource let the
        // FAB rebuild a remixIntent and bounce back to HomeScreen, which will
        // re-run runGeneration with the same photo and a different style.
        // recentStyleIds is the rolling 3-deep window of styles seen BEFORE
        // this one — pickRemixStyle excludes current + this list.
        styleId: savedStyleId,
        photoMeta: savedPhoto,
        photoSource: savedPhotoSource,
        recentStyleIds: recentStyleIdsBefore,
        // Dev-only debug metadata — RoomResultScreen renders an overlay when __DEV__
        debug: {
          ...genMeta,
          ...verifyMeta,
          durationMs,
          photoWidth: savedPhoto.width,
          photoHeight: savedPhoto.height,
        },
      };

      // Trigger the climax burst. GenieLoader runs its 400ms reveal sequence
      // and calls handleClimaxComplete when done.
      // Build 92: removed the stopLoadingBar(true) call that pushed
      // loadingProgress to 1 — that was only needed for Build 91's Act III
      // phase escalation which has been reverted. The loading bar timer
      // continues offscreen until the next generation resets it.
      setClimaxFiring(true);

      // State cleanups that don't affect loader visibility — safe to do now.
      setPhoto(null);
      setPhotoSource(null);
      setPrompt('');
      // Force iOS to drop its cached multiline content-height for this
      // TextInput. .clear() handles the native-reset path; bumping the
      // key remounts the component entirely, which guarantees iOS
      // re-measures content from scratch on the next mount.
      promptInputRef.current?.clear();
      bumpInputKey();

      // Auto-save is now handled EXCLUSIVELY in RoomResultScreen's mount
      // useEffect. Previously HomeScreen ALSO auto-saved here right after
      // navigation, which caused every full-room generation to be persisted
      // twice — once from this fire-and-forget call, and once from the
      // RoomResultScreen useEffect that has no idea this save happened.
      // Result: the user's My Snaps showed two identical posts for every
      // generation. RoomResultScreen's auto-save has proper ref-based
      // dedup guards and is the correct single source of truth.
    } catch (err) {
      stopLoadingBar(false);
      setGenerating(false);
      setGenStatus('');
      // Structured telemetry — outermost error boundary. This catches things
      // like vision verification throws, setResultData failures, or anything
      // between pipeline success and navigation.navigate. genMeta is NOT in
      // scope here (declared inside the outer try), so we reference only
      // generationId. This is the "last resort" bucket — any spike here
      // points to a bug in the post-generation flow (verify, save, navigate).
      console.log(
        '[genmeta]',
        'event=outer_error',
        'pipeline=unknown',
        'generationId=' + generationId,
        'err=' + String(err?.message || err).substring(0, 120)
      );
      Alert.alert('Generation Failed', err.message || 'Something went wrong. Please try again.');
    } finally {
      // Always release the double-tap lock, no matter how we exit the try —
      // normal completion, thrown error, paywall navigation return, upload
      // failure return, single-product catch return, etc. Without this,
      // one failed generation would leave the Generate button dead.
      generatingRef.current = false;
    }
  };

  // First-visit auth redirect — REMOVED. This was creating a "dual sign-in
  // wall" experience: on first launch it would auto-push the full-screen
  // AuthScreen modal (which hides the tab bar), while the Snap/Cart/Profile
  // tabs separately show an inline AuthGate (which keeps the tab bar
  // visible). Two visually-identical walls with different dismiss behavior
  // was confusing users on TestFlight and blocking browsing.
  //
  // New behavior: unauthenticated users land on Home and can freely browse
  // Home + Explore. They only see the AuthGate when they explicitly tap a
  // tab that requires sign-in (Snap/Cart/Profile), and that gate keeps the
  // tab bar visible so they can navigate away.

  // Generation quota now managed by SubscriptionContext

  const firstName = getFirstName(user);
  const greetingLine = firstName
    ? `${greeting} ${firstName.toUpperCase()}`
    : greeting;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <TabScreenFade style={styles.container}>
      {/* Hero background — crossfading slideshow.
          Build 89: <Image> mounts gated on `mountedHeroSet.has(i)` so iOS
          only decodes images we've actually displayed. See lazy-mount
          comment on the heroOpacities useEffect above. */}
      <View style={styles.bgImage}>
        {HERO_IMAGES.map((src, i) => (
          <Animated.View key={i} style={[StyleSheet.absoluteFill, { opacity: heroOpacities[i], justifyContent: 'center' }]}>
            {mountedHeroSet.has(i) && (
              <Image
                source={src}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
              />
            )}
          </Animated.View>
        ))}
      </View>
      <View style={styles.heroTint} pointerEvents="none" />

      <ScrollView
        style={StyleSheet.absoluteFill}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        bounces={false}
        // 'handled' lets a tap on a child TouchableOpacity (e.g. the × on
        // the selected-style pill, or any style card in the StyleCarousel)
        // fire its onPress in the same gesture that dismisses the keyboard.
        // Without this, when the TextInput is focused, iOS dismisses the
        // keyboard FIRST and swallows the tap — so the user has to tap
        // twice and the app feels broken.
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Hero section — fills visible screen ─────────────────────── */}
        <View style={styles.overlay}>
          {/* Top bar: centered logo — icon hidden during generation.
              During generation we lift the heading + tagline higher on the
              screen so the GenieLoader's orbiting particles (80px radius
              around the lamp at ~34% from top) don't visually overlap the
              "HomeGenie" wordmark or tagline. */}
          <View style={[styles.topBar, generating && styles.topBarGenerating]}>
            <View style={styles.logoRow}>
              {/* Build 90 fix: numberOfLines + adjustsFontSizeToFit defends
                  against the wordmark clipping when Geist_700Bold hasn't
                  finished loading yet (Build 89 / 🚩1 unblocked the font
                  gate so renders can race the font load). The tagline
                  below already has these — bringing the logo to parity.
                  Steady-state behavior unchanged: when Geist is loaded,
                  the text fits at full 46pt and no scaling triggers. */}
              <Text
                style={styles.logo}
                allowFontScaling={false}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.85}
              >
                HomeGenie
              </Text>
              {!generating && (
                <View style={styles.logoIcon}>
                  <HeaderLogoIcon size={44} />
                </View>
              )}
            </View>
            <Text
              style={styles.wishTagline}
              allowFontScaling={false}
              numberOfLines={1}
              adjustsFontSizeToFit
              minimumFontScale={0.85}
            >
              Your dream room, one wish away
            </Text>
          </View>

          {/* Blur overlay when generating */}
          {generating && (
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          )}

          {/* Generation status — GenieLoader animation.
              Build 92: reverted Build 91's 3-act phase progression. Only the
              climax burst is kept — when the result is ready, climaxTrigger
              flips to true and the GenieLoader plays its 400ms reveal. */}
          {generating && (
            <View style={styles.heroCentered}>
              <GenieLoader
                size={100}
                animating={generating}
                climaxTrigger={climaxFiring}
                onClimaxComplete={handleClimaxComplete}
              />
              <Animated.Text style={[styles.genStatusText, { opacity: loadingMsgOpacity }]}>
                {loadingMessages[loadingMsgIndex] || genStatus || 'Designing your space…'}
              </Animated.Text>
            </View>
          )}

          {/* Input bar — centered in hero, drops below loader during generation */}
          <View style={[styles.heroBottom, generating && styles.heroBottomGenerating]}>
            {/* Above-input zone:
                - Default: empty. The legacy "recommended prompt" chip strip
                  was retired once the StyleCarousel below the input bar
                  became the canonical way to seed a wish — keeping both
                  surfaces was redundant and visually noisy.
                - After the user taps a card in the StyleCarousel: this zone
                  renders the "selected style" pill (thumbnail + label +
                  prompt preview + × clear button). The pill is the only
                  thing that ever appears above the input bar going forward. */}
            {!generating && selectedStyle && (
              <View style={styles.selectedStylePill}>
                <Image source={selectedStyle.image} style={styles.selectedStyleThumb} resizeMode="cover" />
                <View style={styles.selectedStyleTextBlock}>
                  <Text style={styles.selectedStyleLabel} numberOfLines={1}>{selectedStyle.label}</Text>
                  <Text style={styles.selectedStylePrompt} numberOfLines={1}>{selectedStyle.prompt}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.selectedStyleClear, { zIndex: 100, elevation: 100 }]}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  onPress={() => {
                    // Full reset on ×. The order matters:
                    //   1. ref.clear() — iOS-native text reset that ALSO
                    //      forces the multiline TextInput to recompute its
                    //      content height. Without this, the bar stays
                    //      stuck at its expanded pixel height even though
                    //      `value` becomes ''.
                    //   2. ref.blur() — drops keyboard focus.
                    //   3. setPrompt('') — keeps React state in sync with
                    //      the cleared native input so any consumer of
                    //      `prompt` sees the empty value.
                    //   4. setSelectedStyle(null) — dismisses the pill and
                    //      brings the carousel back into focus as the
                    //      primary affordance.
                    //   5. Keyboard.dismiss() — belt-and-suspenders if blur
                    //      didn't fully drop the keyboard (rare iOS edge).
                    promptInputRef.current?.clear();
                    promptInputRef.current?.blur();
                    setPrompt('');
                    setSelectedStyle(null);
                    Keyboard.dismiss();
                    // Force-remount the TextInput so iOS forgets any cached
                    // content-height from the just-cleared preset prompt.
                    // Without this, ×-then-pick-different-style sometimes
                    // leaves the bar at the previous prompt's pixel height
                    // because the iOS UITextView never re-measured.
                    bumpInputKey();
                  }}
                  activeOpacity={0.6}
                >
                  <Text style={styles.selectedStyleClearX}>×</Text>
                </TouchableOpacity>
              </View>
            )}
            {/* Photo preview removed — the camera/gallery icons on the input
                bar already show a blue checkmark badge when a photo is
                attached. A full-size thumbnail above the input bar is
                redundant and pushes the hero content down. */}

            <OnboardingGlow visible={isStepActive('chat_bar') && !generating} borderRadius={20} style={(isStepActive('chat_bar') && !generating) ? { padding: 4 } : undefined}>
            {/* Wrapper sits between OnboardingGlow and the inputBar so the
                camera/gallery icons can be ABSOLUTE SIBLINGS of the inputBar
                — not children of it. This is the only structure that
                survives iOS' UITextView hit-test claim: a multiline
                UITextView's hitTest:withEvent: implementation in iOS
                effectively grabs all touches inside its parent View's
                bounds. As long as the icons live inside the inputBar
                with the TextInput, they cannot receive touches. Moving
                them up one level so they're a sibling of the inputBar
                puts them in a parent (this wrapper) that has NO
                UITextView child — wrapper.hitTest correctly returns the
                topmost matching child without UITextView interference. */}
            <View style={{ position: 'relative' }}>
            <View style={[styles.inputBar, { borderRadius: 16, paddingLeft: 84 }]}>
              <TextInput
                // key changes only on programmatic prompt mutations (style
                // pick / × / post-generation / Auth restore) — bumping it
                // unmounts + remounts the TextInput so iOS measures the
                // multiline content height from scratch. User typing does
                // NOT bump the key, so cursor position is preserved during
                // active editing.
                key={textInputResetKey}
                ref={promptInputRef}
                style={styles.inputText}
                placeholder={photo ? "Photo attached — what's your wish..." : "What's your wish..."}
                placeholderTextColor="rgba(255,255,255,0.85)"
                value={prompt}
                onChangeText={setPrompt}
                multiline
                textAlignVertical="center"
                blurOnSubmit
                returnKeyType="send"
                editable={!generating}
                maxLength={200}
                onSubmitEditing={runGeneration}
                // No onContentSizeChange — the bar's height is now driven
                // entirely by iOS' native multiline TextInput growth, capped
                // by styles.inputBar.maxHeight. Tracking expansion in React
                // state was the source of the radius-flicker bug and isn't
                // needed once the radius is constant.
                onFocus={() => springOut(inputScale)}
                onBlur={() => Animated.spring(inputScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 7 }).start()}
              />
              <TouchableOpacity
                style={styles.inputSendBtnWrap}
                activeOpacity={1}
                onPress={runGeneration}
                disabled={generating}
                onPressIn={() => !generating && springIn(sendScale)}
                onPressOut={() => !generating && springOut(sendScale)}
              >
                {(!prompt.trim() && !photo) ? (
                  <View style={[styles.inputSendBtn, styles.inputSendBtnOff]}>
                    <Animated.View style={{ transform: [{ scale: sendScale }] }}>
                      <SendIcon />
                    </Animated.View>
                  </View>
                ) : (
                  <LinearGradient
                    colors={['#67ACE9', '#0B6DC3']}
                    locations={[0.32, 0.86]}
                    style={styles.inputSendBtn}
                  >
                    <Animated.View style={{ transform: [{ scale: sendScale }] }}>
                      <SendIcon />
                    </Animated.View>
                  </LinearGradient>
                )}
              </TouchableOpacity>
            </View>
            </View>
            </OnboardingGlow>
            {/* Camera + Gallery icons — at heroBottom level, NOT inside
                OnboardingGlow / inputBar / wrapper. This is the LAST
                resort architecture: physically separate the icons from
                the entire subtree containing the multiline TextInput so
                iOS' UITextView hit-test claim cannot reach them. iOS
                hit-test on heroBottom finds these icons (rendered later
                in JSX → on top in z-order) before checking OnboardingGlow.
                Top offset is computed dynamically:
                  - 58pt if a style pill is shown above the inputBar
                  - +4pt if the OnboardingGlow is in its padded onboarding
                    state
                  - +6pt to align with inputBar's paddingVertical */}
            <View
              style={{
                position: 'absolute',
                // Build 82 fix: gate the +56 pill offset on `!generating`. The
                // selected-style pill is hidden during generation (its render
                // condition is `selectedStyle && !generating` above), so when
                // generating we must drop the 56pt offset and re-anchor the
                // icons to the top of the inputBar. Otherwise the icons sat
                // ~62pt below heroBottom's top — i.e. lower-middle of the
                // grown bar — which the user reported as "icons moved down".
                top: ((selectedStyle && !generating) ? 56 : 0) + ((isStepActive('chat_bar') && !generating) ? 4 : 0) + 6,
                left: 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <View>
                <TouchableOpacity
                  style={styles.inputIconBtn}
                  activeOpacity={1}
                  hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
                  onPress={() => {
                    if (navigation?.navigate) navigation.navigate('Wish');
                  }}
                  onPressIn={() => springIn(cameraScale)}
                  onPressOut={() => springOut(cameraScale)}
                >
                  <Animated.View style={{ transform: [{ scale: cameraScale }] }}>
                    <CameraSmallIcon />
                  </Animated.View>
                </TouchableOpacity>
                {photo && photoSource === 'camera' && (
                  <View style={styles.attachBadge}>
                    <CheckIcon size={8} color="#fff" />
                  </View>
                )}
              </View>
              <View>
                <TouchableOpacity
                  style={styles.inputIconBtn}
                  activeOpacity={1}
                  hitSlop={{ top: 14, bottom: 14, left: 8, right: 8 }}
                  onPress={() => {
                    if (photo) {
                      setPhoto(null);
                      setPhotoSource(null);
                    } else {
                      handlePickFromLibrary();
                    }
                  }}
                  onPressIn={() => springIn(galleryScale)}
                  onPressOut={() => springOut(galleryScale)}
                >
                  <Animated.View style={{ transform: [{ scale: galleryScale }] }}>
                    <GalleryIcon />
                  </Animated.View>
                </TouchableOpacity>
                {photo && photoSource === 'library' && (
                  <View style={styles.attachBadge}>
                    <CheckIcon size={8} color="#fff" />
                  </View>
                )}
              </View>
            </View>
            {/* Onboarding Step 1 tooltip — hidden during generation so the
                "Describe Your Dream Room" card doesn't sit on top of the
                GenieLoader / status text. When generation completes and
                the user is back on Home, it reappears if they haven't
                finished the onboarding flow. */}
            {isStepActive('chat_bar') && !generating && (
              <OnboardingOverlay
                visible
                step={ONBOARDING_STEPS.CHAT_BAR}
                onNext={() => {
                  nextStep();
                  navigation.navigate('Main', { screen: 'Wish' });
                }}
                onSkip={finishOnboarding}
                tooltipPosition="below"
                // 32pt above keeps the card clear of the input bar; 32pt
                // below keeps it clear of the StyleCarousel cards rendered
                // immediately after. The overlay should sit on its own
                // visual island until the user taps Got it / Skip — no
                // touching adjacent elements at any phone size.
                style={{ position: 'relative', marginTop: 32, marginBottom: 32 }}
              />
            )}
            {/* Loading progress bar */}
            {generating && (
              <View style={styles.loadingBarTrack}>
                <Animated.View
                  style={[
                    styles.loadingBarFill,
                    {
                      width: loadingProgress.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              </View>
            )}
            {/* Style inspiration carousel — 4 visible cards, slow rightward
                auto-drift, paused on touch. Tapping a card sets the matching
                preset prompt and replaces the chip strip above with a
                "selected style" pill. Hidden during generation so the
                GenieLoader has the screen. */}
            {!generating && (
              <StyleCarousel
                onSelect={(preset) => {
                  // Pick a prompt variation that's NOT the same as the last
                  // one shown for this preset. With 3 variations per style,
                  // this guarantees consecutive taps of the same card produce
                  // a different prompt → a different room render → a
                  // different set of catalog products in the panel.
                  const lastIdx = lastPromptIdxRef.current[preset.id];
                  const { idx, prompt: pickedPrompt } = pickPromptVariation(preset, lastIdx);
                  lastPromptIdxRef.current[preset.id] = idx;
                  // Stash the picked prompt onto selectedStyle so the pill
                  // can render it as a preview AND the auto-clear useEffect
                  // (which compares prompt === selectedStyle.prompt) still
                  // works without modification.
                  setSelectedStyle({ ...preset, prompt: pickedPrompt });
                  setPrompt(pickedPrompt);
                  bumpInputKey();
                }}
              />
            )}
          </View>
        </View>

        {/* ════════════════════════════════════════════════════════════════
            BELOW-FOLD CONTENT
            Peeled white card floats over the bottom edge of the hero.
            ════════════════════════════════════════════════════════════════ */}

        {/* ── 1. Style DNA + Room Type Quick-Nav ──────────────────────── */}
        <View style={styles.peeledCard}>

          {/* Room Type Quick-Nav */}
          <View style={styles.roomNavWrap}>
            <SectionHeader noTopMargin title="SHOP BY ROOM" />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.roomNavScroll}
            >
              {ROOM_TYPES.map(rt => (
                <TouchableOpacity
                  key={rt.key}
                  style={styles.roomNavItem}
                  activeOpacity={0.7}
                  onPress={() => navigation?.navigate('Explore', {
                    filterRoomType: rt.key,
                    title: rt.label,
                  })}
                >
                  <View style={styles.roomNavIconWrap}>
                    <View style={[styles.roomNavCircle, { backgroundColor: rt.bg }]}>
                      <RoomIcon roomKey={rt.key} size={28} />
                    </View>
                    {NEW_ROOM_KEYS.includes(rt.key) && (
                      <View style={styles.roomNavNewBadge}>
                        <Text style={styles.roomNavNewBadgeText}>NEW</Text>
                      </View>
                    )}
                  </View>
                  <Text style={styles.roomNavItemLabel}>{rt.label}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>

        {/* Shop By Style section removed */}

        {/* ── 3. Deal of the Day — premium editorial treatment ────────── */}
        {dealProduct && (
          <View style={styles.dealSection}>
            {/* Section eyebrow */}
            <View style={styles.dealEyebrowRow}>
              <View style={styles.dealEyebrowLine} />
              <Text style={styles.dealEyebrow}>Today's Highlight</Text>
              <View style={styles.dealEyebrowLine} />
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                // Build 85 fix — explicit defensive navigation. Prior code
                // was `navigation?.navigate(...)` which silently no-oped
                // when navigation was unexpectedly undefined (rare but
                // possible with deep-linked or remounted screens). The
                // Alert surfaces the failure instead of leaving the user
                // tapping a card that visually responds but never opens.
                if (!navigation || typeof navigation.navigate !== 'function') {
                  Alert.alert('Navigation unavailable', 'Please force-quit and reopen the app.');
                  return;
                }
                try {
                  navigation.navigate('ProductDetail', { product: dealProduct });
                } catch (navErr) {
                  console.warn('[Home/deal] navigate failed:', navErr?.message);
                  Alert.alert('Could not open product', navErr?.message || 'Try again.');
                }
              }}
              style={styles.dealCard}
            >
              {/* ── Hero image (full-width, top) ── */}
              <View style={styles.dealImgWrap}>
                <CardImage
                  uri={dealProduct.imageUrl}
                  style={styles.dealImg}
                  placeholderColor="#E8EDF5"
                  resizeMode="cover"
                />
                {/* Overlaid badge on the image — Deal of the Day only */}
                <View style={styles.dealOverlayRow}>
                  <View style={styles.dealBadge}>
                    <TagIcon size={9} color="#fff" />
                    <Text style={styles.dealBadgeText}>DEAL OF THE DAY</Text>
                  </View>
                </View>
              </View>

              {/* ── Info area (below image) ── */}
              <View style={styles.dealInfoArea}>
                {/* Brand */}
                {dealProduct.brand && (
                  <Text style={styles.dealBrand}>{dealProduct.brand.toUpperCase()}</Text>
                )}

                {/* Product name */}
                <Text style={styles.dealProductName} numberOfLines={2}>
                  {dealProduct.name}
                </Text>

                {/* Short description */}
                {dealProduct.description && (
                  <Text style={styles.dealDescription} numberOfLines={2}>
                    {dealProduct.description}
                  </Text>
                )}

                {/* Rating row */}
                {dealProduct.rating && (
                  <View style={styles.dealRatingRow}>
                    {[1,2,3,4,5].map(i => (
                      <StarIcon
                        key={i}
                        size={13}
                        color={i <= Math.round(dealProduct.rating) ? '#67ACE9' : '#E5E7EB'}
                      />
                    ))}
                    <Text style={styles.dealRatingScore}>{dealProduct.rating.toFixed(1)}</Text>
                    {dealProduct.reviewCount && (
                      <Text style={styles.dealReviewCount}>
                        ({dealProduct.reviewCount.toLocaleString()} reviews)
                      </Text>
                    )}
                    {dealProduct.source && (
                      <Text style={styles.dealSourceTag}>
                        {dealProduct.source === 'amazon' ? 'via Amazon' : dealProduct.source}
                      </Text>
                    )}
                  </View>
                )}

                {/* Price row */}
                <View style={styles.dealPriceRow}>
                  <Text style={styles.dealPrice}>
                    {dealProduct.salePrice && dealProduct.salePrice < dealProduct.price
                      ? (dealProduct.salePriceDisplay || `$${dealProduct.salePrice.toLocaleString()}`)
                      : (dealProduct.priceDisplay || `$${dealProduct.price.toLocaleString()}`)}
                  </Text>
                  {dealProduct.salePrice && dealProduct.salePrice < dealProduct.price && (
                    <Text style={styles.dealPriceOrig}>
                      {dealProduct.priceDisplay || `$${dealProduct.price.toLocaleString()}`}
                    </Text>
                  )}
                </View>

                {/* CTA button */}
                <View style={styles.dealShopBtn}>
                  <Text style={styles.dealShopBtnText}>Shop Now</Text>
                  <ChevronRight color="#fff" />
                </View>
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 4. Recently Viewed (only if history exists) ─────────────── */}
        {recentlyViewed.length > 0 && (
          <View style={styles.section}>
            <SectionHeader
              noTopMargin
              title="RECENTLY VIEWED"
              actionLabel="Clear"
              onAction={() => setRecentlyViewed([])}
            />
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.hScroll}
            >
              {recentlyViewed.map((item, i) => (
                <TouchableOpacity
                  key={item.id || i}
                  style={styles.recentCard}
                  activeOpacity={0.82}
                  onPress={() => navigation?.navigate('ShopTheLook', { design: item })}
                >
    <CardImage uri={item.imageUrl} style={styles.recentCardImg} placeholderColor="#E5E7EB" />
                  <Text style={styles.recentCardTitle} numberOfLines={2}>{item.title?.replace('...', '')}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── 5. Featured Products ─────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            noTopMargin
            title="FEATURED PRODUCTS"
            actionLabel="Shop all"
            onAction={() => {
              // Build 85 fix — defensive navigate, mirrors deal card.
              if (!navigation || typeof navigation.navigate !== 'function') {
                Alert.alert('Navigation unavailable', 'Please force-quit and reopen the app.');
                return;
              }
              try {
                navigation.navigate('Explore', {
                  mode: 'products',
                  title: 'Featured',
                  featuredProductIds: FEATURED_PRODUCTS.map(p => p.id),
                });
              } catch (navErr) {
                console.warn('[Home/featured] Shop all navigate failed:', navErr?.message);
                Alert.alert('Could not open featured', navErr?.message || 'Try again.');
              }
            }}
          />
          <View style={styles.collectionsGrid}>
            {FEATURED_PRODUCTS.slice(0, 4).map((product, i) => (
              <TouchableOpacity
                key={product.id || i}
                style={styles.featuredProductCard}
                activeOpacity={0.7}
                onPress={() => {
                  // Build 85 fix — defensive navigate.
                  if (!navigation || typeof navigation.navigate !== 'function') {
                    Alert.alert('Navigation unavailable', 'Please force-quit and reopen the app.');
                    return;
                  }
                  try {
                    navigation.navigate('ProductDetail', { product });
                  } catch (navErr) {
                    console.warn('[Home/featured] navigate failed:', navErr?.message);
                    Alert.alert('Could not open product', navErr?.message || 'Try again.');
                  }
                }}
              >
                {/* ── Image area ── */}
                <View style={styles.featuredProductImgWrap}>
                  <CardImage uri={product.imageUrl} style={styles.featuredProductImg} placeholderColor="#E8EDF5" compact />
                </View>

                {/* ── Info below image ── */}
                <View style={styles.featuredProductBody}>
                  <Text style={styles.featuredProductName} numberOfLines={2}>
                    {product.name}
                  </Text>
                  <View style={styles.productRatingRow}>
                    <Text style={styles.productStars}>{renderStars(product.rating)}</Text>
                    <Text style={styles.productRatingText}>
                      {product.rating ? ` ${product.rating}` : ''}
                      {product.reviewCount > 0 ? ` (${product.reviewCount.toLocaleString()})` : ' · New'}
                    </Text>
                  </View>
                  <View style={styles.featuredProductRow}>
                    <Text style={styles.featuredProductPrice}>
                      {typeof product.priceValue === 'number'
                        ? `$${product.priceValue.toLocaleString()}`
                        : product.price}
                    </Text>
                    <Text style={styles.featuredShopLink}>Shop Now</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

      </ScrollView>

      {/* ── Result Popup Modal ─────────────────────────────────────────── */}
      {/* Build 90 fix: REVERTED Build 89's pageSheet experiment. pageSheet
          on iPhone constrains the modal to ~90% height, clipping the full-
          bleed AI-generated room photo. Restored the full-screen opaque
          slide so the image displays at native aspect, no scrolling needed
          to see the whole result. The X button remains the explicit
          dismiss. */}
      <Modal
        visible={showResult}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setShowResult(false)}
      >
        <View style={resultStyles.container}>
          {/* Close button — top right */}
          <TouchableOpacity
            style={resultStyles.closeBtn}
            onPress={() => setShowResult(false)}
            activeOpacity={0.7}
          >
            <CloseIcon size={18} color="#fff" />
          </TouchableOpacity>

          <ScrollView
            style={resultStyles.scroll}
            contentContainerStyle={resultStyles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Generated image — natural aspect ratio, no cropping */}
            {resultData?.resultUri && (
              <View style={resultStyles.imageWrap}>
                <AutoImage uri={resultData.resultUri} borderRadius={12} />
              </View>
            )}

            {/* Prompt used */}
            <Text style={resultStyles.promptLabel}>Your Prompt</Text>
            <Text style={resultStyles.promptText} numberOfLines={2}>{resultData?.prompt}</Text>

            {/* Matched products — horizontal cards */}
            {resultData?.products?.length > 0 && (
              <View style={resultStyles.productsSection}>
                <View style={resultStyles.shopHeaderRow}>
                  <View>
                    <Text style={resultStyles.productsTitle}>SHOP YOUR ROOM</Text>
                    <Text style={resultStyles.productsSubtitle}>
                      Products matched to your design
                    </Text>
                  </View>
                  <View style={resultStyles.shopHeaderActions}>
                    <TouchableOpacity style={resultStyles.shopHeaderBtn} onPress={handleDownload} activeOpacity={0.7}>
                      <DownloadIcon size={22} />
                    </TouchableOpacity>
                    <TouchableOpacity style={resultStyles.shopHeaderBtnPost} onPress={() => setShowPostSheet(true)} activeOpacity={0.7} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                      {posting
                        ? <LensLoader size={20} color="#fff" light="#fff" />
                        : <PostIcon size={28} />
                      }
                    </TouchableOpacity>
                    <TouchableOpacity style={resultStyles.shopHeaderBtn} onPress={handleShare} activeOpacity={0.7}>
                      <ShareIcon size={22} />
                    </TouchableOpacity>
                  </View>
                </View>
                {/* Build 89: virtualization tuning — initialNumToRender + windowSize
                    keep memory bounded for the SHOP YOUR ROOM strip even when
                    matching returns many products. removeClippedSubviews safe
                    for horizontal lists on iOS. */}
                <FlatList
                  data={resultData.products}
                  keyExtractor={(item, idx) => item.id || String(idx)}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  initialNumToRender={3}
                  windowSize={5}
                  removeClippedSubviews
                  contentContainerStyle={{ paddingRight: 20, gap: 10 }}
                  renderItem={({ item: product }) => (
                    <TouchableOpacity
                      style={resultStyles.hCard}
                      activeOpacity={0.7}
                      onPress={() => {
                        setShowResult(false);
                        navigation?.navigate('ProductDetail', { product });
                      }}
                    >
                      <CardImage
                        uri={product.imageUrl}
                        style={resultStyles.hCardImg}
                        resizeMode="cover"
                        compact
                      />
                      <View style={resultStyles.hCardBody}>
                        <Text style={resultStyles.hCardName} numberOfLines={2}>{product.name}</Text>
                        <Text style={resultStyles.hCardBrand}>{product.brand}</Text>
                        {!!product.rating && (
                          <View style={resultStyles.hCardRating}>
                            {[1,2,3,4,5].map(i => (
                              <Svg key={i} width={10} height={10} viewBox="0 0 24 24" fill={i <= Math.round(product.rating) ? '#67ACE9' : '#E5E7EB'} stroke="none">
                                <Path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                              </Svg>
                            ))}
                            <Text style={resultStyles.hCardRatingText}>{product.rating.toFixed(1)}</Text>
                            {!!product.reviewCount && (
                              <Text style={resultStyles.hCardReviews}>({product.reviewCount.toLocaleString()})</Text>
                            )}
                          </View>
                        )}
                        <Text style={resultStyles.hCardPrice}>
                          {typeof product.priceValue === 'number'
                            ? `$${product.priceValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                            : typeof product.price === 'number'
                              ? `$${product.price.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                              : product.priceLabel || String(product.price).replace(/^\$+/, '$')}
                        </Text>
                      </View>
                      {(() => {
                        const cartKey = `${product.name}__${product.brand}`;
                        const inCart = cartItems.some(i => i.key === cartKey);
                        return (
                          <TouchableOpacity
                            style={[resultStyles.hCardAdd, inCart && resultStyles.hCardAddDone]}
                            activeOpacity={0.7}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                            onPress={() => {
                              if (!inCart) {
                                addToCart({ ...product, price: product.priceValue ?? product.price });
                              }
                            }}
                          >
                            {inCart ? (
                              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
                                <Polyline points="20 6 9 17 4 12" />
                              </Svg>
                            ) : (
                              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#0B6DC3" strokeWidth={1.2}>
                                <Line x1={12} y1={5} x2={12} y2={19} />
                                <Line x1={5} y1={12} x2={19} y2={12} />
                              </Svg>
                            )}
                          </TouchableOpacity>
                        );
                      })()}
                    </TouchableOpacity>
                  )}
                />
              </View>
            )}

            {/* Add All to Cart */}
            {resultData?.products?.length > 0 && (
              <AddAllToCartButton
                products={resultData.products}
                onAddAll={(products) => {
                  products.forEach(p => addToCart({ ...p, price: p.priceValue ?? p.price }));
                }}
                onViewCart={() => {
                  setShowResult(false);
                  navigation?.navigate('Cart');
                }}
              />
            )}

          </ScrollView>

          {/* ── Post Visibility Sheet (inside result modal) ──────────────── */}
          {showPostSheet && (
            <View style={StyleSheet.absoluteFill}>
              <TouchableOpacity
                style={resultStyles.sheetBackdrop}
                activeOpacity={1}
                onPress={() => setShowPostSheet(false)}
              />
              <View style={resultStyles.sheet}>
                <View style={resultStyles.sheetHandle} />
                <Text style={resultStyles.sheetTitle}>Post this wish</Text>
                <Text style={resultStyles.sheetSubtitle}>Choose who can see it</Text>

                <TouchableOpacity
                  style={resultStyles.sheetOption}
                  onPress={() => handlePost('public')}
                  activeOpacity={0.7}
                >
                  <View style={[resultStyles.sheetOptionIcon, { backgroundColor: '#EFF6FF' }]}>
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#0B6DC3" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
                      <Circle cx={12} cy={12} r={10} />
                      <Line x1={2} y1={12} x2={22} y2={12} />
                      <Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </Svg>
                  </View>
                  <View style={resultStyles.sheetOptionText}>
                    <Text style={resultStyles.sheetOptionTitle}>Post publicly</Text>
                    <Text style={resultStyles.sheetOptionDesc}>Visible on Explore + your profile</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={resultStyles.sheetOption}
                  onPress={() => handlePost('private')}
                  activeOpacity={0.7}
                >
                  <View style={[resultStyles.sheetOptionIcon, { backgroundColor: '#F3F4F6' }]}>
                    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#6B7280" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
                      <Rect x={3} y={11} width={18} height={11} rx={2} ry={2} />
                      <Path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </Svg>
                  </View>
                  <View style={resultStyles.sheetOptionText}>
                    <Text style={resultStyles.sheetOptionTitle}>Save privately</Text>
                    <Text style={resultStyles.sheetOptionDesc}>Only visible on your profile</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={resultStyles.sheetCancel}
                  onPress={() => setShowPostSheet(false)}
                  activeOpacity={0.7}
                >
                  <Text style={resultStyles.sheetCancelText}>Cancel</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
      {/* ── Single-product visualize result popup ───────────────────── */}
      <ProductVisualizeModal
        visible={!!visualizeResult}
        resultUri={visualizeResult?.resultUri}
        product={visualizeResult?.product}
        designId={visualizeResult?.designId}
        onClose={() => setVisualizeResult(null)}
        onAddToCart={(p) => { addToCart(p); setVisualizeResult(null); }}
        onNavigateToProduct={(p) => { setVisualizeResult(null); navigation.navigate('ProductDetail', { product: p }); }}
      />
    </TabScreenFade>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    // White (not black) so back-navigation doesn't flash a black frame while
    // the hero ImageBackground re-renders. The hero image still covers the
    // top section; anything below the hero is already white in the layout.
    backgroundColor: '#FFFFFF',
  },
  bgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: width,
    height: height - 88, // hero section = screen height minus tab bar
  },
  heroTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.40)',
  },
  scrollContent: {
    flexGrow: 1,
  },
  overlay: {
    height: height - 88, // exactly fill visible content area above tab bar
    paddingTop: 60,
  },

  // ── Top bar ──────────────────────────────────────────────────────────────────
  topBar: {
    position: 'absolute',
    top: '36%',
    left: 0,
    right: 0,
    flexDirection: 'column',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    zIndex: 10,
  },
  // Raised position applied during generation so the GenieLoader's
  // orbiting particles (heroCentered is at ~34% from top, particle
  // orbit radius ≈ 80px) don't collide with the heading or tagline.
  topBarGenerating: {
    top: '14%',
  },
  wishTagline: {
    fontSize: 21,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: 'rgba(255,255,255,0.90)',
    marginTop: 6,
    letterSpacing: letterSpacing.normal,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logo: {
    fontSize: 46,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: '#FFFFFF',
    letterSpacing: letterSpacing.tight,
  },
  logoIcon: {
    marginLeft: 8,
  },
  topIcons: { flexDirection: 'row', gap: space.sm },
  iconBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },

  // ── Hero centered content ───────────────────────────────────────────────────
  heroCentered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.lg,
    marginTop: height * 0.34, // ~34% from top → lower center on screen
  },
  heroSubtitle: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: '#FFFFFF',
    lineHeight: 22,
    marginTop: 6,
    textAlign: 'center',
  },

  // Floating pills — scattered organically
  floatingPills: {
    flex: 1,
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 10,
  },
  floatingPill: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  floatingPillOn: { backgroundColor: C.primary, borderColor: C.primary },
  floatingPillText: { fontSize: 13, fontWeight: '500', color: 'rgba(255,255,255,0.85)', fontFamily: 'Geist_500Medium'},
  floatingPillTextOn: { color: '#fff', fontWeight: '600', fontFamily: 'Geist_600SemiBold'},

  // Photo preview
  photoPreviewWrap: {
    borderRadius: 14,
    overflow: 'hidden',
    marginHorizontal: space.lg,
    marginBottom: 12,
  },
  photoPreview: { width: '100%' },
  photoLandscape: { height: 160 },
  photoPortrait: { height: 220 },
  photoOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  photoOverlayText: { color: '#fff', fontSize: 13, fontWeight: '600', fontFamily: 'Geist_600SemiBold'},
  photoRemoveBtn: {
    position: 'absolute', top: 8, right: 8,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  photoRemoveX: { color: '#fff', fontSize: 11, fontWeight: '700', fontFamily: 'Geist_700Bold'},

  // Prompt chips
  promptChipsScroll: {
    marginBottom: 8,
  },
  promptChipsContent: {
    paddingHorizontal: 0,
    gap: 6,
  },
  promptChip: {
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 9999,
    paddingVertical: 5,
    paddingHorizontal: 12,
  },
  promptChipText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
  },

  // Selected-style pill — replaces the prompt-chip strip when the user
  // taps a card in the StyleCarousel. Same vertical band as the chips so
  // the layout doesn't jump. Glassmorphic background to match the existing
  // hero overlay aesthetic.
  selectedStylePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 8,
    marginBottom: 8,
  },
  selectedStyleThumb: {
    width: 36,
    height: 36,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.10)',
  },
  selectedStyleTextBlock: {
    flex: 1,
    marginLeft: 10,
    marginRight: 6,
  },
  selectedStyleLabel: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    lineHeight: 14,
  },
  selectedStylePrompt: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 10,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    lineHeight: 12,
    marginTop: 1,
  },
  selectedStyleClear: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedStyleClearX: {
    color: '#FFFFFF',
    fontSize: 16,
    lineHeight: 18,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    marginTop: -1,
  },

  // Input bar — vertically centered in hero
  heroBottom: {
    position: 'absolute',
    top: '58%',
    left: 16,
    right: 16,
    transform: [{ translateY: -30 }],
  },
  heroBottomGenerating: {
    top: '78%',
    transform: [{ translateY: 0 }],
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 6,
    minHeight: 44,
    maxHeight: 120,
  },
  inputIconBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  inputText: {
    flex: 1,
    fontSize: 15,
    fontFamily: 'Geist_400Regular',
    color: '#fff',
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 6,
  },
  inputSendBtnWrap: {
    overflow: 'hidden',
    borderRadius: 17,
  },
  inputSendBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
  },
  inputSendBtnOff: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  headline: {
    fontSize: 38,
    fontWeight: fontWeight.xbold,
    fontFamily: 'Geist_700Bold',
    color: '#FFFFFF',
    lineHeight: 40,
    letterSpacing: letterSpacing.tight,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  headlineBold: { fontWeight: fontWeight.xbold, fontFamily: 'Geist_700Bold'},
  genStatusText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    marginTop: 56,
    textAlign: 'center',
    textShadowColor: 'rgba(0,0,0,0.4)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
    letterSpacing: 0.3,
  },


  snapBanner: {
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderRadius: radius.md,
    paddingVertical: space.base,
    paddingHorizontal: space.base,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    height: space['6xl'],
  },
  snapBannerLeft: { flexDirection: 'row', alignItems: 'center', gap: space.md, flex: 1 },
  snapIconBox: {
    width: space['4xl'],
    height: space['4xl'],
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  snapBannerText: { flex: 1 },
  snapBannerTitle: {
    ...typeScale.headline,
    fontFamily: 'Geist_600SemiBold',
    color: '#FFFFFF',
    marginBottom: space.xs,
  },
  snapBannerSub: { ...typeScale.caption, color: 'rgba(255,255,255,0.5)', fontFamily: 'Geist_400Regular'},
  snapChevron: {
    width: space['2xl'],
    height: space['2xl'],
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Peeled card — slides over hero bottom ────────────────────────────────────
  peeledCard: {
    backgroundColor: C.white,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    marginTop: -28,
    paddingTop: space.xl,
    paddingBottom: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },

  // Style DNA
  dnaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
  },
  dnaLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dnaIconWrap: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    backgroundColor: C.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dnaTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  dnaSeeAll: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: C.primary,
  },
  dnaChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    gap: space.sm,
    flexWrap: 'wrap',
    marginBottom: space.lg,
  },
  dnaChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  dnaChipText: {
    ...typeScale.micro,
    fontFamily: 'Geist_600SemiBold',
    textTransform: undefined, // override — chips show mixed case, not all-caps
  },
  dnaNote: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
    marginLeft: 4,
  },
  discoverBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: space.lg,
    marginBottom: space.lg,
    backgroundColor: C.surface,
    borderRadius: radius.full,
    paddingVertical: 5,
    paddingLeft: space.base,
    paddingRight: 5,
    borderWidth: 1,
    borderColor: C.border,
  },
  discoverBtnText: {
    ...typeScale.body,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
    flex: 1,
  },
  discoverBtnArrow: {
    width: 42,
    height: 42,
    borderRadius: radius.full,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  // Room type quick-nav
  roomNavWrap: {
    paddingTop: space.sm,
  },
  roomNavLabel: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingHorizontal: space.lg,
    marginBottom: space.md,
  },
  roomNavScroll: {
    paddingHorizontal: space.lg,
    paddingTop: 8,
    gap: space.xl,
  },
  roomNavItem: { alignItems: 'center', gap: 5 },
  roomNavIconWrap: {
    width: 58,
    height: 58,
  },
  roomNavNewBadge: {
    position: 'absolute',
    top: -6,
    right: -8,
    backgroundColor: C.primary,
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 2.5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
    zIndex: 10,
  },
  roomNavNewBadgeText: {
    fontSize: 8,
    fontWeight: '800',
    fontFamily: 'Geist_700Bold',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  roomNavCircle: {
    width: 58,
    height: 58,
    borderRadius: radius.sm,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  roomNavEmoji: { fontSize: 22, fontFamily: 'Geist_400Regular'},
  roomNavItemLabel: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
    textAlign: 'center',
  },

  // ── Shared section shell ─────────────────────────────────────────────────────
  section: {
    backgroundColor: C.white,
    paddingTop: space.lg,
    paddingBottom: space.xl,
    borderTopWidth: 1,
    borderTopColor: C.border,
  },
  sectionAlt: {
    backgroundColor: '#F8F9FA',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    marginBottom: space.base,
  },
  sectionHeaderLeft: { flexDirection: 'row', alignItems: 'center' },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionSeeAll: {
    fontSize: 14,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: C.primary,
  },
  sectionClear: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    fontFamily: 'Geist_500Medium',
    color: C.textTertiary,
  },
  sectionSub: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
    paddingHorizontal: space.lg,
    marginBottom: space.md,
    marginTop: -2,
  },
  hScroll: {
    paddingHorizontal: space.lg,
    gap: space.sm,
  },

  // ── For You cards (50% screen width) ─────────────────────────────────────────
  forYouCard: {
    width: ARRIVAL_CARD_W,
    borderRadius: 6,
    backgroundColor: C.white,
    ...shadow.low,
  },
  forYouImgWrap: {
    width: '100%',
    height: ARRIVAL_CARD_W,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    overflow: 'hidden',
  },
  forYouCardImg: {
    width: '100%',
    height: '100%',
  },
  forYouImgOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.20)',
  },
  forYouStyleTag: {
    position: 'absolute',
    top: 10,
    left: 10,
  },
  forYouInfoBox: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    gap: 2,
  },
  forYouInfoCreator: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: palette.primaryBlue,
    letterSpacing: 0.1,
  },
  forYouCardTitle: {
    ...typeScale.caption,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: palette.textPrimary,
    lineHeight: 16,
  },
  forYouLikePosition: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  forYouLikePill: {
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: radius.sm,
  },

  // ── Curated Collections grid ─────────────────────────────────────────────────
  collectionsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  collectionCard: {
    width: COLL_CARD_W,
    height: 178,
    borderRadius: 4,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  collectionCardImg: {
    width: '100%',
    height: '100%',
  },
  collectionCardContent: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: space.sm,
  },
  collectionCardTitle: {
    ...typeScale.headline,
    fontFamily: 'Geist_600SemiBold',
    color: '#fff',
    letterSpacing: letterSpacing.tight,
    marginBottom: 4,
  },
  collectionCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  collectionCardSub: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: 'rgba(255,255,255,0.75)',
  },
  collectionExploreBtn: {
    backgroundColor: 'transparent',
    paddingHorizontal: space.sm,
    paddingVertical: 4,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.8)',
  },
  collectionExploreBtnText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    letterSpacing: 0.2,
  },
  // ── New Arrivals product cards (split: image top, info bottom) ────────────────
  newArrivalCard: {
    width: COLL_CARD_W,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    ...shadow.low,
  },
  newArrivalCardImg: {
    width: '100%',
    height: 150,
  },
  newArrivalCardInfo: {
    paddingHorizontal: space.sm,
    paddingTop: 8,
    paddingBottom: 10,
    gap: 4,
  },
  newArrivalCardName: {
    ...typeScale.caption,
    color: palette.textPrimary,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    lineHeight: 16,
  },
  newArrivalCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
  },
  newArrivalCardBrand: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: palette.textSecondary,
    flex: 1,
  },
  newArrivalCardPrice: {
    ...typeScale.caption,
    color: palette.primaryBlue,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
  },
  trendingViewLook: {
    ...typeScale.caption,
    color: palette.primaryBlue,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
  },
  productRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 2,
  },
  productStars: {
    fontSize: 11,
    fontFamily: 'Geist_400Regular',
    color: '#67ACE9',
    letterSpacing: 1,
  },
  productRatingText: {
    fontSize: 11,
    color: palette.textSecondary,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
  },

  // ── Shop By Style cards ──────────────────────────────────────────────────────
  styleCard: {
    width: STYLE_CARD_W,
    borderRadius: 6,
    backgroundColor: C.white,
    ...shadow.low,
  },
  styleCardImgWrap: {
    width: '100%',
    height: STYLE_CARD_W,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    overflow: 'hidden',
    backgroundColor: C.white,
  },
  styleCardInfoBox: {
    paddingHorizontal: 8,
    paddingTop: 7,
    paddingBottom: 9,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
    gap: 2,
  },
  styleCardLabel: {
    fontSize: 12,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: palette.textPrimary,
    letterSpacing: 0.1,
  },
  styleCardSub: {
    fontSize: 10,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: palette.primaryBlue,
  },

  // ── Trending cards ───────────────────────────────────────────────────────────
  trendCard: {
    width: 160,
  },
  trendCardImgWrap: {
    width: 160,
    height: 120,
    borderRadius: radius.sm,
    overflow: 'hidden',
    marginBottom: space.xs,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  trendCardImg: { width: '100%', height: '100%' },
  trendItemsBadgePos: {
    position: 'absolute',
    bottom: space.xs,
    left: space.xs,
  },
  trendLikeBadgePos: {
    position: 'absolute',
    bottom: space.xs,
    right: space.xs,
  },
  trendCardTitle: {
    ...typeScale.body,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,
    marginBottom: 2,
  },
  trendCardTag: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
  },

  // ── Deal of the Day — premium navy/gold ──────────────────────────────────────
  dealSection: {
    paddingHorizontal: space.lg,
    paddingTop: space.xl,
    paddingBottom: space.xl,
    backgroundColor: palette.background,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  dealEyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: space.base,
  },
  dealEyebrowLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.1)',
  },
  dealEyebrow: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(0,0,0,0.38)',
  },
  // Card: white bg, gray border, same 20 radius
  dealCard: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.09)',
    ...shadow.medium,
  },
  // Full-width hero image at top
  dealImgWrap: {
    width: '100%',
    height: 210,
    backgroundColor: '#F0F2F5',
    position: 'relative',
  },
  dealImg: {
    width: '100%',
    height: '100%',
  },
  // Badge overlaid on top of image (Deal of the Day only)
  dealOverlayRow: {
    position: 'absolute',
    top: 14,
    left: 14,
    flexDirection: 'row',
    alignItems: 'center',
  },
  dealBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#67ACE9',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  dealBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  // Info area below image
  dealInfoArea: {
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 20,
    gap: 8,
  },
  dealBrand: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    letterSpacing: 1.4,
    color: palette.primaryBlue,
    textTransform: 'uppercase',
  },
  dealProductName: {
    fontSize: 17,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: palette.textPrimary,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  dealDescription: {
    fontSize: 13,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: palette.textSecondary,
    lineHeight: 19,
    marginTop: 1,
  },
  dealRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 2,
  },
  dealRatingScore: {
    fontSize: 13,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: palette.textPrimary,
    marginLeft: 3,
  },
  dealReviewCount: {
    fontSize: 12,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: palette.textSecondary,
  },
  dealSourceTag: {
    fontSize: 11,
    fontWeight: fontWeight.medium,
    fontFamily: 'Geist_500Medium',
    color: palette.textTertiary,
    marginLeft: 4,
  },
  dealPriceRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
    marginTop: 4,
  },
  dealPrice: {
    fontSize: 28,
    fontWeight: fontWeight.xbold,
    fontFamily: 'Geist_700Bold',
    color: palette.textPrimary,
    letterSpacing: -0.5,
  },
  dealPriceOrig: {
    fontSize: 14,
    fontWeight: fontWeight.regular,
    fontFamily: 'Geist_400Regular',
    color: palette.textSecondary,
    textDecorationLine: 'line-through',
  },
  dealShopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    backgroundColor: palette.primaryBlue,
    paddingVertical: 16,
    borderRadius: radius.button,
    gap: 5,
    marginTop: 8,
  },
  dealShopBtnText: {
    fontSize: 15,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },

  // ── New Arrivals cards ────────────────────────────────────────────────────────
  arrivalCard: {
    width: ARRIVAL_CARD_W,
    borderRadius: radius.md,
    backgroundColor: C.white,
    ...shadow.low,
  },
  arrivalNewBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    zIndex: 10,
    backgroundColor: palette.primaryBlue,
    borderRadius: radius.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    ...shadow.low,
  },
  arrivalNewBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Geist_700Bold',
    color: '#fff',
    letterSpacing: 1.2,
  },
  arrivalImgWrap: {
    width: '100%',
    height: ARRIVAL_CARD_W,
    borderTopLeftRadius: radius.md,
    borderTopRightRadius: radius.md,
    overflow: 'hidden',
  },
  arrivalImg: { width: '100%', height: '100%' },
  arrivalInfoBox: {
    paddingHorizontal: 10,
    paddingTop: 8,
    paddingBottom: 10,
    borderTopWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    gap: 2,
  },
  arrivalInfoCreator: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: palette.primaryBlue,
    letterSpacing: 0.1,
  },
  arrivalInfoTitle: {
    ...typeScale.caption,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: palette.textPrimary,
    lineHeight: 16,
  },

  // legacy — kept for other sections that still reference these
  portraitItemsBadgePos: {
    position: 'absolute',
    bottom: 6,
    right: 6,
  },

  // ── Recently Viewed cards ────────────────────────────────────────────────────
  recentCard: {
    width: 100,
    ...shadow.low,
  },
  recentCardImg: {
    width: 100,
    height: 90,
    borderRadius: radius.md,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  recentCardTitle: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textPrimary,
  },

  // ── Featured Product cards ───────────────────────────────────────────────────
  productCard: {
    width: 155,
  },
  productCardImgWrap: {
    width: 155,
    height: 130,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: C.border,
    backgroundColor: C.surface,
  },
  productCardImg: {
    width: '100%',
    height: '100%',
  },
  productSourceBadgePos: {
    position: 'absolute',
    top: 6,
    right: 6,
  },

  // ── Featured Products card (below-image layout) ───────────────────────────
  featuredProductCard: {
    width: COLL_CARD_W,
    borderRadius: 6,
    backgroundColor: C.white,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.07)',
    overflow: 'hidden',
    ...shadow.low,
  },
  featuredProductImgWrap: {
    width: '100%',
    height: 142,
    overflow: 'hidden',
  },
  featuredProductImg: {
    width: '100%',
    height: '100%',
  },
  featuredSourceBadgePos: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  featuredProductBody: {
    padding: 10,
    gap: 8,
  },
  featuredProductName: {
    ...typeScale.caption,
    fontWeight: fontWeight.semibold,
    fontFamily: 'Geist_600SemiBold',
    color: palette.textPrimary,
    lineHeight: 17,
  },
  featuredProductRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  featuredProductPrice: {
    ...typeScale.price,
    fontFamily: 'Geist_700Bold',
    color: palette.textPrimary,
  },
  featuredShopLink: {
    ...typeScale.caption,
    color: palette.primaryBlue,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
  },

  quickAddBtn: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    lineHeight: 24,
  },
  productCardName: {
    ...typeScale.headline,
    fontFamily: 'Geist_600SemiBold',
    color: C.textPrimary,
    marginBottom: 2,
  },
  productCardPrice: {
    ...typeScale.price,
    fontFamily: 'Geist_700Bold',
    color: C.primary,
  },

  // ── Get Inspired CTA ─────────────────────────────────────────────────────────

  // ── Photo attachment badge ──────────────────────────────────────────────────
  attachBadge: {
    position: 'absolute',
    top: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.3)',
  },

  // ── Loading progress bar ───────────────────────────────────────────────────
  loadingBarTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 1,
    marginTop: 10,
    marginHorizontal: 2,
    overflow: 'hidden',
  },
  loadingBarFill: {
    height: 2,
    backgroundColor: '#67ACE9',
    borderRadius: 1,
  },
});

// ── Result Modal Styles ─────────────────────────────────────────────────────
const resultStyles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.white,
  },
  imageWrap: {
    position: 'relative',
    paddingHorizontal: 16,
  },
  imageActions: {
    position: 'absolute',
    top: 16,
    left: 16,
    flexDirection: 'row',
    gap: 8,
  },
  imageActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  closeBtn: {
    position: 'absolute',
    top: 56,
    right: 20,
    zIndex: 10,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 56,
    paddingBottom: 40,
  },
  resultImage: {
    width: '100%',
    borderRadius: 12,
  },
  promptLabel: {
    fontSize: 11,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: C.textTertiary,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 24,
    marginHorizontal: 20,
  },
  promptText: {
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: C.textPrimary,
    lineHeight: 22,
    marginTop: 6,
    marginHorizontal: 20,
  },
  productsSection: {
    marginTop: 24,
    paddingLeft: 20,
  },
  shopHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingRight: 20,
    marginBottom: 16,
  },
  shopHeaderActions: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
  },
  shopHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shopHeaderBtnPost: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  productsTitle: {
    fontSize: 13,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  productsSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: '#67ACE9',
    marginTop: 4,
  },
  // ── Horizontal product cards ──
  hCard: {
    width: 170,
    backgroundColor: C.white,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
  },
  hCardImg: {
    width: '100%',
    height: 150,
    backgroundColor: C.surface2,
  },
  hCardBody: {
    padding: 10,
    paddingBottom: 36,
    gap: 2,
  },
  hCardName: {
    fontSize: 13,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: C.textPrimary,
    lineHeight: 17,
  },
  hCardBrand: {
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
    marginTop: 1,
  },
  hCardRating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 1,
    marginTop: 3,
  },
  hCardRatingText: {
    fontSize: 10,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: C.textPrimary,
    marginLeft: 2,
  },
  hCardReviews: {
    fontSize: 10,
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
  },
  hCardPrice: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.primary,
    marginTop: 4,
  },
  hCardAdd: {
    position: 'absolute',
    bottom: 10,
    right: 10,
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: C.white,
  },
  hCardAddDone: {
    backgroundColor: C.primary,
    borderColor: C.primary,
  },
  disclosure: {
    fontSize: 11,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
    fontStyle: 'italic',
    textAlign: 'center',
    marginTop: 16,
    marginHorizontal: 20,
  },
  // Post sheet
  sheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  sheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 40,
  },
  sheetHandle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(0,0,0,0.12)',
    alignSelf: 'center',
    marginBottom: 20,
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,
    textAlign: 'center',
  },
  sheetSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 24,
  },
  sheetOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  sheetOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  sheetOptionText: { flex: 1 },
  sheetOptionTitle: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: C.textPrimary,
  },
  sheetOptionDesc: {
    fontSize: 13,
    fontWeight: '400',
    fontFamily: 'Geist_400Regular',
    color: C.textSecondary,
    marginTop: 2,
  },
  sheetCancel: {
    marginTop: 16,
    paddingVertical: 14,
    alignItems: 'center',
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  sheetCancelText: {
    fontSize: 15,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: C.textSecondary,
  },
});
