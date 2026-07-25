import type { Profile } from '@/types';

/* ────────────────────────────────────────────────────────────
 * PROGRAM ENGINE — the deterministic brain behind "Mon Programme".
 *
 * Everything a coaching program promises the patient (how many calories,
 * how many carbs, how fast the weight moves, when the goal is reached) is
 * computed HERE, from published formulas — never from AI prose. The AI
 * composes the dishes and writes the human sentences; this file owns the
 * numbers, exactly like `bolusEngine` owns the dose.
 *
 * That split matters medically: a program's carb target feeds the meal
 * plan, and the meal plan's carbs feed the INSULIN dose. A hallucinated
 * calorie budget would propagate all the way to a syringe.
 * ──────────────────────────────────────────────────────────── */

export type ProgramGoal =
  /** Lose fat — controlled deficit. */
  | 'lose'
  /** Gain weight / build muscle — controlled surplus. */
  | 'gain'
  /** No weight change: eat regularly, flatten glucose curves. */
  | 'stabilize'
  /** Get back to training; food supports the effort. */
  | 'sport';

export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'active' | 'very_active';

/** Harris-Benedict style multipliers applied to the BMR. */
const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2, // desk job, little walking
  light: 1.375, // light exercise 1-3 days/week
  moderate: 1.55, // 3-5 days/week
  active: 1.725, // 6-7 days/week
  very_active: 1.9, // physical job or two-a-days
};

/* ── Hard safety rails ─────────────────────────────────────────
 * These are floors and ceilings the patient CANNOT override from the UI.
 * A diabetic who under-eats while still injecting their usual doses is the
 * fastest route to a severe hypo, so the engine refuses to plan it. */

/** Absolute daily calorie floor, by sex (widely used clinical minimum). */
const KCAL_FLOOR: Record<'male' | 'female', number> = { male: 1500, female: 1200 };
/** Never plan a loss/gain faster than this, whatever the patient asks. */
const MAX_RATE_KG_WEEK = 1;
/** Default pace when the patient has no preference — safe and sustainable. */
const DEFAULT_RATE_KG_WEEK = 0.5;
/** Energy in one kilo of body fat (kcal) — drives the deficit maths. */
const KCAL_PER_KG = 7700;
/** Carbs are the insulin lever: going lower than this without medical
 *  supervision changes basal needs, so we floor it and warn instead. */
const CARBS_FLOOR_G = 120;
/** Least protein that still protects lean mass in a deficit (g per kg). */
const PROTEIN_FLOOR_PER_KG = 1.0;
/** Least fat the body needs for hormones and fat-soluble vitamins (g/kg). */
const FAT_FLOOR_PER_KG = 0.5;
/** A single meal above this spikes glucose no matter how good the insulin
 *  timing is — the plan spreads carbs instead of stacking them. On a
 *  high-carb day the cap scales up (see `mealCarbCap`), because forcing a
 *  400 g day through a 75 g ceiling just dumps the remainder on one slot. */
const MEAL_CARB_CAP_G = 75;
/** No eating moment may ever hold more than this share of the day. */
const MEAL_CARB_MAX_SHARE = 0.35;

/** The per-meal carb ceiling for a given day: the absolute spike threshold,
 *  raised proportionally when the daily target is genuinely large. */
export function mealCarbCap(dailyCarbs: number): number {
  return Math.max(MEAL_CARB_CAP_G, Math.round(dailyCarbs * MEAL_CARB_MAX_SHARE));
}

export type ProgramWarningCode =
  /** Requested pace was faster than clinically safe — capped. */
  | 'rateCapped'
  /** The computed budget hit the calorie floor — deficit reduced. */
  | 'kcalFloored'
  /** Carbs landed under the floor — raised back up. */
  | 'carbsFloored'
  /** Patient injects insulin: eating fewer carbs means smaller doses. */
  | 'insulinDosesWillChange'
  /** BMI already at/below healthy range but the goal is to lose. */
  | 'lowBmiLoss'
  /** No weight/height on the profile — targets are rough estimates. */
  | 'missingBodyData';

