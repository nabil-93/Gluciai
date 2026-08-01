/**
 * IS THIS NUMBER PHYSICALLY POSSIBLE? — the bounds, in one place.
 *
 * WHY THIS EXISTS. Step 10 taught the pipeline to tell a measured
 * carbohydrate from a missing one. It says nothing about a value that is
 * present, typed as a number, and impossible: 500 g of carbohydrate in 100 g
 * of product, a 9 999 g portion, 300 g of macros inside 100 g of food. Those
 * reach the plate total, the screen and the bolus field exactly like a real
 * measurement, and the only thing standing between them and an injected dose
 * is the engine's silent 20 U ceiling.
 *
 * TWO RULES, AND THE DIFFERENCE BETWEEN THEM MATTERS.
 *
 *  1. An implausible CARBOHYDRATE becomes UNKNOWN — never a clamped
 *     carbohydrate. Clamping 500 → 100 would replace one wrong number with a
 *     smaller wrong number that then looks measured and gets dosed from. So it
 *     takes Step 10's existing channel instead: value `0`, `carbs_known:
 *     false`. The dose refuses it and says so, which is the honest answer.
 *
 *  2. Every OTHER implausible field is REPORTED, not rewritten. Silently
 *     editing a displayed calorie or sodium figure would hide the upstream
 *     defect and make a broken record look healthy. The plate carries
 *     `warn:implausible` naming the food, and the numbers stay as they came so
 *     the patient can see something is wrong and check the label.
 *
 * WHAT IS DELIBERATELY *NOT* CHECKED HERE (each would produce false alarms on
 * legitimate data, so each needs its own decision, not a guess):
 *  · fibre ≤ carbohydrate — false in EU labelling, where carbohydrate
 *    EXCLUDES fibre. Wheat bran is legitimately 3.8 g carbs / 43 g fibre.
 *  · energy vs 4/4/9 × macros — alcohol is 7 kcal/g and polyols ~2.4, so a
 *    drink or a sugar-free product breaks the identity while being correct.
 *  · plate-level totals (a 20 kg plate is still accepted; the bound is
 *    per food).
 *
 * Pure by design: no imports, so the engine, the screens and the tests share
 * one set of limits and the tests run in a plain node environment.
 */

/** Upper physical limit of a PER-100 g figure. */
export const PER100G_MAX = {
  /** Pure fat is ~884 kcal/100 g; nothing edible exceeds ~950. */
  calories: 950,
  /** 100 g of anything cannot hold more than 100 g of one macro. */
  carbs: 100,
  sugar: 100,
  protein: 100,
  fat: 100,
  fiber: 100,
  /** Pure table salt is ~39 000 mg of sodium per 100 g. */
  sodium: 40_000,
} as const;

/** Published glycemic indices top out near 110 (glucose = 100); 200 is a
 *  generous ceiling, matching the `product_catalog` column constraint. */
export const GI_MAX = 200;

/** A single food's portion. Matches the `analyze-meal` clamp (5–2000 g) so the
 *  server bound and the client bound cannot disagree. */
export const PORTION_MIN = 5;
export const PORTION_MAX = 2000;

/** Protein + carbohydrate + fat in 100 g of food, plus 1 g of rounding slack.
 *  The rest of the mass is water, fibre and ash. */
export const MACRO_SUM_MAX = 101;

/** Sugar is a subset of carbohydrate; sources round the two independently, so
 *  allow 1 g of slack before calling the pair contradictory. */
export const SUGAR_OVER_CARBS_SLACK = 1;

/** Which figure is out of range. Field names double as the reason. */
export type PlausibilityIssue =
  | 'calories'
  | 'carbs'
  | 'sugar'
  | 'protein'
  | 'fat'
  | 'fiber'
  | 'sodium'
  | 'glycemic_index'
  | 'macro_sum'
  | 'sugar_over_carbs';

/** The shape this module reasons about — structural, so `Per100g` and any
 *  future per-100 g record satisfy it without importing anything. */
export interface Per100gLike {
  calories: number;
  carbs: number;
  sugar: number;
  protein: number;
  fat: number;
  fiber: number;
  sodium?: number;
  glycemic_index?: number;
  carbs_known?: boolean;
}

