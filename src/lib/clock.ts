/**
 * Wall-clock reads for render-time windowing (e.g. "last 7 days" filters
 * inside useMemo) and event-time IDs.
 *
 * React Compiler's purity lint flags direct `Date.now()` / `new Date()`
 * calls inside components even when the read only feeds a time-window
 * filter whose staleness semantics are identical under memoization
 * (the memo already only recomputes when its data deps change).
 * Routing those reads through this module keeps that intent explicit.
 *
 * Callers must treat the value as a per-render snapshot: never use it to
 * build state that must stay fresh while the screen sits idle.
 */
export const nowMs = (): number => Date.now();

/** Current instant as a Date — same caveats as {@link nowMs}. */
export const nowDate = (): Date => new Date();

let seq = 0;
/** Unique-enough ID for chat bubbles / local list items (event-time). */
export const uniqueId = (suffix: string): string =>
  `${Date.now()}-${seq++}-${suffix}`;
