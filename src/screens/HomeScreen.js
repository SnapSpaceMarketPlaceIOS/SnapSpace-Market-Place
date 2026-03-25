import React, { useState, useEffect, useRef, useMemo } from 'react';
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
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Svg, { Path, Circle, Line, Polyline, Rect, Ellipse, G } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { fontSize, fontWeight, letterSpacing, palette, space, radius, shadow, typeScale, roomChipColors } from '../constants/tokens';
import { colors as C } from '../constants/theme';
import SectionHeader from '../components/ds/SectionHeader';
import Badge, { HeartCountPill } from '../components/ds/Badge';
import CardImage from '../components/CardImage';
import { useAuth } from '../context/AuthContext';
import { useLiked } from '../context/LikedContext';
import { DESIGNS } from '../data/designs';
import { SELLERS } from '../data/sellers';
import { searchProducts, getSourceColor } from '../services/affiliateProducts';
import { PRODUCT_CATALOG } from '../data/productCatalog';

const { width, height } = Dimensions.get('window');

const PARALLAX_BUDGET = 60;
const PARALLAX_FACTOR = 0.08;
const HERO_ROTATE_INTERVAL = 4000;
const HERO_FADE_DURATION   = 1200;

const CARD_W = width * 0.50;
const COLL_CARD_W = (width - space.lg * 2 - space.sm) / 2;
const STYLE_CARD_W = Math.floor((width - space.lg * 2 - space.sm * 2) / 3);
const ARRIVAL_CARD_W = Math.round(width * 0.42);

// Seller lookup map: handle → seller object
const SELLER_MAP = SELLERS.reduce((acc, s) => { acc[s.handle] = s; return acc; }, {});

const HERO_IMAGES = [
  require('../assets/hero/room1.jpg'),
  require('../assets/hero/room2.jpg'),
  require('../assets/hero/room3.jpg'),
  require('../assets/hero/room4.jpg'),
  require('../assets/hero/room5.jpg'),
  require('../assets/hero/room6.jpg'),
];

// ── Room type quick-nav ────────────────────────────────────────────────────────
const ROOM_TYPES = [
  { key: 'living-room', label: 'Living',   bg: roomChipColors['living-room'] },
  { key: 'bedroom',     label: 'Bedroom',  bg: roomChipColors['bedroom'] },
  { key: 'kitchen',     label: 'Kitchen',  bg: roomChipColors['kitchen'] },
  { key: 'dining-room', label: 'Dining',   bg: roomChipColors['dining-room'] },
  { key: 'office',      label: 'Office',   bg: roomChipColors['office'] },
  { key: 'outdoor',     label: 'Outdoor',  bg: roomChipColors['outdoor'] },
  { key: 'bathroom',    label: 'Bathroom', bg: roomChipColors['bathroom'] },
  { key: 'entryway',    label: 'Entryway', bg: '#FFF8EC' },
  { key: 'kids-room',   label: 'Kids',     bg: '#FFF0F5' },
  { key: 'nursery',     label: 'Nursery',  bg: '#EBFAF9' },
];

const NEW_ROOM_KEYS = ['entryway', 'kids-room', 'nursery'];

const ROOM_ICON_PRIMARY   = '#0B6DC3';
const ROOM_ICON_ACCENT    = '#67ACE9';
const ROOM_ICON_WARM      = '#E07B39';
const ROOM_ICON_GREEN     = '#2DA665';
const ROOM_ICON_PURPLE    = '#7B5EA7';
const ROOM_ICON_GOLD      = '#C4934A';
const ROOM_ICON_ROSE      = '#D94F7A';
const ROOM_ICON_TEAL      = '#2DADA0';

// ── Star rating helper ─────────────────────────────────────────────────────────
function renderStars(rating) {
  const filled = Math.round(rating || 0);
  return '★'.repeat(filled) + '☆'.repeat(5 - filled);
}