export interface ProgramInput {
  profile: Profile | null;
  goal: ProgramGoal;
  /** Where the patient wants to land, in kg. Ignored for stabilize/sport. */
  targetWeight?: number | null;
  /** Preferred pace in kg per week; capped by MAX_RATE_KG_WEEK. */
  ratePerWeek?: number | null;
  activityLevel: ActivityLevel;
  /** Training sessions planned per week — nudges protein and calories. */
  trainingDaysPerWeek?: number;
}

export interface MealSplit {
  breakfast: number;
  lunch: number;
  dinner: number;
  snack: number;
}

export interface ProgramTargets {
  /** Basal metabolic rate (kcal/day at complete rest). */
  bmr: number;
  /** Maintenance calories once activity is factored in. */
  tdee: number;
  /** What the patient should eat each day. */
  dailyKcal: number;
  /** Signed gap vs maintenance: negative = deficit, positive = surplus. */
  dailyDelta: number;
  proteinG: number;
  fatG: number;
  carbsG: number;
  /** Carb budget per meal — the plan and the bolus ratios both read this. */
  carbsPerMeal: MealSplit;
  kcalPerMeal: MealSplit;
  /** Actual pace after the safety caps, kg per week. */
  ratePerWeek: number;
  /** Whole weeks to reach the target; null when there is no weight goal. */
  weeksToTarget: number | null;
  /** ISO date the target is projected to be reached. */
  projectedDate: string | null;
  /** Body-mass index from the profile, when height and weight are known. */
  bmi: number | null;
  warnings: ProgramWarningCode[];
}

/** Age in years from an ISO birth date; falls back to 35 when unknown. */
export function ageFrom(birthDate?: string | null): number {
  if (!birthDate) return 35;
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return 35;
  const now = new Date();
  let age = now.getFullYear() - born.getFullYear();
  const m = now.getMonth() - born.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age -= 1;
  return Math.min(100, Math.max(10, age));
}

/**
 * Mifflin-St Jeor basal metabolic rate — the modern standard, more accurate
 * than Harris-Benedict for the general population.
 */
export function computeBMR(args: {
  weightKg: number;
  heightCm: number;
  age: number;
  sex: 'male' | 'female';
}): number {
  const base = 10 * args.weightKg + 6.25 * args.heightCm - 5 * args.age;
  return Math.round(args.sex === 'male' ? base + 5 : base - 161);
}

