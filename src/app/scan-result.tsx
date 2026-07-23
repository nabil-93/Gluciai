import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Path } from 'react-native-svg';

import { MealAssistant } from '@/components/MealAssistant';
import { MealEditModal } from '@/components/MealEditModal';
import { NutriScoreBar } from '@/components/NutriScoreBar';
import { saveMeal } from '@/services/data';
import { aggregateItems } from '@/services/nutrition/engine';
import { nutriGrade, scoreMeal } from '@/services/nutrition/mealScore';
import {
  estimateMealWaterMl,
  estimateMicros,
  microAverage,
  waterGoalMl,
} from '@/services/nutrition/micros';
import { clearPendingScan, getPendingScan } from '@/services/scanSession';
import { useAppStore } from '@/store/useAppStore';
import type { FoodCategory, FoodItemResult, MealType, NutritionResult } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN = '#20bf6b';
const ORANGE = '#f7941d';
const PURPLE = '#8b5cf6';
const BLUE = '#38a1f0';
const INK = '#1e2a23';
const MUTED = '#9aa49d';

/** Suggest the meal of the day from the current hour. */
function defaultMealType(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 22) return 'dinner';
  return 'snack';
}

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

/** Rough daily calorie target from the profile (Mifflin-St Jeor × light
 *  activity), falling back to 2000 kcal when the body metrics are unknown. */
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

/** Minutes of each activity needed to burn `cal` kcal (moderate intensity,
 *  ~70 kg reference). Illustrative — for motivation, not a prescription. */
