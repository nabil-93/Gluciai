import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { FoodItemResult } from '@/types';

/**
 * STEP 22C — THE SCIENTIFIC AUDIT, AS EVIDENCE.
 *
 * Every other nutrition fixture in this suite asks *"does the code do what it
 * says?"*. This file asks the different question Step 22C exists for: **on what
 * authority does each number rest?** It pins the answer for each one so that
 * moving a constant, a weight or a threshold can never again happen silently.
 *
 * Five verdicts are used, and they are not interchangeable:
 *
 *   REFERENCE   a published value the project takes from an external source
 *               (the international GI tables, Mifflin-St Jeor, the standard
 *               GL buckets, an FDA Daily Value).
 *   CALCULATED  arithmetic over values the app actually holds.
 *   ESTIMATED   inferred from a proxy (a category average, a water fraction).
 *   HEURISTIC   an app-specific rule with no external authority behind it.
 *   POLICY      a rule that encodes a nutrition or clinical judgement, and so
 *               belongs to RU-3 rather than to engineering.
 *
 * NOTHING IN THIS FILE CHANGES BEHAVIOUR. Step 22C moved no formula, no weight
 * and no threshold; the only production change was wording, and the three
 * fixtures at the end are what prove the wording is actually on the screen.
 */

vi.mock('@/i18n', () => ({
  default: {
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    language: 'fr',
  },
}));

const { scoreMeal } = await import('@/services/nutrition/mealScore');
const { giBand, glycemicLoad, buildHighlights } = await import(
  '@/services/nutrition/advice'
);
const { estimateMicros, estimateMealWaterMl, microAverage } = await import(
  '@/services/nutrition/micros'
);
const { dailyWaterNeedMl, hydrationForMeal } = await import('@/services/nutrition/hydration');

const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8');

/** A plate with nothing that trips any rule — the baseline every case moves from. */
const neutral = {
  calories: 400,
  carbs: 40,
  sugar: 5,
  protein: 10,
  fat: 10,
  fiber: 3,
  sodium: 300,
  glycemic_index: 50,
};

const item = (o: Partial<FoodItemResult> = {}): FoodItemResult => ({
  name: 'x',
  portion_grams: 100,
  calories: 100,
  carbohydrates: 10,
  sugar: 1,
  protein: 5,
  fat: 3,
  fiber: 1,
  sodium: 50,
  category: 'Vegetable',
  source: 'usda',
  detection_confidence: 0.9,
  nutrition_confidence: 0.9,
  carbs_known: true,
  ...o,
});

/* ══════════ PHASE 2 — the health score, rule by rule ══════════ */

