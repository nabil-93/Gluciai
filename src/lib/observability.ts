import type { Breadcrumb, ErrorEvent } from '@sentry/react-native';

/**
 * Privacy layer for crash reporting.
 *
 * This app holds glucose readings, insulin doses, meals, body metrics and free
 * text a patient typed to an AI. None of it may ever reach a third party, so
 * nothing is transmitted until it has passed through here.
 *
 * The functions below are PURE and carry no runtime Sentry import — only a
 * type-only one, which the compiler erases. That is deliberate: it lets the
 * whole layer be unit-tested in a plain node environment, so "sensitive values
 * are removed" is an assertion in CI rather than a claim in a comment.
 *
 * Everything fails CLOSED. Where a value cannot be shown to be safe, it is
 * dropped rather than forwarded.
 */

export const REDACTED = '[redacted]';

/**
 * Keys whose VALUES never leave the device. Matched case-insensitively as a
 * substring, so `currentGlucose`, `glucose_logs` and `bg` are all caught.
 *
 * Deliberately broad. Over-redaction costs a little debugging convenience;
 * under-redaction transmits a patient's health data.
 */
const SENSITIVE_KEY =
  // `\blab` rather than `\blab\b` so `labResults` and `lab_report` are caught;
  // it also matches `label`, which is harmless over-redaction and the safer
  // side of the trade. A unit test in this suite caught the original gap.
  /(glucose|blood|sugar|hba1c|a1c|\bbg\b|dose|insulin|iob|bolus|ratio|correction|carb|nutri|meal|food|recipe|weight|height|\bbmi\b|birth|\bage\b|diabet|\blab|report|email|phone|name|user|patient|doctor|promo|token|key|secret|password|auth|jwt|dsn|session|note|message|text|content|prompt|transcript|answer|chat)/i;

/** Structural keys that are safe and useful, checked before the pattern. */
const ALWAYS_KEEP = new Set([
  'environment',
  'release',
  'platform',
  'os',
  'device',
  'app',
  'runtime',
  'level',
  'type',
  'handled',
  'mechanism',
  'boundary',
  'app_version',
  'build',
]);

/** Credential-shaped material that can appear inside free text. */
const JWT = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]+/g;
const SUPABASE_HOST = /https?:\/\/[a-z0-9-]+\.supabase\.(co|in)\S*/gi;
const SB_KEY = /\bsb_(publishable|secret)_[A-Za-z0-9_-]+/g;
const BEARER = /\bBearer\s+[A-Za-z0-9._-]+/gi;

const MAX_TEXT = 500;

/** Strip the query string and fragment — a path may be reported, a value may not. */
export function scrubUrl(url: string): string {
  if (typeof url !== 'string' || !url) return url;
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/** Remove credential-shaped substrings and any query string from free text. */
export function scrubText(input: string): string {
  if (typeof input !== 'string' || !input) return input;
  let out = input
    .replace(JWT, REDACTED)
    .replace(SB_KEY, REDACTED)
    .replace(BEARER, REDACTED)
    .replace(SUPABASE_HOST, (m) => scrubUrl(m));
  if (out.length > MAX_TEXT) out = `${out.slice(0, MAX_TEXT)}…`;
  return out;
}

/** True when a URL-ish string carries a query string. */
export function hasQuery(value: unknown): boolean {
  return typeof value === 'string' && /[?#]/.test(value);
}

/**
 * Walk any structure and redact values under sensitive keys. Depth-limited so
 * a cyclic or pathological object cannot hang the reporter.
 */
export function scrubDeep(value: unknown, depth = 0): unknown {
  if (depth > 6) return REDACTED;
  if (value == null) return value;

  if (typeof value === 'string') return scrubText(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;

  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1));

  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (!ALWAYS_KEEP.has(k) && SENSITIVE_KEY.test(k)) {
        out[k] = REDACTED;
        continue;
      }
      out[k] = scrubDeep(v, depth + 1);
    }
    return out;
  }

  // Functions, symbols and anything else unrecognised are not forwarded.
  return REDACTED;
}

