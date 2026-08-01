import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sanitizePer100g } from '@/services/nutrition/plausibility';

/**
 * CHARACTERIZATION — the shared catalogue's trust boundary (P2-003, NUTR-B5).
 *
 * `product_catalog` is the app's own barcode table: any signed-in patient may
 * write to it, and every other patient's scan reads it. It used to be consulted
 * FIRST and returned IMMEDIATELY, so whatever carbohydrate it held became an
 * insulin dose — a figure one patient typed, dosed by another, with nothing on
 * screen saying where it came from.
 *
 * BEFORE Step 12 (both pinned by this file before the change, and both now
 * inverted below):
 *   · an unverified user row was returned without consulting any provider, with
 *     `carbs_known: true` — dosable;
 *   · the module memo had no lifetime, so a row corrected upstream stayed wrong
 *     for as long as the app was open (NUTR-B5).
 *
 * AFTER Step 12 — source-based demotion:
 *   · verified rows, and rows the APP wrote from an established provider
 *     (Open Food Facts / USDA / UPCitemdb), keep the fast path;
 *   · a patient-contributed row is asked LAST: the public providers go first,
 *     and it comes back only if they found nothing, flagged, with its
 *     carbohydrate UNKNOWN and its numbers untouched.
 *
 * Nothing here touches the network: `fetch` is a stub that answers from a
 * fixture, and Supabase is a hand-rolled double whose rows the test supplies.
 */

const { fakeSupabase, catalogRows, rpcCalls } = vi.hoisted(() => {
  const catalogRows: any[] = [];
  const rpcCalls: { name: string; params: any }[] = [];

  const rows = async () => ({ data: catalogRows.slice(0, 1), error: null });

  const fakeSupabase = {
    from: () => ({
      select: () => ({
        in: () => ({ limit: rows }),
        or: () => ({ order: () => ({ limit: rows }) }),
      }),
    }),
    rpc: (name: string, params: any) => {
      rpcCalls.push({ name, params });
      return Promise.resolve({ data: null, error: null });
    },
  };

  return { fakeSupabase, catalogRows, rpcCalls };
});

vi.mock('@/lib/supabase', () => ({ supabase: fakeSupabase, isDemoMode: false }));

const { findInCatalog, isCatalogRowTrusted, saveToCatalog } = await import(
  '@/services/nutrition/providers/productCatalog'
);
const { lookupBarcodeMulti } = await import(
  '@/services/nutrition/providers/barcodeLookup'
);

/** Every request the stub saw, so "no provider was consulted" is provable. */
const requested: string[] = [];

function stubFetch(routes: { match: string; body: unknown }[] = []) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      requested.push(String(url));
      const route = routes.find((r) => String(url).includes(r.match));
      if (!route) return { ok: false, status: 404, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => route.body };
    })
  );
}

/** A fresh barcode per test — the module memo is keyed by barcode. */
let seq = 4000000000000;
const nextBarcode = () => String(++seq);

/** One catalogue row. Defaults to the table's own default: a user contribution. */
function row(over: Record<string, unknown> = {}) {
  return {
    barcode: '',
    name: 'Catalogue product',
    brand: null,
    image_url: null,
    calories: 200,
    carbs: 60,
    sugar: 5,
    protein: 3,
    fat: 2,
    fiber: 1,
    sodium: 10,
    serving_grams: null,
    source: 'user',
    verified: false,
    ...over,
  };
}

/** An Open Food Facts v2 answer for the same barcode. */
const offRoute = (barcode: string, carbs: number | null, name = 'OFF product') => ({
  match: `/api/v2/product/${barcode}`,
  body: {
    status: 1,
    product: {
      product_name: name,
      nutriments: {
        'energy-kcal_100g': 250,
        ...(carbs === null ? {} : { carbohydrates_100g: carbs }),
        sugars_100g: 4,
        proteins_100g: 6,
        fat_100g: 3,
        fiber_100g: 2,
      },
    },
  },
});

beforeEach(() => {
  catalogRows.length = 0;
  rpcCalls.length = 0;
  requested.length = 0;
  stubFetch();
});

afterEach(() => {
  vi.useRealTimers();
});

/* ── The rule itself ──────────────────────────────────────── */

