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
 * Apply the user's eating habits to fresh detections: when a learned
 * portion exists for a food, it replaces the vision estimate.
 */
export function applyPortionLearning<T extends DetectedFood>(
  detections: T[]
): { detections: T[]; adjusted: string[] } {
  const adjusted: string[] = [];
  const result = detections.map((d) => {
    const learned = getLearnedPortion(d.name);
    if (learned && Math.abs(learned - d.portion_grams) > 10) {
      adjusted.push(d.name);
      return { ...d, portion_grams: learned };
    }
    return d;
  });
  return { detections: result, adjusted };
}
