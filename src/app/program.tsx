import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft, FadeInView, Spinner } from '@/components/ui';
import { MealDoneModal } from '@/components/program/MealDoneModal';
import { ProgramCalendar } from '@/components/program/ProgramCalendar';
import { getSession, preWorkoutCheck, getExercise } from '@/data/workouts';
import {
  currentDay,
  dayProgress,
  DEFAULT_CONSTRAINTS,
  generateDay,
  isoDay,
  loadProgram,
  logPlannedMeal,
  mergeDays,
  nextDayDate,
  nextSlot,
  plannedMealResult,
  previewTargets,
  retargetNextMeal,
  saveDays,
  saveProgram,
  sessionOptions,
  todayBudget,
  type GenerateError,
  type PlannedMeal,
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

/** Snap a ratio to the portions the confirmation sheet actually offers. */
function snapPortion(ratio: number): number {
  const steps = [0.5, 0.75, 1, 1.25, 1.5];
  return steps.reduce((best, s) => (Math.abs(s - ratio) < Math.abs(best - ratio) ? s : best), 1);
}

export default function ProgramScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams();
  const { profile } = useAppStore();
  const {
    program,
    days,
    generating,
    setProgram,
    setDays,
    upsertDay,
    setGenerating,
    patchMeal,
    skipWorkout,
    setDayWorkout,
    confirmDay,
  } = useProgramStore();
  const [genError, setGenError] = useState<GenerateError | null>(null);
  const [confirming, setConfirming] = useState<PlannedMeal | null>(null);
  const [advancing, setAdvancing] = useState(false);

  const today = isoDay(new Date());

  /* The day the patient is living: the oldest one they have not closed.
     Tomorrow simply does not exist until this one is closed. */
  const day = useMemo(() => currentDay(days), [days]);
  const progress = useMemo(() => dayProgress(day), [day]);
  const isToday = day?.date === today;
  const isAhead = !!day && day.date > today; // already unlocked, starts later
  const isStale = !!day && day.date < today; // left unfinished on a past date

  /* ── Persistence ── */

  /** Push one day's current state to the server (fire and forget on error). */
  const persist = useCallback(
    async (date: string) => {
      const p = useProgramStore.getState().program;
      const fresh = useProgramStore.getState().days.find((d) => d.date === date);
      if (p && fresh) await saveDays(p.id, [fresh]);
    },
    []
  );

  /** Compose one day from scratch, with every earlier day in mind. */
  const planDay = useCallback(
    async (p: Program, date: string, dayIndex: number) => {
      setGenerating(true);
      setGenError(null);
      const res = await generateDay({
        program: p,
        date: new Date(`${date}T12:00:00`),
        dayIndex,
        history: useProgramStore.getState().days,
        language: i18n.language,
      });
      if ('day' in res) {
        upsertDay(res.day);
        await saveDays(p.id, [res.day]);
      } else {
        setGenError(res.error);
      }
      setGenerating(false);
      return 'day' in res;
    },
    [i18n.language, upsertDay, setGenerating]
  );

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

    const saved = (await saveProgram(draft)) ?? { ...draft, id: 'local' };
    setProgram(saved);
    setDays([]);
    // Only TODAY is composed now. Each following day is written when the
    // patient has finished the one before it — one small call instead of a
    // week-sized one that used to overrun the model and lose everything.
    await planDay(saved, today, 0);
  }, [params, profile, today, setProgram, setDays, planDay]);

  useEffect(() => {
    if (params.create === '1' && !program) void createFromParams();
    // Creation runs once, on the hand-off from the wizard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.create]);

  /* Rehydrate from the server: the parcours belongs to the account, not to
     this phone's local storage. What the device did offline wins per day. */
  useEffect(() => {
    if (params.create === '1') return;
    let alive = true;
    void (async () => {
      const remote = await loadProgram();
      if (!alive || !remote) return;
      const state = useProgramStore.getState();
      const sameProgram = state.program?.id === remote.program.id;
      // A different active program on the account replaces this device's copy
      // wholesale — mixing days from two parcours would produce a history
      // that never happened.
      if (!state.program || sameProgram || state.program.id === 'local') {
        setProgram(remote.program);
        setDays(sameProgram ? mergeDays(state.days, remote.days) : remote.days);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* A program with no day at all (creation half-failed, or a fresh install
     that just pulled the program row) writes its first day on open. Days
     after the first are NEVER auto-written — they are earned. */
  useEffect(() => {
    if (!program || days.length > 0 || generating || genError) return;
    if (params.create === '1') return;
    void planDay(program, today, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [program?.id, days.length, generating, genError]);

  /* ── Actions ── */

  /** The patient confirms they ate a planned meal: it enters the journal. */
  const onConfirmMeal = useCallback(
    async (portion: number, dose: boolean) => {
      const meal = confirming;
      if (!meal || !day) return;

      // THIS is what makes the day's numbers move: a real journal entry,
      // filed under its slot, exactly like a scanned plate. The budget ring,
      // the home screen, the timeline and the bolus advisor all read it.
      const scan = await logPlannedMeal(meal, portion);
      patchMeal(day.date, meal.slot, {
        eatenAt: scan?.created_at ?? new Date().toISOString(),
        mealId: scan?.id ?? null,
        portion,
      });
      await persist(day.date);
      setConfirming(null);

      if (dose) {
        router.push({
          pathname: '/bolus',
          params: {
            carbs: String(Math.round(plannedMealResult(meal, portion).carbohydrates)),
            meal: meal.slot,
          },
        } as any);
      }
    },
    [confirming, day, patchMeal, persist, router]
  );

  /**
   * Move today's session — a different place, or simply another session of
   * the same place. Called with the current place, it cycles to the next
   * option; called with a new one, it lands on that place's first session.
   */
  const swapSession = useCallback(
    (place: Program['trainingPlace']) => {
      if (!program || !day || day.workoutDoneAt) return;
      const opts = sessionOptions(place, program.activityLevel);
      if (!opts.length) return;
      const i = opts.findIndex((o) => o.id === day.workoutId);
      setDayWorkout(day.date, opts[(i + 1) % opts.length].id);
      void persist(day.date);
    },
    [program, day, setDayWorkout, persist]
  );

  /** "I could not train today" — settles the session without faking it. */
  const onSkipWorkout = useCallback(async () => {
    if (!day) return;
    skipWorkout(day.date);
    await persist(day.date);
  }, [day, skipWorkout, persist]);

  /** Close the day and unlock the next — the only way the parcours advances. */
  const advance = useCallback(async () => {
    if (!program || !day || advancing) return;
    setAdvancing(true);
    try {
      // Restarting after a break closes EVERY day left open behind us in one
      // go. Making the patient tap through each abandoned day one at a time
      // would be a punishment for having had a hard week.
      const stale = days.filter((d) => !d.confirmedAt && d.date < today);
      const toClose = stale.length ? stale : [day];
      for (const d of toClose) {
        confirmDay(d.date);
        await persist(d.date);
      }
      const fresh = useProgramStore.getState().days;
      // The invariant the whole feature rests on: never write a new day while
      // one is still open. Closing an abandoned day can reveal a day already
      // waiting — that one becomes the current day, and nothing is generated.
      if (currentDay(fresh)) return;
      if (fresh.length >= program.weeks * 7) return; // parcours complete
      await planDay(program, nextDayDate(fresh), fresh.length);
    } finally {
      setAdvancing(false);
    }
  }, [program, day, days, today, advancing, confirmDay, persist, planDay]);

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
  const slot = isToday ? nextSlot(day) : null;
  const nextMeal = day?.meals.find((m) => m.slot === slot) ?? null;
  const retarget = day && isToday ? retargetNextMeal(program, day) : null;

  // Where the patient is in the parcours: counted in days LIVED, not in days
  // elapsed. Someone who paused for a week resumes at day 5, not day 12.
  const dayIndex = day?.dayIndex ?? days.length;
  const totalDays = program.weeks * 7;
  const weekIndex = Math.min(program.weeks, Math.floor(dayIndex / 7) + 1);
  const confirmedCount = days.filter((d) => d.confirmedAt).length;
  const finished = !day && days.length >= totalDays;

  const workoutId = day?.workoutId ?? null;
  const session = workoutId ? getSession(workoutId) : null;
  const sessionPlace = session?.place ?? program.trainingPlace;
  const glucoseNow = useAppStore
    .getState()
    .glucoseLogs.find((g) => new Date(g.created_at).toDateString() === new Date().toDateString());
  const pre = preWorkoutCheck(glucoseNow?.value);

  const dayLabel = new Date(`${day?.date ?? today}T12:00:00`).toLocaleDateString(i18n.language, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

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
          <Pressable
            onPress={() => router.push('/program-manage' as any)}
            style={styles.backBtn}
            accessibilityLabel={t('program.manageTitle')}
          >
            <Text style={styles.gear}>⚙️</Text>
          </Pressable>
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
                  { width: `${Math.min(100, (confirmedCount / totalDays) * 100)}%` },
                ]}
              />
            </View>
            <Text style={styles.heroWeights}>
              {t('program.daysDone', { done: confirmedCount, total: totalDays })}
              {program.startWeight && program.targetWeight
                ? ` · ${program.startWeight} kg → ${program.targetWeight} kg`
                : ''}
            </Text>
          </LinearGradient>
        </FadeInView>

        {/* ── The parcours, day by day ── */}
        {days.length ? (
          <FadeInView delay={40}>
            <ProgramCalendar
              days={days}
              onOpenDay={(date) =>
                router.push({ pathname: '/program-day', params: { date } } as any)
              }
            />
          </FadeInView>
        ) : null}

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

        {/* ── The parcours is over ── */}
        {finished ? (
          <FadeInView delay={100}>
            <LinearGradient
              colors={['#2ec983', '#159a57']}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.celebrate}
            >
              <Text style={styles.celebrateEmoji}>🏆</Text>
              <Text style={styles.celebrateTitle}>{t('program.finishedTitle')}</Text>
              <Text style={styles.celebrateSub}>
                {t('program.finishedSub', { weeks: program.weeks })}
              </Text>
            </LinearGradient>
          </FadeInView>
        ) : null}

        {/* ── Day finished: the congratulation, then tomorrow ── */}
        {day && progress.complete && !progress.confirmed ? (
          <FadeInView delay={100}>
            <LinearGradient
              colors={['#2ec983', '#159a57']}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.celebrate}
            >
              <Text style={styles.celebrateEmoji}>🎉</Text>
              <Text style={styles.celebrateTitle}>{t('program.dayDoneTitle')}</Text>
              <Text style={styles.celebrateSub}>
                {t('program.dayDoneSub', {
                  meals: progress.mealsDone,
                  n: dayIndex + 1,
                })}
              </Text>
              <Pressable onPress={advance} disabled={advancing} style={styles.celebrateCta}>
                {advancing ? (
                  <Spinner size={20} color="#159a57" />
                ) : (
                  <Text style={styles.celebrateCtaText}>{t('program.toTomorrow')} →</Text>
                )}
              </Pressable>
            </LinearGradient>
          </FadeInView>
        ) : null}

        {/* ── Every meal eaten, but the session was not trained ──
            No celebration for a day that was only half kept — but no dead
            end either. A missed session must never lock the parcours. */}
        {day && progress.closable && !progress.complete && !progress.confirmed ? (
          <FadeInView delay={100}>
            <View style={styles.settleCard}>
              <Text style={styles.settleTitle}>🍽️ {t('program.mealsAllDoneTitle')}</Text>
              <Text style={styles.settleText}>{t('program.mealsAllDoneSub')}</Text>
              <Pressable onPress={advance} disabled={advancing} style={styles.settleCta}>
                {advancing ? (
                  <Spinner size={18} color="#41505f" />
                ) : (
                  <Text style={styles.settleCtaText}>{t('program.closeDayAnyway')} →</Text>
                )}
              </Pressable>
            </View>
          </FadeInView>
        ) : null}

        {/* ── An unfinished day left behind ── */}
        {isStale && !progress.complete ? (
          <FadeInView delay={100}>
            <View style={styles.staleCard}>
              <Text style={styles.staleTitle}>⏳ {t('program.staleTitle', { date: dayLabel })}</Text>
              <Text style={styles.staleText}>{t('program.staleSub')}</Text>
              <Pressable onPress={advance} disabled={advancing} style={styles.staleCta}>
                {advancing ? (
                  <Spinner size={18} color="#8a5a10" />
                ) : (
                  <Text style={styles.staleCtaText}>{t('program.resumeToday')} →</Text>
                )}
              </Pressable>
            </View>
          </FadeInView>
        ) : null}

        {/* ── Tomorrow is written and waiting ── */}
        {isAhead ? (
          <FadeInView delay={120}>
            <View style={styles.aheadCard}>
              <Text style={styles.aheadTitle}>🔓 {t('program.tomorrowReadyTitle')}</Text>
              <Text style={styles.aheadText}>
                {t('program.tomorrowReadySub', { date: dayLabel })}
              </Text>
            </View>
          </FadeInView>
        ) : null}

        {/* ── The next meal — the heart of the feature ── */}
        {isToday ? (
          <FadeInView delay={140}>
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
                  <Text style={styles.macroChip}>🍞 {nextMeal.carbs} g</Text>
                  <Text style={styles.macroChip}>🔥 {nextMeal.kcal} kcal</Text>
                  {nextMeal.gi ? <Text style={styles.macroChip}>IG {nextMeal.gi}</Text> : null}
                  {!nextMeal.resolved ? (
                    <Text style={[styles.macroChip, styles.macroChipWarn]}>
                      ~ {t('program.estimated')}
                    </Text>
                  ) : null}
                </View>

                {nextMeal.why ? <Text style={styles.whyText}>{nextMeal.why}</Text> : null}

                <View style={styles.actionRow}>
                  <Pressable style={styles.primaryAction} onPress={() => setConfirming(nextMeal)}>
                    <Text style={styles.primaryActionText}>✓ {t('program.ateIt')}</Text>
                  </Pressable>
                  <Pressable
                    style={styles.ghostAction}
                    onPress={() =>
                      router.push({
                        pathname: '/bolus',
                        params: { carbs: String(nextMeal.carbs), meal: nextMeal.slot },
                      } as any)
                    }
                  >
                    <Text style={styles.ghostActionText}>💉 {t('program.myDose')}</Text>
                  </Pressable>
                </View>
              </View>
            ) : (
              <View style={styles.pendingCard}>
                <Text style={styles.pendingText}>{t('program.allEaten')}</Text>
              </View>
            )}
          </FadeInView>
        ) : null}

        {/* ── The next day could not be written ──
            Say WHY: the old copy blamed the network even when the patient
            was online, which was simply untrue. */}
        {!day && !finished ? (
          <FadeInView delay={140}>
            <View style={[styles.pendingCard, { marginTop: 22 }]}>
              <Text style={styles.pendingText}>{t(`program.err_${genError ?? 'unknown'}`)}</Text>
              <Pressable
                style={styles.retryBtn}
                onPress={() => planDay(program, nextDayDate(days), days.length)}
              >
                <Text style={styles.retryBtnText}>↻ {t('program.retry')}</Text>
              </Pressable>
            </View>
          </FadeInView>
        ) : null}

        {/* ── The whole day ── */}
        {day?.meals?.length ? (
          <FadeInView delay={180}>
            <Text style={styles.sectionHead}>
              📋 {isToday ? t('program.todayMeals') : t('program.dayMeals', { date: dayLabel })}
            </Text>
            {MEAL_SLOTS.map((s) => {
              const m = day.meals.find((x) => x.slot === s);
              if (!m) return null;
              const done = !!m.eatenAt;
              return (
                <Pressable
                  key={s}
                  disabled={done || !isToday}
                  onPress={() => setConfirming(m)}
                  style={[styles.mealRow, done && styles.mealRowDone]}
                >
                  <Text style={styles.mealEmoji}>{m.emoji || SLOT_EMOJI[s]}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.mealSlot}>{t(`bolus.meal_${s}`)}</Text>
                    <Text style={[styles.mealTitle, done && styles.mealTitleDone]}>{m.title}</Text>
                  </View>
                  <Text style={styles.mealCarbs}>{m.carbs} g</Text>
                  {done ? <Text style={styles.mealCheck}>✓</Text> : null}
                </Pressable>
              );
            })}
          </FadeInView>
        ) : null}

        {/* ── The day's training ── */}
        {day ? (
        <FadeInView delay={240}>
          {/* "Your session TODAY" only when it IS today — this block also
              shows a day left behind and a day not started yet. */}
          <Text style={styles.sectionHead}>
            🏋️ {isToday ? t('program.workoutTitle') : t('program.workoutSection')}
          </Text>
          {session ? (
            <View style={styles.workoutCard}>
              <View style={styles.workoutHead}>
                <Text style={{ flex: 1 }}>
                  <Text style={styles.workoutTitle}>
                    {i18n.language.startsWith('ar')
                      ? session.title_ar
                      : i18n.language.startsWith('en')
                        ? session.title_en
                        : session.title_fr}
                  </Text>
                </Text>
                {progress.workoutDone ? <Text style={styles.workoutDone}>✓</Text> : null}
              </View>
              <Text style={styles.workoutMeta}>
                ⏱️ {session.minutes} min · 🔥 ~{session.estKcal} kcal
              </Text>

              {/* Glucose comes BEFORE the first rep, always. */}
              {isToday ? (
                <View
                  style={[
                    styles.preBox,
                    pre.verdict === 'stop' && styles.preStop,
                    pre.verdict === 'fuel' && styles.preFuel,
                  ]}
                >
                  <Text style={styles.preText}>{t(`program.${pre.key}`)}</Text>
                </View>
              ) : null}

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

              {/* Where the patient is training TODAY. Life moves: home one
                  day, the park the next, the gym on Saturday — and the
                  session has to follow, without re-doing the whole program. */}
              {isToday && !progress.workoutDone ? (
                <>
                  <Text style={styles.placeLabel}>{t('program.trainingToday')}</Text>
                  <View style={styles.placeRow}>
                    {(['home', 'gym', 'outdoor'] as const).map((pl) => {
                      const on = sessionPlace === pl;
                      return (
                        <Pressable
                          key={pl}
                          onPress={() => swapSession(pl)}
                          style={[styles.placeChip, on && styles.placeChipOn]}
                        >
                          <Text style={[styles.placeChipText, on && styles.placeChipTextOn]}>
                            {t(`program.place_${pl}`)}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>

                  <View style={styles.workoutActions}>
                    <Pressable
                      style={styles.workoutCta}
                      onPress={() =>
                        router.push({
                          pathname: '/program-workout',
                          params: { id: session.id, date: day?.date ?? today },
                        } as any)
                      }
                    >
                      <Text style={styles.workoutCtaText}>{t('program.openWorkout')} →</Text>
                    </Pressable>
                    <Pressable style={styles.shuffleBtn} onPress={() => swapSession(sessionPlace)}>
                      <Text style={styles.shuffleText}>🔀</Text>
                    </Pressable>
                  </View>

                  {progress.workoutSkipped ? (
                    <Text style={styles.skipNote}>{t('program.sessionSkipped')}</Text>
                  ) : (
                    <Pressable onPress={onSkipWorkout} style={styles.skipBtn}>
                      <Text style={styles.skipBtnText}>{t('program.cantTrain')}</Text>
                    </Pressable>
                  )}
                </>
              ) : null}
            </View>
          ) : (
            <View style={styles.pendingCard}>
              <Text style={styles.pendingText}>😴 {t('program.restDay')}</Text>
            </View>
          )}
        </FadeInView>
        ) : null}

        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>🛡️ {t('program.disclaimer')}</Text>
        </View>
      </ScrollView>

      {confirming ? (
        <MealDoneModal
          meal={confirming}
          suggestedPortion={
            retarget?.reason && retarget.slot === confirming.slot && confirming.carbs > 0
              ? snapPortion(retarget.carbs / confirming.carbs)
              : 1
          }
          onClose={() => setConfirming(null)}
          onConfirm={onConfirmMeal}
        />
      ) : null}
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
  gear: { fontSize: 15 },

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

  /* Day closed / parcours closed */
  celebrate: {
    borderRadius: 22,
    padding: 20,
    alignItems: 'center',
    marginTop: 12,
    shadowColor: GREEN,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  celebrateEmoji: { fontSize: 40 },
  celebrateTitle: {
    fontFamily: F800,
    fontSize: 18,
    color: '#ffffff',
    textAlign: 'center',
    marginTop: 8,
  },
  celebrateSub: {
    fontFamily: F500,
    fontSize: 12.5,
    lineHeight: 18,
    color: 'rgba(255,255,255,0.92)',
    textAlign: 'center',
    marginTop: 6,
  },
  celebrateCta: {
    height: 46,
    paddingHorizontal: 26,
    borderRadius: 14,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  celebrateCtaText: { fontFamily: F800, fontSize: 13.5, color: '#159a57' },

  /* Day kept only in part */
  settleCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
    borderWidth: 1.5,
    borderColor: '#e4e8ef',
  },
  settleTitle: { fontFamily: F800, fontSize: 13.5, color: INK },
  settleText: {
    fontFamily: F600,
    fontSize: 12,
    lineHeight: 17,
    color: '#667085',
    marginTop: 5,
  },
  settleCta: {
    minHeight: 42,
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 13,
    backgroundColor: '#f1f4f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  settleCtaText: { fontFamily: F800, fontSize: 12.5, color: '#41505f', textAlign: 'center' },

  /* Training place chooser */
  placeLabel: { fontFamily: F600, fontSize: 11, color: '#8a98a7', marginTop: 14 },
  placeRow: { flexDirection: 'row', gap: 7, marginTop: 7 },
  placeChip: {
    flex: 1,
    minHeight: 36,
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#e4e8ef',
    backgroundColor: '#f8fafc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeChipOn: { borderColor: GREEN, backgroundColor: '#eafaf1' },
  placeChipText: {
    fontFamily: F700,
    fontSize: 11,
    color: '#8a98a7',
    textAlign: 'center',
  },
  placeChipTextOn: { color: '#0f7a42' },
  workoutActions: { flexDirection: 'row', gap: 8, marginTop: 12 },
  shuffleBtn: {
    width: 44,
    minHeight: 44,
    borderRadius: 13,
    backgroundColor: '#f1f4f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shuffleText: { fontSize: 16 },
  skipBtn: { minHeight: 34, alignItems: 'center', justifyContent: 'center', marginTop: 8 },
  skipBtnText: {
    fontFamily: F600,
    fontSize: 11.5,
    color: '#8a98a7',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  skipNote: {
    fontFamily: F600,
    fontSize: 11.5,
    lineHeight: 16,
    color: '#8a5a10',
    backgroundColor: '#fff8ec',
    borderRadius: 11,
    padding: 10,
    marginTop: 10,
  },

  /* Left behind */
  staleCard: {
    backgroundColor: '#fff8ec',
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#f2e0bd',
  },
  staleTitle: { fontFamily: F800, fontSize: 13.5, color: '#8a5a10' },
  staleText: {
    fontFamily: F600,
    fontSize: 12,
    lineHeight: 17,
    color: '#8a5a10',
    marginTop: 5,
    opacity: 0.9,
  },
  staleCta: {
    height: 42,
    borderRadius: 13,
    backgroundColor: '#fdf0d8',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 12,
  },
  staleCtaText: { fontFamily: F800, fontSize: 12.5, color: '#8a5a10' },

  /* Unlocked, starts later */
  aheadCard: {
    backgroundColor: '#eafaf1',
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#c8ecd9',
  },
  aheadTitle: { fontFamily: F800, fontSize: 13.5, color: '#0f7a42' },
  aheadText: { fontFamily: F600, fontSize: 12, lineHeight: 17, color: '#0f7a42', marginTop: 5 },

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
  /* minHeight, not height: German and Arabic wrap these labels onto a second
     line, and a fixed height pushed the text outside the button. */
  primaryAction: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryActionText: {
    fontFamily: F700,
    fontSize: 13.5,
    color: '#ffffff',
    textAlign: 'center',
  },
  ghostAction: {
    flex: 1,
    minHeight: 46,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#d6dbe4',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostActionText: {
    fontFamily: F700,
    fontSize: 13.5,
    color: '#41505f',
    textAlign: 'center',
  },

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
  retryBtn: {
    marginTop: 14,
    height: 42,
    paddingHorizontal: 22,
    borderRadius: 13,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryBtnText: { fontFamily: F700, fontSize: 13, color: '#ffffff' },

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
  workoutHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  workoutTitle: { fontFamily: F800, fontSize: 15, color: INK },
  workoutDone: { fontFamily: F800, fontSize: 16, color: GREEN },
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