function burnMinutes(cal: number) {
  return {
    walk: Math.max(1, Math.round(cal / 5)),
    run: Math.max(1, Math.round(cal / 12)),
    bike: Math.max(1, Math.round(cal / 8.5)),
    swim: Math.max(1, Math.round(cal / 9.5)),
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
    },
  ];
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
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const profile = useAppStore((s) => s.profile);
  const meals = useAppStore((s) => s.meals);

  const [pending] = useState(() => getPendingScan());
  const [items, setItems] = useState<FoodItemResult[]>(() => pending?.result.items ?? []);
  const [mealType] = useState<MealType>(() => defaultMealType());
  const [saving, setSaving] = useState(false);
  // When opened to review a meal already in the journal (from the Nutrition
  // page), start as "saved" so it can't be re-saved and the day isn't double
  // counted; a fresh scan starts unsaved as before.
  const [saved, setSaved] = useState(() => pending?.alreadySaved ?? false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editStartNew, setEditStartNew] = useState(false);

  if (!pending) return <Redirect href="/(tabs)" />;

  const { imageUri, base64: imageBase64 } = pending;
  const result = items.length > 0 ? aggregateItems(items) : pending.result;

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

  const quality = scoreMeal({
    calories: result.calories,
    carbs: result.carbohydrates,
    sugar: result.sugar,
    protein: result.protein,
    fat: result.fat,
    fiber: result.fiber,
    sodium: result.sodium,
    glycemic_index: result.glycemic_index,
  });

  // Front-of-pack A–E letter derived from the same quality score, shown on
  // the photo — it moves with the food (a lean, high-fibre plate → A/B; a
  // sugary, high-GI one → D/E).
  const grade = nutriGrade(quality.score);

  const micros = estimateMicros(items);
  const microAvg = microAverage(micros);
  const burn = burnMinutes(cals);

  // ── Goal comparison: this meal vs the day's remaining allowance ──
  const goal = dailyCalorieGoal(
    profile?.weight,
    profile?.height,
    profile?.gender,
    profile?.birth_date
  );
  const todays = meals.filter((m) => isToday(m.created_at));
  const eaten = todays.reduce((s, m) => s + (m.result.calories || 0), 0);
  const eatenP = todays.reduce((s, m) => s + (m.result.protein || 0), 0);
  const eatenC = todays.reduce((s, m) => s + (m.result.carbohydrates || 0), 0);
  const eatenF = todays.reduce((s, m) => s + (m.result.fat || 0), 0);
  const projected = eaten + (saved ? 0 : cals);
  const mealSharePct = Math.min(100, Math.round((cals / goal) * 100));
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

  const advice =
    quality.reasons.length > 0
      ? quality.reasons.slice(0, 2).join(' · ')
      : t('analysis.adviceGood');

  const persist = async () => {
    if (saved) return;
    await saveMeal(result, imageUri, imageBase64, undefined, mealType);
    setSaved(true);
  };

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

  const onSave = async () => {
    if (saving || saved) return;
    setSaving(true);
    try {
      await persist();
    } finally {
      setSaving(false);
    }
  };
  const onAddToJournal = async () => {
    await persist();
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
            <Pressable style={styles.navBtn} onPress={() => setAssistantOpen(true)} hitSlop={8}>
              <Svg width={17} height={17} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Circle cx={18} cy={5} r={3} />
                <Circle cx={6} cy={12} r={3} />
                <Circle cx={18} cy={19} r={3} />
                <Path d="M8.6 13.5 15.4 17.5M15.4 6.5 8.6 10.5" />
              </Svg>
            </Pressable>
          </View>

          <View style={styles.photo}>
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
            <View style={styles.scanBadge}>
              <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#16a860" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                <Circle cx={12} cy={12} r={9} />
                <Path d="m8.4 12 2.3 2.3 4.6-4.8" />
              </Svg>
              <Text style={styles.scanBadgeText}>{t('analysis.scanSuccess')}</Text>
            </View>
            {/* A–E score strip — the letter changes with the meal's quality */}
            <View style={styles.scoreBar}>
              <NutriScoreBar grade={grade} label={t('analysis.nutriScore')} />
            </View>
          </View>
        </LinearGradient>

        <View style={styles.body}>
          {/* ── Calories + score (row 1) then macros (row 2) ── */}
          <View style={styles.card}>
            <View style={styles.calTop}>
              <View style={styles.calLeft}>
                <View style={styles.calIcon}>
                  <Svg width={21} height={21} viewBox="0 0 24 24" fill={ORANGE}>
                    <Path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
                  </Svg>
                </View>
                <View>
                  <Text style={styles.calLabel}>{t('result.calories')}</Text>
                  <View style={styles.calValueRow}>
                    <Text style={styles.calValue}>{cals}</Text>
                    <Text style={styles.calUnit}>kcal</Text>
                  </View>
                  <Text style={styles.calSub}>{t('analysis.estimation')}</Text>
                </View>
              </View>

              <View style={styles.scoreCol}>
                <Text style={styles.scoreLabel}>{t('analysis.healthScore')}</Text>
                <Ring size={54} pct={quality.score} color={quality.color} track="#eef0ec">
                  <Text style={styles.scoreValue}>{quality.score}</Text>
                  <Text style={styles.scoreDenom}>/100</Text>
                </Ring>
                <Text style={[styles.scoreTag, { color: quality.color }]} numberOfLines={1}>
                  {quality.label}
                </Text>
              </View>
            </View>

            <View style={styles.macroRow}>
              <MacroMini label={t('result.protein')} value={P} pct={pPct} color={GREEN} />
              <MacroMini label={t('result.carbs')} value={C} pct={cPct} color={ORANGE} />
              <MacroMini label={t('result.fat')} value={F} pct={fPct} color={PURPLE} />
            </View>
          </View>

          {/* ── Detected foods (editable) ── */}
          <View style={styles.card}>
            <View style={styles.foodsHead}>
              <Text style={styles.cardTitle}>{t('analysis.detectedFoods')}</Text>
              <Pressable style={styles.editBtn} onPress={openEditFoods} hitSlop={6}>
                <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#158a52" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
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
                    <Text style={styles.foodConf}>
                      {t('result.confidence')} {Math.round((it.detection_confidence ?? 0) * 100)}%
                    </Text>
                  </View>
                </View>
              ))}
              {items.length === 0 ? (
                <Text style={styles.foodPortion}>{result.food_name}</Text>
              ) : null}
            </View>
            {/* Add a food the AI didn't see in the photo */}
            <Pressable style={styles.addFoodBtn} onPress={openAddFood}>
              <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#158a52" strokeWidth={2.4} strokeLinecap="round">
                <Path d="M12 5v14M5 12h14" />
              </Svg>
              <Text style={styles.addFoodText}>{t('analysis.addFood')}</Text>
            </Pressable>
          </View>

          {/* ── Nutritional split (donut) ── */}
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{t('analysis.distribution')}</Text>
            <View style={styles.donutRow}>
              <MacroDonut p={pPct} c={cPct} f={fPct} />
              <View style={{ flex: 1, minWidth: 0, gap: 9 }}>
                <LegendRow color={GREEN} label={t('result.protein')} value={P} pct={pPct} />
                <LegendRow color={ORANGE} label={t('result.carbs')} value={C} pct={cPct} />
                <LegendRow color={PURPLE} label={t('result.fat')} value={F} pct={fPct} />
              </View>
            </View>
          </View>

          {/* ── Personalised advice (opens the AI meal coach) ── */}
          <Pressable style={styles.advice} onPress={() => setAssistantOpen(true)}>
            <View style={styles.adviceIcon}>
              <Svg width={21} height={21} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
                <Path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
                <Path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
              </Svg>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.adviceTitle}>{t('analysis.advice')}</Text>
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
                <MicroBar label={t('analysis.vitaminA')} pct={micros.a} />
                <MicroBar label={t('analysis.vitaminC')} pct={micros.c} />
                <MicroBar label={t('analysis.iron')} pct={micros.fe} />
                <MicroBar label={t('analysis.calcium')} pct={micros.ca} />
                <MicroBar label={t('analysis.potassium')} pct={micros.k} />
              </View>
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
              <View style={styles.waterStat}>
                <Text style={styles.waterStatVal}>{waterGoalL} L</Text>
                <Text style={styles.waterStatUnit}>· {t('analysis.glasses', { n: waterGlasses })}</Text>
              </View>
              <Text style={styles.waterHint}>{t('analysis.drinkReminder')}</Text>
            </View>
          </View>
        </View>
      </ScrollView>

      {/* ── Sticky action bar ── */}
      <View style={[styles.footer, { paddingBottom: 12 + insets.bottom }]}>
        <FooterBtn
          flex={1}
          label={saved ? t('analysis.saved') : t('analysis.save')}
          active={saved}
          onPress={onSave}
          icon={
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke={saved ? GREEN : '#3a463f'} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              {saved ? <Path d="M20 6 9 17l-5-5" /> : <Path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z" />}
            </Svg>
          }
        />
        <FooterBtn
          flex={1.25}
          label={t('analysis.addToJournal')}
          onPress={onAddToJournal}
          icon={
            <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#3a463f" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round">
              <Path d="M5 12h14M12 5v14" />
            </Svg>
          }
        />
        <FooterBtn
          flex={1.55}
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
    </View>
  );
}

