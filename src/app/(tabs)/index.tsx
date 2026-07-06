import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Easing,
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import Svg, { Circle, Path } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AnimatedRobot,
  FadeInView,
  PressableScale,
  RotaryDial,
  useReduceMotion,
} from '@/components/ui';
import { useTabBarScroll } from '@/components/ui/TabBarVisibility';
import { getDailyInsight, type Insight } from '@/services/insights';
import { getPlannedReminders } from '@/services/notifications';
import { useAppStore } from '@/store/useAppStore';
import { colors } from '@/theme';
import type { ActivityStatus, InsulinType, MealScan } from '@/types';

/* Official Claude Design assets — reused exactly, never redrawn */
const CIRC_ACTIVITY = require('../../assets/claude/circ-activity.png');
const CIRC_BOLUS = require('../../assets/claude/circ-bolus.png');
const CHART_EMPTY = require('../../assets/claude/chart.png');
const SPARK_STAR = require('../../assets/claude/spark-star.png');
const CHIP_BRAIN = require('../../assets/claude/chip-brain.png');
const SCAN_IMG = require('../../assets/claude/scanimg.png');
const SYRINGE = require('../../assets/claude/syringe.png');
const TL_ACT = require('../../assets/claude/tl-act.png');
const TL_MEAL = require('../../assets/claude/tl-meal.png');

/* Plus Jakarta Sans (loaded in the root layout) */
const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const STATUS_KEY: Record<ActivityStatus, string> = {
  active: 'home.statusActive',
  sick: 'home.statusSick',
  injured: 'home.statusInjured',
  paused: 'home.statusPaused',
};
const TYPE_KEY: Record<InsulinType, string> = {
  rapid: 'home.insulinRapid',
  long: 'home.insulinLong',
  mixed: 'home.insulinMixed',
};

const CARB_GOAL = 250;

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

/* Small inline SVG glyphs from the prototype (chevrons/arrows) */
function ChevDown({ size = 14, color = '#6b7280' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
function ArrowRight({ size = 15, color = '#6b7280' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M5 12h14M13 6l6 6-6 6" stroke={color} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}
function ChevRight({ size = 13, color = '#6b7280' }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </Svg>
  );
}

/* Meal-slot glyph: leaf (breakfast) · sun (lunch) · moon (dinner). */
function MealSlotIcon({
  slot,
  size = 18,
  muted = false,
}: {
  slot: 'breakfast' | 'lunch' | 'dinner';
  size?: number;
  muted?: boolean;
}) {
  const stroke = muted ? '#c2c9d4' : '#ffffff';
  if (slot === 'breakfast') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Path
          d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z"
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
        <Path d="M2 21c0-3 1.85-5.36 5.08-6" stroke={stroke} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
      </Svg>
    );
  }
  if (slot === 'lunch') {
    return (
      <Svg width={size} height={size} viewBox="0 0 24 24">
        <Circle cx={12} cy={12} r={4} stroke={stroke} strokeWidth={2} fill="none" />
        <Path
          d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
          stroke={stroke}
          strokeWidth={2}
          strokeLinecap="round"
        />
      </Svg>
    );
  }
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"
        stroke={stroke}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </Svg>
  );
}

/* ── Assistant tones: colors escalate with severity ── */
const AI_TONES = {
  danger: {
    kickerKey: 'home.assistantAlert',
    kickerColor: '#dc2626',
    gradient: ['#feecec', '#fef3f1'] as const,
    border: '#f6b1b1',
    glow: '#ef4444',
    dot: '#ef4444',
    title: '#b91c1c',
    ctaKey: 'home.assistantActNow',
    pulse: true,
    fast: true,
  },
  warning: {
    kickerKey: 'home.assistantWarning',
    kickerColor: '#d97706',
    gradient: ['#fef4e8', '#fff9f0'] as const,
    border: '#f7d3a4',
    glow: '#f59e0b',
    dot: '#f59e0b',
    title: '#b45309',
    ctaKey: 'home.assistantCheck',
    pulse: true,
    fast: false,
  },
  success: {
    kickerKey: 'home.assistant',
    kickerColor: '#7c6cf6',
    gradient: ['#f3f0ff', '#f7f5fe'] as const,
    border: 'transparent',
    glow: '#8a3ffc',
    dot: '#19c37d',
    title: '#111827',
    ctaKey: null,
    pulse: false,
    fast: false,
  },
  info: {
    kickerKey: 'home.assistant',
    kickerColor: '#7c6cf6',
    gradient: ['#f3f0ff', '#f7f5fe'] as const,
    border: 'transparent',
    glow: '#8a3ffc',
    dot: '#8a3ffc',
    title: '#111827',
    ctaKey: null,
    pulse: false,
    fast: false,
  },
} as const;

/**
 * AI Assistant card that reacts to severity: on danger/warning the
 * card glows and pulses (border + halo + status dot), colors shift to
 * red/orange, a CTA pill appears, and a warning haptic fires once.
 */
function AssistantCard({
  insight,
  onPress,
  onAction,
}: {
  insight: Insight;
  /** Tap on the card → AI coach journal (full history) */
  onPress: () => void;
  /** Tap on the CTA pill → direct action for this insight */
  onAction?: () => void;
}) {
  const { t } = useTranslation();
  const tone = AI_TONES[insight.tone] ?? AI_TONES.info;
  const rm = useReduceMotion();
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!tone.pulse || rm) {
      pulse.setValue(0);
      return;
    }
    // One-time warning haptic when a risky insight appears
    if (Platform.OS !== 'web') {
      Haptics.notificationAsync(
        insight.tone === 'danger'
          ? Haptics.NotificationFeedbackType.Warning
          : Haptics.NotificationFeedbackType.Success
      ).catch(() => {});
    }
    const duration = tone.fast ? 550 : 900;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, {
          toValue: 1,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(pulse, {
          toValue: 0,
          duration,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [insight.tone, rm]);

  const glowOpacity = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.45],
  });
  const dotScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.7],
  });
  const haloScale = pulse.interpolate({
    inputRange: [0, 1],
    outputRange: [0.9, 1.15],
  });

  return (
    <PressableScale onPress={onPress} accessibilityLabel={`Assistant : ${insight.title}`}>
      <View style={styles.aiWrap}>
        {/* Pulsing glow layer behind the card */}
        {tone.pulse ? (
          <Animated.View
            pointerEvents="none"
            style={[
              styles.aiGlow,
              { backgroundColor: tone.glow, opacity: glowOpacity },
            ]}
          />
        ) : null}
        <LinearGradient
          colors={[...tone.gradient]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.aiCard,
            tone.border !== 'transparent'
              ? { borderWidth: 1.5, borderColor: tone.border }
              : null,
          ]}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={styles.aiHead}>
              <Svg width={16} height={16} viewBox="0 0 24 24">
                <Path
                  d="M12 2 L14.6 9.4 L22 12 L14.6 14.6 L12 22 L9.4 14.6 L2 12 L9.4 9.4 Z"
                  fill={tone.kickerColor}
                />
              </Svg>
              <Text style={[styles.aiKicker, { color: tone.kickerColor }]}>
                {t(tone.kickerKey)}
              </Text>
              <Animated.View
                style={[
                  styles.aiDot,
                  {
                    backgroundColor: tone.dot,
                    transform: [{ scale: tone.pulse ? dotScale : 1 }],
                  },
                ]}
              />
            </View>
            <Text style={[styles.aiTitle, { color: tone.title }]}>
              {insight.title}
            </Text>
            <Text style={styles.aiBody} numberOfLines={3}>
              {insight.body}
            </Text>
            {tone.ctaKey && onAction ? (
              <Pressable
                onPress={onAction}
                style={[styles.aiCta, { backgroundColor: tone.glow }]}
                hitSlop={6}
              >
                <Text style={styles.aiCtaText}>{t(tone.ctaKey)}</Text>
                <ChevRight size={10} color="#fff" />
              </Pressable>
            ) : null}
          </View>
          <View style={styles.aiRobotWrap}>
            {tone.pulse ? (
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.aiRobotHalo,
                  {
                    backgroundColor: tone.glow,
                    opacity: glowOpacity,
                    transform: [{ scale: haloScale }],
                  },
                ]}
              />
            ) : null}
            <AnimatedRobot
              size={82}
              mood={insight.tone === 'danger' || insight.tone === 'warning' ? 'alert' : 'happy'}
            />
          </View>
          <ChevRight />
        </LinearGradient>
      </View>
    </PressableScale>
  );
}

