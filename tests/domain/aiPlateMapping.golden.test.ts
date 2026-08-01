import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * CHARACTERIZATION — the edge payload → dosing boundary, on the real client path.
 *
 * Step 11b changed what `analyze-meal` is allowed to say: a nutrient the model
 * did not state is `null` instead of `0`, a portion or confidence the function
 * had to default is reported as such, and a response it had to repair after a
 * truncation is marked `incomplete`. None of that protects anyone unless the
 * CLIENT reads it, so these tests start at the raw edge JSON and end at the
 * three things a patient acts on:
 *
 *   what the plate CLAIMS  ·  what it WARNS  ·  what may SEED a bolus
 *
 * The pipeline is the real one — `analyzeMealImage` → `applyPortionLearning` →
 * `analyzePlate` → `aggregateItems` → `seedCarbsFromMeal`. Only the outside
 * world is doubled: the edge function (its JSON is handed over verbatim), the
 * store, the match cache, and `fetch` (so USDA and Open Food Facts always miss
 * and the model's own estimate is what the plate is built from — which is
 * exactly the path where a fabricated `0` used to be dosable).
 */

vi.mock('@/i18n', () => ({
  default: { t: (key: string) => key },
}));

const { invoked, payload } = vi.hoisted(() => ({
  invoked: [] as { fn: string; body: any }[],
  payload: { data: null as any },
}));

vi.mock('@/lib/supabase', () => ({
  isDemoMode: false,
  supabase: {
    functions: {
      invoke: async (fn: string, opts: { body: any }) => {
        invoked.push({ fn, body: opts.body });
        return { data: payload.data, error: null };
      },
    },
  },
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: { getState: () => ({ corrections: [], usage: [] }) },
}));

vi.mock('@/services/nutrition/cache', () => ({
  getCachedMatch: vi.fn(async () => null),
  setCachedMatch: vi.fn(async () => undefined),
  clearMatchCache: vi.fn(async () => undefined),
}));

vi.mock('@/services/nutrition/providers/remote', () => ({
  fatSecretProvider: { id: 'fatsecret', label: 'FatSecret', trust: 0.8, search: vi.fn(async () => null) },
  edamamProvider: { id: 'edamam', label: 'Edamam', trust: 0.8, search: vi.fn(async () => null) },
}));

const { analyzeMealImage } = await import('@/services/ai');
const { carbDisplay, plateCarbStatus, seedCarbsFromMeal } = await import(
  '@/services/nutrition/carbProvenance'
);

/**
 * One food, named so that no database can possibly match it — the plate is
 * therefore built from the model's own per-100 g estimate, which is the branch
 * a fabricated zero used to reach the bolus field through.
 */
function detection(nutrition: Record<string, unknown> | undefined, extra: Record<string, unknown> = {}) {
  return {
    name: 'Zorblax maison',
    search_name: 'zorblax',
    category: 'Sauce',
    portion_grams: 100,
    portion_grams_stated: true,
    confidence: 0.9,
    confidence_stated: true,
    ...(nutrition ? { nutrition_per_100g: nutrition } : {}),
    ...extra,
  };
}

/** Everything the patient can act on, for one edge payload. */
async function plateFrom(data: any) {
  payload.data = data;
  const result = await analyzeMealImage('BASE64', 'fr');
  if (!result) return null;
  return {
    result,
    items: result.items ?? [],
    displayed: carbDisplay(plateCarbStatus(result.items ?? []), result.carbohydrates),
    seed: seedCarbsFromMeal(result),
  };
}

beforeEach(() => {
  invoked.length = 0;
  // Every database misses, so the model's estimate is what the plate uses.
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => ({ ok: false, status: 503, json: async () => ({}) }))
  );
});