describe('scoreMeal — every contribution, its threshold and its authority', () => {
  it('starts at 100 and only subtracts (plus two bonuses)', () => {
    // HEURISTIC. "Perfect until proven otherwise" is the assumption behind the
    // whole scale — and the reason an empty plate scored 100 before Step 22A.
    expect(scoreMeal(neutral).score).toBe(100);
    expect(src('src/services/nutrition/mealScore.ts')).toContain('let score = 100');
  });

  it('the complete rule set — 6 penalties, 2 bonuses, nothing else', () => {
    const at = (o: Partial<typeof neutral>) => scoreMeal({ ...neutral, ...o }).score;

    // GI — REFERENCE bands (Foster-Powell / Brand-Miller), HEURISTIC weights.
    expect(at({ glycemic_index: 71 })).toBe(78); // −22
    expect(at({ glycemic_index: 56 })).toBe(90); // −10
    expect(at({ glycemic_index: 40 })).toBe(100); // bonus is words only, +0 pts
    // Sugar — HEURISTIC cut-offs; 30 g/meal is near WHO's 25 g/day free-sugar ideal.
    expect(at({ sugar: 31 })).toBe(78); // −22
    expect(at({ sugar: 16 })).toBe(90); // −10
    // Carbohydrate — HEURISTIC, and NOT patient-specific (no ratio, no plan).
    expect(at({ carbs: 81 })).toBe(85); // −15
    expect(at({ carbs: 61 })).toBe(92); // −8
    // Fibre — POLICY-adjacent: +5 at ≥ 6 g, −6 below 2 g when carbs > 30.
    expect(at({ fiber: 6 })).toBe(100); // +5, then clamped back to 100
    expect(at({ fiber: 1 })).toBe(94); // −6
    // Protein — HEURISTIC +5 at ≥ 20 g.
    expect(at({ protein: 20 })).toBe(100); // +5, clamped
    // Sodium — HEURISTIC, but anchored: 1 g in one meal is half a WHO day.
    expect(at({ sodium: 1001 })).toBe(92); // −8
    // Energy — HEURISTIC, fixed for every patient regardless of their needs.
    expect(at({ calories: 801 })).toBe(92); // −8
  });

  it('UNSUPPORTED ASSUMPTION — fat is never scored, in any amount', () => {
    // The plate's fat can be anything at all and the score does not move. For a
    // diabetic that is defensible (fat barely shifts postprandial glucose); as
    // a *health* score labelled "Excellent" it is a real omission, and it is
    // why this indicator can never be reconciled with a Nutri-Score (NUTR-A1).
    expect(scoreMeal({ ...neutral, fat: 0 }).score).toBe(
      scoreMeal({ ...neutral, fat: 200 }).score
    );
    expect(src('src/services/nutrition/mealScore.ts')).not.toContain('m.fat >');
  });

  it('UNSUPPORTED ASSUMPTION — the scale is per PLATE, not per 100 g', () => {
    // Twice the food is a different score, so the number rates a serving
    // decision and not a food. Deliberate, but it means the score is not
    // comparable between two meals of different size.
    const single = scoreMeal({ ...neutral, carbs: 45, sugar: 16, calories: 450 }).score;
    const double = scoreMeal({ ...neutral, carbs: 90, sugar: 32, calories: 900 }).score;
    expect(single).toBe(90);
    expect(double).toBe(55);
  });

  it('the clamp hides accumulated bonus, and the floor hides accumulated harm', () => {
    // Two plates that are NOT equally bad both read 0; two that are not equally
    // good both read 100. The scale saturates, and nothing on screen says so.
    const bad = { calories: 2000, carbs: 200, sugar: 200, protein: 0, fat: 100, fiber: 0, sodium: 5000, glycemic_index: 95 };
    expect(scoreMeal(bad).score).toBe(19);
    expect(scoreMeal({ ...bad, sugar: 400, carbs: 400 }).score).toBe(19);
  });
});

/* ══════════ PHASE 3 — the A–E letter ══════════ */

describe('the score — REMOVED IN 22D PHASE 1: its A–E re-cut', () => {
  /**
   * The letter was `mealGrade(score)`, cut at 80/65/50/35. Step 22D Phase 1
   * deleted it: it carried no information the score does not carry, its bands
   * were never given a meaning, and it contradicted the word bands over 80–84.
   * The score assertions it accompanied are kept below, unchanged.
   */
  it('MATHEMATICALLY EXPECTED — the 480 kcal case gives 95', () => {
    // 100 − 10 (GI 70 falls in the score's `> 55` band) + 5 (protein ≥ 20 g).
    const q = scoreMeal({
      calories: 480, carbs: 50, sugar: 2, protein: 50,
      fat: 9, fiber: 3, sodium: 300, glycemic_index: 70,
    });
    expect(q.score).toBe(95);
    expect(q.label).toBe('mealScore.labelExcellent');
  });

  it('NOT NUTRITIONALLY ESTABLISHED — the same top score needs no evidence of quality', () => {
    // 100 for a plate whose only positives are that it trips no rule, and the
    // same for one carrying 120 g of fat. A top score is the ABSENCE of
    // penalties, not a demonstrated quality, and no standard defines it.
    expect(scoreMeal(neutral).score).toBe(100);
    expect(scoreMeal({ ...neutral, fat: 120 }).score).toBe(100);
  });

  it('the word band still opens at 85 (RU-3 D10 keeps the rest)', () => {
    expect(scoreMeal({ ...neutral, sugar: 16, fiber: 1, calories: 801 }).score).toBe(76);
  });
});

