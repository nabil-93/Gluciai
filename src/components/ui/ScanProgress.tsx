import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SCAN_STAGES, type ScanStage } from '@/services/ai';
import { colors } from '@/theme';

/**
 * Progressive scan loader — a professional step-by-step checklist
 * ("✓ Detecting foods → ✓ Searching databases…") instead of one spinner.
 *
 * `stage` is the REAL pipeline stage reported by analyzeMealImage(). Stages
 * the pipeline can't report at a sub-step level (calculating/scoring, which
 * run synchronously inside aggregation) are advanced on a gentle timer so
 * the list always feels alive, but it never runs past the real stage by
 * more than one step, and it snaps to complete when the scan finishes.
 */
export function ScanProgress({
  stage,
  done,
}: {
  stage: ScanStage;
  done?: boolean;
}) {
  const { t } = useTranslation();
  const realIndex = SCAN_STAGES.indexOf(stage);
  const [visibleIndex, setVisibleIndex] = useState(0);

  // Ease the visible pointer toward the real stage; when the real stage
  // jumps ahead (e.g. straight to "finalizing"), fill intermediate steps.
  useEffect(() => {
    if (done) {
      setVisibleIndex(SCAN_STAGES.length);
      return;
    }
    // Allow the visible pointer to reach at most the real stage.
    const target = realIndex;
    if (visibleIndex >= target) return;
    const id = setInterval(() => {
      setVisibleIndex((v) => {
        if (v >= target) {
          clearInterval(id);
          return v;
        }
        return v + 1;
      });
    }, 420);
    return () => clearInterval(id);
  }, [realIndex, done, visibleIndex]);

  return (
    <View style={styles.wrap}>
      {SCAN_STAGES.map((s, i) => {
        const completed = done || i < visibleIndex;
        const active = !done && i === visibleIndex;
        return (
          <StageRow
            key={s}
            label={t(`scanner.stages.${s}`)}
            completed={completed}
            active={active}
          />
        );
      })}
    </View>
  );
}

function StageRow({
  label,
  completed,
  active,
}: {
  label: string;
  completed: boolean;
  active: boolean;
}) {
  const opacity = useRef(new Animated.Value(0)).current;
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: completed || active ? 1 : 0.4,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [completed, active, opacity]);

  useEffect(() => {
    if (!active) return;
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, [active, spin]);

  const rotate = spin.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <Animated.View style={[styles.row, { opacity }]}>
      <View style={styles.iconSlot}>
        {completed ? (
          <View style={styles.check}>
            <Text style={styles.checkMark}>✓</Text>
          </View>
        ) : active ? (
          <Animated.View
            style={[styles.spinner, { transform: [{ rotate }] }]}
          />
        ) : (
          <View style={styles.dot} />
        )}
      </View>
      <Text
        style={[
          styles.label,
          completed && styles.labelDone,
          active && styles.labelActive,
        ]}
      >
        {label}
      </Text>
    </Animated.View>
  );
}

const SIZE = 22;
const styles = StyleSheet.create({
  wrap: { gap: 14, alignSelf: 'stretch', paddingHorizontal: 8 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  iconSlot: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  check: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '900' },
  spinner: {
    width: SIZE - 4,
    height: SIZE - 4,
    borderRadius: (SIZE - 4) / 2,
    borderWidth: 2.5,
    borderColor: colors.ai,
    borderTopColor: 'transparent',
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.textTertiary,
  },
  label: { fontSize: 15, fontWeight: '600', color: colors.textTertiary },
  labelActive: { color: colors.ai, fontWeight: '700' },
  labelDone: { color: colors.text },
});
