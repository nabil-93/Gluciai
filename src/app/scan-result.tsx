import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  Animated,
  LayoutChangeEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import {
  AnimatedCounter,
  AppButton,
  BevelCard,
  BoundingBoxOverlay,
  CloseGlyph,
  DidYouMeanSheet,
  FadeInView,
  ScanStepper,
} from '@/components/ui';
import { MealAssistant, MealRobotButton } from '@/components/MealAssistant';
import { computeBolus, saveMeal } from '@/services/data';
import {
  aggregateItems,
  reidentifyItem,
  rescaleItem,
  resolveFood,
  sourceLabel,
} from '@/services/nutrition/engine';
import {
  getSuggestedCorrection,
  recordCorrection,
  recordIdentityCorrection,
} from '@/services/nutrition/learning';
import { scoreMeal } from '@/services/nutrition/mealScore';
import { clearPendingScan, getPendingScan } from '@/services/scanSession';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';
import type {
  FoodItemResult,
  MealHighlight,
  MealType,
  NutritionSource,
} from '@/types';

/** Suggest the meal of the day from the current hour. */
function defaultMealType(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 22) return 'dinner';
  return 'snack';
}

const MEAL_TYPES: { key: MealType; icon: string }[] = [
  { key: 'breakfast', icon: '🌅' },
  { key: 'lunch', icon: '☀️' },
  { key: 'dinner', icon: '🌙' },
  { key: 'snack', icon: '🍎' },
];

const SOURCE_COLOR: Record<NutritionSource, string> = {
  moroccan_db: colors.primary,
  usda: colors.ai,
  openfoodfacts: colors.carbs,
  fatsecret: colors.ai,
  edamam: colors.carbs,
  ai_estimate: colors.textSecondary,
};

/** Below this detection confidence we ask the user to confirm the food. */
const LOW_CONFIDENCE = 0.7;

/** Wizard steps, in order. `saved` is the final green confirmation. */
type ScanStep = 'detected' | 'results' | 'portions' | 'verify' | 'saved';
const STEP_ORDER: ScanStep[] = [
  'detected',
  'results',
  'portions',
  'verify',
  'saved',
];
/** Steps shown in the numbered progress bar (saved is a full-screen state). */
const PROGRESS_STEPS: ScanStep[] = ['detected', 'results', 'portions', 'verify'];

