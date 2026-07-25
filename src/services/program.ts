import { getSession, pickSessions, type WorkoutLevel } from '@/data/workouts';
import { isDemoMode, supabase } from '@/lib/supabase';
import { buildHealthContext } from '@/services/ai';
import { saveMeal } from '@/services/data';
import { buildDayEvents, dayTotals } from '@/services/dayLog';
import { aggregateItems, rescaleItem, resolveFood } from '@/services/nutrition/engine';
import {
  adaptMeal,
  computeProgramTargets,
  dayBudget,
  isTrainingDay,
  MEAL_SLOTS,
  type ActivityLevel,
  type DayBudget,
  type MealSlot,
  type ProgramGoal,
  type ProgramTargets,
} from '@/services/programEngine';
import { useAppStore } from '@/store/useAppStore';
import type { FoodItemResult, MealScan, MealType, NutritionResult, Profile } from '@/types';

/* ────────────────────────────────────────────────────────────
 * "MON PROGRAMME" — data layer.
 *
 * The division of labour this whole feature rests on:
 *
 *   programEngine  → every NUMBER (budget, macros, pace, safety rails)
 *   the AI         → every DISH (invented for this person, from scratch —
 *                    never picked out of the healthy-foods catalogue)
 *   nutrition/engine → the REAL macros of what the AI invented, looked up
 *                    per ingredient in USDA / Moroccan DB / Open Food Facts
 *
 * The last step is not a nicety. A dish's carbohydrate grams flow straight
 * into the bolus calculator, so they have to come from a food database, not
 * from a language model's guess.
 * ──────────────────────────────────────────────────────────── */

export interface PlannedIngredient {
  name: string;
  /** English generic name used to query the nutrition databases. */
  search_name?: string;
  grams: number;
}

export interface PlannedMeal {
  slot: MealSlot;
  title: string;
  emoji: string;
  /** Why the coach chose this for this person, one line. */
  why?: string;
  ingredients: PlannedIngredient[];
  recipe?: string[];
  /* Resolved nutrition — filled by `resolveMealMacros`, never by the AI. */
  kcal: number;
  carbs: number;
  sugar: number;
  protein: number;
  fat: number;
  fiber: number;
  gi?: number | null;
  /** Where the numbers came from, for honest confidence in the UI. */
  resolved: boolean;
  /**
   * The per-ingredient rows the nutrition databases returned. Kept on the
   * meal so confirming "I ate it" can file a REAL journal entry — same shape
   * as a scanned plate — instantly and offline, with no second lookup.
   */
  items?: FoodItemResult[];
  /** Set once the patient confirms they ate it. */
  eatenAt?: string | null;
  /** Journal entry created by that confirmation, so it can be undone. */
  mealId?: string | null;
  /** How much of the planned plate was actually eaten (1 = all of it). */
  portion?: number;
}

export interface ProgramDay {
  date: string;
  dayIndex: number;
  meals: PlannedMeal[];
  workoutId?: string | null;
  status: 'planned' | 'partial' | 'done' | 'skipped';
  adaptationNote?: string | null;
  /** Set when the session was completed (or the rest day acknowledged). */
  workoutDoneAt?: string | null;
  /**
   * Set when the patient closed the day themselves. This is what unlocks the
   * NEXT day — never the calendar. A day the patient has not closed stays
   * open, and no future day exists to be peeked at.
   */
  confirmedAt?: string | null;
}

export interface ProgramConstraints {
  /** Foods to never propose (allergies first, dislikes second). */
  avoid: string[];
  /** Cuisine or habits to lean into, free text from the patient. */
  likes: string[];
  /** Minutes the patient is willing to spend cooking. */
  cookMinutes: number;
  /** Restructure the day around ftour/shour. */
  fasting: boolean;
  budget: 'low' | 'medium' | 'high';
}

