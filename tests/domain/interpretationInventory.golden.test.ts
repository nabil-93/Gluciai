import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

/**
 * PHASE 1 OF THE INTERPRETATION REFACTOR — THE INVENTORY, AS EXECUTABLE FACT.
 *
 * docs/ARCHITECTURE-INTERPRETATION-AUDIT.md found 9 interpretation domains and
 * 47 sites that independently decide what a number MEANS. This file pins what
 * each site answers **today**, so that consolidating them can be proven to
 * change nothing — and so that the divergences between them stop being prose in
 * a document and become assertions that fail when someone moves them.
 *
 * READ THIS BEFORE EDITING:
 *
 *   · Many expectations here are KNOWN-BAD ON PURPOSE. A GI of 67 is asserted
 *     to be BOTH `medium` and `high`, because six surfaces disagree and that
 *     disagreement is the current product. Deleting such an assertion is not
 *     "fixing a test" — it is deleting the evidence for a decision that has not
 *     been made yet.
 *   · An assertion that reads the SOURCE of a screen exists because the rule is
 *     inline in JSX and cannot be imported. When that rule moves into
 *     `nutrition/interpret`, the assertion moves with it and gains a real
 *     function call. Until then the source text is the only handle.
 *   · Nothing in this file asserts that a divergence is CORRECT. It asserts
 *     that it exists.
 *
 * Phases 1-3 are behaviour-preserving. Every expectation below held before the
 * refactor and holds after it; that is the entire claim.
 */

vi.mock('@/i18n', () => ({
  default: {
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    language: 'fr',
  },
}));

const {
  ASSUMED_GI,
  effectiveGi,
  giBand,
  glBand,
  glValue,
  glycemicLoad,
  GLYCEMIC_TONE,
  isAssumedGi,
} = await import('@/services/nutrition/interpret/glycemic');
const { buildHighlights, qualityEvidence, scoreMeal, mealGrade, GRADE_COLORS } =
  await import('@/services/nutrition/interpret');
const { carbDisplay, carbFigure, carbFigureOf, carbText, carbUnit } = await import(
  '@/services/nutrition/interpret/format'
);
const { guessMealTime } = await import('@/services/bolusEngine');
const { computeProgramTargets, splitCarbs, mealCarbCap } = await import(
  '@/services/programEngine'
);
const { waterGoalMl, estimateMealWaterMl } = await import('@/services/nutrition/micros');
const { scoreBand } = await import('@/components/journal/dayScore');

/**
 * Source of a file, with line endings NORMALISED.
 *
 * Git rewrites these files with CRLF on checkout (core.autocrlf on Windows), so
 * an expectation containing a literal `\n` passes before a commit and fails
 * after one — which is what happened to the two-maps assertion below. The rule
 * being pinned is about the CODE, never about how the checkout stored it.
 */
const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

/** A plate that trips nothing — every case below moves one axis off it. */
const plate = (o: Record<string, unknown> = {}) => ({
  calories: 400,
  carbs: 40,
  sugar: 5,
  protein: 10,
  fat: 10,
  fiber: 3,
  sodium: 300,
  glycemic_index: 50,
  ...o,
});

/* ══════════════ §1 — GLYCEMIC INDEX: one band, six actions ══════════════ */

