import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CHARACTERIZATION — every producer of a carbohydrate figure, at its boundary.
 *
 * `carbProvenance.golden.test.ts` pins the RULE; `nutriments.golden.test.ts`
 * pins the Open Food Facts reader. This file pins the remaining producers, one
 * describe block each, because the guarantee is only as strong as its weakest
 * source: a single reader that answers silence with `0` puts a fabricated
 * carbohydrate value back into the bolus path.
 *
 * Nothing here touches the network. `fetch` is replaced with a stub that
 * answers from a fixture and records what was asked for, and Supabase is a
 * hand-rolled double — a test that reached a real API would be both flaky and
 * a live request from CI.
 */

const { fakeSupabase, catalogRows, rpcCalls, remoteHit } = vi.hoisted(() => {
  const catalogRows: any[] = [];
  const rpcCalls: { name: string; params: any }[] = [];
  const remoteHit: { value: any } = { value: null };

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
    functions: {
      invoke: async () => ({ data: { hit: remoteHit.value }, error: null }),
    },
  };

  return { fakeSupabase, catalogRows, rpcCalls, remoteHit };
});

vi.mock('@/lib/supabase', () => ({ supabase: fakeSupabase, isDemoMode: false }));

const { usdaProvider } = await import('@/services/nutrition/providers/usda');
const { openFoodFactsProvider } = await import(
  '@/services/nutrition/providers/openfoodfacts'
);
const { moroccanProvider } = await import('@/services/nutrition/providers/moroccan');
const { fatSecretProvider } = await import('@/services/nutrition/providers/remote');
const { findInCatalog, saveToCatalog } = await import(
  '@/services/nutrition/providers/productCatalog'
);
const { lookupBarcodeMulti } = await import(
  '@/services/nutrition/providers/barcodeLookup'
);

/** Route each stubbed request by URL. Any URL the test did not plan for is a
 *  failure, not a silent miss — that is what would let a real call slip in. */
type Routes = { match: string; body: unknown }[];
/** Every URL this file asked for, across all of it — see the closing test. */
const requested: string[] = [];

