import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  ageFrom,
  computeBMI,
  computeBMR,
  computeProgramTargets,
  mealCarbCap,
  splitCarbs,
  type ActivityLevel,
  type ProgramInput,
} from '@/services/programEngine';
import type { Profile } from '@/types';

/**
 * CHARACTERIZATION — `programEngine`.
 *
 * Records what the deterministic budget engine returns today. Nothing here
 * certifies nutritional appropriateness; the constants themselves are recorded
 * as needing specialist review (RC-5).
 *
 * `ageFrom()` and the goal projection read the wall clock, so every test in
 * this file freezes time. `tests/setup.ts` restores real timers afterwards.
 */

const FROZEN = new Date('2026-01-15T12:00:00.000Z');

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FROZEN);
});

afterEach(() => {
  vi.useRealTimers();
});

/** Profile with no insulin, so `insulinDosesWillChange` does not fire. */
function bodyProfile(overrides: Partial<Profile> = {}): Profile {
  return {
    user_id: 'u',
    name: 'T',
    diabetes_type: 'type2',
    insulin_types: [],
    language: 'fr',
    target_low: 70,
    target_high: 180,
    weight: 80,
    height: 175,
    gender: 'male',
    birth_date: '1985-06-15', // → age 40 at the frozen instant
    ...overrides,
  };
}

function input(overrides: Partial<ProgramInput> = {}): ProgramInput {
  return {
    profile: bodyProfile(),
    goal: 'lose',
    activityLevel: 'moderate',
    ratePerWeek: 0.5,
    ...overrides,
  };
}

describe('computeBMR — Mifflin-St Jeor', () => {
  it('male: 10W + 6.25H − 5A + 5', () => {
    expect(computeBMR({ weightKg: 80, heightCm: 175, age: 40, sex: 'male' })).toBe(1699);
  });

  it('female: 10W + 6.25H − 5A − 161', () => {
    expect(computeBMR({ weightKg: 80, heightCm: 175, age: 40, sex: 'female' })).toBe(1533);
  });

  it('the male/female branch differs by 166 kcal', () => {
    const m = computeBMR({ weightKg: 60, heightCm: 160, age: 45, sex: 'male' });
    const f = computeBMR({ weightKg: 60, heightCm: 160, age: 45, sex: 'female' });
    expect(m - f).toBe(166);
    expect(f).toBe(1214);
  });
});

describe('ageFrom', () => {
  it('derives age from an ISO birth date at the frozen instant', () => {
    expect(ageFrom('1985-06-15')).toBe(40);
    expect(ageFrom('1980-06-15')).toBe(45);
  });

  it('subtracts a year when the birthday has not yet occurred this year', () => {
    expect(ageFrom('1986-01-16')).toBe(39); // one day short
    expect(ageFrom('1986-01-15')).toBe(40); // exactly on the day
  });

  it('defaults to 35 when the date is absent or unparseable', () => {
    expect(ageFrom(undefined)).toBe(35);
    expect(ageFrom(null)).toBe(35);
    expect(ageFrom('')).toBe(35);
    expect(ageFrom('not-a-date')).toBe(35);
  });

  it('clamps to the 10–100 range', () => {
    expect(ageFrom('2025-01-01')).toBe(10); // ~1 year old → clamped up
    expect(ageFrom('1800-01-01')).toBe(100); // → clamped down
  });
});

describe('computeBMI', () => {
  it('returns weight / height² rounded to one decimal', () => {
    expect(computeBMI(80, 175)).toBe(26.1);
    expect(computeBMI(60, 160)).toBe(23.4);
  });

  it('returns null when either measurement is missing or zero', () => {
    expect(computeBMI(undefined, 175)).toBeNull();
    expect(computeBMI(80, undefined)).toBeNull();
    expect(computeBMI(0, 175)).toBeNull();
    expect(computeBMI(80, 0)).toBeNull();
  });
});

