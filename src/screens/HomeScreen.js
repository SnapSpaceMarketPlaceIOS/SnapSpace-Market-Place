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
import Svg, { Path, Circle, Line, Polyline, Rect, Ellipse, G } from 'react-native-svg';
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
import { searchProducts, getSourceColor, getProductsForPrompt } from '../services/affiliateProducts';
import { buildFinalPrompt, generateWithProductRefs, generateWithProductPanel, pickAspectRatio } from '../services/replicate';
import { createProductPanel } from '../utils/createProductPanel';
import { verifyGeneratedProducts } from '../services/visionMatcher';
import { PRODUCT_CATALOG } from '../data/productCatalog';
import { saveUserDesign, updateDesignVisibility, uploadRoomPhoto } from '../services/supabase';
import { useSubscription } from '../context/SubscriptionContext';
import { generateWithBFL } from '../services/bfl';
import TabScreenFade from '../components/TabScreenFade';
import { sendNotificationIfEnabled } from '../services/notifications';

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

// ── Hero slideshow images — 786px wide, best-fit for portrait phone screen ────
const HERO_IMAGES = [
  require('../../assets/hero-slideshow-1.jpg'),   // minimalist white living room
  require('../../assets/hero-slideshow-9.jpg'),   // warm modern interior
  require('../../assets/hero-slideshow-6.jpg'),   // cozy gallery wall living room
  require('../../assets/hero-slideshow-3.jpg'),   // B&W living room with lanterns
  require('../../assets/hero-slideshow-5.jpg'),   // blush pink bedroom
  require('../../assets/hero-slideshow-2.jpg'),   // elegant warm living space
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
const FEATURED_PRODUCTS  = searchProducts({ keywords: 'modern living room bedroom', limit: 8 });

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
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={22} y1={2} x2={11} y2={13} />
      <Polyline points="22 2 15 22 11 13 2 9 22 2" />
    </Svg>
  );
}

function CameraSmallIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.9)" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx={12} cy={13} r={4} />
    </Svg>
  );
}

