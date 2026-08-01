/**
 * Rule-based meal HIGHLIGHTS + glycemic-load bucket. Pure, offline, free.
 *
 * We deliberately do NOT ask the AI for coaching text: the numbers are
 * already computed from the databases, so a local rule is instant, works
 * offline and stays consistent with the meal score. We return STABLE KEYS
 * (e.g. "high_protein") — the React Native app translates them via i18n,
 * so the same scan re-localizes in fr/de/en/ar without re-analysis.
 */

import type { FoodCategory, MealHighlight } from '@/types';

export interface HighlightInput {
  calories: number;
  carbs: number;
  sugar: number;
  protein: number;
  fat: number;
  fiber: number;
  sodium?: number;
  glycemic_index: number;
  /** Categories of the foods on the plate — for composition highlights */
  categories?: FoodCategory[];
}

/** Low / medium / high for a glycemic INDEX — see `giBand`. */
export type GiBand = 'low' | 'medium' | 'high';

/**
 * THE app's one glycemic-index classification (finding NUTR-C3 / Step 22A).
 *
 * The bands are the standard ones the app already adopted for the shared
 * `GlycemicBar` — low ≤ 55, medium 56–69, high ≥ 70 — lifted here unchanged so
 * a single function answers "what band is this GI in?" for every surface.
 * `glycemicTone` (the chip's colours) now delegates to it, which is why no
 * displayed classification moves.
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
 * Glycemic Load ≈ (GI × available carbs) / 100. Standard buckets:
 *   GL < 10 → Low, 10–20 → Medium, > 20 → High.
 * When no GI is known we approximate from carbs (assume moderate GI ~55).
 */
export function glycemicLoad(
  carbs: number,
  glycemicIndex: number
): 'Low' | 'Medium' | 'High' {
  const gi = glycemicIndex > 0 ? glycemicIndex : 55;
  const gl = (gi * carbs) / 100;
  if (gl < 10) return 'Low';
  if (gl <= 20) return 'Medium';
  return 'High';
}

const VEGGIE: ReadonlySet<FoodCategory> = new Set<FoodCategory>([
  'Vegetable',
  'Legumes',
]);

/**
 * Produce the plate's highlight keys, positives first then attention
 * points. Order is meaningful — the UI shows them top to bottom.
 */
export function buildHighlights(m: HighlightInput): MealHighlight[] {
  const gl = glycemicLoad(m.carbs, m.glycemic_index);
  const cats = m.categories ?? [];
  const hasVeg = cats.some((c) => VEGGIE.has(c));
  const distinctGroups = new Set(cats.filter((c) => c !== 'Unknown')).size;

  const positives: MealHighlight[] = [];
  const attention: MealHighlight[] = [];

  // ── Positives ──
  if (m.protein >= 25) positives.push('high_protein');
  if (m.fiber >= 6) positives.push('high_fiber');
  if (gl === 'Low') positives.push('low_glycemic_load');
  if (m.sugar <= 5) positives.push('low_sugar');
  if (hasVeg) positives.push('vegetable_rich');
  // A balanced meal: protein + fiber present, sugar controlled, ≥3 groups.
  if (m.protein >= 15 && m.fiber >= 4 && m.sugar <= 15 && distinctGroups >= 3) {
    positives.push('balanced_meal');
  }

  // ── Attention points ──
  if (m.sugar > 30) attention.push('high_sugar');
  if (gl === 'High') attention.push('high_glycemic_load');
  if (m.carbs > 75) attention.push('carb_heavy');
  if (m.protein < 10) attention.push('low_protein');
  if (m.fiber < 3 && m.carbs > 30) attention.push('low_fiber');
  if ((m.sodium ?? 0) > 1000) attention.push('high_sodium');

  // De-dupe while preserving order (positives first).
  return [...new Set([...positives, ...attention])];
}

/* ─────────────────── WHAT MAY BE SHOWN, AND WHEN ───────────────────── */

/** The badges that PRAISE a meal. The rest are attention points. */
const POSITIVE: ReadonlySet<MealHighlight> = new Set<MealHighlight>([
  'high_protein',
  'high_fiber',
  'balanced_meal',
  'low_glycemic_load',
  'low_sugar',
  'vegetable_rich',
]);

/** Everything a display filter needs to know about the plate behind a badge. */
export interface HighlightPlate {
  calories?: number;
  /** Provenance of the plate's carbohydrate, when the caller knows it. */
  carbs_known?: boolean;
}

