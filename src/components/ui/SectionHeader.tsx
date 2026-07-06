import React from 'react';
import { Pressable, StyleSheet, Text, View, ViewStyle } from 'react-native';

import { colors, typography } from '@/theme';

interface SectionHeaderProps {
  title: string;
  /** Show the red "−" remove chip in edit mode */
  editing?: boolean;
  onRemove?: () => void;
  /** Optional trailing action (e.g. a "+" or chevron) */
  trailing?: React.ReactNode;
  onTrailingPress?: () => void;
  style?: ViewStyle;
}

export function SectionHeader({
  title,
  editing,
  onRemove,
  trailing,
  onTrailingPress,
  style,
}: SectionHeaderProps) {
  return (
    <View style={[styles.row, style]}>
      {editing && onRemove ? (
        <Pressable onPress={onRemove} style={styles.removeChip} hitSlop={8}>
          <View style={styles.removeBar} />
        </Pressable>
      ) : null}
      <Text style={styles.title}>{title}</Text>
      <View style={{ flex: 1 }} />
      {trailing ? (
        <Pressable onPress={onTrailingPress} hitSlop={8}>
          {trailing}
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginHorizontal: 2,
  },
  title: { ...typography.section },
  removeChip: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeBar: {
    width: 12,
    height: 2.5,
    borderRadius: 2,
    backgroundColor: '#fff',
  },
});
