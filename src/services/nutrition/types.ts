import type { BoundingBox, FoodCategory, NutritionSource } from '@/types';

/**
 * What the vision model reports for one food on the plate.
 *
 * The model returns a human label (`name` / `display_name`) AND a generic
 * `search_name` — the database chain always searches with `search_name`,
 * never the display label (e.g. "Grilled Salmon" → search "salmon").
 */
export interface DetectedFood {
  /** Food name as detected — shown to the user (any language) */
  name: string;
  /** Generic name used to query the databases (falls back to `name`) */
  search_name?: string;
  /** High-level food category from the vision model (never nutrition) */
  category?: FoodCategory;
  /** Estimated portion in grams */
  portion_grams: number;
  /** Detection confidence 0..1 */
  confidence: number;
  /** Where the food sits in the photo, if the model located it */
  bounding_box?: BoundingBox;
  /** True when this is the plate's main dish (vs a side/garnish/drink) */
  is_main_food?: boolean;
  /** True when the gram estimate is uncertain (hidden/ambiguous portion) */
  is_estimated?: boolean;
  /** Other foods this could be (generic search names) for low-confidence UX */
  alternatives?: string[];
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
  /** The matched record's id in the source database (for corrections) */
  foodId?: string;
  per100g: Per100g;
  source: NutritionSource;
  /** How reliable these values are (0..1) — official DB > crowd > AI */
  nutritionConfidence: number;
  /**
   * Fuzzy similarity 0..100 between the query and `matchedName`.
   * Optional: providers may leave it undefined and let the engine compute it.
   */
  matchScore?: number;
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
