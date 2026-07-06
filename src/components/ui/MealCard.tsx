import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';

import { GlassCard } from './GlassCard';
import { colors, radius, spacing, typography } from '@/theme';
import type { MealScan } from '@/types';

interface MealCardProps {
  meal: MealScan;
  carbsLabel: string;
  caloriesLabel: string;
  onPress?: () => void;
}

export function MealCard({ meal, carbsLabel, caloriesLabel, onPress }: MealCardProps) {
  const time = new Date(meal.created_at).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <GlassCard style={styles.card} onPress={onPress}>
      {meal.image_url ? (
        <Image source={{ uri: meal.image_url }} style={styles.image} contentFit="cover" />
      ) : (
        <View style={[styles.image, styles.imagePlaceholder]}>
          <Ionicons name="restaurant" size={22} color={colors.textTertiary} />
        </View>
      )}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>
          {meal.result.food_name}
        </Text>
        <Text style={styles.time}>{time}</Text>
        <View style={styles.macros}>
          <Text style={styles.macro}>
            <Text style={styles.macroValue}>{Math.round(meal.result.carbohydrates)}g</Text>{' '}
            {carbsLabel}
          </Text>
          <Text style={styles.macro}>
            <Text style={styles.macroValue}>{Math.round(meal.result.calories)}</Text>{' '}
            {caloriesLabel}
          </Text>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  image: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
  },
  imagePlaceholder: {
    backgroundColor: colors.surface3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: { flex: 1, gap: 2 },
  name: { ...typography.bodyMedium },
  time: { ...typography.caption, color: colors.textTertiary },
  macros: { flexDirection: 'row', gap: spacing.md, marginTop: 2 },
  macro: { ...typography.caption },
  macroValue: { color: colors.primary, fontWeight: '600' },
});
