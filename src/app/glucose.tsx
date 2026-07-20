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
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  Polyline,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft, FadeInView } from '@/components/ui';
import { nowMs } from '@/lib/clock';
import { deleteGlucose } from '@/services/data';
import { useAppStore } from '@/store/useAppStore';
import { shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const INK = '#14231C';
const GREEN = '#1FB268';
const GREEN_D = '#159A57';

/* ── Zones (same 4-colour scale as the home dashboard) ── */
type GlyZone = {
  key: 'low' | 'normal' | 'moderate' | 'high';
  color: string;
  pale: string;
  labelKey: string;
};
const GLY_ZONES: GlyZone[] = [
  { key: 'low', color: '#3b82f6', pale: '#dbeafe', labelKey: 'home.glyLow' },
  { key: 'normal', color: '#22b95e', pale: '#cdeed9', labelKey: 'home.glyNormal' },
  { key: 'moderate', color: '#f5b60a', pale: '#fbeab9', labelKey: 'home.glyModerate' },
  { key: 'high', color: '#ef4444', pale: '#fbd0d0', labelKey: 'home.glyVeryHigh' },
];
function zoneFor(value: number, low: number, high: number): GlyZone {
  if (value < low) return GLY_ZONES[0];
  if (value <= high) return GLY_ZONES[1];
  if (value <= high * 1.4) return GLY_ZONES[2];
  return GLY_ZONES[3];
}

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
function ChevronRight({ color = '#B7C2BB', size = 18 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function DotsIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24" fill={INK}>
      <Circle cx={12} cy={5} r={1.8} />
      <Circle cx={12} cy={12} r={1.8} />
      <Circle cx={12} cy={19} r={1.8} />
    </Svg>
  );
}
function TrendIcon({ color = GREEN, size = 13 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M3 17l6-6 4 4 8-8" />
      <Path d="M15 7h6v6" />
    </Svg>
  );
}
function TargetIcon() {
  return (
    <Svg width={13} height={13} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke="#8B5CF6" strokeWidth={2.2} />
      <Circle cx={12} cy={12} r={4} stroke="#8B5CF6" strokeWidth={2.2} />
      <Circle cx={12} cy={12} r={1.4} fill="#8B5CF6" />
    </Svg>
  );
}
function ClockIcon({ color = GREEN, size = 14 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 7.5V12l3 2" />
    </Svg>
  );
}
function PlusThin({ color = '#fff', size = 22 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.6} strokeLinecap="round" />
    </Svg>
  );
}

