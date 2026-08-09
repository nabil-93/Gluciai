import { describe, expect, it } from 'vitest';

import { buildReportHtml, type ReportMealRow } from '@/services/reportHtml';
import { buildReportStats, trendGeometry } from '@/services/reportStats';
import type { ActivityLog, GlucoseLog, InsulinLog, MealScan, Profile } from '@/types';

/**
 * CHARACTERIZATION — `reportStats`.
 *
 * These figures are exported as the PDF a patient hands to their diabetologist,
 * so an internal inconsistency here is read as clinical fact. Records what the
 * builder produces today.
 *
 * `isoDay()` and `slotOf()` read device-local time; `tests/setup.ts` pins TZ=UTC
 * so calendar-day bucketing is reproducible. `now` is injected, so the window
 * itself is deterministic.
 */

/** 2026-01-15 12:00 UTC. */
const NOW = Date.UTC(2026, 0, 15, 12, 0, 0);

/** ISO timestamp for a January 2026 day/hour, in UTC. */
const at = (day: number, hour = 12, minute = 0): string =>
  new Date(Date.UTC(2026, 0, day, hour, minute)).toISOString();

let seq = 0;
const nextId = () => `id-${(seq += 1)}`;

function glucose(value: number, day: number, hour = 12, minute = 0): GlucoseLog {
  return {
    id: nextId(),
    user_id: 'u',
    value,
    unit: 'mg/dL',
    source: 'manual',
    created_at: at(day, hour, minute),
  };
}

function insulin(dose: number, day: number, type: InsulinLog['insulin_type'] = 'rapid'): InsulinLog {
  return { id: nextId(), user_id: 'u', insulin_type: type, dose, created_at: at(day) };
}

function meal(carbohydrates: number, day: number, sugar = 0): MealScan {
  return {
    id: nextId(),
    user_id: 'u',
    created_at: at(day),
    result: {
      food_name: 'test',
      estimated_portion: '100 g',
      calories: 0,
      carbohydrates,
      sugar,
      protein: 0,
      fat: 0,
      fiber: 0,
      glycemic_index: 50,
      confidence: 1,
      warnings: [],
    },
  };
}

function activity(durationMin: number, day: number): ActivityLog {
  return {
    id: nextId(),
    user_id: 'u',
    kind: 'walk',
    duration_min: durationMin,
    intensity: 'medium',
    created_at: at(day),
  };
}

const profile: Profile = {
  user_id: 'u',
  name: 'T',
  diabetes_type: 'type1',
  insulin_types: ['rapid'],
  language: 'fr',
  target_low: 70,
  target_high: 180,
};

function build(over: Partial<Parameters<typeof buildReportStats>[0]> = {}) {
  return buildReportStats({
    days: 7,
    profile,
    glucoseLogs: [],
    insulinLogs: [],
    meals: [],
    activityLogs: [],
    now: NOW,
    ...over,
  });
}

describe('buildReportStats — empty dataset', () => {
  it('reports absence rather than zeros for every derived figure', () => {
    const s = build();
    expect(s.count).toBe(0);
    expect(s.avg).toBeNull();
    expect(s.min).toBeNull();
    expect(s.max).toBeNull();
    expect(s.sd).toBeNull();
    expect(s.cv).toBeNull();
    expect(s.ea1c).toBeNull();
    expect(s.gmi).toBeNull();
    expect(s.avgInsulinPerDay).toBeNull();
    expect(s.avgCarbsPerDay).toBeNull();
    expect(s.avgSugarPerDay).toBeNull();
  });

  it('reports counts and percentages as zero', () => {
    const s = build();
    expect(s.perDay).toBe(0);
    expect(s.veryLowPct).toBe(0);
    expect(s.lowPct).toBe(0);
    expect(s.inRangePct).toBe(0);
    expect(s.highPct).toBe(0);
    expect(s.veryHighPct).toBe(0);
    expect(s.totalInsulin).toBe(0);
    expect(s.insulinDays).toBe(0);
    expect(s.mealsCount).toBe(0);
    expect(s.totalCarbs).toBe(0);
    expect(s.activitySessions).toBe(0);
    expect(s.totalActivityMin).toBe(0);
  });

  it('still emits one byDay row per requested day and four slots', () => {
    const s = build();
    expect(s.byDay).toHaveLength(7);
    expect(s.byDay.every((d) => d.count === 0 && d.avg === null)).toBe(true);
    expect(s.bySlot.map((x) => x.key)).toEqual(['night', 'morning', 'afternoon', 'evening']);
    expect(s.bySlot.every((x) => x.count === 0 && x.avg === null)).toBe(true);
  });
});

