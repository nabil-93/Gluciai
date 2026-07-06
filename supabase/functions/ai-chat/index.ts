// Supabase Edge Function: diabetes education chat assistant.
// Deploy: supabase functions deploy ai-chat
// Secrets: supabase secrets set OPENAI_API_KEY=sk-...

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY') ?? '';
const MODEL = Deno.env.get('OPENAI_CHAT_MODEL') ?? 'gpt-4o-mini';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic',
  fr: 'French',
  de: 'German',
  en: 'English',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { messages = [], language = 'en', profile = null } = await req.json();
    if (!OPENAI_API_KEY) {
      return json({ error: 'AI is not configured (missing OPENAI_API_KEY)' }, 500);
    }

    const langName = LANGUAGE_NAMES[language] ?? 'English';
    const profileContext = profile
      ? `User context: diabetes type ${profile.diabetes_type}; target glucose ${profile.target_low}-${profile.target_high} mg/dL; carb ratio ${profile.carb_ratio ?? 'unknown'}; correction factor ${profile.correction_factor ?? 'unknown'}.`
      : 'No profile data available.';

    const systemPrompt = `You are GlucoAI, a diabetes education assistant.
Answer ONLY in ${langName}.
${profileContext}
Rules:
- Never diagnose disease.
- Never prescribe medication or insulin doses.
- Explain uncertainty when data is estimated.
- Recommend consulting healthcare professionals when appropriate.
- Be warm, clear and concise. Use short paragraphs.`;

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          ...messages.slice(-20),
        ],
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      return json({ error: 'AI provider error', detail }, 502);
    }

    const data = await response.json();
    return json({ reply: data.choices[0].message.content });
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
