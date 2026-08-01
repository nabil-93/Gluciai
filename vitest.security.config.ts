import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * SECURITY SUITE — separate Vitest project.
 *
 * Kept out of `vitest.config.ts` on purpose. That project is hermetic and runs
 * in ~1.5s with no infrastructure; this one needs a running local Supabase
 * stack and talks to it over HTTP. Mixing them would make the fast suite
 * depend on Docker.
 *
 * The directory is `tests-security/`, not `tests/security/`, so the default
 * project's `tests/**` glob cannot pick these up — no exclude rule needed and
 * `vitest.config.ts` stays untouched.
 *
 * Run with:  npm run test:security   (requires `npx supabase start`)
 */
export default defineConfig({
  resolve: {
    alias: {
      '@/assets': path.resolve(__dirname, './assets'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['tests-security/**/*.test.ts'],
    globalSetup: ['./tests-security/globalSetup.ts'],
    globals: false,
    // Role fixtures create users and sign them in over HTTP; the default 5s
    // is not enough for the arrange phase of a suite.
    testTimeout: 30_000,
    hookTimeout: 60_000,
    // RLS assertions share one database. Running files in parallel would let
    // one suite's reset race another's fixtures.
    fileParallelism: false,
  },
});
