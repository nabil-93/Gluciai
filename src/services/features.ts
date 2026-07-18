import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';

/** Feature keys managed from the admin dashboard (feature_access table). */
export type FeatureKey = 'scanner' | 'ai_chat' | 'ai_call';

/** Every premium feature, in the order shown on the subscription screen. */
export const ALL_FEATURES: FeatureKey[] = ['scanner', 'ai_chat', 'ai_call'];

/**
 * HIDDEN features work the opposite way of the lockable ones above: they
 * exist for NOBODY unless the admin explicitly grants them (a
 * feature_access row with allowed=true). They never appear on the
 * subscription screen, never show a "locked" teaser, and leave no trace
 * in the UI for non-granted accounts. Currently: 'labs' (lab analyses).
 */
export const HIDDEN_FEATURES = ['labs'] as const;

/**
 * HIDEABLE content sections — VISIBLE to everyone by default, but the admin
 * can hide any of them per patient from the dashboard (a feature_access row
 * with allowed=false). Unlike the premium locks above they show NO "locked"
 * teaser and don't count toward the plan tier: the entry point simply
 * disappears from the app and the screen silently redirects home. They ride
 * on the same `lockedFeatures` list (allowed=false) as the premium locks.
 *  - healthy_selection → "Sélection Santé" (curated dishes)
 *  - world_foods       → "Base Mondiale" (Open Food Facts search)
 *  - world_recipes     → "Plats du monde" (AI world recipes)
 */
export const HIDEABLE_SECTIONS = [
  'healthy_selection',
  'world_foods',
  'world_recipes',
] as const;
export type HideableSection = (typeof HIDEABLE_SECTIONS)[number];

/** True when the admin hid `section` for this account. */
export function isSectionHidden(locked: string[], section: HideableSection) {
  return locked.includes(section);
}

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
    // Hidden features (allowlist): only an explicit allowed=true row from
    // the admin dashboard reveals them.
    const granted = (data ?? [])
      .filter(
        (r) =>
          r.allowed === true &&
          (HIDDEN_FEATURES as readonly string[]).includes(r.feature)
      )
      .map((r) => r.feature as string);
    useAppStore.getState().setGrantedFeatures(granted);
  } catch {
    // offline — keep the persisted state
  }
}
