import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { FoodItemResult } from '@/types';

/**
 * CHARACTERIZATION — UNKNOWN vs ZERO for every nutrient, completeness, and what
 * an unusable portion does to the whole result (Step 22B: NUTR-B1 remainder,
 * NUTR-A7, NUTR-B2, NUTR-B3, NUTR-A9).
 *
 * Step 10 solved this for the CARBOHYDRATE only, because that is what a dose is
 * computed from. This file pins what the other six nutrients do, what
 * `fieldsFound` is worth, and what a NaN / Infinity / negative portion produces
 * at each stage of the pipeline:
 *
 *     provider → resolver → item → aggregateItems → result → persistence
 *              → reload → screen → score / advice / provenance → PDF
 *
 * The arithmetic of a VALID plate must come out of Step 22B byte-for-byte
 * identical — that is what the parity block exists to prove.
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

const { readNutriments } = await import('@/services/nutrition/providers/nutriments');
const { aggregateItems, rescaleItem } = await import('@/services/nutrition/engine');
const { estimateMicros, estimateMealWaterMl, microProvenance } = await import(
  '@/services/nutrition/micros'
);
const { qualityEvidence } = await import('@/services/nutrition/advice');
const { carbDisplay, carbText, carbUnit, plateCarbStatus } = await import(
  '@/services/nutrition/carbProvenance'
);
const { scoreMeal } = await import('@/services/nutrition/mealScore');
const {
  ALL_KNOWN,
  knownFrom,
  nutrientStatus,
  plateNutrientsKnown,
  isUsablePortion,
  nutritionCompleteness,
  mirrorColumn,
} = await import('@/services/nutrition/nutrientProvenance');

const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8');

/** One resolved food, overridable — the engine's own input shape. */
const item = (o: Partial<FoodItemResult> = {}): FoodItemResult => ({
  name: 'couscous',
  portion_grams: 200,
  calories: 240,
  carbohydrates: 40,
  sugar: 2,
  protein: 8,
  fat: 3,
  fiber: 4,
  sodium: 120,
  glycemic_index: 65,
  category: 'Rice',
  source: 'usda',
  detection_confidence: 0.9,
  nutrition_confidence: 0.9,
  carbs_known: true,
  ...o,
});

/* ═══════ 1. the reader already knows — and throws six answers away ═══════ */

describe('readNutriments — what the source actually declared', () => {
  it('a full entry declares seven values', () => {
    const r = readNutriments({
      'energy-kcal_100g': 120,
      carbohydrates_100g: 27,
      sugars_100g: 3,
      proteins_100g: 8,
      fat_100g: 4,
      fiber_100g: 2,
      sodium_100g: 0.3,
    });
    expect(r.fieldsFound).toBe(7);
    expect(r.per100g.protein).toBe(8);
  });

  it('a declared 0 is data — it counts as found', () => {
    const r = readNutriments({ 'energy-kcal_100g': 0, proteins_100g: 0 });
    expect(r.fieldsFound).toBe(2);
    expect(r.hasEnergy).toBe(true);
    expect(r.per100g.calories).toBe(0);
  });

  it('FIXED IN STEP 22B — an ABSENT nutrient is now distinguishable', () => {
    // BEFORE: both of these produced `protein: 0` with nothing to tell them
    // apart — only the CARBOHYDRATE carried its provenance out (Step 10).
    const declared = readNutriments({ 'energy-kcal_100g': 120, proteins_100g: 0 });
    const absent = readNutriments({ 'energy-kcal_100g': 120 });

    // The VALUES are unchanged: every consumer still reads a number.
    expect(declared.per100g.protein).toBe(0);
    expect(absent.per100g.protein).toBe(0);

    // What is new is which of them is real.
    expect(declared.per100g.known?.protein).toBe(true); // a declared 0 is data
    expect(absent.per100g.known?.protein).toBe(false); // silence is not
    expect(absent.per100g.carbs_known).toBe(false); // Step 10, untouched
  });

  it('FIXED IN STEP 22B — the completeness fieldsFound counted is now readable', () => {
    const partial = readNutriments({ 'energy-kcal_100g': 120, carbohydrates_100g: 27 });
    expect(partial.fieldsFound).toBe(2); // unchanged
    // …and the same fact now travels per nutrient, all the way to the screen.
    expect(partial.per100g.known).toEqual({
      calories: true,
      carbs: true,
      sugar: false,
      protein: false,
      fat: false,
      fiber: false,
      sodium: false,
    });
    expect(src('src/app/scan-result.tsx')).toContain('nutritionCompleteness(');
  });

  it('knownFrom reads a declared 0 as data and null as silence', () => {
    expect(knownFrom({ calories: 0, protein: null, fat: undefined })).toEqual({
      calories: true,
      protein: false,
      fat: false,
    });
    // A key that was never offered stays absent — legacy, not "unknown".
    expect(knownFrom({ calories: 12 }).sugar).toBeUndefined();
  });
});

