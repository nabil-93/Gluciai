import React, { useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import Svg, { Path } from 'react-native-svg';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft, FadeInView, GaugeRing, GlycemicBar, glycemicTone } from '@/components/ui';
import { CoachChatModal } from '@/components/CoachChatModal';
import { isRTL } from '@/i18n';
import {
  getHealthyFood,
  healthyCategoryColors,
  healthyFoodIngredients,
  healthyFoodName,
  healthyFoodSteps,
  healthyFoodWhy,
  type HealthyFood,
} from '@/data/healthyFoods';
import { HEALTHY_FOOD_IMAGES } from '@/data/healthyFoodImages';
import { getCustomDish } from '@/services/healthyCoach';
import { ratioForMeal } from '@/services/bolusEngine';
import { useAppStore } from '@/store/useAppStore';
import type { MealType, Profile } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/** Symmetric about x=12 and centred in the 24×24 box — the old path leaned
 *  left and its right lobe was dented. Kept in step with the list screen. */
const HEART_PATH =
  'M12 19.7C9.4 17.5 3.3 12.6 3.3 8.4A4.7 4.7 0 0 1 12 6.6a4.7 4.7 0 0 1 8.7 1.8c0 4.2-6.1 9.1-8.7 11.3z';

/** Heart glyph for the favorite toggle — a clear red heart (outline when not
 *  saved, solid when saved) so it reads well on any coloured hero. */
function HeartIcon({ filled }: { filled: boolean }) {
  return (
    <Svg width={21} height={21} viewBox="0 0 24 24">
      <Path
        d={HEART_PATH}
        fill={filled ? '#ef4444' : 'none'}
        stroke="#ef4444"
        strokeWidth={2.2}
        strokeLinejoin="round"
      />
    </Svg>
  );
}

/**
 * Detail page of one healthy food: hero, "why it's good for YOUR
 * diabetes", full nutrition per serving, and the preparation steps.
 * Reached from the list screen or straight from an AI chat link.
 */
