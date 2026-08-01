import { afterEach, vi } from 'vitest';

/**
 * Shared setup for the deterministic test suite.
 *
 * TIMEZONE — this is not housekeeping, it is a correctness requirement.
 * `bolusEngine.guessMealTime()` selects the patient's per-meal insulin ratio
 * from `Date.getHours()`, i.e. the DEVICE's local time. A fixture asserting
 * "17:59 uses the lunch ratio, 18:00 uses the dinner ratio" would therefore
 * pass on one machine and fail on another purely because of `TZ`. Pinning the
 * process timezone makes every clock-dependent expectation mean the same thing
 * on a laptop and in CI.
 *
 * UTC is chosen because it has no daylight-saving transition, so a fixture can
 * never land in a skipped or repeated local hour. Clock-dependent fixtures must
 * therefore express their expectations in UTC.
 *
 * (That the app reads device-local time at all is a recorded finding, P7-004.
 * This file does not change that behaviour — it only makes the behaviour
 * reproducible so the baseline can be trusted.)
 */
process.env.TZ = 'UTC';

/**
 * Any test that installs fake timers must not leak them into the next file.
 * `vi.useRealTimers()` is a no-op when fake timers were never installed, so
 * this is safe to run unconditionally.
 */
afterEach(() => {
  vi.useRealTimers();
});