/**
 * Drop the positive badges a plate has not EARNED (finding P8-005).
 *
 * `buildHighlights` reads absolute numbers, and a plate nothing could be
 * resolved for arrives as zeros — which satisfy every "good" threshold: no
 * sugar is `low_sugar`, no carbohydrate is a `Low` glycemic load. The patient
 * is then complimented on a meal the app failed to identify, beside its 0 kcal.
 *
 * This is a DISPLAY filter on purpose:
 *   · `buildHighlights` is untouched, so no nutrition arithmetic moves;
 *   · `NutritionResult.highlights` already stored in the journal is not
 *     rewritten — no migration, no silent edit of a patient's history. The
 *     badges simply stop being SHOWN for a plate that cannot support them.
 *
 * The rule is deliberately narrow: praise needs data behind it. A plate with no
 * energy at all, or one whose carbohydrate is explicitly unknown, keeps its
 * attention points (those are honest — `low_protein` on an unresolved plate is
 * still "we found no protein") and loses its compliments. A plate WITH data
 * keeps every badge it earned.
 */
export function displayableHighlights(
  highlights: MealHighlight[] | null | undefined,
  plate: HighlightPlate | null | undefined
): MealHighlight[] {
  const list = highlights ?? [];
  if (qualityEvidence(plate) === 'supported') return list;
  return list.filter((h) => !POSITIVE.has(h));
}

/**
 * What the plate can back up: `supported`, or WHY not.
 *
 *   `no_data`       nothing resolved — no energy at all. Every "good"
 *                   threshold in the app is satisfied by the placeholder
 *                   zeros, so absence reads as excellence.
 *   `carbs_unknown` at least one food's carbohydrate is missing (Step 10), so
 *                   the plate's carbohydrate is a FLOOR. In an app whose whole
 *                   subject is carbohydrate, a quality verdict computed from a
 *                   floor is not a verdict.
 *
 * These are the two signals Step 18 already adopted for the badges (P8-005) —
 * reused, not re-invented, so one rule decides what the screen may claim. No
 * new percentage, no confidence cut-off, no clinical threshold: whether a food
 * was identified at all, and whether its carbohydrate is a real value, are
 * facts the pipeline already records.
 */
export type QualityEvidence = 'supported' | 'no_data' | 'carbs_unknown';

/*
 * STEP 22B AUDIT — is the energy test standing on an ambiguous zero?
 *
 * Yes, and deliberately so. Since Step 22B a plate can say whether its energy
 * was DECLARED (`nutrients_known.calories === true` — a diet drink read from
 * its label really is 0 kcal) or merely absent, so the gate COULD now let a
 * declared-zero plate through. It does not, because doing so would hand a
 * glass of water "100/100 · Excellent · A" — the exact claim Step 22A exists to
 * withhold — and deciding that a zero-energy plate deserves a quality verdict
 * is a nutrition-policy call, not a data-integrity one.
 *
 * So the rule is unchanged and the trade-off is now explicit rather than
 * accidental: no energy means no verdict, whoever declared it. Whether a
 * genuinely 0 kcal plate should instead be scored is recorded for RU-3.
 */
export function qualityEvidence(
  plate: HighlightPlate | null | undefined
): QualityEvidence {
  const kcal = plate?.calories ?? 0;
  // `NaN <= 0` is false, so a plate built from an unusable portion used to slip
  // through as SUPPORTED and score 100/100 — every comparison in `scoreMeal` is
  // also false against NaN (finding NUTR-B2). A figure that is not a finite
  // number is not evidence of anything.
  if (!Number.isFinite(kcal) || kcal <= 0) return 'no_data';
  if (plate?.carbs_known === false) return 'carbs_unknown';
  return 'supported';
}

/**
 * May this plate carry a quality VERDICT at all — the 0–100 score, its
 * Excellent/Good/Moderate/Poor word, the A–E letter, and the tip derived from
 * them (Step 22A, findings P8-005-adjacent and NUTR-C3)?
 *
 * `scoreMeal` is untouched and still returns its number for anything: this is a
 * DISPLAY gate, exactly like `displayableHighlights`. A plate that cannot
 * support a verdict gets an explicit "not available" state — never a
 * manufactured low score, which would be a second invented claim on top of the
 * first. Stored `meal_score` values are never rewritten: no migration, no
 * silent edit of a patient's history.
 *
 * The accepted trade-off, identical to Step 18's: an item that genuinely holds
 * zero energy (a diet drink typed from its label) reads as unsupported rather
 * than "100/100 Excellent". Withholding a claim is the safe direction; the
 * numbers themselves are still displayed in full.
 */
export function qualityClaimSupported(
  plate: HighlightPlate | null | undefined
): boolean {
  return qualityEvidence(plate) === 'supported';
}
