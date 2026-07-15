import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AnimatedRobot,
  ChevronLeft,
  FadeInView,
  GaugeRing,
} from '@/components/ui';
import { isRTL } from '@/i18n';
import {
  recipeDetail,
  recipeImage,
  type RecipeDetail,
  type RecipeRating,
} from '@/services/worldRecipes';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const RATING: Record<RecipeRating, { color: string; bg: string; key: string }> = {
  ok: { color: '#0f7a45', bg: '#e9fbf2', key: 'wr.ratingOk' },
  warn: { color: '#a16207', bg: '#fdf4e3', key: 'wr.ratingWarn' },
  danger: { color: '#b91c1c', bg: '#fdeaea', key: 'wr.ratingDanger' },
};

/**
 * Full world recipe: HD photo hero, AI diabetes verdict + advice, animated
 * nutrition gauge rings (per serving), ingredients and translated steps.
 */
export default function WorldRecipeScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);

  const [recipe, setRecipe] = useState<RecipeDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setFailed(false);
    (async () => {
      const r = await recipeDetail(String(id ?? ''), i18n.language);
      if (!alive) return;
      if (!r) setFailed(true);
      setRecipe(r);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [id, i18n.language]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/world-recipes');
  };

  const title = recipe?.title || recipe?.name || '';
  const ps = recipe?.per_serving;
  const rating = recipe?.rating ? RATING[recipe.rating] : null;

  const RINGS = ps
    ? [
        { key: 'hf.calories', value: `${ps.calories}`, unit: 'kcal', progress: ps.calories / 2000, color: '#f97316' },
        { key: 'hf.carbs', value: `${ps.carbs}`, unit: 'g', progress: ps.carbs / 250, color: '#6366f1' },
        { key: 'hf.sugar', value: `${ps.sugar}`, unit: 'g', progress: ps.sugar / 50, color: '#ef4444' },
        { key: 'hf.protein', value: `${ps.protein}`, unit: 'g', progress: ps.protein / 100, color: '#8b5cf6' },
        { key: 'hf.fat', value: `${ps.fat}`, unit: 'g', progress: ps.fat / 70, color: '#f59e0b' },
        { key: 'hf.fiber', value: `${ps.fiber}`, unit: 'g', progress: ps.fiber / 30, color: '#10b981' },
      ]
    : [];

  return (
    <View style={styles.root}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) + 26 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── HD photo hero ── */}
        <View style={styles.hero}>
          {recipe?.thumb ? (
            <Image
              source={{ uri: recipeImage(recipe.thumb, 'large') }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: '#e8ebf2' }]} />
          )}
          <LinearGradient
            colors={['rgba(0,0,0,0.35)', 'transparent', 'rgba(0,0,0,0.75)']}
            locations={[0, 0.4, 1]}
            style={StyleSheet.absoluteFill}
          />
          <Pressable
            onPress={close}
            style={[styles.backBtn, { top: insets.top + 8 }]}
            hitSlop={8}
          >
            <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
              <ChevronLeft size={16} color="#111827" />
            </View>
          </Pressable>
          <View style={styles.heroBottom}>
            {recipe ? (
              <View style={styles.heroTags}>
                {recipe.area ? (
                  <View style={styles.heroTag}>
                    <Text style={styles.heroTagText}>{recipe.area}</Text>
                  </View>
                ) : null}
                {recipe.category ? (
                  <View style={styles.heroTag}>
                    <Text style={styles.heroTagText}>{recipe.category}</Text>
                  </View>
                ) : null}
                {recipe.gi ? (
                  <View style={styles.heroTag}>
                    <Text style={styles.heroTagText}>IG {recipe.gi}</Text>
                  </View>
                ) : null}
              </View>
            ) : null}
            <Text style={styles.heroTitle} numberOfLines={3}>
              {title}
            </Text>
          </View>
        </View>

        {loading ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 10 }}>
            <AnimatedRobot size={54} mood="happy" />
            <ActivityIndicator color="#6d5ef9" />
            <Text style={styles.loadingText}>{t('wr.preparing')}</Text>
          </View>
        ) : failed || !recipe ? (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
            <Text style={{ fontSize: 34 }}>📡</Text>
            <Text style={styles.loadingText}>{t('wr.failed')}</Text>
          </View>
        ) : (
          <View style={{ paddingHorizontal: 18 }}>
            {/* ── Diabetes verdict + advice ── */}
            {recipe.advice && rating ? (
              <FadeInView delay={40}>
                <View style={[styles.adviceCard, { backgroundColor: rating.bg }]}>
                  <View style={styles.adviceHead}>
                    <View style={[styles.ratingDot, { backgroundColor: rating.color }]} />
                    <Text style={[styles.ratingLabel, { color: rating.color }]}>
                      {t(rating.key)}
                    </Text>
                    {recipe.servings ? (
                      <Text style={styles.servingsText}>
                        · {t('wr.servings', { count: recipe.servings })}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={styles.adviceText}>{recipe.advice}</Text>
                </View>
              </FadeInView>
            ) : null}

            {/* ── Nutrition gauge rings (per serving) ── */}
            {ps ? (
              <FadeInView delay={80}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>📊 {t('wr.nutritionTitle')}</Text>
                  <Text style={styles.servingNote}>{t('wr.perServing')}</Text>
                  <View style={styles.ringGrid}>
                    {RINGS.map((n, i) => (
                      <GaugeRing
                        key={n.key}
                        size={90}
                        stroke={9}
                        progress={n.progress}
                        color={n.color}
                        value={n.value}
                        unit={n.unit}
                        label={t(n.key)}
                        delay={i * 100}
                      />
                    ))}
                  </View>
                </View>
              </FadeInView>
            ) : null}

            {/* ── Ingredients ── */}
            {recipe.ingredients?.length ? (
              <FadeInView delay={120}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>🧺 {t('wr.ingredients')}</Text>
                  <View style={{ gap: 8, marginTop: 4 }}>
                    {recipe.ingredients.map((ing, i) => (
                      <View key={i} style={styles.ingRow}>
                        <View style={styles.ingDot} />
                        <Text style={styles.ingText}>{ing}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </FadeInView>
            ) : null}

            {/* ── Steps (translated) ── */}
            {recipe.steps?.length ? (
              <FadeInView delay={160}>
                <View style={styles.card}>
                  <Text style={styles.sectionTitle}>👨‍🍳 {t('wr.steps')}</Text>
                  <View style={{ gap: 12, marginTop: 4 }}>
                    {recipe.steps.map((s, i) => (
                      <View key={i} style={styles.stepRow}>
                        <View style={styles.stepNum}>
                          <Text style={styles.stepNumText}>{i + 1}</Text>
                        </View>
                        <Text style={styles.stepText}>{s}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </FadeInView>
            ) : null}

            {/* ── Ask AI ── */}
            <PressableScaleBtn onPress={() => router.push('/ai-chat')} label={t('wr.askAi')} />

            <Text style={styles.disclaimer}>{t('wr.disclaimer')}</Text>
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function PressableScaleBtn({ onPress, label }: { onPress: () => void; label: string }) {
  return (
    <Pressable style={styles.askBtn} onPress={onPress}>
      <Text style={{ fontSize: 17 }}>💬</Text>
      <Text style={styles.askBtnText}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe' },

  hero: { height: 300, justifyContent: 'flex-end' },
  backBtn: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBottom: { padding: 18 },
  heroTags: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginBottom: 8 },
  heroTag: {
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  heroTagText: { fontFamily: F700, fontSize: 10.5, color: '#111827' },
  heroTitle: { fontFamily: F800, fontSize: 23, color: '#ffffff', lineHeight: 28 },

  loadingText: { fontFamily: F600, fontSize: 12.5, color: '#8b93a7' },

  adviceCard: { borderRadius: 18, padding: 14, marginTop: 14 },
  adviceHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  ratingDot: { width: 10, height: 10, borderRadius: 5 },
  ratingLabel: { fontFamily: F800, fontSize: 12.5 },
  servingsText: { fontFamily: F600, fontSize: 11, color: '#8b93a7' },
  adviceText: { fontFamily: F500, fontSize: 12.5, lineHeight: 19, color: '#26313f' },

  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    marginTop: 14,
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  sectionTitle: { fontFamily: F800, fontSize: 13.5, color: '#111827', marginBottom: 4 },
  servingNote: { fontFamily: F500, fontSize: 10.5, color: '#8b93a7', marginBottom: 10 },
  ringGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    rowGap: 18,
    paddingVertical: 6,
  },

  ingRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  ingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#6d5ef9',
    marginTop: 7,
  },
  ingText: { flex: 1, fontFamily: F500, fontSize: 12.5, lineHeight: 19, color: '#3b4657' },

  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#111827',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { fontFamily: F800, fontSize: 12, color: '#ffffff' },
  stepText: { flex: 1, fontFamily: F500, fontSize: 12.5, lineHeight: 19, color: '#3b4657' },

  askBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6d5ef9',
    borderRadius: 16,
    paddingVertical: 14,
    marginTop: 14,
    shadowColor: '#6d5ef9',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 4,
  },
  askBtnText: { fontFamily: F800, fontSize: 13.5, color: '#ffffff' },

  disclaimer: {
    fontFamily: F500,
    fontSize: 10.5,
    color: '#8b93a7',
    textAlign: 'center',
    lineHeight: 15,
    marginTop: 14,
    paddingHorizontal: 10,
  },
});
