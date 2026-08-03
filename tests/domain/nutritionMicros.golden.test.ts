import { describe, expect, it } from 'vitest';

import { buildHighlights, glycemicLoad } from '@/services/nutrition/advice';
import {
  estimateMealWaterMl,
  estimateMicros,
  microAverage,
} from '@/services/nutrition/micros';
import { dailyWaterNeedMl } from '@/services/nutrition/hydration';
import type { FoodCategory, FoodItemResult } from '@/types';

/**
 * CHARACTERIZATION — portion-based micronutrients, hydration and meal
 * highlights. Both modules are pure (type-only imports), so nothing is mocked.
 *
 * The micronutrient figures are category-density ESTIMATES by construction, not
 * measurements; these tests pin the arithmetic, not its nutritional validity.
 */

function item(
  category: FoodCategory | undefined,
  portion_grams: number,
  overrides: Partial<FoodItemResult> = {}
): FoodItemResult {
  return {
    name: 'x',
    category,
    portion_grams,
    calories: 0,
    carbohydrates: 0,
    sugar: 0,
    protein: 0,
    fat: 0,
    fiber: 0,
    source: 'usda',
    detection_confidence: 1,
    nutrition_confidence: 1,
    ...overrides,
  };
}

describe('estimateMicros', () => {
  it('returns zero coverage for an empty plate', () => {
    expect(estimateMicros([])).toEqual({ a: 0, c: 0, fe: 0, ca: 0, k: 0 });
  });

  it('converts category density × grams into a share of the daily reference intake', () => {
    // 100 g Vegetable → A 200 µg / 900, C 30 / 90, Fe 1.2 / 18, Ca 45 / 1000, K 300 / 3500
    expect(estimateMicros([item('Vegetable', 100)])).toEqual({
      a: 22,
      c: 33,
      fe: 7,
      ca: 5,
      k: 9,
    });
  });

  it('scales linearly with the portion', () => {
    const single = estimateMicros([item('Vegetable', 100)]);
    const double = estimateMicros([item('Vegetable', 200)]);
    expect(double.c).toBe(67); // 60 / 90 → 66.7
    expect(double.a).toBeGreaterThan(single.a);
  });

  it('sums across the foods on the plate', () => {
    const combined = estimateMicros([item('Vegetable', 100), item('Fruit', 100)]);
    expect(combined.c).toBe(72); // (30 + 35) / 90
  });

  it('clamps each nutrient at 100 % of the daily intake', () => {
    const m = estimateMicros([item('Vegetable', 5000)]);
    expect(m).toEqual({ a: 100, c: 100, fe: 100, ca: 100, k: 100 });
  });

  it('treats a negative portion as zero rather than subtracting', () => {
    expect(estimateMicros([item('Vegetable', -500)])).toEqual({ a: 0, c: 0, fe: 0, ca: 0, k: 0 });
  });

  it('falls back to the Unknown density for a missing or unrecognised category', () => {
    const none = estimateMicros([item(undefined, 100)]);
    const unknown = estimateMicros([item('Unknown', 100)]);
    const bogus = estimateMicros([item('NotACategory' as FoodCategory, 100)]);
    expect(none).toEqual(unknown);
    expect(bogus).toEqual(unknown);
  });

  it('excludes a food no database could identify, matching the zeroed macros', () => {
    const withUnidentified = estimateMicros([
      item('Vegetable', 100),
      item('Vegetable', 100, { nutrition_confidence: 0 }),
    ]);
    expect(withUnidentified).toEqual(estimateMicros([item('Vegetable', 100)]));
  });

  it('does NOT exclude a merely low-confidence food', () => {
    // The gate is exactly 0, not "low" — 0.1 still contributes in full.
    const m = estimateMicros([item('Vegetable', 100, { nutrition_confidence: 0.1 })]);
    expect(m.c).toBe(33);
  });

  it('FIXED IN STEP 22B — NaN grams contribute nothing instead of NaN', () => {
    // BEFORE (recorded green against the pre-Step-22B tree): `Math.max(0, NaN)`
    // is NaN and every clamp comparison against NaN is false, so one such food
    // turned every vitamin bar into NaN.
    // AFTER: a portion that is not a usable quantity is skipped, exactly as an
    // unidentified food already was (finding NUTR-B2). No valid plate moves.
    const m = estimateMicros([item('Vegetable', Number.NaN)]);
    expect(m.c).toBe(0);
    expect(estimateMicros([item('Vegetable', 100), item('Vegetable', Number.NaN)])).toEqual(
      estimateMicros([item('Vegetable', 100)])
    );
  });
});

