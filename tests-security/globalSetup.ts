import { createClient } from '@supabase/supabase-js';

import {
  ANON_KEY,
  SERVICE_ROLE_KEY,
  SUPABASE_URL,
  TEST_EMAIL_DOMAIN,
  assertLocalTarget,
  decodeJwtClaims,
} from './_env';

/**
 * SECURITY SUITE — production interlock, phases 1 and 2.
 *
 * Ordering is the whole point:
 *
 *   PHASE 0  static string checks, no I/O            (_env.assertLocalTarget)
 *   PHASE 1  connect and READ only — never a write
 *   PHASE 2  mutation gate — only now may the suite create anything
 *
 * A sentinel row cannot gate the write that creates it, so PHASE 2 does not
 * require one on a virgin database: the precondition is that `auth.users` is
 * either EMPTY or contains only this suite's own @glucoai.test identities.
 * A hosted project can satisfy neither. Nothing is written before that holds.
 *
 * Every failure path throws. There is no branch where an inconclusive check is
 * treated as safe.
 */
export default async function setup(): Promise<void> {
  // ── PHASE 0 ──────────────────────────────────────────────────────────────
  assertLocalTarget();

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // ── PHASE 1 — read-only probe ────────────────────────────────────────────
  const { data: listed, error: listErr } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  if (listErr) {
    throw new Error(
      `[SECURITY GUARD] Read-only probe failed — cannot establish that the target is safe. ` +
        `Is the local stack running (\`npx supabase start\`)? Underlying error: ${listErr.message}`
    );
  }

  const users = listed?.users ?? [];
  const foreign = users.filter(
    (u) => !(u.email ?? '').toLowerCase().endsWith(`@${TEST_EMAIL_DOMAIN}`)
  );

  // ── PHASE 2 — mutation gate ──────────────────────────────────────────────
  if (foreign.length > 0) {
    throw new Error(
      `[SECURITY GUARD] Target database holds ${foreign.length} account(s) that this suite did ` +
        `not create. A local test database contains only @${TEST_EMAIL_DOMAIN} identities. ` +
        `Refusing to mutate. If this really is your local stack, run \`npx supabase db reset --local\`.`
    );
  }

  // Confirms the anon key is what the app would use, and that it is anon.
  const anonClaims = decodeJwtClaims(ANON_KEY);
  if (anonClaims?.role !== 'anon') {
    throw new Error(
      `[SECURITY GUARD] The anon key does not carry role "anon" (got ${String(anonClaims?.role)}).`
    );
  }

  // Only now is mutation permitted. Leave a marker so later runs re-confirm
  // against a database that is demonstrably ours, without ever having needed
  // the marker to exist on the first run.
  process.env.__GLUCOAI_SECURITY_SUITE_ARMED__ = '1';
}
