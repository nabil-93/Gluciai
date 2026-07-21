import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

import { AnimatedRobot, ChevronLeft, FadeInView, Spinner } from '@/components/ui';
import { nowMs } from '@/lib/clock';
import { sendChatMessage } from '@/services/ai';
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
  valueText,
  unitLabel,
  lowLabel,
  highLabel,
  frac,
  zone,
  zoneLabel,
  emptyText,
}: {
  value: number | null;
  valueText: string;
  unitLabel: string;
  lowLabel: string;
  highLabel: string;
  frac: number;
  zone: GlyZone | null;
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
    <View style={{ width: S, height: 150 }}>
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

      {/* Upper block: unit + value */}
      <View style={styles.gaugeTop}>
        <View style={styles.gaugeUnitRow}>
          <Text style={{ fontSize: 11 }}>🩸</Text>
          <Text style={styles.gaugeUnit}>{unitLabel}</Text>
        </View>
        <Text style={value != null ? styles.gaugeValue : styles.gaugeDash}>
          {value != null ? valueText : '—'}
        </Text>
      </View>

      {/* Lower block: status pill / empty text, dropped into the bottom gap */}
      <View style={styles.gaugeStatus} pointerEvents="none">
        {value != null && zone ? (
          <View style={[styles.gaugePill, { backgroundColor: zone.pale }]}>
            <Text style={[styles.gaugePillText, { color: zone.color }]}>{zoneLabel}</Text>
          </View>
        ) : value == null ? (
          <Text style={styles.gaugeEmpty}>{emptyText}</Text>
        ) : null}
      </View>

      <Text style={[styles.gaugeEnd, { left: 8 }]}>{lowLabel}</Text>
      <Text style={[styles.gaugeEnd, { right: 8 }]}>{highLabel}</Text>
      <View style={styles.gaugePointer} />
    </View>
  );
}

/** A card that springs slightly on press — tactile feedback before a sheet
 *  scales open from it. */
function PressableScale({
  children,
  onPress,
  style,
}: {
  children: React.ReactNode;
  onPress: () => void;
  style?: any;
}) {
  const scale = useRef(new Animated.Value(1)).current;
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() =>
        Animated.spring(scale, { toValue: 0.965, useNativeDriver: true, speed: 40, bounciness: 0 }).start()
      }
      onPressOut={() =>
        Animated.spring(scale, { toValue: 1, useNativeDriver: true, speed: 28, bounciness: 8 }).start()
      }
    >
      <Animated.View style={[style, { transform: [{ scale }] }]}>{children}</Animated.View>
    </Pressable>
  );
}

/** In-page sheet that grows from small→full in the centre (and shrinks back
 *  on close), per the requested "card zooms to the middle" feel. Returns null
 *  while closed, so its children mount fresh each open (new chat every time). */
