# Scoring identity — final architecture decision

**Status: recommendation only. No code, formula, threshold or weight was changed
to produce this document.** It answers one question that RU-3 deliberately left
open: *what is this number supposed to be?* Everything here rests on facts
already pinned by fixtures — see `tests/domain/nutritionScience.golden.test.ts`
and [RU3-NUTRITION-DECISIONS.md](RU3-NUTRITION-DECISIONS.md).

---

## 0. What the system measures today, stated plainly

| Rule | Is it about glucose? | Is it about general health? |
|---|---|---|
| GI −22 / −10 | **yes, directly** | indirectly |
| sugar −22 / −10 | **yes** | yes |
| carbohydrate −15 / −8 | **yes** | no |
| fibre +5 / −6 | **yes** | yes |
| protein +5 | weakly | yes |
| **sodium −8** | **no** | yes — blood pressure |
| **energy −8** | **no** | yes — weight |
| fat, saturated fat | — | **absent entirely** |

Six of the eight rules are glycemic. Two — sodium and energy — are not glycemic
at all, and they are the two that make the "glycemic" label imprecise. Fat is
the hole that makes the "health" label indefensible.

**Two facts that decide most of what follows**, both verified in the source:

1. **The letter A–E exists on exactly one screen** — the meal-analysis card and
   its PDF (`MealGradeBar` is imported by `scan-result.tsx` and nothing else).
   The number 0–100, by contrast, drives **five** surfaces: the analysis ring,
   the home recap card, the barcode verdict, the **menu-scan ranking** (dishes
   are sorted by it and a "best choice" badge is awarded from it) and the
   journal day badge.
2. **The periodic doctor report already contains neither.** `reportHtml.ts` and
   `reportStats.ts` carry glucose statistics, insulin, carbohydrate, sugar and
   activity — no score, no letter. Only the *meal* PDF carries them.

---

## 1. Option A — a true Health Score

| | |
|---|---|
| **Purpose** | Rate the overall nutritional quality of a meal, for anyone |
| **Target users** | The general public; a diabetic patient would be one case among many |
| **Scientific coherence** | **High if built properly** — established public front-of-pack models define exactly how this is done, and they are the yardstick any reviewer would apply |
| **Consistency with current formulas** | **Near zero.** It is a rewrite, not an adjustment |

**Advantages.** Broadest usefulness; the easiest concept for a patient to grasp;
comparable to labels they already see on packaging.

**Disadvantages.**
- Requires **saturated fat**, which exists nowhere in this codebase — a provider
  change, a `product_catalog` migration, and a field the **Moroccan internal
  dataset does not have for any dish**. The score would be unavailable exactly
  where this app is used most.
- Requires **free/added sugars**, also not read today; total sugars penalise
  plain yoghurt like a dessert.
- Requires a **per-100 g** framing to be comparable, which stops it answering
  "was this meal a good idea?" — the actual question of the analysis screen.
- Duplicates a **regulated** metric with a private imitation. Step 16 already
  had to retreat from exactly this (NUTR-A1); Option A walks back into it.
- Highest evidence bar of the four, and the least relevant to why a patient
  opened this app.

**Verdict:** the most expensive option and the least aligned with the product.

---

## 2. Option B — a Glycemic Suitability Score

| | |
|---|---|
| **Purpose** | How fast, and how much, will this plate move my glucose? |
| **Target users** | Type 1, type 2, gestational and pre-diabetic patients |
| **Scientific coherence** | **Good in ingredients, still ours in composition.** GI and GL classifications are standard; no published consensus defines a per-meal composite from them |
| **Consistency with current formulas** | **Six of eight rules fit directly. Two do not** |

**Advantages.** Every glycemic rule becomes defensible exactly as written; no
data-model change, no migration, no provider work; stored scores keep their
meaning; the name matches the app's reason to exist.

**Disadvantages.**
- **Sodium and energy would have to leave the formula** — they are not glycemic.
  So Option B is *not* the zero-change option it appears to be: adopting the
  name while keeping those two rules creates a **new** mismatch between label and
  arithmetic, which is the precise defect this whole exercise is closing.
  Removing them changes every stored score.
- Says nothing about **cardiovascular risk**, which is the leading cause of death
  in diabetes — a patient could read "glycemically suitable" as "fine for me".
- Two numbers named for glycemia (this, and the GL already on the same card)
  invite confusion about which one to act on.

**Verdict:** scientifically the tidiest, but it buys that tidiness by throwing
away two rules that genuinely matter to the user — and it cannot be adopted
without changing the formula.

---

