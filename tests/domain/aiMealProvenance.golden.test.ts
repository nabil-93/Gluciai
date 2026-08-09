import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { carbStatus } from '@/services/nutrition/carbProvenance';
import type { MealScan } from '@/types';

/**
 * `aiLogger` and `program` pull in React Native transitively, which the node
 * test environment cannot parse. The established convention in this suite
 * (see interpretationInventory.golden.test.ts) is to assert on the SOURCE for
 * those modules, so the rule is still pinned and the bug still cannot return.
 */
const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

/**
 * S1-8 — a meal the patient DESCRIBED must not look better characterised than
 * one they photographed.
 *
 * `sanitizeAction` defaults `glycemic_index` to 50 when the model states none.
 * A GI of 50 is `low` under `giBand`, so the plate rendered a green "Bas" chip
 * and a glycemic load computed from a number nobody measured — with no
 * "estimé" marker, because `glycemic_index_estimated` was only ever set by the
 * engine's own category fallback. The app's unknown-vs-zero contract was
 * bypassed for the one nutrient it is least able to guess.
 *
 * THE VALUE IS UNCHANGED. The placeholder 50 is still 50; what is new is that
 * the plate now says so, through the flag the analysis screen ALREADY renders
 * a caption from. No threshold, no band, no formula moved.
 */
describe('S1-8 — an AI-described meal declares whether its index was stated', () => {
  const logger = () => src('src/services/aiLogger.ts');

  it('records whether the model actually stated an index', () => {
    // Same `stated()` predicate the carbohydrate beside it already uses.
    expect(logger()).toContain('glycemic_index_known: stated(raw.glycemic_index)');
  });

  it('keeps the placeholder VALUE unchanged — only its provenance is new', () => {
    // The 50 default and the 0..110 clamp are untouched.
    expect(logger()).toContain('Math.round(num(raw.glycemic_index, 50))');
    expect(logger()).toContain('Math.min(110, Math.max(0,');
  });

  it('marks the persisted result as estimated when no index was stated', () => {
    expect(logger()).toContain(
      'glycemic_index_estimated: action.glycemic_index_known !== true'
    );
  });

  it('the programme path marks its own placeholder too', () => {
    const program = src('src/services/program.ts');
    expect(program).toContain('glycemic_index: meal.gi ?? 50'); // value unchanged
    expect(program).toContain('glycemic_index_estimated: meal.gi == null');
  });

  it('the analysis screen already renders a caption from that flag', () => {
    // The fix works because this consumer pre-existed — nothing new was
    // invented to display it.
    expect(src('src/app/scan-result.tsx')).toContain('result.glycemic_index_estimated');
  });
});

/**
 * S1-7 — the weekly report is a CLINICIAN surface and summed raw carbohydrate.
 * The patient reads "≥ 62 g — ce total est un minimum" while the doctor's
 * weekly narrative said "62 g … au total".
 */
describe('S1-7 — the weekly narrative marks a carbohydrate floor', () => {
  const meal = (carbohydrates: number, carbs_known?: boolean): MealScan =>
    ({
      id: `m-${carbohydrates}-${String(carbs_known)}`,
      user_id: 'u',
      created_at: new Date().toISOString(),
      result: {
        food_name: 'test',
        estimated_portion: '300 g',
        calories: 400,
        carbohydrates,
        sugar: 5,
        protein: 10,
        fat: 10,
        fiber: 3,
        glycemic_index: 50,
        confidence: 1,
        warnings: [],
        ...(carbs_known === undefined ? {} : { carbs_known }),
      },
    }) as MealScan;

  it('a plate with a declared carbohydrate is not a floor', () => {
    expect(carbStatus(meal(60, true).result)).toBe('known');
  });

  it('a plate with an unknown carbohydrate IS a floor', () => {
    expect(carbStatus(meal(0, false).result)).toBe('unknown');
  });

  it('a legacy non-zero value stays trusted; a legacy zero does not', () => {
    // A zero-fill could not have produced 42 — the rule every surface shares.
    expect(carbStatus(meal(42).result)).toBe('known');
    expect(carbStatus(meal(0).result)).toBe('indeterminate');
  });

  it('one unknown meal makes a week of meals a floor', () => {
    const week = [meal(60, true), meal(0, false)];
    expect(week.some((m) => carbStatus(m.result) !== 'known')).toBe(true);
    // …and the sum itself is untouched: the unknown still contributes 0.
    expect(week.reduce((s, m) => s + (m.result.carbohydrates ?? 0), 0)).toBe(60);
  });

  it('the weekly narrative applies that rule and did not change its sum', () => {
    const weekly = src('src/services/weeklyReport.ts');
    expect(weekly).toContain('carbStatus(m.result)');
    expect(weekly).toContain("carbsAreFloor ? '≥ ' : ''");
    // The reduce is byte-identical to before the fix.
    expect(weekly).toContain('(s, m) => s + (m.result.carbohydrates ?? 0)');
  });
});
