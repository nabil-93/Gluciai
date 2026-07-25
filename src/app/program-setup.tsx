import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft, FadeInView } from '@/components/ui';
import { parseDecimal, sanitizeDecimal } from '@/lib/num';
import { DEFAULT_CONSTRAINTS, previewTargets, type ProgramConstraints } from '@/services/program';
import type { ActivityLevel, ProgramGoal } from '@/services/programEngine';
import { useAppStore } from '@/store/useAppStore';
import { shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN = '#1fbc78';
const INK = '#101828';

/* The parcours is built one decision at a time. `pace` is skipped when the
 * goal has no weight target, so the patient never answers a question that
 * does not apply to them. */
const STEPS = ['goal', 'body', 'pace', 'activity', 'training', 'food', 'recap'] as const;
type Step = (typeof STEPS)[number];

const GOALS: { v: ProgramGoal; emoji: string }[] = [
  { v: 'lose', emoji: '🔥' },
  { v: 'gain', emoji: '💪' },
  { v: 'stabilize', emoji: '📊' },
  { v: 'sport', emoji: '🏃' },
];

const LEVELS: { v: ActivityLevel; emoji: string }[] = [
  { v: 'sedentary', emoji: '🪑' },
  { v: 'light', emoji: '🚶' },
  { v: 'moderate', emoji: '🚴' },
  { v: 'active', emoji: '🏋️' },
  { v: 'very_active', emoji: '🔥' },
];

const PLACES = ['home', 'gym', 'outdoor', 'mixed'] as const;
const PACES = [0.25, 0.5, 0.75, 1];
/* Common allergies and dislikes — one tap beats typing on a phone. */
const AVOID_PRESETS = ['gluten', 'lactose', 'egg', 'nuts', 'fish', 'seafood', 'redMeat'];

export default function ProgramSetupScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { profile } = useAppStore();

  const [step, setStep] = useState<Step>('goal');
  const [goal, setGoal] = useState<ProgramGoal>('lose');
  const [weight, setWeight] = useState(profile?.weight ? String(profile.weight) : '');
  const [targetWeight, setTargetWeight] = useState('');
  const [rate, setRate] = useState(0.5);
  const [level, setLevel] = useState<ActivityLevel>('light');
  const [place, setPlace] = useState<(typeof PLACES)[number]>('home');
  const [trainingDays, setTrainingDays] = useState(3);
  const [constraints, setConstraints] = useState<ProgramConstraints>(DEFAULT_CONSTRAINTS);
  const [avoidText, setAvoidText] = useState('');

  const wantsWeight = goal === 'lose' || goal === 'gain';

  /* Only the steps that apply to this goal. */
  const steps = useMemo(
    () => STEPS.filter((s) => (s === 'pace' ? wantsWeight : true)),
    [wantsWeight]
  );
  const stepIndex = steps.indexOf(step);

  /* The engine runs on every keystroke — the numbers on the recap are the
     real ones, computed locally, before anything is saved or sent. */
  const targets = useMemo(
    () =>
      previewTargets({
        // A weight typed here beats a stale profile value.
        profile: { ...(profile ?? {}), weight: parseDecimal(weight) ?? profile?.weight } as any,
        goal,
        targetWeight: parseDecimal(targetWeight),
        ratePerWeek: rate,
        activityLevel: level,
        trainingDaysPerWeek: trainingDays,
      }),
    [profile, weight, goal, targetWeight, rate, level, trainingDays]
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const next = () => {
    const i = steps.indexOf(step);
    if (i < steps.length - 1) setStep(steps[i + 1]);
  };
  const back = () => {
    const i = steps.indexOf(step);
    if (i > 0) setStep(steps[i - 1]);
    else close();
  };

  /* A step may only be left once it has what the engine needs. */
  const canContinue = (): boolean => {
    if (step === 'body') return (parseDecimal(weight) ?? 0) > 0;
    return true;
  };

  const toggleAvoid = (key: string) =>
    setConstraints((c) => ({
      ...c,
      avoid: c.avoid.includes(key) ? c.avoid.filter((a) => a !== key) : [...c.avoid, key],
    }));

  const create = () => {
    // Hand the whole setup to the program screen, which creates the row and
    // asks the coach for the first week.
    router.replace({
      pathname: '/program',
      params: {
        create: '1',
        goal,
        weight: String(parseDecimal(weight) ?? ''),
        targetWeight: String(parseDecimal(targetWeight) ?? ''),
        rate: String(rate),
        level,
        place,
        trainingDays: String(trainingDays),
        constraints: JSON.stringify({
          ...constraints,
          avoid: [
            ...constraints.avoid,
            ...avoidText
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          ],
        }),
      },
    } as any);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 16,
          paddingBottom: 48,
        }}
      >
        <View style={styles.headRow}>
          <Pressable onPress={back} style={styles.backBtn}>
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle}>{t('program.setupTitle')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Progress */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${((stepIndex + 1) / steps.length) * 100}%` },
            ]}
          />
        </View>
        <Text style={styles.progressText}>
          {t('program.stepOf', { a: stepIndex + 1, b: steps.length })}
        </Text>

        <FadeInView key={step}>
          {/* ── GOAL ── */}
          {step === 'goal' ? (
            <>
              <Text style={styles.qTitle}>{t('program.goalQ')}</Text>
              <Text style={styles.qSub}>{t('program.goalSub')}</Text>
              <View style={{ gap: 10, marginTop: 16 }}>
                {GOALS.map((g) => {
                  const on = goal === g.v;
                  return (
                    <Pressable
                      key={g.v}
                      onPress={() => setGoal(g.v)}
                      style={[styles.bigOption, on && styles.bigOptionOn]}
                    >
                      <View style={[styles.optEmojiWrap, on && styles.optEmojiWrapOn]}>
                        <Text style={styles.optEmoji}>{g.emoji}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optTitle, on && { color: '#0e7a4d' }]}>
                          {t(`program.goal_${g.v}`)}
                        </Text>
                        <Text style={styles.optSub}>{t(`program.goalDesc_${g.v}`)}</Text>
                      </View>
                      <View style={[styles.radio, on && styles.radioOn]} />
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* ── BODY ── */}
          {step === 'body' ? (
            <>
              <Text style={styles.qTitle}>{t('program.bodyQ')}</Text>
              <Text style={styles.qSub}>{t('program.bodySub')}</Text>

              <View style={styles.fieldCard}>
                <Text style={styles.fieldLabel}>{t('program.currentWeight')}</Text>
                <View style={styles.fieldRow}>
                  <TextInput
                    value={weight}
                    onChangeText={(v) => setWeight(sanitizeDecimal(v))}
                    keyboardType="decimal-pad"
                    placeholder="70"
                    placeholderTextColor="#c2cad6"
                    style={styles.bigInput}
                  />
                  <Text style={styles.unit}>kg</Text>
                </View>
              </View>

              {wantsWeight ? (
                <View style={styles.fieldCard}>
                  <Text style={styles.fieldLabel}>{t('program.targetWeight')}</Text>
                  <View style={styles.fieldRow}>
                    <TextInput
                      value={targetWeight}
                      onChangeText={(v) => setTargetWeight(sanitizeDecimal(v))}
                      keyboardType="decimal-pad"
                      placeholder={goal === 'lose' ? '65' : '75'}
                      placeholderTextColor="#c2cad6"
                      style={styles.bigInput}
                    />
                    <Text style={styles.unit}>kg</Text>
                  </View>
                  {targets.bmi != null ? (
                    <Text style={styles.fieldNote}>
                      {t('program.bmiNote', { bmi: targets.bmi })}
                    </Text>
                  ) : null}
                </View>
              ) : null}
            </>
          ) : null}

          {/* ── PACE ── */}
          {step === 'pace' ? (
            <>
              <Text style={styles.qTitle}>{t('program.paceQ')}</Text>
              <Text style={styles.qSub}>{t('program.paceSub')}</Text>
              <View style={styles.chipWrap}>
                {PACES.map((p) => {
                  const on = rate === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setRate(p)}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {p.toLocaleString()} kg / {t('program.week')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={styles.infoBox}>
                <Text style={styles.infoText}>💡 {t('program.paceInfo')}</Text>
              </View>
              {targets.weeksToTarget ? (
                <View style={styles.projectionCard}>
                  <Text style={styles.projectionLabel}>{t('program.projection')}</Text>
                  <Text style={styles.projectionValue}>
                    {t('program.weeksCount', { n: targets.weeksToTarget })}
                  </Text>
                  <Text style={styles.projectionDate}>{targets.projectedDate}</Text>
                </View>
              ) : null}
            </>
          ) : null}

          {/* ── ACTIVITY ── */}
          {step === 'activity' ? (
            <>
              <Text style={styles.qTitle}>{t('program.activityQ')}</Text>
              <Text style={styles.qSub}>{t('program.activitySub')}</Text>
              <View style={{ gap: 9, marginTop: 16 }}>
                {LEVELS.map((l) => {
                  const on = level === l.v;
                  return (
                    <Pressable
                      key={l.v}
                      onPress={() => setLevel(l.v)}
                      style={[styles.rowOption, on && styles.bigOptionOn]}
                    >
                      <Text style={styles.rowEmoji}>{l.emoji}</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.optTitle, on && { color: '#0e7a4d' }]}>
                          {t(`program.level_${l.v}`)}
                        </Text>
                        <Text style={styles.optSub}>{t(`program.levelDesc_${l.v}`)}</Text>
                      </View>
                      <View style={[styles.radio, on && styles.radioOn]} />
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* ── TRAINING ── */}
          {step === 'training' ? (
            <>
              <Text style={styles.qTitle}>{t('program.trainingQ')}</Text>
              <Text style={styles.qSub}>{t('program.trainingSub')}</Text>

              <Text style={styles.subLabel}>{t('program.placeQ')}</Text>
              <View style={styles.chipWrap}>
                {PLACES.map((p) => {
                  const on = place === p;
                  return (
                    <Pressable
                      key={p}
                      onPress={() => setPlace(p)}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {t(`program.place_${p}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.subLabel}>{t('program.daysQ')}</Text>
              <View style={styles.chipWrap}>
                {[0, 1, 2, 3, 4, 5, 6, 7].map((d) => {
                  const on = trainingDays === d;
                  return (
                    <Pressable
                      key={d}
                      onPress={() => setTrainingDays(d)}
                      style={[styles.dayChip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{d}</Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          ) : null}

          {/* ── FOOD ── */}
          {step === 'food' ? (
            <>
              <Text style={styles.qTitle}>{t('program.foodQ')}</Text>
              <Text style={styles.qSub}>{t('program.foodSub')}</Text>

              <Text style={styles.subLabel}>{t('program.avoidQ')}</Text>
              <View style={styles.chipWrap}>
                {AVOID_PRESETS.map((a) => {
                  const on = constraints.avoid.includes(a);
                  return (
                    <Pressable
                      key={a}
                      onPress={() => toggleAvoid(a)}
                      style={[styles.chip, on && styles.chipDanger]}
                    >
                      <Text style={[styles.chipText, on && { color: '#b3261e' }]}>
                        {t(`program.avoid_${a}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={avoidText}
                onChangeText={setAvoidText}
                placeholder={t('program.avoidPlaceholder')}
                placeholderTextColor="#b6bfcc"
                style={styles.textField}
              />

              <Text style={styles.subLabel}>{t('program.cookQ')}</Text>
              <View style={styles.chipWrap}>
                {[15, 30, 45, 60].map((m) => {
                  const on = constraints.cookMinutes === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setConstraints((c) => ({ ...c, cookMinutes: m }))}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{m} min</Text>
                    </Pressable>
                  );
                })}
              </View>

              <Text style={styles.subLabel}>{t('program.budgetQ')}</Text>
              <View style={styles.chipWrap}>
                {(['low', 'medium', 'high'] as const).map((bd) => {
                  const on = constraints.budget === bd;
                  return (
                    <Pressable
                      key={bd}
                      onPress={() => setConstraints((c) => ({ ...c, budget: bd }))}
                      style={[styles.chip, on && styles.chipOn]}
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>
                        {t(`program.budget_${bd}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              <Pressable
                onPress={() => setConstraints((c) => ({ ...c, fasting: !c.fasting }))}
                style={[styles.toggleRow, constraints.fasting && styles.bigOptionOn]}
              >
                <Text style={styles.rowEmoji}>🌙</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.optTitle}>{t('program.fastingQ')}</Text>
                  <Text style={styles.optSub}>{t('program.fastingSub')}</Text>
                </View>
                <View style={[styles.radio, constraints.fasting && styles.radioOn]} />
              </Pressable>
            </>
          ) : null}

          {/* ── RECAP — the real numbers, computed locally ── */}
          {step === 'recap' ? (
            <>
              <Text style={styles.qTitle}>{t('program.recapQ')}</Text>
              <Text style={styles.qSub}>{t('program.recapSub')}</Text>

              <LinearGradient
                colors={['#2ec983', '#159a57']}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.kcalCard}
              >
                <Text style={styles.kcalLabel}>{t('program.dailyBudget')}</Text>
                <View style={styles.kcalRow}>
                  <Text style={styles.kcalValue}>{targets.dailyKcal}</Text>
                  <Text style={styles.kcalUnit}>kcal</Text>
                </View>
                <Text style={styles.kcalNote}>
                  {targets.dailyDelta === 0
                    ? t('program.maintenance', { tdee: targets.tdee })
                    : t('program.vsMaintenance', {
                        delta: Math.abs(targets.dailyDelta),
                        tdee: targets.tdee,
                        sign: targets.dailyDelta < 0 ? '−' : '+',
                      })}
                </Text>
              </LinearGradient>

              <View style={styles.macroRow}>
                {(
                  [
                    { k: 'carbs', v: targets.carbsG, c: '#f79009', e: '🍞' },
                    { k: 'protein', v: targets.proteinG, c: '#e04f5f', e: '🍗' },
                    { k: 'fat', v: targets.fatG, c: '#7a5af8', e: '🥑' },
                  ] as const
                ).map((m) => (
                  <View key={m.k} style={styles.macroCard}>
                    <Text style={styles.macroEmoji}>{m.e}</Text>
                    <Text style={[styles.macroValue, { color: m.c }]}>{m.v} g</Text>
                    <Text style={styles.macroLabel}>{t(`program.macro_${m.k}`)}</Text>
                  </View>
                ))}
              </View>

              {/* Carbs are shown per meal because that is what the insulin
                  dose is calculated from. */}
              <View style={styles.splitCard}>
                <Text style={styles.splitTitle}>🍽️ {t('program.carbSplit')}</Text>
                {(['breakfast', 'lunch', 'dinner', 'snack'] as const).map((s) => (
                  <View key={s} style={styles.splitRow}>
                    <Text style={styles.splitLabel}>{t(`bolus.meal_${s}`)}</Text>
                    <Text style={styles.splitValue}>{targets.carbsPerMeal[s]} g</Text>
                  </View>
                ))}
              </View>

              {targets.weeksToTarget ? (
                <View style={styles.projectionCard}>
                  <Text style={styles.projectionLabel}>{t('program.projection')}</Text>
                  <Text style={styles.projectionValue}>
                    {t('program.weeksCount', { n: targets.weeksToTarget })}
                  </Text>
                  <Text style={styles.projectionDate}>{targets.projectedDate}</Text>
                </View>
              ) : null}

              {/* Safety notices from the engine — never optional reading. */}
              {targets.warnings.map((w) => (
                <View key={w} style={styles.warnCard}>
                  <Text style={styles.warnText}>⚠️ {t(`program.warn_${w}`)}</Text>
                </View>
              ))}

              <View style={styles.disclaimerBox}>
                <Text style={styles.disclaimerText}>🛡️ {t('program.disclaimer')}</Text>
              </View>
            </>
          ) : null}
        </FadeInView>

        {/* CTA */}
        <Pressable
          onPress={step === 'recap' ? create : next}
          disabled={!canContinue()}
          style={{ marginTop: 20 }}
        >
          <LinearGradient
            colors={['#2ec983', '#1fbc78']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={[styles.cta, !canContinue() && { opacity: 0.5 }]}
          >
            <Text style={styles.ctaText}>
              {step === 'recap' ? `✨ ${t('program.createCta')}` : t('common.next')}
            </Text>
            <Text style={styles.ctaArrow}>→</Text>
          </LinearGradient>
        </Pressable>
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

  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#e6ebf2',
    overflow: 'hidden',
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: GREEN },
  progressText: {
    fontFamily: F600,
    fontSize: 11.5,
    color: '#8a98a7',
    marginTop: 7,
    marginBottom: 18,
  },

  qTitle: { fontFamily: F800, fontSize: 22, color: INK, letterSpacing: -0.4 },
  qSub: { fontFamily: F500, fontSize: 13, lineHeight: 19, color: '#667085', marginTop: 6 },
  subLabel: { fontFamily: F700, fontSize: 13, color: INK, marginTop: 20, marginBottom: 2 },

  /* Big stacked options (goal) */
  bigOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 15,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadows.card,
  },
  bigOptionOn: { borderColor: GREEN, backgroundColor: '#f2fbf6' },
  optEmojiWrap: {
    width: 46,
    height: 46,
    borderRadius: 15,
    backgroundColor: '#f1f4f9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  optEmojiWrapOn: { backgroundColor: '#dcf5e8' },
  optEmoji: { fontSize: 22 },
  optTitle: { fontFamily: F700, fontSize: 14.5, color: INK },
  optSub: { fontFamily: F500, fontSize: 11.5, lineHeight: 16, color: '#7a8797', marginTop: 2 },
  radio: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#d6dbe4',
  },
  radioOn: { borderColor: GREEN, backgroundColor: GREEN, borderWidth: 6 },

  rowOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 15,
    padding: 13,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadows.card,
  },
  rowEmoji: { fontSize: 20, width: 28, textAlign: 'center' },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 15,
    padding: 14,
    marginTop: 18,
    borderWidth: 1.5,
    borderColor: 'transparent',
    ...shadows.card,
  },

  /* Numeric fields */
  fieldCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    marginTop: 14,
    ...shadows.card,
  },
  fieldLabel: { fontFamily: F600, fontSize: 13, color: '#7a8797' },
  fieldRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 },
  bigInput: { fontFamily: F800, fontSize: 36, color: INK, minWidth: 90, padding: 0 },
  unit: { fontFamily: F600, fontSize: 15, color: '#98A2B3' },
  fieldNote: { fontFamily: F600, fontSize: 11.5, color: GREEN, marginTop: 8 },
  textField: {
    fontFamily: F600,
    fontSize: 13,
    color: INK,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#e3e8f0',
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginTop: 10,
  },

  /* Chips */
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  chip: {
    borderRadius: 999,
    paddingVertical: 10,
    paddingHorizontal: 15,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e3e8f0',
  },
  dayChip: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e3e8f0',
  },
  chipOn: { backgroundColor: '#e6f7ef', borderColor: GREEN },
  chipDanger: { backgroundColor: '#fdecec', borderColor: '#f0b4b0' },
  chipText: { fontFamily: F600, fontSize: 12.5, color: '#5d6b7c' },
  chipTextOn: { color: '#0e7a4d' },

  infoBox: {
    backgroundColor: '#eef4ff',
    borderRadius: 14,
    padding: 13,
    marginTop: 16,
  },
  infoText: { fontFamily: F500, fontSize: 12, lineHeight: 17, color: '#3f5b8a' },

  /* Recap */
  kcalCard: {
    borderRadius: 22,
    padding: 20,
    marginTop: 18,
    shadowColor: GREEN,
    shadowOpacity: 0.3,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  kcalLabel: { fontFamily: F600, fontSize: 12.5, color: 'rgba(255,255,255,0.9)' },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  kcalValue: { fontFamily: F800, fontSize: 46, color: '#ffffff', letterSpacing: -1.5 },
  kcalUnit: { fontFamily: F700, fontSize: 17, color: 'rgba(255,255,255,0.85)' },
  kcalNote: { fontFamily: F500, fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 4 },

  macroRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  macroCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 13,
    alignItems: 'center',
    ...shadows.card,
  },
  macroEmoji: { fontSize: 18 },
  macroValue: { fontFamily: F800, fontSize: 16, marginTop: 4 },
  macroLabel: { fontFamily: F600, fontSize: 10.5, color: '#8a98a7', marginTop: 1 },

  splitCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
    ...shadows.card,
  },
  splitTitle: { fontFamily: F800, fontSize: 13.5, color: INK, marginBottom: 4 },
  splitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 9,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
  },
  splitLabel: { fontFamily: F600, fontSize: 12.5, color: '#4a5a50' },
  splitValue: { fontFamily: F800, fontSize: 13.5, color: INK },

  projectionCard: {
    backgroundColor: '#f4f1ff',
    borderRadius: 18,
    padding: 16,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#e9e3ff',
    alignItems: 'center',
  },
  projectionLabel: { fontFamily: F600, fontSize: 11.5, color: '#6b5ec4' },
  projectionValue: { fontFamily: F800, fontSize: 22, color: '#4c3fa8', marginTop: 3 },
  projectionDate: { fontFamily: F600, fontSize: 12, color: '#8479c9', marginTop: 2 },

  warnCard: {
    backgroundColor: '#fff8ec',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#f2e0bd',
    padding: 13,
    marginTop: 10,
  },
  warnText: { fontFamily: F600, fontSize: 12, lineHeight: 17, color: '#8a5a10' },

  disclaimerBox: {
    backgroundColor: '#eef1f6',
    borderRadius: 14,
    padding: 13,
    marginTop: 12,
  },
  disclaimerText: { fontFamily: F500, fontSize: 11.5, lineHeight: 17, color: '#5d6b7c' },

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
});