describe('carbohydrate provenance, from edge JSON to bolus field (N-2)', () => {
  it('a MISSING carbohydrate arrives unknown — no 0 on screen, no prefill', async () => {
    const p = (await plateFrom({
      detections: [detection({ calories: 250, protein: 5, fat: 20 })], // no `carbs` key
      incomplete: false,
    }))!;
    // The estimate really was used — this is the AI-fallback branch.
    expect(p.items[0].source).toBe('ai_estimate');
    expect(p.items[0].carbs_known).toBe(false);
    expect(p.result.carbs_known).toBe(false);
    expect(p.displayed).toEqual({ kind: 'unknown' });
    expect(p.seed).toBeNull();
    expect(p.result.warnings).toContain('warn:carbs_unknown|Zorblax maison');
  });

  it('an explicit null carbohydrate arrives unknown', async () => {
    const p = (await plateFrom({
      detections: [detection({ calories: 250, carbs: null, protein: 5, fat: 20 })],
    }))!;
    expect(p.items[0].carbs_known).toBe(false);
    expect(p.seed).toBeNull();
  });

  it('an invalid or non-finite carbohydrate arrives unknown, never as NaN', async () => {
    for (const carbs of ['beaucoup', '', 'NaN', true]) {
      const p = (await plateFrom({ detections: [detection({ calories: 250, carbs })] }))!;
      expect(p.items[0].carbs_known).toBe(false);
      expect(Number.isFinite(p.items[0].carbohydrates)).toBe(true);
      expect(Number.isFinite(p.result.carbohydrates)).toBe(true);
      expect(p.seed).toBeNull();
    }
  });

  it('a genuine declared 0 stays a KNOWN zero and may still seed a dose', async () => {
    const p = (await plateFrom({
      detections: [detection({ calories: 165, carbs: 0, sugar: 0, protein: 31, fat: 3.6 })],
    }))!;
    expect(p.items[0].carbs_known).toBe(true);
    expect(p.result.carbs_known).toBe(true);
    expect(p.displayed).toEqual({ kind: 'exact', grams: 0 });
    expect(p.seed).toBe('0');
    expect(p.result.warnings).not.toContain('warn:carbs_unknown|Zorblax maison');
  });

  it('a valid positive carbohydrate is scaled by the portion and seeds the dose', async () => {
    const p = (await plateFrom({
      detections: [detection({ calories: 130, carbs: 28 }, { portion_grams: 200 })],
    }))!;
    expect(p.items[0].carbohydrates).toBe(56); // 28 g/100 g × 200 g
    expect(p.result.carbs_known).toBe(true);
    expect(p.displayed).toEqual({ kind: 'exact', grams: 56 });
    expect(p.seed).toBe('56');
  });

  it('a quoted number is still a number', async () => {
    const p = (await plateFrom({
      detections: [detection({ calories: '130', carbs: '28.4' })],
    }))!;
    expect(p.items[0].carbohydrates).toBe(28.4);
    expect(p.result.carbs_known).toBe(true);
  });
});

describe('the Step 11a bounds still fire on an edge payload (defence in depth)', () => {
  it('an IMPLAUSIBLE carbohydrate arrives untrusted, not clamped and not dosable', async () => {
    // The edge function passes 500 g through on purpose — clamping it there
    // would produce a plausible-looking 100 g the client would then trust.
    const p = (await plateFrom({
      detections: [detection({ calories: 400, carbs: 500 })],
    }))!;
    expect(p.items[0].implausible_fields).toContain('carbs');
    expect(p.items[0].carbs_known).toBe(false);
    expect(p.items[0].carbohydrates).toBe(0); // unknown, not a smaller wrong number
    expect(p.seed).toBeNull();
    expect(p.result.warnings).toContain('warn:implausible|Zorblax maison');
  });

  it('an implausible sibling is reported by name with its figure left visible', async () => {
    const p = (await plateFrom({
      detections: [detection({ calories: 250, carbs: 20, sodium: 90000 })],
    }))!;
    expect(p.items[0].implausible_fields).toContain('sodium');
    expect(p.items[0].sodium).toBe(90000); // shown as it came, with the warning
    expect(p.result.warnings).toContain('warn:implausible|Zorblax maison');
  });
});

describe('inferred portion and confidence are not observations (N-3)', () => {
  it('a DEFAULTED portion marks the food estimated', async () => {
    const p = (await plateFrom({
      detections: [detection({ calories: 250, carbs: 20 }, { portion_grams_stated: false })],
    }))!;
    expect(p.items[0].is_estimated).toBe(true);
  });

  it('a CLAMPED portion marks the food estimated', async () => {
    const p = (await plateFrom({
      detections: [detection({ calories: 250, carbs: 20 }, { portion_grams_clamped: true })],
    }))!;
    expect(p.items[0].is_estimated).toBe(true);
  });

  it('a DEFAULTED confidence marks the food estimated', async () => {
    const p = (await plateFrom({
      detections: [
        detection({ calories: 250, carbs: 20 }, { confidence: 0.6, confidence_stated: false }),
      ],
    }))!;
    expect(p.items[0].is_estimated).toBe(true);
  });

  it('a fully stated food is NOT marked estimated', async () => {
    const p = (await plateFrom({
      detections: [detection({ calories: 250, carbs: 20 })],
    }))!;
    expect(p.items[0].is_estimated).toBeFalsy();
  });

  it('an older deployment that sends no provenance flags behaves exactly as before', async () => {
    // The flags are absent, not false: nothing may be inferred from silence.
    const p = (await plateFrom({
      detections: [
        {
          name: 'Zorblax maison',
          search_name: 'zorblax',
          portion_grams: 100,
          confidence: 0.9,
          nutrition_per_100g: { calories: 250, carbs: 20, sugar: 1, protein: 3, fat: 12, fiber: 0 },
        },
      ],
    }))!;
    expect(p.items[0].is_estimated).toBeFalsy();
    expect(p.items[0].carbs_known).toBe(true);
    expect(p.seed).toBe('20');
  });
});

