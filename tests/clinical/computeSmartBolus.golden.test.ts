import { describe, expect, it } from 'vitest';

import { computeSmartBolus, MAX_SAFE_BOLUS } from '@/services/bolusEngine';
import { activityLog, inputs, insulinLog, profile } from './_fixtures';

/**
 * CHARACTERIZATION — `computeSmartBolus`.
 *
 * Records the unmodified engine's output for exact inputs. A green run means
 * the reasoning path and the number are unchanged since the audit; it makes no
 * claim that either is clinically correct.
 *
 * Assembly under test (bolusEngine.ts):
 *   mealBolus = carbs / gPerU
 *   correction = (glucose - targetMid) / isf   [only when glucose > targetHigh]
 *   raw = (mealBolus + correction - iob) * activity * trend * sick * stress
 *         * status * alcohol
 *   raw = max(0, raw); if glucose < targetLow → raw = 0 and flag 'hypo'
 *   total = round(raw, 0.1); if total > MAX_SAFE_BOLUS → clamp and flag 'capped'
 */

describe('A — carbohydrate bolus', () => {
  it('ICR 10 g/U with 50 g of carbs yields 5.0 U from the global ratio', () => {
    const r = computeSmartBolus(inputs({ carbs: 50, mealTime: 'lunch' }));
    expect(r.total).toBe(5);
    expect(r.mealBolus).toBe(5);
    expect(r.carbs).toBe(50);
    expect(r.ratio).toBe(10);
    expect(r.ratioSource).toBe('global');
    expect(r.uPer10g).toBe(1);
    expect(r.correction).toBe(0);
    expect(r.iob).toBe(0);
    expect(r.mealTime).toBe('lunch');
    // The DOSE is unchanged by Step 13. `noGlucose` is new: this fixture
    // supplies no reading, and the result now says so instead of looking like a
    // calculation that had glucose context (finding P7-006).
    expect(r.flags).toEqual(['noGlucose']);
  });

  it('per-meal plan of 2 U per 10 g with 50 g of carbs yields 10.0 U', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 50,
        mealTime: 'lunch',
        profile: profile({ insulin_per_10g_lunch: 2 }),
      })
    );
    expect(r.total).toBe(10);
    expect(r.ratio).toBe(5);
    expect(r.ratioSource).toBe('meal');
    expect(r.uPer10g).toBe(2);
    expect(r.flags).toEqual(['noGlucose']); // dose unchanged; see above
  });

  it('derives the meal window from `now` when mealTime is not supplied', () => {
    // NOW is 12:00 UTC and TZ is pinned to UTC → lunch.
    expect(computeSmartBolus(inputs({ carbs: 50 })).mealTime).toBe('lunch');
  });

  /**
   * KNOWN-BAD BASELINE — P7-003 / P13-003
   * A profile with no ratio and no correction factor still produces an
   * actionable dose, computed from substituted defaults (10 g/U, 50 mg/dL/U).
   * The single `noRatio` flag does not say WHICH parameter was defaulted.
   * Owning remediation: RU-4.
   */
  it('KNOWN-BAD BASELINE — P7-003: a profile with no ratio still returns an actionable dose', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 50,
        mealTime: 'lunch',
        profile: profile({ carb_ratio: undefined, correction_factor: undefined }),
      })
    );
    expect(r.total).toBe(5);
    expect(r.ratioSource).toBe('default');
    expect(r.correctionFactor).toBe(50);
    expect(r.flags).toContain('noRatio');
  });

  it('zero carbs and no glucose yield 0 U', () => {
    const r = computeSmartBolus(inputs({ carbs: 0 }));
    expect(r.total).toBe(0);
    expect(r.mealBolus).toBe(0);
  });

  it('negative carbs are floored to 0', () => {
    const r = computeSmartBolus(inputs({ carbs: -50 }));
    expect(r.carbs).toBe(0);
    expect(r.total).toBe(0);
  });

  it('NaN carbs fall back to 0 through the `|| 0` guard', () => {
    const r = computeSmartBolus(inputs({ carbs: Number.NaN }));
    expect(r.carbs).toBe(0);
    expect(r.total).toBe(0);
  });

  it('Infinity carbs propagate through the arithmetic and are stopped by the cap', () => {
    const r = computeSmartBolus(inputs({ carbs: Number.POSITIVE_INFINITY }));
    expect(r.carbs).toBe(Number.POSITIVE_INFINITY);
    expect(r.total).toBe(MAX_SAFE_BOLUS);
    expect(r.flags).toContain('capped');
  });
});

