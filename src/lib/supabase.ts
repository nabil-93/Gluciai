import { createClient, SupabaseClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, Platform } from 'react-native';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '';

/**
 * Demo mode: when Supabase isn't configured the app still runs with local
 * mock data so the UI can be previewed (e.g. first Vercel deploy).
 */
export const isDemoMode = !supabaseUrl || !supabaseAnonKey;

/** `ftqyzpkzqeudzfztataz` out of `https://ftqyzpkzqeudzfztataz.supabase.co`. */
const projectRef = supabaseUrl.match(/^https?:\/\/([^.]+)\./)?.[1] ?? 'local';

/**
 * The key supabase-js persists the session under.
 *
 * This is spelled out rather than left to the default because `signOut()` can
 * fail to remove it (see `clearAuthStorage` below) and we need to be able to
 * delete it ourselves. The value is EXACTLY what supabase-js would have
 * derived on its own — changing this string would sign every existing user
 * out on the next deploy.
 */
export const AUTH_STORAGE_KEY = `sb-${projectRef}-auth-token`;

export const supabase: SupabaseClient | null = isDemoMode
  ? null
  : createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        storage: Platform.OS === 'web' ? undefined : AsyncStorage,
        storageKey: AUTH_STORAGE_KEY,
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: Platform.OS === 'web',
      },
    });

/* ─────────────────────── AUTO-REFRESH ON NATIVE ───────────────────────
 * On the web the refresh timer runs for as long as the tab lives. On a phone
 * the process is frozen the moment the app goes to the background, so the
 * timer that should have refreshed the token never fires — and the patient
 * comes back to an access token that expired hours ago. Every request then
 * pays a refresh round-trip before it can start, which is exactly what "the
 * app is slow when I reopen it" looks like.
 *
 * supabase-js exposes start/stopAutoRefresh for this; it is the documented
 * React Native wiring and has to be done by the app, not the library. */
if (supabase && Platform.OS !== 'web') {
  const applyFocus = (state: string) => {
    if (state === 'active') void supabase.auth.startAutoRefresh();
    else void supabase.auth.stopAutoRefresh();
  };
  applyFocus(AppState.currentState ?? 'active');
  AppState.addEventListener('change', applyFocus);
}

/* ───────────────────────── WHO IS SIGNED IN ─────────────────────────
 * `supabase.auth.getUser()` is a NETWORK call: every caller pays a full
 * round-trip to /auth/v1/user just to learn the id it already has in the JWT
 * sitting in local storage. The app called it from ~18 places — several of
 * them on every launch and several in parallel — so a single cold start fired
 * five or six identical requests before a byte of the patient's data was
 * asked for.
 *
 * `currentUserId()` reads the session that is already on the device instead,
 * and remembers it. The id is used for one thing only: filling the `user_id`
 * filter on queries. What a client CLAIMS its id is has never been what
 * protects a row — RLS re-derives the identity from the JWT server-side on
 * every request — so trusting the local copy here weakens nothing. A tampered
 * token would simply fail server-side, exactly as before.
 */
let cachedUserId: string | null = null;
let userIdProbe: Promise<string | null> | null = null;

supabase?.auth.onAuthStateChange((_event, session) => {
  cachedUserId = session?.user?.id ?? null;
});

/**
 * The signed-in user's id, or null. Local and (after the first call) free.
 * Never throws.
 */
export async function currentUserId(): Promise<string | null> {
  if (!supabase) return null;
  if (cachedUserId) return cachedUserId;
  if (!userIdProbe) {
    userIdProbe = supabase.auth
      .getSession()
      .then(({ data }) => {
        cachedUserId = data.session?.user?.id ?? null;
        return cachedUserId;
      })
      .catch(() => null)
      .finally(() => {
        userIdProbe = null;
      });
  }
  return userIdProbe;
}

/** Seed/forget the cache without waiting for the auth event to land. */
export function setCachedUserId(uid: string | null): void {
  cachedUserId = uid;
}

/**
 * The signed-in user object from the LOCAL session — id, email and the
 * `user_metadata` captured at sign-up. Same trade as `currentUserId`: read
 * from the device instead of asking the server to read the token back to us.
 */
export async function currentUser(): Promise<{
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
} | null> {
  if (!supabase) return null;
  try {
    const { data } = await supabase.auth.getSession();
    const u = data.session?.user;
    return u
      ? { id: u.id, email: u.email, user_metadata: u.user_metadata }
      : null;
  } catch {
    return null;
  }
}

/**
 * Is there a persisted session on this device — valid or not?
 *
 * Deliberately NOT `getSession()`. That one refreshes an expired token, and
 * with no network the refresh fails and it answers `null` — indistinguishable
 * from "never signed in". Anything that reacts to a missing session by
 * sending the patient to the login screen must not fire on a plane or in a
 * lift: the app is offline-first and their history is on the device.
 *
 * This reads the raw stored value instead, so the answer is about what the
 * device HAS, not about what the network can confirm right now.
 */
export async function hasStoredSession(): Promise<boolean> {
  if (!supabase) return false;
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return false;
      return Object.keys(localStorage).some(
        (k) => k === AUTH_STORAGE_KEY || k.startsWith(`${AUTH_STORAGE_KEY}.`)
      );
    }
    return (await AsyncStorage.getItem(AUTH_STORAGE_KEY)) !== null;
  } catch {
    // Unreadable storage is not proof of a signed-out user — assume signed in
    // and let the server refuse the requests.
    return true;
  }
}

/* ──────────────────────────── TIMEOUTS ──────────────────────────── */

/* Re-exported so `@/lib/supabase` stays the one import auth callers need.
 * The implementation is a pure leaf (no react-native, no client) precisely so
 * it can be unit-tested on its own. */
export { withTimeout } from './withTimeout';

/* ─────────────────────── FORCED SIGN-OUT ─────────────────────── */

/**
 * Delete the persisted session by hand.
 *
 * WHY THIS EXISTS. `supabase.auth.signOut()` revokes the token on the server
 * FIRST and only removes the local copy afterwards — and it returns early on
 * a network failure, before the removal. So a sign-out attempted with no
 * connection (or against a server that is not answering) leaves the session
 * on the device: the patient is told they are signed out, and the next launch
 * silently signs them back in. On a shared phone that is the previous user's
 * account opening by itself.
 *
 * Sign-out must be something the device can always do alone. The server-side
 * revoke is still attempted — it is what invalidates the refresh token
 * everywhere — but it is no longer what decides whether the patient is
 * signed out here.
 */
export async function clearAuthStorage(): Promise<void> {
  const keys = [AUTH_STORAGE_KEY, `${AUTH_STORAGE_KEY}-code-verifier`];
  try {
    if (Platform.OS === 'web') {
      if (typeof localStorage === 'undefined') return;
      // supabase-js splits a large session across `<key>.0`, `<key>.1`, …
      const all = Object.keys(localStorage).filter(
        (k) => k === keys[0] || k === keys[1] || k.startsWith(`${AUTH_STORAGE_KEY}.`)
      );
      for (const k of all) localStorage.removeItem(k);
    } else {
      await AsyncStorage.multiRemove(keys);
    }
  } catch {
    // Nothing else to try; the in-memory session is dropped by the caller.
  }
  cachedUserId = null;
}
