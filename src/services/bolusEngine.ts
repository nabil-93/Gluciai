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

/**
 * THE INPUT CONTRACT (Step 13 — findings P7-003, P7-005, P7-006).
 *
 * The arithmetic below this comment is unchanged. What changed is what the
 * engine is willing to *believe* before doing it, because three questions used
 * to be answered by silence:
 *
 *   · IS THERE A READING? `inputs.glucose && inputs.glucose > 0` collapsed a
 *     genuine 0, a NaN and "not measured" into one state, so a critical value
 *     produced a full meal bolus with no hypo flag, and a dose computed with no
 *     glucose context at all reported nothing.
 *   · IN WHAT UNIT? `GlucoseLog` has always carried `unit`, and nothing read
 *     it: 5.6 mmol/L was compared against mg/dL thresholds (hypo, dose 0), and
 *     one mmol/L row in the history fabricated a fast fall.
 *   · DID THE PATIENT ACTUALLY STATE THIS PARAMETER? A missing ICR became
 *     10 g/U, a missing ISF became 50, a NEGATIVE ISF was used as given (it is
 *     truthy) and produced a correction that SUBTRACTED from the meal bolus,
 *     and a NaN target silently switched the hypo guard off.
 *
 * The fallbacks themselves are unchanged — 10 g/U, 50 mg/dL/U, 70-180 mg/dL are
 * the application's existing defaults (and the database's) — but they are now
 * REPORTED as fallbacks instead of passing for the patient's own numbers, and a
 * parameter that is present-but-unusable takes the same explicit fallback path
 * as a missing one instead of reaching the formula.
 *
 * No threshold, formula, factor, cap, rounding, IOB rule or meal window is
 * touched here. Whether a *missing* parameter should block the dose entirely is
 * a clinical-policy question and is deliberately NOT decided in this step.
 */

/** The application's existing fallbacks, named rather than inline. */
export const FALLBACK_G_PER_U = 10; // ICR when the patient has stated none
export const FALLBACK_ISF = 50; // mg/dL per U when the patient has stated none
export const FALLBACK_TARGET_LOW = 70; // mg/dL — also the DB column default
export const FALLBACK_TARGET_HIGH = 180; // mg/dL — also the DB column default

/** Glucose units the engine can interpret. Mirrors `GlucoseLog['unit']` and the
 *  `glucose_logs.unit` CHECK constraint (migration 0001). */
export type GlucoseUnit = 'mg/dL' | 'mmol/L';

/**
 * mmol/L → mg/dL. Glucose's molar mass is 180.156 g/mol, so 1 mmol/L is
 * 18.0182 mg/dL; this is the standard conversion, not a clinical choice. No
 * threshold moves: the comparisons still happen in mg/dL, against the same
 * numbers as before.
 */
export const MMOL_TO_MGDL = 18.0182;

/**
 * The lowest mg/dL reading this app will accept as TYPED (finding P7-005).
 *
 * THE DANGER THIS CLOSES. Every glucose entry surface in this app is mg/dL —
 * the field says so, `saveGlucose` writes only `'mg/dL'`, and there is no
 * patient unit preference anywhere. A patient who thinks in mmol/L and types
 * their real reading of **5.6** would have it stored as 5.6 **mg/dL**: a
 * profound hypoglycaemia that never happened. The engine has always converted
 * a reading that ARRIVES labelled `mmol/L` correctly (`readGlucose`); what it
 * could not do is notice that a *typed* number was never in mg/dL at all.
 *
 * WHY 20. The whole plausible mmol/L range for a living person (roughly
 * 1–33 mmol/L) sits below 20, and no mg/dL reading a patient can act on sits
 * below it either — 20 mg/dL is already deep unconsciousness. So a typed value
 * under 20 is far more likely to be mmol/L than a real mg/dL reading. This is
 * NOT a new clinical threshold: it is the bound `aiLogger` has always applied
 * to a spoken reading (`value < 20 || value > 900` → rejected). This constant
 * names that existing rule and extends it to the surface that lacked it.
 *
 * The rule is deliberately REFUSAL, never conversion: silently multiplying by
 * 18 would invent a reading the patient did not give. The screen asks them to
 * confirm in mg/dL instead.
 */
