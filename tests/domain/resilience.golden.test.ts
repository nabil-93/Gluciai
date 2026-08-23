import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PROVIDER_RETRIES,
  PROVIDER_TIMEOUT_MS,
  resilient,
} from '@/services/nutrition/resilience';
import type { NutritionProvider, ProviderHit } from '@/services/nutrition/types';

/**
 * THE LAYER THAT KEEPS A DEAD PROVIDER FROM KILLING A SCAN (finding NET-1).
 *
 * `resilient()` wraps every provider in the chain (`engine.ts:50`) so a slow or
 * flaky source can neither stall a scan nor propagate an exception: each
 * `search()` is raced against a timeout, retried once, and any failure is
 * swallowed to `null` so the engine falls through to the next provider.
 *
 * WHAT WAS MISSING. No test file referenced this module. Its behaviour was only
 * exercised INDIRECTLY through provider suites, which pass whether or not the
 * timeout fires and cannot distinguish "one retry" from "none" or "three". A
 * regression here would surface as a scan that hangs, or as an unhandled
 * rejection during a network failure — neither of which the provider suites
 * would catch.
 *
 * These fixtures test the real module. Only the PROVIDER (the network boundary)
 * is faked; the timeout, the retry loop and the fallback are the production
 * ones. Fake timers make the timeout cases deterministic instead of making the
 * suite wait 2 s per case.
 */

const HIT: ProviderHit = {
  matchedName: 'test food',
  per100g: {
    calories: 100,
    carbs: 10,
    carbs_known: true,
    sugar: 0,
    protein: 0,
    fat: 0,
    fiber: 0,
    sodium: 0,
  },
  source: 'usda',
  nutritionConfidence: 0.9,
} as ProviderHit;

/** A fake provider whose `search` is fully controlled by the test. */
function fake(search: NutritionProvider['search']): NutritionProvider {
  return { id: 'usda', label: 'Fake', search };
}

