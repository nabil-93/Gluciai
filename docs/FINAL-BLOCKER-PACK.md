# FINAL BLOCKER PACK — everything standing between here and release

**Prepared at commit `ad39ab0`.** Working tree clean · 1183/1183 tests ·
typecheck, lint ratchet, edge imports and web build all green · **the safe
engineering queue is exhausted.**

**Nothing in this document is answered.** It exists so that each decision, once
made, can be executed immediately: every card states the current behaviour with
real numbers, the exact files that change, the tests that already pin the
behaviour, and the tests that must be added afterwards.

**How to read a card.** *Current behaviour* is what the code does today, taken
from the source, not from an older document. *Affected files* is where the work
lands. *Tests today* is what already pins it — those fixtures will fail when the
behaviour changes, which is the point. *Release consequence* is what shipping
without the answer means.

---

## Blocker index

| ID | Question | Who answers | Severity |
|---|---|---|---|
| **B-1** | Mixed-meal GI validity | Clinical specialist | 🔴 Foundational |
| **B-2** | RU-11 Q1–Q14 — dosing arrangement | Clinical specialist | 🔴 Critical |
| **B-3** | RU-2 — glucose plausibility bound | Clinical specialist | 🟠 High |
| **B-4** | Emergency hypo first aid, ar/de/en | Clinician + native speaker | 🟠 High |
| **B-5** | RU-3 D1–D20 — scoring model | Clinical specialist | 🟠 High |
| **B-6** | R1 — per-day denominator | You (product) | 🟡 Medium |
| **B-7** | R2 — partial-day charting | You (product) | 🟡 Medium |
| **B-8** | D13 — day badge blend and vocabulary | You (product) | 🟡 Medium |
| **B-9** | Score in the doctor report | You (product) | 🟡 Medium |
| **B-10** | N-14 — admin verification of catalogue rows | You (product/ops) | 🟡 Medium |
| **B-11** | `expo-updates` — OTA or not | You (product) | 🟡 Medium |
| **B-12** | S3-1 — two names for one indicator | You (product) | 🟢 Low |
| **B-13** | Apple Developer Program | You (account) | 🔴 Blocks iOS |
| **B-14** | Export-compliance declaration | You (account) | 🟡 Medium |
| **B-15** | Deploy Vercel | You (authorization) | 🔴 Critical |
| **B-16** | Deploy 3 Edge Functions | You (authorization) | 🟠 High |
| **B-17** | Push 4 commits | You (authorization) | 🟠 High |
| **B-18** | Device validation, 20 flows | You (execution) | 🔴 Critical |

---

# A · CLINICAL SPECIALIST DECISIONS

## B-1 · Mixed-meal GI validity — **ask this one first**

**Question.** Can a **carbohydrate-weighted mean of glycemic-index values —
many of them category estimates rather than measured — legitimately describe a
mixed plate?**

**Why it blocks release.** Every other GI/GL decision assumes the answer is yes.
If it is no, the composite indicator falls with it, 22D Phase 4 must not be
built, and the components-only presentation (option D3) becomes the correct
design. **Answering any RU-3 question before this one risks building work that
this answer deletes.**

**Current behaviour.** The engine computes a carbohydrate-weighted mean GI over
the plate's items, substituting `ASSUMED_GI = 55` for any food with no index,
and reports the share of carbohydrate the index actually covers
(`gi_carb_coverage`). Since S1-2 the screen and the PDF say when the index is
unknown and mark the load as assumed — but they still **present the mean as the
plate's index**.

**Who answers.** A diabetologist or clinical nutrition scientist. Published GI
values are measured on single foods under controlled conditions; mixed-meal GI
is contested in the literature. This is a scientific question, not a product one.

**Affected files.** `src/services/nutrition/engine.ts` (the weighted mean),
`src/services/nutrition/interpret/glycemic.ts` (`ASSUMED_GI`, `effectiveGi`,
`glValue`), `src/app/scan-result.tsx` (GI card, GL tag, PDF), plus every surface
showing a GI or GL.

**Tests today.** `tests/domain/glycemicHonesty.golden.test.ts` (11) pins the
bands, the assumed-index rule and both known-bad rounding divergences;
`nutritionScience.golden.test.ts` pins the science claims.

