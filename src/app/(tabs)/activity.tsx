import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PremiumEmptyState, PressableScale } from '@/components/ui';
import { useTabBarScroll } from '@/components/ui/TabBarVisibility';
import { nowMs } from '@/lib/clock';
import { deleteActivity, saveActivity } from '@/services/data';
import { useAppStore } from '@/store/useAppStore';
import type { ActivityIntensity, ActivityKind } from '@/types';

const SNEAKER = require('../../assets/claude/sneaker.png');

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN = '#19c37d';
const GREEN_DARK = '#17a56d';
const GREEN_LIGHT = '#e8f8f0';

const KINDS: { key: ActivityKind; labelKey: string; emoji: string }[] = [
  { key: 'walk', labelKey: 'activityScreen.kindWalk', emoji: '🚶' },
  { key: 'run', labelKey: 'activityScreen.kindRun', emoji: '🏃' },
  { key: 'bike', labelKey: 'activityScreen.kindBike', emoji: '🚴' },
  { key: 'gym', labelKey: 'activityScreen.kindGym', emoji: '🏋️' },
  { key: 'other', labelKey: 'activityScreen.kindOther', emoji: '⚽' },
];

const INTENSITIES: { key: ActivityIntensity; labelKey: string }[] = [
  { key: 'low', labelKey: 'activityScreen.intensityLow' },
  { key: 'medium', labelKey: 'activityScreen.intensityMedium' },
  { key: 'high', labelKey: 'activityScreen.intensityHigh' },
];

const KIND_KEY = Object.fromEntries(KINDS.map((k) => [k.key, k.labelKey]));
const KIND_EMOJI = Object.fromEntries(KINDS.map((k) => [k.key, k.emoji]));
const INT_KEY = Object.fromEntries(
  INTENSITIES.map((i) => [i.key, i.labelKey])
);

const DAY_MS = 24 * 3600 * 1000;
const WEEK_GOAL = 150;

