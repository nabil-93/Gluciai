import React, { useMemo } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronDown } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';

const DOW = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

export default function CalendarScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { glucoseLogs, profile } = useAppStore();

  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const monthName = now.toLocaleDateString('fr-FR', {
    month: 'long',
    year: 'numeric',
  });
  const firstDay = (new Date(year, month, 1).getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = now.getDate();

  // Per-day glucose stats for the current month
  const dayStats = useMemo(() => {
    const map = new Map<number, { tir: number; count: number }>();
    for (const g of glucoseLogs) {
      const d = new Date(g.created_at);
      if (d.getFullYear() !== year || d.getMonth() !== month) continue;
      const day = d.getDate();
      const cur = map.get(day) ?? { tir: 0, count: 0 };
      const inRange = g.value >= low && g.value <= high ? 1 : 0;
      map.set(day, {
        tir: (cur.tir * cur.count + inRange) / (cur.count + 1),
        count: cur.count + 1,
      });
    }
    return map;
  }, [glucoseLogs, year, month, low, high]);

  const ringColor = (day: number) => {
    const s = dayStats.get(day);
    if (!s) return '#E4E4E9';
    if (s.tir >= 0.7) return colors.glucoseInRange;
    if (s.tir >= 0.4) return colors.glucoseHigh;
    return colors.glucoseLow;
  };

  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];

  return (
    <View style={[styles.root, { paddingTop: insets.top + 12 }]}>
      <View style={styles.headerRow}>
        <Pressable style={styles.titleBtn} onPress={close}>
          <Text style={styles.title}>{capitalize(monthName)}</Text>
          <ChevronDown size={16} />
        </Pressable>
      </View>

      {/* Legend */}
      <View style={styles.legend}>
        <LegendDot color={colors.glucoseInRange} label="≥70% dans la cible" />
        <LegendDot color={colors.glucoseHigh} label="40–70%" />
        <LegendDot color={colors.glucoseLow} label="<40%" />
      </View>

      <View style={styles.dowRow}>
        {DOW.map((d) => (
          <Text key={d} style={styles.dow}>
            {d}
          </Text>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.grid}>
        {cells.map((n, i) => (
          <View key={i} style={styles.cellWrap}>
            {n === null ? (
              <View style={styles.cellBlank} />
            ) : (
              <View style={[styles.cell, n === today && styles.cellToday]}>
                <Svg width={22} height={22} viewBox="0 0 24 24">
                  <Circle
                    cx={12}
                    cy={12}
                    r={9.5}
                    fill="none"
                    stroke={ringColor(n)}
                    strokeWidth={dayStats.has(n) ? 4 : 3}
                  />
                </Svg>
                <Text
                  style={[
                    styles.cellNum,
                    n === today && { color: colors.text, fontWeight: '700' },
                  ]}
                >
                  {n}
                </Text>
                {dayStats.has(n) ? (
                  <Text style={styles.cellCount}>
                    {dayStats.get(n)!.count}
                  </Text>
                ) : null}
              </View>
            )}
          </View>
        ))}
      </ScrollView>

      <Pressable
        style={[styles.todayBtn, { bottom: Math.max(insets.bottom, 12) + 16 }]}
        onPress={close}
      >
        <Text style={styles.todayBtnText}>Aujourd'hui</Text>
      </Pressable>
    </View>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { borderColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
    </View>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 16 },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  titleBtn: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.text,
    letterSpacing: -0.3,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    marginTop: 14,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 3,
  },
  legendLabel: { fontSize: 12.5, color: colors.textSecondary },
  dowRow: {
    flexDirection: 'row',
    marginTop: 16,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E4E4E9',
  },
  dow: { flex: 1, textAlign: 'center', fontSize: 14, color: colors.textSecondary },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingTop: 12,
    paddingBottom: 100,
  },
  cellWrap: { width: `${100 / 7}%`, padding: 3 },
  cellBlank: {
    aspectRatio: 0.72,
    borderRadius: 999,
    backgroundColor: '#EDEDF1',
    opacity: 0.5,
  },
  cell: {
    aspectRatio: 0.72,
    borderRadius: 999,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    ...shadows.card,
  },
  cellToday: { borderWidth: 2, borderColor: colors.ink },
  cellNum: { fontSize: 14, fontWeight: '600', color: colors.textSecondary },
  cellCount: { fontSize: 10, color: colors.textTertiary },
  todayBtn: {
    position: 'absolute',
    left: 16,
    backgroundColor: colors.surface,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 22,
    ...shadows.floating,
  },
  todayBtnText: { fontSize: 16, fontWeight: '650' as any, color: colors.ai },
});
