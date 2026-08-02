import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft } from '@/components/ui';
import { isRTL, SUPPORTED_LANGUAGES } from '@/i18n';
import { kindOfEntry, localizeEntry } from '@/services/insightIdentity';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';
import type { AIJournalEntry, InsightKind } from '@/types';

/*
 * WHAT IS LOCALIZED HERE, AND WHAT IS DELIBERATELY NOT.
 *
 * ALL CHROME IS TRANSLATED — the title, the section headings, the verdict
 * badges, the follow-up card, the action buttons, the dates and the
 * disclaimer, in fr/en/de/ar. Before this, the whole screen was French, so a
 * German patient opened a German notification onto a French report.
 *
 * THE MEDICAL EDUCATION BELOW IS STILL FRENCH ONLY, on purpose. The causes and
 * advice are patient education about insulin and glycemia — the rule of 15,
 * hypo correction, when to re-measure. Machine-translating clinical
 * instructions into three languages is not a formatting change, so ar/de/en
 * versions must be written or reviewed by a clinician / native speaker before
 * they ship. Until then a non-French reader sees a translated screen with a
 * line saying the detailed advice is in French and under review, rather than
 * an unreviewed translation presented as medical guidance.
 *
 * CLASSIFICATION NO LONGER READS WORDS. It used to match FRENCH keywords in
 * the entry title, so a German or Arabic entry matched nothing, fell to the
 * generic branch, and its reader got filler advice where a French reader got
 * the hypoglycemia report. The event now travels as a stable "kind"
 * (services/insightIdentity), with a title-based recovery for rows written
 * before that field existed.
 */

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/* ── Event classification ─────────────────────────────────────────────────
   Straight from the entry's stable identity. "kindOfEntry" falls back to
   matching the stored title against that title in every language we ship, so
   rows written before that field existed — in any language — still open the
   right report. */
type Kind = InsightKind | 'other';

interface Report {
  verdict: 'good' | 'moderate' | 'bad';
  verdictText: string;
  causes: string[];
  advices: string[];
  /** Destination only; the label is translated from ACTION_KEY. */
  actions: { href: string }[];
}