export const MIN_TYPED_MGDL = 20;

/** The highest mg/dL reading this app will accept as typed. `aiLogger`'s
 *  existing upper bound, applied to the manual field too. */
export const MAX_TYPED_MGDL = 900;

/**
 * Is a TYPED glucose value plausible as mg/dL (P7-005)?
 *
 * `false` means "do not store this as mg/dL" — it does not mean the patient is
 * wrong, and it never converts. A value below {@link MIN_TYPED_MGDL} is very
 * likely a mmol/L reading; the caller must ask rather than assume.
 *
 * Pure and threshold-free beyond the two bounds above, so the bolus screen,
 * the log screen and the tests share exactly one rule.
 */
export function isPlausibleTypedMgdl(value: number | null | undefined): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== 'number' || !Number.isFinite(value)) return false;
  return value >= MIN_TYPED_MGDL && value <= MAX_TYPED_MGDL;
}

/**
 * Does a typed number look like a mmol/L reading that was meant as mg/dL?
 *
 * Used only to choose the WORDING of the refusal — "did you mean 101 mg/dL?"
 * is more useful than a bare rejection. The suggestion is shown, never stored:
 * the patient re-enters the value themselves.
 */
export function looksLikeMmol(value: number | null | undefined): boolean {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value > 0 &&
    value < MIN_TYPED_MGDL
  );
}

/** Whether a parameter came from the patient's profile or from the fallback. */
export type ParamSource = 'profile' | 'fallback';

/**
 * What the engine was given for the current glucose:
 *   · `absent`  — nothing was supplied. No correction, no hypo guard, and the
 *                 result says so instead of looking like a normal calculation.
 *   · `invalid` — something was supplied that cannot be a reading (non-finite,
 *                 negative, or in a unit this engine does not know). NOT the
 *                 same as absent, and reported separately so the defect cannot
 *                 hide as "the patient didn't measure".
 *   · `value`   — a usable reading, INCLUDING a genuine 0.
 */
export type GlucoseState = 'absent' | 'invalid' | 'value';

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
  | 'alcohol' // alcohol → correction halved + dose reduced (hypo risk)
  /* ── Step 13: states that used to be silent ─────────────────────────── */
  | 'noGlucose' // no reading was supplied — dose computed without BG context
  | 'glucoseInvalid' // a reading was supplied that cannot be interpreted
  | 'carbsUnknown' // the carbohydrate is a placeholder, not a measurement
  | 'defaultIsf' // the correction factor is the app fallback, not the patient's
  | 'defaultTarget' // the target range is the app fallback, not the patient's
  /* ── P7-011 disclosure: NOT a change to the IOB rule ─────────────────── */
  | 'mixedInsulinUncounted'; // a premixed dose is active but excluded from IOB

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
 * A number that may be used as a clinical parameter, or null.
 *
 * A parameter must be finite and strictly positive: a ratio, a correction
 * factor and a target are all quantities that divide or bound a dose, and zero,
 * a negative, NaN and Infinity are none of them. `||` and `??` both let some of
 * those through, which is how a negative ISF reached the formula.
 */
function clinicalNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null;
}

/**
 * The insulin-to-carb ratio for a given meal moment.
 * 1) the patient's own per-meal value (U per 10 g, doctor-prescribed),
 * 2) the legacy single carb_ratio (g per U),
 * 3) the FALLBACK_G_PER_U default (`source: 'default'`, and the engine's
 *    `noRatio` flag) — the app's existing fallback, now impossible to mistake
 *    for a value the patient entered.
 *
 * Unusable candidates (0, negative, NaN, Infinity) fall THROUGH to the next
 * one instead of being used: `per10g > 0` already rejected 0, negatives and
 * NaN, but `Infinity > 0` is true, and an infinite ratio produced either a
 * capped 20 U dose or a silent 0 U one depending on which field held it.
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
  const mealRatio = clinicalNumber(per10g);
  if (mealRatio !== null) {
    return { gPerU: 10 / mealRatio, uPer10g: mealRatio, source: 'meal' };
  }
  const globalRatio = clinicalNumber(profile?.carb_ratio);
  if (globalRatio !== null) {
    return {
      gPerU: globalRatio,
      uPer10g: Math.round((10 / globalRatio) * 100) / 100,
      source: 'global',
    };
  }
  return { gPerU: FALLBACK_G_PER_U, uPer10g: 1, source: 'default' };
}

/**
 * The correction factor to use, and whether it is the patient's own.
 *
 * A supplied ISF that is not a usable quantity — 0, negative, NaN, Infinity —
 * is treated as UNAVAILABLE and takes the same explicit fallback path as a
 * missing one. It is never used as a clinical parameter: a negative ISF used to
 * produce a negative correction that subtracted from the meal bolus.
 */
