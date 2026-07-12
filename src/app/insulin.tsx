import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AppButton,
  BevelCard,
  ChevronLeft,
  PlusGlyph,
  PremiumEmptyState,
} from '@/components/ui';
import { deleteInsulin } from '@/services/data';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';
import type { InsulinType } from '@/types';

const TYPE_LABEL: Record<InsulinType, string> = {
  rapid: 'Rapide',
  long: 'Lente',
  mixed: 'Mixte',
};
const TYPE_COLOR: Record<InsulinType, string> = {
  rapid: colors.ai,
  long: '#7C93E8',
  mixed: colors.protein,
};

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

export default function InsulinScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { insulinLogs } = useAppStore();

  const today = useMemo(
    () => insulinLogs.filter((l) => isToday(l.created_at)),
    [insulinLogs]
  );
  const totalToday = today.reduce((s, l) => s + l.dose, 0);
  const rapidToday = today
    .filter((l) => l.insulin_type === 'rapid')
    .reduce((s, l) => s + l.dose, 0);
  const longToday = today
    .filter((l) => l.insulin_type === 'long')
    .reduce((s, l) => s + l.dose, 0);

  // 7-day totals for the bar chart
  const week = useMemo(() => {
    const days: { label: string; total: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = d.toDateString();
      const total = insulinLogs
        .filter((l) => new Date(l.created_at).toDateString() === key)
        .reduce((s, l) => s + l.dose, 0);
      days.push({
        label: d.toLocaleDateString('fr-FR', { weekday: 'narrow' }),
        total,
      });
    }
    return days;
  }, [insulinLogs]);
  const weekMax = Math.max(1, ...week.map((d) => d.total));

  const recent = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    return insulinLogs.filter(
      (l) => new Date(l.created_at).getTime() >= cutoff
    );
  }, [insulinLogs]);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 16,
          paddingBottom: 140,
        }}
      >
        <View style={styles.headRow}>
          <Pressable onPress={close} style={styles.backBtn}>
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle}>Insuline</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Today totals */}
        <View style={styles.statsRow}>
          <BevelCard style={styles.statCard}>
            <Text style={styles.statLabel}>Total aujourd'hui</Text>
            <Text style={styles.statValue}>{totalToday}</Text>
            <Text style={styles.statUnit}>unités</Text>
          </BevelCard>
          <BevelCard style={styles.statCard}>
            <Text style={styles.statLabel}>Rapide</Text>
            <Text style={[styles.statValue, { color: colors.ai }]}>
              {rapidToday}
            </Text>
            <Text style={styles.statUnit}>U</Text>
          </BevelCard>
          <BevelCard style={styles.statCard}>
            <Text style={styles.statLabel}>Lente</Text>
            <Text style={[styles.statValue, { color: '#7C93E8' }]}>
              {longToday}
            </Text>
            <Text style={styles.statUnit}>U</Text>
          </BevelCard>
        </View>

        {/* Week bar chart */}
        <BevelCard style={styles.chartCard}>
          <Text style={styles.cardTitle}>7 derniers jours</Text>
          <View style={styles.bars}>
            {week.map((d, i) => (
              <View key={i} style={styles.barCol}>
                <Text style={styles.barValue}>
                  {d.total > 0 ? d.total : ''}
                </Text>
                <View style={styles.barTrack}>
                  <View
                    style={[
                      styles.barFill,
                      {
                        height: `${Math.max(4, (d.total / weekMax) * 100)}%`,
                        backgroundColor:
                          i === 6 ? colors.ink : 'rgba(90,162,247,0.45)',
                      },
                    ]}
                  />
                </View>
                <Text style={styles.barLabel}>{d.label}</Text>
              </View>
            ))}
          </View>
        </BevelCard>

        <AppButton
          label="Calculer un bolus"
          onPress={() => router.push('/bolus')}
          style={{ marginTop: 14 }}
        />

        {/* Injections list */}
        <Text style={styles.section}>Injections</Text>
        {recent.length === 0 ? (
          <PremiumEmptyState
            emoji="💉"
            title="Aucune injection enregistrée"
            message="Ajoutez une dose avec le bouton + ou laissez le calculateur de bolus la proposer."
            actionLabel="Calculer un bolus"
            onAction={() => router.push('/bolus')}
          />
        ) : (
          <View style={{ gap: 10 }}>
            {recent.map((l) => (
              <BevelCard key={l.id} style={styles.row}>
                <View
                  style={[
                    styles.typeBadge,
                    { backgroundColor: TYPE_COLOR[l.insulin_type] },
                  ]}
                >
                  <Text style={styles.typeBadgeText}>
                    {TYPE_LABEL[l.insulin_type][0]}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowValue}>
                    {l.dose} U{' '}
                    <Text style={styles.rowType}>
                      · {TYPE_LABEL[l.insulin_type]}
                    </Text>
                  </Text>
                  {l.notes ? (
                    <Text style={styles.rowNotes}>{l.notes}</Text>
                  ) : null}
                </View>
                <Text style={styles.rowTime}>
                  {new Date(l.created_at).toLocaleDateString('fr-FR', {
                    day: '2-digit',
                    month: '2-digit',
                  })}{' '}
                  {new Date(l.created_at).toLocaleTimeString('fr-FR', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </Text>
                <Pressable
                  onPress={() => deleteInsulin(l.id)}
                  hitSlop={8}
                  style={styles.deleteBtn}
                >
                  <Text style={styles.deleteText}>✕</Text>
                </Pressable>
              </BevelCard>
            ))}
          </View>
        )}
      </ScrollView>

      <Pressable
        onPress={() => router.push('/log-insulin')}
        style={[styles.fab, { bottom: Math.max(insets.bottom, 12) + 16 }]}
      >
        <PlusGlyph size={26} color="#fff" />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 20,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headTitle: { fontSize: 19, fontWeight: '750' as any, color: colors.text },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, paddingVertical: 14, paddingHorizontal: 12 },
  statLabel: { fontSize: 12.5, fontWeight: '600', color: colors.textSecondary },
  statValue: {
    marginTop: 6,
    fontSize: 22,
    fontWeight: '800',
    color: colors.text,
  },
  statUnit: { marginTop: 2, fontSize: 12, color: colors.textTertiary },
  chartCard: { marginTop: 12 },
  cardTitle: { fontSize: 17, fontWeight: '650' as any, color: colors.text },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginTop: 16,
    height: 130,
  },
  barCol: { flex: 1, alignItems: 'center', height: '100%' },
  barValue: { fontSize: 11, fontWeight: '700', color: colors.textSecondary },
  barTrack: {
    flex: 1,
    width: 18,
    borderRadius: 9,
    backgroundColor: colors.surface2,
    justifyContent: 'flex-end',
    overflow: 'hidden',
    marginTop: 4,
  },
  barFill: { width: '100%', borderRadius: 9 },
  barLabel: { marginTop: 6, fontSize: 12, color: colors.textSecondary },
  section: {
    fontSize: 20,
    fontWeight: '750' as any,
    color: colors.text,
    marginTop: 26,
    marginBottom: 12,
    marginHorizontal: 2,
  },
  empty: { paddingVertical: 30, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '650' as any, color: '#9B9BA1' },
  emptySub: {
    fontSize: 14,
    color: '#C7C7CC',
    textAlign: 'center',
    maxWidth: 280,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  typeBadge: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  typeBadgeText: { fontSize: 15, fontWeight: '800', color: '#fff' },
  rowValue: { fontSize: 17, fontWeight: '750' as any, color: colors.text },
  rowType: { fontSize: 13.5, fontWeight: '500', color: colors.textSecondary },
  rowNotes: { marginTop: 2, fontSize: 13, color: colors.textSecondary },
  rowTime: { fontSize: 13, color: colors.textSecondary, textAlign: 'right' },
  deleteBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.surface2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { fontSize: 13, color: colors.textSecondary, fontWeight: '700' },
  fab: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.floating,
  },
});
