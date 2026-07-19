// Server-side enforcement of the per-feature usage limits (usage_limits /
// usage_default_limits, migration 0020). Every function that spends Gemini
// quota checks this BEFORE the costly call and returns 429 when the day/week/
// month budget is spent — closing the direct-API bypass, exactly like
// featureGuard.ts does for the on/off locks.
//
// The DB does all the work: usage_check(user, feature) resolves the per-user
// override → global default, counts real rows in the current period window,
// and reports whether the budget is spent. We call it with the service role.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export type QuotaFeature = 'scanner' | 'ai_chat' | 'ai_call' | 'labs';

export type QuotaState = {
  exceeded: boolean;
  limit: number | null; // null = unlimited
  used: number;
  period: 'day' | 'week' | 'month';
};

/**
 * Current quota state for one user + feature. Returns null on any lookup
 * failure so callers FAIL OPEN — a transient DB hiccup must never block a
 * paying user mid-flow (same philosophy as featureGuard.featureLocked).
 */
export async function quotaState(
  userId: string,
  feature: QuotaFeature
): Promise<QuotaState | null> {
  try {
    if (!SUPABASE_URL || !SERVICE_KEY) return null;
    const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/usage_check`, {
      method: 'POST',
      headers: {
        apikey: SERVICE_KEY,
        Authorization: `Bearer ${SERVICE_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_user: userId, p_feature: feature }),
    });
    if (!r.ok) return null;
    const j = await r.json();
    if (!j || typeof j !== 'object') return null;
    return {
      exceeded: j.exceeded === true,
      limit: j.limit === null || j.limit === undefined ? null : Number(j.limit),
      used: Number(j.used ?? 0),
      period: (j.period ?? 'day') as QuotaState['period'],
    };
  } catch {
    return null; // fail open
  }
}

/** True only when the DB confirms the budget is spent (fail-open otherwise). */
export async function quotaExceeded(
  userId: string,
  feature: QuotaFeature
): Promise<boolean> {
  const s = await quotaState(userId, feature);
  return s?.exceeded === true;
}

/** Standard 429 body the app understands (services/ai.ts maps it to the quota screen). */
export function quotaResponse(
  feature: QuotaFeature,
  state: QuotaState | null,
  corsHeaders: Record<string, string>
): Response {
  return new Response(
    JSON.stringify({
      error: 'quota_exceeded',
      feature,
      period: state?.period ?? 'day',
      limit: state?.limit ?? null,
      used: state?.used ?? null,
    }),
    { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );
}
