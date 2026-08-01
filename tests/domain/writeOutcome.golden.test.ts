import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CHARACTERIZATION — what a save CLAIMS when the server refused it (DATA-1).
 *
 * `insertReturning` answered every outcome with the same `null`: demo mode, no
 * network, a rejected insert, a thrown client. The caller could only do one
 * thing with that — keep the row locally and report success — so a write the
 * server REFUSED was indistinguishable from one it never heard about, and the
 * screen said "saved" for both.
 *
 * Step 14 keeps the offline-first behaviour exactly (the row survives locally
 * and is re-pushed by `hydrateFromServer`) and adds the one thing that was
 * missing: the row knows. A row the server confirmed carries no marker; a row
 * it did not carries `pending_sync: true`.
 *
 * Supabase is a hand-rolled double whose insert can be told to fail; the store
 * is a recorder. The save functions are the real ones.
 */

const { inserted, added, mode } = vi.hoisted(() => ({
  inserted: [] as { table: string; payload: any }[],
  added: [] as { kind: string; row: any }[],
  mode: { fail: false as boolean | string },
}));

const UID = '11111111-2222-3333-4444-555555555555';

vi.mock('@/lib/supabase', () => ({
  isDemoMode: false,
  supabase: {
    auth: { getUser: async () => ({ data: { user: { id: UID } } }) },
    from: (table: string) => ({
      insert: (payload: any) => {
        inserted.push({ table, payload });
        return {
          select: () => ({
            single: async () =>
              mode.fail
                ? { data: null, error: { message: typeof mode.fail === 'string' ? mode.fail : 'refused' } }
                : {
                    data: { id: payload.id, created_at: '2026-07-30T12:00:00.000Z' },
                    error: null,
                  },
          }),
        };
      },
    }),
  },
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: {
    getState: () =>
      new Proxy(
        {},
        {
          get: (_t, key: string) => (row: any) => {
            added.push({ kind: key, row });
          },
        }
      ),
  },
}));

vi.mock('@/i18n', () => ({ default: { t: (k: string) => k } }));

const { saveInsulin, saveGlucose, saveActivity, saveMeasure, saveMeal, savedStateKey } =
  await import('@/services/data');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const result = () => ({
  food_name: 'Couscous',
  estimated_portion: '300 g',
  calories: 400,
  carbohydrates: 50,
  sugar: 5,
  protein: 12,
  fat: 8,
  fiber: 4,
  glycemic_index: 60,
  confidence: 1,
  carbs_known: true,
  warnings: [] as string[],
});

beforeEach(() => {
  inserted.length = 0;
  added.length = 0;
  mode.fail = false;
});

/* ── Identity, at the point the event is created ──────────── */

describe('every clinical event is born with a durable identity', () => {
  it('mints a uuid and sends it as the row key', async () => {
    const log = await saveInsulin(6, 'rapid');
    expect(log.id).toMatch(UUID_RE);
    expect(inserted[0].payload.id).toBe(log.id);
  });

  it('gives two identical doses two different identities', async () => {
    const a = await saveInsulin(6, 'rapid');
    const b = await saveInsulin(6, 'rapid');
    expect(a.id).not.toBe(b.id);
    expect(inserted.map((i) => i.payload.id)).toEqual([a.id, b.id]);
  });

  it('does the same for glucose, activity, measures and meals', async () => {
    const g = await saveGlucose(120);
    const a = await saveActivity('walk', 30, 'medium');
    const m = await saveMeasure('weight', 80, 'kg');
    const meal = await saveMeal(result() as any);
    for (const row of [g, a, m, meal]) expect(row.id).toMatch(UUID_RE);
    expect(inserted.map((i) => i.payload.id)).toEqual([g.id, a.id, m.id, meal.id]);
  });
});

/* ── DATA-1: what the row says about itself ───────────────── */

describe('a confirmed write and a refused one are distinguishable', () => {
  it('a stored row carries no pending marker and takes the server timestamp', async () => {
    const log = await saveInsulin(6, 'rapid');
    expect(log.pending_sync).toBeUndefined();
    expect(log.created_at).toBe('2026-07-30T12:00:00.000Z');
  });

  it('a REFUSED write keeps the event locally and says so', async () => {
    // BEFORE: identical to the line above — a local id, no marker, and the
    // screen reported success.
    mode.fail = 'row level security';
    const log = await saveInsulin(6, 'rapid');

    expect(log.pending_sync).toBe(true); // the fact that was missing
    expect(log.id).toMatch(UUID_RE); // identity is the device's either way
    expect(added.some((a) => a.kind === 'addInsulinLog')).toBe(true); // still saved locally
  });

  it('keeps the event on every table when the write is refused', async () => {
    mode.fail = true;
    const g = await saveGlucose(120);
    const a = await saveActivity('walk', 30, 'medium');
    const m = await saveMeasure('weight', 80, 'kg');
    const meal = await saveMeal(result() as any);
    for (const row of [g, a, m, meal]) {
      expect(row.pending_sync).toBe(true);
      expect(row.id).toMatch(UUID_RE);
    }
    expect(added).toHaveLength(4); // nothing was dropped
  });

  it('a refused write keeps the CLIENT timestamp, not a server one it never got', async () => {
    mode.fail = true;
    const log = await saveInsulin(6, 'rapid', undefined, '2026-07-29T08:15:00.000Z');
    expect(log.created_at).toBe('2026-07-29T08:15:00.000Z');
    expect(log.pending_sync).toBe(true);
  });

  it('the identity a refused write used is the one a later push will reuse', async () => {
    // This is what makes the recovery idempotent: the retry carries the same
    // key, so it can only ever become one row.
    mode.fail = true;
    const log = await saveInsulin(6, 'rapid');
    expect(inserted[0].payload.id).toBe(log.id);
  });
});

