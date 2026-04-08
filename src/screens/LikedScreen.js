import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import CardImage from '../components/CardImage';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Polyline } from 'react-native-svg';
import { colors as C } from '../constants/theme';
import { typeScale, radius, space } from '../constants/tokens';
import { useLiked } from '../context/LikedContext';
import { DESIGNS } from '../data/designs';

const { width } = Dimensions.get('window');
const CARD_WIDTH = (width - 3) / 3;

function BackIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#111" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Polyline points="15 18 9 12 15 6" />
    </Svg>
  );
}

function HeartIcon({ filled = false, size = 14 }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#ef4444' : 'none'} stroke={filled ? '#ef4444' : '#fff'} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

function EmptyHeartIcon() {
  return (
    <Svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke="#DDD" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </Svg>
  );
}

export default function LikedScreen({ navigation }) {
  const { liked, toggleLiked } = useLiked();
  const likedItems = DESIGNS.filter(d => liked[d.id]);

  const handleCardPress = (design) => {
    navigation.navigate('ShopTheLook', { design });
  };

  return (
    <View style={styles.container}>
      <SafeAreaView>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <BackIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Liked</Text>
          <View style={styles.headerRight}>
            <HeartIcon filled size={18} />
            <Text style={styles.headerCount}>{likedItems.length}</Text>
          </View>
        </View>
      </SafeAreaView>

      {likedItems.length === 0 ? (
        /* Empty state */
        <View style={styles.emptyState}>
          <EmptyHeartIcon />
          <Text style={styles.emptyTitle}>No liked designs yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap the heart on any design to save it here
          </Text>
          <TouchableOpacity
            style={styles.browseBtn}
            onPress={() => navigation.navigate('Main', { screen: 'Explore' })}
            activeOpacity={0.8}
          >
            <Text style={styles.browseBtnText}>Browse Designs</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          {/* Count label */}
          <Text style={styles.countLabel}>
            {likedItems.length} {likedItems.length === 1 ? 'design' : 'designs'}
          </Text>

          {/* 3-column grid */}
          <View style={styles.grid}>
            {likedItems.map(design => (
              <TouchableOpacity
                key={design.id}
                style={styles.cell}
                activeOpacity={0.88}
                onPress={() => handleCardPress(design)}
              >
                <View style={styles.cellImg}>
                  <CardImage uri={design.imageUrl} style={styles.cellPhoto} placeholderColor="#D0D7E3" />
                  {/* Unlike button */}
                  <TouchableOpacity
                    style={styles.heartBtn}
                    onPress={() => toggleLiked(design.id)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <HeartIcon filled={!!liked[design.id]} size={13} />
                  </TouchableOpacity>
                </View>
                <Text style={styles.cellTitle} numberOfLines={1}>{design.title}</Text>
                <Text style={styles.cellSeller} numberOfLines={1}>@{design.seller}</Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={{ height: 40 }} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: C.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: C.border,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.full,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    ...typeScale.title,
    fontFamily: 'KantumruyPro_700Bold',
    color: C.textPrimary,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    width: 44,
    justifyContent: 'flex-end',
  },
  headerCount: {
    ...typeScale.button,
    fontWeight: '700',
    fontFamily: 'KantumruyPro_700Bold',
    color: C.destructive,
  },

  // Scroll
  scrollContent: {
    paddingTop: 14,
  },
  countLabel: {
    ...typeScale.caption,
    fontFamily: 'KantumruyPro_400Regular',
    color: C.textSecondary,
    paddingHorizontal: space.base,
    marginBottom: 10,
  },

  // Grid
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 1.5,
  },
  cell: {
    width: CARD_WIDTH,
    marginBottom: 4,
  },
  cellImg: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: C.surface2,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  cellPhoto: {
    width: '100%',
    height: '100%',
  },
  cellPhotoFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: C.surface2,
  },
  heartBtn: {
    position: 'absolute',
    bottom: 7,
    right: 7,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellTitle: {
    ...typeScale.micro,
    fontFamily: 'KantumruyPro_600SemiBold',
    color: C.textPrimary,
    textTransform: undefined,
    paddingHorizontal: 4,
    paddingTop: 4,
  },
  cellSeller: {
    ...typeScale.caption,
    fontFamily: 'KantumruyPro_400Regular',
    color: C.textSecondary,
    paddingHorizontal: 4,
    paddingBottom: 2,
  },

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    ...typeScale.title,
    fontFamily: 'KantumruyPro_700Bold',
    color: C.textPrimary,
    marginTop: 8,
  },
  emptySubtitle: {
    ...typeScale.body,
    fontFamily: 'KantumruyPro_400Regular',
    color: C.textSecondary,
    textAlign: 'center',
  },
  browseBtn: {
    marginTop: 8,
    backgroundColor: C.primary,
    borderRadius: radius.button,
    paddingHorizontal: 28,
    paddingVertical: 12,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  browseBtnText: {
    ...typeScale.button,
    fontFamily: 'KantumruyPro_600SemiBold',
    color: C.white,
  },
});
