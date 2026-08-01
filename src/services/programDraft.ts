/**
 * One-shot hand-off for the "Mon Programme" setup wizard.
 *
 * WHY THIS EXISTS — privacy, not architecture.
 *
 * The setup screen used to hand its answers to `/program` as ROUTE PARAMS,
 * which on web means the patient's body weight, target weight and dietary
 * avoidances end up in the URL: browser history on a shared computer, the
 * `Referer` header of the next outbound request, and the web server's access
 * log. None of those are places health data should live.
 *
 * The values themselves are unchanged. They are carried in memory instead of in
 * the query string, and the strings are kept in exactly the shape the route
 * params had — so every `Number(x) || fallback` on the consuming side behaves
 * identically. This is a transport change and nothing more.
 *
 * DELIBERATELY NOT PERSISTED. No AsyncStorage, no zustand `persist`. Writing a
 * body weight to disk would be a new copy of health data to protect, and every
 * persisted store here needs account scoping (`accountUserId` / `adoptUser`) to
 * stop a shared phone leaking one account's data to the next. A module-level
 * value avoids both problems: it dies with the JS context.
 */

/** Exactly the fields the route params carried, in their original string form. */
export interface ProgramSetupDraft {
  goal?: string;
  level?: string;
  weight?: string;
  targetWeight?: string;
  rate?: string;
  place?: string;
  trainingDays?: string;
  constraints?: string;
}

let pending: ProgramSetupDraft | null = null;

/** Stage the wizard's answers for the program screen. Overwrites any previous. */
export function setProgramDraft(draft: ProgramSetupDraft): void {
  pending = { ...draft };
}

/**
 * Read the staged answers and clear them — one shot.
 *
 * Returns an empty object when nothing is staged, so the consumer falls back to
 * its own defaults exactly as it did when a route param was absent.
 */
export function consumeProgramDraft(): ProgramSetupDraft {
  const draft = pending;
  pending = null;
  return draft ?? {};
}

/** Discard anything staged, e.g. when the wizard is abandoned. */
export function clearProgramDraft(): void {
  pending = null;
}

/** Whether answers are currently staged. Does not consume them. */
export function hasProgramDraft(): boolean {
  return pending !== null;
}