function buildReport(kind: Kind, tone: AIJournalEntry['tone']): Report {
  switch (kind) {
    case 'hypo':
      return {
        verdict: 'bad',
        verdictText:
          "Une hypoglycémie est un événement à traiter immédiatement — ce n'est pas bon, mais bien gérée, elle reste sans gravité.",
        causes: [
          "Dose d'insuline trop élevée par rapport au repas",
          'Repas sauté ou trop pauvre en glucides',
          "Activité physique récente (l'effort baisse la glycémie plusieurs heures)",
          "Délai trop long entre l'injection et le repas",
        ],
        advices: [
          'Règle des 15 : prenez 15 g de sucre rapide (3 morceaux, ½ verre de jus)',
          'Re-mesurez après 15 minutes — répétez si toujours < 70 mg/dL',
          'Une fois remonté, prenez une collation avec glucides lents (pain, biscotte)',
          'Notez ce qui a précédé (dose, repas, sport) pour en parler à votre médecin',
          'Si les hypos se répètent, votre ratio/facteur doit être revu par le médecin',
        ],
        actions: [
          { href: '/log-glucose' },
          { href: '/glucose' },
        ],
      };
    case 'hyper':
      return {
        verdict: 'bad',
        verdictText:
          "Une glycémie au-dessus de la cible n'est pas alarmante ponctuellement, mais répétée elle use les vaisseaux — à corriger calmement.",
        causes: [
          'Repas plus riche en glucides que prévu (ou IG élevé)',
          'Dose de bolus insuffisante ou oubliée',
          'Stress, maladie ou infection (montent la glycémie)',
          'Manque de sommeil ou sédentarité',
        ],
        advices: [
          "Buvez de l'eau — l'hydratation aide à faire baisser la glycémie",
          'Utilisez le calculateur de bolus pour estimer la correction',
          '10–15 min de marche douce peuvent baisser le pic',
          'Re-mesurez dans 2 h pour vérifier la tendance',
          'Ne « sur-corrigez » pas : attendez l\'effet de la première dose (3-4 h)',
        ],
        actions: [
          { href: '/bolus' },
          { href: '/log-glucose' },
        ],
      };
    case 'postmeal':
      return {
        verdict: 'moderate',
        verdictText:
          "C'est le bon moment pour vérifier l'effet de votre repas — la mesure 2 h après est la plus informative.",
        causes: [
          'Votre dernier repas avait un index glycémique élevé',
          "Le pic post-repas survient généralement entre 1 h et 2 h",
        ],
        advices: [
          'Mesurez maintenant : < 180 mg/dL à 2 h = objectif atteint',
          'Si le pic est élevé, notez ce repas — réduisez sa portion la prochaine fois',
          'Associer fibres/protéines au repas adoucit le pic suivant',
        ],
        actions: [
          { href: '/log-glucose' },
          { href: '/nutrition' },
        ],
      };
    case 'sugar':
      return {
        verdict: 'moderate',
        verdictText:
          "Beaucoup de sucre aujourd'hui — pas dramatique une fois, mais à surveiller pour éviter les pics répétés.",
        causes: [
          'Boissons sucrées, thé sucré ou jus (sucres « invisibles »)',
          'Desserts ou fruits très sucrés cumulés dans la journée',
        ],
        advices: [
          'Privilégiez le thé peu ou pas sucré — la plus grosse économie de sucre',
          'Remplacez le dessert par des fruits à IG bas',
          'Surveillez la glycémie ce soir et demain à jeun',
        ],
        actions: [
          { href: '/nutrition' },
          { href: '/foods' },
        ],
      };
    case 'activity':
      return {
        verdict: 'good',
        verdictText:
          "Excellente habitude ! L'activité physique améliore la sensibilité à l'insuline pendant 24 à 48 h.",
        causes: [],
        advices: [
          "Surveillez les signes d'hypo dans les heures qui suivent l'effort",
          'Gardez du sucre rapide à portée de main',
          "Si vous prenez de l'insuline, une collation post-effort peut être utile",
          'Visez 150 min/semaine — vous êtes sur la bonne voie',
        ],
        actions: [
          { href: '/log-glucose' },
          { href: '/(tabs)/activity' },
        ],
      };
    case 'greatday':
      return {
        verdict: 'good',
        verdictText:
          'Bravo ! Passer plus de 70 % du temps dans la cible est exactement l\'objectif clinique recommandé.',
        causes: [],
        advices: [
          'Continuez le même rythme de repas et de mesures',
          'Notez ce qui a bien fonctionné aujourd\'hui pour le reproduire',
          'Partagez cette tendance avec votre médecin au prochain rendez-vous',
        ],
        actions: [
          { href: '/report' },
          { href: '/glucose' },
        ],
      };
    case 'nomeasure':
    case 'fasting':
      return {
        verdict: 'moderate',
        verdictText:
          'Sans mesure, impossible de piloter — la glycémie à jeun est la référence de votre journée.',
        causes: [],
        advices: [
          'Mesurez à jeun chaque matin, avant le petit-déjeuner',
          'Une mesure par jour minimum donne une vraie tendance sur la semaine',
        ],
        actions: [{ href: '/log-glucose' }],
      };
    default:
      return {
        verdict: tone === 'success' ? 'good' : 'moderate',
        verdictText:
          tone === 'success'
            ? 'Tout va bien — continuez votre suivi régulier.'
            : 'Un point à surveiller — suivez le conseil ci-dessous.',
        causes: [],
        advices: ['Continuez à enregistrer vos mesures, repas et activités.'],
        actions: [{ href: '/glucose' }],
      };
  }
}

/** Colour only — the WORD is translated at render time. */
const VERDICT_STYLE = {
  good: { key: 'verdictGood', color: '#16955f', bg: '#e9fbf2' },
  moderate: { key: 'verdictModerate', color: '#d97706', bg: '#fef4e8' },
  bad: { key: 'verdictBad', color: '#dc2626', bg: '#feecec' },
} as const;

/** Action-button labels: one i18n key per destination. */
const ACTION_KEY: Record<string, string> = {
  '/log-glucose': 'actMeasureNow',
  '/glucose': 'actGlycemia',
  '/bolus': 'actCorrection',
  '/nutrition': 'actNutrition',
  '/foods': 'actLowGi',
  '/(tabs)/activity': 'actSessions',
  '/report': 'actReport',
};

