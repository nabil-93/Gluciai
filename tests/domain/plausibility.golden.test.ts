import { describe, expect, it } from 'vitest';

import {
  GI_MAX,
  MACRO_SUM_MAX,
  PER100G_MAX,
  PORTION_MAX,
  PORTION_MIN,
  checkPer100g,
  clampPortionGrams,
  implausibleNames,
  isCarbsPlausible,
  isPortionPlausible,
  sanitizePer100g,
  type Per100gLike,
} from '@/services/nutrition/plausibility';

/**
 * PHYSICAL BOUNDS — what a nutrition record is allowed to claim.
 *
 * Step 10 separated a measured carbohydrate from a missing one. This layer
 * answers a different question: is the number POSSIBLE? 500 g of carbohydrate
 * in 100 g of product is neither measured nor missing — it is impossible, and
 * before Step 11a it scaled by the portion and seeded a bolus like any other
 * figure.
 *
 * Two properties are asserted throughout, and they are the whole point:
 *   1. An impossible CARBOHYDRATE becomes UNKNOWN, never a clamped
 *      carbohydrate. A 500 quietly rewritten to 100 would still be dosed from.
 *   2. Every other impossible figure is REPORTED and left alone. Silently
 *      editing a displayed number would hide the upstream defect.
 *
 * Real foods sit close to these limits (olive oil 884 kcal, pure salt
 * 39 000 mg sodium, pure sugar 100 g carbs), so each edge is pinned on both
 * sides.
 */

/** A possible record; each test bends exactly one field. */
function base(overrides: Partial<Per100gLike> = {}): Per100gLike {
  return {
    calories: 250,
    carbs: 30,
    sugar: 5,
    protein: 10,
    fat: 8,
    fiber: 3,
    sodium: 400,
    carbs_known: true,
    ...overrides,
  };
}

describe('checkPer100g — per-field limits, both sides of every edge', () => {
  it('accepts a record that breaks nothing', () => {
    expect(checkPer100g(base())).toEqual([]);
  });

  /** Everything at zero, so exactly one field can be pushed to its limit
   *  without a cross-field rule joining in. `sugar` needs carbohydrate to sit
   *  at the maximum too — 100 g of sugar with 0 g of carbs really is
   *  contradictory, and that is asserted separately below. */
  const lean = (field: string): Per100gLike =>
    base({
      calories: 0,
      carbs: field === 'sugar' ? PER100G_MAX.carbs : 0,
      sugar: 0,
      protein: 0,
      fat: 0,
      fiber: 0,
      sodium: 0,
    });

  it.each([
    ['calories', PER100G_MAX.calories],
    ['carbs', PER100G_MAX.carbs],
    ['sugar', PER100G_MAX.sugar],
    ['protein', PER100G_MAX.protein],
    ['fat', PER100G_MAX.fat],
    ['fiber', PER100G_MAX.fiber],
    ['sodium', PER100G_MAX.sodium],
  ] as const)('accepts %s exactly at its maximum and rejects one step past it', (field, max) => {
    expect(checkPer100g({ ...lean(field), [field]: max })).toEqual([]);
    expect(checkPer100g({ ...lean(field), [field]: max + 0.1 })).toEqual([field]);
  });

  it('rejects a negative figure without touching its neighbours', () => {
    expect(checkPer100g(base({ protein: -1 }))).toEqual(['protein']);
  });

  it('rejects NaN and Infinity — a non-number is not a measurement', () => {
    expect(checkPer100g(base({ carbs: NaN }))).toContain('carbs');
    expect(checkPer100g(base({ calories: Infinity }))).toContain('calories');
    expect(checkPer100g(base({ fat: -Infinity }))).toContain('fat');
  });

  it('rejects a non-numeric value that only TypeScript believed was a number', () => {
    // The whole reason this layer exists: the type says `number`, the payload
    // says otherwise.
    expect(checkPer100g(base({ carbs: '30' as unknown as number }))).toContain('carbs');
  });

  it('treats an ABSENT optional field as possible, not implausible', () => {
    // Step 10's rule: absence is a provenance question, not a bounds question.
    expect(checkPer100g(base({ sodium: undefined }))).toEqual([]);
    expect(checkPer100g(base({ glycemic_index: undefined }))).toEqual([]);
  });

  it('bounds the glycemic index at the catalogue ceiling', () => {
    expect(checkPer100g(base({ glycemic_index: GI_MAX }))).toEqual([]);
    expect(checkPer100g(base({ glycemic_index: GI_MAX + 1 }))).toEqual(['glycemic_index']);
  });
});

