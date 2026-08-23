// Supabase Edge Function: server-side nutrition lookup for providers that
// require secret credentials (FatSecret OAuth, Edamam app id/key). The
// React Native client never holds these keys — it calls this function via
// the `fatSecretProvider` / `edamamProvider` in the nutrition engine.
//
// Contract:
//   POST { provider: "fatsecret" | "edamam", query: string }
//   ->   { hit: { matched_food, food_id?, per100g, match_score? } | null }
//
// `per100g` values are `number | null`: a nutrient the upstream source does not
// publish is null, NEVER 0 — the client tells a measured zero from a missing one
// and refuses to dose the latter. A FatSecret serving whose metric basis is not
// grams yields NO hit at all rather than per-serving numbers wearing a per-100 g
// label (see normalize.ts).
//
// Deploy:  supabase functions deploy nutrition-search
// Secrets (optional — provider is skipped when its secrets are missing):
//   supabase secrets set FATSECRET_CLIENT_ID=...  FATSECRET_CLIENT_SECRET=...
//   supabase secrets set EDAMAM_APP_ID=...        EDAMAM_APP_KEY=...

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { callerUserId } from '../_shared/usage.ts';
import { edamamPer100g, fatSecretPer100g, type Hit } from './normalize.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  // A REAL signed-in user, before any provider work (finding P3/P4).
  //
  // Platform `verify_jwt` only checks the JWT signature, and the anon key —
  // which ships inside the published web bundle and the mobile binary — is a
  // validly signed JWT. So until this check existed, anyone holding the public
  // key could drive this function in a loop and spend the project's FatSecret
  // and Edamam credentials. That costs money, and when a provider rate-limits
  // the project it silently removes the fallback tier of the nutrition chain
  // for every patient.
  //
  // The check runs before the body is read, so an unauthenticated request
  // costs one token lookup and reaches no provider at all.
  if (!(await callerUserId(req))) {
    return json({ error: 'unauthorized' }, 401);
  }

  try {
    const { provider, query } = await req.json();
    if (!query || typeof query !== 'string') {
      return json({ error: 'query is required' }, 400);
    }

    let hit: Hit | null = null;
    if (provider === 'fatsecret') hit = await searchFatSecret(query);
    else if (provider === 'edamam') hit = await searchEdamam(query);
    else if (provider === 'usda') hit = await searchUsda(query);
    else if (provider === 'usda_gtin') hit = await searchUsdaGtin(query);
    else return json({ error: `unknown provider: ${provider}` }, 400);

    return json({ hit });
  } catch (error) {
    // Never fail hard — the engine treats a null hit as "fall through".
    return json({ hit: null, error: String(error) });
  }
});

/* ─────────────────────────────── FATSECRET ──────────────────────────── */

let fatSecretToken: { value: string; expires: number } | null = null;

async function fatSecretAccessToken(): Promise<string | null> {
  const id = Deno.env.get('FATSECRET_CLIENT_ID');
  const secret = Deno.env.get('FATSECRET_CLIENT_SECRET');
  if (!id || !secret) return null;

  // Cache the token until ~60s before expiry.
  if (fatSecretToken && fatSecretToken.expires > Date.now() + 60_000) {
    return fatSecretToken.value;
  }

  const res = await fetch('https://oauth.fatsecret.com/connect/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials&scope=basic',
  });
  if (!res.ok) return null;
  const data = await res.json();
  if (!data.access_token) return null;
  fatSecretToken = {
    value: data.access_token,
    expires: Date.now() + (data.expires_in ?? 3600) * 1000,
  };
  return fatSecretToken.value;
}

