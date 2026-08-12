import { describe, expect, it } from 'vitest';

import {
  computeIOB,
  computeSmartBolus,
  computeTrend,
  DIA_HOURS,
  MAX_SAFE_BOLUS,
} from '@/services/bolusEngine';
import { activityLog, glucoseLog, inputs, insulinLog, NOW, profile } from './_fixtures';

/**
 * INDEPENDENT NUMERICAL VALIDATION OF THE BOLUS ENGINE.
 *
 * WHAT MAKES THIS DIFFERENT FROM THE OTHER CLINICAL FIXTURES. Every other file
 * in tests/clinical/ asserts a number the engine produces against a number
 * written down from the engine. That proves the engine has not CHANGED; it
 * cannot prove the engine is RIGHT, because both sides come from the same
 * source.
 *
 * The reference below is derived instead from the standard pump-therapy bolus
 * calculator (Walsh; Scheiner), written out independently:
 *
 *     mealBolus  = carbs / ICR
 *     correction = (BG − target_mid) / ISF,  only when BG > target_high
 *     IOB        = Σ dose_i × (1 − t_i / DIA)              (linear decay)
 *     dose       = (mealBolus + correction) × factors − IOB
 *
 * IOB is subtracted LAST because it is insulin already in the body — a
 * quantity, not a requirement to be re-scaled by an exercise or illness factor.
 *
 * TWO CONCLUSIONS, AND THEY ARE NOT THE SAME ONE:
 *
 *   `expectAgrees`  — the engine matches the convention. That is
 *                     MATHEMATICALLY CONSISTENT. It is NOT clinical validation.
 *   `expectDiverges`— the engine and the convention disagree, and the fixture
 *                     records BOTH numbers and the gap between them. Every
 *                     divergence in this file has one cause (P7-002: IOB is
 *                     subtracted inside the bracket, so every multiplicative
 *                     factor scales it too) and is owned by RU-11 Q1–Q3.
 *
 * NOTHING HERE ASSERTS THAT THE CONVENTION IS CORRECT AND THE ENGINE IS WRONG.
 * Choosing between the two arrangements is a clinical decision. These fixtures
 * exist so that the size of the disagreement is on record, in units of insulin,
 * before anyone makes it — and so that if the arrangement is ever changed, the
 * `expectDiverges` cases fail deliberately and must be re-pinned.
 */

/* ─────────────── the independent reference ─────────────── */

interface Ref {
  carbs: number;
  /** g per unit */
  icr: number;
  /** mg/dL, or null for "not measured" */
  bg: number | null;
  targetLow: number;
  targetHigh: number;
  isf: number;
  iob: number;
  /** activity · trend · sick · stress · status · alcohol */
  factors: number[];
  halveCorrection?: boolean;
}

const DEFAULTS = { icr: 10, targetLow: 70, targetHigh: 180, isf: 50 };

/** The pump-therapy convention: IOB subtracted last. */
function conventionDose(r: Ref): number {
  const mid = Math.round((r.targetLow + r.targetHigh) / 2);
  const meal = r.carbs > 0 ? r.carbs / r.icr : 0;
  let corr = 0;
  if (r.bg !== null && r.bg > r.targetHigh) corr = (r.bg - mid) / r.isf;
  if (r.halveCorrection) corr = corr / 2;
  const f = r.factors.reduce((a, b) => a * b, 1);
  let dose = (meal + corr) * f - r.iob;
  dose = Math.max(0, dose);
  if (r.bg !== null && r.bg < r.targetLow) dose = 0; // hypo guard
  dose = Math.round(dose * 10) / 10;
  return Math.min(dose, MAX_SAFE_BOLUS);
}

const ref = (o: Partial<Ref>): Ref => ({
  carbs: 0,
  bg: null,
  iob: 0,
  factors: [],
  ...DEFAULTS,
  ...o,
});

/** The engine and the convention agree exactly. */
function expectAgrees(actual: number, r: Ref) {
  expect(actual).toBeCloseTo(conventionDose(r), 10);
}

/**
 * They disagree — assert BOTH numbers explicitly, so neither can drift without
 * a fixture going red, and the gap is stated in units.
 */
function expectDiverges(actual: number, r: Ref, expectedGap: number) {
  const conv = conventionDose(r);
  expect(Math.round((actual - conv) * 10) / 10).toBeCloseTo(expectedGap, 10);
}

/* ══════════════ agreement — the arithmetic is sound ══════════════ */