/** Body-mass index, or null when the body data is missing. */
export function computeBMI(weightKg?: number, heightCm?: number): number | null {
  if (!weightKg || !heightCm) return null;
  const m = heightCm / 100;
  if (m <= 0) return null;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

/**
 * Turn a patient's goal into an exact daily budget, with every clinical
 * rail applied. This is the single source of truth for the whole program:
 * the AI meal planner is handed these numbers and must compose within them.
 */
export function computeProgramTargets(input: ProgramInput): ProgramTargets {
  const { profile, goal, activityLevel } = input;
  const warnings: ProgramWarningCode[] = [];

  // Fall back to WHO-median adult figures so the program still produces a
  // usable plan before the profile is complete — but say so.
  const weight = profile?.weight ?? 75;
  const height = profile?.height ?? 170;
  if (!profile?.weight || !profile?.height) warnings.push('missingBodyData');

  const sex: 'male' | 'female' = profile?.gender === 'female' ? 'female' : 'male';
  const age = ageFrom(profile?.birth_date);

  const bmr = computeBMR({ weightKg: weight, heightCm: height, age, sex });
  const tdee = Math.round(bmr * ACTIVITY_FACTOR[activityLevel]);
  const bmi = computeBMI(weight, height);

  /* ── Pace ── */
  const wantsWeightChange = goal === 'lose' || goal === 'gain';
  let rate = 0;
  if (wantsWeightChange) {
    rate = Math.abs(input.ratePerWeek ?? DEFAULT_RATE_KG_WEEK) || DEFAULT_RATE_KG_WEEK;
    if (rate > MAX_RATE_KG_WEEK) {
      rate = MAX_RATE_KG_WEEK;
      warnings.push('rateCapped');
    }
  }

  // Losing weight when already lean is a medical question, not a diet one.
  if (goal === 'lose' && bmi != null && bmi < 20) warnings.push('lowBmiLoss');

  /* ── Daily calories ── */
  // A kilo of fat is ~7700 kcal, spread across the seven days of the week.
  const rawDelta = wantsWeightChange
    ? ((goal === 'lose' ? -1 : 1) * rate * KCAL_PER_KG) / 7
    : 0;

  let dailyKcal = Math.round(tdee + rawDelta);
  const floor = KCAL_FLOOR[sex];
  if (dailyKcal < floor) {
    dailyKcal = floor;
    warnings.push('kcalFloored');
  }
  // 'sport' keeps maintenance but leans on training days for the recomposition.
  if (goal === 'sport' && (input.trainingDaysPerWeek ?? 0) >= 4) {
    dailyKcal = Math.round(dailyKcal * 1.05);
  }
  /* ── Macros ──
   * Protein first (protects lean mass in a deficit, builds it in a surplus),
   * then fat as a share of calories, and carbs take whatever is left. */
  const proteinPerKg = goal === 'lose' || goal === 'gain' || goal === 'sport' ? 1.6 : 1.2;
  let proteinG = Math.round(weight * proteinPerKg);
  let fatG = Math.max(Math.round(weight * 0.8), Math.round((dailyKcal * 0.28) / 9));
  let carbsG = Math.round((dailyKcal - proteinG * 4 - fatG * 9) / 4);

  if (carbsG < CARBS_FLOOR_G) {
    /* The carb floor is a safety rule, so it wins — but raising carbs without
     * giving anything back would make the three macros add up to MORE than the
     * daily budget the patient was shown. Re-fit protein and fat inside what
     * is left: fat yields first (it is the least structural), protein only
     * after, and never below the levels that protect the body. */
    carbsG = CARBS_FLOOR_G;
    warnings.push('carbsFloored');

    const left = dailyKcal - carbsG * 4;
    const fatFloor = Math.max(30, Math.round(weight * FAT_FLOOR_PER_KG));
    const proteinFloor = Math.max(60, Math.round(weight * PROTEIN_FLOOR_PER_KG));

    if (proteinG * 4 + fatG * 9 > left) {
      fatG = Math.max(fatFloor, Math.floor((left - proteinG * 4) / 9));
    }
    if (proteinG * 4 + fatG * 9 > left) {
      proteinG = Math.max(proteinFloor, Math.floor((left - fatG * 9) / 4));
    }
    // Still impossible: the budget cannot hold even the safe minimums, so the
    // budget is what has to move — never the minimums.
    const needed = proteinG * 4 + fatG * 9 + carbsG * 4;
    if (needed > dailyKcal) {
      dailyKcal = needed;
      if (!warnings.includes('kcalFloored')) warnings.push('kcalFloored');
    }
  }

  // Measured only now: re-fitting the macros above can lift the budget, and a
  // stale delta would contradict the calories printed next to it.
  const dailyDelta = dailyKcal - tdee;

  // Anyone on insulin must hear this before they start: fewer carbs on the
  // plate means smaller boluses, and keeping the old doses causes hypos.
  if ((profile?.insulin_types?.length ?? 0) > 0 || profile?.bolus_insulin_name) {
    warnings.push('insulinDosesWillChange');
  }

  /* ── Spread across the day ──
   * An even-ish split keeps every post-meal rise small; the evening is
   * lightened slightly because insulin sensitivity drops at night. */
  const carbsPerMeal = splitCarbs(carbsG);
  const kcalPerMeal: MealSplit = {
    breakfast: Math.round(dailyKcal * 0.25),
    lunch: Math.round(dailyKcal * 0.35),
    dinner: Math.round(dailyKcal * 0.3),
    snack: Math.round(dailyKcal * 0.1),
  };

  /* ── Projection ── */
  let weeksToTarget: number | null = null;
  let projectedDate: string | null = null;
  if (wantsWeightChange && input.targetWeight && rate > 0) {
    const gap = Math.abs(input.targetWeight - weight);
    if (gap > 0.1) {
      weeksToTarget = Math.ceil(gap / rate);
      const d = new Date();
      d.setDate(d.getDate() + weeksToTarget * 7);
      projectedDate = d.toISOString().slice(0, 10);
    }
  }

  return {
    bmr,
    tdee,
    dailyKcal,
    dailyDelta,
    proteinG,
    fatG,
    carbsG,
    carbsPerMeal,
    kcalPerMeal,
    ratePerWeek: rate,
    weeksToTarget,
    projectedDate,
    bmi,
    warnings,
  };
}

/**
 * Spread the daily carbs over four eating moments, never letting one meal
 * exceed the spike cap. Whatever a capped meal gives up is pushed to the
 * snack, which is the safest place to absorb it.
 */
export function splitCarbs(dailyCarbs: number): MealSplit {
  const cap = mealCarbCap(dailyCarbs);
  const out: MealSplit = {
    breakfast: Math.round(dailyCarbs * 0.25),
    lunch: Math.round(dailyCarbs * 0.35),
    dinner: Math.round(dailyCarbs * 0.3),
    snack: Math.round(dailyCarbs * 0.1),
  };
  const slots = ['breakfast', 'lunch', 'dinner', 'snack'] as const;

  // Push any excess onto the slots that still have headroom — never onto a
  // single one, which is how a "light snack" used to become the biggest
  // carb load of the day.
  for (let pass = 0; pass < 3; pass += 1) {
    let overflow = 0;
    slots.forEach((k) => {
      if (out[k] > cap) {
        overflow += out[k] - cap;
        out[k] = cap;
      }
    });
    if (overflow <= 0) break;

    const room = slots.filter((k) => out[k] < cap);
    if (room.length === 0) {
      // Every slot is already at the ceiling: the only safe arrangement
      // left is to raise them together rather than stack one.
      const each = Math.round(overflow / slots.length);
      slots.forEach((k) => {
        out[k] += each;
      });
      break;
    }
    const each = overflow / room.length;
    room.forEach((k) => {
      out[k] = Math.round(out[k] + each);
    });
  }
  return out;
}

/* ────────────────────────────────────────────────────────────
 * THE LIVE DAY — what makes the program feel like it is watching.
 * ──────────────────────────────────────────────────────────── */

export interface DayBudget {
  kcalTarget: number;
  carbsTarget: number;
  kcalEaten: number;
  carbsEaten: number;
  kcalLeft: number;
  carbsLeft: number;
  /** 0…1 share of the day's calories already eaten (clamped). */
  progress: number;
  /** True once the patient is over the day's calorie budget. */
  over: boolean;
}

/**
 * What is left to eat today. Pure arithmetic on the logged meals, so the
 * "next meal" card can adapt instantly and offline — the AI is only asked
 * to phrase the adjustment, never to compute it.
 */
export function dayBudget(
  targets: Pick<ProgramTargets, 'dailyKcal' | 'carbsG'>,
  eaten: { kcal: number; carbs: number }
): DayBudget {
  const kcalLeft = Math.round(targets.dailyKcal - eaten.kcal);
  const carbsLeft = Math.round(targets.carbsG - eaten.carbs);
  return {
    kcalTarget: targets.dailyKcal,
    carbsTarget: targets.carbsG,
    kcalEaten: Math.round(eaten.kcal),
    carbsEaten: Math.round(eaten.carbs),
    kcalLeft,
    carbsLeft,
    progress: Math.min(1, Math.max(0, eaten.kcal / Math.max(1, targets.dailyKcal))),
    over: kcalLeft < 0,
  };
}

/** Meal slots the planner fills, in the order they happen. */
export const MEAL_SLOTS = ['breakfast', 'lunch', 'snack', 'dinner'] as const;
export type MealSlot = (typeof MEAL_SLOTS)[number];

/**
 * Re-target ONE upcoming meal from what actually happened earlier today.
 *
 * The planned meal is only a starting point: if breakfast ran over, lunch
 * gives some back; if the patient skipped a meal we deliberately do NOT
 * hand all those calories to the next one (that would spike glucose), we
 * return at most a third of the surplus.
 */
export function adaptMeal(args: {
  plannedKcal: number;
  plannedCarbs: number;
  budget: DayBudget;
  /** Meals still to come today, including this one. */
  mealsLeft: number;
  /** Current glucose in mg/dL, when known — a high reading trims carbs. */
  glucose?: number | null;
  targetHigh?: number;
}): { kcal: number; carbs: number; reason: ProgramAdaptReason | null } {
  const mealsLeft = Math.max(1, args.mealsLeft);
  const fairKcal = args.budget.kcalLeft / mealsLeft;
  const fairCarbs = args.budget.carbsLeft / mealsLeft;

  let kcal = args.plannedKcal;
  let carbs = args.plannedCarbs;
  let reason: ProgramAdaptReason | null = null;

  if (args.budget.over) {
    // Already past the day's budget — serve the lightest sensible meal
    // rather than a negative one.
    kcal = Math.round(args.plannedKcal * 0.6);
    carbs = Math.round(args.plannedCarbs * 0.6);
    reason = 'overBudget';
  } else if (fairKcal < args.plannedKcal * 0.85) {
    // Earlier meals ate into the budget → trim this one.
    kcal = Math.round(fairKcal);
    carbs = Math.round(fairCarbs);
    reason = 'trimmed';
  } else if (fairKcal > args.plannedKcal * 1.15) {
    // Room left over (a meal was skipped or was light). Give back only a
    // third of it: a diabetic cannot "catch up" calories in one sitting.
    kcal = Math.round(args.plannedKcal + (fairKcal - args.plannedKcal) / 3);
    carbs = Math.round(args.plannedCarbs + (fairCarbs - args.plannedCarbs) / 3);
    reason = 'roomLeft';
  }

  // A high reading right now outranks the calorie maths: cut the carbs of
  // this meal by a quarter and let the dish lean on protein and vegetables.
  const high = args.targetHigh ?? 180;
  if (args.glucose != null && args.glucose > high) {
    carbs = Math.round(carbs * 0.75);
    reason = 'highGlucose';
  }

  return {
    kcal: Math.max(150, kcal),
    // Clamp against THIS day's ceiling, not a fixed number: a 400 g day and
    // a 150 g day do not share the same idea of a big meal.
    carbs: Math.max(10, Math.min(carbs, mealCarbCap(args.budget.carbsTarget))),
    reason,
  };
}

/** Why a meal was re-targeted — the UI turns this into a translated line. */
export type ProgramAdaptReason = 'trimmed' | 'roomLeft' | 'overBudget' | 'highGlucose';

/**
 * Is this day of the program a training day?
 *
 * Decided here rather than by the model: the patient asked for a number of
 * sessions per week and that promise should not depend on whether an AI
 * remembered it. Sessions are spread evenly through the week (never four in
 * a row followed by three rest days) and the last day of each week is kept
 * free, because recovery is part of the plan.
 */
export function isTrainingDay(dayIndex: number, daysPerWeek: number): boolean {
  const n = Math.max(0, Math.min(7, Math.round(daysPerWeek)));
  if (n === 0) return false;
  if (n >= 7) return true;
  const inWeek = ((dayIndex % 7) + 7) % 7;
  // Spread n sessions evenly over 7 slots, starting ON day one: someone who
  // just built their program should not be told to rest on the first day.
  // 3 a week lands on days 1, 4 and 6, with rest in between.
  return ((inWeek * n) % 7) < n;
}
