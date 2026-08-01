import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { ANON_KEY, SUPABASE_URL } from '../_env';
import { admin, createUser, deleteUser, type TestUser } from '../_users';

/**
 * BOUNDARY — Edge Function callers.
 *
 * The load-bearing fact, stated by the project's own `_shared/adminGuard.ts`:
 *
 *   "Platform verify_jwt only checks the JWT signature — the public anon key
 *    passes it — so these must not be callable by app users."
 *
 * So `verify_jwt` is NOT authentication. Every function that spends money or
 * touches data must re-check the caller itself. These tests characterize which
 * ones do, and which rely on the platform check alone.
 *
 * Local edge runtime only (127.0.0.1:54321). No secrets are configured here,
 * so a function that gets PAST its auth gate may fail later for missing keys —
 * that is fine and expected: this suite asserts the GATE, not the feature.
 *
 * STEP 15 moved four fixtures in this file. Each one keeps its BEFORE state in
 * the comment above it, and every before/after pair is tabulated in
 * docs/KNOWN-BAD-BASELINE.md — the fixtures were run green against the old code
 * first. What is still KNOWN-BAD is labelled as such and left red-flagged.
 */

const FN = (name: string) => `${SUPABASE_URL}/functions/v1/${name}`;

async function call(
  name: string,
  bearer: string | null,
  body: unknown = {}
): Promise<{ status: number; text: string }> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (bearer) headers.Authorization = `Bearer ${bearer}`;
  const res = await fetch(FN(name), { method: 'POST', headers, body: JSON.stringify(body) });
  return { status: res.status, text: (await res.text()).slice(0, 400) };
}

const ALL_FUNCTIONS = [
  'ai-chat',
  'analyze-meal',
  'lab-analyze',
  'tts',
  'live-token',
  'world-recipes',
  'admin-ops',
  'delete-account',
  'enrich-dishes',
  'gen-dish-image',
  'food-search',
  'nutrition-search',
] as const;

let patient: TestUser;

beforeAll(async () => {
  patient = await createUser('fn-patient');
});

afterAll(async () => {
  await deleteUser(patient.id);
});

describe('no credentials at all', () => {
  it.each(ALL_FUNCTIONS)('%s rejects a request with no Authorization header', async (name) => {
    const { status } = await call(name, null);
    expect(status).toBe(401);
  });

  it.each(ALL_FUNCTIONS)('%s rejects a garbage bearer token', async (name) => {
    const { status } = await call(name, 'not-a-jwt');
    expect(status).toBe(401);
  });
});

describe('the anon key satisfies the platform gate — so each function re-checks', () => {
  /**
   * P3/P4 (edge-function caller trust) — the PREMISE, which Step 15 did not and
   * cannot change.
   *
   * The anon key ships inside the published web bundle and the mobile app, so
   * it is public by construction. Presented as a bearer token it passes the
   * platform's `verify_jwt`, which means the platform check is a signature
   * check, not an authentication check. What Step 15 changed is that no
   * function relies on it any more.
   *
   * BEFORE Step 15 this block could only characterize `admin-ops` and
   * `delete-account`: `food-search` and `nutrition-search` had no caller check
   * at all, and `analyze-meal` answered its missing provider secret first.
   */
  it('functions that re-check the caller reject the bare anon key', async () => {
    // Limited to functions whose auth check is REACHABLE on this stack.
    // ai-chat / lab-analyze / tts / live-token still short-circuit on a missing
    // provider secret before authenticating (P4-b's remaining surface, below),
    // so including them here would assert an environment artifact rather than a
    // trust decision.
    const guarded = [
      'admin-ops',
      'delete-account',
      'world-recipes',
      'analyze-meal', // Step 15: authenticates before the config guard
      'food-search', // Step 15: gained a caller check
      'nutrition-search', // Step 15: gained a caller check
    ];
    for (const name of guarded) {
      const { status } = await call(name, ANON_KEY);
      expect(status, `${name} should reject the anon key`).toBe(401);
    }
  });

  it('functions with no AI dependency reject the bare anon key', async () => {
    // These reach their own auth check with no provider secret involved at all,
    // so their verdict is a pure trust decision.
    for (const name of ['admin-ops', 'delete-account', 'food-search', 'nutrition-search']) {
      expect((await call(name, ANON_KEY)).status, `${name}`).toBe(401);
    }
  });

  /**
   * ENVIRONMENT LIMIT — not a security verdict.
   *
   * ai-chat / lab-analyze / tts / live-token answer 500 ("AI is not configured
   * (missing GEMINI_API_KEY)") because no provider secrets are set on the local
   * stack. That guard runs BEFORE their auth check, so their disposition toward
   * the anon key CANNOT be characterized here. Recorded so nobody mistakes a
   * local 500 for a rejection.
   *
   * `analyze-meal` was in that list until Step 15 reordered it; the other four
   * were deliberately left alone (see the KNOWN-BAD block below).
   */
  it('records the anon-key disposition, separating verdicts from environment noise', async () => {
    const disposition: Record<string, number> = {};
    for (const name of ALL_FUNCTIONS) {
      disposition[name] = (await call(name, ANON_KEY)).status;
    }

    expect(disposition['admin-ops']).toBe(401); // real verdict
    expect(disposition['delete-account']).toBe(401); // real verdict
    expect(disposition['world-recipes']).toBe(401); // real verdict
    expect(disposition['enrich-dishes']).toBe(403); // real verdict (admin guard)
    expect(disposition['gen-dish-image']).toBe(403); // real verdict (admin guard)

    // Step 15 — these three were the P3/P4 surface. Before: food-search ran the
    // proxy (not 401), nutrition-search answered 400, analyze-meal answered 500.
    expect(disposition['food-search']).toBe(401);
    expect(disposition['nutrition-search']).toBe(401);
    expect(disposition['analyze-meal']).toBe(401);

    // Secret-dependent: 500 here means "unconfigured", not "authorized".
    for (const name of ['ai-chat', 'lab-analyze', 'tts', 'live-token']) {
      expect([500, 401], `${name} unexpected status`).toContain(disposition[name]);
    }
    expect(Object.keys(disposition)).toHaveLength(ALL_FUNCTIONS.length);
  });
});