/** Highlights shown in green (good) vs amber (attention). */
const POSITIVE_HIGHLIGHTS = new Set<MealHighlight>([
  'high_protein',
  'high_fiber',
  'balanced_meal',
  'low_glycemic_load',
  'low_sugar',
  'vegetable_rich',
]);

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function ScanResultScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const profile = useAppStore((s) => s.profile);
  const glucoseLogs = useAppStore((s) => s.glucoseLogs);
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Meal-assistant chat sheet (opened from the robot next to "Aliments détectés").
  const [assistantOpen, setAssistantOpen] = useState(false);
  // Which meal of the day — defaulted from the current time, user can change.
  const [mealType, setMealType] = useState<MealType>(() => defaultMealType());
  // Stable snapshot of the scan for this screen's lifetime
  const [pending] = useState(() => getPendingScan());
  // Editable copy of items — the user can correct portions (Learning AI)
  const [items, setItems] = useState<FoodItemResult[]>(
    () => pending?.result.items ?? []
  );

  // ── Wizard: the result is presented as a sequence of steps (like Cal AI /
  //    Foodvisor) so the user reviews detection → nutrition → portions →
  //    confirmation one screen at a time, ending on a saved-confirmation.
  const [step, setStep] = useState<ScanStep>('detected');
  // Which food card has its "re-identify" text editor open, + its draft.
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editDraft, setEditDraft] = useState('');
  // Previous-correction suggestions the user hasn't answered yet (per index).
  const [dismissedSuggestions, setDismissedSuggestions] = useState<
    Record<number, boolean>
  >({});

  // ── Manually add a food the AI missed ──
  const [addingFood, setAddingFood] = useState(false);
  const [newFoodName, setNewFoodName] = useState('');
  const [newFoodGrams, setNewFoodGrams] = useState('100');
  const [addFoodBusy, setAddFoodBusy] = useState(false);
  const [addFoodError, setAddFoodError] = useState<string | null>(null);

  // ── Bounding-box overlay + card highlight/scroll interaction ──
  const scrollRef = useRef<ScrollView>(null);
  const cardsTop = useRef(0); // Y of the food-cards container in the scroll view
  const cardY = useRef<Record<number, number>>({}); // each card's Y within it
  const [highlightIndex, setHighlightIndex] = useState<number | null>(null);
  const highlightFade = useRef(new Animated.Value(0)).current;
  // Reference frame for the bounding boxes: the size of the image the
  // vision model actually analyzed (set by the scanner after resize).
  // Falls back to the displayed image's intrinsic size for older scans.
  const [imgNatural, setImgNatural] = useState<{ width: number; height: number } | null>(
    () => pending?.imageSize ?? null
  );
  const [heroLayout, setHeroLayout] = useState<{ width: number; height: number } | null>(null);

  // ── Low-confidence "Did you mean?" queue ──
  const [sheetIndex, setSheetIndex] = useState<number | null>(null);
  // Foods whose confirmation we've already handled (so we ask once).
  const [confirmed, setConfirmed] = useState<Record<number, boolean>>({});
  const autoSheetShown = useRef(false); // one-shot guard for auto-open

  // Tap a bounding box → highlight its card and scroll it into view.
  const focusCard = useCallback(
    (index: number) => {
      setHighlightIndex(index);
      const y = cardY.current[index];
      if (y != null) {
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 80), animated: true });
      }
      highlightFade.setValue(1);
      Animated.timing(highlightFade, {
        toValue: 0,
        duration: 1400,
        useNativeDriver: false,
      }).start(() => setHighlightIndex((cur) => (cur === index ? null : cur)));
    },
    [highlightFade]
  );

  // Auto-open the "Did you mean?" sheet for the first unconfirmed
  // low-confidence food, once, after the results are shown.
  const firstLowConfidence = useMemo(() => {
    const list = pending?.result.items ?? [];
    return list.findIndex(
      (it, i) => it.detection_confidence < LOW_CONFIDENCE && !confirmed[i]
    );
    // Recompute when confirmations change.
  }, [pending, confirmed]);

  if (!pending) return <Redirect href="/(tabs)" />;

  const { imageUri, base64: imageBase64 } = pending;
  const originalItems = pending.result.items ?? [];
  // Recompute totals live from the (possibly edited) items
  const result = items.length > 0 ? aggregateItems(items) : pending.result;

  const lastGlucose = glucoseLogs.find((g) => isToday(g.created_at));
  const bolus = computeBolus(
    result.carbohydrates,
    lastGlucose?.value ?? null,
    profile
  );
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

  const gi = Math.round(result.glycemic_index);
  const giColor =
    gi > 70 ? colors.glucoseLow : gi > 55 ? colors.glucoseHigh : colors.glucoseInRange;
  const giLabel =
    gi > 70 ? t('result.high') : gi > 55 ? t('result.medium') : t('result.low');

  // Glycemic-load badge color (Low → in-range green, High → low-red).
  const glColor =
    result.glycemic_load === 'High'
      ? colors.glucoseLow
      : result.glycemic_load === 'Medium'
        ? colors.glucoseHigh
        : colors.glucoseInRange;
  const glLabel =
    result.glycemic_load === 'High'
      ? t('result.high')
      : result.glycemic_load === 'Medium'
        ? t('result.medium')
        : t('result.low');

  const adjustPortion = (index: number, delta: number) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? rescaleItem(it, Math.max(10, it.portion_grams + delta))
          : it
      )
    );
  };

  /** Open / close the inline "re-identify this food" text editor. */
  const startEditing = (index: number) => {
    setEditDraft(items[index]?.search_name ?? items[index]?.name ?? '');
    setEditingIndex(index);
  };

  /** Apply a re-identification: re-resolve through the provider chain. */
  const applyReidentify = async (index: number, correctedName: string) => {
    const name = correctedName.trim();
    setEditingIndex(null);
    if (!name) return;
    const current = items[index];
    const next = await reidentifyItem(current, name);
    setItems((prev) => prev.map((it, i) => (i === index ? next : it)));
    // Remember the identity correction so future scans reuse it.
    recordIdentityCorrection(current.name, name);
  };

  /** Accept a remembered correction the user was prompted about. */
  const applySuggestion = async (index: number) => {
    const current = items[index];
    const s = getSuggestedCorrection(current.name);
    setDismissedSuggestions((d) => ({ ...d, [index]: true }));
    if (!s) return;
    let next = current;
    if (s.searchName) next = await reidentifyItem(current, s.searchName);
    if (s.portionGrams) next = rescaleItem(next, s.portionGrams);
    setItems((prev) => prev.map((it, i) => (i === index ? next : it)));
  };

  /** Resolve the low-confidence sheet: apply the user's chosen food. */
  const confirmDidYouMean = async (index: number, choice: string) => {
    const current = items[index];
    setSheetIndex(null);
    setConfirmed((c) => ({ ...c, [index]: true }));
    // "Keep original" → choice equals the current name/search: nothing to do.
    const keepOriginal =
      choice === current.name || choice === current.search_name;
    if (keepOriginal) return;
    const next = await reidentifyItem(current, choice); // engine only, no AI
    setItems((prev) => prev.map((it, i) => (i === index ? next : it)));
    recordIdentityCorrection(current.name, choice);
  };

  /**
   * Manually add a food the vision model missed (e.g. hidden under sauce).
   * Goes straight through the SAME provider chain as every other food —
   * no AI call, never invents nutrition when nothing matches.
   */
  const submitNewFood = async () => {
    const name = newFoodName.trim();
    const grams = Math.max(5, parseInt(newFoodGrams, 10) || 100);
    if (!name) return;
    setAddFoodBusy(true);
    setAddFoodError(null);
    try {
      const resolved = await resolveFood({
        name,
        search_name: name,
        portion_grams: grams,
        confidence: 1, // user-entered — fully trusted detection
        is_main_food: false,
        is_estimated: false,
      });
      if (!resolved) {
        setAddFoodError(t('result.addFoodNotFound'));
        return;
      }
      setItems((prev) => [...prev, resolved]);
      setNewFoodName('');
      setNewFoodGrams('100');
      setAddingFood(false);
    } finally {
      setAddFoodBusy(false);
    }
  };

  // Open the "Did you mean?" sheet for the first low-confidence food ONCE,
  // and only once the user reaches the portions step (step 6 in the flow) —
  // not on the detection screen. A ref one-shot prevents re-opening after
  // the user answers and avoids a render loop.
  if (
    step === 'portions' &&
    !autoSheetShown.current &&
    sheetIndex === null &&
    firstLowConfidence >= 0 &&
    !confirmed[firstLowConfidence]
  ) {
    autoSheetShown.current = true;
    // Defer to avoid setState-during-render.
    queueMicrotask(() => setSheetIndex(firstLowConfidence));
  }

  /** Learning AI: store the user's portion corrections separately. */
  const saveCorrections = () => {
    items.forEach((it, i) => {
      const original = originalItems[i];
      if (original && Math.abs(original.portion_grams - it.portion_grams) >= 5) {
        recordCorrection(
          it.name,
          'portion',
          original.portion_grams,
          it.portion_grams
        );
      }
    });
  };

  // ── Wizard navigation ──
  const stepIndex = STEP_ORDER.indexOf(step);
  const goNext = () => {
    const next = STEP_ORDER[Math.min(STEP_ORDER.length - 1, stepIndex + 1)];
    setStep(next);
  };
  const goBack = () => {
    if (stepIndex > 0) setStep(STEP_ORDER[stepIndex - 1]);
    else discard();
  };

  /** Confirm the meal (step "verify" → save → green "saved" step). */
  const confirmAndSave = async () => {
    setSaving(true);
    try {
      saveCorrections();
      await saveMeal(result, imageUri, imageBase64, undefined, mealType);
      setSaved(true);
      setStep('saved');
    } finally {
      setSaving(false);
    }
  };

  const goBolus = async () => {
    // Save the meal first so the calculator can prefill its carbs
    if (!saved) {
      saveCorrections();
      await saveMeal(result, imageUri, imageBase64, undefined, mealType);
    }
    clearPendingScan();
    router.replace('/bolus');
  };

  const goJournal = () => {
    clearPendingScan();
    router.replace('/(tabs)');
  };

  const discard = () => {
    clearPendingScan();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  /* ─────────────── Reusable content blocks (close over state) ────────── */

  // Photo hero with detection boxes. `showMeta` adds the name + confidence
  // overlay (used on the detection step).
  const heroBlock = (showMeta: boolean, fit: 'cover' | 'contain' = 'cover') => (
    <View
      style={[styles.hero, fit === 'contain' && styles.heroContain]}
      onLayout={(e: LayoutChangeEvent) =>
        setHeroLayout({
          width: e.nativeEvent.layout.width,
          height: e.nativeEvent.layout.height,
        })
      }
    >
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={StyleSheet.absoluteFill}
          contentFit={fit}
          onLoad={(e) => {
            // Only a fallback: when the scanner provided the sent-image
            // size (the boxes' true frame), never override it with the
            // display image's intrinsic size.
            if (imgNatural) return;
            const src = (e as any)?.source;
            if (src?.width && src?.height) {
              setImgNatural({ width: src.width, height: src.height });
            }
          }}
        />
      ) : (
        <View style={[StyleSheet.absoluteFill, styles.heroFallback]}>
          <Text style={{ fontSize: 64 }}>🍽️</Text>
        </View>
      )}
      <BoundingBoxOverlay
        items={items}
        natural={imgNatural}
        layout={heroLayout}
        fit={fit}
        selectedIndex={highlightIndex}
        onSelect={focusCard}
      />
      <LinearGradient
        colors={['transparent', 'rgba(10,10,14,0.75)']}
        style={styles.heroGradient}
        pointerEvents="none"
      />
      {showMeta ? (
        <View style={styles.heroText}>
          <Text style={styles.foodName}>{result.food_name}</Text>
          <Text style={styles.portion}>{result.estimated_portion}</Text>
        </View>
      ) : null}
      <View style={[styles.confidence, { top: insets.top + 12 }]}>
        <Text style={styles.confidenceText}>
          👁️ {Math.round(result.confidence * 100)}%
          {result.nutrition_confidence
            ? `  ·  📊 ${Math.round(result.nutrition_confidence * 100)}%`
            : ''}
        </Text>
      </View>
      <Pressable
        onPress={discard}
        style={[styles.closeBtn, { top: insets.top + 12 }]}
      >
        <CloseGlyph size={16} color="#fff" />
      </Pressable>
    </View>
  );

  // Nutrition summary (calories + score + highlights + macros + GI).
  const nutritionBlock = (
    <>
      {/* ── Calories — the big number, counts up on open ── */}
          <FadeInView>
            <View style={styles.kcalCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kcalLabel}>{t('result.calories')}</Text>
                <View style={styles.kcalRow}>
                  <AnimatedCounter
                    value={result.calories}
                    style={styles.kcalValue}
                  />
                  <Text style={styles.kcalUnit}>kcal</Text>
                </View>
              </View>
              <View style={styles.kcalDivider} />
              <View style={{ flex: 1 }}>
                <Text style={styles.kcalLabel}>{t('result.carbs')}</Text>
                <View style={styles.kcalRow}>
                  <AnimatedCounter
                    value={result.carbohydrates}
                    style={[styles.kcalValue, { color: colors.carbs }]}
                  />
                  <Text style={styles.kcalUnit}>g</Text>
                </View>
              </View>
            </View>
          </FadeInView>

          {/* ── Meal Quality Score ── */}
          <FadeInView delay={120}>
          <View style={[styles.scoreCard, { borderColor: quality.color }]}>
            <View style={styles.scoreHead}>
              <View>
                <Text style={styles.scoreLabel}>{t('result.scoreLabel')}</Text>
                <Text style={[styles.scoreValue, { color: quality.color }]}>
                  {quality.score}
                  <Text style={styles.scoreMax}>/100</Text>
                </Text>
              </View>
              <View
                style={[styles.scoreBadge, { backgroundColor: quality.color }]}
              >
                <Text style={styles.scoreBadgeText}>{quality.label}</Text>
              </View>
            </View>
            {quality.reasons.slice(0, 3).map((r, i) => (
              <Text key={i} style={styles.scoreReason}>
                • {r}
              </Text>
            ))}
          </View>
          </FadeInView>

          {/* ── Highlights + glycemic load ── */}
          {(result.highlights?.length || result.glycemic_load) ? (
            <FadeInView delay={160}>
              <View style={styles.highlightsWrap}>
                {result.glycemic_load ? (
                  <View
                    style={[styles.glPill, { backgroundColor: `${glColor}1A` }]}
                  >
                    <View style={[styles.glDot, { backgroundColor: glColor }]} />
                    <Text style={[styles.glText, { color: glColor }]}>
                      {t('result.glycemicLoad')}: {glLabel}
                    </Text>
                  </View>
                ) : null}
                {(result.highlights ?? []).map((h: MealHighlight) => {
                  const positive = POSITIVE_HIGHLIGHTS.has(h);
                  const c = positive ? colors.primary : colors.glucoseHigh;
                  return (
                    <View
                      key={h}
                      style={[styles.hlChip, { backgroundColor: `${c}1A` }]}
                    >
                      <Text style={[styles.hlText, { color: c }]}>
                        {positive ? '✓ ' : '! '}
                        {t(`insights.highlights.${h}`)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </FadeInView>
          ) : null}
    </>
  );

  // Per-food breakdown: editable portions, re-identify, add missed food.
  const foodsBlock =
          items.length > 0 ? (
            <View
              onLayout={(e: LayoutChangeEvent) => {
                cardsTop.current = e.nativeEvent.layout.y;
              }}
            >
            <BevelCard noPadding style={{ marginTop: 12 }}>
              <View style={styles.detHeaderRow}>
                <Text style={[styles.itemsTitle, { paddingHorizontal: 0, paddingTop: 0 }]}>
                  {t('result.detectedFoods')} ({items.length})
                </Text>
                {/* AI robot — tap to open the meal-edit chat. */}
                <MealRobotButton onPress={() => setAssistantOpen(true)} />
              </View>
              <Text style={styles.itemsHint}>{t('result.editHint')}</Text>
              {items.map((it, i) => {
                const color = SOURCE_COLOR[it.source];
                const suggestion =
                  !dismissedSuggestions[i] && editingIndex !== i
                    ? getSuggestedCorrection(it.name)
                    : null;
                const isHi = highlightIndex === i;
                return (
                  <View
                    key={`${it.name}-${i}`}
                    onLayout={(e: LayoutChangeEvent) => {
                      // Absolute Y in the scroll view = card list top +
                      // this row's offset within the list.
                      cardY.current[i] = cardsTop.current + e.nativeEvent.layout.y;
                    }}
                    style={[
                      styles.itemBlock,
                      i < items.length - 1 && styles.itemBorder,
                      isHi && styles.itemHighlighted,
                    ]}
                  >
                    <View style={styles.itemRow}>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={styles.itemNameRow}>
                          <Text style={styles.itemName} numberOfLines={1}>
                            {it.name}
                          </Text>
                          {it.is_main_food ? (
                            <View style={styles.tagMain}>
                              <Text style={styles.tagMainText}>
                                {t('result.mainFood')}
                              </Text>
                            </View>
                          ) : null}
                          {it.is_estimated ? (
                            <View style={styles.tagEst}>
                              <Text style={styles.tagEstText}>
                                ≈ {t('result.estimated')}
                              </Text>
                            </View>
                          ) : null}
                        </View>
                        <Text style={styles.itemDetail}>
                          {it.calories} kcal · {Math.round(it.carbohydrates)} g ·{' '}
                          {Math.round(it.protein)} g P · {Math.round(it.fat)} g L
                        </Text>

                        {/* Category + detection confidence */}
                        <View style={styles.metaRow}>
                          {it.category ? (
                            <View style={styles.metaChip}>
                              <Text style={styles.metaChipText}>
                                {it.category}
                              </Text>
                            </View>
                          ) : null}
                          <View style={styles.metaChip}>
                            <Text style={styles.metaChipText}>
                              👁️ {Math.round(it.detection_confidence * 100)}%
                            </Text>
                          </View>
                        </View>

                        {/* Provenance: matched DB · match score · food id */}
                        <View
                          style={[
                            styles.sourceBadge,
                            { backgroundColor: `${color}1A` },
                          ]}
                        >
                          <View
                            style={[styles.sourceDot, { backgroundColor: color }]}
                          />
                          <Text style={[styles.sourceText, { color }]}>
                            {t('result.matchedIn')}{' '}
                            {sourceLabel(it.matched_database ?? it.source)}
                            {it.match_score != null
                              ? ` · ${t('result.matchScore')} ${it.match_score}%`
                              : ''}
                          </Text>
                        </View>
                        {it.food_id ? (
                          <Text style={styles.foodId}>
                            {t('result.foodId')}: {it.food_id}
                          </Text>
                        ) : null}

                        <Pressable
                          onPress={() => startEditing(i)}
                          hitSlop={6}
                          style={styles.editLink}
                        >
                          <Text style={styles.editLinkText}>
                            ✎ {t('result.editFood')}
                          </Text>
                        </Pressable>
                      </View>

                      {/* Portion editor — live recalculation */}
                      <View style={styles.portionEditor}>
                        <Pressable
                          onPress={() => adjustPortion(i, -10)}
                          style={styles.portionBtn}
                          hitSlop={6}
                        >
                          <Text style={styles.portionBtnText}>−</Text>
                        </Pressable>
                        <View style={styles.portionValueWrap}>
                          <Text style={styles.portionValue}>
                            {Math.round(it.portion_grams)}
                          </Text>
                          <Text style={styles.portionUnit}>g</Text>
                        </View>
                        <Pressable
                          onPress={() => adjustPortion(i, 10)}
                          style={styles.portionBtn}
                          hitSlop={6}
                        >
                          <Text style={styles.portionBtnText}>+</Text>
                        </Pressable>
                      </View>
                    </View>

                    {/* Inline re-identify editor */}
                    {editingIndex === i ? (
                      <View style={styles.reidentifyRow}>
                        <TextInput
                          value={editDraft}
                          onChangeText={setEditDraft}
                          placeholder={t('result.searchPlaceholder')}
                          placeholderTextColor={colors.textTertiary}
                          style={styles.reidentifyInput}
                          autoFocus
                          returnKeyType="done"
                          onSubmitEditing={() => applyReidentify(i, editDraft)}
                        />
                        <Pressable
                          onPress={() => applyReidentify(i, editDraft)}
                          style={styles.applyBtn}
                        >
                          <Text style={styles.applyBtnText}>
                            {t('result.apply')}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setEditingIndex(null)}
                          style={styles.cancelBtn}
                        >
                          <Text style={styles.cancelBtnText}>
                            {t('result.cancel')}
                          </Text>
                        </Pressable>
                      </View>
                    ) : null}

                    {/* "Use your previous correction?" prompt */}
                    {suggestion ? (
                      <View style={styles.suggestBox}>
                        <Text style={styles.suggestTitle}>
                          {t('result.prevCorrectionTitle')}
                        </Text>
                        <Text style={styles.suggestBody}>
                          {t('result.prevCorrectionBody', {
                            food: it.name,
                            value:
                              suggestion.searchName ??
                              `${suggestion.portionGrams} g`,
                            count: suggestion.timesCorrected,
                          })}
                        </Text>
                        <View style={styles.suggestActions}>
                          <Pressable
                            onPress={() => applySuggestion(i)}
                            style={styles.suggestUse}
                          >
                            <Text style={styles.suggestUseText}>
                              {t('result.usePrev')}
                            </Text>
                          </Pressable>
                          <Pressable
                            onPress={() =>
                              setDismissedSuggestions((d) => ({
                                ...d,
                                [i]: true,
                              }))
                            }
                            style={styles.suggestIgnore}
                          >
                            <Text style={styles.suggestIgnoreText}>
                              {t('result.ignore')}
                            </Text>
                          </Pressable>
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}

              {/* Manually add a food the AI missed */}
              <View style={styles.addFoodBlock}>
                {addingFood ? (
                  <View style={styles.addFoodForm}>
                    <Text style={styles.addFoodTitle}>
                      {t('result.addFoodTitle')}
                    </Text>
                    <Text style={styles.addFoodHint}>
                      {t('result.addFoodHint')}
                    </Text>
                    <View style={styles.addFoodRow}>
                      <TextInput
                        value={newFoodName}
                        onChangeText={setNewFoodName}
                        placeholder={t('result.addFoodNamePlaceholder')}
                        placeholderTextColor={colors.textTertiary}
                        style={[styles.reidentifyInput, { flex: 1 }]}
                        autoFocus
                      />
                      <TextInput
                        value={newFoodGrams}
                        onChangeText={setNewFoodGrams}
                        placeholder={t('result.addFoodGrams')}
                        placeholderTextColor={colors.textTertiary}
                        keyboardType="number-pad"
                        style={[styles.reidentifyInput, { width: 72 }]}
                      />
                    </View>
                    {addFoodError ? (
                      <Text style={styles.addFoodError}>{addFoodError}</Text>
                    ) : null}
                    <View style={styles.addFoodActions}>
                      <Pressable
                        onPress={submitNewFood}
                        disabled={addFoodBusy || !newFoodName.trim()}
                        style={[
                          styles.applyBtn,
                          (addFoodBusy || !newFoodName.trim()) && {
                            opacity: 0.5,
                          },
                        ]}
                      >
                        <Text style={styles.applyBtnText}>
                          {addFoodBusy
                            ? t('result.addFoodAdding')
                            : t('result.apply')}
                        </Text>
                      </Pressable>
                      <Pressable
                        onPress={() => {
                          setAddingFood(false);
                          setAddFoodError(null);
                        }}
                        style={styles.cancelBtn}
                      >
                        <Text style={styles.cancelBtnText}>
                          {t('result.cancel')}
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : (
                  <Pressable
                    onPress={() => setAddingFood(true)}
                    style={styles.addFoodTrigger}
                  >
                    <Text style={styles.addFoodTriggerText}>
                      + {t('result.addFood')}
                    </Text>
                  </Pressable>
                )}
              </View>
            </BevelCard>
            </View>
          ) : null;

  // Macro grid + nutrition source + glycemic-index card.
  const macrosBlock = (
    <>
          {/* ── Macro grid ── */}
          <View style={styles.grid}>
            <Metric label={t('nutritionPage.sugar')} value={Math.round(result.sugar)} unit="g" color={colors.protein} />
            <Metric label={t('nutritionPage.protein')} value={Math.round(result.protein)} unit="g" color={colors.ai} />
            <Metric label={t('nutritionPage.fat')} value={Math.round(result.fat)} unit="g" color={colors.lipids} />
            <Metric label={t('barcodePage.fiber')} value={Math.round(result.fiber)} unit="g" color={colors.primary} />
            {result.sodium ? (
              <Metric label={t('nutritionPage.sodium')} value={result.sodium} unit="mg" color={colors.textSecondary} />
            ) : null}
          </View>

          {/* ── Nutrition source of totals ── */}
          {result.source ? (
            <View style={styles.totalsSource}>
              <Text style={styles.totalsSourceText}>
                {t('scanResultPage.nutritionSource')} {sourceLabel(result.source)}
              </Text>
            </View>
          ) : null}

          {/* ── Glycemic index (when available) ── */}
          {gi > 0 ? (
          <BevelCard style={{ marginTop: 12 }}>
            <View style={styles.giHead}>
              <Text style={styles.giTitle}>{t('scanResultPage.giTitle')}</Text>
              <View style={[styles.giBadge, { backgroundColor: `${giColor}22` }]}>
                <Text style={[styles.giBadgeText, { color: giColor }]}>
                  {giLabel}
                </Text>
              </View>
            </View>
            <View style={styles.giTrack}>
              <View
                style={[
                  styles.giFill,
                  { width: `${Math.min(100, gi)}%`, backgroundColor: giColor },
                ]}
              />
            </View>
            <View style={styles.giScale}>
              <Text style={styles.giScaleText}>0</Text>
              <Text style={styles.giScaleText}>55</Text>
              <Text style={styles.giScaleText}>70</Text>
              <Text style={styles.giScaleText}>100</Text>
            </View>
            {gi > 55 ? (
              <Text style={styles.giHint}>{t('scanResultPage.giHint')}</Text>
            ) : null}
          </BevelCard>
          ) : null}
    </>
  );

  /* Engine/AI warnings are stored as translation keys ("warn:high_gi",
   * "warn:sugar_high|30", …) so they localize to the patient's language.
   * Older meals stored a raw French sentence — show those verbatim. */
  const localizeWarning = (w: string): string => {
    if (!w.startsWith('warn:')) return w;
    const [key, ...rest] = w.slice(5).split('|');
    return t(`result.warn.${key}`, { value: rest.join('|') });
  };

  // Insulin estimate + warnings (shown on the verify step).
  const verifyExtras = (
    <>
          {/* ── Insulin estimation ── */}
          <View style={styles.bolusCard}>
            <Text style={styles.bolusLabel}>{t('scanResultPage.bolusLabel')}</Text>
            <View style={styles.bolusRow}>
              <Text style={styles.bolusValue}>
                ≈ {bolus.total.toLocaleString(i18n.language)}
              </Text>
              <Text style={styles.bolusUnit}>U</Text>
            </View>
            <Text style={styles.bolusDetail}>
              {Math.round(result.carbohydrates)} g ÷ ratio {bolus.ratio}
              {bolus.correction > 0
                ? t('scanResultPage.bolusCorrection', {
                    correction: bolus.correction,
                    glucose: lastGlucose?.value,
                  })
                : ''}
            </Text>
            <Text style={styles.disclaimer}>{t('scanResultPage.bolusDisclaimer')}</Text>
          </View>

          {/* ── Warnings ── */}
          {result.warnings.length > 0 ? (
            <View style={styles.warnCard}>
              {result.warnings.map((w, i) => (
                <Text key={i} style={styles.warnText}>
                  ⚠️ {localizeWarning(w)}
                </Text>
              ))}
            </View>
          ) : null}
    </>
  );

  /* ───────────────── Step 8: green "meal saved" screen ───────────────── */
  if (step === 'saved') {
    const now = new Date();
    const time = now.toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
    });
    return (
      <View style={styles.savedRoot}>
        <View style={[styles.savedHead, { paddingTop: insets.top + 40 }]}>
          <View style={styles.savedCheck}>
            <Text style={styles.savedCheckMark}>✓</Text>
          </View>
          <Text style={styles.savedTitle}>{t('result.savedTitle')}</Text>
          <Text style={styles.savedAt}>{t('result.savedAt', { time })}</Text>
        </View>

        <ScrollView
          contentContainerStyle={styles.savedBody}
          showsVerticalScrollIndicator={false}
        >
          {/* Recap card */}
          <BevelCard style={{ marginTop: 18 }}>
            <View style={styles.savedRecapRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kcalLabel}>{t('result.calories')}</Text>
                <View style={styles.kcalRow}>
                  <Text style={styles.kcalValue}>{result.calories}</Text>
                  <Text style={styles.kcalUnit}>kcal</Text>
                </View>
              </View>
              {imageUri ? (
                <Image
                  source={{ uri: imageUri }}
                  style={styles.savedThumb}
                  contentFit="cover"
                />
              ) : null}
            </View>
          </BevelCard>

          {/* Score bar */}
          <View style={[styles.scoreCard, { borderColor: quality.color, marginTop: 12 }]}>
            <View style={styles.scoreHead}>
              <View>
                <Text style={styles.scoreLabel}>{t('result.scoreLabel')}</Text>
                <Text style={[styles.scoreValue, { color: quality.color }]}>
                  {quality.score}
                  <Text style={styles.scoreMax}>/100</Text>
                </Text>
              </View>
              <View style={[styles.scoreBadge, { backgroundColor: quality.color }]}>
                <Text style={styles.scoreBadgeText}>{quality.label}</Text>
              </View>
            </View>
          </View>

          <View style={{ gap: 10, marginTop: 18 }}>
            <AppButton label={t('result.viewJournal')} onPress={goJournal} />
            <AppButton
              label={t('result.calcBolus')}
              onPress={goBolus}
              variant="secondary"
            />
          </View>
        </ScrollView>
      </View>
    );
  }

  /* ───────────── Steps 3–7: wizard shell (header + body + footer) ─────── */
  const progressIndex = PROGRESS_STEPS.indexOf(step);
  const stepTitle = {
    detected: t('result.stepDetectedTitle'),
    results: t('result.stepResultsTitle'),
    portions: t('result.stepPortionsTitle'),
    verify: t('result.stepVerifyTitle'),
    saved: '',
  }[step];
  const stepSub = {
    detected: t('result.stepDetectedSub', {
      count: items.length,
      confidence: Math.round(result.confidence * 100),
    }),
    results: t('result.stepResultsSub'),
    portions: t('result.stepPortionsSub'),
    verify: t('result.stepVerifySub'),
    saved: '',
  }[step];

  return (
    <View style={styles.root}>
      {/* Progress header */}
      <View style={[styles.wizardHeader, { paddingTop: insets.top + 10 }]}>
        <View style={styles.wizardHeaderTop}>
          <Pressable onPress={goBack} hitSlop={10} style={styles.wizardBack}>
            <CloseGlyph size={16} color={colors.text} />
          </Pressable>
          <Text style={styles.wizardStepOf}>
            {t('result.stepOf', {
              current: progressIndex + 1,
              total: PROGRESS_STEPS.length,
            })}
          </Text>
          <View style={{ width: 32 }} />
        </View>
        <ScanStepper current={progressIndex} total={PROGRESS_STEPS.length} />
        <Text style={styles.wizardTitle}>{stepTitle}</Text>
        <Text style={styles.wizardSub}>{stepSub}</Text>
      </View>

      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* Step 3 — detection boxes on the photo */}
        {step === 'detected' ? (
          <>
            {heroBlock(true, 'contain')}
            <View style={styles.body}>
              <Text style={styles.tapHint}>{t('result.tapBoxHint')}</Text>
              {foodsBlock}
            </View>
          </>
        ) : null}

        {/* Step 4 — nutrition results */}
        {step === 'results' ? (
          <View style={[styles.body, { paddingTop: 16 }]}>
            {nutritionBlock}
            {macrosBlock}
          </View>
        ) : null}

        {/* Step 5 — adjust portions */}
        {step === 'portions' ? (
          <View style={[styles.body, { paddingTop: 16 }]}>{foodsBlock}</View>
        ) : null}

        {/* Step 7 — final verification */}
        {step === 'verify' ? (
          <View style={[styles.body, { paddingTop: 16 }]}>
            {/* Meal of the day */}
            <Text style={styles.mealTypeTitle}>{t('result.mealMoment')}</Text>
            <View style={styles.mealTypeRow}>
              {MEAL_TYPES.map((m) => (
                <Pressable
                  key={m.key}
                  onPress={() => setMealType(m.key)}
                  style={[
                    styles.mealTypeChip,
                    mealType === m.key && styles.mealTypeChipOn,
                  ]}
                >
                  <Text style={{ fontSize: 18 }}>{m.icon}</Text>
                  <Text
                    style={[
                      styles.mealTypeText,
                      mealType === m.key && styles.mealTypeTextOn,
                    ]}
                  >
                    {t(`mealType.${m.key}`)}
                  </Text>
                </Pressable>
              ))}
            </View>
            {nutritionBlock}
            {macrosBlock}
            {verifyExtras}
          </View>
        ) : null}
      </ScrollView>

      {/* Footer: continue / confirm */}
      <View style={[styles.wizardFooter, { paddingBottom: insets.bottom + 12 }]}>
        {step === 'verify' ? (
          <AppButton
            label={t('result.confirmMeal')}
            onPress={confirmAndSave}
            loading={saving}
          />
        ) : (
          <AppButton label={t('result.continue')} onPress={goNext} />
        )}
      </View>

      {/* AI meal assistant — opened from the robot next to "Aliments détectés".
          Edit the plate by chat/voice/photo; totals update live before save. */}
      <MealAssistant
        items={items}
        onApply={setItems}
        carbs={result.carbohydrates}
        open={assistantOpen}
        onOpenChange={setAssistantOpen}
      />

      {/* Low-confidence "Did you mean?" bottom sheet */}
      <DidYouMeanSheet
        item={sheetIndex != null ? items[sheetIndex] ?? null : null}
        visible={sheetIndex != null}
        onConfirm={(choice) =>
          sheetIndex != null && confirmDidYouMean(sheetIndex, choice)
        }
        onDismiss={() => {
          if (sheetIndex != null) {
            setConfirmed((c) => ({ ...c, [sheetIndex]: true }));
          }
          setSheetIndex(null);
        }}
      />
    </View>
  );
}

function Metric({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <BevelCard style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricRow}>
        <Text style={[styles.metricValue, { color }]}>{value}</Text>
        <Text style={styles.metricUnit}>{unit}</Text>
      </View>
    </BevelCard>
  );
}

const styles = StyleSheet.create({
  mealTypeTitle: {
    fontSize: 14.5,
    fontWeight: '750' as any,
    color: colors.text,
    marginBottom: 10,
  },
  mealTypeRow: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  mealTypeChip: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
    paddingVertical: 11,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  mealTypeChipOn: {
    backgroundColor: colors.surface,
    borderColor: colors.primary,
  },
  mealTypeText: { fontSize: 11.5, fontWeight: '650' as any, color: colors.textSecondary },
  mealTypeTextOn: { color: colors.primary },
  root: { flex: 1, backgroundColor: colors.background },

  // ── Wizard header / footer ──
  wizardHeader: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F3',
    gap: 10,
  },
  wizardHeaderTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  wizardBack: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wizardStepOf: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  wizardTitle: {
    fontSize: 21,
    fontWeight: '800',
    color: colors.text,
    marginTop: 4,
  },
  wizardSub: { fontSize: 13.5, color: colors.textSecondary },
  wizardFooter: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F3',
  },
  tapHint: {
    fontSize: 12.5,
    color: colors.textSecondary,
    textAlign: 'center',
    marginBottom: 4,
  },

  // ── Step 8: green saved screen ──
  savedRoot: { flex: 1, backgroundColor: colors.background },
  savedHead: {
    backgroundColor: colors.primary,
    alignItems: 'center',
    paddingBottom: 40,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  savedCheck: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedCheckMark: { fontSize: 40, fontWeight: '900', color: '#fff' },
  savedTitle: {
    marginTop: 14,
    fontSize: 24,
    fontWeight: '800',
    color: '#fff',
  },
  savedAt: { marginTop: 4, fontSize: 14, color: 'rgba(255,255,255,0.85)' },
  savedBody: { paddingHorizontal: 16, paddingBottom: 40 },
  savedRecapRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  savedThumb: { width: 64, height: 64, borderRadius: 16 },

  hero: {
    height: 340,
    backgroundColor: '#DADAE0',
    overflow: 'hidden',
  },
  // Detection step: taller + dark letterbox so the WHOLE photo shows
  // (contain), nothing cropped, every bounding box visible.
  heroContain: {
    height: 420,
    backgroundColor: '#0A0A0E',
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
  },
  heroText: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 34,
  },
  foodName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  portion: { marginTop: 4, fontSize: 15, color: 'rgba(255,255,255,0.75)' },
  confidence: {
    position: 'absolute',
    left: 16,
    backgroundColor: 'rgba(10,10,14,0.55)',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  confidenceText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(10,10,14,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  body: {
    marginTop: -22,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  kcalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    ...shadows.card,
  },
  kcalLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 4 },
  kcalValue: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.warning,
    letterSpacing: -1,
  },
  kcalUnit: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  kcalDivider: { width: 1, height: 52, backgroundColor: '#F0F0F3', marginHorizontal: 16 },

  scoreCard: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 2,
    padding: 18,
    ...shadows.card,
  },
  scoreHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  scoreLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  scoreValue: { marginTop: 2, fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  scoreMax: { fontSize: 18, fontWeight: '600', color: colors.textTertiary },
  scoreBadge: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 },
  scoreBadgeText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  scoreReason: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#3E3E44',
  },

  detHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  itemsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  itemsHint: {
    fontSize: 12.5,
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 6,
  },
  portionEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  portionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portionBtnText: { fontSize: 18, fontWeight: '700', color: colors.text, lineHeight: 20 },
  portionValueWrap: { alignItems: 'center', minWidth: 44 },
  portionValue: { fontSize: 17, fontWeight: '800', color: colors.text },
  portionUnit: { fontSize: 10, color: colors.textTertiary },
  itemBlock: { paddingBottom: 4 },
  itemHighlighted: {
    backgroundColor: `${colors.primary}12`,
    borderRadius: 14,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F0F3' },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  itemName: { fontSize: 15.5, fontWeight: '650' as any, color: colors.text },
  itemDetail: { marginTop: 2, fontSize: 13, color: colors.textSecondary },

  tagMain: {
    backgroundColor: `${colors.primary}1A`,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagMainText: { fontSize: 10, fontWeight: '800', color: colors.primary },
  tagEst: {
    backgroundColor: colors.surface2,
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagEstText: { fontSize: 10, fontWeight: '700', color: colors.textSecondary },

  metaRow: { flexDirection: 'row', gap: 6, marginTop: 6, flexWrap: 'wrap' },
  metaChip: {
    backgroundColor: colors.surface2,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  metaChipText: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  foodId: { marginTop: 4, fontSize: 10.5, color: colors.textTertiary },
  editLink: { marginTop: 8, alignSelf: 'flex-start' },
  editLinkText: { fontSize: 12.5, fontWeight: '700', color: colors.ai },

  reidentifyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  reidentifyInput: {
    flex: 1,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    paddingHorizontal: 12,
    fontSize: 14,
    color: colors.text,
  },
  applyBtn: {
    height: 40,
    borderRadius: 12,
    paddingHorizontal: 14,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  applyBtnText: { fontSize: 13, fontWeight: '800', color: '#fff' },
  cancelBtn: { height: 40, paddingHorizontal: 8, alignItems: 'center', justifyContent: 'center' },
  cancelBtnText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },

  addFoodBlock: { paddingHorizontal: 16, paddingBottom: 16, paddingTop: 4 },
  addFoodTrigger: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.surface2,
    borderStyle: 'dashed',
    paddingVertical: 12,
    alignItems: 'center',
  },
  addFoodTriggerText: { fontSize: 14, fontWeight: '700', color: colors.ai },
  addFoodForm: {
    backgroundColor: colors.surface2,
    borderRadius: 16,
    padding: 14,
  },
  addFoodTitle: { fontSize: 14.5, fontWeight: '800', color: colors.text },
  addFoodHint: {
    marginTop: 2,
    fontSize: 12.5,
    color: colors.textSecondary,
    marginBottom: 10,
  },
  addFoodRow: { flexDirection: 'row', gap: 8 },
  addFoodError: { marginTop: 8, fontSize: 12.5, color: colors.danger },
  addFoodActions: { flexDirection: 'row', gap: 8, marginTop: 10 },

  suggestBox: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: `${colors.ai}12`,
    borderRadius: 14,
    padding: 12,
  },
  suggestTitle: { fontSize: 13.5, fontWeight: '800', color: colors.text },
  suggestBody: { marginTop: 3, fontSize: 12.5, color: colors.textSecondary },
  suggestActions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  suggestUse: {
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 16,
    backgroundColor: colors.ai,
  },
  suggestUseText: { fontSize: 12.5, fontWeight: '800', color: '#fff' },
  suggestIgnore: { borderRadius: 10, paddingVertical: 7, paddingHorizontal: 14 },
  suggestIgnoreText: { fontSize: 12.5, fontWeight: '700', color: colors.textSecondary },

  highlightsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  glPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  glDot: { width: 7, height: 7, borderRadius: 4 },
  glText: { fontSize: 12.5, fontWeight: '800' },
  hlChip: { borderRadius: 999, paddingVertical: 6, paddingHorizontal: 12 },
  hlText: { fontSize: 12.5, fontWeight: '700' },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  sourceDot: { width: 6, height: 6, borderRadius: 3 },
  sourceText: { fontSize: 11.5, fontWeight: '700' },
  itemConf: { alignItems: 'flex-end' },
  itemConfValue: { fontSize: 14, fontWeight: '800', color: colors.text },
  itemConfLabel: { fontSize: 10, color: colors.textTertiary },
  totalsSource: {
    marginTop: 10,
    alignItems: 'center',
  },
  totalsSourceText: { fontSize: 12.5, color: colors.textSecondary },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  metric: { flexBasis: '47%', flexGrow: 1, paddingVertical: 14 },
  metricLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  metricRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  metricValue: { fontSize: 24, fontWeight: '800' },
  metricUnit: { fontSize: 13, color: colors.textSecondary },

  giHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  giTitle: { fontSize: 16, fontWeight: '650' as any, color: colors.text },
  giBadge: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  giBadgeText: { fontSize: 13, fontWeight: '700' },
  giTrack: {
    marginTop: 14,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  giFill: { height: '100%', borderRadius: 4 },
  giScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  giScaleText: { fontSize: 11.5, color: colors.textTertiary },
  giHint: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },

  bolusCard: {
    marginTop: 12,
    backgroundColor: colors.ink,
    borderRadius: 24,
    padding: 20,
    ...shadows.floating,
  },
  bolusLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  bolusRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  bolusValue: { fontSize: 44, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  bolusUnit: { fontSize: 20, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  bolusDetail: { marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  disclaimer: {
    marginTop: 10,
    fontSize: 11.5,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.4)',
  },

  warnCard: {
    marginTop: 12,
    backgroundColor: colors.warningDim,
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  warnText: { fontSize: 13.5, lineHeight: 19, color: '#B45D22' },
});
