import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { useReduceMotion } from './motion';

const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const SEGMENTS = 26;

/* Colour of the IG scale AT a given position (0..100): deep green (excellent)
 * → lime → yellow (moderate) → orange → red (high). Used to paint each filled
 * segment by ITS place on the scale, so a low-IG dish stays all-green while a
 * high-IG one runs into the warning colours. */
const STOPS: { p: number; c: [number, number, number] }[] = [
  { p: 0, c: [22, 163, 74] }, // green-600
  { p: 40, c: [132, 204, 22] }, // lime-500
  { p: 55, c: [234, 179, 8] }, // yellow-500
  { p: 70, c: [249, 115, 22] }, // orange-500
  { p: 100, c: [239, 68, 68] }, // red-500
];

function zoneColorAt(p: number): string {
  const x = Math.max(0, Math.min(100, p));
  let a = STOPS[0];
  let b = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (x >= STOPS[i].p && x <= STOPS[i + 1].p) {
      a = STOPS[i];
      b = STOPS[i + 1];
      break;
    }
  }
  const t = b.p === a.p ? 0 : (x - a.p) / (b.p - a.p);
  const ch = (i: number) => Math.round(a.c[i] + (b.c[i] - a.c[i]) * t);
  return `rgb(${ch(0)}, ${ch(1)}, ${ch(2)})`;
}

/**
 * The tone for a whole IG value: `color` for graphics (bars, dots, chips) and
 * `textColor` for type. The bright scale colours only reach ~3.2-3.5:1 on
 * white, so small labels and the explanation sentence use the darker twins to
 * clear the 4.5:1 WCAG AA floor without changing what the colours MEAN.
 */
export function glycemicTone(value: number) {
  if (value <= 55) return { key: 'low' as const, color: '#0f9d58', textColor: '#0B7A44' };
  if (value <= 69) return { key: 'medium' as const, color: '#d97706', textColor: '#B45309' };
  return { key: 'high' as const, color: '#dc2626', textColor: '#C81E1E' };
}

/** Scale-word colours under the bar — same three meanings, readable at 9.5 px. */
const SCALE_TEXT = ['#0B7A44', '#B45309', '#C81E1E'] as const;

/* One segment: filled ones animate in left→right, empty ones stay grey. */
function Segment({
  index,
  filled,
  color,
  reduce,
}: {
  index: number;
  filled: boolean;
  color: string;
  reduce: boolean;
}) {
  const anim = useRef(new Animated.Value(reduce || !filled ? 1 : 0)).current;

  useEffect(() => {
    if (reduce || !filled) {
      anim.setValue(1);
      return;
    }
    const a = Animated.timing(anim, {
      toValue: 1,
      duration: 260,
      delay: 120 + index * 26,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    });
    a.start();
    return () => a.stop();
  }, [anim, filled, index, reduce]);

  return (
    <Animated.View
      style={{
        flex: 1,
        borderRadius: 3,
        backgroundColor: filled ? color : '#e6e8ef',
        opacity: filled ? anim : 1,
        transform: filled
          ? [
              {
                scaleY: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0.45, 1],
                }),
              },
            ]
          : undefined,
      }}
    />
  );
}

/**
 * Segmented glycemic-index meter: a ⚡ icon, a row of coloured segments that
 * fill up to the dish's IG (painted green→yellow→red by scale position), and
 * the IG value on the right. Optional title/description/scale labels below.
 * Purely presentational — the screen passes already-translated strings.
 */
export function GlycemicBar({
  value,
  title,
  description,
  scale,
}: {
  /** Glycemic index 0..100. */
  value: number;
  title?: string;
  /** One-line explanation of what this IG level means for the patient. */
  description?: string;
  /** Three scale words shown under the bar: [low, medium, high]. */
  scale?: [string, string, string];
}) {
  const reduce = useReduceMotion();
  const tone = glycemicTone(value);

  const filledCount = Math.max(
    1,
    Math.min(SEGMENTS, Math.round((value / 100) * SEGMENTS))
  );
  const segments = useMemo(
    () =>
      Array.from({ length: SEGMENTS }, (_, i) => ({
        filled: i < filledCount,
        // colour by this segment's own place on the 0..100 scale
        color: zoneColorAt(((i + 0.5) / SEGMENTS) * 100),
      })),
    [filledCount]
  );

  return (
    <View>
      {title ? <Text style={styles.title}>⚡ {title}</Text> : null}

      <View style={styles.barRow}>
        <Text style={styles.bolt}>⚡</Text>
        <View style={styles.track}>
          {segments.map((s, i) => (
            <Segment
              key={i}
              index={i}
              filled={s.filled}
              color={s.color}
              reduce={reduce}
            />
          ))}
        </View>
        <View style={styles.valueWrap}>
          {/* The big number is large enough for the bright tone; the small "IG"
              unit and everything below use the readable twin. */}
          <Text style={[styles.value, { color: tone.color }]}>{value}</Text>
          <Text style={[styles.valueUnit, { color: tone.textColor }]}>IG</Text>
        </View>
      </View>

      {scale ? (
        <View style={styles.scaleRow}>
          <Text style={[styles.scaleTxt, { color: SCALE_TEXT[0] }]}>{scale[0]}</Text>
          <Text style={[styles.scaleTxt, { color: SCALE_TEXT[1] }]}>{scale[1]}</Text>
          <Text style={[styles.scaleTxt, { color: SCALE_TEXT[2] }]}>{scale[2]}</Text>
        </View>
      ) : null}

      {description ? (
        <Text style={[styles.desc, { color: tone.textColor }]}>{description}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { fontFamily: F800, fontSize: 13.5, color: '#111827', marginBottom: 10 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  bolt: { fontSize: 16 },
  track: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 2.5,
    height: 30,
  },
  valueWrap: { alignItems: 'center', minWidth: 34 },
  value: { fontFamily: F800, fontSize: 19, lineHeight: 21 },
  valueUnit: { fontFamily: F700, fontSize: 9, marginTop: -1, opacity: 0.8 },
  scaleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 26,
  },
  scaleTxt: { fontFamily: F700, fontSize: 9.5 },
  desc: { fontFamily: F600, fontSize: 12, lineHeight: 18, marginTop: 10 },
});