/**
 * Glucose chart as vertical "balcony" bars: one bar per reading, height
 * scaled to its value, colored green when in-range and red when not —
 * plus a left-hand mg/dL scale (200/150/100/50).
 */
function GlucoseChart({
  points,
  axis,
  low,
  high,
}: {
  /** x01 = position 0..1 across the range */
  points: { x01: number; value: number }[];
  axis: string[];
  low: number;
  high: number;
}) {
  const H = 78;
  const sorted = points.slice().sort((a, b) => a.x01 - b.x01);

  // Scale the axis to the data itself — NOT the target range — so bars
  // always use the full height. A single 80 mg/dL reading should fill
  // most of the chart, not sit tiny against a scale stretched to 250
  // just because the target range goes that high.
  const values = sorted.map((p) => p.value);
  const dataMax = values.length ? Math.max(...values) : 100;
  const dataMin = values.length ? Math.min(...values) : 70;
  const rawMax = dataMax * 1.15;
  const rawMin = dataMin * 0.7;
  // Pick a "nice" step (10/25/50/…) so we always land on ~4 gridlines,
  // however wide or narrow the data's own range turns out to be.
  const NICE_STEPS = [10, 25, 50, 100, 150, 200];
  const span = Math.max(1, rawMax - rawMin);
  const STEP =
    NICE_STEPS.find((s) => span / s <= 4) ?? NICE_STEPS[NICE_STEPS.length - 1];
  const SCALE_MAX = Math.ceil(rawMax / STEP) * STEP;
  const SCALE_MIN = Math.max(0, Math.floor(rawMin / STEP) * STEP);
  const SCALE_STEPS: number[] = [];
  for (let s = SCALE_MAX; s > SCALE_MIN; s -= STEP) SCALE_STEPS.push(s);

  const barH = (v: number) => {
    const c = Math.max(SCALE_MIN, Math.min(SCALE_MAX, v));
    return ((c - SCALE_MIN) / (SCALE_MAX - SCALE_MIN)) * H;
  };

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.glyChartRow}>
        {/* Left mg/dL scale */}
        <View style={styles.glyScale}>
          {SCALE_STEPS.map((s) => (
            <Text key={s} style={styles.glyScaleText}>
              {s}
            </Text>
          ))}
        </View>

        {/* Bars */}
        <View style={styles.glyBars}>
          {/* Faint gridlines behind the bars, aligned with the scale */}
          {SCALE_STEPS.map((s) => (
            <View
              key={s}
              pointerEvents="none"
              style={[
                styles.glyGridline,
                { bottom: barH(s) },
              ]}
            />
          ))}
          {sorted.map((p, i) => {
            const inRange = p.value >= low && p.value <= high;
            return (
              <View key={i} style={styles.glyBarSlot}>
                <View
                  style={[
                    styles.glyBar,
                    {
                      height: Math.max(4, barH(p.value)),
                      backgroundColor: inRange ? '#19c37d' : '#ef4444',
                    },
                  ]}
                />
              </View>
            );
          })}
        </View>
      </View>
      <View style={styles.glyAxis}>
        {axis.map((t, i) => (
          <Text key={`${t}-${i}`} style={styles.glyAxisText}>
            {t}
          </Text>
        ))}
      </View>
    </View>
  );
}

/**
 * Risk meter — a horizontal bar of ticks that fill green → yellow → red
 * with the glucose risk level, a bolt icon tinted to the current risk,
 * and the percentage. Same color logic as the rotary dials.
 */
const RISK_TICKS = 42;
/** Green (0) → amber → red (1) along the risk fraction. */
function riskColor(f: number) {
  // hue 140 (green) → 45 (amber) → 4 (red)
  const hue = f < 0.5 ? 140 - (140 - 45) * (f / 0.5) : 45 - (45 - 4) * ((f - 0.5) / 0.5);
  const sat = 78;
  const lig = 46;
  // reuse a compact HSL→rgb
  const s = sat / 100;
  const l = lig / 100;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const ch = (n: number) => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c);
  };
  return `rgb(${ch(0)}, ${ch(8)}, ${ch(4)})`;
}

function RiskBar({
  risk,
  avg,
  label,
}: {
  /** 0..1 risk fraction */
  risk: number;
  /** average glucose (for the a11y label) */
  avg: number;
  label: string;
}) {
  const pct = Math.round(risk * 100);
  const filled = Math.round(risk * RISK_TICKS);
  const tint = riskColor(risk);
  return (
    <View
      style={styles.riskBar}
      accessibilityLabel={`${label}: ${pct}% · ${avg} mg/dL`}
    >
      {/* Bolt icon tinted to the risk level */}
      <Svg width={18} height={18} viewBox="0 0 24 24">
        <Path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill={tint} />
      </Svg>
      {/* Ticks */}
      <View style={styles.riskTicks}>
        {Array.from({ length: RISK_TICKS }).map((_, i) => {
          const on = i < filled;
          // Each lit tick uses the color at ITS position, so the bar itself
          // shows the green→red gradient as it fills.
          const c = on ? riskColor((i + 1) / RISK_TICKS) : '#e6e8ef';
          return (
            <View
              key={i}
              style={[
                styles.riskTick,
                { backgroundColor: c, opacity: on ? 1 : 0.7 },
              ]}
            />
          );
        })}
      </View>
      {/* Percentage */}
      <Text style={[styles.riskPct, { color: tint }]}>{pct}%</Text>
    </View>
  );
}

/** One metric card: wide white card + Rotary Dial + labels. */
function RingCard({
  progress,
  valueText,
  hasData,
  label,
  sub,
  onPress,
  animateDelay = 0,
}: {
  progress: number;
  valueText: string;
  hasData: boolean;
  label: string;
  sub: string;
  onPress: () => void;
  /** Stagger for the startup sweep so the row fires left-to-right. */
  animateDelay?: number;
}) {
  // Size the dial to the measured card width so it visually dominates
  // the card (~98% of the width), staying crisp across screen sizes.
  const [cardW, setCardW] = React.useState(0);
  const dialSize = cardW > 0 ? Math.round(cardW * 0.98) : 108;
  return (
    <PressableScale
      containerStyle={styles.ringCardWrap}
      style={styles.ringCard}
      onPress={onPress}
      onLayout={(e) => setCardW(e.nativeEvent.layout.width)}
      accessibilityLabel={`${label} : ${sub}`}
    >
      <RotaryDial
        size={dialSize}
        value={hasData ? progress * 100 : 0}
        displayValue={valueText}
        animateOnMount
        animateDelay={animateDelay}
      />
      <Text style={styles.ringLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.ringSub} numberOfLines={1}>
        {sub}
      </Text>
    </PressableScale>
  );
}

/** Dot colors for each meal slot — matches the meal cards. */
const SLOT_DOT: Record<'breakfast' | 'lunch' | 'dinner', string> = {
  breakfast: '#14b85f',
  lunch: '#2f7ff0',
  dinner: '#9333ea',
};

/**
 * Calendar day ring split into three arcs — breakfast (green), lunch
 * (blue), dinner (purple). Each third lights up only if that meal was
 * scanned that day; the rest stay faint grey. So a day with only
 * breakfast shows one green arc and two grey arcs.
 */
