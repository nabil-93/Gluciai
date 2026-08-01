import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  createUser,
  deleteUser,
  linkPatientToDoctor,
  seedGlucose,
  type TestUser,
} from '../_users';

/**
 * BOUNDARY — doctor ↔ patient.
 *
 * The link is created through the real mechanism (`redeem_promo_code`), not by
 * writing `doctor_id` directly, because that direct write is blocked by design
 * and a fixture that bypassed it would prove nothing about the live flow.
 *
 * Intended rule: a LINKED doctor gets READ access to their patient's clinical
 * data and nothing more. An UNLINKED doctor gets nothing at all.
 */

let patient: TestUser;
let otherPatient: TestUser;
let linkedDoctor: TestUser;
let unlinkedDoctor: TestUser;
let patientGlucoseId: string;

const DOCTOR_READABLE = [
  'meal_scans',
  'glucose_logs',
  'insulin_logs',
  'activity_logs',
  'measure_logs',
] as const;

beforeAll(async () => {
  patient = await createUser('linked-patient');
  otherPatient = await createUser('other-patient');
  linkedDoctor = await createUser('doctor-linked', 'doctor');
  unlinkedDoctor = await createUser('doctor-unlinked', 'doctor');

  patientGlucoseId = await seedGlucose(patient.id, 173);
  await seedGlucose(otherPatient.id, 188);

  await linkPatientToDoctor(patient, linkedDoctor);
});

afterAll(async () => {
  await deleteUser(patient.id);
  await deleteUser(otherPatient.id);
  await deleteUser(linkedDoctor.id);
  await deleteUser(unlinkedDoctor.id);
});

describe('unlinked doctor', () => {
  it.each(DOCTOR_READABLE)('sees zero rows of an unlinked patient in %s', async (table) => {
    const { data, error } = await unlinkedDoctor.client
      .from(table)
      .select('id')
      .eq('user_id', patient.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('cannot read the unlinked patient profile', async () => {
    const { data, error } = await unlinkedDoctor.client
      .from('profiles')
      .select('user_id')
      .eq('user_id', patient.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('holds the doctor role yet still gets nothing — the role alone grants no access', async () => {
    const { data } = await unlinkedDoctor.client
      .from('profiles')
      .select('role')
      .eq('user_id', unlinkedDoctor.id)
      .single();
    expect(data!.role).toBe('doctor');

    const { data: rows } = await unlinkedDoctor.client.from('glucose_logs').select('id');
    expect((rows ?? []).some((r) => r.id === patientGlucoseId)).toBe(false);
  });
});

describe('linked doctor — granted reads', () => {
  it('can read the linked patient glucose rows', async () => {
    const { data, error } = await linkedDoctor.client
      .from('glucose_logs')
      .select('id, user_id')
      .eq('user_id', patient.id);
    expect(error).toBeNull();
    expect(data!.some((r) => r.id === patientGlucoseId)).toBe(true);
  });

  it('can read the linked patient profile', async () => {
    const { data, error } = await linkedDoctor.client
      .from('profiles')
      .select('user_id, doctor_id')
      .eq('user_id', patient.id);
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    expect(data![0].doctor_id).toBe(linkedDoctor.id);
  });

  it('still sees nothing of a DIFFERENT patient', async () => {
    const { data, error } = await linkedDoctor.client
      .from('glucose_logs')
      .select('id')
      .eq('user_id', otherPatient.id);
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

describe('linked doctor — writes are NOT granted', () => {
  it('cannot UPDATE the patient clinical data', async () => {
    const { data, error } = await linkedDoctor.client
      .from('glucose_logs')
      .update({ value: 999 })
      .eq('id', patientGlucoseId)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]); // read-only means read-only
  });

  it('cannot DELETE the patient clinical data', async () => {
    const { data, error } = await linkedDoctor.client
      .from('glucose_logs')
      .delete()
      .eq('id', patientGlucoseId)
      .select();
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  it('cannot INSERT rows on the patient behalf', async () => {
    const { error } = await linkedDoctor.client
      .from('glucose_logs')
      .insert({ user_id: patient.id, value: 60, unit: 'mg/dL', source: 'manual' });
    expect(error).not.toBeNull();
    expect(error!.code).toBe('42501');
  });
});

describe('patient-initiated unlink (unlink_my_doctor)', () => {
  it('revokes the doctor access, and only for the caller', async () => {
    const p2 = await createUser('unlink-patient');
    const g2 = await seedGlucose(p2.id, 155);
    await linkPatientToDoctor(p2, linkedDoctor);

    const { data: before } = await linkedDoctor.client
      .from('glucose_logs')
      .select('id')
      .eq('id', g2);
    expect(before).toHaveLength(1);

    const { data: res, error } = await p2.client.rpc('unlink_my_doctor');
    expect(error).toBeNull();
    expect((res as { ok?: boolean }).ok).toBe(true);

    const { data: after } = await linkedDoctor.client
      .from('glucose_logs')
      .select('id')
      .eq('id', g2);
    expect(after).toEqual([]); // access gone

    // the other patient's link is untouched
    const { data: stillLinked } = await linkedDoctor.client
      .from('glucose_logs')
      .select('id')
      .eq('id', patientGlucoseId);
    expect(stillLinked).toHaveLength(1);

    await deleteUser(p2.id);
  });

  it('is not callable anonymously', async () => {
    const p3 = await createUser('anon-unlink');
    await p3.client.auth.signOut();
    const { error } = await p3.client.rpc('unlink_my_doctor');
    expect(error).not.toBeNull(); // anon had EXECUTE revoked by name in 0029
    await deleteUser(p3.id);
  });
});
