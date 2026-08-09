# RU-6 — reporting and aggregation decisions

**Status: register only. Nothing here is answered, and no code was changed to
produce this document.**

RU-6 has been cited as the owning reviewer for several findings since Step 10,
but no register existed — so those findings were blocked on a question nobody
had written down. This file writes them down. It does not answer them.

**Who should answer:** whoever owns how this product reports to a clinician —
in practice a diabetologist or a clinical-data reviewer, not engineering. Each
question below changes a number a doctor reads, which is why engineering has
deliberately left every one of them alone.

---

## R1 — the "per day" denominator (P9-005)

**Today:** `avgCarbsPerDay`, `avgSugarPerDay` and `avgInsulinPerDay` divide by
**days that have data**, not by the length of the window.

**Why it matters.** A patient who logged three meals in one day of a seven-day
window is reported at that day's average, as though it were typical. Dividing
by the window instead reports a lower figure for a patient who logged on fewer
days — which is either the honest answer or an unfair one, depending on what
the report is for.

| Option | What it changes |
|---|---|
| **A — keep days-with-data** | Nothing changes. The figure means "on the days you logged". Sparse logging reads as normal intake |
| **B — divide by window length** | Every per-day average falls for sparse loggers. The figure means "per day of the period", and under-logging becomes visible |
| **C — keep A, add a caption naming the denominator** | No number moves; the reader is told which of the two they are looking at |

**Blocks:** P9-005, and the honesty of every "/ jour" figure in the exported
PDF.

**Engineering will not decide it** because A and B report different things about
adherence, and which one a clinician should see is a reporting-policy judgement.

---

## R2 — how a partial day is charted (P9-001)

**Today:** the day-by-day chart stops before today, so today's readings, carbs
and insulin appear in the printed totals but not in the chart beside them. The
two disagree on the same page.

| Option | What it changes |
|---|---|
| **A — add today as a partial bar** | Chart and totals agree. Today's bar is not comparable to a full day |
| **B — exclude today from BOTH** | They agree, and the report describes only complete days. Today's data is absent from a report the patient may have opened to discuss today |
| **C — keep the chart as is, caption the divergence** | Nothing moves; the reader is told why |

**Blocks:** P9-001.

**Engineering will not decide it** because A silently invites comparison
between a partial bar and full ones.

---

## R3 — NUTR-A8's remaining policy half

`sugarHeavy` now compares one meal with itself (fixed). What was never decided
is whether the carbohydrate used for the ratio **must have come from that meal**
at all, and what should happen when the patient has edited it. The 0.4 cut-off
is RU-3's, not RU-6's.

**Blocks:** the residual half of NUTR-A8.

---

## R4 — NUTR-C2's confirmation gate

A carbohydrate seeded into the bolus field from a meal or a programme is
labelled with its origin (Step 18) but still reaches the engine **without any
acknowledgement**. Whether a seeded dose input must be explicitly confirmed is
a safety-workflow decision shared with RU-11.

**Blocks:** NUTR-C2 item 2.

---

## What is NOT blocked on RU-6

P9-002 (window upper bound) and P9-004 (non-finite readings) were data-integrity
defects with no policy content and were fixed in Step 23. Neither introduced a
threshold.
