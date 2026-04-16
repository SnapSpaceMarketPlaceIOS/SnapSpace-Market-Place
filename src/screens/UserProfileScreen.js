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
import Svg, { Path, Circle, Polyline, Rect } from 'react-native-svg';
import { colors as C } from '../constants/theme';
import { typeScale, radius, space, shadow, fontSize, fontWeight, letterSpacing } from '../constants/tokens';
import { VerifiedBadge } from '../components/VerifiedBadge';
import CardImage from '../components/CardImage';
import Skeleton from '../components/Skeleton';
import LensLoader from '../components/LensLoader';
import PressableCard from '../components/PressableCard';
import { useAuth } from '../context/AuthContext';
// Like functionality is on ShopTheLookScreen (when user taps into a post)
import {
  getUserProfileData,
  getUserPublicDesigns,
  checkIsFollowing,
  followUser,
  unfollowUser,
} from '../services/supabase';

const { width } = Dimensions.get('window');
const BANNER_HEIGHT = 210;

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
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={5} r={1} fill="#111" />
      <Circle cx={12} cy={12} r={1} fill="#111" />
      <Circle cx={12} cy={19} r={1} fill="#111" />
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

  // Load profile + follow state
  useEffect(() => {
    if (!rawUsername) return;
    setProfileLoading(true);
    getUserProfileData(rawUsername)
      .then(data => {
        setProfile(data);
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
    getUserPublicDesigns(profile.id, 20, 0)
      .then(rows => {
        setDesigns(rows.map(d => ({
          id: d.id,
          imageUrl: d.image_url,
          prompt: d.prompt,
          styleTags: d.style_tags,
          products: d.products,
          likes: d.likes,
          title: d.prompt || 'Untitled',
          styles: d.style_tags || [],
          tags: (d.style_tags || []).map(s => `#${s}`),
          isUserDesign: true,
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
  const initial = (profile?.full_name || profile?.username || rawUsername || '?').charAt(0).toUpperCase();
  const hasAvatar = !!profile?.avatar_url;

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
          {profile?.banner_url ? (
            <CardImage uri={profile.banner_url} style={styles.bannerImage} resizeMode="cover" />
          ) : (
            <View style={styles.bannerGradient} />
          )}
          <SafeAreaView style={styles.navRow}>
            <TouchableOpacity style={styles.navBtn} onPress={() => navigation?.goBack()} activeOpacity={0.7}>
              <BackIcon />
            </TouchableOpacity>
            <TouchableOpacity style={styles.navBtn} activeOpacity={0.7}>
              <DotsIcon />
            </TouchableOpacity>
          </SafeAreaView>
        </View>

        {/* ── Profile Header ── */}
        <View style={styles.profileHeader}>
          {/* Avatar row — avatar overlaps banner, Follow floats right */}
          <View style={styles.avatarRow}>
            <View style={styles.avatarWrap}>
              <View style={styles.avatar}>
                <View style={styles.avatarInner}>
                  {hasAvatar ? (
                    <CardImage uri={profile.avatar_url} style={styles.avatarImage} resizeMode="cover" />
                  ) : (
                    <Text style={styles.avatarInitial}>{initial}</Text>
                  )}
                </View>
              </View>
            </View>

            {/* Follow button — hidden for own profile */}
            {!isOwnProfile && (
              <TouchableOpacity
                style={[styles.followBtn, isFollowing && styles.followingBtn]}
                onPress={handleFollow}
                disabled={followLoading || !currentUser}
                activeOpacity={0.7}
              >
                {followLoading
                  ? <LensLoader size={18} color={isFollowing ? C.primary : '#fff'} light={isFollowing ? '#67ACE9' : '#fff'} />
                  : <Text style={[styles.followBtnText, isFollowing && styles.followingBtnText]}>
                      {isFollowing ? 'Following' : 'Follow'}
                    </Text>
                }
              </TouchableOpacity>
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

          {/* Followers / Following — inline row matching ProfileScreen */}
          <View style={styles.followRow}>
            <TouchableOpacity
              style={styles.followItem}
              onPress={() => profile?.id && navigation?.navigate('FollowList', { userId: profile.id, initialTab: 'followers', name: profile?.full_name || rawUsername })}
              activeOpacity={0.7}
            >
              <Text style={styles.followValue}>{formatCount(profile?.follower_count || 0)}</Text>
              <Text style={styles.followLabel}> Followers</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.followItem, { marginLeft: space.lg }]}
              onPress={() => profile?.id && navigation?.navigate('FollowList', { userId: profile.id, initialTab: 'following', name: profile?.full_name || rawUsername })}
              activeOpacity={0.7}
            >
              <Text style={styles.followValue}>{formatCount(profile?.following_count || 0)}</Text>
              <Text style={styles.followLabel}> Following</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Tab bar ── */}
        <View style={styles.tabsRow}>
          <View style={styles.tabsLeft}>
            <TouchableOpacity style={styles.tab} activeOpacity={0.7}>
              <Text style={styles.tabLabelActive}>Posts</Text>
              <View style={styles.tabUnderline} />
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.tabBorder} />

        {/* ── Posts Grid ── */}
        {designsLoading ? (
          <View style={[styles.grid, { paddingHorizontal: space.lg, paddingTop: space.base }]}>
            {[0,1,2,3].map(i => (
              <View key={i} style={{ width: '50%', padding: 1 }}>
                <Skeleton width="100%" height={160} radius="image" />
              </View>
            ))}
          </View>
        ) : designs.length === 0 ? (
          <View style={styles.emptyGrid}>
            <Text style={styles.emptyGridTitle}>No public posts yet</Text>
            <Text style={styles.emptyGridSub}>
              When this creator shares designs, they'll appear here.
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {designs.map(post => (
              <View key={post.id} style={{ width: '50%', padding: 1 }}>
                <PressableCard
                  style={styles.card}
                  animStyle={{ width: '100%' }}
                  onPress={() => navigation?.navigate('ShopTheLook', { design: post })}
                >
                  <View style={styles.cardImg}>
                    <CardImage uri={post.imageUrl} style={styles.cardImgPhoto} resizeMode="cover" />
                  </View>
                </PressableCard>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// ── Styles — mirrors ProfileScreen layout exactly ────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.white,
  },

  // Banner — same height as ProfileScreen
  banner: {
    height: BANNER_HEIGHT,
    position: 'relative',
    overflow: 'hidden',
  },
  bannerGradient: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#C5CED8',
  },
  bannerImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
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
    ...shadow.medium,
  },

  // Profile Header — matches ProfileScreen
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
  avatarWrap: {
    position: 'relative',
  },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: C.white,
    ...shadow.medium,
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
    color: C.white,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
    borderRadius: radius.full,
  },

  // Follow button
  followBtn: {
    backgroundColor: C.primary,
    borderRadius: radius.button,
    paddingHorizontal: 22,
    paddingVertical: 9,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    marginBottom: -14,
  },
  followingBtn: {
    backgroundColor: C.surface2,
    borderWidth: 1.5,
    borderColor: C.border,
  },
  followBtnText: {
    ...typeScale.button,
    fontFamily: 'Geist_600SemiBold',
    color: C.white,
  },
  followingBtnText: {
    color: C.textSecondary,
  },

  // Name block — matches ProfileScreen
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

  // Followers / Following — inline row, matches ProfileScreen
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

  // Tabs — matches ProfileScreen
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
  tab: {
    paddingBottom: space.md,
    marginRight: space.xl,
    position: 'relative',
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

  // Grid — matches ProfileScreen exactly
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
    color: C.textTertiary,
    textAlign: 'center',
    lineHeight: 20,
  },
  card: {
    width: '100%',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#ECEEF2',
  },
  cardImg: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: 8,
    overflow: 'hidden',
  },
  cardImgPhoto: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
});