function SheetShell({
  visible,
  onClose,
  title,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (visible) {
      anim.setValue(0);
      Animated.spring(anim, { toValue: 1, useNativeDriver: true, speed: 16, bounciness: 6 }).start();
    }
  }, [visible, anim]);
  const close = () => {
    Animated.timing(anim, { toValue: 0, duration: 150, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onClose();
    });
  };
  if (!visible) return null;
  const scale = anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });
  return (
    <Modal transparent visible animationType="none" onRequestClose={close}>
      <Animated.View style={[styles.sheetBackdrop, { opacity: anim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={close} />
      </Animated.View>
      <View style={styles.sheetCenter} pointerEvents="box-none">
        <Animated.View style={[styles.sheetCard, { opacity: anim, transform: [{ scale }] }]}>
          <View style={styles.sheetHead}>
            <Text style={styles.sheetTitle} numberOfLines={1}>
              {title}
            </Text>
            <Pressable onPress={close} hitSlop={8} style={styles.sheetClose}>
              <Text style={styles.sheetCloseX}>✕</Text>
            </Pressable>
          </View>
          {children}
        </Animated.View>
      </View>
    </Modal>
  );
}

/** Strip chat-only tokens the coach might emit so the bubble reads clean. */
function cleanReply(s: string): string {
  return (s ?? '')
    .replace(/\[\[[^\]]+\]\]/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/** Focused in-page AI chat for the glucose screen: a fresh conversation that
 *  opens with a glucose-aware greeting. sendChatMessage already ships the full
 *  patient context (profile, glucose, insulin, meals, notes, labs). */
function CoachChat({
  greeting,
  profile,
  lang,
  errorText,
  placeholder,
}: {
  greeting: string;
  profile: any;
  lang: string;
  errorText: string;
  placeholder: string;
}) {
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([
    { role: 'assistant', content: greeting },
  ]);
  const [input, setInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const scrollRef = useRef<ScrollView>(null);

  const send = async () => {
    const text = input.trim();
    if (!text || thinking) return;
    setInput('');
    const next = [...messages, { role: 'user' as const, content: text }];
    setMessages(next);
    setThinking(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    try {
      const reply = await sendChatMessage(next, lang, profile);
      setMessages((m) => [...m, { role: 'assistant', content: reply }]);
    } catch {
      setMessages((m) => [...m, { role: 'assistant', content: errorText }]);
    } finally {
      setThinking(false);
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        ref={scrollRef}
        style={styles.chatScroll}
        contentContainerStyle={{ paddingVertical: 8, gap: 10 }}
        showsVerticalScrollIndicator={false}
      >
        {messages.map((m, i) =>
          m.role === 'user' ? (
            <View key={i} style={styles.chatUserRow}>
              <View style={styles.chatUserBubble}>
                <Text style={styles.chatUserText}>{m.content}</Text>
              </View>
            </View>
          ) : (
            <View key={i} style={styles.chatAiRow}>
              <View style={styles.chatAiAvatar}>
                <AnimatedRobot size={22} mood="happy" />
              </View>
              <View style={styles.chatAiBubble}>
                <Text style={styles.chatAiText}>{cleanReply(m.content)}</Text>
              </View>
            </View>
          )
        )}
        {thinking ? (
          <View style={styles.chatAiRow}>
            <View style={styles.chatAiAvatar}>
              <AnimatedRobot size={22} mood="happy" />
            </View>
            <View style={styles.chatAiBubble}>
              <Spinner size={16} color={GREEN} />
            </View>
          </View>
        ) : null}
      </ScrollView>

      <View style={styles.chatInputBar}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={placeholder}
          placeholderTextColor="#98a1af"
          style={styles.chatInput}
          multiline
          onSubmitEditing={send}
        />
        <Pressable
          onPress={send}
          disabled={!input.trim() || thinking}
          style={[styles.chatSend, (!input.trim() || thinking) && { opacity: 0.5 }]}
        >
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M3 11l18-8-8 18-2.5-7.5L3 11z" fill="#fff" stroke="#fff" strokeWidth={1.4} strokeLinejoin="round" />
          </Svg>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

/**
 * Daily objective ring — the patient's own "time in range" goal for the day.
 * A 0→100 % donut: the arc fills to the day's achieved TIR, a notch marks the
 * goal, and the colour turns green the moment the fill reaches (or passes) it.
 * Animated sweep on mount / when the day changes.
 */
/** Animated adds `collapsable={false}`, which react-native-svg forwards to
 *  the DOM <circle> on web (React warns) — strip it, like ui/motion.tsx. */
const CircleSansCollapsable = React.forwardRef<any, any>(function CircleSansCollapsable(
  { collapsable: _collapsable, ...rest },
  ref
) {
  return <Circle ref={ref} {...rest} />;
});
const AnimatedCircle = Animated.createAnimatedComponent(CircleSansCollapsable);
function ObjectiveRing({
  tir,
  goal,
  size = 172,
}: {
  tir: number | null;
  goal: number;
  size?: number;
}) {
  const stroke = 15;
  const r = (size - stroke - 8) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, tir ?? 0));
  const reached = tir != null && tir >= goal;
  const arcColor = reached ? GREEN : pct >= goal * 0.6 ? '#F5B60A' : '#F08A3C';

  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: pct / 100,
      duration: 1100,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [pct, anim]);
  const dashoffset = anim.interpolate({ inputRange: [0, 1], outputRange: [circ, 0] });

  // Goal notch, placed on the ring (0 % at 12 o'clock, clockwise).
  const gAng = ((goal / 100) * 360 - 90) * (Math.PI / 180);
  const gx = cx + r * Math.cos(gAng);
  const gy = cy + r * Math.sin(gAng);

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <SvgLinearGradient id="objGrad" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor="#2FD583" />
            <Stop offset="1" stopColor={GREEN_D} />
          </SvgLinearGradient>
        </Defs>
        {/* Track */}
        <Circle cx={cx} cy={cy} r={r} stroke="#E6EFE8" strokeWidth={stroke} fill="none" />
        {/* Progress (animated), starting at 12 o'clock */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={r}
          stroke={reached ? 'url(#objGrad)' : arcColor}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={dashoffset}
          transform={`rotate(-90 ${cx} ${cy})`}
        />
        {/* Goal notch */}
        <Circle cx={gx} cy={gy} r={6} fill="#FFFFFF" stroke={INK} strokeWidth={2.5} />
      </Svg>
      <View style={styles.objRingCenter} pointerEvents="none">
        <Text style={[styles.objRingPct, reached && { color: GREEN_D }]}>
          {tir != null ? `${tir}` : '—'}
          <Text style={styles.objRingPctSign}>%</Text>
        </Text>
        {reached ? <Text style={styles.objRingCheck}>✓</Text> : null}
      </View>
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
  /** Which in-page sheet is open (grows from its card to the centre). */
  const [sheet, setSheet] = useState<null | 'trend' | 'measures' | 'coach'>(null);
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
  // "Dans la cible" ONLY when the reading is actually in range; otherwise the
  // zone's own label (Bas / Modéré / Élevé) — the pill used to lie "in target".
  const zoneLabel = zone
    ? zone.key === 'normal'
      ? t('glucosePage.inRange')
      : t(zone.labelKey)
    : '';

  /* ── Daily objective (patient-set "time in range" goal) ── */
  const goalTir = Math.round(profile?.daily_tir_goal ?? 70);
  const dayInRange = dayLogs.filter((g) => g.value >= low && g.value <= high).length;
  const dayTir = dayLogs.length ? Math.round((dayInRange / dayLogs.length) * 100) : null;
  const objReached = dayTir != null && dayTir >= goalTir;
  const objRemaining = Math.max(0, goalTir - (dayTir ?? 0));
  const objMsg =
    dayTir == null
      ? t('glucosePage.objMsgEmpty')
      : objReached
        ? t('glucosePage.objMsgReached')
        : dayTir >= goalTir * 0.8
          ? t('glucosePage.objMsgClose', { n: objRemaining })
          : t('glucosePage.objMsgGo', { goal: goalTir });

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
    return {
      avg,
      tir: pct(inR),
      high: pct(hi),
      low: pct(lo),
      min: Math.min(...vals),
      max: Math.max(...vals),
      count: vals.length,
    };
  }, [glucoseLogs, low, high]);

  // Trend from the ACTUAL last readings (not just per-day averages) so it
  // reacts to the real data — it used to sit on "Stable" whenever there was
  // one day of data. Compares the older half of the recent readings to the
  // newer half; ~12 mg/dL of drift flips it to rising/falling.
  const trend = useMemo(() => {
    const recent = [...glucoseLogs]
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime())
      .slice(-8)
      .map((g) => g.value);
    if (recent.length < 3) return 'stable' as const;
    const half = Math.max(1, Math.floor(recent.length / 2));
    const early = recent.slice(0, half);
    const late = recent.slice(-half);
    const a = early.reduce((s, v) => s + v, 0) / early.length;
    const b = late.reduce((s, v) => s + v, 0) / late.length;
    if (b - a > 12) return 'rising' as const;
    if (a - b > 12) return 'falling' as const;
    return 'stable' as const;
  }, [glucoseLogs]);
  const trendLabel =
    trend === 'rising'
      ? t('glucosePage.trendRising')
      : trend === 'falling'
        ? t('glucosePage.trendFalling')
        : t('glucosePage.trendStable');
  const trendTone =
    trend === 'rising'
      ? { bg: '#FEF3E0', color: '#F59E0B' }
      : trend === 'falling'
        ? { bg: '#E7F0FE', color: '#3B82F6' }
        : { bg: '#E4F6EC', color: GREEN_D };
  const trendDesc =
    trend === 'rising'
      ? t('glucosePage.trendRisingDesc')
      : trend === 'falling'
        ? t('glucosePage.trendFallingDesc')
        : t('glucosePage.trendStableDesc');
  const coachGreeting = weekStats
    ? t('glucosePage.coachGreeting', { avg: weekStats.avg, tir: weekStats.tir })
    : t('glucosePage.coachGreetingNoData');

  const allMeasures = useMemo(
    () =>
      [...glucoseLogs].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [glucoseLogs]
  );
  const recentMeasures = allMeasures.slice(0, 3);

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
              valueText={latest ? String(latest.value) : '—'}
              unitLabel="mg/dL"
              lowLabel={String(low)}
              highLabel={String(high)}
              frac={gaugeFrac}
              zone={zone}
              zoneLabel={zoneLabel}
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

            <PressableScale style={styles.trendCard} onPress={() => setSheet('trend')}>
              <View style={[styles.miniIcon, { width: 34, height: 34, borderRadius: 11, backgroundColor: '#E7F0FE' }]}>
                <TrendIcon color="#3B82F6" size={17} />
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.miniLabel}>{t('glucosePage.trend')}</Text>
                <Text style={styles.trendValue}>{trendLabel}</Text>
                <Text style={styles.trendSub}>{t('glucosePage.trend7days')}</Text>
              </View>
              <ChevronRight />
            </PressableScale>
          </View>
        </FadeInView>

        {/* ── Daily objective ring (patient's own TIR goal) ── */}
        <FadeInView delay={110} style={{ paddingHorizontal: 20, marginTop: 14 }}>
          <View style={[styles.card, styles.objCard]}>
            <View style={styles.objHead}>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.objTitle}>🎯 {t('glucosePage.objTitle')}</Text>
                <Text style={styles.objSub} numberOfLines={1}>
                  {dayOffset === 0 ? t('glucosePage.objSubToday') : dayLabel(dayOffset)}
                </Text>
              </View>
              <Pressable onPress={() => router.push('/profile-edit')} style={styles.objEdit} hitSlop={8}>
                <TargetIcon />
                <Text style={styles.objEditText}>{t('glucosePage.objEdit')}</Text>
              </Pressable>
            </View>

            <View style={styles.objBody}>
              <ObjectiveRing tir={dayTir} goal={goalTir} />
              <View style={styles.objStats}>
                <View style={styles.objStatRow}>
                  <View style={[styles.objDot, { backgroundColor: INK }]} />
                  <Text style={styles.objStatLabel}>{t('glucosePage.objGoal')}</Text>
                  <Text style={styles.objStatVal}>{goalTir}%</Text>
                </View>
                <View style={styles.objStatRow}>
                  <View style={[styles.objDot, { backgroundColor: GREEN }]} />
                  <Text style={styles.objStatLabel}>{t('glucosePage.objReached')}</Text>
                  <Text style={[styles.objStatVal, { color: GREEN_D }]}>
                    {dayTir != null ? `${dayTir}%` : '—'}
                  </Text>
                </View>
                <View style={styles.objStatRow}>
                  <View style={[styles.objDot, { backgroundColor: objReached ? GREEN : '#F5B60A' }]} />
                  <Text style={styles.objStatLabel}>
                    {objReached ? t('glucosePage.objDone') : t('glucosePage.objLeft')}
                  </Text>
                  <Text style={styles.objStatVal}>{objReached ? '🎉' : `${objRemaining}%`}</Text>
                </View>
              </View>
            </View>

            <View style={[styles.objMsgWrap, objReached && styles.objMsgWrapDone]}>
              <Text style={[styles.objMsgText, objReached && { color: GREEN_D }]}>{objMsg}</Text>
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
          <PressableScale style={styles.coachCard} onPress={() => setSheet('coach')}>
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
          </PressableScale>
        </FadeInView>

        {/* ── Dernières mesures + Plages ── */}
        <FadeInView delay={210} style={styles.duoRow}>
          {/* Dernières mesures → opens the full list sheet */}
          <PressableScale style={[styles.card, styles.duoCard]} onPress={() => setSheet('measures')}>
            <View style={styles.duoTitleRow}>
              <Text style={styles.duoTitle}>{t('glucosePage.recentMeasures')}</Text>
              <ChevronRight size={15} />
            </View>
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
                    <View style={[styles.measureDot, { backgroundColor: z.color }]} />
                  </View>
                );
              })
            )}
          </PressableScale>

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

      {/* ── Tendance sheet ── */}
      <SheetShell visible={sheet === 'trend'} onClose={() => setSheet(null)} title={t('glucosePage.trendTitle')}>
        <View style={[styles.trendBadge, { backgroundColor: trendTone.bg }]}>
          <TrendIcon color={trendTone.color} size={17} />
          <Text style={[styles.trendBadgeText, { color: trendTone.color }]}>{trendLabel}</Text>
        </View>
        <Text style={styles.sheetPara}>{trendDesc}</Text>
        <View style={styles.statGrid}>
          <StatBox label={t('glucosePage.avg')} value={weekStats ? String(weekStats.avg) : '—'} unit="mg/dL" />
          <StatBox label={t('glucosePage.inTarget')} value={weekStats ? `${weekStats.tir}%` : '—'} unit={t('glucosePage.ofTime')} />
          <StatBox label={t('glucosePage.statMin')} value={weekStats ? String(weekStats.min) : '—'} unit="mg/dL" />
          <StatBox label={t('glucosePage.statMax')} value={weekStats ? String(weekStats.max) : '—'} unit="mg/dL" />
        </View>
        <View style={styles.whatBox}>
          <Text style={styles.whatTitle}>{t('glucosePage.trendWhatTitle')}</Text>
          <Text style={styles.whatBody}>{t('glucosePage.trendWhatBody')}</Text>
        </View>
      </SheetShell>

      {/* ── Dernières mesures sheet ── */}
      <SheetShell visible={sheet === 'measures'} onClose={() => setSheet(null)} title={t('glucosePage.measuresTitle')}>
        {allMeasures.length === 0 ? (
          <Text style={styles.emptyMini}>{t('glucosePage.noMeasure')}</Text>
        ) : (
          <ScrollView style={styles.sheetList} showsVerticalScrollIndicator={false}>
            {allMeasures.map((g) => {
              const z = zoneFor(g.value, low, high);
              return (
                <View key={g.id} style={styles.measureFullRow}>
                  <View style={[styles.measureDotBig, { backgroundColor: z.color }]} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.measureFullValue}>
                      {g.value} <Text style={styles.measureUnit}>mg/dL</Text>
                    </Text>
                    <Text style={styles.measureFullMeta} numberOfLines={1}>
                      {new Date(g.created_at).toLocaleDateString(i18n.language, { day: '2-digit', month: 'short' })}
                      {' · '}
                      {new Date(g.created_at).toLocaleTimeString(i18n.language, { hour: '2-digit', minute: '2-digit' })}
                      {' · '}
                      <Text style={{ color: z.color }}>{t(z.labelKey)}</Text>
                    </Text>
                  </View>
                  <Pressable onPress={() => deleteGlucose(g.id)} hitSlop={6} style={styles.measureDelBtn}>
                    <Text style={styles.measureDelX}>✕</Text>
                  </Pressable>
                </View>
              );
            })}
          </ScrollView>
        )}
      </SheetShell>

      {/* ── Conseil IA in-page chat ── */}
      <SheetShell visible={sheet === 'coach'} onClose={() => setSheet(null)} title={t('glucosePage.coachSheetTitle')}>
        <CoachChat
          greeting={coachGreeting}
          profile={profile}
          lang={i18n.language}
          errorText={t('common.error')}
          placeholder={t('glucosePage.coachPlaceholder')}
        />
      </SheetShell>

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