/* ── DATA-1's UI half: what a SCREEN can learn from the row ───────────── */

describe('FIXED IN STEP 18 — DATA-1: the row says which of the three happened', () => {
  /**
   * BEFORE (recorded green against the old code — docs/KNOWN-BAD-BASELINE.md):
   *
   *   `rowIdentity` collapsed `{state:'local'}` and `{state:'failed', reason}`
   *   into one `pending_sync: true`; the row carried no `sync_state`; and
   *   `bolus.tsx` / `scan-result.tsx` discarded the return value of the save
   *   entirely, then reported success. A dose the server REFUSED was announced
   *   as "Injection enregistrée dans ton journal".
   *
   * AFTER: `sync_state` distinguishes "never attempted" from "attempted and
   * refused", and the two surfaces that CLAIM persistence read it through
   * `savedStateKey`.
   *
   * Unchanged, deliberately: `pending_sync` itself, the identity, the local
   * retention, the idempotent re-push, and dedup/retry semantics.
   */

  it('a confirmed write carries neither marker', async () => {
    mode.fail = false;
    const stored = await saveInsulin(6, 'rapid');
    expect(stored.pending_sync).toBeUndefined();
    expect(stored.sync_state).toBeUndefined();
    expect(savedStateKey(stored)).toBe('common.savedRemote');
  });

  it('a REFUSED write is now distinguishable from one never attempted', async () => {
    mode.fail = 'row level security';
    const refused = await saveInsulin(6, 'rapid');
    expect(refused.pending_sync).toBe(true); // unchanged
    expect(refused.sync_state).toBe('failed'); // the new fact
    expect(savedStateKey(refused)).toBe('common.savedFailed');
  });

  it('the three states map to three different sentences', () => {
    expect(savedStateKey({})).toBe('common.savedRemote');
    expect(savedStateKey({ pending_sync: true, sync_state: 'local' })).toBe('common.savedLocal');
    expect(savedStateKey({ pending_sync: true, sync_state: 'failed' })).toBe('common.savedFailed');
    expect(new Set(['common.savedRemote', 'common.savedLocal', 'common.savedFailed']).size).toBe(3);
  });

  it('a refused write is still KEPT locally, with its identity and timestamp', async () => {
    mode.fail = true;
    const log = await saveInsulin(6, 'rapid', undefined, '2026-07-29T08:15:00.000Z');
    expect(log.created_at).toBe('2026-07-29T08:15:00.000Z');
    expect(log.id).toMatch(UUID_RE);
    expect(added.some((a) => a.kind === 'addInsulinLog')).toBe(true);
    expect(inserted[0].payload.id).toBe(log.id); // same key a retry will reuse
  });

  it('every event table reports its state the same way', async () => {
    mode.fail = true;
    const rows = [
      await saveGlucose(120),
      await saveActivity('walk', 30, 'medium'),
      await saveMeasure('weight', 80, 'kg'),
      await saveMeal(result() as any),
    ];
    for (const row of rows) {
      expect(row.sync_state).toBe('failed');
      expect(savedStateKey(row)).toBe('common.savedFailed');
    }
    expect(added).toHaveLength(4); // nothing dropped
  });

  it('`sync_state` is local-only — no push payload carries it', () => {
    const sync = readFileSync(path.resolve(process.cwd(), 'src/services/sync.ts'), 'utf8');
    expect(sync).not.toContain('sync_state');
  });

  it('the surfaces that claim persistence now read the outcome', () => {
    const read = (p: string) => readFileSync(path.resolve(process.cwd(), p), 'utf8');
    const bolus = read('src/app/bolus.tsx');
    expect(bolus).toContain("const log = await saveInsulin(dose, 'rapid', note);");
    expect(bolus).toContain('setSaveState(savedStateKey(log));');
    const scan = read('src/app/scan-result.tsx');
    expect(scan).toContain('setSaveState(savedStateKey(row));');
    expect(scan).toContain('stateKey={saveState ?? undefined}');
  });

  it('every locale can say all three', async () => {
    const dicts = await Promise.all(
      ['fr', 'en', 'de', 'ar'].map(
        (l) =>
          import(`../../src/i18n/locales/${l}.json`) as Promise<{
            default: { common: Record<string, string> };
          }>
      )
    );
    for (const d of dicts) {
      for (const k of ['savedRemote', 'savedLocal', 'savedFailed']) {
        expect(d.default.common[k]).toBeTruthy();
      }
    }
    expect(new Set(dicts.map((d) => d.default.common.savedFailed)).size).toBe(4);
  });
});
