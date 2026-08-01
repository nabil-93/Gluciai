import React, { useMemo, useRef, useState } from 'react';
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
import { useRouter, type ErrorBoundaryProps } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft, FadeInView, Spinner } from '@/components/ui';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
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
  MAX_SAFE_BOLUS,
  type BolusResult,
  type DoseRisk,
} from '@/services/bolusEngine';
import { consumeBolusHandoff, type BolusHandoff } from '@/services/bolusHandoff';
import { savedStateKey, saveInsulin } from '@/services/data';
import { carbSeed, seedCarbsFromMeal } from '@/services/nutrition/carbProvenance';
import { parseDecimal, sanitizeDecimal } from '@/lib/num';
import { useAppStore } from '@/store/useAppStore';
import { shadows } from '@/theme';
import type { ActivityIntensity, ActivityKind, MealType } from '@/types';

/**
 * This route overrides the root boundary because a crash HERE is different
 * from a crash anywhere else: an insulin action may have been in flight, and
 * the patient is holding a device they were about to dose from.
 *
 * The fallback carries no dose, no glucose and no carbohydrate value — it is
 * rendered from state that just failed, so any number it showed would be
 * untrustworthy — and it never claims the dose was or was not recorded,
 * because it cannot know. It points at the insulin log instead.
 */
export function ErrorBoundary(props: ErrorBoundaryProps) {
  return <AppErrorBoundary {...props} variant="clinical" />;
}

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