export interface Program {
  id: string;
  goal: ProgramGoal;
  status: 'active' | 'paused' | 'done' | 'abandoned';
  startDate: string;
  weeks: number;
  startWeight: number | null;
  targetWeight: number | null;
  activityLevel: ActivityLevel;
  trainingDaysPerWeek: number;
  trainingPlace: 'home' | 'gym' | 'outdoor' | 'mixed';
  targets: ProgramTargets;
  constraints: ProgramConstraints;
}

export const DEFAULT_CONSTRAINTS: ProgramConstraints = {
  avoid: [],
  likes: [],
  cookMinutes: 30,
  fasting: false,
  budget: 'medium',
};

/* ── Targets preview (pure, offline) ─────────────────────────
 * The setup wizard shows the patient their real budget BEFORE anything is
 * saved or any AI is called, because those numbers are what they are
 * actually signing up to. All local maths — works with no network. */

export function previewTargets(args: {
  profile: Profile | null;
  goal: ProgramGoal;
  targetWeight?: number | null;
  ratePerWeek?: number | null;
  activityLevel: ActivityLevel;
  trainingDaysPerWeek: number;
}): ProgramTargets {
  return computeProgramTargets(args);
}

/* ── Today's live budget ─────────────────────────────────────
 * Reads the same journal the rest of the app writes to, so a meal scanned
 * from the camera counts against the program without any extra step. */

export function todayBudget(targets: ProgramTargets): DayBudget {
  return budgetForDate(targets, new Date());
}

/** The same budget for ANY day — what the history screen reads back. */
export function budgetForDate(targets: ProgramTargets, day: Date): DayBudget {
  const tot = dayTotals(buildDayEvents(day));
  return dayBudget(targets, { kcal: tot.kcal, carbs: tot.carbs });
}

/** The next meal slot that has not been eaten yet today. */
export function nextSlot(day: ProgramDay | null): MealSlot | null {
  if (!day) return null;
  const pending = MEAL_SLOTS.filter(
    (s) => !day.meals.find((m) => m.slot === s)?.eatenAt
  );
  return pending[0] ?? null;
}

/**
 * Re-target the upcoming meal from what actually happened today. Pure
 * arithmetic, so the card updates instantly and offline; the AI is only
 * asked afterwards to phrase the change in a human sentence.
 */
export function retargetNextMeal(
  program: Program,
  day: ProgramDay
): { slot: MealSlot; kcal: number; carbs: number; reason: string | null } | null {
  const slot = nextSlot(day);
  if (!slot) return null;
  const planned = day.meals.find((m) => m.slot === slot);
  if (!planned) return null;

  const budget = todayBudget(program.targets);
  const mealsLeft = MEAL_SLOTS.filter(
    (s) => !day.meals.find((m) => m.slot === s)?.eatenAt
  ).length;

  const glucose = latestGlucoseToday();
  const { profile } = useAppStore.getState();

  const out = adaptMeal({
    plannedKcal: planned.kcal,
    plannedCarbs: planned.carbs,
    budget,
    mealsLeft,
    glucose,
    targetHigh: profile?.target_high,
  });
  return { slot, kcal: out.kcal, carbs: out.carbs, reason: out.reason };
}

/** Most recent glucose reading logged today, if any. */
function latestGlucoseToday(): number | null {
  const { glucoseLogs } = useAppStore.getState();
  const today = new Date().toDateString();
  const hit = glucoseLogs.find((g) => new Date(g.created_at).toDateString() === today);
  return hit?.value ?? null;
}

/* ── Turning an AI dish into real numbers ────────────────────── */

/**
 * Look every ingredient up in the nutrition databases and replace whatever
 * the model guessed with the aggregated truth.
 *
 * Ingredients that no database recognises are kept in the dish (the patient
 * still eats them) but they contribute nothing, and `resolved` goes false so
 * the UI can say the figure is partial rather than pretend precision.
 */