describe('computeProgramTargets — ordinary profile (80 kg, 175 cm, 40 y, male, moderate, lose 0.5)', () => {
  it('produces the full deterministic budget', () => {
    const t = computeProgramTargets(input());
    expect(t.bmr).toBe(1699);
    expect(t.tdee).toBe(2633);
    expect(t.dailyKcal).toBe(2083);
    expect(t.dailyDelta).toBe(-550);
    expect(t.proteinG).toBe(128);
    expect(t.fatG).toBe(65);
    expect(t.carbsG).toBe(247);
    expect(t.ratePerWeek).toBe(0.5);
    expect(t.bmi).toBe(26.1);
    expect(t.warnings).toEqual([]);
  });

  it('reconciles macros against the calorie target within rounding', () => {
    const t = computeProgramTargets(input());
    const derived = t.proteinG * 4 + t.fatG * 9 + t.carbsG * 4;
    expect(derived).toBe(2085); // vs dailyKcal 2083
    expect(Math.abs(derived - t.dailyKcal)).toBeLessThanOrEqual(3);
  });

  it('distributes carbs 25/35/30/10 with no slot above the cap, conserving the total', () => {
    const t = computeProgramTargets(input());
    expect(t.carbsPerMeal).toEqual({ breakfast: 62, lunch: 86, dinner: 74, snack: 25 });
    const sum =
      t.carbsPerMeal.breakfast + t.carbsPerMeal.lunch + t.carbsPerMeal.dinner + t.carbsPerMeal.snack;
    expect(sum).toBe(t.carbsG);
    expect(mealCarbCap(t.carbsG)).toBe(86);
  });

  it('distributes calories 25/35/30/10', () => {
    const t = computeProgramTargets(input());
    expect(t.kcalPerMeal).toEqual({ breakfast: 521, lunch: 729, dinner: 625, snack: 208 });
  });
});

describe('computeProgramTargets — activity factors', () => {
  const expected: [ActivityLevel, number][] = [
    ['sedentary', 2039],
    ['light', 2336],
    ['moderate', 2633],
    ['active', 2931],
    ['very_active', 3228],
  ];

  it.each(expected)('%s multiplies BMR 1699 to TDEE %i', (activityLevel, tdee) => {
    expect(computeProgramTargets(input({ activityLevel })).tdee).toBe(tdee);
  });

  /**
   * KNOWN-BAD BASELINE — P8-002
   * An unrecognised activity level yields `undefined` from the factor lookup,
   * so `bmr * undefined` is NaN and the whole budget becomes NaN with no
   * fallback and no error. Owning remediation: RU-4.
   */
  it('KNOWN-BAD BASELINE — P8-002: an unknown activity level produces a NaN budget', () => {
    const t = computeProgramTargets(
      input({ activityLevel: 'not-a-level' as unknown as ActivityLevel })
    );
    expect(Number.isNaN(t.tdee)).toBe(true);
    expect(Number.isNaN(t.dailyKcal)).toBe(true);
    expect(Number.isNaN(t.carbsG)).toBe(true);
  });
});

describe('computeProgramTargets — goals and pace', () => {
  it('stabilize applies no calorie delta', () => {
    const t = computeProgramTargets(input({ goal: 'stabilize' }));
    expect(t.dailyDelta).toBe(0);
    expect(t.dailyKcal).toBe(t.tdee);
    expect(t.ratePerWeek).toBe(0);
  });

  it('gain applies a positive delta', () => {
    const t = computeProgramTargets(input({ goal: 'gain', ratePerWeek: 0.5 }));
    expect(t.dailyDelta).toBe(550);
  });

  it('caps the requested pace at 1 kg per week and warns', () => {
    const t = computeProgramTargets(input({ ratePerWeek: 5 }));
    expect(t.ratePerWeek).toBe(1);
    expect(t.warnings).toContain('rateCapped');
  });

  it('treats a zero, negative or NaN pace as the 0.5 default', () => {
    expect(computeProgramTargets(input({ ratePerWeek: 0 })).ratePerWeek).toBe(0.5);
    expect(computeProgramTargets(input({ ratePerWeek: -2 })).ratePerWeek).toBe(1); // abs → 2 → capped
    expect(computeProgramTargets(input({ ratePerWeek: Number.NaN })).ratePerWeek).toBe(0.5);
    expect(computeProgramTargets(input({ ratePerWeek: null })).ratePerWeek).toBe(0.5);
  });

  it('sport with 4+ training days lifts the budget by 5 %', () => {
    const base = computeProgramTargets(input({ goal: 'sport', trainingDaysPerWeek: 3 }));
    const bumped = computeProgramTargets(input({ goal: 'sport', trainingDaysPerWeek: 4 }));
    expect(bumped.dailyKcal).toBe(Math.round(base.dailyKcal * 1.05));
  });

  it('projects weeks and a target date when a weight goal is set', () => {
    const t = computeProgramTargets(input({ targetWeight: 75, ratePerWeek: 0.5 }));
    expect(t.weeksToTarget).toBe(10); // 5 kg / 0.5
    expect(t.projectedDate).toBe('2026-03-26'); // frozen instant + 70 days
  });

  it('produces no projection without a target weight', () => {
    const t = computeProgramTargets(input());
    expect(t.weeksToTarget).toBeNull();
    expect(t.projectedDate).toBeNull();
  });

  it('warns when a loss goal is set on an already-low BMI', () => {
    const t = computeProgramTargets(input({ profile: bodyProfile({ weight: 55, height: 175 }) }));
    expect(t.bmi).toBeLessThan(20);
    expect(t.warnings).toContain('lowBmiLoss');
  });

  it('warns that doses will change when the patient uses insulin', () => {
    const t = computeProgramTargets(
      input({ profile: bodyProfile({ insulin_types: ['rapid'] }) })
    );
    expect(t.warnings).toContain('insulinDosesWillChange');
  });
});

