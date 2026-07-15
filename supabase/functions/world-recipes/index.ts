// Supabase Edge Function: world recipes — AI-driven.
//
// TheMealDB alone is too thin (Morocco = 6 dishes, France = none), so the
// AI is the engine. It knows the patient (health snapshot) and:
//   suggest — given a COUNTRY + MEAL MOMENT (+ optional chat with the
//             patient), it recommends dishes actually eaten in that
//             country for that moment, diabetes-appropriate; in chat mode
//             it first asks about allergies / dislikes, then recommends.
//             Each dish gets a real photo (TheMealDB search) when one
//             exists.
//   detail  — full recipe for a dish, by TheMealDB id OR by NAME. By name:
//             use TheMealDB if it has the dish, otherwise the AI writes an
//             authentic recipe. Either way: per-serving nutrition, a
//             diabetes rating + advice, and steps in the patient's
//             language. Cached forever per dish+lang in `recipe_meta`.
//   browse  — raw TheMealDB area/search listing (kept for completeness).
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
  ar: 'Moroccan Darija (written in Arabic script)',
  fr: 'French',
  de: 'German',
  en: 'English',
};

const MOMENT_NAMES: Record<string, string> = {
  breakfast: 'breakfast (petit-déjeuner)',
  lunch: 'lunch (déjeuner, the main midday meal)',
  dinner: 'dinner (dîner, evening meal)',
  snack: 'a snack or light bite',
  any: 'any meal of the day',
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
    signal: AbortSignal.timeout(9_000),
  });
  if (!r.ok) throw new Error(`mealdb ${r.status}`);
  return r.json();
}

async function mealdbSearchOne(term: string): Promise<{ id: string; thumb: string } | null> {
  try {
    const d = await mealdb(`search.php?s=${encodeURIComponent(term)}`);
    const m = d.meals?.[0];
    return m ? { id: m.idMeal, thumb: m.strMealThumb } : null;
  } catch {
    return null;
  }
}

/** Best TheMealDB match for a dish name. Its search matches single words
 *  better than phrases ("chicken tagine"→∅ but "tagine"→hit), so try the
 *  full phrase, then the LAST word (usually the dish noun), then first. */
async function mealdbSearch(name: string): Promise<{ id: string; thumb: string } | null> {
  const words = name
    .toLowerCase()
    .replace(/[(),.]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2 && !['and', 'with', 'the', 'les', 'aux', 'sur', 'ou', 'de', 'du', 'à'].includes(w));
  const tries = [name, words[words.length - 1], words[0]].filter(Boolean);
  const seen = new Set<string>();
  for (const term of tries) {
    if (!term || seen.has(term)) continue;
    seen.add(term);
    const hit = await mealdbSearchOne(term);
    if (hit) return hit;
  }
  return null;
}

