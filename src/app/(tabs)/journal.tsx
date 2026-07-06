import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Ionicons } from '@expo/vector-icons';

import {
  EmptyState,
  GlassCard,
  MealCard,
  ScreenContainer,
} from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';
import { colors, radius, spacing, typography } from '@/theme';

type Filter = 'day' | 'week' | 'month';

const FILTER_MS: Record<Filter, number> = {
  day: 24 * 3600 * 1000,
  week: 7 * 24 * 3600 * 1000,
  month: 30 * 24 * 3600 * 1000,
};

interface TimelineItem {
  id: string;
  type: 'meal' | 'glucose' | 'insulin';
  created_at: string;
  render: React.ReactNode;
}

export default function HistoryScreen() {
  const { t, i18n } = useTranslation();
  const { meals, glucoseLogs, insulinLogs } = useAppStore();
  const [filter, setFilter] = useState<Filter>('week');

  const items = useMemo(() => {
    const cutoff = Date.now() - FILTER_MS[filter];
    const within = (iso: string) => new Date(iso).getTime() >= cutoff;

    const list: TimelineItem[] = [
      ...meals.filter((m) => within(m.created_at)).map((m) => ({
        id: `meal-${m.id}`,
        type: 'meal' as const,
        created_at: m.created_at,
        render: (
          <MealCard
            meal={m}
            carbsLabel={t('result.carbs')}
            caloriesLabel={t('result.calories')}
          />
        ),
      })),
      ...glucoseLogs.filter((g) => within(g.created_at)).map((g) => ({
        id: `glucose-${g.id}`,
        type: 'glucose' as const,
        created_at: g.created_at,
        render: (
          <LogRow
            icon="water"
            tint={colors.primary}
            title={t('history.glucose')}
            value={`${g.value} mg/dL`}
            time={g.created_at}
          />
        ),
      })),
      ...insulinLogs.filter((l) => within(l.created_at)).map((l) => ({
        id: `insulin-${l.id}`,
        type: 'insulin' as const,
        created_at: l.created_at,
        render: (
          <LogRow
            icon="medical"
            tint={colors.ai}
            title={t('history.insulin')}
            value={`${l.dose} U · ${t(`wizard.${l.insulin_type}`)}`}
            time={l.created_at}
          />
        ),
      })),
    ];
    return list.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [filter, meals, glucoseLogs, insulinLogs, t]);

  // Group by day
  const groups = useMemo(() => {
    const map = new Map<string, TimelineItem[]>();
    for (const item of items) {
      const day = new Date(item.created_at).toLocaleDateString(i18n.language, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      map.set(day, [...(map.get(day) ?? []), item]);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <ScreenContainer withTabBarSpace>
      <Text style={styles.title}>{t('history.title')}</Text>

      <View style={styles.filters}>
        {(['day', 'week', 'month'] as Filter[]).map((f) => (
          <Pressable
            key={f}
            onPress={() => setFilter(f)}
            style={[styles.chip, filter === f && styles.chipActive]}
          >
            <Text style={[styles.chipText, filter === f && styles.chipTextActive]}>
              {t(`history.${f}`)}
            </Text>
          </Pressable>
        ))}
      </View>

      {groups.length === 0 ? (
        <EmptyState icon="time-outline" message={t('history.empty')} />
      ) : (
        groups.map(([day, dayItems]) => (
          <View key={day} style={styles.group}>
            <Text style={styles.day}>{day}</Text>
            <View style={styles.list}>
              {dayItems.map((item) => (
                <View key={item.id}>{item.render}</View>
              ))}
            </View>
          </View>
        ))
      )}
    </ScreenContainer>
  );
}

function LogRow({
  icon,
  tint,
  title,
  value,
  time,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  tint: string;
  title: string;
  value: string;
  time: string;
}) {
  return (
    <GlassCard style={styles.logRow}>
      <View style={[styles.logIcon, { backgroundColor: `${tint}22` }]}>
        <Ionicons name={icon} size={18} color={tint} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.logTitle}>{title}</Text>
        <Text style={styles.logTime}>
          {new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
        </Text>
      </View>
      <Text style={styles.logValue}>{value}</Text>
    </GlassCard>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 29,
    fontWeight: '800',
    letterSpacing: -0.5,
    color: colors.text,
  },
  filters: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 9,
    borderRadius: radius.full,
    backgroundColor: colors.surface3,
  },
  chipActive: {
    backgroundColor: colors.ink,
  },
  chipText: { fontSize: 14, fontWeight: '650' as any, color: colors.textSecondary },
  chipTextActive: { color: '#fff' },
  group: { gap: spacing.md },
  day: { ...typography.caption, textTransform: 'capitalize' },
  list: { gap: spacing.md },
  logRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
  },
  logIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logTitle: { ...typography.bodyMedium, fontSize: 15 },
  logTime: { ...typography.caption, color: colors.textTertiary },
  logValue: { ...typography.bodyMedium, color: colors.primary },
});
