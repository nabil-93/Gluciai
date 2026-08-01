# Lint baseline

> The baseline is a ledger of **known debt**, not permission to ignore it.

The project is not lint-clean. Five errors and two warnings pre-date the CI
pipeline. Gating on zero would have made CI red from its first run; dropping
lint would have lost the signal entirely. So `.github/lint-baseline.json`
records every known finding by **file + line + rule + severity**, and CI fails
the moment that set grows.

Enforced by `scripts/ci/lint-ratchet.mjs`, which runs the project's own
`npm run lint` (`expo lint`) — not a bare `eslint .`, which additionally walks
`supabase/functions` and reports ~250 unresolvable `jsr:` imports from Deno
source the Node config was never meant to lint.

## Behaviour

| Situation | Result |
|---|---|
| A new finding appears | ❌ **fail** |
| A known finding moves to a different line | ❌ **fail** — it reads as one removal plus one addition |
| A known finding is fixed | ✅ pass, and the run prints the entry to drop |
| Nothing changed | ✅ pass |

Line sensitivity is deliberate. It does mean an unrelated edit *above* a known
finding shifts its line and fails the run until the baseline is regenerated —
that is the intended trade-off: the baseline should be re-examined whenever the
file around it changes.

Tightening is always deliberate:

```bash
node scripts/ci/lint-ratchet.mjs --update
```

Run that only as part of an authorized change, and say so in the commit.

## Current contents — 5 errors, 2 warnings

| File | Line | Rule | Severity |
|---|---|---|---|
| `src/app/ai-chat.tsx` | 489 | `react-hooks/set-state-in-effect` | error |
| `src/app/program.tsx` | 250 | `react-hooks/set-state-in-effect` | error |
| `src/app/program.tsx` | 320 | `react-hooks/set-state-in-effect` | error |
| `src/components/InstallPrompt.tsx` | 117 | `react-hooks/set-state-in-effect` | error |
| `src/components/ui/PastDayBanner.tsx` | 59 | `react-hooks/set-state-in-effect` | error |
| `src/app/(tabs)/index.tsx` | 99 | `@typescript-eslint/no-unused-vars` | warning | *(was 92 — moved by Step 22B imports)*
| `src/app/wizard.tsx` | 448 | `@typescript-eslint/no-unused-vars` | warning |

## Why each is still here

Assessed before the baseline was accepted. **No automated test covers any of
these files** — the 322 unit tests are engine-level in a node environment with
no React rendering — so every fix is verified by observation in the running app.

| Finding | Risk | Why it is carried |
|---|---|---|
| `InstallPrompt.tsx:117` | 🟢 low | Cosmetic PWA banner, derivable during render. Safest to fix first. |
| `ai-chat.tsx:489` | 🟡 low–med | Clears the TTS "speaking" marker on thread switch. Fixable with the same render-phase pattern as `DoseHero`, but exercising it needs TTS, which needs an edge function — so Demo Mode may not verify it. |
| `PastDayBanner.tsx:59` | 🟠 medium | `useSelectedDay()` mirrors `?date=` into state. Decides **which day's data every detail page shows**; getting it wrong misattributes clinical data. Fixable, but earns full browser verification. |
| `program.tsx:250` and `:320` | 🔴 high | Not prop-mirroring — orchestration. `prepareWeek()` sets three states synchronously before its first `await`, and `createFromParams()` builds an entire 4-week programme. Both already carry deliberate `eslint-disable-next-line react-hooks/exhaustive-deps`. Careless changes risk double-generation, a skipped week, or breaking the account-claim ordering that stops one account's programme appearing under another's. Needs its own scoped step, not a lint edit. |

Each fix **tightens** the baseline. The count should only ever move down.
