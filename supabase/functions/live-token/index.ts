// Supabase Edge Function: mints a short-lived ephemeral token so the app
// can open a Gemini Live API WebSocket from the browser WITHOUT exposing
// the real GEMINI_API_KEY. Tokens expire in 30 min and allow 3 connects
// (lets the client retry across live model fallbacks).
//
// Security: platform verify_jwt only checks the JWT signature — the public
// anon key passes it. So we ALSO require a real signed-in user here, and
// honor the admin's ai_call feature lock server-side (a locked or signed-out
// caller can NOT mint tokens and burn Gemini quota).
// Deploy: supabase functions deploy live-token

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';

const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY') ?? '';
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Resolve the calling USER (not the anon key) from the request JWT. */
async function callerUserId(req: Request): Promise<string | null> {
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt || !SUPABASE_URL || !SERVICE_KEY) return null;
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) return null;
    const u = await r.json();
    return u?.id ?? null;
  } catch {
    return null;
  }
}

/** True when the admin locked the ai_call feature for this user. */
async function aiCallLocked(userId: string): Promise<boolean> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/feature_access?user_id=eq.${userId}&feature=eq.ai_call&select=allowed`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!r.ok) return false; // fail open: a lookup outage must not block paying users
    const rows = await r.json();
    return Array.isArray(rows) && rows.length > 0 && rows[0]?.allowed === false;
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    if (!GEMINI_API_KEY) {
      return json({ error: 'AI is not configured (missing GEMINI_API_KEY)' }, 500);
    }

    // Must be a real signed-in user — the anon key alone is rejected.
    const uid = await callerUserId(req);
    if (!uid) return json({ error: 'unauthorized' }, 401);
    if (await aiCallLocked(uid)) return json({ error: 'feature locked' }, 403);

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
