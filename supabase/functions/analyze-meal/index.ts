// Supabase Edge Function: analyze a meal photo with Google Gemini 2.5 Flash.
//
// DETECT-ONLY. The vision model NEVER computes calories or nutrition — it
// only identifies foods, estimates grams, returns a confidence, a generic
// `search_name` for database lookup, and (optionally) a bounding box so the
// app can draw the detection over the photo. All nutrition values come from
// the client-side provider chain (Moroccan DB → USDA → Open Food Facts).
//
// Deploy:  supabase functions deploy analyze-meal
// Secrets: supabase secrets set GEMINI_API_KEY=...
//          (optional) supabase secrets set GEMINI_VISION_MODEL=gemini-2.5-flash

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MODEL = Deno.env.get('GEMINI_VISION_MODEL') ?? 'gemini-2.5-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

/* ────────────────────────────── PROMPTS ────────────────────────────── */

// DETECT mode — the app's main food scanner. Nutrition is intentionally
// absent from the schema: the model must not invent calories.
const DETECT_PROMPT = `You are an expert food recognition AI.

Analyze the uploaded meal image.

Return ONLY valid JSON. Do not return markdown. Do not explain anything.

Return this exact structure:
{
  "foods": [
    {
      "display_name": "",
      "search_name": "",
      "category": "",
      "grams": 0,
      "confidence": 0,
      "bounding_box": { "x": 0, "y": 0, "width": 0, "height": 0 },
      "is_main_food": true,
      "is_estimated": false,
      "alternatives": ["", ""]
    }
  ]
}

Rules:
- Detect EVERY distinct ingredient separately, even small ones. Never merge
  foods together. Aim to list all components, not just the most obvious one.
- Look CAREFULLY for foods partly hidden under sauce, cheese, toppings or
  other foods (e.g. fried chicken under a creamy sauce, rice under a stew).
  A sauce or dressing on top does NOT replace the food beneath it — report
  both. Bowls and mixed plates usually contain 3-6 components.
- Estimate realistic grams. Never overestimate portion sizes. If unsure, lower confidence.
- confidence is an integer 0-100.
- is_main_food: true for the main dish/protein/centerpiece (steak, chicken,
  fish, pizza, burger, a rice plate…); false for sides, garnishes, sauces,
  toppings and drinks.
- is_estimated: true when you are UNSURE about the grams (portion hidden,
  ambiguous size, stacked/overlapping food); false when the portion is clear.
- alternatives: 2-3 OTHER foods this could plausibly be, most-likely first,
  as generic search names (e.g. for salmon: ["tuna", "trout"]). Provide them
  especially when confidence is below 70. Omit or leave [] when you are sure.
- display_name is a short human label (e.g. "Grilled Salmon", "Cherry Tomatoes").
- search_name is a GENERIC food name usable to search a nutrition database
  (lowercase, no cooking adjectives): "Grilled Salmon" -> "salmon",
  "Roasted Chicken Breast" -> "chicken breast", "Cherry Tomatoes" -> "tomato",
  "Brown Rice" -> "brown rice", "Greek Yogurt" -> "yogurt",
  "French Fries" -> "french fries", "Moroccan Chicken Tagine" -> "chicken tagine".
- category MUST be exactly one of: Protein, Vegetable, Fruit, Rice, Bread,
  Pasta, Soup, Sauce, Dessert, Drink, Snack, Fast Food, Seafood, Legumes,
  Dairy, Egg, Unknown. Use "Unknown" only when nothing else fits.
- bounding_box locates the food IN PIXELS of THIS image (origin = top-left).
  Return the actual pixel coordinates for the image you were given. If you
  cannot localize a food, omit its bounding_box.
- Recognize international & traditional dishes (Moroccan: couscous, tagine,
  harira, rfissa, bastilla, msemen, zaalouk...; Arabic: shawarma, falafel,
  hummus, kabsa, mansaf...; Italian, Asian, Mexican, Indian...).
- If the image contains no food, return {"foods": []}.`;

