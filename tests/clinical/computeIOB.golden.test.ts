import { describe, expect, it } from 'vitest';

import { computeIOB, DIA_HOURS } from '@/services/bolusEngine';
import { insulinLog, NOW } from './_fixtures';

/**
 * CHARACTERIZATION — `computeIOB`.
 *
 * Records what the unmodified implementation returns today. A green run means
 * behaviour is unchanged; it does not mean the decay model or the insulin-type
 * filter is clinically appropriate.
 *
 * Implementation under test (bolusEngine.ts):
 *   cutoff    = now - DIA_HOURS * 3600e3
 *   skip when insulin_type !== 'rapid'
 *   skip when t < cutoff  OR  t > now
 *   remaining = max(0, dose * (1 - minutesAgo / (DIA_HOURS * 60)))
 *   kept only when remaining > 0.05
 */
describe('computeIOB — linear decay over DIA', () => {
  it('exposes DIA_HOURS as 4', () => {
    expect(DIA_HOURS).toBe(4);
  });

  const decay: [number, number][] = [
    [0, 10],
    [30, 8.75],
    [60, 7.5],
    [120, 5],
    [180, 2.5],
  ];

  it.each(decay)(
    'a 10 U rapid dose %i minutes ago leaves %f U remaining',
    (minutesAgo, expected) => {
      const out = computeIOB([insulinLog(10, minutesAgo)], NOW);
      expect(out).toHaveLength(1);
      expect(out[0].remaining).toBeCloseTo(expected, 10);
      expect(out[0].dose).toBe(10);
      expect(out[0].minutesAgo).toBe(minutesAgo);
    }
  );

  it('at exactly the DIA cutoff the dose is in range but decays to 0 and is filtered out by the >0.05 threshold', () => {
    // t === cutoff, so neither `t < cutoff` nor `t > now` skips it; the entry is
    // dropped later because remaining === 0.
    const out = computeIOB([insulinLog(10, DIA_HOURS * 60)], NOW);
    expect(out).toHaveLength(0);
  });

  it('a dose older than DIA is excluded by the cutoff', () => {
    const out = computeIOB([insulinLog(10, DIA_HOURS * 60 + 1)], NOW);
    expect(out).toHaveLength(0);
  });

  it('a dose with a future timestamp is excluded', () => {
    const out = computeIOB([insulinLog(10, -60)], NOW);
    expect(out).toHaveLength(0);
  });

  it('drops a dose once its remainder falls to the 0.05 U threshold', () => {
    // 1 U at 237 min → 1 * (1 - 237/240) = 0.0125, below the threshold.
    expect(computeIOB([insulinLog(1, 237)], NOW)).toHaveLength(0);
    // 1 U at 200 min → 0.1666…, above it.
    expect(computeIOB([insulinLog(1, 200)], NOW)).toHaveLength(1);
  });
});

describe('computeIOB — insulin type filter', () => {
  it("excludes 'long' insulin", () => {
    expect(computeIOB([insulinLog(10, 60, 'long')], NOW)).toHaveLength(0);
  });

  /**
   * KNOWN-BAD BASELINE — P7-011 / P11-006 / P13-002
   * `mixed` insulin contains a rapid component but the filter keeps only
   * 'rapid', so a premixed dose contributes nothing to IOB while still being
   * offered in the logging UI and counted in daily totals.
   * Owning remediation: RU-4 (contract) / RU-11 (clinical policy).
   */
  it('KNOWN-BAD BASELINE — P7-011: excludes `mixed` insulin, so premixed doses contribute 0 to IOB', () => {
    expect(computeIOB([insulinLog(10, 60, 'mixed')], NOW)).toHaveLength(0);
  });

  it('sums several rapid doses and ignores non-rapid ones in the same list', () => {
    const out = computeIOB(
      [
        insulinLog(10, 60, 'rapid'),
        insulinLog(10, 60, 'long'),
        insulinLog(10, 60, 'mixed'),
      ],
      NOW
    );
    expect(out).toHaveLength(1);
    expect(out[0].remaining).toBeCloseTo(7.5, 10);
  });
});

describe('computeIOB — malformed and duplicated input', () => {
  it('drops a NaN dose (NaN fails the >0.05 threshold)', () => {
    expect(computeIOB([insulinLog(Number.NaN, 60)], NOW)).toHaveLength(0);
  });

  it('drops a negative dose (max(0, …) floors it to 0)', () => {
    expect(computeIOB([insulinLog(-10, 60)], NOW)).toHaveLength(0);
  });

  /**
   * KNOWN-BAD BASELINE — P5-005
   * Two clinically identical doses are both counted. That is correct in
   * isolation (split dosing is real), but the sync layer has no event identity,
   * so a duplicate produced by re-push is indistinguishable from a real second
   * injection. Recorded here so a later identity fix has a reference point.
   * Owning remediation: RU-5.
   */
  it('KNOWN-BAD BASELINE — P5-005: two identical doses both count, doubling IOB', () => {
    const out = computeIOB([insulinLog(10, 60), insulinLog(10, 60)], NOW);
    expect(out).toHaveLength(2);
    const total = out.reduce((s, d) => s + d.remaining, 0);
    expect(total).toBeCloseTo(15, 10);
  });

  it('returns an empty list for no logs', () => {
    expect(computeIOB([], NOW)).toEqual([]);
  });
});