function StatBox({ label, value, unit }: { label: string; value: string; unit: string }) {
  return (
    <View style={styles.statBox}>
      <Text style={styles.statBoxLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.statBoxValue}>{value}</Text>
      <Text style={styles.statBoxUnit}>{unit}</Text>
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
  gaugeTop: { position: 'absolute', top: 30, left: 0, right: 0, alignItems: 'center' },
  gaugeStatus: { position: 'absolute', top: 92, left: 0, right: 0, alignItems: 'center' },
  gaugeUnitRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  gaugeUnit: { fontFamily: F600, fontSize: 11.5, color: '#9AA8A0' },
  gaugeValue: { fontFamily: F800, fontSize: 40, color: INK, lineHeight: 42, marginTop: 2 },
  gaugeDash: { fontFamily: F800, fontSize: 38, color: '#CBD5E1', marginTop: 2 },
  gaugePill: { borderRadius: 99, paddingVertical: 3, paddingHorizontal: 11 },
  gaugePillText: { fontFamily: F700, fontSize: 11.5 },
  gaugeEmpty: { fontFamily: F500, fontSize: 11, color: '#9AA8A0' },
  gaugeEnd: { position: 'absolute', top: 122, fontFamily: F700, fontSize: 12, color: '#9AA8A0' },
  gaugePointer: {
    position: 'absolute',
    left: '50%',
    marginLeft: -6,
    bottom: 6,
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

  /* ── Daily objective card ── */
  objCard: { paddingBottom: 14 },
  objHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  objTitle: { fontFamily: F800, fontSize: 15, color: INK },
  objSub: { fontFamily: F500, fontSize: 11.5, color: '#7C8B82', marginTop: 2 },
  objEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1ECFE',
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 11,
  },
  objEditText: { fontFamily: F700, fontSize: 11.5, color: '#7C5CF6' },
  objBody: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 12,
  },
  objRingCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  objRingPct: { fontFamily: F800, fontSize: 40, color: INK, letterSpacing: -1 },
  objRingPctSign: { fontFamily: F800, fontSize: 19, color: '#9BB0A4' },
  objRingCheck: { fontFamily: F800, fontSize: 15, color: GREEN_D, marginTop: -2 },
  objStats: { flex: 1, minWidth: 0, gap: 12 },
  objStatRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  objDot: { width: 9, height: 9, borderRadius: 5 },
  objStatLabel: { flex: 1, fontFamily: F600, fontSize: 12.5, color: '#5C6B62' },
  objStatVal: { fontFamily: F800, fontSize: 14, color: INK },
  objMsgWrap: {
    marginTop: 14,
    backgroundColor: '#F3F7F1',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 13,
  },
  objMsgWrapDone: { backgroundColor: '#E6F7ED' },
  objMsgText: { fontFamily: F600, fontSize: 12.5, lineHeight: 18, color: '#4A5A50', textAlign: 'center' },
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
  duoTitle: { fontFamily: F800, fontSize: 14, color: INK },
  duoTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
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

  /* ── In-page sheets (grow from centre) ── */
  sheetBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(16,24,40,0.45)' },
  sheetCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 20 },
  sheetCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '82%',
    backgroundColor: '#fff',
    borderRadius: 26,
    padding: 18,
    shadowColor: 'rgba(16,24,40,1)',
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.28,
    shadowRadius: 40,
    elevation: 20,
  },
  sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sheetTitle: { flex: 1, minWidth: 0, fontFamily: F800, fontSize: 17, color: INK },
  sheetClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetCloseX: { fontFamily: F700, fontSize: 13, color: '#667085' },
  sheetPara: { fontFamily: F500, fontSize: 13.5, lineHeight: 20, color: '#3A4A42', marginTop: 4 },

  trendBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 99,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  trendBadgeText: { fontFamily: F800, fontSize: 14 },

  statGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 16 },
  statBox: {
    flexBasis: '47%',
    flexGrow: 1,
    backgroundColor: '#F6F9F5',
    borderRadius: 16,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  statBoxLabel: { fontFamily: F600, fontSize: 11.5, color: '#5C6E63' },
  statBoxValue: { fontFamily: F800, fontSize: 22, color: INK, marginTop: 6 },
  statBoxUnit: { fontFamily: F500, fontSize: 11, color: '#9AA8A0', marginTop: 1 },

  whatBox: { backgroundColor: '#E9F6EF', borderRadius: 16, padding: 14, marginTop: 16 },
  whatTitle: { fontFamily: F800, fontSize: 13.5, color: GREEN_D },
  whatBody: { fontFamily: F500, fontSize: 12.5, lineHeight: 18, color: '#3A4A42', marginTop: 4 },

  sheetList: { maxHeight: 420 },
  measureFullRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F3F1',
  },
  measureDotBig: { width: 10, height: 10, borderRadius: 5 },
  measureFullValue: { fontFamily: F800, fontSize: 15, color: INK },
  measureFullMeta: { fontFamily: F500, fontSize: 11.5, color: '#9AA8A0', marginTop: 2 },
  measureDelBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F2F4F7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── In-page coach chat ── */
  chatScroll: { maxHeight: 400 },
  chatUserRow: { alignItems: 'flex-end' },
  chatUserBubble: {
    maxWidth: '86%',
    backgroundColor: '#d8f5e5',
    borderRadius: 16,
    borderBottomRightRadius: 5,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  chatUserText: { fontFamily: F600, fontSize: 13.5, lineHeight: 19, color: '#14532d' },
  chatAiRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 7, paddingRight: 30 },
  chatAiAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  chatAiBubble: {
    flexShrink: 1,
    backgroundColor: '#F2F5F3',
    borderRadius: 16,
    borderBottomLeftRadius: 5,
    paddingVertical: 9,
    paddingHorizontal: 13,
  },
  chatAiText: { fontFamily: F500, fontSize: 13.5, lineHeight: 19.5, color: '#26313f' },
  chatInputBar: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, marginTop: 12 },
  chatInput: {
    flex: 1,
    minHeight: 42,
    maxHeight: 100,
    backgroundColor: '#f4f6fa',
    borderRadius: 21,
    paddingHorizontal: 15,
    paddingTop: 11,
    paddingBottom: 11,
    fontFamily: F500,
    fontSize: 14,
    color: '#111827',
  },
  chatSend: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
