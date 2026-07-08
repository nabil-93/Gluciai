import React, { useRef } from 'react';
import {
  Animated,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Line, Path } from 'react-native-svg';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

import { isRTL } from '@/i18n';
import { colors } from '@/theme';
import { useTabBarScroll } from './TabBarVisibility';

/**
 * Floating dark pill navigation — from the "barriere / Bottom Nav Bar"
 * design (Instagram-style). One near-black rounded pill holds the 4 tabs
 * AND the green + button as a 5th column; a translucent white pill slides
 * behind the active tab.
 *
 * Scroll behavior: instead of collapsing to a lone circle, the WHOLE bar
 * settles — it shrinks slightly and the labels fade out, leaving icons
 * only (exactly like Instagram); scrolling back up restores full size
 * with labels.
 */

// True iOS-26 frosted glass. The look comes from a REAL backdrop blur of
// the content behind the bar, plus a thin COOL tint (slightly blue-grey,
// not pure white), a hairline white border and a very soft shadow. The
// active tab is glass-in-glass (a second translucent capsule), never a
// flat grey fill.
const GLASS_TINT = 'rgba(244,247,255,0.18)'; // cool, low-opacity
const PILL_BG = 'rgba(255,255,255,0.20)'; // glass capsule on the active tab
const PILL_BORDER = 'rgba(255,255,255,0.35)';
const BAR_BORDER = 'rgba(255,255,255,0.28)';
const ICON_ACTIVE = '#1B1C1F';
const ICON_IDLE = 'rgba(27,28,31,0.82)';
/** Punch-through color for the journal book's text lines (reads as bar bg). */
const LINE_COL = '#EDEDF0';
/** 4 tabs + the + button = 5 equal columns, like the design's grid. */
const COLS = 5;

const TABS = [
  { name: 'index', labelKey: 'tabs.home' },
  { name: 'journal', labelKey: 'tabs.journal' },
  { name: 'activity', labelKey: 'tabs.activity' },
  { name: 'biology', labelKey: 'tabs.biology' },
] as const;

/** Exact glyphs from the barriere design file (filled, 24×24). */
function TabIcon({ name, color }: { name: string; color: string }) {
  switch (name) {
    case 'index':
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill={color}>
          <Path d="M11.35 2.7 a1 1 0 0 1 1.3 0 L21 9.9 a1 1 0 0 1 0.35 0.76 V20 a1.6 1.6 0 0 1 -1.6 1.6 H14.9 v-5.7 a2.9 2.9 0 0 0 -5.8 0 v5.7 H4.25 A1.6 1.6 0 0 1 2.65 20 V10.66 A1 1 0 0 1 3 9.9 Z" />
        </Svg>
      );
    case 'journal':
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill={color}>
          <Path d="M7 2 H18 a2.2 2.2 0 0 1 2.2 2.2 V16 a2 2 0 0 1 -2 2 H7.1 a1.35 1.35 0 0 0 0 2.7 H19.2 a0.9 0.9 0 0 1 0 1.8 H7.1 A3.6 3.6 0 0 1 3.5 18.9 V5.5 A3.5 3.5 0 0 1 7 2 Z" />
          <Line x1={8.3} y1={7} x2={15.5} y2={7} stroke={LINE_COL} strokeWidth={1.6} strokeLinecap="round" />
          <Line x1={8.3} y1={10.6} x2={15.5} y2={10.6} stroke={LINE_COL} strokeWidth={1.6} strokeLinecap="round" />
        </Svg>
      );
    case 'activity':
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill={color}>
          <Path d="M13.49 5.48c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2 2zM9.89 19.38l1-4.4 2.1 2v6h2v-7.5l-2.1-2 .6-3c1.3 1.5 3.3 2.5 5.5 2.5v-2c-1.9 0-3.5-1-4.3-2.4l-1-1.6c-.4-.6-1-1-1.7-1-.3 0-.5.1-.8.1l-5.2 2.2v4.7h2v-3.4l1.8-.7-1.6 8.1-4.9-1-.4 2 7 1.4z" />
        </Svg>
      );
    default: // biology — heart
      return (
        <Svg width={24} height={24} viewBox="0 0 24 24" fill={color}>
          <Path d="M12 21 C12 21 3 15.6 3 9.3 A4.9 4.9 0 0 1 12 6.2 A4.9 4.9 0 0 1 21 9.3 C21 15.6 12 21 12 21 Z" />
        </Svg>
      );
  }
}

interface TabRoute {
  key: string;
  name: string;
}
interface BevelTabBarProps {
  state: { index: number; routes: TabRoute[] };
  descriptors: Record<string, { options: { title?: string } }>;
  navigation: any;
}