async function gemini(prompt: string, maxTokens = 1400): Promise<any | null> {
  if (!GEMINI_API_KEY) return null;
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
            maxOutputTokens: maxTokens,
            temperature: 0.35,
          },
        }),
        signal: AbortSignal.timeout(22_000),
      }
    );
    if (!r.ok) return null;
    const d = await r.json();
    const text = (d.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '')
      .join('')
      .trim();
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function cacheGet(key: string, lang: string): Promise<any | null> {
  if (!SUPABASE_URL || !SERVICE_KEY) return null;
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/recipe_meta?meal_id=eq.${encodeURIComponent(key)}&lang=eq.${lang}&select=data`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    return rows?.[0]?.data ?? null;
  } catch {
    return null;
  }
}

async function cacheSet(key: string, lang: string, data: unknown) {
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
      body: JSON.stringify({ meal_id: key, lang, data }),
    });
  } catch {
    // best-effort
  }
}

const num = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : 0;
};
const RATINGS = ['ok', 'warn', 'danger'];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const body = await req.json();
    const action = body.action ?? 'suggest';
    const lang = LANGUAGE_NAMES[body.lang] ? body.lang : 'en';
    const langName = LANGUAGE_NAMES[lang] ?? 'English';

    /* ─────────────────────────── SUGGEST ─────────────────────────── */
    if (action === 'suggest') {
      const country = String(body.country ?? '').slice(0, 40);
      const moment = MOMENT_NAMES[body.moment] ? body.moment : 'any';
      const momentName = MOMENT_NAMES[moment];
      const healthData = String(body.healthData ?? '').slice(0, 3000);
      const messages: { role: string; content: string }[] = Array.isArray(body.messages)
        ? body.messages.slice(-8)
        : [];

      const convo = messages.length
        ? messages
            .map((m) => `${m.role === 'assistant' ? 'YOU' : 'PATIENT'}: ${m.content}`)
            .join('\n')
        : '';

      const prompt = `You are GlucoAI, a warm dietitian assistant helping a DIABETIC patient
choose what to eat. Default language is ${langName}, BUT if the patient
writes in another language or dialect (French, Darija, Arabic, English…),
answer "reply"/"question" in THAT same language. Dish "name" fields should
be in ${langName}.

PATIENT HEALTH DATA (their real numbers — use them; never ignore an
allergy or a high glucose):
${healthData || 'none'}

TASK: recommend real dishes the patient could cook/eat.
${country ? `COUNTRY / CUISINE CONTEXT: dishes people actually eat in ${country} — include BOTH traditional local dishes AND popular international dishes eaten there (e.g. in Morocco: tajine, couscous, harira… but also pizza, pasta, etc. that Moroccans commonly eat).` : ''}
MEAL MOMENT: ${momentName}.

${convo ? `CONVERSATION SO FAR:\n${convo}\n` : ''}

Return ONLY valid JSON (no markdown), all text in ${langName} EXCEPT the
"search" field which MUST be a simple ENGLISH dish name for photo lookup:
{
  "reply": "one short warm sentence to the patient",
  "ready": true | false,
  "question": "if NOT ready, ONE short question to ask (allergies? dislikes? something you avoid?). Empty when ready.",
  "dishes": [ { "name": "dish name in ${langName}", "search": "generic ENGLISH dish name, e.g. 'chicken tagine', 'grilled sardines', 'vegetable pizza'", "note": "3-6 word reason it fits a diabetic" } ]
}

Rules:
- ${convo ? 'If you do NOT yet know the patient\'s allergies and dislikes, set ready=false, dishes=[], and ask ONE short question. Once you know enough (or they say "no allergies"), set ready=true and recommend.' : 'This is a direct browse (no conversation): set ready=true and recommend right away.'}
- When ready: recommend 6 to 9 dishes suited to a diabetic for this
  country + meal moment. Favor lower-GI, balanced options; you may include
  a popular treat but note moderation. Respect every stated allergy/dislike
  and the patient's glucose trend.
- "name" must be a REAL, searchable dish name (so a photo can be found).
- Keep notes very short.`;

      const out = await gemini(prompt, 1200);
      if (!out || typeof out !== 'object') {
        return json({ error: 'ai unavailable' }, 502);
      }
      let dishes = Array.isArray(out.dishes) ? out.dishes : [];
      dishes = dishes
        .filter((d: any) => d && typeof d.name === 'string' && d.name.trim())
        .slice(0, 9)
        .map((d: any) => ({
          name: String(d.name).slice(0, 70),
          search: String(d.search ?? d.name).slice(0, 70),
          note: String(d.note ?? '').slice(0, 60),
        }));

      // Resolve a real photo (+ mealId for a richer detail) per dish, using
      // the English search term (TheMealDB is English-only).
      const withImages = await Promise.all(
        dishes.map(async (d: { name: string; search: string; note: string }) => {
          const hit = (await mealdbSearch(d.search)) ?? (await mealdbSearch(d.name));
          return { name: d.name, note: d.note, image: hit?.thumb ?? '', mealId: hit?.id ?? '' };
        })
      );

      return json({
        result: {
          reply: typeof out.reply === 'string' ? out.reply : '',
          ready: out.ready !== false,
          question: typeof out.question === 'string' ? out.question : '',
          dishes: withImages,
        },
      });
    }

    /* ─────────────────────────── DETAIL ─────────────────────────── */
    if (action === 'detail') {
      const mealId = String(body.mealId ?? '');
      const name = String(body.name ?? '').slice(0, 70);
      if (!mealId && !name) return json({ error: 'mealId or name required' }, 400);

      // Resolve a raw TheMealDB meal (by id, or by searching the name).
      let m: MealRaw | undefined;
      if (mealId) {
        const raw = await mealdb(`lookup.php?i=${encodeURIComponent(mealId)}`);
        m = raw.meals?.[0];
      } else {
        const raw = await mealdb(`search.php?s=${encodeURIComponent(name)}`);
        m = raw.meals?.[0];
      }

      const cacheKey = m?.idMeal ? `id:${m.idMeal}` : `name:${name.toLowerCase()}`;
      const cached = await cacheGet(cacheKey, lang);

      // Base info: from TheMealDB when available, otherwise minimal.
      const base = m
        ? {
            id: m.idMeal,
            name: m.strMeal,
            thumb: m.strMealThumb,
            area: m.strArea ?? '',
            category: m.strCategory ?? '',
            youtube: m.strYoutube ?? '',
            ingredients: ingredientLines(m),
          }
        : { id: '', name, thumb: '', area: '', category: '', youtube: '', ingredients: [] };

      if (cached) return json({ result: { ...base, ...cached } });

      // Enrich (nutrition + translation + advice, and — when the dish is
      // not in TheMealDB — the whole authentic recipe).
      const known = !!m;
      const prompt = known
        ? `You are a dietitian for a DIABETIC patient. Here is a recipe from a
database. Reply ONLY valid JSON, all text in ${langName}.

TITLE: ${m!.strMeal}
CUISINE: ${m!.strArea ?? '?'} / ${m!.strCategory ?? '?'}
INGREDIENTS:
${base.ingredients.map((x) => `- ${x}`).join('\n')}
INSTRUCTIONS:
${(m!.strInstructions ?? '').slice(0, 2500)}

{
 "title":"dish name in ${langName}",
 "servings":N,
 "per_serving":{"calories":N,"carbs":N,"sugar":N,"protein":N,"fat":N,"fiber":N},
 "gi":N,
 "rating":"ok"|"warn"|"danger",
 "advice":"one honest warm sentence in ${langName} for a diabetic (portion/swap/what to serve with)",
 "steps":["4-10 short numbered steps in ${langName}"]
}
Estimate nutrition PER SERVING realistically; never zeros for a real dish.`
        : `You are a chef + dietitian for a DIABETIC patient. Write an AUTHENTIC
recipe for the dish "${name}". Reply ONLY valid JSON, all text in ${langName}.

{
 "title":"dish name in ${langName}",
 "servings":N,
 "ingredients":["realistic ingredient lines with quantities, in ${langName}"],
 "per_serving":{"calories":N,"carbs":N,"sugar":N,"protein":N,"fat":N,"fiber":N},
 "gi":N,
 "rating":"ok"|"warn"|"danger",
 "advice":"one honest warm sentence in ${langName} for a diabetic",
 "steps":["6-10 short numbered preparation steps in ${langName}"]
}
Make it authentic and realistic; estimate nutrition PER SERVING; never zeros.`;

      const enrich = await gemini(prompt, 1600);
      if (!enrich || typeof enrich !== 'object') {
        // No image yet for name-only dishes → try a search thumbnail.
        if (!base.thumb && name) {
          const hit = await mealdbSearch(name);
          if (hit) base.thumb = hit.thumb;
        }
        return json({ result: { ...base, enriched: false } });
      }
      const ps = enrich.per_serving ?? {};
      const clean = {
        enriched: true,
        title: typeof enrich.title === 'string' ? enrich.title : base.name,
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
        // Only AI-generated recipes bring their own ingredients.
        ...(!known && Array.isArray(enrich.ingredients)
          ? { ingredients: enrich.ingredients.filter((s: unknown) => typeof s === 'string').slice(0, 20) }
          : {}),
      };

      // Fetch a photo for name-only dishes if we still have none.
      if (!base.thumb && name) {
        const hit = await mealdbSearch(name);
        if (hit) base.thumb = hit.thumb;
      }

      const merged = { ...base, ...clean };
      await cacheSet(cacheKey, lang, clean);
      return json({ result: merged });
    }

    /* ─────────────────────────── BROWSE ─────────────────────────── */
    if (action === 'browse') {
      const { area = '', query = '' } = body;
      let path: string;
      if (query && String(query).trim().length >= 2) {
        path = `search.php?s=${encodeURIComponent(String(query).trim())}`;
      } else if (area) {
        path = `filter.php?a=${encodeURIComponent(area)}`;
      } else {
        path = `filter.php?c=Seafood`;
      }
      const data = await mealdb(path);
      const items = (data.meals ?? []).slice(0, 60).map((m: MealRaw) => ({
        id: m.idMeal,
        name: m.strMeal,
        thumb: m.strMealThumb,
        area: m.strArea,
      }));
      return json({ result: { items } });
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
