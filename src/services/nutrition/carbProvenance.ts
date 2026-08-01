/**
 * WHERE A CARBOHYDRATE NUMBER CAME FROM — the one rule, in one place.
 *
 * WHY THIS EXISTS — a bolus is carbohydrate ÷ ratio.
 *
 * Every nutrition source we read is allowed to be silent about carbohydrate.
 * The readers used to answer that silence with `0`, and a `0` is
 * indistinguishable from the `0` that bottled water genuinely declares. The
 * fabricated zero then travelled: shown as "0 g", stored as 0, read back as
 * the day's last meal, and used to pre-fill the bolus carb field — where it
 * produces a 0 U meal bolus for a plate of couscous.
 *
 * So the number is now accompanied by its provenance. The number itself is
 * unchanged (still `0` when unknown, so no arithmetic and no rounding moves);
 * the flag is what carries the truth.
 *
 *   carbs_known === true       real value from the source — INCLUDING a
 *                              declared 0. Water is 0 g and always was.
 *   carbs_known === false      unknown. The 0 is a placeholder and must never
 *                              be displayed as a value or dosed from.
 *   carbs_known === undefined  legacy: written before this field existed.
 *
 * THE LEGACY RULE. A record from before this change carries no flag, and no
 * migration can recover what was never recorded. But a zero-fill cannot
 * produce 42 — so a legacy value that is not zero is unambiguous and stays
 * trusted. Only a legacy ZERO is ambiguous, and only that case is treated
 * cautiously: it is `indeterminate`, which is enough to stop an automatic
 * bolus seed without disturbing anything else. That is why this remediation
 * needs no migration.
 *
 * Pure by design: no imports, so the bolus screen, the result screen and the
 * tests all share one rule and the tests can run in a plain node environment.
 */

/** What we know about a carbohydrate figure. */
export type CarbStatus = 'known' | 'unknown' | 'indeterminate';

/** Anything carrying a carbohydrate figure and (maybe) its provenance. */
export interface CarbBearing {
  carbohydrates?: number;
  carbs_known?: boolean;
}

/**
 * The provenance of one carbohydrate figure.
 *
 * `indeterminate` is reachable only from data written before `carbs_known`
 * existed. Everything produced now sets the flag explicitly.
 */
export function carbStatus(x: CarbBearing | null | undefined): CarbStatus {
  if (!x) return 'unknown';
  if (x.carbs_known === false) return 'unknown';
  if (x.carbs_known === true) return 'known';
  // Legacy record. A non-zero value could not have come from a zero-fill.
  const v = x.carbohydrates;
  if (typeof v === 'number' && Number.isFinite(v) && v !== 0) return 'known';
  return 'indeterminate';
}

/** True when this figure may be used as a carbohydrate value. */
export function isCarbKnown(x: CarbBearing | null | undefined): boolean {
  return carbStatus(x) === 'known';
}

/**
 * Plate-level provenance from the per-food figures.
 *
 * A plate is only as trustworthy as its least-known food: one unknown food
 * means the total is a LOWER BOUND, not a total. Kept deliberately strict —
 * "most of it is known" is not a number anyone should dose from.
 */
export function plateCarbStatus(items: CarbBearing[] | null | undefined): CarbStatus {
  if (!items || items.length === 0) return 'unknown';
  const each = items.map(carbStatus);
  if (each.some((s) => s === 'unknown')) return 'unknown';
  if (each.some((s) => s === 'indeterminate')) return 'indeterminate';
  return 'known';
}

/** Names of the foods whose carbohydrate is explicitly unknown. */
export function unknownCarbNames(
  items: ({ name?: string } & CarbBearing)[] | null | undefined
): string[] {
  return (items ?? [])
    .filter((it) => carbStatus(it) === 'unknown')
    .map((it) => it.name?.trim() || '')
    .filter((n) => n.length > 0);
}

/** How a carbohydrate total should be presented. */
export type CarbDisplay =
  /** A real figure. Render it as it always was. */
  | { kind: 'exact'; grams: number }
  /** Some foods are unknown but the known ones sum to something: a floor. */
  | { kind: 'atLeast'; grams: number }
  /** Nothing usable. Never render this as "0 g". */
  | { kind: 'unknown' };