describe('FIXED IN STEP 15 — P3/P4: the two proxies require a real caller', () => {
  /**
   * BEFORE (recorded green against the old code — docs/KNOWN-BAD-BASELINE.md):
   *
   *   nutrition-search + bare anon key + {}        -> 400 "query is required"
   *   food-search      + bare anon key + {q:'…'}   -> anything but 401
   *
   * They were the only two Edge Functions with NO caller check of their own:
   * they read the body and called a provider. The anon key ships in the
   * published bundle, so anyone holding it could drive them — `nutrition-search`
   * spends the project's FatSecret and Edamam credentials, and `food-search`
   * carries the project's User-Agent to Open Food Facts, so abuse is
   * attributable to the project and can get it blocked. No patient data was
   * exposed by either (neither reads a user row); what was at stake is
   * third-party quota, cost, and the fallback tier of the provider chain going
   * dark for every patient if a provider rate-limits the project.
   *
   * AFTER: both call `callerUserId(req)` and answer 401 before the body is read
   * — the same helper the six already-guarded functions use.
   */
  it('nutrition-search refuses the bare anon key instead of answering it', async () => {
    const { status, text } = await call('nutrition-search', ANON_KEY, {});
    expect(status).toBe(401); // was 400
    expect(text).toContain('unauthorized');
  });

  it('food-search refuses the bare anon key before reaching Open Food Facts', async () => {
    const { status, text } = await call('food-search', ANON_KEY, { q: 'ratatouille' });
    expect(status).toBe(401); // was: anything but 401
    expect(text).toContain('unauthorized');
  });

  it('the refusal precedes the body, so an unparseable body is still 401', async () => {
    // ORDER, not just outcome: a body the JSON parser rejects would surface as
    // a 500 from `req.json()` if the caller check ran after the parse.
    for (const name of ['food-search', 'nutrition-search']) {
      const res = await fetch(FN(name), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${ANON_KEY}` },
        body: 'not json at all',
      });
      expect(res.status, `${name} must answer the gate, not the parser`).toBe(401);
    }
  });

  it('an authenticated patient still reaches the function body', async () => {
    // The gate is authentication, not a shutdown. A missing `query` is
    // nutrition-search's own 400, reached with NO provider contact — so this
    // asserts the authenticated path without spending a credential.
    const { status, text } = await call('nutrition-search', patient.accessToken, {});
    expect(status).toBe(400);
    expect(text).toContain('query is required');
  });

  it('food-search lets an authenticated patient past the gate', async () => {
    // Deliberately an unparseable body: it proves execution got past the gate
    // and into the handler without sending a request to Open Food Facts.
    const res = await fetch(FN('food-search'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${patient.accessToken}` },
      body: 'not json at all',
    });
    expect(res.status).not.toBe(401);
    expect(await res.text()).not.toContain('unauthorized');
  });

  it('the CORS preflight stays unauthenticated, as the browser requires', async () => {
    for (const name of ['food-search', 'nutrition-search']) {
      const res = await fetch(FN(name), { method: 'OPTIONS' });
      expect(res.status, `${name} preflight`).toBe(200);
    }
  });
});

