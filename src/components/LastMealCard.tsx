import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useTranslation } from 'react-i18next';
import Svg, { Circle, Path } from 'react-native-svg';

import { AnimatedRobot, ImageLightbox, ZoomableThumb } from '@/components/ui';
import { scoreMeal } from '@/services/nutrition/mealScore';
import type { MealScan } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/** Macro colours from the design tokens (carbs violet, protein green,
 *  lipids orange) — the same three used across the app's rings and charts. */
const CARBS = '#6D5EF9';
const PROTEIN = '#19C37D';
const LIPIDS = '#FF7A1A';
const KCAL = '#9AA3AF';

const INK = '#141A2E';
const MUTED = '#6B7280';
const GREEN_D = '#0F7A42';

/** The calorie ring: three macro arcs around the kcal total. */
function CalorieRing({ p, c, f, kcal }: { p: number; c: number; f: number; kcal: number }) {
  const size = 74;
  const r = 32;
  const circ = 2 * Math.PI * r;
  const total = Math.max(1, p + c + f);
  const arcs = [
    { frac: c / total, color: CARBS, offset: 0 },
    { frac: p / total, color: PROTEIN, offset: c / total },
    { frac: f / total, color: LIPIDS, offset: (c + p) / total },
  ];
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox="0 0 80 80">
        <Circle cx={40} cy={40} r={r} fill="none" stroke="#EEF1F7" strokeWidth={8} />
        {arcs.map((a, i) => (
          <Circle
            key={i}
            cx={40}
            cy={40}
            r={r}
            fill="none"
            stroke={a.color}
            strokeWidth={8}
            strokeLinecap="round"
            strokeDasharray={`${Math.max(0, a.frac * circ - 3)} ${circ}`}
            transform={`rotate(${-90 + a.offset * 360} 40 40)`}
          />
        ))}
      </Svg>
      <View style={styles.ringCenter}>
        <Text style={styles.ringEmoji}>🔥</Text>
        <Text style={styles.ringValue}>{kcal}</Text>
        <Text style={styles.ringUnit}>kcal</Text>
      </View>
    </View>
  );
}

function MacroLine({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={styles.macroLine}>
      <View style={[styles.macroDot, { backgroundColor: color }]} />
      <Text style={styles.macroLabel} numberOfLines={1}>
        {label}
      </Text>
      <Text style={styles.macroValue}>{value}</Text>
    </View>
  );
}

/**
 * Recap of the most recently scanned meal, shown on the home screen under the
 * breakfast / lunch / dinner slots. It exists so the last scan does not
 * disappear the moment the patient leaves the analysis screen: the photo, the
 * macros, the quality score and one AI tip stay one tap away, and "see
 * details" reopens the full report.
 *
 * Rendered only once something has actually been scanned.
 */
