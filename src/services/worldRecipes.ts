import { isDemoMode, supabase } from '@/lib/supabase';
import { buildHealthContext } from '@/services/ai';

/* ────────────────────────────────────────────────────────────
 * WORLD RECIPES — AI-driven. The assistant knows the patient and
 * recommends dishes eaten in a chosen country for a chosen meal
 * moment (diabetes-appropriate). Every dish gets a real photo when
 * one exists; its full recipe (nutrition, translated steps, advice)
 * is generated on demand and cached. All calls go through the
 * `world-recipes` edge function.
 * ──────────────────────────────────────────────────────────── */

export type RecipeRating = 'ok' | 'warn' | 'danger';
export type MealMoment = 'any' | 'breakfast' | 'lunch' | 'dinner' | 'snack';

export interface DishSuggestion {
  name: string;
  note: string;
  image: string;
  /** TheMealDB id when the dish exists there (richer detail). */
  mealId: string;
}

export interface SuggestResult {
  reply: string;
  ready: boolean;
  question: string;
  dishes: DishSuggestion[];
}

export interface RecipeDetail {
  id: string;
  name: string;
  thumb: string;
  area: string;
  category: string;
  youtube: string;
  ingredients: string[];
  enriched?: boolean;
  title?: string;
  servings?: number;
  gi?: number;
  rating?: RecipeRating;
  advice?: string;
  per_serving?: {
    calories: number;
    carbs: number;
    sugar: number;
    protein: number;
    fat: number;
    fiber: number;
  };
  steps?: string[];
}

/** Countries shown as chips. Morocco/Maghreb first (most patients). */
export const RECIPE_COUNTRIES: { key: string; emoji: string }[] = [
  { key: 'Morocco', emoji: '🇲🇦' },
  { key: 'Algeria', emoji: '🇩🇿' },
  { key: 'Tunisia', emoji: '🇹🇳' },
  { key: 'France', emoji: '🇫🇷' },
  { key: 'Italy', emoji: '🇮🇹' },
  { key: 'Spain', emoji: '🇪🇸' },
  { key: 'Turkey', emoji: '🇹🇷' },
  { key: 'Lebanon', emoji: '🇱🇧' },
  { key: 'Egypt', emoji: '🇪🇬' },
  { key: 'Greece', emoji: '🇬🇷' },
  { key: 'India', emoji: '🇮🇳' },
  { key: 'China', emoji: '🇨🇳' },
  { key: 'Japan', emoji: '🇯🇵' },
  { key: 'Thailand', emoji: '🇹🇭' },
  { key: 'Mexico', emoji: '🇲🇽' },
  { key: 'USA', emoji: '🇺🇸' },
];

export const MEAL_MOMENTS: MealMoment[] = ['any', 'breakfast', 'lunch', 'dinner', 'snack'];

/** TheMealDB thumbnails accept a size suffix — /large for HD. */
export function recipeImage(
  thumb: string,
  size: 'small' | 'medium' | 'large' = 'large'
): string {
  if (!thumb) return thumb;
  return /\/(small|medium|large)$/.test(thumb) ? thumb : `${thumb}/${size}`;
}

/**
 * Ask the AI to recommend dishes. Pass `country` + `moment` for a direct
 * browse, or `messages` for the conversational recommender (the AI asks
 * about allergies/dislikes before it recommends). Health context is
 * attached automatically so recommendations fit the patient.
 */
export async function suggestDishes(opts: {
  country?: string;
  moment?: MealMoment;
  messages?: { role: 'user' | 'assistant'; content: string }[];
}): Promise<SuggestResult | null> {
  if (isDemoMode || !supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('world-recipes', {
      body: {
        action: 'suggest',
        country: opts.country ?? '',
        moment: opts.moment ?? 'any',
        messages: opts.messages ?? [],
        healthData: buildHealthContext(),
      },
    });
    if (error || data?.error) return null;
    const r = data?.result ?? {};
    return {
      reply: typeof r.reply === 'string' ? r.reply : '',
      ready: r.ready !== false,
      question: typeof r.question === 'string' ? r.question : '',
      dishes: Array.isArray(r.dishes) ? r.dishes : [],
    };
  } catch {
    return null;
  }
}

/** Full recipe by TheMealDB id OR by dish name (AI-generated if unknown). */
export async function recipeDetail(
  opts: { mealId?: string; name?: string },
  lang: string
): Promise<RecipeDetail | null> {
  if (isDemoMode || !supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('world-recipes', {
      body: {
        action: 'detail',
        mealId: opts.mealId ?? '',
        name: opts.name ?? '',
        lang,
      },
    });
    if (error || data?.error) return null;
    return (data?.result as RecipeDetail) ?? null;
  } catch {
    return null;
  }
}
