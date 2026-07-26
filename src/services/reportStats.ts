import type { ActivityLog, GlucoseLog, InsulinLog, MealScan, Profile } from '@/types';

/* ────────────────────────────────────────────────────────────
 * REPORT STATISTICS — the figures a diabetologist actually reads.
 *
 * A consultation does not turn on the average alone. The international
 * consensus on time in range (Battelino et al., Diabetes Care 2019) asks for
 * the day split into bands — very low, low, in range, high, very high — plus
 * how much the readings swing, because two patients with the same mean can
 * live very different weeks. GMI and eA1c are both included and both
 * labelled as estimates: they are computed from self-measured readings, not
 * from a laboratory assay.
 *
 * Everything here is pure arithmetic over what the patient logged. Nothing
 * is inferred, and a window with too few readings says so rather than
 * printing a confident number a doctor might act on.
 * ──────────────────────────────────────────────────────────── */

export interface DayPoint {
  /** Local calendar day, YYYY-MM-DD. */
  date: string;
  label: string;
  avg: number | null;
  min: number | null;
  max: number | null;
  count: number;
  carbs: number;
  insulin: number;
}

export interface SlotStat {
  key: 'night' | 'morning' | 'afternoon' | 'evening';
  avg: number | null;
  count: number;
  lows: number;
  highs: number;
}

export interface ReportStats {
  from: Date;
  to: Date;
  days: number;

  glucose: GlucoseLog[];
  count: number;
  /** Readings per day — how much the picture can be trusted. */
  perDay: number;
  avg: number | null;
  min: number | null;
  max: number | null;
  /** Standard deviation, mg/dL. */
  sd: number | null;
  /** Coefficient of variation, %. Above 36 % = unstable glucose. */
  cv: number | null;
  /** Estimated A1c from the mean (ADAG). */
  ea1c: number | null;
  /** Glucose Management Indicator (Bergenstal 2018). */
  gmi: number | null;

  /** Share of readings in each band, % of readings. */
  veryLowPct: number;
  lowPct: number;
  inRangePct: number;
  highPct: number;
  veryHighPct: number;
  lows: number;
  highs: number;
  veryLows: number;

  byDay: DayPoint[];
  bySlot: SlotStat[];

  totalInsulin: number;
  rapidU: number;
  longU: number;
  avgInsulinPerDay: number | null;
  insulinDays: number;

  mealsCount: number;
  totalCarbs: number;
  avgCarbsPerDay: number | null;
  avgSugarPerDay: number | null;

  activitySessions: number;
  totalActivityMin: number;
}

const DAY_MS = 86_400_000;

/** Local YYYY-MM-DD — never toISOString, which shifts the day off UTC. */
function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function slotOf(h: number): SlotStat['key'] {
  if (h < 6) return 'night';
  if (h < 12) return 'morning';
  if (h < 18) return 'afternoon';
  return 'evening';
}

