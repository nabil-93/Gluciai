import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BevelCard, ChevronLeft, SearchGlyph } from '@/components/ui';
import i18n from '@/i18n';
import { filterMoroccanFoods, type MoroccanFood } from '@/data/moroccanFoods';
import { saveMeal } from '@/services/data';
import { colors, shadows } from '@/theme';
import type { NutritionResult } from '@/types';

const PORTIONS = [
  { label: '½', factor: 0.5 },
  { label: '1', factor: 1 },
  { label: '1½', factor: 1.5 },
  { label: '2', factor: 2 },
];

function toResult(food: MoroccanFood, factor: number): NutritionResult {
  const r = (n: number) => Math.round(n * factor);
  const gi = food.glycemic_index ?? 0;
  return {
    food_name: food.name_fr,
    estimated_portion:
      factor === 1 ? food.serving_size : `${factor} × ${food.serving_size}`,
    calories: r(food.calories),
    carbohydrates: r(food.carbs),
    sugar: r(food.sugar),
    protein: r(food.protein),
    fat: r(food.fat),
    fiber: r(food.fiber),
    sodium: r(food.sodium),
    glycemic_index: gi,
    confidence: 1,
    nutrition_confidence: 0.92,
    source: 'moroccan_db',
    items: [
      {
        name: food.name_fr,
        portion_grams: Math.round(food.serving_grams * factor),
        calories: r(food.calories),
        carbohydrates: r(food.carbs),
        sugar: r(food.sugar),
        protein: r(food.protein),
        fat: r(food.fat),
        fiber: r(food.fiber),
        sodium: r(food.sodium),
        glycemic_index: food.glycemic_index,
        source: 'moroccan_db',
        detection_confidence: 1,
        nutrition_confidence: 0.92,
      },
    ],
    warnings: gi > 65 ? [i18n.t('foodsPage.highGiWarning')] : [],
  };
}