/* ══════════ PHASE 4 — glycemic index and load ══════════ */

describe('GI / GL — what is reference, what is assumed', () => {
  it('REFERENCE — the GI bands are the international ones', () => {
    expect([55, 56, 69, 70].map(giBand)).toEqual(['low', 'medium', 'medium', 'high']);
  });

  it('REFERENCE — the GL buckets are the standard < 10 / 10–20 / > 20', () => {
    expect(glycemicLoad(18, 55)).toBe('Low'); // 9.9
    expect(glycemicLoad(20, 55)).toBe('Medium'); // 11.0
    expect(glycemicLoad(36, 55)).toBe('Medium'); // 19.8 — the top of the band
    expect(glycemicLoad(40, 55)).toBe('High'); // 22.0
  });

  it('HIGH GI + LOW GL is coherent, not a contradiction', () => {
    // A small portion of a fast carbohydrate: watermelon at GI 72 in a 10 g
    // carbohydrate serving is a load of 7. The screen showing "GI 72 · High"
    // beside "GL 7 · Low" is correct, and the two answer different questions.
    expect(giBand(72)).toBe('high');
    expect(glycemicLoad(10, 72)).toBe('Low');
  });

  it('KNOWN-BAD — an UNKNOWN index is silently assumed to be 55 (NUTR-A5)', () => {
    // `glycemicLoad(carbs, 0)` does not refuse: it invents a moderate index and
    // returns a bucket that looks measured. The analysis screen is protected —
    // it hides the whole card when `gi === 0` — but `buildHighlights` is not,
    // so a badge can be earned from an index no source ever supplied.
    expect(glycemicLoad(30, 0)).toBe('Medium'); // 55 × 30 / 100 = 16.5
    // PHASE 2 — the assumption is unchanged, but it is now written ONCE, as a
    // named constant, instead of three times as an inline `gi > 0 ? gi : 55`
    // (advice, engine, scan-result). Naming it is what will let a caller mark a
    // load as assumed rather than measured; nothing reads that flag yet.
    expect(src('src/services/nutrition/interpret/glycemic.ts')).toContain(
      'export const ASSUMED_GI = 55'
    );
    expect(buildHighlights({
      calories: 200, carbs: 10, sugar: 1, protein: 5, fat: 3, fiber: 1,
      glycemic_index: 0, categories: [],
    })).toContain('low_glycemic_load'); // from the assumed 55, not from data
  });

  it('the LOAD spans carbohydrate the INDEX never covered (NUTR-A5)', () => {
    // `aggregateItems` averages the index over the carbs that HAVE one, then
    // the load multiplies it by the plate's whole carbohydrate. With partial
    // coverage that extrapolates. Step 22C says so on screen and in the PDF.
    const page = src('src/app/scan-result.tsx');
    expect(page).toContain("t('analysis.glScope'");
    expect(page).toContain('gi_carb_coverage');
  });

  it('KNOWN-BAD — three different answers to "is 70 high?" (RU-3)', () => {
    expect(giBand(70)).toBe('high'); // the chip
    expect(scoreMeal({ ...neutral, glycemic_index: 70 }).score).toBe(90); // −10, the MODERATE penalty
    expect(src('src/services/nutrition/engine.ts')).toContain('if (gi > 65)'); // the warning
  });
});

/* ══════════ PHASE 5 — calories and macros ══════════ */

