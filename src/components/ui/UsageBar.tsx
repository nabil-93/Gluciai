import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import { useReduceMotion } from './motion';

/* Colour of a usage bar by how FULL it is (fraction of the limit consumed):
 * lots left = green, getting close = amber, almost spent = red. This is the
 * "starts green, turns red near the end" behaviour the meter should show. */
const STOPS: { p: number; c: [number, number, number] }[] = [
  { p: 0, c: [33, 197, 126] }, // #21C57E green
  { p: 0.55, c: [61, 190, 110] }, // still green
  { p: 0.75, c: [232, 147, 12] }, // #E8930C amber
  { p: 0.9, c: [224, 82, 82] }, // #E05252 red
  { p: 1, c: [192, 57, 43] }, // deep red
];

/** Solid colour for a bar filled to `fraction` (0..1). */
export function usageColor(fraction: number): string {
  const x = Math.max(0, Math.min(1, fraction));
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
 * Horizontal usage meter: a rounded track whose fill animates from 0 to
 * `fraction` on mount and is coloured green → amber → red by how close the
 * user is to their limit. `unlimited` shows a calm, fully-green track.
 * Purely presentational.
 */
export function UsageBar({
  fraction,
  unlimited = false,
  height = 10,
}: {
  /** Consumed / limit, 0..1 (values above 1 are clamped to a full red bar). */
  fraction: number;
  /** No limit set for this feature → a full, gentle green bar. */
  unlimited?: boolean;
  height?: number;
}) {
  const reduce = useReduceMotion();
  const target = unlimited ? 1 : Math.max(0, Math.min(1, fraction));
  const color = unlimited ? 'rgb(33, 197, 126)' : usageColor(target);
  const anim = useRef(new Animated.Value(reduce ? target : 0)).current;

  useEffect(() => {
    if (reduce) {
      anim.setValue(target);
      return;
    }
    const a = Animated.timing(anim, {
      toValue: target,
      duration: 720,
      delay: 90,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false, // animating width %
    });
    a.start();
    return () => a.stop();
  }, [anim, target, reduce]);

  const width = anim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={[styles.track, { height, borderRadius: height / 2 }]}>
      <Animated.View
        style={{
          width,
          height: '100%',
          borderRadius: height / 2,
          backgroundColor: color,
          opacity: unlimited ? 0.55 : 1,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    width: '100%',
    backgroundColor: '#EAEFEC',
    overflow: 'hidden',
  },
});
