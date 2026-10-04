import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * STORE AUDIT 2026-10 — safety and honesty fixes that live in screen wiring
 * and in edge-function prompts (docs/AUDIT-STORES-2026-10-04.md).
 *
 * The screens import React Native and the prompts run on Deno, neither of
 * which the node runner can execute, so — as in releaseRemediation — the
 * SOURCE is what is pinned: the wiring is the fix, and the wiring is what
 * must not regress.
 */
const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

const LOCALES = ['fr', 'en', 'de', 'ar'] as const;
const locale = (l: string): Record<string, any> =>
  JSON.parse(src(`src/i18n/locales/${l}.json`));

describe('C-12 · Mon Programme is refused to who it is unsafe for', () => {
  const setup = () => src('src/app/program-setup.tsx');

  it('gestational diabetes never gets a calorie plan', () => {
    expect(setup()).toContain("profile?.diabetes_type === 'gestational'");
    expect(setup()).toContain("? 'pregnancy'");
  });

  it('a minor never gets a calorie plan', () => {
    expect(setup()).toContain('exactAge < 18');
  });

  it('an unknown age is asked for, not assumed adult', () => {
    // programEngine.ageFrom falls back to 35 — that fallback must not be what
    // lets a patient of unknown age through.
    expect(setup()).toContain('exactAge === null');
    expect(setup()).not.toContain('ageFrom(');
  });

  it('the block is returned BEFORE the wizard can render', () => {
    const s = setup();
    const blockAt = s.indexOf('if (blockedReason) {');
    const wizardAt = s.indexOf("{step === 'recap' ? (");
    expect(blockAt).toBeGreaterThan(-1);
    expect(blockAt).toBeLessThan(wizardAt);
  });

  it('a plan that changes insulin needs cannot be started without the doctor tick', () => {
    const s = setup();
    expect(s).toContain("w === 'insulinDosesWillChange' || w === 'lowBmiLoss'");
    expect(s).toContain("if (step === 'recap' && needsDoctorAck && !doctorAck) return false;");
    // The CTA honours canContinue.
    expect(s).toContain('disabled={!canContinue() || saving}');
  });

  it('every block explains itself in all four languages', () => {
    const keys = [
      'blocked_pregnancy_title',
      'blocked_pregnancy_body',
      'blocked_minor_title',
      'blocked_minor_body',
      'blocked_age_title',
      'blocked_age_body',
      'blocked_age_cta',
      'doctorAck',
    ];
    for (const l of LOCALES) {
      for (const k of keys) {
        expect(locale(l).program[k], `${l}.program.${k}`).toBeTruthy();
      }
    }
  });
});

describe('B-06 · no placeholder health integrations are advertised', () => {
  it('the Biologie tab no longer links to the stub sensors screen', () => {
    const s = src('src/app/(tabs)/biology.tsx');
    expect(s).not.toContain("router.push('/integrations')");
  });
});

describe('C-13 · the AI never presents itself as a doctor', () => {
  it('lab analysis prompts say "NOT a doctor"', () => {
    const s = src('supabase/functions/lab-analyze/index.ts');
    expect(s).not.toMatch(/You are GluciAI, a (warm )?(senior |caring )?doctor/);
    expect(s.match(/NOT a doctor/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
  });

  it('the voice does not read as a doctor', () => {
    expect(src('supabase/functions/tts/index.ts')).not.toContain('calm doctor');
  });
});
