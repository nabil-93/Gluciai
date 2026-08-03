import { describe, expect, it } from 'vitest';

import {
  GLASS_ML,
  dailyWaterNeedMl,
  glassesFor,
  hydrationForMeal,
  mlPerKgForAge,
} from '@/services/nutrition/hydration';
import type { FoodCategory, FoodItemResult } from '@/types';

/**
 * CHARACTERIZATION — `nutrition/hydration`.
 *
 * The card tells a patient how much to DRINK after this meal, and draws it as
 * glasses with the last one part-filled. Two things must hold or the number is
 * worse than no number:
 *
 *   · the remainder is a REMAINDER — the water the food already supplies is
 *     subtracted, not counted as progress toward a goal;
 *   · a part glass is a part glass. Rounding 60 ml up to a full glass would
 *     silently add 190 ml to what the patient was told to drink.
 */

const item = (category: FoodCategory, portion_grams: number): FoodItemResult =>
  ({
    name: category,
    category,
    portion_grams,
    calories: 100,
    carbohydrates: 0,
    sugar: 0,
    protein: 0,
    fat: 0,
    fiber: 0,
    source: 'ai_estimate',
    detection_confidence: 1,
    nutrition_confidence: 1,
  }) as FoodItemResult;

describe('mlPerKgForAge — the decline is the reason age is here at all', () => {
  it('steps down through the clinical bands', () => {
    expect(mlPerKgForAge(10)).toBe(40); // child
    expect(mlPerKgForAge(30)).toBe(35); // adult
    expect(mlPerKgForAge(60)).toBe(30);
    expect(mlPerKgForAge(75)).toBe(25);
  });

  it('is monotonic across adulthood — never rises with age', () => {
    for (let a = 18; a < 100; a += 1) {
      expect(mlPerKgForAge(a)).toBeLessThanOrEqual(mlPerKgForAge(a - 1));
    }
  });

  it('the boundaries fall on the documented side', () => {
    expect(mlPerKgForAge(55)).toBe(35);
    expect(mlPerKgForAge(56)).toBe(30);
    expect(mlPerKgForAge(65)).toBe(30);
    expect(mlPerKgForAge(66)).toBe(25);
  });
});

describe('dailyWaterNeedMl', () => {
  it('scales with weight and falls with age', () => {
    expect(dailyWaterNeedMl(70, 30)).toBe(2450);
    expect(dailyWaterNeedMl(70, 60)).toBe(2100);
    expect(dailyWaterNeedMl(70, 80)).toBe(1750);
  });

  it('holds the 1.5–4 L band whatever the arithmetic says', () => {
    expect(dailyWaterNeedMl(30, 80)).toBe(1500);
    expect(dailyWaterNeedMl(250, 20)).toBe(4000);
  });

  it('uses the familiar two litres when there is no weight to scale from', () => {
    expect(dailyWaterNeedMl(undefined, 40)).toBe(2000);
    expect(dailyWaterNeedMl(0, 40)).toBe(2000);
    expect(dailyWaterNeedMl(-5, 40)).toBe(2000);
    expect(dailyWaterNeedMl(Number.NaN, 40)).toBe(2000);
  });

  it('always lands on a round 50 ml — the inputs do not support finer', () => {
    for (let kg = 40; kg <= 120; kg += 1) {
      expect(dailyWaterNeedMl(kg, 40) % 50).toBe(0);
    }
  });
});

describe('glassesFor — the last glass is the whole point', () => {
  it('splits into whole glasses and a fraction', () => {
    expect(glassesFor(500)).toMatchObject({ full: 2, partial: 0, total: 2 });
    expect(glassesFor(560)).toMatchObject({ full: 2, total: 3 });
    expect(glassesFor(560).partial).toBeCloseTo(0.24, 2);
  });

  it('a little left over is drawn as a little, never rounded up to a glass', () => {
    const g = glassesFor(60);
    expect(g.full).toBe(0);
    expect(g.partial).toBeCloseTo(0.24, 2);
    expect(g.total).toBe(1);
    // The trap this guards: 60 ml shown as one full glass is 190 ml of fiction.
    expect(g.partial).toBeLessThan(1);
  });

  it('nothing to drink draws nothing', () => {
    expect(glassesFor(0)).toMatchObject({ full: 0, partial: 0, total: 0 });
    expect(glassesFor(-100)).toMatchObject({ full: 0, partial: 0, total: 0 });
  });

  it('an exact multiple has no partial', () => {
    for (const n of [1, 2, 3, 7]) {
      expect(glassesFor(n * GLASS_ML)).toMatchObject({ full: n, partial: 0, total: n });
    }
  });

  it('a float artefact cannot draw a sliver beside a full glass', () => {
    // 0.9999999 of a glass is a glass, not a glass plus a wisp.
    const g = glassesFor(GLASS_ML - 0.0001);
    expect(g.full + (g.partial > 0 ? 1 : 0)).toBe(1);
  });

  it('honours a different glass size', () => {
    expect(glassesFor(600, 200)).toMatchObject({ full: 3, partial: 0, total: 3 });
    expect(glassesFor(0, 0).glassMl).toBe(GLASS_ML); // a zero size falls back
  });

  it('the drawn glasses always add up to what was asked for', () => {
    // Within one rounding step of the fill fraction: `partial` is kept to 2dp
    // on purpose, so a full glass cannot be drawn as a glass plus a wisp. On a
    // 250 ml glass that is at most ~1.3 ml of drift, and `toDrinkMl` is itself
    // rounded to 10 ml upstream, so nothing the patient reads moves.
    for (const ml of [10, 60, 125, 250, 300, 499, 500, 740, 1000, 1310]) {
      const g = glassesFor(ml);
      expect(Math.abs((g.full + g.partial) * g.glassMl - ml)).toBeLessThanOrEqual(1.3);
    }
  });
});

