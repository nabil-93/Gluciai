import { describe, expect, it } from 'vitest';

import { computeSmartBolus, computeTrend, localDoseCheck } from '@/services/bolusEngine';
import type { GlucoseLog } from '@/types';

import { NOW, glucoseLog, inputs, minutesBefore, profile } from './_fixtures';

/**
 * CHARACTERIZATION — the bolus INPUT/PARAMETER boundary (P7-003, P7-005, P7-006).
 *
 * `computeSmartBolus.golden.test.ts` pins the arithmetic. This file pins the
 * boundary questions that come BEFORE the arithmetic and that the existing
 * fixtures do not reach:
 *
 *   · can the engine tell an unknown carbohydrate from a genuine 0 g?
 *   · can it tell "no glucose" from a supplied 0, or from something unusable?
 *   · does it know what UNIT a glucose value is in — its own, or its history's?
 *   · what does it do with a parameter that is present but unusable (an
 *     inverted target pair, a non-finite target, a fallback ISF)?
 *   · is the `noRatio` flag it raises actually consumed anywhere?
 *
 * Every expectation below was written and run against the code BEFORE Step 13
 * changed it. Where Step 13 then changed the answer, the old answer is kept in
 * the comment, so the diff of this file IS the behaviour change.
 */

/* ── 1. The call site's own glucose collapse ──────────────── */

describe('the bolus screen collapses a typed 0 before the engine ever sees it', () => {
  /**
   * MIRROR of `bolus.tsx:149` / `:198` — both call sites compute:
   *
   *     glucose: (parseDecimal(glucose) ?? 0) > 0 ? parseDecimal(glucose)! : null
   *
   * so a patient who types "0" hands the engine `null`, and an engine-side fix
   * for P7-006 alone would be dead code. The screen is a React Native component
   * and cannot be rendered in this node-environment suite, so the expression is
   * mirrored here; Step 13 replaces it with a shared, exported helper and this
   * block then tests the real thing.
   */
  const callSiteToday = (field: string | undefined) => {
    const parsed = field === undefined || field === '' ? undefined : Number(field);
    const n = parsed ?? 0;
    return n > 0 ? parsed! : null;
  };

  it('turns a typed 0 into "no reading"', () => {
    expect(callSiteToday('0')).toBeNull();
  });

  it('turns a negative reading into "no reading" too', () => {
    expect(callSiteToday('-5')).toBeNull();
  });

  it('passes an empty field through as "no reading" — the only correct case', () => {
    expect(callSiteToday('')).toBeNull();
    expect(callSiteToday(undefined)).toBeNull();
  });

  it('passes a real reading through unchanged', () => {
    expect(callSiteToday('120')).toBe(120);
  });
});

/* ── 2. Glucose history and units, through the trend ──────── */

/** A reading in an explicit unit — the field `GlucoseLog` has always had. */
function log(value: number, minutesAgo: number, unit: GlucoseLog['unit']): GlucoseLog {
  return { ...glucoseLog(value, minutesAgo), unit };
}

