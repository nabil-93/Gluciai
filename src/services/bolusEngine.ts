import type {
  ActivityIntensity,
  ActivityKind,
  ActivityLog,
  ActivityStatus,
  GlucoseLog,
  InsulinLog,
  MealScan,
  MealType,
  Profile,
} from '@/types';

/**
 * Deterministic bolus engine — mirrors what clinicians and insulin pumps
 * actually compute. The AI never invents the dose: this engine produces it
 * (auditable, reproducible), the AI explains it and sanity-checks edits.
 *
 * Clinical basis:
 *  - Meal bolus      = carbs (g) ÷ ICR (insulin-to-carb ratio, g per unit)
 *  - Correction      = (BG − mid-target) ÷ ISF (correction factor, mg/dL per U)
 *                      only applied when BG is above the target high.
 *  - IOB             = rapid insulin still active from the last DIA hours
 *                      (linear decay, DIA = 4 h) — subtracted so doses never
 *                      stack ("insulin stacking" is the #1 hypo cause).
 *  - Exercise        = recent activity keeps burning glucose for hours →
 *                      reduce the bolus (−15 % moderate, −25 % intense).
 *  - Trend           = BG rising/falling fast (from the last readings)
 *                      → adjust ±10 % and warn.
 *  - Hypo guard      = BG under the patient's low target → NO bolus at all,
 *                      treat the hypo first.
 *  - Rounded to 0.1 U (fine pen / pump precision), capped for safety.
 */

export const DIA_HOURS = 4; // duration of insulin action (rapid analogs 3-5 h)
export const MAX_SAFE_BOLUS = 20; // safety cap — flag anything above

export type BolusFlag =
  | 'hypo' // BG below low target → dose forced to 0
  | 'nearLow' // BG in the low-normal band and falling
  | 'falling' // BG trending down
  | 'rising' // BG trending up fast
  | 'iob' // active insulin deducted
  | 'activity' // recent exercise reduction applied
  | 'sugarHeavy' // meal sugar > 40% of carbs → fast spike
  | 'highBG' // BG very high (> 250)
  | 'capped' // dose hit the safety cap
  | 'noRatio' // profile ratios missing → defaults used
  | 'sick' // patient declared illness → needs raised
  | 'stress' // patient declared stress → needs raised
  | 'lowActivity' // status injured/paused → less exercise, less sensitive
  | 'alcohol'; // alcohol → correction halved + dose reduced (hypo risk)

/**
 * Which meal-of-day ratio applies. Patients enter U per 10 g of carbs per
 * meal (insulin_per_10g_*); snacks reuse the lunch ratio when set.
 */
export function guessMealTime(now: Date): MealType {
  const h = now.getHours();
  if (h >= 4 && h < 11) return 'breakfast';
  if (h >= 11 && h < 16) return 'lunch';
  if (h >= 18) return 'dinner';
  return 'snack';
}

export type RatioSource = 'meal' | 'global' | 'default';

/**
 * The insulin-to-carb ratio for a given meal moment.
 * 1) the patient's own per-meal value (U per 10 g, doctor-prescribed),
 * 2) the legacy single carb_ratio (g per U),
 * 3) the 10 g/U default (flagged as 'noRatio' by the engine).
 */
export function ratioForMeal(
  profile: Profile | null,
  mealTime: MealType
): { gPerU: number; uPer10g: number | null; source: RatioSource } {
  const per10g = profile
    ? {
        breakfast: profile.insulin_per_10g_breakfast,
        lunch: profile.insulin_per_10g_lunch,
        dinner: profile.insulin_per_10g_dinner,
        snack: profile.insulin_per_10g_lunch,
      }[mealTime]
    : undefined;
  if (per10g && per10g > 0) {
    return { gPerU: 10 / per10g, uPer10g: per10g, source: 'meal' };
  }
  if (profile?.carb_ratio && profile.carb_ratio > 0) {
    return {
      gPerU: profile.carb_ratio,
      uPer10g: Math.round((10 / profile.carb_ratio) * 100) / 100,
      source: 'global',
    };
  }
  return { gPerU: 10, uPer10g: 1, source: 'default' };
}

