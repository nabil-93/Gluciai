import i18n from '@/i18n';

/**
 * Meal Quality Score — 0..100 rating of how suitable a meal is for a
 * diabetic patient, with human-readable reasons (localized via i18n).
 */

export interface MealScoreInput {
  calories: number;
  carbs: number;
  sugar: number;
  protein: number;
  fat: number;
  fiber: number;
  sodium?: number;
  glycemic_index?: number;
}

export interface MealScore {
  score: number;
  /** Localized label (Excellent / Good / Moderate / Poor in the app language). */
  label: string;
  /** Graphic colour — progress rings, bars, dots. */
  color: string;
  /**
   * The same meaning, dark enough to read as type. The graphic greens/ambers
   * sit around 2.7-3.6:1 on white, under the 4.5:1 WCAG AA floor, so any
   * TEXT rendering of the score label must use this instead.
   */
  textColor: string;
  /** Why the meal got this score (worst factors first) */
  reasons: string[];
}

/** Letter form of the app's own meal indicator (A best → E worst). */
export type MealGrade = 'A' | 'B' | 'C' | 'D' | 'E';

/**
 * Map the 0..100 meal indicator to an A–E letter, so a meal can carry a
 * glanceable grade in addition to the numeric ring. A meal that scores well for
 * a diabetic (low GI/sugar, good fibre/protein) lands on A/B; sugary, high-GI,
 * very caloric plates fall to D/E.
 *
 * THIS IS NOT AN OFFICIAL NUTRITIONAL LABEL, and must never be presented as
 * one (finding NUTR-A1). The regulated front-of-pack metric is computed
 * **per 100 g** from energy, sugars, saturated fat, salt, fibre, protein and
 * the fruit/veg/legumes/nuts share, with category-specific cut-offs. This one
 * is computed per PLATE — so the same food at twice the portion changes letter
 * — it never looks at fat, the app holds no saturated-fat figure anywhere to
 * look at, and it is driven by the glycemic index, which the official algorithm
 * does not use at all. It answers a different question on purpose: how well
 * does this plate suit a diabetic patient.
 *
 * REMOVED in Step 22D Phase 1, RESTORED by product decision. The restoration is
 * visual: these boundaries and `scoreMeal` below are unchanged. What the letter
 * MEANS, and its 80–84 overlap with the word bands, stay open in
 * docs/RU3-NUTRITION-DECISIONS.md (D10).
 */
export function mealGrade(score: number): MealGrade {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'E';
}

/**
 * Badge colours for the A–E letters — deliberately the app's OWN tier palette,
 * the same greens/ambers the indicator ring and the journal day badge already
 * use, and deliberately NOT any official five-colour front-of-pack mark, which
 * would lend an app heuristic the authority of a regulated one. `fg` is picked
 * per background for contrast.
 */
export const GRADE_COLORS: Record<MealGrade, { bg: string; fg: string }> = {
  A: { bg: '#17A24A', fg: '#ffffff' },
  B: { bg: '#2FCB8E', fg: '#06301F' },
  C: { bg: '#E0A93F', fg: '#3A2A00' },
  D: { bg: '#F5763B', fg: '#3A1400' },
  E: { bg: '#B4441A', fg: '#ffffff' },
};

const COLORS = {
  excellent: '#37B24D',
  good: '#2FCB8E',
  moderate: '#E0A93F',
  poor: '#F5763B',
};

/** Readable twins of COLORS, all ≥ 4.5:1 on white (see MealScore.textColor). */
const TEXT_COLORS = {
  excellent: '#257A34',
  good: '#0F7A5A',
  moderate: '#8A6416',
  poor: '#B4441A',
};

export function scoreMeal(m: MealScoreInput): MealScore {
  const t = i18n.t.bind(i18n);
  let score = 100;
  const penalties: { pts: number; reason: string }[] = [];
  const bonuses: string[] = [];

  const gi = m.glycemic_index ?? 0;
  if (gi > 70) {
    penalties.push({ pts: 22, reason: t('mealScore.giHigh', { gi }) });
  } else if (gi > 55) {
    penalties.push({ pts: 10, reason: t('mealScore.giModerate', { gi }) });
  } else if (gi > 0 && gi <= 40) {
    bonuses.push(t('mealScore.giLowBonus', { gi }));
  }

  if (m.sugar > 30) {
    penalties.push({ pts: 22, reason: t('mealScore.sugarHigh', { g: Math.round(m.sugar) }) });
  } else if (m.sugar > 15) {
    penalties.push({ pts: 10, reason: t('mealScore.sugarNotable', { g: Math.round(m.sugar) }) });
  }

  if (m.carbs > 80) {
    penalties.push({ pts: 15, reason: t('mealScore.carbsVeryHigh', { g: Math.round(m.carbs) }) });
  } else if (m.carbs > 60) {
    penalties.push({ pts: 8, reason: t('mealScore.carbsHigh', { g: Math.round(m.carbs) }) });
  }

  if (m.fiber >= 6) {
    score += 5;
    bonuses.push(t('mealScore.fiberRich', { g: Math.round(m.fiber) }));
  } else if (m.fiber < 2 && m.carbs > 30) {
    penalties.push({ pts: 6, reason: t('mealScore.fiberPoor') });
  }

  if (m.protein >= 20) {
    score += 5;
    bonuses.push(t('mealScore.proteinGood', { g: Math.round(m.protein) }));
  }

  if ((m.sodium ?? 0) > 1000) {
    penalties.push({ pts: 8, reason: t('mealScore.salty', { mg: Math.round(m.sodium!) }) });
  }

  if (m.calories > 800) {
    penalties.push({ pts: 8, reason: t('mealScore.caloric', { kcal: Math.round(m.calories) }) });
  }

  penalties.sort((a, b) => b.pts - a.pts);
  for (const p of penalties) score -= p.pts;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const label =
    score >= 85
      ? t('mealScore.labelExcellent')
      : score >= 70
        ? t('mealScore.labelGood')
        : score >= 50
          ? t('mealScore.labelModerate')
          : t('mealScore.labelPoor');
  const tier =
    score >= 85
      ? 'excellent'
      : score >= 70
        ? 'good'
        : score >= 50
          ? 'moderate'
          : ('poor' as const);
  const color = COLORS[tier];
  const textColor = TEXT_COLORS[tier];

  const reasons = [...penalties.map((p) => p.reason), ...bonuses];
  if (reasons.length === 0) {
    reasons.push(t('mealScore.balanced'));
  }

  return { score, label, color, textColor, reasons };
}
