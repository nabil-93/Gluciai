import React, { useCallback, useEffect, useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft, FadeInView, Spinner } from '@/components/ui';
import { getSession, preWorkoutCheck, videoUrl, getExercise } from '@/data/workouts';
import {
  DEFAULT_CONSTRAINTS,
  generateDays,
  nextSlot,
  previewTargets,
  retargetNextMeal,
  saveDays,
  saveProgram,
  todayBudget,
  type Program,
  type ProgramConstraints,
} from '@/services/program';
import { MEAL_SLOTS, type ActivityLevel, type ProgramGoal } from '@/services/programEngine';
import { useAppStore } from '@/store/useAppStore';
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

/** Ring showing how much of the day's energy budget is already eaten. */
function BudgetRing({ pct, size = 118 }: { pct: number; size?: number }) {
  const stroke = 11;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Past 100 % the ring stays full — the "over budget" message carries the
  // bad news, a ring that wraps around would just look like progress.
  const filled = Math.min(1, Math.max(0, pct));
  return (
    <Svg width={size} height={size}>
      <Circle cx={size / 2} cy={size / 2} r={r} stroke="#e9eef5" strokeWidth={stroke} fill="none" />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        stroke={pct > 1 ? '#e04f5f' : GREEN}
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeDasharray={`${c * filled} ${c}`}
        fill="none"
        transform={`rotate(-90 ${size / 2} ${size / 2})`}
      />
    </Svg>
  );
}