function MealRing({
  slots,
  size = 17,
  selected = false,
}: {
  slots: Set<'breakfast' | 'lunch' | 'dinner'> | undefined;
  size?: number;
  selected?: boolean;
}) {
  const stroke = 2.4;
  const r = (size - stroke) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const GAP = 14; // degrees of gap between arcs
  const SEG = 120 - GAP; // each arc sweep
  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const pt = (deg: number) => ({
    x: cx + r * Math.cos(rad(deg)),
    y: cy + r * Math.sin(rad(deg)),
  });
  const arc = (startDeg: number) => {
    const p1 = pt(startDeg + GAP / 2);
    const p2 = pt(startDeg + GAP / 2 + SEG);
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 0 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  };
  const order: ['breakfast', 'lunch', 'dinner'] = ['breakfast', 'lunch', 'dinner'];
  const idle = selected ? 'rgba(255,255,255,0.35)' : '#e2e5ec';
  return (
    <Svg width={size} height={size}>
      {order.map((slot, i) => {
        const on = slots?.has(slot);
        const color = on ? (selected ? '#ffffff' : SLOT_DOT[slot]) : idle;
        return (
          <Path
            key={slot}
            d={arc(i * 120)}
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            fill="none"
          />
        );
      })}
    </Svg>
  );
}

/**
 * Inline month calendar shown when the "Heute" button is tapped. Lets the
 * user pick a day and shows small dots on days that already have scanned
 * meals (green = breakfast, blue = lunch, purple = dinner).
 */