**Implementation plan after approval.**
- *If yes* → 22D Phase 4 may proceed on its current assumption. Optionally add a
  coverage floor below which no plate-level GI is claimed (that floor is itself
  a new clinical number, so it needs its own answer).
- *If no* → **do not build Phase 4.** Remove the plate-level GI claim, keep
  per-food indices where they are measured, and move the card to a
  components-only presentation. The composite `meal_score` survives only as an
  internal sort key for menu ranking. Stored values are never recomputed.

**Tests required after approval.** Either a coverage-floor fixture, or — for
"no" — fixtures asserting that no plate-level GI is displayed, that per-food
indices still render, and that menu ranking still works from the internal key.

**Release consequence if unanswered.** The app presents a number as "this
meal's glycemic index" that may not be a meaningful quantity.

---

## B-2 · RU-11 Q1–Q14 — the dosing arrangement

**Question.** The 14 questions in
[RU11-CLINICAL-DECISIONS.md](RU11-CLINICAL-DECISIONS.md). They interact and
should be answered in **one session**, not piecemeal.

**Why it blocks release.** These change an **injected insulin dose**. Two of
them are quantified defects, not preferences.

**Who answers.** A diabetologist. Engineering must not choose any of them.

### The two that are defects, with numbers

| | Current behaviour | The alternative |
|---|---|---|
| **Q1–Q3 · P7-002** | `raw = (meal + correction − IOB) × activity × trend × sick × stress × status × alcohol` — the activity factor **scales the IOB deduction**. Activity 0.75 with 3 U active on a 60 g meal → **2.3 U** | Subtract IOB last → **1.5 U**. Q2 asks the same for factors above 1 (sick 1.15 → today 3.5 U vs 3.9 U); Q3 asks whether a negative result should floor at 0 or surface as "surplus insulin on board" |
| **Q4–Q7 · P7-011** | `computeIOB` counts **only** `insulin_type === 'rapid'`. A premixed dose contributes **nothing**. Since `9d06008` the omission is disclosed on screen, and the dose is unchanged | Decide whether premix may contribute, at what declared rapid percentage, captured per product or per injection, and with what action duration (today `DIA_HOURS = 4`, linear) |

### The rest

**Q8** fallback dosing — may a dose be produced from ICR 10 g/U, ISF 50,
target 70–180 when the patient entered none? **Q9** meal windows — 17:59 doses
at the lunch ratio (5.0 U) and 18:00 at dinner (10.0 U) for the same 50 g.
**Q10** should a snack keep borrowing the lunch ratio? **Q11** correction is
gated at `> targetHigh` but computed to `targetMid`, so 180 → 0 U and
181 → 1.1 U. **Q12** should a *planned* session reduce the dose like a completed
one (both 0.75 today)? **Q13** alcohol halves the correction *and* multiplies
the total by 0.9, landing at 45 % of sober (8.5 → 6.5 U). **Q14** does any answer
change the meaning of the 20 U ceiling?

**Affected files.** `src/services/bolusEngine.ts` almost exclusively —
`computeSmartBolus` assembly, `computeIOB`, `ratioForMeal`, the correction gate,
`MAX_SAFE_BOLUS`. Then `src/app/bolus.tsx` for any wording that describes a
changed rule.

**Tests today.** `tests/clinical/` — 181 fixtures across `bolusContract`,
`computeIOB`, `computeSmartBolus`, `localDoseCheck`, `ratioForMeal`,
`ru11Baseline`, `mixedInsulinDisclosure`, `typedGlucoseUnit`,
`sugarHeavyAssociation`. `ru11Baseline` exists specifically to pin today's
arrangement so a change is visible; **those fixtures are expected to fail when
the answer lands, and must be updated deliberately, not deleted.**

**Implementation plan after approval.** Change the arrangement in
`computeSmartBolus` exactly as answered; re-pin `ru11Baseline` to the new
behaviour with the decision referenced in the fixture; add a fixture per changed
question showing the before/after dose for the worked example in the question.

**Release consequence if unanswered.** The app recommends insulin doses using an
IOB arrangement no clinician has ratified, and excludes premixed insulin from
active-insulin accounting.

---

