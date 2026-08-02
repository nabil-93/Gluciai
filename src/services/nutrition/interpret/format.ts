/**
 * NUTRIENT RENDERING — the one place a nutrient figure becomes text.
 *
 * PHASE 3 of the interpretation refactor (docs/ARCHITECTURE-INTERPRETATION-AUDIT.md
 * §6). `carbProvenance` has owned the RULE since Step 10; what it never owned
 * was the ASSEMBLY, so four screens each wrote their own
 * `${carbText(v)}${carbUnit(v) ? ` ${carbUnit(v)}` : ''}`. One of them wrote it
 * without the space. That is what `carbFigure` ends.
 *
 * Byte-for-byte: `carbFigure` produces exactly the string those sites produce
 * today — "62 g", "≥ 62 g", "—". The one site that deliberately renders without
 * a space (the home ring's compact sub-label) keeps composing `text` and `unit`
 * itself rather than being quietly normalised into the spaced form.
 *
 * ── THE SIX SURFACES THIS FILE DOES **NOT** YET REACH ───────────────────────
 *
 * `day.tsx`, `journal.tsx`, `program-day.tsx`, `report.tsx`, `weeklyReport.ts`
 * and the doctor panel still print `Math.round(result.carbohydrates)` raw, so a
 * floor reaches a clinician as a total (finding S1-7). Routing them through
 * here is a ONE-LINE change per site — and it is a VISIBLE one: "62 g" becomes
 * "≥ 62 g" on six screens. Phase 3 was scoped "no behaviour changes", so the
 * migration stops at the seam and the six sites are pinned as known-bad in
 * tests/domain/interpretationInventory.golden.test.ts.
 *
 * A pure leaf module: it re-exports the rule and adds no arithmetic.
 */

import {
  carbDisplay,
  carbText,
  carbUnit,
  type CarbDisplay,
  type CarbStatus,
} from '../carbProvenance';

export {
  carbDisplay,
  carbSeed,
  carbStatus,
  carbText,
  carbUnit,
  isCarbKnown,
  plateCarbStatus,
  seedCarbsFromMeal,
  unknownCarbNames,
  type CarbBearing,
  type CarbDisplay,
  type CarbSeed,
  type CarbSeedOrigin,
  type CarbStatus,
} from '../carbProvenance';

/**
 * A carbohydrate total ready to render: the figure, its unit, and the two
 * joined the way every screen already joins them.
 *
 * `full` is `"62 g"` / `"≥ 62 g"` / `"—"`. The unit is omitted entirely when
 * there is no figure, because "— g" reads as a quantity — the exact implication
 * the provenance rule exists to stop.
 */
export interface CarbFigure {
  text: string;
  unit: string;
  full: string;
}

/** Render a `CarbDisplay`. The single assembly, replacing four hand-written ones. */
export function carbFigure(view: CarbDisplay): CarbFigure {
  const text = carbText(view);
  const unit = carbUnit(view);
  return { text, unit, full: unit ? `${text} ${unit}` : text };
}

/** `carbFigure` straight from a status and a gram total — the common call. */
export function carbFigureOf(status: CarbStatus, grams: number): CarbFigure {
  return carbFigure(carbDisplay(status, grams));
}