export interface BolusInputs {
  carbs: number;
  glucose: number | null;
  profile: Profile | null;
  insulinLogs: InsulinLog[];
  activityLogs: ActivityLog[];
  glucoseLogs: GlucoseLog[];
  lastMeal?: MealScan | null;
  now?: Date;
  /** Which meal this bolus is for — selects the per-meal ratio. */
  mealTime?: MealType;
  /** Sport declared on the calculator screen (on top of logged activity):
   *  which sport, how long, whether it's already done or planned after
   *  the meal. Duration scales the reduction (<30 min softer, >1 h
   *  stronger, capped at −35 %). */
  declaredSport?: {
    intensity: ActivityIntensity;
    kind?: ActivityKind;
    durationMin?: number | null;
    timing?: 'done' | 'planned';
  } | null;
  /** Patient declared they are sick right now (+15 % needs, flagged). */
  isSick?: boolean;
  /** Patient declared strong stress (+10 % needs, flagged). */
  isStressed?: boolean;
  /** The account-wide activity status (home "Statut"). `injured`/`paused`
   *  mean the patient dropped their usual exercise → reduced insulin
   *  sensitivity → a small +8 % on the dose. `sick` is handled by `isSick`
   *  (the toggle is pre-checked from this status), `active` = no change. */
  activityStatus?: ActivityStatus;
  /** Alcohol with this meal → correction halved, −10 %, hypo warning. */
  alcohol?: boolean;
}

export interface BolusResult {
  /* final recommendation */
  total: number;
  /* breakdown (all in units, before rounding) */
  mealBolus: number;
  correction: number;
  iob: number;
  activityFactor: number; // 1 = none, 0.85 = −15 %, 0.75 = −25 %
  trendFactor: number; // 1 = flat, 0.9 falling, 1.1 rising fast
  rawTotal: number;
  sickFactor: number; // 1 = fine, 1.15 = sick
  stressFactor: number; // 1 = fine, 1.1 = stressed
  statusFactor: number; // 1 = active, 1.08 = injured/paused (reduced activity)
  alcoholFactor: number; // 1 = none, 0.9 = alcohol declared
  /* context the engine used (for the AI report + UI) */
  mealTime: MealType;
  /** Patient's per-meal ratio actually used (U per 10 g), if any. */
  uPer10g: number | null;
  /** Where the ratio came from: per-meal plan, global profile, default. */
  ratioSource: RatioSource;
  /** Name of the meal insulin to inject (from the profile), if set. */
  bolusInsulinName: string | null;
  ratio: number;
  correctionFactor: number;
  targetLow: number;
  targetHigh: number;
  targetMid: number;
  glucose: number | null;
  carbs: number;
  trendPerMin: number | null; // mg/dL per minute (negative = falling)
  recentActivity: { kind: string; minutes: number; intensity: string } | null;
  /** Declared sport: already done, or planned after the meal (delayed-hypo
   *  risk the AI must warn about). Null when nothing was declared. */
  sportTiming: 'done' | 'planned' | null;
  iobDoses: { dose: number; minutesAgo: number; remaining: number }[];
  mealSugar: number | null;
  mealCalories: number | null;
  mealName: string | null;
  flags: BolusFlag[];
}

// Round the final dose to 0.1 U — meal boluses land on exact tenths (a
// breakfast ratio of 1.5 for 43 g → 6.5 U, not a coarse 0.5-step guess).
const roundDose = (v: number) => Math.round(v * 10) / 10;

/** Rapid insulin still active (linear decay over DIA_HOURS). */
export function computeIOB(logs: InsulinLog[], now: Date): BolusResult['iobDoses'] {
  const out: BolusResult['iobDoses'] = [];
  const cutoff = now.getTime() - DIA_HOURS * 3600e3;
  for (const l of logs) {
    if (l.insulin_type !== 'rapid') continue;
    const t = new Date(l.created_at).getTime();
    if (t < cutoff || t > now.getTime()) continue;
    const minutesAgo = (now.getTime() - t) / 60000;
    const remaining = Math.max(0, l.dose * (1 - minutesAgo / (DIA_HOURS * 60)));
    if (remaining > 0.05) out.push({ dose: l.dose, minutesAgo: Math.round(minutesAgo), remaining });
  }
  return out;
}

/** BG slope in mg/dL per minute from readings in the last 90 minutes. */
export function computeTrend(logs: GlucoseLog[], now: Date): number | null {
  const recent = logs
    .filter((g) => now.getTime() - new Date(g.created_at).getTime() < 90 * 60000)
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
  if (recent.length < 2) return null;
  const a = recent[0];
  const b = recent[recent.length - 1];
  const dt = (new Date(b.created_at).getTime() - new Date(a.created_at).getTime()) / 60000;
  if (dt < 10) return null; // too close to be meaningful
  return (b.value - a.value) / dt;
}

