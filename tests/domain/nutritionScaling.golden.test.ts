import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FoodItemResult } from '@/types';

/**
 * CHARACTERIZATION — portion rescaling and plate aggregation.
 *
 * `nutrition/engine.ts` is the only module in the Step 3 scope with runtime
 * dependencies. Three of its imports reach React Native, AsyncStorage or
 * Supabase at module load; `rescaleItem` and `aggregateItems` themselves touch
 * none of them. They are stubbed here so the two pure functions can be
 * exercised in a node environment. Nothing outside `tests/` is changed.
 *
 * The i18n stub echoes `key:params` so the assertions can characterize WHAT the
 * engine hands to the translator. The displayed string comes from the locale
 * files and is outside this unit.
 */

vi.mock('@/i18n', () => ({
  default: {
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
  },
}));

vi.mock('@/services/nutrition/cache', () => ({
  getCachedMatch: vi.fn(async () => null),
  setCachedMatch: vi.fn(async () => undefined),
  clearMatchCache: vi.fn(async () => undefined),
}));

vi.mock('@/services/nutrition/providers/remote', () => ({
  fatSecretProvider: { id: 'fatsecret', label: 'FatSecret', trust: 0.8, search: vi.fn() },
  edamamProvider: { id: 'edamam', label: 'Edamam', trust: 0.8, search: vi.fn() },
}));

const { aggregateItems, rescaleItem, resolveFood } = await import(
  '@/services/nutrition/engine'
);

function item(overrides: Partial<FoodItemResult> = {}): FoodItemResult {
  return {
    name: 'food',
    portion_grams: 100,
    calories: 100,
    carbohydrates: 20,
    sugar: 5,
    protein: 3,
    fat: 1,
    fiber: 2,
    source: 'usda',
    detection_confidence: 1,
    nutrition_confidence: 1,
    ...overrides,
  };
}

const base = { calories: 100, carbs: 20, sugar: 5, protein: 3, fat: 1, fiber: 2, sodium: 400 };

describe('rescaleItem — with per100g_base', () => {
  it('recomputes every macro from the untouched per-100 g values', () => {
    const r = rescaleItem(item({ per100g_base: base }), 250);
    expect(r).toMatchObject({
      portion_grams: 250,
      calories: 250,
      carbohydrates: 50,
      sugar: 12.5,
      protein: 7.5,
      fat: 2.5,
      fiber: 5,
      sodium: 1000,
    });
  });

  it('rounds the requested grams to a whole number', () => {
    expect(rescaleItem(item({ per100g_base: base }), 7.6).portion_grams).toBe(8);
    expect(rescaleItem(item({ per100g_base: base }), 7.4).portion_grams).toBe(7);
  });

  it('round-trips exactly — the reason per100g_base exists', () => {
    const start = rescaleItem(item({ per100g_base: { ...base, carbs: 18.5 } }), 200);
    expect(start.carbohydrates).toBe(37);

    const shrunk = rescaleItem(start, 7);
    const restored = rescaleItem(shrunk, 200);
    expect(restored.carbohydrates).toBe(37); // no compounding drift
  });

  it('preserves identity fields and leaves an absent sodium absent', () => {
    const src = item({
      per100g_base: { calories: 100, carbs: 20, sugar: 5, protein: 3, fat: 1, fiber: 2 },
      name: 'Couscous',
      source: 'moroccan_db',
      matched_food: 'couscous, cooked',
    });
    const r = rescaleItem(src, 300);
    expect(r.name).toBe('Couscous');
    expect(r.source).toBe('moroccan_db');
    expect(r.matched_food).toBe('couscous, cooked');
    expect(r.sodium).toBeUndefined();
  });

  it('returns zeros for a zero-gram portion', () => {
    const r = rescaleItem(item({ per100g_base: base }), 0);
    expect(r).toMatchObject({ portion_grams: 0, calories: 0, carbohydrates: 0, sodium: 0 });
  });

  it('FIXED IN STEP 22B — a negative portion yields UNKNOWN, not negative macros', () => {
    // BEFORE (recorded green against the pre-Step-22B tree): `-100 g` produced
    // `carbohydrates: -20`. Not reachable through the portion editor, which
    // strips the minus sign at the keystroke level (lib/num sanitizeDecimal),
    // but the engine applied no guard of its own.
    // AFTER: an unusable portion is not a small portion (finding NUTR-B2). The
    // item keeps placeholder zeros, every nutrient is marked unknown, and
    // `portion_valid: false` says why — nothing is coerced into a real weight.
    const r = rescaleItem(item({ per100g_base: base }), -100);
    expect(r.carbohydrates).toBe(0);
    expect(r.portion_grams).toBe(0);
    expect(r.portion_valid).toBe(false);
    expect(r.carbs_known).toBe(false);
    expect(r.nutrients_known?.protein).toBe(false);
  });
});

