/**
 * WHICH NUMBER CALLS AN AMBULANCE HERE (store audit C-09).
 *
 * The emergency screen used to pick the number from the APP LANGUAGE: French →
 * 15, Arabic → 141, German → 112, English → 911. Language is not location. A
 * French-speaking patient in Belgium, Switzerland or Canada got 15; an Arabic
 * speaker outside Morocco got Morocco's SAMU; an English speaker in the UK got
 * 911. On the one screen a bystander may use in a crisis.
 *
 * The number now follows the DEVICE REGION (the phone's own country setting).
 * Unknown or unlisted regions get 112, which GSM networks route to emergency
 * services in most countries — the safest single fallback there is.
 *
 * Pure and import-free so it is unit-tested directly.
 */
const BY_REGION: Record<string, string> = {
  MA: '141', // SAMU (Protection civile: 15)
  DZ: '14',
  TN: '190',
  EG: '123',
  SA: '997',
  AE: '998',
  QA: '999',
  FR: '15',
  BE: '112',
  CH: '144',
  LU: '112',
  DE: '112',
  AT: '144',
  NL: '112',
  ES: '112',
  IT: '118',
  PT: '112',
  IE: '112',
  GB: '999',
  US: '911',
  CA: '911',
};

/** The universal fallback — answered by GSM networks almost everywhere. */
export const DEFAULT_EMERGENCY_NUMBER = '112';

/** Emergency medical number for an ISO 3166-1 alpha-2 region code. */
export function emergencyNumberFor(region: string | null | undefined): string {
  const key = (region ?? '').trim().toUpperCase();
  return BY_REGION[key] ?? DEFAULT_EMERGENCY_NUMBER;
}