describe('computeTrend normalizes each reading through its own unit (P7-005)', () => {
  it('a consistent mg/dL history produces the expected slope', () => {
    // 100 → 160 over 60 min = +1.0 mg/dL per min. Below the +2 "rising" gate.
    // Unchanged by Step 13.
    const r = computeSmartBolus(
      inputs({ carbs: 50, glucoseLogs: [glucoseLog(100, 60), glucoseLog(160, 0)] })
    );
    expect(r.trendPerMin).toBe(1);
    expect(r.trendFactor).toBe(1);
  });

  it('an all-mmol/L history now reads as the rise it is', () => {
    // BEFORE: 5.0 → 8.9 mmol/L (90 → 160 mg/dL, a fast rise) was read as
    // +0.065 mg/dL per minute — nothing, no `rising`.
    // AFTER: +1.17 mg/dL per minute. Still below the +2 gate, which is
    // unchanged, so the FACTOR does not move — but the slope is now the
    // patient's real one, and a steeper rise would trip the gate.
    const trend = computeTrend([log(5.0, 60, 'mmol/L'), log(8.9, 0, 'mmol/L')], NOW);
    expect(trend).toBeCloseTo(1.172, 2); // (160.4 − 90.1) / 60
    const r = computeSmartBolus({
      ...inputs({ carbs: 50 }),
      glucoseLogs: [log(5.0, 60, 'mmol/L'), log(8.9, 0, 'mmol/L')],
    });
    expect(r.trendFactor).toBe(1);
  });

  it('a genuinely fast mmol/L rise now reaches the unchanged +2 gate', () => {
    // 5.0 → 12.0 mmol/L in an hour = 90 → 216 mg/dL = +2.1 per minute.
    const r = computeSmartBolus({
      ...inputs({ carbs: 50 }),
      glucoseLogs: [log(5.0, 60, 'mmol/L'), log(12.0, 0, 'mmol/L')],
    });
    expect(r.flags).toContain('rising');
    expect(r.trendFactor).toBe(1.1);
  });

  it('ONE mmol/L reading among mg/dL ones no longer fabricates a fast fall', () => {
    // BEFORE, the sharpest instance: a steady patient (100 mg/dL, then
    // 5.6 mmol/L = 101 mg/dL) read as falling from 100 to 5.6 → −1.57 mg/dL per
    // minute, which tripped `falling`, cut the dose 10 % (5.0 → 4.5 U), raised
    // `nearLow`, and made a correct 5 U dose look dangerous to `localDoseCheck`.
    const history = [log(100, 60, 'mg/dL'), log(5.6, 0, 'mmol/L')];
    const trend = computeTrend(history, NOW);
    expect(trend).toBeCloseTo(0.015, 3); // flat, which is the truth

    const r = computeSmartBolus({ ...inputs({ carbs: 50, glucose: 95 }), glucoseLogs: history });
    expect(r.flags).not.toContain('falling');
    expect(r.flags).not.toContain('nearLow');
    expect(r.trendFactor).toBe(1);
    expect(r.total).toBe(5);
    expect(localDoseCheck(5, r).reasons).not.toContain('fallingIncrease');
  });

  it('a history value in an unrecognized unit is DROPPED, not mixed in', () => {
    // BEFORE: a foreign unit string was indistinguishable from mg/dL, so this
    // pair produced a −1.0 mg/dL per minute fall.
    // AFTER: the unusable row is dropped; one reading is not a slope, so the
    // trend is null and no factor is applied. (`sync.ts` coerces server rows to
    // one of the two units, so this shape reaches the store only from an older
    // client or a direct write.)
    const history = [
      { ...glucoseLog(100, 60), unit: 'mystery' as unknown as GlucoseLog['unit'] },
      glucoseLog(40, 0),
    ];
    expect(computeTrend(history, NOW)).toBeNull();
  });

  it('a reading with no unit at all is read as mg/dL — the app-wide default', () => {
    const history = [
      { ...glucoseLog(160, 60), unit: undefined as unknown as GlucoseLog['unit'] },
      glucoseLog(100, 0),
    ];
    expect(computeTrend(history, NOW)).toBeCloseTo(-1, 10);
  });
});

/* ── 3. Carbohydrate: unknown vs a genuine zero ───────────── */

describe('carbohydrate: unknown is not a zero (blocker #1 residual)', () => {
  it('an unknown carbohydrate is reported, and a genuine 0 g is not', () => {
    // BEFORE: nothing on `BolusInputs` carried the state Step 10 built for the
    // client, so a placeholder 0 reaching the engine was indistinguishable from
    // water — same dose, same empty flag list.
    const unknown = computeSmartBolus(inputs({ carbs: 0, glucose: 120, carbsKnown: false }));
    const genuineZero = computeSmartBolus(inputs({ carbs: 0, glucose: 120, carbsKnown: true }));

    expect(unknown.carbsKnown).toBe(false);
    expect(unknown.flags).toContain('carbsUnknown');
    expect(genuineZero.carbsKnown).toBe(true);
    expect(genuineZero.flags).not.toContain('carbsUnknown');
    // Neither produces a meal bolus — but only one of them CLAIMS the plate had
    // no carbohydrate.
    expect(unknown.mealBolus).toBe(0);
    expect(genuineZero.mealBolus).toBe(0);
  });

  it('an unknown carbohydrate with a figure attached contributes no meal bolus', () => {
    // A placeholder can carry a number (a legacy meal, a re-scaled item). The
    // engine must not dose from it while calling it unknown.
    const r = computeSmartBolus(inputs({ carbs: 60, glucose: 120, carbsKnown: false }));
    expect(r.carbs).toBe(60); // shown, not hidden
    expect(r.mealBolus).toBe(0); // and not dosed from
    expect(r.total).toBe(0);
    expect(r.flags).toContain('carbsUnknown');
  });

  it('omitting the flag keeps every existing caller unchanged', () => {
    const explicit = computeSmartBolus(inputs({ carbs: 50, glucose: 120, carbsKnown: true }));
    const omitted = computeSmartBolus(inputs({ carbs: 50, glucose: 120 }));
    expect(omitted.total).toBe(explicit.total);
    expect(omitted.carbsKnown).toBe(true);
    expect(omitted.flags).not.toContain('carbsUnknown');
  });

  it('a correction-only dose still works when the carbohydrate is unknown', () => {
    // The clinical use blocker #1 protected: no carb figure, but a high BG that
    // genuinely needs correcting.
    const r = computeSmartBolus(inputs({ carbs: 0, glucose: 300, carbsKnown: false }));
    expect(r.correction).toBe(3.5);
    expect(r.total).toBe(3.5);
    expect(r.flags).toContain('carbsUnknown');
  });
});