export function computeSmartBolus(inputs: BolusInputs): BolusResult {
  const now = inputs.now ?? new Date();
  const p = inputs.profile;
  const flags: BolusFlag[] = [];

  const mealTime = inputs.mealTime ?? guessMealTime(now);
  const r = ratioForMeal(p, mealTime);
  const ratio = Math.round(r.gPerU * 100) / 100;
  const isf = p?.correction_factor || 50;
  if (r.source === 'default' || !p?.correction_factor) flags.push('noRatio');
  const targetLow = p?.target_low ?? 70;
  const targetHigh = p?.target_high ?? 180;
  const targetMid = Math.round((targetLow + targetHigh) / 2);

  const carbs = Math.max(0, inputs.carbs || 0);
  const glucose = inputs.glucose && inputs.glucose > 0 ? inputs.glucose : null;

  /* meal details for the report */
  const meal = inputs.lastMeal ?? null;
  const mealSugar = meal ? Math.round(meal.result.sugar ?? 0) : null;
  const mealCalories = meal ? Math.round(meal.result.calories ?? 0) : null;
  const mealName = meal ? meal.result.food_name || null : null;
  if (meal && carbs > 0 && (meal.result.sugar ?? 0) / Math.max(1, carbs) > 0.4) {
    flags.push('sugarHeavy');
  }

  /* 1 — meal bolus */
  const mealBolus = carbs > 0 ? carbs / ratio : 0;

  /* 2 — correction (only above target high) */
  let correction = 0;
  if (glucose !== null && glucose > targetHigh) {
    correction = (glucose - targetMid) / isf;
    if (glucose > 250) flags.push('highBG');
  }

  /* 2b — declared conditions (illness raises needs; alcohol blocks the
     liver's glucose release for hours → halve the correction and reduce
     the dose, the delayed-hypo risk outweighs the meal spike) */
  const sickFactor = inputs.isSick ? 1.15 : 1;
  if (inputs.isSick) flags.push('sick');
  const stressFactor = inputs.isStressed ? 1.1 : 1;
  if (inputs.isStressed) flags.push('stress');
  // Home "Statut": injured / paused = the patient stopped their usual
  // exercise → insulin sensitivity drops → a small, conservative +8 %.
  // (`sick` is already covered by isSick; `active` leaves the dose unchanged.)
  const statusFactor =
    inputs.activityStatus === 'injured' || inputs.activityStatus === 'paused' ? 1.08 : 1;
  if (statusFactor > 1) flags.push('lowActivity');
  let alcoholFactor = 1;
  if (inputs.alcohol) {
    alcoholFactor = 0.9;
    correction = correction / 2;
    flags.push('alcohol');
  }

  /* 3 — insulin on board */
  const iobDoses = computeIOB(inputs.insulinLogs, now);
  const iob = iobDoses.reduce((s, d) => s + d.remaining, 0);
  if (iob > 0.1) flags.push('iob');

  /* 4 — recent exercise (last 4 h; intense counts for 6 h) */
  let activityFactor = 1;
  let recentActivity: BolusResult['recentActivity'] = null;
  for (const a of inputs.activityLogs) {
    const hAgo = (now.getTime() - new Date(a.created_at).getTime()) / 3600e3;
    if (hAgo < 0) continue;
    const windowH = a.intensity === 'high' ? 6 : 4;
    if (hAgo <= windowH) {
      const factor = a.intensity === 'high' ? 0.75 : a.intensity === 'medium' ? 0.85 : 0.92;
      if (factor < activityFactor) {
        activityFactor = factor;
        recentActivity = {
          kind: a.kind,
          minutes: a.duration_min ?? 0,
          intensity: a.intensity ?? 'medium',
        };
      }
    }
  }
  /* sport declared on the calculator screen (not yet logged) — the
     strongest reduction wins, exactly like a logged session. The declared
     DURATION scales the effect: a short effort (<30 min) burns less, a
     long one (>1 h) keeps lowering glucose for hours. */
  let sportTiming: 'done' | 'planned' | null = null;
  if (inputs.declaredSport) {
    const s = inputs.declaredSport;
    const base = s.intensity === 'high' ? 0.25 : s.intensity === 'medium' ? 0.15 : 0.08;
    const dur = s.durationMin && s.durationMin > 0 ? s.durationMin : 0;
    let reduction = base;
    if (dur > 0 && dur < 30) reduction = base * 0.6;
    else if (dur > 60) reduction = base * 1.3;
    reduction = Math.min(0.35, reduction);
    const declared = 1 - reduction;
    sportTiming = s.timing ?? 'done';
    if (declared < activityFactor) {
      activityFactor = Math.round(declared * 100) / 100;
      recentActivity = { kind: s.kind ?? 'other', minutes: dur, intensity: s.intensity };
    }
  }
  if (activityFactor < 1) flags.push('activity');

  /* 5 — trend */
  const trendPerMin = computeTrend(inputs.glucoseLogs, now);
  let trendFactor = 1;
  if (trendPerMin !== null) {
    if (trendPerMin <= -1) {
      trendFactor = 0.9;
      flags.push('falling');
      if (glucose !== null && glucose < targetLow + 30) flags.push('nearLow');
    } else if (trendPerMin >= 2) {
      trendFactor = 1.1;
      flags.push('rising');
    }
  }

  /* 6 — assemble: (meal + correction − IOB) × activity × trend × state */
  let raw =
    (mealBolus + correction - iob) *
    activityFactor *
    trendFactor *
    sickFactor *
    stressFactor *
    statusFactor *
    alcoholFactor;
  raw = Math.max(0, raw);

  /* 7 — hypo guard: below the low target → no bolus, treat the hypo */
  if (glucose !== null && glucose < targetLow) {
    flags.unshift('hypo');
    raw = 0;
  }

  /* 8 — round + safety cap */
  let total = roundDose(raw);
  if (total > MAX_SAFE_BOLUS) {
    total = MAX_SAFE_BOLUS;
    flags.push('capped');
  }

  const r1 = (v: number) => Math.round(v * 10) / 10;
  return {
    total,
    mealBolus: r1(mealBolus),
    correction: r1(correction),
    iob: r1(iob),
    activityFactor,
    trendFactor,
    sickFactor,
    stressFactor,
    statusFactor,
    alcoholFactor,
    rawTotal: r1(raw),
    mealTime,
    uPer10g: r.uPer10g,
    ratioSource: r.source,
    bolusInsulinName: p?.bolus_insulin_name?.trim() || null,
    ratio,
    correctionFactor: isf,
    targetLow,
    targetHigh,
    targetMid,
    glucose,
    carbs,
    trendPerMin: trendPerMin === null ? null : Math.round(trendPerMin * 10) / 10,
    recentActivity,
    sportTiming,
    iobDoses,
    mealSugar,
    mealCalories,
    mealName,
    flags,
  };
}

