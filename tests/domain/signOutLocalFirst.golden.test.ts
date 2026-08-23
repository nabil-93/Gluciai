import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withTimeout } from '@/lib/withTimeout';

/**
 * SIGNING OUT IS A DECISION, NOT A REQUEST.
 *
 * WHAT WAS WRONG. `signOut()` awaited `supabase.auth.signOut()` and only wiped
 * the device in the `finally`. Two failures came out of that one ordering:
 *
 *   1. The screen did nothing for as long as the server took. `/auth/v1/logout`
 *      has no client-side deadline, so a slow or unanswering auth service
 *      froze the profile page with no feedback at all.
 *   2. A FAILED REVOKE LEFT THE PATIENT SIGNED IN. supabase-js revokes the
 *      token before deleting the local copy and RETURNS EARLY on a network
 *      error — so the session survived a sign-out that reported no problem,
 *      and the next launch signed the same account straight back in. On a
 *      shared phone that is the previous person's glucose opening by itself.
 *
 * The guarantee now: the device forgets the account first, synchronously and
 * unconditionally; the stored session is deleted by hand; the server-side
 * revoke is attempted but bounded, and never decides the outcome.
 */

/* ── The pieces sign-out touches, all observable ── */
const calls: string[] = [];
let revoke: () => Promise<unknown> = async () => ({ error: null });

vi.mock('@/lib/supabase', async () => ({
  isDemoMode: false,
  supabase: {
    auth: {
      signOut: (opts?: { scope?: string }) => {
        calls.push('revoke:' + (opts?.scope ?? 'global'));
        return revoke();
      },
    },
  },
  setCachedUserId: (uid: string | null) => calls.push('cache:' + uid),
  clearAuthStorage: async () => {
    calls.push('clearStorage');
  },
  currentUserId: async () => 'u-1',
  withTimeout,
}));

vi.mock('@/store/useAppStore', () => ({
  useAppStore: { getState: () => ({ resetAll: () => calls.push('resetAll') }) },
}));

vi.mock('@/store/useProgramStore', () => ({
  useProgramStore: {
    getState: () => ({ adoptUser: (u: unknown) => calls.push('adoptUser:' + u) }),
  },
}));

vi.mock('@/services/pendingRegistration', () => ({
  clearPendingRegistration: () => calls.push('clearPending'),
}));

vi.mock('@/services/data', () => ({ saveProfile: vi.fn() }));

const { signOut } = await import('@/services/account');

describe('sign-out empties the device before it asks the server', () => {
  beforeEach(() => {
    calls.length = 0;
    revoke = async () => ({ error: null });
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('wipes local state SYNCHRONOUSLY, before the first await', () => {
    revoke = () => new Promise(() => {}); // never answers
    void signOut();
    // No await here on purpose: by the time signOut() has returned its
    // promise, the account is already gone from this device. That is what
    // lets the profile screen navigate to /auth in the same tick.
    expect(calls).toEqual([
      'resetAll',
      'adoptUser:null',
      'clearPending',
      'cache:null',
      'revoke:local',
    ]);
  });

  it('finishes even when the revoke never answers, and still deletes the session', async () => {
    revoke = () => new Promise(() => {});
    const done = signOut();
    await vi.advanceTimersByTimeAsync(4000);
    await expect(done).resolves.toBeUndefined();
    expect(calls).toContain('clearStorage');
  });

  it('deletes the session when the revoke fails outright (offline)', async () => {
    revoke = async () => {
      throw new Error('Network request failed');
    };
    const done = signOut();
    await vi.advanceTimersByTimeAsync(0);
    await done;
    // supabase-js would have returned before removing anything here. The
    // storage wipe is ours, so it happens anyway.
    expect(calls).toContain('clearStorage');
  });

  it('revokes with local scope — this device, the one being abandoned', async () => {
    const done = signOut();
    await vi.advanceTimersByTimeAsync(0);
    await done;
    expect(calls).toContain('revoke:local');
  });

  it('drops the held registration password — signing out means "not this person"', async () => {
    const done = signOut();
    await vi.advanceTimersByTimeAsync(0);
    await done;
    expect(calls).toContain('clearPending');
  });
});