describe('calories vs macros — they are two independent readings', () => {
  it('CALCULATED — the macro percentages use the Atwater sum, not the calorie figure', () => {
    // 50×4 + 50×4 + 9×9 = 481 against the 480 kcal the provider declared. The
    // percentages are computed from 481, so they are internally consistent and
    // do NOT reconcile with the number in the dial above them.
    const atwater = 50 * 4 + 50 * 4 + 9 * 9;
    expect(atwater).toBe(481);
    expect(Math.round((200 / atwater) * 100)).toBe(42); // protein, as displayed
    expect(Math.round((200 / atwater) * 100)).toBe(42); // carbs
    expect(100 - 42 - 42).toBe(16); // fat, as displayed — the remainder
  });

  it('DOCUMENTED, NOT A DEFECT — energy is deliberately not forced to 4/4/9', () => {
    // Alcohol is 7 kcal/g and polyols ~2.4, so a correct record can break the
    // identity. Step 11 recorded that decision; Step 22C confirms it is the
    // right one and that nothing downstream assumes otherwise.
    expect(src('src/services/nutrition/plausibility.ts')).toContain(
      'energy vs 4/4/9'
    );
  });

  it('the fat percentage absorbs all rounding drift, by construction', () => {
    // Protein and carbs are rounded independently and fat is `100 − p − c`, so
    // every rounding error in the first two lands on fat. Small, but it means
    // the fat share is not itself a computed share.
    expect(src('src/app/scan-result.tsx')).toContain('Math.max(0, 100 - pPct - cPct)');
  });
});

/* ══════════ PHASE 6 — vitamins and minerals ══════════ */

describe('micronutrients — a category density model, and its limits', () => {
  it('ESTIMATED — density per 100 g × grams, per category', () => {
    // 200 g of vegetable at 300 mg/100 g potassium = 600 mg of a 3500 mg DV.
    expect(estimateMicros([item({ category: 'Vegetable', portion_grams: 200 })]).k).toBe(17);
  });

  it('UNSUPPORTED ASSUMPTION — the model cannot tell two foods in a group apart', () => {
    // Spinach and iceberg lettuce are the same food to this table. So are cod
    // and sardine, and white rice and brown rice. The per-nutrient error is
    // therefore unbounded for any single food; only the group average is meant.
    const spinach = estimateMicros([item({ category: 'Vegetable', portion_grams: 100 })]);
    const lettuce = estimateMicros([item({ category: 'Vegetable', portion_grams: 100 })]);
    expect(spinach).toEqual(lettuce);
  });

  it('KNOWN-BAD — two of the five reference intakes are the PRE-2016 FDA values', () => {
    // The table is labelled "FDA Daily Values". Vitamin A (900 µg RAE),
    // vitamin C (90 mg) and iron (18 mg) match the current values; calcium
    // (1000 mg) and potassium (3500 mg) are the ones the 2016 labelling rule
    // REPLACED with 1300 mg and 4700 mg. Both therefore OVERSTATE coverage —
    // calcium by ~30 %, potassium by ~34 %.
    const micros = src('src/services/nutrition/micros.ts');
    expect(micros).toContain('ca: 1000');
    expect(micros).toContain('k: 3500');
    // Correcting them would move a displayed percentage, so it is RU-3's call.
    expect(micros).toContain('FDA Daily Values');
  });

  it('HEURISTIC — "good intake" is an app cut-off at a 30 % five-nutrient mean', () => {
    expect(src('src/app/scan-result.tsx')).toContain('microAvg >= 30');
    expect(microAverage({ a: 30, c: 30, fe: 30, ca: 30, k: 30 })).toBe(30);
  });
});

/* ══════════ PHASE 7 — hydration ══════════ */

