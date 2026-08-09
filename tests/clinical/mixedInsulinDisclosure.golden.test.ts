import { describe, expect, it } from 'vitest';

import {
  computeIOB,
  computeSmartBolus,
  hasUncountedMixedInsulin,
} from '@/services/bolusEngine';

import { inputs, insulinLog, NOW } from './_fixtures';

/**
 * P7-011 — DISCLOSURE ONLY.
 *
 * A premixed (`mixed`) dose is excluded from IOB, so a patient with 20 U of
 * premix still active gets a dose computed as if nothing were on board. How
 * much of a premix is rapid, and over what duration it decays, is a clinical
 * question this app cannot answer (RU-11 Q4–Q7) — so the RULE is untouched.
 *
 * What these fixtures pin is that the omission is no longer SILENT, and — more
 * importantly — that making it visible moved no number. If any assertion in
 * "the dose is untouched" ever fails, a clinical rule was changed without
 * authorization.
 */
describe('P7-011 — uncounted mixed insulin is disclosed, not silently dropped', () => {
  describe('detection', () => {
    it('reports an active premixed dose', () => {
      expect(hasUncountedMixedInsulin([insulinLog(20, 60, 'mixed')], NOW)).toBe(true);
    });

    it('ignores a premixed dose older than the action window', () => {
      // 5 h ago, DIA is 4 h — certainly finished, no warning worth showing.
      expect(hasUncountedMixedInsulin([insulinLog(20, 300, 'mixed')], NOW)).toBe(false);
    });

    it('ignores rapid and long doses — this is only about premix', () => {
      expect(hasUncountedMixedInsulin([insulinLog(6, 60, 'rapid')], NOW)).toBe(false);
      expect(hasUncountedMixedInsulin([insulinLog(20, 60, 'long')], NOW)).toBe(false);
    });

    it('is safe on an empty or absent log', () => {
      expect(hasUncountedMixedInsulin([], NOW)).toBe(false);
    });
  });

  describe('the flag reaches the screen', () => {
    it('raises mixedInsulinUncounted when a premix is active', () => {
      const r = computeSmartBolus(
        inputs({
          carbs: 60,
          carbsKnown: true,
          insulinLogs: [insulinLog(20, 60, 'mixed')],
        })
      );
      expect(r.flags).toContain('mixedInsulinUncounted');
    });

    it('does not raise it when only rapid insulin is on board', () => {
      const r = computeSmartBolus(
        inputs({
          carbs: 60,
          carbsKnown: true,
          insulinLogs: [insulinLog(3, 60, 'rapid')],
        })
      );
      expect(r.flags).not.toContain('mixedInsulinUncounted');
      expect(r.flags).toContain('iob');
    });
  });

  /**
   * THE ASSERTIONS THAT MATTER. The disclosure must be free: same dose, same
   * IOB, same breakdown, with and without the premix in the log.
   */
  describe('the dose is untouched — the disclosure changed no arithmetic', () => {
    const base = inputs({ carbs: 60, carbsKnown: true, insulinLogs: [] });
    const withMix = inputs({
      carbs: 60,
      carbsKnown: true,
      insulinLogs: [insulinLog(20, 60, 'mixed')],
    });

    it('produces exactly the same total', () => {
      expect(computeSmartBolus(withMix).total).toBe(computeSmartBolus(base).total);
    });

    it('still counts the premix as ZERO insulin on board', () => {
      // The rule is unchanged: `mixed` contributes nothing to IOB.
      expect(computeSmartBolus(withMix).iob).toBe(0);
      expect(computeIOB([insulinLog(20, 60, 'mixed')], NOW)).toEqual([]);
    });

    it('leaves the whole breakdown identical', () => {
      const a = computeSmartBolus(base);
      const b = computeSmartBolus(withMix);
      expect(b.mealBolus).toBe(a.mealBolus);
      expect(b.correction).toBe(a.correction);
      expect(b.rawTotal).toBe(a.rawTotal);
      expect(b.activityFactor).toBe(a.activityFactor);
    });

    it('adds only the disclosure flag and nothing else', () => {
      const a = computeSmartBolus(base).flags;
      const b = computeSmartBolus(withMix).flags;
      expect(b.filter((f) => f !== 'mixedInsulinUncounted')).toEqual(a);
    });

    it('does not disturb a rapid dose that IS counted', () => {
      const rapidOnly = inputs({
        carbs: 60,
        carbsKnown: true,
        insulinLogs: [insulinLog(3, 60, 'rapid')],
      });
      const rapidPlusMix = inputs({
        carbs: 60,
        carbsKnown: true,
        insulinLogs: [insulinLog(3, 60, 'rapid'), insulinLog(20, 60, 'mixed')],
      });
      expect(computeSmartBolus(rapidPlusMix).iob).toBe(computeSmartBolus(rapidOnly).iob);
      expect(computeSmartBolus(rapidPlusMix).total).toBe(computeSmartBolus(rapidOnly).total);
    });
  });
});
