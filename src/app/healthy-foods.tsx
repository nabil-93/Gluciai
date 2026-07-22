import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Spinner } from '@/components/ui/Spinner';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft, FadeInView, PressableScale } from '@/components/ui';
import { CoachChatModal } from '@/components/CoachChatModal';
import { isRTL } from '@/i18n';
import { useAppStore } from '@/store/useAppStore';
import {
  MOMENTS,
  filterHealthyFoods,
  getHealthyFood,
  healthyCategoryColors,
  healthyFoodName,
  momentCounts,
  type HealthyFood,
  type Moment,
} from '@/data/healthyFoods';
import { HEALTHY_FOOD_IMAGES } from '@/data/healthyFoodImages';
import {
  biggerOffImage,
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

/** Heart glyph for the per-card favorite toggle — filled red when saved. */
function HeartGlyph({ filled }: { filled: boolean }) {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Path
        d="M12 21s-7.5-4.6-10-9.1C.4 8.9 1.8 5.5 5 5.1c2-.3 3.4.8 4.2 2 .3.5.8.5 1.1 0 .8-1.2 2.2-2.3 4.2-2 3.2.4 4.6 3.8 3 6.8C19.5 16.4 12 21 12 21z"
        fill={filled ? '#ef4444' : 'none'}
        stroke={filled ? '#ef4444' : '#7b8595'}
        strokeWidth={2.1}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * "Makla si7iya" — two worlds in one screen:
 *  · Sélection santé: our curated diabetes-friendly dishes (mostly
 *    Moroccan) with real photos, nutrition and cooking steps;
 *  · Base mondiale: live search across the Open Food Facts database
 *    (millions of products, real photos, per-100 g nutrition) with a
 *    diabetes-friendliness rating.
 */
/* Gate: "Makla saine" hosts two hideable sub-sections — Sélection Santé
 * (curated) and Base Mondiale (world food search). The admin can hide each
 * one per patient from the dashboard. If BOTH are hidden the screen
 * redirects home; if only one is hidden it opens straight into the other
 * with the segmented control removed. */
export default function HealthyFoodsGate() {
  const locked = useAppStore((s) => s.lockedFeatures);
  const allowSelection = !locked.includes('healthy_selection');
  const allowWorld = !locked.includes('world_foods');
  if (!allowSelection && !allowWorld) return <Redirect href="/(tabs)" />;
  return <HealthyFoodsScreen allowSelection={allowSelection} allowWorld={allowWorld} />;
}

function HealthyFoodsScreen({
  allowSelection,
  allowWorld,
}: {
  allowSelection: boolean;
  allowWorld: boolean;
}) {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);

  // Both sub-sections visible → the patient picks; only one → force it.
  const bothModes = allowSelection && allowWorld;
  const [mode, setMode] = useState<'curated' | 'world'>(
    allowSelection ? 'curated' : 'world'
  );
  /** The AI meal-coach chat (opened from the header robot). */
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [query, setQuery] = useState('');
  /* Sliding pill of the segmented control (iOS-style). */
  const [segW, setSegW] = useState(0);
  const segAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(segAnim, {
      toValue: mode === 'curated' ? 0 : 1,
      speed: 22,
      bounciness: 7,
      useNativeDriver: true,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);
  /** Meal-time "folder" filter (ftour / ghda / 3cha / snack / drink / dessert). */
  const [moment, setMoment] = useState<Moment | null>(null);
  /** "Favoris" folder — shows only the dishes the patient saved (catalog + AI). */
  const [favMode, setFavMode] = useState(false);
  const favoriteFoodIds = useAppStore((s) => s.favoriteFoodIds);
  const favoriteCustomDishes = useAppStore((s) => s.favoriteCustomDishes);
  const toggleFavoriteFood = useAppStore((s) => s.toggleFavoriteFood);
  const counts = useMemo(() => momentCounts(), []);
  /** Curated photos that failed to load fall back to the emoji hero. */
  const [brokenImgs, setBrokenImgs] = useState<Set<string>>(new Set());

  // ── World search state ──
  const [worldItems, setWorldItems] = useState<WorldFood[]>([]);
  const [worldPage, setWorldPage] = useState(1);
  const [worldHasMore, setWorldHasMore] = useState(false);
  const [worldFailed, setWorldFailed] = useState(false);
  const [worldSelected, setWorldSelected] = useState<WorldFood | null>(null);
  /** Key (query) of the last search whose results are on screen — the
   *  search spinner is DERIVED from it (no sync setState in the effect). */
  const [worldDoneKey, setWorldDoneKey] = useState<string | null>(null);
  /** Pagination spinner — set from the load-more press (event time). */
  const [moreLoading, setMoreLoading] = useState(false);
  const worldSeq = useRef(0);

  const foods = useMemo(
    () => filterHealthyFoods(query, moment),
    [query, moment]
  );

  // Favorites list: resolve each saved id from the bundled catalog, falling
  // back to the persisted custom (AI) dish. Most-recently-saved first, then
  // filtered by the search box like the main list.
  const favFoods = useMemo(() => {
    const byId = new Map(favoriteCustomDishes.map((d) => [d.id, d]));
    const list = favoriteFoodIds
      .map((fid) => getHealthyFood(fid) ?? byId.get(fid) ?? null)
      .filter((f): f is HealthyFood => !!f);
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter(
      (f) =>
        healthyFoodName(f, i18n.language).toLowerCase().includes(q) ||
        f.name_fr.toLowerCase().includes(q)
    );
  }, [favoriteFoodIds, favoriteCustomDishes, query, i18n.language]);

  const curatedFoods = favMode ? favFoods : foods;

  // World tab: with an EMPTY query the list is pre-loaded with the most
  // popular products in Morocco; from 2 typed characters, live
  // type-ahead suggestions replace it (350 ms debounce). Previous
  // results stay on screen while the next ones load.
  const worldQuery = query.trim().length >= 2 ? query.trim() : '';
  useEffect(() => {
    if (mode !== 'world') return;
    const seq = ++worldSeq.current;
    const timer = setTimeout(
      async () => {
        const { items, hasMore, failed } = await searchWorldFoods(worldQuery, 1);
        if (worldSeq.current !== seq) return; // a newer search took over
        setWorldItems(items);
        setWorldPage(1);
        setWorldHasMore(hasMore);
        setWorldFailed(!!failed);
        setWorldDoneKey(worldQuery);
      },
      worldQuery ? 350 : 0
    );
    return () => clearTimeout(timer);
  }, [worldQuery, mode]);

  // Searching while the on-screen results don't answer the current query.
  const worldLoading =
    (mode === 'world' && worldDoneKey !== worldQuery) || moreLoading;

  const loadMoreWorld = async () => {
    if (worldLoading) return;
    setMoreLoading(true);
    const next = worldPage + 1;
    const { items, hasMore } = await searchWorldFoods(worldQuery, next);
    setWorldItems((prev) => [...prev, ...items]);
    setWorldPage(next);
    setWorldHasMore(hasMore);
    setMoreLoading(false);
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
        {/* AI meal coach lives in the header, next to the title. */}
        {allowSelection ? (
          <Pressable
            onPress={() => setAssistantOpen(true)}
            style={styles.headerRobot}
            hitSlop={8}
            accessibilityLabel={t('healthyAI.title')}
          >
            <AnimatedRobot size={30} mood="happy" />
          </Pressable>
        ) : (
          <View style={{ width: 40 }} />
        )}
      </View>

      {/* ── Mode toggle (iOS segmented control with sliding pill) ──
          Shown only when BOTH sub-sections are available to this patient. */}
      {bothModes ? (
      <View
        style={styles.modeRow}
        onLayout={(e) => setSegW(e.nativeEvent.layout.width)}
      >
        {segW > 0 ? (
          <Animated.View
            style={[
              styles.modePill,
              {
                width: (segW - 8) / 2,
                transform: [
                  {
                    translateX: segAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, (segW - 8) / 2],
                    }),
                  },
                ],
              },
            ]}
          />
        ) : null}
        <Pressable onPress={() => setMode('curated')} style={styles.modeBtn}>
          <Text style={[styles.modeText, mode === 'curated' && styles.modeTextOn]}>
            🥗 {t('hf.curatedTab')}
          </Text>
        </Pressable>
        <Pressable onPress={() => setMode('world')} style={styles.modeBtn}>
          <Text style={[styles.modeText, mode === 'world' && styles.modeTextOn]}>
            🌍 {t('hf.worldTab')}
          </Text>
        </Pressable>
      </View>
      ) : null}

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
              onPress={() => {
                setMoment(null);
                setFavMode(false);
              }}
              style={[styles.catChip, moment === null && !favMode && styles.catChipOn]}
            >
              <Text
                style={[
                  styles.catChipText,
                  moment === null && !favMode && styles.catChipTextOn,
                ]}
              >
                {t('hf.all')}
              </Text>
            </Pressable>
            {/* Favoris folder — the dishes the patient saved (catalog + AI). */}
            <Pressable
              onPress={() => {
                setFavMode((v) => !v);
                setMoment(null);
              }}
              style={[styles.catChip, favMode && styles.catChipOn]}
            >
              <HeartGlyph filled={favMode} />
              <Text style={[styles.catChipText, favMode && styles.catChipTextOn]}>
                {t('hf.favorites')}
              </Text>
              {favoriteFoodIds.length ? (
                <View style={[styles.favCountPill, favMode && styles.favCountPillOn]}>
                  <Text style={[styles.favCountText, favMode && styles.favCountTextOn]}>
                    {favoriteFoodIds.length}
                  </Text>
                </View>
              ) : null}
            </Pressable>
            {MOMENTS.map((m) => {
              const on = moment === m.key;
              const count = counts[m.key];
              if (!count) return null;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => {
                    setMoment(on ? null : m.key);
                    setFavMode(false);
                  }}
                  style={[styles.catChip, on && styles.catChipOn]}
                >
                  <Text style={{ fontSize: 13 }}>{m.emoji}</Text>
                  <Text style={[styles.catChipText, on && styles.catChipTextOn]}>
                    {t(`hf.moment.${m.key}`)}
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
            <Text style={styles.countText}>{t('hf.count', { count: curatedFoods.length })}</Text>
            <View style={styles.grid}>
              {curatedFoods.map((f, i) => {
                const [c1, c2] = healthyCategoryColors(f.category);
                const photo = HEALTHY_FOOD_IMAGES[f.id];
                const showPhoto = photo && !brokenImgs.has(f.id);
                // A dish not in the bundled catalog is a custom (AI) dish —
                // route it as ?custom and persist its data when favorited.
                const isCustom = !getHealthyFood(f.id);
                const isFav = favoriteFoodIds.includes(f.id);
                return (
                  <FadeInView key={f.id} delay={Math.min(i, 10) * 50} style={styles.gridItem}>
                    <PressableScale
                      style={styles.card}
                      haptic={false}
                      onPress={() =>
                        router.push({
                          pathname: '/healthy-food',
                          params: isCustom ? { custom: f.id } : { id: f.id },
                        })
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
                          <Text style={{ fontSize: 46 }}>{f.emoji}</Text>
                          <View style={styles.giBadge}>
                            <Text style={styles.giBadgeText}>IG {f.gi}</Text>
                          </View>
                        </LinearGradient>
                      )}
                      {/* Favorite toggle — sits over the hero, top-left. */}
                      <Pressable
                        onPress={() => toggleFavoriteFood(f.id, isCustom ? f : null)}
                        style={styles.cardFav}
                        hitSlop={8}
                        accessibilityRole="button"
                        accessibilityLabel={t(isFav ? 'hf.favRemove' : 'hf.favAdd')}
                      >
                        <HeartGlyph filled={isFav} />
                      </Pressable>
                      <View style={styles.cardBody}>
                        <Text style={styles.cardName} numberOfLines={2}>
                          {healthyFoodName(f, i18n.language)}
                        </Text>
                        <View style={styles.cardStats}>
                          <Text style={styles.cardStat}>🔥 {f.calories} kcal</Text>
                          <Text style={styles.cardStat}>🍞 {f.carbs} g</Text>
                        </View>
                      </View>
                    </PressableScale>
                  </FadeInView>
                );
              })}
            </View>
            {!curatedFoods.length ? (
              <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                <Text style={{ fontSize: 36 }}>{favMode ? '🤍' : '🔍'}</Text>
                <Text style={styles.emptyText}>
                  {favMode ? t('hf.favEmpty') : t('hf.empty')}
                </Text>
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
          {worldLoading && !worldItems.length ? (
            <View style={{ alignItems: 'center', paddingVertical: 40 }}>
              <Spinner size={26} color="#19c37d" />
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
              <View style={styles.worldHead}>
                <Text style={styles.countText}>
                  {worldQuery ? t('hf.per100gNote') : `🇲🇦 ${t('hf.worldPopular')}`}
                </Text>
                {worldLoading ? (
                  <Spinner size={20} color="#19c37d" />
                ) : null}
              </View>
              <View style={styles.grid}>
                {worldItems.map((w, idx) => {
                  const r = RATING[w.rating];
                  return (
                    <FadeInView
                      key={`${w.code}-${idx}`}
                      delay={Math.min(idx % 24, 10) * 45}
                      style={styles.gridItem}
                    >
                      <PressableScale
                        style={styles.card}
                        haptic={false}
                        onPress={() => setWorldSelected(w)}
                      >
                        <View style={[styles.cardHero, { backgroundColor: '#f6f8fc' }]}>
                          {w.imageUrl ? (
                            <Image
                              source={{ uri: biggerOffImage(w.imageUrl) ?? w.imageUrl }}
                              style={StyleSheet.absoluteFill}
                              resizeMode="contain"
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
                      </PressableScale>
                    </FadeInView>
                  );
                })}
              </View>
              {worldHasMore ? (
                <PressableScale style={styles.moreBtn} haptic={false} onPress={loadMoreWorld}>
                  {worldLoading ? (
                    <Spinner size={20} color="#ffffff" />
                  ) : (
                    <Text style={styles.moreBtnText}>{t('hf.loadMore')}</Text>
                  )}
                </PressableScale>
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
                        source={{
                          uri:
                            biggerOffImage(
                              worldSelected.imageLarge ?? worldSelected.imageUrl
                            ) ?? worldSelected.imageUrl,
                        }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="contain"
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

      {/* AI meal coach — opened from the header robot. Free-form smart chat
          (no rigid script): understands any request in any language/dialect
          and proposes curated dishes as tappable cards. */}
      {allowSelection ? (
        <CoachChatModal
          open={assistantOpen}
          onOpenChange={setAssistantOpen}
          title={t('healthyAI.title')}
          subtitle={t('healthyAI.sub')}
          greeting={t('healthyAI.greeting')}
          placeholder={t('healthyAI.placeholder')}
          errorText={t('common.error')}
          starters={[
            t('healthyAI.starters.today'),
            t('healthyAI.starters.salad'),
            t('healthyAI.starters.dinner'),
            t('healthyAI.starters.dessert'),
          ]}
        />
      ) : null}
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
  headerRobot: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#e9fbf2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#ffffff',
    shadowColor: '#19c37d',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  modeRow: {
    flexDirection: 'row',
    marginHorizontal: 18,
    backgroundColor: '#eef0f6',
    borderRadius: 16,
    padding: 4,
    marginBottom: 10,
    position: 'relative',
  },
  modePill: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: 13,
    backgroundColor: '#ffffff',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 2,
  },
  modeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 13,
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
  favCountPill: {
    minWidth: 17,
    height: 17,
    borderRadius: 9,
    paddingHorizontal: 4,
    backgroundColor: '#e9fbf2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  favCountPillOn: { backgroundColor: 'rgba(255,255,255,0.28)' },
  favCountText: { fontFamily: F800, fontSize: 10, color: '#0f7a45' },
  favCountTextOn: { color: '#ffffff' },

  countText: { fontFamily: F500, fontSize: 11, color: '#a6aebc', marginBottom: 8 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  gridItem: { width: '48%', flexGrow: 1 },
  worldHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    gap: 8,
  },
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.09,
    shadowRadius: 14,
    elevation: 3,
  },
  cardHero: {
    height: 122,
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
  cardFav: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(255,255,255,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 2,
  },
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
