import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';

/** Feature keys managed from the admin dashboard (feature_access table). */
export type FeatureKey = 'scanner' | 'ai_chat' | 'ai_call';

/** Every premium feature, in the order shown on the subscription screen. */
export const ALL_FEATURES: FeatureKey[] = ['scanner', 'ai_chat', 'ai_call'];

export type PlanStatus = 'free' | 'partial' | 'full';

/**
 * Derives the account's plan tier from the locked-feature list:
 *  - `free`    → every premium feature is locked (brand-new account)
 *  - `partial` → some are unlocked, some still locked (paid for a few)
 *  - `full`    → nothing is locked (complete version)
 */
export function planStatus(locked: string[]): PlanStatus {
  const lockedCount = ALL_FEATURES.filter((f) => locked.includes(f)).length;
  if (lockedCount === 0) return 'full';
  if (lockedCount >= ALL_FEATURES.length) return 'free';
  return 'partial';
}

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
