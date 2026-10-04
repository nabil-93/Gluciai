import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * WHAT A SYNC MUST NEVER LOSE OR RESURRECT (store audit F-07, D-01, D-02, D-04).
 *
 * The real `hydrateFromServer` runs here against two doubles: a query builder
 * that behaves like PostgREST (including its 1000-row cap per response) and a
 * store whose `getState()` returns a fresh snapshot each call, like zustand.
 */

const UID = '11111111-2222-3333-4444-555555555555';
const PG_MAX_ROWS = 1000;

const h = vi.hoisted(() => ({
  server: {} as Record<string, any[]>,
  deleteFails: false,
  deleted: [] as string[],
  upserts: [] as { table: string; rows: any[] }[],
  /** Runs once when glucose_logs is first read — "the patient saves now". */
  duringFetch: null as null | (() => void),
  state: {} as Record<string, any>,
  snapshot: null as null | Record<string, any>,
}));

function makeQuery(table: string) {
  const rows = () => h.server[table] ?? [];
  const q: any = {
    select: () => {
      if (table === 'glucose_logs' && h.duringFetch) {
        const fn = h.duringFetch;
        h.duringFetch = null;
        fn();
      }
      return q;
    },
    eq: () => q,
    order: () => q,
    limit: async () => ({ data: rows().slice(0, PG_MAX_ROWS), error: null }),
    // PostgREST answers at most PG_MAX_ROWS, whatever range was asked for.
    range: async (from: number, to: number) => ({
      data: rows().slice(from, Math.min(to + 1, from + PG_MAX_ROWS)),
      error: null,
    }),
    maybeSingle: async () => ({ data: null, error: null }),
    delete: () => ({
      eq: async (_col: string, id: string) => {
        if (h.deleteFails) return { error: { message: 'Failed to fetch' } };
        h.deleted.push(id);
        h.server[table] = rows().filter((r) => r.id !== id);
        return { error: null };
      },
    }),
    upsert: (payload: any[]) => {
      h.upserts.push({ table, rows: payload });
      return {
        select: async () => ({
          data: payload.map((r, i) => ({
            ...r,
            id: r.id ?? `00000000-0000-4000-8000-00000000000${i}`,
          })),
          error: null,
        }),
      };
    },
  };
  return q;
}

vi.mock('@/lib/supabase', () => ({
  isDemoMode: false,
  currentUserId: async () => UID,
  supabase: { auth: {}, from: (table: string) => makeQuery(table) },
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: {
    getState: () => ({
      ...h.state,
      clearPendingDelete: (id: string) => {
        h.state = {
          ...h.state,
          pendingDeletes: h.state.pendingDeletes.filter((d: any) => d.id !== id),
        };
      },
      hydrateServer: (snap: Record<string, any>) => {
        h.snapshot = snap;
      },
    }),
  },
}));

vi.mock('@/store/useProgramStore', () => ({
  useProgramStore: { getState: () => ({ adoptUser: () => undefined }) },
}));

const { hydrateFromServer } = await import('@/services/sync');

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const glucoseRow = (n: number, minutesAgo: number) => ({
  id: uuid(n),
  user_id: UID,
  value: 100 + (n % 50),
  unit: 'mg/dL',
  source: 'manual',
  notes: null,
  created_at: new Date(Date.UTC(2026, 9, 4, 12) - minutesAgo * 60_000).toISOString(),
});

beforeEach(() => {
  h.server = {};
  h.deleteFails = false;
  h.deleted = [];
  h.upserts = [];
  h.duringFetch = null;
  h.snapshot = null;
  h.state = {
    accountUserId: UID,
    profile: null,
    glucoseLogs: [],
    insulinLogs: [],
    meals: [],
    activityLogs: [],
    measureLogs: [],
    aiReminders: [],
    eventLogs: [],
    labReports: [],
    pendingDeletes: [],
  };
});

describe('D-02 · the whole history comes back, not the first 1000 rows', () => {
  it('2500 glucose readings on the server → 2500 on the phone', async () => {
    h.server.glucose_logs = Array.from({ length: 2500 }, (_, i) => glucoseRow(i + 1, i));
    expect(await hydrateFromServer()).toBe(true);
    expect(h.snapshot!.glucoseLogs).toHaveLength(2500);
    // Oldest reading present — the one a single capped request used to drop.
    expect(h.snapshot!.glucoseLogs.at(-1).id).toBe(uuid(2500));
  });
});

describe('F-07 · a deleted entry stays deleted', () => {
  it('a tombstone is replayed and cleared once the server confirms', async () => {
    h.server.insulin_logs = [
      { id: uuid(7), user_id: UID, insulin_type: 'rapid', dose: 6, meal_type: null, notes: null, created_at: '2026-10-04T08:00:00.000Z' },
    ];
    h.state.pendingDeletes = [{ table: 'insulin_logs', id: uuid(7) }];
    await hydrateFromServer();
    expect(h.deleted).toEqual([uuid(7)]);
    expect(h.snapshot!.insulinLogs).toEqual([]);
    expect(h.state.pendingDeletes).toEqual([]);
  });

  it('still offline: the row does NOT come back, and the tombstone is kept', async () => {
    h.deleteFails = true;
    h.server.insulin_logs = [
      { id: uuid(7), user_id: UID, insulin_type: 'rapid', dose: 6, meal_type: null, notes: null, created_at: '2026-10-04T08:00:00.000Z' },
    ];
    h.state.pendingDeletes = [{ table: 'insulin_logs', id: uuid(7) }];
    await hydrateFromServer();
    expect(h.snapshot!.insulinLogs).toEqual([]);
    expect(h.state.pendingDeletes).toEqual([{ table: 'insulin_logs', id: uuid(7) }]);
  });

  it('a tombstone naming an unknown table is dropped, never sent', async () => {
    h.state.pendingDeletes = [{ table: 'profiles', id: uuid(9) }];
    await hydrateFromServer();
    expect(h.deleted).toEqual([]);
    expect(h.state.pendingDeletes).toEqual([]);
  });
});

describe('D-01 · an entry saved while the sync runs is kept', () => {
  it('the reading typed during the pull survives the replace', async () => {
    h.server.glucose_logs = [glucoseRow(1, 120)];
    const typed = {
      id: 'local-typed-during-sync',
      user_id: UID,
      value: 142,
      unit: 'mg/dL',
      source: 'manual',
      created_at: '2026-10-04T12:30:00.000Z',
      pending_sync: true,
    };
    h.duringFetch = () => {
      h.state = { ...h.state, glucoseLogs: [typed, ...h.state.glucoseLogs] };
    };
    await hydrateFromServer();
    const ids = h.snapshot!.glucoseLogs.map((g: any) => g.id);
    expect(ids).toEqual(['local-typed-during-sync', uuid(1)]);
  });
});

describe('D-04 · an offline insulin dose keeps its meal', () => {
  it('the push carries meal_type', async () => {
    h.state.insulinLogs = [
      {
        id: 'local-dose-1',
        user_id: UID,
        insulin_type: 'rapid',
        dose: 4,
        meal_type: 'lunch',
        created_at: '2026-10-04T12:05:00.000Z',
      },
    ];
    await hydrateFromServer();
    const push = h.upserts.find((u) => u.table === 'insulin_logs');
    expect(push?.rows[0].meal_type).toBe('lunch');
  });
});