export function isfForProfile(
  profile: Profile | null
): { isf: number; source: ParamSource } {
  const stated = clinicalNumber(profile?.correction_factor);
  return stated !== null
    ? { isf: stated, source: 'profile' }
    : { isf: FALLBACK_ISF, source: 'fallback' };
}

/**
 * The target range to use, and whether it is the patient's own.
 *
 * Both bounds must be usable AND correctly ordered before they may drive the
 * hypo guard or the correction. A NaN target used to switch the hypo guard off
 * silently — every comparison against NaN being false — which is the most
 * dangerous shape this defect takes. An unusable or inverted pair falls back to
 * the application's existing 70-180 mg/dL, reported as a fallback; no new
 * clinical value is introduced, and a valid pair is passed through untouched.
 */
export function targetsForProfile(
  profile: Profile | null
): { low: number; high: number; source: ParamSource } {
  const low = clinicalNumber(profile?.target_low);
  const high = clinicalNumber(profile?.target_high);
  if (low !== null && high !== null && low <= high) {
    return { low, high, source: 'profile' };
  }
  return { low: FALLBACK_TARGET_LOW, high: FALLBACK_TARGET_HIGH, source: 'fallback' };
}

/**
 * A glucose value in mg/dL, with what was supplied kept alongside it.
 *
 * The three states are answered separately (see {@link GlucoseState}) so that
 * "not measured", "unusable" and "0" can never again share a code path. A
 * recognized unit is converted deterministically; an unrecognized one makes the
 * reading `invalid` rather than being read as mg/dL.
 */
export function readGlucose(
  value: number | null | undefined,
  unit: GlucoseUnit = 'mg/dL'
): {
  state: GlucoseState;
  mgdl: number | null;
  supplied: { value: number; unit: GlucoseUnit } | null;
} {
  if (value === null || value === undefined) {
    return { state: 'absent', mgdl: null, supplied: null };
  }
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    return { state: 'invalid', mgdl: null, supplied: null };
  }
  if (unit !== 'mg/dL' && unit !== 'mmol/L') {
    // A unit this engine cannot interpret is not a reading it may compare
    // against mg/dL thresholds.
    return { state: 'invalid', mgdl: null, supplied: null };
  }
  const mgdl = unit === 'mmol/L' ? Math.round(value * MMOL_TO_MGDL * 10) / 10 : value;
  return { state: 'value', mgdl, supplied: { value, unit } };
}

