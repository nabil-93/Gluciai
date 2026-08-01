import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { ANON_KEY, SERVICE_ROLE_KEY, SUPABASE_URL, TEST_EMAIL_DOMAIN, assertLocalTarget } from './_env';

/**
 * SECURITY SUITE — role fixtures.
 *
 * Two kinds of client, and the distinction is load-bearing:
 *
 *   `admin`   service-role. Used ONLY to ARRANGE state (create users, set
 *             roles, plant rows). Never used to assert an access decision —
 *             it bypasses RLS by design, so proving anything with it is
 *             meaningless.
 *   `asUser`  anon key + a real signed-in session. Every ASSERTION about who
 *             can see or change what goes through one of these, because this
 *             is the path a real client takes.
 */

assertLocalTarget();

export const admin: SupabaseClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export interface TestUser {
  id: string;
  email: string;
  password: string;
  client: SupabaseClient;
  accessToken: string;
}

export type Role = 'patient' | 'doctor' | 'admin';

const PASSWORD = 'test-password-123456';

/** Create a confirmed auth user and return a client signed in as them. */
export async function createUser(label: string, role: Role = 'patient'): Promise<TestUser> {
  const email = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@${TEST_EMAIL_DOMAIN}`;

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (error || !data.user) throw new Error(`createUser(${label}) failed: ${error?.message}`);
  const id = data.user.id;

  // The signup trigger creates the profile row. Roles other than 'patient' are
  // set through the service role, which is the only path the
  // protect_profile_fields trigger allows (auth.uid() is null server-side).
  if (role !== 'patient') {
    const { error: roleErr } = await admin.from('profiles').update({ role }).eq('user_id', id);
    if (roleErr) throw new Error(`setRole(${label}, ${role}) failed: ${roleErr.message}`);
  }

  const client = createClient(SUPABASE_URL, ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: session, error: signInErr } = await client.auth.signInWithPassword({
    email,
    password: PASSWORD,
  });
  if (signInErr || !session.session) {
    throw new Error(`signIn(${label}) failed: ${signInErr?.message}`);
  }

  return { id, email, password: PASSWORD, client, accessToken: session.session.access_token };
}

/** Remove a user and everything cascading from them. */
export async function deleteUser(id: string): Promise<void> {
  await admin.auth.admin.deleteUser(id).catch(() => undefined);
}

/**
 * Link a patient to a doctor through the REAL flow: the doctor issues a promo
 * code and the patient redeems it. Deliberately not a direct `doctor_id`
 * write — that path is blocked by design and the test suite must exercise the
 * same mechanism the app does.
 */
export async function linkPatientToDoctor(patient: TestUser, doctor: TestUser): Promise<string> {
  const code = `TEST${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

  const { error: codeErr } = await admin
    .from('promo_codes')
    .insert({ code, doctor_id: doctor.id, discount_pct: 10, active: true });
  if (codeErr) throw new Error(`promo code insert failed: ${codeErr.message}`);

  const { data, error } = await patient.client.rpc('redeem_promo_code', { p_code: code });
  if (error) throw new Error(`redeem_promo_code failed: ${error.message}`);
  if (!(data as { ok?: boolean })?.ok) {
    throw new Error(`redeem_promo_code returned not-ok: ${JSON.stringify(data)}`);
  }
  return code;
}

/** Plant a glucose reading owned by `user`, arranged via service role. */
export async function seedGlucose(userId: string, value: number): Promise<string> {
  const { data, error } = await admin
    .from('glucose_logs')
    .insert({ user_id: userId, value, unit: 'mg/dL', source: 'manual' })
    .select('id')
    .single();
  if (error) throw new Error(`seedGlucose failed: ${error.message}`);
  return data.id as string;
}
