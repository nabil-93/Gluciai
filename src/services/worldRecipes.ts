import { isDemoMode, supabase } from '@/lib/supabase';

/* ────────────────────────────────────────────────────────────
 * WORLD RECIPES — ready-made international dishes with big photos
 * (TheMealDB), enriched by Gemini with per-serving nutrition, a
 * diabetes rating + advice, and steps translated to the patient's
 * language. All fetches go through the `world-recipes` edge function
 * (server-side proxy + shared AI cache).
 * ──────────────────────────────────────────────────────────── */

export type RecipeRating = 'ok' | 'warn' | 'danger';

export interface RecipeSummary {
  id: string;
  name: string;
  thumb: string;
  area?: string;
  category?: string;
}

export interface RecipeDetail {
  id: string;
  name: string;
  thumb: string;
  area: string;
  category: string;
  youtube: string;
  ingredients: string[];
  /** True once Gemini enrichment succeeded. */
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

/** Cuisines shown as filter chips (TheMealDB areas). */
export const RECIPE_CUISINES: { area: string; emoji: string }[] = [
  { area: 'Moroccan', emoji: '🇲🇦' },
  { area: 'Italian', emoji: '🇮🇹' },
  { area: 'French', emoji: '🇫🇷' },
  { area: 'Spanish', emoji: '🇪🇸' },
  { area: 'Turkish', emoji: '🇹🇷' },
  { area: 'Egyptian', emoji: '🇪🇬' },
  { area: 'Tunisian', emoji: '🇹🇳' },
  { area: 'Greek', emoji: '🇬🇷' },
  { area: 'Indian', emoji: '🇮🇳' },
  { area: 'Chinese', emoji: '🇨🇳' },
  { area: 'Japanese', emoji: '🇯🇵' },
  { area: 'Thai', emoji: '🇹🇭' },
  { area: 'Mexican', emoji: '🇲🇽' },
  { area: 'American', emoji: '🇺🇸' },
  { area: 'British', emoji: '🇬🇧' },
];

/** TheMealDB thumbnails accept a size suffix — /large for HD grids. */
export function recipeImage(
  thumb: string,
  size: 'small' | 'medium' | 'large' = 'large'
): string {
  if (!thumb) return thumb;
  return /\/(small|medium|large)$/.test(thumb) ? thumb : `${thumb}/${size}`;
}

/** Browse recipes by cuisine or free-text search (min 2 chars). */
export async function browseRecipes(opts: {
  area?: string;
  query?: string;
}): Promise<RecipeSummary[]> {
  if (isDemoMode || !supabase) return [];
  try {
    const { data, error } = await supabase.functions.invoke('world-recipes', {
      body: {
        action: 'browse',
        area: opts.query ? '' : opts.area ?? '',
        query: opts.query ?? '',
      },
    });
    if (error || data?.error) return [];
    return Array.isArray(data?.result?.items) ? data.result.items : [];
  } catch {
    return [];
  }
}

/** Full recipe with AI enrichment (nutrition, translated steps, advice). */
export async function recipeDetail(
  mealId: string,
  lang: string
): Promise<RecipeDetail | null> {
  if (isDemoMode || !supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('world-recipes', {
      body: { action: 'detail', mealId, lang },
    });
    if (error || data?.error) return null;
    return (data?.result as RecipeDetail) ?? null;
  } catch {
    return null;
  }
}
