/**
 * ONE RETRY POLICY FOR EVERY UPSTREAM AI CALL.
 *
 * WHY THIS EXISTS — a patient photographing dinner was told "Analyse impossible
 * pour le moment. Vérifiez votre connexion" and had to press the shutter again
 * and again until an attempt happened to land. Their connection was fine.
 * `analyze-meal` retried exactly one status (429) and failed fast on everything
 * else, and "everything else" is mostly 503 UNAVAILABLE — "the model is
 * overloaded" — which is the ordinary weather of a vision model at peak hours.
 * `ai-chat`, `food-search` and `lab-analyze` retried nothing at all.
 *
 * So the policy lives here once, and all four import it. A policy written down
 * in four places is four policies that will drift; this file is the fix for
 * that as much as for the 503.
 *
 * WHAT IS RETRIED — the statuses that mean "ask again later":
 *   429 too many requests · 500 internal · 502 bad gateway
 *   503 unavailable/overloaded · 504 gateway timeout
 * plus a THROWN fetch, which is a socket or DNS blip that never reached the
 * provider at all.
 *
 * WHAT IS NOT — 400 (the request or the image is malformed) and 401/403 (the
 * key is wrong). Those return the same answer however many times they are
 * asked, so retrying only lengthens the patient's wait and burns quota.
 *
 * THE BUDGET IS BOUNDED, because these run inside an edge function with a wall
 * clock: three attempts, ~0.6s then ~1.5s of backoff, each with jitter so a
 * burst of clients does not resynchronise into the next spike. A 429 honours
 * the provider's own `retryDelay` instead, capped at 8s. Worst case adds ~2s to
 * a call that would otherwise have failed outright.
 */

/** Statuses worth asking again about. */
const TRANSIENT = new Set([429, 500, 502, 503, 504]);

export const AI_MAX_ATTEMPTS = 3;

/** Cap on how long we will honour a provider's own retry hint. */
const MAX_HONOURED_DELAY_MS = 8000;

/**
 * Pull the retryDelay ("11s") out of a Gemini 429 body → ms (default 5s).
 * Exported so a caller can log what the provider asked for.
 */
export function parseRetryDelayMs(body: string): number {
  const m = body.match(/"retryDelay"\s*:\s*"(\d+)(?:\.\d+)?s"/);
  return m ? (parseInt(m[1], 10) + 1) * 1000 : 5000;
}

/** Raised when every attempt was spent on transient failures. */
export class AiUnavailableError extends Error {
  /** Stable code the client branches on — never a translated string. */
  readonly code = 'ai_unavailable';
  readonly status: number;
  readonly attempts: number;
  readonly detail: string;

  constructor(status: number, attempts: number, detail: string) {
    super(`AI provider unavailable after ${attempts} attempt(s) (status ${status})`);
    this.name = 'AiUnavailableError';
    this.status = status;
    this.attempts = attempts;
    this.detail = detail;
  }
}

/**
 * `fetch`, with the policy above applied.
 *
 * Resolves with the provider's Response for any NON-transient outcome —
 * including a non-ok one like 400, which the caller still has to interpret.
 * Throws `AiUnavailableError` only when the attempts were exhausted on
 * transient failures, so a caller can tell "the provider is busy" apart from
 * "the request was wrong" without parsing a message.
 */
export async function aiFetch(
  url: string,
  init: RequestInit,
  opts?: {
    /** Called before each wait, for logging. */
    onRetry?: (info: { attempt: number; status: number; waitMs: number }) => void;
  }
): Promise<Response> {
  let lastStatus = 0;
  let lastDetail = '';

  for (let attempt = 1; attempt <= AI_MAX_ATTEMPTS; attempt += 1) {
    let res: Response | null = null;
    let threw: unknown = null;

    try {
      res = await fetch(url, init);
    } catch (e) {
      // Never reached the provider: no status to branch on, and no body.
      threw = e;
    }

    if (res && res.ok) return res;

    const status = res?.status ?? 0;
    const retryable = threw !== null || TRANSIENT.has(status);

    // A permanent failure is the caller's to interpret — hand it back intact.
    if (!retryable && res) return res;

    lastStatus = status;
    lastDetail = res ? await res.text() : String(threw ?? 'network error');

    if (attempt === AI_MAX_ATTEMPTS) break;

    const waitMs =
      status === 429
        ? Math.min(parseRetryDelayMs(lastDetail), MAX_HONOURED_DELAY_MS)
        : Math.round(attempt * 600 + Math.random() * 400);
    opts?.onRetry?.({ attempt, status, waitMs });
    await new Promise((r) => setTimeout(r, waitMs));
  }

  throw new AiUnavailableError(lastStatus, AI_MAX_ATTEMPTS, lastDetail.slice(0, 400));
}

/**
 * The JSON body a function returns when the provider stayed unavailable.
 *
 * `code` is what the app branches on. The app never shows `message` — it picks
 * its own translated sentence from the code — but a human reading the logs or
 * calling the endpoint directly should still find something meaningful here.
 */
export function aiUnavailableBody(e: AiUnavailableError) {
  return {
    error: e.message,
    code: e.code,
    provider_status: e.status,
    attempts: e.attempts,
  };
}

/** True when a thrown value is the exhausted-retries case. */
export function isAiUnavailable(e: unknown): e is AiUnavailableError {
  return e instanceof AiUnavailableError;
}
