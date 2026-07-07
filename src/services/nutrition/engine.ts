import type { FoodItemResult, NutritionResult, NutritionSource } from '@/types';

import { buildHighlights, glycemicLoad } from './advice';
import { getCachedMatch, setCachedMatch } from './cache';
import { matchScore, normalizeSearchName } from './match';
import { scoreMeal } from './mealScore';
import { moroccanProvider } from './providers/moroccan';
import { openFoodFactsProvider } from './providers/openfoodfacts';
import { edamamProvider, fatSecretProvider } from './providers/remote';
import { usdaProvider } from './providers/usda';
import { resilient } from './resilience';
import type { DetectedFood, NutritionProvider, Per100g } from './types';

/**
 * Provider chain — NEVER skip this order:
 *   1. Internal Food Database (Moroccan + Arabic + homemade)
 *   2. USDA FoodData Central
 *   3. Open Food Facts
 *   4. FatSecret        (edge-function proxied; no-op until configured)
 *   5. Edamam           (edge-function proxied; no-op until configured)
 *   6. AI estimation    (fallback only, handled by the caller)
 *
 * USDA is never treated as the only source — many Moroccan/Arabic dishes
 * live only in the internal DB, and the chain keeps searching past USDA
 * until the best match is found.
 *
 * Future-ready: to add a country/source (Italian, Japanese…), implement
 * NutritionProvider and insert it here — nothing else changes.
 */
// Each provider is wrapped for resilience (per-provider timeout + one
// retry + never-throw) so one slow/flaky source can't block or break a
// scan. The order and the providers themselves are unchanged.
const PROVIDER_CHAIN: NutritionProvider[] = [
  moroccanProvider,
  usdaProvider,
  openFoodFactsProvider,
  fatSecretProvider,
  edamamProvider,
].map((p) => resilient(p));

export const SOURCE_LABEL: Record<NutritionSource, string> = {
  moroccan_db: 'Base interne',
  usda: 'USDA FoodData Central',
  openfoodfacts: 'Open Food Facts',
  fatsecret: 'FatSecret',
  edamam: 'Edamam',
  ai_estimate: 'Estimation IA',
};

/** Below this detection confidence a food is discarded — never invented. */
const MIN_DETECTION_CONFIDENCE = 0.4;

/**
 * Below this fuzzy match score a database hit is treated as a MISS — a 15%
 * "match" is a different food entirely and produces garbage nutrition
 * (e.g. "oignons frits" matching a random OFF product). Better to keep
 * searching, or surface the item as unmatched, than to show junk values.
 */
const MIN_MATCH_SCORE = 35;

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
 *
 * ALWAYS searches with the generic `search_name` ("salmon"), never the
 * display label ("Grilled Salmon"). Walks the WHOLE chain and keeps the
 * best fuzzy match instead of stopping at USDA — so regional dishes that
 * USDA misses are still found in the Moroccan DB / Open Food Facts.
 *
 * `aiPer100g` is the vision model's own estimation — used only when
 * every database misses (source becomes 'ai_estimate').
 */
