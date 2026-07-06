import { useAppStore } from '@/store/useAppStore';
import type { FoodCorrection } from '@/types';

import type { DetectedFood } from './types';

/**
 * Learning layer: reads user corrections (stored separately — official
 * database values are never touched) and adjusts FUTURE predictions.
 *
 * Portion learning: if the user repeatedly corrects the portion of a
 * food (AI says 250 g, user says 180 g), the median of their
 * corrections becomes the default estimate for that food.
 */

function id() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Normalize a food name into a stable learning key. */
export function foodKey(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Record a user correction (never overwrites database values). */
export function recordCorrection(
  foodName: string,
  field: FoodCorrection['field'],
  aiValue: string | number,
  userValue: string | number
) {
  if (String(aiValue) === String(userValue)) return;
  useAppStore.getState().addCorrection({
    id: id(),
    food_key: foodKey(foodName),
    field,
    ai_value: String(aiValue),
    user_value: String(userValue),
    created_at: new Date().toISOString(),
  });
}

/**
 * Learned search term for a food. When the user corrects what a food IS
 * (its detected name) or which database record it should match, we store
 * the corrected value keyed by the original detected name. Future scans of
 * that same food reuse the correction instead of the vision guess.
 *
 * Returns the most recent correction (latest wins — the user's newest
 * intent is the most reliable).
 */
export function getLearnedSearchName(detectedName: string): string | null {
  const key = foodKey(detectedName);
  const corr = useAppStore
    .getState()
    .corrections.find(
      (c) =>
        (c.field === 'identity' || c.field === 'search_name') &&
        c.food_key === key &&
        c.user_value.trim().length > 0
    );
  return corr ? corr.user_value : null;
}

/**
 * Record that the user changed a food's identity (the detected food or the
 * matched database food). `correctedSearchName` is what future scans should
 * search with. Stored separately — official DB values are never touched.
 */
export function recordIdentityCorrection(
  originalDetectedName: string,
  correctedSearchName: string
) {
  recordCorrection(
    originalDetectedName,
    'identity',
    originalDetectedName,
    correctedSearchName
  );
}

/**
 * A remembered correction the UI can offer back to the user
 * ("Use your previous correction?") before applying it automatically.
 */
export interface CorrectionSuggestion {
  /** What future search should use instead of the detected name */
  searchName?: string;
  /** Learned portion in grams, if the user has a habit for this food */
  portionGrams?: number;
  /** How many past corrections back this suggestion (confidence signal) */
  timesCorrected: number;
}

/**
 * Look up whether the user has previously corrected a similar food. Returns
 * a suggestion the Scan Result screen can confirm with the user before
 * reusing it — this is the "prioritize previous correction" step, made
 * explicit rather than silent so the user stays in control.
 */
export function getSuggestedCorrection(
  detectedName: string
): CorrectionSuggestion | null {
  const key = foodKey(detectedName);
  const mine = useAppStore
    .getState()
    .corrections.filter((c) => c.food_key === key);
  if (mine.length === 0) return null;

  const identity = mine.find(
    (c) =>
      (c.field === 'identity' || c.field === 'search_name') &&
      c.user_value.trim().length > 0
  );
  const portionGrams = getLearnedPortion(detectedName) ?? undefined;

  if (!identity && portionGrams === undefined) return null;
  return {
    searchName: identity?.user_value,
    portionGrams,
    timesCorrected: mine.length,
  };
}

/**
 * Learned portion for a food (grams), from the user's own corrections.
 * Requires at least 2 corrections to trust the habit; returns the median.
 */
export function getLearnedPortion(foodName: string): number | null {
  const key = foodKey(foodName);
  const values = useAppStore
    .getState()
    .corrections.filter((c) => c.field === 'portion' && c.food_key === key)
    .map((c) => Number(c.user_value))
    .filter((v) => Number.isFinite(v) && v > 0)
    .sort((a, b) => a - b);

  if (values.length < 2) return null;
  const mid = Math.floor(values.length / 2);
  return values.length % 2
    ? values[mid]
    : Math.round((values[mid - 1] + values[mid]) / 2);
}

/**
 * Apply the user's learned habits to fresh detections BEFORE the database
 * search:
 *   • identity/search_name corrections → override the search term used to
 *     look the food up (so a food the user re-identified matches correctly);
 *   • portion corrections → replace the vision gram estimate with the
 *     learned median.
 * Official database values are never touched — only what we search for and
 * the portion we assume.
 */
export function applyPortionLearning<T extends DetectedFood>(
  detections: T[]
): { detections: T[]; adjusted: string[] } {
  const adjusted: string[] = [];
  const result = detections.map((d) => {
    let next: T = d;

    // 1 — Identity: reuse the user's corrected search term for this food.
    const learnedSearch = getLearnedSearchName(d.name);
    if (learnedSearch && learnedSearch !== (d.search_name ?? d.name)) {
      next = { ...next, search_name: learnedSearch };
    }

    // 2 — Portion: reuse the learned median grams.
    const learned = getLearnedPortion(d.name);
    if (learned && Math.abs(learned - d.portion_grams) > 10) {
      adjusted.push(d.name);
      next = { ...next, portion_grams: learned };
    }

    return next;
  });
  return { detections: result, adjusted };
}