export default function ProgramScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { profile } = useAppStore();
  const { program, days, generating, setProgram, setDays, setGenerating, markEaten } =
    useProgramStore();

  const today = new Date().toISOString().slice(0, 10);
  const todayPlan = useMemo(() => days.find((d) => d.date === today) ?? null, [days, today]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  /* ── Creation, handed over by the setup wizard ── */
  const createFromParams = useCallback(async () => {
    const goal = (params.goal as ProgramGoal) || 'lose';
    const level = (params.level as ActivityLevel) || 'light';
    const weight = Number(params.weight) || profile?.weight || null;
    const targetWeight = Number(params.targetWeight) || null;
    const rate = Number(params.rate) || 0.5;
    const trainingDays = Number(params.trainingDays) || 3;
    const place = (params.place as Program['trainingPlace']) || 'home';

    let constraints: ProgramConstraints = DEFAULT_CONSTRAINTS;
    try {
      if (typeof params.constraints === 'string')
        constraints = { ...DEFAULT_CONSTRAINTS, ...JSON.parse(params.constraints) };
    } catch {
      /* a malformed hand-off must not block the program */
    }

    const targets = previewTargets({
      profile: { ...(profile ?? {}), weight: weight ?? undefined } as any,
      goal,
      targetWeight,
      ratePerWeek: rate,
      activityLevel: level,
      trainingDaysPerWeek: trainingDays,
    });

    const draft: Omit<Program, 'id'> = {
      goal,
      status: 'active',
      startDate: today,
      weeks: 4,
      startWeight: weight,
      targetWeight,
      activityLevel: level,
      trainingDaysPerWeek: trainingDays,
      trainingPlace: place,
      targets,
      constraints,
    };

    setGenerating(true);
    const saved = (await saveProgram(draft)) ?? { ...draft, id: 'local' };
    setProgram(saved);

    // Ask the coach for the first week. If it cannot be reached the program
    // still exists with its budget — the plan fills in on the next try.
    const generated = await generateDays({
      program: saved,
      profile,
      startDate: new Date(),
      days: 7,
      language: i18n.language,
    });
    if (generated?.length) {
      setDays(generated);
      await saveDays(saved.id, generated);
    }
    setGenerating(false);
  }, [params, profile, today, i18n.language, setProgram, setDays, setGenerating]);

  useEffect(() => {
    if (params.create === '1' && !program) void createFromParams();
    // Creation runs once, on the hand-off from the wizard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.create]);

  /* ── Empty state ── */
  if (!program && !generating) {
    return (
      <View style={styles.root}>
        <ScrollView
          contentContainerStyle={{
            paddingTop: insets.top + 14,
            paddingHorizontal: 16,
            paddingBottom: 40,
          }}
        >
          <View style={styles.headRow}>
            <Pressable onPress={close} style={styles.backBtn}>
              <ChevronLeft size={16} />
            </Pressable>
            <Text style={styles.headTitle}>{t('program.title')}</Text>
            <View style={{ width: 36 }} />
          </View>

          <FadeInView style={styles.emptyWrap}>
            <LinearGradient
              colors={['#2ec983', '#159a57']}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.emptyHero}
            >
              <Text style={styles.emptyEmoji}>🎯</Text>
              <Text style={styles.emptyTitle}>{t('program.emptyTitle')}</Text>
              <Text style={styles.emptySub}>{t('program.emptySub')}</Text>
            </LinearGradient>

            <View style={styles.sellList}>
              {(['sell1', 'sell2', 'sell3', 'sell4'] as const).map((k) => (
                <View key={k} style={styles.sellRow}>
                  <View style={styles.sellDot} />
                  <Text style={styles.sellText}>{t(`program.${k}`)}</Text>
                </View>
              ))}
            </View>

            <Pressable onPress={() => router.push('/program-setup' as any)}>
              <LinearGradient
                colors={['#2ec983', '#1fbc78']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cta}
              >
                <Text style={styles.ctaText}>✨ {t('program.emptyCta')}</Text>
                <Text style={styles.ctaArrow}>→</Text>
              </LinearGradient>
            </Pressable>
          </FadeInView>
        </ScrollView>
      </View>
    );
  }

  /* ── Generating ── */
  if (generating) {
    return (
      <View style={[styles.root, styles.center]}>
        <Spinner size={30} color={GREEN} />
        <Text style={styles.genTitle}>{t('program.generating')}</Text>
        <Text style={styles.genSub}>{t('program.generatingSub')}</Text>
      </View>
    );
  }

  if (!program) return null;

  const budget = todayBudget(program.targets);
  const slot = nextSlot(todayPlan);
  const nextMeal = todayPlan?.meals.find((m) => m.slot === slot) ?? null;
  const retarget = todayPlan ? retargetNextMeal(program, todayPlan) : null;

  const dayIndex = Math.max(
    0,
    Math.round(
      (new Date(today).getTime() - new Date(program.startDate).getTime()) / 86400000
    )
  );
  const weekIndex = Math.min(program.weeks, Math.floor(dayIndex / 7) + 1);

  const session = todayPlan?.workoutId ? getSession(todayPlan.workoutId) : null;
  const glucoseNow = useAppStore
    .getState()
    .glucoseLogs.find((g) => new Date(g.created_at).toDateString() === new Date().toDateString());
  const pre = preWorkoutCheck(glucoseNow?.value);

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 16,
          paddingBottom: 60,
        }}
      >
        <View style={styles.headRow}>
          <Pressable onPress={close} style={styles.backBtn}>
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle}>{t('program.title')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* ── Hero: where the patient is in the parcours ── */}
        <FadeInView>
          <LinearGradient
            colors={['#2ec983', '#159a57']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.hero}
          >
            <Text style={styles.heroGoal}>{t(`program.goal_${program.goal}`)}</Text>
            <Text style={styles.heroWeek}>
              {t('program.weekOf', { a: weekIndex, b: program.weeks })}
            </Text>
            <View style={styles.heroBar}>
              <View
                style={[
                  styles.heroBarFill,
                  { width: `${Math.min(100, ((dayIndex + 1) / (program.weeks * 7)) * 100)}%` },
                ]}
              />
            </View>
            {program.startWeight && program.targetWeight ? (
              <Text style={styles.heroWeights}>
                {program.startWeight} kg → {program.targetWeight} kg
              </Text>
            ) : null}
          </LinearGradient>
        </FadeInView>

        {/* ── Today's budget ── */}
        <FadeInView delay={60}>
          <View style={styles.budgetCard}>
            <View style={styles.ringWrap}>
              <BudgetRing pct={budget.progress} />
              <View style={styles.ringCenter} pointerEvents="none">
                <Text style={[styles.ringValue, budget.over && { color: '#e04f5f' }]}>
                  {Math.abs(budget.kcalLeft)}
                </Text>
                <Text style={styles.ringUnit}>
                  {budget.over ? t('program.kcalOver') : t('program.kcalLeft')}
                </Text>
              </View>
            </View>
            <View style={{ flex: 1, gap: 10 }}>
              <View>
                <Text style={styles.budgetLabel}>{t('program.eatenToday')}</Text>
                <Text style={styles.budgetValue}>
                  {budget.kcalEaten} / {budget.kcalTarget} kcal
                </Text>
              </View>
              <View>
                <Text style={styles.budgetLabel}>{t('program.carbsLeft')}</Text>
                <Text style={[styles.budgetValue, { color: '#f79009' }]}>
                  {budget.carbsLeft} g
                </Text>
              </View>
            </View>
          </View>
        </FadeInView>

        {/* ── The next meal — the heart of the feature ── */}
        <FadeInView delay={120}>
          <Text style={styles.sectionHead}>🍽️ {t('program.nextMealTitle')}</Text>
          {nextMeal ? (
            <View style={styles.nextCard}>
              <View style={styles.nextHead}>
                <Text style={styles.nextEmoji}>{nextMeal.emoji || SLOT_EMOJI[nextMeal.slot]}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.nextSlot}>{t(`bolus.meal_${nextMeal.slot}`)}</Text>
                  <Text style={styles.nextTitle}>{nextMeal.title}</Text>
                </View>
              </View>

              {/* Why the numbers moved since the plan was written */}
              {retarget?.reason ? (
                <View style={styles.adaptBox}>
                  <Text style={styles.adaptText}>
                    ⚡ {t(`program.adapt_${retarget.reason}`, {
                      kcal: retarget.kcal,
                      carbs: retarget.carbs,
                    })}
                  </Text>
                </View>
              ) : null}

              <View style={styles.macroLine}>
                <Text style={styles.macroChip}>
                  🍞 {retarget?.carbs ?? nextMeal.carbs} g
                </Text>
                <Text style={styles.macroChip}>🔥 {retarget?.kcal ?? nextMeal.kcal} kcal</Text>
                {nextMeal.gi ? <Text style={styles.macroChip}>IG {nextMeal.gi}</Text> : null}
                {!nextMeal.resolved ? (
                  <Text style={[styles.macroChip, styles.macroChipWarn]}>
                    ~ {t('program.estimated')}
                  </Text>
                ) : null}
              </View>

              {nextMeal.why ? <Text style={styles.whyText}>{nextMeal.why}</Text> : null}

              <View style={styles.actionRow}>
                <Pressable
                  style={styles.primaryAction}
                  onPress={() => markEaten(today, nextMeal.slot)}
                >
                  <Text style={styles.primaryActionText}>✓ {t('program.ateIt')}</Text>
                </Pressable>
                <Pressable
                  style={styles.ghostAction}
                  onPress={() =>
                    router.push({
                      pathname: '/bolus',
                      params: { carbs: String(retarget?.carbs ?? nextMeal.carbs) },
                    } as any)
                  }
                >
                  <Text style={styles.ghostActionText}>💉 {t('program.myDose')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.pendingCard}>
              <Text style={styles.pendingText}>
                {todayPlan ? t('program.allEaten') : t('program.planPending')}
              </Text>
            </View>
          )}
        </FadeInView>

        {/* ── The whole day ── */}
        {todayPlan?.meals?.length ? (
          <FadeInView delay={180}>
            <Text style={styles.sectionHead}>📋 {t('program.todayMeals')}</Text>
            {MEAL_SLOTS.map((s) => {
              const m = todayPlan.meals.find((x) => x.slot === s);
              if (!m) return null;
              const done = !!m.eatenAt;
              return (
                <View key={s} style={[styles.mealRow, done && styles.mealRowDone]}>
                  <Text style={styles.mealEmoji}>{m.emoji || SLOT_EMOJI[s]}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mealSlot}>{t(`bolus.meal_${s}`)}</Text>
                    <Text style={[styles.mealTitle, done && styles.mealTitleDone]}>{m.title}</Text>
                  </View>
                  <Text style={styles.mealCarbs}>{m.carbs} g</Text>
                  {done ? <Text style={styles.mealCheck}>✓</Text> : null}
                </View>
              );
            })}
          </FadeInView>
        ) : null}

        {/* ── Today's training ── */}
        <FadeInView delay={240}>
          <Text style={styles.sectionHead}>🏋️ {t('program.workoutTitle')}</Text>
          {session ? (
            <View style={styles.workoutCard}>
              <Text style={styles.workoutTitle}>
                {i18n.language.startsWith('ar')
                  ? session.title_ar
                  : i18n.language.startsWith('en')
                    ? session.title_en
                    : session.title_fr}
              </Text>
              <Text style={styles.workoutMeta}>
                ⏱️ {session.minutes} min · 🔥 ~{session.estKcal} kcal
              </Text>

              {/* Glucose comes BEFORE the first rep, always. */}
              <View
                style={[
                  styles.preBox,
                  pre.verdict === 'stop' && styles.preStop,
                  pre.verdict === 'fuel' && styles.preFuel,
                ]}
              >
                <Text style={styles.preText}>{t(`program.${pre.key}`)}</Text>
              </View>

              {session.blocks.slice(0, 4).map((b, i) => {
                const ex = getExercise(b.exerciseId);
                if (!ex) return null;
                return (
                  <View key={i} style={styles.blockRow}>
                    <Text style={styles.blockName} numberOfLines={1}>
                      {i18n.language.startsWith('ar') ? ex.name_ar : ex.name_fr}
                    </Text>
                    <Text style={styles.blockDose}>
                      {b.sets}×{b.reps ?? `${b.seconds}s`}
                    </Text>
                  </View>
                );
              })}

              <Pressable
                style={styles.workoutCta}
                onPress={() =>
                  router.push({
                    pathname: '/program-workout',
                    params: { id: session.id },
                  } as any)
                }
              >
                <Text style={styles.workoutCtaText}>{t('program.openWorkout')} →</Text>
              </Pressable>
            </View>
          ) : (
            <View style={styles.pendingCard}>
              <Text style={styles.pendingText}>😴 {t('program.restDay')}</Text>
            </View>
          )}
        </FadeInView>

        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>🛡️ {t('program.disclaimer')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 30 },
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

  /* Empty state */
  emptyWrap: { gap: 16 },
  emptyHero: {
    borderRadius: 24,
    padding: 24,
    alignItems: 'center',
    shadowColor: GREEN,
    shadowOpacity: 0.3,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 6,
  },
  emptyEmoji: { fontSize: 44 },
  emptyTitle: {
    fontFamily: F800,
    fontSize: 21,
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 10,
  },
  emptySub: {
    fontFamily: F500,
    fontSize: 13,
    lineHeight: 19,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    marginTop: 6,
  },
  sellList: { gap: 11, paddingHorizontal: 4 },
  sellRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  sellDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: GREEN, marginTop: 6 },
  sellText: { flex: 1, fontFamily: F600, fontSize: 13, lineHeight: 19, color: '#41505f' },

  genTitle: { fontFamily: F800, fontSize: 17, color: INK, marginTop: 18, textAlign: 'center' },
  genSub: {
    fontFamily: F500,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#667085',
    marginTop: 6,
    textAlign: 'center',
  },

  /* Hero */
  hero: {
    borderRadius: 22,
    padding: 20,
    shadowColor: GREEN,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroGoal: { fontFamily: F600, fontSize: 12.5, color: 'rgba(255,255,255,0.9)' },
  heroWeek: { fontFamily: F800, fontSize: 24, color: '#ffffff', marginTop: 2 },
  heroBar: {
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.28)',
    marginTop: 12,
    overflow: 'hidden',
  },
  heroBarFill: { height: 7, borderRadius: 4, backgroundColor: '#ffffff' },
  heroWeights: { fontFamily: F600, fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 9 },

  /* Budget */
  budgetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    marginTop: 12,
    ...shadows.card,
  },
  ringWrap: { width: 118, height: 118, alignItems: 'center', justifyContent: 'center' },
  ringCenter: { position: 'absolute', alignItems: 'center' },
  ringValue: { fontFamily: F800, fontSize: 26, color: INK, letterSpacing: -0.8 },
  ringUnit: { fontFamily: F600, fontSize: 10.5, color: '#8a98a7', marginTop: -2 },
  budgetLabel: { fontFamily: F600, fontSize: 11.5, color: '#8a98a7' },
  budgetValue: { fontFamily: F800, fontSize: 15, color: INK, marginTop: 1 },

  sectionHead: { fontFamily: F800, fontSize: 15, color: INK, marginTop: 22, marginBottom: 10 },

  /* Next meal */
  nextCard: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#dff3e8',
    ...shadows.card,
  },
  nextHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  nextEmoji: { fontSize: 30 },
  nextSlot: { fontFamily: F600, fontSize: 11.5, color: GREEN },
  nextTitle: { fontFamily: F800, fontSize: 16, color: INK, marginTop: 1 },
  adaptBox: {
    backgroundColor: '#fff8ec',
    borderRadius: 12,
    padding: 11,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#f2e0bd',
  },
  adaptText: { fontFamily: F600, fontSize: 11.5, lineHeight: 16, color: '#8a5a10' },
  macroLine: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  macroChip: {
    fontFamily: F700,
    fontSize: 11.5,
    color: '#41505f',
    backgroundColor: '#f1f4f9',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 11,
    overflow: 'hidden',
  },
  macroChipWarn: { backgroundColor: '#fdf0d8', color: '#8a5a10' },
  whyText: {
    fontFamily: F500,
    fontSize: 12,
    lineHeight: 17,
    color: '#667085',
    marginTop: 10,
  },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  primaryAction: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: { fontFamily: F700, fontSize: 13.5, color: '#ffffff' },
  ghostAction: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#d6dbe4',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostActionText: { fontFamily: F700, fontSize: 13.5, color: '#41505f' },

  pendingCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    ...shadows.card,
  },
  pendingText: {
    fontFamily: F600,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#667085',
    textAlign: 'center',
  },

  /* Day list */
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
  mealRowDone: { opacity: 0.6 },
  mealEmoji: { fontSize: 20 },
  mealSlot: { fontFamily: F600, fontSize: 10.5, color: '#8a98a7' },
  mealTitle: { fontFamily: F700, fontSize: 13, color: INK, marginTop: 1 },
  mealTitleDone: { textDecorationLine: 'line-through' },
  mealCarbs: { fontFamily: F800, fontSize: 13, color: '#f79009' },
  mealCheck: { fontFamily: F800, fontSize: 15, color: GREEN },

  /* Workout */
  workoutCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    ...shadows.card,
  },
  workoutTitle: { fontFamily: F800, fontSize: 15, color: INK },
  workoutMeta: { fontFamily: F600, fontSize: 11.5, color: '#8a98a7', marginTop: 3 },
  preBox: {
    backgroundColor: '#eef4ff',
    borderRadius: 12,
    padding: 11,
    marginTop: 12,
  },
  preStop: { backgroundColor: '#fdecec' },
  preFuel: { backgroundColor: '#fff8ec' },
  preText: { fontFamily: F600, fontSize: 11.5, lineHeight: 16, color: '#3f5b8a' },
  blockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  blockName: { flex: 1, fontFamily: F600, fontSize: 12.5, color: '#41505f' },
  blockDose: { fontFamily: F800, fontSize: 12.5, color: INK },
  workoutCta: {
    height: 44,
    borderRadius: 13,
    backgroundColor: '#f1f4f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  workoutCtaText: { fontFamily: F700, fontSize: 13, color: '#41505f' },

  cta: {
    height: 56,
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    shadowColor: GREEN,
    shadowOpacity: 0.34,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  ctaText: { fontFamily: F700, fontSize: 15, color: '#ffffff' },
  ctaArrow: { fontFamily: F800, fontSize: 18, color: '#ffffff', marginTop: -1 },

  disclaimerBox: {
    backgroundColor: '#eef1f6',
    borderRadius: 14,
    padding: 13,
    marginTop: 22,
  },
  disclaimerText: { fontFamily: F500, fontSize: 11.5, lineHeight: 17, color: '#5d6b7c' },
});
