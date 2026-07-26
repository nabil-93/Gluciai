import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from 'react-native-svg';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';

import { AppButton, FadeInView, HeroScreen, HERO_INK, HERO_MUTED } from '@/components/ui';
import { nowMs } from '@/lib/clock';
import { SOURCE_LABEL } from '@/services/nutrition/engine';
import { BAND_COLORS, buildReportHtml, SLOT_FR } from '@/services/reportHtml';
import { buildReportStats, trendGeometry } from '@/services/reportStats';
import { getWeeklySummary } from '@/services/weeklyReport';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/** The windows a consultation is actually held over. */
const RANGES = [
  { days: 7, label: '7 j' },
  { days: 14, label: '14 j' },
  { days: 30, label: '30 j' },
  { days: 90, label: '90 j' },
];

/* Shared with the PDF so the screen and the printed document cannot drift. */
const BAND = BAND_COLORS;

const fmtD = (d: Date) =>
  d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

export default function ReportScreen() {
  const router = useRouter();
  const { profile, glucoseLogs, insulinLogs, meals, activityLogs } = useAppStore();
  const [generating, setGenerating] = useState(false);
  const [days, setDays] = useState(30);

  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;

  const stats = useMemo(
    () =>
      buildReportStats({
        days,
        profile,
        glucoseLogs,
        insulinLogs,
        meals,
        activityLogs,
        now: nowMs(),
      }),
    [days, profile, glucoseLogs, insulinLogs, meals, activityLogs]
  );

  const weekly = useMemo(
    () => getWeeklySummary(glucoseLogs, insulinLogs, meals, activityLogs, profile),
    [glucoseLogs, insulinLogs, meals, activityLogs, profile]
  );

  const trend = useMemo(
    () => trendGeometry(stats.byDay, low, high, 620, 200),
    [stats.byDay, low, high]
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const generate = async () => {
    setGenerating(true);
    try {
      await Print.printAsync({
        html: buildReportHtml({
          stats,
          narrative: weekly,
          low,
          high,
          trend,
          patient: {
            name: profile?.name,
            diabetesType: profile?.diabetes_type,
            carbRatio: profile?.carb_ratio,
            correctionFactor: profile?.correction_factor,
            bolusInsulinName: profile?.bolus_insulin_name,
            basalInsulinName: profile?.basal_insulin_name,
            basalDose: profile?.basal_dose,
            doctorName: profile?.doctor_name,
          },
          meals: meals
            .filter((m) => new Date(m.created_at) >= stats.from)
            // Newest first, like every other table in the document — a
            // consultation reads backwards from today.
            .sort((a, b) => b.created_at.localeCompare(a.created_at))
            .map((m) => ({
              createdAt: m.created_at,
              name: m.result.food_name,
              carbs: m.result.carbohydrates,
              sugar: m.result.sugar ?? 0,
              calories: m.result.calories,
              sourceLabel: m.result.source ? SOURCE_LABEL[m.result.source] : 'Estimation IA',
            })),
        }),
      });
    } catch {
      // user cancelled the print dialog — nothing to do
    } finally {
      setGenerating(false);
    }
  };

  const tirGood = stats.inRangePct >= 70;
  const thin = stats.count > 0 && stats.perDay < 1;

  return (
    <HeroScreen title="Rapport médecin" glyph="report" tint="#4E6B87" onClose={close} height={200}>
      {/* ── The window this whole report is about ── */}
      <FadeInView>
        <View style={styles.periodCard}>
          <Text style={styles.periodLabel}>Période analysée</Text>
          <Text style={styles.periodRange}>
            du {fmtD(stats.from)} au {fmtD(stats.to)}
          </Text>
          <View style={styles.rangeRow}>
            {RANGES.map((r) => {
              const on = r.days === days;
              return (
                <Pressable
                  key={r.days}
                  onPress={() => setDays(r.days)}
                  style={[styles.rangeChip, on && styles.rangeChipOn]}
                >
                  <Text style={[styles.rangeText, on && styles.rangeTextOn]}>{r.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      </FadeInView>

      {/* ── The headline figure ── */}
      <FadeInView delay={60}>
        <LinearGradient
          colors={['#3C5670', '#22374B']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={styles.ea1cCard}
        >
          <View style={styles.ea1cRow}>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.ea1cLabel}>HbA1c estimée</Text>
              <View style={styles.ea1cValueRow}>
                <Text style={styles.ea1cValue}>
                  {stats.ea1c !== null ? stats.ea1c.toLocaleString('fr-FR') : '—'}
                </Text>
                <Text style={styles.ea1cUnit}>%</Text>
              </View>
            </View>
            <View style={styles.gmiBox}>
              <Text style={styles.gmiLabel}>GMI</Text>
              <Text style={styles.gmiValue}>
                {stats.gmi !== null ? `${stats.gmi.toLocaleString('fr-FR')} %` : '—'}
              </Text>
            </View>
          </View>
          <Text style={styles.ea1cHint}>
            Calculées depuis la moyenne glycémique ({stats.avg ?? '—'} mg/dL) sur{' '}
            {stats.count} mesure{stats.count > 1 ? 's' : ''} — indicatives, elles ne remplacent
            pas l&apos;analyse de laboratoire.
          </Text>
        </LinearGradient>

        {thin ? (
          <View style={styles.warnCard}>
            <Text style={styles.warnText}>
              ⚠️ {stats.perDay.toLocaleString('fr-FR')} mesure/jour en moyenne — trop peu pour que
              ces pourcentages soient représentatifs. Visez au moins 3 mesures par jour.
            </Text>
          </View>
        ) : null}
      </FadeInView>

      {/* ── Time in range, banded ── */}
      <FadeInView delay={110}>
        <Text style={styles.sectionTitle}>Temps dans les cibles</Text>
        <View style={styles.card}>
          <View style={styles.tirHead}>
            <Text style={[styles.tirBig, { color: tirGood ? BAND.inRange : BAND.high }]}>
              {stats.count ? `${stats.inRangePct.toLocaleString('fr-FR')} %` : '—'}
            </Text>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={styles.tirLabel}>dans la cible {low}–{high} mg/dL</Text>
              <Text style={styles.tirHint}>Objectif clinique : ≥ 70 %</Text>
            </View>
          </View>

          {stats.count ? (
            <>
              <View style={styles.tirBar}>
                {([
                  ['veryLow', stats.veryLowPct],
                  ['low', stats.lowPct],
                  ['inRange', stats.inRangePct],
                  ['high', stats.highPct],
                  ['veryHigh', stats.veryHighPct],
                ] as const).map(([k, v]) =>
                  v > 0 ? (
                    <View
                      key={k}
                      style={{ width: `${v}%`, height: 18, backgroundColor: BAND[k] }}
                    />
                  ) : null
                )}
              </View>
              <View style={styles.legend}>
                <LegendRow color={BAND.veryHigh} label={`Très élevé (> 250)`} pct={stats.veryHighPct} />
                <LegendRow color={BAND.high} label={`Élevé (> ${high})`} pct={stats.highPct} />
                <LegendRow color={BAND.inRange} label={`Cible (${low}–${high})`} pct={stats.inRangePct} />
                <LegendRow color={BAND.low} label={`Bas (< ${low})`} pct={stats.lowPct} />
                <LegendRow color={BAND.veryLow} label={`Très bas (< 54)`} pct={stats.veryLowPct} />
              </View>
            </>
          ) : (
            <Text style={styles.empty}>Aucune mesure sur la période.</Text>
          )}
        </View>
      </FadeInView>

      {/* ── The curve ── */}
      {trend ? (
        <FadeInView delay={160}>
          <Text style={styles.sectionTitle}>Moyenne glycémique par jour</Text>
          <View style={styles.card}>
            <Svg width="100%" height={186} viewBox={`0 0 ${trend.width} ${trend.height}`}>
              <Rect
                x={34}
                y={trend.band.y}
                width={trend.width - 42}
                height={trend.band.height}
                fill="#19C37D"
                opacity={0.12}
              />
              {trend.yTicks.map((t) => (
                <React.Fragment key={t.value}>
                  <Line
                    x1={34}
                    y1={t.y}
                    x2={trend.width - 8}
                    y2={t.y}
                    stroke="#E4EBE7"
                    strokeWidth={1}
                  />
                  <SvgText x={4} y={t.y + 4} fontSize={11} fill="#9AA8A0">
                    {t.value}
                  </SvgText>
                </React.Fragment>
              ))}
              <Path d={trend.area} fill="#2FC178" opacity={0.14} />
              <Path
                d={trend.line}
                stroke="#149A57"
                strokeWidth={2.5}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              {trend.points.map((p, i) => (
                <Circle key={i} cx={p.x} cy={p.y} r={3} fill="#149A57" />
              ))}
              <SvgText x={34} y={trend.height - 6} fontSize={11} fill="#9AA8A0">
                {trend.points[0].label}
              </SvgText>
              <SvgText
                x={trend.width - 8}
                y={trend.height - 6}
                fontSize={11}
                fill="#9AA8A0"
                textAnchor="end"
              >
                {trend.points[trend.points.length - 1].label}
              </SvgText>
            </Svg>
          </View>
        </FadeInView>
      ) : null}

      {/* ── Where the trouble sits ── */}
      <FadeInView delay={200}>
        <Text style={styles.sectionTitle}>Par moment de la journée</Text>
        <View style={styles.card}>
          {stats.bySlot.map((s) => (
            <View key={s.key} style={styles.slotRow}>
              <Text style={styles.slotLabel}>{SLOT_FR[s.key]}</Text>
              <Text style={styles.slotCount}>{s.count} mes.</Text>
              <Text
                style={[
                  styles.slotAvg,
                  {
                    color:
                      s.avg === null
                        ? '#B8C4BE'
                        : s.avg < low
                          ? BAND.low
                          : s.avg > high
                            ? BAND.high
                            : BAND.inRange,
                  },
                ]}
              >
                {s.avg ?? '—'}
              </Text>
            </View>
          ))}
        </View>
      </FadeInView>

      {/* ── Variability, insulin, food ── */}
      <FadeInView delay={240}>
        <Text style={styles.sectionTitle}>Détail de la période</Text>
        <View style={styles.grid}>
          <Stat label="Variabilité (CV)" value={stats.cv !== null ? `${stats.cv.toLocaleString('fr-FR')} %` : '—'} color={stats.cv !== null && stats.cv > 36 ? BAND.high : BAND.inRange} />
          <Stat label="Écart-type" value={stats.sd !== null ? `${stats.sd} mg/dL` : '—'} color={colors.ai} />
          <Stat label="Min / Max" value={stats.min !== null ? `${stats.min} / ${stats.max}` : '—'} color={HERO_INK} />
          <Stat label="Mesures / jour" value={stats.count ? stats.perDay.toLocaleString('fr-FR') : '—'} color={colors.ai} />
          <Stat label="Hypoglycémies" value={String(stats.lows)} color={BAND.low} />
          <Stat label="Hyperglycémies" value={String(stats.highs)} color={BAND.high} />
          <Stat label="Insuline / jour" value={stats.avgInsulinPerDay !== null ? `${stats.avgInsulinPerDay.toLocaleString('fr-FR')} U` : '—'} color={colors.ai} />
          <Stat label="Rapide / Lente" value={`${stats.rapidU.toLocaleString('fr-FR')} / ${stats.longU.toLocaleString('fr-FR')} U`} color={colors.carbs} />
          <Stat label="Glucides / jour" value={stats.avgCarbsPerDay !== null ? `${stats.avgCarbsPerDay} g` : '—'} color={colors.carbs} />
          <Stat label="Sucres / jour" value={stats.avgSugarPerDay !== null ? `${stats.avgSugarPerDay} g` : '—'} color={colors.protein} />
          <Stat label="Repas suivis" value={String(stats.mealsCount)} color={colors.protein} />
          <Stat label="Activité" value={`${stats.totalActivityMin} min`} color={colors.primary} />
        </View>
      </FadeInView>

      {/* ── What the week said ── */}
      <FadeInView delay={280}>
        <Text style={styles.sectionTitle}>Résumé IA de la semaine</Text>
        <View style={styles.card}>
          {weekly.observations.map((o, i) => (
            <Text key={`o${i}`} style={styles.weeklyLine}>📋 {o}</Text>
          ))}
          {weekly.positives.map((p, i) => (
            <Text key={`p${i}`} style={[styles.weeklyLine, { color: '#1B7A4E' }]}>✅ {p}</Text>
          ))}
          {weekly.improvements.map((p, i) => (
            <Text key={`i${i}`} style={[styles.weeklyLine, { color: '#B45D22' }]}>💡 {p}</Text>
          ))}
        </View>

        <AppButton
          label="📄 Générer le PDF / Imprimer"
          onPress={generate}
          loading={generating}
          style={{ marginTop: 18 }}
        />
        <Text style={styles.footHint}>
          Le PDF reprend cette période ({stats.days} jours), les graphiques, le détail par moment
          de la journée et les dernières mesures.
        </Text>
      </FadeInView>
    </HeroScreen>
  );
}

function LegendRow({ color, label, pct }: { color: string; label: string; pct: number }) {
  return (
    <View style={styles.legendRow}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <Text style={styles.legendLabel}>{label}</Text>
      <Text style={styles.legendPct}>{pct.toLocaleString('fr-FR')} %</Text>
    </View>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel} numberOfLines={2}>{label}</Text>
      <Text style={[styles.statValue, { color }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  /* Period */
  periodCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    ...shadows.card,
  },
  periodLabel: { fontFamily: F600, fontSize: 11, color: HERO_MUTED, textTransform: 'uppercase' },
  periodRange: { fontFamily: F800, fontSize: 14.5, color: HERO_INK, marginTop: 4 },
  rangeRow: { flexDirection: 'row', gap: 7, marginTop: 12 },
  rangeChip: {
    flex: 1,
    minHeight: 38,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E4EBE7',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeChipOn: { borderColor: '#149A57', backgroundColor: '#E9FBF2' },
  rangeText: { fontFamily: F700, fontSize: 12.5, color: HERO_MUTED },
  rangeTextOn: { color: '#0F7A42' },

  /* eA1c hero */
  ea1cCard: {
    borderRadius: 24,
    padding: 20,
    marginTop: 14,
    shadowColor: '#22374B',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.26,
    shadowRadius: 20,
    elevation: 7,
  },
  ea1cRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  ea1cLabel: { fontFamily: F600, fontSize: 12, color: 'rgba(255,255,255,0.85)' },
  ea1cValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 2 },
  ea1cValue: { fontFamily: F800, fontSize: 46, color: '#fff', letterSpacing: -1.5 },
  ea1cUnit: { fontFamily: F700, fontSize: 21, color: 'rgba(255,255,255,0.85)' },
  gmiBox: {
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 13,
    alignItems: 'center',
  },
  gmiLabel: { fontFamily: F600, fontSize: 10, color: 'rgba(255,255,255,0.85)' },
  gmiValue: { fontFamily: F800, fontSize: 15, color: '#fff', marginTop: 2 },
  ea1cHint: {
    marginTop: 12,
    fontFamily: F500,
    fontSize: 11,
    lineHeight: 16,
    color: 'rgba(255,255,255,0.8)',
  },

  warnCard: {
    backgroundColor: '#FFF6E5',
    borderWidth: 1,
    borderColor: '#F6DFB0',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
  },
  warnText: { fontFamily: F600, fontSize: 11.5, lineHeight: 16.5, color: '#8A5B00' },

  sectionTitle: {
    fontFamily: F800,
    fontSize: 15,
    color: HERO_INK,
    marginTop: 22,
    marginBottom: 10,
    marginLeft: 2,
  },
  card: { backgroundColor: '#FFFFFF', borderRadius: 20, padding: 16, ...shadows.card },
  empty: { fontFamily: F500, fontSize: 12, color: '#9AA8A0' },

  /* TIR */
  tirHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tirBig: { fontFamily: F800, fontSize: 32, letterSpacing: -1 },
  tirLabel: { fontFamily: F700, fontSize: 12.5, color: HERO_INK },
  tirHint: { fontFamily: F500, fontSize: 11, color: HERO_MUTED, marginTop: 2 },
  tirBar: {
    flexDirection: 'row',
    height: 18,
    borderRadius: 6,
    overflow: 'hidden',
    marginTop: 14,
    backgroundColor: '#EEF3F0',
  },
  legend: { marginTop: 12, gap: 5 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  legendLabel: { flex: 1, minWidth: 0, fontFamily: F600, fontSize: 11.5, color: HERO_MUTED },
  legendPct: { fontFamily: F800, fontSize: 11.5, color: HERO_INK },

  /* Slots */
  slotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4F1',
  },
  slotLabel: { flex: 1, minWidth: 0, fontFamily: F600, fontSize: 12.5, color: HERO_INK },
  slotCount: { fontFamily: F500, fontSize: 11, color: '#9AA8A0' },
  slotAvg: { fontFamily: F800, fontSize: 16, minWidth: 44, textAlign: 'right' },

  /* Grid */
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  stat: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 14,
    ...shadows.card,
  },
  statLabel: { fontFamily: F600, fontSize: 11, lineHeight: 14.5, color: HERO_MUTED },
  statValue: { fontFamily: F800, fontSize: 18, marginTop: 5, letterSpacing: -0.4 },

  weeklyLine: {
    fontFamily: F600,
    fontSize: 12.5,
    lineHeight: 19,
    color: '#3E4A44',
    marginBottom: 7,
  },
  footHint: {
    marginTop: 12,
    fontFamily: F500,
    fontSize: 11,
    lineHeight: 16,
    color: '#9AA8A0',
    textAlign: 'center',
  },
});
