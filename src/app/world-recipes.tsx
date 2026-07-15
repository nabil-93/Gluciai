import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
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

import { ChevronLeft, FadeInView, PressableScale, Skeleton } from '@/components/ui';
import { isRTL } from '@/i18n';
import {
  RECIPE_CUISINES,
  browseRecipes,
  recipeImage,
  type RecipeSummary,
} from '@/services/worldRecipes';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/**
 * "Plats du monde" — hundreds of ready-made international dishes with big
 * professional photos. Filter by cuisine or search; tap a card for the
 * full recipe (photo, AI nutrition, ingredients, translated steps).
 */
export default function WorldRecipesScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);

  const [area, setArea] = useState('Moroccan');
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<RecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const seq = useRef(0);

  const q = query.trim();

  useEffect(() => {
    const mine = ++seq.current;
    setLoading(true);
    const timer = setTimeout(
      async () => {
        const res = await browseRecipes(
          q.length >= 2 ? { query: q } : { area }
        );
        if (seq.current !== mine) return;
        setItems(res);
        setLoading(false);
      },
      q.length >= 2 ? 400 : 0
    );
    return () => clearTimeout(timer);
  }, [area, q]);

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

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <Text style={{ fontSize: 15 }}>🔍</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={t('wr.search')}
          placeholderTextColor="#98a1af"
          style={styles.searchInput}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Text style={{ fontSize: 13, color: '#8b93a7' }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {/* ── Cuisine chips (hidden while searching) ── */}
      {q.length < 2 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flexGrow: 0, marginTop: 10 }}
          contentContainerStyle={{ paddingHorizontal: 18, gap: 8 }}
        >
          {RECIPE_CUISINES.map((c) => {
            const on = area === c.area;
            return (
              <Pressable
                key={c.area}
                onPress={() => setArea(c.area)}
                style={[styles.chip, on && styles.chipOn]}
              >
                <Text style={{ fontSize: 14 }}>{c.emoji}</Text>
                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                  {t(`wr.area.${c.area}`)}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      {/* ── Recipe grid ── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: 18,
          paddingTop: 14,
          paddingBottom: Math.max(insets.bottom, 12) + 20,
        }}
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.grid}>
            {Array.from({ length: 6 }).map((_, i) => (
              <View key={i} style={styles.gridItem}>
                <Skeleton height={200} radius={22} />
              </View>
            ))}
          </View>
        ) : !items.length ? (
          <View style={{ alignItems: 'center', paddingVertical: 44, gap: 6 }}>
            <Text style={{ fontSize: 38 }}>🍽️</Text>
            <Text style={styles.emptyText}>{t('wr.empty')}</Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {items.map((r, i) => (
              <FadeInView
                key={r.id}
                delay={Math.min(i, 10) * 45}
                style={styles.gridItem}
              >
                <PressableScale
                  style={styles.card}
                  haptic={false}
                  onPress={() =>
                    router.push({ pathname: '/world-recipe', params: { id: r.id } })
                  }
                >
                  <View style={styles.cardHero}>
                    <Image
                      source={{ uri: recipeImage(r.thumb, 'large') }}
                      style={StyleSheet.absoluteFill}
                      resizeMode="cover"
                    />
                    <LinearGradient
                      colors={['transparent', 'rgba(0,0,0,0.55)']}
                      style={styles.cardShade}
                    />
                    {r.area ? (
                      <View style={styles.areaBadge}>
                        <Text style={styles.areaBadgeText}>{r.area}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.cardNameOnPhoto} numberOfLines={2}>
                      {r.name}
                    </Text>
                  </View>
                </PressableScale>
              </FadeInView>
            ))}
          </View>
        )}
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

  chip: {
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
  chipOn: { backgroundColor: '#111827', borderColor: '#111827' },
  chipText: { fontFamily: F600, fontSize: 12, color: '#3b4657' },
  chipTextOn: { color: '#ffffff' },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  gridItem: { width: '47%', flexGrow: 1 },
  card: {
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#e8ebf2',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 16,
    elevation: 4,
  },
  cardHero: { height: 176, justifyContent: 'flex-end' },
  cardShade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '65%' },
  areaBadge: {
    position: 'absolute',
    top: 10,
    left: 10,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 999,
    paddingVertical: 3,
    paddingHorizontal: 9,
  },
  areaBadgeText: { fontFamily: F800, fontSize: 9.5, color: '#111827' },
  cardNameOnPhoto: {
    fontFamily: F800,
    fontSize: 14,
    color: '#ffffff',
    padding: 12,
    lineHeight: 18,
  },

  emptyText: { fontFamily: F600, fontSize: 13, color: '#8b93a7' },
});
