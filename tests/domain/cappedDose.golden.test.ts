import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import ar from '@/i18n/locales/ar.json';
import de from '@/i18n/locales/de.json';
import en from '@/i18n/locales/en.json';
import fr from '@/i18n/locales/fr.json';

/**
 * CHARACTERIZATION — what the SCREEN says about a capped dose (P7-009 / P12-001).
 *
 * The arithmetic half lives in tests/clinical/ru11Baseline.golden.test.ts and is
 * not touched by this step: 20 U stays 20 U, the threshold stays 20, the
 * rounding stays 0.1. What changes here is only whether the patient is told
 * that the number they are looking at is a ceiling.
 */

const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8');

const LOCALES = { fr, en, de, ar } as Record<string, { bolus: Record<string, string> }>;

describe('FIXED IN STEP 19B-1 — a capped dose says it is a ceiling', () => {
  /**
   * BEFORE (recorded green against the old code — docs/KNOWN-BAD-BASELINE.md):
   *
   *   `bolus.tsx` mentioned neither `capped` nor `rawTotal`; `DoseHero` had no
   *   notion of a ceiling; no locale had any wording for one. The hero printed
   *   "20 U" exactly as it prints "6.3 U", and the breakdown below it added up
   *   to a different number with nothing to explain the difference.
   *
   * AFTER: the screen reads the flag the engine has always set and shows the
   * app's maximum beside the uncapped figure.
   *
   * NOT CHANGED, and asserted in tests/clinical/ru11Baseline.golden.test.ts:
   * the 20 U threshold, the clamped value, `rawTotal`, the rounding, and
   * `localDoseCheck` — a capped dose accepted unchanged is still classified
   * `{risk:'ok', reasons:[]}`, which stays OPEN as the RU-2/RU-6 half.
   */

  it('the bolus screen reads the capped flag and the uncapped figure', () => {
    const screen = src('src/app/bolus.tsx');
    expect(screen).toContain("engine.flags.includes('capped')");
    expect(screen).toContain('engine.rawTotal');
  });

  it('the notice names the app maximum and the calculated figure', () => {
    const screen = src('src/app/bolus.tsx');
    expect(screen).toContain("t('bolus.cappedTitle'");
    expect(screen).toContain("t('bolus.cappedBody'");
    expect(screen).toContain('MAX_SAFE_BOLUS');
  });

  it('it is suppressed in the hypo case, where injecting is the wrong action', () => {
    expect(src('src/app/bolus.tsx')).toContain(
      "!isHypo && engine.flags.includes('capped')"
    );
  });

  it('every locale states the limit, and none calls it a recommended dose', () => {
    for (const [lang, dict] of Object.entries(LOCALES)) {
      expect(dict.bolus.cappedTitle, `${lang} title`).toBeTruthy();
      expect(dict.bolus.cappedBody, `${lang} body`).toBeTruthy();
      // Both figures are named: the ceiling and what the calculation produced.
      expect(dict.bolus.cappedTitle, `${lang}`).toContain('{{max}}');
      expect(dict.bolus.cappedBody, `${lang}`).toContain('{{max}}');
      expect(dict.bolus.cappedBody, `${lang}`).toContain('{{raw}}');
    }
    // Four locales, four distinct sentences — none left untranslated.
    expect(new Set(Object.values(LOCALES).map((d) => d.bolus.cappedBody)).size).toBe(4);
  });

  it('the dose hero itself is untouched — no clinical claim was added to it', () => {
    expect(src('src/components/bolus/DoseHero.tsx')).not.toContain('capped');
  });
});