describe('B — correction', () => {
  it('BG 300 with ISF 50 and target 70–180 yields 3.5 U of correction and the highBG flag', () => {
    const r = computeSmartBolus(inputs({ carbs: 0, glucose: 300 }));
    expect(r.targetMid).toBe(125);
    expect(r.correction).toBe(3.5);
    expect(r.total).toBe(3.5);
    expect(r.glucose).toBe(300);
    // bolusEngine.ts:238 — the correction branch also flags anything over 250,
    // so 300 carries 'highBG'. (The Step 1 plan omitted this; the engine is
    // right and the planned fixture was wrong. See the Step 2 discrepancy report.)
    expect(r.flags).toEqual(['highBG']);
  });

  it('BG 180 sits on the boundary and produces no correction', () => {
    const r = computeSmartBolus(inputs({ carbs: 0, glucose: 180 }));
    expect(r.correction).toBe(0);
    expect(r.total).toBe(0);
  });

  /**
   * KNOWN-BAD BASELINE — P7-010
   * Correction is computed to the MIDPOINT but gated on targetHigh, so one
   * mg/dL across the threshold introduces a step of roughly a full unit rather
   * than a continuous ramp. Owning remediation: RU-11 (policy) then RU-6.
   */
  it('KNOWN-BAD BASELINE — P7-010: BG 181 jumps from 0 U to a ~1.1 U correction', () => {
    const at180 = computeSmartBolus(inputs({ carbs: 0, glucose: 180 }));
    const at181 = computeSmartBolus(inputs({ carbs: 0, glucose: 181 }));
    expect(at180.total).toBe(0);
    expect(at181.correction).toBeCloseTo(1.1, 10);
    expect(at181.total).toBeCloseTo(1.1, 10);
  });

  it('BG above 250 raises the highBG flag', () => {
    expect(computeSmartBolus(inputs({ carbs: 0, glucose: 260 })).flags).toContain('highBG');
  });

  /**
   * KNOWN-BAD BASELINE — P7-003
   * A missing correction factor is silently replaced by 50 mg/dL per U.
   */
  it('KNOWN-BAD BASELINE — P7-003: a missing ISF is substituted with 50', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 0,
        glucose: 300,
        profile: profile({ correction_factor: undefined }),
      })
    );
    expect(r.correctionFactor).toBe(50);
    expect(r.correction).toBe(3.5);
    expect(r.flags).toContain('noRatio');
  });

  it('a zero ISF is treated as unset and replaced by 50, also raising noRatio', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 0, glucose: 300, profile: profile({ correction_factor: 0 }) })
    );
    expect(r.correctionFactor).toBe(50);
    expect(r.correction).toBe(3.5);
    expect(r.flags).toContain('noRatio');
  });

  /**
   * REMEDIATED — Step 13 (finding P7-003).
   *
   * BEFORE: a NEGATIVE ISF was truthy, passed the `|| 50` guard and was used as
   * a clinical parameter. `correctionFactor: -50`, `correction: -3.5`, and the
   * negative correction SUBTRACTED from the meal bolus: `total: 1.5` instead of
   * the 5.0 U the meal alone required.
   *
   * AFTER: an ISF that is not a usable quantity (0, negative, NaN, Infinity) is
   * unavailable, and takes the same explicit fallback path as a missing one —
   * the app's existing 50 mg/dL/U, reported as `isfSource: 'fallback'`. No new
   * value was introduced and the correction formula is untouched.
   */
  it('a negative ISF is unusable, so the app fallback is used and labelled', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 50,
        glucose: 300,
        profile: profile({ correction_factor: -50 }),
      })
    );
    expect(r.correctionFactor).toBe(50);
    expect(r.isfSource).toBe('fallback');
    expect(r.correction).toBe(3.5); // (300 − 125) / 50, never negative
    expect(r.total).toBe(8.5); // 5.0 meal + 3.5 correction
    expect(r.flags).toContain('defaultIsf');
    expect(r.flags).toContain('noRatio'); // the compound flag, unchanged
  });

  it('a patient-entered 50 is distinguishable from the fallback 50', () => {
    const entered = computeSmartBolus(
      inputs({ carbs: 0, glucose: 300, profile: profile({ correction_factor: 50 }) })
    );
    const fallback = computeSmartBolus(
      inputs({ carbs: 0, glucose: 300, profile: profile({ correction_factor: undefined }) })
    );
    expect(entered.correctionFactor).toBe(fallback.correctionFactor); // same number…
    expect(entered.isfSource).toBe('profile'); // …different claim
    expect(fallback.isfSource).toBe('fallback');
    expect(entered.flags).not.toContain('defaultIsf');
    expect(fallback.flags).toContain('defaultIsf');
  });

  it('a non-finite ISF takes the same fallback path', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, 0]) {
      const r = computeSmartBolus(
        inputs({ carbs: 0, glucose: 300, profile: profile({ correction_factor: bad }) })
      );
      expect(r.correctionFactor).toBe(50);
      expect(r.isfSource).toBe('fallback');
      expect(r.correction).toBe(3.5);
    }
  });
});

