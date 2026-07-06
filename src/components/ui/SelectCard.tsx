import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, shadows, spacing } from '@/theme';

interface SelectCardProps {
  label: string;
  description?: string;
  emoji?: string;
  selected: boolean;
  onPress: () => void;
}

/**
 * Bevel-style selectable row: white floating card + trailing radio.
 * Selected state = ink ring with ink dot (like the prototype's
 * "Statut d'activité" options).
 */
export function SelectCard({ label, description, emoji, selected, onPress }: SelectCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        selected && styles.selected,
        pressed && { opacity: 0.85 },
      ]}
    >
      {emoji ? (
        <View style={styles.emojiWrap}>
          <Text style={styles.emoji}>{emoji}</Text>
        </View>
      ) : null}
      <View style={styles.textWrap}>
        <Text style={styles.label}>{label}</Text>
        {description ? <Text style={styles.description}>{description}</Text> : null}
      </View>
      <View style={[styles.radio, selected && styles.radioOn]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
    padding: 14,
    ...shadows.card,
  },
  selected: {
    borderColor: colors.ink,
  },
  emojiWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: { fontSize: 20 },
  textWrap: { flex: 1, gap: 2, minWidth: 0 },
  label: { fontSize: 16, fontWeight: '600', color: colors.text },
  description: { fontSize: 13.5, color: colors.textSecondary },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: '#D6D6DB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioOn: { borderColor: colors.ink },
  radioDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: colors.ink,
  },
});
