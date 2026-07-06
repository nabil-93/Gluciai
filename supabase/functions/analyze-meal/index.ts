// Supabase Edge Function: analyze a meal photo with AI vision.
// Deploy: supabase functions deploy analyze-meal
// Secrets: supabase secrets set OPENAI_API_KEY=sk-...

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const MODEL = Deno.env.get('OPENAI_VISION_MODEL') ?? 'gpt-4o-mini';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const VISION_PROMPT = `Analyze the meal image. Return JSON only, with this exact shape:
{
  "food_name": string,
  "estimated_portion": string,
  "calories": number,
  "carbohydrates": number,
  "sugar": number,
  "protein": number,
  "fat": number,
  "fiber": number,
  "glycemic_index": number,
  "confidence": number,
  "warnings": string[]
}
All nutrition values are for the visible portion, in grams (calories in kcal).
glycemic_index is 0-100. confidence is 0-1.
Always include uncertainty in "warnings" when estimates are approximate.
If the image does not contain food, set food_name to "unknown" and confidence to 0.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { image_base64, language = 'en' } = await req.json();
    if (!image_base64) {
      return json({ error: 'image_base64 is required' }, 400);
    }
    if (!OPENAI_API_KEY) {
      return json({ error: 'AI is not configured (missing OPENAI_API_KEY)' }, 500);
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `${VISION_PROMPT}\nWrite food_name, estimated_portion and warnings in language: ${language}.`,
          },
          {
            role: 'user',
            content: [
              {
                type: 'image_url',
                image_url: { url: `data:image/jpeg;base64,${image_base64}` },
              },
            ],
          },
        ],
        max_tokens: 700,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return json({ error: 'AI provider error', detail }, 502);
    }

    const data = await response.json();
    const result = JSON.parse(data.choices[0].message.content);
    return json({ result });
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
