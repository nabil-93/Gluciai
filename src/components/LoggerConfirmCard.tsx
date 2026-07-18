import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Spinner } from '@/components/ui/Spinner';
import { nowDate, nowMs } from '@/lib/clock';
import type { LoggerAction } from '@/services/aiLogger';
import type { MealType } from '@/types';

const F500 = 'PlusJakartaSans_500Medium';
const F700 = 'PlusJakartaSans_700Bold';
const F800 = 'PlusJakartaSans_800ExtraBold';

const ICONS: Record<LoggerAction['type'], string> = {
  insulin: '💉',
  glucose: '🩸',
  meal: '🍽️',
  activity: '🏃',
  measure: '📏',
  reminder: '⏰',
  note: '📝',
};

/** The meal-time "folders" a logged meal can go into, with their icons. */
const MEAL_MOMENTS: { key: MealType; emoji: string }[] = [
  { key: 'breakfast', emoji: '🌅' },
  { key: 'lunch', emoji: '☀️' },
  { key: 'dinner', emoji: '🌙' },
  { key: 'snack', emoji: '🍎' },
];

/** When the AI didn't say which meal it was, guess from the time of day so
 *  the patient sees a sensible slot pre-selected (they can still change it). */
function guessMeal(): MealType {
  const h = new Date().getHours();
  if (h < 11) return 'breakfast';
  if (h < 16) return 'lunch';
  if (h < 22) return 'dinner';
  return 'snack';
}

/**
 * The confirmation the patient ALWAYS sees before the AI logs anything
 * for them: what will be added + when, with explicit Confirm / Cancel.
 * Shared by the /ai-log screen and the regular chat.
 */