describe('buildReportStats — window', () => {
  it('spans from midnight of the earliest day to now', () => {
    const s = build();
    expect(s.from.toISOString()).toBe('2026-01-08T00:00:00.000Z');
    expect(s.to.toISOString()).toBe('2026-01-15T12:00:00.000Z');
    expect(s.days).toBe(7);
  });

  it('excludes a reading older than the cutoff', () => {
    const s = build({ glucoseLogs: [glucose(120, 7, 23, 59)] });
    expect(s.count).toBe(0);
  });

  it('includes a reading exactly at the cutoff', () => {
    const s = build({ glucoseLogs: [glucose(120, 8, 0, 0)] });
    expect(s.count).toBe(1);
  });

  /**
   * KNOWN-BAD BASELINE — P9-002
   * `inWindow` tests only the lower bound. A future-dated log — from a device
   * with a wrong clock, or a sync replaying a bad timestamp — is counted in the
   * average, the bands and the totals. `computeIOB` in the bolus engine
   * explicitly rejects `t > now`; this builder does not.
   * Owning remediation: RU-4 (time contract) + RU-5 (sync).
   */
  it('KNOWN-BAD BASELINE — P9-002: a future-dated reading is counted', () => {
    const s = build({ glucoseLogs: [glucose(400, 20)] }); // five days ahead
    expect(s.count).toBe(1);
    expect(s.avg).toBe(400);
    expect(s.veryHighPct).toBe(100);
  });
});

describe('buildReportStats — consensus bands', () => {
  // 54 and 250 are fixed; 70/180 come from the profile target.
  const boundary = [53, 54, 69, 70, 180, 181, 250, 251].map((v, i) => glucose(v, 10, 8, i));

  it('classifies each boundary value into the expected band', () => {
    const s = build({ glucoseLogs: boundary });
    expect(s.count).toBe(8);
    expect(s.veryLowPct).toBe(12.5); // 53
    expect(s.lowPct).toBe(25); // 54, 69
    expect(s.inRangePct).toBe(25); // 70, 180
    expect(s.highPct).toBe(25); // 181, 250
    expect(s.veryHighPct).toBe(12.5); // 251
  });

  it('rolls the two low bands and the two high bands into the summary counts', () => {
    const s = build({ glucoseLogs: boundary });
    expect(s.veryLows).toBe(1);
    expect(s.lows).toBe(3); // veryLows + lows
    expect(s.highs).toBe(3); // highs + veryHighs
  });

  it('sums the five band percentages to 100', () => {
    const s = build({ glucoseLogs: boundary });
    const total = s.veryLowPct + s.lowPct + s.inRangePct + s.highPct + s.veryHighPct;
    expect(total).toBe(100);
  });

  it('honours a personalised target range', () => {
    const s = build({
      profile: { ...profile, target_low: 80, target_high: 140 },
      glucoseLogs: [glucose(75, 10), glucose(100, 10), glucose(160, 10)],
    });
    expect(s.lowPct).toBeCloseTo(33.3, 1);
    expect(s.inRangePct).toBeCloseTo(33.3, 1);
    expect(s.highPct).toBeCloseTo(33.3, 1);
  });

  it('falls back to 70/180 when the profile has no target', () => {
    const s = build({ profile: null, glucoseLogs: [glucose(75, 10), glucose(190, 10)] });
    expect(s.inRangePct).toBe(50);
    expect(s.highPct).toBe(50);
  });
});

