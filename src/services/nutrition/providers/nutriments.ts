import type { BarcodeProduct } from './openfoodfacts';

/* ────────────────────────────────────────────────────────────
 * READING AN OPEN FOOD FACTS `nutriments` MAP
 *
 * Three quirks in that data used to make the scanner say "unknown product"
 * for items that are perfectly well described:
 *
 *  1. Plenty of entries only carry ENERGY IN KILOJOULES. Asking for
 *     `energy-kcal_100g` alone throws them away; kJ ÷ 4.184 recovers them.
 *  2. Some carry per-SERVING values only. Those are usable as soon as the
 *     serving size is known — but they must be scaled to 100 g, never read
 *     as if they already were per 100 g (that silently mis-states carbs,
 *     which is what a bolus is calculated from).
 *  3. A value of ZERO is a real measurement. Bottled water, sugar-free soda
 *     and tea all declare 0 kcal, so "no calories" must be told apart from
 *     "no data" by whether the KEY EXISTS, not by whether it is truthy.
 * ──────────────────────────────────────────────────────────── */

export type Nutriments = Record<string, number | string | undefined>;
export type Per100g = BarcodeProduct['per100g'];

const KJ_PER_KCAL = 4.184;

/**
 * `serving_quantity` is crowd-sourced and regularly nonsense — Sidi Ali, the
 * everyday Moroccan bottled water, declares a 1000 g serving. Believing it
 * both pre-selects a 1 kg portion and mis-derives per-100 g values from
 * per-serving ones, which lands as a tenfold carb figure on the screen a
 * patient doses insulin from. A real single serving of a packaged food sits
 * between a spoonful and half a kilo; outside that we treat it as absent.
 */
export function sanitizeServingGrams(raw: unknown): number | undefined {
  const v = typeof raw === 'number' ? raw : parseFloat(String(raw ?? ''));
  if (!Number.isFinite(v) || v < 5 || v > 500) return undefined;
  return v;
}

function n(map: Nutriments, key: string): number | null {
  const v = map[key];
  if (v === undefined || v === null || v === '') return null;
  const parsed = typeof v === 'number' ? v : parseFloat(String(v));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Per-100 g value for one nutrient, falling back to the per-serving figure
 *  scaled up by the declared serving size. */
function per100(map: Nutriments, key: string, servingGrams?: number): number | null {
  const direct = n(map, `${key}_100g`);
  if (direct !== null) return direct;
  const serving = n(map, `${key}_serving`);
  if (serving !== null && servingGrams && servingGrams > 0) {
    return (serving / servingGrams) * 100;
  }
  return null;
}

/** kcal per 100 g from whichever of the energy fields the entry happens to
 *  carry: kcal, then kJ, then the per-serving twins of both. */
function energyPer100(map: Nutriments, servingGrams?: number): number | null {
  const kcal = per100(map, 'energy-kcal', servingGrams);
  if (kcal !== null) return kcal;

  const kj =
    per100(map, 'energy-kj', servingGrams) ?? per100(map, 'energy', servingGrams);
  if (kj !== null) return kj / KJ_PER_KCAL;

  return null;
}

const round1 = (v: number) => Math.round(v * 10) / 10;

export interface ReadNutriments {
  per100g: Per100g;
  /** True when the entry actually declares energy — including a declared 0
   *  (water), which is data, not a gap. */
  hasEnergy: boolean;
  /** How many of the seven values came from the source rather than a zero
   *  default. Lets the UI say how complete the entry is. */
  fieldsFound: number;
}

export function readNutriments(
  map: Nutriments | undefined,
  servingGrams?: number
): ReadNutriments {
  const m = map ?? {};
  const energy = energyPer100(m, servingGrams);
  const carbs = per100(m, 'carbohydrates', servingGrams);
  const sugar = per100(m, 'sugars', servingGrams);
  const protein = per100(m, 'proteins', servingGrams);
  const fat = per100(m, 'fat', servingGrams);
  const fiber = per100(m, 'fiber', servingGrams);
  // Sodium is published in grams; entries that only list salt carry the same
  // thing multiplied by 2.5.
  const sodiumDirect = per100(m, 'sodium', servingGrams);
  const salt = per100(m, 'salt', servingGrams);
  const sodiumG =
    sodiumDirect !== null ? sodiumDirect : salt !== null ? salt / 2.5 : null;

  const found = [energy, carbs, sugar, protein, fat, fiber, sodiumG].filter(
    (v) => v !== null
  ).length;

  return {
    per100g: {
      calories: energy === null ? 0 : Math.round(energy),
      carbs: carbs === null ? 0 : round1(carbs),
      sugar: sugar === null ? 0 : round1(sugar),
      protein: protein === null ? 0 : round1(protein),
      fat: fat === null ? 0 : round1(fat),
      fiber: fiber === null ? 0 : round1(fiber),
      sodium: sodiumG === null ? 0 : Math.round(sodiumG * 1000),
    },
    hasEnergy: energy !== null,
    fieldsFound: found,
  };
}

/**
 * The same barcode reaches us in different shapes: a UPC-A read as 12 digits
 * is the same product as the EAN-13 that is that code with a leading zero,
 * and some scanners hand back codes padded to 14. Trying the variants turns
 * "unknown" into a hit without any extra database.
 */
export function barcodeVariants(raw: string): string[] {
  const code = raw.replace(/\D/g, '');
  if (!code) return [];
  const out = new Set<string>([code]);
  if (code.length === 12) out.add(`0${code}`);
  if (code.length === 13 && code.startsWith('0')) out.add(code.slice(1));
  if (code.length === 14 && code.startsWith('0')) out.add(code.slice(1));
  if (code.length === 13) out.add(`0${code}`);
  return [...out];
}