describe('hydration — a water fraction per category, and a per-kg goal', () => {
  it('ESTIMATED — fraction × grams, 1 g ≈ 1 ml', () => {
    expect(estimateMealWaterMl([item({ category: 'Soup', portion_grams: 250 })])).toBe(220);
  });

  it('REFERENCE-ish — the daily need is ~35 ml/kg, by age, clamped 1.5–4 L', () => {
    // 30–40 ml/kg is a commonly cited adult range, so the constant is
    // defensible; it now steps down with age (ESPEN/Volkert bands), and the
    // 2 L fallback for an unknown weight is a population default that the card
    // labels as such through `basis`.
    expect(dailyWaterNeedMl(70, 40)).toBe(2450);
    expect(dailyWaterNeedMl(70, 80)).toBe(1750);
    expect(dailyWaterNeedMl(undefined, 40)).toBe(2000);
    expect(dailyWaterNeedMl(20, 40)).toBe(1500); // clamp
    expect(dailyWaterNeedMl(200, 40)).toBe(4000); // clamp
  });

  it('RESOLVED — food water is now SUBTRACTED from the need, not counted as drinking', () => {
    /* The recorded concern: the card showed a ring reading "% of your water
       needs" that was FILLED by the water held in the food, which silently
       answered a nutrition question nobody had answered — whether eating a
       soup discharges a drinking target.

       It no longer claims that. The card states what is left TO DRINK: the
       meal's share of the daily need, minus what the food supplies. Food water
       still counts (it is genuinely absorbed), but as a reduction of a
       remainder rather than as progress toward a goal, and the remainder is
       the number the patient is given. */
    const soup = [item({ category: 'Soup', portion_grams: 250 })] as never;
    const plan = hydrationForMeal({
      items: soup,
      mealKcal: 400,
      weightKg: 70,
      age: 40,
      dailyKcalGoal: 2000,
    });
    expect(plan.fromFoodMl).toBe(220);
    expect(plan.mealNeedMl).toBe(490); // 2450 × 400/2000
    expect(plan.toDrinkMl).toBe(270); // 490 − 220
    // And the old percentage-ring string is gone from the screen.
    expect(src('src/app/scan-result.tsx')).not.toContain("t('analysis.ofWaterNeeds')");
  });
});

/* ══════════ PHASE 8 — exercise minutes ══════════ */