## B-3 · RU-2 — the glucose plausibility bound

**Question.** Stated in full in
[RU2-GLUCOSE-PLAUSIBILITY.md](RU2-GLUCOSE-PLAUSIBILITY.md). Is there a value
beyond which a reading must not be treated as real, and what happens to it?

**Current behaviour.** The app has a **unit** guard (P7-005 — a typed value
outside the plausible mg/dL band is refused, so 5.6 mmol/L cannot be stored as
5.6 mg/dL) and a **data-integrity** guard (P9-004 — non-finite readings are
excluded from report statistics). It has **no physiological guard anywhere**: a
finite 900 mg/dL is stored, charted, averaged and usable as a correction input.

**Who answers.** A diabetologist. Both failure modes are harmful — rejecting a
genuine emergency reading, or letting a typo drive a correction dose.

**Affected files.** `src/services/bolusEngine.ts` (`readGlucose`),
`src/app/log-glucose.tsx`, `src/services/aiLogger.ts`,
`src/services/reportStats.ts`, `src/services/sync.ts`.

**Tests today.** `tests/clinical/typedGlucoseUnit.golden.test.ts` (14) pins the
unit guard; `reportStats.golden.test.ts` pins that an implausible **finite**
reading is still counted — deliberately, so no bound was invented.

**Implementation plan after approval.** Add the bound at the boundary chosen
(entry / storage / display / engine), decide whether a failing reading still
counts in the doctor's report and still triggers the hypo guard, and leave
stored history untouched — the project's standing rule.

**Release consequence if unanswered.** A mistyped 900 can reach a correction
dose and every statistic in the doctor's report.

---

## B-4 · Emergency hypo first aid in ar/de/en

**Question.** Are the four "rule of 15" hypoglycaemia steps correct, and are the
Arabic, German and English translations clinically accurate?

**Why it blocks release.** These are the instructions a patient follows during a
hypoglycaemic episode. **The code itself declares this a pre-release
requirement** — `src/app/emergency.tsx:151` carries
`TODO(medical-review): … must be double-checked by a clinician / native speaker
before store release`.

**Current behaviour.** All four steps exist in all four locales and render
correctly (Arabic verified). French is the reference: *"Donnez 15 g de sucre
rapide (3 morceaux de sucre, ½ verre de jus)."* The other three are
**unverified translations of medical instructions**.

**Who answers.** A clinician for the content, a native speaker for each language.

**Affected files.** `src/i18n/locales/{ar,de,en}.json` →
`emergencyPage.hypoStep1-4`; the TODO in `src/app/emergency.tsx`.

**Tests today.** None specific — presence is covered by locale-parity fixtures.

**Implementation plan after approval.** Correct any string found wrong, remove
the TODO, and add a fixture asserting all four steps are non-empty in all four
locales so a future edit cannot blank one.

**Release consequence if unanswered.** A patient could receive incorrect
first-aid instructions during a medical emergency, in their own language.

---

## B-5 · RU-3 D1–D20 — the scoring model

**Question.** The register in
[RU3-NUTRITION-DECISIONS.md](RU3-NUTRITION-DECISIONS.md). **D16 is already
resolved** (burn now uses MET × BMR); **D18 is narrowed** — its dishonesty half
is closed, and only "should a load be shown at all when no index is known?"
remains.

**Ordering.** **D10 first** (it unblocks 22D Phase 3), then **D5 + "remove
sodium's weight"** (Phase 4), then the rest.

