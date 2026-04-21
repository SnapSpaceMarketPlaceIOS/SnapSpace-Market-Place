import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
  Modal,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Alert,
  Share,
  Linking,
  Animated,
} from 'react-native';
import CardImage from '../components/CardImage';
import LensLoader from '../components/LensLoader';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Polyline, Rect } from 'react-native-svg';
import { colors as C } from '../constants/theme';
import { fontSize, fontWeight, letterSpacing, space, radius, shadow, typeScale } from '../constants/tokens';
import { useLiked } from '../context/LikedContext';
import { useShared } from '../context/SharedContext';
import { useAuth } from '../context/AuthContext';
import { useFocusEffect } from '@react-navigation/native';
import { updateProfile, uploadAvatar, getUserDesigns, getMyStats, deleteExpiredDesigns, getUserLikedDesigns } from '../services/supabase';
import { parseDesignPrompt } from '../utils/promptParser';
// DESIGNS import removed — profile only shows real user designs from Supabase
import Skeleton from '../components/Skeleton';
import PressableCard from '../components/PressableCard';
import { VerifiedBadge } from '../components/VerifiedBadge';
import TabScreenFade from '../components/TabScreenFade';

const { width } = Dimensions.get('window');
const BANNER_HEIGHT = 210;

// ── Grid helpers ──────────────────────────────────────────────────────────────
function colWidthPct(cols) {
  if (cols === 3) return '33.33%';
  if (cols === 1) return '100%';
  return '50%';
}

function GridLayoutIcon({ cols }) {
  const color = '#888';
  if (cols === 3) {
    return (
      <Svg width={20} height={20} viewBox="0 0 18 18" fill="none">
        {[0, 6, 12].map(x => [0, 6, 12].map(y => (
          <Rect key={`${x}${y}`} x={x + 0.5} y={y + 0.5} width={2.5} height={2.5} rx={0.75} fill={color} />
        )))}
      </Svg>
    );
  }
  if (cols === 1) {
    return (
      <Svg width={20} height={20} viewBox="0 0 18 18" fill="none">
        <Rect x={0} y={2} width={18} height={1.5} rx={0.75} fill={color} />
        <Rect x={0} y={8.25} width={18} height={1.5} rx={0.75} fill={color} />
        <Rect x={0} y={14.5} width={18} height={1.5} rx={0.75} fill={color} />
      </Svg>
    );
  }
  return (
    <Svg width={20} height={20} viewBox="0 0 18 18" fill="none">
      <Rect x={0} y={0} width={6} height={6} rx={1.2} fill={color} />
      <Rect x={12} y={0} width={6} height={6} rx={1.2} fill={color} />
      <Rect x={0} y={12} width={6} height={6} rx={1.2} fill={color} />
      <Rect x={12} y={12} width={6} height={6} rx={1.2} fill={color} />
    </Svg>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function GearIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

function PencilIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </Svg>
  );
}

function VerifiedIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill={C.primary} stroke="none">
      <Path d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
    </Svg>
  );
}

function ImagePlaceholderIcon({ size = 28 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={18} height={18} rx={2} />
      <Circle cx={8.5} cy={8.5} r={1.5} />
      <Polyline points="21 15 16 10 5 21" />
    </Svg>
  );
}

function HeartIcon({ filled = false, size = 13 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#67ACE9' : 'none'} stroke={filled ? '#67ACE9' : '#444'} strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function ChevronRight() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#CCC" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

function CartActionIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <Line x1={3} y1={6} x2={21} y2={6} />
      <Path d="M16 10a4 4 0 0 1-8 0" />
    </Svg>
  );
}

function RepostIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="17 1 21 5 17 9" />
      <Path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <Polyline points="7 23 3 19 7 15" />
      <Path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

// Settings menu icons
function SavedIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></Svg>;
}

function OrderIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10} /><Polyline points="12 6 12 12 16 14" /></Svg>;
}

function CardIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Rect x={1} y={4} width={22} height={16} rx={2} ry={2} /><Line x1={1} y1={10} x2={23} y2={10} /></Svg>;
}

function HelpIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10} /><Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><Line x1={12} y1={17} x2={12.01} y2={17} /></Svg>;
}

function LogOutIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#67ACE9" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><Polyline points="16 17 21 12 16 7" /><Line x1={21} y1={12} x2={9} y2={12} /></Svg>;
}

function TrashIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#EF4444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Polyline points="3 6 5 6 21 6" /><Path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><Line x1={10} y1={11} x2={10} y2={17} /><Line x1={14} y1={11} x2={14} y2={17} /></Svg>;
}

function RestoreIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Polyline points="1 4 1 10 7 10" /><Path d="M3.51 15a9 9 0 1 0 .49-3.51" /></Svg>;
}

function FeatureIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10} /><Line x1={12} y1={8} x2={12} y2={16} /><Line x1={8} y1={12} x2={16} y2={12} /></Svg>;
}

function BellSettingsIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><Path d="M13.73 21a2 2 0 0 1-3.46 0" /></Svg>;
}

function GlobeIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10} /><Line x1={2} y1={12} x2={22} y2={12} /><Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></Svg>;
}

function StarIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Polyline points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></Svg>;
}

function ShareSettingsIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={18} cy={5} r={3} /><Circle cx={6} cy={12} r={3} /><Circle cx={18} cy={19} r={3} /><Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} /><Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} /></Svg>;
}

function FileIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><Polyline points="14 2 14 8 20 8" /><Line x1={16} y1={13} x2={8} y2={13} /><Line x1={16} y1={17} x2={8} y2={17} /><Polyline points="10 9 9 9 8 9" /></Svg>;
}

function LockSettingsIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Rect x={3} y={11} width={18} height={11} rx={2} ry={2} /><Path d="M7 11V7a5 5 0 0 1 10 0v4" /></Svg>;
}

function InfoIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10} /><Line x1={12} y1={16} x2={12} y2={12} /><Line x1={12} y1={8} x2={12.01} y2={8} /></Svg>;
}

// ── Data ──────────────────────────────────────────────────────────────────────

// No static placeholder data — only show real user designs from Supabase

