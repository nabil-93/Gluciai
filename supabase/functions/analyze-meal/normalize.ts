/**
 * WHAT THE MODEL SAID, AND WHAT IT DID NOT — the vision response contract.
 *
 * Kept in its own module, free of `Deno`, `jsr:` imports and network access, for
 * one reason: this is the code that decides what the app is allowed to believe
 * about a plate, and it must be testable. `index.ts` owns the request, the
 * secrets and the Gemini call; everything here is a pure function of the
 * model's JSON.
 *
 * THE DEFECT THIS FILE EXISTS TO FIX (audit findings N-2, N-3, N-4).
 * The previous normalizer answered every gap with a plausible default:
 *
 *   · an absent carbohydrate became `0` — indistinguishable from the `0`
 *     bottled water genuinely declares, and dosable;
 *   · an absent portion became `100 g`, an absent confidence `0.6`, both
 *     presented to the client exactly like values the model had chosen;
 *   · a truncated response was silently repaired into a SHORTER plate, so a
 *     six-food meal could arrive as three with nothing saying so.
 *
 * The client (Step 10) already refuses to dose a carbohydrate it cannot verify
 * — but it can only refuse what it can SEE, and a server-side `0` looks exactly
 * like a measurement. So the rule here is now: **absence travels**.
 *
 *   · a value the model did not state, or stated unusably, is `null`;
 *   · a value it did state is passed through UNCHANGED — including an
 *     impossible one. Bounds are the client's plausibility layer's job
 *     (Step 11a), where an out-of-range figure becomes explicitly untrusted and
 *     NAMES the food, instead of being quietly clamped into a number that then
 *     looks measured. One layer decides, and it says so out loud.
 *
 * The one exception is `portion_grams`, which is not a nutrient but the factor
 * every nutrient is multiplied by: it stays bounded to the range a person can
 * eat, and both the default and the clamp are reported.
 */

/** The categories the client's `FoodCategory` understands. */
export const CATEGORIES = new Set([
  'Protein', 'Vegetable', 'Fruit', 'Rice', 'Bread', 'Pasta', 'Soup', 'Sauce',
  'Dessert', 'Drink', 'Snack', 'Fast Food', 'Seafood', 'Legumes', 'Dairy',
  'Egg', 'Unknown',
]);

/** A portion a person could eat. Mirrors the client's `plausibility.ts`. */
export const PORTION_MIN = 5;
export const PORTION_MAX = 2000;
/** Used only when the model states no portion at all. */
export const PORTION_DEFAULT = 100;
/** Used only when the model states no confidence at all. Unchanged from the
 *  previous behaviour on purpose: a different number would change which foods
 *  survive the client's 0.4 detection gate. What changes is that the default is
 *  now REPORTED (`confidence_stated: false`) instead of passing for an answer. */
export const CONFIDENCE_DEFAULT = 60;

/**
 * Per-100 g nutrition as the model gave it. `null` means "not stated, or
 * stated unusably" — never `0`, which is a real measurement.
 */
export interface DetectionNutrition {
  /** Always a number: the record is dropped entirely without usable energy. */
  calories: number;
  carbs: number | null;
  protein: number | null;
  fat: number | null;
  sugar: number | null;
  fiber: number | null;
  sodium: number | null;
}

export interface Detection {
  name: string;
  search_name: string;
  category: string;
  /** Bounded to PORTION_MIN..PORTION_MAX. See the two flags below. */
  portion_grams: number;
  /**
   * False when the model stated no usable portion, so `portion_grams` above is
   * this module's default rather than anything observed in the photo.
   */
  portion_grams_stated: boolean;
  /** True when a stated portion was outside the possible range and bounded. */
  portion_grams_clamped?: boolean;
  /** 0..1 for the client. */
  confidence: number;
  /** False when the model stated no usable confidence (see CONFIDENCE_DEFAULT). */
  confidence_stated: boolean;
  bounding_box?: { x: number; y: number; width: number; height: number };
  is_main_food?: boolean;
  /** Uncertain portion — the model's own flag, a low confidence, OR a portion
   *  this module had to default or bound. */
  is_estimated?: boolean;
  alternatives?: string[];
  nutrition_per_100g?: DetectionNutrition;
}

