/**
 * A DEADLINE FOR CALLS THAT DO NOT HAVE ONE.
 *
 * `supabase.auth.signInWithPassword`, `getSession` and `signOut` wait for as
 * long as the server keeps the socket open — there is no client-side bound.
 * Anything that `await`s one of them on the way to rendering a screen can
 * therefore wait forever, and "the button does nothing" is what that looks
 * like to the patient.
 *
 * Kept as a pure leaf with no imports so it can be unit-tested on its own
 * (tests/domain/withTimeout.golden.test.ts) and reused by the auth screen and
 * the account service alike.
 */

/**
 * Resolve to `fallback` if `p` has not settled within `ms`.
 *
 * The underlying promise is NOT cancelled — nothing here can cancel a request
 * already in flight. It is simply no longer waited on, and both its
 * resolution and its rejection are swallowed afterwards so a late failure
 * cannot surface as an unhandled rejection.
 */
export function withTimeout<T>(
  p: Promise<T>,
  ms: number,
  fallback: T
): Promise<T> {
  return new Promise<T>((resolve) => {
    const timer = setTimeout(() => resolve(fallback), ms);
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      () => {
        clearTimeout(timer);
        resolve(fallback);
      }
    );
  });
}
