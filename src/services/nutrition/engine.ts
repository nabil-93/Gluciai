import type { FoodItemResult, NutritionResult, NutritionSource } from '@/types';

import { moroccanProvider } from './providers/moroccan';
import { openFoodFactsProvider } from './providers/openfoodfacts';
import { usdaProvider } from './providers/usda';
import type { DetectedFood, NutritionProvider, Per100g } from './types';

/**
 * Provider chain — NEVER skip this order:
 *   1. Internal Moroccan Nutrition Database
 *   2. USDA FoodData Central
 *   3. Open Food Facts
 *   4. AI estimation (fallback only, handled by the caller)
 *
 * Future-ready: to add a country (Italian, Japanese…), implement
 * NutritionProvider and insert it here — nothing else changes.
 */
const PROVIDER_CHAIN: NutritionProvider[] = [
  moroccanProvider,
  usdaProvider,
  openFoodFactsProvider,
];

export const SOURCE_LABEL: Record<NutritionSource, string> = {
  moroccan_db: 'Base marocaine',
  usda: 'USDA FoodData Central',
  openfoodfacts: 'Open Food Facts',
  ai_estimate: 'Estimation IA',
};

/** Below this detection confidence a food is discarded — never invented. */
const MIN_DETECTION_CONFIDENCE = 0.4;

function scale(per100g: Per100g, grams: number) {
  const f = grams / 100;
  const r = (v: number) => Math.round(v * f * 10) / 10;
  return {
    calories: Math.round(per100g.calories * f),
    carbohydrates: r(per100g.carbs),
    sugar: r(per100g.sugar),
    protein: r(per100g.protein),
    fat: r(per100g.fat),
    fiber: r(per100g.fiber),
    sodium:
      per100g.sodium !== undefined ? Math.round(per100g.sodium * f) : undefined,
  };
}

/**
 * Resolve ONE detected food through the provider chain.
 * `aiPer100g` is the vision model's own estimation — used only when
 * every database misses (source becomes 'ai_estimate').
 */
export async function resolveFood(
  detected: DetectedFood,
  aiPer100g?: Per100g
): Promise<FoodItemResult | null> {
  for (const provider of PROVIDER_CHAIN) {
    const hit = await provider.search(detected.name);
    if (hit) {
      return {
        name: hit.matchedName,
        portion_grams: detected.portion_grams,
        ...scale(hit.per100g, detected.portion_grams),
        glycemic_index: hit.per100g.glycemic_index,
        source: hit.source,
        detection_confidence: detected.confidence,
        nutrition_confidence: hit.nutritionConfidence,
      };
    }
  }

  // 4 — AI estimation, fallback only
  if (aiPer100g) {
    return {
      name: detected.name,
      portion_grams: detected.portion_grams,
      ...scale(aiPer100g, detected.portion_grams),
      glycemic_index: aiPer100g.glycemic_index,
      source: 'ai_estimate',
      detection_confidence: detected.confidence,
      nutrition_confidence: 0.55,
    };
  }
  return null;
}

/**
 * Full plate analysis: resolve every detected food individually, then
 * aggregate the totals. Returns null when nothing can be identified
 * confidently — the UI must ask for another picture, never invent.
 */
export async function analyzePlate(
  detections: DetectedFood[],
  aiFallbacks?: (Per100g | undefined)[]
): Promise<NutritionResult | null> {
  const confident = detections
    .map((d, i) => ({ d, ai: aiFallbacks?.[i] }))
    .filter(({ d }) => d.confidence >= MIN_DETECTION_CONFIDENCE);

  if (confident.length === 0) return null;

  const resolved = (
    await Promise.all(confident.map(({ d, ai }) => resolveFood(d, ai)))
  ).filter((r): r is FoodItemResult => r !== null);

  if (resolved.length === 0) return null;

  return aggregateItems(resolved);
}

/**
 * Rescale one resolved item to a new portion (values are linear in
 * grams). Used when the user corrects a portion on the result screen.
 */
