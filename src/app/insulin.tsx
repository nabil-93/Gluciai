import React, { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft, FadeInView } from '@/components/ui';
import { CoachChatModal } from '@/components/CoachChatModal';
import { nowMs } from '@/lib/clock';
import { useAppStore } from '@/store/useAppStore';
import { shadows } from '@/theme';
import type { InsulinType } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const INK = '#14231C';
const GREEN = '#1FB268';
const GREEN_D = '#159A57';
const PURPLE = '#8B5CF6';
const ORANGE = '#F97316';

/** Soft daily reference used for the ring + the bar-chart objective line. */
const DAILY_GOAL = 30;

const TYPE_COLOR: Record<InsulinType, string> = {
  rapid: GREEN_D,
  long: PURPLE,
  mixed: ORANGE,
};

function sameDay(iso: string, ref: Date) {
  return new Date(iso).toDateString() === ref.toDateString();
}

/* ─────────────────────────── Icons ─────────────────────────── */
function CalendarIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Rect x={3.5} y={5} width={17} height={16} rx={3.5} stroke={GREEN} strokeWidth={2} />
      <Path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke={GREEN} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function ChevronDown({ color = '#8A988F', size = 14 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function ChevronRight({ color = '#4A5A51', size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function BoltIcon({ color = GREEN, size = 17 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13z" fill={color} />
    </Svg>
  );
}
function ClockIcon({ color = PURPLE, size = 17 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 7.5V12l3 2" />
    </Svg>
  );
}
function MixDropIcon({ color = ORANGE, size = 16 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M12 3.5c3.5 4 6 7 6 10a6 6 0 1 1-12 0c0-3 2.5-6 6-10z" fill={color} />
    </Svg>
  );
}
function InfoIcon() {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.75)" strokeWidth={2}>
      <Circle cx={12} cy={12} r={9} />
      <Path d="M12 11v5" strokeLinecap="round" />
      <Circle cx={12} cy={7.6} r={1.1} fill="rgba(255,255,255,0.75)" stroke="none" />
    </Svg>
  );
}
function ShieldCheck() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3l7.5 3v5.5c0 4.5-3.2 7.5-7.5 8.5-4.3-1-7.5-4-7.5-8.5V6z" />
      <Path d="M8.8 12l2.2 2.2 4.4-4.4" />
    </Svg>
  );
}
function CalcIcon() {
  return (
    <Svg width={24} height={24} viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Rect x={4.5} y={3} width={15} height={18} rx={3} />
      <Path d="M8 7h8" />
      <Path d="M8.5 12h0M12 12h0M15.5 12h0M8.5 16h0M12 16h0M15.5 16h.01" />
    </Svg>
  );
}
function PlusThin({ color = GREEN, size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

/* ── Progress ring for the green total card ── */
function TotalRing({ size, pct }: { size: number; pct: number }) {
  const r = size / 2 - 5;
  const cx = size / 2;
  const c = 2 * Math.PI * r;
  const dash = Math.max(0, Math.min(1, pct)) * c;
  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cx} r={r} fill="none" stroke="rgba(255,255,255,0.28)" strokeWidth={10} />
      {dash > 0 ? (
        <Circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="#fff"
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      ) : null}
    </Svg>
  );
}

/* ── Répartition donut (rapid / long / mixed shares) ── */
function Donut({
  size,
  segments,
}: {
  size: number;
  segments: { value: number; color: string }[];
}) {
  const r = size / 2 - 5;
  const cx = size / 2;
  const c = 2 * Math.PI * r;
  const total = segments.reduce((s, x) => s + x.value, 0);
  let offset = 0;
  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cx} r={r} fill="none" stroke="#E4F0EA" strokeWidth={10} />
      {total > 0
        ? segments.map((seg, i) => {
            if (seg.value <= 0) return null;
            const len = (seg.value / total) * c;
            const dashOffset = -offset;
            offset += len;
            return (
              <Circle
                key={i}
                cx={cx}
                cy={cx}
                r={r}
                fill="none"
                stroke={seg.color}
                strokeWidth={10}
                strokeDasharray={`${len} ${c - len}`}
                strokeDashoffset={dashOffset}
                transform={`rotate(-90 ${cx} ${cx})`}
              />
            );
          })
        : null}
    </Svg>
  );
}

