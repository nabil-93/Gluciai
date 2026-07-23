import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/**
 * What a single day's ring should draw.
 *
 * `segments` — the home screen's shape: the circle is cut into N equal arcs
 * and each lights up only when that thing happened (breakfast / lunch /
 * dinner, or rapid / long / mixed insulin).
 *
 * `progress` — one arc filled from the top, clockwise, in proportion to a
 * 0…1 value (time-in-range, carbs against the day's goal…).
 */
export type DayRing =
  | { kind: 'segments'; segments: { color: string; on: boolean }[] }
  | { kind: 'progress'; color: string; value: number }
  | null;

const IDLE = '#e2e5ec';
const IDLE_ON_SELECTED = 'rgba(255,255,255,0.35)';

/**
 * The ring drawn around a day number. Selected days paint every lit arc white
 * so the glyph survives on the green pill. Exported because the home week bar
 * draws the same ring at a larger size outside the month grid.
 */
export function DayRingGlyph({
  ring,
  size = 17,
  stroke = 2.4,
  selected = false,
}: {
  ring: DayRing;
  size?: number;
  stroke?: number;
  selected?: boolean;
}) {
  const r = (size - stroke) / 2;
  const c = size / 2;
  const idle = selected ? IDLE_ON_SELECTED : IDLE;

  const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
  const pt = (deg: number) => ({
    x: c + r * Math.cos(rad(deg)),
    y: c + r * Math.sin(rad(deg)),
  });
  /** An arc from `startDeg` sweeping `sweepDeg` clockwise. */
  const arc = (startDeg: number, sweepDeg: number) => {
    const p1 = pt(startDeg);
    const p2 = pt(startDeg + sweepDeg);
    const large = sweepDeg > 180 ? 1 : 0;
    return `M ${p1.x.toFixed(2)} ${p1.y.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  };

  const paths: { key: string; d: string; color: string }[] = [];

  if (ring?.kind === 'segments' && ring.segments.length) {
    const n = ring.segments.length;
    const GAP = n > 1 ? 14 : 0; // degrees of breathing room between arcs
    const SEG = 360 / n - GAP;
    ring.segments.forEach((s, i) => {
      paths.push({
        key: `s${i}`,
        d: arc(i * (360 / n) + GAP / 2, SEG),
        color: s.on ? (selected ? '#ffffff' : s.color) : idle,
      });
    });
  } else if (ring?.kind === 'progress') {
    const v = Math.max(0, Math.min(1, ring.value));
    // Full track first, then the filled part on top.
    paths.push({ key: 'track', d: arc(0, 359.9), color: idle });
    if (v > 0) {
      paths.push({
        key: 'fill',
        d: arc(0, Math.max(6, v * 359.9)),
        color: selected ? '#ffffff' : ring.color,
      });
    }
  } else {
    paths.push({ key: 'empty', d: arc(0, 359.9), color: idle });
  }

  return (
    <Svg width={size} height={size}>
      {paths.map((p) => (
        <Path key={p.key} d={p.d} stroke={p.color} strokeWidth={stroke} strokeLinecap="round" fill="none" />
      ))}
    </Svg>
  );
}

/**
 * The month grid every day-picker in the app shares — the design the home
 * screen introduced: ‹ month year ›, narrow weekday initials (Monday-first),
 * and one vertical pill per day holding a ring over the day number. What the
 * ring MEANS is the caller's business: it hands back a `DayRing` per date, so
 * the meal screen can show three meal arcs while the glucose screen shows a
 * time-in-range gauge.
 */
export function RingCalendar({
  selected,
  onSelect,
  locale,
  ringFor,
  maxDate,
  selectedVariant = 'fill',
}: {
  selected: Date;
  onSelect: (d: Date) => void;
  locale: string;
  ringFor: (d: Date) => DayRing;
  /** Days after this are shown greyed and are not tappable. Defaults to today. */
  maxDate?: Date;
  /**
   * How the chosen day is marked. `fill` floods the pill green (the home
   * screen's look). `ring` only outlines it — the tracking sheets use this so
   * the day KEEPS its own colour and you can still read how that day went.
   */
  selectedVariant?: 'fill' | 'ring';
}) {
  const outline = selectedVariant === 'ring';
  const [viewMonth, setViewMonth] = useState(
    () => new Date(selected.getFullYear(), selected.getMonth(), 1)
  );

  const today = maxDate ?? new Date();
  const year = viewMonth.getFullYear();
  const month = viewMonth.getMonth();

  const monthLabel = viewMonth.toLocaleDateString(locale, { month: 'long', year: 'numeric' });

  const weekdays = useMemo(() => {
    const base = new Date(2024, 0, 1); // a Monday
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d.toLocaleDateString(locale, { weekday: 'narrow' });
    });
  }, [locale]);

  const cells = useMemo(() => {
    const firstDow = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = Monday
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const out: (Date | null)[] = Array(firstDow).fill(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(new Date(year, month, d));
    return out;
  }, [year, month]);

  const shiftMonth = (delta: number) => setViewMonth(new Date(year, month + delta, 1));

  return (
    <View>
      <View style={styles.head}>
        <Pressable onPress={() => shiftMonth(-1)} hitSlop={10} style={styles.nav} accessibilityRole="button">
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M15 5l-7 7 7 7" stroke="#4b5563" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </Pressable>
        <Text style={styles.month}>{monthLabel}</Text>
        <Pressable onPress={() => shiftMonth(1)} hitSlop={10} style={styles.nav} accessibilityRole="button">
          <Svg width={18} height={18} viewBox="0 0 24 24">
            <Path d="M9 5l7 7-7 7" stroke="#4b5563" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </Svg>
        </Pressable>
      </View>

      <View style={styles.weekRow}>
        {weekdays.map((w, i) => (
          <Text key={i} style={styles.weekday}>
            {w}
          </Text>
        ))}
      </View>

      <View style={styles.grid}>
        {cells.map((d, i) => {
          if (!d)
            return (
              <View key={`e${i}`} style={styles.cell}>
                <View style={[styles.pill, styles.pillBlank]} />
              </View>
            );
          const isSel = d.toDateString() === selected.toDateString();
          const isToday = d.toDateString() === today.toDateString();
          const isFuture = d > today && !isToday;
          return (
            <Pressable
              key={i}
              style={styles.cell}
              disabled={isFuture}
              onPress={() => onSelect(d)}
              accessibilityRole="button"
            >
              <View
                style={[
                  styles.pill,
                  isSel && (outline ? styles.pillSelRing : styles.pillSel),
                  !isSel && isToday && styles.pillToday,
                ]}
              >
                <DayRingGlyph ring={isFuture ? null : ringFor(d)} selected={isSel && !outline} />
                <Text
                  style={[
                    styles.dayText,
                    isSel && (outline ? styles.dayTextSelRing : styles.dayTextSel),
                    !isSel && isToday && styles.dayTextToday,
                    isFuture && styles.dayTextMuted,
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
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  nav: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f3f4f8', alignItems: 'center', justifyContent: 'center' },
  month: { fontFamily: F800, fontSize: 14.5, color: '#111827', textTransform: 'capitalize' },

  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekday: { flex: 1, textAlign: 'center', fontFamily: F700, fontSize: 10.5, color: '#9aa3b2', textTransform: 'uppercase' },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  pill: {
    width: 34,
    paddingVertical: 6,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#eef0f4',
    alignItems: 'center',
    gap: 3,
  },
  pillBlank: { backgroundColor: '#f4f5f8', borderColor: 'transparent', height: 52 },
  pillSel: { backgroundColor: '#19c37d', borderColor: '#19c37d' },
  pillSelRing: { borderColor: '#19c37d', borderWidth: 2 },
  pillToday: { borderColor: '#bfe6d4' },
  dayText: { fontFamily: F700, fontSize: 12.5, color: '#374151' },
  dayTextToday: { color: '#2f7ff0' },
  dayTextSel: { color: '#ffffff' },
  dayTextSelRing: { color: '#111827', fontFamily: F800 },
  dayTextMuted: { color: '#cbd2dc' },
});