## 3. Option C — a Diabetes Meal Suitability Score

| | |
|---|---|
| **Purpose** | How suitable is this meal for someone managing diabetes — glucose response first, plus the comorbidity factors diabetes care actually tracks |
| **Target users** | The same patients as B |
| **Scientific coherence** | **Medium-high in intent; the weighting is still ours.** Every input is individually supported and individually relevant; their combination is not published |
| **Consistency with current formulas** | **Eight of eight rules fit.** Nothing has to be removed |

**Advantages.**
- **Sodium and energy stop being anomalies and become the point**: blood
  pressure and weight are core to diabetes management, and this app already
  tracks weight, activity, insulin and glucose. The name finally matches both
  the formula *and* the product.
- **Shippable today** with no migration, no provider work and no formula change
  — the only work is naming and wording.
- It can **declare its own gap** honestly: *"weighs glucose response, sodium and
  energy; does not assess fat quality"*. That converts the saturated-fat hole
  from a hidden defect into a named roadmap item.

**Disadvantages.**
- A broader claim carries a **higher evidence bar** than B. "Suitable for
  diabetes" while ignoring fat quality is a real criticism, because
  cardiovascular disease is the leading cause of death in this population.
- The word "suitability" can still be misread as clinical approval, so the
  disclaimer has to do real work.
- The composite weighting remains unpublished — this option does not fix that,
  it only stops the name overstating it.

**Verdict:** the honest description of what the code already does.

---

## 4. Option D — the alternatives worth naming

**D1 — "Glycemic impact".** Rejected: that is essentially glycemic load, which
the same card already shows as its own number. Two things with one name.

**D2 — "GluciAI guide/marker".** Honest that it is the app's own, but says
nothing about *what* it measures. It replaces an overstatement with an
emptiness.

**D3 — no composite at all.** Show the components with their own standard bands
— GI, GL, carbohydrate, sugar, fibre, sodium, energy — and drop the single
number entirely.
*Advantages:* the only option with **zero unsupported weighting**; every figure
shown would be either reference data or a standard classification; nothing left
to defend.
*Disadvantages:* loses the glanceable summary that makes the screen usable at a
glance; **breaks the menu-scan ranking and the "best choice" badge**, which sort
by the number; empties the journal day badge; and pushes the interpretation work
onto the patient, who is the person least equipped to do it.
*Verdict:* intellectually the strongest and practically the worst. Worth
recording as the honest floor against which the others are measured.

---

## 5. The GluciAI Index A–E — remove it

**Recommendation: remove completely.** Not redesign, not simplify.

The case:

1. **It adds no information.** It is `mealGrade(score)` — the same number cut at
   80/65/50/35. Pinned.
2. **Its bands were never given a meaning.** RU-3 asked what an A communicates;
   the answer is "no penalty was charged", which is not a message.
3. **It contradicts the word bands.** 82 is grade **A** and the word **"Bon"**,
   on the same card. Deleting the letter closes that contradiction outright.
4. **The shape is the problem, not the name.** A five-letter coloured strip is
   the visual grammar of a regulated front-of-pack label. Step 16 renamed it and
   the confusion survived, because patients read the *form*. Only removal fixes
   it.
5. **It is per plate**, so it looks like a grade for the food while being a
   grade for the serving.
6. **It is cheap to remove**: one screen and one PDF line, and it is the only
   consumer.

### Exactly how the UI looks without it

**Analysis screen.** The dark hero currently runs: photo → **GluciAI strip
(A B C D E, one highlighted) + its explanatory note** → calories/score card.
Removing it deletes that middle block; the hero goes photo → calories/score
card. The score ring, its word ("Excellent"), and the reasons underneath are
unchanged and already carry everything the strip carried. The card gets shorter
by roughly 90 px, which is a gain on a 375 px screen.

**Step 22A's unrated state simplifies.** Today an unsupported plate shows a
dimmed strip plus *"Aucune lettre attribuée"* alongside the "—" ring. Without
the strip there is one unrated state instead of two.

**Meal PDF.** One line disappears (`Indice GluciAI : A`) plus its note. The
score line stays.

**Code.** `MealGradeBar.tsx` is deleted; `mealGrade()` and `GRADE_COLORS` become
dead and go with it; four i18n keys per locale become unused. The `mealGrade`
fixtures move to a "removed by decision" record rather than being silently
deleted. **No other surface is touched, because no other surface uses it.**

---

## 6. Is 0–100 alone sufficient?

**Relative to the letter: yes, entirely.** The number is strictly more
informative, and it is what five surfaces already use.

But 0–100 has two problems of its own, and neither is fixed by keeping the
letter:

