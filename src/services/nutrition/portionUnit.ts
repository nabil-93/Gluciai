/**
 * MILLILITRES ARE A WAY OF WRITING A PORTION, NOT A SECOND SOURCE OF TRUTH.
 *
 * A patient asked, reasonably, why a drink is measured in grams: nobody pours
 * 250 g of milk. So a portion can now be DISPLAYED and EDITED in ml, per food,
 * independently of the rest of the plate.
 *
 * THE RULE THAT MAKES THIS SAFE — `portion_grams` stays the only quantity the
 * app computes with. Every nutrition value in this codebase is per 100 GRAMS,
 * and the bolus is seeded from grams of carbohydrate. So:
 *
 *   · switching a food from g to ml, or back, NEVER changes how much food there
 *     is. 100 g of milk becomes "97 ml" — the same milk, written differently.
 *     Nutrition does not move, the score does not move, the dose does not move.
 *   · only EDITING the number changes the portion. Type 200 ml and the food
 *     becomes 200 × density grams, and everything recomputes from there, through
 *     the same path a typed gram value already takes.
 *
 * That asymmetry is the whole design. A unit toggle that silently re-weighed the
 * plate would be a dosing bug wearing a formatting feature's clothes.
 *
 * ABOUT THE DENSITIES — they are nominal values at room temperature, and they
 * are deliberately few. Water, and almost every aqueous drink a patient logs
 * (soda, juice, tea, coffee, broth), sit within a few percent of 1.00 g/ml, so
 * 1.00 is the default and the honest answer for most of the list. Only the
 * liquids that are genuinely far from water are named, because a density table
 * invented food by food would be exactly the kind of confident guessing the rest
 * of this codebase refuses to do.
 */
import type { FoodCategory, FoodItemResult } from '@/types';

/** How a portion is written. Grams remain what it is computed in. */
export type PortionUnit = 'g' | 'ml';

/** Fallback density, g per ml: water, and near enough for most drinks. */
export const DEFAULT_DENSITY = 1.0;

/**
 * Nominal densities (g/ml) for the liquids that are NOT water-like. Keyed by
 * substrings of the English `search_name` — the vision model is instructed to
 * always return that field in English, so this stays a single-language table
 * instead of five that drift.
 *
 * Ordered most specific first: "olive oil" must not be read as "oil"… which
 * here happens to be the same number, but the ordering is the contract.
 */
const DENSITY_BY_KEYWORD: readonly (readonly [string, number])[] = [
  // Fats — the largest honest deviation downward.
  ['olive oil', 0.91],
  ['vegetable oil', 0.92],
  ['oil', 0.92],
  // Sugars and syrups — the largest deviation upward.
  ['honey', 1.42],
  ['maple syrup', 1.33],
  ['syrup', 1.33],
  // Dairy, slightly denser than water because of its solids.
  ['condensed milk', 1.29],
  ['yogurt', 1.03],
  ['milk', 1.03],
  ['cream', 1.01],
  // Sweetened aqueous drinks carry dissolved sugar.
  ['juice', 1.05],
  ['soda', 1.04],
  ['cola', 1.04],
];

/**
 * Grams per millilitre for a food. Falls back to water (1.00) whenever the
 * food is not one of the few named above — including when it is not a liquid
 * at all, so a patient who switches a solid to ml still gets a number that is
 * self-consistent rather than a refusal.
 */
export function densityFor(item: {
  search_name?: string;
  name?: string;
  category?: FoodCategory;
}): number {
  const hay = `${item.search_name ?? ''} ${item.name ?? ''}`.toLowerCase();
  for (const [needle, d] of DENSITY_BY_KEYWORD) {
    if (hay.includes(needle)) return d;
  }
  return DEFAULT_DENSITY;
}

/**
 * The unit a food should arrive in when nothing has been chosen for it.
 *
 * Only `Drink` — the one category that is a liquid by definition. A soup is
 * eaten with a spoon and a sauce is spooned onto food; both stay in grams
 * unless the patient says otherwise, which they can, per food.
 */
export function defaultUnitFor(item: { category?: FoodCategory }): PortionUnit {
  return item.category === 'Drink' ? 'ml' : 'g';
}

/** The unit to SHOW for an item: its own choice if it made one, else the default. */
export function unitOf(item: Pick<FoodItemResult, 'portion_unit' | 'category'>): PortionUnit {
  return item.portion_unit ?? defaultUnitFor(item);
}

/**
 * Grams → the number shown in `unit`. Rounded, because a portion written to
 * three decimals reads as a precision nobody measured.
 */
export function gramsToUnit(grams: number, unit: PortionUnit, density: number): number {
  if (unit === 'g') return Math.round(grams);
  const d = density > 0 ? density : DEFAULT_DENSITY;
  return Math.round(grams / d);
}

/** The number the patient typed in `unit` → grams, which is what is stored. */
export function unitToGrams(value: number, unit: PortionUnit, density: number): number {
  if (unit === 'g') return value;
  const d = density > 0 ? density : DEFAULT_DENSITY;
  return value * d;
}

/**
 * "180 g" / "250 ml" — the portion as it should appear anywhere a food is
 * listed. One function so the analysis screen, the PDF, the program's meal
 * card and the editor cannot disagree about the same plate.
 */
export function formatPortion(
  item: Pick<FoodItemResult, 'portion_grams' | 'portion_unit' | 'category' | 'name' | 'search_name'>
): string {
  const unit = unitOf(item);
  return `${gramsToUnit(item.portion_grams, unit, densityFor(item))} ${unit}`;
}
