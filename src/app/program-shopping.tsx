import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft, FadeInView } from '@/components/ui';
import { isoDay, isRevealed, type ProgramDay } from '@/services/program';
import {
  consumedOnDay,
  saveShoppingWeek,
  stockFor,
  type ShoppingWeek,
  type StockLine,
} from '@/services/programShopping';
import { useProgramStore } from '@/store/useProgramStore';
import { shadows } from '@/theme';
import type { FoodCategory } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN = '#1fbc78';
const INK = '#101828';

/** One emoji per aisle, so the list reads like a shop and not a spreadsheet. */
const AISLE: Record<string, string> = {
  Protein: '🥩',
  Seafood: '🐟',
  Vegetable: '🥬',
  Fruit: '🍎',
  Legumes: '🫘',
  Dairy: '🥛',
  Rice: '🍚',
  Bread: '🍞',
  Pasta: '🍝',
  Sauce: '🫙',
  Snack: '🥜',
  Drink: '🥤',
  Dessert: '🍯',
  Soup: '🥣',
  other: '🛒',
};

function grams(n: number): string {
  return n >= 1000 ? `${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)} kg` : `${n} g`;
}

/**
 * The week's shopping, and what is left of it.
 *
 * The list is not a suggestion: it is the exact sum of the ingredients of
 * the seven days the coach has already written. The patient shops once, and
 * every meal they confirm eating draws its share back out of this larder —
 * so "how much chicken is left?" has an answer that agrees with the journal.
 *
 * What it deliberately does NOT show is the food. The days to come are
 * listed as dates and nothing else; discovering the dish on the morning is
 * the whole shape of the parcours.
 */
