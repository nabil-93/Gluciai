/**
 * Lightweight fuzzy food-name matching — no external dependency.
 *
 * Two jobs:
 *   (a) normalizeSearchName(): reduce a rich display label into the best
 *       generic database query — dropping cooking methods, country prefixes,
 *       qualifiers and fixing plurals, WITHOUT destroying meaningful foods
 *       like "brown rice" / "sweet potato" / "olive oil";
 *   (b) matchScore(): score how close a database record is to what we
 *       searched for (for `matched_food` / `match_score` provenance),
 *       tolerant of plural/singular, synonyms and small spelling mistakes.
 *
 * The word lists, protected phrases, synonyms and singularizer live in
 * foodNames.ts so the vocabulary can grow without touching this logic.
 */

import {
  canonicalToken,
  DROP_WORDS,
  PHRASE_SYNONYMS,
  PROTECTED_PHRASES,
  singularize,
} from './foodNames';

/** Strip accents/diacritics so "grillé" == "grille", "poêlé" == "poele". */
function stripAccents(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/** Lowercase, strip accents, turn punctuation/hyphens into spaces, collapse. */
function clean(raw: string): string {
  return stripAccents(raw.toLowerCase())
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Break a food name into meaningful, canonical tokens: cleaned → drop
 * cooking/country/filler words → singularize → apply synonyms.
 * Used by matchScore (order-independent comparison).
 */
export function tokenize(raw: string): string[] {
  return clean(raw)
    .split(' ')
    .filter((w) => w.length > 1 && !DROP_WORDS.has(w))
    .map((w) => canonicalToken(singularize(w)))
    .filter((w) => w.length > 0);
}

/** Find a protected phrase inside a cleaned string, if any. */
function protectedPhraseIn(cleaned: string): string | null {
  for (const phrase of PROTECTED_PHRASES) {
    // word-boundary contains
    if (
      cleaned === phrase ||
      cleaned.startsWith(phrase + ' ') ||
      cleaned.endsWith(' ' + phrase) ||
      cleaned.includes(' ' + phrase + ' ')
    ) {
      return phrase;
    }
  }
  return null;
}

/**
 * Reduce a display name to the best generic search term.
 *   "Roasted Salmon"            → "salmon"
 *   "Grilled Chicken Breast"    → "chicken breast"   (protected phrase kept)
 *   "Moroccan Couscous"         → "couscous"
 *   "Greek Yogurt"              → "yogurt"
 *   "Cherry Tomatoes"           → "tomato"
 *   "Brown Rice" / "Sweet Potato" / "Olive Oil"      → unchanged (protected)
 *
 * Primarily a client-side safety net: the vision model is the main source
 * of `search_name`, this refines it (or fills in when the model omits it).
 */
export function normalizeSearchName(displayName: string): string {
  const cleaned = clean(displayName);
  if (!cleaned) return displayName.trim().toLowerCase();

  // 0 — Whole-name reduction for variety/qualifier compounds we can't drop
  //     token-by-token safely ("cherry tomatoes" → "tomato").
  if (PHRASE_SYNONYMS[cleaned]) return PHRASE_SYNONYMS[cleaned];

  // 1 — If a nutritionally-meaningful phrase is present, prefer it verbatim,
  //     so "grilled chicken breast" keeps "chicken breast" and "brown rice"
  //     / "french fries" are never reduced. Protected phrases are canonical
  //     database terms already → don't singularize (keeps "french fries").
  const phrase = protectedPhraseIn(cleaned);
  if (phrase) return phrase;

  // 2 — Otherwise drop qualifiers, singularize and canonicalize, keeping
  //     the remaining words IN ORDER (so "chicken breast" stays natural).
  const kept = cleaned
    .split(' ')
    .filter((w) => w.length > 1 && !DROP_WORDS.has(w))
    .map((w) => canonicalToken(singularize(w)));

  // Never return empty — fall back to the cleaned string if we dropped all.
  const result = kept.join(' ').trim();
  return result || cleaned;
}

/** Character-bigram set of a token, for near-spelling similarity. */
function bigrams(token: string): Set<string> {
  const out = new Set<string>();
  for (let i = 0; i < token.length - 1; i++) out.add(token.slice(i, i + 2));
  return out;
}

/** Dice coefficient between two token bigram sets (0..1). */
function bigramSim(a: string, b: string): number {
  if (a === b) return 1;
  const A = bigrams(a);
  const B = bigrams(b);
  if (A.size === 0 || B.size === 0) return 0;
  let inter = 0;
  for (const g of A) if (B.has(g)) inter++;
  return (2 * inter) / (A.size + B.size);
}

/**
 * Similarity 0..100 between a query and a candidate food name.
 *   100 = every query token has a strong counterpart in the candidate.
 * Robust to case, plurals, synonyms, accents, hyphens and cooking/country
 * qualifiers, and tolerant of small spelling differences (bigram overlap).
 */
export function matchScore(query: string, candidate: string): number {
  const q = tokenize(query);
  const c = tokenize(candidate);
  if (q.length === 0 || c.length === 0) return 0;

  // For each query token, take its best token-level similarity in candidate.
  let sum = 0;
  for (const qt of q) {
    let best = 0;
    for (const ct of c) {
      const s = qt === ct ? 1 : bigramSim(qt, ct);
      if (s > best) best = s;
      if (best === 1) break;
    }
    sum += best;
  }
  const coverage = sum / q.length; // how well the query is covered

  // Small bonus when the candidate isn't padded with many extra tokens.
  const brevity = Math.min(1, q.length / c.length);
  const score = coverage * 0.85 + brevity * 0.15;
  return Math.round(Math.max(0, Math.min(1, score)) * 100);
}
