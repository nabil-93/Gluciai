import { describe, expect, it, vi } from 'vitest';

import type { FoodItemResult } from '@/types';

/**
 * INDEPENDENT NUMERICAL VALIDATION OF THE NUTRITION CHAIN.
 *
 *     PHOTO → identification → match → portion → nutrients → carbs
 *           → GI → GL → score → bolus input
 *
 * Like tests/clinical/independentBolusValidation, the reference values here are
 * NOT taken from the application. Per-100 g figures are USDA FoodData Central
 * (SR Legacy / Foundation); glycemic indices are the Foster-Powell / Atkinson
 * international tables:
 *
 *     cooked lentils      116 kcal · 20.1 C · 9.0 P · 0.4 F · 7.9 fib   GI ~32
 *     whole-wheat bread   247 kcal · 41.0 C · 13.0 P · 3.4 F · 7.0 fib  GI ~74
 *     cooked white rice   130 kcal · 28.0 C · 2.7 P · 0.3 F · 0.4 fib   GI ~73
 *
 * WHAT IS BEING CHECKED, AND WHAT IS NOT.
 *
 *   ✔ arithmetic — does the pipeline compute what it says it computes?
 *   ✔ provenance — is an estimate marked as an estimate, and is unknown kept
 *     distinct from zero all the way to the bolus seed?
 *   ✖ methodology — whether a carbohydrate-weighted mean GI can describe a
 *     mixed plate at all (D-1), and whether the score's weights are defensible
 *     (D-5), are clinical questions. Where this file touches them it PINS
 *     today's behaviour and names the open decision, exactly like
 *     `ru11Baseline`. It never asserts that today's answer is right.
 */

