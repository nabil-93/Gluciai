import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { BlurView } from 'expo-blur';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionGlyph, type ActionGlyphName } from '@/components/ui/ActionGlyphs';
import { getTabFabAnchor } from '@/components/ui/tabFabAnchor';
import { isRTL } from '@/i18n';
import { useFrameDimensions } from '@/lib/appFrame';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';

/* The "Suivi Santé" world the glucose screen established: a warm off-white
   canvas, ink that is nearly black but green-shifted, and the brand green
   reserved for the one thing you came here to do. */
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const CANVAS = '#F6F9F5';
const INK = '#14231C';
const MUTED = '#63736A';


interface Entry {
  /** i18n key under addMenu.* */
  labelKey: string;
  href: Href;
  /** Drives both the mark and the wash behind it. */
  tint: string;
  glyph: ActionGlyphName;
}

/* Three tiers, because these thirteen doors are not equally important.
   A flat grid of identical circles made "scan a meal" — the reason the
   button exists — as findable as "medical report". */

/** The three logs a patient opens this menu for, several times a day. */
const LOGS: Entry[] = [
  { labelKey: 'glucose', href: '/log-glucose', tint: colors.glucoseInRange, glyph: 'glucose' },
  { labelKey: 'insulin', href: '/log-insulin', tint: colors.ai, glyph: 'insulin' },
  { labelKey: 'bolus', href: '/bolus', tint: colors.carbs, glyph: 'bolus' },
];

/** Everything else, in one calm grid. */
const MORE: Entry[] = [
  { labelKey: 'moroccanFood', href: '/foods', tint: colors.warning, glyph: 'tagine' },
  { labelKey: 'healthyFood', href: '/healthy-foods', tint: colors.primary, glyph: 'salad' },
  /* "Mon Programme" — on trial; this entry is its only door into the app. */
  { labelKey: 'program', href: '/program', tint: colors.cycle, glyph: 'target' },
  { labelKey: 'worldDishes', href: '/world-recipes', tint: colors.ai, glyph: 'globe' },
  { labelKey: 'barcode', href: '/barcode', tint: colors.gold, glyph: 'barcode' },
  { labelKey: 'menuScan', href: '/menu-scan', tint: colors.purple, glyph: 'menu' },
  { labelKey: 'labs', href: '/labs', tint: '#8A3FFC', glyph: 'flask' },
  { labelKey: 'report', href: '/report', tint: MUTED, glyph: 'report' },
  { labelKey: 'emergency', href: '/emergency', tint: colors.danger, glyph: 'sos' },
];

/* Fallback geometry, used only if the bar has never been measured (the menu
   reached before the tabs ever rendered). The real position comes from the
   bar itself — see tabFabAnchor. */
const BAR_H_PAD = 18;
const BAR_INNER_PAD = 6;
const BAR_COLS = 5;
const FAB = 44;

