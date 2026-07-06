import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle } from 'react-native';

import { colors, radius, shadows, spacing } from '@/theme';

interface BevelCardProps {
  children: React.ReactNode;
  style?: ViewStyle | ViewStyle[];
  onPress?: () => void;
  /** Override background (e.g. a gradient wrapper passes transparent) */
  tint?: string;
  /** Remove default padding (for edge-to-edge content) */
  noPadding?: boolean;
}

/**
 * The Bevel signature surface: a near-white rounded card floating on the
 * #F2F2F6 background with a soft layered ambient shadow.
 */
export function BevelCard({
  children,
  style,
  onPress,
  tint,
  noPadding,
}: BevelCardProps) {
  const cardStyle = [
    styles.card,
    noPadding && { padding: 0 },
    tint ? { backgroundColor: tint } : null,
    style,
  ];

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          ...cardStyle,
          pressed && { opacity: 0.85 },
        ]}
      >
        {children}
      </Pressable>
    );
  }
  return <View style={cardStyle}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.lg,
    ...shadows.card,
  },
});
