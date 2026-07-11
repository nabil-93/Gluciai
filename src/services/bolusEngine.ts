import type { ActivityLog, GlucoseLog, InsulinLog, MealScan, Profile } from '@/types';

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
 *  - Rounded to 0.5 U (pen precision), capped for safety.
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
  | 'noRatio'; // profile ratios missing → defaults used

export interface BolusInputs {
  carbs: number;
  glucose: number | null;
  profile: Profile | null;
  insulinLogs: InsulinLog[];
  activityLogs: ActivityLog[];
  glucoseLogs: GlucoseLog[];
  lastMeal?: MealScan | null;
  now?: Date;
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
  /* context the engine used (for the AI report + UI) */
  ratio: number;
  correctionFactor: number;
  targetLow: number;
  targetHigh: number;
  targetMid: number;
  glucose: number | null;
  carbs: number;
  trendPerMin: number | null; // mg/dL per minute (negative = falling)
  recentActivity: { kind: string; minutes: number; intensity: string } | null;
  iobDoses: { dose: number; minutesAgo: number; remaining: number }[];
  mealSugar: number | null;
  mealCalories: number | null;
  mealName: string | null;
  flags: BolusFlag[];
}

const round05 = (v: number) => Math.round(v * 2) / 2;

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

  const ratio = p?.carb_ratio || 10;
  const isf = p?.correction_factor || 50;
  if (!p?.carb_ratio || !p?.correction_factor) flags.push('noRatio');
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

  /* 6 — assemble: (meal + correction − IOB) × activity × trend */
  let raw = (mealBolus + correction - iob) * activityFactor * trendFactor;
  raw = Math.max(0, raw);

  /* 7 — hypo guard: below the low target → no bolus, treat the hypo */
  if (glucose !== null && glucose < targetLow) {
    flags.unshift('hypo');
    raw = 0;
  }

  /* 8 — round + safety cap */
  let total = round05(raw);
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
    rawTotal: r1(raw),
    ratio,
    correctionFactor: isf,
    targetLow,
    targetHigh,
    targetMid,
    glucose,
    carbs,
    trendPerMin: trendPerMin === null ? null : Math.round(trendPerMin * 10) / 10,
    recentActivity,
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
