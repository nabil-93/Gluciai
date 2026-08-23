import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * THE REPORT AND THE CALENDAR FOLLOW THE APP LANGUAGE.
 *
 * WHAT WAS WRONG. `report.tsx` was written entirely in French: ~40 user-facing
 * strings as JSX literals, every date through `toLocaleDateString('fr-FR')`
 * and every number through `toLocaleString('fr-FR')`. An Arabic patient
 * switched the app to العربية and still read "Période analysée",
 * "du 15 janvier 2026 au 14 février 2026" and "6,4". `calendar.tsx` was
 * already localized for dates but kept four French literals.
 *
 * WHAT IS DELIBERATELY NOT TRANSLATED, and must stay that way:
 *   · the generated PDF — `reportHtml.ts` hardcodes `<html lang="fr">`; it is
 *     a French clinical document for the doctor, not app UI. `SLOT_FR` and
 *     `SOURCE_LABEL` feed it and keep their French values.
 *   · `s.key` (night/morning/…), enum values and clinical identifiers.
 *   · units (mg/dL, U, g, min, %) and the patient's own target numbers.
 *
 * `report.tsx`/`calendar.tsx` import React Native, which the node runner
 * cannot parse, so the call sites are asserted on source — the convention this
 * suite already uses.
 */
const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

const locale = (l: string) => JSON.parse(src(`src/i18n/locales/${l}.json`));
const LOCALES = ['fr', 'en', 'de', 'ar'] as const;

/** Flatten a nested block to dotted keys. */
const flat = (o: Record<string, unknown>, p = ''): [string, string][] =>
  Object.entries(o).flatMap(([k, v]) =>
    typeof v === 'string'
      ? ([[p + k, v]] as [string, string][])
      : flat(v as Record<string, unknown>, `${p}${k}.`)
  );

const REPORT_KEYS = [
  'title',
  'periodLabel',
  'periodRange',
  'ea1cLabel',
  'thinData',
  'tirTitle',
  'tirInTarget',
  'tirGoal',
  'bandVeryHigh',
  'bandHigh',
  'bandInRange',
  'bandLow',
  'bandVeryLow',
  'noData',
  'trendTitle',
  'bySlotTitle',
  'detailTitle',
  'statCv',
  'statSd',
  'statMinMax',
  'statPerDay',
  'statLows',
  'statHighs',
  'statInsulinPerDay',
  'statRapidLong',
  'statCarbsPerDay',
  'statSugarPerDay',
  'statMeals',
  'statActivity',
  'weeklyTitle',
  'generatePdf',
  'slot.night',
  'slot.morning',
  'slot.afternoon',
  'slot.evening',
] as const;

const CALENDAR_KEYS = ['today', 'legendInRange', 'legendMid', 'legendLow'] as const;

describe('every report and calendar string exists in all four languages', () => {
  for (const l of LOCALES) {
    it(`${l}: all ${REPORT_KEYS.length} report keys, non-empty`, () => {
      const m = new Map(flat(locale(l).reportPage ?? {}));
      for (const k of REPORT_KEYS) {
        expect(m.get(k), `${l}.reportPage.${k} missing`).toBeTruthy();
        expect(m.get(k)!.trim().length, `${l}.reportPage.${k}`).toBeGreaterThan(0);
      }
    });

    it(`${l}: all ${CALENDAR_KEYS.length} calendar keys, non-empty`, () => {
      const c = locale(l).calendarPage ?? {};
      for (const k of CALENDAR_KEYS) {
        expect(typeof c[k], `${l}.calendarPage.${k}`).toBe('string');
        expect(c[k].trim().length, `${l}.calendarPage.${k}`).toBeGreaterThan(0);
      }
    });

    it(`${l}: the pluralized keys carry both forms`, () => {
      // i18next selects `_one`/`_other` at render time; a missing form falls
      // back to the key name and renders as raw text.
      const r = locale(l).reportPage;
      for (const base of ['rangeDays', 'ea1cHint', 'slotCount', 'pdfHint']) {
        expect(r[`${base}_one`], `${l}.reportPage.${base}_one`).toBeTruthy();
        expect(r[`${base}_other`], `${l}.reportPage.${base}_other`).toBeTruthy();
      }
    });
  }

  it('interpolation placeholders are identical in every locale', () => {
    const ph = (s: string) => (s.match(/{{\w+}}/g) ?? []).sort().join(',');
    const base = new Map([
      ...flat(locale('fr').reportPage),
      ...flat(locale('fr').calendarPage),
    ]);
    for (const l of LOCALES.filter((x) => x !== 'fr')) {
      const m = new Map([
        ...flat(locale(l).reportPage),
        ...flat(locale(l).calendarPage),
      ]);
      for (const [k, v] of base) {
        expect(m.has(k), `${l} missing ${k}`).toBe(true);
        expect(ph(m.get(k)!), `${l}.${k} placeholder drift`).toBe(ph(v));
      }
    }
  });
});

