# GluciAI — Final Remaining-Issues Audit

**Date:** 2026-08-16 · **HEAD:** `7adb267` (+43 uncommitted) · **Not release-ready** — see §15.

---

## 1. Current state

| Gate | Result |
|---|---|
| Full suite | **1451 / 1451 PASS** (was 1448; +3 from this pass) |
| Clinical | **222 / 222 PASS — unchanged** |
| Security | **18 / 18 PASS** |
| TypeScript · Lint | **PASS** · **PASS** (6/6 baseline) |
| `nutrition-search` | **v4 ACTIVE**, `verify_jwt: true` |

### Changeset classification (43 files)

| Class | Count | Files |
|---|---|---|
| **A — intentional prior work** | 20 | registration lifecycle, auth/account errors, notifications, report/calendar localization + their tests |
| **B — F-1/F-2** | 11 | `nutrition-search/index.ts`, `providers/{usda,remote,barcodeLookup,openfoodfacts,userAgent}.ts`, `.env.example`, `apiKeyExposure` + 3 updated provider tests |
| **C — documentation** | 4 | `ANDROID-DEVICE-VALIDATION-REPORT`, `API-INTEGRATION-RESEARCH`, `FINAL-RELEASE-READINESS`, this file |
| **D — unrelated/unexpected** | **0** | — |
| **E — generated/temp** | **0** | no `node_modules`, `.expo`, `dist/`, logs or coverage in the changeset |
| **This pass** | 3 | `(tabs)/index.tsx` + test, this document |

**No migration, schema, production data, or clinical-engine file is touched.** Nothing staged; `main` level with `origin/main`.

---

## 2–4. Issue register

| ID | Area | Severity | Status | Evidence | Action required |
|---|---|---|---|---|---|
| **R-01** | Home timeline clock | Medium | **FIXED** | `(tabs)/index.tsx:2406` used `toLocaleTimeString('fr-FR')` while the same screen's header used `i18n.language` — Arabic/German patients read French-formatted times | none; 3 regression tests added |
| **R-02** | Account deletion | High | **VERIFIED** | Reachable under Security; permanence stated in 4 languages; `confirmAsync` + cancel; self-only via JWT; storage cleared **before** the auth user; storage failure returns 500 and leaves the account usable rather than falsely reporting erasure; errors mapped via `accountErrorKey`; success → `dismissAll` + `/auth`. Server-verified earlier (row counts 0, re-login rejected) **and** exercised live this session (`{"ok":true}`) | none |
| **R-03** | Registration lifecycle | High | **VERIFIED** | Exactly **one** `auth.signUp` in all of `src/` (`wizard.tsx:538`). Auth identity and onboarding completion are correctly distinct: `wizardDone` is persisted and raised **only after** a successful sign-up, so an abandoned wizard leaves no usable account and `index.tsx` routes back to `/auth`. Password lives in module memory only. Double-tap guarded; failure keeps answers and is retryable | none — architecture already matches the product requirement |
| **R-04** | Notifications — scheduled | High | **VERIFIED** | `refreshSmartReminders` binds `t` **inside** the function (resolves at scheduling time); `_layout.tsx` reschedules on `[i18n.language]`; `cancelAll` before rebuild makes it idempotent; 23 `reminders.*` + 10 `rappelsPage.*` keys × 4 locales, Arabic genuinely Arabic, `{{hour}}` parity held | none |
| **R-05** | Notifications — AI reminder tick | High | **VERIFIED** | `reminders.ts` (60 s tick, previously unaudited) binds `i18next.t` at call time; `firedTitle`/`followTitle`/`followBody` present in all 4 locales with `{{msg}}` parity | none |
| **R-06** | Notification body = patient's own words | — | **VERIFIED (by design)** | `r.message` is traced to `aiLogger.ts:531` → the reminder text the patient dictated. It is user content, not UI chrome, and is correctly **not** translated | none |
| **R-07** | Notification permission honesty | Medium | **FIXED (earlier pass)** | `refreshSmartReminders` returned `void` and swallowed denial, so the screen showed "Rappels activés ✓" when nothing was scheduled. Now returns `scheduled\|denied\|unavailable`; only `scheduled` claims success; denial offers Open Settings | none |
| **R-08** | Dialogs / modals | Medium | **VERIFIED** | Every `confirmAsync`/`notify` call site in the app passes `t(...)`. A mixed-language dialog is not reachable | none |
| **R-09** | `AppErrorBoundary.tsx:106` | Trivial | **OPEN** | `"Dev only — not shown in release"` — the only hardcoded UI string left app-wide, and it is inside a dev-only block | optional |
| **R-10** | `ai.ts` French date formatting | — | **VERIFIED (by design)** | `toLocaleDateString('fr-FR')` at `ai.ts:467/473/596/648` builds **prompt text for the model**, not UI. Stable formatting is desirable there | none |
| **R-11** | `ai-call.tsx` BCP-47 tags | — | **VERIFIED (by design)** | `fr-FR`/`de-DE`/`en-US`/`ar-MA` are speech-recognition identifiers, not display strings | none |
| **R-12** | OFF rate limit | Medium | **OPEN — FUTURE HARDENING** | See §12 | monitor |
| **R-13** | FatSecret / Edamam unconfigured | Medium | **PRODUCT DECISION REQUIRED** | See §13 | decide |
| **R-14** | Scanner real-photo accuracy | High | **UNVERIFIED** | No camera, no controlled reference meals | §8 |
| **R-15** | Android device validation | High | **BLOCKED** | No phone; emulator reaped by the sandbox (5 strategies) | §7 |
| **R-16** | iOS | High | **BLOCKED** | No Apple Developer team; export-compliance declaration is the owner's | — |
| **R-17** | Bolus / IOB / GI-GL / scoring | High | **CLINICAL DECISION REQUIRED** | P7-002, P7-011, D-1…D-6 | §6 |
| **R-18** | GTIN with leading zero | Low | **OPEN (upstream limit)** | `0044000032029` → null. Our `strip()` normalises both sides correctly (verified equal); **FDC's text search returns no record for the padded query**, so the function never receives a row. Pre-existing; scanners emit the unpadded form | none |

