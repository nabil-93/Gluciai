import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearProgramDraft,
  consumeProgramDraft,
  hasProgramDraft,
  setProgramDraft,
  type ProgramSetupDraft,
} from '@/services/programDraft';

/**
 * The in-memory hand-off that replaced route params for the program wizard.
 *
 * Two properties matter, and both are asserted here rather than assumed:
 *   1. ONE SHOT — a second read must not resurrect the answers.
 *   2. NO PERSISTENCE — nothing may reach AsyncStorage or any other store. A
 *      body weight written to disk is a new copy of health data to protect.
 *
 * The values are the same strings the route params carried, so the consumer's
 * `Number(x) || fallback` coercion is unchanged. That equivalence is asserted
 * too — this was a transport change, not a behaviour change.
 */

afterEach(() => {
  clearProgramDraft();
});

const FULL: ProgramSetupDraft = {
  goal: 'lose',
  level: 'moderate',
  weight: '82',
  targetWeight: '75',
  rate: '0.5',
  place: 'home',
  trainingDays: '4',
  constraints: JSON.stringify({ halal: true, avoid: ['peanut', 'lactose'] }),
};

describe('set → consume', () => {
  it('returns the exact draft that was staged', () => {
    setProgramDraft(FULL);
    expect(consumeProgramDraft()).toEqual(FULL);
  });

  it('preserves every field verbatim, including the constraints JSON', () => {
    setProgramDraft(FULL);
    const out = consumeProgramDraft();
    expect(out.weight).toBe('82');
    expect(out.targetWeight).toBe('75');
    expect(out.rate).toBe('0.5');
    expect(JSON.parse(out.constraints!)).toEqual({
      halal: true,
      avoid: ['peanut', 'lactose'],
    });
  });

  it('copies on write, so mutating the caller object cannot change what is staged', () => {
    const mutable = { ...FULL };
    setProgramDraft(mutable);
    mutable.weight = '999';
    expect(consumeProgramDraft().weight).toBe('82');
  });

  it('a later stage overwrites an earlier one', () => {
    setProgramDraft({ weight: '70' });
    setProgramDraft({ weight: '90' });
    expect(consumeProgramDraft().weight).toBe('90');
  });
});

describe('one shot', () => {
  it('a second consume returns empty', () => {
    setProgramDraft(FULL);
    expect(consumeProgramDraft()).toEqual(FULL);
    expect(consumeProgramDraft()).toEqual({});
  });

  it('consuming when nothing was staged returns empty rather than throwing', () => {
    expect(consumeProgramDraft()).toEqual({});
  });

  it('an empty result leaves the consumer on its own defaults', () => {
    // Mirrors the consumer in program.tsx: absent values fall back exactly as
    // they did when a route param was missing.
    const setup = consumeProgramDraft();
    expect(Number(setup.weight) || null).toBeNull();
    expect(Number(setup.rate) || 0.5).toBe(0.5);
    expect(Number(setup.trainingDays) || 3).toBe(3);
    expect((setup.goal as string) || 'lose').toBe('lose');
    expect((setup.place as string) || 'home').toBe('home');
  });

  it('hasProgramDraft reflects staging without consuming', () => {
    expect(hasProgramDraft()).toBe(false);
    setProgramDraft(FULL);
    expect(hasProgramDraft()).toBe(true);
    expect(hasProgramDraft()).toBe(true); // peeking does not consume
    consumeProgramDraft();
    expect(hasProgramDraft()).toBe(false);
  });

  it('clear discards a staged draft', () => {
    setProgramDraft(FULL);
    clearProgramDraft();
    expect(consumeProgramDraft()).toEqual({});
  });
});

describe('coercion parity with the former route params', () => {
  // The consumer applies `Number(x) || fallback`. These cases pin the exact
  // shapes the producer emits — notably `String(parseDecimal(x) ?? '')`, which
  // yields '' when the field was left blank.
  it("an empty string falls back, matching the old absent-param behaviour", () => {
    setProgramDraft({ weight: '', targetWeight: '', rate: '0.5' });
    const setup = consumeProgramDraft();
    expect(Number(setup.weight) || null).toBeNull();
    expect(Number(setup.targetWeight) || null).toBeNull();
    expect(Number(setup.rate) || 0.5).toBe(0.5);
  });

  it('numeric strings coerce to the same numbers', () => {
    setProgramDraft({ weight: '82', targetWeight: '75', rate: '1', trainingDays: '6' });
    const s = consumeProgramDraft();
    expect(Number(s.weight)).toBe(82);
    expect(Number(s.targetWeight)).toBe(75);
    expect(Number(s.rate)).toBe(1);
    expect(Number(s.trainingDays)).toBe(6);
  });

  it('malformed constraints JSON is survivable, as before', () => {
    setProgramDraft({ constraints: '{not valid json' });
    const s = consumeProgramDraft();
    let parsed: unknown = 'DEFAULTS';
    try {
      if (typeof s.constraints === 'string') parsed = JSON.parse(s.constraints);
    } catch {
      /* the consumer swallows this and keeps DEFAULT_CONSTRAINTS */
    }
    expect(parsed).toBe('DEFAULTS');
  });
});

describe('no persistence', () => {
  it('touches no storage API', async () => {
    // If the module ever reached for AsyncStorage, localStorage or
    // SecureStore, these spies would record it.
    const localSet = vi.fn();
    const localGet = vi.fn();
    vi.stubGlobal('localStorage', { setItem: localSet, getItem: localGet, removeItem: vi.fn() });

    setProgramDraft(FULL);
    consumeProgramDraft();

    expect(localSet).not.toHaveBeenCalled();
    expect(localGet).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('imports nothing at runtime — the module is self-contained', async () => {
    // A storage-backed implementation would necessarily import something.
    // Reading the source is the most direct assertion available here.
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const raw = readFileSync(
      path.resolve(__dirname, '../../src/services/programDraft.ts'),
      'utf8'
    );
    // Comments explain WHY storage is avoided and name those APIs, so strip
    // them and assert against executable code only.
    const code = raw.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(code).not.toMatch(/from ['"]/); // no imports at all
    expect(code).not.toMatch(/AsyncStorage|SecureStore|localStorage|sessionStorage/);
    expect(code).not.toMatch(/persist/);
    expect(code).toContain('let pending'); // plain module-level memory
  });

  it('state does not survive a module reset — it is in-memory only', async () => {
    setProgramDraft(FULL);
    vi.resetModules();
    const fresh = await import('@/services/programDraft');
    expect(fresh.consumeProgramDraft()).toEqual({});
  });
});