function RoomIcon({ roomKey, size = 28 }) {
  const P = ROOM_ICON_PRIMARY;
  const A = ROOM_ICON_ACCENT;
  const sw = 1.45; // base stroke width

  switch (roomKey) {
    // ── Living Room — modern 3-seat sofa ──────────────────────────────────────
    case 'living-room':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Left armrest */}
          <Rect x="1" y="10" width="3.5" height="8" rx="1.5" fill={P} />
          {/* Right armrest */}
          <Rect x="19.5" y="10" width="3.5" height="8" rx="1.5" fill={P} />
          {/* Seat base */}
          <Rect x="4" y="13.5" width="16" height="4.5" rx="1" fill={A} opacity="0.25" stroke={P} strokeWidth={sw} />
          {/* Back left cushion */}
          <Rect x="4" y="7.5" width="7" height="7" rx="1.2" fill={A} opacity="0.35" stroke={P} strokeWidth={sw} />
          {/* Back right cushion */}
          <Rect x="13" y="7.5" width="7" height="7" rx="1.2" fill={A} opacity="0.35" stroke={P} strokeWidth={sw} />
          {/* Cushion seam */}
          <Line x1="12" y1="13.5" x2="12" y2="18" stroke={P} strokeWidth="1" strokeLinecap="round" opacity="0.35" />
          {/* Legs */}
          <Line x1="5.5" y1="18" x2="5.5" y2="21" stroke={P} strokeWidth="1.6" strokeLinecap="round" />
          <Line x1="18.5" y1="18" x2="18.5" y2="21" stroke={P} strokeWidth="1.6" strokeLinecap="round" />
        </Svg>
      );

    // ── Bedroom — bed with headboard + two pillows ────────────────────────────
    case 'bedroom':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Headboard */}
          <Rect x="2" y="4" width="20" height="7" rx="2" fill={A} opacity="0.3" stroke={P} strokeWidth={sw} />
          {/* Left pillow */}
          <Rect x="3.5" y="5.5" width="7" height="4" rx="1.5" fill={P} opacity="0.55" />
          {/* Right pillow */}
          <Rect x="13.5" y="5.5" width="7" height="4" rx="1.5" fill={P} opacity="0.55" />
          {/* Bed frame / mattress */}
          <Rect x="2" y="11" width="20" height="8" rx="1.5" fill={A} opacity="0.15" stroke={P} strokeWidth={sw} />
          {/* Duvet fold line */}
          <Path d="M2 14.5 Q12 16.5 22 14.5" stroke={P} strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.45" />
          {/* Legs */}
          <Line x1="4.5" y1="19" x2="4.5" y2="21.5" stroke={P} strokeWidth="1.6" strokeLinecap="round" />
          <Line x1="19.5" y1="19" x2="19.5" y2="21.5" stroke={P} strokeWidth="1.6" strokeLinecap="round" />
        </Svg>
      );

    // ── Kitchen — range/stove with 4 burners + oven ───────────────────────────
    case 'kitchen':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Stove body */}
          <Rect x="2" y="4" width="20" height="16" rx="2" fill={ROOM_ICON_WARM} opacity="0.08" stroke={ROOM_ICON_WARM} strokeWidth={sw} />
          {/* Oven door */}
          <Rect x="4" y="13.5" width="16" height="4.5" rx="1" fill={ROOM_ICON_WARM} opacity="0.14" stroke={ROOM_ICON_WARM} strokeWidth="1.2" />
          {/* Oven handle */}
          <Line x1="7.5" y1="15.8" x2="16.5" y2="15.8" stroke={ROOM_ICON_WARM} strokeWidth="2" strokeLinecap="round" />
          {/* Burner top-left */}
          <Circle cx="7.5" cy="8.5" r="2.2" fill={ROOM_ICON_WARM} opacity="0.18" stroke={ROOM_ICON_WARM} strokeWidth="1.3" />
          <Circle cx="7.5" cy="8.5" r="0.8" fill={ROOM_ICON_WARM} opacity="0.7" />
          {/* Burner top-right */}
          <Circle cx="16.5" cy="8.5" r="2.2" fill={ROOM_ICON_WARM} opacity="0.18" stroke={ROOM_ICON_WARM} strokeWidth="1.3" />
          <Circle cx="16.5" cy="8.5" r="0.8" fill={ROOM_ICON_WARM} opacity="0.7" />
          {/* Knobs row */}
          <Circle cx="8.5" cy="4" r="1" fill={ROOM_ICON_WARM} opacity="0.6" />
          <Circle cx="12" cy="4" r="1" fill={ROOM_ICON_WARM} opacity="0.6" />
          <Circle cx="15.5" cy="4" r="1" fill={ROOM_ICON_WARM} opacity="0.6" />
        </Svg>
      );

    // ── Dining Room — oval table + 4 chairs ───────────────────────────────────
    case 'dining-room':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Table top */}
          <Ellipse cx="12" cy="12" rx="6.5" ry="4" fill={ROOM_ICON_GREEN} opacity="0.18" stroke={ROOM_ICON_GREEN} strokeWidth={sw} />
          {/* Table leg + base */}
          <Line x1="12" y1="16" x2="12" y2="19.5" stroke={ROOM_ICON_GREEN} strokeWidth="2" strokeLinecap="round" />
          <Line x1="9" y1="19.5" x2="15" y2="19.5" stroke={ROOM_ICON_GREEN} strokeWidth="1.8" strokeLinecap="round" />
          {/* Chair top */}
          <Path d="M9 5.5 Q12 3.5 15 5.5" stroke={ROOM_ICON_GREEN} strokeWidth={sw} strokeLinecap="round" fill="none" />
          <Line x1="9.5" y1="5.5" x2="9.5" y2="8" stroke={ROOM_ICON_GREEN} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="14.5" y1="5.5" x2="14.5" y2="8" stroke={ROOM_ICON_GREEN} strokeWidth={sw} strokeLinecap="round" />
          {/* Chair left */}
          <Path d="M3.5 9 Q2 12 3.5 15" stroke={ROOM_ICON_GREEN} strokeWidth={sw} strokeLinecap="round" fill="none" />
          <Line x1="3.5" y1="9.5" x2="5.5" y2="10" stroke={ROOM_ICON_GREEN} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="3.5" y1="14.5" x2="5.5" y2="14" stroke={ROOM_ICON_GREEN} strokeWidth={sw} strokeLinecap="round" />
          {/* Chair right */}
          <Path d="M20.5 9 Q22 12 20.5 15" stroke={ROOM_ICON_GREEN} strokeWidth={sw} strokeLinecap="round" fill="none" />
          <Line x1="20.5" y1="9.5" x2="18.5" y2="10" stroke={ROOM_ICON_GREEN} strokeWidth={sw} strokeLinecap="round" />
          <Line x1="20.5" y1="14.5" x2="18.5" y2="14" stroke={ROOM_ICON_GREEN} strokeWidth={sw} strokeLinecap="round" />
        </Svg>
      );

    // ── Office — monitor on desk with keyboard ─────────────────────────────────
    case 'office':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Monitor bezel */}
          <Rect x="3" y="3" width="18" height="12" rx="1.5" fill={A} opacity="0.18" stroke={P} strokeWidth={sw} />
          {/* Screen inner */}
          <Rect x="5" y="5" width="14" height="8" rx="0.8" fill={P} opacity="0.12" />
          {/* Cursor dot */}
          <Circle cx="12" cy="9" r="1.2" fill={P} opacity="0.5" />
          {/* Stand neck */}
          <Line x1="12" y1="15" x2="12" y2="17.5" stroke={P} strokeWidth="2" strokeLinecap="round" />
          {/* Stand base */}
          <Line x1="8.5" y1="17.5" x2="15.5" y2="17.5" stroke={P} strokeWidth="2" strokeLinecap="round" />
          {/* Keyboard */}
          <Rect x="5" y="19" width="14" height="3" rx="1" fill={P} opacity="0.22" stroke={P} strokeWidth="1.2" />
          {/* Key row hints */}
          <Line x1="7" y1="20.5" x2="17" y2="20.5" stroke={P} strokeWidth="0.9" strokeLinecap="round" opacity="0.45" />
        </Svg>
      );

    // ── Outdoor — potted plant with layered leaves ─────────────────────────────
    case 'outdoor':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Pot body */}
          <Path d="M8.5 20.5 L7.5 15.5 L16.5 15.5 L15.5 20.5 Z" fill={ROOM_ICON_GREEN} opacity="0.25" stroke={ROOM_ICON_GREEN} strokeWidth={sw} strokeLinejoin="round" />
          {/* Pot rim */}
          <Line x1="7" y1="15.5" x2="17" y2="15.5" stroke={ROOM_ICON_GREEN} strokeWidth="2" strokeLinecap="round" />
          {/* Soil hint */}
          <Path d="M8 15.5 Q12 14.5 16 15.5" stroke={ROOM_ICON_GREEN} strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.4" />
          {/* Center stem */}
          <Line x1="12" y1="15.5" x2="12" y2="9.5" stroke={ROOM_ICON_GREEN} strokeWidth="1.8" strokeLinecap="round" />
          {/* Left leaf */}
          <Path d="M12 13 C10 12 7.5 10 7 7 C9.5 7.5 12 10 12 13 Z" fill={ROOM_ICON_GREEN} opacity="0.55" stroke={ROOM_ICON_GREEN} strokeWidth="1.1" strokeLinejoin="round" />
          {/* Right leaf */}
          <Path d="M12 11.5 C14 10.5 16.5 8.5 17 5.5 C14.5 6 12 8.5 12 11.5 Z" fill={ROOM_ICON_GREEN} opacity="0.55" stroke={ROOM_ICON_GREEN} strokeWidth="1.1" strokeLinejoin="round" />
          {/* Top sprout */}
          <Path d="M12 9.5 C11 7.5 11.5 5 12 3.5 C12.5 5 13 7.5 12 9.5 Z" fill={A} opacity="0.7" stroke={ROOM_ICON_GREEN} strokeWidth="1" strokeLinejoin="round" />
        </Svg>
      );

    // ── Bathroom — clawfoot tub with faucet ───────────────────────────────────
    case 'bathroom':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Tub body */}
          <Path d="M3 13 L3 18 Q3 20.5 5.5 20.5 L18.5 20.5 Q21 20.5 21 18 L21 13 Z"
            fill={ROOM_ICON_PURPLE} opacity="0.15" stroke={ROOM_ICON_PURPLE} strokeWidth={sw} strokeLinejoin="round" />
          {/* Rim line */}
          <Line x1="2" y1="13" x2="22" y2="13" stroke={ROOM_ICON_PURPLE} strokeWidth="2.2" strokeLinecap="round" />
          {/* Clawfoot legs */}
          <Line x1="5.5" y1="20.5" x2="4.5" y2="22.5" stroke={ROOM_ICON_PURPLE} strokeWidth="1.6" strokeLinecap="round" />
          <Line x1="18.5" y1="20.5" x2="19.5" y2="22.5" stroke={ROOM_ICON_PURPLE} strokeWidth="1.6" strokeLinecap="round" />
          {/* Faucet vertical neck */}
          <Line x1="6" y1="13" x2="6" y2="7.5" stroke={ROOM_ICON_PURPLE} strokeWidth="1.8" strokeLinecap="round" />
          {/* Faucet spout */}
          <Line x1="6" y1="7.5" x2="9.5" y2="7.5" stroke={ROOM_ICON_PURPLE} strokeWidth="1.8" strokeLinecap="round" />
          {/* Water drops */}
          <Circle cx="9.5" cy="9.5" r="0.9" fill={ROOM_ICON_PURPLE} opacity="0.55" />
          <Circle cx="11.5" cy="11" r="0.65" fill={ROOM_ICON_PURPLE} opacity="0.35" />
          {/* Tub interior highlight */}
          <Path d="M5 17 Q12 18.5 19 17" stroke={ROOM_ICON_PURPLE} strokeWidth="1" strokeLinecap="round" fill="none" opacity="0.3" />
        </Svg>
      );

    // ── Entryway — arched door with knob ──────────────────────────────────────
    case 'entryway':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Door arch fill */}
          <Path d="M5 22 L5 7 Q5 2.5 12 2.5 Q19 2.5 19 7 L19 22 Z"
            fill={ROOM_ICON_GOLD} opacity="0.1" stroke={ROOM_ICON_GOLD} strokeWidth={sw} strokeLinejoin="round" />
          {/* Inner door panel */}
          <Rect x="7.5" y="12" width="9" height="10" rx="0.6"
            fill={ROOM_ICON_GOLD} opacity="0.14" stroke={ROOM_ICON_GOLD} strokeWidth="1.2" />
          {/* Upper panel detail */}
          <Rect x="7.5" y="7" width="9" height="4.5" rx="1"
            fill={ROOM_ICON_GOLD} opacity="0.1" stroke={ROOM_ICON_GOLD} strokeWidth="1.2" />
          {/* Door knob */}
          <Circle cx="15.5" cy="17.5" r="1.1" fill={ROOM_ICON_GOLD} opacity="0.75" />
          {/* Floor threshold */}
          <Line x1="3" y1="22" x2="21" y2="22" stroke={ROOM_ICON_GOLD} strokeWidth="2.2" strokeLinecap="round" />
        </Svg>
      );

    // ── Kids Room — single bed with star accent ────────────────────────────────
    case 'kids-room':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Headboard */}
          <Rect x="2" y="7" width="17" height="5" rx="2"
            fill={ROOM_ICON_ROSE} opacity="0.25" stroke={ROOM_ICON_ROSE} strokeWidth={sw} />
          {/* Pillow */}
          <Rect x="3.5" y="8.2" width="6" height="2.8" rx="1.4" fill={ROOM_ICON_ROSE} opacity="0.55" />
          {/* Bed frame */}
          <Rect x="2" y="12" width="17" height="6.5" rx="1.5"
            fill={ROOM_ICON_ROSE} opacity="0.1" stroke={ROOM_ICON_ROSE} strokeWidth={sw} />
          {/* Blanket wave */}
          <Path d="M2 14.5 Q10 16.5 19 14.5" stroke={ROOM_ICON_ROSE} strokeWidth="1.3" fill="none" strokeLinecap="round" opacity="0.5" />
          {/* Legs */}
          <Line x1="4" y1="18.5" x2="4" y2="21" stroke={ROOM_ICON_ROSE} strokeWidth="1.6" strokeLinecap="round" />
          <Line x1="17" y1="18.5" x2="17" y2="21" stroke={ROOM_ICON_ROSE} strokeWidth="1.6" strokeLinecap="round" />
          {/* Star decoration */}
          <Path d="M21 2 L21.7 4.2 L24 4.2 L22.2 5.6 L22.9 7.8 L21 6.4 L19.1 7.8 L19.8 5.6 L18 4.2 L20.3 4.2 Z"
            fill={ROOM_ICON_ROSE} opacity="0.85" />
        </Svg>
      );

    // ── Nursery — crib with hanging mobile ────────────────────────────────────
    case 'nursery':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          {/* Mobile arm */}
          <Line x1="12" y1="1.5" x2="12" y2="4.5" stroke={ROOM_ICON_TEAL} strokeWidth="1.3" strokeLinecap="round" opacity="0.65" />
          <Line x1="8.5" y1="4.5" x2="15.5" y2="4.5" stroke={ROOM_ICON_TEAL} strokeWidth="1.3" strokeLinecap="round" opacity="0.65" />
          <Line x1="8.5" y1="4.5" x2="8.5" y2="6.5" stroke={ROOM_ICON_TEAL} strokeWidth="1" strokeLinecap="round" opacity="0.55" />
          <Line x1="15.5" y1="4.5" x2="15.5" y2="6.5" stroke={ROOM_ICON_TEAL} strokeWidth="1" strokeLinecap="round" opacity="0.55" />
          <Circle cx="8.5" cy="7.5" r="1.1" fill={ROOM_ICON_TEAL} opacity="0.55" />
          <Circle cx="15.5" cy="7.5" r="1.1" fill={ROOM_ICON_TEAL} opacity="0.55" />
          {/* Crib left post */}
          <Line x1="3" y1="9" x2="3" y2="21" stroke={ROOM_ICON_TEAL} strokeWidth="2" strokeLinecap="round" />
          {/* Crib right post */}
          <Line x1="21" y1="9" x2="21" y2="21" stroke={ROOM_ICON_TEAL} strokeWidth="2" strokeLinecap="round" />
          {/* Top rail */}
          <Line x1="3" y1="9" x2="21" y2="9" stroke={ROOM_ICON_TEAL} strokeWidth="2" strokeLinecap="round" />
          {/* Bottom rail */}
          <Line x1="3" y1="18" x2="21" y2="18" stroke={ROOM_ICON_TEAL} strokeWidth="2" strokeLinecap="round" />
          {/* Vertical slats */}
          <Line x1="7.5" y1="9" x2="7.5" y2="18" stroke={ROOM_ICON_TEAL} strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
          <Line x1="12" y1="9" x2="12" y2="18" stroke={ROOM_ICON_TEAL} strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
          <Line x1="16.5" y1="9" x2="16.5" y2="18" stroke={ROOM_ICON_TEAL} strokeWidth="1.3" strokeLinecap="round" opacity="0.5" />
          {/* Mattress */}
          <Rect x="4" y="15" width="16" height="3" rx="0.8" fill={ROOM_ICON_TEAL} opacity="0.18" />
          {/* Legs */}
          <Line x1="3" y1="20" x2="3" y2="22.5" stroke={ROOM_ICON_TEAL} strokeWidth="2" strokeLinecap="round" />
          <Line x1="21" y1="20" x2="21" y2="22.5" stroke={ROOM_ICON_TEAL} strokeWidth="2" strokeLinecap="round" />
        </Svg>
      );

    default:
      return null;
  }
}

