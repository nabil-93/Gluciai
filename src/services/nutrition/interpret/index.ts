/**
 * INTERPRETATION — the only import path a screen may use to turn a nutrition
 * number into a meaning.
 *
 * The rule this module exists to enforce: **no screen computes an
 * interpretation; every screen renders one.** Before this, 47 sites across the
 * app independently decided what a GI, a load, a score, an hour or a gram total
 * meant, and 33 of them were copies (docs/ARCHITECTURE-INTERPRETATION-AUDIT.md).
 *
 * DELIVERED — Phases 1–3, all behaviour-preserving:
 *
 *   `glycemic`  GI bands, the tone palette, the assumed-GI fallback, both load
 *               bandings.                                            (§1 §2)
 *   `quality`   one import path for the score, the letter, the evidence gate
 *               and the badges.                                      (§3 §8)
 *   `format`    one assembly for a carbohydrate figure.              (§6)
 *
 * BLOCKED — each needs a decision before it can be written:
 *
 *   `timing`    one hour→meal map. Six exist. Phase 4 — blocked on the
 *               16:00–18:00 gap in `bolusEngine.guessMealTime`, which is
 *               clinical.                                            (§4)
 *   `targets`   `programEngine` promoted out of "Mon Programme" so every screen
 *               reads one calorie and carbohydrate target. Phase 7 — blocked on
 *               RU-3: what a diabetic carb target MEANS.              (§5 §6)
 *   `hydration` the ring's semantics and the reminder condition, out of JSX.
 *               Phase 8.                                              (§7)
 *
 * Adding a re-export here is not a licence to add a rule. Interpretations live
 * in the leaf modules; this file only points at them.
 */

export * from './format';
export * from './glycemic';
export * from './quality';
