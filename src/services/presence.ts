import { AppState } from 'react-native';

import { isDemoMode, supabase } from '@/lib/supabase';

/**
 * "Dernière connexion" heartbeat. Stamps profiles.last_seen_at via the
 * touch_last_seen() RPC so the admin dashboard can show and filter patients by
 * when they last opened the app. This is more meaningful than the auth
 * last_sign_in_at, since sessions persist for weeks between real logins.
 */
let lastPing = 0;
const THROTTLE_MS = 5 * 60_000; // at most one write every 5 minutes

export async function touchLastSeen(force = false) {
  if (isDemoMode || !supabase) return;
  const now = Date.now();
  if (!force && now - lastPing < THROTTLE_MS) return;
  lastPing = now;
  try {
    const { error } = await supabase.rpc('touch_last_seen');
    if (error) lastPing = 0; // failed — let the next call retry
  } catch {
    lastPing = 0;
  }
}

/**
 * Start tracking presence: stamp once now, then again every time the app
 * returns to the foreground. Returns an unsubscribe function.
 */
export function startPresence() {
  touchLastSeen(true);
  const sub = AppState.addEventListener('change', (state) => {
    if (state === 'active') touchLastSeen();
  });
  return () => sub.remove();
}
