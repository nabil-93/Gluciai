import { searchMoroccanFood } from '@/data/moroccanFoods';
import { searchCommonFood } from '@/data/commonFoods';

import type { NutritionProvider, ProviderHit } from '../types';

/**
 * Internal Nutrition Database provider (first in the chain).
 * Searches TWO tables before falling through to USDA/OFF:
 *   1. Moroccan dishes (couscous, tagine, harira…) — richest, per-serving
 *   2. Common foods (fruits, veg, staples, proteins, dairy, snacks, world
 *      + Moroccan everyday items) — per-100g, broad coverage
 * The Moroccan dish table wins when both match, so a full dish beats a
 * single ingredient.
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

    return null;
  },
};
