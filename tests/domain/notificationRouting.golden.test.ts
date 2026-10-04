import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  FALLBACK_ROUTE,
  NO_DEDICATED_DESTINATION,
  isReminderType,
  notificationPayloadIsSafe,
  reminderPayload,
  routeForNotification,
  type ReminderType,
} from '@/services/notificationRoute';

/**
 * A TAPPED REMINDER MUST REACH THE SCREEN IT ASKED FOR (finding NOTIF-1).
 *
 * WHAT WAS WRONG. `scheduleNotificationAsync` was called with
 * `content: { title, body, sound: false }` — no `data` — and no
 * notification-response listener existed anywhere in `src/`. So a patient who
 * tapped "time to check your blood sugar" landed on whatever screen the app
 * opened with. The reminder told them to do something and then did not take
 * them there.
 *
 * These fixtures pin the routing rule, the payload, and the privacy boundary.
 * `notificationRoute.ts` imports nothing, so it runs for real here; the
 * platform wiring (`notificationRouting.ts`) imports expo-notifications and
 * expo-router, which the node runner cannot load, so it is asserted on source —
 * the convention this suite already uses.
 */
const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

const ALL_TYPES: ReminderType[] = [
  'glucose',
  'insulin-long',
  'breakfast',
  'evening',
];

/* ── A/B/C — payload creation, type, identifier ───────────────────────── */

describe('the payload says which reminder fired, and nothing else', () => {
  it('THE FIX: a scheduled reminder now carries a data payload', () => {
    expect(reminderPayload('glucose')).toEqual({
      kind: 'reminder',
      type: 'glucose',
    });
  });

  it('every reminder type produces a well-formed payload', () => {
    for (const t of ALL_TYPES) {
      const p = reminderPayload(t);
      expect(p.kind).toBe('reminder');
      expect(p.type).toBe(t);
    }
  });

  it('the types are the scheduler’s OWN identifiers, not invented ones', () => {
    /*
     * `notifications.ts` schedules under 'glucose-reminder',
     * 'insulin-long-reminder', 'breakfast-reminder', 'evening-recap', and the
     * Rappels screen renders PlannedReminder ids 'glucose', 'insulin-long',
     * 'breakfast', 'evening'. The payload reuses the latter so the feature has
     * ONE vocabulary — a second set of ids would be a second thing to keep in
     * step.
     */
    const s = src('src/services/notifications.ts');
    for (const t of ALL_TYPES) {
      expect(s, `scheduler lost the ${t} reminder`).toContain(`id: '${t}'`);
    }
  });

  it('each of the four scheduled notifications passes its type', () => {
    const s = src('src/services/notifications.ts');
    expect(s).toContain("'glucose'\n    );");
    expect(s).toContain("'insulin-long'\n        );");
    expect(s).toContain("'breakfast'\n      );");
    expect(s).toContain("'evening'\n    );");
  });

  it('isReminderType accepts exactly the four known types', () => {
    for (const t of ALL_TYPES) expect(isReminderType(t)).toBe(true);
    for (const bad of ['', 'glucose-reminder', 'bolus', 'GLUCOSE', 0, null, {}]) {
      expect(isReminderType(bad)).toBe(false);
    }
  });
});

/* ── H — tap routing, the destination map ─────────────────────────────── */

