import { supabase } from '@/lib/supabase';
import type { CatalogSource, ProductProvenance } from '@/types';
import { knownFrom } from '../nutrientProvenance';

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
 *
 * WHAT A ROW IS WORTH (finding P2-003, the audit's CRITICAL).
 * Any signed-in patient may write here, so "the catalogue says 60 g" is not a
 * reason to compute an insulin dose from 60 g. Every read therefore comes back
 * with its provenance, and the carbohydrate of a row nobody authoritative
 * stands behind arrives UNKNOWN — visible on screen, never dosable until the
 * patient confirms it against the packaging. The numbers themselves are never
 * rewritten: an unverifiable figure is labelled, not edited.
 * ──────────────────────────────────────────────────────────── */

export type { CatalogSource };

/**
 * The catalogue sources that are a real upstream database the APP itself wrote,
 * rather than something a patient typed. A row from one of these is worth
 * exactly what that database is worth — which the provider chain already
 * decides — so it keeps the fast path.
 */
const UPSTREAM_SOURCES: readonly string[] = ['openfoodfacts', 'usda', 'upcitemdb'];

/**
 * May this row be treated as authoritative for a dose?
 *
 * Verified rows are (an admin vouched for them, and RLS freezes them). So are
 * rows written from an established upstream provider. Everything else — a
 * patient's typed label, a label photo, an unrecognized or absent `source` —
 * is not: the table's own default is `'user'`, so silence must read as
 * user-contributed, never as trusted.
 */
export function isCatalogRowTrusted(
  source: string | null | undefined,
  verified: boolean | null | undefined
): boolean {
  if (verified === true) return true;
  return UPSTREAM_SOURCES.includes(String(source ?? ''));
}

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
  /** Since 0026. Absent only if an older deployment selected fewer columns. */
  source: string | null;
  verified: boolean | null;
}

/** A catalogue read: the product, whether it describes nutrition at all, and
 *  where it came from. */
export type CatalogProduct = BarcodeProduct & {
  nutritionKnown: boolean;
  provenance: ProductProvenance;
};

function rowToProduct(r: CatalogRow): CatalogProduct {
  const trusted = isCatalogRowTrusted(r.source, r.verified);
  return {
    barcode: r.barcode,
    name: r.name,
    brand: r.brand ?? undefined,
    imageUrl: r.image_url ?? undefined,
    per100g: {
      // Every figure is passed through exactly as stored. A row that is not
      // trusted is not a row with wrong numbers — it is a row nobody
      // authoritative stands behind, and quietly editing it would hide that.
      calories: r.calories ?? 0,
      carbs: r.carbs ?? 0,
      sugar: r.sugar ?? 0,
      protein: r.protein ?? 0,
      fat: r.fat ?? 0,
      fiber: r.fiber ?? 0,
      sodium: r.sodium ?? 0,
      // Two independent reasons for an unknown carbohydrate, and both must
      // reach the dosing boundary as unknown:
      //   · the column is null — nobody has filled it in (the column is
      //     nullable and `saveToCatalog` writes null, not 0, on purpose);
      //   · the row is an unverified patient contribution — the value exists
      //     but is not something a dose may be computed from (P2-003).
      // A DECLARED 0 on a trusted row stays a known zero (bottled water).
      carbs_known: trusted && r.carbs !== null,
      // Step 22B: the columns are nullable and `saveToCatalog` writes null
      // rather than 0 for a value nobody filled in, so the row already knows
      // which figures are real. It said so for the carbohydrate only.
      known: knownFrom({
        calories: r.calories,
        carbs: r.carbs,
        sugar: r.sugar,
        protein: r.protein,
        fat: r.fat,
        fiber: r.fiber,
        sodium: r.sodium,
      }),
    },
    servingGrams: r.serving_grams ?? undefined,
    // A row with no declared energy is a name-only contribution: show it, but
    // don't let it be dosed off. `0` that WAS declared (water) stays known.
    nutritionKnown: r.calories !== null,
    provenance: {
      origin: 'product_catalog',
      catalog_source: (r.source ?? 'user') as CatalogSource,
      verified: r.verified === true,
      trusted_for_dosing: trusted,
    },
  };
}

const COLUMNS =
  'barcode,name,brand,image_url,calories,carbs,sugar,protein,fat,fiber,sodium,serving_grams,source,verified';

/**
 * In-memory hits for the current session — a patient re-scanning the same item
 * while adjusting the portion shouldn't re-query anything.
 *
 * BOUNDED, since finding NUTR-B5: an entry without a lifetime meant a row
 * corrected upstream (or by the patient on another device) stayed wrong for as
 * long as the app was open. A few minutes is enough to serve a re-scan and
 * short enough that a correction cannot outlive a sitting.
 */
const MEMO_TTL_MS = 5 * 60 * 1000;

interface MemoEntry {
  product: CatalogProduct;
  savedAt: number;
}

const memo = new Map<string, MemoEntry>();

/** The live entry for a key, dropping it once it has aged out. */
function fromMemo(key: string): CatalogProduct | null {
  const entry = memo.get(key);
  if (!entry) return null;
  if (Date.now() - entry.savedAt >= MEMO_TTL_MS) {
    memo.delete(key);
    return null;
  }
  return entry.product;
}

export async function findInCatalog(barcode: string): Promise<CatalogProduct | null> {
  const codes = barcodeVariants(barcode);
  if (codes.length === 0) return null;

  const key = codes[0];
  const cached = fromMemo(key);
  if (cached) return cached;
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('product_catalog')
      .select(COLUMNS)
      .in('barcode', codes)
      .limit(1);
    if (error || !data || data.length === 0) return null;
    const product = rowToProduct(data[0] as CatalogRow);
    memo.set(key, { product, savedAt: Date.now() });
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
  // Carbohydrate gets its own gate: a product can declare energy and stay
  // silent about carbs, and writing that silence as 0 would hand the next
  // patient who scans this barcode a fabricated value to dose from.
  const carbs = n && n.carbs_known !== false ? n.carbs : null;

  // Refresh the memo so a re-scan in this sitting sees what was just written
  // instead of the pre-write row (finding NUTR-B5's other half). The entry
  // describes the row this call creates: `verified` is false by definition, and
  // the source decides whether it is dosable — a patient's own label reading
  // keeps its `carbs_known`, because THIS device watched them type it off the
  // packaging, which a later database read of the same row cannot know.
  memo.set(barcodeVariants(barcode)[0], {
    product: {
      ...product,
      nutritionKnown,
      provenance: {
        origin: 'product_catalog',
        catalog_source: source,
        verified: false,
        trusted_for_dosing: isCatalogRowTrusted(source, false),
      },
    },
    savedAt: Date.now(),
  });

  void supabase
    .rpc('upsert_product', {
      p_barcode: barcode,
      p_name: product.name.trim().slice(0, 200),
      p_brand: product.brand?.trim().slice(0, 120) ?? null,
      p_image_url: product.imageUrl ?? null,
      p_calories: n?.calories ?? null,
      p_carbs: carbs,
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

/** Search the catalogue by name — the way in when a barcode is unreadable.
 *  Rows come back with the same provenance and the same carbohydrate rule as a
 *  barcode read: an unverified contribution is shown, not trusted. */
export async function searchCatalog(
  query: string,
  limit = 8
): Promise<CatalogProduct[]> {
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