describe('rescaleItem — legacy items without per100g_base', () => {
  it('scales linearly from the current values', () => {
    const r = rescaleItem(item({ portion_grams: 100 }), 200);
    expect(r).toMatchObject({ portion_grams: 200, calories: 200, carbohydrates: 40 });
  });

  /**
   * KNOWN-BAD BASELINE — P8-004
   * Without per100g_base the scaling compounds the rounding of the already
   * rounded values, so a portion edited down and back up does not return to
   * where it started: 37 g of carbohydrate becomes 37.1 g. At one decimal the
   * drift is small, but it is unbounded across repeated edits and it feeds the
   * bolus calculation. Items persisted before per100g_base existed still take
   * this path. Owning remediation: RU-16 (backfill) then RU-2.
   */
  it('KNOWN-BAD BASELINE — P8-004: a legacy round-trip does not return the original value', () => {
    const legacy = item({ portion_grams: 200, carbohydrates: 37 });
    const shrunk = rescaleItem(legacy, 7);
    expect(shrunk.carbohydrates).toBe(1.3); // 37 × 0.035 = 1.295 → 1.3

    const restored = rescaleItem(shrunk, 200);
    expect(restored.carbohydrates).toBe(37.1); // not 37
  });

  it('guards the divisor so a zero-gram legacy item does not divide by zero', () => {
    const r = rescaleItem(item({ portion_grams: 0, carbohydrates: 10 }), 50);
    expect(Number.isFinite(r.carbohydrates)).toBe(true);
    expect(r.carbohydrates).toBe(500); // factor is 50 / max(1, 0)
  });
});

describe('aggregateItems — totals', () => {
  it('sums the macros and rounds each once', () => {
    const r = aggregateItems([
      item({ calories: 150.4, carbohydrates: 20.55, sugar: 5.25, protein: 3.1, fat: 1.2, fiber: 2.4 }),
      item({ calories: 99.6, carbohydrates: 10.05, sugar: 4.75, protein: 6.9, fat: 2.8, fiber: 1.6 }),
    ]);
    expect(r.calories).toBe(250);
    expect(r.carbohydrates).toBe(30.6);
    expect(r.sugar).toBe(10);
    expect(r.protein).toBe(10);
    expect(r.fat).toBe(4);
    expect(r.fiber).toBe(4);
  });

  it('treats a missing sodium as zero', () => {
    const r = aggregateItems([item({ sodium: 300 }), item({ sodium: undefined })]);
    expect(r.sodium).toBe(300);
  });

  it('averages the two confidences to two decimals', () => {
    const r = aggregateItems([
      item({ detection_confidence: 0.9, nutrition_confidence: 1 }),
      item({ detection_confidence: 0.6, nutrition_confidence: 0.5 }),
    ]);
    expect(r.confidence).toBe(0.75);
    expect(r.nutrition_confidence).toBe(0.75);
  });

  /**
   * FIXED IN STEP 20 — P8-006
   *
   * BEFORE: `aggregateItems([])` read `[...bySource.entries()].sort()[0][0]` on
   * an empty map and threw a **TypeError**, and the two confidence averages
   * divided by zero. Every caller reaches this after the resolver has filtered
   * unmatched foods out (engine.ts:339, scan-result.tsx:416, program.ts:241 and
   * :281), so a plate whose foods were all dropped crashed the aggregation.
   *
   * AFTER: it returns an empty plate. No clinical value was invented — `source`
   * is optional and is omitted rather than guessed, the totals were already 0
   * from the reduce's initial value, and the carbohydrate stays UNKNOWN, so an
   * empty plate can never seed a dose as a "0 g" meal.
   */
  it('FIXED IN STEP 20 — P8-006: an empty plate returns an empty result instead of throwing', () => {
    expect(() => aggregateItems([])).not.toThrow();

    const empty = aggregateItems([]);
    expect(empty.calories).toBe(0);
    expect(empty.carbohydrates).toBe(0);
    // …and the 0 is explicitly NOT a measurement (the Step 10 contract).
    expect(empty.carbs_known).toBe(false);
    expect(empty.items).toEqual([]);
  });

  it('an empty plate reports no source and no confidence, rather than NaN', () => {
    const empty = aggregateItems([]);
    expect(empty.source).toBeUndefined(); // nothing produced it
    expect(empty.confidence).toBe(0);
    expect(empty.nutrition_confidence).toBe(0);
    expect(Number.isNaN(empty.confidence)).toBe(false);
    expect(Number.isNaN(empty.nutrition_confidence)).toBe(false);
  });

  it('a one-food plate is completely unaffected by the guard', () => {
    const one = aggregateItems([item({ carbohydrates: 20, glycemic_index: 50 })]);
    expect(one.carbohydrates).toBe(20);
    expect(one.source).toBe('usda');
    expect(one.confidence).toBe(1);
    expect(one.nutrition_confidence).toBe(1);
  });
});

