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

describe('F-08 · manual entries carry the time they happened', () => {
  it('glucose and insulin pass the chosen time to the save', () => {
    expect(src('src/app/log-glucose.tsx')).toContain(
      'takenAt != null ? new Date(takenAt).toISOString() : undefined'
    );
    expect(src('src/app/log-insulin.tsx')).toContain(
      'givenAt != null ? new Date(givenAt).toISOString() : undefined'
    );
  });

  it('the picker never goes into the future nor past 24 h', () => {
    const s = src('src/components/EntryTimePicker.tsx');
    expect(s).toContain('if (next >= now) return onChange(null);');
    expect(s).toContain('Math.max(now - MAX_BACK, next)');
  });
});

describe('F-09 · a barcode product is filed under a meal', () => {
  it('the save asks for the meal and passes it on', () => {
    const s = src('src/app/barcode.tsx');
    expect(s).toContain('<MealTypeModal');
    expect(s).toContain('saveMeal(result, product.imageUrl, undefined, undefined, mealType)');
  });
});

describe('F-11 · the native scanner never holds a full-resolution base64 photo', () => {
  it('raw base64 is requested on the web only', () => {
    const s = src('src/app/scan.tsx');
    expect(s).toContain('const RAW_BASE64 = isWeb;');
    expect(s).not.toContain('base64: true');
  });

  it('a camera or picker failure reaches the patient', () => {
    expect(src('src/app/scan.tsx').match(/captureFailed\(e\)/g)?.length).toBe(2);
  });
});

describe('F-14 · the home screen follows the calendar day', () => {
  it('rolls over on focus, on foreground and every minute', () => {
    const s = src('src/app/(tabs)/index.tsx');
    expect(s).toContain('useFocusEffect(rollToToday);');
    expect(s).toContain("if (s === 'active') rollToToday();");
    expect(s).toContain('setInterval(rollToToday, 60_000)');
  });
});

describe('F-16 · no hardcoded "IA" on the scanner', () => {
  it('the label is translated', () => {
    expect(src('src/app/scan.tsx')).not.toContain('>IA<');
    for (const l of LOCALES) expect(locale(l).scanner.aiShort).toBeTruthy();
  });
});

describe('D-05 · account deletion empties a bucket of any size', () => {
  it('lists and removes until nothing is left', () => {
    const s = src('supabase/functions/delete-account/index.ts');
    expect(s).toContain('for (let pass = 0; pass < MAX_PASSES; pass++)');
    expect(s).toContain('emptied = true;');
  });

  it('internal error detail stays in the log (S-08)', () => {
    const s = src('supabase/functions/delete-account/index.ts');
    expect(s).not.toContain('detail: storageErrors');
    expect(s).not.toContain('json({ error: String(error) }');
  });
});

describe('B-05 / B-10 · public privacy policy and account-deletion page', () => {
  it('both routes exist and are linked from the profile', () => {
    expect(src('src/app/privacy.tsx')).toContain('export default function PrivacyScreen');
    expect(src('src/app/delete-account.tsx')).toContain('await deleteAccount()');
    expect(src('src/app/profile.tsx')).toContain("router.push('/privacy' as never)");
  });

  it('the deletion page erases through the same edge function, after a confirm', () => {
    const s = src('src/app/delete-account.tsx');
    expect(s.indexOf('confirmAsync(')).toBeLessThan(s.indexOf('await deleteAccount()'));
  });

  it('the policy names every processor, in every language', () => {
    for (const l of LOCALES) {
      const p = locale(l).legal.processorsB as string;
      for (const name of ['Supabase', 'Google', 'Gemini', 'Vercel']) {
        expect(p, `${l} ${name}`).toContain(name);
      }
    }
  });
});

describe('B-08 / B-09 · the AI consent tells the truth', () => {
  it('names Google Gemini and no longer promises "never used for training" on Google’s behalf', () => {
    for (const l of LOCALES) {
      const c = locale(l).consent;
      expect(c.aiDesc, l).toContain('Gemini');
      expect(c.aiDetailIntro, l).toContain('Google');
    }
    expect(locale('fr').consent.aiS3B).not.toContain('Elles ne servent jamais');
  });

  it('only the first name is sent to the assistant', () => {
    expect(src('src/services/ai.ts')).toContain("const firstName = p.name?.trim().split(/\\s+/)[0] || '?';");
    expect(src('src/services/ai.ts')).not.toContain('`Profile: name ${p.name');
  });
});

describe('U-01 / U-03 / K-03 / K-06 · native config', () => {
  const app = () => JSON.parse(src('app.json')).expo;

  it('the app is declared light, like every screen it draws', () => {
    expect(app().userInterfaceStyle).toBe('light');
  });

  it('iOS permission texts exist in the four app languages', () => {
    const e = app();
    expect(Object.keys(e.locales).sort()).toEqual(['ar', 'de', 'en', 'fr']);
    for (const l of LOCALES) {
      const ios = JSON.parse(src(`locales/${l}.json`)).ios;
      expect(ios.NSCameraUsageDescription, l).toBeTruthy();
      expect(ios.NSPhotoLibraryUsageDescription, l).toBeTruthy();
      expect(ios.NSMicrophoneUsageDescription, l).toBeTruthy();
    }
  });

  it('declares no non-exempt encryption (no export question on every upload)', () => {
    expect(app().ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });

  it('Android notifications have a real monochrome icon', () => {
    const plugin = app().plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-notifications');
    expect(plugin?.[1].icon).toBe('./assets/images/notification-icon.png');
  });

  it('an Arabic phone starts right-to-left (F-12)', () => {
    const plugin = app().plugins.find((p: unknown) => Array.isArray(p) && p[0] === 'expo-localization');
    expect(plugin?.[1].supportsRTL).toBe(true);
  });
});

describe('U-04 / U-09 / U-10 · polish', () => {
  it('the welcome mock-up no longer shows a sleep feature the app does not have', () => {
    expect(src('src/app/welcome.tsx')).not.toContain("t('welcome.sleep')");
  });

  it('the support greeting carries the current brand', () => {
    expect(src('src/config/support.ts')).not.toContain('GlucoAI');
  });
});
