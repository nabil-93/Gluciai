import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Path } from 'react-native-svg';

import { CalendarSheet } from '@/components/journal/CalendarSheet';
import { DetailSheet, type VisibleEvent } from '@/components/journal/DetailSheet';
import { CalendarGlyph, METRIC, logoFor, type MetricKey } from '@/components/journal/metricIcons';
import { dayScore, periodSummaries, scoreBand } from '@/components/journal/dayScore';
import { confirmAsync } from '@/lib/confirm';
import { nowDate } from '@/lib/clock';
import {
  deleteActivity,
  deleteEvent,
  deleteGlucose,
  deleteInsulin,
  deleteMeal,
  deleteMeasure,
} from '@/services/data';
import { buildDayEvents, dayTotals, type DayEvent } from '@/services/dayLog';
import { setPendingScan } from '@/services/scanSession';
import { useAppStore } from '@/store/useAppStore';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const INK = '#1E2430';
// Readable on white (≈4.9:1) — the lighter #8A93A0 fell under AA for body text.
const MUTED = '#6B7280';
const GREEN = '#17A24A';

type Tab = 'day' | 'week' | 'month';
type TlFilter = 'all' | 'glucose' | 'meal' | 'insulin';
const sameDate = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/* ───────────────────────── Score ring ───────────────────────── */
function ScoreRing({ pct, onPress }: { pct: number; onPress: () => void }) {
  const size = 84;
  const r = 36;
  const c = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, pct / 100)) * c;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 84 84">
        <Circle cx={42} cy={42} r={r} fill="none" stroke="rgba(255,255,255,0.25)" strokeWidth={7} />
        <Circle
          cx={42}
          cy={42}
          r={r}
          fill="none"
          stroke="#C6F24E"
          strokeWidth={7}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c - dash}`}
          transform="rotate(-90 42 42)"
        />
      </Svg>
      <View style={styles.ringCenter}>
        <View style={styles.ringGlyph}>
          <CalendarGlyph size={22} color="#fff" />
        </View>
      </View>
    </Pressable>
  );
}

/* ───────────────────────── Overview card ───────────────────────── */
function MetricCard({
  metric,
  value,
  unit,
  sub,
}: {
  metric: MetricKey;
  value: string;
  unit: string;
  sub: string;
}) {
  const m = METRIC[metric];
  const { t } = useTranslation();
  const label =
    metric === 'glucose'
      ? t('journalV2.mGlucose')
      : metric === 'carbs'
        ? t('journalV2.mCarbs')
        : metric === 'insulin'
          ? t('journalV2.mInsulin')
          : t('journalV2.mActivity');
  return (
    <View style={styles.metricCard}>
      <View style={[styles.metricIcon, { backgroundColor: m.tint }]}>
        <m.Icon size={20} color={m.color} />
      </View>
      <Text style={styles.metricLabel} numberOfLines={1}>
        {label}
      </Text>
      <View style={styles.metricValRow}>
        <Text style={styles.metricVal}>{value}</Text>
        {unit ? <Text style={styles.metricUnit}>{unit}</Text> : null}
      </View>
      <Text style={styles.metricSub} numberOfLines={1}>
        {sub}
      </Text>
    </View>
  );
}

/* ───────────────────────── Timeline row ───────────────────────── */
function TimelineRow({
  event,
  last,
  onPress,
}: {
  event: VisibleEvent;
  last: boolean;
  onPress: () => void;
}) {
  const { t, i18n } = useTranslation();
  const m = logoFor(event);
  const time = new Date(event.created_at).toLocaleTimeString(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  });

  let title = '';
  let sub = '';
  let thumb: string | null = null;

  if (event.kind === 'meal') {
    const r = event.meal.result;
    title = t('history.meal');
    sub = `${event.meal.meal_type ? t(`mealType.${event.meal.meal_type}`) + ' · ' : ''}${Math.round(r.carbohydrates)} g ${t('journalV2.mCarbs').toLowerCase()}`;
    if (event.meal.image_url && /^(https?|blob|data|file):/i.test(event.meal.image_url))
      thumb = event.meal.image_url;
  } else if (event.kind === 'insulin') {
    title = t('journalV2.mInsulin');
    sub = `${event.insulin.dose} U · ${t(`day.insu_${event.insulin.insulin_type}`)}`;
  } else if (event.kind === 'glucose') {
    title = t('journalV2.mGlucose');
    sub = `${event.glucose.value} mg/dL`;
  } else if (event.kind === 'activity') {
    title = t('journalV2.mActivity');
    sub = `${event.activity.kind} · ${event.activity.duration_min} min`;
  } else if (event.kind === 'measure') {
    title = t(`journalV2.measure_${event.measure.kind}`, t('day.measures'));
    sub = `${event.measure.value} ${event.measure.unit}`;
  } else if (event.event.kind === 'note') {
    title = t('journalV2.note');
    sub = String(event.event.payload.text ?? '');
  } else if (event.event.kind === 'status') {
    title = t('journalV2.statusChanged');
    sub = `${t(`events.st_${event.event.payload.from}`, String(event.event.payload.from))} → ${t(`events.st_${event.event.payload.to}`, String(event.event.payload.to))}`;
  } else {
    title = t('journalV2.settingsChanged');
    const fields = Object.keys(event.event.payload.changes ?? {});
    sub = fields.map((f) => t(`events.f_${f}`, f)).join(', ') || t('journalV2.settingsChanged');
  }

  return (
    <View style={styles.tlRow}>
      <View style={styles.tlSpine}>
        <Text style={styles.tlTime}>{time}</Text>
        <View style={styles.tlTrack}>
          <View style={[styles.tlDotOuter, { borderColor: m.color }]}>
            <View style={[styles.tlDotInner, { backgroundColor: m.color }]} />
          </View>
          {!last ? <View style={styles.tlLine} /> : null}
        </View>
      </View>

      <Pressable style={styles.tlCard} onPress={onPress} accessibilityRole="button">
        <View style={[styles.tlIcon, { backgroundColor: m.color }]}>
          <m.Icon size={19} color="#fff" />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.tlTitle} numberOfLines={1}>
            {title}
          </Text>
          <Text style={[styles.tlSub, { color: m.textColor }]} numberOfLines={1}>
            {sub}
          </Text>
        </View>
        {thumb ? (
          <Image source={{ uri: thumb }} style={styles.tlThumb} contentFit="cover" />
        ) : event.kind === 'meal' ? (
          <View style={styles.tlThumbPh}>
            <Text style={{ fontSize: 18 }}>🍽️</Text>
          </View>
        ) : null}
        <Svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="#C7CCD5" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
          <Path d="m9 18 6-6-6-6" />
        </Svg>
      </Pressable>
    </View>
  );
}

/* ───────────────────────── Day-summary card (week / month) ───────────────────────── */
function DaySummaryCard({
  label,
  score,
  carbs,
  insulinU,
  glucoseCount,
  onPress,
}: {
  label: string;
  score: number | null;
  carbs: number;
  insulinU: number;
  glucoseCount: number;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const band = score != null ? scoreBand(score) : null;
  return (
    <Pressable style={styles.dsCard} onPress={onPress} accessibilityRole="button">
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.dsLabel} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.dsMeta} numberOfLines={1}>
          {glucoseCount} {t('journalV2.statGlycemia').toLowerCase()} · {Math.round(carbs)} g ·{' '}
          {Math.round(insulinU * 10) / 10} U
        </Text>
      </View>
      {band ? (
        <View style={[styles.dsScore, { backgroundColor: `${band.color}18` }]}>
          <Text style={[styles.dsScoreText, { color: band.color }]}>{score}</Text>
        </View>
      ) : (
        <Text style={styles.dsNoScore}>—</Text>
      )}
      <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#C7CCD5" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
        <Path d="m9 18 6-6-6-6" />
      </Svg>
    </Pressable>
  );
}

/* ═════════════════════════ Screen ═════════════════════════ */
export default function JournalScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();

  // Subscribe so the journal live-updates as things are logged.
  const { meals, insulinLogs, glucoseLogs, activityLogs, measureLogs, eventLogs, profile } =
    useAppStore();

  const [tab, setTab] = useState<Tab>('day');
  const [selectedDay, setSelectedDay] = useState<Date>(() => nowDate());
  const [calOpen, setCalOpen] = useState(false);
  const [detail, setDetail] = useState<VisibleEvent | null>(null);
  const [tlFilter, setTlFilter] = useState<TlFilter>('all');

  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;

  const shiftDay = (delta: number) =>
    setSelectedDay((d) => {
      const next = new Date(d.getTime() + delta * 86400000);
      const t0 = nowDate();
      return next > t0 ? t0 : next; // never walk into the future
    });

  // ── Day view data ──
  const dayEvents = useMemo(
    () => buildDayEvents(selectedDay),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedDay, meals, insulinLogs, glucoseLogs, activityLogs, measureLogs, eventLogs]
  );
  const dayTot = useMemo(() => dayTotals(dayEvents), [dayEvents]);
  const daySc = useMemo(() => dayScore(dayEvents, low, high), [dayEvents, low, high]);
  // Newest first — EVERY entry the patient produced that day: meals, readings,
  // doses, sport, body measures, notes, status changes and settings changes.
  const feed = useMemo(() => [...dayEvents].reverse() as VisibleEvent[], [dayEvents]);
  const insulinDoses = useMemo(() => dayEvents.filter((e) => e.kind === 'insulin').length, [dayEvents]);
  // Timeline filtered by the chip row (Tous / Glycémie / Repas / Insuline).
  const filteredFeed = useMemo(() => {
    if (tlFilter === 'all') return feed;
    if (tlFilter === 'meal') return feed.filter((e) => e.kind === 'meal');
    if (tlFilter === 'insulin') return feed.filter((e) => e.kind === 'insulin');
    return feed.filter((e) => e.kind === 'glucose');
  }, [feed, tlFilter]);

  // ── Week / month view data ──
  const summaries = useMemo(
    () => periodSummaries(tab === 'week' ? 7 : 30, low, high),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [tab, low, high, meals, insulinLogs, glucoseLogs, activityLogs, measureLogs, eventLogs]
  );
  const period = useMemo(() => {
    const active = summaries.filter((s) => s.events.length > 0);
    const scores = active.map((s) => s.score).filter((x): x is number => x != null);
    let glySum = 0;
    let glyCount = 0;
    let carbs = 0;
    let insulinU = 0;
    let sportMin = 0;
    let doses = 0;
    for (const s of summaries) {
      carbs += s.totals.carbs;
      insulinU += s.totals.insulinU;
      sportMin += s.totals.sportMin;
      doses += s.events.filter((e) => e.kind === 'insulin').length;
      if (s.totals.avgGlucose != null) {
        glySum += s.totals.avgGlucose * s.totals.glucoseCount;
        glyCount += s.totals.glucoseCount;
      }
    }
    return {
      score: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null,
      avgGlucose: glyCount ? Math.round(glySum / glyCount) : null,
      carbs,
      insulinU,
      sportMin,
      glucoseCount: glyCount,
      doses,
      activeDays: active.length,
    };
  }, [summaries]);

  const isDay = tab === 'day';
  const today = nowDate();

  // Top line of the score card: the exact day, the 7-day range, or the month —
  // never the same words as the score title just below it.
  const dateLabel = isDay
    ? sameDate(selectedDay, today)
      ? t('timeline.today')
      : sameDate(selectedDay, new Date(today.getTime() - 86400000))
        ? t('timeline.yesterday')
        : selectedDay.toLocaleDateString(i18n.language, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })
    : tab === 'week'
      ? `${new Date(today.getTime() - 6 * 86400000).toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })} – ${today.toLocaleDateString(i18n.language, { day: 'numeric', month: 'short' })}`
      : today.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' });

  const score = isDay ? daySc : period.score;
  const band = score != null ? scoreBand(score) : null;

  const scoreTitle =
    tab === 'day' ? t('journalV2.scoreDay') : tab === 'week' ? t('journalV2.scoreWeek') : t('journalV2.scoreMonth');
  const overviewTitle =
    tab === 'day' ? t('journalV2.overviewDay') : tab === 'week' ? t('journalV2.overviewWeek') : t('journalV2.overviewMonth');

  // Score-card mini stats
  const stat = isDay
    ? {
        measures: dayTot.glucoseCount,
        doses: insulinDoses,
        carbs: Math.round(dayTot.carbs),
        activity: dayTot.sportMin,
      }
    : {
        measures: period.glucoseCount,
        doses: period.doses,
        carbs: Math.round(period.carbs),
        activity: period.sportMin,
      };

  // Overview metric values
  const overview = isDay
    ? {
        glucose: dayTot.avgGlucose != null ? String(dayTot.avgGlucose) : '—',
        carbs: String(Math.round(dayTot.carbs)),
        insulin: String(Math.round(dayTot.insulinU * 10) / 10),
        activity: String(dayTot.sportMin),
      }
    : {
        glucose: period.avgGlucose != null ? String(period.avgGlucose) : '—',
        carbs: String(Math.round(period.carbs)),
        insulin: String(Math.round(period.insulinU * 10) / 10),
        activity: String(period.sportMin),
      };

  const onDelete = async (e: VisibleEvent) => {
    const ok = await confirmAsync({
      title: t('journalV2.deleteConfirmT'),
      message: t('journalV2.deleteConfirmM'),
      confirmLabel: t('journalV2.delete'),
      cancelLabel: t('common.cancel'),
      destructive: true,
    });
    if (!ok) return;
    if (e.kind === 'glucose') deleteGlucose(e.glucose.id);
    else if (e.kind === 'insulin') deleteInsulin(e.insulin.id);
    else if (e.kind === 'activity') deleteActivity(e.activity.id);
    else if (e.kind === 'measure') deleteMeasure(e.measure.id);
    else if (e.kind === 'meal') deleteMeal(e.meal.id);
    else deleteEvent(e.event.id);
    setDetail(null);
  };

  const onViewMeal = (e: Extract<DayEvent, { kind: 'meal' }>) => {
    setDetail(null);
    setPendingScan(e.meal.result, e.meal.image_url, undefined, undefined, true, {
      id: e.meal.id,
      mealType: e.meal.meal_type,
    });
    router.push('/scan-result');
  };

  const jumpToDay = (d: Date) => {
    setSelectedDay(d);
    setTab('day');
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 10,
          paddingHorizontal: 16,
          paddingBottom: 120 + insets.bottom,
        }}
      >
        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headBtnGhost} />
          <Text style={styles.headTitle}>{t('history.title')}</Text>
          <Pressable
            style={styles.headBtn}
            onPress={() => setCalOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={t('journalV2.selectDay')}
          >
            <CalendarGlyph size={18} color={INK} />
          </Pressable>
        </View>

        {/* ── Jour / Semaine / Mois ── */}
        <View style={styles.tabs}>
          {(['day', 'week', 'month'] as Tab[]).map((f) => (
            <Pressable
              key={f}
              onPress={() => setTab(f)}
              style={[styles.tab, tab === f && styles.tabActive]}
              accessibilityRole="tab"
              accessibilityState={{ selected: tab === f }}
            >
              <Text style={[styles.tabText, tab === f && styles.tabTextActive]}>
                {t(`history.${f}`)}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* ── Day navigation (‹ date ›) — quick step to the day before/after,
             while the calendar button jumps anywhere ── */}
        {isDay ? (
          <View style={styles.navRow}>
            <Pressable onPress={() => shiftDay(-1)} hitSlop={8} style={styles.navBtn} accessibilityRole="button">
              <Text style={styles.navArrow}>‹</Text>
            </Pressable>
            <Text style={styles.navDay} numberOfLines={1}>
              {dateLabel}
            </Text>
            <Pressable
              onPress={() => shiftDay(1)}
              disabled={sameDate(selectedDay, today)}
              hitSlop={8}
              style={[styles.navBtn, sameDate(selectedDay, today) && { opacity: 0.3 }]}
              accessibilityRole="button"
            >
              <Text style={styles.navArrow}>›</Text>
            </Pressable>
          </View>
        ) : null}

        {/* ── Score card ── */}
        <View style={styles.scoreCard}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.scoreDate} numberOfLines={1}>
              {dateLabel}
            </Text>
            <Text style={styles.scoreLabel}>{scoreTitle}</Text>
            {score != null ? (
              <View style={styles.scoreValRow}>
                <Text style={styles.scoreValue}>{score}%</Text>
                {band ? (
                  <View style={styles.badge}>
                    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
                      <Path d="M20 6 9 17l-5-5" />
                    </Svg>
                    <Text style={styles.badgeText}>{t(band.key)}</Text>
                  </View>
                ) : null}
              </View>
            ) : (
              <Text style={styles.scoreEmpty}>—</Text>
            )}
          </View>
          <ScoreRing pct={score ?? 0} onPress={() => setCalOpen(true)} />
        </View>

        {/* mini stats inside the green band */}
        <View style={styles.statStripWrap}>
          <View style={styles.statStrip}>
            <MiniStat icon="glucose" value={String(stat.measures)} top={t('journalV2.statMeasures')} bottom={t('journalV2.statGlycemia')} />
            <View style={styles.statDivider} />
            <MiniStat icon="insulin" value={String(stat.doses)} top={t('journalV2.statDose')} bottom={t('journalV2.statInsulin')} />
            <View style={styles.statDivider} />
            <MiniStat icon="carbs" value={`${stat.carbs} g`} top={t('journalV2.statCarbs')} />
            <View style={styles.statDivider} />
            <MiniStat icon="activity" value={`${stat.activity}`} bottom="min" top={t('journalV2.statActivity')} />
          </View>
        </View>

        {/* ── Overview ── */}
        <Text style={styles.sectionTitle}>{overviewTitle}</Text>
        <View style={styles.metricRow}>
          <MetricCard metric="glucose" value={overview.glucose} unit="mg/dL" sub={t('journalV2.subAverage')} />
          <MetricCard metric="carbs" value={overview.carbs} unit="g" sub={t('journalV2.subTotal')} />
        </View>
        <View style={styles.metricRow}>
          <MetricCard metric="insulin" value={overview.insulin} unit="U" sub={t('journalV2.subTotal')} />
          <MetricCard metric="activity" value={overview.activity} unit="min" sub={t('journalV2.subTotal')} />
        </View>

        {/* ── Timeline (day) or day list (week/month) ── */}
        <Text style={styles.sectionTitle}>
          {isDay ? t('journalV2.timeline') : t('history.title')}
        </Text>

        {/* Filter chips — Tous / Glycémie / Repas / Insuline */}
        {isDay && feed.length > 0 ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {(
              [
                ['all', t('journalV2.filterAll'), null],
                ['glucose', t('journalV2.mGlucose'), 'glucose'],
                ['meal', t('history.meal'), 'carbs'],
                ['insulin', t('journalV2.mInsulin'), 'insulin'],
              ] as [TlFilter, string, MetricKey | null][]
            ).map(([key, label, metric]) => {
              const on = tlFilter === key;
              const dot = metric ? METRIC[metric].color : GREEN;
              return (
                <Pressable
                  key={key}
                  onPress={() => setTlFilter(key)}
                  style={[styles.chip, on && styles.chipOn]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                >
                  {metric ? <View style={[styles.chipDot, { backgroundColor: on ? '#fff' : dot }]} /> : null}
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
        ) : null}

        {isDay ? (
          feed.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>📋</Text>
              <Text style={styles.emptyTitle}>{t('day.emptyTitle')}</Text>
              <Text style={styles.emptyMsg}>{t('day.emptyMsg')}</Text>
            </View>
          ) : filteredFeed.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🔍</Text>
              <Text style={styles.emptyMsg}>{t('journalV2.emptyPeriod')}</Text>
            </View>
          ) : (
            <View style={{ marginTop: 4 }}>
              {filteredFeed.map((e, i) => (
                <TimelineRow
                  key={e.id}
                  event={e}
                  last={i === filteredFeed.length - 1}
                  onPress={() => setDetail(e)}
                />
              ))}
            </View>
          )
        ) : period.activeDays === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyEmoji}>🗓️</Text>
            <Text style={styles.emptyMsg}>{t('journalV2.emptyPeriod')}</Text>
          </View>
        ) : (
          <View style={{ gap: 9, marginTop: 4 }}>
            {summaries
              .filter((s) => s.events.length > 0)
              .map((s) => (
                <DaySummaryCard
                  key={s.date.toDateString()}
                  label={s.date.toLocaleDateString(i18n.language, {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'short',
                  })}
                  score={s.score}
                  carbs={s.totals.carbs}
                  insulinU={s.totals.insulinU}
                  glucoseCount={s.totals.glucoseCount}
                  onPress={() => jumpToDay(s.date)}
                />
              ))}
          </View>
        )}

        {/* ── AI note ── */}
        <View style={styles.aiNote}>
          <Text style={{ fontSize: 15 }}>🤖</Text>
          <Text style={styles.aiNoteText}>{t('timeline.aiNote')}</Text>
        </View>
      </ScrollView>

      <CalendarSheet
        open={calOpen}
        selected={selectedDay}
        onSelect={(d) => {
          setSelectedDay(d);
          setTab('day');
        }}
        onClose={() => setCalOpen(false)}
      />

      <DetailSheet
        event={detail}
        onClose={() => setDetail(null)}
        onDelete={onDelete}
        onViewMeal={onViewMeal}
      />
    </View>
  );
}

/* mini-stat inside the green score band */
function MiniStat({
  icon,
  value,
  top,
  bottom,
}: {
  icon: MetricKey;
  value: string;
  top: string;
  bottom?: string;
}) {
  const m = METRIC[icon];
  return (
    <View style={styles.miniStat}>
      <View style={styles.miniIcon}>
        <m.Icon size={15} color="#fff" />
      </View>
      <Text style={styles.miniValue}>{value}</Text>
      <Text style={styles.miniTop} numberOfLines={1}>
        {top}
      </Text>
      {bottom ? (
        <Text style={styles.miniBottom} numberOfLines={1}>
          {bottom}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F6F7F9' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  headBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(20,20,30,1)',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  headBtnGhost: { width: 40, height: 40 },
  headTitle: { fontFamily: F800, fontSize: 19, color: INK, letterSpacing: -0.3 },

  tabs: {
    flexDirection: 'row',
    backgroundColor: '#EDEFF2',
    borderRadius: 14,
    padding: 4,
    gap: 4,
    marginBottom: 16,
  },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 9, borderRadius: 10 },
  tabActive: {
    backgroundColor: GREEN,
    shadowColor: GREEN,
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  tabText: { fontFamily: F700, fontSize: 13.5, color: '#5B6472' },
  tabTextActive: { color: '#fff', fontFamily: F800 },

  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#fff',
    borderRadius: 16,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 16,
    shadowColor: 'rgba(20,20,30,1)',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  navBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F2F5', alignItems: 'center', justifyContent: 'center' },
  navArrow: { fontFamily: F700, fontSize: 19, color: INK, lineHeight: 21 },
  navDay: { flex: 1, textAlign: 'center', fontFamily: F800, fontSize: 14, color: INK, textTransform: 'capitalize' },

  chipRow: { gap: 8, paddingBottom: 12, paddingRight: 4 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderWidth: 1.5,
    borderColor: '#EAECF0',
  },
  chipOn: { backgroundColor: GREEN, borderColor: GREEN },
  chipDot: { width: 7, height: 7, borderRadius: 4 },
  chipText: { fontFamily: F700, fontSize: 12.5, color: '#5B6472' },
  chipTextOn: { color: '#fff', fontFamily: F800 },

  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: GREEN,
    borderRadius: 24,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 18,
  },
  scoreDate: { fontFamily: F700, fontSize: 15, color: 'rgba(255,255,255,0.92)', textTransform: 'capitalize' },
  scoreLabel: { fontFamily: F600, fontSize: 13, color: 'rgba(255,255,255,0.95)', marginTop: 8 },
  scoreValRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2, flexWrap: 'wrap' },
  scoreValue: { fontFamily: F800, fontSize: 42, color: '#fff', letterSpacing: -1.5 },
  scoreEmpty: { fontFamily: F800, fontSize: 34, color: 'rgba(255,255,255,0.6)', marginTop: 2 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  badgeText: { fontFamily: F800, fontSize: 12, color: '#fff' },
  ringCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  ringGlyph: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  statStripWrap: {
    backgroundColor: GREEN,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingHorizontal: 12,
    paddingBottom: 16,
    marginBottom: 20,
  },
  statStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 6,
  },
  statDivider: { width: 1, alignSelf: 'stretch', backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: 4 },
  miniStat: { flex: 1, alignItems: 'center', gap: 3, paddingHorizontal: 2 },
  miniIcon: { opacity: 0.92, marginBottom: 1 },
  miniValue: { fontFamily: F800, fontSize: 17, color: '#fff' },
  miniTop: { fontFamily: F600, fontSize: 9, color: 'rgba(255,255,255,0.95)', textAlign: 'center' },
  miniBottom: { fontFamily: F600, fontSize: 9, color: 'rgba(255,255,255,0.95)', textAlign: 'center', marginTop: -1 },

  sectionTitle: { fontFamily: F800, fontSize: 16, color: INK, marginBottom: 12, marginTop: 4 },

  metricRow: { flexDirection: 'row', gap: 11, marginBottom: 11 },
  metricCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#fff',
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    shadowColor: 'rgba(20,20,30,1)',
    shadowOpacity: 0.04,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },
  metricIcon: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { fontFamily: F600, fontSize: 12, color: MUTED, marginTop: 9 },
  metricValRow: { flexDirection: 'row', alignItems: 'baseline', gap: 3, marginTop: 5 },
  metricVal: { fontFamily: F800, fontSize: 24, color: INK, letterSpacing: -0.5 },
  metricUnit: { fontFamily: F700, fontSize: 12, color: MUTED },
  metricSub: { fontFamily: F600, fontSize: 11, color: '#6B7280', marginTop: 3 },

  // Timeline
  tlRow: { flexDirection: 'row', gap: 10 },
  tlSpine: { width: 46, alignItems: 'center' },
  tlTime: { fontFamily: F700, fontSize: 11, color: '#6B7280' },
  tlTrack: { flex: 1, alignItems: 'center', marginTop: 5 },
  tlDotOuter: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 2.5,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tlDotInner: { width: 5, height: 5, borderRadius: 3 },
  tlLine: { flex: 1, width: 2, backgroundColor: '#E4E7EC', marginTop: 3 },
  tlCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#fff',
    borderRadius: 18,
    padding: 11,
    marginBottom: 14,
    shadowColor: 'rgba(20,20,30,1)',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  tlIcon: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  tlTitle: { fontFamily: F800, fontSize: 14.5, color: INK },
  tlSub: { fontFamily: F700, fontSize: 12, marginTop: 2 },
  tlThumb: { width: 42, height: 42, borderRadius: 12, backgroundColor: '#F1F2F5' },
  tlThumbPh: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F5F6F8',
    borderWidth: 1,
    borderColor: '#EAECF0',
    borderStyle: 'dashed',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Day-summary (week/month)
  dsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 15,
    shadowColor: 'rgba(20,20,30,1)',
    shadowOpacity: 0.04,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  dsLabel: { fontFamily: F800, fontSize: 13.5, color: INK, textTransform: 'capitalize' },
  dsMeta: { fontFamily: F600, fontSize: 11, color: MUTED, marginTop: 3 },
  dsScore: { minWidth: 40, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 9, alignItems: 'center' },
  dsScoreText: { fontFamily: F800, fontSize: 15 },
  dsNoScore: { fontFamily: F800, fontSize: 15, color: '#C7CCD5' },

  empty: { alignItems: 'center', paddingVertical: 34, gap: 6 },
  emptyEmoji: { fontSize: 34 },
  emptyTitle: { fontFamily: F800, fontSize: 15, color: INK },
  emptyMsg: { fontFamily: F500, fontSize: 12.5, color: MUTED, textAlign: 'center', maxWidth: 240, lineHeight: 18 },

  aiNote: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#EAF7EF',
    borderRadius: 16,
    padding: 13,
    marginTop: 18,
  },
  aiNoteText: { flex: 1, fontFamily: F600, fontSize: 11.5, color: '#0F7A42', lineHeight: 16 },
});