/* ─────────────────────────── Small building blocks ─────────────────────── */

function MacroMini({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <View style={styles.macroCol}>
      <View style={styles.macroTop}>
        <View style={[styles.macroDot, { backgroundColor: color }]} />
        <Text style={styles.macroLabel} numberOfLines={1}>{label}</Text>
      </View>
      <View style={styles.macroValRow}>
        <Text style={styles.macroVal}>{value}</Text>
        <Text style={styles.macroG}>g</Text>
      </View>
      <Text style={[styles.macroPct, { color }]}>{pct}%</Text>
    </View>
  );
}

function LegendRow({ color, label, value, pct }: { color: string; label: string; value: number; pct: number }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendVal}>
        {value} g <Text style={styles.legendPct}>({pct}%)</Text>
      </Text>
    </View>
  );
}

function MicroBar({ label, pct }: { label: string; pct: number }) {
  return (
    <View style={styles.microRow}>
      <Text style={styles.microLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.microTrack}>
        <View style={[styles.microFill, { width: `${pct}%` }]} />
      </View>
      <Text style={styles.microPct}>{pct}%</Text>
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

function FooterBtn({ flex, label, icon, onPress, active }: { flex: number; label: string; icon: React.ReactNode; onPress: () => void; active?: boolean }) {
  return (
    <Pressable style={[styles.footBtn, { flex }, active && styles.footBtnActive]} onPress={onPress}>
      {icon}
      <Text style={[styles.footLabel, active && { color: GREEN }]} numberOfLines={1}>{label}</Text>
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
  scanBadgeText: { color: '#16a860', fontSize: 12.5, fontFamily: F700 },
  scoreBar: { position: 'absolute', left: 10, right: 10, bottom: 10 },

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
  calLeft: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  calIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#fff2e2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calLabel: { fontSize: 11, color: '#7c877f', fontFamily: F600 },
  calValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3 },
  calValue: { fontSize: 26, fontFamily: F800, color: INK, letterSpacing: -0.5 },
  calUnit: { fontSize: 12, color: MUTED, fontFamily: F600 },
  calSub: { fontSize: 10, color: '#aab2ab', fontFamily: F500, marginTop: 1 },

  macroCol: { alignItems: 'flex-start', gap: 2 },
  macroTop: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  macroDot: { width: 7, height: 7, borderRadius: 2 },
  macroLabel: { fontSize: 10, color: '#7c877f', fontFamily: F600 },
  macroValRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  macroVal: { fontSize: 17, fontFamily: F800, color: INK },
  macroG: { fontSize: 10, color: MUTED, fontFamily: F600 },
  macroPct: { fontSize: 11, fontFamily: F700 },

  scoreCol: { alignItems: 'center', gap: 3 },
  scoreLabel: { fontSize: 10, color: '#7c877f', fontFamily: F600 },
  ringCenter: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scoreValue: { fontSize: 16, fontFamily: F800, color: INK, lineHeight: 18 },
  scoreDenom: { fontSize: 7, color: MUTED, fontFamily: F600 },
  scoreTag: { fontSize: 9.5, fontFamily: F700 },

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
  editBtnText: { fontSize: 11, fontFamily: F700, color: '#158a52' },
  foodRow: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  foodEmoji: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  foodName: { fontSize: 11.5, fontFamily: F700, color: INK },
  foodPortion: { fontSize: 10.5, color: MUTED, fontFamily: F500 },
  foodKcal: { fontSize: 12, fontFamily: F800, color: GREEN },
  foodConf: { fontSize: 9.5, color: '#aab2ab', fontFamily: F500 },
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
  addFoodText: { fontSize: 12, fontFamily: F700, color: '#158a52' },

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
  adviceIcon: {
    width: 40,
    height: 40,
    borderRadius: 13,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
  adviceTitle: { fontSize: 13, fontFamily: F800, color: '#158a52', marginBottom: 2 },
  adviceBody: { fontSize: 11.5, lineHeight: 16.5, color: '#5a7a67', fontFamily: F500 },

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
  miniGood: { fontSize: 11, fontFamily: F700, color: GREEN },
  miniFoot: { fontSize: 9.5, color: '#aab2ab', fontFamily: F500, marginTop: 'auto', paddingTop: 3 },

  microRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  microLabel: { fontSize: 10, color: '#6b746e', fontFamily: F600, width: 62 },
  microTrack: { flex: 1, height: 6, backgroundColor: '#eef0ec', borderRadius: 3, overflow: 'hidden' },
  microFill: { height: '100%', backgroundColor: GREEN, borderRadius: 3 },
  microPct: { fontSize: 10, color: '#4a544d', fontFamily: F700, width: 30, textAlign: 'right' },

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
  footBtnActive: { borderColor: GREEN, backgroundColor: '#f6fbf7' },
  footLabel: { fontSize: 10.5, fontFamily: F700, color: '#3a463f' },
});
