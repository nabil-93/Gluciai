import { describe, expect, it } from 'vitest';

import {
  carbDisplay,
  carbStatus,
  isCarbKnown,
  plateCarbStatus,
  seedCarbsFromMeal,
  unknownCarbNames,
} from '@/services/nutrition/carbProvenance';

/**
 * The one rule that tells a MEASURED carbohydrate from a MISSING one.
 *
 * Step 10 (NUTR-B1 / NUTR-C1) exists because those two used to be the same
 * value: every reader answered "the source said nothing" with `0`, and `0` is
 * also what bottled water genuinely declares. The fabricated zero was then
 * displayed, stored, and used to pre-fill the bolus carb field — where it
 * produces a 0 U meal bolus for a full plate.
 *
 * Three properties are asserted here rather than assumed:
 *   1. A DECLARED zero stays a usable value. Water really is 0 g.
 *   2. A MISSING value is never usable, however plausible its placeholder.
 *   3. LEGACY data (no flag at all) degrades safely without a migration: a
 *      non-zero legacy value could not have come from a zero-fill and stays
 *      trusted; only a legacy ZERO is ambiguous.
 *
 * The module is import-free on purpose, so this runs in a plain node
 * environment and the screens, the engine and these tests share one rule.
 */

describe('carbStatus — declared values', () => {
  it('treats an explicit non-zero value as known', () => {
    expect(carbStatus({ carbohydrates: 42, carbs_known: true })).toBe('known');
  });

  it('treats an explicitly declared 0 as KNOWN — water is 0 g', () => {
    expect(carbStatus({ carbohydrates: 0, carbs_known: true })).toBe('known');
  });

  it('treats a missing value as unknown even though it carries a 0', () => {
    expect(carbStatus({ carbohydrates: 0, carbs_known: false })).toBe('unknown');
  });

  it('a false flag wins over any number sitting beside it', () => {
    // Defensive: nothing should produce this shape, but if a placeholder ever
    // carried a plausible number the flag must still refuse it.
    expect(carbStatus({ carbohydrates: 60, carbs_known: false })).toBe('unknown');
  });

  it('null and undefined inputs are unknown, never a zero', () => {
    expect(carbStatus(null)).toBe('unknown');
    expect(carbStatus(undefined)).toBe('unknown');
  });
});

describe('carbStatus — legacy records with no flag', () => {
  it('trusts a non-zero legacy value: a zero-fill could not have produced 42', () => {
    expect(carbStatus({ carbohydrates: 42 })).toBe('known');
  });

  it('trusts a small non-zero legacy value too', () => {
    expect(carbStatus({ carbohydrates: 0.4 })).toBe('known');
  });

  it('calls a legacy ZERO indeterminate — the one genuinely ambiguous case', () => {
    expect(carbStatus({ carbohydrates: 0 })).toBe('indeterminate');
  });

  it('a legacy record with no carbohydrate field at all is indeterminate', () => {
    expect(carbStatus({})).toBe('indeterminate');
  });

  it('a non-finite legacy value is indeterminate rather than trusted', () => {
    // The compatibility rule requires a real number, so neither of these can
    // slip through as "it is not zero, therefore it is a measurement".
    expect(carbStatus({ carbohydrates: NaN })).toBe('indeterminate');
    expect(carbStatus({ carbohydrates: Infinity })).toBe('indeterminate');
  });

  it('a negative legacy value is non-zero, so the compatibility rule keeps it', () => {
    // Recorded, not endorsed: negative carbohydrate is not reachable through
    // the portion editor. The rule here is about provenance, not plausibility
    // — bounding the value is a separate, still-open finding (NUTR-C3).
    expect(carbStatus({ carbohydrates: -5 })).toBe('known');
  });
});

describe('isCarbKnown', () => {
  it('is true only for known, not for indeterminate', () => {
    expect(isCarbKnown({ carbohydrates: 0, carbs_known: true })).toBe(true);
    expect(isCarbKnown({ carbohydrates: 30 })).toBe(true);
    expect(isCarbKnown({ carbohydrates: 0 })).toBe(false);
    expect(isCarbKnown({ carbohydrates: 0, carbs_known: false })).toBe(false);
  });
});

