import React, { useMemo, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useTranslation } from 'react-i18next';

import { nowDate } from '@/lib/clock';
import { useAppStore } from '@/store/useAppStore';

const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';
const INK = '#1E2430';
const GREEN = '#17A24A';
const MUTED = '#5B6472';

const IN_RANGE = '#19C37D';
const MID = '#F2B84B';
const LOW = '#EF4444';

const dowLabels = (locale: string) =>
  Array.from({ length: 7 }, (_, i) =>
    new Date(2024, 0, 1 + i).toLocaleDateString(locale, { weekday: 'narrow' })
  );

const sameDate = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/**
 * In-place day picker. Opens over the journal (a centred sheet, not a route).
 * Each day wears a ring coloured by that day's glucose time-in-range — green
 * for a day mostly on target, amber for a mixed day, red for a hard one — with
 * a legend up top and the reading count under the number, so the patient can
 * scan a whole month at a glance and jump straight to any past day.
 */
export function CalendarSheet({
  open,
  selected,
  onSelect,
  onClose,
}: {
  open: boolean;
  selected: Date;
  onSelect: (d: Date) => void;
  onClose: () => void;
}) {
  const { i18n, t } = useTranslation();
  const DOW = useMemo(() => dowLabels(i18n.language), [i18n.language]);
  const { meals, insulinLogs, glucoseLogs, profile } = useAppStore();
  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;

  const [monthsBack, setMonthsBack] = useState(0);

  const { year, month, monthName, firstDay, daysInMonth } = useMemo(() => {
    const now = nowDate();
    const shown = new Date(now.getFullYear(), now.getMonth() - monthsBack, 1);
    const y = shown.getFullYear();
    const m = shown.getMonth();
    return {
      year: y,
      month: m,
      monthName: shown.toLocaleDateString(i18n.language, { month: 'long', year: 'numeric' }),
      firstDay: (new Date(y, m, 1).getDay() + 6) % 7, // Monday-first
      daysInMonth: new Date(y, m + 1, 0).getDate(),
    };
  }, [monthsBack, i18n.language]);

  // Per-day glucose time-in-range for the shown month.
  const dayStats = useMemo(() => {
    const map = new Map<number, { tir: number; count: number }>();
    for (const g of glucoseLogs) {
      const d = new Date(g.created_at);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const day = d.getDate();
      const cur = map.get(day) ?? { tir: 0, count: 0 };
      const inRange = g.value >= low && g.value <= high ? 1 : 0;
      map.set(day, { tir: (cur.tir * cur.count + inRange) / (cur.count + 1), count: cur.count + 1 });
    }
    return map;
  }, [glucoseLogs, year, month, low, high]);

  // Days holding any entry (meal / insulin) — a small dot marks them.
  const dataDays = useMemo(() => {
    const set = new Set<number>();
    const mark = (iso: string) => {
      const d = new Date(iso);
      if (d.getFullYear() === year && d.getMonth() === month) set.add(d.getDate());
    };
    meals.forEach((m) => mark(m.created_at));
    insulinLogs.forEach((i) => mark(i.created_at));
    return set;
  }, [meals, insulinLogs, year, month]);

  const ringColor = (day: number) => {
    const s = dayStats.get(day);
    if (!s) return '#E4E4E9';
    if (s.tir >= 0.7) return IN_RANGE;
    if (s.tir >= 0.4) return MID;
    return LOW;
  };

  const today = nowDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <View style={styles.head}>
            <Text style={styles.title}>{t('journalV2.selectDay')}</Text>
            <Pressable onPress={onClose} hitSlop={8} style={styles.closeBtn} accessibilityRole="button">
              <Text style={styles.closeX}>✕</Text>
            </Pressable>
          </View>

          {/* Legend */}
          <View style={styles.legend}>
            <LegendDot color={IN_RANGE} label={t('journalV2.legendHigh')} />
            <LegendDot color={MID} label={t('journalV2.legendMid')} />
            <LegendDot color={LOW} label={t('journalV2.legendLow')} />
          </View>

          <View style={styles.monthRow}>
            <Pressable onPress={() => setMonthsBack((m) => m + 1)} hitSlop={8} style={styles.arrow}>
              <Text style={styles.arrowText}>‹</Text>
            </Pressable>
            <Text style={styles.monthName}>{monthName}</Text>
            <Pressable
              onPress={() => setMonthsBack((m) => Math.max(0, m - 1))}
              disabled={monthsBack === 0}
              hitSlop={8}
              style={[styles.arrow, monthsBack === 0 && { opacity: 0.3 }]}
            >
              <Text style={styles.arrowText}>›</Text>
            </Pressable>
          </View>

          <View style={styles.dowRow}>
            {DOW.map((d, i) => (
              <Text key={i} style={styles.dow}>
                {d}
              </Text>
            ))}
          </View>

          <View style={styles.grid}>
            {cells.map((n, i) => {
              if (n == null) return <View key={`e${i}`} style={styles.cell} />;
              const cellDate = new Date(year, month, n);
              const isFuture = cellDate > today && !sameDate(cellDate, today);
              const isSelected = sameDate(cellDate, selected);
              const isToday = sameDate(cellDate, today);
              const hasStats = dayStats.has(n);
              return (
                <Pressable
                  key={n}
                  style={styles.cell}
                  disabled={isFuture}
                  onPress={() => {
                    onSelect(cellDate);
                    onClose();
                  }}
                >
                  <View style={[styles.cellInner, isSelected && styles.cellSelected]}>
                    <Svg width={30} height={30} viewBox="0 0 30 30">
                      <Circle
                        cx={15}
                        cy={15}
                        r={12.5}
                        fill="none"
                        stroke={isSelected ? '#fff' : ringColor(n)}
                        strokeWidth={hasStats || isSelected ? 3 : 2}
                        opacity={isFuture ? 0.4 : 1}
                      />
                    </Svg>
                    <Text
                      style={[
                        styles.dayNum,
                        isFuture && styles.dayFuture,
                        isToday && !isSelected && styles.dayToday,
                        isSelected && styles.dayNumSelected,
                      ]}
                    >
                      {n}
                    </Text>
                  </View>
                  {hasStats ? (
                    <Text style={[styles.count, isSelected && { color: GREEN }]}>
                      {dayStats.get(n)!.count}
                    </Text>
                  ) : dataDays.has(n) ? (
                    <View style={styles.dot} />
                  ) : (
                    <View style={styles.countSpacer} />
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendRing, { borderColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16,24,20,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 366,
    backgroundColor: '#fff',
    borderRadius: 24,
    padding: 18,
    shadowColor: 'rgba(10,30,20,1)',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.24,
    shadowRadius: 30,
    elevation: 12,
  },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title: { fontFamily: F800, fontSize: 15.5, color: INK },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#F1F2F5', alignItems: 'center', justifyContent: 'center' },
  closeX: { fontSize: 14, color: MUTED, fontFamily: F700 },

  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 12 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendRing: { width: 11, height: 11, borderRadius: 6, borderWidth: 2.4 },
  legendLabel: { fontFamily: F600, fontSize: 10.5, color: MUTED },

  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6 },
  arrow: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#F1F2F5', alignItems: 'center', justifyContent: 'center' },
  arrowText: { fontFamily: F700, fontSize: 20, color: INK, lineHeight: 22 },
  monthName: { fontFamily: F800, fontSize: 14, color: INK, textTransform: 'capitalize' },

  dowRow: { flexDirection: 'row' },
  dow: { flex: 1, textAlign: 'center', fontFamily: F700, fontSize: 10.5, color: MUTED, paddingVertical: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', justifyContent: 'flex-start', paddingVertical: 3 },
  cellInner: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17 },
  cellSelected: { backgroundColor: GREEN },
  dayNum: { position: 'absolute', fontFamily: F700, fontSize: 12, color: INK },
  dayNumSelected: { color: '#fff', fontFamily: F800 },
  dayFuture: { color: '#C7CCD5' },
  dayToday: { color: GREEN, fontFamily: F800 },
  count: { fontFamily: F700, fontSize: 8.5, color: '#98A0AD', marginTop: 0 },
  countSpacer: { height: 11 },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: GREEN, marginTop: 3.5 },
});