/* ── 4. The flag nobody reads ─────────────────────────────── */

describe('`noRatio` kept, and each defaulted parameter now named', () => {
  it('still raises the compound flag, and now says WHICH parameter was defaulted', () => {
    // BEFORE: one compound flag for two different missing parameters, read by
    // nobody (`noRatio` appeared only in bolusEngine.ts). The UI read
    // `ratioSource` for the ICR half and had nothing for the ISF half.
    // AFTER: `noRatio` is unchanged, so anything reading it behaves the same,
    // and `isfSource`/`defaultIsf` carry the half that was invisible.
    const noIcr = computeSmartBolus(
      inputs({ carbs: 50, profile: profile({ carb_ratio: undefined }) })
    );
    const noIsf = computeSmartBolus(
      inputs({ carbs: 50, glucose: 300, profile: profile({ correction_factor: undefined }) })
    );
    expect(noIcr.flags).toContain('noRatio');
    expect(noIsf.flags).toContain('noRatio');

    expect(noIcr.ratioSource).toBe('default');
    expect(noIcr.isfSource).toBe('profile'); // the ISF was fine
    expect(noIcr.flags).not.toContain('defaultIsf');

    expect(noIsf.ratioSource).toBe('global'); // the ICR was fine
    expect(noIsf.isfSource).toBe('fallback');
    expect(noIsf.flags).toContain('defaultIsf');
  });

  it('a fully specified profile raises none of them', () => {
    const r = computeSmartBolus(inputs({ carbs: 50, glucose: 120 }));
    expect(r.flags).not.toContain('noRatio');
    expect(r.flags).not.toContain('defaultIsf');
    expect(r.flags).not.toContain('defaultTarget');
    expect(r.isfSource).toBe('profile');
    expect(r.targetSource).toBe('profile');
    expect(r.ratioSource).toBe('global');
  });
});

/* ── 5. ISF provenance ───────────────────────────────────── */

describe('a fallback ISF of 50 is now distinguishable from a patient-entered 50', () => {
  it('reports the same number with a different claim', () => {
    // BEFORE: the two were identical except for the unread compound flag, so the
    // params card printed "50 mg/dL · 1 U" as the patient's own in both cases.
    const entered = computeSmartBolus(
      inputs({ carbs: 0, glucose: 300, profile: profile({ correction_factor: 50 }) })
    );
    const fallback = computeSmartBolus(
      inputs({ carbs: 0, glucose: 300, profile: profile({ correction_factor: undefined }) })
    );
    expect(entered.correctionFactor).toBe(50);
    expect(fallback.correctionFactor).toBe(50);
    expect(entered.correction).toBe(fallback.correction); // formula untouched
    expect(entered.isfSource).toBe('profile');
    expect(fallback.isfSource).toBe('fallback');
    expect(entered.flags).toEqual(['highBG']);
    expect(fallback.flags).toEqual(['noRatio', 'defaultIsf', 'highBG']);
  });

  it('an Infinity ISF is unusable and takes the fallback path', () => {
    // BEFORE: `correctionFactor: Infinity`, `correction: 0` — the correction was
    // silently annihilated and nothing said so.
    const r = computeSmartBolus(
      inputs({ carbs: 0, glucose: 300, profile: profile({ correction_factor: Infinity }) })
    );
    expect(r.correctionFactor).toBe(50);
    expect(r.isfSource).toBe('fallback');
    expect(r.correction).toBe(3.5);
    expect(r.flags).toContain('defaultIsf');
  });
});

/* ── 6. Ratio validity ───────────────────────────────────── */

