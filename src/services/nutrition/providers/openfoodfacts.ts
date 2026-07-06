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

function num(n: Record<string, number | string>, key: string): number {
  const v = n[key];
  const parsed = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
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
  };
  /** Product serving size in grams when declared */
  servingGrams?: number;
}

/**
 * Direct product lookup by barcode (EAN/UPC) — used by the barcode
 * scanner. Returns null when the product is unknown.
 */
export async function lookupBarcode(
  barcode: string
): Promise<BarcodeProduct | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 7000);
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json` +
        `?fields=product_name,brands,image_front_small_url,nutriments,serving_quantity`,
      { signal: controller.signal }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as {
      status?: number;
      product?: OffProduct & {
        brands?: string;
        image_front_small_url?: string;
        serving_quantity?: number | string;
      };
    };
    if (data.status !== 1 || !data.product?.nutriments) return null;
    const p = data.product;
    const n = p.nutriments!;
    const calories = num(n, 'energy-kcal_100g');
    if (calories <= 0) return null;

    const servingQty = parseFloat(String(p.serving_quantity ?? ''));
    return {
      barcode,
      name: p.product_name || `Produit ${barcode}`,
      brand: p.brands,
      imageUrl: p.image_front_small_url,
      per100g: {
        calories,
        carbs: num(n, 'carbohydrates_100g'),
        sugar: num(n, 'sugars_100g'),
        protein: num(n, 'proteins_100g'),
        fat: num(n, 'fat_100g'),
        fiber: num(n, 'fiber_100g'),
        sodium: Math.round(num(n, 'sodium_100g') * 1000),
      },
      servingGrams:
        Number.isFinite(servingQty) && servingQty > 0 ? servingQty : undefined,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
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

      return {
        matchedName: product.product_name || query,
        per100g: {
          calories: num(n, 'energy-kcal_100g'),
          carbs: num(n, 'carbohydrates_100g'),
          sugar: num(n, 'sugars_100g'),
          protein: num(n, 'proteins_100g'),
          fat: num(n, 'fat_100g'),
          fiber: num(n, 'fiber_100g'),
          // OFF sodium is in g/100g → convert to mg
          sodium: Math.round(num(n, 'sodium_100g') * 1000),
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