// MENU mode — reads dish names off a restaurant menu (no nutrition, no boxes).
const MENU_PROMPT = `You are reading a restaurant menu from an image.
Return ONLY valid JSON: {"dishes": ["", ""]}.
List every distinct dish name you can read, in its original language.
Do not include prices, section headers, drinks descriptions, or explanations.
If you cannot read any dish, return {"dishes": []}.`;

/* ─────────────────────────────── HANDLER ────────────────────────────── */

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const {
      image_base64,
      language = 'en',
      mode = 'detect',
    } = await req.json();

    if (!image_base64) return json({ error: 'image_base64 is required' }, 400);
    if (!GEMINI_API_KEY) {
      return json({ error: 'AI is not configured (missing GEMINI_API_KEY)' }, 500);
    }

    // Diagnostic (shows in Supabase logs): size of the image we received —
    // lets us verify the app really sends the full, healthy picture.
    console.log(
      `analyze-meal: mode=${mode} lang=${language} image≈${Math.round(image_base64.length / 1024)}KB(b64)`
    );

    const prompt = mode === 'menu' ? MENU_PROMPT : DETECT_PROMPT;
    const raw = await callGemini(prompt, image_base64, language);
    const parsed = parseJson(raw);

    if (mode === 'menu') {
      const dishes = Array.isArray(parsed?.dishes)
        ? parsed.dishes.filter((d: unknown) => typeof d === 'string' && d.trim())
        : [];
      return json({ dishes });
    }

    // DETECT: map the model's `foods` onto the client's detection contract.
    const foods = Array.isArray(parsed?.foods) ? parsed.foods : [];
    const detections = foods
      .map(normalizeDetection)
      .filter((d: Detection | null): d is Detection => d !== null);

    return json({ detections });
  } catch (error) {
    return json({ error: String(error) }, 500);
  }
});

/* ─────────────────────────────── GEMINI ─────────────────────────────── */