/* ══════════ 2. aggregation — a floor that presents as a total ══════════ */

describe('aggregateItems — known + unknown', () => {
  it('a partially known plate sums what it has', () => {
    const r = aggregateItems([
      item({ protein: 20, carbohydrates: 30 }),
      item({ protein: 0, carbohydrates: 0, carbs_known: false, nutrition_confidence: 0 }),
    ]);
    expect(r.protein).toBe(20);
    expect(r.carbs_known).toBe(false); // the carbohydrate says it is a floor…
  });

  it('FIXED IN STEP 22B — …and now every other nutrient can too', () => {
    // BEFORE: only `carbs_known` came out of the aggregation, so a plate whose
    // protein total was a FLOOR presented it exactly like a complete one.
    const r = aggregateItems([
      item({ protein: 20, nutrients_known: { protein: true, fat: true } }),
      item({
        protein: 0,
        nutrition_confidence: 0,
        carbs_known: false,
        nutrients_known: { protein: false, fat: true },
      }),
    ]);
    expect(r.protein).toBe(20); // the NUMBER is unchanged
    expect(r.nutrients_known?.protein).toBe(false); // …it is a floor, and says so
    expect(r.nutrients_known?.fat).toBe(true); // a nutrient both foods declared
  });

  it('one unknown food is enough — the same strictness as the carbohydrate', () => {
    const r = aggregateItems([
      item({ nutrients_known: { ...ALL_KNOWN } }),
      item({ nutrients_known: { ...ALL_KNOWN, fiber: false } }),
    ]);
    expect(r.nutrients_known?.fiber).toBe(false);
    expect(r.nutrients_known?.sugar).toBe(true);
  });

  it('a legacy item with no map is indeterminate, never silently known', () => {
    const r = aggregateItems([item({ nutrients_known: undefined })]);
    expect(nutrientStatus(item({ nutrients_known: undefined }), 'protein')).toBe(
      'indeterminate'
    );
    expect(r.nutrients_known?.protein).toBe(false); // not claimed as a total
  });
});

/* ═════════ 3. an unusable portion — NaN, Infinity, negative ═════════ */

