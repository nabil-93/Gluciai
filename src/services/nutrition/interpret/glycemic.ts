/**
 * GLYCEMIC INTERPRETATION — the one place that turns a GI or a GL into a band.
 *
 * PHASE 2 of the interpretation refactor (docs/ARCHITECTURE-INTERPRETATION-AUDIT.md
 * §1 §2). Nothing here is new: every threshold, every colour and every fallback
 * is lifted BYTE-FOR-BYTE from the site that already owned it. What changes is
 * that there is now exactly one copy.
 *
 * A pure leaf module on purpose — it imports nothing, so `advice.ts`,
 * `engine.ts`, the screens and the tests can all read it without a cycle and
 * without a runtime.
 *
 * WHAT THIS FILE DOES **NOT** DO, deliberately:
 *
 *   · It does not reconcile the "high GI" disagreement. `giBand` says 70 and
 *     five other sites say 65 (engine's `warn:high_gi`, `insights`,
 *     `weeklyReport`, `ai.ts`, `foods.tsx`). Choosing between them changes what
 *     a patient is told, so it is Phase 5 and it is blocked on a clinical
 *     decision. This file hosts the classification only.
 *   · It does not reconcile the ROUNDING difference between `glycemicLoad`
 *     (unrounded, feeds the badges) and `glBand` (rounded, feeds the on-screen
 *     tag). At a load of 20.4 the badge already says "high" and the tag says
 *     "medium". Both are pinned in tests/domain/interpretationInventory.golden.test.ts
 *     and both keep their current behaviour here.
 */

/** Low / medium / high — for a glycemic INDEX and, separately, for a LOAD. */
export type GiBand = 'low' | 'medium' | 'high';

/* ─────────────────────────── Glycemic INDEX ─────────────────────────── */

/**
 * THE app's one glycemic-index classification (finding NUTR-C3 / Step 22A),
 * moved here from `advice.ts` unchanged.
 *
 * The bands are the standard ones the app already adopted for the shared
 * `GlycemicBar` — low ≤ 55, medium 56–69, high ≥ 70 — so a single function
 * answers "what band is this GI in?" for every surface. `glycemicTone` (the
 * chip's colours) delegates to it, which is why no displayed classification
 * moves.
 *
 * Two OTHER thresholds in the app deliberately still disagree with it and are
 * NOT touched here, because moving either changes a patient-facing number or
 * removes a safety warning — both nutrition-policy calls for RU-3:
 *
 *   · `scoreMeal` opens its harsh GI penalty at `gi > 70`, so a GI of exactly
 *     70 is "high" on the chip and "moderate" to the score (the 480 kcal
 *     screenshot). Pinned in tests/domain/nutritionClaims.golden.test.ts.
 *   · `aggregateItems` raises `warn:high_gi` from 66, i.e. it warns across part
 *     of the medium band. Warning EARLIER is the safe direction, so it stays.
 *
 * A GI of 0 means "no index known" and lands in `low`; every caller gates the
 * chip on `gi > 0` before asking, exactly as before.
 */
export function giBand(gi: number): GiBand {
  if (gi <= 55) return 'low';
  if (gi <= 69) return 'medium';
  return 'high';
}

/**
 * The colours that go with a band. `color` paints graphics (bars, dots, chips,
 * the load tag); `textColor` is the darker twin type must use — the bright
 * scale colours only reach ~3.2-3.5:1 on white, under the 4.5:1 WCAG AA floor.
 *
 * Lifted from `GlycemicBar`'s private `TONE`, which the glycemic-LOAD tag in
 * `scan-result` had already copied by hand (`#dc2626` / `#d97706` / `#0f9d58`).
 * One table now, so green/amber/red cannot come to mean two different things.
 */
export const GLYCEMIC_TONE: Record<GiBand, { color: string; textColor: string }> = {
  low: { color: '#0f9d58', textColor: '#0B7A44' },
  medium: { color: '#d97706', textColor: '#B45309' },
  high: { color: '#dc2626', textColor: '#C81E1E' },
};

/* ─────────────────────────── Glycemic LOAD ──────────────────────────── */

/**
 * The index assumed when a plate carries none.
 *
 * Written out three separate times before this (`advice.glycemicLoad`,
 * `engine.glycemic_load_value`, `scan-result`'s inline fallback), always as the
 * same `gi > 0 ? gi : 55`. It is a HEURISTIC — "assume a moderate index" — and
 * naming it is what lets a caller mark a load as assumed rather than measured.
 */
export const ASSUMED_GI = 55;

/** `gi` when it is known, the assumed moderate index when it is not. */
export function effectiveGi(gi: number | undefined | null): number {
  return gi !== undefined && gi !== null && gi > 0 ? gi : ASSUMED_GI;
}

/** True when the load below rests on `ASSUMED_GI` rather than a real index. */
export function isAssumedGi(gi: number | undefined | null): boolean {
  return !(gi !== undefined && gi !== null && gi > 0);
}

/**
 * Glycemic Load = GI × available carbohydrate / 100.
 *
 * Standard buckets: GL < 10 low, 10–20 medium, > 20 high. Those cut-offs were
 * derived for single food SERVINGS rather than whole plates — recorded in
 * docs/SCORING-MODEL-PROPOSAL.md §4.1 and unresolved. They are reproduced here
 * exactly as the app already applies them.
 */
export const GL_LOW_MAX = 10;
export const GL_MEDIUM_MAX = 20;

/** Raw, UNROUNDED load. */
export function glValue(carbs: number, gi: number | undefined | null): number {
  return (effectiveGi(gi) * carbs) / 100;
}

/**
 * The band of a load that has ALREADY been computed.
 *
 * Moved verbatim from `scan-result`'s private `glBand`, including its colour —
 * which is `GLYCEMIC_TONE`'s, so green/amber/red mean one thing across the app.
 * Callers pass a rounded figure today; see the rounding note at the top.
 */
export function glBand(gl: number): { key: GiBand; color: string } {
  if (gl > GL_MEDIUM_MAX) return { key: 'high', color: GLYCEMIC_TONE.high.color };
  if (gl >= GL_LOW_MAX) return { key: 'medium', color: GLYCEMIC_TONE.medium.color };
  return { key: 'low', color: GLYCEMIC_TONE.low.color };
}

/**
 * The capitalised bucket the engine persists on `NutritionResult.glycemic_load`
 * and `buildHighlights` reads. Kept as its own function — and NOT re-expressed
 * through `glBand` — because it bands the UNROUNDED load, which is a real
 * behavioural difference from the on-screen tag rather than a style choice.
 */
export function glycemicLoad(
  carbs: number,
  glycemicIndex: number
): 'Low' | 'Medium' | 'High' {
  const gl = glValue(carbs, glycemicIndex);
  if (gl < GL_LOW_MAX) return 'Low';
  if (gl <= GL_MEDIUM_MAX) return 'Medium';
  return 'High';
}
