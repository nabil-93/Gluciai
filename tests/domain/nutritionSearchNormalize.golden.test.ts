import { describe, expect, it } from 'vitest';

import {
  edamamPer100g,
  fatSecretPer100g,
  numOrNull,
  round1,
  servingFactor,
} from '../../supabase/functions/nutrition-search/normalize';

/**
 * CHARACTERIZATION — the provider proxy's normalization contract (N-2, N-5).
 *
 * `nutrition-search` is the fallback half of the provider chain: when the
 * internal DB, USDA and Open Food Facts all miss, this is where the plate's
 * carbohydrate comes from. Two of its decisions can produce a wrong dose, and
 * both are asserted here:
 *
 *   1. WHAT A MISSING VALUE MEANS. `numField(v, 0)` used to answer "the source
 *      published nothing" with `0`, which is indistinguishable from the `0`
 *      lean beef genuinely declares. The client refuses to dose an unverifiable
 *      carbohydrate, but it can only refuse what it can see.
 *
 *   2. WHAT BASIS A VALUE WAS PUBLISHED ON. FatSecret publishes per SERVING.
 *      The old conversion fell back to `factor = 1` whenever the serving was
 *      not expressed in grams — i.e. it relabelled per-serving numbers as
 *      per-100 g ones, and the client then multiplied them by the portion
 *      again. The basis is now either known or the hit is dropped.
 */

describe('numOrNull — did the source publish a number?', () => {
  it('accepts numbers and quoted numbers, including a genuine zero', () => {
    expect(numOrNull(44.5)).toBe(44.5);
    expect(numOrNull('44.5')).toBe(44.5); // both APIs quote their numbers
    expect(numOrNull(0)).toBe(0);
    expect(numOrNull('0')).toBe(0);
  });

  it('rejects every shape of absence and every non-number', () => {
    expect(numOrNull(undefined)).toBeNull();
    expect(numOrNull(null)).toBeNull();
    expect(numOrNull('')).toBeNull();
    expect(numOrNull('n/a')).toBeNull();
    expect(numOrNull(true)).toBeNull();
    expect(numOrNull(NaN)).toBeNull();
    expect(numOrNull(Infinity)).toBeNull();
  });

  it('rounds to one decimal exactly as before', () => {
    expect(round1(28.16)).toBe(28.2);
    expect(round1(0)).toBe(0);
  });
});

describe('servingFactor — the conversion basis, or nothing (N-5)', () => {
  it('converts a gram serving', () => {
    expect(servingFactor(158, 'g')).toBeCloseTo(100 / 158, 10);
    expect(servingFactor('158', 'g')).toBeCloseTo(100 / 158, 10);
    expect(servingFactor(100, 'g')).toBe(1);
  });

  it('accepts the gram unit however it is spelled or cased', () => {
    for (const u of ['g', 'G', ' g ', 'gram', 'grams', 'Grams']) {
      expect(servingFactor(200, u)).toBe(0.5);
    }
  });

  it('refuses a serving measured in anything but grams', () => {
    // A millilitre becomes a gram only through a density this code does not
    // have (water 1.0, oil 0.92, honey 1.42). Guessing one would be the same
    // class of error in a new disguise.
    for (const u of ['ml', 'oz', 'cup', 'serving', 'tbsp', '']) {
      expect(servingFactor(240, u)).toBeNull();
    }
  });

  it('refuses an unusable or absent amount', () => {
    expect(servingFactor(undefined, 'g')).toBeNull();
    expect(servingFactor(null, 'g')).toBeNull();
    expect(servingFactor(0, 'g')).toBeNull();
    expect(servingFactor(-158, 'g')).toBeNull();
    expect(servingFactor('beaucoup', 'g')).toBeNull();
    expect(servingFactor(NaN, 'g')).toBeNull();
  });
});

