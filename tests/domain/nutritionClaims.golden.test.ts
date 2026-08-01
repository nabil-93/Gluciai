import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it, vi } from 'vitest';

import type { FoodItemResult } from '@/types';

/**
 * CHARACTERIZATION — WHAT THE NUTRITION RESULT CLAIMS, AND ON WHAT EVIDENCE
 * (Step 22A: the quality verdict, the A–E letter, the GI/GL classification and
 * the advice line).
 *
 * Three separate things are pinned here and they must not be confused:
 *
 *   1. the ARITHMETIC — `scoreMeal`, `glycemicLoad`,
 *      `aggregateItems`. Step 22A changes none of it: every fixture in blocks
 *      1–3 must survive the step byte-for-byte.
 *   2. the EVIDENCE — whether the plate behind a verdict holds anything that
 *      could support it (energy, and a carbohydrate that is a real value).
 *   3. the CLAIM — the number, the word and the tip actually put in
 *      front of the patient. That is the only part Step 22A moves.
 *
 * `mealScore.ts` and `engine.ts` reach the runtime through `@/i18n` only; the
 * stub echoes the key, so the assertions characterize WHAT is handed to the
 * translator rather than any one language's wording.
 */

vi.mock('@/i18n', () => ({
  default: {
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    language: 'fr',
  },
}));

// `engine.ts` is the only module here with runtime dependencies: three of its
// imports reach React Native, AsyncStorage or Supabase at module load, while
// `aggregateItems` itself touches none of them. Stubbed exactly as
// nutritionScaling.golden.test.ts does, so the pure function runs in node.
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

const { scoreMeal } = await import('@/services/nutrition/mealScore');
const {
  glycemicLoad,
  giBand,
  buildHighlights,
  displayableHighlights,
  qualityEvidence,
  qualityClaimSupported,
} = await import('@/services/nutrition/advice');
const { aggregateItems } = await import('@/services/nutrition/engine');
const { dayScore } = await import('@/components/journal/dayScore');

const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8');

/** A plate with every field stated, so a fixture varies one thing at a time. */
const plate = (o: Partial<Parameters<typeof scoreMeal>[0]> = {}) => ({
  calories: 500,
  carbs: 50,
  sugar: 10,
  protein: 15,
  fat: 15,
  fiber: 3,
  sodium: 300,
  glycemic_index: 45,
  ...o,
});

/** THE 480 kcal SCREENSHOT — captured from the live UI during Step 21. */
const SCREENSHOT = plate({
  calories: 480,
  carbs: 50,
  sugar: 8,
  protein: 50,
  fat: 9,
  fiber: 4,
  glycemic_index: 70,
});

/** A plate the pipeline could not resolve: every number is a placeholder. */
const UNIDENTIFIED = plate({
  calories: 0,
  carbs: 0,
  sugar: 0,
  protein: 0,
  fat: 0,
  fiber: 0,
  sodium: 0,
  glycemic_index: 0,
});

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
  source: 'usda',
  detection_confidence: 0.9,
  nutrition_confidence: 0.9,
  carbs_known: true,
  ...o,
});

/* ══════════ 1. the arithmetic — Step 22A must not move any of it ══════════ */

describe('scoreMeal — the numbers Step 22A leaves alone', () => {
  it('the 480 kcal screenshot scores 95 and reads "Excellent"', () => {
    const q = scoreMeal(SCREENSHOT);
    // 100 − 10 (GI 70 lands in the score's MODERATE band) + 5 (protein ≥ 20)
    expect(q.score).toBe(95);
    expect(q.label).toBe('mealScore.labelExcellent');
  });

  it('its calories and macros are arithmetically consistent', () => {
    // 50×4 + 50×4 + 9×9 = 481 against the 480 shown — NUTR-A4 is about the
    // double rounding and the two totals, not an error of this size.
    const kcal = SCREENSHOT.protein * 4 + SCREENSHOT.carbs * 4 + SCREENSHOT.fat * 9;
    expect(kcal).toBe(481);
    expect(Math.abs(kcal - SCREENSHOT.calories)).toBeLessThanOrEqual(1);
  });

  it('KNOWN-BAD — a plate nothing was identified in scores a perfect 100', () => {
    const q = scoreMeal(UNIDENTIFIED);
    expect(q.score).toBe(100); // no data ⇒ no penalty ⇒ full marks
    expect(q.label).toBe('mealScore.labelExcellent');
    expect(q.reasons).toEqual(['mealScore.balanced']); // "balanced meal"
  });

  it('a genuinely good plate and a genuinely bad one still rank correctly', () => {
    const good = scoreMeal(plate({ fiber: 8, protein: 30, sugar: 3, glycemic_index: 35 }));
    const bad = scoreMeal(plate({ sugar: 45, carbs: 95, fiber: 1, glycemic_index: 85 }));
    expect(good.score).toBe(100);
    expect(bad.score).toBe(35);
  });

  it('the score is a pure function of the eight numbers it is given', () => {
    expect(scoreMeal(SCREENSHOT).score).toBe(scoreMeal({ ...SCREENSHOT }).score);
  });
});

