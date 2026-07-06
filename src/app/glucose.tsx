import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Circle, Line, Polyline, Rect } from 'react-native-svg';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  BevelCard,
  ChevronLeft,
  FadeInView,
  PlusGlyph,
  PremiumEmptyState,
} from '@/components/ui';
import { predictGlucose } from '@/services/prediction';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';

const CHART_W = 320;
const CHART_H = 160;
const Y_MIN = 40;
const Y_MAX = 300;

function isToday(iso: string) {
  return new Date(iso).toDateString() === new Date().toDateString();
}

function statusColor(value: number, low: number, high: number) {
  if (value < low) return colors.glucoseLow;
  if (value > high) return colors.glucoseHigh;
  return colors.glucoseInRange;
}

export default function GlucoseScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { glucoseLogs, meals, profile, removeGlucoseLog } = useAppStore();

  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;

  const prediction = useMemo(
    () => predictGlucose(glucoseLogs, meals, profile),
    [glucoseLogs, meals, profile]
  );

  const today = useMemo(
    () =>
      glucoseLogs
        .filter((g) => isToday(g.created_at))
        .sort(
          (a, b) =>
            new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        ),
    [glucoseLogs]
  );

  const stats = useMemo(() => {
    if (today.length === 0) return null;
    const values = today.map((g) => g.value);
    const avg = Math.round(values.reduce((s, v) => s + v, 0) / values.length);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const inRange = values.filter((v) => v >= low && v <= high).length;
    const tir = Math.round((inRange / values.length) * 100);
    return { avg, min, max, tir };
  }, [today, low, high]);

  // Chart geometry
  const toX = (iso: string) => {
    const d = new Date(iso);
    const mins = d.getHours() * 60 + d.getMinutes();
    return (mins / 1440) * CHART_W;
  };
  const toY = (v: number) => {
    const clamped = Math.max(Y_MIN, Math.min(Y_MAX, v));
    return CHART_H - ((clamped - Y_MIN) / (Y_MAX - Y_MIN)) * CHART_H;
  };
  const points = today.map((g) => `${toX(g.created_at)},${toY(g.value)}`).join(' ');

  // Last 7 days grouped (excluding today) for history list
  const history = useMemo(() => {
    const map = new Map<string, typeof glucoseLogs>();
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    for (const g of glucoseLogs) {
      const t = new Date(g.created_at).getTime();
      if (t < cutoff || isToday(g.created_at)) continue;
      const day = new Date(g.created_at).toLocaleDateString('fr-FR', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
      map.set(day, [...(map.get(day) ?? []), g]);
    }
    return [...map.entries()];
  }, [glucoseLogs]);

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
          <Text style={styles.headTitle}>Glycémie</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Stats */}
        <View style={styles.statsRow}>
          <BevelCard style={styles.statCard}>
            <Text style={styles.statLabel}>Moyenne</Text>
            <Text style={styles.statValue}>{stats ? stats.avg : '—'}</Text>
            <Text style={styles.statUnit}>mg/dL</Text>
          </BevelCard>
          <BevelCard style={styles.statCard}>
            <Text style={styles.statLabel}>Dans la cible</Text>
            <Text
              style={[
                styles.statValue,
                stats
                  ? {
                      color:
                        stats.tir >= 70
                          ? colors.glucoseInRange
                          : stats.tir >= 50
                            ? colors.glucoseHigh
                            : colors.glucoseLow,
                    }
                  : null,
              ]}
            >
              {stats ? `${stats.tir}%` : '—'}
            </Text>
            <Text style={styles.statUnit}>
              {low}–{high}
            </Text>
          </BevelCard>
          <BevelCard style={styles.statCard}>
            <Text style={styles.statLabel}>Min / Max</Text>
            <Text style={styles.statValue}>
              {stats ? `${stats.min}` : '—'}
            </Text>
            <Text style={styles.statUnit}>{stats ? `max ${stats.max}` : ''}</Text>
          </BevelCard>
        </View>

        {/* Today's chart */}
        <BevelCard style={styles.chartCard}>
          <Text style={styles.cardTitle}>Courbe du jour</Text>
          {today.length === 0 ? (
            <PremiumEmptyState
              bare
              emoji="🩸"
              title="Aucune mesure aujourd'hui"
              message="Ajoutez votre première glycémie avec le bouton + en bas à droite."
              actionLabel="Ajouter une mesure"
              onAction={() => router.push('/log-glucose')}
            />
          ) : (
            <>
              <View style={styles.chartWrap}>
                <Svg
                  width="100%"
                  height={CHART_H}
                  viewBox={`0 0 ${CHART_W} ${CHART_H}`}
                  preserveAspectRatio="none"
                >
                  {/* Target band */}
                  <Rect
                    x={0}
                    y={toY(high)}
                    width={CHART_W}
                    height={toY(low) - toY(high)}
                    fill="rgba(55,178,77,0.08)"
                  />
                  <Line
                    x1={0}
                    y1={toY(high)}
                    x2={CHART_W}
                    y2={toY(high)}
                    stroke="#B7E4C8"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                  />
                  <Line
                    x1={0}
                    y1={toY(low)}
                    x2={CHART_W}
                    y2={toY(low)}
                    stroke="#B7E4C8"
                    strokeWidth={1.5}
                    strokeDasharray="5 5"
                  />
                  {/* Curve */}
                  {today.length > 1 ? (
                    <Polyline
                      points={points}
                      fill="none"
                      stroke={colors.ink}
                      strokeWidth={2.5}
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ) : null}
                  {today.map((g) => (
                    <Circle
                      key={g.id}
                      cx={toX(g.created_at)}
                      cy={toY(g.value)}
                      r={5}
                      fill={statusColor(g.value, low, high)}
                      stroke="#fff"
                      strokeWidth={2}
                    />
                  ))}
                </Svg>
                <View style={styles.bandLabels}>
                  <Text style={styles.bandLabel}>{high}</Text>
                  <Text style={styles.bandLabel}>{low}</Text>
                </View>
              </View>
              <View style={styles.axis}>
                {['00h', '06h', '12h', '18h', '24h'].map((t) => (
                  <Text key={t} style={styles.axisText}>
                    {t}
                  </Text>
                ))}
              </View>
            </>
          )}
        </BevelCard>

        {/* Trend prediction (estimate) */}
        {prediction ? (
          <BevelCard style={styles.predCard}>
            <View style={styles.predHead}>
              <Text style={styles.predTitle}>
                {prediction.direction === 'rise'
                  ? '📈 Hausse attendue'
                  : prediction.direction === 'drop'
                    ? '📉 Baisse attendue'
                    : '➡️ Tendance stable'}
              </Text>
              {prediction.expectedValue !== null ? (
                <Text style={styles.predValue}>
                  ≈ {prediction.expectedValue}{' '}
                  <Text style={styles.predUnit}>mg/dL dans ~2 h</Text>
                </Text>
              ) : null}
            </View>
            {prediction.riskWindow ? (
              <Text style={styles.predRisk}>
                ⚠️ Période à risque{' '}
                {prediction.riskType === 'hypo' ? "d'hypo" : "d'hyper"} :{' '}
                {prediction.riskWindow} (d'après vos {prediction.sampleSize}{' '}
                dernières mesures)
              </Text>
            ) : null}
            {prediction.suggestedCheck ? (
              <Text style={styles.predCheck}>
                🕐 Prochain contrôle conseillé {prediction.suggestedCheck}
              </Text>
            ) : null}
            <Text style={styles.predDisclaimer}>
              Estimation statistique basée sur votre historique — pas une
              mesure réelle ni un avis médical.
            </Text>
          </BevelCard>
        ) : null}

        {/* Today's readings */}
        {today.length > 0 ? (
          <>
            <Text style={styles.section}>Aujourd'hui</Text>
            <View style={{ gap: 10 }}>
              {[...today].reverse().map((g) => (
                <BevelCard key={g.id} style={styles.readingRow}>
                  <View
                    style={[
                      styles.dot,
                      { backgroundColor: statusColor(g.value, low, high) },
                    ]}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.readingValue}>
                      {g.value}{' '}
                      <Text style={styles.readingUnit}>mg/dL</Text>
                    </Text>
                    {g.notes ? (
                      <Text style={styles.readingNotes}>{g.notes}</Text>
                    ) : null}
                  </View>
                  <Text style={styles.readingTime}>
                    {new Date(g.created_at).toLocaleTimeString('fr-FR', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                  <Pressable
                    onPress={() => removeGlucoseLog(g.id)}
                    hitSlop={8}
                    style={styles.deleteBtn}
                  >
                    <Text style={styles.deleteText}>✕</Text>
                  </Pressable>
                </BevelCard>
              ))}
            </View>
          </>
        ) : null}

        {/* History */}
        {history.length > 0 ? (
          <>
            <Text style={styles.section}>7 derniers jours</Text>
            {history.map(([day, logs]) => (
              <View key={day} style={{ marginBottom: 14 }}>
                <Text style={styles.dayLabel}>{day}</Text>
                <View style={{ gap: 8 }}>
                  {logs.map((g) => (
                    <BevelCard key={g.id} style={styles.readingRow}>
                      <View
                        style={[
                          styles.dot,
                          { backgroundColor: statusColor(g.value, low, high) },
                        ]}
                      />
                      <Text style={[styles.readingValue, { flex: 1 }]}>
                        {g.value}{' '}
                        <Text style={styles.readingUnit}>mg/dL</Text>
                      </Text>
                      <Text style={styles.readingTime}>
                        {new Date(g.created_at).toLocaleTimeString('fr-FR', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </Text>
                      <Pressable
                        onPress={() => removeGlucoseLog(g.id)}
                        hitSlop={8}
                        style={styles.deleteBtn}
                      >
                        <Text style={styles.deleteText}>✕</Text>
                      </Pressable>
                    </BevelCard>
                  ))}
                </View>
              </View>
            ))}
          </>
        ) : null}
      </ScrollView>

      {/* Floating add */}
      <Pressable
        onPress={() => router.push('/log-glucose')}
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
  predCard: { marginTop: 12 },
  predHead: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 6,
  },
  predTitle: { fontSize: 16, fontWeight: '750' as any, color: colors.text },
  predValue: { fontSize: 16, fontWeight: '800', color: colors.text },
  predUnit: { fontSize: 12.5, fontWeight: '500', color: colors.textSecondary },
  predRisk: { marginTop: 10, fontSize: 13.5, lineHeight: 19, color: '#B45D22' },
  predCheck: { marginTop: 6, fontSize: 13.5, color: colors.ai, fontWeight: '600' },
  predDisclaimer: {
    marginTop: 10,
    fontSize: 11.5,
    lineHeight: 16,
    color: colors.textTertiary,
  },
  cardTitle: { fontSize: 17, fontWeight: '650' as any, color: colors.text },
  chartWrap: { marginTop: 14, flexDirection: 'row' },
  bandLabels: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    justifyContent: 'space-between',
    paddingVertical: 30,
  },
  bandLabel: { fontSize: 11, color: '#6BC48A', fontWeight: '600' },
  axis: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  axisText: { fontSize: 12, color: colors.textTertiary },
  emptyChart: { paddingVertical: 36, alignItems: 'center', gap: 6 },
  emptyTitle: { fontSize: 16, fontWeight: '650' as any, color: '#9B9BA1' },
  emptySub: { fontSize: 14, color: '#C7C7CC', textAlign: 'center' },
  section: {
    fontSize: 20,
    fontWeight: '750' as any,
    color: colors.text,
    marginTop: 26,
    marginBottom: 12,
    marginHorizontal: 2,
  },
  dayLabel: {
    fontSize: 14,
    color: colors.textSecondary,
    marginBottom: 8,
    marginHorizontal: 2,
    textTransform: 'capitalize',
  },
  readingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  readingValue: { fontSize: 18, fontWeight: '750' as any, color: colors.text },
  readingUnit: { fontSize: 13, fontWeight: '500', color: colors.textSecondary },
  readingNotes: { marginTop: 2, fontSize: 13, color: colors.textSecondary },
  readingTime: { fontSize: 14, color: colors.textSecondary },
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