export function LoggerConfirmCard({
  action,
  onConfirm,
  onCancel,
}: {
  action: LoggerAction;
  /** Receives the FINAL action (with the meal slot the patient picked). */
  onConfirm: (action: LoggerAction) => Promise<void> | void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  // For meals: which slot it will be filed under. Pre-fill with the AI's
  // guess, else the time of day — the patient sees it and can change it.
  const [mealType, setMealType] = useState<MealType>(
    action.type === 'meal' ? action.meal_type ?? guessMeal() : 'lunch'
  );

  const title = (() => {
    switch (action.type) {
      case 'insulin':
        return `${action.dose} U · ${t(`day.insu_${action.insulin_type}` as any)}`;
      case 'glucose':
        return `${action.value} mg/dL`;
      case 'meal':
        return action.name;
      case 'activity':
        return `${action.kind} · ${action.duration_min} min`;
      case 'measure':
        return `${action.kind === 'weight' ? t('logger.weight') : 'HbA1c'} · ${action.value} ${action.unit}`;
      case 'reminder':
        return action.message;
      case 'note':
        return action.text;
    }
  })();

  const detail = (() => {
    switch (action.type) {
      case 'meal':
        return `≈ ${action.calories} kcal · ${action.carbs} g ${t('day.carbsShort')} · ${action.sugar} g ${t('day.sugarShort')}`;
      case 'insulin':
        return t('day.insulin');
      case 'glucose':
        return t('day.glucose');
      case 'activity':
        return `${t('day.activity')} · ${action.intensity}`;
      case 'measure':
        return t('day.measures');
      case 'reminder':
        return t('logger.reminderLabel');
      case 'note':
        return t('logger.noteLabel');
    }
  })();

  const when = (() => {
    if (action.type === 'reminder') {
      const due = new Date(nowMs() + action.due_in_minutes * 60_000);
      const sameDay = due.toDateString() === nowDate().toDateString();
      const time = due.toLocaleTimeString(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
      });
      return sameDay
        ? time
        : `${due.toLocaleDateString(i18n.language, { weekday: 'short', day: 'numeric', month: 'short' })} ${time}`;
    }
    return action.minutes_ago
      ? new Date(nowMs() - action.minutes_ago * 60_000).toLocaleTimeString(
          i18n.language,
          { hour: '2-digit', minute: '2-digit' }
        )
      : t('logger.now');
  })();

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      // Meals carry the slot the patient picked so it files under the right
      // moment (breakfast/lunch/dinner/snack) in the day report.
      const finalAction: LoggerAction =
        action.type === 'meal' ? { ...action, meal_type: mealType } : action;
      await onConfirm(finalAction);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.card}>
      <View style={styles.head}>
        <View style={styles.icon}>
          <Text style={{ fontSize: 18 }}>{ICONS[action.type]}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          <Text style={styles.detail} numberOfLines={2}>
            {detail} · 🕐 {when}
          </Text>
        </View>
      </View>

      {/* Meal slot: the patient SEES where it will be filed and can change
          it (breakfast / lunch / dinner / snack) before confirming. */}
      {action.type === 'meal' ? (
        <View style={styles.momentBlock}>
          <Text style={styles.momentLabel}>{t('logger.mealMomentTitle')}</Text>
          <View style={styles.momentRow}>
            {MEAL_MOMENTS.map((m) => {
              const on = mealType === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setMealType(m.key)}
                  style={[styles.momentChip, on && styles.momentChipOn]}
                >
                  <Text style={{ fontSize: 13 }}>{m.emoji}</Text>
                  <Text style={[styles.momentText, on && styles.momentTextOn]}>
                    {t(`mealType.${m.key}`)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      <Text style={styles.question}>{t('logger.confirmTitle')}</Text>
      <View style={styles.btnRow}>
        <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={busy}>
          <Text style={styles.cancelText}>{t('logger.cancel')}</Text>
        </Pressable>
        <Pressable style={styles.okBtn} onPress={confirm} disabled={busy}>
          {busy ? (
            <Spinner size={20} color="#ffffff" />
          ) : (
            <Text style={styles.okText}>✓ {t('logger.confirm')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

/**
 * Red twin of the confirm card, shown before the AI DELETES an entry —
 * the patient always sees exactly what will be removed and must tap
 * (or verbally confirm, on a call) before anything is deleted.
 */
export function DeleteConfirmCard({
  summary,
  createdAt,
  onConfirm,
  onCancel,
}: {
  /** Human summary of the entry to remove (e.g. "🍽️ Tajine (≈520 kcal)"). */
  summary: string;
  createdAt?: string;
  onConfirm: () => Promise<void> | void;
  onCancel: () => void;
}) {
  const { t, i18n } = useTranslation();
  const [busy, setBusy] = useState(false);
  const time = createdAt
    ? new Date(createdAt).toLocaleTimeString(i18n.language, {
        hour: '2-digit',
        minute: '2-digit',
      })
    : '';

  const confirm = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await onConfirm();
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={[styles.card, styles.cardDelete]}>
      <View style={styles.head}>
        <View style={[styles.icon, styles.iconDelete]}>
          <Text style={{ fontSize: 18 }}>🗑️</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.title} numberOfLines={2}>
            {summary}
          </Text>
          {time ? <Text style={styles.detail}>🕐 {time}</Text> : null}
        </View>
      </View>

      <Text style={styles.question}>{t('logger.deleteTitle')}</Text>
      <View style={styles.btnRow}>
        <Pressable style={styles.cancelBtn} onPress={onCancel} disabled={busy}>
          <Text style={styles.cancelText}>{t('logger.cancel')}</Text>
        </Pressable>
        <Pressable style={[styles.okBtn, styles.deleteBtn]} onPress={confirm} disabled={busy}>
          {busy ? (
            <Spinner size={20} color="#ffffff" />
          ) : (
            <Text style={styles.okText}>🗑️ {t('logger.delete')}</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#19c37d',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#19c37d',
    shadowOffset: { width: 0, height: 5 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    elevation: 3,
  },
  head: { flexDirection: 'row', alignItems: 'center', gap: 11 },
  icon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#e9fbf2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontFamily: F800, fontSize: 15.5, color: '#101828' },
  detail: { fontFamily: F500, fontSize: 11.5, color: '#667085', marginTop: 3 },
  momentBlock: { marginTop: 13 },
  momentLabel: {
    fontFamily: F700,
    fontSize: 11.5,
    color: '#667085',
    marginBottom: 7,
  },
  momentRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  momentChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    backgroundColor: '#f1f3f9',
    borderWidth: 1.5,
    borderColor: 'transparent',
  },
  momentChipOn: { backgroundColor: '#e9fbf2', borderColor: '#19c37d' },
  momentText: { fontFamily: F700, fontSize: 12, color: '#3b4657' },
  momentTextOn: { color: '#0f7a45' },
  question: {
    fontFamily: F700,
    fontSize: 13,
    color: '#101828',
    marginTop: 12,
    marginBottom: 9,
  },
  btnRow: { flexDirection: 'row', gap: 9 },
  cancelBtn: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 11,
    backgroundColor: '#f1f3f9',
    alignItems: 'center',
  },
  cancelText: { fontFamily: F700, fontSize: 13.5, color: '#3b4657' },
  okBtn: {
    flex: 1.4,
    borderRadius: 999,
    paddingVertical: 11,
    backgroundColor: '#19c37d',
    alignItems: 'center',
    justifyContent: 'center',
  },
  okText: { fontFamily: F800, fontSize: 13.5, color: '#ffffff' },
  cardDelete: { borderColor: '#ef4444', shadowColor: '#ef4444' },
  iconDelete: { backgroundColor: '#fdeaea' },
  deleteBtn: { backgroundColor: '#ef4444' },
});