/** Narrow a route param to a real meal slot before trusting it. */
function isMealType(v: unknown): v is MealType {
  return v === 'breakfast' || v === 'lunch' || v === 'dinner' || v === 'snack';
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

  /* Another screen can hand this one the plate it is about to cover — the
     program's "my dose" button sends the exact carbs of the meal it just
     confirmed. An explicit hand-off always beats guessing from history.

     It arrives IN MEMORY, not in the URL (finding BOLUS-A1): a carbohydrate is
     a dose input, and on web a route param is browser history, the `Referer` of
     the next request and a line in an access log. Same mechanism as the
     programme wizard's draft (Step 9).

     Read once, on the first render, and kept for the life of the screen — the
     ref guard is what makes a second render (or a double-invoked initializer)
     hand back what was already consumed instead of an empty draft. */
  const handoffRef = useRef<BolusHandoff | null>(null);
  if (handoffRef.current === null) handoffRef.current = consumeBolusHandoff();
  const handoff = handoffRef.current;

  /* What the day's meal can contribute to the carb field, or null when it
     cannot contribute anything honest. A meal whose carbohydrate was never
     known holds a placeholder 0, and pre-filling that reads as "this plate is
     0 g" — which computes a 0 U meal bolus for a full plate. A genuine 0 g
     meal (water) still seeds "0"; see `carbProvenance.ts`. */
  const mealSeed = lastMeal ? seedCarbsFromMeal(lastMeal.result) : null;
  const mealCarbsUnusable = !!lastMeal && mealSeed === null;

  /* The pre-fill rule, and WHERE the number came from (finding NUTR-C2).
     `carbSeed` is the same rule that used to sit inline here — the programme's
     route parameter still wins, the value is still taken verbatim, and an
     unknown carbohydrate still seeds nothing. What is new is that the origin
     travels with it, so the field can say whose number it is holding. Step 18
     labels; it does not gate: whatever is seeded reaches the engine exactly as
     before, and the confirmation question stays open (NUTR-C2, item 2). */
  const seed = useMemo(
    () => carbSeed(handoff.carbs, lastMeal?.result),
    [handoff.carbs, lastMeal?.result]
  );
  const [carbs, setCarbs] = useState(seed.value);
  /** True once the patient has touched the field themselves — the label then
   *  disappears, because the value is theirs and not the app's. */
  const [carbsTouched, setCarbsTouched] = useState(false);
  const setCarbsByHand = (v: string) => {
    setCarbsTouched(true);
    setCarbs(v);
  };
  /** Local time of the meal the seed came from, when there is one to show. */
  const seedMealTime = useMemo(
    () =>
      lastMeal
        ? new Date(lastMeal.created_at).toLocaleTimeString(i18n.language, {
            hour: '2-digit',
            minute: '2-digit',
          })
        : '',
    [lastMeal, i18n.language]
  );
  const [glucose, setGlucose] = useState(lastGlucose ? String(lastGlucose.value) : '');
  /* The context the patient declares for THIS dose — meal moment (picks the
     per-meal ratio), sport, and current state. Sick is pre-checked from the
     account status so the patient never has to remember to re-declare it. */
  const [mealTime, setMealTime] = useState<MealType>(() =>
    // The slot the caller named wins: it decides which per-meal ratio the
    // engine uses, and the program knows the meal better than the clock.
    isMealType(handoff.meal) ? handoff.meal : guessMealTime(new Date())
  );
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
  /* The dose editor keeps a string mirror so the patient can type freely —
     including a comma decimal — while `editDose` stays the numeric truth. */
  const [editStr, setEditStr] = useState('');
  const [checking, setChecking] = useState(false);
  const [alert, setAlert] = useState<{ risk: DoseRisk; message: string; dose: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  /** i18n key for what the save actually achieved (DATA-1). */
  const [saveState, setSaveState] = useState<string | null>(null);
  const editInputRef = useRef<TextInput>(null);

  /**
   * What the two fields actually say, as the engine's input contract.
   *
   * Until Step 13 both call sites computed the glucose as
   * `(parseDecimal(glucose) ?? 0) > 0 ? … : null`, which handed the engine a
   * `null` for a typed 0 — so an engine-side fix for P7-006 would have been
   * dead code. The parsed value is now passed through as it is, and the engine
   * decides absent / invalid / value. An empty carb field means the
   * carbohydrate was not stated, which is not the same as 0 g.
   */
  const carbsValue = parseDecimal(carbs);
  const glucoseValue = parseDecimal(glucose);
  /** The two fields as the engine's input contract, memoised so the preview's
   *  dependency list stays exhaustive. */
  const engineInput = useMemo(
    () => ({
      carbs: carbsValue ?? 0,
      carbsKnown: carbsValue !== undefined,
      glucose: glucoseValue ?? null,
      // This screen's fields, labels and chips are all mg/dL, and `saveGlucose`
      // stores only mg/dL — stated explicitly rather than left to a default.
      glucoseUnit: 'mg/dL' as const,
    }),
    [carbsValue, glucoseValue]
  );

  /* Context the engine will use — shown as chips before calculating */
  const preview = useMemo(
    () =>
      computeSmartBolus({
        ...engineInput,
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
      engineInput,
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
      ...engineInput,
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
    // A hypo is a STOP, not a dose. Never ask the AI to narrate a number the
    // patient must not act on — go straight to the safety result so the page
    // can only ever say "treat the low first, no bolus now".
    if (result.flags.includes('hypo')) {
      setReport(null);
      setPhase('report');
      return;
    }
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
      // What the write actually achieved travels back with the row (DATA-1):
      // "saved" alone was said for a dose the server had refused, which is the
      // one the doctor's dashboard would then be missing.
      const log = await saveInsulin(dose, 'rapid', note);
      setSaveState(savedStateKey(log));
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

  /* Jump to the medical section of the profile — where the ratio, correction
     factor, target and insulin names live. Any "fill this in your profile"
     note on this page routes here so the fix is one tap away. */
  const goMedical = () => router.push('/profile-edit?section=medical' as any);

  /* A warning that asks the patient to complete their profile becomes a
     shortcut to it. Detected by the word "profile" (fr/en/de all share the
     stem) or the Arabic "الملف". */
  const isProfileWarn = (w: string) => /profil|profile|الملف|بروفايل/i.test(w);

  /* Open the dose editor seeded with the recommended dose (numeric truth +
     its editable string). */
  const openEditor = () => {
    if (!engine) return;
    setEditing(true);
    setEditDose(engine.total);
    setEditStr(fmtU(engine.total));
  };

  /* Nudge the dose by ±0.1 U — the real granularity of an insulin pen — and
     keep the typed string in sync so both controls agree. */
  const stepDose = (delta: number) => {
    const next = Math.max(0, Math.round((editDose + delta) * 10) / 10);
    setEditDose(next);
    setEditStr(fmtU(next));
  };

  /* Free typing: sanitise (digits + one comma/dot), mirror it, and parse the
     numeric value the save will actually use. */
  const onEditType = (v: string) => {
    const s = sanitizeDecimal(v);
    setEditStr(s);
    const n = parseDecimal(s);
    if (n != null) setEditDose(n);
  };

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
                      onChangeText={(v) => setCarbsByHand(sanitizeDecimal(v))}
                      keyboardType="decimal-pad"
                      placeholder="0"
                      placeholderTextColor="#c2cad6"
                      style={styles.bigInput}
                    />
                    <Text style={styles.unit}>g</Text>
                  </View>
                  {/* Whose number is in the field (NUTR-C2). Shown only while
                      it is still the app's: the moment the patient types, the
                      value is theirs and the label goes. It changes nothing
                      about what the engine receives. */}
                  {!carbsTouched && seed.origin !== 'none' ? (
                    <Text style={styles.seedNote} numberOfLines={2}>
                      {seed.origin === 'program'
                        ? t('bolus.seedFromProgram')
                        : t('bolus.seedFromMeal', {
                            food: lastMeal?.result.food_name ?? '',
                            time: seedMealTime,
                          })}
                    </Text>
                  ) : null}
                </View>
              </View>

              {/* The day's meal, offered as a one-tap fill — but only when its
                  carbohydrate is a real figure. When it is not, the meal is
                  still named (the patient should see we know about it) and the
                  reason the field is empty is said out loud, instead of a
                  fabricated 0 sitting there looking like an answer. */}
              {lastMeal && mealSeed !== null ? (
                <Pressable onPress={() => setCarbsByHand(mealSeed)} style={styles.prefillPill}>
                  <Text style={styles.prefillHint} numberOfLines={1}>
                    🍽️ {lastMeal.result.food_name} · {mealSeed} g
                  </Text>
                </Pressable>
              ) : mealCarbsUnusable ? (
                <View style={styles.carbsUnknownPill}>
                  <Text style={styles.carbsUnknownText}>
                    🍽️ {t('bolus.carbsNotConfirmed', { food: lastMeal!.result.food_name })}
                  </Text>
                </View>
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

            {/* The number above is the app's MAXIMUM, not the result of the
                calculation (finding P7-009). The engine has always clamped at
                MAX_SAFE_BOLUS and flagged it; until now nothing on this screen
                read the flag, so a ceiling was displayed exactly like a
                computed dose — the one number a patient cannot sanity-check by
                re-reading the breakdown, because the breakdown adds up to
                something else. The dose itself is untouched: this says what it
                is, names the app's limit, and deliberately does NOT claim that
                the limit is the right dose for this patient. */}
            {!isHypo && engine.flags.includes('capped') ? (
              <View style={styles.cappedCard}>
                <Text style={styles.cappedTitle}>
                  ⚠️ {t('bolus.cappedTitle', { max: fmtU(MAX_SAFE_BOLUS) })}
                </Text>
                <Text style={styles.cappedBody}>
                  {t('bolus.cappedBody', {
                    max: fmtU(MAX_SAFE_BOLUS),
                    raw: fmtU(engine.rawTotal),
                  })}
                </Text>
              </View>
            ) : null}

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
                    rows.push({
                      icon: '🩸',
                      label: t('bolus.paramCorr'),
                      value: `${engine.correctionFactor} mg/dL · 1 U`,
                      // A fallback 50 used to print here as if the patient had
                      // entered it. The number is the same; the claim is not.
                      note:
                        engine.isfSource === 'fallback'
                          ? t('bolus.paramCorr_fallback')
                          : undefined,
                    });
                  rows.push({
                    icon: '🎯',
                    label: t('bolus.paramTarget'),
                    value: `${engine.targetLow}–${engine.targetHigh} mg/dL`,
                    note:
                      engine.targetSource === 'fallback'
                        ? t('bolus.paramTarget_fallback')
                        : undefined,
                  });
                  // Absent and unusable are different rows, because they are
                  // different facts: "you didn't measure" vs "what reached the
                  // calculator could not be read".
                  if (engine.glucoseState === 'value' && engine.glucose != null)
                    rows.push({ icon: '📊', label: t('bolus.paramGlucose'), value: `${engine.glucose} mg/dL` });
                  else if (engine.glucoseState === 'invalid')
                    rows.push({ icon: '📊', label: t('bolus.paramGlucose'), value: '—', note: t('bolus.paramGlucoseInvalid') });
                  else
                    rows.push({ icon: '📊', label: t('bolus.paramGlucose'), value: '—', note: t('bolus.paramGlucoseMissing') });
                  if (!engine.carbsKnown)
                    rows.push({ icon: '🍞', label: t('bolus.paramCarbs'), value: '—', note: t('bolus.paramCarbsUnknown') });
                  else if (engine.carbs > 0)
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
                    </View>
                  );
                })()
              : null}

            {/* Deterministic "complete your profile" banner — does NOT depend
                on the AI text. It appears whenever a value that drives the dose
                is still missing from the profile (no personal ratio, no meal
                insulin name), lists exactly what's missing, and taps through to
                Profile → Medical. */}
            {!isHypo
              ? (() => {
                  const missing: { icon: string; text: string }[] = [];
                  if (engine.ratioSource === 'default')
                    missing.push({ icon: '🍽️', text: t('bolus.missRatio') });
                  // The correction factor belongs in this list for exactly the
                  // same reason as the ratio: the dose used a number the patient
                  // never gave. It was absent until Step 13.
                  if (engine.isfSource === 'fallback')
                    missing.push({ icon: '🩸', text: t('bolus.missCorr') });
                  if (engine.targetSource === 'fallback')
                    missing.push({ icon: '🎯', text: t('bolus.missTarget') });
                  if (!engine.bolusInsulinName)
                    missing.push({ icon: '💉', text: t('bolus.missInsulin') });
                  if (missing.length === 0) return null;
                  return (
                    <Pressable onPress={goMedical} style={styles.completeCard}>
                      <View style={styles.completeHead}>
                        <View style={styles.completeIcon}>
                          <Text style={{ fontSize: 18 }}>🩺</Text>
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.completeTitle}>{t('bolus.completeTitle')}</Text>
                          <Text style={styles.completeSub}>{t('bolus.completeSub')}</Text>
                        </View>
                      </View>
                      <View style={styles.completeList}>
                        {missing.map((m, i) => (
                          <View key={i} style={styles.completeItem}>
                            <Text style={styles.completeItemIcon}>{m.icon}</Text>
                            <Text style={styles.completeItemText}>{m.text}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.completeCta}>
                        <Text style={styles.completeCtaText}>{t('bolus.completeCta')}</Text>
                        <Text style={styles.completeCtaArrow}>→</Text>
                      </View>
                    </Pressable>
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

            {/* Everything below narrates a DOSE — its warnings, the AI report,
                the "why this number". None of it may show for a hypo, where
                the only safe message is "treat the low, no bolus". */}
            {!isHypo ? (
              <>
            {/* AI warnings — a warning that asks the patient to fill in their
                profile becomes a tap-through shortcut to the medical section. */}
            {report?.warnings?.length
              ? report.warnings.map((w, i) =>
                  isProfileWarn(w) ? (
                    <Pressable key={i} onPress={goMedical} style={[styles.warnRow, styles.warnRowLink]}>
                      <Text style={{ fontSize: 15 }}>⚠️</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.warnText}>{w}</Text>
                        <Text style={styles.fixLink}>{t('bolus.fixInProfile')} →</Text>
                      </View>
                    </Pressable>
                  ) : (
                    <View key={i} style={styles.warnRow}>
                      <Text style={{ fontSize: 15 }}>⚠️</Text>
                      <Text style={styles.warnText}>{w}</Text>
                    </View>
                  )
                )
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
              </>
            ) : null}

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
                    onPress={openEditor}
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
                <Text style={styles.editHint}>{t('bolus.editHint')}</Text>
                <View style={styles.stepperRow}>
                  <Pressable onPress={() => stepDose(-0.1)} style={styles.stepBtn}>
                    <Text style={styles.stepBtnText}>−</Text>
                  </Pressable>
                  <Pressable
                    style={styles.editValueWrap}
                    onPress={() => editInputRef.current?.focus()}
                  >
                    <TextInput
                      ref={editInputRef}
                      value={editStr}
                      onChangeText={onEditType}
                      keyboardType="decimal-pad"
                      selectTextOnFocus
                      placeholder="0"
                      placeholderTextColor="#c2cad6"
                      style={styles.editValueInput}
                    />
                    <Text style={styles.editUnit}>U</Text>
                  </Pressable>
                  <Pressable onPress={() => stepDose(0.1)} style={styles.stepBtn}>
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

            {saved ? (
              <>
                <Text style={styles.savedNote}>✓ {t('bolus.savedNote')}</Text>
                {saveState ? (
                  <Text style={styles.saveStateNote}>{t(saveState)}</Text>
                ) : null}
              </>
            ) : null}
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
  // "Pre-filled from …" under the carb field. Muted, two lines allowed: the
  // German and Arabic sentences are longer than the French one.
  seedNote: {
    fontFamily: F600,
    fontSize: 10.5,
    lineHeight: 13,
    color: '#8b97a6',
    marginTop: 3,
  },
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
  /* Same footprint as the prefill pill it replaces, in the app's caution
     amber rather than green — it is information, not an action. Not a
     Pressable: there is nothing here to tap, which is the whole point. */
  carbsUnknownPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#fef6e7',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 12,
    marginLeft: 60,
    maxWidth: '80%',
  },
  carbsUnknownText: { fontFamily: F700, fontSize: 12, color: '#9a6800', lineHeight: 17 },

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
  warnRowLink: { borderWidth: 1.5, borderColor: '#ecd08f' },
  fixLink: { fontFamily: F800, fontSize: 12, color: '#a25a06', marginTop: 6 },

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
  /* ── Deterministic "complete your profile" banner ── */
  completeCard: {
    backgroundColor: '#fff8ec',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#f2e0bd',
    padding: 16,
    marginTop: 14,
  },
  completeHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 11 },
  completeIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#fdeccb',
    alignItems: 'center',
    justifyContent: 'center',
  },
  completeTitle: { fontFamily: F800, fontSize: 14, color: '#7a4d09' },
  completeSub: { fontFamily: F500, fontSize: 11.5, lineHeight: 16, color: '#9a6b25', marginTop: 2 },
  completeList: { marginTop: 12, gap: 8 },
  completeItem: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  completeItemIcon: { fontSize: 14, width: 20, textAlign: 'center' },
  completeItemText: { flex: 1, fontFamily: F600, fontSize: 12.5, color: '#6b4a12' },
  completeCta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    marginTop: 14,
    height: 44,
    borderRadius: 13,
    backgroundColor: GREEN,
  },
  completeCtaText: { fontFamily: F800, fontSize: 13.5, color: '#ffffff' },
  completeCtaArrow: { fontFamily: F800, fontSize: 15, color: '#ffffff', marginTop: -1 },

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
  editHint: {
    fontFamily: F500,
    fontSize: 11.5,
    lineHeight: 16,
    color: '#8A98A7',
    textAlign: 'center',
    marginTop: 5,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    marginTop: 16,
  },
  stepBtn: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#eef1f6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBtnText: { fontFamily: F800, fontSize: 24, color: INK },
  editValue: { fontFamily: F800, fontSize: 40, color: INK, letterSpacing: -1 },
  /* Tap-to-type dose field: reads like the big number, but it's an input. */
  editValueWrap: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#f4f7fb',
    borderWidth: 1.5,
    borderColor: '#e3e8f0',
  },
  editValueInput: {
    fontFamily: F800,
    fontSize: 40,
    color: INK,
    letterSpacing: -1,
    textAlign: 'center',
    width: 104,
    padding: 0,
  },
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
  // Where the dose actually went (DATA-1) — under the confirmation, muted, and
  // allowed to wrap: the "not saved to your account" sentence is the longest.
  // "This is the app's maximum" — sits directly under the dose hero. Amber
  // rather than red: it is a limit notice, not a hypo alarm, and the red wash
  // is reserved for the case where injecting is the wrong action entirely.
  cappedCard: {
    backgroundColor: '#FFF7E8',
    borderWidth: 1,
    borderColor: '#F2D9A8',
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 14,
    marginBottom: 14,
    gap: 3,
  },
  cappedTitle: { fontFamily: F700, fontSize: 13, color: '#8A5310', lineHeight: 17 },
  cappedBody: { fontFamily: F600, fontSize: 11.5, color: '#8A6416', lineHeight: 16 },
  saveStateNote: {
    fontFamily: F600,
    fontSize: 11.5,
    lineHeight: 15,
    color: '#8b97a6',
    textAlign: 'center',
    marginTop: 4,
    paddingHorizontal: 12,
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
