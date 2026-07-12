import React, { useMemo } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft, PremiumEmptyState } from '@/components/ui';
import { isRTL } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import { shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';
const INK = '#101828';

function zoneColor(v: number, low: number, high: number) {
  if (v < low) return '#3b82f6';
  if (v <= high) return '#22b95e';
  if (v <= high * 1.4) return '#f5b60a';
  return '#ef4444';
}

/**
 * Full archive of one day: everything the patient did — scanned meals with
 * their photos, insulin doses, glucose readings, activity and body measures.
 * Opened from the calendar; the date never expires, the data stays.
 */
export default function DayScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);
  const { date } = useLocalSearchParams<{ date?: string }>();
  const { glucoseLogs, insulinLogs, meals, activityLogs, measureLogs, profile } = useAppStore();

  const day = useMemo(() => {
    const d = date ? new Date(`${date}T12:00:00`) : new Date();
    return isNaN(d.getTime()) ? new Date() : d;
  }, [date]);

  if (date && isNaN(new Date(`${date}T12:00:00`).getTime())) {
    return <Redirect href="/calendar" />;
  }

  const sameDay = (iso: string) => new Date(iso).toDateString() === day.toDateString();
  const byTime = <T extends { created_at: string }>(arr: T[]) =>
    [...arr].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

  const dMeals = byTime(meals.filter((m) => sameDay(m.created_at)));
  const dGly = byTime(glucoseLogs.filter((g) => sameDay(g.created_at)));
  const dInsu = byTime(insulinLogs.filter((x) => sameDay(x.created_at)));
  const dActs = byTime(activityLogs.filter((a) => sameDay(a.created_at)));
  const dMeas = byTime(measureLogs.filter((x) => sameDay(x.created_at)));

  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;

  const totInsulin = dInsu.reduce((s, x) => s + Number(x.dose || 0), 0);
  const totCarbs = dMeals.reduce((s, m) => s + (m.result.carbohydrates || 0), 0);
  const totKcal = dMeals.reduce((s, m) => s + (m.result.calories || 0), 0);
  const totActivity = dActs.reduce((s, a) => s + (a.duration_min || 0), 0);
  const avgGly = dGly.length
    ? Math.round(dGly.reduce((s, g) => s + g.value, 0) / dGly.length)
    : null;
  const tir = dGly.length
    ? Math.round((dGly.filter((g) => g.value >= low && g.value <= high).length / dGly.length) * 100)
    : null;

  const isEmpty =
    dMeals.length + dGly.length + dInsu.length + dActs.length + dMeas.length === 0;

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' });

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/calendar');
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
        <View style={styles.headRow}>
          <Pressable onPress={close} style={styles.backBtn}>
            <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
              <ChevronLeft size={16} />
            </View>
          </Pressable>
          <Text style={styles.headTitle} numberOfLines={1}>
            {day.toLocaleDateString(i18n.language, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </Text>
          <Pressable
            onPress={() =>
              router.push(
                `/timeline?date=${date ?? new Date().toISOString().slice(0, 10)}` as any
              )
            }
            style={styles.backBtn}
          >
            <Text style={{ fontSize: 15 }}>⏱️</Text>
          </Pressable>
        </View>

        {isEmpty ? (
          <PremiumEmptyState
            emoji="🗓️"
            title={t('day.emptyTitle')}
            message={t('day.emptyMsg')}
            style={{ marginTop: 30 }}
          />
        ) : (
          <>
            {/* ── Day summary ── */}
            <View style={styles.sumRow}>
              <View style={styles.sumCard}>
                <Text style={styles.sumIcon}>🩸</Text>
                <Text style={styles.sumValue}>{avgGly ?? '—'}</Text>
                <Text style={styles.sumLabel}>
                  {t('day.avgGly')}
                  {tir !== null ? ` · ${tir}%` : ''}
                </Text>
              </View>
              <View style={styles.sumCard}>
                <Text style={styles.sumIcon}>💉</Text>
                <Text style={styles.sumValue}>
                  {Math.round(totInsulin * 10) / 10}
                </Text>
                <Text style={styles.sumLabel}>{t('day.totInsulin')}</Text>
              </View>
              <View style={styles.sumCard}>
                <Text style={styles.sumIcon}>🍽️</Text>
                <Text style={styles.sumValue}>{Math.round(totCarbs)}</Text>
                <Text style={styles.sumLabel}>{t('day.totCarbs')}</Text>
              </View>
              <View style={styles.sumCard}>
                <Text style={styles.sumIcon}>🏃</Text>
                <Text style={styles.sumValue}>{totActivity}</Text>
                <Text style={styles.sumLabel}>{t('day.totActivity')}</Text>
              </View>
            </View>

            {/* ── Meals with photos ── */}
            {dMeals.length ? (
              <>
                <Text style={styles.section}>
                  🍽️ {t('day.meals')} ({dMeals.length}) ·{' '}
                  <Text style={styles.sectionSub}>{Math.round(totKcal)} kcal</Text>
                </Text>
                <View style={{ gap: 10 }}>
                  {dMeals.map((m) => {
                    const hasPhoto =
                      m.image_url && /^(https?|blob|data|file):/i.test(m.image_url);
                    return (
                      <View key={m.id} style={styles.mealRow}>
                        {hasPhoto ? (
                          <Image source={{ uri: m.image_url! }} style={styles.mealPhoto} />
                        ) : (
                          <View style={[styles.mealPhoto, styles.mealPhotoPh]}>
                            <Text style={{ fontSize: 22 }}>🍽️</Text>
                          </View>
                        )}
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={styles.mealName} numberOfLines={1}>
                            {m.result.food_name ||
                              (m.result.items ?? []).map((i) => i.name).join(', ') ||
                              t('day.meal')}
                          </Text>
                          <Text style={styles.mealMeta}>
                            {Math.round(m.result.calories)} kcal ·{' '}
                            {Math.round(m.result.carbohydrates)} g{' '}
                            {t('day.carbsShort')} · {Math.round(m.result.sugar)} g{' '}
                            {t('day.sugarShort')}
                          </Text>
                        </View>
                        <Text style={styles.timeText}>{time(m.created_at)}</Text>
                      </View>
                    );
                  })}
                </View>
              </>
            ) : null}

            {/* ── Insulin ── */}
            {dInsu.length ? (
              <>
                <Text style={styles.section}>
                  💉 {t('day.insulin')} ({dInsu.length}) ·{' '}
                  <Text style={styles.sectionSub}>
                    {Math.round(totInsulin * 10) / 10} U
                  </Text>
                </Text>
                <View style={{ gap: 8 }}>
                  {dInsu.map((x) => (
                    <View key={x.id} style={styles.row}>
                      <View
                        style={[
                          styles.typeBadge,
                          { backgroundColor: x.insulin_type === 'long' ? '#ece6fd' : '#e8f1fe' },
                        ]}
                      >
                        <Text
                          style={[
                            styles.typeBadgeText,
                            { color: x.insulin_type === 'long' ? '#6d28d9' : '#1d4ed8' },
                          ]}
                        >
                          {t(`day.insu_${x.insulin_type}` as any, x.insulin_type)}
                        </Text>
                      </View>
                      <Text style={styles.rowValue}>{x.dose} U</Text>
                      {x.notes ? (
                        <Text style={styles.rowNotes} numberOfLines={1}>
                          {x.notes}
                        </Text>
                      ) : (
                        <View style={{ flex: 1 }} />
                      )}
                      <Text style={styles.timeText}>{time(x.created_at)}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* ── Glucose ── */}
            {dGly.length ? (
              <>
                <Text style={styles.section}>
                  🩸 {t('day.glucose')} ({dGly.length})
                </Text>
                <View style={{ gap: 8 }}>
                  {dGly.map((g) => (
                    <View key={g.id} style={styles.row}>
                      <View
                        style={[styles.dot, { backgroundColor: zoneColor(g.value, low, high) }]}
                      />
                      <Text style={styles.rowValue}>
                        {g.value} <Text style={styles.rowUnit}>mg/dL</Text>
                      </Text>
                      {g.notes ? (
                        <Text style={styles.rowNotes} numberOfLines={1}>
                          {g.notes}
                        </Text>
                      ) : (
                        <View style={{ flex: 1 }} />
                      )}
                      <Text style={styles.timeText}>{time(g.created_at)}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* ── Activity ── */}
            {dActs.length ? (
              <>
                <Text style={styles.section}>
                  🏃 {t('day.activity')} ({dActs.length})
                </Text>
                <View style={{ gap: 8 }}>
                  {dActs.map((a) => (
                    <View key={a.id} style={styles.row}>
                      <Text style={[styles.rowValue, { textTransform: 'capitalize' }]}>
                        {a.kind}
                      </Text>
                      <Text style={styles.rowNotes}>
                        {a.duration_min} min · {a.intensity}
                      </Text>
                      <View style={{ flex: 1 }} />
                      <Text style={styles.timeText}>{time(a.created_at)}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}

            {/* ── Measures ── */}
            {dMeas.length ? (
              <>
                <Text style={styles.section}>
                  📏 {t('day.measures')} ({dMeas.length})
                </Text>
                <View style={{ gap: 8 }}>
                  {dMeas.map((x) => (
                    <View key={x.id} style={styles.row}>
                      <Text style={[styles.rowValue, { textTransform: 'capitalize' }]}>
                        {x.kind}
                      </Text>
                      <Text style={styles.rowNotes}>
                        {x.value} {x.unit}
                      </Text>
                      <View style={{ flex: 1 }} />
                      <Text style={styles.timeText}>{time(x.created_at)}</Text>
                    </View>
                  ))}
                </View>
              </>
            ) : null}
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
    marginBottom: 16,
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
    fontSize: 16.5,
    color: INK,
    textAlign: 'center',
    textTransform: 'capitalize',
  },

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

  section: {
    fontFamily: F800,
    fontSize: 15,
    color: INK,
    marginTop: 22,
    marginBottom: 10,
  },
  sectionSub: { fontFamily: F600, fontSize: 12.5, color: '#8b93a7' },

  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 10,
    ...shadows.card,
  },
  mealPhoto: { width: 56, height: 56, borderRadius: 13, backgroundColor: '#f1f3f9' },
  mealPhotoPh: { alignItems: 'center', justifyContent: 'center' },
  mealName: { fontFamily: F700, fontSize: 14, color: INK },
  mealMeta: { fontFamily: F500, fontSize: 11.5, color: '#667085', marginTop: 3 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 13,
    ...shadows.card,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  typeBadge: { borderRadius: 999, paddingVertical: 4, paddingHorizontal: 10 },
  typeBadgeText: { fontFamily: F700, fontSize: 10.5 },
  rowValue: { fontFamily: F700, fontSize: 15, color: INK },
  rowUnit: { fontFamily: F500, fontSize: 11.5, color: '#667085' },
  rowNotes: { flex: 1, fontFamily: F500, fontSize: 11.5, color: '#8b93a7' },
  timeText: { fontFamily: F600, fontSize: 12, color: '#667085' },
});
