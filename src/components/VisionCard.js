import React from 'react';
import { TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { colors } from '../constants/colors';
import { fontSize, fontWeight, radius, space } from '../constants/tokens';
import Svg, { Path } from 'react-native-svg';

export default function VisionCard({ title, icon, tall, onPress, style }) {
  return (
    <TouchableOpacity
      style={[styles.card, tall && styles.cardTall, style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.iconWrap}>
        {icon}
      </View>
      <Text style={styles.title}>{title}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.heroStart,
    borderRadius: radius.xl,
    padding: space.lg,
    justifyContent: 'flex-end',
    minHeight: 130,
  },
  cardTall: {
    minHeight: 274,
  },
  iconWrap: {
    marginBottom: space.md,
  },
  title: {
    color: colors.white,
    fontSize: fontSize.md,
    fontWeight: fontWeight.bold,
  },
});
