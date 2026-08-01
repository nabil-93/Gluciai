import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ActivityLog, GlucoseLog, InsulinLog, MeasureLog } from '@/types';

/**
 * CHARACTERIZATION — sync event identity (findings P5-005 / RC-4).
 *
 * Nothing a patient logs carries an identity of its own. A row created offline
 * gets a local timestamp id, the server assigns a DIFFERENT uuid when it is
 * finally pushed, and the only thing standing between "the same event" and
 * "two events" is a heuristic:
 *
 *     same data  AND  created_at within ±120 s        (`missingOnServer`)
 *
 * That heuristic is wrong in both directions, and both directions are clinical:
 *
 *   · TWO GENUINE DOSES COLLAPSE — a split dose (6 U, then 6 U a minute later,
 *     which is real practice) matches one server row, so the second injection
 *     is silently dropped from the patient's history and from IOB.
 *   · ONE EVENT DUPLICATES — if the local and server timestamps drift past the
 *     window, the same injection is pushed a second time. Two rows, and
 *     `computeIOB` (correctly, in isolation) counts both: the active-insulin
 *     figure doubles.
 *
 * The real `hydrateFromServer` runs here against a doubled Supabase that
 * records every insert. Only the two boundaries are mocked; the sync logic is
 * the real one.
 */

const { inserts, server, local } = vi.hoisted(() => ({
  inserts: [] as { table: string; rows: any[]; opts?: any }[],
  server: {
    glucose_logs: [] as any[],
    insulin_logs: [] as any[],
    meal_scans: [] as any[],
    activity_logs: [] as any[],
    measure_logs: [] as any[],
  } as Record<string, any[]>,
  local: {
    glucoseLogs: [] as any[],
    insulinLogs: [] as any[],
    meals: [] as any[],
    activityLogs: [] as any[],
    measureLogs: [] as any[],
  },
}));

const UID = '11111111-2222-3333-4444-555555555555';

/** A query builder answering every chain `hydrateFromServer` uses. */
function makeQuery(table: string) {
  const answer = async () => ({ data: server[table] ?? [], error: null });
  const echo = (payload: any[]) => ({
    // The server echoes the rows back, minting a uuid for any row that did not
    // bring one — which is exactly what it does for a client that omits `id`.
    select: async () => ({
      data: payload.map((r, i) => ({
        ...r,
        id: r.id ?? `99999999-0000-4000-8000-00000000000${i}`,
      })),
      error: null,
    }),
  });
  const q: any = {
    select: () => q,
    eq: () => q,
    order: () => q,
    limit: answer,
    maybeSingle: async () => ({ data: null, error: null }),
    insert: (payload: any[]) => {
      inserts.push({ table, rows: payload });
      // Model the table: an insert always lands (the server mints a key when
      // the client sends none).
      const stored = payload.map((r, i) => ({
        ...r,
        id: r.id ?? `99999999-0000-4000-8000-00000000000${i}`,
      }));
      server[table] = [...(server[table] ?? []), ...stored];
      return { select: async () => ({ data: stored, error: null }) };
    },
    /**
     * The real primary key, modelled: `upsert(..., { onConflict: 'id',
     * ignoreDuplicates: true })` is `ON CONFLICT DO NOTHING`, so a row whose id
     * is already stored is skipped and NOT returned. Without this the
     * "stays one event" claim would only be testing the double.
     */
    upsert: (payload: any[], opts?: any) => {
      inserts.push({ table, rows: payload, opts });
      const existing = new Set((server[table] ?? []).map((r) => r.id));
      const fresh = payload
        .map((r, i) => ({ ...r, id: r.id ?? `99999999-0000-4000-8000-00000000000${i}` }))
        .filter((r) => !existing.has(r.id));
      server[table] = [...(server[table] ?? []), ...fresh];
      return { select: async () => ({ data: fresh, error: null }) };
    },
  };
  return q;
}

vi.mock('@/lib/supabase', () => ({
  isDemoMode: false,
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: UID } } }) },
    from: (table: string) => makeQuery(table),
  },
}));

function storeProxy(fields: Record<string, unknown>) {
  return new Proxy(fields, {
    get: (target, key: string) => (key in target ? target[key] : () => undefined),
  });
}

vi.mock('@/store/useAppStore', () => ({
  useAppStore: {
    getState: () =>
      storeProxy({
        accountUserId: UID,
        glucoseLogs: local.glucoseLogs,
        insulinLogs: local.insulinLogs,
        meals: local.meals,
        activityLogs: local.activityLogs,
        measureLogs: local.measureLogs,
        aiReminders: [],
        eventLogs: [],
        labReports: [],
        chatMessages: [],
      }),
  },
}));

