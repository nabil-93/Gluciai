import { searchMoroccanFood } from '@/data/moroccanFoods';
import { searchCommonFood } from '@/data/commonFoods';
import { searchHealthyFood } from '@/data/healthyFoods';

import type { NutritionProvider, ProviderHit } from '../types';

/**
 * Internal Nutrition Database provider (first in the chain).
 * Searches THREE tables before falling through to USDA/OFF:
 *   1. Moroccan dishes (couscous, tagine, harira…) — richest, per-serving
 *   2. Common foods (fruits, veg, staples, proteins, dairy, snacks, world
 *      + Moroccan everyday items) — per-100g, broad coverage
 *   3. Curated healthy dishes (the "Sélection santé" library, ~110 Moroccan
 *      dishes) — per-serving; catches lighter/regional dishes the first two
 *      tables miss, so the AI never recomputes a dish that is already stored.
 * The Moroccan dish table wins when several match, so a full traditional
 * dish beats a single ingredient or a curated variant.
 */
export const moroccanProvider: NutritionProvider = {
  id: 'moroccan_db',
  label: 'Base interne',

  async search(query: string): Promise<ProviderHit | null> {
    // 1 — traditional Moroccan dishes (per-serving → per-100g)
    const dish = searchMoroccanFood(query);
    if (dish) {
      const g = dish.serving_grams;
      const per = (v: number) => Math.round((v / g) * 100 * 10) / 10;
      return {
        matchedName: dish.name_fr,
        per100g: {
          calories: per(dish.calories),
          carbs: per(dish.carbs),
          sugar: per(dish.sugar),
          protein: per(dish.protein),
          fat: per(dish.fat),
          fiber: per(dish.fiber),
          sodium: per(dish.sodium),
          glycemic_index: dish.glycemic_index,
        },
        source: 'moroccan_db',
        nutritionConfidence: 0.92,
      };
    }

    // 2 — common foods (already per-100g)
    const food = searchCommonFood(query);
    if (food) {
      return {
        matchedName: food.fr,
        per100g: {
          calories: food.kcal,
          carbs: food.carbs,
          sugar: food.sugar,
          protein: food.protein,
          fat: food.fat,
          fiber: food.fiber,
          sodium: food.sodium,
          glycemic_index: food.gi,
        },
        source: 'moroccan_db',
        nutritionConfidence: 0.9,
      };
    }

    // 3 — curated healthy dishes (per-serving → per-100g)
    const healthy = searchHealthyFood(query);
    if (healthy) {
      const g = healthy.grams;
      const per = (v: number) => Math.round((v / g) * 100 * 10) / 10;
      return {
        matchedName: healthy.name_fr,
        per100g: {
          calories: per(healthy.calories),
          carbs: per(healthy.carbs),
          sugar: per(healthy.sugar),
          protein: per(healthy.protein),
          fat: per(healthy.fat),
          fiber: per(healthy.fiber),
          sodium: 0,
          glycemic_index: healthy.gi,
        },
        source: 'moroccan_db',
        nutritionConfidence: 0.9,
      };
    }

    return null;
  },
};
