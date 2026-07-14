import React, { useState } from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft } from '@/components/ui';
import { isRTL } from '@/i18n';
import {
  getHealthyFood,
  healthyCategoryColors,
  healthyFoodName,
  healthyFoodSteps,
  healthyFoodWhy,
} from '@/data/healthyFoods';
import { HEALTHY_FOOD_IMAGES } from '@/data/healthyFoodImages';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/**
 * Detail page of one healthy food: hero, "why it's good for YOUR
 * diabetes", full nutrition per serving, and the preparation steps.
 * Reached from the list screen or straight from an AI chat link.
 */
export default function HealthyFoodDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);

  const [imgBroken, setImgBroken] = useState(false);

  const food = getHealthyFood(String(id ?? ''));
  if (!food) return <Redirect href="/healthy-foods" />;
  const photo = HEALTHY_FOOD_IMAGES[food.id];
  const showPhoto = !!photo && !imgBroken;

  const [c1, c2] = healthyCategoryColors(food.category);
  const name = healthyFoodName(food, i18n.language);
  const why = healthyFoodWhy(food, i18n.language);
  const steps = healthyFoodSteps(food, i18n.language);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/healthy-foods');
  };

  const giTone =
    food.gi <= 40
      ? { bg: '#e9fbf2', text: '#0f7a45', label: t('hf.giLow') }
      : food.gi <= 55
        ? { bg: '#fdf4e3', text: '#a16207', label: t('hf.giMedium') }
        : { bg: '#fdeaea', text: '#b91c1c', label: t('hf.giHigh') };

  const NUTRIENTS: { icon: string; labelKey: string; value: string }[] = [
    { icon: '🔥', labelKey: 'hf.calories', value: `${food.calories} kcal` },
    { icon: '🍞', labelKey: 'hf.carbs', value: `${food.carbs} g` },
    { icon: '🍬', labelKey: 'hf.sugar', value: `${food.sugar} g` },
    { icon: '🥩', labelKey: 'hf.protein', value: `${food.protein} g` },
    { icon: '🧈', labelKey: 'hf.fat', value: `${food.fat} g` },
    { icon: '🌾', labelKey: 'hf.fiber', value: `${food.fiber} g` },
  ];

  return (
    <View style={styles.root}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 12) + 24 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Hero ── */}
        <LinearGradient
          colors={[c1, c2]}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.9, y: 1 }}
          style={[styles.hero, { paddingTop: insets.top + 10 }]}
        >
          <Pressable onPress={close} style={styles.backBtn} hitSlop={8}>
            <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
              <ChevronLeft size={16} />
            </View>
          </Pressable>
          {showPhoto ? (
            <View style={styles.heroPhotoWrap}>
              <Image
                source={{ uri: photo }}
                style={{ width: '100%', height: '100%' }}
                resizeMode="cover"
                onError={() => setImgBroken(true)}
              />
            </View>
          ) : (
            <Text style={styles.heroEmoji}>{food.emoji}</Text>
          )}
          <Text style={styles.heroName}>{name}</Text>
          <Text style={styles.heroServing}>{food.serving}</Text>
          <View style={styles.heroBadges}>
            <View style={[styles.badge, { backgroundColor: giTone.bg }]}>
              <Text style={[styles.badgeText, { color: giTone.text }]}>
                IG {food.gi} · {giTone.label}
              </Text>
            </View>
            <View style={[styles.badge, { backgroundColor: 'rgba(255,255,255,0.8)' }]}>
              <Text style={[styles.badgeText, { color: '#3b4657' }]}>
                {t(`hf.cat.${food.category}`)}
              </Text>
            </View>
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 18 }}>
          {/* ── Why good ── */}
          <View style={[styles.card, styles.whyCard]}>
            <Text style={styles.whyTitle}>💚 {t('hf.whyTitle')}</Text>
            <Text style={styles.whyText}>{why}</Text>
          </View>

          {/* ── Nutrition ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>📊 {t('hf.nutritionTitle')}</Text>
            <Text style={styles.servingNote}>
              {t('hf.perServing', { serving: food.serving })}
            </Text>
            <View style={styles.nutriGrid}>
              {NUTRIENTS.map((n) => (
                <View key={n.labelKey} style={styles.nutriCell}>
                  <Text style={{ fontSize: 18 }}>{n.icon}</Text>
                  <Text style={styles.nutriValue}>{n.value}</Text>
                  <Text style={styles.nutriLabel}>{t(n.labelKey)}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Preparation ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>👨‍🍳 {t('hf.stepsTitle')}</Text>
            <View style={{ gap: 12, marginTop: 4 }}>
              {steps.map((s, i) => (
                <View key={i} style={styles.stepRow}>
                  <View style={styles.stepNum}>
                    <Text style={styles.stepNumText}>{i + 1}</Text>
                  </View>
                  <Text style={styles.stepText}>{s}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* ── Ask the AI about it ── */}
          <Pressable
            style={styles.askBtn}
            onPress={() => router.push('/ai-chat')}
          >
            <Text style={{ fontSize: 17 }}>💬</Text>
            <Text style={styles.askBtnText}>{t('hf.askAi')}</Text>
          </Pressable>

          <Text style={styles.disclaimer}>{t('hf.disclaimer')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe' },

  hero: {
    alignItems: 'center',
    paddingBottom: 22,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
  },
  backBtn: {
    position: 'absolute',
    left: 16,
    top: 0,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 46,
  },
  heroEmoji: { fontSize: 64, marginTop: 14 },
  heroPhotoWrap: {
    width: 168,
    height: 168,
    borderRadius: 84,
    overflow: 'hidden',
    marginTop: 14,
    borderWidth: 4,
    borderColor: 'rgba(255,255,255,0.85)',
    backgroundColor: '#ffffff',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 5,
  },
  heroName: {
    fontFamily: F800,
    fontSize: 19,
    color: '#111827',
    textAlign: 'center',
    marginTop: 8,
    paddingHorizontal: 40,
  },
  heroServing: { fontFamily: F600, fontSize: 12, color: '#5b6472', marginTop: 4 },
  heroBadges: { flexDirection: 'row', gap: 8, marginTop: 12 },
  badge: { borderRadius: 999, paddingVertical: 5, paddingHorizontal: 12 },
  badgeText: { fontFamily: F700, fontSize: 11 },

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
  whyCard: { backgroundColor: '#e9fbf2' },
  whyTitle: { fontFamily: F800, fontSize: 13.5, color: '#0f7a45', marginBottom: 6 },
  whyText: { fontFamily: F500, fontSize: 12.5, lineHeight: 19, color: '#14532d' },

  sectionTitle: { fontFamily: F800, fontSize: 13.5, color: '#111827', marginBottom: 6 },
  servingNote: { fontFamily: F500, fontSize: 10.5, color: '#8b93a7', marginBottom: 10 },
  nutriGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nutriCell: {
    width: '31%',
    flexGrow: 1,
    backgroundColor: '#f6f8fc',
    borderRadius: 14,
    alignItems: 'center',
    paddingVertical: 10,
    gap: 2,
  },
  nutriValue: { fontFamily: F800, fontSize: 13, color: '#111827' },
  nutriLabel: { fontFamily: F500, fontSize: 9.5, color: '#8b93a7' },

  stepRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  stepNum: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#19c37d',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  stepNumText: { fontFamily: F800, fontSize: 12, color: '#ffffff' },
  stepText: {
    flex: 1,
    fontFamily: F500,
    fontSize: 12.5,
    lineHeight: 19,
    color: '#3b4657',
  },

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