export function buildReportStats(args: {
  days: number;
  profile: Profile | null;
  glucoseLogs: GlucoseLog[];
  insulinLogs: InsulinLog[];
  meals: MealScan[];
  activityLogs: ActivityLog[];
  /** "Now" passed in so the caller controls clock reads (react-compiler). */
  now: number;
}): ReportStats {
  const { days, profile, glucoseLogs, insulinLogs, meals, activityLogs, now } = args;

  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;
  // The consensus bands sit at 54 and 250 whatever the personal target is:
  // below 54 is a clinically significant hypo, above 250 is a severe hyper.
  const VERY_LOW = 54;
  const VERY_HIGH = 250;

  const to = new Date(now);
  const from = new Date(now - days * DAY_MS);
  from.setHours(0, 0, 0, 0);
  const cutoff = from.getTime();

  const inWindow = (iso: string) => new Date(iso).getTime() >= cutoff;

  const glucose = glucoseLogs
    .filter((g) => inWindow(g.created_at))
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const insulin = insulinLogs.filter((l) => inWindow(l.created_at));
  const mealsP = meals.filter((m) => inWindow(m.created_at));
  const activities = activityLogs.filter((a) => inWindow(a.created_at));

  const values = glucose.map((g) => g.value);
  const n = values.length;
  const sum = values.reduce((s, v) => s + v, 0);
  const avg = n ? Math.round(sum / n) : null;

  let sd: number | null = null;
  let cv: number | null = null;
  if (n > 1 && avg !== null) {
    const variance = values.reduce((s, v) => s + (v - avg) ** 2, 0) / (n - 1);
    sd = Math.round(Math.sqrt(variance));
    cv = Math.round((sd / avg) * 1000) / 10;
  }

  const pct = (k: number) => (n ? Math.round((k / n) * 1000) / 10 : 0);
  const veryLows = values.filter((v) => v < VERY_LOW).length;
  const lowsOnly = values.filter((v) => v >= VERY_LOW && v < low).length;
  const inRange = values.filter((v) => v >= low && v <= high).length;
  const highsOnly = values.filter((v) => v > high && v <= VERY_HIGH).length;
  const veryHighs = values.filter((v) => v > VERY_HIGH).length;

  /* ── Day by day ── */
  const dayMap = new Map<string, DayPoint>();
  for (let i = 0; i < days; i += 1) {
    const d = new Date(from.getTime() + i * DAY_MS);
    if (d.getTime() > now) break;
    dayMap.set(isoDay(d), {
      date: isoDay(d),
      label: d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }),
      avg: null,
      min: null,
      max: null,
      count: 0,
      carbs: 0,
      insulin: 0,
    });
  }
  const daySums = new Map<string, number>();
  for (const g of glucose) {
    const key = isoDay(new Date(g.created_at));
    const row = dayMap.get(key);
    if (!row) continue;
    row.count += 1;
    daySums.set(key, (daySums.get(key) ?? 0) + g.value);
    row.min = row.min === null ? g.value : Math.min(row.min, g.value);
    row.max = row.max === null ? g.value : Math.max(row.max, g.value);
  }
  for (const [key, row] of dayMap) {
    if (row.count) row.avg = Math.round((daySums.get(key) ?? 0) / row.count);
  }
  for (const m of mealsP) {
    const row = dayMap.get(isoDay(new Date(m.created_at)));
    if (row) row.carbs += m.result.carbohydrates ?? 0;
  }
  for (const l of insulin) {
    const row = dayMap.get(isoDay(new Date(l.created_at)));
    if (row) row.insulin += l.dose;
  }
  const byDay = [...dayMap.values()];

  /* ── Time of day: where the trouble actually sits ── */
  const slotKeys: SlotStat['key'][] = ['night', 'morning', 'afternoon', 'evening'];
  const bySlot: SlotStat[] = slotKeys.map((key) => {
    const vals = glucose.filter((g) => slotOf(new Date(g.created_at).getHours()) === key);
    const c = vals.length;
    return {
      key,
      count: c,
      avg: c ? Math.round(vals.reduce((s, g) => s + g.value, 0) / c) : null,
      lows: vals.filter((g) => g.value < low).length,
      highs: vals.filter((g) => g.value > high).length,
    };
  });

  /* ── Insulin ── */
  const totalInsulin = insulin.reduce((s, l) => s + l.dose, 0);
  const rapidU = insulin.filter((l) => l.insulin_type === 'rapid').reduce((s, l) => s + l.dose, 0);
  const longU = insulin.filter((l) => l.insulin_type === 'long').reduce((s, l) => s + l.dose, 0);
  const insulinDays = new Set(insulin.map((l) => isoDay(new Date(l.created_at)))).size;

  /* ── Food ── */
  const totalCarbs = mealsP.reduce((s, m) => s + (m.result.carbohydrates ?? 0), 0);
  const totalSugar = mealsP.reduce((s, m) => s + (m.result.sugar ?? 0), 0);
  const mealDays = new Set(mealsP.map((m) => isoDay(new Date(m.created_at)))).size;

  const elapsedDays = Math.max(1, Math.ceil((now - cutoff) / DAY_MS));

  return {
    from,
    to,
    days,
    glucose,
    count: n,
    perDay: Math.round((n / elapsedDays) * 10) / 10,
    avg,
    min: n ? Math.min(...values) : null,
    max: n ? Math.max(...values) : null,
    sd,
    cv,
    ea1c: avg ? Math.round(((avg + 46.7) / 28.7) * 10) / 10 : null,
    gmi: avg ? Math.round((3.31 + 0.02392 * avg) * 10) / 10 : null,

    veryLowPct: pct(veryLows),
    lowPct: pct(lowsOnly),
    inRangePct: pct(inRange),
    highPct: pct(highsOnly),
    veryHighPct: pct(veryHighs),
    lows: veryLows + lowsOnly,
    highs: highsOnly + veryHighs,
    veryLows,

    byDay,
    bySlot,

    totalInsulin: Math.round(totalInsulin * 10) / 10,
    rapidU: Math.round(rapidU * 10) / 10,
    longU: Math.round(longU * 10) / 10,
    avgInsulinPerDay: insulinDays ? Math.round((totalInsulin / insulinDays) * 10) / 10 : null,
    insulinDays,

    mealsCount: mealsP.length,
    totalCarbs: Math.round(totalCarbs),
    avgCarbsPerDay: mealDays ? Math.round(totalCarbs / mealDays) : null,
    avgSugarPerDay: mealDays ? Math.round(totalSugar / mealDays) : null,

    activitySessions: activities.length,
    totalActivityMin: activities.reduce((s, a) => s + (a.duration_min || 0), 0),
  };
}

