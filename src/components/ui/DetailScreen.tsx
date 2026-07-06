import React from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { colors, shadows } from '@/theme';
import { ChevronLeft, HomeGlyph, InfoCircle, PlusGlyph } from './icons';

interface DetailScreenProps {
  title: string;
  /** Screen + body background (defaults to the light app background) */
  background?: string;
  /** Dark surface theme for night screens (Sommeil) */
  dark?: boolean;
  /** Optional gradient hero rendered at the top, behind the fixed header */
  hero?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * Reusable shell for Bevel "detail" pages: a scrollable body with a
 * translucent floating header (back + tools) and a floating bottom bar
 * with the Add button. Optionally renders a gradient hero on top.
 */
export function DetailScreen({
  title,
  background = colors.background,
  dark = false,
  hero,
  children,
}: DetailScreenProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const headerBg = dark ? 'rgba(60,68,110,0.55)' : 'rgba(253,253,254,0.85)';
  const iconColor = dark ? '#fff' : colors.text;
  const barBg = dark ? '#1E2544' : colors.surface;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <View style={[styles.root, { backgroundColor: background }]}>
      <ScrollView
        style={styles.scroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 150 }}
      >
        {hero}
        {children}
      </ScrollView>

      {/* Fixed header */}
      <View style={[styles.header, { top: insets.top + 8 }]} pointerEvents="box-none">
        <Pressable
          onPress={goBack}
          style={[styles.roundBtn, { backgroundColor: headerBg }]}
        >
          <ChevronLeft color={iconColor} />
        </Pressable>
        <Text
          style={[
            styles.headerTitle,
            { color: dark ? '#fff' : colors.text },
          ]}
        >
          {title}
        </Text>
        <View style={[styles.toolPill, { backgroundColor: headerBg }]}>
          <InfoCircle size={19} color={iconColor} mark={dark ? '#3A4373' : '#fff'} />
        </View>
      </View>

      {/* Bottom fade + Add button */}
      <View
        style={[
          styles.bottomBar,
          { bottom: Math.max(insets.bottom, 12) + 16 },
        ]}
        pointerEvents="box-none"
      >
        <Pressable
          onPress={goBack}
          style={[styles.roundLg, { backgroundColor: barBg }, shadows.floating]}
        >
          <HomeGlyph color={dark ? '#fff' : '#141418'} />
        </Pressable>
        <Pressable
          onPress={goBack}
          style={[styles.roundLg, { backgroundColor: barBg }, shadows.floating]}
        >
          <PlusGlyph color={dark ? '#fff' : colors.ink} size={26} />
        </Pressable>
      </View>
    </View>
  );
}

/** Convenience gradient hero used by several detail pages */
export function GradientHero({
  colors: grad,
  height = 400,
  children,
}: {
  colors: string[];
  height?: number;
  children?: React.ReactNode;
}) {
  return (
    <LinearGradient
      colors={grad as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={{ height, overflow: 'hidden' }}
    >
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scroll: { flex: 1 },
  header: {
    position: 'absolute',
    left: 14,
    right: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 25,
  },
  roundBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headerTitle: {
    fontSize: 19,
    fontWeight: '700',
  },
  toolPill: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  bottomBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 20,
  },
  roundLg: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
