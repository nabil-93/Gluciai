import { describe, expect, it } from 'vitest';

import {
  DEFAULT_DENSITY,
  amountAfterUnitSwitch,
  defaultUnitFor,
  densityFor,
  formatPortion,
  gramsToUnit,
  isLiquid,
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

describe('isLiquid — who gets the g/ml picker at all', () => {
  it('a Drink is a liquid by category, whatever it is called', () => {
    expect(isLiquid({ category: 'Drink' })).toBe(true);
    expect(isLiquid({ category: 'Drink', name: 'Something' })).toBe(true);
  });

  it('names a poured food even outside the Drink category', () => {
    // The screenshot that prompted this: olive oil is not a "Drink".
    expect(isLiquid({ search_name: 'olive oil' })).toBe(true);
    expect(isLiquid({ search_name: 'milk' })).toBe(true);
    expect(isLiquid({ search_name: 'orange juice' })).toBe(true);
    expect(isLiquid({ search_name: 'water' })).toBe(true);
  });

  it('leaves solids alone — no picker on a steak', () => {
    expect(isLiquid({ search_name: 'chicken breast', category: 'Protein' })).toBe(false);
    expect(isLiquid({ search_name: 'white rice', category: 'Rice' })).toBe(false);
    expect(isLiquid({ search_name: 'bread', category: 'Bread' })).toBe(false);
    // Spooned, not poured.
    expect(isLiquid({ search_name: 'yogurt', category: 'Dairy' })).toBe(false);
  });

  it('recognises a hand-typed liquid in the app own languages', () => {
    // A manually added row has no English search_name — only what the patient
    // typed. Being wrong here costs a button, not a number.
    expect(isLiquid({ name: "Huile d'olive extra vierge" })).toBe(true);
    expect(isLiquid({ name: 'Lait demi-écrémé' })).toBe(true);
    expect(isLiquid({ name: 'حليب' })).toBe(true);
  });

  it('sees German compounds, which glue the head noun on the end', () => {
    expect(isLiquid({ name: 'Olivenöl' })).toBe(true);
    expect(isLiquid({ name: 'Vollmilch' })).toBe(true);
    expect(isLiquid({ name: 'Orangensaft' })).toBe(true);
    expect(isLiquid({ name: 'Mineralwasser' })).toBe(true);
  });

  it('does NOT extend the compound rule to French, where it would be a disaster', () => {
    // "eau" ends gâteau, chapeau, morceau — the reason the two lists are apart.
    expect(isLiquid({ name: 'Gâteau au chocolat' })).toBe(false);
    expect(isLiquid({ name: 'Morceau de pain' })).toBe(false);
  });

  it('an empty row is not a liquid — an unnamed food shows no picker', () => {
    expect(isLiquid({})).toBe(false);
    expect(isLiquid({ name: '   ' })).toBe(false);
  });

  it('matches WHOLE WORDS — the substring trap that shipped for ten minutes', () => {
    // Every one of these was a false positive when the lookup used
    // String.includes: a solid offering a millilitre switch.
    expect(isLiquid({ search_name: 'steak' })).toBe(false); // contains "tea"
    expect(isLiquid({ search_name: 'watermelon' })).toBe(false); // contains "water"
    expect(isLiquid({ search_name: 'boiled egg' })).toBe(false); // contains "oil"
    expect(isLiquid({ search_name: 'teabread' })).toBe(false);
    // …while the real phrases still match.
    expect(isLiquid({ search_name: 'green tea' })).toBe(true);
    expect(isLiquid({ search_name: 'sparkling water' })).toBe(true);
  });

  it('density obeys the same word boundary, so a solid never converts', () => {
    expect(densityFor({ search_name: 'steak' })).toBe(DEFAULT_DENSITY);
    expect(densityFor({ search_name: 'boiled egg' })).toBe(DEFAULT_DENSITY);
    expect(densityFor({ search_name: 'extra virgin olive oil' })).toBe(0.91);
  });
});

describe('defaultUnitFor — a poured food arrives in ml with no tap required', () => {
  it('gives every liquid ml', () => {
    expect(defaultUnitFor({ category: 'Drink' })).toBe('ml');
    expect(defaultUnitFor({ search_name: 'olive oil' })).toBe('ml');
    expect(defaultUnitFor({ name: "Huile d'olive" })).toBe('ml');
  });

  it('leaves everything else in grams', () => {
    expect(defaultUnitFor({ category: 'Soup' })).toBe('g');
    expect(defaultUnitFor({ category: 'Protein', search_name: 'steak' })).toBe('g');
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

describe('amountAfterUnitSwitch — an established food converts, a typed one does not', () => {
  const milk = densityFor({ search_name: 'milk' }); // 1.03
  const oil = densityFor({ search_name: 'olive oil' }); // 0.91

  it('re-expresses a food the scanner already resolved', () => {
    expect(amountAfterUnitSwitch(100, 'g', 'ml', milk, true)).toBe(97);
    expect(amountAfterUnitSwitch(97, 'ml', 'g', milk, true)).toBe(100);
  });

  it('leaves a food still being typed exactly as typed', () => {
    // Someone who types 700 and picks ml means 700 ml, not the 769 that
    // converting 700 g would produce. This reaches the SAVED GRAMS.
    expect(amountAfterUnitSwitch(700, 'g', 'ml', oil, false)).toBe(700);
    expect(amountAfterUnitSwitch(100, 'g', 'ml', milk, false)).toBe(100);
  });

  it('and those two really do save different amounts of food', () => {
    const typed = unitToGrams(amountAfterUnitSwitch(700, 'g', 'ml', oil, false), 'ml', oil);
    const converted = unitToGrams(amountAfterUnitSwitch(700, 'g', 'ml', oil, true), 'ml', oil);
    expect(Math.round(typed)).toBe(637); // 700 ml of oil
    expect(Math.round(converted)).toBe(700); // still the 700 g it was
    expect(typed).not.toBe(converted);
  });

  it('a switch to the same unit is a no-op either way', () => {
    expect(amountAfterUnitSwitch(250, 'ml', 'ml', milk, true)).toBe(250);
    expect(amountAfterUnitSwitch(250, 'g', 'g', milk, false)).toBe(250);
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

  it('honours an explicit unit against the default', () => {
    // Plain yogurt is spooned, so it is NOT in the liquids table and converts
    // at water density — the explicit ml is still honoured.
    expect(
      formatPortion(item({ name: 'Yogurt', search_name: 'yogurt', category: 'Dairy', portion_grams: 103, portion_unit: 'ml' }))
    ).toBe('103 ml');
    // And a liquid can be forced back to grams.
    expect(
      formatPortion(item({ name: 'Olive oil', search_name: 'olive oil', portion_grams: 700, portion_unit: 'g' }))
    ).toBe('700 g');
  });

  it('a scanned oil comes out in ml on its own, at its real density', () => {
    // 700 g of olive oil is ~769 ml — the plate is unchanged, the wording is not.
    expect(formatPortion(item({ name: "Huile d'olive extra vierge", search_name: 'olive oil', portion_grams: 700 }))).toBe(
      '769 ml'
    );
  });

  it('rounds — a portion nobody measured must not read to three decimals', () => {
    expect(formatPortion(item({ portion_grams: 137.49 }))).toBe('137 g');
  });
});