describe('checkPer100g — real foods near the limits must PASS', () => {
  it('olive oil: 884 kcal and 100 g of fat', () => {
    expect(
      checkPer100g({ calories: 884, carbs: 0, sugar: 0, protein: 0, fat: 100, fiber: 0, carbs_known: true })
    ).toEqual([]);
  });

  it('pure table salt: ~39 000 mg of sodium per 100 g', () => {
    expect(
      checkPer100g({ calories: 0, carbs: 0, sugar: 0, protein: 0, fat: 0, fiber: 0, sodium: 39_000, carbs_known: true })
    ).toEqual([]);
  });

  it('pure sugar: 100 g of carbohydrate that is 100 g of sugar', () => {
    expect(
      checkPer100g({ calories: 400, carbs: 100, sugar: 100, protein: 0, fat: 0, fiber: 0, carbs_known: true })
    ).toEqual([]);
  });

  it('wheat bran: EU labelling puts FIBRE far above carbohydrate', () => {
    // Deliberately NOT flagged. In EU labelling carbohydrate excludes fibre,
    // so `fibre <= carbs` would fail on a correct record — which is why that
    // rule is not implemented. Pinned so it is not "helpfully" added later.
    expect(
      checkPer100g({ calories: 216, carbs: 3.8, sugar: 0.4, protein: 15.6, fat: 4.2, fiber: 43, carbs_known: true })
    ).toEqual([]);
  });

  it('a spirit: energy far above 4/4/9 of its macros', () => {
    // Also deliberately not flagged: alcohol is ~7 kcal/g, so an energy-vs-
    // macros identity would report every alcoholic drink as impossible.
    expect(
      checkPer100g({ calories: 231, carbs: 0, sugar: 0, protein: 0, fat: 0, fiber: 0, carbs_known: true })
    ).toEqual([]);
  });
});

describe('checkPer100g — cross-field rules', () => {
  it('accepts macros summing exactly to the allowance and rejects past it', () => {
    const at = base({ protein: 50, carbs: 40, fat: 11, sugar: 0, fiber: 0 }); // 101
    expect(checkPer100g(at)).toEqual([]);
    expect(checkPer100g({ ...at, fat: 11.5 })).toEqual(['macro_sum']);
    expect(MACRO_SUM_MAX).toBe(101);
  });

  it('flags sugar above carbohydrate, with rounding slack', () => {
    expect(checkPer100g(base({ carbs: 10, sugar: 10.8 }))).toEqual([]); // slack
    expect(checkPer100g(base({ carbs: 10, sugar: 12 }))).toEqual(['sugar_over_carbs']);
  });

  it('flags 100 g of sugar in a food that declares no carbohydrate', () => {
    const r = checkPer100g(
      base({ calories: 400, carbs: 0, sugar: 100, protein: 0, fat: 0, fiber: 0, carbs_known: true })
    );
    expect(r).toEqual(['sugar_over_carbs']);
  });

  it('does NOT compare sugar against an UNKNOWN carbohydrate', () => {
    // The 0 is Step 10's placeholder, not a measurement — comparing against it
    // would flag every carb-less record as contradictory.
    expect(checkPer100g(base({ carbs: 0, carbs_known: false, sugar: 5 }))).toEqual([]);
  });

  it('reports one bad number once, not through every cross-check', () => {
    // 500 g of carbs also breaks the macro sum and the sugar comparison; only
    // the field itself is named.
    expect(checkPer100g(base({ carbs: 500 }))).toEqual(['carbs']);
  });
});