/** A real 1×1 PNG — a valid `image_base64`, so validation cannot be the reason
 *  a request is refused. */
const PNG_1X1 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('FIXED IN STEP 15 — P4-b: analyze-meal authenticates first', () => {
  /**
   * BEFORE (recorded green against the old code — docs/KNOWN-BAD-BASELINE.md):
   *
   *   analyze-meal answered identically — 500 with
   *   `{"error":"AI is not configured (missing GEMINI_API_KEY)"}` — whether the
   *   caller presented a real patient JWT or only the PUBLIC anon key, and a
   *   malformed body yielded 400 even for a patient whose scanner was LOCKED.
   *   The config guard and the input validation both ran before the `!uid`
   *   check and before the feature lock, so an unauthenticated caller could
   *   observe server configuration state and drive input validation.
   *
   * That was never an auth bypass in production — where the key is set, the
   * guard does not fire and execution proceeds to the 401. What moved is the
   * ORDERING: caller → feature lock → quota → body validation → config.
   */
  it('an unauthenticated caller gets 401, not a configuration error', async () => {
    const anon = await call('analyze-meal', ANON_KEY, { image_base64: PNG_1X1 });
    expect(anon.status).toBe(401); // was 500
    expect(anon.text).not.toContain('not configured'); // no config disclosure
  });

  it('a real patient and the public key are no longer indistinguishable', async () => {
    const anon = await call('analyze-meal', ANON_KEY, { image_base64: PNG_1X1 });
    const authed = await call('analyze-meal', patient.accessToken, { image_base64: PNG_1X1 });

    expect(anon.status).toBe(401);
    expect(anon.status).not.toBe(authed.status); // was: equal, both 500
  });

  it('input validation no longer precedes authentication', async () => {
    // A body that fails `validateRequest` used to be answered 400 with no
    // authentication at all.
    const { status } = await call('analyze-meal', ANON_KEY, { image: 'wrong-field' });
    expect(status).toBe(401); // was 400
  });
});

describe('KNOWN-BAD BASELINE — four functions still answer config before auth', () => {
  /**
   * KNOWN-BAD BASELINE — P4-b, remaining surface. NOT FIXED.
   *
   * Step 15's remit was `analyze-meal` ordering only. `ai-chat`, `lab-analyze`,
   * `tts` and `live-token` still evaluate `if (!GEMINI_API_KEY)` — and, for
   * ai-chat and lab-analyze, the body parse as well — BEFORE `callerUserId`, so
   * on a stack with no provider secret they answer a bare-anon-key caller and a
   * real patient identically. The consequence is the same as the one Step 15
   * just closed for analyze-meal: configuration disclosure plus a small
   * unauthenticated work amplifier, not an auth bypass where the key is set.
   *
   * Owning remediation: RU-14 / RU-15. Deliberately out of Step 15's scope.
   */
  it.each(['ai-chat', 'lab-analyze', 'tts', 'live-token'])(
    '%s answers the anon key and a real patient identically',
    async (name) => {
      const anon = await call(name, ANON_KEY, { text: 'bonjour', image_base64: PNG_1X1 });
      const authed = await call(name, patient.accessToken, {
        text: 'bonjour',
        image_base64: PNG_1X1,
      });
      expect(anon.status, `${name}`).toBe(authed.status); // indistinguishable
      expect(anon.text).toContain('not configured');
    }
  );
});

describe('authenticated but unauthorized', () => {
  it('admin-ops rejects an ordinary patient', async () => {
    const { status } = await call('admin-ops', patient.accessToken, { action: 'list_users' });
    expect([401, 403]).toContain(status);
    expect(status).not.toBe(200);
  });

  it('enrich-dishes rejects an ordinary patient (isAdminCaller)', async () => {
    const { status } = await call('enrich-dishes', patient.accessToken);
    expect(status).toBe(403);
  });

  it('gen-dish-image rejects an ordinary patient (isAdminCaller)', async () => {
    const { status } = await call('gen-dish-image', patient.accessToken);
    expect(status).toBe(403);
  });

});

