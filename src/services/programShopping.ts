import { isDemoMode, supabase } from '@/lib/supabase';
import {
  generateDay,
  isoDay,
  type GenerateError,
  type PlannedMeal,
  type Program,
  type ProgramDay,
} from '@/services/program';
import type { FoodCategory } from '@/types';

/* ────────────────────────────────────────────────────────────
 * THE WEEK'S SHOPPING — and the larder it becomes.
 *
 * A parcours you discover one day at a time cannot ask you to shop one day
 * at a time: nobody buys 180 g of lentils on a Tuesday evening. So the week
 * is written ahead — seven days, one call each, exactly the way a single day
 * has always been written — and the shopping list is the SUM of those days'
 * real ingredients. The app then reveals the days one by one.
 *
 * That is the trick, and it is worth naming: the coach knows the week, the
 * patient knows only the shopping. Nothing about tomorrow's dish leaks out
 * of a line that says "600 g chicken breast".
 *
 * What is left of an item is never stored. It is derived from the meals the
 * patient actually confirmed eating, so the larder cannot drift away from
 * the journal — and cannot claim they ate something they never ticked.
 * ──────────────────────────────────────────────────────────── */

export interface ShoppingItem {
  /** Generic English search name — the key meal ingredients carry too. */
  key: string;
  /** What the patient reads, in their language. */
  name: string;
  category?: FoodCategory | null;
  /** The week's total, rounded up to something you can ask for in a shop. */
  grams: number;
  /** Ticked in the shop, one line at a time. */
  bought: boolean;
}

export interface ShoppingWeek {
  id: string;
  weekIndex: number;
  startDate: string;
  endDate: string;
  /** The day to go and buy it. */
  shopDate: string;
  status: 'planned' | 'stocked' | 'done';
  items: ShoppingItem[];
}

/** One line of the larder: bought, eaten so far, and what is left. */
export interface StockLine extends ShoppingItem {
  /** Grams drawn down by meals the patient confirmed eating. */
  used: number;
  left: number;
  /** 0…1 — how much of this line is gone. */
  ratio: number;
}

/* ── Building the list ───────────────────────────────────────── */

/** Shops sell round numbers: 265 g of lentils is 300 g in a bag. */
function roundUpForShopping(grams: number): number {
  if (grams <= 0) return 0;
  if (grams < 100) return Math.ceil(grams / 10) * 10;
  if (grams < 1000) return Math.ceil(grams / 50) * 50;
  return Math.ceil(grams / 100) * 100;
}

/** A stable key for an ingredient across days and languages. */
export function ingredientKey(ing: { name: string; search_name?: string }): string {
  return (ing.search_name || ing.name || '').toLowerCase().trim();
}

/**
 * Add up every ingredient of a stretch of days into one shopping list.
 *
 * The grams come from what the coach wrote, NOT from the resolved nutrition
 * rows: `items` holds only ingredients a database recognised, and an
 * ingredient no database knows is still an ingredient the patient has to
 * buy. Losing it from the list would send them home without the coriander.
 */
export function buildShoppingList(days: ProgramDay[]): ShoppingItem[] {
  const totals = new Map<string, { name: string; grams: number; category?: FoodCategory | null }>();

  for (const day of days) {
    for (const meal of day.meals) {
      for (const ing of meal.ingredients ?? []) {
        const key = ingredientKey(ing);
        if (!key || !(ing.grams > 0)) continue;
        const found = totals.get(key);
        if (found) {
          found.grams += ing.grams;
        } else {
          totals.set(key, {
            name: ing.name || key,
            grams: ing.grams,
            // The nutrition engine already sorted this ingredient into a food
            // family when it priced the meal — reuse it to group the aisles.
            category: categoryOf(meal, key),
          });
        }
      }
    }
  }

  return [...totals.entries()]
    .map(([key, v]) => ({
      key,
      name: v.name,
      category: v.category ?? null,
      grams: roundUpForShopping(v.grams),
      bought: false,
    }))
    .sort((a, b) => (a.category ?? '').localeCompare(b.category ?? '') || b.grams - a.grams);
}

function categoryOf(meal: PlannedMeal, key: string): FoodCategory | null {
  const hit = meal.items?.find(
    (it) => (it.search_name || it.name || '').toLowerCase().trim() === key
  );
  return hit?.category ?? null;
}

/* ── The larder ──────────────────────────────────────────────── */

/**
 * What is left of the week's shopping, line by line.
 *
 * Only meals the patient CONFIRMED eating draw the stock down, scaled by the
 * portion they said they had — half a plate takes half the ingredients. A
 * meal that is merely planned takes nothing: the food is still in the fridge.
 */
export function stockFor(week: ShoppingWeek, days: ProgramDay[]): StockLine[] {
  const used = new Map<string, number>();
  const inWeek = days.filter((d) => d.date >= week.startDate && d.date <= week.endDate);

  for (const day of inWeek) {
    for (const meal of day.meals) {
      if (!meal.eatenAt) continue;
      const portion = meal.portion ?? 1;
      for (const ing of meal.ingredients ?? []) {
        const key = ingredientKey(ing);
        if (!key) continue;
        used.set(key, (used.get(key) ?? 0) + (ing.grams || 0) * portion);
      }
    }
  }

  return week.items.map((it) => {
    const u = Math.round(used.get(it.key) ?? 0);
    const left = Math.max(0, it.grams - u);
    return { ...it, used: u, left, ratio: it.grams > 0 ? Math.min(1, u / it.grams) : 0 };
  });
}

