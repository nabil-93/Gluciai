import { describe, expect, it } from 'vitest';

import { computeIOB, computeSmartBolus, MAX_SAFE_BOLUS } from '@/services/bolusEngine';
import { activityLog, inputs, insulinLog, NOW, profile } from './_fixtures';

/**
 * CHARACTERIZATION — the RU-11 findings re-audited in Step 19A.
 *
 * EVERY fixture in this file pins behaviour that Step 19B-1 does NOT change.
 * They exist so that whichever arrangement a specialist eventually authorizes,
 * the exact dose it replaces is on record — and so no dosing behaviour can move
 * without a fixture going red first.
 *
 * Nothing here asserts that the current behaviour is correct. Where a fixture
 * records an alternative arrangement, the alternative is stated as arithmetic
 * in a comment and is NOT computed by the engine: choosing between them is a
 * clinical decision (insulin action, activity physiology, premix composition),
 * and this file deliberately makes none.
 *
 * The engine's assembly, for reference (bolusEngine.ts:559-568):
 *   raw = (mealBolus + correction − iob)
 *         × activity × trend × sick × stress × status × alcohol
 */

/* ── P7-002 — every factor scales the IOB deduction ──────────────────── */

describe('KNOWN-BAD BASELINE — P7-002: multiplicative factors scale the IOB deduction', () => {
  /**
   * KNOWN-BAD BASELINE — P7-002 (release blocker #6)
   *
   * IOB is subtracted INSIDE the bracket, so every factor multiplies it too.
   * Against the alternative "scale the requirement, then subtract IOB last",
   * the difference is exactly `iob × (1 − factor)`:
   *
   *   factor < 1 (exercise, falling, alcohol) → the current dose is HIGHER
   *   factor > 1 (sick, stress, injured/paused, rising) → it is LOWER
   *
   * Both directions are the same structural cause. The exercise case is the
   * dangerous one: it raises the dose in the state where hypo risk is already
   * elevated. Owning remediation: RU-11 (decision) → RU-6. NOT FIXED.
   */

  it('exercise (0.75): 3 U of active insulin is deducted as if it were 2.25 U', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 60, // 6.0 U required
        insulinLogs: [insulinLog(6, 120)], // 3.0 U still active
        activityLogs: [activityLog('high', 60)], // factor 0.75
      })
    );
    expect(r.activityFactor).toBe(0.75);
    expect(r.iob).toBe(3);
    expect(r.total).toBe(2.3); // (6 − 3) × 0.75 = 2.25 → 2.3
    // Subtracting IOB last would be 6 × 0.75 − 3 = 1.5 U, i.e. 0.8 U lower.
  });

  it('the gap scales with the IOB: 6 U active under the same factor', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 120, // 12.0 U required
        insulinLogs: [insulinLog(12, 120)], // 6.0 U still active
        activityLogs: [activityLog('high', 60)],
      })
    );
    expect(r.iob).toBe(6);
    expect(r.total).toBe(4.5); // (12 − 6) × 0.75 = 4.5
    // Subtracting IOB last: 12 × 0.75 − 6 = 3.0 U — a 1.5 U gap.
  });

  it('with no IOB the two arrangements agree exactly', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 60, activityLogs: [activityLog('high', 60)] })
    );
    expect(r.iob).toBe(0);
    expect(r.total).toBe(4.5); // 6 × 0.75, identical either way
  });

  it('a factor ABOVE 1 (sick 1.15) moves the dose the other way', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 60, insulinLogs: [insulinLog(6, 120)], isSick: true })
    );
    expect(r.sickFactor).toBe(1.15);
    expect(r.iob).toBe(3);
    expect(r.total).toBe(3.5); // (6 − 3) × 1.15 = 3.45 → 3.5
    // Subtracting IOB last: 6 × 1.15 − 3 = 3.9 U — the current result is LOWER.
  });

  it('stress (1.1) and injured/paused status (1.08) behave the same way', () => {
    const stressed = computeSmartBolus(
      inputs({ carbs: 60, insulinLogs: [insulinLog(6, 120)], isStressed: true })
    );
    expect(stressed.stressFactor).toBe(1.1);
    expect(stressed.total).toBe(3.3); // (6 − 3) × 1.1

    const paused = computeSmartBolus(
      inputs({
        carbs: 60,
        insulinLogs: [insulinLog(6, 120)],
        activityStatus: 'paused',
      })
    );
    expect(paused.statusFactor).toBe(1.08);
    expect(paused.total).toBe(3.2); // (6 − 3) × 1.08 = 3.24 → 3.2
  });

  it('factors compound, and so does their effect on the deduction', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 60,
        insulinLogs: [insulinLog(6, 120)],
        activityLogs: [activityLog('high', 60)], // 0.75
        isSick: true, // 1.15
      })
    );
    expect(r.activityFactor).toBe(0.75);
    expect(r.sickFactor).toBe(1.15);
    expect(r.total).toBe(2.6); // (6 − 3) × 0.75 × 1.15 = 2.5875 → 2.6
    // Subtracting IOB last: 6 × 0.8625 − 3 = 2.175 → 2.2 U.
  });
});