describe('microAverage', () => {
  it('averages the five coverages', () => {
    expect(microAverage({ a: 10, c: 20, fe: 30, ca: 40, k: 50 })).toBe(30);
    expect(microAverage({ a: 0, c: 0, fe: 0, ca: 0, k: 0 })).toBe(0);
  });

  it('does not round', () => {
    expect(microAverage({ a: 1, c: 1, fe: 1, ca: 1, k: 2 })).toBeCloseTo(1.2, 5);
  });
});

describe('estimateMealWaterMl', () => {
  it('returns zero for an empty plate', () => {
    expect(estimateMealWaterMl([])).toBe(0);
  });

  it('applies the category water fraction to the grams (1 g ≈ 1 ml)', () => {
    expect(estimateMealWaterMl([item('Vegetable', 100)])).toBe(92);
    expect(estimateMealWaterMl([item('Bread', 100)])).toBe(35);
    expect(estimateMealWaterMl([item('Snack', 100)])).toBe(10);
  });

  it('sums across foods and rounds once at the end', () => {
    expect(estimateMealWaterMl([item('Vegetable', 150), item('Bread', 55)])).toBe(157); // 138 + 19.25
  });

  it('applies the same unidentified and negative-portion rules as the micronutrients', () => {
    expect(estimateMealWaterMl([item('Vegetable', 100, { nutrition_confidence: 0 })])).toBe(0);
    expect(estimateMealWaterMl([item('Vegetable', -100)])).toBe(0);
  });
});

/* `waterGoalMl` moved to `nutrition/hydration` as `dailyWaterNeedMl` when age
   was added to it. The cases below are the original ones, re-pointed, plus the
   age band that is the reason for the move. */
describe('dailyWaterNeedMl', () => {
  it('uses ~35 ml per kg for an adult, rounded to the nearest 50 ml', () => {
    expect(dailyWaterNeedMl(70, 40)).toBe(2450);
    expect(dailyWaterNeedMl(71, 40)).toBe(2500); // 2485 → 2500
  });

  it('clamps to the 1500–4000 ml band', () => {
    expect(dailyWaterNeedMl(30, 40)).toBe(1500);
    expect(dailyWaterNeedMl(200, 40)).toBe(4000);
  });

  it('falls back to 2000 ml when the weight is unknown, zero or NaN', () => {
    expect(dailyWaterNeedMl(undefined, 40)).toBe(2000);
    expect(dailyWaterNeedMl(0, 40)).toBe(2000);
    expect(dailyWaterNeedMl(Number.NaN, 40)).toBe(2000);
  });

  it('CHANGED — a negative weight is treated as no data, not multiplied', () => {
    // Previously -70 became -2450 and was clamped UP to 1500, which looked
    // like a computed target. It is now the same "no weight" case as above.
    expect(dailyWaterNeedMl(-70, 40)).toBe(2000);
  });

  it('falls with age — the reason this function moved', () => {
    // Same 80 kg patient: 35 ml/kg as an adult, 30 past 55, 25 past 65.
    expect(dailyWaterNeedMl(80, 40)).toBe(2800);
    expect(dailyWaterNeedMl(80, 60)).toBe(2400);
    expect(dailyWaterNeedMl(80, 80)).toBe(2000);
  });
});

describe('glycemicLoad', () => {
  it('buckets GL below 10 as Low, 10–20 as Medium, above 20 as High', () => {
    expect(glycemicLoad(10, 50)).toBe('Low'); // GL 5
    expect(glycemicLoad(20, 50)).toBe('Medium'); // GL 10 — inclusive lower edge
    expect(glycemicLoad(40, 50)).toBe('Medium'); // GL 20 — inclusive upper edge
    expect(glycemicLoad(41, 50)).toBe('High'); // GL 20.5
  });

  it('assumes a moderate GI of 55 when none is known', () => {
    expect(glycemicLoad(20, 0)).toBe('Medium'); // 55 × 20 / 100 = 11
    expect(glycemicLoad(20, -10)).toBe('Medium'); // negative also falls back
  });

  it('reports Low for a zero-carb plate', () => {
    expect(glycemicLoad(0, 100)).toBe('Low');
  });

  it('reports Low for negative carbs rather than rejecting them', () => {
    expect(glycemicLoad(-50, 50)).toBe('Low');
  });
});