export default function InsulinScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { insulinLogs, profile } = useAppStore();
  const locale = i18n.language;
  const firstName = (profile?.name || '').trim().split(/\s+/)[0] || '';

  const TYPE_LABEL: Record<InsulinType, string> = {
    rapid: t('insulinPage.rapid'),
    long: t('insulinPage.long'),
    mixed: t('insulinPage.mixed'),
  };

  /* Selected day (0 = today), the picker, and the chart toggles/modals. */
  const [dayOffset, setDayOffset] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [typeModal, setTypeModal] = useState<InsulinType | null>(null);
  const [recentModal, setRecentModal] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [chartRange, setChartRange] = useState<'week' | 'day'>('week');
  const [chartUnit, setChartUnit] = useState<'U' | '%'>('U');

  const selectedDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    return d;
  }, [dayOffset]);
  const dayLabel = (offset: number) => {
    if (offset === 0) return t('insulinPage.today');
    if (offset === 1) return t('insulinPage.yesterday');
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toLocaleDateString(locale, { weekday: 'long', day: 'numeric', month: 'short' });
  };

  const today = useMemo(
    () => insulinLogs.filter((l) => sameDay(l.created_at, selectedDate)),
    [insulinLogs, selectedDate]
  );
  const sumBy = (type: InsulinType) =>
    today.filter((l) => l.insulin_type === type).reduce((s, l) => s + l.dose, 0);
  const totalToday = today.reduce((s, l) => s + l.dose, 0);
  const rapidToday = sumBy('rapid');
  const longToday = sumBy('long');
  const mixedToday = sumBy('mixed');
  const goalPct = Math.min(1, totalToday / DAILY_GOAL);

  const share = (v: number) => (totalToday > 0 ? Math.round((v / totalToday) * 100) : 0);

  const CHART_H = 150;

  // 7-day totals for the "week" chart.
  const week = useMemo(() => {
    const days: { label: string; total: number; color?: string }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const total = insulinLogs
        .filter((l) => new Date(l.created_at).toDateString() === key)
        .reduce((s, l) => s + l.dose, 0);
      days.push({ label: d.toLocaleDateString(locale, { weekday: 'short' }), total });
    }
    return days;
  }, [insulinLogs, locale]);

  // "Day" chart: the selected day's injections, one bar per shot (by time),
  // coloured by insulin type.
  const dayBars = useMemo(
    () =>
      [...today]
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
        .map((l) => {
          const d = new Date(l.created_at);
          return {
            label: d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }),
            total: l.dose,
            color: TYPE_COLOR[l.insulin_type],
            // Position along a 0h→24h axis (fraction of the day).
            frac: (d.getHours() + d.getMinutes() / 60) / 24,
          };
        }),
    [today, locale]
  );

  // Chart data resolved for the current range (week/day) + unit (U/%).
  const chart = useMemo(() => {
    const src = chartRange === 'week' ? week : dayBars;
    const isPct = chartUnit === '%';
    const ref = chartRange === 'week' ? DAILY_GOAL : Math.max(1, totalToday);
    const bars = src.map((b) => ({
      label: b.label,
      val: isPct ? (b.total / ref) * 100 : b.total,
      color: b.color,
      frac: (b as { frac?: number }).frac,
    }));
    const maxVal = Math.max(...bars.map((b) => b.val), isPct ? 100 : DAILY_GOAL);
    return { bars, maxVal, isPct };
  }, [chartRange, chartUnit, week, dayBars, totalToday]);

  // Injections list (last 7 days) for the "recent" card + its modal.
  const recentAll = useMemo(() => {
    const cutoff = nowMs() - 7 * 24 * 3600 * 1000;
    return insulinLogs
      .filter((l) => new Date(l.created_at).getTime() >= cutoff)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [insulinLogs]);
  const recent = recentAll.slice(0, 3);

  // Injections of one type on the selected day (for the type-card modal).
  const dayByType = (type: InsulinType) =>
    today
      .filter((l) => l.insulin_type === type)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  // A short, live comment on the day's insulin — shown on the AI card and
  // used to seed the in-page chat.
  const aiComment = useMemo(() => {
    if (totalToday <= 0) return t('insulinPage.cmtEmpty');
    const parts: string[] = [];
    if (rapidToday > 0) parts.push(`${rapidToday} U ${t('insulinPage.rapid')}`);
    if (longToday > 0) parts.push(`${longToday} U ${t('insulinPage.long')}`);
    if (mixedToday > 0) parts.push(`${mixedToday} U ${t('insulinPage.mixed')}`);
    return t('insulinPage.cmtSummary', { total: totalToday, breakdown: parts.join(' · ') });
  }, [totalToday, rapidToday, longToday, mixedToday, t]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const HERO_H = insets.top + 210;

  const typeCards: { type: InsulinType; label: string; value: number; color: string; chip: string; icon: React.ReactNode }[] = [
    { type: 'rapid', label: t('insulinPage.rapid'), value: rapidToday, color: GREEN_D, chip: '#E4F6EC', icon: <BoltIcon /> },
    { type: 'long', label: t('insulinPage.long'), value: longToday, color: longToday > 0 ? PURPLE : '#8A988F', chip: '#F0EBFD', icon: <ClockIcon /> },
    { type: 'mixed', label: t('insulinPage.mixed'), value: mixedToday, color: mixedToday > 0 ? ORANGE : '#8A988F', chip: '#FEECDF', icon: <MixDropIcon /> },
  ];

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* ── Hero ── */}
        <View>
          <Image
            source={require('../assets/insulin/hero-bg.jpg')}
            style={[styles.heroImg, { height: HERO_H }]}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(246,249,247,0)', 'rgba(246,249,247,0.7)', '#F7FAF8']}
            locations={[0, 0.55, 0.95]}
            style={[styles.heroFade, { top: HERO_H - 140, height: 140 }]}
            pointerEvents="none"
          />

          {/* Header */}
          <View style={[styles.headRow, { paddingTop: insets.top + 10 }]}>
            <Pressable onPress={close} style={styles.backBtn}>
              <ChevronLeft size={16} />
            </Pressable>
            <Text style={styles.headTitle}>{t('insulinPage.title')}</Text>
            <Pressable style={styles.dateChip} onPress={() => setPickerOpen(true)}>
              <CalendarIcon />
              <Text style={styles.dateChipText}>{dayLabel(dayOffset)}</Text>
              <ChevronDown />
            </Pressable>
          </View>

          {/* Greeting */}
          <FadeInView delay={30} style={{ paddingHorizontal: 22, marginTop: 12 }}>
            <Text style={styles.hello}>
              {firstName ? t('insulinPage.hello', { name: firstName }) : t('insulinPage.helloNoName')}
            </Text>
            <Text style={styles.helloSub}>
              {dayOffset === 0 ? t('insulinPage.subtitle') : dayLabel(dayOffset)}
            </Text>
          </FadeInView>
        </View>

        {/* ── Top: total card + type cards ── */}
        <FadeInView delay={80} style={styles.topRow}>
          <LinearGradient
            colors={['#2FC178', '#149A57']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.totalCard}
          >
            <View style={styles.totalLabelRow}>
              <Text style={styles.totalLabel}>{t('insulinPage.totalToday')}</Text>
              <InfoIcon />
            </View>
            <View style={styles.totalMid}>
              <View>
                <View style={styles.totalValueRow}>
                  <Text style={styles.totalValue}>{totalToday}</Text>
                  <Text style={styles.totalUnit}>U</Text>
                </View>
                <View style={styles.goalPill}>
                  <Text style={styles.goalPillText}>
                    {t('insulinPage.goal', { n: DAILY_GOAL })}
                  </Text>
                </View>
              </View>
              <View style={styles.totalRingWrap}>
                <TotalRing size={92} pct={goalPct} />
                <View style={styles.totalRingCenter} pointerEvents="none">
                  <Text style={styles.totalRingTop}>
                    {totalToday} / {DAILY_GOAL} U
                  </Text>
                  <Text style={styles.totalRingPct}>{Math.round(goalPct * 100)}%</Text>
                </View>
              </View>
            </View>
            <View style={styles.totalBar}>
              <View style={[styles.totalBarFill, { width: `${goalPct * 100}%` }]} />
            </View>
            <Text style={styles.totalFoot}>
              {t('insulinPage.ofGoal', { pct: Math.round(goalPct * 100) })}
            </Text>
          </LinearGradient>

          <View style={styles.typeCol}>
            {typeCards.map((c) => (
              <Pressable
                key={c.type}
                style={({ pressed }) => [styles.typeCard, pressed && { opacity: 0.7 }]}
                onPress={() => setTypeModal(c.type)}
              >
                <View style={[styles.typeChip, { backgroundColor: c.chip }]}>{c.icon}</View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.typeLabel}>{c.label}</Text>
                  <Text style={[styles.typeValue, { color: c.color }]}>{c.value} U</Text>
                </View>
                <ChevronRight color="#B7C2BB" size={16} />
              </Pressable>
            ))}
          </View>
        </FadeInView>

        {/* ── Bar chart (week / day · U / %) ── */}
        <FadeInView delay={130} style={{ paddingHorizontal: 20, marginTop: 14 }}>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>
                {chartRange === 'week' ? t('insulinPage.last7days') : dayLabel(dayOffset)}
              </Text>
              <View style={{ flexDirection: 'row', gap: 8 }}>
                {/* week / day toggle */}
                <View style={styles.segToggle}>
                  {(['week', 'day'] as const).map((r) => (
                    <Pressable
                      key={r}
                      onPress={() => setChartRange(r)}
                      style={[styles.segBtn, chartRange === r && styles.segBtnOn]}
                    >
                      <Text style={[styles.segText, chartRange === r && styles.segTextOn]}>
                        {r === 'week' ? t('insulinPage.range7d') : t('insulinPage.rangeDay')}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                {/* U / % toggle */}
                <Pressable
                  onPress={() => setChartUnit((u) => (u === 'U' ? '%' : 'U'))}
                  style={styles.unitPill}
                >
                  <Text style={styles.unitPillText}>
                    {chartUnit === 'U' ? t('insulinPage.unitsShort') : '%'}
                  </Text>
                  <ChevronDown size={13} />
                </Pressable>
              </View>
            </View>

            {chart.bars.length === 0 ? (
              <Text style={styles.chartEmpty}>{t('insulinPage.noneYet')}</Text>
            ) : (
              <View style={styles.chartWrap}>
                <View style={styles.chartYAxis}>
                  {[chart.maxVal, chart.maxVal * 0.66, chart.maxVal * 0.33, 0].map((v, i) => (
                    <Text key={i} style={styles.axisText}>
                      {chart.isPct ? `${Math.round(v)}` : Math.round(v)}
                    </Text>
                  ))}
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ height: CHART_H, position: 'relative' }}>
                    {/* Daily objective line — only meaningful in week · U mode */}
                    {chartRange === 'week' && !chart.isPct ? (
                      <>
                        <View style={[styles.objLine, { top: CHART_H * (1 - DAILY_GOAL / chart.maxVal) }]} />
                        <View style={[styles.objPill, { top: CHART_H * (1 - DAILY_GOAL / chart.maxVal) - 9 }]}>
                          <Text style={styles.objPillText}>
                            {t('insulinPage.goalShort', { n: DAILY_GOAL })}
                          </Text>
                        </View>
                      </>
                    ) : null}

                    {chartRange === 'week' ? (
                      /* Week: one evenly-spaced bar per day. */
                      <View style={styles.barsRow}>
                        {chart.bars.map((b, i) => {
                          const isLast = i === chart.bars.length - 1;
                          const h = Math.max(b.val > 0 ? 6 : 0, (b.val / chart.maxVal) * CHART_H);
                          const color = b.color ?? (isLast ? GREEN : '#CDEBD9');
                          return (
                            <View key={i} style={styles.barCol}>
                              <Text style={[styles.barValue, isLast && { color: GREEN_D }]}>
                                {b.val > 0 ? (chart.isPct ? `${Math.round(b.val)}%` : Math.round(b.val * 10) / 10) : ''}
                              </Text>
                              <View style={[styles.bar, { height: h, backgroundColor: color }]} />
                            </View>
                          );
                        })}
                      </View>
                    ) : (
                      /* Day: each injection placed at its real time on a 0h→24h axis. */
                      <>
                        {[0.25, 0.5, 0.75].map((g) => (
                          <View key={g} style={[styles.hourGrid, { top: CHART_H * (1 - g) }]} />
                        ))}
                        {chart.bars.map((b, i) => {
                          const h = Math.max(b.val > 0 ? 6 : 0, (b.val / chart.maxVal) * CHART_H);
                          return (
                            <View
                              key={i}
                              style={[styles.timeBarWrap, { left: `${(b.frac ?? 0) * 100}%`, height: CHART_H }]}
                            >
                              <Text style={styles.barValue}>
                                {chart.isPct ? `${Math.round(b.val)}%` : Math.round(b.val * 10) / 10}
                              </Text>
                              <View style={[styles.timeBar, { height: h, backgroundColor: b.color ?? GREEN }]} />
                            </View>
                          );
                        })}
                      </>
                    )}
                  </View>

                  {chartRange === 'week' ? (
                    <View style={styles.barLabels}>
                      {chart.bars.map((b, i) => (
                        <Text key={i} style={styles.barLabel} numberOfLines={1}>{b.label}</Text>
                      ))}
                    </View>
                  ) : (
                    <>
                      {/* Exact injection time under each bar */}
                      <View style={styles.timeMarks}>
                        {chart.bars.map((b, i) => (
                          <Text
                            key={i}
                            style={[styles.timeMark, { left: `${(b.frac ?? 0) * 100}%`, color: b.color }]}
                            numberOfLines={1}
                          >
                            {b.label}
                          </Text>
                        ))}
                      </View>
                      {/* Hour axis: 0h · 6h · 12h · 18h · 24h */}
                      <View style={styles.hourAxis}>
                        {[0, 6, 12, 18, 24].map((hr) => (
                          <Text
                            key={hr}
                            style={[
                              styles.hourLabel,
                              { left: `${(hr / 24) * 100}%` },
                              hr === 0 && { marginLeft: 0 },
                              hr === 24 && { marginLeft: -22 },
                            ]}
                          >
                            {hr}h
                          </Text>
                        ))}
                      </View>
                    </>
                  )}
                </View>
              </View>
            )}
          </View>
        </FadeInView>

        {/* ── Conseil IA (live comment + opens an in-page chat) ── */}
        <FadeInView delay={170} style={{ paddingHorizontal: 20, marginTop: 14 }}>
          <Pressable style={styles.coachCard} onPress={() => setAiOpen(true)}>
            <View style={styles.coachRobot}>
              <AnimatedRobot size={44} mood="happy" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.coachKicker}>{t('insulinPage.aiTip')}</Text>
              <Text style={styles.coachTitle}>{aiComment}</Text>
              <Text style={styles.coachSub}>{t('insulinPage.aiAsk')}</Text>
            </View>
            <ChevronRight />
          </Pressable>
        </FadeInView>

        {/* ── Injections + Répartition ── */}
        <FadeInView delay={210} style={styles.duoRow}>
          {/* Dernières injections */}
          <View style={[styles.card, styles.duoCard]}>
            <Text style={styles.duoTitle}>{t('insulinPage.recent')}</Text>
            {recent.length === 0 ? (
              <Text style={styles.emptyMini}>{t('insulinPage.noneYet')}</Text>
            ) : (
              recent.map((l, i) => (
                <View
                  key={l.id}
                  style={[styles.injRow, i < recent.length - 1 && styles.injRowBorder]}
                >
                  <View
                    style={[
                      styles.injChip,
                      { backgroundColor: l.insulin_type === 'long' ? '#F0EBFD' : l.insulin_type === 'mixed' ? '#FEECDF' : '#E4F6EC' },
                    ]}
                  >
                    {l.insulin_type === 'long' ? (
                      <ClockIcon size={14} />
                    ) : l.insulin_type === 'mixed' ? (
                      <MixDropIcon size={14} />
                    ) : (
                      <BoltIcon size={14} />
                    )}
                  </View>
                  <Text style={styles.injName}>{TYPE_LABEL[l.insulin_type]}</Text>
                  <Text style={[styles.injDose, { color: TYPE_COLOR[l.insulin_type] }]}>
                    {l.dose} U
                  </Text>
                  <Text style={styles.injTime}>
                    {new Date(l.created_at).toLocaleTimeString(locale, {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              ))
            )}
            <Pressable onPress={() => setRecentModal(true)}>
              <Text style={styles.seeAll}>{t('insulinPage.seeAll')} →</Text>
            </Pressable>
          </View>

          {/* Répartition */}
          <View style={[styles.card, styles.duoCard]}>
            <Text style={styles.duoTitle}>{t('insulinPage.split')}</Text>
            <View style={styles.splitRow}>
              <Donut
                size={58}
                segments={[
                  { value: rapidToday, color: GREEN },
                  { value: longToday, color: PURPLE },
                  { value: mixedToday, color: ORANGE },
                ]}
              />
              <View style={{ flex: 1, minWidth: 0, gap: 7 }}>
                <SplitLegend color={GREEN} label={t('insulinPage.rapid')} pct={share(rapidToday)} on />
                <SplitLegend color={PURPLE} label={t('insulinPage.long')} pct={share(longToday)} on={longToday > 0} />
                <SplitLegend color={ORANGE} label={t('insulinPage.mixed')} pct={share(mixedToday)} on={mixedToday > 0} />
              </View>
            </View>
            <View style={styles.stableBox}>
              <ShieldCheck />
              <View style={{ minWidth: 0, flex: 1 }}>
                <Text style={styles.stableTitle}>{t('insulinPage.stable')}</Text>
                <Text style={styles.stableSub}>{t('insulinPage.noRisk')}</Text>
              </View>
            </View>
          </View>
        </FadeInView>

        {/* ── Calculer un bolus ── */}
        <FadeInView delay={250} style={{ paddingHorizontal: 20, marginTop: 16 }}>
          <Pressable style={styles.bolusCard} onPress={() => router.push('/bolus')}>
            <View style={styles.bolusChip}>
              <CalcIcon />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.bolusTitle}>{t('insulinPage.calcBolus')}</Text>
              <Text style={styles.bolusSub}>{t('insulinPage.calcSub')}</Text>
            </View>
            <View style={styles.bolusChevron}>
              <ChevronRight size={18} />
            </View>
          </Pressable>
        </FadeInView>
      </ScrollView>

      {/* ── FAB ── */}
      <Pressable
        onPress={() => router.push('/log-insulin')}
        style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 16 }]}
      >
        <LinearGradient colors={['#2FC178', '#149A57']} style={styles.fabGrad}>
          <PlusThin color="#fff" size={28} />
        </LinearGradient>
      </Pressable>

      {/* ── Day picker ── */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setPickerOpen(false)}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>{t('insulinPage.pickDay')}</Text>
            {Array.from({ length: 7 }, (_, i) => i).map((off) => {
              const d = new Date();
              d.setDate(d.getDate() - off);
              const n = insulinLogs.filter((l) => sameDay(l.created_at, d)).length;
              const active = off === dayOffset;
              return (
                <Pressable
                  key={off}
                  onPress={() => {
                    setDayOffset(off);
                    setPickerOpen(false);
                  }}
                  style={[styles.pickerRow, active && styles.pickerRowActive]}
                >
                  <Text style={[styles.pickerDay, active && { color: GREEN_D }]}>{dayLabel(off)}</Text>
                  <Text style={styles.pickerCount}>
                    {n > 0 ? t('insulinPage.injCount', { count: n }) : '—'}
                  </Text>
                  {active ? (
                    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                      <Circle cx={8} cy={8} r={7} fill={GREEN_D} />
                      <Path d="M5 8.2L7 10.2L11 6.2" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  ) : (
                    <View style={styles.pickerRadio} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>

      {/* ── Injections of one type (from a type card) ── */}
      <Modal visible={!!typeModal} transparent animationType="fade" onRequestClose={() => setTypeModal(null)}>
        <Pressable style={styles.centerOverlay} onPress={() => setTypeModal(null)}>
          <Pressable style={styles.centerSheet} onPress={() => {}}>
            {typeModal ? (
              <>
                <Text style={styles.centerTitle}>
                  {TYPE_LABEL[typeModal]} · {dayLabel(dayOffset)}
                </Text>
                <Text style={styles.centerSub}>
                  {t('insulinPage.typeTotal', { n: sumBy(typeModal) })}
                </Text>
                <ScrollView style={{ maxHeight: 280, marginTop: 8 }}>
                  {dayByType(typeModal).length === 0 ? (
                    <Text style={styles.emptyMini}>{t('insulinPage.noneYet')}</Text>
                  ) : (
                    dayByType(typeModal).map((l) => (
                      <View key={l.id} style={styles.modalInjRow}>
                        <Text style={styles.modalInjTime}>
                          {new Date(l.created_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                        <Text style={styles.modalInjNote} numberOfLines={1}>
                          {l.notes || TYPE_LABEL[l.insulin_type]}
                        </Text>
                        <Text style={[styles.modalInjDose, { color: TYPE_COLOR[l.insulin_type] }]}>
                          {l.dose} U
                        </Text>
                      </View>
                    ))
                  )}
                </ScrollView>
                <Pressable style={styles.centerClose} onPress={() => setTypeModal(null)}>
                  <Text style={styles.centerCloseText}>{t('common.close')}</Text>
                </Pressable>
              </>
            ) : null}
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── All recent injections ── */}
      <Modal visible={recentModal} transparent animationType="fade" onRequestClose={() => setRecentModal(false)}>
        <Pressable style={styles.centerOverlay} onPress={() => setRecentModal(false)}>
          <Pressable style={styles.centerSheet} onPress={() => {}}>
            <Text style={styles.centerTitle}>{t('insulinPage.recent')}</Text>
            <Text style={styles.centerSub}>{t('insulinPage.last7days')}</Text>
            <ScrollView style={{ maxHeight: 340, marginTop: 8 }}>
              {recentAll.length === 0 ? (
                <Text style={styles.emptyMini}>{t('insulinPage.noneYet')}</Text>
              ) : (
                recentAll.map((l) => (
                  <View key={l.id} style={styles.modalInjRow}>
                    <View
                      style={[
                        styles.injChip,
                        { backgroundColor: l.insulin_type === 'long' ? '#F0EBFD' : l.insulin_type === 'mixed' ? '#FEECDF' : '#E4F6EC' },
                      ]}
                    >
                      {l.insulin_type === 'long' ? <ClockIcon size={13} /> : l.insulin_type === 'mixed' ? <MixDropIcon size={13} /> : <BoltIcon size={13} />}
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.modalInjNote} numberOfLines={1}>{TYPE_LABEL[l.insulin_type]}</Text>
                      <Text style={styles.modalInjTime}>
                        {new Date(l.created_at).toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' })}
                        {' · '}
                        {new Date(l.created_at).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })}
                      </Text>
                    </View>
                    <Text style={[styles.modalInjDose, { color: TYPE_COLOR[l.insulin_type] }]}>{l.dose} U</Text>
                  </View>
                ))
              )}
            </ScrollView>
            <Pressable style={styles.centerClose} onPress={() => setRecentModal(false)}>
              <Text style={styles.centerCloseText}>{t('common.close')}</Text>
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Conseil IA — full-screen chat (text + voice) ── */}
      <CoachChatModal
        open={aiOpen}
        onOpenChange={setAiOpen}
        title={t('insulinPage.aiTitle')}
        subtitle={t('coachChat.subtitle')}
        greeting={aiComment}
        placeholder={t('insulinPage.aiPlaceholder')}
        errorText={t('insulinPage.aiError')}
        starters={t('coachChat.startersInsulin', { returnObjects: true }) as string[]}
      />
    </View>
  );
}

function SplitLegend({ color, label, pct, on }: { color: string; label: string; pct: number; on: boolean }) {
  return (
    <View style={styles.legendRow}>
      <View style={styles.legendLeft}>
        <View style={[styles.legendDot, { backgroundColor: color }]} />
        <Text style={styles.legendLabel} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.legendPct, { color: on ? INK : '#9AA8A0' }]}>{pct}%</Text>
    </View>
  );
}