- **The scale lies about its resolution.** The reachable range is **[19, 100]** —
  the six penalties total 81 points — so the bottom fifth never occurs. A score
  "out of 100" that cannot go below 19 implies a precision the model lacks.
- **A number out of 100 reads as a measurement.** Six threshold rules with
  cliff edges — 0.1 g of sugar moves a plate 12 points and one letter — do not
  warrant two significant figures.

**The most honest presentation is the one the code already produces and the
screen already shows second: the word plus the reasons.** *"Modéré — IG modéré
(70) · Bon apport en protéines"* is checkable, actionable, and claims exactly as
much as the model can support. If any element should be demoted, it is the
number; if any should be promoted, it is the reasons.

That is a presentation decision for Step 22D, not a formula decision — but it
should be taken together with this one.

---

## 7. Should the score appear in the doctor report?

**In the periodic doctor report: no. It is not there today, and it should stay
out.**

- A clinician has no way to interpret "87/100" from an app-specific heuristic
  with no published basis; it competes for attention with time-in-range, the
  estimated HbA1c and the carbohydrate/insulin pattern, which *are*
  interpretable.
- Averaging it over a period compounds the per-plate portion dependence: two
  patients eating identically in different serving sizes get different means.
- Adding an unvalidated composite to a medical document is the kind of claim
  that has to be defended, and it cannot be.

**In the meal PDF (the sheet a patient shares from one scan): keep the
components, and either drop the composite or bound it in wording.**

The macros, GI, GL, provenance line and food list are genuinely useful to a
clinician. If the score is kept, the note under it must say more than the
current *"not an official Nutri-Score"* — it must say it is **not a clinical
measure**, e.g.:

> *App-computed indicator of this meal's suitability for diabetes management,
> from the values shown above. It is not a clinical assessment and not a
> validated nutritional score.*

**Independent of this decision:** the report's real blocker is **NUTR-A11** —
`reportStats.ts` still sums `result.carbohydrates` with no provenance check, so
a carbohydrate **floor prints as a total** in the document a doctor reads. That
is a defect with a known fix and it needs no specialist. It should be fixed in
Step 23 regardless of which option is chosen here.

---

## 8. Recommendation

**If I were shipping this application, I would choose Option C — a Diabetes Meal
Suitability Score — with the A–E letter removed.**

Because it is the only option that is **honest on the day it ships without
changing a single number**. Every one of the eight rules already in the code
belongs to it: the six glycemic ones because glucose is the point, and sodium
and energy because blood pressure and weight are core to diabetes care — the two
rules Option B would have to expel to earn its name, and would be worse for
expelling. Option A cannot be built with the data this app holds, and would be
unavailable for most Moroccan dishes even after a migration. Option D3 is more
rigorous than all of them and would make the product worse.

Option C also converts the fat gap from a hidden defect into a **declared
limitation** — *"does not assess fat quality"* — which is a sentence I can
defend to a reviewer, while "Health Score" applied to a model that scores a
plate of 33 g of fat at 100/100 is one I cannot.

Two caveats I want on the record with that recommendation:

1. **The name change is not a fix.** It makes the label match the arithmetic. It
   does not make the weighting evidence-based, and RU-3's D1–D20 remain open.
   What it does is stop the product making a claim it cannot support while those
   decisions are pending — which is why it is worth doing first.
2. **This is an engineering recommendation, not nutrition sign-off.** I can show
   that "Health Score" is wrong; only a nutrition professional can ratify that
   "Diabetes Meal Suitability" is right, and confirm the eight rules deserve
   their weights.

**Concretely, before Step 22D:** adopt Option C's naming, delete the A–E strip,
tighten the meal-PDF disclaimer, and leave every formula exactly as it is. That
package changes no arithmetic, closes two known-bad contradictions (the 80–84
letter/word overlap and the food-grade illusion), and removes the only claim in
the nutrition surface that I would not be willing to defend.

---

# Challenge round — adversarial review of §8

**This section supersedes the recommendation in §8.** It was written to attack
that recommendation, and the attack succeeded. Still no code, formula or
threshold changed.

Two facts checked during the review changed the analysis, and both cut against
Option C:

- **`high_sodium` already exists as an independent flag** (`advice.ts:108`), shown
  as its own attention point. So removing sodium from the *composite* loses no
  information — it removes an invented weight (−8) and keeps the warning. My §2
  claim that Option B "throws away two rules that genuinely matter" was **wrong**.
  The same is true of energy: the calorie dial is the largest element on the card.