export async function resolveMealMacros(meal: PlannedMeal): Promise<PlannedMeal> {
  if (!meal.ingredients?.length) return { ...meal, resolved: false };

  const items = await Promise.all(
    meal.ingredients.map((ing) =>
      resolveFood({
        name: ing.name,
        search_name: ing.search_name || ing.name,
        portion_grams: ing.grams,
      } as any).catch(() => null)
    )
  );

  const found = items.filter((i): i is NonNullable<typeof i> => i != null);
  if (!found.length) return { ...meal, resolved: false };

  const agg = aggregateItems(found);
  return {
    ...meal,
    kcal: Math.round(agg.calories),
    carbs: Math.round(agg.carbohydrates),
    sugar: Math.round(agg.sugar),
    protein: Math.round(agg.protein),
    fat: Math.round(agg.fat),
    fiber: Math.round(agg.fiber),
    gi: agg.glycemic_index ?? null,
    // Kept so "I ate it" can file the real per-ingredient breakdown later
    // without going back to the databases.
    items: found,
    // Partial when some ingredients could not be matched.
    resolved: found.length === meal.ingredients.length,
  };
}

/* ── Eating a planned meal ───────────────────────────────────
 *
 * The whole point of the program is that it MOVES with the patient. A meal
 * the patient confirms has to land in the same journal a scanned plate
 * lands in — otherwise the day's budget never changes, the home screen
 * disagrees with the coach, and the bolus advisor never learns the meal
 * happened. So confirming a meal writes a real `meal_scans` entry, filed
 * under its slot (breakfast / lunch / snack / dinner).
 */

/** The plate as it will be journalled, scaled to the portion really eaten. */
export function plannedMealResult(meal: PlannedMeal, portion = 1): NutritionResult {
  const p = Math.max(0.1, Math.min(3, portion || 1));

  // Preferred path: the database-backed ingredient rows. Re-aggregating them
  // gives the meal a scan's full anatomy — per-item breakdown, glycemic load,
  // meal score, honest source labels.
  if (meal.items?.length) {
    const scaled =
      p === 1
        ? meal.items
        : meal.items.map((it) => rescaleItem(it, it.portion_grams * p));
    const agg = aggregateItems(scaled);
    return {
      ...agg,
      food_name: meal.title,
      estimated_portion:
        p === 1 ? agg.estimated_portion : `${formatPortion(p)} · ${agg.estimated_portion}`,
    };
  }

  // Nothing matched in the databases: keep the coach's own estimate rather
  // than log a zero, and say plainly that it IS an estimate.
  const r = (v: number) => Math.round((v || 0) * p);
  return {
    food_name: meal.title,
    estimated_portion: formatPortion(p),
    calories: r(meal.kcal),
    carbohydrates: r(meal.carbs),
    sugar: r(meal.sugar),
    protein: r(meal.protein),
    fat: r(meal.fat),
    fiber: r(meal.fiber),
    glycemic_index: meal.gi ?? 50,
    confidence: 0.6,
    nutrition_confidence: 0.4,
    source: 'ai_estimate',
    warnings: ['warn:ai_estimate'],
  };
}

function formatPortion(p: number): string {
  if (p === 1) return '1 portion';
  if (p === 0.5) return '½ portion';
  if (p === 1.5) return '1½ portion';
  return `${Math.round(p * 100)} %`;
}

/**
 * File a planned meal in the journal. Returns the entry so the program day
 * can remember which one it created (and undo it later).
 */
export async function logPlannedMeal(
  meal: PlannedMeal,
  portion = 1
): Promise<MealScan | null> {
  try {
    return await saveMeal(
      plannedMealResult(meal, portion),
      undefined,
      undefined,
      undefined,
      // The slots and the journal's meal types are the same four words, so a
      // program breakfast files itself under breakfast with no mapping.
      meal.slot as MealType
    );
  } catch {
    return null;
  }
}

/* ── The day lifecycle ───────────────────────────────────────
 *
 * A program advances day by day, and ONLY the patient advances it. Tomorrow
 * does not exist until today is finished and closed — that is what makes it
 * a parcours instead of a menu you can read to the end on the first evening.
 */

export interface DayProgress {
  mealsDone: number;
  mealsTotal: number;
  /** False on a rest day: nothing to do, nothing to tick. */
  workoutRequired: boolean;
  workoutDone: boolean;
  /** 0…1 — what the calendar ring draws. */
  ratio: number;
  /** Everything on the day is done: the congratulation is earned. */
  complete: boolean;
  /** The patient closed the day, which unlocked the next one. */
  confirmed: boolean;
}

