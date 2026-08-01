import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import ar from '@/i18n/locales/ar.json';
import de from '@/i18n/locales/de.json';
import en from '@/i18n/locales/en.json';
import fr from '@/i18n/locales/fr.json';
import {
  estimateMealWaterMl,
  estimateMicros,
  microProvenance,
} from '@/services/nutrition/micros';
import { readNutriments } from '@/services/nutrition/providers/nutriments';
import type { FoodCategory, FoodItemResult } from '@/types';

/**
 * CHARACTERIZATION — WHERE EACH NUMBER ON THE MEAL SCREEN COMES FROM.
 *
 * The question this file answers is not "is the value right" but "what kind of
 * value is it": declared by the source, calculated from declared values,
 * inferred from a category, defaulted, or absent and printed as `0` anyway.
 *
 * Four kinds live on that screen:
 *
 *   DECLARED    calories, carbs, sugar, protein, fat, fibre, sodium — read from
 *               the provider entry (`readNutriments`) or the AI fallback.
 *   CALCULATED  macro %, GI (carb-weighted), GL, the meal score, burn minutes —
 *               arithmetic over declared values.
 *   ESTIMATED   vitamins, minerals and the meal's water, which NO provider
 *               supplies: they are a category density × the grams on the plate
 *               (`micros.ts`). NUTR-A2 / NUTR-A3.
 *   ABSENT      a nutrient the source never stated. Carbohydrate says so
 *               (`carbs_known`, Step 10); the other six are printed as `0`.
 *
 * Both modules under test are pure (type-only imports), so nothing is mocked.
 * The `micros.ts` fixtures here characterize PROVENANCE; the arithmetic itself
 * is pinned in nutritionMicros.golden.test.ts and is not touched by Step 17.
 */

const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8');

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

/* ─────────── 1. DECLARED vs ABSENT — what a `0` on screen means ─────────── */

describe('provider-declared nutrition, and the absences inside it', () => {
  it('a declared value is carried through as declared — including a real 0', () => {
    // Bottled water: every nutrient is genuinely zero, and the entry says so.
    const r = readNutriments({
      'energy-kcal_100g': 0,
      carbohydrates_100g: 0,
      sugars_100g: 0,
      proteins_100g: 0,
      fat_100g: 0,
      fiber_100g: 0,
      sodium_100g: 0,
    });
    expect(r.per100g).toMatchObject({
      calories: 0,
      carbs: 0,
      sugar: 0,
      protein: 0,
      fat: 0,
      fiber: 0,
      sodium: 0,
      carbs_known: true,
    });
    expect(r.hasEnergy).toBe(true);
    expect(r.fieldsFound).toBe(7);
  });

  it('carbohydrate is the ONE nutrient whose absence survives the reader', () => {
    const r = readNutriments({ 'energy-kcal_100g': 250 });
    expect(r.per100g.carbs).toBe(0); // placeholder, not a measurement…
    expect(r.per100g.carbs_known).toBe(false); // …and it says so
    expect(r.hasCarbs).toBe(false);
  });

  /**
   * KNOWN-BAD BASELINE — NUTR-B1 (remaining six nutrients). NOT IN SCOPE FOR
   * STEP 17, and deliberately not fixed here: Step 10 closed carbohydrate
   * because that is what a dose is computed from. Recorded so the ambiguity is
   * visible rather than assumed away.
   */
  it('for the other six, a stated 0 and an absent value are indistinguishable', () => {
    const declaredZero = readNutriments({
      'energy-kcal_100g': 0,
      sugars_100g: 0,
      proteins_100g: 0,
      fat_100g: 0,
      fiber_100g: 0,
      sodium_100g: 0,
      carbohydrates_100g: 0,
    });
    const nothingStated = readNutriments({ carbohydrates_100g: 0 });

    for (const key of ['calories', 'sugar', 'protein', 'fat', 'fiber', 'sodium'] as const) {
      expect(declaredZero.per100g[key], `${key} declared 0`).toBe(0);
      expect(nothingStated.per100g[key], `${key} absent`).toBe(0);
    }
    // The only signal that the second entry is nearly empty is a count nothing
    // renders (NUTR-A7): `fieldsFound` 7 vs 1.
    expect(declaredZero.fieldsFound).toBe(7);
    expect(nothingStated.fieldsFound).toBe(1);
  });
});

