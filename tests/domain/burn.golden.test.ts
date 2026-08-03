import { describe, expect, it } from 'vitest';

import { BURN_MET, burnMinutes, restingKcalPerMin } from '@/services/nutrition/burn';

/**
 * CHARACTERIZATION — `nutrition/burn`.
 *
 * "Walk 95 minutes to burn this plate" is a number a patient acts on, and it
 * used to be computed for a reference 40-year-old male scaled only by weight.
 * The MET is now multiplied by the patient's OWN resting metabolic rate, so
 * age, sex and height reach the answer.
 *
 * These tests pin the arithmetic and the DIRECTION of each input's effect.
 * They do not claim the MET table is right for any individual — it is a
 * population average, and the card says so.
 */

const man40 = { weightKg: 70, heightCm: 175, age: 40, sex: 'male' as const };

describe('restingKcalPerMin — the number everything turns on', () => {
  it('is Mifflin-St Jeor over the minutes in a day', () => {
    // 10×70 + 6.25×175 − 5×40 + 5 = 1598.75, which `computeBMR` rounds to
    // 1599 kcal/day as it always has — then /1440 minutes.
    expect(restingKcalPerMin(man40)).toBeCloseTo(1599 / 1440, 6);
    // ~1.11 kcal/min at rest, a shade under the 1.225 the flat 3.5 ml/kg/min
    // convention assumes for this patient. That gap is the correction.
    expect(restingKcalPerMin(man40)).toBeLessThan((3.5 * 70) / 200);
  });

  it('falls with age, which is the whole point', () => {
    const young = restingKcalPerMin({ ...man40, age: 25 })!;
    const old = restingKcalPerMin({ ...man40, age: 75 })!;
    expect(old).toBeLessThan(young);
  });

  it('is null when the profile cannot support the formula', () => {
    expect(restingKcalPerMin({})).toBeNull();
    expect(restingKcalPerMin({ weightKg: 70 })).toBeNull();
    expect(restingKcalPerMin({ weightKg: 70, heightCm: 175 })).toBeNull();
    expect(restingKcalPerMin({ weightKg: 0, heightCm: 175, age: 40 })).toBeNull();
    expect(restingKcalPerMin({ weightKg: 70, heightCm: 0, age: 40 })).toBeNull();
  });

  it("takes the lower constant for 'other' and for an absent sex", () => {
    const other = restingKcalPerMin({ ...man40, sex: 'other' })!;
    const female = restingKcalPerMin({ ...man40, sex: 'female' })!;
    const male = restingKcalPerMin({ ...man40, sex: 'male' })!;
    expect(other).toBe(female);
    expect(other).toBeLessThan(male);
    // Under-estimating rest means MORE minutes — the direction that does not
    // flatter the patient, which is the safe way to be wrong here.
  });
});

describe('burnMinutes — age reaches the card', () => {
  it('an older patient is told MORE minutes for the same plate', () => {
    const young = burnMinutes(600, { ...man40, age: 25 });
    const old = burnMinutes(600, { ...man40, age: 75 });
    expect(old.walk).toBeGreaterThan(young.walk);
    expect(old.run).toBeGreaterThan(young.run);
    expect(old.bike).toBeGreaterThan(young.bike);
    expect(old.swim).toBeGreaterThan(young.swim);
  });

  it('the age effect is visible, not cosmetic', () => {
    const at40 = burnMinutes(600, man40).walk;
    const at70 = burnMinutes(600, { ...man40, age: 70 }).walk;
    // −5 kcal/day per year over 30 years is ~9% of this patient's rest.
    expect(at70 / at40).toBeGreaterThan(1.05);
    expect(at70 / at40).toBeLessThan(1.2);
  });

  it('a heavier patient is still told FEWER minutes', () => {
    // The property the previous fix introduced, preserved by this one.
    const light = burnMinutes(600, { ...man40, weightKg: 60 });
    const heavy = burnMinutes(600, { ...man40, weightKg: 95 });
    expect(heavy.walk).toBeLessThan(light.walk);
  });

  it('a bigger plate is more minutes, monotonically', () => {
    let prev = 0;
    for (const cal of [100, 300, 600, 1200]) {
      const m = burnMinutes(cal, man40).walk;
      expect(m).toBeGreaterThan(prev);
      prev = m;
    }
  });

  it('running is always the shortest of the four — the METs say so', () => {
    const b = burnMinutes(600, man40);
    expect(BURN_MET.run).toBeGreaterThan(BURN_MET.bike);
    expect(b.run).toBeLessThanOrEqual(b.bike);
    expect(b.bike).toBeLessThanOrEqual(b.swim);
    expect(b.swim).toBeLessThanOrEqual(b.walk);
  });

  it('reports how personal the figure actually is', () => {
    expect(burnMinutes(600, man40).basis).toBe('rmr');
    expect(burnMinutes(600, { weightKg: 70 }).basis).toBe('weight');
    expect(burnMinutes(600, {}).basis).toBe('default');
  });

  it('falls back to the reference-man convention, unchanged, without a profile', () => {
    // kcal/min = MET × 3.5 × 70 / 200 — exactly what the screen did before.
    const expected = Math.max(1, Math.round(600 / ((BURN_MET.walk * 3.5 * 70) / 200)));
    expect(burnMinutes(600, {}).walk).toBe(expected);
    expect(burnMinutes(600, { weightKg: 70 }).walk).toBe(expected);
  });

  it('never says zero minutes — no plate is free', () => {
    for (const cal of [0, -50, 1, Number.NaN]) {
      const b = burnMinutes(cal, man40);
      expect(b.walk).toBeGreaterThanOrEqual(1);
      expect(b.run).toBeGreaterThanOrEqual(1);
    }
  });

  it('every figure is a finite whole number of minutes', () => {
    for (const p of [man40, { weightKg: 95 }, {}]) {
      const b = burnMinutes(742, p);
      for (const k of ['walk', 'run', 'bike', 'swim'] as const) {
        expect(Number.isInteger(b[k])).toBe(true);
        expect(Number.isFinite(b[k])).toBe(true);
      }
    }
  });
});
