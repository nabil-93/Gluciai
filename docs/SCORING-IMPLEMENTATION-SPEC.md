# Nutrition scoring — implementation specification

**Status: specification only. No code, formula, threshold, weight or string was
changed to produce this document.** It is the last design artefact before
Step 22D; after it, 22D is implementation and nothing else.

Direction accepted: **Option B — glycemic suitability**, A–E removed
([SCORING-IDENTITY-DECISION.md](SCORING-IDENTITY-DECISION.md), challenge round).

## Implementation status — where 22D actually stands

Recorded here (Phase 3's documentation half, which needs no sign-off) so the
spec cannot be read as describing the code when it does not.

| Phase | Status | Gate |
|---|---|---|
| **1** — remove A–E | **EXECUTED, THEN REVERTED** by product decision. The letter is in the app today; `mealGrade`'s boundaries and `scoreMeal` are unchanged, and the letter stays gated by `qualityClaimSupported`. The 80–84 "A" vs *"Bon"* overlap it closed is **reopened** → **D10** | product decision (taken) |
| **2** — interim naming, demotion | **COMPLETE.** `analysis.scoreTitle` (*Repère GluciAI*), the word leads the figure, the "not a clinical measure" sentence is on the analysis card, the meal PDF and the panel footnote | none |
| **3** — documentation | **COMPLETE (this table).** | none |
| **3** — band unification | **BLOCKED.** Four band sets still disagree: word 85/70/50 · letter 80/65/50/35 · barcode 70/50 · panel 70/45 | **RU-3 D10** |
| **4** — formula change, final rename | **BLOCKED.** Moving sodium and energy out of the composite, adopting *Aptitude glycémique*, adding `score_model` | **RU-3 D5** + a new *"remove sodium's weight"* decision |
| **5** — rounding | **BLOCKED.** NUTR-B4 / P8-004 | dose-input gated, RU-11 |

**Phase 3's fixture** — *"a fixture asserting exactly one band set exists"* —
cannot be written until D10 collapses the sets. Writing it now would assert a
state that does not exist.

**The governing constraint of this spec:** the final name is only truthful once
sodium and energy have left the composite, and that is a formula change gated on
RU-3. So the spec defines **two states** — an interim state that claims nothing
and needs no sign-off, and a final state that arrives with the formula change.
Renaming to "glycemic" while sodium is still inside would create a fresh
name/formula mismatch, which is the exact defect being closed.

---

## 0. Surface inventory — everything that shows the score today

Verified in source. **Seven surfaces, four different band sets.** Any spec that
misses one leaves a contradiction behind.

| # | Surface | Shows | Bands in use |
|---|---|---|---|
| 1 | `scan-result.tsx` analysis card | ring `NN/100` + word + reasons | word 85/70/50 |
| 2 | `scan-result.tsx` → `MealGradeBar` | **A–E strip** + note | letter 80/65/50/35 |
| 3 | `scan-result.tsx` → meal PDF | `NN/100` + word + `Indice GluciAI : X` | both |
| 4 | `LastMealCard.tsx` (home) | `NN/100` + word + one reason | word |
| 5 | `barcode.tsx` | `NN/100 · word` + verdict sentence | **70/50** |
| 6 | `menu-scan.tsx` | ranking, "best choice" badge, per-dish score | word colours |
| 7 | **`public/panel-x7k42m/app.js:1084`** — doctor/admin web panel | badge `NN/100` | **70/45** |

Plus `journal/dayScore.ts`, which is not a meal score but reuses the **meal word
bands** over a blended day figure.

**Correction to the identity document:** the periodic PDF report
(`reportHtml.ts`) carries no score — but the **doctor/admin panel does**. Any
statement about "the doctor surface" must name which one.

---

## 1. Final public name

Two states. The switch happens in Phase 4, never before.

| | Interim (Phases 1–3) | Final (Phase 4+) |
|---|---|---|
| **fr** | `Repère GluciAI` | `Aptitude glycémique` |
| **en** | `GluciAI indicator` | `Glycemic suitability` |
| **de** | `GluciAI-Indikator` | `Glykämische Eignung` |
| **ar** | `مؤشر GluciAI` | `الملاءمة الجلايسيمية` |

**Why an empty interim name is the right interim name.** "Repère GluciAI" claims
nothing about what is measured. That was fatal as a *final* name (option D2) and
is exactly right while the formula is under review: it stops the product
asserting something it cannot support, without asserting something new that the
formula would also fail to support.

**Key rename:** `analysis.healthScore` → `analysis.scoreTitle`. The old key must
be **deleted**, not aliased, so no surface can keep rendering "Score santé".

## 2. Subtitle

Rendered under the title on surfaces 1, 3 and 7.

| | Interim | Final |
|---|---|---|
| **fr** | `Indicateur propre à l'application` | `Effet attendu sur votre glycémie` |
| **en** | `The app's own indicator` | `Expected effect on your glucose` |
| **de** | `App-eigener Indikator` | `Erwartete Wirkung auf deinen Blutzucker` |
| **ar** | `مؤشر خاص بالتطبيق` | `الأثر المتوقع على سكر دمك` |

**Constraint:** the German string is the longest in every locale set in this
project and has overflowed before. Both German variants must be measured at
375 px before merge; the subtitle wraps to two lines rather than truncating.

## 3. Tooltip / explanatory note

Replaces `analysis.mealGradeNote`, which dies with the A–E strip. Rendered as
the foot of the score card.

**Interim — fr:**
> Repère calculé par l'application à partir de ce repas. Il pèse l'index
> glycémique, le sucre, les glucides, les fibres, les protéines, le sodium et
> les calories. Ce n'est pas une mesure clinique ni un score nutritionnel
> officiel.

**Interim — en:**
> Indicator computed by the app from this meal. It weighs the glycemic index,
> sugar, carbohydrate, fibre, protein, sodium and calories. It is not a clinical
> measure and not an official nutritional score.

**Final — fr:**
> Estime l'effet attendu de ce repas sur votre glycémie, à partir de son index
> glycémique, de ses glucides, de son sucre et de ses fibres. Il ne juge ni la
> qualité des matières grasses ni l'équilibre nutritionnel global. Ce n'est pas
> une mesure clinique.

**Final — en:**
> Estimates this meal's expected effect on your glucose, from its glycemic
> index, carbohydrate, sugar and fibre. It does not judge fat quality or overall
> nutritional balance. It is not a clinical measure.

**Both must contain the sentence "not a clinical measure".** That is the single
non-negotiable string in this document.

## 4. Doctor report wording

**4a — the periodic report (`reportHtml.ts` / `reportStats.ts`): the score must
NOT be added.** It is not there today and must stay out. A clinician cannot
interpret an app-specific composite with no published basis, and averaging it
over a period compounds the per-plate portion dependence.

**4b — the doctor/admin panel (`public/panel-x7k42m/app.js`): keep the number,
label it, unify its bands.** Today it renders a bare `NN/100` badge with its own
70/45 colour cut and no explanation at all — the least-qualified appearance of
the score anywhere in the product, on the surface where it is read by a
clinician.

Required: a column header carrying the current name, and a footnote on the meals
table:

> **fr** — Repère calculé par l'application à partir des valeurs du repas ; ni
> une mesure clinique, ni un score nutritionnel validé.
> **en** — Indicator computed by the app from the meal's values; neither a
> clinical measure nor a validated nutritional score.

The panel's 70/45 cut must adopt whichever single set D10 selects. **This spec
does not choose it.**

## 5. Meal PDF wording

Keep: calories, macros, GI, GL, the Step 22B provenance sentence, the Step 22C
qualifiers, the food table, the warnings.

Remove: the `Indice GluciAI : X` line and its note (Phase 1).

The score line keeps the number and the word, and gains the §3 tooltip text in
the small print. The existing footer (`analysis.pdfFooter`) already says the
values are estimates to be interpreted by a professional; it must additionally
carry the "not a clinical measure" sentence, because the footer is what a
clinician reads if they read nothing else.

## 6. Home screen wording (`LastMealCard`)

The card shows `NN/100` + word + one reason. **Change: reorder, do not remove.**
The word leads at the current score's type size; the number becomes secondary
beside it; the reason stays. The title above it uses the §1 name.

No new string is needed beyond the name — `mealScore.label*` already supplies
the word.

## 7. Barcode wording

`barcodePage.verdictQ` currently reads *"Convient au diabète ?"* — a
disease-suitability claim, which is precisely the claim Option C was rejected
for. It must change:

| | Interim and final |
|---|---|
| **fr** | `Effet attendu sur la glycémie` |
| **en** | `Expected effect on glucose` |
| **de** | `Erwartete Wirkung auf den Blutzucker` |
| **ar** | `الأثر المتوقع على سكر الدم` |

`verdictGood` / `verdictOkay` / `verdictAvoid` keep their wording — they already
speak about glycemia ("Bon choix pour votre glycémie") — but the ✅/⚠️/❌ and the
"À éviter" phrasing are a **recommendation**, and their 70/50 cut is one of the
four band sets. Both are gated on D10.

## 8. Menu scan wording

The screen ranks dishes by the number and awards a "best choice" badge. The
ranking is the score's most defensible use — a *relative* comparison of dishes
within one menu does not depend on the absolute scale being validated.

Change: the badge label must stop implying a nutritional verdict and state the
comparison instead — *"meilleur pour la glycémie"* / *"best for glucose"* —
and the per-dish `NN/100` follows §6's demotion.

## 9. Daily score wording

`dayScore` blends time-in-range with mean meal quality and then borrows the
**meal** words. Two different quantities must not share one vocabulary.

Required: its own label set, distinct from `mealScore.label*`, and a caption
naming its two inputs. The blend weights themselves are **D13** and are not
specified here.

Until D13 is answered, the day badge keeps its current wording and gains only
the caption naming its inputs.

---

## 10–16. The specific questions, answered

| # | Question | Answer |
|---|---|---|
| **10** | Does the numeric score remain? | **Yes**, on all surfaces, but **demoted**: the word and the reasons lead, the number is secondary. It also remains the internal sort key for menu-scan. Rationale: the reachable range is [19, 100] and the rules are cliff-edged, so two significant figures overstate the precision — but the number is what five surfaces already use and what makes ranking possible |
| **11** | Does A–E disappear? | **Yes, completely, in Phase 1.** `MealGradeBar.tsx` deleted; `mealGrade()` and `GRADE_COLORS` deleted with it; four i18n keys per locale removed. It exists on one screen, adds no information, and its removal closes the 80–84 letter/word contradiction and the per-plate "food grade" illusion |
| **12** | Do colours change? | **The score's three-tier palette stays** (graphic + readable twin, both already WCAG-checked). `GRADE_COLORS` is deleted. The panel's independent 70/45 colour cut is unified under D10. No new colour is introduced |
| **13** | Do the reasons stay unchanged? | **Yes — they are the most defensible output in the system** and the part this spec most wants to promote. Two exceptions: `mealScore.balanced` ("Repas équilibré pour votre glycémie") asserts balance the model does not assess and must be reworded in Phase 2; and in Phase 4 the `salty` and `caloric` reasons leave the composite's reason list and become independent flags |
| **14** | Do GI and GL stay visible? | **Yes, unchanged.** They are reference-classified values and the only published metrics on the screen. The Step 22C coverage and scope captions stay with them |
| **15** | Do calories stay outside the score? | **They are inside today and leave in Phase 4.** The calorie dial remains the largest element of the card, so no information is lost — only an invented −8 weight |
| **16** | Does sodium stay outside the score? | **Same: inside today, leaves in Phase 4.** `high_sodium` already exists as an independent attention point (`advice.ts:108`), so again only the invented weight is lost. **This fact is what decided Option B over C** |

## 17. Historical scores after migration

**They are never recomputed and never rewritten.** This is the rule Steps 16,
22A and 22B all held to, and it holds here.

Two facts make this cheap:

- **`meal_score` exists only inside the `result` JSONB.** There is no
  `meal_scans.meal_score` column — verified across every migration. So there is
  **no schema migration and no backfill**, in either direction.
- Every stored meal keeps the number it was shown when the patient saved it.

What does change at Phase 4 is the **meaning**, so stored values from before and
after are not comparable. Required handling:

1. **Stamp new results** with a model version (e.g. `score_model` on
   `NutritionResult`). Absent = legacy model 1. No migration: absence is the
   legacy marker, exactly as Step 22B treated an absent provenance map.
2. **Never mix models in an aggregate.** If a day contains meals of both models,
   the day badge is **withheld** rather than averaged — the same "withhold
   rather than invent" rule Step 22A established for unsupported plates.
3. **A reopened legacy meal shows its stored number with the legacy label**, and
   a short note that it was computed with an earlier version. It is not
   re-scored on read.

## 18. Backward compatibility

| Concern | Rule |
|---|---|
| Legacy rows with no `score_model` | Treated as model 1. Never upgraded, never re-scored |
| Legacy rows with no `meal_score` at all | Already handled — the field is optional today |
| The doctor/admin panel | Reads `result.meal_score` directly and must tolerate both models; until it can distinguish them it shows the number with the §4b footnote and no colour claim |
| Deleted i18n keys | Removed from all four locales in the same commit as their last consumer. A key must never outlive its usage, and no key may be silently reused for a different meaning |
| Fixtures | `mealGrade.golden.test.ts` is not deleted silently: it moves to a "removed by decision" record in the known-bad baseline, with the reason and the decision reference |
| Offline queue | Unaffected — `meal_score` travels inside `result`, which is pushed whole |
| Rollback | Phases 1–3 are pure presentation and revert cleanly. Phase 4 is not reversible for meals saved under model 2, which is why it is last and gated |

---

## Migration plan — exact order

Each phase states what it needs, what it must not touch, and how it is verified.
**No phase is performed by this document.**

### Phase 1 — remove A–E

> **SUPERSEDED BY A PRODUCT DECISION — the letter was removed as specified
> here, then RESTORED. Do not re-execute this phase.**
>
> The current tree renders `MealGradeBar` again (`scan-result.tsx`), and
> `mealScore.ts` carries the record at its `mealGrade` doc comment: *"REMOVED in
> Step 22D Phase 1, RESTORED by product decision."*
>
> The restoration is **visual only**: `mealGrade`'s 80/65/50/35 boundaries and
> `scoreMeal` are byte-for-byte unchanged, and the letter stays gated by
> `qualityClaimSupported` — an unsupported plate is still awarded no letter.
>
> Two consequences for later phases, neither resolved here:
> - The **80–84 overlap** this phase was meant to close (an "A" the card calls
>   *"Bon"*) is **still open**, and returns to **D10**.
> - D10's band unification must now be decided knowing the letter is a product
>   commitment rather than a candidate for deletion.
>
> `mealGradeNote` was also rewired to describe the letter as the A–E form of
> *"Repère GluciAI"*, so Phase 2's interim naming and the restored letter now
> coexist by design.

- **Needs:** nothing. No sign-off, no formula, no threshold.
- **Does:** delete `MealGradeBar.tsx`, `mealGrade()`, `GRADE_COLORS`, the strip
  from the analysis screen and the `Indice GluciAI` line from the PDF; remove
  four i18n keys per locale; move the `mealGrade` fixtures to the removed-by-
  decision record.
- **Must not touch:** `scoreMeal`, any number, any other surface.
- **Verifies:** unit/golden green with the grade fixtures relocated; Demo Mode in
  fr/en/de/ar, RTL, 375 px; PDF captured and checked for the removed line.
- **Closes:** the 80–84 letter/word contradiction; the food-grade illusion.

### Phase 2 — interim naming and demotion
- **Needs:** nothing (no threshold moves).
- **Does:** `analysis.healthScore` → `analysis.scoreTitle` with the interim name;
  add the subtitle and the §3 interim tooltip; reorder the analysis card and
  `LastMealCard` so the word and reasons lead; reword `mealScore.balanced`;
  change `barcodePage.verdictQ`; add the §4b panel footnote and column label;
  add the "not a clinical measure" sentence to the PDF footer; add the day-badge
  caption.
- **Must not touch:** any band, any weight, any number.
- **Verifies:** as Phase 1, plus the panel rendered locally, plus a check that
  `healthScore` no longer resolves in any locale.

### Phase 3 — documentation and band unification
- **Needs:** **D10** for the band unification half only.
- **Does:** update both ledgers and this spec's status; then, once D10 is
  answered, collapse the four band sets (word, letter-already-gone, barcode
  70/50, panel 70/45) onto the single set D10 selects.
- **Must not touch:** the composite formula.
- **Verifies:** a fixture asserting exactly one band set exists in the codebase.

### Phase 4 — formula change, final rename
- **Needs:** **RU-3 sign-off** on D5, on a new decision *"remove sodium's weight
  from the composite"*, and ideally on D1/D3/D4/D6/D8 in the same round.
- **Does:** move sodium and energy out of `scoreMeal` into independent flags;
  adopt the final name, subtitle and tooltip; add `score_model`; apply §17's
  mixed-model rule.
- **Must not touch:** stored meals.
- **Verifies:** the full gate, plus a fixture proving no stored score was
  rewritten and that a mixed-model day withholds its badge.

### Phase 5 — independent of all the above
- **NUTR-A11**: the doctor report prints a carbohydrate floor as a total. A
  provenance defect with a known fix, needing no specialist. **Step 23.**

---

## What this spec deliberately does not decide

The composite's weights and thresholds (RU-3 D1–D20), which band set survives
(D10), the day-badge blend (D13), and the deepest open question of all: whether
a **carbohydrate-weighted mean of GI values — many of them category estimates —
describes a mixed plate at all.** If a specialist rejects that assumption,
Option B falls with it and the components-only presentation (D3) becomes the
correct answer. That question belongs in RU-3 before Phase 4.
