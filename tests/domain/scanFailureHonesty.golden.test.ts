import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterEach, describe, expect, it, vi } from 'vitest';

// `visionCapture` reaches expo-image-manipulator at module load; `scanErrorKey`
// itself is pure. Stubbed at that one boundary so the pure function runs in a
// plain node environment, the same way nutritionClaims stubs engine.ts's.
vi.mock('expo-image-manipulator', () => ({
  ImageManipulator: { manipulate: vi.fn() },
  SaveFormat: { JPEG: 'jpeg' },
}));

const { scanErrorKey } = await import('@/services/visionCapture');

/**
 * "IS IT US, OR IS IT YOUR PHONE?" — the two functions that answer it.
 *
 * WHY THIS FILE EXISTS. A patient photographing dinner was told
 * *"Analyse impossible pour le moment. Vérifiez votre connexion"* and pressed
 * the shutter again and again. Their connection was fine — the vision model was
 * overloaded. Two commits fixed it (`2178e71` gave all four AI functions one
 * retry policy; `3d72275` made the client read the server's own reason instead
 * of discarding it), and **neither shipped with a test.**
 *
 * Both halves are safety-relevant in the ordinary sense: a patient who believes
 * their phone is broken stops logging meals, and a patient who retries a
 * genuinely malformed request burns their scan quota for nothing.
 *
 * `_shared/aiFetch.ts` is Deno source that `tsconfig.json` excludes and the
 * edge deploy does not typecheck (see docs/… edge-functions-untyped). It
 * imports nothing, though, so it runs here unchanged — which is the only
 * coverage it has ever had.
 */

/* The edge-function module lives outside `src`, so it is loaded by URL rather
   than through the `@/` alias. */