describe('isCatalogRowTrusted — who is allowed to be the authority', () => {
  it('trusts a verified row whatever wrote it', () => {
    expect(isCatalogRowTrusted('user', true)).toBe(true);
    expect(isCatalogRowTrusted('label-photo', true)).toBe(true);
  });

  it('trusts an unverified row the APP wrote from an established provider', () => {
    // These rows were written by `saveToCatalog` from a real API answer, so they
    // are worth exactly what that provider is worth — which the provider chain
    // already decides. Demoting them would cost coverage for no safety gain.
    expect(isCatalogRowTrusted('openfoodfacts', false)).toBe(true);
    expect(isCatalogRowTrusted('usda', false)).toBe(true);
    expect(isCatalogRowTrusted('upcitemdb', false)).toBe(true);
  });

  it('does NOT trust a patient contribution, nor silence', () => {
    expect(isCatalogRowTrusted('user', false)).toBe(false);
    expect(isCatalogRowTrusted('label-photo', false)).toBe(false);
    // The column's DB default is 'user', so an absent, null or unrecognized
    // source must read as user-contributed — never as trusted.
    expect(isCatalogRowTrusted(null, false)).toBe(false);
    expect(isCatalogRowTrusted(undefined, undefined)).toBe(false);
    expect(isCatalogRowTrusted('something-new', false)).toBe(false);
    expect(isCatalogRowTrusted('', false)).toBe(false);
  });
});

/* ── What a read is worth ─────────────────────────────────── */

describe('findInCatalog — provenance travels with every row', () => {
  it('a VERIFIED row is trusted and dosable', async () => {
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, source: 'user', verified: true, carbs: 12 }));
    const p = (await findInCatalog(b))!;
    expect(p.provenance).toEqual({
      origin: 'product_catalog',
      catalog_source: 'user',
      verified: true,
      trusted_for_dosing: true,
    });
    expect(p.per100g.carbs).toBe(12);
    expect(p.per100g.carbs_known).toBe(true);
  });

  it('an unverified UPSTREAM-provider row is trusted and dosable', async () => {
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, source: 'usda', carbs: 49 }));
    const p = (await findInCatalog(b))!;
    expect(p.provenance).toMatchObject({ catalog_source: 'usda', trusted_for_dosing: true });
    expect(p.per100g).toMatchObject({ carbs: 49, carbs_known: true });
  });

  it('an unverified USER row keeps its numbers but loses the dose', async () => {
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, source: 'user', carbs: 60 }));
    const p = (await findInCatalog(b))!;
    // The figure is NOT edited — it is labelled. Rewriting it would hide the
    // fact that nobody authoritative stands behind it.
    expect(p.per100g.carbs).toBe(60);
    expect(p.per100g.carbs_known).toBe(false);
    expect(p.provenance).toMatchObject({
      catalog_source: 'user',
      verified: false,
      trusted_for_dosing: false,
    });
    // Still a described product: the screen shows it and offers the label fields.
    expect(p.nutritionKnown).toBe(true);
    expect(p.per100g.calories).toBe(200);
  });

  it('a label-photo row is treated the same way', async () => {
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, source: 'label-photo', carbs: 30 }));
    const p = (await findInCatalog(b))!;
    expect(p.per100g).toMatchObject({ carbs: 30, carbs_known: false });
  });

  it('a genuine 0 g stays a KNOWN zero on a trusted row', async () => {
    const b = nextBarcode();
    catalogRows.push(
      row({ barcode: b, source: 'openfoodfacts', calories: 0, carbs: 0, sugar: 0 })
    );
    const p = (await findInCatalog(b))!;
    expect(p.per100g.carbs).toBe(0);
    expect(p.per100g.carbs_known).toBe(true); // bottled water really is 0 g
  });

  it('a 0 g on an UNTRUSTED row is not a measurement', async () => {
    // The sharpest instance of the poisoning vector: "bread, 0 g of
    // carbohydrate" would compute a 0 U meal bolus. The zero is shown; it is
    // not dosable.
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, name: 'Pain', source: 'user', carbs: 0 }));
    const p = (await findInCatalog(b))!;
    expect(p.per100g.carbs).toBe(0);
    expect(p.per100g.carbs_known).toBe(false);
  });

  it('a null carbohydrate is unknown on a trusted row too, and never becomes a value', async () => {
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, source: 'usda', carbs: null }));
    const p = (await findInCatalog(b))!;
    expect(p.per100g.carbs).toBe(0); // placeholder…
    expect(p.per100g.carbs_known).toBe(false); // …and labelled as one
  });

  it('rows written by an older deployment (no trust columns) are untrusted', async () => {
    const b = nextBarcode();
    const legacy = row({ barcode: b, carbs: 45 }) as Record<string, unknown>;
    delete legacy.source;
    delete legacy.verified;
    catalogRows.push(legacy);
    const p = (await findInCatalog(b))!;
    expect(p.per100g).toMatchObject({ carbs: 45, carbs_known: false });
    expect(p.provenance.trusted_for_dosing).toBe(false);
  });
});

