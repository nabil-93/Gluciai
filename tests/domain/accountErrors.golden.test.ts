import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { accountErrorKey } from '@/services/accountErrors';

/**
 * A FAILED ACCOUNT DELETION MUST NOT SPEAK BACKEND ENGLISH.
 *
 * `profile-edit.tsx` displayed `r.error` directly — on the deletion path AND
 * on the password-change path. That field is filled from `error.message`
 * (Supabase), `String(e)` (a raw throw, which can carry a stack), and the
 * `delete-account` edge function's own body, whose storage failure names the
 * buckets it could not clear. So an Arabic patient could be shown an English
 * sentence about `medical-reports`.
 *
 * Same defect class as BUG-A3, so the same shape of fix: map the CONDITION to
 * a key, translate at the screen. These fixtures pin the mapping and — via
 * source assertions, the convention this suite already uses — that the raw
 * string is no longer what gets rendered.
 */
const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

const LOCALES = ['fr', 'en', 'de', 'ar'] as const;
const KEYS = [
  'network',
  'sessionExpired',
  'storageCleanupFailed',
  'weakPassword',
  'samePassword',
  'rateLimited',
  'generic',
] as const;

describe('the deletion failure is classified, not quoted', () => {
  it('THE FIX: the storage failure — the account still exists, so retry is right', () => {
    // The edge function returns this BEFORE touching auth.users.
    expect(accountErrorKey('Could not delete stored files')).toBe(
      'accountError.storageCleanupFailed'
    );
    expect(
      accountErrorKey({ error: 'Could not delete stored files' })
    ).toBe('accountError.storageCleanupFailed');
  });

  it('the bucket names in the edge function detail never select a key of their own', () => {
    // `detail` is ["medical-reports: …"] — it must map to the same safe key,
    // never travel to the screen.
    expect(
      accountErrorKey('Could not delete stored files: medical-reports: denied')
    ).toBe('accountError.storageCleanupFailed');
  });

  it('the 401s from the edge function are a session problem', () => {
    expect(accountErrorKey('Not authenticated')).toBe('accountError.sessionExpired');
    expect(accountErrorKey('Invalid session')).toBe('accountError.sessionExpired');
    expect(accountErrorKey({ status: 401 })).toBe('accountError.sessionExpired');
  });

  it('offline is recognised before anything else', () => {
    expect(accountErrorKey({ name: 'TypeError' })).toBe('accountError.network');
    expect(accountErrorKey('Network request failed')).toBe('accountError.network');
    expect(accountErrorKey('Failed to fetch')).toBe('accountError.network');
  });

  it('rate limiting is its own message', () => {
    expect(accountErrorKey({ status: 429 })).toBe('accountError.rateLimited');
  });

  it("the service's own 'weak' sentinel maps to the password message", () => {
    // changePassword returns { ok: false, error: 'weak' } from a local check.
    expect(accountErrorKey('weak')).toBe('accountError.weakPassword');
    expect(accountErrorKey('Password should be at least 6 characters')).toBe(
      'accountError.weakPassword'
    );
  });

  it('reusing the old password is named, since the patient can act on it', () => {
    expect(
      accountErrorKey('New password should be different from the old password')
    ).toBe('accountError.samePassword');
  });

  it('ANYTHING unrecognised falls to generic rather than leaking', () => {
    expect(accountErrorKey(null)).toBe('accountError.generic');
    expect(accountErrorKey(undefined)).toBe('accountError.generic');
    expect(accountErrorKey('')).toBe('accountError.generic');
    /*
     * A raw throw stringified by `String(e)` — the exact leak this closes.
     * It falls to `generic`, which is correct and is the whole point: the
     * stack-ish text is classified as "unknown" and thrown away rather than
     * shown. Only a real Error OBJECT carries `name: 'TypeError'` and is
     * recognised as offline; a string that merely starts with "TypeError:"
     * must not be trusted to mean that.
     */
    expect(
      accountErrorKey('TypeError: Cannot read properties of undefined')
    ).toBe('accountError.generic');
    expect(
      accountErrorKey('duplicate key value violates unique constraint "profiles_pkey"')
    ).toBe('accountError.generic');
    expect(accountErrorKey('PGRST301: JWSError JWSInvalidSignature')).toBe(
      'accountError.generic'
    );
  });

  it('only ever returns a key from the allowed set', () => {
    const allowed = new Set(KEYS.map((k) => `accountError.${k}`));
    const inputs = [
      'Could not delete stored files',
      'Not authenticated',
      'Network request failed',
      'weak',
      'anything at all',
      '',
      null,
      { status: 429 },
      { status: 500, message: 'internal' },
    ];
    for (const i of inputs) {
      expect(allowed.has(accountErrorKey(i as never))).toBe(true);
    }
  });
});