/** What one day drew from the larder — the "here is what you took" detail. */
export function consumedOnDay(day: ProgramDay): { key: string; name: string; grams: number }[] {
  const out = new Map<string, { key: string; name: string; grams: number }>();
  for (const meal of day.meals) {
    if (!meal.eatenAt) continue;
    const portion = meal.portion ?? 1;
    for (const ing of meal.ingredients ?? []) {
      const key = ingredientKey(ing);
      if (!key) continue;
      const g = Math.round((ing.grams || 0) * portion);
      const found = out.get(key);
      if (found) found.grams += g;
      else out.set(key, { key, name: ing.name || key, grams: g });
    }
  }
  return [...out.values()].sort((a, b) => b.grams - a.grams);
}

/* ── Week boundaries ─────────────────────────────────────────── */

/** The calendar dates of week `weekIndex`, counted from the program start. */
export function weekBounds(
  program: Program,
  weekIndex: number
): { startDate: string; endDate: string; shopDate: string } {
  const start = new Date(`${program.startDate}T12:00:00`);
  start.setDate(start.getDate() + weekIndex * 7);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);

  // Shop the eve of the week — unless that eve is already behind us, in
  // which case the shopping day is today. Nobody can shop in the past.
  const eve = new Date(start);
  eve.setDate(eve.getDate() - 1);
  const today = isoDay(new Date());
  const shop = isoDay(eve) < today ? today : isoDay(eve);

  return { startDate: isoDay(start), endDate: isoDay(end), shopDate: shop };
}

/** Which week of the parcours a day index falls in. */
export function weekOf(dayIndex: number): number {
  return Math.floor(dayIndex / 7);
}

/* ── Writing a whole week ────────────────────────────────────── */

export interface WeekPlanProgress {
  /** Days written so far, 1…7. */
  done: number;
  total: number;
}

/**
 * Compose the seven days of a week, then the shopping list they imply.
 *
 * Deliberately seven separate calls rather than one big one: asking for a
 * week in a single request is what used to overrun the model's output limit
 * and lose the whole plan. Each day is handed the ones already written, so
 * the week still holds together and never repeats itself.
 */
export async function planWeek(args: {
  program: Program;
  weekIndex: number;
  /** Days already in the parcours — the coach's memory. */
  history: ProgramDay[];
  language: string;
  onProgress?: (p: WeekPlanProgress) => void;
}): Promise<{ days: ProgramDay[]; items: ShoppingItem[] } | { error: GenerateError }> {
  const { program, weekIndex, history, language, onProgress } = args;
  const { startDate } = weekBounds(program, weekIndex);

  const written: ProgramDay[] = [];
  let memory = [...history];

  for (let i = 0; i < 7; i += 1) {
    const date = new Date(`${startDate}T12:00:00`);
    date.setDate(date.getDate() + i);
    const dayIndex = weekIndex * 7 + i;

    const res = await generateDay({ program, date, dayIndex, history: memory, language });
    if ('error' in res) {
      // A week that is only partly written is worse than none: the shopping
      // list would be short and the patient would run out mid-week.
      return { error: res.error };
    }
    written.push(res.day);
    memory = [...memory, res.day];
    onProgress?.({ done: i + 1, total: 7 });
  }

  return { days: written, items: buildShoppingList(written) };
}

/* ── Persistence ─────────────────────────────────────────────── */

function mapRow(r: Record<string, any>): ShoppingWeek {
  return {
    id: r.id,
    weekIndex: r.week_index,
    startDate: String(r.start_date).slice(0, 10),
    endDate: String(r.end_date).slice(0, 10),
    shopDate: String(r.shop_date).slice(0, 10),
    status: r.status,
    items: Array.isArray(r.items) ? r.items : [],
  };
}

export async function saveShoppingWeek(
  programId: string,
  week: Omit<ShoppingWeek, 'id'>
): Promise<ShoppingWeek | null> {
  if (isDemoMode || !supabase || programId === 'local') {
    return { ...week, id: `local-${week.weekIndex}` };
  }
  const { data: auth } = await supabase.auth.getUser();
  const uid = auth?.user?.id;
  if (!uid) return null;

  const { data, error } = await supabase
    .from('program_shopping')
    .upsert(
      {
        program_id: programId,
        user_id: uid,
        week_index: week.weekIndex,
        start_date: week.startDate,
        end_date: week.endDate,
        shop_date: week.shopDate,
        status: week.status,
        items: week.items,
      },
      { onConflict: 'program_id,week_index' }
    )
    .select('*')
    .single();

  if (error || !data) return null;
  return mapRow(data);
}

export async function loadShoppingWeeks(programId: string): Promise<ShoppingWeek[]> {
  if (isDemoMode || !supabase || programId === 'local') return [];
  const { data, error } = await supabase
    .from('program_shopping')
    .select('*')
    .eq('program_id', programId)
    .order('week_index', { ascending: true });
  if (error || !data) return [];
  return data.map(mapRow);
}
