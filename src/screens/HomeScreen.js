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
import { buildFinalPrompt, generateWithProductRefs, generateWithProductPanel, generateSingleProductInRoom, pickAspectRatio } from '../services/replicate';
import { createProductPanel } from '../utils/createProductPanel';
import { verifyGeneratedProducts } from '../services/visionMatcher';
import { PRODUCT_CATALOG } from '../data/productCatalog';
import { saveUserDesign, updateDesignVisibility, uploadRoomPhoto } from '../services/supabase';
import { useSubscription } from '../context/SubscriptionContext';
import { generateWithBFL } from '../services/bfl';
import TabScreenFade from '../components/TabScreenFade';
import ProductVisualizeModal from '../components/ProductVisualizeModal';
import GenieLoader from '../components/GenieLoader';
import { sendNotificationIfEnabled } from '../services/notifications';
import { useOnboarding, ONBOARDING_STEPS } from '../context/OnboardingContext';
import OnboardingOverlay, { OnboardingGlow } from '../components/OnboardingOverlay';

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
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PREFLIGHT_TIMEOUT_MS);
    // HEAD is ideal but some CDNs don't implement it; fall back to GET with
    // a Range header so we don't download the whole file.
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'Range': 'bytes=0-0' },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const reachable = res.status === 200 || res.status === 206;
    if (!reachable) return false;
    // Verify the CDN is actually serving a flux-compatible format.
    // Strip any "; charset=..." suffix before comparing.
    const ct = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (ct && !FLUX_SUPPORTED_MIMES.has(ct)) {
      console.warn(`[preflight] ${url.substring(0, 80)} served as ${ct} — flux-2-max can't decode this`);
      return false;
    }
    return true;
  } catch {
    return false;
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
const STYLE_IMG_GLAM         = require('../assets/styles/Glam.jpg');
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
  } = useSubscription();
  const { addToCart, items: cartItems } = useCart();
  const { liked } = useLiked();
  const { isStepActive, nextStep, prevStep, finishOnboarding, startOnboarding, active: onboardingActive, loaded: onboardingLoaded } = useOnboarding();
  const onboardingAttempted = useRef(false); // prevent re-trigger on profile refreshes
  const [prompt, setPrompt] = useState('');
  const [inputExpanded, setInputExpanded] = useState(false);
  const [greeting, setGreeting] = useState(getGreeting());
  const [recentlyViewed, setRecentlyViewed] = useState([]);

  // Design Your Space state
  const [photo, setPhoto] = useState(null);
  const [photoSource, setPhotoSource] = useState(null); // 'camera' | 'library'
  const [generating, setGenerating] = useState(false);
  const [genStatus, setGenStatus] = useState('');
  const [loadingMsgIndex, setLoadingMsgIndex] = useState(0);
  const [loadingMessages, setLoadingMessages] = useState([]);
  const loadingMsgOpacity = useRef(new Animated.Value(1)).current;
  const [resultData, setResultData] = useState(null); // { imageUri, resultUri, prompt, products }
  const [showResult, setShowResult] = useState(false);
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
  const mediaPermGranted = useRef(false);

  // Pre-warm media library permission on mount so the picker opens instantly
  useEffect(() => {
    ImagePicker.requestMediaLibraryPermissionsAsync()
      .then(({ status }) => { if (status === 'granted') mediaPermGranted.current = true; })
      .catch(() => {});
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

  useEffect(() => {
    let cancelled = false;

    const scheduleNext = () => {
      heroTimerRef.current = setTimeout(() => {
        if (cancelled) return;
        const currentIdx = heroCurrentIdx.current;
        const nextIdx = (currentIdx + 1) % HERO_IMAGES.length;

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

  // Scroll ref (used by other scroll-dependent logic)
  const scrollY = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    AsyncStorage.getItem('snapspace_recently_viewed').then(raw => {
      if (raw) {
        try { setRecentlyViewed(JSON.parse(raw).slice(0, 6)); } catch (_) {}
      }
    });
  }, []);

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
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // allowsEditing removed — the native crop UI is the 1-2s bottleneck on iOS simulator
      quality: 0.6,
      exif: false,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setPhoto({ uri: asset.uri, base64: null, width: asset.width, height: asset.height });
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

  // Rotating loading messages — cycle every 3s with fade
  useEffect(() => {
    if (!generating || loadingMessages.length === 0) return;
    const interval = setInterval(() => {
      // Fade out
      Animated.timing(loadingMsgOpacity, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        // Advance to next message
        setLoadingMsgIndex(prev => (prev + 1) % loadingMessages.length);
        // Fade in
        Animated.timing(loadingMsgOpacity, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }).start();
      });
    }, 3000);
    return () => clearInterval(interval);
  }, [generating, loadingMessages]);

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
        Linking.openURL(resultData.resultUri).catch(() =>
          Alert.alert('Could Not Save', 'Please screenshot the image to save it to your camera roll.')
        );
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
    const isSingleProductMode = !!singleProduct;

    if (!photo) {
      Alert.alert('Add a Room Photo', 'Tap the camera icon to snap your room, or pick from your library.');
      return;
    }
    // Prompt is only required for the full-room flow — single-product skips it
    if (!isSingleProductMode && !prompt.trim()) {
      Alert.alert('Describe Your Style', 'Add a style description so the AI knows what to create.');
      return;
    }
    const designPrompt = isSingleProductMode ? '' : prompt.trim();
    const savedPhoto = { ...photo };
    Keyboard.dismiss();

    // ── Observability: one ID per generation attempt ───────────────────────
    const generationId = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const log = (...args) => console.log(`[gen:${generationId}]`, ...args);
    const warn = (...args) => console.warn(`[gen:${generationId}]`, ...args);
    const startedAt = Date.now();
    log('start | mode=' + (isSingleProductMode ? 'single-product' : 'full-room') + ' | prompt="' + designPrompt.substring(0, 80) + '"');

    // Initialize rotating loading messages
    const msgs = isSingleProductMode
      ? ['Placing product in your space…', 'Matching lighting and perspective…', 'Almost there…']
      : getLoadingMessages(designPrompt);
    setLoadingMessages(msgs);
    setLoadingMsgIndex(0);
    loadingMsgOpacity.setValue(1);
    setGenerating(true);
    startLoadingBar();
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
        matchedProducts = getProductsForPrompt(designPrompt, 6);
        log('pre-matched', matchedProducts.length, 'products:', matchedProducts.map(p => p.category).join(','));
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

      const aspectRatio = pickAspectRatio(photoW, photoH);
      log('photo', photoW + 'x' + photoH, '→ aspect_ratio =', aspectRatio);

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
        try {
          roomPhotoUrl = await uploadRoomPhoto(user.id, savedPhoto.uri, savedPhoto.base64);
        } catch (uploadErr) {
          stopLoadingBar(false);
          setGenerating(false);
          Alert.alert(
            'Upload Failed',
            'Could not upload your room photo. Please check your connection and try again.'
          );
          return;
        }

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

            // ── Cost tracking (same as full-room) ─────────────────────────
            if (generationSource === 'token') {
              await deductToken();
              refreshTokenBalance();
            } else {
              await recordGeneration();
              refreshQuota();
            }

          } catch (genErr) {
            stopLoadingBar(false);
            setGenerating(false);
            setSingleProduct(null);
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

          // Auto-save to user_designs so the Like button can reference a real designId
          let savedDesignId = null;
          if (user?.id) {
            try {
              const saved = await saveUserDesign(user.id, {
                imageUrl: resultUrl,
                prompt: `Product visualize: ${singleProduct.name || 'product'}`,
                styleTags: singleProduct.styles || [],
                products: [{ id: singleProduct.id, name: singleProduct.name, brand: singleProduct.brand, price: singleProduct.price, imageUrl: singleProduct.imageUrl, affiliateUrl: singleProduct.affiliateUrl, source: singleProduct.source }],
                visibility: 'private',
              });
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
          try {
            log('replicate flux-2-max | visual product refs');

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
                  // Panel URL pre-flight: Supabase Storage is usually instant
                  // but CDN propagation can briefly lag. Verify before sending
                  // to flux-2-max so a 404 on the panel doesn't trigger E006.
                  const panelOk = await preflightUrl(panelResponse.url);
                  if (!panelOk) {
                    warn('panel URL not yet reachable — skipping panel path');
                  } else {
                    log('panel ready — using 2-image input (room + 2×2 panel)');
                    setGenStatus('Analyzing your room…');
                    const panelResult = await generateWithProductPanel(
                      roomPhotoUrl,
                      designPrompt,
                      reachableProducts,
                      panelResponse.url,
                      aspectRatio,
                    );
                    resultUrl = panelResult.url;
                    genMeta.predictionId = panelResult.predictionId;
                    genMeta.seed = panelResult.seed;
                    genMeta.pipeline = 'panel';
                    panelCompositedIndices = panelResponse.compositedIndices;
                    usedPanel = true;
                    log('panel gen complete | prediction=' + panelResult.predictionId + ' seed=' + panelResult.seed + ' | composited=[' + (panelCompositedIndices?.join(',') ?? '?') + ']');
                  }
                }
              } catch (panelErr) {
                warn('panel approach failed (' + panelErr.message + ') — falling back to individual refs');
              }
            } else {
              warn('panel skipped — only ' + reachableProducts.length + ' reachable products (need 2+)');
            }

            // ── Fallback: individual product images (original 4-image approach) ──
            let individualUsedProducts = null;
            if (!usedPanel && reachableProducts.length >= 1) {
              log('using individual product refs (room + ' + Math.min(reachableProducts.length, 4) + ' product images)');
              setGenStatus('Analyzing your room…');
              resultUrl = await generateWithProductRefs(roomPhotoUrl, designPrompt, reachableProducts, aspectRatio);
              genMeta.pipeline = 'individual';
              // Individual path: replicate.js slices to exactly the first 4
              // reachable products and uses each as a distinct image input.
              // No panel compositing → no index drift → the 4 sent ARE the 4
              // used, so just mirror the slice here for Shop Your Room.
              individualUsedProducts = reachableProducts.slice(0, 4);
            } else if (!usedPanel) {
              // No reachable product images — force the replicate path to fail
              // so we drop to BFL (which doesn't need product URLs).
              throw new Error('no reachable product images for replicate path');
            }

            // ── Reconcile finalProducts with what was ACTUALLY rendered ────────
            // Previously this was unconditionally `matchedProducts` — which
            // could include products whose images failed the composite pool,
            // producing the 3-of-4 mismatch ("Shop Your Room shows a product
            // that isn't in the generated image"). Now we map back to the
            // exact subset that went to flux-2-max.
            if (usedPanel && Array.isArray(panelCompositedIndices) && panelCompositedIndices.length > 0) {
              finalProducts = panelCompositedIndices
                .map(i => reachableProducts[i])
                .filter(Boolean);
            } else if (individualUsedProducts) {
              finalProducts = individualUsedProducts;
            } else {
              // Shouldn't hit here (would've thrown above), but defensive fallback
              finalProducts = reachableProducts.slice(0, 4);
            }
            replicateSucceeded = true;
            log('replicate complete | url=' + resultUrl.substring(0, 80) + ' | finalProducts=' + finalProducts.length);
          } catch (repErr) {
            warn('replicate failed (' + repErr.message + ') — falling back to BFL');
          }

          // ── Fallback: BFL kontext (room photo, product names in prompt) ──
          // No visual product references — products matched by text only.
          // Cost: ~$0.04/generation. Uses reachableProducts (not matched)
          // and slices to 4 so Shop Your Room never shows a product whose
          // image would 404 on tap. BFL doesn't guarantee visual accuracy
          // (text-only refs), but at least the 4 products shown all load.
          if (!replicateSucceeded) {
            const bflProducts = (reachableProducts.length > 0
              ? reachableProducts
              : matchedProducts
            ).slice(0, 4);
            log('BFL kontext fallback | cost=~$0.04 | aspect=' + aspectRatio + ' | products=' + bflProducts.length);
            resultUrl = await generateWithBFL(
              designPrompt,
              bflProducts,
              (msg) => setGenStatus(msg),
              roomPhotoUrl,
              aspectRatio,
            );
            finalProducts = bflProducts;
            genMeta.pipeline = 'bfl';
            log('BFL complete');
          }

          // Record generation based on payment source
          if (generationSource === 'token') {
            await deductToken();
            refreshTokenBalance();
          } else {
            await recordGeneration();
            refreshQuota();
          }

        } catch (genErr) {
          stopLoadingBar(false);
          setGenerating(false);
          Alert.alert(
            'Generation Failed',
            'We couldn\'t generate your wish right now. Please try again in a moment.'
          );
          console.error('[Gen] Generation error:', genErr.message);
          return;
        }
      } else {
        // Not signed in — require sign-in, no generation without auth
        stopLoadingBar(false);
        setGenerating(false);
        Alert.alert(
          'Sign In Required',
          'Please sign in to generate AI designs.',
          [{ text: 'OK' }]
        );
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
      let finalMatchedProducts = finalProducts;
      let verifyMeta = { verifiedCount: 0, roomType: null, visionItems: [] };
      try {
        setGenStatus('Verifying your products…');
        const verifyResult = await verifyGeneratedProducts(resultUrl, finalProducts);
        if (verifyResult?.products?.length > 0) {
          finalMatchedProducts = verifyResult.products;
          verifyMeta.verifiedCount = finalMatchedProducts.filter(p => p.confidence === 'verified').length;
          verifyMeta.roomType = verifyResult.roomType || null;
          verifyMeta.visionItems = verifyResult.visionItems || [];
          log('verify: ' + verifyMeta.verifiedCount + '/' + finalMatchedProducts.length + ' verified');
        }
      } catch (visionErr) {
        warn('verify failed, showing pre-matched set unverified: ' + visionErr.message);
        finalMatchedProducts = finalProducts.map(p => ({ ...p, confidence: 'unverified' }));
      }

      const durationMs = Date.now() - startedAt;
      log('done | ' + durationMs + 'ms | pipeline=' + genMeta.pipeline + ' | verified=' + verifyMeta.verifiedCount + '/' + finalMatchedProducts.length);

      setGenerating(false);
      setGenStatus('');
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

      // Navigate to the full RoomResult screen instead of showing inline modal
      navigation.navigate('RoomResult', {
        prompt: designPrompt,
        resultUri: resultUrl,
        products: finalMatchedProducts,
        // Dev-only debug metadata — RoomResultScreen renders an overlay when __DEV__
        debug: {
          ...genMeta,
          ...verifyMeta,
          durationMs,
          photoWidth: savedPhoto.width,
          photoHeight: savedPhoto.height,
        },
      });
      setPhoto(null);
      setPhotoSource(null);
      setPrompt('');
      // Collapse the input bar back to single-line pill shape. Without this
      // explicit reset, onContentSizeChange sometimes doesn't fire when the
      // prompt is cleared programmatically, so the bar stays stuck in its
      // expanded multi-line rounded-square state.
      setInputExpanded(false);

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
      Alert.alert('Generation Failed', err.message || 'Something went wrong. Please try again.');
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
      {/* Hero background — crossfading slideshow */}
      <View style={styles.bgImage}>
        {HERO_IMAGES.map((src, i) => (
          <Animated.View key={i} style={[StyleSheet.absoluteFill, { opacity: heroOpacities[i], justifyContent: 'center' }]}>
            <Image
              source={src}
              style={{ width: '100%', height: '100%' }}
              resizeMode="cover"
            />
          </Animated.View>
        ))}
      </View>
      <View style={styles.heroTint} pointerEvents="none" />

      <ScrollView
        style={StyleSheet.absoluteFill}
        contentContainerStyle={styles.scrollContent}
        onScroll={(e) => scrollY.setValue(e.nativeEvent.contentOffset.y)}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        bounces={false}
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
              <Text style={styles.logo}>HomeGenie</Text>
              {!generating && (
                <View style={styles.logoIcon}>
                  <HeaderLogoIcon size={44} />
                </View>
              )}
            </View>
            <Text style={styles.wishTagline}>Your dream room, one wish away</Text>
          </View>

          {/* Blur overlay when generating */}
          {generating && (
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          )}

          {/* Generation status — GenieLoader animation */}
          {generating && (
            <View style={styles.heroCentered}>
              <GenieLoader size={100} animating={generating} />
              <Animated.Text style={[styles.genStatusText, { opacity: loadingMsgOpacity }]}>
                {loadingMessages[loadingMsgIndex] || genStatus || 'Designing your space…'}
              </Animated.Text>
            </View>
          )}

          {/* Input bar — centered in hero, drops below loader during generation */}
          <View style={[styles.heroBottom, generating && styles.heroBottomGenerating]}>
            {/* Suggested prompt chips */}
            {!generating && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.promptChipsScroll}
                contentContainerStyle={styles.promptChipsContent}
              >
                {[
                  'Minimalist living room, white linen sofa, oak coffee table, arc floor lamp, jute rug',
                  'Dark luxe bedroom, velvet platform bed, brass nightstands, charcoal walls, statement pendant',
                  'Japandi dining room, walnut table, rattan chairs, ceramic vase, warm pendant lighting',
                  'Scandinavian home office, white oak desk, bouclé chair, open shelving, linen curtain',
                  'Mid-century living room, walnut credenza, camel leather sofa, sunburst mirror, tripod lamp',
                  'Coastal bedroom, white linen bedding, rattan headboard, driftwood nightstand, sea-grass rug',
                  'Industrial kitchen, matte black fixtures, marble countertops, open metal shelving, Edison pendants',
                  'Biophilic living room, terracotta sofa, live-edge coffee table, hanging plants, jute rug',
                  'Glam dining room, jewel velvet chairs, gold chandelier, marble table, mirrored sideboard',
                  'Bohemian bedroom, rust walls, layered textile bedding, macramé wall art, rattan pendant',
                ].map((chip) => (
                  <TouchableOpacity
                    key={chip}
                    style={styles.promptChip}
                    onPress={() => setPrompt(chip)}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.promptChipText}>{chip}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
            {/* Photo preview removed — the camera/gallery icons on the input
                bar already show a blue checkmark badge when a photo is
                attached. A full-size thumbnail above the input bar is
                redundant and pushes the hero content down. */}

            <OnboardingGlow visible={isStepActive('chat_bar') && !generating} borderRadius={inputExpanded ? 20 : 40} style={(isStepActive('chat_bar') && !generating) ? { padding: 4 } : undefined}>
            <Animated.View style={[styles.inputBar, { borderRadius: inputExpanded ? 16 : 36, transform: [{ scale: inputScale }] }]}>
              {/* Camera icon — badge only when photo came from camera */}
              <View>
                <TouchableOpacity
                  style={styles.inputIconBtn}
                  onPress={() => navigation?.navigate('Wish')}
                  activeOpacity={1}
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
              {/* Gallery icon — badge only when photo came from library */}
              <View>
                <TouchableOpacity
                  style={styles.inputIconBtn}
                  onPress={photo ? () => { setPhoto(null); setPhotoSource(null); } : handlePickFromLibrary}
                  activeOpacity={1}
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
              <TextInput
                style={styles.inputText}
                placeholder={photo ? "Photo attached — what's your wish..." : "What's your wish..."}
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={prompt}
                onChangeText={setPrompt}
                multiline
                textAlignVertical="center"
                blurOnSubmit
                returnKeyType="send"
                editable={!generating}
                maxLength={200}
                onSubmitEditing={runGeneration}
                onContentSizeChange={(e) => setInputExpanded(e.nativeEvent.contentSize.height > 28)}
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
            </Animated.View>
            </OnboardingGlow>
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
                style={{ position: 'relative', marginTop: 24 }}
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
              activeOpacity={0.95}
              onPress={() => navigation?.navigate('ProductDetail', { product: dealProduct })}
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
            onAction={() => navigation?.navigate('Explore', {
              mode: 'products',
              title: 'Featured',
              featuredProductIds: FEATURED_PRODUCTS.map(p => p.id),
            })}
          />
          <View style={styles.collectionsGrid}>
            {FEATURED_PRODUCTS.slice(0, 4).map((product, i) => (
              <TouchableOpacity
                key={product.id || i}
                style={styles.featuredProductCard}
                activeOpacity={0.88}
                onPress={() => navigation?.navigate('ProductDetail', { product })}
              >
                {/* ── Image area ── */}
                <View style={styles.featuredProductImgWrap}>
                  <CardImage uri={product.imageUrl} style={styles.featuredProductImg} placeholderColor="#E8EDF5" />
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
                <FlatList
                  data={resultData.products}
                  keyExtractor={(item, idx) => item.id || String(idx)}
                  horizontal
                  showsHorizontalScrollIndicator={false}
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
    backgroundColor: '#000000',
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
  affiliateDisclosure: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
    paddingHorizontal: space.lg,
    marginBottom: space.sm,
    marginTop: -2,
  },
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