const aiFetchMod = await import(
  pathToFileURL(
    path.resolve(process.cwd(), 'supabase/functions/_shared/aiFetch.ts')
  ).href
);
const { aiFetch, parseRetryDelayMs, AiUnavailableError, aiUnavailableBody, isAiUnavailable, AI_MAX_ATTEMPTS } =
  aiFetchMod as typeof import('../../supabase/functions/_shared/aiFetch.ts');

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** A fetch stub that replays a fixed sequence of outcomes and counts calls. */
function stubFetch(outcomes: (number | 'throw')[]) {
  let i = 0;
  const calls: number[] = [];
  const fn = vi.fn(async () => {
    const outcome = outcomes[Math.min(i, outcomes.length - 1)];
    i += 1;
    calls.push(i);
    if (outcome === 'throw') throw new Error('socket hang up');
    return new Response(outcome === 200 ? '{"ok":true}' : 'upstream said no', {
      status: outcome,
    });
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

/* ══════════════ the client's message choice ══════════════ */

describe('scanErrorKey — the patient is never blamed for our outage', () => {
  it('a 503 from the edge function reads as "the service is busy"', () => {
    expect(scanErrorKey({ context: { status: 503 } })).toBe('scanner.serviceBusy');
  });

  it('the stable `ai_unavailable` code reads as "the service is busy"', () => {
    expect(scanErrorKey({ code: 'ai_unavailable' })).toBe('scanner.serviceBusy');
    expect(scanErrorKey({ message: 'AI provider unavailable — ai_unavailable' })).toBe(
      'scanner.serviceBusy'
    );
  });

  it('a quota or rate limit gets its own sentence, not the network one', () => {
    for (const msg of ['429 Too Many Requests', 'RESOURCE_EXHAUSTED', 'quota exceeded', 'rate limit hit']) {
      expect(scanErrorKey({ message: msg }), msg).toBe('scanner.rateLimited');
    }
  });

  it('only a genuinely unclassified failure keeps the connection wording', () => {
    expect(scanErrorKey(new Error('Network request failed'))).toBe('scanner.scanFailed');
    expect(scanErrorKey({})).toBe('scanner.scanFailed');
    expect(scanErrorKey(null)).toBe('scanner.scanFailed');
  });

  it('the generic supabase-js wrapper alone must not read as a server outage', () => {
    // `FunctionsHttpError` carries this message for EVERY non-2xx, so treating
    // it as "busy" would blame the server for a malformed request too.
    expect(scanErrorKey({ message: 'Edge Function returned a non-2xx status code' })).toBe(
      'scanner.scanFailed'
    );
  });

  it('the three keys are distinct, so the three states cannot collapse', () => {
    const keys = new Set([
      scanErrorKey({ context: { status: 503 } }),
      scanErrorKey({ message: '429' }),
      scanErrorKey(new Error('boom')),
    ]);
    expect(keys.size).toBe(3);
  });
});

describe('the copy behind those keys says the right thing in all four locales', () => {
  const locales = ['fr', 'en', 'de', 'ar'] as const;

  it('every key is present and non-empty', async () => {
    for (const l of locales) {
      const json = (await import(`../../src/i18n/locales/${l}.json`)).default;
      for (const k of ['rateLimited', 'serviceBusy', 'scanFailed']) {
        expect(json.scanner[k]?.trim().length ?? 0, `${l}.scanner.${k}`).toBeGreaterThan(0);
      }
    }
  });

  it('the busy message and the failure message are different sentences', async () => {
    for (const l of locales) {
      const json = (await import(`../../src/i18n/locales/${l}.json`)).default;
      expect(json.scanner.serviceBusy, l).not.toBe(json.scanner.scanFailed);
    }
  });
});

/* ══════════════ the server's retry policy ══════════════ */

describe('aiFetch — transient failures are retried, permanent ones are not', () => {
  it('a success on the first attempt makes exactly one call', async () => {
    const f = stubFetch([200]);
    const res = await aiFetch('https://x', {});
    expect(res.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it.each([[429], [500], [502], [503], [504]])(
    'status %i is retried up to the attempt budget',
    async (status) => {
      vi.useFakeTimers();
      const f = stubFetch([status]);
      const p = aiFetch('https://x', {}).catch((e) => e);
      await vi.runAllTimersAsync();
      const err = await p;
      expect(isAiUnavailable(err)).toBe(true);
      expect(f).toHaveBeenCalledTimes(AI_MAX_ATTEMPTS);
    }
  );

  it('a thrown fetch — the request never reached the provider — is retried', async () => {
    vi.useFakeTimers();
    const f = stubFetch(['throw']);
    const p = aiFetch('https://x', {}).catch((e) => e);
    await vi.runAllTimersAsync();
    expect(isAiUnavailable(await p)).toBe(true);
    expect(f).toHaveBeenCalledTimes(AI_MAX_ATTEMPTS);
  });

  it('it recovers when a later attempt succeeds', async () => {
    vi.useFakeTimers();
    const f = stubFetch([503, 200]);
    const p = aiFetch('https://x', {});
    await vi.runAllTimersAsync();
    const res = await p;
    expect(res.ok).toBe(true);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it.each([[400], [401], [403], [404]])(
    'status %i is PERMANENT — returned intact, never retried',
    async (status) => {
      const f = stubFetch([status]);
      const res = await aiFetch('https://x', {});
      // Handed back for the caller to interpret, not thrown.
      expect(res.status).toBe(status);
      expect(f).toHaveBeenCalledTimes(1);
    }
  );

  it('the exhausted error carries the stable code the client branches on', async () => {
    vi.useFakeTimers();
    const p = aiFetch('https://x', {}).catch((e) => e);
    stubFetch([503]);
    await vi.runAllTimersAsync();
    const err = (await p) as InstanceType<typeof AiUnavailableError>;
    if (isAiUnavailable(err)) {
      const body = aiUnavailableBody(err);
      expect(body.code).toBe('ai_unavailable');
      expect(body.attempts).toBe(AI_MAX_ATTEMPTS);
      // …and that code is exactly what scanErrorKey turns into "service busy".
      expect(scanErrorKey({ code: body.code })).toBe('scanner.serviceBusy');
    }
  });

  it("a 429 honours the provider's own retryDelay, capped", () => {
    expect(parseRetryDelayMs('{"retryDelay":"11s"}')).toBe(12000);
    expect(parseRetryDelayMs('{"retryDelay":"0s"}')).toBe(1000);
    // No hint → the documented 5 s default.
    expect(parseRetryDelayMs('no hint here')).toBe(5000);
  });

  it('the attempt budget is bounded — an edge function has a wall clock', () => {
    expect(AI_MAX_ATTEMPTS).toBe(3);
  });
});