/* ── P7-011 — a premix-only patient has no IOB at all ────────────────── */

describe('KNOWN-BAD BASELINE — P7-011: a premix-only patient dosing path', () => {
  /**
   * KNOWN-BAD BASELINE — P7-011 / P11-006 / P13-002 (release blocker #5)
   *
   * `computeIOB` keeps `insulin_type === 'rapid'` only. A patient whose logged
   * insulin is `mixed` therefore has an IOB of 0 no matter how recently they
   * injected — while the onboarding wizard treats premix as meal-covering
   * insulin ("Rapid or mixed insulin covers meals → per-meal ratios and
   * correction apply", wizard.tsx), so the calculator is offered to them.
   *
   * The stored row carries ONE total dose and no composition, so the rapid
   * fraction of a premixed dose is not recoverable from the data model. Fixing
   * this needs both a data-model change and a clinical assumption about premix
   * composition and action — neither of which Step 19B-1 makes.
   *
   * Owning remediation: RU-4 (data model) + RU-11 (clinical). NOT FIXED.
   */

  it('a premixed dose injected 30 minutes ago contributes nothing to IOB', () => {
    expect(computeIOB([insulinLog(12, 30, 'mixed')], NOW)).toHaveLength(0);
  });

  it('the same units logged as rapid would be 10.5 U of active insulin', () => {
    // The contrast is the finding: identical units, identical timing, and the
    // deduction is either 10.5 U or nothing depending only on the type label.
    const asRapid = computeIOB([insulinLog(12, 30, 'rapid')], NOW);
    expect(asRapid).toHaveLength(1);
    expect(asRapid[0].remaining).toBeCloseTo(10.5, 10);
  });

  it('end to end: the recommendation ignores the premixed insulin entirely', () => {
    const premixPatient = profile({ insulin_types: ['mixed'] });
    const r = computeSmartBolus(
      inputs({
        carbs: 60,
        profile: premixPatient,
        insulinLogs: [insulinLog(12, 30, 'mixed')],
      })
    );
    expect(r.iob).toBe(0);
    expect(r.iobDoses).toHaveLength(0);
    expect(r.flags).not.toContain('iob');
    expect(r.total).toBe(6); // the full meal bolus, with 12 U injected 30 min ago
  });

  /**
   * RESOLVED — the DISCLOSURE half only. This fixture used to assert that
   * `flags` was exactly `['noGlucose']`, i.e. that nothing in the result told a
   * screen the patient's insulin was being ignored. That silence was the
   * known-bad part, and it is now closed by `mixedInsulinUncounted`.
   *
   * The CLINICAL half of P7-011 is still open and still pinned by the fixtures
   * around this one: a premixed dose contributes **nothing** to IOB, and the
   * dose is unchanged (`iob` 0, `total` 6 above). Only RU-11 Q4–Q7 can change
   * that. See tests/clinical/mixedInsulinDisclosure.golden.test.ts, which
   * proves the disclosure moved no number.
   */
  it('the result now DISCLOSES that an ignored insulin is active', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 60,
        profile: profile({ insulin_types: ['mixed'] }),
        insulinLogs: [insulinLog(12, 30, 'mixed')],
      })
    );
    expect(r.flags).toEqual(['noGlucose', 'mixedInsulinUncounted']);
    // The rule itself is untouched — the premix still counts as zero on board.
    expect(r.iob).toBe(0);
    expect(r.total).toBe(6);
  });

  it('a mixed dose is dropped even when rapid doses are present alongside it', () => {
    const r = computeSmartBolus(
      inputs({
        carbs: 60,
        insulinLogs: [insulinLog(4, 60, 'rapid'), insulinLog(12, 30, 'mixed')],
      })
    );
    expect(r.iob).toBe(3); // 4 U × (1 − 60/240) = 3.0 — the rapid one only
  });
});

