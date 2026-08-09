import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * S3-3 — one three-colour scale must not carry two vocabularies.
 *
 * The GI meter reads Bas / Modéré / Élevé (`analysis.gi*`); the glycemic-LOAD
 * tag beside it read Bas / **Moyen** / Élevé (`result.low|medium|high`). Same
 * colours, same three-step logic, two different middle words, on the same card
 * — in French and English only: German ("Mittel") and Arabic ("متوسط") already
 * used ONE word for both, which is what showed fr/en to be the outliers rather
 * than a deliberate distinction.
 *
 * WORDING ONLY. No threshold, band, colour or classification was touched:
 * `giBand`, `glBand`, `glycemicLoad`, `GL_LOW_MAX` and `GL_MEDIUM_MAX` are
 * untouched, and a plate that read "medium" still reads "medium".
 *
 * NOTE — this pins the VOCABULARY, not the bands. GI and GL remain different
 * quantities with different cut-offs, and whether those cut-offs should agree
 * is an RU-3 question (D10, and the GL 20.4 rounding boundary) that this test
 * deliberately does not touch.
 */
const LOCALES = ['fr', 'en', 'de', 'ar'] as const;

const locale = (l: string) =>
  JSON.parse(
    readFileSync(path.resolve(process.cwd(), `src/i18n/locales/${l}.json`), 'utf8')
  );

describe('S3-3 — the glycemic scale speaks one language per locale', () => {
  it.each(LOCALES)('%s: the GL tag and the GI meter share their LOW word', (l) => {
    const j = locale(l);
    expect(j.result.low).toBe(j.analysis.giLow);
  });

  it.each(LOCALES)('%s: the GL tag and the GI meter share their MIDDLE word', (l) => {
    // The defect: fr said "Modéré" on one and "Moyen" on the other.
    const j = locale(l);
    expect(j.result.medium).toBe(j.analysis.giModerate);
  });

  it.each(LOCALES)('%s: the GL tag and the GI meter share their HIGH word', (l) => {
    const j = locale(l);
    expect(j.result.high).toBe(j.analysis.giHigh);
  });

  it('the three words are distinct within a locale', () => {
    // A shared vocabulary must still distinguish the three steps.
    for (const l of LOCALES) {
      const j = locale(l);
      const words = [j.result.low, j.result.medium, j.result.high];
      expect(new Set(words).size, l).toBe(3);
    }
  });

  it('every locale still has all three words', () => {
    for (const l of LOCALES) {
      const j = locale(l);
      for (const k of ['low', 'medium', 'high'] as const) {
        expect(typeof j.result[k], `${l}.result.${k}`).toBe('string');
        expect(j.result[k].length, `${l}.result.${k}`).toBeGreaterThan(0);
      }
    }
  });
});

/**
 * 22D Phase 2 replaced the name "Score santé" with the interim
 * "Repère GluciAI", and the spec was explicit that the old key must be
 * "deleted, not aliased, so no surface can keep rendering 'Score santé'".
 *
 * One sentence kept rendering it anyway: `analysis.giScoreScope`, the line that
 * explains why the index and the indicator disagree, still called it "le score
 * santé" in fr and "the health score" in en. It was the last surviving instance
 * of a name the product had already retired.
 *
 * Completing an ALREADY-APPROVED rename. No new name was invented — the
 * sentence now uses the interim name Phase 2 adopted — and no threshold, band
 * or number is involved.
 */
describe('22D Phase 2 — the retired name does not survive anywhere', () => {
  const RETIRED = [
    /score\s+santé/i,
    /health\s+score/i,
    /Gesundheitswert/i,
    /Gesundheitsscore/i,
    /نقاط الصحة/,
  ];

  it.each(LOCALES)('%s: no string still says "health score"', (l) => {
    const raw = readFileSync(
      path.resolve(process.cwd(), `src/i18n/locales/${l}.json`),
      'utf8'
    );
    for (const pattern of RETIRED) {
      expect(raw, `${l} still contains ${pattern}`).not.toMatch(pattern);
    }
  });

  it.each(LOCALES)('%s: the interim name is the one actually in use', (l) => {
    const j = locale(l);
    expect(typeof j.analysis.scoreTitle).toBe('string');
    expect(j.analysis.scoreTitle.length).toBeGreaterThan(0);
    // The explanatory sentence names the same indicator as the card's title.
    expect(j.analysis.giScoreScope).toContain('GluciAI');
  });

  it('the old i18n key is gone, not aliased', () => {
    for (const l of LOCALES) {
      expect(locale(l).analysis.healthScore, l).toBeUndefined();
    }
  });
});