| Decision | Current behaviour | Blocks |
|---|---|---|
| **D10** bands | Four sets disagree: word 85/70/50 · letter 80/65/50/35 · barcode 70/50 · panel 70/45. An "A" can sit beside the word *"Bon"* at 80–84 | 22D Phase 3 |
| **D5** energy | `calories > 800` → −8, flat, not personalised | 22D Phase 4 |
| **D1/D2** fat | Fat is **not scored at all**; no saturated-fat field exists anywhere, and adding one needs a provider change and a migration — it would be unavailable for most Moroccan dishes | 22D Phase 4 |
| **D3** carbohydrate | `> 80 g` → −15, `> 60 g` → −8 | 22D Phase 4 |
| **D6** GL in score | GL is displayed but does **not** feed the score | 22D Phase 4 |
| **D9** GI gate | `gi > 70` → −22, `gi > 55` → −10. **GI 70 itself takes the moderate penalty while the chip calls it high** | 22D Phase 4 |
| **D12** missing nutrients | An absent sodium reads as 0, so the `> 1000 mg` rule silently never fires | 22D Phase 4 |
| **D19** low confidence | A 0.1-confidence food contributes its nutrition **in full** | 22D Phase 4 |
| **D14** wording | The /100 is not stated in words to be the app's own heuristic | 22D |
| **D15** references | Calcium and potassium reference values — correcting them drops displayed percentages by ~30 % / ~34 % | 22C |
| **D20** zero-energy plate | A declared 0 kcal plate is **not** scored (Step 22A) | 22D |
| **D18** remainder | A load is still shown when no index is known, now marked as assumed | 22D |