- **The app already computes insulin doses** (`bolus.tsx` → `computeBolus`). Any
  regulatory exposure from a meal score is marginal next to that — but it also
  means this product cannot rely on "we're just a wellness app" as a posture.

---

## A — a true Health Score

**For.** The only option a patient already understands without explanation.
Broadest applicability; comparable to package labels; would let the app grow
beyond diabetes.

**Against.** Cannot be built from the data held: no saturated fat anywhere, no
free sugars, no fruit/veg/nuts share. Even after a migration it would be
**unavailable for most Moroccan dishes** — the app's primary market. It imitates
a regulated instrument, which Step 16 already retreated from.

**Hidden assumptions.** (1) That a general nutritional quality judgement is
meaningful per meal at all — the published models judge *foods per 100 g*, not
plates. (2) That "healthy" is a single axis. (3) That the app's category
taxonomy could stand in for a fruit/veg/legume share; it cannot — it cannot even
distinguish spinach from iceberg lettuce.

**Scientific weaknesses.** Any private implementation diverges from the
regulated one and is then wrong in a way users cannot detect.

**Maintenance cost.** Highest. Every upstream revision of the reference model
becomes a migration; every new food source must supply saturated fat or the
score goes dark.

**Scalability.** Poor in this market: the more Moroccan dishes are added — the
product's core value — the more plates score "unavailable".

## B — Glycemic Suitability

**For.** Every input is a standard, disease-relevant quantity the app already
holds. Its **limitation is definitional, not a hole**: nobody expects a glycemic
metric to assess fat quality, so the disclaimer *fits the name* instead of
undermining it. Its boundary is small and stable — GI, GL, carbohydrate, sugar,
fibre — which makes it the easiest of the four to maintain and the hardest to
scope-creep.

**Against.** Requires moving sodium and energy out of the composite, so it is
**not** a zero-change rename; it needs RU-3 sign-off. Says nothing about
cardiovascular risk. Two glycemia-named numbers on one card (this and GL) invite
"which do I act on?".

**Hidden assumptions.** (1) That GI is meaningful for a *mixed plate* — published
GI values are measured on single foods in controlled conditions, and mixed-meal
GI is contested. This assumption is inherited by C too, and it is the deepest
scientific weakness in the whole system. (2) That a carbohydrate-weighted mean of
category-estimated indices approximates a measured plate GI. (3) That per-plate
is the right frame.

**Scientific weaknesses.** The mixed-meal GI problem above; and no published
consensus defines a per-meal composite even from standard glycemic inputs.

**Maintenance cost.** Lowest. Five inputs, all already provenance-tracked.

**Scalability.** Best. Adding foods never breaks it; the metric works wherever GI
or a category estimate exists.

## C — Diabetes Meal Suitability

**For.** All eight current rules fit; ships with no formula change; matches the
product's overall ambition.

**Against — and this is what changed my mind.**

1. **Its name makes a disease-management claim its formula cannot support.**
   "Suitable for managing diabetes" while ignoring fat quality is not a
   footnote: cardiovascular disease is the leading cause of death in this
   population. A disclaimer saying the metric omits it is not a mitigation —
   it is an admission that the metric does not do what its name says.
   **This is the same category of error as "Health Score", just less obvious.**
2. **My argument for it was built on a false premise.** Sodium and energy do not
   have to sit in the composite to be shown; `high_sodium` already exists
   independently and the calorie dial dominates the card. Option B loses no
   information — it loses two invented weights.
3. **Highest regulatory salience of the four.** Naming a disease and asserting
   suitability reads as intended-purpose language. Whether that matters is a
   regulatory advisor's question, not mine — but among these four names it is
   unambiguously the most exposed.
4. **Permanent scope-creep pressure.** Once the name says "diabetes", every
   diabetes-relevant factor has a claim on the formula: saturated fat, alcohol,
   meal timing, prior glucose, IOB, activity — the app holds all of them
   elsewhere. Each addition needs specialist sign-off. C is an open-ended
   commitment; B is a closed one.
5. **"Zero change today" is a cost argument, not a correctness argument** — and
   it was doing most of the work in §8. That is exactly the reasoning error I
   was asked to check for.

**Hidden assumptions.** That summing glycemic, blood-pressure and weight factors
into one number is meaningful; that their relative weights (−8 sodium vs −22
sugar) reflect relative importance in diabetes care — nothing supports that.

**Maintenance cost.** High and growing, for the scope reason above.

## D3 — no composite, components only

**For.** The only option with **zero unsupported weighting**. Every figure would
be reference data or a standard classification. Nothing left to defend, no
naming problem, no regulatory claim, no specialist sign-off needed.