describe('aggregateItems — glycemic index', () => {
  it('weights the index by each food carbohydrate contribution', () => {
    const r = aggregateItems([
      item({ carbohydrates: 20, glycemic_index: 70 }),
      item({ carbohydrates: 30, glycemic_index: 40 }),
    ]);
    expect(r.glycemic_index).toBe(52); // (70×20 + 40×30) / 50
  });

  it('ignores foods with no index or no carbohydrate', () => {
    const r = aggregateItems([
      item({ carbohydrates: 20, glycemic_index: 70 }),
      item({ carbohydrates: 0, glycemic_index: 10 }), // no carbs → excluded
      item({ carbohydrates: 30, glycemic_index: undefined }), // no index → excluded
    ]);
    expect(r.glycemic_index).toBe(70);
  });

  it('reports zero when no food qualifies', () => {
    const r = aggregateItems([item({ carbohydrates: 0, glycemic_index: undefined })]);
    expect(r.glycemic_index).toBe(0);
  });

  it('reports how much of the plate carbohydrate the index speaks for', () => {
    const r = aggregateItems([
      item({ carbohydrates: 20, glycemic_index: 70 }),
      item({ carbohydrates: 30, glycemic_index: undefined }),
    ]);
    expect(r.gi_carb_coverage).toBe(0.4); // 20 of 50 g
  });

  it('flags the index as estimated when any contributing food estimated it', () => {
    const r = aggregateItems([
      item({ carbohydrates: 20, glycemic_index: 70, glycemic_index_estimated: true }),
      item({ carbohydrates: 30, glycemic_index: 40 }),
    ]);
    expect(r.glycemic_index_estimated).toBe(true);
  });

  it('computes the glycemic load from the aggregate, assuming 55 when unknown', () => {
    const known = aggregateItems([item({ carbohydrates: 50, glycemic_index: 80 })]);
    expect(known.glycemic_load_value).toBe(40); // 80 × 50 / 100
    expect(known.glycemic_load).toBe('High');

    const unknown = aggregateItems([item({ carbohydrates: 50, glycemic_index: undefined })]);
    expect(unknown.glycemic_index).toBe(0);
    expect(unknown.glycemic_load_value).toBe(28); // 55 assumed
  });
});

