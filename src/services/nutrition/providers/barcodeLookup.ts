import type { BarcodeProduct } from './openfoodfacts';
import { lookupBarcode as offLookup , openFoodFactsProvider } from './openfoodfacts';
import { usdaProvider } from './usda';

/* ────────────────────────────────────────────────────────────
 * MULTI-SOURCE BARCODE LOOKUP
 * A single barcode is tried against several databases in order, so a
 * product missing from one is found in another:
 *   1. Open Food Facts (world) — full nutrition, best coverage in EU
 *   2. Open Products/Food Facts mirrors via the v0 endpoint (catches
 *      products the v2 API misses)
 *   3. UPCitemdb — huge US/global barcode index. It returns the product
 *      NAME (not nutrition), which we then resolve to real values by
 *      searching USDA + Open Food Facts by name.
 * When only a name is found (no nutrition anywhere), we still return a
 * name-only product so the screen can show it and let the patient adjust
 * or send it to the AI estimator.
 * ──────────────────────────────────────────────────────────── */

const EMPTY_NUTRI = {
  calories: 0,
  carbs: 0,
  sugar: 0,
  protein: 0,
  fat: 0,
  fiber: 0,
  sodium: 0,
};

function timeoutFetch(url: string, ms: number): Promise<Response | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { signal: c.signal })
    .then((r) => (r.ok ? r : null))
    .catch(() => null)
    .finally(() => clearTimeout(t));
}

const num = (n: Record<string, unknown>, k: string): number => {
  const v = n[k];
  const p = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(p) ? p : 0;
};

/** Open Food Facts v0 product endpoint — an older, broader mirror than v2. */
async function offV0(barcode: string): Promise<BarcodeProduct | null> {
  const res = await timeoutFetch(
    `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
    7000
  );
  if (!res) return null;
  try {
    const data = (await res.json()) as any;
    const p = data?.product;
    if (data?.status !== 1 || !p?.nutriments) return null;
    const n = p.nutriments as Record<string, unknown>;
    const calories = num(n, 'energy-kcal_100g') || num(n, 'energy-kcal_serving');
    if (calories <= 0) return null;
    const servingQty = parseFloat(String(p.serving_quantity ?? ''));
    return {
      barcode,
      name: p.product_name || p.product_name_fr || p.generic_name || `Produit ${barcode}`,
      brand: p.brands,
      imageUrl: p.image_front_small_url || p.image_small_url,
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
  }
}

/** UPCitemdb (free trial endpoint) — returns a product NAME for a barcode. */
async function upcItemName(barcode: string): Promise<string | null> {
  const res = await timeoutFetch(
    `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
    7000
  );
  if (!res) return null;
  try {
    const data = (await res.json()) as any;
    const item = data?.items?.[0];
    const name: string | undefined = item?.title || item?.brand;
    return name && name.trim() ? name.trim() : null;
  } catch {
    return null;
  }
}

/** Resolve a product NAME to per-100g nutrition via the search providers. */
async function nutritionForName(
  name: string
): Promise<BarcodeProduct['per100g'] | null> {
  // Try USDA then Open Food Facts search — first with real energy wins.
  for (const provider of [usdaProvider, openFoodFactsProvider]) {
    const hit = await provider.search(name).catch(() => null);
    if (hit && hit.per100g.calories > 0) {
      return {
        calories: hit.per100g.calories,
        carbs: hit.per100g.carbs,
        sugar: hit.per100g.sugar,
        protein: hit.per100g.protein,
        fat: hit.per100g.fat,
        fiber: hit.per100g.fiber,
        sodium: hit.per100g.sodium ?? 0,
      };
    }
  }
  return null;
}

/**
 * Look a barcode up across every source. Returns:
 *  - a full product (nutrition known), or
 *  - a name-only product with `nutritionKnown:false` when only the name
 *    was found (the UI offers manual adjust / AI estimate), or
 *  - null when the barcode is unknown everywhere.
 */
export async function lookupBarcodeMulti(
  barcode: string
): Promise<(BarcodeProduct & { nutritionKnown: boolean }) | null> {
  const code = barcode.trim();
  if (!code) return null;

  // 1 — Open Food Facts v2 (the original, richest path)
  const off = await offLookup(code).catch(() => null);
  if (off) return { ...off, nutritionKnown: true };

  // 2 — Open Food Facts v0 mirror (broader)
  const v0 = await offV0(code);
  if (v0) return { ...v0, nutritionKnown: true };

  // 3 — UPCitemdb name → resolve nutrition by name
  const name = await upcItemName(code);
  if (name) {
    const nutrition = await nutritionForName(name);
    if (nutrition) {
      return {
        barcode: code,
        name,
        per100g: nutrition,
        nutritionKnown: true,
      };
    }
    // Name found but no nutrition anywhere → name-only result.
    return {
      barcode: code,
      name,
      per100g: { ...EMPTY_NUTRI },
      nutritionKnown: false,
    };
  }

  return null;
}
