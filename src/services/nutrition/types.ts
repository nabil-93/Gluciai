import type { NutritionSource } from '@/types';

/** What the vision model reports for one food on the plate. */
export interface DetectedFood {
  /** Food name as detected (any language) */
  name: string;
  /** Estimated portion in grams */
  portion_grams: number;
  /** Detection confidence 0..1 */
  confidence: number;
}

/** Normalized nutrition values per 100 g. */
export interface Per100g {
  calories: number;
  carbs: number;
  sugar: number;
  protein: number;
  fat: number;
  fiber: number;
  /** mg per 100 g */
  sodium?: number;
  glycemic_index?: number;
}

/** A successful database match. */
export interface ProviderHit {
  matchedName: string;
  per100g: Per100g;
  source: NutritionSource;
  /** How reliable these values are (0..1) — official DB > crowd > AI */
  nutritionConfidence: number;
}

/**
 * A pluggable nutrition database (repository pattern).
 * New countries/databases implement this interface and register
 * themselves in the engine's provider chain — no other code changes.
 */
export interface NutritionProvider {
  readonly id: NutritionSource;
  readonly label: string;
  search(query: string): Promise<ProviderHit | null>;
}
