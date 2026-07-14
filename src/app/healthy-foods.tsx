import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
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
import { HEALTHY_FOOD_IMAGES } from '@/data/healthyFoodImages';
import {
  searchWorldFoods,
  type DiabetesRating,
  type WorldFood,
} from '@/services/worldFoods';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const RATING: Record<DiabetesRating, { color: string; bg: string }> = {
  ok: { color: '#0f7a45', bg: '#e9fbf2' },
  warn: { color: '#a16207', bg: '#fdf4e3' },
  danger: { color: '#b91c1c', bg: '#fdeaea' },
};

/**
 * "Makla si7iya" — two worlds in one screen:
 *  · Sélection santé: our curated diabetes-friendly dishes (mostly
 *    Moroccan) with real photos, nutrition and cooking steps;
 *  · Base mondiale: live search across the Open Food Facts database
 *    (millions of products, real photos, per-100 g nutrition) with a
 *    diabetes-friendliness rating.
 */
export default function HealthyFoodsScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);

  const [mode, setMode] = useState<'curated' | 'world'>('curated');
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<HealthyCategory | null>(null);
  /** Curated photos that failed to load fall back to the emoji hero. */
  const [brokenImgs, setBrokenImgs] = useState<Set<string>>(new Set());

  // ── World search state ──
  const [worldItems, setWorldItems] = useState<WorldFood[]>([]);
  const [worldLoading, setWorldLoading] = useState(false);
  const [worldPage, setWorldPage] = useState(1);
  const [worldHasMore, setWorldHasMore] = useState(false);
  const [worldFailed, setWorldFailed] = useState(false);
  const [worldSelected, setWorldSelected] = useState<WorldFood | null>(null);
  const worldSeq = useRef(0);

  const foods = useMemo(
    () => filterHealthyFoods(query, category),
    [query, category]
  );

  // Debounced world search whenever the query changes in world mode.
  useEffect(() => {
    if (mode !== 'world') return;
    const q = query.trim();
    if (q.length < 2) {
      setWorldItems([]);
      setWorldHasMore(false);
      return;
    }
    const seq = ++worldSeq.current;
    setWorldLoading(true);
    const timer = setTimeout(async () => {
      const { items, hasMore, failed } = await searchWorldFoods(q, 1);
      if (worldSeq.current !== seq) return; // a newer search took over
      setWorldItems(items);
      setWorldPage(1);
      setWorldHasMore(hasMore);
      setWorldFailed(!!failed);
      setWorldLoading(false);
    }, 600);
    return () => clearTimeout(timer);
  }, [query, mode]);

  const loadMoreWorld = async () => {
    const q = query.trim();
    if (!q || worldLoading) return;
    setWorldLoading(true);
    const next = worldPage + 1;
    const { items, hasMore } = await searchWorldFoods(q, next);
    setWorldItems((prev) => [...prev, ...items]);
    setWorldPage(next);
    setWorldHasMore(hasMore);
    setWorldLoading(false);
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
          <Text style={styles.headerTitle}>{t('hf.title')}</Text>
          <Text style={styles.headerSub}>{t('hf.subtitle')}</Text>
        </View>
        <View style={{ width: 36 }} />
      </View>

      {/* ── Mode toggle ── */}
      <View style={styles.modeRow}>
        <Pressable
          onPress={() => setMode('curated')}
          style={[styles.modeBtn, mode === 'curated' && styles.modeBtnOn]}
        >
          <Text style={[styles.modeText, mode === 'curated' && styles.modeTextOn]}>
            🥗 {t('hf.curatedTab')}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setMode('world')}
          style={[styles.modeBtn, mode === 'world' && styles.modeBtnOn]}
        >
          <Text style={[styles.modeText, mode === 'world' && styles.modeTextOn]}>
            🌍 {t('hf.worldTab')}
          </Text>
        </Pressable>
      </View>

      {/* ── Search ── */}
      <View style={styles.searchWrap}>
        <Text style={{ fontSize: 15 }}>🔍</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={mode === 'world' ? t('hf.searchWorld') : t('hf.search')}
          placeholderTextColor="#98a1af"
          style={styles.searchInput}
        />
        {query ? (
          <Pressable onPress={() => setQuery('')} hitSlop={8}>
            <Text style={{ fontSize: 13, color: '#8b93a7' }}>✕</Text>
          </Pressable>
        ) : null}
      </View>

      {mode === 'curated' ? (
        <>
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

          {/* ── Curated grid ── */}
          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{
              paddingHorizontal: 18,
              paddingTop: 14,
              paddingBottom: Math.max(insets.bottom, 12) + 20,
            }}
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.countText}>{t('hf.count', { count: foods.length })}</Text>
            <View style={styles.grid}>
              {foods.map((f) => {
                const [c1, c2] = healthyCategoryColors(f.category);
                const photo = HEALTHY_FOOD_IMAGES[f.id];
                const showPhoto = photo && !brokenImgs.has(f.id);
                return (
                  <Pressable
                    key={f.id}
                    style={styles.card}
                    onPress={() =>
                      router.push({ pathname: '/healthy-food', params: { id: f.id } })
                    }
                  >
                    {showPhoto ? (
                      <View style={styles.cardHero}>
                        <Image
                          source={{ uri: photo }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                          onError={() =>
                            setBrokenImgs((s) => new Set(s).add(f.id))
                          }
                        />
                        <View style={styles.giBadge}>
                          <Text style={styles.giBadgeText}>IG {f.gi}</Text>
                        </View>
                      </View>
                    ) : (
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
                    )}
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
        </>
      ) : (
        /* ── World database (Open Food Facts) ── */
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            paddingHorizontal: 18,
            paddingTop: 14,
            paddingBottom: Math.max(insets.bottom, 12) + 20,
          }}
          showsVerticalScrollIndicator={false}
        >
          {query.trim().length < 2 ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 8 }}>
              <Text style={{ fontSize: 40 }}>🌍</Text>
              <Text style={styles.worldHintTitle}>{t('hf.worldTitle')}</Text>
              <Text style={styles.worldHint}>{t('hf.worldHint')}</Text>
            </View>
          ) : worldLoading && !worldItems.length ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <ActivityIndicator color="#19c37d" />
              <Text style={styles.emptyText}>{t('hf.worldSearching')}</Text>
            </View>
          ) : !worldItems.length ? (
            <View style={{ alignItems: 'center', paddingVertical: 40, gap: 4 }}>
              <Text style={{ fontSize: 36 }}>{worldFailed ? '📡' : '🔍'}</Text>
              <Text style={styles.emptyText}>
                {worldFailed ? t('hf.worldDown') : t('hf.worldEmpty')}
              </Text>
            </View>
          ) : (
            <>
              <Text style={styles.countText}>{t('hf.per100gNote')}</Text>
              <View style={styles.grid}>
                {worldItems.map((w, idx) => {
                  const r = RATING[w.rating];
                  return (
                    <Pressable
                      key={`${w.code}-${idx}`}
                      style={styles.card}
                      onPress={() => setWorldSelected(w)}
                    >
                      <View style={[styles.cardHero, { backgroundColor: '#f2f4f9' }]}>
                        {w.imageUrl ? (
                          <Image
                            source={{ uri: w.imageUrl }}
                            style={StyleSheet.absoluteFill}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text style={{ fontSize: 38 }}>🛒</Text>
                        )}
                        <View style={[styles.ratingDot, { backgroundColor: r.color }]} />
                      </View>
                      <View style={styles.cardBody}>
                        <Text style={styles.cardName} numberOfLines={2}>
                          {w.name}
                        </Text>
                        <View style={styles.cardStats}>
                          <Text style={styles.cardStat}>🔥 {w.per100g.calories}</Text>
                          <Text style={styles.cardStat}>🍬 {w.per100g.sugar} g</Text>
                        </View>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
              {worldHasMore ? (
                <Pressable style={styles.moreBtn} onPress={loadMoreWorld}>
                  {worldLoading ? (
                    <ActivityIndicator color="#ffffff" size="small" />
                  ) : (
                    <Text style={styles.moreBtnText}>{t('hf.loadMore')}</Text>
                  )}
                </Pressable>
              ) : null}
            </>
          )}
        </ScrollView>
      )}

      {/* ── World product detail ── */}
      <Modal
        visible={!!worldSelected}
        transparent
        animationType="slide"
        onRequestClose={() => setWorldSelected(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            {worldSelected ? (
              <>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={styles.modalImgWrap}>
                    {worldSelected.imageUrl ? (
                      <Image
                        source={{ uri: worldSelected.imageUrl }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={{ fontSize: 34 }}>🛒</Text>
                    )}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.modalTitle} numberOfLines={3}>
                      {worldSelected.name}
                    </Text>
                    {worldSelected.brand ? (
                      <Text style={styles.modalBrand}>{worldSelected.brand}</Text>
                    ) : null}
                    <View
                      style={[
                        styles.ratingPill,
                        { backgroundColor: RATING[worldSelected.rating].bg },
                      ]}
                    >
                      <Text
                        style={[
                          styles.ratingPillText,
                          { color: RATING[worldSelected.rating].color },
                        ]}
                      >
                        {t(`hf.ds_${worldSelected.rating}`)}
                      </Text>
                    </View>
                  </View>
                  <Pressable onPress={() => setWorldSelected(null)} style={styles.modalClose}>
                    <Text style={{ fontSize: 16, color: '#5b6472' }}>✕</Text>
                  </Pressable>
                </View>
                <Text style={styles.per100Title}>{t('hf.per100g')}</Text>
                <View style={styles.nutriGrid}>
                  {(
                    [
                      ['🔥', 'hf.calories', `${worldSelected.per100g.calories} kcal`],
                      ['🍞', 'hf.carbs', `${worldSelected.per100g.carbs} g`],
                      ['🍬', 'hf.sugar', `${worldSelected.per100g.sugar} g`],
                      ['🥩', 'hf.protein', `${worldSelected.per100g.protein} g`],
                      ['🧈', 'hf.fat', `${worldSelected.per100g.fat} g`],
                      ['🌾', 'hf.fiber', `${worldSelected.per100g.fiber} g`],
                    ] as const
                  ).map(([icon, key, val]) => (
                    <View key={key} style={styles.nutriCell}>
                      <Text style={{ fontSize: 16 }}>{icon}</Text>
                      <Text style={styles.nutriValue}>{val}</Text>
                      <Text style={styles.nutriLabel}>{t(key)}</Text>
                    </View>
                  ))}
                </View>
                <Text style={styles.worldSource}>{t('hf.worldSource')}</Text>
              </>
            ) : null}
          </View>
        </View>
      </Modal>
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

  modeRow: {
    flexDirection: 'row',
    marginHorizontal: 18,
    backgroundColor: '#eef0f6',
    borderRadius: 14,
    padding: 4,
    gap: 4,
    marginBottom: 10,
  },
  modeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 9,
    borderRadius: 11,
  },
  modeBtnOn: {
    backgroundColor: '#ffffff',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  modeText: { fontFamily: F700, fontSize: 12, color: '#8b93a7' },
  modeTextOn: { color: '#111827' },

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
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  giBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    backgroundColor: 'rgba(255,255,255,0.88)',
    borderRadius: 999,
    paddingVertical: 2.5,
    paddingHorizontal: 8,
  },
  giBadgeText: { fontFamily: F800, fontSize: 9.5, color: '#0f7a45' },
  ratingDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2.5,
    borderColor: '#ffffff',
  },
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
  worldHintTitle: { fontFamily: F800, fontSize: 15, color: '#111827' },
  worldHint: {
    fontFamily: F500,
    fontSize: 12,
    color: '#8b93a7',
    textAlign: 'center',
    lineHeight: 18,
    paddingHorizontal: 24,
  },

  moreBtn: {
    backgroundColor: '#19c37d',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  moreBtnText: { fontFamily: F700, fontSize: 12.5, color: '#ffffff' },

  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(16,24,40,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 16,
  },
  modalImgWrap: {
    width: 84,
    height: 84,
    borderRadius: 14,
    backgroundColor: '#f2f4f9',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  modalTitle: { fontFamily: F800, fontSize: 14.5, color: '#111827' },
  modalBrand: { fontFamily: F600, fontSize: 11.5, color: '#8b93a7', marginTop: 2 },
  ratingPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 8,
  },
  ratingPillText: { fontFamily: F700, fontSize: 10.5 },
  modalClose: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#f1f3f8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  per100Title: { fontFamily: F800, fontSize: 12.5, color: '#111827', marginTop: 14, marginBottom: 8 },
  nutriGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nutriCell: {
    width: '31%',
    flexGrow: 1,
    backgroundColor: '#f6f8fc',
    borderRadius: 12,
    alignItems: 'center',
    paddingVertical: 8,
    gap: 1,
  },
  nutriValue: { fontFamily: F800, fontSize: 12, color: '#111827' },
  nutriLabel: { fontFamily: F500, fontSize: 9, color: '#8b93a7' },
  worldSource: {
    fontFamily: F500,
    fontSize: 9.5,
    color: '#a6aebc',
    textAlign: 'center',
    marginTop: 12,
  },
});
