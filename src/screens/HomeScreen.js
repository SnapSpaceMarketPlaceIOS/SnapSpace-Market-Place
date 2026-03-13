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
import { fontSize, fontWeight, letterSpacing, palette, space, radius, shadow, typeScale } from '../constants/tokens';
import { colors as C } from '../constants/theme';
import SectionHeader from '../components/ds/SectionHeader';
import Badge, { HeartCountPill } from '../components/ds/Badge';
import { useAuth } from '../context/AuthContext';
import { useLiked } from '../context/LikedContext';
import { DESIGNS } from '../data/designs';
import { searchProducts, getSourceColor } from '../services/affiliateProducts';

const { width, height } = Dimensions.get('window');

const PARALLAX_BUDGET = 300;
const PARALLAX_FACTOR = 0.2;
const HERO_ROTATE_INTERVAL = 7000;
const HERO_FADE_DURATION   = 1800;

const CARD_W = width * 0.50;
const COLL_CARD_W = (width - space.lg * 2 - space.sm) / 2;
const STYLE_CARD_W = Math.floor((width - space.lg * 2 - space.sm * 2) / 3);

const HERO_IMAGES = [
  'https://images.unsplash.com/photo-1613545325268-9265e1609167?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1632119580908-ae947d4c7691?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1628744876490-19b035ecf9c3?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1638541420159-cadd0634f08f?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1639059790587-95625e6b764c?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1649083048770-82e8ffd80431?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1669387448840-610c588f003d?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1668512624222-2e375314be39?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1590490359854-dfba19688d70?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1668512624275-0ee56aca4c1a?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1719297493975-0fa857dcc8b8?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1615529182904-14819c35db37?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1760067538241-33a8694d9e23?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1628744876497-eb30460be9f6?w=1600&q=90&fit=crop',
  'https://images.unsplash.com/photo-1679862342541-e408d4f3ab80?w=1600&q=90&fit=crop',
];

// ── Room type quick-nav ────────────────────────────────────────────────────────
const ROOM_TYPES = [
  { key: 'living-room', label: 'Living',   bg: '#E8F0FA' },
  { key: 'bedroom',     label: 'Bedroom',  bg: '#EEF1FD' },
  { key: 'kitchen',     label: 'Kitchen',  bg: '#FDF4EC' },
  { key: 'dining-room', label: 'Dining',   bg: '#ECFAF3' },
  { key: 'office',      label: 'Office',   bg: '#E8F0FA' },
  { key: 'outdoor',     label: 'Outdoor',  bg: '#EAF6EE' },
  { key: 'bathroom',    label: 'Bathroom', bg: '#F3EEFF' },
  { key: 'entryway',    label: 'Entryway', bg: '#FFF8EC' },
  { key: 'kids-room',   label: 'Kids',     bg: '#FFF0F5' },
  { key: 'nursery',     label: 'Nursery',  bg: '#EBFAF9' },
];

const ROOM_ICON_PRIMARY   = '#0B6DC3';
const ROOM_ICON_ACCENT    = '#67ACE9';
const ROOM_ICON_WARM      = '#E07B39';
const ROOM_ICON_GREEN     = '#2DA665';
const ROOM_ICON_PURPLE    = '#7B5EA7';
const ROOM_ICON_GOLD      = '#C4934A';
const ROOM_ICON_ROSE      = '#D94F7A';
const ROOM_ICON_TEAL      = '#2DADA0';

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
    imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&q=85' },
  { key: 'mid-century', label: 'Mid-Century', sub: 'Bold Heritage',  size: 'medium',
    bg: '#FFF7ED', text: '#9A3412', accent: '#EA580C',
    imageUrl: 'https://images.unsplash.com/photo-1618221195710-2d01d1e0a0a0?w=600&q=85' },
  { key: 'dark-luxe',   label: 'Dark Luxe',   sub: 'Moody & Rich',   size: 'tall',
    bg: '#1E1B4B', text: '#C7D2FE', accent: '#818CF8',
    imageUrl: 'https://images.unsplash.com/photo-1522771739844-ee4e8089f9e0?w=600&q=85' },
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
    imageUrl: 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=85' },
];