/** A colour at low opacity, for the wash behind an icon. */
function wash(hex: string, alpha = 0.13): string {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.replace(/./g, (c) => c + c) : h, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

export default function AddMenuScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width, offsetX, offsetY } = useFrameDimensions();

  // Hidden features: the labs and world-recipes shortcuts only exist for
  // accounts the admin explicitly granted.
  const labsGranted = useAppStore((s) => s.grantedFeatures.includes('labs'));
  const worldRecipesGranted = useAppStore((s) =>
    s.grantedFeatures.includes('world_recipes')
  );
  const more = MORE.filter(
    (i) =>
      (i.href !== '/labs' || labsGranted) &&
      (i.href !== '/world-recipes' || worldRecipesGranted)
  );

  /* One driver for the whole opening: the + spins into a cross while the
     sheet lifts and the tiles land one after the other. A spring, so it
     overshoots and settles — a pinwheel catching the wind. */
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.spring(anim, {
      toValue: 1,
      useNativeDriver: true,
      speed: 13,
      bounciness: 7,
    }).start();
  }, [anim]);

  /** Play the opening backwards, then leave. */
  const dismiss = (after?: () => void) => {
    Animated.timing(anim, {
      toValue: 0,
      duration: 170,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => {
      if (router.canGoBack()) router.back();
      else router.replace('/(tabs)');
      after?.();
    });
  };

  const close = () => dismiss();
  const open = (href: Href) => dismiss(() => setTimeout(() => router.push(href), 40));

  /* Where the bar's + actually is — measured by the bar, not recomputed from
     its paddings, so the two stay welded together whatever the layout does.
     The bar measures itself in *browser* coordinates; on a desktop the app is
     a column in the middle of the page, so shift back into app ones. */
  const anchor = getTabFabAnchor();
  const colWidth = (width - BAR_H_PAD * 2 - BAR_INNER_PAD * 2) / BAR_COLS;
  const fabColumn = isRTL(i18n.language) ? 0 : BAR_COLS - 1;
  const fabPos = anchor
    ? { left: anchor.x - offsetX, top: anchor.y - offsetY, size: anchor.size }
    : {
        left: BAR_H_PAD + BAR_INNER_PAD + colWidth * (fabColumn + 0.5) - FAB / 2,
        bottom: Math.min(insets.bottom, 10) + 10 + BAR_INNER_PAD,
        size: FAB,
      };

  const sheetStyle = {
    opacity: anim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, 1, 1] }),
    transform: [
      {
        translateY: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [56, 0],
          extrapolate: 'clamp' as const,
        }),
      },
      {
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.94, 1],
          extrapolate: 'clamp' as const,
        }),
      },
    ],
  };

  /** Each tile rides the same driver, a beat later than the one before. */
  const tileStyle = (index: number) => {
    const start = Math.min(0.45, index * 0.038);
    const step = anim.interpolate({
      inputRange: [start, start + 0.55],
      outputRange: [0, 1],
      extrapolate: 'clamp' as const,
    });
    return {
      opacity: step,
      transform: [
        { translateY: step.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) },
        { scale: step.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) },
      ],
    };
  };

  return (
    <View style={styles.overlay}>
      <BlurView intensity={20} tint="light" style={StyleSheet.absoluteFill} />
      <Pressable style={StyleSheet.absoluteFill} onPress={close} />

      <Animated.View
        style={[styles.sheet, { bottom: Math.max(insets.bottom, 12) + 92 }, sheetStyle]}
      >
        <View style={styles.grabber} />

        {/* ── The reason the button exists ── */}
        <Animated.View style={tileStyle(0)}>
          <Pressable
            onPress={() => open('/scan')}
            style={({ pressed }) => pressed && { opacity: 0.9, transform: [{ scale: 0.99 }] }}
          >
            <LinearGradient
              colors={['#1BA968', '#0C7C46']}
              start={{ x: 0.08, y: 0 }}
              end={{ x: 0.92, y: 1 }}
              style={styles.hero}
            >
              <View style={styles.heroIcon}>
                <ActionGlyph name="scan" color="#FFFFFF" size={26} knockout="#12905A" />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.heroTitle} numberOfLines={1}>
                  {t('addMenu.scan')}
                </Text>
                <Text style={styles.heroSub} numberOfLines={2}>
                  {t('addMenu.scanHint')}
                </Text>
              </View>
              <Text style={styles.heroArrow}>→</Text>
            </LinearGradient>
          </Pressable>
        </Animated.View>

        {/* ── The three logs, side by side ── */}
        <View style={styles.logRow}>
          {LOGS.map((entry, i) => (
            <Animated.View key={entry.labelKey} style={[styles.logCell, tileStyle(i + 1)]}>
              <Pressable
                onPress={() => open(entry.href)}
                style={({ pressed }) => [styles.logCard, pressed && styles.pressed]}
              >
                <View style={[styles.chip, { backgroundColor: wash(entry.tint) }]}>
                  <ActionGlyph name={entry.glyph} color={entry.tint} size={23} knockout={CANVAS} />
                </View>
                <Text style={styles.logLabel} numberOfLines={2}>
                  {t(`addMenu.${entry.labelKey}`)}
                </Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>

        {/* ── Everything else ──
            Rows, not a third grid of squares: "Marokkanische Küche" and
            "Restaurantmenü" need a line to live on, and a label broken
            mid-word is the tell that nobody ran the real copy. */}
        <View style={styles.grid}>
          {more.map((entry, i) => (
            <Animated.View key={entry.labelKey} style={[styles.gridCell, tileStyle(i + 4)]}>
              <Pressable
                onPress={() => open(entry.href)}
                style={({ pressed }) => [styles.gridRow, pressed && styles.pressed]}
              >
                <View style={[styles.chipSm, { backgroundColor: wash(entry.tint) }]}>
                  <ActionGlyph name={entry.glyph} color={entry.tint} size={20} knockout={CANVAS} />
                </View>
                <Text style={styles.gridLabel} numberOfLines={2}>
                  {t(`addMenu.${entry.labelKey}`)}
                </Text>
              </Pressable>
            </Animated.View>
          ))}
        </View>
      </Animated.View>

      {/* The bar's + is still on screen under this transparent modal. This
          sits exactly on it, same green, same size — so it reads as the very
          same button turning into a cross rather than a second control. */}
      <Pressable
        onPress={close}
        accessibilityRole="button"
        accessibilityLabel={t('common.close')}
        style={[
          styles.fabHit,
          { width: fabPos.size, height: fabPos.size },
          'top' in fabPos
            ? { left: fabPos.left, top: fabPos.top }
            : { left: fabPos.left, bottom: fabPos.bottom },
        ]}
      >
        <Animated.View
          style={[
            styles.fab,
            {
              width: fabPos.size,
              height: fabPos.size,
              borderRadius: fabPos.size / 2,
              transform: [
                {
                  rotate: anim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0deg', '135deg'],
                  }),
                },
              ],
            },
          ]}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24">
            <Path d="M12 5v14M5 12h14" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" />
          </Svg>
        </Animated.View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(16,28,22,0.16)' },

  sheet: {
    position: 'absolute',
    left: 12,
    right: 12,
    backgroundColor: CANVAS,
    borderRadius: 30,
    paddingTop: 10,
    paddingBottom: 18,
    paddingHorizontal: 14,
    ...shadows.floating,
  },
  grabber: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D5E0D8',
    marginBottom: 14,
  },

  /* Tier 1 — scan */
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    paddingVertical: 16,
    paddingHorizontal: 16,
    shadowColor: '#0C7C46',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 16,
    elevation: 6,
  },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroTitle: { fontFamily: F800, fontSize: 16.5, color: '#FFFFFF', letterSpacing: -0.2 },
  heroSub: {
    fontFamily: F600,
    fontSize: 12.5,
    lineHeight: 17,
    color: 'rgba(255,255,255,0.94)',
    marginTop: 2,
  },
  heroArrow: { fontFamily: F800, fontSize: 17, color: 'rgba(255,255,255,0.9)' },

  /* Tier 2 — the daily logs */
  logRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  logCell: { flex: 1, minWidth: 0 },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingVertical: 14,
    paddingHorizontal: 10,
    alignItems: 'center',
    gap: 9,
    ...shadows.card,
  },
  logLabel: {
    fontFamily: F700,
    fontSize: 12,
    lineHeight: 15,
    color: INK,
    textAlign: 'center',
  },

  /* Tier 3 — the rest, as two columns of rows */
  grid: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
  gridCell: { width: '50%', padding: 4 },
  gridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 8,
    minHeight: 58,
    ...shadows.card,
  },
  /* 11px buys the ~10px that stop German's longest label
     ("Restaurantmenü") breaking across a character. */
  gridLabel: {
    flex: 1,
    minWidth: 0,
    fontFamily: F700,
    fontSize: 11,
    lineHeight: 14,
    color: INK,
  },

  chip: {
    width: 42,
    height: 42,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipSm: {
    width: 34,
    height: 34,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.75, transform: [{ scale: 0.97 }] },

  fabHit: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
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