/* ── Ordering ─────────────────────────────────────────────── */

describe('lookupBarcodeMulti — a patient contribution is asked last (P2-003)', () => {
  it('a VERIFIED row still short-circuits the chain', async () => {
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, name: 'Verified product', verified: true, carbs: 20 }));
    const hit = (await lookupBarcodeMulti(b))!;
    expect(hit.name).toBe('Verified product');
    expect(hit.per100g).toMatchObject({ carbs: 20, carbs_known: true });
    expect(requested).toHaveLength(0); // no provider consulted — unchanged
    expect(rpcCalls.map((c) => c.name)).toContain('upsert_product'); // scan counted
  });

  it('an unverified UPSTREAM row still short-circuits the chain', async () => {
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, name: 'OFF-sourced', source: 'openfoodfacts', carbs: 33 }));
    const hit = (await lookupBarcodeMulti(b))!;
    expect(hit.per100g).toMatchObject({ carbs: 33, carbs_known: true });
    expect(requested).toHaveLength(0);
  });

  it('a USER row is REPLACED when a public provider knows the product', async () => {
    // The behaviour this step exists for. Before: the 60 g another patient typed
    // was returned untouched and dosed. Now Open Food Facts is asked first and
    // its answer wins outright.
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, name: 'Poisoned Product', source: 'user', carbs: 60 }));
    stubFetch([offRoute(b, 41, 'Real Product')]);

    const hit = (await lookupBarcodeMulti(b))!;
    expect(hit.name).toBe('Real Product');
    expect(hit.per100g).toMatchObject({ carbs: 41, carbs_known: true });
    expect(hit.provenance).toEqual({ origin: 'openfoodfacts', trusted_for_dosing: true });
    expect(requested.some((u) => u.includes('/api/v2/product/'))).toBe(true);
  });

  it('a USER row REMAINS available when no provider knows the product', async () => {
    // Offline / Moroccan-retail coverage is exactly why the catalogue exists, so
    // the row is not thrown away — it comes back flagged, with its numbers
    // visible and its carbohydrate unknown.
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, name: 'Local product', source: 'user', carbs: 60 }));
    stubFetch(); // every provider 404s

    const hit = (await lookupBarcodeMulti(b))!;
    expect(hit.name).toBe('Local product');
    expect(hit.per100g.carbs).toBe(60); // visible, unedited
    expect(hit.per100g.carbs_known).toBe(false); // not dosable
    expect(hit.provenance).toMatchObject({
      origin: 'product_catalog',
      catalog_source: 'user',
      trusted_for_dosing: false,
    });
    // …and the providers really were tried first.
    expect(requested.some((u) => u.includes('/api/v2/product/'))).toBe(true);
    expect(requested.some((u) => u.includes('dataType=Branded'))).toBe(true);
  });

  it('a USER row beats a name-only remote answer, because it has numbers', async () => {
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, name: 'Local product', source: 'user', carbs: 60 }));
    stubFetch([
      { match: `/api/v2/product/${b}`, body: { status: 1, product: { product_name: 'Name only' } } },
    ]);
    const hit = (await lookupBarcodeMulti(b))!;
    expect(hit.name).toBe('Local product');
    expect(hit.per100g.calories).toBe(200);
    expect(hit.per100g.carbs_known).toBe(false);
  });

  it('an unknown barcode is still unknown — the fallback invents nothing', async () => {
    const b = nextBarcode();
    stubFetch();
    expect(await lookupBarcodeMulti(b)).toBeNull();
  });
});

