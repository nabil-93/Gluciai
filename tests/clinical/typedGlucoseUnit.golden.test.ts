import { describe, expect, it } from 'vitest';

import {
  computeSmartBolus,
  isPlausibleTypedMgdl,
  looksLikeMmol,
  MAX_TYPED_MGDL,
  MIN_TYPED_MGDL,
  MMOL_TO_MGDL,
  readGlucose,
} from '@/services/bolusEngine';

import { inputs } from './_fixtures';

/**
 * P7-005 — a TYPED glucose value must never be silently read as mg/dL when it
 * was a mmol/L reading.
 *
 * The engine has always converted a reading that ARRIVES labelled `mmol/L`
 * (`readGlucose`). What no surface could do was notice that a number typed
 * into a mg/dL field was never in mg/dL at all: this app has no patient unit
 * preference, `saveGlucose` writes only `'mg/dL'`, and every entry field is
 * mg/dL by convention.
 *
 * These fixtures pin the guard and, above all, the dangerous case: **5.6**.
 *
 * The guard REFUSES; it never converts. Converting would invent a reading the
 * patient did not give. No clinical threshold is introduced — 20/900 are the
 * bounds `aiLogger` has always applied to a spoken reading, now named and
 * shared with the manual field.
 */
describe('P7-005 — typed glucose unit safety', () => {
  describe('the 5.6 case (the reason this guard exists)', () => {
    it('REFUSES 5.6 as a typed mg/dL reading', () => {
      // A real mmol/L reading of 5.6 is perfectly normal glycaemia (~101
      // mg/dL). Stored as "5.6 mg/dL" it is a profound hypo that never
      // happened — and it would reach the hypo guard, the day report and the
      // doctor's PDF as fact.
      expect(isPlausibleTypedMgdl(5.6)).toBe(false);
    });

    it('recognises 5.6 as probably-mmol/L so the screen can say so', () => {
      expect(looksLikeMmol(5.6)).toBe(true);
    });

    it('never converts on the patient behalf — the suggestion is arithmetic only', () => {
      // The screen SHOWS ~101 so the patient can retype it. Nothing stores it.
      expect(Math.round(5.6 * MMOL_TO_MGDL)).toBe(101);
    });

    it('still converts correctly when the unit IS stated (unchanged behaviour)', () => {
      const r = readGlucose(5.6, 'mmol/L');
      expect(r.state).toBe('value');
      expect(r.mgdl).toBeCloseTo(100.9, 1);
      expect(r.supplied).toEqual({ value: 5.6, unit: 'mmol/L' });
    });

    it('5.6 mmol/L and 5.6 mg/dL are NOT the same reading', () => {
      const asMmol = readGlucose(5.6, 'mmol/L');
      const asMgdl = readGlucose(5.6, 'mg/dL');
      expect(asMmol.mgdl).not.toBe(asMgdl.mgdl);
      // The whole point: one is normal, the other is a severe hypo.
      expect(asMmol.mgdl!).toBeGreaterThan(90);
      expect(asMgdl.mgdl!).toBeLessThan(20);
    });
  });

  describe('the plausible mg/dL band', () => {
    it('accepts ordinary mg/dL readings', () => {
      for (const v of [20, 70, 101, 126, 180, 250, 400, 900]) {
        expect(isPlausibleTypedMgdl(v)).toBe(true);
      }
    });

    it('refuses everything in the plausible mmol/L range', () => {
      // 1–19 covers every mmol/L reading a living patient can produce.
      for (const v of [1, 3.9, 5.6, 7.8, 10, 14.2, 19, 19.9]) {
        expect(isPlausibleTypedMgdl(v)).toBe(false);
      }
    });

    it('refuses values above the upper bound', () => {
      expect(isPlausibleTypedMgdl(901)).toBe(false);
      expect(isPlausibleTypedMgdl(5000)).toBe(false);
    });

    it('holds the bounds exactly where aiLogger already had them', () => {
      expect(MIN_TYPED_MGDL).toBe(20);
      expect(MAX_TYPED_MGDL).toBe(900);
      expect(isPlausibleTypedMgdl(MIN_TYPED_MGDL)).toBe(true);
      expect(isPlausibleTypedMgdl(MAX_TYPED_MGDL)).toBe(true);
      expect(isPlausibleTypedMgdl(MIN_TYPED_MGDL - 0.1)).toBe(false);
      expect(isPlausibleTypedMgdl(MAX_TYPED_MGDL + 0.1)).toBe(false);
    });

    it('refuses absent and unusable values rather than guessing', () => {
      expect(isPlausibleTypedMgdl(null)).toBe(false);
      expect(isPlausibleTypedMgdl(undefined)).toBe(false);
      expect(isPlausibleTypedMgdl(NaN)).toBe(false);
      expect(isPlausibleTypedMgdl(Infinity)).toBe(false);
      expect(isPlausibleTypedMgdl(-5)).toBe(false);
    });

    it('does not call a genuine mg/dL reading a mmol/L one', () => {
      expect(looksLikeMmol(101)).toBe(false);
      expect(looksLikeMmol(70)).toBe(false);
      // 0 is a reading, not a unit confusion (P7-006 keeps it meaningful).
      expect(looksLikeMmol(0)).toBe(false);
    });
  });

  /**
   * The guard is a WRITE-side rule. It must not have moved anything the dose
   * engine does — the clinical fixtures own that behaviour and are unchanged.
   */
  describe('the dose engine is untouched by the guard', () => {
    it('still treats a stated mmol/L reading exactly as before', () => {
      const mmol = computeSmartBolus(
        inputs({ carbs: 60, carbsKnown: true, glucose: 5.6, glucoseUnit: 'mmol/L' })
      );
      const mgdl = computeSmartBolus(
        inputs({ carbs: 60, carbsKnown: true, glucose: 100.9, glucoseUnit: 'mg/dL' })
      );
      // Same reading in two units → the same dose.
      expect(mmol.total).toBe(mgdl.total);
      expect(mmol.flags).not.toContain('hypo');
    });

    it('still raises the hypo guard for a genuine low mg/dL reading', () => {
      const r = computeSmartBolus(
        inputs({ carbs: 60, carbsKnown: true, glucose: 55, glucoseUnit: 'mg/dL' })
      );
      expect(r.flags).toContain('hypo');
      expect(r.total).toBe(0);
    });

    it('a mmol/L reading that IS a hypo still raises the hypo guard', () => {
      // 3.0 mmol/L ≈ 54 mg/dL — a real hypo, correctly detected once labelled.
      const r = computeSmartBolus(
        inputs({ carbs: 60, carbsKnown: true, glucose: 3.0, glucoseUnit: 'mmol/L' })
      );
      expect(r.flags).toContain('hypo');
      expect(r.total).toBe(0);
    });
  });
});
