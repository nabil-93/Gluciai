import {
  clearAuthStorage,
  currentUserId,
  isDemoMode,
  setCachedUserId,
  supabase,
  withTimeout,
} from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { useProgramStore } from '@/store/useProgramStore';
import { saveProfile } from './data';
import { clearPendingRegistration } from './pendingRegistration';

/* ────────────────────────────────────────────────────────────
 * ACCOUNT SERVICE
 * Avatar upload, password change, sign-out and account deletion.
 * Everything degrades gracefully in demo mode (no Supabase).
 * ──────────────────────────────────────────────────────────── */

/** Result shape for actions the UI shows success/error for. */
export interface ActionResult {
  ok: boolean;
  error?: string;
}

/* ─────────────────────────── AVATAR ─────────────────────────── */

/**
 * Upload a picked image (its base64 data) to the `profile-images` bucket
 * under the user's folder (RLS requires the first path segment to be the
 * user id), then persist its public URL on the profile. Returns the new URL
 * or null; the caller keeps the local preview regardless.
 *
 * `localUri` is used as the on-device fallback (demo mode / upload failure)
 * so the avatar preview always sticks.
 */
export async function uploadAvatar(
  localUri: string,
  base64?: string
): Promise<string | null> {
  const profile = useAppStore.getState().profile;
  if (!profile) return null;

  // Demo mode / no data: keep the local URI so the preview persists.
  if (isDemoMode || !supabase || profile.user_id === 'demo-user' || !base64) {
    await saveProfile({ ...profile, avatar_url: localUri });
    return localUri;
  }

  try {
    const uid = await currentUserId();
    if (!uid) {
      await saveProfile({ ...profile, avatar_url: localUri });
      return localUri;
    }

    const bytes = decodeBase64(base64);
    const path = `${uid}/avatar-${Date.now()}.jpg`;
    const { error: upErr } = await supabase.storage
      .from('profile-images')
      .upload(path, bytes, { contentType: 'image/jpeg', upsert: true });
    if (upErr) {
      // Upload failed → still keep the local preview.
      await saveProfile({ ...profile, avatar_url: localUri });
      return localUri;
    }

    const { data: pub } = supabase.storage
      .from('profile-images')
      .getPublicUrl(path);
    const url = pub.publicUrl;
    await saveProfile({ ...profile, avatar_url: url });
    return url;
  } catch {
    await saveProfile({ ...profile, avatar_url: localUri });
    return localUri;
  }
}

/** Base64 → Uint8Array (atob is available on RN/Hermes and web). */
function decodeBase64(b64: string): Uint8Array {
  const binary = globalThis.atob(b64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/* ─────────────────────── CHANGE PASSWORD ────────────────────── */

/**
 * Update the signed-in user's password via Supabase auth. Requires a live
 * session (email/password account). No-op success in demo mode.
 */
export async function changePassword(
  newPassword: string
): Promise<ActionResult> {
  if (newPassword.length < 6) {
    return { ok: false, error: 'weak' };
  }
  if (isDemoMode || !supabase) return { ok: true };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/* ────────────────────────── SIGN OUT ────────────────────────── */

/** How long the server-side revoke may hold the screen before we stop
 *  waiting for it. Long enough for a healthy round-trip, short enough that
 *  the patient never wonders whether the button worked. */
const SIGN_OUT_REVOKE_TIMEOUT_MS = 4000;

/**
 * Sign out. Local first, and unconditionally.
 *
 * WHAT WAS WRONG. This awaited `supabase.auth.signOut()` and only wiped the
 * device in the `finally`. Two failures came out of that ordering:
 *
 *  1. NOTHING HAPPENED FOR AS LONG AS THE SERVER TOOK. The call has no
 *     deadline of its own, so a slow or unanswering `/auth/v1/logout` froze
 *     the profile screen with no feedback. The patient taps again, and again.
 *  2. A FAILED REVOKE LEFT THEM SIGNED IN. supabase-js revokes the token
 *     before it deletes the local copy, and it RETURNS EARLY on a network
 *     error — so the stored session survived a sign-out that reported no
 *     problem, and the next launch signed the same account straight back in.
 *     On a shared phone that is the previous person's data opening by itself.
 *
 * Now: the device forgets the account immediately (local, instant, cannot
 * fail), the stored session is deleted by hand so nothing can resurrect it,
 * and the server-side revoke is attempted with a bound. The revoke still
 * matters — it is what kills the refresh token on other devices — but it is
 * no longer what decides whether this one is signed out.
 */
export async function signOut(): Promise<void> {
  // 1. Forget the account here, first and always.
  useAppStore.getState().resetAll();
  // The parcours lives in its own store, so resetAll() does not reach it.
  // Leaving it behind showed the next account this one's program.
  useProgramStore.getState().adoptUser(null);
  // A half-finished registration holds a password in memory. Signing out is
  // an explicit "not this person any more", so it must not survive.
  clearPendingRegistration();
  setCachedUserId(null);

  if (isDemoMode || !supabase) return;

  // 2. Ask the server to revoke, but do not let it hold the screen. `local`
  //    scope: this device's refresh token, which is the one being abandoned.
  await withTimeout(
    supabase.auth.signOut({ scope: 'local' }).then(() => undefined),
    SIGN_OUT_REVOKE_TIMEOUT_MS,
    undefined
  );

  // 3. Whatever came back — success, error, or a request still in flight —
  //    the session must not be on this device any more.
  await clearAuthStorage();
}

/* ──────────────────────── DELETE ACCOUNT ─────────────────────── */

/**
 * Permanently delete the account. Deleting an auth user requires the
 * service-role key, so it runs in the `delete-account` edge function; here
 * we just call it with the user's session, then wipe local state.
 */
export async function deleteAccount(): Promise<ActionResult> {
  if (isDemoMode || !supabase) {
    useAppStore.getState().resetAll();
    useProgramStore.getState().adoptUser(null);
    return { ok: true };
  }
  try {
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) return { ok: false, error: error.message };
    // The account is gone server-side; the teardown below is the same
    // bounded, always-completes one sign-out uses, so a slow revoke cannot
    // leave a deleted account's session sitting on the phone.
    await signOut();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