/* ══ 2. grade, label and verdict — three boundary sets over ONE number ══ */

describe('the word bands over the 0..100 score', () => {
  /**
   * STEP 22D PHASE 1 — the A–E letter this block also covered was REMOVED, and
   * with it the 80–84 letter/word contradiction it pinned. What remains is the
   * word alone, whose own boundaries are unchanged.
   */
  it('the WORD boundaries are 85 / 70 / 50', () => {
    const eighty = scoreMeal(plate({ glycemic_index: 60, sugar: 20, protein: 5 }));
    expect(eighty.score).toBe(80); // −10 GI, −10 sugar
    expect(eighty.label).toBe('mealScore.labelGood'); // 80 is "Bon", not "Excellent"
    expect(scoreMeal(plate({ glycemic_index: 60, sugar: 35, carbs: 65 })).score).toBe(60);
  });

  it('KNOWN-BAD — the barcode screen adds a THIRD set of boundaries (70 / 50)', () => {
    const barcode = src('src/app/barcode.tsx');
    expect(barcode).toContain('quality.score >= 70');
    expect(barcode).toContain('quality.score >= 50');
  });

  it('KNOWN-BAD — the day badge reuses the word boundaries over a MEAN', () => {
    const day = src('src/components/journal/dayScore.ts');
    expect(day).toContain('score >= 85');
    expect(day).toContain('.map((e) => e.meal.result.meal_score)');
  });
});

/* ═══════ 3. the glycemic index — one number, three classifications ═══════ */

describe('KNOWN-BAD — GI 70 is classified differently in three places', () => {
  it('the shared chip calls ≥ 70 high (low ≤ 55 · medium 56–69 · high ≥ 70)', () => {
    // BEFORE: `GlycemicBar.tsx` carried `value <= 55` / `value <= 69` inline.
    // AFTER: the same boundaries, now read from `giBand` — block 6 pins them.
    expect([55, 69, 70].map(giBand)).toEqual(['low', 'medium', 'high']);
    expect(src('src/components/ui/GlycemicBar.tsx')).toContain('giBand(value)');
  });

  it('the score calls 70 MODERATE — its harsh band opens at 71', () => {
    expect(scoreMeal(plate({ glycemic_index: 70 })).score).toBe(90); // −10
    expect(scoreMeal(plate({ glycemic_index: 71 })).score).toBe(78); // −22
    const mod = scoreMeal(plate({ glycemic_index: 70 })).reasons[0];
    expect(mod).toContain('mealScore.giModerate');
  });

  it('the engine warns "high GI" from 66 — a third boundary again', () => {
    const warned = aggregateItems([item({ glycemic_index: 66 })]);
    expect(warned.warnings).toContain('warn:high_gi');
    const quiet = aggregateItems([item({ glycemic_index: 65 })]);
    expect(quiet.warnings).not.toContain('warn:high_gi');
  });

  it('so one plate can read "IG 70 · Élevé" beside "95/100 · Excellent"', () => {
    // The exact screenshot contradiction, in two lines.
    expect(scoreMeal(SCREENSHOT).label).toBe('mealScore.labelExcellent');
    expect(SCREENSHOT.glycemic_index).toBeGreaterThanOrEqual(70); // "Élevé" on the chip
  });

  it('the glycemic LOAD keeps its own standard bands (< 10 · 10–20 · > 20)', () => {
    expect(glycemicLoad(50, 70)).toBe('High'); // 35
    expect(glycemicLoad(20, 50)).toBe('Medium'); // 10
    expect(glycemicLoad(10, 40)).toBe('Low'); // 4
    expect(glycemicLoad(30, 0)).toBe('Medium'); // NUTR-A5: assumes GI 55 → 16.5
  });
});