describe('fatSecretPer100g — a serving, converted or refused', () => {
  /** A real FatSecret serving: 1 cup of cooked white rice, 158 g. */
  const riceCup = {
    serving_description: '1 cup',
    metric_serving_amount: '158.000',
    metric_serving_unit: 'g',
    calories: '205',
    carbohydrate: '44.500',
    sugar: '0.080',
    protein: '4.250',
    fat: '0.440',
    fiber: '0.600',
    sodium: '1.000',
  };

  it('converts a GRAM serving to per-100 g', () => {
    const p = fatSecretPer100g(riceCup)!;
    expect(p).toEqual({
      calories: 130, // round(205 × 100/158)
      carbs: 28.2, // round1(44.5 × 100/158)
      sugar: 0.1,
      protein: 2.7,
      fat: 0.3,
      fiber: 0.4,
      sodium: 1,
    });
  });

  it('emits NO HIT for a serving whose basis is not grams (N-5)', () => {
    // Before: `factor` fell back to 1 and these per-serving numbers were
    // emitted as per-100 g — a 240 ml glass at 26 g of carbohydrate became
    // "26 g per 100 g", which the client then multiplied by 240 g of portion.
    expect(fatSecretPer100g({ ...riceCup, metric_serving_amount: 240, metric_serving_unit: 'ml' }))
      .toBeNull();
    expect(fatSecretPer100g({ ...riceCup, metric_serving_unit: 'oz' })).toBeNull();
    expect(fatSecretPer100g({ ...riceCup, metric_serving_unit: 'cup' })).toBeNull();
  });

  it('emits no hit when the basis is absent or unusable', () => {
    expect(fatSecretPer100g({ ...riceCup, metric_serving_amount: undefined })).toBeNull();
    expect(fatSecretPer100g({ ...riceCup, metric_serving_amount: null })).toBeNull();
    expect(fatSecretPer100g({ ...riceCup, metric_serving_amount: 0 })).toBeNull();
    expect(fatSecretPer100g({ ...riceCup, metric_serving_unit: undefined })).toBeNull();
    expect(fatSecretPer100g(undefined)).toBeNull();
    expect(fatSecretPer100g('1 cup')).toBeNull();
  });

  it('reports an UNPUBLISHED carbohydrate as null, never as 0 (N-2)', () => {
    expect(fatSecretPer100g({ ...riceCup, carbohydrate: undefined })!.carbs).toBeNull();
    expect(fatSecretPer100g({ ...riceCup, carbohydrate: null })!.carbs).toBeNull();
    expect(fatSecretPer100g({ ...riceCup, carbohydrate: '' })!.carbs).toBeNull();
    expect(fatSecretPer100g({ ...riceCup, carbohydrate: 'n/a' })!.carbs).toBeNull();
    expect(fatSecretPer100g({ ...riceCup, carbohydrate: NaN })!.carbs).toBeNull();
  });

  it('preserves a PUBLISHED 0 g — lean beef really does declare zero', () => {
    const beef = fatSecretPer100g({
      metric_serving_amount: 100,
      metric_serving_unit: 'g',
      calories: 250,
      carbohydrate: 0,
      protein: 26,
      fat: 15,
    })!;
    expect(beef.carbs).toBe(0);
    expect(beef.carbs).not.toBeNull();
    // …while the values this source truly did not publish stay absent.
    expect(beef.sugar).toBeNull();
    expect(beef.fiber).toBeNull();
    expect(beef.sodium).toBeNull();
  });

  it('scales a published 0 to 0, not to null', () => {
    const p = fatSecretPer100g({ ...riceCup, carbohydrate: 0 })!;
    expect(p.carbs).toBe(0);
  });

  it('passes an IMPLAUSIBLE figure through instead of clamping it', () => {
    // 500 g of carbohydrate in 100 g of food is impossible. Clamping it here
    // would hand the client a plausible-looking number it would then trust;
    // passing it through lets the client's bounds layer (Step 11a) mark it
    // untrusted and NAME the food.
    const p = fatSecretPer100g({
      metric_serving_amount: 100,
      metric_serving_unit: 'g',
      calories: 400,
      carbohydrate: 500,
    })!;
    expect(p.carbs).toBe(500);
  });

  it('keeps the unchanged no-energy rule', () => {
    // A record with no calories is not a usable food record — the engine falls
    // through to the next provider, exactly as before.
    expect(fatSecretPer100g({ ...riceCup, calories: undefined })).toBeNull();
    expect(fatSecretPer100g({ ...riceCup, calories: 0 })).toBeNull();
    expect(fatSecretPer100g({ ...riceCup, calories: 'abc' })).toBeNull();
  });
});

describe('edamamPer100g — already per 100 g, absence preserved', () => {
  const apple = {
    ENERC_KCAL: 52,
    CHOCDF: 13.81,
    SUGAR: 10.39,
    PROCNT: 0.26,
    FAT: 0.17,
    FIBTG: 2.4,
    NA: 1,
  };

  it('passes a full record through unchanged, at one decimal', () => {
    expect(edamamPer100g(apple)).toEqual({
      calories: 52,
      carbs: 13.8,
      sugar: 10.4,
      protein: 0.3,
      fat: 0.2,
      fiber: 2.4,
      sodium: 1,
    });
  });

  it('reports an unpublished carbohydrate as null (N-2)', () => {
    expect(edamamPer100g({ ...apple, CHOCDF: undefined })!.carbs).toBeNull();
    expect(edamamPer100g({ ...apple, CHOCDF: null })!.carbs).toBeNull();
    expect(edamamPer100g({ ENERC_KCAL: 52 })!.carbs).toBeNull();
  });

  it('preserves a published 0 and an implausible figure alike', () => {
    expect(edamamPer100g({ ...apple, CHOCDF: 0 })!.carbs).toBe(0);
    expect(edamamPer100g({ ...apple, CHOCDF: 500 })!.carbs).toBe(500);
  });

  it('keeps the unchanged no-energy rule', () => {
    expect(edamamPer100g({ ...apple, ENERC_KCAL: 0 })).toBeNull();
    expect(edamamPer100g({ ...apple, ENERC_KCAL: undefined })).toBeNull();
    expect(edamamPer100g(undefined)).toBeNull();
  });
});
