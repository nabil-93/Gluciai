import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { BlurView } from 'expo-blur';

import { GRADE_COLORS, type MealGrade } from '@/services/nutrition/interpret';

const F600 = 'PlusJakartaSans_600SemiBold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GRADES: MealGrade[] = ['A', 'B', 'C', 'D', 'E'];

/** The APPLICATION's logo — the green G with the robot, leaf and drop, the same
 *  mark on the home screen and the launcher icon.
 *
 *  It was the bare `claude/robot.png` mascot, which at 24 px read as a generic
 *  white blob against the dark strip: the robot's own body is white and it
 *  carries none of the brand's green. So it became the launcher icon — the mark
 *  a patient already associates with this app.
 *
 *  But `icon.png` is a store asset and store icons are OPAQUE: measured, it is
 *  0% transparent, alpha 255 in every corner. On this dark frosted strip that
 *  put the mark on a white tile — a chip, which is exactly the look this app
 *  rejects everywhere else. `splash-icon.png` is the SAME artwork cut with a
 *  real alpha channel (57% transparent), so the mark floats instead.
 *
 *  Sharing the splash's file is deliberate: it is by definition the same brand
 *  mark, and a second copy would add ~52 KB to the bundle to say so.
 *
 *  `@/assets` points at the ROOT `assets/` folder, not `src/assets/`. */
const LOGO = require('@/assets/images/splash-icon.png');

/**
 * The A–E letter of the app's OWN meal indicator, as a strip under the meal
 * photo. The active grade is a larger, white-ringed badge; the others sit
 * dimmed, so the letter visibly changes with the food.
 *
 * IT IS NOT A FRONT-OF-PACK NUTRITIONAL LABEL and must never be presented as
 * one (finding NUTR-A1). The colours are the app's own tier palette rather than
 * any official five, there is no leaf mark, and the strip carries a sub-label
 * naming whose indicator this is. The name comes from the caller via `label`,
 * always through i18n.
 *
 * Removed in Step 22D Phase 1 and RESTORED by product decision. The restoration
 * is visual only: `mealGrade`, its 80/65/50/35 boundaries and `scoreMeal` are
 * byte-for-byte what they were, and the open questions about what the letter
 * MEANS stay in docs/RU3-NUTRITION-DECISIONS.md.
 */
export function MealGradeBar({
  grade,
  label,
  sub,
}: {
  /**
   * `null` when the plate cannot support a verdict at all (Step 22A): the five
   * letters stay dimmed and NONE is raised, so the strip shows the scale
   * without awarding a grade. An unidentified plate used to be handed an "A".
   */
  grade: MealGrade | null;
  label: string;
  sub: string;
}) {
  return (
    <View style={styles.wrap}>
      {/* rounded frosted backdrop (clipped separately so the raised badge
          and its glow are free to overflow the pill) */}
      <View style={styles.blurClip}>
        <BlurView intensity={24} tint="dark" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.tint]} />
      </View>

      <View style={styles.left}>
        {/* The brand mark beside the name, not instead of it: the mark makes
            the strip recognisable at a glance, the words say what it is. */}
        <Image
          source={LOGO}
          style={styles.logo}
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
        <View style={styles.labelBox}>
          <Text style={styles.labelTop} numberOfLines={1}>
            {label}
          </Text>
          {/* Who computed this letter. Two lines are allowed: German and Arabic
              are longer than French, and a truncated disclaimer is worse than
              none at all. */}
          <Text style={styles.labelSub} numberOfLines={2}>
            {sub}
          </Text>
        </View>
      </View>

      <View style={[styles.segs, !grade && styles.segsMuted]}>
        {GRADES.map((g) => {
          const active = g === grade;
          const c = GRADE_COLORS[g];
          return (
            <View
              key={g}
              style={[
                styles.seg,
                { backgroundColor: c.bg },
                active ? [styles.segActive, { shadowColor: c.bg }] : styles.segIdle,
              ]}
            >
              <Text style={[styles.segText, { color: c.fg }, active && styles.segTextActive]}>
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
  // backdrop — the deep-green "A" badge would otherwise blend into a green
  // meal photo when the platform blur is weak/absent.
  tint: { backgroundColor: 'rgba(14,16,15,0.62)' },

  // Left: the indicator's name, and whose indicator it is
  // gap 7, not 8: the logo took 8 px growing to 34, and a transparent mark
  // needs less breathing room than a tile did — its own edges are the padding.
  left: { flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 1, minWidth: 0 },
  labelBox: { flexShrink: 1, minWidth: 0 },
  labelTop: { color: '#ffffff', fontFamily: F800, fontSize: 12.5, letterSpacing: -0.2 },
  /** The brand mark, left of the name.
   *
   *  34 px, up from 26. Two reasons compound: the mark carries a lot inside it
   *  (the G, the robot, the leaf, the drop), and the artwork only fills 82% of
   *  its own frame — measured, 420x414 of 512 — so a 26 px box drew a ~21 px
   *  mark. At 34 the drawn mark is ~28 px, a third larger, and now that the
   *  white tile is gone it has to carry itself on contrast alone.
   *
   *  It stays short of crowding the text: the longest top label is 14
   *  characters ("Indice GluciAI") on one line, and the five letters own the
   *  right-hand side. The gap below gives back a little of what this took. */
  logo: { width: 34, height: 34, flexShrink: 0 },
  labelSub: {
    color: 'rgba(255,255,255,0.6)',
    fontFamily: F600,
    fontSize: 9,
    letterSpacing: 0.2,
    lineHeight: 12,
  },

  // Right: the five A–E squares
  segs: { flexDirection: 'row', alignItems: 'center', gap: 4, flexShrink: 0 },
  // No grade awarded: the scale is still readable, but visibly inactive.
  segsMuted: { opacity: 0.4 },
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
