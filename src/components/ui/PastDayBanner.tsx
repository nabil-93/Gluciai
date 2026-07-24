import React, { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import Svg, { Path } from 'react-native-svg';

const F500 = 'PlusJakartaSans_500Medium';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const AMBER_BG = '#FFF6E5';
const AMBER_LINE = '#F6DFB0';
const AMBER_INK = '#8A5B00';
const AMBER_DOT = '#F5A524';

const DAY_MS = 86_400_000;

/** `YYYY-MM-DD` in LOCAL time — never toISOString(), which shifts the day for
 *  anyone east or west of UTC and would open the wrong date. */
export function dateParam(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function midnight(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function offsetFromParam(raw?: string | string[]): number {
  const s = Array.isArray(raw) ? raw[0] : raw;
  if (!s) return 0;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return 0;
  const picked = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(picked.getTime())) return 0;
  const diff = Math.round((midnight(new Date()).getTime() - midnight(picked).getTime()) / DAY_MS);
  // Future days hold nothing to show, so they fall back to today.
  return Math.max(0, diff);
}

/**
 * The day a detail page is showing, seeded from the `?date=` param.
 *
 * The home screen lets the patient scroll back through their history. Tapping
 * a meal, a reading or an injection from one of those past days used to land
 * on a page showing TODAY — so the entry they had just tapped was not there,
 * and the numbers on screen belonged to a different day than the one they were
 * reading about. The param carries the day across, and this hook keeps the
 * page on it (including when the same screen is re-opened on another date,
 * which the router serves from the existing mount).
 */
export function useSelectedDay() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const [dayOffset, setDayOffset] = useState(() => offsetFromParam(date));

  useEffect(() => {
    setDayOffset(offsetFromParam(date));
  }, [date]);

  const selectedDate = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - dayOffset);
    return d;
  }, [dayOffset]);

  /** Calendars hand back a Date; the pages track a day offset. */
  const selectDate = (d: Date) =>
    setDayOffset(Math.max(0, Math.round((midnight(new Date()).getTime() - midnight(d).getTime()) / DAY_MS)));

  return {
    dayOffset,
    setDayOffset,
    selectedDate,
    selectDate,
    isToday: dayOffset === 0,
    backToToday: () => setDayOffset(0),
  };
}

/**
 * Standing reminder that the page is not showing today.
 *
 * Without it the screens are indistinguishable: same layout, same headings,
 * numbers that read as current. On an app whose figures feed insulin decisions,
 * a patient must never mistake Tuesday's carbs for this morning's — so the
 * notice stays on screen for as long as the past day does, rather than being a
 * toast that disappears.
 */
export function PastDayBanner({
  date,
  onToday,
  style,
}: {
  date: Date;
  onToday: () => void;
  style?: any;
}) {
  const { t, i18n } = useTranslation();

  const label = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return t('pastDay.yesterday');
    return date.toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }, [date, t, i18n.language]);

  return (
    <View style={[styles.wrap, style]} accessibilityRole="alert">
      <View style={styles.dot}>
        <Svg width={12} height={12} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth={2.8} strokeLinecap="round" strokeLinejoin="round">
          <Path d="M12 8v5M12 16.5h.01" />
        </Svg>
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={styles.title} numberOfLines={2}>
          {t('pastDay.title', { date: label })}
        </Text>
        <Text style={styles.sub} numberOfLines={2}>
          {t('pastDay.subtitle')}
        </Text>
      </View>
      <Pressable style={styles.btn} onPress={onToday} hitSlop={6} accessibilityRole="button">
        <Text style={styles.btnText} numberOfLines={1}>
          {t('pastDay.backToToday')}
        </Text>
      </Pressable>
    </View>
  );
}

/** The same notice, sized for the inside of a card or a section header. */
export function PastDayNote({ date, style }: { date: Date; style?: any }) {
  const { t, i18n } = useTranslation();
  const label = useMemo(() => {
    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return t('pastDay.yesterday');
    return date.toLocaleDateString(i18n.language, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  }, [date, t, i18n.language]);

  return (
    <View style={[styles.noteWrap, style]}>
      <Text style={styles.noteText} numberOfLines={3}>
        {t('pastDay.mealsNote', { date: label })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: AMBER_BG,
    borderWidth: 1,
    borderColor: AMBER_LINE,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  dot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: AMBER_DOT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: F800, fontSize: 12.5, lineHeight: 16.5, color: AMBER_INK },
  sub: { fontFamily: F500, fontSize: 10.5, lineHeight: 14, color: '#9A7327', marginTop: 1 },
  btn: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: AMBER_LINE,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
    flexShrink: 1,
  },
  btnText: { fontFamily: F700, fontSize: 10.5, color: AMBER_INK },

  noteWrap: {
    backgroundColor: AMBER_BG,
    borderWidth: 1,
    borderColor: AMBER_LINE,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 11,
  },
  noteText: { fontFamily: F700, fontSize: 11.5, lineHeight: 15.5, color: AMBER_INK },
});
