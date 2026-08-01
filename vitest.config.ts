import path from 'node:path';
import { defineConfig } from 'vitest/config';

/**
 * Test runner for the DETERMINISTIC layer of the app.
 *
 * The engines this suite exists to protect — `bolusEngine`, `programEngine`,
 * `reportStats`, `nutrition/micros`, `lib/num` — import nothing at runtime
 * (their only imports are `import type`, which the compiler erases). They are
 * plain TypeScript, so they need no React Native preset, no Expo transform and
 * no DOM: `environment: 'node'` is both sufficient and the fastest option.
 *
 * Modules that DO reach the runtime (`nutrition/engine`, `aiLogger`,
 * `mealScore`) are tested later with explicit `vi.mock` at their boundaries.
 * Component and native tests are out of scope here and would be added with
 * their own environment rather than by widening this one.
 *
 * Path aliases are declared inline, mirroring `tsconfig.json`, so the project
 * does not take a dependency on a plugin to resolve two prefixes.
 */
export default defineConfig({
  resolve: {
    alias: {
      // Keep in sync with `compilerOptions.paths` in tsconfig.json.
      '@/assets': path.resolve(__dirname, './assets'),
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    // Only this directory. Application code is never collected as a test.
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    // No `globals: true`: every test imports `describe`/`it`/`expect` from
    // 'vitest' explicitly, so `tsconfig.json` needs no `types` entry and the
    // application build configuration stays untouched.
    globals: false,
    clearMocks: true,
    restoreMocks: true,
  },
});
