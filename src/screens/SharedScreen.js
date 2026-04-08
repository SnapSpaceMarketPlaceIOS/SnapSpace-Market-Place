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
import Svg, { Path, Circle, Line, Polyline } from 'react-native-svg';
import { colors as C } from '../constants/theme';
import { typeScale, radius, space } from '../constants/tokens';
import { useShared } from '../context/SharedContext';
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

function SharedIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={C.primary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={18} cy={5} r={3} />
      <Circle cx={6} cy={12} r={3} />
      <Circle cx={18} cy={19} r={3} />
      <Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
      <Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
    </Svg>
  );
}

function EmptySharedIcon() {
  return (
    <Svg width={52} height={52} viewBox="0 0 24 24" fill="none" stroke="#DDD" strokeWidth={1.2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={18} cy={5} r={3} />
      <Circle cx={6} cy={12} r={3} />
      <Circle cx={18} cy={19} r={3} />
      <Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
      <Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
    </Svg>
  );
}

export default function SharedScreen({ navigation }) {
  const { shared } = useShared();
  const sharedItems = DESIGNS.filter(d => shared[d.id]);

  return (
    <View style={styles.container}>
      <SafeAreaView>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <BackIcon />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Shared</Text>
          <View style={styles.headerRight}>
            <SharedIcon />
            <Text style={styles.headerCount}>{sharedItems.length}</Text>
          </View>
        </View>
      </SafeAreaView>

      {sharedItems.length === 0 ? (
        <View style={styles.emptyState}>
          <EmptySharedIcon />
          <Text style={styles.emptyTitle}>Nothing shared yet</Text>
          <Text style={styles.emptySubtitle}>
            Tap the share icon on any design to share it and track it here
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
          <Text style={styles.countLabel}>
            {sharedItems.length} {sharedItems.length === 1 ? 'design' : 'designs'}
          </Text>

          <View style={styles.grid}>
            {sharedItems.map(design => (
              <TouchableOpacity
                key={design.id}
                style={styles.cell}
                activeOpacity={0.88}
                onPress={() => navigation.navigate('ShopTheLook', { design })}
              >
                <View style={styles.cellImg}>
                  <CardImage uri={design.imageUrl} style={styles.cellPhoto} placeholderColor="#D0D7E3" />
                  <View style={styles.sharedBadge}>
                    <SharedIcon />
                  </View>
                </View>
                <Text style={styles.cellTitle} numberOfLines={1}>{design.title}</Text>
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
    color: C.primary,
  },

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
  cellTitle: {
    ...typeScale.micro,
    fontFamily: 'KantumruyPro_600SemiBold',
    color: C.textPrimary,
    textTransform: undefined,
    paddingHorizontal: 4,
    paddingTop: 4,
    paddingBottom: 2,
  },
  sharedBadge: {
    position: 'absolute',
    bottom: 7,
    right: 7,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },

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
