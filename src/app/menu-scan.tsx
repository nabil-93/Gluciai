import React, { useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Spinner } from '@/components/ui/Spinner';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppButton, BevelCard, ChevronLeft } from '@/components/ui';
import { analyzeMenu } from '@/services/ai';
import { saveMeal } from '@/services/data';
import { sourceLabel } from '@/services/nutrition/engine';
import { scoreMeal, type MealScore } from '@/services/nutrition/mealScore';
import { colors, shadows } from '@/theme';
import type { FoodItemResult } from '@/types';

interface ScoredDish {
  item: FoodItemResult;
  score: MealScore;
}

export default function MenuScanScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const [analyzing, setAnalyzing] = useState(false);
  const [dishes, setDishes] = useState<ScoredDish[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [savedName, setSavedName] = useState<string | null>(null);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const pickAndAnalyze = async () => {
    setError(null);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      base64: true,
      quality: 0.6,
    });
    const asset = picked.assets?.[0];
    if (!asset?.base64) return;

    setAnalyzing(true);
    try {
      const items = await analyzeMenu(asset.base64, i18n.language);
      if (items.length === 0) {
        setError(t('menuScanPage.unreadable'));
        return;
      }
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
        }))
        .sort((a, b) => b.score.score - a.score.score);
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
      source: d.item.source,
      items: [d.item],
      warnings: [],
    });
    setSavedName(d.item.name);
    setTimeout(() => setSavedName(null), 1200);
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 16,
          paddingBottom: 60,
        }}
      >
        <View style={styles.headRow}>
          <Pressable onPress={close} style={styles.backBtn}>
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle}>{t('menuScanPage.title')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {!dishes && !analyzing ? (
          <View style={styles.introWrap}>
            <Text style={{ fontSize: 56 }}>📋</Text>
            <Text style={styles.introTitle}>{t('menuScanPage.introTitle')}</Text>
            <Text style={styles.introSub}>{t('menuScanPage.introSub')}</Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <AppButton
              label={t('menuScanPage.photograph')}
              onPress={pickAndAnalyze}
              style={{ alignSelf: 'stretch', marginTop: 10 }}
            />
          </View>
        ) : null}

        {analyzing ? (
          <View style={styles.introWrap}>
            <Spinner size={34} color={colors.ink} />
            <Text style={styles.introSub}>{t('menuScanPage.reading')}</Text>
          </View>
        ) : null}

        {dishes ? (
          <>
            <Text style={styles.resultCount}>
              {t('menuScanPage.resultCount', { count: dishes.length })}
            </Text>
            <View style={{ gap: 12 }}>
              {dishes.map((d, i) => (
                <BevelCard
                  key={`${d.item.name}-${i}`}
                  noPadding
                  style={
                    i === 0
                      ? [
                          styles.dishCard,
                          { borderWidth: 2, borderColor: d.score.color },
                        ]
                      : styles.dishCard
                  }
                >
                  {i === 0 ? (
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
                      <Text style={[styles.scoreNum, { color: d.score.color }]}>
                        {d.score.score}
                      </Text>
                      <Text style={[styles.scoreLbl, { color: d.score.color }]}>
                        {d.score.label}
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
                      c={
                        (d.item.glycemic_index ?? 0) > 65
                          ? colors.glucoseLow
                          : (d.item.glycemic_index ?? 0) > 55
                            ? colors.glucoseHigh
                            : colors.glucoseInRange
                      }
                    />
                  </View>
                  <Text style={styles.dishReason}>
                    {d.score.reasons[0]}
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
      </ScrollView>
    </View>
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
  introWrap: { alignItems: 'center', gap: 14, paddingVertical: 44, paddingHorizontal: 8 },
  introTitle: {
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  introSub: {
    fontSize: 15,
    lineHeight: 22,
    color: colors.textSecondary,
    textAlign: 'center',
  },
  error: { fontSize: 14, lineHeight: 20, color: colors.danger, textAlign: 'center' },
  resultCount: {
    fontSize: 13.5,
    color: colors.textSecondary,
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
