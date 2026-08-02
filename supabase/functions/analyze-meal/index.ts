// Supabase Edge Function: analyze a meal photo with Google Gemini 2.5 Flash.
//
// DETECT-ONLY. The vision model NEVER computes calories or nutrition — it
// only identifies foods, estimates grams, returns a confidence, a generic
// `search_name` for database lookup, and (optionally) a bounding box so the
// app can draw the detection over the photo. All nutrition values come from
// the client-side provider chain (Moroccan DB → USDA → Open Food Facts).
//
// RESPONSE CONTRACT (see normalize.ts for the reasoning):
//   { detections: Detection[], incomplete: boolean }   // detect
//   { dishes: string[],        incomplete: boolean }   // menu
// A nutrient the model did not state is `null`, never `0` — the client tells a
// measured zero from a missing one and refuses to dose the latter. A portion or
// confidence this function had to default is reported (`*_stated: false`), and
// `incomplete: true` means the model's answer was cut off and reassembled, so
// the plate is a subset of what it listed.
//
// Deploy:  supabase functions deploy analyze-meal
// Secrets: supabase secrets set GEMINI_API_KEY=...
//          (optional) supabase secrets set GEMINI_VISION_MODEL=gemini-2.5-flash

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { callerUserId, flashCost, logUsage } from '../_shared/usage.ts';
import { featureLocked } from '../_shared/featureGuard.ts';
import { quotaState } from '../_shared/quota.ts';
import {
  normalizeDetection,
  parseModelJson,
  validateRequest,
  type Detection,
} from './normalize.ts';

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
      "alternatives": ["", ""],
      "nutrition_per_100g": {
        "calories": 0, "protein": 0, "carbs": 0, "fat": 0,
        "sugar": 0, "fiber": 0, "sodium": 0
      }
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
- nutrition_per_100g: your best nutrition estimate PER 100 GRAMS of this
  food (calories in kcal; protein/carbs/fat/sugar/fiber in grams; sodium in
  mg). This is a FALLBACK only — the app prefers official databases and uses
  your estimate solely when no database has the food (sauces, fried onions,
  sesame, spices, regional dishes…). Always fill it with realistic values;
  never leave it at 0 for a real food.
- display_name is a short human label (e.g. "Grilled Salmon", "Cherry Tomatoes").
- search_name MUST ALWAYS BE IN ENGLISH, even when display_name is in another
  language — it is a database query and the nutrition databases are English.
  A GENERIC lowercase English food name, no cooking adjectives:
  "Poulet frit" -> "fried chicken", "Maïs en grains" -> "corn",
  "Salade de chou" -> "coleslaw", "Graines de sésame" -> "sesame seeds",
  "Grilled Salmon" -> "salmon", "Roasted Chicken Breast" -> "chicken breast",
  "Cherry Tomatoes" -> "tomato", "Moroccan Chicken Tagine" -> "chicken tagine".
- category MUST be exactly one of: Protein, Vegetable, Fruit, Rice, Bread,
  Pasta, Soup, Sauce, Dessert, Drink, Snack, Fast Food, Seafood, Legumes,
  Dairy, Egg, Unknown. Use "Unknown" only when nothing else fits.