/* ─────────────── 2. ESTIMATED — vitamins, minerals, water ─────────────── */

describe('micronutrients and water are inferred, never measured', () => {
  it('the estimate ignores the food\'s actual nutrition entirely', () => {
    // Same category, same grams, wildly different measured macros → identical
    // micronutrients. Nothing about the real food reaches this number.
    const lean = estimateMicros([item('Vegetable', 100, { calories: 20, fiber: 1 })]);
    const rich = estimateMicros([
      item('Vegetable', 100, { calories: 900, fiber: 30, protein: 40 }),
    ]);
    expect(rich).toEqual(lean);
    expect(estimateMealWaterMl([item('Vegetable', 100, { calories: 900 })])).toBe(
      estimateMealWaterMl([item('Vegetable', 100, { calories: 20 })])
    );
  });

  it('it is the CATEGORY that decides, and the grams that scale it', () => {
    expect(estimateMicros([item('Vegetable', 100)]).c).toBe(33); // 30 mg / 90 mg DV
    expect(estimateMicros([item('Bread', 100)]).c).toBe(0); // same grams, no C
    expect(estimateMealWaterMl([item('Vegetable', 100)])).toBe(92); // 0.92 × 100 g
    expect(estimateMealWaterMl([item('Snack', 100)])).toBe(10); // 0.10 × 100 g
  });

  it('a food no database could identify is excluded from both estimates', () => {
    const plate = [item('Vegetable', 100), item('Rice', 200, { nutrition_confidence: 0 })];
    expect(estimateMicros(plate)).toEqual(estimateMicros([item('Vegetable', 100)]));
    expect(estimateMealWaterMl(plate)).toBe(estimateMealWaterMl([item('Vegetable', 100)]));
    // …so the estimate covers 100 g of a 300 g plate, and nothing on screen
    // said which fraction it rested on.
  });

  /** KNOWN-BAD — NUTR-B3. Threshold unchanged by Step 17 (that would move
   *  displayed values); Step 17 only makes the weakness visible. */
  it('a barely-identified food still contributes its full category density', () => {
    const unsure = estimateMicros([item('Vegetable', 100, { nutrition_confidence: 0.1 })]);
    expect(unsure).toEqual(estimateMicros([item('Vegetable', 100)]));
  });

  /** Part of NUTR-A2's recorded finding: the clamp hides the magnitude. */
  it('a plate delivering 300 % of a nutrient reads as exactly 100 %', () => {
    const huge = estimateMicros([item('Fruit', 800)]); // 280 mg C ≈ 311 % of 90
    expect(huge.c).toBe(100);
  });
});

/* ────────────── 3. KNOWN-BAD — the estimate is dressed as fact ────────── */