function CalendarPopup({
  selected,
  onSelect,
  onClose,
  mealsByDay,
  locale,
}: {
  selected: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
  mealsByDay: Record<string, Set<'breakfast' | 'lunch' | 'dinner'>>;
  locale: string;
}) {
  const [viewMonth, setViewMonth] = React.useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1)
  );
  const today = new Date();
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const monthLabel = viewMonth.toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
  // Weekday initials (Mon-first), localized.
  const weekdays = React.useMemo(() => {
    const base = new Date(2024, 0, 1); // a Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(locale, { weekday: 'narrow' });
    });
  }, [locale]);

  // Build the grid: leading blanks (Mon-first) + each day of the month.
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Monday
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));

  const shiftMonth = (delta: number) =>
    setViewMonth(new Date(year, month + delta, 1));

  return (
    <>
      {/* Tap-away backdrop */}
      <Pressable style={styles.calBackdrop} onPress={onClose} />
      <View style={styles.calPopup}>
        {/* Month nav */}
        <View style={styles.calHead}>
          <Pressable onPress={() => shiftMonth(-1)} hitSlop={10} style={styles.calNav}>
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path d="M15 5l-7 7 7 7" stroke="#4b5563" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Svg>
          </Pressable>
          <Text style={styles.calMonth}>{monthLabel}</Text>
          <Pressable onPress={() => shiftMonth(1)} hitSlop={10} style={styles.calNav}>
            <Svg width={18} height={18} viewBox="0 0 24 24">
              <Path d="M9 5l7 7-7 7" stroke="#4b5563" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
            </Svg>
          </Pressable>
        </View>

        {/* Weekday row */}
        <View style={styles.calWeekRow}>
          {weekdays.map((w, i) => (
            <Text key={i} style={styles.calWeekday}>
              {w}
            </Text>
          ))}
        </View>

        {/* Day grid — each day is a vertical pill: ring on top, number below */}
        <View style={styles.calGrid}>
          {cells.map((d, i) => {
            if (!d)
              return (
                <View key={i} style={styles.calCell}>
                  <View style={[styles.calPill, styles.calPillBlank]} />
                </View>
              );
            const isSel = d.toDateString() === selected.toDateString();
            const isToday = d.toDateString() === today.toDateString();
            const isFuture = d > today;
            const slots = mealsByDay[d.toDateString()];
            return (
              <Pressable
                key={i}
                style={styles.calCell}
                disabled={isFuture}
                onPress={() => {
                  onSelect(d);
                  onClose();
                }}
              >
                <View
                  style={[
                    styles.calPill,
                    isSel && styles.calPillSel,
                    !isSel && isToday && styles.calPillToday,
                  ]}
                >
                  {/* Ring split into 3 arcs — each lights up per scanned meal */}
                  <MealRing slots={slots} selected={isSel} />
                  <Text
                    style={[
                      styles.calDayText,
                      isSel && styles.calDayTextSel,
                      !isSel && isToday && styles.calDayTextToday,
                      isFuture && styles.calDayTextMuted,
                    ]}
                  >
                    {d.getDate()}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </View>
    </>
  );
}

export default function HomeScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { onScroll } = useTabBarScroll();
  const {
    glucoseLogs,
    insulinLogs,
    meals,
    activityLogs,
    activityStatus,
    profile,
  } = useAppStore();

  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;

  const todayGlucose = useMemo(
    () =>
      glucoseLogs
        .filter((g) => isToday(g.created_at))
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
    [glucoseLogs]
  );
  const todayMeals = useMemo(
    () => meals.filter((m) => isToday(m.created_at)),
    [meals]
  );
  const todayInsulin = useMemo(
    () => insulinLogs.filter((l) => isToday(l.created_at)),
    [insulinLogs]
  );
  const todayActivities = useMemo(
    () => activityLogs.filter((a) => isToday(a.created_at)),
    [activityLogs]
  );

  const lastGlucose = todayGlucose[todayGlucose.length - 1];
  const totalCarbs = todayMeals.reduce((s, m) => s + m.result.carbohydrates, 0);
  const totalInsulin = todayInsulin.reduce((s, l) => s + l.dose, 0);
  const inRangeCount = todayGlucose.filter(
    (g) => g.value >= low && g.value <= high
  ).length;
  const tir = todayGlucose.length ? inRangeCount / todayGlucose.length : 0;

  const glucoseStatus = lastGlucose
    ? lastGlucose.value < low
      ? { label: t('home.belowRange'), color: '#f97316', bg: '#fef5ee' }
      : lastGlucose.value > high
        ? { label: t('home.aboveRange'), color: '#f97316', bg: '#fef5ee' }
        : { label: t('home.inRange'), color: '#16955f', bg: '#e9fbf2' }
    : null;

  // ── Chart range: 1h (minutes) / day / 7 days ──
  const [range, setRange] = React.useState<'1h' | 'day' | 'week'>('day');

  // Meals section: which day is shown, and whether the calendar popup is open.
  const [selectedDate, setSelectedDate] = React.useState(() => new Date());
  const [calendarOpen, setCalendarOpen] = React.useState(false);

  const chart = useMemo(() => {
    const now = Date.now();
    if (range === '1h') {
      const start = now - 3600 * 1000;
      const pts = glucoseLogs
        .filter((g) => new Date(g.created_at).getTime() >= start)
        .map((g) => ({
          x01: (new Date(g.created_at).getTime() - start) / 3600000,
          value: g.value,
        }));
      // Axis: real clock times every 15 minutes
      const axis = [0, 15, 30, 45, 60].map((m) =>
        new Date(start + m * 60000).toLocaleTimeString('fr-FR', {
          hour: '2-digit',
          minute: '2-digit',
        })
      );
      return { pts, axis };
    }
    if (range === 'week') {
      const start = now - 7 * 24 * 3600 * 1000;
      const pts = glucoseLogs
        .filter((g) => new Date(g.created_at).getTime() >= start)
        .map((g) => ({
          x01: (new Date(g.created_at).getTime() - start) / (7 * 24 * 3600000),
          value: g.value,
        }));
      const axis = [6, 4, 2, 0].map((d) => {
        const dt = new Date(now - d * 24 * 3600 * 1000);
        return dt.toLocaleDateString('fr-FR', { weekday: 'short' });
      });
      return { pts, axis };
    }
    // day (00:00 → 24:00)
    const pts = todayGlucose.map((g) => {
      const d = new Date(g.created_at);
      return { x01: (d.getHours() * 60 + d.getMinutes()) / 1440, value: g.value };
    });
    return { pts, axis: ['00:00', '06:00', '12:00', '18:00', '24:00'] };
  }, [range, glucoseLogs, todayGlucose]);

  // Trend over the selected range (first vs last reading)
  const trend = useMemo(() => {
    if (chart.pts.length < 2) return null;
    const sorted = chart.pts.slice().sort((a, b) => a.x01 - b.x01);
    const delta = Math.round(
      sorted[sorted.length - 1].value - sorted[0].value
    );
    if (Math.abs(delta) < 5) return { label: t('home.trendStable'), color: '#6b7280' };
    return delta > 0
      ? { label: `+${delta} mg/dL`, color: '#19c37d' }
      : { label: `${delta} mg/dL`, color: '#19c37d' };
  }, [chart.pts, t]);

  // Risk gauge for the selected range: the AVERAGE glucose mapped to a
  // 0..1 risk level. 0 = dead-centre of the target range (safest), rising
  // as the mean drifts toward hypo/hyper. Recomputed when the range chip
  // changes, so 1h / day / 7-day each show their own risk.
  const glucoseRisk = useMemo(() => {
    // No readings yet → show an empty bar (0%) rather than hiding it.
    if (chart.pts.length === 0) return { avg: 0, risk: 0 };
    const avg =
      chart.pts.reduce((s, p) => s + p.value, 0) / chart.pts.length;
    const mid = (low + high) / 2;
    // Distance from the mid-target, normalized: reaching ~110 mg/dL away
    // (e.g. mean of 235 with a 70–180 target) counts as full risk.
    const risk = Math.max(0, Math.min(1, Math.abs(avg - mid) / 110));
    return { avg: Math.round(avg), risk };
  }, [chart.pts, low, high]);

  const insight = useMemo(
    () =>
      getDailyInsight(glucoseLogs, insulinLogs, meals, activityLogs, profile, t),
    [glucoseLogs, insulinLogs, meals, activityLogs, profile, t]
  );

  // Meals for the day chosen in the calendar (defaults to today), bucketed
  // into breakfast / lunch / dinner. Each slot keeps the most recent scan.
  const mealSlots = useMemo(() => {
    const slotOf = (h: number): 'breakfast' | 'lunch' | 'dinner' =>
      h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner';
    const dayMeals = meals.filter(
      (m) =>
        new Date(m.created_at).toDateString() === selectedDate.toDateString()
    );
    const bySlot: Record<string, MealScan | undefined> = {};
    for (const m of dayMeals) {
      const s = slotOf(new Date(m.created_at).getHours());
      // keep the latest in each slot
      if (!bySlot[s] || new Date(m.created_at) > new Date(bySlot[s]!.created_at)) {
        bySlot[s] = m;
      }
    }
    return bySlot;
  }, [meals, selectedDate]);

  // Which meal slots exist for any given day — powers the calendar dots.
  const mealsByDay = useMemo(() => {
    const slotOf = (h: number): 'breakfast' | 'lunch' | 'dinner' =>
      h < 11 ? 'breakfast' : h < 16 ? 'lunch' : 'dinner';
    const map: Record<string, Set<'breakfast' | 'lunch' | 'dinner'>> = {};
    for (const m of meals) {
      const d = new Date(m.created_at);
      const key = d.toDateString();
      (map[key] ??= new Set()).add(slotOf(d.getHours()));
    }
    return map;
  }, [meals]);

  // Label for the meals header button: Today / Yesterday / a short date.
  const selectedDateLabel = useMemo(() => {
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (selectedDate.toDateString() === today.toDateString())
      return t('common.today');
    if (selectedDate.toDateString() === yesterday.toDateString())
      return t('notifications.yesterday');
    return selectedDate.toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'short',
    });
  }, [selectedDate, t, i18n.language]);

  const mealDefs = [
    {
      key: 'breakfast' as const,
      label: t('home.mealBreakfast'),
      colors: ['#34d67f', '#14b85f'] as const,
      route: '/nutrition',
    },
    {
      key: 'lunch' as const,
      label: t('home.mealLunch'),
      colors: ['#4f9dff', '#2f7ff0'] as const,
      route: '/nutrition',
    },
    {
      key: 'dinner' as const,
      label: t('home.mealDinner'),
      colors: ['#b06bf5', '#9333ea'] as const,
      route: '/nutrition',
    },
  ];
  // Chronological list for the timeline (only slots that actually have a meal).
  const mealTimeline = mealDefs
    .map((d) => ({ ...d, meal: mealSlots[d.key] }))
    .filter((d) => d.meal)
    .sort(
      (a, b) =>
        new Date(a.meal!.created_at).getTime() -
        new Date(b.meal!.created_at).getTime()
    );

  // AI coach journal: record every new detection (good or bad).
  // The store dedups identical consecutive entries.
  const addAiJournalEntry = useAppStore((s) => s.addAiJournalEntry);
  useEffect(() => {
    addAiJournalEntry({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      icon: insight.icon,
      title: insight.title,
      body: insight.body,
      tone: insight.tone,
      href: insight.href,
      created_at: new Date().toISOString(),
    });
  }, [insight.title, insight.tone, insight.body, insight.icon, insight.href, addAiJournalEntry]);

  // ── Robot notification button: unread count + urgent state ──
  // The robot surfaces EVERYTHING new: coach detections (AI journal) that
  // arrived since the user last opened the screen, plus smart reminders
  // whose time has already come today.
  const aiJournal = useAppStore((s) => s.aiJournal);
  const aiJournalSeenAt = useAppStore((s) => s.aiJournalSeenAt);
  const unreadCount = useMemo(() => {
    const seen = aiJournalSeenAt ? new Date(aiJournalSeenAt).getTime() : 0;
    const newEntries = aiJournalSeenAt
      ? aiJournal.filter((e) => new Date(e.created_at).getTime() > seen).length
      : aiJournal.length;
    // Reminders due today whose time also passed AFTER the last visit — so
    // opening the screen clears them too (badge doesn't linger).
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const startOfToday = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    ).getTime();
    const dueReminders = getPlannedReminders().filter((r) => {
      const dueAt = startOfToday + (r.hour * 60 + r.minute) * 60000;
      return r.hour * 60 + r.minute <= nowMin && dueAt > seen;
    }).length;
    return newEntries + dueReminders;
    // Recompute as data changes so the badge stays live.
  }, [aiJournal, aiJournalSeenAt, glucoseLogs, insulinLogs, meals]);
  // Urgent = today's coach reading is a hypo/hyper (danger/warning) — the
  // robot turns worried/red and its badge glows.
  const isUrgent = insight.tone === 'danger' || insight.tone === 'warning';

  // Timeline (max 2 rows like the design, then "Voir tout l'historique")
  const timeline = useMemo(() => {
    const mealLabel = (h: number) =>
      h < 11
        ? t('home.mealBreakfast')
        : h < 15
          ? t('home.mealLunch')
          : h < 19
            ? t('home.mealSnack')
            : t('home.mealDinner');
    const intensityLabel = (i: string) =>
      i === 'high'
        ? t('home.intensityHigh')
        : i === 'low'
          ? t('home.intensityLow')
          : t('home.intensityModerate');
    const items: {
      id: string;
      time: string;
      icon: 'act' | 'meal' | 'insulin' | 'glucose';
      title: string;
      detail: string;
      dot: string;
    }[] = [
      ...todayActivities.map((a) => ({
        id: `a-${a.id}`,
        time: a.created_at,
        icon: 'act' as const,
        title: t('home.tlActivity'),
        detail: t('home.activityDetail', {
          min: a.duration_min,
          intensity: intensityLabel(a.intensity),
        }),
        dot: '#19c37d',
      })),
      ...todayMeals.map((m) => ({
        id: `m-${m.id}`,
        time: m.created_at,
        icon: 'meal' as const,
        title: t('home.tlMeal'),
        detail: t('home.mealDetail', {
          meal: mealLabel(new Date(m.created_at).getHours()),
          carbs: Math.round(m.result.carbohydrates),
        }),
        dot: '#d3d6e2',
      })),
      ...todayInsulin.map((l) => ({
        id: `i-${l.id}`,
        time: l.created_at,
        icon: 'insulin' as const,
        title: t('home.tlInsulin'),
        detail: t('home.insulinDetail', {
          dose: l.dose,
          type: t(TYPE_KEY[l.insulin_type]),
        }),
        dot: '#7c6cf6',
      })),
      ...todayGlucose.map((g) => ({
        id: `g-${g.id}`,
        time: g.created_at,
        icon: 'glucose' as const,
        title: t('home.tlGlucose'),
        detail: `${g.value} mg/dL`,
        dot:
          g.value < low || g.value > high ? '#f97316' : '#19c37d',
      })),
    ];
    return items.sort(
      (a, b) => new Date(b.time).getTime() - new Date(a.time).getTime()
    );
  }, [todayActivities, todayMeals, todayInsulin, todayGlucose, low, high, t]);

  const firstName = profile?.name ? profile.name.split(' ')[0] : null;

  return (
    <View style={styles.root}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        scrollEventThrottle={16}
        onScroll={onScroll}
        contentContainerStyle={{
          paddingTop: insets.top + 16,
          paddingHorizontal: 26,
          paddingBottom: 140,
        }}
      >
        {/* ── Greeting ── */}
        <View style={styles.greetingRow}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.greeting} numberOfLines={1}>
              {firstName
                ? t('home.greetingName', { name: firstName })
                : t('home.greeting')}{' '}
              <Text style={{ fontSize: 24 }}>👋</Text>
            </Text>
            <Text style={styles.greetingSub}>{t('home.greetingSub')}</Text>
          </View>
          <PressableScale
            onPress={() => router.push('/ai-journal' as any)}
            accessibilityLabel={t('notifications.open', {
              count: unreadCount,
            })}
            style={styles.robotBtn}
          >
            <AnimatedRobot size={54} mood={isUrgent ? 'alert' : 'happy'} />
            {unreadCount > 0 ? (
              <View
                style={[
                  styles.robotBadge,
                  isUrgent && styles.robotBadgeUrgent,
                ]}
              >
                <Text style={styles.robotBadgeText}>
                  {unreadCount > 9 ? '9+' : unreadCount}
                </Text>
              </View>
            ) : null}
          </PressableScale>
        </View>

        {/* ── Statut / Bolus row ── */}
        <View style={styles.chipRow}>
          <PressableScale
            containerStyle={styles.chipWrap}
            style={styles.chipCard}
            onPress={() => router.push('/activity-status')}
            accessibilityLabel={t('home.statut')}
          >
            <Image source={CIRC_ACTIVITY} style={{ width: 38, height: 38 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.chipTitle}>{t('home.statut')}</Text>
              <Text style={styles.chipStatus}>
                {t(STATUS_KEY[activityStatus])}
              </Text>
            </View>
            <ChevDown />
          </PressableScale>
          <PressableScale
            containerStyle={styles.chipWrap}
            style={styles.chipCard}
            onPress={() => router.push('/bolus')}
            accessibilityLabel={t('home.bolus')}
          >
            <Image source={CIRC_BOLUS} style={{ width: 38, height: 38 }} />
            <View style={{ flex: 1 }}>
              <Text style={styles.chipTitle}>{t('home.bolus')}</Text>
              <Text style={styles.chipSub} numberOfLines={1}>
                {t('home.bolusQuick')}
              </Text>
            </View>
            <ArrowRight />
          </PressableScale>
        </View>

        {/* ── Alert banner ── */}
        {todayGlucose.length === 0 ? (
          <Pressable
            style={styles.alert}
            onPress={() => router.push('/log-glucose')}
          >
            <View style={styles.alertDot}>
              <Text style={styles.alertBang}>!</Text>
            </View>
            <Text style={styles.alertText} numberOfLines={1}>
              {t('home.noGlucoseToday')}
            </Text>
            <ArrowRight color="#f97316" />
          </Pressable>
        ) : null}

        {/* ── Glycémie card ── */}
        <Pressable
          style={styles.glyCard}
          onPress={() => router.push('/glucose')}
        >
          <View style={styles.glyHead}>
            <View style={styles.glyTitleRow}>
              <View style={styles.glyPurpleDot} />
              <Text style={styles.glyTitle}>{t('home.glycemia')}</Text>
            </View>
            <View
              style={[
                styles.glyBadge,
                glucoseStatus
                  ? { backgroundColor: glucoseStatus.bg }
                  : null,
              ]}
            >
              <Text
                style={[
                  styles.glyBadgeText,
                  glucoseStatus ? { color: glucoseStatus.color } : null,
                ]}
              >
                {glucoseStatus ? glucoseStatus.label : t('home.noMeasure')}
              </Text>
            </View>
          </View>

          {/* Range selector + trend */}
          <View style={styles.glyRangeRow}>
            {(
              [
                { key: '1h', label: t('home.rangeHour') },
                { key: 'day', label: t('home.rangeDay') },
                { key: 'week', label: t('home.rangeWeek') },
              ] as const
            ).map((r) => (
              <Pressable
                key={r.key}
                onPress={() => setRange(r.key)}
                style={[
                  styles.glyRangeChip,
                  range === r.key && styles.glyRangeChipOn,
                ]}
                hitSlop={4}
              >
                <Text
                  style={[
                    styles.glyRangeText,
                    range === r.key && styles.glyRangeTextOn,
                  ]}
                >
                  {r.label}
                </Text>
              </Pressable>
            ))}
            {trend ? (
              <Text style={[styles.glyTrend, { color: trend.color }]}>
                {trend.label}
              </Text>
            ) : null}
          </View>

          <View style={styles.glyBody}>
            <View style={styles.glyLeft}>
              {lastGlucose ? (
                <>
                  <Text style={styles.glyValue}>{lastGlucose.value}</Text>
                  <Text style={styles.glyUnit}>mg/dL</Text>
                </>
              ) : (
                <>
                  <View style={styles.glyUnitRow}>
                    <View style={styles.glyDash} />
                    <Text style={styles.glyUnit}>mg/dL</Text>
                  </View>
                  <Text style={styles.glyEmptyText}>
                    {t('home.noMeasureToday')}
                  </Text>
                </>
              )}
            </View>
            {chart.pts.length > 0 ? (
              <GlucoseChart
                points={chart.pts}
                axis={chart.axis}
                low={low}
                high={high}
              />
            ) : todayGlucose.length === 0 && range === 'day' ? (
              <Image source={CHART_EMPTY} style={styles.glyChartImg} resizeMode="contain" />
            ) : (
              <View style={styles.glyNoData}>
                <Text style={styles.glyNoDataText}>
                  {t('home.noMeasurePeriod')}
                </Text>
              </View>
            )}
          </View>

          {/* Risk meter for the selected range's average glucose */}
          {glucoseRisk ? (
            <RiskBar
              risk={glucoseRisk.risk}
              avg={glucoseRisk.avg}
              label={t('home.riskLabel')}
            />
          ) : null}

          <Pressable
            style={styles.glyAddBtn}
            onPress={() => router.push('/log-glucose')}
          >
            <Svg width={13} height={13} viewBox="0 0 24 24">
              <Path d="M12 5v14M5 12h14" stroke="#17a56d" strokeWidth={2.6} strokeLinecap="round" fill="none" />
            </Svg>
            <Text style={styles.glyAddText}>{t('home.addMeasure')}</Text>
          </Pressable>
        </Pressable>

        {/* ── Rings row (3 separate cards) ── */}
        <View style={styles.ringsRow}>
          <RingCard
            progress={tir}
            valueText={todayGlucose.length ? `${Math.round(tir * 100)}` : '0'}
            hasData={todayGlucose.length > 0}
            label={t('home.ringTarget')}
            sub={
              todayGlucose.length
                ? `${inRangeCount} / ${todayGlucose.length}`
                : '– / –'
            }
            onPress={() => router.push('/glucose')}
            animateDelay={0}
          />
          <RingCard
            progress={Math.min(1, totalCarbs / CARB_GOAL)}
            valueText={`${Math.round(totalCarbs)}`}
            hasData={totalCarbs > 0}
            label={t('home.ringCarbs')}
            sub={`${Math.round(totalCarbs)}g / ${CARB_GOAL}g`}
            onPress={() => router.push('/nutrition')}
            animateDelay={140}
          />
          <RingCard
            progress={Math.min(1, totalInsulin / 40)}
            valueText={`${totalInsulin}`}
            hasData={totalInsulin > 0}
            label={t('home.ringInsulin')}
            sub={`${totalInsulin}U`}
            onPress={() => router.push('/insulin')}
            animateDelay={280}
          />
        </View>

        {/* ── Scanner card ── */}
        <FadeInView delay={80}>
          <PressableScale
            onPress={() => router.push('/scan')}
            accessibilityLabel={t('home.scanTitle')}
          >
            <LinearGradient
              colors={['#e0d5fc', '#ece8fe', '#f3f2fd']}
              locations={[0, 0.55, 1]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0.85 }}
              style={styles.scanCard}
            >
              <Image source={SPARK_STAR} style={styles.scanSpark} />
              <View style={styles.scanLeft}>
                <View style={styles.scanTitleRow}>
                  <Text style={styles.scanTitle}>{t('home.scanTitle')}</Text>
                  <View style={styles.scanIaBadge}>
                    <Text style={styles.scanIaText}>IA</Text>
                  </View>
                </View>
                <Text style={styles.scanDesc}>{t('home.scanDesc')}</Text>
                <View style={styles.scanChips}>
                  <View style={styles.scanChip}>
                    <Svg width={10} height={10} viewBox="0 0 24 24">
                      <Path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="#7c5cfa" />
                    </Svg>
                    <Text style={styles.scanChipText}>{t('home.chipFast')}</Text>
                  </View>
                  <View style={styles.scanChip}>
                    <Svg width={10} height={10} viewBox="0 0 24 24">
                      <Circle cx={12} cy={12} r={7} stroke="#3f3a5e" strokeWidth={2.4} fill="none" />
                      <Path d="M12 2v3M12 19v3M2 12h3M19 12h3" stroke="#3f3a5e" strokeWidth={2.4} strokeLinecap="round" />
                    </Svg>
                    <Text style={styles.scanChipText}>{t('home.chipPrecise')}</Text>
                  </View>
                  <View style={styles.scanChip}>
                    <Image source={CHIP_BRAIN} style={{ width: 12, height: 12 }} />
                    <Text style={styles.scanChipText}>{t('home.chipSmart')}</Text>
                  </View>
                </View>
                <LinearGradient
                  colors={['#965ffc', '#8a4afd']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.scanCta}
                >
                  <Svg width={13} height={13} viewBox="0 0 24 24">
                    <Path
                      d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"
                      stroke="#fff"
                      strokeWidth={2.2}
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <Circle cx={12} cy={13} r={4} stroke="#fff" strokeWidth={2.2} fill="none" />
                  </Svg>
                  <Text style={styles.scanCtaText}>{t('home.scanNow')}</Text>
                  <ArrowRight size={12} color="#fff" />
                </LinearGradient>
              </View>
              <Image source={SCAN_IMG} style={styles.scanImg} resizeMode="contain" />
            </LinearGradient>
          </PressableScale>
        </FadeInView>

        {/* ── Deine Mahlzeiten (breakfast / lunch / dinner) ── */}
        <View style={styles.mealsHead}>
          <Text style={styles.mealsTitle}>{t('home.mealsTitle')}</Text>
          <View>
            <Pressable
              style={styles.mealsToday}
              onPress={() => setCalendarOpen((v) => !v)}
              hitSlop={8}
            >
              <Text style={styles.mealsTodayText}>{selectedDateLabel}</Text>
              <ChevDown size={13} color="#6b7688" />
            </Pressable>
            {calendarOpen ? (
              <CalendarPopup
                selected={selectedDate}
                onSelect={setSelectedDate}
                onClose={() => setCalendarOpen(false)}
                mealsByDay={mealsByDay}
                locale={i18n.language}
              />
            ) : null}
          </View>
        </View>
        <View style={styles.mealsRow}>
          {mealDefs.map((d) => {
            const meal = mealSlots[d.key];
            return (
              <PressableScale
                key={d.key}
                containerStyle={styles.mealCardWrap}
                style={styles.mealCard}
                onPress={() => router.push(d.route as any)}
                accessibilityLabel={d.label}
              >
                <View style={styles.mealCardHead}>
                  <LinearGradient
                    colors={[...d.colors]}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={styles.mealIcon}
                  >
                    <MealSlotIcon slot={d.key} />
                  </LinearGradient>
                  <Text style={styles.mealTime}>
                    {meal
                      ? new Date(meal.created_at).toLocaleTimeString(
                          i18n.language,
                          { hour: '2-digit', minute: '2-digit' }
                        )
                      : '––:––'}
                  </Text>
                </View>
                <Text style={styles.mealName} numberOfLines={1}>
                  {d.label}
                </Text>
                {meal?.image_url ? (
                  <Image
                    source={{ uri: meal.image_url }}
                    style={styles.mealPhoto}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.mealPhoto, styles.mealPhotoEmpty]}>
                    <MealSlotIcon slot={d.key} muted />
                  </View>
                )}
                <View style={styles.mealFoot}>
                  <Text style={styles.mealKcal}>
                    {meal ? Math.round(meal.result.calories) : '––'}{' '}
                    <Text style={styles.mealKcalUnit}>kcal</Text>
                  </Text>
                  <ChevRight size={13} color="#c2c9d4" />
                </View>
              </PressableScale>
            );
          })}
        </View>

        {/* ── Chronik (meal timeline) ── */}
        {mealTimeline.length > 0 ? (
          <>
            <Text style={styles.chronTitle}>{t('home.chronik')}</Text>
            <View style={styles.chronCard}>
              {mealTimeline.map((d, i) => (
                <React.Fragment key={d.key}>
                  {i > 0 ? <View style={styles.chronLine} /> : null}
                  <View style={styles.chronNode}>
                    <LinearGradient
                      colors={[...d.colors]}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.chronDot}
                    >
                      <MealSlotIcon slot={d.key} size={16} />
                    </LinearGradient>
                    <Text style={styles.chronTime}>
                      {new Date(d.meal!.created_at).toLocaleTimeString(
                        i18n.language,
                        { hour: '2-digit', minute: '2-digit' }
                      )}
                    </Text>
                    <Text style={styles.chronLabel}>{d.label}</Text>
                    <Text style={styles.chronKcal}>
                      {Math.round(d.meal!.result.calories)} kcal
                    </Text>
                  </View>
                </React.Fragment>
              ))}
              <View style={styles.chronLine} />
              <Pressable
                style={styles.chronCta}
                onPress={() => router.push('/nutrition' as any)}
              >
                <Text style={styles.chronCtaText}>{t('home.viewFullHistory')}</Text>
              </Pressable>
            </View>
          </>
        ) : null}

        {/* ── Assistant card: tap = coach journal, CTA = direct action ── */}
        <AssistantCard
          insight={insight}
          onPress={() => router.push('/ai-journal' as any)}
          onAction={
            insight.href
              ? () => router.push(insight.href as any)
              : undefined
          }
        />

        {/* ── Injections row ── */}
        <PressableScale
          style={styles.injRow}
          onPress={() => router.push('/insulin')}
          accessibilityLabel={t('home.injections')}
        >
          <Image source={SYRINGE} style={{ width: 30, height: 30 }} />
          <Text style={styles.injLabel}>{t('home.injections')}</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.injTitle} numberOfLines={1}>
              {todayInsulin.length === 0
                ? t('home.noInjectionToday')
                : t('home.injectionSummary', {
                    units: totalInsulin,
                    count: todayInsulin.length,
                    plural: todayInsulin.length > 1 ? 's' : '',
                  })}
            </Text>
            <Text style={styles.injSub} numberOfLines={1}>
              {t('home.injectionSub')}
            </Text>
          </View>
          <ArrowRight size={14} />
        </PressableScale>

        {/* ── Chronologie ── */}
        <Text style={styles.tlHeader}>{t('home.timeline')}</Text>
        <View style={styles.tlCard}>
          {timeline.length === 0 ? (
            <View style={styles.tlEmpty}>
              <Text style={styles.tlEmptyText}>
                {t('home.timelineEmpty')}
              </Text>
            </View>
          ) : (
            timeline.slice(0, 2).map((item) => (
              <View key={item.id} style={styles.tlRow}>
                {item.icon === 'act' ? (
                  <Image source={TL_ACT} style={{ width: 24, height: 24 }} />
                ) : item.icon === 'meal' ? (
                  <Image source={TL_MEAL} style={{ width: 24, height: 24 }} />
                ) : item.icon === 'insulin' ? (
                  <Image source={SYRINGE} style={{ width: 24, height: 24 }} />
                ) : (
                  <View style={styles.tlGlucoseIcon}>
                    <View
                      style={[styles.tlGlucoseDot, { backgroundColor: item.dot }]}
                    />
                  </View>
                )}
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.tlTitle}>{item.title}</Text>
                  <View style={styles.tlDetailRow}>
                    <Text style={styles.tlDetail} numberOfLines={1}>
                      {item.detail}
                    </Text>
                    <View style={[styles.tlDot, { backgroundColor: item.dot }]} />
                  </View>
                </View>
                <Text style={styles.tlTime}>
                  {new Date(item.time).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
              </View>
            ))
          )}
          <Pressable
            style={styles.tlMore}
            onPress={() => router.push('/journal' as any)}
          >
            <Text style={styles.tlMoreText}>{t('home.seeAllHistory')}</Text>
            <ChevDown size={11} color="#7c6cf6" />
          </Pressable>
        </View>
      </ScrollView>
    </View>
  );
}