describe('§1 GI bands — the classification is now single', () => {
  it('giBand keeps the published cut-offs, unchanged by the move', () => {
    expect(giBand(55)).toBe('low');
    expect(giBand(56)).toBe('medium');
    expect(giBand(69)).toBe('medium');
    expect(giBand(70)).toBe('high');
    // A GI of 0 means "unknown" and still lands in `low`; callers gate on > 0.
    expect(giBand(0)).toBe('low');
  });

  it('the tone palette is one table, and it is the one both readers used', () => {
    expect(GLYCEMIC_TONE.low.color).toBe('#0f9d58');
    expect(GLYCEMIC_TONE.medium.color).toBe('#d97706');
    expect(GLYCEMIC_TONE.high.color).toBe('#dc2626');
    // The load tag on the analysis screen used to hard-code these three hexes.
    expect(glBand(25).color).toBe(GLYCEMIC_TONE.high.color);
    expect(glBand(15).color).toBe(GLYCEMIC_TONE.medium.color);
    expect(glBand(5).color).toBe(GLYCEMIC_TONE.low.color);
  });

  it('the component no longer owns a private copy of the palette', () => {
    const bar = src('src/components/ui/GlycemicBar.tsx');
    expect(bar).toContain('GLYCEMIC_TONE');
    expect(bar).not.toContain("const TONE = {");
  });

  it('and no screen re-implements the bands', () => {
    // The three delegating callers, still delegating.
    expect(src('src/components/ui/GlycemicBar.tsx')).toContain('giBand(value)');
    expect(src('src/app/healthy-food.tsx')).toContain('glycemicTone(food.gi)');
    expect(src('src/app/menu-scan.tsx')).toContain('giBand(');
    // The analysis screen's private `glBand` is gone.
    expect(src('src/app/scan-result.tsx')).not.toMatch(/function glBand\(/);
  });
});

describe('§1 KNOWN-BAD — "high GI" means 65 on five surfaces and 70 on one', () => {
  /**
   * BLOCKED: PHASE 5. Reconciling these changes what a patient is told, so it
   * needs a clinical answer, not a refactor. The audit's recommendation is to
   * keep 70 for CLASSIFICATION and expose 65 as a separate ACTION threshold —
   * two honest names instead of one contradictory one.
   */
  it('a GI of 67 is simultaneously "medium" and "high" across the app', () => {
    expect(giBand(67)).toBe('medium'); // the meter, the chip, the dish page

    // …and "high" to every action-taking surface:
    expect(src('src/services/nutrition/engine.ts')).toContain('if (gi > 65)');
    expect(src('src/services/insights.ts')).toContain(
      'lastMeal.result.glycemic_index > 65'
    );
    expect(src('src/services/weeklyReport.ts')).toContain(
      '(m.result.glycemic_index ?? 0) > 65'
    );
    expect(src('src/services/ai.ts')).toContain('food.glycemic_index > 65');
    expect(src('src/app/foods.tsx')).toContain('if (gi > 65)');
  });

  it('the score opens its harsh penalty at 70 and pays a bonus only at ≤ 40', () => {
    const at = (gi: number) => scoreMeal(plate({ glycemic_index: gi })).score;
    // 40 → bonus band, 41-55 → the dead zone, 56-70 → -10, 71+ → -22.
    expect(at(40)).toBe(100);
    expect(at(41)).toBe(100);
    expect(at(55)).toBe(100);
    expect(at(56)).toBe(90);
    expect(at(70)).toBe(90);
    expect(at(71)).toBe(78);
  });

  it('and `foods.tsx` still has a fourth cut-off nobody else uses', () => {
    // > 65 orange / > 55 amber / else green — and its warning is a RAW French
    // string rather than a `warn:` key, so it cannot re-localize.
    const foods = src('src/app/foods.tsx');
    expect(foods).toContain('if (gi > 65) return { color: colors.glucoseLow');
    expect(foods).toContain("gi > 65 ? [i18n.t('foodsPage.highGiWarning')] : []");
  });
});

/* ═══════════════════ §2 — GLYCEMIC LOAD: one formula ═══════════════════ */

describe('§2 GL — the assumption is named, the bands are shared', () => {
  it('the assumed index is one constant, used by every caller', () => {
    expect(ASSUMED_GI).toBe(55);
    expect(effectiveGi(0)).toBe(55);
    expect(effectiveGi(undefined)).toBe(55);
    expect(effectiveGi(null)).toBe(55);
    expect(effectiveGi(72)).toBe(72);
    expect(isAssumedGi(0)).toBe(true);
    expect(isAssumedGi(72)).toBe(false);
  });

  it('the three inline copies of `gi > 0 ? gi : 55` are gone', () => {
    for (const file of [
      'src/services/nutrition/advice.ts',
      'src/services/nutrition/engine.ts',
      'src/app/scan-result.tsx',
    ]) {
      expect(src(file), file).not.toMatch(/\?\s*gi\s*:\s*55|glycemicIndex\s*:\s*55/);
    }
  });

  it('glValue reproduces what all three used to compute, exactly', () => {
    expect(glValue(123, 41)).toBeCloseTo(50.43, 5);
    expect(glValue(30, 0)).toBeCloseTo(16.5, 5); // the assumed 55
    expect(Math.round(glValue(123, 41))).toBe(50);
  });

  it('both bandings keep their own thresholds', () => {
    expect(glycemicLoad(10, 72)).toBe('Low'); // 7.2
    expect(glycemicLoad(30, 0)).toBe('Medium'); // 16.5, assumed index
    expect(glycemicLoad(123, 41)).toBe('High'); // 50.4
    expect(glBand(9).key).toBe('low');
    expect(glBand(10).key).toBe('medium');
    expect(glBand(20).key).toBe('medium');
    expect(glBand(21).key).toBe('high');
  });

  it('KNOWN-BAD — rounding makes the badge and the tag disagree at GL 20.4', () => {
    /**
     * BLOCKED: needs a decision, not a refactor. `glycemicLoad` bands the
     * UNROUNDED load and feeds `high_glycemic_load`; the on-screen tag bands the
     * ROUNDED one. Between 20.0 and 20.5 the badge says high and the tag says
     * medium, for the same plate. Unifying them moves a displayed word.
     */
    const carbs = 51;
    const gi = 40; // → 20.4
    expect(glValue(carbs, gi)).toBeCloseTo(20.4, 5);
    expect(glycemicLoad(carbs, gi)).toBe('High');
    expect(glBand(Math.round(glValue(carbs, gi))).key).toBe('medium');
  });

  it('KNOWN-BAD — a load is still shown for a plate with no index at all', () => {
    /**
     * S1-2. The PDF prints "Index glycémique : 0" beside a non-zero load, which
     * is arithmetically impossible. `isAssumedGi` is the handle that will fix
     * it; NOTHING reads it yet, and wiring it changes a rendered document.
     */
    expect(src('src/app/scan-result.tsx')).toContain(
      "${row(t('analysis.giLabel'), `${gi}`)}"
    );
    expect(src('src/app/scan-result.tsx')).not.toContain('isAssumedGi');
  });
});

/* ═════════════════════════ §3 — MEAL QUALITY ═════════════════════════ */

describe('§3 quality — one import path, unchanged rules', () => {
  it('the score bands and the letter bands are what they were', () => {
    expect(mealGrade(80)).toBe('A');
    expect(mealGrade(79)).toBe('B');
    expect(mealGrade(65)).toBe('B');
    expect(mealGrade(50)).toBe('C');
    expect(mealGrade(35)).toBe('D');
    expect(mealGrade(34)).toBe('E');
    expect(GRADE_COLORS.A.bg).toBe('#17A24A');
    expect(GRADE_COLORS.E.bg).toBe('#B4441A');
  });

  it('KNOWN-BAD — the letter A spans two different words (80-84)', () => {
    /** BLOCKED: PHASE 6. RU-3 D10. */
    // −10 (sugar > 15) −8 (carbs > 60) = 82, with no bonus in play.
    const at82 = scoreMeal(plate({ sugar: 16, carbs: 61 }));
    expect(at82.score).toBe(82);
    expect(mealGrade(at82.score)).toBe('A'); // the strip raises the TOP letter
    expect(at82.label).toBe('mealScore.labelGood'); // …while the ring says "Bon"
  });

  it('KNOWN-BAD — the score and the badges use different thresholds', () => {
    /**
     * BLOCKED: PHASE 6. Aligning them changes what a patient reads.
     * Protein: good at ≥ 20 g to the score, ≥ 25 g to the badge.
     */
    const p22 = plate({ protein: 22 });
    expect(scoreMeal(p22).score).toBe(105 - 5); // the +5 protein bonus applied
    expect(scoreMeal(p22).reasons).toContain('mealScore.proteinGood:{"g":22}');
    expect(buildHighlights({ ...p22, categories: [] })).not.toContain('high_protein');

    // Carbs: "too much" at > 80 g to the score, > 75 g to the badge.
    const c78 = plate({ carbs: 78 });
    expect(scoreMeal(c78).reasons).toContain('mealScore.carbsHigh:{"g":78}'); // the -8, not the -15
    expect(buildHighlights({ ...c78, categories: [] })).toContain('carb_heavy');

    // Fibre: "poor" below 2 g to the score, below 3 g to the badge.
    const f2 = plate({ fiber: 2, carbs: 40 });
    expect(scoreMeal(f2).reasons).not.toContain('mealScore.fiberPoor');
    expect(buildHighlights({ ...f2, categories: [] })).toContain('low_fiber');
  });

  it('the evidence gate is unchanged and still the only gate', () => {
    expect(qualityEvidence({ calories: 0 })).toBe('no_data');
    expect(qualityEvidence({ calories: NaN })).toBe('no_data');
    expect(qualityEvidence({ calories: 400, carbs_known: false })).toBe('carbs_unknown');
    expect(qualityEvidence({ calories: 400, carbs_known: true })).toBe('supported');
  });

  it('KNOWN-BAD — an unidentified plate still STORES 100', () => {
    /**
     * S1-1. Every patient screen withholds the verdict; the stored number is
     * what the doctor panel prints, ungated. Closing this touches a surface
     * outside the app bundle — Phase 6.
     */
    const empty = {
      calories: 0, carbs: 0, sugar: 0, protein: 0, fat: 0, fiber: 0,
      sodium: 0, glycemic_index: 0,
    };
    expect(scoreMeal(empty).score).toBe(100);
    expect(qualityEvidence({ calories: 0 })).toBe('no_data');
  });

  it('KNOWN-BAD — five sites still recompute the score independently', () => {
    /** BLOCKED: PHASE 6 (`mealVerdict`). They now share ONE import path. */
    for (const file of [
      'src/services/nutrition/engine.ts',
      'src/app/scan-result.tsx',
      'src/components/LastMealCard.tsx',
      'src/app/menu-scan.tsx',
      'src/app/barcode.tsx',
    ]) {
      expect(src(file), file).toContain('scoreMeal(');
    }
    // …and every one of them reads it from the interpretation module.
    for (const file of [
      'src/app/scan-result.tsx',
      'src/components/LastMealCard.tsx',
      'src/app/menu-scan.tsx',
      'src/app/barcode.tsx',
    ]) {
      expect(src(file), file).toContain('@/services/nutrition/interpret');
    }
  });

  it('KNOWN-BAD — barcode scores a product with no glycemic index at all', () => {
    /** S2 long tail, Phase 8. The call simply omits the field. */
    expect(src('src/app/barcode.tsx')).not.toMatch(
      /scoreMeal\(\{[^}]*glycemic_index/s
    );
  });

  it('KNOWN-BAD — the day badge borrows the meal vocabulary', () => {
    /** S2-6, BLOCKED: PHASE 6. Its bands are the WORD bands, not the letters'. */
    expect(scoreBand(85).key).toBe('mealScore.labelExcellent');
    expect(scoreBand(70).key).toBe('mealScore.labelGood');
    expect(scoreBand(50).key).toBe('mealScore.labelModerate');
    expect(scoreBand(49).key).toBe('mealScore.labelPoor');
    // A third palette: A's green from the letters, Excellent's from the words.
    expect(scoreBand(85).color).toBe('#17A24A');
    expect(scoreBand(70).color).toBe('#37B24D');
  });

  it('KNOWN-BAD — the doctor panel bands at 70/45, the app at 85/70/50', () => {
    /** S2-8, BLOCKED: PHASE 6. Outside the bundle; served raw today. */
    expect(src('public/panel-x7k42m/app.js')).toContain(
      "r.meal_score >= 70 ? 'green' : r.meal_score >= 45 ? 'amber' : 'red'"
    );
  });
});

/* ═════════════════════════ §4 — MEAL TIMING ═════════════════════════ */

describe('§4 KNOWN-BAD — six hour→meal maps, none of them shared', () => {
  /**
   * BLOCKED: PHASE 4. The canonical map must be `bolusEngine.guessMealTime`'s,
   * so the display layer converges on the clinical one — and that map has a
   * 16:00-18:00 gap which is a clinical question, not an engineering one.
   */
  const at = (h: number) => new Date(Date.UTC(2026, 0, 15, h, 30));

  it('the clinical map — and its gap', () => {
    expect(guessMealTime(at(8))).toBe('breakfast');
    expect(guessMealTime(at(13))).toBe('lunch');
    expect(guessMealTime(at(20))).toBe('dinner');
    // 16:00-17:59 falls through to `snack`, which reuses the LUNCH ratio.
    expect(guessMealTime(at(17))).toBe('snack');
  });

  it('the home screen holds two different maps, in one file', () => {
    const home = src('src/app/(tabs)/index.tsx');
    // `slotOfMeal` — fills the breakfast/lunch/dinner cards. 17:00 → dinner.
    expect(home).toContain("return h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner';");
    // `mealLabel` — labels the timeline rows. 17:00 → SNACK.
    expect(home).toContain("h < 19\n            ? t('home.mealSnack')");
  });

  it('and three more maps elsewhere', () => {
    // No clock at all: an untyped meal is a snack.
    expect(src('src/app/nutrition.tsx')).toContain("(m.meal_type ?? 'snack')");
    expect(src('src/components/MealPeekModal.tsx')).toContain("meal?.meal_type ?? 'snack'");
    // A fourth: < 11 / < 16 / < 22 / snack.
    expect(src('src/components/LoggerConfirmCard.tsx')).toContain("if (h < 22) return 'dinner';");
    // A fifth: the backdating windows.
    expect(src('src/services/aiLogger.ts')).toContain('dinner: { start: 16, end: 23, rep: 20 }');
  });

  it('the analysis screen deliberately guesses nothing — the correct behaviour', () => {
    expect(src('src/app/scan-result.tsx')).toContain(
      'the meal is deliberately NOT pre-filled from the clock'
    );
  });
});

/* ══════════════ §5 §6 — CALORIE AND CARBOHYDRATE TARGETS ══════════════ */

describe('§5/§6 KNOWN-BAD — five daily-target implementations', () => {
  /** BLOCKED: PHASE 7, which is blocked on RU-3. */
  /* No birth date on purpose: `ageFrom` then returns its documented fallback of
     35, so this fixture cannot drift as the calendar moves. */
  const profile = { weight: 80, height: 175, gender: 'male' as const };

  it('programEngine is the real one, and only "Mon Programme" uses it', () => {
    const t = computeProgramTargets({
      profile: profile as never,
      goal: 'stabilize',
      activityLevel: 'light',
    });
    // 10×80 + 6.25×175 − 5×35 + 5 = 1723.75 → 1724. Note the age fallback is
    // 35 here and 30 on the analysis screen — see the degraded copy below.
    expect(t.bmr).toBe(1724);
    expect(t.tdee).toBe(2371); // ×1.375, one of FIVE activity factors
    expect(t.carbsG).toBeGreaterThan(0);
    // Its per-meal ceiling is spike-aware and scales with the day.
    expect(mealCarbCap(200)).toBe(75);
    expect(mealCarbCap(400)).toBe(140);
    expect(splitCarbs(200).lunch).toBe(70);
  });

  it('the analysis screen re-implements it, degraded', () => {
    const s = src('src/app/scan-result.tsx');
    expect(s).toContain('const bmr = 10 * weight + 6.25 * height - 5 * age + s;');
    expect(s).toContain('return Math.round((bmr * 1.45) / 50) * 50;'); // ONE factor
    expect(s).toContain('if (!weight || !height) return 2000;'); // silent default
    expect(s).toContain(': 30;'); // age fallback 30, programEngine says 35
  });

  it('and three screens hold flat tables instead', () => {
    expect(src('src/app/nutrition.tsx')).toContain(
      'const GOALS = { kcal: 2000, carbs: 250, protein: 90, fat: 65, fiber: 30 };'
    );
    expect(src('src/app/(tabs)/index.tsx')).toContain('const CARB_GOAL = 250;');
    expect(src('src/app/healthy-food.tsx')).toContain('food.calories / 2000');
    expect(src('src/app/healthy-food.tsx')).toContain('food.carbs / 250');
  });

  it('the same 2000 kcal patient is told three different protein targets', () => {
    // scan-result: goal × 25 % ÷ 4 = 125 g · nutrition page: 90 g · dish page: 100 g
    expect(Math.round((2000 * 0.25) / 4)).toBe(125);
    expect(src('src/app/nutrition.tsx')).toContain('protein: 90');
    expect(src('src/app/healthy-food.tsx')).toContain('food.protein / 100');
  });

  it('BMI and BMR are each computed twice, with different rounding', () => {
    // `programEngine.computeBMI` rounds to 1 dp; `recommendations` compares the
    // UNROUNDED value and formats with toFixed. Unifying can move a boundary
    // case, so Phase 2 left both alone.
    expect(src('src/services/recommendations.ts')).toContain(
      'const bmi = profile.weight / Math.pow(profile.height / 100, 2);'
    );
    expect(src('src/services/programEngine.ts')).toContain('export function computeBMI');
  });

  it('the meal-level carbohydrate rules ignore the engine ceiling', () => {
    // score: > 80 / > 60 · badge: > 75 · engine: max(75, 35 % of the day)
    expect(scoreMeal(plate({ carbs: 81 })).reasons).toContain(
      'mealScore.carbsVeryHigh:{"g":81}'
    );
    expect(scoreMeal(plate({ carbs: 61 })).reasons).toContain('mealScore.carbsHigh:{"g":61}');
    expect(buildHighlights({ ...plate({ carbs: 76 }), categories: [] })).toContain('carb_heavy');
  });

  it('KNOWN-BAD — the home ring calls a low-carb day "under target"', () => {
    /** S1-4, BLOCKED: PHASE 7. */
    expect(src('src/app/(tabs)/index.tsx')).toContain('if (value < goal * 0.6) return zones[0];');
  });

  it('KNOWN-BAD — the calorie chip is personalised, the penalty is flat', () => {
    /** S2-3, BLOCKED: PHASE 7. 800 kcal, whatever the patient's goal. */
    expect(scoreMeal(plate({ calories: 801 })).reasons).toContain(
      'mealScore.caloric:{"kcal":801}'
    );
    expect(scoreMeal(plate({ calories: 800 })).reasons).not.toContain('mealScore.caloric');
    expect(src('src/app/scan-result.tsx')).toContain('Math.round((dailyGoal * 0.4) / 50) * 50');
  });
});

/* ═══════════════════════════ §7 — HYDRATION ═══════════════════════════ */

describe('§7 hydration — computed once, interpreted in JSX', () => {
  it('the two computations are already single', () => {
    expect(waterGoalMl(80)).toBe(2800);
    expect(waterGoalMl(undefined)).toBe(2000);
    expect(waterGoalMl(20)).toBe(1500); // clamped
    expect(waterGoalMl(150)).toBe(4000); // clamped
    expect(estimateMealWaterMl([])).toBe(0);
  });

  it('KNOWN-BAD — the ring reads as hydration status, and always nags', () => {
    /** S2-10, BLOCKED: PHASE 8. */
    const s = src('src/app/scan-result.tsx');
    expect(s).toContain("Math.round((mealWaterMl / waterTargetMl) * 100)");
    expect(s).toContain("t('analysis.ofWaterNeeds')");
    // Printed with no condition on the ring's own value.
    expect(s).toContain("<Text style={styles.waterHint}>{t('analysis.drinkReminder')}</Text>");
  });
});

/* ═════════════════════ §6 (render) — CARB FORMATTING ═════════════════════ */

describe('§6 formatting — one assembly, byte-for-byte the old strings', () => {
  it('carbFigure produces exactly what four screens hand-wrote', () => {
    const exact = carbDisplay('known', 62);
    expect(carbFigure(exact)).toEqual({ text: '62', unit: 'g', full: '62 g' });

    // The separator after "≥" is a NON-BREAKING space (U+00A0) — at 375 px and
    // in Arabic the two halves used to land on different lines. Spelled with an
    // escape so this expectation cannot be silently "tidied" into U+0020.
    const NB = '\u00A0';
    const floor = carbDisplay('unknown', 62);
    expect(carbText(floor)).toBe(`≥${NB}62`);
    expect(carbFigure(floor).full).toBe(`≥${NB}62 g`);

    const none = carbDisplay('unknown', 0);
    expect(carbUnit(none)).toBe('');
    // No unit after a dash: "— g" would read as a quantity.
    expect(carbFigure(none)).toEqual({ text: '—', unit: '', full: '—' });
  });

  it('carbFigureOf is the same answer from a status and a total', () => {
    expect(carbFigureOf('known', 62).full).toBe('62 g');
    expect(carbFigureOf('indeterminate', 0).full).toBe('—');
  });

  it('KNOWN-BAD — six clinician surfaces still print a floor as a total', () => {
    /**
     * S1-7. Routing these through `carbFigure` is one line each — and it is a
     * VISIBLE change ("62 g" → "≥ 62 g" on six screens), which Phase 3 was
     * scoped to exclude. This assertion is the switch's guard: when the six
     * migrate, it flips to the positive form.
     */
    for (const file of [
      'src/app/day.tsx',
      'src/app/(tabs)/journal.tsx',
      'src/app/program-day.tsx',
    ]) {
      expect(src(file), file).toMatch(/Math\.round\([^)]*carbohydrates\)/);
      expect(src(file), file).not.toContain('@/services/nutrition/interpret');
    }
    expect(src('src/app/report.tsx')).toContain('carbs: m.result.carbohydrates');
    expect(src('src/services/weeklyReport.ts')).toContain(
      '(m.result.carbohydrates ?? 0)'
    );
    expect(src('public/panel-x7k42m/app.js')).toContain(
      'Math.round(m.carbs ?? r.carbohydrates ?? 0)'
    );
  });
});

/* ════════════════════════ THE MODULE'S OWN SHAPE ════════════════════════ */

describe('interpret/ — the seam itself', () => {
  it('the leaf module imports nothing, so nothing can cycle through it', () => {
    const g = src('src/services/nutrition/interpret/glycemic.ts');
    expect(g).not.toMatch(/^import /m);
  });

  it('advice re-exports rather than re-implements', () => {
    const a = src('src/services/nutrition/advice.ts');
    expect(a).toContain("} from './interpret/glycemic';");
    expect(a).not.toMatch(/export function giBand\(/);
    expect(a).not.toMatch(/export function glycemicLoad\(/);
  });

  it('the barrel documents what is delivered and what is blocked', () => {
    const i = src('src/services/nutrition/interpret/index.ts');
    for (const name of ['./format', './glycemic', './quality']) {
      expect(i).toContain(`export * from '${name}';`);
    }
    // The three that do not exist yet are named, with their blocker.
    for (const blocked of ['timing', 'targets', 'hydration']) {
      expect(i).toContain(blocked);
    }
  });
});