describe('aggregateItems — provenance and warnings', () => {
  it('picks the dominant source by carbohydrate contribution', () => {
    const r = aggregateItems([
      item({ source: 'usda', carbohydrates: 10 }),
      item({ source: 'moroccan_db', carbohydrates: 40 }),
    ]);
    expect(r.source).toBe('moroccan_db');
  });

  it('breaks a carbohydrate tie by item count', () => {
    const r = aggregateItems([
      item({ source: 'usda', carbohydrates: 5 }),
      item({ source: 'usda', carbohydrates: 5 }),
      item({ source: 'edamam', carbohydrates: 10 }),
    ]);
    expect(r.source).toBe('usda'); // 5+1 + 5+1 = 12 vs 10+1 = 11
  });

  it('warns about a high index, high sugar, unmatched foods and AI estimates', () => {
    const r = aggregateItems([
      item({ carbohydrates: 50, sugar: 40, glycemic_index: 80 }),
      item({ name: 'mystère', nutrition_confidence: 0, carbohydrates: 0 }),
      item({ source: 'ai_estimate', nutrition_confidence: 0.4 }),
    ]);
    expect(r.warnings).toContain('warn:high_gi');
    expect(r.warnings).toContain('warn:sugar_high|50'); // 40 + 5 + 5
    expect(r.warnings).toContain('warn:unmatched|mystère');
    expect(r.warnings).toContain('warn:ai_estimate');
  });

  it('emits no warnings for a clean plate', () => {
    const r = aggregateItems([item({ carbohydrates: 20, sugar: 3, glycemic_index: 40 })]);
    expect(r.warnings).toEqual([]);
  });

  it('does not warn about an AI estimate that resolved to zero confidence', () => {
    // Such an item is reported as unmatched instead — the two warnings are
    // mutually exclusive by construction.
    const r = aggregateItems([item({ source: 'ai_estimate', nutrition_confidence: 0 })]);
    expect(r.warnings).not.toContain('warn:ai_estimate');
    expect(r.warnings.some((w) => w.startsWith('warn:unmatched'))).toBe(true);
  });

  it('keeps every resolved item on the result for the detail view', () => {
    const items = [item({ name: 'a' }), item({ name: 'b' })];
    expect(aggregateItems(items).items).toHaveLength(2);
  });
});

describe('carbohydrate provenance — through scaling, rescaling and aggregation', () => {
  it('scale() carries the flag rather than minting a value from a portion', () => {
    // Multiplying an unknown by 250 g is still an unknown. Reached through
    // rescaleItem, which is `scale()` + `baseOf()` on the round trip.
    const unknown = rescaleItem(
      item({ carbohydrates: 0, carbs_known: false, per100g_base: { ...base, carbs: 0, carbs_known: false } }),
      250
    );
    expect(unknown.carbohydrates).toBe(0);
    expect(unknown.per100g_base!.carbs_known).toBe(false);
    expect(unknown.calories).toBe(250); // the values that WERE known still scale
  });

  it('preserves a known flag — including a genuine zero — through a rescale', () => {
    const water = rescaleItem(
      item({ carbohydrates: 0, carbs_known: true, per100g_base: { ...base, calories: 0, carbs: 0, carbs_known: true } }),
      500
    );
    expect(water.carbohydrates).toBe(0);
    expect(water.per100g_base!.carbs_known).toBe(true);
  });

  it('falls back to the item flag when a legacy base carries none', () => {
    // An item persisted before `per100g_base.carbs_known` existed must not
    // have its unknown laundered into a value by a portion edit. The flag the
    // rest of the app reads is the ITEM's, and that one is preserved.
    const src = item({ carbs_known: false, per100g_base: { ...base, carbs: 0 } });
    const r = rescaleItem(src, 200);
    expect(r.carbs_known).toBe(false);
    // The stored base is passed through untouched — a rescale is not a rewrite
    // of the record — so the fallback still applies on the next edit.
    expect(r.per100g_base!.carbs_known).toBeUndefined();
    expect(rescaleItem(r, 300).carbs_known).toBe(false);
  });

  it('scales a legacy item with no base at all without inventing provenance', () => {
    const r = rescaleItem(item({ portion_grams: 100, carbohydrates: 20 }), 200);
    expect(r.carbohydrates).toBe(40);
    expect(r.carbs_known).toBeUndefined(); // still legacy, still indeterminate-by-rule
  });

  it('marks the plate unknown, names the food, and leaves the number alone', () => {
    const r = aggregateItems([
      item({ name: 'Couscous', carbohydrates: 62, carbs_known: true }),
      item({ name: 'Sauce', carbohydrates: 0, carbs_known: false }),
    ]);
    expect(r.carbohydrates).toBe(62); // unchanged: a floor, not a total
    expect(r.carbs_known).toBe(false);
    expect(r.warnings).toContain('warn:carbs_unknown|Sauce');
  });

  it('marks a fully known plate known and emits no carbohydrate warning', () => {
    const r = aggregateItems([
      item({ carbohydrates: 62, carbs_known: true }),
      item({ carbohydrates: 0, carbs_known: true }), // genuine zero
    ]);
    expect(r.carbohydrates).toBe(62);
    expect(r.carbs_known).toBe(true);
    expect(r.warnings.some((w) => w.startsWith('warn:carbs_unknown'))).toBe(false);
  });

  it('does not warn about a legacy zero, but does not call the plate known either', () => {
    // The legacy rule in action: no flag and a zero is `indeterminate`. Loud
    // enough to stop a bolus seed, quiet enough not to accuse old data.
    const r = aggregateItems([item({ carbohydrates: 0 })]);
    expect(r.warnings.some((w) => w.startsWith('warn:carbs_unknown'))).toBe(false);
    expect(r.carbs_known).toBe(false);
  });
});