export function dayProgress(day: ProgramDay | null): DayProgress {
  if (!day) {
    return {
      mealsDone: 0,
      mealsTotal: 0,
      workoutRequired: false,
      workoutDone: false,
      ratio: 0,
      complete: false,
      confirmed: false,
    };
  }
  const mealsTotal = day.meals.length;
  const mealsDone = day.meals.filter((m) => m.eatenAt).length;
  const workoutRequired = !!day.workoutId;
  const workoutDone = !!day.workoutDoneAt;

  // The workout counts as one more "task" of the day, so a patient who ate
  // everything but skipped the session is not shown a full ring.
  const total = mealsTotal + (workoutRequired ? 1 : 0);
  const done = mealsDone + (workoutRequired && workoutDone ? 1 : 0);

  return {
    mealsDone,
    mealsTotal,
    workoutRequired,
    workoutDone,
    ratio: total > 0 ? done / total : 0,
    complete: total > 0 && done >= total,
    confirmed: !!day.confirmedAt,
  };
}

/** Sorted oldest → newest; the store keeps them that way, this is a guard. */
function byDate(days: ProgramDay[]): ProgramDay[] {
  return [...days].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * The day the patient is living right now: the oldest one they have not
 * closed. If every day is closed there is no current day — the next one is
 * waiting to be generated.
 */
export function currentDay(days: ProgramDay[]): ProgramDay | null {
  return byDate(days).find((d) => !d.confirmedAt) ?? null;
}

/** The most recently planned day, whatever its state. */
export function lastDay(days: ProgramDay[]): ProgramDay | null {
  const all = byDate(days);
  return all[all.length - 1] ?? null;
}

/**
 * The date the NEXT day should carry.
 *
 * Tomorrow relative to the day just closed — but never a date in the past.
 * Someone who closes Monday's program on Thursday gets Thursday, not a
 * Tuesday that never happened.
 */
export function nextDayDate(days: ProgramDay[]): string {
  const today = isoDay(new Date());
  const last = lastDay(days);
  if (!last) return today;
  const d = new Date(`${last.date}T12:00:00`);
  d.setDate(d.getDate() + 1);
  const after = isoDay(d);
  return after > today ? after : today;
}

/** Local calendar date as YYYY-MM-DD (never UTC — that shifts the day). */
export function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* ── AI generation ──────────────────────────────────────────── */

/** Why a generation attempt failed, so the screen can say something true
 *  instead of blaming the network. */
export type GenerateError = 'offline' | 'ai' | 'quota' | 'unknown';

/**
 * The coach's memory of the parcours so far, one line per day.
 *
 * Not just the dish names: what was actually EATEN, what was skipped, and
 * which session was trained. A planner that only sees titles repeats the
 * same three proteins; one that sees the patient skipped every breakfast
 * writes a different breakfast.
 */
function planHistory(history: ProgramDay[]): string[] {
  const days = byDate(history).slice(-14);
  const lines = days.map((d) => {
    const meals = d.meals
      .map((m) => `${m.slot} "${m.title}" ${m.carbs}g${m.eatenAt ? ' ✓eaten' : ' ✗not eaten'}`)
      .join(' | ');
    const session = d.workoutId ? getSession(d.workoutId) : null;
    const sport = session
      ? `training: ${session.title_en} (${session.focus}, ${session.minutes}min)${d.workoutDoneAt ? ' ✓done' : ' ✗not done'}`
      : 'rest day';
    return `${d.date} (day ${d.dayIndex + 1}) — ${meals} || ${sport}`;
  });

  // The ingredients already leaned on, so the model can deliberately reach
  // for something else instead of rediscovering chicken every day.
  const used = new Map<string, number>();
  for (const d of days) {
    for (const m of d.meals) {
      for (const ing of m.ingredients ?? []) {
        const k = (ing.search_name || ing.name || '').toLowerCase().trim();
        if (k) used.set(k, (used.get(k) ?? 0) + 1);
      }
    }
  }
  const top = [...used.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, n]) => `${k} ×${n}`);
  if (top.length) {
    lines.push(
      `ALREADY USED MOST OFTEN (deliberately pick OTHER proteins, grains and ` +
        `vegetables today): ${top.join(', ')}`
    );
  }
  return lines;
}

