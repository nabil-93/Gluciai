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
} | null = null;

export function setPendingScan(
  result: NutritionResult,
  imageUri?: string,
  imageSize?: { width: number; height: number },
  base64?: string
) {
  pending = { result, imageUri, imageSize, base64 };
}

export function getPendingScan() {
  return pending;
}

export function clearPendingScan() {
  pending = null;
}
