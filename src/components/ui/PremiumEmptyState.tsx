import React from 'react';
import { StyleProp, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, shadows } from '@/theme';
import { AppButton } from './AppButton';
import { FadeInView } from './motion';

interface PremiumEmptyStateProps {
  emoji: string;
  title: string;
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  /** Bare = inside an already-carded area (no surface/shadow) */
  bare?: boolean;
  style?: StyleProp<ViewStyle>;
}

/**
 * Premium empty state: soft haloed emoji, clear title, guiding message
 * and an optional primary action toward the next step. Never leaves a
 * large blank space.
 */
export function PremiumEmptyState({
  emoji,
  title,
  message,
  actionLabel,
  onAction,
  bare,
  style,
}: PremiumEmptyStateProps) {
  return (
    <FadeInView style={[bare ? styles.bare : styles.card, style]}>
      <View style={styles.halo}>
        <Text style={styles.emoji}>{emoji}</Text>
      </View>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.message}>{message}</Text>
      {actionLabel && onAction ? (
        <AppButton label={actionLabel} onPress={onAction} style={styles.action} />
      ) : null}
    </FadeInView>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    paddingVertical: 34,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
    ...shadows.card,
  },
  bare: {
    paddingVertical: 30,
    paddingHorizontal: 24,
    alignItems: 'center',
    gap: 8,
  },
  halo: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emoji: { fontSize: 34 },
  title: { fontSize: 18, fontWeight: '750' as any, color: '#9B9BA1' },
  message: {
    fontSize: 15,
    lineHeight: 21,
    color: '#B7B7BE',
    textAlign: 'center',
    maxWidth: 300,
  },
  action: { alignSelf: 'stretch', marginTop: 12 },
});
