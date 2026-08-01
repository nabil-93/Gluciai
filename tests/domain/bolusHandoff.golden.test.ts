import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * CHARACTERIZATION — how the programme screen hands a carbohydrate to the bolus
 * calculator (finding BOLUS-A1).
 *
 * The VALUE is not under test here and does not change: `carbSeed` already owns
 * the pre-fill rule and its fixtures live in `carbSeed.golden.test.ts`. What is
 * under test is the TRANSPORT — whether a carbohydrate figure travels through
 * the URL, where on web it lands in browser history, in the `Referer` of the
 * next outbound request and in any access log in between.
 *
 * Same privacy principle as Step 9 (`programDraft.ts`), and deliberately the
 * same mechanism.
 */

const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8');

describe('FIXED IN STEP 21 — BOLUS-A1: the carbohydrate leaves the URL', () => {
  /**
   * BEFORE (recorded green against the old code — docs/KNOWN-BAD-BASELINE.md):
   *
   *   program.tsx navigated to `/bolus` with `params: { carbs, meal }` from two
   *   places, and bolus.tsx read them back with
   *   `useLocalSearchParams<{ carbs?: string; meal?: string }>()`.
   *
   * AFTER: the values are staged in memory and `/bolus` is navigated to with no
   * parameters at all. Same mechanism as Step 9's `programDraft`.
   */

  it('neither sender puts a clinical value in route params', () => {
    const program = src('src/app/program.tsx');
    expect(program).not.toContain("params: { carbs:");
    expect(program).not.toMatch(/pathname: '\/bolus',\s*\n\s*params:/);
    // Both senders stage it instead, and navigate bare.
    expect(program).toContain('setBolusHandoff({');
    expect(program).toContain("router.push('/bolus')");
  });

  it('the bolus screen no longer reads the query string at all', () => {
    const bolus = src('src/app/bolus.tsx');
    expect(bolus).not.toContain('useLocalSearchParams');
    expect(bolus).toContain('consumeBolusHandoff()');
  });

  it('the hand-off is read once and kept, via the Step 9 ref guard', () => {
    const bolus = src('src/app/bolus.tsx');
    expect(bolus).toContain('if (handoffRef.current === null) handoffRef.current = consumeBolusHandoff();');
  });

  it('nothing about the hand-off is persisted', () => {
    // Strip comments first: the module's own documentation EXPLAINS that it is
    // deliberately not persisted, so a naive text match would hit the prose.
    const code = src('src/services/bolusHandoff.ts')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/AsyncStorage|localStorage|SecureStore|persist\(/);
    // The only import is a type — nothing at runtime, nothing to write to.
    expect(code).not.toMatch(/^import (?!type )/m);
  });
});

describe('bolusHandoff — set, consume once, then empty', () => {
  it('returns exactly what was staged', async () => {
    const { setBolusHandoff, consumeBolusHandoff } = await import('@/services/bolusHandoff');
    setBolusHandoff({ carbs: '45', meal: 'lunch' });
    expect(consumeBolusHandoff()).toEqual({ carbs: '45', meal: 'lunch' });
  });

  it('is one-shot: a second consume is empty', async () => {
    const { setBolusHandoff, consumeBolusHandoff } = await import('@/services/bolusHandoff');
    setBolusHandoff({ carbs: '45', meal: 'lunch' });
    consumeBolusHandoff();
    expect(consumeBolusHandoff()).toEqual({});
  });

  it('an empty hand-off is an empty object, so the screen falls back to its defaults', async () => {
    const { consumeBolusHandoff } = await import('@/services/bolusHandoff');
    expect(consumeBolusHandoff()).toEqual({});
  });

  it('the exact string shape survives — "0" is preserved, not coerced', async () => {
    const { setBolusHandoff, consumeBolusHandoff } = await import('@/services/bolusHandoff');
    // A genuine 0 g planned meal must stay the string "0": `carbSeed` treats a
    // falsy handoff as absent, which is the pre-existing route-param behaviour
    // and is deliberately unchanged here.
    setBolusHandoff({ carbs: '0', meal: 'snack' });
    const out = consumeBolusHandoff();
    expect(out.carbs).toBe('0');
    expect(typeof out.carbs).toBe('string');
  });

  it('staging twice keeps only the latest', async () => {
    const { setBolusHandoff, consumeBolusHandoff } = await import('@/services/bolusHandoff');
    setBolusHandoff({ carbs: '10', meal: 'breakfast' });
    setBolusHandoff({ carbs: '80', meal: 'dinner' });
    expect(consumeBolusHandoff()).toEqual({ carbs: '80', meal: 'dinner' });
  });

  it('clear discards without consuming, and hasBolusHandoff reports honestly', async () => {
    const { setBolusHandoff, clearBolusHandoff, consumeBolusHandoff, hasBolusHandoff } =
      await import('@/services/bolusHandoff');
    expect(hasBolusHandoff()).toBe(false);
    setBolusHandoff({ carbs: '30' });
    expect(hasBolusHandoff()).toBe(true);
    clearBolusHandoff();
    expect(hasBolusHandoff()).toBe(false);
    expect(consumeBolusHandoff()).toEqual({});
  });

  it('a staged copy is detached from the caller object', async () => {
    const { setBolusHandoff, consumeBolusHandoff } = await import('@/services/bolusHandoff');
    const source = { carbs: '45', meal: 'lunch' as const };
    setBolusHandoff(source);
    (source as { carbs: string }).carbs = '999';
    expect(consumeBolusHandoff().carbs).toBe('45');
  });
});