/**
 * The clinical instructions that travel with the patient context. The edge
 * function's prompt covers the budget and the "invent, never pick" rule;
 * this is what the FOOD has to respect for someone who injects insulin.
 */
function plannerSafetyBrief(program: Program): string {
  const capPerMeal = program.targets.carbsPerMeal;
  return [
    'RULES FOR THIS PLAN (the patient injects insulin — the carbohydrates you',
    'compose become an insulin dose, so treat them as a prescription):',
    `- Land each meal on its carb budget: ${JSON.stringify(capPerMeal)} g.`,
    '  A meal that overshoots its budget silently makes their bolus wrong.',
    '- Spread the carbohydrate across the day. Never stack a large share on',
    '  one meal, whatever the daily total allows.',
    '- Prefer low-glycemic, high-fibre sources (whole grains, legumes,',
    '  vegetables). Keep FREE SUGARS near zero: no sugary drinks, no syrup,',
    '  no confectionery, no fruit juice — whole fruit only, and never more',
    '  than one portion at a time.',
    '- If the context above shows glucose running high, or a hypo, lean the',
    '  day on protein, vegetables and slow carbs rather than raising carbs.',
    '- Vary constantly: no dish, and no main protein, twice in three days.',
  ].join('\n');
}

/**
 * Compose ONE day from scratch for THIS patient.
 *
 * Day by day, never a whole week in one call. Asking for seven days at once
 * overran the model's output limit, the JSON came back cut in half and the
 * whole plan was lost — a single day is small, fast, and if it ever fails
 * the patient loses one day instead of the week.
 *
 * The model is handed the days already planned so it keeps continuity and
 * stops repeating itself. The budget comes from the engine; the food is its
 * own; and the macros are re-priced from the food databases afterwards,
 * because those carb grams end up in an insulin dose.
 */
export async function generateDay(args: {
  program: Program;
  date: Date;
  dayIndex: number;
  /** Days already composed — the model's memory of the plan so far. */
  history: ProgramDay[];
  language: string;
}): Promise<{ day: ProgramDay } | { error: GenerateError }> {
  if (isDemoMode || !supabase) return { error: 'offline' };
  const { program, date, dayIndex, history, language } = args;
  const iso = isoDay(date);

  try {
    const { data, error } = await supabase.functions.invoke('ai-chat', {
      body: {
        mode: 'program_plan',
        language,
        program: {
          goal: program.goal,
          weeks: program.weeks,
          startWeight: program.startWeight,
          targetWeight: program.targetWeight,
          trainingPlace: program.trainingPlace,
          trainingDaysPerWeek: program.trainingDaysPerWeek,
          constraints: program.constraints,
          // The budget is NOT negotiable — the model composes inside it.
          targets: {
            dailyKcal: program.targets.dailyKcal,
            carbsG: program.targets.carbsG,
            proteinG: program.targets.proteinG,
            fatG: program.targets.fatG,
            carbsPerMeal: program.targets.carbsPerMeal,
            kcalPerMeal: program.targets.kcalPerMeal,
          },
        },
        date: iso,
        dayIndex,
        history: planHistory(history),
        // Everything the app knows clinically: insulin plan and per-meal
        // ratios, today's and the week's glucose, doses already taken, meals
        // logged. The planner composes carbs that turn into boluses, so it
        // must see the same picture the bolus advisor sees.
        healthData: `${buildHealthContext()}\n\n${plannerSafetyBrief(program)}`,
      },
    });

    if (error) {
      const msg = String((error as { message?: string }).message ?? '');
      return { error: /quota|limit|429/i.test(msg) ? 'quota' : 'ai' };
    }
    const meals = data?.result?.meals;
    if (!Array.isArray(meals) || meals.length === 0) return { error: 'ai' };

    const priced = await Promise.all(
      meals.map((m: PlannedMeal) => resolveMealMacros({ ...m, resolved: false }))
    );

    return {
      day: {
        date: iso,
        dayIndex,
        meals: priced,
        // The session is OURS to decide: the patient asked for N days a week
        // and that promise must not depend on the model remembering it.
        workoutId: workoutForDay(program, dayIndex),
        status: 'planned',
      },
    };
  } catch {
    return { error: 'unknown' };
  }
}