describe('the translations are real translations', () => {
  it('Arabic report strings are in Arabic script and differ from French', () => {
    const ar = new Map(flat(locale('ar').reportPage));
    const fr = new Map(flat(locale('fr').reportPage));
    for (const k of REPORT_KEYS) {
      // `statCv` legitimately contains the Latin acronym "CV", so the test
      // asks for SOME Arabic rather than no Latin at all.
      expect(/[؀-ۿ]/.test(ar.get(k)!), `ar.reportPage.${k} has no Arabic`).toBe(true);
      expect(ar.get(k), `ar.reportPage.${k} is a French copy`).not.toBe(fr.get(k));
    }
  });

  it('Arabic calendar strings are in Arabic and differ from French', () => {
    const ar = locale('ar').calendarPage;
    const fr = locale('fr').calendarPage;
    // legendMid is "40–70%" in every language — digits only, nothing to
    // translate — so only the prose keys are checked for script.
    expect(/[؀-ۿ]/.test(ar.today)).toBe(true);
    expect(/[؀-ۿ]/.test(ar.legendInRange)).toBe(true);
    expect(ar.today).not.toBe(fr.today);
    expect(ar.legendInRange).not.toBe(fr.legendInRange);
  });

  /*
   * "Min / Max" is spelled identically in French, English and German. It is an
   * abbreviation pair, not prose, and forcing it to differ would mean writing
   * a WORSE German label to satisfy a test. Excluded by name — deliberately,
   * and only for the Latin-script locales; Arabic still has to be Arabic and
   * is covered above.
   */
  const SAME_IN_LATIN_LOCALES = new Set(['statMinMax']);
  const prose = REPORT_KEYS.filter((k) => !SAME_IN_LATIN_LOCALES.has(k));

  it('German is a real translation, not the French text', () => {
    const de = new Map(flat(locale('de').reportPage));
    const fr = new Map(flat(locale('fr').reportPage));
    for (const k of prose) {
      expect(de.get(k), `de.reportPage.${k} is a French copy`).not.toBe(fr.get(k));
    }
    expect(locale('de').calendarPage.today).not.toBe(locale('fr').calendarPage.today);
  });

  it('English differs from French too', () => {
    const en = new Map(flat(locale('en').reportPage));
    const fr = new Map(flat(locale('fr').reportPage));
    for (const k of prose) {
      expect(en.get(k), `en.reportPage.${k} is a French copy`).not.toBe(fr.get(k));
    }
  });
});

