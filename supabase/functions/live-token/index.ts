// Supabase Edge Function: mints a short-lived ephemeral token so the app
// can open a Gemini Live API WebSocket from the browser WITHOUT exposing
// the real GEMINI_API_KEY. Tokens expire in 30 min and allow 3 connects
// (lets the client retry across live model fallbacks).
// Deploy: supabase functions deploy live-token

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    if (!GEMINI_API_KEY) {
      return json({ error: 'AI is not configured (missing GEMINI_API_KEY)' }, 500);
    }
    const now = Date.now();
    const body = {
      uses: 3,
      expireTime: new Date(now + 30 * 60 * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 3 * 60 * 1000).toISOString(),
    };
    const r = await fetch(
      'https://generativelanguage.googleapis.com/v1alpha/auth_tokens',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-goog-api-key': GEMINI_API_KEY,
        },
        body: JSON.stringify(body),
      }
    );
    if (!r.ok) {
      const detail = await r.text();
      return json({ error: 'token provider error', detail }, 502);
    }
    const data = await r.json();
    // data.name is the ephemeral token (format "auth_tokens/…")
    return json({ token: data.name });
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