describe('resolveFood — provenance from the source that answered', () => {
  /** Every remote provider misses, so the resolver reaches its AI fallback
   *  and its unmatched placeholder. No request leaves the process. */
  function stubAllProvidersMissing() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const detected = { name: 'zzqqx unknown thing', portion_grams: 200, confidence: 0.8 };

  it('an AI estimate WITH a number is a known estimate, not an unknown', async () => {
    stubAllProvidersMissing();
    const r = await resolveFood(detected, {
      calories: 200,
      carbs: 30,
      carbs_known: true,
      sugar: 2,
      protein: 5,
      fat: 4,
      fiber: 1,
    });
    expect(r!.source).toBe('ai_estimate');
    expect(r!.nutrition_confidence).toBe(0.55); // estimate, and says so
    expect(r!.carbohydrates).toBe(60); // 30 × 200 g
    expect(r!.carbs_known).toBe(true);
  });

  it('an AI estimate with NO carbohydrate is unknown and never NaN', async () => {
    stubAllProvidersMissing();
    const r = await resolveFood(detected, {
      calories: 200,
      carbs: 0,
      carbs_known: false,
      sugar: 2,
      protein: 5,
      fat: 4,
      fiber: 1,
    });
    expect(Number.isNaN(r!.carbohydrates)).toBe(false);
    expect(r!.carbohydrates).toBe(0);
    expect(r!.carbs_known).toBe(false);
  });

  it('an unmatched food kept on the plate declares its zero a placeholder', async () => {
    stubAllProvidersMissing();
    const r = await resolveFood(detected, undefined, { keepUnmatched: true });
    expect(r!.nutrition_confidence).toBe(0);
    expect(r!.carbohydrates).toBe(0);
    expect(r!.carbs_known).toBe(false);
  });

  it('a hit from our own tables comes back known', async () => {
    // No fetch stub needed: the internal tables answer first.
    const r = await resolveFood({ name: 'couscous', portion_grams: 150, confidence: 0.9 });
    expect(r!.source).toBe('moroccan_db');
    expect(r!.carbs_known).toBe(true);
    expect(r!.per100g_base!.carbs_known).toBe(true);
  });
});

