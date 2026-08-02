import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DENSITY,
  defaultUnitFor,
  densityFor,
  formatPortion,
  gramsToUnit,
  unitOf,
  unitToGrams,
} from '@/services/nutrition/portionUnit';
import type { FoodItemResult } from '@/types';

/**
 * CHARACTERIZATION — `nutrition/portionUnit`.
 *
 * A patient can now write a portion in millilitres instead of grams, per food.
 * The reason this file exists is the one invariant that makes that safe:
 *
 *   SWITCHING THE UNIT MUST NOT CHANGE HOW MUCH FOOD THERE IS.
 *
 * Every nutrition value in the app is per 100 GRAMS and the bolus is seeded
 * from grams of carbohydrate. A unit toggle that re-weighed the plate would
 * change a dose while looking like a formatting preference — so the round trip
 * is asserted directly, not inferred from the UI.
 */

const item = (over: Partial<FoodItemResult> = {}): FoodItemResult =>
  ({
    name: 'Test',
    portion_grams: 100,
    calories: 0,
    carbohydrates: 0,
    sugar: 0,
    protein: 0,
    fat: 0,
    fiber: 0,
    source: 'ai',
    detection_confidence: 1,
    nutrition_confidence: 1,
    ...over,
  }) as FoodItemResult;

describe('densityFor — only genuinely non-water liquids are named', () => {
  it('falls back to water for anything unlisted', () => {
    expect(densityFor({ search_name: 'chicken breast' })).toBe(DEFAULT_DENSITY);
    expect(densityFor({ search_name: 'couscous' })).toBe(1.0);
    expect(densityFor({})).toBe(1.0);
  });

  it('knows the fats and the syrups, the real deviations', () => {
    expect(densityFor({ search_name: 'olive oil' })).toBe(0.91);
    expect(densityFor({ search_name: 'oil' })).toBe(0.92);
    expect(densityFor({ search_name: 'honey' })).toBe(1.42);
  });

  it('reads the ENGLISH search_name, which the vision model always returns', () => {
    // display_name may be in any language; search_name is the contract.
    expect(densityFor({ name: 'Lait entier', search_name: 'milk' })).toBe(1.03);
  });

  it('prefers the more specific keyword when both match', () => {
    // "olive oil" must not resolve through the bare "oil" entry.
    expect(densityFor({ search_name: 'olive oil' })).toBe(0.91);
    expect(densityFor({ search_name: 'condensed milk' })).toBe(1.29);
  });

  it('never returns zero or a negative, which would divide by zero downstream', () => {
    for (const n of ['', 'water', 'oil', 'honey', 'milk', 'zzz']) {
      expect(densityFor({ search_name: n })).toBeGreaterThan(0);
    }
  });
});

describe('defaultUnitFor — only a Drink is a liquid by definition', () => {
  it('gives a drink ml', () => {
    expect(defaultUnitFor({ category: 'Drink' })).toBe('ml');
  });

  it('leaves everything else in grams, including soup and sauce', () => {
    expect(defaultUnitFor({ category: 'Soup' })).toBe('g');
    expect(defaultUnitFor({ category: 'Sauce' })).toBe('g');
    expect(defaultUnitFor({ category: 'Protein' })).toBe('g');
    expect(defaultUnitFor({})).toBe('g');
  });
});

describe('unitOf — an explicit choice always wins over the default', () => {
  it('uses the food own unit when it carries one', () => {
    expect(unitOf(item({ category: 'Drink', portion_unit: 'g' }))).toBe('g');
    expect(unitOf(item({ category: 'Protein', portion_unit: 'ml' }))).toBe('ml');
  });

  it('falls back to the category default when absent (items written before the field)', () => {
    expect(unitOf(item({ category: 'Drink' }))).toBe('ml');
    expect(unitOf(item({ category: 'Rice' }))).toBe('g');
  });
});

describe('THE INVARIANT — a unit switch re-expresses a portion, never re-weighs it', () => {
  it('grams → ml → grams returns the same grams for water-like foods', () => {
    const d = 1.0;
    for (const grams of [5, 50, 100, 250, 330, 500, 2000]) {
      const ml = gramsToUnit(grams, 'ml', d);
      expect(unitToGrams(ml, 'ml', d)).toBe(grams);
    }
  });

  it('holds for a real non-unit density too, within rounding', () => {
    const d = densityFor({ search_name: 'milk' }); // 1.03
    for (const grams of [100, 250, 500]) {
      const ml = gramsToUnit(grams, 'ml', d);
      // ml is rounded for display, so grams comes back within half a ml of food.
      expect(Math.abs(unitToGrams(ml, 'ml', d) - grams)).toBeLessThanOrEqual(d / 2);
    }
  });

  it('100 g of milk reads as 97 ml — the same milk, written differently', () => {
    const d = densityFor({ search_name: 'milk' });
    expect(gramsToUnit(100, 'ml', d)).toBe(97);
    // And it is still ~100 g of milk, so nothing downstream moves.
    expect(Math.round(unitToGrams(97, 'ml', d))).toBe(100);
  });

  it('grams are the identity — no conversion is applied in g', () => {
    expect(gramsToUnit(137.4, 'g', 1.03)).toBe(137);
    expect(unitToGrams(137, 'g', 1.03)).toBe(137);
  });

  it('a zero or negative density cannot divide by zero — it falls back to water', () => {
    expect(gramsToUnit(100, 'ml', 0)).toBe(100);
    expect(unitToGrams(100, 'ml', -1)).toBe(100);
  });
});

describe('formatPortion — one sentence for every screen', () => {
  it('writes a drink in ml by default', () => {
    expect(formatPortion(item({ name: 'Cola', search_name: 'cola', category: 'Drink', portion_grams: 260 }))).toBe(
      '250 ml'
    );
  });

  it('writes a solid in grams', () => {
    expect(formatPortion(item({ name: 'Rice', category: 'Rice', portion_grams: 180 }))).toBe('180 g');
  });

  it('honours an explicit unit against the category default', () => {
    expect(
      formatPortion(item({ name: 'Yogurt', search_name: 'yogurt', category: 'Dairy', portion_grams: 103, portion_unit: 'ml' }))
    ).toBe('100 ml');
  });

  it('rounds — a portion nobody measured must not read to three decimals', () => {
    expect(formatPortion(item({ portion_grams: 137.49 }))).toBe('137 g');
  });
});
