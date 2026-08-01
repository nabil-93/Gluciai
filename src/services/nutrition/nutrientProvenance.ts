import type { FoodItemResult } from '@/types';

import { carbStatus, type CarbStatus } from './carbProvenance';

/* ────────────────────────────────────────────────────────────
 * UNKNOWN vs ZERO, FOR EVERY NUTRIENT (finding NUTR-B1, Step 22B)
 *
 * Step 10 answered this question for the CARBOHYDRATE, because that is what a
 * dose is computed from: `carbs_known` says whether the number beside it is a
 * value or a placeholder. The other six nutrients kept the old contract — an
 * absent protein and a declared 0 g of protein arrived at the patient as the
 * same "0 g".
 *
 * This module carries the same distinction for all seven, WITHOUT touching a
 * single number:
 *
 *   · the values stay exactly where they were (an unknown nutrient still holds
 *     its placeholder 0, so every consumer still reads a number and no total,
 *     score, ratio or estimate moves);
 *   · `known` says which of them are real.
 *
 * The carbohydrate deliberately keeps `carbs_known` as its own field and its
 * own reader (`carbStatus`): Step 10's semantics, its fixtures and the dosing
 * path are untouched, and `nutrientStatus` defers to it rather than duplicating
 * it. There is one source of truth per nutrient.
 * ──────────────────────────────────────────────────────────── */

export type NutrientKey =
  | 'calories'
  | 'carbs'
  | 'sugar'
  | 'protein'
  | 'fat'
  | 'fiber'
  | 'sodium';

/** The seven values `readNutriments` looks for, in display order. */
export const NUTRIENT_KEYS: readonly NutrientKey[] = [
  'calories',
  'carbs',
  'sugar',
  'protein',
  'fat',
  'fiber',
  'sodium',
] as const;

/**
 * Which nutrients the source actually declared.
 *
 * `true` = declared (including a declared 0 — bottled water really does hold
 * 0 g of protein). `false` = the source said nothing and the value beside it is
 * a placeholder. An ABSENT key means the producer predates this map: legacy,
 * treated as `indeterminate`, never silently upgraded to known.
 */
export type NutrientKnown = Partial<Record<NutrientKey, boolean>>;

/** Same three-valued vocabulary Step 10 introduced for the carbohydrate. */
export type NutrientStatus = CarbStatus;

/**
 * Build the map from the nullable readings a provider already has. `null` /
 * `undefined` mean the source did not publish the field; a number — including
 * `0` — means it did.
 */
export function knownFrom(
  values: Partial<Record<NutrientKey, number | null | undefined>>
): NutrientKnown {
  const out: NutrientKnown = {};
  for (const key of NUTRIENT_KEYS) {
    if (key in values) out[key] = values[key] !== null && values[key] !== undefined;
  }
  return out;
}

/** Every nutrient declared — for sources that publish a complete record. */
export const ALL_KNOWN: NutrientKnown = Object.freeze(
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, true]))
) as NutrientKnown;

/** Nothing declared — a food no database could identify. */
export const NONE_KNOWN: NutrientKnown = Object.freeze(
  Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, false]))
) as NutrientKnown;

/** What a single food's figure for `key` is worth. */
export function nutrientStatus(
  item:
    | (Partial<Record<'carbs_known', boolean>> & {
        carbohydrates?: number;
        nutrients_known?: NutrientKnown;
      })
    | null
    | undefined,
  key: NutrientKey
): NutrientStatus {
  if (!item) return 'unknown';
  // The carbohydrate answers through Step 10's reader, unchanged.
  if (key === 'carbs') return carbStatus(item);
  const flag = item.nutrients_known?.[key];
  if (flag === true) return 'known';
  if (flag === false) return 'unknown';
  return 'indeterminate'; // written before this map existed
}

/**
 * Plate-level provenance, as strict as `plateCarbStatus`: a total is only a
 * total when EVERY food behind it declared the nutrient. One unknown food makes
 * the sum a floor, and "most of it is known" is not something to present as a
 * measured figure.
 */
export function plateNutrientsKnown(
  items: FoodItemResult[] | null | undefined
): NutrientKnown {
  const list = items ?? [];
  const out: NutrientKnown = {};
  if (list.length === 0) {
    // An empty plate knows nothing — the same answer `plateCarbStatus` gives.
    return { ...NONE_KNOWN };
  }
  for (const key of NUTRIENT_KEYS) {
    const each = list.map((it) => nutrientStatus(it, key));
    out[key] = each.every((s) => s === 'known');
  }
  return out;
}