describe('D — IOB effect on the total', () => {
  it('subtracts active insulin from the requirement', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 60, insulinLogs: [insulinLog(6, 120)] }) // 6 U at 120 min → 3 U left
    );
    expect(r.iob).toBe(3);
    expect(r.mealBolus).toBe(6);
    expect(r.total).toBe(3);
    expect(r.flags).toContain('iob');
  });

  it('floors the total at 0 when IOB exceeds the requirement', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 20, insulinLogs: [insulinLog(10, 120)] }) // 5 U left vs 2 U needed
    );
    expect(r.iob).toBe(5);
    expect(r.total).toBe(0);
  });

  /**
   * KNOWN-BAD BASELINE — P7-002
   * IOB is subtracted INSIDE the parentheses, so every multiplicative factor
   * also scales the IOB deduction. With an exercise factor of 0.75 only 75 % of
   * the active insulin is deducted, which raises the dose in exactly the
   * situation where hypo risk is already elevated.
   * Owning remediation: RU-11 (specialist decision) then RU-6.
   */
  it('KNOWN-BAD BASELINE — P7-002: the activity factor scales the IOB deduction, not just the requirement', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 60, // 6.0 U required
        insulinLogs: [insulinLog(6, 120)], // 3.0 U active
        activityLogs: [activityLog('high', 60)], // factor 0.75
      })
    );
    expect(r.activityFactor).toBe(0.75);
    expect(r.iob).toBe(3);
    // Implemented: (6 - 3) * 0.75 = 2.25 → 2.3
    // Subtracting IOB last would give 6 * 0.75 - 3 = 1.5
    expect(r.total).toBe(2.3);
    expect(r.flags).toContain('activity');
  });

  it('an extremely large logged dose suppresses the recommendation to 0', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 60, insulinLogs: [insulinLog(100, 0)] })
    );
    expect(r.iob).toBe(100);
    expect(r.total).toBe(0);
    expect(r.flags).toContain('iob');
  });
});