vi.mock('@/i18n', () => ({
  default: {
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    language: 'fr',
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
vi.mock('@/services/dayLog', () => ({
  buildDayEvents: vi.fn(() => []),
  dayTotals: vi.fn(() => ({})),
}));

const { aggregateItems } = await import('@/services/nutrition/engine');
const { scoreMeal, mealGrade } = await import('@/services/nutrition/mealScore');
const { glValue, glycemicLoad, glBand, effectiveGi, ASSUMED_GI } = await import(
  '@/services/nutrition/interpret/glycemic'
);
const { qualityEvidence } = await import('@/services/nutrition/advice');
const { MOROCCAN_FOODS } = await import('@/data/moroccanFoods');

/* ─────────────── reference data and builders ─────────────── */

const USDA = {
  lentils: { kcal: 116, c: 20.1, s: 1.8, p: 9.0, f: 0.4, fib: 7.9, gi: 32 },
  bread: { kcal: 247, c: 41.0, s: 5.6, p: 13.0, f: 3.4, fib: 7.0, gi: 74 },
  rice: { kcal: 130, c: 28.0, s: 0.1, p: 2.7, f: 0.3, fib: 0.4, gi: 73 },
} as const;

type Ref = { kcal: number; c: number; s: number; p: number; f: number; fib: number };

/** A resolved item exactly as the engine's own `scale()` would produce it. */
function item(name: string, grams: number, per100: Ref, gi?: number): FoodItemResult {
  const k = grams / 100;
  const r = (v: number) => Math.round(v * k * 10) / 10;
  return {
    name,
    search_name: name,
    portion_grams: grams,
    calories: Math.round(per100.kcal * k),
    carbohydrates: r(per100.c),
    sugar: r(per100.s),
    protein: r(per100.p),
    fat: r(per100.f),
    fiber: r(per100.fib),
    sodium: 0,
    carbs_known: true,
    nutrients_known: {
      calories: true,
      carbs: true,
      sugar: true,
      protein: true,
      fat: true,
      fiber: true,
      sodium: true,
    },
    portion_valid: true,
    glycemic_index: gi,
    glycemic_index_estimated: false,
    source: 'usda',
    matched_database: 'usda',
    matched_food: name,
    match_score: 100,
    detection_confidence: 0.9,
    nutrition_confidence: 0.9,
  } as FoodItemResult;
}

/* ══════════════ GL identity ══════════════ */

describe('MATHEMATICALLY CORRECT — GL = GI × available carbohydrate / 100', () => {
  it.each([
    [80.4, 32],
    [82, 74],
    [123, 41],
    [162.4, 52],
    [28, 73],
    [50, 55],
    [10, 100],
    [200, 70],
    [1, 55],
  ])('carbs %f at GI %i', (carbs, gi) => {
    expect(glValue(carbs, gi)).toBeCloseTo((gi * carbs) / 100, 10);
  });

  it('an unknown index substitutes ASSUMED_GI rather than vanishing', () => {
    expect(effectiveGi(0)).toBe(ASSUMED_GI);
    expect(effectiveGi(undefined)).toBe(ASSUMED_GI);
    expect(effectiveGi(null)).toBe(ASSUMED_GI);
    expect(effectiveGi(73)).toBe(73);
    expect(glValue(100, 0)).toBeCloseTo(55, 10);
  });
});

/* ══════════════ plate aggregation ══════════════ */

describe('MATHEMATICALLY CORRECT — plate totals match independent arithmetic', () => {
  it('400 g lentils + 200 g whole-grain bread', () => {
    const plate = aggregateItems([
      item('lentils', 400, USDA.lentils, USDA.lentils.gi),
      item('whole-grain bread', 200, USDA.bread, USDA.bread.gi),
    ]);

    const kcal = 4 * USDA.lentils.kcal + 2 * USDA.bread.kcal; // 958
    const carbs = 4 * USDA.lentils.c + 2 * USDA.bread.c; // 162.4
    const giNum = USDA.lentils.gi * (4 * USDA.lentils.c) + USDA.bread.gi * (2 * USDA.bread.c);
    const gi = Math.round(giNum / carbs); // 53

    expect(plate.calories).toBe(kcal);
    expect(plate.carbohydrates).toBeCloseTo(carbs, 1);
    expect(plate.glycemic_index).toBe(gi);
    expect(plate.glycemic_load_value).toBe(Math.round((gi * carbs) / 100)); // 86
    expect(plate.gi_carb_coverage).toBe(1);
    expect(plate.carbs_known).toBe(true);
  });

  it('the carb-weighted mean GI is a weighted mean, not an average of indices', () => {
    // A naive mean of 32 and 74 is 53 by coincidence here, so use a plate where
    // the two differ: 100 g lentils + 300 g bread.
    const plate = aggregateItems([
      item('lentils', 100, USDA.lentils, USDA.lentils.gi),
      item('bread', 300, USDA.bread, USDA.bread.gi),
    ]);
    const cL = USDA.lentils.c; // 20.1
    const cB = 3 * USDA.bread.c; // 123
    const weighted = Math.round((32 * cL + 74 * cB) / (cL + cB)); // 68
    const naive = Math.round((32 + 74) / 2); // 53
    expect(plate.glycemic_index).toBe(weighted);
    expect(plate.glycemic_index).not.toBe(naive);
  });
});

/* ══════════════ provenance: unknown is never zero ══════════════ */

describe('PROVENANCE — an unknown value never becomes a dosable zero', () => {
  it('one unidentified food makes the plate carbohydrate a FLOOR', () => {
    const unknown = {
      ...item('unidentified', 150, { kcal: 0, c: 0, s: 0, p: 0, f: 0, fib: 0 }),
      carbs_known: false,
      nutrition_confidence: 0,
    } as FoodItemResult;

    const plate = aggregateItems([item('rice', 200, USDA.rice, USDA.rice.gi), unknown]);

    expect(plate.carbs_known).toBe(false); // the total is a lower bound
    expect(plate.warnings.some((w) => w.startsWith('warn:unmatched'))).toBe(true);
    expect(plate.warnings.some((w) => w.startsWith('warn:carbs_unknown'))).toBe(true);
  });

  it('a plate with no energy carries no quality verdict at all', () => {
    // scoreMeal starts at 100 and subtracts, so an empty plate scores 100/A.
    // The evidence gate is what stops that reaching the patient.
    const empty = { calories: 0, carbs: 0, sugar: 0, protein: 0, fat: 0, fiber: 0 };
    expect(scoreMeal({ ...empty, glycemic_index: 0 }).score).toBe(100);
    expect(qualityEvidence(empty as never)).toBe('no_data');
  });

  it('a floor carbohydrate also withholds the verdict', () => {
    expect(
      qualityEvidence({ calories: 400, carbs: 30, carbs_known: false } as never)
    ).toBe('carbs_unknown');
  });

  it('a fully known plate supports its verdict', () => {
    expect(
      qualityEvidence({ calories: 400, carbs: 30, carbs_known: true } as never)
    ).toBe('supported');
  });
});

/* ══════════════ open decisions, pinned with numbers ══════════════ */

describe('CLINICAL / PRODUCT DECISION REQUIRED — pinned, not corrected', () => {
  /**
   * KNOWN-BAD BASELINE — audit N-1 / RU-3 D6.
   *
   * Glycemic load is displayed prominently and feeds the score NOWHERE
   * (`scoreMeal` never reads it). So a plate can carry a load four times the
   * "high" threshold and still be graded A · Excellent. Owning decision: D-5.
   */
  it('GL 86 — four times the high threshold — still grades A', () => {
    const plate = aggregateItems([
      item('lentils', 400, USDA.lentils, USDA.lentils.gi),
      item('bread', 200, USDA.bread, USDA.bread.gi),
    ]);
    expect(plate.glycemic_load_value).toBe(86);
    expect(glBand(86).key).toBe('high');
    expect(plate.meal_score).toBe(77);
    expect(mealGrade(plate.meal_score!)).toBe('B');
  });

  /**
   * KNOWN-BAD BASELINE — audit N-2 / RU-3 D1–D2.
   *
   * Fat is not scored at all — `scoreMeal` contains no `m.fat` term — so a
   * plate of pure fat takes only the `calories > 800` penalty. Adding a fat
   * term needs a saturated-fat field the app does not hold anywhere.
   */
  it('100 g of olive oil scores 92 and grades A', () => {
    const oil = scoreMeal({
      calories: 884,
      carbs: 0,
      sugar: 0,
      protein: 0,
      fat: 100,
      fiber: 0,
      glycemic_index: 0,
    });
    expect(oil.score).toBe(92);
    expect(mealGrade(oil.score)).toBe('A');
    // …and unlike the empty plate, this one HAS energy, so the evidence gate
    // does not withhold the verdict. The patient sees "A".
    expect(qualityEvidence({ calories: 884, carbs: 0, carbs_known: true } as never)).toBe(
      'supported'
    );
  });

  /**
   * KNOWN-BAD BASELINE — audit N-3 / RU-3 D12.
   * `(m.sodium ?? 0) > 1000` reads an ABSENT sodium as 0, so a meal that
   * declares 2400 mg scores WORSE than the identical meal that declares none.
   */
  it('a missing sodium scores better than a healthy one', () => {
    const base = { calories: 600, carbs: 50, sugar: 6, protein: 25, fat: 30, fiber: 3, glycemic_index: 55 };
    expect(scoreMeal({ ...base, sodium: 2400 }).score).toBe(97);
    expect(scoreMeal(base).score).toBe(100);
  });

  /**
   * KNOWN-BAD BASELINE — audit N-7.
   * The index is weighted over the carbohydrate it COVERS, then applied to the
   * plate's TOTAL carbohydrate — extrapolating a measured subset over an
   * unmeasured remainder, disclosed only as a coverage percentage.
   */
  it('GL applies a partial-coverage index to the full carbohydrate', () => {
    const plate = aggregateItems([
      item('lentils', 400, USDA.lentils, USDA.lentils.gi),
      item('mystery sauce', 100, { kcal: 150, c: 10, s: 5, p: 2, f: 10, fib: 1 }, undefined),
    ]);
    const coveredCarbs = 4 * USDA.lentils.c; // 80.4
    expect(plate.glycemic_index).toBe(32); // weighted over covered carbs only
    expect(plate.gi_carb_coverage).toBeCloseTo(0.89, 2);
    // Applied to ALL 90.4 g:
    expect(plate.glycemic_load_value).toBe(Math.round((32 * plate.carbohydrates) / 100));
    // Over the carbohydrate the index actually speaks for it would be 25.7.
    expect((32 * coveredCarbs) / 100).toBeCloseTo(25.7, 1);
  });

  /**
   * KNOWN-BAD BASELINE — audit C-1.
   * The stored bucket bands the UNROUNDED load; the on-screen tag bands the
   * ROUNDED one. Between 20.0 and 20.5 they disagree about the same plate.
   */
  it('the stored bucket and the screen tag disagree at GL 20.4', () => {
    const carbs = 37.1;
    const gi = 55;
    expect(glValue(carbs, gi)).toBeCloseTo(20.41, 2);
    expect(glycemicLoad(carbs, gi)).toBe('High');
    expect(glBand(Math.round(glValue(carbs, gi))).key).toBe('medium');
  });

  /**
   * KNOWN-BAD BASELINE — audit N-4 / RU-3 D10.
   * The letter bands (80/65/50/35) and the word bands (85/70/50) do not line
   * up, so 80–84 is an "A" that is not "Excellent".
   */
  it('the whole 80–84 band is grade A while the word is only "Good"', () => {
    // The letter ladder breaks at 80; the word ladder breaks at 85. Every score
    // in between is an "A" that is not "Excellent". Asserted on the boundaries
    // themselves rather than through a constructed meal — the penalties are
    // coarse enough that no plate lands exactly on 84, which is itself part of
    // why the overlap went unnoticed.
    for (const s of [80, 81, 82, 83, 84]) expect(mealGrade(s)).toBe('A');
    expect(mealGrade(79)).toBe('B');
    expect(mealGrade(85)).toBe('A');
  });

  /**
   * KNOWN-BAD BASELINE — audit N-1, with the example CORRECTED.
   *
   * The first draft of the audit illustrated this with 400 g lentils + 200 g
   * bread and reported "87 · A · Excellent". That was wrong: it hand-entered a
   * sugar of 12 g where the USDA figures give 18.4 g, which crosses the
   * `sugar > 15` gate and costs 10 points. That plate is 77 · B — pinned in
   * the GL-86 fixture above.
   *
   * The contradiction is real regardless, and this is a clean instance of it:
   * a plate with 150 g of carbohydrate and a load of 48 scores 95 · A.
   */
  it('150 g of carbohydrate at GL 48 scores 95 and grades A', () => {
    const plate = {
      calories: 700, carbs: 150, sugar: 8, protein: 25, fat: 5, fiber: 20, glycemic_index: 32,
    };
    const scored = scoreMeal(plate);
    // 100 − 15 (carbs > 80) + 5 (fibre ≥ 6) + 5 (protein ≥ 20) = 95
    expect(scored.score).toBe(95);
    expect(mealGrade(scored.score)).toBe('A');
    expect(glValue(plate.carbs, plate.glycemic_index)).toBeCloseTo(48, 10);
    expect(glBand(48).key).toBe('high');
  });
});

/* ══════════════ the internal food database ══════════════ */

describe('INTERNAL FOOD DB — energy coherence and record integrity', () => {
  it('every entry is within 20 % of its Atwater energy (4/4/9)', () => {
    const bad: string[] = [];
    for (const f of MOROCCAN_FOODS) {
      const atwater = 4 * f.carbs + 4 * f.protein + 9 * f.fat;
      if (atwater <= 0) continue;
      const deviation = Math.abs((f.calories - atwater) / atwater);
      if (deviation > 0.2) bad.push(`${f.id} ${(deviation * 100).toFixed(0)}%`);
    }
    expect(bad, `outside 20% of Atwater: ${bad.join(', ')}`).toEqual([]);
  });

  it('no entry declares more sugar than carbohydrate', () => {
    const bad = MOROCCAN_FOODS.filter((f) => f.sugar > f.carbs + 1).map((f) => f.id);
    expect(bad).toEqual([]);
  });

  it('no entry declares more fibre than carbohydrate', () => {
    const bad = MOROCCAN_FOODS.filter((f) => f.fiber > f.carbs).map((f) => f.id);
    expect(bad).toEqual([]);
  });

  it('every entry publishes a glycemic index', () => {
    const missing = MOROCCAN_FOODS.filter((f) => f.glycemic_index === undefined).map((f) => f.id);
    expect(missing).toEqual([]);
  });

  it('every serving size is a plausible portion', () => {
    const bad = MOROCCAN_FOODS.filter(
      (f) => !Number.isFinite(f.serving_grams) || f.serving_grams < 5 || f.serving_grams > 2000
    ).map((f) => f.id);
    expect(bad).toEqual([]);
  });
});
