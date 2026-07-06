import type { NutritionProvider, ProviderHit } from '../types';

/**
 * USDA FoodData Central provider (official US database).
 * Uses the public search API. `DEMO_KEY` works out of the box with
 * rate limits — set EXPO_PUBLIC_USDA_API_KEY for production quotas
 * (free at https://fdc.nal.usda.gov/api-key-signup.html).
 */

const API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY || 'DEMO_KEY';
const ENDPOINT = 'https://api.nal.usda.gov/fdc/v1/foods/search';

// FDC nutrient numbers (per 100 g)
const NUTRIENTS = {
  energy: ['208', '1008'],
  protein: ['203', '1003'],
  fat: ['204', '1004'],
  carbs: ['205', '1005'],
  fiber: ['291', '1079'],
  sugar: ['269', '2000'],
  sodium: ['307', '1093'],
} as const;

interface FdcNutrient {
  nutrientNumber?: string;
  nutrientId?: number;
  value?: number;
  unitName?: string;
}
interface FdcFood {
  description: string;
  foodNutrients: FdcNutrient[];
}

function pick(nutrients: FdcNutrient[], numbers: readonly string[]): number {
  for (const n of nutrients) {
    const num = n.nutrientNumber ?? String(n.nutrientId ?? '');
    if (numbers.includes(num) && typeof n.value === 'number') {
      return n.value;
    }
  }
  return 0;
}

export const usdaProvider: NutritionProvider = {
  id: 'usda',
  label: 'USDA FoodData Central',

  async search(query: string): Promise<ProviderHit | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const url =
        `${ENDPOINT}?api_key=${encodeURIComponent(API_KEY)}` +
        `&query=${encodeURIComponent(query)}` +
        `&dataType=${encodeURIComponent('Foundation,SR Legacy')}` +
        `&pageSize=1&sortBy=dataType.keyword`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      const data = (await res.json()) as { foods?: FdcFood[] };
      const food = data.foods?.[0];
      if (!food?.foodNutrients?.length) return null;

      const calories = pick(food.foodNutrients, NUTRIENTS.energy);
      if (calories <= 0) return null;

      return {
        matchedName: food.description,
        per100g: {
          calories,
          carbs: pick(food.foodNutrients, NUTRIENTS.carbs),
          sugar: pick(food.foodNutrients, NUTRIENTS.sugar),
          protein: pick(food.foodNutrients, NUTRIENTS.protein),
          fat: pick(food.foodNutrients, NUTRIENTS.fat),
          fiber: pick(food.foodNutrients, NUTRIENTS.fiber),
          sodium: pick(food.foodNutrients, NUTRIENTS.sodium),
          // USDA does not publish glycemic index
          glycemic_index: undefined,
        },
        source: 'usda',
        nutritionConfidence: 0.95,
      };
    } catch {
      return null; // network/timeout/rate-limit → fall through the chain
    } finally {
      clearTimeout(timer);
    }
  },
};
