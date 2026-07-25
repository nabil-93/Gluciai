import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { DayRingGlyph, RingCalendar, type DayRing } from '@/components/calendar/RingCalendar';
import { dayProgress, isoDay, revealedDays, type ProgramDay } from '@/services/program';
import { shadows } from '@/theme';

const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const INK = '#101828';
const GREEN = '#19c37d';
const AMBER = '#f2b84b';
const RED = '#e04f5f';
const IDLE = '#cbd2dc';

/** Colour of a day's ring: how much of that day the patient actually did. */
function ringColor(ratio: number, past: boolean): string {
  if (ratio >= 1) return GREEN;
  if (ratio > 0) return AMBER;
  // Nothing done. On a day that is over that means missed; on today or a day
  // still to come it just means "written, not started" — no alarm.
  return past ? RED : IDLE;
}

/**
 * The parcours, day by day, on the same month grid the home screen uses.
 *
 * Each ring is that day's completion — meals eaten plus the session — so a
 * month of the program reads at a glance. Only days the coach actually
 * wrote are drawn: a day that has not been unlocked yet has no ring and
 * cannot be opened, because the whole point is to discover it on the day.
 */
export function ProgramCalendar({
  days,
  onOpenDay,
}: {
  days: ProgramDay[];
  /** A generated day was tapped — open its detail. */
  onOpenDay: (date: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const today = isoDay(new Date());

  /* Only days the patient has reached. The week is written a week ahead so
     the shopping list can be exact, and those unlived days must not be
     readable here — the calendar would give away every dish to come. */
  const visible = useMemo(() => revealedDays(days), [days]);

  const byDate = useMemo(() => {
    const m = new Map<string, ProgramDay>();
    for (const d of visible) m.set(d.date, d);
    return m;
  }, [visible]);

  const ringFor = (d: Date): DayRing => {
    const day = byDate.get(isoDay(d));
    if (!day) return null;
    const p = dayProgress(day);
    return {
      kind: 'progress',
      color: ringColor(p.ratio, isoDay(d) < today),
      // A day that has begun should show something; an untouched past day
      // still draws a thin mark so it reads as "planned but missed".
      value: p.ratio > 0 ? p.ratio : 0.04,
    };
  };

  // Last seven written days, newest first — the strip shown when the grid is
  // closed, so the recent past is always one glance away.
  const recent = useMemo(
    () => [...visible].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 7).reverse(),
    [visible]
  );

  const doneCount = visible.filter((d) => dayProgress(d).complete).length;

  return (
    <View style={styles.card}>
      <Pressable style={styles.head} onPress={() => setOpen((v) => !v)}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>📅 {t('program.historyTitle')}</Text>
          <Text style={styles.sub}>
            {t('program.historySub', { done: doneCount, total: visible.length })}
          </Text>
        </View>
        <Text style={styles.toggle}>{open ? '✕' : t('program.seeAll')}</Text>
      </Pressable>

      {open ? (
        <View style={styles.grid}>
          <RingCalendar
            selected={new Date()}
            locale={i18n.language}
            ringFor={ringFor}
            selectedVariant="ring"
            onSelect={(d) => {
              const iso = isoDay(d);
              // Only days that exist can be opened. Tomorrow stays shut.
              if (byDate.has(iso)) onOpenDay(iso);
            }}
          />
          <Text style={styles.legend}>{t('program.historyLegend')}</Text>
        </View>
      ) : (
        <View style={styles.strip}>
          {recent.map((d) => {
            const p = dayProgress(d);
            const date = new Date(`${d.date}T12:00:00`);
            return (
              <Pressable key={d.date} style={styles.stripDay} onPress={() => onOpenDay(d.date)}>
                <Text style={styles.stripLabel}>
                  {date.toLocaleDateString(i18n.language, { weekday: 'narrow' })}
                </Text>
                <DayRingGlyph
                  ring={{
                    kind: 'progress',
                    color: ringColor(p.ratio, d.date < today),
                    value: p.ratio > 0 ? p.ratio : 0.04,
                  }}
                  size={26}
                  stroke={3}
                />
                <Text style={[styles.stripNum, d.date === today && styles.stripNumToday]}>
                  {date.getDate()}
                </Text>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 15,
    marginTop: 12,
    ...shadows.card,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  title: { fontFamily: F800, fontSize: 14, color: INK },
  sub: { fontFamily: F600, fontSize: 11.5, color: '#8a98a7', marginTop: 2 },
  toggle: { fontFamily: F700, fontSize: 12, color: GREEN },

  grid: { marginTop: 14 },
  legend: {
    fontFamily: F600,
    fontSize: 10.5,
    lineHeight: 15,
    color: '#8a98a7',
    marginTop: 10,
  },

  strip: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 13 },
  stripDay: { alignItems: 'center', gap: 4, paddingHorizontal: 4 },
  stripLabel: { fontFamily: F700, fontSize: 9.5, color: '#9aa3b2', textTransform: 'uppercase' },
  stripNum: { fontFamily: F700, fontSize: 11.5, color: '#374151' },
  stripNumToday: { color: GREEN, fontFamily: F800 },
});
