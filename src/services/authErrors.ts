/**
 * AUTHENTICATION ERRORS — what the patient is allowed to be shown.
 *
 * WHAT WAS WRONG (BUG-A3, found on the Android emulator). `auth.tsx` rendered
 * `e.message ?? t('common.error')`, so the string the patient read came
 * straight from Supabase — always English, whatever the app's language. On a
 * fully Arabic screen a failed sign-in produced the bare English sentence
 * "Invalid login credentials".
 *
 * Two separate problems, both closed here:
 *
 *   1. LANGUAGE. A backend string cannot be translated, so it must not be the
 *      thing displayed. This module maps the condition to an i18n KEY, and the
 *      screen translates it in whatever language is active.
 *   2. DISCLOSURE. A raw backend message can carry detail the patient should
 *      not see (provider internals, table or column names, rate-limit
 *      specifics). Mapping to a fixed set of keys means only vetted wording
 *      ever reaches the screen.
 *
 * WHAT THIS DOES NOT DO. It changes no authentication behaviour: the same
 * calls fail in the same way, the same errors are thrown, and nothing about
 * sessions, passwords or security semantics moves. It decides only what the
 * patient READS. The original error is returned alongside the key so the
 * caller can still log it.
 *
 * DELIBERATELY COARSE. `invalidCredentials` covers both "wrong password" and
 * "no such account" because Supabase answers both with the same message — and
 * distinguishing them would tell an attacker which emails are registered. The
 * vagueness is the security property, not a shortcoming.
 */

/** The i18n keys this module is allowed to select. */
export type AuthErrorKey =
  | 'authError.invalidCredentials'
  | 'authError.emailTaken'
  | 'authError.weakPassword'
  | 'authError.invalidEmail'
  | 'authError.rateLimited'
  | 'authError.emailNotConfirmed'
  | 'authError.network'
  | 'authError.generic';

/** Anything an auth call may reject with. */
export interface AuthErrorLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  name?: unknown;
}

/**
 * Which key describes this failure.
 *
 * Matching is on lowercased substrings because Supabase's REST layer does not
 * expose a stable machine code for every case; `code`/`status` are preferred
 * where present. Anything unrecognised falls to `generic` rather than leaking
 * the original text.
 */
export function authErrorKey(e: AuthErrorLike | null | undefined): AuthErrorKey {
  if (!e) return 'authError.generic';

  const msg = typeof e.message === 'string' ? e.message.toLowerCase() : '';
  const code = typeof e.code === 'string' ? e.code.toLowerCase() : '';
  const status = typeof e.status === 'number' ? e.status : undefined;
  const name = typeof e.name === 'string' ? e.name.toLowerCase() : '';

  // Offline / DNS / fetch failure. Checked first: a network failure can
  // surface with no useful message at all.
  if (
    name === 'typeerror' ||
    msg.includes('network request failed') ||
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    code === 'enotfound' ||
    code === 'econnrefused'
  ) {
    return 'authError.network';
  }

  if (status === 429 || code === 'over_request_rate_limit' || msg.includes('rate limit')) {
    return 'authError.rateLimited';
  }

  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'authError.emailNotConfirmed';
  }

  if (
    code === 'user_already_exists' ||
    msg.includes('already registered') ||
    msg.includes('already been registered') ||
    msg.includes('user already exists')
  ) {
    return 'authError.emailTaken';
  }

  if (
    code === 'weak_password' ||
    msg.includes('password should be at least') ||
    msg.includes('weak password')
  ) {
    return 'authError.weakPassword';
  }

  if (
    code === 'validation_failed' ||
    msg.includes('unable to validate email') ||
    msg.includes('invalid email')
  ) {
    return 'authError.invalidEmail';
  }

  // Wrong password AND unknown/deleted account. One key on purpose — see the
  // header note on account enumeration.
  if (
    code === 'invalid_credentials' ||
    msg.includes('invalid login credentials') ||
    msg.includes('invalid credentials') ||
    status === 400
  ) {
    return 'authError.invalidCredentials';
  }

  return 'authError.generic';
}
