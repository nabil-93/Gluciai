import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, createUser, deleteUser, type TestUser } from '../_users';

/**
 * BOUNDARY — privilege escalation.
 *
 * A patient must not be able to become a doctor or an admin, attach themselves
 * to a doctor who never issued them a code, or unlock a feature the admin
 * locked.
 *
 * The defence is `protect_profile_fields()`, a BEFORE trigger that silently
 * REWRITES the protected columns back rather than raising. So the request
 * SUCCEEDS and the data does not change — a test asserting only "no error"
 * would be meaningless. Every case below re-reads the row through the service
 * role and asserts the stored value.
 */

let patient: TestUser;
let doctor: TestUser;

beforeAll(async () => {
  patient = await createUser('escalation-patient');
  doctor = await createUser('escalation-doctor', 'doctor');
});

afterAll(async () => {
  await deleteUser(patient.id);
  await deleteUser(doctor.id);
});

async function storedProfile() {
  const { data } = await admin
    .from('profiles')
    .select('role, doctor_id, promo_code_used')
    .eq('user_id', patient.id)
    .single();
  return data!;
}

describe('role escalation', () => {
  it('a patient cannot promote themselves to admin', async () => {
    await patient.client.from('profiles').update({ role: 'admin' }).eq('user_id', patient.id);

    const stored = await storedProfile();
    expect(stored.role).toBe('patient'); // trigger reverted it
  });

  it('a patient cannot promote themselves to doctor', async () => {
    await patient.client.from('profiles').update({ role: 'doctor' }).eq('user_id', patient.id);
    expect((await storedProfile()).role).toBe('patient');
  });

  it('the escalation attempt does not raise — it is silently reverted', async () => {
    // Recorded, not endorsed: the caller receives a success response and a
    // row that reads back as 'patient'. Nothing signals that a privileged
    // field was rejected. An attacker learns nothing; neither does an audit
    // log, because none is written.
    const { error } = await patient.client
      .from('profiles')
      .update({ role: 'admin' })
      .eq('user_id', patient.id);
    expect(error).toBeNull();
    expect((await storedProfile()).role).toBe('patient');
  });

  it('is_admin() remains false after the attempts', async () => {
    const { data, error } = await patient.client.rpc('is_admin');
    expect(error).toBeNull();
    expect(data).toBe(false);
  });

  it('is_doctor() remains false after the attempts', async () => {
    const { data } = await patient.client.rpc('is_doctor');
    expect(data).toBe(false);
  });
});

describe('doctor-link forgery', () => {
  it('a patient cannot attach themselves to a doctor by writing doctor_id', async () => {
    await patient.client
      .from('profiles')
      .update({ doctor_id: doctor.id })
      .eq('user_id', patient.id);

    const stored = await storedProfile();
    expect(stored.doctor_id).toBeNull(); // never attached

    // and the doctor consequently still sees nothing
    const { data } = await doctor.client
      .from('profiles')
      .select('user_id')
      .eq('user_id', patient.id);
    expect(data).toEqual([]);
  });

  it('a patient cannot forge promo_code_used', async () => {
    await patient.client
      .from('profiles')
      .update({ promo_code_used: 'STOLEN' })
      .eq('user_id', patient.id);
    expect((await storedProfile()).promo_code_used).toBeNull();
  });

  it('redeeming a non-existent code fails cleanly', async () => {
    const { data, error } = await patient.client.rpc('redeem_promo_code', {
      p_code: 'DOES-NOT-EXIST',
    });
    expect(error).toBeNull();
    expect(data).toMatchObject({ ok: false, error: 'invalid' });
    expect((await storedProfile()).doctor_id).toBeNull();
  });
});

describe('feature-lock tampering', () => {
  it('a new patient starts with scanner / ai_chat / ai_call locked', async () => {
    const { data, error } = await patient.client
      .from('feature_access')
      .select('feature, allowed')
      .order('feature');
    expect(error).toBeNull();
    expect(data).toEqual([
      { feature: 'ai_call', allowed: false },
      { feature: 'ai_chat', allowed: false },
      { feature: 'scanner', allowed: false },
    ]);
  });

  it('a patient cannot unlock a feature', async () => {
    const { data, error } = await patient.client
      .from('feature_access')
      .update({ allowed: true })
      .eq('user_id', patient.id)
      .eq('feature', 'scanner')
      .select();

    // No UPDATE policy exists on feature_access for patients, so nothing matches.
    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { data: stored } = await admin
      .from('feature_access')
      .select('allowed')
      .eq('user_id', patient.id)
      .eq('feature', 'scanner')
      .single();
    expect(stored!.allowed).toBe(false);
  });

  it('a patient cannot INSERT a permissive feature_access row', async () => {
    const { error } = await patient.client
      .from('feature_access')
      .insert({ user_id: patient.id, feature: 'labs', allowed: true });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });
});

describe('privileged RPC exposure', () => {
  it('a patient cannot invoke the trigger helper lock_features_for_new_user', async () => {
    // 0018 revoked EXECUTE from anon/authenticated on the trigger functions.
    const { error } = await patient.client.rpc('lock_features_for_new_user', {
      p_user: patient.id,
    });
    expect(error).not.toBeNull();
  });

  it('a patient cannot read another user consumption via call_minutes_used_this_month', async () => {
    const { error } = await patient.client.rpc('call_minutes_used_this_month', {
      p_user: doctor.id,
    });
    expect(error).not.toBeNull();
  });
});
