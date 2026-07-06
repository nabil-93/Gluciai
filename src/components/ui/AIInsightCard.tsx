import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { colors, radius, spacing, typography } from '@/theme';

interface AIInsightCardProps {
  title: string;
  message: string;
}

export function AIInsightCard({ title, message }: AIInsightCardProps) {
  return (
    <LinearGradient
      colors={['rgba(91,157,255,0.16)', 'rgba(91,157,255,0.05)']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={styles.card}
    >
      <View style={styles.header}>
        <View style={styles.iconWrap}>
          <Ionicons name="sparkles" size={16} color={colors.ai} />
        </View>
        <Text style={styles.title}>{title}</Text>
      </View>
      <Text style={styles.message}>{message}</Text>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(91,157,255,0.25)',
    padding: spacing.lg,
    gap: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.aiDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    ...typography.bodyMedium,
    color: colors.ai,
  },
  message: {
    ...typography.body,
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
  },
});
