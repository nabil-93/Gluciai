// Supabase Edge Function: permanently delete the signed-in user's account.
//
// Deleting an auth user requires the service-role key, which must never be
// exposed to the client — so it lives here. The caller is authenticated via
// their JWT (verify_jwt = true); we read their id from that token and delete
// exactly that account. Their rows in public.* are removed automatically by
// the `on delete cascade` foreign keys to auth.users.
//
// STORAGE IS NOT COVERED BY THAT CASCADE (audit finding C-9).
//
// `on delete cascade` reaches public.* only. Every uploaded file lives in
// storage.objects, which has no foreign key to auth.users, so deleting the
// account used to leave every meal photo and avatar in place — and two of the
// three per-user buckets are PUBLIC, so those files stayed fetchable at a
// stable URL by anyone who had ever seen one, forever, after the patient asked
// to be erased.
//
// Both App Store guideline 5.1.1(v) and GDPR erasure expect the images to go
// with the account. So the objects are removed FIRST, then the auth user.
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

    // ── 1. The patient's files, before the account that identifies them ────
    //
    // Every per-user upload is keyed by `<uid>/…`:
    //   profile-images   <uid>/avatar-*.jpg      (public bucket)
    //   meal-images      <uid>/meal-*.jpg        (public bucket)
    //   medical-reports  <uid>/…                 (private bucket)
    //
    // `dish-images` is deliberately absent: it holds app-owned dish artwork
    // shared by every patient, not personal data, and is not keyed by uid.
    //
    // Order matters. Removing the objects first means a failure leaves the
    // account intact and the operation can simply be retried; deleting the
    // user first would strand the files with no uid left to find them by.
    //
    // A listing returns at most LIST_PAGE objects (store audit D-05): a patient
    // with more meal photos than that kept the rest on the server while being
    // told everything was erased. Each pass removes what it listed, so the
    // next listing from offset 0 holds whatever is left; it stops when a pass
    // comes back empty, or fails loudly after MAX_PASSES.
    const LIST_PAGE = 1000;
    const MAX_PASSES = 50;
    const storageErrors: string[] = [];
    for (const bucket of ['profile-images', 'meal-images', 'medical-reports']) {
      try {
        let emptied = false;
        for (let pass = 0; pass < MAX_PASSES; pass++) {
          const { data: files, error: listErr } = await admin.storage
            .from(bucket)
            .list(uid, { limit: LIST_PAGE });
          if (listErr) {
            storageErrors.push(`${bucket}: ${listErr.message}`);
            break;
          }
          if (!files || files.length === 0) {
            emptied = true;
            break;
          }
          const paths = files.map((f) => `${uid}/${f.name}`);
          const { error: rmErr } = await admin.storage.from(bucket).remove(paths);
          if (rmErr) {
            storageErrors.push(`${bucket}: ${rmErr.message}`);
            break;
          }
        }
        if (!emptied && !storageErrors.some((e) => e.startsWith(`${bucket}:`))) {
          storageErrors.push(`${bucket}: not empty after ${MAX_PASSES} passes`);
        }
      } catch (e) {
        storageErrors.push(`${bucket}: ${String(e)}`);
      }
    }

    // A file that could not be removed must NOT be reported as an erasure.
    // Failing here leaves the account usable so the patient can retry, which
    // is the honest outcome — the alternative is deleting their login and
    // telling them their data is gone while their photos are still served.
    //
    // Internal detail stays in the function log, not in the response (S-08).
    if (storageErrors.length > 0) {
      console.error('[delete-account] storage', storageErrors);
      return json({ error: 'storage_delete_failed' }, 500);
    }

    // ── 2. The account itself; public.* cascades from here ─────────────────
    const { error: delErr } = await admin.auth.admin.deleteUser(uid);
    if (delErr) {
      console.error('[delete-account] deleteUser', delErr.message);
      return json({ error: 'account_delete_failed' }, 500);
    }

    return json({ ok: true });
  } catch (error) {
    console.error('[delete-account]', String(error));
    return json({ error: 'internal_error' }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