describe('buildReportStats — central tendency and spread', () => {
  it('rounds the mean and derives eA1c and GMI from the rounded value', () => {
    const s = build({ glucoseLogs: [53, 54, 69, 70, 180, 181, 250, 251].map((v) => glucose(v, 10)) });
    expect(s.avg).toBe(139);
    expect(s.min).toBe(53);
    expect(s.max).toBe(251);
    expect(s.ea1c).toBe(6.5); // (139 + 46.7) / 28.7
    expect(s.gmi).toBe(6.6); // 3.31 + 0.02392 × 139
  });

  it('needs more than one reading before reporting a spread', () => {
    const one = build({ glucoseLogs: [glucose(120, 10)] });
    expect(one.avg).toBe(120);
    expect(one.sd).toBeNull();
    expect(one.cv).toBeNull();
  });

  it('computes the sample standard deviation and CV', () => {
    const s = build({ glucoseLogs: [glucose(90, 10), glucose(110, 10)] });
    expect(s.avg).toBe(100);
    expect(s.sd).toBe(14); // sqrt(200) = 14.14
    expect(s.cv).toBe(14);
  });

  it('reports zero spread for identical readings', () => {
    const s = build({ glucoseLogs: [100, 100, 100, 100].map((v) => glucose(v, 10)) });
    expect(s.sd).toBe(0);
    expect(s.cv).toBe(0);
  });

  it('computes the variance against the ROUNDED mean, not the exact one', () => {
    // Documented, not defective: the deviation this introduces is bounded by
    // the 0.5 mg/dL rounding and vanishes again in the rounded SD. Recorded so
    // a future switch to the exact mean is a visible, deliberate change.
    const s = build({ glucoseLogs: [glucose(100, 10), glucose(101, 10)] });
    expect(s.avg).toBe(101); // exact mean is 100.5
    expect(s.sd).toBe(1);
  });

  /**
   * KNOWN-BAD BASELINE — P9-004
   * One corrupt reading turns avg, min, max, SD and CV into NaN — which the UI
   * renders as "NaN" — while the band percentages still report a confident
   * figure computed over the remaining readings, and eA1c/GMI fall back to null
   * (indistinguishable from "not enough data"). No validation rejects the row.
   * Owning remediation: RU-2 (plausibility) + RU-16 (data layer).
   */
  it('KNOWN-BAD BASELINE — P9-004: a single NaN reading poisons the summary but not the percentages', () => {
    const s = build({ glucoseLogs: [glucose(100, 10), glucose(Number.NaN, 10)] });
    expect(Number.isNaN(s.avg as number)).toBe(true);
    expect(Number.isNaN(s.min as number)).toBe(true);
    expect(Number.isNaN(s.max as number)).toBe(true);
    expect(Number.isNaN(s.sd as number)).toBe(true);
    expect(s.count).toBe(2);
    expect(s.inRangePct).toBe(50); // still confident
    expect(s.ea1c).toBeNull(); // reads as "no data", not "bad data"
    expect(s.gmi).toBeNull();
  });
});

describe('buildReportStats — day-by-day bucketing', () => {
  /**
   * KNOWN-BAD BASELINE — P9-001
   * `byDay` is built by stepping `days` times from the floored `from`, so for a
   * 7-day window it covers Jan 8–14 and TODAY has no row. Readings, meals and
   * doses logged today pass `inWindow` and are counted in the headline totals,
   * but `dayMap.get()` misses and they are dropped from the chart.
   *
   * The exported PDF therefore shows a trend chart whose sums do not equal the
   * totals printed beside it, and today's data is invisible to the doctor.
   * Owning remediation: RU-4.
   */
  it('KNOWN-BAD BASELINE — P9-001: today has no byDay row', () => {
    const s = build();
    expect(s.byDay.map((d) => d.date)).toEqual([
      '2026-01-08',
      '2026-01-09',
      '2026-01-10',
      '2026-01-11',
      '2026-01-12',
      '2026-01-13',
      '2026-01-14',
    ]);
    expect(s.byDay.map((d) => d.date)).not.toContain('2026-01-15');
  });

  it("KNOWN-BAD BASELINE — P9-001: today's readings count in the totals but not in the chart", () => {
    const s = build({ glucoseLogs: [glucose(200, 15, 8)] });
    expect(s.count).toBe(1);
    expect(s.avg).toBe(200);
    expect(s.byDay.reduce((acc, d) => acc + d.count, 0)).toBe(0);
  });

  it("KNOWN-BAD BASELINE — P9-001: today's carbs and insulin diverge between totals and chart", () => {
    const s = build({ meals: [meal(60, 15)], insulinLogs: [insulin(6, 15)] });
    expect(s.totalCarbs).toBe(60);
    expect(s.totalInsulin).toBe(6);
    expect(s.byDay.reduce((acc, d) => acc + d.carbs, 0)).toBe(0);
    expect(s.byDay.reduce((acc, d) => acc + d.insulin, 0)).toBe(0);
  });

  it('aggregates a day that IS in the window correctly', () => {
    const s = build({
      glucoseLogs: [glucose(100, 10, 8), glucose(200, 10, 14), glucose(150, 10, 20)],
      meals: [meal(30, 10), meal(45, 10)],
      insulinLogs: [insulin(4, 10), insulin(6, 10)],
    });
    const row = s.byDay.find((d) => d.date === '2026-01-10');
    expect(row).toMatchObject({ count: 3, avg: 150, min: 100, max: 200, carbs: 75, insulin: 10 });
  });

  it('formats the day label as DD/MM', () => {
    const s = build();
    expect(s.byDay[0].label).toBe('08/01');
  });

  it('produces no byDay rows at all for a zero-day window', () => {
    const s = build({ days: 0, glucoseLogs: [glucose(120, 15, 8)] });
    expect(s.byDay).toEqual([]);
    expect(s.count).toBe(1); // still counted in the headline
  });
});

