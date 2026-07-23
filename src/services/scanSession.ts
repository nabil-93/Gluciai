import type { NutritionResult } from '@/types';

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
   *  journal (from the Nutrition page) — the report opens read-only so it
   *  can't be saved twice and the day totals aren't double-counted. */
  alreadySaved?: boolean;
} | null = null;

export function setPendingScan(
  result: NutritionResult,
  imageUri?: string,
  imageSize?: { width: number; height: number },
  base64?: string,
  alreadySaved?: boolean
) {
  pending = { result, imageUri, imageSize, base64, alreadySaved };
}

export function getPendingScan() {
  return pending;
}

export function clearPendingScan() {
  pending = null;
}