describe('computeProgramTargets — floors and macro refit (60 kg female, sedentary, lose 1.0)', () => {
  const smallInput = input({
    profile: bodyProfile({
      weight: 60,
      height: 160,
      gender: 'female',
      birth_date: '1980-06-15', // age 45
    }),
    activityLevel: 'sedentary',
    ratePerWeek: 1,
  });

  it('floors calories at the female minimum and refits the macros beneath it', () => {
    const t = computeProgramTargets(smallInput);
    expect(t.bmr).toBe(1214);
    expect(t.tdee).toBe(1457);
    expect(t.dailyKcal).toBe(1200); // 357 raw → floored
    expect(t.warnings).toContain('kcalFloored');
    expect(t.warnings).toContain('carbsFloored');
    expect(t.proteinG).toBe(96);
    expect(t.fatG).toBe(37); // refit down from 48 to fit the floored carbs
    expect(t.carbsG).toBe(120); // raised to CARBS_FLOOR_G
  });

  it('keeps the refitted macros inside the floored budget', () => {
    const t = computeProgramTargets(smallInput);
    const derived = t.proteinG * 4 + t.fatG * 9 + t.carbsG * 4;
    expect(derived).toBe(1197);
    expect(derived).toBeLessThanOrEqual(t.dailyKcal);
  });

  it('applies the male floor of 1500 for a male profile', () => {
    const t = computeProgramTargets(
      input({
        profile: bodyProfile({ weight: 55, height: 160, gender: 'male' }),
        activityLevel: 'sedentary',
        ratePerWeek: 1,
      })
    );
    expect(t.dailyKcal).toBe(1500);
    expect(t.warnings).toContain('kcalFloored');
  });
});

describe('splitCarbs / mealCarbCap', () => {
  it('caps a meal at the greater of 75 g and 35 % of the day', () => {
    expect(mealCarbCap(100)).toBe(75); // 35 g < 75 floor
    expect(mealCarbCap(247)).toBe(86);
    expect(mealCarbCap(400)).toBe(140);
  });

  it('splits a floored 120 g day without hitting the cap', () => {
    expect(splitCarbs(120)).toEqual({ breakfast: 30, lunch: 42, dinner: 36, snack: 12 });
  });

  it('conserves the daily total for ordinary values', () => {
    for (const daily of [120, 180, 247, 300]) {
      const s = splitCarbs(daily);
      expect(s.breakfast + s.lunch + s.dinner + s.snack).toBe(daily);
    }
  });

  it('returns zeros for a zero-carb day', () => {
    expect(splitCarbs(0)).toEqual({ breakfast: 0, lunch: 0, dinner: 0, snack: 0 });
  });
});

