import type {
  ActivityLog,
  GlucoseLog,
  InsulinLog,
  MealScan,
  Profile,
} from '@/types';

/**
 * Weekly AI summary: observations, positive habits and possible
 * improvements generated from the last 7 days of real data.
 * Rule-based and transparent — educational, never diagnostic.
 */

export interface WeeklySummary {
  observations: string[];
  positives: string[];
  improvements: string[];
}

const DAY_MS = 24 * 3600 * 1000;

export function getWeeklySummary(
  glucoseLogs: GlucoseLog[],
  insulinLogs: InsulinLog[],
  meals: MealScan[],
  activityLogs: ActivityLog[],
  profile: Profile | null
): WeeklySummary {
  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;
  const cutoff = Date.now() - 7 * DAY_MS;
  const within = (iso: string) => new Date(iso).getTime() >= cutoff;

  const glucose = glucoseLogs.filter((g) => within(g.created_at));
  const insulin = insulinLogs.filter((l) => within(l.created_at));
  const week = meals.filter((m) => within(m.created_at));
  const activities = activityLogs.filter((a) => within(a.created_at));

  const observations: string[] = [];
  const positives: string[] = [];
  const improvements: string[] = [];

  // ── Glucose ──
  if (glucose.length > 0) {
    const values = glucose.map((g) => g.value);
    const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
    const tir = Math.round(
      (values.filter((v) => v >= low && v <= high).length / values.length) * 100
    );
    const lows = values.filter((v) => v < low).length;

    observations.push(
      `Glycémie moyenne de ${avg} mg/dL sur ${glucose.length} mesures, ${tir}% du temps dans la cible ${low}–${high}.`
    );
    if (tir >= 70) {
      positives.push(`Excellent contrôle : ${tir}% dans la cible — l'objectif clinique (>70%) est atteint.`);
    } else if (tir >= 50) {
      improvements.push(`${tir}% dans la cible — visez 70% : régularité des repas et contrôles avant/après repas aident.`);
    } else {
      improvements.push(`Temps dans la cible bas (${tir}%) — parlez-en à votre médecin lors de la prochaine consultation.`);
    }
    if (lows > 2) {
      improvements.push(`${lows} hypoglycémies cette semaine — vérifiez vos doses avec votre médecin, surtout avant l'effort.`);
    } else if (lows === 0 && glucose.length >= 5) {
      positives.push('Aucune hypoglycémie cette semaine.');
    }

    const days = new Set(glucose.map((g) => new Date(g.created_at).toDateString())).size;
    if (days >= 6) {
      positives.push(`Suivi très régulier : des mesures ${days} jours sur 7.`);
    } else if (days <= 3) {
      improvements.push(`Des mesures seulement ${days} jours sur 7 — une mesure quotidienne à jeun donne une vraie tendance.`);
    }
  } else {
    observations.push('Aucune mesure de glycémie cette semaine.');
    improvements.push('Reprenez au moins une mesure quotidienne à jeun.');
  }

  // ── Meals ──
  if (week.length > 0) {
    const carbs = week.reduce((s, m) => s + (m.result.carbohydrates ?? 0), 0);
    const sugar = week.reduce((s, m) => s + (m.result.sugar ?? 0), 0);
    const kcal = week.reduce((s, m) => s + (m.result.calories ?? 0), 0);
    observations.push(
      `${week.length} repas suivis : ${Math.round(kcal)} kcal, ${Math.round(carbs)} g de glucides, ${Math.round(sugar)} g de sucre au total.`
    );
    const highGi = week.filter((m) => (m.result.glycemic_index ?? 0) > 65).length;
    if (highGi >= 3) {
      improvements.push(`${highGi} repas à IG élevé — remplacez-en un par jour par une option à IG bas (lentilles, bissara, tajine de légumes).`);
    }
    const fibers = week.reduce((s, m) => s + (m.result.fiber ?? 0), 0);
    if (fibers / week.length >= 5) {
      positives.push('Bon apport en fibres dans vos repas.');
    }
  } else {
    improvements.push('Aucun repas suivi — scannez au moins le repas principal pour relier alimentation et glycémie.');
  }

  // ── Insulin ──
  if (insulin.length > 0) {
    const total = insulin.reduce((s, l) => s + l.dose, 0);
    observations.push(`${insulin.length} injections enregistrées (${total} U au total).`);
  }

  // ── Activity ──
  const activityMin = activities.reduce((s, a) => s + a.duration_min, 0);
  if (activityMin >= 150) {
    positives.push(`${activityMin} min d'activité — l'objectif OMS (150 min/semaine) est atteint ! 🏆`);
  } else if (activityMin > 0) {
    observations.push(`${activityMin} min d'activité physique cette semaine.`);
    improvements.push(`Encore ${150 - activityMin} min pour atteindre les 150 min/semaine recommandées.`);
  } else {
    improvements.push('Aucune activité enregistrée — même 15 min de marche après le repas comptent.');
  }

  return { observations, positives, improvements };
}
