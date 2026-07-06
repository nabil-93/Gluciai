/**
 * Rule-based meal HIGHLIGHTS + glycemic-load bucket. Pure, offline, free.
 *
 * We deliberately do NOT ask the AI for coaching text: the numbers are
 * already computed from the databases, so a local rule is instant, works
 * offline and stays consistent with the meal score. We return STABLE KEYS
 * (e.g. "high_protein") — the React Native app translates them via i18n,
 * so the same scan re-localizes in fr/de/en/ar without re-analysis.
 */

import type { FoodCategory, MealHighlight } from '@/types';

export interface HighlightInput {
  calories: number;
  carbs: number;
  sugar: number;
  protein: number;
  fat: number;
  fiber: number;
  sodium?: number;
  glycemic_index: number;
  /** Categories of the foods on the plate — for composition highlights */
  categories?: FoodCategory[];
}

/**
 * Glycemic Load ≈ (GI × available carbs) / 100. Standard buckets:
 *   GL < 10 → Low, 10–20 → Medium, > 20 → High.
 * When no GI is known we approximate from carbs (assume moderate GI ~55).
 */
export function glycemicLoad(
  carbs: number,
  glycemicIndex: number
): 'Low' | 'Medium' | 'High' {
  const gi = glycemicIndex > 0 ? glycemicIndex : 55;
  const gl = (gi * carbs) / 100;
  if (gl < 10) return 'Low';
  if (gl <= 20) return 'Medium';
  return 'High';
}

const VEGGIE: ReadonlySet<FoodCategory> = new Set<FoodCategory>([
  'Vegetable',
  'Legumes',
]);

/**
 * Produce the plate's highlight keys, positives first then attention
 * points. Order is meaningful — the UI shows them top to bottom.
 */
export function buildHighlights(m: HighlightInput): MealHighlight[] {
  const gl = glycemicLoad(m.carbs, m.glycemic_index);
  const cats = m.categories ?? [];
  const hasVeg = cats.some((c) => VEGGIE.has(c));
  const distinctGroups = new Set(cats.filter((c) => c !== 'Unknown')).size;

  const positives: MealHighlight[] = [];
  const attention: MealHighlight[] = [];

  // ── Positives ──
  if (m.protein >= 25) positives.push('high_protein');
  if (m.fiber >= 6) positives.push('high_fiber');
  if (gl === 'Low') positives.push('low_glycemic_load');
  if (m.sugar <= 5) positives.push('low_sugar');
  if (hasVeg) positives.push('vegetable_rich');
  // A balanced meal: protein + fiber present, sugar controlled, ≥3 groups.
  if (m.protein >= 15 && m.fiber >= 4 && m.sugar <= 15 && distinctGroups >= 3) {
    positives.push('balanced_meal');
  }

  // ── Attention points ──
  if (m.sugar > 30) attention.push('high_sugar');
  if (gl === 'High') attention.push('high_glycemic_load');
  if (m.carbs > 75) attention.push('carb_heavy');
  if (m.protein < 10) attention.push('low_protein');
  if (m.fiber < 3 && m.carbs > 30) attention.push('low_fiber');
  if ((m.sodium ?? 0) > 1000) attention.push('high_sodium');

  // De-dupe while preserving order (positives first).
  return [...new Set([...positives, ...attention])];
}
