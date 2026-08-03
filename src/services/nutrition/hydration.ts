/**
 * HOW MUCH WATER TO DRINK FOR **THIS** MEAL — and how that becomes glasses.
 *
 * The hydration card used to show one number: a weight-based daily goal, with a
 * ring for the meal's own water content. It never answered the question a
 * patient actually asks, which is "so how much should I drink, now?".
 *
 * THE CHAIN, and every link is an estimate that says so:
 *
 *   1. DAILY NEED — ml per kg of body weight, by age. 35 ml/kg is the standard
 *      adult figure; it falls to 30 and then 25 in later life, because total
 *      body water and renal concentrating ability both decline. Children need
 *      more per kg. These are the bands used in clinical practice (ESPEN /
 *      Volkert). This is TOTAL water, from food and drink together.
 *
 *   2. THIS MEAL'S SHARE — apportioned by energy: a meal that is a fifth of the
 *      day's calories carries a fifth of the day's water. More food means more
 *      solute to excrete and more metabolic water to move, which is the same
 *      reasoning behind the classic "1 ml per kcal" rule; going through the
 *      patient's OWN daily need instead keeps their body and age in the answer.
 *
 *   3. WHAT THE FOOD ALREADY GIVES — `estimateMealWaterMl`, from each food's
 *      category water fraction. Roughly a fifth of daily water intake comes
 *      from food, and a soup is not a biscuit; subtracting it is the difference
 *      between a real answer and a slogan.
 *
 *   4. THE REMAINDER IS WHAT TO DRINK, expressed in glasses — whole ones, plus
 *      the FRACTION of the last, because "2.3 glasses" is a number and two
 *      glasses beside a third filled a third of the way is an instruction.
 *
 * WHAT THIS IS NOT: a prescription. It ignores climate, exercise, fever,
 * diuretics, and — importantly for this app — any fluid restriction a
 * nephrologist may have set. The card says so; this module refuses to pretend
 * otherwise by returning `basis`, which tells the UI whether the figure came
 * from the patient's own body data or from population defaults.
 */
import type { FoodItemResult } from '@/types';

import { estimateMealWaterMl } from './micros';

/** A standard drinking glass. Every figure the card shows is built on this. */
export const GLASS_ML = 250;

/** Age assumed when the profile has no birth date. */
const DEFAULT_AGE = 35;
/** The familiar "two litres", used when there is no weight to scale from. */
const DEFAULT_DAILY_ML = 2000;
/** Daily energy assumed when the patient has no computed goal. */
const DEFAULT_DAILY_KCAL = 2000;

/** Total daily water is held between these, whatever the arithmetic says. */
const MIN_DAILY_ML = 1500;
const MAX_DAILY_ML = 4000;

/**
 * No single meal is allowed to claim more than this share of the day's water,
 * however many calories it carries.
 *
 * This is a GUARD RAIL, not physiology. Energy-proportional apportioning is
 * reasonable across ordinary meals and absurd at the extremes: a 5 000 kcal
 * plate would otherwise demand three times the day's fluid in one sitting, and
 * telling a diabetic patient to drink six litres after dinner is a harm this
 * module will not do arithmetic its way into.
 */
const MAX_MEAL_SHARE = 0.5;

/**
 * Millilitres of water per kg of body weight per day, by age.
 *
 * The decline with age is real and clinically recognised: less total body
 * water, a blunted thirst response, and kidneys that concentrate urine less
 * well. Using the flat adult 35 ml/kg for an 80-year-old overstates their
 * target by a third.
 */
export function mlPerKgForAge(age: number): number {
  if (age < 18) return 40;
  if (age <= 55) return 35;
  if (age <= 65) return 30;
  return 25;
}

/**
 * Total daily water need in ml — food and drink together.
 *
 * Rounded to 50 ml because the inputs do not support finer, and clamped: the
 * floor protects a very light or very old patient from a target below what
 * anyone should drink, the ceiling protects a heavy one from a number that
 * reads as a challenge.
 */
export function dailyWaterNeedMl(weightKg?: number, age?: number): number {
  const years = age && age > 0 ? age : DEFAULT_AGE;
  // Without a weight there is nothing to scale, so the familiar two litres
  // stands — inventing a body to scale from would be worse than the round
  // number, and `basis` tells the card to say the figure is not personal.
  // A negative or NaN weight is not data either, and takes the same path;
  // the previous version multiplied it and clamped the result up to 1500.
  const raw =
    weightKg && weightKg > 0 ? weightKg * mlPerKgForAge(years) : DEFAULT_DAILY_ML;
  const clamped = Math.max(MIN_DAILY_ML, Math.min(MAX_DAILY_ML, raw));
  return Math.round(clamped / 50) * 50;
}

