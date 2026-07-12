import React, { useMemo, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft, PremiumEmptyState } from '@/components/ui';
import { buildDayEvents, dayTotals, type DayEvent } from '@/services/dayLog';
import { isRTL } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';
const INK = '#101828';

const KIND_COLOR: Record<DayEvent['kind'], string> = {
  meal: '#f59e0b',
  insulin: '#4f46e5',
  glucose: '#e11d48',
  activity: '#12B76A',
  measure: '#7C93E8',
  event: '#8a3ffc',
};
const KIND_ICON: Record<DayEvent['kind'], string> = {
  meal: '🍽️',
  insulin: '💉',
  glucose: '🩸',
  activity: '🏃',
  measure: '📏',
  event: '⚙️',
};

function zoneColor(v: number, low: number, high: number) {
  if (v < low) return '#3b82f6';
  if (v <= high) return '#22b95e';
  if (v <= high * 1.4) return '#f5b60a';
  return '#ef4444';
}

/**
 * "Rapport du jour": every single thing the patient did on a day, in
 * chronological order with its exact time — insulin (rapid/long/mixed),
 * meals with calories & sugars, glucose readings, sport, measures.
 * Browsable day by day; the SAME journal is handed to the AI before it
 * proposes an insulin dose.
 */
export default function TimelineScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);
  const { date } = useLocalSearchParams<{ date?: string }>();

  // Subscribe so the timeline live-updates when something is logged.
  const {
    meals,
    insulinLogs,
    glucoseLogs,
    activityLogs,
    measureLogs,
    eventLogs,
    profile,
  } = useAppStore();

  const startDay = useMemo(() => {
    if (date) {
      const d = new Date(`${date}T12:00:00`);
      if (!isNaN(d.getTime())) {
        const diff = Math.round(
          (new Date(new Date().toDateString()).getTime() -
            new Date(d.toDateString()).getTime()) /
            (24 * 3600 * 1000)
        );
        return Math.max(0, diff);
      }
    }
    return 0;
  }, [date]);

  const [daysBack, setDaysBack] = useState(startDay);
  const day = useMemo(
    () => new Date(Date.now() - daysBack * 24 * 3600 * 1000),
    [daysBack]
  );

  const events = useMemo(
    () => buildDayEvents(day),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [day, meals, insulinLogs, glucoseLogs, activityLogs, measureLogs, eventLogs]
  );
  const totals = useMemo(() => dayTotals(events), [events]);
  // Newest at the TOP (what the patient asked for) — the AI still reads the
  // chronological oldest→newest journal from buildDayEvents/buildAIDayJournal.
  const feed = useMemo(() => [...events].reverse(), [events]);

  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, {
      hour: '2-digit',
      minute: '2-digit',
    });

  const dayLabel =
    daysBack === 0
      ? t('timeline.today')
      : daysBack === 1
        ? t('timeline.yesterday')
        : day.toLocaleDateString(i18n.language, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          });

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 16,
          paddingBottom: 50,
        }}
      >
        {/* ── Header ── */}
        <View style={styles.headRow}>
          <Pressable onPress={close} style={styles.backBtn}>
            <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
              <ChevronLeft size={16} />
            </View>
          </Pressable>
          <Text style={styles.headTitle} numberOfLines={1}>
            {t('timeline.title')}
          </Text>
          <Pressable
            onPress={() => router.push('/calendar')}
            style={styles.backBtn}
          >
            <Text style={{ fontSize: 15 }}>🗓️</Text>
          </Pressable>
        </View>

        {/* ── Day navigation ── */}
        <View style={styles.navRow}>
          <Pressable
            style={styles.navBtn}
            onPress={() => setDaysBack((d) => d + 1)}
            hitSlop={8}
          >
            <Text style={styles.navBtnText}>‹</Text>
          </Pressable>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={styles.navDay} numberOfLines={1}>
              {dayLabel}
            </Text>
            {daysBack <= 1 ? (
              <Text style={styles.navSub}>
                {day.toLocaleDateString(i18n.language, {
                  day: 'numeric',
                  month: 'long',
                })}
              </Text>
            ) : null}
          </View>
          <Pressable
            style={[styles.navBtn, daysBack === 0 && { opacity: 0.35 }]}
            onPress={() => setDaysBack((d) => Math.max(0, d - 1))}
            disabled={daysBack === 0}
            hitSlop={8}
          >
            <Text style={styles.navBtnText}>›</Text>
          </Pressable>
        </View>

        {events.length === 0 ? (
          <PremiumEmptyState
            emoji="📋"
            title={t('day.emptyTitle')}
            message={t('day.emptyMsg')}
            style={{ marginTop: 30 }}
          />
        ) : (
          <>
            {/* ── Day totals ── */}
            <View style={styles.sumRow}>
              <View style={styles.sumCard}>
                <Text style={styles.sumIcon}>💉</Text>
                <Text style={styles.sumValue}>
                  {Math.round(totals.insulinU * 10) / 10}
                </Text>
                <Text style={styles.sumLabel}>{t('day.totInsulin')}</Text>
              </View>
              <View style={styles.sumCard}>
                <Text style={styles.sumIcon}>🍽️</Text>
                <Text style={styles.sumValue}>{Math.round(totals.carbs)}</Text>
                <Text style={styles.sumLabel}>{t('day.totCarbs')}</Text>
              </View>
              <View style={styles.sumCard}>
                <Text style={styles.sumIcon}>🔥</Text>
                <Text style={styles.sumValue}>{Math.round(totals.kcal)}</Text>
                <Text style={styles.sumLabel}>kcal</Text>
              </View>
              <View style={styles.sumCard}>
                <Text style={styles.sumIcon}>🩸</Text>
                <Text style={styles.sumValue}>{totals.avgGlucose ?? '—'}</Text>
                <Text style={styles.sumLabel}>{t('day.avgGly')}</Text>
              </View>
            </View>

            {/* ── Feed, newest first ── */}
            <View style={{ marginTop: 20 }}>
              {feed.map((e, idx) => (
                <View key={e.id} style={styles.eventRow}>
                  {/* time + spine */}
                  <View style={styles.spineCol}>
                    <Text style={styles.timeText}>{time(e.created_at)}</Text>
                    <View style={styles.spineTrack}>
                      <View
                        style={[
                          styles.spineDot,
                          { backgroundColor: KIND_COLOR[e.kind] },
                        ]}
                      />
                      {idx < feed.length - 1 ? (
                        <View style={styles.spineLine} />
                      ) : null}
                    </View>
                  </View>

                  {/* card */}
                  <View style={styles.card}>
                    <View
                      style={[
                        styles.cardIcon,
                        { backgroundColor: `${KIND_COLOR[e.kind]}18` },
                      ]}
                    >
                      <Text style={{ fontSize: 16 }}>{KIND_ICON[e.kind]}</Text>
                    </View>

                    {e.kind === 'meal' ? (
                      <>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.cardTitle} numberOfLines={1}>
                            {e.meal.result.food_name ||
                              (e.meal.result.items ?? [])
                                .map((i) => i.name)
                                .slice(0, 3)
                                .join(', ') ||
                              t('day.meal')}
                          </Text>
                          <Text style={styles.cardMeta}>
                            {Math.round(e.meal.result.calories)} kcal ·{' '}
                            {Math.round(e.meal.result.carbohydrates)} g{' '}
                            {t('day.carbsShort')} ·{' '}
                            {Math.round(e.meal.result.sugar)} g{' '}
                            {t('day.sugarShort')}
                          </Text>
                        </View>
                        {e.meal.image_url &&
                        /^(https?|blob|data|file):/i.test(e.meal.image_url) ? (
                          <Image
                            source={{ uri: e.meal.image_url }}
                            style={styles.mealThumb}
                          />
                        ) : null}
                      </>
                    ) : e.kind === 'insulin' ? (
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.cardTitle}>
                          {e.insulin.dose} U ·{' '}
                          {t(`day.insu_${e.insulin.insulin_type}` as any)}
                        </Text>
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          {e.insulin.notes || t('day.insulin')}
                        </Text>
                      </View>
                    ) : e.kind === 'glucose' ? (
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                          <Text style={styles.cardTitle}>
                            {e.glucose.value}{' '}
                            <Text style={styles.cardUnit}>mg/dL</Text>
                          </Text>
                          <View
                            style={[
                              styles.glyDot,
                              {
                                backgroundColor: zoneColor(
                                  e.glucose.value,
                                  low,
                                  high
                                ),
                              },
                            ]}
                          />
                        </View>
                        <Text style={styles.cardMeta} numberOfLines={1}>
                          {e.glucose.notes || t('day.glucose')}
                        </Text>
                      </View>
                    ) : e.kind === 'activity' ? (
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.cardTitle, { textTransform: 'capitalize' }]}>
                          {e.activity.kind} · {e.activity.duration_min} min
                        </Text>
                        <Text style={styles.cardMeta}>
                          {t('day.activity')} · {e.activity.intensity}
                        </Text>
                      </View>
                    ) : e.kind === 'event' ? (
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {e.event.kind === 'status'
                            ? t('events.statusChanged')
                            : t('events.settingsChanged')}
                        </Text>
                        <Text style={styles.cardMeta} numberOfLines={2}>
                          {e.event.kind === 'status'
                            ? `${t(`events.st_${e.event.payload.from}` as any, String(e.event.payload.from))} → ${t(`events.st_${e.event.payload.to}` as any, String(e.event.payload.to))}`
                            : Object.entries(e.event.payload.changes ?? {})
                                .map(
                                  ([f, v]: [string, any]) =>
                                    `${t(`events.f_${f}` as any, f)}: ${Array.isArray(v?.from) ? v.from.join('+') : (v?.from ?? '—')} → ${Array.isArray(v?.to) ? v.to.join('+') : (v?.to ?? '—')}`
                                )
                                .join(' · ')}
                        </Text>
                      </View>
                    ) : (
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={[styles.cardTitle, { textTransform: 'capitalize' }]}>
                          {e.measure.kind} · {e.measure.value} {e.measure.unit}
                        </Text>
                        <Text style={styles.cardMeta}>{t('day.measures')}</Text>
                      </View>
                    )}
                  </View>
                </View>
              ))}
            </View>

            {/* ── AI note ── */}
            <View style={styles.aiNote}>
              <Text style={{ fontSize: 15 }}>🤖</Text>
              <Text style={styles.aiNoteText}>{t('timeline.aiNote')}</Text>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe' },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    gap: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headTitle: {
    flex: 1,
    fontFamily: F800,
    fontSize: 17,
    color: INK,
    textAlign: 'center',
  },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 10,
    marginBottom: 14,
    ...shadows.card,
  },
  navBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#f1f3f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnText: { fontFamily: F700, fontSize: 20, color: INK, lineHeight: 22 },
  navDay: {
    fontFamily: F800,
    fontSize: 15,
    color: INK,
    textTransform: 'capitalize',
  },
  navSub: { fontFamily: F600, fontSize: 11, color: '#8b93a7', marginTop: 1 },

  sumRow: { flexDirection: 'row', gap: 8 },
  sumCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    ...shadows.card,
  },
  sumIcon: { fontSize: 16 },
  sumValue: { fontFamily: F800, fontSize: 18, color: INK, marginTop: 4 },
  sumLabel: {
    fontFamily: F600,
    fontSize: 9.5,
    color: '#8b93a7',
    marginTop: 2,
    textAlign: 'center',
  },

  eventRow: { flexDirection: 'row', gap: 10 },
  spineCol: { width: 52, alignItems: 'center' },
  timeText: { fontFamily: F700, fontSize: 11.5, color: '#667085' },
  spineTrack: { flex: 1, alignItems: 'center', marginTop: 4 },
  spineDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#ffffff',
    ...shadows.card,
  },
  spineLine: { flex: 1, width: 2, backgroundColor: '#e6e9f2', marginTop: 2 },

  card: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 11,
    marginBottom: 12,
    ...shadows.card,
  },
  cardIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: { fontFamily: F700, fontSize: 14, color: INK },
  cardUnit: { fontFamily: F500, fontSize: 11.5, color: '#667085' },
  cardMeta: { fontFamily: F500, fontSize: 11.5, color: '#8b93a7', marginTop: 2 },
  mealThumb: { width: 44, height: 44, borderRadius: 11, backgroundColor: '#f1f3f9' },
  glyDot: { width: 9, height: 9, borderRadius: 5 },

  aiNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#eef2ff',
    borderRadius: 14,
    padding: 12,
    marginTop: 6,
  },
  aiNoteText: {
    flex: 1,
    fontFamily: F600,
    fontSize: 11.5,
    color: '#4f46e5',
    lineHeight: 16,
  },
});
