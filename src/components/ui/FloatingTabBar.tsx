import React from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import { colors, radius, shadows, spacing, typography } from '@/theme';

const TAB_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  index: 'home',
  history: 'time',
  chat: 'sparkles',
  profile: 'person',
};

// Kept loose on purpose: expo-router vendors its own bottom-tabs types,
// which conflict with @react-navigation/bottom-tabs' published ones.
interface TabRoute {
  key: string;
  name: string;
}
interface FloatingTabBarProps {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: any;
}

export function FloatingTabBar({ state, descriptors, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const routes = state.routes.filter((r) => TAB_ICONS[r.name]);
  const half = Math.ceil(routes.length / 2);

  const renderTab = (route: (typeof routes)[number]) => {
    const index = state.routes.findIndex((r) => r.key === route.key);
    const focused = state.index === index;
    const { options } = descriptors[route.key];
    const label = options.title ?? route.name;

    const onPress = () => {
      if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      }
      const event = navigation.emit({
        type: 'tabPress',
        target: route.key,
        canPreventDefault: true,
      });
      if (!focused && !event.defaultPrevented) {
        navigation.navigate(route.name);
      }
    };

    return (
      <Pressable key={route.key} onPress={onPress} style={styles.tab}>
        <View style={[styles.tabInner, focused && styles.tabFocused]}>
          <Ionicons
            name={TAB_ICONS[route.name]}
            size={21}
            color={focused ? colors.text : colors.textTertiary}
          />
          <Text style={[styles.tabLabel, focused && { color: colors.text }]}>
            {label}
          </Text>
        </View>
      </Pressable>
    );
  };

  const openScanner = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push('/scan');
  };

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}
    >
      <BlurView intensity={40} tint="dark" style={styles.capsule}>
        {routes.slice(0, half).map(renderTab)}
        <Pressable onPress={openScanner} style={styles.scanButton}>
          <Ionicons name="scan" size={26} color={colors.textOnPrimary} />
        </Pressable>
        {routes.slice(half).map(renderTab)}
      </BlurView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(29,31,38,0.92)',
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    overflow: 'hidden',
    ...shadows.floating,
  },
  tab: {
    borderRadius: radius.full,
  },
  tabInner: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
    minWidth: 58,
  },
  tabFocused: {
    backgroundColor: colors.surface3,
  },
  tabLabel: {
    ...typography.caption,
    fontSize: 10,
    color: colors.textTertiary,
  },
  scanButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: spacing.xs,
    ...shadows.card,
  },
});