describe('buildReportStats — time-of-day slots', () => {
  it.each([
    ['night', 0],
    ['night', 5],
    ['morning', 6],
    ['morning', 11],
    ['afternoon', 12],
    ['afternoon', 17],
    ['evening', 18],
    ['evening', 23],
  ])('assigns %s to hour %i', (key, hour) => {
    const s = build({ glucoseLogs: [glucose(120, 10, hour)] });
    const slot = s.bySlot.find((x) => x.key === key);
    expect(slot?.count).toBe(1);
  });

  it('counts lows and highs per slot against the personal target', () => {
    const s = build({
      glucoseLogs: [glucose(60, 10, 8), glucose(120, 10, 9), glucose(220, 10, 10)],
    });
    const morning = s.bySlot.find((x) => x.key === 'morning');
    expect(morning).toMatchObject({ count: 3, avg: 133, lows: 1, highs: 1 });
  });
});

describe('buildReportStats — insulin, food and activity totals', () => {
  it('splits rapid and long and rounds to 0.1 U', () => {
    const s = build({
      insulinLogs: [insulin(4.25, 10), insulin(6, 11), insulin(20, 10, 'long')],
    });
    expect(s.totalInsulin).toBe(30.3); // 30.25 → 30.3
    expect(s.rapidU).toBe(10.3);
    expect(s.longU).toBe(20);
  });

  /**
   * KNOWN-BAD BASELINE — P9-003
   * `mixed` insulin is counted in `totalInsulin` but appears in neither
   * `rapidU` nor `longU`, so the two sub-totals do not add up to the total the
   * doctor reads beside them. The type is offered in the logging UI.
   * Owning remediation: RU-11 → RU-4. Same root omission as the IOB gap.
   */
  it('KNOWN-BAD BASELINE — P9-003: mixed insulin is in the total but in neither breakdown', () => {
    const s = build({ insulinLogs: [insulin(12, 10, 'mixed')] });
    expect(s.totalInsulin).toBe(12);
    expect(s.rapidU).toBe(0);
    expect(s.longU).toBe(0);
  });

  /**
   * KNOWN-BAD BASELINE — P9-005
   * The "per day" averages divide by the number of days that HAVE an entry, not
   * by the length of the window. A patient who logged insulin on one day of
   * seven sees that day's total presented as their daily average — a 7×
   * overstatement of typical daily insulin, and the same for carbohydrate.
   * Owning remediation: RU-6 (presentation contract).
   */
  it('KNOWN-BAD BASELINE — P9-005: averages divide by days-with-data, not window length', () => {
    const s = build({ insulinLogs: [insulin(30, 10)], meals: [meal(200, 10)] });
    expect(s.insulinDays).toBe(1);
    expect(s.avgInsulinPerDay).toBe(30); // not 30 / 7
    expect(s.avgCarbsPerDay).toBe(200); // not 200 / 7
  });

  it('averages across the days that do have data', () => {
    const s = build({ insulinLogs: [insulin(10, 10), insulin(20, 11)] });
    expect(s.insulinDays).toBe(2);
    expect(s.avgInsulinPerDay).toBe(15);
  });

  it('divides readings-per-day by the elapsed window, which is longer than `days`', () => {
    // `from` is floored to midnight, so a 7-day window actually spans 7.5 days
    // and `elapsedDays` ceils to 8. Eight readings report 1.0/day, not 1.1.
    const s = build({ glucoseLogs: [53, 54, 69, 70, 180, 181, 250, 251].map((v) => glucose(v, 10)) });
    expect(s.perDay).toBe(1);
  });

  it('treats a missing carbohydrate value as zero', () => {
    const m = meal(0, 10);
    // @ts-expect-error — characterizing a row that arrived without the field.
    delete m.result.carbohydrates;
    const s = build({ meals: [m] });
    expect(s.totalCarbs).toBe(0);
    expect(s.mealsCount).toBe(1);
  });

  it('sums activity sessions and minutes', () => {
    const s = build({ activityLogs: [activity(30, 10), activity(45, 11)] });
    expect(s.activitySessions).toBe(2);
    expect(s.totalActivityMin).toBe(75);
  });

  it('counts duplicate rows twice — there is no event identity', () => {
    const g = glucose(300, 10);
    const i = insulin(8, 10);
    const s = build({ glucoseLogs: [g, { ...g }], insulinLogs: [i, { ...i }] });
    expect(s.count).toBe(2);
    expect(s.totalInsulin).toBe(16);
  });
});

