/**
 * DebugDiffScreen — Build 130
 *
 * Internal-only diagnostic for the AI generation pipeline. Shows side-by-side:
 *
 *   ┌─────────────┬─────────────┬─────────────┐
 *   │ Lifestyle   │ Panel Cell  │ Cart Info   │
 *   │ (imageUrl)  │ (panelImg)  │ (asin/$$$)  │
 *   └─────────────┴─────────────┴─────────────┘
 *
 * For each product in the most recent generation. Reveals where the
 * imageUrl ↔ panelImageUrl ↔ cart fields disagree, which is exactly the
 * failure mode Build 130 targets.
 *
 * Reached by long-pressing the "Your Design" header on RoomResult in __DEV__
 * mode. Not user-facing in production builds (the gesture is dead unless
 * __DEV__ is true).
 *
 * Route params:
 *   products: Product[]  — same array RoomResult uses for the Shop Room strip
 *   prompt:   string     — the generation prompt (shown for context)
 */

import React from 'react';
import {
  View, Text, ScrollView, Image, StyleSheet, Pressable, Dimensions,
} from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors as C } from '../constants/theme';
import { space, radius, fontSize, fontWeight, typeScale } from '../constants/tokens';
import CardImage from '../components/CardImage';

const { width: W } = Dimensions.get('window');
const TILE_W = (W - space.lg * 2 - space.sm * 2) / 3;

export default function DebugDiffScreen() {
  const navigation = useNavigation();
  const route = useRoute();
  const products = route?.params?.products || [];
  const prompt = route?.params?.prompt || '';

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={10}>
          <Text style={styles.back}>← Close</Text>
        </Pressable>
        <Text style={styles.title}>Generation Diff</Text>
        <View style={{ width: 60 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Prompt</Text>
          <Text style={styles.metaValue} numberOfLines={3}>{prompt || '(none)'}</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Products in Shop Room</Text>
          <Text style={styles.metaValue}>{products.length}</Text>
        </View>

        <View style={styles.legendRow}>
          <View style={styles.legendCol}><Text style={styles.legendText}>Lifestyle{'\n'}(user sees)</Text></View>
          <View style={styles.legendCol}><Text style={styles.legendText}>Panel cell{'\n'}(FAL sees)</Text></View>
          <View style={styles.legendCol}><Text style={styles.legendText}>Cart{'\n'}info</Text></View>
        </View>

        {products.map((p, idx) => {
          const lifestyle = p.imageUrl || (p._matchedVariant && p._matchedVariant.mainImage) || null;
          const panel     = p.panelImageUrl || lifestyle;
          const variant   = p._matchedVariant;
          const same      = lifestyle && panel && lifestyle === panel;

          return (
            <View key={p.id || idx} style={styles.row}>
              <View style={styles.rowHeader}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {idx + 1}. {p.name || '(unnamed)'}
                </Text>
                <Text style={styles.rowMeta}>
                  {p.category} · {p.brand}{variant ? ` · variant: ${variant.label}` : ''}
                </Text>
              </View>

              <View style={styles.tilesRow}>
                <View style={styles.tile}>
                  <CardImage uri={lifestyle} style={styles.tileImage} />
                  <Text style={styles.tileLabel} numberOfLines={1}>{shortUrl(lifestyle)}</Text>
                </View>

                <View style={styles.tile}>
                  <CardImage uri={panel} style={styles.tileImage} />
                  <Text style={[styles.tileLabel, !same && styles.tileLabelDiff]} numberOfLines={1}>
                    {same ? '= same as lifestyle' : shortUrl(panel)}
                  </Text>
                </View>

                <View style={[styles.tile, styles.cartTile]}>
                  <Text style={styles.cartTitle}>${(p.price || 0).toFixed(2)}</Text>
                  <Text style={styles.cartLine} numberOfLines={1}>asin: {p.asin || '(none)'}</Text>
                  <Text style={styles.cartLine} numberOfLines={2}>{p.brand}</Text>
                  {variant ? (
                    <Text style={styles.cartLineVariant} numberOfLines={1}>
                      → {variant.label}
                    </Text>
                  ) : null}
                </View>
              </View>

              <View style={styles.scoreRow}>
                {p._score != null && <Text style={styles.scoreText}>score: {p._score.toFixed(1)}</Text>}
                {p._breakdown && (
                  <Text style={styles.scoreText} numberOfLines={1}>
                    s:{(p._breakdown.style || 0).toFixed(1)} c:{(p._breakdown.color || 0).toFixed(1)} m:{(p._breakdown.material || 0).toFixed(1)} v:{(p._breakdown.variantAffinity || 0).toFixed(1)}
                  </Text>
                )}
              </View>
            </View>
          );
        })}

        <View style={{ height: space['3xl'] }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function shortUrl(url) {
  if (!url) return '(none)';
  try {
    const u = new URL(url);
    return u.hostname + u.pathname.split('/').pop();
  } catch {
    return url.substring(0, 30);
  }
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: space.lg, paddingVertical: space.sm,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  back: { ...typeScale.button, color: C.primary },
  title: { ...typeScale.title, color: C.textPrimary },
  content: { paddingHorizontal: space.lg, paddingTop: space.base },

  metaRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: space.xs,
    borderBottomWidth: 1, borderBottomColor: C.surface,
  },
  metaLabel: { ...typeScale.caption, color: C.textSecondary, flex: 1 },
  metaValue: { ...typeScale.caption, color: C.textPrimary, flex: 2, textAlign: 'right' },

  legendRow: {
    flexDirection: 'row', marginTop: space.lg, marginBottom: space.sm,
    gap: space.sm,
  },
  legendCol: { flex: 1, alignItems: 'center' },
  legendText: {
    ...typeScale.micro, color: C.textTertiary, textAlign: 'center',
  },

  row: {
    marginVertical: space.sm,
    paddingVertical: space.sm,
    borderTopWidth: 1, borderTopColor: C.surface,
  },
  rowHeader: { marginBottom: space.xs },
  rowName: { ...typeScale.headline, color: C.textPrimary },
  rowMeta: { ...typeScale.caption, color: C.textSecondary, marginTop: 2 },

  tilesRow: { flexDirection: 'row', gap: space.sm },
  tile: { width: TILE_W },
  tileImage: {
    width: TILE_W, height: TILE_W,
    borderRadius: radius.md, backgroundColor: C.surface,
  },
  tileLabel: {
    ...typeScale.micro, marginTop: space.xs, color: C.textSecondary,
  },
  tileLabelDiff: { color: C.primary, fontWeight: fontWeight.semibold },

  cartTile: {
    backgroundColor: C.surface, borderRadius: radius.md,
    padding: space.sm, height: TILE_W, justifyContent: 'space-between',
  },
  cartTitle: { ...typeScale.price, color: C.textPrimary },
  cartLine: { ...typeScale.caption, color: C.textSecondary },
  cartLineVariant: { ...typeScale.caption, color: C.primary, fontWeight: fontWeight.semibold },

  scoreRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.xs },
  scoreText: { ...typeScale.micro, color: C.textTertiary },
});
