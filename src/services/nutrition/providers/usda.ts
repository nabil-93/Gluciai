import { knownFrom } from '../nutrientProvenance';
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
  fdcId?: number;
  description: string;
  foodNutrients: FdcNutrient[];
}

/** The value FDC published, or null when this food carries no such nutrient.
 *  A published 0 is a measurement and comes back as 0, not null. */
function pickOrNull(
  nutrients: FdcNutrient[],
  numbers: readonly string[]
): number | null {
  for (const n of nutrients) {
    const num = n.nutrientNumber ?? String(n.nutrientId ?? '');
    if (numbers.includes(num) && typeof n.value === 'number') {
      return n.value;
    }
  }
  return null;
}

function pick(nutrients: FdcNutrient[], numbers: readonly string[]): number {
  return pickOrNull(nutrients, numbers) ?? 0;
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

      // Foundation and SR Legacy foods do not all carry every nutrient. An
      // absent carbohydrate row is silence, not a zero-carb food — and since
      // Step 22B the same is read for the other five, whose absence used to
      // reach the patient as a measured 0 g.
      const carbs = pickOrNull(food.foodNutrients, NUTRIENTS.carbs);
      const sugar = pickOrNull(food.foodNutrients, NUTRIENTS.sugar);
      const protein = pickOrNull(food.foodNutrients, NUTRIENTS.protein);
      const fat = pickOrNull(food.foodNutrients, NUTRIENTS.fat);
      const fiber = pickOrNull(food.foodNutrients, NUTRIENTS.fiber);
      const sodium = pickOrNull(food.foodNutrients, NUTRIENTS.sodium);

      return {
        matchedName: food.description,
        foodId: food.fdcId !== undefined ? String(food.fdcId) : undefined,
        per100g: {
          calories,
          carbs: carbs ?? 0,
          carbs_known: carbs !== null,
          // The values are unchanged — an absent nutrient still reads 0 for
          // every consumer — only their provenance is now carried.
          sugar: sugar ?? 0,
          protein: protein ?? 0,
          fat: fat ?? 0,
          fiber: fiber ?? 0,
          sodium: sodium ?? 0,
          known: knownFrom({ calories, carbs, sugar, protein, fat, fiber, sodium }),
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