function GalleryIcon({ size = 18, color = 'rgba(255,255,255,0.9)' }) {
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
  const [prompt, setPrompt] = useState('');
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

  // ── Generation quota (managed by SubscriptionContext) ────────────────────

  // Loading bar animation
  const loadingProgress = useRef(new Animated.Value(0)).current;
  const loadingAnim = useRef(null);

  // Camera lens loader animation
  const lensRotate  = useRef(new Animated.Value(0)).current;  // outer barrel rotation
  const lensScale   = useRef(new Animated.Value(1)).current;  // aperture breathe
  const lensDot     = useRef(new Animated.Value(0.5)).current; // center dot pulse
  const lensAnim    = useRef(null);

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

  // Receive photo captured from Snap tab
  useEffect(() => {
    if (route?.params?.capturedPhoto) {
      const captured = route.params.capturedPhoto;
      setPhoto(captured);
      setPhotoSource('camera');
      navigation.setParams({ capturedPhoto: undefined });
    }
  }, [route?.params?.capturedPhoto]);

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
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      // allowsEditing removed — the native crop UI is the 1-2s bottleneck on iOS simulator
      quality: 0.6,
      exif: false,
    });
    if (result.canceled || !result.assets?.length) return;
    const asset = result.assets[0];
    setPhoto({ uri: asset.uri, base64: null, width: asset.width, height: asset.height });
    setPhotoSource('library');
  }, [generating]);

  // Timed loading bar — 3-phase crawl matching real Replicate generation time
  const startLoadingBar = useCallback(() => {
    loadingProgress.setValue(0);
    // Linear 0→95% over 75 seconds at constant speed.
    // Snaps to 100% when generation completes.
    loadingAnim.current = Animated.timing(loadingProgress, {
      toValue: 0.95,
      duration: 75000,
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

  // Camera lens loader — start/stop with generating
  useEffect(() => {
    if (generating) {
      lensRotate.setValue(0);
      lensScale.setValue(1);
      lensDot.setValue(0.5);
      lensAnim.current = Animated.loop(
        Animated.parallel([
          // Outer barrel: full rotation every 4s
          Animated.timing(lensRotate, {
            toValue: 1,
            duration: 4000,
            easing: Easing.linear,
            useNativeDriver: true,
          }),
          // Aperture blades: breathe open → close
          Animated.sequence([
            Animated.timing(lensScale, {
              toValue: 1.1,
              duration: 1400,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(lensScale, {
              toValue: 0.88,
              duration: 1400,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
          // Center dot: glow pulse
          Animated.sequence([
            Animated.timing(lensDot, {
              toValue: 1,
              duration: 900,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
            Animated.timing(lensDot, {
              toValue: 0.25,
              duration: 900,
              easing: Easing.inOut(Easing.ease),
              useNativeDriver: true,
            }),
          ]),
        ])
      );
      lensAnim.current.start();
    } else {
      if (lensAnim.current) {
        lensAnim.current.stop();
        lensAnim.current = null;
      }
    }
  }, [generating]);

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
    if (!photo) {
      Alert.alert('Add a Room Photo', 'Tap the camera icon to snap your room, or pick from your library.');
      return;
    }
    if (!prompt.trim()) {
      Alert.alert('Describe Your Style', 'Add a style description so the AI knows what to create.');
      return;
    }
    const designPrompt = prompt.trim();
    const savedPhoto = { ...photo };
    Keyboard.dismiss();

    // ── Observability: one ID per generation attempt ───────────────────────
    // Threaded through every log line below so a single Metro/Xcode log search
    // surfaces the whole funnel: pre-match → panel → flux → verify → save.
    // Short format (time + 4 random chars) — long UUIDs clutter logs.
    const generationId = `g-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
    const log = (...args) => console.log(`[gen:${generationId}]`, ...args);
    const warn = (...args) => console.warn(`[gen:${generationId}]`, ...args);
    const startedAt = Date.now();
    log('start | prompt="' + designPrompt.substring(0, 80) + '"');

    // Initialize rotating loading messages tailored to the prompt
    const msgs = getLoadingMessages(designPrompt);
    setLoadingMessages(msgs);
    setLoadingMsgIndex(0);
    loadingMsgOpacity.setValue(1);
    setGenerating(true);
    startLoadingBar();
    try {
      setGenStatus('');

      // ── Pre-match products from local catalog (before any generation call) ──
      setGenStatus('Finding products for your space…');
      const matchedProducts = getProductsForPrompt(designPrompt, 4);
      log('pre-matched', matchedProducts.length, 'products:', matchedProducts.map(p => p.category).join(','));

      // ── URL pre-flight: drop any matched product whose image 404s ────────
      // Amazon image URLs occasionally rotate / expire. If a stale URL makes
      // it into input_images, flux-2-max fails the whole prediction with
      // "404 Client Error: Not Found for url: ...", which silently drops us
      // onto BFL. Catch that here so only reachable products reach Replicate.
      // The pre-match set is still shown in the UI regardless — pre-flight
      // only affects which URLs get sent to the generation model.
      const reachableProducts = await filterReachableProducts(matchedProducts);
      const dropped = matchedProducts.length - reachableProducts.length;
      if (dropped > 0) {
        warn('preflight: dropped ' + dropped + '/' + matchedProducts.length + ' products with unreachable images');
      } else {
        log('preflight: all ' + matchedProducts.length + ' product URLs reachable');
      }

      // ── Derive aspect ratio from the room photo orientation ──────────────
      // flux-2-max's 'match_input_image' is ambiguous with multi-image input,
      // so we snap the room photo's native aspect to the closest supported
      // bucket and pass it explicitly. Large rooms get landscape, narrow
      // rooms get portrait — the generated render matches the source framing.
      const aspectRatio = pickAspectRatio(savedPhoto.width, savedPhoto.height);
      log('photo', savedPhoto.width + 'x' + savedPhoto.height, '→ aspect_ratio =', aspectRatio);

      // ── Quota waterfall: free → tokens → subscription → paywall ─────────
      let generationSource = null;

      if (subscription.canGenerate) {
        generationSource = subscription.tier === 'free' ? 'free' : 'subscription';
      } else if (tokenBalance > 0) {
        generationSource = 'token';
      } else {
        stopLoadingBar(false);
        setGenerating(false);
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

        // ── Step 2: BFL Generation with Product Image References ──────────
        //
        // BFL flux-kontext-pro now sends catalog product images via
        // experimental input_image_2/3/4 parameters so the AI can VISUALLY
        // SEE what each product looks like before rendering.
        //
        // Products passed in = products shown in "Shop Your Room".
        // If BFL silently ignores the params, products are still
        // text-matched (same as before — no regression).
        //
        // Cost: ~$0.04/generation (same as before)
        //

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
            // Creates a 512×512 2×2 product grid via edge function, then sends
            // [room, panel] to flux-2-max instead of [room, p1, p2, p3].
            // Target cost: ~$0.13/gen vs $0.31 with individual images.
            //
            // Uses reachableProducts (pre-flighted) so a single stale Amazon
            // URL can't take down the whole generation.
            let usedPanel = false;
            if (reachableProducts.length >= 2) {
              try {
                setGenStatus('Preparing product panel…');
                const panelUrl = await createProductPanel(reachableProducts, user.id);
                if (panelUrl) {
                  // Panel URL pre-flight: Supabase Storage is usually instant
                  // but CDN propagation can briefly lag. Verify before sending
                  // to flux-2-max so a 404 on the panel doesn't trigger E006.
                  const panelOk = await preflightUrl(panelUrl);
                  if (!panelOk) {
                    warn('panel URL not yet reachable — skipping panel path');
                  } else {
                    log('panel ready — using 2-image input (room + 2×2 panel)');
                    setGenStatus('Analyzing your room…');
                    const panelResult = await generateWithProductPanel(
                      roomPhotoUrl,
                      designPrompt,
                      reachableProducts,
                      panelUrl,
                      aspectRatio,
                    );
                    resultUrl = panelResult.url;
                    genMeta.predictionId = panelResult.predictionId;
                    genMeta.seed = panelResult.seed;
                    genMeta.pipeline = 'panel';
                    usedPanel = true;
                    log('panel gen complete | prediction=' + panelResult.predictionId + ' seed=' + panelResult.seed);
                  }
                }
              } catch (panelErr) {
                warn('panel approach failed (' + panelErr.message + ') — falling back to individual refs');
              }
            } else {
              warn('panel skipped — only ' + reachableProducts.length + ' reachable products (need 2+)');
            }

            // ── Fallback: individual product images (original 4-image approach) ──
            if (!usedPanel && reachableProducts.length >= 1) {
              log('using individual product refs (room + ' + Math.min(reachableProducts.length, 4) + ' product images)');
              setGenStatus('Analyzing your room…');
              resultUrl = await generateWithProductRefs(roomPhotoUrl, designPrompt, reachableProducts, aspectRatio);
              genMeta.pipeline = 'individual';
            } else if (!usedPanel) {
              // No reachable product images — force the replicate path to fail
              // so we drop to BFL (which doesn't need product URLs).
              throw new Error('no reachable product images for replicate path');
            }

            finalProducts = matchedProducts;
            replicateSucceeded = true;
            log('replicate complete | url=' + resultUrl.substring(0, 80));
          } catch (repErr) {
            warn('replicate failed (' + repErr.message + ') — falling back to BFL');
          }

          // ── Fallback: BFL kontext (room photo, product names in prompt) ──
          // No visual product references — products matched by text only.
          // Cost: ~$0.04/generation
          if (!replicateSucceeded) {
            log('BFL kontext fallback | cost=~$0.04 | aspect=' + aspectRatio);
            resultUrl = await generateWithBFL(
              designPrompt,
              matchedProducts,
              (msg) => setGenStatus(msg),
              roomPhotoUrl,
              aspectRatio,
            );
            finalProducts = matchedProducts;
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
            `Could not generate your wish. Please try again.\n\nDetails: ${genErr.message}`
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

      // ── Auto-save: persist every generation to Supabase immediately ──
      if (user?.id) {
        const styleTags = finalMatchedProducts.flatMap(p => p.styles || p.styleTags || []).filter(Boolean);
        const uniqueTags = [...new Set(styleTags)];
        const productSummary = finalMatchedProducts.map(p => ({
          id: p.id, name: p.name, brand: p.brand,
          price: p.priceValue ?? p.price, imageUrl: p.imageUrl,
          rating: p.rating, reviewCount: p.reviewCount,
          affiliateUrl: p.affiliateUrl, source: p.source,
          // Persist vision-verification state so saved designs retain the
          // "Similar style" badge when re-opened from Profile → My Designs.
          confidence: p.confidence || 'unverified',
        }));
        saveUserDesign(user.id, {
          imageUrl: resultUrl,
          prompt: designPrompt,
          styleTags: uniqueTags,
          products: productSummary,
          visibility: 'private',
        })
          .then(result => {
            if (result?.designId) setAutoSavedDesignId(result.designId);
            // Swap resultUri to the permanent Supabase Storage URL so the Replicate
            // CDN URL (which expires in ~24h) is never held in state after this point.
            if (result?.permanentUrl) {
              setResultData(prev => prev ? { ...prev, resultUri: result.permanentUrl } : prev);
            }
            console.log('[AutoSave] Design persisted:', result?.designId);
          })
          .catch(err => console.warn('[AutoSave] Failed:', err.message));
      }
    } catch (err) {
      stopLoadingBar(false);
      setGenerating(false);
      setGenStatus('');
      Alert.alert('Generation Failed', err.message || 'Something went wrong. Please try again.');
    }
  };

  // First-visit auth redirect
  useEffect(() => {
    if (user) return;
    (async () => {
      const visited = await AsyncStorage.getItem(FIRST_VISIT_KEY);
      if (!visited) {
        await AsyncStorage.setItem(FIRST_VISIT_KEY, 'true');
        navigation.navigate('Auth');
      }
    })();
  }, [user]);

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
          {/* Top bar: logo + icons */}
          <View style={styles.topBar}>
            <View style={styles.logoRow}>
              <Text style={styles.logo}>HomeGenie</Text>
              <View style={styles.logoDot} />
            </View>
            <View style={styles.topIcons}>
              <TouchableOpacity
                style={styles.iconBtn}
                activeOpacity={0.75}
                onPress={() => navigation?.navigate('Notifications')}
              >
                <BellIcon />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconBtn}
                onPress={() => navigation?.navigate('Profile')}
                activeOpacity={0.75}
              >
                <UserIcon />
              </TouchableOpacity>
            </View>
          </View>

          {/* Blur overlay when generating */}
          {generating && (
            <BlurView intensity={40} tint="dark" style={StyleSheet.absoluteFill} />
          )}

          {/* Centered headline + subtitle — hidden during generation */}
          {!generating && (
            <View style={styles.heroCentered}>
              <Text style={styles.headline}>Wish Your Space</Text>
              <Text style={styles.heroSubtitle}>
                Describe your style, then add your room photo
              </Text>
            </View>
          )}

          {/* Generation status — camera lens loader */}
          {generating && (
            <View style={styles.heroCentered}>
              <View style={{ width: 100, height: 100, alignItems: 'center', justifyContent: 'center' }}>

                {/* Layer 1: outer barrel — dashed ring, slow CW rotation */}
                <Animated.View style={{
                  position: 'absolute',
                  transform: [{ rotate: lensRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }],
                }}>
                  <Svg width={100} height={100} viewBox="0 0 100 100">
                    <Circle cx={50} cy={50} r={46} stroke="#67ACE9" strokeWidth={1.5}
                      fill="none" strokeDasharray="5 7" strokeLinecap="round" />
                  </Svg>
                </Animated.View>

                {/* Layer 2: middle ring — solid, slow CCW rotation */}
                <Animated.View style={{
                  position: 'absolute',
                  transform: [{ rotate: lensRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-200deg'] }) }],
                }}>
                  <Svg width={100} height={100} viewBox="0 0 100 100">
                    <Circle cx={50} cy={50} r={34} stroke="#0B6DC3" strokeWidth={1}
                      fill="none" opacity={0.65} strokeDasharray="10 5" strokeLinecap="round" />
                  </Svg>
                </Animated.View>

                {/* Layer 3: inner ring — static */}
                <Svg width={100} height={100} viewBox="0 0 100 100" style={{ position: 'absolute' }}>
                  <Circle cx={50} cy={50} r={22} stroke="#67ACE9" strokeWidth={0.8} fill="none" opacity={0.4} />
                </Svg>

                {/* Layer 4: aperture blades — 6 ellipses breathe with lensScale */}
                <Animated.View style={{ position: 'absolute', transform: [{ scale: lensScale }] }}>
                  <Svg width={100} height={100} viewBox="0 0 100 100">
                    {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((angle, i) => (
                      <G key={i} rotation={angle} origin="50, 50">
                        <Circle cx={50} cy={33} r={2.5} fill="#fff" opacity={0.88} />
                      </G>
                    ))}
                    {/* Inner glass fill */}
                    <Circle cx={50} cy={50} r={12} fill="rgba(11,109,195,0.2)" />
                  </Svg>
                </Animated.View>

                {/* Layer 5: center dot — glows with lensDot */}
                <Animated.View style={{ position: 'absolute', opacity: lensDot }}>
                  <Svg width={100} height={100} viewBox="0 0 100 100">
                    <Circle cx={50} cy={50} r={9} fill="rgba(255,255,255,0.12)" />
                    <Circle cx={50} cy={50} r={4} fill="#fff" />
                  </Svg>
                </Animated.View>

              </View>
              <Animated.Text style={[styles.genStatusText, { opacity: loadingMsgOpacity }]}>
                {loadingMessages[loadingMsgIndex] || genStatus || 'Designing your space…'}
              </Animated.Text>
            </View>
          )}

          {/* Input bar — pinned to bottom of hero */}
          <View style={styles.heroBottom}>
            {/* Suggested prompt chips */}
            {!generating && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={styles.promptChipsScroll}
                contentContainerStyle={styles.promptChipsContent}
              >
                {[
                  'All-white minimalist living room, linen sofa, oak coffee table, floor lamp',
                  'Dark luxe bedroom, charcoal walls, velvet platform bed, brass nightstands',
                  'Japandi dining room, walnut table, rattan chairs, warm pendant lighting',
                  'Scandinavian reading nook, cream boucle chair, wood shelving, arc lamp',
                  'Mid-century home office, walnut desk, leather chair, warm ambient lighting',
                  'Coastal bedroom, white linen bedding, rattan headboard, sea-grass rug',
                  'Industrial kitchen, matte black fixtures, marble countertops, open shelving',
                  'Biophilic living room, terracotta tones, clay sofa, hanging plants, jute rug',
                  'Glam dining room, jewel-toned velvet chairs, gold chandelier, mirrored sideboard',
                  'Boho bedroom, rust walls, layered textile bedding, macramé wall art',
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
            <Animated.View style={[styles.inputBar, { transform: [{ scale: inputScale }] }]}>
              {/* Camera icon — badge only when photo came from camera */}
              <View>
                <TouchableOpacity
                  style={styles.inputIconBtn}
                  onPress={() => navigation?.navigate('Snap')}
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
                placeholder={photo ? "Photo attached — describe your style..." : "Describe your style..."}
                placeholderTextColor="rgba(255,255,255,0.45)"
                value={prompt}
                onChangeText={setPrompt}
                returnKeyType="send"
                editable={!generating}
                maxLength={200}
                onSubmitEditing={runGeneration}
                onFocus={() => springOut(inputScale)}
                onBlur={() => Animated.spring(inputScale, { toValue: 1, useNativeDriver: true, tension: 200, friction: 7 }).start()}
              />
              <TouchableOpacity
                style={[styles.inputSendBtn, (!prompt.trim() && !photo) && styles.inputSendBtnOff]}
                activeOpacity={1}
                onPress={runGeneration}
                disabled={generating}
                onPressIn={() => !generating && springIn(sendScale)}
                onPressOut={() => !generating && springOut(sendScale)}
              >
                <Animated.View style={{ transform: [{ scale: sendScale }] }}>
                  {generating ? (
                    <Animated.View style={{ transform: [{ rotate: lensRotate.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }}>
                      <Svg width={20} height={20} viewBox="0 0 24 24">
                        <Circle cx={12} cy={12} r={10} stroke="#fff" strokeWidth={1.2} fill="none" strokeDasharray="6 4" strokeLinecap="round" />
                        <Circle cx={12} cy={12} r={5}  stroke="rgba(255,255,255,0.55)" strokeWidth={1} fill="none" />
                        <Circle cx={12} cy={12} r={2}  fill="#fff" />
                      </Svg>
                    </Animated.View>
                  ) : <SendIcon />}
                </Animated.View>
              </TouchableOpacity>
            </Animated.View>
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
                    {typeof dealProduct.price === 'number'
                      ? `$${dealProduct.price.toLocaleString()}`
                      : dealProduct.price}
                  </Text>
                  {dealProduct.priceDisplay && dealProduct.priceDisplay !== dealProduct.price && (
                    <Text style={styles.dealPriceOrig}>{dealProduct.priceDisplay}</Text>
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
    top: 60,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    zIndex: 10,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center' },
  logo: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: '#FFFFFF',
    letterSpacing: letterSpacing.tight,
  },
  logoDot: {
    width: space.sm,
    height: space.sm,
    borderRadius: space.xs,
    backgroundColor: C.primary,
    marginLeft: space.xs,
    marginTop: 2,
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

  // Input bar — pinned to hero bottom via absolute positioning
  heroBottom: {
    position: 'absolute',
    bottom: 56,
    left: 16,
    right: 16,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 9999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.30)',
    paddingLeft: 8,
    paddingRight: 6,
    paddingVertical: 4,
    height: 44,
    maxHeight: 44,
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
    paddingVertical: 0,
    paddingHorizontal: 6,
  },
  inputSendBtn: {
    width: 34, height: 34, borderRadius: 17,
    backgroundColor: C.primary,
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
    marginTop: 20,
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
