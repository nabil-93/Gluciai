import React, { useMemo, useRef, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, {
  Circle,
  Defs,
  Ellipse,
  Line,
  LinearGradient as SvgLinearGradient,
  Path,
  RadialGradient,
  Rect,
  Stop,
} from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft, FadeInView, PlusGlyph } from '@/components/ui';
import { predictGlucose } from '@/services/prediction';
import { useAppStore } from '@/store/useAppStore';
import { shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN = '#12B76A';

/* ── Zones: the exact same 4-colour scale as the home dashboard ── */
type GlyZone = {
  key: 'low' | 'normal' | 'moderate' | 'high';
  color: string;
  pale: string;
  strong: string;
  labelKey: string;
};
const GLY_ZONES: GlyZone[] = [
  { key: 'low', color: '#3b82f6', pale: '#dbeafe', strong: '#3b82f6', labelKey: 'home.glyLow' },
  { key: 'normal', color: '#22b95e', pale: '#cdeed9', strong: '#3fc873', labelKey: 'home.glyNormal' },
  { key: 'moderate', color: '#f5b60a', pale: '#fbeab9', strong: '#f6bc1c', labelKey: 'home.glyModerate' },
  { key: 'high', color: '#ef4444', pale: '#fbd0d0', strong: '#f05656', labelKey: 'home.glyVeryHigh' },
];
function zoneFor(value: number, low: number, high: number): GlyZone {
  if (value < low) return GLY_ZONES[0];
  if (value <= high) return GLY_ZONES[1];
  if (value <= high * 1.4) return GLY_ZONES[2];
  return GLY_ZONES[3];
}
/** Same knob mapping as the home ring (Bas→Haut). */
function sliderFrac(value: number, low: number, high: number): number {
  const lo = low * 0.55;
  const hi = high * 1.6;
  return Math.max(0, Math.min(1, (value - lo) / (hi - lo)));
}
function mixHex(a: string, b: string, t: number) {
  const pa = parseInt(a.slice(1), 16);
  const pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => {
    const va = (pa >> sh) & 255;
    const vb = (pb >> sh) & 255;
    return Math.round(va + (vb - va) * t);
  };
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

/* ── The home-page degradé ring, 1:1 (same geometry & conic gradient) ── */
function GlucoseRing({
  value,
  zone,
  zoneLabel,
  frac,
  width = 206,
  emptyText,
}: {
  value: number | null;
  zone: GlyZone | null;
  zoneLabel: string;
  frac: number;
  width?: number;
  emptyText?: string;
}) {
  const VB = 280;
  const H = 330;
  const s = width / VB;
  const cx = 140;
  const cy = 140;
  const R_RING = 128.5;
  const RING_W = 23;
  const pale = zone?.pale ?? '#e9edf2';
  const strong = zone?.strong ?? '#ccd5df';
  const tint = zone?.strong ?? '#ccd5df';

  const colorAt = (deg: number) => {
    const d = ((deg % 360) + 360) % 360;
    const t = d <= 78 ? d / 78 : d >= 282 ? (360 - d) / 78 : 1;
    return mixHex(pale, strong, t);
  };
  const pt = (deg: number, r: number) => ({
    x: cx + r * Math.sin((deg * Math.PI) / 180),
    y: cy - r * Math.cos((deg * Math.PI) / 180),
  });
  const SEGS = 72;
  const STEP = 360 / SEGS;
  const segs = Array.from({ length: SEGS }, (_, i) => {
    const a0 = i * STEP;
    const p0 = pt(a0, R_RING);
    const p1 = pt(a0 + STEP + 0.8, R_RING);
    return {
      d: `M ${p0.x.toFixed(2)} ${p0.y.toFixed(2)} A ${R_RING} ${R_RING} 0 0 1 ${p1.x.toFixed(2)} ${p1.y.toFixed(2)}`,
      color: colorAt(a0 + STEP / 2),
    };
  });
  const knob = pt(-55 + 150 * frac, 130);

  return (
    <View style={{ width, height: Math.round(H * s) }}>
      <Svg width={width} height={Math.round(H * s)} viewBox={`0 0 ${VB} ${H}`}>
        <Defs>
          <RadialGradient id="gpFace" cx="50%" cy="35%" r="75%">
            <Stop offset="0" stopColor="#ffffff" />
            <Stop offset="1" stopColor="#f5faf6" />
          </RadialGradient>
          <RadialGradient id="gpFaceShadow" cx="50%" cy="50%" r="50%">
            <Stop offset="0.82" stopColor="#28503a" stopOpacity="0.26" />
            <Stop offset="1" stopColor="#28503a" stopOpacity="0" />
          </RadialGradient>
          <RadialGradient id="gpReflect" cx="50%" cy="50%" r="50%">
            <Stop offset="0" stopColor={tint} stopOpacity="0.3" />
            <Stop offset="0.72" stopColor={tint} stopOpacity="0" />
            <Stop offset="1" stopColor={tint} stopOpacity="0" />
          </RadialGradient>
        </Defs>

        {segs.map((g, i) => (
          <Path key={i} d={g.d} stroke={g.color} strokeWidth={RING_W} fill="none" />
        ))}
        <Circle cx={cx} cy={cy + 8} r={119} fill="url(#gpFaceShadow)" />
        <Circle cx={cx} cy={cy} r={120} fill="url(#gpFace)" />

        <Ellipse cx={cx} cy={287} rx={120} ry={19} fill="url(#gpReflect)" />
        <Path
          d={`M ${cx - 98} 288 A 98 15 0 0 1 ${cx + 98} 288`}
          stroke="rgba(255,255,255,0.85)"
          strokeWidth={2}
          fill="none"
        />

        {value != null ? (
          <>
            <Circle cx={knob.x} cy={knob.y + 2} r={13.5} fill="rgba(0,0,0,0.14)" />
            <Circle cx={knob.x} cy={knob.y} r={13} fill="#ffffff" />
            <Circle cx={knob.x} cy={knob.y} r={6.5} fill={zone?.color ?? '#ccd5df'} />
          </>
        ) : null}
      </Svg>

      <View
        style={{
          position: 'absolute',
          left: 20 * s,
          top: 20 * s,
          width: 240 * s,
          height: 240 * s,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {value != null ? (
          <>
            <Text style={[styles.ringValue, { fontSize: 62 * s, lineHeight: 66 * s }]}>
              {value}
            </Text>
            <Text style={[styles.ringUnit, { fontSize: 20 * s }]}>mg/dL</Text>
            {zone ? (
              <View style={[styles.ringPill, { backgroundColor: zone.color }]}>
                <Text style={styles.ringPillText}>{zoneLabel}</Text>
              </View>
            ) : null}
          </>
        ) : (
          <>
            <View style={styles.ringDash} />
            <Text style={[styles.ringUnit, { fontSize: 20 * s }]}>mg/dL</Text>
            {emptyText ? <Text style={styles.ringEmpty}>{emptyText}</Text> : null}
          </>
        )}
      </View>
    </View>
  );
}

/* ── Smooth (Catmull-Rom) path through chart points ── */
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

function sameDay(iso: string, ref: Date) {
  return new Date(iso).toDateString() === ref.toDateString();
}

export default function GlucoseScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: winW } = useWindowDimensions();
  const { glucoseLogs, meals, profile, removeGlucoseLog } = useAppStore();

  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;
  const firstName = (profile?.name || '').trim().split(/\s+/)[0] || '';

  /* ── Day picker: 0 = today … 6 = six days ago ── */
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

  const stats = useMemo(() => {
    if (dayLogs.length === 0) return null;
    const values = dayLogs.map((g) => g.value);
    const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
    const max = Math.max(...values);
    const inRange = values.filter((v) => v >= low && v <= high).length;
    const tir = Math.round((inRange / values.length) * 100);
    return { avg, max, tir };
  }, [dayLogs, low, high]);

  const prediction = useMemo(
    () => (dayOffset === 0 ? predictGlucose(glucoseLogs, meals, profile) : null),
    [glucoseLogs, meals, profile, dayOffset]
  );

  /* ── Day-curve geometry (330×110, y = 103 − v/3 like the mockup) ── */
  const CW = 330;
  const vy = (v: number) => Math.max(3, Math.min(103, 103 - v / 3));
  const chartPts = dayLogs.map((g) => {
    const d = new Date(g.created_at);
    const mins = d.getHours() * 60 + d.getMinutes();
    return { x: (mins / 1440) * CW, y: vy(g.value), v: g.value };
  });
  const linePath = smoothPath(chartPts);
  const fillPath = chartPts.length
    ? `${linePath} L ${chartPts[chartPts.length - 1].x.toFixed(1)} 103 L ${chartPts[0].x.toFixed(1)} 103 Z`
    : '';

  /* "Voir tout" scrolls to the readings list */
  const scrollRef = useRef<ScrollView>(null);
  const readingsYRef = useRef(0);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const HERO_H = insets.top + 342;
  const ringW = Math.min(214, winW - 172);

  return (
    <View style={styles.root}>
      <ScrollView
        ref={scrollRef}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* ── Hero: photo background fading into white ── */}
        <View>
          <Image
            source={require('../assets/glucose/hero-bg.png')}
            style={[styles.heroImg, { height: HERO_H }]}
            resizeMode="cover"
          />
          {/* fade to white so the photo melts into the content */}
          <LinearGradient
            colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.65)', '#ffffff']}
            locations={[0, 0.5, 0.92]}
            style={[styles.heroFade, { top: HERO_H - 120 }]}
            pointerEvents="none"
          />

          {/* Header */}
          <View style={[styles.headRow, { paddingTop: insets.top + 10 }]}>
            <Pressable onPress={close} style={styles.backBtn}>
              <ChevronLeft size={16} />
            </Pressable>
            <Text style={styles.headTitle}>{t('glucosePage.title')}</Text>
            <Pressable onPress={() => setPickerOpen(true)} style={styles.dateChip}>
              <Svg width={13} height={13} viewBox="0 0 14 14" fill="none">
                <Rect x={1.5} y={2.5} width={11} height={10} rx={2} stroke="#101828" strokeWidth={1.4} />
                <Path d="M1.5 5.5H12.5" stroke="#101828" strokeWidth={1.4} />
                <Path d="M4.5 1V3.5M9.5 1V3.5" stroke="#101828" strokeWidth={1.4} strokeLinecap="round" />
              </Svg>
              <Text style={styles.dateChipText} numberOfLines={1}>
                {dayLabel(dayOffset)}
              </Text>
              <Svg width={10} height={10} viewBox="0 0 10 10" fill="none">
                <Path d="M2.5 4L5 6.5L7.5 4" stroke="#101828" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" />
              </Svg>
            </Pressable>
          </View>

          {/* Greeting */}
          <FadeInView delay={30}>
            <Text style={styles.hello}>
              {firstName
                ? t('glucosePage.hello', { name: firstName })
                : t('glucosePage.helloNoName')}
            </Text>
            <Text style={styles.helloSub}>
              {dayOffset === 0 ? t('glucosePage.subtitle') : t('glucosePage.subtitleDay')}
            </Text>
          </FadeInView>

          {/* Ring — same architecture as the home dashboard */}
          <FadeInView delay={80} style={{ alignItems: 'center', marginTop: 14 }}>
            <GlucoseRing
              value={latest ? latest.value : null}
              zone={zone}
              zoneLabel={zone ? t(zone.labelKey) : ''}
              frac={latest ? sliderFrac(latest.value, low, high) : 0}
              width={ringW}
              emptyText={t('glucosePage.noMeasure')}
            />
            <View style={styles.scaleRow}>
              <Text style={styles.scaleText}>0</Text>
              <Text style={styles.scaleText}>300</Text>
            </View>
          </FadeInView>
        </View>

        {/* ── Stats row ── */}
        <FadeInView delay={130} style={styles.statsRow}>
          <View style={styles.statCard}>
            <View style={styles.statHead}>
              <View style={[styles.statIcon, { backgroundColor: '#E7F8F0' }]}>
                <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
                  <Circle cx={6} cy={6} r={4.6} stroke={GREEN} strokeWidth={1.3} />
                  <Path d="M4 6.1L5.4 7.5L8 4.7" stroke={GREEN} strokeWidth={1.3} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
              <Text style={styles.statLabel}>{t('glucosePage.avg')}</Text>
            </View>
            <Text style={styles.statValue}>{stats ? stats.avg : '—'}</Text>
            <Text style={styles.statUnit}>mg/dL</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statHead}>
              <View style={[styles.statIcon, { backgroundColor: '#EFECFE' }]}>
                <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
                  <Path d="M2 8.5L4.8 5.7L6.8 7.4L10 3.8" stroke="#7A5AF8" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M7.4 3.8H10V6.3" stroke="#7A5AF8" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
              <Text style={styles.statLabel}>{t('glucosePage.inTarget')}</Text>
            </View>
            <Text style={styles.statValue}>{stats ? `${stats.tir}%` : '—'}</Text>
            <Text style={styles.statUnit}>{t('glucosePage.ofTime')}</Text>
          </View>

          <View style={styles.statCard}>
            <View style={styles.statHead}>
              <View style={[styles.statIcon, { backgroundColor: '#FEF4E6' }]}>
                <Svg width={12} height={12} viewBox="0 0 12 12" fill="none">
                  <Path d="M2 9L5 6L7 7.6L10 4" stroke="#F79009" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
                  <Path d="M7.6 4H10V6.4" stroke="#F79009" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
                </Svg>
              </View>
              <Text style={styles.statLabel}>{t('glucosePage.max')}</Text>
            </View>
            <Text style={styles.statValue}>{stats ? stats.max : '—'}</Text>
            <Text style={styles.statUnit}>mg/dL</Text>
          </View>
        </FadeInView>

        {/* ── Courbe du jour ── */}
        {dayLogs.length > 0 ? (
          <FadeInView delay={180} style={styles.chartCard}>
            <View style={styles.chartHead}>
              <Text style={styles.chartTitle}>{t('glucosePage.dayCurve')}</Text>
              <Pressable
                onPress={() =>
                  scrollRef.current?.scrollTo({ y: readingsYRef.current - 60, animated: true })
                }
              >
                <Text style={styles.seeAll}>{t('glucosePage.seeAll')}</Text>
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', gap: 6 }}>
              <View style={styles.yAxis}>
                <Text style={styles.axisText}>300</Text>
                <Text style={styles.axisText}>200</Text>
                <Text style={styles.axisText}>100</Text>
                <Text style={styles.axisText}>0</Text>
              </View>
              <Svg width="100%" height={110} viewBox={`0 0 ${CW} 110`} preserveAspectRatio="none" style={{ flex: 1 }}>
                <Defs>
                  <SvgLinearGradient id="gpLine" x1="0" y1="0" x2="0" y2="110" gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor="#EF4444" />
                    <Stop offset="0.28" stopColor="#F59E0B" />
                    <Stop offset="0.55" stopColor={GREEN} />
                    <Stop offset="1" stopColor={GREEN} />
                  </SvgLinearGradient>
                  <SvgLinearGradient id="gpFill" x1="0" y1="0" x2="0" y2="110" gradientUnits="userSpaceOnUse">
                    <Stop offset="0" stopColor="#F59E0B" stopOpacity="0.35" />
                    <Stop offset="0.45" stopColor={GREEN} stopOpacity="0.28" />
                    <Stop offset="1" stopColor={GREEN} stopOpacity="0.04" />
                  </SvgLinearGradient>
                </Defs>
                {/* Target band */}
                <Rect x={0} y={vy(high)} width={CW} height={vy(low) - vy(high)} fill={GREEN} opacity={0.07} />
                <Line x1={0} y1={3} x2={CW} y2={3} stroke="#F1F3F6" strokeWidth={1} />
                <Line x1={0} y1={36} x2={CW} y2={36} stroke="#F1F3F6" strokeWidth={1} />
                <Line x1={0} y1={70} x2={CW} y2={70} stroke="#F1F3F6" strokeWidth={1} />
                <Line x1={0} y1={103} x2={CW} y2={103} stroke="#F1F3F6" strokeWidth={1} />
                {fillPath ? <Path d={fillPath} fill="url(#gpFill)" /> : null}
                {linePath ? (
                  <Path d={linePath} fill="none" stroke="url(#gpLine)" strokeWidth={1.8} strokeLinejoin="round" strokeLinecap="round" />
                ) : null}
                {chartPts.map((p, i) => (
                  <Circle
                    key={i}
                    cx={p.x}
                    cy={p.y}
                    r={2.6}
                    fill={zoneFor(p.v, low, high).color}
                    stroke="#fff"
                    strokeWidth={1.2}
                  />
                ))}
              </Svg>
            </View>
            <View style={styles.xAxis}>
              {['00:00', '06:00', '12:00', '18:00', '24:00'].map((h) => (
                <Text key={h} style={styles.axisText}>
                  {h}
                </Text>
              ))}
            </View>

            {/* Legend */}
            <View style={styles.legend}>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: GREEN }]} />
                <Text style={styles.legendText}>{t('home.glyNormal')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#FACC15' }]} />
                <Text style={styles.legendText}>{t('home.glyModerate')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#EF4444' }]} />
                <Text style={styles.legendText}>{t('home.glyVeryHigh')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendDot, { backgroundColor: '#CBD5E1' }]} />
                <Text style={[styles.legendText, { color: '#98A2B3' }]}>{t('home.glyLow')}</Text>
              </View>
            </View>
          </FadeInView>
        ) : null}

        {/* ── Prediction (today only) ── */}
        {prediction && dayOffset === 0 ? (
          <FadeInView delay={220} style={styles.predCard}>
            <View style={styles.predHead}>
              <Text style={styles.predTitle}>
                {prediction.direction === 'rise'
                  ? t('glucosePage.predRise')
                  : prediction.direction === 'drop'
                    ? t('glucosePage.predDrop')
                    : t('glucosePage.predStable')}
              </Text>
              {prediction.expectedValue !== null ? (
                <Text style={styles.predValue}>
                  ≈ {prediction.expectedValue}{' '}
                  <Text style={styles.predUnit}>{t('glucosePage.predIn2h')}</Text>
                </Text>
              ) : null}
            </View>
            {prediction.riskWindow ? (
              <Text style={styles.predRisk}>
                {t('glucosePage.predRisk', {
                  type:
                    prediction.riskType === 'hypo'
                      ? t('glucosePage.predHypo')
                      : t('glucosePage.predHyper'),
                  window: prediction.riskWindow,
                })}
              </Text>
            ) : null}
            <Text style={styles.predDisclaimer}>{t('glucosePage.predDisclaimer')}</Text>
          </FadeInView>
        ) : null}

        {/* ── Empty state (robot) ── */}
        {dayLogs.length === 0 ? (
          <FadeInView delay={180} style={styles.emptyCard}>
            <AnimatedRobot size={84} mood="happy" />
            <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
              <Text style={styles.emptyTitle}>
                {dayOffset === 0
                  ? t('glucosePage.emptyTitle')
                  : t('glucosePage.emptyTitleDay')}
              </Text>
              <Text style={styles.emptyMsg}>{t('glucosePage.emptyMsg')}</Text>
              {dayOffset === 0 ? (
                <Pressable onPress={() => router.push('/log-glucose')} style={styles.emptyBtn}>
                  <PlusGlyph size={12} color="#fff" />
                  <Text style={styles.emptyBtnText}>{t('glucosePage.addMeasure')}</Text>
                </Pressable>
              ) : null}
            </View>
          </FadeInView>
        ) : null}

        {/* ── Readings of the selected day ── */}
        {dayLogs.length > 0 ? (
          <View onLayout={(e) => (readingsYRef.current = e.nativeEvent.layout.y)}>
            <Text style={styles.section}>
              {dayLabel(dayOffset)} · {dayLogs.length}{' '}
              {dayLogs.length > 1 ? t('glucosePage.measures') : t('glucosePage.measure')}
            </Text>
            <View style={{ gap: 9, paddingHorizontal: 14 }}>
              {[...dayLogs].reverse().map((g) => {
                const z = zoneFor(g.value, low, high);
                return (
                  <View key={g.id} style={styles.readingRow}>
                    <View style={[styles.dot, { backgroundColor: z.color }]} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.readingValue}>
                        {g.value} <Text style={styles.readingUnit}>mg/dL</Text>
                      </Text>
                      {g.notes ? <Text style={styles.readingNotes}>{g.notes}</Text> : null}
                    </View>
                    <Text style={styles.readingTime}>
                      {new Date(g.created_at).toLocaleTimeString(i18n.language, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                    <Pressable onPress={() => removeGlucoseLog(g.id)} hitSlop={8} style={styles.deleteBtn}>
                      <Text style={styles.deleteText}>✕</Text>
                    </Pressable>
                  </View>
                );
              })}
            </View>
          </View>
        ) : null}
      </ScrollView>

      {/* ── FAB ── */}
      <Pressable
        onPress={() => router.push('/log-glucose')}
        style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 16 }]}
      >
        <PlusGlyph size={22} color="#fff" />
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
                  <Text style={[styles.pickerDay, active && { color: GREEN }]}>
                    {dayLabel(off)}
                  </Text>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#ffffff' },

  /* Hero */
  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, width: '100%' },
  heroFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 120,
  },

  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headTitle: { fontFamily: F700, fontSize: 19, color: '#101828' },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#ffffff',
    paddingHorizontal: 12,
    maxWidth: 148,
    ...shadows.card,
  },
  dateChipText: { fontFamily: F700, fontSize: 12.5, color: '#101828', textTransform: 'capitalize' },

  hello: { fontFamily: F700, fontSize: 15, color: '#101828', marginTop: 14, marginHorizontal: 16 },
  helloSub: { fontFamily: F500, fontSize: 12.5, color: '#667085', marginTop: 3, marginHorizontal: 16 },

  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: 190,
    marginTop: -26,
  },
  scaleText: { fontFamily: F600, fontSize: 11, color: '#98A2B3' },

  /* Ring centre */
  ringValue: { fontFamily: F800, color: '#152a1c', letterSpacing: -1 },
  ringUnit: { fontFamily: F600, color: '#7c9585', marginTop: 2 },
  ringPill: { marginTop: 8, paddingVertical: 7, paddingHorizontal: 20, borderRadius: 18 },
  ringPillText: { fontFamily: F600, fontSize: 14, color: '#ffffff' },
  ringDash: { width: 34, height: 5, borderRadius: 3, backgroundColor: '#c7d0dc', marginBottom: 6 },
  ringEmpty: {
    fontFamily: F600,
    fontSize: 12.5,
    color: '#8aa693',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 24,
  },

  /* Stats */
  statsRow: { flexDirection: 'row', gap: 9, paddingHorizontal: 14, marginTop: 12 },
  statCard: {
    flex: 1,
    backgroundColor: '#F9FAFB',
    borderWidth: 1,
    borderColor: '#F1F3F6',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
  },
  statHead: { flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 7 },
  statIcon: { width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  statLabel: { fontFamily: F600, fontSize: 10.5, color: '#667085' },
  statValue: { fontFamily: F800, fontSize: 21, color: '#101828', lineHeight: 24 },
  statUnit: { fontFamily: F500, fontSize: 11, color: '#98A2B3', marginTop: 2 },

  /* Chart */
  chartCard: {
    marginTop: 14,
    marginHorizontal: 14,
    borderWidth: 1,
    borderColor: '#EEF1F4',
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  chartHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  chartTitle: { fontFamily: F700, fontSize: 14, color: '#101828' },
  seeAll: { fontFamily: F700, fontSize: 12, color: GREEN },
  yAxis: { justifyContent: 'space-between', height: 104, paddingBottom: 2 },
  axisText: { fontFamily: F500, fontSize: 9.5, color: '#98A2B3', textAlign: 'right' },
  xAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginLeft: 26,
    marginBottom: 10,
  },
  legend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 13,
    flexWrap: 'wrap',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 7, height: 7, borderRadius: 4 },
  legendText: { fontFamily: F500, fontSize: 10.5, color: '#667085' },

  /* Prediction */
  predCard: {
    marginTop: 12,
    marginHorizontal: 14,
    borderWidth: 1,
    borderColor: '#EEF1F4',
    borderRadius: 16,
    padding: 14,
    backgroundColor: '#ffffff',
  },
  predHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  predTitle: { fontFamily: F700, fontSize: 14.5, color: '#101828' },
  predValue: { fontFamily: F800, fontSize: 15, color: '#101828' },
  predUnit: { fontFamily: F500, fontSize: 12, color: '#667085' },
  predRisk: { fontFamily: F500, marginTop: 8, fontSize: 12.5, lineHeight: 18, color: '#B45D22' },
  predDisclaimer: { fontFamily: F500, marginTop: 8, fontSize: 11, lineHeight: 15, color: '#98A2B3' },

  /* Empty state */
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F7F9FA',
    borderRadius: 18,
    padding: 16,
    marginTop: 14,
    marginHorizontal: 14,
  },
  emptyTitle: { fontFamily: F700, fontSize: 14.5, color: '#101828' },
  emptyMsg: { fontFamily: F500, fontSize: 12, lineHeight: 17, color: '#667085' },
  emptyBtn: {
    marginTop: 5,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: GREEN,
    borderRadius: 18,
    paddingVertical: 9,
    paddingHorizontal: 16,
    shadowColor: GREEN,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  emptyBtnText: { fontFamily: F700, fontSize: 12, color: '#ffffff' },

  /* Readings */
  section: {
    fontFamily: F700,
    fontSize: 15,
    color: '#101828',
    marginTop: 22,
    marginBottom: 10,
    marginHorizontal: 16,
    textTransform: 'capitalize',
  },
  readingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#EEF1F4',
    borderRadius: 14,
    paddingVertical: 11,
    paddingHorizontal: 13,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  readingValue: { fontFamily: F700, fontSize: 16.5, color: '#101828' },
  readingUnit: { fontFamily: F500, fontSize: 12, color: '#667085' },
  readingNotes: { fontFamily: F500, marginTop: 1, fontSize: 12, color: '#667085' },
  readingTime: { fontFamily: F600, fontSize: 12.5, color: '#667085' },
  deleteBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { fontSize: 12, color: '#667085', fontWeight: '700' },

  /* FAB */
  fab: {
    position: 'absolute',
    right: 16,
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: GREEN,
    shadowOpacity: 0.4,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 6,
  },

  /* Day picker */
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(16,24,40,0.45)',
    justifyContent: 'flex-end',
  },
  pickerSheet: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 30,
  },
  pickerHandle: {
    alignSelf: 'center',
    width: 40,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E4E7EC',
    marginBottom: 12,
  },
  pickerTitle: { fontFamily: F800, fontSize: 16, color: '#101828', marginBottom: 10 },
  pickerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 13,
  },
  pickerRowActive: { backgroundColor: '#E7F8F0' },
  pickerDay: {
    flex: 1,
    fontFamily: F700,
    fontSize: 14,
    color: '#101828',
    textTransform: 'capitalize',
  },
  pickerCount: { fontFamily: F500, fontSize: 12, color: '#98A2B3' },
  pickerRadio: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 1.6,
    borderColor: '#D0D5DD',
  },
});
