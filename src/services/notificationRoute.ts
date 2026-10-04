/**
 * WHERE A TAPPED REMINDER GOES — the decision, with no imports.
 *
 * WHAT WAS WRONG (audit finding NOTIF-1). `scheduleNotificationAsync` was called
 * with `content: { title, body, sound: false }` and nothing else: no `data`
 * payload. There was also no notification-response listener anywhere in `src/`.
 * So a patient who tapped "time to check your blood sugar" landed on whatever
 * screen the app happened to open with — never on the glucose screen. The
 * reminder could tell them to do something and then not take them there.
 *
 * This module is the routing RULE. It is deliberately import-free so it can be
 * unit-tested in a plain node environment — the same reason `plausibility.ts`,
 * `carbProvenance.ts`, `permissionAction.ts` and `i18n/direction.ts` are
 * import-free leaves. The platform half (the listener, the router call) lives
 * in `notificationRouting.ts`, which has to touch expo-notifications and
 * expo-router.
 *
 * NOTHING HERE IS CLINICAL. It decides navigation, never a dose, a threshold or
 * a nutritional figure.
 */

/**
 * The reminder identifiers the scheduler already uses.
 *
 * These are NOT invented: they are the `identifier` strings passed to
 * `Notifications.scheduleNotificationAsync` in `services/notifications.ts`
 * ('glucose-reminder', 'insulin-long-reminder', 'breakfast-reminder',
 * 'evening-recap'), and they map 1:1 onto the `PlannedReminder.id` values the
 * Rappels screen renders. Reusing them keeps one vocabulary for the whole
 * feature.
 */
export type ReminderType =
  | 'glucose'
  | 'insulin-long'
  | 'breakfast'
  | 'evening'
  /** A reminder the patient asked the assistant for ("remind me in 1 h to
   *  take my insulin") — scheduled by services/reminders.ts (store audit C-10).
   *  Its BODY is the patient's own words; the payload still carries no data. */
  | 'ai-reminder';

/**
 * What travels inside the notification.
 *
 * PRIVACY: this carries a TYPE and nothing else. No glucose value, no insulin
 * dose, no carbohydrate figure, no diagnosis, no name, no token, no key. A
 * notification payload is readable by the OS, survives in the shade, and can be
 * inspected on a lost or shared phone — so it says only which reminder fired,
 * never anything about the patient. `notificationPayloadIsSafe` below is the
 * executable version of that rule, and a test holds it in place.
 */
export interface ReminderPayload {
  /** Marks the payload as ours; anything else is ignored. */
  kind: 'reminder';
  type: ReminderType;
  /* expo-notifications types `content.data` as Record<string, unknown>, so the
     payload needs an index signature to be assignable. It does NOT loosen what
     is actually sent: `reminderPayload()` is the only producer and it emits
     exactly these two fields, which `notificationPayloadIsSafe` enforces. */
  [key: string]: unknown;
}

/** Routes this app already has. No new screen is introduced by this feature. */
export type ReminderRoute =
  | '/glucose'
  | '/insulin'
  | '/(tabs)'
  | '/rappels'
  | '/ai-log';

/**
 * The safe destination when a notification is unknown, malformed, or absent.
 *
 * The dashboard, not a modal: an unrecognised payload must never strand the
 * patient somewhere they did not ask to be, and `/(tabs)` is where a cold start
 * lands anyway.
 */
export const FALLBACK_ROUTE: ReminderRoute = '/(tabs)';

/**
 * NOTIFICATION → DESTINATION MAP.
 *
 *   glucose        → /glucose   the reading it is asking for
 *   insulin-long   → /insulin   the long-acting injection it is asking for
 *   breakfast      → /(tabs)    NO DEDICATED DESTINATION — see below
 *   evening        → /(tabs)    NO DEDICATED DESTINATION — see below
 *
 * `breakfast` invites the patient to scan a meal and `evening` is a recap of
 * the day. The obvious targets would be the scanner and a daily summary, but
 * opening the CAMERA straight from a notification is an intrusive product
 * decision, and the "daily recap" screen is the dashboard itself. Both
 * therefore route to `/(tabs)`, which shows today's figures and the scan
 * button, and both are recorded as NO DEDICATED DESTINATION rather than having
 * one invented for them.
 */
const ROUTES: Record<ReminderType, ReminderRoute> = {
  glucose: '/glucose',
  'insulin-long': '/insulin',
  breakfast: FALLBACK_ROUTE,
  evening: FALLBACK_ROUTE,
  // The logging assistant, which greets with "did you do it?" for a fired
  // reminder and logs the answer.
  'ai-reminder': '/ai-log',
};

/** Reminder types that deliberately have no screen of their own. */
export const NO_DEDICATED_DESTINATION: ReminderType[] = ['breakfast', 'evening'];

/** Is this a reminder type the app knows? */
export function isReminderType(v: unknown): v is ReminderType {
  return (
    v === 'glucose' ||
    v === 'insulin-long' ||
    v === 'breakfast' ||
    v === 'evening' ||
    v === 'ai-reminder'
  );
}

/**
 * Build the payload for a scheduled reminder. One place, so the scheduler and
 * the router cannot drift apart.
 */
export function reminderPayload(type: ReminderType): ReminderPayload {
  return { kind: 'reminder', type };
}

/**
 * Where should a tap on this notification go?
 *
 * Total by construction: every input — `undefined`, `null`, a string, a number,
 * an object with the wrong `kind`, an unknown `type`, or a payload someone else
 * sent — yields a route rather than throwing. A notification tap must never be
 * able to crash the app, so there is no path here that can fail.
 */
export function routeForNotification(data: unknown): ReminderRoute {
  if (!data || typeof data !== 'object') return FALLBACK_ROUTE;
  const d = data as Record<string, unknown>;
  if (d.kind !== 'reminder') return FALLBACK_ROUTE;
  if (!isReminderType(d.type)) return FALLBACK_ROUTE;
  return ROUTES[d.type];
}

/**
 * Does this payload contain only what a notification is allowed to carry?
 *
 * Used by the privacy test. Anything beyond `kind` and a known `type` is a
 * failure — including a field that merely LOOKS harmless, because the next
 * person to add one should have to justify it here rather than in a screen.
 */
export function notificationPayloadIsSafe(data: unknown): boolean {
  if (!data || typeof data !== 'object') return false;
  const keys = Object.keys(data as Record<string, unknown>).sort();
  if (keys.length !== 2 || keys[0] !== 'kind' || keys[1] !== 'type') return false;
  const d = data as Record<string, unknown>;
  return d.kind === 'reminder' && isReminderType(d.type);
}
