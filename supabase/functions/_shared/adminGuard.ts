// Shared guard for OFFLINE-TOOLING edge functions (enrich-dishes,
// gen-dish-image…). Platform verify_jwt only checks the JWT signature — the
// public anon key passes it — so these must not be callable by app users.
// Allowed callers: the service-role key itself (scripts) or a signed-in
// ADMIN user (profiles.role = 'admin').

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

export async function isAdminCaller(req: Request): Promise<boolean> {
  try {
    const jwt = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
    if (!jwt || !SUPABASE_URL || !SERVICE_KEY) return false;
    if (jwt === SERVICE_KEY) return true; // offline scripts use the service key

    // Otherwise the JWT must belong to a signed-in admin user.
    const r = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${jwt}` },
    });
    if (!r.ok) return false;
    const u = await r.json();
    if (!u?.id) return false;

    const p = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?user_id=eq.${u.id}&select=role`,
      { headers: { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` } }
    );
    if (!p.ok) return false;
    const rows = await p.json();
    return Array.isArray(rows) && rows[0]?.role === 'admin';
  } catch {
    return false;
  }
}