/* ── P7-010 — the correction step at target-high ─────────────────────── */

describe('KNOWN-BAD BASELINE — P7-010: correction is a step, not a ramp', () => {
  /**
   * KNOWN-BAD BASELINE — P7-010
   *
   * The correction is GATED on `glucose > targetHigh` but COMPUTED to
   * `targetMid`, so it cannot start small: the first unit of correction is
   * whatever (targetHigh − targetMid) / isf happens to be.
   * Owning remediation: RU-11 → RU-6. NOT FIXED.
   */

  it('180 mg/dL yields no correction and 181 yields ~1.1 U', () => {
    const at180 = computeSmartBolus(inputs({ glucose: 180 }));
    const at181 = computeSmartBolus(inputs({ glucose: 181 }));
    expect(at180.correction).toBe(0);
    expect(at180.total).toBe(0);
    expect(at181.correction).toBe(1.1); // (181 − 125) / 50 = 1.12
    expect(at181.total).toBe(1.1);
  });

  it('the step size follows the target range and the ISF, not the excess', () => {
    // A wider range makes the step bigger: mid is further from high.
    const wide = computeSmartBolus(
      inputs({ glucose: 201, profile: profile({ target_low: 80, target_high: 200 }) })
    );
    expect(wide.targetMid).toBe(140);
    expect(wide.correction).toBe(1.2); // (201 − 140) / 50 = 1.22
  });

  it('one mg/dL below the gate the dose is zero even with a large excess planned', () => {
    const r = computeSmartBolus(inputs({ glucose: 180, carbs: 0 }));
    expect(r.flags).not.toContain('highBG');
    expect(r.total).toBe(0);
  });
});

/* ── P7-004 — meal windows and the snack ratio ───────────────────────── */

describe('KNOWN-BAD BASELINE — P7-004: meal-window boundaries decide the ratio', () => {
  /**
   * KNOWN-BAD BASELINE — P7-004
   *
   * `guessMealTime` reads DEVICE-LOCAL hours, 16:00-17:59 resolves to 'snack',
   * and 'snack' borrows the LUNCH ratio. A patient whose lunch and dinner
   * ratios differ gets a different dose either side of 18:00.
   * Owning remediation: RU-11 → RU-4. NOT FIXED.
   */

  const perMeal = profile({
    insulin_per_10g_breakfast: 1.5,
    insulin_per_10g_lunch: 1,
    insulin_per_10g_dinner: 2,
    carb_ratio: undefined,
  });

  it('17:59 doses on the lunch ratio and 18:00 on the dinner ratio', () => {
    const at1759 = computeSmartBolus(
      inputs({ carbs: 50, profile: perMeal, now: new Date('2026-01-15T17:59:00.000Z') })
    );
    const at1800 = computeSmartBolus(
      inputs({ carbs: 50, profile: perMeal, now: new Date('2026-01-15T18:00:00.000Z') })
    );
    expect(at1759.mealTime).toBe('snack');
    expect(at1759.uPer10g).toBe(1); // the LUNCH value
    expect(at1759.total).toBe(5);
    expect(at1800.mealTime).toBe('dinner');
    expect(at1800.uPer10g).toBe(2);
    expect(at1800.total).toBe(10); // one minute later, twice the dose
  });

  it('a snack at any hour is dosed on the lunch ratio', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 50, profile: perMeal, mealTime: 'snack' })
    );
    expect(r.uPer10g).toBe(1);
    expect(r.ratioSource).toBe('meal');
  });

  it('an explicit mealTime from the screen overrides the clock', () => {
    // The patient CAN correct it — which is why this is medium and not high.
    const r = computeSmartBolus(
      inputs({
        carbs: 50,
        profile: perMeal,
        mealTime: 'dinner',
        now: new Date('2026-01-15T17:59:00.000Z'),
      })
    );
    expect(r.mealTime).toBe('dinner');
    expect(r.total).toBe(10);
  });
});