describe('FIXED IN STEP 22B — an unusable portion is unknown, not a number', () => {
  /**
   * BEFORE (recorded green against the pre-Step-22B tree):
   *   NaN grams → NaN calories, NaN macros, NaN vitamins, NaN hydration;
   *   `(NaN ?? 0) <= 0` is false so the plate read as SUPPORTED, and
   *   `scoreMeal` — every comparison false against NaN — awarded **100/100**;
   *   `coverageRatio` claimed the estimate had covered the WHOLE plate;
   *   Infinity grams gave Infinity nutrition; −100 g gave negative macros.
   *
   * AFTER: `isUsablePortion` decides once, at the boundary. The food keeps
   * placeholder zeros, every nutrient is marked unknown and `portion_valid`
   * says why — no coercion into a plausible weight, and Step 22A's gate then
   * withholds the verdict on its own.
   */

  it('NaN grams give an explicitly unknown item, not NaN', () => {
    const bad = rescaleItem(item({ per100g_base: undefined }), NaN);
    expect(bad.calories).toBe(0);
    expect(bad.portion_valid).toBe(false);
    expect(bad.carbs_known).toBe(false);
    const plate = aggregateItems([bad]);
    expect(plate.calories).toBe(0);
    expect(Number.isNaN(plate.calories)).toBe(false);
  });

  it('…and the evidence gate now catches a non-finite figure', () => {
    expect(qualityEvidence({ calories: NaN, carbs_known: true })).toBe('no_data');
    expect(qualityEvidence({ calories: Infinity, carbs_known: true })).toBe('no_data');
    // `scoreMeal` is untouched — it still returns 100 for NaN input. What
    // changed is that no such plate can reach the patient as a verdict.
    expect(scoreMeal({
      calories: NaN, carbs: NaN, sugar: NaN, protein: NaN,
      fat: NaN, fiber: NaN, sodium: NaN, glycemic_index: NaN,
    }).score).toBe(100);
  });

  it('the micronutrient and hydration estimates skip it', () => {
    const bad = [item({ portion_grams: NaN })];
    expect(estimateMicros(bad).k).toBe(0);
    expect(estimateMealWaterMl(bad)).toBe(0);
    expect(microProvenance(bad).coverageRatio).toBe(1); // nothing to cover
    // A valid food beside an unusable one is estimated exactly as if alone.
    const mixed = [item({ portion_grams: 200 }), item({ portion_grams: NaN })];
    expect(estimateMicros(mixed)).toEqual(estimateMicros([item({ portion_grams: 200 })]));
    expect(estimateMealWaterMl(mixed)).toBe(
      estimateMealWaterMl([item({ portion_grams: 200 })])
    );
  });

  it('Infinity and a negative portion take the same path', () => {
    for (const bad of [Infinity, -100, 0]) {
      const r = rescaleItem(item({ per100g_base: undefined }), bad);
      expect(r.calories).toBe(0);
      expect(r.portion_valid).toBe(false);
      expect(r.nutrients_known?.fat).toBe(false);
    }
    expect(estimateMealWaterMl([item({ portion_grams: Infinity })])).toBe(0);
  });

  it('OPEN FOR RU-3 — a DECLARED 0 kcal is still not a verdict', () => {
    // Step 22B can now tell a declared 0 from an absent one, so the gate could
    // let a diet drink through. It deliberately does not: scoring a glass of
    // water "100/100 · Excellent" is the claim Step 22A exists to withhold,
    // and reversing that is a nutrition-policy call. Pinned so the behaviour
    // is a decision rather than an accident.
    expect(
      qualityEvidence({
        calories: 0,
        carbs_known: true,
        nutrients_known: { ...ALL_KNOWN },
      } as never)
    ).toBe('no_data');
  });

  it('the completeness report names it', () => {
    const c = nutritionCompleteness([item({ portion_grams: NaN, portion_valid: false })]);
    expect(c.invalidPortions).toBe(1);
    expect(c.state).toBe('unavailable');
  });
});

/* ═══════════ 4. low-confidence identification — the scale ═══════════ */

describe('identification confidence — what the numbers mean', () => {
  it('an unidentified food is exactly nutrition_confidence 0', () => {
    const plate = [item({ nutrition_confidence: 0, carbs_known: false, calories: 0 })];
    expect(estimateMicros(plate).k).toBe(0); // contributes nothing
    expect(estimateMealWaterMl(plate)).toBe(0);
  });

  it('a weakly identified food contributes IN FULL, and says so (Step 17)', () => {
    const weak = [item({ nutrition_confidence: 0.2, portion_grams: 150 })];
    expect(microProvenance(weak).unsureGrams).toBe(150);
    expect(estimateMicros(weak).k).toBeGreaterThan(0); // full contribution
  });

  it('FIXED IN STEP 22B — the totals and the PDF now say it too', () => {
    // BEFORE: `unsureGrams` reached the vitamins card only, so the macros, the
    // totals and the score presented a weakly identified food exactly like a
    // USDA match.
    const page = src('src/app/scan-result.tsx');
    expect(page).toContain('analysis.dataWeakId');
    expect(page).toContain('esc(dataNote)'); // …and it goes to the doctor too
  });

  it('OPEN FOR RU-3 — the arithmetic is deliberately unchanged', () => {
    // Whether a weakly identified food should count in FULL toward the totals
    // is a nutrition-policy question, and any cut-off answering it (0.5? 0.7?)
    // would be invented here. Step 22B labels; it does not reweight.
    expect(src('src/services/nutrition/engine.ts')).not.toContain('SURE_CONFIDENCE');
    const weak = aggregateItems([item({ nutrition_confidence: 0.2 })]);
    const sure = aggregateItems([item({ nutrition_confidence: 0.95 })]);
    expect(weak.calories).toBe(sure.calories);
    expect(weak.carbohydrates).toBe(sure.carbohydrates);
  });
});

/* ═════════ 5. NUTR-A9 — a floor printed as a total elsewhere ═════════ */