async function searchFatSecret(query: string): Promise<Hit | null> {
  const token = await fatSecretAccessToken();
  if (!token) return null;

  // 1 — find the best food id for the query.
  const searchUrl =
    'https://platform.fatsecret.com/rest/server.api' +
    `?method=foods.search&format=json&max_results=1&search_expression=${encodeURIComponent(query)}`;
  const searchRes = await fetch(searchUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!searchRes.ok) return null;
  const searchData = await searchRes.json();
  const food = searchData?.foods?.food;
  const first = Array.isArray(food) ? food[0] : food;
  if (!first?.food_id) return null;

  // 2 — pull per-serving nutrition and normalize to per 100 g.
  const getUrl =
    'https://platform.fatsecret.com/rest/server.api' +
    `?method=food.get.v2&format=json&food_id=${encodeURIComponent(first.food_id)}`;
  const getRes = await fetch(getUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!getRes.ok) return null;
  const detail = await getRes.json();
  const servings = detail?.food?.servings?.serving;
  const s = Array.isArray(servings) ? servings[0] : servings;
  if (!s) return null;

  // Per-serving → per-100 g. Returns null when the serving's basis is not in
  // grams: emitting per-serving numbers as per-100 g ones is a wrong
  // carbohydrate, and the engine simply falls through to the next provider.
  const per100g = fatSecretPer100g(s);
  if (!per100g) return null;

  return {
    matched_food: String(first.food_name ?? query),
    food_id: String(first.food_id),
    per100g,
  };
}

/* ──────────────────────────────── EDAMAM ────────────────────────────── */

async function searchEdamam(query: string): Promise<Hit | null> {
  const appId = Deno.env.get('EDAMAM_APP_ID');
  const appKey = Deno.env.get('EDAMAM_APP_KEY');
  if (!appId || !appKey) return null;

  const url =
    'https://api.edamam.com/api/food-database/v2/parser' +
    `?app_id=${encodeURIComponent(appId)}&app_key=${encodeURIComponent(appKey)}` +
    `&nutrition-type=logging&ingr=${encodeURIComponent(query)}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();

  // Prefer the parsed match; else the first hint.
  const food =
    data?.parsed?.[0]?.food ?? data?.hints?.[0]?.food ?? null;
  if (!food?.nutrients) return null;

  // Edamam publishes per 100 g already, so there is no basis to establish —
  // only absence to preserve (a nutrient it does not publish stays `null`).
  const per100g = edamamPer100g(food.nutrients);
  if (!per100g) return null;

  return {
    matched_food: String(food.label ?? query),
    food_id: food.foodId ? String(food.foodId) : undefined,
    per100g,
  };
}

/* ──────────────────────────────── USDA ──────────────────────────────── */

/*
 * F-1 — THE USDA KEY MOVED HERE.
 *
 * The client used to read `process.env.EXPO_PUBLIC_USDA_API_KEY`. Anything
 * named `EXPO_PUBLIC_*` is INLINED INTO THE BUNDLE at build time, so the key
 * shipped inside the APK and could be lifted straight out of it. Worse, it
 * fell back to `DEMO_KEY`, which USDA caps at 30 requests/hour and 50/day —
 * so an unset build variable silently reduced branded-food lookup to nothing,
 * invisibly, because the provider chain swallows failures by design.
 *
 * The key now lives only in this function's secrets, alongside FatSecret's and
 * Edamam's, and reaches USDA from the server. The client calls this proxy and
 * receives the same normalized shape it already handled — no nutrient values,
 * no precedence, and no provenance semantics change.
 *
 * Secret (optional — the provider is skipped when it is missing, exactly like
 * the other two):
 *   supabase secrets set USDA_API_KEY=...
 *
 * NOTE: no `DEMO_KEY` fallback. A key-less deployment returns null and the
 * engine falls through, which is honest. Silently running on a 50/day quota
 * looks like "USDA rarely matches" rather than "USDA is not configured".
 */

/** FDC nutrient numbers, per 100 g. Both the legacy and current ids. */
const FDC_NUTRIENTS = {
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
}

interface FdcFood {
  fdcId?: number;
  description?: string;
  brandOwner?: string;
  foodNutrients?: FdcNutrient[];
}

/**
 * The value FDC published, or null when this food carries no such nutrient.
 *
 * This is the whole reason the port had to be done by hand rather than by
 * moving the URL: a published 0 is a MEASUREMENT and must arrive as 0, while
 * an absent row must arrive as null. Collapsing the two would hand the client
 * a measured "0 g of carbohydrate" for a food nobody measured — and that
 * number reaches a bolus.
 */
function fdcPick(
  nutrients: FdcNutrient[],
  numbers: readonly string[]
): number | null {
  for (const n of nutrients) {
    const num = n.nutrientNumber ?? String(n.nutrientId ?? '');
    if (numbers.includes(num) && typeof n.value === 'number') return n.value;
  }
  return null;
}

/** Shared shape-builder for both USDA entry points. */
function fdcHit(food: FdcFood): Hit | null {
  const nutrients = food.foodNutrients ?? [];
  if (!nutrients.length) return null;

  const calories = fdcPick(nutrients, FDC_NUTRIENTS.energy);
  // Same gate the client applied: no energy → not a described food.
  if (calories === null || !(calories > 0)) return null;

  const name = food.description?.trim();
  if (!name) return null;

  return {
    matched_food: name,
    food_id: food.fdcId !== undefined ? String(food.fdcId) : undefined,
    per100g: {
      calories,
      carbs: fdcPick(nutrients, FDC_NUTRIENTS.carbs),
      sugar: fdcPick(nutrients, FDC_NUTRIENTS.sugar),
      protein: fdcPick(nutrients, FDC_NUTRIENTS.protein),
      fat: fdcPick(nutrients, FDC_NUTRIENTS.fat),
      fiber: fdcPick(nutrients, FDC_NUTRIENTS.fiber),
      sodium: fdcPick(nutrients, FDC_NUTRIENTS.sodium),
      // USDA does not publish a glycemic index.
      glycemic_index: null,
    },
  };
}

async function fdcSearch(params: string): Promise<FdcFood | null> {
  const key = Deno.env.get('USDA_API_KEY');
  if (!key) return null;
  const res = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}&${params}`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { foods?: FdcFood[] };
  return data.foods?.[0] ?? null;
}

