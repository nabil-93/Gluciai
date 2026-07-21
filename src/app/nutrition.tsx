import React, { useMemo, useState } from 'react';
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft, FadeInView } from '@/components/ui';
import { getRecommendations } from '@/services/recommendations';
import { useAppStore } from '@/store/useAppStore';
import { shadows } from '@/theme';
import type { MealType } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const INK = '#14231C';
const GREEN = '#1FB268';
const GREEN_D = '#159A57';

/** Daily targets for a diabetic meal plan. */
const GOALS = { kcal: 2000, carbs: 250, protein: 90, fat: 65, fiber: 30 };
/** Fixed diameter of the "objectif atteint" ring (device-width independent). */
const RING = 168;

function sameDay(iso: string, ref: Date) {
  return new Date(iso).toDateString() === ref.toDateString();
}

/* ─────────────────────────── Icons ─────────────────────────── */
function CalendarIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24" fill="none">
      <Rect x={3.5} y={5} width={17} height={16} rx={3.5} stroke={GREEN} strokeWidth={2} />
      <Path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke={GREEN} strokeWidth={2} strokeLinecap="round" />
    </Svg>
  );
}
function ChevronDown({ color = '#8A988F' }: { color?: string }) {
  return (
    <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
      <Path d="M6 9l6 6 6-6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function ChevronRight({ color = '#4A5A51', size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M9 6l6 6-6 6" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}
function LeafIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none">
      <Path d="M5 19c0-8 6-14 15-15 1 9-5 15-15 15z" fill={GREEN} />
      <Path d="M6 18c4-1 8-4 11-9" stroke="#fff" strokeWidth={1.6} strokeLinecap="round" />
    </Svg>
  );
}
function FlameIcon() {
  return (
    <Svg width={16} height={16} viewBox="0 0 24 24">
      <Path
        d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"
        fill="#F97316"
      />
    </Svg>
  );
}
function ProteinIcon() {
  return (
    <Svg width={18} height={18} viewBox="0 0 24 24" fill="#8B5CF6">
      <Rect x={2} y={9} width={3.2} height={6} rx={1.2} />
      <Rect x={5.2} y={7.5} width={2.4} height={9} rx={1.2} />
      <Rect x={16.4} y={7.5} width={2.4} height={9} rx={1.2} />
      <Rect x={18.8} y={9} width={3.2} height={6} rx={1.2} />
      <Rect x={7} y={10.8} width={10} height={2.4} rx={1.2} />
    </Svg>
  );
}
function DropletIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24">
      <Path d="M12 3.5c3.5 4 6 7 6 10a6 6 0 1 1-12 0c0-3 2.5-6 6-10z" fill="#F5A524" />
    </Svg>
  );
}
function FiberIcon() {
  return (
    <Svg width={17} height={17} viewBox="0 0 24 24" fill="none">
      <Circle cx={12} cy={12} r={8.5} stroke={GREEN} strokeWidth={2} />
      <Circle cx={12} cy={12} r={4.5} stroke={GREEN} strokeWidth={2} />
      <Circle cx={12} cy={12} r={1.6} fill={GREEN} />
    </Svg>
  );
}
function SunriseIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#F59E0B" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 3v3M4.5 10l1.8 1.8M19.5 10l-1.8 1.8M2 18h20M8 18a4 4 0 0 1 8 0" />
      <Path d="M8.5 6.5L12 3l3.5 3.5" />
    </Svg>
  );
}
function SunIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Circle cx={12} cy={12} r={4.2} />
      <Path d="M12 2.5v2.5M12 19v2.5M2.5 12h2.5M19 12h2.5M5 5l1.8 1.8M17.2 17.2L19 19M19 5l-1.8 1.8M6.8 17.2L5 19" />
    </Svg>
  );
}
function SunsetIcon() {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24" fill="none" stroke="#8B5CF6" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 6V3M4.5 10l1.8 1.8M19.5 10l-1.8 1.8M2 18h20M8 18a4 4 0 0 1 8 0" />
      <Path d="M8.5 5.5L12 9l3.5-3.5" />
    </Svg>
  );
}
function MoonIcon() {
  return (
    <Svg width={20} height={20} viewBox="0 0 24 24">
      <Path d="M20 14.5A8 8 0 1 1 9.5 4 6.4 6.4 0 0 0 20 14.5z" fill="#3B82F6" />
    </Svg>
  );
}
function ScanIcon() {
  return (
    <Svg width={26} height={26} viewBox="0 0 24 24" fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 9V6.5A2.5 2.5 0 0 1 6.5 4H9M15 4h2.5A2.5 2.5 0 0 1 20 6.5V9M20 15v2.5a2.5 2.5 0 0 1-2.5 2.5H15M9 20H6.5A2.5 2.5 0 0 1 4 17.5V15" />
      <Path d="M4 12h16" />
    </Svg>
  );
}
function PlusThin({ color = GREEN, size = 20 }: { color?: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Path d="M12 5v14M5 12h14" stroke={color} strokeWidth={2.4} strokeLinecap="round" />
    </Svg>
  );
}

