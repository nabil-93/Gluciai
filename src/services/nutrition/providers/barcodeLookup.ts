import type { BarcodeProduct } from './openfoodfacts';
import { openFoodFactsProvider } from './openfoodfacts';
import { usdaProvider } from './usda';
import {
  barcodeVariants,
  readNutriments,
  sanitizeServingGrams,
  type Nutriments,
} from './nutriments';
import {
  bumpCatalogScan,
  findInCatalog,
  saveToCatalog,
  type CatalogSource,
} from './productCatalog';

/* ────────────────────────────────────────────────────────────
 * MULTI-SOURCE BARCODE LOOKUP
 *
 * Order, cheapest and most reliable first:
 *   1. Our own catalogue — anything a patient has already resolved.
 *   2. Open Food Facts, the world database (best coverage in Europe and
 *      North Africa alike), tried on every plausible shape of the code.
 *   3. USDA branded foods, which indexes products by their GTIN/UPC.
 *   4. UPCitemdb, a barcode index that returns a NAME; that name is then
 *      resolved to real numbers through the search providers.
 *
 * Anything found remotely is written back to the catalogue, so the next
 * patient to scan it is served from step 1.
 *
 * A product whose NAME is known but whose nutrition is not still comes back
 * (with `nutritionKnown:false`) instead of being reported as an unknown
 * barcode — the screen can then show the product and let the patient read the
 * values off the packaging, which is the authoritative source anyway.
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

export type BarcodeResult = BarcodeProduct & { nutritionKnown: boolean };

function timeoutFetch(url: string, ms: number): Promise<Response | null> {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return fetch(url, { signal: c.signal })
    .then((r) => (r.ok ? r : null))
    .catch(() => null)
    .finally(() => clearTimeout(t));
}

async function json(url: string, ms: number): Promise<any | null> {
  const res = await timeoutFetch(url, ms);
  if (!res) return null;
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/* ── Open Food Facts ──────────────────────────────────────── */

const OFF_FIELDS =
  'product_name,product_name_fr,product_name_ar,product_name_de,product_name_en,' +
  'generic_name,brands,image_front_small_url,image_small_url,nutriments,serving_quantity,quantity';

/** OFF stores the name once per language; take whichever exists, preferring
 *  the ones a Moroccan/German shelf is actually labelled in. */
function offName(p: Record<string, any>): string | null {
  const candidates = [
    p.product_name,
    p.product_name_fr,
    p.product_name_en,
    p.product_name_de,
    p.product_name_ar,
    p.generic_name,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim()) return c.trim();
  }
  return null;
}

/** One OFF product endpoint (v2 then the older v0 mirror, which still holds
 *  entries v2 drops). Returns null only when the barcode is truly absent. */
async function offProduct(barcode: string, api: 'v2' | 'v0'): Promise<BarcodeResult | null> {
  const base =
    api === 'v2'
      ? `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(barcode)}.json?fields=${OFF_FIELDS}`
      : `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`;
  const data = await json(base, 7000);
  const p = data?.product;
  if (data?.status !== 1 || !p) return null;

  const name = offName(p);
  if (!name) return null;

  const servingGrams = sanitizeServingGrams(p.serving_quantity);
  const read = readNutriments(p.nutriments as Nutriments | undefined, servingGrams);

  return {
    barcode,
    name,
    brand: typeof p.brands === 'string' && p.brands.trim() ? p.brands.trim() : undefined,
    imageUrl: p.image_front_small_url || p.image_small_url || undefined,
    per100g: read.hasEnergy ? read.per100g : { ...EMPTY_NUTRI },
    servingGrams,
    nutritionKnown: read.hasEnergy,
  };
}

/* ── USDA branded foods (indexed by GTIN/UPC) ─────────────── */

const USDA_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY || 'DEMO_KEY';

/** FDC nutrient ids for the values we keep, per 100 g. */
const FDC = {
  calories: [1008, 208],
  protein: [1003, 203],
  fat: [1004, 204],
  carbs: [1005, 205],
  fiber: [1079, 291],
  sugar: [2000, 269],
  sodium: [1093, 307],
} as const;

function fdcValue(nutrients: any[], ids: readonly number[]): number | null {
  for (const n of nutrients ?? []) {
    const id = n?.nutrientId ?? parseInt(String(n?.nutrientNumber ?? ''), 10);
    if (ids.includes(id) && typeof n?.value === 'number') return n.value;
  }
  return null;
}

