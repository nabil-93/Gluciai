import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  INSIGHT_KEYS,
  kindFromTitle,
  kindOfEntry,
  localizeEntry,
} from '@/services/insightIdentity';
import type { AIJournalEntry, InsightKind } from '@/types';

/**
 * NOTIFICATIONS MUST NOT BE FROZEN IN THE LANGUAGE THEY WERE WRITTEN IN.
 *
 * Reported from manual testing: the list showed German, Arabic and French rows
 * side by side, and opening a German one produced a French report with GENERIC
 * advice. Two separate defects behind one symptom —
 *
 *   · an entry stored only rendered text, so it could never be re-rendered;
 *   · the detail screen recovered the event by matching FRENCH keywords in
 *     that text, so any other language fell through to the generic branch and
 *     the patient lost the specific clinical guidance.
 *
 * Both are fixed by giving the event a stable identity. These fixtures pin
 * that a German, Arabic or English entry reaches the SAME report as a French
 * one, and that legacy rows — which carry no identity — are still recovered.
 */

const LOCALES = ['fr', 'en', 'de', 'ar'] as const;

const dict = Object.fromEntries(
  LOCALES.map((l) => [
    l,
    JSON.parse(
      readFileSync(path.resolve(process.cwd(), `src/i18n/locales/${l}.json`), 'utf8')
    ),
  ])
) as Record<string, Record<string, Record<string, string>>>;

/** Resolve a dotted key out of a locale file, the way i18next would. */
const tIn = (lang: string, key: string): string => {
  const [ns, k] = key.split('.');
  return dict[lang]?.[ns]?.[k] ?? key;
};
const tFor =
  (lang: string) =>
  (key: string, params?: Record<string, unknown>): string => {
    let out = tIn(lang, key);
    for (const [p, v] of Object.entries(params ?? {})) {
      out = out.replace(new RegExp(`\\{\\{${p}\\}\\}`, 'g'), String(v));
    }
    return out;
  };

const ALL_KINDS = Object.keys(INSIGHT_KEYS) as InsightKind[];

const entry = (o: Partial<AIJournalEntry>): AIJournalEntry => ({
  id: 'x',
  icon: '📈',
  title: '',
  body: '',
  tone: 'warning',
  created_at: '2026-08-02T17:13:00.000Z',
  ...o,
});

/* ─────────────── 1. every event is spelled in every language ─────────────── */

describe('the identity map is complete', () => {
  it('every kind has a title and a body key, in all four locales', () => {
    for (const kind of ALL_KINDS) {
      const { title, body } = INSIGHT_KEYS[kind];
      for (const lang of LOCALES) {
        expect(tIn(lang, title), `${kind}.title/${lang}`).not.toBe(title);
        expect(tIn(lang, body), `${kind}.body/${lang}`).not.toBe(body);
      }
    }
  });

  it('titles interpolate nothing — which is why a legacy row can be re-titled', () => {
    for (const kind of ALL_KINDS) {
      for (const lang of LOCALES) {
        expect(tIn(lang, INSIGHT_KEYS[kind].title), `${kind}/${lang}`).not.toContain('{{');
      }
    }
  });
});

/* ──────────── 2. THE BUG: a German entry reached the wrong report ────────── */

describe('classification is language-independent', () => {
  it('the same event resolves from its title in every language', () => {
    for (const kind of ALL_KINDS) {
      for (const lang of LOCALES) {
        const title = tIn(lang, INSIGHT_KEYS[kind].title);
        expect(kindFromTitle(title, LOCALES, tIn), `${kind} via ${lang}`).toBe(kind);
      }
    }
  });

  it('the reported case: "Blutzucker über dem Ziel" is a hyper event', () => {
    // Exactly what the screenshot showed — a German alert that used to fall
    // through to the generic report because the matcher only knew French.
    const german = tIn('de', 'insights.hyperTitle');
    expect(german).toBe('Blutzucker über dem Ziel');
    expect(kindFromTitle(german, LOCALES, tIn)).toBe('hyper');
    // …and its Arabic and French twins land on the same event.
    expect(kindFromTitle(tIn('ar', 'insights.hyperTitle'), LOCALES, tIn)).toBe('hyper');
    expect(kindFromTitle(tIn('fr', 'insights.hyperTitle'), LOCALES, tIn)).toBe('hyper');
  });

  it('a stored kind wins over the title, and is not re-derived', () => {
    const e = entry({ kind: 'hypo', title: tIn('de', 'insights.hyperTitle') });
    expect(kindOfEntry(e, LOCALES, tIn)).toBe('hypo');
  });

  it('free-form entries (the AI chat writes those) resolve to nothing', () => {
    expect(kindOfEntry(entry({ title: 'J’ai mangé une tajine' }), LOCALES, tIn)).toBeNull();
    expect(kindFromTitle('', LOCALES, tIn)).toBeNull();
    expect(kindFromTitle(undefined, LOCALES, tIn)).toBeNull();
  });

  it('matching tolerates the spacing a render may have introduced', () => {
    expect(kindFromTitle('  Blutzucker   über dem Ziel ', LOCALES, tIn)).toBe('hyper');
  });
});

