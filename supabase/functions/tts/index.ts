// Supabase Edge Function: natural text-to-speech with Gemini TTS.
//
// The "read it aloud" buttons (chat answers, lab voice doctor) used the
// browser's robotic speechSynthesis. This function turns a piece of text
// into REAL human-sounding speech with the same Gemini voice the live call
// uses ("Aoede"), so listening feels like one consistent doctor.
//
// In:  { text, language }  (text ≤ TEXT_CAP chars — the client sends
//                           sentence-grouped chunks, not whole documents)
// Out: { result: { audio: <base64 PCM 16-bit mono>, sampleRate } }
//
// Deploy:  supabase functions deploy tts
// Secrets: GEMINI_API_KEY (shared with the other functions)

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

import { callerUserId, logUsage, ttsCost } from '../_shared/usage.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const MODEL = Deno.env.get('GEMINI_TTS_MODEL') ?? 'gemini-2.5-flash-preview-tts';
/** Same voice as the live call (geminiLive.ts) — one doctor, one voice. */
const VOICE = Deno.env.get('GEMINI_TTS_VOICE') ?? 'Aoede';

/** One chunk ≈ 45 s of speech; keeps latency and per-call cost bounded. */
const TEXT_CAP = 1000;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
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
    const { text = '', language = 'fr' } = await req.json();

    if (!GEMINI_API_KEY) {
      return json({ error: 'AI is not configured (missing GEMINI_API_KEY)' }, 500);
    }
    const uid = await callerUserId(req);
    if (!uid) return json({ error: 'unauthorized' }, 401);

    const clean = String(text).trim().slice(0, TEXT_CAP);
    if (!clean) return json({ error: 'text required' }, 400);

    const langName = LANGUAGE_NAMES[language] ?? 'French';
    // TTS models take a natural-language style instruction before the text;
    // the instruction shapes the delivery and is not spoken.
    const prompt =
      `Read the following ${langName} text aloud like a warm, calm doctor ` +
      `speaking naturally and clearly to their patient — moderate pace, ` +
      `natural pauses, numbers and medical units read the natural spoken way. ` +
      `Read the text exactly as written, without adding or skipping anything:\n\n` +
      clean;

    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            responseModalities: ['AUDIO'],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName: VOICE } },
            },
          },
        }),
      }
    );
    if (!r.ok) {
      return json({ error: `AI provider error (${r.status}): ${await r.text()}` }, 502);
    }
    const data = await r.json();
    const part = (data.candidates?.[0]?.content?.parts ?? []).find(
      (p: { inlineData?: { data?: string } }) => p.inlineData?.data
    );
    const audio: string = part?.inlineData?.data ?? '';
    if (!audio) return json({ error: 'AI returned no audio' }, 502);
    // inlineData.mimeType is "audio/L16;codec=pcm;rate=24000".
    const rate = Number(
      /rate=(\d+)/.exec(part?.inlineData?.mimeType ?? '')?.[1] ?? 24000
    );

    // Exact billing row (best-effort, never breaks the request).
    try {
      const um = data.usageMetadata ?? {};
      const inTok = um.promptTokenCount ?? 0;
      const outTok = um.candidatesTokenCount ?? 0;
      if (inTok || outTok) {
        await logUsage({
          user_id: uid,
          kind: 'tts',
          model: MODEL,
          input_tokens: inTok,
          output_tokens: outTok,
          cost_usd: ttsCost(inTok, outTok),
        });
      }
    } catch {
      // logging only
    }

    return json({ result: { audio, sampleRate: rate } });
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