export async function resolveFood(
  detected: DetectedFood,
  aiPer100g?: Per100g,
  opts?: {
    /**
     * When true (plate analysis), a food that matches NOTHING is returned
     * as a visible zero-nutrition placeholder instead of null — a detected
     * food must never silently disappear from the plate. Callers that want
     * a strict miss (menu scan, manual add) leave this false.
     */
    keepUnmatched?: boolean;
  }
): Promise<FoodItemResult | null> {
  // Normalize even model-provided search names (cooking words, synonyms,
  // French→English tokens) — the nutrition databases are English-first.
  const query = normalizeSearchName(
    detected.search_name?.trim() || detected.name
  );

  // Search every database, then keep the highest-scoring match — we never
  // stop at the first hit, so a weak USDA result can be beaten by a strong
  // regional-DB / Open Food Facts one.
  let best: {
    hit: Awaited<ReturnType<NutritionProvider['search']>>;
    score: number;
  } | null = null;

  // Smart cache: a previously-resolved search term skips the whole chain.
  // The cached hit is per-100g, so it is portion-independent and safe to
  // reuse across scans. Cache misses never block — we just search live.
  const cached = await getCachedMatch(query);
  if (cached) {
    best = { hit: cached, score: cached.matchScore ?? matchScore(query, cached.matchedName) };
  } else {
    for (const provider of PROVIDER_CHAIN) {
      const hit = await provider.search(query);
      if (!hit) continue;
      const score = hit.matchScore ?? matchScore(query, hit.matchedName);
      // A hit that barely resembles the query is a WRONG food — skip it.
      if (score < MIN_MATCH_SCORE) continue;
      if (!best || score > best.score) best = { hit, score };
      // A near-perfect match on an official/internal DB is good enough — stop
      // early to save network round-trips down the rest of the chain.
      if (score >= 90 && hit.nutritionConfidence >= 0.9) break;
    }
    // Persist a confident live match so the next scan of this food is instant.
    if (best?.hit && best.score >= 70) {
      void setCachedMatch(query, { ...best.hit, matchScore: best.score });
    }
  }

  if (best?.hit) {
    const { hit } = best;
    return {
      name: detected.name,
      search_name: query,
      category: detected.category,
      portion_grams: detected.portion_grams,
      ...scale(hit.per100g, detected.portion_grams),
      glycemic_index: hit.per100g.glycemic_index,
      source: hit.source,
      matched_database: hit.source,
      matched_food: hit.matchedName,
      food_id: hit.foodId,
      match_score: best.score,
      bounding_box: detected.bounding_box,
      is_main_food: detected.is_main_food,
      is_estimated: detected.is_estimated,
      alternatives: detected.alternatives,
      detection_confidence: detected.confidence,
      nutrition_confidence: hit.nutritionConfidence,
    };
  }

  // 6 — AI estimation, fallback only (every database missed).
  if (aiPer100g) {
    return {
      name: detected.name,
      search_name: query,
      category: detected.category,
      portion_grams: detected.portion_grams,
      ...scale(aiPer100g, detected.portion_grams),
      glycemic_index: aiPer100g.glycemic_index,
      source: 'ai_estimate',
      matched_database: 'ai_estimate',
      matched_food: detected.name,
      match_score: 100,
      bounding_box: detected.bounding_box,
      is_main_food: detected.is_main_food,
      is_estimated: detected.is_estimated,
      alternatives: detected.alternatives,
      detection_confidence: detected.confidence,
      nutrition_confidence: 0.55,
    };
  }

  // 7 — Every database missed. On a plate analysis, KEEP the food visible
  // with unknown (zero) nutrition instead of silently dropping it — the
  // user sees it, gets a warning, and can re-identify or adjust it.
  // We still never invent values.
  if (opts?.keepUnmatched) {
    return {
      name: detected.name,
      search_name: query,
      category: detected.category,
      portion_grams: detected.portion_grams,
      calories: 0,
      carbohydrates: 0,
      sugar: 0,
      protein: 0,
      fat: 0,
      fiber: 0,
      source: 'ai_estimate',
      match_score: 0,
      bounding_box: detected.bounding_box,
      is_main_food: detected.is_main_food,
      is_estimated: true,
      alternatives: detected.alternatives,
      detection_confidence: detected.confidence,
      nutrition_confidence: 0,
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
    await Promise.all(
      // keepUnmatched: a food detected on the plate must never silently
      // disappear just because no database knows it yet.
      confident.map(({ d, ai }) => resolveFood(d, ai, { keepUnmatched: true }))
    )
  ).filter((r): r is FoodItemResult => r !== null);

  if (resolved.length === 0) return null;

  return aggregateItems(resolved);
}

/**
 * Re-resolve ONE item after the user re-identifies the food (types a new
 * name / picks a different match). Runs the corrected name back through the
 * SAME provider chain and keeps the user's current portion. Returns the
 * original item unchanged when nothing better is found — never guesses.
 */
export async function reidentifyItem(
  item: FoodItemResult,
  correctedName: string
): Promise<FoodItemResult> {
  const resolved = await resolveFood({
    name: correctedName,
    search_name: correctedName,
    category: item.category,
    portion_grams: item.portion_grams,
    confidence: Math.max(item.detection_confidence, 0.9), // user is sure
    bounding_box: item.bounding_box,
    is_main_food: item.is_main_food,
    is_estimated: false, // user confirmed the identity
  });
  return resolved ?? item;
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
  const unmatched = resolved.filter((it) => it.nutrition_confidence === 0);
  if (unmatched.length > 0) {
    warnings.push(
      `Sans valeurs nutritionnelles (introuvable dans les bases) : ${unmatched
        .map((u) => u.name)
        .join(', ')} — touchez « Modifier l'aliment » pour corriger.`
    );
  }
  if (
    resolved.some(
      (it) => it.source === 'ai_estimate' && it.nutrition_confidence > 0
    )
  ) {
    warnings.push(
      'Certaines valeurs sont estimées par IA (aliment absent des bases officielles).'
    );
  }

  const names = resolved.map((it) => it.name);

  const totals = {
    calories: Math.round(total.calories),
    carbs: Math.round(total.carbs * 10) / 10,
    sugar: Math.round(total.sugar * 10) / 10,
    protein: Math.round(total.protein * 10) / 10,
    fat: Math.round(total.fat * 10) / 10,
    fiber: Math.round(total.fiber * 10) / 10,
    sodium: Math.round(total.sodium),
  };

  // Plate quality (0..100), glycemic load bucket and a localized advice
  // KEY — all derived from the database-sourced totals, never the AI.
  const { score: meal_score } = scoreMeal({
    calories: totals.calories,
    carbs: totals.carbs,
    sugar: totals.sugar,
    protein: totals.protein,
    fat: totals.fat,
    fiber: totals.fiber,
    sodium: totals.sodium,
    glycemic_index: gi,
  });
  const glycemic_load = glycemicLoad(totals.carbs, gi);
  const highlights = buildHighlights({
    calories: totals.calories,
    carbs: totals.carbs,
    sugar: totals.sugar,
    protein: totals.protein,
    fat: totals.fat,
    fiber: totals.fiber,
    sodium: totals.sodium,
    glycemic_index: gi,
    categories: resolved
      .map((it) => it.category)
      .filter((c): c is NonNullable<typeof c> => !!c),
  });

  return {
    food_name:
      names.length <= 2 ? names.join(' + ') : `${names[0]} + ${names.length - 1} autres`,
    estimated_portion: `${Math.round(total.grams)} g au total`,
    calories: totals.calories,
    carbohydrates: totals.carbs,
    sugar: totals.sugar,
    protein: totals.protein,
    fat: totals.fat,
    fiber: totals.fiber,
    sodium: totals.sodium,
    glycemic_index: gi,
    confidence: Math.round(detectionConfidence * 100) / 100,
    nutrition_confidence: Math.round(nutritionConfidence * 100) / 100,
    source: dominantSource,
    items: resolved,
    meal_score,
    glycemic_load,
    // Stable highlight KEYS; the UI localizes each via
    // t(`insights.highlights.${key}`). Persisted scans re-localize.
    highlights,
    warnings,
  };
}
