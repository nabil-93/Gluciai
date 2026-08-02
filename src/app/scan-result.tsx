import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import Svg, { Circle, Path } from 'react-native-svg';

import { AddedSugarCard, SUGAR_SEARCH_NAME } from '@/components/AddedSugarCard';
import { AnimatedRobot, GlycemicBar, ImageLightbox, RotaryDial, glycemicTone } from '@/components/ui';
import { MealAssistant } from '@/components/MealAssistant';
import { MealEditModal } from '@/components/MealEditModal';
import { MealGradeBar } from '@/components/MealGradeBar';
import { MEAL_TYPES, MealTypeModal } from '@/components/MealTypeModal';
import { SaveConfirmModal } from '@/components/SaveConfirmModal';
import { savedStateKey, saveMeal, updateMealType } from '@/services/data';
import { aggregateItems } from '@/services/nutrition/engine';
/* ONE import path for every interpretation this screen renders (Phase 2/3).
   The screen used to own a private `glBand` and its own copy of the load
   palette; both now come from `interpret/glycemic`, unchanged. */
import {
  carbDisplay,
  carbFigure,
  carbStatus,
  carbText as carbTextOf,
  carbUnit as carbUnitOf,
  effectiveGi,
  glBand,
  mealGrade,
  plateCarbStatus,
  qualityEvidence,
  scoreMeal,
} from '@/services/nutrition/interpret';
import {
  estimateMealWaterMl,
  estimateMicros,
  microAverage,
  microProvenance,
  waterGoalMl,
} from '@/services/nutrition/micros';
import {
  NUTRIENT_KEYS,
  nutritionCompleteness,
  type NutrientKey,
} from '@/services/nutrition/nutrientProvenance';
import { clearPendingScan, getPendingScan } from '@/services/scanSession';
import { useAppStore } from '@/store/useAppStore';
import type { FoodCategory, FoodItemResult, MealType, NutritionResult } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

// Graphic colours — rings, donut segments, dots, chips. Chosen for the chart,
// not for legibility on white.
const GREEN = '#20bf6b';
const ORANGE = '#f7941d';
const PURPLE = '#8b5cf6';
const BLUE = '#38a1f0';

/**
 * TEXT colours. The graphic palette above is far too light to read as type —
 * #20bf6b on white is 2.4:1, #f7941d is 2.3:1, both well under the 4.5:1 WCAG
 * AA floor. A meal report is read by patients who may be older or reading on a
 * phone in daylight, so every number and label uses these darker twins while
 * the charts keep the bright ones.
 */
const INK = '#1e2a23';
/** Secondary text (units, captions, portions) — 4.9:1 on white. */
const MUTED = '#67736B';
/** Small field labels above a value — 5.8:1. */
const LABEL = '#5C6860';
const GREEN_TXT = '#0F7A42';
const ORANGE_TXT = '#B45309';
const PURPLE_TXT = '#7C3AED';

/** The seven nutrients, in the words the rest of the screen already uses. */
const NUTRIENT_LABEL: Record<NutrientKey, string> = {
  calories: 'result.calories',
  carbs: 'result.carbs',
  sugar: 'result.sugar',
  protein: 'result.protein',
  fat: 'result.fat',
  fiber: 'result.fiber',
  sodium: 'result.sodium',
};

/*
 * NOTE — the meal is deliberately NOT pre-filled from the clock.
 *
 * A clock guess is wrong often enough to be dangerous: someone eating lunch at
 * 16:00 would get "dinner" pre-ticked, not notice, and the plate would land in
 * the wrong slot of their journal — which then feeds the daily totals and the
 * per-meal insulin ratio. A pre-ticked default is exactly the kind of thing a
 * patient scrolls past. The patient always chooses; the real timestamp is
 * recorded separately by saveMeal, so the history still shows 16:00.
 */

/** Emoji shown next to each detected food, by its vision category. */
const CATEGORY_EMOJI: Record<FoodCategory, string> = {
  Protein: '🍗',
  Vegetable: '🥦',
  Fruit: '🍎',
  Rice: '🍚',
  Bread: '🍞',
  Pasta: '🍝',
  Soup: '🍲',
  Sauce: '🥫',
  Dessert: '🍰',
  Drink: '🥤',
  Snack: '🍪',
  'Fast Food': '🍔',
  Seafood: '🐟',
  Legumes: '🫘',
  Dairy: '🧀',
  Egg: '🥚',
  Unknown: '🍽️',
};
const FOOD_TINTS = ['#fbeede', '#f1eee6', '#e9f6ea', '#eaf1fb', '#f6ecf9'];

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

/**
 * Rough daily calorie target from the profile (Mifflin-St Jeor × light
 * activity), falling back to 2000 kcal when the body metrics are unknown.
 *
 * STEP 22C AUDIT (finding NUTR-A6) — Mifflin-St Jeor is a published, validated
 * BMR equation, so the `10·kg + 6.25·cm − 5·age + s` half is defensible. Three
 * things around it are not measurements and were presented as if they were:
 *
 *   · the **1.45 activity factor** is assumed for every patient, whatever they
 *     do. Published multipliers run ~1.2 (sedentary) to ~1.9 (very active);
 *     one fixed value can be wrong by 30 % in either direction.
 *   · **age 30** is assumed when no birth date is stored.
 *   · **2000 kcal** is returned outright when weight or height is missing —
 *     a population default, not this patient's requirement, and the screen
 *     then prints "X % of YOUR daily calories" against it.
 *
 * Unchanged here for the same reason as the burn divisors: any of the three is
 * a nutrition-policy choice (RU-3). The card now says which case it is in.
 */
function dailyCalorieGoal(
  weight?: number,
  height?: number,
  gender?: string,
  birthDate?: string
): number {
  if (!weight || !height) return 2000;
  const age = birthDate
    ? Math.max(15, Math.floor((Date.now() - new Date(birthDate).getTime()) / 3.15576e10))
    : 30;
  const s = gender === 'female' ? -161 : 5;
  const bmr = 10 * weight + 6.25 * height - 5 * age + s;
  return Math.round((bmr * 1.45) / 50) * 50;
}

/** Web-only: print an HTML document that is NOT the live page. expo-print's
 *  web shim calls window.print() and drops the html, which would export the
 *  app screen instead of the report, so the report gets its own frame. */
function printHtmlInFrame(html: string) {
  return new Promise<void>((resolve) => {
    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
    document.body.appendChild(frame);
    const doc = frame.contentWindow?.document;
    if (!doc) {
      frame.remove();
      resolve();
      return;
    }
    doc.open();
    doc.write(html);
    doc.close();
    // Give the photo a moment to decode — printing too early drops it.
    setTimeout(() => {
      try {
        frame.contentWindow?.focus();
        frame.contentWindow?.print();
      } catch {
        // popup/print blocked — nothing else to try
      }
      setTimeout(() => frame.remove(), 1500);
      resolve();
    }, 350);
  });
}

/** Food names and AI copy go straight into the shared PDF's markup. */
function esc(s: string) {
  return String(s).replace(/[&<>"]/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : '&quot;'
  );
}

/** Full-scale reading of the calorie dial: one substantial main meal, i.e.
 *  ~40 % of the day's allowance, rounded to a clean 50 kcal step so the
 *  number printed under the arc stays legible (2000 kcal/day → 800). */
function mealCalorieScale(dailyGoal: number) {
  return Math.max(400, Math.round((dailyGoal * 0.4) / 50) * 50);
}

/** Where the needle sits translated into words + colour. The dial itself
 *  already runs green → red; this repeats it in text for anyone who reads the
 *  chip before the gauge (and for screen readers). */
function calorieTone(pct: number) {
  if (pct <= 35) return { key: 'analysis.calLight', dot: GREEN, bg: '#e8f7ef', text: GREEN_TXT };
  if (pct <= 65) return { key: 'analysis.calModerate', dot: '#eab308', bg: '#fdf6e3', text: '#8A6100' };
  if (pct <= 90) return { key: 'analysis.calHigh', dot: ORANGE, bg: '#fff2e2', text: ORANGE_TXT };
  return { key: 'analysis.calVeryHigh', dot: '#ef4444', bg: '#fdeceb', text: '#B3261E' };
}

/**
 * Metabolic equivalents for the four activities shown, at MODERATE intensity,
 * from the Compendium of Physical Activities (Ainsworth et al.) — the
 * reference table these values are normally taken from.
 *
 * They replace four unsourced kcal-per-minute divisors (5 / 12 / 8.5 / 9.5)
 * that Step 22C recorded as NUTR-A10 and left in place. External review
 * rejected that: the app already stores the patient's weight — `profile.weight`
 * drives the water goal four lines below the call site — and printing minutes
 * computed for a hypothetical 70 kg adult to a 95 kg patient is wrong by more
 * than a third, in the direction that overstates the effort required.
 */
const BURN_MET = {
  /** Walking, brisk, firm surface (~5.5 km/h). */
  walk: 4.3,
  /** Running (~8 km/h). */
  run: 8.3,
  /** Bicycling, general leisure. */
  bike: 7.5,
  /** Swimming, leisurely — not lap training. */
  swim: 6.0,
} as const;

/** Weight assumed when the profile has none. Named so the UI can say so. */
const BURN_DEFAULT_KG = 70;

/**
 * Minutes of each activity needed to burn `cal` kcal, for THIS patient.
 *
 * `kcal/min = MET × 3.5 × kg / 200` — the standard conversion from a metabolic
 * equivalent to an energy cost, which is linear in body mass. That linearity is
 * the whole point of the fix: the same plate is ~35 % fewer minutes for a 95 kg
 * patient than for a 70 kg one, and the previous model showed them the same
 * number.
 *
 * STILL AN ESTIMATE, and the card says so: MET tables are population averages
 * at one assumed intensity, they ignore fitness, age, sex and terrain, and the
 * "calories burned" framing ignores that some of that energy would have been
 * spent at rest anyway. It is a motivational comparison, not a prescription.
 */
function burnMinutes(cal: number, weightKg?: number) {
  const kg = weightKg && weightKg > 0 ? weightKg : BURN_DEFAULT_KG;
  const minutes = (met: number) =>
    Math.max(1, Math.round(cal / ((met * 3.5 * kg) / 200)));
  return {
    walk: minutes(BURN_MET.walk),
    run: minutes(BURN_MET.run),
    bike: minutes(BURN_MET.bike),
    swim: minutes(BURN_MET.swim),
  };
}

/** Foods to hand to the edit modal. Normally the detected per-item list; when
 *  a scan has no breakdown, synthesize a single editable row from the plate
 *  totals so the user can still correct the name / grams and add items. */
function itemsForEdit(result: NutritionResult, items: FoodItemResult[]): FoodItemResult[] {
  if (items.length > 0) return items;
  const grams = parseInt(result.estimated_portion, 10) || 300;
  return [
    {
      name: result.food_name,
      portion_grams: grams,
      calories: result.calories,
      carbohydrates: result.carbohydrates,
      sugar: result.sugar,
      protein: result.protein,
      fat: result.fat,
      fiber: result.fiber,
      sodium: result.sodium,
      glycemic_index: result.glycemic_index,
      source: result.source ?? 'ai_estimate',
      detection_confidence: result.confidence ?? 0.8,
      nutrition_confidence: result.nutrition_confidence ?? 0.6,
      // This row IS the plate, so it inherits the plate's provenance rather
      // than being minted as a known value by the act of synthesizing it.
      carbs_known: result.carbs_known,
    },
  ];
}

/** Per-100g values for table sugar, used to build the single "added sugar" row
 *  the patient declares (grams / cubes / photo). Pure sucrose ≈ 400 kcal,
 *  100 g carbs per 100 g, GI ≈ 65 — deterministic so totals recompute exactly. */
function makeSugarItem(grams: number, label: string): FoodItemResult {
  const f = grams / 100;
  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    name: label,
    search_name: SUGAR_SEARCH_NAME,
    category: 'Snack',
    portion_grams: Math.round(grams),
    calories: Math.round(400 * f),
    carbohydrates: r1(100 * f),
    sugar: r1(100 * f),
    protein: 0,
    fat: 0,
    fiber: 0,
    glycemic_index: 65,
    source: 'ai_estimate',
    matched_food: label,
    match_score: 100,
    is_main_food: false,
    is_estimated: true,
    detection_confidence: 1,
    nutrition_confidence: 0.6,
    // Pure sucrose: 100 g of carbohydrate per 100 g, by definition. The
    // patient declared the grams, so this row is as known as it gets.
    carbs_known: true,
  };
}

