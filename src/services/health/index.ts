import { Platform } from 'react-native';

/**
 * Health platform integrations — modular provider registry.
 * Each platform (Apple Health, Google Fit, FreeStyle Libre, Dexcom)
 * implements HealthProvider; adding a new one means adding a file
 * and registering it here — no other code changes (Open/Closed).
 *
 * The native SDK bridges (HealthKit, Health Connect, LibreLinkUp,
 * Dexcom Share) plug into `connect`/`sync` once the app is built
 * with EAS — the UI and data flow are already wired.
 */

export interface HealthSample {
  value: number;
  unit: string;
  timestamp: string;
}

export interface HealthProvider {
  id: string;
  name: string;
  icon: string;
  description: string;
  /** Which platform(s) the provider can run on */
  platforms: ('ios' | 'android')[];
  /** SDK bridge present in this build? */
  isAvailable(): Promise<boolean>;
  connect(): Promise<boolean>;
  /** Pull glucose samples since a date (CGM providers) */
  readGlucose?(since: Date): Promise<HealthSample[]>;
  /** Pull activity minutes since a date */
  readActivity?(since: Date): Promise<HealthSample[]>;
}

function stub(
  id: string,
  name: string,
  icon: string,
  description: string,
  platforms: ('ios' | 'android')[]
): HealthProvider {
  return {
    id,
    name,
    icon,
    description,
    platforms,
    // Native SDK not bundled yet — becomes true once the bridge ships
    async isAvailable() {
      return false;
    },
    async connect() {
      return false;
    },
  };
}

export const healthProviders: HealthProvider[] = [
  stub(
    'apple-health',
    'Apple Health',
    '🍎',
    'Synchronise glycémie, activité et poids avec l’app Santé de votre iPhone.',
    ['ios']
  ),
  stub(
    'google-fit',
    'Google Fit / Health Connect',
    '🤖',
    'Synchronise vos données santé sur Android via Health Connect.',
    ['android']
  ),
  stub(
    'freestyle-libre',
    'FreeStyle Libre',
    '⚪',
    'Importe automatiquement les mesures de votre capteur Libre (LibreLinkUp).',
    ['ios', 'android']
  ),
  stub(
    'dexcom',
    'Dexcom',
    '🟢',
    'Reçoit les mesures en continu de votre CGM Dexcom (Share).',
    ['ios', 'android']
  ),
];

/** Providers relevant for the current platform. */
export function availableForThisDevice(): HealthProvider[] {
  if (Platform.OS === 'web') return healthProviders;
  return healthProviders.filter((p) =>
    p.platforms.includes(Platform.OS as 'ios' | 'android')
  );
}