describe('a non-finite ratio is no longer a clinical parameter', () => {
  it('an Infinity per-meal ratio falls through instead of maxing out the dose', () => {
    // BEFORE: `per10g > 0` is true for Infinity, gPerU became 10/Infinity = 0,
    // the meal bolus was carbs/0 = Infinity, and only the 20 U cap stopped it.
    // AFTER: the value is unusable, so the next candidate is used — here the
    // fallback, since `carb_ratio` is absent too.
    const r = computeSmartBolus(
      inputs({
        carbs: 50,
        mealTime: 'lunch',
        profile: profile({ insulin_per_10g_lunch: Infinity, carb_ratio: undefined }),
      })
    );
    expect(r.ratio).toBe(10);
    expect(r.ratioSource).toBe('default');
    expect(r.total).toBe(5);
    expect(r.flags).not.toContain('capped');
    expect(r.flags).toContain('noRatio');
  });

  it('an Infinity carb_ratio falls through to the fallback, not to a 0 U dose', () => {
    // BEFORE: `ratio: Infinity`, `mealBolus: 0`, `total: 0`, no flag at all.
    const r = computeSmartBolus(
      inputs({ carbs: 50, profile: profile({ carb_ratio: Infinity }) })
    );
    expect(r.ratio).toBe(10);
    expect(r.ratioSource).toBe('default');
    expect(r.total).toBe(5);
    expect(r.flags).toContain('noRatio');
  });

  it('a valid per-meal ratio still wins over the global one', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 50,
        mealTime: 'lunch',
        profile: profile({ insulin_per_10g_lunch: 2, carb_ratio: 10 }),
      })
    );
    expect(r.ratioSource).toBe('meal');
    expect(r.total).toBe(10);
  });
});

/* ── 7. Targets ──────────────────────────────────────────── */

describe('target values are validated before they guard anything (P7-003)', () => {
  it('an INVERTED pair is unusable, and the app fallback applies', () => {
    // BEFORE: low 180 / high 70 was used as given, so a BG of 120 was BOTH
    // "below the low target" (hypo, dose 0) and above the high one (a
    // correction was computed first). Both guards read a pair nobody validated.
    const r = computeSmartBolus(
      inputs({ carbs: 50, glucose: 120, profile: profile({ target_low: 180, target_high: 70 }) })
    );
    expect(r.targetLow).toBe(70);
    expect(r.targetHigh).toBe(180);
    expect(r.targetSource).toBe('fallback');
    expect(r.flags).toContain('defaultTarget');
    expect(r.flags).not.toContain('hypo');
    expect(r.total).toBe(5);
  });

  it('a non-finite target_high takes the same path', () => {
    // BEFORE: `targetHigh: NaN`, `targetMid: NaN`, `correction: 0` because
    // `300 > NaN` is false — the meal bolus alone, silently.
    const r = computeSmartBolus(
      inputs({
        carbs: 50,
        glucose: 300,
        profile: profile({ target_high: Number.NaN }),
      })
    );
    expect(r.targetHigh).toBe(180);
    expect(r.targetMid).toBe(125);
    expect(r.correction).toBe(3.5); // (300 − 125) / 50, now actually computed
    expect(r.total).toBe(8.5);
    expect(r.flags).toContain('defaultTarget');
  });

  it('every unusable bound shape is caught', () => {
    for (const bad of [Number.NaN, Infinity, -Infinity, 0, -70]) {
      const low = computeSmartBolus(inputs({ carbs: 0, profile: profile({ target_low: bad }) }));
      const high = computeSmartBolus(inputs({ carbs: 0, profile: profile({ target_high: bad }) }));
      expect(low.targetSource).toBe('fallback');
      expect(high.targetSource).toBe('fallback');
      expect(low.targetLow).toBe(70);
      expect(high.targetHigh).toBe(180);
    }
  });

  it('a valid pair is left exactly as it is', () => {
    const r = computeSmartBolus(inputs({ carbs: 50, glucose: 120 }));
    expect(r.targetLow).toBe(70);
    expect(r.targetHigh).toBe(180);
    expect(r.targetMid).toBe(125);
    expect(r.targetSource).toBe('profile');
  });

  it('a valid NON-default pair is not overwritten by the fallback', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 0, glucose: 200, profile: profile({ target_low: 90, target_high: 140 }) })
    );
    expect(r.targetLow).toBe(90);
    expect(r.targetHigh).toBe(140);
    expect(r.targetMid).toBe(115);
    expect(r.targetSource).toBe('profile');
  });
});

/* ── 8. Glucose presence at the engine boundary ───────────── */