/** Generic food search — the `usdaProvider` path. */
async function searchUsda(query: string): Promise<Hit | null> {
  const food = await fdcSearch(
    `query=${encodeURIComponent(query)}` +
      `&dataType=${encodeURIComponent('Foundation,SR Legacy')}` +
      `&pageSize=1&sortBy=dataType.keyword`
  );
  return food ? fdcHit(food) : null;
}

/**
 * Branded foods indexed by GTIN/UPC — the barcode path.
 *
 * ONLY AN EXACT GTIN MATCH IS TRUSTED. `/foods/search` is a TEXT search: given
 * a code it does not hold, it happily returns unrelated branded foods, and
 * accepting the first one would attach another product's carbohydrate figure
 * to the thing in the patient's hand. The device-side version enforced this
 * and the rule moves here unchanged — leading zeros normalised on both sides,
 * because FDC and the scanner disagree about them.
 */
async function searchUsdaGtin(barcode: string): Promise<Hit | null> {
  const key = Deno.env.get('USDA_API_KEY');
  if (!key) return null;
  const res = await fetch(
    `https://api.nal.usda.gov/fdc/v1/foods/search?api_key=${encodeURIComponent(key)}` +
      `&query=${encodeURIComponent(barcode)}&dataType=${encodeURIComponent('Branded')}&pageSize=5`
  );
  if (!res.ok) return null;
  const data = (await res.json()) as {
    foods?: (FdcFood & { gtinUpc?: string; brandName?: string })[];
  };
  const strip = (s: string) => s.replace(/^0+/, '');
  const food = (data.foods ?? []).find(
    (f) => strip(String(f.gtinUpc ?? '')) === strip(barcode)
  );
  if (!food) return null;

  const hit = fdcHit(food);
  if (!hit) return null;
  // The brand is part of how a patient recognises a scanned product.
  const brand = food.brandOwner ?? food.brandName;
  return brand ? { ...hit, matched_food: `${brand} ${hit.matched_food}`.trim() } : hit;
}

/* ─────────────────────────────── HELPERS ────────────────────────────── */

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