describe('burn minutes — a MET model using the patient weight (NUTR-A10)', () => {
  /**
   * BEFORE (Step 22C, recorded as known-bad and pinned here): four unsourced
   * kcal-per-minute divisors — `cal / 5`, `/ 12`, `/ 8.5`, `/ 9.5` — for one
   * hypothetical 70 kg adult. `burnMinutes(cal)` took calories ONLY, while the
   * patient's weight sat four lines below the call site driving the water goal.
   *
   * THEN (external review): `kcal/min = MET × 3.5 × kg / 200`, the standard
   * conversion, with MET values from the Compendium of Physical Activities.
   * Energy cost is linear in body mass, so the minutes differed between a
   * 55 kg and a 95 kg patient — which was that fix's entire point.
   *
   * NOW: that 3.5 is the resting oxygen uptake of a reference 40-year-old male,
   * so every patient was still costed as that man, scaled only by weight. A MET
   * is a multiple of RESTING metabolism, so the model uses the patient's own —
   * Mifflin-St Jeor, which brings age, sex and height with it. The code moved
   * out of this screen into `services/nutrition/burn` so a number the patient
   * acts on can be tested without a renderer; see `burn.golden.test.ts`.
   */
  it('the divisors are gone, and the model is no longer in the screen', () => {
    const page = src('src/app/scan-result.tsx');
    expect(page).not.toContain('Math.round(cal / 5)');
    expect(page).not.toContain('Math.round(cal / 12)');
    expect(page).not.toContain('(met * 3.5 * kg) / 200');
    expect(page).toContain("from '@/services/nutrition/burn'");
  });

  it('the screen hands over the whole patient, not just their weight', () => {
    const page = src('src/app/scan-result.tsx');
    // Age is the input this step added; height and sex come with it because
    // Mifflin-St Jeor needs all three.
    expect(page).toContain('age: patientAge');
    expect(page).toContain('heightCm: profile?.height');
    expect(page).toContain('sex: profile?.gender');
  });

  it('the MET constants are named and sourced, not inline magic numbers', () => {
    const mod = src('src/services/nutrition/burn.ts');
    expect(mod).toContain('export const BURN_MET = {');
    expect(mod).toContain('Compendium of Physical Activities');
    expect(mod).toContain('export const BURN_DEFAULT_KG = 70');
    // And the reference-man fallback is kept, for a profile that cannot
    // support the personal model.
    expect(mod).toContain('(met * 3.5 * kg) / 200');
  });

  it('the caption names what actually went into the minutes', () => {
    const page = src('src/app/scan-result.tsx');
    // Three cases now, built once and shared by the screen and the PDF.
    expect(page).toContain('const burnCaption =');
    expect(page).toContain("t('analysis.burnEstimatedFull', {");
    expect(page).toContain("t('analysis.burnEstimated', { kg:");
    expect(page).toContain("t('analysis.burnEstimatedDefault')");
    // Built in one place, so the paper and the screen cannot disagree.
    expect(page.match(/burnCaption/g)?.length).toBe(3);
  });

  it('the age disclaimer survives ONLY where it is still true', () => {
    /* `burnEstimated` ends "does not take your age into account". That was
       true of the weight-only model and became a lie the moment age entered,
       so the personal case has its own string that does not say it. A caption
       that disclaims an input the number actually used is worse than none. */
    const fr = JSON.parse(src('src/i18n/locales/fr.json'));
    expect(fr.analysis.burnEstimated).toContain('ne tient pas compte de votre âge');
    expect(fr.analysis.burnEstimatedFull).not.toContain('âge)');
    expect(fr.analysis.burnEstimatedFull).toContain('{{age}}');
    // Every locale carries the new one — no French leaking into de/en/ar.
    for (const l of ['en', 'de', 'ar']) {
      const j = JSON.parse(src(`src/i18n/locales/${l}.json`));
      expect(typeof j.analysis.burnEstimatedFull).toBe('string');
      expect(j.analysis.burnEstimatedFull).not.toBe(fr.analysis.burnEstimatedFull);
    }
  });
});

/* ══════════ PHASE 1/5 — the calorie goal ══════════ */

describe('daily calorie goal — a validated equation, three assumptions around it', () => {
  it('REFERENCE — Mifflin-St Jeor, with an assumed activity factor', () => {
    const page = src('src/app/scan-result.tsx');
    expect(page).toContain('10 * weight + 6.25 * height - 5 * age + s');
    expect(page).toContain('bmr * 1.45'); // HEURISTIC: one factor for everyone
    expect(page).toContain('return 2000'); // population default
  });

  it('FIXED IN STEP 22C — the card says whether the goal is yours or the default', () => {
    const page = src('src/app/scan-result.tsx');
    expect(page).toContain('goalFromProfile');
    expect(page).toContain("t('analysis.goalEstimated')");
    expect(page).toContain("t('analysis.goalDefault')");
  });

  it('HEURISTIC — the remaining-macro split is a fixed 25 / 50 / 25', () => {
    const page = src('src/app/scan-result.tsx');
    expect(page).toContain('(goal * 0.25) / 4 - eatenP');
    expect(page).toContain('(goal * 0.5) / 4 - eatenC');
    expect(page).toContain('(goal * 0.25) / 9 - eatenF');
  });
});

/* ══════════ PHASE 10 — contradictions between surfaces ══════════ */