export default function InsightDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const rtl = isRTL(locale);
  const { id } = useLocalSearchParams<{ id: string }>();
  const { aiJournal, glucoseLogs } = useAppStore();

  const entry = aiJournal.find((e) => e.id === id);

  /* The report's own copy is translated; the educational text below is not
     (see the header). Non-French readers get a line saying so, rather than an
     unreviewed translation of clinical instructions. */
  const medicalInFrenchOnly = !locale.startsWith('fr');
  const langs = useMemo(() => SUPPORTED_LANGUAGES.map((l) => l.code), []);
  const tIn = React.useCallback(
    (lang: string, key: string) => i18n.getFixedT(lang)(key),
    [i18n]
  );
  const dt = (iso: string, opts: Intl.DateTimeFormatOptions) =>
    new Date(iso).toLocaleDateString(locale, opts);
  const tm = (iso: string) =>
    new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  // What happened AFTER this event? (did the user recover?)
  const followUp = useMemo(() => {
    if (!entry) return null;
    const t = new Date(entry.created_at).getTime();
    const after = glucoseLogs
      .filter((g) => {
        const gt = new Date(g.created_at).getTime();
        return gt > t && gt - t < 4 * 3600 * 1000;
      })
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )[0];
    return after ?? null;
  }, [entry, glucoseLogs]);

  if (!entry) {
    return (
      <View style={[styles.root, { paddingTop: insets.top + 40, alignItems: 'center' }]}>
        <Text style={styles.notFound}>{t('insightDetail.notFound')}</Text>
        <Pressable onPress={close} style={styles.backBtn}>
          <ChevronLeft size={16} />
        </Pressable>
      </View>
    );
  }

  const kind: Kind = kindOfEntry(entry, langs, tIn) ?? 'other';
  const shown = localizeEntry(entry, t, langs, tIn);
  const report = buildReport(kind, entry.tone);
  const v = VERDICT_STYLE[report.verdict];
  const isAlert = entry.tone === 'danger' || entry.tone === 'warning';

  const recovered =
    followUp && kind === 'hypo'
      ? followUp.value >= 70
      : followUp && kind === 'hyper'
        ? followUp.value <= 180
        : null;

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 20,
          paddingBottom: 40,
        }}
      >
        <View style={styles.headRow}>
          <Pressable onPress={close} style={styles.backBtn}>
            <View style={rtl ? { transform: [{ scaleX: -1 }] } : undefined}>
              <ChevronLeft size={16} />
            </View>
          </Pressable>
          <Text style={styles.headTitle}>{t('insightDetail.title')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Event header */}
        <View style={styles.eventCard}>
          <AnimatedRobot size={64} mood={isAlert ? 'alert' : 'happy'} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.eventTitle}>
              {entry.icon} {shown.title}
            </Text>
            <Text style={styles.eventBody}>{shown.body}</Text>
            <Text style={styles.eventTime}>
              {dt(entry.created_at, {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}
              {' · '}
              {tm(entry.created_at)}
            </Text>
          </View>
        </View>

        {/* Verdict */}
        <View style={[styles.verdictCard, { backgroundColor: v.bg }]}>
          <Text style={[styles.verdictLabel, { color: v.color }]}>
            {t('insightDetail.' + v.key)}
          </Text>
          <Text style={styles.verdictText}>{report.verdictText}</Text>
        </View>

        {/* Follow-up: did it get better? */}
        {followUp && recovered !== null ? (
          <View
            style={[
              styles.followCard,
              { backgroundColor: recovered ? '#e9fbf2' : '#fef4e8' },
            ]}
          >
            <Text style={styles.followTitle}>
              {t(recovered ? 'insightDetail.followOkTitle' : 'insightDetail.followWatchTitle')}
            </Text>
            <Text style={styles.followText}>
              {recovered
                ? t('insightDetail.followOk', {
                    value: followUp.value,
                    time: tm(followUp.created_at),
                  })
                : t('insightDetail.followWatch', { value: followUp.value })}
            </Text>
          </View>
        ) : isAlert && !followUp ? (
          <View style={[styles.followCard, { backgroundColor: '#f3f0ff' }]}>
            <Text style={styles.followTitle}>
              {t('insightDetail.followNoneTitle')}
            </Text>
            <Text style={styles.followText}>{t('insightDetail.followNone')}</Text>
          </View>
        ) : null}

        {/* Causes */}
        {report.causes.length > 0 ? (
          <>
            <Text style={styles.section}>{t('insightDetail.causes')}</Text>
            <View style={styles.listCard}>
              {report.causes.map((c, i) => (
                <View key={i} style={styles.listRow}>
                  <Text style={styles.listBullet}>•</Text>
                  <Text style={styles.listText}>{c}</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {/* Advices */}
        <Text style={styles.section}>{t('insightDetail.advices')}</Text>
        {/* Said once, above the advice it qualifies: this text is French and
            its medical translation has not been reviewed yet. */}
        {medicalInFrenchOnly ? (
          <Text style={styles.pendingNote}>
            {t('insightDetail.pendingTranslation')}
          </Text>
        ) : null}
        <View style={styles.listCard}>
          {report.advices.map((a, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.adviceNum}>{i + 1}</Text>
              <Text style={styles.listText}>{a}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <Text style={styles.section}>{t('insightDetail.actions')}</Text>
        <View style={{ gap: 9 }}>
          {report.actions.map((a) => (
            <Pressable
              key={a.href}
              style={styles.actionBtn}
              onPress={() => router.push(a.href as any)}
            >
              <Text style={styles.actionText}>
                {t('insightDetail.' + (ACTION_KEY[a.href] ?? 'actGlycemia'))}
              </Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.disclaimer}>{t('insightDetail.disclaimer')}</Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe' },
  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
  headTitle: { fontFamily: F800, fontSize: 17, color: '#111827' },
  notFound: { fontFamily: F600, fontSize: 14, color: '#6b7280', marginBottom: 14 },

  eventCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 14,
    ...shadows.card,
  },
  eventTitle: { fontFamily: F800, fontSize: 15.5, color: '#111827' },
  eventBody: {
    fontFamily: F500,
    fontSize: 12,
    lineHeight: 17,
    color: '#4b5563',
    marginTop: 4,
  },
  eventTime: {
    fontFamily: F600,
    fontSize: 11,
    color: '#9CA3AF',
    marginTop: 6,
    textTransform: 'capitalize',
  },

  verdictCard: { borderRadius: 18, padding: 15, marginTop: 12 },
  verdictLabel: { fontFamily: F800, fontSize: 15 },
  verdictText: {
    fontFamily: F500,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#374151',
    marginTop: 5,
  },

  followCard: { borderRadius: 18, padding: 15, marginTop: 10 },
  followTitle: { fontFamily: F800, fontSize: 14, color: '#111827' },
  followText: {
    fontFamily: F500,
    fontSize: 12,
    lineHeight: 17,
    color: '#374151',
    marginTop: 4,
  },

  section: {
    fontFamily: F800,
    fontSize: 15,
    color: '#111827',
    marginTop: 20,
    marginBottom: 9,
    marginLeft: 2,
  },
  pendingNote: {
    fontFamily: F500,
    fontSize: 11,
    lineHeight: 15.5,
    color: '#8a6416',
    backgroundColor: '#fef4e8',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 11,
    marginBottom: 9,
  },
  listCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    gap: 10,
    ...shadows.card,
  },
  listRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  listBullet: { fontFamily: F800, fontSize: 13, color: '#8a3ffc' },
  adviceNum: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#8a3ffc',
    color: '#ffffff',
    textAlign: 'center',
    lineHeight: 20,
    fontSize: 11,
    fontFamily: F800,
    overflow: 'hidden',
  },
  listText: {
    flex: 1,
    fontFamily: F500,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#374151',
  },

  actionBtn: {
    backgroundColor: '#111827',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
  },
  actionText: { fontFamily: F700, fontSize: 13.5, color: '#ffffff' },

  disclaimer: {
    fontFamily: F500,
    fontSize: 10.5,
    lineHeight: 15,
    color: '#9CA3AF',
    textAlign: 'center',
    marginTop: 18,
    paddingHorizontal: 10,
  },
});