describe('NOTIFICATION → DESTINATION map', () => {
  it('glucose goes to the glucose screen', () => {
    expect(routeForNotification(reminderPayload('glucose'))).toBe('/glucose');
  });

  it('the long-insulin reminder goes to the insulin screen', () => {
    expect(routeForNotification(reminderPayload('insulin-long'))).toBe('/insulin');
  });

  it('an assistant reminder opens the logging assistant (C-10)', () => {
    expect(isReminderType('ai-reminder')).toBe(true);
    expect(routeForNotification(reminderPayload('ai-reminder'))).toBe('/ai-log');
    // Same privacy rule as every other reminder: kind + type, nothing more.
    expect(notificationPayloadIsSafe(reminderPayload('ai-reminder'))).toBe(true);
  });

  it('breakfast and evening have NO DEDICATED DESTINATION and land safely', () => {
    // Opening the camera straight from a notification is an intrusive product
    // decision, and the "daily recap" is the dashboard itself — so both route
    // to /(tabs) rather than having a destination invented for them.
    for (const t of NO_DEDICATED_DESTINATION) {
      expect(routeForNotification(reminderPayload(t))).toBe(FALLBACK_ROUTE);
    }
    expect(NO_DEDICATED_DESTINATION.sort()).toEqual(['breakfast', 'evening']);
  });

  it('every known type resolves to a route the app actually has', () => {
    const real = ['/glucose', '/insulin', '/(tabs)', '/rappels'];
    for (const t of ALL_TYPES) {
      expect(real).toContain(routeForNotification(reminderPayload(t)));
    }
  });

  it('the destination screens exist in the router', () => {
    for (const f of ['src/app/glucose.tsx', 'src/app/insulin.tsx']) {
      expect(() => src(f), `${f} is missing`).not.toThrow();
    }
  });
});

/* ── L/M/N — malformed, unknown, fallback ─────────────────────────────── */

describe('a tap can never crash the app or strand the patient', () => {
  it('a missing payload falls back to the dashboard', () => {
    expect(routeForNotification(undefined)).toBe(FALLBACK_ROUTE);
    expect(routeForNotification(null)).toBe(FALLBACK_ROUTE);
  });

  it('a non-object payload falls back', () => {
    for (const bad of ['glucose', 42, true, Symbol('x')]) {
      expect(routeForNotification(bad as never)).toBe(FALLBACK_ROUTE);
    }
  });

  it('someone else’s notification falls back', () => {
    // A push from another SDK, or a payload with the wrong marker.
    expect(routeForNotification({ type: 'glucose' })).toBe(FALLBACK_ROUTE);
    expect(routeForNotification({ kind: 'promo', type: 'glucose' })).toBe(
      FALLBACK_ROUTE
    );
  });

  it('an UNKNOWN reminder type falls back rather than guessing', () => {
    expect(routeForNotification({ kind: 'reminder', type: 'bolus' })).toBe(
      FALLBACK_ROUTE
    );
    expect(routeForNotification({ kind: 'reminder' })).toBe(FALLBACK_ROUTE);
  });

  it('routeForNotification is TOTAL — no input throws', () => {
    const nasty: unknown[] = [
      undefined, null, 0, NaN, '', [], {}, { kind: 'reminder', type: null },
      { kind: null }, new Date(), () => {},
    ];
    for (const v of nasty) {
      expect(() => routeForNotification(v)).not.toThrow();
    }
  });
});

/* ── I/J/K — foreground, background, cold start ───────────────────────── */

describe('all three tap situations are handled', () => {
  const routing = () => src('src/services/notificationRouting.ts');

  it('foreground and background: a response listener is registered', () => {
    expect(routing()).toContain('addNotificationResponseReceivedListener');
  });

  it('COLD START: the last response is read on mount', () => {
    // The listener is registered too late to see a tap that launched the app —
    // the case that matters most, since reminders fire on a closed app.
    expect(routing()).toContain('getLastNotificationResponseAsync');
  });

  it('the cold-start response is handled once, not on every render', () => {
    expect(routing()).toContain('coldStartHandled');
  });

  it('the listener is unsubscribed on unmount', () => {
    expect(routing()).toContain('sub?.remove()');
  });

  it('THE FIX is actually mounted at the root layout', () => {
    // A hook nobody calls would leave the defect exactly where it was.
    const layout = src('src/app/_layout.tsx');
    expect(layout).toContain('useNotificationRouting');
    expect(layout).toContain("from '@/services/notificationRouting'");
  });

  it('navigation failures are swallowed, never thrown', () => {
    const s = routing();
    expect(s).toContain('catch');
    expect(s).toContain('FALLBACK_ROUTE');
  });
});

