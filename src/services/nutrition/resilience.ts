import type { NutritionProvider, ProviderHit } from './types';

/**
 * Provider reliability wrapper — timeout + one retry + never-throw.
 *
 * Wraps any NutritionProvider so a slow or flaky source can never block or
 * break a scan: each search is raced against a timeout, retried ONCE on
 * failure/timeout, and any error is swallowed to `null` so the engine's
 * chain simply falls through to the next provider.
 *
 * This does NOT change the chain order or matching logic — it only makes
 * each existing provider's `search()` resilient.
 */

/** Per-provider search timeout (ms). Kept short so the chain stays snappy. */
export const PROVIDER_TIMEOUT_MS = 2000;
/** How many EXTRA attempts after the first (1 = one retry). */
export const PROVIDER_RETRIES = 1;

/** Reject after `ms` so a hung provider can't stall the whole scan. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error('provider-timeout')),
      ms
    );
    p.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e) => {
        clearTimeout(timer);
        reject(e);
      }
    );
  });
}

/**
 * Wrap a provider so its `search()` times out, retries once, and never
 * throws. Returns a new provider object (the original is untouched).
 */
export function resilient(
  provider: NutritionProvider,
  opts: { timeoutMs?: number; retries?: number } = {}
): NutritionProvider {
  const timeoutMs = opts.timeoutMs ?? PROVIDER_TIMEOUT_MS;
  const retries = opts.retries ?? PROVIDER_RETRIES;

  return {
    id: provider.id,
    label: provider.label,
    async search(query: string): Promise<ProviderHit | null> {
      for (let attempt = 0; attempt <= retries; attempt++) {
        try {
          return await withTimeout(provider.search(query), timeoutMs);
        } catch {
          // timeout or thrown error → retry once, then give up (→ null)
          if (attempt === retries) return null;
        }
      }
      return null;
    },
  };
}
