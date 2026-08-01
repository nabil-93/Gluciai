import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MealScan, NutritionResult } from '@/types';

/**
 * CHARACTERIZATION — the OFFLINE write path for a meal (finding N-1).
 *
 * `saveMeal` writes the mirror `meal_scans.carbs` column only when the app is
 * online. A meal saved with no connection keeps a local id and is pushed later
 * by `hydrateFromServer` → `pushRows`, which built its payload independently —
 * and un-gated. So the guarantee Step 10 established ("an unknown carbohydrate
 * is never written as a number") held on one path and not the other: the same
 * meal persisted as `null` online and as a fabricated `0` offline.
 *
 * This file pins the two paths to the SAME rule by running the real
 * `hydrateFromServer` against a doubled Supabase that records what it is asked
 * to insert. Only the two boundaries are mocked; the sync logic is the real one.
 */

const { inserts, serverMeals, localMeals } = vi.hoisted(() => ({
  inserts: [] as { table: string; rows: any[] }[],
  serverMeals: [] as any[],
  localMeals: [] as any[],
}));

/** A query builder that answers every chain `hydrateFromServer` uses. */
function makeQuery(table: string) {
  const rows = table === 'meal_scans' ? serverMeals : [];
  const answer = async () => ({ data: rows, error: null });
  const q: any = {
    select: () => q,
    eq: () => q,
    order: () => q,
    limit: answer,
    maybeSingle: async () => ({ data: null, error: null }),
    insert: (payload: any[]) => {
      inserts.push({ table, rows: payload });
      return {
        // The server echoes the inserted rows back with real uuids.
        select: async () => ({
          data: payload.map((r, i) => ({
            ...r,
            id: `00000000-0000-4000-8000-00000000000${i}`,
          })),
          error: null,
        }),
      };
    },
    // Since Step 14 the push is an idempotent upsert on the row's own primary
    // key. This file's assertions are unchanged — it still checks WHAT is
    // written — so the double simply records the same way.
    upsert: (payload: any[]) => {
      inserts.push({ table, rows: payload });
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
  supabase: {
    auth: {
      getUser: async () => ({
        data: { user: { id: '11111111-2222-3333-4444-555555555555' } },
      }),
    },
    from: (table: string) => makeQuery(table),
  },
}));

/** Any store field the module reads is an empty list; any setter is a no-op. */
function storeProxy(fields: Record<string, unknown>) {
  return new Proxy(fields, {
    get: (target, key: string) => {
      if (key in target) return target[key];
      return () => undefined; // hydrate(), adoptUser(), setters…
    },
  });
}

