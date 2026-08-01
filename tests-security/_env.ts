/**
 * SECURITY SUITE — environment contract and production interlock.
 *
 * These tests create users, attempt privilege escalation and reset state. They
 * must NEVER be able to reach the hosted project. Safety is enforced in three
 * ordered phases; this file owns PHASE 0 — static string checks with no I/O.
 * Phases 1 (read-only probe) and 2 (mutation gate) live in globalSetup.ts.
 *
 * Every check fails CLOSED: anything unexpected throws before a socket opens.
 */

/** The hosted project this repository is linked to. Never a valid target. */
export const FORBIDDEN_PROJECT_REF = 'ftqyzpkzqeudzfztataz';

/** Hosts the suite is permitted to talk to. */
const ALLOWED_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

/**
 * Well-known keys of the Supabase LOCAL development stack. Identical on every
 * machine, published in Supabase's own docs, and worthless against any hosted
 * project — they are pinned here precisely so the suite cannot be pointed
 * somewhere else by an environment variable.
 */
const LOCAL_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
const LOCAL_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU';

const LOCAL_URL = 'http://127.0.0.1:54321';

/**
 * Deliberately NOT `EXPO_PUBLIC_SUPABASE_URL`. The app's own variables are
 * never read here, so loading a stray .env cannot repoint the suite.
 */
export const SUPABASE_URL = process.env.SUPABASE_TEST_URL ?? LOCAL_URL;
export const ANON_KEY = process.env.SUPABASE_TEST_ANON_KEY ?? LOCAL_ANON_KEY;
export const SERVICE_ROLE_KEY =
  process.env.SUPABASE_TEST_SERVICE_ROLE_KEY ?? LOCAL_SERVICE_ROLE_KEY;

/** Every user this suite creates carries this domain. */
export const TEST_EMAIL_DOMAIN = 'glucoai.test';

/**
 * PHASE 0 — static checks. No network, no database, no filesystem.
 * Throws before anything can connect.
 */
export function assertLocalTarget(): void {
  let url: URL;
  try {
    url = new URL(SUPABASE_URL);
  } catch {
    throw new Error(`[SECURITY GUARD] SUPABASE_TEST_URL is not a valid URL: ${SUPABASE_URL}`);
  }

  if (!ALLOWED_HOSTS.has(url.hostname)) {
    throw new Error(
      `[SECURITY GUARD] Refusing to run against non-loopback host "${url.hostname}". ` +
        `Allowed: ${[...ALLOWED_HOSTS].join(', ')}.`
    );
  }

  if (url.protocol !== 'http:') {
    throw new Error(
      `[SECURITY GUARD] Refusing a non-http scheme "${url.protocol}" — the local stack is plain http.`
    );
  }

  const haystack = `${SUPABASE_URL} ${ANON_KEY} ${SERVICE_ROLE_KEY}`;
  if (haystack.includes(FORBIDDEN_PROJECT_REF)) {
    throw new Error(
      '[SECURITY GUARD] The hosted project ref appears in the target configuration. Refusing to run.'
    );
  }

  for (const [name, key] of [
    ['anon', ANON_KEY],
    ['service_role', SERVICE_ROLE_KEY],
  ] as const) {
    const claims = decodeJwtClaims(key);
    if (claims?.iss !== 'supabase-demo') {
      throw new Error(
        `[SECURITY GUARD] The ${name} key is not a local-stack key ` +
          `(iss=${String(claims?.iss)}, expected "supabase-demo"). Refusing to run.`
      );
    }
  }
}

/** Decode a JWT payload without verifying it — used only for guard checks. */
export function decodeJwtClaims(jwt: string): Record<string, unknown> | null {
  try {
    const payload = jwt.split('.')[1];
    if (!payload) return null;
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
}