describe('what different screens can tell the same patient', () => {
  it('KNOWN-BAD — the barcode screen keeps a THIRD set of verdict bands (RU-3)', () => {
    expect(src('src/app/barcode.tsx')).toContain('quality.score >= 70');
    expect(src('src/app/barcode.tsx')).toContain('quality.score >= 50');
  });

  it('KNOWN-BAD — the DAY badge reuses the meal words over a different quantity', () => {
    // `0.6 × time-in-range + 0.4 × mean meal score`, then labelled with the
    // meal-score vocabulary. "Excellent" on the day badge and "Excellent" on a
    // meal are not the same claim, and the blend weights are an app choice.
    const day = src('src/components/journal/dayScore.ts');
    expect(day).toContain('0.6 * tir + 0.4 * mealAvg');
    expect(day).toContain('mealScore.labelExcellent');
  });

  it('NEW FINDING NUTR-A11 — the doctor report prints a carbohydrate FLOOR as a total', () => {
    // Step 22B taught every patient screen to write "≥ 62 g". The medical
    // document did not learn it: `reportStats` sums `result.carbohydrates` with
    // no provenance check, and `reportHtml` prints the sum as a figure.
    expect(src('src/services/reportStats.ts')).toContain(
      'row.carbs += m.result.carbohydrates ?? 0'
    );
    expect(src('src/services/reportStats.ts')).not.toContain('carbs_known');
    expect(src('src/services/reportHtml.ts')).not.toContain('carbDisplay');
  });

  it('the AI is still never handed the score — it cannot repeat a verdict', () => {
    expect(src('src/services/ai.ts')).not.toContain('meal_score');
  });
});

/* ══════════ RU-3 — the worked cases the decision package cites ══════════ */

describe('RU-3 evidence — every figure quoted in docs/RU3-NUTRITION-DECISIONS.md', () => {
  it('D1 — a plate that is essentially FAT scores 100/100 · Excellent · A', () => {
    // The case that decides D1. Nothing here trips a rule: no carbohydrate, no
    // sugar, a moderate energy figure — and 33 g of fat the model never looks
    // at. This is the strongest argument that "health score" is the wrong name
    // for what is measured.
    const q = scoreMeal({
      calories: 300, carbs: 0, sugar: 0, protein: 2,
      fat: 33, fiber: 0, sodium: 50, glycemic_index: 0,
    });
    expect(q.score).toBe(100);
    expect(q.label).toBe('mealScore.labelExcellent');
  });

  it('D1 — 9 g and 40 g of fat give the same 95 → A on the same plate', () => {
    const at = (fat: number) =>
      scoreMeal({
        calories: 480 + (fat - 9) * 9, carbs: 50, sugar: 2, protein: 50,
        fat, fiber: 3, sodium: 300, glycemic_index: 70,
      }).score;
    expect(at(9)).toBe(95);
    expect(at(40)).toBe(95);
  });

  it('the reachable range is [19, 100], not [0, 100]', () => {
    // All six penalties total 81, so the bottom fifth of the scale is dead.
    const worst = scoreMeal({
      calories: 2000, carbs: 200, sugar: 200, protein: 0,
      fat: 100, fiber: 0, sodium: 5000, glycemic_index: 95,
    });
    expect(worst.score).toBe(19);
  });

  it('D9 — the "low GI" case is worth exactly zero points', () => {
    expect(scoreMeal({ ...neutral, glycemic_index: 40 }).score).toBe(
      scoreMeal({ ...neutral, glycemic_index: 50 }).score
    );
  });

  it('D9 — GI 70 is charged the MODERATE penalty while the chip calls it high', () => {
    expect(scoreMeal({ ...neutral, glycemic_index: 70 }).score).toBe(90); // −10
    expect(scoreMeal({ ...neutral, glycemic_index: 71 }).score).toBe(78); // −22
    expect(giBand(70)).toBe('high');
  });

  it('D4 — the protein bonus is uncapped: 200 g scores like 20 g', () => {
    expect(scoreMeal({ ...neutral, protein: 20 }).score).toBe(
      scoreMeal({ ...neutral, protein: 200 }).score
    );
  });

  it('D10 — the word band still opens at 85, above the removed letter cut', () => {
    // The A–E half of D10 was answered by Step 22D Phase 1: the letter is gone,
    // so the 80–84 overlap it created is gone with it. The word bands and the
    // barcode's own set remain open.
    const q = scoreMeal({ ...neutral, glycemic_index: 71, protein: 20, fiber: 6 });
    expect(q.score).toBe(88);
    expect(q.label).toBe('mealScore.labelExcellent');
  });

  it('a sugar threshold is a cliff: 0.1 g costs 12 points and a word', () => {
    // Crossing 30 g swaps the −10 tier for the −22 tier, so the step is 12
    // points — enough to move "Excellent" → "Bon" on a tenth of a gram, which
    // is inside the rounding of every source the app reads.
    expect(scoreMeal({ ...neutral, sugar: 30 }).score).toBe(90);
    expect(scoreMeal({ ...neutral, sugar: 30.1 }).score).toBe(78);
    expect(scoreMeal({ ...neutral, sugar: 30 }).label).toBe('mealScore.labelExcellent');
    expect(scoreMeal({ ...neutral, sugar: 30.1 }).label).toBe('mealScore.labelGood');
  });

  it('D2 — no saturated-fat figure exists anywhere to score', () => {
    // Neither reader asks for it, though both upstream sources publish it.
    expect(src('src/services/nutrition/providers/usda.ts')).not.toContain('606');
    expect(src('src/services/nutrition/providers/nutriments.ts')).not.toContain(
      'saturated'
    );
    expect(src('src/services/nutrition/mealScore.ts')).not.toContain('m.saturated');
  });
});

