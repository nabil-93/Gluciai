// Supabase Edge Function: enrich-dishes — ONE-SHOT recipe enrichment.
//
// Given a batch of curated healthy dishes, asks Gemini to write a DETAILED,
// authentic Moroccan recipe for a DIABETIC patient: quantified ingredients
// + granular preparation steps (timings, heat, cues) + a diabetes tip, in
// French AND Moroccan Darija. Used offline by scripts/enrich-healthy-foods.mjs
// to fill src/data/healthyFoodDetails.ts (the human then reviews). Uses the
// GEMINI_API_KEY secret so the key never leaves the server.
//
// Deploy: npx supabase functions deploy enrich-dishes --project-ref ftqyzpkzqeudzfztataz

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { isAdminCaller } from '../_shared/adminGuard.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MODEL = Deno.env.get('GEMINI_CHAT_MODEL') ?? 'gemini-2.5-flash';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function gemini(prompt: string, maxTokens = 2000): Promise<any | null> {
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
            temperature: 0.4,
          },
        }),
        signal: AbortSignal.timeout(45_000),
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

function buildPrompt(d: any): string {
  return `You are an expert MOROCCAN chef + dietitian writing a recipe for a
DIABETIC (type 2) patient. Write a DETAILED, authentic recipe for this dish.

DISH: "${d.name_fr}"  (Darija/Arabic name: "${d.name_ar}")
ONE SERVING = ${d.serving} (${d.grams} g). Approx per serving: ${d.calories} kcal,
${d.carbs} g carbs, ${d.sugar} g sugar, GI ${d.gi}. Category: ${d.category}.
${d.why_fr ? `Why it suits a diabetic: ${d.why_fr}` : ''}

Reply ONLY valid JSON (no markdown), with these 4 arrays:
{
 "ingredients_fr": [5-9 ingredient lines in FRENCH, each WITH AN EXACT QUANTITY (g, ml, c. à soupe, c. à café, pièces). Quantities must match a ~${d.grams} g serving.],
 "ingredients_ar": [the SAME list, same quantities, in MOROCCAN DARIJA written in ARABIC script],
 "steps_fr": [7-11 DETAILED numbered preparation steps in FRENCH. Be precise: exact quantities used at each step, cooking TIMES, HEAT level (feu doux/moyen/vif), texture/visual CUES, and technique. The LAST item MUST begin with "💡 Astuce diabète : " and give a concrete, dish-specific tip for a diabetic (portion in grams, GI, what to eat first, what to avoid/serve it with).],
 "steps_ar": [the SAME 7-11 steps in MOROCCAN DARIJA (Arabic script). The LAST item MUST begin with "💡 نصيحة للسكري: "]
}

Rules: authentic Moroccan home cooking; diabetic-friendly (little/no added
sugar, whole grains, controlled portion, healthy cooking — grilled/steamed/
baked over fried); realistic quantities; steps must be genuinely detailed
(a beginner could follow them). Darija must be natural, not literal Arabic.`;
}

function arr(v: unknown, max = 12): string[] {
  // 700-char cap: the last French step bundles the serving line + the full
  // "💡 Astuce diabète" tip and legitimately runs ~450-550 chars. 400 clipped
  // it mid-word; Arabic is more compact so it fit. Keep headroom.
  return Array.isArray(v)
    ? v.filter((s) => typeof s === 'string' && s.trim()).map((s) => String(s).trim().slice(0, 700)).slice(0, max)
    : [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  try {
    // Offline tooling only — never callable with just the public anon key.
    if (!(await isAdminCaller(req))) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    const body = await req.json();
    const dishes = Array.isArray(body.dishes) ? body.dishes.slice(0, 10) : [];
    const results = await Promise.all(
      dishes.map(async (d: any) => {
        const out = await gemini(buildPrompt(d), 4096);
        if (!out || typeof out !== 'object') return { id: d.id, ok: false };
        const ing_fr = arr(out.ingredients_fr, 10);
        const ing_ar = arr(out.ingredients_ar, 10);
        const st_fr = arr(out.steps_fr, 12);
        const st_ar = arr(out.steps_ar, 12);
        // Require all four non-empty, otherwise mark failed so the script keeps the hand version.
        const ok = ing_fr.length >= 3 && ing_ar.length >= 3 && st_fr.length >= 4 && st_ar.length >= 4;
        return { id: d.id, ok, ingredients_fr: ing_fr, ingredients_ar: ing_ar, steps_fr: st_fr, steps_ar: st_ar };
      })
    );
    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
