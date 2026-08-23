import { readFileSync } from 'node:fs';
import path from 'node:path';

import { beforeEach, describe, expect, it } from 'vitest';

import {
  clearPendingRegistration,
  getPendingRegistration,
  hasPendingRegistration,
  setPendingRegistration,
} from '@/services/pendingRegistration';

/**
 * ACCOUNT CREATION IS THE FINAL COMMIT OF ONBOARDING.
 *
 * WHAT WAS WRONG. `auth.tsx` called `supabase.auth.signUp()` as soon as the
 * registration form was submitted, then sent the patient into a twelve-step
 * wizard. Every abandonment in between — closing the app, pressing back,
 * losing network — left a real `auth.users` row with no profile: an account
 * the patient never completed, cannot use, and which blocks their own email
 * from being registered again.
 *
 * The account is now created by the LAST step of the wizard, so the backend
 * learns about the patient only when there is a complete profile to store.
 *
 * `auth.tsx` and `wizard.tsx` both pull in React Native, which the node test
 * environment cannot parse, so the CALL SITES are asserted on source — the
 * convention this suite already uses (see interpretationInventory). The
 * pending-registration module itself is pure and runs for real.
 */
const src = (rel: string): string =>
  readFileSync(path.resolve(process.cwd(), rel), 'utf8').replace(/\r\n/g, '\n');

const REG = {
  email: 'qa@example.com',
  password: 'CorrectHorse123',
  name: 'QA',
  phone: '+212600000000',
};

describe('the registration form is held, not sent', () => {
  beforeEach(() => clearPendingRegistration());

  it('starts empty', () => {
    expect(hasPendingRegistration()).toBe(false);
    expect(getPendingRegistration()).toBeNull();
  });

  it('holds what the form captured', () => {
    setPendingRegistration(REG);
    expect(hasPendingRegistration()).toBe(true);
    expect(getPendingRegistration()).toEqual(REG);
  });

  it('can be read MORE THAN ONCE — a failed submit must be retryable', () => {
    // Unlike the bolus hand-off, this is not consumed on read: if the final
    // sign-up fails the patient must retry without re-typing the form.
    setPendingRegistration(REG);
    expect(getPendingRegistration()).toEqual(REG);
    expect(getPendingRegistration()).toEqual(REG);
    expect(hasPendingRegistration()).toBe(true);
  });

  it('hands back a detached copy, so a caller cannot mutate the held record', () => {
    setPendingRegistration(REG);
    const copy = getPendingRegistration()!;
    copy.email = 'attacker@example.com';
    expect(getPendingRegistration()!.email).toBe(REG.email);
  });

  it('is cleared explicitly, and only then', () => {
    setPendingRegistration(REG);
    clearPendingRegistration();
    expect(hasPendingRegistration()).toBe(false);
    expect(getPendingRegistration()).toBeNull();
  });

  it('keeps the latest form when the patient edits and resubmits', () => {
    setPendingRegistration(REG);
    setPendingRegistration({ ...REG, email: 'second@example.com' });
    expect(getPendingRegistration()!.email).toBe('second@example.com');
  });
});

describe('an interrupted registration cannot finalize itself', () => {
  /*
   * THE RESTART CASE. `pendingRegistration` lives in module memory, so killing
   * the app destroys the held form — deliberately, because it holds a
   * password. The question is what the patient meets on the next launch.
   *
   * `index.tsx` routes on `wizardDone`, which is PERSISTED and is set only
   * after a successful sign-up. So an abandoned wizard leaves
   * `wizardDone === false`, the next launch lands on /auth, and the patient
   * registers again. No auth user was ever created, and nothing half-finished
   * can complete on its own: the credential needed to create the account no
   * longer exists in memory, and the flag that would skip the flow was never
   * raised.
   */
  it('the launch route is decided by the persisted wizardDone flag', () => {
    const s = src('src/app/index.tsx');
    expect(s).toContain("if (!wizardDone) return <Redirect href=\"/auth\" />");
    expect(s).toContain("return <Redirect href=\"/(tabs)\" />");
  });

  it('wizardDone is persisted, so an abandoned wizard stays abandoned', () => {
    const s = src('src/store/useAppStore.ts');
    expect(s).toContain('wizardDone: false'); // initial state
    expect(s).toContain('setWizardDone: () => set({ wizardDone: true })');
    expect(s).toContain('persist(');
  });

  it('signing out clears BOTH the flag and any half-finished registration', () => {
    // resetAll() spreads `initialData` (wizardDone: false) while deliberately
    // keeping device-level onboarding; account.ts additionally drops the
    // pending credential. Together: no stale half-state survives a sign-out.
    expect(src('src/store/useAppStore.ts')).toContain('resetAll: () =>');
    expect(src('src/services/account.ts')).toContain('clearPendingRegistration()');
  });

  it('only the wizard can raise the flag for a NEW registration', () => {
    // auth.tsx also calls setWizardDone — but only on the returning-user
    // login path, which is gated behind a successful signInWithPassword.
    const s = src('src/app/auth.tsx');
    const loginAt = s.indexOf('auth.signInWithPassword');
    const goAt = s.indexOf('const goAfterAuth');
    expect(goAt).toBeGreaterThan(-1);
    expect(loginAt).toBeGreaterThan(-1);
    // The register branch returns before the login block that leads there.
    const registerReturn = s.indexOf('setPendingRegistration({ email, password, name, phone })');
    expect(registerReturn).toBeLessThan(loginAt);
    expect(s).toContain('goAfterAuth(false)');
  });
});

