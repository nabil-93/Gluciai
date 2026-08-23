import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * EVERY NOTIFICATION SURFACE SPEAKS THE PATIENT'S LANGUAGE — and "reminders
 * are on" must mean the OS actually accepted them.
 *
 * Two things are pinned here.
 *
 * 1. LOCALIZATION. Scheduled notification content is resolved at SCHEDULING
 *    time (`i18n.t` bound inside `refreshSmartReminders`), not at delivery.
 *    `(tabs)/_layout.tsx` therefore reschedules on every language change, and
 *    `refreshSmartReminders` cancels all pending notifications before
 *    rebuilding — so switching language cannot leave a stale-language reminder
 *    queued, and cannot duplicate one. That is the documented product
 *    behaviour, and these tests hold it in place.
 *
 * 2. HONESTY. `refreshSmartReminders` used to return `void`, swallowing a
 *    denied permission in a bare `catch {}`. The Rappels screen set
 *    `activated = true` unconditionally, so a patient who refused the OS
 *    prompt was still shown "Rappels activés ✓" — told an insulin reminder was
 *    scheduled when nothing was. The service now reports its outcome and only
 *    'scheduled' is success.
 *
 * The screens import React Native, which the node runner cannot parse, so call
 * sites are asserted on source — the convention this suite already uses.
 */
const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

const locale = (l: string) => JSON.parse(src(`src/i18n/locales/${l}.json`));
const LOCALES = ['fr', 'en', 'de', 'ar'] as const;

