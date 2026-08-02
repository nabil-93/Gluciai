# Interpretation architecture audit

**Nothing implemented. No formula, threshold, constant or wording changed to
produce this document.**

The consistency report listed 26 contradictions. This document asks the
question behind them: **where does the application decide what a number
means, and how many times does it decide the same thing?**

The answer: **9 interpretation domains, 47 independent decision sites, of
which 33 are duplicates of a rule that already exists somewhere else.**

The app has three well-built engines — `bolusEngine`, `programEngine`,
`nutrition/engine` — and every screen still reaches past them to reinterpret
raw numbers in JSX. The contradictions are not bugs on top of the
architecture; they *are* the architecture.

---

## 0. The shape of the problem, in one screen

`src/app/(tabs)/index.tsx` contains **two different hour→meal maps, 1 500
lines apart, in the same file**:

| Line | Function | 17:00 resolves to |
|---|---|---|
| [133](../src/app/(tabs)/index.tsx#L133) | `slotOfMeal` — fills the breakfast/lunch/dinner cards | **Dîner** |
| [1650](../src/app/(tabs)/index.tsx#L1650) | `mealLabel` — labels the timeline rows | **Collation** |

Same meal, same screen, two labels. Neither is wrong given its own constants;
there simply is no place that owns the question.

---

## 1. Glycemic index bands

**The question:** is this GI low, medium or high — and does it warrant an action?

| # | Site | Rule | Status |
|---|---|---|---|
| 1 | [`advice.ts:51` `giBand`](../src/services/nutrition/advice.ts#L51) | ≤55 / 56–69 / ≥70 | **canonical** (declared as such in its own doc comment) |
| 2 | [`GlycemicBar.tsx:54` `glycemicTone`](../src/components/ui/GlycemicBar.tsx#L54) | delegates to #1 | ✅ correct |
| 3 | [`healthy-food.tsx:159`](../src/app/healthy-food.tsx#L159) | delegates to #2 | ✅ correct |
| 4 | [`menu-scan.tsx:227`](../src/app/menu-scan.tsx#L227) | delegates to #1 | ✅ correct |
| 5 | [`mealScore.ts:104`](../src/services/nutrition/mealScore.ts#L104) | >70 harsh · >55 moderate · **≤40 bonus** | **duplicate + a 4th band that exists nowhere else** |
| 6 | [`foods.tsx:74` `giTone`](../src/app/foods.tsx#L74) | >65 / >55 / ≤55 | **duplicate, different cut-off** |
| 7 | [`ai.ts:711`](../src/services/ai.ts#L711) | >65 "ÉLEVÉ" · >55 "modéré" | **duplicate, different cut-off, in prose** |
| 8 | [`engine.ts:559`](../src/services/nutrition/engine.ts#L559) | >65 → `warn:high_gi` | **duplicate** |
| 9 | [`insights.ts:79`](../src/services/insights.ts#L79) | >65 → post-meal check | **duplicate** |
| 10 | [`weeklyReport.ts:88`](../src/services/weeklyReport.ts#L88) | >65 → counted "high GI" | **duplicate** |
| 11 | [`foods.ts:69`](../src/app/foods.tsx#L69) | >65 → warning as a **raw French string**, not a `warn:` key | **duplicate + un-localizable** |

**Can two implementations diverge?** They already have. A GI of 67 is
`medium` to #1–#4 and `high` to #7–#11, and takes only the moderate penalty
in #5. Six surfaces, three verdicts, one number.

**Why it happened:** #1 was created in Step 22A and correctly documented that
#5 and #8 disagree with it — but the fix was recorded as a nutrition-policy
question (RU-3) rather than as an architecture question, so five more copies
were never migrated.

**Single source of truth:** `giBand(gi)` already is it. What is missing is a
level above it: a function that returns not just the band but **what follows
from it** — the label key, the colour, whether a post-meal check is
warranted, whether the AI may call it "élevé". Every one of #5–#11 is asking
that second question and answering it locally.

---

## 2. Glycemic load bands

**The question:** is this GL low, medium or high — and what GI do we assume
when none is known?

| # | Site | Rule | Status |
|---|---|---|---|
| 1 | [`advice.ts:62` `glycemicLoad`](../src/services/nutrition/advice.ts#L62) | <10 / 10–20 / >20 → `'Low'\|'Medium'\|'High'` | one of two |
| 2 | [`scan-result.tsx:339` `glBand`](../src/app/scan-result.tsx#L339) | >20 / ≥10 / else → `{key, color}` | **duplicate, different return shape and different capitalisation** |

Identical numbers, two functions, two vocabularies (`'High'` vs `'high'`,
`result.high` = "Élevé" vs `insights.highlights.high_glycemic_load` = "Charge
glycémique élevée").

**The assumed GI of 55 when none is known is written out three times:**

- [`advice.ts:66`](../src/services/nutrition/advice.ts#L66)
- [`engine.ts:665`](../src/services/nutrition/engine.ts#L665)
- [`scan-result.tsx:635`](../src/app/scan-result.tsx#L635)

**Can they diverge?** Yes, and the consequence is already visible: the PDF
prints `Index glycémique : 0` beside `Charge glycémique : 50` because the
assumption lives in the load and not in the index. Nothing marks a GL as
*assumed* — there is no `glycemic_load_estimated` twin of
`glycemic_index_estimated`.

**Single source of truth:** one `glLoad(carbs, gi)` returning
`{ value, band, assumed: boolean }`. The `assumed` flag is the missing piece —
it is what would have stopped S1-2.

---

## 3. Meal quality

**The question:** is this plate good, and may we say so at all?

| # | Site | What it decides | Status |
|---|---|---|---|
| 1 | [`mealScore.ts:97` `scoreMeal`](../src/services/nutrition/mealScore.ts#L97) | the 0–100 figure | canonical formula |
| 2 | [`mealScore.ts:59` `mealGrade`](../src/services/nutrition/mealScore.ts#L59) | A–E at 80/65/50/35 | canonical letter |
| 3 | [`mealScore.ts:148`](../src/services/nutrition/mealScore.ts#L148) | word at 85/70/50 | **bands disagree with #2** |
| 4 | [`advice.ts:196` `qualityEvidence`](../src/services/nutrition/advice.ts#L196) | may a verdict be shown | canonical gate |
| 5 | [`advice.ts:82` `buildHighlights`](../src/services/nutrition/advice.ts#L82) | the praise/attention badges — **with its own thresholds** | **duplicate rules** |
| 6 | [`dayScore.ts:13`](../src/components/journal/dayScore.ts#L13) | 0.6·TIR + 0.4·meal average | separate concept, same words |
| 7 | [`dayScore.ts:64` `scoreBand`](../src/components/journal/dayScore.ts#L64) | 85/70/50 + **its own colour list** | **duplicate of #3** |
| 8 | `panel-x7k42m/app.js:1084` | 70/45 + green/amber/red | **duplicate, different bands, no evidence gate** |

**#5 vs #1 — the same nutrient, two thresholds:**

| Nutrient | `scoreMeal` says | `buildHighlights` says |
|---|---|---|
| Protein "good" | **≥ 20 g** (+5) | **≥ 25 g** (`high_protein`) |
| Carbs "too much" | **> 80 g** / > 60 g | **> 75 g** (`carb_heavy`) |
| Fibre "poor" | **< 2 g** | **< 3 g** (`low_fiber`) |

A 22 g-protein plate earns *"Bon apport en protéines"* in the score's reason
list and **fails** to earn the "Riche en protéines" badge on the same screen.

**Recomputation sites — the same score is calculated five times:**

| Site | Reads | Note |
|---|---|---|
| [`engine.ts:605`](../src/services/nutrition/engine.ts#L605) | on aggregate | **persisted** as `meal_score` |
| [`scan-result.tsx:511`](../src/app/scan-result.tsx#L511) | live | re-derives after every edit |
| [`LastMealCard.tsx:110`](../src/components/LastMealCard.tsx#L110) | live | **recomputes a stored meal** |
| [`menu-scan.tsx:66`](../src/app/menu-scan.tsx#L66) | live | drives the "Meilleur choix" ranking |
| [`barcode.tsx:177`](../src/app/barcode.tsx#L177) | live | **passes no `glycemic_index` at all** |

**Can they diverge?** They already do, in two ways.
*(a)* `aiLogger` saves a meal without ever calling `scoreMeal`, so
`meal_score` is `undefined` — the doctor panel and the day badge show
nothing while `LastMealCard` **recomputes and displays a full verdict**.
*(b)* the day badge and the doctor panel read the **stored** score while
every patient-facing screen reads a **live** one; the day the formula moves,
the two permanently disagree for all history.

**Single source of truth:** one `mealVerdict(plate)` returning
`{ evidence, score, band, letter, labelKey, color, textColor, reasons,
badges, modelVersion }` — one call, one gate, one set of bands, one palette,
and a version stamp so a stored verdict is never silently compared with a
live one.

---

## 4. Meal timing

**The question:** which eating moment does this row belong to?

| # | Site | Map | Status |
|---|---|---|---|
| 1 | [`index.tsx:124` `slotOfMeal`](../src/app/(tabs)/index.tsx#L124) | type wins; else <11 / <16 / dinner | |
| 2 | [`index.tsx:1650` `mealLabel`](../src/app/(tabs)/index.tsx#L1650) | type wins; else <11 / <15 / <19 **snack** / dinner | **duplicate, same file** |
| 3 | [`nutrition.tsx:333`](../src/app/nutrition.tsx#L333) | `meal_type ?? 'snack'` | **third rule: no clock at all** |
| 4 | [`MealPeekModal.tsx:61`](../src/components/MealPeekModal.tsx#L61) | `meal_type ?? 'snack'` | duplicate of #3 |
| 5 | [`LoggerConfirmCard.tsx:34` `guessMeal`](../src/components/LoggerConfirmCard.tsx#L34) | <11 / <16 / <22 / snack | **fourth map** |
| 6 | [`aiLogger.ts:461` `MEAL_WINDOWS`](../src/services/aiLogger.ts#L461) | 5–11 / 11–16 / 16–23 | **fifth map** |
| 7 | [`bolusEngine.ts:126` `guessMealTime`](../src/services/bolusEngine.ts#L126) | 4–11 / 11–16 / ≥18 / else snack | **sixth map — and it selects the insulin ratio** |
| 8 | [`notifications.ts:106`](../src/services/notifications.ts#L106) | `<11` = breakfast | seventh, partial |
| 9 | [`reportStats.ts:198` `slotOf`](../src/services/reportStats.ts#L198) | glucose slots | eighth, different subject |
| 10 | [`scan-result.tsx:95`](../src/app/scan-result.tsx#L95) | **deliberately none** — the patient chooses | ✅ the correct behaviour |

**Six independent hour→meal maps for food, plus two more for other subjects.**
A meal at **17:00 with no confirmed type** is:

- **Dîner** on the home meal cards (#1)
- **Collation** on the home timeline (#2)
- **Collation** on the Nutrition page and in the peek window (#3, #4)
- **Dîner** in the AI confirm card (#5) and when backdated (#6)
- **snack → the lunch insulin ratio** in the bolus engine (#7)

The last one is the reason this domain is ranked here rather than under
cosmetics: `guessMealTime` has a **gap between 16:00 and 18:00** that falls
through to `'snack'`, and snacks reuse the lunch ratio. A 17:00 dinner is
dosed on the lunch ratio while every other screen calls it dinner.

> **Out of scope for change.** `bolusEngine` is under the RU-11 freeze. This
> audit records the divergence; it does not propose touching the dose path.
> The correct move is for the *display* layer to adopt the engine's map, not
> the reverse.

**Single source of truth:** `mealMoment(row)` — confirmed type first, one
documented clock fallback second, and an explicit `inferred: boolean` so any
screen can mark a guessed slot instead of asserting it.

---

## 5. Calorie interpretation

**The question:** how much should this patient eat, and is this plate a lot?

| # | Site | Rule | Status |
|---|---|---|---|
| 1 | [`programEngine.ts:170`](../src/services/programEngine.ts#L170) | Mifflin-St Jeor + **5 activity levels** + safety floors + 25/35/30/10 split | **the real engine — used only by "Mon Programme"** |
| 2 | [`scan-result.tsx:151` `dailyCalorieGoal`](../src/app/scan-result.tsx#L151) | same BMR, **fixed ×1.45**, age fallback **30**, flat **2000** if body data missing | **duplicate of #1, degraded** |
| 3 | [`nutrition.tsx:51` `GOALS.kcal`](../src/app/nutrition.tsx#L51) | flat **2000** | **duplicate, ignores the profile** |
| 4 | [`healthy-food.tsx:190`](../src/app/healthy-food.tsx#L190) | `/2000` | duplicate |
| 5 | [`scan-result.tsx:208` `mealCalorieScale`](../src/app/scan-result.tsx#L208) | 40 % of the day = "un repas complet" | vs #1's 25/35/30/10 |
| 6 | [`scan-result.tsx:216` `calorieTone`](../src/app/scan-result.tsx#L216) | 35 / 65 / 90 % of #5 | screen-local |
| 7 | [`mealScore.ts:140`](../src/services/nutrition/mealScore.ts#L140) | flat **800 kcal** penalty | **ignores every goal above** |
| 8 | [`scan-result.tsx:262` `burnMinutes`](../src/app/scan-result.tsx#L262) | MET × 3.5 × kg / 200, 70 kg default | single ✅ |

`programEngine` already contains **exactly** the function `dailyCalorieGoal`
is a worse copy of — including the age fallback (35 vs 30), the body-data
fallback (75 kg/170 cm with a `missingBodyData` warning vs a silent flat
2000), and five activity factors instead of one assumed 1.45.

`computeBMR` is also re-implemented inline at
[`scan-result.tsx:162`](../src/app/scan-result.tsx#L162), and `computeBMI` at
[`recommendations.ts:30`](../src/services/recommendations.ts#L30) — both have
a published implementation in
[`programEngine.ts:147`](../src/services/programEngine.ts#L147) and
[`:158`](../src/services/programEngine.ts#L158).

**Single source of truth:** `programEngine`, promoted out of "Mon Programme"
into a `patientTargets` service every screen reads — with an explicit
`source: 'program' | 'profile' | 'population-default'` so the "flat 2000"
case stops being invisible.

---

## 6. Carbohydrate interpretation

**The question:** how many carbs should the day hold, and is this too many?

| # | Site | Rule | Status |
|---|---|---|---|
| 1 | [`programEngine.ts:223`](../src/services/programEngine.ts#L223) | remainder after protein+fat, floor **120 g**, per-meal cap `max(75, 35 %)` | **the real engine** |
| 2 | [`scan-result.tsx:681`](../src/app/scan-result.tsx#L681) | `goal × 50 % ÷ 4` | **duplicate** |
| 3 | [`nutrition.tsx:51`](../src/app/nutrition.tsx#L51) | flat **250 g** | duplicate |
| 4 | [`index.tsx:86` `CARB_GOAL`](../src/app/(tabs)/index.tsx#L86) | flat **250 g** | duplicate |
| 5 | [`healthy-food.tsx:191`](../src/app/healthy-food.tsx#L191) | `/250` | duplicate |
| 6 | [`index.tsx:849` `zoneForGoal`](../src/app/(tabs)/index.tsx#L849) | <60 % "bas" · ≤110 % "normal" · ≤150 % · > | **the only place that says a diabetic is *under* target** |
| 7 | [`mealScore.ts:118`](../src/services/nutrition/mealScore.ts#L118) | > 80 g / > 60 g per meal | **no relation to #1's per-meal cap** |
| 8 | [`advice.ts:105`](../src/services/nutrition/advice.ts#L105) | > 75 g `carb_heavy` | duplicate of #7, different number |
| 9 | [`carbProvenance.ts`](../src/services/nutrition/carbProvenance.ts) | value / floor / unknown | **single ✅ — but only 6 of 12 surfaces call it** |

`programEngine` computes a real per-meal ceiling (`mealCarbCap`) that is
already spike-aware and scales with the day. `scoreMeal` charges a penalty at
80 g and `buildHighlights` at 75 g, neither of which knows that ceiling
exists. And #6 is the only rule in the app that treats *low* carbohydrate as
a deficiency.

**Single source of truth:** the same `patientTargets` service, exposing
`dailyCarbs`, `mealCarbCap` and a `carbZone(value, target)` that a diabetes
app can actually defend — plus `carbProvenance` enforced at the **serializer**
level so no screen can print a raw gram figure by accident.

---

## 7. Hydration interpretation

| # | Site | Rule | Status |
|---|---|---|---|
| 1 | [`micros.ts:225` `waterGoalMl`](../src/services/nutrition/micros.ts#L225) | 35 ml/kg, clamp 1.5–4 L, 2 L default | **single ✅** |
| 2 | [`micros.ts:211` `estimateMealWaterMl`](../src/services/nutrition/micros.ts#L211) | category water fraction × grams | **single ✅** |
| 3 | [`scan-result.tsx:691`](../src/app/scan-result.tsx#L691) | `mealWater / dailyGoal` → the ring % | **interpretation in JSX** |
| 4 | [`scan-result.tsx:1601`](../src/app/scan-result.tsx#L1601) | reminder printed **unconditionally** | **interpretation in JSX** |

This is the **cleanest domain in the app** — the two computations are
centralised and used exactly once. It is still listed because the *meaning*
of the number (a meal's contribution vs the patient's hydration status) and
the decision to always nag are inline in the view, which is how #3 came to be
captioned *"de vos besoins en eau"*.

It is the proof that centralising the computation is not enough: the
**interpretation** has to move too, or the screen invents one.

---

## 8. Score wording and palette

| # | Site | Owns |
|---|---|---|
| 1 | [`mealScore.ts:148`](../src/services/nutrition/mealScore.ts#L148) | Excellent / Bon / Modéré / Faible at 85/70/50 |
| 2 | [`mealScore.ts:82`](../src/services/nutrition/mealScore.ts#L82) + [`:90`](../src/services/nutrition/mealScore.ts#L90) | graphic colours + readable twins |
| 3 | [`mealScore.ts:74` `GRADE_COLORS`](../src/services/nutrition/mealScore.ts#L74) | a **second** five-colour palette |
| 4 | [`dayScore.ts:64`](../src/components/journal/dayScore.ts#L64) | **a third palette**, mixing #2's `#37B24D` with #3's `#17A24A` |
| 5 | `panel-x7k42m/app.js` | a fourth (green/amber/red at 70/45) |
| 6 | i18n `analysis.mealGrade` / `analysis.scoreTitle` / `analysis.giScoreScope` | **three names** for one indicator |

Four palettes and three names for one concept, with the A/"Bon" overlap at
80–84 falling out of #1 and #3 disagreeing.

**Single source of truth:** the `mealVerdict` return value from §3 carries its
own label key and palette, and nothing else defines one.

---

## 9. Where the interpretations are consumed

The reason the same rules keep getting rewritten is that **there is no
consumable interpretation object** — only raw numbers on `NutritionResult`.
Every consumer therefore re-derives:

| Consumer | Re-derives |
|---|---|
| `scan-result.tsx` | score, grade, GL band, GI tone, calorie goal, calorie tone, carb split, burn, hydration %, completeness |
| `(tabs)/index.tsx` | meal slot ×2, carb goal, carb zone |
| `nutrition.tsx` | all five daily goals, slot assignment |
| `LastMealCard.tsx` | score, evidence gate, badge selection |
| `menu-scan.tsx` | score, evidence gate, GI band |
| `barcode.tsx` | score (without GI), evidence gate |
| `foods.tsx` | GI band, high-GI warning |
| `healthy-food.tsx` | six daily references |
| `day.tsx`, `journal.tsx`, `program-day.tsx`, `timeline.tsx` | nothing — they print raw values, which is the other half of the problem |
| `report.tsx`, `weeklyReport.ts`, `panel/app.js` | their own bands, their own carb formatting |

---

# Refactoring plan

**Goal: no screen computes an interpretation. Every screen renders one.**

The plan is deliberately *behaviour-preserving first*. Every phase below
either changes nothing a patient sees, or changes exactly one thing that has
already been reported as a contradiction — never both in the same phase.

## The target shape

```
src/services/nutrition/interpret/
  index.ts          re-exports; the ONLY import path a screen may use
  glycemic.ts       giBand · glLoad · giAction      → §1 §2
  quality.ts        mealVerdict · dayVerdict        → §3 §8
  timing.ts         mealMoment                      → §4
  targets.ts        patientTargets · carbZone       → §5 §6
  hydration.ts      hydrationVerdict                → §7
  format.ts         carbText/carbUnit re-export, and a `nutrientText`
                    serializer no screen may bypass
```

Every function returns a **verdict object**, never a bare number:

```ts
interface Verdict<B extends string> {
  band: B;
  labelKey: string;        // i18n key — never a rendered string
  color: string;           // graphic
  textColor: string;       // ≥4.5:1
  assumed: boolean;        // computed from a substituted value
  source: 'measured' | 'database' | 'estimated' | 'population-default';
}
```

`assumed` and `source` are the two fields whose absence produced eight of the
S1 findings. They are the point of the refactor, not decoration.

## Phase 1 — Freeze the current behaviour (no product change)

Extend the golden suites so every duplicate is **pinned as it is today**,
including the ones known to be wrong. Nothing can be consolidated safely
until the divergences are executable facts.

- `tests/domain/interpretationInventory.golden.test.ts` — asserts, for a
  fixed set of inputs, what each of the 47 sites currently answers. GI 67
  must be recorded as *both* `medium` and `high`; 17:00 as *both* `dinner`
  and `snack`. **Known-bad, pinned on purpose**, in the discipline already
  used for `nutritionScience.golden.test.ts`.
- Run the lint ratchet; record the new baseline.

**Exit criterion:** 100 % of the sites in §1–§8 are covered by an assertion.
**Patient-visible change: none.**

## Phase 2 — Create the module, delegate the already-correct callers

Write `interpret/` with the canonical rules **copied verbatim** from today's
canonical sites (`giBand`, `glycemicLoad`, `scoreMeal`, `mealGrade`,
`qualityEvidence`, `programEngine`, `waterGoalMl`). Then repoint only the
callers that **already agree**: `GlycemicBar`, `healthy-food`, `menu-scan`,
`MealGradeBar`.

**Exit criterion:** the Phase-1 fixtures are byte-identical.
**Patient-visible change: none.**

## Phase 3 — Formatting, where correctness is unambiguous

Route every carbohydrate render through `format.ts`. The six surfaces that
print raw grams (`day`, `journal`, `program-day`, `report`, `weeklyReport`,
the doctor panel) start honouring `carbProvenance`.

This is the only phase that fixes findings without a product decision:
**S1-7** closes entirely. A minimum stops being printed as a total on the
clinician surfaces.

**Exit criterion:** grep finds no `Math.round(...carbohydrates)` outside
`format.ts`. **Patient-visible change: `≥` appears on six more screens — the
already-approved behaviour, extended.**

## Phase 4 — One meal-moment rule

`timing.mealMoment` becomes the only hour map for food. Adopt
**`bolusEngine.guessMealTime`'s windows verbatim** as the canonical map, so
the display layer converges on the clinical one rather than the reverse —
`bolusEngine` itself is not touched, and the RU-11 freeze holds.

Sites #1–#6 and #8 delegate. `inferred: true` is surfaced wherever a slot was
guessed rather than confirmed.

Closes **S1-6** and the home screen's internal disagreement.
**Patient-visible change: untyped meals move slot on some screens. Requires
sign-off** — it rewrites how history is grouped, though never what is stored.

> The 16:00–18:00 gap in `guessMealTime` is inherited as-is and recorded as an
> open clinical question. Consolidating first, then asking the question once,
> is the point.

## Phase 5 — One glycemic interpretation

`glycemic.ts` owns bands, the GL formula, the assumed-GI flag and
`giAction(gi)` — the function that decides whether a post-meal check is
warranted. Sites #5–#11 delegate.

**This phase forces the decision that has been deferred since Step 22A: is
"high GI" 65 or 70?** It cannot be consolidated without answering. The audit's
recommendation is to keep **70 for classification** (published) and expose
**65 as a separate `giAction` threshold** (warn earlier is the safe
direction) — so both current behaviours survive under two honest names
instead of one contradictory one.

Closes **S1-2** (via `assumed`), **S1-3**, **S3-3**.
**Patient-visible change: the GI wording aligns across six surfaces. Requires
sign-off on the 65/70 split.**

## Phase 6 — One quality verdict

`mealVerdict` replaces the five recomputation sites. It carries the evidence
gate, so no consumer can bypass it — including the doctor panel, which is
served the verdict instead of the raw `meal_score`. `buildHighlights` adopts
`scoreMeal`'s thresholds so a nutrient cannot be "good" and "not good" at
once. `dayScore` stops borrowing the meal vocabulary.

`modelVersion` is stamped, so a stored verdict is never rendered beside a live
one without saying so.

Closes **S1-1**, **S2-1**, **S2-2**, **S2-4**, **S2-6**, **S2-8**, **S2-9**.
**Requires sign-off: the A/"Bon" overlap and the day-badge wording are product
decisions, not refactors.**

## Phase 7 — One set of patient targets

`programEngine` is promoted to `targets.ts` and every screen reads it.
`dailyCalorieGoal`, the three flat `GOALS` blocks, the inline `computeBMR` and
the inline BMI all delete. `source: 'population-default'` makes the "flat
2000" case visible instead of implied by the word "vos".

Closes **S1-4**, **S1-5**, **S2-3**, **S2-5**.
**This is the largest patient-visible change in the plan** — every daily
target on every screen becomes the patient's real one. It must ship alone,
behind its own review, and it depends on the RU-3 answer for what a diabetic
carb target *means* (a ceiling, not a goal to complete).

## Phase 8 — Hydration and the long tail

`hydrationVerdict` moves the ring semantics and the reminder condition out of
JSX. `barcode.tsx` stops calling `scoreMeal` without a GI. `aiLogger` stops
inventing GI 50 and marks it `assumed` instead. `foods.ts`'s raw French
warning becomes a `warn:` key.

Closes **S1-8**, **S2-10**, **S4-1**.

## Ordering rationale

| Phase | Risk | Product decision needed | Findings closed |
|---|---|---|---|
| 1 Freeze | none | no | 0 |
| 2 Module | none | no | 0 |
| 3 Formatting | low | no | 1 |
| 4 Timing | medium | **yes** | 2 |
| 5 Glycemic | medium | **yes (65 vs 70)** | 3 |
| 6 Quality | high | **yes** | 7 |
| 7 Targets | high | **yes (RU-3)** | 4 |
| 8 Tail | low | no | 3 |

Phases 1–3 can start immediately and change nothing a patient sees. Phases
4–7 each need one answer before they can begin, and each of those answers is
a nutrition or product call — which is exactly the outcome this audit was
meant to produce: **the remaining work is no longer engineering guesswork, it
is four decisions and a mechanical migration.**

## What this plan deliberately does not touch

- `bolusEngine`, IOB, dose computation, RU-11 — frozen. Phase 4 moves the
  display layer *toward* it, never it toward the display layer.
- `scoreMeal`'s formula, weights and thresholds — Phase 6 relocates the call
  sites, it does not re-weight anything. The formula redesign remains
  `docs/SCORING-MODEL-PROPOSAL.md`, unstarted and undecided.
- Database, migrations, Edge Functions, sync, identity.
- Stored history: no `meal_score`, no `result` JSONB is ever recomputed. Old
  rows keep their number and gain a version stamp.