vi.mock('@/store/useProgramStore', () => ({
  useProgramStore: { getState: () => storeProxy({}) },
}));

const { hydrateFromServer, isServerId } = await import('@/services/sync');
/** The real engine, imported to prove a sync duplicate cannot double IOB —
 *  `computeIOB` itself is deliberately untouched by Step 14 (P7-011 is RU-11's). */
const { computeIOB } = await import('@/services/bolusEngine');

/* ── Builders ─────────────────────────────────────────────── */

const AT = '2026-07-30T12:00:00.000Z';
/** A local id as `data.ts` mints one today: a timestamp, not a uuid. */
const localId = (n = 1) => `175390000000${n}-abc1234`;

function insulin(over: Partial<InsulinLog> = {}): InsulinLog {
  return {
    id: localId(),
    user_id: UID,
    insulin_type: 'rapid',
    dose: 6,
    created_at: AT,
    ...over,
  };
}

function glucose(over: Partial<GlucoseLog> = {}): GlucoseLog {
  return {
    id: localId(),
    user_id: UID,
    value: 120,
    unit: 'mg/dL',
    source: 'manual',
    created_at: AT,
    ...over,
  };
}

function activity(over: Partial<ActivityLog> = {}): ActivityLog {
  return {
    id: localId(),
    user_id: UID,
    kind: 'walk',
    duration_min: 30,
    intensity: 'medium',
    created_at: AT,
    ...over,
  };
}

function measure(over: Partial<MeasureLog> = {}): MeasureLog {
  return { id: localId(), user_id: UID, kind: 'weight', value: 80, unit: 'kg', created_at: AT, ...over };
}

const pushed = (table: string) => inserts.find((i) => i.table === table)?.rows ?? [];

beforeEach(() => {
  inserts.length = 0;
  for (const k of Object.keys(server)) server[k] = [];
  local.glucoseLogs = [];
  local.insulinLogs = [];
  local.meals = [];
  local.activityLogs = [];
  local.measureLogs = [];
});

/* ── 1. The identity that does not exist ──────────────────── */

describe('an event carries the identity the device gave it', () => {
  it('pushes the row under its OWN uuid', async () => {
    // BEFORE: the payload omitted `id`, so the server minted a different key
    // and nothing tied the patient's event to the stored row.
    const mine = '4d1c0e7a-8f2b-4a55-9c31-0b7e6a2f1d90';
    local.insulinLogs = [insulin({ id: mine })];
    expect(await hydrateFromServer()).toBe(true);

    const rows = pushed('insulin_logs');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(mine);
  });

  it('pushes as an idempotent upsert on that key, never overwriting the server', async () => {
    local.insulinLogs = [insulin({ id: '4d1c0e7a-8f2b-4a55-9c31-0b7e6a2f1d90' })];
    expect(await hydrateFromServer()).toBe(true);
    const call = inserts.find((i) => i.table === 'insulin_logs')!;
    expect(call.opts).toEqual({ onConflict: 'id', ignoreDuplicates: true });
  });

  it('a LEGACY timestamp id is still sent without a key, as before', async () => {
    // The uuid column cannot take `1753900000001-abc1234`, and its server copy
    // (if any) carries an unrelated key — so nothing about legacy rows changes.
    local.insulinLogs = [insulin({ id: localId() })];
    expect(await hydrateFromServer()).toBe(true);
    expect(pushed('insulin_logs')[0].id).toBeUndefined();
  });

  it('`isServerId` still reads the id SHAPE — now "has a durable identity"', () => {
    expect(isServerId(localId())).toBe(false);
    expect(isServerId('99999999-0000-4000-8000-000000000000')).toBe(true);
  });
});

/* ── 2. Two genuine events collapse into one ──────────────── */