export type DoseRisk = 'ok' | 'caution' | 'danger';

/**
 * Deterministic safety check of a patient-modified dose — runs even when
 * the AI is unreachable. The AI check adds nuance on top; the final risk
 * shown is the WORSE of the two.
 */
export function localDoseCheck(
  modified: number,
  engine: BolusResult
): { risk: DoseRisk; reasons: string[] } {
  const reasons: string[] = [];
  let risk: DoseRisk = 'ok';
  const bump = (r: DoseRisk) => {
    if (r === 'danger' || (r === 'caution' && risk === 'ok')) risk = r;
  };

  const rec = engine.total;

  if (engine.flags.includes('hypo') && modified > 0) {
    bump('danger');
    reasons.push('hypoDose');
  }
  if (engine.flags.includes('falling') && modified > rec) {
    bump('danger');
    reasons.push('fallingIncrease');
  }
  if (modified > MAX_SAFE_BOLUS) {
    bump('danger');
    reasons.push('overCap');
  }
  if (rec > 0 && (modified > rec * 1.5 || modified > rec + 3)) {
    bump(modified > rec * 2 || modified > rec + 5 ? 'danger' : 'caution');
    reasons.push('muchHigher');
  }
  if (rec === 0 && !engine.flags.includes('hypo') && modified > 2) {
    bump('caution');
    reasons.push('noNeedButDosing');
  }
  if (engine.iob > 1 && modified > rec + 1) {
    bump('caution');
    reasons.push('stacking');
  }
  if (rec > 2 && modified < rec * 0.4) {
    bump('caution');
    reasons.push('muchLower');
  }
  return { risk, reasons };
}
