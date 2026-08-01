import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, createUser, deleteUser, seedGlucose, type TestUser } from '../_users';

/**
 * BOUNDARY — patient ↔ patient isolation.
 *
 * Proves that User A can neither read nor modify User B's protected data.
 *
 * Reading the results correctly matters: under RLS a denied SELECT returns
 * ZERO ROWS, not an error, and a denied UPDATE/DELETE reports SUCCESS having
 * affected nothing. A test that only checked `error === null` would pass
 * against a completely open database. Every assertion here therefore checks
 * the returned ROWS.
 */

let alice: TestUser;
let bob: TestUser;
let bobGlucoseId: string;

beforeAll(async () => {
  alice = await createUser('patient-a');
  bob = await createUser('patient-b');
  bobGlucoseId = await seedGlucose(bob.id, 142);
});

afterAll(async () => {
  await deleteUser(alice.id);
  await deleteUser(bob.id);
});

describe('read isolation', () => {
  it("A sees only her own glucose rows, never B's", async () => {
    await seedGlucose(alice.id, 99);

    const { data, error } = await alice.client.from('glucose_logs').select('id, user_id, value');
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data!.length).toBeGreaterThan(0);
    expect(data!.every((r) => r.user_id === alice.id)).toBe(true);
    expect(data!.some((r) => r.id === bobGlucoseId)).toBe(false);
  });

  it("A cannot fetch B's glucose row even by its exact id", async () => {
    const { data, error } = await alice.client
      .from('glucose_logs')
      .select('id')
      .eq('id', bobGlucoseId);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it.each(['meal_scans', 'insulin_logs', 'activity_logs', 'measure_logs', 'event_logs'])(
    'A sees zero of B rows in %s',
    async (table) => {
      const { data, error } = await alice.client.from(table).select('id').eq('user_id', bob.id);
      expect(error).toBeNull();
      expect(data).toEqual([]);
    }
  );

  it("A cannot read B's profile", async () => {
    const { data, error } = await alice.client
      .from('profiles')
      .select('user_id, email')
      .eq('user_id', bob.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('A can read her own profile', async () => {
    const { data, error } = await alice.client
      .from('profiles')
      .select('user_id')
      .eq('user_id', alice.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });
});

describe('write isolation', () => {
  it("A cannot UPDATE B's glucose row", async () => {
    const { data, error } = await alice.client
      .from('glucose_logs')
      .update({ value: 400 })
      .eq('id', bobGlucoseId)
      .select();

    expect(error).toBeNull(); // RLS filters rather than raising
    expect(data).toEqual([]); // nothing was updated

    const { data: check } = await admin
      .from('glucose_logs')
      .select('value')
      .eq('id', bobGlucoseId)
      .single();
    expect(check!.value).toBe(142); // untouched
  });

  it("A cannot DELETE B's glucose row", async () => {
    const { data, error } = await alice.client
      .from('glucose_logs')
      .delete()
      .eq('id', bobGlucoseId)
      .select();

    expect(error).toBeNull();
    expect(data).toEqual([]);

    const { count } = await admin
      .from('glucose_logs')
      .select('id', { count: 'exact', head: true })
      .eq('id', bobGlucoseId);
    expect(count).toBe(1); // still there
  });

  it('A cannot INSERT a row owned by B', async () => {
    const { error } = await alice.client
      .from('glucose_logs')
      .insert({ user_id: bob.id, value: 55, unit: 'mg/dL', source: 'manual' });

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501'); // insufficient_privilege — WITH CHECK
  });

  it('A cannot re-parent her own row to B', async () => {
    // UPDATE policies here declare USING without WITH CHECK. PostgreSQL reuses
    // the USING expression as the WITH CHECK for UPDATE, so the NEW row must
    // also satisfy `auth.uid() = user_id`. This test is the empirical proof of
    // that reasoning, which the audit reached on paper and cleared.
    const ownRow = await seedGlucose(alice.id, 111);

    const { error } = await alice.client
      .from('glucose_logs')
      .update({ user_id: bob.id })
      .eq('id', ownRow)
      .select();

    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');

    const { data: check } = await admin
      .from('glucose_logs')
      .select('user_id')
      .eq('id', ownRow)
      .single();
    expect(check!.user_id).toBe(alice.id); // ownership intact
  });
});

describe('anonymous access', () => {
  it('a signed-out client reads nothing from a protected table', async () => {
    const anon = alice.client;
    await anon.auth.signOut();

    const { data } = await anon.from('glucose_logs').select('id');
    expect(data ?? []).toEqual([]);

    // restore for any later file (fileParallelism is off, but be explicit)
    await anon.auth.signInWithPassword({ email: alice.email, password: alice.password });
  });
});
