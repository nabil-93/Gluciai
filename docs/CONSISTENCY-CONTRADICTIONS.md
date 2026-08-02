# Cross-screen contradiction report

**Read as a diabetic patient opening the app for the first time. No code was
changed to produce this. Nothing here is a proposal — it is a list of places
where two widgets can lead the same patient to opposite conclusions.**

Scope: every surface that shows calories, carbohydrate, glycemic index,
glycemic load, the meal indicator, the A–E strip, recommendations or their
wording — the analysis screen, home, Nutrition, Journal, Day, Timeline,
Programme, Sélection Santé, menu scan, the shared PDF, the weekly report and
the doctor panel.

Severity:

- **S1** — the two readings point to opposite ACTIONS, or a clinician sees a
  different fact than the patient.
- **S2** — the two readings point to opposite JUDGEMENTS of the same plate or
  the same day.
- **S3** — the same thing is named or worded two different ways.
- **S4** — latent: correct today, one refactor from being wrong.

---

## S1 — opposite actions, or patient and doctor see different facts

### S1-1 · The meals the app refuses to rate are the ones the doctor sees scored 100/100

The app withholds a verdict when a plate has no energy or an unknown
carbohydrate: the ring shows `—` and "Non évalué"
([scan-result.tsx:1218](../src/app/scan-result.tsx#L1218)), the home card shows
`—` ([LastMealCard.tsx:226](../src/components/LastMealCard.tsx#L226)), and the
day badge excludes it
([dayScore.ts:32](../src/components/journal/dayScore.ts#L32)).

`scoreMeal` starts at 100 and subtracts, so those same plates **store
`meal_score: 100`**. The doctor panel prints the stored value with no gate:

- `public/panel-x7k42m/app.js:1084` → `<span class="badge green">100/100</span>`

**Opposite conclusions.** Patient screen: *"Aucun aliment n'a pu être identifié
— l'app n'a rien sur quoi juger ce repas."* Doctor dashboard, same row: a green
100/100 badge, the best score in the table. The footnote under the table says
the score is not clinical; it does not say this particular one was computed
from placeholder zeros.

### S1-2 · A glycemic load of 50 printed under a glycemic index of 0

`glycemic_load_value` substitutes **GI 55** when no index is known
([engine.ts:665](../src/services/nutrition/engine.ts#L665),
[scan-result.tsx:635](../src/app/scan-result.tsx#L635)). On screen the GI card
is hidden when `gi === 0` ([scan-result.tsx:1281](../src/app/scan-result.tsx#L1281)) —
but two other surfaces are **not** gated:

- The amber reconciliation line inside the calories card
  ([scan-result.tsx:1268](../src/app/scan-result.tsx#L1268)) prints *"la charge
  glycémique est élevée ici (50)"* on a screen showing no glycemic index at all.
- The shared PDF prints both rows unconditionally
  ([scan-result.tsx:833–836](../src/app/scan-result.tsx#L833)):
  `Index glycémique : 0` and `Charge glycémique : 50 · Élevé`.

GL = GI × carbs / 100. A GI of 0 makes a GL of 50 **arithmetically impossible**.
A doctor reading that PDF sees a contradiction the app never explains, and the
assumed 55 is nowhere on the page.

### S1-3 · A GI of 66–69 is "Modéré" and "Élevé" on the same screen

Six surfaces, three different cut-offs for the same number:

| Surface | "high" starts at | What the patient is told |
|---|---|---|
| GI meter / chip ([advice.ts:51](../src/services/nutrition/advice.ts#L51)) | **70** | "Modéré · impact moyen sur la glycémie" |
| Engine warning ([engine.ts:559](../src/services/nutrition/engine.ts#L559)) | **65** | "Index glycémique élevé — **mesurez votre glycémie 2 h après le repas**" |
| Indicator penalty ([mealScore.ts:104](../src/services/nutrition/mealScore.ts#L104)) | **70** | −10 only (the moderate charge) |
| AI chat ([ai.ts:713](../src/services/ai.ts#L713)) | **65** | "Son index glycémique est **ÉLEVÉ**… portion réduite conseillée" |
| Home insight ([insights.ts:79](../src/services/insights.ts#L79)) | **65** | "a un index glycémique élevé — c'est le bon moment pour mesurer" |
| Weekly report ([weeklyReport.ts:88](../src/services/weeklyReport.ts#L88)) | **65** | counted as a high-GI meal |

At GI 67 the analysis screen shows a green-amber meter reading **Modéré** with
the copy *"impact moyen…"*, and one card below, an amber warning telling the
patient to **measure their glucose in two hours**. Relax vs test: opposite
actions, three centimetres apart.

### S1-4 · The home ring tells a diabetic they are *under* their carbohydrate target

`zoneForGoal` paints the day blue below 60 % of a 250 g goal
([index.tsx:854](../src/app/(tabs)/index.tsx#L854), `CARB_GOAL` at
[index.tsx:86](../src/app/(tabs)/index.tsx#L86)):

> **Apport bas** — *"Vos glucides sont en dessous de l'objectif du jour."*

That fires at any day under **150 g**. Meanwhile every meal card penalises
carbohydrate from 60 g and calls 80 g+ *"Charge glucidique très élevée"*
([mealScore.ts:118](../src/services/nutrition/mealScore.ts#L118)).

A patient who ate 140 g of carbohydrate across the day — a deliberately
carbohydrate-controlled day — is told by the home screen that they are **below
target**, i.e. that they should eat more carbohydrate, while each of the meals
that produced it was marked down. The blue zone is also computed from the raw
sum, so a day whose carbohydrate is only a floor ("≥ 140 g") is zoned as if 140
were the total.

### S1-5 · Reaching 250 g of carbohydrate is celebrated as "Objectif atteint"

The Nutrition page fills a green ring with a leaf and the caption **"Objectif
atteint"** as the day's carbohydrate approaches 250 g
([nutrition.tsx:479](../src/app/nutrition.tsx#L479)), and the day-picker legend
marks days in green as *"Dans l'objectif"* and orange only once **over**
([nutrition.tsx:685](../src/app/nutrition.tsx#L685)).

So for a type-1 or type-2 patient the app frames *maximum carbohydrate intake*
as an achievement to complete, on the same screen whose AI coach card may be
saying the opposite. Nothing on the ring says the 250 g is a ceiling rather
than a target.

### S1-6 · The same meal is filed under two different meal moments

A meal with **no `meal_type`** (legacy scans, and every AI-chat meal where the
model did not state one — [aiLogger.ts:341](../src/services/aiLogger.ts#L341)):

- Home classifies it **by the clock** → 20:30 becomes *Dîner*
  ([index.tsx:133](../src/app/(tabs)/index.tsx#L133))
- Nutrition files it under **Collation** unconditionally
  ([nutrition.tsx:333](../src/app/nutrition.tsx#L333))
- The peek window labels it **Collation** too
  ([MealPeekModal.tsx:61](../src/components/MealPeekModal.tsx#L61))

Same row, same evening: "Dîner" on one screen, "Collation" on the next. This is
the same failure class as the dinner/snack bug already fixed on home — fixed on
one side only.

### S1-7 · "≥" stops at the screens a clinician does not read

The floor-vs-total discipline is honoured on the analysis screen, Nutrition,
home, the peek window, the last-meal card and the bolus field. It is **not**
applied on:

| Surface | Line | What it prints |
|---|---|---|
| Day view | [day.tsx:185](../src/app/day.tsx#L185) | `62 g` |
| Journal | [journal.tsx:139](../src/app/(tabs)/journal.tsx#L139) | `62 g glucides` |
| Programme day | [program-day.tsx:254](../src/app/program-day.tsx#L254) | `62 g` |
| Doctor PDF | [report.tsx:102](../src/app/report.tsx#L102) | raw `carbohydrates` |
| Weekly report | [weeklyReport.ts:82](../src/services/weeklyReport.ts#L82) | summed raw |
| Doctor panel | `panel-x7k42m/app.js:1084` | `<b>62 g</b>` |

The patient sees "≥ 62 g — ce total est un minimum". The doctor sees "62 g".
The minimum becomes a total on exactly the surfaces used for a clinical
decision.

### S1-8 · A meal typed into the chat gets an invented glycemic index of 50

[aiLogger.ts:340](../src/services/aiLogger.ts#L340) and
[aiLogger.ts:541](../src/services/aiLogger.ts#L541) default `glycemic_index` to
**50** when the model states none; [program.ts:302](../src/services/program.ts#L302)
does the same for programme meals.

A GI of 50 is `low` under `giBand`, so the plate renders a **green "Bas" chip**
and a glycemic load computed from a number nobody measured — with no "estimé"
marker, because `glycemic_index_estimated` is only set by the engine's own
category fallback ([engine.ts:525](../src/services/nutrition/engine.ts#L525)).

A meal the patient *described* therefore looks better characterised than one
they photographed. The app's whole unknown-vs-zero contract is bypassed for the
one nutrient it is least able to guess.

---

## S2 — opposite judgements of the same plate or the same day

### S2-1 · The reconciliation sentence can quote a compliment as its own evidence

The amber line added to stop the score contradicting the load reads:

> *"Ce repère ne pèse pas la charge glycémique, et elle est élevée ici ({{gl}}) : {{why}}."*

`why` is `quality.reasons[0]` ([scan-result.tsx:1270](../src/app/scan-result.tsx#L1270)),
and `reasons` is `[...penalties, ...bonuses]` — penalties first, **but a plate
can have none**. 55 g of carbohydrate at GI 70 is a GL of 38 (high) with no
rule fired, so the sentence renders as:

> *"…et elle est élevée ici (39) : **Riche en fibres (6 g)**."*

and on a plate where nothing at all fired
([mealScore.ts:168](../src/services/nutrition/mealScore.ts#L168)):

> *"…et elle est élevée ici (39) : **Aucun point d'attention sur les critères suivis**."*

A warning whose stated reason is a compliment, or an explicit statement that
there is nothing to flag. The mitigation contradicts itself.

### S2-2 · The letter A and the word "Bon" on the same meal

`mealGrade` awards **A from 80** ([mealScore.ts:60](../src/services/nutrition/mealScore.ts#L60)),
`scoreMeal` awards **"Excellent" from 85** ([mealScore.ts:149](../src/services/nutrition/mealScore.ts#L149)).

At 80–84 the strip under the photo raises the **top letter of the scale** while
the ring six centimetres below says **"Bon"**. Two verdicts, one plate. Known
as D10 in RU-3, still live and still visible on every meal in that band.

### S2-3 · The calorie chip is personalised, the calorie penalty is flat

The dial and its chip are scaled to 40 % of the patient's computed daily goal
([scan-result.tsx:208–220](../src/app/scan-result.tsx#L208)). The indicator
penalises energy only above a fixed **800 kcal**
([mealScore.ts:140](../src/services/nutrition/mealScore.ts#L140)).

- 736 kcal, goal 2000 → the chip reads **92 %, "Très élevé", red** — and the
  indicator charges **nothing**.
- 900 kcal, goal 3000 → the chip reads **75 %, "Élevé"** — and the indicator
  charges the full penalty.

The louder, redder widget is the one with no effect on the verdict; the patient
has no way to know which one to believe.

### S2-4 · The home card compliments a meal the analysis screen flags

`buildHighlights` emits positives first, then attention points
([advice.ts:88–111](../src/services/nutrition/advice.ts#L88)), and the home card
takes **`.slice(0, 2)`** ([LastMealCard.tsx:131](../src/components/LastMealCard.tsx#L131)).

A plate with `high_protein` + `high_fiber` + `high_glycemic_load` shows:

> *Riche en protéines · Riche en fibres*

The load badge is truncated off the end. The home screen praises the meal; open
it and the analysis screen marks its glycemic load red.

### S2-5 · Three different daily allowances for the same patient

| Nutrient | Analysis screen ([scan-result.tsx:680](../src/app/scan-result.tsx#L680)) | Nutrition page ([nutrition.tsx:51](../src/app/nutrition.tsx#L51)) | Sélection Santé ([healthy-food.tsx:190](../src/app/healthy-food.tsx#L190)) |
|---|---|---|---|
| Calories | Mifflin-St Jeor × 1.45 (personalised) | flat **2000** | flat **2000** |
| Carbohydrate | goal × 50 % ÷ 4 | flat **250 g** | flat **250 g** |
| Protein | goal × 25 % ÷ 4 → **125 g** at 2000 | **90 g** | **100 g** |
| Fat | goal × 25 % ÷ 9 → **56 g** at 2000 | **65 g** | **70 g** |
| Fibre | not shown | **30 g** | **30 g** |

For a patient whose computed goal is 2700 kcal, the analysis screen's
*"Il vous reste"* offers **337 g** of carbohydrate for the day while the
Nutrition page's *"g restants"* counts down from **250 g**. Two screens, same
day, two different remaining figures — and the patient is told both are theirs.

### S2-6 · The day badge reuses the meal verdict words for a different quantity

`dayScore` returns `0.6 × time-in-range + 0.4 × meal average`, or **pure TIR**
when no meal is rated, or **pure meal average** when there are no readings
([dayScore.ts:37–39](../src/components/journal/dayScore.ts#L37)) — and then
labels the result with the meal indicator's own vocabulary
([dayScore.ts:64](../src/components/journal/dayScore.ts#L64)).

So a day badge reading **"Excellent"** can mean *100 % of readings in range and
nothing eaten was rated at all*. The patient reads it as a verdict on how they
ate. Its bands (85/70/50) also differ from the A–E boundaries (80/65/50/35)
sharing the same colours.

### S2-7 · "Meilleur choix" is awarded by a score that ignores the glycemic load

Menu scan sorts dishes by `scoreMeal` and crowns the first
([menu-scan.tsx:66–88](../src/app/menu-scan.tsx#L66)). The carbohydrate penalty
caps at −15, so the dish with the **largest** carbohydrate load on the menu can
take the badge — and saving it opens an analysis screen that marks its glycemic
load red. The badge and the report disagree about the same dish.

### S2-8 · The doctor panel's colour bands are not the app's

| Score | App word / colour | A–E letter | Panel badge |
|---|---|---|---|
| 82 | Bon · green | **A** | green |
| 60 | Modéré · amber | C | amber |
| **48** | **Faible · orange** | **D** | **amber** |
| 40 | Faible · orange | D | red |

`panel-x7k42m/app.js:1084` uses 70 / 45; the app uses 85 / 70 / 50 for words
and 80 / 65 / 50 / 35 for letters. A meal the patient was told is *Faible* can
reach the doctor as amber, i.e. acceptable.

### S2-9 · A meal logged by the AI is scored on one screen and unscored on two others

`aiLogger` never calls `scoreMeal`, so `meal_score` is `undefined`
([aiLogger.ts:531–546](../src/services/aiLogger.ts#L531)). But `LastMealCard`
**recomputes the score live** from the stored macros
([LastMealCard.tsx:110](../src/components/LastMealCard.tsx#L110)).

Result for one meal typed into the chat: a full verdict on the home card, a
dash in the doctor panel, and no contribution to the day badge.

### S2-10 · The hydration ring reads as hydration status

The ring shows what the **food** contributed, as a percentage of a whole day's
water goal, under the caption *"de vos besoins en eau"*
([scan-result.tsx:1588](../src/app/scan-result.tsx#L1588)) — and the reminder
*"Pensez à boire plus d'eau !"* is printed **unconditionally**, including at
100 %. A `Drink` also carries a 0.9 water fraction
([micros.ts:200](../src/services/nutrition/micros.ts#L200)), so a sugary drink
raises the blue hydration ring on the same screen where it raises the sugar
warning. The clarifying line exists; the big number and its caption still say
something else first.

---

## S3 — the same thing, named two ways

### S3-1 · Three names for one indicator, on one screen

- the strip under the photo: **"Indice GluciAI"** (`analysis.mealGrade`)
- the ring in the card below: **"Repère GluciAI"** (`analysis.scoreTitle`)
- the explanatory line between them: **"Le score santé"** (`analysis.giScoreScope`)

Nothing tells the patient these are the same thing except one sentence buried
in `mealGradeNote`.

### S3-2 · "Charge glucidique" directly above "Charge glycémique"

`mealScore.carbsVeryHigh` = *"Charge glucidique très élevée (123 g)"* renders in
the same card as *"Charge glycémique · 50 · Élevé"*. One letter apart, two
different quantities, both described as "très élevée / élevée", both in grams-
adjacent units. There is no chance a patient distinguishes them.

### S3-3 · Two vocabularies for one three-colour scale

The GI meter reads **Bas / Modéré / Élevé** (`analysis.giLow…`), the GL tag
reads **Bas / Moyen / Élevé** (`result.low/medium/high`,
[scan-result.tsx:1301](../src/app/scan-result.tsx#L1301)). Same colours, same
three-step logic, two different middle words.

### S3-4 · Sugar thresholds that do not nest

| Scope | Fires at | Source |
|---|---|---|
| One meal | **30 g** | [mealScore.ts:112](../src/services/nutrition/mealScore.ts#L112), `warn:sugar_high`, `high_sugar` badge |
| One day | **50 g** | [insights.ts:97](../src/services/insights.ts#L97) |
| One week | **150 g** ≈ 21 g/day | [recommendations.ts:59](../src/services/recommendations.ts#L59) |

A patient at 45 g/day gets a weekly coaching card telling them their sugar is
high and a daily insight that stays silent. One 31 g meal warns; a 45 g day
does not.

### S3-5 · Sélection Santé dishes carry no GluciAI indicator at all

[healthy-food.tsx](../src/app/healthy-food.tsx) shows a GI badge, a GI meter and
six rings against a third reference set — but **no score and no A–E letter**.
The dishes the app itself calls "healthy" are the only ones the patient cannot
compare on the app's own scale, while any plate they photograph gets a letter.

---

## S4 — latent

### S4-1 · A hardcoded compliment one refactor from being reachable

`analysis.adviceGood` = *"Excellent repas ! Bonne source de protéines et de
glucides complexes. Ajoutez plus de légumes verts…"* is rendered when
`quality.reasons` is empty ([scan-result.tsx:700](../src/app/scan-result.tsx#L700)).
It is unreachable today only because `scoreMeal` always pushes at least
`mealScore.balanced`. It is a fixed sentence about protein and complex
carbohydrate, printed regardless of the plate.

### S4-2 · The per-meal calorie scale does not close over a day

`mealCalorieScale` = 40 % of the day *"pour un repas complet"*
([scan-result.tsx:208](../src/app/scan-result.tsx#L208)), while the app files
meals into **four** slots. Three main meals at "100 % of one meal" is 120 % of
the day, and the app never says so.

### S4-3 · The Mifflin-St Jeor goal is presented as "vos calories quotidiennes"

The 1.45 activity multiplier, the assumed age of 30 and the flat 2000 kcal
fallback are all disclosed in the footnote
([scan-result.tsx:1539](../src/app/scan-result.tsx#L1539)) — but the ring's own
caption still reads *"de vos calories quotidiennes"*, and it is the caption the
patient reads.

---

## Summary

| Sev | Count | Common root |
|---|---|---|
| S1 | 8 | a rule enforced on the patient's screens but not on the persisted value, the PDF, the weekly report or the doctor panel |
| S2 | 10 | two widgets computing the same judgement from different inputs — personalised vs flat, capped vs uncapped, index vs load |
| S3 | 5 | one concept, several names and several thresholds |
| S4 | 3 | disclosed in a footnote, contradicted by the headline |

**The single largest cluster** is not the scoring formula: it is that the
provenance and evidence rules built in Steps 10, 18, 22A and 22B are enforced
on the four screens the patient looks at and on none of the six surfaces a
clinician looks at (Day, Journal, Programme day, the doctor PDF, the weekly
report, the doctor panel). Eight of the S1 findings are that same gap.

The second cluster is that **the indicator and the glycemic load are computed
from different inputs and displayed side by side**, and every mitigation so far
has been a sentence explaining the disagreement rather than a removal of it —
including one sentence (S2-1) that can quote a compliment as the reason for a
warning.
