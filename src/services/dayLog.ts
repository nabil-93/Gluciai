import { useAppStore } from '@/store/useAppStore';
import type {
  ActivityLog,
  AppEvent,
  GlucoseLog,
  InsulinLog,
  MealScan,
  MeasureLog,
} from '@/types';

/* ────────────────────────────────────────────────────────────
 * DAY LOG
 * One chronological feed of EVERYTHING the patient did on a given
 * day — every insulin dose, meal (with its numbers), glucose
 * reading, sport session and body measure, each with its time.
 * Feeds two consumers:
 *   • the "Rapport du jour" timeline screen (app/timeline.tsx)
 *   • the AI bolus advisor, which reads the full journal of today
 *     AND yesterday before proposing a dose.
 * ──────────────────────────────────────────────────────────── */

export type DayEvent =
  | { kind: 'meal'; id: string; created_at: string; meal: MealScan }
  | { kind: 'insulin'; id: string; created_at: string; insulin: InsulinLog }
  | { kind: 'glucose'; id: string; created_at: string; glucose: GlucoseLog }
  | { kind: 'activity'; id: string; created_at: string; activity: ActivityLog }
  | { kind: 'measure'; id: string; created_at: string; measure: MeasureLog }
  | { kind: 'event'; id: string; created_at: string; event: AppEvent };

/** All events of `day`, oldest → newest (the story of the day). */
export function buildDayEvents(day: Date): DayEvent[] {
  const s = useAppStore.getState();
  const sameDay = (iso: string) =>
    new Date(iso).toDateString() === day.toDateString();

  const events: DayEvent[] = [
    ...s.meals
      .filter((m) => sameDay(m.created_at))
      .map((m): DayEvent => ({ kind: 'meal', id: `m-${m.id}`, created_at: m.created_at, meal: m })),
    ...s.insulinLogs
      .filter((x) => sameDay(x.created_at))
      .map((x): DayEvent => ({ kind: 'insulin', id: `i-${x.id}`, created_at: x.created_at, insulin: x })),
    ...s.glucoseLogs
      .filter((g) => sameDay(g.created_at))
      .map((g): DayEvent => ({ kind: 'glucose', id: `g-${g.id}`, created_at: g.created_at, glucose: g })),
    ...s.activityLogs
      .filter((a) => sameDay(a.created_at))
      .map((a): DayEvent => ({ kind: 'activity', id: `a-${a.id}`, created_at: a.created_at, activity: a })),
    ...s.measureLogs
      .filter((x) => sameDay(x.created_at))
      .map((x): DayEvent => ({ kind: 'measure', id: `x-${x.id}`, created_at: x.created_at, measure: x })),
    ...(s.eventLogs ?? [])
      .filter((e) => sameDay(e.created_at))
      .map((e): DayEvent => ({ kind: 'event', id: `e-${e.id}`, created_at: e.created_at, event: e })),
  ];

  return events.sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );
}

export interface DayTotals {
  insulinU: number;
  rapidU: number;
  longU: number;
  carbs: number;
  kcal: number;
  sugar: number;
  sportMin: number;
  glucoseCount: number;
  avgGlucose: number | null;
}

export function dayTotals(events: DayEvent[]): DayTotals {
  const t: DayTotals = {
    insulinU: 0,
    rapidU: 0,
    longU: 0,
    carbs: 0,
    kcal: 0,
    sugar: 0,
    sportMin: 0,
    glucoseCount: 0,
    avgGlucose: null,
  };
  let glySum = 0;
  for (const e of events) {
    if (e.kind === 'insulin') {
      t.insulinU += e.insulin.dose;
      if (e.insulin.insulin_type === 'rapid') t.rapidU += e.insulin.dose;
      if (e.insulin.insulin_type === 'long') t.longU += e.insulin.dose;
    } else if (e.kind === 'meal') {
      t.carbs += e.meal.result.carbohydrates || 0;
      t.kcal += e.meal.result.calories || 0;
      t.sugar += e.meal.result.sugar || 0;
    } else if (e.kind === 'activity') {
      t.sportMin += e.activity.duration_min || 0;
    } else if (e.kind === 'glucose') {
      t.glucoseCount += 1;
      glySum += e.glucose.value;
    }
  }
  if (t.glucoseCount) t.avgGlucose = Math.round(glySum / t.glucoseCount);
  return t;
}

const hhmm = (iso: string) =>
  new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** One compact line per event — the format the AI reads. */
function eventLine(e: DayEvent): string {
  switch (e.kind) {
    case 'insulin':
      return `${hhmm(e.created_at)} INSULIN ${e.insulin.insulin_type} ${e.insulin.dose} U${e.insulin.notes ? ` (${e.insulin.notes})` : ''}`;
    case 'meal': {
      const r = e.meal.result;
      const name =
        r.food_name || (r.items ?? []).map((i) => i.name).slice(0, 4).join(' + ') || 'meal';
      return `${hhmm(e.created_at)} MEAL ${name} — ${Math.round(r.carbohydrates)} g carbs, ${Math.round(r.sugar)} g sugar, ${Math.round(r.calories)} kcal`;
    }
    case 'glucose':
      return `${hhmm(e.created_at)} GLUCOSE ${e.glucose.value} mg/dL${e.glucose.notes ? ` (${e.glucose.notes})` : ''}`;
    case 'activity':
      return `${hhmm(e.created_at)} SPORT ${e.activity.kind} ${e.activity.duration_min} min (${e.activity.intensity} intensity)`;
    case 'measure':
      return `${hhmm(e.created_at)} MEASURE ${e.measure.kind} ${e.measure.value} ${e.measure.unit}`;
    case 'event': {
      const ev = e.event;
      if (ev.kind === 'status') {
        return `${hhmm(e.created_at)} STATUS CHANGED ${ev.payload.from ?? '?'} → ${ev.payload.to ?? '?'}`;
      }
      const ch = Object.entries(ev.payload.changes ?? {})
        .map(([f, v]: [string, any]) => `${f}: ${JSON.stringify(v?.from)}→${JSON.stringify(v?.to)}`)
        .join(', ');
      return `${hhmm(e.created_at)} SETTINGS CHANGED ${ch}`;
    }
  }
}

/**
 * Chronological journal of today AND yesterday, formatted for the AI's
 * context. The bolus advisor reads this before proposing a dose — it sees
 * every injection (rapid AND long), every meal with its sugars, sport,
 * measures… so the recommendation rests on the complete picture.
 */
export function buildAIDayJournal(): string {
  const today = new Date();
  const yesterday = new Date(today.getTime() - 24 * 3600 * 1000);

  const fmt = (label: string, day: Date) => {
    const events = buildDayEvents(day);
    if (!events.length) return `${label}: nothing logged.`;
    const tot = dayTotals(events);
    return (
      `${label} (chronological, ${events.length} events — total insulin ${Math.round(tot.insulinU * 10) / 10} U` +
      ` [rapid ${Math.round(tot.rapidU * 10) / 10} / long ${Math.round(tot.longU * 10) / 10}], ` +
      `${Math.round(tot.carbs)} g carbs, ${Math.round(tot.kcal)} kcal, sport ${tot.sportMin} min):\n` +
      events.map(eventLine).join('\n')
    );
  };

  return (
    `FULL DAY JOURNAL — everything the patient logged, with times. ` +
    `Use it to ground the recommendation (meals already covered by insulin, ` +
    `basal already taken, sport earlier today, glucose evolution…).\n\n` +
    `${fmt('TODAY', today)}\n\n${fmt('YESTERDAY', yesterday)}`
  );
}