/** In range when it is a real number between 0 and `max`. */
function inRange(v: number | undefined, max: number): boolean {
  if (v === undefined) return true; // absent is not implausible — see Step 10
  return Number.isFinite(v) && v >= 0 && v <= max;
}

/**
 * Every physical rule this record breaks, in a stable order. Empty means the
 * record is possible — NOT that it is correct.
 */
export function checkPer100g(p: Per100gLike): PlausibilityIssue[] {
  const issues: PlausibilityIssue[] = [];

  if (!inRange(p.calories, PER100G_MAX.calories)) issues.push('calories');
  if (!inRange(p.carbs, PER100G_MAX.carbs)) issues.push('carbs');
  if (!inRange(p.sugar, PER100G_MAX.sugar)) issues.push('sugar');
  if (!inRange(p.protein, PER100G_MAX.protein)) issues.push('protein');
  if (!inRange(p.fat, PER100G_MAX.fat)) issues.push('fat');
  if (!inRange(p.fiber, PER100G_MAX.fiber)) issues.push('fiber');
  if (!inRange(p.sodium, PER100G_MAX.sodium)) issues.push('sodium');
  if (!inRange(p.glycemic_index, GI_MAX)) issues.push('glycemic_index');

  // Cross-field checks run only on figures that are individually possible —
  // otherwise one bad number would report itself three times.
  const macrosUsable =
    !issues.includes('protein') && !issues.includes('carbs') && !issues.includes('fat');
  if (macrosUsable && p.protein + p.carbs + p.fat > MACRO_SUM_MAX) {
    issues.push('macro_sum');
  }

  // Skipped when the carbohydrate is UNKNOWN: its `0` is a placeholder, and
  // comparing a real sugar figure against a placeholder would flag every
  // carb-less record as contradictory.
  const carbsUsable =
    p.carbs_known !== false && !issues.includes('carbs') && !issues.includes('sugar');
  if (carbsUsable && p.sugar > p.carbs + SUGAR_OVER_CARBS_SLACK) {
    issues.push('sugar_over_carbs');
  }

  return issues;
}

/** True when the carbohydrate figure itself is physically possible. */
export function isCarbsPlausible(p: Per100gLike): boolean {
  return inRange(p.carbs, PER100G_MAX.carbs);
}

/**
 * The record as it may enter the engine, plus what was wrong with it.
 *
 * ONLY the carbohydrate is altered, and only into Step 10's "unknown" state —
 * never into a smaller plausible-looking carbohydrate. Everything else is
 * returned untouched, with its issue reported for the plate warning.
 */
export function sanitizePer100g<T extends Per100gLike>(
  per100g: T
): { per100g: T; issues: PlausibilityIssue[] } {
  const issues = checkPer100g(per100g);
  if (!issues.includes('carbs')) return { per100g, issues };
  return {
    per100g: { ...per100g, carbs: 0, carbs_known: false },
    issues,
  };
}

/** Whether a portion in grams is a portion a person could eat. */
export function isPortionPlausible(grams: number): boolean {
  return Number.isFinite(grams) && grams >= PORTION_MIN && grams <= PORTION_MAX;
}

/**
 * A portion bounded into the possible range, for INPUT paths only (a typed
 * portion, a learned habit). Never applied to a figure already on screen: the
 * point is to stop an impossible portion being created, not to quietly redraw
 * one the patient is looking at.
 */
export function clampPortionGrams(grams: number): number {
  if (!Number.isFinite(grams)) return PORTION_MIN;
  return Math.max(PORTION_MIN, Math.min(PORTION_MAX, Math.round(grams)));
}

/** Names of the foods carrying at least one implausible figure. */
export function implausibleNames(
  items: ({ name?: string; implausible_fields?: string[] } | null | undefined)[] | null | undefined
): string[] {
  return (items ?? [])
    .filter((it) => (it?.implausible_fields?.length ?? 0) > 0)
    .map((it) => it!.name?.trim() || '')
    .filter((n) => n.length > 0);
}
