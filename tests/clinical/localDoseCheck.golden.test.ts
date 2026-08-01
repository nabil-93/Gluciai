import { describe, expect, it } from 'vitest';

import { computeSmartBolus, localDoseCheck, MAX_SAFE_BOLUS } from '@/services/bolusEngine';
import { inputs, insulinLog, profile } from './_fixtures';

/**
 * CHARACTERIZATION — `localDoseCheck`.
 *
 * The deterministic risk classification applied when a patient edits the
 * recommended dose. It runs independently of the AI check; the screen takes the
 * WORSE of the two. These tests record the local rules only.
 */

/** An engine result recommending ~5 U from 50 g of carbs at 10 g/U. */
const engine5U = computeSmartBolus(inputs({ carbs: 50 }));

describe('localDoseCheck — deviation from the recommendation', () => {
  it('recommendation accepted unchanged is ok with no reasons', () => {
    expect(engine5U.total).toBe(5);
    expect(localDoseCheck(5, engine5U)).toEqual({ risk: 'ok', reasons: [] });
  });

  it('a small increase stays ok', () => {
    expect(localDoseCheck(6, engine5U)).toEqual({ risk: 'ok', reasons: [] });
  });

  it('a large increase is danger with muchHigher', () => {
    const r = localDoseCheck(15, engine5U);
    expect(r.risk).toBe('danger');
    expect(r.reasons).toContain('muchHigher');
  });

  it('an override above the cap adds overCap', () => {
    const r = localDoseCheck(50, engine5U);
    expect(r.risk).toBe('danger');
    expect(r.reasons).toContain('overCap');
    expect(r.reasons).toContain('muchHigher');
  });

  it('a moderate over-shoot is caution rather than danger', () => {
    // 8.5 U is > rec*1.5 (7.5) but not > rec*2 (10) nor > rec+5 (10).
    const r = localDoseCheck(8.5, engine5U);
    expect(r.risk).toBe('caution');
    expect(r.reasons).toContain('muchHigher');
  });

  it('a much lower dose is caution', () => {
    const r = localDoseCheck(1, engine5U);
    expect(r.risk).toBe('caution');
    expect(r.reasons).toContain('muchLower');
  });
});

describe('localDoseCheck — safety states', () => {
  it('dosing during a flagged hypo is danger with hypoDose', () => {
    const hypo = computeSmartBolus(inputs({ carbs: 50, glucose: 60 }));
    expect(hypo.total).toBe(0);
    expect(hypo.flags).toContain('hypo');

    const r = localDoseCheck(5, hypo);
    expect(r.risk).toBe('danger');
    expect(r.reasons).toContain('hypoDose');
  });

  it('dosing when nothing is recommended and there is no hypo is caution', () => {
    const none = computeSmartBolus(inputs({ carbs: 0 }));
    expect(none.total).toBe(0);
    const r = localDoseCheck(5, none);
    expect(r.risk).toBe('caution');
    expect(r.reasons).toContain('noNeedButDosing');
  });

  it('increasing the dose on top of active insulin adds stacking', () => {
    const withIob = computeSmartBolus(
      inputs({ carbs: 60, insulinLogs: [insulinLog(6, 120)] })
    );
    expect(withIob.iob).toBe(3);
    expect(withIob.total).toBe(3);

    const r = localDoseCheck(5, withIob);
    expect(r.reasons).toContain('stacking');
    expect(r.risk).toBe('caution');
  });

  it('increasing the dose while glucose is falling is danger', () => {
    const falling = computeSmartBolus(
      inputs({
        carbs: 50,
        glucose: 150,
        glucoseLogs: [
          { id: 'g1', user_id: 'u', value: 250, unit: 'mg/dL', source: 'manual', created_at: new Date(Date.UTC(2026, 0, 15, 11, 0)).toISOString() },
          { id: 'g2', user_id: 'u', value: 150, unit: 'mg/dL', source: 'manual', created_at: new Date(Date.UTC(2026, 0, 15, 12, 0)).toISOString() },
        ],
      })
    );
    expect(falling.flags).toContain('falling');

    const r = localDoseCheck(falling.total + 1, falling);
    expect(r.risk).toBe('danger');
    expect(r.reasons).toContain('fallingIncrease');
  });
});

describe('localDoseCheck — the capped recommendation', () => {
  /**
   * KNOWN-BAD BASELINE — P7-009 / P12-001
   * When the engine clamps a very large raw dose to 20 U and the patient
   * accepts it unchanged, `localDoseCheck` classifies it as 'ok' with no
   * reasons — and the bolus screen short-circuits the check entirely when the
   * dose equals the recommendation. Nothing anywhere reports that the number
   * shown is a ceiling rather than a calculation.
   * Owning remediation: RU-6 (presentation) + RU-2 (plausibility upstream).
   */
  it('KNOWN-BAD BASELINE — P7-009: a capped 20 U recommendation accepted unchanged is classified ok', () => {
    const capped = computeSmartBolus(inputs({ carbs: 5000 }));
    expect(capped.total).toBe(MAX_SAFE_BOLUS);
    expect(capped.flags).toContain('capped');

    expect(localDoseCheck(capped.total, capped)).toEqual({ risk: 'ok', reasons: [] });
  });

  it('exceeding the cap by any amount is danger', () => {
    const capped = computeSmartBolus(inputs({ carbs: 5000 }));
    expect(localDoseCheck(20.1, capped).reasons).toContain('overCap');
  });
});

describe('localDoseCheck — unknown-parameter recommendation', () => {
  it('classifies an override the same way whether or not the ratio was defaulted', () => {
    const defaulted = computeSmartBolus(
      inputs({
        carbs: 50,
        profile: profile({ carb_ratio: undefined, correction_factor: undefined }),
      })
    );
    expect(defaulted.flags).toContain('noRatio');
    // `noRatio` is not consulted by localDoseCheck — recorded, not endorsed.
    expect(localDoseCheck(5, defaulted)).toEqual({ risk: 'ok', reasons: [] });
  });
});
