import { describe, expect, it } from 'vitest';

import {
  GL_TO_MGDL,
  MAX_PLAUSIBLE_GL,
  MIN_TYPED_MGDL,
  unitCandidates,
} from '@/services/bolusEngine';

/**
 * C-04 (store audit 2026-10-04) — a small typed glucose number is AMBIGUOUS.
 *
 * Morocco and France report glucose in g/L: a patient there types "1.2" for
 * 120 mg/dL. The previous refusal assumed every small number was mmol/L and
 * offered "≈ 22 mg/dL" — a severe hypoglycaemia one tap from being stored.
 * `unitCandidates` now returns BOTH readings and the screen lets the patient
 * pick; nothing is converted on its own.
 */
describe('C-04 — g/L vs mmol/L candidates for a typed value', () => {
  it('1.2 is offered as 120 mg/dL (g/L) AND 22 mg/dL (mmol/L)', () => {
    expect(unitCandidates(1.2)).toEqual({ gl: 120, mmol: 22 });
  });

  it('5.6 is offered as both, mmol/L reading ≈ 101 mg/dL', () => {
    expect(unitCandidates(5.6)).toEqual({ gl: 560, mmol: 101 });
  });

  it('above the plausible g/L range only the mmol/L reading is offered', () => {
    expect(unitCandidates(MAX_PLAUSIBLE_GL + 0.1)).toEqual({ gl: null, mmol: 110 });
    expect(unitCandidates(15)).toEqual({ gl: null, mmol: 270 });
  });

  it('exactly 6 g/L is still a candidate (600 mg/dL)', () => {
    expect(unitCandidates(6)).toEqual({ gl: 6 * GL_TO_MGDL, mmol: 108 });
  });

  it('a plausible mg/dL value has no candidates — it is not ambiguous', () => {
    expect(unitCandidates(MIN_TYPED_MGDL)).toEqual({ gl: null, mmol: null });
    expect(unitCandidates(120)).toEqual({ gl: null, mmol: null });
  });

  it('nothing, zero, negatives and non-numbers yield no candidates', () => {
    for (const v of [null, undefined, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(unitCandidates(v as number)).toEqual({ gl: null, mmol: null });
    }
  });
});