describe('every key the mapper can return is translated everywhere', () => {
  for (const loc of LOCALES) {
    it(`${loc} has all ${KEYS.length} accountError keys, non-empty`, () => {
      const json = JSON.parse(src(`src/i18n/locales/${loc}.json`));
      expect(json.accountError, `${loc}.json has no accountError block`).toBeTruthy();
      for (const k of KEYS) {
        expect(typeof json.accountError[k], `${loc}.accountError.${k}`).toBe('string');
        expect(json.accountError[k].trim().length).toBeGreaterThan(0);
      }
    });
  }

  it('Arabic is actually Arabic, not a copy of the French', () => {
    const ar = JSON.parse(src('src/i18n/locales/ar.json')).accountError;
    const fr = JSON.parse(src('src/i18n/locales/fr.json')).accountError;
    for (const k of KEYS) {
      expect(ar[k]).not.toBe(fr[k]);
      // Arabic script present — catches an untranslated placeholder.
      expect(/[؀-ۿ]/.test(ar[k]), `ar.accountError.${k}`).toBe(true);
    }
  });

  it('German is distinct too', () => {
    const de = JSON.parse(src('src/i18n/locales/de.json')).accountError;
    const fr = JSON.parse(src('src/i18n/locales/fr.json')).accountError;
    for (const k of KEYS) expect(de[k]).not.toBe(fr[k]);
  });
});

describe('the screen no longer renders the raw string', () => {
  const screen = () => src('src/app/profile-edit.tsx');

  it('THE FIX: deletion shows a mapped key', () => {
    expect(screen()).toContain("notify(t('profile.error'), t(accountErrorKey(r.error)))");
  });

  it('THE FIX: password change shows a mapped key', () => {
    expect(screen()).toContain('setPwMsg({ ok: false, text: t(accountErrorKey(r.error)) })');
  });

  it('neither of the two raw-error renders survives anywhere in the screen', () => {
    const s = screen();
    expect(s).not.toContain("notify(t('profile.error'), r.error");
    expect(s).not.toContain('text: r.error');
    // No remaining path puts `r.error` into displayed text. It may still be
    // logged, which is the point of keeping it on ActionResult.
    const rendered = s.match(/text: r\.error|notify\([^)]*r\.error/g);
    expect(rendered).toBeNull();
  });

  it('the original is still available to the developer log', () => {
    const s = screen();
    expect(s).toContain("if (__DEV__) console.warn('[deleteAccount]', r.error)");
    expect(s).toContain("if (__DEV__) console.warn('[changePassword]', r.error)");
  });
});

describe('the security model is untouched by this change', () => {
  const fn = () => src('supabase/functions/delete-account/index.ts');

  it('deletion is still self-only, from the caller own JWT', () => {
    expect(fn()).toContain('admin.auth.getUser(jwt)');
    expect(fn()).toContain('const uid = userData.user.id');
  });

  it('storage is still cleared BEFORE the auth user', () => {
    const s = fn();
    expect(s.indexOf('.remove(paths)')).toBeLessThan(
      s.indexOf('admin.auth.admin.deleteUser(uid)')
    );
  });

  it('a storage failure still aborts before the account is deleted', () => {
    const s = fn();
    const guard = s.indexOf('if (storageErrors.length > 0)');
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(s.indexOf('admin.auth.admin.deleteUser(uid)'));
  });

  it('success behaviour is unchanged — dismiss then replace to /auth', () => {
    const s = src('src/app/profile-edit.tsx');
    expect(s).toContain('router.dismissAll()');
    expect(s).toContain("router.replace('/auth')");
  });
});
