import type { MealType, NutritionResult } from '@/types';

/** In-memory handoff between the scanner and the result screen. */
let pending: {
  result: NutritionResult;
  imageUri?: string;
  /**
   * Pixel size of the image that was actually SENT to the vision model
   * (after resize). This is the coordinate space of the bounding boxes it
   * returned — the overlay must scale from these dimensions, not from the
   * display image's intrinsic size.
   */
  imageSize?: { width: number; height: number };
  /** JPEG base64 of the analyzed photo — uploaded to storage on save */
  base64?: string;
  /** True when the result screen is opened to REVIEW a meal already in the
   *  journal (from the Nutrition page or the home recap) — it can't be saved
   *  twice and the day totals aren't double-counted. */
  alreadySaved?: boolean;
  /** The journal row being reviewed. Carrying it lets the report re-file the
   *  meal under a different slot (lunch → dinner) by PATCHING that row instead
   *  of writing a second copy. */
  savedMeal?: { id: string; mealType?: MealType };
} | null = null;

export function setPendingScan(
  result: NutritionResult,
  imageUri?: string,
  imageSize?: { width: number; height: number },
  base64?: string,
  alreadySaved?: boolean,
  savedMeal?: { id: string; mealType?: MealType }
) {
  pending = { result, imageUri, imageSize, base64, alreadySaved, savedMeal };
}

export function getPendingScan() {
  return pending;
}

export function clearPendingScan() {
  pending = null;
}