**Affected files.** `src/services/nutrition/mealScore.ts` (weights and bands),
`interpret/glycemic.ts` (D9/D18), `micros.ts` (D15), `src/app/barcode.tsx` and
`public/panel-x7k42m/app.js` (D10's other band sets).

**Tests today.** `nutritionClaims` (31), `glycemicHonesty` (11),
`glycemicVocabulary` (23), `interpretationInventory`, `nutrientCompleteness` —
all pin current behaviour and will fail deliberately on change.

**Release consequence if unanswered.** A meal shows up to three different
verdicts on three screens, and the composite weighting remains unpublished.

---

# B · YOUR PRODUCT DECISIONS

## B-6 · R1 — the per-day denominator (P9-005)

**Current.** `avgCarbsPerDay`, `avgSugarPerDay`, `avgInsulinPerDay` divide by
**days that have data**, not window length. A patient who logged one day in seven
is reported at that day's average as though typical.
**Options.** (A) keep — reads "on the days you logged"; (B) divide by window
length — every average falls for sparse loggers, under-logging becomes visible;
(C) keep A and caption the denominator — no number moves.
**Affected.** `src/services/reportStats.ts`, `src/services/reportHtml.ts`.
**Tests today.** `reportStats.golden.test.ts` (60). **After:** a fixture per
denominator with a sparse-logging case.
**Recommendation.** **C now, B later if a clinician prefers it** — C is
non-destructive and removes the ambiguity immediately.

## B-7 · R2 — partial-day charting (P9-001)

**Current.** The day-by-day chart stops before today, so today's readings appear
in the printed totals but **not** in the chart beside them; the same page
disagrees with itself.
**Options.** (A) add today as a partial bar — they agree, but a partial bar
invites comparison with full ones; (B) exclude today from both — they agree, and
today's data is absent from a report the patient may have opened to discuss
today; (C) keep and caption.
**Affected.** `src/services/reportStats.ts` (`dayMap` loop), `reportHtml.ts`.
**Recommendation.** **A with an explicit "today, partial" label.**

## B-8 · D13 — the day badge

**Current.** `dayScore` blends time-in-range with mean meal quality (0.6/0.4)
and then borrows the **meal** vocabulary, so two different quantities share one
set of words. Since 22D Phase 2 it carries a caption naming its two inputs.
**Options.** (A) keep; (B) own vocabulary; (C) change the blend (**clinical, not
product**).
**Affected.** `src/components/journal/dayScore.ts`, `journalV2.*` strings.
**Recommendation.** **B** — separate words for a separate quantity; leave the
blend alone.

## B-9 · Score in the doctor report

**Current.** The periodic report carries **no** score, and
[SCORING-IDENTITY-DECISION.md](SCORING-IDENTITY-DECISION.md) §7 argues it should
stay out: a clinician cannot interpret an app-specific composite with no
published basis, and averaging it compounds per-plate portion dependence. The
**meal PDF** does carry it, with the "not a clinical measure" note. The
**doctor panel** shows it with a footnote.
**Options.** (A) keep out; (B) add with the disclaimer; (C) add only components.
**Affected.** `src/services/reportHtml.ts`, `reportStats.ts`.
**Recommendation.** **A** — do not add it.

## B-10 · N-14 — admin verification of catalogue rows

**Current.** `product_catalog.verified` is settable only by SQL or the service
role; the panel has no catalogue screen. So the one genuinely trusted tier
**cannot be created in-app**, and Step 12's `verified` fast path is unreachable
in practice. The write boundary itself was closed by migration 0033.
**Options.** (A) build a verification screen in the panel; (B) leave to SQL and
document; (C) drop the `verified` tier.
**Affected.** `public/panel-x7k42m/app.js`, an `admin-ops` endpoint.
**Recommendation.** **B for launch, A when the catalogue grows.**

## B-11 · `expo-updates`

**Current.** Not installed, so the `preview`/`production` channels declared in
`eas.json` are **inert** — there is **no over-the-air fix path**; every fix needs
a store release.
**Options.** (A) install and configure; (B) ship without OTA.
**Affected.** `package.json`, `app.json`, `eas.json`.
**Recommendation.** **A before public release** — a medical app with no hotfix
path is a real operational risk. It is a release-process decision, so I have not
taken it.

## B-12 · S3-1 — two names for one indicator

**Current.** The strip says *"Indice GluciAI"*, the ring says *"Repère
GluciAI"*, for the same number. The third name was removed in `ad39ab0`.
**Options.** (A) one name on both; (B) keep, since the letter and the number are
different granularities; (C) settle with D10.
**Affected.** `analysis.mealGrade`, `analysis.scoreTitle` in 4 locales.
**Recommendation.** **C** — decide with D10, since the strip is the restored
A–E letter and its bands are D10's.

---

# C · CREDENTIALS AND EXTERNAL ACTIONS

## B-13 · Apple Developer Program — blocks iOS entirely
`eas build --platform ios` fails at credential setup; `eas device:list` reports
**"No Apple teams found for account tsuhel"**. Required in order: enrol in the
Apple Developer Program ($99/yr) and link it to the EAS account; run
`eas credentials --platform ios` **interactively**; register at least one device
with `eas device:create` — an internal-distribution iOS build installs only on
registered UDIDs.

## B-14 · Export-compliance declaration
`ITSAppUsesNonExemptEncryption` is absent from `ios.infoPlist`. It is a
**declaration about the product**, answered in App Store Connect — engineering
must not assert it.

## B-15 · Vercel — 🔴 **the most consequential undeployed item**
The panel and PDF carbohydrate-floor fixes, and every fix since `6bf88e4`, exist
only on disk. **Clinicians using the production panel today are reading
carbohydrate floors as definitive totals** — the exact defect NUTR-A11 fixed.

## B-16 · Three Edge Functions
`nutrition-search` (v1), `food-search` (v5), `ai-chat` (v41) still run
**pre-Step-15 code** in production, where two proxies trusted the bare anon key.
`analyze-meal` is already deployed (v14). Deploy command per function:
`npx supabase functions deploy <name> --project-ref ftqyzpkzqeudzfztataz`.

## B-17 · Push four commits
`9d06008`, `ea35dbd`, `64683fa`, `ad39ab0` exist only on this machine.

## B-18 · Device validation — 20 flows
A verified APK exists (`115139b3-…`, 157.6 MB). **No flow has been exercised on
a device and none is claimed.** Highest value first: scan + retry · bolus and
glucose units · Arabic RTL · offline/error states · notifications. NUTR-GAP-5,
A11Y-1 and P14-* stay gated behind this.

---

# Shortest path to production

1. **Ask B-1** (mixed-meal GI). One question; its answer decides whether B-5's
   Phase 4 work is worth planning at all.
2. **Book one clinical session** covering **B-2** (all 14), **B-3**, **B-4** and
   **B-5's D10 + D5**. These are the only true release blockers a specialist
   must clear.
3. **In parallel, needing nobody:** authorize **B-15** (Vercel — clinicians are
   affected today), **B-16**, **B-17**, and run **B-18** on the existing APK.
4. **Answer B-6…B-12** at your convenience; none blocks a beta.
5. **B-13/B-14** whenever iOS matters. Android does not need them.

**After those decisions, code work remains** — implementing B-2's arrangement,
B-5's chosen bands and weights, and 22D Phases 3–5. All of it is small, and all
of it is already pinned by fixtures that will fail deliberately when the
behaviour changes.