/* ── Circular "objectif atteint" ring (carb-goal completion). SVG only —
 *  the labelled centre is overlaid by the parent. ── */
function ObjectiveRing({ size, pct }: { size: number; pct: number }) {
  const r = size / 2 - 13;
  const cx = size / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  const dash = p * c;
  // Angle of the progress end (or the start dot at 0%), for the knob.
  const ang = -90 + p * 360;
  const knob = {
    x: cx + r * Math.cos((ang * Math.PI) / 180),
    y: cx + r * Math.sin((ang * Math.PI) / 180),
  };
  return (
    <Svg width={size} height={size}>
      <Circle cx={cx} cy={cx} r={r} fill="none" stroke="#E1F0E7" strokeWidth={12} />
      {dash > 0 ? (
        <Circle
          cx={cx}
          cy={cx}
          r={r}
          fill="none"
          stroke={GREEN}
          strokeWidth={12}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${c}`}
          transform={`rotate(-90 ${cx} ${cx})`}
        />
      ) : null}
      <Circle cx={knob.x} cy={knob.y} r={6} fill={GREEN} />
    </Svg>
  );
}

function MacroCol({
  icon,
  chipBg,
  name,
  value,
  goal,
  unit,
  color,
  track,
  first,
}: {
  icon: React.ReactNode;
  chipBg: string;
  name: string;
  value: number;
  goal: number;
  unit: string;
  color: string;
  track: string;
  first?: boolean;
}) {
  const pct = Math.min(100, Math.round((value / goal) * 100));
  return (
    <View style={[styles.macroCol, !first && styles.macroColBorder]}>
      <View style={styles.macroHead}>
        <View style={[styles.macroChip, { backgroundColor: chipBg }]}>{icon}</View>
        <Text style={styles.macroName} numberOfLines={1}>
          {name}
        </Text>
      </View>
      <Text style={styles.macroValue}>
        <Text style={styles.macroValueNum}>{Math.round(value)}</Text> / {goal} {unit}
      </Text>
      <View style={[styles.macroTrack, { backgroundColor: track }]}>
        <View style={{ width: `${pct}%`, height: '100%', borderRadius: 99, backgroundColor: color }} />
      </View>
      <Text style={[styles.macroPct, { color }]}>{pct}%</Text>
    </View>
  );
}

const MEAL_ORDER: MealType[] = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_META: Record<MealType, { chip: string; icon: React.ReactNode }> = {
  breakfast: { chip: '#FEECDF', icon: <SunriseIcon /> },
  lunch: { chip: '#E4F6EC', icon: <SunIcon /> },
  dinner: { chip: '#F0EBFD', icon: <SunsetIcon /> },
  snack: { chip: '#E7F0FE', icon: <MoonIcon /> },
};

export default function NutritionScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { meals, profile, glucoseLogs } = useAppStore();

  const firstName = (profile?.name || '').trim().split(/\s+/)[0] || '';

  const [dayOffset, setDayOffset] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const selectedDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    return d;
  }, [dayOffset]);
  const dayLabel = (offset: number) => {
    if (offset === 0) return t('nutritionPage.today');
    if (offset === 1) return t('nutritionPage.yesterday');
    const d = new Date();
    d.setDate(d.getDate() - offset);
    return d.toLocaleDateString(i18n.language, { weekday: 'long', day: 'numeric', month: 'short' });
  };

  const todayMeals = useMemo(
    () => meals.filter((m) => sameDay(m.created_at, selectedDate)),
    [meals, selectedDate]
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
      acc.fiber += m.result.fiber ?? 0;
      return acc;
    },
    { kcal: 0, carbs: 0, protein: 0, fat: 0, fiber: 0 }
  );

  /** Per-slot aggregates so each meal-type row shows what's logged. */
  const bySlot = useMemo(() => {
    const map: Record<MealType, { count: number; carbs: number }> = {
      breakfast: { count: 0, carbs: 0 },
      lunch: { count: 0, carbs: 0 },
      dinner: { count: 0, carbs: 0 },
      snack: { count: 0, carbs: 0 },
    };
    for (const m of todayMeals) {
      const slot = (m.meal_type ?? 'snack') as MealType;
      map[slot].count += 1;
      map[slot].carbs += Math.round(m.result.carbohydrates ?? 0);
    }
    return map;
  }, [todayMeals]);

  const carbsPct = Math.min(1, totals.carbs / GOALS.carbs);
  const remaining = Math.max(0, GOALS.carbs - Math.round(totals.carbs));

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const HERO_H = insets.top + 300;

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* ── Hero ── */}
        <View>
          <Image
            source={require('../assets/nutrition/hero-bg.jpg')}
            style={[styles.heroImg, { height: HERO_H }]}
            resizeMode="cover"
          />
          <LinearGradient
            colors={['rgba(247,250,247,0)', 'rgba(247,250,247,0.7)', '#F7FAF7']}
            locations={[0, 0.55, 0.95]}
            style={[styles.heroFade, { top: HERO_H - 150, height: 150 }]}
            pointerEvents="none"
          />

          {/* Header */}
          <View style={[styles.headRow, { paddingTop: insets.top + 10 }]}>
            <Pressable onPress={close} style={styles.backBtn}>
              <ChevronLeft size={16} />
            </Pressable>
            <Text style={styles.headTitle}>{t('nutritionPage.title')}</Text>
            <Pressable style={styles.dateChip} onPress={() => setPickerOpen(true)}>
              <CalendarIcon />
              <Text style={styles.dateChipText}>{dayLabel(dayOffset)}</Text>
              <ChevronDown />
            </Pressable>
          </View>

          {/* Greeting */}
          <FadeInView delay={30} style={{ paddingHorizontal: 22, marginTop: 14 }}>
            <Text style={styles.hello}>
              {firstName ? t('nutritionPage.hello', { name: firstName }) : t('nutritionPage.helloNoName')}
            </Text>
            <Text style={styles.helloSub}>{t('nutritionPage.subtitle')}</Text>
          </FadeInView>

          {/* Carbs card + objectif ring */}
          <FadeInView delay={80} style={styles.heroBlock}>
            <LinearGradient
              colors={['#2FC178', '#149A57']}
              start={{ x: 0.1, y: 0 }}
              end={{ x: 0.9, y: 1 }}
              style={styles.carbsCard}
            >
              <Text style={styles.carbsLabel}>{t('nutritionPage.carbsToday')}</Text>
              <View style={styles.carbsRow}>
                <Text style={styles.carbsValue}>{Math.round(totals.carbs)}</Text>
                <Text style={styles.carbsUnit}>g</Text>
              </View>
              <Text style={styles.carbsGoal}>/ {GOALS.carbs} g</Text>
              <View style={styles.carbsTrack}>
                <View style={[styles.carbsFill, { width: `${Math.max(14, carbsPct * 100)}%` }]} />
                <Text style={styles.carbsPctText}>{Math.round(carbsPct * 100)}%</Text>
              </View>
              <Text style={styles.carbsRemaining}>
                {t('nutritionPage.remaining', { n: remaining })}
              </Text>
            </LinearGradient>

            <View style={styles.ringWrap}>
              <ObjectiveRing size={RING} pct={carbsPct} />
              <View style={styles.ringCenter} pointerEvents="none">
                <LeafIcon />
                <Text style={styles.ringPct}>{Math.round(carbsPct * 100)}%</Text>
                <Text style={styles.ringLabel}>{t('nutritionPage.goalReached')}</Text>
              </View>
            </View>
          </FadeInView>
        </View>

        {/* ── Macro row ── */}
        <FadeInView delay={120} style={styles.macroCard}>
          <MacroCol
            first
            icon={<FlameIcon />}
            chipBg="#FEECDF"
            name={t('nutritionPage.calories')}
            value={totals.kcal}
            goal={GOALS.kcal}
            unit="kcal"
            color="#F97316"
            track="#FCE9DC"
          />
          <MacroCol
            icon={<ProteinIcon />}
            chipBg="#F0EBFD"
            name={t('nutritionPage.protein')}
            value={totals.protein}
            goal={GOALS.protein}
            unit="g"
            color="#8B5CF6"
            track="#EDE7FC"
          />
          <MacroCol
            icon={<DropletIcon />}
            chipBg="#FEF3E0"
            name={t('nutritionPage.fat')}
            value={totals.fat}
            goal={GOALS.fat}
            unit="g"
            color="#F5A524"
            track="#FBEECF"
          />
          <MacroCol
            icon={<FiberIcon />}
            chipBg="#E4F6EC"
            name={t('nutritionPage.fiber')}
            value={totals.fiber}
            goal={GOALS.fiber}
            unit="g"
            color={GREEN}
            track="#DFF2E7"
          />
        </FadeInView>

        {/* ── AI Coach ── */}
        <FadeInView delay={160} style={{ paddingHorizontal: 20, marginTop: 18 }}>
          <Pressable style={styles.coachCard} onPress={() => router.push('/ai-chat')}>
            <View style={styles.coachRobot}>
              <AnimatedRobot size={52} mood="happy" />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <View style={styles.coachPill}>
                <Text style={styles.coachPillText}>{t('nutritionPage.aiCoach')}</Text>
              </View>
              <Text style={styles.coachTitle}>{t('nutritionPage.recoTitle')}</Text>
              {(recommendations.length
                ? recommendations
                : [{ icon: '💡', text: t('nutritionPage.remaining', { n: remaining }) }]
              )
                .slice(0, 2)
                .map((r, i) => (
                  <View key={i} style={styles.coachLine}>
                    <Text style={styles.coachEmoji}>{r.icon}</Text>
                    <Text style={styles.coachText}>{r.text}</Text>
                  </View>
                ))}
            </View>
            <ChevronRight />
          </Pressable>
        </FadeInView>

        {/* ── Repas du jour ── */}
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>{t('nutritionPage.mealsTitle')}</Text>
          <Text style={styles.sectionCount}>
            {t('nutritionPage.mealsAdded', { count: todayMeals.length })}
          </Text>
        </View>

        <FadeInView delay={200} style={{ paddingHorizontal: 20 }}>
          <View style={styles.mealsCard}>
            {MEAL_ORDER.map((slot, i) => {
              const info = bySlot[slot];
              const meta = MEAL_META[slot];
              return (
                <Pressable
                  key={slot}
                  onPress={() => router.push('/scan')}
                  style={[styles.mealRow, i < MEAL_ORDER.length - 1 && styles.mealRowBorder]}
                >
                  <View style={[styles.mealChip, { backgroundColor: meta.chip }]}>{meta.icon}</View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.mealName}>{t(`nutritionPage.mt.${slot}`)}</Text>
                    <Text style={styles.mealSub} numberOfLines={1}>
                      {info.count > 0
                        ? t('nutritionPage.mealSummary', { count: info.count, carbs: info.carbs })
                        : t(`nutritionPage.mtAdd.${slot}`)}
                    </Text>
                  </View>
                  <View style={styles.mealPlus}>
                    <PlusThin />
                  </View>
                </Pressable>
              );
            })}
          </View>
        </FadeInView>

        <View style={styles.divider} />

        {/* ── Scanner un repas ── */}
        <FadeInView delay={240} style={{ paddingHorizontal: 20, marginTop: 20 }}>
          <Pressable style={styles.scanCard} onPress={() => router.push('/scan')}>
            <View style={styles.scanChip}>
              <ScanIcon />
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.scanTitle}>{t('nutritionPage.scanMeal')}</Text>
              <Text style={styles.scanSub}>{t('nutritionPage.scanSub')}</Text>
            </View>
            <View style={styles.scanChevron}>
              <ChevronRight size={18} />
            </View>
          </Pressable>
        </FadeInView>
      </ScrollView>

      {/* ── FAB → scan a meal ── */}
      <Pressable
        onPress={() => router.push('/scan')}
        style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 16 }]}
      >
        <LinearGradient colors={['#2FC178', '#149A57']} style={styles.fabGrad}>
          <PlusThin color="#fff" size={28} />
        </LinearGradient>
      </Pressable>

      {/* ── Day picker ── */}
      <Modal visible={pickerOpen} transparent animationType="fade" onRequestClose={() => setPickerOpen(false)}>
        <Pressable style={styles.pickerOverlay} onPress={() => setPickerOpen(false)}>
          <View style={styles.pickerSheet}>
            <View style={styles.pickerHandle} />
            <Text style={styles.pickerTitle}>{t('nutritionPage.pickDay')}</Text>
            {Array.from({ length: 7 }, (_, i) => i).map((off) => {
              const d = new Date();
              d.setDate(d.getDate() - off);
              const n = meals.filter((m) => sameDay(m.created_at, d)).length;
              const active = off === dayOffset;
              return (
                <Pressable
                  key={off}
                  onPress={() => {
                    setDayOffset(off);
                    setPickerOpen(false);
                  }}
                  style={[styles.pickerRow, active && styles.pickerRowActive]}
                >
                  <Text style={[styles.pickerDay, active && { color: GREEN_D }]}>{dayLabel(off)}</Text>
                  <Text style={styles.pickerCount}>
                    {n > 0 ? t('nutritionPage.mealCount', { count: n }) : '—'}
                  </Text>
                  {active ? (
                    <Svg width={16} height={16} viewBox="0 0 16 16" fill="none">
                      <Circle cx={8} cy={8} r={7} fill={GREEN_D} />
                      <Path d="M5 8.2L7 10.2L11 6.2" stroke="#fff" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
                    </Svg>
                  ) : (
                    <View style={styles.pickerRadio} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#F7FAF7' },

  heroImg: { position: 'absolute', top: 0, left: 0, right: 0, width: '100%' },
  heroFade: { position: 'absolute', left: 0, right: 0 },

  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  backBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headTitle: { fontFamily: F800, fontSize: 20, color: INK },
  dateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    borderRadius: 22,
    paddingVertical: 9,
    paddingHorizontal: 12,
    ...shadows.card,
  },
  dateChipText: { fontFamily: F600, fontSize: 13, color: INK },

  hello: { fontFamily: F800, fontSize: 26, color: INK, letterSpacing: -0.3 },
  helloSub: { fontFamily: F500, fontSize: 15, color: '#63736A', marginTop: 4 },

  heroBlock: {
    marginTop: 18,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  carbsCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 28,
    padding: 20,
    paddingRight: 44,
    shadowColor: '#149A57',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 6,
  },
  carbsLabel: { fontFamily: F600, fontSize: 15, color: 'rgba(255,255,255,0.95)' },
  carbsRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 6 },
  carbsValue: { fontFamily: F800, fontSize: 50, color: '#fff', lineHeight: 52 },
  carbsUnit: { fontFamily: F700, fontSize: 22, color: '#fff' },
  carbsGoal: { fontFamily: F600, fontSize: 16, color: 'rgba(255,255,255,0.92)', marginTop: 6 },
  carbsTrack: {
    marginTop: 14,
    height: 22,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.28)',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  carbsFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 99,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  carbsPctText: {
    fontFamily: F800,
    fontSize: 12,
    color: GREEN_D,
    marginLeft: 9,
  },
  carbsRemaining: { fontFamily: F600, fontSize: 14, color: 'rgba(255,255,255,0.92)', marginTop: 12 },

  ringWrap: {
    width: RING,
    height: RING,
    marginLeft: -40,
    borderRadius: 999,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
    shadowColor: 'rgba(20,80,50,1)',
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.28,
    shadowRadius: 30,
    elevation: 8,
  },
  ringCenter: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  ringPct: { fontFamily: F800, fontSize: 28, color: INK },
  ringLabel: { fontFamily: F600, fontSize: 12.5, color: '#63736A' },

  macroCard: {
    marginTop: 16,
    marginHorizontal: 20,
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingVertical: 16,
    paddingHorizontal: 6,
    flexDirection: 'row',
    shadowColor: 'rgba(20,50,34,1)',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 24,
    elevation: 3,
  },
  macroCol: { flex: 1, minWidth: 0, gap: 7, paddingHorizontal: 6 },
  macroColBorder: { borderLeftWidth: 1, borderLeftColor: '#EDF1EE' },
  macroHead: { alignItems: 'flex-start', gap: 6, minWidth: 0 },
  macroChip: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  macroName: { fontFamily: F600, fontSize: 11.5, color: '#3A4A42', flexShrink: 1 },
  macroValue: { fontFamily: F500, fontSize: 12, color: '#8A988F' },
  macroValueNum: { fontFamily: F800, color: INK },
  macroTrack: { height: 6, borderRadius: 99, overflow: 'hidden' },
  macroPct: { fontFamily: F700, fontSize: 12 },

  coachCard: {
    backgroundColor: '#E9F6EF',
    borderRadius: 24,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  coachRobot: {
    width: 56,
    height: 56,
    borderRadius: 18,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  coachPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderWidth: 1.5,
    borderColor: '#BFE6CE',
    borderRadius: 20,
    paddingVertical: 3,
    paddingHorizontal: 10,
  },
  coachPillText: { fontFamily: F700, fontSize: 11.5, color: GREEN_D },
  coachTitle: { fontFamily: F800, fontSize: 15.5, color: INK, marginTop: 7 },
  coachLine: { flexDirection: 'row', gap: 8, marginTop: 7, alignItems: 'flex-start' },
  coachEmoji: { fontSize: 14 },
  coachText: { flex: 1, fontFamily: F500, fontSize: 13.5, color: '#3A4A42', lineHeight: 18 },

  sectionHead: {
    marginTop: 24,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: { fontFamily: F800, fontSize: 19, color: INK },
  sectionCount: { fontFamily: F700, fontSize: 14, color: GREEN },

  mealsCard: {
    marginTop: 12,
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 16,
    ...shadows.card,
  },
  mealRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14 },
  mealRowBorder: { borderBottomWidth: 1, borderBottomColor: '#F0F3F1' },
  mealChip: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mealName: { fontFamily: F700, fontSize: 15, color: INK },
  mealSub: { fontFamily: F500, fontSize: 13, color: '#8A988F', marginTop: 2 },
  mealPlus: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#BFE6CE',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },

  divider: { height: 1, backgroundColor: '#E3EAE5', marginHorizontal: 20, marginTop: 22 },

  scanCard: {
    backgroundColor: '#EAF6EF',
    borderRadius: 24,
    padding: 18,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  scanChip: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#D8EFE1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanTitle: { fontFamily: F800, fontSize: 16, color: INK },
  scanSub: { fontFamily: F500, fontSize: 12.5, color: '#5C6E63', marginTop: 3, lineHeight: 17 },
  scanChevron: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1.5,
    borderColor: '#C4E6D2',
    alignItems: 'center',
    justifyContent: 'center',
  },

  fab: {
    position: 'absolute',
    right: 22,
    width: 60,
    height: 60,
    borderRadius: 30,
    shadowColor: '#149A57',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.5,
    shadowRadius: 20,
    elevation: 8,
  },
  fabGrad: {
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Day picker (bottom sheet) */
  pickerOverlay: { flex: 1, backgroundColor: 'rgba(16,24,40,0.42)', justifyContent: 'flex-end' },
  pickerSheet: { backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, padding: 20, paddingBottom: 34 },
  pickerHandle: { alignSelf: 'center', width: 40, height: 4, borderRadius: 2, backgroundColor: '#E3E8EE', marginBottom: 14 },
  pickerTitle: { fontFamily: F800, fontSize: 17, color: INK, marginBottom: 10 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, paddingHorizontal: 12, borderRadius: 14 },
  pickerRowActive: { backgroundColor: '#F2F8F4' },
  pickerDay: { flex: 1, fontFamily: F700, fontSize: 14.5, color: INK, textTransform: 'capitalize' },
  pickerCount: { fontFamily: F500, fontSize: 12.5, color: '#9AA8A0' },
  pickerRadio: { width: 16, height: 16, borderRadius: 8, borderWidth: 1.6, borderColor: '#D5DBE2' },
});
