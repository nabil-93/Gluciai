import { isDemoMode, supabase } from '@/lib/supabase';
import type { NutritionSource } from '@/types';

import type { NutritionProvider, Per100g, ProviderHit } from '../types';

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

interface RemoteHit {
  matched_food: string;
  food_id?: string;
  per100g: Per100g;
  /** 0..100 similarity as computed by the remote source, if any */
  match_score?: number;
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
        if (!hit || !hit.per100g || !(hit.per100g.calories > 0)) return null;

        return {
          matchedName: hit.matched_food || query,
          foodId: hit.food_id,
          per100g: hit.per100g,
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
