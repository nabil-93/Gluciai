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

import { callerUserId } from '../_shared/usage.ts';

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

/**
 * DISH-SPECIFIC real photo from Wikimedia Commons. Unlike TheMealDB
 * (which collapses "fish tagine" and "chicken tagine" to the same match),
 * Wikimedia honours the full phrase, so each dish gets its OWN correct
 * high-resolution image. Returns a ~1600 px thumbnail URL or null.
 */
async function wikimediaImage(term: string): Promise<string | null> {
  try {
    const url =
      `https://commons.wikimedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent(term)}` +
      `&gsrnamespace=6&gsrlimit=8&prop=imageinfo&iiprop=url|size&iiurlwidth=1600&format=json`;
    const r = await fetch(url, {
      headers: { 'User-Agent': 'GluciAI/1.0 (diabetes education app)' },
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return null;
    const data = await r.json();
    const pages = Object.values(data?.query?.pages ?? {}) as any[];
    // RELEVANCE: the file title must contain a word from the search term
    // so the photo really is THIS dish (not a random collapse).
    const words = term.toLowerCase().replace(/[()]/g, ' ').split(/\s+/).filter((w) => w.length > 3);
    const relevant = (p: any) => {
      const title = String(p.title ?? '').toLowerCase();
      return words.length === 0 || words.some((w) => title.includes(w));
    };
    const cands = pages
      .filter(relevant)
      .map((p) => p.imageinfo?.[0])
      .filter((i) => i && /\.(jpe?g|png)$/i.test(i.url ?? ''))
      .filter((i) => (i.width ?? 0) >= 500 && (i.height ?? 0) >= 350);
    const best = cands.find((i) => (i.width ?? 0) >= (i.height ?? 1)) ?? cands[0];
    return best?.thumburl ?? best?.url ?? null;
  } catch {
    return null;
  }
}

/** Correct dish photo: Wikimedia (dish-specific) first, TheMealDB fallback. */
async function dishPhoto(searchEn: string): Promise<string> {
  const wiki = await wikimediaImage(searchEn);
  if (wiki) return wiki;
  const meal = await mealdbSearch(searchEn);
  return meal?.thumb ?? '';
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
    // Suggest/detail spend Gemini tokens — require a real signed-in user
    // (the bare anon key passes verify_jwt but must not burn quota).
    if (!(await callerUserId(req))) {
      return json({ error: 'unauthorized' }, 401);
    }

    const body = await req.json();
    const action = body.action ?? 'suggest';
    const lang = LANGUAGE_NAMES[body.lang] ? body.lang : 'en';
    const langName = LANGUAGE_NAMES[lang] ?? 'English';

    /* ─────────────────────────── SUGGEST ─────────────────────────── */
    if (action === 'suggest') {
      const country = String(body.country ?? '').slice(0, 40);
      const moment = MOMENT_NAMES[body.moment] ? body.moment : 'any';
      const momentName = MOMENT_NAMES[moment];
      const healthData = String(body.healthData ?? '').slice(0, 3500);
      const dayJournal = String(body.dayJournal ?? '').slice(0, 3000);
      const catalog = String(body.catalog ?? '').slice(0, 6000);
      const messages: { role: string; content: string }[] = Array.isArray(body.messages)
        ? body.messages.slice(-8)
        : [];

      const convo = messages.length
        ? messages
            .map((m) => `${m.role === 'assistant' ? 'YOU' : 'PATIENT'}: ${m.content}`)
            .join('\n')
        : '';

      const prompt = `You are GluciAI, an EXPERT DIABETES DOCTOR + dietitian recommending
meals to YOUR patient. Default language is ${langName}, BUT if the patient
writes in another language or dialect (French, Darija, Arabic, English…),
answer "reply"/"note" in THAT same language. Dish "name" fields in
${langName}.

═══ PATIENT PROFILE & TODAY'S NUMBERS (their REAL data — reason on them
like a doctor, exactly like when deciding an insulin dose): ═══
${healthData || 'none'}

═══ FULL DAY JOURNAL (today + yesterday: what they already ate, sugar so
far, insulin taken, glucose evolution, sport): ═══
${dayJournal || 'none'}

TASK: recommend real dishes for this patient RIGHT NOW, reasoning on their
day like a professional doctor.
${country ? `COUNTRY / CUISINE: dishes people actually eat in ${country} — BOTH traditional local dishes AND popular international dishes eaten there (Morocco: tajine, couscous, harira… but also pizza, sandwich, pasta, etc.).` : ''}
MEAL MOMENT: ${momentName}.

${convo ? `CONVERSATION SO FAR:\n${convo}\n` : ''}
${catalog ? `READY CATALOG (dishes that already have a photo + data — PREFER these; format id|name|moments):\n${catalog}\n` : ''}

Return ONLY valid JSON (no markdown), all text in ${langName} EXCEPT the
"search" field which MUST be a PRECISE ENGLISH dish name for a photo:
{
  "reply": "2-4 warm, professional sentences like a doctor: reference their ACTUAL numbers (today's glucose, how much sugar/carbs they already ate today, insulin taken) and explain your overall plan for this meal. E.g. if glucose is high or they already ate sugary, say so and steer to low-GI light options.",
  "ready": true | false,
  "question": "if NOT ready, ONE short question (allergies? dislikes?). Empty when ready.",
  "dishes": [ { "id": "catalog id if in the catalog, else empty string", "name": "dish name in ${langName}", "search": "PRECISE ENGLISH dish name unique to THIS dish, e.g. 'fish tagine' vs 'chicken tagine' vs 'vegetable tagine' — never just 'tagine'", "note": "one doctor-style sentence in ${langName}: WHY this dish fits THEM now (portion in grams, carbs, and the reason vs their glucose/what they already ate)" } ]
}

Rules:
- ${convo ? 'If you do NOT yet know the patient\'s allergies and dislikes, set ready=false, dishes=[], ask ONE short question. Once known (or "no allergies"), set ready=true and recommend.' : 'Direct browse: set ready=true and recommend right away.'}
- PERSONALIZE HARD: if their glucose today is HIGH → recommend low-GI,
  low-sugar, vegetable/protein-forward dishes that help bring it down, and
  say so with grams. If they ALREADY ate something sugary/heavy today →
  do NOT stack another; balance the day. Factor insulin already taken and
  their diabetes type. Never recommend something an allergy forbids.
- Each "note" must be concrete and personal (grams of carbs, portion, and
  the clinical reason) — like a doctor explaining, not a generic label.
- When ready: 6 to 9 dishes. ${catalog ? 'STRONGLY PREFER catalog dishes (fill "id"); invent a NEW dish (id:"") only when the catalog has nothing fitting.' : ''}
- "name"/"search" must be a REAL dish; "search" precise so the photo is
  the RIGHT dish.`;

      const out = await gemini(prompt, 1200);
      if (!out || typeof out !== 'object') {
        return json({ error: 'ai unavailable' }, 502);
      }
      let dishes = Array.isArray(out.dishes) ? out.dishes : [];
      dishes = dishes
        .filter((d: any) => d && typeof d.name === 'string' && d.name.trim())
        .slice(0, 9)
        .map((d: any) => ({
          id: String(d.id ?? '').slice(0, 40),
          name: String(d.name).slice(0, 70),
          search: String(d.search ?? d.name).slice(0, 70),
          note: String(d.note ?? '').slice(0, 60),
        }));

      // Resolve a DISH-SPECIFIC real photo per dish (Wikimedia first, so
      // fish/chicken/vegetable tagine each get their OWN correct image).
      // Catalog dishes already carry a local image — the client overrides.
      const withImages = await Promise.all(
        dishes.map(async (d: { id: string; name: string; search: string; note: string }) => {
          const image = d.id ? '' : await dishPhoto(d.search);
          return { id: d.id, name: d.name, note: d.note, image, mealId: '' };
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
      const name = String(body.name ?? '').slice(0, 70);
      const searchEn = String(body.search ?? name).slice(0, 70);
      const passedImage = String(body.image ?? '').slice(0, 400);
      if (!name) return json({ error: 'name required' }, 400);

      const cacheKey = `name:${name.toLowerCase()}`;
      const cached = await cacheGet(cacheKey, lang);

      // The photo: the card already has the correct dish-specific image →
      // reuse it; otherwise resolve one (Wikimedia first) so the hero is
      // the RIGHT dish, not a generic collapse.
      let thumb = passedImage;
      if (!thumb) thumb = await dishPhoto(searchEn || name);

      const base = {
        id: '',
        name,
        thumb,
        area: '',
        category: '',
        youtube: '',
        ingredients: [] as string[],
      };

      if (cached) return json({ result: { ...base, ...cached } });

      // Always write the authentic recipe with the AI (great for Moroccan
      // dishes TheMealDB doesn't have), translated, per-serving nutrition,
      // diabetes verdict + advice.
      const prompt = `You are a chef + dietitian for a DIABETIC patient. Write an AUTHENTIC
recipe for the dish "${name}". Reply ONLY valid JSON, all text in ${langName}.

{
 "title":"dish name in ${langName}",
 "servings":N,
 "ingredients":["realistic ingredient lines with quantities, in ${langName}"],
 "per_serving":{"calories":N,"carbs":N,"sugar":N,"protein":N,"fat":N,"fiber":N},
 "gi":N,
 "rating":"ok"|"warn"|"danger",
 "advice":"one honest warm sentence in ${langName} for a diabetic (portion/swap/what to serve with)",
 "steps":["6-10 short numbered preparation steps in ${langName}"]
}
Make it authentic and realistic; estimate nutrition PER SERVING; never zeros.`;

      const enrich = await gemini(prompt, 1600);
      if (!enrich || typeof enrich !== 'object') {
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
        ingredients: Array.isArray(enrich.ingredients)
          ? enrich.ingredients.filter((s: unknown) => typeof s === 'string').slice(0, 20)
          : [],
      };
      // Cache the recipe (NOT the image — images can be revisited cheaply).
      await cacheSet(cacheKey, lang, clean);
      return json({ result: { ...base, ...clean } });
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