export default function FoodsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const [factor, setFactor] = useState(1);
  const [savedId, setSavedId] = useState<string | null>(null);

  const list = useMemo(() => filterMoroccanFoods(query), [query]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const add = async (food: MoroccanFood, thenBolus: boolean) => {
    await saveMeal(toResult(food, factor));
    setSavedId(food.id);
    setTimeout(() => {
      if (thenBolus) {
        router.replace('/bolus');
      } else {
        setSavedId(null);
        setOpenId(null);
      }
    }, 600);
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
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headRow}>
          <Pressable onPress={close} style={styles.backBtn}>
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle}>{t('foodsPage.title')}</Text>
          <View style={{ width: 36 }} />
        </View>

        <Text style={styles.subtitle}>{t('foodsPage.subtitle')}</Text>

        <View style={styles.search}>
          <SearchGlyph />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('foodsPage.searchPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            style={styles.searchInput}
          />
        </View>

        <View style={{ gap: 10, marginTop: 16 }}>
          {list.map((f) => {
            const isOpen = openId === f.id;
            const scaled = toResult(f, factor);
            return (
              <BevelCard key={f.id} noPadding style={styles.card}>
                <Pressable
                  style={styles.cardHead}
                  onPress={() => {
                    setOpenId(isOpen ? null : f.id);
                    setFactor(1);
                    setSavedId(null);
                  }}
                >
                  <Text style={{ fontSize: 26 }}>{f.emoji}</Text>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.foodName}>{f.name_fr}</Text>
                    <Text style={styles.foodAr}>{f.name_ar}</Text>
                    <Text style={styles.foodPortion}>{f.serving_size}</Text>
                  </View>
                  <View style={styles.carbsBadge}>
                    <Text style={styles.carbsBadgeValue}>{f.carbs}g</Text>
                    <Text style={styles.carbsBadgeLabel}>{t('foodsPage.carbs')}</Text>
                  </View>
                </Pressable>

                {isOpen ? (
                  <View style={styles.detail}>
                    {/* Portion selector */}
                    <View style={styles.portionRow}>
                      <Text style={styles.portionLabel}>{t('foodsPage.portion')}</Text>
                      {PORTIONS.map((p) => (
                        <Pressable
                          key={p.label}
                          onPress={() => setFactor(p.factor)}
                          style={[
                            styles.portionChip,
                            factor === p.factor && styles.portionChipOn,
                          ]}
                        >
                          <Text
                            style={[
                              styles.portionChipText,
                              factor === p.factor && { color: '#fff' },
                            ]}
                          >
                            {p.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>

                    {/* Scaled macros */}
                    <View style={styles.macroRow}>
                      <Macro value={scaled.calories} unit="kcal" color={colors.warning} />
                      <Macro value={scaled.carbohydrates} unit={t('foodsPage.unitCarbs')} color={colors.carbs} />
                      <Macro value={scaled.sugar} unit={t('foodsPage.unitSugar')} color={colors.protein} />
                      <Macro
                        value={f.glycemic_index ?? 0}
                        unit="IG"
                        color={
                          (f.glycemic_index ?? 0) > 65
                            ? colors.glucoseLow
                            : (f.glycemic_index ?? 0) > 55
                              ? colors.glucoseHigh
                              : colors.glucoseInRange
                        }
                      />
                    </View>

                    <View style={styles.actionsRow}>
                      <Pressable
                        style={[styles.actionBtn, styles.actionPrimary]}
                        onPress={() => add(f, false)}
                      >
                        <Text style={styles.actionPrimaryText}>
                          {savedId === f.id ? t('foodsPage.added') : t('foodsPage.add')}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.actionBtn, styles.actionSecondary]}
                        onPress={() => add(f, true)}
                      >
                        <Text style={styles.actionSecondaryText}>
                          + Bolus
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </BevelCard>
            );
          })}
          {list.length === 0 ? (
            <Text style={styles.noResults}>{t('foodsPage.noResults')}</Text>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

function Macro({
  value,
  unit,
  color,
}: {
  value: number;
  unit: string;
  color: string;
}) {
  return (
    <View style={styles.macro}>
      <Text style={[styles.macroValue, { color }]}>{value}</Text>
      <Text style={styles.macroUnit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
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
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 14,
    marginHorizontal: 2,
  },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#E5E5EA',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, fontSize: 16, color: colors.text, padding: 0 },
  card: { overflow: 'hidden' },
  cardHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  foodName: { fontSize: 15.5, fontWeight: '700', color: colors.text },
  foodAr: { marginTop: 1, fontSize: 13, color: colors.textSecondary },
  foodPortion: { marginTop: 2, fontSize: 12, color: colors.textTertiary },
  carbsBadge: {
    alignItems: 'center',
    backgroundColor: `${colors.carbs}18`,
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  carbsBadgeValue: { fontSize: 16, fontWeight: '800', color: colors.carbs },
  carbsBadgeLabel: { fontSize: 10, color: colors.carbs },
  detail: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F3',
    padding: 14,
  },
  portionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  portionLabel: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  portionChip: {
    width: 40,
    height: 34,
    borderRadius: 12,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  portionChipOn: { backgroundColor: colors.ink },
  portionChipText: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  macroRow: { flexDirection: 'row', marginTop: 14 },
  macro: { flex: 1, alignItems: 'center' },
  macroValue: { fontSize: 18, fontWeight: '800' },
  macroUnit: { marginTop: 2, fontSize: 11, color: colors.textSecondary },
  actionsRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  actionBtn: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
  },
  actionPrimary: { backgroundColor: colors.ink },
  actionPrimaryText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  actionSecondary: { backgroundColor: colors.surface2 },
  actionSecondaryText: { color: colors.text, fontSize: 15, fontWeight: '700' },
  noResults: {
    marginTop: 30,
    textAlign: 'center',
    fontSize: 15,
    color: colors.textTertiary,
  },
});