export default function ProgramShoppingScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { program, days, shoppingWeeks, setItemBought, markShopped } = useProgramStore();

  const today = isoDay(new Date());
  /* The week being lived: the one containing today, else the latest one. */
  const [weekIndex, setWeekIndex] = useState<number | null>(null);

  const week: ShoppingWeek | null = useMemo(() => {
    if (!shoppingWeeks.length) return null;
    if (weekIndex != null) {
      return shoppingWeeks.find((w) => w.weekIndex === weekIndex) ?? null;
    }
    return (
      shoppingWeeks.find((w) => today >= w.startDate && today <= w.endDate) ??
      shoppingWeeks[shoppingWeeks.length - 1]
    );
  }, [shoppingWeeks, weekIndex, today]);

  const stock: StockLine[] = useMemo(
    () => (week ? stockFor(week, days) : []),
    [week, days]
  );

  /** The week's days, in order, with what each one drew from the larder. */
  const timeline = useMemo(() => {
    if (!week) return [];
    const out: { date: string; day: ProgramDay | null; revealed: boolean }[] = [];
    const start = new Date(`${week.startDate}T12:00:00`);
    for (let i = 0; i < 7; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const iso = isoDay(d);
      const day = days.find((x) => x.date === iso) ?? null;
      out.push({ date: iso, day, revealed: !!day && isRevealed(day, days) });
    }
    return out;
  }, [week, days]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/program' as any);
  };

  const fmt = (iso: string, opts?: Intl.DateTimeFormatOptions) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(
      i18n.language,
      opts ?? { weekday: 'short', day: 'numeric', month: 'short' }
    );

  /** Ticking a line writes straight through — a shop has no "save" button. */
  const toggle = async (key: string, bought: boolean) => {
    if (!week || !program) return;
    setItemBought(week.weekIndex, key, bought);
    const fresh = useProgramStore
      .getState()
      .shoppingWeeks.find((w) => w.weekIndex === week.weekIndex);
    if (fresh) await saveShoppingWeek(program.id, fresh);
  };

  const finishShopping = async () => {
    if (!week || !program) return;
    markShopped(week.weekIndex);
    const fresh = useProgramStore
      .getState()
      .shoppingWeeks.find((w) => w.weekIndex === week.weekIndex);
    if (fresh) await saveShoppingWeek(program.id, fresh);
  };

  if (!program || !week) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.emptyText}>{t('shopping.none')}</Text>
        <Pressable onPress={close} style={styles.backLink}>
          <Text style={styles.backLinkText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const boughtCount = week.items.filter((i) => i.bought).length;
  const stocked = week.status !== 'planned';
  const shopToday = week.shopDate === today;
  const shopAhead = week.shopDate > today;

  /* Grouped by aisle so the patient walks the shop once, not five times. */
  const byAisle = new Map<string, StockLine[]>();
  for (const line of stock) {
    const k = (line.category as FoodCategory) ?? 'other';
    byAisle.set(k, [...(byAisle.get(k) ?? []), line]);
  }

  const totalGrams = stock.reduce((s, l) => s + l.grams, 0);
  const leftGrams = stock.reduce((s, l) => s + l.left, 0);
  const leftPct = totalGrams > 0 ? Math.round((leftGrams / totalGrams) * 100) : 0;

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 16,
          paddingBottom: 50,
        }}
      >
        <View style={styles.headRow}>
          <Pressable onPress={close} style={styles.backBtn}>
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle}>{t('shopping.title')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* ── The week, and when to shop for it ── */}
        <FadeInView>
          <LinearGradient
            colors={stocked ? ['#2ec983', '#159a57'] : ['#f7a23b', '#e2801a']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.hero}
          >
            <Text style={styles.heroWeek}>
              {t('shopping.weekN', { n: week.weekIndex + 1 })}
            </Text>
            <Text style={styles.heroDates}>
              {fmt(week.startDate)} → {fmt(week.endDate)}
            </Text>
            <Text style={styles.heroLine}>
              {stocked
                ? t('shopping.stockLeft', { pct: leftPct })
                : shopToday
                  ? t('shopping.shopToday')
                  : shopAhead
                    ? t('shopping.shopOn', { date: fmt(week.shopDate, { weekday: 'long', day: 'numeric', month: 'long' }) })
                    : t('shopping.shopLate')}
            </Text>
          </LinearGradient>
        </FadeInView>

        {/* ── Week switcher, when there is more than one ── */}
        {shoppingWeeks.length > 1 ? (
          <View style={styles.weekRow}>
            {shoppingWeeks.map((w) => {
              const on = w.weekIndex === week.weekIndex;
              return (
                <Pressable
                  key={w.weekIndex}
                  onPress={() => setWeekIndex(w.weekIndex)}
                  style={[styles.weekChip, on && styles.weekChipOn]}
                >
                  <Text style={[styles.weekChipText, on && styles.weekChipTextOn]}>
                    S{w.weekIndex + 1}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}

        {/* ── The list / the larder ── */}
        <FadeInView delay={60}>
          <Text style={styles.sectionHead}>
            🛒 {stocked ? t('shopping.larder') : t('shopping.listTitle')}
          </Text>
          <Text style={styles.sectionSub}>
            {stocked
              ? t('shopping.larderSub')
              : t('shopping.listSub', { done: boughtCount, total: week.items.length })}
          </Text>

          {[...byAisle.entries()].map(([aisle, lines]) => (
            <View key={aisle} style={styles.aisle}>
              <Text style={styles.aisleTitle}>
                {AISLE[aisle] ?? AISLE.other} {t(`shopping.aisle_${aisle}`, aisle)}
              </Text>
              {lines.map((line) => (
                <Pressable
                  key={line.key}
                  disabled={stocked}
                  onPress={() => toggle(line.key, !line.bought)}
                  style={styles.itemRow}
                >
                  {!stocked ? (
                    <View style={[styles.check, line.bought && styles.checkOn]}>
                      {line.bought ? <Text style={styles.checkMark}>✓</Text> : null}
                    </View>
                  ) : null}

                  <View style={{ flex: 1 }}>
                    <Text
                      style={[styles.itemName, !stocked && line.bought && styles.itemNameDone]}
                      numberOfLines={1}
                    >
                      {line.name}
                    </Text>
                    {stocked ? (
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            {
                              width: `${Math.round((1 - line.ratio) * 100)}%`,
                              backgroundColor: line.left === 0 ? '#e04f5f' : GREEN,
                            },
                          ]}
                        />
                      </View>
                    ) : null}
                  </View>

                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.itemQty}>
                      {stocked ? grams(line.left) : grams(line.grams)}
                    </Text>
                    {stocked ? (
                      <Text style={styles.itemSub}>
                        {line.left === 0
                          ? t('shopping.outOf')
                          : t('shopping.ofTotal', { total: grams(line.grams) })}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              ))}
            </View>
          ))}

          {!stocked ? (
            <Pressable onPress={finishShopping}>
              <LinearGradient
                colors={['#2ec983', '#1fbc78']}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 1 }}
                style={styles.cta}
              >
                <Text style={styles.ctaText}>✓ {t('shopping.doneShopping')}</Text>
              </LinearGradient>
            </Pressable>
          ) : null}
        </FadeInView>

        {/* ── The week, day by day ── */}
        <FadeInView delay={120}>
          <Text style={styles.sectionHead}>📅 {t('shopping.weekTitle')}</Text>
          <Text style={styles.sectionSub}>{t('shopping.weekSub')}</Text>

          {timeline.map((slot) => {
            const isToday = slot.date === today;
            const used = slot.day && slot.revealed ? consumedOnDay(slot.day) : [];
            return (
              <Pressable
                key={slot.date}
                disabled={!slot.revealed}
                onPress={() =>
                  router.push({ pathname: '/program-day', params: { date: slot.date } } as any)
                }
                style={[styles.dayRow, isToday && styles.dayRowToday]}
              >
                <View style={styles.dayHead}>
                  <Text style={[styles.dayDate, isToday && styles.dayDateToday]}>
                    {fmt(slot.date)}
                  </Text>
                  {slot.date === week.shopDate ? (
                    <Text style={styles.dayTag}>🛒 {t('shopping.shopDayTag')}</Text>
                  ) : null}
                  {!slot.revealed ? <Text style={styles.dayLock}>🔒</Text> : null}
                </View>

                {slot.revealed ? (
                  used.length ? (
                    <Text style={styles.dayUsed} numberOfLines={2}>
                      {used.map((u) => `${u.name} ${grams(u.grams)}`).join(' · ')}
                    </Text>
                  ) : (
                    <Text style={styles.dayIdle}>{t('shopping.nothingTaken')}</Text>
                  )
                ) : (
                  <Text style={styles.dayIdle}>{t('shopping.lockedDay')}</Text>
                )}
              </Pressable>
            );
          })}
        </FadeInView>

        <View style={styles.noteBox}>
          <Text style={styles.noteText}>💡 {t('shopping.note')}</Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyText: { fontFamily: F600, fontSize: 13.5, color: '#667085', textAlign: 'center' },
  backLink: { marginTop: 14 },
  backLinkText: { fontFamily: F700, fontSize: 13.5, color: GREEN },

  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headTitle: { fontFamily: F800, fontSize: 17, color: INK },

  hero: {
    borderRadius: 22,
    padding: 20,
    shadowColor: '#2a3646',
    shadowOpacity: 0.2,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroWeek: { fontFamily: F800, fontSize: 22, color: '#ffffff' },
  heroDates: {
    fontFamily: F600,
    fontSize: 12,
    color: 'rgba(255,255,255,0.9)',
    marginTop: 2,
    textTransform: 'capitalize',
  },
  heroLine: {
    fontFamily: F600,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#ffffff',
    marginTop: 10,
  },

  weekRow: { flexDirection: 'row', gap: 7, marginTop: 12 },
  weekChip: {
    minWidth: 46,
    minHeight: 34,
    paddingHorizontal: 12,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: '#e4e8ef',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekChipOn: { borderColor: GREEN, backgroundColor: '#eafaf1' },
  weekChipText: { fontFamily: F700, fontSize: 12, color: '#8a98a7' },
  weekChipTextOn: { color: '#0f7a42' },

  sectionHead: { fontFamily: F800, fontSize: 15, color: INK, marginTop: 22 },
  sectionSub: {
    fontFamily: F500,
    fontSize: 11.5,
    lineHeight: 16.5,
    color: '#8a98a7',
    marginTop: 3,
    marginBottom: 10,
  },

  aisle: { marginBottom: 12 },
  aisleTitle: {
    fontFamily: F700,
    fontSize: 11.5,
    color: '#8a98a7',
    textTransform: 'uppercase',
    marginBottom: 6,
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 6,
    ...shadows.card,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#d6dbe4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: GREEN, borderColor: GREEN },
  checkMark: { fontFamily: F800, fontSize: 12, color: '#ffffff' },
  itemName: { fontFamily: F700, fontSize: 13, color: INK },
  itemNameDone: { textDecorationLine: 'line-through', color: '#8a98a7' },
  itemQty: { fontFamily: F800, fontSize: 13, color: '#f79009' },
  itemSub: { fontFamily: F600, fontSize: 9.5, color: '#8a98a7', marginTop: 1 },
  barTrack: {
    height: 5,
    borderRadius: 3,
    backgroundColor: '#eef1f6',
    marginTop: 6,
    overflow: 'hidden',
  },
  barFill: { height: 5, borderRadius: 3 },

  cta: {
    minHeight: 52,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  ctaText: { fontFamily: F700, fontSize: 14.5, color: '#ffffff', textAlign: 'center' },

  dayRow: {
    backgroundColor: '#ffffff',
    borderRadius: 14,
    padding: 12,
    marginBottom: 7,
    ...shadows.card,
  },
  dayRowToday: { borderWidth: 1.5, borderColor: '#c8ecd9' },
  dayHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dayDate: {
    flex: 1,
    fontFamily: F700,
    fontSize: 12.5,
    color: INK,
    textTransform: 'capitalize',
  },
  dayDateToday: { color: '#0f7a42' },
  dayTag: { fontFamily: F700, fontSize: 10, color: '#8a5a10' },
  dayLock: { fontSize: 12 },
  dayUsed: { fontFamily: F600, fontSize: 11, lineHeight: 16, color: '#667085', marginTop: 5 },
  dayIdle: { fontFamily: F500, fontSize: 11, color: '#a9b2be', marginTop: 5 },

  noteBox: {
    backgroundColor: '#eef1f6',
    borderRadius: 14,
    padding: 13,
    marginTop: 22,
  },
  noteText: { fontFamily: F500, fontSize: 11.5, lineHeight: 17, color: '#5d6b7c' },
});