/* ── Half-gauge (270° arc) showing the latest reading vs the target range ── */
function Gauge({
  value,
  frac,
  zone,
  low,
  high,
  zoneLabel,
  emptyText,
}: {
  value: number | null;
  frac: number;
  zone: GlyZone | null;
  low: number;
  high: number;
  zoneLabel: string;
  emptyText: string;
}) {
  const S = 150;
  const cx = 75;
  const r = 61;
  const C = 2 * Math.PI * r;
  const ARC = 0.75 * C; // 270°
  const valueDash = Math.max(0, Math.min(1, frac)) * ARC;
  const valueStroke = zone && zone.key === 'normal' ? 'url(#gaugeGrad)' : zone?.color ?? '#CBD5E1';
  return (
    <View style={{ width: S, height: 134 }}>
      <Svg width={S} height={S} style={{ position: 'absolute', top: 0, left: 0 }}>
        <Defs>
          <SvgLinearGradient id="gaugeGrad" x1="0" y1="1" x2="1" y2="0">
            <Stop offset="0" stopColor="#9BDDB6" />
            <Stop offset="1" stopColor={GREEN} />
          </SvgLinearGradient>
        </Defs>
        <Circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke="#EAF3EC"
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${ARC} ${C}`}
          transform={`rotate(135 ${cx} ${cx})`}
        />
        {value != null ? (
          <Circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={valueStroke}
            strokeWidth={12}
            strokeLinecap="round"
            strokeDasharray={`${valueDash} ${C}`}
            transform={`rotate(135 ${cx} ${cx})`}
          />
        ) : null}
      </Svg>

      <View style={styles.gaugeCenter}>
        <View style={styles.gaugeUnitRow}>
          <Text style={{ fontSize: 11 }}>🩸</Text>
          <Text style={styles.gaugeUnit}>mg/dL</Text>
        </View>
        {value != null ? (
          <>
            <Text style={styles.gaugeValue}>{value}</Text>
            {zone ? (
              <View style={[styles.gaugePill, { backgroundColor: zone.pale }]}>
                <Text style={[styles.gaugePillText, { color: zone.color }]}>{zoneLabel}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <Text style={styles.gaugeDash}>—</Text>
            <Text style={styles.gaugeEmpty}>{emptyText}</Text>
          </>
        )}
      </View>

      <Text style={[styles.gaugeEnd, { left: 8 }]}>{low}</Text>
      <Text style={[styles.gaugeEnd, { right: 8 }]}>{high}</Text>
      <View style={styles.gaugePointer} />
    </View>
  );
}

export default function GlucoseScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { glucoseLogs, profile } = useAppStore();

  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;
  const firstName = (profile?.name || '').trim().split(/\s+/)[0] || '';

  const [dayOffset, setDayOffset] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    return d;
  }, [dayOffset]);
  const dayLabel = (offset: number) => {
    if (offset === 0) return t('glucosePage.today');
    if (offset === 1) return t('glucosePage.yesterday');
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'short' });
  };

  const dayLogs = useMemo(
    () =>
      glucoseLogs
        .filter((g) => sameDay(g.created_at, selectedDate))
        .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()),
    [glucoseLogs, selectedDate]
  );
  const latest = dayLogs.length ? dayLogs[dayLogs.length - 1] : null;
  const zone = latest ? zoneFor(latest.value, low, high) : null;
  const gaugeFrac = latest ? (latest.value - low) / (high - low) : 0;

  /* ── 7-day window (daily averages + trend + TIR bands) ── */
  const week = useMemo(() => {
    const days: { label: string; avg: number | null }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const vals = glucoseLogs.filter((g) => sameDay(g.created_at, d)).map((g) => g.value);
      days.push({
        label: d.toLocaleDateString(i18n.language, { weekday: 'short' }),
        avg: vals.length ? Math.round(vals.reduce((s, v) => s + v, 0) / vals.length) : null,
      });
    }
    return days;
  }, [glucoseLogs, i18n.language]);

  const weekStats = useMemo(() => {
    const now = nowMs();
    const vals = glucoseLogs
      .filter((g) => now - new Date(g.created_at).getTime() <= 7 * 24 * 3600 * 1000)
      .map((g) => g.value);
    if (!vals.length) return null;
    const avg = Math.round(vals.reduce((s, v) => s + v, 0) / vals.length);
    const inR = vals.filter((v) => v >= low && v <= high).length;
    const hi = vals.filter((v) => v > high).length;
    const lo = vals.filter((v) => v < low).length;
    const pct = (n: number) => Math.round((n / vals.length) * 100);
    return { avg, tir: pct(inR), high: pct(hi), low: pct(lo) };
  }, [glucoseLogs, low, high]);

  const trend = useMemo(() => {
    const pts = week.filter((d) => d.avg != null).map((d) => d.avg as number);
    if (pts.length < 2) return 'stable' as const;
    const half = Math.max(1, Math.floor(pts.length / 2));
    const early = pts.slice(0, half);
    const late = pts.slice(-half);
    const a = early.reduce((s, v) => s + v, 0) / early.length;
    const b = late.reduce((s, v) => s + v, 0) / late.length;
    if (b - a > 12) return 'rising' as const;
    if (a - b > 12) return 'falling' as const;
    return 'stable' as const;
  }, [week]);
  const trendLabel =
    trend === 'rising'
      ? t('glucosePage.trendRising')
      : trend === 'falling'
        ? t('glucosePage.trendFalling')
        : t('glucosePage.trendStable');

  const recentMeasures = useMemo(
    () =>
      [...glucoseLogs]
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, 3),
    [glucoseLogs]
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  /* ── 7-day chart geometry (viewBox 340×175) ── */
  const yOf = (v: number) => Math.max(14, Math.min(140, 134 - v * 0.59));
  const xOf = (i: number) => 34 + i * 39;
  const pointsWithData = week
    .map((d, i) => (d.avg != null ? { x: xOf(i), y: yOf(d.avg), v: d.avg } : null))
    .filter((p): p is { x: number; y: number; v: number } => p !== null);
  const polyPoints = pointsWithData.map((p) => `${p.x},${p.y}`).join(' ');
  const areaPath = pointsWithData.length
    ? `M${pointsWithData[0].x},${pointsWithData[0].y} ` +
      pointsWithData.slice(1).map((p) => `L${p.x},${p.y}`).join(' ') +
      ` L${pointsWithData[pointsWithData.length - 1].x},134 L${pointsWithData[0].x},134 Z`
    : '';

  const HERO_H = insets.top + 300;

  return (
    <View style={styles.root}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 120 }}>
        {/* ── Hero ── */}
        <View>
          <Image
            source={require('../assets/glucose/hero-bg.png')}
            style={[styles.heroImg, { height: HERO_H }]}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(246,249,245,0)', 'rgba(246,249,245,0.7)', '#F6F9F5']}
            locations={[0, 0.55, 0.95]}
            style={[styles.heroFade, { top: HERO_H - 150, height: 150 }]}
            pointerEvents="none"
          />

          {/* Header */}
          <View style={[styles.headRow, { paddingTop: insets.top + 10 }]}>
            <Pressable onPress={close} style={styles.backBtn}>
              <ChevronLeft size={16} />
            </Pressable>
            <Text style={styles.headTitle}>{t('glucosePage.title')}</Text>
            <View style={styles.headRight}>
              <Pressable onPress={() => setPickerOpen(true)} style={styles.dateChip}>
                <CalendarIcon />
                <Text style={styles.dateChipText} numberOfLines={1}>
                  {dayLabel(dayOffset)}
                </Text>
                <ChevronDown />
              </Pressable>
              <Pressable onPress={() => setPickerOpen(true)} style={styles.dotsBtn}>
                <DotsIcon />
              </Pressable>
            </View>
          </View>

          {/* Greeting */}
          <FadeInView delay={30} style={{ paddingHorizontal: 22, marginTop: 12 }}>
            <Text style={styles.hello}>
              {firstName ? t('glucosePage.hello', { name: firstName }) : t('glucosePage.helloNoName')}
            </Text>
            <Text style={styles.helloSub}>
              {dayOffset === 0 ? t('glucosePage.subtitle') : t('glucosePage.subtitleDay')}
            </Text>
          </FadeInView>
        </View>

        {/* ── Gauge + stats ── */}
        <FadeInView delay={80} style={styles.topRow}>
          <View style={styles.gaugeCard}>
            <Text style={styles.gaugeCardLabel}>{t('glucosePage.current')}</Text>
            <Gauge
              value={latest ? latest.value : null}
              frac={gaugeFrac}
              zone={zone}
              low={low}
              high={high}
              zoneLabel={zone ? t('glucosePage.inRange') : ''}
              emptyText={t('glucosePage.noMeasure')}
            />
          </View>

          <View style={styles.statsCol}>
            <View style={styles.miniDuo}>
              <View style={styles.miniHalf}>
                <View style={styles.miniHead}>
                  <View style={[styles.miniIcon, { backgroundColor: '#E4F6EC' }]}>
                    <TrendIcon />
                  </View>
                  <Text style={styles.miniLabel} numberOfLines={2}>{t('glucosePage.avg')}</Text>
                </View>
                <Text style={styles.miniValue}>{weekStats ? weekStats.avg : '—'}</Text>
                <Text style={styles.miniUnit}>mg/dL</Text>
              </View>
              <View style={[styles.miniHalf, styles.miniHalfBorder]}>
                <View style={styles.miniHead}>
                  <View style={[styles.miniIcon, { backgroundColor: '#F0EBFD' }]}>
                    <TargetIcon />
                  </View>
                  <Text style={styles.miniLabel} numberOfLines={2}>{t('glucosePage.inTarget')}</Text>
                </View>
                <Text style={styles.miniValue}>{weekStats ? `${weekStats.tir}%` : '—'}</Text>
                <Text style={styles.miniUnit}>{t('glucosePage.ofTime')}</Text>
              </View>
            </View>

            <View style={styles.trendCard}>
              <View style={[styles.miniIcon, { width: 34, height: 34, borderRadius: 11, backgroundColor: '#E7F0FE' }]}>
                <TrendIcon color="#3B82F6" size={17} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.miniLabel}>{t('glucosePage.trend')}</Text>
                <Text style={styles.trendValue}>{trendLabel}</Text>
                <Text style={styles.trendSub}>{t('glucosePage.trend7days')}</Text>
              </View>
              <ChevronRight />
            </View>
          </View>
        </FadeInView>

        {/* ── 7-day evolution chart ── */}
        <FadeInView delay={130} style={{ paddingHorizontal: 20, marginTop: 14 }}>
          <View style={styles.card}>
            <View style={styles.cardHead}>
              <Text style={styles.cardTitle}>{t('glucosePage.evolution7days')}</Text>
              <View style={styles.unitPill}>
                <Text style={styles.unitPillText}>mg/dL</Text>
                <ChevronDown size={13} />
              </View>
            </View>

            {pointsWithData.length >= 1 ? (
              <Svg width="100%" viewBox="0 0 340 175" style={{ marginTop: 12 }}>
                <Defs>
                  <SvgLinearGradient id="lineArea" x1="0" y1="0" x2="0" y2="1">
                    <Stop offset="0" stopColor="rgba(31,178,104,0.20)" />
                    <Stop offset="1" stopColor="rgba(31,178,104,0)" />
                  </SvgLinearGradient>
                </Defs>
                {/* grid */}
                <Line x1={34} y1={16} x2={268} y2={16} stroke="#EEF2EF" strokeWidth={1} />
                <Line x1={34} y1={51.4} x2={268} y2={51.4} stroke="#EEF2EF" strokeWidth={1} />
                <Line x1={34} y1={134} x2={268} y2={134} stroke="#EEF2EF" strokeWidth={1} />
                <SvgText x={26} y={20} textAnchor="end" fontFamily={F600} fontSize={11} fill="#9AA8A0">200</SvgText>
                <SvgText x={26} y={55} textAnchor="end" fontFamily={F600} fontSize={11} fill="#9AA8A0">140</SvgText>
                <SvgText x={26} y={96} textAnchor="end" fontFamily={F600} fontSize={11} fill="#9AA8A0">70</SvgText>
                <SvgText x={26} y={138} textAnchor="end" fontFamily={F600} fontSize={11} fill="#9AA8A0">0</SvgText>
                {/* limits */}
                <Line x1={34} y1={yOf(high)} x2={268} y2={yOf(high)} stroke="#8FD3AC" strokeWidth={1.5} strokeDasharray="5 4" />
                <Line x1={34} y1={yOf(low)} x2={268} y2={yOf(low)} stroke="#F0A9A9" strokeWidth={1.5} strokeDasharray="5 4" />
                <SvgText x={273} y={yOf(high) - 4} fontFamily={F700} fontSize={11} fill={GREEN_D}>{high}</SvgText>
                <SvgText x={273} y={yOf(high) + 7} fontFamily={F600} fontSize={9} fill="#4FAE7B">{t('glucosePage.limitHigh')}</SvgText>
                <SvgText x={273} y={yOf(low) - 2} fontFamily={F700} fontSize={11} fill={GREEN_D}>{low}</SvgText>
                <SvgText x={273} y={yOf(low) + 9} fontFamily={F600} fontSize={9} fill="#4FAE7B">{t('glucosePage.limitLow')}</SvgText>
                {/* area + line */}
                {areaPath ? <Path d={areaPath} fill="url(#lineArea)" /> : null}
                {pointsWithData.length >= 2 ? (
                  <Polyline points={polyPoints} fill="none" stroke={GREEN} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
                ) : null}
                {pointsWithData.map((p, i) => (
                  <React.Fragment key={i}>
                    <Circle cx={p.x} cy={p.y} r={4} fill={GREEN} stroke="#fff" strokeWidth={2} />
                    <SvgText x={p.x} y={p.y - 10} textAnchor="middle" fontFamily={F700} fontSize={10} fill="#5C6E63">{p.v}</SvgText>
                  </React.Fragment>
                ))}
                {week.map((d, i) => (
                  <SvgText key={`l${i}`} x={xOf(i)} y={166} textAnchor="middle" fontFamily={F600} fontSize={11} fill="#9AA8A0">
                    {d.label}
                  </SvgText>
                ))}
              </Svg>
            ) : (
              <Text style={styles.chartEmpty}>{t('glucosePage.emptyMsg')}</Text>
            )}
          </View>
        </FadeInView>

        {/* ── Conseil IA ── */}
        <FadeInView delay={170} style={{ paddingHorizontal: 20, marginTop: 14 }}>
          <Pressable style={styles.coachCard} onPress={() => router.push('/ai-chat')}>
            <View style={styles.coachRobot}>
              <AnimatedRobot size={44} mood="happy" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.coachPill}>
                <Text style={styles.coachPillText}>{t('glucosePage.aiTip')}</Text>
              </View>
              <Text style={styles.coachTitle}>
                {weekStats && weekStats.tir >= 70 ? t('glucosePage.tipGood') : t('glucosePage.tipWatch')}
              </Text>
              <Text style={styles.coachSub}>
                {weekStats && weekStats.tir >= 70 ? t('glucosePage.tipGoodSub') : t('glucosePage.tipWatchSub')}
              </Text>
            </View>
            <ChevronRight color="#4A5A51" size={20} />
          </Pressable>
        </FadeInView>

        {/* ── Dernières mesures + Plages ── */}
        <FadeInView delay={210} style={styles.duoRow}>
          {/* Dernières mesures */}
          <View style={[styles.card, styles.duoCard]}>
            <Text style={styles.duoTitle}>{t('glucosePage.recentMeasures')}</Text>
            {recentMeasures.length === 0 ? (
              <Text style={styles.emptyMini}>{t('glucosePage.noMeasure')}</Text>
            ) : (
              recentMeasures.map((g, i) => {
                const z = zoneFor(g.value, low, high);
                return (
                  <View
                    key={g.id}
                    style={[styles.measureRow, i < recentMeasures.length - 1 && styles.measureRowBorder]}
                  >
                    <View style={styles.measureChip}>
                      <ClockIcon />
                    </View>
                    <Text style={styles.measureTime}>
                      {new Date(g.created_at).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                    <Text style={styles.measureValue} numberOfLines={1}>
                      {g.value}
                      <Text style={styles.measureUnit}> mg/dL</Text>
                    </Text>
                    <View style={styles.measureStatus}>
                      <View style={[styles.measureDot, { backgroundColor: z.color }]} />
                      <Text style={[styles.measureStatusText, { color: z.color }]} numberOfLines={1}>
                        {t(z.labelKey)}
                      </Text>
                      <Pressable onPress={() => deleteGlucose(g.id)} hitSlop={6} style={styles.measureDel}>
                        <Text style={styles.measureDelX}>✕</Text>
                      </Pressable>
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* Plages de glycémie */}
          <View style={[styles.card, styles.duoCard]}>
            <Text style={styles.duoTitle}>{t('glucosePage.ranges')}</Text>
            <RangeBar
              label={t('glucosePage.inRange')}
              hint={`(${low}-${high})`}
              pct={weekStats?.tir ?? 0}
              track="#EAF3EC"
              fill={GREEN}
            />
            <RangeBar
              label={t('glucosePage.rangeHigh')}
              hint={`(> ${high})`}
              pct={weekStats?.high ?? 0}
              track="#FBEFDD"
              fill="#F59E0B"
            />
            <RangeBar
              label={t('glucosePage.rangeLow')}
              hint={`(< ${low})`}
              pct={weekStats?.low ?? 0}
              track="#FBE3E3"
              fill="#EF4444"
              last
            />
          </View>
        </FadeInView>

        {/* ── Empty state (robot) ── */}
        {recentMeasures.length === 0 ? (
          <FadeInView delay={180} style={styles.emptyCard}>
            <AnimatedRobot size={72} mood="happy" />
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
              <Text style={styles.emptyTitle}>{t('glucosePage.emptyTitle')}</Text>
              <Text style={styles.emptyMsg}>{t('glucosePage.emptyMsg')}</Text>
            </View>
          </FadeInView>
        ) : null}

        {/* ── Ajouter une mesure ── */}
        <FadeInView delay={250} style={styles.addRow}>
          <Pressable style={styles.addCard} onPress={() => router.push('/log-glucose')}>
            <LinearGradient colors={['#2FC178', '#149A57']} start={{ x: 0.1, y: 0 }} end={{ x: 0.9, y: 1 }} style={styles.addGrad}>
              <View style={styles.addChip}>
                <Text style={{ fontSize: 20 }}>🩸</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.addTitle}>{t('glucosePage.addMeasure')}</Text>
                <Text style={styles.addSub}>{t('glucosePage.addMeasureSub')}</Text>
              </View>
              <View style={styles.addChevron}>
                <ChevronRight color="#fff" size={18} />
              </View>
            </LinearGradient>
          </Pressable>
        </FadeInView>
      </ScrollView>

      {/* ── FAB ── */}
      <Pressable
        onPress={() => router.push('/log-glucose')}
        style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 16 }]}
      >
        <LinearGradient colors={['#2FC178', '#149A57']} style={styles.fabGrad}>
          <PlusThin />
        </LinearGradient>
      </Pressable>

      {/* ── Day picker ── */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setPickerOpen(false)}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>{t('glucosePage.pickDay')}</Text>
            {Array.from({ length: 7 }, (_, i) => i).map((off) => {
              const count = glucoseLogs.filter((g) => {
                const d = new Date();
                d.setDate(d.getDate() - off);
                return sameDay(g.created_at, d);
              }).length;
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
                  <Text style={[styles.pickerDay, active && { color: GREEN }]}>{dayLabel(off)}</Text>
                  <Text style={styles.pickerCount}>
                    {count > 0 ? `${count} ${count > 1 ? t('glucosePage.measures') : t('glucosePage.measure')}` : '—'}
                  </Text>
                  {active ? (
                    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                      <Circle cx={8} cy={8} r={7} fill={GREEN} />
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
    </View>
  );
}

function RangeBar({
  label,
  hint,
  pct,
  track,
  fill,
  last,
}: {
  label: string;
  hint: string;
  pct: number;
  track: string;
  fill: string;
  last?: boolean;
}) {
  return (
    <View style={{ marginBottom: last ? 0 : 12 }}>
      <View style={styles.rangeHead}>
        <Text style={styles.rangeLabel}>
          {label} <Text style={styles.rangeHint}>{hint}</Text>
        </Text>
        <Text style={styles.rangePct}>{pct}%</Text>
      </View>
      <View style={[styles.rangeTrack, { backgroundColor: track }]}>
        <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', borderRadius: 99, backgroundColor: fill }} />
      </View>
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
  root: { flex: 1, backgroundColor: '#F6F9F5' },

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
  headRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 9,
    paddingHorizontal: 12,
    maxWidth: 150,
    ...shadows.card,
  },
  dateChipText: { fontFamily: F600, fontSize: 13, color: INK, flexShrink: 1 },
  dotsBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },

  hello: { fontFamily: F800, fontSize: 26, color: INK, letterSpacing: -0.3 },
  helloSub: { fontFamily: F500, fontSize: 15, color: '#63736A', marginTop: 4 },

  topRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginTop: 16, alignItems: 'stretch' },
  gaugeCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    alignItems: 'center',
    ...cardShadow,
  },
  gaugeCardLabel: { fontFamily: F600, fontSize: 12.5, color: '#5C6E63' },
  gaugeCenter: { position: 'absolute', top: 46, left: 0, right: 0, alignItems: 'center' },
  gaugeUnitRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gaugeUnit: { fontFamily: F600, fontSize: 11.5, color: '#9AA8A0' },
  gaugeValue: { fontFamily: F800, fontSize: 44, color: INK, lineHeight: 46, marginTop: 2 },
  gaugeDash: { fontFamily: F800, fontSize: 40, color: '#CBD5E1', marginTop: 2 },
  gaugePill: { marginTop: 8, borderRadius: 99, paddingVertical: 3, paddingHorizontal: 11 },
  gaugePillText: { fontFamily: F700, fontSize: 11.5 },
  gaugeEmpty: { fontFamily: F500, fontSize: 11, color: '#9AA8A0', marginTop: 6 },
  gaugeEnd: { position: 'absolute', top: 126, fontFamily: F700, fontSize: 12, color: '#9AA8A0' },
  gaugePointer: {
    position: 'absolute',
    left: '50%',
    marginLeft: -6,
    bottom: 0,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 9,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: GREEN,
  },

  statsCol: { flex: 1, minWidth: 0, gap: 10 },
  miniDuo: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 13,
    flexDirection: 'row',
    ...cardShadow,
  },
  miniHalf: { flex: 1, minWidth: 0, paddingRight: 10 },
  miniHalfBorder: { paddingRight: 0, paddingLeft: 10, borderLeftWidth: 1, borderLeftColor: '#EDF1EE' },
  miniHead: { alignItems: 'flex-start', gap: 5 },
  miniIcon: { width: 22, height: 22, borderRadius: 7, alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  miniLabel: { fontFamily: F600, fontSize: 10.5, lineHeight: 13, color: '#5C6E63', alignSelf: 'stretch' },
  miniValue: { fontFamily: F800, fontSize: 21, color: INK, marginTop: 8 },
  miniUnit: { fontFamily: F600, fontSize: 11, color: '#9AA8A0' },
  trendCard: {
    backgroundColor: '#fff',
    borderRadius: 20,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    ...cardShadow,
  },
  trendValue: { fontFamily: F800, fontSize: 16, color: INK, marginTop: 1 },
  trendSub: { fontFamily: F500, fontSize: 10.5, color: '#9AA8A0' },

  card: { backgroundColor: '#fff', borderRadius: 24, padding: 16, ...cardShadow },
  cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitle: { fontFamily: F800, fontSize: 15, color: INK },
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
  chartEmpty: { fontFamily: F500, fontSize: 13, color: '#9AA8A0', textAlign: 'center', paddingVertical: 30 },

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
  coachPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#BFE6CE',
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  coachPillText: { fontFamily: F700, fontSize: 11.5, color: GREEN_D },
  coachTitle: { fontFamily: F800, fontSize: 14.5, color: GREEN_D, marginTop: 6 },
  coachSub: { fontFamily: F500, fontSize: 13, color: '#3A4A42', marginTop: 3, lineHeight: 18 },

  duoRow: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, marginTop: 14, alignItems: 'stretch' },
  duoCard: { flex: 1, minWidth: 0, padding: 14 },
  duoTitle: { fontFamily: F800, fontSize: 14, color: INK, marginBottom: 8 },
  emptyMini: { fontFamily: F500, fontSize: 12.5, color: '#9AA8A0', paddingVertical: 14, textAlign: 'center' },

  measureRow: { flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 9 },
  measureRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F3F1' },
  measureChip: { width: 26, height: 26, borderRadius: 8, backgroundColor: '#E4F6EC', alignItems: 'center', justifyContent: 'center' },
  measureTime: { fontFamily: F600, fontSize: 11, color: '#9AA8A0' },
  measureValue: { flex: 1, minWidth: 0, fontFamily: F800, fontSize: 13, color: INK },
  measureUnit: { fontFamily: F600, fontSize: 10, color: '#9AA8A0' },
  measureStatus: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  measureDot: { width: 5, height: 5, borderRadius: 3 },
  measureStatusText: { fontFamily: F700, fontSize: 9.5, maxWidth: 52 },
  measureDel: { marginLeft: 2, padding: 2 },
  measureDelX: { fontFamily: F700, fontSize: 11, color: '#C2CCC5' },

  rangeHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 4 },
  rangeLabel: { fontFamily: F700, fontSize: 11.5, color: INK, flexShrink: 1 },
  rangeHint: { fontFamily: F500, fontSize: 9.5, color: '#9AA8A0' },
  rangePct: { fontFamily: F800, fontSize: 12, color: INK },
  rangeTrack: { height: 6, borderRadius: 99, marginTop: 6, overflow: 'hidden' },

  emptyCard: {
    marginTop: 16,
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    ...cardShadow,
  },
  emptyTitle: { fontFamily: F800, fontSize: 15, color: INK },
  emptyMsg: { fontFamily: F500, fontSize: 13, color: '#63736A', lineHeight: 18 },

  addRow: { paddingHorizontal: 20, marginTop: 16 },
  addCard: { borderRadius: 20, overflow: 'hidden', shadowColor: '#149A57', shadowOffset: { width: 0, height: 12 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 6 },
  addGrad: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  addChip: { width: 44, height: 44, borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.22)', alignItems: 'center', justifyContent: 'center' },
  addTitle: { fontFamily: F800, fontSize: 15, color: '#fff' },
  addSub: { fontFamily: F500, fontSize: 12.5, color: 'rgba(255,255,255,0.92)', marginTop: 2 },
  addChevron: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.25)', alignItems: 'center', justifyContent: 'center' },

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
  fabGrad: { width: 60, height: 60, borderRadius: 30, alignItems: 'center', justifyContent: 'center' },

  /* Day picker */
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(16,24,40,0.42)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 34 },
  pickerHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E3E8EE', marginBottom: 14 },
  pickerTitle: { fontFamily: F800, fontSize: 17, color: INK, marginBottom: 10 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 14 },
  pickerRowActive: { backgroundColor: '#F2F8F4' },
  pickerDay: { flex: 1, fontFamily: F700, fontSize: 14.5, color: INK, textTransform: 'capitalize' },
  pickerCount: { fontFamily: F500, fontSize: 12.5, color: '#9AA8A0' },
  pickerRadio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.6, borderColor: '#D5DBE2' },
});
