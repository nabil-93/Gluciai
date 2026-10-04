import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createUser, deleteUser, type TestUser } from '../_users';

/**
 * Store audit 2026-10 — migration 0036.
 *
 * C-11: a dose or a reading every app writer refuses must not be storable by
 * any other path either. The bounds are the app's own (0 < dose <= 100 U,
 * 20..900 mg/dL) — no new clinical limit is introduced here.
 *
 * S-07: a patient may write only the one ai_usage row the client really
 * produces — a bounded 'call' row about themselves.
 */

let patient: TestUser;

beforeAll(async () => {
  patient = await createUser('bounds-patient');
});

afterAll(async () => {
  await deleteUser(patient.id);
});

describe('C-11 — insulin_logs.dose', () => {
  it('rejects 250 U (a "25,0" typed without its comma)', async () => {
    const { error } = await patient.client
      .from('insulin_logs')
      .insert({ user_id: patient.id, insulin_type: 'rapid', dose: 250 });
    expect(error?.message).toContain('insulin_logs_dose_range');
  });

  it('rejects zero and negative doses', async () => {
    for (const dose of [0, -2]) {
      const { error } = await patient.client
        .from('insulin_logs')
        .insert({ user_id: patient.id, insulin_type: 'rapid', dose });
      expect(error?.message, `dose ${dose}`).toContain('insulin_logs_dose_range');
    }
  });

  it('accepts a real dose', async () => {
    const { error } = await patient.client
      .from('insulin_logs')
      .insert({ user_id: patient.id, insulin_type: 'rapid', dose: 6.5 });
    expect(error).toBeNull();
  });
});

describe('C-11 — glucose_logs.value', () => {
  it('rejects a mmol/L or g/L number stored as mg/dL', async () => {
    for (const value of [5.6, 1.2]) {
      const { error } = await patient.client
        .from('glucose_logs')
        .insert({ user_id: patient.id, value, unit: 'mg/dL' });
      expect(error?.message, `value ${value}`).toContain('glucose_logs_value_range');
    }
  });

  it('accepts a real reading', async () => {
    const { error } = await patient.client
      .from('glucose_logs')
      .insert({ user_id: patient.id, value: 142, unit: 'mg/dL' });
    expect(error).toBeNull();
  });
});

describe('S-07 — ai_usage inserts from the client', () => {
  it('accepts the bounded call row the voice screen writes', async () => {
    const { error } = await patient.client.from('ai_usage').insert({
      user_id: patient.id,
      kind: 'call',
      model: 'test-live',
      input_tokens: 120,
      output_tokens: 80,
      audio_input_tokens: 900,
      audio_output_tokens: 700,
      cost_usd: 0.01,
    });
    expect(error).toBeNull();
  });

  it('refuses any other kind — chat/scan rows come from the functions only', async () => {
    const { error } = await patient.client
      .from('ai_usage')
      .insert({ user_id: patient.id, kind: 'chat', model: 'x', cost_usd: 0 });
    expect(error).not.toBeNull();
  });

  it('refuses an absurd cost', async () => {
    const { error } = await patient.client
      .from('ai_usage')
      .insert({ user_id: patient.id, kind: 'call', model: 'x', cost_usd: 999 });
    expect(error).not.toBeNull();
  });
});