describe('provider ordering outside the demoted case is unchanged', () => {
  it('with no catalogue row: OFF first, then USDA by GTIN', async () => {
    const b = nextBarcode();
    stubFetch([
      {
        match: 'dataType=Branded',
        body: {
          foods: [
            {
              gtinUpc: b,
              description: 'Branded bread',
              foodNutrients: [
                { nutrientId: 1008, value: 260 },
                { nutrientId: 1005, value: 49 },
              ],
            },
          ],
        },
      },
    ]);
    const hit = (await lookupBarcodeMulti(b))!;
    expect(hit.per100g).toMatchObject({ carbs: 49, carbs_known: true });
    expect(hit.provenance).toEqual({ origin: 'usda', trusted_for_dosing: true });
    // Open Food Facts was asked before USDA, exactly as before.
    const firstOff = requested.findIndex((u) => u.includes('openfoodfacts.org'));
    const firstUsda = requested.findIndex((u) => u.includes('dataType=Branded'));
    expect(firstOff).toBeGreaterThanOrEqual(0);
    expect(firstOff).toBeLessThan(firstUsda);
  });

  it('a UPCitemdb name is filed under the provider that supplied the NUMBERS', async () => {
    // UPCitemdb only knows names. Filing the meal under "UPCitemdb" — or under
    // Open Food Facts when USDA answered — would be a provenance the numbers do
    // not have.
    const b = nextBarcode();
    stubFetch([
      { match: 'upcitemdb.com', body: { items: [{ title: 'Mystery bar' }] } },
      {
        match: 'fdc/v1/foods/search',
        body: {
          foods: [
            {
              fdcId: 9,
              description: 'Mystery bar',
              foodNutrients: [
                { nutrientNumber: '1008', value: 400 },
                { nutrientNumber: '1005', value: 55 },
              ],
            },
          ],
        },
      },
    ]);
    const hit = (await lookupBarcodeMulti(b))!;
    expect(hit.name).toBe('Mystery bar');
    expect(hit.provenance).toEqual({ origin: 'usda', trusted_for_dosing: true });
    expect(hit.per100g.carbs_known).toBe(true);
  });
});

/* ── Step 11a still applies on top ────────────────────────── */

describe('the Step 11a bounds still fire on a catalogue row', () => {
  it('an impossible carbohydrate on a TRUSTED row is still made unknown', async () => {
    // Two independent defences, in the right order: Step 12 decides whether the
    // source may be believed, Step 11a whether the number is possible. This is
    // the composition the barcode screen performs (`sanitizePer100g`).
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, source: 'openfoodfacts', carbs: 9999 }));
    const p = (await findInCatalog(b))!;
    expect(p.per100g.carbs_known).toBe(true); // trusted source…

    const safe = sanitizePer100g(p.per100g);
    expect(safe.issues).toContain('carbs'); // …impossible figure
    expect(safe.per100g.carbs_known).toBe(false); // → unknown, not clamped
    expect(p.per100g.carbs).toBe(9999); // the read itself is not rewritten
  });

  it('an implausible UNTRUSTED row is unknown for both reasons', async () => {
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, source: 'user', carbs: 9999 }));
    const p = (await findInCatalog(b))!;
    expect(p.per100g.carbs_known).toBe(false);
    expect(sanitizePer100g(p.per100g).issues).toContain('carbs');
  });
});

/* ── NUTR-B5: the memo has a lifetime ─────────────────────── */