describe('buildHighlights', () => {
  const base = {
    calories: 0,
    carbs: 0,
    sugar: 0,
    protein: 0,
    fat: 0,
    fiber: 0,
    glycemic_index: 0,
  };

  it('emits positives before attention points', () => {
    const h = buildHighlights({ ...base, protein: 30, carbs: 100, glycemic_index: 80 });
    expect(h.indexOf('high_protein')).toBeLessThan(h.indexOf('high_glycemic_load'));
  });

  it('applies each positive threshold at its boundary', () => {
    expect(buildHighlights({ ...base, protein: 25 })).toContain('high_protein');
    expect(buildHighlights({ ...base, protein: 24.9 })).not.toContain('high_protein');
    expect(buildHighlights({ ...base, fiber: 6 })).toContain('high_fiber');
    expect(buildHighlights({ ...base, sugar: 5 })).toContain('low_sugar');
    expect(buildHighlights({ ...base, sugar: 5.1 })).not.toContain('low_sugar');
  });

  it('applies each attention threshold at its boundary', () => {
    expect(buildHighlights({ ...base, sugar: 30.1 })).toContain('high_sugar');
    expect(buildHighlights({ ...base, sugar: 30 })).not.toContain('high_sugar');
    expect(buildHighlights({ ...base, carbs: 75.1 })).toContain('carb_heavy');
    expect(buildHighlights({ ...base, protein: 9.9 })).toContain('low_protein');
    expect(buildHighlights({ ...base, protein: 10 })).not.toContain('low_protein');
    expect(buildHighlights({ ...base, sodium: 1001 })).toContain('high_sodium');
  });

  it('requires carbs above 30 before calling the fibre low', () => {
    expect(buildHighlights({ ...base, fiber: 0, carbs: 30 })).not.toContain('low_fiber');
    expect(buildHighlights({ ...base, fiber: 0, carbs: 31 })).toContain('low_fiber');
  });

  it('marks a plate vegetable-rich for Vegetable or Legumes', () => {
    expect(buildHighlights({ ...base, categories: ['Vegetable'] })).toContain('vegetable_rich');
    expect(buildHighlights({ ...base, categories: ['Legumes'] })).toContain('vegetable_rich');
    expect(buildHighlights({ ...base, categories: ['Rice'] })).not.toContain('vegetable_rich');
  });

  it('needs three distinct non-Unknown groups for balanced_meal', () => {
    const m = { ...base, protein: 20, fiber: 5, sugar: 10 };
    expect(
      buildHighlights({ ...m, categories: ['Protein', 'Vegetable', 'Rice'] })
    ).toContain('balanced_meal');
    expect(
      buildHighlights({ ...m, categories: ['Protein', 'Vegetable', 'Unknown'] })
    ).not.toContain('balanced_meal');
    expect(
      buildHighlights({ ...m, categories: ['Protein', 'Protein', 'Vegetable'] })
    ).not.toContain('balanced_meal');
  });

  /**
   * KNOWN-BAD BASELINE — P8-005
   * An empty or wholly unidentified plate — every macro zero because no
   * database matched — is decorated with two POSITIVE badges: "low glycemic
   * load" and "low sugar". The absence of data is presented as a good result,
   * on the same screen that shows 0 kcal.
   * Owning remediation: RU-3 (provenance in the UI).
   */
  it('KNOWN-BAD BASELINE — P8-005: a zeroed plate earns positive badges', () => {
    expect(buildHighlights(base)).toEqual([
      'low_glycemic_load',
      'low_sugar',
      'low_protein',
    ]);
  });

  it('de-duplicates while preserving order', () => {
    const h = buildHighlights({ ...base, protein: 30, fiber: 8, categories: ['Vegetable'] });
    expect(new Set(h).size).toBe(h.length);
  });
});