describe('E — hypoglycaemia boundary', () => {
  it('BG 69 with the low target at 70 forces the dose to 0 and flags hypo first', () => {
    const r = computeSmartBolus(inputs({ carbs: 50, glucose: 69 }));
    expect(r.total).toBe(0);
    expect(r.flags[0]).toBe('hypo');
  });

  it('BG 70 is not hypo — the comparison is strict', () => {
    const r = computeSmartBolus(inputs({ carbs: 50, glucose: 70 }));
    expect(r.total).toBe(5);
    expect(r.flags).not.toContain('hypo');
  });

  /**
   * REMEDIATED — Step 13 (finding P7-006).
   *
   * BEFORE: `inputs.glucose && inputs.glucose > 0` collapsed a genuine 0 into
   * the same state as "no reading" — `glucose: null`, `total: 5`, no hypo flag.
   * A critical value therefore produced a full meal bolus.
   *
   * AFTER: 0 is a VALUE, so it reaches the unchanged hypo guard
   * (`glucose < targetLow`) and the dose is 0 with `hypo` first. The threshold
   * itself did not move.
   */
  it('BG 0 is a reading, not an absence, and reaches the hypo guard', () => {
    const r = computeSmartBolus(inputs({ carbs: 50, glucose: 0 }));
    expect(r.glucose).toBe(0);
    expect(r.glucoseState).toBe('value');
    expect(r.total).toBe(0);
    expect(r.flags[0]).toBe('hypo');
    expect(r.flags).not.toContain('noGlucose');
  });

  /**
   * REMEDIATED — Step 13 (finding P7-006).
   *
   * BEFORE: `flags` was `[]` — nothing downstream could tell that the dose had
   * been computed with no glucose context at all.
   *
   * AFTER: the dose is unchanged (the existing policy still allows it), and the
   * absence is reported. Whether a missing reading should BLOCK the dose is a
   * clinical-policy question, deliberately not decided in Step 13.
   */
  it('a missing glucose value is reported, and the dose policy is unchanged', () => {
    const r = computeSmartBolus(inputs({ carbs: 50, glucose: null }));
    expect(r.glucose).toBeNull();
    expect(r.glucoseState).toBe('absent');
    expect(r.total).toBe(5);
    expect(r.flags).toEqual(['noGlucose']);
  });

  it('an unusable reading is reported as invalid, never as absent', () => {
    for (const bad of [Number.NaN, Infinity, -80]) {
      const r = computeSmartBolus(inputs({ carbs: 50, glucose: bad }));
      expect(r.glucoseState).toBe('invalid');
      expect(r.glucose).toBeNull();
      expect(r.flags).toContain('glucoseInvalid');
      expect(r.flags).not.toContain('noGlucose');
      expect(r.total).toBe(5); // the meal bolus alone, as before
    }
  });

  /**
   * REMEDIATED — Step 13 (finding P7-003).
   *
   * BEFORE: `target_low` was read with `??`, which does not catch NaN. Every
   * comparison against NaN is false, so the hypo guard silently disappeared: a
   * BG of 50 produced a full 5 U meal bolus with no hypo flag.
   *
   * AFTER: an unusable bound makes the PAIR unavailable, and the app's existing
   * 70–180 mg/dL fallback applies, reported as `targetSource: 'fallback'`. The
   * hypo guard therefore fires at 50 mg/dL. No new threshold was introduced.
   */
  it('a NaN target_low cannot disable the hypo guard', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 50,
        glucose: 50,
        profile: profile({ target_low: Number.NaN }),
      })
    );
    expect(r.targetLow).toBe(70);
    expect(r.targetHigh).toBe(180);
    expect(r.targetSource).toBe('fallback');
    expect(r.total).toBe(0);
    expect(r.flags).toContain('hypo');
    expect(r.flags).toContain('defaultTarget');
  });

  it('an inverted target pair is unusable and takes the same fallback path', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 50, glucose: 120, profile: profile({ target_low: 180, target_high: 70 }) })
    );
    expect(r.targetLow).toBe(70);
    expect(r.targetHigh).toBe(180);
    expect(r.targetSource).toBe('fallback');
    // 120 is inside 70–180: no hypo, no correction. Before, it was BOTH "below
    // the low target" (hypo, dose 0) and above the high one.
    expect(r.flags).not.toContain('hypo');
    expect(r.total).toBe(5);
  });

  it('a valid target pair is passed through untouched', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 0, glucose: 200, profile: profile({ target_low: 80, target_high: 160 }) })
    );
    expect(r.targetLow).toBe(80);
    expect(r.targetHigh).toBe(160);
    expect(r.targetMid).toBe(120);
    expect(r.targetSource).toBe('profile');
    expect(r.flags).not.toContain('defaultTarget');
  });
});

describe('F — dose cap', () => {
  it('exposes MAX_SAFE_BOLUS as 20', () => {
    expect(MAX_SAFE_BOLUS).toBe(20);
  });

  it('a raw total that rounds to exactly 20.0 is not capped', () => {
    // 200.4 g at 10 g/U → 20.04 → rounds to 20.0, which is not > 20.
    const r = computeSmartBolus(inputs({ carbs: 200.4 }));
    expect(r.total).toBe(20);
    expect(r.flags).not.toContain('capped');
  });

  it('a raw total that rounds to 20.1 is capped back to 20.0 and flagged', () => {
    // 200.6 g at 10 g/U → 20.06 → rounds to 20.1, which is > 20.
    const r = computeSmartBolus(inputs({ carbs: 200.6 }));
    expect(r.total).toBe(20);
    expect(r.flags).toContain('capped');
  });

  it('a very large carb input is clamped and flagged', () => {
    const r = computeSmartBolus(inputs({ carbs: 5000 }));
    expect(r.mealBolus).toBe(500);
    expect(r.total).toBe(20);
    expect(r.flags).toContain('capped');
  });

  /**
   * KNOWN-BAD BASELINE — P7-001 / P6-001 / P2-003
   * The clamp is the only barrier against an implausible carbohydrate value,
   * and it only engages above 20 U. A cross-user poisoned catalog row that
   * changes 10 g into 60 g produces 6.0 U instead of 1.0 U with NO flag and an
   * output indistinguishable from a correct calculation.
   * Owning remediation: RU-1 (ownership) + RU-2 (plausibility).
   */
  it('KNOWN-BAD BASELINE — P7-001: a plausible poisoned carb value stays under the cap and raises no flag', () => {
    const truthful = computeSmartBolus(inputs({ carbs: 10 }));
    const poisoned = computeSmartBolus(inputs({ carbs: 60 }));
    expect(truthful.total).toBe(1);
    expect(poisoned.total).toBe(6);
    // STILL NOT FIXED. `noGlucose` is Step 13's new signal for the missing
    // reading in this fixture and says nothing about the carbohydrate: there is
    // no 'capped', and nothing marks 60 g as implausible or unverified. Step 12
    // stopped an unverified catalogue row from being dosed at all; a poisoned
    // value that reaches the engine is still indistinguishable from a real one.
    expect(poisoned.flags).toEqual(['noGlucose']);
    expect(poisoned.flags).not.toContain('capped');
  });
});