/* ═════ 4. the evidence behind a verdict — what exists, and what reads it ═ */

describe('the engine already knows a plate is unsupported', () => {
  it('a wholly unidentified plate arrives as zeros with carbs UNKNOWN', () => {
    const r = aggregateItems([
      item({ calories: 0, carbohydrates: 0, sugar: 0, protein: 0, fat: 0, fiber: 0,
        sodium: 0, glycemic_index: undefined, nutrition_confidence: 0, carbs_known: false }),
    ]);
    expect(r.calories).toBe(0);
    expect(r.carbs_known).toBe(false);
    expect(r.warnings.some((w) => w.startsWith('warn:unmatched'))).toBe(true);
  });

  it('KNOWN-BAD — and the engine stores meal_score 100 for it anyway', () => {
    const r = aggregateItems([
      item({ calories: 0, carbohydrates: 0, sugar: 0, protein: 0, fat: 0, fiber: 0,
        sodium: 0, glycemic_index: undefined, nutrition_confidence: 0, carbs_known: false }),
    ]);
    expect(r.meal_score).toBe(100);
  });

  it('an empty plate is the same case', () => {
    const r = aggregateItems([]);
    expect(r.calories).toBe(0);
    expect(r.carbs_known).toBe(false);
    expect(r.meal_score).toBe(100);
  });

  it('Step 18 already suppresses the BADGES on exactly that evidence', () => {
    const stored = buildHighlights({ ...UNIDENTIFIED });
    expect(stored).toContain('low_sugar');
    expect(displayableHighlights(stored, { calories: 0 })).not.toContain('low_sugar');
    expect(displayableHighlights(stored, { calories: 500, carbs_known: false })).not.toContain(
      'low_sugar'
    );
  });

  it('BEFORE — nothing applied that evidence to the score, letter or tip', () => {
    /**
     * Recorded green against the pre-Step-22A tree
     * (docs/KNOWN-BAD-BASELINE.md): `advice.ts` exported no verdict gate, and
     * all four surfaces rendered `quality.score` / `d.score.score`
     * unconditionally, so an unidentified plate showed "100 · Excellent · A"
     * and the day badge averaged that 100 in.
     */
    const advice = src('src/services/nutrition/advice.ts');
    expect(advice).toContain('qualityClaimSupported'); // AFTER: the gate exists
  });
});

/* ══════════ 5. FIXED IN STEP 22A — a verdict now needs evidence ══════════ */

