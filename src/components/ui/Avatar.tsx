import React from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Svg, { Path } from 'react-native-svg';

import { colors } from '@/theme';

/** Friendly person silhouette shown when there's no photo and no name. */
function PersonGlyph({ size }: { size: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path
        d="M12 12.4a3.7 3.7 0 1 0 0-7.4 3.7 3.7 0 0 0 0 7.4Z"
        fill="#ffffff"
      />
      <Path
        d="M5 19.2c0-3.4 3.1-5.4 7-5.4s7 2 7 5.4"
        stroke="#ffffff"
        strokeWidth={2}
        strokeLinecap="round"
        fill="none"
      />
    </Svg>
  );
}

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
  const firstChar = name?.trim()?.[0];
  const letter = firstChar ? firstChar.toUpperCase() : null;
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
      ) : letter ? (
        <Text style={[styles.letter, { fontSize: size * 0.42 }]}>{letter}</Text>
      ) : (
        <PersonGlyph size={size * 0.62} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ring: { borderWidth: 2, borderColor: '#FFFFFF' },
  letter: { color: '#FFFFFF', fontWeight: '800' },
});
