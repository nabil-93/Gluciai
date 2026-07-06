import type { NutritionResult } from '@/types';

/** In-memory handoff between the scanner and the result screen. */
let pending: { result: NutritionResult; imageUri?: string } | null = null;

export function setPendingScan(result: NutritionResult, imageUri?: string) {
  pending = { result, imageUri };
}

export function getPendingScan() {
  return pending;
}

export function clearPendingScan() {
  pending = null;
}