describe('hydrationForMeal — the chain end to end', () => {
  const base = { weightKg: 70, age: 40, dailyKcalGoal: 2000 };

  it('subtracts the water the food already supplies', () => {
    // 70 kg / 40 y → 2450 ml/day. A 400 kcal meal is a fifth of 2000 kcal,
    // so 490 ml. A 250 g soup holds 220 ml. 270 ml left to drink.
    const p = hydrationForMeal({ items: [item('Soup', 250)], mealKcal: 400, ...base });
    expect(p.dailyNeedMl).toBe(2450);
    expect(p.mealNeedMl).toBe(490);
    expect(p.fromFoodMl).toBe(220);
    expect(p.toDrinkMl).toBe(270);
    expect(p.coveredByFood).toBe(false);
  });

  it('says so when the food covers the meal on its own', () => {
    // A big bowl of soup against a small meal: nothing left to drink.
    const p = hydrationForMeal({ items: [item('Soup', 800)], mealKcal: 200, ...base });
    expect(p.toDrinkMl).toBe(0);
    expect(p.coveredByFood).toBe(true);
    expect(p.glasses.total).toBe(0);
  });

  it('never returns a negative remainder', () => {
    const p = hydrationForMeal({ items: [item('Drink', 2000)], mealKcal: 50, ...base });
    expect(p.toDrinkMl).toBeGreaterThanOrEqual(0);
  });

  it('a bigger meal claims a bigger share', () => {
    const small = hydrationForMeal({ items: [], mealKcal: 300, ...base });
    const big = hydrationForMeal({ items: [], mealKcal: 900, ...base });
    expect(big.mealNeedMl).toBeGreaterThan(small.mealNeedMl);
  });

  it('CAPS an absurd plate — no meal demands more than half the day', () => {
    // The 5 415 kcal plate that prompted this: energy-proportional apportioning
    // would ask for over six litres in one sitting. It is a guard rail, and it
    // is the reason this test exists rather than a comment.
    const p = hydrationForMeal({ items: [], mealKcal: 5415, ...base });
    expect(p.mealNeedMl).toBeLessThanOrEqual(p.dailyNeedMl * 0.5);
    expect(p.toDrinkMl).toBeLessThanOrEqual(1230);
  });

  it('a meal with no usable energy asks for nothing', () => {
    for (const kcal of [0, -100, Number.NaN]) {
      const p = hydrationForMeal({ items: [], mealKcal: kcal, ...base });
      expect(p.mealNeedMl).toBe(0);
      expect(p.toDrinkMl).toBe(0);
    }
  });

  it('reports whether the figure is personal at all', () => {
    expect(hydrationForMeal({ items: [], mealKcal: 500, ...base }).basis).toBe('profile');
    expect(hydrationForMeal({ items: [], mealKcal: 500 }).basis).toBe('default');
    expect(hydrationForMeal({ items: [], mealKcal: 500, weightKg: 70 }).basis).toBe('default');
  });

  it('AGE REACHES THE GLASSES — the same plate, two patients', () => {
    const young = hydrationForMeal({ items: [], mealKcal: 600, weightKg: 80, age: 30, dailyKcalGoal: 2000 });
    const older = hydrationForMeal({ items: [], mealKcal: 600, weightKg: 80, age: 80, dailyKcalGoal: 2000 });
    expect(young.toDrinkMl).toBeGreaterThan(older.toDrinkMl);
    // And it is a difference a patient would actually see on the card.
    expect(young.toDrinkMl - older.toDrinkMl).toBeGreaterThanOrEqual(200);
  });

  it('the remainder and the glasses never disagree', () => {
    for (const kcal of [120, 350, 600, 1200]) {
      for (const grams of [0, 150, 400]) {
        const p = hydrationForMeal({
          items: grams > 0 ? [item('Vegetable', grams)] : [],
          mealKcal: kcal,
          ...base,
        });
        const drawn = (p.glasses.full + p.glasses.partial) * p.glasses.glassMl;
        expect(drawn).toBeCloseTo(p.toDrinkMl, 0);
      }
    }
  });
});