describe('trendGeometry', () => {
  const withDays = build({
    glucoseLogs: [glucose(100, 9), glucose(200, 10), glucose(150, 11)],
  });

  it('returns null when fewer than two days have an average', () => {
    const one = build({ glucoseLogs: [glucose(100, 9)] });
    expect(trendGeometry(one.byDay, 70, 180)).toBeNull();
    expect(trendGeometry([], 70, 180)).toBeNull();
  });

  it('plots one point per day that has an average', () => {
    const g = trendGeometry(withDays.byDay, 70, 180);
    expect(g).not.toBeNull();
    expect(g!.points).toHaveLength(3);
    expect(g!.points.map((p) => p.value)).toEqual([100, 200, 150]);
  });

  it('emits a polyline that starts with M and an area that closes with Z', () => {
    const g = trendGeometry(withDays.byDay, 70, 180)!;
    expect(g.line.startsWith('M')).toBe(true);
    expect(g.area.endsWith('Z')).toBe(true);
    expect(g.width).toBe(620);
    expect(g.height).toBe(200);
  });

  it('places the target band with the high bound above the low bound', () => {
    const g = trendGeometry(withDays.byDay, 70, 180)!;
    expect(g.band.height).toBeGreaterThan(0);
    expect(g.yTicks.map((t) => t.value)).toEqual([40, 70, 180, 260]);
  });

  it('widens the axis when a value falls outside the default 40–260 span', () => {
    const extreme = build({ glucoseLogs: [glucose(20, 9), glucose(400, 10)] });
    const g = trendGeometry(extreme.byDay, 70, 180)!;
    expect(g.yTicks[0].value).toBe(0); // min 20 − 20
    expect(g.yTicks[3].value).toBe(420); // max 400 + 20
  });
});

/**
 * NUTR-A11 — a carbohydrate FLOOR must never print as a definitive total in
 * the document a clinician reads.
 *
 * The patient surfaces have rendered a floor honestly since Step 22B; this
 * report summed `result.carbohydrates` blind. These fixtures pin the fix and,
 * just as importantly, pin that **no sum moved**: an unknown carbohydrate
 * still contributes its placeholder 0 exactly as before.
 */
