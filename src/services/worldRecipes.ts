import {
  catalogIndex,
  dishName,
  filterCatalog,
  getDish,
  type Moment,
  type WorldDish,
} from '@/data/worldDishes';
import { WORLD_DISH_IMAGES } from '@/data/worldDishImages';
import { isDemoMode, supabase } from '@/lib/supabase';
import { buildHealthContext } from '@/services/ai';
import { buildAIDayJournal } from '@/services/dayLog';

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
  /** Set when the dish comes from the local catalog (a "ready" card). */
  dishId?: string;
  /** True → shown with a "ready" badge (catalog, real photo & data). */
  ready?: boolean;
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

/** Only TheMealDB thumbnails accept a size suffix (/large for HD). Wikimedia
 *  URLs are already full-resolution and must be returned untouched — adding
 *  a suffix would break them. */
export function recipeImage(
  thumb: string,
  size: 'small' | 'medium' | 'large' = 'large'
): string {
  if (!thumb || !thumb.includes('themealdb.com')) return thumb;
  return /\/(small|medium|large)$/.test(thumb) ? thumb : `${thumb}/${size}`;
}

/** Map a local catalog dish → a suggestion card (ready, real photo). */
function catalogToSuggestion(d: WorldDish, lang: string): DishSuggestion {
  const img = WORLD_DISH_IMAGES[d.id];
  return {
    name: dishName(d, lang),
    note: '',
    image: img?.thumb ?? '',
    mealId: '',
    dishId: d.id,
    ready: true,
  };
}

/**
 * Browse dishes for a country + meal moment. Reads the LOCAL catalog
 * first (zero AI tokens) and only falls back to an AI suggestion when the
 * catalog is thin for that country. This is what keeps the rubric cheap.
 */
export async function browseDishes(
  country: string,
  moment: 'any' | Moment,
  lang: string
): Promise<{ dishes: DishSuggestion[]; fromCatalog: boolean }> {
  const local = filterCatalog(country, moment).map((d) => catalogToSuggestion(d, lang));
  if (local.length >= 4) return { dishes: local, fromCatalog: true };

  // Thin catalog for this country/moment → ask the AI, and prepend any
  // local matches we do have.
  const ai = await suggestDishes({ country, moment: moment === 'any' ? 'any' : moment });
  const aiDishes = ai?.dishes ?? [];
  return { dishes: [...local, ...aiDishes], fromCatalog: local.length > 0 && !aiDishes.length };
}

/**
 * Ask the AI to recommend dishes. Pass `country` + `moment` for a direct
 * browse, or `messages` for the conversational recommender (the AI asks
 * about allergies/dislikes before it recommends). Health context is
 * attached automatically so recommendations fit the patient.
 */
export async function suggestDishes(
  opts: {
    country?: string;
    moment?: MealMoment;
    messages?: { role: 'user' | 'assistant'; content: string }[];
  },
  lang = 'fr'
): Promise<SuggestResult | null> {
  if (isDemoMode || !supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('world-recipes', {
      body: {
        action: 'suggest',
        country: opts.country ?? '',
        moment: opts.moment ?? 'any',
        messages: opts.messages ?? [],
        // Same personalization the insulin-dose AI uses: the health
        // snapshot PLUS the full today+yesterday journal (meals already
        // eaten, sugar so far, insulin taken, glucose trend, sport).
        healthData: buildHealthContext(),
        dayJournal: buildAIDayJournal(),
        // Send the catalog so the AI recommends READY dishes first (cheap).
        catalog: catalogIndex(opts.country || undefined),
      },
    });
    if (error || data?.error) return null;
    const r = data?.result ?? {};
    const dishes: DishSuggestion[] = (Array.isArray(r.dishes) ? r.dishes : []).map(
      (d: any) => {
        const cat = d.id ? getDish(String(d.id)) : null;
        const catImg = cat ? WORLD_DISH_IMAGES[cat.id] : undefined;
        return {
          name: cat ? dishName(cat, lang) : String(d.name ?? ''),
          note: String(d.note ?? ''),
          // Prefer the catalog's own (correct, dish-specific) photo.
          image: catImg?.thumb || String(d.image ?? ''),
          mealId: '',
          dishId: cat?.id,
          ready: !!cat,
        };
      }
    );
    return {
      reply: typeof r.reply === 'string' ? r.reply : '',
      ready: r.ready !== false,
      question: typeof r.question === 'string' ? r.question : '',
      dishes,
    };
  } catch {
    return null;
  }
}

/** Full recipe by dish name — the AI writes an authentic recipe (nutrition,
 *  translated steps, diabetes advice). `image` (the card's correct
 *  dish-specific photo) is reused as the hero so it always matches. */
export async function recipeDetail(
  opts: { name: string; search?: string; image?: string },
  lang: string
): Promise<RecipeDetail | null> {
  if (isDemoMode || !supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('world-recipes', {
      body: {
        action: 'detail',
        name: opts.name,
        search: opts.search ?? '',
        image: opts.image ?? '',
        lang,
      },
    });
    if (error || data?.error) return null;
    return (data?.result as RecipeDetail) ?? null;
  } catch {
    return null;
  }
}

/** English search term for a catalog dish (for detail image resolution). */
export function catalogSearch(dishId?: string): string {
  if (!dishId) return '';
  const d = getDish(dishId);
  return d?.search ?? '';
}
