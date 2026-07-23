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

/** Front-of-pack style letter grade (Nutri-Score look: A best → E worst). */
export type NutriGrade = 'A' | 'B' | 'C' | 'D' | 'E';

/**
 * Map the 0..100 meal-quality score to an A–E grade so a meal can carry a
 * glanceable letter (like a Nutri-Score) in addition to the numeric ring.
 * A meal that scores well for a diabetic (low GI/sugar, good fibre/protein)
 * lands on A/B; sugary, high-GI, very caloric plates fall to D/E.
 */
export function nutriGrade(score: number): NutriGrade {
  if (score >= 80) return 'A';
  if (score >= 65) return 'B';
  if (score >= 50) return 'C';
  if (score >= 35) return 'D';
  return 'E';
}

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
