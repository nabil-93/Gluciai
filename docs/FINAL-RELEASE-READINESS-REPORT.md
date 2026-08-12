# FINAL RELEASE READINESS REPORT — GluciAI

**Date:** 2026-08-10 (supersedes the 2026-08-09 edition)
**Source of truth for findings:**
[FINAL-STRICT-ANDROID-IOS-GENERAL-AUDIT.md](FINAL-STRICT-ANDROID-IOS-GENERAL-AUDIT.md) ·
[CLINICIAN-DECISION-PACK.md](CLINICIAN-DECISION-PACK.md)

---

## 1 · CURRENT COMMIT

| | |
|---|---|
| HEAD | `43da9f1` — unchanged, **no commit made** |
| vs `origin/main` | identical, **nothing pushed** |
| Working tree | 14 modified · 12 added, all uncommitted |
| Vercel production | `43da9f1` — **does not contain this session's fixes** |
| Android APK `115139b3` | built from `6bf88e4` — **7 commits behind HEAD**, predates every fix here |

---

## 2–7 · VERIFICATION GATES

| # | Gate | Result | Notes |
|---|---|---|---|
| 2 | Unit tests | ✅ **1299 / 1299**, 51 files | was 1183 / 47 at session start (+116) |
| 3 | TypeScript | ✅ clean | |
| 4 | Lint ratchet | ✅ 6 = 6 baseline | no new findings, baseline **not** regenerated |
| 5 | Web build | ✅ `Exported: dist` | |
| 6 | **Security suite** | ✅ **121 / 121, 7 files** | 🎉 **run for the first time ever** |
| 6b | Edge import check | ✅ 23 shared symbols | |
| 7 | Migration drift | ✅ **34 = 34, no drift** | verified by `scripts/check-prod-drift.mjs` |

The security suite ran against a **fresh local database rebuilt from all 34
migrations**, which independently proves the migration chain is reproducible
from scratch and that `0033` breaks nothing.

---

## FIXED

### Production database — **APPLIED AND VERIFIED IN PRODUCTION** 🔴→✅

Migrations `0030`–`0034` are applied. This closes the single most serious
finding of both audits. Every effect was measured against live production
**before** applying, and re-measured after.

| Check | Before | After |
|---|---|---|
| Migrations applied | 29 | **34** |
| `product_catalog_update` policy | `(NOT verified)` — **no ownership predicate** | `((NOT verified) AND (contributed_by = auth.uid()))` |
| `upsert_product` | SECURITY **INVOKER** + `p_source='user'` override branch | SECURITY **DEFINER**, fill-gaps-only, override branch gone |
| Clinical / domain CHECK constraints | 0 | **3, all `convalidated`** |
| `touch_updated_at` search_path | mutable | pinned |
| Restricted functions after `0030`'s blanket grant | 9 | **9 — nothing opened** |

**Why this was safe, measured not assumed:**
- `0030` — all 30 tables × 3 roles already held all 7 privileges, and **9 of 9**
  currently-restricted functions matched its revoke list exactly, including the
  three asymmetric ones where `authenticated` correctly keeps access. Verified
  no-op.
- `0031` / `0032` — `NOT VALID`; 0 of 15 profiles and 0 of 44 meal_scans violate.
- `0033` — `product_catalog` holds **0 rows**; zero conflict possible.
- `0034` — data confirmed clean first; `touch_updated_at` body verified
  byte-identical to production before `create or replace`.

Rollback SQL was captured from production before applying and is held in the
session scratchpad. No patient data was read, modified or deleted.

### Application code — 5 fixes, all with regression fixtures

| ID | Fix | Fixtures |
|---|---|---|
| **B-1** | Arabic RTL: `forceRTL` only applies at next launch, so `setAppLanguage` now returns `{restartRequired}` and both call sites tell the patient. New pure leaf `src/i18n/direction.ts`. Deliberately **not** `expo-updates` — that is decision E-6. | 6 |
| **B-2** | Scheduled OS notifications were hardcoded French while the preview screen was localized. 5 literals → 9 keys × 4 locales; French byte-identical so French output does not move. Reschedules on `[i18n.language]`. | 6 |
| **B-3** | A denied camera permission had no way back — `Linking.openSettings()` existed nowhere. New pure `permissionAction` + `requestOrOpenSettings`, wired into 3 screens. | 6 |
| **B-4** | The bolus screen had no glucose plausibility guard, contradicting `bolusEngine.ts`'s own comment. A refused reading is now **withheld** from the engine (`noGlucose`) rather than producing a phantom hypo. **Engine untouched.** | 5 |
| **C-9** | Account deletion left meal photos and avatars in **public** buckets forever. Now deletes `<uid>/` from all three per-user buckets before the auth user; refuses to report success if a file survives. | 4 |