export function rescaleItem(
  item: FoodItemResult,
  newGrams: number
): FoodItemResult {
  const f = newGrams / Math.max(1, item.portion_grams);
  const r = (v: number) => Math.round(v * f * 10) / 10;
  return {
    ...item,
    portion_grams: Math.round(newGrams),
    calories: Math.round(item.calories * f),
    carbohydrates: r(item.carbohydrates),
    sugar: r(item.sugar),
    protein: r(item.protein),
    fat: r(item.fat),
    fiber: r(item.fiber),
    sodium: item.sodium !== undefined ? Math.round(item.sodium * f) : undefined,
  };
}

/** Aggregate per-item results into a plate-level NutritionResult. */
export function aggregateItems(resolved: FoodItemResult[]): NutritionResult {
  // ── Aggregate totals ──
  const total = resolved.reduce(
    (acc, it) => {
      acc.calories += it.calories;
      acc.carbs += it.carbohydrates;
      acc.sugar += it.sugar;
      acc.protein += it.protein;
      acc.fat += it.fat;
      acc.fiber += it.fiber;
      acc.sodium += it.sodium ?? 0;
      acc.grams += it.portion_grams;
      return acc;
    },
    { calories: 0, carbs: 0, sugar: 0, protein: 0, fat: 0, fiber: 0, sodium: 0, grams: 0 }
  );

  // Carb-weighted glycemic index over items that have one
  const giItems = resolved.filter(
    (it) => it.glycemic_index !== undefined && it.carbohydrates > 0
  );
  const giCarbs = giItems.reduce((s, it) => s + it.carbohydrates, 0);
  const gi =
    giCarbs > 0
      ? Math.round(
          giItems.reduce(
            (s, it) => s + it.glycemic_index! * it.carbohydrates,
            0
          ) / giCarbs
        )
      : 0;

  // Dominant source (by carbs contribution), overall confidences
  const bySource = new Map<NutritionSource, number>();
  for (const it of resolved) {
    bySource.set(
      it.source,
      (bySource.get(it.source) ?? 0) + it.carbohydrates + 1
    );
  }
  const dominantSource = [...bySource.entries()].sort(
    (a, b) => b[1] - a[1]
  )[0][0];

  const detectionConfidence =
    resolved.reduce((s, it) => s + it.detection_confidence, 0) /
    resolved.length;
  const nutritionConfidence =
    resolved.reduce((s, it) => s + it.nutrition_confidence, 0) /
    resolved.length;

  const warnings: string[] = [];
  if (gi > 65) {
    warnings.push(
      'Index glycémique élevé — mesurez votre glycémie 2 h après le repas.'
    );
  }
  if (total.sugar > 30) {
    warnings.push(
      `${Math.round(total.sugar)} g de sucre — impact glycémique important.`
    );
  }
  if (resolved.some((it) => it.source === 'ai_estimate')) {
    warnings.push(
      'Certaines valeurs sont estimées par IA (aliment absent des bases officielles).'
    );
  }

  const names = resolved.map((it) => it.name);
  return {
    food_name:
      names.length <= 2 ? names.join(' + ') : `${names[0]} + ${names.length - 1} autres`,
    estimated_portion: `${Math.round(total.grams)} g au total`,
    calories: Math.round(total.calories),
    carbohydrates: Math.round(total.carbs * 10) / 10,
    sugar: Math.round(total.sugar * 10) / 10,
    protein: Math.round(total.protein * 10) / 10,
    fat: Math.round(total.fat * 10) / 10,
    fiber: Math.round(total.fiber * 10) / 10,
    sodium: Math.round(total.sodium),
    glycemic_index: gi,
    confidence: Math.round(detectionConfidence * 100) / 100,
    nutrition_confidence: Math.round(nutritionConfidence * 100) / 100,
    source: dominantSource,
    items: resolved,
    warnings,
  };
}
