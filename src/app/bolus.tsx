import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft, FadeInView, Spinner } from '@/components/ui';
import { ComposerHero } from '@/components/bolus/ComposerHero';
import { DoseHero } from '@/components/bolus/DoseHero';
import {
  checkModifiedDoseAI,
  requestBolusReport,
  type BolusAIReport,
} from '@/services/ai';
import {
  computeSmartBolus,
  guessMealTime,
  localDoseCheck,
  type BolusResult,
  type DoseRisk,
} from '@/services/bolusEngine';
import { saveInsulin } from '@/services/data';
import { parseDecimal, sanitizeDecimal } from '@/lib/num';
import { useAppStore } from '@/store/useAppStore';
import { shadows } from '@/theme';
import type { ActivityIntensity, ActivityKind, MealType } from '@/types';

const SPORT_KINDS: { v: ActivityKind; icon: string }[] = [
  { v: 'walk', icon: '🚶' },
  { v: 'run', icon: '🏃' },
  { v: 'bike', icon: '🚴' },
  { v: 'gym', icon: '🏋️' },
  { v: 'other', icon: '⚽' },
];

const SPORT_DURATIONS = [15, 30, 45, 60, 90];

/** Translated label for an activity kind (falls back to the raw value for
 *  anything unexpected coming from old logs). */
const kindLabel = (t: (k: string) => string, kind: string) =>
  SPORT_KINDS.some((s) => s.v === kind) ? t(`bolus.kind_${kind}`) : kind;

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN = '#1fbc78';
const INK = '#101828';

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

type Phase = 'input' | 'loading' | 'report';