describe('two genuine events stay two events (P5-005)', () => {
  /**
   * REMEDIATED — Step 14.
   *
   * BEFORE: two 6 U injections a minute apart — real practice, a split dose or
   * a correction right after a meal bolus — both "matched" the one server row
   * within ±120 s with equal data, so NEITHER was pushed. The second injection
   * vanished at the next hydrate: absent from the history, from IOB, and from
   * the doctor's dashboard.
   *
   * AFTER: each injection carries its own key. The one already stored is
   * recognized by identity and skipped; the other is pushed.
   */
  it('pushes the second identical dose, and only that one', async () => {
    const first = 'aaaaaaaa-0000-4000-8000-000000000001';
    const second = 'bbbbbbbb-0000-4000-8000-000000000002';
    server.insulin_logs = [
      { id: first, user_id: UID, insulin_type: 'rapid', dose: 6, created_at: AT },
    ];
    local.insulinLogs = [
      insulin({ id: first, created_at: AT }),
      insulin({ id: second, created_at: '2026-07-30T12:01:00.000Z' }), // +60 s
    ];

    expect(await hydrateFromServer()).toBe(true);
    const rows = pushed('insulin_logs');
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe(second);
    // …and the server now holds both injections.
    expect(server.insulin_logs.map((r) => r.id).sort()).toEqual([first, second]);
  });

  it('two identical doses recorded offline both reach the server', async () => {
    local.insulinLogs = [
      insulin({ id: 'aaaaaaaa-0000-4000-8000-000000000001' }),
      insulin({ id: 'bbbbbbbb-0000-4000-8000-000000000002', created_at: '2026-07-30T12:00:30.000Z' }),
    ];
    expect(await hydrateFromServer()).toBe(true);
    expect(pushed('insulin_logs')).toHaveLength(2);
    expect(server.insulin_logs).toHaveLength(2);
  });

  it('keeps distinguishing rows whose data differs', async () => {
    server.insulin_logs = [
      { id: 'aaaaaaaa-0000-4000-8000-000000000001', user_id: UID, insulin_type: 'rapid', dose: 6, created_at: AT },
    ];
    local.insulinLogs = [
      insulin({ id: 'bbbbbbbb-0000-4000-8000-000000000002', dose: 4, created_at: '2026-07-30T12:01:00.000Z' }),
    ];
    expect(await hydrateFromServer()).toBe(true);
    expect(pushed('insulin_logs')).toHaveLength(1);
  });
});

/* ── 3. One event duplicates ──────────────────────────────── */

describe('the same event stays one event (RC-4)', () => {
  /**
   * REMEDIATED — Step 14.
   *
   * BEFORE: the same injection whose local timestamp had drifted past the
   * ±120 s window (a clock difference, a delayed push, a row edited offline)
   * was pushed a second time. `computeIOB` then counted two live doses and the
   * active-insulin figure doubled — the input to every later recommendation.
   * NOT a `computeIOB` defect: the engine is right to count two rows; the rows
   * should never have existed.
   */
  it('does not duplicate an event whose timestamp drifted', async () => {
    const same = 'aaaaaaaa-0000-4000-8000-000000000001';
    server.insulin_logs = [
      { id: same, user_id: UID, insulin_type: 'rapid', dose: 6, created_at: AT },
    ];
    // Same injection, local clock 3 minutes off — identity settles it anyway.
    local.insulinLogs = [insulin({ id: same, created_at: '2026-07-30T12:03:00.000Z' })];

    expect(await hydrateFromServer()).toBe(true);
    expect(pushed('insulin_logs')).toHaveLength(0);
    expect(server.insulin_logs).toHaveLength(1);
  });

  it('survives repeated syncs of the same offline event: still one row', async () => {
    const same = 'aaaaaaaa-0000-4000-8000-000000000001';
    local.insulinLogs = [insulin({ id: same })];

    // Three hydrates in a row. The store is replaced each time in the real app;
    // here the local row is deliberately left in place, which is the worst case
    // (a push whose response never arrived).
    expect(await hydrateFromServer()).toBe(true);
    expect(await hydrateFromServer()).toBe(true);
    expect(await hydrateFromServer()).toBe(true);

    expect(server.insulin_logs).toHaveLength(1);
    expect(server.insulin_logs[0].id).toBe(same);
  });

  it('no duplicate can double IOB, without computeIOB being touched', async () => {
    // The dose the engine would see after syncing the same 10 U injection
    // three times. `computeIOB` is the real, unmodified one.
    const same = 'aaaaaaaa-0000-4000-8000-000000000001';
    local.insulinLogs = [insulin({ id: same, dose: 10, created_at: AT })];
    await hydrateFromServer();
    await hydrateFromServer();

    const now = new Date('2026-07-30T13:00:00.000Z'); // 60 min later
    const iob = computeIOB(server.insulin_logs as InsulinLog[], now);
    expect(iob).toHaveLength(1);
    expect(iob[0].remaining).toBeCloseTo(7.5, 10); // 10 U × (1 − 60/240)
  });
});

/* ── 4. Every table behaves the same way ──────────────────── */

