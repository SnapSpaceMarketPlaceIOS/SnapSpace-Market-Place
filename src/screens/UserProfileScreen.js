import React, { useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Polyline, Rect, LinearGradient, Defs, Stop } from 'react-native-svg';
import { colors } from '../constants/colors';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 48) / 2;
const BANNER_HEIGHT = 160;

// ── Icons ─────────────────────────────────────────────────────────────────────

function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function DotsIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={5} r={1} fill="#111" />
      <Circle cx={12} cy={12} r={1} fill="#111" />
      <Circle cx={12} cy={19} r={1} fill="#111" />
    </Svg>
  );
}

function ImagePlaceholderIcon({ size = 30 }) {
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

function ShareIcon({ size = 13 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="#444" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <Polyline points="16 6 12 2 8 6" />
      <Line x1={12} y1={2} x2={12} y2={15} />
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

// ── Static user data keyed by username ────────────────────────────────────────

const USER_DATA = {
  'alex.designs': {
    name: 'Alex Rivera',
    username: '@alex.designs',
    bio: 'Interior AI enthusiast. Minimalist living, warm palettes. Every space tells a story.',
    location: 'Los Angeles, CA',
    verified: true,
    followers: '4.2K',
    following: 312,
    posts: 38,
    totalLikes: '18.4K',
    specialties: ['#Minimalist', '#Scandi', '#WarmTones', '#LivingRoom'],
    avatarColor: '#035DA8',
  },
  'home.by.mia': {
    name: 'Mia Chen',
    username: '@home.by.mia',
    bio: 'Luxury interiors, editorial styling. Turning AI prompts into dream spaces.',
    location: 'New York, NY',
    verified: true,
    followers: '11.8K',
    following: 204,
    posts: 94,
    totalLikes: '61.2K',
    specialties: ['#Luxury', '#GoldAccents', '#FormalDining', '#Velvet'],
    avatarColor: '#8B5CF6',
  },
  'spacesby.jo': {
    name: 'Jordan Hayes',
    username: '@spacesby.jo',
    bio: 'Rustic meets modern. Lover of copper, raw wood & farmhouse kitchens.',
    location: 'Austin, TX',
    verified: false,
    followers: '2.9K',
    following: 489,
    posts: 27,
    totalLikes: '9.1K',
    specialties: ['#Rustic', '#Farmhouse', '#CopperAccents', '#Kitchen'],
    avatarColor: '#D97706',
  },
  'green.interiors': {
    name: 'Sage Williams',
    username: '@green.interiors',
    bio: 'Plants are furniture. Biophilic design advocate & nature-forward living.',
    location: 'Portland, OR',
    verified: true,
    followers: '7.6K',
    following: 133,
    posts: 56,
    totalLikes: '34.7K',
    specialties: ['#Biophilic', '#Plants', '#NaturalLight', '#HomeOffice'],
    avatarColor: '#059669',
  },
  'nordic.spaces': {
    name: 'Nora Lindqvist',
    username: '@nordic.spaces',
    bio: 'Hygge & hjem. Bringing Scandinavian warmth to every room.',
    location: 'Seattle, WA',
    verified: false,
    followers: '3.4K',
    following: 267,
    posts: 41,
    totalLikes: '14.2K',
    specialties: ['#Scandi', '#Hygge', '#WarmWood', '#Cozy'],
    avatarColor: '#0891B2',
  },
  'darkmode.design': {
    name: 'Devon Black',
    username: '@darkmode.design',
    bio: 'Drama & luxury. Dark rooms, bold choices, unforgettable spaces.',
    location: 'Chicago, IL',
    verified: true,
    followers: '9.1K',
    following: 88,
    posts: 73,
    totalLikes: '42.3K',
    specialties: ['#DarkLuxe', '#Navy', '#Gold', '#Bedroom'],
    avatarColor: '#1E1B4B',
  },
  'wabi.studio': {
    name: 'Wabi Studio',
    username: '@wabi.studio',
    bio: 'Imperfect. Impermanent. Incomplete. Wabi-sabi for the modern home.',
    location: 'San Francisco, CA',
    verified: true,
    followers: '6.3K',
    following: 201,
    posts: 48,
    totalLikes: '22.8K',
    specialties: ['#WabiSabi', '#Japandi', '#Ceramics', '#Dining'],
    avatarColor: '#78716C',
  },
  'retro.rooms': {
    name: 'Retro Rooms',
    username: '@retro.rooms',
    bio: 'Mid-century modern obsessive. Eames, teak & sunbursts forever.',
    location: 'Palm Springs, CA',
    verified: false,
    followers: '5.7K',
    following: 344,
    posts: 62,
    totalLikes: '28.5K',
    specialties: ['#MidCentury', '#Teak', '#Retro', '#Orange'],
    avatarColor: '#B45309',
  },
};

const FALLBACK_USER = {
  name: 'SnapSpace Creator',
  username: '@creator',
  bio: 'AI-powered interior design enthusiast.',
  location: 'United States',
  verified: false,
  followers: '1.2K',
  following: 156,
  posts: 14,
  totalLikes: '4.8K',
  specialties: ['#AIGenerated', '#InteriorDesign'],
  avatarColor: colors.bluePrimary,
};

const SAMPLE_POSTS = Array.from({ length: 9 }, (_, i) => ({ id: i + 1 }));

// ── Component ─────────────────────────────────────────────────────────────────

export default function UserProfileScreen({ navigation, route }) {
  const rawUsername = route?.params?.username ?? '';
  const user = USER_DATA[rawUsername] ?? { ...FALLBACK_USER, username: `@${rawUsername}` };

  const [following, setFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [liked, setLiked] = useState({});

  const tabs = ['Posts', 'Saved'];

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={true}>

        {/* ── Banner ── */}
        <View style={styles.banner}>
          <View style={[styles.bannerGradient, { backgroundColor: user.avatarColor }]}>
            <View style={styles.bannerOverlay} />
          </View>

          {/* Nav row overlaid on banner */}
          <SafeAreaView style={styles.navRow}>
            <TouchableOpacity style={styles.navBtn} onPress={() => navigation?.goBack()}>
              <BackIcon />
            </TouchableOpacity>
            <TouchableOpacity style={styles.navBtn}>
              <DotsIcon />
            </TouchableOpacity>
          </SafeAreaView>
        </View>

        {/* ── Avatar + Header info ── */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarRow}>
            {/* Avatar */}
            <View style={[styles.avatar, { borderColor: '#fff' }]}>
              <View style={[styles.avatarInner, { backgroundColor: user.avatarColor }]}>
                <Text style={styles.avatarInitial}>
                  {user.name.charAt(0).toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Follow / Message */}
            <View style={styles.headerActions}>
              <TouchableOpacity
                style={[styles.followBtn, following && styles.followingBtn]}
                onPress={() => setFollowing(f => !f)}
              >
                <Text style={[styles.followBtnText, following && styles.followingBtnText]}>
                  {following ? 'Following' : 'Follow'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.messageBtn}>
                <Text style={styles.messageBtnText}>Message</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Name + verified + username */}
          <View style={styles.nameRow}>
            <Text style={styles.displayName}>{user.name}</Text>
            {user.verified && (
              <View style={{ marginLeft: 6, marginTop: 2 }}>
                <VerifiedIcon />
              </View>
            )}
          </View>
          <Text style={styles.username}>{user.username}</Text>

          {/* Bio */}
          <Text style={styles.bio}>{user.bio}</Text>

          {/* Location */}
          <Text style={styles.location}>📍 {user.location}</Text>

          {/* Specialty tags */}
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.tagsScroll}
            contentContainerStyle={{ gap: 7 }}
          >
            {user.specialties.map(tag => (
              <View key={tag} style={styles.specialtyTag}>
                <Text style={styles.specialtyTagText}>{tag}</Text>
              </View>
            ))}
          </ScrollView>

          {/* Stats */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user.posts}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user.followers}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user.following}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{user.totalLikes}</Text>
              <Text style={styles.statLabel}>Likes</Text>
            </View>
          </View>
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

        {/* ── Posts Grid ── */}
        <View style={styles.grid}>
          {SAMPLE_POSTS.map(post => (
            <TouchableOpacity
              key={post.id}
              style={styles.card}
              activeOpacity={0.88}
            >
              <View style={styles.cardImg}>
                <ImagePlaceholderIcon size={28} />
                <View style={styles.cardActions}>
                  <TouchableOpacity
                    style={styles.cardActionBtn}
                    onPress={() => setLiked(p => ({ ...p, [post.id]: !p[post.id] }))}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <HeartIcon filled={!!liked[post.id]} size={12} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.cardActionBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <ShareIcon size={12} />
                  </TouchableOpacity>
                </View>
              </View>
            </TouchableOpacity>
          ))}
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
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
  },
  bannerGradient: {
    ...StyleSheet.absoluteFillObject,
    opacity: 0.85,
  },
  bannerOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.18)',
  },
  navRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 4,
  },

  // Profile Header
  profileHeader: {
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  avatarRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: -44,
    marginBottom: 12,
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    fontSize: 34,
    fontWeight: '800',
    color: '#fff',
  },
  headerActions: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  followBtn: {
    backgroundColor: colors.bluePrimary,
    borderRadius: 22,
    paddingHorizontal: 22,
    paddingVertical: 9,
  },
  followingBtn: {
    backgroundColor: '#F4F4F6',
    borderWidth: 1.5,
    borderColor: '#DDD',
  },
  followBtnText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '700',
  },
  followingBtnText: {
    color: '#555',
  },
  messageBtn: {
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: '#DDD',
    backgroundColor: '#fff',
  },
  messageBtnText: {
    color: '#333',
    fontSize: 13,
    fontWeight: '600',
  },

  // Name block
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  displayName: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.5,
  },
  username: {
    fontSize: 13,
    color: '#888',
    marginBottom: 10,
    fontWeight: '500',
  },
  bio: {
    fontSize: 14,
    color: '#444',
    lineHeight: 20,
    marginBottom: 6,
  },
  location: {
    fontSize: 12,
    color: '#999',
    marginBottom: 12,
  },

  // Specialty tags
  tagsScroll: {
    marginBottom: 16,
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  specialtyTag: {
    backgroundColor: 'rgba(11,109,195,0.1)',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  specialtyTagText: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.bluePrimary,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFF',
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 11,
    color: '#999',
    marginTop: 3,
    fontWeight: '500',
  },
  statDivider: {
    width: 1,
    backgroundColor: '#E8E8E8',
    marginVertical: 4,
  },

  // Tabs
  tabsRow: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 8,
  },
  tab: {
    paddingBottom: 12,
    marginRight: 24,
    position: 'relative',
  },
  tabLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#A0A0A8',
  },
  tabLabelActive: {
    color: '#111',
    fontWeight: '700',
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
    height: 1.5,
    backgroundColor: '#EBEBEB',
    marginBottom: 14,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingHorizontal: 14,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 14,
    overflow: 'hidden',
  },
  cardImg: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#D7D7D7',
    borderRadius: 14,
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
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
});
