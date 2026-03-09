import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Path, Circle, Line, Polyline, Rect } from 'react-native-svg';
import { colors } from '../constants/colors';
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

function ImagePlaceholderIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke="#aaa" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={3} y={3} width={18} height={18} rx={2} />
      <Circle cx={8.5} cy={8.5} r={1.5} />
      <Polyline points="21 15 16 10 5 21" />
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
              >
                <View style={styles.cellImg}>
                  <ImagePlaceholderIcon />
                  {/* Unlike button */}
                  <TouchableOpacity
                    style={styles.heartBtn}
                    onPress={() => toggleLiked(design.id)}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <HeartIcon filled={!!liked[design.id]} size={13} />
                  </TouchableOpacity>
                </View>
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
    backgroundColor: '#fff',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F4F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#111',
    letterSpacing: -0.3,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    width: 36,
    justifyContent: 'flex-end',
  },
  headerCount: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ef4444',
  },

  // Scroll
  scrollContent: {
    paddingTop: 14,
  },
  countLabel: {
    fontSize: 13,
    color: '#999',
    fontWeight: '500',
    paddingHorizontal: 16,
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
  },
  cellImg: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#D7D7D7',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
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

  // Empty state
  emptyState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    gap: 12,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#222',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#999',
    textAlign: 'center',
    lineHeight: 20,
  },
  browseBtn: {
    marginTop: 8,
    backgroundColor: colors.bluePrimary,
    borderRadius: 22,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  browseBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '700',
  },
});