export function LastMealCard({ meal, onPress }: { meal: MealScan; onPress: () => void }) {
  const { t, i18n } = useTranslation();
  const [lightbox, setLightbox] = useState(false);
  const r = meal.result;

  const P = Math.round(r.protein);
  const C = Math.round(r.carbohydrates);
  const F = Math.round(r.fat);
  const kcal = Math.round(r.calories);

  // Same scorer the analysis page uses, so the number never disagrees.
  const quality = useMemo(
    () =>
      scoreMeal({
        calories: r.calories,
        carbs: r.carbohydrates,
        sugar: r.sugar,
        protein: r.protein,
        fat: r.fat,
        fiber: r.fiber,
        sodium: r.sodium,
        glycemic_index: r.glycemic_index,
      }),
    [r]
  );

  // The engine's stored highlight KEYS, localized here (positives come first).
  const summary = (r.highlights ?? [])
    .slice(0, 2)
    .map((k) => t(`insights.highlights.${k}`))
    .join(' · ');
  const tip = quality.reasons[0] ?? summary;

  const time = new Date(meal.created_at).toLocaleTimeString(i18n.language, {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <View style={styles.card}>
      {/* Header — the confirmation, and the way back into the full report */}
      <View style={styles.head}>
        <View style={styles.check}>
          <Svg width={15} height={15} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
            <Path d="M20 6 9 17l-5-5" />
          </Svg>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={1}>
            {t('lastMeal.title')}
          </Text>
          {/* Two lines: German ("Hier ist die Analyse deiner Mahlzeit") needs
              178 px where the header leaves 136 — one line truncated it. */}
          <Text style={styles.subtitle} numberOfLines={2}>
            {t('lastMeal.subtitle')}
          </Text>
        </View>
        <Pressable style={styles.detailBtn} onPress={onPress} accessibilityRole="button" hitSlop={6}>
          <Text style={styles.detailText} numberOfLines={1}>
            {t('lastMeal.detail')}
          </Text>
          <Svg width={13} height={13} viewBox="0 0 24 24" fill="none" stroke={GREEN_D} strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round">
            <Path d="m9 18 6-6-6-6" />
          </Svg>
        </Pressable>
      </View>

      {/* Photo + name + macros. The thumbnail is 62 px — too small to check
          the meal against the numbers beside it — so it opens full-screen. */}
      <View style={styles.body}>
        {meal.image_url ? (
          <ZoomableThumb style={styles.photo} onPress={() => setLightbox(true)} label={r.food_name}>
            <Image source={{ uri: meal.image_url }} style={StyleSheet.absoluteFill} contentFit="cover" />
          </ZoomableThumb>
        ) : (
          <View style={styles.photo}>
            <Text style={{ fontSize: 24 }}>🍽️</Text>
          </View>
        )}
        <View style={{ flex: 1, minWidth: 0, gap: 5 }}>
          <Text style={styles.mealName} numberOfLines={2}>
            {r.food_name}
          </Text>
          <Text style={styles.mealMeta} numberOfLines={1}>
            {time}
            {meal.meal_type ? ` · ${t(`mealType.${meal.meal_type}`)}` : ''}
          </Text>
        </View>
      </View>

      <View style={styles.macroGrid}>
        <MacroLine color={CARBS} label={t('result.carbs')} value={`${C} g`} />
        <MacroLine color={PROTEIN} label={t('result.protein')} value={`${P} g`} />
        <MacroLine color={LIPIDS} label={t('result.fat')} value={`${F} g`} />
        <MacroLine color={KCAL} label={t('result.calories')} value={`${kcal} kcal`} />
      </View>

      {/* Score + calorie ring */}
      <View style={styles.statsRow}>
        <View style={styles.scoreBox}>
          <View style={styles.scoreValRow}>
            <Text style={[styles.scoreVal, { color: quality.textColor }]}>{quality.score}</Text>
            <Text style={styles.scoreDenom}>/100</Text>
          </View>
          <Text style={[styles.scoreLabel, { color: quality.textColor }]} numberOfLines={1}>
            {quality.label}
          </Text>
          {summary ? (
            <Text style={styles.scoreSummary} numberOfLines={2}>
              {summary}
            </Text>
          ) : null}
        </View>
        <CalorieRing p={P} c={C} f={F} kcal={kcal} />
      </View>

      {/* One AI line — the same advice the analysis page opens with */}
      {tip ? (
        <View style={styles.tipRow}>
          <AnimatedRobot size={26} mood="happy" />
          <Text style={styles.tipText} numberOfLines={3}>
            <Text style={styles.tipLabel}>{t('lastMeal.tip')} : </Text>
            {tip}
          </Text>
        </View>
      ) : null}

      <ImageLightbox
        uri={meal.image_url}
        visible={lightbox}
        onClose={() => setLightbox(false)}
        caption={r.food_name}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderRadius: 22,
    padding: 14,
    gap: 12,
    marginTop: 14,
    shadowColor: 'rgba(20,20,30,1)',
    shadowOpacity: 0.05,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 4 },
    elevation: 2,
  },

  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  check: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#19C37D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 14.5, fontFamily: F800, color: INK },
  subtitle: { fontSize: 11, lineHeight: 14.5, fontFamily: F500, color: MUTED, marginTop: 1 },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EAF7EF',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 11,
    flexShrink: 1,
  },
  detailText: { fontSize: 11, fontFamily: F700, color: GREEN_D },

  body: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  photo: {
    width: 62,
    height: 62,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#F1F3F8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealName: { fontSize: 13.5, fontFamily: F800, color: INK, lineHeight: 18 },
  mealMeta: { fontSize: 11, fontFamily: F600, color: MUTED },

  macroGrid: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 8, columnGap: 10 },
  macroLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexGrow: 1,
    flexBasis: '44%',
    minWidth: 0,
  },
  macroDot: { width: 7, height: 7, borderRadius: 4 },
  macroLabel: { flex: 1, fontSize: 11.5, fontFamily: F600, color: MUTED },
  macroValue: { fontSize: 12, fontFamily: F800, color: INK },

  statsRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  scoreBox: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1.5,
    borderColor: '#EEF1F7',
    borderRadius: 16,
    paddingVertical: 11,
    paddingHorizontal: 12,
    gap: 1,
  },
  scoreValRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
  scoreVal: { fontSize: 26, fontFamily: F800, letterSpacing: -0.6 },
  scoreDenom: { fontSize: 11, fontFamily: F700, color: MUTED },
  scoreLabel: { fontSize: 12, fontFamily: F800 },
  scoreSummary: { fontSize: 10.5, lineHeight: 14.5, fontFamily: F500, color: MUTED, marginTop: 2 },

  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringEmoji: { fontSize: 12, marginBottom: -1 },
  ringValue: { fontSize: 16, fontFamily: F800, color: INK, lineHeight: 19 },
  ringUnit: { fontSize: 8.5, fontFamily: F600, color: MUTED, marginTop: -2 },

  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: '#F3FBF6',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 11,
  },
  tipText: { flex: 1, minWidth: 0, fontSize: 11, lineHeight: 15.5, color: '#2F5D43', fontFamily: F500 },
  tipLabel: { fontFamily: F800, color: GREEN_D },
});