describe('computeProgramTargets — missing and malformed body data', () => {
  it('substitutes 75 kg / 170 cm and warns when body data is absent', () => {
    const t = computeProgramTargets(
      input({ profile: bodyProfile({ weight: undefined, height: undefined }) })
    );
    expect(t.warnings).toContain('missingBodyData');
    expect(t.bmr).toBe(computeBMR({ weightKg: 75, heightCm: 170, age: 40, sex: 'male' }));
  });

  /**
   * KNOWN-BAD BASELINE — P8-001
   * `computeBMI` is called with the SUBSTITUTED placeholders, not the profile
   * values, so a patient with no body data is assigned a fabricated BMI of 26.0
   * that is indistinguishable in the returned object from a measured one.
   * `computeBMI` itself correctly returns null for absent input — the loss of
   * that signal happens at the call site (programEngine.ts:185).
   *
   * The consequence is clinical, not cosmetic: the `lowBmiLoss` guard is
   * evaluated against the placeholder, so an underweight patient with an
   * incomplete profile is NOT warned when setting a weight-loss goal.
   * Owning remediation: RU-3 (provenance) + RU-4.
   */
  it('KNOWN-BAD BASELINE — P8-001: absent body data yields a fabricated BMI, not null', () => {
    const noBody = bodyProfile({ weight: undefined, height: undefined });
    expect(computeBMI(noBody.weight, noBody.height)).toBeNull();

    const t = computeProgramTargets(input({ profile: noBody }));
    expect(t.bmi).toBe(26); // 75 / 1.70² — the placeholder body, reported as fact
  });

  it('KNOWN-BAD BASELINE — P8-001: the placeholder BMI suppresses the lowBmiLoss guard', () => {
    // A real 55 kg / 175 cm patient (BMI 18.0) IS warned.
    const measured = computeProgramTargets(
      input({ profile: bodyProfile({ weight: 55, height: 175 }) })
    );
    expect(measured.warnings).toContain('lowBmiLoss');

    // The same patient, before completing the profile, is NOT.
    const unmeasured = computeProgramTargets(
      input({ profile: bodyProfile({ weight: undefined, height: undefined }) })
    );
    expect(unmeasured.warnings).not.toContain('lowBmiLoss');
  });

  it('treats a zero weight as missing for the warning but uses 0 in the formula', () => {
    const t = computeProgramTargets(input({ profile: bodyProfile({ weight: 0 }) }));
    expect(t.warnings).toContain('missingBodyData');
    // `?? 75` does not replace 0, so the BMR is computed from a 0 kg body.
    expect(t.bmr).toBe(computeBMR({ weightKg: 0, heightCm: 175, age: 40, sex: 'male' }));
    expect(t.dailyKcal).toBe(1500); // rescued only by the calorie floor
  });

  /**
   * KNOWN-BAD BASELINE — P8-001
   * A negative weight is neither replaced (`??` only catches null/undefined)
   * nor flagged (`!(-80)` is false), so it flows into the formula and produces
   * a NEGATIVE protein target. No validation exists at UI, DB or engine.
   * Owning remediation: RU-4.
   */
  it('KNOWN-BAD BASELINE — P8-001: a negative weight yields a negative protein target and no warning', () => {
    const t = computeProgramTargets(input({ profile: bodyProfile({ weight: -80 }) }));
    expect(t.warnings).not.toContain('missingBodyData');
    expect(t.proteinG).toBe(-128);
  });

  /**
   * KNOWN-BAD BASELINE — P8-003
   * NaN body data propagates through every step, and because every comparison
   * against NaN is false the calorie floor never engages. The budget is NaN and
   * only the database CHECK (`daily_kcal > 0`) rejects it at insert time.
   * Owning remediation: RU-4.
   */
  it('KNOWN-BAD BASELINE — P8-003: NaN body data defeats the calorie floor', () => {
    const t = computeProgramTargets(input({ profile: bodyProfile({ weight: Number.NaN }) }));
    expect(Number.isNaN(t.bmr)).toBe(true);
    expect(Number.isNaN(t.dailyKcal)).toBe(true); // the 1500 floor did NOT apply
    expect(Number.isNaN(t.proteinG)).toBe(true);
    expect(Number.isNaN(t.carbsG)).toBe(true);
  });

  it('Infinity body data also propagates', () => {
    const t = computeProgramTargets(
      input({ profile: bodyProfile({ weight: Number.POSITIVE_INFINITY }) })
    );
    expect(t.bmr).toBe(Number.POSITIVE_INFINITY);
    expect(t.dailyKcal).toBe(Number.POSITIVE_INFINITY);
  });

  it('an extremely large but finite weight produces an unbounded budget (no ceiling exists)', () => {
    const t = computeProgramTargets(input({ profile: bodyProfile({ weight: 100000 }) }));
    expect(t.dailyKcal).toBeGreaterThan(1_000_000);
  });

  /**
   * KNOWN-BAD BASELINE — P8-001
   * The sex branch is `gender === 'female' ? 'female' : 'male'`, so 'other' and
   * an absent gender both take the male formula — a 166 kcal difference the
   * patient never chose. Owning remediation: RU-11 (policy) then RU-4.
   */
  it("KNOWN-BAD BASELINE — P8-001: gender 'other' and undefined both take the male branch", () => {
    const male = computeProgramTargets(input({ profile: bodyProfile({ gender: 'male' }) }));
    const other = computeProgramTargets(input({ profile: bodyProfile({ gender: 'other' }) }));
    const none = computeProgramTargets(input({ profile: bodyProfile({ gender: undefined }) }));
    expect(other.bmr).toBe(male.bmr);
    expect(none.bmr).toBe(male.bmr);
  });

  it('falls back to the default body and age when there is no profile at all', () => {
    const t = computeProgramTargets(input({ profile: null }));
    expect(t.warnings).toContain('missingBodyData');
    expect(t.bmr).toBe(computeBMR({ weightKg: 75, heightCm: 170, age: 35, sex: 'male' }));
  });
});
