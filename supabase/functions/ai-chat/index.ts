// Supabase Edge Function: diabetes education chat assistant (Gemini).
// Deploy: supabase functions deploy ai-chat
// Secrets: supabase secrets set GEMINI_API_KEY=... (shared with analyze-meal)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { callerUserId, flashCost, logUsage } from '../_shared/usage.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MODEL = Deno.env.get('GEMINI_CHAT_MODEL') ?? 'gemini-2.5-flash';

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
    const {
      messages = [],
      language = 'en',
      profile = null,
      mode = 'chat',
      healthData = '',
    } = await req.json();
    if (!GEMINI_API_KEY) {
      return json({ error: 'AI is not configured (missing GEMINI_API_KEY)' }, 500);
    }

    const langName = LANGUAGE_NAMES[language] ?? 'English';
    const profileContext = profile
      ? `User context: diabetes type ${profile.diabetes_type}; target glucose ${profile.target_low}-${profile.target_high} mg/dL; carb ratio ${profile.carb_ratio ?? 'unknown'}; correction factor ${profile.correction_factor ?? 'unknown'}.`
      : 'No profile data available.';

    // Voice calls need short, natural answers that text-to-speech can read.
    const voiceRules =
      mode === 'voice'
        ? `
- This is a live VOICE call: answer in 2-3 short spoken sentences maximum.
- No markdown, no bullet lists, no emojis, no headings — plain speech only.
- Mention "confirm with your doctor" ONLY when discussing dose/treatment
  changes — not on every turn.`
        : `
- Use short paragraphs; simple bullet lists are OK.
- ALWAYS end your answer with ONE short line reminding the patient that
  these are suggestions, not medical advice, and that any treatment change
  should be confirmed with their doctor or care team.`;

    const systemPrompt = `You are GlucoAI, the patient's personal diabetes assistant inside the GlucoAI app.

LANGUAGE RULES (critical):
- The patient chose ${langName} in the app: ALWAYS answer in ${langName}.
- The patient may write or speak in ANY language or dialect — French,
  German, English, Arabic, or MOROCCAN DARIJA (often written in Latin
  letters with numbers, e.g. "chno ban lik", "3lach", "wach", "dyali",
  "bghit", "makla"). You understand ALL of them perfectly. NEVER say you
  don't understand the language and NEVER ask them to reformulate in
  another language — interpret it and answer in ${langName}.

PATIENT DATA (live from the app — use it to personalize EVERY answer;
when the patient asks "what did I eat", "how is my glucose", "how much
insulin did I take", answer precisely from this data):
${healthData || profileContext}

Rules:
- BE CONCRETELY HELPFUL — never refuse to engage. When the patient asks
  your opinion about their data (meals, insulin taken, glucose), ANALYSE
  the PATIENT DATA above and give a clear, practical answer: what looks
  good, what to watch out for, and specific suggestions (foods and
  portions, meal timing, hydration, physical activity, when to re-check
  glucose). Never reply with only "I can't judge / I don't have enough
  information" — use what you have.
- Insulin education is allowed and encouraged: explain how rapid/long
  insulin works, what the patient's own carb ratio and correction factor
  mean in practice, typical injection timing. You may show educational
  example calculations using THEIR ratios (clearly labelled as examples)
  — but never impose a new dose as a prescription.
- If information is missing, still give your best guidance from what you
  have, then ask at most ONE short follow-up question.
- Never diagnose disease.
- Explain uncertainty when data is estimated.
- Be warm, clear and concise.${voiceRules}`;

    // Map to Gemini roles; the conversation must start with a user turn.
    // Only the last few turns are sent — a long chat re-bills the whole
    // history on every message, so we cap it (voice needs even less context).
    const historyLimit = mode === 'voice' ? 6 : 8;
    const contents = (messages as { role: string; content: string }[])
      .slice(-historyLimit)
      .filter((m) => typeof m.content === 'string' && m.content.trim())
      .map((m) => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));
    while (contents.length && contents[0].role === 'model') contents.shift();
    if (contents.length === 0) {
      return json({ error: 'Empty conversation' }, 400);
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents,
          generationConfig: {
            // gemini-2.5-flash spends "thinking" tokens from the same
            // budget — disable thinking so answers never get truncated.
            thinkingConfig: { thinkingBudget: 0 },
            maxOutputTokens: mode === 'voice' ? 500 : 1500,
            temperature: 0.6,
          },
        }),
      }
    );

    if (!response.ok) {
      const detail = await response.text();
      return json({ error: 'AI provider error', detail }, 502);
    }

    const data = await response.json();
    const reply = (data.candidates?.[0]?.content?.parts ?? [])
      .map((p: { text?: string }) => p.text ?? '')
      .join('')
      .trim();
    if (!reply) {
      return json({ error: 'Empty AI reply' }, 502);
    }

    // Exact billing data from Gemini (usageMetadata) → ai_usage table.
    const um = data.usageMetadata ?? {};
    const inTok = um.promptTokenCount ?? 0;
    const outTok = (um.candidatesTokenCount ?? 0) + (um.thoughtsTokenCount ?? 0);
    const uid = await callerUserId(req);
    if (uid && (inTok || outTok)) {
      await logUsage({
        user_id: uid,
        kind: mode === 'voice' ? 'voice' : 'chat',
        model: MODEL,
        input_tokens: inTok,
        output_tokens: outTok,
        cost_usd: flashCost(inTok, outTok),
      });
    }

    return json({ reply });
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
