import React, { useState } from 'react';
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
  Image,
  Alert,
  Share,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Polyline, Rect } from 'react-native-svg';
import { colors } from '../constants/colors';
import { fontSize, fontWeight, letterSpacing, space, radius, shadow } from '../constants/tokens';
import { useLiked } from '../context/LikedContext';
import { useShared } from '../context/SharedContext';
import { useAuth } from '../context/AuthContext';

const { width } = Dimensions.get('window');
// 4px padding each side + 4px gap between cards (tight photo grid)
const CARD_WIDTH = (width - 4 * 2 - 4) / 2;
const BANNER_HEIGHT = 210;

// ── Icons ─────────────────────────────────────────────────────────────────────

function GearIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={3} />
      <Path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </Svg>
  );
}

function PencilIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <Path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </Svg>
  );
}

function VerifiedIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill={colors.bluePrimary} stroke="none">
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
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#ef4444' : 'none'} stroke={filled ? '#ef4444' : '#444'} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function ShareIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <Polyline points="16 6 12 2 8 6" />
      <Line x1={12} y1={2} x2={12} y2={15} />
    </Svg>
  );
}

function ChevronRight() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#CCC" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="9 18 15 12 9 6" />
    </Svg>
  );
}

function CartActionIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" />
      <Line x1={3} y1={6} x2={21} y2={6} />
      <Path d="M16 10a4 4 0 0 1-8 0" />
    </Svg>
  );
}

function RepostIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="17 1 21 5 17 9" />
      <Path d="M3 11V9a4 4 0 0 1 4-4h14" />
      <Polyline points="7 23 3 19 7 15" />
      <Path d="M21 13v2a4 4 0 0 1-4 4H3" />
    </Svg>
  );
}

function SharedIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={18} cy={5} r={3} />
      <Circle cx={6} cy={12} r={3} />
      <Circle cx={18} cy={19} r={3} />
      <Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
      <Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
    </Svg>
  );
}

function CloseIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={2.5} strokeLinecap="round">
      <Line x1={18} y1={6} x2={6} y2={18} />
      <Line x1={6} y1={6} x2={18} y2={18} />
    </Svg>
  );
}

// Settings menu icons
function SavedIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" /></Svg>;
}

function OrderIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10} /><Polyline points="12 6 12 12 16 14" /></Svg>;
}

function CardIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Rect x={1} y={4} width={22} height={16} rx={2} ry={2} /><Line x1={1} y1={10} x2={23} y2={10} /></Svg>;
}

function HelpIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10} /><Path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><Line x1={12} y1={17} x2={12.01} y2={17} /></Svg>;
}

function LogOutIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#E74C3C" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><Polyline points="16 17 21 12 16 7" /><Line x1={21} y1={12} x2={9} y2={12} /></Svg>;
}

function RestoreIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Polyline points="1 4 1 10 7 10" /><Path d="M3.51 15a9 9 0 1 0 .49-3.51" /></Svg>;
}

function FeatureIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10} /><Line x1={12} y1={8} x2={12} y2={16} /><Line x1={8} y1={12} x2={16} y2={12} /></Svg>;
}

function BellSettingsIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><Path d="M13.73 21a2 2 0 0 1-3.46 0" /></Svg>;
}

function GlobeIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10} /><Line x1={2} y1={12} x2={22} y2={12} /><Path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></Svg>;
}

function StarIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Polyline points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></Svg>;
}

function ShareSettingsIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Circle cx={18} cy={5} r={3} /><Circle cx={6} cy={12} r={3} /><Circle cx={18} cy={19} r={3} /><Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} /><Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} /></Svg>;
}

function FileIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><Polyline points="14 2 14 8 20 8" /><Line x1={16} y1={13} x2={8} y2={13} /><Line x1={16} y1={17} x2={8} y2={17} /><Polyline points="10 9 9 9 8 9" /></Svg>;
}

function LockSettingsIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Rect x={3} y={11} width={18} height={11} rx={2} ry={2} /><Path d="M7 11V7a5 5 0 0 1 10 0v4" /></Svg>;
}

function InfoIcon() {
  return <Svg width={20} height={20} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"><Circle cx={12} cy={12} r={10} /><Line x1={12} y1={16} x2={12} y2={12} /><Line x1={12} y1={8} x2={12.01} y2={8} /></Svg>;
}

// ── Data ──────────────────────────────────────────────────────────────────────

const MY_DESIGNS = Array.from({ length: 12 }, (_, i) => ({ id: i + 1 }));

