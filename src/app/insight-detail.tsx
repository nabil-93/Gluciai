import React, { useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft } from '@/components/ui';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';
import type { AIJournalEntry } from '@/types';

/*
 * TODO(i18n + medical-review): THIS ENTIRE SCREEN IS IN FRENCH ONLY.
 *
 * The educational content below (hypo/hyper causes, corrective advice,
 * rule-of-15 instructions…) is MEDICAL EDUCATION about insulin and
 * glycemia. It must NOT be machine-translated: the ar/de/en versions
 * need to be written or reviewed by a clinician / native speaker, then
 * moved into the i18n locale files like every other screen.
 *
 * Until that review happens, Arabic/German/English users will see this
 * screen in French — a known, accepted limitation for the first release.
 *
 * Note: `classify()` below also matches FRENCH keywords in the entry
 * title (e.g. 'basse', 'élevée') because AI journal titles are currently
 * generated in French; when localizing, classification should switch to
 * a structured `kind` field instead of text matching.
 */

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

/* ── Event classification from the recorded entry ── */
type Kind =
  | 'hypo'
  | 'hyper'
  | 'postmeal'
  | 'sugar'
  | 'activity'
  | 'goodday'
  | 'fasting'
  | 'other';

function classify(e: AIJournalEntry): Kind {
  const t = e.title.toLowerCase();
  if (t.includes('basse')) return 'hypo';
  if (t.includes('au-dessus') || t.includes('élevée')) return 'hyper';
  if (t.includes('post-repas') || t.includes('contrôle post')) return 'postmeal';
  if (t.includes('sucre')) return 'sugar';
  if (t.includes('effort') || t.includes('activité')) return 'activity';
  if (t.includes('excellente')) return 'goodday';
  if (t.includes('jeun') || t.includes('aucune mesure')) return 'fasting';
  return 'other';
}

interface Report {
  verdict: 'good' | 'moderate' | 'bad';
  verdictText: string;
  causes: string[];
  advices: string[];
  actions: { label: string; href: string }[];
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
          { label: '🩸 Re-mesurer maintenant', href: '/log-glucose' },
          { label: '📈 Voir ma courbe', href: '/glucose' },
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
          { label: '💉 Calculer une correction', href: '/bolus' },
          { label: '🩸 Re-mesurer', href: '/log-glucose' },
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
          { label: '🩸 Mesurer maintenant', href: '/log-glucose' },
          { label: '🍽️ Revoir mon repas', href: '/nutrition' },
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
          { label: '🥗 Voir ma nutrition', href: '/nutrition' },
          { label: '🇲🇦 Choisir des plats à IG bas', href: '/foods' },
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
          { label: '🩸 Mesurer ma glycémie', href: '/log-glucose' },
          { label: '🏃 Voir mes séances', href: '/(tabs)/activity' },
        ],
      };
    case 'goodday':
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
          { label: '📄 Générer mon rapport', href: '/report' },
          { label: '📈 Voir ma courbe', href: '/glucose' },
        ],
      };
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
        actions: [{ label: '🩸 Ajouter une mesure', href: '/log-glucose' }],
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
        actions: [{ label: '📈 Voir ma glycémie', href: '/glucose' }],
      };
  }
}

const VERDICT_STYLE = {
  good: { label: '✅ Bon pour vous', color: '#16955f', bg: '#e9fbf2' },
  moderate: { label: '⚠️ À surveiller', color: '#d97706', bg: '#fef4e8' },
  bad: { label: '🚨 À corriger', color: '#dc2626', bg: '#feecec' },
} as const;

export default function InsightDetailScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { aiJournal, glucoseLogs } = useAppStore();

  const entry = aiJournal.find((e) => e.id === id);

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
        <Text style={styles.notFound}>Événement introuvable.</Text>
        <Pressable onPress={close} style={styles.backBtn}>
          <ChevronLeft size={16} />
        </Pressable>
      </View>
    );
  }

  const kind = classify(entry);
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
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle}>Rapport du coach</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Event header */}
        <View style={styles.eventCard}>
          <AnimatedRobot size={64} mood={isAlert ? 'alert' : 'happy'} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.eventTitle}>
              {entry.icon} {entry.title}
            </Text>
            <Text style={styles.eventBody}>{entry.body}</Text>
            <Text style={styles.eventTime}>
              {new Date(entry.created_at).toLocaleDateString('fr-FR', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
              })}{' '}
              à{' '}
              {new Date(entry.created_at).toLocaleTimeString('fr-FR', {
                hour: '2-digit',
                minute: '2-digit',
              })}
            </Text>
          </View>
        </View>

        {/* Verdict */}
        <View style={[styles.verdictCard, { backgroundColor: v.bg }]}>
          <Text style={[styles.verdictLabel, { color: v.color }]}>
            {v.label}
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
              {recovered ? '👏 Bien géré !' : '👀 Toujours à suivre'}
            </Text>
            <Text style={styles.followText}>
              {recovered
                ? `Votre mesure suivante (${followUp.value} mg/dL à ${new Date(followUp.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}) montre que vous avez corrigé la situation.`
                : `Votre mesure suivante (${followUp.value} mg/dL) n'était pas encore dans la cible — continuez à surveiller.`}
            </Text>
          </View>
        ) : isAlert && !followUp ? (
          <View style={[styles.followCard, { backgroundColor: '#f3f0ff' }]}>
            <Text style={styles.followTitle}>⏱️ Pas encore de suivi</Text>
            <Text style={styles.followText}>
              Aucune mesure enregistrée après cet événement — re-mesurez pour
              vérifier que tout est rentré dans l'ordre.
            </Text>
          </View>
        ) : null}

        {/* Causes */}
        {report.causes.length > 0 ? (
          <>
            <Text style={styles.section}>Pourquoi c'est arrivé ?</Text>
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
        <Text style={styles.section}>Mes conseils</Text>
        <View style={styles.listCard}>
          {report.advices.map((a, i) => (
            <View key={i} style={styles.listRow}>
              <Text style={styles.adviceNum}>{i + 1}</Text>
              <Text style={styles.listText}>{a}</Text>
            </View>
          ))}
        </View>

        {/* Actions */}
        <Text style={styles.section}>Et maintenant ?</Text>
        <View style={{ gap: 9 }}>
          {report.actions.map((a) => (
            <Pressable
              key={a.href}
              style={styles.actionBtn}
              onPress={() => router.push(a.href as any)}
            >
              <Text style={styles.actionText}>{a.label}</Text>
            </Pressable>
          ))}
        </View>

        <Text style={styles.disclaimer}>
          Analyse éducative générée par votre coach IA — ne remplace jamais
          l'avis de votre médecin.
        </Text>
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