- bounding_box locates the food using NORMALIZED coordinates from 0 to 1000
  (origin = top-left), where x,y is the top-left corner and width,height the
  size, all on the 0-1000 scale (so x+width ≤ 1000, y+height ≤ 1000). Draw a
  TIGHT box around ONLY that food — never a box covering the whole plate or
  several foods. If you cannot localize a food precisely, omit its
  bounding_box rather than returning a loose one.
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
    /* WHO IS ASKING — before anything else (finding P4-b).
     *
     * This block used to sit BELOW the body parse and the `GEMINI_API_KEY`
     * guard, so an unauthenticated caller holding the public anon key got a
     * 500 naming a missing secret, or a 400 from input validation — learning
     * server configuration state and consuming parsing work without ever being
     * authenticated. The checks themselves are unchanged; only their order is.
     *
     * A consequence worth stating: the feature lock and the quota are now
     * reachable without a provider secret, which is what finally makes
     * server-side lock enforcement (SEC-1) verifiable on the local stack.
     */
    const uid = await callerUserId(req);
    if (!uid) return json({ error: 'unauthorized' }, 401);
    if (await featureLocked(uid, 'scanner')) {
      return json({ error: 'feature locked' }, 403);
    }
    // Daily/weekly/monthly scan quota (usage_limits). Fail-open on lookup error.
    const scanQuota = await quotaState(uid, 'scanner');
    if (scanQuota?.exceeded) {
      return json(
        { error: 'quota_exceeded', feature: 'scanner', period: scanQuota.period, limit: scanQuota.limit, used: scanQuota.used },
        429
      );
    }

    // Input validation only — the prompt, the temperature, the provider and the
    // model's semantics are untouched (see `validateRequest`).
    const req_ = validateRequest(await req.json());
    if (!req_.ok) return json({ error: req_.error }, req_.status);
    const { imageBase64: image_base64, language, mode } = req_;

    if (!GEMINI_API_KEY) {
      return json({ error: 'AI is not configured (missing GEMINI_API_KEY)' }, 500);
    }

    // Diagnostic (shows in Supabase logs): size of the image we received —
    // lets us verify the app really sends the full, healthy picture.
    console.log(
      `analyze-meal: mode=${mode} lang=${language} image≈${Math.round(image_base64.length / 1024)}KB(b64)`
    );

    const prompt = mode === 'menu' ? MENU_PROMPT : DETECT_PROMPT;
    const { text: raw, inTok, outTok } = await callGemini(prompt, image_base64, language);
    // `repaired` = the body was cut off and reassembled, so what follows is a
    // SUBSET of what the model listed. It is reported to the client as
    // `incomplete`; a plate that is missing foods is missing carbohydrate, and
    // nothing on screen would otherwise say so.
    const { data: parsed, repaired } = parseModelJson(raw);

    // Exact billing data from Gemini (usageMetadata) → ai_usage table.
    if (uid && (inTok || outTok)) {
      await logUsage({
        user_id: uid,
        kind: 'scan',
        model: MODEL,
        input_tokens: inTok,
        output_tokens: outTok,
        cost_usd: flashCost(inTok, outTok),
      });
    }

    if (mode === 'menu') {
      const dishes = Array.isArray(parsed?.dishes)
        ? parsed.dishes.filter((d: unknown) => typeof d === 'string' && d.trim())
        : [];
      return json({ dishes, incomplete: repaired });
    }

    // DETECT: map the model's `foods` onto the client's detection contract.
    const foods = Array.isArray(parsed?.foods) ? parsed.foods : [];
    const detections = foods
      .map(normalizeDetection)
      .filter((d: Detection | null): d is Detection => d !== null);

    return json({ detections, incomplete: repaired });
  } catch (error) {
    // Retries were spent on a busy provider. Say so with a stable CODE so the
    // app can tell "the server is overloaded" from "your request was wrong" —
    // it must never blame the patient's connection for our upstream.
    if (error instanceof AiUnavailableError) {
      return json(aiUnavailableBody(error), 503);
    }
    return json({ error: String(error) }, 500);
  }
});

/* ─────────────────────────────── GEMINI ─────────────────────────────── */

async function callGemini(
  prompt: string,
  imageBase64: string,
  language: string
): Promise<{ text: string; inTok: number; outTok: number }> {
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent` +
    `?key=${encodeURIComponent(GEMINI_API_KEY)}`;

  const body = {
    contents: [
      {
        role: 'user',
        parts: [
          {
            text:
              `${prompt}\n\nWrite display_name in the user's language: ${language}. ` +
              `search_name and alternatives MUST stay in English.`,
          },
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

  // The retry policy lives in _shared/aiFetch.ts so all four AI functions
  // share ONE behaviour — a policy written down four times is four policies
  // that drift. Throws AiUnavailableError once the attempts are spent.
  const res = await aiFetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const detail = await res.text();
    throw new Error(`Gemini error ${res.status}: ${detail}`);
  }

  const data = await res.json();

  const text = data?.candidates?.[0]?.content?.parts
    ?.map((p: { text?: string }) => p.text ?? '')
    .join('')
    .trim();
  if (!text) throw new Error('Empty response from Gemini');
  const um = data?.usageMetadata ?? {};
  return {
    text,
    inTok: um.promptTokenCount ?? 0,
    outTok: (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0),
  };
}

/* ─────────────────────────────── HELPERS ────────────────────────────── */



/** Accept both a bare base64 string and a full `data:...;base64,` URL. */
function stripDataUrl(b64: string): string {
  const comma = b64.indexOf('base64,');
  return comma >= 0 ? b64.slice(comma + 'base64,'.length) : b64;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