const ACCOUNT_ITEMS = [
  { label: 'Saved Designs',   icon: <SavedIcon />, screen: 'Explore' },
  { label: 'Order History',   icon: <OrderIcon />, screen: 'OrderHistory' },
  { label: 'Payment Methods', icon: <CardIcon />,  screen: 'PaymentMethods' },
];

const SUPPORT_ITEMS = [
  { label: 'Help',              icon: <HelpIcon />,    screen: 'Help' },
  { label: 'Restore Purchase',  icon: <RestoreIcon />, screen: 'RestorePurchase' },
  { label: 'Request a Feature', icon: <FeatureIcon />, screen: 'RequestFeature' },
];

const PREFERENCE_ITEMS = [
  { label: 'Notifications', icon: <BellSettingsIcon />, screen: 'Notifications' },
  { label: 'Language',      icon: <GlobeIcon />,        screen: 'Language' },
];

// App Store ID — update this once the app is live on the App Store
const APP_STORE_ID = '123456789';
const APP_STORE_REVIEW_URL = `itms-apps://itunes.apple.com/app/id${APP_STORE_ID}?action=write-review`;
const APP_STORE_URL = `https://apps.apple.com/app/id${APP_STORE_ID}`;

const ABOUT_ITEMS = [
  {
    label: 'Rate Us',
    icon: <StarIcon />,
    action: () => {
      Linking.canOpenURL(APP_STORE_REVIEW_URL)
        .then((supported) => {
          Linking.openURL(supported ? APP_STORE_REVIEW_URL : APP_STORE_URL);
        })
        .catch(() => Linking.openURL(APP_STORE_URL));
    },
  },
  {
    label: 'Share Our App',
    icon: <ShareSettingsIcon />,
    action: async () => {
      try {
        await Share.share({
          title: 'SnapSpace — AI Interior Design',
          message: `Check out SnapSpace! Design your dream space with AI and shop the look instantly.\n\nDownload it here: ${APP_STORE_URL}`,
          url: APP_STORE_URL,
        });
      } catch {
        // share dismissed — no action needed
      }
    },
  },
  { label: 'Terms of Use',   icon: <FileIcon />,          screen: 'TermsOfUse' },
  { label: 'Privacy Policy', icon: <LockSettingsIcon />,  screen: 'PrivacyPolicy' },
  { label: 'App Version',    icon: <InfoIcon />, value: 'v1.0.0' },
];

// ── Component ─────────────────────────────────────────────────────────────────

const getInitialProfile = (user) => ({
  displayName: user?.name || 'SnapSpace User',
  username: user?.email ? user.email.split('@')[0].toLowerCase().replace(/\s/g, '.') : 'snapspace.user',
  bio: 'Building Dream Spaces\nOne Prompt At A Time...',
  avatarUri: null,
  bannerUri: null,
});