### Tooling and coverage

| Item | Detail |
|---|---|
| **G-8 drift detection** | `scripts/check-prod-drift.mjs` — the control whose absence caused the whole migration gap. Windows `spawnSync ENOENT` bug found and fixed during this pass; handles both CLI output shapes; exits **2** (never 0) when the comparison cannot be made. |
| **Independent bolus validation** | 33 fixtures, reference implementation written from pump-therapy convention, **not** from the engine. |
| **Independent nutrition validation** | 27 fixtures against USDA reference values. |
| **Scan failure honesty** | 23 fixtures — `scanErrorKey` and the `aiFetch` retry policy had **zero coverage**, despite being the exact defect two commits fixed. |
| **Remediation regressions** | 32 fixtures for B-1…C-9. |

---

## VERIFIED

- **Bolus arithmetic** — 35 independent cases, **0 disagreements** with the
  engine's own model. IOB decay matches `dose × (1 − t/DIA)` exactly; trend
  matches Δmg/dL ÷ Δmin exactly.
- **GL identity** — `GL = GI × carbs / 100` exact across 9 cases.
- **Plate aggregation** — 958 kcal / 162.4 g C / GI 53 / GL 86 matches
  independent USDA arithmetic to the digit; carb-weighting is genuinely weighted
  (68 vs a naive 53 on a discriminating plate).
- **Provenance** — unknown ≠ zero from provider → plate → bolus seed; the
  evidence gate correctly withholds a verdict from a 0 kcal plate.
- **Internal food DB** — 60 entries, all within 20 % of Atwater (worst 9.1 %),
  no sugar > carbs, no fibre > carbs, all carry a GI, all portions plausible.
- **RLS / auth boundary** — **121 tests, all passing**, against a fresh DB.
- **Migration chain** — reproducible from scratch, 34/34.
- **i18n parity** — 2153 + 13 new keys × 4 locales, 0 missing, 0 empty.
- **No secrets in the repository** — full git-index pattern scan.
- **Retry policy** — 429/500/502/503/504 and thrown fetches retried; 400/401/403
  returned intact, never retried; budget bounded at 3.

### Findings withdrawn or corrected on re-examination

| ID | Original | Corrected |
|---|---|---|
| **C-8** | `recipe_meta` RLS-no-policy is a defect | **FALSE POSITIVE** — deliberate service-role cache, stated in `0016` |
| **C-10** | Security issue | **Hardening only** — SECURITY INVOKER; the two DEFINER functions already pinned `search_path` |
| **S-5** | 3 anon-callable DEFINER functions need review | **NOT EXPLOITABLE** — `is_admin`/`is_my_patient`/`is_doctor` back **50 policies**; `usage_status` carries its own caller guard (`auth.uid() = p_user or is_admin() or is_my_patient()`, else `[]`); `my_usage_status` delegates to it |
| **A-2** | Exploitable now | **Was latent** — catalogue held 0 rows. Now closed regardless |
| **N-8** | "Nondeterministic" | **Deterministic but arbitrary** — first match wins on a tie |
| **N-1 example** | Lentils+bread → 87 · A · Excellent | **77 · B · "Good"** — the matrix hand-entered sugar 12 g where USDA gives 18.4 g. Caught by the new fixture |

---

## BLOCKED

| ID | Item | Exact blocker |
|---|---|---|
| **DEPLOY-1** | Vercel — none of the 5 app fixes are live | Deployment not authorized in this pass |
| **DEPLOY-2** | `delete-account` — C-9 is inert until deployed | Deployment not authorized |
| **DEPLOY-3** | Android APK rebuild | Required before any device test can validate B-1…B-4 |
| **G-9** | `lab-analyze` deployed from a local macOS path; content unknown | Deployment not authorized |
| **S-4** | Leaked-password protection disabled | Auth setting — dashboard toggle, no SQL/MCP path |
| **G-1** | iOS cannot build | No Apple Developer Program membership; `.expo/devices.json` = `{"devices": []}` |
| **DEVICE** | All 45 device flows | **No Android tooling on this machine** — no `adb`, no platform-tools, no emulator. Not merely "no device attached" |
| **E-9** | N-8 — which food record is authoritative | Nutrition-data decision |
| **E-10** | C-7 — native voice, or drop the mic permission | Product decision |
| **E-6** | `expo-updates` / OTA | Release-process decision |

---

## UNVERIFIED