describe('glucose presence is three separate states (P7-006)', () => {
  it('0 and null are no longer the same input', () => {
    // BEFORE: both were `glucose: null`, both produced a 5 U meal bolus, and
    // both had an empty flag list.
    const zero = computeSmartBolus(inputs({ carbs: 50, glucose: 0 }));
    const absent = computeSmartBolus(inputs({ carbs: 50, glucose: null }));

    expect(zero.glucoseState).toBe('value');
    expect(zero.glucose).toBe(0);
    expect(zero.total).toBe(0); // 0 < 70 → the unchanged hypo guard
    expect(zero.flags).toContain('hypo');

    expect(absent.glucoseState).toBe('absent');
    expect(absent.glucose).toBeNull();
    expect(absent.total).toBe(5); // existing policy, unchanged
    expect(absent.flags).toEqual(['noGlucose']);
  });

  it('a NaN reading is invalid, and cannot pass for "not measured"', () => {
    // BEFORE: `glucose: null`, `total: 5`, `flags: []` — the defect hid as an
    // absence.
    const r = computeSmartBolus(inputs({ carbs: 50, glucose: Number.NaN }));
    expect(r.glucoseState).toBe('invalid');
    expect(r.glucose).toBeNull();
    expect(r.total).toBe(5);
    expect(r.flags).toEqual(['glucoseInvalid']);
    expect(r.flags).not.toContain('noGlucose');
  });

  it('a negative reading is invalid too', () => {
    const r = computeSmartBolus(inputs({ carbs: 50, glucose: -80 }));
    expect(r.glucoseState).toBe('invalid');
    expect(r.glucose).toBeNull();
    expect(r.total).toBe(5);
    expect(r.flags).toContain('glucoseInvalid');
  });

  it('a reading in a unit the engine does not know is invalid, never mg/dL', () => {
    const r = computeSmartBolus({
      ...inputs({ carbs: 50, glucose: 5.6 }),
      glucoseUnit: 'mmol' as unknown as 'mmol/L',
    });
    expect(r.glucoseState).toBe('invalid');
    expect(r.glucose).toBeNull();
    expect(r.flags).toContain('glucoseInvalid');
    expect(r.flags).not.toContain('hypo'); // it was never compared at all
  });

  it('the timestamped history is not consulted to fill the gap — and must not be', () => {
    // Only the scalar input decides the correction and the hypo guard; the logs
    // drive the trend alone. Recorded because it is correct: the engine never
    // invents a current reading from an old one.
    const r = computeSmartBolus({
      ...inputs({ carbs: 50, glucose: null }),
      glucoseLogs: [glucoseLog(300, 20), glucoseLog(320, 5)],
    });
    expect(r.glucose).toBeNull();
    expect(r.correction).toBe(0);
  });
});

/* ── 9. What must not move ───────────────────────────────── */

describe('the regression net Step 13 must not disturb', () => {
  it('a fully specified valid input produces exactly the dose it does today', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 60,
        glucose: 200,
        now: NOW,
        glucoseLogs: [glucoseLog(190, 40)],
      })
    );
    expect(r.mealBolus).toBe(6);
    expect(r.correction).toBe(1.5); // (200 − 125) / 50
    expect(r.total).toBe(7.5);
    expect(r.flags).toEqual([]);
  });

  it('keeps the strict hypo boundary at 69/70', () => {
    expect(computeSmartBolus(inputs({ carbs: 50, glucose: 69 })).flags).toContain('hypo');
    expect(computeSmartBolus(inputs({ carbs: 50, glucose: 70 })).flags).not.toContain('hypo');
  });

  it('keeps the 20 U cap and the 0.1 U rounding', () => {
    const capped = computeSmartBolus(inputs({ carbs: 500 }));
    expect(capped.total).toBe(20);
    expect(capped.flags).toContain('capped');
    const rounded = computeSmartBolus(
      inputs({ carbs: 43, profile: profile({ carb_ratio: undefined, insulin_per_10g_lunch: 1.5 }) })
    );
    // 6.4, not the 6.5 the engine's own header comment claims for this example:
    // `ratio` is rounded to 2 decimals (6.67) BEFORE the division, and
    // 43 / 6.67 = 6.4468 → 6.4, while 43 / 6.6667 = 6.4500 → 6.5. A 0.1 U
    // artifact of rounding an intermediate, in the same family as P8-004.
    // Recorded as observed; the arithmetic is outside Step 13's contract.
    expect(rounded.total).toBe(6.4);
  });

  it('never lets IOB raise the dose, and never returns a negative total', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 10, glucose: 100, insulinLogs: [{ id: 'i1', user_id: 'u', insulin_type: 'rapid', dose: 20, created_at: minutesBefore(10) }] })
    );
    expect(r.total).toBe(0);
    expect(r.total).toBeGreaterThanOrEqual(0);
  });
});
