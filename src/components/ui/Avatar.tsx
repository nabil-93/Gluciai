import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';

import { colors } from '@/theme';

/**
 * User avatar — shows the uploaded photo when available, otherwise a
 * colored circle with the first letter of the name (deterministic color
 * per name, like WhatsApp / Gmail). Purely presentational.
 */

// A small, on-brand palette; the letter picks one deterministically so the
// same name always gets the same color.
const PALETTE = [
  colors.primary,
  colors.ai,
  colors.carbs,
  colors.warning,
  '#EC4899', // pink
  '#0EA5E9', // sky
  '#14B8A6', // teal
  '#8B5CF6', // violet
];

function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

export function Avatar({
  name,
  uri,
  size = 44,
  style,
  ring = false,
}: {
  name?: string | null;
  uri?: string | null;
  size?: number;
  style?: ViewStyle | ViewStyle[];
  /** Draw a subtle white ring around the avatar (for photo-over-color) */
  ring?: boolean;
}) {
  const letter = (name?.trim()?.[0] ?? '?').toUpperCase();
  const bg = colorFor(name || 'user');
  const radius = size / 2;

  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: radius,
          backgroundColor: bg,
        },
        ring && styles.ring,
        styles.center,
        style as ViewStyle,
      ]}
    >
      {uri ? (
        <Image
          source={{ uri }}
          style={{ width: size, height: size, borderRadius: radius }}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <Text style={[styles.letter, { fontSize: size * 0.42 }]}>{letter}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ring: { borderWidth: 2, borderColor: '#FFFFFF' },
  letter: { color: '#FFFFFF', fontWeight: '800' },
});