const ACCOUNT_ITEMS = [
  { label: 'Subscription',           icon: <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M2 4l3 12h14l3-12-6 7-4-9-4 9-6-7z" /><Path d="M5 16h14v2H5z" /></Svg>, screen: 'Paywall' },
  { label: 'My Wishes',              icon: <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round"><Path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><Line x1={4} y1={22} x2={4} y2={15} /></Svg>,  screen: 'MySpaces' },
  { label: 'Payment Methods',        icon: <CardIcon />,  screen: 'PaymentMethods' },
  { label: 'Work With Us',             icon: <StarIcon />,  url: 'https://www.homegenieios.com/work-with-us' },
];

const SUPPORT_ITEMS = [
  { label: 'Help',              icon: <HelpIcon />,    screen: 'Help' },
  { label: 'Request a Feature', icon: <FeatureIcon />, screen: 'RequestFeature' },
];

const PREFERENCE_ITEMS = [
  { label: 'Notifications', icon: <BellSettingsIcon />, screen: 'Notifications' },
  { label: 'Language',      icon: <GlobeIcon />,        screen: 'Language' },
];

// App Store ID — populate via EXPO_PUBLIC_APP_STORE_ID once the app is live.
// Until then, Rate Us / Share Our App show a friendly "Coming Soon" alert
// instead of opening a broken App Store link.
const APP_STORE_ID = process.env.EXPO_PUBLIC_APP_STORE_ID || '';
const HAS_APP_STORE_ID = /^\d+$/.test(APP_STORE_ID);
const APP_STORE_REVIEW_URL = HAS_APP_STORE_ID
  ? `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`
  : null;
const APP_STORE_URL = HAS_APP_STORE_ID
  ? `https://apps.apple.com/app/id${APP_STORE_ID}`
  : null;

const ABOUT_ITEMS = [
  {
    label: 'Rate Us',
    icon: <StarIcon />,
    action: () => {
      if (!APP_STORE_REVIEW_URL) {
        Alert.alert(
          'Thanks for wanting to rate us!',
          "HomeGenie isn't quite on the App Store yet — ratings will be available soon."
        );
        return;
      }
      Linking.canOpenURL(APP_STORE_REVIEW_URL)
        .then((supported) => {
          Linking.openURL(supported ? APP_STORE_REVIEW_URL : APP_STORE_URL);
        })
        .catch(() => APP_STORE_URL && Linking.openURL(APP_STORE_URL));
    },
  },
  {
    label: 'Share Our App',
    icon: <ShareSettingsIcon />,
    action: async () => {
      if (!APP_STORE_URL) {
        Alert.alert(
          'Coming Soon',
          'Sharing will be available once HomeGenie is live on the App Store.'
        );
        return;
      }
      try {
        await Share.share({
          title: 'HomeGenie — AI Interior Design',
          message: `Check out HomeGenie! Wish your dream room with AI and shop the look instantly.\n\nDownload it here: ${APP_STORE_URL}`,
          url: APP_STORE_URL,
        });
      } catch {
        // share dismissed — no action needed
      }
    },
  },
  { label: 'Website',        icon: <GlobeIcon />,          url: 'https://www.homegenieios.com/' },
  { label: 'Terms of Use',   icon: <FileIcon />,          screen: 'TermsOfUse' },
  { label: 'Privacy Policy', icon: <LockSettingsIcon />,  screen: 'PrivacyPolicy' },
  { label: 'App Version',    icon: <InfoIcon />, value: 'v1.0.0' },
];

// ── Component ─────────────────────────────────────────────────────────────────

const getInitialProfile = (user) => ({
  displayName: user?.name || 'HomeGenie User',
  username: user?.username || (user?.email ? user.email.split('@')[0].toLowerCase().replace(/\s/g, '.') : 'homegenie.user'),
  bio: user?.bio || 'Building Dream Spaces\nOne Prompt At A Time...',
  avatarUri: user?.avatarUrl || null,
  bannerUri: null,
});

export default function ProfileScreen({ navigation }) {
  const { liked, toggleLiked, likedProducts } = useLiked();
  const { shared, addShared } = useShared();
  const { user, signOut, deleteAccount, refreshUser } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [likedFilter, setLikedFilter] = useState(0); // 0 = Wishes, 1 = Products
  const [gridCols, setGridCols] = useState(2);
  const cycleGrid = () => setGridCols(c => c === 3 ? 1 : c + 1);

  // Reset pill filter to Wishes whenever user leaves the Liked tab
  React.useEffect(() => {
    if (activeTab !== 1) setLikedFilter(0);
  }, [activeTab]);
  const approxCardWidth = width / gridCols;
  const cardRadius = Math.min(Math.round(approxCardWidth * (gridCols === 3 ? 0.025 : 0.05)), 12);

  // ── Gear icon spring press animation ─────────────────────────────────────
  const gearScale = useRef(new Animated.Value(1)).current;
  const gearSpringIn  = () => Animated.spring(gearScale, { toValue: 0.82, useNativeDriver: true, tension: 300, friction: 10 }).start();
  const gearSpringOut = () => Animated.spring(gearScale, { toValue: 1,    useNativeDriver: true, tension: 200, friction: 7  }).start();
  const [showSettings, setShowSettings] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [saving, setSaving] = useState(false);
  const [profile, setProfile] = useState(() => getInitialProfile(user));
  const [editDraft, setEditDraft] = useState(() => getInitialProfile(user));

  // Re-sync local profile state whenever the signed-in user switches.
  // ProfileScreen lives inside a tab navigator and does NOT unmount on
  // signOut → signIn, so the useState initializer above only fires once —
  // name/username/bio/avatar would otherwise stay frozen on the previous
  // account until the user force-quits the app. Re-keying on user?.id
  // re-runs getInitialProfile with the new session's values.
  useEffect(() => {
    const next = getInitialProfile(user);
    setProfile(next);
    setEditDraft(next);
  }, [user?.id]);
  const [myDesigns, setMyDesigns] = useState([]);
  const [designsLoading, setDesignsLoading] = useState(true);
  const [socialStats, setSocialStats] = useState({ followers: 0, following: 0, designs: 0 });
  const [serverLikedDesigns, setServerLikedDesigns] = useState([]);

  // Fetch all profile data in parallel with 5-min cache
  const lastProfileFetch = useRef(0);
  const PROFILE_CACHE_TTL = 5 * 60 * 1000;
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) { setDesignsLoading(false); return; }
      const now = Date.now();
      if (myDesigns.length > 0 && now - lastProfileFetch.current < PROFILE_CACHE_TTL) return;
      lastProfileFetch.current = now;
      let cancelled = false;
      setDesignsLoading(true);

      // Safety net: never leave skeleton stuck longer than 8s (handles paused DB / slow network)
      const fetchTimeoutId = setTimeout(() => {
        if (!cancelled) setDesignsLoading(false);
      }, 8000);

      // Fire-and-forget cleanup (don't block main fetches)
      deleteExpiredDesigns(user.id).catch(() => {});

      // Parallel fetches — stats, liked designs, own designs all at once
      Promise.all([
        getMyStats(user.id).catch(() => null),
        getUserLikedDesigns(user.id).catch(() => []),
        getUserDesigns(user.id).catch(() => []),
      ]).then(([stats, likedRows, designs]) => {
        clearTimeout(fetchTimeoutId);
        if (cancelled) return;
        if (stats) setSocialStats(stats);

        // Normalize liked designs
        const normalizedLiked = (likedRows || []).map(d => {
          const parsed = d.prompt ? parseDesignPrompt(d.prompt) : {};
          return {
            id: `liked-${d.id}`,
            _rawId: d.id,
            title: d.prompt || 'Liked Design',
            user: d.profiles?.username || d.profiles?.full_name || 'Creator',
            initial: (d.profiles?.full_name || 'C')[0],
            verified: d.profiles?.is_verified_supplier || false,
            imageUrl: d.image_url,
            description: d.prompt,
            prompt: d.prompt,
            roomType: parsed.roomType || 'living-room',
            styles: d.style_tags?.length ? d.style_tags : (parsed.styles || []),
            products: d.products || [],
            tags: (d.style_tags || []).map(s => `#${s}`),
            likes: d.likes || 0,
            shares: 0,
            isUserDesign: true,
          };
        });
        setServerLikedDesigns(normalizedLiked);

        // Normalize own designs
        const normalizedDesigns = (designs || []).map(d => {
          const parsed = d.prompt ? parseDesignPrompt(d.prompt) : {};
          return {
            id: `user-${d.id}`,
            user_id: user.id,
            title: d.prompt || 'My Wish',
            user: user.username || user.name || 'Me',
            initial: (user.name || 'M')[0],
            verified: false,
            imageUrl: d.image_url,
            description: d.prompt,
            prompt: d.prompt,
            roomType: parsed.roomType || 'living-room',
            styles: d.style_tags?.length ? d.style_tags : (parsed.styles || []),
            products: d.products || [],
            tags: (d.style_tags || []).map(s => `#${s}`),
            likes: d.likes || 0,
            shares: 0,
            visibility: d.visibility,
            isUserDesign: true,
          };
        });
        setMyDesigns(normalizedDesigns);
      }).finally(() => {
        clearTimeout(fetchTimeoutId);
        if (!cancelled) setDesignsLoading(false);
      });
      return () => { cancelled = true; clearTimeout(fetchTimeoutId); };
    }, [user?.id])
  );

  const openEditProfile = useCallback(() => {
    setEditDraft(profile);
    setShowEditProfile(true);
  }, [profile]);

  const saveEditProfile = async () => {
    if (!user?.id || saving) return;
    setSaving(true);
    try {
      let avatarUrl = editDraft.avatarUri;
      // If a new local image was picked (starts with file://) upload it to storage
      if (avatarUrl && avatarUrl.startsWith('file://')) {
        avatarUrl = await uploadAvatar(user.id, avatarUrl);
      }
      await updateProfile(user.id, {
        full_name: editDraft.displayName.trim(),
        username: editDraft.username.trim().toLowerCase(),
        bio: editDraft.bio.trim(),
        avatar_url: avatarUrl,
      });
      setProfile({ ...editDraft, avatarUri: avatarUrl });
      await refreshUser();
      setShowEditProfile(false);
    } catch (err) {
      Alert.alert('Save failed', err.message || 'Could not save profile. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const pickImage = async (type) => {
    try {
      const ImagePicker = require('expo-image-picker');
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission needed', 'Allow access to your photos to change your profile or banner.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: type === 'avatar' ? [1, 1] : [3, 1],
        quality: 0.85,
      });
      if (result.canceled) return;
      const uri = result.assets[0].uri;
      if (type === 'avatar') setEditDraft((p) => ({ ...p, avatarUri: uri }));
      else setEditDraft((p) => ({ ...p, bannerUri: uri }));
    } catch {
      Alert.alert('Rebuild required', 'Photo picker needs a native rebuild. Run: npx expo run:ios');
    }
  };

  const tabs = ['My Wishes', 'Liked'];

  return (
    <TabScreenFade style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={true}>

        {/* ── Banner ── */}
        <View style={styles.banner}>
          <CardImage uri={profile.bannerUri} style={styles.bannerImage} resizeMode="cover" />
          <SafeAreaView style={styles.navRow}>
            <View style={{ width: space['2xl'] + space.xs }} />
            <TouchableOpacity
              style={styles.navBtn}
              onPress={() => setShowSettings(true)}
              activeOpacity={1}
              onPressIn={gearSpringIn}
              onPressOut={gearSpringOut}
            >
              <Animated.View style={{ transform: [{ scale: gearScale }] }}>
                <GearIcon />
              </Animated.View>
            </TouchableOpacity>
          </SafeAreaView>
        </View>

        {/* ── Profile Header ── */}
        <View style={styles.profileHeader}>
          {/* Avatar row — avatar overlaps banner, Edit Profile floats right */}
          <View style={styles.avatarRow}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <View style={styles.avatarInner}>
                  {profile.avatarUri ? (
                    <CardImage uri={profile.avatarUri} style={styles.avatarImage} resizeMode="cover" />
                  ) : (
                    <Text style={styles.avatarInitial}>{(profile.displayName || 'S').charAt(0).toUpperCase()}</Text>
                  )}
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.editProfileBtn} onPress={openEditProfile} activeOpacity={0.8} hitSlop={{ top: 8, bottom: 8, left: 0, right: 0 }}>
              <Text style={styles.editProfileBtnText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>

          {/* Name + verified badge (only shown when is_verified_supplier = true) */}
          <View style={styles.nameRow}>
            <Text style={styles.displayName}>{profile.displayName}</Text>
            {user?.is_verified_supplier && (
              <View style={{ marginLeft: 6, marginTop: 2 }}>
                <VerifiedBadge size="md" />
              </View>
            )}
          </View>
          <Text style={styles.username}>@{profile.username}</Text>

          {/* Bio */}
          <Text style={styles.bio}>{profile.bio}</Text>

          {/* Followers / Following — live counts, tappable */}
          <View style={styles.followRow}>
            <TouchableOpacity
              style={styles.followItem}
              onPress={() => navigation.navigate('FollowList', { userId: user.id, initialTab: 'followers', name: profile.displayName })}
            >
              <Text style={styles.followValue}>{socialStats.followers >= 1000 ? (socialStats.followers / 1000).toFixed(1).replace('.0','') + 'K' : socialStats.followers}</Text>
              <Text style={styles.followLabel}> Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.followItem, { marginLeft: space.lg }]}
              onPress={() => navigation.navigate('FollowList', { userId: user.id, initialTab: 'following', name: profile.displayName })}
            >
              <Text style={styles.followValue}>{socialStats.following >= 1000 ? (socialStats.following / 1000).toFixed(1).replace('.0','') + 'K' : socialStats.following}</Text>
              <Text style={styles.followLabel}> Following</Text>
            </TouchableOpacity>
          </View>

        </View>

        {/* ── Tabs + Grid Toggle ── */}
        <View style={styles.tabsRow}>
          <View style={styles.tabsLeft}>
            {tabs.map((tab, i) => (
              <TouchableOpacity
                key={tab}
                style={styles.tab}
                onPress={() => setActiveTab(i)}
                activeOpacity={0.7}
              >
                <Text style={[styles.tabLabel, activeTab === i && styles.tabLabelActive]}>
                  {tab}
                </Text>
                {activeTab === i && <View style={styles.tabUnderline} />}
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity style={styles.gridToggleBtn} onPress={cycleGrid} activeOpacity={0.7}>
            <GridLayoutIcon cols={gridCols} />
          </TouchableOpacity>
        </View>
        <View style={styles.tabBorder} />

        {/* ── Wishes / Products pill bar (Liked tab only) — matches ExploreScreen exactly ── */}
        {activeTab === 1 && (
          <View style={styles.modeToggleRow}>
            <TouchableOpacity
              style={[styles.modeToggleBtn, likedFilter === 0 && styles.modeToggleBtnActive]}
              onPress={() => setLikedFilter(0)}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeToggleLabel, likedFilter === 0 && styles.modeToggleLabelActive]}>
                Wishes
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.modeToggleBtn, likedFilter === 1 && styles.modeToggleBtnActive]}
              onPress={() => setLikedFilter(1)}
              activeOpacity={0.8}
            >
              <Text style={[styles.modeToggleLabel, likedFilter === 1 && styles.modeToggleLabelActive]}>
                Products
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* ── Designs Grid ── */}
        {/* Products sub-tab uses local AsyncStorage — never block it with the Supabase skeleton */}
        {designsLoading && !(activeTab === 1 && likedFilter === 1) ? (
          <View style={[styles.grid, { paddingHorizontal: space.lg, paddingTop: space.base }]}>
            {[0,1,2,3].map(i => (
              <View key={i} style={{ width: colWidthPct(gridCols), padding: 1 }}>
                <Skeleton width="100%" height={160} radius="image" />
              </View>
            ))}
          </View>
        ) : (() => {
          // Products tab inside Liked
          if (activeTab === 1 && likedFilter === 1) {
            const products = Object.values(likedProducts ?? {});
            if (products.length === 0) {
              return (
                <View style={styles.emptyGrid}>
                  <Text style={styles.emptyGridTitle}>No liked products yet</Text>
                  <Text style={styles.emptyGridSub}>Tap the heart on any product page to save it here.</Text>
                </View>
              );
            }
            return (
              <View style={[styles.grid, gridCols === 1 && { paddingHorizontal: 10 }]}>
                {products.map(product => (
                  <View key={product.id} style={{ width: colWidthPct(gridCols), padding: gridCols === 1 ? 5 : 1 }}>
                    <PressableCard
                      style={[styles.card, { borderRadius: cardRadius }, gridCols === 1 && styles.cardSingle]}
                      animStyle={{ width: '100%' }}
                      onPress={() => navigation.navigate('ProductDetail', { product })}
                    >
                      <View style={[styles.cardImg, { borderRadius: cardRadius }]}>
                        <View style={styles.cardImgBg} />
                        <CardImage uri={product.imageUrl} style={styles.cardImgPhoto} resizeMode="cover" />
                      </View>
                    </PressableCard>
                  </View>
                ))}
              </View>
            );
          }

          // Wishes / designs grid
          const filtered = (activeTab === 0
            ? myDesigns
            : activeTab === 1
              ? [...myDesigns.filter(d => liked[d.id]), ...serverLikedDesigns]
              : myDesigns.filter(d => shared[d.id])
          ).filter(d => !!d.imageUrl);
          if (filtered.length === 0) {
            return (
              <View style={styles.emptyGrid}>
                <Text style={styles.emptyGridTitle}>
                  {activeTab === 0 ? 'No wishes yet' : 'No liked wishes'}
                </Text>
                <Text style={styles.emptyGridSub}>
                  {activeTab === 0
                    ? 'Generate a wish from the Wish tab and post it to see it here.'
                    : 'Wishes you like will appear here.'}
                </Text>
              </View>
            );
          }
          return (
            <View style={[styles.grid, gridCols === 1 && { paddingHorizontal: 10 }]}>
              {filtered.map(design => (
                <View key={design.id} style={{ width: colWidthPct(gridCols), padding: gridCols === 1 ? 5 : 1 }}>
                  <PressableCard
                    style={[styles.card, { borderRadius: cardRadius }, gridCols === 1 && styles.cardSingle]}
                    animStyle={{ width: '100%' }}
                    onPress={() => navigation.navigate('ShopTheLook', { design })}
                  >
                    <View style={[styles.cardImg, { borderRadius: cardRadius }]}>
                      <View style={styles.cardImgBg} />
                      <CardImage uri={design.imageUrl} style={styles.cardImgPhoto} resizeMode="cover" />
                    </View>
                  </PressableCard>
                </View>
              ))}
            </View>
          );
        })()}

        {/* ── Seller Dashboard CTA — only shown to verified suppliers ── */}
        {user?.is_verified_supplier && (
          <TouchableOpacity
            style={styles.dashboardCta}
            onPress={() => navigation.navigate('SupplierDashboard')}
            activeOpacity={0.85}
          >
            <View style={styles.dashboardCtaLeft}>
              <View style={styles.dashboardCtaIcon}>
                <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  <Polyline points="9 22 9 12 15 12 15 22" />
                </Svg>
              </View>
              <View>
                <Text style={styles.dashboardCtaTitle}>Seller Dashboard</Text>
                <Text style={styles.dashboardCtaSubtitle}>Manage products, orders & store</Text>
              </View>
            </View>
            <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 12h14M12 5l7 7-7 7" />
            </Svg>
          </TouchableOpacity>
        )}

        <View style={{ height: space['3xl'] }} />
      </ScrollView>

      {/* ══════════════════════════════
          SETTINGS BOTTOM SHEET
      ══════════════════════════════ */}
      <Modal
        visible={showSettings}
        animationType="slide"
        transparent
        onRequestClose={() => setShowSettings(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowSettings(false)}
          />
          <View style={styles.settingsSheet}>
            <View style={styles.settingsDrag} />

            {/* Sheet header */}
            <View style={styles.settingsHeader}>
              <Text style={styles.settingsTitle}>Settings</Text>
              <TouchableOpacity onPress={() => setShowSettings(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <CloseIcon />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} bounces={false}>

              {/* Account */}
              <Text style={styles.settingsSectionLabel}>ACCOUNT</Text>
              <View style={styles.settingsCard}>
                {ACCOUNT_ITEMS.map((item, i) => (
                  <TouchableOpacity
                    key={item.label}
                    style={[styles.settingsItem, i < ACCOUNT_ITEMS.length - 1 && styles.settingsItemBorder]}
                    onPress={() => { setShowSettings(false); if (item.url) { Linking.openURL(item.url).catch(() => null); } else if (item.screen) { navigation?.navigate(item.screen); } }}
                    activeOpacity={0.65}
                  >
                    <View style={styles.settingsLeft}>
                      <View style={styles.settingsIconWrap}>{item.icon}</View>
                      <Text style={styles.settingsLabel}>{item.label}</Text>
                    </View>
                    <ChevronRight />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Admin Panel — only visible to admin users */}
              {user?.role === 'admin' && (
                <>
                  <Text style={styles.settingsSectionLabel}>ADMIN</Text>
                  <View style={styles.settingsCard}>
                    <TouchableOpacity
                      style={styles.settingsItem}
                      onPress={() => { setShowSettings(false); navigation?.navigate('AdminApplications'); }}
                      activeOpacity={0.65}
                    >
                      <View style={styles.settingsLeft}>
                        <View style={[styles.settingsIconWrap, { backgroundColor: '#EEF2FF' }]}>
                          <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#0B6DC3" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
                            <Path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                          </Svg>
                        </View>
                        <Text style={[styles.settingsLabel, { color: '#0B6DC3' }]}>Supplier Applications</Text>
                      </View>
                      <ChevronRight />
                    </TouchableOpacity>
                  </View>
                </>
              )}

              {/* Support */}
              <Text style={styles.settingsSectionLabel}>SUPPORT</Text>
              <View style={styles.settingsCard}>
                {SUPPORT_ITEMS.map((item, i) => (
                  <TouchableOpacity
                    key={item.label}
                    style={[styles.settingsItem, i < SUPPORT_ITEMS.length - 1 && styles.settingsItemBorder]}
                    activeOpacity={0.65}
                    onPress={() => { setShowSettings(false); if (item.screen) navigation?.navigate(item.screen); }}
                  >
                    <View style={styles.settingsLeft}>
                      <View style={styles.settingsIconWrap}>{item.icon}</View>
                      <Text style={styles.settingsLabel}>{item.label}</Text>
                    </View>
                    <ChevronRight />
                  </TouchableOpacity>
                ))}
              </View>

              {/* Settings / Preferences */}
              <Text style={styles.settingsSectionLabel}>SETTINGS</Text>
              <View style={styles.settingsCard}>
                {PREFERENCE_ITEMS.map((item, i) => (
                  <TouchableOpacity
                    key={item.label}
                    style={[styles.settingsItem, i < PREFERENCE_ITEMS.length - 1 && styles.settingsItemBorder]}
                    activeOpacity={0.65}
                    onPress={() => { setShowSettings(false); if (item.screen) navigation?.navigate(item.screen); }}
                  >
                    <View style={styles.settingsLeft}>
                      <View style={styles.settingsIconWrap}>{item.icon}</View>
                      <Text style={styles.settingsLabel}>{item.label}</Text>
                    </View>
                    <ChevronRight />
                  </TouchableOpacity>
                ))}
              </View>

              {/* About */}
              <Text style={styles.settingsSectionLabel}>ABOUT</Text>
              <View style={styles.settingsCard}>
                {ABOUT_ITEMS.map((item, i) => (
                  <TouchableOpacity
                    key={item.label}
                    style={[styles.settingsItem, i < ABOUT_ITEMS.length - 1 && styles.settingsItemBorder]}
                    activeOpacity={item.value ? 1 : 0.65}
                    onPress={() => {
                      if (item.action) {
                        setShowSettings(false);
                        setTimeout(() => item.action(), 300);
                      } else if (item.url) {
                        setShowSettings(false);
                        Linking.openURL(item.url).catch(() => null);
                      } else if (item.screen) {
                        setShowSettings(false);
                        navigation?.navigate(item.screen);
                      }
                    }}
                  >
                    <View style={styles.settingsLeft}>
                      <View style={styles.settingsIconWrap}>{item.icon}</View>
                      <Text style={styles.settingsLabel}>{item.label}</Text>
                    </View>
                    {item.value
                      ? <Text style={styles.settingsValue}>{item.value}</Text>
                      : <ChevronRight />
                    }
                  </TouchableOpacity>
                ))}
              </View>

              {/* Log Out */}
              <TouchableOpacity
                style={styles.logoutBtn}
                onPress={() => {
                  Alert.alert(
                    'Log Out',
                    'Are you sure you want to log out of your account?',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Log Out',
                        style: 'default',
                        onPress: () => {
                          setShowSettings(false);
                          setTimeout(() => {
                            // Build 69 Commit G: jump to Home before signOut
                            // wipes the session. With the new soft wall,
                            // Profile is a gated tab — leaving the user here
                            // after signOut would strand them on a cached,
                            // stale Profile view. Home is always accessible.
                            navigation.navigate('Main', { screen: 'Home' });
                            signOut();
                          }, 300);
                        },
                      },
                    ]
                  );
                }}
              >
                <LogOutIcon />
                <Text style={styles.logoutText}>Log Out</Text>
              </TouchableOpacity>

              {/* Delete Account */}
              <TouchableOpacity
                style={styles.deleteAccountBtn}
                onPress={() => {
                  Alert.alert(
                    'Delete Account',
                    'This will permanently delete your account, all saved wishes, room photos, and personal data. This action cannot be undone.\n\nActive Apple subscriptions must be canceled separately in your Apple ID settings.',
                    [
                      { text: 'Cancel', style: 'cancel' },
                      {
                        text: 'Delete My Account',
                        style: 'destructive',
                        onPress: () => {
                          Alert.alert(
                            'Are you absolutely sure?',
                            'All your data will be permanently erased. There is no way to recover your account after this.',
                            [
                              { text: 'Go Back', style: 'cancel' },
                              {
                                text: 'Yes, Delete Everything',
                                style: 'destructive',
                                onPress: async () => {
                                  try {
                                    setShowSettings(false);
                                    await deleteAccount();
                                  } catch (e) {
                                    Alert.alert('Error', 'Could not delete account. Please try again or contact info@homegenieios.com.');
                                  }
                                },
                              },
                            ]
                          );
                        },
                      },
                    ]
                  );
                }}
              >
                <TrashIcon />
                <Text style={styles.deleteAccountText}>Delete Account</Text>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════
          EDIT PROFILE MODAL
      ══════════════════════════════ */}
      <Modal
        visible={showEditProfile}
        animationType="slide"
        transparent
        onRequestClose={() => setShowEditProfile(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={styles.modalBackdrop}
            activeOpacity={1}
            onPress={() => setShowEditProfile(false)}
          />
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.editProfileSheetWrap}
          >
            <View style={styles.editProfileSheet}>
              <View style={styles.settingsDrag} />
              <View style={styles.settingsHeader}>
                <Text style={styles.settingsTitle}>Edit Profile</Text>
                <TouchableOpacity onPress={() => setShowEditProfile(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                  <CloseIcon />
                </TouchableOpacity>
              </View>

              <ScrollView
                style={styles.editProfileScroll}
                contentContainerStyle={styles.editProfileScrollContent}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <Text style={styles.editProfileLabel}>Profile photo</Text>
                <TouchableOpacity style={styles.photoOptionRow} onPress={() => pickImage('avatar')} activeOpacity={0.7}>
                  <View style={styles.photoOptionPreview}>
                    {editDraft.avatarUri ? (
                      <CardImage uri={editDraft.avatarUri} style={styles.photoOptionPreviewImage} resizeMode="cover" />
                    ) : (
                      <Text style={styles.photoOptionPlaceholder}>{(editDraft.displayName || 'S').charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <Text style={styles.photoOptionLabel}>Change profile photo</Text>
                </TouchableOpacity>

                <Text style={styles.editProfileLabel}>Banner photo</Text>
                <TouchableOpacity style={styles.bannerOptionRow} onPress={() => pickImage('banner')} activeOpacity={0.7}>
                  {editDraft.bannerUri ? (
                    <CardImage uri={editDraft.bannerUri} style={styles.bannerOptionPreview} resizeMode="cover" />
                  ) : (
                    <View style={styles.bannerOptionPlaceholder}>
                      <Text style={styles.bannerOptionPlaceholderText}>Tap to add banner</Text>
                    </View>
                  )}
                </TouchableOpacity>

                <Text style={styles.editProfileLabel}>Display name</Text>
                <TextInput
                  style={styles.editProfileInput}
                  value={editDraft.displayName}
                  onChangeText={(t) => setEditDraft((p) => ({ ...p, displayName: t }))}
                  placeholder="Your name"
                  placeholderTextColor="#999"
                  autoCapitalize="words"
                />

                <Text style={styles.editProfileLabel}>Username</Text>
                <View style={styles.usernameInputWrap}>
                  <Text style={styles.usernamePrefix}>@</Text>
                  <TextInput
                    style={[styles.editProfileInput, styles.usernameInput]}
                    value={editDraft.username}
                    onChangeText={(t) => setEditDraft((p) => ({ ...p, username: t.replace(/^@/, '').replace(/\s/g, '') }))}
                    placeholder="username"
                    placeholderTextColor="#999"
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>

                <Text style={styles.editProfileLabel}>Bio</Text>
                <TextInput
                  style={[styles.editProfileInput, styles.editProfileBioInput]}
                  value={editDraft.bio}
                  onChangeText={(t) => setEditDraft((p) => ({ ...p, bio: t }))}
                  placeholder="Tell others about you..."
                  placeholderTextColor="#999"
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />

                <TouchableOpacity style={[styles.saveProfileBtn, saving && { opacity: 0.6 }]} onPress={saveEditProfile} activeOpacity={0.85} disabled={saving}>
                  <Text style={styles.saveProfileBtnText}>{saving ? 'Saving…' : 'Save'}</Text>
                </TouchableOpacity>
                <View style={{ height: space.xl }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </TabScreenFade>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.white,
  },

  // Banner
  banner: {
    height: BANNER_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
  },
  bannerGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: C.primary,
    opacity: 0.9,
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  // 60px gradient at the bottom of the banner fading into white
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.base,
    paddingTop: space.xs,
  },
  navBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: space.lg,
    shadowColor: shadow.medium.shadowColor,
    shadowOffset: shadow.medium.shadowOffset,
    shadowOpacity: shadow.medium.shadowOpacity,
    shadowRadius: shadow.medium.shadowRadius,
    elevation: shadow.medium.elevation,
  },

  // Profile Header
  profileHeader: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: -44,
    marginBottom: space.md,
  },
  // avatar is 88px so marginTop: -44 places it half-overlapping the banner
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: '#fff',
    shadowColor: shadow.medium.shadowColor,
    shadowOffset: shadow.medium.shadowOffset,
    shadowOpacity: shadow.medium.shadowOpacity,
    shadowRadius: shadow.medium.shadowRadius,
    elevation: shadow.medium.elevation,
  },
  avatarInner: {
    flex: 1,
    borderRadius: radius.full,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: '#fff',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.full,
  },
  editProfileBtn: {
    height: 28,
    borderRadius: radius.full,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.12)',
    backgroundColor: C.white,
    alignSelf: 'flex-end',
    marginBottom: -14,
    justifyContent: 'center',
  },
  editProfileBtnText: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: C.textPrimary,
  },

  // Name block
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  displayName: {
    ...typeScale.title,
    fontWeight: '800',
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,
    letterSpacing: letterSpacing.tight,
  },
  // verifiedDot replaced by VerifiedBadge component
  username: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
    opacity: 0.44,
    marginBottom: space.sm,
    marginTop: space.xs,
  },
  bio: {
    ...typeScale.body,
    fontFamily: 'Geist_400Regular',
    color: C.textPrimary,
    opacity: 0.72,
    marginBottom: space.md,
    marginTop: space.sm,
  },

  // Followers / Following inline
  followRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.lg,
  },
  followItem: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  followValue: {
    ...typeScale.body,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,
  },
  followLabel: {
    ...typeScale.body,
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
    opacity: 0.44,
  },

  // Action pill chips — horizontal scroll row
  actionRow: {
    marginBottom: space.sm,
    marginTop: space.lg,
  },
  actionRowContent: {
    paddingHorizontal: space.lg,
    gap: space.sm,
  },
  actionChip: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 36,
    paddingHorizontal: space.base,
    borderRadius: radius.sm,
    backgroundColor: C.surface,
    gap: 6,
  },
  actionChipLabel: {
    ...typeScale.micro,
    fontFamily: 'Geist_600SemiBold',
    color: C.textPrimary,
    textTransform: undefined,
  },

  // Tabs
  tabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    marginTop: space.sm,
  },
  tabsLeft: {
    flexDirection: 'row',
  },
  gridToggleBtn: {
    paddingLeft: 8,
    paddingRight: 0,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tab: {
    paddingBottom: space.md,
    marginRight: space.xl,
    position: 'relative',
  },
  tabLabel: {
    ...typeScale.caption,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: C.textTertiary,
  },
  tabLabelActive: {
    ...typeScale.caption,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: C.primary,
    borderRadius: 2,
  },
  tabBorder: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginBottom: 0,
  },

  // Liked tab pill bar — exact copy of ExploreScreen modeToggle styles
  modeToggleRow: {
    flexDirection: 'row',
    marginHorizontal: space.lg,
    marginTop: space.md,
    marginBottom: space.sm,
    backgroundColor: C.surface,
    borderRadius: radius.full,
    padding: 3,
  },
  modeToggleBtn: {
    flex: 1,
    height: 33,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modeToggleBtnActive: {
    backgroundColor: C.bg,
    ...shadow.sm,
  },
  modeToggleLabel: {
    fontSize: 12,
    fontWeight: '300',
    fontFamily: 'Geist_400Regular',
    color: 'rgba(0,0,0,0.45)',
  },
  modeToggleLabelActive: {
    fontSize: 13,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: C.primary,
  },
  productCardInfo: {
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
  },
  productCardName: {
    fontSize: 12,
    fontWeight: '600',
    fontFamily: 'Geist_600SemiBold',
    color: C.textPrimary,
  },
  productCardPrice: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#0B6DC3',
    marginTop: 2,
  },

  // Grid — spacing handled by per-card padding (matches Explore)
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 4,
  },
  emptyGrid: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyGridTitle: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyGridSub: {
    fontSize: 14,
    fontFamily: 'Geist_400Regular',
    color: '#9CA3AF',
    textAlign: 'center',
    lineHeight: 20,
  },
  // Post grid cards — clean image tiles matching Explore product grid style
  card: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ECEEF2',
  },
  cardSingle: {
    ...shadow.medium,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.05)',
  },
  cardImg: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardImgBg: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#E8EDF2',
  },
  cardImgPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  cardActions: {
    position: 'absolute',
    top: 8,
    right: 8,
    gap: 6,
    alignItems: 'center',
  },
  cardActionBtn: {
    width: 28,
    height: 28,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: shadow.medium.shadowColor,
    shadowOffset: shadow.medium.shadowOffset,
    shadowOpacity: shadow.medium.shadowOpacity,
    shadowRadius: shadow.medium.shadowRadius,
    elevation: shadow.medium.elevation,
  },

  // Settings modal — overlay per spec
  modalOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.32)',
  },
  modalBackdrop: {
    flex: 1,
  },
  // Settings bottom sheet — shadow.high per spec
  settingsSheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: space['2xl'],
    maxHeight: '88%',
    shadowColor: shadow.high.shadowColor,
    shadowOffset: shadow.high.shadowOffset,
    shadowOpacity: shadow.high.shadowOpacity,
    shadowRadius: shadow.high.shadowRadius,
    elevation: shadow.high.elevation,
  },
  settingsDrag: {
    width: 40,
    height: 4,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 2,
    alignSelf: 'center',
    marginTop: space.md,
    marginBottom: space.xs,
  },
  settingsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  settingsTitle: {
    ...typeScale.headline,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.textPrimary,
    letterSpacing: letterSpacing.tight,
  },
  settingsSectionLabel: {
    ...typeScale.subheadline,
    fontFamily: 'Geist_600SemiBold',
    color: C.textTertiary,
    paddingHorizontal: space.lg,
    paddingTop: space.base,
    paddingBottom: space.sm,
  },
  settingsCard: {
    backgroundColor: C.white,
    marginHorizontal: space.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
    overflow: 'hidden',
    marginBottom: space.lg,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.base,
    paddingVertical: space.base,
  },
  settingsItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.04)',
  },
  settingsLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
  },
  settingsIconWrap: {
    width: space['2xl'],
    height: space['2xl'],
    borderRadius: radius.sm,
    backgroundColor: C.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsLabel: {
    ...typeScale.body,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
    color: C.textPrimary,
  },
  settingsValue: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
    opacity: 0.44,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginHorizontal: space.base,
    paddingVertical: space.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(103,172,233,0.3)',
    backgroundColor: 'rgba(103,172,233,0.08)',
    marginBottom: space.sm,
  },
  logoutText: {
    ...typeScale.body,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#67ACE9',
  },
  deleteAccountBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    marginHorizontal: space.base,
    paddingVertical: space.base,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
    marginBottom: space.base,
  },
  deleteAccountText: {
    ...typeScale.body,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.destructive,
  },
  version: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    textAlign: 'center',
    color: C.textTertiary,
  },

  // Edit Profile modal
  editProfileSheetWrap: {
    maxHeight: '85%',
    justifyContent: 'flex-end',
  },
  // Edit profile bottom sheet — shadow.high per spec
  editProfileSheet: {
    backgroundColor: C.white,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingBottom: space.xl,
    maxHeight: '85%',
    shadowColor: shadow.high.shadowColor,
    shadowOffset: shadow.high.shadowOffset,
    shadowOpacity: shadow.high.shadowOpacity,
    shadowRadius: shadow.high.shadowRadius,
    elevation: shadow.high.elevation,
  },
  editProfileScroll: {
    maxHeight: 400,
  },
  editProfileScrollContent: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  photoOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginBottom: space.xs,
  },
  photoOptionPreview: {
    width: 56,
    height: 56,
    borderRadius: radius.full,
    backgroundColor: C.primary,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  photoOptionPreviewImage: {
    width: '100%',
    height: '100%',
  },
  photoOptionPlaceholder: {
    fontSize: fontSize.lg,
    fontWeight: fontWeight.bold,
    fontFamily: 'Geist_700Bold',
    color: '#fff',
  },
  photoOptionLabel: {
    ...typeScale.body,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: C.primary,
  },
  bannerOptionRow: {
    width: '100%',
    height: 80,
    borderRadius: radius.md,
    overflow: 'hidden',
    marginBottom: space.xs,
  },
  bannerOptionPreview: {
    width: '100%',
    height: '100%',
  },
  bannerOptionPlaceholder: {
    width: '100%',
    height: '100%',
    backgroundColor: '#E8EEF4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerOptionPlaceholderText: {
    ...typeScale.caption,
    fontFamily: 'Geist_400Regular',
    color: C.textTertiary,
  },
  editProfileLabel: {
    ...typeScale.micro,
    fontFamily: 'Geist_600SemiBold',
    color: C.textTertiary,
    textTransform: 'uppercase',
    marginBottom: space.sm,
    marginTop: space.md,
  },
  editProfileInput: {
    ...typeScale.body,
    fontFamily: 'Geist_400Regular',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    color: C.textPrimary,
    backgroundColor: C.white,
  },
  usernameInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: radius.md,
    backgroundColor: C.white,
    paddingLeft: space.md,
  },
  usernamePrefix: {
    ...typeScale.body,
    color: C.textTertiary,
    fontWeight: '500',
    fontFamily: 'Geist_500Medium',
  },
  usernameInput: {
    flex: 1,
    borderWidth: 0,
    marginLeft: space.xs,
    paddingVertical: space.md,
  },
  editProfileBioInput: {
    minHeight: 88,
    paddingTop: space.md,
  },
  saveProfileBtn: {
    marginTop: space.xl,
    backgroundColor: C.primary,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveProfileBtnText: {
    ...typeScale.button,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#fff',
  },

  // ── Seller Dashboard CTA (shown to verified suppliers) ────────────────────
  dashboardCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: space.lg,
    marginTop: space.xl,
    backgroundColor: C.primary,
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
  },
  dashboardCtaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: space.sm,
  },
  dashboardCtaIcon: {
    width: 34,
    height: 34,
    borderRadius: radius.full,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dashboardCtaTitle: {
    ...typeScale.caption,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#fff',
    marginBottom: 2,
  },
  dashboardCtaSubtitle: {
    ...typeScale.micro,
    fontFamily: 'Geist_600SemiBold',
    textTransform: undefined,
    color: 'rgba(255,255,255,0.7)',
  },

  // ── Become a Supplier CTA ──────────────────────────────────────────────────
  supplierCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: space.lg,
    marginTop: space.xl,
    backgroundColor: '#EFF6FF',
    borderRadius: radius.lg,
    paddingVertical: space.md,
    paddingHorizontal: space.lg,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  supplierCtaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: space.sm,
  },
  supplierCtaBadge: {
    width: 32,
    height: 32,
    borderRadius: radius.full,
    backgroundColor: 'rgba(103,172,233,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  supplierCtaText: { flex: 1 },
  supplierCtaTitle: {
    ...typeScale.caption,
    fontWeight: '700',
    fontFamily: 'Geist_700Bold',
    color: '#1E3A5F',
    marginBottom: 2,
  },
  supplierCtaSubtitle: {
    ...typeScale.micro,
    fontFamily: 'Geist_600SemiBold',
    textTransform: undefined,
    color: '#3B82F6',
  },
  supplierCtaBtn: {
    backgroundColor: C.primary,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 16,
    marginLeft: space.md,
  },
  supplierCtaBtnText: {
    ...typeScale.button,
    fontFamily: 'Geist_600SemiBold',
    color: '#fff',
  },
});
