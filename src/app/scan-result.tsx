import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AnimatedCounter,
  AppButton,
  BevelCard,
  CloseGlyph,
  FadeInView,
} from '@/components/ui';
import { computeBolus, saveMeal } from '@/services/data';
import {
  SOURCE_LABEL,
  aggregateItems,
  rescaleItem,
} from '@/services/nutrition/engine';
import { recordCorrection } from '@/services/nutrition/learning';
import { scoreMeal } from '@/services/nutrition/mealScore';
import { clearPendingScan, getPendingScan } from '@/services/scanSession';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';
import type { FoodItemResult, NutritionSource } from '@/types';

const SOURCE_COLOR: Record<NutritionSource, string> = {
  moroccan_db: colors.primary,
  usda: colors.ai,
  openfoodfacts: colors.carbs,
  ai_estimate: colors.textSecondary,
};

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function ScanResultScreen() {
  const router = useRouter();
  const profile = useAppStore((s) => s.profile);
  const glucoseLogs = useAppStore((s) => s.glucoseLogs);
  const insets = useSafeAreaInsets();
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  // Stable snapshot of the scan for this screen's lifetime
  const [pending] = useState(() => getPendingScan());
  // Editable copy of items — the user can correct portions (Learning AI)
  const [items, setItems] = useState<FoodItemResult[]>(
    () => pending?.result.items ?? []
  );

  if (!pending) return <Redirect href="/(tabs)" />;

  const { imageUri } = pending;
  const originalItems = pending.result.items ?? [];
  // Recompute totals live from the (possibly edited) items
  const result = items.length > 0 ? aggregateItems(items) : pending.result;

  const lastGlucose = glucoseLogs.find((g) => isToday(g.created_at));
  const bolus = computeBolus(
    result.carbohydrates,
    lastGlucose?.value ?? null,
    profile
  );
  const quality = scoreMeal({
    calories: result.calories,
    carbs: result.carbohydrates,
    sugar: result.sugar,
    protein: result.protein,
    fat: result.fat,
    fiber: result.fiber,
    sodium: result.sodium,
    glycemic_index: result.glycemic_index,
  });

  const gi = Math.round(result.glycemic_index);
  const giColor =
    gi > 70 ? colors.glucoseLow : gi > 55 ? colors.glucoseHigh : colors.glucoseInRange;
  const giLabel = gi > 70 ? 'Élevé' : gi > 55 ? 'Modéré' : 'Bas';

  const adjustPortion = (index: number, delta: number) => {
    setItems((prev) =>
      prev.map((it, i) =>
        i === index
          ? rescaleItem(it, Math.max(10, it.portion_grams + delta))
          : it
      )
    );
  };

  /** Learning AI: store the user's portion corrections separately. */
  const saveCorrections = () => {
    items.forEach((it, i) => {
      const original = originalItems[i];
      if (original && Math.abs(original.portion_grams - it.portion_grams) >= 5) {
        recordCorrection(
          it.name,
          'portion',
          original.portion_grams,
          it.portion_grams
        );
      }
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      saveCorrections();
      await saveMeal(result, imageUri);
      setSaved(true);
      setTimeout(() => {
        clearPendingScan();
        router.replace('/(tabs)');
      }, 700);
    } finally {
      setSaving(false);
    }
  };

  const goBolus = async () => {
    // Save the meal first so the calculator can prefill its carbs
    saveCorrections();
    await saveMeal(result, imageUri);
    clearPendingScan();
    router.replace('/bolus');
  };

  const discard = () => {
    clearPendingScan();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 40 }}
      >
        {/* ── Photo hero ── */}
        <View style={styles.hero}>
          {imageUri ? (
            <Image
              source={{ uri: imageUri }}
              style={StyleSheet.absoluteFill}
              contentFit="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, styles.heroFallback]}>
              <Text style={{ fontSize: 64 }}>🍽️</Text>
            </View>
          )}
          {/* Bottom gradient for legibility */}
          <LinearGradient
            colors={['transparent', 'rgba(10,10,14,0.75)']}
            style={styles.heroGradient}
          />
          {/* Food name on the photo */}
          <View style={styles.heroText}>
            <Text style={styles.foodName}>{result.food_name}</Text>
            <Text style={styles.portion}>{result.estimated_portion}</Text>
          </View>
          {/* Confidence badges */}
          <View style={[styles.confidence, { top: insets.top + 12 }]}>
            <Text style={styles.confidenceText}>
              👁️ Détection {Math.round(result.confidence * 100)}%
              {result.nutrition_confidence
                ? `  ·  📊 Nutrition ${Math.round(result.nutrition_confidence * 100)}%`
                : ''}
            </Text>
          </View>
          {/* Close */}
          <Pressable
            onPress={discard}
            style={[styles.closeBtn, { top: insets.top + 12 }]}
          >
            <CloseGlyph size={16} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.body}>
          {/* ── Calories — the big number, counts up on open ── */}
          <FadeInView>
            <View style={styles.kcalCard}>
              <View style={{ flex: 1 }}>
                <Text style={styles.kcalLabel}>Calories</Text>
                <View style={styles.kcalRow}>
                  <AnimatedCounter
                    value={result.calories}
                    style={styles.kcalValue}
                  />
                  <Text style={styles.kcalUnit}>kcal</Text>
                </View>
              </View>
              <View style={styles.kcalDivider} />
              <View style={{ flex: 1 }}>
                <Text style={styles.kcalLabel}>Glucides</Text>
                <View style={styles.kcalRow}>
                  <AnimatedCounter
                    value={result.carbohydrates}
                    style={[styles.kcalValue, { color: colors.carbs }]}
                  />
                  <Text style={styles.kcalUnit}>g</Text>
                </View>
              </View>
            </View>
          </FadeInView>

          {/* ── Meal Quality Score ── */}
          <FadeInView delay={120}>
          <View style={[styles.scoreCard, { borderColor: quality.color }]}>
            <View style={styles.scoreHead}>
              <View>
                <Text style={styles.scoreLabel}>Score du repas</Text>
                <Text style={[styles.scoreValue, { color: quality.color }]}>
                  {quality.score}
                  <Text style={styles.scoreMax}>/100</Text>
                </Text>
              </View>
              <View
                style={[styles.scoreBadge, { backgroundColor: quality.color }]}
              >
                <Text style={styles.scoreBadgeText}>{quality.label}</Text>
              </View>
            </View>
            {quality.reasons.slice(0, 3).map((r, i) => (
              <Text key={i} style={styles.scoreReason}>
                • {r}
              </Text>
            ))}
          </View>
          </FadeInView>

          {/* ── Per-food breakdown: source + editable portions ── */}
          {items.length > 0 ? (
            <BevelCard noPadding style={{ marginTop: 12 }}>
              <Text style={styles.itemsTitle}>
                Aliments détectés ({items.length})
              </Text>
              <Text style={styles.itemsHint}>
                Corrigez les portions — l'IA apprend de vos habitudes.
              </Text>
              {items.map((it, i) => (
                <View
                  key={`${it.name}-${i}`}
                  style={[
                    styles.itemRow,
                    i < items.length - 1 && styles.itemBorder,
                  ]}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.itemName} numberOfLines={1}>
                      {it.name}
                    </Text>
                    <Text style={styles.itemDetail}>
                      {it.calories} kcal · {Math.round(it.carbohydrates)} g
                      gluc.
                    </Text>
                    <View
                      style={[
                        styles.sourceBadge,
                        { backgroundColor: `${SOURCE_COLOR[it.source]}1A` },
                      ]}
                    >
                      <View
                        style={[
                          styles.sourceDot,
                          { backgroundColor: SOURCE_COLOR[it.source] },
                        ]}
                      />
                      <Text
                        style={[
                          styles.sourceText,
                          { color: SOURCE_COLOR[it.source] },
                        ]}
                      >
                        {SOURCE_LABEL[it.source]} ·{' '}
                        {Math.round(it.nutrition_confidence * 100)}%
                      </Text>
                    </View>
                  </View>
                  {/* Portion editor */}
                  <View style={styles.portionEditor}>
                    <Pressable
                      onPress={() => adjustPortion(i, -10)}
                      style={styles.portionBtn}
                      hitSlop={6}
                    >
                      <Text style={styles.portionBtnText}>−</Text>
                    </Pressable>
                    <View style={styles.portionValueWrap}>
                      <Text style={styles.portionValue}>
                        {Math.round(it.portion_grams)}
                      </Text>
                      <Text style={styles.portionUnit}>g</Text>
                    </View>
                    <Pressable
                      onPress={() => adjustPortion(i, 10)}
                      style={styles.portionBtn}
                      hitSlop={6}
                    >
                      <Text style={styles.portionBtnText}>+</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </BevelCard>
          ) : null}

          {/* ── Macro grid ── */}
          <View style={styles.grid}>
            <Metric label="Sucre" value={Math.round(result.sugar)} unit="g" color={colors.protein} />
            <Metric label="Protéines" value={Math.round(result.protein)} unit="g" color={colors.ai} />
            <Metric label="Lipides" value={Math.round(result.fat)} unit="g" color={colors.lipids} />
            <Metric label="Fibres" value={Math.round(result.fiber)} unit="g" color={colors.primary} />
            {result.sodium ? (
              <Metric label="Sodium" value={result.sodium} unit="mg" color={colors.textSecondary} />
            ) : null}
          </View>

          {/* ── Nutrition source of totals ── */}
          {result.source ? (
            <View style={styles.totalsSource}>
              <Text style={styles.totalsSourceText}>
                Source nutritionnelle : {SOURCE_LABEL[result.source]}
              </Text>
            </View>
          ) : null}

          {/* ── Glycemic index (when available) ── */}
          {gi > 0 ? (
          <BevelCard style={{ marginTop: 12 }}>
            <View style={styles.giHead}>
              <Text style={styles.giTitle}>Index glycémique</Text>
              <View style={[styles.giBadge, { backgroundColor: `${giColor}22` }]}>
                <Text style={[styles.giBadgeText, { color: giColor }]}>
                  {giLabel}
                </Text>
              </View>
            </View>
            <View style={styles.giTrack}>
              <View
                style={[
                  styles.giFill,
                  { width: `${Math.min(100, gi)}%`, backgroundColor: giColor },
                ]}
              />
            </View>
            <View style={styles.giScale}>
              <Text style={styles.giScaleText}>0</Text>
              <Text style={styles.giScaleText}>55</Text>
              <Text style={styles.giScaleText}>70</Text>
              <Text style={styles.giScaleText}>100</Text>
            </View>
            {gi > 55 ? (
              <Text style={styles.giHint}>
                Cet aliment peut faire monter votre glycémie rapidement —
                pensez à mesurer 2 h après le repas.
              </Text>
            ) : null}
          </BevelCard>
          ) : null}

          {/* ── Insulin estimation ── */}
          <View style={styles.bolusCard}>
            <Text style={styles.bolusLabel}>Dose estimée pour ce repas</Text>
            <View style={styles.bolusRow}>
              <Text style={styles.bolusValue}>
                ≈ {bolus.total.toLocaleString('fr-FR')}
              </Text>
              <Text style={styles.bolusUnit}>U</Text>
            </View>
            <Text style={styles.bolusDetail}>
              {Math.round(result.carbohydrates)} g ÷ ratio {bolus.ratio}
              {bolus.correction > 0
                ? ` + correction ${bolus.correction} U (glycémie ${lastGlucose?.value})`
                : ''}
            </Text>
            <Text style={styles.disclaimer}>
              Estimation éducative IA uniquement — ceci n'est PAS un avis
              médical. Vérifiez toujours la dose avec votre médecin.
            </Text>
          </View>

          {/* ── Warnings ── */}
          {result.warnings.length > 0 ? (
            <View style={styles.warnCard}>
              {result.warnings.map((w, i) => (
                <Text key={i} style={styles.warnText}>
                  ⚠️ {w}
                </Text>
              ))}
            </View>
          ) : null}

          {/* ── Actions ── */}
          <View style={{ gap: 10, marginTop: 16 }}>
            <AppButton
              label={saved ? '✓ Repas enregistré' : 'Enregistrer le repas'}
              onPress={save}
              loading={saving}
              disabled={saved}
            />
            <AppButton
              label="Enregistrer + calculer le bolus"
              onPress={goBolus}
              variant="secondary"
            />
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function Metric({
  label,
  value,
  unit,
  color,
}: {
  label: string;
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <BevelCard style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <View style={styles.metricRow}>
        <Text style={[styles.metricValue, { color }]}>{value}</Text>
        <Text style={styles.metricUnit}>{unit}</Text>
      </View>
    </BevelCard>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },

  hero: {
    height: 340,
    backgroundColor: '#DADAE0',
    overflow: 'hidden',
  },
  heroFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface2,
  },
  heroGradient: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 140,
  },
  heroText: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 34,
  },
  foodName: {
    fontSize: 28,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: -0.5,
  },
  portion: { marginTop: 4, fontSize: 15, color: 'rgba(255,255,255,0.75)' },
  confidence: {
    position: 'absolute',
    left: 16,
    backgroundColor: 'rgba(10,10,14,0.55)',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  confidenceText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(10,10,14,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  body: {
    marginTop: -22,
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    backgroundColor: colors.background,
    paddingHorizontal: 16,
    paddingTop: 20,
  },

  kcalCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 20,
    ...shadows.card,
  },
  kcalLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  kcalRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 4 },
  kcalValue: {
    fontSize: 40,
    fontWeight: '800',
    color: colors.warning,
    letterSpacing: -1,
  },
  kcalUnit: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  kcalDivider: { width: 1, height: 52, backgroundColor: '#F0F0F3', marginHorizontal: 16 },

  scoreCard: {
    marginTop: 12,
    backgroundColor: colors.surface,
    borderRadius: 24,
    borderWidth: 2,
    padding: 18,
    ...shadows.card,
  },
  scoreHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  scoreLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  scoreValue: { marginTop: 2, fontSize: 40, fontWeight: '800', letterSpacing: -1 },
  scoreMax: { fontSize: 18, fontWeight: '600', color: colors.textTertiary },
  scoreBadge: { borderRadius: 999, paddingVertical: 8, paddingHorizontal: 16 },
  scoreBadgeText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  scoreReason: {
    fontSize: 13.5,
    lineHeight: 20,
    color: '#3E3E44',
  },

  itemsTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  itemsHint: {
    fontSize: 12.5,
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 2,
    paddingBottom: 6,
  },
  portionEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  portionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portionBtnText: { fontSize: 18, fontWeight: '700', color: colors.text, lineHeight: 20 },
  portionValueWrap: { alignItems: 'center', minWidth: 44 },
  portionValue: { fontSize: 17, fontWeight: '800', color: colors.text },
  portionUnit: { fontSize: 10, color: colors.textTertiary },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  itemBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F0F3' },
  itemName: { fontSize: 15.5, fontWeight: '650' as any, color: colors.text },
  itemDetail: { marginTop: 2, fontSize: 13, color: colors.textSecondary },
  sourceBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 6,
  },
  sourceDot: { width: 6, height: 6, borderRadius: 3 },
  sourceText: { fontSize: 11.5, fontWeight: '700' },
  itemConf: { alignItems: 'flex-end' },
  itemConfValue: { fontSize: 14, fontWeight: '800', color: colors.text },
  itemConfLabel: { fontSize: 10, color: colors.textTertiary },
  totalsSource: {
    marginTop: 10,
    alignItems: 'center',
  },
  totalsSourceText: { fontSize: 12.5, color: colors.textSecondary },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  metric: { flexBasis: '47%', flexGrow: 1, paddingVertical: 14 },
  metricLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary },
  metricRow: { flexDirection: 'row', alignItems: 'baseline', gap: 4, marginTop: 4 },
  metricValue: { fontSize: 24, fontWeight: '800' },
  metricUnit: { fontSize: 13, color: colors.textSecondary },

  giHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  giTitle: { fontSize: 16, fontWeight: '650' as any, color: colors.text },
  giBadge: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  giBadgeText: { fontSize: 13, fontWeight: '700' },
  giTrack: {
    marginTop: 14,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  giFill: { height: '100%', borderRadius: 4 },
  giScale: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
  },
  giScaleText: { fontSize: 11.5, color: colors.textTertiary },
  giHint: {
    marginTop: 10,
    fontSize: 13,
    lineHeight: 18,
    color: colors.textSecondary,
  },

  bolusCard: {
    marginTop: 12,
    backgroundColor: colors.ink,
    borderRadius: 24,
    padding: 20,
    ...shadows.floating,
  },
  bolusLabel: { fontSize: 14, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  bolusRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  bolusValue: { fontSize: 44, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  bolusUnit: { fontSize: 20, fontWeight: '700', color: 'rgba(255,255,255,0.7)' },
  bolusDetail: { marginTop: 6, fontSize: 13, color: 'rgba(255,255,255,0.55)' },
  disclaimer: {
    marginTop: 10,
    fontSize: 11.5,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.4)',
  },

  warnCard: {
    marginTop: 12,
    backgroundColor: colors.warningDim,
    borderRadius: 18,
    padding: 16,
    gap: 6,
  },
  warnText: { fontSize: 13.5, lineHeight: 19, color: '#B45D22' },
});
