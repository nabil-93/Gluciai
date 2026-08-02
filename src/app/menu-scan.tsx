import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Spinner } from '@/components/ui/Spinner';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { AppButton, BevelCard, FadeInView, HeroScreen, HERO_INK, HERO_MUTED } from '@/components/ui';
import { analyzeMenu } from '@/services/ai';
import { saveMeal } from '@/services/data';
import { sourceLabel } from '@/services/nutrition/engine';
import {
  giBand,
  isCarbKnown,
  qualityClaimSupported,
  scoreMeal,
  type MealScore,
} from '@/services/nutrition/interpret';
import { colors, shadows } from '@/theme';
import type { FoodItemResult } from '@/types';

interface ScoredDish {
  item: FoodItemResult;
  score: MealScore;
  /** False when the dish carries nothing a verdict could rest on (Step 22A). */
  rated: boolean;
}

export default function MenuScanScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [analyzing, setAnalyzing] = useState(false);
  const [dishes, setDishes] = useState<ScoredDish[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);
  /** The AI's answer was cut off: dishes it had listed are missing from the
   *  list below, so it must not be presented as the whole menu. */
  const [incomplete, setIncomplete] = useState(false);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const pickAndAnalyze = async () => {
    setError(null);
    setIncomplete(false);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.6,
    });
    const asset = picked.assets?.[0];
    if (!asset?.base64) return;

    setAnalyzing(true);
    try {
      const { dishes: items, incomplete: cutOff } = await analyzeMenu(
        asset.base64,
        i18n.language
      );
      if (items.length === 0) {
        setError(t('menuScanPage.unreadable'));
        return;
      }
      setIncomplete(cutOff);
      const scored: ScoredDish[] = items
        .map((item) => ({
          item,
          score: scoreMeal({
            calories: item.calories,
            carbs: item.carbohydrates,
            sugar: item.sugar,
            protein: item.protein,
            fat: item.fat,
            fiber: item.fiber,
            sodium: item.sodium,
            glycemic_index: item.glycemic_index,
          }),
          // A dish the model returned no figures for scores 100 out of sheer
          // absence — and this list is SORTED by that score, so it took the top
          // slot and the "best choice" badge (Step 22A). Unrated dishes keep
          // their place in the menu but carry no number and rank last.
          rated: qualityClaimSupported({
            calories: item.calories,
            carbs_known: isCarbKnown(item),
          }),
        }))
        .sort((a, b) => {
          if (a.rated !== b.rated) return a.rated ? -1 : 1;
          return b.score.score - a.score.score;
        });
      setDishes(scored);
    } catch {
      setError(t('menuScanPage.analysisError'));
    } finally {
      setAnalyzing(false);
    }
  };

  const saveDish = async (d: ScoredDish) => {
    await saveMeal({
      food_name: d.item.name,
      estimated_portion: `${Math.round(d.item.portion_grams)} g`,
      calories: d.item.calories,
      carbohydrates: d.item.carbohydrates,
      sugar: d.item.sugar,
      protein: d.item.protein,
      fat: d.item.fat,
      fiber: d.item.fiber,
      sodium: d.item.sodium,
      glycemic_index: d.item.glycemic_index ?? 0,
      confidence: d.item.detection_confidence,
      nutrition_confidence: d.item.nutrition_confidence,
      // One dish, resolved through the provider chain: the plate's provenance
      // is exactly that dish's.
      carbs_known: isCarbKnown(d.item),
      source: d.item.source,
      items: [d.item],
      warnings: [],
    });
    setSavedName(d.item.name);
    setTimeout(() => setSavedName(null), 1200);
  };

  return (
    <HeroScreen
      title={t('menuScanPage.title')}
      glyph="menu"
      tint="#6D5EF9"
      onClose={close}
      height={210}
    >

        {!dishes && !analyzing ? (
          <FadeInView>
            <View style={styles.introCard}>
              <Text style={styles.introTitle}>{t('menuScanPage.introTitle')}</Text>
              <Text style={styles.introSub}>{t('menuScanPage.introSub')}</Text>
              {error ? <Text style={styles.error}>{error}</Text> : null}
              <AppButton
                label={t('menuScanPage.photograph')}
                onPress={pickAndAnalyze}
                style={{ alignSelf: 'stretch', marginTop: 16 }}
              />
            </View>
          </FadeInView>
        ) : null}

        {analyzing ? (
          <View style={styles.loadingWrap}>
            <Spinner size={34} color={colors.ink} />
            <Text style={styles.introSub}>{t('menuScanPage.reading')}</Text>
          </View>
        ) : null}

        {dishes ? (
          <>
            <Text style={styles.resultCount}>
              {t('menuScanPage.resultCount', { count: dishes.length })}
            </Text>
            {incomplete ? (
              <Text style={styles.incomplete}>{t('menuScanPage.incomplete')}</Text>
            ) : null}
            <View style={{ gap: 12 }}>
              {dishes.map((d, i) => (
                <BevelCard
                  key={`${d.item.name}-${i}`}
                  noPadding
                  style={
                    i === 0 && d.rated
                      ? [
                          styles.dishCard,
                          { borderWidth: 2, borderColor: d.score.color },
                        ]
                      : styles.dishCard
                  }
                >
                  {i === 0 && d.rated ? (
                    <View style={[styles.bestBadge, { backgroundColor: d.score.color }]}>
                      <Text style={styles.bestBadgeText}>
                        {t('menuScanPage.bestChoice')}
                      </Text>
                    </View>
                  ) : null}
                  <View style={styles.dishHead}>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.dishName}>{d.item.name}</Text>
                      <Text style={styles.dishPortion}>
                        {Math.round(d.item.portion_grams)} g ·{' '}
                        {sourceLabel(d.item.source)}
                      </Text>
                    </View>
                    <View style={styles.scoreWrap}>
                      <Text
                        style={[
                          styles.scoreNum,
                          { color: d.rated ? d.score.color : colors.textTertiary },
                        ]}
                      >
                        {d.rated ? d.score.score : '—'}
                      </Text>
                      <Text
                        style={[
                          styles.scoreLbl,
                          { color: d.rated ? d.score.color : colors.textTertiary },
                        ]}
                      >
                        {d.rated ? d.score.label : t('analysis.scoreUnavailable')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.dishMacros}>
                    <Macro v={d.item.calories} u="kcal" c={colors.warning} />
                    <Macro v={Math.round(d.item.carbohydrates)} u={t('foodsPage.unitCarbs')} c={colors.carbs} />
                    <Macro v={Math.round(d.item.sugar)} u={t('foodsPage.unitSugar')} c={colors.protein} />
                    <Macro v={Math.round(d.item.protein)} u={t('menuScanPage.unitProt')} c={colors.ai} />
                    <Macro v={Math.round(d.item.fat)} u={t('menuScanPage.unitFat')} c={colors.lipids} />
                    <Macro
                      v={d.item.glycemic_index ?? '—'}
                      u="IG"
                      /* The app's ONE glycemic-index classification (Step 22A).
                         This chip used to redden from 66, where the shared
                         GI meter on every other screen still reads "moderate";
                         the colours and their order are unchanged. */
                      c={
                        {
                          high: colors.glucoseLow,
                          medium: colors.glucoseHigh,
                          low: colors.glucoseInRange,
                        }[giBand(d.item.glycemic_index ?? 0)]
                      }
                    />
                  </View>
                  <Text style={styles.dishReason}>
                    {d.rated ? d.score.reasons[0] : t('analysis.scoreUnavailableNoData')}
                  </Text>
                  <Pressable
                    onPress={() => saveDish(d)}
                    style={styles.dishSave}
                  >
                    <Text style={styles.dishSaveText}>
                      {savedName === d.item.name
                        ? t('menuScanPage.savedToJournal')
                        : t('menuScanPage.orderedSave')}
                    </Text>
                  </Pressable>
                </BevelCard>
              ))}
            </View>
            <AppButton
              label={t('menuScanPage.scanAnother')}
              variant="secondary"
              onPress={() => {
                setDishes(null);
                setError(null);
              }}
              style={{ marginTop: 16 }}
            />
          </>
        ) : null}
    </HeroScreen>
  );
}

