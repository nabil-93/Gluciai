# Interpretation refactor — Phases 1–3 migration report

**Scope delivered:** Phases 1, 2 and 3 of
docs/ARCHITECTURE-INTERPRETATION-AUDIT.md. Phases 4–7 not started.

**Verification, in full:**

| Gate | Before | After |
|---|---|---|
| `vitest run` | 962 passed | **1005 passed**, 0 failed |
| `tsc --noEmit` | clean | **clean** |
| lint ratchet | 6 findings | **6 findings** (one moved line, baseline re-recorded) |
| web bundle | builds | **builds** — 18.8 MB, all four new modules present |

**No formula, weight, threshold, band, colour or string changed.** Every
displayed value is what it was.

---

## 1. What was centralized

A new leaf package, `src/services/nutrition/interpret/`, is now the only import
path a screen uses to turn a nutrition number into a meaning.

| Module | Owns | Replaces |
|---|---|---|
| `glycemic.ts` | `giBand`, `GLYCEMIC_TONE`, `ASSUMED_GI`, `effectiveGi`, `isAssumedGi`, `glValue`, `glBand`, `glycemicLoad` | 1 band function + 1 palette + 1 band function + 3 inline fallbacks, spread over 4 files |
| `quality.ts` | one import path for `scoreMeal`, `mealGrade`, `GRADE_COLORS`, `qualityEvidence`, `qualityClaimSupported`, `buildHighlights`, `displayableHighlights` | 5 screens importing from 2 modules on 9 separate import lines |
| `format.ts` | `carbFigure`, `carbFigureOf` + the whole `carbProvenance` surface | 4 hand-written `value + unit` assemblies |
| `index.ts` | the barrel, and a written record of which modules are **blocked** and on what | — |

`glycemic.ts` imports nothing at all. That is asserted by a test, so it cannot
acquire a dependency and start a cycle.

**10 files now read the seam:** `scan-result`, `(tabs)/index`, `nutrition`,
`menu-scan`, `barcode`, `LastMealCard`, `MealPeekModal`, `MealGradeBar`,
`GlycemicBar`, `journal/dayScore`.

---

## 2. What duplicate code disappeared

| # | Duplicate | Was | Now |
|---|---|---|---|
| 1 | `glBand` — the glycemic-load banding | a private function in `scan-result.tsx` duplicating `glycemicLoad`'s thresholds | one function in `interpret/glycemic.ts` |
| 2 | The three-colour tone palette | a private `TONE` in `GlycemicBar.tsx` **and** three hard-coded hexes in `scan-result`'s `glBand` | one `GLYCEMIC_TONE` table, read by both |
| 3 | `gi > 0 ? gi : 55` | written out in `advice.ts`, `engine.ts` and `scan-result.tsx` | one named `ASSUMED_GI` + `effectiveGi()` |
| 4 | The load expression `× carbs / 100` | in `engine.ts` and `scan-result.tsx` | one `glValue()` |
| 5 | `giBand` / `glycemicLoad` implementations | in `advice.ts` | moved to the leaf; `advice.ts` re-exports so no importer churned |
| 6 | `${carbText(v)}${carbUnit(v) ? ' ' + carbUnit(v) : ''}` | hand-written 4× (`LastMealCard`, `MealPeekModal`, home ring alert, the PDF row) | one `carbFigure()` |

A guard test now fails if any screen re-writes #6, and another fails if `giBand`
or `glycemicLoad` reappear as implementations in `advice.ts`.

**Deliberately not merged**, because merging them would have moved a value:

- `glycemicLoad` (bands the **unrounded** load, feeds the badges) and `glBand`
  (bands the **rounded** load, feeds the on-screen tag). They share one
  threshold pair now, but stay two functions — see §4.
- `computeBMR` / `computeBMI`, duplicated between `programEngine` and
  `scan-result` / `recommendations`. The copies round at different points, so
  unifying can move a boundary case. Phase 7.

---

## 3. The characterization net

`tests/domain/interpretationInventory.golden.test.ts` — **43 new assertions**
covering all 9 domains from the audit. It is the proof that nothing moved, and
the record of what has not been decided.

Its design rule: **many expectations are known-bad on purpose.** A GI of 67 is
asserted to be *both* `medium` and `high`; 17:00 is asserted to resolve to
*both* `dinner` and `snack`. Deleting such an assertion is not fixing a test —
it is deleting the evidence for a decision nobody has made.

**Two existing fixtures were edited. Both were source-location assertions; no
behavioural assertion was touched:**

