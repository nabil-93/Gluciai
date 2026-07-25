import React, { useCallback, useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ChevronLeft, FadeInView, Spinner } from '@/components/ui';
import {
  dayProgress,
  deleteProgram,
  listPrograms,
  loadProgram,
  setProgramStatus,
  type ProgramSummary,
} from '@/services/program';
import { useProgramStore } from '@/store/useProgramStore';
import { shadows } from '@/theme';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const GREEN = '#1fbc78';
const INK = '#101828';

const GOAL_EMOJI: Record<string, string> = {
  lose: '🔥',
  gain: '💪',
  stabilize: '📊',
  sport: '🏃',
};

/**
 * Where the patient stays in charge of their parcours.
 *
 * Everything here exists because a program outlives the day it was created:
 * the goal moves, they start training somewhere else, they stop and come
 * back. So a program can be adjusted, closed, resumed or deleted — and none
 * of it silently rewrites the history, which is a medical record.
 */
export default function ProgramManageScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const { program, days, setProgram, setDays, reset } = useProgramStore();

  const [list, setList] = useState<ProgramSummary[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProgramSummary | null>(null);

  const refresh = useCallback(async () => {
    setList(await listPrograms());
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const rows = await listPrograms();
      if (alive) setList(rows);
    })();
    return () => {
      alive = false;
    };
  }, []);

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/program' as any);
  };

  const fmtDate = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString(i18n.language, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

  /** Close the live parcours: it stays readable, it just stops driving. */
  const finish = async (status: 'done' | 'abandoned') => {
    if (!program) return;
    setBusy(program.id);
    try {
      await setProgramStatus(program.id, status);
      reset();
      await refresh();
    } finally {
      setBusy(null);
    }
  };

  /** Bring an old parcours back as the live one, with its days. */
  const resume = async (p: ProgramSummary) => {
    setBusy(p.id);
    try {
      await setProgramStatus(p.id, 'active');
      const loaded = await loadProgram(p.id);
      if (loaded) {
        setProgram(loaded.program);
        setDays(loaded.days);
      }
      await refresh();
      router.replace('/program' as any);
    } finally {
      setBusy(null);
    }
  };

  const remove = async (p: ProgramSummary) => {
    setBusy(p.id);
    try {
      await deleteProgram(p.id);
      // Deleting the one currently loaded has to clear it here too, or the
      // screen would keep coaching from a program that no longer exists.
      if (program?.id === p.id) reset();
      await refresh();
    } finally {
      setBusy(null);
      setConfirmDelete(null);
    }
  };

  const liveDaysDone = days.filter((d) => dayProgress(d).complete).length;
  const others = (list ?? []).filter((p) => p.id !== program?.id);

  return (
    <View style={styles.root}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          paddingTop: insets.top + 14,
          paddingHorizontal: 16,
          paddingBottom: 50,
        }}
      >
        <View style={styles.headRow}>
          <Pressable onPress={close} style={styles.backBtn}>
            <ChevronLeft size={16} />
          </Pressable>
          <Text style={styles.headTitle}>{t('program.manageTitle')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* ── The parcours in progress ── */}
        <FadeInView>
          <Text style={styles.sectionHead}>{t('program.inProgress')}</Text>
          {program ? (
            <View style={styles.liveCard}>
              <LinearGradient
                colors={['#2ec983', '#159a57']}
                start={{ x: 0.1, y: 0 }}
                end={{ x: 0.9, y: 1 }}
                style={styles.liveHero}
              >
                <Text style={styles.liveEmoji}>{GOAL_EMOJI[program.goal]}</Text>
                <View style={{ flex: 1 }}>
                  <Text style={styles.liveGoal}>{t(`program.goal_${program.goal}`)}</Text>
                  <Text style={styles.liveMeta}>
                    {t('program.daysDone', { done: liveDaysDone, total: program.weeks * 7 })} ·{' '}
                    {program.targets.dailyKcal} kcal
                  </Text>
                  {program.startWeight && program.targetWeight ? (
                    <Text style={styles.liveMeta}>
                      {program.startWeight} kg → {program.targetWeight} kg
                    </Text>
                  ) : null}
                </View>
              </LinearGradient>

              <Text style={styles.editHint}>{t('program.editHint')}</Text>

              <Pressable
                onPress={() => router.push({ pathname: '/program-setup', params: { edit: '1' } } as any)}
                style={styles.primaryBtn}
              >
                <Text style={styles.primaryBtnText}>✏️ {t('program.editProgram')}</Text>
              </Pressable>

              <View style={styles.btnRow}>
                <Pressable
                  onPress={() => finish('done')}
                  disabled={!!busy}
                  style={styles.ghostBtn}
                >
                  {busy === program.id ? (
                    <Spinner size={16} color="#41505f" />
                  ) : (
                    <Text style={styles.ghostBtnText}>🏁 {t('program.finishProgram')}</Text>
                  )}
                </Pressable>
                <Pressable
                  onPress={() => finish('abandoned')}
                  disabled={!!busy}
                  style={styles.ghostBtn}
                >
                  <Text style={styles.ghostBtnText}>⏸️ {t('program.stopProgram')}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t('program.noActive')}</Text>
            </View>
          )}
        </FadeInView>

        {/* ── Start something new ── */}
        <FadeInView delay={60}>
          <Pressable onPress={() => router.push('/program-setup' as any)}>
            <LinearGradient
              colors={['#2ec983', '#1fbc78']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 1 }}
              style={styles.newCta}
            >
              <Text style={styles.newCtaText}>✨ {t('program.newProgram')}</Text>
            </LinearGradient>
          </Pressable>
          {program ? (
            <Text style={styles.newNote}>{t('program.newProgramNote')}</Text>
          ) : null}
        </FadeInView>

        {/* ── Everything that came before ── */}
        <FadeInView delay={120}>
          <Text style={styles.sectionHead}>{t('program.pastPrograms')}</Text>
          {list === null ? (
            <View style={styles.emptyCard}>
              <Spinner size={20} color={GREEN} />
            </View>
          ) : others.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>{t('program.noPastPrograms')}</Text>
            </View>
          ) : (
            others.map((p) => (
              <View key={p.id} style={styles.pastCard}>
                <View style={styles.pastHead}>
                  <Text style={styles.pastEmoji}>{GOAL_EMOJI[p.goal]}</Text>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pastTitle}>{t(`program.goal_${p.goal}`)}</Text>
                    <Text style={styles.pastMeta}>
                      {fmtDate(p.startDate)} · {t('program.daysWritten', { n: p.daysWritten })} ·{' '}
                      {t(`program.status_${p.status}`)}
                    </Text>
                  </View>
                </View>
                <View style={styles.btnRow}>
                  <Pressable
                    onPress={() => resume(p)}
                    disabled={!!busy}
                    style={styles.ghostBtn}
                  >
                    {busy === p.id ? (
                      <Spinner size={16} color="#41505f" />
                    ) : (
                      <Text style={styles.ghostBtnText}>▶️ {t('program.resumeProgram')}</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={() => setConfirmDelete(p)}
                    disabled={!!busy}
                    style={[styles.ghostBtn, styles.dangerBtn]}
                  >
                    <Text style={[styles.ghostBtnText, styles.dangerText]}>
                      🗑️ {t('program.deleteAction')}
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))
          )}
        </FadeInView>

        <View style={styles.disclaimerBox}>
          <Text style={styles.disclaimerText}>🛡️ {t('program.manageNote')}</Text>
        </View>
      </ScrollView>

      {/* Deleting a parcours erases its days too — always ask first, and say
          exactly how much history is about to go. */}
      <Modal
        visible={!!confirmDelete}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDelete(null)}
      >
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setConfirmDelete(null)} />
          <View style={styles.confirmCard}>
            <Text style={styles.confirmTitle}>{t('program.deleteTitle')}</Text>
            <Text style={styles.confirmText}>
              {t('program.deleteMessage', { n: confirmDelete?.daysWritten ?? 0 })}
            </Text>
            <Pressable
              onPress={() => confirmDelete && remove(confirmDelete)}
              disabled={!!busy}
              style={styles.confirmDanger}
            >
              {busy === confirmDelete?.id ? (
                <Spinner size={18} color="#ffffff" />
              ) : (
                <Text style={styles.confirmDangerText}>{t('program.deleteAction')}</Text>
              )}
            </Pressable>
            <Pressable onPress={() => setConfirmDelete(null)} style={styles.confirmCancel}>
              <Text style={styles.confirmCancelText}>{t('common.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#f9fafe' },
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

  sectionHead: { fontFamily: F800, fontSize: 15, color: INK, marginTop: 20, marginBottom: 10 },

  liveCard: {
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 14,
    ...shadows.card,
  },
  liveHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderRadius: 16,
    padding: 15,
  },
  liveEmoji: { fontSize: 28 },
  liveGoal: { fontFamily: F800, fontSize: 15.5, color: '#ffffff' },
  liveMeta: { fontFamily: F600, fontSize: 11.5, color: 'rgba(255,255,255,0.92)', marginTop: 2 },
  editHint: {
    fontFamily: F500,
    fontSize: 11.5,
    lineHeight: 16.5,
    color: '#667085',
    marginTop: 12,
  },

  primaryBtn: {
    minHeight: 46,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: GREEN,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 10,
  },
  primaryBtnText: { fontFamily: F700, fontSize: 13.5, color: '#ffffff', textAlign: 'center' },

  btnRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  ghostBtn: {
    flex: 1,
    minHeight: 42,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#e4e8ef',
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtnText: { fontFamily: F700, fontSize: 12, color: '#41505f', textAlign: 'center' },
  dangerBtn: { borderColor: '#f4c4c0', backgroundColor: '#fffafa' },
  dangerText: { color: '#b3261e' },

  emptyCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 18,
    alignItems: 'center',
    ...shadows.card,
  },
  emptyText: {
    fontFamily: F600,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#667085',
    textAlign: 'center',
  },

  newCta: {
    minHeight: 52,
    paddingVertical: 12,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
    shadowColor: GREEN,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
  },
  newCtaText: { fontFamily: F700, fontSize: 14.5, color: '#ffffff', textAlign: 'center' },
  newNote: {
    fontFamily: F500,
    fontSize: 11,
    lineHeight: 16,
    color: '#8a98a7',
    marginTop: 8,
    textAlign: 'center',
  },

  pastCard: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    padding: 14,
    marginBottom: 9,
    ...shadows.card,
  },
  pastHead: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  pastEmoji: { fontSize: 22 },
  pastTitle: { fontFamily: F800, fontSize: 13.5, color: INK },
  pastMeta: { fontFamily: F600, fontSize: 11, color: '#8a98a7', marginTop: 2 },

  disclaimerBox: {
    backgroundColor: '#eef1f6',
    borderRadius: 14,
    padding: 13,
    marginTop: 22,
  },
  disclaimerText: { fontFamily: F500, fontSize: 11.5, lineHeight: 17, color: '#5d6b7c' },

  overlay: {
    flex: 1,
    backgroundColor: 'rgba(16,24,20,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  confirmCard: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    padding: 20,
    ...shadows.card,
  },
  confirmTitle: { fontFamily: F800, fontSize: 16, color: INK },
  confirmText: {
    fontFamily: F600,
    fontSize: 12.5,
    lineHeight: 18,
    color: '#667085',
    marginTop: 8,
  },
  confirmDanger: {
    minHeight: 48,
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#e04f5f',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 18,
  },
  confirmDangerText: { fontFamily: F700, fontSize: 14, color: '#ffffff' },
  confirmCancel: { minHeight: 42, alignItems: 'center', justifyContent: 'center', marginTop: 6 },
  confirmCancelText: { fontFamily: F600, fontSize: 13, color: '#8a98a7' },
});