/* ─────────────── 3. what a row PRINTS in the current language ────────────── */

describe('localizeEntry', () => {
  it('a new row rebuilds both lines, numbers intact, in any language', () => {
    const e = entry({ kind: 'hyper', params: { value: 250 } });

    const de = localizeEntry(e, tFor('de'), LOCALES, tIn);
    expect(de.localized).toBe(true);
    expect(de.title).toBe('Blutzucker über dem Ziel');
    expect(de.body).toContain('250');

    const fr = localizeEntry(e, tFor('fr'), LOCALES, tIn);
    expect(fr.title).toBe('Glycémie au-dessus de la cible');
    expect(fr.body).toContain('250');

    const ar = localizeEntry(e, tFor('ar'), LOCALES, tIn);
    expect(ar.title).toBe(tIn('ar', 'insights.hyperTitle'));
    expect(ar.body).toContain('250');

    // The SAME event, four spellings — and never the language it was born in.
    expect(new Set([de.title, fr.title, ar.title]).size).toBe(3);
  });

  it('a legacy row is re-titled but keeps its body — the honest half', () => {
    // Written when the app was in German: no kind, no params, real numbers
    // baked into the sentence. The title travels; the body cannot, because the
    // 250 cannot be pulled back out without guessing.
    const legacy = entry({
      title: tIn('de', 'insights.hyperTitle'),
      body: '250 mg/dL — trink Wasser und erwäge eine Korrektur.',
    });

    const fr = localizeEntry(legacy, tFor('fr'), LOCALES, tIn);
    expect(fr.title).toBe('Glycémie au-dessus de la cible');
    expect(fr.body).toBe(legacy.body);
    expect(fr.localized).toBe(false);
  });

  it('an unrecognised row is left exactly as stored', () => {
    const free = entry({ title: 'Note libre', body: 'texte' });
    const out = localizeEntry(free, tFor('de'), LOCALES, tIn);
    expect(out).toEqual({ title: 'Note libre', body: 'texte', localized: false });
  });
});

/* ─────────────── 4. the screens actually use the identity ───────────────── */

const src = (rel: string) =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

describe('the screens read the identity, not the words', () => {
  it('every insight branch stamps a kind', () => {
    const s = src('src/services/insights.ts');
    for (const kind of ALL_KINDS) {
      expect(s, kind).toContain(`'${kind}'`);
    }
  });

  it('the home screen persists kind and params', () => {
    const s = src('src/app/(tabs)/index.tsx');
    expect(s).toContain('kind: insight.kind');
    expect(s).toContain('params: insight.params');
  });

  it('the detail screen no longer matches French keywords', () => {
    const s = src('src/app/insight-detail.tsx');
    expect(s).toContain('kindOfEntry(entry, langs, tIn)');
    expect(s).not.toMatch(/includes\('basse'\)|includes\('au-dessus'\)/);
    expect(s).not.toContain('function classify(');
  });

  it('the detail screen chrome is translated, and the dates follow the locale', () => {
    const s = src('src/app/insight-detail.tsx');
    for (const key of [
      'insightDetail.title',
      'insightDetail.causes',
      'insightDetail.advices',
      'insightDetail.actions',
      'insightDetail.disclaimer',
      'insightDetail.notFound',
    ]) {
      expect(s, key).toContain(key);
    }
    expect(s).not.toContain("'fr-FR'");
  });

  it('the medical text stays French and SAYS so to everyone else', () => {
    const s = src('src/app/insight-detail.tsx');
    // Still French, deliberately — pending clinical review.
    expect(s).toContain('Règle des 15');
    // …and non-French readers are told, rather than left to wonder.
    expect(s).toContain('medicalInFrenchOnly');
    expect(s).toContain('insightDetail.pendingTranslation');
    for (const lang of LOCALES) {
      expect(tIn(lang, 'insightDetail.pendingTranslation'), lang).not.toBe(
        'insightDetail.pendingTranslation'
      );
    }
  });

  it('the notification list renders the localized text', () => {
    const s = src('src/app/ai-journal.tsx');
    expect(s).toContain('localizeEntry');
    expect(s).toContain('{shown.title}');
    expect(s).toContain('{shown.body}');
  });
});
