import { describe, expect, it } from 'vitest';

import {
  barcodeVariants,
  readNutriments,
  sanitizeServingGrams,
  type Nutriments,
} from '@/services/nutrition/providers/nutriments';

/**
 * CHARACTERIZATION + REGRESSION — reading an Open Food Facts `nutriments` map.
 *
 * This module had no test file at all before Step 10, which is how the carb
 * zero-fill on its last line survived: `carbs === null ? 0 : round1(carbs)`
 * flattened "the entry says nothing" into the same value as "the entry says
 * zero", one line before the exit.
 *
 * Two jobs here:
 *
 *  · REGRESSION for NUTR-B1 — `carbs_known` / `hasCarbs` must tell a declared
 *    0 from an absent key, in every shape the source arrives in.
 *  · CHARACTERIZATION of the numeric conversions the audit confirmed CORRECT
 *    and Step 10 must not disturb: kJ → kcal, per-serving → per-100 g,
 *    salt → sodium, sodium g → mg, and the serving-size sanitizer.
 *
 * The module is pure and imports only a type, so it runs as-is in node.
 */

const read = (m: Nutriments, serving?: number) => readNutriments(m, serving);

/* ── NUTR-B1: declared zero vs absent key ─────────────────────────── */

describe('carbohydrate provenance', () => {
  it('an authoritative 0 stays a valid KNOWN zero', () => {
    // Bottled water. The value and the flag must both survive.
    const r = read({ 'energy-kcal_100g': 0, carbohydrates_100g: 0 });
    expect(r.per100g.carbs).toBe(0);
    expect(r.per100g.carbs_known).toBe(true);
    expect(r.hasCarbs).toBe(true);
    expect(r.hasEnergy).toBe(true);
  });

  it('an ABSENT carbohydrate key is unknown, and never becomes a genuine 0', () => {
    const r = read({ 'energy-kcal_100g': 250 });
    expect(r.per100g.carbs).toBe(0); // the number is unchanged…
    expect(r.per100g.carbs_known).toBe(false); // …but it is labelled
    expect(r.hasCarbs).toBe(false);
  });

  it('ENERGY KNOWN + CARBS ABSENT — the case that used to pass silently', () => {
    // The product is well described and `hasEnergy` vouches for it, so the
    // barcode screen showed it with full confidence and "0 g of carbs".
    const r = read({ 'energy-kcal_100g': 190, proteins_100g: 8, fat_100g: 12 });
    expect(r.hasEnergy).toBe(true);
    expect(r.hasCarbs).toBe(false);
    expect(r.per100g.carbs_known).toBe(false);
    expect(r.per100g.calories).toBe(190); // energy is real and stays
  });

  it('a normal declared value is unchanged and known', () => {
    const r = read({ 'energy-kcal_100g': 350, carbohydrates_100g: 62.4 });
    expect(r.per100g.carbs).toBe(62.4);
    expect(r.per100g.carbs_known).toBe(true);
  });

  it('an empty string and a non-numeric string are absence, not zero', () => {
    expect(read({ carbohydrates_100g: '' }).per100g.carbs_known).toBe(false);
    expect(read({ carbohydrates_100g: 'n/a' }).per100g.carbs_known).toBe(false);
    expect(read({ carbohydrates_100g: 'n/a' }).per100g.carbs).toBe(0);
  });

  it('a numeric STRING is a real value — Open Food Facts sends both shapes', () => {
    const r = read({ carbohydrates_100g: '17.5' });
    expect(r.per100g.carbs).toBe(17.5);
    expect(r.per100g.carbs_known).toBe(true);
  });

  it('a declared 0 as the string "0" is still a known zero', () => {
    expect(read({ carbohydrates_100g: '0' }).per100g.carbs_known).toBe(true);
  });

  it('an entirely empty map declares nothing at all', () => {
    const r = read({});
    expect(r.per100g.carbs_known).toBe(false);
    expect(r.hasEnergy).toBe(false);
    expect(r.fieldsFound).toBe(0);
  });

  it('an undefined map is handled without throwing', () => {
    const r = readNutriments(undefined);
    expect(r.per100g.carbs_known).toBe(false);
    expect(r.hasCarbs).toBe(false);
  });
});

describe('carbohydrate provenance — per-serving entries', () => {
  it('a per-serving carbohydrate with a usable serving size is KNOWN and scaled', () => {
    // 15 g of carbs in a 30 g serving → 50 g per 100 g.
    const r = read({ carbohydrates_serving: 15 }, 30);
    expect(r.per100g.carbs).toBe(50);
    expect(r.per100g.carbs_known).toBe(true);
  });

  it('a per-serving carbohydrate with NO serving size is unknown, not 0', () => {
    const r = read({ carbohydrates_serving: 15 });
    expect(r.per100g.carbs).toBe(0);
    expect(r.per100g.carbs_known).toBe(false);
  });

  it('a per-serving value whose serving size was REJECTED is unknown, not 0', () => {
    // Sidi Ali declares a 1000 g serving; the sanitizer refuses it, so there
    // is no way to derive a per-100 g figure. That is absence, not zero.
    const serving = sanitizeServingGrams(1000);
    expect(serving).toBeUndefined();
    const r = read({ carbohydrates_serving: 15 }, serving);
    expect(r.per100g.carbs_known).toBe(false);
  });

  it('a declared per-100 g value wins over the per-serving twin', () => {
    const r = read({ carbohydrates_100g: 12, carbohydrates_serving: 99 }, 30);
    expect(r.per100g.carbs).toBe(12);
    expect(r.per100g.carbs_known).toBe(true);
  });
});