export interface BolusInputs {
  carbs: number;
  /**
   * Whether `carbs` above is a real figure rather than a placeholder.
   *
   * Defaults to `true`, so every existing caller keeps its behaviour. Pass
   * `false` when the carbohydrate is not known (an empty field, a meal whose
   * carbohydrate was never established — see `carbProvenance.ts`): the engine
   * then computes no meal bolus from it and SAYS so, instead of returning the
   * same confident 0 U a genuine zero-carb meal produces.
   */
  carbsKnown?: boolean;
  /** The current reading, in {@link BolusInputs.glucoseUnit}. `null` = not
   *  measured. `0` is a value, not an absence. */
  glucose: number | null;
  /**
   * The unit `glucose` is expressed in. Defaults to mg/dL, which is the app's
   * own contract for a typed reading: `saveGlucose` writes only `'mg/dL'`, the
   * `glucose_logs.unit` column defaults to it, `sync.ts` coerces anything else
   * to one of the two, and every field and label on the bolus screen says
   * mg/dL. Callers holding a reading in another unit must state it.
   */
  glucoseUnit?: GlucoseUnit;
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
  /** Whether `correctionFactor` is the patient's own or the app's fallback.
   *  A fallback 50 and a patient-entered 50 used to be indistinguishable. */
  isfSource: ParamSource;
  targetLow: number;
  targetHigh: number;
  targetMid: number;
  /** Whether the target range above is the patient's own or the app's
   *  fallback (unusable or inverted bounds take the fallback path). */
  targetSource: ParamSource;
  /** The reading used for the correction and the hypo guard, in mg/dL —
   *  normalized from `glucoseSupplied` when that came in another unit. */
  glucose: number | null;
  /** Which of the three input states produced `glucose` above. */
  glucoseState: GlucoseState;
  /** Exactly what was handed in, before normalization: `{ value: 5.6,
   *  unit: 'mmol/L' }` stays visible next to the 100.9 mg/dL it became. Null
   *  when nothing usable was supplied. */
  glucoseSupplied: { value: number; unit: GlucoseUnit } | null;
  carbs: number;
  /** Whether `carbs` is a figure or a placeholder (see `BolusInputs`). */
  carbsKnown: boolean;
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

/**
 * Is a PREMIXED dose still inside the action window while being excluded from
 * IOB (finding P7-011)?
 *
 * This function changes NOTHING about the dose. `computeIOB` still counts only
 * `rapid`, exactly as before, because how much of a premix is rapid — and over
 * what duration it decays — is a clinical question the app has no answer for
 * (RU-11 Q4–Q7). What was missing is that the omission was *silent*: a patient
 * with 20 U of premix active saw a dose computed as if nothing were on board,
 * with nothing on screen saying so.
 *
 * So this reports the fact only, so the screen can disclose it. It uses the
 * same `DIA_HOURS` window `computeIOB` uses, purely to avoid warning about a
 * dose that is certainly finished; it does NOT model premix decay and does not
 * imply that window is clinically right for a premix.
 */
export function hasUncountedMixedInsulin(logs: InsulinLog[], now: Date): boolean {
  const cutoff = now.getTime() - DIA_HOURS * 3600e3;
  for (const l of logs ?? []) {
    if (l.insulin_type !== 'mixed') continue;
    const t = new Date(l.created_at).getTime();
    if (t < cutoff || t > now.getTime()) continue;
    if (l.dose > 0) return true;
  }
  return false;
}

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

/**
 * BG slope in mg/dL per minute from readings in the last 90 minutes.
 *
 * Every reading is normalized through its OWN `unit` before the subtraction.
 * Until Step 13 the field was ignored, so a single mmol/L row among mg/dL ones
 * fabricated a fast fall — 100 mg/dL followed by 5.6 mmol/L (which is 101 mg/dL,
 * i.e. flat) read as −1.57 mg/dL per minute, tripping `falling`, cutting the
 * dose by 10 % and making a correct dose look dangerous to `localDoseCheck`.
 *
 * A row whose unit is absent is read as mg/dL — the application's own default
 * (the column default, the only value `saveGlucose` writes, and what `sync.ts`
 * coerces to), not a guess. A row in a unit this engine does not know is
 * DROPPED rather than mixed in.
 */
export function computeTrend(logs: GlucoseLog[], now: Date): number | null {
  const recent = logs
    .map((g) => {
      // Absent unit → the app's documented default. A unit that is neither of
      // the two the app writes is passed through as-is, so `readGlucose`
      // rejects it and the row is dropped below.
      const unit = (g.unit ?? 'mg/dL') as GlucoseUnit;
      const read = readGlucose(g.value, unit);
      return read.state === 'value' && read.mgdl !== null
        ? { mgdl: read.mgdl, at: new Date(g.created_at).getTime() }
        : null;
    })
    .filter((g): g is { mgdl: number; at: number } => g !== null)
    .filter((g) => now.getTime() - g.at < 90 * 60000)
    .sort((a, b) => a.at - b.at);
  if (recent.length < 2) return null;
  const a = recent[0];
  const b = recent[recent.length - 1];
  const dt = (b.at - a.at) / 60000;
  if (dt < 10) return null; // too close to be meaningful
  return (b.mgdl - a.mgdl) / dt;
}

export function computeSmartBolus(inputs: BolusInputs): BolusResult {
  const now = inputs.now ?? new Date();
  const p = inputs.profile;
  const flags: BolusFlag[] = [];

  const mealTime = inputs.mealTime ?? guessMealTime(now);
  const r = ratioForMeal(p, mealTime);
  const ratio = Math.round(r.gPerU * 100) / 100;
  // Each parameter now says whether it is the patient's or the app's fallback.
  const { isf, source: isfSource } = isfForProfile(p);
  const { low: targetLow, high: targetHigh, source: targetSource } = targetsForProfile(p);
  const targetMid = Math.round((targetLow + targetHigh) / 2);
  // `noRatio` is kept exactly as it was — one compound flag for "some parameter
  // was defaulted" — so anything already reading it behaves identically. The
  // two specific flags below are what the UI consumes, because the patient has
  // to know WHICH number is not theirs.
  if (r.source === 'default' || isfSource === 'fallback') flags.push('noRatio');
  if (isfSource === 'fallback') flags.push('defaultIsf');
  if (targetSource === 'fallback') flags.push('defaultTarget');

  const carbs = Math.max(0, inputs.carbs || 0);
  // Absent by default only when the caller says so: `carbsKnown !== false`
  // keeps every existing caller unchanged.
  const carbsKnown = inputs.carbsKnown !== false;
  if (!carbsKnown) flags.push('carbsUnknown');

  // Presence, validity and unit answered separately — never by truthiness.
  const read = readGlucose(inputs.glucose, inputs.glucoseUnit ?? 'mg/dL');
  const glucose = read.mgdl;
  const glucoseState = read.state;
  if (glucoseState === 'absent') flags.push('noGlucose');
  if (glucoseState === 'invalid') flags.push('glucoseInvalid');

  /* meal details for the report */
  const meal = inputs.lastMeal ?? null;
  const mealSugar = meal ? Math.round(meal.result.sugar ?? 0) : null;
  const mealCalories = meal ? Math.round(meal.result.calories ?? 0) : null;
  const mealName = meal ? meal.result.food_name || null : null;
  /*
   * NUTR-A8 — the ratio must describe ONE meal.
   *
   * This used to divide the last meal's sugar by the carbohydrate the patient
   * TYPED. Those are not necessarily the same meal: the field can be seeded
   * from a different meal, edited by hand, or handed over from the programme,
   * so a sugary breakfast could flag a savoury dinner (or hide itself behind a
   * large typed carbohydrate). The comparison is now between the meal's own
   * sugar and the meal's own carbohydrate.
   *
   * THE THRESHOLD IS UNCHANGED (> 0.4) and remains an RU-3/RU-6 question. Only
   * the two operands are corrected. A meal whose carbohydrate is unknown
   * (Step 10) cannot support the ratio at all, so the flag is withheld rather
   * than computed from a placeholder — the same "withhold rather than invent"
   * rule the quality gate uses.
   */
  const mealCarbs = meal?.result.carbohydrates ?? 0;
  const mealCarbsKnown = meal ? meal.result.carbs_known !== false : false;
  if (meal && mealCarbsKnown && mealCarbs > 0 && (meal.result.sugar ?? 0) / mealCarbs > 0.4) {
    flags.push('sugarHeavy');
  }

  /* 1 — meal bolus. An unknown carbohydrate contributes nothing AND is
     flagged: the 0 it would otherwise produce is indistinguishable from the 0
     a glass of water genuinely produces. The correction below still runs, so a
     correction-only dose (a real clinical use) is unaffected. */
  const mealBolus = carbsKnown && carbs > 0 ? carbs / ratio : 0;

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
  // P7-011 — DISCLOSURE ONLY. `iob` above is unchanged: a premixed dose still
  // contributes nothing, because how much of it is rapid is an RU-11 decision.
  // The flag exists so the screen cannot present that omission as a complete
  // picture of active insulin.
  if (hasUncountedMixedInsulin(inputs.insulinLogs, now)) {
    flags.push('mixedInsulinUncounted');
  }

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
    isfSource,
    targetLow,
    targetHigh,
    targetMid,
    targetSource,
    glucose,
    glucoseState,
    glucoseSupplied: read.supplied,
    carbs,
    carbsKnown,
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