/* ── D/E/F/G — FR / EN / DE / AR notification content ─────────────────── */

describe('notification text follows the selected language', () => {
  const NOTIFY_KEYS = [
    'notifyGlucoseTitle',
    'notifyGlucoseLearned',
    'notifyGlucoseDefault',
    'notifyInsulinTitle',
    'notifyInsulinBody',
    'notifyBreakfastTitle',
    'notifyBreakfastBody',
    'notifyEveningTitle',
    'notifyEveningBody',
  ] as const;

  const loc = (l: string) =>
    JSON.parse(src(`src/i18n/locales/${l}.json`)).reminders as Record<string, string>;

  for (const l of ['fr', 'en', 'de', 'ar'] as const) {
    it(`${l}: every notification title and body is present and non-empty`, () => {
      const r = loc(l);
      for (const k of NOTIFY_KEYS) {
        expect(typeof r[k], `${l}.reminders.${k}`).toBe('string');
        expect(r[k].trim().length, `${l}.reminders.${k}`).toBeGreaterThan(0);
      }
    });
  }

  it('AR is really Arabic, and differs from FR', () => {
    const ar = loc('ar');
    const fr = loc('fr');
    for (const k of NOTIFY_KEYS) {
      expect(/[؀-ۿ]/.test(ar[k]), `ar.${k}`).toBe(true);
      expect(ar[k], `ar.${k} is a French copy`).not.toBe(fr[k]);
    }
  });

  it('DE and EN differ from FR too — no silent fallback', () => {
    const fr = loc('fr');
    for (const l of ['de', 'en'] as const) {
      const m = loc(l);
      for (const k of NOTIFY_KEYS) {
        expect(m[k], `${l}.${k} is a French copy`).not.toBe(fr[k]);
      }
    }
  });

  it('the {{hour}} placeholder survives in every locale', () => {
    for (const l of ['fr', 'en', 'de', 'ar'] as const) {
      const r = loc(l);
      expect(r.notifyGlucoseLearned).toContain('{{hour}}');
      expect(r.notifyInsulinBody).toContain('{{hour}}');
    }
  });

  it('the routing layer carries NO user-visible strings', () => {
    /*
     * Language must not be baked into a payload scheduled hours earlier: the
     * destination screen renders through useTranslation at TAP time, so a
     * language changed in between is respected. Neither routing module may
     * contain translated copy.
     */
    for (const f of [
      'src/services/notificationRoute.ts',
      'src/services/notificationRouting.ts',
    ]) {
      const code = src(f)
        .replace(/\/\/[^\n]*/g, '')
        .replace(/\/\*[\s\S]*?\*\//g, '');
      /*
       * Prose = a quoted string containing a SPACE. Identifiers this module
       * legitimately holds ('insulin-long', 'reminder', '/(tabs)') never do,
       * so requiring a space is what separates a route name from a sentence.
       */
      expect(code, `${f} hardcodes a translated string`).not.toMatch(
        /['"`][A-Za-zÀ-ÿ]+ [A-Za-zÀ-ÿ ,'’.!?]{8,}['"`]/
      );
      expect(code).not.toContain('i18n');
    }
  });

  it('the scheduler still resolves text at scheduling time, in the active language', () => {
    const s = src('src/services/notifications.ts');
    const bindAt = s.indexOf('const t = i18n.t.bind(i18n)');
    const fnAt = s.indexOf('export async function refreshSmartReminders');
    expect(bindAt).toBeGreaterThan(fnAt); // bound INSIDE the function
    expect(src('src/app/(tabs)/_layout.tsx')).toContain('[i18n.language]');
  });
});

/* ── an unmatched deep link has a localized destination ───────────────── */

describe('an unknown deep link lands somewhere the patient can read', () => {
  /*
   * The app declares the `glucoai://` scheme, but had no `+not-found` route:
   * anything unmatched fell through to Expo Router's built-in screen, which is
   * unstyled, in ENGLISH whatever the app language, and offers no way back. An
   * Arabic-reading patient could be dropped there with no exit.
   */
  const NOT_FOUND_KEYS = ['title', 'body', 'cta'] as const;

  it('THE FIX: a +not-found route exists', () => {
    expect(() => src('src/app/+not-found.tsx')).not.toThrow();
  });

  it('it is fully translated in all four languages', () => {
    for (const l of ['fr', 'en', 'de', 'ar'] as const) {
      const p = JSON.parse(src(`src/i18n/locales/${l}.json`)).notFoundPage;
      expect(p, `${l}.json has no notFoundPage`).toBeTruthy();
      for (const k of NOT_FOUND_KEYS) {
        expect(typeof p[k], `${l}.notFoundPage.${k}`).toBe('string');
        expect(p[k].trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('the Arabic version is Arabic, not an English fallback', () => {
    const ar = JSON.parse(src('src/i18n/locales/ar.json')).notFoundPage;
    const en = JSON.parse(src('src/i18n/locales/en.json')).notFoundPage;
    for (const k of NOT_FOUND_KEYS) {
      expect(/[؀-ۿ]/.test(ar[k]), `ar.notFoundPage.${k}`).toBe(true);
      expect(ar[k]).not.toBe(en[k]);
    }
  });

  it('it renders through i18n and hardcodes nothing', () => {
    const s = src('src/app/+not-found.tsx');
    expect(s).toContain("t('notFoundPage.title')");
    expect(s).toContain("t('notFoundPage.body')");
    expect(s).toContain("t('notFoundPage.cta')");
    const literals = s.match(/<Text[^>]*>\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ,'’.!?-]{4,}\s*</g);
    expect(literals).toBeNull();
  });

  it('it offers a way out, and does not stay on the back stack', () => {
    // `replace`, not `push`: a back gesture must not return to a dead link.
    expect(src('src/app/+not-found.tsx')).toContain("router.replace('/(tabs)')");
  });

  it('it does not force a text direction, so Arabic mirrors', () => {
    const code = src('src/app/+not-found.tsx')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    expect(code).not.toContain('textAlign');
    expect(code).not.toContain('writingDirection');
  });
});

/* ── O — privacy ──────────────────────────────────────────────────────── */

describe('a notification payload carries no clinical or personal data', () => {
  it('the payload is exactly {kind, type} — nothing else', () => {
    for (const t of ALL_TYPES) {
      expect(notificationPayloadIsSafe(reminderPayload(t))).toBe(true);
    }
  });

  it('a payload with ANY extra field is rejected', () => {
    // Even a harmless-looking addition must fail here, so the next person to
    // add one has to justify it in this module rather than in a screen.
    const bad = [
      { kind: 'reminder', type: 'glucose', glucose: 180 },
      { kind: 'reminder', type: 'glucose', dose: 4.5 },
      { kind: 'reminder', type: 'glucose', carbs: 60 },
      { kind: 'reminder', type: 'glucose', userId: 'abc' },
      { kind: 'reminder', type: 'glucose', token: 'ey...' },
      { kind: 'reminder', type: 'glucose', note: 'type 1 diabetes' },
    ];
    for (const p of bad) expect(notificationPayloadIsSafe(p)).toBe(false);
  });

  it('the scheduler never puts a value into the payload', () => {
    const s = src('src/services/notifications.ts')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    // The ONLY data expression is the shared builder.
    const dataUses = s.match(/data:\s*[^,\n]+/g) ?? [];
    expect(dataUses.length).toBe(1);
    expect(dataUses[0]).toContain('reminderPayload(type)');
  });

  it('no secret, token or key can appear in the payload module', () => {
    const code = src('src/services/notificationRoute.ts')
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    for (const forbidden of ['SUPABASE', 'API_KEY', 'token', 'Bearer', 'secret']) {
      expect(code.toLowerCase()).not.toContain(forbidden.toLowerCase());
    }
  });
});
