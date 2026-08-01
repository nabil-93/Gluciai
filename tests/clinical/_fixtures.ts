import type {
  ActivityIntensity,
  ActivityLog,
  GlucoseLog,
  InsulinLog,
  InsulinType,
  Profile,
} from '@/types';
import type { BolusInputs } from '@/services/bolusEngine';

/**
 * Builders for the clinical characterization suite.
 *
 * These are NOT part of the application. They exist so a fixture can state
 * only the fields that matter to the behaviour under test, while still
 * producing values that satisfy the real types.
 *
 * Not a `.test.ts` file, so the runner never collects it.
 */

/**
 * The single instant every time-dependent fixture is anchored to.
 * `tests/setup.ts` pins `TZ=UTC`, so `getHours()` on this instant is 12 and
 * `guessMealTime()` therefore resolves to 'lunch' unless a test overrides it.
 */
export const NOW = new Date('2026-01-15T12:00:00.000Z');

/** An instant `minutes` before {@link NOW}; negative values are in the future. */
export const minutesBefore = (minutes: number): string =>
  new Date(NOW.getTime() - minutes * 60_000).toISOString();

/**
 * Profile with the fields the bolus engine reads set to unambiguous values:
 *   carb_ratio 10 g/U · correction_factor 50 mg/dL per U · target 70–180.
 * With these present the engine takes `ratioSource: 'global'` and raises no
 * `noRatio` flag, so a test that wants those states must remove the field.
 */
export function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    user_id: 'test-user',
    name: 'Test',
    diabetes_type: 'type1',
    insulin_types: ['rapid'],
    language: 'fr',
    target_low: 70,
    target_high: 180,
    carb_ratio: 10,
    correction_factor: 50,
    ...overrides,
  };
}

export function insulinLog(
  dose: number,
  minutesAgo: number,
  insulin_type: InsulinType = 'rapid',
  id = `i-${Math.random()}`
): InsulinLog {
  return {
    id,
    user_id: 'test-user',
    insulin_type,
    dose,
    created_at: minutesBefore(minutesAgo),
  };
}

export function activityLog(
  intensity: ActivityIntensity,
  minutesAgo: number
): ActivityLog {
  return {
    id: `a-${Math.random()}`,
    user_id: 'test-user',
    kind: 'walk',
    duration_min: 30,
    intensity,
    created_at: minutesBefore(minutesAgo),
  };
}

export function glucoseLog(value: number, minutesAgo: number): GlucoseLog {
  return {
    id: `g-${Math.random()}`,
    user_id: 'test-user',
    value,
    unit: 'mg/dL',
    source: 'manual',
    created_at: minutesBefore(minutesAgo),
  };
}

/**
 * `BolusInputs` with every collection empty and the clock frozen at {@link NOW},
 * so no trend, IOB or activity factor is in play unless a test supplies one.
 */
export function inputs(overrides: Partial<BolusInputs> = {}): BolusInputs {
  return {
    carbs: 0,
    glucose: null,
    profile: profile(),
    insulinLogs: [],
    activityLogs: [],
    glucoseLogs: [],
    now: NOW,
    ...overrides,
  };
}