/* ── Chart geometry, computed once and drawn twice ─────────────
 * The screen renders it with react-native-svg and the PDF embeds the same
 * shapes as raw SVG markup, so what the patient sees and what the doctor
 * receives cannot drift apart.
 */

export interface TrendGeometry {
  width: number;
  height: number;
  /** Polyline through the daily averages. */
  line: string;
  /** Filled area under the line. */
  area: string;
  points: { x: number; y: number; value: number; label: string }[];
  /** The target band as a rectangle in chart space. */
  band: { y: number; height: number };
  yTicks: { y: number; value: number }[];
}

export function trendGeometry(
  byDay: DayPoint[],
  low: number,
  high: number,
  width = 620,
  height = 200
): TrendGeometry | null {
  const pts = byDay.filter((d) => d.avg !== null);
  if (pts.length < 2) return null;

  const padL = 34;
  const padB = 22;
  const padT = 10;
  const values = pts.map((d) => d.avg as number);
  const yMin = Math.min(40, Math.min(...values) - 20);
  const yMax = Math.max(260, Math.max(...values) + 20);
  const spanY = yMax - yMin || 1;

  const plotW = width - padL - 8;
  const plotH = height - padT - padB;
  const x = (i: number) => padL + (i / (pts.length - 1)) * plotW;
  const y = (v: number) => padT + plotH - ((v - yMin) / spanY) * plotH;

  const points = pts.map((d, i) => ({
    x: Math.round(x(i) * 10) / 10,
    y: Math.round(y(d.avg as number) * 10) / 10,
    value: d.avg as number,
    label: d.label,
  }));

  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x},${p.y}`).join(' ');
  const area =
    `${line} L${points[points.length - 1].x},${padT + plotH} L${points[0].x},${padT + plotH} Z`;

  const yTop = y(high);
  const yBottom = y(low);

  return {
    width,
    height,
    line,
    area,
    points,
    band: { y: Math.round(yTop * 10) / 10, height: Math.round((yBottom - yTop) * 10) / 10 },
    yTicks: [yMin, low, high, yMax].map((v) => ({ y: Math.round(y(v) * 10) / 10, value: Math.round(v) })),
  };
}