describe('sanitizePer100g — carbohydrate becomes unknown, nothing else is rewritten', () => {
  it('turns an impossible carbohydrate into an UNKNOWN one, never a clamp', () => {
    const r = sanitizePer100g(base({ carbs: 500 }));
    expect(r.per100g.carbs).toBe(0); // Step 10's placeholder…
    expect(r.per100g.carbs_known).toBe(false); // …labelled as such
    expect(r.per100g.carbs).not.toBe(100); // NOT clamped to the maximum
    expect(r.issues).toContain('carbs');
  });

  it('does the same for a NaN carbohydrate', () => {
    const r = sanitizePer100g(base({ carbs: NaN }));
    expect(r.per100g.carbs).toBe(0);
    expect(r.per100g.carbs_known).toBe(false);
    expect(Number.isNaN(r.per100g.carbs)).toBe(false);
  });

  it('leaves a genuine declared 0 g carbohydrate KNOWN', () => {
    const r = sanitizePer100g(base({ calories: 0, carbs: 0, sugar: 0, carbs_known: true }));
    expect(r.per100g.carbs).toBe(0);
    expect(r.per100g.carbs_known).toBe(true);
    expect(r.issues).toEqual([]);
  });

  it('leaves an already-unknown carbohydrate unknown, and reports nothing', () => {
    const r = sanitizePer100g(base({ carbs: 0, carbs_known: false }));
    expect(r.per100g.carbs_known).toBe(false);
    expect(r.issues).toEqual([]); // 0 is in range; absence is not implausible
  });

  it('reports an impossible SIBLING without editing the number', () => {
    const r = sanitizePer100g(base({ calories: 5000, sodium: 90_000 }));
    expect(r.issues).toEqual(['calories', 'sodium']);
    expect(r.per100g.calories).toBe(5000); // untouched: the patient must see it
    expect(r.per100g.sodium).toBe(90_000);
    expect(r.per100g.carbs).toBe(30); // carbohydrate stays usable
    expect(r.per100g.carbs_known).toBe(true);
  });

  it('returns the very same object when there is nothing to fix', () => {
    const p = base();
    expect(sanitizePer100g(p).per100g).toBe(p);
  });

  it('preserves every unrelated field it does not know about', () => {
    const r = sanitizePer100g({ ...base({ carbs: 500 }), glycemic_index: 73 });
    expect(r.per100g.glycemic_index).toBe(73);
  });
});

describe('isCarbsPlausible', () => {
  it('answers only about the carbohydrate figure', () => {
    expect(isCarbsPlausible(base({ carbs: 100 }))).toBe(true);
    expect(isCarbsPlausible(base({ carbs: 0 }))).toBe(true);
    expect(isCarbsPlausible(base({ carbs: 100.1 }))).toBe(false);
    expect(isCarbsPlausible(base({ carbs: -1 }))).toBe(false);
    expect(isCarbsPlausible(base({ calories: 9999 }))).toBe(true);
  });
});

describe('portion bounds', () => {
  it('accepts a portion a person could eat and rejects one they could not', () => {
    expect(isPortionPlausible(PORTION_MIN)).toBe(true);
    expect(isPortionPlausible(PORTION_MAX)).toBe(true);
    expect(isPortionPlausible(PORTION_MIN - 1)).toBe(false);
    expect(isPortionPlausible(PORTION_MAX + 1)).toBe(false);
    expect(isPortionPlausible(NaN)).toBe(false);
    expect(isPortionPlausible(Infinity)).toBe(false);
  });

  it('matches the server clamp in analyze-meal (5–2000 g)', () => {
    // Two bounds that disagree are worse than one: pinned so a change to
    // either side is a visible diff here.
    expect([PORTION_MIN, PORTION_MAX]).toEqual([5, 2000]);
  });

  it('clamps an input portion into range and rounds it', () => {
    expect(clampPortionGrams(0)).toBe(PORTION_MIN);
    expect(clampPortionGrams(4)).toBe(PORTION_MIN);
    expect(clampPortionGrams(7.6)).toBe(8);
    expect(clampPortionGrams(250)).toBe(250);
    expect(clampPortionGrams(2001)).toBe(PORTION_MAX);
    expect(clampPortionGrams(9999)).toBe(PORTION_MAX);
    expect(clampPortionGrams(-100)).toBe(PORTION_MIN);
    expect(clampPortionGrams(NaN)).toBe(PORTION_MIN);
  });
});

describe('implausibleNames', () => {
  it('names only the foods carrying an issue', () => {
    expect(
      implausibleNames([
        { name: 'Couscous' },
        { name: 'Produit douteux', implausible_fields: ['carbs'] },
        { name: 'Sauce', implausible_fields: [] },
        { name: 'Boisson', implausible_fields: ['sodium'] },
      ])
    ).toEqual(['Produit douteux', 'Boisson']);
  });

  it('skips blank names and survives a null list', () => {
    expect(implausibleNames([{ name: '  ', implausible_fields: ['carbs'] }, null])).toEqual([]);
    expect(implausibleNames(undefined)).toEqual([]);
  });
});