/* The glycemic-LOAD band moved to `interpret/glycemic` in Phase 2 — same
   thresholds (< 10 low, 10–20 medium, > 20 high) and the same three colours as
   `glycemicTone`, which is now literally the same table rather than a hand copy. */

/** glycemicTone's key → the shared IG explanation copy (already written for the
 *  Sélection Santé dish pages, in all four languages — reused, not duplicated). */
const IG_DESC_KEY = {
  low: 'hf.igDescLow',
  medium: 'hf.igDescMedium',
  high: 'hf.igDescHigh',
} as const;

/**
 * The engine stores warnings as translation KEYS ("warn:<key>" or
 * "warn:<key>|<value>") so a plate scanned in one language still reads in the
 * patient's current one. Anything that is not in that form is passed through
 * untouched (older persisted scans held raw French sentences).
 */
function localizeWarning(raw: string, t: TFunction): string {
  if (!raw.startsWith('warn:')) return raw;
  const body = raw.slice(5);
  const sep = body.indexOf('|');
  const key = sep === -1 ? body : body.slice(0, sep);
  const value = sep === -1 ? undefined : body.slice(sep + 1);
  const translated = t(`result.warn.${key}`, { value });
  // A key we do not know yet must never surface as "result.warn.xyz".
  return translated === `result.warn.${key}` ? (value ?? key) : translated;
}

/** A single-value progress ring (score / goals / hydration). */
function Ring({
  size,
  pct,
  color,
  track,
  children,
}: {
  size: number;
  pct: number;
  color: string;
  track: string;
  children: React.ReactNode;
}) {
  const r = 44;
  const c = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, pct / 100)) * c;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        <Circle cx={50} cy={50} r={r} fill="none" stroke={track} strokeWidth={9} />
        <Circle
          cx={50}
          cy={50}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={9}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 50 50)"
        />
      </Svg>
      <View style={StyleSheet.absoluteFill}>
        <View style={styles.ringCenter}>{children}</View>
      </View>
    </View>
  );
}

/** The three-segment macro donut. */
function MacroDonut({ p, c, f }: { p: number; c: number; f: number }) {
  const r = 36;
  const circ = 2 * Math.PI * r;
  const seg = (frac: number) => frac * circ;
  const segs = [
    { frac: p / 100, color: GREEN, offset: 0 },
    { frac: c / 100, color: ORANGE, offset: p / 100 },
    { frac: f / 100, color: PURPLE, offset: (p + c) / 100 },
  ];
  return (
    <Svg width={82} height={82} viewBox="0 0 100 100">
      {segs.map((s, i) => (
        <Circle
          key={i}
          cx={50}
          cy={50}
          r={r}
          fill="none"
          stroke={s.color}
          strokeWidth={15}
          strokeDasharray={`${seg(s.frac)} ${circ - seg(s.frac)}`}
          strokeDashoffset={-seg(s.offset)}
          transform="rotate(-90 50 50)"
        />
      ))}
    </Svg>
  );
}

