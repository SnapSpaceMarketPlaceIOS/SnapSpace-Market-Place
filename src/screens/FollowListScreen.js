import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  FlatList,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polyline } from 'react-native-svg';
import { colors as C } from '../constants/theme';
import { space, radius, typeScale } from '../constants/tokens';
import { getFollowers, getFollowing } from '../services/supabase';

const AVATAR_COLORS = ['#035DA8','#8B5CF6','#059669','#D97706','#DC2626','#0891B2','#BE185D','#0F766E'];
function avatarColor(name = '') {
  const c = (name || '').charCodeAt(0) || 0;
  return AVATAR_COLORS[c % AVATAR_COLORS.length];
}

function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function UserRow({ item, onPress }) {
  const initial = (item.full_name || item.username || '?').charAt(0).toUpperCase();
  const color = avatarColor(item.full_name || item.username);
  return (
    <TouchableOpacity style={s.row} activeOpacity={0.7} onPress={onPress}>
      <View style={[s.avatar, { backgroundColor: color }]}>
        <Text style={s.avatarText}>{initial}</Text>
      </View>
      <View style={s.rowInfo}>
        <Text style={s.rowName} numberOfLines={1}>{item.full_name || item.username || 'SnapSpace User'}</Text>
        {item.username ? <Text style={s.rowUsername} numberOfLines={1}>@{item.username}</Text> : null}
      </View>
      <TouchableOpacity style={s.followBtn} activeOpacity={0.8}>
        <Text style={s.followBtnText}>Follow</Text>
      </TouchableOpacity>
    </TouchableOpacity>
  );
}

export default function FollowListScreen({ route, navigation }) {
  const { userId, initialTab = 'followers', name = '' } = route?.params ?? {};
  const [activeTab, setActiveTab] = useState(initialTab);
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (tab, isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    try {
      const fn = tab === 'followers' ? getFollowers : getFollowing;
      const data = await fn(userId, 100, 0);
      setList(data || []);
    } catch (e) {
      console.warn('[FollowList]', e.message);
      setList([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId]);

  useEffect(() => { load(activeTab); }, [activeTab, load]);

  const switchTab = (tab) => {
    if (tab === activeTab) return;
    setActiveTab(tab);
  };

  return (
    <SafeAreaView style={s.container} edges={['top']}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity style={s.backBtn} onPress={() => navigation?.goBack()}>
          <BackIcon />
        </TouchableOpacity>
        <Text style={s.headerTitle} numberOfLines={1}>{name || 'Profile'}</Text>
        <View style={{ width: 44 }} />
      </View>

      {/* Tabs */}
      <View style={s.tabs}>
        {['followers', 'following'].map(tab => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && s.tabActive]}
            onPress={() => switchTab(tab)}
            activeOpacity={0.7}
          >
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
      <View style={s.tabBorder} />

      {/* List */}
      {loading ? (
        <View style={s.center}>
          <ActivityIndicator size="large" color={C.primary} />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <UserRow
              item={item}
              onPress={() => navigation?.navigate('UserProfile', { username: item.username })}
            />
          )}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(activeTab, true)} tintColor={C.primary} />}
          ListEmptyComponent={
            <View style={s.center}>
              <Text style={s.emptyText}>
                {activeTab === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
              </Text>
            </View>
          }
          ItemSeparatorComponent={() => <View style={s.separator} />}
          contentContainerStyle={list.length === 0 && { flex: 1 }}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyText: { ...typeScale.body, color: C.textSecondary, textAlign: 'center' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.base,
    paddingVertical: space.md,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typeScale.title,
    color: C.textPrimary,
    flex: 1,
    textAlign: 'center',
  },

  tabs: {
    flexDirection: 'row',
    paddingHorizontal: space.base,
    gap: space.base,
  },
  tab: {
    paddingBottom: space.sm,
    paddingHorizontal: space.xs,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
  },
  tabActive: {
    borderBottomColor: C.primary,
  },
  tabText: {
    ...typeScale.headline,
    color: C.textSecondary,
  },
  tabTextActive: {
    color: C.primary,
  },
  tabBorder: {
    height: 1,
    backgroundColor: C.border,
    marginHorizontal: space.base,
    marginBottom: space.xs,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: space.base,
    paddingVertical: space.md,
    gap: space.md,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  rowInfo: {
    flex: 1,
  },
  rowName: {
    ...typeScale.headline,
    color: C.textPrimary,
  },
  rowUsername: {
    ...typeScale.caption,
    color: C.textSecondary,
    marginTop: 2,
  },
  followBtn: {
    backgroundColor: C.primary,
    borderRadius: radius.button,
    paddingHorizontal: space.base,
    paddingVertical: 7,
  },
  followBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  separator: {
    height: 1,
    backgroundColor: C.border,
    marginLeft: 72,
  },
});
