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
 * THE LIQUIDS THIS APP KNOWS, and what a millilitre of each weighs.
 *
 * One table answers two questions — "should this food offer ml at all?" and
 * "how much does its ml weigh?" — because two lists would eventually disagree
 * about whether oil is a liquid.
 *
 * Keyed by substrings of the English `search_name`: the vision model is
 * instructed to always return that field in English, so this stays a
 * single-language table instead of five that drift.
 *
 * Ordered most specific first — "olive oil" must be read before "oil".
 */
const LIQUIDS: readonly (readonly [string, number])[] = [
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
  ['yogurt drink', 1.03],
  ['milk', 1.03],
  ['cream', 1.01],
  // Sweetened aqueous drinks carry dissolved sugar.
  ['juice', 1.05],
  ['smoothie', 1.05],
  ['lemonade', 1.04],
  ['soda', 1.04],
  ['cola', 1.04],
  // Water and what is mostly water.
  ['water', 1.0],
  ['tea', 1.0],
  ['coffee', 1.0],
  ['broth', 1.0],
  ['vinegar', 1.01],
];

/**
 * Words that mean "liquid" in the languages the app ships, for the one case
 * the English table cannot serve: a food the PATIENT typed by hand, where
 * there is no `search_name` and `name` is in their own language.
 *
 * This list is allowed to be looser than the density table above, and the
 * difference in rigour is deliberate. Being wrong here costs a unit button
 * that should not be offered, or one that should have been — cosmetic. Being
 * wrong about a DENSITY changes a number. Different stakes, different bars.
 */
const LIQUID_WORDS: readonly string[] = [
  // fr
  'huile', 'lait', 'jus', 'eau', 'thé', 'the', 'café', 'cafe', 'sirop', 'miel', 'crème', 'creme',
  'bouillon', 'vinaigre',
  // de — the ones that stand alone
  'tee', 'kaffee', 'wasser', 'milch', 'saft', 'öl', 'sirup', 'honig', 'sahne', 'brühe', 'essig',
  // ar
  'زيت', 'حليب', 'عصير', 'ماء', 'شاي', 'قهوة', 'عسل', 'كريمة', 'مرق', 'خل',
];

/**
 * German glues the head noun onto the end: "Olivenöl", "Vollmilch",
 * "Orangensaft" are single words, so whole-word matching cannot see them.
 * These are therefore matched as a word ENDING.
 *
 * Only German gets this rule, and that is not an oversight. Applied to French
 * it would be a disaster — "eau" ends "gâteau", "chapeau", "morceau" — which
 * is exactly why the two lists are separate instead of one loose regex.
 */
const LIQUID_WORD_ENDINGS: readonly string[] = [
  'öl', 'milch', 'saft', 'wasser', 'sirup', 'honig', 'sahne', 'brühe', 'essig',
];

/**
 * Grams per millilitre for a food. Falls back to water (1.00) whenever the
 * food is not one of the few named above — including when it is not a liquid
 * at all, so a patient who switches a solid to ml still gets a number that is
 * self-consistent rather than a refusal.
 */
/**
 * What a food is called, as WHOLE WORDS, padded so a match can be anchored.
 *
 * Substring matching was the first attempt and it was wrong in a way a test
 * caught immediately: "steak" contains "tea", "watermelon" contains "water",
 * and "boiled egg" contains "oil". Every one of those would have offered a
 * millilitre switch on a solid. Punctuation is flattened too, so
 * "Huile d'olive" tokenises to " huile d olive " and still matches "huile".
 */
function words(item: { search_name?: string; name?: string }): string {
  const raw = `${item.search_name ?? ''} ${item.name ?? ''}`.toLowerCase();
  return ` ${raw.replace(/[^\p{L}\p{N}]+/gu, ' ').trim()} `;
}

/** True when `needle` (one word, or a phrase) appears as whole words in `hay`. */
const hasWord = (hay: string, needle: string) => hay.includes(` ${needle} `);

/** True when some word in `hay` ENDS with `needle` — German compounds only. */
const hasWordEnding = (hay: string, needle: string) => hay.includes(`${needle} `);

export function densityFor(item: {
  search_name?: string;
  name?: string;
  category?: FoodCategory;
}): number {
  const hay = words(item);
  for (const [needle, d] of LIQUIDS) {
    if (hasWord(hay, needle)) return d;
  }
  return DEFAULT_DENSITY;
}

/**
 * Is this something a person POURS?
 *
 * Only these get the g/ml switch. Offering it on a steak would be noise on
 * every row of every plate to serve the rare food that needs it; a patient
 * scanning a drink should simply find it already in ml.
 *
 * `Drink` is a liquid by category. Everything else has to be named — in
 * English by the vision model, or in the patient's own language when they
 * typed it themselves.
 */
export function isLiquid(item: {
  search_name?: string;
  name?: string;
  category?: FoodCategory;
}): boolean {
  if (item.category === 'Drink') return true;
  const hay = words(item);
  if (!hay.trim()) return false;
  if (LIQUIDS.some(([needle]) => hasWord(hay, needle))) return true;
  if (LIQUID_WORDS.some((w) => hasWord(hay, w))) return true;
  return LIQUID_WORD_ENDINGS.some((w) => hasWordEnding(hay, w));
}

/**
 * The unit a food arrives in when nothing has been chosen for it: ml for
 * anything pourable, grams for everything else. A scanned bottle of oil or
 * glass of milk is therefore already in ml, with no tap required.
 */
export function defaultUnitFor(item: {
  search_name?: string;
  name?: string;
  category?: FoodCategory;
}): PortionUnit {
  return isLiquid(item) ? 'ml' : 'g';
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