describe('buildReportStats — carbohydrate provenance (NUTR-A11)', () => {
  /** A meal whose carbohydrate is explicitly unknown (Step 10 provenance). */
  function unknownCarbMeal(day: number): MealScan {
    const m = meal(0, day);
    return { ...m, result: { ...m.result, carbs_known: false } };
  }

  /** A meal that declares its carbohydrate. */
  function knownCarbMeal(carbohydrates: number, day: number): MealScan {
    const m = meal(carbohydrates, day);
    return { ...m, result: { ...m.result, carbs_known: true } };
  }

  it('does not flag a floor when every meal declares its carbohydrate', () => {
    const s = build({ meals: [knownCarbMeal(40, 10), knownCarbMeal(60, 11)] });
    expect(s.carbsAreFloor).toBe(false);
    expect(s.unknownCarbMeals).toBe(0);
    expect(s.totalCarbs).toBe(100);
  });

  it('flags the window as a floor when one meal has an unknown carbohydrate', () => {
    const s = build({ meals: [knownCarbMeal(40, 10), unknownCarbMeal(11)] });
    expect(s.carbsAreFloor).toBe(true);
    expect(s.unknownCarbMeals).toBe(1);
  });

  it('leaves the arithmetic untouched — an unknown carbohydrate still adds 0', () => {
    const known = build({ meals: [knownCarbMeal(40, 10)] });
    const withUnknown = build({ meals: [knownCarbMeal(40, 10), unknownCarbMeal(11)] });
    expect(withUnknown.totalCarbs).toBe(known.totalCarbs);
  });

  it('flags only the day that actually holds the unknown meal', () => {
    const s = build({ meals: [knownCarbMeal(40, 10), unknownCarbMeal(11)] });
    const d10 = s.byDay.find((d) => d.date === '2026-01-10')!;
    const d11 = s.byDay.find((d) => d.date === '2026-01-11')!;
    expect(d10.carbsAreFloor).toBe(false);
    expect(d11.carbsAreFloor).toBe(true);
  });

  it('treats a legacy meal with no provenance flag and a real value as known', () => {
    // A zero-fill could not have produced 42, so a legacy non-zero stays trusted
    // (the rule `carbStatus` already applies everywhere else).
    const s = build({ meals: [meal(42, 10)] });
    expect(s.carbsAreFloor).toBe(false);
  });

  it('treats a legacy meal with an ambiguous zero as not-known', () => {
    const s = build({ meals: [meal(0, 10)] });
    expect(s.carbsAreFloor).toBe(true);
  });
});

/**
 * NUTR-A11, rendering half — the `≥` must reach the page, not just the stats
 * object. This is the assertion that would have caught the original defect.
 */
describe('buildReportHtml — carbohydrate floors are visible (NUTR-A11)', () => {
  function knownCarbMeal(carbohydrates: number, day: number): MealScan {
    const m = meal(carbohydrates, day);
    return { ...m, result: { ...m.result, carbs_known: true } };
  }
  function unknownCarbMeal(day: number): MealScan {
    const m = meal(0, day);
    return { ...m, result: { ...m.result, carbs_known: false } };
  }

  const narrative = { observations: [], positives: [], improvements: [] };
  const patient = { name: 'T', diabetesType: 'type1' };

  const html = (over: Parameters<typeof build>[0], mealRows: ReportMealRow[]) =>
    buildReportHtml({
      stats: build(over),
      narrative,
      patient,
      low: 70,
      high: 180,
      trend: null,
      meals: mealRows,
    });

  const row = (carbs: number, carbsAreFloor: boolean): ReportMealRow => ({
    createdAt: at(10),
    name: 'Couscous',
    carbs,
    carbsAreFloor,
    sugar: 0,
    calories: 300,
    sourceLabel: 'Estimation IA',
  });

  it('prints a definitive total when the carbohydrate is known', () => {
    const out = html({ meals: [knownCarbMeal(42, 10)] }, [row(42, false)]);
    expect(out).toContain('42 g');
    expect(out).not.toContain('≥ 42 g');
  });

  it('prints "≥" instead of a definitive total when the meal is a floor', () => {
    const out = html({ meals: [knownCarbMeal(42, 10), unknownCarbMeal(11)] }, [row(42, true)]);
    expect(out).toContain('≥ 42 g');
  });

  it('explains the "≥" sign so a clinician can read it', () => {
    const out = html({ meals: [knownCarbMeal(42, 10), unknownCarbMeal(11)] }, [row(42, true)]);
    expect(out).toContain('minimal');
    expect(out).toContain('un repas contient');
  });

  it('adds no floor note at all when nothing is a floor', () => {
    const out = html({ meals: [knownCarbMeal(42, 10)] }, [row(42, false)]);
    expect(out).not.toContain('« ≥ »');
  });
});
