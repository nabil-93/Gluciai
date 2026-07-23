import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Path } from 'react-native-svg';

import type { NutriGrade } from '@/services/nutrition/mealScore';

const F600 = 'PlusJakartaSans_600SemiBold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GRADES: NutriGrade[] = ['A', 'B', 'C', 'D', 'E'];

/** The official Nutri-Score palette (A dark-green … E red). */
const PALETTE: Record<NutriGrade, { bg: string; fg: string }> = {
  A: { bg: '#038141', fg: '#ffffff' },
  B: { bg: '#85bb2f', fg: '#14300a' },
  C: { bg: '#fecb02', fg: '#3a2e00' },
  D: { bg: '#ee8100', fg: '#ffffff' },
  E: { bg: '#e63e11', fg: '#ffffff' },
};

/**
 * A frosted A–E score strip meant to sit on top of the meal photo. The active
 * grade is rendered as a larger, white-ringed badge that lifts above the row,
 * while the others sit dimmed — so the letter changes with the food, exactly
 * like a front-of-pack Nutri-Score.
 */
export function NutriScoreBar({ grade, label }: { grade: NutriGrade; label: string }) {
  return (
    <View style={styles.wrap}>
      {/* rounded frosted backdrop (clipped separately so the raised badge
          and its glow are free to overflow the pill) */}
      <View style={styles.blurClip}>
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.tint]} />
      </View>

      <View style={styles.left}>
        <LinearGradient
          colors={['#b6ef5a', '#57c24b']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={styles.leaf}
        >
          <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke="#123008" strokeWidth={2.3} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.48 19 2c1 2 2 4.18 2 8 0 5.5-4.78 10-10 10Z" />
            <Path d="M2 21c0-3 1.85-5.36 5.08-6C9.5 14.52 12 13 13 12" />
          </Svg>
        </LinearGradient>
        <View style={styles.labelBox}>
          <Text style={styles.labelTop} numberOfLines={1}>{label}</Text>
          <Text style={styles.labelSub}>A–E</Text>
        </View>
      </View>

      <View style={styles.segs}>
        {GRADES.map((g) => {
          const active = g === grade;
          const c = PALETTE[g];
          return (
            <View
              key={g}
              style={[
                styles.seg,
                { backgroundColor: c.bg },
                active
                  ? [styles.segActive, { shadowColor: c.bg }]
                  : styles.segIdle,
              ]}
            >
              <Text
                style={[styles.segText, { color: c.fg }, active && styles.segTextActive]}
              >
                {g}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
  },
  blurClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 18,
    overflow: 'hidden',
  },
  // A solid-ish frosted panel so every grade sits on a consistent dark
  // backdrop — the dark-green "A" badge would otherwise blend into a green
  // meal photo when the platform blur is weak/absent.
  tint: { backgroundColor: 'rgba(14,16,15,0.62)' },

  // Left: leaf badge + "Nutri-Score" label
  left: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  leaf: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  labelBox: { flexShrink: 1, minWidth: 0 },
  labelTop: { color: '#ffffff', fontFamily: F800, fontSize: 12.5, letterSpacing: -0.2 },
  labelSub: { color: 'rgba(255,255,255,0.6)', fontFamily: F600, fontSize: 9, letterSpacing: 1 },

  // Right: the five A–E squares
  segs: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  seg: { alignItems: 'center', justifyContent: 'center' },
  segIdle: { width: 25, height: 27, borderRadius: 8, opacity: 0.72 },
  segActive: {
    width: 33,
    height: 33,
    borderRadius: 10,
    borderWidth: 3.5,
    borderColor: '#ffffff',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 7,
  },
  segText: { fontFamily: F800, fontSize: 12.5, lineHeight: 14 },
  segTextActive: { fontSize: 14.5, lineHeight: 16 },
});