/**
 * Decide how to present a plate's carbohydrate total.
 *
 * `grams` is passed in rather than re-derived: the aggregation already
 * computed it and this must not become a second place that adds numbers up.
 */
export function carbDisplay(status: CarbStatus, grams: number): CarbDisplay {
  if (status === 'known') return { kind: 'exact', grams };
  // A partially-known plate still knows a floor worth showing; a plate with
  // nothing to show must say so rather than print the placeholder.
  if (grams > 0) return { kind: 'atLeast', grams };
  return { kind: 'unknown' };
}

/**
 * A carbohydrate total as TEXT — "62", "≥ 62" or "—" (finding NUTR-A9).
 *
 * The analysis screen has rendered a floor honestly since Step 10, but the day
 * total, the meal sheet and the home card each printed `result.carbohydrates`
 * directly, so the same plate read "≥ 62 g" on one screen and "62 g" on three
 * others. One rule, one place: a screen that shows a carbohydrate imports this
 * instead of formatting its own.
 *
 * No unit is included, deliberately: "— g" reads as a quantity, which is the
 * thing this whole distinction exists to stop implying. `carbUnit` answers that
 * half.
 */
export function carbText(view: CarbDisplay): string {
  if (view.kind === 'exact') return String(view.grams);
  // A NON-BREAKING space: at 375 px the day total wrapped between the "≥" and
  // its number, which reads as two separate things — and in Arabic the two
  // halves landed on different lines entirely.
  if (view.kind === 'atLeast') return `≥ ${view.grams}`;
  return '—';
}

/** The unit that belongs beside `carbText` — nothing at all when unknown. */
export function carbUnit(view: CarbDisplay): string {
  return view.kind === 'unknown' ? '' : 'g';
}

/**
 * The carbohydrate string the bolus screen may pre-fill from a meal, or
 * `null` when it must leave the field empty.
 *
 * A genuine 0 g meal DOES seed "0" — that is a real value, and the patient
 * asking for a correction-only dose after drinking water should see it.
 * Everything else that is not `known` seeds nothing at all: an empty field
 * is honest, and it keeps a correction-only bolus perfectly usable.
 */
export function seedCarbsFromMeal(meal: CarbBearing | null | undefined): string | null {
  if (!meal || carbStatus(meal) !== 'known') return null;
  const v = meal.carbohydrates;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return String(Math.round(v));
}

/**
 * WHERE the pre-filled carbohydrate came from (finding NUTR-C2).
 *
 * `'program'`  a planned meal handed over by the programme screen through a
 *              route parameter. It is an AI-COMPOSED figure: the app decided it
 *              when it wrote the plan, no database declared it, and — unlike
 *              the meal path below — nothing checked its provenance.
 * `'meal'`     today's most recent scanned meal, and only when its carbohydrate
 *              is `known` (`seedCarbsFromMeal`).
 * `'none'`     nothing could be seeded; the field starts empty.
 */
export type CarbSeedOrigin = 'program' | 'meal' | 'none';

export interface CarbSeed {
  /** Exactly what the field is pre-filled with; `''` means empty. */
  value: string;
  origin: CarbSeedOrigin;
}

/**
 * The bolus screen's pre-fill rule, extracted verbatim from the screen so it
 * can be tested and so the value can be LABELLED.
 *
 * Behaviour is unchanged in every respect, deliberately:
 *   · the route parameter still WINS over the meal seed;
 *   · it is still taken at face value — Step 18 labels it, it does not
 *     sanitize it (that would change a dose input);
 *   · an unknown carbohydrate still seeds nothing, and a genuine 0 g still
 *     seeds "0";
 *   · nothing here gates, confirms or delays the value: whatever is seeded
 *     reaches the engine exactly as it did before.
 */
export function carbSeed(
  handoffCarbs: string | undefined,
  lastMeal: CarbBearing | null | undefined
): CarbSeed {
  if (handoffCarbs) {
    return { value: String(Math.round(Number(handoffCarbs))), origin: 'program' };
  }
  const fromMeal = seedCarbsFromMeal(lastMeal);
  return fromMeal !== null ? { value: fromMeal, origin: 'meal' } : { value: '', origin: 'none' };
}