/* ── P7-003 — a dose from parameters the patient never entered ───────── */

describe('KNOWN-BAD BASELINE — P7-003: fallback parameters still produce a dose', () => {
  /**
   * KNOWN-BAD BASELINE — P7-003 (release blocker #3, policy half)
   *
   * Step 13 closed the validation half: an unusable parameter can no longer
   * reach the formula, and every fallback is reported. What remains is that the
   * fallback VALUES still produce an actionable, injectable number for a
   * patient who has entered nothing at all.
   * Owning remediation: RU-11 (policy). NOT FIXED.
   */

  it('an empty profile still yields a full meal bolus on the app defaults', () => {
    const r = computeSmartBolus(inputs({ carbs: 60, profile: null }));
    expect(r.ratioSource).toBe('default');
    expect(r.isfSource).toBe('fallback');
    expect(r.targetSource).toBe('fallback');
    expect(r.total).toBe(6); // 60 g ÷ 10 g/U — none of it the patient's
    expect(r.flags).toEqual(expect.arrayContaining(['noRatio', 'defaultIsf', 'defaultTarget']));
  });

  it('and a correction too, from a fallback ISF and a fallback target', () => {
    const r = computeSmartBolus(inputs({ glucose: 250, profile: null }));
    expect(r.correctionFactor).toBe(50);
    expect(r.targetMid).toBe(125);
    expect(r.correction).toBe(2.5); // (250 − 125) / 50
    expect(r.total).toBe(2.5);
  });

  it('the result reports the provenance — nothing refuses to dose on it', () => {
    const r = computeSmartBolus(inputs({ carbs: 60, profile: null }));
    expect(r.flags).toContain('noRatio');
    expect(r.total).toBeGreaterThan(0);
  });
});

/* ── Planned vs completed sport (new in Step 19A) ────────────────────── */

describe('KNOWN-BAD BASELINE — planned and completed sport are dosed identically', () => {
  /**
   * KNOWN-BAD BASELINE — SPORT-1 (observed during the Step 19A audit)
   *
   * `declaredSport.timing` is captured, carried into the result as
   * `sportTiming` and shown on screen — but it takes NO part in the
   * arithmetic. A session the patient has already finished and one they merely
   * intend to do produce the same reduction, although the insulin already
   * injected and the glucose already spent differ completely.
   * Owning remediation: RU-11 (clinical). NOT FIXED.
   */

  const sport = { kind: 'run' as const, intensity: 'high' as const, durationMin: 45 };

  it('done and planned produce the same factor and the same dose', () => {
    const done = computeSmartBolus(
      inputs({ carbs: 60, declaredSport: { ...sport, timing: 'done' } })
    );
    const planned = computeSmartBolus(
      inputs({ carbs: 60, declaredSport: { ...sport, timing: 'planned' } })
    );
    expect(done.activityFactor).toBe(0.75);
    expect(planned.activityFactor).toBe(0.75);
    expect(done.total).toBe(planned.total);
    expect(done.total).toBe(4.5);
  });

  it('the timing IS recorded and reported — it simply changes nothing', () => {
    const planned = computeSmartBolus(
      inputs({ carbs: 60, declaredSport: { ...sport, timing: 'planned' } })
    );
    expect(planned.sportTiming).toBe('planned');
    expect(planned.flags).toContain('activity');
  });

  it('duration scales the reduction, for both timings alike', () => {
    const short = computeSmartBolus(
      inputs({
        carbs: 60,
        declaredSport: { ...sport, durationMin: 20, timing: 'planned' },
      })
    );
    expect(short.activityFactor).toBe(0.85); // 0.25 × 0.6 = 0.15 reduction
    expect(short.total).toBe(5.1);
  });
});

