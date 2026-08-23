# Slow sign-in / sign-out — what was measured, what was fixed, what is left

Investigated 2026-08-23. Two separate causes, only one of which is ours.

---

## 1. The part that is ours (fixed)

The app and the dashboard were multiplying whatever latency the backend had.

### `supabase.auth.getUser()` was called 18 times across the codebase

`getUser()` is **not** a local read. It sends `GET /auth/v1/user` and waits for
the server to read the token back to us — a token the device already has in
local storage. Several of those calls ran on every launch, several in parallel.

The project's own auth log shows it plainly: at `17:44:27` **four** `/user`
requests land in the same second; at `17:43:33`, **three** more. That is one
cold start.

Replaced with `currentUserId()` (`src/lib/supabase.ts`), which reads the stored
session and caches the id in memory, refreshed from `onAuthStateChange`.

*Is that safe?* Yes. The id is used for one thing: filling the `user_id` filter
on queries. What a client claims its id is has never been what protects a row —
RLS re-derives the identity from the JWT server-side on every request. A
tampered local value gets the same refusal it always would have.

**Measured after the change** — cold boot with a session, all requests on the
wire:

```
/rest/v1/rpc/my_usage_status   405ms
/rest/v1/rpc/touch_last_seen   402ms
/rest/v1/feature_access        398ms
/rest/v1/profiles              399ms
/rest/v1/glucose_logs          405ms
/rest/v1/insulin_logs          406ms
/rest/v1/meal_scans            400ms
/rest/v1/activity_logs         392ms
/rest/v1/measure_logs          401ms
/rest/v1/chat_history          407ms
/rest/v1/ai_reminders          399ms
/rest/v1/event_logs            398ms
/rest/v1/lab_reports           392ms
/rest/v1/app_alerts            391ms
```

Fourteen requests, all in parallel, **zero `/auth/v1/*`**.

### Signing in waited for the whole history before showing anything

`auth.tsx` did `await hydrateFromServer()` between the successful sign-in and
the first screen: ten tables, up to 5 000 rows each, plus a re-push of anything
the server had not seen. The patient was authenticated and still watching a
spinner.

The only thing that genuinely had to happen first is the account-switch guard —
on a shared phone the previous person's data must be gone before a screen can
show it. That is a local wipe (`claimAccount`, new in `useAppStore`) and costs
nothing. The pull now belongs to the tabs layout alone, which already ran it on
every open; `hydrateFromServer` also grew a re-entrancy guard so two callers
share one run instead of racing.

### Signing out could not finish, and could silently fail

`supabase-js` revokes the token on the server **before** deleting the local
copy, and **returns early on a network error** — so a sign-out that could not
reach the server left the session on the device. The patient was told they were
signed out; the next launch signed them straight back in. On a shared phone
that is the previous person's account opening by itself.

On top of that, nothing bounded the call, so the button could sit there
indefinitely.

`services/account.signOut()` now: wipes local state synchronously first, then
asks for the revoke with a 4 s bound, then deletes the stored session by hand
whatever happened. Measured tap→login-screen: **23 ms**. Covered by
`tests/domain/signOutLocalFirst.golden.test.ts`.

The dashboard had the identical bug and got the identical fix
(`clearPanelSession` in `public/panel-x7k42m/app.js`).

### Smaller things fixed along the way

| | |
|---|---|
| `app/index.tsx` | Routed on persisted flags **before** AsyncStorage had been read, so the defaults (all `false`) sent a signed-in patient to `/welcome`. Now gated on rehydration via `useSyncExternalStore`. |
| `app/(tabs)/_layout.tsx` | A session that died while the app was closed left the patient on a dashboard where every request failed silently. Now routed to `/auth`. Asks whether a session is *stored*, never whether it can be refreshed — being offline is not being signed out. |
| `lib/supabase.ts` | `AppState` wiring for `startAutoRefresh`/`stopAutoRefresh`. Without it the refresh timer never fires on a backgrounded phone, so every request after reopening pays a refresh first. |
| `app/auth.tsx` | `email.trim()`. Phone keyboards add a trailing space, and the backend answered "invalid credentials" for a correct address. |
| `panel/boot()` | A failed *read* of `profiles` signed the admin out with "Accès réservé aux médecins" — one dropped request looked like a revoked role. Only an answer that actually arrived may end the session now. |
| both | A 60 s backstop on sign-in, and a "the server is being slow" note after 6 s, so a wait is explained instead of mysterious. |

---

## 2. The part that is not ours — Supabase Auth on this project

**`ftqyzpkzqeudzfztataz` (eu-west-1, free plan) intermittently takes 20–60
seconds to answer any `/auth/v1/*` request, while spending 1–2 ms doing the
work.**

The cleanest single measurement:

| | |
|---|---|
| Request | `GET /auth/v1/settings` (a trivial config read) |
| Sent | `2026-08-23T17:58:20Z` |
| Answered | `2026-08-23T17:59:05Z` — **44.2 s** end to end |
| GoTrue's own `duration` for it | **1 724 518 ns = 1.72 ms** |
| Request id | `01a02fc6-0345-755e-af69-2c73c89c89f1` |

So ~44 seconds were spent in front of the auth service, not inside it.

It is not the network, the client, or the database:

* DNS 6 ms, TCP connect 33 ms, TLS 78 ms on the same connection.
* `GET /rest/v1/` on the **same host at the same moment**: 150 ms.
* Same behaviour from two independent clients (curl and Chromium), so it is not
  one library or one proxy.
* Without the `apikey` header the gateway rejects in 150 ms; with it — i.e. once
  the request is actually forwarded to GoTrue — it stalls. The slowness is
  behind the gateway.
* Postgres is idle: 22 of 60 connections, 1 active, no lock waits, nothing in
  the logs.
* `auth.users` = 17, `auth.sessions` = 31, `auth.refresh_tokens` = 96. There is
  no data volume here to be slow about.

**It is intermittent.** During one window every auth call took 20–55 s
(`/user` ×3: 39.8 s, 39.6 s, 53.0 s; `/health` ×3: 39.5 s, 46.5 s, 34.9 s).
Twenty minutes later, twelve consecutive `POST /auth/v1/token` calls returned in
**86–156 ms**. That on/off pattern is exactly what "sometimes it hangs forever,
then it goes in" describes.

Server-side durations from the auth log, for scale — the work itself is always
fast, in both windows:

```
POST /token   244 ms · 155 ms · 98 ms
GET  /user    123 ms · 71 ms · 53 ms · 21 ms · 12 ms · 2.9 ms
POST /logout   43 ms · 6.4 ms
GET  /settings  3.7 ms · 1.7 ms
```

### What to do about it

1. **Restart the project** — Supabase dashboard → Settings → General → Restart
   project. This recycles the auth container and is the first thing to try.
2. **If it comes back, open a Supabase support ticket** and give them: the
   project ref, the request id above, the 44.2 s-vs-1.72 ms pair, and the fact
   that `/rest/v1/` stayed at 150 ms throughout. That contrast is the whole
   case; without it the ticket reads as "my internet is slow".
3. **Consider leaving the free plan before launch.** Free projects run on shared
   compute with no resource floor, which is the most likely explanation for a
   service that is fine for twenty minutes and then stalls for ten. A clinical
   app cannot ship on a sign-in that sometimes takes a minute.

The client-side work above does not fix this — nothing in the app can. What it
does is stop multiplying it: a stall now costs **one** slow request instead of
five or six, and the patient gets told what is happening instead of watching a
frozen button.