vi.mock('@/store/useAppStore', () => ({
  useAppStore: {
    getState: () =>
      storeProxy({
        accountUserId: '11111111-2222-3333-4444-555555555555',
        glucoseLogs: [],
        insulinLogs: [],
        meals: localMeals,
        activityLogs: [],
        measureLogs: [],
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

const { hydrateFromServer } = await import('@/services/sync');

function result(overrides: Partial<NutritionResult> = {}): NutritionResult {
  return {
    food_name: 'Couscous',
    estimated_portion: '400 g',
    calories: 520,
    carbohydrates: 70,
    sugar: 9,
    protein: 30,
    fat: 12,
    fiber: 7,
    glycemic_index: 65,
    confidence: 1,
    warnings: [],
    ...overrides,
  };
}

/** A meal that never reached the server: local id, so `missingOnServer` keeps
 *  it and the push path picks it up. */
function offlineMeal(r: NutritionResult): MealScan {
  return {
    id: '1753900000000-abc1234', // local id, not a uuid
    user_id: '11111111-2222-3333-4444-555555555555',
    result: r,
    created_at: '2026-07-30T12:00:00.000Z',
  };
}

async function pushedMealRow(r: NutritionResult) {
  localMeals.length = 0;
  localMeals.push(offlineMeal(r));
  const ok = await hydrateFromServer();
  expect(ok).toBe(true);
  const call = inserts.find((i) => i.table === 'meal_scans');
  expect(call, 'the offline meal should have been pushed').toBeDefined();
  return call!.rows[0];
}

beforeEach(() => {
  inserts.length = 0;
  serverMeals.length = 0;
  localMeals.length = 0;
});

describe('hydrateFromServer — the offline meal push obeys the Step 10 rule', () => {
  it('writes NULL for an unknown carbohydrate, exactly like saveMeal', async () => {
    const row = await pushedMealRow(result({ carbohydrates: 0, carbs_known: false }));
    expect(row.carbs).toBeNull();
    // The full picture still travels in the jsonb.
    expect(row.result.carbs_known).toBe(false);
    expect(row.result.carbohydrates).toBe(0);
  });

  it('writes a known figure as a number', async () => {
    const row = await pushedMealRow(result({ carbohydrates: 70, carbs_known: true }));
    expect(row.carbs).toBe(70);
  });

  it('writes a genuine 0 g meal as 0, not as null', async () => {
    const row = await pushedMealRow(
      result({ calories: 119, carbohydrates: 0, sugar: 0, carbs_known: true })
    );
    expect(row.carbs).toBe(0);
  });

  it('writes a legacy meal (no flag) as the number it holds', async () => {
    const row = await pushedMealRow(result({ carbohydrates: 45 }));
    expect(row.carbs).toBe(45);
  });

  it('leaves every other mirrored column untouched', async () => {
    const row = await pushedMealRow(result({ carbohydrates: 0, carbs_known: false }));
    expect(row).toMatchObject({
      calories: 520,
      sugar: 9,
      protein: 30,
      fat: 12,
      fiber: 7,
      glycemic_index: 65,
      confidence: 1,
      created_at: '2026-07-30T12:00:00.000Z',
    });
  });

  it('does not push a meal the server already has', async () => {
    serverMeals.push({
      id: '99999999-9999-4999-8999-999999999999',
      result: { food_name: 'Couscous' },
      created_at: '2026-07-30T12:00:00.000Z',
    });
    localMeals.push(offlineMeal(result()));
    await hydrateFromServer();
    expect(inserts.find((i) => i.table === 'meal_scans')).toBeUndefined();
  });
});

/**
 * STEP 22B — the same guarantee, now for the other six nutrients.
 *
 * The offline payload was gated on `carbs_known` alone, so a plate whose
 * PROTEIN total was a floor pushed that floor into `meal_scans.protein`, a
 * column the dashboard and the doctor report read as a measured total. Both
 * writers go through `mirrorColumn` now.
 */
describe('hydrateFromServer — the offline meal push obeys the Step 22B rule', () => {
  it('writes NULL for a nutrient no source declared', async () => {
    const row = await pushedMealRow(
      result({
        protein: 30,
        nutrients_known: {
          calories: true,
          carbs: true,
          sugar: true,
          protein: false,
          fat: true,
          fiber: true,
          sodium: true,
        },
      })
    );
    expect(row.protein).toBeNull();
    // Everything the plate DOES know still goes in as a number…
    expect(row).toMatchObject({ calories: 520, sugar: 9, fat: 12, fiber: 7 });
    // …and the floor itself is still in the jsonb, with its provenance.
    expect(row.result.protein).toBe(30);
    expect(row.result.nutrients_known.protein).toBe(false);
  });

  it('writes a DECLARED 0 as 0 — a real zero is a value', async () => {
    const row = await pushedMealRow(
      result({ protein: 0, nutrients_known: { protein: true } })
    );
    expect(row.protein).toBe(0);
  });

  it('writes an ABSENT nutrient as null — silence is not a zero', async () => {
    const row = await pushedMealRow(
      result({ protein: 0, nutrients_known: { protein: false } })
    );
    expect(row.protein).toBeNull();
  });

  it('a legacy meal with no map is written as it always was', async () => {
    // Never upgraded to "known": the row is pushed unchanged, and nothing
    // claims the app knows something about it that it does not.
    const row = await pushedMealRow(result());
    expect(row).toMatchObject({ calories: 520, protein: 30, fat: 12, fiber: 7 });
  });
});
