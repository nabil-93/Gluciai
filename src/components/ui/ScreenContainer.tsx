import React from 'react';
import { ScrollView, StyleSheet, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, spacing } from '@/theme';

interface ScreenContainerProps {
  children: React.ReactNode;
  scroll?: boolean;
  style?: ViewStyle;
  /** Extra bottom padding so content clears the floating tab bar. */
  withTabBarSpace?: boolean;
}

export function ScreenContainer({
  children,
  scroll = true,
  style,
  withTabBarSpace = false,
}: ScreenContainerProps) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: insets.top + spacing.md,
    paddingBottom: withTabBarSpace ? 120 : insets.bottom + spacing.xl,
  };

  if (!scroll) {
    return (
      <View style={[styles.container, padding, style]}>{children}</View>
    );
  }
  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[styles.content, padding, style]}
      showsVerticalScrollIndicator={false}
    >
      {children}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
});
