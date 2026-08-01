# Observability

> **Transmission is disabled.** No `EXPO_PUBLIC_SENTRY_DSN` is set in any
> environment, so `enabled` is false and nothing leaves the device. This
> document describes what *would* be sent, and the controls that must hold
> before anyone sets a DSN.

The app holds glucose readings, insulin doses, meals, body metrics and free
text a patient typed to an AI. None of it may reach a third party.

## Where the rules live

| Concern | Location |
|---|---|
| Scrubbing + configuration | `src/lib/observability.ts` — pure, no runtime Sentry import |
| Proof it works | `tests/domain/observability.golden.test.ts` — runs in the normal suite |
| Initialization | `src/app/_layout.tsx` |
| Boundary reporting | `src/components/AppErrorBoundary.tsx` |

The scrubbers are pure functions on purpose: it means "sensitive values are
removed" is a **checked property in CI**, not a claim in a comment.

## Configuration

| Option | Value | Why |
|---|---|---|
| `enabled` | `!!dsn && !isDev` | No DSN anywhere ⇒ off. Off in development regardless. |
| `sendDefaultPii` | `false` | Never attach identity by default |
| `tracesSampleRate` | **`0`** | Transaction names are route-derived, and `/program` carries body weight in its params. No traces until that is fixed at the source. |
| `maxBreadcrumbs` | `20` | Smaller blast radius |
| `beforeSend` | `scrubEvent` | Last gate before transmission |
| `beforeBreadcrumb` | `scrubBreadcrumb` | Navigation fails closed |

**Scrubbing runs in every environment, including development** — so it is
exercised continuously rather than only on the one path that transmits.

## Scrubbing rules

**URLs** — query string and fragment removed. A path may be reported; a value
may not.

**Free text** (messages, exception values) — JWTs, `sb_publishable_*` /
`sb_secret_*` keys, `Bearer` tokens and project URLs are replaced with
`[redacted]`; text is truncated to 500 characters. This is best-effort: it
catches credential *shapes*, not every possible interpolation. Structured
fields, below, are strictly enforced.

**Structured fields** (`extra`, `contexts`, `tags`, breadcrumb `data`) — walked
to a depth of 6; any key matching the sensitive pattern has its **value**
replaced with `[redacted]`:

> glucose · blood · sugar · hba1c · a1c · bg · dose · insulin · iob · bolus ·
> ratio · correction · carb · nutri · meal · food · recipe · weight · height ·
> bmi · birth · age · diabet · lab\* · report · email · phone · name · user ·
> patient · doctor · promo · token · key · secret · password · auth · jwt ·
> dsn · session · note · message · text · content · prompt · transcript ·
> answer · chat

A short allowlist of structural keys survives: `environment`, `release`,
`platform`, `os`, `device`, `app`, `runtime`, `level`, `type`, `handled`,
`mechanism`, `boundary`, `app_version`, `build`.

Non-serialisable values (functions, symbols) are not forwarded.

**Identity** — `event.user` and `server_name` are deleted outright. A crash
report is useful without knowing which patient produced it, and a Supabase
`user_id` is a direct handle on their health record.

**Request** — path only. `query_string`, `headers`, `cookies` and `data` are
removed.

**Navigation breadcrumbs — fail closed.** Any navigation crumb whose `to`,
`from`, `url` or message carries a query string is **dropped entirely** rather
than parsed. Deciding which params are safe is exactly the judgement that
should not be made at report time.

## Error Boundary integration

`AppErrorBoundary` reports the `Error` object and one tag — `boundary:
"generic" | "clinical"` — and **nothing else**. No props, no store, no screen
state. The component renders precisely because that state is untrustworthy.

The `clinical` tag is the useful part: it distinguishes "a crash happened" from
"a crash happened on the insulin screen".

## Environments

| | Development | Preview | Production |
|---|---|---|---|
| Transmits | ❌ never | only with a DSN | only with a DSN |
| Scrubbing | ✅ active | ✅ active | ✅ active |
| Traces | 0 | 0 | 0 |
| Source maps | n/a | disabled | disabled |

Source-map upload stays off (`SENTRY_DISABLE_AUTO_UPLOAD: "true"` in
`eas.json`). Enabling it needs an auth token and a deployment decision — out of
scope.

## Known and unremediated

**Body weight in the `/program` route params.** `program-setup.tsx:196-206`
navigates with `weight`, `targetWeight`, `rate` and `constraints` (JSON,
including dietary avoidances). The navigation-fails-closed rule means these
breadcrumbs are dropped rather than sent — but **the underlying issue is the
navigation, not the reporter**. Fixing it means changing how the program screen
receives its parameters, which is app behaviour and needs its own step.

Until that is fixed, `tracesSampleRate` must stay `0`.

## Before ever setting a DSN

1. Fix the `/program` param issue at the source.
2. Re-read this document and confirm the scrub tests still pass.
3. Decide source maps and the auth token separately.
4. Set the DSN in **preview first**, and inspect real payloads before production.