async function callGemini(
  prompt: string,
  imageBase64: string,
  language: string
): Promise<string> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent` +
    `?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          { text: `${prompt}\n\nWrite display_name in language: ${language}.` },
          {
            inline_data: {
              mime_type: 'image/jpeg',
              data: stripDataUrl(imageBase64),
            },
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.2,
      // Force JSON so we don't have to scrape markdown fences.
      responseMimeType: 'application/json',
      // Each food now carries bounding_box + alternatives + category, so a
      // multi-food plate can produce a long JSON body — 1024 was truncating
      // mid-object on real meals, which made the whole scan fail.
      maxOutputTokens: 4096,
    },
  };

  // A transient 429 (rate limit) is retried ONCE after a short wait — the
  // API tells us how long via retryDelay. Any other error fails fast.
  let res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (res.status === 429) {
    const detail = await res.text();
    const wait = parseRetryDelayMs(detail);
    await new Promise((r) => setTimeout(r, Math.min(wait, 8000)));
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini error ${res.status}: ${detail}`);
  }

  const data = await res.json();

console.log("GEMINI RAW RESPONSE:");
console.log(JSON.stringify(data, null, 2));

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? '')
    .join('')
    .trim();
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}

/* ─────────────────────────────── HELPERS ────────────────────────────── */

/** Pull the retryDelay ("11s") out of a Gemini 429 body → ms (default 5s). */
function parseRetryDelayMs(body: string): number {
  const m = body.match(/"retryDelay"\s*:\s*"(\d+)(?:\.\d+)?s"/);
  return m ? (parseInt(m[1], 10) + 1) * 1000 : 5000;
}

const CATEGORIES = new Set([
  'Protein', 'Vegetable', 'Fruit', 'Rice', 'Bread', 'Pasta', 'Soup', 'Sauce',
  'Dessert', 'Drink', 'Snack', 'Fast Food', 'Seafood', 'Legumes', 'Dairy',
  'Egg', 'Unknown',
]);

interface Detection {
  name: string;
  search_name: string;
  category: string;
  portion_grams: number;
  confidence: number; // 0..1 for the client
  bounding_box?: { x: number; y: number; width: number; height: number };
  is_main_food?: boolean;
  is_estimated?: boolean;
  alternatives?: string[];
}

/** Coerce one raw model food into the strict client contract, or null. */
function normalizeDetection(raw: unknown): Detection | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;

  const name = String(f.display_name ?? f.name ?? '').trim();
  if (!name) return null;

  const search = String(f.search_name ?? '').trim() || name.toLowerCase();
  const grams = clampNumber(f.grams, 5, 2000, 100);

  // Model returns confidence 0..100; the client works in 0..1.
  const rawConf = clampNumber(f.confidence, 0, 100, 60);
  const confidence = Math.round((rawConf / 100) * 100) / 100;

  // Validate the category against the allowed enum; anything else → Unknown.
  const rawCat = String(f.category ?? '').trim();
  const category = CATEGORIES.has(rawCat) ? rawCat : 'Unknown';

  const det: Detection = {
    name,
    search_name: search,
    category,
    portion_grams: Math.round(grams),
    confidence,
    // Default main-food true only for high confidence; flag low-confidence
    // gram guesses as estimated even if the model forgot to.
    is_main_food: f.is_main_food === true,
    is_estimated: f.is_estimated === true || confidence < 0.5,
  };

  // Up to 3 distinct alternative search names (for the "Did you mean?" sheet).
  if (Array.isArray(f.alternatives)) {
    const alts = f.alternatives
      .map((a) => String(a ?? '').trim().toLowerCase())
      .filter((a) => a.length > 0 && a !== search)
      .slice(0, 3);
    if (alts.length > 0) det.alternatives = [...new Set(alts)];
  }

  const box = normalizeBox(f.bounding_box);
  if (box) det.bounding_box = box;
  return det;
}

function normalizeBox(raw: unknown): Detection['bounding_box'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const b = raw as Record<string, unknown>;
  const x = Number(b.x);
  const y = Number(b.y);
  const width = Number(b.width);
  const height = Number(b.height);
  if (
    ![x, y, width, height].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0
  ) {
    return undefined;
  }
  return { x, y, width, height };
}

function clampNumber(v: unknown, min: number, max: number, fallback: number) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

/** Accept both a bare base64 string and a full `data:...;base64,` URL. */
function stripDataUrl(b64: string): string {
  const comma = b64.indexOf('base64,');
  return comma >= 0 ? b64.slice(comma + 'base64,'.length) : b64;
}

/**
 * Parse JSON even if the model wrapped it in ```json fences or prose, and
 * even if the response was cut off mid-array (hit maxOutputTokens on a
 * plate with many foods). In that last case we drop the dangling partial
 * object and close the array/object, so a truncated response still yields
 * every food that was FULLY described before the cut — never invented,
 * just fewer items than the model intended.
 */
function parseJson(text: string): any {
  const cleaned = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return JSON.parse(cleaned);
  } catch {
    // 1 — grab the first {...} block (strips leading/trailing prose).
    const start = cleaned.indexOf('{');
    if (start < 0) throw new Error('Model did not return valid JSON');
    const body = cleaned.slice(start);

    const end = cleaned.lastIndexOf('}');
    if (end > start) {
      try {
        return JSON.parse(cleaned.slice(start, end + 1));
      } catch {
        /* still broken → likely truncated mid-object, try repair below */
      }
    }

    // 2 — truncated response: cut back to the last fully-closed object
    // inside the foods/dishes array, then close the array + root object.
    const lastCompleteObj = body.lastIndexOf('}');
    if (lastCompleteObj > 0) {
      const repaired = `${body.slice(0, lastCompleteObj + 1)}]}`;
      try {
        return JSON.parse(repaired);
      } catch {
        /* fall through */
      }
    }
    throw new Error('Model did not return valid JSON');
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
