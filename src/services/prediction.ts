import type { GlucoseLog, MealScan, Profile } from '@/types';

/**
 * Future glucose trend prediction from historical data.
 * Simple, transparent statistics (hourly profile + recent slope) —
 * ALWAYS presented as an estimate, never as a medical fact.
 */

export interface GlucosePrediction {
  /** 'rise' | 'drop' | 'stable' — expected direction over ~2 h */
  direction: 'rise' | 'drop' | 'stable';
  /** Expected value in ~2 h (mg/dL), clamped to a plausible range */
  expectedValue: number | null;
  /** mg/dL per hour, from the recent readings */
  slopePerHour: number;
  /** Historical risky hour (most out-of-range readings), e.g. "17:00–19:00" */
  riskWindow: string | null;
  riskType: 'hypo' | 'hyper' | null;
  /** Suggested next monitoring time, e.g. "vers 15:30" */
  suggestedCheck: string | null;
  /** Number of readings the stats are based on */
  sampleSize: number;
}

const DAY_MS = 24 * 3600 * 1000;

export function predictGlucose(
  glucoseLogs: GlucoseLog[],
  meals: MealScan[],
  profile: Profile | null
): GlucosePrediction | null {
  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;

  const history = glucoseLogs
    .filter((g) => Date.now() - new Date(g.created_at).getTime() < 14 * DAY_MS)
    .sort(
      (a, b) =>
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    );
  if (history.length < 3) return null;

  // ── Recent slope (last readings within 6 h) ──
  const recent = history.filter(
    (g) => Date.now() - new Date(g.created_at).getTime() < 6 * 3600 * 1000
  );
  let slope = 0;
  if (recent.length >= 2) {
    const first = recent[0];
    const last = recent[recent.length - 1];
    const hours =
      (new Date(last.created_at).getTime() -
        new Date(first.created_at).getTime()) /
      3600000;
    if (hours > 0.2) {
      slope = (last.value - first.value) / hours;
    }
  }

  // Recent meal pushes expectation upward (~1-2 h post-prandial)
  const lastMeal = meals.find(
    (m) => Date.now() - new Date(m.created_at).getTime() < 2 * 3600 * 1000
  );
  const mealBoost = lastMeal
    ? Math.min(40, (lastMeal.result.carbohydrates ?? 0) * 0.5)
    : 0;

  const lastValue = history[history.length - 1].value;
  const raw = lastValue + slope * 2 + mealBoost;
  const expectedValue =
    recent.length >= 2 || mealBoost > 0
      ? Math.round(Math.max(45, Math.min(320, raw)))
      : null;

  const delta = (expectedValue ?? lastValue) - lastValue;
  const direction: GlucosePrediction['direction'] =
    delta > 15 ? 'rise' : delta < -15 ? 'drop' : 'stable';

  // ── Historical risk window: 2-hour buckets with most out-of-range ──
  const buckets = new Map<number, { total: number; lows: number; highs: number }>();
  for (const g of history) {
    const b = Math.floor(new Date(g.created_at).getHours() / 2) * 2;
    const cur = buckets.get(b) ?? { total: 0, lows: 0, highs: 0 };
    cur.total += 1;
    if (g.value < low) cur.lows += 1;
    if (g.value > high) cur.highs += 1;
    buckets.set(b, cur);
  }
  let riskWindow: string | null = null;
  let riskType: GlucosePrediction['riskType'] = null;
  let worst = 0;
  for (const [hour, s] of buckets) {
    if (s.total < 3) continue;
    const rate = (s.lows + s.highs) / s.total;
    if (rate > 0.4 && rate > worst) {
      worst = rate;
      riskWindow = `${String(hour).padStart(2, '0')}:00–${String(hour + 2).padStart(2, '0')}:00`;
      riskType = s.lows >= s.highs ? 'hypo' : 'hyper';
    }
  }

  // ── Suggested check: 2 h after last meal, else 3 h after last reading ──
  let suggestedCheck: string | null = null;
  const anchor = lastMeal
    ? new Date(new Date(lastMeal.created_at).getTime() + 2 * 3600 * 1000)
    : new Date(
        new Date(history[history.length - 1].created_at).getTime() +
          3 * 3600 * 1000
      );
  if (anchor.getTime() > Date.now()) {
    suggestedCheck = `vers ${anchor.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
    })}`;
  }

  return {
    direction,
    expectedValue,
    slopePerHour: Math.round(slope),
    riskWindow,
    riskType,
    suggestedCheck,
    sampleSize: history.length,
  };
}
