import { Platform } from 'react-native';
import i18next from 'i18next';

import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type { AiReminder } from '@/types';

/* ────────────────────────────────────────────────────────────
 * AI REMINDERS ENGINE
 * "Rappelle-moi dans 1h de prendre mon insuline" → the AI creates a
 * reminder (behind the usual confirmation). This engine, ticked every
 * minute while the app is open:
 *   • fires due reminders (AI-journal entry + robot badge + browser
 *     notification when allowed);
 *   • FOLLOWS UP: if ~20 min after the due time nothing matching was
 *     logged, the coach asks "did you do it?" — answering in the
 *     ai-log chat logs it and closes the reminder;
 *   • auto-closes when a matching entry IS logged (done) or after
 *     24 h with nothing (missed).
 * ──────────────────────────────────────────────────────────── */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const localId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

const FOLLOW_UP_AFTER_MS = 20 * 60_000; // ask "did you do it?" after 20 min
const MATCH_WINDOW_BEFORE_MS = 30 * 60_000; // a log slightly before counts too
const MISSED_AFTER_MS = 24 * 3600_000;

function browserNotify(title: string, body: string) {
  try {
    if (
      Platform.OS === 'web' &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted'
    ) {
      new Notification(title, { body });
    }
  } catch {}
}

/** Ask once, lazily, when the patient creates their first reminder. */
function requestNotifyPermission() {
  try {
    if (
      Platform.OS === 'web' &&
      typeof Notification !== 'undefined' &&
      Notification.permission === 'default'
    ) {
      void Notification.requestPermission();
    }
  } catch {}
}

export async function createAiReminder(
  message: string,
  dueAt: Date,
  followKind: AiReminder['follow_kind']
): Promise<AiReminder> {
  requestNotifyPermission();
  const s = useAppStore.getState();
  const user_id = s.accountUserId ?? 'demo-user';

  let row: { id: string; created_at: string } | null = null;
  if (!isDemoMode && supabase && user_id !== 'demo-user') {
    try {
      const { data } = await supabase
        .from('ai_reminders')
        .insert({
          user_id,
          message,
          due_at: dueAt.toISOString(),
          follow_kind: followKind,
        })
        .select('id, created_at')
        .single();
      row = data as { id: string; created_at: string } | null;
    } catch {}
  }

  const reminder: AiReminder = {
    id: row?.id ?? localId(),
    user_id,
    message,
    due_at: dueAt.toISOString(),
    follow_kind: followKind,
    status: 'pending',
    created_at: row?.created_at ?? new Date().toISOString(),
  };
  s.addAiReminder(reminder);
  return reminder;
}

export function markReminder(id: string, status: AiReminder['status']) {
  useAppStore.getState().updateAiReminder(id, { status });
  if (!isDemoMode && supabase && UUID_RE.test(id)) {
    supabase
      .from('ai_reminders')
      .update({ status })
      .eq('id', id)
      .then(
        () => {},
        () => {}
      );
  }
}

/** Did the patient log something matching the reminder around its time? */
function hasMatchingLog(rem: AiReminder): boolean {
  const s = useAppStore.getState();
  const from = new Date(rem.due_at).getTime() - MATCH_WINDOW_BEFORE_MS;
  const inWindow = (iso: string) => {
    const t = new Date(iso).getTime();
    return t >= from && t <= Date.now();
  };
  switch (rem.follow_kind) {
    case 'insulin':
      return s.insulinLogs.some((l) => inWindow(l.created_at));
    case 'glucose':
      return s.glucoseLogs.some((l) => inWindow(l.created_at));
    case 'meal':
      return s.meals.some((m) => inWindow(m.created_at));
    case 'activity':
      return s.activityLogs.some((a) => inWindow(a.created_at));
    case 'measure':
      return s.measureLogs.some((m) => inWindow(m.created_at));
    default:
      return false; // 'other' needs the patient's own word
  }
}

/* Follow-up journal entries are asked at most once per session per
 * reminder (the entry itself stays in the journal). */
const askedFollowUp = new Set<string>();

/**
 * The minute tick. Fires due reminders and creates the "did you do it?"
 * follow-ups. Runs while the app is open ((tabs)/_layout interval).
 */
export function checkReminders() {
  const s = useAppStore.getState();
  const now = Date.now();
  const t = i18next.t.bind(i18next);

  for (const r of s.aiReminders) {
    const due = new Date(r.due_at).getTime();

    if (r.status === 'pending' && due <= now) {
      markReminder(r.id, 'fired');
      s.addAiJournalEntry({
        id: `rem-${r.id}`,
        icon: '⏰',
        title: t('reminders.firedTitle'),
        body: r.message,
        tone: 'warning',
        created_at: new Date().toISOString(),
      });
      browserNotify('GluciAI ⏰', r.message);
      continue;
    }

    if (r.status === 'fired') {
      if (hasMatchingLog(r)) {
        markReminder(r.id, 'done');
        continue;
      }
      if (now - due > MISSED_AFTER_MS) {
        markReminder(r.id, 'missed');
        continue;
      }
      if (now - due > FOLLOW_UP_AFTER_MS && !askedFollowUp.has(r.id)) {
        askedFollowUp.add(r.id);
        s.addAiJournalEntry({
          id: `remfu-${r.id}`,
          icon: '🤔',
          title: t('reminders.followTitle'),
          body: t('reminders.followBody', { msg: r.message }),
          tone: 'info',
          created_at: new Date().toISOString(),
        });
        browserNotify('GluciAI 🤔', t('reminders.followBody', { msg: r.message }));
      }
    }
  }
}

/** Fired reminders still waiting for the patient's word — the ai-log
 *  chat greets with "did you do it?" for these. */
export function pendingFollowUps(): AiReminder[] {
  const now = Date.now();
  return useAppStore
    .getState()
    .aiReminders.filter(
      (r) =>
        r.status === 'fired' &&
        now - new Date(r.due_at).getTime() > FOLLOW_UP_AFTER_MS &&
        !hasMatchingLog(r)
    );
}

/** A confirmed log of `kind` closes every fired reminder waiting on it.
 *  ('other' reminders close only on the patient's explicit word.) */
export function resolveFollowUps(kind: AiReminder['follow_kind']) {
  for (const r of useAppStore.getState().aiReminders) {
    if (r.status === 'fired' && r.follow_kind === kind) {
      markReminder(r.id, 'done');
    }
  }
}
