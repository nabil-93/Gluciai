import { describe, expect, it, vi } from 'vitest';

/**
 * A RESPONSE BODY CAN BE READ ONCE (found while doing store audit S-08).
 *
 * `analyzeMealImage` first asks `asQuotaError` whether a failure was the
 * patient's quota, then reads the same Response again for the function's own
 * code ('ai_unavailable', 'rate_limited'). `asQuotaError` used to read the
 * ORIGINAL body, so that second read threw "body already used" and the scanner
 * fell back to the generic "check your connection" — the busy and rate-limit
 * messages could never appear in production.
 */

vi.mock('@/lib/supabase', () => ({ isDemoMode: true, supabase: null }));
vi.mock('@/store/useAppStore', () => ({ useAppStore: { getState: () => ({}) } }));
vi.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: vi.fn() },
  SaveFormat: { JPEG: 'jpeg' },
}));

const { asQuotaError } = await import('@/services/usage');
const { scanErrorKey } = await import('@/services/visionCapture');

const httpError = (status: number, body: unknown) => {
  const res = new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
  return Object.assign(new Error('Edge Function returned a non-2xx status code'), {
    context: res,
  });
};

describe('asQuotaError leaves the body for the next reader', () => {
  it('a non-quota failure can still be read afterwards', async () => {
    const err = httpError(503, { error: 'busy', code: 'ai_unavailable' });
    expect(await asQuotaError(err, null)).toBeNull();
    // The second read — exactly what analyzeMealImage does next.
    const body = await err.context.clone().json();
    expect(body.code).toBe('ai_unavailable');
  });

  it('still recognises a real quota answer', async () => {
    const err = httpError(429, { error: 'quota_exceeded', feature: 'scan', period: 'day', limit: 5, used: 5 });
    const q = await asQuotaError(err, null);
    expect(q).not.toBeNull();
  });
});

describe('the provider rate limit keeps its own message (S-08 contract)', () => {
  it('reads the code, now that the provider text no longer reaches the client', () => {
    const e = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      code: 'rate_limited',
    });
    expect(scanErrorKey(e)).toBe('scanner.rateLimited');
  });

  it('reads an HTTP 429 even without a code', () => {
    const e = Object.assign(new Error('Edge Function returned a non-2xx status code'), {
      context: { status: 429 },
    });
    expect(scanErrorKey(e)).toBe('scanner.rateLimited');
  });
});

describe('edge functions no longer echo internal detail', () => {
  it('no AI function returns the raw exception or provider body', async () => {
    const { readFileSync } = await import('node:fs');
    for (const fn of [
      'ai-chat',
      'analyze-meal',
      'food-search',
      'lab-analyze',
      'live-token',
      'nutrition-search',
      'tts',
      'world-recipes',
      'delete-account',
    ]) {
      const s = readFileSync(`supabase/functions/${fn}/index.ts`, 'utf8');
      expect(s, fn).not.toMatch(/error: String\(error\)/);
      expect(s, fn).not.toMatch(/, detail \}/);
    }
  });
});
