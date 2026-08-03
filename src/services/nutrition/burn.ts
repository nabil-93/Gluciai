/**
 * "TO BURN THIS PLATE" — minutes of activity, for THIS patient.
 *
 * WHAT WAS WRONG. The card ran `kcal/min = MET × 3.5 × kg / 200`, the textbook
 * conversion from a metabolic equivalent to an energy cost. That 3.5 is not a
 * constant of nature: it is the resting oxygen uptake, in ml/kg/min, of a
 * reference 40-year-old male. Every patient was costed as that man, scaled only
 * by weight. So a 70-year-old and a 25-year-old of the same mass were told the
 * same number of minutes, when the older patient's resting metabolism — and
 * therefore the energy each MET represents — is measurably lower.
 *
 * WHAT IT DOES NOW. A MET is a multiple of RESTING metabolic rate, so the
 * honest move is to use the patient's own resting rate instead of the reference
 * man's. Mifflin-St Jeor already lives in this codebase (`computeBMR`) and
 * takes age, sex, height and weight; dividing it by 1440 gives kcal per minute
 * at rest, and the activity costs `MET ×` that.
 *
 *     kcal/min = MET × BMR / 1440
 *
 * Age enters exactly once, where it belongs, at −5 kcal/day per year of age.
 * For a 70 kg 175 cm man that is about 10% more minutes at 70 than at 40 —
 * visible, and in the right direction.
 *
 * When height or sex is missing the old convention is used unchanged, and
 * `basis` says which one answered, so the card can keep telling the truth about
 * how personal the figure is.
 *
 * STILL AN ESTIMATE. MET tables are population averages at one assumed
 * intensity; they ignore fitness and terrain, and the "calories burned" framing
 * ignores that some of that energy would have been spent at rest anyway. It is
 * a motivational comparison, not a prescription.
 */
import { computeBMR } from '@/services/programEngine';

/** Metabolic equivalents, from the Compendium of Physical Activities. */
export const BURN_MET = {
  /** Walking, brisk, firm surface (~5.5 km/h). */
  walk: 4.3,
  /** Running (~8 km/h). */
  run: 8.3,
  /** Bicycling, general leisure. */
  bike: 7.5,
  /** Swimming, leisurely — not lap training. */
  swim: 6.0,
} as const;

export type BurnActivity = keyof typeof BURN_MET;

/** Weight assumed when the profile has none. Named so the UI can say so. */
export const BURN_DEFAULT_KG = 70;

/** Minutes per activity, plus how personal the figure actually is. */
export interface BurnEstimate {
  walk: number;
  run: number;
  bike: number;
  swim: number;
  /**
   * `rmr`   — costed from this patient's own resting metabolism (age, sex,
   *           height, weight all used).
   * `weight`— only their weight was known; the reference-man 3.5 convention
   *           carried the rest.
   * `default` — nothing was known; a 70 kg adult was assumed.
   */
  basis: 'rmr' | 'weight' | 'default';
}

/**
 * Resting energy expenditure in kcal per MINUTE, or `null` when the profile
 * cannot support Mifflin-St Jeor. Exported because it is the number the whole
 * estimate turns on, and a number that matters is a number worth testing.
 */
export function restingKcalPerMin(p: {
  weightKg?: number;
  heightCm?: number;
  age?: number;
  sex?: 'male' | 'female' | 'other';
}): number | null {
  const { weightKg, heightCm, age } = p;
  if (!weightKg || weightKg <= 0) return null;
  if (!heightCm || heightCm <= 0) return null;
  if (!age || age <= 0) return null;
  // Mifflin-St Jeor is defined for male and female; 'other' and absent both
  // take the female constant, which is the LOWER of the two. An underestimated
  // resting rate reports MORE minutes — the direction that does not flatter.
  const sex: 'male' | 'female' = p.sex === 'male' ? 'male' : 'female';
  const bmr = computeBMR({ weightKg, heightCm, age, sex });
  if (!Number.isFinite(bmr) || bmr <= 0) return null;
  return bmr / 1440;
}

/**
 * Minutes of each activity needed to burn `cal` kcal.
 *
 * Always at least one minute: a plate that rounds to zero minutes of running
 * reads as "this was free", which no food is.
 */
export function burnMinutes(
  cal: number,
  p: {
    weightKg?: number;
    heightCm?: number;
    age?: number;
    sex?: 'male' | 'female' | 'other';
  } = {}
): BurnEstimate {
  const kcal = Number.isFinite(cal) && cal > 0 ? cal : 0;
  const rmr = restingKcalPerMin(p);

  // Fall back to the reference-man convention, exactly as before, when the
  // profile cannot support the personal one.
  const kg = p.weightKg && p.weightKg > 0 ? p.weightKg : BURN_DEFAULT_KG;
  const perMin = (met: number) => (rmr !== null ? met * rmr : (met * 3.5 * kg) / 200);
  const minutes = (met: number) => Math.max(1, Math.round(kcal / perMin(met)));

  return {
    walk: minutes(BURN_MET.walk),
    run: minutes(BURN_MET.run),
    bike: minutes(BURN_MET.bike),
    swim: minutes(BURN_MET.swim),
    basis: rmr !== null ? 'rmr' : p.weightKg && p.weightKg > 0 ? 'weight' : 'default',
  };
}
