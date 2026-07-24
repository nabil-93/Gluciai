import { supabase } from '@/lib/supabase';
import type { BarcodeProduct } from './openfoodfacts';
import { barcodeVariants } from './nutriments';

/* ────────────────────────────────────────────────────────────
 * THE APP'S OWN BARCODE CATALOGUE
 *
 * Sits in front of the public databases. Two jobs:
 *
 *  · READ — a product another patient has already resolved comes back in one
 *    query, with no dependency on Open Food Facts being up, fast, or willing
 *    to serve us today.
 *  · WRITE — every product resolved anywhere, and every label a patient types
 *    in by hand, is written back. The catalogue therefore fills itself with
 *    exactly the products these patients actually buy, which is the only
 *    coverage that matters.
 *
 * Nothing here is required for the scanner to work: with Supabase absent
 * (demo mode) or a query failing, every function degrades to "not found" and
 * the remote chain runs as before.
 * ──────────────────────────────────────────────────────────── */

export type CatalogSource =
  | 'openfoodfacts'
  | 'usda'
  | 'upcitemdb'
  | 'user'
  | 'label-photo';

interface CatalogRow {
  barcode: string;
  name: string;
  brand: string | null;
  image_url: string | null;
  calories: number | null;
  carbs: number | null;
  sugar: number | null;
  protein: number | null;
  fat: number | null;
  fiber: number | null;
  sodium: number | null;
  serving_grams: number | null;
}

function rowToProduct(r: CatalogRow): BarcodeProduct & { nutritionKnown: boolean } {
  return {
    barcode: r.barcode,
    name: r.name,
    brand: r.brand ?? undefined,
    imageUrl: r.image_url ?? undefined,
    per100g: {
      calories: r.calories ?? 0,
      carbs: r.carbs ?? 0,
      sugar: r.sugar ?? 0,
      protein: r.protein ?? 0,
      fat: r.fat ?? 0,
      fiber: r.fiber ?? 0,
      sodium: r.sodium ?? 0,
    },
    servingGrams: r.serving_grams ?? undefined,
    // A row with no declared energy is a name-only contribution: show it, but
    // don't let it be dosed off. `0` that WAS declared (water) stays known.
    nutritionKnown: r.calories !== null,
  };
}

const COLUMNS =
  'barcode,name,brand,image_url,calories,carbs,sugar,protein,fat,fiber,sodium,serving_grams';

/** In-memory hits for the current session — a patient re-scanning the same
 *  item while adjusting the portion shouldn't re-query anything. */
const memo = new Map<string, (BarcodeProduct & { nutritionKnown: boolean }) | null>();

export async function findInCatalog(
  barcode: string
): Promise<(BarcodeProduct & { nutritionKnown: boolean }) | null> {
  const codes = barcodeVariants(barcode);
  if (codes.length === 0) return null;

  const key = codes[0];
  if (memo.has(key)) return memo.get(key) ?? null;
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('product_catalog')
      .select(COLUMNS)
      .in('barcode', codes)
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const product = rowToProduct(data[0] as CatalogRow);
    memo.set(key, product);
    return product;
  } catch {
    return null;
  }
}

/**
 * Write a product back to the shared catalogue. Fire-and-forget: the scan
 * result is already on screen, and a patient must never wait on — or see an
 * error from — a contribution they didn't ask to make.
 */
export function saveToCatalog(
  product: BarcodeProduct,
  source: CatalogSource,
  nutritionKnown: boolean
): void {
  if (!supabase) return;
  const barcode = product.barcode.replace(/\D/g, '');
  if (!/^\d{6,14}$/.test(barcode) || !product.name.trim()) return;

  // Only send nutrition we actually have. Sending zeros for an entry that
  // simply didn't declare them would poison the catalogue for everyone.
  const n = nutritionKnown ? product.per100g : null;

  memo.set(barcodeVariants(barcode)[0], { ...product, nutritionKnown });

  void supabase
    .rpc('upsert_product', {
      p_barcode: barcode,
      p_name: product.name.trim().slice(0, 200),
      p_brand: product.brand?.trim().slice(0, 120) ?? null,
      p_image_url: product.imageUrl ?? null,
      p_calories: n?.calories ?? null,
      p_carbs: n?.carbs ?? null,
      p_sugar: n?.sugar ?? null,
      p_protein: n?.protein ?? null,
      p_fat: n?.fat ?? null,
      p_fiber: n?.fiber ?? null,
      p_sodium: n?.sodium ?? null,
      p_serving_grams: product.servingGrams ?? null,
      p_source: source,
    })
    .then(
      () => undefined,
      () => undefined
    );
}

/**
 * Count a scan of a product that was already in the catalogue. Sends no
 * nutrition at all: the row is the authority here, and re-posting the values
 * we just read back from it would let a zero-filled read overwrite columns
 * that are legitimately empty.
 */
export function bumpCatalogScan(product: BarcodeProduct): void {
  if (!supabase) return;
  const barcode = product.barcode.replace(/\D/g, '');
  if (!/^\d{6,14}$/.test(barcode)) return;
  void supabase
    .rpc('upsert_product', {
      p_barcode: barcode,
      p_name: product.name,
      p_source: 'openfoodfacts',
    })
    .then(
      () => undefined,
      () => undefined
    );
}

/** Search the catalogue by name — the way in when a barcode is unreadable. */
export async function searchCatalog(
  query: string,
  limit = 8
): Promise<(BarcodeProduct & { nutritionKnown: boolean })[]> {
  const q = query.trim();
  if (!supabase || q.length < 2) return [];
  try {
    const { data, error } = await supabase
      .from('product_catalog')
      .select(COLUMNS)
      .or(`name.ilike.%${q}%,brand.ilike.%${q}%`)
      .order('scan_count', { ascending: false })
      .limit(limit);
    if (error || !data) return [];
    return (data as CatalogRow[]).map(rowToProduct);
  } catch {
    return [];
  }
}
