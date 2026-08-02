import type { AIJournalEntry, InsightKind } from '@/types';

/**
 * THE STABLE IDENTITY OF A COACH EVENT, AND HOW TO RENDER IT TODAY.
 *
 * The bug this exists to end: a journal entry was only ever rendered text, so
 * an alert written while the app was in German stayed German forever — the list
 * showed three languages at once — and the detail screen recovered the event by
 * matching FRENCH words in that text. A German or Arabic entry matched nothing,
 * fell through to the generic branch, and the patient was given filler advice
 * where a French patient got the hypoglycemia report.
 *
 * So an entry now carries a `kind`. Everything on screen is rebuilt from it in
 * the language selected right now, and the detail screen reads it directly
 * instead of guessing.
 *
 * WHAT ABOUT ROWS WRITTEN BEFORE `kind` EXISTED? They are not rewritten — a
 * journal is a record of what the patient was actually shown, and no migration
 * can recover a value that was never stored. Instead `kindOfEntry` recovers the
 * identity by matching the stored title against that title in EVERY language we
 * ship. A legacy German "Blutzucker über dem Ziel" is recognised as `hyper`, so
 * it too opens the right report and re-titles itself in the current language.
 * Only its BODY stays as written, because the numbers inside it (`250 mg/dL`)
 * were interpolated at the time and cannot be pulled back out of the sentence
 * without guessing. Stated plainly rather than papered over.
 *
 * Pure and i18n-free by construction: callers pass `t` and the language list,
 * so this module can be tested in a plain node environment.
 */

/** Minimal translate signature (i18next TFunction) — no hard import here. */
export type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** The i18n keys each event renders through. One row, one event, forever. */
export const INSIGHT_KEYS: Record<InsightKind, { title: string; body: string }> = {
  hypo: { title: 'insights.hypoTitle', body: 'insights.hypoBody' },
  hyper: { title: 'insights.hyperTitle', body: 'insights.hyperBody' },
  postmeal: { title: 'insights.postMealTitle', body: 'insights.postMealBody' },
  sugar: { title: 'insights.sugarTitle', body: 'insights.sugarBody' },
  greatday: { title: 'insights.greatTitle', body: 'insights.greatBody' },
  activity: { title: 'insights.activityTitle', body: 'insights.activityBody' },
  fasting: { title: 'insights.fastingTitle', body: 'insights.fastingBody' },
  nomeasure: { title: 'insights.noMeasureTitle', body: 'insights.noMeasureBody' },
  scannext: { title: 'insights.scanNextTitle', body: 'insights.scanNextBody' },
  uptodate: { title: 'insights.upToDateTitle', body: 'insights.upToDateBody' },
};

const ALL_KINDS = Object.keys(INSIGHT_KEYS) as InsightKind[];

/**
 * Recover the event behind a LEGACY entry by matching its stored title against
 * the same title in every language the app ships.
 *
 * `tIn(lang, key)` must translate `key` as `lang` would. Comparison is
 * case-folded and whitespace-collapsed, because the stored string came from a
 * render and may differ in spacing from the raw resource.
 */
export function kindFromTitle(
  title: string | undefined,
  languages: readonly string[],
  tIn: (lang: string, key: string) => string
): InsightKind | null {
  const needle = normalize(title);
  if (!needle) return null;
  for (const kind of ALL_KINDS) {
    for (const lang of languages) {
      if (normalize(tIn(lang, INSIGHT_KEYS[kind].title)) === needle) return kind;
    }
  }
  return null;
}

function normalize(s: string | undefined): string {
  return (s ?? '').replace(/\s+/g, ' ').trim().toLowerCase();
}

/**
 * The event behind an entry: its stored `kind` when it has one, otherwise
 * recovered from the title. `null` when neither works — an entry written by a
 * surface that never had a kind (the AI chat writes free-form notes), which is
 * legitimate and must keep its text exactly as stored.
 */
export function kindOfEntry(
  entry: Pick<AIJournalEntry, 'kind' | 'title'>,
  languages: readonly string[],
  tIn: (lang: string, key: string) => string
): InsightKind | null {
  return entry.kind ?? kindFromTitle(entry.title, languages, tIn);
}

export interface LocalizedEntry {
  title: string;
  body: string;
  /** False when the text is the stored snapshot rather than a fresh render. */
  localized: boolean;
}

/**
 * What to PRINT for an entry, in the language selected right now.
 *
 * Three cases, in order:
 *   · `kind` + `params` → both lines rebuilt. Full re-localization.
 *   · `kind` only (legacy, recovered) → the title is rebuilt because titles
 *     interpolate nothing; the body keeps its stored wording, which still holds
 *     the real reading. Half is honest; inventing the numbers would not be.
 *   · neither → stored text, untouched.
 */
export function localizeEntry(
  entry: Pick<AIJournalEntry, 'kind' | 'params' | 'title' | 'body'>,
  t: TFn,
  languages: readonly string[],
  tIn: (lang: string, key: string) => string
): LocalizedEntry {
  const kind = kindOfEntry(entry, languages, tIn);
  if (!kind) return { title: entry.title, body: entry.body, localized: false };

  const keys = INSIGHT_KEYS[kind];
  const title = t(keys.title);
  if (entry.params) {
    return { title, body: t(keys.body, entry.params), localized: true };
  }
  // Recovered legacy row: the title travels, the body cannot.
  return { title, body: entry.body, localized: false };
}