describe('a repaired response cannot pass for a complete plate (N-4)', () => {
  it('warns when the model answer was cut off and reassembled', async () => {
    const p = (await plateFrom({
      detections: [detection({ calories: 250, carbs: 20 })],
      incomplete: true,
    }))!;
    expect(p.result.warnings).toContain('warn:plate_incomplete');
    // The figures themselves are untouched — what is missing is other foods.
    expect(p.result.carbohydrates).toBe(20);
    expect(p.result.carbs_known).toBe(true);
  });

  it('says nothing when the response was complete', async () => {
    const p = (await plateFrom({
      detections: [detection({ calories: 250, carbs: 20 })],
      incomplete: false,
    }))!;
    expect(p.result.warnings).not.toContain('warn:plate_incomplete');
  });

  it('treats a missing `incomplete` field as complete, so an older deployment is unchanged', async () => {
    const p = (await plateFrom({ detections: [detection({ calories: 250, carbs: 20 })] }))!;
    expect(p.result.warnings).not.toContain('warn:plate_incomplete');
  });
});

describe('contracts the client must keep reading', () => {
  it('a food with NO nutrition estimate at all stays visible and unknown', async () => {
    const p = (await plateFrom({ detections: [detection(undefined)] }))!;
    expect(p.items).toHaveLength(1);
    expect(p.items[0].carbs_known).toBe(false);
    expect(p.items[0].nutrition_confidence).toBe(0);
    expect(p.seed).toBeNull();
  });

  it('drops the estimate when the model left the energy at zero — unchanged rule', async () => {
    // An all-zero estimate means the model did not fill it in; the food stays
    // on the plate as unmatched rather than as a zero-calorie food.
    const p = (await plateFrom({
      detections: [detection({ calories: 0, carbs: 0, protein: 0, fat: 0 })],
    }))!;
    expect(p.items[0].carbs_known).toBe(false);
    expect(p.seed).toBeNull();
  });

  it('still reads the legacy { result } contract, and trusts it only when it is a figure', async () => {
    const legacy = (await plateFrom({
      result: {
        food_name: 'Plat legacy',
        calories: 350,
        carbohydrates: 42,
        sugar: 5,
        protein: 10,
        fat: 12,
        fiber: 3,
        confidence: 0.8,
      },
    }))!;
    expect(legacy.result.carbs_known).toBe(true);
    expect(legacy.result.carbohydrates).toBe(42);
    expect(legacy.seed).toBe('42');

    const noCarbs = (await plateFrom({
      result: {
        food_name: 'Plat legacy',
        calories: 350,
        sugar: 5,
        protein: 10,
        fat: 12,
        fiber: 3,
        confidence: 0.8,
      },
    }))!;
    expect(noCarbs.result.carbs_known).toBe(false);
    expect(noCarbs.seed).toBeNull();
  });

  it('returns null when nothing was detected, and sends the documented body', async () => {
    expect(await plateFrom({ detections: [] })).toBeNull();
    expect(invoked.at(-1)).toEqual({
      fn: 'analyze-meal',
      body: { image_base64: 'BASE64', language: 'fr', mode: 'detect' },
    });
  });

  it('no plate ever reaches the screen carrying a NaN', async () => {
    const p = (await plateFrom({
      detections: [
        detection({ calories: 'x', carbs: 'y', sugar: null, protein: undefined, fat: '', fiber: NaN }),
        detection({ calories: 250, carbs: 20 }, { name: 'Deuxième', search_name: 'zorblax2' }),
      ],
    }))!;
    for (const value of [
      p.result.calories,
      p.result.carbohydrates,
      p.result.sugar,
      p.result.protein,
      p.result.fat,
      p.result.fiber,
      ...p.items.flatMap((i) => [i.calories, i.carbohydrates, i.sugar, i.protein, i.fat, i.fiber]),
    ]) {
      expect(Number.isFinite(value)).toBe(true);
    }
  });
});
