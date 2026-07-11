import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';

/** Feature keys managed from the admin dashboard (feature_access table). */
export type FeatureKey = 'scanner' | 'ai_chat' | 'ai_call';

/**
 * Pulls the per-user feature locks set from the admin dashboard.
 * No row (or allowed=true) means the feature is available — locks are the
 * exception, so a fetch failure silently keeps the last known state.
 */
export async function refreshFeatureLocks() {
  if (isDemoMode || !supabase) return;
  try {
    const { data: userData } = await supabase.auth.getUser();
    const uid = userData.user?.id;
    if (!uid) return;
    const { data, error } = await supabase
      .from('feature_access')
      .select('feature, allowed')
      .eq('user_id', uid);
    if (error) return;
    const locked = (data ?? [])
      .filter((r) => r.allowed === false)
      .map((r) => r.feature as string);
    useAppStore.getState().setLockedFeatures(locked);
  } catch {
    // offline — keep the persisted state
  }
}
