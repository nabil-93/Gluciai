import { useEffect, useRef } from 'react';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';

import { routeForNotification, FALLBACK_ROUTE } from './notificationRoute';

/**
 * TAPPING A REMINDER TAKES THE PATIENT WHERE IT ASKED THEM TO GO — the platform
 * half of NOTIF-1.
 *
 * The RULE (which payload → which route) lives in `notificationRoute.ts`, which
 * imports nothing and is unit-tested. This file only wires that rule to
 * expo-notifications and expo-router, because both are unloadable in the node
 * test environment.
 *
 * THREE CASES, all required:
 *
 *   foreground   the app is open — `addNotificationResponseReceivedListener`
 *                fires immediately.
 *   background   the app is alive but backgrounded — same listener, fired when
 *                Android hands the response back.
 *   cold start   the app was NOT running. The listener is registered too late
 *                to see it, so `getLastNotificationResponseAsync()` is read once
 *                on mount. This is the case that is easiest to forget and the
 *                most common in practice: a reminder fires at 09:00 on a phone
 *                whose app was closed overnight.
 *
 * SAFETY. Every path is wrapped: a malformed payload, a payload from something
 * else, a navigation that throws — none of it may crash the app. A tap that
 * cannot be understood goes to the dashboard, never nowhere.
 *
 * LANGUAGE. Nothing here reads or writes language. Navigation carries no
 * strings; the destination screen renders through the same `useTranslation`
 * hook as always, so it is drawn in whatever language is active AT THAT MOMENT
 * — including a language changed after the notification was scheduled.
 */

/** Navigate, never throw. Exported for the routing test. */
export function navigateToNotification(data: unknown): void {
  const route = routeForNotification(data);
  try {
    router.push(route as never);
  } catch {
    // Router not mounted yet, or the route was rejected. Falling back is
    // better than an unhandled rejection from a notification tap.
    try {
      router.replace(FALLBACK_ROUTE as never);
    } catch {
      /* nothing sensible left to do */
    }
  }
}

/**
 * Mount once, at the root layout. Handles all three tap cases above.
 *
 * Deliberately a hook rather than a module side effect: it must unsubscribe
 * when the tree unmounts, and it must not run at import time (which would fire
 * before the router exists).
 */
export function useNotificationRouting(): void {
  /* A cold-start response stays available for the life of the process, so
     without this guard it would re-navigate on every re-render. */
  const coldStartHandled = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // ── cold start ────────────────────────────────────────────────────────
    (async () => {
      if (coldStartHandled.current) return;
      coldStartHandled.current = true;
      try {
        const last = await Notifications.getLastNotificationResponseAsync();
        if (cancelled || !last) return;
        navigateToNotification(last.notification.request.content.data);
      } catch {
        /* expo-notifications unavailable (web, simulator) — nothing to route */
      }
    })();

    // ── foreground + background ───────────────────────────────────────────
    let sub: { remove: () => void } | undefined;
    try {
      sub = Notifications.addNotificationResponseReceivedListener((res) => {
        navigateToNotification(res.notification.request.content.data);
      });
    } catch {
      /* unavailable on this platform — reminders simply do not route */
    }

    return () => {
      cancelled = true;
      try {
        sub?.remove();
      } catch {
        /* already gone */
      }
    };
  }, []);
}
