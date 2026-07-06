import { searchMoroccanFood } from '@/data/moroccanFoods';

import type { NutritionProvider, ProviderHit } from '../types';

/**
 * Internal Moroccan Nutrition Database provider.
 * First in the chain: traditional dishes (couscous, tagine, harira…)
 * are matched here before falling through to USDA/OFF.
 */
export const moroccanProvider: NutritionProvider = {
  id: 'moroccan_db',
  label: 'Base marocaine',

  async search(query: string): Promise<ProviderHit | null> {
    const food = searchMoroccanFood(query);
    if (!food) return null;

    const g = food.serving_grams;
    const per = (v: number) => Math.round((v / g) * 100 * 10) / 10;

    return {
      matchedName: food.name_fr,
      per100g: {
        calories: per(food.calories),
        carbs: per(food.carbs),
        sugar: per(food.sugar),
        protein: per(food.protein),
        fat: per(food.fat),
        fiber: per(food.fiber),
        sodium: per(food.sodium),
        glycemic_index: food.glycemic_index,
      },
      source: 'moroccan_db',
      nutritionConfidence: 0.92,
    };
  },
};