| ID | Item | Why, and how to close it |
|---|---|---|
| **G-4** | Android target / min / compile SDK | Confirmed **not derivable** from this repo: `/android` is gitignored, no `expo-build-properties`, and a full `node_modules` grep found no gradle defaults — they come from the prebuild template fetched at build time. Close it from the build log: `https://expo.dev/accounts/tsuhel/projects/glucoai/builds/115139b3-f04e-44b6-86b2-038a76a0f80e` |
| **G-3** | iOS privacy manifest, entitlements | Needs an archive; blocked by G-1 |
| **AI-SCAN** | Live AI scan accuracy | See §10 |
| **C-6** | `textAlign: 'left'` in `foods.tsx:330` | The "obviously correct" fix (`'auto'`) resolves differently on iOS (text direction) and Android (layout direction), so it could change the 3 LTR locales. Needs a device to choose correctly — **not** left unfixed out of neglect |
| **PERF** | Startup, bundle size, image compression, provider-chain latency | Not measured |

---

## 8 · ANDROID BUILD + DEVICE RESULTS

**Build:** last artifact `115139b3`, preview profile, versionCode 3, SDK 57.0.0,
from commit **`6bf88e4`** — 7 behind HEAD and predating all five fixes.
`runtimeVersion: undefined` confirms no OTA path.

**Device results: NONE. 0 of 20 executed.**

This machine has no `adb`, no Android platform-tools and no emulator, so no flow
could be run even in principle. Four flows are now *predicted* to pass and are
the highest-value confirmations available once an APK is rebuilt:

| Flow | Confirms | Predicted |
|---|---|---|
| **AF-15** Arabic RTL | B-1 | restart prompt appears; layout mirrors after restart |
| **AF-13** `18` in the bolus glucose field | B-4 | refusal + "did you mean 324?"; CTA disabled |
| **AF-04** camera denied twice | B-3 | button opens system Settings |
| **AF-17** notification in de/ar | B-2 | reminder arrives in the patient's language |

**Predicted is not passed.** None may be recorded as a pass without a device.

---

## 9 · iOS BUILD + DEVICE RESULTS

**Cannot build.** G-1 unresolved. 0 of 25 flows executed.

---

## 10 · SCANNER / AI VALIDATION

**Deterministic chain: VALIDATED** — 27 fixtures, USDA reference values.
GL identity exact, aggregation exact, provenance preserved, DB coherent.

**Failure honesty: NOW VALIDATED** — 23 new fixtures prove a server outage is
never reported to the patient as a phone problem: 503 and `ai_unavailable` →
"the service is busy"; 429/quota → its own sentence; only a genuinely
unclassified failure keeps the connection wording. The generic supabase-js
wrapper message is explicitly excluded from the "busy" path so a malformed
request cannot masquerade as an outage.

**Live AI scan accuracy: UNVERIFIED.** Stated plainly rather than approximated.
It needs weighed reference meals with known ground truth. The only real meal
photographs available are 18 patient images in the production `meal-images`
bucket; per your rule 9 I did not touch them. The matrix and harness exist;
what is missing is the reference data.

*To close:* photograph 15–20 weighed meals (bread, rice, pasta, legumes, potato,
fruit, dessert, mixed, partial, poor light, ambiguous, unknown), record true
grams and reference macros, scan each 3×, tabulate INPUT / EXPECTED / ACTUAL /
Δ / confidence / estimated? / PASS-FAIL.

---

## 11 · INDEPENDENT NUTRITION VALIDATION

27 fixtures. All arithmetic **MATHEMATICALLY CORRECT**. The open items are
methodology, not arithmetic, and each is pinned with numbers:

- GL 48 on a 150 g-carbohydrate plate → **95 · A · Excellent** (GL feeds nothing)
- 100 g olive oil → **92 · A · Excellent** (fat unscored)
- 2400 mg sodium scores **97**; the same meal with sodium absent scores **100**
- GL applies a 89 %-coverage index to 100 % of the carbohydrate (29 vs 25.7)
- Stored bucket "High" vs screen tag "medium" at GL 20.41
- Every score 80–84 is an "A" that is not "Excellent"

---

## 12 · INDEPENDENT BOLUS VALIDATION

35 cases. **0 disagreements with the engine's own model → MATHEMATICALLY
CONSISTENT.** That is the entire claim; it is **not** clinical validation.

Six divergences from pump-therapy convention, all one cause (P7-002 — IOB
subtracted inside the bracket), all pinned with **both** numbers:

```
exercise 0.75 + 3 U IOB                app 2.3   convention 1.5   +0.8
illness 1.15 + 3 U IOB                 app 3.5   convention 3.9   −0.4
stress 1.10 + 3 U IOB                  app 3.3   convention 3.6   −0.3
exercise + illness                     app 2.6   convention 2.2   +0.4
alcohol + 3 U IOB                      app 3.8   convention 3.5   +0.3
BG 300 · 60 g · IOB 7.5 · exercise     app 1.5   convention 0.0   +1.5  ← worst
```