/**
 * The value for a mirror COLUMN of `meal_scans`, or `null` when the plate does
 * not actually know it.
 *
 * The JSONB `result` keeps the full picture, provenance included; the flat
 * columns beside it are what the dashboard and the doctor report read, and they
 * have nowhere to put "unknown" other than NULL — which every one of them is
 * nullable for. Writing the placeholder 0 instead would put a fabricated figure
 * in a column that reads as fact.
 *
 * Rows written before the provenance map existed carry no flag, so they are
 * left exactly as they are: legacy stays legacy, never upgraded to "known 0".
 *
 * ONE definition, used by both writers — `saveMeal` (online) and the offline
 * queue drain in `sync.ts`. A meal saved on a plane must land on the server
 * saying the same thing as one saved on wifi.
 */
export function mirrorColumn(
  result: { nutrients_known?: NutrientKnown } | null | undefined,
  key: NutrientKey,
  value: number
): number | null {
  return result?.nutrients_known?.[key] === false ? null : value;
}

/* ─────────────────────── AN UNUSABLE PORTION ─────────────────────── */

/**
 * Whether a portion in grams can be multiplied by anything (finding NUTR-B2).
 *
 * `NaN` propagated silently through the whole pipeline: NaN calories, NaN
 * macros, NaN micronutrients — and `scoreMeal`, whose comparisons are all false
 * against NaN, still awarded **100/100**. `Infinity` did the same in the other
 * direction, and a negative portion produced negative calories.
 *
 * This is deliberately NOT a plausibility rule: no upper bound is invented, and
 * a 2 kg portion is as valid as it ever was (Step 11 owns bounds). It only
 * rejects what is not a usable quantity at all.
 */
export function isUsablePortion(grams: unknown): grams is number {
  return typeof grams === 'number' && Number.isFinite(grams) && grams > 0;
}

/* ────────────────── COMPLETENESS, FOR THE PATIENT ────────────────── */

/**
 * What the whole result rests on (finding NUTR-A7). `fieldsFound` was computed
 * *"so the UI can say how complete the entry is"* and then read by nothing;
 * this is that answer, per plate, in the only vocabulary that is honest here.
 *
 * Deliberately NOT a percentage: "86 % complete" implies a denominator that
 * means something nutritionally, and it does not — seven fields are not seven
 * equal facts. The state is qualitative, and `missing` names the gaps.
 */
export type CompletenessState =
  /** Every nutrient of every food came from a source that declared it. */
  | 'declared'
  /** Some did, some did not — the totals below them are floors. */
  | 'partial'
  /** The values are the vision model's own estimate, no database matched. */
  | 'estimated'
  /** Nothing was identified, or no portion can be used. */
  | 'unavailable';

export interface NutritionCompleteness {
  state: CompletenessState;
  /** Nutrients whose plate total is NOT a total (display order). */
  missing: NutrientKey[];
  /** Foods no database identified. */
  unidentified: number;
  /** Grams identified weakly enough that Step 17 already says so. */
  unsureGrams: number;
  /** Foods whose portion cannot be used at all (NaN / ∞ / ≤ 0). */
  invalidPortions: number;
}

/** Below this an identification is weak enough to be worth saying so. The
 *  constant is Step 17's, reused for LABELLING only — no arithmetic depends on
 *  it here, and Step 22B invents no cut-off of its own (finding NUTR-B3). */
export const SURE_CONFIDENCE = 0.5;

export function nutritionCompleteness(
  items: FoodItemResult[] | null | undefined
): NutritionCompleteness {
  const list = items ?? [];
  const known = plateNutrientsKnown(list);
  const missing = NUTRIENT_KEYS.filter((k) => known[k] === false);
  const unidentified = list.filter((it) => it.nutrition_confidence === 0).length;
  const invalidPortions = list.filter(
    (it) => !isUsablePortion(it.portion_grams)
  ).length;
  const unsureGrams = Math.round(
    list
      .filter(
        (it) =>
          it.nutrition_confidence > 0 &&
          it.nutrition_confidence < SURE_CONFIDENCE &&
          isUsablePortion(it.portion_grams)
      )
      .reduce((s, it) => s + it.portion_grams, 0)
  );

  const usable = list.filter(
    (it) => it.nutrition_confidence > 0 && isUsablePortion(it.portion_grams)
  );

  let state: CompletenessState;
  if (list.length === 0 || usable.length === 0) {
    state = 'unavailable';
  } else if (usable.every((it) => it.source === 'ai_estimate')) {
    // No database matched any food: every figure is the model's own estimate.
    state = 'estimated';
  } else if (missing.length > 0 || unidentified > 0 || invalidPortions > 0) {
    state = 'partial';
  } else {
    state = 'declared';
  }

  return { state, missing, unidentified, unsureGrams, invalidPortions };
}