/**
 * Which session this day of the program gets, or null on a rest day.
 * Chosen from the curated library by the patient's place and experience —
 * never invented, never a URL from the model.
 */
export function workoutForDay(program: Program, dayIndex: number): string | null {
  if (!isTrainingDay(dayIndex, program.trainingDaysPerWeek)) return null;
  const level: WorkoutLevel =
    program.activityLevel === 'sedentary' || program.activityLevel === 'light'
      ? 'beginner'
      : 'intermediate';
  const place = program.trainingPlace === 'mixed' ? 'mixed' : program.trainingPlace;
  const options = pickSessions(place, level);
  if (!options.length) return null;

  // Round-robin over the SESSIONS ALREADY TRAINED, not over the calendar.
  // Counting raw days made the rotation land on the same session twice in a
  // row whenever the rest days fell unevenly — the patient trains three
  // times a week and deserves three different sessions.
  let trained = 0;
  for (let i = 0; i < dayIndex; i += 1) {
    if (isTrainingDay(i, program.trainingDaysPerWeek)) trained += 1;
  }
  return options[trained % options.length].id;
}

/* ── Persistence ────────────────────────────────────────────── */

/** Insert the program row and return it with its server id. */
export async function saveProgram(p: Omit<Program, 'id'>): Promise<Program | null> {
  if (isDemoMode || !supabase) return { ...p, id: 'local' };
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return null;

  // Only one program may be active at a time (a second live budget would
  // contradict the first), so starting a new one retires the old one rather
  // than failing on the unique index.
  await supabase
    .from('programs')
    .update({ status: 'abandoned' })
    .eq('user_id', uid)
    .eq('status', 'active');

  const { data, error } = await supabase
    .from('programs')
    .insert({
      user_id: uid,
      goal: p.goal,
      status: 'active',
      start_date: p.startDate,
      weeks: p.weeks,
      start_weight: p.startWeight,
      target_weight: p.targetWeight,
      activity_level: p.activityLevel,
      training_days_per_week: p.trainingDaysPerWeek,
      training_place: p.trainingPlace,
      bmr: p.targets.bmr,
      tdee: p.targets.tdee,
      daily_kcal: p.targets.dailyKcal,
      protein_g: p.targets.proteinG,
      fat_g: p.targets.fatG,
      carbs_g: p.targets.carbsG,
      carbs_per_meal: p.targets.carbsPerMeal,
      rate_per_week: p.targets.ratePerWeek,
      warnings: p.targets.warnings,
      constraints: p.constraints,
    })
    .select('id')
    .single();

  if (error || !data) return null;
  return { ...p, id: data.id as string };
}

/** Store a generated stretch of days. */
export async function saveDays(programId: string, days: ProgramDay[]): Promise<boolean> {
  if (isDemoMode || !supabase || programId === 'local') return true;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return false;

  const rows = days.map((d) => ({
    program_id: programId,
    user_id: uid,
    date: d.date,
    day_index: d.dayIndex,
    meals: d.meals,
    // The workout column also carries how the day ENDED — done and closed —
    // because that is what decides whether the next day may be written.
    workout: {
      sessionId: d.workoutId ?? null,
      doneAt: d.workoutDoneAt ?? null,
      confirmedAt: d.confirmedAt ?? null,
    },
    status: d.status,
  }));
  const { error } = await supabase.from('program_days').upsert(rows, {
    onConflict: 'program_id,date',
  });
  return !error;
}

