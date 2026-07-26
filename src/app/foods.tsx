import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';

import {
  FadeInView,
  HeroScreen,
  HERO_INK,
  HERO_MUTED,
  SearchGlyph,
} from '@/components/ui';
import i18n from '@/i18n';
import { filterMoroccanFoods, type MoroccanFood } from '@/data/moroccanFoods';
import { saveMeal } from '@/services/data';
import { colors, shadows } from '@/theme';
import type { NutritionResult } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

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

/** Green under 55, amber to 65, orange above — the patient's own scale. */
function giTone(gi: number) {
  if (gi > 65) return { color: colors.glucoseLow, bg: '#FFF1E6' };
  if (gi > 55) return { color: '#B8860B', bg: '#FEF6E7' };
  return { color: colors.glucoseInRange, bg: '#E9FBF2' };
}

export default function FoodsScreen() {
  const router = useRouter();
  const { t } = useTranslation();
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
    <HeroScreen
      title={t('foodsPage.title')}
      photo={require('../assets/nutrition/hero-bg.jpg')}
      onClose={close}
      height={220}
    >
      {/* ── Search ── */}
      <FadeInView>
        <Text style={styles.subtitle}>{t('foodsPage.subtitle')}</Text>
        <View style={styles.search}>
          <SearchGlyph />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('foodsPage.searchPlaceholder')}
            placeholderTextColor="#AFBAB3"
            style={styles.searchInput}
          />
          {query ? (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Text style={styles.clear}>✕</Text>
            </Pressable>
          ) : null}
        </View>
        <Text style={styles.count}>{t('foodsPage.count', { n: list.length })}</Text>
      </FadeInView>

      {/* ── The dishes ── */}
      <FadeInView delay={70}>
        <View style={{ gap: 9 }}>
          {list.map((f) => {
            const isOpen = openId === f.id;
            const scaled = toResult(f, factor);
            const gi = f.glycemic_index ?? 0;
            const tone = giTone(gi);
            return (
              <View key={f.id} style={[styles.card, isOpen && styles.cardOpen]}>
                <Pressable
                  style={styles.cardHead}
                  onPress={() => {
                    setOpenId(isOpen ? null : f.id);
                    setFactor(1);
                    setSavedId(null);
                  }}
                >
                  <View style={styles.emojiWrap}>
                    <Text style={{ fontSize: 24 }}>{f.emoji}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.foodName} numberOfLines={1}>
                      {f.name_fr}
                    </Text>
                    <Text style={styles.foodAr} numberOfLines={1}>
                      {f.name_ar}
                    </Text>
                    {/* Arabic text carries its own direction, so without an
                        explicit alignment it drifts to the right edge of a
                        French-primary row. */}
                    <Text style={styles.foodPortion} numberOfLines={1}>
                      {f.serving_size}
                    </Text>
                  </View>
                  <View style={styles.carbsBadge}>
                    <Text style={styles.carbsValue}>{f.carbs}</Text>
                    <Text style={styles.carbsUnit}>g</Text>
                  </View>
                </Pressable>

                {isOpen ? (
                  <View style={styles.detail}>
                    {/* Portion */}
                    <View style={styles.portionRow}>
                      <Text style={styles.portionLabel}>{t('foodsPage.portion')}</Text>
                      <View style={styles.portionChips}>
                        {PORTIONS.map((p) => {
                          const on = factor === p.factor;
                          return (
                            <Pressable
                              key={p.label}
                              onPress={() => setFactor(p.factor)}
                              style={[styles.portionChip, on && styles.portionChipOn]}
                            >
                              <Text
                                style={[styles.portionText, on && styles.portionTextOn]}
                              >
                                {p.label}
                              </Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    </View>

                    {/* What that portion actually is */}
                    <View style={styles.macroRow}>
                      <Macro value={scaled.calories} unit="kcal" color={colors.warning} />
                      <Macro
                        value={scaled.carbohydrates}
                        unit={t('foodsPage.unitCarbs')}
                        color={colors.carbs}
                      />
                      <Macro
                        value={scaled.sugar}
                        unit={t('foodsPage.unitSugar')}
                        color={colors.protein}
                      />
                      <Macro value={gi} unit="IG" color={tone.color} />
                    </View>

                    {gi > 65 ? (
                      <View style={[styles.warn, { backgroundColor: tone.bg }]}>
                        <Text style={[styles.warnText, { color: tone.color }]}>
                          ⚡ {t('foodsPage.highGiWarning')}
                        </Text>
                      </View>
                    ) : null}

                    <View style={styles.actionsRow}>
                      <Pressable
                        style={[styles.actionBtn, styles.actionPrimary]}
                        onPress={() => add(f, false)}
                      >
                        <Text style={styles.actionPrimaryText} numberOfLines={1}>
                          {savedId === f.id
                            ? `✓ ${t('foodsPage.added')}`
                            : t('foodsPage.add')}
                        </Text>
                      </Pressable>
                      <Pressable
                        style={[styles.actionBtn, styles.actionSecondary]}
                        onPress={() => add(f, true)}
                      >
                        <Text style={styles.actionSecondaryText} numberOfLines={1}>
                          💉 Bolus
                        </Text>
                      </Pressable>
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}

          {list.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyEmoji}>🍽️</Text>
              <Text style={styles.emptyText}>{t('foodsPage.noResults')}</Text>
            </View>
          ) : null}
        </View>
      </FadeInView>
    </HeroScreen>
  );
}

function Macro({ value, unit, color }: { value: number; unit: string; color: string }) {
  return (
    <View style={styles.macro}>
      <Text style={[styles.macroValue, { color }]}>{value}</Text>
      <Text style={styles.macroUnit}>{unit}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  subtitle: {
    fontFamily: F500,
    fontSize: 13,
    lineHeight: 18,
    color: HERO_MUTED,
    marginBottom: 12,
  },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 14,
    paddingVertical: 13,
    ...shadows.card,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    fontFamily: F600,
    fontSize: 15,
    color: HERO_INK,
    padding: 0,
  },
  clear: { fontFamily: F700, fontSize: 13, color: '#AFBAB3' },
  count: {
    fontFamily: F600,
    fontSize: 11.5,
    color: HERO_MUTED,
    marginTop: 10,
    marginLeft: 2,
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    ...shadows.card,
  },
  cardOpen: { borderWidth: 1.5, borderColor: '#DFF3E8' },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 13 },
  emojiWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#F3F7F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  foodName: { fontFamily: F800, fontSize: 14, color: HERO_INK },
  foodAr: {
    fontFamily: F600,
    fontSize: 12,
    color: HERO_MUTED,
    marginTop: 1,
    textAlign: 'left',
  },
  foodPortion: { fontFamily: F500, fontSize: 11, color: '#9AA8A0', marginTop: 2 },
  carbsBadge: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 52,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: '#F4F2FF',
  },
  carbsValue: { fontFamily: F800, fontSize: 16, color: colors.carbs, lineHeight: 19 },
  carbsUnit: { fontFamily: F700, fontSize: 10, color: colors.carbs, opacity: 0.75 },

  detail: {
    borderTopWidth: 1,
    borderTopColor: '#EEF3F0',
    paddingHorizontal: 13,
    paddingTop: 13,
    paddingBottom: 14,
    gap: 13,
  },
  portionRow: { gap: 8 },
  portionLabel: { fontFamily: F700, fontSize: 11.5, color: HERO_MUTED },
  portionChips: { flexDirection: 'row', gap: 7 },
  portionChip: {
    flex: 1,
    minHeight: 40,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#E4EBE7',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  portionChipOn: { backgroundColor: '#E9FBF2', borderColor: colors.glucoseInRange },
  portionText: { fontFamily: F800, fontSize: 14, color: HERO_MUTED },
  portionTextOn: { color: '#0F7A42' },

  macroRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FBF9',
    borderRadius: 14,
    paddingVertical: 11,
  },
  macro: { flex: 1, alignItems: 'center' },
  macroValue: { fontFamily: F800, fontSize: 15.5 },
  macroUnit: { fontFamily: F600, fontSize: 10, color: '#9AA8A0', marginTop: 1 },

  warn: { borderRadius: 12, paddingVertical: 9, paddingHorizontal: 11 },
  warnText: { fontFamily: F600, fontSize: 11.5, lineHeight: 16 },

  actionsRow: { flexDirection: 'row', gap: 9 },
  actionBtn: {
    flex: 1,
    minHeight: 46,
    paddingHorizontal: 10,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPrimary: { backgroundColor: colors.glucoseInRange },
  actionPrimaryText: { fontFamily: F700, fontSize: 13.5, color: '#FFFFFF' },
  actionSecondary: { borderWidth: 1.5, borderColor: '#D6DEDA', backgroundColor: '#FFFFFF' },
  actionSecondaryText: { fontFamily: F700, fontSize: 13.5, color: HERO_INK },

  empty: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 10,
  },
  emptyEmoji: { fontSize: 34 },
  emptyText: { fontFamily: F600, fontSize: 13, color: HERO_MUTED, textAlign: 'center' },
});
