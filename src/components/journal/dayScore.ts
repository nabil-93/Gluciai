import { buildDayEvents, dayTotals, type DayEvent, type DayTotals } from '@/services/dayLog';

/**
 * A 0–100 quality score for a day, blending glucose time-in-range (how much of
 * the day the reading stayed inside the patient's target band) with the
 * average quality of the meals scanned that day. This is presentation only —
 * the AI reads the raw journal, never this number.
 *
 * Returns null when the day holds neither glucose readings nor scored meals,
 * so the UI can hide the score instead of inventing one.
 */
export function dayScore(events: DayEvent[], low: number, high: number): number | null {
  let tir: number | null = null;
  let mealAvg: number | null = null;

  const gly = events.filter((e): e is Extract<DayEvent, { kind: 'glucose' }> => e.kind === 'glucose');
  if (gly.length) {
    const inRange = gly.filter((e) => e.glucose.value >= low && e.glucose.value <= high).length;
    tir = (inRange / gly.length) * 100;
  }

  const scores = events
    .filter((e): e is Extract<DayEvent, { kind: 'meal' }> => e.kind === 'meal')
    .map((e) => e.meal.result.meal_score)
    .filter((s): s is number => typeof s === 'number');
  if (scores.length) mealAvg = scores.reduce((a, b) => a + b, 0) / scores.length;

  if (tir != null && mealAvg != null) return Math.round(0.6 * tir + 0.4 * mealAvg);
  if (tir != null) return Math.round(tir);
  if (mealAvg != null) return Math.round(mealAvg);
  return null;
}

export interface DaySummary {
  date: Date;
  events: DayEvent[];
  totals: DayTotals;
  score: number | null;
}

/** Build summaries for the last `n` days (index 0 = today), newest first. */
export function periodSummaries(n: number, low: number, high: number): DaySummary[] {
  const out: DaySummary[] = [];
  const now = new Date();
  for (let i = 0; i < n; i++) {
    const date = new Date(now.getTime() - i * 24 * 3600 * 1000);
    const events = buildDayEvents(date);
    out.push({ date, events, totals: dayTotals(events), score: dayScore(events, low, high) });
  }
  return out;
}

/** Score band → the mealScore label key + a colour, so the badge wording
 *  stays consistent with the meal-analysis screen. */
export function scoreBand(score: number): { key: string; color: string } {
  if (score >= 85) return { key: 'mealScore.labelExcellent', color: '#17A24A' };
  if (score >= 70) return { key: 'mealScore.labelGood', color: '#37B24D' };
  if (score >= 50) return { key: 'mealScore.labelModerate', color: '#E0A93F' };
  return { key: 'mealScore.labelPoor', color: '#F5763B' };
}
