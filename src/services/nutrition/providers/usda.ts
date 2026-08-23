import { usdaRemoteProvider } from './remote';

/**
 * USDA FoodData Central — the official US database, reached through the
 * `nutrition-search` Edge Function.
 *
 * F-1: THE KEY USED TO SHIP INSIDE THE APP. This module previously held
 *
 *     const API_KEY = process.env.EXPO_PUBLIC_USDA_API_KEY || 'DEMO_KEY';
 *
 * and called `api.nal.usda.gov` straight from the device. Anything named
 * `EXPO_PUBLIC_*` is inlined into the bundle at build time, so the key was
 * extractable from a distributed APK — and the `DEMO_KEY` fallback silently
 * capped a misconfigured build at 30 requests/hour, which the never-throw
 * provider chain then hid as "USDA rarely matches".
 *
 * The key now lives only in the Edge Function's secrets, beside FatSecret's
 * and Edamam's, and this provider is a thin client exactly like theirs.
 *
 * WHAT DID NOT CHANGE. The provider id stays `'usda'`, so `NutritionSource`,
 * `SOURCE_LABEL`, provenance and every downstream consumer are untouched. The
 * confidence stays 0.95, so the engine's ordering is identical. The absent-vs
 * -measured nutrient distinction is preserved end to end: the function returns
 * `null` for a nutrient FDC does not publish, and `makeRemoteProvider` reads
 * that absence into `carbs_known`/`known` exactly as before.
 */
export const usdaProvider = usdaRemoteProvider;