describe('FIXED IN STEP 17 — the inferred values say they are inferred', () => {
  /**
   * BEFORE (recorded green against the old code — docs/KNOWN-BAD-BASELINE.md):
   *
   *   fr `waterFromMeal` === "{{ml}} ml apportés par ce repas" — a factual
   *     claim, in all four locales, about a category-derived number
   *   no locale had `estimatedFromCategories`, `estimateCoverage`,
   *     `estimateLowConfidence` or `atLeastPct`
   *   the GI chip was the ONLY qualified number on the screen; the vitamins
   *     card (five filled bars + percentages) and the hydration card (a ring,
   *     a millilitre figure) carried nothing
   *   the sharable meal PDF printed both with no qualifier at all
   *   micros.ts exposed no provenance, so no surface COULD have said it
   *
   * AFTER: `microProvenance` reports what the estimate rests on, and both cards
   * plus the PDF say it — in the vocabulary the GI chip already used. **Not one
   * displayed number changed**: the fixtures in blocks 1 and 2, and every
   * fixture in nutritionMicros.golden.test.ts, are untouched.
   */

  const LOCALES = { fr, en, de, ar } as Record<string, { analysis: Record<string, string> }>;

  it('the hydration line is now explicitly an estimate, in all four locales', () => {
    for (const [lang, dict] of Object.entries(LOCALES)) {
      expect(dict.analysis.waterFromMeal, `${lang}`).toMatch(/≈/); // was: a bare figure
      expect(dict.analysis.waterFromMeal, `${lang}`).toContain('{{ml}}'); // value preserved
    }
  });

  it('every locale carries the estimate vocabulary, and it is translated', () => {
    for (const [lang, dict] of Object.entries(LOCALES)) {
      for (const key of [
        'estimatedFromCategories',
        'estimateCoverage',
        'estimateLowConfidence',
        'atLeastPct',
      ] as const) {
        expect(dict.analysis[key], `${lang}.${key}`).toBeTruthy();
      }
      expect(dict.analysis.estimateCoverage, `${lang}`).toContain('{{pct}}');
      expect(dict.analysis.estimateLowConfidence, `${lang}`).toContain('{{g}}');
      expect(dict.analysis.atLeastPct, `${lang}`).toContain('≥');
    }
    // Four locales, four distinct sentences — none left untranslated.
    expect(
      new Set(Object.values(LOCALES).map((d) => d.analysis.estimatedFromCategories)).size
    ).toBe(4);
  });

  it('both estimate cards on the screen now qualify their numbers', () => {
    const screen = src('src/app/scan-result.tsx');
    expect(screen).toContain("t('analysis.estimatedFromCategories')");
    expect(screen).toContain("t('analysis.estimateCoverage'");
    expect(screen).toContain("t('analysis.estimateLowConfidence'");
    expect(screen).toContain("t('analysis.atLeastPct'");
    // The GI chip's own wording is untouched.
    expect(screen).toContain("t('analysis.giEstimated')");
  });

  it('the PDF carries the same qualifier, and the capped "≥"', () => {
    const screen = src('src/app/scan-result.tsx');
    expect(screen).toContain("bar(t('analysis.vitaminA'), micros.a, microProv.atLeast.a)");
    expect(screen).toContain("row(t('analysis.hydration'), t('analysis.waterFromMeal'");
    expect(screen).not.toContain("row(t('analysis.hydration'), `${mealWaterMl} ml`)");
  });
});

describe('microProvenance — what the estimate rests on', () => {
  /** New in Step 17. It reports; it never changes a value. */

  it('reports full coverage for a plate every database recognised', () => {
    const p = microProvenance([item('Vegetable', 100), item('Rice', 200)]);
    expect(p.coverageRatio).toBe(1);
    expect(p.unsureGrams).toBe(0);
    expect(p.atLeast).toEqual({ a: false, c: false, fe: false, ca: false, k: false });
  });

  it('reports the share the estimate could actually use', () => {
    // 100 g known + 200 g unidentified → the bars describe a third of the plate.
    const p = microProvenance([
      item('Vegetable', 100),
      item('Rice', 200, { nutrition_confidence: 0 }),
    ]);
    expect(p.coverageRatio).toBeCloseTo(1 / 3, 5);
  });

  it('names the grams that were counted in full on a weak identification', () => {
    const p = microProvenance([
      item('Vegetable', 100, { nutrition_confidence: 0.1 }),
      item('Rice', 150),
    ]);
    expect(p.unsureGrams).toBe(100); // NUTR-B3, now visible rather than silent
    expect(p.coverageRatio).toBe(1); // it still counts — the threshold did not move
  });

  it('flags exactly the nutrients whose share was capped at 100 %', () => {
    const plate = [item('Fruit', 800)]; // ≈ 311 % vitamin C, 178 % A, 124 % K
    const est = estimateMicros(plate);
    const p = microProvenance(plate);
    expect(est.c).toBe(100);
    expect(p.atLeast.c).toBe(true); // "≥ 100 %", not "100 %"
    expect(p.atLeast.fe).toBe(false); // 3.2 mg of 18 mg — a real 18 %
    expect(est.fe).toBe(18);
  });

  it('agrees with estimateMicros exactly at the boundary', () => {
    // A share that rounds to exactly 100 is a match, not a floor.
    const plate = [item('Vegetable', 300)]; // 90 mg C / 90 mg DV = 100 %
    expect(estimateMicros(plate).c).toBe(100);
    expect(microProvenance(plate).atLeast.c).toBe(false);
  });

  it('an empty plate is full coverage of nothing, not a division by zero', () => {
    const p = microProvenance([]);
    expect(p.coverageRatio).toBe(1);
    expect(p.unsureGrams).toBe(0);
  });
});
