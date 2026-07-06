import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors } from '@/theme';

/**
 * Horizontal progress indicator for the scan result wizard.
 * Shows a numbered dot per step; completed steps are filled green with a
 * check, the current one is highlighted, upcoming ones are muted — the
 * connecting line fills up to the current step. Purely presentational.
 */
export function ScanStepper({
  current,
  total,
}: {
  /** 0-based index of the active step */
  current: number;
  /** total number of steps */
  total: number;
}) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, i) => {
        const done = i < current;
        const active = i === current;
        return (
          <React.Fragment key={i}>
            <View
              style={[
                styles.dot,
                done && styles.dotDone,
                active && styles.dotActive,
              ]}
            >
              <Text
                style={[
                  styles.dotText,
                  (done || active) && styles.dotTextOn,
                ]}
              >
                {done ? '✓' : i + 1}
              </Text>
            </View>
            {i < total - 1 ? (
              <View style={[styles.line, i < current && styles.lineDone]} />
            ) : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const SIZE = 26;
const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  dot: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dotDone: { backgroundColor: colors.primary },
  dotActive: {
    backgroundColor: colors.primary,
    // subtle ring on the active step
    borderWidth: 3,
    borderColor: `${colors.primary}33`,
  },
  dotText: { fontSize: 12, fontWeight: '800', color: colors.textTertiary },
  dotTextOn: { color: '#fff' },
  line: {
    flex: 1,
    height: 3,
    marginHorizontal: 4,
    borderRadius: 2,
    backgroundColor: colors.surface2,
  },
  lineDone: { backgroundColor: colors.primary },
});
