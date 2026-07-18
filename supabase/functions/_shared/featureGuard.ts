// Server-side enforcement of the dashboard's feature locks (feature_access).
//
// Platform verify_jwt only checks the JWT SIGNATURE — the public anon key
// passes it — so every function that spends Gemini quota must itself require
// a real signed-in user, and honor the admin's locks. The client already
// gates the UI (services/features.ts); this closes the direct-API bypass.

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

/** One feature_access row via service role; null = lookup failed (outage). */
async function featureRow(
  userId: string,
  feature: string
): Promise<{ allowed: boolean } | 'none' | null> {
  try {
    const r = await fetch(
      `${SUPABASE_URL}/rest/v1/feature_access?user_id=eq.${userId}&feature=eq.${feature}&select=allowed`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!r.ok) return null;
    const rows = await r.json();
    if (!Array.isArray(rows)) return null;
    return rows.length === 0 ? 'none' : { allowed: rows[0]?.allowed === true };
  } catch {
    return null;
  }
}

/**
 * LOCKABLE features (scanner, ai_chat, ai_call): no row = allowed, a row
 * with allowed=false = locked. Fail-open on lookup outage so a hiccup never
 * blocks paying users mid-flow.
 */
export async function featureLocked(userId: string, feature: string): Promise<boolean> {
  const row = await featureRow(userId, feature);
  if (row === null || row === 'none') return false;
  return row.allowed === false;
}

/**
 * HIDDEN allowlist features (labs): they exist for NOBODY unless the admin
 * wrote an explicit allowed=true row. No row = denied. Only a lookup outage
 * fails open (a granted user must not be cut off by a transient error).
 */
export async function featureGranted(userId: string, feature: string): Promise<boolean> {
  const row = await featureRow(userId, feature);
  if (row === null) return true; // outage → don't block legitimately granted users
  if (row === 'none') return false;
  return row.allowed === true;
}
