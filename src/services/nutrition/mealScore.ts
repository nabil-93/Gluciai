/**
 * Meal Quality Score — 0..100 rating of how suitable a meal is for a
 * diabetic patient, with human-readable reasons. Pure function, no I/O.
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
  label: 'Excellent' | 'Bon' | 'Modéré' | 'Faible';
  color: string;
  /** Why the meal got this score (worst factors first) */
  reasons: string[];
}

const COLORS = {
  excellent: '#37B24D',
  good: '#2FCB8E',
  moderate: '#E0A93F',
  poor: '#F5763B',
};

export function scoreMeal(m: MealScoreInput): MealScore {
  let score = 100;
  const penalties: { pts: number; reason: string }[] = [];
  const bonuses: string[] = [];

  const gi = m.glycemic_index ?? 0;
  if (gi > 70) {
    penalties.push({ pts: 22, reason: `Index glycémique élevé (${gi}) — montée rapide de la glycémie` });
  } else if (gi > 55) {
    penalties.push({ pts: 10, reason: `Index glycémique modéré (${gi})` });
  } else if (gi > 0 && gi <= 40) {
    bonuses.push(`IG bas (${gi}) — impact glycémique doux`);
  }

  if (m.sugar > 30) {
    penalties.push({ pts: 22, reason: `Beaucoup de sucre (${Math.round(m.sugar)} g)` });
  } else if (m.sugar > 15) {
    penalties.push({ pts: 10, reason: `Sucre notable (${Math.round(m.sugar)} g)` });
  }

  if (m.carbs > 80) {
    penalties.push({ pts: 15, reason: `Charge glucidique très élevée (${Math.round(m.carbs)} g)` });
  } else if (m.carbs > 60) {
    penalties.push({ pts: 8, reason: `Glucides élevés (${Math.round(m.carbs)} g)` });
  }

  if (m.fiber >= 6) {
    score += 5;
    bonuses.push(`Riche en fibres (${Math.round(m.fiber)} g) — ralentit l'absorption du sucre`);
  } else if (m.fiber < 2 && m.carbs > 30) {
    penalties.push({ pts: 6, reason: 'Pauvre en fibres pour sa charge glucidique' });
  }

  if (m.protein >= 20) {
    score += 5;
    bonuses.push(`Bon apport en protéines (${Math.round(m.protein)} g)`);
  }

  if ((m.sodium ?? 0) > 1000) {
    penalties.push({ pts: 8, reason: `Très salé (${Math.round(m.sodium!)} mg de sodium)` });
  }

  if (m.calories > 800) {
    penalties.push({ pts: 8, reason: `Repas très calorique (${Math.round(m.calories)} kcal)` });
  }

  penalties.sort((a, b) => b.pts - a.pts);
  for (const p of penalties) score -= p.pts;
  score = Math.max(0, Math.min(100, Math.round(score)));

  const label: MealScore['label'] =
    score >= 85 ? 'Excellent' : score >= 70 ? 'Bon' : score >= 50 ? 'Modéré' : 'Faible';
  const color =
    score >= 85
      ? COLORS.excellent
      : score >= 70
        ? COLORS.good
        : score >= 50
          ? COLORS.moderate
          : COLORS.poor;

  const reasons = [...penalties.map((p) => p.reason), ...bonuses];
  if (reasons.length === 0) {
    reasons.push('Repas équilibré pour votre glycémie');
  }

  return { score, label, color, reasons };
}
