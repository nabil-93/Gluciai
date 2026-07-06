// Supabase Edge Function: server-side nutrition lookup for providers that
// require secret credentials (FatSecret OAuth, Edamam app id/key). The
// React Native client never holds these keys — it calls this function via
// the `fatSecretProvider` / `edamamProvider` in the nutrition engine.
//
// Contract:
//   POST { provider: "fatsecret" | "edamam", query: string }
//   ->   { hit: { matched_food, food_id?, per100g, match_score? } | null }
//
// Deploy:  supabase functions deploy nutrition-search
// Secrets (optional — provider is skipped when its secrets are missing):
//   supabase secrets set FATSECRET_CLIENT_ID=...  FATSECRET_CLIENT_SECRET=...
//   supabase secrets set EDAMAM_APP_ID=...        EDAMAM_APP_KEY=...

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

interface Per100g {
  calories: number;
  carbs: number;
  sugar: number;
  protein: number;
  fat: number;
  fiber: number;
  sodium?: number;
}
interface Hit {
  matched_food: string;
  food_id?: string;
  per100g: Per100g;
  match_score?: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const { provider, query } = await req.json();
    if (!query || typeof query !== 'string') {
      return json({ error: 'query is required' }, 400);
    }

    let hit: Hit | null = null;
    if (provider === 'fatsecret') hit = await searchFatSecret(query);
    else if (provider === 'edamam') hit = await searchEdamam(query);
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

  const grams = numField(s.metric_serving_amount, 0);
  const unit = String(s.metric_serving_unit ?? '').toLowerCase();
  // Only trust gram-based servings for a clean per-100g conversion.
  const factor = grams > 0 && unit === 'g' ? 100 / grams : 1;

  const per100g: Per100g = {
    calories: Math.round(numField(s.calories) * factor),
    carbs: round1(numField(s.carbohydrate) * factor),
    sugar: round1(numField(s.sugar) * factor),
    protein: round1(numField(s.protein) * factor),
    fat: round1(numField(s.fat) * factor),
    fiber: round1(numField(s.fiber) * factor),
    sodium: Math.round(numField(s.sodium) * factor), // mg
  };
  if (!(per100g.calories > 0)) return null;

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
  const n = food.nutrients; // Edamam nutrients are already per 100 g

  const per100g: Per100g = {
    calories: Math.round(numField(n.ENERC_KCAL)),
    carbs: round1(numField(n.CHOCDF)),
    sugar: round1(numField(n.SUGAR)),
    protein: round1(numField(n.PROCNT)),
    fat: round1(numField(n.FAT)),
    fiber: round1(numField(n.FIBTG)),
    sodium: Math.round(numField(n.NA)), // mg per 100 g
  };
  if (!(per100g.calories > 0)) return null;

  return {
    matched_food: String(food.label ?? query),
    food_id: food.foodId ? String(food.foodId) : undefined,
    per100g,
  };
}

/* ─────────────────────────────── HELPERS ────────────────────────────── */

function numField(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : fallback;
}
function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