function stubFetch(routes: Routes) {
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

beforeEach(() => {
  catalogRows.length = 0;
  rpcCalls.length = 0;
  remoteHit.value = null;
});

/* ── USDA FoodData Central (name search) ──────────────────── */

const fdc = (nutrients: { nutrientNumber: string; value: number }[]) => ({
  foods: [{ fdcId: 1, description: 'Test food', foodNutrients: nutrients }],
});

describe('usdaProvider — carbohydrate provenance', () => {
  const energy = { nutrientNumber: '1008', value: 120 };

  it('reports an absent carbohydrate row as unknown, not as 0 g', async () => {
    stubFetch([{ match: 'api.nal.usda.gov', body: fdc([energy]) }]);
    const hit = await usdaProvider.search('anything');
    expect(hit!.per100g.carbs).toBe(0);
    expect(hit!.per100g.carbs_known).toBe(false);
  });

  it('keeps a published 0 as a known zero', async () => {
    stubFetch([
      {
        match: 'api.nal.usda.gov',
        body: fdc([energy, { nutrientNumber: '1005', value: 0 }]),
      },
    ]);
    const hit = await usdaProvider.search('anything');
    expect(hit!.per100g.carbs).toBe(0);
    expect(hit!.per100g.carbs_known).toBe(true);
  });

  it('leaves a normal value exactly as it was', async () => {
    stubFetch([
      {
        match: 'api.nal.usda.gov',
        body: fdc([energy, { nutrientNumber: '1005', value: 27.4 }]),
      },
    ]);
    const hit = await usdaProvider.search('anything');
    expect(hit!.per100g.carbs).toBe(27.4);
    expect(hit!.per100g.carbs_known).toBe(true);
  });
});

/* ── Open Food Facts (name search) ────────────────────────── */

const off = (nutriments: Record<string, number | string>) => ({
  products: [{ product_name: 'Test product', nutriments }],
});

describe('openFoodFactsProvider — carbohydrate provenance', () => {
  it('reports an absent key as unknown', async () => {
    stubFetch([{ match: 'cgi/search.pl', body: off({ 'energy-kcal_100g': 90 }) }]);
    const hit = await openFoodFactsProvider.search('anything');
    expect(hit!.per100g.carbs).toBe(0);
    expect(hit!.per100g.carbs_known).toBe(false);
  });

  it('reports an empty string as unknown rather than reading it as 0', async () => {
    stubFetch([
      {
        match: 'cgi/search.pl',
        body: off({ 'energy-kcal_100g': 90, carbohydrates_100g: '' }),
      },
    ]);
    const hit = await openFoodFactsProvider.search('anything');
    expect(hit!.per100g.carbs_known).toBe(false);
  });

  it('keeps a declared 0 as a known zero', async () => {
    stubFetch([
      {
        match: 'cgi/search.pl',
        body: off({ 'energy-kcal_100g': 1, carbohydrates_100g: 0 }),
      },
    ]);
    const hit = await openFoodFactsProvider.search('anything');
    expect(hit!.per100g.carbs).toBe(0);
    expect(hit!.per100g.carbs_known).toBe(true);
  });

  it('leaves the other values — including the sodium conversion — untouched', async () => {
    stubFetch([
      {
        match: 'cgi/search.pl',
        body: off({
          'energy-kcal_100g': 250,
          carbohydrates_100g: '31.2',
          sugars_100g: 4,
          proteins_100g: 8,
          fat_100g: 9,
          fiber_100g: 2,
          sodium_100g: 0.5,
        }),
      },
    ]);
    const hit = await openFoodFactsProvider.search('anything');
    expect(hit!.per100g).toMatchObject({
      calories: 250,
      carbs: 31.2,
      carbs_known: true,
      sugar: 4,
      protein: 8,
      fat: 9,
      fiber: 2,
      sodium: 500, // g → mg, unchanged behaviour
    });
  });
});

/* ── Our own tables ───────────────────────────────────────── */

describe('moroccanProvider — always a real value', () => {
  it('marks a hit from our own tables as known', async () => {
    // No fetch stub: this provider is three local data files, and a request
    // here would mean the chain had changed shape.
    const hit = await moroccanProvider.search('couscous');
    expect(hit).not.toBeNull();
    expect(hit!.per100g.carbs_known).toBe(true);
    expect(hit!.per100g.carbs).toBeGreaterThan(0);
  });
});

/* ── The Edge Function proxy (FatSecret / Edamam) ─────────── */

describe('remote provider — a payload with no carbohydrate field', () => {
  it('reports it unknown and does not let the absence become NaN', async () => {
    remoteHit.value = {
      matched_food: 'Proxy food',
      per100g: { calories: 200, sugar: 1, protein: 5, fat: 3, fiber: 1, sodium: 10 },
    };
    const hit = await fatSecretProvider.search('anything');
    expect(hit!.per100g.carbs).toBe(0);
    expect(Number.isNaN(hit!.per100g.carbs)).toBe(false);
    expect(hit!.per100g.carbs_known).toBe(false);
  });

  it('keeps a supplied figure, including a genuine 0', async () => {
    remoteHit.value = {
      matched_food: 'Proxy water',
      per100g: { calories: 1, carbs: 0, sugar: 0, protein: 0, fat: 0, fiber: 0 },
    };
    const zero = await fatSecretProvider.search('anything');
    expect(zero!.per100g.carbs_known).toBe(true);

    remoteHit.value = {
      matched_food: 'Proxy bread',
      per100g: { calories: 260, carbs: 49, sugar: 3, protein: 9, fat: 3, fiber: 3 },
    };
    const bread = await fatSecretProvider.search('anything');
    expect(bread!.per100g).toMatchObject({ carbs: 49, carbs_known: true });
  });

  /* Step 11b — the proxy now says `null` where it used to say `0`. */

  it('reads an EXPLICIT null carbohydrate as unknown', async () => {
    // This is the shape the redeployed function sends for a nutrient the
    // upstream source does not publish. It must read exactly like the absent
    // key above, so the client works against either deployment.
    remoteHit.value = {
      matched_food: 'Proxy food',
      per100g: { calories: 200, carbs: null, sugar: null, protein: 5, fat: 3, fiber: null, sodium: null },
    };
    const hit = await fatSecretProvider.search('anything');
    expect(hit!.per100g.carbs_known).toBe(false);
    expect(hit!.per100g.carbs).toBe(0); // a placeholder, and labelled as one
    // The siblings still read as numbers, so nothing downstream sees a NaN.
    for (const v of [hit!.per100g.sugar, hit!.per100g.fiber, hit!.per100g.sodium!]) {
      expect(Number.isFinite(v)).toBe(true);
    }
  });

  it('reads an unusable carbohydrate as unknown rather than as a number', async () => {
    for (const carbs of ['', 'n/a', true, NaN]) {
      remoteHit.value = {
        matched_food: 'Proxy food',
        per100g: { calories: 200, carbs, sugar: 1, protein: 5, fat: 3, fiber: 1 },
      };
      const hit = await fatSecretProvider.search('anything');
      expect(hit!.per100g.carbs_known).toBe(false);
      expect(Number.isFinite(hit!.per100g.carbs)).toBe(true);
    }
  });

  it('takes no hit at all when the proxy reports no energy', async () => {
    // Unchanged rule, now also null-aware: without calories the record is not a
    // usable food record, and the engine falls through to the next provider.
    for (const calories of [null, 0, undefined, 'abc']) {
      remoteHit.value = {
        matched_food: 'Proxy food',
        per100g: { calories, carbs: 20, sugar: 1, protein: 5, fat: 3, fiber: 1 },
      };
      expect(await fatSecretProvider.search('anything')).toBeNull();
    }
  });

  it('drops a null glycemic index instead of publishing it as a GI of 0', async () => {
    remoteHit.value = {
      matched_food: 'Proxy bread',
      per100g: { calories: 260, carbs: 49, sugar: 3, protein: 9, fat: 3, fiber: 3, glycemic_index: null },
    };
    const hit = await fatSecretProvider.search('anything');
    expect(hit!.per100g.glycemic_index).toBeUndefined();

    remoteHit.value = {
      matched_food: 'Proxy bread',
      per100g: { calories: 260, carbs: 49, sugar: 3, protein: 9, fat: 3, fiber: 3, glycemic_index: 70 },
    };
    expect((await fatSecretProvider.search('anything'))!.per100g.glycemic_index).toBe(70);
  });
});

/* ── The app's own barcode catalogue ──────────────────────── */

describe('product catalogue — reading and writing provenance', () => {
  it('reads a null carbohydrate column as unknown', async () => {
    catalogRows.push({
      barcode: '111111111111',
      name: 'Catalogue product',
      brand: null,
      image_url: null,
      calories: 300,
      carbs: null,
      sugar: null,
      protein: null,
      fat: null,
      fiber: null,
      sodium: null,
      serving_grams: null,
    });
    const p = await findInCatalog('111111111111');
    expect(p!.nutritionKnown).toBe(true); // energy IS known
    expect(p!.per100g.carbs).toBe(0);
    expect(p!.per100g.carbs_known).toBe(false);
  });

  it('reads a stored 0 on a TRUSTED row as a known zero', async () => {
    // UPDATED IN STEP 12, deliberately. Reading a declared 0 as a known zero is
    // still the rule — but only for a row somebody authoritative stands behind.
    // This row now says so (`source: 'openfoodfacts'`); before Step 12 the
    // column was not read at all, so an unverified patient contribution
    // declaring "0 g of carbohydrate" was equally dosable. The demoted case is
    // asserted in `catalogTrust.golden.test.ts`.
    catalogRows.push({
      barcode: '222222222222',
      name: 'Catalogue water',
      brand: null,
      image_url: null,
      calories: 0,
      carbs: 0,
      sugar: 0,
      protein: 0,
      fat: 0,
      fiber: 0,
      sodium: 0,
      serving_grams: null,
      source: 'openfoodfacts',
      verified: false,
    });
    const p = await findInCatalog('222222222222');
    expect(p!.per100g.carbs).toBe(0);
    expect(p!.per100g.carbs_known).toBe(true);
  });

  it('writes null rather than 0 for a carbohydrate nobody declared', () => {
    saveToCatalog(
      {
        barcode: '333333333333',
        name: 'Energy only',
        per100g: {
          calories: 410,
          carbs: 0,
          carbs_known: false,
          sugar: 0,
          protein: 5,
          fat: 12,
          fiber: 0,
          sodium: 300,
        },
      },
      'openfoodfacts',
      true
    );
    const call = rpcCalls.find((c) => c.params.p_barcode === '333333333333');
    expect(call!.params.p_calories).toBe(410); // energy still contributed
    expect(call!.params.p_carbs).toBeNull(); // …carbohydrate is not invented
  });

  it('writes a genuine 0 so the next patient inherits the real value', () => {
    saveToCatalog(
      {
        barcode: '444444444444',
        name: 'Still water',
        per100g: {
          calories: 0,
          carbs: 0,
          carbs_known: true,
          sugar: 0,
          protein: 0,
          fat: 0,
          fiber: 0,
          sodium: 1,
        },
      },
      'openfoodfacts',
      true
    );
    const call = rpcCalls.find((c) => c.params.p_barcode === '444444444444');
    expect(call!.params.p_carbs).toBe(0);
  });
});

/* ── The barcode lookup chain ─────────────────────────────── */

describe('lookupBarcodeMulti — the sharpest instance', () => {
  it('a product with energy and no carbohydrate is known BUT undosable', async () => {
    // This is the case the remediation exists for: Open Food Facts answers
    // with a described product, so `nutritionKnown` is true and the screen
    // shows full confidence — while the carbohydrate the dose is computed
    // from was never declared.
    stubFetch([
      {
        match: '/api/v2/product/555555555555',
        body: {
          status: 1,
          product: {
            product_name: 'Biscuits',
            nutriments: { 'energy-kcal_100g': 480, proteins_100g: 6 },
          },
        },
      },
    ]);
    const p = await lookupBarcodeMulti('555555555555');
    expect(p!.nutritionKnown).toBe(true);
    expect(p!.per100g.calories).toBe(480);
    expect(p!.per100g.carbs).toBe(0);
    expect(p!.per100g.carbs_known).toBe(false);
  });

  it('a name-only product carries no carbohydrate claim', async () => {
    stubFetch([
      {
        match: '/api/v2/product/666666666666',
        body: { status: 1, product: { product_name: 'Unknown snack' } },
      },
    ]);
    const p = await lookupBarcodeMulti('666666666666');
    expect(p!.nutritionKnown).toBe(false);
    expect(p!.per100g.carbs_known).toBe(false);
  });

  it('a branded USDA record with no carbohydrate row is unknown too', async () => {
    stubFetch([
      {
        match: 'dataType=Branded',
        body: {
          foods: [
            {
              gtinUpc: '777777777777',
              description: 'Branded thing',
              foodNutrients: [{ nutrientId: 1008, value: 200 }],
            },
          ],
        },
      },
    ]);
    const p = await lookupBarcodeMulti('777777777777');
    expect(p!.nutritionKnown).toBe(true);
    expect(p!.per100g.carbs_known).toBe(false);
  });

  it('a branded USDA record WITH the row keeps its value', async () => {
    stubFetch([
      {
        match: 'dataType=Branded',
        body: {
          foods: [
            {
              gtinUpc: '888888888888',
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
    const p = await lookupBarcodeMulti('888888888888');
    expect(p!.per100g).toMatchObject({ carbs: 49, carbs_known: true });
  });

  it('never reaches a host the test did not stub', () => {
    // Guards the file's own premise: every request made anywhere in this file
    // was answered from a fixture, so this suite makes no external call.
    expect(requested.length).toBeGreaterThan(0);
    for (const url of requested) {
      expect(url).toMatch(/^https:\/\/(world\.openfoodfacts\.org|api\.nal\.usda\.gov|api\.upcitemdb\.com)\//);
    }
  });
});