/** How the glasses should be drawn. */
export interface GlassPlan {
  /** Size of one glass, ml. Shown on the card so the count means something. */
  glassMl: number;
  /** Glasses to fill completely. */
  full: number;
  /**
   * How much of the NEXT glass to fill, 0..1. Zero when the remainder lands on
   * a whole glass. This is the partial fill the patient asked for: a little
   * left to drink must look like a little, not like another whole glass.
   */
  partial: number;
  /** Glasses to draw in total — `full`, plus one more when `partial` > 0. */
  total: number;
}

export interface HydrationPlan {
  /** Total daily water need (food + drink), ml. */
  dailyNeedMl: number;
  /** This meal's share of that need, by energy. */
  mealNeedMl: number;
  /** Water the meal's own foods supply. */
  fromFoodMl: number;
  /** What is left to actually DRINK for this meal, ml. Never negative. */
  toDrinkMl: number;
  /** True when the food alone covers this meal's share. */
  coveredByFood: boolean;
  /** Share of this meal's need already met by the food, 0..100. */
  fromFoodPct: number;
  glasses: GlassPlan;
  /** Whether the numbers came from the patient's own body data. */
  basis: 'profile' | 'default';
}

/**
 * Turn a remainder in ml into glasses, whole and partial.
 *
 * The partial is deliberately NOT rounded up to a whole glass. 60 ml left is
 * a quarter of a glass, and drawing it as a full one would quietly add 190 ml
 * to what the patient was told to drink.
 */
export function glassesFor(toDrinkMl: number, glassMl: number = GLASS_ML): GlassPlan {
  const size = glassMl > 0 ? glassMl : GLASS_ML;
  const ml = Math.max(0, toDrinkMl);
  const exact = ml / size;
  const full = Math.floor(exact);
  // Rounded to 2dp so a float artefact cannot draw a sliver of a glass that
  // is really full — 0.9999999 must be a whole glass, not a full plus a wisp.
  const partial = Math.round((exact - full) * 100) / 100;
  return {
    glassMl: size,
    full: partial >= 1 ? full + 1 : full,
    partial: partial >= 1 ? 0 : partial,
    total: partial > 0 && partial < 1 ? full + 1 : full,
  };
}

/**
 * The whole answer for one plate.
 *
 * `dailyKcalGoal` is the patient's own daily energy target when the app has
 * computed one; the population default is used otherwise and reported through
 * `basis` so the card can say the figure is not personalised.
 */
export function hydrationForMeal(args: {
  items: FoodItemResult[];
  mealKcal: number;
  weightKg?: number;
  age?: number;
  dailyKcalGoal?: number;
  glassMl?: number;
}): HydrationPlan {
  const { items, mealKcal, weightKg, age, dailyKcalGoal, glassMl = GLASS_ML } = args;

  const dailyNeedMl = dailyWaterNeedMl(weightKg, age);
  const dailyKcal = dailyKcalGoal && dailyKcalGoal > 0 ? dailyKcalGoal : DEFAULT_DAILY_KCAL;

  // A meal with no usable energy figure gets no share — better a card that
  // says nothing than one that invents a litre from a zero.
  const kcal = Number.isFinite(mealKcal) && mealKcal > 0 ? mealKcal : 0;
  const rawShare = dailyNeedMl * (kcal / dailyKcal);
  // The cap is applied AFTER rounding, and floored to the 10 ml grid itself.
  // Rounding a capped 1225 up to 1230 put the answer back over the limit — a
  // small number, but a guard rail that rounds its way past itself is not one.
  const capMl = Math.floor((dailyNeedMl * MAX_MEAL_SHARE) / 10) * 10;
  const mealNeedMl = Math.min(Math.round(rawShare / 10) * 10, capMl);

  const fromFoodMl = estimateMealWaterMl(items);
  const toDrinkMl = Math.max(0, Math.round((mealNeedMl - fromFoodMl) / 10) * 10);

  return {
    dailyNeedMl,
    mealNeedMl,
    fromFoodMl,
    toDrinkMl,
    coveredByFood: mealNeedMl > 0 && toDrinkMl === 0,
    fromFoodPct:
      mealNeedMl > 0 ? Math.min(100, Math.round((fromFoodMl / mealNeedMl) * 100)) : 0,
    glasses: glassesFor(toDrinkMl, glassMl),
    basis: weightKg && weightKg > 0 && age && age > 0 ? 'profile' : 'default',
  };
}