/**
 * The number the model stated, or `null`.
 *
 * Accepts a numeric string (models quote numbers), rejects absence, `null`,
 * `''`, non-numeric text, NaN and Infinity. Does NOT range-check: an
 * impossible-but-stated value travels so the client can say so.
 */
export function numOrNull(v: unknown): number | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'boolean') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
}

/** Clamp for the values that are not nutrients (portion, confidence). */
function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/**
 * Coerce the model's per-100 g estimate, or drop it entirely.
 *
 * Dropping on missing/zero energy is deliberate and unchanged: the prompt asks
 * for a real estimate, and an all-zero object means the model did not fill it
 * in. The client then treats the food as unmatched (visible, zero nutrition,
 * explicitly unknown) rather than as a zero-calorie food.
 */
export function normalizeNutrition(raw: unknown): DetectionNutrition | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const n = raw as Record<string, unknown>;

  const calories = numOrNull(n.calories);
  if (calories === null || calories <= 0) return undefined;

  return {
    calories,
    // `null`, not `0`. This single change is what lets an absent carbohydrate
    // reach the dosing boundary as UNKNOWN.
    carbs: numOrNull(n.carbs),
    protein: numOrNull(n.protein),
    fat: numOrNull(n.fat),
    sugar: numOrNull(n.sugar),
    fiber: numOrNull(n.fiber),
    sodium: numOrNull(n.sodium),
  };
}

/**
 * Convert the model's 0-1000 normalized box into 0-1 FRACTIONS of the image,
 * clamped to bounds. Rejects boxes covering almost the whole image (> 92 % of a
 * side) — those are "I'm not sure where" boxes. Unchanged behaviour.
 */
export function normalizeBox(raw: unknown): Detection['bounding_box'] | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const b = raw as Record<string, unknown>;
  let x = Number(b.x);
  let y = Number(b.y);
  let width = Number(b.width);
  let height = Number(b.height);
  if (![x, y, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
    return undefined;
  }
  x /= 1000;
  y /= 1000;
  width /= 1000;
  height /= 1000;
  x = Math.max(0, Math.min(1, x));
  y = Math.max(0, Math.min(1, y));
  width = Math.min(width, 1 - x);
  height = Math.min(height, 1 - y);
  if (width <= 0.01 || height <= 0.01) return undefined;
  if (width > 0.92 && height > 0.92) return undefined;
  return { x, y, width, height };
}

/** Coerce one raw model food into the client contract, or null to drop it. */
export function normalizeDetection(raw: unknown): Detection | null {
  if (!raw || typeof raw !== 'object') return null;
  const f = raw as Record<string, unknown>;

  const name = String(f.display_name ?? f.name ?? '').trim();
  if (!name) return null;

  const search = String(f.search_name ?? '').trim() || name.toLowerCase();

  // ── Portion: bounded, because every nutrient is multiplied by it — but the
  //    default and the bound are both reported rather than passing for an
  //    observation (finding N-3).
  const statedGrams = numOrNull(f.grams);
  const portionStated = statedGrams !== null;
  const bounded = portionStated
    ? clamp(statedGrams, PORTION_MIN, PORTION_MAX)
    : PORTION_DEFAULT;
  const portionClamped = portionStated && bounded !== statedGrams;

  // ── Confidence: same treatment. The default value is unchanged so the
  //    client's detection gate behaves exactly as before.
  const statedConf = numOrNull(f.confidence);
  const confStated = statedConf !== null;
  const rawConf = clamp(confStated ? statedConf : CONFIDENCE_DEFAULT, 0, 100);
  const confidence = Math.round(rawConf) / 100;

  const rawCat = String(f.category ?? '').trim();
  const category = CATEGORIES.has(rawCat) ? rawCat : 'Unknown';

  const det: Detection = {
    name,
    search_name: search,
    category,
    portion_grams: Math.round(bounded),
    portion_grams_stated: portionStated,
    confidence,
    confidence_stated: confStated,
    is_main_food: f.is_main_food === true,
    // The model's own flag, a low confidence, OR a portion we defaulted or had
    // to bound: in every one of those cases the grams are not an observation.
    is_estimated:
      f.is_estimated === true || confidence < 0.5 || !portionStated || portionClamped,
  };
  if (portionClamped) det.portion_grams_clamped = true;

  if (Array.isArray(f.alternatives)) {
    const alts = f.alternatives
      .map((a) => String(a ?? '').trim().toLowerCase())
      .filter((a) => a.length > 0 && a !== search)
      .slice(0, 3);
    if (alts.length > 0) det.alternatives = [...new Set(alts)];
  }

  const box = normalizeBox(f.bounding_box);
  if (box) det.bounding_box = box;

  const nut = normalizeNutrition(f.nutrition_per_100g);
  if (nut) det.nutrition_per_100g = nut;

  return det;
}

