/**
 * REGISTRATION HELD IN MEMORY UNTIL ONBOARDING COMMITS.
 *
 * WHAT WAS WRONG. `auth.tsx` called `supabase.auth.signUp()` the moment the
 * patient submitted the registration form, then sent them into a twelve-step
 * wizard. Every abandonment in between — closing the app, pressing back, losing
 * network, simply changing their mind — left a real `auth.users` row with no
 * profile attached: an account the patient does not know exists, cannot
 * complete, and which blocks that email from being registered again.
 *
 * The account is now created by the LAST step of onboarding instead, so the
 * backend learns about the patient only once there is a complete profile to
 * store. Before that final submit there is no auth user, no profile and no
 * onboarding data on the server.
 *
 * WHY MODULE STATE AND NOT THE PERSISTED STORE. This holds a PASSWORD. The
 * zustand store is persisted to AsyncStorage, which is plaintext on a rooted
 * device and survives a crash; module state dies with the process. A patient
 * who abandons registration leaves nothing behind on disk, and the worst case
 * — the app being killed mid-wizard — costs them a re-entry of the form rather
 * than exposing a credential. That trade is deliberate.
 *
 * Mirrors `bolusHandoff.ts`: set once, read once, cleared explicitly.
 */

export interface PendingRegistration {
  email: string;
  password: string;
  name: string;
  phone: string;
}

let pending: PendingRegistration | null = null;

/** Hold the registration form until onboarding commits it. Overwrites. */
export function setPendingRegistration(reg: PendingRegistration): void {
  pending = { ...reg };
}

/**
 * The held registration, or `null`.
 *
 * Deliberately NON-consuming, unlike `bolusHandoff`: the final step may fail
 * (network, duplicate email) and the patient must be able to retry without
 * re-typing. `clearPendingRegistration` is called only after a confirmed
 * success.
 */
export function getPendingRegistration(): PendingRegistration | null {
  return pending ? { ...pending } : null;
}

/** True when onboarding must create the account at its final step. */
export function hasPendingRegistration(): boolean {
  return pending !== null;
}

/** Drop the credential. Called after a successful sign-up, and on sign-out. */
export function clearPendingRegistration(): void {
  pending = null;
}
