import { isDemoMode, supabase } from '@/lib/supabase';

/**
 * WORLD FOOD DATABASE — Open Food Facts search (millions of products,
 * crowd-sourced, no API key) with REAL photos and per-100 g nutrition.
 * Powers the "🌍 Base mondiale" tab of the healthy-foods screen.
 *
 * Every result gets a diabetes-friendliness rating computed from its
 * sugars / carbs / fiber per 100 g — a quick visual guide, not a
 * medical verdict.
 */

export type DiabetesRating = 'ok' | 'warn' | 'danger';

export interface WorldFood {
  code: string;
  name: string;
  brand?: string;
  imageUrl?: string;
  per100g: {
    calories: number;
    carbs: number;
    sugar: number;
    protein: number;
    fat: number;
    fiber: number;
  };
  rating: DiabetesRating;
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

/** Quick per-100 g heuristic (inspired by common dietetic guidance):
 *  danger — sugary product (>15 g sugar) or heavy fast carbs with no fiber;
 *  warn   — moderate sugars/carbs;
 *  ok     — low sugar and reasonable carbs, or fiber-rich. */
export function diabetesRating(p: WorldFood['per100g']): DiabetesRating {
  if (p.sugar > 15) return 'danger';
  if (p.carbs > 55 && p.fiber < 4) return 'danger';
  if (p.sugar > 8) return 'warn';
  if (p.carbs > 30 && p.fiber < 3) return 'warn';
  return 'ok';
}

/**
 * Search the world database. The fetch goes through the `food-search`
 * edge function (server-side proxy to Open Food Facts — browsers get
 * blocked by OFF's bot protection when calling it directly).
 */
export async function searchWorldFoods(
  query: string,
  page = 1
): Promise<{ items: WorldFood[]; hasMore: boolean; failed?: boolean }> {
  if (isDemoMode || !supabase) return { items: [], hasMore: false, failed: true };
  try {
    const { data, error } = await supabase.functions.invoke('food-search', {
      body: { q: query, page },
    });
    if (error || data?.error) {
      // Open Food Facts flaps sometimes — surface it as "provider down"
      // so the UI can invite a retry instead of pretending "no results".
      return { items: [], hasMore: false, failed: true };
    }
    const raw = data?.result ?? {};
    const items: WorldFood[] = (Array.isArray(raw.items) ? raw.items : []).map(
      (p: any): WorldFood => ({
        code: String(p.code ?? ''),
        name: String(p.name ?? ''),
        brand: p.brand || undefined,
        imageUrl: p.imageUrl || undefined,
        per100g: {
          calories: num(p.per100g?.calories),
          carbs: num(p.per100g?.carbs),
          sugar: num(p.per100g?.sugar),
          protein: num(p.per100g?.protein),
          fat: num(p.per100g?.fat),
          fiber: num(p.per100g?.fiber),
        },
        rating: diabetesRating({
          calories: num(p.per100g?.calories),
          carbs: num(p.per100g?.carbs),
          sugar: num(p.per100g?.sugar),
          protein: num(p.per100g?.protein),
          fat: num(p.per100g?.fat),
          fiber: num(p.per100g?.fiber),
        }),
      })
    );
    return { items, hasMore: !!raw.hasMore };
  } catch {
    return { items: [], hasMore: false, failed: true };
  }
}
