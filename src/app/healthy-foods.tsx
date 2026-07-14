import React, { useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft } from '@/components/ui';
import { isRTL } from '@/i18n';
import {
  HEALTHY_CATEGORIES,
  filterHealthyFoods,
  healthyCategoryColors,
  healthyFoodName,
  type HealthyCategory,
} from '@/data/healthyFoods';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/**
 * "Makla si7iya" — the healthy food library. Every entry is diabetes-
 * friendly; tapping a card opens the detail page (nutrition, why it's
 * good, how to cook it). The AI coach links straight into these pages
 * from the chat.
 */
export default function HealthyFoodsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<HealthyCategory | null>(null);

  const foods = useMemo(
    () => filterHealthyFoods(query, category),
    [query, category]
  );

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
          <Text style={styles.headerTitle}>{t('hf.title')}</Text>
          <Text style={styles.headerSub}>{t('hf.subtitle')}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <Text style={{ fontSize: 15 }}>🔍</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('hf.search')}
          placeholderTextColor="#98a1af"
          style={styles.searchInput}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Text style={{ fontSize: 13, color: '#8b93a7' }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── Category chips ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={{ flexGrow: 0, marginTop: 10 }}
        contentContainerStyle={{ paddingHorizontal: 18, gap: 8 }}
      >
        <Pressable
          onPress={() => setCategory(null)}
          style={[styles.catChip, category === null && styles.catChipOn]}
        >
          <Text style={[styles.catChipText, category === null && styles.catChipTextOn]}>
            {t('hf.all')}
          </Text>
        </Pressable>
        {HEALTHY_CATEGORIES.map((c) => {
          const on = category === c.key;
          return (
            <Pressable
              key={c.key}
              onPress={() => setCategory(on ? null : c.key)}
              style={[styles.catChip, on && styles.catChipOn]}
            >
              <Text style={{ fontSize: 13 }}>{c.emoji}</Text>
              <Text style={[styles.catChipText, on && styles.catChipTextOn]}>
                {t(`hf.cat.${c.key}`)}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Food grid ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingTop: 14,
          paddingBottom: Math.max(insets.bottom, 12) + 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.countText}>
          {t('hf.count', { count: foods.length })}
        </Text>
        <View style={styles.grid}>
          {foods.map((f) => {
            const [c1, c2] = healthyCategoryColors(f.category);
            return (
              <Pressable
                key={f.id}
                style={styles.card}
                onPress={() =>
                  router.push({ pathname: '/healthy-food', params: { id: f.id } })
                }
              >
                <LinearGradient
                  colors={[c1, c2]}
                  start={{ x: 0.1, y: 0.1 }}
                  end={{ x: 0.9, y: 1 }}
                  style={styles.cardHero}
                >
                  <Text style={{ fontSize: 44 }}>{f.emoji}</Text>
                  <View style={styles.giBadge}>
                    <Text style={styles.giBadgeText}>IG {f.gi}</Text>
                  </View>
                </LinearGradient>
                <View style={styles.cardBody}>
                  <Text style={styles.cardName} numberOfLines={2}>
                    {healthyFoodName(f, i18n.language)}
                  </Text>
                  <View style={styles.cardStats}>
                    <Text style={styles.cardStat}>🔥 {f.calories} kcal</Text>
                    <Text style={styles.cardStat}>🍞 {f.carbs} g</Text>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
        {!foods.length ? (
          <View style={{ alignItems: 'center', paddingVertical: 40 }}>
            <Text style={{ fontSize: 36 }}>🔍</Text>
            <Text style={styles.emptyText}>{t('hf.empty')}</Text>
          </View>
        ) : null}
      </ScrollView>
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

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    paddingHorizontal: 14,
    marginHorizontal: 18,
    height: 46,
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 8,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontFamily: F500,
    fontSize: 13.5,
    color: '#111827',
    height: '100%',
  },

  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e6e9f0',
    borderRadius: 999,
    paddingVertical: 7,
    paddingHorizontal: 12,
  },
  catChipOn: { backgroundColor: '#19c37d', borderColor: '#19c37d' },
  catChipText: { fontFamily: F600, fontSize: 12, color: '#3b4657' },
  catChipTextOn: { color: '#ffffff' },

  countText: { fontFamily: F500, fontSize: 11, color: '#a6aebc', marginBottom: 8 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  card: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.07,
    shadowRadius: 10,
    elevation: 2,
  },
  cardHero: {
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  giBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 999,
    paddingVertical: 2.5,
    paddingHorizontal: 8,
  },
  giBadgeText: { fontFamily: F800, fontSize: 9.5, color: '#0f7a45' },
  cardBody: { padding: 10, gap: 6 },
  cardName: {
    fontFamily: F700,
    fontSize: 12.5,
    color: '#111827',
    lineHeight: 16,
    minHeight: 32,
  },
  cardStats: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  cardStat: { fontFamily: F600, fontSize: 10, color: '#5b6472' },

  emptyText: { fontFamily: F600, fontSize: 13, color: '#8b93a7', marginTop: 8 },
});
