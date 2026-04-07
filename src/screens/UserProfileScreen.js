import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Polyline, LinearGradient, Defs, Stop } from 'react-native-svg';
import { colors as C } from '../constants/theme';
import { typeScale, radius, space } from '../constants/tokens';
import { VerifiedBadge } from '../components/VerifiedBadge';
import CardImage from '../components/CardImage';
import LensLoader from '../components/LensLoader';
import { useAuth } from '../context/AuthContext';
import {
  getUserProfileData,
  getUserPublicDesigns,
  checkIsFollowing,
  followUser,
  unfollowUser,
} from '../services/supabase';

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
    <Svg width={16} height={16} viewBox="0 0 24 24" fill={C.primary} stroke="none">
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
  avatarColor: C.primary,
};

function formatCount(n) {
  if (n >= 1000) return (n / 1000).toFixed(n >= 10000 ? 0 : 1).replace('.0', '') + 'K';
  return String(n);
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UserProfileScreen({ navigation, route }) {
  const rawUsername = route?.params?.username ?? '';
  const { user: currentUser } = useAuth();

  const [profile, setProfile] = useState(null);
  const [designs, setDesigns] = useState([]);
  const [profileLoading, setProfileLoading] = useState(true);
  const [designsLoading, setDesignsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTab, setActiveTab] = useState(0);
  const [liked, setLiked] = useState({});

  const tabs = ['Posts'];

  // Load profile + follow state
  useEffect(() => {
    if (!rawUsername) return;
    setProfileLoading(true);

    getUserProfileData(rawUsername)
      .then(data => {
        setProfile(data);
        // Check follow state if signed in and not viewing own profile
        if (currentUser?.id && data?.id && currentUser.id !== data.id) {
          return checkIsFollowing(currentUser.id, data.id).then(setIsFollowing);
        }
      })
      .catch(err => console.warn('[UserProfile] load failed:', err.message))
      .finally(() => setProfileLoading(false));
  }, [rawUsername, currentUser?.id]);

  // Load public designs
  useEffect(() => {
    if (!profile?.id) return;
    setDesignsLoading(true);
    getUserPublicDesigns(profile.id, 12, 0)
      .then(rows => {
        setDesigns(rows.map(d => ({
          id: d.id,
          imageUrl: d.image_url,
          prompt: d.prompt,
          styleTags: d.style_tags,
          products: d.products,
          likes: d.likes,
          title: d.prompt || 'Untitled',
        })));
      })
      .catch(err => console.warn('[UserProfile] designs failed:', err.message))
      .finally(() => setDesignsLoading(false));
  }, [profile?.id]);

  const handleFollow = useCallback(async () => {
    if (!currentUser?.id || !profile?.id) return;
    setFollowLoading(true);
    try {
      if (isFollowing) {
        await unfollowUser(currentUser.id, profile.id);
        setIsFollowing(false);
        setProfile(p => p ? { ...p, follower_count: Math.max(0, (p.follower_count || 0) - 1) } : p);
      } else {
        await followUser(currentUser.id, profile.id);
        setIsFollowing(true);
        setProfile(p => p ? { ...p, follower_count: (p.follower_count || 0) + 1 } : p);
      }
    } catch (e) {
      console.warn('[Follow]', e.message);
    } finally {
      setFollowLoading(false);
    }
  }, [currentUser?.id, profile?.id, isFollowing]);

  const isOwnProfile = currentUser?.id && profile?.id && currentUser.id === profile.id;
  const avatarColor = '#035DA8';
  const initial = (profile?.full_name || profile?.username || rawUsername || '?').charAt(0).toUpperCase();

  if (profileLoading) {
    return (
      <View style={[styles.container, { alignItems: 'center', justifyContent: 'center' }]}>
        <LensLoader size={48} />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView showsVerticalScrollIndicator={false} bounces={true}>

        {/* ── Banner ── */}
        <View style={styles.banner}>
          <View style={[styles.bannerGradient, { backgroundColor: avatarColor }]}>
            <View style={styles.bannerOverlay} />
          </View>
          <SafeAreaView style={styles.navRow}>
            <TouchableOpacity style={styles.navBtn} onPress={() => navigation?.goBack()}>
              <BackIcon />
            </TouchableOpacity>
            <TouchableOpacity style={styles.navBtn}>
              <DotsIcon />
            </TouchableOpacity>
          </SafeAreaView>
        </View>

        {/* ── Avatar + Header ── */}
        <View style={styles.profileHeader}>
          <View style={styles.avatarRow}>
            <View style={[styles.avatar, { borderColor: '#fff' }]}>
              <View style={[styles.avatarInner, { backgroundColor: avatarColor }]}>
                <Text style={styles.avatarInitial}>{initial}</Text>
              </View>
            </View>

            {/* Follow button — hidden for own profile */}
            {!isOwnProfile && (
              <View style={styles.headerActions}>
                <TouchableOpacity
                  style={[styles.followBtn, isFollowing && styles.followingBtn]}
                  onPress={handleFollow}
                  disabled={followLoading || !currentUser}
                >
                  {followLoading
                    ? <LensLoader size={18} color={isFollowing ? C.primary : '#fff'} light={isFollowing ? '#67ACE9' : '#fff'} />
                    : <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
                        {isFollowing ? 'Following' : 'Follow'}
                      </Text>
                  }
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* Name + verified badge */}
          <View style={styles.nameRow}>
            <Text style={styles.displayName}>{profile?.full_name || rawUsername}</Text>
            {profile?.is_verified_supplier && (
              <View style={{ marginLeft: 6, marginTop: 2 }}>
                <VerifiedBadge size="md" />
              </View>
            )}
          </View>
          <Text style={styles.username}>@{profile?.username || rawUsername}</Text>

          {profile?.bio ? <Text style={styles.bio}>{profile.bio}</Text> : null}

          {/* Stats — tappable follower/following counts */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={styles.statValue}>{formatCount(profile?.design_count || 0)}</Text>
              <Text style={styles.statLabel}>Posts</Text>
            </View>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => profile?.id && navigation?.navigate('FollowList', { userId: profile.id, initialTab: 'followers', name: profile?.full_name || rawUsername })}
            >
              <Text style={styles.statValue}>{formatCount(profile?.follower_count || 0)}</Text>
              <Text style={styles.statLabel}>Followers</Text>
            </TouchableOpacity>
            <View style={styles.statDivider} />
            <TouchableOpacity
              style={styles.statItem}
              onPress={() => profile?.id && navigation?.navigate('FollowList', { userId: profile.id, initialTab: 'following', name: profile?.full_name || rawUsername })}
            >
              <Text style={styles.statValue}>{formatCount(profile?.following_count || 0)}</Text>
              <Text style={styles.statLabel}>Following</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Tab bar ── */}
        <View style={styles.tabsRow}>
          {tabs.map((tab, i) => (
            <TouchableOpacity key={tab} style={styles.tab} onPress={() => setActiveTab(i)} activeOpacity={0.7}>
              <Text style={[styles.tabLabel, activeTab === i && styles.tabLabelActive]}>{tab}</Text>
              {activeTab === i && <View style={styles.tabUnderline} />}
            </TouchableOpacity>
          ))}
        </View>
        <View style={styles.tabBorder} />

        {/* ── Posts Grid ── */}
        {designsLoading ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <LensLoader size={48} />
          </View>
        ) : designs.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Text style={{ color: C.textSecondary, fontSize: 14 }}>No public posts yet</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {designs.map(post => (
              <TouchableOpacity
                key={post.id}
                style={styles.card}
                activeOpacity={0.88}
                onPress={() => navigation?.navigate('ShopTheLook', { design: post })}
              >
                <View style={styles.cardImg}>
                  <CardImage uri={post.imageUrl} style={styles.cardPhoto} resizeMode="cover" />
                  <View style={styles.cardActions}>
                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => setLiked(p => ({ ...p, [post.id]: !p[post.id] }))}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <HeartIcon filled={!!liked[post.id]} size={12} />
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
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
    width: 44,
    height: 44,
    borderRadius: radius.full,
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
    backgroundColor: C.primary,
    borderRadius: radius.button,
    paddingHorizontal: 22,
    paddingVertical: 9,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followingBtn: {
    backgroundColor: C.surface2,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  followBtnText: {
    ...typeScale.button,
    color: C.white,
  },
  followingBtnText: {
    color: C.textSecondary,
  },
  messageBtn: {
    borderRadius: radius.button,
    paddingHorizontal: 18,
    paddingVertical: 9,
    minHeight: 36,
    borderWidth: 1.5,
    borderColor: C.border,
    backgroundColor: C.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageBtnText: {
    ...typeScale.button,
    color: C.textPrimary,
  },

  // Name block
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  displayName: {
    ...typeScale.title,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.5,
  },
  username: {
    ...typeScale.caption,
    color: C.textSecondary,
    marginBottom: 10,
  },
  bio: {
    ...typeScale.body,
    color: C.textSecondary,
    marginBottom: 6,
  },
  location: {
    ...typeScale.caption,
    color: C.textTertiary,
    marginBottom: 12,
  },

  // Specialty tags
  tagsScroll: {
    marginBottom: 16,
    marginHorizontal: -20,
    paddingHorizontal: 20,
  },
  specialtyTag: {
    backgroundColor: C.primaryLight,
    borderRadius: radius.full,
    paddingHorizontal: 12,
    paddingVertical: 5,
  },
  specialtyTagText: {
    ...typeScale.caption,
    fontWeight: '600',
    color: C.primary,
  },

  // Stats
  statsRow: {
    flexDirection: 'row',
    backgroundColor: C.surface,
    borderRadius: 16,
    paddingVertical: 14,
    marginBottom: 4,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    ...typeScale.headline,
    fontWeight: '800',
    color: C.textPrimary,
    letterSpacing: -0.3,
  },
  statLabel: {
    ...typeScale.micro,
    color: C.textTertiary,
    marginTop: 3,
    textTransform: undefined,
  },
  statDivider: {
    width: 1,
    backgroundColor: C.border,
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
    ...typeScale.body,
    color: C.textTertiary,
  },
  tabLabelActive: {
    ...typeScale.body,
    color: C.textPrimary,
    fontWeight: '700',
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
    height: 1.5,
    backgroundColor: C.border,
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
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  cardImg: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: C.surface2,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  cardPhoto: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
    borderRadius: radius.md,
  },
  cardPhotoFallback: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: C.surface2,
    borderRadius: radius.md,
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