export default function ScanResultScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const meals = useAppStore((s) => s.meals);

  const [pending] = useState(() => getPendingScan());
  const [items, setItems] = useState<FoodItemResult[]>(() => pending?.result.items ?? []);
  // A fresh scan starts empty — the patient picks (see the note above).
  // Reviewing a meal already in the journal starts on the slot it was filed
  // under, so a wrong choice can simply be corrected here.
  const [mealType, setMealType] = useState<MealType | null>(
    () => pending?.savedMeal?.mealType ?? null
  );
  const [mealAskOpen, setMealAskOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  // When opened to review a meal already in the journal (from the Nutrition
  // page), start as "saved" so it can't be re-saved and the day isn't double
  // counted; a fresh scan starts unsaved as before.
  const [saved, setSaved] = useState(() => pending?.alreadySaved ?? false);
  /** i18n key for what the save actually achieved (DATA-1). */
  const [saveState, setSaveState] = useState<string | null>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editStartNew, setEditStartNew] = useState(false);
  const [saveModalOpen, setSaveModalOpen] = useState(false);
  /** Full-screen view of the scanned photo (the header only shows a strip). */
  const [lightbox, setLightbox] = useState(false);

  // "Scan réussi" badge: show the text for ~1s, then collapse it into the
  // check logo, leaving only the logo.
  const badgeAnim = useRef(new Animated.Value(0)).current;
  const [badgeCollapsed, setBadgeCollapsed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => {
      Animated.timing(badgeAnim, {
        toValue: 1,
        duration: 300,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      }).start(() => setBadgeCollapsed(true));
    }, 1000);
    return () => clearTimeout(id);
  }, [badgeAnim]);

  // Aggregating the plate runs the whole scoring / highlight pipeline, so it is
  // memoised: without this it re-ran on every render (badge animation, each
  // modal toggle) and `scoreMeal` was then computed a second time below.
  // Both hooks must sit ABOVE the early return to keep the hook order stable.
  const result = useMemo(() => {
    if (items.length === 0) return pending?.result ?? null;
    const agg = aggregateItems(items);
    // `aggregateItems` re-derives every warning FROM THE ITEMS, which is what
    // keeps the plate honest after an edit. But an incomplete plate is not a
    // fact about any item: it means the AI's answer was cut off, so foods it
    // had listed are absent from this list entirely. Nothing in the items can
    // say that, so the warning is carried across the re-aggregation — without
    // it, a plate missing foods (and therefore carbohydrate) would render
    // exactly like a complete one.
    const carried = (pending?.result.warnings ?? []).filter(
      (w) => w === 'warn:plate_incomplete' && !agg.warnings.includes(w)
    );
    return carried.length > 0
      ? { ...agg, warnings: [...agg.warnings, ...carried] }
      : agg;
  }, [items, pending]);
  const quality = useMemo(
    () =>
      result
        ? scoreMeal({
            calories: result.calories,
            carbs: result.carbohydrates,
            sugar: result.sugar,
            protein: result.protein,
            fat: result.fat,
            fiber: result.fiber,
            sodium: result.sodium,
            glycemic_index: result.glycemic_index,
          })
        : null,
    [result]
  );

  if (!pending || !result || !quality) return <Redirect href="/(tabs)" />;

  const { imageUri, base64: imageBase64, savedMeal } = pending;

  const cals = Math.round(result.calories);
  const P = Math.round(result.protein);
  const C = Math.round(result.carbohydrates);
  const F = Math.round(result.fat);
  // Macro split by their share of the meal's calories (P·4, C·4, F·9).
  const pCal = P * 4;
  const cCal = C * 4;
  const fCal = F * 9;
  const totCal = Math.max(1, pCal + cCal + fCal);
  const pPct = Math.round((pCal / totCal) * 100);
  const cPct = Math.round((cCal / totCal) * 100);
  const fPct = Math.max(0, 100 - pPct - cPct);

  /* How much of the plate's carbohydrate is actually known. When a food's
     carbohydrate is missing, `C` above still holds the sum of the ones that
     ARE known — a floor, not a total — so it reads "≥ 62 g", and a plate with
     nothing known says so rather than printing the placeholder as "0 g".
     Every other figure on this screen is left exactly as it was. */
  const carbView = carbDisplay(
    items.length > 0 ? plateCarbStatus(items) : carbStatus(result),
    C
  );
  /** The carbohydrate figure as text: "62", "≥ 62" or "—". Formatted by the
   *  shared rule now (Step 22B), so the day total, the meal sheet and the home
   *  card cannot drift from this screen. */
  const carbText = carbTextOf(carbView);
  /** Its share of the plate's calories — suppressed when the grams behind it
   *  are not a figure we can stand behind. Protein and fat are untouched. */
  const carbPctText = carbView.kind === 'exact' ? `${cPct}%` : '—';
  /** No unit after a dash: "— g" reads like a quantity, which is the thing
   *  this whole change exists to stop implying. */
  const carbUnit = carbUnitOf(carbView);
  /** The two joined — the shared assembly, so the PDF row cannot drift from
   *  the home card and the peek window (Phase 3). */
  const carbFull = carbFigure(carbView).full;

  /* ── What the numbers above REST ON (finding NUTR-A7, Step 22B) ─────────
     `fieldsFound` was computed by every provider *"so the UI can say how
     complete the entry is"* — and then read by nothing, so a plate whose
     protein was a floor presented exactly like one a database had declared.
     This is that answer, in four states and plain words. Deliberately not a
     percentage: seven fields are not seven equal facts, so "86 % complete"
     would be precision the data cannot support. No number changes. */
  const completeness = nutritionCompleteness(items);
  const missingNames = completeness.missing
    .map((k) => t(NUTRIENT_LABEL[k]))
    .join(', ');
  /** Counts and grams worth naming — appended to the sentence, never alone. */
  const dataDetail = [
    completeness.unidentified > 0
      ? t('analysis.dataUnidentified', { count: completeness.unidentified })
      : null,
    completeness.invalidPortions > 0
      ? t('analysis.dataInvalidPortion', { count: completeness.invalidPortions })
      : null,
    completeness.unsureGrams > 0
      ? t('analysis.dataWeakId', { g: completeness.unsureGrams })
      : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const dataMain =
    completeness.state === 'declared'
      ? t('analysis.dataDeclared')
      : completeness.state === 'estimated'
        ? t('analysis.dataEstimated')
        : completeness.state === 'unavailable'
          ? t('analysis.dataUnavailable')
          : // Naming all seven is accurate but unreadable, and it is the common
            // case: one unidentified food makes every total a floor.
            completeness.missing.length === NUTRIENT_KEYS.length
            ? t('analysis.dataPartialAll')
            : missingNames
              ? t('analysis.dataPartial', { list: missingNames })
              : t('analysis.dataPartialFoods');
  const dataNote = dataDetail ? `${dataMain} · ${dataDetail}` : dataMain;

  /* ── May this plate be JUDGED at all? (Step 22A) ────────────────────────
     `scoreMeal` starts at 100 and subtracts, so a plate nothing was identified
     in — every value a placeholder 0 — takes no penalty and comes out
     "100/100 · Excellent · A · balanced meal". The verdict is therefore gated
     on the same evidence Step 18 already used for the badges (P8-005): the
     plate must have energy, and its carbohydrate must be a real value rather
     than a floor. Nothing is recomputed and no number is invented — an
     unsupported plate simply carries no verdict, and says why. */
  const evidence = qualityEvidence(result);
  const rated = evidence === 'supported';

  /**
   * The A–E letter form of the SAME indicator shown in the ring below — it
   * moves with the food (a lean, high-fibre plate → A/B; a sugary, high-GI one
   * → D/E). It is the app's own indicator, never an official nutritional label
   * (NUTR-A1): the strip and the PDF both say so. `null` when the plate cannot
   * support a verdict, so no letter is awarded (Step 22A).
   */
  const grade = rated ? mealGrade(quality.score) : null;

  /** Why the verdict is withheld — the sentence shown in its place. */
  const unratedWhy =
    evidence === 'carbs_unknown'
      ? t('analysis.scoreUnavailableCarbs')
      : t('analysis.scoreUnavailableNoData');

  // Glycemic index of the whole plate (carb-weighted, from the engine) — shown
  // as a labelled chip in the calories card so the value is never a mystery.
  const gi = Math.round(result.glycemic_index || 0);
  const giTone = glycemicTone(gi);
  // …paired with the glycemic LOAD, the number that actually tracks the
  // portion. A 72-GI watermelon slice is a GL of 8; couscous at GI 65 is 39.
  const gl = Math.round(result.glycemic_load_value ?? (effectiveGi(gi) * C) / 100);
  const glInfo = glBand(gl);
  // Percentage of the plate's carbs the index actually covers (0 when unknown).
  const giCoveragePct = Math.round((result.gi_carb_coverage ?? 0) * 100);

  // Anything the engine flagged: unidentified foods, high sugar, AI estimates,
  // portions auto-adjusted. Silent until now — these are the safety messages.
  const warnings = (result.warnings ?? []).map((w) => localizeWarning(w, t));

  const micros = estimateMicros(items);
  const microAvg = microAverage(micros);
  /* What those five bars and the hydration ring REST ON (NUTR-A2 / A3 / B3).
     No number below changes — this only reports the share of the plate the
     estimate could use, the grams identified without certainty that still
     count in full, and which percentages are floors rather than matches. */
  const microProv = microProvenance(items);
  const estimateCoveragePct = Math.round(microProv.coverageRatio * 100);
  const burn = burnMinutes(cals, profile?.weight);
  /** Whether those minutes were computed for THIS patient or for the default
   *  70 kg adult. The card says which — it must not imply a personal figure
   *  when the profile could not supply one. */
  const burnFromWeight = Boolean(profile?.weight && profile.weight > 0);

  // ── Goal comparison: this meal vs the day's remaining allowance ──
  const goal = dailyCalorieGoal(
    profile?.weight,
    profile?.height,
    profile?.gender,
    profile?.birth_date
  );
  /** Whether that goal was computed from THIS patient at all, or is the flat
   *  2 000 kcal population default (NUTR-A6). The card says which. */
  const goalFromProfile = Boolean(profile?.weight && profile?.height);
  const todays = meals.filter((m) => isToday(m.created_at));
  const eaten = todays.reduce((s, m) => s + (m.result.calories || 0), 0);
  const eatenP = todays.reduce((s, m) => s + (m.result.protein || 0), 0);
  const eatenC = todays.reduce((s, m) => s + (m.result.carbohydrates || 0), 0);
  const eatenF = todays.reduce((s, m) => s + (m.result.fat || 0), 0);
  const projected = eaten + (saved ? 0 : cals);
  const mealSharePct = Math.min(100, Math.round((cals / goal) * 100));
  // Calorie dial: this plate against what one main meal is worth.
  const calScaleMax = mealCalorieScale(goal);
  const calPct = Math.min(100, Math.round((cals / calScaleMax) * 100));
  const calTone = calorieTone(calPct);
  const remainCal = Math.max(0, Math.round(goal - projected));
  const remainP = Math.max(0, Math.round((goal * 0.25) / 4 - eatenP - (saved ? 0 : P)));
  const remainC = Math.max(0, Math.round((goal * 0.5) / 4 - eatenC - (saved ? 0 : C)));
  const remainF = Math.max(0, Math.round((goal * 0.25) / 9 - eatenF - (saved ? 0 : F)));

  // Hydration: a weight-based daily goal, plus how much water THIS meal itself
  // brings (from its foods) — so the ring shows a real, portion-driven value
  // instead of a fixed full circle, and updates when the plate is edited.
  const waterTargetMl = waterGoalMl(profile?.weight);
  const waterGoalL = Math.round(waterTargetMl / 100) / 10;
  const waterGlasses = Math.round(waterTargetMl / 250);
  const mealWaterMl = estimateMealWaterMl(items);
  const waterPct = Math.min(100, Math.round((mealWaterMl / waterTargetMl) * 100));

  // The written advice repeats the score's own reasons, so it inherits the
  // gate: on an unsupported plate those reasons are "balanced meal" computed
  // from placeholder zeros. What replaces it is the way OUT of that state.
  const advice = !rated
    ? `${unratedWhy} ${t('analysis.scoreUnavailableFix')}`
    : quality.reasons.length > 0
      ? quality.reasons.slice(0, 2).join(' · ')
      : t('analysis.adviceGood');

  /* ── Share the report as a PDF ──────────────────────────────────────────
     Not a screenshot: the same report re-laid out for paper, so it stays
     sharp, selectable and paginates properly when a patient sends it to
     their doctor. Everything on screen is here, in the app's language. */
  const buildPdfHtml = () => {
    // A meal reopened from the journal keeps its real timestamp; a fresh scan
    // is stamped now.
    const createdAt =
      meals.find((m) => m.id === savedMeal?.id)?.created_at ?? new Date().toISOString();
    const dt = new Date(createdAt);
    const stamp = `${dt.toLocaleDateString(i18n.language)} · ${dt.toLocaleTimeString(
      i18n.language,
      { hour: '2-digit', minute: '2-digit' }
    )}`;
    const photo = imageBase64
      ? `data:image/jpeg;base64,${imageBase64}`
      : imageUri && /^https?:/.test(imageUri)
        ? imageUri
        : null;
    const mealLabel = mealType ? t(`mealType.${mealType}`) : '';

    const row = (label: string, value: string) =>
      `<tr><td>${esc(label)}</td><td class="v">${esc(value)}</td></tr>`;
    // `atLeast` — the share was capped at 100 %, so the printed figure is a
    // floor, not a match (NUTR-A2). Same "≥" the screen uses.
    const bar = (label: string, pct: number, atLeast = false) =>
      `<div class="mrow"><span>${esc(label)}</span>
         <span class="track"><span class="fill" style="width:${Math.min(100, pct)}%"></span></span>
         <b>${atLeast ? esc(t('analysis.atLeastPct', { pct })) : `${pct}%`}</b></div>`;

    return `<!doctype html><html lang="${i18n.language}"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  @page { size: A4; margin: 14mm 12mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, "Segoe UI", Roboto, system-ui, sans-serif;
         color: #1e2a23; margin: 0; font-size: 11.5px; line-height: 1.45; }
  h1 { font-size: 20px; margin: 0 0 2px; letter-spacing: -.3px; }
  h2 { font-size: 12.5px; margin: 0 0 8px; color: #0F7A42; text-transform: uppercase;
       letter-spacing: .6px; }
  .sub { color: #67736B; font-size: 11px; margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start;
          border-bottom: 2px solid #0F7A42; padding-bottom: 10px; margin-bottom: 14px; }
  .brand { font-weight: 800; color: #0F7A42; font-size: 12px; letter-spacing: .5px; }
  .grid { display: flex; gap: 12px; margin-bottom: 14px; }
  .card { border: 1px solid #e6ebe7; border-radius: 10px; padding: 12px 14px;
          break-inside: avoid; }
  .card.grow { flex: 1; }
  .photo { width: 190px; height: 140px; object-fit: cover; border-radius: 10px; }
  .kcal { font-size: 34px; font-weight: 800; letter-spacing: -1px; line-height: 1; }
  .kcal small { font-size: 13px; font-weight: 600; color: #67736B; margin-left: 4px; }
  .chip { display: inline-block; border-radius: 999px; padding: 3px 10px; font-size: 10.5px;
          font-weight: 700; margin-top: 8px; }
  .scale { height: 7px; border-radius: 4px; margin: 10px 0 4px;
           background: linear-gradient(90deg,#20bf6b,#eab308,#f7941d,#ef4444); position: relative; }
  .scale i { position: absolute; top: -3px; width: 3px; height: 13px; background: #1e2a23;
             border-radius: 2px; }
  .scaleEnds { display: flex; justify-content: space-between; color: #8b958e; font-size: 9.5px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 5px 0; border-bottom: 1px solid #f0f3f1; }
  td.v { text-align: right; font-weight: 700; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: .5px;
       color: #67736B; padding-bottom: 6px; border-bottom: 1px solid #e6ebe7; }
  .mrow { display: flex; align-items: center; gap: 8px; margin: 5px 0; }
  .mrow span:first-child { width: 92px; color: #5C6860; }
  .track { flex: 1; height: 6px; border-radius: 3px; background: #eef1ee; overflow: hidden; }
  .fill { display: block; height: 100%; background: #20bf6b; }
  .warn { border-color: #f2d9b0; background: #fffaf1; }
  .warn li { margin: 3px 0; }
  .foot { margin-top: 16px; padding-top: 10px; border-top: 1px solid #e6ebe7;
          color: #8b958e; font-size: 9.5px; }
</style></head><body>

  <div class="head">
    <div>
      <h1>${esc(result.food_name)}</h1>
      <p class="sub">${esc(stamp)}${mealLabel ? ` · ${esc(mealLabel)}` : ''} · ${esc(
        result.estimated_portion
      )}</p>
    </div>
    <div style="text-align:right">
      <div class="brand">GluciAI</div>
      <p class="sub">${esc(t('result.title'))}</p>
    </div>
  </div>

  <div class="grid">
    ${photo ? `<img class="photo" src="${photo}" />` : ''}
    <div class="card grow">
      <h2>${esc(t('result.calories'))}</h2>
      <div class="kcal">${cals}<small>kcal</small></div>
      <div class="scale"><i style="left:calc(${calPct}% - 1.5px)"></i></div>
      <div class="scaleEnds"><span>0</span><span>${calScaleMax} kcal</span></div>
      <span class="chip" style="background:${calTone.bg};color:${calTone.text}">
        ${esc(t(calTone.key))} · ${calPct}%
      </span>
    </div>
    <div class="card">
      <h2>${esc(t('analysis.scoreTitle'))}</h2>
      ${
        rated
          ? /* The word first, then the figure — the same demotion as on screen,
               and the note below says what the figure is (Phase 2). */
            `<p class="sub" style="font-weight:700;margin-bottom:2px">${esc(quality.label)}</p>
      <div class="kcal">${quality.score}<small>/100</small></div>
      <p class="sub">${esc(t('analysis.mealGrade'))} : <b>${grade}</b></p>
      <p class="sub" style="font-size:9.5px;margin-top:4px">${esc(t('analysis.scoreNote'))}</p>`
          : /* A document a doctor may read must not print a verdict the plate
               cannot support — the dash and the reason go in its place. */
            `<div class="kcal">—</div>
      <p class="sub" style="margin-top:4px">${esc(t('analysis.scoreUnavailableTitle'))}</p>
      <p class="sub" style="font-size:9.5px">${esc(unratedWhy)}</p>`
      }
    </div>
  </div>

  <div class="grid">
    <div class="card grow">
      <h2>${esc(t('analysis.distribution'))}</h2>
      <table>
        ${row(t('result.protein'), `${P} g · ${pPct}%`)}
        ${row(t('result.carbs'), `${carbFull} · ${carbPctText}`)}
        ${row(t('result.fat'), `${F} g · ${fPct}%`)}
        ${row(t('result.fiber'), `${Math.round(result.fiber)} g`)}
        ${row(t('result.sugar'), `${Math.round(result.sugar)} g`)}
      </table>
      <!-- A doctor reading this table must be able to tell a declared value
           from a floor or an estimate, exactly as on screen (NUTR-A7). -->
      <p class="sub" style="font-size:9.5px;margin-top:8px">${esc(dataNote)}</p>
    </div>
    <div class="card grow">
      <h2>${esc(t('analysis.giLabel'))}</h2>
      <table>
        ${row(t('analysis.giLabel'), `${gi}`)}
        ${row(t('analysis.glLabel'), `${gl} · ${t(`result.${glInfo.key}`)}`)}
        ${row(t('analysis.hydration'), t('analysis.waterFromMeal', { ml: mealWaterMl }))}
      </table>
      ${
        giCoveragePct < 100
          ? `<p class="sub" style="margin-top:8px">${esc(
              t('analysis.giCoverage', { pct: giCoveragePct })
            )}<br>${esc(t('analysis.glScope', { pct: giCoveragePct }))}</p>`
          : ''
      }
    </div>
  </div>

  <div class="card" style="margin-bottom:14px">
    <h2>${esc(t('analysis.detectedFoods'))}</h2>
    <table>
      <tr><th>${esc(t('analysis.pdfFood'))}</th><th style="text-align:right">g</th>
          <th style="text-align:right">kcal</th><th style="text-align:right">${esc(
            t('result.carbs')
          )}</th></tr>
      ${
        items
          .map(
            (it) =>
              `<tr><td>${esc(it.name)}</td>
                   <td class="v">${Math.round(it.portion_grams)}</td>
                   <td class="v">${Math.round(it.calories)}</td>
                   <td class="v">${Math.round(it.carbohydrates)} g</td></tr>`
          )
          .join('') || `<tr><td colspan="4">—</td></tr>`
      }
    </table>
  </div>

  <div class="grid">
    <div class="card grow">
      <h2>${esc(t('analysis.vitamins'))}</h2>
      ${bar(t('analysis.vitaminA'), micros.a, microProv.atLeast.a)}
      ${bar(t('analysis.vitaminC'), micros.c, microProv.atLeast.c)}
      ${bar(t('analysis.iron'), micros.fe, microProv.atLeast.fe)}
      ${bar(t('analysis.calcium'), micros.ca, microProv.atLeast.ca)}
      ${bar(t('analysis.potassium'), micros.k, microProv.atLeast.k)}
      <p class="sub" style="font-size:9.5px;margin-top:8px">${esc(
        t('analysis.estimatedFromCategories')
      )}${
        estimateCoveragePct < 100
          ? ` · ${esc(t('analysis.estimateCoverage', { pct: estimateCoveragePct }))}`
          : ''
      }${
        microProv.unsureGrams > 0
          ? ` · ${esc(t('analysis.estimateLowConfidence', { g: microProv.unsureGrams }))}`
          : ''
      }</p>
    </div>
    <div class="card grow">
      <h2>${esc(t('analysis.toBurn'))}</h2>
      <table>
        ${row(t('analysis.walk'), `${burn.walk} min`)}
        ${row(t('analysis.run'), `${burn.run} min`)}
        ${row(t('analysis.bike'), `${burn.bike} min`)}
        ${row(t('analysis.swim'), `${burn.swim} min`)}
      </table>
      <!-- A doctor must be able to see which weight these minutes assume. -->
      <p class="sub" style="font-size:9.5px;margin-top:8px">${esc(
        burnFromWeight
          ? t('analysis.burnEstimated', { kg: Math.round(profile!.weight!) })
          : t('analysis.burnEstimatedDefault')
      )}</p>
    </div>
    <div class="card grow">
      <h2>${esc(t('analysis.goals'))}</h2>
      <table>${row(t('analysis.ofDailyCalories'), `${mealSharePct}%`)}</table>
      <p class="sub" style="font-size:9.5px;margin-top:6px">${esc(
        goalFromProfile ? t('analysis.goalEstimated') : t('analysis.goalDefault')
      )}</p>
      <p class="sub" style="margin:10px 0 2px">${esc(t('analysis.remaining'))}</p>
      <table>
        ${row('kcal', `${remainCal}`)}
        ${row(t('result.protein'), `${remainP} g`)}
        ${row(t('result.carbs'), `${remainC} g`)}
        ${row(t('result.fat'), `${remainF} g`)}
      </table>
    </div>
  </div>

  ${
    warnings.length > 0
      ? `<div class="card warn"><h2>${esc(t('result.warnTitle'))}</h2>
           <ul>${warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>`
      : ''
  }

  <div class="foot">${esc(t('analysis.pdfFooter'))}</div>
</body></html>`;
  };

  const onShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      const html = buildPdfHtml();
      // Web has no file to hand off, and expo-print's web shim just prints the
      // live page — so render the report into its own frame and print THAT;
      // the browser's "Save as PDF" is the share path there.
      if (Platform.OS === 'web') {
        await printHtmlInFrame(html);
        return;
      }
      // A binary built before expo-sharing was added throws here rather than
      // answering false — treat that the same as "no share sheet" and fall
      // back to the OS print sheet, which can still save/send the PDF.
      const canShare = await Sharing.isAvailableAsync().catch(() => false);
      if (!canShare) {
        await Print.printAsync({ html });
        return;
      }
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      await Sharing.shareAsync(uri, {
        mimeType: 'application/pdf',
        UTI: 'com.adobe.pdf',
        dialogTitle: t('analysis.sharePdf'),
      });
    } catch {
      // Cancelled from the system sheet, or printing unavailable — nothing to
      // recover from, and an error toast here would just be noise.
    } finally {
      setSharing(false);
    }
  };

  const persist = async (meal: MealType) => {
    if (saved) return;
    // The confirmation window says the plate is in the journal; the row says
    // whether the server actually has it (DATA-1). Both are now shown.
    const row = await saveMeal(result, imageUri, imageBase64, undefined, meal);
    setSaveState(savedStateKey(row));
    setSaved(true);
  };

  const pickMeal = (m: MealType) => setMealType(m);

  // Applied from the edit modal AND the AI meal assistant: swap in the new
  // item list (totals/score/micros/hydration all recompute from it) and
  // invalidate a previous save so the corrected plate can be re-saved.
  const onItemsEdited = (next: FoodItemResult[]) => {
    setItems(next);
    setSaved(false);
  };
  const openEditFoods = () => {
    setEditStartNew(false);
    setEditOpen(true);
  };
  const openAddFood = () => {
    setEditStartNew(true);
    setEditOpen(true);
  };

  // Declare / update / clear the single "added sugar" row (sweet tea, juice…);
  // the plate re-aggregates so calories, GI and score all move with it.
  const setSugarGrams = (grams: number) => {
    const base = items.filter((it) => it.search_name !== SUGAR_SEARCH_NAME);
    const next = grams > 0 ? [...base, makeSugarItem(grams, t('analysis.sugarName'))] : base;
    onItemsEdited(next);
  };

  // Save → confirmation window (which then auto-redirects home after 5s).
  // With no meal chosen we can't file the plate anywhere, so ask first rather
  // than refusing silently or guessing.
  const saveAs = async (meal: MealType) => {
    if (saving) return;
    setSaving(true);
    try {
      await persist(meal);
      setMealAskOpen(false);
      setSaveModalOpen(true);
    } finally {
      setSaving(false);
    }
  };
  const onSave = () => {
    // Reviewing a meal already in the journal: nothing new to write, but the
    // patient may have corrected the slot (filed as lunch, was actually
    // dinner). Re-file that same row — never create a second copy — and keep
    // its original timestamp so the history still shows when they ate.
    if (saved && savedMeal) {
      if (mealType && mealType !== savedMeal.mealType) {
        updateMealType(savedMeal.id, mealType);
        setSaveModalOpen(true);
      } else {
        goHome();
      }
      return;
    }
    if (!mealType) {
      setMealAskOpen(true);
      return;
    }
    void saveAs(mealType);
  };
  const goHome = () => {
    clearPendingScan();
    router.replace('/(tabs)');
  };
  const onScanAnother = () => {
    clearPendingScan();
    router.replace('/scan');
  };
  const goBack = () => {
    clearPendingScan();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 92 + insets.bottom }}
      >
        {/* ── Dark header: nav row + meal photo ── */}
        <LinearGradient
          colors={['#3e4c44', '#2c3730', '#242e28']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={[styles.header, { paddingTop: insets.top + 8 }]}
        >
          <View style={styles.navRow}>
            <Pressable style={styles.navBtn} onPress={goBack} hitSlop={8}>
              <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
                <Path d="m15 18-6-6 6-6" />
              </Svg>
            </Pressable>
            <Text style={styles.navTitle}>{t('result.title')}</Text>
            {/* Share — exports the whole report as a PDF and hands it to the
                system share sheet (a patient sending it to their doctor). */}
            <Pressable
              style={[styles.navBtn, sharing && styles.navBtnBusy]}
              onPress={onShare}
              disabled={sharing}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('analysis.sharePdf')}
            >
              <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Circle cx={18} cy={5} r={3} />
                <Circle cx={6} cy={12} r={3} />
                <Circle cx={18} cy={19} r={3} />
                <Path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5" />
              </Svg>
            </Pressable>
          </View>

          {/* The header crops the photo to a strip; tapping opens it whole, so
              the patient can check what the AI actually read before trusting
              the carbs underneath it. */}
          <Pressable
            style={styles.photo}
            onPress={() => imageUri && setLightbox(true)}
            disabled={!imageUri}
            accessibilityRole="button"
            accessibilityLabel={t('common.viewPhoto')}
          >
            {imageUri ? (
              <Image source={{ uri: imageUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <View style={[StyleSheet.absoluteFill, styles.photoPh]}>
                <Text style={styles.photoPhText}>{t('analysis.mealPhoto')}</Text>
              </View>
            )}
            {/* darken the foot of the photo so the frosted score bar reads */}
            <LinearGradient
              colors={['transparent', 'rgba(0,0,0,0.34)']}
              style={styles.photoScrim}
              pointerEvents="none"
            />
            {/* Scan-success badge: text shows ~1s, then gathers into the logo */}
            <View style={[styles.scanBadge, badgeCollapsed && styles.scanBadgeCollapsed]}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#16a860" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <Circle cx={12} cy={12} r={9} />
                <Path d="m8.4 12 2.3 2.3 4.6-4.8" />
              </Svg>
              {!badgeCollapsed ? (
                <Animated.Text
                  style={[
                    styles.scanBadgeText,
                    {
                      opacity: badgeAnim.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                      transform: [
                        { translateX: badgeAnim.interpolate({ inputRange: [0, 1], outputRange: [0, -8] }) },
                      ],
                    },
                  ]}
                  numberOfLines={1}
                >
                  {t('analysis.scanSuccess')}
                </Animated.Text>
              ) : null}
            </View>
            {imageUri ? (
              <View style={styles.zoomBadge} pointerEvents="none">
                <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round">
                  <Circle cx={11} cy={11} r={8} />
                  <Path d="M21 21l-4.3-4.3M11 8v6M8 11h6" />
                </Svg>
              </View>
            ) : null}
          </Pressable>

          {/* The app's A–E indicator — under the photo, above the nutrition
              card, where it has always been. The strip names it and says whose
              indicator it is; the line below states it is not an official
              nutritional label, because an A–E letter on a food photo is
              exactly what a patient would otherwise read it as (NUTR-A1).
              Restored by product decision after Step 22D Phase 1: visual only,
              `mealGrade` and its boundaries are unchanged. */}
          <View style={styles.scoreBarBelow}>
            <MealGradeBar
              grade={grade}
              label={t('analysis.mealGrade')}
              sub={rated ? t('analysis.mealGradeSub') : t('analysis.gradeUnavailableSub')}
            />
            <Text style={styles.gradeNote}>
              {rated ? t('analysis.mealGradeNote') : unratedWhy}
            </Text>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* ── Calories + score (row 1) then macros (row 2) ── */}
          <View style={styles.card}>
            <View style={styles.calTop}>
              {/* The plate's energy on a gauge instead of a flat number: the
                  needle and its ticks run green → red as the meal eats into
                  what one main meal is worth, so "how heavy is this?" is read
                  before any digit is. The figures stay in the middle. */}
              <RotaryDial
                size={116}
                value={calPct}
                animateOnMount
                scaleLabels={['0', String(calScaleMax)]}
              >
                <Text style={styles.calDialLabel}>{t('result.calories')}</Text>
                <View style={styles.calValueRow}>
                  <Text style={styles.calValue}>{cals}</Text>
                  <Text style={styles.calUnit}>kcal</Text>
                </View>
                <Text style={styles.calSub}>{t('analysis.estimation')}</Text>
              </RotaryDial>

              <View style={styles.calTone}>
                <View style={[styles.calToneChip, { backgroundColor: calTone.bg }]}>
                  <View style={[styles.calToneDot, { backgroundColor: calTone.dot }]} />
                  <Text style={[styles.calToneText, { color: calTone.text }]} numberOfLines={1}>
                    {t(calTone.key)}
                  </Text>
                </View>
                <Text style={styles.calToneHint}>
                  {t('analysis.calOfMeal', { max: calScaleMax })}
                </Text>
              </View>

              <View style={styles.scoreCol}>
                {/* STEP 22D PHASE 2 — the interim name, and the WORD promoted
                    above the ring. The number is a six-rule heuristic on a
                    scale that never goes below 19; the word and the reasons
                    are the part of the output that can actually be checked, so
                    they lead and the figure follows. No colour, no threshold
                    and no number changed — only their order and size. */}
                <Text style={styles.scoreLabel}>{t('analysis.scoreTitle')}</Text>
                <Text style={styles.scoreSubtitle} numberOfLines={2}>
                  {t('analysis.scoreSubtitle')}
                </Text>
                {rated ? (
                  <>
                    <Text style={[styles.scoreWord, { color: quality.textColor }]} numberOfLines={1}>
                      {quality.label}
                    </Text>
                    <Ring size={54} pct={quality.score} color={quality.color} track="#eef0ec">
                      <Text style={styles.scoreValue}>{quality.score}</Text>
                      <Text style={styles.scoreDenom}>/100</Text>
                    </Ring>
                  </>
                ) : (
                  /* No verdict: an empty ring with a dash, not a manufactured
                     number. The reason sits in its own card below. */
                  <>
                    <Text style={[styles.scoreWord, styles.scoreNoneTag]} numberOfLines={1}>
                      {t('analysis.scoreUnavailable')}
                    </Text>
                    <Ring size={54} pct={0} color="#c9cfc9" track="#eef0ec">
                      <Text style={styles.scoreNone}>—</Text>
                    </Ring>
                  </>
                )}
              </View>
            </View>

            <View style={styles.macroRow}>
              <MacroMini label={t('result.protein')} value={P} pct={pPct} color={GREEN} textColor={GREEN_TXT} />
              <MacroMini label={t('result.carbs')} value={carbText} unit={carbUnit} pct={carbPctText} color={ORANGE} textColor={ORANGE_TXT} />
              <MacroMini label={t('result.fat')} value={F} pct={fPct} color={PURPLE} textColor={PURPLE_TXT} />
            </View>

            {/* One quiet line saying where those figures come from: declared by
                a database, partial, the model's own estimate, or unavailable
                (NUTR-A7). It sits with the numbers it qualifies, not in a
                separate technical panel. */}
            <Text style={styles.dataFoot}>{dataNote}</Text>

            {/* What the indicator above IS — computed by the app, from which
                inputs, and explicitly not a clinical measure. The sentence the
                A–E strip used to carry (Step 16's "not a Nutri-Score") is
                superseded by this one, which says the stronger thing. */}
            <Text style={styles.dataFoot}>{t('analysis.scoreNote')}</Text>

            {/* THE SELF-CONTRADICTION AN EXTERNAL REVIEWER HIT (and they were
                right): 736 kcal, 123 g of carbohydrate, glycemic load 50
                "Élevé", calorie chip "Élevé" — and this card's headline said
                "Excellent".

                It is arithmetically exact. The carbohydrate rule charges −15
                and CANNOT charge more, whether the plate holds 81 g or 300 g,
                and the fibre (+5) and protein (+5) bonuses hand 10 of it back.
                So 123 g costs a net 5 points.

                Fixing THAT is a formula change and belongs to RU-3 (D3). What
                does not need a decision is that the word must not stand alone
                contradicting the plate's own load. The reason already exists —
                `reasons[0]` here is "Charge glucidique très élevée (123 g)" —
                it was simply buried in the advice card far below. This raises
                it next to the figure it qualifies. No band, no weight, no
                formula: `glBand` is the one already drawing the row below. */}
            {rated && glInfo.key === 'high' && quality.reasons.length > 0 ? (
              <Text style={styles.scoreVsLoad}>
                {t('analysis.scoreVsLoad', { gl, why: quality.reasons[0] })}
              </Text>
            ) : null}
          </View>

          {/* ── Glycemic index (quality) + glycemic load (quantity) ──
              The single most important pair for a diabetic, so it gets its own
              card, using the same segmented meter as the Sélection Santé dish
              pages. The index rates HOW FAST the carbs digest and barely moves;
              the load multiplies it by HOW MUCH is on the plate, so it is what
              reacts when the patient edits a portion. */}
          {gi > 0 ? (
            <View style={styles.card}>
              <GlycemicBar
                value={gi}
                title={t('analysis.giLabel')}
                scale={[
                  t('analysis.giLow'),
                  t('analysis.giModerate'),
                  t('analysis.giHigh'),
                ]}
                description={t(IG_DESC_KEY[giTone.key])}
              />

              <View style={styles.glRow}>
                <View style={styles.glText}>
                  <Text style={styles.glLabel}>{t('analysis.glLabel')}</Text>
                  <Text style={styles.glHint}>{t('analysis.glHint')}</Text>
                </View>
                <Text style={[styles.glValue, { color: glInfo.color }]}>{gl}</Text>
                <View style={[styles.glTag, { backgroundColor: glInfo.color }]}>
                  <Text style={styles.glTagText}>{t(`result.${glInfo.key}`)}</Text>
                </View>
              </View>

              {/* Honest about how solid the index is: a category estimate,
                  and/or only part of the carbs actually carrying a GI. */}
              {result.glycemic_index_estimated || giCoveragePct < 100 ? (
                <Text style={styles.giFoot}>
                  {result.glycemic_index_estimated
                    ? `${t('analysis.giEstimated')} · `
                    : ''}
                  {t('analysis.giCoverage', { pct: giCoveragePct })}
                </Text>
              ) : null}

              {/* THE CONTRADICTION A PATIENT ACTUALLY HITS (external review):
                  the index reads "Bas · vert" and the load "Élevé · rouge" on
                  the same card, three lines apart, and the index copy used to
                  end with "idéal pour un diabétique". Both numbers are right —
                  a low-GI carbohydrate in a large portion — but nothing said
                  so, and the reassuring one came first.

                  This line appears only when they diverge, and it names the
                  figure that actually decides the outcome: the grams. No band
                  moved, no formula moved; `giBand` and `glBand` are the ones
                  already driving the two rows above it. */}
              {glInfo.key === 'high' && giTone.key !== 'high' ? (
                <Text style={styles.glVsGi}>
                  {t(giTone.key === 'low' ? 'analysis.glVsGi' : 'analysis.glVsGiMed', {
                    g: C,
                  })}
                </Text>
              ) : null}

              {/* The LOAD multiplies the index by the plate's WHOLE
                  carbohydrate, while that index was averaged over only the
                  part of it that carries one (NUTR-A5). When those differ, the
                  load extrapolates — said out loud rather than left in the
                  arithmetic. */}
              {giCoveragePct < 100 ? (
                <Text style={styles.giFoot}>
                  {t('analysis.glScope', { pct: giCoveragePct })}
                </Text>
              ) : null}

              {/* The index and the health score are two different questions,
                  and the screen shows both at once — a plate can read "IG 70 ·
                  Élevé" beside a high score without either being wrong. Said
                  once, here, rather than left for the patient to reconcile
                  (Step 22A). */}
              <Text style={styles.giFoot}>{t('analysis.giScoreScope')}</Text>
            </View>
          ) : null}

          {/* ── Safety notices from the engine ──
              Unidentified foods, heavy sugar, AI-estimated values, portions
              auto-adjusted. These drive whether the totals below can be
              trusted for a bolus, so they sit directly under them. */}
          {warnings.length > 0 ? (
            <View style={[styles.card, styles.warnCard]}>
              <View style={styles.warnHead}>
                {/* Same rounded-square icon badge the calories card uses, tinted
                    amber — one icon vocabulary across the page. */}
                <View style={styles.warnIcon}>
                  <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#B9701A" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
                    <Path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <Path d="M12 9v4M12 17h.01" />
                  </Svg>
                </View>
                <Text style={styles.warnTitle}>{t('result.warnTitle')}</Text>
              </View>
              {warnings.map((w, i) => (
                <View key={i} style={styles.warnItem}>
                  <View style={styles.warnDot} />
                  <Text style={styles.warnText}>{w}</Text>
                </View>
              ))}
            </View>
          ) : null}

          {/* ── Detected foods (editable) ── */}
          <View style={styles.card}>
            <View style={styles.foodsHead}>
              <Text style={styles.cardTitle}>{t('analysis.detectedFoods')}</Text>
              <Pressable style={styles.editBtn} onPress={openEditFoods} hitSlop={6}>
                <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#10723F" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </Svg>
                <Text style={styles.editBtnText}>{t('common.edit')}</Text>
              </Pressable>
            </View>
            <View style={{ marginTop: 11, gap: 11 }}>
              {items.map((it, i) => (
                <View key={i} style={styles.foodRow}>
                  <View style={[styles.foodEmoji, { backgroundColor: FOOD_TINTS[i % FOOD_TINTS.length] }]}>
                    <Text style={{ fontSize: 17 }}>
                      {CATEGORY_EMOJI[it.category ?? 'Unknown'] ?? '🍽️'}
                    </Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.foodName} numberOfLines={1}>{it.name}</Text>
                    <Text style={styles.foodPortion}>{Math.round(it.portion_grams)} g</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.foodKcal}>{Math.round(it.calories)} kcal</Text>
                    {/* A food no database matched carries ZERO nutrition. Showing
                        the vision model's confidence next to it read as "0 kcal,
                        86% sure" — the 86% is only about SEEING the food, not
                        about its values. Flag the gap instead. */}
                    {it.nutrition_confidence === 0 ? (
                      <View style={styles.unknownTag}>
                        <Text style={styles.unknownTagText}>
                          {t('analysis.unknownValues')}
                        </Text>
                      </View>
                    ) : carbStatus(it) !== 'known' ? (
                      /* Identified, real calories — but the source said
                         nothing about carbohydrate. A distinct state from the
                         one above, and the one that used to pass silently. */
                      <View style={styles.unknownTag}>
                        <Text style={styles.unknownTagText}>
                          {t('analysis.carbsUnknownTag')}
                        </Text>
                      </View>
                    ) : (
                      <Text style={styles.foodConf}>
                        {t('result.confidence')} {Math.round((it.detection_confidence ?? 0) * 100)}%
                      </Text>
                    )}
                  </View>
                </View>
              ))}
              {items.length === 0 ? (
                <Text style={styles.foodPortion}>{result.food_name}</Text>
              ) : null}
            </View>
            {/* Add a food the AI didn't see in the photo */}
            <Pressable style={styles.addFoodBtn} onPress={openAddFood}>
              <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#10723F" strokeWidth={2.4} strokeLinecap="round">
                <Path d="M12 5v14M5 12h14" />
              </Svg>
              <Text style={styles.addFoodText}>{t('analysis.addFood')}</Text>
            </Pressable>
          </View>

          {/* ── Added-sugar prompt (sweet tea / juice…) ── */}
          <AddedSugarCard items={items} language={i18n.language} onSetGrams={setSugarGrams} />

          {/* ── Nutritional split (donut) ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('analysis.distribution')}</Text>
            <View style={styles.donutRow}>
              <MacroDonut p={pPct} c={cPct} f={fPct} />
              <View style={{ flex: 1, minWidth: 0, gap: 9 }}>
                <LegendRow color={GREEN} label={t('result.protein')} value={P} pct={pPct} />
                <LegendRow color={ORANGE} label={t('result.carbs')} value={carbText} unit={carbUnit} pct={carbPctText} />
                <LegendRow color={PURPLE} label={t('result.fat')} value={F} pct={fPct} />
              </View>
            </View>
          </View>

          {/* ── Personalised advice — the AI robot + written advice (opens coach) ── */}
          <Pressable style={styles.advice} onPress={() => setAssistantOpen(true)}>
            <View style={styles.adviceRobot}>
              <AnimatedRobot size={34} mood="happy" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.adviceHead}>
                <Text style={styles.adviceTitle}>{t('analysis.advice')}</Text>
                <View style={styles.aiPill}>
                  <Text style={styles.aiPillText}>{t('analysis.aiTag')}</Text>
                </View>
              </View>
              <Text style={styles.adviceBody}>{advice}</Text>
            </View>
            <Svg width={19} height={19} viewBox="0 0 24 24" fill="none" stroke="#8fbfa5" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
              <Path d="m9 18 6-6-6-6" />
            </Svg>
          </Pressable>

          {/* ── Four insight cards ── */}
          <View style={styles.miniRow}>
            {/* Vitamins & minerals */}
            <View style={styles.miniCard}>
              <View style={styles.miniHead}>
                <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
                  <Path d="m8.5 8.5 7 7" />
                </Svg>
                <Text style={styles.miniTitle}>{t('analysis.vitamins')}</Text>
              </View>
              <Text style={styles.miniGood}>
                {microAvg >= 30 ? t('analysis.goodIntake') : t('analysis.lowIntake')}
              </Text>
              <View style={{ gap: 6, marginTop: 1 }}>
                <MicroBar label={t('analysis.vitaminA')} pct={micros.a} atLeast={microProv.atLeast.a} />
                <MicroBar label={t('analysis.vitaminC')} pct={micros.c} atLeast={microProv.atLeast.c} />
                <MicroBar label={t('analysis.iron')} pct={micros.fe} atLeast={microProv.atLeast.fe} />
                <MicroBar label={t('analysis.calcium')} pct={micros.ca} atLeast={microProv.atLeast.ca} />
                <MicroBar label={t('analysis.potassium')} pct={micros.k} atLeast={microProv.atLeast.k} />
              </View>
              {/* No provider publishes micronutrients, so every bar above is a
                  category density × the grams on the plate. Said in the same
                  words the GI chip already uses, rather than left to look like
                  the declared macros two cards up (NUTR-A2 / NUTR-B3). */}
              <Text style={styles.estimateFoot}>{t('analysis.estimatedFromCategories')}</Text>
              {estimateCoveragePct < 100 || microProv.unsureGrams > 0 ? (
                <Text style={styles.estimateFoot}>
                  {estimateCoveragePct < 100
                    ? t('analysis.estimateCoverage', { pct: estimateCoveragePct })
                    : ''}
                  {estimateCoveragePct < 100 && microProv.unsureGrams > 0 ? ' · ' : ''}
                  {microProv.unsureGrams > 0
                    ? t('analysis.estimateLowConfidence', { g: microProv.unsureGrams })
                    : ''}
                </Text>
              ) : null}
            </View>

            {/* Goal comparison */}
            <View style={styles.miniCard}>
              <View style={styles.miniHead}>
                <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2}>
                  <Circle cx={12} cy={12} r={10} />
                  <Circle cx={12} cy={12} r={6} />
                  <Circle cx={12} cy={12} r={2} />
                </Svg>
                <Text style={styles.miniTitle}>{t('analysis.goals')}</Text>
              </View>
              <View style={{ alignSelf: 'center', marginVertical: 2 }}>
                <Ring size={74} pct={mealSharePct} color={GREEN} track="#eef0ec">
                  <Text style={styles.goalPct}>{mealSharePct}%</Text>
                </Ring>
              </View>
              <Text style={styles.goalCaption}>{t('analysis.ofDailyCalories')}</Text>
              {/* Whose calories, exactly? An estimate from the profile, or the
                  flat 2 000 kcal default when the profile cannot answer
                  (NUTR-A6). Said here rather than left implied by "your". */}
              <Text style={styles.estimateFoot}>
                {goalFromProfile ? t('analysis.goalEstimated') : t('analysis.goalDefault')}
              </Text>
              <Text style={styles.remainTitle}>{t('analysis.remaining')}</Text>
              <View style={{ gap: 4 }}>
                <RemainRow color={ORANGE} value={`${remainCal}`} unit="kcal" />
                <RemainRow color={GREEN} value={`${remainP} g`} unit={t('result.protein')} />
                <RemainRow color={ORANGE} value={`${remainC} g`} unit={t('result.carbs')} />
                <RemainRow color={PURPLE} value={`${remainF} g`} unit={t('result.fat')} />
              </View>
            </View>

            {/* Burn */}
            <View style={styles.miniCard}>
              <View style={styles.miniHead}>
                <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={ORANGE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                </Svg>
                <Text style={styles.miniTitle}>{t('analysis.toBurn')}</Text>
              </View>
              <View style={{ gap: 9, marginTop: 2 }}>
                <BurnRow emoji="🚶" label={t('analysis.walk')} min={burn.walk} />
                <BurnRow emoji="🏃" label={t('analysis.run')} min={burn.run} />
                <BurnRow emoji="🚴" label={t('analysis.bike')} min={burn.bike} />
                <BurnRow emoji="🏊" label={t('analysis.swim')} min={burn.swim} />
              </View>
              <Text style={styles.miniFoot}>{t('analysis.basedOn', { cal: cals })}</Text>
              {/* Computed from THIS patient's weight when the profile has one
                  (MET × 3.5 × kg / 200), and it says which case it is in. */}
              <Text style={styles.estimateFoot}>
                {burnFromWeight
                  ? t('analysis.burnEstimated', { kg: Math.round(profile!.weight!) })
                  : t('analysis.burnEstimatedDefault')}
              </Text>
            </View>

            {/* Hydration */}
            <View style={styles.miniCard}>
              <View style={styles.miniHead}>
                <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={BLUE} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                  <Path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C8 11.1 7 13 7 15a7 7 0 0 0 7 7z" />
                </Svg>
                <Text style={styles.miniTitle}>{t('analysis.hydration')}</Text>
              </View>
              <View style={{ alignSelf: 'center', marginVertical: 2 }}>
                <Ring size={74} pct={waterPct} color={BLUE} track="#e3eefb">
                  <Text style={styles.goalPct}>{waterPct}%</Text>
                </Ring>
              </View>
              <Text style={styles.goalCaption}>{t('analysis.ofWaterNeeds')}</Text>
              {/* The ring is this MEAL's contribution to the daily goal, not how
                  hydrated the patient is — spelled out so a low ring doesn't
                  read as a failure. The millilitres themselves are inferred
                  from each food's category, never measured, so the line now
                  says "≈ … estimated" and the foot says from what (NUTR-A3). */}
              <Text style={styles.waterFromMeal}>
                {t('analysis.waterFromMeal', { ml: mealWaterMl })}
              </Text>
              <View style={styles.waterStat}>
                <Text style={styles.waterStatVal}>{waterGoalL} L</Text>
                <Text style={styles.waterStatUnit}>· {t('analysis.glasses', { n: waterGlasses })}</Text>
              </View>
              <Text style={styles.waterHint}>{t('analysis.drinkReminder')}</Text>
              <Text style={styles.estimateFoot}>
                {t('analysis.estimatedFromCategories')}
                {estimateCoveragePct < 100
                  ? ` · ${t('analysis.estimateCoverage', { pct: estimateCoveragePct })}`
                  : ''}
              </Text>
            </View>
          </View>

          {/* ── Which meal is this? — only while the plate is unsaved ──
              Sits last, right above the save button, because it is the final
              decision before filing the plate. Pre-filled from the clock in the
              obvious hours; left empty (and required) when the hour is
              ambiguous — see defaultMealType. Stays visible on an already-saved
              meal so a wrong slot can be corrected and re-filed. */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('result.mealMoment')}</Text>
            <View style={styles.mealRow}>
              {MEAL_TYPES.map((m) => {
                const on = mealType === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => pickMeal(m)}
                    style={[styles.mealChip, on && styles.mealChipOn]}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                  >
                    {/* Solid fill + tick when chosen: at this size a tinted
                        border alone was too quiet to read as "this one is
                        selected", and the patient must be able to tell at a
                        glance which meal their plate is about to be filed under. */}
                    {on ? (
                      <Svg width={11} height={11} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3.4} strokeLinecap="round" strokeLinejoin="round">
                        <Path d="M20 6 9 17l-5-5" />
                      </Svg>
                    ) : null}
                    <Text
                      style={[styles.mealChipText, on && styles.mealChipTextOn]}
                      numberOfLines={1}
                    >
                      {t(`mealType.${m}`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {!mealType ? (
              <Text style={[styles.mealHint, styles.mealHintAsk]}>
                {t('analysis.mealMomentAsk')}
              </Text>
            ) : savedMeal && mealType !== savedMeal.mealType ? (
              // Corrected the slot — say what the button will now do.
              <Text style={[styles.mealHint, styles.mealHintMoved]}>
                {t('analysis.mealMomentMoved', { meal: t(`mealType.${mealType}`) })}
              </Text>
            ) : null}
          </View>
        </View>
      </ScrollView>

      {/* ── Sticky action bar — Enregistrer + Scanner un autre ── */}
      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        <FooterBtn
          flex={1.25}
          primary
          label={saving ? t('common.loading') : t('analysis.save')}
          onPress={onSave}
          icon={
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />
            </Svg>
          }
        />
        <FooterBtn
          flex={1}
          label={t('analysis.scanAnother')}
          onPress={onScanAnother}
          icon={
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#3a463f" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10" />
            </Svg>
          }
        />
      </View>

      <MealAssistant
        items={items}
        onApply={onItemsEdited}
        carbs={result.carbohydrates}
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
      />

      <MealEditModal
        open={editOpen}
        items={itemsForEdit(result, items)}
        startWithNewRow={editStartNew}
        onClose={() => setEditOpen(false)}
        onSaved={onItemsEdited}
      />

      {/* Forgot to pick a meal → ask here instead of blocking the save button
          with no explanation. Confirming saves straight away. */}
      <MealTypeModal
        open={mealAskOpen}
        initial={mealType}
        saving={saving}
        onCancel={() => setMealAskOpen(false)}
        onConfirm={(m) => {
          pickMeal(m);
          void saveAs(m);
        }}
      />

      <SaveConfirmModal open={saveModalOpen} onDone={goHome} stateKey={saveState ?? undefined} />

      <ImageLightbox
        uri={imageUri}
        visible={lightbox}
        onClose={() => setLightbox(false)}
        caption={result.food_name}
      />
    </View>
  );
}

/* ─────────────────────────── Small building blocks ─────────────────────── */

/** `color` paints the dot (a graphic), `textColor` the percentage (type) — the
 *  bright chart colours are unreadable at 11 px on white. */
/* `value`, `unit` and `pct` are pre-formatted strings rather than numbers so
   a macro with no trustworthy figure can render "—" (and no unit) instead of
   a zero. Protein and fat always pass plain numbers and read as they did. */
function MacroMini({ label, value, unit = 'g', pct, color, textColor }: { label: string; value: number | string; unit?: string; pct: number | string; color: string; textColor: string }) {
  return (
    <View style={styles.macroCol}>
      <View style={styles.macroTop}>
        <View style={[styles.macroDot, { backgroundColor: color }]} />
        <Text style={styles.macroLabel} numberOfLines={1}>{label}</Text>
      </View>
      <View style={styles.macroValRow}>
        <Text style={styles.macroVal}>{value}</Text>
        {unit ? <Text style={styles.macroG}>{unit}</Text> : null}
      </View>
      <Text style={[styles.macroPct, { color: textColor }]}>
        {typeof pct === 'number' ? `${pct}%` : pct}
      </Text>
    </View>
  );
}

function LegendRow({ color, label, value, unit = 'g', pct }: { color: string; label: string; value: number | string; unit?: string; pct: number | string }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendVal}>
        {value}{unit ? ` ${unit}` : ''}{' '}
        <Text style={styles.legendPct}>({typeof pct === 'number' ? `${pct}%` : pct})</Text>
      </Text>
    </View>
  );
}