/* ── Alcohol applies twice (new in Step 19A) ─────────────────────────── */

describe('KNOWN-BAD BASELINE — alcohol reduces the dose through two mechanisms', () => {
  /**
   * KNOWN-BAD BASELINE — ALC-1 (observed during the Step 19A audit)
   *
   * A declared alcohol intake HALVES the correction and then multiplies the
   * assembled dose by 0.9. Both are defensible on their own — alcohol blocks
   * hepatic glucose release and the delayed-hypo risk is real — but the
   * combination has never been clinically ratified, and it is invisible: the
   * screen shows one "alcohol" flag for two separate reductions.
   * Owning remediation: RU-11 (clinical). NOT FIXED.
   */

  it('the correction is halved AND the total is scaled by 0.9', () => {
    const sober = computeSmartBolus(inputs({ glucose: 250, carbs: 60 }));
    const drunk = computeSmartBolus(inputs({ glucose: 250, carbs: 60, alcohol: true }));

    expect(sober.correction).toBe(2.5); // (250 − 125) / 50
    expect(sober.total).toBe(8.5); // 6 + 2.5

    expect(drunk.correction).toBe(1.3); // 2.5 / 2 = 1.25 → reported 1.3
    expect(drunk.alcoholFactor).toBe(0.9);
    expect(drunk.total).toBe(6.5); // (6 + 1.25) × 0.9 = 6.525 → 6.5
    expect(drunk.flags).toContain('alcohol');
  });

  it('with no correction to halve, only the 0.9 factor applies', () => {
    const r = computeSmartBolus(inputs({ carbs: 60, alcohol: true }));
    expect(r.correction).toBe(0);
    expect(r.total).toBe(5.4); // 6 × 0.9
  });

  it('one flag covers both effects, so the screen cannot separate them', () => {
    const r = computeSmartBolus(inputs({ glucose: 250, carbs: 60, alcohol: true }));
    expect(r.flags.filter((f) => f === 'alcohol')).toHaveLength(1);
  });
});

/* ── P7-009 — the capped dose (the one item Step 19B-1 changes) ──────── */

describe('P7-009 / P12-001 — the 20 U ceiling', () => {
  /**
   * The NUMBERS here are the contract Step 19B-1 must not move: the threshold,
   * the clamped value and the flag. Only the PRESENTATION changes — see
   * `tests/domain/cappedDose.golden.test.ts` for the UI half.
   */

  it('a requirement above the ceiling is clamped to exactly 20 U and flagged', () => {
    const r = computeSmartBolus(inputs({ carbs: 5000 }));
    expect(r.total).toBe(MAX_SAFE_BOLUS);
    expect(r.total).toBe(20);
    expect(r.flags).toContain('capped');
    // The uncapped arithmetic is still reported alongside it.
    expect(r.rawTotal).toBe(500);
    expect(r.mealBolus).toBe(500);
  });

  it('a requirement at the ceiling is NOT flagged', () => {
    const r = computeSmartBolus(inputs({ carbs: 200 })); // exactly 20 U
    expect(r.total).toBe(20);
    expect(r.flags).not.toContain('capped');
  });

  it('one tenth of a unit above the ceiling is flagged', () => {
    const r = computeSmartBolus(inputs({ carbs: 201 })); // 20.1 U
    expect(r.total).toBe(20);
    expect(r.rawTotal).toBe(20.1);
    expect(r.flags).toContain('capped');
  });

  it('the cap is applied after rounding, and rounding is unchanged', () => {
    const r = computeSmartBolus(inputs({ carbs: 63 })); // 6.3 U
    expect(r.total).toBe(6.3);
    expect(r.flags).not.toContain('capped');
  });
});
