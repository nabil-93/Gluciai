import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FoodItemResult } from '@/types';

/**
 * CHARACTERIZATION — the same answer at all three exits.
 *
 * The failure this remediation exists to stop was not any single wrong
 * number; it was three parts of the app disagreeing about what a `0` meant.
 * The screen showed it as a value, the database stored it as fact, and the
 * bolus screen pre-filled it as the meal's carbohydrate. So the test that
 * matters most is the one that reads all three exits of ONE plate:
 *
 *   what is DISPLAYED  ·  what is STORED  ·  what may SEED a dose
 *
 * The plate is built by the real `aggregateItems`, stored by the real
 * `saveMeal`, and seeded by the real `seedCarbsFromMeal`. Only the two
 * boundaries are doubled: Supabase (whose `insert` payload is captured
 * instead of sent) and the zustand store.
 */

vi.mock('@/i18n', () => ({
  default: { t: (key: string) => key },
}));

vi.mock('@/services/nutrition/cache', () => ({
  getCachedMatch: vi.fn(async () => null),
  setCachedMatch: vi.fn(async () => undefined),
  clearMatchCache: vi.fn(async () => undefined),
}));

vi.mock('@/services/nutrition/providers/remote', () => ({
  fatSecretProvider: { id: 'fatsecret', label: 'FatSecret', trust: 0.8, search: vi.fn() },
  edamamProvider: { id: 'edamam', label: 'Edamam', trust: 0.8, search: vi.fn() },
}));

const { inserts, addedMeals } = vi.hoisted(() => ({
  inserts: [] as { table: string; payload: any }[],
  addedMeals: [] as any[],
}));

vi.mock('@/lib/supabase', () => ({
  isDemoMode: false,
  supabase: {
    auth: {
      getUser: async () => ({
        data: { user: { id: '11111111-2222-3333-4444-555555555555' } },
      }),
    },
    from: (table: string) => ({
      insert: (payload: any) => {
        inserts.push({ table, payload });
        return {
          select: () => ({
            single: async () => ({
              data: { id: 'row-1', created_at: '2026-07-30T12:00:00.000Z' },
              error: null,
            }),
          }),
        };
      },
    }),
  },
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: {
    getState: () => ({
      addMeal: (m: any) => {
        addedMeals.push(m);
      },
    }),
  },
}));

const { aggregateItems, resolveFood } = await import('@/services/nutrition/engine');
const { carbDisplay, plateCarbStatus, seedCarbsFromMeal } = await import(
  '@/services/nutrition/carbProvenance'
);
const { saveMeal } = await import('@/services/data');

function item(overrides: Partial<FoodItemResult> = {}): FoodItemResult {
  return {
    name: 'food',
    portion_grams: 100,
    calories: 100,
    carbohydrates: 20,
    sugar: 5,
    protein: 3,
    fat: 1,
    fiber: 2,
    source: 'usda',
    detection_confidence: 1,
    nutrition_confidence: 1,
    ...overrides,
  };
}

/** Everything the three exits say about one plate. */
async function exitsFor(items: FoodItemResult[]) {
  const result = aggregateItems(items);
  const meal = await saveMeal(result);
  const row = inserts.find((i) => i.table === 'meal_scans')!;
  return {
    result,
    // 1 — what the result screen renders (same inputs as scan-result.tsx)
    displayed: carbDisplay(plateCarbStatus(items), result.carbohydrates),
    // 2 — what the database receives
    storedColumn: row.payload.carbs as number | null,
    storedJson: row.payload.result.carbs_known as boolean | undefined,
    // 3 — what the bolus screen may pre-fill from it
    seed: seedCarbsFromMeal(meal.result),
  };
}

beforeEach(() => {
  inserts.length = 0;
  addedMeals.length = 0;
});