/** Parsed body plus whether it had to be REPAIRED to parse (finding N-4). */
export interface ParsedModelJson {
  data: any;
  /**
   * True when the body was cut off and this module reassembled it. Foods the
   * model listed after the cut are GONE, so the plate is a subset — the caller
   * must pass this on, because a shorter plate means fewer carbohydrates and
   * nothing on screen would otherwise say the meal is incomplete.
   */
  repaired: boolean;
}

/**
 * Parse JSON even when the model wrapped it in ```json fences or prose, and
 * even when the response was cut off mid-array (hit maxOutputTokens on a plate
 * with many foods). A truncated body still yields every food that was FULLY
 * described before the cut — never invented, just fewer — and now says so.
 */
export function parseModelJson(text: string): ParsedModelJson {
  const cleaned = text
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  try {
    return { data: JSON.parse(cleaned), repaired: false };
  } catch {
    // 1 — grab the first {...} block (strips leading/trailing prose). Recovering
    // a complete object from inside prose is not a truncation.
    const start = cleaned.indexOf('{');
    if (start < 0) throw new Error('Model did not return valid JSON');
    const body = cleaned.slice(start);

    const end = cleaned.lastIndexOf('}');
    if (end > start) {
      try {
        return { data: JSON.parse(cleaned.slice(start, end + 1)), repaired: false };
      } catch {
        /* still broken → likely truncated mid-object, try the repair below */
      }
    }

    // 2 — truncated: cut back to the last fully-closed object inside the
    // foods/dishes array, then close the array + root object.
    const lastCompleteObj = body.lastIndexOf('}');
    if (lastCompleteObj > 0) {
      const repaired = `${body.slice(0, lastCompleteObj + 1)}]}`;
      try {
        return { data: JSON.parse(repaired), repaired: true };
      } catch {
        /* fall through */
      }
    }
    throw new Error('Model did not return valid JSON');
  }
}

/* ── Request validation (finding N-9, input side only) ──────────────────── */

/** Base64 image ceiling. A 1024 px JPEG at quality 0.8 is ~200-400 KB of
 *  base64; the raw-camera fallback can be a few MB. 12 MB is generous headroom
 *  and still bounds what one call can spend on the vision model. */
export const MAX_IMAGE_B64_CHARS = 12 * 1024 * 1024;

export type Mode = 'detect' | 'menu';

/** Reject anything that is not a plausible request, WITHOUT touching model
 *  semantics: the prompt, temperature and provider are untouched. */
export function validateRequest(body: unknown):
  | { ok: true; imageBase64: string; language: string; mode: Mode }
  | { ok: false; error: string; status: number } {
  const b = (body ?? {}) as Record<string, unknown>;

  const image = b.image_base64;
  if (typeof image !== 'string' || image.length === 0) {
    return { ok: false, error: 'image_base64 is required', status: 400 };
  }
  if (image.length > MAX_IMAGE_B64_CHARS) {
    return { ok: false, error: 'image_base64 is too large', status: 413 };
  }

  const rawMode = b.mode === undefined ? 'detect' : b.mode;
  if (rawMode !== 'detect' && rawMode !== 'menu') {
    return { ok: false, error: 'mode must be "detect" or "menu"', status: 400 };
  }

  // `language` is interpolated into the prompt, so it is the one string a
  // caller could use to steer the model. A locale tag cannot carry
  // instructions; anything else falls back to English rather than 400, because
  // an unusual locale must never cost a patient their scan.
  const rawLang = typeof b.language === 'string' ? b.language.trim() : '';
  const language = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{2,8})?$/.test(rawLang)
    ? rawLang
    : 'en';

  return { ok: true, imageBase64: image, language, mode: rawMode };
}
