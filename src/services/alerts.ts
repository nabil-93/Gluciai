import { isDemoMode, supabase } from '@/lib/supabase';

/** Contact button shown under an alert (mirrors app_alerts.cta). */
export type AlertCta = 'none' | 'support' | 'doctor';

/** An alert the admin/doctor pushed to this patient from the dashboard. */
export interface AppAlertData {
  id: string;
  title: string | null;
  body: string;
  cta: AlertCta;
}

/**
 * The oldest still-unseen alert for the signed-in patient — what the app must
 * surface on open (covers alerts sent while the app was closed).
 */
export async function fetchPendingAlert(): Promise<AppAlertData | null> {
  if (isDemoMode || !supabase) return null;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return null;
    const { data } = await supabase
      .from('app_alerts')
      .select('id, title, body, cta')
      .eq('user_id', uid)
      .eq('status', 'sent')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    return (data as AppAlertData | null) ?? null;
  } catch {
    return null;
  }
}

/** Acknowledge an alert so it never shows again. */
export async function markAlertSeen(id: string): Promise<void> {
  if (isDemoMode || !supabase) return;
  try {
    await supabase
      .from('app_alerts')
      .update({ status: 'seen', seen_at: new Date().toISOString() })
      .eq('id', id);
  } catch {
    // Ignore: if it fails the alert simply reappears next open — acceptable.
  }
}

/**
 * Realtime subscription for alerts arriving while the app is open, so they
 * pop up instantly. Returns an unsubscribe function.
 */
export function subscribeToAlerts(
  uid: string,
  onInsert: (a: AppAlertData) => void
): () => void {
  if (isDemoMode || !supabase) return () => {};
  const channel = supabase
    .channel(`app_alerts:${uid}`)
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'app_alerts',
        filter: `user_id=eq.${uid}`,
      },
      (payload) => onInsert(payload.new as AppAlertData)
    )
    .subscribe();
  return () => {
    supabase?.removeChannel(channel);
  };
}