// ── Style category chips with preview image ────────────────────────────────────
const STYLE_CATEGORIES = [
  { key: 'japandi',     label: 'Japandi',     sub: 'Refined Calm',   size: 'tall',
    bg: '#F0FDF4', text: '#166534', accent: '#16A34A',
    imageUrl: 'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=600&q=85' },
  { key: 'scandi',      label: 'Scandi',      sub: 'Pure & Airy',    size: 'short',
    bg: '#EFF6FF', text: '#1E40AF', accent: '#3B82F6',
    imageUrl: 'https://images.unsplash.com/photo-1649083048381-520a5b3d91ff?w=600&q=85' },
  { key: 'mid-century', label: 'Mid-Century', sub: 'Bold Heritage',  size: 'medium',
    bg: '#FFF7ED', text: '#9A3412', accent: '#EA580C',
    imageUrl: 'https://images.unsplash.com/photo-1541085929911-dea736e9287b?w=600&q=85' },
  { key: 'dark-luxe',   label: 'Dark Luxe',   sub: 'Moody & Rich',   size: 'tall',
    bg: '#1E1B4B', text: '#C7D2FE', accent: '#818CF8',
    imageUrl: 'https://images.unsplash.com/photo-1668089677938-b52086753f77?w=600&q=85' },
  { key: 'bohemian',    label: 'Boho',        sub: 'Free Spirit',    size: 'short',
    bg: '#FEF3C7', text: '#92400E', accent: '#D97706',
    imageUrl: 'https://images.unsplash.com/photo-1632119580908-ae947d4c7691?w=600&q=85' },
  { key: 'minimalist',  label: 'Minimalist',  sub: 'Less Is More',   size: 'medium',
    bg: '#F3F4F6', text: '#111827', accent: '#374151',
    imageUrl: 'https://images.unsplash.com/photo-1616486338812-3dadae4b4ace?w=600&q=85' },
  { key: 'luxury',      label: 'Glam',        sub: 'Opulent Edge',   size: 'tall',
    bg: '#F5F3FF', text: '#5B21B6', accent: '#7C3AED',
    imageUrl: 'https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?w=600&q=85' },
  { key: 'farmhouse',   label: 'Farmhouse',   sub: 'Warm & Rooted',  size: 'short',
    bg: '#FAF6F0', text: '#713F12', accent: '#A16207',
    imageUrl: 'https://images.unsplash.com/photo-1764076327046-fe35f955cba1?w=600&q=85' },
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

// ─── Icons ────────────────────────────────────────────────────────────────────

function BellIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <Path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </Svg>
  );
}

function UserIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <Circle cx={12} cy={7} r={4} />
    </Svg>
  );
}

function SendIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Line x1={22} y1={2} x2={11} y2={13} />
      <Polyline points="22 2 15 22 11 13 2 9 22 2" />
    </Svg>
  );
}

function CameraSmallIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <Circle cx={12} cy={13} r={4} />
    </Svg>
  );
}

function ChevronRight({ color = '#fff' }) {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

function HeartIcon({ size = 12, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function SparkleIcon({ size = 14, color = C.primary }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </Svg>
  );
}

function PaperPlaneIcon({ size = 14, color = '#fff' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M22 2L11 13"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
      <Path
        d="M22 2L15 22L11 13L2 9L22 2Z"
        stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"
      />
    </Svg>
  );
}

function TagIcon({ size = 13, color = '#F59E0B' }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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

// ─── Constants ────────────────────────────────────────────────────────────────
const FIRST_VISIT_KEY = 'snapspace_home_visited';

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomeScreen({ navigation }) {
  const { user } = useAuth();
  const { liked } = useLiked();
  const [prompt, setPrompt] = useState('');
  const [greeting, setGreeting] = useState(getGreeting());
  const [recentlyViewed, setRecentlyViewed] = useState([]);

  // Ping-pong hero slots
  const [slotA, setSlotA] = useState(HERO_IMAGES[0]);
  const [slotB, setSlotB] = useState(HERO_IMAGES[1]);
  const nextIdxRef  = useRef(2);
  const aIsLiveRef  = useRef(true);
  const opacityA    = useRef(new Animated.Value(1)).current;
  const opacityB    = useRef(new Animated.Value(0)).current;
  const cycleTimer  = useRef(null);

  // Scroll-driven parallax
  const scrollY = useRef(new Animated.Value(0)).current;

  // Ken Burns
  const kenBurnsScale = useRef(new Animated.Value(1)).current;

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

  const dealProduct = FEATURED_PRODUCTS[0] || null;

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

  // Ken Burns loop
  useEffect(() => {
    let stopped = false;
    const loop = () => {
      kenBurnsScale.setValue(1);
      Animated.timing(kenBurnsScale, {
        toValue: 1.02,
        duration: (HERO_ROTATE_INTERVAL + HERO_FADE_DURATION) * 2,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      }).start(({ finished }) => { if (finished && !stopped) loop(); });
    };
    loop();
    return () => { stopped = true; kenBurnsScale.stopAnimation(); };
  }, []);

  // Ping-pong crossfade
  useEffect(() => {
    const L = HERO_IMAGES.length;
    let stopped = false;
    const runCycle = () => {
      if (stopped) return;
      const aLive = aIsLiveRef.current;
      const liveOp = aLive ? opacityA : opacityB;
      const idleOp = aLive ? opacityB : opacityA;
      Animated.parallel([
        Animated.timing(liveOp, { toValue: 0, duration: HERO_FADE_DURATION, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(idleOp, { toValue: 1, duration: HERO_FADE_DURATION, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]).start(({ finished }) => {
        if (!finished || stopped) return;
        aIsLiveRef.current = !aLive;
        const next = HERO_IMAGES[nextIdxRef.current % L];
        nextIdxRef.current = (nextIdxRef.current + 1) % L;
        if (aLive) { setSlotA(next); } else { setSlotB(next); }
        cycleTimer.current = setTimeout(runCycle, HERO_ROTATE_INTERVAL);
      });
    };
    cycleTimer.current = setTimeout(runCycle, HERO_ROTATE_INTERVAL);
    return () => {
      stopped = true;
      clearTimeout(cycleTimer.current);
      opacityA.stopAnimation();
      opacityB.stopAnimation();
    };
  }, []);

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

  // Parallax
  const imageTranslateY = scrollY.interpolate({
    inputRange: [0, PARALLAX_BUDGET / PARALLAX_FACTOR],
    outputRange: [0, -PARALLAX_BUDGET],
    extrapolate: 'extend',
  });

  const firstName = getFirstName(user);
  const greetingLine = firstName
    ? `${greeting} ${firstName.toUpperCase()}`
    : greeting;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <View style={styles.container}>
      {/* Hero background images */}
      <Animated.Image
        source={slotA}
        style={[styles.bgImage, { transform: [{ translateY: imageTranslateY }, { scale: kenBurnsScale }], opacity: opacityA }]}
        resizeMode="cover"
      />
      <Animated.Image
        source={slotB}
        style={[styles.bgImage, { transform: [{ translateY: imageTranslateY }, { scale: kenBurnsScale }], opacity: opacityB }]}
        resizeMode="cover"
      />
      <View style={styles.heroTint} pointerEvents="none" />

      <Animated.ScrollView
        style={StyleSheet.absoluteFill}
        contentContainerStyle={styles.scrollContent}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: true },
        )}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        {/* ── Hero overlay ────────────────────────────────────────────── */}
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.08)', 'rgba(0,0,0,0.18)', 'rgba(0,0,0,0.65)']}
          locations={[0, 0.3, 0.6, 1]}
          style={styles.overlay}
        >
          <View style={styles.topBar}>
            <View style={styles.logoRow}>
              <Text style={styles.logo}>SnapSpace</Text>
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

          <View style={styles.contentBlock}>
            <View style={styles.heroSection}>
              <Text style={styles.greetingEyebrow}>{greetingLine}</Text>
              <Text style={styles.headline}>Lets Snap Your Space</Text>
            </View>

            <View style={styles.searchBar}>
              <LinearGradient
                colors={['rgba(255,255,255,0.28)', 'rgba(255,255,255,0.0)']}
                style={styles.searchBarHighlight}
                pointerEvents="none"
              />
              <TextInput
                style={styles.searchInput}
                placeholder="Describe your dream space..."
                placeholderTextColor="rgba(255,255,255,0.55)"
                value={prompt}
                onChangeText={setPrompt}
                returnKeyType="search"
              />
              <TouchableOpacity
                style={styles.searchSendBtn}
                activeOpacity={0.8}
                onPress={() => {
                  if (prompt.trim()) {
                    navigation?.navigate('Explore', {
                      filterQuery: prompt.trim(),
                      title: prompt.trim(),
                    });
                    setPrompt('');
                  } else {
                    navigation?.navigate('Explore');
                  }
                }}
              >
                <SendIcon />
              </TouchableOpacity>
            </View>

          </View>
        </LinearGradient>

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

        {/* ── 2. For You ──────────────────────────────────────────────── */}
        <View style={[styles.section, styles.sectionAlt]}>
          <SectionHeader
            noTopMargin
            title={userStyleDNA.length > 0 ? 'PICKED FOR YOU' : 'TOP SPACES'}
            icon={<SparkleIcon size={13} color={C.primary} />}
            actionLabel="See all"
            onAction={() => navigation?.navigate('Explore', {
              designs: forYouDesigns,
              title: userStyleDNA.length > 0 ? 'Picked For You' : 'Top Spaces',
            })}
          />
          {userStyleDNA.length > 0 && (
            <Text style={styles.sectionSub}>
              Based on your {userStyleDNA.map(s => STYLE_LABEL_MAP[s] || s).join(', ')} taste
            </Text>
          )}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          >
            {forYouDesigns.map(design => (
              <TouchableOpacity
                key={design.id}
                style={styles.forYouCard}
                activeOpacity={0.88}
                onPress={() => navigation?.navigate('ShopTheLook', { design })}
              >
                {/* Photo */}
                <View style={styles.forYouImgWrap}>
                  <CardImage uri={design.imageUrl} style={styles.forYouCardImg} />
                  <View style={styles.forYouImgOverlay} />
                </View>

                {/* Info box below image */}
                <View style={styles.forYouInfoBox}>
                  <Text style={styles.forYouInfoCreator} numberOfLines={1}>
                    {SELLER_MAP[design.user]?.displayName || design.user}
                  </Text>
                  <Text style={styles.forYouCardTitle} numberOfLines={2}>
                    {design.title.replace('...', '')}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── 3. New Arrivals ──────────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            noTopMargin
            title="NEW ARRIVALS"
            actionLabel="See all"
            onAction={() => navigation?.navigate('Explore', {
              filterTag: 'new',
              title: 'New Arrivals',
            })}
          />
          <View style={styles.collectionsGrid}>
            {NEW_ARRIVAL_PRODUCTS.map(product => (
              <TouchableOpacity
                key={product.id}
                style={styles.newArrivalCard}
                activeOpacity={0.85}
                onPress={() => navigation?.navigate('ProductDetail', { product })}
              >
                <CardImage uri={product.imageUrl} style={styles.newArrivalCardImg} placeholderColor="#D0D7E3" />
                <View style={styles.newArrivalCardInfo}>
                  <Text style={styles.newArrivalCardName} numberOfLines={2}>{product.name}</Text>
                  <View style={styles.productRatingRow}>
                    <Text style={styles.productStars}>{renderStars(product.rating)}</Text>
                    <Text style={styles.productRatingText}>
                      {product.rating ? ` ${product.rating}` : ''}
                      {product.reviewCount > 0 ? ` (${product.reviewCount.toLocaleString()})` : ' · New'}
                    </Text>
                  </View>
                  <View style={styles.newArrivalCardFooter}>
                    <Text style={styles.newArrivalCardBrand}>{product.brand}</Text>
                    <Text style={styles.newArrivalCardPrice}>{product.priceDisplay}</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── 4. Shop By Style ────────────────────────────────────────── */}
        <View style={[styles.section, styles.sectionAlt]}>
          <SectionHeader
            noTopMargin
            title="SHOP BY STYLE"
            actionLabel="See all"
            onAction={() => navigation?.navigate('Explore', {
              title: 'All Styles',
            })}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          >
            {STYLE_CATEGORIES.map(cat => {
              const count = STYLE_PRODUCT_COUNTS[cat.key] || 0;
              return (
                <TouchableOpacity
                  key={cat.key}
                  style={styles.styleCard}
                  activeOpacity={0.85}
                  onPress={() => navigation?.navigate('Explore', {
                    filterStyle: cat.key,
                    title: cat.label,
                  })}
                >
                  <View style={styles.styleCardImgWrap}>
                    <CardImage
                      uri={cat.imageUrl}
                      style={StyleSheet.absoluteFill}
                      placeholderColor="#C8D4E8"
                      resizeMode="cover"
                    />
                  </View>
                  <View style={styles.styleCardInfoBox}>
                    <Text style={styles.styleCardLabel} numberOfLines={1}>{cat.label}</Text>
                    <Text style={styles.styleCardSub} numberOfLines={1}>{cat.sub}</Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── 5. Trending This Week ────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            noTopMargin
            title="TRENDING THIS WEEK"
            actionLabel="See all"
            onAction={() => navigation?.navigate('Explore', {
              designs: TRENDING_DESIGNS,
              title: 'Trending This Week',
            })}
          />
          <View style={styles.collectionsGrid}>
            {TRENDING_DESIGNS.slice(0, 4).map(design => (
              <TouchableOpacity
                key={design.id}
                style={styles.newArrivalCard}
                activeOpacity={0.85}
                onPress={() => navigation?.navigate('ShopTheLook', { design })}
              >
                <CardImage uri={design.imageUrl} style={styles.newArrivalCardImg} placeholderColor="#D0D7E3" />
                <View style={styles.newArrivalCardInfo}>
                  <Text style={styles.newArrivalCardName} numberOfLines={2}>
                    {design.title.replace('...', '')}
                  </Text>
                  <View style={styles.newArrivalCardFooter}>
                    <Text style={styles.newArrivalCardBrand}>
                      {design.styles?.[0]
                        ? (STYLE_LABEL_MAP[design.styles[0]] || design.styles[0])
                        : `♥ ${design.likes}`}
                    </Text>
                    <Text style={styles.trendingViewLook}>View Look</Text>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── 6. Deal of the Day — premium editorial treatment ────────── */}
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
                        color={i <= Math.round(dealProduct.rating) ? '#F59E0B' : '#E5E7EB'}
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

        {/* ── 7. New Arrivals (portrait cards) ────────────────────────── */}
        <View style={[styles.section, styles.sectionAlt]}>
          <SectionHeader
            noTopMargin
            title="NEW ARRIVALS"
            actionLabel="See all"
            onAction={() => navigation?.navigate('Explore', {
              designs: NEW_ARRIVALS,
              title: 'New Arrivals',
            })}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          >
            {NEW_ARRIVALS.map(design => (
              <TouchableOpacity
                key={design.id}
                style={styles.arrivalCard}
                activeOpacity={0.88}
                onPress={() => navigation?.navigate('ShopTheLook', { design })}
              >
                {/* Photo + badge overlaid on top-right */}
                <View style={styles.arrivalImgWrap}>
                  <CardImage uri={design.imageUrl} style={styles.arrivalImg} />
                  <View style={styles.arrivalNewBadge}>
                    <Text style={styles.arrivalNewBadgeText}>NEW</Text>
                  </View>
                </View>

                {/* Info box below image */}
                <View style={styles.arrivalInfoBox}>
                  <Text style={styles.arrivalInfoCreator} numberOfLines={1}>
                    {SELLER_MAP[design.user]?.displayName || design.user}
                  </Text>
                  <Text style={styles.arrivalInfoTitle} numberOfLines={2}>
                    {design.title.replace('...', '')}
                  </Text>
                </View>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── 8. Recently Viewed (only if history exists) ─────────────── */}
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

        {/* ── 9. Featured Products ─────────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            noTopMargin
            title="FEATURED PRODUCTS"
            actionLabel="Shop all"
            onAction={() => navigation?.navigate('Browse', {
              mode: 'products',
              title: 'Featured Products',
              products: FEATURED_PRODUCTS,
            })}
          />
          <Text style={styles.affiliateDisclosure}>We may earn a commission on purchases.</Text>
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

      </Animated.ScrollView>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    overflow: 'hidden',
    backgroundColor: '#0D1E35', // dark fallback — no white flash at bottom
  },
  bgImage: {
    position: 'absolute',
    width: width * 1.02,
    left: -(width * 0.01),
    height: (height + PARALLAX_BUDGET * 2) * 1.02,
    top: -PARALLAX_BUDGET,
  },
  heroTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  overlay: {
    height: height + 40,  // extend past fold so white card never peeks
    paddingTop: space['5xl'],
    paddingBottom: 40,     // offset the extra height so content stays centered
    justifyContent: 'center',
  },

  // ── Top bar ──────────────────────────────────────────────────────────────────
  topBar: {
    position: 'absolute',
    top: space['5xl'],
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

  // ── Hero content block ───────────────────────────────────────────────────────
  contentBlock: {
    paddingHorizontal: space.lg,
    gap: space.base,
  },
  heroSection: { marginBottom: space.sm },
  greetingEyebrow: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#0B6DC3',
    letterSpacing: letterSpacing.wider,
    textTransform: 'uppercase',
    marginBottom: space.sm,
  },
  headline: {
    fontSize: 38,
    fontWeight: fontWeight.xbold,
    color: '#FFFFFF',
    lineHeight: 44,
    letterSpacing: letterSpacing.tight,
    textShadowColor: 'rgba(0,0,0,0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  headlineBold: { fontWeight: fontWeight.xbold },

  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 999,
    overflow: 'hidden',
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingVertical: space.xs,
    height: space['5xl'],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    shadowColor: '#fff',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
  },
  searchBarHighlight: {
    position: 'absolute',
    top: 0, left: 0, right: 0,
    height: '50%',
    borderTopLeftRadius: 999,
    borderTopRightRadius: 999,
  },
  searchInput: {
    flex: 1,
    fontSize: fontSize.base,
    color: '#fff',
    paddingVertical: space.sm,
  },
  searchSendBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 2,
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
    color: '#FFFFFF',
    marginBottom: space.xs,
  },
  snapBannerSub: { ...typeScale.caption, color: 'rgba(255,255,255,0.5)' },
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
    backgroundColor: '#FFFFFF',
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
    color: C.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  dnaSeeAll: {
    fontSize: 14,
    fontWeight: '600',
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
    textTransform: undefined, // override — chips show mixed case, not all-caps
  },
  dnaNote: {
    ...typeScale.caption,
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
    backgroundColor: '#0B6DC3',
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
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  roomNavCircle: {
    width: 58,
    height: 58,
    borderRadius: radius.sm,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: C.border,
  },
  roomNavEmoji: { fontSize: 22 },
  roomNavItemLabel: {
    ...typeScale.caption,
    color: C.textSecondary,
    textAlign: 'center',
  },

  // ── Shared section shell ─────────────────────────────────────────────────────
  section: {
    backgroundColor: '#FFFFFF',
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
    color: C.textTertiary,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  sectionSeeAll: {
    fontSize: 14,
    fontWeight: '600',
    color: C.primary,
  },
  sectionClear: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: C.textTertiary,
  },
  sectionSub: {
    ...typeScale.caption,
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
    backgroundColor: '#fff',
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
    color: palette.primaryBlue,
    letterSpacing: 0.1,
  },
  forYouCardTitle: {
    ...typeScale.caption,
    fontWeight: fontWeight.semibold,
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
    letterSpacing: 0.2,
  },
  // ── New Arrivals product cards (split: image top, info bottom) ────────────────
  newArrivalCard: {
    width: COLL_CARD_W,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#fff',
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
    color: palette.textSecondary,
    flex: 1,
  },
  newArrivalCardPrice: {
    ...typeScale.caption,
    color: palette.primaryBlue,
    fontWeight: '700',
  },
  trendingViewLook: {
    ...typeScale.caption,
    color: palette.primaryBlue,
    fontWeight: '600',
  },
  productRatingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    marginBottom: 2,
  },
  productStars: {
    fontSize: 11,
    color: '#F5A623',
    letterSpacing: 1,
  },
  productRatingText: {
    fontSize: 11,
    color: palette.textSecondary,
    fontWeight: '400',
  },

  // ── Shop By Style cards ──────────────────────────────────────────────────────
  styleCard: {
    width: STYLE_CARD_W,
    borderRadius: 6,
    backgroundColor: '#fff',
    ...shadow.low,
  },
  styleCardImgWrap: {
    width: '100%',
    height: STYLE_CARD_W,
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
    overflow: 'hidden',
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
    color: palette.textPrimary,
    letterSpacing: 0.1,
  },
  styleCardSub: {
    fontSize: 10,
    fontWeight: '400',
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
    color: C.textPrimary,
    marginBottom: 2,
  },
  trendCardTag: {
    ...typeScale.caption,
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
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(0,0,0,0.38)',
  },
  // Card: white bg, gray border, same 20 radius
  dealCard: {
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
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
    backgroundColor: palette.primaryBlue,
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  dealBadgeText: {
    color: '#FFFFFF',
    fontSize: 9,
    fontWeight: fontWeight.bold,
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
    letterSpacing: 1.4,
    color: palette.primaryBlue,
    textTransform: 'uppercase',
  },
  dealProductName: {
    fontSize: 17,
    fontWeight: fontWeight.bold,
    color: palette.textPrimary,
    lineHeight: 23,
    letterSpacing: -0.2,
  },
  dealDescription: {
    fontSize: 13,
    fontWeight: fontWeight.regular,
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
    color: palette.textPrimary,
    marginLeft: 3,
  },
  dealReviewCount: {
    fontSize: 12,
    fontWeight: fontWeight.regular,
    color: palette.textSecondary,
  },
  dealSourceTag: {
    fontSize: 11,
    fontWeight: fontWeight.medium,
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
    color: palette.textPrimary,
    letterSpacing: -0.5,
  },
  dealPriceOrig: {
    fontSize: 14,
    fontWeight: fontWeight.regular,
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
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },

  // ── New Arrivals cards ────────────────────────────────────────────────────────
  arrivalCard: {
    width: ARRIVAL_CARD_W,
    borderRadius: radius.md,
    backgroundColor: '#fff',
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
    shadowColor: palette.primaryBlue,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  arrivalNewBadgeText: {
    fontSize: 10,
    fontWeight: '800',
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
    color: palette.primaryBlue,
    letterSpacing: 0.1,
  },
  arrivalInfoTitle: {
    ...typeScale.caption,
    fontWeight: fontWeight.semibold,
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
    color: C.textPrimary,
  },

  // ── Featured Product cards ───────────────────────────────────────────────────
  affiliateDisclosure: {
    ...typeScale.caption,
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
    backgroundColor: '#fff',
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
    color: palette.textPrimary,
  },
  featuredShopLink: {
    ...typeScale.caption,
    color: palette.primaryBlue,
    fontWeight: '600',
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
    lineHeight: 24,
  },
  productCardName: {
    ...typeScale.headline,
    color: C.textPrimary,
    marginBottom: 2,
  },
  productCardPrice: {
    ...typeScale.price,
    color: C.primary,
  },

  // ── Get Inspired CTA ─────────────────────────────────────────────────────────
});