/**
 * Read the live program and every day of it back from the server.
 *
 * Without this the parcours only ever existed in this phone's local storage:
 * reinstall the app, change device, and a month of history was gone. The
 * store stays the source of truth for the session; this rehydrates it.
 */
export async function loadProgram(): Promise<{ program: Program; days: ProgramDay[] } | null> {
  if (isDemoMode || !supabase) return null;
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return null;

  const { data: row, error } = await supabase
    .from('programs')
    .select('*')
    .eq('user_id', uid)
    .eq('status', 'active')
    .maybeSingle();
  if (error || !row) return null;

  const targets = computeProgramTargets({
    profile: useAppStore.getState().profile,
    goal: row.goal,
    targetWeight: row.target_weight,
    ratePerWeek: row.rate_per_week,
    activityLevel: row.activity_level,
    trainingDaysPerWeek: row.training_days_per_week,
  });

  const program: Program = {
    id: row.id,
    goal: row.goal,
    status: row.status,
    startDate: row.start_date,
    weeks: row.weeks,
    startWeight: row.start_weight,
    targetWeight: row.target_weight,
    activityLevel: row.activity_level,
    trainingDaysPerWeek: row.training_days_per_week,
    trainingPlace: row.training_place,
    // The stored targets are the ones the patient signed up to and the ones
    // a doctor would read on the row — they win over a fresh computation,
    // which would drift as the profile changes.
    targets: {
      ...targets,
      bmr: row.bmr ?? targets.bmr,
      tdee: row.tdee ?? targets.tdee,
      dailyKcal: row.daily_kcal ?? targets.dailyKcal,
      proteinG: row.protein_g ?? targets.proteinG,
      fatG: row.fat_g ?? targets.fatG,
      carbsG: row.carbs_g ?? targets.carbsG,
      carbsPerMeal: row.carbs_per_meal ?? targets.carbsPerMeal,
      ratePerWeek: row.rate_per_week ?? targets.ratePerWeek,
      warnings: row.warnings ?? targets.warnings,
    },
    constraints: { ...DEFAULT_CONSTRAINTS, ...(row.constraints ?? {}) },
  };

  const { data: dayRows } = await supabase
    .from('program_days')
    .select('*')
    .eq('program_id', row.id)
    .order('date', { ascending: true });

  const days: ProgramDay[] = (dayRows ?? []).map((d: Record<string, any>) => ({
    date: String(d.date).slice(0, 10),
    dayIndex: d.day_index,
    meals: Array.isArray(d.meals) ? d.meals : [],
    workoutId: d.workout?.sessionId ?? null,
    workoutDoneAt: d.workout?.doneAt ?? null,
    confirmedAt: d.workout?.confirmedAt ?? null,
    status: d.status,
    adaptationNote: d.adaptation_note ?? null,
  }));

  return { program, days };
}

/**
 * Reconcile the server's copy of the parcours with what this phone did.
 *
 * The patient can tick a meal on a plane and the write never leaves the
 * device, so the server is not automatically right. For each date we keep
 * the version that got FURTHER — a closed day beats an open one, more
 * meals eaten beats fewer — and never lose a day that only one side has.
 */
export function mergeDays(local: ProgramDay[], remote: ProgramDay[]): ProgramDay[] {
  const out = new Map<string, ProgramDay>();
  for (const d of remote) out.set(d.date, d);
  for (const d of local) {
    const other = out.get(d.date);
    out.set(d.date, other ? (aheadOf(d, other) ? d : other) : d);
  }
  return byDate([...out.values()]);
}

/** Is `a` further along than `b`? */
function aheadOf(a: ProgramDay, b: ProgramDay): boolean {
  const pa = dayProgress(a);
  const pb = dayProgress(b);
  if (pa.confirmed !== pb.confirmed) return pa.confirmed;
  if (pa.mealsDone !== pb.mealsDone) return pa.mealsDone > pb.mealsDone;
  if (pa.workoutDone !== pb.workoutDone) return pa.workoutDone;
  return false;
}