---

## 13 · SECURITY / PRIVACY

| Item | Status |
|---|---|
| `product_catalog` write authorization | ✅ **CLOSED in production** |
| `upsert_product` provenance laundering | ✅ **CLOSED in production** |
| Clinical / domain constraints | ✅ **3 added and validated in production** |
| RLS / auth boundary suite | ✅ **121/121, first run** |
| Anon-callable DEFINER functions | ✅ **not exploitable** — evidence in VERIFIED |
| `touch_updated_at` search_path | ✅ pinned |
| Secrets in repo | ✅ none |
| Crash-reporting privacy | ✅ exemplary; Sentry disabled |
| Account deletion completeness | ⚠️ fixed in code, **not deployed** |
| Leaked-password protection | ❌ still disabled (S-4) |
| Public repo / `/panel-x7k42m/` | ⚠️ product decision (S-6) |

---

## 14 · REMAINING BUGS

**Engineering, objectively fixable, none left un-attempted.** What remains is
either blocked on a decision or on a device:

N-8 (data decision) · N-1, N-2, N-3, N-7, C-1, C-3, C-4 (all D-5 / D-2) ·
C-6 (device) · C-7 (E-10) · S-4 (dashboard) · S-6 (product).

---

## 15 · REMAINING CLINICAL DECISIONS

Unchanged and fully prepared in
[CLINICIAN-DECISION-PACK.md](CLINICIAN-DECISION-PACK.md):
**D-1** mixed-meal GI (ask first) · **D-2** dosing arrangement (+1.5 U) ·
**D-3** glucose bound (15.5 U from a typo) · **D-4** correction step (0 → 1.1 U) ·
**D-5** scoring model (oil → A) · **D-6** hypo first aid in ar/de/en.

---

## 16 · REMAINING UNVERIFIED

G-4 · G-3 · live AI scan accuracy · C-6 · performance. All listed above with the
exact action that closes each.

---

## 17 · DEPLOYMENT STATUS

| Target | State |
|---|---|
| **Supabase database** | ✅ **DEPLOYED — 34/34, verified, no drift** |
| Supabase Edge Functions | ❌ `delete-account` not deployed; `lab-analyze` needs re-deploy |
| Vercel | ❌ `43da9f1` — no session fixes |
| GitHub | ❌ nothing committed or pushed |
| Android | ❌ APK 7 commits stale |
| iOS | ❌ cannot build |

Local Supabase stack is still running. Stop it with `npx supabase stop`.

---

## 18 · FINAL VERDICT

# BLOCKED

Not NOT READY — the picture genuinely changed this pass. The critical
production security finding that survived two audits is **closed and verified**,
the security suite passes 121/121 for the first time, every objectively fixable
engineering bug is fixed with fixtures, and the suite grew 1183 → 1299.

It is **BLOCKED** rather than READY FOR ANDROID BETA on three things, none of
which is an engineering task:

1. **Nothing is deployed.** Five patient-facing fixes sit uncommitted. Vercel
   serves a build without them; the APK is 7 commits older still.
2. **Zero device validation is possible on this machine** — no adb, no
   platform-tools, no emulator. The four flows that would validate this pass's
   work cannot be run here at all.
3. **Six clinical decisions remain unanswered**, including a dosing arrangement
   quantified at **1.5 U** in a realistic exercise-plus-stacking case.

**The path to READY FOR ANDROID BETA is now short and fully specified:** commit
and push → deploy Vercel and `delete-account` → rebuild the APK → run AF-15,
AF-13, AF-04, AF-17 on any Android phone. Nothing in that list requires a
decision from anyone.

**RELEASE READY additionally requires D-1…D-6.** Until a diabetologist answers
them, this cannot be a product that tells a patient how much insulin to inject —
however green the gates are.

---

```
PHASES COMPLETED           : 0,1,2,3,4,5,8,9,10  (6,7 blocked — no device/Apple)
FIXED                      : 5 app bugs · 5 migrations applied · 1 tooling bug
VERIFIED                   : 1299 unit · 121 security · 34/34 migrations · no drift
BLOCKED                    : 10  (4 deploy · 1 Apple · 1 device · 1 dashboard · 3 decisions)
UNVERIFIED                 : 5   (G-4, G-3, AI scan, C-6, performance)
CLINICIAN DECISIONS        : 6   (D-1 … D-6)
DEVICE TESTS               : 0 of 45 — no Android tooling present
PRODUCTION STATUS          : database DEPLOYED ✅ · app NOT deployed ❌
FINAL RELEASE STATUS       : BLOCKED
```