/** Advance fake timers and let pending promise callbacks run. */
async function tick(ms: number) {
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

/* ── A/D — the happy paths ────────────────────────────────────────────── */

describe('a provider that answers is passed straight through', () => {
  it('A: a successful hit is returned unchanged', async () => {
    const search = vi.fn(async () => HIT);
    const hit = await resilient(fake(search)).search('apple');
    expect(hit).toEqual(HIT);
    expect(search).toHaveBeenCalledTimes(1); // no retry after success
  });

  it('a provider that legitimately finds nothing returns null WITHOUT retrying', async () => {
    // `null` is a real answer ("I do not know this food"), not a failure. The
    // wrapper must not turn a miss into two network calls.
    const search = vi.fn(async () => null);
    const hit = await resilient(fake(search)).search('nothing');
    expect(hit).toBeNull();
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('the query reaches the provider verbatim', async () => {
    const search = vi.fn(async () => HIT);
    await resilient(fake(search)).search('pain complet');
    expect(search).toHaveBeenCalledWith('pain complet');
  });
});

/* ── B/H — timeout ────────────────────────────────────────────────────── */

describe('a hung provider cannot stall the scan', () => {
  it('B/H: a provider that never settles times out and yields null', async () => {
    // The whole point of the layer: without it this promise would hang the
    // engine for as long as the network kept the socket open.
    const search = vi.fn(() => new Promise<ProviderHit | null>(() => {}));
    const p = resilient(fake(search)).search('apple');

    // First attempt times out, second attempt times out, then null.
    await tick(PROVIDER_TIMEOUT_MS * (PROVIDER_RETRIES + 1) + 10);

    await expect(p).resolves.toBeNull();
    expect(search).toHaveBeenCalledTimes(PROVIDER_RETRIES + 1);
  });

  it('a provider slower than the timeout is abandoned, even though it would answer', async () => {
    const search = vi.fn(
      () =>
        new Promise<ProviderHit | null>((resolve) => {
          setTimeout(() => resolve(HIT), PROVIDER_TIMEOUT_MS + 500);
        })
    );
    const p = resilient(fake(search)).search('apple');
    await tick(PROVIDER_TIMEOUT_MS * (PROVIDER_RETRIES + 1) + 600);
    await expect(p).resolves.toBeNull();
  });

  it('a provider that answers just inside the timeout still wins', async () => {
    const search = vi.fn(
      () =>
        new Promise<ProviderHit | null>((resolve) => {
          setTimeout(() => resolve(HIT), PROVIDER_TIMEOUT_MS - 50);
        })
    );
    const p = resilient(fake(search)).search('apple');
    await tick(PROVIDER_TIMEOUT_MS);
    await expect(p).resolves.toEqual(HIT);
    expect(search).toHaveBeenCalledTimes(1);
  });

  it('the timeout is configurable per call site', async () => {
    const search = vi.fn(() => new Promise<ProviderHit | null>(() => {}));
    const p = resilient(fake(search), { timeoutMs: 50 }).search('apple');
    await tick(50 * 2 + 10);
    await expect(p).resolves.toBeNull();
  });
});

/* ── C/D/E/I/N — the retry contract ───────────────────────────────────── */

describe('exactly one retry — no more, no fewer', () => {
  it('C/D: a transient failure is retried once and the retry’s hit is returned', async () => {
    let n = 0;
    const search = vi.fn(async () => {
      n += 1;
      if (n === 1) throw new Error('ECONNRESET');
      return HIT;
    });
    const hit = await resilient(fake(search)).search('apple');
    expect(hit).toEqual(HIT);
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('E: when the retry also fails the result is null', async () => {
    const search = vi.fn(async () => {
      throw new Error('still down');
    });
    const hit = await resilient(fake(search)).search('apple');
    expect(hit).toBeNull();
    expect(search).toHaveBeenCalledTimes(2);
  });

  it('I/N: a permanently failing provider is called exactly 1 + retries times', async () => {
    // Pins the loop bound. A regression to `attempt < retries` (one call) or an
    // unbounded loop would both be caught here.
    const search = vi.fn(async () => {
      throw new Error('down');
    });
    await resilient(fake(search)).search('apple');
    expect(search).toHaveBeenCalledTimes(PROVIDER_RETRIES + 1);
    expect(PROVIDER_RETRIES).toBe(1); // the documented contract
  });

  it('the retry count is configurable, and 0 means no retry at all', async () => {
    const search = vi.fn(async () => {
      throw new Error('down');
    });
    await resilient(fake(search), { retries: 0 }).search('apple');
    expect(search).toHaveBeenCalledTimes(1);

    search.mockClear();
    await resilient(fake(search), { retries: 3 }).search('apple');
    expect(search).toHaveBeenCalledTimes(4);
  });

  it('a timeout on the first attempt is retried like any other failure', async () => {
    let n = 0;
    const search = vi.fn(() => {
      n += 1;
      if (n === 1) return new Promise<ProviderHit | null>(() => {}); // hangs
      return Promise.resolve(HIT);
    });
    const p = resilient(fake(search)).search('apple');
    await tick(PROVIDER_TIMEOUT_MS + 10);
    await expect(p).resolves.toEqual(HIT);
    expect(search).toHaveBeenCalledTimes(2);
  });
});

/* ── F/G/M — nothing escapes ──────────────────────────────────────────── */

describe('the wrapper never throws, whatever the provider does', () => {
  it('G: an async rejection is swallowed to null', async () => {
    const hit = await resilient(
      fake(async () => {
        throw new Error('network request failed');
      })
    ).search('apple');
    expect(hit).toBeNull();
  });

  it('F: a SYNCHRONOUS throw is swallowed too', async () => {
    // `provider.search(query)` is called inside the try, so a provider that
    // throws before returning a promise is caught as well.
    const search = vi.fn((() => {
      throw new Error('bad provider');
    }) as unknown as NutritionProvider['search']);
    await expect(resilient(fake(search)).search('apple')).resolves.toBeNull();
    expect(search).toHaveBeenCalledTimes(PROVIDER_RETRIES + 1);
  });

  it('a rejection with a non-Error value is handled', async () => {
    for (const thrown of [undefined, null, 'string', 0, { code: 500 }]) {
      const hit = await resilient(
        fake(async () => {
          throw thrown;
        })
      ).search('apple');
      expect(hit).toBeNull();
    }
  });

  it('M: no unhandled rejection escapes to the process', async () => {
    const unhandled: unknown[] = [];
    const onUnhandled = (e: unknown) => unhandled.push(e);
    process.on('unhandledRejection', onUnhandled);
    try {
      // A hung provider: its inner promise is abandoned when the timeout wins.
      const p = resilient(fake(() => new Promise<ProviderHit | null>(() => {}))).search('x');
      await tick(PROVIDER_TIMEOUT_MS * 2 + 10);
      await p;
      // A provider that rejects AFTER the timeout has already fired — the
      // rejection arrives with nobody waiting for it.
      const late = resilient(
        fake(
          () =>
            new Promise<ProviderHit | null>((_, reject) => {
              setTimeout(() => reject(new Error('late')), PROVIDER_TIMEOUT_MS + 100);
            })
        )
      ).search('y');
      await tick(PROVIDER_TIMEOUT_MS * 2 + 300);
      await late;
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      process.off('unhandledRejection', onUnhandled);
    }
    expect(unhandled).toEqual([]);
  });
});

/* ── J/K/L — the chain, and what the engine relies on ─────────────────── */

describe('the engine’s fall-through depends on this contract', () => {
  it('J/K/L: a dead provider yields null so the NEXT provider is reached', async () => {
    /*
     * This is the behaviour `engine.ts` builds on: it walks PROVIDER_CHAIN and
     * treats `null` as "ask the next one". If the wrapper threw instead, the
     * whole chain would abort on the first flaky source.
     */
    const dead = resilient(
      fake(async () => {
        throw new Error('down');
      })
    );
    const alive = resilient(fake(async () => HIT));

    const results: (ProviderHit | null)[] = [];
    for (const p of [dead, alive]) results.push(await p.search('apple'));

    expect(results[0]).toBeNull(); // fell through
    expect(results[1]).toEqual(HIT); // next provider answered
  });

  it('K: when every provider fails the chain ends with no hit and no throw', async () => {
    const chain = [1, 2, 3].map(() =>
      resilient(
        fake(async () => {
          throw new Error('down');
        })
      )
    );
    const results = [];
    for (const p of chain) results.push(await p.search('apple'));
    expect(results).toEqual([null, null, null]);
  });

  it('identity is preserved — the wrapper is transparent to the engine', async () => {
    // The engine files a meal under `provider.id`; a wrapper that changed it
    // would silently rewrite provenance.
    const original = fake(async () => HIT);
    const wrapped = resilient(original);
    expect(wrapped.id).toBe(original.id);
    expect(wrapped.label).toBe(original.label);
  });

  it('the original provider object is not mutated', async () => {
    const original = fake(async () => HIT);
    const before = original.search;
    resilient(original);
    expect(original.search).toBe(before);
  });

  it('each wrapped provider retries independently', async () => {
    const a = vi.fn(async () => {
      throw new Error('down');
    });
    const b = vi.fn(async () => HIT);
    await resilient(fake(a)).search('q');
    await resilient(fake(b)).search('q');
    expect(a).toHaveBeenCalledTimes(2); // failed → retried
    expect(b).toHaveBeenCalledTimes(1); // succeeded → not retried
  });

  it('the engine really does wrap every provider in the chain', async () => {
    const { readFileSync } = await import('node:fs');
    const path = await import('node:path');
    const engine = readFileSync(
      path.resolve(process.cwd(), 'src/services/nutrition/engine.ts'),
      'utf8'
    );
    expect(engine).toContain('.map((p) => resilient(p))');
  });
});

/* ── documented constants ─────────────────────────────────────────────── */

describe('the published contract', () => {
  it('the timeout and retry constants are the documented ones', () => {
    // Pinned because they are part of the engine's latency budget: raising the
    // timeout makes a scan wait longer on every dead provider in the chain.
    expect(PROVIDER_TIMEOUT_MS).toBe(2000);
    expect(PROVIDER_RETRIES).toBe(1);
  });

  it('worst case per provider is bounded by (1 + retries) × timeout', async () => {
    const search = vi.fn(() => new Promise<ProviderHit | null>(() => {}));
    const started = Date.now();
    const p = resilient(fake(search)).search('apple');
    await tick(PROVIDER_TIMEOUT_MS * (PROVIDER_RETRIES + 1) + 10);
    await expect(p).resolves.toBeNull();
    // Fake timers: elapsed is the virtual time we advanced, and the call
    // resolved within it rather than hanging past it.
    expect(Date.now() - started).toBeLessThanOrEqual(
      PROVIDER_TIMEOUT_MS * (PROVIDER_RETRIES + 1) + 50
    );
  });
});
