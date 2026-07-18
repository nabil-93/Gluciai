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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  try {
    const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Identify the caller from their JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userErr } = await admin.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ ok: false, error: 'unauthorized' }, 401);
    const caller = userData.user;

    const { data: callerProfile } = await admin
      .from('profiles')
      .select('role, name')
      .eq('user_id', caller.id)
      .maybeSingle();
    const callerRole = callerProfile?.role ?? 'patient';
    if (callerRole !== 'admin' && callerRole !== 'doctor') {
      return json({ ok: false, error: 'forbidden' }, 403);
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
        doctorId = caller.id; // doctors may only add patients linked to themselves
      }

      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (createErr || !created?.user) {
        return json({ ok: false, error: createErr?.message ?? 'create failed' }, 400);
      }

      const { error: profErr } = await admin.from('profiles').upsert({
        user_id: created.user.id,
        email,
        name,
        role,
        doctor_id: role === 'patient' ? doctorId : null,
        updated_at: new Date().toISOString(),
      });
      if (profErr) return json({ ok: false, error: profErr.message }, 400);

      return json({ ok: true, user_id: created.user.id });
    }

    // ── everything below is admin-only ──
    if (callerRole !== 'admin') return json({ ok: false, error: 'forbidden' }, 403);

    if (action === 'delete_user') {
      const userId = String(body.user_id ?? '');
      if (!userId) return json({ ok: false, error: 'missing user_id' }, 400);
      if (userId === caller.id) return json({ ok: false, error: 'cannot delete yourself' }, 400);
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

    return json({ ok: false, error: 'unknown action' }, 400);
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