export function BevelTabBar({ state, navigation }: BevelTabBarProps) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const rtl = isRTL(i18n.language);
  const { visible, expand } = useTabBarScroll();

  const routeNames = state.routes.map((r) => r.name);
  const activeName = state.routes[state.index]?.name;
  const activeIndex = Math.max(0, TABS.findIndex((tb) => tb.name === activeName));

  // `settled` = the bar has shrunk (scrolled down): labels are REMOVED from
  // layout so the bar is physically shorter (icons only). It flips back the
  // moment the user scrolls up, so the labels reappear as the bar grows.
  const [settled, setSettled] = React.useState(false);
  React.useEffect(() => {
    const id = visible.addListener(({ value }) => setSettled(value < 0.5));
    return () => visible.removeListener(id);
  }, [visible]);

  const onPressTab = (key: string) => {
    const targetIndex = state.routes.findIndex((r) => r.name === key);
    if (targetIndex === -1) return;
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    expand(); // tapping while settled restores the full bar
    const route = state.routes[targetIndex];
    const focused = state.index === targetIndex;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) navigation.navigate(key);
  };

  const fabScale = useRef(new Animated.Value(1)).current;
  const onPressAdd = () => {
    if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/add-menu');
  };

  // ── Sliding active pill (translucent grey, like the design) ──
  // Must match styles.inner padding so the pill lines up with each column.
  const INNER_PAD = 6;
  const [innerWidth, setInnerWidth] = React.useState(0);
  const colWidth = innerWidth > 0 ? innerWidth / COLS : 0;
  const pillX = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (colWidth === 0) return;
    // In RTL the row is mirrored: tab i sits in visual column (COLS-1-i),
    // with the + button occupying the left-most slot.
    const visualIndex = rtl ? COLS - 1 - activeIndex : activeIndex;
    Animated.spring(pillX, {
      toValue: INNER_PAD + visualIndex * colWidth,
      useNativeDriver: true,
      speed: 15,
      bounciness: 8,
    }).start();
  }, [activeIndex, colWidth, pillX, rtl]);

  // ── Settle-on-scroll: on scroll-down the bar shrinks and sinks toward the
  //    edge (native-driver spring, buttery). The labels are removed from
  //    layout via `settled` (below) so the bar also gets physically shorter.
  const barScale = visible.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] });
  const barShift = visible.interpolate({ inputRange: [0, 1], outputRange: [14, 0] });
  // Labels fade out slightly ahead of unmounting for a soft transition.
  const labelOpacity = visible.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [0, 0, 1],
  });

  return (
    <View
      pointerEvents="box-none"
      style={[styles.wrap, { paddingBottom: Math.min(insets.bottom, 10) + 10 }]}
    >
      <Animated.View
        style={[
          styles.bar,
          { transform: [{ translateY: barShift }, { scale: barScale }] },
        ]}
      >
        {/* Real backdrop blur of the content behind the bar. Intensity is
            deliberately LOW so it doesn't add a heavy white wash — the blur
            does the work, the cool tint below adds the glass color. */}
        <BlurView
          intensity={22}
          tint="systemUltraThinMaterialLight"
          style={styles.blur}
        >
        {/* Thin cool tint overlay (blue-grey) — this is the glass color. */}
        <View pointerEvents="none" style={styles.tint} />
        <View
          style={styles.inner}
          onLayout={(e) => setInnerWidth(e.nativeEvent.layout.width - INNER_PAD * 2)}
        >
          {/* Sliding translucent pill behind the active tab */}
          {colWidth > 0 ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.activePill,
                { width: colWidth, transform: [{ translateX: pillX }] },
              ]}
            />
          ) : null}

          {TABS.map((tab) => {
            const focused = activeName === tab.name;
            const disabled = !routeNames.includes(tab.name);
            const color = focused ? ICON_ACTIVE : ICON_IDLE;
            return (
              <Pressable
                key={tab.name}
                onPress={() => onPressTab(tab.name)}
                style={styles.tab}
                disabled={disabled}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={t(tab.labelKey)}
              >
                <TabIcon name={tab.name} color={color} />
                {/* Labels are unmounted while settled so the bar physically
                    shrinks to icons-only, and reappear as it grows back. */}
                {!settled ? (
                  <Animated.Text
                    numberOfLines={1}
                    style={[styles.label, { color, opacity: labelOpacity }]}
                  >
                    {t(tab.labelKey)}
                  </Animated.Text>
                ) : null}
              </Pressable>
            );
          })}

          {/* Green + button — 5th column, inside the bar like the design */}
          <View style={styles.fabSlot}>
            <Pressable
              onPress={onPressAdd}
              onPressIn={() =>
                Animated.spring(fabScale, { toValue: 0.9, useNativeDriver: true, speed: 40, bounciness: 8 }).start()
              }
              onPressOut={() =>
                Animated.spring(fabScale, { toValue: 1, useNativeDriver: true, speed: 40, bounciness: 8 }).start()
              }
              accessibilityRole="button"
              accessibilityLabel={t('tabs.add')}
            >
              <Animated.View style={[styles.fab, { transform: [{ scale: fabScale }] }]}>
                <Svg width={20} height={20} viewBox="0 0 24 24">
                  <Path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />
                </Svg>
              </Animated.View>
            </Pressable>
          </View>
        </View>
        </BlurView>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 18,
  },
  bar: {
    borderRadius: 999,
    // No opaque fill — the BlurView is the glass. Just a VERY soft shadow
    // for depth (point 5), plus a real web backdrop-filter with saturation
    // so the blurred content stays vivid (point 1 & 3).
    ...Platform.select({
      web: {
        boxShadow: '0 10px 30px rgba(0,0,0,0.08)',
        backdropFilter: 'blur(28px) saturate(180%)',
        WebkitBackdropFilter: 'blur(28px) saturate(180%)',
      },
      default: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.1,
        shadowRadius: 30,
        elevation: 12,
      },
    }),
  },
  blur: {
    borderRadius: 999,
    overflow: 'hidden',
    // Hairline white border — the glass rim (point 4).
    borderWidth: 1,
    borderColor: BAR_BORDER,
  },
  // Thin cool blue-grey tint over the blur — the glass color (point 2).
  tint: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: GLASS_TINT,
  },
  inner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    position: 'relative',
  },
  activePill: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 0,
    // Glass-in-glass: a second translucent white capsule with its own faint
    // white rim, not a flat grey fill (point 6).
    borderRadius: 21,
    backgroundColor: PILL_BG,
    borderWidth: 1,
    borderColor: PILL_BORDER,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    gap: 2,
    minWidth: 0,
    zIndex: 1,
  },
  label: {
    fontSize: 10,
    fontWeight: '700',
    overflow: 'hidden',
  },
  fabSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.45,
    shadowRadius: 14,
    elevation: 10,
  },
});