const cardShadow = {
  shadowColor: 'rgba(20,50,34,1)',
  shadowOffset: { width: 0, height: 12 },
  shadowOpacity: 0.12,
  shadowRadius: 22,
  elevation: 3,
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7FAF8' },

  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, width: '100%' },
  heroFade: { position: 'absolute', left: 0, right: 0 },

  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headTitle: { fontFamily: F800, fontSize: 20, color: INK },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 9,
    paddingHorizontal: 12,
    ...shadows.card,
  },
  dateChipText: { fontFamily: F600, fontSize: 13, color: INK },

  hello: { fontFamily: F800, fontSize: 26, color: INK, letterSpacing: -0.3 },
  helloSub: { fontFamily: F500, fontSize: 15, color: '#63736A', marginTop: 4 },

  topRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginTop: 16, alignItems: 'stretch' },
  totalCard: {
    flex: 1.4,
    minWidth: 0,
    borderRadius: 24,
    padding: 16,
    shadowColor: '#149A57',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.45,
    shadowRadius: 22,
    elevation: 6,
  },
  totalLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  totalLabel: { fontFamily: F600, fontSize: 13, color: 'rgba(255,255,255,0.94)' },
  totalMid: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginTop: 6 },
  totalValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4 },
  totalValue: { fontFamily: F800, fontSize: 42, color: '#fff', lineHeight: 44 },
  totalUnit: { fontFamily: F700, fontSize: 19, color: '#fff' },
  goalPill: {
    alignSelf: 'flex-start',
    marginTop: 10,
    backgroundColor: 'rgba(255,255,255,0.22)',
    borderRadius: 99,
    paddingVertical: 4,
    paddingHorizontal: 11,
  },
  goalPillText: { fontFamily: F700, fontSize: 12, color: '#fff' },
  totalRingWrap: { width: 92, height: 92 },
  totalRingCenter: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
  totalRingTop: { fontFamily: F800, fontSize: 13, color: '#fff' },
  totalRingPct: { fontFamily: F700, fontSize: 12, color: '#D6F5E4', marginTop: 1 },
  totalBar: {
    marginTop: 14,
    height: 8,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  totalBarFill: { height: '100%', borderRadius: 99, backgroundColor: '#fff' },
  totalFoot: { fontFamily: F600, fontSize: 12.5, color: 'rgba(255,255,255,0.94)', marginTop: 8 },

  typeCol: { flex: 1, minWidth: 0, gap: 9 },
  typeCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 18,
    paddingVertical: 11,
    paddingHorizontal: 13,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    ...cardShadow,
  },
  typeChip: {
    width: 34,
    height: 34,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeLabel: { fontFamily: F600, fontSize: 12.5, color: '#5C6E63' },
  typeValue: { fontFamily: F800, fontSize: 15, marginTop: 1 },

  card: { backgroundColor: '#fff', borderRadius: 24, padding: 16, ...cardShadow },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontFamily: F800, fontSize: 16, color: INK },
  unitPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F2',
    borderRadius: 99,
    paddingVertical: 5,
    paddingHorizontal: 10,
  },
  unitPillText: { fontFamily: F600, fontSize: 12, color: '#5C6E63' },

  chartWrap: { flexDirection: 'row', gap: 8, marginTop: 18 },
  chartYAxis: {
    height: 150,
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    width: 20,
  },
  axisText: { fontFamily: F600, fontSize: 11, color: '#9AA8A0' },
  objLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    borderTopWidth: 1.5,
    borderColor: '#B7DFC8',
    borderStyle: 'dashed',
  },
  objPill: {
    position: 'absolute',
    right: 0,
    backgroundColor: '#E4F6EC',
    borderRadius: 99,
    paddingVertical: 2,
    paddingHorizontal: 8,
  },
  objPillText: { fontFamily: F700, fontSize: 10.5, color: GREEN_D },
  barsRow: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'flex-end' },
  barCol: { flex: 1, alignItems: 'center', gap: 6 },
  barValue: { fontFamily: F700, fontSize: 11, color: '#9AA8A0' },
  bar: { width: 15, borderRadius: 7 },
  barLabels: { flexDirection: 'row', marginTop: 8 },
  barLabel: { flex: 1, textAlign: 'center', fontFamily: F600, fontSize: 11.5, color: '#9AA8A0', textTransform: 'capitalize' },

  /* Day mode: time-positioned bars + hour axis */
  hourGrid: { position: 'absolute', left: 0, right: 0, borderTopWidth: 1, borderTopColor: '#F3F6F4' },
  timeBarWrap: { position: 'absolute', bottom: 0, width: 0, alignItems: 'center', justifyContent: 'flex-end', gap: 5 },
  timeBar: { width: 12, borderRadius: 6 },
  hourAxis: { height: 16, marginTop: 6, position: 'relative' },
  hourLabel: { position: 'absolute', marginLeft: -8, fontFamily: F600, fontSize: 11, color: '#9AA8A0' },
  timeMarks: { height: 15, marginTop: 8, position: 'relative' },
  timeMark: { position: 'absolute', marginLeft: -21, width: 42, textAlign: 'center', fontFamily: F700, fontSize: 10.5 },

  coachCard: {
    backgroundColor: '#E9F6EF',
    borderRadius: 20,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  coachRobot: {
    width: 50,
    height: 50,
    borderRadius: 15,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  coachKicker: { fontFamily: F700, fontSize: 12, color: GREEN_D },
  coachTitle: { fontFamily: F800, fontSize: 14.5, color: INK, marginTop: 2 },
  coachSub: { fontFamily: F500, fontSize: 13, color: '#5C6E63', marginTop: 2 },

  duoRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginTop: 14, alignItems: 'stretch' },
  duoCard: { flex: 1, minWidth: 0, padding: 13 },
  duoTitle: { fontFamily: F800, fontSize: 14, color: INK, marginBottom: 4 },
  injRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 9 },
  injRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F3F1' },
  injChip: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  injName: { flex: 1, minWidth: 0, fontFamily: F700, fontSize: 13, color: INK },
  injDose: { fontFamily: F800, fontSize: 13.5 },
  injTime: { fontFamily: F600, fontSize: 11.5, color: '#9AA8A0' },
  seeAll: { textAlign: 'center', marginTop: 10, fontFamily: F700, fontSize: 13, color: GREEN_D },
  emptyMini: { fontFamily: F500, fontSize: 12.5, color: '#9AA8A0', paddingVertical: 14, textAlign: 'center' },

  splitRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  legendLeft: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: 0, flexShrink: 1 },
  legendDot: { width: 7, height: 7, borderRadius: 4, flexShrink: 0 },
  legendLabel: { fontFamily: F600, fontSize: 11, color: '#5C6E63', flexShrink: 1 },
  legendPct: { fontFamily: F800, fontSize: 11, flexShrink: 0 },
  stableBox: {
    backgroundColor: '#E9F6EF',
    borderRadius: 14,
    padding: 10,
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
  },
  stableTitle: { fontFamily: F800, fontSize: 12.5, color: GREEN_D },
  stableSub: { fontFamily: F500, fontSize: 11.5, color: '#5C6E63', marginTop: 1 },

  bolusCard: {
    backgroundColor: '#EEF3F0',
    borderRadius: 20,
    padding: 15,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 13,
  },
  bolusChip: {
    width: 48,
    height: 48,
    borderRadius: 15,
    backgroundColor: '#DCEEE4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bolusTitle: { fontFamily: F800, fontSize: 15, color: GREEN_D },
  bolusSub: { fontFamily: F500, fontSize: 12.5, color: '#5C6E63', marginTop: 2 },
  bolusChevron: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: '#C4E6D2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  fab: {
    position: 'absolute',
    right: 22,
    width: 60,
    height: 60,
    borderRadius: 30,
    shadowColor: '#149A57',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  fabGrad: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Chart range toggle (week / day) */
  segToggle: { flexDirection: 'row', backgroundColor: '#F1F5F2', borderRadius: 99, padding: 2 },
  segBtn: { paddingVertical: 5, paddingHorizontal: 10, borderRadius: 99 },
  segBtnOn: { backgroundColor: '#fff', ...shadows.card },
  segText: { fontFamily: F600, fontSize: 11.5, color: '#8A988F' },
  segTextOn: { color: GREEN_D },
  chartEmpty: { fontFamily: F500, fontSize: 13, color: '#9AA8A0', textAlign: 'center', paddingVertical: 34 },

  /* Day picker (bottom sheet) */
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(16,24,40,0.42)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 34 },
  pickerHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E3E8EE', marginBottom: 14 },
  pickerTitle: { fontFamily: F800, fontSize: 17, color: INK, marginBottom: 10 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 14 },
  pickerRowActive: { backgroundColor: '#F2F8F4' },
  pickerDay: { flex: 1, fontFamily: F700, fontSize: 14.5, color: INK, textTransform: 'capitalize' },
  pickerCount: { fontFamily: F500, fontSize: 12.5, color: '#9AA8A0' },
  pickerRadio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.6, borderColor: '#D5DBE2' },

  /* Centered modal (type list / recent list) */
  centerOverlay: { flex: 1, backgroundColor: 'rgba(16,24,40,0.5)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  centerSheet: { width: '100%', maxWidth: 400, backgroundColor: '#fff', borderRadius: 24, padding: 20 },
  centerTitle: { fontFamily: F800, fontSize: 17, color: INK, textTransform: 'capitalize' },
  centerSub: { fontFamily: F600, fontSize: 12.5, color: '#8A988F', marginTop: 2 },
  centerClose: { marginTop: 14, height: 46, borderRadius: 14, backgroundColor: '#F1F5F2', alignItems: 'center', justifyContent: 'center' },
  centerCloseText: { fontFamily: F700, fontSize: 14, color: INK },
  modalInjRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F0F3F1' },
  modalInjTime: { fontFamily: F600, fontSize: 12, color: '#9AA8A0' },
  modalInjNote: { flex: 1, minWidth: 0, fontFamily: F700, fontSize: 13, color: INK },
  modalInjDose: { fontFamily: F800, fontSize: 14 },

  /* In-page AI chat sheet */
  aiSheet: {
    width: '100%',
    maxWidth: 440,
    height: '74%',
    backgroundColor: '#fff',
    borderRadius: 26,
    padding: 16,
  },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2EF' },
  aiTitle: { flex: 1, fontFamily: F800, fontSize: 16, color: INK },
  aiCloseX: { fontFamily: F700, fontSize: 18, color: '#9AA8A0' },
  aiThread: { flex: 1, marginTop: 8 },
  aiBubble: { maxWidth: '86%', borderRadius: 16, paddingVertical: 9, paddingHorizontal: 13 },
  aiBubbleAI: { alignSelf: 'flex-start', backgroundColor: '#EEF5F0' },
  aiBubbleUser: { alignSelf: 'flex-end', backgroundColor: GREEN_D },
  aiBubbleText: { fontFamily: F500, fontSize: 13.5, lineHeight: 19, color: INK },
  aiInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  aiInput: {
    flex: 1,
    height: 46,
    backgroundColor: '#F3F7F4',
    borderRadius: 14,
    paddingHorizontal: 14,
    fontFamily: F500,
    fontSize: 14,
    color: INK,
  },
  aiSend: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: GREEN_D,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiSendText: { fontSize: 16, color: '#fff' },
});