describe('MATHEMATICALLY CONSISTENT — engine matches the pump convention', () => {
  it('normal glucose, normal meal: 60 g at ICR 10 → 6.0 U', () => {
    const r = computeSmartBolus(inputs({ carbs: 60, glucose: 120 }));
    expect(r.total).toBe(6);
    expectAgrees(r.total, ref({ carbs: 60, bg: 120 }));
  });

  it('hypoglycaemia forces the dose to zero and raises the flag', () => {
    const r = computeSmartBolus(inputs({ carbs: 60, glucose: 60 }));
    expect(r.total).toBe(0);
    expect(r.flags).toContain('hypo');
    expectAgrees(r.total, ref({ carbs: 60, bg: 60 }));
  });

  it('the hypo boundary is strict: 70 doses, 69.9 does not', () => {
    expect(computeSmartBolus(inputs({ carbs: 60, glucose: 70 })).total).toBe(6);
    expect(computeSmartBolus(inputs({ carbs: 60, glucose: 69.9 })).total).toBe(0);
  });

  it('high glucose adds a correction: 250 mg/dL + 60 g → 8.5 U', () => {
    const r = computeSmartBolus(inputs({ carbs: 60, glucose: 250 }));
    expect(r.total).toBe(8.5);
    expectAgrees(r.total, ref({ carbs: 60, bg: 250 }));
  });

  it('very high glucose: 400 mg/dL + 60 g → 11.5 U', () => {
    const r = computeSmartBolus(inputs({ carbs: 60, glucose: 400 }));
    expect(r.total).toBe(11.5);
    expectAgrees(r.total, ref({ carbs: 60, bg: 400 }));
  });

  it('correction only, zero carbohydrate', () => {
    const r = computeSmartBolus(inputs({ carbs: 0, glucose: 250 }));
    expect(r.total).toBe(2.5);
    expectAgrees(r.total, ref({ bg: 250 }));
  });

  it('a large meal scales linearly', () => {
    const r = computeSmartBolus(inputs({ carbs: 150, glucose: 120 }));
    expect(r.total).toBe(15);
    expectAgrees(r.total, ref({ carbs: 150, bg: 120 }));
  });

  it('IOB with no other factor: the two arrangements coincide', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 60, glucose: 120, insulinLogs: [insulinLog(6, 120)] })
    );
    expect(r.iob).toBe(3);
    expect(r.total).toBe(3);
    expectAgrees(r.total, ref({ carbs: 60, bg: 120, iob: 3 }));
  });

  it('IOB larger than the requirement floors at zero, never negative', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 20, glucose: 120, insulinLogs: [insulinLog(20, 30)] })
    );
    expect(r.total).toBe(0);
    expectAgrees(r.total, ref({ carbs: 20, bg: 120, iob: 17.5 }));
  });

  it('the safety cap clamps at exactly 20 U and reports the raw figure', () => {
    const r = computeSmartBolus(inputs({ carbs: 5000, glucose: 120 }));
    expect(r.total).toBe(MAX_SAFE_BOLUS);
    expect(r.rawTotal).toBe(500);
    expect(r.flags).toContain('capped');
  });

  it('a requirement of exactly 20 U is not flagged as capped', () => {
    const r = computeSmartBolus(inputs({ carbs: 200, glucose: 120 }));
    expect(r.total).toBe(20);
    expect(r.flags).not.toContain('capped');
  });

  it('an unusable ISF or an inverted target falls back and says so', () => {
    const negIsf = computeSmartBolus(
      inputs({ glucose: 250, profile: profile({ correction_factor: -50 }) })
    );
    expect(negIsf.isfSource).toBe('fallback');
    expect(negIsf.correctionFactor).toBe(50);

    const inverted = computeSmartBolus(
      inputs({ glucose: 250, profile: profile({ target_low: 200, target_high: 80 }) })
    );
    expect(inverted.targetSource).toBe('fallback');
    expect(inverted.targetLow).toBe(70);
    expect(inverted.targetHigh).toBe(180);
  });

  it('a declared mmol/L reading is converted, not compared raw', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 60, glucose: 5.6, glucoseUnit: 'mmol/L' })
    );
    expect(r.glucose).toBe(100.9);
    expect(r.flags).not.toContain('hypo');
    expect(r.total).toBe(6);
  });
});

/* ══════════════ IOB decay, recomputed independently ══════════════ */