/* ══════════ the regression Step 22C must carry forward ══════════ */

describe('the 480 kcal case — all three questions, answered separately', () => {
  const plate = {
    calories: 480, carbs: 50, sugar: 2, protein: 50,
    fat: 9, fiber: 3, sodium: 300, glycemic_index: 70,
  };

  it('1. mathematically correct — YES', () => {
    expect(scoreMeal(plate).score).toBe(95);
    expect(50 * 4 + 50 * 4 + 9 * 9).toBe(481); // vs 480 declared
  });

  it('2. nutritionally justified — NOT ESTABLISHED', () => {
    // The 95 is 100 minus one 10-point GI penalty plus one 5-point protein
    // bonus. Nothing in the project derives those two numbers from evidence,
    // the plate's fat was never examined, and no external standard was applied.
    // The score is a self-consistent app heuristic — that is all it is.
    expect(scoreMeal(plate).reasons).toEqual([
      'mealScore.giModerate:{"gi":70}',
      'mealScore.proteinGood:{"g":50}',
    ]);
    expect(scoreMeal({ ...plate, fat: 90 }).score).toBe(95); // fat is not looked at
  });

  it('3. the UI states its limitations — PARTLY, and now further', () => {
    const page = src('src/app/scan-result.tsx');
    // The A–E strip was restored by product decision after 22D Phase 1. Its
    // note must never claim an official label, and mealScore.ts still carries
    // the NUTR-A1 constraint in prose.
    expect(page).toContain("t('analysis.mealGradeNote')");
    expect(src('src/services/nutrition/mealScore.ts')).toContain(
      'NOT AN OFFICIAL NUTRITIONAL LABEL'
    );
    expect(page).toContain("t('analysis.giScoreScope')"); // GI ≠ score (Step 22A)
    expect(page).toContain("t('analysis.estimatedFromCategories')"); // micros (Step 17)
    expect(page).toContain("t('analysis.burnEstimated'"); // burn, now weight-based
    expect(page).toContain("t('analysis.goalEstimated')"); // Step 22C
    // STILL MISSING, recorded for RU-3: nothing on the screen tells the patient
    // that the health score itself is the app's own heuristic rather than a
    // nutritional standard. The LETTER says it; the /100 does not.
    expect(page).not.toContain("t('analysis.scoreHeuristicNote')");
  });
});
