import { knownFrom, type NutrientKnown } from '../nutrientProvenance';
import type { NutritionProvider, ProviderHit } from '../types';

/**
 * Open Food Facts provider (open crowd-sourced database).
 * No API key required. Values are per 100 g from the `nutriments` map.
 */

const ENDPOINT = 'https://world.openfoodfacts.org/cgi/search.pl';

interface OffProduct {
  product_name?: string;
  nutriments?: Record<string, number | string>;
}

function numOrNull(n: Record<string, number | string>, key: string): number | null {
  const v = n[key];
  if (v === undefined || v === null || v === '') return null;
  const parsed = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(parsed) ? parsed : null;
}

function num(n: Record<string, number | string>, key: string): number {
  return numOrNull(n, key) ?? 0;
}

export interface BarcodeProduct {
  barcode: string;
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
    sodium: number;
    /** Whether `carbs` was declared by the source — a declared 0 counts.
     *  See `carbProvenance.ts`. */
    carbs_known?: boolean;
    /** The same answer for the other six nutrients (Step 22B). */
    known?: NutrientKnown;
  };
  /** Product serving size in grams when declared */
  servingGrams?: number;
}

export const openFoodFactsProvider: NutritionProvider = {
  id: 'openfoodfacts',
  label: 'Open Food Facts',

  async search(query: string): Promise<ProviderHit | null> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const url =
        `${ENDPOINT}?search_terms=${encodeURIComponent(query)}` +
        `&search_simple=1&action=process&json=1&page_size=5` +
        `&fields=product_name,nutriments`;
      const res = await fetch(url, { signal: controller.signal });
      if (!res.ok) return null;
      const data = (await res.json()) as { products?: OffProduct[] };

      // First product with usable energy data
      const product = (data.products ?? []).find((p) => {
        const n = p.nutriments ?? {};
        return num(n, 'energy-kcal_100g') > 0;
      });
      if (!product?.nutriments) return null;
      const n = product.nutriments;

      const calories = numOrNull(n, 'energy-kcal_100g');
      const carbs = numOrNull(n, 'carbohydrates_100g');
      // Step 22B: read the absence of the other five too. Their VALUES are
      // unchanged (an absent one still reads 0), but a crowd-sourced entry that
      // simply never filled in "fibre" no longer reaches the patient as 0 g.
      const sugar = numOrNull(n, 'sugars_100g');
      const protein = numOrNull(n, 'proteins_100g');
      const fat = numOrNull(n, 'fat_100g');
      const fiber = numOrNull(n, 'fiber_100g');
      const sodiumG = numOrNull(n, 'sodium_100g');

      return {
        matchedName: product.product_name || query,
        per100g: {
          calories: num(n, 'energy-kcal_100g'),
          carbs: carbs ?? 0,
          carbs_known: carbs !== null,
          sugar: sugar ?? 0,
          protein: protein ?? 0,
          fat: fat ?? 0,
          fiber: fiber ?? 0,
          // OFF sodium is in g/100g → convert to mg
          sodium: Math.round((sodiumG ?? 0) * 1000),
          known: knownFrom({
            calories,
            carbs,
            sugar,
            protein,
            fat,
            fiber,
            sodium: sodiumG,
          }),
          glycemic_index: undefined,
        },
        source: 'openfoodfacts',
        nutritionConfidence: 0.8,
      };
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
  },
};
