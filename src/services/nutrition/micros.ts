import type { FoodCategory, FoodItemResult } from '@/types';

/**
 * Portion-based micronutrient & hydration ESTIMATES for the meal-analysis
 * summary cards.
 *
 * These are estimates, not lab values: the app resolves macros (calories,
 * carbs, protein…) from real nutrition databases, but per-food micronutrient
 * and water content is not stored. Instead of the old "has a vegetable? +34%"
 * heuristic (which ignored how much you ate), we approximate each nutrient
 * from a representative DENSITY per food category multiplied by the actual
 * grams on the plate, then express it as a share of the daily reference
 * intake. The numbers now scale with portion size and re-compute whenever the
 * user edits the plate — good enough for a motivational summary, and honest
 * about being an estimate.
 */

/** Adult daily reference intakes (FDA Daily Values, rounded). */
const DV = {
  a: 900, // Vitamin A, µg RAE
  c: 90, // Vitamin C, mg
  fe: 18, // Iron, mg
  ca: 1000, // Calcium, mg
  k: 3500, // Potassium, mg
};

/** Representative micronutrient density per 100 g, by food category.
 *  A in µg RAE; C, Fe, Ca, K in mg. Rough averages of common foods in each
 *  group — deliberately conservative. */
const MICRO_PER_100G: Record<FoodCategory, { a: number; c: number; fe: number; ca: number; k: number }> = {
  Vegetable: { a: 200, c: 30, fe: 1.2, ca: 45, k: 300 },
  Fruit: { a: 40, c: 35, fe: 0.4, ca: 14, k: 200 },
  Legumes: { a: 5, c: 2, fe: 2.6, ca: 50, k: 420 },
  Protein: { a: 15, c: 0, fe: 2.2, ca: 12, k: 320 },
  Seafood: { a: 40, c: 0, fe: 1.0, ca: 30, k: 350 },
  Egg: { a: 160, c: 0, fe: 1.8, ca: 55, k: 130 },
  Dairy: { a: 110, c: 1, fe: 0.1, ca: 120, k: 150 },
  Rice: { a: 0, c: 0, fe: 0.8, ca: 10, k: 55 },
  Bread: { a: 0, c: 0, fe: 1.5, ca: 40, k: 120 },
  Pasta: { a: 0, c: 0, fe: 1.3, ca: 15, k: 60 },
  Soup: { a: 30, c: 3, fe: 0.6, ca: 20, k: 120 },
  Sauce: { a: 30, c: 2, fe: 0.6, ca: 15, k: 130 },
  Dessert: { a: 20, c: 0, fe: 0.6, ca: 40, k: 90 },
  Drink: { a: 5, c: 8, fe: 0.1, ca: 10, k: 40 },
  Snack: { a: 0, c: 0, fe: 1.0, ca: 20, k: 120 },
  'Fast Food': { a: 20, c: 1, fe: 1.6, ca: 60, k: 200 },
  Unknown: { a: 10, c: 3, fe: 0.7, ca: 25, k: 120 },
};

export interface MicroEstimate {
  /** % of the daily reference intake, 0..100 (rounded). */
  a: number;
  c: number;
  fe: number;
  ca: number;
  k: number;
}

/**
 * Estimate vitamin/mineral coverage (% of daily needs) for the whole plate
 * from each food's category density × its grams. Returns 0..100 per nutrient.
 */
/**
 * A food no database could identify is shown with ZERO nutrition on the
 * plate. Counting its vitamins and minerals anyway would contradict that on
 * the very same screen (0 kcal, yet 192 mg of potassium), so unidentified
 * foods contribute nothing here either — they are surfaced as a warning
 * instead, for the patient to correct.
 */
const isUnidentified = (it: FoodItemResult) => it.nutrition_confidence === 0;

export function estimateMicros(items: FoodItemResult[]): MicroEstimate {
  const abs = { a: 0, c: 0, fe: 0, ca: 0, k: 0 };
  for (const it of items) {
    if (isUnidentified(it)) continue;
    const d = MICRO_PER_100G[it.category ?? 'Unknown'] ?? MICRO_PER_100G.Unknown;
    const f = Math.max(0, it.portion_grams) / 100;
    abs.a += d.a * f;
    abs.c += d.c * f;
    abs.fe += d.fe * f;
    abs.ca += d.ca * f;
    abs.k += d.k * f;
  }
  const pct = (value: number, dv: number) =>
    Math.max(0, Math.min(100, Math.round((value / dv) * 100)));
  return {
    a: pct(abs.a, DV.a),
    c: pct(abs.c, DV.c),
    fe: pct(abs.fe, DV.fe),
    ca: pct(abs.ca, DV.ca),
    k: pct(abs.k, DV.k),
  };
}

/** Average micronutrient coverage (%) — drives the "good/low intake" label. */
export function microAverage(m: MicroEstimate): number {
  return (m.a + m.c + m.fe + m.ca + m.k) / 5;
}

/** Approximate water fraction (of grams) held by each food category. */
const WATER_FRACTION: Record<FoodCategory, number> = {
  Vegetable: 0.92,
  Fruit: 0.85,
  Legumes: 0.68,
  Protein: 0.64,
  Seafood: 0.72,
  Egg: 0.75,
  Dairy: 0.85,
  Rice: 0.68,
  Bread: 0.35,
  Pasta: 0.62,
  Soup: 0.88,
  Sauce: 0.75,
  Dessert: 0.4,
  Drink: 0.9,
  Snack: 0.1,
  'Fast Food': 0.45,
  Unknown: 0.6,
};

/**
 * Estimate how much water (ml) this meal itself contributes, from each food's
 * category water fraction × its grams (1 g ≈ 1 ml). Lets the hydration card
 * show a real, portion-driven number instead of a fixed full ring.
 */
export function estimateMealWaterMl(items: FoodItemResult[]): number {
  let ml = 0;
  for (const it of items) {
    if (isUnidentified(it)) continue; // same rule as the micronutrients above
    const frac = WATER_FRACTION[it.category ?? 'Unknown'] ?? WATER_FRACTION.Unknown;
    ml += frac * Math.max(0, it.portion_grams);
  }
  return Math.round(ml);
}

/**
 * Recommended daily water goal in millilitres, ~35 ml per kg of body weight,
 * clamped to a sensible 1.5–4 L. Falls back to 2 L when weight is unknown.
 */
export function waterGoalMl(weight?: number): number {
  const raw = weight ? weight * 35 : 2000;
  const clamped = Math.max(1500, Math.min(4000, raw));
  return Math.round(clamped / 50) * 50;
}
