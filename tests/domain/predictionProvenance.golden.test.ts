import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { predictGlucose } from '@/services/prediction';
import type { GlucoseLog, MealScan } from '@/types';

/**
 * CHARACTERIZATION — the glucose forecast's meal term (finding N-8).
 *
 * `prediction.ts` is a pure module (type-only imports), so nothing is mocked.
 *
 * TWO facts are pinned here, and the second is why this file exists:
 *
 *   1. the forecast's meal contribution is `min(40, carbohydrates × 0.5)` and
 *      reads `result.carbohydrates` WITHOUT its provenance — so a placeholder 0
 *      (unknown carbohydrate) and a genuine 0 g meal produce the same "no rise
 *      expected", and a lower-bound plate under-predicts;
 *   2. **`predictGlucose` currently has no caller anywhere in `src/`.** The
 *      module is exported and unreachable, which is why Step 20 records it
 *      rather than changing it: there is no surface to fix, and wiring one up
 *      would be new behaviour, not remediation.
 *
 * If a future step DOES wire it up, fixture (1) is the red flag it inherits.
 */

const NOW = new Date('2026-01-15T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

const minutesBefore = (m: number): string =>
  new Date(NOW.getTime() - m * 60_000).toISOString();

const glucose = (value: number, minutesAgo: number): GlucoseLog => ({
  id: `g-${value}-${minutesAgo}`,
  user_id: 'u',
  value,
  unit: 'mg/dL',
  source: 'manual',
  created_at: minutesBefore(minutesAgo),
});

/** A meal whose carbohydrate figure carries (or does not carry) provenance. */
const meal = (carbohydrates: number, carbs_known?: boolean): MealScan => ({
  id: `m-${carbohydrates}-${String(carbs_known)}`,
  user_id: 'u',
  created_at: minutesBefore(30),
  result: {
    food_name: 'plate',
    estimated_portion: '300 g',
    calories: 400,
    carbohydrates,
    ...(carbs_known === undefined ? {} : { carbs_known }),
    sugar: 5,
    protein: 10,
    fat: 8,
    fiber: 4,
  } as MealScan['result'],
});

/** Three flat readings: a stable baseline the meal term then moves. */
const flat = [glucose(120, 180), glucose(120, 90), glucose(120, 20)];

describe('predictGlucose — the meal term, and what it cannot see', () => {
  it('a known 60 g meal raises the forecast by 30 mg/dL', () => {
    const p = predictGlucose(flat, [meal(60, true)], null);
    expect(p?.expectedValue).toBe(150); // 120 + 0 slope + min(40, 60 × 0.5)
    expect(p?.direction).toBe('rise');
  });

  it('the boost is capped at 40 mg/dL however large the plate', () => {
    const p = predictGlucose(flat, [meal(500, true)], null);
    expect(p?.expectedValue).toBe(160); // 120 + 40
  });

  /**
   * KNOWN-BAD BASELINE — N-8
   * The forecast reads the number and not its provenance, so a plate whose
   * carbohydrate is UNKNOWN (the placeholder 0 of Step 10) is indistinguishable
   * from a glass of water: both remove the expected post-prandial rise.
   * Owning remediation: RU-3 + RU-6. NOT FIXED — and, today, NOT REACHABLE.
   */
  it('KNOWN-BAD — an unknown carbohydrate predicts exactly like a genuine 0 g', () => {
    const unknown = predictGlucose(flat, [meal(0, false)], null);
    const genuineZero = predictGlucose(flat, [meal(0, true)], null);

    expect(unknown?.expectedValue).toBe(genuineZero?.expectedValue);
    expect(unknown?.expectedValue).toBe(120); // flat baseline, no boost at all
    expect(unknown?.direction).toBe('stable'); // "nothing coming" — for a plate
    // whose carbohydrate the app explicitly does not know.
  });

  it('KNOWN-BAD — a lower-bound plate under-predicts, silently', () => {
    // 20 g known out of a plate that also holds unknown foods: the forecast
    // treats the floor as the total.
    const p = predictGlucose(flat, [meal(20, false)], null);
    expect(p?.expectedValue).toBe(130); // 120 + 10, as if 20 g were the whole plate
  });

  it('nothing in the result reports how solid the meal term is', () => {
    const p = predictGlucose(flat, [meal(0, false)], null);
    expect(Object.keys(p ?? {})).not.toContain('carbsKnown');
    expect(Object.keys(p ?? {})).not.toContain('mealBoostKnown');
  });
});

describe('N-8 — the module has no reachable consumer', () => {
  /**
   * Recorded as a FACT, not a fix. `predictGlucose` is exported and never
   * imported: the defect above cannot reach a patient today, which is exactly
   * why Step 20 did not change the arithmetic. Should this assertion ever fail,
   * the finding has become live and must be remediated before shipping.
   */
  it('no source file imports the prediction module', () => {
    const roots = ['src/app', 'src/components', 'src/services', 'src/store', 'src/lib'];
    const hits: string[] = [];
    const walk = (dir: string) => {
      const fs = require('node:fs') as typeof import('node:fs');
      for (const entry of fs.readdirSync(path.resolve(process.cwd(), dir), {
        withFileTypes: true,
      })) {
        const rel = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(rel);
        else if (/\.tsx?$/.test(entry.name) && !rel.endsWith('services/prediction.ts')) {
          const text = readFileSync(path.resolve(process.cwd(), rel), 'utf8');
          if (/from '@\/services\/prediction'|services\/prediction/.test(text)) hits.push(rel);
        }
      }
    };
    for (const r of roots) walk(r);
    expect(hits).toEqual([]);
  });
});