export default function HealthyFoodDetailScreen() {
  const router = useRouter();
  // `id` → a curated catalog dish; `custom` → an AI-generated dish kept in
  // the in-session registry (from the Makla saine coach). Both render here.
  const { id, custom } = useLocalSearchParams<{ id?: string; custom?: string }>();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const rtl = isRTL(i18n.language);

  const [imgBroken, setImgBroken] = useState(false);
  // The dish AI can rewrite the recipe ("add an egg", "cut the calories") →
  // the edited dish overrides the base one on this screen until you leave.
  const [override, setOverride] = useState<HealthyFood | null>(null);
  const [aiOpen, setAiOpen] = useState(false);
  const [insulinOpen, setInsulinOpen] = useState(false);
  // "Sélection Santé" hidden by the admin → this detail page redirects home.
  const selectionHidden = useAppStore((s) =>
    s.lockedFeatures.includes('healthy_selection')
  );
  const favoriteFoodIds = useAppStore((s) => s.favoriteFoodIds);
  const favoriteCustomDishes = useAppStore((s) => s.favoriteCustomDishes);
  const toggleFavoriteFood = useAppStore((s) => s.toggleFavoriteFood);
  const profile = useAppStore((s) => s.profile);

  // `custom` first resolves from the in-session coach registry; if that's
  // empty (e.g. after a reload) but the dish was FAVORITED, fall back to the
  // persisted favorites so a saved AI dish stays openable.
  const customId = String(custom ?? '');
  const baseFood =
    getHealthyFood(String(id ?? '')) ??
    getCustomDish(customId) ??
    favoriteCustomDishes.find((d) => d.id === customId) ??
    null;
  if (selectionHidden) return <Redirect href="/(tabs)" />;
  if (!baseFood) return <Redirect href="/healthy-foods" />;

  // What's shown: the AI-edited dish when there is one, else the base dish.
  const food = override ?? baseFood;
  const isModified = override != null;

  // A dish is "custom" (AI-generated or AI-edited) when it isn't in the
  // bundled catalog — those we persist in full so the favorite survives a
  // reload.
  const isCustom = !getHealthyFood(food.id);
  const isFavorite = favoriteFoodIds.includes(food.id);
  const toggleFavorite = () =>
    toggleFavoriteFood(food.id, isCustom ? food : null);
  const photo = HEALTHY_FOOD_IMAGES[food.id];
  const showPhoto = !!photo && !imgBroken;

  const [c1, c2] = healthyCategoryColors(food.category);
  const name = healthyFoodName(food, i18n.language);
  const why = healthyFoodWhy(food, i18n.language);
  const ingredients = healthyFoodIngredients(food, i18n.language);
  const steps = healthyFoodSteps(food, i18n.language);

  // Everything the dish AI needs to know about the plate on screen, plus the
  // protocol to edit it. Injected as hidden context so the chat is dish-aware
  // and can rewrite the recipe live (no rigid script — the smart chat brain).
  const dishForAI = {
    name,
    emoji: food.emoji,
    category: food.category,
    serving: food.serving,
    grams: food.grams,
    calories: food.calories,
    carbs: food.carbs,
    sugar: food.sugar,
    protein: food.protein,
    fat: food.fat,
    fiber: food.fiber,
    gi: food.gi,
    why,
    ingredients,
    steps,
  };
  const dishContext =
    `CONTEXTE — le patient regarde CE plat de « Sélection Santé » (Makla saine) ` +
    `et te pose des questions dessus. Voici le plat exact (nutrition par portion) :\n` +
    `${JSON.stringify(dishForAI)}\n\n` +
    `Règles pour ce plat :\n` +
    `- Réponds à ses questions sur CE plat (nutrition, préparation, adaptation à SON diabète en te servant de son profil et de ses données).\n` +
    `- S'il demande de MODIFIER le plat (ajouter/retirer un ingrédient, réduire les calories ou les glucides, changer la portion, le rendre plus rassasiant, etc.), RECALCULE toute la nutrition de façon cohérente et exacte (calories = somme réelle des ingrédients, glucides/sucre/protéines/lipides/fibres/IG mis à jour), puis renvoie le plat mis à jour comme UN SEUL bloc, seul sur sa ligne, EXACTEMENT ainsi :\n` +
    `[[dish:{"name":"...","emoji":"...","category":"${food.category}","serving":"...","grams":0,"calories":0,"carbs":0,"sugar":0,"protein":0,"fat":0,"fiber":0,"gi":0,"why":"...","ingredients":["..."],"steps":["..."]}]]\n` +
    `  Garde TOUS les champs, écris le texte (name/why/ingredients/steps) dans la langue du patient. AVANT le bloc, présente la modification comme une PROPOSITION à confirmer (n'affirme jamais qu'elle est déjà appliquée) et résume en une phrase claire CE QUI CHANGE avec les chiffres (ex. « +1 œuf → +78 kcal, +6 g de protéines »). Le patient devra la confirmer pour l'appliquer. N'émets [[dish:...]] QUE lors d'une vraie demande de modification, jamais sinon.`;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/healthy-foods');
  };

  // Standard GI cut-offs (low ≤55 · medium 56-69 · high ≥70) so the hero
  // badge, the bar's colour/value and the one-line explanation all agree.
  const igKey = glycemicTone(food.gi).key;
  const giTone =
    igKey === 'low'
      ? { bg: '#e9fbf2', text: '#0f7a45', label: t('hf.giLow') }
      : igKey === 'medium'
        ? { bg: '#fdf4e3', text: '#a16207', label: t('hf.giMedium') }
        : { bg: '#fdeaea', text: '#b91c1c', label: t('hf.giHigh') };

  const igDesc = t(
    igKey === 'low'
      ? 'hf.igDescLow'
      : igKey === 'medium'
        ? 'hf.igDescMedium'
        : 'hf.igDescHigh'
  );
  const igScale: [string, string, string] = [
    t('hf.igScaleLow'),
    t('hf.igScaleMedium'),
    t('hf.igScaleHigh'),
  ];

  /* Nutrition as animated gauge rings: each arc = share of an indicative
   * daily reference (2000 kcal · 250 g carbs · 50 g sugar · 100 g protein
   * · 70 g fat · 30 g fiber), value in the middle, one color per nutrient. */
  const RINGS: {
    labelKey: string;
    value: string;
    unit: string;
    progress: number;
    color: string;
  }[] = [
    { labelKey: 'hf.calories', value: `${food.calories}`, unit: 'kcal', progress: food.calories / 2000, color: '#f97316' },
    { labelKey: 'hf.carbs', value: `${food.carbs}`, unit: 'g', progress: food.carbs / 250, color: '#6366f1' },
    { labelKey: 'hf.sugar', value: `${food.sugar}`, unit: 'g', progress: food.sugar / 50, color: '#ef4444' },
    { labelKey: 'hf.protein', value: `${food.protein}`, unit: 'g', progress: food.protein / 100, color: '#8b5cf6' },
    { labelKey: 'hf.fat', value: `${food.fat}`, unit: 'g', progress: food.fat / 70, color: '#f59e0b' },
    { labelKey: 'hf.fiber', value: `${food.fiber}`, unit: 'g', progress: food.fiber / 30, color: '#10b981' },
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
          <Pressable
            onPress={toggleFavorite}
            style={styles.favBtn}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t(isFavorite ? 'hf.favRemove' : 'hf.favAdd')}
          >
            <HeartIcon filled={isFavorite} />
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
            {isModified ? (
              <View style={[styles.badge, { backgroundColor: '#ede9fe' }]}>
                <Text style={[styles.badgeText, { color: '#6d28d9' }]}>
                  ✨ {t('hf.modifiedByAi')}
                </Text>
              </View>
            ) : null}
          </View>
          {/* Meal-time folders this dish belongs to */}
          <View style={styles.momentRow}>
            {food.moments.map((m) => (
              <View key={m} style={styles.momentPill}>
                <Text style={styles.momentPillText}>{t(`hf.moment.${m}`)}</Text>
              </View>
            ))}
          </View>
        </LinearGradient>

        <View style={{ paddingHorizontal: 18 }}>
          {/* ── Why good ── */}
          <View style={[styles.card, styles.whyCard]}>
            <Text style={styles.whyTitle}>💚 {t('hf.whyTitle')}</Text>
            <Text style={styles.whyText}>{why}</Text>
          </View>

          {/* ── Glycemic index — segmented bar + what it means ── */}
          <FadeInView delay={60}>
            <View style={styles.card}>
              <GlycemicBar
                value={food.gi}
                title={t('hf.igBarTitle')}
                description={igDesc}
                scale={igScale}
              />
            </View>
          </FadeInView>

          {/* ── Nutrition — animated gauge rings ── */}
          <FadeInView delay={80}>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>📊 {t('hf.nutritionTitle')}</Text>
              <Text style={styles.servingNote}>
                {t('hf.perServing', { serving: food.serving })}
              </Text>
              <View style={styles.ringGrid}>
                {RINGS.map((n, i) => (
                  <GaugeRing
                    key={n.labelKey}
                    size={92}
                    stroke={9}
                    progress={n.progress}
                    color={n.color}
                    value={n.value}
                    unit={n.unit}
                    label={t(n.labelKey)}
                    delay={i * 110}
                  />
                ))}
              </View>
            </View>
          </FadeInView>

          {/* ── Ingredients ── */}
          <View style={styles.card}>
            <Text style={styles.sectionTitle}>🧺 {t('hf.ingredientsTitle')}</Text>
            <View style={{ gap: 8, marginTop: 4 }}>
              {ingredients.map((ing, i) => (
                <View key={i} style={styles.ingRow}>
                  <View style={styles.ingDot} />
                  <Text style={styles.ingText}>{ing}</Text>
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

          {/* ── Insulin for this dish ── */}
          <Pressable style={styles.insulinBtn} onPress={() => setInsulinOpen(true)}>
            <Text style={{ fontSize: 17 }}>💉</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.insulinBtnText}>{t('hf.insulinTitle')}</Text>
              <Text style={styles.insulinBtnSub}>{t('hf.insulinSub')}</Text>
            </View>
            <Text style={styles.insulinChev}>›</Text>
          </Pressable>

          {/* ── Ask / modify the dish with the AI (in-page, dish-aware) ── */}
          <Pressable style={styles.askBtn} onPress={() => setAiOpen(true)}>
            <Text style={{ fontSize: 17 }}>💬</Text>
            <Text style={styles.askBtnText}>{t('hf.askAi')}</Text>
          </Pressable>
          <Text style={styles.askHint}>{t('hf.askAiHint')}</Text>

          <Text style={styles.disclaimer}>{t('hf.disclaimer')}</Text>
        </View>
      </ScrollView>

      {/* ── In-page dish AI: knows this exact plate, answers & can rewrite it ── */}
      <CoachChatModal
        open={aiOpen}
        onOpenChange={setAiOpen}
        title={t('hf.aiTitle')}
        subtitle={name}
        greeting={t('hf.aiGreeting', { dish: name })}
        placeholder={t('hf.aiPlaceholder')}
        errorText={t('common.error')}
        contextPreamble={dishContext}
        onDishUpdate={setOverride}
        currentDish={food}
        starters={[
          t('hf.aiStarter1'),
          t('hf.aiStarter2'),
          t('hf.aiStarter3'),
        ]}
      />

      {/* ── Insulin-for-this-dish calculator ── */}
      <InsulinForDishModal
        visible={insulinOpen}
        onClose={() => setInsulinOpen(false)}
        dishName={name}
        carbs={food.carbs}
        moments={food.moments}
        profile={profile}
        onAskAi={() => {
          setInsulinOpen(false);
          setTimeout(() => setAiOpen(true), 120);
        }}
      />
    </View>
  );
}