describe('the password never reaches persistent storage', () => {
  it('lives in module state — no AsyncStorage, no zustand persist', () => {
    const s = src('src/services/pendingRegistration.ts').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(s).not.toContain('AsyncStorage');
    expect(s).not.toContain('persist');
    expect(s).not.toContain('SecureStore');
    // Module-level variable, so it dies with the process.
    expect(s).toContain('let pending: PendingRegistration | null = null');
  });

  it('is dropped on sign-out', () => {
    expect(src('src/services/account.ts')).toContain('clearPendingRegistration()');
  });
});

describe('auth.tsx no longer creates the account', () => {
  const auth = () => src('src/app/auth.tsx');

  it('THE FIX: registering only holds the form and enters onboarding', () => {
    expect(auth()).toContain('setPendingRegistration({ email, password, name, phone })');
  });

  it('the screen contains NO signUp call at all', () => {
    // The whole defect was that this screen created the account.
    expect(auth()).not.toContain('auth.signUp');
  });

  it('login is untouched — returning users still sign in here', () => {
    expect(auth()).toContain('auth.signInWithPassword');
  });

  it('the BUG-A3 error mapping is still in place', () => {
    expect(auth()).toContain('setError(t(authErrorKey(e)))');
  });
});

describe('wizard.tsx performs the single commit', () => {
  const wiz = () => src('src/app/wizard.tsx');

  it('creates the account at the final step', () => {
    expect(wiz()).toContain('supabase.auth.signUp');
    expect(wiz()).toContain('getPendingRegistration()');
  });

  it('only signs up when a registration is actually pending', () => {
    // A returning user re-running the wizard must not be signed up again.
    expect(wiz()).toContain('if (pending && !isDemoMode && supabase)');
  });

  it('guards against a double-tap creating two accounts', () => {
    expect(wiz()).toContain('if (saving) return;');
  });

  it('clears the credential ONLY after a confirmed success', () => {
    const s = wiz();
    const signUpAt = s.indexOf('supabase.auth.signUp');
    const throwAt = s.indexOf('if (signUpErr) throw signUpErr');
    // Search past the import block: `clearPendingRegistration` also appears
    // there, and the import says nothing about ordering.
    const clearAt = s.indexOf('clearPendingRegistration()', signUpAt);
    expect(signUpAt).toBeGreaterThan(-1);
    expect(throwAt).toBeGreaterThan(signUpAt);
    // The clear sits after the throw, so a failure cannot reach it.
    expect(clearAt).toBeGreaterThan(throwAt);
  });

  it('a failed commit shows a localized error and does NOT navigate', () => {
    const s = wiz();
    expect(s).toContain('setSubmitError(t(authErrorKey(e)))');
    // The failure path returns before the profile save and the redirect.
    const errAt = s.indexOf('setSubmitError(t(authErrorKey(e)))');
    const returnAt = s.indexOf('return;', errAt);
    const saveAt = s.indexOf('await saveProfile(profile)');
    expect(returnAt).toBeGreaterThan(errAt);
    expect(returnAt).toBeLessThan(saveAt);
  });

  it('the profile is saved AFTER the account exists, never before', () => {
    const s = wiz();
    expect(s.indexOf('supabase.auth.signUp')).toBeLessThan(
      s.indexOf('await saveProfile(profile)')
    );
  });

  it('the dashboard is reached only past the failure return', () => {
    const s = wiz();
    expect(s.indexOf('setSubmitError(t(authErrorKey(e)))')).toBeLessThan(
      s.indexOf("router.replace('/(tabs)')")
    );
  });

  it('still persists the phone the registration form captured', () => {
    /*
     * Regression. `auth.tsx` used to write phone+name onto `profiles` right
     * after sign-up. Moving the sign-up into the wizard deleted that block, and
     * nothing else replaces it: the `handle_new_user` trigger inserts only
     * user_id/email/role (migration 0013), and `saveProfile` has no phone
     * field. Without this the dashboard loses the number it uses to reach the
     * patient — a silent data loss introduced by the lifecycle change.
     */
    const s = wiz();
    expect(s).toContain("from('profiles')");
    expect(s).toContain('phone: pending.phone.trim()');
    // Best-effort: it must not be able to undo an account that already exists.
    const updateAt = s.indexOf("from('profiles')");
    const clearAt = s.indexOf('clearPendingRegistration()', updateAt);
    expect(clearAt).toBeGreaterThan(updateAt);
  });

  it('the onboarding-complete flag is raised only AFTER the account exists', () => {
    /*
     * `wizardDone` is what `index.tsx` routes on, and it is PERSISTED. If it
     * were set before the sign-up — or on the failure path — a patient whose
     * account was never created would be routed to the dashboard on the next
     * launch as though registration had completed, with no account behind it.
     */
    const s = wiz();
    const signUpAt = s.indexOf('supabase.auth.signUp');
    const doneAt = s.indexOf('setWizardDone()');
    const failReturnAt = s.indexOf('setSubmitError(t(authErrorKey(e)))');
    expect(doneAt).toBeGreaterThan(signUpAt);
    // The failure path returns before ever reaching it.
    expect(doneAt).toBeGreaterThan(failReturnAt);
  });

  it('a duplicate email surfaces through the same localized mapping', () => {
    // `authErrorKey` maps "User already registered" → authError.emailTaken,
    // pinned in authErrors.golden.test.ts. The wizard reuses that mapping
    // rather than inventing its own wording.
    expect(wiz()).toContain('authErrorKey');
  });
});
