import React, { useEffect, useMemo } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AnimatedRobot, ChevronLeft, LockChip, PremiumEmptyState } from '@/components/ui';
import { isRTL } from '@/i18n';
import { refreshFeatureLocks } from '@/services/features';
import { getPlannedReminders } from '@/services/notifications';
import { useAppStore } from '@/store/useAppStore';
import { colors, shadows } from '@/theme';
import type { AIJournalEntry } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F600 = 'PlusJakartaSans_600SemiBold';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const TONE_STYLE = {
  danger: { rail: '#ef4444', bg: '#feecec', labelKey: 'notifications.toneAlert', labelColor: '#dc2626' },
  warning: { rail: '#f59e0b', bg: '#fef4e8', labelKey: 'notifications.toneWarning', labelColor: '#d97706' },
  success: { rail: '#19c37d', bg: '#e9fbf2', labelKey: 'notifications.toneSuccess', labelColor: '#16955f' },
  info: { rail: '#8a3ffc', bg: '#f3f0ff', labelKey: 'notifications.toneInfo', labelColor: '#6d5ef9' },
} as const;

export default function AiJournalScreen() {
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const insets = useSafeAreaInsets();
  const locale = i18n.language;
  const rtl = isRTL(locale);
  const aiJournal = useAppStore((s) => s.aiJournal);
  const markAiJournalSeen = useAppStore((s) => s.markAiJournalSeen);
  const lockedFeatures = useAppStore((s) => s.lockedFeatures);
  const chatLocked = lockedFeatures.includes('ai_chat');
  const callLocked = lockedFeatures.includes('ai_call');

  // Opening the screen clears the unread badge + re-checks dashboard locks.
  useEffect(() => {
    markAiJournalSeen();
    refreshFeatureLocks();
  }, [markAiJournalSeen]);

  const dayLabel = React.useCallback(
    (iso: string) => {
      const d = new Date(iso);
      const today = new Date();
      const yesterday = new Date();
      yesterday.setDate(today.getDate() - 1);
      if (d.toDateString() === today.toDateString()) return t('notifications.today');
      if (d.toDateString() === yesterday.toDateString()) return t('notifications.yesterday');
      return d.toLocaleDateString(locale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      });
    },
    [t, locale]
  );

  const close = () => {
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)');
  };

  // Group entries by day, newest first
  const groups = useMemo(() => {
    const map = new Map<string, AIJournalEntry[]>();
    for (const e of aiJournal) {
      const key = dayLabel(e.created_at);
      map.set(key, [...(map.get(key) ?? []), e]);
    }
    return [...map.entries()];
  }, [aiJournal, dayLabel]);

  const goodCount = aiJournal.filter((e) => e.tone === 'success').length;
  const badCount = aiJournal.filter(
    (e) => e.tone === 'danger' || e.tone === 'warning'
  ).length;

  // Smart reminders already due today (time has passed) — shown up top so
  // the robot's badge count matches what the user actually sees here.
  const dueReminders = useMemo(() => {
    const now = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();
    return getPlannedReminders(t).filter(
      (r) => r.hour * 60 + r.minute <= nowMin
    );
    // aiJournal in deps just to recompute when data (and thus reminders) shift.
  }, [aiJournal, t]);
  const fmtTime = (h: number, m: number) =>
    `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

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
          <Text style={styles.headTitle}>{t('notifications.title')}</Text>
          <View style={{ width: 36 }} />
        </View>

        {/* Coach header */}
        <View style={styles.coachCard}>
          <AnimatedRobot size={70} mood={badCount > 0 ? 'alert' : 'happy'} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.coachTitle}>{t('notifications.coachTitle')}</Text>
            <Text style={styles.coachSub}>{t('notifications.coachSub')}</Text>
            <View style={styles.coachStats}>
              <View style={[styles.statPill, { backgroundColor: '#e9fbf2' }]}>
                <Text style={[styles.statText, { color: '#16955f' }]}>
                  ✓ {t('notifications.positives', { count: goodCount })}
                </Text>
              </View>
              <View style={[styles.statPill, { backgroundColor: '#feecec' }]}>
                <Text style={[styles.statText, { color: '#dc2626' }]}>
                  ⚠ {t('notifications.alerts', { count: badCount })}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* ── Talk to the AI: chat + voice call ── */}
        <View style={styles.aiActionsRow}>
          <Pressable
            style={[styles.aiActionCard, chatLocked && styles.aiActionLocked]}
            onPress={() => router.push('/ai-chat' as any)}
          >
            {chatLocked ? <LockChip /> : null}
            <View style={[styles.aiActionIcon, { backgroundColor: '#f3f0ff' }]}>
              <Text style={{ fontSize: 17 }}>💬</Text>
            </View>
            <Text style={styles.aiActionTitle}>{t('notifications.chatCard')}</Text>
            <Text style={styles.aiActionSub} numberOfLines={1}>
              {t('notifications.chatCardSub')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.aiActionCard, callLocked && styles.aiActionLocked]}
            onPress={() => router.push('/ai-call' as any)}
          >
            {callLocked ? <LockChip /> : null}
            <View style={[styles.aiActionIcon, { backgroundColor: '#e8f1fe' }]}>
              <Text style={{ fontSize: 17 }}>📞</Text>
            </View>
            <Text style={styles.aiActionTitle}>{t('notifications.callCard')}</Text>
            <Text style={styles.aiActionSub} numberOfLines={1}>
              {t('notifications.callCardSub')}
            </Text>
          </Pressable>
        </View>

        {/* Reminders due today — actionable, shown above the coach log */}
        {dueReminders.length > 0 ? (
          <View style={{ marginTop: 18 }}>
            <Text style={styles.sectionLabel}>{t('notifications.remindersToday')}</Text>
            <View style={{ gap: 10, marginTop: 8 }}>
              {dueReminders.map((r) => (
                <Pressable
                  key={r.id}
                  style={styles.reminderRow}
                  onPress={() => router.push('/rappels' as any)}
                >
                  <View style={styles.reminderIcon}>
                    <Text style={{ fontSize: 19 }}>{r.icon}</Text>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.reminderTitle} numberOfLines={1}>
                      {r.title}
                    </Text>
                    <Text style={styles.reminderBody} numberOfLines={2}>
                      {r.body}
                    </Text>
                  </View>
                  <Text style={styles.reminderTime}>
                    {fmtTime(r.hour, r.minute)}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        ) : null}

        {groups.length === 0 ? (
          <PremiumEmptyState
            emoji="📔"
            title={t('notifications.emptyTitle')}
            message={t('notifications.emptyMessage')}
            style={{ marginTop: 14 }}
          />
        ) : (
          groups.map(([day, entries]) => (
            <View key={day} style={{ marginTop: 18 }}>
              <Text style={styles.dayLabel}>{day}</Text>
              <View style={styles.dayCol}>
                {entries.map((e, i) => {
                  const tone = TONE_STYLE[e.tone] ?? TONE_STYLE.info;
                  return (
                    <View key={e.id} style={styles.entryRow}>
                      {/* rail */}
                      <View style={styles.railCol}>
                        <View
                          style={[styles.railDot, { backgroundColor: tone.rail }]}
                        />
                        {i < entries.length - 1 ? (
                          <View style={styles.railLine} />
                        ) : null}
                      </View>
                      {/* card */}
                      <Pressable
                        style={styles.entryCard}
                        onPress={() =>
                          router.push(`/insight-detail?id=${e.id}` as any)
                        }
                      >
                        <View style={styles.entryHead}>
                          <Text style={{ fontSize: 15 }}>{e.icon}</Text>
                          <Text style={styles.entryTitle} numberOfLines={1}>
                            {e.title}
                          </Text>
                          <View
                            style={[styles.toneBadge, { backgroundColor: tone.bg }]}
                          >
                            <Text
                              style={[styles.toneText, { color: tone.labelColor }]}
                            >
                              {t(tone.labelKey)}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.entryBody} numberOfLines={3}>
                          {e.body}
                        </Text>
                        <Text style={styles.entryTime}>
                          {new Date(e.created_at).toLocaleTimeString(locale, {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </Text>
                      </Pressable>
                    </View>
                  );
                })}
              </View>
            </View>
          ))
        )}
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

  coachCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ffffff',
    borderRadius: 20,
    padding: 14,
    ...shadows.card,
  },
  coachTitle: { fontFamily: F800, fontSize: 15, color: '#111827' },
  coachSub: {
    fontFamily: F500,
    fontSize: 11.5,
    lineHeight: 16,
    color: '#6b7280',
    marginTop: 3,
  },

  sectionLabel: {
    fontFamily: F800,
    fontSize: 13,
    color: '#6b7280',
    marginLeft: 2,
  },
  reminderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    ...shadows.card,
  },
  reminderIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#f3f0ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  reminderTitle: { fontFamily: F700, fontSize: 14, color: '#111827' },
  reminderBody: {
    fontFamily: F500,
    fontSize: 11.5,
    lineHeight: 15.5,
    color: '#6b7280',
    marginTop: 2,
  },
  reminderTime: { fontFamily: F800, fontSize: 14, color: '#7c6cf6' },
  coachStats: { flexDirection: 'row', gap: 7, marginTop: 8 },
  statPill: {
    borderRadius: 999,
    paddingVertical: 4,
    paddingHorizontal: 10,
  },
  statText: { fontFamily: F700, fontSize: 10.5 },

  /* Chat / voice-call action cards */
  aiActionsRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  aiActionCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 18,
    paddingVertical: 13,
    paddingHorizontal: 14,
    ...shadows.card,
  },
  aiActionIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  aiActionTitle: { fontFamily: F700, fontSize: 13.5, color: '#111827' },
  aiActionSub: { fontFamily: F500, fontSize: 11, color: '#8b93a7', marginTop: 2 },
  aiActionLocked: { opacity: 0.72 },

  dayLabel: {
    fontFamily: F800,
    fontSize: 13,
    color: '#6b7280',
    marginBottom: 8,
    marginLeft: 2,
    textTransform: 'capitalize',
  },
  dayCol: {},
  entryRow: { flexDirection: 'row', gap: 10 },
  railCol: { width: 16, alignItems: 'center' },
  railDot: {
    width: 11,
    height: 11,
    borderRadius: 6,
    marginTop: 14,
    borderWidth: 2,
    borderColor: '#ffffff',
  },
  railLine: {
    flex: 1,
    width: 2,
    backgroundColor: '#e6e9f4',
    marginTop: 2,
    borderRadius: 1,
  },
  entryCard: {
    flex: 1,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    ...shadows.card,
  },
  entryHead: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  entryTitle: {
    flex: 1,
    fontFamily: F700,
    fontSize: 13.5,
    color: '#111827',
    minWidth: 0,
  },
  toneBadge: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  toneText: { fontFamily: F700, fontSize: 10 },
  entryBody: {
    fontFamily: F500,
    fontSize: 11.5,
    lineHeight: 16,
    color: '#4b5563',
    marginTop: 4,
  },
  entryTime: {
    fontFamily: F600,
    fontSize: 10.5,
    color: '#9CA3AF',
    marginTop: 6,
    alignSelf: 'flex-end',
  },
});