/** Which per-meal ratio a dish's moment maps to. */
const MOMENT_TO_MEAL: Record<string, MealType> = {
  ftour: 'breakfast',
  ghda: 'lunch',
  '3cha': 'dinner',
  snack: 'snack',
  drink: 'snack',
  dessert: 'snack',
};
const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];

/**
 * "How much insulin for this dish?" — a small transparent estimate: the meal
 * bolus for the dish's carbs using the patient's OWN per-meal ratio (their
 * doctor's plan, via `ratioForMeal`). Deterministic (the app never invents a
 * dose), lets the patient pick which meal the ratio should come from, and
 * offers to ask the AI for a fully personalized proposition (which factors in
 * glucose, activity, insulin on board, etc. from the profile).
 */
function InsulinForDishModal({
  visible,
  onClose,
  dishName,
  carbs,
  moments,
  profile,
  onAskAi,
}: {
  visible: boolean;
  onClose: () => void;
  dishName: string;
  carbs: number;
  moments: string[];
  profile: Profile | null;
  onAskAi: () => void;
}) {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const defaultMeal = MOMENT_TO_MEAL[moments[0]] ?? 'lunch';
  const [meal, setMeal] = useState<MealType>(defaultMeal);

  // Reset the meal to the dish's own moment each time the sheet opens.
  const [wasVisible, setWasVisible] = useState(false);
  if (visible !== wasVisible) {
    setWasVisible(visible);
    if (visible) setMeal(defaultMeal);
  }

  const r = ratioForMeal(profile, meal);
  const dose = carbs > 0 ? Math.round((carbs / r.gPerU) * 10) / 10 : 0;
  const ratioLine =
    r.source === 'meal'
      ? t('hf.insulinRatioMeal', { u: r.uPer10g })
      : r.source === 'global'
        ? t('hf.insulinRatioGlobal', { g: Math.round(r.gPerU * 10) / 10 })
        : t('hf.insulinRatioDefault');

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.insOverlay} onPress={onClose}>
        <Pressable
          style={[styles.insSheet, { paddingBottom: Math.max(insets.bottom, 12) + 12 }]}
          onPress={() => {}}
        >
          <View style={styles.insHandle} />
          <View style={styles.insHead}>
            <Text style={{ fontSize: 20 }}>💉</Text>
            <Text style={styles.insTitle}>{t('hf.insulinTitle')}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.insClose}>✕</Text>
            </Pressable>
          </View>
          <Text style={styles.insDish} numberOfLines={2}>{dishName}</Text>

          {/* Which meal — the ratio differs per moment */}
          <Text style={styles.insLabel}>{t('hf.insulinForMeal')}</Text>
          <View style={styles.insMealRow}>
            {MEAL_ORDER.map((m) => {
              const on = m === meal;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMeal(m)}
                  style={[styles.insMealChip, on && styles.insMealChipOn]}
                >
                  <Text style={[styles.insMealText, on && styles.insMealTextOn]}>
                    {t(`nutritionPage.mt.${m}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          {/* The estimate */}
          <View style={styles.insResult}>
            <Text style={styles.insDoseValue}>
              ≈ {dose} <Text style={styles.insDoseUnit}>U</Text>
            </Text>
            <Text style={styles.insDoseSub}>
              {t('hf.insulinForCarbs', { carbs: Math.round(carbs) })}
            </Text>
            <Text style={styles.insRatio}>{ratioLine}</Text>
          </View>

          {r.source === 'default' ? (
            <Text style={styles.insWarn}>{t('hf.insulinNoRatio')}</Text>
          ) : null}

          <Pressable style={styles.insAskBtn} onPress={onAskAi}>
            <Text style={{ fontSize: 15 }}>🤖</Text>
            <Text style={styles.insAskText}>{t('hf.insulinAskAi')}</Text>
          </Pressable>

          <Text style={styles.insDisclaimer}>{t('hf.insulinDisclaimer')}</Text>
        </Pressable>
      </Pressable>
    </Modal>
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
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 46,
    zIndex: 2,
    shadowColor: 'rgba(20,30,45,1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 4,
  },
  favBtn: {
    position: 'absolute',
    right: 16,
    top: 0,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 46,
    zIndex: 2,
    shadowColor: 'rgba(20,30,45,1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.18,
    shadowRadius: 7,
    elevation: 4,
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
  momentRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 24,
  },
  momentPill: {
    backgroundColor: 'rgba(255,255,255,0.55)',
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  momentPillText: { fontFamily: F700, fontSize: 10.5, color: '#2b3a2f' },

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
  ringGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    rowGap: 18,
    paddingVertical: 6,
  },

  ingRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  ingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#19c37d',
    marginTop: 6,
  },
  ingText: {
    flex: 1,
    fontFamily: F500,
    fontSize: 12.5,
    lineHeight: 19,
    color: '#3b4657',
  },

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
  askHint: {
    fontFamily: F500,
    fontSize: 10.5,
    color: '#8b93a7',
    textAlign: 'center',
    marginTop: 6,
    paddingHorizontal: 16,
    lineHeight: 15,
  },

  /* Insulin-for-dish button + calculator sheet */
  insulinBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderWidth: 1.5,
    borderColor: '#e4e7f0',
    borderRadius: 16,
    paddingVertical: 13,
    paddingHorizontal: 14,
    marginTop: 14,
  },
  insulinBtnText: { fontFamily: F800, fontSize: 13.5, color: '#111827' },
  insulinBtnSub: { fontFamily: F500, fontSize: 11, color: '#8b93a7', marginTop: 1 },
  insulinChev: { fontFamily: F700, fontSize: 22, color: '#c2c9d4' },

  insOverlay: { flex: 1, backgroundColor: 'rgba(16,24,40,0.5)', justifyContent: 'flex-end' },
  insSheet: {
    backgroundColor: '#f9fafe',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  insHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#d7dbe4',
    alignSelf: 'center',
    marginBottom: 12,
  },
  insHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  insTitle: { flex: 1, fontFamily: F800, fontSize: 15, color: '#111827' },
  insClose: { fontSize: 16, color: '#8b93a7' },
  insDish: { fontFamily: F600, fontSize: 12.5, color: '#5b6472', marginTop: 4 },

  insLabel: { fontFamily: F700, fontSize: 11.5, color: '#6b7280', marginTop: 16, marginBottom: 8 },
  insMealRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  insMealChip: {
    backgroundColor: '#ffffff',
    borderWidth: 1,
    borderColor: '#e4e7f0',
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 13,
  },
  insMealChipOn: { backgroundColor: '#19c37d', borderColor: '#19c37d' },
  insMealText: { fontFamily: F600, fontSize: 12, color: '#3b4657' },
  insMealTextOn: { color: '#ffffff' },

  insResult: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 16,
    shadowColor: 'rgba(30,50,70,1)',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.06,
    shadowRadius: 10,
    elevation: 2,
  },
  insDoseValue: { fontFamily: F800, fontSize: 40, color: '#0f7a45' },
  insDoseUnit: { fontFamily: F800, fontSize: 20, color: '#19c37d' },
  insDoseSub: { fontFamily: F600, fontSize: 12, color: '#5b6472', marginTop: 2 },
  insRatio: { fontFamily: F500, fontSize: 11.5, color: '#8b93a7', marginTop: 8, textAlign: 'center' },
  insWarn: {
    fontFamily: F600,
    fontSize: 11.5,
    color: '#a16207',
    backgroundColor: '#fdf4e3',
    borderRadius: 12,
    padding: 10,
    marginTop: 12,
    lineHeight: 16,
  },
  insAskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#6d5ef9',
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 14,
  },
  insAskText: { fontFamily: F800, fontSize: 13, color: '#ffffff' },
  insDisclaimer: {
    fontFamily: F500,
    fontSize: 10,
    color: '#9aa3b2',
    textAlign: 'center',
    lineHeight: 14,
    marginTop: 12,
    paddingHorizontal: 6,
  },

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
