# RU-2 — glucose plausibility bounds

**Status: register only. No bound is proposed, and no code was changed to
produce this document.**

RU-2 has been cited as the owning reviewer since the early audit, but no
register existed. This file states the question precisely so a specialist can
answer it. **It deliberately contains no numbers**, because choosing them is the
decision itself.

**Who should answer:** a diabetologist. Every option below decides what the app
does with a reading that may be real.

---

## The question

**Is there a glucose value beyond which this app should refuse to treat a
reading as real — and if so, what should it do with it?**

## What the app does today

Two different things, and they do not agree with each other:

| Path | Behaviour |
|---|---|
| **The AI logger** (spoken/chat readings) | Rejects a value outside its accepted band before it is ever stored |
| **Manual entry** (`log-glucose`) | Since P7-005, refuses a typed value outside the plausible **mg/dL** band — but that guard exists to catch a **unit** mistake (a mmol/L reading typed into a mg/dL field), **not** to judge physiological plausibility |
| **The report builder** | Since P9-004, excludes values that are **not finite numbers**. An implausible but finite reading is still counted, deliberately — that exclusion is data integrity, not plausibility |
| **The dose engine** | `readGlucose` rejects a negative or non-finite reading. It applies **no upper bound** |

So the app currently has a *unit* guard and a *data-integrity* guard, and **no
physiological guard anywhere**. That gap is what this register is about.

## Why engineering has not closed it

Any bound is a clinical claim. A reading of 900 mg/dL is rare but not
impossible; refusing it could discard a genuine emergency, and accepting it lets
a typo drive a correction dose and every statistic in the doctor's report. Both
failure modes are harmful, and choosing between them is not an engineering
judgement. **No number will be invented here.**

## Options

| Option | What it changes |
|---|---|
| **A — no bound (today)** | Any finite reading is stored, charted, averaged and correctable-from. A typo propagates into the dose path and the PDF |
| **B — reject outside a physiological range** | The app refuses the reading outright. A genuine extreme value cannot be recorded, which may matter most in exactly the emergency it would describe |
| **C — accept but flag** | The value is stored and shown with a warning, excluded from averages, and **not** offered as a dose input. Nothing is discarded and nothing is silently trusted |
| **D — accept but require confirmation** | The patient is asked "did you really mean 900?" before it is stored. Catches typos without discarding real data |

Each needs its own answer for the **lower** bound as well, where the hypo guard
already acts on the value.

## What each option must also decide

1. Does the bound apply at **entry**, at **storage**, at **display**, or at the
   **dose engine** — and must all four agree?
2. Does a reading that fails the bound still count in the **doctor's report**?
3. Does it still trigger the **hypo guard**?
4. What happens to readings **already stored** that would fail a new bound?
   (The project's standing rule is that history is never rewritten.)
5. Do the bounds differ by **unit** (mg/dL vs mmol/L)?

## Blocks

- **P9-004's remaining half** — non-finite readings are excluded; implausible
  finite ones are not.
- Any plausibility claim on the glucose entry surfaces beyond the existing
  unit guard.
- The completeness of the P7-005 story: that guard catches a *unit* error, and
  a patient who genuinely types 900 mg/dL is still unprotected.

## What is NOT blocked on RU-2

The P7-005 unit guard (a data-honesty rule about which unit a number is in) and
P9-004's non-finite exclusion (a number that is not a number is not a reading)
are both settled and require no clinical input.
