// Supabase Edge Function: privileged operations for the GluciAI dashboard.
// Only admins (and doctors, for adding their own patients) may call it.
// Uses the service-role key server-side — it never reaches the browser.
// Deploy: supabase functions deploy admin-ops

import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * The caller's user id, taken from the JWT the PLATFORM already verified.
 *
 * This function runs with verify_jwt = true, so Supabase has checked the
 * signature and the expiry before a single line here executes; `sub` cannot
 * be forged past that. We read it directly instead of asking the auth server
 * with `auth.getUser()`.
 *
 * That call was the bug: it validates the SESSION, not just the token, so a
 * dashboard tab holding a perfectly valid access token whose session had
 * been rotated elsewhere got 401 from GoTrue — while every other request on
 * the same page kept working, because PostgREST only checks the signature.
 * The panel showed "unauthorized" on every create/password action with no
 * way to tell why.
 */
function callerIdFromJwt(jwt: string): string | null {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return null;
    // base64url → base64, padded.
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='));
    const claims = JSON.parse(json) as { sub?: string; exp?: number };
    if (!claims.sub) return null;
    // Belt and braces: the platform already rejects expired tokens.
    if (claims.exp && claims.exp * 1000 < Date.now()) return null;
    return claims.sub;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    // A missing service-role key makes every privileged call fail in a way
    // that looks exactly like a permission problem — say so instead.
    if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
      return json({ ok: false, error: 'server misconfigured: service key missing' }, 500);
    }
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
    if (!jwt) return json({ ok: false, error: 'no session token sent' }, 401);

    const callerId = callerIdFromJwt(jwt);
    if (!callerId) return json({ ok: false, error: 'session expired — sign in again' }, 401);

    const { data: callerProfile, error: profReadErr } = await admin
      .from('profiles')
      .select('role, name')
      .eq('user_id', callerId)
      .maybeSingle();

    if (profReadErr) {
      return json({ ok: false, error: `profile lookup failed: ${profReadErr.message}` }, 500);
    }
    if (!callerProfile) {
      return json({ ok: false, error: 'no profile for this account' }, 403);
    }

    const callerRole = callerProfile.role ?? 'patient';
    if (callerRole !== 'admin' && callerRole !== 'doctor') {
      return json({ ok: false, error: `forbidden: your role is "${callerRole}"` }, 403);
    }

    const body = await req.json();
    const action = String(body.action ?? '');

    // ── create_user: admin creates anyone; doctor creates own patients ──
    if (action === 'create_user') {
      const email = String(body.email ?? '').trim().toLowerCase();
      const password = String(body.password ?? '');
      const name = String(body.name ?? '').trim();
      let role = String(body.role ?? 'patient');
      let doctorId = body.doctor_id ? String(body.doctor_id) : null;

      if (!email || !password) return json({ ok: false, error: 'missing email/password' }, 400);
      if (password.length < 6) return json({ ok: false, error: 'password too short' }, 400);
      if (!['patient', 'doctor', 'admin'].includes(role)) role = 'patient';

      if (callerRole === 'doctor') {
        role = 'patient';
        doctorId = callerId; // doctors may only add patients linked to themselves
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr || !created?.user) {
        return json({ ok: false, error: createErr?.message ?? 'create failed' }, 400);
      }

      // A trigger on auth.users already inserted a patient profile for this
      // id, so this upsert is what applies the real role and the doctor link.
      const { error: profErr } = await admin.from('profiles').upsert({
        user_id: created.user.id,
        email,
        name,
        role,
        doctor_id: role === 'patient' ? doctorId : null,
        updated_at: new Date().toISOString(),
      });
      if (profErr) return json({ ok: false, error: `profile: ${profErr.message}` }, 400);

      return json({ ok: true, user_id: created.user.id });
    }

    // ── everything below is admin-only ──
    if (callerRole !== 'admin') {
      return json({ ok: false, error: 'forbidden: admins only' }, 403);
    }

    if (action === 'delete_user') {
      const userId = String(body.user_id ?? '');
      if (!userId) return json({ ok: false, error: 'missing user_id' }, 400);
      if (userId === callerId) return json({ ok: false, error: 'cannot delete yourself' }, 400);
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'set_password') {
      const userId = String(body.user_id ?? '');
      const password = String(body.password ?? '');
      if (!userId || password.length < 6) return json({ ok: false, error: 'invalid input' }, 400);
      const { error } = await admin.auth.admin.updateUserById(userId, { password });
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    if (action === 'set_role') {
      const userId = String(body.user_id ?? '');
      const role = String(body.role ?? '');
      if (!userId || !['patient', 'doctor', 'admin'].includes(role)) {
        return json({ ok: false, error: 'invalid input' }, 400);
      }
      const { error } = await admin.from('profiles').update({ role }).eq('user_id', userId);
      if (error) return json({ ok: false, error: error.message }, 400);
      return json({ ok: true });
    }

    return json({ ok: false, error: `unknown action "${action}"` }, 400);
  } catch (error) {
    return json({ ok: false, error: String(error) }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
