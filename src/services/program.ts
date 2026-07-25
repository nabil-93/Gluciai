import { pickSessions, type WorkoutLevel } from '@/data/workouts';
import { isDemoMode, supabase } from '@/lib/supabase';
import { buildDayEvents, dayTotals } from '@/services/dayLog';
import { aggregateItems, resolveFood } from '@/services/nutrition/engine';
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
import type { Profile } from '@/types';

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
  /** Set once the patient confirms they ate it. */
  eatenAt?: string | null;
}

export interface ProgramDay {
  date: string;
  dayIndex: number;
  meals: PlannedMeal[];
  workoutId?: string | null;
  status: 'planned' | 'partial' | 'done' | 'skipped';
  adaptationNote?: string | null;
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
  const events = buildDayEvents(new Date());
  const tot = dayTotals(events);
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
    // Partial when some ingredients could not be matched.
    resolved: found.length === meal.ingredients.length,
  };
}

/* ── AI generation ──────────────────────────────────────────── */

/** Why a generation attempt failed, so the screen can say something true
 *  instead of blaming the network. */
export type GenerateError = 'offline' | 'ai' | 'quota' | 'unknown';

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
  const iso = date.toISOString().slice(0, 10);

  // Only what the model needs to avoid repeating: the dishes it already
  // served, most recent first. Cheap to send, and it is the whole memory.
  const alreadyServed = history
    .slice(-7)
    .map((d) => `${d.date}: ${d.meals.map((m) => m.title).join(' · ')}`);

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
        history: alreadyServed,
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
  // Rotate through what fits so the week is not the same session three times.
  return options[Math.floor(dayIndex / 1) % options.length].id;
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
    workout: d.workoutId ? { sessionId: d.workoutId } : null,
    status: d.status,
  }));
  const { error } = await supabase.from('program_days').upsert(rows, {
    onConflict: 'program_id,date',
  });
  return !error;
}