**Against.** Loses the glanceable summary. Breaks the menu-scan ranking and the
day badge — *if* the number is deleted rather than made internal.

**The refinement I missed in §8:** the ranking and the badge need the number to
*exist*, not to be *displayed*. Keeping it as an internal sort key while
removing it from the patient-facing surface preserves both features and removes
every unsupported claim. That makes D3 far stronger than I credited.

**Hidden assumption.** That patients will read six component bands. Many will
not; the composite exists because it is the thing people actually look at.

**Maintenance cost.** Lowest of all — nothing to justify.

---

## Comparison, all four

Scored 1 (worst) to 5 (best) *for a medical nutrition application*.

| Criterion | A Health | B Glycemic | C Diabetes | D3 Components |
|---|---|---|---|---|
| 1. Scientific honesty | 2 | 4 | 2 | **5** |
| 2. Clinical usefulness | 2 | 4 | **4** | 3 |
| 3. Patient understanding | **5** | 3 | 4 | 2 |
| 4. Risk of misleading | 1 | 4 | 2 | **5** |
| 5. Future extensibility | 2 | **4** | 3 | 3 |
| 6. Consistency with the app | 2 | **5** | 4 | 3 |
| 7. Regulatory risk (5 = least) | 3 | 4 | 2 | **5** |
| 8. Implementation cost (5 = cheapest) | 1 | 3 | **5** | 2 |
| 9. Long-term maintainability | 1 | **5** | 2 | **5** |
| **Total** | **19** | **36** | **28** | **33** |

C wins exactly one criterion — implementation cost — and it is the one criterion
that should carry the least weight in deciding what a number *means*.

---

## Do I still recommend Option C?

**No.** I withdraw it.

What changed: I verified that `high_sodium` already exists as an independent
flag, which destroyed the argument that Option B would make the product worse.
Without that argument, C's remaining advantage is that it requires no formula
change today — and I was letting implementation convenience decide a scientific
identity question. Worse, C repeats the original sin at a different address:
**"Health Score" claims general health it does not measure; "Diabetes Meal
Suitability" claims disease-management suitability it does not measure**, because
it ignores the dominant cause of death in that disease. B's silence about fat is
definitional; C's is a hole with a disclaimer over it.

**Why the other three are worse than B:**

- **A** cannot be built from the data this app holds, would be unavailable for
  most of its own food catalogue, and imitates a regulated instrument.
- **C** makes the largest claim, has the highest regulatory salience, invites
  unbounded scope creep, and its central advantage was based on a false premise
  I have now checked and corrected.
- **D3** beats B on honesty and maintainability and I take it seriously — but it
  removes the summary patients actually use, and its advantage collapses once B
  is stated honestly. It remains the correct fallback if RU-3 rejects the
  composite entirely.

---

## Final recommendation — what I would personally ship

**Option B — a Glycemic Suitability indicator — with the composite reduced to
its glycemic inputs, the A–E letter removed, and sodium and energy shown as
their own flags.**

Because it is the only option whose **name, formula and limitations agree with
each other**. Its inputs are standard and disease-relevant; its silence about fat
follows from what it claims to be rather than contradicting it; its boundary is
closed, so it will not accumulate unvalidated rules; and it is the most
consistent with a nutrition surface already organised around GI, GL and
carbohydrate.

**Sequencing, because B is not free.** Moving sodium and energy out is a formula
change, so it needs RU-3 (D5 plus a new decision, *"remove sodium's −8 from the
composite"*). Until that is signed:

1. **Remove the A–E letter now.** It needs no sign-off, adds no information,
   touches one screen, and closes two known-bad contradictions.
2. **Do not rename yet.** Renaming to "glycemic" while sodium and energy are
   still inside the formula would create a fresh name/formula mismatch — the
   exact defect being fixed.
3. **In the interim, demote the composite**: lead with the word and the reasons
   (the only genuinely checkable part of the output), keep the number secondary
   and explicitly app-branded, and strengthen the meal-PDF note to say it is
   **not a clinical measure**.
4. **Rename to Glycemic Suitability the moment the formula matches it.**

**One caveat I will not drop.** Every option here inherits an unexamined
assumption: that a **carbohydrate-weighted mean of GI values — many of them
category estimates — describes a mixed plate**. Published GI values are measured
on single foods; mixed-meal GI is contested. That assumption sits underneath B
and C equally, and it is a larger scientific question than the naming. It
belongs in RU-3 as a new decision, and if a specialist rejects it, **D3 becomes
the correct answer** and this recommendation should be revisited.
