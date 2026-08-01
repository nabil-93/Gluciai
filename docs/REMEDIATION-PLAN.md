# GluciAI — master remediation plan

> **This project is NOT release-ready for iOS or Android.** See
> [Release blockers](#release-blockers).
>
> **Nothing in this file is FIXED unless its row says so with evidence.** Being
> written down is not remediation.

## What this file is, and one caveat

The single ledger for every open finding: the pre-release audit (Parts 1–17),
Batch 1 Steps 1–9, and the two nutrition audits.

**Caveat on provenance.** Parts 1–17 were delivered conversationally and were
never written to disk; this file is the first on-disk version. Rows marked
*reconstructed* come from that conversation and their `Pn-xxx` identifiers
should be reconciled against the original reports before being treated as
canonical. Rows marked *verified* were re-derived from source, or are pinned by
a passing test, during Steps 1–9 and the nutrition audits.

Related ledgers: [KNOWN-BAD-BASELINE.md](KNOWN-BAD-BASELINE.md) (test fixtures
encoding today's defective behaviour) · [LINT-BASELINE.md](LINT-BASELINE.md) ·
[OBSERVABILITY.md](OBSERVABILITY.md) · [MIGRATION-HISTORY-NOTE.md](MIGRATION-HISTORY-NOTE.md).

**[RU11-CLINICAL-DECISIONS.md](RU11-CLINICAL-DECISIONS.md)** — the specialist
hand-off package (Step 19B-2): every remaining insulin/IOB finding with its
current formula, worked dose examples from the fixtures, the failure mode, and
**14 concrete questions (Q1–Q14)** whose answers the implementation will follow
literally. **P7-002, P7-011, P7-003 (policy), P7-004, P7-010, SPORT-1 and ALC-1
are blocked on those answers** — no dose-affecting change may be made until they
are returned.

---

## Release blockers

Ordered by clinical risk. **Every one of these must close before store submission.**

| # | Finding | Why it blocks |
|---|---|---|
| ~~**1**~~ | ~~**NUTR-C1 / NUTR-B1** — unknown carbohydrate becomes `0`, survives the `hasEnergy` gate, is displayed and stored as "0 g", seeds the Bolus screen, and yields a **0 U meal bolus**~~ → **CLOSED by Step 10.** Carbohydrate now carries `carbs_known`; unknown is never displayed as a value, never written to the mirror column, and never seeds the Bolus field. **Residual, now closed by Step 13:** `BolusInputs.carbsKnown` exists — an unknown carbohydrate contributes no meal bolus, raises `carbsUnknown`, and the params card says the carbohydrate was not stated, while a correction-only dose still works and the field is still not mandatory. Day-total surfaces still print a partial total as complete — **NUTR-A9** | Was: silent under-dose from an authoritative-looking zero, no warning. |
| **2** | **P2-003 / P6-001 / P7-001** — `product_catalog` trust boundary (the audit's CRITICAL). **Read side closed by Step 12**; the WRITE side (N-12/N-13/N-14) still blocks | Was: any signed-in patient can write carbohydrate other patients dose against. Now: such a row can still be written, but no longer seeds a dose — it is asked last and arrives untrusted. What remains is that the shared table can still be polluted, and a verified row is the only trusted one an admin has no way to create in-app. |
| **3** | **P7-003** — dose produced from unstated clinical defaults; ~~**negative ISF accepted**~~ | Was: an actionable dose from parameters the patient never entered, one of which could be negative. **Step 13 closed the validation half** — an unusable ISF or target can no longer reach the formula, and every fallback is now named on screen. **Still blocks** for the policy half: the dose is still produced from fallback values, which is an RU-11 decision (Step 19), not an engineering one. |
| **4** | **P7-005** — no unit awareness (mmol/L read as mg/dL) | Was: wrong dose, or a hypo mis-classified. **Step 13 made the unit part of the engine contract** and fixed the history/trend mixing. **Still blocks** until the remaining surfaces are audited: a bare number defaults to mg/dL by convention, and no screen lets a patient work in mmol/L. |
| **5** | **P7-011 / P13-002** — `mixed` insulin excluded from IOB | Under-counted active insulin → stacking. |
| **6** | **P7-002** — activity factor scales the IOB deduction | Raises the dose in exercise / falling / alcohol states. |
| ~~**7**~~ | ~~**P7-006** — BG `0` treated as "no reading"~~ → **CLOSED by Step 13.** A genuine 0 is a value and reaches the unchanged hypo guard; an unusable reading is reported as invalid rather than as an absence; a missing reading raises `noGlucose`. The same collapse at both `bolus.tsx` call sites is gone | Was: full meal bolus with no hypo flag. |
| ~~**8**~~ | ~~**P5-005 / RC-4** — sync has no event identity; dedup is ±120 s + data equality~~ → **CLOSED by Step 14.** Every clinical event carries the uuid the recording device minted, which is also its server primary key: the push is idempotent and dedup is exact. No migration was needed | Was: duplicate insulin logs double IOB; genuine identical doses collapse. |
| **9** | **RU-11** — specialist clinical review (thresholds, DIA, 20 U cap, activity ordering) | Not an engineering task. Cannot be closed internally. |
| **10** | **RC-6** — no native build has ever been produced | The audit's root cause: built for web, never run on a device. |
| ~~**11**~~ | ~~Edge-function caller trust (**P3/P4**) — `food-search` / `nutrition-search` carry no inbound auth; config error precedes auth~~ → **CLOSED by Step 15.** Both proxies now require a real signed-in caller (`callerUserId` → 401) before the body is read, and `analyze-meal` authenticates before its body parse and its `GEMINI_API_KEY` guard. All twelve functions now refuse the bare anon key, or resolve it and refuse the role. **Residual, not blocking:** four functions still answer a missing provider secret before authenticating (P4-b's remaining surface) — configuration disclosure, not an auth bypass. **Source-only: the functions are not deployed** | Was: the public anon key satisfied the platform gate, and two functions trusted it. |
| **12** | **NUTR-GAP-1** — `analyze-meal` server-side schema/range validation **unverified** | Cannot claim the scan pipeline is audited. |

**Item 1 and items 2–8 must be assessed together**: they all terminate at
`computeSmartBolus`, and fixing one without the others leaves the dose path
partially guarded.

---

## A. Clinical / insulin-dose findings

| ID | Finding | Severity | Status | RU |
|---|---|---|---|---|
| **NUTR-C1** | Missing provider carbohydrate → `0` → displayed/stored "0 g" → bolus seed → 0 U meal bolus. Survives `hasEnergy` because energy presence gates the whole record, not per-field completeness | 🔴 CRITICAL | ✅ **FIXED — Step 10** (`carbProvenance.ts`; per-nutrient gate in `barcodeLookup.ts:113-124`; `data.ts:131`; `bolus.tsx:105-111`). Pinned by 107 new tests; verified in Demo Mode. Residual: empty field → 0 U at the call site, see blocker 1 | RU-2 + RU-4 |
| **NUTR-C1a** | **Acceptance criterion:** unknown carbohydrate must remain distinguishable from a true measured/declared `0` (bottled water really is 0 g). No remediation counts as complete until that distinction survives to the dosing boundary | 🔴 gate | ✅ **MET — Step 10.** `carbs_known: true` on a declared 0 survives to the Bolus field (seeds `"0"`); `false` never does. Verified in Demo Mode with olive oil (0 g, known) | RU-2 |
| P2-003 / P6-001 / P7-001 | `product_catalog` rank-1 unconditional in `barcodeLookup`; `findInCatalog` applies no `verified`/plausibility gate; RLS permits any authenticated write. 10 g vs 60 g = 1.0 U vs 6.0 U, unflagged | 🔴 CRITICAL | **READ side ✅ FIXED — Step 12** (source-based demotion: a verified row or one the app wrote from Open Food Facts / USDA / UPCitemdb keeps the fast path; a patient-contributed row is asked LAST and arrives `carbs_known: false`, values visible and unedited, dosable only after the patient confirms the label). Plausibility was closed for this path in Step 11a. **WRITE side still open** — see N-12/N-13/N-14 | RU-1 (write side) |
| P7-003 | Missing ICR → 10 g/U; missing ISF → 50; **negative ISF accepted** → negative correction; NaN target silently disables the hypo guard | 🔴 High | **partially FIXED — Step 13.** An unusable ISF or target (0, negative, NaN, ±Infinity, inverted pair) is now *unavailable* and takes the same explicit fallback path as a missing one, so a negative correction can no longer be produced and the hypo guard cannot vanish; a non-finite ratio falls through instead of being used. Every fallback is reported (`isfSource`, `targetSource`, `ratioSource`, `defaultIsf`/`defaultTarget`) and named in the UI. **Still open:** the fallback VALUES themselves still produce an actionable dose from parameters the patient never entered — whether that should block dosing is an RU-11 clinical-policy call | RU-4 → RU-11 for the policy |
| P7-005 | No unit awareness — 5.6 mmol/L compared against mg/dL thresholds | 🔴 High | **partially FIXED — Step 13.** `BolusInputs.glucoseUnit` makes the unit part of the contract; an explicit `mmol/L` is converted (×18.0182, the standard molar conversion — no threshold moved), an unrecognized unit is `invalid` rather than assumed, and `computeTrend` normalizes **per reading** so one mmol/L row can no longer fabricate a fast fall. **Still open:** a bare number still defaults to mg/dL (correct today — `saveGlucose` writes only mg/dL and the column defaults to it — but it relies on every caller honouring that), and no surface lets a patient enter mmol/L | RU-4 |
| P7-011 / P11-006 / P13-002 | `computeIOB` keeps only `insulin_type === 'rapid'`; premixed contributes 0 | 🔴 High | **verified** (test) | RU-11 → RU-4 |
| P7-002 | `(mealBolus + correction − iob) × activity` — the factor scales the IOB deduction | 🔴 High | **verified** (test) | RU-11 → RU-6 |
| P7-006 | `glucose > 0` collapses `0` into `null` → full meal bolus, no hypo flag | 🔴 High | ✅ **FIXED — Step 13.** Presence, validity and unit are answered separately (`glucoseState: 'absent' \| 'invalid' \| 'value'`): a genuine 0 reaches the unchanged hypo guard, an unusable value is reported as `glucoseInvalid` instead of hiding as an absence, and a missing reading raises `noGlucose` so nothing can present a dose computed without glucose context as if it had one. The collapse at the two `bolus.tsx` call sites — which would have made the engine fix dead code — is gone too | closed |
| P5-005 / RC-4 | Duplicate insulin logs both count → IOB doubles. Sync dedup is a ±120 s + data-equality heuristic with no event identity | 🔴 High | ✅ **FIXED — Step 14.** Every clinical event is born with a client-minted uuid that is also its server primary key, so the push is idempotent (`upsert … ON CONFLICT DO NOTHING`) and dedup is exact set membership. Two identical doses stay two events; the same event re-synced stays one. **No migration** — the column always accepted a client-supplied uuid. Legacy timestamp-id rows keep the old heuristic, deliberately | closed; `computeIOB` untouched (P7-011 stays RU-11's) |
| P7-010 | Correction computed to target *mid* but gated on target *high* → 180→0 U, 181→~1.1 U step | 🟠 Medium | **verified** (test) | RU-11 → RU-6 |
| P7-004 | `guessMealTime` reads device-local hours; 17:59 → snack ratio, 18:00 → dinner ratio | 🟠 Medium | **verified** (test) | RU-11 → RU-4 |
| P7-009 / P12-001 | A dose clamped to 20 U, accepted unchanged, returns `{risk:'ok', reasons:[]}` — nothing says the number is a ceiling | 🟠 Medium | **partially FIXED — Step 19B-1 (presentation half).** The bolus screen now reads the `capped` flag the engine has always set and shows, under the hero, *"Dose limited to the app's maximum (20 U) — the calculation came to 500 U … this ceiling is a limit of the app, not a dose recommended for you"* in fr/en/de/ar, suppressed in the hypo case. **The arithmetic is untouched**: threshold 20, the clamped value, `rawTotal`, and the rounding are pinned by four fixtures. **Still open:** `localDoseCheck` still answers `{risk:'ok', reasons:[]}` for a ceiling accepted unchanged, and `verifyAndSave` still skips the check when the dose equals the recommendation — changing either alters a safety classification and needs RU-11/RU-2 | RU-6 + RU-2 |
| **SPORT-1** | **New — Step 19A.** `declaredSport.timing` ('done' / 'planned') is captured, carried out as `sportTiming` and displayed, but takes **no part in the arithmetic**: a session already completed and one merely intended produce the same reduction (0.75 → 4.5 U in both cases), although the insulin already injected and the glucose already spent differ completely | 🟠 Medium | **verified** (3 fixtures, Step 19B-1) — behaviour unchanged | **RU-11** |
| **ALC-1** | **New — Step 19A.** A declared alcohol intake reduces the dose **twice**: the correction is halved (2.5 → 1.25 U) **and** the assembled dose is multiplied by 0.9 (8.5 U → 6.5 U). Each is defensible alone — alcohol blocks hepatic glucose release and the delayed-hypo risk is real — but the combination has never been clinically ratified, and one `alcohol` flag covers both, so no surface can separate them | 🟠 Medium | **verified** (3 fixtures, Step 19B-1) — behaviour unchanged | **RU-11** |
| P10-004 | `sanitizeAction` insulin ceiling is absolute (100 U), not patient-relative | 🟠 Medium | **verified** (test) | RU-7 + RU-2 |
| P10-006 | `sanitizeAction` carbohydrate **unbounded above** — `carbs: 900` accepted → meal → bolus seed | 🟠 High | **verified** (test) | RU-2 + RU-7 |
| P10-005 | mmol/L glucose from the AI is discarded (below the 20 floor), not converted or queried | 🟠 Medium | **verified** (test) | RU-4 |
| P10-007 | `measure` has a floor but no ceiling and no unit contract; weight feeds BMR | 🟠 Medium | **verified** (test) | RU-2 + RU-4 |
| **NUTR-C2** | Silent auto-seeding: `bolus.tsx` pre-fills carbs from today's most recent meal — or, with higher precedence, from a programme route parameter — with no provenance and no confirmation | 🟠 High | **partially FIXED — Step 10 + Step 18 (labelling half).** Step 10: unknown and legacy-indeterminate meals seed nothing and say why. Step 18: the rule moved out of the screen into `carbSeed`, which returns the ORIGIN with the value, and the field now names it — *"Pre-filled from « Couscous » · 13:04 — check it before calculating"* or *"Pre-filled from your programme (planned meal)"* — in four locales, disappearing the moment the patient types. Values, precedence and rounding are unchanged. **STILL OPEN — item 2, the confirmation gate:** a seeded value still reaches the engine with no acknowledgement. Deliberately excluded from Step 18 because it changes a **dose input**; it needs an explicit clinical decision (RU-11-adjacent) before anyone implements it | RU-3 + RU-6 |
| **NUTR-C3** | No plausibility bound on carbohydrate anywhere between provider response and the engine. **Wording corrected in Step 11:** the `>= 0` CHECK is on `product_catalog` only — **`meal_scans` carries no constraint of any kind** (`0001_init.sql:27-41`), and the `Math.max(0, …)` is in `bolusEngine`, not the nutrition engine | 🟠 High | **partially FIXED — Step 11a.** A shared physical-bounds layer (`plausibility.ts`) now applies at the per-100 g ingestion boundary: an impossible carbohydrate becomes **unknown** (never a clamp), other impossible figures raise `warn:implausible` unrewritten, portions are bounded 5–2000 g on the learned-habit and edit paths. **Still open:** plate-level totals (a 20 kg plate is still accepted), energy-vs-macros and fibre-vs-carbs consistency (both would false-alarm on legitimate data — see `plausibility.ts`). The server-side gaps N-2..N-5 are fixed in source by **Step 11b**; the two Edge Functions are **not yet deployed** | RU-2 |
| **NUTR-C4** | P8-005's dosing consequence: an unresolved plate displays 0 g carbs → **under-dose**. `warn:unmatched` fires only at `nutrition_confidence === 0`, which a `hasEnergy`-true partial entry never reaches | 🟠 High | ✅ **FIXED — Step 10.** A partial plate reads `≥ N g`, a wholly unknown one `—`, and the new `warn:carbs_unknown` fires **per missing carbohydrate**, independently of `nutrition_confidence`. P8-005's badge half is untouched and still red-flagged | RU-2 + RU-3 |
| **BOLUS-A1** | `?carbs=` travels as a route parameter (`program.tsx:360`, `:811`) — privacy exposure, and on web tamperable before the engine reads it | 🟡 Medium | ✅ **FIXED — Step 21.** Both senders stage the values in memory (`bolusHandoff.ts`, the same one-shot mechanism as Step 9's `programDraft`) and navigate to a bare `/bolus`; the screen no longer reads `useLocalSearchParams` at all. Values and string shapes are unchanged, so `carbSeed`, Step 18's origin label and the engine all behave identically — verified in Demo Mode: 62 g → **6.2 U** with a clean URL. The tamper half is closed too: `/bolus?carbs=45` now seeds **nothing** | RU-4 |

## B. Nutrition data integrity

| ID | Finding | Severity | Status | RU |
|---|---|---|---|---|
| **NUTR-B1** | Every absent nutrient becomes `0` in `readNutriments`. `hasEnergy`/`fieldsFound` are returned but only `hasEnergy` is consumed | 🔴 CRITICAL (root of NUTR-C1) | ✅ **FIXED for CARBOHYDRATE — Step 10** (`nutriments.ts:121-133` + all 8 producers). ✅ **CLOSED for all seven — Step 22B**: `nutrientProvenance.ts` carries a per-nutrient `known` map from every producer through `scale`/`rescaleItem`/`aggregateItems` to the screen, the PDF and both DB writers. No value moves (an unknown nutrient keeps its placeholder 0, so every consumer still reads a number); a declared 0 stays 0, an absent one is written to `meal_scans` as NULL, and a legacy row with no map is never upgraded. No migration: the mirror columns were already nullable | RU-2 |
| **NUTR-B2** | NaN `portion_grams` propagates through `estimateMicros` / `estimateMealWaterMl` | 🟡 Medium | ✅ **FIXED — Step 22B.** `isUsablePortion` decides once, at the engine boundary: `NaN`, `±∞`, `< 0` and `0` all yield placeholder zeros with `portion_valid: false` and every nutrient marked unknown, instead of NaN nutrition, infinite nutrition or negative macros. `qualityEvidence` also rejects a non-finite energy — the NaN plate used to slip through as SUPPORTED and score **100/100**, because every comparison in `scoreMeal` is false against NaN. Deliberately NOT a plausibility rule: no upper bound is invented (Step 11 owns those) and no invalid portion is coerced into a plausible weight | RU-2 |
| **NUTR-B3** | `estimateMicros` excludes only `nutrition_confidence === 0`; a 0.1-confidence food contributes in full | 🟡 Medium | **partially FIXED — Step 17 (labelling half).** The threshold is unchanged — moving it would change displayed values, which Step 17 forbids — but the weakness is no longer silent: `microProvenance.unsureGrams` counts the grams identified below `SURE_CONFIDENCE` (0.5) that still contribute in full, and both the card and the PDF print *"including {{g}} g identified with low confidence"*. **Step 22B carried the label further** — the totals card and the meal PDF now print the weakly identified grams too, not just the vitamins card. **Still open, unchanged:** whether such a food should contribute at all, or at a weight — a nutrition-policy call for RU-3, not an engineering one. Step 22B pinned the arithmetic instead (a 0.2-confidence food scores identically to a 0.95 one) | RU-3 |
| **NUTR-B4** | Four sequential rounding stages (`round1` → `scale` → `aggregateItems` → UI) | 🟡 Low-medium | **verified** | RU-16 |
| **NUTR-B5** | `findInCatalog` module `memo` has no TTL — a catalog row stays cached for the session after upstream correction | 🟡 Medium | ✅ **FIXED — Step 12** (5-minute entry lifetime, checked on read; `saveToCatalog` refreshes the entry instead of leaving the pre-write row. 5 fixtures with fake timers) | — |
| P8-004 | Items without `per100g_base` compound rounding: 37 g → 1.3 g → 37.1 g | 🟠 Medium | **verified** (test) | RU-16 → RU-2 |
| P8-006 | `aggregateItems([])` throws `TypeError` | 🟠 Medium | ✅ **FIXED — Step 20.** An empty plate now returns an empty `NutritionResult` instead of crashing: `source` is **omitted** (the field is optional — nothing produced it), the two confidence averages return `0` instead of `NaN`, and the carbohydrate stays **unknown** (`carbs_known: false`), so an empty plate can never seed a dose as "0 g". Reachable via four call sites — `engine.ts:339`, `scan-result.tsx:416`, `program.ts:241` and `:281` — after the resolver drops every unmatched food. No clinical value invented; a one-food plate is byte-for-byte unaffected | RU-2 + RU-16 |
| P8-001 | Negative weight → negative protein target, no warning; absent body data → fabricated BMI 26.0 that suppresses the `lowBmiLoss` guard; gender `other` takes the male branch | 🟠 Medium | **verified** (test) | RU-3 + RU-4 |
| P8-002 | Unknown activity level → NaN budget, no fallback, no error | 🟠 Medium | **verified** (test) | RU-4 |
| P8-003 | NaN body data defeats the calorie floor (every comparison false) | 🟠 Medium | **verified** (test) | RU-4 |
| **DATA-1** | `insertReturning` swallows all write failures → local row with a local id, `setSaved(true)`. Recovered by `pushRows` on next hydrate, but a divergence window exists in which the doctor's dashboard lacks the dose | 🟠 Medium | **partially FIXED — Step 14.** `insertReturning` now returns a discriminated `WriteOutcome` (`stored` / `local` / `failed` + reason) instead of one `null` meaning four different things, and a row the server did not confirm carries `pending_sync: true`. Offline-first is unchanged: the event is kept and re-pushed, now idempotently. ✅ **UI half FIXED — Step 18:** `rowIdentity` also sets `sync_state` (`'local'` = never attempted, `'failed'` = attempted and refused — the distinction `pending_sync` alone could not carry), `savedStateKey` maps it to one of three sentences, and the two surfaces that CLAIM persistence read it: the bolus confirmation and the meal `SaveConfirmModal`. `pending_sync`, the identity, local retention, dedup and retry are untouched, and `sync_state` is local-only (no payload, no column, no migration). **Still open:** the divergence window itself (a dose the dashboard lacks until the next hydrate) is inherent to offline-first; and four quieter save paths (`log-glucose`, `log-insulin`, which close silently, plus `barcode`/`foods`/`menu-scan`/`program-workout`, which show a brief tick) make no persistence claim and were left as they are — a failed write there is still silent | RU-5 |
| P9-001 | Doctor report: today has no `byDay` row → the exported PDF's chart sums ≠ the totals printed beside it | 🟠 Medium | **verified** (test) | RU-4 |
| P9-002 | `inWindow` has no upper bound — a future-dated reading is counted | 🟡 Medium | **verified** (test) | RU-4 + RU-5 |
| P9-003 | `mixed` insulin in `totalInsulin` but in neither `rapidU` nor `longU` | 🟡 Medium | **verified** (test) | RU-11 → RU-4 |
| P9-004 | One NaN reading turns avg/min/max/SD/CV into NaN while band percentages stay confident and eA1c/GMI fall to null | 🟡 Medium | **verified** (test) | RU-2 + RU-16 |
| P9-005 | "Per day" averages divide by days-with-data, not window length | 🟡 Medium | **verified** (test) | RU-6 |
| P16-006 | `parseDecimal('1,234')` → 1.234; Arabic-Indic and Persian digits unparseable | 🟠 Medium | **verified** (test) | RU-4 / RU-12 |

## C. Presentation / misrepresentation

| ID | Finding | Severity | Status | RU |
|---|---|---|---|---|
| **NUTR-A1** | **The "Nutri-Score" is not Nutri-Score.** `nutriGrade(scoreMeal(whole-meal totals))`, labelled `analysis.nutriScore = "Nutri-Score"`, drawn with the **official palette**, and printed into the sharable meal PDF. Real Nutri-Score is **per 100 g** and requires **saturated fat** (absent from the codebase entirely) and fruit/veg/nuts %. Two identical plates at different portions get different grades — impossible for the real metric | 🔴 High | ✅ **FIXED — Step 16** (presentation only). The letter is now the **GluciAI index** in all four locales, drawn in the app's own tier palette, with a note on screen and in the PDF saying it is app-computed and not an official Nutri-Score; the `nutriScore` key is deleted, the PDF line goes through i18n, and the `ai-chat` prompt is told never to call it one. **The calculation is untouched** and no stored `meal_score` was rewritten — 20 fixtures pin the number, the A–E boundaries and four independent proofs that official compliance is impossible with the data the app holds (no saturated fat anywhere, fat never scored, per-plate not per-100 g, GI-driven). Verified in Demo Mode in fr/en/de/ar | RU-6 |
| **NUTR-A2** | Vitamins and minerals are inferred from `MICRO_PER_100G` category densities × grams — **no provider supplies micronutrients** — yet displayed as "Vitamines & minéraux" with **no estimate qualifier**. Percentages clamped to 100, so 300 % of vitamin C reads "100 %" | 🟠 High | ✅ **FIXED — Step 17** (labelling only). Both the card and the meal PDF now say *"Estimated from each food's category and weight — no measured values"*, name the share of the plate the estimate rests on, and name the grams identified without certainty. A capped share reads **"≥ 100 %"** instead of "100 %" — the value is unchanged, the claim is not. New `microProvenance` reports it; `estimateMicros` is untouched | RU-3 |
| **NUTR-A3** | Hydration inferred from `WATER_FRACTION` category fractions, displayed as "{{ml}} ml apportés par ce repas" — a factual claim about an unmeasured number | 🟠 High | ✅ **FIXED — Step 17** (labelling only). Now *"≈ {{ml}} ml estimated for this meal"* in all four locales, on screen and in the PDF, with the same provenance foot. **The water GOAL (`waterGoalMl`, 35 ml/kg) is untouched** — it is a target, not this estimate, and was out of scope | RU-3 |
| **NUTR-A4** | Macro % split computed from **rounded** macros; `totCal = P·4+C·4+F·9` ≠ `result.calories`. Two calorie totals on one screen; `fPct` absorbs all rounding error | 🟡 Medium | **verified** (`scan-result.tsx:425-436`) | RU-6 |
| **NUTR-A5** | Glycemic load displayed assuming **GI 55** when GI is unknown, from rounded carbs | 🟡 Medium | **verified** (`:449`) | RU-3 + RU-6 |
| **NUTR-A6** | Remaining P/C/F use a hardcoded **25/50/25** split of a separately-computed `dailyCalorieGoal` — can contradict `computeProgramTargets` | 🟡 Medium | **verified** (`:481-483`) | RU-6 |
| **NUTR-A7** | `fieldsFound` is computed explicitly so *"the UI can say how complete the entry is"* — and is **never used anywhere** | 🟡 Medium | **open — carbohydrate half delivered in Step 10**: `readNutriments` now also returns `hasCarbs`, and that one IS consumed (per-nutrient provenance). ✅ **CLOSED — Step 22B**: `nutritionCompleteness(items)` answers it per plate in four states — `declared` · `partial` · `estimated` · `unavailable` — plus the nutrients whose total is a floor, the unidentified count, the invalid portions and the weakly identified grams. One quiet line under the macros says it, and the meal PDF carries the same sentence. Deliberately **not** a percentage: "86 % complete" implies a denominator that means something nutritionally, and seven fields are not seven equal facts | RU-3 |
| **NUTR-A9** | **Discovered during Step 10.** The carbohydrate provenance stops at the meal-analysis screen. `nutrition.tsx` day totals ("Glucides aujourd'hui"), its meal-detail sheet, and the home timeline row all print `result.carbohydrates` for a plate whose total is only a **lower bound** — a partial plate reads as complete there. Not a fabricated zero (Step 10 removed those from the dosing path) but still an over-confident presentation | 🟡 Medium | ✅ **FIXED — Step 22B** (presentation only). `carbDisplay` + the new shared `carbText`/`carbUnit` are now imported by every surface that prints a carbohydrate: the Nutrition day total (with a "this total is a minimum" note) and its meal-moment rows, `MealPeekModal`, `LastMealCard`, and the home carb ring **and** timeline row. A slot or meal with nothing usable gets its own wording rather than "— g". No number changed — only how it is written | RU-3 + RU-6 |
| **NUTR-A8** | `sugarHeavy` flag divides `lastMeal.result.sugar` by the **typed** carbs — the ratio can span two different meals | 🟡 Low | **open — re-audited in Step 22B, deliberately unchanged.** It IS a provenance defect and the 0.4 cut-off would not move to fix it, but the only place to fix it is inside `computeBolus`, and Step 22B is forbidden from touching the dose engine. It also needs a policy answer (must the carbohydrate have COME from that meal? what if the patient edited it?). Pinned as known-bad, with the proof that the flag drives one advice line and no arithmetic | RU-6 |
| P8-005 | A zeroed or wholly unidentified plate earns positive badges (`low_glycemic_load`, `low_sugar`) beside 0 kcal | 🟠 Medium | ✅ **FIXED — Step 18** (presentation). `displayableHighlights` drops the POSITIVE badges for a plate with no energy or an unknown carbohydrate; attention points (`low_protein`) stay, and a plate with real data keeps every badge it earned. `buildHighlights` is unchanged and stored `NutritionResult.highlights` are never rewritten — no migration, no edit of history. **Adjacent half FIXED — Step 22A:** the same empty plate no longer scores **100/100 "Excellent"** with a "balanced meal" tip either. `qualityClaimSupported` (the *same* two signals this filter uses) now gates the score, the word, the A–E letter, the tip, the advice card, the meal PDF and the day badge; `scoreMeal` itself is unchanged and stored `meal_score` is never rewritten | RU-3 |
| P15 / RU-9 | `public/panel-x7k42m/` authorizes via client-side `role === 'admin'`; the path is the only gate; no second factor, no audit trail of privileged reads | 🟠 Medium | **verified** (security suite) | RU-9 |
| P16-007 | RTL direction change needs an app reload (`applyDirection` calls `forceRTL`/`allowRTL`) | 🟡 Medium | *reconstructed* | RU-12 |
| P14-* | Native runtime / build configuration findings (iOS/Android) | 🟠 Medium | *reconstructed* | RU-8 |

## D. Security

| ID | Finding | Severity | Status | RU |
|---|---|---|---|---|
| P3/P4 | Platform `verify_jwt` is a signature check, not authentication — the **public anon key passes it**. `food-search` / `nutrition-search` carried no inbound auth code of their own | 🔴 High | ✅ **FIXED — Step 15.** Both now call `callerUserId(req)` → 401 **before** the body is read, so an unauthenticated request reaches no provider; the CORS preflight is untouched. The premise is unchanged and unchangeable (the anon key still passes `verify_jwt`) — what changed is that no function relies on it. `verify_jwt = true` is now stated for all twelve in `config.toml` instead of inherited for eight. **Not deployed** | RU-15 + RU-7 |
| P4-b | Configuration errors precede authentication — an identical 500 for a real patient JWT and the bare anon key | 🟠 Medium | **partially FIXED — Step 15.** `analyze-meal` now orders caller → feature lock → quota → body validation → config, so an unauthenticated caller gets 401 whether or not Gemini is configured. **Still open** for `ai-chat`, `lab-analyze`, `tts` and `live-token`, which keep the config guard (and, in two cases, the body parse) ahead of `callerUserId` — deliberately outside Step 15's scope, and now pinned by a KNOWN-BAD fixture | RU-14 / RU-15 |
| SEC-1 | Server-side feature-lock enforcement (`featureGuard`) **unverified** — every function consulting it also needed a provider secret; documented `it.skip` | 🟠 Medium | ✅ **VERIFIED — Step 15.** The P4-b reorder put the lock ahead of the config guard, which made the refusal observable with no provider secret and no stub. A locked patient gets `403 "feature locked"`; an unlocked one passes and reaches the request path; the anon key is 401 either way. The `it.skip` is gone — replaced by four assertions. Policy unchanged | RU-15 |
| SEC-2 | `featureLocked` fails **open** on lookup outage — during a `feature_access` outage a locked patient is unlocked | 🟡 Medium | **OPEN, deliberately** (source-verified, `featureGuard.ts:37`). Step 15 documented the trust assumption and changed nothing: reversing it decides who may use a feature during an outage, which is a product/clinical-access call, not an engineering one. No response marker was added either — that would be a runtime change for a documentation-only item | RU-15 |

## E. Engineering debt

| ID | Finding | Severity | Status |
|---|---|---|---|
| LINT-1 | 4 lint errors (`ai-chat:489`, `program:332`, `InstallPrompt:117`, `PastDayBanner:59`) + 2 warnings — see [LINT-BASELINE.md](LINT-BASELINE.md) | 🟢 Low | **verified**, ratcheted |
| CI-1 | CI workflows exist but **have never run** — local-only, unpushed; the database job will likely need iteration | 🟠 Medium | **verified** |
| MIG-1 | Migration `0030` not applied to production (a no-op there, but history rows differ) | 🟡 Low | **verified** |
| OBS-1 | No Sentry DSN; source maps disabled → crash reports would be unsymbolicated | 🟡 Medium | **verified** |
| A11Y-1 | Accessibility and RTL largely unverified on device | 🟠 Medium | **unverified** (RU-12) |

---

## Confirmed-safe register

**Do not rewrite these during remediation.** Each was verified; changing them
without cause risks replacing correct behaviour with a regression.

### Nutrition unit handling — verified correct
1. **kJ → kcal** — `KJ_PER_KCAL = 4.184`; field priority `energy-kcal` → `energy-kj` → `energy` (OFF's bare `energy` is kJ by convention).
2. **per-serving → per-100 g** — `per100()` prefers `_100g`, else `serving / servingGrams × 100`.
3. **salt → sodium** — `/2.5`, correct.
4. **sodium g → mg** — `×1000`, correct.
5. **`sanitizeServingGrams` (5–500 g)** — a real safety control with a documented real-world rationale (a 1000 g declared serving would produce a tenfold carb figure on a dosing screen).

### Pipeline integrity — verified correct
6. **`per100g_base`** preserves the authoritative basis; portion rescaling does not compound.
7. **Displayed == stored** — `scan-result.tsx:400` memo is the exact object passed to `saveMeal` at `:729`.
8. **Displayed == bolus-consumed** at the bolus screen (one string, parsed once).
9. **`lastMeal` is not a second carb source** — `bolusEngine.ts:223-226` uses it only for report metadata.
10. **`MIN_MATCH_SCORE`** gates weak fuzzy matches; only `score ≥ 70` is cached; cache is per-100 g, version-keyed, 30-day TTL, misses never cached.
11. **`PROVIDER_CHAIN` excludes `product_catalog`** — the **photo-scan path is isolated** from the catalog trust-boundary finding. This bounds that CRITICAL to the barcode path. *(Still true after Step 12, which changed only how the barcode path reads that table.)*
12. **GI is labelled estimated** (`giEstimated`); AI-sourced values raise `warn:ai_estimate`; unmatched foods raise `warn:unmatched`; the PDF footer states values are estimates.
13. **Unmatched foods never get invented values** — zeros plus `nutrition_confidence: 0` plus a warning.
14. **Barcode gates on `hasEnergy`** → `EMPTY_NUTRI` + `nutritionKnown: false` (partial gate only — see NUTR-B1).

### Verified by the Step 4 security suite
15. Patient↔patient isolation across all tested tables and all four verbs; **re-parenting blocked** (`42501`).
16. `protect_profile_fields` blocks role and `doctor_id` tampering; feature locks cannot be self-unlocked.
17. `unlink_my_doctor` revokes for the caller only; unreachable anonymously.
18. `product_catalog` **verified** rows genuinely frozen, including through `upsert_product`.
19. The admin dashboard embeds an **anon** key only — no service-role key in the browser bundle.
20. All 12 Edge Functions return 401 for a missing or malformed bearer token.

### Remediated in Batch 1 (not audit findings)
21. Migration chain reproducible from empty — 30/30 apply; privilege parity with production verified. *(Blockers 2 & 3)*
22. Error boundaries with clinical-specific fallback that carries no dose, glucose or carbohydrate and never claims an action succeeded. *(Step 7)*
23. Crash-report scrubbing — pure, unit-tested, transmission disabled. *(Step 8)*
24. `/program` route no longer carries body weight, target weight, rate or dietary avoidances. *(Step 9)*

---

## N-series — findings from the Step 11 `analyze-meal` audit

Re-derived from source after Step 10. **N-1 and N-6 are closed by Step 11a;
N-2, N-3, N-4, N-5 and N-9 by Step 11b** (source changed and verified — the two
Edge Functions are **not deployed**, see the Step 11b record). **N-7, N-8 and
N-10's second half remain open, and N-12…N-15 (the catalogue WRITE side, added
by Step 12) are open by instruction.**

| ID | Finding | Severity | Status | Depends on / blocks |
|---|---|---|---|---|
| **N-1** | `sync.ts:366` wrote the mirror `carbs` column ungated — Step 10's persistence rule held on the online `saveMeal` path only, so a meal saved OFFLINE was pushed carrying a fabricated `0` | 🔴 High | ✅ **FIXED — Step 11a** (`sync.ts`, gated exactly like `data.ts:131`; pinned by 6 tests running the real `hydrateFromServer`) | closed NUTR-C1's last write path |
| **N-2** | Server-side zero-fill defeats Step 10 provenance on the LIVE paths: `analyze-meal`'s `normalizeNutrition` (`clampNumber(n.carbs, 0, 100, 0)`) and `nutrition-search`'s `numField(v, 0)` mint a `0` before the client can see the field was absent, so a fabricated zero can be labelled `carbs_known: true` | 🔴 High | ✅ **FIXED — Step 11b** (source). Both normalizers extracted into pure modules; a value the source did not publish is `null`, a stated one — including an impossible one — is passed through unrewritten. Client reads either contract. **Not deployed** | closes NUTR-C1's server-side hole once the functions are deployed |
| **N-3** | Missing `grams` → fabricated **100 g**; missing `confidence` → **0.6** (above both the 0.4 discard gate and the 0.5 "estimated" flag). Indistinguishable from model output, and every macro scales with grams | 🟠 High | ✅ **FIXED — Step 11b** (source). Both defaults are unchanged in VALUE (a different confidence would change which foods survive the 0.4 gate) and now REPORTED: `portion_grams_stated`, `portion_grams_clamped`, `confidence_stated`. The client marks such a food `is_estimated` | provenance channel, not a new number |
| **N-4** | `parseJson`'s truncation repair yields a silently INCOMPLETE plate — foods the model listed after the cut are dropped with no warning; fewer foods means fewer carbs | 🟠 High | ✅ **FIXED — Step 11b** (source). `parseModelJson` returns `{ data, repaired }`; both modes answer `incomplete: boolean`; the plate raises `warn:plate_incomplete` and the menu screen its own notice. Recovering a complete object from prose is **not** counted as a repair | exposed **N-10** (see below) |
| **N-5** | FatSecret non-gram servings: `factor = grams>0 && unit==='g' ? 100/grams : 1` emits a per-**serving** payload as per-**100 g** | 🟠 Medium | ✅ **FIXED — Step 11b** (source). `servingFactor` returns the basis or `null`; a non-gram serving yields **no hit** rather than a guess. `ml` is deliberately not converted (that needs a density this code does not have) | the engine falls through to the next provider |
| **N-6** | Client-side portion/nutrient inputs unbounded above: learned-portion median, meal-edit grams (9999), added sugar (9999 g), barcode manual entry (>100 g/100 g) | 🟠 Medium | ✅ **FIXED — Step 11a** (outliers discarded before the learned median; 5–2000 g on the edit path; upper bound on added sugar; barcode entry passes the shared sanitizer). Verified in Demo Mode | — |
| **N-7** | `meal_scans` has **no** CHECK constraints — corrects the NUTR-C3 wording above | 🟡 Medium | **OPEN — deliberately.** A DB constraint is a migration; migrations are out of scope until their own step | Step 20 / RU-2 |
| **N-8** | `prediction.ts:65` derives the post-meal glucose forecast from `result.carbohydrates` — a placeholder or lower-bound `0` silently removes the expected rise | 🟡 Medium → 🟢 **latent** | **OPEN, and re-scoped by Step 20's audit: `predictGlucose` has NO caller anywhere in `src/`.** The module is exported and unreachable, so the defect cannot reach a patient today. Step 20 therefore recorded it with 6 fixtures (`predictionProvenance.golden.test.ts`) instead of changing the arithmetic — including a guard fixture that **fails the moment anything imports the module**, so whoever wires it up inherits the red flag. Remediation (consult `carbs_known` before the meal term) belongs with the wiring, not before it | RU-3 + RU-6 |
| **N-9** | `analyze-meal` interpolates the caller-supplied `language` string into the model prompt, and applies no size cap to `image_base64` | 🟢 Low | ✅ **FIXED — Step 11b** (source), input side only: `validateRequest` requires a non-empty `image_base64` ≤ 12 MB of base64 (413 above), restricts `mode` to `detect`/`menu`, and accepts `language` only as a locale tag — anything else falls back to `en` rather than 400, because an unusual locale must not cost a patient their scan. Prompt, temperature, provider, quota, auth and feature locks untouched | P3/P4 family; nothing broader was needed |
| **N-10** | **Found in Step 11b, browser-verified.** `scan-result.tsx` re-derives the plate with `aggregateItems(items)` on every render, which regenerates warnings FROM THE ITEMS — so any plate-level warning pushed onto the result was discarded before the screen rendered | 🟠 High | **partially FIXED — Step 11b.** `warn:plate_incomplete` is now carried across the re-aggregation (rendered check in Demo Mode). **Still open:** `warn:portions_adjusted` (pushed by `applyPortionLearning` since before Step 10) has never reached this screen for the same reason — informational, not a dosing gate, and outside N-4's scope | any future plate-level warning must be carried too |
| ~~**N-16**~~ | **Found in Step 13.** `data.ts:computeBolus` was a SECOND dose formula — `carbs / (carb_ratio \|\| 10)` + `(glucose − mid) / (correction_factor \|\| 50)`, rounded to 0.5 U — carrying every defect Step 13 had just removed from the real engine, including the negative-ISF hole | 🟠 Medium | ✅ **FIXED — Step 14.** Deleted after proving it dead: one stale comment in `ai.ts:864`, no import, no test, no runtime path anywhere in `src`, `tests`, `scripts` or `public`. `computeSmartBolus` is now the only dose calculation in the codebase, and the comment was corrected to say so. Full suite, typecheck and lint green after removal | closed |
| **N-17** | **Found in Step 13.** `profiles.correction_factor` and `carb_ratio` have **no CHECK constraint** (`0001_init.sql:17-18`), unlike `insulin_per_10g_*` which are `> 0 and <= 20` (0022). The app's own inputs cannot produce a negative (`NumField` strips `-`, the wizard uses `parsePositive`), so the values Step 13 now rejects can only arrive from the database or a direct write. The engine rejects them; the column still accepts them | 🟡 Medium | **OPEN.** A constraint is a migration — the same owner as N-7 | migration step (20) |
| **N-18** | **Found in Step 13.** `ratio` is rounded to 2 decimals BEFORE dividing, so a 1.5 U/10 g plan for 43 g gives 6.4 U where the engine's own header comment claims 6.5 U (`43 / 6.67` vs `43 / 6.6667`). A 0.1 U artifact of rounding an intermediate, same family as P8-004 | 🟡 Low | **OPEN.** Arithmetic, outside Step 13's contract; recorded with a passing fixture | RU-16 → RU-2 |
| **N-12** | **Catalogue WRITE side, held out of Step 12 by instruction.** Any authenticated patient may `update` any unverified `product_catalog` row (policy `product_catalog_update`, `using (not verified)`), so a row another patient contributed can be rewritten at will | 🟠 High | **OPEN.** Needs an RLS policy change = a migration. Step 12's read-side demotion bounds the dosing consequence (such a row is no longer authoritative) but does not stop the pollution | migration step (20) / RU-1 |
| **N-13** | **Catalogue WRITE side.** `upsert_product` treats `p_source = 'user'` as an override: `calories = case when p_source = 'user' then excluded.calories …`, for every macro. A caller claiming `'user'` therefore overwrites values an authoritative source had already filled in (0026, lines 120-126) | 🟠 High | **OPEN.** The function is a migration object; changing it is out of Step 12's scope. Note the read side now distrusts the resulting row only if its `source` column ends up `'user'` — an overwrite that leaves `source` as `'openfoodfacts'` would still read as trusted | migration step (20) / RU-1 |
| **N-14** | **No admin verification workflow.** `verified` is settable only with SQL or the service role — the dashboard (`public/panel-x7k42m/app.js`) contains no `product_catalog` screen at all. So the one genuinely trusted class of row cannot be created in-app, and Step 12's `verified` fast path is currently unreachable in practice | 🟡 Medium | **OPEN.** Product/ops decision, not engineering; recorded so the `verified` branch is not mistaken for an active control | RU-1 + RU-9 |
| **N-15** | **Found in Step 12.** A patient confirming an untrusted catalogue row against the packaging is NOT contributed back: `saveToCatalog` is called only when `!nutritionKnown`, and an unverified row with energy has `nutritionKnown: true`. So corroboration is never accumulated, and the next patient re-does the same check | 🟡 Medium | **OPEN — deliberately.** Feeding a confirmation back is write-side work (and the corroboration policy Step 12 was told not to invent). Unchanged from before Step 12 | RU-1 |
| **N-11** | **Found in Step 11b.** The client mapping accepted an all-zero AI estimate (`calories: 0, carbs: 0`) as a **known** zero and let it seed a bolus — the Edge Function has always discarded such a record as "the model did not fill it in", but the client applied no equivalent rule, so any older/hand-built payload bypassed it | 🟠 Medium | ✅ **FIXED — Step 11b** (`ai.ts`: an estimate with no usable energy is treated as absent, leaving the food visible and explicitly unknown — which is what the live path already did) | defence in depth for N-2 |

---

## Remaining unverified — the scan pipeline is NOT fully audited

**Do not describe the scan-result nutrition pipeline as audited until these close.**

| ID | Gap | Why it matters |
|---|---|---|
| ~~**NUTR-GAP-1**~~ | ~~`analyze-meal` Edge Function — whether the AI's `per100g` and `portion_grams` are schema- and range-validated **server-side**~~ → ✅ **AUDITED — Step 11 (read-only).** Server-side validation **exists**: category enum, `grams` 5–2000, `confidence` 0–100, macros 0–100 g, calories 0–950 (and the whole nutrition object discarded when calories ≤ 0), box sanitization, JSON-truncation repair. It is **coercive, not rejecting** — every absent or out-of-range value is replaced by a plausible default and forwarded indistinguishably from a model answer. That is an audit result, **not a remediation**: it produced findings **N-2, N-3, N-4, N-9**, all ✅ **since remediated in source by Step 11b** (deployment pending) | Answered. The pipeline has an upstream guard; it was the guard's *silence* that was the problem. Step 11b keeps the guard and makes it speak: absence travels as `null`, defaults are flagged, a repair is reported |
| **NUTR-GAP-2** | USDA provider parsing (`providers/usda.ts`) | Unit handling unverified |
| **NUTR-GAP-3** | `moroccanProvider` data provenance — where the internal DB's values and GI figures come from | It is the only GI source and rank-1 in the chain |
| **NUTR-GAP-4** | `dailyCalorieGoal` behaviour (used by NUTR-A6) | Unknown whether it agrees with `computeProgramTargets` |
| **NUTR-GAP-5** | Native runtime verification of the whole scan path | Everything observed has been web / Demo Mode |
| ~~SEC-1~~ | ~~Server-side feature-lock enforcement~~ → ✅ **VERIFIED — Step 15.** Needed neither provider secrets nor a stub in the end: `analyze-meal`'s lock check now sits above its config guard, so a locked patient's `403` is observable on the secret-free local stack | Answered. The lock is enforced by the function, not only by the client's UI gate |
| A11Y-1 | Accessibility / RTL on device | RU-12 |

---

## Dependencies and ordering

```
NUTR-B1 (zero-fill)  ──▶ NUTR-C1 (0 U bolus)  ──▶ blocker #1
        └──▶ NUTR-A7 (surface completeness) ── supports the fix
NUTR-GAP-1 ──▶ scopes NUTR-C3 (is there any upstream guard?)
P2-003 ──▶ needs NUTR-B5 (memo TTL) to be effective
P5-005/RC-4 ──▶ shares event-identity work with DATA-1
RU-11 (specialist) ──▶ gates P7-002, P7-004, P7-010, P7-011
NUTR-A1 ──▶ independent; no dependency
RC-6 (native build) ──▶ gates NUTR-GAP-5, A11Y-1, P14-*
```

**Hard sequencing rules**
1. **NUTR-B1 before NUTR-C1** — the zero-fill is the root; the dosing symptom cannot be fixed above it.
2. **NUTR-GAP-1 before NUTR-C3** — scope the plausibility bound only after knowing what the server already validates.
3. **NUTR-B5 with P2-003** — a catalog gate is defeated by a session memo that outlives the correction.
4. **RU-11 before the clinical-policy items** — P7-002/004/010/011 are policy questions, not engineering ones.
5. **Never fix a KNOWN-BAD fixture silently** — those tests are designed to fail when behaviour changes. Update the fixture *as part of* the authorized fix and record it in [KNOWN-BAD-BASELINE.md](KNOWN-BAD-BASELINE.md).

## Recommended sequence

| Step | Work | Blocker? |
|---|---|---|
| ~~**10**~~ | **NUTR-B1 + NUTR-C1 + NUTR-A7** — carry `null`/per-field `known`; unknown carbohydrate must **refuse to dose**, never read 0; preserve NUTR-C1a | ✅ **DONE** — see [Step 10 record](#batch-2-record-step-10-complete) |
| ~~**11**~~ | **NUTR-GAP-1** audit + **NUTR-C3** client-side bounds + upstream provenance | ✅ **11a DONE** — see [Step 11a record](#batch-2-record-step-11a-complete). ✅ **11b DONE** — see [Step 11b record](#batch-2-record-step-11b-complete): N-2, N-3, N-4, N-5, N-9 fixed in source; **both Edge Functions still need deploying** |
| ~~**12**~~ | **P2-003 + NUTR-B5** — catalog trust boundary: gate on `verified`, or demote below authoritative providers, or require corroboration | ✅ **DONE (read side)** — see [Step 12 record](#batch-2-record-step-12-complete). Source-based demotion; **write side deliberately open** as N-12/N-13/N-14 |
| ~~**13**~~ | **P7-003, P7-005, P7-006** — clinical parameter and unit contract; reject negative ISF; separate "unknown" from "in range" | ✅ **DONE** — see [Step 13 record](#batch-2-record-step-13-complete). P7-006 closed; P7-003 and P7-005 partially closed (validation and provenance done, the policy and remaining-surface halves stay for RU-11 → Step 19) |
| ~~**14**~~ | **P5-005/RC-4 + DATA-1** — sync event identity | ✅ **DONE** — see [Step 14 record](#batch-2-record-step-14-complete). P5-005/RC-4 closed; DATA-1 partially (the data layer no longer claims false persistence; no screen surfaces it yet) |
| ~~**15**~~ | **P3/P4 + SEC-1** — Edge Function caller trust; error ordering | ✅ **DONE** — see [Step 15 record](#batch-2-record-step-15-complete). P3/P4 closed and SEC-1 verified; P4-b closed for `analyze-meal` only; SEC-2 deliberately open |
| ~~**16**~~ | **NUTR-A1** — rename the score honestly and drop the official palette (computing real Nutri-Score is impossible without saturated fat) | ✅ **DONE** — see [Step 16 record](#batch-2-record-step-16-complete). Presentation only; the score, the letters and every stored value are unchanged |
| ~~**17**~~ | **NUTR-A2 + NUTR-A3 + NUTR-B3** — label vitamins, minerals and hydration as estimates, using the vocabulary already used for GI | ✅ **DONE** — see [Step 17 record](#batch-2-record-step-17-complete). Labelling only; A2 and A3 closed, B3's labelling half closed and its threshold half left to RU-3 |
| ~~**18**~~ | **NUTR-C2 + NUTR-C4 + P8-005 (+ DATA-1 UI half)** — provenance on the seeded carb value; unresolved plates must not read as 0 g | ✅ **DONE** — see [Step 18 record](#batch-2-record-step-18-complete). C4 was already closed by Step 10; P8-005 and DATA-1's UI half closed; NUTR-C2's labelling half closed, **its confirmation gate deliberately left open as a dose-input decision** |
| **19** | **RU-11 specialist review** → then P7-002, P7-004, P7-010, P7-011, P7-009 | ✅ |
| **20** | **NUTR-A4/A5/A6/A8, NUTR-B2/B4, P8-*, P9-*, P16-006** — consistency and integrity | ⬜ |
| **21** | **BOLUS-A1** — remove `carbs` from route params (same mechanism as Step 9) | ⬜ |
| **22** | **RU-9** dashboard accountability | ⬜ |
| **23** | **CI-1** — push and stabilise CI; **MIG-1**; **OBS-1** | ⬜ |
| **24** | **RC-6** — first native build, then **NUTR-GAP-5**, **A11Y-1**, **P14-\*** | ✅ |
| **25** | **LINT-1** — the 4 remaining errors, `program.tsx` last | ⬜ |

Steps 10–15 and 19, 24 are release blockers. 16–18 are trust and honesty
issues that should not ship as-is but do not risk a wrong dose — except
NUTR-C4, which does.

---

## Batch 1 record (Steps 1–9, complete)

| Step | Delivered | Evidence |
|---|---|---|
| 1 | Vitest foundation, Node pin, scripts | — |
| 2 | Clinical golden baseline | 83 tests |
| 3 | Non-clinical golden baseline | +239 tests |
| 4 | Security verification foundation | 90 pass / 1 documented skip |
| — | Blocker 2: fresh-DB migration reproducibility | 30/30 verified |
| — | Blocker 3: privilege parity with production | exact parity verified |
| 5 | Lint triage (partial — `DoseHero` reverted, then completed) | 0 errors in scope |
| 6 | CI pipeline + lint ratchet | validated locally, **never run on GitHub** |
| 7 | Error boundaries incl. clinical fallback | verified in Demo Mode, 4 locales |
| 8 | Observability privacy layer | 68 tests, transmission disabled |
| 9 | `/program` route privacy | verified: URL is `/program?create=1` |

**Batch 1 built the verification foundation. It closed almost no clinical
finding — by design.** Every blocker was still open at the end of it.

---

## Batch 2 record (Step 10, complete)

**Scope authorized and delivered:** NUTR-B1 + NUTR-C1 + NUTR-A7 (carbohydrate
only). Release blocker 1 closed apart from the residual recorded in its row.

### What changed

A carbohydrate figure now travels with its provenance — an additive optional
`carbs_known?: boolean` beside the existing number. The number itself never
moved: unknown is still `0` in every arithmetic path, so no correct plate,
rounding or total changed. Three states:

| `carbs_known` | Meaning | Dosable |
|---|---|---|
| `true` | the source declared it — **including a declared 0** (water) | yes |
| `false` | the source said nothing; the `0` is a placeholder | never |
| absent | legacy record; **non-zero ⇒ known**, **zero ⇒ indeterminate** | only if non-zero |

The legacy rule is why **no migration was required**: a zero-fill cannot have
produced 42, so only a legacy *zero* is ambiguous, and that case simply does
not auto-seed a dose. `result` is `jsonb` (additive) and `meal_scans.carbs` was
already nullable.

One rule, one module: [`src/services/nutrition/carbProvenance.ts`](../src/services/nutrition/carbProvenance.ts)
— pure, import-free, shared by the engine, both screens and the tests.

### Producers, before → after

| Producer | Before | After |
|---|---|---|
| `readNutriments` (OFF barcode) | absent key → `0` | `carbs_known` + new `hasCarbs`; declared 0 stays known |
| `barcodeLookup` OFF | `hasEnergy` vouched for every field | per-nutrient gate: energy known, carbohydrate not |
| `barcodeLookup` USDA GTIN | `?? 0` with `nutritionKnown: true` | absent row → `false` |
| `usda.ts` search | `pick()` → `0` | `pickOrNull` → `false` |
| `openfoodfacts.ts` search | `num()` → `0` | `numOrNull` → `false`; `''` is not 0 |
| `productCatalog` read/write | `r.carbs ?? 0` / wrote `0` | `r.carbs !== null`; `saveToCatalog` writes **null**, never a fabricated 0 |
| `remote.ts` (proxy) | passed the payload through | missing field → `false` (it used to become **NaN** in `scale()`) |
| `ai.ts` vision | absent `carbs` → `undefined` → **NaN** | `false` + `0`; a numeric estimate stays a **known estimate** |
| `aiLogger.sanitizeAction` | `num()` read omission as 0 | `stated()` → `carbs_known` |
| `moroccan.ts`, `foods.tsx`, `program.ts` | — | `true` (our own tables declare `carbs` as required) |
| `resolveFood` unmatched placeholder | `carbohydrates: 0`, summed as real | `carbs_known: false` |
| `aggregateItems` | summed placeholders into a "total" | plate flag = every food known; `warn:carbs_unknown|<names>` |
| `barcode.tsx` manual entry | empty fields read as 0 | `false` until the patient types the label — typing it makes it `true` |

### Surfaces

* **Meal analysis:** `62 g` unchanged · partial plate `≥ 62 g` with the share
  suppressed (`—`) · nothing known `—` with **no unit** · per-item
  `analysis.carbsUnknownTag` for an identified food with no carbohydrate ·
  `result.warn.carbs_unknown` names the foods. Protein, fat, fibre, sugar,
  calories, GI, GL, Nutri-Score and micros are untouched.
* **Bolus:** a known figure (including a genuine `0`) still offers the one-tap
  prefill; an unknown or legacy-indeterminate meal shows an amber
  `bolus.carbsNotConfirmed` notice instead and leaves the field **empty**.
  Correction-only dosing unaffected. `bolusEngine` untouched.
* **Persistence:** `result` jsonb carries the flag at plate, item and
  `per100g_base` level; `meal_scans.carbs` receives **null** instead of a
  fabricated 0. The dashboard's `carbs ?? result.carbohydrates` fallback means
  it displays exactly what it displayed before.
* i18n: 3 new keys × 4 locales (fr, ar, de, en).

### Evidence

| Check | Result |
|---|---|
| Unit / golden suite | **512 passing**, 16 files (was 405) — CI floor 322 unchanged |
| New provenance tests | **107 added**: `carbProvenance` 34 · `nutriments` 32 (that reader was previously **untested**) · providers 19 · end-to-end 7 · `nutritionScaling` +11 · `sanitizeAction` +4 |
| Security suite | **90 pass / 1 documented skip**, unchanged |
| Typecheck | clean |
| Lint ratchet | green — 6 findings, 6 in baseline (4 errors / 2 warnings), no new entry |
| Demo Mode (web, `.env.development.local` blanks Supabase) | genuine 0 g (olive oil) → `0 g` shown, Bolus seeded `"0"` · known 70 g → `70 g · 55 %` · missing → `—` · mixed → `≥ 70 g (—)` + named warning + item tag + Bolus field **empty** with the amber notice · saved and re-opened: provenance survived |
| NaN / undefined | none in any rendered surface; no console errors |
| External state | **nothing left the machine.** No Supabase client exists in Demo Mode; an in-page guard blocked and recorded the only two outbound attempts (USDA + OFF, from the deliberately unmatchable food) and every recorded request was `localhost:8094`. No migration, no Edge Function change, no dependency, no config change |
| KNOWN-BAD fixtures | all still red-flagged and passing unchanged (P8-004, P8-005, P8-006, P10-006, reportStats, `computeSmartBolus` zero-carb) — none silently turned green |

### Discrepancies recorded during implementation

1. **`barcodeVariants` zero-padding** applies only at lengths 12/13/14 — a new
   pin asserted padding for a 5-digit code and was corrected to the real
   behaviour (characterized, not "fixed").
2. **`rescaleItem` does not rewrite `per100g_base`.** A legacy base with no
   flag keeps none; the item-level flag is what carries the truth and the
   fallback re-applies on every later edit. Pinned.
3. **A legacy-shaped zero plate re-aggregated today writes `null`** to the
   mirror column where it used to write `0`. Conservative and cost-free (the
   jsonb keeps the `0`; the dashboard falls back to it). Pinned.
4. **New finding NUTR-A9** — day totals, the meal-detail sheet and the home
   timeline still print a lower-bound carbohydrate total as complete. Recorded,
   not fixed: outside the authorized surface list.
5. **`ai.ts` demo plate**: a third demo plate with a missing-carb food was
   drafted and removed — forcing a provider-chain miss would have made Demo
   Mode issue live USDA/OFF requests.
6. **P8-005 observed live, not fixed.** The wholly-unknown plate used for the
   Demo Mode check scored **100/100 "Excellent"** with "balanced meal" advice
   beside `—` carbohydrate and 0 kcal. Exactly the recorded known-bad
   behaviour; `mealScore` / `buildHighlights` were out of scope and its fixture
   stays red-flagged.

**Still open after Step 10:** everything else in the blocker table (2–12),
NUTR-B1 for the other six nutrients, NUTR-A7's `fieldsFound`, NUTR-C2's
confirmation, NUTR-A9, and NUTR-GAP-1..5. **The scan pipeline is not audited
and the project is not release-ready.**

---

## Batch 2 record (Step 11a, complete)

**Scope authorized and delivered:** the client-side physical-plausibility layer
+ the Step 10 offline-persistence hole (N-1). **Step 11b was not started.**

### What changed

A second, orthogonal question now has an answer beside every nutrition figure.
Step 10 asked *"did the source actually say this?"*; Step 11a asks *"is this
physically possible?"* — and the two answers meet in one channel:

| Situation | Before | After |
|---|---|---|
| carbs 500 g per 100 g | scaled by the portion, dosable | **unknown** (`carbs_known: false`), `warn:implausible`, no bolus seed |
| calories 5000, sodium 90 000 | shown as fact | shown **unchanged** + `warn:implausible` naming the food |
| sugar 12 g with carbs 10 g | silent | `sugar_over_carbs` reported |
| protein+carbs+fat > 101 g/100 g | silent | `macro_sum` reported |
| learned portion 9999 g | became the standing habit | outlier discarded **before** the median |
| meal-edit portion 9999 g | accepted | bounded to 2000 g |
| added sugar 9999 g | accepted | bounded to 2000 g |
| offline meal, unknown carbs | pushed as `carbs: 0` | pushed as `carbs: null` (**N-1**) |
| declared 0 g typed off a label | marked *unknown* — never seeded | **known zero**, seeds `"0"` |

The two rules, and why they differ: an impossible **carbohydrate** becomes
unknown, never a clamp (a 500 quietly rewritten to 100 is still dosed from);
every **other** impossible figure is reported and left visible (silently editing
it would hide the upstream defect). Three checks were deliberately NOT
implemented because each false-alarms on legitimate data — fibre ≤ carbs (false
under EU labelling), energy vs 4/4/9 (alcohol, polyols), plate-level totals —
and each is recorded in `plausibility.ts` and in NUTR-C3 above.

### Exact changed files (8 source + 1 new + 5 test + this plan)

**New:** `src/services/nutrition/plausibility.ts` (pure, import-free).
**Modified:** `src/types/index.ts` (additive `implausible_fields?`) ·
`nutrition/engine.ts` (sanitize at both `Per100g` ingestion branches + plate
warning) · `nutrition/learning.ts` · `services/sync.ts` (**N-1**, mirror column
only — no change to dedup, identity or ordering) · `app/barcode.tsx` ·
`components/MealEditModal.tsx` · `components/AddedSugarCard.tsx` ·
`i18n/locales/{fr,ar,de,en}.json` (one key).

### Evidence

| Check | Result |
|---|---|
| Unit / golden | **572 passing**, 19 files (was 512) — **+60**: `plausibility` 36, `learnedPortion` 9, `syncMealPush` 6, `nutritionScaling` +8, `carbProvenanceEndToEnd` +1 |
| Security suite | **90 pass / 1 documented skip**, unchanged |
| Typecheck · Lint ratchet | clean · green (6 findings, 6 in baseline) |
| Demo Mode (offline, guard installed) | typed carbs 500 → card reads `0 g`, meal stores `carbs_known: false` + `warn:implausible`, Bolus field **empty** with the amber notice · typed carbs 0 → stored **known**, Bolus seeds `"0"` · added sugar 9999 → **2000 g** · meal-edit 9999 → **2000 g** (800 kcal, 200 g carbs, correctly rescaled) · unmatched food unchanged (`≥ 200 g (—)`, both Step 10 warnings, **no** spurious implausibility) · no NaN anywhere |
| External state | **nothing left the machine.** Demo Mode has no Supabase client; an in-page guard blocked and recorded 9 outbound attempts (7 from the barcode chain, 2 from the unmatchable food) and every loaded resource was `localhost:8094`. The three verification meals were removed afterwards |
| KNOWN-BAD fixtures | all still red-flagged and passing unchanged |
| Dependency / config delta | **none** — no migration, no Edge Function, no package, no CI change |

### Discrepancies recorded during implementation

1. **Two proposed checks were withdrawn as unsafe.** `fibre <= carbs` is false
   under EU labelling (wheat bran: 3.8 g carbs, 43 g fibre) and an
   energy-vs-4/4/9 identity flags every alcoholic drink. Both are pinned as
   MUST-PASS fixtures so they are not "helpfully" added later.
2. **The barcode keystroke gate was replaced by the shared sanitizer.** Those
   fields are uncontrolled by design (`defaultValue`, so "1." can be typed), so
   refusing a keystroke left the digits on screen while the app held a different
   number — more misleading than taking the value in and distrusting it
   explicitly.
3. **Step 10 false-negative found and fixed on that same screen.** `carbs_known`
   was gated on `nutritionKnown`, so a figure the patient copied off the
   packaging could never become known: they typed 45 g and the Bolus screen
   still said "not confirmed". The flag alone is now authoritative. Required by
   Step 11a's own rule that a declared 0 g stays a known zero.
4. **The added-sugar bound is the PORTION bound (2000 g), not a sugar-specific
   limit** — that row is a food item, so it obeys the same rule as any other.
   2 kg of sugar is still absurd; the plate-level total remains unbounded and
   open under NUTR-C3.

**Still open after Step 11a:** N-2, N-3, N-4, N-5, N-7, N-8, N-9 · NUTR-C3's
plate-level and consistency parts · every blocker from 2 onward · and the
clinical items scheduled for their own step, explicitly including **P7-011
(mixed insulin excluded from IOB)** and **P7-002 (activity factor scaling the
IOB deduction)**, which remain release blockers under RU-11 → Step 19.

**Current suites:** 572 unit/golden · 90 security (+1 documented skip) ·
typecheck clean · lint ratchet green at 4 errors / 2 warnings.

---

## Batch 2 record (Step 11b, complete)

Step 11b fixed the **upstream** half of the same defect: the two Edge Functions
answered every gap in the model's or the provider's data with a plausible
default, so the client's Step 10 refusal could not fire on the live path. Only
findings N-2, N-3, N-4, N-5 and N-9's input side were in scope.

**Neither Edge Function was deployed.** Both remain changed in source only, so
the live behaviour is unchanged until someone deploys them. The client reads
both contracts, so the deploy can happen in either order.

### The rule

Step 11a asked *"is this number possible?"*; Step 11b asks *"did anyone
actually say it?"* — and where the answer is no, **absence travels** instead of
being answered with a number.

| Case | Before | After |
|---|---|---|
| model states no `carbs` | `0`, forwarded as a value | `null` → plate carbohydrate **unknown**, no prefill |
| model states `carbs: 0` (grilled chicken) | `0` | `0`, **known**, still seeds a dose |
| model states `carbs: 500` | clamped to `100`, then trusted | passed through → Step 11a marks it untrusted and names the food |
| model states no `grams` | silent `100 g` | `100 g` + `portion_grams_stated: false` → food marked estimated |
| model states no `confidence` | silent `0.6` | `0.6` + `confidence_stated: false` (value deliberately unchanged: a different default changes which foods survive the 0.4 gate) |
| response cut off mid-food | silently shorter plate | `incomplete: true` → `warn:plate_incomplete` on the plate, its own notice on the menu screen |
| FatSecret 1-cup (240 ml) serving | per-serving numbers labelled per-100 g | **no hit** — the basis is unknown, so the engine tries the next provider |
| FatSecret 158 g serving | converted | converted, unchanged |
| provider publishes no `carbs` | `0` | `null` → unknown |
| `language` = a prompt injection | interpolated into the prompt | falls back to `en` |
| 40 MB `image_base64` | sent to the vision model | 413 before any model call |

### Changed files

**New (pure, import-free, testable):** `supabase/functions/analyze-meal/normalize.ts` ·
`supabase/functions/nutrition-search/normalize.ts`.
**Edge:** both `index.ts` — now request + parse + normalize only, with the
response contract documented in the header.
**Client:** `services/ai.ts` (null-aware mapping, `incomplete` → warning,
`analyzeMenu` returns `{ dishes, incomplete }`, N-11 energy rule) ·
`nutrition/providers/remote.ts` (null-aware proxy hits) ·
`app/scan-result.tsx` (carry `warn:plate_incomplete` across re-aggregation —
**N-10**) · `app/menu-scan.tsx` (incompleteness notice) · 4 locale files
(2 keys: `result.warn.plate_incomplete`, `menuScanPage.incomplete`).

**Untouched:** Gemini temperature and prompts, provider choice, quota,
authentication, feature locks, `bolusEngine`, IOB, ratios, targets,
thresholds, `programEngine`, Nutri-Score, vitamins, hydration, macro %, GI/GL,
calorie goal, catalog trust, dashboard, Sentry, CI, migrations, EAS/Vercel,
dependencies.

### Verification

652 unit/golden tests in 22 files (was 572/19) — **+80**: `analyzeMealNormalize`
36, `nutritionSearchNormalize` 19, `aiPlateMapping` 21 (the real client pipeline
against a doubled edge function), `carbProvenanceProviders` +4 · security 90 pass
/ 1 documented skip · typecheck clean · lint ratchet green (6 findings, 6 in
baseline) · no KNOWN-BAD fixture touched (none covers these paths).

Demo Mode, offline by construction (`.env.development.local` blanks Supabase, so
no client is created): the plate warning renders in German with the
carbohydrate reading `≥ 56 g` / `—`, and the menu notice renders under the dish
count. Every request went to `localhost:8097`; no external host was contacted
and no patient data left the machine. The injected verification state was
removed afterwards.

### Discrepancies and findings

1. **N-10, found in the browser, not in the tests.** `scan-result.tsx`
   re-aggregates the plate from its items on every render, which regenerates
   warnings from the items — so `warn:plate_incomplete` was discarded before
   the screen rendered even though `analyzeMealImage` had pushed it. The unit
   test was green and the patient still saw nothing. Fixed by carrying that one
   warning across the re-aggregation; **`warn:portions_adjusted` has the same
   defect and stays open** (informational, and outside N-4).
2. **N-11: the client trusted an all-zero AI estimate.** The function has always
   discarded a record with no energy as "the model did not fill it in"; the
   client did not, so an all-zero object became a **known** 0 g that could seed
   a dose. The client now applies the same rule.
3. **Sibling nutrients are still coerced to 0 at the client.** `null` protein or
   fibre reads as `0`, exactly as before, because the engine, the score and the
   bounds layer all take numbers. Only the carbohydrate — the one a dose is
   computed from — carries provenance. Carrying six more flags through
   `scale`/`aggregate`/UI is NUTR-B1's remaining half, deliberately not in this
   step.
4. **`ml` servings are dropped, not converted.** Millilitres become grams only
   through a density this code does not have (water 1.0, oil 0.92, honey 1.42).
   Dropping the hit costs a fallback answer; guessing costs a wrong dose.
5. **An invalid `language` falls back to `en` rather than returning 400.** An
   unusual locale must never cost a patient their scan; a locale tag cannot
   carry instructions, which is what the regex enforces.
6. **Two characterization expectations were corrected against execution** in the
   new `analyzeMealNormalize` file (not a KNOWN-BAD fixture): a defaulted
   *confidence* does not set `is_estimated` (that flag is about the portion),
   and `alternatives` caps to 3 **before** de-duplicating. Both behaviours are
   unchanged from the previous implementation and are now pinned as such.

**Still open after Step 11b:** N-7 (no `meal_scans` CHECK — a migration) ·
N-8 (`prediction.ts` reads `result.carbohydrates` provenance-blind) · N-10's
`portions_adjusted` half · NUTR-C3's plate-level and consistency parts ·
NUTR-A1 (Nutri-Score), NUTR-A2/A3/B3 (vitamins, minerals, hydration), macro
percentages, GL/GI presentation and the GI-55 assumption, the calorie-goal
logic and the daily-totals/reporting findings — all untouched and all still
recorded · every blocker from 2 onward · and the clinical items scheduled for
their own step, explicitly including **P7-011 (mixed insulin excluded from
IOB)** and **P7-002 (activity factor scaling the IOB deduction)**, which remain
release blockers under RU-11 → Step 19.

**Deployment still owed:** `supabase functions deploy analyze-meal` and
`supabase functions deploy nutrition-search` — not performed, by instruction.

**Current suites:** 652 unit/golden · 90 security (+1 documented skip) ·
typecheck clean · lint ratchet green at 6 findings (baseline 6).

---

## Batch 2 record (Step 12, complete)

Step 12 closed the **read side** of the audit's single CRITICAL: a shared table
any patient can write was consulted first and returned immediately, so one
patient's typed carbohydrate became the number another patient's bolus was
computed from. The strategy is **source-based demotion** — not verified-only
gating (nothing is verified today, see N-14, so it would have disabled the
catalogue outright) and not `scan_count` as corroboration (`bumpCatalogScan`
increments it for anyone, including the contributor).

**No schema, migration, RLS policy, `upsert_product`, provider semantics,
bolusEngine, IOB, insulin formula or clinical default was touched.** The trust
columns Step 12 reads (`source`, `verified`) have existed since migration 0026;
the client simply never selected them.

### Trust policy

| Row | Before | After |
|---|---|---|
| `verified = true` | trusted (flag not read) | **trusted** — fast path, carbohydrate dosable |
| unverified, `source` ∈ {openfoodfacts, usda, upcitemdb} | trusted (flag not read) | **trusted** — worth what that provider is worth |
| unverified, `source` ∈ {user, label-photo} | **trusted, rank-1, dosable** | **not authoritative** — asked last, `carbs_known: false`, values shown unedited |
| `source` null / unrecognized (older row) | trusted | **not authoritative** — the column's DB default is `'user'`, so silence reads as user-contributed |

### Provider ordering

```
before:  catalog (any row) → OFF v2/v0 → USDA GTIN → UPCitemdb+search → name-only
after:   catalog (TRUSTED only) → OFF v2/v0 → USDA GTIN → UPCitemdb+search
         → untrusted catalogue row (flagged) → name-only
```
Everything outside the demoted case is unchanged, and pinned by fixtures. The
untrusted row is preferred over a name-only remote answer because it carries
this product's numbers where the name-only entry carries none — offline and
Moroccan-retail coverage, the reason the catalogue exists, is preserved.

### Dosing provenance

`carbs_known` remains the only channel a dose is gated on (Step 10). Step 12
adds one more reason for it to be false: *the source is not authoritative*.

- genuine declared **0 g on a trusted row → known zero**, still seeds `"0"`;
- declared **0 g on an untrusted row → unknown** (this is the "bread, 0 g carbs"
  poisoning case);
- **null** column → unknown on any row, and never rendered as a value;
- a plausible poisoned **60 g** → visible on screen, `carbs_known: false`, no
  prefill — the figure is labelled, never edited;
- **Step 11a still applies on top**: an impossible figure from a *trusted* row
  still becomes unknown with `warn:implausible`. Two independent defences, in
  order: may this source be believed, and is this number possible.

The new `ProductProvenance` record carries no clinical decision of its own.

### Saved-meal provenance

`barcode.tsx` filed **every** barcode meal as `source: 'openfoodfacts'` —
including a row another patient typed and including the patient's own label
reading. It now files the real origin, and the product card prints it instead of
the fixed "Bases : Open Food Facts · USDA · UPC" line. `NutritionSource` gained
exactly two members (`product_catalog`, `user_label`) plus a `ProductProvenance`
record on `NutritionResult`; the dashboard needed no change (it reads `source`
only for glucose logs) and the doctor PDF picks the labels up through
`SOURCE_LABEL`.

**Limitation, reported rather than widened:** there is no `NutritionSource`
member for UPCitemdb. The live UPC path is therefore filed under the provider
that supplied the *numbers* (USDA or Open Food Facts — now recorded truthfully
instead of guessed), and a catalogue row written under `source: 'upcitemdb'`
reads as `product_catalog · UPCitemdb` in the provenance detail. A name-only Open
Food Facts entry reports `origin: 'openfoodfacts'` with
`trusted_for_dosing: false` (the name is theirs; the placeholder numbers are
nobody's), while the UPCitemdb name-only path reports `user_label` — an
asymmetry left in place deliberately.

### Cache (NUTR-B5)

Entries were unbounded: a row corrected upstream stayed wrong for the whole
session. Now every entry carries `savedAt`, is dropped on read after **5
minutes**, and `saveToCatalog` refreshes it so a re-scan sees what was just
written. A patient's own typed figures keep `carbs_known: true` in that
refreshed entry — this device watched them read the packaging — while the entry's
provenance still records a patient contribution, so the trust does not leak to a
later database read.

### Verification

678 unit/golden in 23 files (was 652/22) — **+26**, all in the new
`catalogTrust.golden.test.ts`, which was written and run **before** the change to
pin the two unsafe behaviours. Security suite 90 pass / 1 documented skip
(unchanged — Step 12 changed no policy). Typecheck clean. Lint ratchet green
(6 findings, 6 in baseline). One existing fixture moved, characterized in
[KNOWN-BAD-BASELINE.md](KNOWN-BAD-BASELINE.md#fixtures-changed-by-an-authorized-remediation).

Demo Mode: a patient-added product now prints `Produktetikett · <barcode>` on the
card and is saved with `source: 'user_label'` and
`product_provenance: { origin: 'user_label', trusted_for_dosing: true }`, carbs
45 g known — where before it would have claimed `openfoodfacts`. An in-page guard
blocked and recorded 7 outbound attempts (OFF v2 ×2, v0 ×2, USDA ×2, UPCitemdb),
which also shows the ordering; zero external resources were loaded and the
injected state was cleared afterwards.

**What could NOT be browser-verified:** Demo Mode instantiates no Supabase
client, so `findInCatalog` returns null and no catalogue row — trusted or
untrusted — can be exercised in the UI. The demotion, the fallback, the trust
rule and the memo lifetime are covered by the doubled-Supabase unit tests only;
the `checkLabelTitle` / `checkLabelSub` banner and the
`Catalogue partagé · saisi par un patient` origin line have **not** been seen
rendered.

### Still open after Step 12

**N-12** (any authenticated patient may update any unverified row) · **N-13**
(`p_source = 'user'` overwrites authoritative values) · **N-14** (no admin
verification workflow, so the `verified` fast path is unreachable in practice) ·
**N-15** (a patient's confirmation is not fed back as corroboration) — all four
are the WRITE side, held out by instruction, and blocker #2 stays open for them.
Also unchanged: N-7, N-8, N-10's `portions_adjusted` half, NUTR-C3's plate-level
parts, NUTR-C2's confirmation gate (Step 18), NUTR-B1's other six nutrients, and
the presentation findings (NUTR-A1 Nutri-Score, A2/A3/B3, macro %, GL/GI,
calorie goal, daily totals). **P7-011 (mixed insulin excluded from IOB)** and
**P7-002 (activity factor scaling the IOB deduction)** remain release blockers
under RU-11 → Step 19.

**Current suites:** 678 unit/golden · 90 security (+1 documented skip) ·
typecheck clean · lint ratchet green at 6 findings (baseline 6).

---

## Batch 2 record (Step 13, complete)

Step 13 removed the silence at the bolus input boundary. **No formula,
threshold, factor, cap, rounding, IOB rule, meal window or fallback VALUE was
changed** — what changed is what the engine is willing to believe before it
computes, and what the result is willing to claim afterwards.

### The contract

| Question | Before | After |
|---|---|---|
| is there a reading? | `glucose && glucose > 0` — 0, NaN, −80 and "not measured" were one state | `glucoseState: 'absent' \| 'invalid' \| 'value'`, decided without truthiness |
| in what unit? | nothing read `unit`, anywhere | `BolusInputs.glucoseUnit` (default mg/dL, the app's own contract); `computeTrend` normalizes **per reading**; an unknown unit is `invalid`, never assumed |
| is this parameter the patient's? | a missing ICR became 10 g/U, a missing ISF 50, both behind one unread flag | `ratioSource` (unchanged) + `isfSource` + `targetSource`, and the `defaultIsf`/`defaultTarget` flags |
| is this parameter usable? | `\|\| 50` accepted **−50**; `??` accepted **NaN**; `> 0` accepted **Infinity** | 0, negative, NaN, ±Infinity and an inverted target pair are all *unavailable* and take the explicit fallback path |
| is the carbohydrate real? | a placeholder 0 was indistinguishable from water | `BolusInputs.carbsKnown` → `carbsUnknown` flag, no meal bolus, correction-only dosing preserved |

### Dose-output compatibility

Every valid-input fixture produces **exactly the dose it did before**. Four
outputs move, each because a defect was removed: BG 0 → 0 U with `hypo` (was
5 U); negative ISF → 8.5 U (was 1.5 U, the correction having been negative);
NaN `target_low` → 0 U with `hypo` (was 5 U); a non-finite ratio → the fallback
rather than a capped 20 U or a silent 0 U.

### Changed files

`src/services/bolusEngine.ts` (contract, four exported pure helpers:
`clinicalNumber` internal, `isfForProfile`, `targetsForProfile`, `readGlucose`) ·
`src/app/bolus.tsx` (both call sites, params card, missing-profile list) ·
4 locale files (7 keys each) · `tests/clinical/bolusContract.golden.test.ts`
(new, 33) · `tests/clinical/computeSmartBolus.golden.test.ts` (6 fixtures moved,
9 added). **Untouched:** `computeIOB`, the assembly order, `localDoseCheck`,
`ratioForMeal`'s meal-window and snack policy, `data.ts:computeBolus` (recorded
as **N-16**), every migration, every dependency.

### Verification

721 unit/golden in 24 files (was 678/23) — **+43**. Security 90 pass / 1
documented skip. Typecheck clean. Lint ratchet green (6/6). RU-11-owned
fixtures (P7-002, P7-004, P7-009, P7-010, P7-011) untouched and still red.

**Runtime verification could not be completed:** the Browser pane was not
displayed for this session, so the page never composited — no screenshot, no
page context, no store injection. What was verified instead: the dev server
builds and serves `/bolus` (HTTP 200, no build or render error in the served
document), and the engine states the UI reads are covered by unit fixtures. The
params-card rows and the missing-profile entries added here have **not** been
seen rendered.

**External state:** nothing left the machine — the only request made was to
`localhost:8097`, no Supabase client exists in Demo Mode, and the fetched
document was deleted.

### Still open after Step 13

**P7-003's policy half** (a dose is still produced from fallback values) and
**P7-005's remaining surfaces** (a bare number defaults to mg/dL by convention;
no screen offers mmol/L) — both RU-11 → Step 19 · **N-16** dead duplicate
formula · **N-17** no CHECK on `correction_factor`/`carb_ratio` · **N-18** ratio
rounded before dividing · plus everything already open: N-7, N-8, N-10's
`portions_adjusted` half, N-12…N-15, NUTR-C2 (Step 18), NUTR-C3's plate-level
parts, NUTR-B1's other six nutrients, and the presentation findings.
**P7-011** and **P7-002** remain release blockers under RU-11 → Step 19.

**Current suites:** 721 unit/golden · 90 security (+1 documented skip) ·
typecheck clean · lint ratchet green at 6 findings (baseline 6).

---

## Batch 2 record (Step 14, complete)

Step 14 gave every clinical event an identity of its own. Nothing clinical was
touched: `computeIOB`, the dose formulas, the activity factor, DIA, thresholds,
the cap, ratios, targets, rounding and the whole RU-11 batch are byte-for-byte
unchanged.

### Could the existing `id` serve as the identity? Yes — no migration

Every event table is `id uuid primary key default gen_random_uuid()`, and a
default only applies when the column is **omitted**; the RLS insert policies gate
on `auth.uid() = user_id` and say nothing about `id`. So a client-supplied uuid
was always acceptable and the STOP condition in the brief was never reached. The
device now mints the key (`newEventId` in `data.ts`, `crypto.randomUUID` when the
runtime has it, a hand-laid v4 otherwise — no dependency added).

### Before → after

| | Before | After |
|---|---|---|
| identity | server-assigned after the push; the local row's id changed | minted on the device, sent as the row key, never reassigned |
| dedup | `±120 s` **and** equal data | exact set membership on the id — heuristic kept **only** for legacy timestamp-id rows |
| split dose (6 U, then 6 U) | both matched one server row → the second was **silently dropped** | two ids → two events |
| same event, clock drift > 120 s | pushed again → IOB doubled | one id → one event |
| push | `insert` (a duplicate key would fail the whole batch) | `upsert … { onConflict: 'id', ignoreDuplicates: true }` — idempotent, never overwrites the server |
| a refused write | `null`, same as demo mode and offline; row saved, screen said "saved" | `WriteOutcome` = `stored` / `local` / `failed` + reason, and the row carries `pending_sync: true` |

### Changed files

`src/services/data.ts` (identity, `WriteOutcome`, `rowIdentity`, the five saves;
`computeBolus` **deleted** — N-16) · `src/services/sync.ts` (`missingOnServer`,
`withId`, idempotent `pushRows`, five payloads) · `src/types/index.ts`
(`PendingSync` on the five event types) · `src/services/ai.ts` (one stale
comment) · new `tests/domain/syncIdentity.golden.test.ts` (15) and
`tests/domain/writeOutcome.golden.test.ts` (8) · `tests/domain/syncMealPush.golden.test.ts`
(harness gained `upsert`; assertions unchanged).

### Verification

747 unit/golden in 26 files (was 721/24) — **+26**. Clinical suite 126,
unchanged. Security 90 pass / 1 documented skip. Typecheck clean. Lint ratchet
green (6/6). Proven by fixture: two identical doses survive as two events; the
same offline event re-synced three times stays one row; a duplicate cannot
double IOB (asserted against the **real, unmodified** `computeIOB`); identity
survives local → remote → hydrate; glucose `unit` (Step 13) passes through
untouched, `mmol/L` included; a refused write keeps the event, its client
timestamp and its identity, and is distinguishable from a stored one.

Demo Mode, offline guard installed: a real save through the bolus screen
produced the client uuid `4a2800d2-…` with `pending_sync: true` (no server in
Demo Mode, so that is the truthful state). **Step 13's visual debt is cleared in
the same run** — the params card renders *"Korrekturfaktor 50 mg/dL · 1 U —
App-Standardwert (bitte anpassen)"*, *"Zielbereich 70–180 — App-Standardwert"*,
*"Verwendeter Blutzucker — nicht gemessen, Dosis ohne Blutzucker berechnet"* and
*"Kohlenhydrate — nicht eingetragen, kein Mahlzeitenbolus berechnet"* (with the
correction-only dose still produced: 1.7 U), and the missing-profile list now
names the correction factor and the target range. A typed BG of **0** produces
the hypo block, not the pre-Step-13 full meal bolus.

Zero outbound requests: the in-page guard recorded none and no external resource
was loaded. Injected state cleared, server stopped, no temporary code on disk.

**Runtime limitation:** the "two identical doses stay two events" case was
exercised at the unit level against the real `saveInsulin`, not twice through the
UI — a second UI save could not be driven reliably (the controlled BG field did
not take a programmatic value on the retry). One real UI save was verified.

### Still open after Step 14

**DATA-1's UI half** — no screen reads `pending_sync`, so a patient still sees
the same "saved" either way · **N-17** (no CHECK on `correction_factor` /
`carb_ratio`) and **N-18** (ratio rounded before dividing) — untouched, as
instructed · N-7, N-8, N-10's `portions_adjusted` half, N-12…N-15 · NUTR-C2
(Step 18), NUTR-C3's plate-level parts, NUTR-B1's other six nutrients, and the
whole nutrition presentation backlog (Nutri-Score, vitamins/minerals,
hydration, macro %, GI/GL, calorie goal, daily totals) — all still open and not
started. **P7-002, P7-004, P7-009, P7-010, P7-011 and RU-11 are untouched**;
P7-011 and P7-002 remain release blockers under Step 19.

**Current suites:** 747 unit/golden · 90 security (+1 documented skip) ·
typecheck clean · lint ratchet green at 6 findings (baseline 6).

---

## Batch 2 record (Step 15, complete)

Step 15 was security-only, and stayed there. `bolusEngine`, `computeIOB`, the
dose formulas, the activity factor, mixed-insulin handling, ratios, targets, DIA,
thresholds, the 20 U cap, `programEngine`, every nutrition calculation and every
nutrition surface are byte-for-byte unchanged — no file under `src/` was touched
at all. Three Edge Functions, one config file, one security test file and two
ledgers; nothing else.

### The premise, which cannot be fixed in a function

`verify_jwt` checks the JWT **signature**. The anon key ships inside the
published web bundle and the mobile binary, so it is public by construction, and
presented as a bearer token it passes. That was true before Step 15 and is still
true; what changed is that no function relies on it. Ten of the twelve already
re-checked the caller (`callerUserId` → 401, or `isAdminCaller` → 403); the two
that did not now do.

### Before → after

| Request | Before | After |
|---|---|---|
| `food-search` + bare anon key | ran the proxy and called Open Food Facts under the project's User-Agent | `401 unauthorized`, before the body is read |
| `nutrition-search` + bare anon key | `400 "query is required"` — body read, no authentication | `401 unauthorized`, before the body is read |
| either proxy + bare anon key + unparseable body | would have been a `500` from `req.json()` | `401` — proof the gate precedes the parse |
| `analyze-meal` + bare anon key | `500 "AI is not configured (missing GEMINI_API_KEY)"`, identical to a real patient's answer | `401`, and the two answers now differ |
| `analyze-meal` + bare anon key + malformed body | `400` from input validation, unauthenticated | `401` |
| `analyze-meal` + **locked** patient | `500` (config guard first — the lock was never consulted) | `403 "feature locked"` |
| `analyze-meal` + **unlocked** patient | `500` | `500` — unchanged, but now reachable only by an authenticated, unlocked caller |
| `OPTIONS` on either proxy, no auth | `200 ok` | `200 ok` — untouched |
| authenticated patient, either proxy | reached the handler | reaches the handler, unchanged |

`analyze-meal`'s order is now caller → feature lock → quota → body validation →
config. The individual checks, the prompts, the temperature, the model, the quota
policy, the lock policy and every successful response body are unchanged.

### Changed files

`supabase/functions/food-search/index.ts` (+15: the caller check and its
rationale) · `supabase/functions/nutrition-search/index.ts` (+18: same) ·
`supabase/functions/analyze-meal/index.ts` (the auth/lock/quota block moved above
the body parse and the `GEMINI_API_KEY` guard — statements reordered, none
rewritten) · `supabase/config.toml` (`verify_jwt = true` stated for the eight
functions that inherited it) · `tests-security/functions/authBoundary.test.ts`
(five fixtures moved, one skip replaced by four assertions, five new assertions)
· `docs/KNOWN-BAD-BASELINE.md` · `docs/REMEDIATION-PLAN.md`.

**No dependency was added or changed.** `package.json` and `package-lock.json`
are untouched by this step.

### config.toml — why it is documentation, not a behaviour change

Established **before** editing: the edge runtime's own
`SUPABASE_INTERNAL_FUNCTIONS_CONFIG` already resolved `verifyJWT: true` for all
twelve functions, and an unauthenticated request to each of the eight unlisted
ones is refused `"Missing authorization header"` today. The value written equals
the value in force, so it cannot change reachability. Verified after: the config
parses (`supabase status`), and all 24 no-credential assertions answer exactly as
before.

### Verification

Security suite **105 pass / 0 skip in 6 files** (was 90 pass + 1 documented skip;
the characterization commit took it to 92 + 1 before the flip). The skip count
changing from 1 to 0 is the SEC-1 conversion and is the only place in this step
where it was allowed to move. Unit/golden **747 in 26 files — unchanged, not
shrunk**. Clinical suite 126, unchanged. Typecheck clean. Lint ratchet green
(6 findings, baseline 6).

Order of work: the five KNOWN-BAD fixtures were written and run **green against
the old code** first, recorded in `docs/KNOWN-BAD-BASELINE.md`, and only then
inverted in place with the before state kept in the comments.

Runtime evidence, local stack only (`127.0.0.1:54321`), no provider secrets
configured: the twelve-function anon-key disposition is now `401` for
`food-search`, `nutrition-search`, `analyze-meal`, `world-recipes`, `admin-ops`
and `delete-account`; `403` for `enrich-dishes` and `gen-dish-image`; and `500`
for the four functions whose config guard still runs first. Demo Mode is not
meaningful for this step (no Supabase client, no Edge Functions involved), so no
UI run was performed.

### External state

No deployment, no `--linked`, no `db push`, no remote SQL, no GitHub push, no EAS
or Vercel action, and no production URL or credential was used. The only writes
were to the local database (test users and `feature_access` rows, created and
deleted by the suite) and to the seven files listed above. No secret was added,
read or printed. No temporary verification code remains — the probes were one-off
`curl` calls and container inspection, and everything asserted now lives in the
suite.

### Still open after Step 15

**Deployment debt, unchanged and now larger.** Step 11b's `analyze-meal` and
`nutrition-search` changes were never deployed, and Step 15 adds to the same two
files plus `food-search`. So **three Edge Functions carry undeployed source**
(`analyze-meal`, `nutrition-search`, `food-search`) and the hosted project still
runs the old code: in production, `food-search` and `nutrition-search` remain
callable with the public anon key, and `analyze-meal` still answers config before
auth. Nothing in Step 15 protects the hosted project until
`supabase functions deploy` runs. `config.toml`'s new lines likewise only take
effect on the next deploy — and are a no-op there, being already in force.

**P4-b's remaining surface** — `ai-chat`, `lab-analyze`, `tts`, `live-token`
still authenticate after their config guard (KNOWN-BAD fixture added) ·
**SEC-2** — `featureLocked` still fails open on a lookup outage, deliberately ·
**N-14** — an admin still has no way to create a `verified` catalogue row, so the
dashboard half of the lock/verification story and Step 12's fast path stay
unreachable in practice (RU-9 / Step 22).

**DATA-1 stays PARTIAL** — the data layer reports `stored` / `local` / `failed`
and marks rows `pending_sync`, and no screen reads it yet; its UI half belongs
with Step 18, untouched here.

**RU-11 is untouched.** P7-002 (activity factor scales the IOB deduction),
P7-003's remaining fallback-policy question, P7-004 (meal-window / snack ratio),
P7-009 / P12-001 (capped-dose risk reporting), P7-010 (correction discontinuity
at target high), P7-011 (mixed insulin excluded from IOB) and the RU-11
specialist review itself are all open, all still carrying red KNOWN-BAD
fixtures; P7-011 and P7-002 remain release blockers #5 and #6.

**The nutrition backlog is untouched and not started.** NUTR-A1 (Nutri-Score),
A2 (vitamins/minerals), A3 (hydration), A4 (macro %), A5 (GI/GL), A6 (calorie
split), A7, A8, A9 (day totals), B1's other six nutrients, B2, B3, B4
(rounding), C2 (Step 18), C3's plate-level bounds, P8-005 and P9-001…P9-005 —
plus N-7, N-8, N-10's `portions_adjusted` half, N-12…N-15, N-17 and N-18 — are
all exactly as Step 14 left them.

**Current suites:** 747 unit/golden · 105 security (0 skips) · typecheck clean ·
lint ratchet green at 6 findings (baseline 6).

---

## Batch 2 record (Step 16, complete)

Step 16 changed what the app **says** about its meal grade, and nothing about
how it computes one. `scoreMeal`'s arithmetic, the A–E thresholds, the label
tiers, the ring colours, `meal_score` and every stored value are byte-for-byte
unchanged, and no clinical module was opened: `bolusEngine`, `computeIOB`,
ratios, targets, DIA, thresholds, the cap, `programEngine` and sync identity are
untouched.

### Is the score a Nutri-Score? No — and it cannot be

Established from the implementation before anything was renamed, and pinned by
four fixtures that stay green forever:

| Official Nutri-Score | This score |
|---|---|
| per **100 g/ml** | per **plate** — the same food at twice the portion falls from B to C |
| **saturated fat** is a core negative component | the string "saturated" does not appear in the nutrition pipeline at all; **fat is never scored**, in any form |
| fruit / vegetables / legumes / nuts share | not collected |
| does not use the glycemic index | GI alone moves the letter **three grades** |
| points total, category-specific cut-offs (drinks, fats, general) | one linear 0..100 ladder for every food, drinks included |

So compliance is not merely unproven — the app does not hold the inputs. That is
why this step renames and re-paints rather than recomputing: a "fix" of the
algorithm would be a new metric, which is Step 20 / RU-6 territory, not this one.

### Every surface the score reaches (full trace)

| Surface | Shows | Step 16 |
|---|---|---|
| `mealScore.ts` — `scoreMeal` | 0..100 + label + colours + reasons | untouched; `nutriGrade` → `mealGrade`, `NutriGrade` → `MealGrade`, `GRADE_COLORS` added |
| `nutrition/engine.ts:532` | persists `meal_score` into the result | untouched |
| `scan-result.tsx` | A–E strip on the photo **+ the ring** | strip renamed, re-painted, note added |
| `scan-result.tsx` PDF/share export | `Nutri-Score : B`, hardcoded French | i18n label + note |
| `barcode.tsx`, `menu-scan.tsx`, `LastMealCard.tsx` | the 0..100 number and its label only — **no letter, no official palette** | unchanged (nothing to correct) |
| `journal/dayScore.ts` | day average of `meal_score` → Excellent/Good/… badge | unchanged (claims nothing) |
| `report.tsx` / `reportHtml.ts` — the **doctor report** | contains no score at all | nothing to correct; verified by search, not assumed |
| `ai-chat` system prompt | told the app shows a "Nutri-Score" | told it is the GluciAI index and never to call it a Nutri-Score |

### Before → after

| | Before | After |
|---|---|---|
| name (fr/en/de) | "Nutri-Score" | *Indice GluciAI* / *GluciAI index* / *GluciAI-Index* |
| name (ar) | "التقييم الغذائي" — neutral already | *مؤشر GluciAI* — now also says whose |
| palette | `#038141 · #85bb2f · #fecb02 · #ee8100 · #e63e11` (the official mark) | `#17A24A · #2FCB8E · #E0A93F · #F5763B · #B4441A` — the app's own tiers |
| front-of-pack cues | leaf badge + "A–E" sub-label on a frosted strip | leaf removed; sub-label now names the source ("App indicator") |
| explanatory copy | none anywhere | in-strip sub + a caption under the strip + a line in the PDF |
| PDF | `Nutri-Score : B` in French, in every language | `GluciAI-Index : B` (localized) + the note |
| AI assistant | may repeat "Nutri-Score" | instructed it is NOT one |
| the number, the letter, stored `meal_score` | — | **identical** |

### Changed files

`src/services/nutrition/mealScore.ts` (rename + `GRADE_COLORS`; `scoreMeal`
untouched) · `src/components/MealGradeBar.tsx` (**new**, replaces
`NutriScoreBar.tsx`, **deleted**) · `src/app/scan-result.tsx` (import, call,
strip, note, PDF line, one style) · `src/i18n/locales/{fr,en,de,ar}.json`
(`nutriScore` removed; `mealGrade`, `mealGradeSub`, `mealGradeNote` added) ·
`supabase/functions/ai-chat/index.ts` (one prompt paragraph) ·
`tests/domain/mealGrade.golden.test.ts` (**new**, 27) · `docs/KNOWN-BAD-BASELINE.md` ·
`docs/REMEDIATION-PLAN.md`.

**No dependency, config or build change.** `package.json`, `package-lock.json`,
`app.json`, `eas.json`, `vercel.json`, `supabase/config.toml` and every
migration are untouched.

### Verification

Unit/golden **774 in 27 files** (was 747/26) — **+27**, nothing removed.
Clinical suite **126**, unchanged. Security **105 pass / 0 skip**, unchanged.
Typecheck clean. Lint ratchet green (6 findings, baseline 6).

Order of work: the five claim fixtures were written and run **green against the
old code** first (25 passing), recorded in `docs/KNOWN-BAD-BASELINE.md`, then
inverted in place with the before state kept in the comments.

Demo Mode (web, `.env.development.local` blanks Supabase), all four locales,
one seeded meal scoring 72 → grade **B**:

- **fr** — "Indice GluciAI · Indicateur de l'app · A B C D E · Indice calculé par
  l'application à partir de ce repas — ce n'est pas un Nutri-Score officiel."
- **en** — "GluciAI index · App indicator · … it is not an official Nutri-Score."
- **de** — "GluciAI-Index · App-Indikator · … kein offizieller Nutri-Score."
- **ar** — "مؤشر GluciAI · مؤشر من التطبيق · … وليس Nutri-Score رسميًا"، `dir="rtl"`.
- rendered badge colours read back from the DOM: `rgb(23,162,74)`,
  `rgb(47,203,142)` (active, 33×33 with the white ring), `rgb(224,169,63)`,
  `rgb(245,118,59)`, `rgb(180,68,26)` — the app palette, none official.
- the ring still reads **72/100 · Gut**, i.e. the running app computes what the
  fixtures pin.
- **PDF**: the export was captured from its print frame (printing suppressed, so
  no dialog opened) — `<h2>Gesundheitswert</h2> … <p>GluciAI-Index : <b>B</b></p>`
  followed by the note. The old `Nutri-Score :` line is gone.
- at 375 px the German note wraps to two lines and is not clipped; the Arabic one
  fits on one; no horizontal overflow in any locale.

Zero external requests: every network entry in the session was `localhost:8094`
(dev server, fonts and local assets). No Supabase client exists in Demo Mode.
Injected demo state and the capture hook were removed (`localStorage` cleared,
observer disconnected, no leftover frames), and the server was stopped. No
temporary code on disk.

### Still open after Step 16

**The nutrition backlog is otherwise untouched and not started**: NUTR-A2
(vitamins/minerals), A3 (hydration), A4 (macro %), A5 (GI/GL), A6 (calorie
split), A7, A8, A9 (day totals), B1's other six nutrients, B2, B3, B4
(rounding), C2 (Step 18), C3's plate-level bounds, P8-005, P9-001…P9-005, and
N-7, N-8, N-10's `portions_adjusted` half, N-12…N-15, N-17, N-18.

**A related honesty gap this step deliberately did not widen:** the 0..100
"health score" beside the letter is the same app heuristic. It is not branded
as any standard, so NUTR-A1 does not reach it, and the explanatory line under
the strip now covers the pair. Whether that number deserves its own provenance
wording belongs with the presentation batch (Step 18/20), not here.

**Deployment debt grows by one.** `ai-chat` joins `analyze-meal`,
`nutrition-search` and `food-search` as an Edge Function whose source is ahead
of the deployed code: until `supabase functions deploy` runs, the hosted
assistant still describes the app as showing a "Nutri-Score". The app's own
screens and PDF are client-side and ship with the next web/native build.

**RU-11 is untouched.** P7-002, P7-003's fallback-policy half, P7-004, P7-009 /
P12-001, P7-010, P7-011 and the specialist review are all open with their red
fixtures; P7-011 and P7-002 remain release blockers #5 and #6. **DATA-1 stays
PARTIAL** (UI half belongs to Step 18). **SEC-2 stays open** (fail-open on a
feature-lock lookup outage, deliberately).

**Current suites:** 774 unit/golden · 126 clinical (inside that total) ·
105 security (0 skips) · typecheck clean · lint ratchet green at 6 findings
(baseline 6).

---

## Batch 2 record (Step 17, complete)

Step 17 changed what the meal screen and the meal PDF **say about** two inferred
numbers, and no number. `estimateMicros`, `estimateMealWaterMl`, `waterGoalMl`,
`scoreMeal`, the providers, the engine, `bolusEngine`, `computeIOB`, ratios,
targets, DIA, `programEngine` and sync identity are untouched; no migration, no
RLS, no Edge Function, no dependency.

### The taxonomy this step had to establish first

| Kind | Which values | Source |
|---|---|---|
| **Declared** | calories, carbs, sugar, protein, fat, fibre, sodium | the provider entry (`readNutriments`), the catalogue, or the AI's per-100 g fallback |
| **Calculated** | macro %, GI (carb-weighted), GL, meal score, burn minutes, goal remainder | arithmetic over declared values |
| **Estimated** | **vitamin A, C, iron, calcium, potassium; the meal's water** | `MICRO_PER_100G` / `WATER_FRACTION` for the food's CATEGORY × its grams. **No provider supplies any of them** |
| **Defaulted** | portion 100 g, confidence 60 when the model stated none | flagged since Step 11b (`*_stated: false`) |
| **Absent** | any nutrient the source never stated | carbohydrate says so (`carbs_known`); **the other six print `0`** |

Proven, not assumed: two plates with the same category and grams but wildly
different measured macros produce **identical** micronutrients and water —
nothing about the real food reaches those numbers.

### Where provenance travels

`estimateMicros` / `estimateMealWaterMl` run **at render**, from the current
items. They are **not** persisted in `NutritionResult`, not synced, not in the
journal, the meal detail, the day totals, the doctor report or any AI surface —
searched, not assumed. So the entire NUTR-A2/A3 surface is exactly two cards on
`scan-result` plus two blocks of the sharable meal PDF, and an edited portion
re-computes both the estimate and its coverage.

### Before → after

| | Before | After |
|---|---|---|
| hydration line | "{{ml}} ml apportés par ce repas" — a factual claim | "≈ {{ml}} ml estimés pour ce repas" (fr/en/de/ar) |
| vitamins card | title, five filled bars, five percentages, nothing else | same bars, same percentages, **plus** "Estimated from each food's category and weight — no measured values" |
| coverage | never stated | "Calculated on {{pct}} % of the plate" whenever an unidentified food was excluded |
| low-confidence foods (NUTR-B3) | counted in full, silently | counted in full, and named: "including {{g}} g identified with low confidence" |
| a capped share | 344 % of vitamin C printed as "100 %" | printed **"≥ 100 %"** — same value, same full bar |
| meal PDF | both estimates bare | same note line; hydration row prints the estimate sentence |
| every displayed figure | — | **identical** |

### Changed files

`src/services/nutrition/micros.ts` (**new** `microProvenance` + `SURE_CONFIDENCE`;
`estimateMicros` / `estimateMealWaterMl` / `waterGoalMl` untouched) ·
`src/app/scan-result.tsx` (provenance call, two card feet, `MicroBar` gains
`atLeast`, PDF `bar()` gains `atLeast`, PDF note, PDF hydration row, two styles) ·
`src/i18n/locales/{fr,en,de,ar}.json` (`waterFromMeal` reworded; four new keys) ·
`tests/domain/nutritionProvenance.golden.test.ts` (**new**, 19) ·
`docs/KNOWN-BAD-BASELINE.md` · `docs/REMEDIATION-PLAN.md`.

**No dependency, config or deployment change.** No Edge Function was touched, so
the deployment debt is unchanged from Step 16 (`analyze-meal`,
`nutrition-search`, `food-search`, `ai-chat`).

### Verification

Unit/golden **792 in 28 files** (was 774/27) — **+18**, nothing removed;
`nutritionMicros.golden.test.ts`'s 37 fixtures untouched, which is what proves
no value moved. Clinical **126**, unchanged. Security **105 pass / 0 skip**,
unchanged. Typecheck clean. Lint ratchet green (6 findings, baseline 6).

Order of work: the five claim fixtures were written and run **green against the
old code** first (13 passing), recorded in `docs/KNOWN-BAD-BASELINE.md`, then
inverted in place with the before state kept in the comments.

Demo Mode (web, `.env.development.local` blanks Supabase), all four locales, on a
plate built to exercise every case at once — 800 g fruit (confident), 100 g
vegetables at `nutrition_confidence` 0.1, 200 g unidentified:

- vitamin A **58 %**, C **≥ 100 %** (raw share 344 %), iron **24 %**, calcium
  **16 %**, potassium **54 %** — the five numbers are exactly what the fixtures
  pin; only vitamin C's *label* changed;
- "Calculated on **82 %** of the plate · including **100 g** identified with low
  confidence" — 900 g of 1100 g counted, the unidentified 200 g excluded;
- hydration "≈ **772 ml** estimated for this meal" (0.85×800 + 0.92×100, the
  unidentified food excluded), with the same provenance foot;
- fr/en/de/ar all render their own sentences; Arabic keeps `dir="rtl"`;
- **PDF** captured from its print frame (printing suppressed, no dialog opened):
  the bars carry `≥ 100 %`, the note line prints with coverage and
  low-confidence grams, and the hydration row reads the estimate sentence
  instead of a bare `772 ml`;
- at 375 px in German (the longest strings) the feet wrap to 3–4 lines
  un-clipped, `≥ 100 %` fits its column, and there is no horizontal overflow.

Zero external requests: every network entry was `localhost:8094`; a filter for
non-localhost traffic returned nothing. Injected demo state and the capture hook
removed, server stopped, no temporary code on disk.

### Still open after Step 17

**NUTR-B1 remainder — the one the trace makes hardest to unsee.** An absent
sugar, protein, fat, fibre or sodium is still read as `0` by `readNutriments`
with no `*_known` flag, so for six of the seven declared nutrients **`0` means
both "measured zero" and "never stated"**. Carbohydrate is the exception, closed
in Step 10 because a dose depends on it. Fixed nowhere in Step 17 (explicitly out
of scope), now pinned by a red fixture. **NUTR-A7** is its twin: `fieldsFound`
counts how complete an entry is (1 vs 7 in the fixture) and no surface reads it.

**NUTR-B3's threshold half** — a 0.1-confidence food still contributes its full
category density; Step 17 only made it visible. Whether it should contribute at
all, or at a weight, is an RU-3 nutrition call.

**NUTR-B2** — NaN `portion_grams` still propagates into both estimates.

**Not started, and untouched:** NUTR-A4 (macro %), A5 (GI/GL), A6 (calorie
split), A8, A9 (day totals), B4 (rounding), C2 (Step 18), C3's plate-level
bounds, P8-005, P9-001…P9-005, P16-006, and N-7, N-8, N-10's
`portions_adjusted` half, N-12…N-15, N-17, N-18. The micronutrient DENSITIES and
the water fractions themselves are unreviewed — Step 17 labelled the estimate,
it did not validate it; and the daily reference intakes are single adult FDA
values, not per-patient. Both belong to RU-3 with the rest of the nutrition
review.

**RU-11 untouched.** P7-002 and P7-011 remain release blockers #5 and #6, with
P7-003's fallback-policy half, P7-004, P7-009 / P12-001, P7-010 and the
specialist review. **DATA-1 stays PARTIAL** (UI half, Step 18). **SEC-2 stays
open.**

**Current suites:** 792 unit/golden · 126 clinical (inside that total) ·
105 security (0 skips) · typecheck clean · lint ratchet green at 6 findings
(baseline 6).

---

## Batch 2 record (Step 18, complete)

Step 18 changed what three surfaces SAY, and no number anywhere. The dose path
is untouched in the strictest sense: `bolusEngine`, `computeIOB`, the activity
factor, mixed-insulin IOB, ratios, ISF, targets, DIA, `programEngine`, sync
identity, dedup and retry are byte-for-byte unchanged, and **no confirmation
gate was introduced** — a seeded carbohydrate still reaches the engine exactly
as it did before.

### The four authorized items

**1 · NUTR-C2 — provenance on the seeded carbohydrate (labelling half).** The
pre-fill rule moved out of a `.tsx` initializer into `carbSeed`, which returns
the ORIGIN beside the value. The screen prints it, and the label disappears the
moment the patient types — so an app-supplied number and a hand-typed one are
now distinguishable. Precedence, value and rounding are identical.

**3 · Programme route parameter.** Labelled as a planned, programme-derived
figure. **Not** sanitized, not bounded, not re-routed: those would change a dose
input.

**4 · P8-005.** `displayableHighlights` suppresses the POSITIVE badges for a
plate with no energy or an unknown carbohydrate. `buildHighlights` is unchanged
and stored `NutritionResult.highlights` are never rewritten.

**5 · DATA-1 UI half.** `rowIdentity` now also sets `sync_state`, `savedStateKey`
maps it to one of three sentences, and the two surfaces that claim persistence
read it.

### Before → after

| | Before | After |
|---|---|---|
| carb field, known meal | `62`, unlabelled | `62` + *"Pre-filled from « Couscous » · 13:04 — check it before calculating"* |
| carb field, programme hand-off | `45`, unlabelled, silently outranking the meal seed | `45` + *"Pre-filled from your programme (planned meal)"* |
| carb field, unknown carbohydrate | empty + Step 10's pill | **unchanged** |
| carb field, genuine 0 g | `0` | `0`, labelled as coming from that meal — **not** as unknown |
| after the patient types | label would have been wrong | label gone; the value is theirs |
| what the engine receives | the field's value | **the same value, at the same moment** |
| home card, unidentified plate | "Low glycemic load · Low sugar" beside 0 kcal | "Low protein" only |
| home card, real plate | its badges | **the same badges** |
| after a save | "Injection enregistrée dans ton journal" for all three outcomes | that, plus *"Saved to your account"* / *"Saved on this device — waiting to sync"* / *"Not saved to your account yet — kept here and re-sent at the next sync"* |

### Changed files (12)

`src/services/nutrition/carbProvenance.ts` (**new** `carbSeed` + `CarbSeedOrigin`;
`seedCarbsFromMeal` untouched) · `src/services/nutrition/advice.ts` (**new**
`displayableHighlights`; `buildHighlights` untouched) · `src/services/data.ts`
(`rowIdentity` gains `sync_state`; **new** `savedStateKey`) · `src/types/index.ts`
(`PendingSync.sync_state`, local-only) · `src/app/bolus.tsx` (seed rule, origin
label, touched-tracking, save outcome, two styles) · `src/app/scan-result.tsx`
(save outcome → modal) · `src/components/SaveConfirmModal.tsx` (optional
`stateKey` line) · `src/components/LastMealCard.tsx` (filtered badges) ·
`src/i18n/locales/{fr,en,de,ar}.json` (5 new keys each) ·
`tests/domain/carbSeed.golden.test.ts` (**new**, 15) ·
`tests/domain/highlightsDisplay.golden.test.ts` (**new**, 10) ·
`tests/domain/writeOutcome.golden.test.ts` (+7) · both ledgers.

**No dependency, config, migration, RLS, Edge Function, CI, Sentry, EAS, Vercel
or deployment change.** `sync_state` needs no column: every push payload in
`sync.ts` is an explicit field list, asserted by a fixture.

### Verification

Unit/golden **824 in 30 files** (was 792/28) — **+32**, nothing removed.
Clinical **126**, unchanged — no clinical module was imported, let alone edited.
Security **105 pass / 0 skip**. Typecheck clean. Lint ratchet green (6/6).

Order of work: the ten claim fixtures were written and run **green against the
old code** first (25 passing), recorded in `docs/KNOWN-BAD-BASELINE.md`, then
inverted in place with the before state in the comments.

Demo Mode (web, Supabase blanked), zero external requests — every case driven
live:

- known meal → field **`62`** unchanged, labelled *"Pré-rempli depuis « Couscous
  aux légumes » · 00:08 — vérifiez avant de calculer"*;
- typing `75` → the label disappears, Step 10's one-tap pill stays;
- unknown carbohydrate → field **empty**, no origin label, Step 10's
  *"Glucides non confirmés…"* pill unchanged;
- genuine 0 g (water) → field **`0`**, labelled as coming from that meal, **not**
  reported as unknown;
- `?carbs=45` → field **`45`** exactly, labelled *"Pré-rempli depuis votre
  programme (repas planifié)"*;
- **no gate**: pressing Calculate on the seeded 45 g produced *"Repas — 45 g ÷
  ratio 10 → +4,5 U"*, i.e. the seed reached the engine untouched;
- unidentified plate on home → *"Peu de protéines"* only; the two compliments
  are gone. A real plate still shows *"Riche en protéines · Riche en fibres"*;
- saving a dose → *"✓ Injection enregistrée dans ton journal."* **plus**
  *"Enregistré sur cet appareil — synchronisation en attente"*;
- fr/en/de/ar all render their own sentences; Arabic `dir="rtl"`; at 375 px the
  German label wraps to two lines and the Arabic save line to one, neither
  clipped, no horizontal overflow.

**Verification limit, stated plainly:** Demo Mode has no Supabase client, so it
can only produce the `local` outcome. `stored` and `failed` are proven by
fixtures that run the REAL save functions against a double whose insert can be
told to fail (`sync_state`, `savedStateKey`, and the four event tables), plus
locale assertions that all three sentences exist and differ in all four
languages. The `SaveConfirmModal` wiring is asserted at source level; its line
was not rendered live, because reaching an unsaved plate needs the camera flow.

### External state

No deployment, no push, no `--linked`, no migration, no remote SQL, no EAS or
Vercel action, no production URL or credential. The only writes were to the
files listed above; injected demo state was cleared, the server stopped, and no
temporary code remains on disk.

### Still open after Step 18

**NUTR-C2 item 2 — the confirmation gate, explicitly unresolved.** A seeded
carbohydrate still reaches the calculation with no acknowledgement from the
patient. It was excluded by instruction because requiring confirmation changes
what the engine receives when the patient does not confirm — a **dose-input**
decision. A fixture now asserts that no such gate exists, so it cannot appear by
accident; closing it needs an explicit clinical authorization.

**Newly observed, not fixed:** a wholly unidentified plate still scores
**100/100 "Excellent"** with the tip *"Repas équilibré pour votre glycémie"* on
the home card. That is `scoreMeal` and its reasons, not a P8-005 badge, so it
was outside the authorized scope — the same class of error, one layer over.
Recorded for RU-3 with the presentation batch.

**Quiet save paths:** `log-glucose` and `log-insulin` close silently, and
`barcode` / `foods` / `menu-scan` / `program-workout` show a brief tick. None of
them claims account persistence, so none was made to lie — but a **failed** write
is still invisible there. Left as-is deliberately (new UI on four more screens
is not the smallest remediation); recorded for RU-5.

**Everything Step 17 left open stays open:** the six nutrients where `0` means
zero or missing (NUTR-B1), `fieldsFound` (NUTR-A7), NUTR-B3's threshold half,
NUTR-B2's NaN portions, the vitamin/mineral estimate's own validity, the
hydration goal, the calorie goal, macro percentages, GI/GL, NUTR-A4/A5/A6/A8/A9,
B4, C3, P9-001…P9-005, P16-006, and N-7, N-8, N-10's `portions_adjusted` half,
N-12…N-15, N-17, N-18. **SEC-2** stays open; the four Edge Functions
(`analyze-meal`, `nutrition-search`, `food-search`, `ai-chat`) remain undeployed.

**RU-11 / Step 19 is untouched and still blocking.** **P7-002** (activity factor
scales the IOB deduction) and **P7-011** (mixed insulin excluded from IOB) remain
**release blockers #5 and #6**, together with P7-003's fallback-policy half,
P7-004, P7-009 / P12-001, P7-010 and the specialist review itself — all still
carrying red fixtures.

**Current suites:** 824 unit/golden · 126 clinical (inside that total) ·
105 security (0 skips) · typecheck clean · lint ratchet green at 6 findings
(baseline 6).

---

## Batch 3 record (Step 19B-1, complete)

Step 19B-1 changed **one thing a patient sees** and **no dosing behaviour at
all**. `computeIOB`, `computeSmartBolus`, `localDoseCheck`, `ratioForMeal`,
`isfForProfile`, `targetsForProfile`, `readGlucose`, `computeTrend`, DIA, the
factors, the targets, the ICR/ISF defaults, the meal windows, the correction
threshold, the rounding, the 20 U cap and the assembly order are byte-for-byte
unchanged. No clinical policy was chosen.

### What was authorized, and what was done

| Item | Done |
|---|---|
| P7-009 presentation | The bolus screen reads the `capped` flag and names the app's maximum beside the uncapped figure |
| RU-11 characterization | 30 clinical fixtures pinning P7-002, P7-011, P7-010, P7-004, P7-003, SPORT-1, ALC-1 and the cap contract |
| Two new findings recorded | SPORT-1 and ALC-1 in both ledgers |
| Premix data model | **Proposal only** — see below. No field, no migration, no default split |

### P7-009 — before → after

| | Before | After |
|---|---|---|
| hero, capped case | `20 U`, indistinguishable from any other dose | `20 U` — **unchanged** |
| under the hero | nothing | *"⚠️ Dose limited to the app's maximum (20 U)"* + *"The calculation came to 500 U. The app never shows more than 20 U: this ceiling is a limit of the app, not a dose recommended for you. Check the carbohydrates you entered, and talk to your doctor before injecting."* |
| hero, normal dose | `6 U` | `6 U`, **no notice** |
| hypo case | red hero, no number | unchanged — the notice is suppressed |
| `localDoseCheck` | `{risk:'ok', reasons:[]}` for a ceiling accepted unchanged | **unchanged — still open** |

The wording names the app's own limit and explicitly denies that it is a
recommended dose. It makes no clinical claim and proposes no alternative number.

### Proof the numbers did not move

`tests/clinical/ru11Baseline.golden.test.ts` pins, and they all pass unchanged:
5000 g → `total` exactly **20**, `flags` contains `capped`, `rawTotal` **500**;
200 g → 20 U **without** the flag; 201 g → 20 U with the flag and `rawTotal`
20.1; 63 g → 6.3 U, rounding untouched. Demo Mode agreed: the hero read **20 U**
and the breakdown *"+500 U … Dose totale 20 U"* — the very discrepancy the notice
now explains.

### The 30 clinical fixtures, and what they pin

- **P7-002 (6)** — the IOB-scaling gap is exactly `iob × (1 − factor)`: exercise
  0.75 with 3 U active → 2.3 U (subtract-last would be 1.5); with 6 U active the
  gap doubles to 1.5 U; **no IOB → the two arrangements agree exactly**; sick
  1.15 → 3.5 U where subtract-last gives 3.9 (the opposite direction); stress
  1.1 and paused 1.08 likewise; compounded factors → 2.6 U vs 2.2 U.
- **P7-011 (5)** — 12 U of premix 30 min ago → **0 U of IOB**; the same units as
  rapid → 10.5 U; end to end a premix-only patient gets the full 6 U meal bolus
  with `flags: ['noGlucose']` — no flag, no field, nothing a screen could warn
  from; a mixed dose is dropped even beside a rapid one.
- **P7-010 (3)** — 180 → 0 U, 181 → 1.1 U; the step follows the target range and
  ISF, not the excess.
- **P7-004 (3)** — 17:59 → snack → the lunch ratio → 5 U; 18:00 → dinner → 10 U;
  an explicit `mealTime` overrides the clock.
- **P7-003 (3)** — `profile: null` still yields 6 U and a 2.5 U correction from
  the app's own 10 g/U, ISF 50, 70–180, with all three sources reported.
- **SPORT-1 (3)** and **ALC-1 (3)** — as recorded above.
- **Cap contract (4)** — the four assertions quoted in the previous section.

Every one of these is KNOWN-BAD and **must not be flipped** without specialist
authorization; the file says so at the top.

### Premix insulin — data-model proposal, NOT implemented

The blocker is not arithmetic, it is representation: an `insulin_logs` row
carries one `dose` and `insulin_type in ('rapid','long','mixed')`, and a premixed
dose's rapid fraction is not derivable from it. **No split is assumed here — not
30/70, not 25/75, not 50/50, not any other.**

The minimum that would let mixed insulin be modelled safely, once a clinician
authorizes the pharmacology:

1. **Name the product, per profile.** A `premix_products` concept (or profile
   fields) holding a product name plus its **declared** rapid percentage, entered
   by the patient or their doctor from the pen's label — never inferred, never
   defaulted.
2. **Reference it from the event.** A nullable `premix_rapid_pct` (or a product
   reference) on the `mixed` row, resolved **at log time** so a later product
   change cannot retroactively rewrite past doses.
3. **Keep the two populations distinguishable.** Rows written before this exists
   carry `null`, and `null` must never be read as "assume a split". They stay
   **explicitly unknown**, exactly as legacy carbohydrate rows stayed
   `indeterminate` in Step 10 — that precedent is what makes this safe without a
   backfill and without a migration of historical data.
4. **Gate the dosing separately.** Even with a known percentage, whether the
   rapid fraction may enter IOB — and on which action curve — is a clinical
   decision. The data model must be shippable *without* changing any dose:
   capture first, dose later, behind an explicit authorization.
5. **Interim, non-dosing option** (also unimplemented): when a patient's logged
   `mixed` insulin is recent enough to be active, say on the bolus screen that
   it is **not** counted in IOB. That is presentation, changes no dose, and is
   the smallest thing that would stop the silence — but it is not authorized in
   this step either.

### Changed files (8)

`src/app/bolus.tsx` (reads the `capped` flag; notice + 3 styles; `MAX_SAFE_BOLUS`
imported) · `src/i18n/locales/{fr,en,de,ar}.json` (`bolus.cappedTitle`,
`bolus.cappedBody`) · `tests/clinical/ru11Baseline.golden.test.ts` (**new**, 30) ·
`tests/domain/cappedDose.golden.test.ts` (**new**, 5) · `docs/KNOWN-BAD-BASELINE.md`
· `docs/REMEDIATION-PLAN.md`.

**Not changed:** `bolusEngine.ts`, `DoseHero.tsx` (a prop was drafted and then
fully reverted rather than risk a fixed-height overlap), `programEngine`, `sync`,
any migration, schema, Edge Function, dependency, config, CI, Sentry, EAS or
Vercel setting.

### Verification

Unit/golden **859 in 32 files** (was 824/30) — **+35**, nothing removed.
**Clinical 156** (was 126) — **+30 by instruction**; every pre-existing clinical
fixture passes unchanged. Typecheck clean. Lint ratchet green (6/6).

**Security suite: still NOT re-run.** The local Supabase stack is down
(`127.0.0.1:54321` → no response; the Docker daemon does not answer). The suite's
PHASE-1 guard was not bypassed, production was not touched, and the debt from
Step 18 therefore stands: last known result 105 pass / 0 skip.

Demo Mode, zero external requests (a filter for non-localhost traffic returned
nothing): capped case verified in **fr, en, de, ar** at **375 px**, RTL correct,
the German notice wrapping to five lines un-clipped and no horizontal overflow;
a normal 6 U dose shows no notice. Injected state cleared, server stopped, no
temporary code on disk.

### Status of every dose-affecting finding — ALL STILL OPEN

**P7-002** (activity/factor × IOB ordering) — **release blocker #6**, unchanged,
now with 6 fixtures. **P7-011** (mixed insulin in IOB) — **release blocker #5**,
unchanged, 5 fixtures, and blocked additionally on the data model above.
**P7-003** policy half — **release blocker #3**, unchanged. **P7-004**,
**P7-010**, **SPORT-1**, **ALC-1** — unchanged. **P7-009** — presentation half
closed; the `localDoseCheck` half remains open.

No dose-affecting RU-11 finding is fixed. The project is **not** release-ready.

### Nutrition backlog — confirmed still open

The unidentified plate still scores **100/100 "Excellent"** with a *"balanced
meal"* tip (`scoreMeal` / `quality.reasons`, recorded under P8-005 and in the
ledger). Also still open and untouched: NUTR-B1's other six nutrients, NUTR-A7,
NUTR-B2, NUTR-B3's threshold half, NUTR-A4/A5/A6/A8/A9, NUTR-B4, NUTR-C3's
plate-level parts, NUTR-C2's confirmation gate, P9-001…P9-005, P16-006, N-7,
N-8, N-10's `portions_adjusted` half, N-12…N-15, N-17, N-18, DATA-1's quiet save
paths, **SEC-2**, and the four undeployed Edge Functions.

---

## Batch 3 record (Step 19B-2, complete — decision package only)

**No code changed.** No dosing behaviour, no fixture expectation, no engine, no
schema, no migration, no dependency, no configuration. The step produced one new
document and two pointers.

### What it produced

[RU11-CLINICAL-DECISIONS.md](RU11-CLINICAL-DECISIONS.md) — for each of P7-002,
P7-011, P7-003, P7-004, P7-010, SPORT-1, ALC-1 and the P7-009 remainder: the
exact current rule as it runs, worked dose examples taken from the Step 19B-1
fixtures, the patient-safety failure mode, whether a change moves a dose, what
engineering can settle without a clinician, the exact question that needs one,
the minimum implementation once answered, the tests that must accompany it, and
the dependencies between findings. It closes with **Q1–Q14**, written to be
answered directly by a diabetes/insulin specialist, and with the premix
data-model proposal (no split assumed, legacy rows stay explicitly unknown, no
migration written).

### Newly verified in this step (facts, not changes)

- `localDoseCheck(20, cappedEngine)` still returns `{risk:'ok', reasons:[]}`, and
  `bolus.tsx:314` short-circuits `verifyAndSave` when `dose === engine.total`, so
  for an **accepted** ceiling the check is never called. P7-009's presentation
  half is closed; this half is not.
- Alcohol's two effects compound: because the correction is halved *inside* the
  bracket that is then multiplied by 0.9, the correction lands at **45 %** of its
  sober value (8.5 U → 6.5 U on the reference case).
- The local Supabase stack is still down (`54321` and `54322` both unreachable),
  so the security suite could not be re-run.

### Status after Step 19B-2

**Blocked on specialist authorization (Q1–Q14):** P7-002 (blocker #6), P7-011
(blocker #5, also blocked on data capture), P7-003 policy half (blocker #3),
P7-004, P7-010, SPORT-1, ALC-1. **No dose-affecting finding is fixed.**

**Unblocked, no clinical value needed:** P7-009's `localDoseCheck` half
(informational reason on the existing `capped` flag, risk unchanged) · premix
**capture** once Q5 is answered · the entire nutrition backlog · the security and
deployment debt · Steps 20–25.

**The nutrition backlog is unchanged and remains open in full** — the
unidentified plate still scoring 100/100 "Excellent" with a "balanced meal" tip,
NUTR-B1's remaining six nutrients, NUTR-A7, NUTR-B2, NUTR-B3's threshold half,
micronutrient estimate validity, the hydration goal, the calorie goal, macro
percentages, GI/GL, NUTR-A4/A5/A6/A8/A9, NUTR-B4, NUTR-C2's confirmation gate,
NUTR-C3's plate-level parts, P9-001…P9-005, P16-006 and the remaining N-series.

**The project is NOT release-ready.**

---

## Batch 4 record (Step 20, partial — bounded by the unavailable local stack)

Step 20 set out to clear the non-clinical data-integrity backlog. **The Docker
daemon did not respond** (`docker ps` → exit 124 after 25 s; ports 54321, 54322
and 54323 all unreachable), which bounds what could honestly be done: a migration
that cannot be applied to the local stack cannot be verified, and the standing
instruction is that migrations are tested locally before they are written into
the tree. So the DB half of Step 20 is **deferred, not skipped**, and the step
delivered the client-side half.

**No clinical policy was chosen, and no specialist-blocked behaviour moved.**

### Audited, and what became of each

| Finding | Verdict |
|---|---|
| **P8-006** — `aggregateItems([])` throws | ✅ **FIXED** (below) |
| **N-8** — provenance-blind forecast | **Re-scoped**: the module has no caller; recorded with fixtures, arithmetic untouched |
| **N-7** — no CHECK on `meal_scans` | **Deferred** — migration, untestable without the stack |
| **N-17** — no CHECK on `correction_factor` / `carb_ratio` | **Deferred** — migration. Note the *contract* is already established (Step 13's `clinicalNumber`: finite and `> 0`), so a `> 0` constraint would invent nothing; anything tighter would. Untestable today |
| **N-12** — any patient may update any unverified catalogue row | **Deferred** — RLS policy change = migration |
| **N-13** — `p_source='user'` overwrites authoritative values | **Deferred** — RPC change = migration |
| **P8-004** — compound rounding without `per100g_base` | **Deferred, and re-classified.** Its own fixture states the drift "feeds the bolus calculation": correcting it changes a carbohydrate that seeds a dose. That makes it a **dose-input** change, the same class Step 18 held back for NUTR-C2's confirmation gate. Needs the RU-16 backfill plus authorization |
| **N-18** — ratio rounded to 2 dp before dividing | **Deferred** — lives in `bolusEngine`; rounding there is explicitly out of scope this step |
| **P16-006** — `parseDecimal('1,234')` → 1.234; Arabic-Indic digits unparseable | **Deferred, and re-classified as dose-input.** `parseDecimal` parses the carbohydrate and glucose fields; changing what "1,234" means changes what the engine receives. Must be authorized like any other dose-input change, and needs the i18n decision about which decimal separators a locale accepts |

### P8-006 — before → after

| | Before | After |
|---|---|---|
| `aggregateItems([])` | **TypeError** (`[...].sort()[0][0]` on an empty map) | a well-formed empty `NutritionResult` |
| confidences on an empty plate | `0/0` → **NaN** | `0` |
| `source` on an empty plate | crash | **omitted** — the field is optional and nothing produced it |
| carbohydrate on an empty plate | crash | `0` with **`carbs_known: false`** — unknown, never dosable |
| a plate with foods | unchanged | **unchanged**, asserted by a fixture |

Reachable through `engine.ts:339` (the resolver's own return, after it filters
every unmatched food out), `scan-result.tsx:416`, `program.ts:241` and `:281`.

### Changed files (5)

`src/services/nutrition/engine.ts` (the two crash/NaN sites in `aggregateItems`;
nothing else) · `tests/domain/nutritionScaling.golden.test.ts` (the P8-006
fixture inverted in place + 2 new) · `tests/domain/predictionProvenance.golden.test.ts`
(**new**, 6) · `docs/KNOWN-BAD-BASELINE.md` · `docs/REMEDIATION-PLAN.md`.

**No migration, no schema, no RLS, no RPC, no Edge Function, no dependency, no
configuration.** `bolusEngine.ts` and `computeIOB` untouched.

### Verification

Unit/golden **867 in 33 files** (was 859/32). **Clinical 156 — unchanged**, so
every RU-11 KNOWN-BAD fixture (P7-002, P7-011, P7-010, P7-004, P7-003, SPORT-1,
ALC-1 and the cap contract) still passes in its recorded characterization state.
Typecheck clean. Lint ratchet green (6/6).

Demo Mode smoke test, zero external requests: a two-food plate aggregates
correctly end to end (50 g of carbohydrate, GI 70, both foods listed at 100 %
confidence), no console errors — the guard changed nothing on the populated
path. Injected state cleared, server stopped, no temporary code.

**Security suite: still NOT run.** Docker unavailable; the guard was not
bypassed and production was not touched. Debt open since Step 18 (last known
105 pass / 0 skip).

### Still open after Step 20

**The DB batch moves to a future step, unchanged:** N-7, N-17, N-12, N-13 — plus
N-14 (no admin verification workflow) and N-15 (patient label confirmation not
fed back). All four migrations should land together, applied and asserted
against a running local stack, with the security suite green in the same run.

**Newly classified as dose-input changes** (authorization required, same gate as
NUTR-C2 item 2): **P8-004** and **P16-006**.

**The nutrition backlog is untouched and remains open in full**, including the
one this step re-checked and did **not** fix: an unidentified plate still scores
**100/100 "Excellent"** with a *"balanced meal"* tip — `scoreMeal` and its
reasons, scheduled with the presentation batch under RU-3, and now the most
visible remaining nutrition defect. Also open: NUTR-B1's remaining six
nutrients, NUTR-A7, NUTR-B2, NUTR-B3's threshold half, micronutrient estimate
validity, the hydration goal, the calorie goal, macro percentages, GI/GL,
NUTR-A4/A5/A6/A8/A9, NUTR-B4, NUTR-C2's confirmation gate, NUTR-C3's
plate-level parts, P9-001…P9-005, P16-006 and the remaining N-series.

**RU-11 remains blocked on Q1–Q14** in
[RU11-CLINICAL-DECISIONS.md](RU11-CLINICAL-DECISIONS.md). P7-002 and P7-011 are
still **release blockers #5 and #6**.

**The project is NOT release-ready.**

---

## Batch 4 record (Step 20B — re-audit complete, implementation BLOCKED)

Step 20B was authorized to land N-7, N-17, N-12 and N-13. **It did not**, because
the precondition could not be met: the local stack must be reset from zero and
the full security suite run before any migration enters the tree, and the Docker
engine does not serve its API.

### Infrastructure evidence (this is what "unavailable" means here)

| Probe | Result |
|---|---|
| `docker ps` (12 attempts over ~3 min) | **ENGINE STILL DOWN** |
| `docker version --format {{.Server.Version}}` | **exit 124** (timeout — the *server* half never answers) |
| `docker info` | **exit 124** |
| Supabase 54321 / 54322 / 54323 | **all unreachable** |
| Docker Desktop processes | **running** (`com.docker.backend`, 4 × `Docker Desktop`) |
| WSL distros `Ubuntu`, `docker-desktop` | **Running** |
| Named pipes `dockerDesktopEngine`, `docker_engine` | **present** |

Processes up, pipes present, engine not answering — a half-started Docker
Desktop. Likely fix on the operator side: quit Docker Desktop, `wsl --shutdown`,
start it again and wait for the whale icon to stop animating.

**No migration file was written.** An untested migration in the tree is worse
than none: the next reader would assume it had been applied and asserted.

### Re-audit results — all four defects CONFIRMED to still exist

**N-17** — `profiles.carb_ratio` and `profiles.correction_factor` are bare
`numeric` (`0001_init.sql:17-18`), while `0022_insulin_plan.sql:9-14` constrains
its own columns as `is null or (x > 0 and x <= 20)`. Step 13's `clinicalNumber`
(finite and `> 0`) is the established contract, so a `> 0` CHECK would invent
nothing — **but the `<= 20` half of 0022's precedent must NOT be copied onto a
carb ratio or an ISF; those bounds are clinical.** Also noted, same family and
same file: `target_low` / `target_high` carry `not null default 70/180` with no
CHECK and no ordering constraint, although Step 13 requires both `> 0` and
`low <= high`.

**N-7** — `meal_scans` (`0001_init.sql:27-39`) stores `calories, carbs, sugar,
protein, fat, fiber, glycemic_index, confidence` as bare `numeric`. **New
consideration found during this re-audit:** a CHECK here interacts with Step 14's
offline queue — a row that violates it can never be pushed and would retry
forever. Any constraint must therefore be limited to **domain impossibilities**
(`>= 0`), never to plausibility ranges, which Step 11a deliberately implemented
as *flagging* rather than rejection.

**N-12** — `product_catalog_update` is
`using (not verified) with check (not verified)`: any authenticated patient may
update any unverified row, with **no ownership predicate**. Confirmed verbatim in
`0026_product_catalog.sql:76-82`.

**N-13** — `upsert_product` treats `p_source = 'user'` as an override for every
macro (`excluded.x`), where any other source only fills nulls
(`coalesce(pc.x, excluded.x)`). **Two new facts from this re-audit:**

1. the `on conflict` branch **never updates the `source` column**, so a
   user-claimed overwrite leaves the row labelled `openfoodfacts` (or whatever it
   was) — and Step 12's read-side trust check therefore still treats it as
   authoritative. This is the sharper half of the finding;
2. the function is **`security invoker`**, so it runs under the caller's RLS.
   Tightening N-12's UPDATE policy to `contributed_by = auth.uid()` would
   therefore also block the RPC's legitimate `scan_count` bump and gap-fill on
   rows contributed by *other* patients — the catalogue's entire purpose.

**Therefore N-12 and N-13 must be remediated together, not separately.** The
shape that satisfies both without weakening RLS or making the catalogue
authoritative: keep community contribution flowing through the RPC (moved to
`security definer` with a narrow, audited body that never overwrites a non-null
value from a more authoritative source and never lets a caller's claimed
`p_source` upgrade a row's stored trust label), and restrict *direct* table
updates to the contributor's own rows. Both halves need
`tests-security/rls/catalog.test.ts` extended and green before they land.

### Status

N-7, N-17, N-12, N-13: **still OPEN**, now with a verified defect trace and a
reviewed remediation shape, ready to implement the moment the engine answers.
Nothing was marked fixed. No migration, no schema, no RLS, no RPC, no code and
no dependency changed in Step 20B.

**Security-suite debt: still OPEN** (unchanged since Step 18; last known 105 pass
/ 0 skip). **The project is NOT release-ready.**

### Step 20B — second attempt (still blocked)

A second attempt was made after the engine was reported healthy. It was not:

| Probe | Result |
|---|---|
| `docker version --format server=…` (Git Bash, 40 s) | **exit 124** |
| `docker version` (PowerShell job, 60 s) | **TIMED OUT** |
| `docker ps` (PowerShell job, 45 s) | **TIMED OUT** |
| `npx supabase status` (120 s, stderr captured) | **exit 124, no output** |
| `curl http://127.0.0.1:54321/rest/v1/` | **000** — no HTTP response |
| `Test-NetConnection` 54321 / 54322 / 54323 | **TcpTestSucceeded = True** |

The last two rows together are the diagnosis: the TCP connect succeeds but
nothing answers, which is the signature of **stale WSL2 port forwarders left
behind by a wedged backend** — the listeners survive, the services behind them do
not. Docker CLI, Docker daemon and the Supabase CLI all hang identically, so
neither `db reset` nor the migration verification can run.

Docker CLI resolved to `C:\Program Files\Docker\Docker\resources\bin\docker.exe`;
`com.docker.backend` runs as the same user (`NABIL\nabil`) as this session, so
this is not a permissions or PATH mismatch — the engine simply is not serving.

Still no migration written, nothing marked fixed.

---

## Batch 4 record (Step 20B, complete — DB batch landed and verified)

The engine came back, the stack was proved healthy, and the four audited DB
findings were implemented and verified against a database **rebuilt from zero**.
No RU-11 behaviour was touched; no clinical bound was invented.

### Stack state before the work

`docker version` → **server 28.3.2**. The `supabase_*_glucoai` containers **are**
this project's stack (`config.toml` sets `project_id = "glucoai"`), so there was
no separate "old" stack to stop — the containers were already running (7 min),
with `edge_runtime` **Exited (255)** and `vector` restarting, both casualties of
the earlier engine wedge. `docker start supabase_edge_runtime_glucoai` brought
the function runtime back; nothing was stopped, deleted or reconfigured, and no
volume, database or image was removed.

**The standing security debt was cleared BEFORE any change**: the suite ran
**105 pass / 0 skip** on the untouched tree, confirming Steps 15–18 had not
regressed anything.

### Migrations added (3)

| File | Finding | What it does |
|---|---|---|
| `0031_clinical_param_checks.sql` | **N-17** | `carb_ratio > 0` and `correction_factor > 0` (or null), `NOT VALID`. Mirrors Step 13's `clinicalNumber` exactly. **Deliberately no upper bound** — 0022's `<= 20` is a clinical judgement about a different quantity — and `target_low`/`target_high` left alone and still recorded |
| `0032_meal_scans_checks.sql` | **N-7** | the eight nutrition mirror columns `>= 0` (or null), `NOT VALID`. **Domain impossibility only**: implausible-but-positive stays storable, because Step 11a flags rather than rejects and a rejecting constraint would strand a row in the Step 14 offline queue forever |
| `0033_catalog_write_trust.sql` | **N-12 + N-13** | direct UPDATE restricted to `contributed_by = auth.uid()`; `upsert_product` becomes `SECURITY DEFINER`, fills gaps only for every source, and moves the trust label **downward only** |

`NOT VALID` is deliberate on both constraint migrations: they enforce every new
INSERT and UPDATE without scanning unaudited history, so they cannot fail a
deployment. Both were proven to `VALIDATE` cleanly on a fresh database inside a
rolled-back transaction, so the follow-up statement is safe to run once
production data is audited.

### Schema / RLS / RPC — before → after

| | Before | After |
|---|---|---|
| `profiles.carb_ratio`, `.correction_factor` | bare `numeric` — a negative or zero was storable | rejected at the column |
| `meal_scans` nutrition columns | bare `numeric` — negatives storable | negatives rejected; genuine `0` and implausible-positive still stored |
| `product_catalog_update` | `using (not verified)` — **any** patient could rewrite **any** unverified row | `using (not verified and contributed_by = auth.uid())` |
| `upsert_product` | `SECURITY INVOKER`; `p_source='user'` overwrote name + every macro | `SECURITY DEFINER`; fill-gaps-only for every caller |
| row `source` on conflict | never updated — a user overwrite kept an authoritative label | set to `'user'` only when a patient's call actually filled a gap; **never upgraded** |
| community contribution | worked via the caller's UPDATE privilege | works via the definer RPC — preserved on purpose, which is why N-12 and N-13 had to land together |

### Verification, all against a database reset from zero

| Check | Result |
|---|---|
| `supabase db reset --local` | **exit 0**, every migration applied in order |
| migration count | **33 applied = 33 files on disk** |
| privilege parity (`scripts/ci/verify-privileges.sql`) | **PASS** — RLS on every table, table/default/function grants match the hosted baseline. Its pinned count was updated 30 → 33 |
| constraint behaviour | 9 new fixtures (`clinicalParams.test.ts`): negatives and zeros rejected on both profile columns; negatives rejected on all eight meal columns; a genuine zero plate and an implausible-but-positive plate both still stored; no upper bound imposed |
| catalogue trust / ownership | 16 fixtures (`catalog.test.ts`): cross-user direct write blocked, own-row correction allowed, user override neutralised, gap-fill downgrades `source`, trust cannot be upgraded, cross-user contribution still works through the RPC, verified rows still frozen |
| **full security suite** | **121 pass / 0 skip in 7 files** (was 105/6) |
| Step 14 sync / idempotency | 40 fixtures green, **plus a real-database probe**: the same client-minted id re-pushed with `ON CONFLICT DO NOTHING` → **1 row**, and a genuine zero plate still insertable under the new constraint |
| unit/golden | **867 in 33 files**, unchanged |
| clinical | **156**, unchanged — every RU-11 characterization fixture untouched and passing |
| typecheck · lint ratchet | clean · green (6/6) |

### Changed files (7)

3 new migrations · `scripts/ci/verify-privileges.sql` (count 30 → 33) ·
`tests-security/rls/catalog.test.ts` (1 fixture moved, 7 added) ·
`tests-security/rls/clinicalParams.test.ts` (**new**, 9) · both ledgers.

**No application code changed.** No dependency, no config, no Edge Function, no
`bolusEngine`, no `computeIOB`, no nutrition scoring.

### Findings after Step 20B

**CLOSED:** N-7, N-17, N-12, N-13 — each implemented and verified as above.

**Still OPEN, unchanged:** N-14 (no in-app admin verification workflow, so a
`verified` row still cannot be created by an admin — the trust ceiling of the
whole catalogue story) · N-15 (a patient's label confirmation is not fed back as
corroboration) · N-18, P8-004 and P16-006 (all gated as dose-input or bolus
arithmetic) · N-8 (latent, no caller) · N-10's `portions_adjusted` half.

**P2-003 / blocker #2** remains open: Step 20B narrowed *who may overwrite what*
and *what a row may claim about itself*, but a patient can still write a
carbohydrate other patients read, there is still no plausibility bound at the
database level, and N-14 means no admin can mark a row verified in-app. The
KNOWN-BAD block asserting that is unchanged and still red.

**RU-11 remains blocked on Q1–Q14.** P7-002 and P7-011 are still release
blockers #5 and #6.

**The nutrition backlog is untouched and open in full**, including the
unidentified plate that still scores **100/100 "Excellent"** with a *"balanced
meal"* tip, NUTR-B1's remaining six nutrients, NUTR-A7, NUTR-B2, NUTR-B3's
threshold, micronutrient estimate validity, the hydration goal, the calorie
goal, macro percentages, GI/GL, NUTR-A4/A5/A6/A8/A9, NUTR-B4, NUTR-C2's
confirmation gate, NUTR-C3's plate-level parts, P9-001…P9-005 and P16-006.

**The project is NOT release-ready.**

---

## Batch 4 record (Step 21, complete — BOLUS-A1)

Route/privacy work only. No calculation of any kind changed: `bolusEngine`,
`computeIOB`, ratios, ISF, targets, thresholds, correction, activity, alcohol,
meal timing, rounding, the cap, the clinical fallbacks and every nutrition
function are untouched.

### Audit — every route parameter in the app

| Route | Params | Clinical / nutrition value? |
|---|---|---|
| **`/bolus`** | **`carbs`, `meal`** | **YES — carbohydrate grams (a dose input) and the meal slot that selects the ratio** |
| `/program-day`, `/day`, `/timeline`, `/program-workout` | `date`, `id` | no — a calendar date and a row id |
| `/healthy-food`, `/world-recipe`, `/insight-detail`, `/consent-detail` | `id`, `name`, `image`, `dishId` | no — catalogue content, not patient data |
| `/ai-chat`, `/ai-call` | `from` ('lab') | a navigation origin, no value |
| `/auth`, `/profile-edit`, `/program-setup`, `/program` | `mode`, `section`, `edit`, `create` | no |

`/bolus` was the only route carrying a clinical value, and BOLUS-A1 is now the
last one closed.

### Before → after

| | Before | After |
|---|---|---|
| navigation | `router.push({ pathname: '/bolus', params: { carbs, meal } })` ×2 | `setBolusHandoff({ carbs, meal }); router.push('/bolus')` |
| URL on web | `/bolus?carbs=45&meal=lunch` — in history, in `Referer`, in access logs | **`/bolus`** |
| consumer | `useLocalSearchParams<{ carbs?: string; meal?: string }>()` | `consumeBolusHandoff()` behind the Step 9 ref guard |
| a tampered/bookmarked `?carbs=` | seeded the field | **ignored entirely** |
| values, string shapes, seed rule, dose | — | **identical** |

### Hand-off lifecycle

`src/services/bolusHandoff.ts` mirrors `programDraft.ts`: a module-level value,
`set` (overwrites), `consume` (returns once, then `{}`), `clear`, `has`. It is
read on the bolus screen's first render through
`if (handoffRef.current === null) handoffRef.current = consumeBolusHandoff();` —
the same ref guard Step 9 uses, so a second render (or a double-invoked
initializer) gets what was already consumed rather than an empty draft.

**Not persisted, by design**: no AsyncStorage, no zustand `persist`, no
SecureStore — asserted by a fixture that strips comments first, and the module
has no runtime import at all. The accepted consequence, identical to Step 9's:
reloading `/bolus` on web no longer re-seeds, exactly as arriving with no
parameter never did.

### Changed files (6)

`src/services/bolusHandoff.ts` (**new**) · `src/app/program.tsx` (two senders +
import) · `src/app/bolus.tsx` (consumer + import; `useLocalSearchParams` removed)
· `tests/domain/bolusHandoff.golden.test.ts` (**new**, 11) ·
`.github/lint-baseline.json` (one known finding moved 332 → 333 by the import;
re-examined, unchanged, still **6** entries) · both ledgers.

### Verification

Unit/golden **878 in 34 files** (was 867/33). Clinical **156 unchanged** — every
RU-11 fixture untouched. Security **121 pass / 0 skip**. Step 14 sync/idempotency
green inside the unit run. Typecheck clean. Lint ratchet green (6/6).

Demo Mode, **zero external requests**: `/bolus?carbs=45&meal=lunch` leaves the
field **empty** with no seed label (URL injection dead); a bare `/bolus` with a
known meal still shows `62` and *"Pré-rempli depuis « Couscous » · 16:01"*
(Step 18 intact); calculating gives **62 g ÷ ratio 10 → 6.2 U** with the URL
staying `/bolus` throughout. State cleared, server stopped, no temporary code.

---

## Where every remaining nutrition finding is scheduled

Step 21 changed no nutrition behaviour. This table is the reconciliation asked
for at the start of Step 21 — nothing below is closed, and nothing may be
treated as trustworthy until it is remediated **and verified**.

| Finding | Scheduled |
|---|---|
| **Unidentified/unknown plate → 100/100, "Excellent", "balanced meal"** | **Step 22A — nutrition coherence** (below). The single most visible defect |
| Internal consistency: GluciAI grade vs 0–100 health score vs GI classification | **Step 22A** |
| Calorie total vs displayed macros; macro percentages (**NUTR-A4**) | **Step 22A** |
| GI/GL correctness and provenance (**NUTR-A5**) | **Step 22A** |
| Confidence/completeness gating of the whole result | **Step 22A** |
| Unknown-vs-zero for the remaining six nutrients (**NUTR-B1**) | ✅ **DONE — Step 22B** |
| `fieldsFound` / completeness never surfaced (**NUTR-A7**) | ✅ **DONE — Step 22B** |
| Low-confidence food contribution (**NUTR-B3** threshold half) | **still open — RU-3.** Step 22B carried the LABEL to the totals and the PDF; the arithmetic is pinned unchanged |
| NaN / invalid portion handling (**NUTR-B2**) | ✅ **DONE — Step 22B** |
| Micronutrient / vitamin / mineral estimate validity | **Step 22C — estimate validity** (needs RU-3) |
| Hydration / water-goal logic (**NUTR-A3 remainder**) | **Step 22C** (needs RU-3) |
| Calorie-goal logic (**NUTR-A6**) | **Step 22C** (needs RU-3) |
| Rounding family (**NUTR-B4**, **P8-004**) | **Step 22D** — dose-input gated, needs authorization |
| **NUTR-A9** (day totals print a floor as a total) ✅ **DONE — Step 22B**; **NUTR-A8** (sugarHeavy spans two meals) **still open** — the fix lives in `computeBolus`, which Step 22B may not touch | RU-6 |
| **NUTR-C2** confirmation gate | **blocked** — dose-input decision, with RU-11 |
| **NUTR-C3** plate-level bounds remainder | **Step 22A** |
| **P9-001…P9-005** doctor-report defects | **Step 23 — reporting** |
| **P16-006** decimal/Arabic-Indic parsing | **blocked** — dose-input decision, with RU-11 |

### Regression scenario to preserve — "the 480 kcal screenshot"

Captured from the live UI during Step 21 and to be used as a fixture when
Step 22A begins. On one screen, simultaneously:

`GluciAI index **A**` · `Score santé **95/100 "Excellent"**` · `480 kcal` ·
`P 50 g (42 %)` · `C 50 g (42 %)` · `F 9 g (16 %)` · `IG **70 "Élevé"**`.

Traced independently during this step, **without changing anything**:

- **Calories vs macros are consistent.** 50×4 + 50×4 + 9×9 = **481 kcal** against
  480 displayed, and the percentages (42/42/16) follow from that total. NUTR-A4
  is about the double-rounding and the two totals, not an error of this size.
- **95/100 follows the implemented rule exactly.** `scoreMeal` starts at 100,
  applies **−10** for a GI in the "moderate" band and **+5** for protein ≥ 20 g →
  95. Grade **A** follows from ≥ 80.
- **So the contradiction is not arithmetic.** It is a **threshold and vocabulary
  mismatch between two independent rules on the same screen**: the GI chip calls
  70 *"Élevé"*, while the score's harsh penalty is gated on `gi > 70` and 70
  therefore takes the *moderate* −10. One number, two classifications, no
  reconciliation — and neither is labelled as an estimate of the other's
  confidence.
- **Nothing here is proven wrong yet.** Each contract was authored separately and
  each is internally consistent; what is missing is any rule that makes them
  agree, and any gate that stops a positive headline when the underlying data is
  unknown, incomplete or low-confidence.

Step 22A must therefore decide, with RU-3: whether the grade and the score are
one claim or two, where the GI boundary sits for each, and what confidence floor
a result must clear before any word like *"Excellent"* or *"balanced"* may
appear. Until then the result screen is **not** to be described as coherent.

---

## Batch 4 record (Step 22A, complete — nutrition coherence & confidence)

Presentation and evidence only. **No nutrition arithmetic moved**: `scoreMeal`,
`mealGrade`, `glycemicLoad`, `aggregateItems`, `estimateMicros`,
`estimateMealWaterMl`, `dailyCalorieGoal`, the macro percentages and the portion
scaling are byte-for-byte unchanged, and no stored `meal_score` was rewritten —
no migration, no edit of a patient's history. Nothing in the dose path was
touched: `bolusEngine`, `computeIOB`, ratios, ISF, targets, correction, activity,
alcohol, meal timing, rounding, cap and fallbacks are untouched, and the 156
clinical fixtures are unchanged.

### 1. What the audit found — three different defects, not one

| Kind | Finding |
|---|---|
| **Computational** | **none.** The 480 kcal screenshot is arithmetically sound: 50×4 + 50×4 + 9×9 = **481 kcal** against 480 shown, and 42/42/16 follows from that. `scoreMeal` returns exactly 95 for it (100 − 10 GI-moderate + 5 protein ≥ 20 g), and `mealGrade(95) = A`. Neither number is a miscalculation |
| **Provenance / completeness** | The verdict was computed from **placeholder zeros**. `scoreMeal` starts at 100 and subtracts, so a plate nothing was identified in takes **no** penalty: **100/100 · "Excellent" · grade A · "balanced meal"**, beside its own 0 kcal. The evidence to prevent it already existed (`calories`, `carbs_known`) and Step 18 already used it for the badges — nothing applied it to the score, the letter, the tip, the PDF or the day badge |
| **Presentation / semantic** | Four independent classifications of the same number, none reconciled on screen: the GI chip calls 70 **high**, `scoreMeal` calls it **moderate** (its harsh band opens at `> 70`), the engine warns *"high GI"* from **66**, and the menu screen reddened its own chip from **66**. Separately, the A–E letter (≥ 80) and the word (≥ 85) disagree over 80–84 — an "A" the screen calls *"Bon"* — with nothing saying they are one number in two granularities |

### 2. The rule Step 22A enforces

`qualityEvidence(plate)` in `nutrition/advice.ts` — **the same two signals Step
18 adopted for P8-005**, not a new threshold:

| Evidence | Meaning |
|---|---|
| `no_data` | `calories <= 0` — nothing resolved. Every "good" threshold is satisfied by absence |
| `carbs_unknown` | `carbs_known === false` — the carbohydrate is a FLOOR (Step 10) |
| `supported` | anything else, including a legacy row with no flag (judged on energy alone, exactly as the badge filter does) |

`qualityClaimSupported` gates the **verdict** — score, word, A–E letter, and the
tip derived from them — everywhere it is shown. **No confidence percentage was
invented**, no clinical cut-off was chosen, and an unsupported plate gets an
explicit *"not rated"* state rather than a manufactured low score.
`displayableHighlights` now calls the same predicate, so one rule decides what
the screen may claim.

Accepted trade-off, identical to Step 18's: an item that genuinely holds zero
energy (a diet drink typed from its label) reads as unsupported rather than
"100/100 Excellent". Withholding a claim is the safe direction, and every number
is still displayed in full.

### 3. Before → after

**The unidentified plate** (the severe regression):

| | Before | After |
|---|---|---|
| health score | **100/100** | **—**, *"Non évalué"* |
| word | **"Excellent"** | *"Qualité non évaluable"* + why |
| GluciAI letter | **A** | **no letter awarded**, strip dimmed |
| tip / advice | *"Repas équilibré pour votre glycémie"* | *"Aucun aliment n'a pu être identifié… Ajoutez ou corrigez les aliments détectés"* |
| meal PDF | `95/100 · Excellent · A` | `—` + the reason |
| day badge | the 100 raised the day's mean | excluded; a day of only unrated meals has **no** score |
| the numbers themselves | 0 kcal, carbs `—` | **identical** — Step 10's unknown-vs-zero intact |

**The 480 kcal screenshot** (a supported plate): score **95**, word
**"Excellent"**, letter **A**, calories, macros, percentages, GI **70 "Élevé"**
and GL — **all unchanged**. What changed is that the screen now says the letter
IS the score's letter, and that the index and the score are not the same
question. Nothing about that plate was "fixed" because nothing about it was
wrong: it was two contracts talking past each other.

### 4. The contracts after Step 22A

- **Score / grade / label** — one number, three views. `mealGrade(score)` is the
  letter form (≥ 80/65/50/35), the word is its band (≥ 85/70/50), and the note
  under the strip now says so in all four locales. **OPEN (RU-3):** the 80–84
  overlap where "A" meets *"Bon"*, and the barcode screen's third band set
  (70/50) — moving either is a nutrition-policy call, so both are pinned as
  known-bad instead.
- **GI / GL** — `giBand()` is now the app's single glycemic-index classification
  (low ≤ 55 · medium 56–69 · high ≥ 70, the standard the shared meter already
  used). `glycemicTone` and the menu chip read it; no displayed band moved except
  the menu chip's 66–69, which now agrees with every other screen. GL keeps its
  own standard buckets (< 10 · 10–20 · > 20). **OPEN (RU-3):** `scoreMeal`'s
  `gi > 70` penalty gate and the engine's `warn:high_gi` at 66 — the first would
  change a patient-facing number, the second would remove a safety warning.
- **Recommendation** — praise needs data: the badges (Step 18) and now the
  verdict, the tip, the advice card and the menu's "best choice" badge all ride
  on one predicate.

### 5. Changed files (13)

`src/services/nutrition/advice.ts` (+`giBand`, `qualityEvidence`,
`qualityClaimSupported`; `displayableHighlights` refactored onto the same rule) ·
`src/components/ui/GlycemicBar.tsx` (delegates) ·
`src/components/MealGradeBar.tsx` (`grade: MealGrade | null`) ·
`src/app/scan-result.tsx` (screen + PDF) · `src/components/LastMealCard.tsx` ·
`src/app/barcode.tsx` · `src/app/menu-scan.tsx` (gate + ranking + chip) ·
`src/components/journal/dayScore.ts` · `src/i18n/locales/{fr,en,de,ar}.json`
(7 new keys each; `mealGradeNote` extended) ·
`tests/domain/nutritionClaims.golden.test.ts` (**new**, 33) · both ledgers.
No dependency, no config, no migration, no Edge Function.

### 6. Verification

Unit/golden **911 in 35 files** (was 878/34) · clinical **156 unchanged** ·
security **121 / 0 skip** · Step 14 sync/idempotency green inside the unit run ·
typecheck clean · lint ratchet **6/6** · no temporary code.

Demo Mode, **zero external requests** (every resource `localhost:8094`, console
clean): an identified plate still reads **90/100 · "Excellent" · A** with its GI
card; the same plate with its food replaced by an unidentifiable one reads
**"—" · "Non évalué"**, *"Aucune lettre attribuée"*, the reason, and carbs `—`.
Checked in **fr / en / de / ar**, in **RTL** (the strip mirrors and no letter is
raised) and at **375 px** — no clipping in any of them.

### 7. Still NOT trustworthy — what Step 22A did not do

Step 22A makes the result **coherent about what it knows**. It does not make the
numbers measured. Unchanged and still open: the vitamins/minerals are inferred
from category densities (**NUTR-A2**, labelled since Step 17), the hydration
figure likewise (**NUTR-A3**), the six non-carbohydrate nutrients still turn an
absent value into `0` (**NUTR-B1**), `fieldsFound` is still never shown
(**NUTR-A7**), a 0.1-confidence food still contributes in full (**NUTR-B3**), and
the burn-minute rows are fixed kcal-per-minute divisors that ignore the patient's
weight (**NUTR-A10**, new — recorded below). **The nutrition result must not be
described as trustworthy or complete.**

| Remaining | Where |
|---|---|
| NUTR-B1 (six nutrients) ✅, NUTR-A7 ✅, NUTR-B2 ✅, NUTR-A9 ✅ — **closed by Step 22B**. NUTR-B3 threshold and NUTR-A8 remain open (RU-3 / RU-6) | **Step 22B — provenance completion** |
| Micronutrient validity, hydration, calorie goal (NUTR-A6), macro % (NUTR-A4), GI/GL provenance (NUTR-A5), **NUTR-A10 burn minutes** | ✅ **AUDITED — Step 22C.** Every one is now classified (reference / calculated / estimated / heuristic / policy) and pinned; the three that made unqualified claims now carry them. **No formula, weight or threshold changed** — each correction is an RU-3 decision |
| Rounding family (NUTR-B4, P8-004) | **Step 22D** — dose-input gated |
| P9-001…P9-005 | **Step 23 — reporting** |
| NUTR-C2, P16-006 | **blocked** — dose-input decisions, with RU-11 |
| Score/label 80–84 overlap · barcode's 70/50 bands · `scoreMeal`'s GI gate · `warn:high_gi` at 66 | **RU-3 decisions**, pinned as known-bad |

### 8. New finding recorded during this step

| ID | Finding | Severity | Status | RU |
|---|---|---|---|---|
| **NUTR-A10** | *"Marche 48 min · Course 20 min"* on the analysis screen and in the meal PDF are `kcal / 5`, `/ 12`, `/ 8.5`, `/ 9.5` — fixed divisors that ignore the patient's **weight**, intensity and fitness, presented as minutes with no estimate qualifier. Same class as NUTR-A2/A3, which Step 17 labelled | 🟡 Medium | **open — audited, unchanged** (`scan-result.tsx:189`) | RU-3 → **Step 22C** |

---

## Batch 4 record (Step 22B, complete — nutrition data completeness & provenance)

Provenance and presentation only. **No nutrition arithmetic moved for a valid
plate**: `scoreMeal`, `mealGrade`, `glycemicLoad`, `aggregateItems`,
`estimateMicros`, `estimateMealWaterMl`, `dailyCalorieGoal`, the macro
percentages, the GI/GL formulas and the portion scaling are unchanged, and no
stored row was rewritten — no migration, no edit of a patient's history. Nothing
in the dose path was touched: `bolusEngine`, `computeIOB`, ratios, ISF, targets,
correction policy, activity, alcohol, meal timing, dose rounding, cap and
fallbacks are untouched, and the **156 clinical fixtures are unchanged**.

### 1. What the audit found — three kinds again

| Kind | Finding |
|---|---|
| **Computational** | **one, and only for input that is not a quantity.** A `NaN` portion produced NaN calories, NaN macros, NaN micronutrients and NaN hydration — and because every comparison in `scoreMeal` is false against NaN, that plate scored **100/100**. `Infinity` and a negative portion did the same in their own directions, and the negative weight stayed on the item to be re-multiplied by the next edit. Valid portions were, and remain, exact |
| **Provenance / completeness** | **the six other nutrients.** Step 10 taught the CARBOHYDRATE to say whether its number was real; sugar, protein, fat, fibre, sodium and calories still turned an absent value into `0`, indistinguishable from the `0` bottled water genuinely declares — on the screen, in the PDF, and in the `meal_scans` mirror columns the doctor's dashboard reads. `fieldsFound` counted exactly this and was consumed by nothing (**NUTR-A7**) |
| **Presentation** | **the floor stopped travelling.** `carbDisplay` lived on the analysis screen alone, so one plate read `≥ 62 g` there and `62 g` in the day total, the meal-moment rows, the meal sheet, the home ring, the home timeline and the home recap card (**NUTR-A9**) |

### 2. The rules Step 22B enforces

`nutrition/nutrientProvenance.ts` — three contracts, no new threshold:

| Contract | Rule |
|---|---|
| **unknown vs zero** | `knownFrom(values)` builds a per-nutrient `known` map at the reader; `nutrientStatus` reads it (`known` / `unknown` / `indeterminate` — the same three-valued vocabulary Step 10 gave the carbohydrate, which still answers through `carbStatus`); `plateNutrientsKnown` is as strict as `plateCarbStatus`: a total is a total only when EVERY food declared it |
| **usable portion** | `isUsablePortion(g)` — finite and `> 0`. Not a plausibility rule: no upper bound is invented and nothing is coerced into a plausible weight. An unusable portion yields placeholder zeros, `portion_valid: false` and every nutrient unknown |
| **completeness** | `nutritionCompleteness(items)` → `declared` · `partial` · `estimated` · `unavailable`, plus the nutrients whose total is a floor, the unidentified count, the invalid portions and the weakly identified grams |

**Values never move.** An unknown nutrient keeps its placeholder `0`, so every
total, ratio, score and estimate reads the same number it always did; only the
claim about that number changed.

### 3. Before → after

**Unknown vs zero**

| | Before | After |
|---|---|---|
| provider declares `proteins_100g: 0` | `protein: 0` | `protein: 0`, `known.protein === true` |
| provider omits `proteins_100g` | `protein: 0` — identical | `protein: 0`, `known.protein === false` |
| a plate with one such food | `protein: 20` presented as a total | `protein: 20`, `nutrients_known.protein === false` — a floor, and it says so |
| `meal_scans.protein` (online) | `20` | `NULL` — the column the dashboard reads no longer carries a floor |
| `meal_scans.protein` (offline queue) | `20` | `NULL` — same helper, both writers |
| a legacy row with no map | unchanged | unchanged — **never** upgraded to "known 0" |

**An unusable portion**

| | Before | After |
|---|---|---|
| `NaN` grams | NaN kcal/macros/vitamins/hydration; plate read SUPPORTED; **score 100/100** | placeholder zeros, `portion_valid: false`, every nutrient unknown, `qualityEvidence → no_data`, **no verdict** |
| `Infinity` grams | infinite nutrition | the same explicit unknown |
| `−100` grams | `carbohydrates: −20`, and `−100` kept as the item's weight | the same explicit unknown, `portion_grams: 0` |
| a valid portion | exact | **byte-for-byte identical** |

**Completeness on screen** (one quiet line under the macros, and in the PDF)

| State | What the patient reads |
|---|---|
| `declared` | *"Values declared by the nutrition databases for every food, calculated from the portion."* |
| `partial` | *"Incomplete data: {nutrients} — those totals are minimums."* (or *"every total shown is a minimum"* when all seven are floors, which is the common case) |
| `estimated` | *"Values estimated by the AI from the photo — no nutrition database recognised these foods."* |
| `unavailable` | *"No usable nutrition data for this plate."* |
| any of them | + *"unidentified foods: N"* · *"unusable portions: N"* · *"N g identified without certainty"* when they apply |

Deliberately not a percentage, and provider values are called **declared**,
never *measured*.

**NUTR-A9** — the day total now reads `≥ 125 g` with *"Part of the carbohydrate
is unknown: this total is a minimum"*; a meal-moment row with nothing usable
reads *"carbs unknown"* instead of `0 g`; the meal sheet, the home carb ring,
the home timeline row and the home recap card all use the same rule.

### 4. Contracts after Step 22B

- **A nutrient value** is one of: declared by a provider (including a declared
  0), calculated from declared values and a valid portion, estimated by the
  model (`source: 'ai_estimate'`, and the plate says so), unknown (placeholder 0
  + `known === false`), or unusable (invalid portion → the same unknown state).
  `indeterminate` means only "written before this map existed".
- **A plate total** is a total only when every food behind it declared the
  nutrient; otherwise it is a floor, and every surface that prints it says so.
- **A mirror column** is a number or NULL — never a placeholder. One helper,
  both writers.
- **Confidence** labels, it does not weight. A weakly identified food still
  contributes in full (**RU-3**).

### 5. Changed files (17 + 2 ledgers)

`src/services/nutrition/nutrientProvenance.ts` (**new**) ·
`carbProvenance.ts` (+`carbText`, `carbUnit`) · `nutrition/engine.ts`
(`scale`, `rescaleItem`, `aggregateItems`) · `nutrition/micros.ts` ·
`nutrition/advice.ts` (non-finite energy + the audited 0 kcal note) ·
`nutrition/types.ts` · the six providers + `nutriments.ts` ·
`src/types/index.ts` · `src/services/data.ts` · `src/services/sync.ts` ·
`src/app/scan-result.tsx` (screen + PDF) · `src/app/nutrition.tsx` ·
`src/app/(tabs)/index.tsx` · `src/components/MealPeekModal.tsx` ·
`src/components/LastMealCard.tsx` · `src/i18n/locales/{fr,en,de,ar}.json`
(12 new keys each) · `tests/domain/nutrientCompleteness.golden.test.ts`
(**new**, 30) + 3 fixtures in `syncMealPush` + 1 in `nutritionScaling` ·
both ledgers. **No dependency, no config, no migration, no Edge Function.**

**Why no migration:** the `meal_scans` mirror columns are all nullable
(`0001_init.sql:32-39`) and Step 20B's `meal_scans_nonnegative` is NULL-tolerant
by construction, so writing NULL for an unknown nutrient needs no schema change.
The full picture (values + provenance) travels in the existing `result` JSONB.
Legacy rows are untouched and are never re-read as "known 0".

### 6. Verification

Unit/golden **945 in 36 files** (933 at the start of this step; 911/35 before
Step 22B began) · clinical **156 unchanged** · security **121 / 0 skip** ·
Step 14 sync/idempotency green inside the unit run, and extended — the offline
meal push now has its own Step 22B fixtures · typecheck clean · lint ratchet
**6/6** after a deliberate `--update`: the one known `index.tsx` unused-var
warning moved from line 92 to 99 because 7 import lines were added above it —
same finding, same counts, nothing new · no temporary code.

Demo Mode, **zero external requests** (every recorded request `localhost:8094`;
console clean in a fresh tab across the whole flow). Four plates, one per state:
a fully declared plate reads **480 kcal · 50/50/9 · GI 70 · 95/100 · Excellent ·
A** with *"Values declared by the nutrition databases…"* — the Step 22A
regression case, unmoved; a partial plate reads **≥ 30 g** carbs, **— · Not
rated**, and *"Incomplete data: every total shown is a minimum · unidentified
foods: 1 · 250 g identified without certainty"*; an AI-estimated plate names
itself as such; a wholly unidentified plate reads *"No usable nutrition data"*.
Checked in **fr / en / de / ar**, in **RTL** and at **375 px** — no clipping and
no horizontal overflow (`scrollWidth === clientWidth === 375`).

One layout defect was found and fixed during that run: `≥ 125` wrapped between
the symbol and its number in the day-total card at 375 px, and split across two
lines in Arabic. `carbText` now uses a non-breaking space, and the day card
renders the `≥` as its own smaller glyph so the 50 px figure is never truncated.

### 7. Still NOT trustworthy — what Step 22B did not do

Step 22B makes the result **honest about where each number came from**. It does
not make the numbers correct. **The nutrition result must not be described as
accurate, scientifically validated or complete.**

| Remaining | Where |
|---|---|
| Micronutrient validity (**NUTR-A2**), hydration (**NUTR-A3**), calorie goal (**NUTR-A6**), macro % (**NUTR-A4**), GI/GL interpretation (**NUTR-A5**), burn minutes (**NUTR-A10**), and the **Health Score / GluciAI weighting itself** — including the pinned 480 kcal · GI 70 · 95/100 · A case, whose *arithmetic* is proven and whose *nutritional justification* is not | **Step 22C — estimate & policy validity** (needs RU-3) |
| Rounding family (**NUTR-B4**, **P8-004** legacy rescale drift) | **Step 22D** — dose-input gated |
| **P9-001…P9-005** reporting | **Step 23** |
| **NUTR-C2** confirmation gate, **P16-006** | **blocked** — dose-input decisions, with RU-11 |
| **NUTR-B3** threshold half · **NUTR-A8** · the declared-0-kcal verdict · the 80–84 letter/word overlap · barcode 70/50 bands · `scoreMeal`'s `gi > 70` gate · `warn:high_gi` at 66 | **RU-3 / RU-6 decisions**, pinned as known-bad |

### 8. RU-3 decisions Step 22B added to the queue

1. **Should a weakly identified food contribute in full?** (NUTR-B3) The
   arithmetic is unchanged and pinned; any cut-off would be invented here.
2. **Should a plate with a DECLARED 0 kcal be scored?** Step 22B can now tell a
   declared 0 from an absent one; letting it through would score a glass of
   water "100/100 · Excellent", so the gate was deliberately left as it was.
3. **NUTR-A8** — must the carbohydrate the sugar ratio uses have come from the
   meal being judged? (Also blocked: the fix lives inside `computeBolus`.)

---

## Batch 4 record (Step 22C, complete — scientific audit of every nutrition value)

**Read-only first, and almost read-only throughout.** Step 22C changed **no
formula, no weight, no threshold and no constant**. The only production change
is wording: three captions that name what a number rests on, on the analysis
screen and in the meal PDF. Every nutrition figure the patient sees is
byte-for-byte what it was before this step. Nothing in the dose path, the
database, the Edge Functions, sync or security was touched — the 156 clinical
fixtures are unchanged and the 22C diff contains no file under `supabase/`.

### 1. The verdict vocabulary

Each displayed value was traced from its source to the screen and assigned one
of five verdicts, pinned in `tests/domain/nutritionScience.golden.test.ts` (37):

| Verdict | Meaning |
|---|---|
| **REFERENCE** | a published value taken from an external source |
| **CALCULATED** | arithmetic over values the app actually holds |
| **ESTIMATED** | inferred from a proxy (category average, water fraction) |
| **HEURISTIC** | an app-specific rule with no external authority |
| **POLICY** | encodes a nutrition/clinical judgement → RU-3, not engineering |

### 2. Where every number comes from

| Value | Verdict | Basis, and what is assumed |
|---|---|---|
| calories, protein, carbs, fat, fibre, sugar, sodium | **REFERENCE → CALCULATED** | declared per 100 g by USDA / OFF / the Moroccan DB / the product catalogue, scaled by the portion. Provenance per nutrient since Step 22B |
| macro percentages | **CALCULATED** | shares of the **Atwater sum** (4/4/9), *not* of the calorie figure displayed above them. Fat is `100 − P% − C%`, so it absorbs all rounding drift |
| GI, per food | **REFERENCE or ESTIMATED** | a database value when one exists, else a category average from the international tables (Foster-Powell), flagged `glycemic_index_estimated` |
| GI, per plate | **CALCULATED** | carbohydrate-weighted mean over the foods that HAVE an index; `gi_carb_coverage` says over how much of the plate |
| GI bands (≤55 / 56–69 / ≥70) | **REFERENCE** | the international classification |
| GL value + buckets (<10 / 10–20 / >20) | **REFERENCE formula, ASSUMED input** | `GI × carbs / 100` with the standard buckets — but multiplied by the plate's **whole** carbohydrate, including the part the index never covered, and falling back to an invented **GI 55** when none is known (**NUTR-A5**) |
| Health Score /100 | **HEURISTIC** | starts at 100, subtracts 6 penalties, adds 2 bonuses. See §3 |
| GluciAI Index A–E | **HEURISTIC** | `mealGrade(score)` at 80/65/50/35 — a re-cut of the same number |
| vitamins & minerals | **ESTIMATED** | category density per 100 g × grams, ÷ an FDA Daily Value. See §5 |
| hydration (meal ml) | **ESTIMATED** | category water fraction × grams, 1 g ≈ 1 ml |
| hydration (daily goal) | **REFERENCE-ish** | ~35 ml/kg clamped 1.5–4 L; a flat 2 L when weight is unknown |
| calorie goal | **REFERENCE + 3 ASSUMPTIONS** | Mifflin-St Jeor (validated), × an assumed **1.45** activity factor, age **30** assumed when no birth date, and a flat **2000 kcal** when weight or height is missing (**NUTR-A6**) |
| remaining macros | **HEURISTIC** | a fixed 25 / 50 / 25 % split of the goal |
| burn minutes | **HEURISTIC** | `kcal ÷ {5, 12, 8.5, 9.5}` — four constants for one hypothetical 70 kg adult. No weight, sex, age or MET (**NUTR-A10**) |
| day badge | **HEURISTIC** | `0.6 × time-in-range + 0.4 × mean meal score`, labelled with the *meal* vocabulary |
| recommendations / advice | **HEURISTIC** | the score's own reasons, plus weekly sugar/fibre rules of thumb |

### 3. The Health Score, rule by rule (Phase 2)

Six penalties, two bonuses, one clamp — the complete set:

| Rule | Threshold | Effect | Authority |
|---|---|---|---|
| GI high | `> 70` | −22 | band REFERENCE, weight HEURISTIC |
| GI moderate | `> 55` | −10 | band REFERENCE, weight HEURISTIC |
| GI low | `≤ 40` | words only, **0 pts** | HEURISTIC |
| sugar high / notable | `> 30` / `> 15` g | −22 / −10 | HEURISTIC, loosely anchored to WHO free-sugar guidance |
| carbohydrate | `> 80` / `> 60` g | −15 / −8 | HEURISTIC — **not** patient-specific (ignores the patient's own ratio or plan) |
| fibre | `≥ 6` g / `< 2` g with carbs > 30 | +5 / −6 | HEURISTIC |
| protein | `≥ 20` g | +5 | HEURISTIC |
| sodium | `> 1000` mg | −8 | HEURISTIC, anchored (1 g ≈ half a WHO day) |
| energy | `> 800` kcal | −8 | HEURISTIC, identical for every patient |
| clamp | `0…100` | — | saturates in both directions |

**Three unsupported assumptions, now pinned:**

1. **Fat is never scored.** The plate's fat can be 0 g or 200 g and the score
   does not move. Defensible for a *glycemic* indicator; indefensible for
   something labelled a **health** score with the word "Excellent".
2. **"Perfect until proven otherwise."** Starting at 100 and subtracting means a
   plate earns top marks by tripping no rule — an A is the *absence of
   penalties*, not demonstrated quality. (Step 22A closed the worst case of
   this: a plate with no data can no longer be scored at all.)
3. **Per plate, not per 100 g.** Twice the food is a different letter, so two
   meals of different size are not comparable. Deliberate (it rates a serving
   decision) but nothing on screen says it.

### 4. The GluciAI Index (Phase 3)

`mealGrade(score)` cuts the same 0–100 number at 80/65/50/35. The letter carries
**no information the score does not already carry**, and its boundaries were
chosen by the app.

- Is **95 → A** mathematically expected? **Yes**, and proven: `100 − 10` (GI 70
  falls in the score's `> 55` band) `+ 5` (protein ≥ 20 g) `= 95`, and `95 ≥ 80`.
- Is it **nutritionally justified**? **Not established.** Neither the −10 nor
  the +5 is derived from any evidence in this project, the plate's 9 g of fat
  was never examined, and no external standard defines what an "A" means here.

### 5. Vitamins, minerals, hydration (Phases 6–7)

The micronutrient model is a 17-category × 5-nutrient density table. Its
structural limit: **it cannot distinguish two foods in the same group** —
spinach and iceberg lettuce, cod and sardine, white and brown rice are identical
to it. The per-food error is therefore unbounded; only the group average is
meaningful. The card has said *"estimated from category and weight — no measured
values"* since Step 17, which is accurate.

**New finding — NUTR-A12.** The table is labelled *"FDA Daily Values"*, and
three of the five match the current values (vitamin A 900 µg RAE, vitamin C
90 mg, iron 18 mg). **Calcium (1000 mg) and potassium (3500 mg) are the values
the 2016 labelling rule replaced** with 1300 mg and 4700 mg. Both therefore
**overstate** coverage — calcium by ~30 %, potassium by ~34 %. Correcting them
moves a displayed percentage, so it is RU-3's call; recorded, not changed.

Hydration: the ~35 ml/kg constant sits inside the commonly cited 30–40 ml/kg
adult range. Two assumptions remain unstated: food water counts **in full**
toward a goal the ring calls *"your water needs"*, and an unknown weight
silently becomes a 2 L population default.

### 6. What changed on screen (the only production change)

| Card | Line added |
|---|---|
| **To burn** | *"Rough guide for an adult of about 70 kg at moderate intensity — it does not take your weight, age or fitness into account."* (NUTR-A10) |
| **Goal comparison** | *"Goal estimated from your profile (weight, height, age, sex) and an assumed light activity level"* — or, when the profile cannot answer, *"Incomplete profile: a default 2 000 kcal goal, not a requirement calculated for you."* (NUTR-A6) |
| **Glycemic index** | *"The load multiplies this index by the plate's whole carbohydrate, while the index covers only {{pct}} % of it."* — shown only when coverage < 100 % (NUTR-A5) |

All three also print in the **meal PDF**, since that is the document a doctor
reads. **No number moved.**

### 7. Contradictions between surfaces (Phase 10)

| Contradiction | Status |
|---|---|
| GI 70 is "high" on the chip, "moderate" to the score, and warned from 66 by the engine | **known-bad, RU-3** (three answers to one question) |
| the letter (≥ 80) and the word (≥ 85) disagree over 80–84 | **known-bad, RU-3** |
| the barcode screen keeps a third band set (70 / 50) | **known-bad, RU-3** |
| the day badge blends TIR and meal quality, then uses the *meal* words | **known-bad, RU-3** |
| **NUTR-A11 (new)** — the **doctor report** prints a carbohydrate FLOOR as a total | **open → Step 23.** Step 22B taught every patient screen to write "≥ 62 g"; `reportStats.ts` sums `result.carbohydrates` with no provenance check and `reportHtml.ts` prints it as a figure. The most consequential remaining inconsistency, and the reason the doctor report cannot yet be trusted as a record |
| the AI is never handed `meal_score` | **verified clean** — it cannot repeat a verdict it never receives |

### 8. Files changed (6)

`src/app/scan-result.tsx` (three captions + the audit written into the three
functions it concerns) · `src/i18n/locales/{fr,en,de,ar}.json` (4 keys each) ·
`tests/domain/nutritionScience.golden.test.ts` (**new**, 37) · both ledgers.
No dependency, no config, no migration, no Edge Function, nothing under
`supabase/`.

### 9. Verification

Unit/golden **982 in 37 files** (was 945/36) · clinical **156 unchanged** ·
typecheck clean · lint ratchet **6/6** · no temporary code.

**Security suite: NOT re-run in this segment** — the local Supabase stack was
down (Docker Desktop not running, `ECONNREFUSED 127.0.0.1:54321`). It last ran
green at **121 / 0 skip** earlier the same day against this tree plus Step 22B,
and Step 22C touched exactly six files, none of them under `supabase/`, none in
sync, auth or the data layer. **This is a gap, not a pass.**

Demo Mode, **zero external requests** (0 of 14 resource loads left
`localhost:8094`; console clean). The three captions verified on screen in
**fr / en / de / ar**, in **RTL** (`dir=rtl`), at **375 px** with
`scrollWidth === clientWidth === 375`, and inside the generated **PDF** (captured
from the print frame: all three lines present, alongside Step 22B's provenance
sentence). Both branches of the goal caption were exercised — with a complete
profile and with none.

### 10. Can the project be called scientifically reliable?

**No, and this audit is the reason to say so precisely rather than vaguely.**

- The **macros are reference data**, correctly scaled, and now honest about
  provenance (Steps 10, 22B). That part is trustworthy.
- The **GI and GL formulas and bands are the published ones**, correctly
  implemented — with one assumed input (GI 55) and one extrapolation (the load
  spans carbohydrate the index never covered), both now stated on screen.
- The **Health Score and the GluciAI Index are app heuristics.** They are
  internally consistent and arithmetically correct; **no rule in them is derived
  from evidence in this project**, fat is not scored at all, and no external
  standard defines their thresholds.
- The **micronutrient, hydration, calorie-goal and burn-minute figures are
  estimates from proxies**, two of them resting on superseded reference values.
- The **doctor report still prints a floor as a total** (NUTR-A11).

Computational correctness is established. **Scientific validity is not**, and it
cannot be established by an audit of the code alone — it requires a nutrition
professional to accept or replace the weightings, which is exactly what RU-3 is
for.

### 11. RU-3 decisions after Step 22C

Carried forward: NUTR-B3's confidence threshold · the declared-0-kcal verdict ·
the 80–84 letter/word overlap · the barcode 70/50 bands · `scoreMeal`'s `gi > 70`
gate · `warn:high_gi` at 66 · NUTR-A8.

**Added by this step:**

1. **The Health Score's ten constants** — are −22/−10/−15/−8/−6/+5 and their
   thresholds acceptable, or should they be replaced with a referenced model?
2. **Should fat be scored at all?**
3. **Should the score be per 100 g rather than per plate**, so two meals are
   comparable?
4. **NUTR-A12** — update calcium to 1300 mg and potassium to 4700 mg? (Changes
   displayed percentages downward.)
5. **NUTR-A10** — replace the four burn divisors with a MET × weight model?
6. **NUTR-A6** — should the activity factor be asked for rather than assumed?
7. **NUTR-A5** — should a GL be shown at all when no index is known?
8. Should the screen say, in words, that the **/100 score is the app's own
   heuristic**? (The letter says it since Step 16; the number does not.)

---

## RU-3 record — the nutrition decision package (complete, nothing implemented)

**No formula, threshold, weight or constant changed.** The deliverable is
[docs/RU3-NUTRITION-DECISIONS.md](RU3-NUTRITION-DECISIONS.md) plus 9 evidence
fixtures. `src/services/nutrition/mealScore.ts` was not modified.

| | |
|---|---|
| **Scope** | every rule in `scoreMeal`, the A–E bands, and the Step 22C findings that move a displayed number |
| **Output** | 20 numbered decisions (**D1–D20**), each with options, advantages and disadvantages, and a sign-off checklist |
| **Evidence** | each rule classified: published guidance / application logic only / unsupported |
| **Headline finding** | the model **never examines fat**, so a plate of 300 kcal, 33 g fat, 2 g protein and no carbohydrate scores **100/100 · Excellent · A**. A metric that does this cannot ship under the name *Health Score* |
| **Second finding** | the **GluciAI Index adds no information** the score does not already carry, its bands were never given a meaning, it contradicts the word bands over 80–84, and being per-plate it looks like a food grade while being a serving grade |
| **Third finding** | the reachable range is **[19, 100]**, not [0, 100] — the six penalties total 81 points |
| **Blocks Step 22D** | D1, D3, D4, D5, D6, D8, D9, D10, D14, D15, D16, D17, D18, D20 |
| **Blocks Step 23** | D13, plus whether the doctor report may carry the score at all |
| **NOT blocked by RU-3** | **NUTR-A11** — the doctor report printing a carbohydrate floor as a total. A provenance defect with a known fix; it needs Step 23, not a specialist |
| **Verification** | unit/golden **991 in 37 files** (982 before, +9 evidence fixtures) · clinical **156 unchanged** · typecheck clean · lint ratchet 6/6 · no behaviour change, so no runtime verification was required or performed |

**Cheapest honest fix available, if the specialist wants one change only:**
rename the metric to a *glycemic-suitability* indicator (D14). That single
change makes every rule as-written defensible, needs no nutrition science, and
touches no arithmetic.

---

## Step 22D record — Phase 1 only (A–E letter removed)

**No formula, threshold or weight changed.** `scoreMeal` was not modified.

| | |
|---|---|
| **Scope** | exactly the Phase 1 list in [SCORING-IMPLEMENTATION-SPEC.md](SCORING-IMPLEMENTATION-SPEC.md): the A–E letter, its component, its dead exports, its four i18n keys per locale, its two call sites |
| **Deleted** | `src/components/MealGradeBar.tsx` · `MealGrade`, `mealGrade()`, `GRADE_COLORS` · `tests/domain/mealGrade.golden.test.ts` (recorded in the known-bad baseline, not dropped silently) |
| **Screens affected** | the meal-analysis screen (hero strip gone) and the meal PDF (one line + its note gone). **No other surface** — the letter existed nowhere else |
| **Preserved** | the NUTR-A1 constraint, moved into `mealScore.ts`’s header and re-pinned by a fixture; the Step 22A unrated state, which still shows its reason via the advice card |
| **Closed** | the 80–84 letter/word contradiction, and the per-plate food-grade illusion |
| **Still open** | the barcode (70/50) and panel (70/45) band sets — RU-3 D10, Phase 3 |
| **Verification** | unit/golden **961 in 36 files** (991/37 before: −20 deleted grade fixtures, −10 letter assertions elsewhere) · clinical **156 unchanged** · typecheck clean · lint ratchet 6/6 · Demo Mode fr/en/de/ar + RTL + 375 px, console clean, **zero external requests**, PDF captured and verified |
| **Security suite** | **not re-run** — Docker Desktop down (`ECONNREFUSED 127.0.0.1:54321`). Phase 1 touched no file under `supabase/`, no sync, no auth. A gap, not a pass |

**Phases 2–5 not started.**

---

## Step 22D record — Phase 2 (interim naming and demotion)

**No formula, weight, threshold, colour or calculation changed.** `scoreMeal` was
not opened; no stored `meal_score` was read, rewritten or migrated. Phase 2 is
wording plus the order and size of two existing elements.

| | |
|---|---|
| **Interim name adopted** | `analysis.healthScore` **deleted** and replaced by `analysis.scoreTitle` — fr *Repère GluciAI* · en *GluciAI indicator* · de *GluciAI-Indikator* · ar *مؤشر GluciAI*. The empty interim name claims nothing while the formula is under review; the final name (*Aptitude glycémique*) waits for Phase 4 |
| **Surfaces renamed / qualified** | analysis card · meal PDF · home recap · barcode verdict · menu badge · day badge · doctor/admin panel |
| **Demotion** | the WORD now leads the figure on the analysis card and the home card. Colours, thresholds and the number itself are untouched — only order and font size |
| **New disclosure** | the tooltip (`analysis.scoreNote`) states what the indicator weighs and that it is **not a clinical measure**; the same sentence is in the meal PDF and in the panel footnote |
| **Claims withdrawn** | `mealScore.balanced` no longer asserts a balanced meal · `barcodePage.verdictQ` no longer asks *"Convient au diabète ?"* · `menuScanPage.bestChoice` no longer says *"meilleur choix pour le diabète"* |
| **Day badge** | keeps its wording (RU-3 D13) and gains `journalV2.scoreInputs`, naming its two inputs |
| **Verification** | unit/golden **961 in 36 files** (unchanged) · clinical **156 unchanged** · typecheck clean · lint ratchet 6/6 · Demo Mode fr/en/de/ar + RTL + 375 px, console clean, **zero external requests**, PDF captured, panel asset verified as served |
| **Not exercised at runtime** | the barcode verdict block and the menu ranking need a network lookup Demo Mode cannot perform; their strings were verified in the locale files and in source. The panel needs Supabase auth; its served asset was verified instead |
| **Pre-existing, untouched** | the barcode and menu screens overflow to 393 px from a decorative SVG — present before Phase 2 and outside its scope |

**Phases 3–5 not started.** The band sets (barcode 70/50, panel 70/45) still
disagree — RU-3 D10, Phase 3.
