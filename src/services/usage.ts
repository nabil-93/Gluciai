import { isDemoMode, supabase } from '@/lib/supabase';
import { useAppStore } from '@/store/useAppStore';
import type { UsageFeature, UsagePeriod, UsageStat } from '@/types';

/** The four AI features that carry a usage limit, in display order. */
export const USAGE_FEATURES: UsageFeature[] = ['scanner', 'ai_chat', 'ai_call', 'labs'];

/**
 * Fetch the signed-in user's live quota status (my_usage_status RPC, migration
 * 0020) and cache it in the store. On any failure it keeps — and returns — the
 * last known snapshot, so a transient network error never wrongly blocks a
 * feature (quota checks fail open, like the feature locks).
 */
export async function refreshUsage(): Promise<UsageStat[]> {
  if (isDemoMode || !supabase) return useAppStore.getState().usage;
  try {
    const { data, error } = await supabase.rpc('my_usage_status');
    if (error || !Array.isArray(data)) return useAppStore.getState().usage;
    const usage = data as UsageStat[];
    useAppStore.getState().setUsage(usage);
    return usage;
  } catch {
    return useAppStore.getState().usage;
  }
}

/** One feature's status from a usage list. */
export function usageFor(
  list: UsageStat[],
  feature: UsageFeature
): UsageStat | undefined {
  return list.find((u) => u.feature === feature);
}

/**
 * Fetch fresh status and report whether this feature's budget is spent.
 * Used by the feature gates before entering the expensive flow. Fails open
 * (returns false) when the status can't be read.
 */
export async function isFeatureExhausted(feature: UsageFeature): Promise<boolean> {
  const list = await refreshUsage();
  return usageFor(list, feature)?.exceeded === true;
}

/**
 * Optimistically drop one unit (or `amount` minutes) off a feature's remaining
 * budget in the store, right after a successful action — so the UI reflects
 * the new count immediately without waiting for a round-trip. A later
 * refreshUsage() reconciles with the server's exact count.
 */
export function bumpUsage(feature: UsageFeature, amount = 1): void {
  const { usage, setUsage } = useAppStore.getState();
  setUsage(
    usage.map((u) => {
      if (u.feature !== feature || u.unlimited || u.limit == null) return u;
      const used = u.used + amount;
      const remaining = Math.max(0, u.limit - used);
      return { ...u, used, remaining, exceeded: used >= u.limit };
    })
  );
}

/** Thrown when an edge function refuses an action because the quota is spent. */
export class QuotaError extends Error {
  feature: UsageFeature;
  period: UsagePeriod;
  limit: number | null;
  used: number | null;
  constructor(info: {
    feature: UsageFeature;
    period?: UsagePeriod;
    limit?: number | null;
    used?: number | null;
  }) {
    super('quota_exceeded');
    this.name = 'QuotaError';
    this.feature = info.feature;
    this.period = info.period ?? 'day';
    this.limit = info.limit ?? null;
    this.used = info.used ?? null;
  }
}

/**
 * Inspect a failed `supabase.functions.invoke()` result for a 429
 * `quota_exceeded` body and turn it into a QuotaError, or null if it was a
 * different error. Handles both shapes: a parsed `data.error` and a
 * FunctionsHttpError whose Response body must be read from `error.context`.
 */
export async function asQuotaError(
  error: unknown,
  data: unknown
): Promise<QuotaError | null> {
  const body = data as { error?: string; feature?: UsageFeature; period?: UsagePeriod; limit?: number | null; used?: number | null } | null;
  if (body && body.error === 'quota_exceeded' && body.feature) {
    return new QuotaError(body as { feature: UsageFeature });
  }
  const ctx = (error as { context?: unknown } | null)?.context as
    | { json?: () => Promise<unknown> }
    | undefined;
  if (ctx && typeof ctx.json === 'function') {
    try {
      const parsed = (await ctx.json()) as {
        error?: string;
        feature?: UsageFeature;
        period?: UsagePeriod;
        limit?: number | null;
        used?: number | null;
      };
      if (parsed?.error === 'quota_exceeded' && parsed.feature) {
        return new QuotaError(parsed as { feature: UsageFeature });
      }
    } catch {
      // not a JSON quota body
    }
  }
  return null;
}