describe('neither screen hardcodes user-facing text any more', () => {
  it('report.tsx renders no literal sentence', () => {
    const s = src('src/app/report.tsx');
    const literals = s.match(/<Text[^>]*>\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ,'’.!?-]{4,}\s*</g);
    expect(literals, `hardcoded text in report.tsx: ${literals}`).toBeNull();
  });

  it('calendar.tsx renders no literal sentence', () => {
    const s = src('src/app/calendar.tsx');
    const literals = s.match(/<Text[^>]*>\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ,'’.!?-]{4,}\s*</g);
    expect(literals, `hardcoded text in calendar.tsx: ${literals}`).toBeNull();
  });

  it('the previously reported strings are gone from the source', () => {
    const r = src('src/app/report.tsx');
    for (const gone of [
      '>Période analysée<',
      '>Temps dans les cibles<',
      'Aucune mesure sur la période.',
      '>Moyenne glycémique par jour<',
      '>Par moment de la journée<',
      '>Détail de la période<',
      '>Résumé IA de la semaine<',
      'title="Rapport médecin"',
    ]) {
      expect(r, `still present: ${gone}`).not.toContain(gone);
    }
    expect(src('src/app/calendar.tsx')).not.toContain(">Aujourd'hui<");
  });

  it('the section titles are looked up, not written', () => {
    const r = src('src/app/report.tsx');
    for (const k of [
      'reportPage.title',
      'reportPage.periodLabel',
      'reportPage.tirTitle',
      'reportPage.trendTitle',
      'reportPage.bySlotTitle',
      'reportPage.detailTitle',
      'reportPage.weeklyTitle',
      'reportPage.noData',
    ]) {
      expect(r, `report.tsx does not use ${k}`).toContain(k);
    }
  });
});

describe('dates and numbers follow the selected language', () => {
  it('report.tsx pins no locale to fr-FR any more', () => {
    const code = src('src/app/report.tsx')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    // The comment explaining the fix may name 'fr-FR'; the CODE may not.
    expect(code).not.toContain("'fr-FR'");
    expect(code).not.toContain("'en-US'");
    expect(code).not.toContain("'de-DE'");
  });

  it('calendar.tsx formats dates with the app language', () => {
    const s = src('src/app/calendar.tsx');
    expect(s).not.toContain("'fr-FR'");
    expect(s).toContain('toLocaleDateString(locale');
    expect(s).toContain('toLocaleDateString(i18n.language');
  });

  it('the report formatters take the locale as an argument', () => {
    const s = src('src/app/report.tsx');
    // A module-level formatter would be built once at import and freeze the
    // language of the first render for the life of the process.
    expect(s).toContain('const fmtD = (d: Date, locale: string)');
    expect(s).toContain('const fmtN = (n: number, locale: string)');
    expect(s).toContain('const locale = i18n.language');
  });
});

describe('switching language re-renders both screens', () => {
  it('report.tsx reads the language through the hook, not a cached constant', () => {
    const s = src('src/app/report.tsx');
    expect(s).toContain("useTranslation } from 'react-i18next'");
    expect(s).toContain('const { t, i18n } = useTranslation()');
  });

  it('calendar.tsx recomputes its month and day names on language change', () => {
    const s = src('src/app/calendar.tsx');
    // Both memos must list the language, or the header keeps the old locale.
    expect(s).toContain('dowLabels(i18n.language), [i18n.language]');
    expect(s).toContain('[monthsBack, i18n.language]');
  });

  it('the legend rows receive the locale, so numbers switch with the labels', () => {
    const s = src('src/app/report.tsx');
    expect(s).toContain('locale: string;');
    expect(s).toContain('fmtN(pct, locale)');
  });
});

describe('the two screens mirror correctly in Arabic', () => {
  /*
   * React Native auto-mirrors `flexDirection: 'row'`, `marginLeft/Right` and
   * `paddingLeft/Right` under RTL. It does NOT auto-mirror absolute offsets
   * (`left`/`right`), and `textAlign: 'right'` is an absolute instruction that
   * survives the flip. Both of those were present in these screens.
   */
  it('the slot average is not pinned to a hardcoded side', () => {
    const s = src('src/app/report.tsx');
    const rule = s.slice(s.indexOf('slotAvg: {'), s.indexOf('slotAvg: {') + 120);
    expect(rule).not.toContain("textAlign: 'right'");
    expect(rule).toContain("textAlign: 'auto'");
  });

  it("the calendar's Today button uses a direction-aware offset", () => {
    const s = src('src/app/calendar.tsx');
    // Slice forward from the rule itself: `backgroundColor: colors.surface`
    // also occurs earlier in the file, which would make the range run
    // backwards and silently yield an empty string.
    const at = s.indexOf('todayBtn: {');
    const rule = s.slice(at, s.indexOf('},', at));
    // `left: 16` would leave the button on the wrong side of an Arabic screen.
    expect(rule).not.toMatch(/\bleft:\s*\d/);
    expect(rule).toContain('start: 16');
  });

  it('neither screen forces a writing direction', () => {
    for (const f of ['src/app/report.tsx', 'src/app/calendar.tsx']) {
      const code = src(f)
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      expect(code, `${f} forces writingDirection`).not.toContain('writingDirection');
    }
  });
});

describe('the home timeline clock follows the app language', () => {
  /*
   * Found in the final remaining-issues audit. `(tabs)/index.tsx` formatted the
   * timeline's visible time with `toLocaleTimeString('fr-FR', …)` while the
   * same screen's header already used `i18n.language` — so an Arabic or German
   * patient read French-formatted times in an otherwise translated timeline.
   *
   * The call sits in JSX rather than inside the `timeline` memo, so it
   * re-renders with the component and cannot hold a stale locale.
   */
  const home = () => src('src/app/(tabs)/index.tsx');

  it('THE FIX: the timeline time is formatted with the active language', () => {
    expect(home()).toContain('toLocaleTimeString(i18n.language, {');
  });

  it('no user-facing formatter on the home screen is pinned to a locale', () => {
    const code = home()
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain("toLocaleTimeString('fr-FR'");
    expect(code).not.toContain("toLocaleDateString('fr-FR'");
  });

  it('the screen reads the language from the hook, not a constant', () => {
    expect(home()).toContain('const { t, i18n } = useTranslation()');
  });
});

describe('the Arabic plural omission is deliberate, not a gap', () => {
  /*
   * `home.injectionSummary` interpolates `{{plural}}`, which the caller fills
   * with a Latin "s" (`(tabs)/index.tsx:2361`). FR/EN/DE need it —
   * "1 injection" vs "2 injections". Arabic does not form plurals with a
   * suffix, so `ar` omits the placeholder on purpose.
   *
   * A naive "placeholder parity" check flags this as drift. It is not: adding
   * `{{plural}}` to the Arabic string would render a bare Latin "s" inside an
   * Arabic sentence. This fixture records the reasoning so the next person to
   * run a parity script does not "fix" it into a bug.
   */
  const home = (l: string) => JSON.parse(src(`src/i18n/locales/${l}.json`)).home;

  it('FR, EN and DE carry {{plural}} — they need the suffix', () => {
    for (const l of ['fr', 'en', 'de'] as const) {
      expect(home(l).injectionSummary, `${l} lost {{plural}}`).toContain('{{plural}}');
    }
  });

  it('Arabic deliberately omits {{plural}} but keeps the real data', () => {
    const ar = home('ar').injectionSummary;
    expect(ar).not.toContain('{{plural}}');
    // The values that actually matter must still be there.
    expect(ar).toContain('{{units}}');
    expect(ar).toContain('{{count}}');
  });

  it('no other key relies on a Latin plural suffix', () => {
    // If a second one appears, it needs the same deliberate decision.
    const s = src('src/app/(tabs)/index.tsx');
    const uses = s.match(/plural:\s*[^,\n]+/g) ?? [];
    expect(uses.length).toBe(1);
  });
});

describe('internal identifiers are NOT translated', () => {
  it('the French PDF keeps its French labels', () => {
    // reportHtml.ts declares <html lang="fr"> — a French clinical document.
    const html = src('src/services/reportHtml.ts');
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('export const SLOT_FR');
    expect(src('src/services/nutrition/engine.ts')).toContain('export const SOURCE_LABEL');
  });

  it('the slot key stays an identifier and only its label is looked up', () => {
    const s = src('src/app/report.tsx');
    // `s.key` indexes the translation; it is never itself rendered.
    expect(s).toContain('t(`reportPage.slot.${s.key}`)');
    expect(s).toContain('key={s.key}');
  });

  it('GMI keeps its international acronym', () => {
    expect(src('src/app/report.tsx')).toContain('>GMI<');
  });

  it('the four slot identifiers are the same in every locale', () => {
    for (const l of LOCALES) {
      expect(Object.keys(locale(l).reportPage.slot).sort()).toEqual([
        'afternoon',
        'evening',
        'morning',
        'night',
      ]);
    }
  });
});
