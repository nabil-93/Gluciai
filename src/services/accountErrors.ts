/**
 * ACCOUNT-ACTION ERRORS — what the patient is allowed to be shown when
 * deleting their account or changing their password.
 *
 * WHAT WAS WRONG. `profile-edit.tsx` rendered `r.error` directly:
 *
 *   notify(t('profile.error'), r.error ?? '')                 // deletion
 *   setPwMsg({ ok: false, text: r.error ?? t('profile.error') })  // password
 *
 * `ActionResult.error` is filled from `error.message` (Supabase), `String(e)`
 * (a raw thrown value, which can carry a stack or internal detail) and — for
 * deletion — the edge function's own body, which includes `delErr.message` and
 * a `detail` array naming storage buckets. So a failed erasure could show the
 * patient an English sentence naming backend internals, on an Arabic screen.
 *
 * This is BUG-A3 again, one surface over. The fix is deliberately the same
 * shape as `authErrors.ts`: map the CONDITION to an i18n key, let the screen
 * translate it in whatever language is active, and never display the original.
 *
 * WHAT THIS DOES NOT DO. It changes no deletion or password behaviour. The
 * same calls fail in the same way, `deleteAccount` still returns `ok: false`
 * on exactly the same conditions, and the security model is untouched:
 * self-only deletion, JWT authorization, storage removed before the auth user.
 * It decides only what the patient READS. The original string stays on
 * `ActionResult.error` so callers can still log it in development.
 *
 * DELIBERATELY COARSE. `storageCleanupFailed` is the one condition worth
 * naming on its own, because it is the only failure where the account still
 * EXISTS and retrying is the right move — the edge function returns 500
 * without deleting the user precisely so the patient is not told their data is
 * gone while their photos are still served. Everything else falls to
 * `generic`, which is honest ("it did not work, try again") without leaking
 * why. Being vague about the rest is the point, not a shortcoming.
 */

/** The i18n keys this module is allowed to select. */
export type AccountErrorKey =
  | 'accountError.network'
  | 'accountError.sessionExpired'
  | 'accountError.storageCleanupFailed'
  | 'accountError.weakPassword'
  | 'accountError.samePassword'
  | 'accountError.rateLimited'
  | 'accountError.generic';

/** Anything an account action may fail with. */
export interface AccountErrorLike {
  message?: unknown;
  code?: unknown;
  status?: unknown;
  name?: unknown;
  /** `ActionResult.error` — already flattened to a string by the service. */
  error?: unknown;
}

/**
 * Which key describes this failure.
 *
 * Accepts either a thrown error or an `ActionResult`, because the deletion
 * path flattens the edge function's response into `ActionResult.error` before
 * the screen ever sees it. Matching is on lowercased substrings for the same
 * reason as `authErrors.ts`: Supabase does not expose a stable machine code
 * for every case. Anything unrecognised falls to `generic` rather than
 * leaking the original text.
 */
export function accountErrorKey(
  e: AccountErrorLike | string | null | undefined
): AccountErrorKey {
  if (!e) return 'accountError.generic';

  // A bare string is what `ActionResult.error` carries.
  const obj: AccountErrorLike = typeof e === 'string' ? { message: e } : e;

  const text = [
    typeof obj.message === 'string' ? obj.message : '',
    typeof obj.error === 'string' ? obj.error : '',
  ]
    .filter(Boolean)
    .join(' ')
    .trim()
    .toLowerCase();
  const code = typeof obj.code === 'string' ? obj.code.toLowerCase() : '';
  const status = typeof obj.status === 'number' ? obj.status : undefined;
  const name = typeof obj.name === 'string' ? obj.name.toLowerCase() : '';

  // Offline / DNS / fetch failure. Checked first: a network failure can
  // surface with no useful message at all.
  if (
    name === 'typeerror' ||
    text.includes('network request failed') ||
    text.includes('failed to fetch') ||
    text.includes('networkerror') ||
    text.includes('failed to send a request') ||
    code === 'enotfound' ||
    code === 'econnrefused'
  ) {
    return 'accountError.network';
  }

  if (status === 429 || code === 'over_request_rate_limit' || text.includes('rate limit')) {
    return 'accountError.rateLimited';
  }

  /*
   * The account still EXISTS and a retry is the correct action. The edge
   * function returns this before touching `auth.users`, so nothing has been
   * deleted yet. Its `detail` array names storage buckets — which is exactly
   * the kind of internal the patient must not read, so only this key travels.
   */
  if (
    text.includes('could not delete stored files') ||
    text.includes('storage')
  ) {
    return 'accountError.storageCleanupFailed';
  }

  // The session is gone (or was never valid): the edge function's 401s.
  if (
    status === 401 ||
    code === 'session_not_found' ||
    text.includes('not authenticated') ||
    text.includes('invalid session') ||
    text.includes('jwt expired') ||
    text.includes('session from session_id claim in jwt does not exist')
  ) {
    return 'accountError.sessionExpired';
  }

  // `changePassword` returns the sentinel 'weak' rather than a message; the
  // service's own local check runs before the network call.
  if (
    text === 'weak' ||
    code === 'weak_password' ||
    text.includes('password should be at least') ||
    text.includes('weak password')
  ) {
    return 'accountError.weakPassword';
  }

  if (
    code === 'same_password' ||
    text.includes('should be different from the old password') ||
    text.includes('new password should be different')
  ) {
    return 'accountError.samePassword';
  }

  return 'accountError.generic';
}