export default function ProfileScreen({ navigation }) {
  const { liked, toggleLiked } = useLiked();
  const { shared, addShared } = useShared();
  const { user, signOut } = useAuth();
  const [activeTab, setActiveTab] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showEditProfile, setShowEditProfile] = useState(false);
  const [profile, setProfile] = useState(() => getInitialProfile(user));
  const [editDraft, setEditDraft] = useState(() => getInitialProfile(user));

  const openEditProfile = () => {
    setEditDraft(profile);
    setShowEditProfile(true);
  };

  const saveEditProfile = () => {
    setProfile(editDraft);
    setShowEditProfile(false);
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

  const tabs = ['My Snaps', 'Saved', 'Repost'];

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={true}>

        {/* ── Banner ── */}
        <View style={styles.banner}>
          {profile.bannerUri ? (
            <Image source={{ uri: profile.bannerUri }} style={styles.bannerImage} resizeMode="cover" />
          ) : (
            <View style={styles.bannerGradient} />
          )}
          {/* Bottom gradient overlay — fades into profile header bg */}
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.85)']}
            style={styles.bannerBottomFade}
            pointerEvents="none"
          />
          <SafeAreaView style={styles.navRow}>
            <View style={{ width: 36 }} />
            <TouchableOpacity style={styles.navBtn} onPress={() => setShowSettings(true)}>
              <GearIcon />
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
                    <Image source={{ uri: profile.avatarUri }} style={styles.avatarImage} resizeMode="cover" />
                  ) : (
                    <Text style={styles.avatarInitial}>{(profile.displayName || 'S').charAt(0).toUpperCase()}</Text>
                  )}
                </View>
              </View>
            </View>
            <TouchableOpacity style={styles.editProfileBtn} onPress={openEditProfile} activeOpacity={0.8}>
              <Text style={styles.editProfileBtnText}>Edit Profile</Text>
            </TouchableOpacity>
          </View>

          {/* Name + verified dot */}
          <View style={styles.nameRow}>
            <Text style={styles.displayName}>{profile.displayName}</Text>
            <View style={styles.verifiedDot} />
          </View>
          <Text style={styles.username}>@{profile.username}</Text>

          {/* Bio */}
          <Text style={styles.bio}>{profile.bio}</Text>

          {/* Followers / Following — simple inline stats */}
          <View style={styles.followRow}>
            <TouchableOpacity style={styles.followItem}>
              <Text style={styles.followValue}>1.4K</Text>
              <Text style={styles.followLabel}> Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.followItem, { marginLeft: 20 }]}>
              <Text style={styles.followValue}>284</Text>
              <Text style={styles.followLabel}> Following</Text>
            </TouchableOpacity>
          </View>

          {/* Action pill chips — horizontal scroll */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.actionRow}
            contentContainerStyle={styles.actionRowContent}
          >
            {[
              { label: 'Cart',   icon: <CartActionIcon />, screen: 'Cart' },
              { label: 'Liked',  icon: <HeartIcon size={16} />, screen: 'Liked' },
              { label: 'Repost', icon: <RepostIcon /> },
              { label: 'Shared', icon: <SharedIcon />, screen: 'Shared' },
            ].map(({ label, icon, screen }) => (
              <TouchableOpacity
                key={label}
                style={styles.actionChip}
                activeOpacity={0.7}
                onPress={() => screen && navigation?.navigate(screen)}
              >
                {icon}
                <Text style={styles.actionChipLabel}>{label}</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>

        {/* ── Tabs ── */}
        <View style={styles.tabsRow}>
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
        <View style={styles.tabBorder} />

        {/* ── Designs Grid ── */}
        <View style={styles.grid}>
          {MY_DESIGNS.map(design => (
            <TouchableOpacity
              key={design.id}
              style={styles.card}
              activeOpacity={0.88}
            >
              <View style={styles.cardImg}>
                <ImagePlaceholderIcon size={28} />
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.cardActionBtn}
                    onPress={() => toggleLiked(design.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <HeartIcon filled={!!liked[design.id]} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cardActionBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    onPress={async () => {
                      try {
                        const result = await Share.share({
                          message: 'Check out this room design on SnapSpace!',
                        });
                        if (result.action === Share.sharedAction) {
                          addShared(design.id);
                        }
                      } catch {
                        // share cancelled or error — no action needed
                      }
                    }}
                  >
                    <ShareIcon />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 40 }} />
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
                    onPress={() => { setShowSettings(false); if (item.screen) navigation?.navigate(item.screen); }}
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
                        style: 'destructive',
                        onPress: () => {
                          setShowSettings(false);
                          setTimeout(() => signOut(), 300);
                        },
                      },
                    ]
                  );
                }}
              >
                <LogOutIcon />
                <Text style={styles.logoutText}>Log Out</Text>
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
                      <Image source={{ uri: editDraft.avatarUri }} style={styles.photoOptionPreviewImage} resizeMode="cover" />
                    ) : (
                      <Text style={styles.photoOptionPlaceholder}>{(editDraft.displayName || 'S').charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <Text style={styles.photoOptionLabel}>Change profile photo</Text>
                </TouchableOpacity>

                <Text style={styles.editProfileLabel}>Banner photo</Text>
                <TouchableOpacity style={styles.bannerOptionRow} onPress={() => pickImage('banner')} activeOpacity={0.7}>
                  {editDraft.bannerUri ? (
                    <Image source={{ uri: editDraft.bannerUri }} style={styles.bannerOptionPreview} resizeMode="cover" />
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

                <TouchableOpacity style={styles.saveProfileBtn} onPress={saveEditProfile} activeOpacity={0.85}>
                  <Text style={styles.saveProfileBtnText}>Save</Text>
                </TouchableOpacity>
                <View style={{ height: 24 }} />
              </ScrollView>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },

  // Banner
  banner: {
    height: BANNER_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
  },
  bannerGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.blueDeep,
    opacity: 0.9,
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  // 60px gradient at the bottom of the banner fading into white
  bannerBottomFade: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    pointerEvents: 'none',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: space.base,
    paddingTop: space.xs,
  },
  navBtn: {
    width: space['2xl'],
    height: space['2xl'],
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
    backgroundColor: colors.blueDeep,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    color: '#fff',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.full,
  },
  editProfileBtn: {
    height: 36,
    borderRadius: radius.sm,
    paddingHorizontal: space.xl,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    backgroundColor: '#fff',
    marginBottom: space.xs,
    justifyContent: 'center',
  },
  editProfileBtnText: {
    color: '#222',
    fontSize: fontSize.sm,
    fontWeight: fontWeight.bold,
  },

  // Name block
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: space.xs,
  },
  displayName: {
    fontSize: fontSize.xl,
    fontWeight: fontWeight.xbold,
    color: '#111',
    letterSpacing: letterSpacing.tight,
  },
  verifiedDot: {
    width: 10,
    height: 10,
    borderRadius: radius.full,
    backgroundColor: colors.bluePrimary,
    marginLeft: 8,
    marginTop: 2,
  },
  username: {
    fontSize: fontSize.sm,
    color: '#888',
    opacity: 0.44,
    marginBottom: space.sm,
    fontWeight: fontWeight.regular,
    marginTop: space.xs,
  },
  bio: {
    fontSize: fontSize.sm,
    color: '#333',
    opacity: 0.72,
    lineHeight: fontSize.sm * 1.5,
    marginBottom: space.md,
    fontWeight: fontWeight.regular,
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
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: '#111',
  },
  followLabel: {
    fontSize: fontSize.base,
    color: '#888',
    opacity: 0.44,
    fontWeight: fontWeight.regular,
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
    backgroundColor: '#F1F5F9',
    gap: 6,
  },
  actionChipLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.medium,
    color: '#333',
  },

  // Tabs
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: space.lg,
    marginTop: space.sm,
  },
  tab: {
    paddingBottom: space.md,
    marginRight: space.xl,
    position: 'relative',
  },
  tabLabel: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.medium,
    color: '#A0A0A8',
  },
  tabLabelActive: {
    color: '#111',
    fontWeight: fontWeight.bold,
  },
  tabUnderline: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 2.5,
    backgroundColor: colors.bluePrimary,
    borderRadius: 2,
  },
  tabBorder: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.06)',
    marginBottom: space.md,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: space.xs,
    paddingHorizontal: space.xs,
  },
  // Post grid cards — shadow.low + border.subtle
  card: {
    width: CARD_WIDTH,
    borderRadius: radius.md,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.04)',
    shadowColor: shadow.low.shadowColor,
    shadowOffset: shadow.low.shadowOffset,
    shadowOpacity: shadow.low.shadowOpacity,
    shadowRadius: shadow.low.shadowRadius,
    elevation: shadow.low.elevation,
  },
  cardImg: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#D7D7D7',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
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
    backgroundColor: '#FFFFFF',
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
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
    color: '#111',
    letterSpacing: letterSpacing.tight,
  },
  settingsSectionLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#A0A0A8',
    letterSpacing: letterSpacing.wider,
    textTransform: 'uppercase',
    paddingHorizontal: space.lg,
    paddingTop: space.base,
    paddingBottom: space.sm,
  },
  settingsCard: {
    backgroundColor: '#fff',
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
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    color: '#111',
  },
  settingsValue: {
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    color: '#A0A0A8',
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
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
    marginBottom: space.base,
  },
  logoutText: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: '#EF4444',
  },
  version: {
    textAlign: 'center',
    fontSize: 12,
    color: '#BBB',
  },

  // Edit Profile modal
  editProfileSheetWrap: {
    maxHeight: '85%',
    justifyContent: 'flex-end',
  },
  // Edit profile bottom sheet — shadow.high per spec
  editProfileSheet: {
    backgroundColor: '#FFFFFF',
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
    backgroundColor: colors.blueDeep,
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
    color: '#fff',
  },
  photoOptionLabel: {
    fontSize: fontSize.base,
    fontWeight: fontWeight.bold,
    color: colors.bluePrimary,
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
    fontSize: fontSize.sm,
    color: '#888',
    fontWeight: fontWeight.medium,
  },
  editProfileLabel: {
    fontSize: fontSize.xs,
    fontWeight: fontWeight.bold,
    color: '#888',
    letterSpacing: letterSpacing.wide,
    textTransform: 'uppercase',
    marginBottom: space.sm,
    marginTop: space.md,
  },
  editProfileInput: {
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
    fontSize: fontSize.base,
    color: '#111',
    backgroundColor: '#fff',
  },
  usernameInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.08)',
    borderRadius: radius.md,
    backgroundColor: '#fff',
    paddingLeft: space.md,
  },
  usernamePrefix: {
    fontSize: fontSize.base,
    color: '#888',
    fontWeight: fontWeight.medium,
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
    backgroundColor: colors.bluePrimary,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveProfileBtnText: {
    color: '#fff',
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
});