describe('SEC-1 — server-side feature-lock enforcement', () => {
  /**
   * VERIFIED IN STEP 15. This was a documented `it.skip`:
   *
   *   "a locked feature is refused server-side — needs provider secrets to
   *    verify" — every function consulting `featureGuard` short-circuited on a
   *    missing provider secret first, so the lock was never reached on a stack
   *    with no secrets.
   *
   * The P4-b reorder moved `analyze-meal`'s lock check ABOVE that guard, which
   * is what makes the refusal observable locally — no provider secret, no stub,
   * no new infrastructure, and no change to the lock's own policy.
   *
   * The database half was already proven in rls/selfPromotion.test.ts (a new
   * patient starts locked and cannot unlock themselves). This closes the server
   * half: the Edge Function itself refuses, so the client-side gate in
   * services/features.ts is not the only thing standing there.
   */
  let locked: TestUser;

  beforeAll(async () => {
    locked = await createUser('fn-locked');
  });

  afterAll(async () => {
    await deleteUser(locked.id);
  });

  /** ARRANGE ONLY — service role, the same path the admin dashboard uses. */
  const setScanner = async (userId: string, allowed: boolean): Promise<void> => {
    const { error } = await admin
      .from('feature_access')
      .upsert({ user_id: userId, feature: 'scanner', allowed }, { onConflict: 'user_id,feature' });
    if (error) throw new Error(`arrange feature_access failed: ${error.message}`);
  };

  it('a new patient starts locked, and migration 0013 is what locks them', async () => {
    const { data } = await admin
      .from('feature_access')
      .select('feature, allowed')
      .eq('user_id', locked.id)
      .eq('feature', 'scanner');
    expect(data).toHaveLength(1);
    expect(data?.[0]?.allowed).toBe(false);
  });

  it('a LOCKED patient is refused server-side, before any provider work', async () => {
    await setScanner(locked.id, false);
    const { status, text } = await call('analyze-meal', locked.accessToken, {
      image_base64: PNG_1X1,
    });
    expect(status).toBe(403);
    expect(text).toContain('feature locked');
  });

  it('an UNLOCKED patient passes the lock and reaches the request path', async () => {
    await setScanner(locked.id, true);
    const { status, text } = await call('analyze-meal', locked.accessToken, {
      image_base64: PNG_1X1,
    });
    expect(status).not.toBe(403);
    expect(status).not.toBe(401);
    // With no provider secret on this stack the next stop is the config guard —
    // which is now reachable ONLY by an authenticated, unlocked caller.
    expect(status).toBe(500);
    expect(text).toContain('not configured');
  });

  it('the bare anon key is refused regardless of the lock state', async () => {
    // The lock is authorization; the 401 is authentication. Neither substitutes
    // for the other, so unlocking a patient must not open the public key's path.
    for (const allowed of [true, false]) {
      await setScanner(locked.id, allowed);
      const { status } = await call('analyze-meal', ANON_KEY, { image_base64: PNG_1X1 });
      expect(status, `anon key with scanner allowed=${allowed}`).toBe(401);
    }
  });

  /**
   * SEC-2 — STILL OPEN, deliberately. `featureLocked` returns `false` when the
   * `feature_access` lookup fails (featureGuard.ts), so during a database outage
   * a locked patient is unlocked. That is a deliberate product decision — a
   * hiccup must not block a paying user mid-flow — and changing it decides who
   * may use a feature during an outage, which is not an engineering call. Step
   * 15 documents the trust assumption and changes no runtime behaviour for it.
   *
   * Simulating the outage would mean breaking the local stack's REST endpoint
   * mid-suite; it is recorded in docs/, not asserted here.
   */
});

describe('cross-account edge access', () => {
  it('delete-account acts on the caller, and carries no target parameter', async () => {
    const victim = await createUser('fn-victim');

    // Attempt to aim it at someone else. The function derives the subject from
    // the JWT, so any body-supplied id must be ignored.
    const { status } = await call('delete-account', patient.accessToken, { user_id: victim.id });
    expect(status).not.toBe(401);

    // The victim must still exist regardless of what the call returned.
    const { data } = await victim.client.from('profiles').select('user_id').eq('user_id', victim.id);
    expect(data).toHaveLength(1);

    await deleteUser(victim.id);
  });
});
