import { describe, expect, it } from 'vitest';

import { guessMealTime, ratioForMeal } from '@/services/bolusEngine';
import { profile } from './_fixtures';

/**
 * CHARACTERIZATION — meal-window selection and insulin-to-carb ratio resolution.
 *
 * `tests/setup.ts` pins TZ=UTC, and every instant below is written in UTC, so
 * `getHours()` is reproducible. The engine reading DEVICE-local time is itself a
 * recorded finding (P7-004); these tests record the behaviour, they do not
 * endorse it.
 */

const at = (utc: string) => new Date(utc);

describe('guessMealTime — window boundaries (UTC)', () => {
  const cases: [string, string, ReturnType<typeof guessMealTime>][] = [
    ['00:00', '2026-01-15T00:00:00.000Z', 'snack'],
    ['03:59', '2026-01-15T03:59:00.000Z', 'snack'],
    ['04:00', '2026-01-15T04:00:00.000Z', 'breakfast'],
    ['10:59', '2026-01-15T10:59:00.000Z', 'breakfast'],
    ['11:00', '2026-01-15T11:00:00.000Z', 'lunch'],
    ['15:59', '2026-01-15T15:59:00.000Z', 'lunch'],
    ['16:00', '2026-01-15T16:00:00.000Z', 'snack'],
    ['17:59', '2026-01-15T17:59:00.000Z', 'snack'],
    ['18:00', '2026-01-15T18:00:00.000Z', 'dinner'],
    ['23:59', '2026-01-15T23:59:00.000Z', 'dinner'],
  ];

  it.each(cases)('%s resolves to %s', (_label, iso, expected) => {
    expect(guessMealTime(at(iso))).toBe(expected);
  });

  /**
   * KNOWN-BAD BASELINE — P7-004
   * Two windows have no dedicated ratio: 16:00–17:59 and 00:00–03:59 both fall
   * through to 'snack', and 'snack' reuses the LUNCH ratio. An evening meal at
   * 17:59 is therefore dosed on the lunch ratio and at 18:00 on the dinner
   * ratio, a discontinuity invisible to the patient unless they notice the meal
   * selector. Owning remediation: RU-11 (policy) then RU-4.
   */
  it('KNOWN-BAD BASELINE — P7-004: 17:59 and 18:00 select different meal windows', () => {
    expect(guessMealTime(at('2026-01-15T17:59:00.000Z'))).toBe('snack');
    expect(guessMealTime(at('2026-01-15T18:00:00.000Z'))).toBe('dinner');
  });
});

describe('ratioForMeal — resolution order', () => {
  it('uses the per-meal plan first, converting U-per-10 g to g-per-U', () => {
    const r = ratioForMeal(
      profile({ insulin_per_10g_lunch: 2, carb_ratio: 10 }),
      'lunch'
    );
    expect(r).toEqual({ gPerU: 5, uPer10g: 2, source: 'meal' });
  });

  it('falls back to the legacy carb_ratio, which is already g-per-U', () => {
    const r = ratioForMeal(profile({ carb_ratio: 10 }), 'lunch');
    expect(r).toEqual({ gPerU: 10, uPer10g: 1, source: 'global' });
  });

  it('derives uPer10g from carb_ratio to 2 decimals', () => {
    // 10 / 15 = 0.666… → 0.67
    const r = ratioForMeal(profile({ carb_ratio: 15 }), 'lunch');
    expect(r.gPerU).toBe(15);
    expect(r.uPer10g).toBe(0.67);
    expect(r.source).toBe('global');
  });

  /**
   * KNOWN-BAD BASELINE — P7-003 / P13-003
   * With no per-meal plan and no carb_ratio the engine substitutes 10 g/U — a
   * clinically meaningful value the patient never entered — and produces an
   * actionable dose from it. The only signal is a `noRatio` flag shared with
   * the missing-ISF case. Owning remediation: RU-4.
   */
  it('KNOWN-BAD BASELINE — P7-003: with no ratio at all it substitutes 10 g/U', () => {
    const r = ratioForMeal(
      profile({ carb_ratio: undefined, correction_factor: undefined }),
      'lunch'
    );
    expect(r).toEqual({ gPerU: 10, uPer10g: 1, source: 'default' });
  });

  it('treats a zero or negative per-meal ratio as unset and falls through', () => {
    expect(ratioForMeal(profile({ insulin_per_10g_lunch: 0 }), 'lunch').source).toBe('global');
    expect(ratioForMeal(profile({ insulin_per_10g_lunch: -2 }), 'lunch').source).toBe('global');
  });

  it('treats a zero or negative carb_ratio as unset and falls through to the default', () => {
    expect(ratioForMeal(profile({ carb_ratio: 0 }), 'lunch').source).toBe('default');
    expect(ratioForMeal(profile({ carb_ratio: -10 }), 'lunch').source).toBe('default');
  });

  it('returns the default when there is no profile at all', () => {
    expect(ratioForMeal(null, 'lunch')).toEqual({ gPerU: 10, uPer10g: 1, source: 'default' });
  });

  /**
   * KNOWN-BAD BASELINE — P7-004
   * 'snack' has no ratio field of its own and borrows the LUNCH value, so a
   * 02:00 snack and a 13:00 lunch are dosed on the same ratio.
   */
  it('KNOWN-BAD BASELINE — P7-004: snack borrows the lunch ratio', () => {
    const p = profile({
      insulin_per_10g_breakfast: 3,
      insulin_per_10g_lunch: 2,
      insulin_per_10g_dinner: 1,
    });
    expect(ratioForMeal(p, 'snack')).toEqual(ratioForMeal(p, 'lunch'));
    expect(ratioForMeal(p, 'snack').uPer10g).toBe(2);
  });

  it('selects the matching per-meal ratio for breakfast and dinner', () => {
    const p = profile({
      insulin_per_10g_breakfast: 3,
      insulin_per_10g_lunch: 2,
      insulin_per_10g_dinner: 1,
    });
    expect(ratioForMeal(p, 'breakfast').uPer10g).toBe(3);
    expect(ratioForMeal(p, 'dinner').uPer10g).toBe(1);
  });
});
