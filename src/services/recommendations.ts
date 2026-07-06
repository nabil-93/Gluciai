import { MOROCCAN_FOODS } from '@/data/moroccanFoods';
import type { GlucoseLog, MealScan, Profile } from '@/types';

/**
 * Personalized nutrition recommendations — rule-based on the user's
 * medical profile (weight/height/diabetes type/ratios), current
 * glucose, meal history and favorite foods. Educational only.
 */

export interface Recommendation {
  icon: string;
  text: string;
}

const DAY_MS = 24 * 3600 * 1000;

export function getRecommendations(
  profile: Profile | null,
  glucoseLogs: GlucoseLog[],
  meals: MealScan[]
): Recommendation[] {
  const recs: Recommendation[] = [];
  const week = meals.filter(
    (m) => Date.now() - new Date(m.created_at).getTime() < 7 * DAY_MS
  );

  // ── BMI from profile ──
  if (profile?.height && profile?.weight) {
    const bmi = profile.weight / Math.pow(profile.height / 100, 2);
    if (bmi >= 27) {
      recs.push({
        icon: '⚖️',
        text: `Votre IMC est de ${bmi.toFixed(1)} — une perte de 5 % du poids améliore nettement la sensibilité à l'insuline. Privilégiez tajines de légumes et poisson grillé.`,
      });
    } else if (bmi > 0 && bmi < 18.5) {
      recs.push({
        icon: '⚖️',
        text: `IMC ${bmi.toFixed(1)} — pensez à des collations riches en protéines (sellou en petite quantité, amandes) entre les repas.`,
      });
    }
  }

  // ── Favorite food + healthier pairing ──
  const counts = new Map<string, number>();
  for (const m of week) {
    counts.set(m.result.food_name, (counts.get(m.result.food_name) ?? 0) + 1);
  }
  const favorite = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (favorite && favorite[1] >= 2) {
    recs.push({
      icon: '❤️',
      text: `Vous aimez « ${favorite[0]} » (${favorite[1]}× cette semaine). Ajoutez une salade (zaalouk, salade marocaine) avant : les fibres ralentissent le pic glycémique.`,
    });
  }

  // ── Weekly sugar load ──
  const sugarWeek = week.reduce((s, m) => s + (m.result.sugar ?? 0), 0);
  if (sugarWeek > 150) {
    recs.push({
      icon: '🍬',
      text: `${Math.round(sugarWeek)} g de sucre cette semaine. Le thé à la menthe non sucré ou peu sucré ferait une vraie différence.`,
    });
  }

  // ── Fiber suggestion from the Moroccan DB (low GI, high fiber) ──
  const fiberWeek = week.reduce((s, m) => s + (m.result.fiber ?? 0), 0);
  if (week.length >= 3 && fiberWeek / week.length < 4) {
    const highFiber = MOROCCAN_FOODS.filter(
      (f) => f.fiber >= 8 && (f.glycemic_index ?? 100) <= 45
    )
      .slice(0, 3)
      .map((f) => f.name_fr)
      .join(', ');
    recs.push({
      icon: '🌾',
      text: `Vos repas manquent de fibres. Bons choix marocains à IG bas : ${highFiber}.`,
    });
  }

  // ── Glucose-driven advice ──
  const lastG = glucoseLogs[0];
  const high = profile?.target_high ?? 180;
  if (lastG && lastG.value > high) {
    recs.push({
      icon: '🥗',
      text: `Glycémie actuelle élevée (${lastG.value}) — pour le prochain repas, visez < 40 g de glucides : kefta grillée, poisson, légumes.`,
    });
  }

  // ── Diabetes-type specific ──
  if (profile?.diabetes_type === 'type2' || profile?.diabetes_type === 'prediabetes') {
    recs.push({
      icon: '🚶',
      text: '10–15 min de marche après le repas principal réduisent le pic glycémique de 20 à 30 %.',
    });
  }
  if (profile?.diabetes_type === 'gestational') {
    recs.push({
      icon: '🤰',
      text: 'Diabète gestationnel : fractionnez en 3 repas + 2 collations et évitez les jus de fruits, même frais.',
    });
  }

  // ── Fallback ──
  if (recs.length === 0) {
    recs.push({
      icon: '✨',
      text: 'Continuez à scanner vos repas — plus vous enregistrez, plus les recommandations deviennent précises.',
    });
  }

  return recs.slice(0, 4);
}
