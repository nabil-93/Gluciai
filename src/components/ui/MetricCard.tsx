import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { GlassCard } from './GlassCard';
import { colors, spacing, typography } from '@/theme';

interface MetricCardProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  unit?: string;
  tint?: string;
  subtitle?: string;
  onPress?: () => void;
}

export function MetricCard({
  icon,
  label,
  value,
  unit,
  tint = colors.primary,
  subtitle,
  onPress,
}: MetricCardProps) {
  return (
    <GlassCard style={styles.card} onPress={onPress}>
      <View style={[styles.iconWrap, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        <Text style={styles.value}>{value}</Text>
        {unit ? <Text style={styles.unit}>{unit}</Text> : null}
      </View>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    gap: spacing.sm,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    ...typography.caption,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
  },
  value: {
    ...typography.metric,
    fontSize: 26,
  },
  unit: {
    ...typography.caption,
    marginBottom: 4,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textTertiary,
  },
});
