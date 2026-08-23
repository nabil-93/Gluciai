import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { authErrorKey } from '@/services/authErrors';

/**
 * BUG-A3 — the patient must never read the backend's own error sentence.
 *
 * Found on the Android emulator: with the app in Arabic, a sign-in with
 * deleted credentials rendered the bare English string "Invalid login
 * credentials" on a fully right-to-left screen. `auth.tsx` was showing
 * `e.message`, which comes from Supabase and is always English.
 *
 * Two properties are pinned here:
 *
 *   1. Every failure maps to an i18n KEY, so the screen renders it in whatever
 *      language is active.
 *   2. No raw backend text can reach the UI — unrecognised errors fall to a
 *      generic key rather than passing the original through.
 *
 * Authentication BEHAVIOUR is unchanged: the same calls fail the same way.
 * Only what the patient reads is different.
 */
const LOCALES = ['fr', 'en', 'de', 'ar'] as const;

const locale = (l: string) =>
  JSON.parse(
    readFileSync(path.resolve(process.cwd(), `src/i18n/locales/${l}.json`), 'utf8')
  );

const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

describe('BUG-A3 — backend auth errors become i18n keys', () => {
  it('THE BUG: the exact Supabase string maps to a translated key', () => {
    expect(authErrorKey({ message: 'Invalid login credentials' })).toBe(
      'authError.invalidCredentials'
    );
  });

  it('a wrong password and a deleted account give the SAME key', () => {
    // Deliberate: Supabase answers both identically, and distinguishing them
    // would reveal which emails are registered.
    const wrongPassword = authErrorKey({ message: 'Invalid login credentials' });
    const deletedAccount = authErrorKey({ code: 'invalid_credentials' });
    expect(wrongPassword).toBe(deletedAccount);
  });

  it('recognises the other conditions the app can hit', () => {
    expect(authErrorKey({ message: 'User already registered' })).toBe(
      'authError.emailTaken'
    );
    expect(authErrorKey({ message: 'Password should be at least 6 characters' })).toBe(
      'authError.weakPassword'
    );
    expect(authErrorKey({ message: 'Unable to validate email address' })).toBe(
      'authError.invalidEmail'
    );
    expect(authErrorKey({ status: 429 })).toBe('authError.rateLimited');
    expect(authErrorKey({ code: 'email_not_confirmed' })).toBe(
      'authError.emailNotConfirmed'
    );
  });

  it('treats a fetch failure as a network problem, not a credentials problem', () => {
    // Telling a patient their password is wrong when they are simply offline
    // is the kind of wrong answer that makes people change a correct password.
    expect(authErrorKey({ message: 'Network request failed' })).toBe(
      'authError.network'
    );
    expect(authErrorKey({ name: 'TypeError' })).toBe('authError.network');
  });

  it('falls back to a generic key rather than leaking an unknown message', () => {
    expect(
      authErrorKey({ message: 'pgrst: relation "public.secrets" does not exist' })
    ).toBe('authError.generic');
    expect(authErrorKey(null)).toBe('authError.generic');
    expect(authErrorKey(undefined)).toBe('authError.generic');
    expect(authErrorKey({})).toBe('authError.generic');
  });

  it('only ever returns keys that exist in every locale', () => {
    const keys = [
      authErrorKey({ message: 'Invalid login credentials' }),
      authErrorKey({ message: 'User already registered' }),
      authErrorKey({ message: 'Password should be at least 6 characters' }),
      authErrorKey({ message: 'Unable to validate email address' }),
      authErrorKey({ status: 429 }),
      authErrorKey({ code: 'email_not_confirmed' }),
      authErrorKey({ message: 'Network request failed' }),
      authErrorKey({}),
    ];
    for (const l of LOCALES) {
      const j = locale(l);
      for (const k of keys) {
        const leaf = k.replace('authError.', '');
        expect(typeof j.authError?.[leaf], `${l}.${k}`).toBe('string');
        expect(j.authError[leaf].trim().length, `${l}.${k}`).toBeGreaterThan(0);
      }
    }
  });
});

describe('BUG-A3 — every locale has its own wording', () => {
  it.each(LOCALES)('%s: all eight messages are present and non-empty', (l) => {
    const a = locale(l).authError;
    for (const k of [
      'invalidCredentials',
      'emailTaken',
      'weakPassword',
      'invalidEmail',
      'rateLimited',
      'emailNotConfirmed',
      'network',
      'generic',
    ]) {
      expect(typeof a?.[k], `${l}.authError.${k}`).toBe('string');
      expect(a[k].trim().length, `${l}.authError.${k}`).toBeGreaterThan(0);
    }
  });

  it('no locale silently reuses another language’s sentence', () => {
    const s = LOCALES.map((l) => locale(l).authError.invalidCredentials);
    expect(new Set(s).size).toBe(LOCALES.length);
  });

  it('the ARABIC message is actually in Arabic script', () => {
    // The whole bug was an English sentence on an Arabic screen.
    expect(locale('ar').authError.invalidCredentials).toMatch(/[؀-ۿ]/);
    expect(locale('ar').authError.invalidCredentials).not.toMatch(/[A-Za-z]{4,}/);
  });
});

describe('BUG-A3 — the screen cannot render a raw backend message', () => {
  it('auth.tsx translates a mapped key instead of e.message', () => {
    const s = src('src/app/auth.tsx');
    expect(s).toContain('setError(t(authErrorKey(e)))');
    // The defect itself must be gone.
    expect(s).not.toContain("setError(e.message ?? t('common.error'))");
  });

  it('no locale ships the English backend sentence as a translation', () => {
    for (const l of LOCALES) {
      const raw = readFileSync(
        path.resolve(process.cwd(), `src/i18n/locales/${l}.json`),
        'utf8'
      );
      expect(raw, l).not.toContain('Invalid login credentials');
    }
  });
});
