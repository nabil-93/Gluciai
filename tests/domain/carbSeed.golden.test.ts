import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import ar from '@/i18n/locales/ar.json';
import de from '@/i18n/locales/de.json';
import en from '@/i18n/locales/en.json';
import fr from '@/i18n/locales/fr.json';
import { carbSeed, seedCarbsFromMeal } from '@/services/nutrition/carbProvenance';

/**
 * CHARACTERIZATION — WHERE THE NUMBER IN THE BOLUS CARB FIELD CAME FROM
 * (finding NUTR-C2).
 *
 * Two things are pinned here and they must not be confused:
 *
 *   1. the VALUE and when it is seeded at all — `seedCarbsFromMeal`, closed in
 *      Step 10. Step 18 is a labelling step, so every fixture in the first
 *      block must survive it byte-for-byte. In particular: an unknown
 *      carbohydrate still seeds NOTHING, and a genuine 0 g still seeds "0".
 *   2. what the screen SAYS about that number. That is what Step 18 changes.
 *
 * Step 18 does NOT add a confirmation gate: a seeded value reaches the engine
 * exactly as it does today. Nothing here asserts otherwise, and the fixtures
 * that pin the engine's input contract live in tests/clinical/.
 */

const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8');

/* ─────────── 1. the value, and when there is one — unchanged ─────────── */

describe('seedCarbsFromMeal — what may be pre-filled, pinned', () => {
  it('seeds the rounded value of a known carbohydrate', () => {
    expect(seedCarbsFromMeal({ carbohydrates: 62.4, carbs_known: true })).toBe('62');
    expect(seedCarbsFromMeal({ carbohydrates: 62.6, carbs_known: true })).toBe('63');
  });

  it('seeds "0" for a genuine, declared zero — water is 0 g and always was', () => {
    expect(seedCarbsFromMeal({ carbohydrates: 0, carbs_known: true })).toBe('0');
  });

  it('seeds NOTHING when the carbohydrate is unknown', () => {
    expect(seedCarbsFromMeal({ carbohydrates: 0, carbs_known: false })).toBeNull();
    expect(seedCarbsFromMeal({ carbohydrates: 55, carbs_known: false })).toBeNull();
  });

  it('seeds nothing for a legacy zero, and seeds a legacy non-zero', () => {
    expect(seedCarbsFromMeal({ carbohydrates: 0 })).toBeNull(); // indeterminate
    expect(seedCarbsFromMeal({ carbohydrates: 42 })).toBe('42'); // a zero-fill cannot make 42
  });

  it('seeds nothing when there is no meal at all', () => {
    expect(seedCarbsFromMeal(null)).toBeNull();
    expect(seedCarbsFromMeal(undefined)).toBeNull();
  });
});

/* ────── 2. KNOWN-BAD — the field says nothing about where it came from ── */

describe('FIXED IN STEP 18 — a seeded carbohydrate says where it came from', () => {
  /**
   * BEFORE (recorded green against the old code — docs/KNOWN-BAD-BASELINE.md):
   *
   *   bolus.tsx computed the seed inline as
   *     `handoff.carbs ? String(Math.round(Number(handoff.carbs))) : (mealSeed ?? '')`
   *   — so the UNGUARDED route parameter (an AI-composed planned meal from the
   *   programme screen) won over the provenance-checked meal seed, in a screen
   *   no test could reach; `carbProvenance` had no seed-origin helper; and no
   *   locale had any wording for where a pre-filled number came from. The only
   *   thing the screen said was why it had REFUSED to seed (Step 10's pill).
   *
   * AFTER: the same rule, extracted verbatim into `carbSeed`, now returns the
   * origin with the value — and the screen prints it.
   *
   * WHAT DID NOT CHANGE, deliberately: the precedence, the value, and the fact
   * that a seeded value reaches the engine immediately. **Step 18 adds no
   * confirmation gate** — that question (NUTR-C2 item 2) stays open as a
   * dose-input decision.
   */

  const LOCALES = { fr, en, de, ar } as Record<string, { bolus: Record<string, string> }>;

  it('the programme route parameter still wins, and is labelled as planned', () => {
    const seed = carbSeed('45', { carbohydrates: 80, carbs_known: true });
    expect(seed.value).toBe('45'); // the meal's 80 g does NOT override it
    expect(seed.origin).toBe('program');
  });

  it('the programme value is passed through untouched, not sanitized', () => {
    // Step 18 labels it; bounding it would change a dose input.
    expect(carbSeed('999', null).value).toBe('999');
    expect(carbSeed('0', null).value).toBe('0');
    expect(carbSeed('62.6', null).value).toBe('63'); // same rounding as before
  });

  it('a known meal seeds its value and is labelled as coming from that meal', () => {
    const seed = carbSeed(undefined, { carbohydrates: 62.4, carbs_known: true });
    expect(seed).toEqual({ value: '62', origin: 'meal' });
  });

  it('an unknown carbohydrate still seeds NOTHING, and claims no origin', () => {
    expect(carbSeed(undefined, { carbohydrates: 0, carbs_known: false })).toEqual({
      value: '',
      origin: 'none',
    });
    expect(carbSeed(undefined, { carbohydrates: 55, carbs_known: false })).toEqual({
      value: '',
      origin: 'none',
    });
  });

  it('a genuine 0 g still seeds "0" and is NOT reported as unknown', () => {
    expect(carbSeed(undefined, { carbohydrates: 0, carbs_known: true })).toEqual({
      value: '0',
      origin: 'meal',
    });
  });

  it('no meal and no hand-off leaves the field empty', () => {
    expect(carbSeed(undefined, null)).toEqual({ value: '', origin: 'none' });
    expect(carbSeed('', null)).toEqual({ value: '', origin: 'none' });
  });

  it('every locale can name both origins', () => {
    for (const [lang, dict] of Object.entries(LOCALES)) {
      expect(dict.bolus.seedFromMeal, `${lang}`).toBeTruthy();
      expect(dict.bolus.seedFromProgram, `${lang}`).toBeTruthy();
      expect(dict.bolus.seedFromMeal, `${lang}`).toContain('{{food}}');
      expect(dict.bolus.seedFromMeal, `${lang}`).toContain('{{time}}');
    }
    expect(new Set(Object.values(LOCALES).map((d) => d.bolus.seedFromProgram)).size).toBe(4);
  });

  it('the screen uses the shared rule and prints the origin', () => {
    const screen = src('src/app/bolus.tsx');
    expect(screen).toContain('carbSeed(handoff.carbs, lastMeal?.result)');
    expect(screen).toContain("t('bolus.seedFromProgram')");
    expect(screen).toContain("t('bolus.seedFromMeal'");
    // The inline rule is gone.
    expect(screen).not.toContain(
      "handoff.carbs ? String(Math.round(Number(handoff.carbs))) : (mealSeed ?? '')"
    );
  });

  it('NO confirmation gate was introduced — the engine still sees the seed', () => {
    const screen = src('src/app/bolus.tsx');
    // The field's value flows straight into the engine input, as before.
    expect(screen).toContain('const carbsValue = parseDecimal(carbs);');
    expect(screen).toContain('carbsKnown: carbsValue !== undefined');
    // The label is presentation only: it is gated on `carbsTouched`, never on
    // anything the engine reads.
    expect(screen).toContain("{!carbsTouched && seed.origin !== 'none' ? (");
    expect(screen).not.toMatch(/carbsConfirmed|awaitingCarbConfirm|requireCarbConfirm/);
  });
});