describe('MATHEMATICALLY CONSISTENT — linear IOB decay over DIA', () => {
  it.each([
    [0, 10],
    [30, 8.75],
    [60, 7.5],
    [120, 5],
    [180, 2.5],
  ])('a 10 U dose %i minutes ago leaves %f U', (minutesAgo, expected) => {
    const got = computeIOB([insulinLog(10, minutesAgo)], NOW);
    const independent = 10 * (1 - minutesAgo / (DIA_HOURS * 60));
    expect(got[0].remaining).toBeCloseTo(independent, 10);
    expect(got[0].remaining).toBeCloseTo(expected, 10);
  });

  it('a dose past DIA contributes nothing', () => {
    expect(computeIOB([insulinLog(10, 240)], NOW)).toHaveLength(0);
    expect(computeIOB([insulinLog(10, 400)], NOW)).toHaveLength(0);
  });

  /**
   * DOCUMENTED, NOT A DEFECT — the 0.05 U noise floor.
   *
   * `computeIOB` drops a dose whose remainder is <= 0.05 U, so at 239 minutes
   * the independent formula gives 0.042 U and the engine gives nothing. The
   * difference is below the 0.1 U rounding of any dose, so it can never change
   * a recommendation — but it is a threshold nobody ratified, and it is pinned
   * here rather than left as an accident. Owning question: RU-11.
   */
  it('a remainder below the 0.05 U floor is dropped', () => {
    const independent = 10 * (1 - 239 / (DIA_HOURS * 60));
    expect(independent).toBeCloseTo(0.0417, 3);
    expect(computeIOB([insulinLog(10, 239)], NOW)).toHaveLength(0);
  });

  it('multiple doses sum', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 60,
        glucose: 120,
        insulinLogs: [insulinLog(4, 60), insulinLog(4, 120), insulinLog(4, 180)],
      })
    );
    expect(r.iob).toBe(6); // 3 + 2 + 1
    expect(r.total).toBe(0);
    expectAgrees(r.total, ref({ carbs: 60, bg: 120, iob: 6 }));
  });

  it('the trend slope matches an independent (Δmg/dL ÷ Δmin)', () => {
    const logs = [glucoseLog(220, 60), glucoseLog(120, 0)];
    expect(computeTrend(logs, NOW)).toBeCloseTo((120 - 220) / 60, 10);
  });
});

/* ══════════════ divergence — quantified, not corrected ══════════════ */

describe('CLINICAL DECISION REQUIRED — P7-002, IOB is scaled by every factor', () => {
  /**
   * KNOWN-BAD BASELINE — P7-002 / RU-11 Q1–Q3.
   *
   * `raw = (meal + correction − iob) × activity × trend × sick × …`, so the
   * insulin already in the patient is multiplied by factors that describe the
   * REQUIREMENT. Against "scale the requirement, then subtract IOB", the gap is
   * exactly `iob × (1 − factor)`:
   *
   *   factor < 1 (exercise, falling, alcohol)  → the engine doses HIGHER
   *   factor > 1 (sick, stress, injured)       → the engine doses LOWER
   *
   * The exercise direction is the dangerous one: it adds insulin in the state
   * where hypoglycaemia risk is already elevated. NOT FIXED — engineering must
   * not choose the arrangement.
   */

  it('exercise 0.75 with 3 U on board: engine 2.3 U, convention 1.5 U (+0.8)', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 60,
        glucose: 120,
        insulinLogs: [insulinLog(6, 120)],
        activityLogs: [activityLog('high', 60)],
      })
    );
    expect(r.activityFactor).toBe(0.75);
    expect(r.total).toBe(2.3);
    expect(conventionDose(ref({ carbs: 60, bg: 120, iob: 3, factors: [0.75] }))).toBe(1.5);
    expectDiverges(r.total, ref({ carbs: 60, bg: 120, iob: 3, factors: [0.75] }), 0.8);
  });

  it('illness 1.15 moves it the other way: engine 3.5 U, convention 3.9 U (−0.4)', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 60, glucose: 120, insulinLogs: [insulinLog(6, 120)], isSick: true })
    );
    expect(r.total).toBe(3.5);
    expectDiverges(r.total, ref({ carbs: 60, bg: 120, iob: 3, factors: [1.15] }), -0.4);
  });

  it('stress 1.1: engine 3.3 U, convention 3.6 U (−0.3)', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 60, glucose: 120, insulinLogs: [insulinLog(6, 120)], isStressed: true })
    );
    expect(r.total).toBe(3.3);
    expectDiverges(r.total, ref({ carbs: 60, bg: 120, iob: 3, factors: [1.1] }), -0.3);
  });

  it('factors compound, and so does the gap', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 60,
        glucose: 120,
        insulinLogs: [insulinLog(6, 120)],
        activityLogs: [activityLog('high', 60)],
        isSick: true,
      })
    );
    expect(r.total).toBe(2.6);
    expectDiverges(
      r.total,
      ref({ carbs: 60, bg: 120, iob: 3, factors: [0.75, 1.15] }),
      0.4
    );
  });

  /**
   * THE WORST REALISTIC CASE, and the reason this file exists.
   *
   * A patient at 300 mg/dL with 7.5 U still active who has just exercised
   * intensely. Exercise and stacked insulin are the two largest drivers of
   * post-meal hypoglycaemia, and the engine recommends 1.5 U where the
   * convention recommends none at all.
   */
  it('BG 300 · 60 g · IOB 7.5 U · intense exercise: engine 1.5 U, convention 0 U', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 60,
        glucose: 300,
        insulinLogs: [insulinLog(10, 60)],
        activityLogs: [activityLog('high', 30)],
      })
    );
    expect(r.iob).toBe(7.5);
    expect(r.activityFactor).toBe(0.75);
    expect(r.total).toBe(1.5);
    expect(conventionDose(ref({ carbs: 60, bg: 300, iob: 7.5, factors: [0.75] }))).toBe(0);
    expectDiverges(r.total, ref({ carbs: 60, bg: 300, iob: 7.5, factors: [0.75] }), 1.5);
  });
});