describe('the quality verdict is gated on the evidence, not manufactured', () => {
  it('an unidentified plate can carry no verdict, and says which case it is', () => {
    expect(qualityEvidence({ calories: 0 })).toBe('no_data');
    expect(qualityClaimSupported({ calories: 0 })).toBe(false);
  });

  it('a plate whose carbohydrate is only a floor cannot either', () => {
    expect(qualityEvidence({ calories: 620, carbs_known: false })).toBe('carbs_unknown');
    expect(qualityClaimSupported({ calories: 620, carbs_known: false })).toBe(false);
  });

  it('a plate with data keeps its verdict, unchanged', () => {
    expect(qualityEvidence({ calories: 480, carbs_known: true })).toBe('supported');
    expect(qualityClaimSupported({ calories: 480, carbs_known: true })).toBe(true);
    // The 480 kcal screenshot is a SUPPORTED plate: Step 22A does not touch it.
    expect(scoreMeal(SCREENSHOT).score).toBe(95);
  });

  it('a legacy plate with no flag is judged on its energy alone', () => {
    // Same rule `displayableHighlights` already applied to the badges.
    expect(qualityClaimSupported({ calories: 500 })).toBe(true);
    expect(qualityClaimSupported({ calories: 0 })).toBe(false);
    expect(qualityClaimSupported(null)).toBe(false);
  });

  it('the badge filter and the verdict gate are ONE rule, not two', () => {
    const stored = buildHighlights({ ...UNIDENTIFIED });
    for (const plateArg of [
      { calories: 0 },
      { calories: 500, carbs_known: false },
      { calories: 500, carbs_known: true },
    ]) {
      const badgesKept = displayableHighlights(stored, plateArg).length === stored.length;
      expect(badgesKept).toBe(qualityClaimSupported(plateArg));
    }
  });

  it('the score itself is NOT changed — only what may be shown', () => {
    // The engine still stores 100 for an unidentified plate: no arithmetic
    // moved, no stored `meal_score` was rewritten, no migration.
    expect(scoreMeal(UNIDENTIFIED).score).toBe(100);
    expect(aggregateItems([]).meal_score).toBe(100);
  });

  it('every surface that shows a verdict now gates it', () => {
    const screen = src('src/app/scan-result.tsx');
    expect(screen).toContain('const evidence = qualityEvidence(result)');
    expect(screen).toContain('const rated = evidence ===');
    expect(screen).toContain("t('analysis.scoreUnavailable')");
    expect(screen).toContain("esc(t('analysis.scoreUnavailableTitle'))"); // the PDF

    expect(src('src/components/LastMealCard.tsx')).toContain('qualityClaimSupported(r)');
    expect(src('src/app/barcode.tsx')).toContain('qualityClaimSupported({');
    expect(src('src/app/menu-scan.tsx')).toContain('rated: qualityClaimSupported({');
    expect(src('src/components/journal/dayScore.ts')).toContain(
      '.filter((e) => qualityClaimSupported(e.meal.result))'
    );
  });

  it('an unsupported meal no longer pulls the day badge up', () => {
    const meal = (result: Record<string, unknown>) =>
      ({ kind: 'meal', meal: { result } }) as never;
    // Two meals: one real 60, one unidentified 100.
    const events = [
      meal({ calories: 700, carbs_known: true, meal_score: 60 }),
      meal({ calories: 0, carbs_known: false, meal_score: 100 }),
    ];
    expect(dayScore(events, 70, 180)).toBe(60); // was 80 — the mean of both
    // A day of nothing but unidentified plates has no score at all.
    expect(dayScore([meal({ calories: 0, meal_score: 100 })], 70, 180)).toBeNull();
  });
});

/* ════════ 6. ONE glycemic-index classification for the whole app ════════ */

describe('giBand — the canonical GI bands, used everywhere they are shown', () => {
  it('carries the standard boundaries the chip already used', () => {
    expect([0, 40, 55].map(giBand)).toEqual(['low', 'low', 'low']);
    expect([56, 65, 69].map(giBand)).toEqual(['medium', 'medium', 'medium']);
    expect([70, 71, 100].map(giBand)).toEqual(['high', 'high', 'high']);
  });

  it('the shared chip now delegates instead of repeating the numbers', () => {
    const bar = src('src/components/ui/GlycemicBar.tsx');
    expect(bar).toContain('giBand(value)');
    expect(bar).not.toContain('value <= 55');
    expect(bar).not.toContain('value <= 69');
  });

  it('the menu screen classifies with the same function', () => {
    const menu = src('src/app/menu-scan.tsx');
    expect(menu).toContain('giBand(d.item.glycemic_index ?? 0)');
    expect(menu).not.toContain('> 65'); // its own redder boundary is gone
  });

  it('OPEN (RU-3) — the score and the warning keep their own boundaries', () => {
    // Unchanged on purpose: moving either changes a patient-facing number or
    // removes a safety warning. Both are recorded as nutrition-policy calls.
    expect(scoreMeal(plate({ glycemic_index: 70 })).score).toBe(90); // −10, not −22
    expect(giBand(70)).toBe('high'); // …while the chip calls the same 70 high
    expect(aggregateItems([item({ glycemic_index: 66 })]).warnings).toContain('warn:high_gi');
    expect(giBand(66)).toBe('medium');
  });

  it('the screen says the two measures are not the same question', () => {
    expect(src('src/app/scan-result.tsx')).toContain("t('analysis.giScoreScope')");
  });
});