describe('findInCatalog memo — bounded, and refreshed by a write (NUTR-B5)', () => {
  it('serves a re-scan from memory without re-querying', async () => {
    vi.useFakeTimers();
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, source: 'usda', carbs: 30 }));
    expect((await findInCatalog(b))!.per100g.carbs).toBe(30);

    catalogRows.length = 0; // the double would now answer with nothing
    vi.advanceTimersByTime(60 * 1000); // one minute later
    expect((await findInCatalog(b))!.per100g.carbs).toBe(30); // still memoised
  });

  it('picks up a correction once the entry has aged out', async () => {
    // BEFORE Step 12 this returned the stale 60 g for the whole session.
    vi.useFakeTimers();
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, source: 'usda', carbs: 60 }));
    expect((await findInCatalog(b))!.per100g.carbs).toBe(60);

    catalogRows.length = 0;
    catalogRows.push(row({ barcode: b, source: 'usda', carbs: 12 }));

    vi.advanceTimersByTime(5 * 60 * 1000); // the TTL
    expect((await findInCatalog(b))!.per100g.carbs).toBe(12);
  });

  it('a write refreshes the entry instead of leaving the pre-write row', async () => {
    vi.useFakeTimers();
    const b = nextBarcode();
    catalogRows.push(row({ barcode: b, name: 'Before', source: 'user', carbs: 60 }));
    expect((await findInCatalog(b))!.per100g.carbs).toBe(60);

    // The patient reads the packaging and contributes the real figures.
    saveToCatalog(
      {
        barcode: b,
        name: 'After',
        per100g: {
          calories: 250,
          carbs: 18,
          carbs_known: true,
          sugar: 2,
          protein: 4,
          fat: 5,
          fiber: 1,
          sodium: 3,
        },
      },
      'user',
      true
    );

    const p = (await findInCatalog(b))!;
    expect(p.name).toBe('After');
    expect(p.per100g.carbs).toBe(18);
    // Their own reading, typed on THIS device, stays usable for the dose…
    expect(p.per100g.carbs_known).toBe(true);
    // …while the row itself is still recorded as a patient contribution, so a
    // later scan (or another patient) does not inherit that trust.
    expect(p.provenance).toMatchObject({
      origin: 'product_catalog',
      catalog_source: 'user',
      verified: false,
      trusted_for_dosing: false,
    });
  });

  it('a refreshed entry also expires', async () => {
    vi.useFakeTimers();
    const b = nextBarcode();
    saveToCatalog(
      {
        barcode: b,
        name: 'Written',
        per100g: {
          calories: 100,
          carbs: 5,
          carbs_known: true,
          sugar: 0,
          protein: 0,
          fat: 0,
          fiber: 0,
          sodium: 0,
        },
      },
      'user',
      true
    );
    expect((await findInCatalog(b))!.name).toBe('Written');

    catalogRows.push(row({ barcode: b, name: 'Server truth', source: 'usda', carbs: 7 }));
    vi.advanceTimersByTime(5 * 60 * 1000);
    const p = (await findInCatalog(b))!;
    expect(p.name).toBe('Server truth');
    expect(p.per100g).toMatchObject({ carbs: 7, carbs_known: true });
  });
});

/* ── Honest provenance ────────────────────────────────────── */

describe('no origin is ever labelled as a database it did not come from', () => {
  it('every path reports an origin that is a real NutritionSource', async () => {
    // The barcode screen files the saved meal under `provenance.origin`, which
    // used to be the constant `'openfoodfacts'` regardless of where the numbers
    // came from. These are the four origins that reach it.
    const valid = ['openfoodfacts', 'usda', 'product_catalog', 'user_label'];

    const b1 = nextBarcode();
    catalogRows.push(row({ barcode: b1, source: 'user' }));
    stubFetch();
    const fromCatalog = (await lookupBarcodeMulti(b1))!;
    expect(valid).toContain(fromCatalog.provenance.origin);
    expect(fromCatalog.provenance.origin).not.toBe('openfoodfacts');

    catalogRows.length = 0;
    const b2 = nextBarcode();
    stubFetch([offRoute(b2, 20)]);
    const fromOff = (await lookupBarcodeMulti(b2))!;
    expect(fromOff.provenance.origin).toBe('openfoodfacts');

    const b3 = nextBarcode();
    stubFetch([
      { match: `/api/v2/product/${b3}`, body: { status: 1, product: { product_name: 'Name only' } } },
    ]);
    const nameOnly = (await lookupBarcodeMulti(b3))!;
    // The NAME is Open Food Facts', so that is what the origin says — but a
    // name-only entry carries nothing but placeholders, so nothing here is
    // authoritative and the patient is next. (The UPCitemdb name-only path
    // reports `user_label` instead, because no `NutritionSource` member names
    // that index and inventing one is outside this step.)
    expect(nameOnly.provenance).toEqual({ origin: 'openfoodfacts', trusted_for_dosing: false });
    expect(nameOnly.per100g.carbs_known).toBe(false);
    expect(nameOnly.per100g.calories).toBe(0);
  });
});
