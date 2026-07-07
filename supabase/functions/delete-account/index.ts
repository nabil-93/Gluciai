// Supabase Edge Function: permanently delete the signed-in user's account.
//
// Deleting an auth user requires the service-role key, which must never be
// exposed to the client — so it lives here. The caller is authenticated via
// their JWT (verify_jwt = true); we read their id from that token and delete
// exactly that account. Their rows in public.* are removed automatically by
// the `on delete cascade` foreign keys to auth.users.
//
// Deploy: supabase functions deploy delete-account

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'Not authenticated' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Admin client (service role) to identify the caller and delete them.
    const admin = createClient(url, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Resolve the caller's id from their own JWT — they can only delete self.
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData.user) {
      return json({ error: 'Invalid session' }, 401);
    }
    const uid = userData.user.id;

    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) return json({ error: delErr.message }, 500);

    return json({ ok: true });
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