describe('CLINICAL DECISION REQUIRED — the remaining open questions, in numbers', () => {
  /** RU-11 Q4–Q7 — premixed insulin contributes nothing to IOB. */
  it('12 U of premix 30 minutes ago is excluded, and disclosed', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 60,
        glucose: 120,
        insulinLogs: [insulinLog(12, 30, 'mixed')],
      })
    );
    expect(r.iob).toBe(0);
    expect(r.total).toBe(6);
    expect(r.flags).toContain('mixedInsulinUncounted');
    // The same units logged as rapid would have left 10.5 U on board.
    expect(computeIOB([insulinLog(12, 30, 'rapid')], NOW)[0].remaining).toBeCloseTo(10.5, 10);
  });

  /** P7-010 / D-4 — the correction is a step, not a ramp. */
  it('180 mg/dL gives 0 U and 181 mg/dL gives 1.1 U', () => {
    expect(computeSmartBolus(inputs({ glucose: 180 })).total).toBe(0);
    expect(computeSmartBolus(inputs({ glucose: 181 })).total).toBe(1.1);
  });

  /** RU-2 / D-3 — no physiological upper bound on a stored reading. */
  it('a 900 mg/dL reading is accepted and produces a 15.5 U correction', () => {
    const r = computeSmartBolus(inputs({ glucose: 900 }));
    expect(r.total).toBe(15.5);
    expect(r.glucoseState).toBe('value');
  });

  /** `highBG` opens at `> 250`, so exactly 250 is unflagged (audit C-3). */
  it('exactly 250 mg/dL does not raise highBG; 251 does', () => {
    expect(computeSmartBolus(inputs({ glucose: 250 })).flags).not.toContain('highBG');
    expect(computeSmartBolus(inputs({ glucose: 251 })).flags).toContain('highBG');
  });

  /** ALC-1 — alcohol reduces through two mechanisms behind one flag. */
  it('alcohol halves the correction AND scales the total by 0.9', () => {
    const sober = computeSmartBolus(inputs({ glucose: 250, carbs: 60 }));
    const drunk = computeSmartBolus(inputs({ glucose: 250, carbs: 60, alcohol: true }));
    expect(sober.total).toBe(8.5);
    expect(drunk.total).toBe(6.5); // (6 + 1.25) × 0.9
    expect(drunk.flags.filter((f) => f === 'alcohol')).toHaveLength(1);
  });

  /** P7-003 / D-2 — fallbacks still produce an injectable number. */
  it('an empty profile still yields 6.0 U, from parameters nobody entered', () => {
    const r = computeSmartBolus(inputs({ carbs: 60, profile: null }));
    expect(r.total).toBe(6);
    expect(r.ratioSource).toBe('default');
    expect(r.isfSource).toBe('fallback');
    expect(r.targetSource).toBe('fallback');
  });
});