describe('displayed · stored · seeded — one plate, one answer', () => {
  it('a fully known plate: exact, stored, and offered as a prefill', async () => {
    const e = await exitsFor([
      item({ name: 'Couscous', carbohydrates: 62, carbs_known: true }),
      item({ name: 'Salade', carbohydrates: 8, carbs_known: true }),
    ]);
    expect(e.result.carbohydrates).toBe(70);
    expect(e.displayed).toEqual({ kind: 'exact', grams: 70 });
    expect(e.storedColumn).toBe(70);
    expect(e.storedJson).toBe(true);
    expect(e.seed).toBe('70');
  });

  it('one unknown food: a floor on screen, nothing in the column, no prefill', async () => {
    const e = await exitsFor([
      item({ name: 'Couscous', carbohydrates: 62, carbs_known: true }),
      item({ name: 'Sauce', carbohydrates: 0, carbs_known: false }),
    ]);
    // The number itself does not move — only the claim made about it.
    expect(e.result.carbohydrates).toBe(62);
    expect(e.displayed).toEqual({ kind: 'atLeast', grams: 62 });
    expect(e.storedColumn).toBeNull();
    expect(e.storedJson).toBe(false);
    expect(e.seed).toBeNull();
    expect(e.result.warnings).toContain('warn:carbs_unknown|Sauce');
  });

  it('nothing known at all: never "0 g", never stored, never seeded', async () => {
    const e = await exitsFor([item({ name: 'Plat inconnu', carbohydrates: 0, carbs_known: false })]);
    expect(e.displayed).toEqual({ kind: 'unknown' });
    expect(e.storedColumn).toBeNull();
    expect(e.seed).toBeNull();
  });

  it('a genuine 0 g plate stays a real zero at all three exits', async () => {
    const e = await exitsFor([
      item({ name: 'Eau', calories: 0, carbohydrates: 0, sugar: 0, protein: 0, fat: 0, fiber: 2, carbs_known: true }),
    ]);
    expect(e.displayed).toEqual({ kind: 'exact', grams: 0 });
    expect(e.storedColumn).toBe(0); // a value, written as a value
    expect(e.storedJson).toBe(true);
    expect(e.seed).toBe('0'); // and it may reach the bolus field
  });

  it('a legacy plate with a non-zero total keeps working exactly as before', async () => {
    // No flags anywhere — an item shape from before this change.
    const e = await exitsFor([item({ name: 'Tajine', carbohydrates: 45 })]);
    expect(e.displayed).toEqual({ kind: 'exact', grams: 45 });
    expect(e.storedColumn).toBe(45);
    expect(e.seed).toBe('45');
  });

  it('a legacy-shaped zero plate: nothing on screen, nothing in the column, no seed', async () => {
    // DISCREPANCY, characterized deliberately. An item carrying no flag AND a
    // zero is `indeterminate`, so a plate re-aggregated from such items now
    // writes NULL to the mirror column where it used to write 0. That is the
    // conservative reading of an unprovable zero, and it costs nothing
    // downstream: `result.carbohydrates` still holds the 0 in the jsonb, and
    // the dashboard already reads `carbs ?? result.carbohydrates`, so it shows
    // exactly what it showed before.
    //
    // Not reachable from a fresh scan — every current producer sets the flag
    // explicitly — but reachable by re-saving a portion-edited legacy meal.
    const e = await exitsFor([item({ name: 'Thé', calories: 0, carbohydrates: 0 })]);
    expect(e.result.carbohydrates).toBe(0); // the jsonb keeps the number
    expect(e.storedColumn).toBeNull(); // the mirror column declines to claim it
    expect(e.displayed).toEqual({ kind: 'unknown' });
    expect(e.seed).toBeNull();
  });

  it('an IMPOSSIBLE carbohydrate cannot seed a bolus as a trusted figure', async () => {
    // The whole chain, from a raw per-100 g record a source insisted was
    // measured, to the three exits. 500 g of carbohydrate in 100 g of food is
    // not a measurement, so it must not become one — and must not become a
    // quietly clamped 100 either.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
    );
    try {
      const resolved = await resolveFood(
        { name: 'zzqqx produit douteux', portion_grams: 200, confidence: 0.9 },
        {
          calories: 300,
          carbs: 500,
          carbs_known: true,
          sugar: 10,
          protein: 5,
          fat: 4,
          fiber: 1,
        }
      );
      const e = await exitsFor([resolved!]);
      expect(e.result.carbohydrates).toBe(0); // never 100 g/100 g × 200 g
      expect(e.displayed).toEqual({ kind: 'unknown' });
      expect(e.storedColumn).toBeNull();
      expect(e.storedJson).toBe(false);
      expect(e.seed).toBeNull(); // the bolus field stays empty
      expect(e.result.warnings.some((w) => w.startsWith('warn:implausible'))).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('the store receives the same result object the database did', async () => {
    await exitsFor([item({ carbohydrates: 0, carbs_known: false })]);
    expect(addedMeals).toHaveLength(1);
    expect(addedMeals[0].result.carbs_known).toBe(false);
  });
});