/** `atLeast`: the plate's real share went past the daily reference and the
 *  percentage was capped at 100 — so the bar is full and the number is a FLOOR.
 *  Printed "≥ 100 %", the same idiom a partially known carbohydrate uses. */
function MicroBar({ label, pct, atLeast }: { label: string; pct: number; atLeast?: boolean }) {
  const { t } = useTranslation();
  return (
    <View style={styles.microRow}>
      <Text style={styles.microLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.microTrack}>
        <View style={[styles.microFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.microPct}>
        {atLeast ? t('analysis.atLeastPct', { pct }) : `${pct}%`}
      </Text>
    </View>
  );
}

function RemainRow({ color, value, unit }: { color: string; value: string; unit: string }) {
  return (
    <View style={styles.remainRow}>
      <View style={[styles.remainDot, { backgroundColor: color }]} />
      <Text style={styles.remainText}>
        <Text style={styles.remainVal}>{value}</Text> <Text style={styles.remainUnit}>{unit}</Text>
      </Text>
    </View>
  );
}

function BurnRow({ emoji, label, min }: { emoji: string; label: string; min: number }) {
  return (
    <View style={styles.burnRow}>
      <Text style={{ fontSize: 12.5 }}>{emoji}</Text>
      <Text style={styles.burnLabel} numberOfLines={1}>{label}</Text>
      <Text style={styles.burnMin}>{min} min</Text>
    </View>
  );
}

function FooterBtn({ flex, label, icon, onPress, primary }: { flex: number; label: string; icon: React.ReactNode; onPress: () => void; primary?: boolean }) {
  return (
    <Pressable style={[styles.footBtn, { flex }, primary && styles.footBtnPrimary]} onPress={onPress}>
      {icon}
      <Text style={[styles.footLabel, primary && styles.footLabelPrimary]} numberOfLines={2}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#eef1ec' },

  header: { paddingBottom: 18 },
  navRow: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  navBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnBusy: { opacity: 0.5 },
  navTitle: { color: '#fff', fontSize: 17, fontFamily: F700 },
  photo: {
    marginTop: 6,
    marginHorizontal: 14,
    height: 202,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#222a21',
  },
  photoPh: { alignItems: 'center', justifyContent: 'center' },
  photoPhText: { color: '#8b968c', fontFamily: F600, fontSize: 13 },
  photoScrim: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 96 },
  // Says the strip is tappable — otherwise nothing suggests it opens.
  zoomBadge: {
    position: 'absolute',
    top: 10,
    right: 10,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(10,14,20,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBadge: {
    position: 'absolute',
    left: 12,
    top: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 6,
    paddingLeft: 8,
    paddingRight: 12,
  },
  scanBadgeText: { color: '#0F7A42', fontSize: 12.5, fontFamily: F700 },
  // Once the text has gathered into the check, the pill shrinks to the logo.
  scanBadgeCollapsed: { paddingLeft: 8, paddingRight: 8, gap: 0 },
  // The A–E strip lives under the photo, inside the hero gradient.
  scoreBarBelow: { marginHorizontal: 14, marginTop: 12 },
  // The "app indicator, not an official label" line. On the photo gradient, so
  // it is light — and left to wrap, since German and Arabic run longer.
  gradeNote: {
    color: 'rgba(255,255,255,0.72)',
    fontFamily: F600,
    fontSize: 10.5,
    lineHeight: 14,
    marginTop: 6,
    marginHorizontal: 2,
  },

  body: { paddingHorizontal: 14, paddingTop: 13, gap: 12 },
  card: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 14,
    shadowColor: 'rgba(28,39,33,1)',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  cardTitle: { fontSize: 12.5, fontFamily: F700, color: INK },

  // Calories card
  calTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  macroRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 14, paddingHorizontal: 4 },
  // Centre stack of the calorie dial. Sizes are held down on purpose: the
  // clear zone inside the needle sweep is only ~58% of the dial's width.
  calDialLabel: { fontSize: 9.5, color: LABEL, fontFamily: F600 },
  calValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  calValue: { fontSize: 23, lineHeight: 27, fontFamily: F800, color: INK, letterSpacing: -0.5 },
  calUnit: { fontSize: 10, color: MUTED, fontFamily: F600 },
  calSub: { fontSize: 8.5, color: MUTED, fontFamily: F500 },

  calTone: { flex: 1, minWidth: 0, alignItems: 'center', gap: 5 },
  calToneChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 9,
  },
  calToneDot: { width: 6, height: 6, borderRadius: 3 },
  calToneText: { fontSize: 10.5, fontFamily: F800 },
  calToneHint: { fontSize: 9, lineHeight: 12, color: MUTED, fontFamily: F500, textAlign: 'center' },

  // Glycemic load — sits under the shared GlycemicBar, same card
  glRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    marginTop: 13,
    paddingTop: 13,
    borderTopWidth: 1,
    borderTopColor: '#f0f2ee',
  },
  glText: { flex: 1, minWidth: 0 },
  glLabel: { fontSize: 12.5, fontFamily: F700, color: INK },
  // MUTED (#9aa49d) only reaches 2.6:1 on white — below AA for body text.
  // MUTED is now the theme-aligned readable grey, which clears 4.5:1.
  glHint: { fontSize: 10, lineHeight: 14, color: MUTED, fontFamily: F500, marginTop: 2 },
  glValue: { fontSize: 19, lineHeight: 21, fontFamily: F800 },
  glTag: { borderRadius: 999, paddingVertical: 3.5, paddingHorizontal: 9 },
  glTagText: { fontSize: 10, fontFamily: F800, color: '#fff' },
  giFoot: { fontSize: 10, color: MUTED, fontFamily: F500, marginTop: 10 },
  /* The indicator-vs-load caveat. Amber like the GI/GL reconciliation, because
     it fires for the same reason: two figures on one card disagreeing. */
  scoreVsLoad: {
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 12,
    backgroundColor: '#fff8ec',
    borderWidth: 1,
    borderColor: '#f2d9b0',
    color: '#8A5A00',
    fontFamily: F600,
    fontSize: 11.5,
    lineHeight: 16,
  },
  /* The index/load reconciliation. Amber-tinted panel rather than grey body
     text: it fires only when the two rows above disagree, which is exactly
     when the patient needs to read something instead of skimming past. */
  glVsGi: {
    marginTop: 10,
    paddingVertical: 9,
    paddingHorizontal: 11,
    borderRadius: 12,
    backgroundColor: '#fff8ec',
    borderWidth: 1,
    borderColor: '#f2d9b0',
    color: '#8A5A00',
    fontFamily: F600,
    fontSize: 11.5,
    lineHeight: 16,
  },
  /* Provenance of the totals (NUTR-A7). Wraps freely: the German and Arabic
     sentences are long, and truncating the caveat is exactly the failure this
     line exists to prevent. */
  dataFoot: {
    fontSize: 10,
    lineHeight: 14,
    color: MUTED,
    fontFamily: F500,
    marginTop: 12,
    paddingHorizontal: 4,
  },

  macroCol: { alignItems: 'flex-start', gap: 2 },
  macroTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  macroDot: { width: 7, height: 7, borderRadius: 2 },
  macroLabel: { fontSize: 10, color: LABEL, fontFamily: F600 },
  macroValRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  macroVal: { fontSize: 17, fontFamily: F800, color: INK },
  macroG: { fontSize: 10, color: MUTED, fontFamily: F600 },
  macroPct: { fontSize: 11, fontFamily: F700 },

  scoreCol: { alignItems: 'center', gap: 3 },
  scoreLabel: { fontSize: 10, color: LABEL, fontFamily: F600 },
  ringCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scoreValue: { fontSize: 16, fontFamily: F800, color: INK, lineHeight: 18 },
  scoreDenom: { fontSize: 7, color: MUTED, fontFamily: F600 },
  /** Whose indicator this is — under the title, above the word. */
  scoreSubtitle: { fontSize: 8.5, lineHeight: 11, color: MUTED, fontFamily: F500, marginTop: 1 },
  /** The WORD, promoted above the ring in Phase 2. Same colour as before —
   *  only its position and size changed. */
  scoreWord: { fontSize: 12, fontFamily: F800, marginTop: 3, marginBottom: 1 },
  // No verdict (Step 22A): a dash where the number was, in the muted tone the
  // rest of the screen uses for "we do not know", never a colour that grades.
  scoreNone: { fontSize: 18, fontFamily: F800, color: MUTED, lineHeight: 20 },
  scoreNoneTag: { color: MUTED },

  // Detected foods
  foodsHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#e8f7ef',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  editBtnText: { fontSize: 11, fontFamily: F700, color: '#10723F' },
  foodRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  foodEmoji: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  foodName: { fontSize: 11.5, fontFamily: F700, color: INK },
  foodPortion: { fontSize: 10.5, color: MUTED, fontFamily: F500 },
  foodKcal: { fontSize: 12, fontFamily: F800, color: GREEN_TXT },
  foodConf: { fontSize: 9.5, color: MUTED, fontFamily: F500 },
  unknownTag: {
    backgroundColor: '#fdeceb',
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 7,
    marginTop: 2,
  },
  // Darkened from #c0563a (3.97:1) to clear AA on the tinted badge.
  unknownTagText: { fontSize: 9.5, color: '#A33B22', fontFamily: F700 },
  addFoodBtn: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingVertical: 11,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#bfe6d0',
    borderStyle: 'dashed',
    backgroundColor: '#f4fbf7',
  },
  addFoodText: { fontSize: 12, fontFamily: F700, color: '#10723F' },

  // Donut
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 13 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 3 },
  legendLabel: { flex: 1, fontSize: 11, color: '#5a655d', fontFamily: F600 },
  legendVal: { fontSize: 10.5, fontFamily: F700, color: INK },
  legendPct: { color: MUTED, fontFamily: F600 },

  // Advice
  advice: {
    backgroundColor: '#e8f7ef',
    borderRadius: 18,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  adviceRobot: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adviceHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 2 },
  adviceTitle: { fontSize: 13, fontFamily: F800, color: '#10723F' },
  aiPill: {
    // Darkened so the 9 px white "IA" label clears AA on the pill.
    backgroundColor: '#10723F',
    borderRadius: 999,
    paddingVertical: 2,
    paddingHorizontal: 7,
  },
  aiPillText: { fontSize: 9, fontFamily: F800, color: '#fff', letterSpacing: 0.3 },
  adviceBody: { fontSize: 11.5, lineHeight: 16.5, color: '#47614F', fontFamily: F500 },

  // Four mini cards — 2×2 grid (was a cramped single row of four)
  miniRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 11 },
  miniCard: {
    flexGrow: 1,
    flexBasis: '46%',
    minWidth: 0,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 13,
    gap: 8,
    shadowColor: 'rgba(28,39,33,1)',
    shadowOpacity: 0.05,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  miniHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  miniTitle: { fontSize: 11.5, fontFamily: F700, color: INK, flex: 1 },
  miniGood: { fontSize: 11, fontFamily: F700, color: GREEN_TXT },
  miniFoot: { fontSize: 9.5, color: MUTED, fontFamily: F500, marginTop: 'auto', paddingTop: 3 },

  microRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  microLabel: { fontSize: 10, color: '#6b746e', fontFamily: F600, width: 62 },
  microTrack: { flex: 1, height: 6, backgroundColor: '#eef0ec', borderRadius: 3, overflow: 'hidden' },
  microFill: { height: '100%', backgroundColor: GREEN, borderRadius: 3 },
  // Wide enough for "≥ 100 %" (a capped share) as well as "100%" — the four
  // locales all render that idiom, and a clipped "≥" would read as a match.
  microPct: { fontSize: 10, color: '#4a544d', fontFamily: F700, width: 44, textAlign: 'right' },
  // "Estimated from category and weight" under the two inferred-value cards.
  // Same muted register as `giFoot`, which has said this for the GI all along.
  estimateFoot: {
    fontSize: 9,
    lineHeight: 12,
    color: MUTED,
    fontFamily: F500,
    marginTop: 6,
  },

  goalPct: { fontSize: 20, fontFamily: F800, color: INK },
  goalCaption: { textAlign: 'center', fontSize: 10, color: MUTED, fontFamily: F500, lineHeight: 13 },
  remainTitle: { fontSize: 10.5, fontFamily: F700, color: '#4a544d', marginTop: 4 },
  remainRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  remainDot: { width: 7, height: 7, borderRadius: 2 },
  remainText: { fontSize: 10.5 },
  remainVal: { fontFamily: F800, color: INK },
  remainUnit: { color: MUTED, fontFamily: F600 },

  burnRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  burnLabel: { fontSize: 10.5, color: '#4a544d', fontFamily: F600, flex: 1 },
  burnMin: { fontSize: 10.5, color: INK, fontFamily: F800 },

  waterStat: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'center', gap: 3, flexWrap: 'wrap' },
  waterStatVal: { fontSize: 12, fontFamily: F800, color: INK },
  waterStatUnit: { fontSize: 9.5, fontFamily: F600, color: MUTED },
  waterHint: { textAlign: 'center', fontSize: 9.5, color: MUTED, fontFamily: F500, lineHeight: 13, marginTop: 'auto', paddingTop: 3 },
  waterFromMeal: {
    textAlign: 'center',
    fontSize: 9.5,
    color: '#2E6B9E',
    fontFamily: F700,
    marginTop: 2,
  },

  // Safety notices (unidentified foods, high sugar, AI estimates…)
  // Layered on `card`, so it keeps the page's radius, padding and shadow and
  // only changes the surface to amber — an alert, not a foreign component.
  warnCard: {
    backgroundColor: '#FFFBF3',
    borderWidth: 1,
    borderColor: '#F4E3C6',
    gap: 9,
  },
  warnHead: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  warnIcon: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#FDF0D9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // #8A5310 on #FFFBF3 ≈ 7.3:1, #7d6234 ≈ 5.3:1 — both clear AA for this size.
  warnTitle: { fontSize: 12.5, fontFamily: F800, color: '#8A5310' },
  warnItem: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  warnDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#D9A441',
    marginTop: 5.5,
  },
  warnText: { flex: 1, fontSize: 11, lineHeight: 16, color: '#7d6234', fontFamily: F500 },

  // Which-meal chips
  mealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginTop: 11 },
  mealChip: {
    flexGrow: 1,
    flexBasis: 0,
    minWidth: 68,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 9,
    paddingHorizontal: 6,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#e3e7e0',
    backgroundColor: '#fbfcfa',
  },
  mealChipOn: { borderColor: '#0F7A42', backgroundColor: '#0F7A42' },
  mealChipText: { fontSize: 11, fontFamily: F700, color: LABEL },
  // White on #0F7A42 is 5.4:1 — the filled state stays readable.
  mealChipTextOn: { color: '#fff' },
  mealHint: { fontSize: 10, color: MUTED, fontFamily: F500, marginTop: 8 },
  mealHintAsk: { color: '#B4441A', fontFamily: F700 },
  mealHintMoved: { color: '#0F7A42', fontFamily: F700 },

  // Footer
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e6e9e4',
    paddingTop: 12,
    paddingHorizontal: 14,
    flexDirection: 'row',
    gap: 9,
  },
  footBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#e3e7e0',
    borderRadius: 13,
    paddingVertical: 11,
    paddingHorizontal: 6,
  },
  footBtnPrimary: { borderColor: '#0F7A42', backgroundColor: '#0F7A42' },
  // German ("Weitere Mahlzeit scannen") needs ~130 px where only 117 px were
  // available, so the label was silently truncated. Let it shrink and wrap to
  // a second line instead of losing words.
  footLabel: {
    flexShrink: 1,
    fontSize: 10.5,
    lineHeight: 13,
    fontFamily: F700,
    color: '#3a463f',
    textAlign: 'center',
  },
  footLabelPrimary: { color: '#fff' },
});