describe('G — glucose units', () => {
  it('an ordinary mg/dL reading below the high target produces no correction', () => {
    const r = computeSmartBolus(inputs({ carbs: 0, glucose: 100 }));
    expect(r.correction).toBe(0);
    expect(r.total).toBe(0);
  });

  /**
   * PARTIALLY REMEDIATED — Step 13 (finding P7-005).
   *
   * BEFORE: `BolusInputs` carried no unit at all, so 5.6 was compared against
   * mg/dL thresholds, landed below the low target and tripped the hypo guard.
   *
   * AFTER: the unit is part of the contract. A bare 5.6 is still read as
   * 5.6 mg/dL — and STILL reads as a hypo — because mg/dL is the app's own
   * documented default for an unlabelled reading (`saveGlucose` writes only
   * mg/dL, the column defaults to it, every field says mg/dL). What changed is
   * that a caller holding mmol/L can now SAY so, and then it is converted
   * rather than misread. This fixture therefore records the unlabelled case as
   * unchanged, and the next one records the labelled case.
   */
  it('an unlabelled 5.6 is still mg/dL, because that is the app-wide default', () => {
    const r = computeSmartBolus(inputs({ carbs: 50, glucose: 5.6 }));
    expect(r.glucose).toBe(5.6);
    expect(r.glucoseSupplied).toEqual({ value: 5.6, unit: 'mg/dL' });
    expect(r.total).toBe(0);
    expect(r.flags[0]).toBe('hypo');
  });

  it('an explicit mmol/L reading is converted, not misread', () => {
    // 5.6 mmol/L × 18.0182 = 100.9 mg/dL — inside 70–180, so no hypo and no
    // correction. The supplied value stays visible next to the normalized one.
    const r = computeSmartBolus(inputs({ carbs: 50, glucose: 5.6, glucoseUnit: 'mmol/L' }));
    expect(r.glucose).toBe(100.9);
    expect(r.glucoseSupplied).toEqual({ value: 5.6, unit: 'mmol/L' });
    expect(r.glucoseState).toBe('value');
    expect(r.flags).not.toContain('hypo');
    expect(r.total).toBe(5); // the meal bolus, undisturbed
  });

  it('an explicit mmol/L hypo is still a hypo', () => {
    // 3.5 mmol/L = 63.1 mg/dL, below the 70 low target. The threshold did not
    // move; the value now arrives in the unit the threshold is written in.
    const r = computeSmartBolus(inputs({ carbs: 50, glucose: 3.5, glucoseUnit: 'mmol/L' }));
    expect(r.glucose).toBe(63.1);
    expect(r.flags[0]).toBe('hypo');
    expect(r.total).toBe(0);
  });

  it('an explicit mg/dL reading behaves exactly as an unlabelled one', () => {
    const labelled = computeSmartBolus(inputs({ carbs: 50, glucose: 200, glucoseUnit: 'mg/dL' }));
    const bare = computeSmartBolus(inputs({ carbs: 50, glucose: 200 }));
    expect(labelled.total).toBe(bare.total);
    expect(labelled.correction).toBe(bare.correction);
  });
});

describe('raw / rounding / cap are distinguishable in the output', () => {
  it('reports rawTotal alongside the rounded and capped total', () => {
    const r = computeSmartBolus(inputs({ carbs: 5000 }));
    expect(r.rawTotal).toBe(500); // pre-cap, rounded for display
    expect(r.total).toBe(20); // post-round, post-cap
  });

  it('rounds the final total to 0.1 U', () => {
    // 43 g at 10 g/U → 4.3
    expect(computeSmartBolus(inputs({ carbs: 43 })).total).toBe(4.3);
    // 1 g at 10 g/U → 0.1
    expect(computeSmartBolus(inputs({ carbs: 1 })).total).toBe(0.1);
  });
});
