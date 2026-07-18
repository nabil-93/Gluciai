// Supabase Edge Function: world food search proxy.
//
// The app's "Base mondiale" tab searches Open Food Facts (millions of
// products, real photos, per-100 g nutrition). Browsers sometimes fail to
// call OFF directly (bot protection / CORS quirks), so this tiny proxy
// does the fetch server-side with a proper User-Agent and returns a
// normalized payload with our own CORS headers.
//
// Deploy: supabase functions deploy food-search

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const UA = 'GluciAI/1.0 (diabetes education app; contact: support@gluciai.app)';

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  return Number.isFinite(n) ? n : 0;
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const { q = '', page = 1 } = await req.json();
    const query = String(q).trim().slice(0, 80);
    const pg = Math.max(1, Number(page) || 1);
    const FIELDS =
      'code,product_name,product_name_fr,brands,image_front_url,image_front_small_url,nutriments';

    // Endpoints to try in order. With a query: both search backends.
    // WITHOUT a query (the browse view shown when the tab opens): the most
    // scanned products in MOROCCO first — that's who uses the app — then
    // the global bestsellers as fallback.
    const attempts =
      query.length >= 2
        ? [
            `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
              `&search_simple=1&action=process&json=1&page_size=24&page=${pg}&fields=${FIELDS}`,
            `https://search.openfoodfacts.org/search?q=${encodeURIComponent(query)}&page_size=24&page=${pg}&fields=${FIELDS}`,
            `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(query)}` +
              `&search_simple=1&action=process&json=1&page_size=24&page=${pg}&fields=${FIELDS}`,
          ]
        : [
            `https://world.openfoodfacts.org/api/v2/search?countries_tags_en=morocco&sort_by=unique_scans_n` +
              `&page_size=24&page=${pg}&fields=${FIELDS}`,
            `https://world.openfoodfacts.org/api/v2/search?sort_by=unique_scans_n&page_size=24&page=${pg}&fields=${FIELDS}`,
          ];

    // OFF endpoints are individually flaky (intermittent 502/503) — walk
    // through the attempts and take the first that answers. `hits`
    // (search-a-licious) and `products` (legacy/v2) are normalized below.
    let data: {
      products?: any[];
      hits?: any[];
      count?: number;
      page?: number;
      page_size?: number;
    } | null = null;
    for (const attempt of attempts) {
      try {
        const res = await fetch(attempt, {
          headers: { 'User-Agent': UA },
          signal: AbortSignal.timeout(12_000),
        });
        if (!res.ok) continue;
        const body = await res.json();
        if (Array.isArray(body.products) || Array.isArray(body.hits)) {
          data = body;
          break;
        }
      } catch {
        // try the next endpoint
      }
    }
    if (!data) return json({ error: 'provider unavailable' }, 502);

    const items = (data.products ?? data.hits ?? [])
      .map((p) => {
        const n = p.nutriments ?? {};
        const calories = num(n['energy-kcal_100g']);
        const name = String(p.product_name_fr || p.product_name || '').trim();
        if (!name || calories <= 0) return null;
        return {
          code: String(p.code ?? ''),
          name: name.slice(0, 80),
          brand: String(p.brands || '').split(',')[0]?.trim() || undefined,
          imageUrl: p.image_front_small_url || p.image_front_url || undefined,
          /** Full-resolution front photo for the detail modal. */
          imageLarge: p.image_front_url || p.image_front_small_url || undefined,
          per100g: {
            calories: Math.round(calories),
            carbs: Math.round(num(n['carbohydrates_100g']) * 10) / 10,
            sugar: Math.round(num(n['sugars_100g']) * 10) / 10,
            protein: Math.round(num(n['proteins_100g']) * 10) / 10,
            fat: Math.round(num(n['fat_100g']) * 10) / 10,
            fiber: Math.round(num(n['fiber_100g']) * 10) / 10,
          },
        };
      })
      .filter(Boolean);

    const total = num(data.count);
    const seen = (num(data.page) || pg) * (num(data.page_size) || 24);
    return json({ result: { items, hasMore: total > seen } });
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