/**
 * Breadcrumb filter. Returns null to DROP the crumb entirely.
 *
 * Navigation crumbs are the sharp edge: expo-router serialises params into the
 * route, and `/program` currently carries the patient's body weight and
 * dietary constraints (program-setup.tsx). Rather than attempt to parse which
 * params are safe, any navigation crumb carrying a query string is dropped.
 */
export function scrubBreadcrumb(crumb: Breadcrumb | null): Breadcrumb | null {
  if (!crumb) return null;

  const isNavigation =
    crumb.category === 'navigation' ||
    crumb.category === 'route' ||
    (typeof crumb.category === 'string' && crumb.category.startsWith('navigation'));

  const data = crumb.data as Record<string, unknown> | undefined;

  if (isNavigation && data) {
    if (hasQuery(data.to) || hasQuery(data.from) || hasQuery(data.url)) return null;
  }
  if (hasQuery(crumb.message) && isNavigation) return null;

  const next: Breadcrumb = { ...crumb };

  if (typeof next.message === 'string') next.message = scrubText(scrubUrl(next.message));

  if (data) {
    const cleaned = scrubDeep(data) as Record<string, unknown>;
    for (const k of ['to', 'from', 'url']) {
      if (typeof cleaned[k] === 'string') cleaned[k] = scrubUrl(cleaned[k] as string);
    }
    next.data = cleaned;
  }

  return next;
}

/**
 * Event filter — the last gate before anything is transmitted.
 *
 * Identity is removed outright: a crash report is useful without knowing which
 * patient it came from, and a Supabase user_id is a direct handle on their
 * health record.
 */
export function scrubEvent(event: ErrorEvent | null): ErrorEvent | null {
  if (!event) return null;

  const next = { ...event } as ErrorEvent & Record<string, unknown>;

  // Identity — never.
  delete next.user;
  delete (next as Record<string, unknown>).server_name;

  // Request: path only, no query, no headers, no body.
  if (next.request) {
    const req = { ...next.request } as Record<string, unknown>;
    if (typeof req.url === 'string') req.url = scrubUrl(req.url);
    delete req.query_string;
    delete req.data;
    delete req.cookies;
    delete req.headers;
    next.request = req;
  }

  if (typeof next.message === 'string') next.message = scrubText(next.message);

  if (next.exception?.values) {
    next.exception = {
      ...next.exception,
      values: next.exception.values.map((v) => ({
        ...v,
        value: typeof v.value === 'string' ? scrubText(v.value) : v.value,
      })),
    };
  }

  if (next.breadcrumbs) {
    next.breadcrumbs = next.breadcrumbs
      .map((c) => scrubBreadcrumb(c))
      .filter((c): c is Breadcrumb => c !== null);
  }

  if (next.extra) next.extra = scrubDeep(next.extra) as Record<string, unknown>;
  if (next.contexts) next.contexts = scrubDeep(next.contexts) as ErrorEvent['contexts'];
  if (next.tags) next.tags = scrubDeep(next.tags) as ErrorEvent['tags'];

  return next;
}

export interface ObservabilityInput {
  /** EXPO_PUBLIC_SENTRY_DSN — empty in every environment today. */
  dsn: string;
  /** __DEV__ at the call site; passed in so this stays testable in node. */
  isDev: boolean;
  environment?: string;
}

/**
 * The single source of the reporting configuration.
 *
 * `enabled` is false whenever there is no DSN — which is the case in every
 * environment right now — so nothing can be transmitted. Scrubbing still runs,
 * so it is exercised in development rather than only in production.
 */
export function observabilityOptions(input: ObservabilityInput) {
  const { dsn, isDev, environment } = input;
  return {
    dsn,
    enabled: !!dsn && !isDev,
    environment: environment ?? (isDev ? 'development' : 'production'),
    sendDefaultPii: false,
    // Transaction names are route-derived, and `/program` carries body weight
    // in its params today. No traces until that is fixed at the source.
    tracesSampleRate: 0,
    maxBreadcrumbs: 20,
    beforeSend: scrubEvent,
    beforeBreadcrumb: scrubBreadcrumb,
  };
}
