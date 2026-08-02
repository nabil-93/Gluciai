/**
 * MEAL-QUALITY INTERPRETATION — the one import path for the app's verdict.
 *
 * PHASE 2 of the interpretation refactor (docs/ARCHITECTURE-INTERPRETATION-AUDIT.md
 * §3 §8). This is a FACADE, not a rewrite: `scoreMeal`, `mealGrade`, the
 * evidence gate and the badge filter all keep their current homes and their
 * current behaviour, byte for byte. What this file adds is a single place a
 * screen may import them from, so the next phase has one seam to cut at
 * instead of five call sites to find.
 *
 * WHAT THIS FILE DOES **NOT** DO, deliberately:
 *
 *   · It does not introduce `mealVerdict`. Collapsing the score, the letter,
 *     the word, the gate and the badges into one object is Phase 6 — it forces
 *     the A/"Bon" overlap (80–84) and the day-badge wording to be decided, and
 *     both are product calls.
 *   · It does not reconcile `scoreMeal`'s thresholds with `buildHighlights`'s.
 *     Protein is "good" at ≥ 20 g to the score and ≥ 25 g to the badge; carbs
 *     are "too much" at > 80 g and > 75 g; fibre is "poor" below 2 g and 3 g.
 *     Those are behaviour, they are pinned in
 *     tests/domain/interpretationInventory.golden.test.ts, and aligning them
 *     changes what a patient reads. Phase 6.
 *   · It does not give the day badge its own vocabulary. `dayScore.scoreBand`
 *     still borrows the meal words. Phase 6.
 */

export {
  GRADE_COLORS,
  mealGrade,
  scoreMeal,
  type MealGrade,
  type MealScore,
  type MealScoreInput,
} from '../mealScore';

export {
  buildHighlights,
  displayableHighlights,
  qualityClaimSupported,
  qualityEvidence,
  type HighlightInput,
  type HighlightPlate,
  type QualityEvidence,
} from '../advice';