---

## 5. Product decisions required
- **R-13** — FatSecret and Edamam secrets are absent in production, so tiers 4–5 of the chain are inert.
- **R-16** — `ITSAppUsesNonExemptEncryption`: a legal declaration, not an engineering value.
- **`weeklyReport.ts`** — ~20 French sentences reach the report's AI summary in every language. Shared with the French PDF, so localizing it changes a service that document depends on.

## 6. Clinical decisions required
**P7-002** (activity scales the IOB deduction — 2.3 U vs 1.5 U) · **P7-011** (premix excluded from IOB) · **D-1** mixed-meal GI *(ask first, alone — it gates the rest)* · **D-2** RU-11 Q1–Q14 · **D-3** glucose plausibility bound · **D-4** correction discontinuity · **D-5** RU-3 scoring · **D-6** band unification.
**Nothing clinical was modified in this pass.**

## 7. Device-only validation required
Registration E2E (12 checks) · 23 Android flows · notification **delivery** in 4 languages · FR/EN language persistence across restart · background/foreground lifecycle · **camera, barcode, network toggling, biometrics, performance** (physical phone) · all iOS.

## 8. Scanner status
**Functional (static): VERIFIED** — camera route + permissions with an Open-Settings recovery path, gallery fallback, loading, `scanner.noDetect` for unidentified food, retry, errors mapped through `scanErrorKey` (never raw), nutrition parsing/rendering pinned by golden suites, meal creation, and **uncertainty propagation** (`carbStatus`/`plateCarbStatus` gate what is presented as dosable; the scanner has no direct bolus handoff).
**REAL NUTRITIONAL ACCURACY: UNVERIFIED — device + controlled reference meals required.** No values invented.

## 9. Notifications / localization
**CODE: VERIFIED** across both notification services, all 4 languages, including detail/modal/error/permission paths and Arabic RTL (inherited, no forced `textAlign`/`writingDirection`).
**RUNTIME DELIVERY: BLOCKED** — permission was denied during the device pass, so no notification has ever been delivered. Correct code is not proof of delivery.

## 10. Account deletion — **VERIFIED** (see R-02)
## 11. Registration flow — **VERIFIED** (see R-03)

## 12. OFF rate limit — **OPEN — FUTURE HARDENING**
- **Device-side** (barcode reads, product search): each patient's **own IP**, which fits OFF's 15 req/min naturally. Correct by design; moving it server-side would make things worse.
- **Server-side** (`food-search`, OFF **search**, 10 req/min): shared egress IP. **Mitigating fact found in this pass — it has exactly one caller, `worldFoods.ts` (a browse feature), not the scan hot path**, so realistic exposure is much lower than feared.
- **Caching:** `product_catalog` (barcodes) + `cache.ts` (search hits; misses deliberately not cached).
- **Throttling:** none. Abuse path is theoretical and needs an authenticated user.
- **Not redesigned**, as instructed. Options: local OFF mirror from daily exports, or a server-side token bucket.

