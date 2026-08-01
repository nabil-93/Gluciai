/**
 * PER-100 g, OR NOTHING — the provider-proxy normalization contract.
 *
 * Pure by design (no `Deno`, no `jsr:`, no network) so the two decisions that
 * can produce a wrong carbohydrate are testable: what a missing value means,
 * and what basis a value was published on.
 *
 * TWO DEFECTS THIS FILE FIXES (audit findings N-2, N-5).
 *
 * 1. MISSING BECAME ZERO. `numField(v, 0)` turned a nutrient the upstream
 *    source never published into `0`, and only `calories > 0` was checked. The
 *    client (Step 10) refuses to dose a carbohydrate it cannot verify, but a
 *    server-minted `0` is indistinguishable from a measurement, so the refusal
 *    could not fire. A value that was not published is now `null`.
 *
 * 2. A PER-SERVING PAYLOAD COULD BE LABELLED PER-100 g. FatSecret publishes
 *    nutrition per SERVING, with the serving's metric size in
 *    `metric_serving_amount` + `metric_serving_unit`. The old conversion was
 *    `factor = grams > 0 && unit === 'g' ? 100 / grams : 1` — so any serving
 *    that was not expressed in grams silently fell back to `1`, i.e. the
 *    per-serving numbers were emitted AS the per-100 g numbers. A 240 g cup of
 *    rice at 53 g of carbohydrate then became "53 g per 100 g", and the client
 *    multiplied it by the portion again.
 *
 *    The basis is now either KNOWN (grams) or the hit is dropped. `ml` is not
 *    converted: millilitres become grams only through a density this code does
 *    not have (water 1.0, oil 0.92, honey 1.42), and guessing one would be the
 *    same class of error in a new disguise. Dropping the hit costs a fallback
 *    provider's answer; guessing costs a wrong dose.
 */

/** Per-100 g nutrition. `null` = the source published nothing usable. */
export interface Per100g {
  /** Always a number: a hit without usable energy is dropped. */
  calories: number;
  carbs: number | null;
  sugar: number | null;
  protein: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
}

export interface Hit {
  matched_food: string;
  food_id?: string;
  per100g: Per100g;
  match_score?: number;
}

/** The number the source published, or `null`. Accepts numeric strings (both
 *  APIs quote their numbers); rejects absence, `null`, `''`, text, NaN, ±∞. */
export function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

export function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

/**
 * The multiplier that turns one serving into 100 g, or `null` when the basis
 * cannot be established. Never returns a fallback: a wrong basis is a wrong
 * carbohydrate.
 */
export function servingFactor(amount: unknown, unit: unknown): number | null {
  const grams = numOrNull(amount);
  const u = String(unit ?? '').trim().toLowerCase();
  if (grams === null || grams <= 0) return null;
  if (u !== 'g' && u !== 'gram' && u !== 'grams') return null;
  return 100 / grams;
}

/** Scale a published value, preserving "not published". */
function scale(v: number | null, factor: number, round: (n: number) => number) {
  return v === null ? null : round(v * factor);
}

/**
 * One FatSecret serving → per-100 g, or `null` when it cannot be expressed
 * that way (unknown basis, or no usable energy).
 */
export function fatSecretPer100g(serving: unknown): Per100g | null {
  if (!serving || typeof serving !== 'object') return null;
  const s = serving as Record<string, unknown>;

  const factor = servingFactor(s.metric_serving_amount, s.metric_serving_unit);
  if (factor === null) return null; // basis unknown → no hit, never a guess

  const calories = numOrNull(s.calories);
  if (calories === null) return null;
  const per100Calories = Math.round(calories * factor);
  // Unchanged gate: a record with no energy is not a usable food record.
  if (!(per100Calories > 0)) return null;

  return {
    calories: per100Calories,
    carbs: scale(numOrNull(s.carbohydrate), factor, round1),
    sugar: scale(numOrNull(s.sugar), factor, round1),
    protein: scale(numOrNull(s.protein), factor, round1),
    fat: scale(numOrNull(s.fat), factor, round1),
    fiber: scale(numOrNull(s.fiber), factor, round1),
    sodium: scale(numOrNull(s.sodium), factor, Math.round), // mg
  };
}

/**
 * Edamam's `nutrients` map → per-100 g. Edamam publishes per 100 g already
 * (`nutrition-type=logging`), so there is no basis to establish — only absence
 * to preserve.
 */
export function edamamPer100g(nutrients: unknown): Per100g | null {
  if (!nutrients || typeof nutrients !== 'object') return null;
  const n = nutrients as Record<string, unknown>;

  const calories = numOrNull(n.ENERC_KCAL);
  if (calories === null || !(calories > 0)) return null;

  return {
    calories: Math.round(calories),
    carbs: scale(numOrNull(n.CHOCDF), 1, round1),
    sugar: scale(numOrNull(n.SUGAR), 1, round1),
    protein: scale(numOrNull(n.PROCNT), 1, round1),
    fat: scale(numOrNull(n.FAT), 1, round1),
    fiber: scale(numOrNull(n.FIBTG), 1, round1),
    sodium: scale(numOrNull(n.NA), 1, Math.round), // mg per 100 g
  };
}
