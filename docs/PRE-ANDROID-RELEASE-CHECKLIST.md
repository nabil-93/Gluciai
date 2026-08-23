# GluciAI — Pre-Android-Release Checklist

**Date:** 2026-08-17 · **HEAD:** `7adb267` (+uncommitted) ·
**Status: ENGINEERING READY — PENDING PHYSICAL ANDROID VALIDATION**

Every fixable engineering gap found across sessions 1–11 is closed. What remains is
**(a)** real-device validation — see
[`ANDROID-PHYSICAL-VALIDATION-CHECKLIST.md`](./ANDROID-PHYSICAL-VALIDATION-CHECKLIST.md) —
**(b)** clinician decisions on exercise/insulin, and **(c)** three product decisions.

**Gates:** Full **1518/1518** · Clinical **222/222 unchanged** · Security **18/18** ·
TypeScript **PASS** · Lint **PASS** (6/6 baseline) · Edge-import check **PASS**.

---

| Area | Status | Evidence | Remaining Action |
|---|---|---|---|
| **Account creation lifecycle** | **VERIFIED** | Device + production Supabase: `auth.users` empty at steps 1 / 8 / 11 / immediately before the final tap; exactly **1** row after. Profile persisted incl. `phone` | none |
| **Account deletion** | **VERIFIED** | Device + backend: cancel leaves 1 user / 1 profile; confirm → users 0, profiles 0, glucose_logs 0, insulin_logs 0; session invalidated; restart does not restore; re-login rejected with a **localized** message | none |
| **Auth errors** | **FIXED** | `authErrors.ts` — 8 vetted keys × 4 locales; wrong-password and unknown-account deliberately share one key (anti-enumeration). Confirmed live on device | none |
| **Account/password errors** | **FIXED** | `accountErrors.ts` — 7 keys × 4 locales; raw `r.error` no longer rendered on **either** the deletion or password path | none |
| **Registration architecture** | **VERIFIED** | Exactly one `auth.signUp` in all of `src/`, in the wizard's final step; password in module memory only | none |
| **Notification scheduling** | **VERIFIED (device)** | Two `RTC_WAKEUP` alarms, times matching the UI | none |
| **Notification payload + tap routing** | **FIXED** | `notificationRoute.ts` + `notificationRouting.ts`; 40 tests: foreground / background / **cold start**, invalid payload, unknown type, safe fallback, privacy | **delivery** needs a phone |
| **Notification permission honesty** | **FIXED** | `refreshSmartReminders` returns `scheduled\|denied\|unavailable`; only `scheduled` claims success; denial offers Open Settings | none |
| **Notification localization (keys)** | **VERIFIED** | 23 `reminders.*` + 10 `rappelsPage.*` × 4 locales; `t` bound at scheduling time; reschedule on `[i18n.language]` | FR/EN/DE **at delivery** needs a phone |
| **App-wide localization** | **VERIFIED** | **2240 keys present in all 4 locales**, no empty values, placeholders consistent. Only remaining hardcoded string is inside `__DEV__` | none |
| **Report / calendar localization** | **FIXED** | ~40 strings + dates/numbers moved off `'fr-FR'` to `i18n.language`; 40 tests | none |
| **Home timeline clock** | **FIXED** | `toLocaleTimeString('fr-FR')` → `i18n.language` | none |
| **RTL** | **VERIFIED (device + static)** | Full mirroring after restart on device; `textAlign:'auto'`, `start:` offsets; no forced direction | rotation/fold on a phone |
| **Unknown deep link** | **FIXED (this pass)** | `+not-found` route added — was falling through to Expo Router's unstyled **English** screen with no way back. 4 locales, 6 tests | none |
| **Network resilience** | **VERIFIED** | 24 direct tests on `resilience.ts` (timeout, one retry, recovery, fallback, sync throw, async rejection, no unhandled rejection, no infinite loop). **Mutation-checked**: retry-bound mutant → 8 failures; timeout-removal mutant → 6 | in-session loss needs a phone |
| **USDA API key exposure (F-1)** | **FIXED** | Key moved behind `nutrition-search` (v4 ACTIVE); zero executable references in client; `.env.example` corrected so the fix cannot be undone by following it | none |
| **Open Food Facts User-Agent (F-2)** | **FIXED** | Shared `OFF_HEADERS`, identical to the edge function's; device calls keep per-user IPs | none |
| **Barcode lookup** | **VERIFIED** | Exact-GTIN enforcement proven against **live FDC**: off-by-one code correctly rejected; null-vs-zero preserved | **camera capture** needs a phone |
| **Secrets in client** | **VERIFIED** | No service-role, Gemini, USDA key, token or JWT in `src/`; `EXPO_PUBLIC_*` limited to the two published Supabase values + Sentry DSN | none |
| **Notification payload privacy** | **VERIFIED** | `{kind,type}` only — no glucose, dose, carbs, diagnosis, identity or token; any extra field rejected by test | none |
| **Scanner software paths** | **VERIFIED** | Permission states incl. permanently-denied → Settings recovery (device-verified AF-04), gallery fallback, loading, retry, `scanner.noDetect`, errors via `scanErrorKey` (never raw), uncertainty propagation via `carbStatus` | **capture** needs a phone |
| **Scanner nutritional accuracy** | **BLOCKED** | No controlled reference meals | reference meals |
| **Reports** | **VERIFIED** | `reportStats` 60 + localization 40; empty state, dates, errors | UI on a phone |
| **Backend build config** | **FIXED** | `eas.json` gained `"environment"` — the vars existed on EAS but were never injected, so builds ran in demo mode | none |
| **Android device flows** | **33/45 PASS · 0 FAIL** | AF-15 RTL, AF-13 glucose-18 guard, AF-04 permission recovery, AF-18 deletion, onboarding ×2, login, offline launch/recovery, deep links | **12 flows** need a phone |
| **iOS** | **BLOCKED** | Windows host (no `xcodebuild`/`simctl` — macOS-only); "No Apple teams found". 3 required usage strings present; 3 absent ones **correctly** absent (no matching API used) | Apple membership + Mac/device |
| **Exercise → insulin dosing** | **CLINICAL DECISION REQUIRED** | Audit + decision pack complete; **10 questions, all PENDING**; Q4 (P7-002) must be answered first | clinician |
| **Bolus / IOB / GI-GL / scoring** | **CLINICAL DECISION REQUIRED** | P7-002, P7-011, D-1…D-6 | clinician |
| **Hypo first-aid translations** | **CLINICAL DECISION REQUIRED** | `emergency.tsx` TODO — ar/de/en steps need clinician/native review (**D-4**) | clinician |
| **`weeklyReport.ts` French prose** | **PRODUCT DECISION REQUIRED** | ~20 French sentences reach the report's AI summary in every language; shared with the French PDF | decide |
| **FatSecret / Edamam** | **PRODUCT DECISION REQUIRED** | Secrets absent in production → tiers 4–5 inert. Chain is **safe** without them (both return `null`, `resilient` falls through) | decide |
| **`ITSAppUsesNonExemptEncryption`** | **PRODUCT DECISION REQUIRED** | Export-compliance declaration — a legal statement, not an engineering value | owner |
| **OFF search rate limit** | **OPEN — MONITOR** | `food-search` shares one egress IP (10 req/min). Mitigated: one caller (`worldFoods.ts`), plus caching. No throttle | future hardening |
| **`expo-updates` absent** | **NOT A BUG (recorded)** | `preview`/`production` channels are inert; also why RTL needs a manual restart | optional |
| **`AppErrorBoundary` dev string** | **NOT A BUG** | Inside `__DEV__`; never reaches a patient | none |
| **AR `injectionSummary` plural** | **NOT A BUG** | `{{plural}}` passes a Latin "s"; Arabic does not pluralise by suffix, so omitting it is **correct**. Pinned by test so a parity script cannot "fix" it into a bug | none |
| **GTIN leading zero** | **NOT A BUG (upstream)** | Our `strip()` normalises correctly; FDC's text search returns nothing for the padded query. Scanners emit unpadded | none |

---

## Final state

```
ENGINEERING              : COMPLETE — no remaining fixable non-device gap
AUTOMATED VALIDATION     : GREEN  (1518 / 222 / 18 / TSC / lint / edge)
CLINICAL EXERCISE+INSULIN: FROZEN — 10 decisions PENDING, Q4 first
PHYSICAL ANDROID         : THE ONLY REMAINING DEVICE STEP
```

**Android readiness: ENGINEERING READY — PENDING PHYSICAL ANDROID VALIDATION.**
Not "ready": 12 device flows, notification delivery, scanner accuracy and the clinical
decisions all remain outstanding, and none of them can be closed by engineering here.
