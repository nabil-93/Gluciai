import type { MealType } from '@/types';

/**
 * One-shot hand-off from the programme screen to the bolus calculator.
 *
 * WHY THIS EXISTS — privacy, not architecture (finding BOLUS-A1).
 *
 * The programme screen used to reach `/bolus` with `params: { carbs, meal }`,
 * which on web means a carbohydrate figure — a DOSE INPUT — ends up in the URL:
 * browser history on a shared computer, the `Referer` header of the next
 * outbound request, and the web server's access log. It is also tamperable
 * there, before the engine ever reads it.
 *
 * This is the same mechanism Step 9 introduced for the programme wizard
 * (`programDraft.ts`), applied to the one remaining route that carried a
 * clinical value.
 *
 * THE VALUES ARE UNCHANGED, and the strings are kept in exactly the shape the
 * route params had — `carbs` is still the rounded string the sender produced,
 * `meal` is still the slot name — so `carbSeed`, `parseDecimal` and every
 * `isMealType(...)` check on the consuming side behave identically. Step 18's
 * seed-origin rule reads this hand-off exactly where it used to read the query
 * string, so a programme-seeded value is still labelled as programme-derived and
 * an unknown carbohydrate still seeds nothing.
 *
 * DELIBERATELY NOT PERSISTED. No AsyncStorage, no zustand `persist`. Writing a
 * carbohydrate to disk would be a new copy of health data to protect, and every
 * persisted store in this app needs account scoping (`accountUserId` /
 * `adoptUser`) to stop a shared phone leaking one account's data to the next. A
 * module-level value avoids both problems: it dies with the JS context.
 *
 * CONSEQUENCE, accepted: reloading `/bolus` on web no longer re-seeds the field,
 * because the hand-off is gone with the previous JS context. That is the same
 * trade Step 9 made — the screen simply falls back to its own defaults, exactly
 * as it does when arriving with no parameter at all.
 */

/** Exactly the fields the route params carried, in their original form. */
export interface BolusHandoff {
  /** Rounded grams, as a string — the shape the query string carried. */
  carbs?: string;
  /** Which meal the programme says this dose is for. */
  meal?: MealType;
}

let pending: BolusHandoff | null = null;

/** Stage a planned meal for the bolus screen. Overwrites any previous. */
export function setBolusHandoff(handoff: BolusHandoff): void {
  pending = { ...handoff };
}

/**
 * Read the staged values and clear them — one shot.
 *
 * Returns an empty object when nothing is staged, so the consumer falls back to
 * its own defaults exactly as it did when a route param was absent.
 */
export function consumeBolusHandoff(): BolusHandoff {
  const handoff = pending;
  pending = null;
  return handoff ?? {};
}

/** Discard anything staged, e.g. when the navigation is abandoned. */
export function clearBolusHandoff(): void {
  pending = null;
}

/** Whether values are currently staged. Does not consume them. */
export function hasBolusHandoff(): boolean {
  return pending !== null;
}
