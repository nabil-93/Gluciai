import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DayRingGlyph } from '@/components/calendar/RingCalendar';
import { ChevronLeft, FadeInView } from '@/components/ui';
import { getSession } from '@/data/workouts';
import { buildDayEvents, dayTotals } from '@/services/dayLog';
import { budgetForDate, dayProgress, isoDay, isRevealed } from '@/services/program';
import { MEAL_SLOTS } from '@/services/programEngine';
import { useProgramStore } from '@/store/useProgramStore';
import { shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN = '#1fbc78';
const INK = '#101828';

const SLOT_EMOJI: Record<string, string> = {
  breakfast: '☕',
  lunch: '🍽️',
  snack: '🍎',
  dinner: '🌙',
};

/**
 * One day of the parcours, read back.
 *
 * Two columns of truth side by side: what the coach PLANNED, and what the
 * journal actually recorded that day — including anything eaten outside the
 * program. A patient looking back should see what really happened, not a
 * tidy version of it.
 */
export default function ProgramDayScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const { program, days } = useProgramStore();

  const iso = String(date ?? isoDay(new Date())).slice(0, 10);
  /* A day the patient has not reached is treated as if it did not exist —
     the week is written ahead, and this screen must not be the back door
     that shows them what is coming. */
  const day = useMemo(() => {
    const hit = days.find((d) => d.date === iso);
    return hit && isRevealed(hit, days) ? hit : null;
  }, [days, iso]);
  const progress = dayProgress(day);

  const dateObj = useMemo(() => new Date(`${iso}T12:00:00`), [iso]);
  const events = useMemo(() => buildDayEvents(dateObj), [dateObj]);
  const totals = useMemo(() => dayTotals(events), [events]);
  const budget = program ? budgetForDate(program.targets, dateObj) : null;

  const journalMeals = events.filter((e) => e.kind === 'meal');
  const session = day?.workoutId ? getSession(day.workoutId) : null;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/program' as any);
  };

  const label = dateObj.toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
  const isToday = iso === isoDay(new Date());

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
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle}>{t('program.dayTitle')}</Text>
          <View style={{ width: 36 }} />
        </View>

        <FadeInView>
          <LinearGradient
            colors={progress.ratio >= 1 ? ['#2ec983', '#159a57'] : ['#5b6b80', '#3b4757']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.hero}
          >
            <View style={{ flex: 1 }}>
              <Text style={styles.heroDate}>{label}</Text>
              <Text style={styles.heroDay}>
                {day
                  ? t('program.dayN', { n: day.dayIndex + 1 })
                  : t('program.dayNotPlanned')}
              </Text>
              {day ? (
                <Text style={styles.heroMeta}>
                  {t('program.dayRecap', {
                    meals: progress.mealsDone,
                    total: progress.mealsTotal,
                  })}
                  {progress.workoutRequired
                    ? ` · ${progress.workoutDone ? t('program.sportDone') : t('program.sportMissed')}`
                    : ` · ${t('program.restDayShort')}`}
                </Text>
              ) : null}
            </View>
            <View style={styles.heroRing}>
              <DayRingGlyph
                ring={{ kind: 'progress', color: '#ffffff', value: Math.max(0.04, progress.ratio) }}
                size={54}
                stroke={5}
              />
              <Text style={styles.heroPct}>{Math.round(progress.ratio * 100)}%</Text>
            </View>
          </LinearGradient>
        </FadeInView>

        {/* ── What the day actually weighed ── */}
        {budget ? (
          <FadeInView delay={60}>
            <View style={styles.totalsCard}>
              <View style={styles.totalCell}>
                <Text style={styles.totalValue}>{Math.round(totals.kcal)}</Text>
                <Text style={styles.totalLabel}>
                  / {budget.kcalTarget} kcal
                </Text>
              </View>
              <View style={styles.totalDivider} />
              <View style={styles.totalCell}>
                <Text style={[styles.totalValue, { color: '#f79009' }]}>
                  {Math.round(totals.carbs)}
                </Text>
                <Text style={styles.totalLabel}>/ {budget.carbsTarget} g</Text>
              </View>
              <View style={styles.totalDivider} />
              <View style={styles.totalCell}>
                <Text style={[styles.totalValue, { color: '#3f5b8a' }]}>
                  {Math.round(totals.insulinU * 10) / 10}
                </Text>
                <Text style={styles.totalLabel}>U</Text>
              </View>
              <View style={styles.totalDivider} />
              <View style={styles.totalCell}>
                <Text style={[styles.totalValue, { color: '#8a5a10' }]}>
                  {totals.avgGlucose ?? '—'}
                </Text>
                <Text style={styles.totalLabel}>mg/dL</Text>
              </View>
            </View>
          </FadeInView>
        ) : null}

        {/* ── The plan, and what became of it ── */}
        {day?.meals?.length ? (
          <FadeInView delay={120}>
            <Text style={styles.sectionHead}>📋 {t('program.plannedThatDay')}</Text>
            {MEAL_SLOTS.map((s) => {
              const m = day.meals.find((x) => x.slot === s);
              if (!m) return null;
              const done = !!m.eatenAt;
              return (
                <View key={s} style={[styles.mealRow, !done && styles.mealRowMissed]}>
                  <Text style={styles.mealEmoji}>{m.emoji || SLOT_EMOJI[s]}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mealSlot}>{t(`bolus.meal_${s}`)}</Text>
                    <Text style={[styles.mealTitle, !done && styles.mealTitleMissed]}>
                      {m.title}
                    </Text>
                    {done && m.portion && m.portion !== 1 ? (
                      <Text style={styles.mealPortion}>
                        {t('program.atePortion', { pct: Math.round(m.portion * 100) })}
                      </Text>
                    ) : null}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.mealCarbs}>{m.carbs} g</Text>
                    <Text style={done ? styles.mealDone : styles.mealMissed}>
                      {done ? `✓ ${t('program.eaten')}` : `✗ ${t('program.notEaten')}`}
                    </Text>
                  </View>
                </View>
              );
            })}
          </FadeInView>
        ) : null}

        {/* ── The training ── */}
        <FadeInView delay={160}>
          {/* Day-neutral heading: this screen is read on any past date, so
              "your session TODAY" would be a lie on every one of them. */}
          <Text style={styles.sectionHead}>🏋️ {t('program.workoutSection')}</Text>
          <View style={styles.plainCard}>
            {session ? (
              <>
                <Text style={styles.plainTitle}>
                  {i18n.language.startsWith('ar')
                    ? session.title_ar
                    : i18n.language.startsWith('en')
                      ? session.title_en
                      : session.title_fr}
                </Text>
                <Text style={styles.plainMeta}>
                  ⏱️ {session.minutes} min ·{' '}
                  {progress.workoutDone ? `✓ ${t('program.sportDone')}` : `✗ ${t('program.sportMissed')}`}
                </Text>
              </>
            ) : (
              <Text style={styles.plainMeta}>😴 {t('program.restDay')}</Text>
            )}
            {totals.sportMin > 0 ? (
              <Text style={styles.plainNote}>
                {t('program.sportLogged', { min: totals.sportMin })}
              </Text>
            ) : null}
          </View>
        </FadeInView>

        {/* ── Everything the journal recorded, program or not ── */}
        <FadeInView delay={200}>
          <Text style={styles.sectionHead}>🧾 {t('program.reallyAte')}</Text>
          {journalMeals.length ? (
            journalMeals.map((e) =>
              e.kind === 'meal' ? (
                <View key={e.id} style={styles.logRow}>
                  <Text style={styles.logTime}>
                    {new Date(e.created_at).toLocaleTimeString(i18n.language, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.logName} numberOfLines={2}>
                      {e.meal.result.food_name}
                    </Text>
                    {e.meal.meal_type ? (
                      <Text style={styles.logSlot}>{t(`bolus.meal_${e.meal.meal_type}`)}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.logCarbs}>
                    {Math.round(e.meal.result.carbohydrates)} g
                  </Text>
                </View>
              ) : null
            )
          ) : (
            <View style={styles.plainCard}>
              <Text style={styles.plainMeta}>
                {isToday ? t('program.nothingYet') : t('program.nothingLogged')}
              </Text>
            </View>
          )}
        </FadeInView>
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
  headTitle: { fontFamily: F800, fontSize: 17, color: INK },

  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    borderRadius: 22,
    padding: 18,
    shadowColor: '#2a3646',
    shadowOpacity: 0.22,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroDate: {
    fontFamily: F600,
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    textTransform: 'capitalize',
  },
  heroDay: { fontFamily: F800, fontSize: 21, color: '#ffffff', marginTop: 2 },
  heroMeta: { fontFamily: F600, fontSize: 11.5, color: 'rgba(255,255,255,0.9)', marginTop: 6 },
  heroRing: { alignItems: 'center', gap: 3 },
  heroPct: { fontFamily: F800, fontSize: 12, color: '#ffffff' },

  totalsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 14,
    marginTop: 12,
    ...shadows.card,
  },
  totalCell: { flex: 1, alignItems: 'center' },
  totalDivider: { width: 1, height: 26, backgroundColor: '#eef1f6' },
  totalValue: { fontFamily: F800, fontSize: 17, color: INK },
  totalLabel: { fontFamily: F600, fontSize: 10, color: '#8a98a7', marginTop: 2 },

  sectionHead: { fontFamily: F800, fontSize: 15, color: INK, marginTop: 22, marginBottom: 10 },

  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 13,
    marginBottom: 8,
    ...shadows.card,
  },
  mealRowMissed: { backgroundColor: '#fdfafa' },
  mealEmoji: { fontSize: 20 },
  mealSlot: { fontFamily: F600, fontSize: 10.5, color: '#8a98a7' },
  mealTitle: { fontFamily: F700, fontSize: 13, color: INK, marginTop: 1 },
  mealTitleMissed: { color: '#8a98a7' },
  mealPortion: { fontFamily: F600, fontSize: 10.5, color: GREEN, marginTop: 2 },
  mealCarbs: { fontFamily: F800, fontSize: 13, color: '#f79009' },
  mealDone: { fontFamily: F700, fontSize: 10, color: GREEN, marginTop: 2 },
  mealMissed: { fontFamily: F700, fontSize: 10, color: '#c2ccd8', marginTop: 2 },

  plainCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    ...shadows.card,
  },
  plainTitle: { fontFamily: F800, fontSize: 14, color: INK },
  plainMeta: { fontFamily: F600, fontSize: 12, lineHeight: 17, color: '#667085', marginTop: 3 },
  plainNote: { fontFamily: F500, fontSize: 11.5, color: '#8a98a7', marginTop: 8 },

  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 7,
    ...shadows.card,
  },
  logTime: { fontFamily: F700, fontSize: 11, color: '#8a98a7', width: 40 },
  logName: { fontFamily: F700, fontSize: 12.5, color: INK },
  logSlot: { fontFamily: F600, fontSize: 10, color: '#8a98a7', marginTop: 1 },
  logCarbs: { fontFamily: F800, fontSize: 12.5, color: '#f79009' },
});