async function usdaByGtin(barcode: string): Promise<BarcodeResult | null> {
  const url =
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${USDA_KEY}` +
    `&query=${encodeURIComponent(barcode)}&dataType=Branded&pageSize=5`;
  const data = await json(url, 7000);
  const foods: any[] = data?.foods ?? [];
  // Only trust an exact GTIN match — the endpoint is a text search and will
  // happily return unrelated foods for a code it doesn't have.
  const hit = foods.find(
    (f) => String(f?.gtinUpc ?? '').replace(/^0+/, '') === barcode.replace(/^0+/, '')
  );
  if (!hit) return null;

  const calories = fdcValue(hit.foodNutrients, FDC.calories);
  if (calories === null) return null;

  return {
    barcode,
    name: String(hit.description ?? '').trim() || `Product ${barcode}`,
    brand: hit.brandOwner || hit.brandName || undefined,
    per100g: {
      calories: Math.round(calories),
      carbs: fdcValue(hit.foodNutrients, FDC.carbs) ?? 0,
      sugar: fdcValue(hit.foodNutrients, FDC.sugar) ?? 0,
      protein: fdcValue(hit.foodNutrients, FDC.protein) ?? 0,
      fat: fdcValue(hit.foodNutrients, FDC.fat) ?? 0,
      fiber: fdcValue(hit.foodNutrients, FDC.fiber) ?? 0,
      sodium: Math.round(fdcValue(hit.foodNutrients, FDC.sodium) ?? 0),
    },
    nutritionKnown: true,
  };
}

/* ── UPCitemdb: a name for almost any barcode ─────────────── */

async function upcItemName(barcode: string): Promise<string | null> {
  const data = await json(
    `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(barcode)}`,
    7000
  );
  const item = data?.items?.[0];
  const name: string | undefined = item?.title || item?.brand;
  return name && name.trim() ? name.trim() : null;
}

/** Resolve a product NAME to per-100 g nutrition via the search providers. */
async function nutritionForName(name: string): Promise<BarcodeProduct['per100g'] | null> {
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
 *  - a name-only product with `nutritionKnown:false`, or
 *  - null when the barcode is unknown everywhere.
 */
export async function lookupBarcodeMulti(barcode: string): Promise<BarcodeResult | null> {
  const codes = barcodeVariants(barcode);
  if (codes.length === 0) return null;

  // 1 — our catalogue (instant, and works when the public APIs don't)
  const known = await findInCatalog(codes[0]);
  if (known) {
    bumpCatalogScan(known);
    return known;
  }

  // 2 — Open Food Facts, every API × every shape of the code. A name-only
  //     answer is remembered but we keep looking for real numbers first.
  let nameOnly: BarcodeResult | null = null;
  let nameOnlySource: CatalogSource = 'openfoodfacts';

  for (const api of ['v2', 'v0'] as const) {
    for (const code of codes) {
      const hit = await offProduct(code, api);
      if (!hit) continue;
      if (hit.nutritionKnown) {
        saveToCatalog(hit, 'openfoodfacts', true);
        return hit;
      }
      nameOnly = nameOnly ?? hit;
    }
  }

  // 3 — USDA branded foods by GTIN
  for (const code of codes) {
    const hit = await usdaByGtin(code);
    if (hit) {
      saveToCatalog(hit, 'usda', true);
      return hit;
    }
  }

  // 4 — a name from the barcode index, resolved to numbers by search
  const name = await upcItemName(codes[0]);
  if (name) {
    const nutrition = await nutritionForName(name);
    if (nutrition) {
      const hit: BarcodeResult = {
        barcode: codes[0],
        name,
        per100g: nutrition,
        nutritionKnown: true,
      };
      saveToCatalog(hit, 'upcitemdb', true);
      return hit;
    }
    if (!nameOnly) {
      nameOnly = {
        barcode: codes[0],
        name,
        per100g: { ...EMPTY_NUTRI },
        nutritionKnown: false,
      };
      nameOnlySource = 'upcitemdb';
    }
  }

  if (nameOnly) {
    // Worth storing: the next patient at least gets the product's name, and
    // whoever types the label in fills the numbers for everyone.
    saveToCatalog(nameOnly, nameOnlySource, false);
    return nameOnly;
  }

  return null;
}

export { saveToCatalog, searchCatalog } from './productCatalog';