export default function BolusScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { profile, glucoseLogs, insulinLogs, activityLogs, meals, activityStatus } =
    useAppStore();

  const lastGlucose = glucoseLogs.find((g) => isToday(g.created_at));
  const lastMeal = meals.find((m) => isToday(m.created_at));

  const [carbs, setCarbs] = useState(
    lastMeal ? String(Math.round(lastMeal.result.carbohydrates)) : ''
  );
  const [glucose, setGlucose] = useState(lastGlucose ? String(lastGlucose.value) : '');
  /* The context the patient declares for THIS dose — meal moment (picks the
     per-meal ratio), sport, and current state. Sick is pre-checked from the
     account status so the patient never has to remember to re-declare it. */
  const [mealTime, setMealTime] = useState<MealType>(() => guessMealTime(new Date()));
  const [sport, setSport] = useState<ActivityIntensity | 'none'>('none');
  /* Details revealed once a sport intensity is picked */
  const [sportKind, setSportKind] = useState<ActivityKind>('walk');
  const [sportMin, setSportMin] = useState('30');
  const [sportTiming, setSportTiming] = useState<'done' | 'planned'>('done');
  const [isSick, setIsSick] = useState(activityStatus === 'sick');
  const [isStressed, setIsStressed] = useState(false);
  const [alcohol, setAlcohol] = useState(false);
  const [phase, setPhase] = useState<Phase>('input');
  const [engine, setEngine] = useState<BolusResult | null>(null);
  const [report, setReport] = useState<BolusAIReport | null>(null);
  const [editing, setEditing] = useState(false);
  const [editDose, setEditDose] = useState(0);
  const [checking, setChecking] = useState(false);
  const [alert, setAlert] = useState<{ risk: DoseRisk; message: string; dose: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  /* Context the engine will use — shown as chips before calculating */
  const preview = useMemo(
    () =>
      computeSmartBolus({
        carbs: parseDecimal(carbs) ?? 0,
        glucose: (parseDecimal(glucose) ?? 0) > 0 ? parseDecimal(glucose)! : null,
        profile,
        insulinLogs,
        activityLogs,
        glucoseLogs,
        lastMeal,
        mealTime,
        declaredSport:
          sport === 'none'
            ? null
            : {
                intensity: sport,
                kind: sportKind,
                durationMin: Number(sportMin) || null,
                timing: sportTiming,
              },
        isSick,
        isStressed,
        alcohol,
        activityStatus,
      }),
    [
      carbs,
      glucose,
      profile,
      insulinLogs,
      activityLogs,
      glucoseLogs,
      lastMeal,
      mealTime,
      sport,
      sportKind,
      sportMin,
      sportTiming,
      isSick,
      isStressed,
      alcohol,
      activityStatus,
    ]
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const calculate = async () => {
    const result = computeSmartBolus({
      carbs: parseDecimal(carbs) ?? 0,
      glucose: (parseDecimal(glucose) ?? 0) > 0 ? parseDecimal(glucose)! : null,
      profile,
      insulinLogs,
      activityLogs,
      glucoseLogs,
      lastMeal,
      mealTime,
      declaredSport:
        sport === 'none'
          ? null
          : {
              intensity: sport,
              kind: sportKind,
              durationMin: Number(sportMin) || null,
              timing: sportTiming,
            },
      isSick,
      isStressed,
      alcohol,
      activityStatus,
    });
    setEngine(result);
    setEditDose(result.total);
    setPhase('loading');
    // The AI writes the detailed report; if unreachable we still show the
    // engine result with the local explanations.
    const ai = await requestBolusReport(result, i18n.language);
    setReport(ai);
    setPhase('report');
  };

  const doSave = async (dose: number, modified: boolean) => {
    if (!engine) return;
    setSaving(true);
    try {
      const note = modified
        ? t('bolus.noteModified', { rec: engine.total, dose })
        : t('bolus.noteAccepted', { carbs: engine.carbs, glucose: engine.glucose ?? '—' });
      await saveInsulin(dose, 'rapid', note);
      setSaved(true);
      setAlert(null);
      setTimeout(close, 1100);
    } finally {
      setSaving(false);
    }
  };

  /** Verify a patient-modified dose: local rules + AI, worse risk wins. */
  const verifyAndSave = async () => {
    if (!engine) return;
    const dose = editDose;
    if (dose === engine.total) {
      await doSave(dose, false);
      return;
    }
    setChecking(true);
    const local = localDoseCheck(dose, engine);
    const ai = await checkModifiedDoseAI(engine, dose, i18n.language);
    setChecking(false);

    const order: DoseRisk[] = ['ok', 'caution', 'danger'];
    const worst: DoseRisk =
      order[Math.max(order.indexOf(local.risk), order.indexOf(ai?.risk ?? 'ok'))];

    if (worst === 'ok') {
      await doSave(dose, true);
      return;
    }
    const fallbackMsg =
      worst === 'danger' ? t('bolus.checkDangerFallback') : t('bolus.checkCautionFallback');
    setAlert({ risk: worst, message: ai?.message || fallbackMsg, dose });
  };

  const fmtU = (v: number) => v.toLocaleString(i18n.language, { maximumFractionDigits: 1 });
  const isHypo = engine?.flags.includes('hypo');

  // Deterministic "why this dose + what to do" — built from the engine, so
  // the page ALWAYS explains and advises, even when the online AI report
  // isn't reachable (demo / offline / error). The AI report, when available,
  // replaces this with richer personalized prose.
  const explainDose = (e: BolusResult): { summary: string; advice: string[] } => {
    if (e.flags.includes('hypo')) {
      return { summary: t('bolus.whyHypo', { low: e.targetLow }), advice: [t('bolus.adviceDoctor')] };
    }
    const bits: string[] = [];
    if (e.mealBolus > 0) bits.push(t('bolus.whyMealBit', { u: fmtU(e.mealBolus) }));
    if (e.correction > 0) bits.push(t('bolus.whyCorrBit', { u: fmtU(e.correction) }));
    if (e.iob > 0.1) bits.push(t('bolus.whyIobBit', { u: fmtU(e.iob) }));
    const summary = t('bolus.whySummary', { parts: bits.join(' '), total: fmtU(e.total) });
    const advice: string[] = [
      e.bolusInsulinName
        ? t('bolus.adviceInject', { u: fmtU(e.total), name: e.bolusInsulinName, meal: t(`bolus.meal_${e.mealTime}`) })
        : t('bolus.adviceInjectNoName', { u: fmtU(e.total), meal: t(`bolus.meal_${e.mealTime}`) }),
    ];
    if (e.flags.includes('sugarHeavy')) advice.push(t('bolus.adviceSugar'));
    if (e.sportTiming) advice.push(t('bolus.adviceSport'));
    if (e.flags.includes('alcohol')) advice.push(t('bolus.adviceAlcohol'));
    if (e.flags.includes('falling') || e.flags.includes('nearLow')) advice.push(t('bolus.adviceFalling'));
    if (e.flags.includes('highBG')) advice.push(t('bolus.adviceHigh'));
    advice.push(t('bolus.adviceDoctor'));
    return { summary, advice };
  };

  /* ───────────────────────── UI ───────────────────────── */
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
          <Text style={styles.headTitle}>{t('bolus.title')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* ════════ PHASE: INPUT ════════ */}
        {phase === 'input' ? (
          <FadeInView>
            {/* Opening banner — mirrors the result page's DoseHero */}
            <ComposerHero
              pill={t('bolus.heroPill')}
              title={t('bolus.heroTitle')}
              subtitle={t('bolus.heroSub')}
            />

            {/* The two numbers that drive the dose, grouped as one composer
                card: a carb row and a glucose row, each with a tinted badge. */}
            <View style={styles.composer}>
              <View style={styles.composerRow}>
                <View style={[styles.badge, styles.badgeCarb]}>
                  <Text style={styles.badgeEmoji}>🍞</Text>
                </View>
                <View style={styles.composerField}>
                  <Text style={styles.inputLabel}>{t('bolus.carbsLabel')}</Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      value={carbs}
                      onChangeText={(v) => setCarbs(sanitizeDecimal(v))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#c2cad6"
                      style={styles.bigInput}
                    />
                    <Text style={styles.unit}>g</Text>
                  </View>
                </View>
              </View>

              {lastMeal ? (
                <Pressable
                  onPress={() => setCarbs(String(Math.round(lastMeal.result.carbohydrates)))}
                  style={styles.prefillPill}
                >
                  <Text style={styles.prefillHint} numberOfLines={1}>
                    🍽️ {lastMeal.result.food_name} · {Math.round(lastMeal.result.carbohydrates)} g
                  </Text>
                </Pressable>
              ) : null}

              <View style={styles.composerDivider} />

              <View style={styles.composerRow}>
                <View style={[styles.badge, styles.badgeGluc]}>
                  <Text style={styles.badgeEmoji}>🩸</Text>
                </View>
                <View style={styles.composerField}>
                  <Text style={styles.inputLabel}>{t('bolus.glucoseLabel')}</Text>
                  <View style={styles.inputRow}>
                    <TextInput
                      value={glucose}
                      onChangeText={(v) => setGlucose(sanitizeDecimal(v))}
                      keyboardType="decimal-pad"
                      placeholder="—"
                      placeholderTextColor="#c2cad6"
                      style={styles.bigInput}
                    />
                    <Text style={styles.unit}>mg/dL</Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Which meal → picks the patient's per-meal ratio */}
            <View style={styles.inputCard}>
              <View style={styles.cardHead}>
                <Text style={styles.cardHeadIcon}>🕐</Text>
                <Text style={styles.cardHeadText}>{t('bolus.mealMoment')}</Text>
              </View>
              <View style={styles.qRow}>
                {(['breakfast', 'lunch', 'dinner', 'snack'] as MealType[]).map((m) => {
                  const on = mealTime === m;
                  return (
                    <Pressable
                      key={m}
                      onPress={() => setMealTime(m)}
                      style={[styles.qChip, on && styles.qChipOn]}
                    >
                      <Text style={[styles.qChipText, on && styles.qChipTextOn]}>
                        {t(`bolus.meal_${m}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              {preview.ratioSource === 'meal' ? (
                <Text style={styles.ratioNote}>
                  ✓ {t('bolus.ratioMealNote', { u: preview.uPer10g })}
                </Text>
              ) : (
                <Text style={[styles.ratioNote, { color: '#b45309' }]}>
                  ⚠️ {t('bolus.ratioMissing')}
                </Text>
              )}
            </View>

            {/* Sport today / planned — reduces the dose. Picking an
                intensity opens the details: which sport, duration, timing. */}
            <View style={styles.inputCard}>
              <View style={styles.cardHead}>
                <Text style={styles.cardHeadIcon}>🏃</Text>
                <Text style={styles.cardHeadText}>{t('bolus.sportQ')}</Text>
              </View>
              <View style={styles.qRow}>
                {(['none', 'low', 'medium', 'high'] as const).map((v) => {
                  const on = sport === v;
                  return (
                    <Pressable
                      key={v}
                      onPress={() => setSport(v)}
                      style={[styles.qChip, on && styles.qChipOn]}
                    >
                      <Text style={[styles.qChipText, on && styles.qChipTextOn]}>
                        {t(`bolus.sport_${v}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {sport !== 'none' ? (
                <FadeInView distance={6} duration={250}>
                  <View style={styles.sportDetails}>
                    <Text style={styles.subQ}>{t('bolus.sportKindQ')}</Text>
                    <View style={styles.qRow}>
                      {SPORT_KINDS.map((k) => {
                        const on = sportKind === k.v;
                        return (
                          <Pressable
                            key={k.v}
                            onPress={() => setSportKind(k.v)}
                            style={[styles.qChip, on && styles.qChipOn]}
                          >
                            <Text style={[styles.qChipText, on && styles.qChipTextOn]}>
                              {k.icon} {t(`bolus.kind_${k.v}`)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>

                    <Text style={styles.subQ}>{t('bolus.sportDurQ')}</Text>
                    <View style={styles.qRow}>
                      {SPORT_DURATIONS.map((m) => {
                        const on = Number(sportMin) === m;
                        return (
                          <Pressable
                            key={m}
                            onPress={() => setSportMin(String(m))}
                            style={[styles.qChip, on && styles.qChipOn]}
                          >
                            <Text style={[styles.qChipText, on && styles.qChipTextOn]}>
                              {m} min
                            </Text>
                          </Pressable>
                        );
                      })}
                      <View style={styles.durBox}>
                        <TextInput
                          value={sportMin}
                          onChangeText={(v) => setSportMin(v.replace(/\D/g, '').slice(0, 3))}
                          keyboardType="number-pad"
                          placeholder="30"
                          placeholderTextColor="#98a1af"
                          style={styles.durInput}
                        />
                        <Text style={styles.durUnit}>min</Text>
                      </View>
                    </View>

                    <Text style={styles.subQ}>{t('bolus.sportTimingQ')}</Text>
                    <View style={styles.qRow}>
                      {(['done', 'planned'] as const).map((v) => {
                        const on = sportTiming === v;
                        return (
                          <Pressable
                            key={v}
                            onPress={() => setSportTiming(v)}
                            style={[styles.qChip, on && styles.qChipOn]}
                          >
                            <Text style={[styles.qChipText, on && styles.qChipTextOn]}>
                              {v === 'done' ? '✅' : '⏳'} {t(`bolus.timing_${v}`)}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                </FadeInView>
              ) : null}
            </View>

            {/* Current state — sick / stress / alcohol (multi-select) */}
            <View style={styles.inputCard}>
              <View style={styles.cardHead}>
                <Text style={styles.cardHeadIcon}>💗</Text>
                <Text style={styles.cardHeadText}>{t('bolus.stateQ')}</Text>
              </View>
              <View style={styles.qRow}>
                {(
                  [
                    { key: 'sick', on: isSick, toggle: () => setIsSick(!isSick), icon: '🤒' },
                    {
                      key: 'stress',
                      on: isStressed,
                      toggle: () => setIsStressed(!isStressed),
                      icon: '😰',
                    },
                    {
                      key: 'alcohol',
                      on: alcohol,
                      toggle: () => setAlcohol(!alcohol),
                      icon: '🍷',
                    },
                  ] as const
                ).map((o) => (
                  <Pressable
                    key={o.key}
                    onPress={o.toggle}
                    style={[styles.qChip, o.on && styles.qChipOn]}
                  >
                    <Text style={[styles.qChipText, o.on && styles.qChipTextOn]}>
                      {o.icon} {t(`bolus.state_${o.key}`)}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </View>

            {/* What the AI will take into account */}
            <View style={styles.ctxCard}>
              <View style={styles.ctxHead}>
                <View style={styles.ctxAvatar}>
                  <Text style={styles.ctxAvatarEmoji}>🤖</Text>
                </View>
                <Text style={styles.ctxTitle}>{t('bolus.ctxTitle')}</Text>
              </View>
              <View style={styles.chipsWrap}>
                {lastMeal ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>
                      🍽️ {Math.round(lastMeal.result.sugar ?? 0)}g {t('bolus.ctxSugar')} ·{' '}
                      {Math.round(lastMeal.result.calories ?? 0)} kcal
                    </Text>
                  </View>
                ) : null}
                {preview.iob > 0.1 ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>
                      💉 {fmtU(preview.iob)} U {t('bolus.ctxIob')}
                    </Text>
                  </View>
                ) : null}
                {preview.recentActivity ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>
                      🏃 {kindLabel(t, preview.recentActivity.kind)}
                      {preview.recentActivity.minutes > 0
                        ? ` · ${preview.recentActivity.minutes} min`
                        : ''}
                    </Text>
                  </View>
                ) : null}
                {preview.trendPerMin !== null ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>
                      {preview.trendPerMin <= -1 ? '📉' : preview.trendPerMin >= 2 ? '📈' : '➡️'}{' '}
                      {t('bolus.ctxTrend')}
                    </Text>
                  </View>
                ) : null}
                <View style={styles.chip}>
                  <Text style={styles.chipText}>
                    ⚙️{' '}
                    {preview.uPer10g
                      ? `${preview.uPer10g} U/10g · ISF ${preview.correctionFactor}`
                      : `1U/${preview.ratio}g · ISF ${preview.correctionFactor}`}
                  </Text>
                </View>
                {preview.bolusInsulinName ? (
                  <View style={styles.chip}>
                    <Text style={styles.chipText}>💉 {preview.bolusInsulinName}</Text>
                  </View>
                ) : null}
              </View>
            </View>

            <Pressable
              onPress={calculate}
              disabled={!carbs && !glucose}
              style={{ marginTop: 4 }}
            >
              <LinearGradient
                colors={['#2ec983', '#1fbc78']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={[styles.ctaBig, !carbs && !glucose && { opacity: 0.5 }]}
              >
                <Text style={styles.ctaText}>🤖 {t('bolus.calculate')}</Text>
                <Text style={styles.ctaArrow}>→</Text>
              </LinearGradient>
            </Pressable>
          </FadeInView>
        ) : null}

        {/* ════════ PHASE: LOADING ════════ */}
        {phase === 'loading' ? (
          <FadeInView style={styles.loadingBox}>
            <AnimatedRobot size={96} mood="happy" />
            <Text style={styles.loadingTitle}>{t('bolus.analyzing')}</Text>
            <Text style={styles.loadingSub}>{t('bolus.analyzingSub')}</Text>
            <View style={{ marginTop: 14 }}>
              <Spinner size={26} color={GREEN} />
            </View>
          </FadeInView>
        ) : null}

        {/* ════════ PHASE: REPORT ════════ */}
        {phase === 'report' && engine ? (
          <FadeInView>
            {/* Dose hero — the recommended dose over the insulin-pen photo */}
            <DoseHero
              dose={engine.total}
              unit="U"
              label={t('bolus.recommended')}
              hypoLabel={t('bolus.hypoNoDose')}
              isHypo={!!isHypo}
              format={fmtU}
              injectLine={
                !isHypo && engine.total > 0 && engine.bolusInsulinName
                  ? `💉 ${t('bolus.injectWith', { name: engine.bolusInsulinName })} · ${t(`bolus.meal_${engine.mealTime}`)}`
                  : null
              }
            />

            {/* How the number was reached — a clean ledger of every + and −.
                Lifted out of the hero so the hero stays cinematic and this
                stays readable. */}
            {!isHypo
              ? (() => {
                  const rows: { icon: string; label: string; value: string; positive: boolean }[] = [];
                  if (engine.mealBolus > 0)
                    rows.push({
                      icon: '🍽️',
                      label: t('bolus.brMeal', { carbs: engine.carbs, ratio: engine.ratio }),
                      value: `+${fmtU(engine.mealBolus)} U`,
                      positive: true,
                    });
                  if (engine.correction > 0)
                    rows.push({
                      icon: '🩸',
                      label: t('bolus.brCorrection', { glucose: engine.glucose, target: engine.targetMid }),
                      value: `+${fmtU(engine.correction)} U`,
                      positive: true,
                    });
                  if (engine.iob > 0.1)
                    rows.push({ icon: '💉', label: t('bolus.brIob'), value: `−${fmtU(engine.iob)} U`, positive: false });
                  if (engine.activityFactor < 1)
                    rows.push({
                      icon: '🏃',
                      label:
                        t('bolus.brActivity') +
                        (engine.recentActivity
                          ? ` — ${kindLabel(t, engine.recentActivity.kind)}${
                              engine.recentActivity.minutes > 0 ? ` ${engine.recentActivity.minutes} min` : ''
                            }`
                          : ''),
                      value: `−${Math.round((1 - engine.activityFactor) * 100)}%`,
                      positive: false,
                    });
                  if (engine.trendFactor !== 1)
                    rows.push({
                      icon: engine.trendFactor < 1 ? '📉' : '📈',
                      label: t('bolus.brTrend'),
                      value: `${engine.trendFactor < 1 ? '−' : '+'}${Math.round(Math.abs(1 - engine.trendFactor) * 100)}%`,
                      positive: engine.trendFactor > 1,
                    });
                  if (engine.sickFactor > 1)
                    rows.push({ icon: '🤒', label: t('bolus.brSick'), value: `+${Math.round((engine.sickFactor - 1) * 100)}%`, positive: true });
                  if (engine.stressFactor > 1)
                    rows.push({ icon: '😰', label: t('bolus.brStress'), value: `+${Math.round((engine.stressFactor - 1) * 100)}%`, positive: true });
                  if (engine.statusFactor > 1)
                    rows.push({ icon: '🩹', label: t('bolus.brLowActivity'), value: `+${Math.round((engine.statusFactor - 1) * 100)}%`, positive: true });
                  if (engine.alcoholFactor < 1)
                    rows.push({ icon: '🍷', label: t('bolus.brAlcohol'), value: `−${Math.round((1 - engine.alcoholFactor) * 100)}%`, positive: false });
                  if (rows.length === 0) return null;
                  return (
                    <View style={styles.calcCard}>
                      <View style={styles.calcHead}>
                        <Text style={styles.calcHeadIcon}>🧾</Text>
                        <Text style={styles.calcHeadText}>{t('bolus.calcTitle')}</Text>
                      </View>
                      {rows.map((r, i) => (
                        <View key={i} style={[styles.calcRow, i > 0 && styles.calcRowBorder]}>
                          <Text style={styles.calcRowIcon}>{r.icon}</Text>
                          <Text style={styles.calcRowLabel} numberOfLines={2}>{r.label}</Text>
                          <Text style={[styles.calcRowValue, { color: r.positive ? '#0e7a4d' : '#B45309' }]}>
                            {r.value}
                          </Text>
                        </View>
                      ))}
                      <View style={styles.calcTotalRow}>
                        <Text style={styles.calcTotalLabel}>{t('bolus.calcTotal')}</Text>
                        <Text style={styles.calcTotalValue}>{fmtU(engine.total)} U</Text>
                      </View>
                    </View>
                  );
                })()
              : null}

            {/* What the engine used FROM THE PATIENT'S PROFILE — full
                transparency: every value that fed the dose, before the AI's
                explanation. Answers "why this number, from my own settings". */}
            {!isHypo
              ? (() => {
                  const rows: { icon: string; label: string; value: string; note?: string }[] = [
                    { icon: '🕐', label: t('bolus.paramMeal'), value: t(`bolus.meal_${engine.mealTime}`) },
                  ];
                  if (engine.uPer10g != null)
                    rows.push({
                      icon: '🍽️',
                      label: t('bolus.paramRatio'),
                      value: `${engine.uPer10g} U · 10 g`,
                      note: t(`bolus.paramRatio_${engine.ratioSource}`),
                    });
                  if (engine.correctionFactor)
                    rows.push({ icon: '🩸', label: t('bolus.paramCorr'), value: `${engine.correctionFactor} mg/dL · 1 U` });
                  rows.push({ icon: '🎯', label: t('bolus.paramTarget'), value: `${engine.targetLow}–${engine.targetHigh} mg/dL` });
                  if (engine.glucose != null)
                    rows.push({ icon: '📊', label: t('bolus.paramGlucose'), value: `${engine.glucose} mg/dL` });
                  if (engine.carbs > 0)
                    rows.push({ icon: '🍞', label: t('bolus.paramCarbs'), value: `${engine.carbs} g` });
                  if (engine.bolusInsulinName)
                    rows.push({ icon: '💉', label: t('bolus.paramInsulin'), value: engine.bolusInsulinName });
                  if (engine.iob > 0.1)
                    rows.push({ icon: '⏳', label: t('bolus.paramIob'), value: `${fmtU(engine.iob)} U` });
                  return (
                    <View style={styles.paramCard}>
                      <Text style={styles.paramHead}>🧮 {t('bolus.paramsTitle')}</Text>
                      <Text style={styles.paramIntro}>{t('bolus.paramsIntro')}</Text>
                      {rows.map((r, i) => (
                        <View key={i} style={styles.paramRow}>
                          <Text style={styles.paramIcon}>{r.icon}</Text>
                          <Text style={styles.paramLabel} numberOfLines={1}>{r.label}</Text>
                          <View style={styles.paramValWrap}>
                            <Text style={styles.paramVal}>{r.value}</Text>
                            {r.note ? <Text style={styles.paramNote}>{r.note}</Text> : null}
                          </View>
                        </View>
                      ))}
                      {engine.ratioSource === 'default' ? (
                        <Text style={styles.paramWarn}>⚠️ {t('bolus.paramDefaultWarn')}</Text>
                      ) : null}
                    </View>
                  );
                })()
              : null}

            {/* Hypo instructions */}
            {isHypo ? (
              <View style={styles.hypoCard}>
                <Text style={styles.hypoTitle}>⚠️ {t('bolus.hypoTitle')}</Text>
                <Text style={styles.hypoBody}>{t('bolus.hypoBody', { low: engine.targetLow })}</Text>
              </View>
            ) : null}

            {/* AI warnings */}
            {report?.warnings?.length
              ? report.warnings.map((w, i) => (
                  <View key={i} style={styles.warnRow}>
                    <Text style={{ fontSize: 15 }}>⚠️</Text>
                    <Text style={styles.warnText}>{w}</Text>
                  </View>
                ))
              : null}

            {/* AI report sections */}
            {report?.sections?.length ? (
              <>
                <Text style={styles.sectionHead}>📋 {t('bolus.reportTitle')}</Text>
                {report.sections.map((s, i) => (
                  <View key={i} style={styles.reportCard}>
                    <View style={styles.reportHead}>
                      <Text style={{ fontSize: 17 }}>{s.icon}</Text>
                      <Text style={styles.reportTitle}>{s.title}</Text>
                    </View>
                    <Text style={styles.reportBody}>{s.body}</Text>
                  </View>
                ))}
                {report.conclusion ? (
                  <View style={[styles.reportCard, { backgroundColor: '#e9f6ef' }]}>
                    <Text style={[styles.reportBody, { color: '#14532d' }]}>
                      {report.conclusion}
                    </Text>
                  </View>
                ) : null}
              </>
            ) : (
              (() => {
                const ex = explainDose(engine);
                return (
                  <>
                    <Text style={styles.sectionHead}>💡 {t('bolus.whyTitle')}</Text>
                    <View style={styles.reportCard}>
                      <Text style={styles.whySummary}>{ex.summary}</Text>
                      <View style={styles.whyAdviceList}>
                        {ex.advice.map((a, i) => (
                          <View key={i} style={styles.whyAdviceRow}>
                            <View style={styles.whyBullet} />
                            <Text style={styles.whyAdviceText}>{a}</Text>
                          </View>
                        ))}
                      </View>
                      <Text style={styles.whyNote}>{t('bolus.aiUnavailable')}</Text>
                    </View>
                  </>
                );
              })()
            )}

            {/* Fixed disclaimer */}
            <View style={styles.disclaimerBox}>
              <Text style={{ fontSize: 15 }}>🛡️</Text>
              <Text style={styles.disclaimerText}>{t('bolus.disclaimer')}</Text>
            </View>

            {/* Actions */}
            {!editing ? (
              <>
                {!isHypo && engine.total > 0 ? (
                  <Pressable onPress={() => doSave(engine.total, false)} disabled={saving || saved}>
                    <LinearGradient
                      colors={['#2ec983', '#1fbc78']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 0, y: 1 }}
                      style={[styles.cta, (saving || saved) && { opacity: 0.6 }]}
                    >
                      {saving ? (
                        <Spinner size={22} color="#ffffff" />
                      ) : (
                        <Text style={styles.ctaText}>
                          {saved
                            ? `✓ ${t('bolus.savedOk')}`
                            : t('bolus.saveDose', { dose: fmtU(engine.total) })}
                        </Text>
                      )}
                    </LinearGradient>
                  </Pressable>
                ) : null}
                {!isHypo ? (
                  <Pressable
                    onPress={() => {
                      setEditing(true);
                      setEditDose(engine.total);
                    }}
                    style={styles.ghostBtn}
                    disabled={saving || saved}
                  >
                    <Text style={styles.ghostBtnText}>✏️ {t('bolus.modify')}</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <View style={styles.editCard}>
                <Text style={styles.editTitle}>{t('bolus.editTitle')}</Text>
                <View style={styles.stepperRow}>
                  <Pressable
                    onPress={() => setEditDose((d) => Math.max(0, Math.round((d - 0.5) * 10) / 10))}
                    style={styles.stepBtn}
                  >
                    <Text style={styles.stepBtnText}>−</Text>
                  </Pressable>
                  <View style={{ alignItems: 'center', minWidth: 110 }}>
                    <Text style={styles.editValue}>{fmtU(editDose)}</Text>
                    <Text style={styles.editUnit}>U</Text>
                  </View>
                  <Pressable
                    onPress={() => setEditDose((d) => Math.round((d + 0.5) * 10) / 10)}
                    style={styles.stepBtn}
                  >
                    <Text style={styles.stepBtnText}>+</Text>
                  </Pressable>
                </View>
                {editDose !== engine.total ? (
                  <Text style={styles.editDelta}>
                    {t('bolus.editDelta', { rec: fmtU(engine.total) })}
                  </Text>
                ) : null}
                <Pressable onPress={verifyAndSave} disabled={checking || saving}>
                  <LinearGradient
                    colors={['#2ec983', '#1fbc78']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 0, y: 1 }}
                    style={[styles.cta, { marginTop: 14 }, (checking || saving) && { opacity: 0.6 }]}
                  >
                    {saving ? (
                      <Spinner size={22} color="#ffffff" />
                    ) : checking ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <Spinner size={18} color="#ffffff" />
                        <Text style={styles.ctaText}>{t('bolus.checking')}</Text>
                      </View>
                    ) : (
                      <Text style={styles.ctaText}>{t('bolus.verifySave')}</Text>
                    )}
                  </LinearGradient>
                </Pressable>
                <Pressable onPress={() => setEditing(false)} style={{ marginTop: 10 }}>
                  <Text style={[styles.ghostBtnText, { textAlign: 'center' }]}>
                    {t('common.cancel')}
                  </Text>
                </Pressable>
              </View>
            )}

            {saved ? <Text style={styles.savedNote}>✓ {t('bolus.savedNote')}</Text> : null}
          </FadeInView>
        ) : null}
      </ScrollView>

      {/* ════════ RISK ALERT MODAL ════════ */}
      <Modal visible={!!alert} transparent animationType="fade" onRequestClose={() => setAlert(null)}>
        <View style={styles.alertOverlay}>
          <View style={styles.alertBox}>
            <View
              style={[
                styles.alertHalo,
                { backgroundColor: alert?.risk === 'danger' ? '#fdecec' : '#fdf0d8' },
              ]}
            >
              <Text style={{ fontSize: 30 }}>{alert?.risk === 'danger' ? '🚨' : '⚠️'}</Text>
            </View>
            <Text style={styles.alertTitle}>
              {alert?.risk === 'danger' ? t('bolus.alertDangerTitle') : t('bolus.alertCautionTitle')}
            </Text>
            <Text style={styles.alertMsg}>{alert?.message}</Text>
            <View style={styles.alertDoctorBox}>
              <Text style={styles.alertDoctorText}>👨‍⚕️ {t('bolus.alertDoctor')}</Text>
            </View>
            <Pressable onPress={() => setAlert(null)} style={{ alignSelf: 'stretch' }}>
              <LinearGradient
                colors={['#2ec983', '#1fbc78']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cta}
              >
                <Text style={styles.ctaText}>{t('bolus.alertCancel')}</Text>
              </LinearGradient>
            </Pressable>
            <Pressable
              onPress={() => alert && doSave(alert.dose, true)}
              style={{ marginTop: 12 }}
              disabled={saving}
            >
              <Text style={styles.alertForce}>{t('bolus.alertForce')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe' },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 18,
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
  headTitle: { fontFamily: F800, fontSize: 18, color: INK },

  /* Inputs */
  inputCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 16,
    marginBottom: 12,
    ...shadows.card,
  },
  inputLabel: { fontFamily: F600, fontSize: 13, color: '#7a8797' },
  inputRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 2 },
  bigInput: { fontFamily: F800, fontSize: 36, color: INK, minWidth: 80, padding: 0 },
  unit: { fontFamily: F600, fontSize: 15, color: '#98A2B3' },
  prefillHint: { fontFamily: F700, fontSize: 12, color: '#0e7a4d' },

  /* ── Composer: the two dose-driving numbers grouped in one card ── */
  composer: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    padding: 16,
    marginBottom: 12,
    ...shadows.card,
  },
  composerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  composerField: { flex: 1, minWidth: 0 },
  badge: {
    width: 46,
    height: 46,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeCarb: { backgroundColor: '#fdf0dc' },
  badgeGluc: { backgroundColor: '#fde6e6' },
  badgeEmoji: { fontSize: 22 },
  composerDivider: { height: 1, backgroundColor: '#eef1f6', marginVertical: 14 },
  prefillPill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#eafaf1',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginTop: 12,
    marginLeft: 60,
    maxWidth: '80%',
  },

  /* ── Card header (meal / sport / state) ── */
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardHeadIcon: { fontSize: 15 },
  cardHeadText: { fontFamily: F700, fontSize: 14, color: INK },

  /* Question chips (meal moment / sport / state) */
  qRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  qChip: {
    borderRadius: 999,
    paddingVertical: 9,
    paddingHorizontal: 14,
    backgroundColor: '#f1f4f9',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  qChipOn: { backgroundColor: '#e6f7ef', borderColor: GREEN },
  qChipText: { fontFamily: F600, fontSize: 12.5, color: '#5d6b7c' },
  qChipTextOn: { color: '#0e7a4d' },
  /* Sport details revealed when an intensity is picked */
  sportDetails: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#eef1f6',
  },
  subQ: { fontFamily: F600, fontSize: 12.5, color: '#667085', marginTop: 8 },
  durBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#d6dbe4',
  },
  durInput: {
    fontFamily: F700,
    fontSize: 13,
    color: INK,
    minWidth: 30,
    textAlign: 'center',
    padding: 0,
  },
  durUnit: { fontFamily: F600, fontSize: 11.5, color: '#98A2B3' },
  ratioNote: { marginTop: 10, fontFamily: F600, fontSize: 12, color: GREEN },

  ctxCard: {
    backgroundColor: '#f4f1ff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e9e3ff',
  },
  ctxHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  ctxAvatar: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#ede7ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctxAvatarEmoji: { fontSize: 16 },
  ctxTitle: { fontFamily: F700, fontSize: 13.5, color: '#4c3fa8' },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 12 },
  chip: {
    backgroundColor: '#ffffff',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  chipText: { fontFamily: F600, fontSize: 11.5, color: '#3d3564' },

  cta: {
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GREEN,
    shadowOpacity: 0.3,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  ctaText: { fontFamily: F700, fontSize: 15, color: '#ffffff' },
  ctaBig: {
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
  ctaArrow: { fontFamily: F800, fontSize: 18, color: '#ffffff', marginTop: -1 },

  /* Loading */
  loadingBox: { alignItems: 'center', paddingVertical: 60 },
  loadingTitle: { fontFamily: F800, fontSize: 17, color: INK, marginTop: 18 },
  loadingSub: {
    fontFamily: F500,
    fontSize: 12.5,
    color: '#667085',
    marginTop: 6,
    textAlign: 'center',
    paddingHorizontal: 30,
    lineHeight: 18,
  },

  /* Calc receipt — how the dose was reached (light card under the hero) */
  calcCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
    marginBottom: 12,
    ...shadows.card,
  },
  calcHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  calcHeadIcon: { fontSize: 15 },
  calcHeadText: { fontFamily: F800, fontSize: 14, color: INK },
  calcRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11 },
  calcRowBorder: { borderTopWidth: 1, borderTopColor: '#F1F5F2' },
  calcRowIcon: { fontSize: 15, width: 22, textAlign: 'center' },
  calcRowLabel: { flex: 1, fontFamily: F500, fontSize: 12.5, lineHeight: 17, color: '#41505f' },
  calcRowValue: { fontFamily: F800, fontSize: 13.5 },
  calcTotalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 12,
    borderTopWidth: 1.5,
    borderTopColor: '#EAF3EE',
  },
  calcTotalLabel: { fontFamily: F800, fontSize: 13.5, color: INK },
  calcTotalValue: { fontFamily: F800, fontSize: 18, color: GREEN, letterSpacing: -0.3 },

  hypoCard: { backgroundColor: '#fdecec', borderRadius: 18, padding: 16, marginBottom: 12 },
  hypoTitle: { fontFamily: F700, fontSize: 15, color: '#B3261E' },
  hypoBody: { marginTop: 5, fontFamily: F500, fontSize: 13, lineHeight: 19, color: '#8a2822' },

  warnRow: {
    flexDirection: 'row',
    gap: 9,
    backgroundColor: '#fdf0d8',
    borderRadius: 14,
    padding: 12,
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  warnText: { flex: 1, fontFamily: F600, fontSize: 12.5, lineHeight: 18, color: '#8a5a10' },

  sectionHead: { fontFamily: F800, fontSize: 15.5, color: INK, marginTop: 8, marginBottom: 10 },

  /* ── "What I used from your profile" transparency card ── */
  paramCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#EAF3EE',
    padding: 15,
    marginTop: 14,
  },
  paramHead: { fontFamily: F800, fontSize: 14.5, color: INK },
  paramIntro: { fontFamily: F500, fontSize: 12, lineHeight: 17, color: '#6B7A72', marginTop: 3, marginBottom: 10 },
  paramRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F2',
  },
  paramIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  paramLabel: { flex: 1, fontFamily: F600, fontSize: 12.5, color: '#4A5A50' },
  paramValWrap: { alignItems: 'flex-end', maxWidth: '52%' },
  paramVal: { fontFamily: F800, fontSize: 13, color: INK },
  paramNote: { fontFamily: F500, fontSize: 9.5, color: '#9AA7A0', marginTop: 1 },
  paramWarn: { fontFamily: F600, fontSize: 11, lineHeight: 15, color: '#B45309', marginTop: 10 },

  /* ── Deterministic "why this dose" explanation (AI-report fallback) ── */
  whySummary: { fontFamily: F700, fontSize: 13.5, lineHeight: 20, color: INK },
  whyAdviceList: { gap: 8, marginTop: 12 },
  whyAdviceRow: { flexDirection: 'row', gap: 9, alignItems: 'flex-start' },
  whyBullet: { width: 6, height: 6, borderRadius: 3, backgroundColor: GREEN, marginTop: 7 },
  whyAdviceText: { flex: 1, fontFamily: F500, fontSize: 12.5, lineHeight: 18, color: '#3F4B44' },
  whyNote: { fontFamily: F500, fontSize: 10.5, lineHeight: 15, color: '#9AA7A0', marginTop: 12 },

  reportCard: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 14,
    marginBottom: 10,
    ...shadows.card,
  },
  reportHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  reportTitle: { flex: 1, fontFamily: F700, fontSize: 13.5, color: INK },
  reportBody: { fontFamily: F500, fontSize: 12.5, lineHeight: 19, color: '#41505f' },

  disclaimerBox: {
    flexDirection: 'row',
    gap: 9,
    backgroundColor: '#eef1f6',
    borderRadius: 14,
    padding: 12,
    marginTop: 4,
    marginBottom: 16,
    alignItems: 'flex-start',
  },
  disclaimerText: { flex: 1, fontFamily: F500, fontSize: 11.5, lineHeight: 17, color: '#5d6b7c' },

  ghostBtn: {
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#d6dbe4',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
    backgroundColor: '#ffffff',
  },
  ghostBtnText: { fontFamily: F700, fontSize: 13.5, color: '#41505f' },

  /* Edit */
  editCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    ...shadows.card,
  },
  editTitle: { fontFamily: F700, fontSize: 14.5, color: INK, textAlign: 'center' },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
    marginTop: 14,
  },
  stepBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#eef1f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontFamily: F800, fontSize: 22, color: INK },
  editValue: { fontFamily: F800, fontSize: 40, color: INK, letterSpacing: -1 },
  editUnit: { fontFamily: F600, fontSize: 14, color: '#98A2B3' },
  editDelta: {
    fontFamily: F600,
    fontSize: 12,
    color: '#b45309',
    textAlign: 'center',
    marginTop: 8,
  },
  savedNote: {
    fontFamily: F700,
    fontSize: 13.5,
    color: GREEN,
    textAlign: 'center',
    marginTop: 14,
  },

  /* Alert modal */
  alertOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16,24,40,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  alertBox: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 22,
    alignItems: 'center',
  },
  alertHalo: {
    width: 68,
    height: 68,
    borderRadius: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  alertTitle: { fontFamily: F800, fontSize: 17, color: INK, textAlign: 'center' },
  alertMsg: {
    fontFamily: F500,
    fontSize: 13,
    lineHeight: 19,
    color: '#41505f',
    textAlign: 'center',
    marginTop: 8,
  },
  alertDoctorBox: {
    backgroundColor: '#fdf0d8',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 14,
    marginTop: 12,
    marginBottom: 16,
    alignSelf: 'stretch',
  },
  alertDoctorText: {
    fontFamily: F700,
    fontSize: 12.5,
    color: '#8a5a10',
    textAlign: 'center',
    lineHeight: 18,
  },
  alertForce: { fontFamily: F600, fontSize: 12.5, color: '#B3261E', textAlign: 'center' },
});
