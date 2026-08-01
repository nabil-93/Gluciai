import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { admin, createUser, deleteUser, type TestUser } from '../_users';

/**
 * BOUNDARY — the columns behind a dose (findings N-17 and N-7).
 *
 * Step 13 taught the ENGINE to refuse a ratio, a correction factor or a target
 * that is not finite and positive. These tests are about the COLUMN: a value the
 * engine would refuse must not be storable in the first place, because the
 * engine is not the only thing that can write to the database.
 *
 * The constraints are `NOT VALID` — they enforce every new INSERT and UPDATE
 * without scanning unaudited history — so what is asserted here is exactly that:
 * a *new* write is rejected.
 *
 * Nothing here asserts a clinical RANGE. `> 0` and `>= 0` are the boundaries of
 * the quantity itself, not judgements about a good ratio or a plausible plate.
 */

let patient: TestUser;

beforeAll(async () => {
  patient = await createUser('param-patient');
});

afterAll(async () => {
  await deleteUser(patient.id);
});

describe('N-17 — profiles: a ratio and a correction factor must be positive', () => {
  it('rejects a negative carb_ratio, even from the service role', async () => {
    const { error } = await admin
      .from('profiles')
      .update({ carb_ratio: -10 })
      .eq('user_id', patient.id);
    expect(error).not.toBeNull();
    expect(error?.message).toContain('profiles_carb_ratio_positive');
  });

  it('rejects a zero carb_ratio — it would divide a dose by nothing', async () => {
    const { error } = await admin
      .from('profiles')
      .update({ carb_ratio: 0 })
      .eq('user_id', patient.id);
    expect(error).not.toBeNull();
    expect(error?.message).toContain('profiles_carb_ratio_positive');
  });

  it('rejects a negative or zero correction_factor', async () => {
    for (const value of [-50, 0]) {
      const { error } = await admin
        .from('profiles')
        .update({ correction_factor: value })
        .eq('user_id', patient.id);
      expect(error, `correction_factor ${value}`).not.toBeNull();
      expect(error?.message).toContain('profiles_correction_factor_positive');
    }
  });

  it('accepts a real value, and accepts absence', async () => {
    const { error: set } = await admin
      .from('profiles')
      .update({ carb_ratio: 12.5, correction_factor: 45 })
      .eq('user_id', patient.id);
    expect(set).toBeNull();

    // Absent stays absent: "not stated" is a first-class state (Step 13).
    const { error: clear } = await admin
      .from('profiles')
      .update({ carb_ratio: null, correction_factor: null })
      .eq('user_id', patient.id);
    expect(clear).toBeNull();
  });

  it('imposes no UPPER bound — that would be a clinical judgement', () => {
    // Documented as an assertion so nobody adds one without a specialist:
    // 0022 bounds `insulin_per_10g_* <= 20`, and Step 20B deliberately did not
    // copy that onto a g/U ratio or an mg/dL-per-U factor.
    return admin
      .from('profiles')
      .update({ carb_ratio: 500, correction_factor: 900 })
      .eq('user_id', patient.id)
      .then(({ error }) => {
        expect(error).toBeNull();
        return admin.from('profiles').update({ carb_ratio: null, correction_factor: null }).eq('user_id', patient.id);
      });
  });
});

describe('N-7 — meal_scans: nutrition cannot be negative', () => {
  const scan = (over: Record<string, unknown>) => ({
    user_id: patient.id,
    result: { food_name: 'x', estimated_portion: '100 g' },
    ...over,
  });

  it('rejects a negative carbohydrate', async () => {
    const { error } = await admin.from('meal_scans').insert(scan({ carbs: -5 }));
    expect(error).not.toBeNull();
    expect(error?.message).toContain('meal_scans_nonnegative');
  });

  it('rejects a negative energy, protein, fat, fibre, sugar, index or confidence', async () => {
    for (const col of [
      'calories',
      'sugar',
      'protein',
      'fat',
      'fiber',
      'glycemic_index',
      'confidence',
    ]) {
      const { error } = await admin.from('meal_scans').insert(scan({ [col]: -1 }));
      expect(error, `${col} accepted a negative`).not.toBeNull();
    }
  });

  it('accepts a genuine zero — water really is 0 g', async () => {
    // The distinction Step 10 exists to protect: 0 is a measurement, and the
    // constraint must not confuse "impossible" with "empty".
    const { data, error } = await admin
      .from('meal_scans')
      .insert(scan({ calories: 0, carbs: 0, sugar: 0, protein: 0, fat: 0, fiber: 0 }))
      .select('id')
      .single();
    expect(error).toBeNull();
    await admin.from('meal_scans').delete().eq('id', data!.id);
  });

  it('accepts an IMPLAUSIBLE but positive plate — flagging is the app\'s job', async () => {
    // Step 11a decided an impossible-looking figure is surfaced to the patient,
    // not dropped. A rejecting constraint here would also strand the row in the
    // Step 14 offline queue forever.
    const { data, error } = await admin
      .from('meal_scans')
      .insert(scan({ calories: 99999, carbs: 5000 }))
      .select('id')
      .single();
    expect(error).toBeNull();
    await admin.from('meal_scans').delete().eq('id', data!.id);
  });
});