| Fixture | Asserted | Now asserts |
|---|---|---|
| `nutrientCompleteness` | five screens contain `carbDisplay(` | the same five ask the provenance question **and** import the one module that owns the answer — plus a new assertion that none re-writes the assembly |
| `nutritionScience` | `advice.ts` contains the inline `: 55` | `interpret/glycemic.ts` contains `export const ASSUMED_GI = 55` |

The behavioural assertion beside the second one — `glycemicLoad(30, 0) === 'Medium'` —
is unchanged and still passes, which is what proves the constant did not move.

---

## 4. One new contradiction found while pinning

Not in the original 26. Found because Phase 1 forced both load bandings to be
executed side by side:

> **The badge and the tag disagree between GL 20.0 and 20.5.**
> `glycemicLoad` bands the **unrounded** load and feeds
> `high_glycemic_load`; the on-screen tag bands the **rounded** one. At 51 g of
> carbohydrate and GI 40 the load is 20.4 — the badge says *"Charge glycémique
> élevée"* and the tag on the same screen says *"Moyen"*.

Pinned as known-bad. Fixing it moves a displayed word, so it is not a Phase 1–3
change.

---

## 5. What still requires a product or clinical decision

Nothing below was touched. Each is blocked on an answer, not on engineering.

| Blocked | Phase | The question that must be answered first |
|---|---|---|
| **One hour→meal map** (6 exist) | 4 | `bolusEngine.guessMealTime` has a **16:00–18:00 gap** that falls through to `snack`, and a snack reuses the **lunch insulin ratio**. A 17:00 dinner is dosed on the lunch ratio. Clinical. |
| **One GI action threshold** | 5 | Is "high GI" **65** or **70**? Five surfaces say 65, the classification says 70. Recommendation on the table: keep **70 for classification**, expose **65 as a separate action threshold** — two honest names rather than one contradictory one. |
| **`mealVerdict`** | 6 | The **A/"Bon" overlap at 80–84** (RU-3 D10), the day badge borrowing the meal vocabulary, and whether `buildHighlights` adopts `scoreMeal`'s thresholds (protein 20 vs 25, carbs 80 vs 75, fibre 2 vs 3). |
| **One set of patient targets** | 7 | RU-3: what a diabetic carbohydrate target **means**. Today the Nutrition page frames 250 g as *"Objectif atteint"* — a goal to complete rather than a ceiling. |
| **Hydration semantics** | 8 | Is the ring the meal's contribution or the patient's status, and should the reminder be conditional? |

The `interpret/index.ts` barrel names all three unbuilt modules — `timing`,
`targets`, `hydration` — with their blocker, so the next person reads the
constraint before writing the code. A test asserts those names stay there.

---

## 6. Do contradictions remain? Yes — all of them, deliberately

**Phases 1–3 were scoped to change no behaviour, so they closed no
patient-visible contradiction.** That was the instruction and it was met
exactly. Of the 26 in the consistency report: **0 closed, 26 open, 1 added to
the register** (§4).

What changed is that they are now **executable**. Every one of them is an
assertion that fails the moment someone moves it by accident, instead of a
paragraph in a document.

### The one that was ready and is still open

**S1-7 — a floor prints as a total on six clinician surfaces.** `day.tsx`,
`journal.tsx`, `program-day.tsx`, `report.tsx`, `weeklyReport.ts` and the doctor
panel still render `Math.round(result.carbohydrates)` raw, so a meal the patient
sees as *"≥ 62 g"* reaches their doctor as *"62 g"*.

The audit scheduled this for Phase 3 and called it *"the only phase that fixes
findings without a product decision"*. **It was not done here, because closing
it is a visible change** — "62 g" becomes "≥ 62 g" on six screens — and the
brief for this work was *"keep all existing behaviour byte-for-byte
identical"*. The two instructions could not both be satisfied, so behaviour
preservation won and the seam was built up to the edge.

Everything needed is in place: `carbFigure()` exists, the six sites are pinned
in the inventory test, and the migration is **one line per site**. Say the word
and it ships as its own change, with the guard assertion flipping from
`not.toContain` to `toContain`.

### Not touched, on purpose

`bolus.tsx` is the only file still importing `carbProvenance` directly. It is
the dose path under the RU-11 freeze; an import-path change there is not worth
the review it would require. `bolusEngine`, IOB, migrations, Edge Functions,
sync and identity were not opened at all. No stored `meal_score` and no `result`
JSONB was recomputed.
