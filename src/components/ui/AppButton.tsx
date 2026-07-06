import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

import { colors, spacing } from '@/theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai';

interface AppButtonProps {
  label: string;
  onPress: () => void;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle | ViewStyle[];
}

/**
 * Bevel-style buttons. Primary is the signature ink-black rounded CTA
 * ("Continuer", "Mettre à jour"), secondary the light-grey pill.
 */
const variantStyles: Record<Variant, { bg: string; text: string; border?: string }> = {
  primary: { bg: colors.ink, text: '#FFFFFF' },
  secondary: { bg: colors.surface3, text: colors.text },
  ghost: { bg: 'transparent', text: colors.textSecondary },
  danger: { bg: colors.dangerDim, text: colors.danger },
  ai: { bg: colors.ai, text: '#FFFFFF' },
};

export function AppButton({
  label,
  onPress,
  variant = 'primary',
  disabled,
  loading,
  style,
}: AppButtonProps) {
  const v = variantStyles[variant];

  const handlePress = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    onPress();
  };

  return (
    <Pressable
      onPress={handlePress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: v.bg },
        v.border ? { borderWidth: 1, borderColor: v.border } : null,
        (disabled || loading) && { opacity: 0.4 },
        pressed && { opacity: 0.85 },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={v.text} />
      ) : (
        <Text style={[styles.label, { color: v.text }]}>{label}</Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    minHeight: 54,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.md,
  },
  label: {
    fontSize: 17,
    fontWeight: '700',
  },
});
