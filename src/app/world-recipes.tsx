import React, { useEffect, useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft, FadeInView, PressableScale, Skeleton } from '@/components/ui';
import { RecipeAIPanel } from '@/components/RecipeAIPanel';
import { isRTL } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import {
  MEAL_MOMENTS,
  RECIPE_COUNTRIES,
  browseDishes,
  recipeImage,
  type DishSuggestion,
  type MealMoment,
} from '@/services/worldRecipes';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const MOMENT_EMOJI: Record<MealMoment, string> = {
  any: '🍴',
  breakfast: '🌅',
  lunch: '☀️',
  dinner: '🌙',
  snack: '🍎',
};

/**
 * "Plats du monde" — AI-driven. Pick a country and a meal moment and the
 * assistant (which knows the patient) proposes dishes actually eaten there
 * for that moment, diabetes-appropriate, with real photos. The floating
 * robot opens a chat that asks about allergies/dislikes then recommends.
 */
/* Gate: "Plats du monde" is a hideable section. When the admin hid it for
 * this account (feature_access world_recipes allowed=false) the screen
 * silently redirects home — its Biology entry point is gone too. */
export default function WorldRecipesGate() {
  const hidden = useAppStore((s) => s.lockedFeatures.includes('world_recipes'));
  if (hidden) return <Redirect href="/(tabs)" />;
  return <WorldRecipesScreen />;
}

function WorldRecipesScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);

  const [country, setCountry] = useState('Morocco');
  const [moment, setMoment] = useState<MealMoment>('any');
  const [panelOpen, setPanelOpen] = useState(false);

  // Load dishes whenever country or moment changes — the local catalog
  // answers instantly (no tokens); the AI only fills thin countries.
  // The result carries its request key so `loading` is derived — no
  // synchronous setState in the effect; the cleanup flag (also run on dep
  // change) keeps stale responses from overwriting newer ones.
  const reqKey = `${country}|${moment}|${i18n.language}`;
  const [res, setRes] = useState<{
    key: string;
    dishes: DishSuggestion[];
  } | null>(null);
  useEffect(() => {
    let alive = true;
    (async () => {
      const r = await browseDishes(country, moment, i18n.language);
      if (alive) setRes({ key: reqKey, dishes: r.dishes });
    })();
    return () => {
      alive = false;
    };
  }, [country, moment, i18n.language, reqKey]);

  const dishes = res?.key === reqKey ? res.dishes : [];
  const loading = !res || res.key !== reqKey;

  const openDish = (d: DishSuggestion) => {
    setPanelOpen(false);
    router.push({
      pathname: '/world-recipe',
      params: {
        name: d.name,
        dishId: d.dishId || '',
        // Pass the correct card photo so the detail hero matches exactly.
        image: d.image || '',
      },
    });
  };

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <View style={styles.root}>
      {/* ── Header ── */}
      <View style={[styles.header, { paddingTop: insets.top + 10 }]}>
        <Pressable onPress={close} style={styles.backBtn} hitSlop={8}>
          <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
            <ChevronLeft size={16} />
          </View>
        </Pressable>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={styles.headerTitle}>{t('wr.title')}</Text>
          <Text style={styles.headerSub}>{t('wr.subtitle')}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingBottom: Math.max(insets.bottom, 12) + 90,
        }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── AI advisor banner ── */}
        <Pressable style={styles.aiBanner} onPress={() => setPanelOpen(true)}>
          <LinearGradient
            colors={['#6d5ef9', '#8b3ffc']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.aiBannerBg}
          >
            <View style={styles.aiBannerRobot}>
              <AnimatedRobot size={42} mood="happy" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.aiBannerTitle}>{t('wr.aiBannerTitle')}</Text>
              <Text style={styles.aiBannerSub}>{t('wr.aiBannerSub')}</Text>
            </View>
            <View style={styles.aiBannerCta}>
              <Text style={styles.aiBannerCtaText}>{t('wr.aiBannerCta')}</Text>
            </View>
          </LinearGradient>
        </Pressable>

        {/* ── Country chips ── */}
        <Text style={styles.pickLabel}>{t('wr.pickCountry')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 18, gap: 8 }}
        >
          {RECIPE_COUNTRIES.map((c) => {
            const on = country === c.key;
            return (
              <Pressable
                key={c.key}
                onPress={() => setCountry(c.key)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={{ fontSize: 15 }}>{c.emoji}</Text>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {t(`wr.country.${c.key}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Meal moment ── */}
        <Text style={styles.pickLabel}>{t('wr.pickMoment')}</Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: 18, gap: 8 }}
        >
          {MEAL_MOMENTS.map((m) => {
            const on = moment === m;
            return (
              <Pressable
                key={m}
                onPress={() => setMoment(m)}
                style={[styles.momentChip, on && styles.momentChipOn]}
              >
                <Text style={{ fontSize: 14 }}>{MOMENT_EMOJI[m]}</Text>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {t(`wr.moment.${m}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>

        {/* ── Dish grid ── */}
        <View style={{ paddingHorizontal: 18, paddingTop: 16 }}>
          {loading ? (
            <View style={styles.grid}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View key={i} style={styles.gridItem}>
                  <Skeleton height={176} radius={22} />
                </View>
              ))}
            </View>
          ) : !dishes.length ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 6 }}>
              <Text style={{ fontSize: 36 }}>🍽️</Text>
              <Text style={styles.emptyText}>{t('wr.empty')}</Text>
            </View>
          ) : (
            <View style={styles.grid}>
              {dishes.map((d, i) => (
                <FadeInView key={`${d.name}-${i}`} delay={Math.min(i, 10) * 50} style={styles.gridItem}>
                  <PressableScale style={styles.card} haptic={false} onPress={() => openDish(d)}>
                    <View style={styles.cardHero}>
                      {d.image ? (
                        <Image
                          source={{ uri: recipeImage(d.image, 'large') }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                      ) : (
                        <LinearGradient
                          colors={['#fde68a', '#fbbf24']}
                          style={StyleSheet.absoluteFill}
                        >
                          <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 42 }}>🍽️</Text>
                          </View>
                        </LinearGradient>
                      )}
                      <LinearGradient
                        colors={['transparent', 'rgba(0,0,0,0.6)']}
                        style={styles.cardShade}
                      />
                      {d.ready ? (
                        <View style={styles.readyBadge}>
                          <Text style={styles.readyBadgeText}>✓ {t('wr.ready')}</Text>
                        </View>
                      ) : (
                        <View style={styles.aiBadge}>
                          <Text style={styles.aiBadgeText}>✨ {t('wr.aiMade')}</Text>
                        </View>
                      )}
                      <Text style={styles.cardName} numberOfLines={2}>
                        {d.name}
                      </Text>
                    </View>
                    {d.note ? (
                      <Text style={styles.cardNote} numberOfLines={2}>
                        {d.note}
                      </Text>
                    ) : null}
                  </PressableScale>
                </FadeInView>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      {/* ── Floating AI robot ── */}
      <Pressable
        style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 16 }]}
        onPress={() => setPanelOpen(true)}
      >
        <LinearGradient
          colors={['#6d5ef9', '#8b3ffc']}
          style={styles.fabBg}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <AnimatedRobot size={38} mood="happy" />
        </LinearGradient>
      </Pressable>

      <RecipeAIPanel
        visible={panelOpen}
        onClose={() => setPanelOpen(false)}
        onPickDish={openDish}
        country={country}
        moment={moment}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe' },

  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  headerTitle: { fontFamily: F800, fontSize: 16.5, color: '#111827' },
  headerSub: { fontFamily: F500, fontSize: 11.5, color: '#8b93a7', marginTop: 1 },

  aiBanner: { marginHorizontal: 18, marginBottom: 4, borderRadius: 20, overflow: 'hidden' },
  aiBannerBg: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
  },
  aiBannerRobot: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  aiBannerTitle: { fontFamily: F800, fontSize: 14.5, color: '#ffffff' },
  aiBannerSub: {
    fontFamily: F500,
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
    lineHeight: 15,
  },
  aiBannerCta: {
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 13,
  },
  aiBannerCtaText: { fontFamily: F800, fontSize: 11.5, color: '#6d5ef9' },

  pickLabel: {
    fontFamily: F700,
    fontSize: 12.5,
    color: '#5b6472',
    marginTop: 16,
    marginBottom: 8,
    paddingHorizontal: 18,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e6e9f0',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  chipOn: { backgroundColor: '#111827', borderColor: '#111827' },
  chipText: { fontFamily: F600, fontSize: 12.5, color: '#3b4657' },
  chipTextOn: { color: '#ffffff' },
  momentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e6e9f0',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  momentChipOn: { backgroundColor: '#19c37d', borderColor: '#19c37d' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: '47%', flexGrow: 1 },
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#ffffff',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.13,
    shadowRadius: 16,
    elevation: 4,
  },
  cardHero: { height: 158, justifyContent: 'flex-end' },
  cardShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '60%' },
  readyBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(25,195,125,0.95)',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  readyBadgeText: { fontFamily: F800, fontSize: 9.5, color: '#ffffff' },
  aiBadge: {
    position: 'absolute',
    top: 8,
    left: 8,
    backgroundColor: 'rgba(109,94,249,0.95)',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  aiBadgeText: { fontFamily: F800, fontSize: 9.5, color: '#ffffff' },
  cardName: {
    fontFamily: F800,
    fontSize: 13.5,
    color: '#ffffff',
    paddingHorizontal: 12,
    paddingBottom: 10,
    lineHeight: 17,
  },
  cardNote: {
    fontFamily: F600,
    fontSize: 10.5,
    color: '#5b6472',
    padding: 10,
    lineHeight: 14,
  },

  emptyText: { fontFamily: F600, fontSize: 13, color: '#8b93a7' },

  fab: {
    position: 'absolute',
    right: 18,
    width: 62,
    height: 62,
    borderRadius: 31,
    shadowColor: '#6d5ef9',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 8,
  },
  fabBg: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