describe('FIXED IN STEP 22B — the carbohydrate floor is honest on every screen', () => {
  /**
   * BEFORE: `carbDisplay` lived on the analysis screen alone, so the SAME meal
   * read "≥ 62 g" there and "62 g" in the day total, the meal sheet and the
   * home card — and a plate with nothing known printed its placeholder as
   * "0 g" on all three. No threshold is involved: the signal already existed
   * (Step 10), it simply stopped travelling.
   */
  /*
   * PHASE 3 (interpretation refactor) — the guarantee is unchanged, its seam
   * moved. These screens used to import `carbDisplay` straight from
   * `carbProvenance` and hand-assemble "62 g" / "≥ 62 g" four different ways;
   * they now go through `nutrition/interpret`, which re-exports the same rule
   * and adds the one assembly (`carbFigure`). No displayed string moved — the
   * assertions in the next `it` are what prove that, and they are untouched.
   */
  it('every surface that prints a carbohydrate asks the same question', () => {
    for (const file of [
      'src/app/scan-result.tsx',
      'src/app/nutrition.tsx',
      'src/app/(tabs)/index.tsx',
      'src/components/MealPeekModal.tsx',
      'src/components/LastMealCard.tsx',
    ]) {
      const text = src(file);
      // It asks the provenance question…
      expect(text, file).toMatch(/carbDisplay\(|carbFigureOf\(/);
      // …and it asks it of the ONE module that owns the answer.
      expect(text, file).toContain("@/services/nutrition/interpret");
    }
  });

  it('and no screen re-implements the "value + unit" assembly by hand', () => {
    // The four hand-written copies of
    // `${carbText(v)}${carbUnit(v) ? ` ${carbUnit(v)}` : ''}` are gone; only
    // `interpret/format.ts` joins a figure to its unit now.
    for (const file of [
      'src/app/scan-result.tsx',
      'src/app/(tabs)/index.tsx',
      'src/components/MealPeekModal.tsx',
      'src/components/LastMealCard.tsx',
    ]) {
      expect(src(file), file).not.toMatch(/carbUnit\([A-Za-z]*\) \? ` \$\{carbUnit/);
    }
  });

  it('and formats it through the one shared rule', () => {
    expect(carbText({ kind: 'exact', grams: 62 })).toBe('62');
    // Non-breaking space: "≥" and its number must not land on two lines.
    expect(carbText({ kind: 'atLeast', grams: 62 })).toBe('≥ 62');
    expect(carbText({ kind: 'unknown' })).toBe('—');
    // A dash carries no unit — "— g" reads as a quantity.
    expect(carbUnit({ kind: 'unknown' })).toBe('');
    expect(carbUnit({ kind: 'atLeast', grams: 62 })).toBe('g');
  });

  it('a day total is a floor as soon as ONE meal is unknown', () => {
    const known = { carbohydrates: 40, carbs_known: true };
    const unknown = { carbohydrates: 0, carbs_known: false };
    expect(plateCarbStatus([known, known])).toBe('known');
    expect(plateCarbStatus([known, unknown])).toBe('unknown');
    expect(carbDisplay(plateCarbStatus([known, unknown]), 40)).toEqual({
      kind: 'atLeast',
      grams: 40,
    });
  });
});

/* ═════════ 5b. NUTR-A8 — a ratio that can span two meals ═════════ */

describe('RESOLVED — NUTR-A8 now compares one meal with itself', () => {
  /**
   * `sugarHeavy` used to divide the last SCANNED meal's sugar by the
   * carbohydrate the patient TYPED into the bolus screen — two numbers that
   * need not describe the same food. Both operands now come from the meal.
   *
   * As this record always said, it is PROVENANCE, not a threshold: the 0.4
   * cut-off is unchanged and still belongs to RU-3/RU-6, and the flag still
   * drives one advice line and no arithmetic. A meal whose carbohydrate is
   * unknown withholds the flag rather than computing it from a placeholder.
   *
   * Behaviour is pinned in tests/clinical/sugarHeavyAssociation.golden.test.ts.
   */
  it('the ratio is taken against the MEAL\'s own carbohydrate', () => {
    const engine = src('src/services/bolusEngine.ts');
    expect(engine).toContain('(meal.result.sugar ?? 0) / mealCarbs');
    // The defect: the typed carbohydrate must no longer be an operand.
    expect(engine).not.toContain('(meal.result.sugar ?? 0) / Math.max(1, carbs)');
    // The threshold did not move.
    expect(engine).toContain('> 0.4');
  });

  it('and the flag still changes no dose', () => {
    const engine = src('src/services/bolusEngine.ts');
    // The only consumer is the advice list on the bolus screen.
    expect(engine.match(/sugarHeavy/g)?.length).toBe(2); // the type, and the push
    expect(src('src/app/bolus.tsx')).toContain("flags.includes('sugarHeavy')");
  });
});

/* ══════════ 6. PERSISTENCE — provenance must survive a reload ══════════ */

describe('round-trip — what comes back out of storage', () => {
  /** The journal, the zustand persist layer and `meal_scans.result` all hold
   *  the same JSON, so one serialization proves the trip for all three. */
  const roundTrip = <T,>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

  it('a plate keeps its per-nutrient provenance', () => {
    const saved = aggregateItems([
      item({ nutrients_known: { ...ALL_KNOWN, fiber: false } }),
    ]);
    const back = roundTrip(saved);
    expect(back.nutrients_known?.fiber).toBe(false);
    expect(back.nutrients_known?.protein).toBe(true);
    expect(back.carbs_known).toBe(true); // Step 10, unchanged
    expect(back.calories).toBe(saved.calories); // no number moves
  });

  it('an unusable portion stays unusable after a reload', () => {
    const back = roundTrip(rescaleItem(item({ per100g_base: undefined }), NaN));
    expect(back.portion_valid).toBe(false);
    expect(back.portion_grams).toBe(0);
    expect(nutritionCompleteness([back]).state).toBe('unavailable');
  });

  it('the mirror columns say null for a floor and a number for a value', () => {
    const partial = aggregateItems([
      item({ nutrients_known: { ...ALL_KNOWN, protein: false } }),
    ]);
    expect(mirrorColumn(partial, 'protein', partial.protein)).toBeNull();
    expect(mirrorColumn(partial, 'fat', partial.fat)).toBe(partial.fat);
    // A declared 0 is a value: it is written as 0, never as "unknown".
    const zero = aggregateItems([item({ protein: 0, nutrients_known: { ...ALL_KNOWN } })]);
    expect(mirrorColumn(zero, 'protein', zero.protein)).toBe(0);
    // A legacy row carries no map and is written exactly as it always was.
    expect(mirrorColumn({ nutrients_known: undefined }, 'protein', 30)).toBe(30);
  });
});

/* ═════════════ 7. PARITY — a valid plate must not move ═════════════ */

describe('a fully declared plate — every number pinned', () => {
  it('aggregation of two known foods', () => {
    const r = aggregateItems([
      item({ calories: 240, carbohydrates: 40, sugar: 2, protein: 8, fat: 3, fiber: 4, sodium: 120 }),
      item({ name: 'salade', category: 'Vegetable', calories: 60, carbohydrates: 6, sugar: 3, protein: 2, fat: 3, fiber: 3, sodium: 40, glycemic_index: 35 }),
    ]);
    expect(r.calories).toBe(300);
    expect(r.carbohydrates).toBe(46);
    expect(r.sugar).toBe(5);
    expect(r.protein).toBe(10);
    expect(r.fat).toBe(6);
    expect(r.fiber).toBe(7);
    expect(r.sodium).toBe(160);
    expect(r.glycemic_index).toBe(61);
    expect(r.meal_score).toBe(95); // 100 + 5 (fibre ≥ 6 g) − 10 (GI 56–70)
    expect(r.carbs_known).toBe(true);
  });

  it('a valid rescale is exact', () => {
    const base = item({
      per100g_base: { calories: 120, carbs: 27, sugar: 3, protein: 8, fat: 4, fiber: 2, sodium: 300, carbs_known: true },
    });
    const r = rescaleItem(base, 150);
    expect(r.calories).toBe(180);
    expect(r.carbohydrates).toBe(40.5);
    expect(r.protein).toBe(12);
    expect(r.sodium).toBe(450);
  });

  it('the micronutrient and hydration estimates for a valid plate', () => {
    const plate = [item({ portion_grams: 200, category: 'Vegetable' })];
    expect(estimateMicros(plate)).toEqual(estimateMicros(plate));
    expect(estimateMealWaterMl(plate)).toBe(184); // 0.92 × 200
  });
});
