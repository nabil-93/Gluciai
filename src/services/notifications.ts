import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

import { useAppStore } from '@/store/useAppStore';

/**
 * Smart Notification Engine — reminders generated from the user's own
 * behavior (usual measurement/injection times), rescheduled daily.
 * Native only; silently disabled on web.
 */

let initialized = false;

/** Median hour-of-day of a series of timestamps (null if too few). */
function usualHour(dates: string[], minSamples = 3): number | null {
  const hours = dates
    .map((d) => new Date(d).getHours())
    .sort((a, b) => a - b);
  if (hours.length < minSamples) return null;
  return hours[Math.floor(hours.length / 2)];
}

async function schedule(
  identifier: string,
  title: string,
  body: string,
  hour: number,
  minute = 0
) {
  await Notifications.scheduleNotificationAsync({
    identifier,
    content: { title, body, sound: false },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
    },
  });
}

export interface PlannedReminder {
  id: string;
  icon: string;
  title: string;
  body: string;
  hour: number;
  minute: number;
  /** Why this reminder exists (learned from the user's habits) */
  reason: string;
}

/** Optional translate fn; falls back to French copy when absent. */
type TFn = (key: string, opts?: Record<string, unknown>) => string;

/**
 * The reminders the engine would schedule right now, derived from the
 * user's own habits — used by the Rappels & notifications screens (works
 * on web too, where actual scheduling is unavailable). Pass `t` to get
 * localized copy; without it, French defaults are used.
 */
export function getPlannedReminders(t?: TFn): PlannedReminder[] {
  const { glucoseLogs, insulinLogs, meals, profile } = useAppStore.getState();
  const reminders: PlannedReminder[] = [];
  const tr = (key: string, fallback: string, opts?: Record<string, unknown>) =>
    t ? t(`reminders.${key}`, opts) : fallback;

  const gHour = usualHour(glucoseLogs.slice(0, 30).map((g) => g.created_at));
  reminders.push({
    id: 'glucose',
    icon: '🩸',
    title: tr('glucoseTitle', 'Contrôle glycémie'),
    body:
      gHour !== null
        ? tr('glucoseBodyLearned', `Vous mesurez d'habitude vers ${gHour}h.`, { hour: gHour })
        : tr('glucoseBodyDefault', 'Rappel quotidien pour mesurer votre glycémie.'),
    hour: gHour ?? 9,
    minute: 0,
    reason:
      gHour !== null
        ? tr('glucoseReasonLearned', 'Heure apprise de vos mesures habituelles')
        : tr('glucoseReasonDefault', 'Heure par défaut (aucune habitude détectée encore)'),
  });

  if ((profile?.insulin_types ?? []).includes('long')) {
    const iHour = usualHour(
      insulinLogs
        .filter((l) => l.insulin_type === 'long')
        .slice(0, 20)
        .map((l) => l.created_at)
    );
    if (iHour !== null) {
      reminders.push({
        id: 'insulin-long',
        icon: '💉',
        title: tr('insulinTitle', 'Insuline lente'),
        body: tr('insulinBody', `Vous injectez d'habitude vers ${iHour}h.`, { hour: iHour }),
        hour: iHour,
        minute: 0,
        reason: tr('insulinReason', 'Heure apprise de vos injections lentes'),
      });
    }
  }

  const morningMeals = meals
    .slice(0, 40)
    .filter((m) => new Date(m.created_at).getHours() < 11).length;
  if (morningMeals >= 3) {
    reminders.push({
      id: 'breakfast',
      icon: '🍽️',
      title: tr('breakfastTitle', 'Petit-déjeuner'),
      body: tr('breakfastBody', 'Scannez votre petit-déjeuner pour suivre vos glucides.'),
      hour: 9,
      minute: 30,
      reason: tr('breakfastReason', 'Vous enregistrez souvent un repas le matin'),
    });
  }

  reminders.push({
    id: 'evening',
    icon: '📊',
    title: tr('eveningTitle', 'Bilan du jour'),
    body: tr('eveningBody', 'Glycémie, repas et injections de la journée.'),
    hour: 21,
    minute: 0,
    reason: tr('eveningReason', 'Récapitulatif quotidien'),
  });

  return reminders.sort((a, b) => a.hour * 60 + a.minute - (b.hour * 60 + b.minute));
}

/**
 * (Re)build the smart reminder schedule from current data.
 * Call on app start and after significant data changes.
 */
export async function refreshSmartReminders(): Promise<void> {
  if (Platform.OS === 'web') return;

  try {
    if (!initialized) {
      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldPlaySound: false,
          shouldSetBadge: false,
          shouldShowBanner: true,
          shouldShowList: true,
        }),
      });
      initialized = true;
    }

    const perms = await Notifications.getPermissionsAsync();
    if (!perms.granted) {
      const req = await Notifications.requestPermissionsAsync();
      if (!req.granted) return;
    }

    await Notifications.cancelAllScheduledNotificationsAsync();

    const { glucoseLogs, insulinLogs, meals, profile } =
      useAppStore.getState();

    // 1 — Glucose reminder at the user's usual measurement hour (or 9:00)
    const gHour = usualHour(glucoseLogs.slice(0, 30).map((g) => g.created_at));
    await schedule(
      'glucose-reminder',
      'Contrôle glycémie 🩸',
      gHour !== null
        ? `Vous mesurez d'habitude vers ${gHour}h — c'est le moment de vérifier votre glycémie.`
        : "Pensez à mesurer votre glycémie aujourd'hui.",
      gHour ?? 9
    );

    // 2 — Long insulin reminder at the usual injection hour
    if ((profile?.insulin_types ?? []).includes('long')) {
      const iHour = usualHour(
        insulinLogs
          .filter((l) => l.insulin_type === 'long')
          .slice(0, 20)
          .map((l) => l.created_at)
      );
      if (iHour !== null) {
        await schedule(
          'insulin-long-reminder',
          'Insuline lente 💉',
          `Vous injectez d'habitude votre insuline lente vers ${iHour}h.`,
          iHour
        );
      }
    }

    // 3 — Breakfast logging habit: if the user usually logs a morning
    //     meal, remind them at 9:30
    const morningMeals = meals
      .slice(0, 40)
      .filter((m) => new Date(m.created_at).getHours() < 11).length;
    if (morningMeals >= 3) {
      await schedule(
        'breakfast-reminder',
        'Petit-déjeuner 🍽️',
        "N'oubliez pas de scanner votre petit-déjeuner pour suivre vos glucides.",
        9,
        30
      );
    }

    // 4 — Evening recap
    await schedule(
      'evening-recap',
      'Bilan du jour 📊',
      'Jetez un œil à votre journée : glycémie, repas et injections.',
      21
    );
  } catch {
    // Notifications unavailable (permissions, simulator…) — fail silently
  }
}