describe('every logged event type carries the same identity', () => {
  const ids = {
    g: 'aaaaaaaa-0000-4000-8000-00000000000a',
    a: 'bbbbbbbb-0000-4000-8000-00000000000b',
    x: 'cccccccc-0000-4000-8000-00000000000c',
    m: 'dddddddd-0000-4000-8000-00000000000d',
  };

  it('glucose, activity, measures and meals all push under their own key', async () => {
    local.glucoseLogs = [glucose({ id: ids.g })];
    local.activityLogs = [activity({ id: ids.a })];
    local.measureLogs = [measure({ id: ids.x })];
    local.meals = [
      {
        id: ids.m,
        user_id: UID,
        result: { food_name: 'Couscous', calories: 500, carbohydrates: 60, carbs_known: true },
        created_at: AT,
      },
    ];

    expect(await hydrateFromServer()).toBe(true);
    expect(pushed('glucose_logs')[0].id).toBe(ids.g);
    expect(pushed('activity_logs')[0].id).toBe(ids.a);
    expect(pushed('measure_logs')[0].id).toBe(ids.x);
    expect(pushed('meal_scans')[0].id).toBe(ids.m);
  });

  it('a second identical glucose reading is no longer collapsed', async () => {
    // BEFORE: pushed 0 rows — the reading was swallowed by the ±120 s match.
    server.glucose_logs = [
      { id: ids.g, user_id: UID, value: 120, unit: 'mg/dL', source: 'manual', created_at: AT },
    ];
    local.glucoseLogs = [
      glucose({ id: ids.g, created_at: AT }),
      glucose({ id: 'eeeeeeee-0000-4000-8000-00000000000e', created_at: '2026-07-30T12:01:00.000Z' }),
    ];
    expect(await hydrateFromServer()).toBe(true);
    expect(pushed('glucose_logs')).toHaveLength(1);
    expect(server.glucose_logs).toHaveLength(2);
  });

  it('re-syncing any of them stays idempotent', async () => {
    local.glucoseLogs = [glucose({ id: ids.g })];
    local.activityLogs = [activity({ id: ids.a })];
    local.measureLogs = [measure({ id: ids.x })];
    await hydrateFromServer();
    await hydrateFromServer();
    expect(server.glucose_logs).toHaveLength(1);
    expect(server.activity_logs).toHaveLength(1);
    expect(server.measure_logs).toHaveLength(1);
  });
});

/* ── 5. What must not regress ─────────────────────────────── */

describe('the guarantees Step 14 must preserve', () => {
  it('an offline glucose row keeps its unit through the push (Step 13)', async () => {
    local.glucoseLogs = [glucose({ id: 'aaaaaaaa-0000-4000-8000-00000000000a', value: 5.6, unit: 'mmol/L' })];
    expect(await hydrateFromServer()).toBe(true);
    const row = pushed('glucose_logs')[0];
    expect(row.unit).toBe('mmol/L');
    expect(row.value).toBe(5.6);
    // …and it comes back from the server unchanged, not coerced to mg/dL.
    expect(server.glucose_logs[0].unit).toBe('mmol/L');
  });

  it('an offline row keeps its own created_at, not the push time', async () => {
    local.insulinLogs = [insulin({ created_at: '2026-07-29T08:15:00.000Z' })];
    expect(await hydrateFromServer()).toBe(true);
    expect(pushed('insulin_logs')[0].created_at).toBe('2026-07-29T08:15:00.000Z');
  });

  it('a row the server already holds is never re-pushed', async () => {
    const same = '99999999-0000-4000-8000-000000000000';
    server.insulin_logs = [
      { id: same, user_id: UID, insulin_type: 'rapid', dose: 6, created_at: AT },
    ];
    local.insulinLogs = [insulin({ id: same })];
    expect(await hydrateFromServer()).toBe(true);
    expect(pushed('insulin_logs')).toHaveLength(0);
  });

  it('a local row whose id the server does NOT have is pushed, even with a uuid', async () => {
    // The offline-first guarantee: a uuid no longer means "already synced", so a
    // row created offline is still recovered.
    local.insulinLogs = [insulin({ id: 'aaaaaaaa-0000-4000-8000-000000000001' })];
    expect(await hydrateFromServer()).toBe(true);
    expect(pushed('insulin_logs')).toHaveLength(1);
  });

  it('every pushed row is attributed to the signed-in user', async () => {
    local.insulinLogs = [insulin()];
    local.glucoseLogs = [glucose()];
    expect(await hydrateFromServer()).toBe(true);
    expect(pushed('insulin_logs')[0].user_id).toBe(UID);
    expect(pushed('glucose_logs')[0].user_id).toBe(UID);
  });
});
