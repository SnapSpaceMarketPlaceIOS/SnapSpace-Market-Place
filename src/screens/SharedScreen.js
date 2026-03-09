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
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={colors.bluePrimary} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={18} cy={5} r={3} />
      <Circle cx={6} cy={12} r={3} />
      <Circle cx={18} cy={19} r={3} />
      <Line x1={8.59} y1={13.51} x2={15.42} y2={17.49} />
      <Line x1={15.41} y1={6.51} x2={8.59} y2={10.49} />
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
              >
                <View style={styles.cellImg}>
                  <ImagePlaceholderIcon />
                  <View style={styles.sharedBadge}>
                    <SharedIcon />
                  </View>
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
    color: colors.bluePrimary,
  },

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