describe('plateCarbStatus — a plate is as trustworthy as its least-known food', () => {
  const known = (g: number) => ({ carbohydrates: g, carbs_known: true });
  const missing = { carbohydrates: 0, carbs_known: false };

  it('is known when every food is known', () => {
    expect(plateCarbStatus([known(30), known(0), known(12)])).toBe('known');
  });

  it('is unknown when ONE food of three is missing', () => {
    expect(plateCarbStatus([known(30), missing, known(12)])).toBe('unknown');
  });

  it('is unknown when every food is missing', () => {
    expect(plateCarbStatus([missing, missing])).toBe('unknown');
  });

  it('unknown outranks indeterminate', () => {
    expect(plateCarbStatus([{ carbohydrates: 0 }, missing])).toBe('unknown');
  });

  it('is indeterminate when the only doubt is a legacy zero', () => {
    expect(plateCarbStatus([known(30), { carbohydrates: 0 }])).toBe('indeterminate');
  });

  it('an empty plate is unknown, not a zero-carb plate', () => {
    expect(plateCarbStatus([])).toBe('unknown');
    expect(plateCarbStatus(undefined)).toBe('unknown');
  });
});

describe('unknownCarbNames', () => {
  it('names only the foods whose carbohydrate is explicitly missing', () => {
    expect(
      unknownCarbNames([
        { name: 'Couscous', carbohydrates: 60, carbs_known: true },
        { name: 'Sauce maison', carbohydrates: 0, carbs_known: false },
        { name: 'Pain', carbohydrates: 0 }, // legacy zero — not "unknown"
        { name: 'Boisson', carbohydrates: 0, carbs_known: false },
      ])
    ).toEqual(['Sauce maison', 'Boisson']);
  });

  it('skips blank names so a warning never reads "unknown for: , "', () => {
    expect(
      unknownCarbNames([
        { name: '   ', carbohydrates: 0, carbs_known: false },
        { carbohydrates: 0, carbs_known: false },
      ])
    ).toEqual([]);
  });

  it('returns empty for a fully known plate', () => {
    expect(unknownCarbNames([{ name: 'x', carbohydrates: 5, carbs_known: true }])).toEqual([]);
  });
});

describe('carbDisplay — never render a placeholder as a value', () => {
  it('shows a known figure exactly', () => {
    expect(carbDisplay('known', 62)).toEqual({ kind: 'exact', grams: 62 });
  });

  it('shows a known ZERO exactly — not as "unknown"', () => {
    expect(carbDisplay('known', 0)).toEqual({ kind: 'exact', grams: 0 });
  });

  it('presents a partially known plate as a floor, not a total', () => {
    expect(carbDisplay('unknown', 62)).toEqual({ kind: 'atLeast', grams: 62 });
  });

  it('refuses to print anything when nothing is known', () => {
    expect(carbDisplay('unknown', 0)).toEqual({ kind: 'unknown' });
  });

  it('treats an indeterminate zero as unknown for display', () => {
    expect(carbDisplay('indeterminate', 0)).toEqual({ kind: 'unknown' });
  });

  it('an indeterminate plate with a figure still shows the figure as a floor', () => {
    expect(carbDisplay('indeterminate', 40)).toEqual({ kind: 'atLeast', grams: 40 });
  });
});

describe('seedCarbsFromMeal — what the bolus screen may pre-fill', () => {
  it('seeds a known figure, rounded like the field expects', () => {
    expect(seedCarbsFromMeal({ carbohydrates: 61.6, carbs_known: true })).toBe('62');
  });

  it('seeds a genuine 0 g meal as "0" — a real value the patient may use', () => {
    expect(seedCarbsFromMeal({ carbohydrates: 0, carbs_known: true })).toBe('0');
  });

  it('REFUSES to seed an unknown meal — the 0 U bolus this step exists to stop', () => {
    expect(seedCarbsFromMeal({ carbohydrates: 0, carbs_known: false })).toBeNull();
  });

  it('refuses to seed a legacy zero, which might be missing data', () => {
    expect(seedCarbsFromMeal({ carbohydrates: 0 })).toBeNull();
  });

  it('still seeds a legacy non-zero meal — existing history keeps working', () => {
    expect(seedCarbsFromMeal({ carbohydrates: 45 })).toBe('45');
  });

  it('seeds nothing when there is no meal at all', () => {
    expect(seedCarbsFromMeal(null)).toBeNull();
    expect(seedCarbsFromMeal(undefined)).toBeNull();
  });

  it('never seeds a NaN or a non-number', () => {
    expect(seedCarbsFromMeal({ carbohydrates: NaN, carbs_known: true })).toBeNull();
    expect(seedCarbsFromMeal({ carbs_known: true })).toBeNull();
  });
});