/* ── Confirmed-safe conversions Step 10 must not disturb ──────────── */

describe('energy — kJ → kcal (unchanged behaviour)', () => {
  it('prefers a declared kcal figure', () => {
    expect(read({ 'energy-kcal_100g': 240 }).per100g.calories).toBe(240);
  });

  it('recovers an entry that only carries kilojoules, dividing by 4.184', () => {
    expect(read({ 'energy-kj_100g': 1000 }).per100g.calories).toBe(239);
  });

  it('falls back to the bare `energy` key, also read as kJ', () => {
    expect(read({ energy_100g: 2092 }).per100g.calories).toBe(500);
  });

  it('a declared 0 kcal is data — hasEnergy stays true', () => {
    const r = read({ 'energy-kcal_100g': 0 });
    expect(r.per100g.calories).toBe(0);
    expect(r.hasEnergy).toBe(true);
  });

  it('scales a per-serving kcal by the serving size', () => {
    expect(read({ 'energy-kcal_serving': 100 }, 40).per100g.calories).toBe(250);
  });
});

describe('sodium — salt ÷ 2.5 and g → mg (unchanged behaviour)', () => {
  it('reads a declared sodium in grams and reports milligrams', () => {
    expect(read({ sodium_100g: 0.4 }).per100g.sodium).toBe(400);
  });

  it('derives sodium from salt when only salt is declared', () => {
    // 1 g salt ÷ 2.5 = 0.4 g sodium = 400 mg.
    expect(read({ salt_100g: 1 }).per100g.sodium).toBe(400);
  });

  it('prefers a declared sodium over the salt derivation', () => {
    expect(read({ sodium_100g: 0.1, salt_100g: 5 }).per100g.sodium).toBe(100);
  });

  it('reports 0 mg when neither is declared', () => {
    expect(read({}).per100g.sodium).toBe(0);
  });
});

describe('serving-size sanitization (unchanged behaviour)', () => {
  it('accepts a plausible single serving', () => {
    expect(sanitizeServingGrams(30)).toBe(30);
    expect(sanitizeServingGrams('250')).toBe(250);
  });

  it('rejects the bounds and beyond: under 5 g, over 500 g', () => {
    expect(sanitizeServingGrams(4.9)).toBeUndefined();
    expect(sanitizeServingGrams(500.1)).toBeUndefined();
    expect(sanitizeServingGrams(1000)).toBeUndefined();
  });

  it('keeps the boundary values themselves', () => {
    expect(sanitizeServingGrams(5)).toBe(5);
    expect(sanitizeServingGrams(500)).toBe(500);
  });

  it('rejects nonsense and absence', () => {
    expect(sanitizeServingGrams(undefined)).toBeUndefined();
    expect(sanitizeServingGrams('a bottle')).toBeUndefined();
    expect(sanitizeServingGrams(-30)).toBeUndefined();
  });
});

describe('fieldsFound — completeness reporting (NUTR-A7)', () => {
  it('counts only the values the source actually declared', () => {
    const r = read({ 'energy-kcal_100g': 100, carbohydrates_100g: 20, salt_100g: 1 });
    expect(r.fieldsFound).toBe(3); // energy, carbs, sodium-from-salt
  });

  it('counts a declared zero as found', () => {
    expect(read({ carbohydrates_100g: 0 }).fieldsFound).toBe(1);
  });

  it('reports all seven for a fully described entry', () => {
    const r = read({
      'energy-kcal_100g': 100,
      carbohydrates_100g: 20,
      sugars_100g: 5,
      proteins_100g: 3,
      fat_100g: 1,
      fiber_100g: 2,
      sodium_100g: 0.4,
    });
    expect(r.fieldsFound).toBe(7);
    expect(r.hasCarbs).toBe(true);
  });

  it('separates whole-entry completeness from the one field a dose needs', () => {
    // Six of seven values present, and the missing one is the only one that
    // matters for insulin. `fieldsFound` alone would call this near-complete.
    const r = read({
      'energy-kcal_100g': 100,
      sugars_100g: 5,
      proteins_100g: 3,
      fat_100g: 1,
      fiber_100g: 2,
      sodium_100g: 0.4,
    });
    expect(r.fieldsFound).toBe(6);
    expect(r.hasCarbs).toBe(false);
  });
});

describe('barcodeVariants (unchanged behaviour)', () => {
  it('pads a 12-digit UPC-A to EAN-13 and back', () => {
    expect(barcodeVariants('012345678905')).toContain('0012345678905');
    expect(barcodeVariants('0123456789012')).toContain('123456789012');
  });

  it('strips non-digits and rejects an empty code', () => {
    // Padding only applies at the UPC/EAN lengths (12, 13, 14); a short code
    // is tried as itself and nothing else.
    expect(barcodeVariants('  61-234 ')).toEqual(['61234']);
    expect(barcodeVariants('abc')).toEqual([]);
  });
});