// Product counts per style (computed once at module load)
const STYLE_PRODUCT_COUNTS = Object.fromEntries(
  STYLE_CATEGORIES.map(cat => [
    cat.key,
    searchProducts({ style: cat.key, limit: 999 }).length,
  ])
);

// ── Curated editorial collections ─────────────────────────────────────────────
const CURATED_COLLECTIONS = [
  {
    id: 'summer-refresh', title: 'Summer\nRefresh', subtitle: '12 rooms',
    imageUrl: 'https://images.unsplash.com/photo-1628744876490-19b035ecf9c3?w=800&q=80',
    styles: ['minimalist', 'scandi', 'biophilic'],
  },
  {
    id: 'dark-moody', title: 'Dark &\nMoody', subtitle: '8 rooms',
    imageUrl: 'https://images.unsplash.com/photo-1638541420159-cadd0634f08f?w=800&q=80',
    styles: ['dark-luxe', 'luxury'],
  },
  {
    id: 'coastal-calm', title: 'Coastal\nCalm', subtitle: '10 rooms',
    imageUrl: 'https://images.unsplash.com/photo-1679862342541-e408d4f3ab80?w=800&q=80',
    styles: ['minimalist', 'scandi'],
  },
  {
    id: 'japandi-zen', title: 'Japandi\nZen', subtitle: '9 rooms',
    imageUrl: 'https://images.unsplash.com/photo-1628744876497-eb30460be9f6?w=800&q=80',
    styles: ['japandi', 'wabi-sabi'],
  },
];

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
        toValue: 1.08,
        duration: (HERO_ROTATE_INTERVAL + HERO_FADE_DURATION) * 1.5,
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
        source={{ uri: slotA }}
        style={[styles.bgImage, { transform: [{ translateY: imageTranslateY }, { scale: kenBurnsScale }], opacity: opacityA }]}
        resizeMode="cover"
      />
      <Animated.Image
        source={{ uri: slotB }}
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
        bounces
      >
        {/* ── Hero overlay ────────────────────────────────────────────── */}
        <LinearGradient
          colors={['rgba(0,0,0,0.55)', 'rgba(0,0,0,0.10)', 'rgba(0,0,0,0.20)', 'rgba(0,0,0,0.72)']}
          locations={[0, 0.25, 0.55, 1]}
          style={styles.overlay}
        >
          <View style={styles.topBar}>
            <View style={styles.logoRow}>
              <Text style={styles.logo}>SnapSpace</Text>
              <View style={styles.logoDot} />
            </View>
            <View style={styles.topIcons}>
              <TouchableOpacity style={styles.iconBtn} activeOpacity={0.75}>
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
              <Text style={styles.headline}>
                {"Let's Snap\n"}
                <Text style={styles.headlineBold}>Your Space.</Text>
              </Text>
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
              <TouchableOpacity style={styles.searchSendBtn} activeOpacity={0.8}>
                <SendIcon />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={styles.snapBanner}
              onPress={() => navigation?.navigate('Snap')}
              activeOpacity={0.88}
            >
              <View style={styles.snapBannerLeft}>
                <View style={styles.snapIconBox}>
                  <CameraSmallIcon />
                </View>
                <View style={styles.snapBannerText}>
                  <Text style={styles.snapBannerTitle}>Photograph a Room</Text>
                  <Text style={styles.snapBannerSub}>Point, snap, and let AI do the rest</Text>
                </View>
              </View>
              <View style={styles.snapChevron}>
                <ChevronRight />
              </View>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        {/* ════════════════════════════════════════════════════════════════
            BELOW-FOLD CONTENT
            Peeled white card floats over the bottom edge of the hero.
            ════════════════════════════════════════════════════════════════ */}

        {/* ── 1. Style DNA + Room Type Quick-Nav ──────────────────────── */}
        <View style={styles.peeledCard}>

          {/* Style DNA strip */}
          <SectionHeader
            noTopMargin
            title={userStyleDNA.length > 0 ? 'YOUR STYLE DNA' : 'DISCOVER YOUR STYLE'}
            icon={<SparkleIcon size={13} color={C.primary} />}
            actionLabel={userStyleDNA.length > 0 ? 'Edit →' : 'Explore →'}
            onAction={() => navigation?.navigate('Explore')}
          />

          {userStyleDNA.length > 0 ? (
            <View style={styles.dnaChipsRow}>
              {userStyleDNA.map(style => {
                const cat = STYLE_CATEGORIES.find(c => c.key === style);
                return (
                  <View key={style} style={[styles.dnaChip, { backgroundColor: cat?.bg || '#F3F4F6' }]}>
                    <Text style={[styles.dnaChipText, { color: cat?.accent || '#374151' }]}>
                      {STYLE_LABEL_MAP[style] || style}
                    </Text>
                  </View>
                );
              })}
              <Text style={styles.dnaNote}>
                Based on {likedCount} liked space{likedCount !== 1 ? 's' : ''}
              </Text>
            </View>
          ) : (
            <TouchableOpacity
              style={styles.discoverBtn}
              activeOpacity={0.8}
              onPress={() => navigation?.navigate('Explore')}
            >
              <Text style={styles.discoverBtnText}>
                Like spaces to build your style profile
              </Text>
              <View style={styles.discoverBtnArrow}>
                <PaperPlaneIcon size={18} color="#FFFFFF" />
              </View>
            </TouchableOpacity>
          )}

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
                  onPress={() => navigation?.navigate('Explore', { filterRoomType: rt.key })}
                >
                  <View style={[styles.roomNavCircle, { backgroundColor: rt.bg }]}>
                    <RoomIcon roomKey={rt.key} size={28} />
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
            onAction={() => navigation?.navigate('Explore')}
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
                activeOpacity={0.82}
                onPress={() => navigation?.navigate('ShopTheLook', { design })}
              >
                <Image
                  source={{ uri: design.imageUrl }}
                  style={styles.forYouCardImg}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={['rgba(0,0,0,0.18)', 'transparent', 'rgba(0,0,0,0.72)']}
                  locations={[0, 0.4, 1]}
                  style={StyleSheet.absoluteFill}
                />
                {/* Style badge top-left — outline ghost style */}
                {design.styles?.[0] && (
                  <Badge
                    variant="outline"
                    label={STYLE_LABEL_MAP[design.styles[0]] || design.styles[0]}
                    style={styles.forYouStyleTag}
                  />
                )}
                {/* Title — clean bottom area */}
                <Text style={styles.forYouCardTitle} numberOfLines={2}>
                  {design.title.replace('...', '')}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── 3. Curated Collections ──────────────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            noTopMargin
            title="CURATED COLLECTIONS"
            actionLabel="See all"
            onAction={() => navigation?.navigate('Explore')}
          />
          <View style={styles.collectionsGrid}>
            {CURATED_COLLECTIONS.slice(0, 4).map(col => (
              <TouchableOpacity
                key={col.id}
                style={styles.collectionCard}
                activeOpacity={0.85}
                onPress={() => navigation?.navigate('Explore', { filterStyle: col.styles[0] })}
              >
                <Image
                  source={{ uri: col.imageUrl }}
                  style={styles.collectionCardImg}
                  resizeMode="cover"
                />
                <LinearGradient
                  colors={['transparent', 'rgba(0,0,0,0.75)']}
                  locations={[0.3, 1]}
                  style={StyleSheet.absoluteFill}
                />
                <View style={styles.collectionCardContent}>
                  <Text style={styles.collectionCardTitle}>{col.title}</Text>
                  <View style={styles.collectionCardFooter}>
                    <Text style={styles.collectionCardSub}>{col.subtitle}</Text>
                    <View style={styles.collectionExploreBtn}>
                      <Text style={styles.collectionExploreBtnText}>Explore</Text>
                    </View>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* ── 4. Shop By Style ────────────────────────────────────────── */}
        <View style={[styles.section, styles.sectionAlt]}>
          <SectionHeader noTopMargin title="SHOP BY STYLE" />
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
                  style={styles.styleChipCard}
                  activeOpacity={0.8}
                  onPress={() => navigation?.navigate('Explore', { filterStyle: cat.key })}
                >
                  <Image
                    source={{ uri: cat.imageUrl }}
                    style={StyleSheet.absoluteFill}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.72)']}
                    locations={[0.3, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                  <View style={styles.styleChipOverlay}>
                    <View style={styles.styleChipLabelPill}>
                      <Text style={styles.styleChipLabel}>{cat.label}</Text>
                    </View>
                    {count > 0 && (
                      <Text style={styles.styleChipCount}>+{count} products</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── 5. Trending This Week (upgraded) ────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            noTopMargin
            title="TRENDING THIS WEEK"
            actionLabel="See all"
            onAction={() => navigation?.navigate('Explore')}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          >
            {TRENDING_DESIGNS.map(design => (
              <TouchableOpacity
                key={design.id}
                style={styles.trendCard}
                activeOpacity={0.82}
                onPress={() => navigation?.navigate('ShopTheLook', { design })}
              >
                <View style={styles.trendCardImgWrap}>
                  <Image
                    source={{ uri: design.imageUrl }}
                    style={styles.trendCardImg}
                    resizeMode="cover"
                  />
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.45)']}
                    locations={[0.4, 1]}
                    style={StyleSheet.absoluteFill}
                  />
                  <Badge
                    variant="style"
                    label={`${design.products?.length || 3} items`}
                    style={styles.trendItemsBadgePos}
                  />
                  <HeartCountPill
                    count={design.likes}
                    icon={<HeartIcon size={9} color="#fff" />}
                    style={styles.trendLikeBadgePos}
                  />
                </View>
                <Text style={styles.trendCardTitle} numberOfLines={2}>
                  {design.title.replace('...', '')}
                </Text>
                <Text style={styles.trendCardTag} numberOfLines={1}>
                  {design.styles?.[0]
                    ? (STYLE_LABEL_MAP[design.styles[0]] || design.styles[0])
                    : design.user}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
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
              activeOpacity={0.93}
              onPress={() => navigation?.navigate('ProductDetail', { product: dealProduct })}
            >
              <LinearGradient
                colors={['#080D1A', '#0C1730', '#0F2040']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.dealCard}
              >
                {/* Ambient warm glow — top-right decoration */}
                <View style={styles.dealAmbientGlow} pointerEvents="none" />

                {/* Badge row */}
                <View style={styles.dealBadgeRow}>
                  <View style={styles.dealBadge}>
                    <TagIcon size={10} color="#C9A84C" />
                    <Text style={styles.dealBadgeText}>DEAL OF THE DAY</Text>
                  </View>
                </View>

                {/* Body: image + info side by side */}
                <View style={styles.dealBody}>
                  {/* Product image with warm glow ring */}
                  <View style={styles.dealImgOuter}>
                    <View style={styles.dealImgGlowRing} />
                    <View style={styles.dealImgWrap}>
                      {dealProduct.imageUrl ? (
                        <Image
                          source={{ uri: dealProduct.imageUrl }}
                          style={styles.dealImg}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.dealImg, { backgroundColor: '#1A2E50' }]} />
                      )}
                    </View>
                  </View>

                  {/* Right info column */}
                  <View style={styles.dealInfo}>
                    <Text style={styles.dealProductName} numberOfLines={3}>
                      {dealProduct.name}
                    </Text>

                    <View style={styles.dealPriceRow}>
                      <Text style={styles.dealPrice}>{dealProduct.price}</Text>
                    </View>

                    <View style={styles.dealLimitedPill}>
                      <Text style={styles.dealLimitedText}>Limited Time</Text>
                    </View>
                  </View>
                </View>

                {/* CTA pill */}
                <TouchableOpacity
                  style={styles.dealShopBtn}
                  activeOpacity={0.82}
                  onPress={() => navigation?.navigate('ProductDetail', { product: dealProduct })}
                >
                  <Text style={styles.dealShopBtnText}>Shop Now</Text>
                  <ChevronRight color="#0F172A" />
                </TouchableOpacity>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        )}

        {/* ── 7. New Arrivals (portrait cards) ────────────────────────── */}
        <View style={[styles.section, styles.sectionAlt]}>
          <SectionHeader
            noTopMargin
            title="NEW ARRIVALS"
            actionLabel="See all"
            onAction={() => navigation?.navigate('Explore')}
          />
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          >
            {NEW_ARRIVALS.map(design => (
              <TouchableOpacity
                key={design.id}
                style={styles.portraitCard}
                activeOpacity={0.88}
                onPress={() => navigation?.navigate('ShopTheLook', { design })}
              >
                <View style={styles.portraitCardImgWrap}>
                  {design.imageUrl ? (
                    <Image
                      source={{ uri: design.imageUrl }}
                      style={styles.portraitCardImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.portraitCardImg, { backgroundColor: '#D0D7E3' }]} />
                  )}
                  <LinearGradient
                    colors={['transparent', 'rgba(0,0,0,0.55)']}
                    style={StyleSheet.absoluteFill}
                  />
                  <Badge
                    variant="status"
                    label="NEW"
                    style={styles.newBadgePos}
                  />
                  <Badge
                    variant="style"
                    label={`${design.products?.length ?? 0} items`}
                    style={styles.portraitItemsBadgePos}
                  />
                </View>
                <Text style={styles.portraitCardTitle} numberOfLines={2}>
                  {design.title.replace('...', '')}
                </Text>
                <Text style={styles.portraitCardTag}>
                  {design.styles?.[0]
                    ? (STYLE_LABEL_MAP[design.styles[0]] || design.styles[0])
                    : design.user}
                </Text>
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
                  {item.imageUrl ? (
                    <Image source={{ uri: item.imageUrl }} style={styles.recentCardImg} resizeMode="cover" />
                  ) : (
                    <View style={[styles.recentCardImg, { backgroundColor: '#E5E7EB' }]} />
                  )}
                  <Text style={styles.recentCardTitle} numberOfLines={2}>{item.title?.replace('...', '')}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        )}

        {/* ── 9. Featured Products (upgraded) ─────────────────────────── */}
        <View style={styles.section}>
          <SectionHeader
            noTopMargin
            title="FEATURED PRODUCTS"
            actionLabel="Shop all"
            onAction={() => navigation?.navigate('Explore')}
          />
          <Text style={styles.affiliateDisclosure}>We may earn a commission on purchases.</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.hScroll}
          >
            {FEATURED_PRODUCTS.map((product, i) => (
              <TouchableOpacity
                key={product.id || i}
                style={styles.productCard}
                activeOpacity={0.82}
                onPress={() => navigation?.navigate('ProductDetail', { product })}
              >
                <View style={styles.productCardImgWrap}>
                  {product.imageUrl ? (
                    <Image
                      source={{ uri: product.imageUrl }}
                      style={styles.productCardImg}
                      resizeMode="cover"
                    />
                  ) : (
                    <View style={[styles.productCardImg, { backgroundColor: '#E8EDF5' }]} />
                  )}
                  <Badge
                    variant="source"
                    label={product.source === 'amazon' ? 'Amazon' : product.source}
                    color={getSourceColor(product.source)}
                    style={styles.productSourceBadgePos}
                  />
                  {/* Quick-add overlay */}
                  <TouchableOpacity
                    style={styles.quickAddBtn}
                    activeOpacity={0.8}
                    onPress={() => navigation?.navigate('ProductDetail', { product })}
                  >
                    <Text style={styles.quickAddText}>+</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.productCardName} numberOfLines={2}>{product.name}</Text>
                <Text style={styles.productCardPrice}>{product.price}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
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
  },
  bgImage: {
    position: 'absolute',
    width: width * 1.12,
    left: -(width * 0.06),
    height: (height + PARALLAX_BUDGET * 2) * 1.12,
    top: -PARALLAX_BUDGET,
  },
  heroTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.15)',
  },
  scrollContent: {
    flexGrow: 1,
  },
  overlay: {
    height: height,
    paddingTop: space['5xl'],
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
    color: '#FFFFFF',
    letterSpacing: letterSpacing.wider,
    opacity: 0.7,
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
    backgroundColor: 'rgba(255,255,255,0.13)',
    borderRadius: 999,
    overflow: 'hidden',
    paddingLeft: space.lg,
    paddingRight: space.xs,
    paddingVertical: space.xs,
    height: space['5xl'],
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
    width: 40,
    height: 40,
    borderRadius: radius.full,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.xs,
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
    gap: space.xl,
  },
  roomNavItem: { alignItems: 'center', gap: 5 },
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
    width: CARD_W,
    height: CARD_W * 1.0,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  forYouCardImg: {
    width: '100%',
    height: '100%',
  },
  forYouStyleTag: {
    position: 'absolute',
    top: 8,
    left: 8,
  },
  forYouLikePosition: {
    position: 'absolute',
    top: 8,
    right: 8,
  },
  forYouCardTitle: {
    position: 'absolute',
    bottom: 10,
    left: 10,
    right: 10,
    color: '#fff',
    ...typeScale.headline,
    letterSpacing: -0.2,
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
    borderRadius: radius.sm,
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

  // ── Shop By Style cards ──────────────────────────────────────────────────────
  styleChipCard: {
    width: STYLE_CARD_W,
    height: STYLE_CARD_W,
    borderRadius: radius.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  styleChipOverlay: {
    position: 'absolute',
    bottom: 8,
    left: 6,
    right: 6,
    gap: 4,
  },
  styleChipLabelPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'transparent',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.85)',
    borderRadius: radius.sm,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  styleChipLabel: {
    fontSize: 10,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  styleChipCount: {
    fontSize: 9,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.78)',
    letterSpacing: 0.1,
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
    backgroundColor: '#FAFAF8',
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
  dealCard: {
    borderRadius: 20,
    overflow: 'hidden',
    padding: space.lg,
    paddingBottom: space.base,
  },
  dealAmbientGlow: {
    position: 'absolute',
    top: -40,
    right: -40,
    width: 180,
    height: 180,
    borderRadius: 90,
    backgroundColor: 'rgba(180,130,50,0.09)',
  },
  dealBadgeRow: {
    flexDirection: 'row',
    marginBottom: space.base,
  },
  dealBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(201,168,76,0.12)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(201,168,76,0.35)',
  },
  dealBadgeText: {
    color: '#C9A84C',
    fontSize: 9,
    fontWeight: fontWeight.bold,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  dealBody: {
    flexDirection: 'row',
    gap: space.base,
    alignItems: 'flex-start',
    marginBottom: space.base,
  },
  dealImgOuter: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dealImgGlowRing: {
    position: 'absolute',
    width: 118,
    height: 118,
    borderRadius: 59,
    backgroundColor: 'rgba(180,130,50,0.14)',
  },
  dealImgWrap: {
    width: 108,
    height: 108,
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: '#1A2E50',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  dealImg: {
    width: '100%',
    height: '100%',
  },
  dealInfo: {
    flex: 1,
    gap: 8,
    paddingTop: 2,
  },
  dealProductName: {
    fontSize: 16,
    fontWeight: fontWeight.bold,
    color: '#FFFFFF',
    lineHeight: 22,
    letterSpacing: -0.2,
  },
  dealPriceRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dealPrice: {
    fontSize: 22,
    fontWeight: fontWeight.xbold,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  dealLimitedPill: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  dealLimitedText: {
    fontSize: 10,
    fontWeight: fontWeight.semibold,
    letterSpacing: 0.6,
    color: 'rgba(255,255,255,0.55)',
    textTransform: 'uppercase',
  },
  dealShopBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
    backgroundColor: '#F5F0E8',
    paddingVertical: 14,
    borderRadius: radius.button,
    gap: 4,
    marginTop: 4,
  },
  dealShopBtnText: {
    fontSize: 14,
    fontWeight: fontWeight.semibold,
    color: '#0F172A',
    letterSpacing: 0.2,
  },

  // ── Portrait cards (New Arrivals) ────────────────────────────────────────────
  portraitCard: {
    width: 125,
  },
  portraitCardImgWrap: {
    width: 125,
    height: 165,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space.sm,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  portraitCardImg: { width: '100%', height: '100%' },
  newBadgePos: {
    position: 'absolute',
    top: 7,
    left: 7,
  },
  portraitItemsBadgePos: {
    position: 'absolute',
    bottom: 6,
    right: 6,
  },
  portraitCardTitle: {
    ...typeScale.headline,
    color: C.textPrimary,
    marginBottom: 2,
  },
  portraitCardTag: {
    ...typeScale.caption,
    color: C.textSecondary,
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
