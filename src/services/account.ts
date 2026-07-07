import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import { saveProfile } from './data';

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
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
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

/** Sign out of Supabase and wipe all local state. */
export async function signOut(): Promise<void> {
  try {
    if (!isDemoMode && supabase) await supabase.auth.signOut();
  } finally {
    useAppStore.getState().resetAll();
  }
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
    return { ok: true };
  }
  try {
    const { error } = await supabase.functions.invoke('delete-account');
    if (error) return { ok: false, error: error.message };
    await supabase.auth.signOut().catch(() => {});
    useAppStore.getState().resetAll();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