function Macro({ v, u, c }: { v: number | string; u: string; c: string }) {
  return (
    <View style={styles.macro}>
      <Text style={[styles.macroV, { color: c }]}>{v}</Text>
      <Text style={styles.macroU}>{u}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headTitle: { fontSize: 19, fontWeight: '750' as any, color: colors.text },
  introCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 22,
    alignItems: 'center',
    gap: 8,
    ...shadows.card,
  },
  loadingWrap: { alignItems: 'center', gap: 14, paddingVertical: 44 },
  introTitle: {
    fontFamily: 'PlusJakartaSans_800ExtraBold',
    fontSize: 19,
    color: HERO_INK,
    textAlign: 'center',
  },
  introSub: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13.5,
    lineHeight: 20,
    color: HERO_MUTED,
    textAlign: 'center',
  },
  error: { fontSize: 14, lineHeight: 20, color: colors.danger, textAlign: 'center' },
  resultCount: {
    fontSize: 13.5,
    color: colors.textSecondary,
    marginBottom: 12,
    marginHorizontal: 2,
  },
  incomplete: {
    fontSize: 13,
    lineHeight: 18,
    color: colors.warning,
    marginTop: -6,
    marginBottom: 12,
    marginHorizontal: 2,
  },
  dishCard: { overflow: 'hidden' },
  bestBadge: { paddingVertical: 8, alignItems: 'center' },
  bestBadgeText: { color: '#fff', fontSize: 13, fontWeight: '800' },
  dishHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  dishName: { fontSize: 16.5, fontWeight: '750' as any, color: colors.text },
  dishPortion: { marginTop: 2, fontSize: 12.5, color: colors.textSecondary },
  scoreWrap: { alignItems: 'center' },
  scoreNum: { fontSize: 26, fontWeight: '800' },
  scoreLbl: { fontSize: 11, fontWeight: '700' },
  dishMacros: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 12,
  },
  macro: { flex: 1, alignItems: 'center' },
  macroV: { fontSize: 15, fontWeight: '800' },
  macroU: { marginTop: 1, fontSize: 10, color: colors.textSecondary },
  dishReason: {
    fontSize: 12.5,
    lineHeight: 17,
    color: colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  dishSave: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F3',
    paddingVertical: 12,
    alignItems: 'center',
  },
  dishSaveText: { fontSize: 14, fontWeight: '650' as any, color: colors.ai },
});