describe('physical bounds — at the per-100 g ingestion boundary', () => {
  /** Every remote provider misses, so the resolver reaches its AI fallback.
   *  No request leaves the process. */
  function stubAllProvidersMissing() {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    );
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const detected = { name: 'zzqqx unknown thing', portion_grams: 200, confidence: 0.8 };

  it('an impossible carbohydrate arrives as UNKNOWN, not as a clamped 100', async () => {
    stubAllProvidersMissing();
    const r = await resolveFood(detected, {
      calories: 300,
      carbs: 500, // 500 g of carbohydrate in 100 g of food
      carbs_known: true, // the source insists it is a measurement
      sugar: 10,
      protein: 5,
      fat: 4,
      fiber: 1,
    });
    expect(r!.carbohydrates).toBe(0); // placeholder…
    expect(r!.carbs_known).toBe(false); // …declared unknown
    expect(r!.carbohydrates).not.toBe(200); // NOT 100 g/100 g × 200 g
    expect(r!.implausible_fields).toContain('carbs');
    expect(r!.per100g_base!.carbs_known).toBe(false); // survives a rescale
  });

  it('reports an impossible SIBLING and leaves its number visible', async () => {
    stubAllProvidersMissing();
    const r = await resolveFood(detected, {
      calories: 5000,
      carbs: 30,
      carbs_known: true,
      sugar: 2,
      protein: 5,
      fat: 4,
      fiber: 1,
    });
    expect(r!.implausible_fields).toEqual(['calories']);
    expect(r!.calories).toBe(10000); // 5000 × 200 g — not rewritten
    expect(r!.carbohydrates).toBe(60); // the carbohydrate stays usable
    expect(r!.carbs_known).toBe(true);
  });

  it('a possible record carries no issues at all', async () => {
    stubAllProvidersMissing();
    const r = await resolveFood(detected, {
      calories: 200,
      carbs: 30,
      carbs_known: true,
      sugar: 2,
      protein: 5,
      fat: 4,
      fiber: 1,
    });
    expect(r!.implausible_fields).toBeUndefined();
  });

  it('applies the same bounds to a database hit, not just the AI fallback', async () => {
    // The internal tables answer first, so this exercises the provider branch.
    const r = await resolveFood({ name: 'couscous', portion_grams: 150, confidence: 0.9 });
    expect(r!.source).toBe('moroccan_db');
    expect(r!.implausible_fields).toBeUndefined(); // our own data is possible
    expect(r!.carbs_known).toBe(true);
  });

  it('a rescale carries the issue list with the item', () => {
    const r = rescaleItem(item({ implausible_fields: ['sodium'] , per100g_base: base }), 250);
    expect(r.implausible_fields).toEqual(['sodium']);
  });

  it('the plate names the food and keeps both warnings distinct', () => {
    const r = aggregateItems([
      item({ name: 'Couscous', carbohydrates: 62, carbs_known: true }),
      item({
        name: 'Produit douteux',
        carbohydrates: 0,
        carbs_known: false,
        implausible_fields: ['carbs'],
      }),
    ]);
    expect(r.warnings).toContain('warn:implausible|Produit douteux');
    expect(r.warnings).toContain('warn:carbs_unknown|Produit douteux');
    expect(r.carbohydrates).toBe(62); // still a floor, still unchanged
    expect(r.carbs_known).toBe(false);
  });

  it('warns about an implausible sibling even when the carbohydrate is fine', () => {
    const r = aggregateItems([
      item({ name: 'Boisson', carbohydrates: 12, carbs_known: true, implausible_fields: ['sodium'] }),
    ]);
    expect(r.warnings).toContain('warn:implausible|Boisson');
    expect(r.warnings.some((w) => w.startsWith('warn:carbs_unknown'))).toBe(false);
    expect(r.carbs_known).toBe(true); // an odd sodium does not block a dose
  });

  it('emits no implausibility warning for a clean plate', () => {
    const r = aggregateItems([item({ carbohydrates: 20, sugar: 3, glycemic_index: 40 })]);
    expect(r.warnings).toEqual([]);
  });
});

describe('aggregateItems — plate naming', () => {
  it('joins one or two foods directly', () => {
    expect(aggregateItems([item({ name: 'Tajine' })]).food_name).toBe('Tajine');
    expect(aggregateItems([item({ name: 'Tajine' }), item({ name: 'Pain' })]).food_name).toBe(
      'Tajine + Pain'
    );
  });

  it('delegates to i18n beyond two foods, passing the first name and the remainder', () => {
    const r = aggregateItems([
      item({ name: 'Tajine' }),
      item({ name: 'Pain' }),
      item({ name: 'Thé' }),
    ]);
    expect(r.food_name).toBe('result.plateMore:{"first":"Tajine","count":2}');
  });

  it('passes the rounded total grams to the portion label', () => {
    const r = aggregateItems([item({ portion_grams: 150.4 }), item({ portion_grams: 99.6 })]);
    expect(r.estimated_portion).toBe('result.plateTotalGrams:{"grams":250}');
  });
});
