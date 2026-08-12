/**
 * LAYOUT DIRECTION — the rule, in one place, with no imports.
 *
 * WHY THIS FILE EXISTS. `applyDirection` in ./index.ts calls
 * `I18nManager.forceRTL(...)` and returns. React Native applies `forceRTL` only
 * at the NEXT NATIVE LAUNCH — the running JS context keeps the direction it
 * started with. The comment above that call already admitted it ("native needs
 * a reload to fully apply"), but nothing acted on it:
 *
 *   · there is no reload to trigger — `expo-updates` is not installed, so
 *     `Updates.reloadAsync()` does not exist in this app;
 *   · neither caller (profile-edit.tsx, welcome.tsx) told the patient anything.
 *
 * So a patient selecting العربية on a phone saw every string turn Arabic while
 * the entire layout stayed left-to-right, with nothing on screen explaining
 * why. On web this never reproduced, because the web branch sets
 * `document.documentElement.dir` live — which is exactly why a web-only review
 * could not find it.
 *
 * The rule below is a pure predicate so it can be unit-tested in a plain node
 * environment, the same reason `plausibility.ts` and `carbProvenance.ts` are
 * import-free leaves. Nothing here decides what to SHOW — index.ts reports the
 * fact and the screens choose the words.
 *
 * WHAT THIS IS NOT. It is not an OTA/reload mechanism. Installing
 * `expo-updates` to call `reloadAsync()` would be a cleaner experience and is a
 * genuine option — but it adds an update channel to a medical app, which is a
 * release-process decision (recorded as B-11 / E-6), not something a bug fix
 * may take on its own. Telling the patient the truth needs no new dependency.
 */

/** Languages this app renders right-to-left. */
export function isRTL(lang: string): boolean {
  return lang === 'ar';
}

/**
 * Does switching to `nextLang` need a native app restart to take visual effect?
 *
 * @param currentlyRTL  what the RUNNING context is doing right now
 *                      (`I18nManager.isRTL` on native).
 * @param nextLang      the language being selected.
 * @param isWeb         web flips direction live via `document.dir`, so it never
 *                      needs a restart.
 *
 * True only when the direction actually CHANGES on a native platform. Switching
 * French → German, or re-selecting the language already active, changes no
 * direction and must not nag.
 */
export function directionRestartRequired(
  currentlyRTL: boolean,
  nextLang: string,
  isWeb: boolean
): boolean {
  if (isWeb) return false;
  return currentlyRTL !== isRTL(nextLang);
}
