import React, { useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft, FadeInView, Spinner } from '@/components/ui';
import { getExercise, getSession, preWorkoutCheck, videoUrl } from '@/data/workouts';
import { saveActivity } from '@/services/data';
import { saveDays } from '@/services/program';
import { useAppStore } from '@/store/useAppStore';
import { useProgramStore } from '@/store/useProgramStore';
import { shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN = '#1fbc78';
const INK = '#101828';

export default function ProgramWorkoutScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { id, date } = useLocalSearchParams<{ id?: string; date?: string }>();
  const { glucoseLogs } = useAppStore();
  const markWorkoutDone = useProgramStore((s) => s.markWorkoutDone);

  const [done, setDone] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const session = id ? getSession(String(id)) : null;
  const ar = i18n.language.startsWith('ar');
  const en = i18n.language.startsWith('en');

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/program' as any);
  };

  const todayGlucose = glucoseLogs.find(
    (g) => new Date(g.created_at).toDateString() === new Date().toDateString()
  );
  const pre = preWorkoutCheck(todayGlucose?.value);
  /* A hypo or a very high reading is not a "warning to acknowledge": the
     session is blocked until the patient fixes it. */
  const blocked = pre.verdict === 'stop';

  if (!session) {
    return (
      <View style={[styles.root, styles.center]}>
        <Text style={styles.emptyText}>{t('program.workoutMissing')}</Text>
        <Pressable onPress={close} style={styles.backLink}>
          <Text style={styles.backLinkText}>{t('common.back')}</Text>
        </Pressable>
      </View>
    );
  }

  const title = ar ? session.title_ar : en ? session.title_en : session.title_fr;
  const total = session.blocks.length;
  const doneCount = Object.values(done).filter(Boolean).length;

  const finish = async () => {
    setSaving(true);
    try {
      // The session lands in the same activity log the rest of the app reads,
      // so the bolus engine knows sport happened and lowers the next dose.
      await saveActivity(
        session.focus === 'cardio' ? 'walk' : 'gym',
        session.minutes,
        session.level === 'beginner' ? 'low' : 'medium',
        title
      );

      // …and it also closes the sport half of the program day. Without this
      // the day could never be completed, so the next one never unlocked.
      if (date) {
        markWorkoutDone(String(date));
        const { program, days } = useProgramStore.getState();
        const fresh = days.find((d) => d.date === String(date));
        if (program && fresh) await saveDays(program.id, [fresh]);
      }

      setSaved(true);
      setTimeout(close, 1000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 16,
          paddingBottom: 60,
        }}
      >
        <View style={styles.headRow}>
          <Pressable onPress={close} style={styles.backBtn}>
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle}>{t('program.workoutTitle')}</Text>
          <View style={{ width: 36 }} />
        </View>

        <FadeInView>
          <LinearGradient
            colors={['#2ec983', '#159a57']}
            start={{ x: 0.1, y: 0 }}
            end={{ x: 0.9, y: 1 }}
            style={styles.hero}
          >
            <Text style={styles.heroTitle}>{title}</Text>
            <Text style={styles.heroMeta}>
              ⏱️ {session.minutes} min · 🔥 ~{session.estKcal} kcal · {total}{' '}
              {t('program.exercises')}
            </Text>
            <View style={styles.heroBar}>
              <View style={[styles.heroBarFill, { width: `${(doneCount / total) * 100}%` }]} />
            </View>
          </LinearGradient>

          {/* ── Glucose gate — always before the first rep ── */}
          <View
            style={[
              styles.preCard,
              pre.verdict === 'stop' && styles.preStop,
              pre.verdict === 'fuel' && styles.preFuel,
              pre.verdict === 'go' && styles.preGo,
            ]}
          >
            <Text style={styles.preTitle}>{t('program.preTitle')}</Text>
            <Text style={styles.preText}>{t(`program.${pre.key}`)}</Text>
            {todayGlucose ? (
              <Text style={styles.preValue}>
                {t('program.lastReading', { v: todayGlucose.value })}
              </Text>
            ) : (
              <Pressable
                onPress={() => router.push('/log-glucose' as any)}
                style={styles.preAction}
              >
                <Text style={styles.preActionText}>{t('program.measureNow')} →</Text>
              </Pressable>
            )}
          </View>

          {/* ── The exercises ── */}
          {session.blocks.map((b, i) => {
            const ex = getExercise(b.exerciseId);
            if (!ex) return null;
            const key = `${b.exerciseId}_${i}`;
            const isDone = !!done[key];
            const name = ar ? ex.name_ar : en ? ex.name_en : ex.name_fr;
            const cue = ar ? ex.cue_ar : ex.cue_fr;
            return (
              <View key={key} style={[styles.exCard, isDone && styles.exCardDone]}>
                <View style={styles.exHead}>
                  <Pressable
                    onPress={() => setDone((d) => ({ ...d, [key]: !d[key] }))}
                    style={[styles.check, isDone && styles.checkOn]}
                    disabled={blocked}
                  >
                    {isDone ? <Text style={styles.checkMark}>✓</Text> : null}
                  </Pressable>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.exName, isDone && styles.exNameDone]}>{name}</Text>
                    <Text style={styles.exDose}>
                      {b.sets} × {b.reps ? `${b.reps} ${t('program.reps')}` : `${b.seconds}s`}
                      {b.restSeconds > 0
                        ? ` · ${t('program.rest', { s: b.restSeconds })}`
                        : ''}
                    </Text>
                  </View>
                </View>

                {cue ? <Text style={styles.exCue}>💡 {cue}</Text> : null}

                <Pressable
                  style={styles.videoBtn}
                  onPress={() => Linking.openURL(videoUrl(ex))}
                >
                  <Text style={styles.videoBtnText}>▶️ {t('program.watchVideo')}</Text>
                </Pressable>
              </View>
            );
          })}

          {/* ── After the session ── */}
          <View style={styles.postCard}>
            <Text style={styles.postText}>🍎 {t('program.postWorkout')}</Text>
          </View>

          <Pressable onPress={finish} disabled={saving || saved || blocked}>
            <LinearGradient
              colors={blocked ? ['#c9d2dd', '#b9c3cf'] : ['#2ec983', '#1fbc78']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={[styles.cta, (saving || saved) && { opacity: 0.7 }]}
            >
              {saving ? (
                <Spinner size={22} color="#ffffff" />
              ) : (
                <Text style={styles.ctaText}>
                  {saved
                    ? `✓ ${t('program.sessionSaved')}`
                    : blocked
                      ? t('program.blockedCta')
                      : t('program.finishSession')}
                </Text>
              )}
            </LinearGradient>
          </Pressable>
        </FadeInView>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe' },
  center: { alignItems: 'center', justifyContent: 'center', padding: 30 },
  emptyText: { fontFamily: F600, fontSize: 14, color: '#667085', textAlign: 'center' },
  backLink: { marginTop: 14 },
  backLinkText: { fontFamily: F700, fontSize: 13.5, color: GREEN },

  headRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.card,
  },
  headTitle: { fontFamily: F800, fontSize: 17, color: INK },

  hero: {
    borderRadius: 22,
    padding: 20,
    shadowColor: GREEN,
    shadowOpacity: 0.28,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 5,
  },
  heroTitle: { fontFamily: F800, fontSize: 19, color: '#ffffff', letterSpacing: -0.3 },
  heroMeta: { fontFamily: F600, fontSize: 12, color: 'rgba(255,255,255,0.9)', marginTop: 5 },
  heroBar: {
    height: 7,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.28)',
    marginTop: 12,
    overflow: 'hidden',
  },
  heroBarFill: { height: 7, borderRadius: 4, backgroundColor: '#ffffff' },

  preCard: {
    backgroundColor: '#eef4ff',
    borderRadius: 18,
    padding: 16,
    marginTop: 14,
    borderWidth: 1,
    borderColor: '#d9e4fb',
  },
  preGo: { backgroundColor: '#eafaf1', borderColor: '#c8ecd9' },
  preFuel: { backgroundColor: '#fff8ec', borderColor: '#f2e0bd' },
  preStop: { backgroundColor: '#fdecec', borderColor: '#f4c4c0' },
  preTitle: { fontFamily: F800, fontSize: 13.5, color: INK },
  preText: { fontFamily: F600, fontSize: 12.5, lineHeight: 18, color: '#41505f', marginTop: 5 },
  preValue: { fontFamily: F600, fontSize: 11.5, color: '#8a98a7', marginTop: 8 },
  preAction: { marginTop: 10 },
  preActionText: { fontFamily: F800, fontSize: 12.5, color: GREEN },

  exCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 15,
    marginTop: 10,
    ...shadows.card,
  },
  exCardDone: { opacity: 0.6 },
  exHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  check: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: '#d6dbe4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkOn: { backgroundColor: GREEN, borderColor: GREEN },
  checkMark: { fontFamily: F800, fontSize: 14, color: '#ffffff' },
  exName: { fontFamily: F700, fontSize: 14, color: INK },
  exNameDone: { textDecorationLine: 'line-through' },
  exDose: { fontFamily: F600, fontSize: 11.5, color: '#8a98a7', marginTop: 2 },
  exCue: { fontFamily: F500, fontSize: 11.5, lineHeight: 16, color: '#667085', marginTop: 9 },
  videoBtn: {
    height: 38,
    borderRadius: 11,
    backgroundColor: '#f1f4f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 11,
  },
  videoBtnText: { fontFamily: F700, fontSize: 12.5, color: '#41505f' },

  postCard: {
    backgroundColor: '#eef4ff',
    borderRadius: 14,
    padding: 13,
    marginTop: 16,
  },
  postText: { fontFamily: F600, fontSize: 12, lineHeight: 17, color: '#3f5b8a' },

  cta: {
    height: 54,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  ctaText: { fontFamily: F700, fontSize: 15, color: '#ffffff' },
});