const CARD_SHADOW = {
  shadowColor: 'rgba(80,80,140,1)',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.05,
  shadowRadius: 8,
  elevation: 2,
} as const;

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe' },

  /* Greeting */
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 14,
  },
  greeting: {
    fontFamily: F800,
    fontSize: 27,
    letterSpacing: -0.3,
    color: '#111827',
  },
  greetingSub: {
    fontFamily: F500,
    fontSize: 14.5,
    color: '#6b7280',
    marginTop: 3,
  },
  robotBtn: {
    width: 58,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
  },
  robotBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: '#ef4444',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#f9fafe',
    shadowColor: '#ef4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
  },
  robotBadgeUrgent: {
    backgroundColor: '#dc2626',
  },
  robotBadgeText: {
    fontFamily: F800,
    fontSize: 11,
    color: '#ffffff',
    lineHeight: 14,
  },

  /* Statut / Bolus chips */
  chipRow: { flexDirection: 'row', gap: 10 },
  chipWrap: { flex: 1, minWidth: 0 },
  chipCard: {
    height: 54,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    paddingHorizontal: 12,
    ...CARD_SHADOW,
  },
  chipTitle: { fontFamily: F700, fontSize: 13.5, color: '#111827' },
  chipStatus: { fontFamily: F700, fontSize: 12.5, color: '#19c37d', marginTop: 1 },
  chipSub: { fontFamily: F500, fontSize: 11, color: '#6b7280', marginTop: 1 },

  /* Alert */
  alert: {
    marginTop: 9,
    height: 43,
    borderRadius: 14,
    backgroundColor: '#fef5ee',
    borderWidth: 1,
    borderColor: 'rgba(255,122,26,0.28)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingHorizontal: 14,
  },
  alertDot: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#f97316',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBang: { fontFamily: F800, fontSize: 15, color: '#ffffff' },
  alertText: { flex: 1, fontFamily: F700, fontSize: 12.5, color: '#ee7011' },

  /* Glycémie card */
  glyCard: {
    marginTop: 9,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 15,
    ...CARD_SHADOW,
  },
  glyHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  glyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  glyPurpleDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
    backgroundColor: '#19c37d',
  },
  glyTitle: {
    fontFamily: F800,
    fontSize: 16.5,
    letterSpacing: -0.2,
    color: '#111827',
  },
  glyBadge: {
    backgroundColor: '#f1f2f8',
    borderRadius: 13,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  glyBadgeText: { fontFamily: F600, fontSize: 11.5, color: '#6b7280' },
  glyBody: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    minHeight: 98,
  },
  glyLeft: { width: 116 },
  glyValue: {
    fontFamily: F800,
    fontSize: 34,
    letterSpacing: -0.5,
    color: '#111827',
  },
  glyUnitRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  glyDash: {
    width: 30,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#111827',
  },
  glyUnit: { fontFamily: F600, fontSize: 12.5, color: '#6b7280' },
  glyEmptyText: {
    fontFamily: F600,
    fontSize: 13.5,
    color: '#6b7280',
    lineHeight: 19.5,
    marginTop: 10,
  },
  glyChart: { flex: 1 },
  glyChartImg: { flex: 1, height: 98 },
  glyChartRow: { flexDirection: 'row', height: 78 },
  glyScale: {
    justifyContent: 'space-between',
    paddingRight: 6,
    paddingBottom: 1,
  },
  glyScaleText: {
    fontFamily: F600,
    fontSize: 8.5,
    color: '#9CA3AF',
    fontVariant: ['tabular-nums'],
  },
  glyBars: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-evenly',
    gap: 3,
  },
  glyGridline: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: '#eef0f5',
  },
  glyBarSlot: {
    flex: 1,
    maxWidth: 14,
    alignItems: 'center',
    justifyContent: 'flex-end',
    height: '100%',
  },
  glyBar: {
    width: '100%',
    borderRadius: 4,
  },
  glyAxis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 5,
    paddingRight: 2,
  },
  glyAxisText: { fontFamily: F600, fontSize: 9.5, color: '#9CA3AF' },
  glyRangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
  },
  glyRangeChip: {
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    backgroundColor: '#f1f2f8',
  },
  glyRangeChipOn: { backgroundColor: '#19c37d' },
  glyRangeText: { fontFamily: F700, fontSize: 11, color: '#6b7280' },
  glyRangeTextOn: { color: '#ffffff' },
  glyTrend: {
    fontFamily: F800,
    fontSize: 12,
    marginLeft: 'auto',
  },
  glyNoData: {
    flex: 1,
    height: 78,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyNoDataText: { fontFamily: F600, fontSize: 11.5, color: '#9CA3AF' },
  glyAddBtn: {
    marginTop: 10,
    height: 32,
    backgroundColor: '#e8f8f0',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 9,
  },
  glyAddText: { fontFamily: F700, fontSize: 13, color: '#17a56d' },

  /* Risk meter bar */
  riskBar: {
    marginTop: 12,
    height: 44,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#f0f1f6',
  },
  riskTicks: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    height: 22,
  },
  riskTick: {
    flex: 1,
    height: '100%',
    borderRadius: 1.5,
  },
  riskPct: {
    fontFamily: F800,
    fontSize: 15,
    minWidth: 34,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },

  /* Rings */
  ringsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  ringCardWrap: { flex: 1, minWidth: 0 },
  ringCard: {
    backgroundColor: '#ffffff',
    borderRadius: 28,
    alignItems: 'center',
    paddingTop: 8,
    paddingBottom: 16,
    paddingHorizontal: 2,
    ...CARD_SHADOW,
  },
  ringLabel: {
    fontFamily: F800,
    fontSize: 13.5,
    color: '#111827',
    marginTop: 8,
  },
  ringSub: {
    fontFamily: F600,
    fontSize: 11,
    color: '#8b93a7',
    marginTop: 3,
  },

  /* Scanner card */
  scanCard: {
    marginTop: 12,
    borderRadius: 20,
    minHeight: 145,
    flexDirection: 'row',
    overflow: 'hidden',
    shadowColor: 'rgba(120,90,240,1)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.13,
    shadowRadius: 18,
    elevation: 5,
  },
  scanSpark: { position: 'absolute', left: 4, top: 8, width: 18, height: 18 },
  scanLeft: { flex: 1, minWidth: 0, paddingLeft: 22, paddingTop: 12, paddingBottom: 14 },
  scanTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  scanTitle: {
    fontFamily: F800,
    fontSize: 19,
    letterSpacing: -0.2,
    color: '#111827',
  },
  scanIaBadge: {
    width: 21,
    height: 21,
    borderRadius: 11,
    backgroundColor: '#19c37d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanIaText: { fontFamily: F800, fontSize: 8.5, color: '#ffffff' },
  scanDesc: {
    fontFamily: F500,
    fontSize: 12,
    color: '#565672',
    lineHeight: 16,
    width: 180,
    marginTop: 6,
  },
  scanChips: { flexDirection: 'row', gap: 5, marginTop: 11 },
  scanChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255,255,255,0.6)',
    borderRadius: 11,
    height: 22,
    paddingHorizontal: 7,
  },
  scanChipText: { fontFamily: F700, fontSize: 10, color: '#3f3a5e' },
  scanCta: {
    marginTop: 8,
    width: 186,
    height: 31,
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginLeft: 19,
    shadowColor: 'rgba(120,70,250,1)',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  scanCtaText: { fontFamily: F700, fontSize: 12, color: '#ffffff' },
  scanImg: { width: 123, height: 112, marginTop: 6, marginRight: 4 },

  /* Deine Mahlzeiten */
  mealsHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 10,
    marginLeft: 2,
    zIndex: 20,
  },

  /* Calendar popup */
  calBackdrop: {
    position: 'absolute',
    top: -1000,
    left: -1000,
    right: -1000,
    bottom: -1000,
  },
  calPopup: {
    position: 'absolute',
    top: 26,
    right: 0,
    width: 300,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 12,
    shadowColor: 'rgba(30,40,70,1)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.18,
    shadowRadius: 28,
    elevation: 12,
    zIndex: 30,
  },
  calHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calNav: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f3f4f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calMonth: {
    fontFamily: F800,
    fontSize: 14.5,
    color: '#111827',
    textTransform: 'capitalize',
  },
  calWeekRow: { flexDirection: 'row', marginBottom: 4 },
  calWeekday: {
    flex: 1,
    textAlign: 'center',
    fontFamily: F700,
    fontSize: 10.5,
    color: '#9aa3b2',
    textTransform: 'uppercase',
  },
  calGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  calCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
    paddingVertical: 3,
  },
  // Vertical pill: soft border, ring on top, number below.
  calPill: {
    width: 34,
    paddingVertical: 6,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#eef0f4',
    alignItems: 'center',
    gap: 3,
  },
  calPillBlank: {
    backgroundColor: '#f4f5f8',
    borderColor: 'transparent',
    height: 52,
  },
  calPillSel: { backgroundColor: '#19c37d', borderColor: '#19c37d' },
  calPillToday: { borderColor: '#bfe6d4' },
  calDayText: { fontFamily: F700, fontSize: 12.5, color: '#374151' },
  calDayTextToday: { color: '#2f7ff0' },
  calDayTextSel: { color: '#ffffff' },
  calDayTextMuted: { color: '#cbd2dc' },
  mealsTitle: {
    fontFamily: F800,
    fontSize: 16.5,
    letterSpacing: -0.3,
    color: '#111827',
  },
  mealsToday: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  mealsTodayText: { fontFamily: F700, fontSize: 12.5, color: '#6b7688' },
  mealsRow: { flexDirection: 'row', gap: 10 },
  mealCardWrap: { flex: 1, minWidth: 0 },
  mealCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#edf0f4',
    padding: 10,
    gap: 9,
    ...CARD_SHADOW,
  },
  mealCardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mealIcon: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealTime: { fontFamily: F700, fontSize: 10.5, color: '#9aa3b2' },
  mealName: { fontFamily: F700, fontSize: 12.5, color: '#1e2430' },
  mealPhoto: {
    width: '100%',
    height: 66,
    borderRadius: 12,
    backgroundColor: '#f1f3f7',
  },
  mealPhotoEmpty: { alignItems: 'center', justifyContent: 'center' },
  mealFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  mealKcal: { fontFamily: F800, fontSize: 13.5, color: '#1e2430' },
  mealKcalUnit: { fontFamily: F600, fontSize: 10, color: '#9aa3b2' },

  /* Chronik timeline */
  chronTitle: {
    fontFamily: F800,
    fontSize: 16.5,
    letterSpacing: -0.3,
    color: '#111827',
    marginTop: 18,
    marginBottom: 10,
    marginLeft: 2,
  },
  chronCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#edf0f4',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    ...CARD_SHADOW,
  },
  chronNode: { alignItems: 'flex-start', gap: 6 },
  chronDot: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chronTime: { fontFamily: F800, fontSize: 12.5, color: '#1e2430', marginTop: 2 },
  chronLabel: { fontFamily: F700, fontSize: 11, color: '#6b7688' },
  chronKcal: { fontFamily: F600, fontSize: 10, color: '#9aa3b2' },
  chronLine: {
    flex: 1,
    height: 2,
    borderRadius: 1,
    backgroundColor: '#e6eaf0',
    marginTop: 16,
    marginHorizontal: 8,
  },
  chronCta: {
    backgroundColor: '#e9fbf1',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 4,
  },
  chronCtaText: { fontFamily: F700, fontSize: 11.5, color: '#12a355' },

  /* Assistant card */
  aiWrap: { marginTop: 7, position: 'relative' },
  aiGlow: {
    position: 'absolute',
    top: -4,
    left: -4,
    right: -4,
    bottom: -4,
    borderRadius: 22,
  },
  aiCard: {
    borderRadius: 18,
    minHeight: 83,
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 12,
    paddingRight: 12,
    paddingVertical: 10,
    ...CARD_SHADOW,
  },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  aiKicker: {
    fontFamily: F800,
    fontSize: 9.5,
    letterSpacing: 0.9,
  },
  aiDot: { width: 6, height: 6, borderRadius: 3 },
  aiTitle: {
    fontFamily: F800,
    fontSize: 14.5,
    marginTop: 3,
    marginLeft: 4,
  },
  aiBody: {
    fontFamily: F500,
    fontSize: 10.5,
    color: '#4b5563',
    lineHeight: 13.5,
    marginTop: 2,
    marginLeft: 4,
    maxWidth: 245,
  },
  aiCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 5,
    paddingHorizontal: 12,
    marginTop: 7,
    marginLeft: 4,
  },
  aiCtaText: { fontFamily: F700, fontSize: 10.5, color: '#ffffff' },
  aiRobotWrap: {
    width: 90,
    height: 87,
    marginLeft: -14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiRobotHalo: {
    position: 'absolute',
    width: 74,
    height: 74,
    borderRadius: 37,
  },
  aiRobot: { width: 90, height: 87 },

  /* Injections */
  injRow: {
    marginTop: 11,
    height: 48,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    gap: 8,
    ...CARD_SHADOW,
  },
  injLabel: { fontFamily: F700, fontSize: 13, color: '#111827', width: 70 },
  injTitle: { fontFamily: F700, fontSize: 12.5, color: '#111827' },
  injSub: { fontFamily: F500, fontSize: 10.5, color: '#6b7280', marginTop: 1 },

  /* Chronologie */
  tlHeader: {
    fontFamily: F800,
    fontSize: 15.5,
    letterSpacing: -0.2,
    color: '#111827',
    marginTop: 14,
    marginLeft: 4,
  },
  tlCard: {
    marginTop: 8,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 6,
    paddingBottom: 8,
    ...CARD_SHADOW,
  },
  tlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 4,
    minHeight: 28,
  },
  tlGlucoseIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#f3f0ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tlGlucoseDot: { width: 8, height: 8, borderRadius: 4 },
  tlTitle: { fontFamily: F700, fontSize: 11.5, color: '#111827' },
  tlDetailRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  tlDetail: { fontFamily: F500, fontSize: 10.5, color: '#6b7280' },
  tlDot: { width: 5, height: 5, borderRadius: 2.5 },
  tlTime: { fontFamily: F600, fontSize: 11, color: '#6b7280' },
  tlEmpty: { paddingVertical: 12 },
  tlEmptyText: {
    fontFamily: F500,
    fontSize: 11.5,
    color: '#6b7280',
    textAlign: 'center',
  },
  tlMore: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  tlMoreText: { fontFamily: F700, fontSize: 11.5, color: '#7c6cf6' },
});
