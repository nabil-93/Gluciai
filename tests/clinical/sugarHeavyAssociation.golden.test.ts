import { describe, expect, it } from 'vitest';

import { computeSmartBolus } from '@/services/bolusEngine';
import type { MealScan } from '@/types';

import { inputs, NOW } from './_fixtures';

/**
 * NUTR-A8 — the `sugarHeavy` ratio must describe ONE meal.
 *
 * It used to divide the last meal's SUGAR by the carbohydrate the patient
 * TYPED into the bolus field. Those are not necessarily the same meal: the
 * field can be seeded from a different meal, edited by hand, or handed over
 * from the programme. So a sugary breakfast could flag a savoury dinner, and a
 * large typed carbohydrate could hide a genuinely sugary plate.
 *
 * THE THRESHOLD (> 0.4) IS UNCHANGED and stays an RU-3/RU-6 question. These
 * fixtures pin only that both operands now come from the same plate, and that
 * the flag drives no arithmetic.
 */
function meal(over: Partial<MealScan['result']> = {}): MealScan {
  return {
    id: 'm-1',
    user_id: 'test-user',
    created_at: new Date(NOW.getTime() - 30 * 60000).toISOString(),
    result: {
      food_name: 'test',
      estimated_portion: '300 g',
      calories: 400,
      carbohydrates: 50,
      sugar: 5,
      protein: 10,
      fat: 10,
      fiber: 3,
      glycemic_index: 50,
      confidence: 1,
      warnings: [],
      ...over,
    },
  } as MealScan;
}

describe('NUTR-A8 — sugarHeavy compares one meal with itself', () => {
  it('flags a genuinely sugary plate (30 g sugar / 50 g carbs = 0.6)', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 50, carbsKnown: true, lastMeal: meal({ sugar: 30 }) })
    );
    expect(r.flags).toContain('sugarHeavy');
  });

  it('does not flag a savoury plate (5 g sugar / 50 g carbs = 0.1)', () => {
    const r = computeSmartBolus(
      inputs({ carbs: 50, carbsKnown: true, lastMeal: meal({ sugar: 5 }) })
    );
    expect(r.flags).not.toContain('sugarHeavy');
  });

  it('THE BUG: a sugary meal no longer hides behind a large typed carbohydrate', () => {
    // Meal is 30 g sugar / 50 g carbs = 0.6 → genuinely sugar-heavy.
    // The patient typed 200 g (a different, larger meal). The old rule computed
    // 30/200 = 0.15 and stayed silent about a plate that IS sugar-heavy.
    const r = computeSmartBolus(
      inputs({ carbs: 200, carbsKnown: true, lastMeal: meal({ sugar: 30 }) })
    );
    expect(r.flags).toContain('sugarHeavy');
  });

  it('THE BUG, other direction: a savoury meal is not flagged by a small typed carbohydrate', () => {
    // Meal is 5 g sugar / 50 g carbs = 0.1 → not sugar-heavy.
    // The patient typed 10 g. The old rule computed 5/10 = 0.5 and flagged a
    // savoury plate as a fast spike.
    const r = computeSmartBolus(
      inputs({ carbs: 10, carbsKnown: true, lastMeal: meal({ sugar: 5 }) })
    );
    expect(r.flags).not.toContain('sugarHeavy');
  });

  it('withholds the flag when the meal carbohydrate is unknown', () => {
    // A floor cannot support a ratio: withhold rather than compute from a
    // placeholder (the same rule the quality gate uses).
    const r = computeSmartBolus(
      inputs({
        carbs: 50,
        carbsKnown: true,
        lastMeal: meal({ sugar: 30, carbohydrates: 0, carbs_known: false }),
      })
    );
    expect(r.flags).not.toContain('sugarHeavy');
  });

  it('holds the 0.4 threshold exactly where it was', () => {
    // 20/50 = 0.4 — NOT greater than 0.4, so no flag.
    const at = computeSmartBolus(
      inputs({ carbs: 50, carbsKnown: true, lastMeal: meal({ sugar: 20 }) })
    );
    expect(at.flags).not.toContain('sugarHeavy');
    // 21/50 = 0.42 — over the line.
    const over = computeSmartBolus(
      inputs({ carbs: 50, carbsKnown: true, lastMeal: meal({ sugar: 21 }) })
    );
    expect(over.flags).toContain('sugarHeavy');
  });

  it('drives no arithmetic — the dose is identical either way', () => {
    const sugary = computeSmartBolus(
      inputs({ carbs: 50, carbsKnown: true, lastMeal: meal({ sugar: 30 }) })
    );
    const savoury = computeSmartBolus(
      inputs({ carbs: 50, carbsKnown: true, lastMeal: meal({ sugar: 5 }) })
    );
    expect(sugary.total).toBe(savoury.total);
    expect(sugary.mealBolus).toBe(savoury.mealBolus);
  });

  it('is absent when there is no meal at all', () => {
    const r = computeSmartBolus(inputs({ carbs: 50, carbsKnown: true, lastMeal: null }));
    expect(r.flags).not.toContain('sugarHeavy');
  });
});
