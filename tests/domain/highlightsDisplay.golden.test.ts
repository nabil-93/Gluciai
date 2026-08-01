import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildHighlights, displayableHighlights } from '@/services/nutrition/advice';
import type { NutritionResult } from '@/types';

/**
 * CHARACTERIZATION — POSITIVE BADGES ON A PLATE WITH NO DATA (finding P8-005).
 *
 * `buildHighlights` reads absolute numbers. A plate nothing could be resolved
 * for arrives as zeros, and zeros satisfy the "good" thresholds: no sugar is
 * `low_sugar`, no carbohydrate is a `Low` glycemic load. The patient is shown a
 * compliment for a meal the app failed to identify.
 *
 * Step 18 does NOT change `buildHighlights` — the badges are persisted into
 * `NutritionResult.highlights`, and rewriting stored rows is out of scope. The
 * arithmetic fixtures in the first block are the proof of that.
 */

const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8');

const plate = (o: Partial<Parameters<typeof buildHighlights>[0]> = {}) => ({
  calories: 500,
  carbs: 40,
  sugar: 4,
  protein: 30,
  fat: 15,
  fiber: 7,
  sodium: 200,
  glycemic_index: 40,
  ...o,
});

/** A plate the pipeline could not resolve: every number is a placeholder. */
const ZEROED = plate({
  calories: 0,
  carbs: 0,
  sugar: 0,
  protein: 0,
  fat: 0,
  fiber: 0,
  sodium: 0,
  glycemic_index: 0,
});

/* ────────── 1. the builder — pinned, Step 18 must not move it ────────── */

describe('buildHighlights — the arithmetic Step 18 leaves alone', () => {
  it('a genuinely good plate earns its positives', () => {
    const h = buildHighlights(plate({ categories: ['Protein', 'Vegetable', 'Rice'] }));
    expect(h).toContain('high_protein'); // 30 g ≥ 25
    expect(h).toContain('high_fiber'); // 7 g ≥ 6
    expect(h).toContain('low_sugar'); // 4 g ≤ 5, on a plate that HAS data
    expect(h).toContain('vegetable_rich');
  });

  it('KNOWN-BAD — a zeroed plate earns "low sugar" and "low glycemic load"', () => {
    const h = buildHighlights(ZEROED);
    expect(h).toContain('low_sugar'); // 0 g of sugar, because nothing is known
    expect(h).toContain('low_glycemic_load'); // GL of 0, for the same reason
    expect(h).toContain('low_protein'); // the one honest signal in the set
  });

  it('KNOWN-BAD — the same is true of a plate with energy but nothing else', () => {
    const h = buildHighlights(plate({ sugar: 0, carbs: 0, glycemic_index: 0, protein: 0, fiber: 0 }));
    expect(h).toContain('low_sugar');
    expect(h).toContain('low_glycemic_load');
  });
});

/* ─────── 2. KNOWN-BAD — nothing filters them before the patient ─────── */

describe('FIXED IN STEP 18 — praise needs data behind it', () => {
  /**
   * BEFORE (recorded green against the old code — docs/KNOWN-BAD-BASELINE.md):
   *
   *   `advice.ts` had no display filter; `LastMealCard` printed
   *   `(r.highlights ?? []).slice(0, 2)` exactly as stored, so a wholly
   *   unidentified plate announced "Low glycemic load · Low sugar" beside its
   *   0 kcal on the home screen.
   *
   * AFTER: `displayableHighlights` drops the POSITIVE badges for a plate that
   * cannot support them. `buildHighlights` is unchanged (the block above is the
   * proof), and stored `NutritionResult.highlights` are never rewritten — no
   * migration, no edit of a patient's history.
   */

  it('a zeroed plate keeps its honest signals and loses its compliments', () => {
    const stored = buildHighlights(ZEROED);
    const shown = displayableHighlights(stored, { calories: 0 });

    expect(shown).not.toContain('low_sugar');
    expect(shown).not.toContain('low_glycemic_load');
    expect(shown).toContain('low_protein'); // "we found no protein" is true
  });

  it('a plate whose carbohydrate is explicitly unknown loses them too', () => {
    // Energy alone is not enough: an unknown carbohydrate makes "low glycemic
    // load" an artefact of the placeholder 0.
    const stored = buildHighlights(plate({ carbs: 0, sugar: 0, glycemic_index: 0 }));
    const shown = displayableHighlights(stored, { calories: 500, carbs_known: false });
    expect(shown).not.toContain('low_glycemic_load');
    expect(shown).not.toContain('low_sugar');
  });

  it('a plate WITH data keeps every badge it earned', () => {
    const stored = buildHighlights(plate({ categories: ['Protein', 'Vegetable', 'Rice'] }));
    const shown = displayableHighlights(stored, { calories: 500, carbs_known: true });
    expect(shown).toEqual(stored); // nothing suppressed
    expect(shown).toContain('low_sugar');
    expect(shown).toContain('high_protein');
    expect(shown).toContain('vegetable_rich');
  });

  it('a legacy plate with no carbs_known flag is judged on its energy alone', () => {
    const stored = buildHighlights(plate());
    expect(displayableHighlights(stored, { calories: 500 })).toEqual(stored);
    expect(displayableHighlights(stored, { calories: 0 })).not.toContain('low_sugar');
  });

  it('the stored keys themselves are never rewritten', () => {
    const stored: NutritionResult['highlights'] = buildHighlights(ZEROED);
    const before = [...(stored ?? [])];
    displayableHighlights(stored, { calories: 0 });
    expect(stored).toEqual(before); // the filter is pure; history is intact
    expect(before.slice(0, 2)).toEqual(['low_glycemic_load', 'low_sugar']);
  });

  it('an empty or absent highlight list is handled without throwing', () => {
    expect(displayableHighlights(undefined, { calories: 0 })).toEqual([]);
    expect(displayableHighlights([], null)).toEqual([]);
  });

  it('the home card renders the filtered list', () => {
    const card = src('src/components/LastMealCard.tsx');
    expect(card).toContain('displayableHighlights(r.highlights, r)');
    expect(card).not.toContain('(r.highlights ?? [])\n    .slice(0, 2)');
  });
});
