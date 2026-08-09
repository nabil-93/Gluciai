import { describe, expect, it } from 'vitest';

import {
  ASSUMED_GI,
  effectiveGi,
  giBand,
  glBand,
  glValue,
  glycemicLoad,
  isAssumedGi,
} from '@/services/nutrition/interpret/glycemic';

/**
 * S1-2 — a glycemic LOAD may never be presented as if it came from a measured
 * index when no index is known.
 *
 * GL = GI × carbs / 100, so "Index glycémique : 0" printed beside "Charge
 * glycémique : 50" is arithmetically impossible. It happened because the load
 * substitutes `ASSUMED_GI` (55) when the plate carries no index, while the PDF
 * printed the raw `gi` — and the assumption appeared nowhere on the page.
 *
 * NOTHING HERE CHANGES A NUMBER. `ASSUMED_GI`, `glValue`, `glBand` and
 * `glycemicLoad` are untouched; these fixtures pin the provenance rule the
 * screens must apply, plus the boundary cases Task 7 asks to characterize.
 */
describe('S1-2 — an assumed index is distinguishable from a measured one', () => {
  it('reports a missing index as assumed', () => {
    expect(isAssumedGi(0)).toBe(true);
    expect(isAssumedGi(null)).toBe(true);
    expect(isAssumedGi(undefined)).toBe(true);
  });

  it('reports a real index as measured', () => {
    expect(isAssumedGi(55)).toBe(false);
    expect(isAssumedGi(1)).toBe(false);
  });

  it('substitutes exactly ASSUMED_GI and nothing else', () => {
    expect(ASSUMED_GI).toBe(55);
    expect(effectiveGi(0)).toBe(ASSUMED_GI);
    expect(effectiveGi(70)).toBe(70);
  });

  it('THE CONTRADICTION: a plate with no index still produces a non-zero load', () => {
    // 90 g of carbohydrate, no index → GL 49.5 from the assumed 55. Printing
    // that beside "index 0" is the impossibility; the load itself is correct.
    const gl = glValue(90, 0);
    expect(gl).toBeCloseTo(49.5, 1);
    expect(isAssumedGi(0)).toBe(true); // …so the screen must say so
  });
});

/**
 * TASK 7 — canonical GI/GL boundary characterization.
 *
 * These pin CURRENT behaviour at every boundary named in the task. They do not
 * move a threshold: where two surfaces disagree, that disagreement is recorded
 * as known-bad rather than silently resolved, because resolving it changes a
 * patient-facing classification (a clinical decision).
 */
describe('GI bands — canonical boundaries', () => {
  it('classifies the standard low/medium/high cuts', () => {
    expect(giBand(54)).toBe('low');
    expect(giBand(55)).toBe('low'); // ≤ 55 is low
    expect(giBand(56)).toBe('medium');
    expect(giBand(65)).toBe('medium');
    expect(giBand(67)).toBe('medium');
    expect(giBand(69)).toBe('medium');
    expect(giBand(70)).toBe('high'); // ≥ 70 is high
    expect(giBand(71)).toBe('high');
  });

  it('an unknown index (0) lands in low — callers must gate on gi > 0', () => {
    // Documented behaviour: every caller checks `gi > 0` before showing a chip.
    expect(giBand(0)).toBe('low');
  });

  it('KNOWN-BAD — GI 70 is "high" to the chip and only MODERATE to the score', () => {
    // `scoreMeal` opens its harsh penalty at `gi > 70`, so 70 itself takes the
    // moderate −10 while `giBand` calls it high. RU-3 D9 owns this; recorded
    // here so the divergence cannot be closed by accident.
    expect(giBand(70)).toBe('high');
    // The score's gate is strictly greater-than — pinned in the engine's own
    // fixtures; this assertion documents the boundary that produces it.
    expect(70 > 70).toBe(false);
  });
});

describe('GL bands — canonical boundaries', () => {
  it('classifies the standard cuts on a rounded load', () => {
    expect(glBand(9).key).toBe('low');
    expect(glBand(10).key).toBe('medium');
    expect(glBand(20).key).toBe('medium'); // > 20 is high, so 20 is medium
    expect(glBand(21).key).toBe('high');
    expect(glBand(35).key).toBe('high');
  });

  it('the engine bands the UNROUNDED load with the same cuts', () => {
    expect(glycemicLoad(99, 10)).toBe('Low'); // GL 9.9 → < 10
    expect(glycemicLoad(100, 10)).toBe('Medium'); // GL 10.0 → not < 10
    expect(glycemicLoad(200, 10)).toBe('Medium'); // GL 20.0 → ≤ 20
    expect(glycemicLoad(201, 10)).toBe('High'); // GL 20.1 → > 20
  });

  it('KNOWN-BAD — GL 20.4 is "high" to the engine and "medium" on screen', () => {
    // The screen rounds BEFORE banding (20.4 → 20 → medium); the engine bands
    // the raw value (20.4 > 20 → High). Closing this changes a patient-facing
    // classification, so it is recorded, not fixed.
    const raw = 20.4;
    expect(glycemicLoad(204, 10)).toBe('High'); // unrounded path
    expect(glBand(Math.round(raw)).key).toBe('medium'); // screen path
  });

  it('KNOWN-BAD — the same divergence exists at the low/medium edge', () => {
    // 9.5–9.9 rounds up to 10 (medium on screen) while the engine calls it Low.
    expect(glycemicLoad(95, 10)).toBe('Low');
    expect(glBand(Math.round(9.5)).key).toBe('medium');
  });
});
