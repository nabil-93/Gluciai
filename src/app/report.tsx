import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Print from 'expo-print';
import { useRouter } from 'expo-router';

import { LinearGradient } from 'expo-linear-gradient';

import {
  AppButton,
  FadeInView,
  HeroScreen,
  HERO_INK,
  HERO_MUTED,
} from '@/components/ui';
import { SOURCE_LABEL } from '@/services/nutrition/engine';
import { nowMs } from '@/lib/clock';
import { getWeeklySummary } from '@/services/weeklyReport';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';

const DAYS = 30;

const TYPE_FR: Record<string, string> = {
  type1: 'Type 1',
  type2: 'Type 2',
  gestational: 'Gestationnel',
  prediabetes: 'Prédiabète',
};

export default function ReportScreen() {
  const router = useRouter();
  const { profile, glucoseLogs, insulinLogs, meals, activityLogs } =
    useAppStore();
  const [generating, setGenerating] = useState(false);

  const low = profile?.target_low ?? 70;
  const high = profile?.target_high ?? 180;

  const stats = useMemo(() => {
    const cutoff = nowMs() - DAYS * 24 * 3600 * 1000;
    const glucose = glucoseLogs.filter(
      (g) => new Date(g.created_at).getTime() >= cutoff
    );
    const insulin = insulinLogs.filter(
      (l) => new Date(l.created_at).getTime() >= cutoff
    );
    const mealsP = meals.filter(
      (m) => new Date(m.created_at).getTime() >= cutoff
    );
    const activities = activityLogs.filter(
      (a) => new Date(a.created_at).getTime() >= cutoff
    );

    const values = glucose.map((g) => g.value);
    const avg = values.length
      ? Math.round(values.reduce((s, v) => s + v, 0) / values.length)
      : null;
    const tir = values.length
      ? Math.round(
          (values.filter((v) => v >= low && v <= high).length / values.length) *
            100
        )
      : null;
    const lows = values.filter((v) => v < low).length;
    const highs = values.filter((v) => v > high).length;
    // eA1c (ADAG formula): (avg mg/dL + 46.7) / 28.7
    const ea1c = avg ? Math.round(((avg + 46.7) / 28.7) * 10) / 10 : null;

    const totalInsulin = insulin.reduce((s, l) => s + l.dose, 0);
    const insulinDays = new Set(
      insulin.map((l) => new Date(l.created_at).toDateString())
    ).size;
    const avgInsulinPerDay = insulinDays
      ? Math.round((totalInsulin / insulinDays) * 10) / 10
      : null;

    const totalCarbs = mealsP.reduce(
      (s, m) => s + (m.result.carbohydrates ?? 0),
      0
    );
    const mealDays = new Set(
      mealsP.map((m) => new Date(m.created_at).toDateString())
    ).size;
    const avgCarbsPerDay = mealDays ? Math.round(totalCarbs / mealDays) : null;

    const totalActivityMin = activities.reduce(
      (s, a) => s + a.duration_min,
      0
    );

    return {
      glucose,
      count: values.length,
      avg,
      tir,
      lows,
      highs,
      ea1c,
      avgInsulinPerDay,
      totalInsulin,
      avgCarbsPerDay,
      mealsCount: mealsP.length,
      totalActivityMin,
    };
  }, [glucoseLogs, insulinLogs, meals, activityLogs, low, high]);

  // Weekly AI summary (last 7 days)
  const weekly = useMemo(
    () =>
      getWeeklySummary(glucoseLogs, insulinLogs, meals, activityLogs, profile),
    [glucoseLogs, insulinLogs, meals, activityLogs, profile]
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  const buildHtml = () => {
    const period = `${new Date(Date.now() - DAYS * 24 * 3600 * 1000).toLocaleDateString('fr-FR')} — ${new Date().toLocaleDateString('fr-FR')}`;
    const rows = stats.glucose
      .slice(0, 60)
      .map(
        (g) => `<tr>
          <td>${new Date(g.created_at).toLocaleDateString('fr-FR')} ${new Date(g.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}</td>
          <td style="font-weight:700; color:${g.value < low ? '#E5484D' : g.value > high ? '#D9822B' : '#2E9E5B'}">${g.value} mg/dL</td>
          <td>${g.value < low ? 'Basse' : g.value > high ? 'Élevée' : 'Dans la cible'}</td>
          <td>${g.notes ?? ''}</td>
        </tr>`
      )
      .join('');

    return `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #1F1F24; padding: 32px; }
      h1 { font-size: 22px; margin: 0; }
      .sub { color: #8A8A90; font-size: 13px; margin-top: 4px; }
      .grid { display: flex; flex-wrap: wrap; gap: 12px; margin: 24px 0; }
      .stat { flex: 1; min-width: 130px; border: 1px solid #E4E4E9; border-radius: 12px; padding: 14px; }
      .stat .l { font-size: 11px; color: #8A8A90; text-transform: uppercase; letter-spacing: 0.5px; }
      .stat .v { font-size: 24px; font-weight: 800; margin-top: 4px; }
      table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-top: 8px; }
      th { text-align: left; color: #8A8A90; font-weight: 600; padding: 8px 6px; border-bottom: 2px solid #E4E4E9; }
      td { padding: 7px 6px; border-bottom: 1px solid #F0F0F3; }
      h2 { font-size: 15px; margin: 28px 0 4px; }
      .disc { margin-top: 28px; font-size: 11px; color: #B7B7BE; line-height: 1.5; }
      .patient { background: #F7F7F9; border-radius: 12px; padding: 14px 16px; margin-top: 18px; font-size: 13px; line-height: 1.7; }
    </style></head><body>
      <h1>Rapport glycémique — GluciAI</h1>
      <div class="sub">Période : ${period} (${DAYS} jours)</div>
      <div class="patient">
        <b>Patient :</b> ${profile?.name || '—'} · <b>Diabète :</b> ${TYPE_FR[profile?.diabetes_type ?? 'type2']} ·
        <b>Cible :</b> ${low}–${high} mg/dL
        ${profile?.carb_ratio ? ` · <b>Ratio :</b> 1 U / ${profile.carb_ratio} g` : ''}
        ${profile?.correction_factor ? ` · <b>Correction :</b> ${profile.correction_factor} mg/dL/U` : ''}
        ${profile?.doctor_name ? `<br><b>Médecin :</b> ${profile.doctor_name}` : ''}
      </div>
      <div class="grid">
        <div class="stat"><div class="l">Glycémie moyenne</div><div class="v">${stats.avg ?? '—'} <small>mg/dL</small></div></div>
        <div class="stat"><div class="l">HbA1c estimée</div><div class="v">${stats.ea1c ?? '—'} <small>%</small></div></div>
        <div class="stat"><div class="l">Temps dans la cible</div><div class="v">${stats.tir ?? '—'} <small>%</small></div></div>
        <div class="stat"><div class="l">Mesures</div><div class="v">${stats.count}</div></div>
        <div class="stat"><div class="l">Hypoglycémies</div><div class="v" style="color:#E5484D">${stats.lows}</div></div>
        <div class="stat"><div class="l">Hyperglycémies</div><div class="v" style="color:#D9822B">${stats.highs}</div></div>
        <div class="stat"><div class="l">Insuline / jour</div><div class="v">${stats.avgInsulinPerDay ?? '—'} <small>U</small></div></div>
        <div class="stat"><div class="l">Glucides / jour</div><div class="v">${stats.avgCarbsPerDay ?? '—'} <small>g</small></div></div>
      </div>
      <h2>Historique des mesures (${Math.min(60, stats.glucose.length)} dernières)</h2>
      <table>
        <tr><th>Date</th><th>Valeur</th><th>Statut</th><th>Notes</th></tr>
        ${rows || '<tr><td colspan="4">Aucune mesure sur la période.</td></tr>'}
      </table>
      <h2>Résumé IA de la semaine</h2>
      <div class="patient">
        ${weekly.observations.map((o) => `📋 ${o}`).join('<br>')}
        ${weekly.positives.length ? `<br><b>Points positifs :</b><br>${weekly.positives.map((p) => `✅ ${p}`).join('<br>')}` : ''}
        ${weekly.improvements.length ? `<br><b>Axes d'amélioration :</b><br>${weekly.improvements.map((p) => `💡 ${p}`).join('<br>')}` : ''}
      </div>
      <h2>Repas enregistrés (source nutritionnelle et confiance)</h2>
      <table>
        <tr><th>Date</th><th>Aliment</th><th>Glucides</th><th>Calories</th><th>Source</th><th>Confiance</th></tr>
        ${
          meals
            .filter(
              (m) =>
                new Date(m.created_at).getTime() >=
                Date.now() - DAYS * 24 * 3600 * 1000
            )
            .slice(0, 30)
            .map(
              (m) => `<tr>
                <td>${new Date(m.created_at).toLocaleDateString('fr-FR')}</td>
                <td>${m.result.food_name}</td>
                <td>${Math.round(m.result.carbohydrates)} g</td>
                <td>${Math.round(m.result.calories)} kcal</td>
                <td>${m.result.source ? SOURCE_LABEL[m.result.source] : 'Estimation IA'}</td>
                <td>${Math.round((m.result.nutrition_confidence ?? m.result.confidence) * 100)}%</td>
              </tr>`
            )
            .join('') ||
          '<tr><td colspan="6">Aucun repas sur la période.</td></tr>'
        }
      </table>
      <div class="disc">
        HbA1c estimée à partir de la moyenne glycémique (formule ADAG) — valeur indicative, seule une analyse
        de laboratoire fait foi. Rapport généré par GluciAI le ${new Date().toLocaleDateString('fr-FR')} —
        données saisies par le patient, à interpréter par un professionnel de santé.
      </div>
    </body></html>`;
  };

  const generate = async () => {
    setGenerating(true);
    try {
      await Print.printAsync({ html: buildHtml() });
    } catch {
      // user cancelled the print dialog — nothing to do
    } finally {
      setGenerating(false);
    }
  };

  const tirGood = stats.tir !== null && stats.tir >= 70;

  return (
    <HeroScreen
      title="Rapport médecin"
      glyph="report"
      tint="#4E6B87"
      onClose={close}
      height={210}
    >
      {/* ── The one figure a consultation opens on ── */}
      <FadeInView>
        <LinearGradient
          colors={['#3C5670', '#22374B']}
          start={{ x: 0.1, y: 0 }}
          end={{ x: 0.95, y: 1 }}
          style={styles.ea1cCard}
        >
          <Text style={styles.ea1cLabel}>HbA1c estimée</Text>
          <View style={styles.ea1cRow}>
            <Text style={styles.ea1cValue}>
              {stats.ea1c !== null ? stats.ea1c.toLocaleString('fr-FR') : '—'}
            </Text>
            <Text style={styles.ea1cUnit}>%</Text>
          </View>
          <Text style={styles.ea1cHint}>
            Calculée depuis votre moyenne glycémique ({stats.avg ?? '—'} mg/dL) —
            indicative, elle ne remplace pas l&apos;analyse de laboratoire.
          </Text>
        </LinearGradient>
        <Text style={styles.subtitle}>
          Résumé des {DAYS} derniers jours — imprimez-le ou enregistrez-le en PDF
          pour votre consultation.
        </Text>
      </FadeInView>

      {/* ── Time in range, given the room it deserves ── */}
      <FadeInView delay={70}>
        <View style={styles.tirCard}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.tirLabel}>Temps dans la cible</Text>
            <Text style={styles.tirHint}>
              {stats.count} mesures sur {DAYS} jours
            </Text>
          </View>
          <Text
            style={[
              styles.tirValue,
              { color: tirGood ? colors.glucoseInRange : colors.glucoseHigh },
            ]}
          >
            {stats.tir !== null ? `${stats.tir}%` : '—'}
          </Text>
        </View>
        {stats.tir !== null ? (
          <View style={styles.tirTrack}>
            <View
              style={[
                styles.tirFill,
                {
                  width: `${Math.min(100, stats.tir)}%`,
                  backgroundColor: tirGood ? colors.glucoseInRange : colors.glucoseHigh,
                },
              ]}
            />
          </View>
        ) : null}
      </FadeInView>

      {/* ── Everything else ── */}
      <FadeInView delay={130}>
        <View style={styles.grid}>
          <Stat label="Hypoglycémies" value={String(stats.lows)} color={colors.glucoseLow} />
          <Stat label="Hyperglycémies" value={String(stats.highs)} color={colors.glucoseHigh} />
          <Stat
            label="Insuline / jour"
            value={stats.avgInsulinPerDay !== null ? `${stats.avgInsulinPerDay} U` : '—'}
            color={colors.ai}
          />
          <Stat
            label="Glucides / jour"
            value={stats.avgCarbsPerDay !== null ? `${stats.avgCarbsPerDay} g` : '—'}
            color={colors.carbs}
          />
          <Stat label="Repas suivis" value={String(stats.mealsCount)} color={colors.protein} />
          <Stat
            label="Activité totale"
            value={`${stats.totalActivityMin} min`}
            color={colors.primary}
          />
        </View>
      </FadeInView>

      {/* ── What the week said ── */}
      <FadeInView delay={190}>
        <Text style={styles.weeklyTitle}>Résumé IA de la semaine</Text>
        <View style={styles.weeklyCard}>
          {weekly.observations.map((o, i) => (
            <Text key={`o${i}`} style={styles.weeklyLine}>
              📋 {o}
            </Text>
          ))}
          {weekly.positives.map((p, i) => (
            <Text key={`p${i}`} style={[styles.weeklyLine, { color: '#1B7A4E' }]}>
              ✅ {p}
            </Text>
          ))}
          {weekly.improvements.map((p, i) => (
            <Text key={`i${i}`} style={[styles.weeklyLine, { color: '#B45D22' }]}>
              💡 {p}
            </Text>
          ))}
        </View>

        <AppButton
          label="📄 Générer le PDF / Imprimer"
          onPress={generate}
          loading={generating}
          style={{ marginTop: 16 }}
        />
        <Text style={styles.footHint}>
          Le rapport inclut vos informations médicales, statistiques et les 60
          dernières mesures.
        </Text>
      </FadeInView>
    </HeroScreen>
  );
}

function Stat({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statLabel} numberOfLines={2}>
        {label}
      </Text>
      <Text style={[styles.statValue, { color }]}>{value}</Text>
    </View>
  );
}

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const styles = StyleSheet.create({
  subtitle: {
    fontFamily: F500,
    fontSize: 12.5,
    lineHeight: 18,
    color: HERO_MUTED,
    marginTop: 14,
    marginHorizontal: 2,
  },

  /* The headline figure a consultation opens on. */
  ea1cCard: {
    borderRadius: 26,
    padding: 20,
    shadowColor: '#22374B',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 7,
  },
  ea1cLabel: { fontFamily: F600, fontSize: 12.5, color: 'rgba(255,255,255,0.82)' },
  ea1cRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 2 },
  ea1cValue: { fontFamily: F800, fontSize: 52, color: '#fff', letterSpacing: -1.5 },
  ea1cUnit: { fontFamily: F700, fontSize: 23, color: 'rgba(255,255,255,0.85)' },
  ea1cHint: {
    marginTop: 10,
    fontFamily: F500,
    fontSize: 11.5,
    lineHeight: 16.5,
    color: 'rgba(255,255,255,0.78)',
  },

  /* Time in range earns a row of its own — it is the number a doctor
     reads first, and a tile in a grid of eight buries it. */
  tirCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    marginTop: 22,
    ...shadows.card,
  },
  tirLabel: { fontFamily: F700, fontSize: 13.5, color: HERO_INK },
  tirHint: { fontFamily: F500, fontSize: 11.5, color: HERO_MUTED, marginTop: 2 },
  tirValue: { fontFamily: F800, fontSize: 30, letterSpacing: -1 },
  tirTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E7EDE9',
    marginTop: 8,
    overflow: 'hidden',
  },
  tirFill: { height: 8, borderRadius: 4 },

  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 9, marginTop: 12 },
  stat: {
    flexBasis: '47%',
    flexGrow: 1,
    minWidth: 0,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 14,
    ...shadows.card,
  },
  statLabel: { fontFamily: F600, fontSize: 11.5, lineHeight: 15, color: HERO_MUTED },
  statValue: { fontFamily: F800, fontSize: 21, marginTop: 6, letterSpacing: -0.5 },

  weeklyTitle: {
    fontFamily: F800,
    fontSize: 15,
    color: HERO_INK,
    marginTop: 24,
    marginBottom: 10,
    marginHorizontal: 2,
  },
  weeklyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    ...shadows.card,
  },
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
    fontSize: 11.5,
    lineHeight: 17,
    color: '#9AA8A0',
    textAlign: 'center',
  },
});