/** Every key the reminders engine and the Rappels screen can render. */
const REMINDER_KEYS = [
  'glucoseTitle',
  'glucoseBodyLearned',
  'glucoseBodyDefault',
  'glucoseReasonLearned',
  'glucoseReasonDefault',
  'insulinTitle',
  'insulinBody',
  'insulinReason',
  'breakfastTitle',
  'breakfastBody',
  'breakfastReason',
  'eveningTitle',
  'eveningBody',
  'eveningReason',
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

const PAGE_KEYS = [
  'title',
  'subtitle',
  'everyDay',
  'activate',
  'activated',
  'footNote',
  'webNote',
  'permissionDenied',
  'openSettings',
  'unavailable',
] as const;

describe('every notification string exists in all four languages', () => {
  for (const l of LOCALES) {
    it(`${l}: all ${REMINDER_KEYS.length} reminder keys, non-empty`, () => {
      const r = locale(l).reminders;
      expect(r, `${l}.json has no reminders block`).toBeTruthy();
      for (const k of REMINDER_KEYS) {
        expect(typeof r[k], `${l}.reminders.${k}`).toBe('string');
        expect(r[k].trim().length, `${l}.reminders.${k}`).toBeGreaterThan(0);
      }
    });

    it(`${l}: all ${PAGE_KEYS.length} Rappels page keys, non-empty`, () => {
      const p = locale(l).rappelsPage;
      expect(p, `${l}.json has no rappelsPage block`).toBeTruthy();
      for (const k of PAGE_KEYS) {
        expect(typeof p[k], `${l}.rappelsPage.${k}`).toBe('string');
        expect(p[k].trim().length, `${l}.rappelsPage.${k}`).toBeGreaterThan(0);
      }
    });
  }

  it('the interpolation placeholder survives translation in every locale', () => {
    // `{{hour}}` is filled from the patient's own habits. A translator
    // dropping it would silently produce "you usually measure around ."
    for (const l of LOCALES) {
      const r = locale(l).reminders;
      for (const k of ['notifyGlucoseLearned', 'notifyInsulinBody'] as const) {
        expect(r[k], `${l}.reminders.${k} lost {{hour}}`).toContain('{{hour}}');
      }
    }
  });
});

describe('Arabic notification strings are actually Arabic', () => {
  it('every reminder string is in Arabic script and differs from French', () => {
    const ar = locale('ar').reminders;
    const fr = locale('fr').reminders;
    for (const k of REMINDER_KEYS) {
      expect(/[؀-ۿ]/.test(ar[k]), `ar.reminders.${k}`).toBe(true);
      expect(ar[k], `ar.reminders.${k} is a French copy`).not.toBe(fr[k]);
    }
  });

  it('every Rappels page string is in Arabic script and differs from French', () => {
    const ar = locale('ar').rappelsPage;
    const fr = locale('fr').rappelsPage;
    for (const k of PAGE_KEYS) {
      expect(/[؀-ۿ]/.test(ar[k]), `ar.rappelsPage.${k}`).toBe(true);
      expect(ar[k], `ar.rappelsPage.${k} is a French copy`).not.toBe(fr[k]);
    }
  });

  it('German is distinct from French too — no silent fallback', () => {
    for (const block of ['reminders', 'rappelsPage'] as const) {
      const de = locale('de')[block];
      const fr = locale('fr')[block];
      const keys = block === 'reminders' ? REMINDER_KEYS : PAGE_KEYS;
      for (const k of keys) expect(de[k], `de.${block}.${k}`).not.toBe(fr[k]);
    }
  });
});

describe('the notification UI hardcodes nothing user-facing', () => {
  it('rappels.tsx renders no literal sentence', () => {
    const s = src('src/app/rappels.tsx');
    // Any <Text> whose body is a bare word-like literal rather than {t(...)}.
    const literals = s.match(/<Text[^>]*>\s*[A-Za-zÀ-ÿ][A-Za-zÀ-ÿ ,'’.!?-]{4,}\s*</g);
    expect(literals, `hardcoded text in rappels.tsx: ${literals}`).toBeNull();
  });

  it('the notification service selects text only through i18n keys', () => {
    const s = src('src/services/notifications.ts');
    // Every scheduled title/body goes through `t('reminders.…')`.
    const scheduled = s.match(/t\('reminders\.notify[A-Za-z]+'/g) ?? [];
    expect(scheduled.length).toBeGreaterThanOrEqual(8);
  });

  it('the permission-denied copy and its action are keyed, not literal', () => {
    const s = src('src/app/rappels.tsx');
    expect(s).toContain("t('rappelsPage.permissionDenied')");
    expect(s).toContain("t('rappelsPage.openSettings')");
    expect(s).toContain("t('rappelsPage.unavailable')");
  });
});

describe('the language in a scheduled notification is the one selected then', () => {
  it('the scheduler resolves `t` at call time, not at module load', () => {
    const s = src('src/services/notifications.ts');
    const bindAt = s.indexOf('const t = i18n.t.bind(i18n)');
    const fnAt = s.indexOf('export async function refreshSmartReminders');
    expect(bindAt).toBeGreaterThan(-1);
    // Bound INSIDE the function: a module-level bind would freeze the language
    // at import time and every reminder would ship in the startup locale.
    expect(bindAt).toBeGreaterThan(fnAt);
  });

  it('a language change reschedules, so queued text cannot go stale', () => {
    const s = src('src/app/(tabs)/_layout.tsx');
    expect(s).toContain('[i18n.language]');
    expect(s).toContain('refreshSmartReminders()');
  });

  it('rescheduling cancels first, so it cannot duplicate a reminder', () => {
    const s = src('src/services/notifications.ts');
    const cancelAt = s.indexOf('cancelAllScheduledNotificationsAsync');
    const firstSchedule = s.indexOf("await schedule(\n      'glucose-reminder'");
    expect(cancelAt).toBeGreaterThan(-1);
    expect(firstSchedule).toBeGreaterThan(cancelAt);
  });

  it('the previewed reminders re-render on language change', () => {
    // `useMemo(..., [t])` — a stale `t` would leave the list in the old
    // language while the rest of the screen switched.
    expect(src('src/app/rappels.tsx')).toContain('getPlannedReminders(t), [t]');
    expect(src('src/app/ai-journal.tsx')).toContain('getPlannedReminders(t)');
  });
});

describe('"reminders activated" means the OS really accepted them', () => {
  const service = () => src('src/services/notifications.ts');
  const screen = () => src('src/app/rappels.tsx');

  it('THE FIX: the service reports its outcome instead of returning void', () => {
    const s = service();
    expect(s).toContain('ReminderScheduleResult');
    expect(s).toContain(
      'export async function refreshSmartReminders(): Promise<ReminderScheduleResult>'
    );
  });

  it('a denied permission is reported as denied, not as success', () => {
    expect(service()).toContain("if (!req.granted) return 'denied'");
  });

  it('the catch-all no longer masquerades as success', () => {
    const s = service();
    expect(s).toContain("return 'unavailable'");
    // The success value is returned only after the last schedule() call.
    const successAt = s.indexOf("return 'scheduled'");
    const eveningAt = s.indexOf("'evening-recap'");
    expect(successAt).toBeGreaterThan(eveningAt);
  });

  it('web is unavailable, never scheduled', () => {
    expect(service()).toContain("if (Platform.OS === 'web') return 'unavailable'");
  });

  it('THE FIX: the screen only claims success on `scheduled`', () => {
    const s = screen();
    expect(s).toContain("if (result === 'scheduled') setActivated(true)");
    expect(s).toContain("else if (result === 'denied') setDenied(true)");
    // The old unconditional success must be gone.
    expect(s).not.toMatch(/await refreshSmartReminders\(\);\s*\n\s*setActivated\(true\)/);
  });

  it('a refusal offers the one action that can still work', () => {
    const s = screen();
    expect(s).toContain('requestOrOpenSettings');
    expect(s).toContain('fixPermission');
  });

  it('the denied notice carries no hardcoded direction, so Arabic mirrors', () => {
    const s = screen();
    const box = s
      .slice(s.indexOf('deniedText: {'), s.indexOf('deniedLink: {'))
      // Strip comments: the block explains WHY it sets no textAlign, and the
      // explanation must not be mistaken for the property itself.
      .replace(/\/\/[^\n]*/g, '')
      .replace(/\/\*[\s\S]*?\*\//g, '');
    // An explicit textAlign/direction here would pin the notice LTR while the
    // rest of the Arabic screen mirrors.
    expect(box).not.toContain('textAlign');
    expect(box).not.toContain('writingDirection');
  });
});
