// Supabase Edge Function: world recipes.
//
// Ready-made international dishes with big professional photos come from
// TheMealDB (free, no key). This function:
//   browse  — list recipes (by cuisine/category/search) → id, name, thumb.
//   detail  — one recipe: raw ingredients + instructions from TheMealDB,
//             ENRICHED by Gemini with per-serving nutrition, a diabetes
//             rating + one honest advice line, and the title/steps
//             translated to the patient's language. The enrichment is
//             cached in `recipe_meta` (one Gemini call per dish+lang ever;
//             everyone else reads the cache).
//
// Deploy: supabase functions deploy world-recipes

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MODEL = Deno.env.get('GEMINI_CHAT_MODEL') ?? 'gemini-2.5-flash';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const MEALDB = 'https://www.themealdb.com/api/json/v1/1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Moroccan Darija (Arabic script)',
  fr: 'French',
  de: 'German',
  en: 'English',
};

interface MealRaw {
  idMeal: string;
  strMeal: string;
  strMealThumb: string;
  strCategory?: string;
  strArea?: string;
  strInstructions?: string;
  strYoutube?: string;
  [k: string]: unknown;
}

/** Collect the "1 tbsp flour" style ingredient lines from a raw meal. */
function ingredientLines(m: MealRaw): string[] {
  const out: string[] = [];
  for (let i = 1; i <= 20; i++) {
    const ing = String(m[`strIngredient${i}`] ?? '').trim();
    const meas = String(m[`strMeasure${i}`] ?? '').trim();
    if (ing) out.push(`${meas ? meas + ' ' : ''}${ing}`.trim());
  }
  return out;
}

async function mealdb(path: string): Promise<any> {
  const r = await fetch(`${MEALDB}/${path}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!r.ok) throw new Error(`mealdb ${r.status}`);
  return r.json();
}

async function cacheGet(mealId: string, lang: string): Promise<any | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/recipe_meta?meal_id=eq.${mealId}&lang=eq.${lang}&select=data`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0]?.data ?? null;
  } catch {
    return null;
  }
}

async function cacheSet(mealId: string, lang: string, data: unknown) {
  if (!SUPABASE_URL || !SERVICE_KEY) return;
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/recipe_meta`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify({ meal_id: mealId, lang, data }),
    });
  } catch {
    // cache write is best-effort
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    const action = body.action ?? 'browse';

    /* ─────────────────────────── BROWSE ─────────────────────────── */
    if (action === 'browse') {
      const { area = '', category = '', query = '' } = body;
      let path: string;
      if (query && String(query).trim().length >= 2) {
        path = `search.php?s=${encodeURIComponent(String(query).trim())}`;
      } else if (area) {
        path = `filter.php?a=${encodeURIComponent(area)}`;
      } else if (category) {
        path = `filter.php?c=${encodeURIComponent(category)}`;
      } else {
        // Default landing: a broad, appetizing category.
        path = `filter.php?c=Seafood`;
      }
      const data = await mealdb(path);
      const items = (data.meals ?? []).slice(0, 60).map((m: MealRaw) => ({
        id: m.idMeal,
        name: m.strMeal,
        thumb: m.strMealThumb,
        area: m.strArea,
        category: m.strCategory,
      }));
      return json({ result: { items } });
    }

    /* ─────────────────────────── DETAIL ─────────────────────────── */
    if (action === 'detail') {
      const mealId = String(body.mealId ?? '');
      const lang = LANGUAGE_NAMES[body.lang] ? body.lang : 'en';
      if (!mealId) return json({ error: 'mealId required' }, 400);

      const raw = await mealdb(`lookup.php?i=${encodeURIComponent(mealId)}`);
      const m: MealRaw | undefined = raw.meals?.[0];
      if (!m) return json({ error: 'not found' }, 404);

      const base = {
        id: m.idMeal,
        name: m.strMeal,
        thumb: m.strMealThumb,
        area: m.strArea ?? '',
        category: m.strCategory ?? '',
        youtube: m.strYoutube ?? '',
        ingredients: ingredientLines(m),
      };

      // Cached enrichment?
      const cached = await cacheGet(mealId, lang);
      if (cached) {
        return json({ result: { ...base, ...cached } });
      }

      // Enrich with Gemini (nutrition + translation + diabetes advice).
      if (!GEMINI_API_KEY) {
        return json({ result: { ...base, enriched: false } });
      }
      const langName = LANGUAGE_NAMES[lang] ?? 'English';
      const prompt = `You are a dietitian assistant for a DIABETIC patient app.
Here is an international recipe from a cooking database:

TITLE: ${m.strMeal}
CUISINE: ${m.strArea ?? '?'} / ${m.strCategory ?? '?'}
INGREDIENTS:
${base.ingredients.map((x) => `- ${x}`).join('\n')}
INSTRUCTIONS:
${(m.strInstructions ?? '').slice(0, 2500)}

Return ONLY valid JSON (no markdown fences), all TEXT written in ${langName}:
{
  "title": "the dish name in ${langName}",
  "servings": N,               // realistic number of servings this recipe makes
  "per_serving": { "calories": N, "carbs": N, "sugar": N, "protein": N, "fat": N, "fiber": N },  // grams, your best estimate PER serving
  "gi": N,                     // estimated glycemic index of the dish (0-110)
  "rating": "ok" | "warn" | "danger",   // for a diabetic: ok=good choice, warn=occasionally, danger=avoid/rare
  "advice": "one honest, warm sentence in ${langName}: is this good for a diabetic, and the key tip (portion, swap, what to serve it with). If it's heavy/sugary, say so kindly.",
  "steps": ["clear numbered preparation steps in ${langName}, rewritten simply, 4-10 short steps"]
}
Estimate nutrition realistically from the ingredients and servings. Never leave zeros for a real dish.`;

      let enrich: any = null;
      try {
        const r = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig: {
                thinkingConfig: { thinkingBudget: 0 },
                responseMimeType: 'application/json',
                maxOutputTokens: 1400,
                temperature: 0.3,
              },
            }),
            signal: AbortSignal.timeout(20_000),
          }
        );
        if (r.ok) {
          const d = await r.json();
          const text = (d.candidates?.[0]?.content?.parts ?? [])
            .map((p: { text?: string }) => p.text ?? '')
            .join('')
            .trim();
          enrich = JSON.parse(text);
        }
      } catch {
        enrich = null;
      }

      if (!enrich || typeof enrich !== 'object') {
        return json({ result: { ...base, enriched: false } });
      }
      const RATINGS = ['ok', 'warn', 'danger'];
      const num = (v: unknown) => {
        const n = Number(v);
        return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
      };
      const ps = enrich.per_serving ?? {};
      const clean = {
        enriched: true,
        title: typeof enrich.title === 'string' ? enrich.title : m.strMeal,
        servings: num(enrich.servings) || 4,
        gi: Math.min(110, num(enrich.gi)),
        rating: RATINGS.includes(enrich.rating) ? enrich.rating : 'warn',
        advice: typeof enrich.advice === 'string' ? enrich.advice : '',
        per_serving: {
          calories: num(ps.calories),
          carbs: num(ps.carbs),
          sugar: num(ps.sugar),
          protein: num(ps.protein),
          fat: num(ps.fat),
          fiber: num(ps.fiber),
        },
        steps: Array.isArray(enrich.steps)
          ? enrich.steps.filter((s: unknown) => typeof s === 'string').slice(0, 12)
          : [],
      };
      await cacheSet(mealId, lang, clean);
      return json({ result: { ...base, ...clean } });
    }

    return json({ error: `unknown action: ${action}` }, 400);
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
