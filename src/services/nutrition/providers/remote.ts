import { isDemoMode, supabase } from '@/lib/supabase';
import type { NutritionSource } from '@/types';

import { knownFrom } from '../nutrientProvenance';
import type { NutritionProvider, ProviderHit } from '../types';

/**
 * FatSecret and Edamam require server-side credentials (FatSecret uses
 * OAuth; Edamam needs an app id + key). We never ship those to the client,
 * so both providers proxy through a single Supabase Edge Function,
 * `nutrition-search`, which owns the secrets.
 *
 * If the function (or its secrets) isn't configured the provider returns
 * null and the engine simply falls through to the next source — the chain
 * never breaks. This keeps the providers pluggable exactly like the others.
 */

/**
 * What the proxy sends back. Every nutrient is `number | null`: since Step 11b
 * the function reports a value the upstream source does not publish as `null`
 * instead of `0`, so a missing carbohydrate arrives as missing. An older
 * deployment sends plain numbers and is read identically by `numOrNull` below —
 * which is what lets this client run against either contract.
 */
interface RemoteHit {
  matched_food: string;
  food_id?: string;
  per100g: {
    calories: number | null;
    carbs: number | null;
    sugar: number | null;
    protein: number | null;
    fat: number | null;
    fiber: number | null;
    sodium?: number | null;
    glycemic_index?: number | null;
  };
  /** 0..100 similarity as computed by the remote source, if any */
  match_score?: number;
}

/** The number the payload actually carries, or null (see `carbProvenance.ts`). */
function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

function makeRemoteProvider(
  id: Extract<NutritionSource, 'fatsecret' | 'edamam'>,
  label: string,
  nutritionConfidence: number
): NutritionProvider {
  return {
    id,
    label,
    async search(query: string): Promise<ProviderHit | null> {
      // No backend → provider is a no-op (graceful degradation).
      if (isDemoMode || !supabase) return null;
      try {
        const { data, error } = await supabase.functions.invoke(
          'nutrition-search',
          { body: { provider: id, query } }
        );
        if (error || !data || data.error) return null;

        const hit = data.hit as RemoteHit | null | undefined;
        const calories = numOrNull(hit?.per100g?.calories);
        if (!hit || !hit.per100g || calories === null || !(calories > 0)) return null;

        // The proxy forwards whatever the upstream source published, and
        // neither FatSecret nor Edamam guarantees a carbohydrate figure. Read
        // the absence here rather than let the missing field become a 0 the
        // moment something multiplies it by a portion.
        const carbs = numOrNull(hit.per100g.carbs);
        const carbsKnown = carbs !== null;
        const gi = numOrNull(hit.per100g.glycemic_index);
        const sugar = numOrNull(hit.per100g.sugar);
        const protein = numOrNull(hit.per100g.protein);
        const fat = numOrNull(hit.per100g.fat);
        const fiber = numOrNull(hit.per100g.fiber);
        const sodium = numOrNull(hit.per100g.sodium);

        return {
          matchedName: hit.matched_food || query,
          foodId: hit.food_id,
          per100g: {
            // Siblings are still coerced to numbers because the engine, the
            // score and the bounds layer all take numbers — an absent one reads
            // 0 exactly as before. Since Step 22B their ABSENCE travels beside
            // them in `known`, so the screen can stop printing it as a value.
            calories,
            carbs: carbs ?? 0,
            carbs_known: carbsKnown,
            sugar: sugar ?? 0,
            protein: protein ?? 0,
            fat: fat ?? 0,
            fiber: fiber ?? 0,
            sodium: sodium ?? 0,
            known: knownFrom({ calories, carbs, sugar, protein, fat, fiber, sodium }),
            ...(gi !== null ? { glycemic_index: gi } : {}),
          },
          source: id,
          nutritionConfidence,
          matchScore: hit.match_score,
        };
      } catch {
        return null; // network/timeout → fall through the chain
      }
    },
  };
}

/** FatSecret — large branded + generic food database. */
export const fatSecretProvider = makeRemoteProvider(
  'fatsecret',
  'FatSecret',
  0.85
);

/** Edamam — recipe/food nutrition API. */
export const edamamProvider = makeRemoteProvider('edamam', 'Edamam', 0.8);
