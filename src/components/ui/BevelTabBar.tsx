import React, { useRef } from 'react';
import {
  Animated,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import * as Haptics from 'expo-haptics';

import { isRTL } from '@/i18n';
import { colors, shadows } from '@/theme';
import { useTabBarScroll } from './TabBarVisibility';

/**
 * Official bottom navigation — icons come straight from the design
 * system (assets/icons/*-active.png / *-inactive.png), never redrawn.
 * Active = green #19C37D, inactive = #111827 @ 50%, add = green disc.
 */

const ICONS = {
  index: {
    active: require('../../assets/design/icons/home-active.png'),
    inactive: require('../../assets/design/icons/home-inactive.png'),
  },
  journal: {
    active: require('../../assets/design/icons/journal-active.png'),
    inactive: require('../../assets/design/icons/journal-inactive.png'),
  },
  activity: {
    active: require('../../assets/design/icons/activity-active.png'),
    inactive: require('../../assets/design/icons/activity-inactive.png'),
  },
} as const;

/** Heart drawn as SVG — the biology PNG was clipped at the top. */
function HeartIcon({ active }: { active: boolean }) {
  const color = active ? colors.primary : 'rgba(17,24,39,0.5)';
  return (
    <Svg width={23} height={23} viewBox="0 0 24 24">
      <Path
        d="M12 20.5S3.6 15 3.6 8.9C3.6 6 5.8 4 8.3 4c1.6 0 3 .9 3.7 2.1C12.7 4.9 14.1 4 15.7 4c2.5 0 4.7 2 4.7 4.9 0 6.1-8.4 11.6-8.4 11.6z"
        fill={active ? color : 'none'}
        stroke={color}
        strokeWidth={active ? 0 : 1.9}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

const TABS = [
  { name: 'index', labelKey: 'tabs.home' },
  { name: 'journal', labelKey: 'tabs.journal' },
  { name: 'activity', labelKey: 'tabs.activity' },
  { name: 'biology', labelKey: 'tabs.biology' },
] as const;

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

  // Track expanded/compact so the hidden full capsule stops catching taps
  const [expanded, setExpanded] = React.useState(true);
  React.useEffect(() => {
    const id = visible.addListener(({ value }) => setExpanded(value > 0.5));
    return () => visible.removeListener(id);
  }, [visible]);

  const routeNames = state.routes.map((r) => r.name);

  const onPressTab = (key: string) => {
    const targetIndex = state.routes.findIndex((r) => r.name === key);
    if (targetIndex === -1) return; // route not registered yet
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
    const route = state.routes[targetIndex];
    const focused = state.index === targetIndex;
    const event = navigation.emit({
      type: 'tabPress',
      target: route.key,
      canPreventDefault: true,
    });
    if (!focused && !event.defaultPrevented) {
      navigation.navigate(key);
    }
  };

  // FAB press spring
  const fabScale = useRef(new Animated.Value(1)).current;

  const onPressAdd = () => {
    if (Platform.OS !== 'web') {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
    router.push('/add-menu');
  };

  const activeName = state.routes[state.index]?.name;
  const activeTab =
    TABS.find((t) => t.name === activeName) ?? TABS[0];
  const activeIcon =
    activeTab.name !== 'biology'
      ? ICONS[activeTab.name as keyof typeof ICONS]
      : null;
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => t.name === activeName)
  );

  // Sliding green indicator: measure the tabs area, then spring the
  // highlight from one tab column to the next when the tab changes.
  const CAPSULE_PADDING = 6;
  const [tabsWidth, setTabsWidth] = React.useState(0);
  const colWidth = tabsWidth > 0 ? tabsWidth / TABS.length : 0;
  const indicatorX = useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (colWidth === 0) return;
    // In RTL the flex row lays the tabs out right-to-left, so the active
    // column's visual slot (measured from the capsule's left edge) is
    // mirrored: home (index 0) sits in the right-most slot.
    const visualIndex = rtl ? TABS.length - 1 - activeIndex : activeIndex;
    Animated.spring(indicatorX, {
      // + 4px so the narrower pill is centred inside the column
      toValue: CAPSULE_PADDING + 4 + visualIndex * colWidth,
      useNativeDriver: true,
      speed: 16,
      bounciness: 9,
    }).start();
  }, [activeIndex, colWidth, indicatorX, rtl]);

  // visible: 1 = full bar, 0 = compact (only active tab + add).
  // Full capsule fades/shrinks out, compact pill fades in — cross-fade.
  const fullOpacity = visible;
  const compactOpacity = visible.interpolate({
    inputRange: [0, 0.7, 1],
    outputRange: [1, 0, 0],
  });
  const fullScale = visible.interpolate({
    inputRange: [0, 1],
    outputRange: [0.96, 1],
  });
  const compactScale = visible.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.9],
  });

  const renderFab = () => (
    <Pressable
      onPress={onPressAdd}
      onPressIn={() =>
        Animated.spring(fabScale, {
          toValue: 0.88,
          useNativeDriver: true,
          speed: 40,
          bounciness: 8,
        }).start()
      }
      onPressOut={() =>
        Animated.spring(fabScale, {
          toValue: 1,
          useNativeDriver: true,
          speed: 40,
          bounciness: 8,
        }).start()
      }
      accessibilityRole="button"
      accessibilityLabel={t('tabs.add')}
    >
      <Animated.View
        style={[styles.addButton, { transform: [{ scale: fabScale }] }]}
      >
        <Svg width={25} height={25} viewBox="0 0 24 24">
          <Path
            d="M12 5v14M5 12h14"
            stroke="#ffffff"
            strokeWidth={2.6}
            strokeLinecap="round"
          />
        </Svg>
      </Animated.View>
    </Pressable>
  );

  return (
    <View
      pointerEvents="box-none"
      style={[
        styles.wrap,
        { paddingBottom: Math.max(insets.bottom, 8) + 10 },
      ]}
    >
      <View style={styles.row}>
        {/* Left side stacks the full capsule over the compact pill */}
        <View style={styles.leftStack}>
          {/* FULL capsule — 4 tabs */}
          <Animated.View
            pointerEvents={expanded ? 'auto' : 'none'}
            onLayout={(e) => setTabsWidth(e.nativeEvent.layout.width - CAPSULE_PADDING * 2)}
            style={[
              styles.capsule,
              { opacity: fullOpacity, transform: [{ scale: fullScale }] },
            ]}
          >
            {/* Sliding green highlight behind the active tab */}
            {colWidth > 0 ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.indicator,
                  {
                    width: colWidth - 8,
                    transform: [{ translateX: indicatorX }],
                  },
                ]}
              />
            ) : null}
            {TABS.map(({ name, labelKey }) => {
              const focused = activeName === name;
              const disabled = !routeNames.includes(name);
              const icon = ICONS[name as keyof typeof ICONS];
              const label = t(labelKey);
              return (
                <Pressable
                  key={name}
                  onPress={() => onPressTab(name)}
                  style={styles.tab}
                  disabled={disabled}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: focused }}
                  accessibilityLabel={label}
                >
                  {name === 'biology' ? (
                    <View style={styles.tabIcon}>
                      <HeartIcon active={focused} />
                    </View>
                  ) : (
                    <Image
                      source={focused ? icon!.active : icon!.inactive}
                      style={styles.tabIcon}
                      resizeMode="contain"
                    />
                  )}
                  <Text
                    style={[styles.label, focused && styles.labelActive]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </Animated.View>

          {/* COMPACT pill — only the active tab's icon in a round disc.
              Tapping it expands the bar back to full. */}
          <Animated.View
            pointerEvents={expanded ? 'none' : 'auto'}
            style={[
              styles.compactPill,
              rtl ? { left: undefined, right: 0 } : null,
              { opacity: compactOpacity, transform: [{ scale: compactScale }] },
            ]}
          >
            <Pressable
              onPress={expand}
              style={styles.compactInner}
              accessibilityRole="button"
              accessibilityLabel={t(activeTab.labelKey)}
            >
              {activeTab.name === 'biology' ? (
                <HeartIcon active />
              ) : activeIcon ? (
                <Image
                  source={activeIcon.active}
                  style={styles.compactIcon}
                  resizeMode="contain"
                />
              ) : null}
            </Pressable>
          </Animated.View>
        </View>

        {/* Green + button (always visible) */}
        {renderFab()}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 14,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  leftStack: {
    flex: 1,
    justifyContent: 'center',
  },
  capsule: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    paddingVertical: 9,
    paddingHorizontal: 6,
    position: 'relative',
    ...shadows.floating,
  },
  indicator: {
    position: 'absolute',
    top: 6,
    bottom: 6,
    left: 0,
    borderRadius: 20,
    backgroundColor: 'rgba(25,195,125,0.12)',
    borderWidth: 1.5,
    borderColor: 'rgba(25,195,125,0.35)',
  },
  compactPill: {
    position: 'absolute',
    left: 0,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.floating,
  },
  compactInner: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactIcon: { width: 24, height: 24 },
  tab: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 2,
    minWidth: 0,
  },
  tabIcon: { width: 23, height: 23 },
  label: {
    fontSize: 11.5,
    fontWeight: '600',
    color: 'rgba(17,24,39,0.5)',
  },
  labelActive: {
    color: colors.primary,
    fontWeight: '800',
  },
  addButton: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },
});