## 13. FatSecret / Edamam — **PRODUCT DECISION REQUIRED**
Used only as **tiers 4–5** of `PROVIDER_CHAIN` (`moroccan → usda → openfoodfacts → fatsecret → edamam`). Both are written to return `null` when their secrets are missing, and `resilient()` treats `null` as "fall through" — so **their absence cannot break the chain**; it only narrows coverage. Current behaviour when unavailable is **safe**. No credentials were added.

## 14. Test results
**Full 1451/1451** · **Clinical 222/222 (unchanged)** · **Security 18/18** · **TypeScript PASS** · **Lint PASS**.
Delta +3 = the three R-01 regression tests. No test weakened, deleted, or skipped.

## 15. Release blockers
1. **Android device validation** — R-15
2. **Notification runtime delivery** — R-04/R-07 proven in code, never delivered
3. **Scanner nutritional accuracy** — R-14
4. **Clinical validation** — R-17
5. **iOS** — R-16

## 16. Next actions, in priority order
1. **Run a persistent Android emulator outside the sandbox** — unblocks blockers 1–2 and 7 of 12 blocked flow groups. Highest leverage, lowest cost.
2. **Ask the diabetologist D-1 first, alone** — it gates every other GI/GL decision.
3. **Decide FatSecret/Edamam** (R-13) — configure or accept narrower coverage.
4. **Assemble controlled reference meals** for scanner accuracy (R-14).
5. **Apple Developer membership** + the export-compliance answer (R-16).

---

## NET-1 — RESOLVED (2026-08-17)

**Before:** `DIRECT TEST COVERAGE = MISSING`
**After:** `DIRECT TEST COVERAGE = VERIFIED`

`src/services/nutrition/resilience.ts` wraps every provider in the chain
(`engine.ts:50`) with a timeout, one retry and a never-throw fallback. **No test file
referenced it.** Its behaviour was only exercised indirectly through provider suites,
which pass whether or not the timeout ever fires and cannot distinguish "one retry" from
"none" or "three". A regression would have surfaced as a hung scan or an unhandled
rejection during a network failure — neither visible to those suites.

### Now directly verified — `tests/domain/resilience.golden.test.ts` (24 tests)

| Behaviour | Evidence |
|---|---|
| **Timeout** | A provider that never settles resolves to `null`; one slower than `PROVIDER_TIMEOUT_MS` is abandoned even though it would eventually answer; one answering just inside the window still wins; the timeout is configurable per call site |
| **Retry** | A transient failure is retried **once** and the retry's hit is returned; a permanently failing provider is called exactly `1 + PROVIDER_RETRIES` times; `retries: 0` disables it; `retries: 3` gives 4 calls; a first-attempt **timeout** is retried like any other failure |
| **Recovery** | Attempt 1 throws → attempt 2 succeeds → the hit is returned |
| **Final failure** | Both attempts fail → `null`, never a throw |
| **Fallback** | A dead provider yields `null` so the engine reaches the **next** provider; when all fail the chain ends with no hit and no throw — the contract `engine.ts` is built on |
| **Never-throw** | Async rejection, **synchronous** throw, and rejections carrying `undefined` / `null` / string / number / object are all swallowed |
| **No unhandled rejection** | Asserted with a `process.on('unhandledRejection')` probe, including a provider that rejects *after* its timeout already fired |
| **No infinite loop** | Call count pinned to `1 + retries`; worst case bounded by `(1 + retries) × timeout` |
| **Transparency** | `id` and `label` preserved (provenance would otherwise be rewritten); the original provider object is not mutated; each wrapped provider retries independently |
| **Contract constants** | `PROVIDER_TIMEOUT_MS = 2000`, `PROVIDER_RETRIES = 1` pinned — they are part of the engine's latency budget |

Only the **provider** (the network boundary) is faked; the timeout, retry loop and
fallback are the production ones. Fake timers make the timeout cases deterministic
instead of costing 2 s each.

### The tests were mutation-checked

To confirm they are not vacuous, two single-change mutants were introduced in a scratch
copy and then reverted:

| Mutation | Failures |
|---|---|
| retry bound `attempt <= retries` → `attempt < retries` | **8 tests fail** |
| `withTimeout(provider.search(q), ms)` → `provider.search(q)` | **6 tests fail** |

`git diff -- src/services/nutrition/resilience.ts` is empty afterwards: the production
file was restored byte-identical. **No production code was changed to close NET-1.**

### Status distinction preserved

```
AUTOMATED NETWORK RESILIENCE      : VERIFIED
ANDROID IN-SESSION NETWORK RECOVERY : UNVERIFIED  ← unchanged
```

Android offline launch and recovery were device-verified in session 2; **in-session**
loss during an active scan still requires a device and is **not** claimed here.
