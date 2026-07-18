import React, { useMemo } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppButton,
  BevelCard,
  ChevronLeft,
  PremiumEmptyState,
} from '@/components/ui';
import { deleteMeal } from '@/services/data';
import { getRecommendations } from '@/services/recommendations';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';

// Daily goals (sensible defaults for a diabetic meal plan)
const GOALS = { kcal: 2000, carbs: 250, protein: 90, fat: 65 };

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function NutritionScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { meals, profile, glucoseLogs } = useAppStore();

  const todayMeals = useMemo(
    () => meals.filter((m) => isToday(m.created_at)),
    [meals]
  );

  const recommendations = useMemo(
    () => getRecommendations(profile, glucoseLogs, meals),
    [profile, glucoseLogs, meals]
  );

  const totals = todayMeals.reduce(
    (acc, m) => {
      acc.kcal += m.result.calories ?? 0;
      acc.carbs += m.result.carbohydrates ?? 0;
      acc.protein += m.result.protein ?? 0;
      acc.fat += m.result.fat ?? 0;
      acc.sugar += m.result.sugar ?? 0;
      return acc;
    },
    { kcal: 0, carbs: 0, protein: 0, fat: 0, sugar: 0 }
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
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
          <Text style={styles.headTitle}>{t('nutritionPage.title')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Big carbs card — the number that matters for insulin */}
        <View style={styles.carbsCard}>
          <Text style={styles.carbsLabel}>{t('nutritionPage.carbsToday')}</Text>
          <View style={styles.carbsRow}>
            <Text style={styles.carbsValue}>{Math.round(totals.carbs)}</Text>
            <Text style={styles.carbsUnit}>g / {GOALS.carbs} g</Text>
          </View>
          <View style={styles.carbsTrack}>
            <View
              style={[
                styles.carbsFill,
                {
                  width: `${Math.min(100, (totals.carbs / GOALS.carbs) * 100)}%`,
                },
              ]}
            />
          </View>
          <Text style={styles.carbsHint}>
            {profile?.carb_ratio
              ? t('nutritionPage.ratioHint', { ratio: profile.carb_ratio })
              : t('nutritionPage.ratioMissing')}
          </Text>
        </View>

        {/* Macro goals */}
        <BevelCard style={{ marginTop: 12 }}>
          <Text style={styles.cardTitle}>{t('nutritionPage.dailyGoals')}</Text>
          <MacroBar
            name={t('nutritionPage.calories')}
            value={Math.round(totals.kcal)}
            goal={GOALS.kcal}
            unit="kcal"
            color={colors.warning}
          />
          <MacroBar
            name={t('nutritionPage.carbs')}
            value={Math.round(totals.carbs)}
            goal={GOALS.carbs}
            unit="g"
            color={colors.carbs}
          />
          <MacroBar
            name={t('nutritionPage.protein')}
            value={Math.round(totals.protein)}
            goal={GOALS.protein}
            unit="g"
            color={colors.protein}
          />
          <MacroBar
            name={t('nutritionPage.fat')}
            value={Math.round(totals.fat)}
            goal={GOALS.fat}
            unit="g"
            color={colors.lipids}
          />
        </BevelCard>

        {/* Sugar warning */}
        {totals.sugar > 50 ? (
          <View style={styles.sugarWarn}>
            <Text style={styles.sugarWarnText}>
              {t('nutritionPage.sugarWarn', { sugar: Math.round(totals.sugar) })}
            </Text>
          </View>
        ) : null}

        {/* Personalized recommendations */}
        <Text style={styles.section}>{t('nutritionPage.recommendations')}</Text>
        <BevelCard>
          {recommendations.map((r, i) => (
            <View
              key={i}
              style={[
                styles.recRow,
                i < recommendations.length - 1 && styles.recBorder,
              ]}
            >
              <Text style={{ fontSize: 20 }}>{r.icon}</Text>
              <Text style={styles.recText}>{r.text}</Text>
            </View>
          ))}
          <Text style={styles.recDisclaimer}>{t('nutritionPage.recDisclaimer')}</Text>
        </BevelCard>

        {/* Meals list */}
        <Text style={styles.section}>
          {t('nutritionPage.mealsOfDay', { count: todayMeals.length })}
        </Text>
        {todayMeals.length === 0 ? (
          <PremiumEmptyState
            emoji="🍽️"
            title={t('nutritionPage.emptyTitle')}
            message={t('nutritionPage.emptyMessage')}
            actionLabel={t('nutritionPage.scanMeal')}
            onAction={() => router.push('/scan')}
          />
        ) : (
          <View style={{ gap: 12 }}>
            {todayMeals.map((m) => (
              <BevelCard key={m.id} noPadding style={styles.mealCard}>
                <View style={styles.mealTop}>
                  {m.image_url ? (
                    <Image
                      source={{ uri: m.image_url }}
                      style={styles.mealImg}
                    />
                  ) : (
                    <View style={[styles.mealImg, styles.mealImgPlaceholder]}>
                      <Text style={{ fontSize: 24 }}>🍽️</Text>
                    </View>
                  )}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.mealName} numberOfLines={1}>
                      {m.result.food_name}
                    </Text>
                    <Text style={styles.mealPortion} numberOfLines={1}>
                      {m.result.estimated_portion} ·{' '}
                      {new Date(m.created_at).toLocaleTimeString(i18n.language, {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() => deleteMeal(m.id)}
                    hitSlop={8}
                    style={styles.deleteBtn}
                  >
                    <Text style={styles.deleteText}>✕</Text>
                  </Pressable>
                </View>
                <View style={styles.mealMacros}>
                  <MealStat value={`${Math.round(m.result.carbohydrates)} g`} name={t('nutritionPage.carbs')} color={colors.carbs} />
                  <MealStat value={`${Math.round(m.result.sugar)} g`} name={t('nutritionPage.sugar')} color={colors.protein} />
                  <MealStat value={`${Math.round(m.result.calories)}`} name="kcal" color={colors.warning} />
                  <MealStat value={`${m.result.glycemic_index}`} name={t('nutritionPage.gi')} color={colors.ai} />
                </View>
                <Pressable
                  style={styles.bolusLink}
                  onPress={() => router.push('/bolus')}
                >
                  <Text style={styles.bolusLinkText}>{t('nutritionPage.bolusLink')}</Text>
                </Pressable>
              </BevelCard>
            ))}
            <AppButton
              label={t('nutritionPage.scanAnother')}
              onPress={() => router.push('/scan')}
              variant="secondary"
            />
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function MacroBar({
  name,
  value,
  goal,
  unit,
  color,
}: {
  name: string;
  value: number;
  goal: number;
  unit: string;
  color: string;
}) {
  const pct = Math.min(100, (value / goal) * 100);
  return (
    <View style={styles.macroBar}>
      <View style={styles.macroHead}>
        <Text style={styles.macroName}>{name}</Text>
        <Text style={styles.macroValues}>
          <Text style={{ color: colors.text, fontWeight: '700' }}>{value}</Text>{' '}
          / {goal} {unit}
        </Text>
      </View>
      <View style={styles.macroTrack}>
        <View
          style={[styles.macroFill, { width: `${pct}%`, backgroundColor: color }]}
        />
      </View>
    </View>
  );
}

function MealStat({
  value,
  name,
  color,
}: {
  value: string;
  name: string;
  color: string;
}) {
  return (
    <View style={styles.mealStat}>
      <Text style={[styles.mealStatValue, { color }]}>{value}</Text>
      <Text style={styles.mealStatName}>{name}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
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

  carbsCard: {
    backgroundColor: colors.ink,
    borderRadius: 24,
    padding: 20,
    ...shadows.floating,
  },
  carbsLabel: { fontSize: 15, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  carbsRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8, marginTop: 4 },
  carbsValue: { fontSize: 48, fontWeight: '800', color: '#fff', letterSpacing: -1 },
  carbsUnit: { fontSize: 17, fontWeight: '600', color: 'rgba(255,255,255,0.6)' },
  carbsTrack: {
    marginTop: 12,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  carbsFill: {
    height: '100%',
    borderRadius: 4,
    backgroundColor: colors.carbs,
  },
  carbsHint: { marginTop: 10, fontSize: 13, color: 'rgba(255,255,255,0.5)' },

  cardTitle: { fontSize: 17, fontWeight: '650' as any, color: colors.text, marginBottom: 4 },
  macroBar: { marginTop: 12 },
  macroHead: { flexDirection: 'row', justifyContent: 'space-between' },
  macroName: { fontSize: 14.5, fontWeight: '600', color: '#3E3E44' },
  macroValues: { fontSize: 13.5, color: colors.textSecondary },
  macroTrack: {
    marginTop: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  macroFill: { height: '100%', borderRadius: 3 },

  recRow: {
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 10,
    alignItems: 'flex-start',
  },
  recBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F0F3' },
  recText: { flex: 1, fontSize: 13.5, lineHeight: 20, color: '#3E3E44' },
  recDisclaimer: {
    marginTop: 8,
    fontSize: 11.5,
    color: colors.textTertiary,
  },

  sugarWarn: {
    marginTop: 12,
    backgroundColor: colors.warningDim,
    borderRadius: 16,
    padding: 14,
  },
  sugarWarnText: { fontSize: 14, lineHeight: 20, color: '#B45D22', fontWeight: '500' },

  section: {
    fontSize: 20,
    fontWeight: '750' as any,
    color: colors.text,
    marginTop: 26,
    marginBottom: 12,
    marginHorizontal: 2,
  },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 20 },
  emptyTitle: { fontSize: 17, fontWeight: '650' as any, color: '#9B9BA1' },
  emptySub: {
    fontSize: 14.5,
    color: '#C7C7CC',
    textAlign: 'center',
    maxWidth: 280,
    marginBottom: 6,
  },

  mealCard: { overflow: 'hidden' },
  mealTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  mealImg: { width: 52, height: 52, borderRadius: 14 },
  mealImgPlaceholder: {
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealName: { fontSize: 16, fontWeight: '700', color: colors.text },
  mealPortion: { marginTop: 2, fontSize: 13, color: colors.textSecondary },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
  mealMacros: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#F0F0F3',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  mealStat: { flex: 1, alignItems: 'center' },
  mealStatValue: { fontSize: 16, fontWeight: '800' },
  mealStatName: { marginTop: 2, fontSize: 12, color: colors.textSecondary },
  bolusLink: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F3',
    paddingVertical: 12,
    alignItems: 'center',
  },
  bolusLinkText: { fontSize: 14.5, fontWeight: '650' as any, color: colors.ai },
});
