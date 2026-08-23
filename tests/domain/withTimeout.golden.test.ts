import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { withTimeout } from '@/lib/withTimeout';

/**
 * AUTH CALLS THAT NEVER ANSWER.
 *
 * `signInWithPassword`, `getSession` and `signOut` have no client-side
 * deadline: they wait for as long as the server keeps the socket open. Every
 * screen that awaited one of them could therefore hang — the login button
 * stuck on its spinner, the sign-out doing nothing at all. This is the bound
 * that ends the wait, and these are the four things it has to get right.
 */
describe('withTimeout — a bound on a call that has none', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('passes a value straight through when it arrives in time', async () => {
    const p = withTimeout(Promise.resolve('signed in'), 1000, 'gave up');
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBe('signed in');
  });

  it('answers with the fallback once the deadline passes', async () => {
    // A promise that never settles: exactly the case that used to hang.
    const p = withTimeout(new Promise<string>(() => {}), 1000, 'gave up');
    await vi.advanceTimersByTimeAsync(999);
    let settled = false;
    void p.then(() => {
      settled = true;
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBe('gave up');
  });

  it('turns a rejection into the fallback rather than throwing at the caller', async () => {
    const p = withTimeout(
      Promise.reject(new Error('Network request failed')),
      1000,
      'gave up'
    );
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBe('gave up');
  });

  it('does not surface a late failure as an unhandled rejection', async () => {
    let boom: (e: Error) => void = () => {};
    const slow = new Promise<string>((_, reject) => {
      boom = reject;
    });
    const p = withTimeout(slow, 100, 'gave up');
    await vi.advanceTimersByTimeAsync(100);
    await expect(p).resolves.toBe('gave up');

    // The request finally fails, long after nobody was waiting for it. If the
    // rejection were not already handled this would crash the app.
    boom(new Error('too late'));
    await vi.advanceTimersByTimeAsync(0);
  });
});