export default function ActivityScreen() {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const { onScroll } = useTabBarScroll();
  const { activityLogs } = useAppStore();
  const locale = i18n.language;

  const [kind, setKind] = useState<ActivityKind>('walk');
  const [duration, setDuration] = useState(30);
  const [intensity, setIntensity] = useState<ActivityIntensity>('medium');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // This week vs last week (rolling 7-day windows)
  const { weekMin, deltaPct, hasComparison, recent } = useMemo(() => {
    const now = nowMs();
    const thisWeek = activityLogs.filter(
      (a) => now - new Date(a.created_at).getTime() < 7 * DAY_MS
    );
    const lastWeek = activityLogs.filter((a) => {
      const age = now - new Date(a.created_at).getTime();
      return age >= 7 * DAY_MS && age < 14 * DAY_MS;
    });
    const cur = thisWeek.reduce((s, a) => s + a.duration_min, 0);
    const prev = lastWeek.reduce((s, a) => s + a.duration_min, 0);
    // Only show a percentage when last week has data to compare against;
    // a jump from 0 to X isn't a meaningful "+100%".
    const pct = prev > 0 ? Math.round(((cur - prev) / prev) * 100) : 0;
    return {
      weekMin: cur,
      deltaPct: pct,
      hasComparison: prev > 0,
      recent: thisWeek,
    };
  }, [activityLogs]);

  const add = async () => {
    if (!duration || saving) return;
    setSaving(true);
    try {
      await saveActivity(kind, duration, intensity);
      setSaved(true);
      setTimeout(() => setSaved(false), 1100);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 22,
          paddingBottom: 150,
        }}
      >
        {/* Header */}
        <Text style={styles.title}>{t('activityScreen.title')}</Text>
        <Text style={styles.subtitle}>{t('activityScreen.subtitle')}</Text>

        {/* Week hero — matches the design board exactly */}
        <View style={styles.hero}>
          {/* Decorative background circles (transparent green) */}
          <View pointerEvents="none" style={styles.heroBigCircle} />
          <View pointerEvents="none" style={styles.heroSmallCircle} />

          {/* Text column */}
          <View style={styles.heroText}>
            <View style={styles.weekLabel}>
              <Text style={styles.weekLabelText}>{t('activityScreen.thisWeek')}</Text>
            </View>
            <View style={styles.heroRow}>
              <Text style={styles.heroValue}>{weekMin}</Text>
              <Text style={styles.heroUnit}>{t('activityScreen.minUnit')}</Text>
            </View>
            <View style={styles.goalPill}>
              <Svg width={15} height={15} viewBox="0 0 24 24">
                <Circle cx={12} cy={12} r={8.5} stroke={GREEN} strokeWidth={2} fill="none" />
                <Circle cx={12} cy={12} r={3.5} stroke={GREEN} strokeWidth={2} fill="none" />
                <Path d="M12 3.5v3M20.5 12h-3" stroke={GREEN} strokeWidth={2} strokeLinecap="round" />
              </Svg>
              <Text style={styles.goalPillText}>
                {t('activityScreen.goal', { min: WEEK_GOAL })}
              </Text>
            </View>
            <Text style={styles.heroNote}>{t('activityScreen.heroNote')}</Text>
          </View>

          {/* Sneaker — real cut-out image (transparent background) */}
          <Image
            source={SNEAKER}
            style={styles.sneaker}
            resizeMode="contain"
          />

          {/* Growth badge */}
          <View style={styles.growthBadge}>
            <Svg width={20} height={20} viewBox="0 0 24 24">
              <Path
                d="M3 17l5-6 4 3 6-8"
                stroke={GREEN}
                strokeWidth={2.4}
                strokeLinecap="round"
                strokeLinejoin="round"
                fill="none"
              />
              <Path d="M15 6h5v5" stroke={GREEN} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Svg>
            {hasComparison ? (
              <>
                <Text style={styles.growthPct}>
                  {deltaPct >= 0 ? '+' : ''}
                  {deltaPct}%
                </Text>
                <Text style={styles.growthSub}>{t('activityScreen.vsLastWeek')}</Text>
              </>
            ) : (
              <Text style={styles.growthSub}>{t('activityScreen.keepGoing')}</Text>
            )}
          </View>
        </View>

        {/* Add a session */}
        <View style={styles.formCard}>
          <Text style={styles.formTitle}>{t('activityScreen.addSession')}</Text>

          {/* Kind tiles */}
          <View style={styles.kindRow}>
            {KINDS.map((k) => {
              const on = kind === k.key;
              return (
                <Pressable
                  key={k.key}
                  onPress={() => setKind(k.key)}
                  style={[styles.kindTile, on && styles.kindTileOn]}
                >
                  <Text style={{ fontSize: 20 }}>{k.emoji}</Text>
                  <Text
                    style={[styles.kindLabel, on && styles.kindLabelOn]}
                    numberOfLines={1}
                  >
                    {t(k.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Duration stepper */}
          <View style={styles.durRow}>
            <Text style={styles.durLabel}>{t('activityScreen.duration')}</Text>
            <View style={styles.stepper}>
              <Pressable
                onPress={() => setDuration((d) => Math.max(5, d - 5))}
                style={styles.stepBtn}
                hitSlop={6}
              >
                <Svg width={14} height={14} viewBox="0 0 24 24">
                  <Path d="M5 12h14" stroke={GREEN_DARK} strokeWidth={2.8} strokeLinecap="round" />
                </Svg>
              </Pressable>
              <Text style={styles.stepValue}>{duration}</Text>
              <Pressable
                onPress={() => setDuration((d) => Math.min(300, d + 5))}
                style={styles.stepBtn}
                hitSlop={6}
              >
                <Svg width={14} height={14} viewBox="0 0 24 24">
                  <Path d="M12 5v14M5 12h14" stroke={GREEN_DARK} strokeWidth={2.8} strokeLinecap="round" />
                </Svg>
              </Pressable>
            </View>
            <Text style={styles.durUnit}>{t('activityScreen.minUnit')}</Text>
          </View>

          {/* Intensity segmented */}
          <View style={styles.intRow}>
            {INTENSITIES.map((it) => {
              const on = intensity === it.key;
              return (
                <Pressable
                  key={it.key}
                  onPress={() => setIntensity(it.key)}
                  style={[styles.intChip, on && styles.intChipOn]}
                >
                  <Text style={[styles.intText, on && styles.intTextOn]}>
                    {t(it.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* Save button */}
          <PressableScale onPress={add} accessibilityLabel={t('activityScreen.save')}>
            <View style={[styles.saveBtn, saving && { opacity: 0.6 }]}>
              <Text style={styles.saveText}>
                {saved ? t('activityScreen.saved') : t('activityScreen.save')}
              </Text>
              {!saved ? (
                <Svg width={14} height={14} viewBox="0 0 24 24">
                  <Path
                    d="M9 6l6 6-6 6"
                    stroke="#fff"
                    strokeWidth={2.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </Svg>
              ) : null}
            </View>
          </PressableScale>
        </View>

        {/* Last 7 days */}
        <View style={styles.listHead}>
          <Text style={styles.listTitle}>{t('activityScreen.last7Days')}</Text>
          {recent.length > 0 ? (
            <Text style={styles.seeAll}>{t('activityScreen.seeAll')}</Text>
          ) : null}
        </View>

        {recent.length === 0 ? (
          <PremiumEmptyState
            emoji="🏃"
            title={t('activityScreen.emptyTitle')}
            message={t('activityScreen.emptyMessage')}
          />
        ) : (
          <View style={{ gap: 9 }}>
            {recent.map((a) => (
              <Pressable
                key={a.id}
                style={styles.row}
                onLongPress={() => deleteActivity(a.id)}
              >
                <View style={styles.rowIcon}>
                  <Text style={{ fontSize: 17 }}>{KIND_EMOJI[a.kind]}</Text>
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.rowTitle}>
                    {t('activityScreen.rowTitle', {
                      kind: t(KIND_KEY[a.kind]),
                      min: a.duration_min,
                    })}
                  </Text>
                  <Text style={styles.rowSub} numberOfLines={1}>
                    {t(INT_KEY[a.intensity])} ·{' '}
                    {new Date(a.created_at).toLocaleDateString(locale, {
                      weekday: 'long',
                      day: 'numeric',
                    })}{' '}
                    ·{' '}
                    {new Date(a.created_at).toLocaleTimeString(locale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
                <Svg width={16} height={16} viewBox="0 0 24 24">
                  <Path
                    d="M3 17l5-6 4 3 6-8"
                    stroke={GREEN}
                    strokeWidth={2.2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    fill="none"
                  />
                </Svg>
                <Svg width={13} height={13} viewBox="0 0 24 24">
                  <Path
                    d="M9 6l6 6-6 6"
                    stroke="#9CA3AF"
                    strokeWidth={2.4}
                    strokeLinecap="round"
                    fill="none"
                  />
                </Svg>
              </Pressable>
            ))}
            <Text style={styles.deleteHint}>
              {t('activityScreen.deleteHint')}
            </Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: 'rgba(80,80,140,1)',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe' },
  title: {
    fontFamily: F800,
    fontSize: 27,
    letterSpacing: -0.3,
    color: '#111827',
  },
  subtitle: {
    fontFamily: F500,
    fontSize: 14,
    color: '#6b7280',
    marginTop: 3,
    marginBottom: 14,
  },

  /* Week hero — reproduces the design board */
  hero: {
    backgroundColor: '#eaf9f0',
    borderRadius: 24,
    padding: 18,
    minHeight: 168,
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  heroBigCircle: {
    position: 'absolute',
    right: -70,
    top: -30,
    width: 240,
    height: 240,
    borderRadius: 120,
    backgroundColor: 'rgba(25,195,125,0.09)',
  },
  heroSmallCircle: {
    position: 'absolute',
    left: '46%',
    top: '44%',
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(25,195,125,0.16)',
  },
  heroText: { width: '64%', zIndex: 2 },
  weekLabel: {
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 11,
  },
  weekLabelText: { fontFamily: F700, fontSize: 12, color: GREEN_DARK },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 6,
    marginTop: 8,
  },
  heroValue: {
    fontFamily: F800,
    fontSize: 46,
    letterSpacing: -1.5,
    color: GREEN_DARK,
  },
  heroUnit: { fontFamily: F800, fontSize: 17, color: '#111827' },
  goalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 11,
    marginTop: 8,
  },
  goalPillText: { fontFamily: F700, fontSize: 12, color: GREEN_DARK },
  heroNote: {
    fontFamily: F500,
    fontSize: 11.5,
    lineHeight: 16.5,
    color: '#4b5563',
    marginTop: 10,
  },
  sneaker: {
    position: 'absolute',
    right: -18,
    top: 18,
    width: 224,
    height: 150,
    transform: [{ rotate: '-4deg' }],
    zIndex: 2,
  },
  growthBadge: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 4,
    ...CARD_SHADOW,
  },
  growthPct: { fontFamily: F800, fontSize: 15, color: GREEN_DARK, marginTop: 1 },
  growthSub: {
    fontFamily: F500,
    fontSize: 8,
    lineHeight: 9.5,
    color: '#6b7280',
    textAlign: 'center',
    marginTop: 1,
  },

  /* Add form */
  formCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    marginTop: 12,
    ...CARD_SHADOW,
  },
  formTitle: { fontFamily: F800, fontSize: 15.5, color: '#111827' },
  kindRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
  kindTile: {
    flex: 1,
    minWidth: 0,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: '#f6f7fb',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  kindTileOn: {
    backgroundColor: GREEN_LIGHT,
    borderColor: GREEN,
  },
  kindLabel: { fontFamily: F600, fontSize: 10.5, color: '#6b7280' },
  kindLabelOn: { fontFamily: F700, color: GREEN_DARK },

  durRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 16,
    gap: 12,
  },
  durLabel: { fontFamily: F700, fontSize: 14, color: '#111827', flex: 1 },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#f6f7fb',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  stepBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: GREEN_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: {
    fontFamily: F800,
    fontSize: 18,
    color: '#111827',
    minWidth: 34,
    textAlign: 'center',
  },
  durUnit: { fontFamily: F600, fontSize: 13, color: '#6b7280' },

  intRow: { flexDirection: 'row', gap: 8, marginTop: 14 },
  intChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: '#f6f7fb',
  },
  intChipOn: { backgroundColor: GREEN },
  intText: { fontFamily: F700, fontSize: 12.5, color: '#6b7280' },
  intTextOn: { color: '#ffffff' },

  saveBtn: {
    marginTop: 16,
    height: 48,
    borderRadius: 16,
    backgroundColor: GREEN,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    shadowColor: GREEN,
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 5,
  },
  saveText: { fontFamily: F800, fontSize: 14.5, color: '#ffffff' },

  /* Last 7 days */
  listHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 20,
    marginBottom: 10,
    marginHorizontal: 2,
  },
  listTitle: { fontFamily: F800, fontSize: 15.5, color: '#111827' },
  seeAll: { fontFamily: F700, fontSize: 12, color: GREEN_DARK },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 13,
    ...CARD_SHADOW,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: GREEN_LIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: { fontFamily: F700, fontSize: 13, color: '#111827' },
  rowSub: {
    fontFamily: F500,
    fontSize: 11,
    color: '#6b7280',
    marginTop: 1,
    textTransform: 'capitalize',
  },
  deleteHint: {
    fontFamily: F500,
    fontSize: 10.5,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 6,
  },
});
